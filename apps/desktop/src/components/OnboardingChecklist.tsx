import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ToolApprovalMode, ModelInfo } from "@pi-desktop/shared";
import { bindingFromModelInfo } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { Button } from "./ui";
import { IconCheck, IconTerminal } from "./icons";

/**
 * D onboarding wizard (4 fixed steps) — shown on first run until dismissed.
 * Design authority: pages-d/onboarding/fragment.html (step 1) and
 * fragment-last.html (step 4). Steps 2–3 have no approved mock (decision 4):
 * implemented from primitives/tokens; needs design review.
 *
 * Step 1: Connect provider — provider radio + API key input + Verify (real:
 *         calls api.listProviderModels; creates provider on Continue if not yet
 *         added).
 * Step 2: Pick a bench — navigates to Bench page (NEEDS DESIGN REVIEW).
 * Step 3: Permissions mode — real toolApprovalMode select (NEEDS DESIGN REVIEW).
 * Step 4: Ready — done icon + summary chips + Start coding CTA.
 */

const NAMED_ENDPOINT_PRESETS: Record<
  "anthropic" | "gemini" | "openai",
  { vendorKey: string; apiStyle: string; name: string }
> = {
  anthropic: { vendorKey: "anthropic", apiStyle: "anthropic_messages", name: "Anthropic" },
  gemini:    { vendorKey: "google",    apiStyle: "google_gemini",       name: "Google Gemini" },
  openai:    { vendorKey: "openai",    apiStyle: "openai_chat",         name: "OpenAI" },
};

// `bindingFromModelInfo` is imported from @pi-desktop/shared above.

