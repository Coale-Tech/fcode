import { join } from "node:path";
import {
  ErrorCodes as SharedErrorCodes,
  isActiveInProject,
  isCommandShellCatalog,
  imageGenerationBindings,
  isImageGenerationModel,
  normalizeMode,
  resolveBindingContextWindow,
  trustedExtensionAgentKeyFromProviderId,
  type CommandShellCatalog,
  type McpServerRecord,
  type ModelBinding,
  type Mode,
  type Risk,
  type SessionThinkingLevel,
  type UserSkillRecord,
} from "@pi-desktop/shared";
import {
  capabilitiesFromModelConfig,
  clampThinkingLevel,
  loadCustomSystemPrompt,
  loadInstructionChain,
  modelConfigWithBinding,
  optionalProviderHeaders,
  visionFromModelConfig,
} from "@pi-desktop/agent-runtime";
import { builtinSkills } from "../builtin-skills";
import { OAUTH_AUTH_KIND, type VendorOAuth } from "../oauth";
import {
  catalogModelConfigFor,
  type ModelsDevCatalog,
} from "../models-dev-catalog";
import type { HostProcess } from "../host-process";
import type { Logger } from "../logger";
import type { PluginRuntime } from "../plugin-runtime";
import type { UserMcpRuntime } from "../user-mcp";
import { sidecarForSession, type RuntimeState } from "./context";
import type { RuntimeProvider } from "./provider-catalog";

const ErrorCodes = {
  ...SharedErrorCodes,
  COMMAND_SHELL_INVALID: "COMMAND_SHELL_INVALID",
  SHELL_NOT_FOUND: "SHELL_NOT_FOUND",
  PLAN_EXECUTION_INTERRUPTED: "PLAN_EXECUTION_INTERRUPTED",
  PLAN_PERMISSION_MODE_REQUIRED: "PLAN_PERMISSION_MODE_REQUIRED",
} as const;

// omp launch path (E2): omp resolves its own models and credentials from its
// own config, so a PI-native provider is only required for the auxiliary
// prompt-enhance/title-summarize helpers. A real agent turn must still start
// when no PI provider is configured yet, has no secret, or has no model
// selected — swap in a placeholder instead of rejecting the whole turn.
const OMP_LAUNCH_PROVIDER: RuntimeProvider = { id: "omp", name: "omp", authKind: "none" };
const OMP_LAUNCH_MODEL_ID = "omp";
function isLaunchAdmissionError(error: unknown): boolean {
  const code = (error as { errorCode?: string } | undefined)?.errorCode;
  return code === ErrorCodes.MODEL_NOT_CONFIGURED || code === ErrorCodes.PROVIDER_SECRET_MISSING;
}

export type SessionLaunchRuntimeDependencies = {
  runtimeState: RuntimeState;
  logger: Logger;
  userMcp: UserMcpRuntime;
  plugins: PluginRuntime;
  sessionProjects: Map<string, string | null>;
  dataDir: string;
  vendorOAuth: VendorOAuth;
  modelsDevCatalog: ModelsDevCatalog;
  getWorkspacePath: () => string | null;
  pluginActiveInProject: (
    pluginId: string,
    projectPath: string | null | undefined,
  ) => boolean;
  bindingForModel: (
    provider: Pick<RuntimeProvider, "models">,
    modelId: string,
  ) => ModelBinding | undefined;
  normalizeThinkingLevel: (value: unknown) => SessionThinkingLevel;
};

