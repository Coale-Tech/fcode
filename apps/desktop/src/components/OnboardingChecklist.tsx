import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useAppStore } from "../stores/app-store";
import { IconCheck } from "./icons";
import { deriveBenchOnboarding, useBenchStatus } from "../lib/use-bench-status";

/** Host step ids (app.getOnboarding) mapped to locale keys under `onboarding.`. */
const STEP_LOCALE_KEY: Record<string, string> = {
  provider: "addProvider",
  secret: "saveKey",
  project: "openProject",
  prompt: "firstPrompt",
  plugin: "loadPlugin",
};

/** First-run inline checklist (D021): rendered on the empty chat home until
 * every step is done or the user dismisses it. State comes from the host
 * (app.getOnboarding); actions deep-link into the relevant surface.
 * Bench-specific steps (bench.discover / bench.select / bench.start) are
 * sourced from the renderer store — host-core is frozen and cannot own them. */
export function OnboardingChecklist() {
  const { t } = useTranslation();
  const onboarding = useAppStore((s) => s.onboarding);
  const workspace = useAppStore((s) => s.workspace);
  const discoveredBenchCount = useAppStore((s) => s.discoveredBenchCount);
  const setPage = useAppStore((s) => s.setPage);
  const setSettingsTab = useAppStore((s) => s.setSettingsTab);
  const openProject = useAppStore((s) => s.openProject);

  // Bench steps: live bench state from IPC poll (B8 fix).
  // Discovery runs automatically at launch so bench.discover is always done.
  const { status, benchPath } = useBenchStatus();
  const { select: benchSelected, start: benchStarted } = deriveBenchOnboarding(
    status,
    benchPath,
    workspace,
  );
  const benchDiscoverTitle =
    discoveredBenchCount != null && discoveredBenchCount > 0
      ? t("onboarding.benchDiscoverCount", "{{count}} benches found", {
          count: discoveredBenchCount,
        })
      : t("onboarding.benchDiscover", "Discover benches");
  const benchSteps = [
    { id: "bench.discover", title: benchDiscoverTitle, done: true },
    {
      id: "bench.select",
      title: t("onboarding.benchSelect", "Select a bench to work on"),
      done: benchSelected,
    },
    {
      id: "bench.start",
      title: t("onboarding.benchStart", "Start your bench"),
      done: benchStarted,
    },
  ];
  const allBenchDone = benchSelected && benchStarted;

  const hostSteps = onboarding?.showChecklist ? (onboarding.steps ?? []) : [];
  const allHostDone = hostSteps.length === 0 || hostSteps.every((s) => s.done);

  // Show checklist when bench onboarding is incomplete OR host steps are pending.
  if (allBenchDone && allHostDone) return null;
  // If host-core says no checklist and all bench steps done, stay hidden.
  if (allBenchDone && !onboarding?.showChecklist) return null;

  const stepLabel = (id: string, fallback: string) => {
    const key = `onboarding.${STEP_LOCALE_KEY[id] ?? id}`;
    const label = t(key);
    return label === key ? fallback : label;
  };

  const runAction = (id: string) => {
    switch (id) {
      case "settings.providers":
      case "addProvider":
      case "saveKey":
        setSettingsTab("agent");
        setPage("settings");
        break;
      case "project.open":
      case "openProject":
        void openProject();
        break;
      case "chat.focus":
        setPage("chat");
        requestAnimationFrame(() => {
          document
            .querySelector<HTMLTextAreaElement>(".composer-input")
            ?.focus();
        });
        break;
      case "plugins.open":
      case "loadPlugin":
        setPage("plugins");
        break;
      case "bench.discover":
      case "bench.select":
      case "bench.start":
        setPage("bench");
        break;
      default:
        break;
    }
  };

  const dismiss = () => {
    void api
      .dismissOnboarding()
      .catch(() => undefined)
      .finally(() => {
        const current = useAppStore.getState().onboarding;
        if (current) {
          useAppStore.setState({
            onboarding: { ...current, showChecklist: false },
          });
        }
      });
  };

  const steps = [...benchSteps, ...hostSteps];
  const doneCount = steps.filter((s) => s.done).length;
  const currentId = steps.find((s) => !s.done)?.id;

  return (
    <div className="home-onboarding-checklist wb-onboarding" data-testid="onboarding-checklist">
      <div className="wb-onboarding-hd">
        <span className="wb-onboarding-title">{t("onboarding.title")}</span>
        <span className="wb-muted">{doneCount}/{steps.length}</span>
        <span className="wb-spacer" />
        <button type="button" className="wb-btn wb-btn-ghost wb-btn-sm" onClick={dismiss}>
          {t("onboarding.dismiss")}
        </button>
      </div>
      <div className="wb-progress" aria-hidden>
        {steps.map((step) => (
          <span key={step.id} className={`wb-progress-seg${step.done ? " is-filled" : ""}`} />
        ))}
      </div>
      <ul className="wb-steps">
        {steps.map((step) => {
          const state = step.done ? "is-done" : step.id === currentId ? "is-current" : "is-pending";
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={step.done}
                onClick={() => runAction("action" in step ? (step as { action?: string; id: string }).action ?? step.id : step.id)}
                className={`wb-step ${state}`}
              >
                <span className={`wb-step-check ${state}`} aria-hidden>
                  {step.done && <IconCheck size={11} />}
                </span>
                <span className="wb-step-title">{stepLabel(step.id, step.title)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