export function OnboardingChecklist() {
  const { t } = useTranslation();
  const onboarding = useAppStore((s) => s.onboarding);
  const workspace = useAppStore((s) => s.workspace);
  const providers = useAppStore((s) => s.providers);
  const setPage = useAppStore((s) => s.setPage);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);

  const [step, setStep] = useState(1); // 1–4
  const [selectedProvider, setSelectedProvider] = useState<"anthropic" | "gemini" | "openai">("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [verifyState, setVerifyState] = useState<
    "idle" | "checking" | "ok" | "no-models" | "error"
  >("idle");
  const [verifiedModelName, setVerifiedModelName] = useState("");
  const [verifiedModel, setVerifiedModel] = useState<ModelInfo | null>(null);
  const [permMode, setPermMode] = useState<ToolApprovalMode>("always-ask");

  if (!onboarding?.showChecklist) return null;

  const dismiss = () => {
    void api
      .dismissOnboarding()
      .catch(() => undefined)
      .finally(() => {
        const cur = useAppStore.getState().onboarding;
        if (cur) useAppStore.setState({ onboarding: { ...cur, showChecklist: false } });
      });
  };

  const providerList: {
    id: "anthropic" | "gemini" | "openai";
    label: string;
    abbr: string;
    desc: string;
  }[] = [
    { id: "anthropic", label: "Anthropic", abbr: "A", desc: "Claude Sonnet — recommended" },
    { id: "gemini",    label: "Google Gemini", abbr: "G", desc: "Gemini 2.5 Pro / Flash" },
    { id: "openai",    label: "OpenAI", abbr: "O", desc: "GPT-4o / o3" },
  ];

  const stepTitles = [
    t("onboarding.step1Title"),
    t("onboarding.step2Title"),
    t("onboarding.step3Title"),
    t("onboarding.step4Title"),
  ];

  const hasProvider = providers.length > 0;
  const isStep1Done = hasProvider || verifyState === "ok";
  const isStep2Done = workspace != null;
  const isStep3Done = permMode !== "always-ask";

  const stepDone = [isStep1Done, isStep2Done, isStep3Done, false];
  const totalSteps = 4;

  const preset = NAMED_ENDPOINT_PRESETS[selectedProvider];
  const providerApiKeyLabel = t("onboarding.providerApiKeyLabel", {
    provider: preset.name,
  });

  const handleVerify = async () => {
    if (!apiKey.trim()) return;
    setVerifyState("checking");
    try {
      const res = await api.listProviderModels({
        apiKey: apiKey.trim(),
        apiStyle: preset.apiStyle,
        source: "refresh",
      });
      const remoteModels = (res.models ?? []).filter(
        () => res.source === "remote",
      );
      if (remoteModels.length === 0) {
        setVerifyState("no-models");
      } else {
        setVerifiedModel(remoteModels[0]!);
        setVerifiedModelName(remoteModels[0]!.modelId);
        setVerifyState("ok");
      }
    } catch {
      setVerifyState("error");
    }
  };

  const handleContinue = async () => {
    if (step === 1 && verifyState === "ok" && !hasProvider) {
      try {
        await api.createProvider({
          name: preset.name,
          vendorKey: preset.vendorKey,
          secretValue: apiKey.trim(),
          models: verifiedModel ? [bindingFromModelInfo(verifiedModel)] : undefined,
        });
      } catch { /* best-effort */ }
    }
    if (step < totalSteps) setStep((s) => s + 1);
  };

  return (
    <div className="ob-wrap home-onboarding-checklist" data-testid="onboarding-checklist">
      <div className="ob-card">

        {/* Card header */}
        <div className="ob-head">
          <div className="ob-logo">
            <div className="ob-logo-mark">
              <IconTerminal size={18} />
            </div>
            <span className="ob-logo-name">Fcode</span>
          </div>
          <p className="ob-headline">{step === 4 ? t("onboarding.allSet") : t("onboarding.wizardHeadline")}</p>
          <p className="ob-sub">{step === 4 ? t("onboarding.readySub") : t("onboarding.wizardSub")}</p>
          <div className="ob-progress">
            {stepTitles.map((_, i) => (
              <div
                key={i}
                className={`ob-prog-seg${i < step - 1 ? " done" : i === step - 1 ? " active" : ""}`}
              />
            ))}
          </div>
        </div>

        {/* Two-column layout */}
        <div className="ob-layout">

          {/* Steps sidebar */}
          <div className="ob-steps-col">
            {stepTitles.map((title, i) => {
              const stepNum = i + 1;
              const isDone = stepDone[i] || stepNum < step;
              const isCurrent = stepNum === step;
              return (
                <div
                  key={stepNum}
                  className={`ob-step-row${isDone ? " is-done" : isCurrent ? " is-current" : ""}`}
                  onClick={() => setStep(stepNum)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") setStep(stepNum); }}
                >
                  <div className={`ob-step-check${isDone ? " is-done" : isCurrent ? " is-current" : ""}`}>
                    {isDone
                      ? <IconCheck size={10} />
                      : <span className="ob-step-num">{stepNum}</span>
                    }
                  </div>
                  {title}
                </div>
              );
            })}
          </div>

          {/* Step content */}
          <div className="ob-content">
            {step === 1 && (
              <>
                <div>
                  <p className="ob-step-title">{t("onboarding.step1Content")}</p>
                  <p className="ob-step-desc">{t("onboarding.step1Desc")}</p>
                </div>

                <div className="ob-provider-list">
                  {providerList.map((p) => (
                    <div
                      key={p.id}
                      className={`ob-provider-row${selectedProvider === p.id ? " selected" : ""}`}
                      onClick={() => { setSelectedProvider(p.id); setVerifyState("idle"); }}
                      role="radio"
                      aria-checked={selectedProvider === p.id}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          setSelectedProvider(p.id);
                          setVerifyState("idle");
                        }
                      }}
                    >
                      <div className="ob-provider-icon">{p.abbr}</div>
                      <div>
                        <div className="ob-provider-name">{p.label}</div>
                        <div className="ob-provider-desc">{p.desc}</div>
                      </div>
                      <div className="ob-radio" />
                    </div>
                  ))}
                </div>

                <div className="ob-key-field">
                  <label className="ob-key-label">{providerApiKeyLabel}</label>
                  <div className="ob-key-row">
                    <input
                      className="ob-key-input"
                      type="password"
                      placeholder={t("onboarding.apiKeyPlaceholder")}
                      value={apiKey}
                      onChange={(e) => { setApiKey(e.target.value); setVerifyState("idle"); }}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={verifyState === "checking" || !apiKey.trim()}
                      onClick={() => { void handleVerify(); }}
                    >
                      {t("onboarding.verify")}
                    </Button>
                  </div>
                  {verifyState === "ok" && (
                    <div className="ob-banner-success">
                      <IconCheck size={12} />
                      {t("onboarding.keyVerifiedModel", { model: verifiedModelName })}
                    </div>
                  )}
                  {verifyState === "no-models" && (
                    <div className="ob-banner-error">
                      {t("onboarding.keyVerifyNoModels")}
                    </div>
                  )}
                  {verifyState === "error" && (
                    <div className="ob-banner-error">
                      {t("onboarding.keyVerifyFailed")}
                    </div>
                  )}
                </div>
              </>
            )}

            {step === 2 && (
              /* NEEDS DESIGN REVIEW — no approved mock for step 2 */
              <div className="ob-derived-step">
                <p className="ob-step-title">{t("onboarding.step2Title")}</p>
                <p className="ob-step-desc">{t("onboarding.step2Desc")}</p>
                <Button
                  variant="secondary"
                  onClick={() => setPage("bench")}
                >
                  {t("onboarding.benchSelect")}
                </Button>
                {workspace && (
                  <div className="ob-banner-success">
                    <IconCheck size={12} />
                    {workspace.name}
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              /* Derived from D.css primitives — no approved mock for step 3. */
              <div className="ob-derived-step">
                <div>
                  <p className="ob-step-title">{t("onboarding.step3Title")}</p>
                  <p className="ob-step-desc">{t("onboarding.step3Desc")}</p>
                </div>
                <div className="ob-perm-options" role="radiogroup" aria-label={t("onboarding.step3Title")}>
                  {(["always-ask", "write", "yolo"] as ToolApprovalMode[]).map((m) => (
                    <div
                      key={m}
                      className={`ob-perm-row${permMode === m ? " selected" : ""}`}
                      role="radio"
                      aria-checked={permMode === m}
                      tabIndex={0}
                      onClick={() => setPermMode(m)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setPermMode(m); }}
                    >
                      <div className="ob-perm-label">
                        {m === "always-ask" ? t("settings.toolApprovalModeAlwaysAsk")
                          : m === "write" ? t("settings.toolApprovalModeWrite")
                          : t("settings.toolApprovalModeYolo")}
                      </div>
                      <div className="ob-radio" aria-hidden />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="ob-done-content">
                <div className="ob-done-icon">
                  <IconCheck size={26} />
                </div>
                <div>
                  <p className="ob-done-title">{t("onboarding.readyToCode")}</p>
                  <p className="ob-done-sub" style={{ marginTop: 6 }}>{t("onboarding.readySub")}</p>
                </div>
                <div className="ob-summary">
                  {providers.length > 0 && (
                    <div className="ob-chip">
                      <IconCheck size={10} />
                      {providers[0]?.name ?? providers[0]?.id}
                    </div>
                  )}
                  {workspace && (
                    <div className="ob-chip">
                      <IconCheck size={10} />
                      {workspace.name}
                    </div>
                  )}
                  <div className="ob-chip">
                    <IconCheck size={10} />
                    {permMode === "always-ask" ? t("settings.toolApprovalModeAlwaysAsk")
                      : permMode === "write" ? t("settings.toolApprovalModeWrite")
                      : t("settings.toolApprovalModeYolo")}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="ob-foot">
          {step < 4 ? (
            <span className="ob-step-counter">{t("onboarding.stepOf", { step, total: totalSteps })}</span>
          ) : null}
          <span className="ob-foot-spacer" />
          {step > 1 ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={step === 1}
              onClick={() => setStep((s) => s - 1)}
            >
              {t("onboarding.back")}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" disabled>
              {t("onboarding.back")}
            </Button>
          )}
          {step === 4 ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => { setSettingsTab("agent"); setPage("settings"); }}>
                {t("onboarding.changeSettings")}
              </Button>
              <Button variant="primary" onClick={() => {
                void api.toolApprovalModeSet(permMode).catch(() => undefined);
                dismiss();
                setPage("chat");
              }}>
                {t("onboarding.startCoding")}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => { void handleContinue(); }}
            >
              {t("onboarding.continue")}
            </Button>
          )}
        </div>

      </div>
    </div>
  );
}