export function createSessionLaunchRuntime({
  runtimeState,
  logger,
  userMcp,
  plugins,
  sessionProjects,
  dataDir,
  vendorOAuth,
  modelsDevCatalog,
  getWorkspacePath,
  pluginActiveInProject,
  bindingForModel,
  normalizeThinkingLevel,
}: SessionLaunchRuntimeDependencies) {
  const isHostUnavailable = (error: unknown): boolean =>
    (error as { errorCode?: string } | null | undefined)?.errorCode ===
    ErrorCodes.HOST_UNAVAILABLE;
  async function refreshUserMcp(
    projectPath: string | null | undefined = getWorkspacePath(),
  ): Promise<McpServerRecord[]> {
    // A dead transport is expected during shutdown and between supervised
    // restarts, and it rejects every call — warning about it would file the
    // routine case under the same log line as a registry that cannot be read.
    // The guard skips the calls that have not started; the catch covers the ones
    // already in flight when the transport closed.
    if (!runtimeState.host?.isAvailable()) return [];
    try {
      const result = await runtimeState.host!.call<{ servers: McpServerRecord[] }>("mcp.active", {
        projectPath: projectPath ?? null,
      });
      const servers = result.servers ?? [];
      userMcp.setRecords(servers);
      return servers;
    } catch (error) {
      if (!isHostUnavailable(error)) {
        logger.app("plugin", "warn", "mcp active list failed", { data: String(error) });
      }
      return [];
    }
  }

  /** The user's own skills, filtered to the ones a session on this project sees. */
  async function activeUserSkills(
    projectPath: string | undefined,
  ): Promise<UserSkillRecord[]> {
    if (!runtimeState.host?.isAvailable()) return [];
    try {
      const result = await runtimeState.host!.call<{ skills: UserSkillRecord[] }>("skills.active", {
        projectPath: projectPath ?? null,
      });
      return result.skills ?? [];
    } catch (error) {
      if (!isHostUnavailable(error)) {
        logger.app("plugin", "warn", "skills list failed", { data: String(error) });
      }
      return [];
    }
  }

  /**
   * Load one of the user's own skill documents by id, or `null` if there is no
   * such skill — so the caller can fall through to the plugin catalog.
   *
   * The scope check is repeated here rather than trusted from the catalog: a
   * session can outlive the prompt that listed the skill, and re-scoping a skill
   * mid-session should take effect immediately.
   */
  async function loadUserSkillBody(
    id: string,
    projectPath: string | null,
  ): Promise<{ id: string; name: string; body: string } | null> {
    if (!runtimeState.host || id.includes("/")) return null;
    const result = await runtimeState.host!.call<{
      skill: UserSkillRecord | null;
      body: string | null;
    }>("skills.read", { id, projectPath });
    const skill = result.skill;
    if (!skill || typeof result.body !== "string") return null;
    if (!isActiveInProject(skill, projectPath)) {
      throw new Error(`skill "${id}" is not enabled for this project`);
    }
    return { id: skill.id, name: skill.name, body: result.body };
  }

  async function resolveEffectiveCommandShell(): Promise<CommandShellCatalog> {
    if (!runtimeState.host) throw new Error("host unavailable");
    const catalog = await runtimeState.host!.call<CommandShellCatalog>("commandShells.list");
    if (!isCommandShellCatalog(catalog)) {
      throw Object.assign(new Error("Host returned an invalid command shell catalog"), {
        errorCode: ErrorCodes.COMMAND_SHELL_INVALID,
      });
    }
    if (!catalog.effective || !catalog.effective.available) {
      throw Object.assign(
        new Error("No available command shell is configured for this session"),
        { errorCode: ErrorCodes.SHELL_NOT_FOUND },
      );
    }
    return catalog;
  }

  async function resolveAgentRuntimeLaunch(
    sessionId: string,
    session: any,
    settings: any,
    overrides: {
      mode?: Mode;
      turnId?: string;
      providerId?: string;
      modelId?: string;
      thinkingLevel?: SessionThinkingLevel;
      /**
       * E2: only the real sidecar turn (agentPrompt, agentCompact, plan
       * execution) may fall back to the "omp" placeholder when no PI-native
       * provider is admitted -- the omp bridge resolves its own credentials.
       * promptEnhance, sessionSummarizeTitle and plugin completeOneShot make
       * a direct HTTP call with `launch.sidecarParams.provider`, so handing
       * them the placeholder trades a clean MODEL_NOT_CONFIGURED for an
       * opaque network failure and silently skips promptEnhance's existing
       * pinned-provider-unavailable fallback. Leave this false (default) for
       * every caller except the three that hand off to the sidecar.
       */
      allowOmpFallback?: boolean;
    } = {},
  ) {
    if (!runtimeState.host) throw new Error("host unavailable");
    await modelsDevCatalog.ensureLoaded();
    const commandShell = (await resolveEffectiveCommandShell()).effective!;
    const providers = await runtimeState.host!.call<{ providers: RuntimeProvider[] }>(
      "providers.list",
      { includeDisabled: false },
    );
    const requestedProviderId = overrides.providerId ?? session.providerId;
    const extensionAgentKey = requestedProviderId
      ? trustedExtensionAgentKeyFromProviderId(requestedProviderId)
      : undefined;
    async function admitProviderAndModel(): Promise<{
      provider: RuntimeProvider;
      isVendorAccount: boolean;
      secret: { value?: string };
      modelId: string;
    }> {
      const provider: RuntimeProvider = extensionAgentKey
        ? {
            id: requestedProviderId!,
            name: "Plugin agent",
            modelId: overrides.modelId ?? session.modelId,
            authKind: "none",
            extensionAgentKey,
          }
        : providers.providers.find((item) => item.id === requestedProviderId) ||
          providers.providers.find((item) => item.id === settings.defaultProviderId) ||
          providers.providers.find(
            (item) => item.hasSecret || item.hasOauth || item.authKind === "none",
          ) ||
          providers.providers[0];
      if (!provider) {
        throw Object.assign(new Error("No provider configured"), {
          errorCode: ErrorCodes.MODEL_NOT_CONFIGURED,
        });
      }
      // Plugin-owned agents resolve credentials and transport inside the trusted
      // extension; the host never reads or injects a secret for them.
      const isExtensionAgent = Boolean(extensionAgentKey);
      const isVendorAccount = !isExtensionAgent && provider.authKind === OAUTH_AUTH_KIND;
      const secret = isExtensionAgent || isVendorAccount
        ? { value: undefined }
        : await runtimeState.host!.call<{ value?: string }>("providers.getSecret", {
            id: provider.id,
          });
      if (!secret.value && !isExtensionAgent && !isVendorAccount && provider.authKind !== "none") {
        throw Object.assign(new Error("Provider API key missing"), {
          errorCode: ErrorCodes.PROVIDER_SECRET_MISSING,
        });
      }
      const modelId = isExtensionAgent
        ? overrides.modelId ?? session.modelId
        : (provider.id === requestedProviderId
          ? overrides.modelId ?? session.modelId
          : undefined) ||
        (provider.id === settings.defaultProviderId
          ? settings.defaultModelId
          : undefined) ||
        provider.models?.[0]?.id ||
        provider.defaultModelId;
      if (!modelId) {
        throw Object.assign(new Error("No model selected for provider"), {
          errorCode: ErrorCodes.MODEL_NOT_CONFIGURED,
        });
      }
      return { provider, isVendorAccount, secret, modelId };
    }

    let provider: RuntimeProvider;
    let isVendorAccount: boolean;
    let secret: { value?: string };
    let modelId: string;
    try {
      ({ provider, isVendorAccount, secret, modelId } =
        await admitProviderAndModel());
    } catch (error) {
      if (!isLaunchAdmissionError(error) || !overrides.allowOmpFallback) throw error;
      provider = OMP_LAUNCH_PROVIDER;
      isVendorAccount = false;
      secret = { value: undefined };
      modelId = OMP_LAUNCH_MODEL_ID;
    }
    if (isImageGenerationModel(
      imageGenerationBindings(settings.imageGenerationModels, settings.imageGeneration),
      provider.id,
      modelId,
    )) {
      throw Object.assign(new Error("The image model cannot be used for conversation; select a chat model"), {
        errorCode: ErrorCodes.MODEL_NOT_CONFIGURED,
      });
    }
    // The authenticated collection owns a vendor account's available model IDs
    // and wire endpoint. models.dev owns metadata; one account can span multiple
    // wire APIs and gateway catalogs.
    const vendorBinding = isVendorAccount
      ? await vendorOAuth
          .bindingFor(provider.id, modelId)
          .catch(() => undefined)
      : undefined;
    if (isVendorAccount && !vendorBinding) {
      throw Object.assign(
        new Error(`Vendor account does not offer model "${modelId}"`),
        { errorCode: ErrorCodes.MODEL_NOT_CONFIGURED },
      );
    }
    const storedModel = bindingForModel(provider, modelId);
    const apiStyle = vendorBinding?.apiStyle ?? provider.apiStyle;
    const baseUrl = vendorBinding?.baseUrl ?? provider.baseUrl;
    const catalogModelConfig = vendorBinding?.modelConfig ??
      catalogModelConfigFor(modelsDevCatalog, {
        vendorKey: provider.vendorKey,
        baseUrl,
        apiStyle,
        modelId,
      });
    const resolvedLimits = resolveBindingContextWindow(catalogModelConfig, storedModel);
    const modelConfig = modelConfigWithBinding(
      resolvedLimits.catalogConfig,
      resolvedLimits.binding,
    );
    const thinkingCapabilities = capabilitiesFromModelConfig(modelConfig);
    const thinkingLevel = clampThinkingLevel(
      thinkingCapabilities,
      normalizeThinkingLevel(
        overrides.thinkingLevel ??
          (provider.id === requestedProviderId ? session.thinkingLevel : undefined) ??
          storedModel?.defaultThinkingLevel,
      ),
    );
    const projectPath =
      typeof session.projectPath === "string" && session.projectPath.trim()
        ? session.projectPath.trim()
        : undefined;
    let projectInstructions = await loadInstructionChain(projectPath);
    // pi-compatible SYSTEM.md / APPEND_SYSTEM.md (issue #542): resolved once
    // per launch; a change retires the runtime through the reuse match.
    const customSystemPrompt = await loadCustomSystemPrompt(projectPath);
    let projectMemory: string | undefined;
    if (projectPath) {
      try {
        const result = await runtimeState.host!.call<{
          context?: {
            roots?: Array<{ path?: string }>;
            instructions?: string;
            memory?: { content?: string };
          } | null;
        }>("project.group.context", { path: projectPath });
        const groupRoots = result.context?.roots ?? [];
        const groupRootGuide = groupRoots.length > 1
          ? [
              `Primary root: ${groupRoots[0]?.path ?? projectPath}`,
              ...groupRoots.slice(1).map((root) => `Additional root: ${root.path}`),
              "Use an absolute path when reading or editing an additional root.",
            ].join("\n")
          : "";
        const groupInstructions = result.context?.instructions?.trim();
        if (groupRootGuide || groupInstructions) {
          projectInstructions = {
            entries: [
              ...(projectInstructions?.entries ?? []),
              ...(groupRootGuide
                ? [{ source: "ChatGPT Project folders", content: groupRootGuide }]
                : []),
              ...(groupInstructions
                ? [{ source: "ChatGPT Project instructions", content: groupInstructions }]
                : []),
            ],
          };
        }
        const groupMemory = result.context?.memory?.content?.trim();
        if (groupMemory) projectMemory = groupMemory;
        if (!result.context) {
          const legacy = await runtimeState.host!.call<{
            memory?: { content?: string };
          }>("project.memory.get", { path: projectPath });
          const content = legacy.memory?.content?.trim();
          if (content) projectMemory = content;
        }
      } catch {
        // Project context is best effort; it must never prevent a session launch.
        try {
          const legacy = await runtimeState.host!.call<{
            memory?: { content?: string };
          }>("project.memory.get", { path: projectPath });
          const content = legacy.memory?.content?.trim();
          if (content) projectMemory = content;
        } catch {
          // Legacy memory is also best effort.
        }
      }
    }
    sessionProjects.set(sessionId, projectPath ?? null);
    // Everything below is filtered by activation scope: a plugin, MCP server or
    // skill limited to certain projects must be invisible to a session on any
    // other one — not merely refused when called, since a tool the model can see
    // is a tool it will try.
    const userSkills = await activeUserSkills(projectPath);
    await refreshUserMcp(projectPath);
    const userMcpTools = await userMcp.toolsForProject(projectPath ?? null);
    // Skill catalog (D174): only id/name/description cross to the sidecar; the
    // document body is fetched on demand through the local `Skill` tool. Host
    // skills come first so a plugin's entry reads as a refinement of them, and
    // the user's own skills come last so they win a name clash in the model's
    // reading order.
    const pluginSkills = [
      ...builtinSkills({
        workspacePath: projectPath,
        pluginPaths: plugins.listLoaded().map((loaded) => loaded.path),
      }),
      ...plugins
        .getSkills()
        .filter((skill) => pluginActiveInProject(skill.pluginId, projectPath))
        .map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
        })),
      ...userSkills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
      })),
    ];
    // Bind the vendor-account row this turn may sign requests with: the
    // session's own provider. The sidecar may ask main for request auth, but
    // only for a row named here, and the set is rewritten on every launch.
    sidecarForSession(runtimeState, sessionId)?.setVendorAuthBindings(
      sessionId,
      provider.authKind === OAUTH_AUTH_KIND ? [{ providerId: provider.id }] : [],
    );
    return {
      providerId: provider.id,
      modelId,
      projectPath,
      sidecarParams: {
        sessionId,
        mode: normalizeMode(
          overrides.mode ?? session.mode ?? settings.defaultMode ?? "agent",
        ),
        ...(overrides.turnId ? { turnId: overrides.turnId } : {}),
        thinkingLevel,
        infiniteProviderRetry: settings.infiniteProviderRetry === true,
        commandShell,
        scratchDir: join(dataDir, "scratch", sessionId),
        attachmentsDir: join(dataDir, "attachments"),
        projectPath,
        customSystemPrompt,
        projectInstructions,
        projectMemory,
        provider: {
          id: provider.id,
          name: provider.name,
          vendorKey: provider.vendorKey,
          baseUrl,
          modelId,
          apiKey: secret.value || "",
          authKind: provider.authKind,
          extensionAgentKey: provider.extensionAgentKey,
          apiStyle,
          ...optionalProviderHeaders(provider.headers),
          supportsReasoning: thinkingCapabilities.supportsReasoning,
          supportsVision: visionFromModelConfig(modelConfig),
          supportedThinkingLevels: [...thinkingCapabilities.supportedThinkingLevels],
          ...(modelConfig ? { modelConfig } : {}),
        },
        pluginTools: [
          ...plugins
            .getTools()
            .filter((tool) => pluginActiveInProject(tool.pluginId, projectPath))
            .map((tool) => ({
              name: tool.fullName,
              description: tool.description,
              parameters: tool.schema ?? { type: "object", properties: {} },
              ...(tool.risk === "low" || tool.risk === "medium" || tool.risk === "high"
                ? { risk: tool.risk as Risk }
                : {}),
              // Plan-safe action list is forwarded to host-core so it can
              // admit the tool in Plan/Goal modes (ADR 0211).
              ...(tool.planSafeActions && tool.planSafeActions.length > 0
                ? { planSafeActions: tool.planSafeActions }
                : {}),
            })),
          ...userMcpTools.map((tool) => ({
            name: tool.fullName,
            description: tool.description,
            parameters: tool.schema ?? { type: "object", properties: {} },
          })),
        ],
        // Plugin skills (D174): only the catalog crosses to the sidecar; the
        // document body is fetched on demand through the local `Skill` tool.
        pluginSkills,
        // Trusted extensions enabled for this project (spec 16 §3.2). The set
        // is part of the runtime match, so a toggle retires the runtime.
        trustedExtensions: plugins
          .getAgentExtensions()
          .filter((extension) => pluginActiveInProject(extension.pluginId, projectPath))
          .map((extension) => ({
            id: extension.id,
            entry: extension.entry,
            label: extension.pluginName,
            source: "plugin" as const,
            root: extension.root,
          })),
      },
    };
  }

  return {
    refreshUserMcp,
    activeUserSkills,
    loadUserSkillBody,
    resolveEffectiveCommandShell,
    resolveAgentRuntimeLaunch,
  };
}
