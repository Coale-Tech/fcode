import { isActiveInProject, type ActivationScope } from "@pi-desktop/shared";
import type { HostProcess } from "./host-process";
import { currentWorkspacePath } from "./workspace-path";
import { knownProjectGroups, pluginWorkspaceInfo, refreshProjectGroups } from "./workspace-roots";

export type WorkspaceScopeRuntimeDependencies = {
  pluginScopes: Map<string, ActivationScope>;
  pluginPanels: { broadcast: (event: string, payload: unknown) => void };
  pluginViews: { broadcast: (event: string, payload: unknown) => void };
  plugins: { broadcastEvent: (event: string, args: unknown[]) => void };
  getHost: () => HostProcess | null;
};

/**
 * The plugin-scope cache and workspace-path setter, both keyed off the same
 * `pluginServices` outputs. Split out of `index.ts` to keep it under the CI
 * LOC budget (see `test/ci-budget.test.mjs`).
 */
export function createWorkspaceScopeRuntime({
  pluginScopes,
  pluginPanels,
  pluginViews,
  plugins,
  getHost,
}: WorkspaceScopeRuntimeDependencies) {
  /**
   * Refresh the cached plugin scopes from a `plugins.list` payload.
   *
   * Anything that changes a scope goes through host-core, so every read of
   * the list is also the moment to re-learn them.
   */
  function rememberPluginScopes(list: Array<{ id?: string; scope?: ActivationScope }>): void {
    pluginScopes.clear();
    for (const plugin of list) {
      if (typeof plugin?.id === "string" && plugin.scope) {
        pluginScopes.set(plugin.id, plugin.scope);
      }
    }
  }

  /**
   * Whether a loaded plugin's contributions apply to `projectPath`.
   *
   * `enabled` is already implied — a disabled plugin is never loaded into
   * the runtime — so only the scope is consulted here. A plugin with no
   * cached scope counts as global, which is what every plugin installed
   * before scopes existed was.
   */
  function pluginActiveInProject(pluginId: string, projectPath: string | null | undefined): boolean {
    const scope = pluginScopes.get(pluginId);
    if (!scope) return true;
    return isActiveInProject({ enabled: true, scope }, projectPath);
  }

  /** Push a panel event to detached windows and docked views. */
  function broadcastPluginPanelEvent(event: string, payload: unknown): void {
    pluginPanels.broadcast(event, payload);
    pluginViews.broadcast(event, payload);
  }

  function setCurrentWorkspacePath(path: string | null): void {
    const previous = currentWorkspacePath();
    (globalThis as { __piWorkspacePath?: string | null }).__piWorkspacePath = path;
    if (previous === path) return;
    const payload = pluginWorkspaceInfo(path);
    broadcastPluginPanelEvent("workspace:changed", payload);
    plugins.broadcastEvent("workspace:changed", [payload]);
    // The group snapshot starts cold, so this first push can only carry the bare
    // workspace. Fetch the project's folders once and repeat it, so a plugin that
    // was already open sees them without waiting for the next switch; every later
    // switch finds the snapshot warm and broadcasts exactly once (ADR 0263).
    if (knownProjectGroups() === null) {
      void refreshProjectGroups(getHost()).then((changed) => {
        if (!changed) return;
        const enriched = pluginWorkspaceInfo(currentWorkspacePath());
        broadcastPluginPanelEvent("workspace:changed", enriched);
        plugins.broadcastEvent("workspace:changed", [enriched]);
      });
    }
  }

  return { rememberPluginScopes, pluginActiveInProject, broadcastPluginPanelEvent, setCurrentWorkspacePath };
}
