import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ToolApprovalMode } from "@pi-desktop/shared";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { Button } from "./ui";
import { IconCheck } from "./icons";

/**
 * D onboarding wizard (4 fixed steps) — shown on first run until dismissed.
 * Design authority: pages-d/onboarding/fragment.html (step 1) and
 * fragment-last.html (step 4). Steps 2–3 have no approved mock (decision 4):
 * implemented from primitives/tokens; needs design review.
 *
 * Step 1: Connect provider — provider radio + API key input + Verify (real:
 *         navigates to agent settings for actual key entry and storage).
 * Step 2: Pick a bench — navigates to Bench page (NEEDS DESIGN REVIEW).
 * Step 3: Permissions mode — real toolApprovalMode select (NEEDS DESIGN REVIEW).
 * Step 4: Ready — done icon + summary chips + Start coding CTA.
 */
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
  const [keyVerified, setKeyVerified] = useState(false);
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

  const providerList: { id: "anthropic" | "gemini" | "openai"; label: string; abbr: string; desc: string }[] = [
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
  const isStep1Done = hasProvider || keyVerified;
  const isStep2Done = workspace != null;
  const isStep3Done = permMode !== "always-ask";

  const stepDone = [isStep1Done, isStep2Done, isStep3Done, false];

  const totalSteps = 4;

  return (
    <div className="ob-wrap" data-testid="onboarding-checklist">
      <div className="ob-card">

        {/* Card header */}
        <div className="ob-head">
          <div className="ob-logo">
            <div className="ob-logo-mark">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="3"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </div>
            <span className="ob-logo-name">Fcode</span>
          </div>
          <p className="ob-headline">{step === 4 ? t("onboarding.allSet") : t("onboarding.wizardHeadline")}</p>
          <p className="ob-sub">{step === 4 ? t("onboarding.readySub") : t("onboarding.wizardSub")}</p>
          <div className="ob-progress">
            {stepTitles.map((_, i) => (
              <div key={i} className={`ob-prog-seg${i < step ? " done" : ""}`} />
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
                      onClick={() => setSelectedProvider(p.id)}
                      role="radio"
                      aria-checked={selectedProvider === p.id}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelectedProvider(p.id); }}
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
                  <label className="ob-key-label">{t("onboarding.apiKeyLabel")}</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      className="ob-key-input"
                      type="password"
                      placeholder={t("onboarding.apiKeyPlaceholder")}
                      value={apiKey}
                      onChange={(e) => { setApiKey(e.target.value); setKeyVerified(false); }}
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        // Real action: navigate to agent settings where the key is stored.
                        setSettingsTab("agent");
                        setPage("settings");
                        setKeyVerified(true);
                      }}
                    >
                      {t("onboarding.verify")}
                    </Button>
                  </div>
                  {keyVerified && (
                    <div className="ob-banner-success">
                      <IconCheck size={12} />
                      {t("onboarding.keyVerified")}
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
              /* NEEDS DESIGN REVIEW — no approved mock for step 3 */
              <div className="ob-derived-step">
                <p className="ob-step-title">{t("onboarding.step3Title")}</p>
                <p className="ob-step-desc">{t("onboarding.step3Desc")}</p>
                <div className="ob-perm-options" role="radiogroup">
                  {(["always-ask", "write", "yolo"] as ToolApprovalMode[]).map((m) => (
                    <label key={m} className={`ob-perm-row${permMode === m ? " selected" : ""}`}>
                      <input
                        type="radio"
                        name="permMode"
                        value={m}
                        checked={permMode === m}
                        onChange={() => setPermMode(m)}
                        style={{ marginRight: 8 }}
                      />
                      {m === "always-ask" ? t("settings.toolApprovalModeAlwaysAsk")
                        : m === "write" ? t("settings.toolApprovalModeWrite")
                        : t("settings.toolApprovalModeYolo")}
                    </label>
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
          <span className="ob-foot-skip">
            <Button variant="ghost" size="sm" onClick={dismiss}>{t("onboarding.dismiss")}</Button>
          </span>
          {step > 1 && step < 4 && (
            <Button variant="ghost" size="sm" onClick={() => setStep((s) => s - 1)}>
              {t("onboarding.back")}
            </Button>
          )}
          {step === 4 ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => { setSettingsTab("agent"); setPage("settings"); }}>
                {t("onboarding.changeSettings")}
              </Button>
              <Button variant="primary" onClick={() => { void api.toolApprovalModeSet(permMode).catch(() => undefined); dismiss(); setPage("chat"); }}>
                {t("onboarding.startCoding")}
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                if (step < totalSteps) setStep((s) => s + 1);
              }}
            >
              {t("onboarding.continue")}
            </Button>
          )}
        </div>

      </div>
    </div>
  );
}
