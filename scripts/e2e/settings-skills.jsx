/**
 * Settings → Skills fixture.
 *
 * Mounts OmpSettingsSections(part="extensions") and a standalone MemoryBudgetBar
 * in an isolated Electron renderer with fully mocked IPC.  Exposes
 * window.skillsProbe() for the runner to call via executeJavaScript().
 *
 * No host-core binary, no omp sidecar, no network required.
 */
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { catalogs, flattenCatalog } from "@pi-desktop/i18n";
import { IPC } from "@pi-desktop/shared";
import { OmpSettingsSections } from "../../apps/desktop/src/features/settings/omp-settings-sections";
import { MemoryBudgetBar } from "../../apps/desktop/src/components/settings/MemoryBudgetBar";

// ── IPC mock ─────────────────────────────────────────────────────────────────

let ompSettings = {
  "skills.review.enabled": false,
  "skills.curator.enabled": true,
  "skills.curator.staleDays": 14,
  "skills.curator.archiveDays": 30,
};
const settingsSetCalls = [];

window.piDesktop = {
  platform: "darwin",
  on: () => () => {},
  async invoke(channel, input) {
    switch (channel) {
      case IPC.invoke.ompSettingsGet:
        return { ok: true, data: { ...ompSettings } };

      case IPC.invoke.ompSettingsSet: {
        settingsSetCalls.push({ ...input });
        ompSettings = { ...ompSettings, ...input };
        return { ok: true, data: { ...ompSettings } };
      }

      case IPC.invoke.ompModelsList:
        return { ok: true, data: { models: [] } };

      case IPC.invoke.ompSkillPackStatus:
        return {
          ok: true,
          data: { cloned: true, commits: [], dirty: false, lint: [] },
        };

      case IPC.invoke.ompSkillCuratorStatus:
        return { ok: true, data: { skills: [] } };

      case IPC.invoke.ompInstalledSkillsList:
        return { ok: true, data: { skills: [] } };

      case IPC.invoke.ompExtensionsList:
        return { ok: true, data: { extensions: [] } };

      // Channels added by follow-on PRs — return safe empty defaults so the
      // fixture doesn't log console errors for features outside this test's scope.
      case IPC.invoke.ompSkillProposalList:
        return { ok: true, data: { proposals: [] } };

      case IPC.invoke.ompSkillJourney:
        return { ok: true, data: { events: [] } };

      default:
        // Warn but do NOT error — unknown channels indicate new features; the
        // test should not break every time a new IPC channel is added.
        console.warn("Fixture: unhandled IPC channel:", channel);
        return { ok: false, error: { message: `Unknown channel: ${channel}` } };
    }
  },
};

// ── Bootstrap (async IIFE so we can await without top-level await) ────────────

(async () => {
  await i18n.use(initReactI18next).init({
    lng: "en",
    resources: { en: { translation: flattenCatalog(catalogs.en) } },
    interpolation: { escapeValue: false },
  });

  const rootEl = document.getElementById("root");
  const reactRoot = createRoot(rootEl);

  function TestApp() {
    return (
      <div id="skills-fixture">
        <OmpSettingsSections part="extensions" />
        <div id="budget-fixture">
          <MemoryBudgetBar usedChars={3120} capChars={6000} />
        </div>
      </div>
    );
  }

  flushSync(() => reactRoot.render(<TestApp />));

  const frame = () => new Promise(requestAnimationFrame);
  async function settle() {
    await frame();
    await frame();
    await frame();
  }

  function headings() {
    return [...document.querySelectorAll(".settings-card-heading")].map((n) =>
      n.textContent.trim(),
    );
  }

  window.skillsProbe = async () => {
    // Wait for async IPC loads (up to ~16 frames)
    for (let i = 0; i < 16; i++) {
      await settle();
      if (headings().some((h) => h.includes("Self-improving"))) break;
    }

    const checks = {};

    // ── Section headings ───────────────────────────────────────────────────
    const h = headings();
    checks.skillPackSectionRendered = h.some((t) => t.includes("Self-improving"));
    checks.skillCuratorSectionRendered = h.some((t) => t.includes("Skill Usage"));
    checks.skillReviewSectionRendered = h.some((t) =>
      t.includes("Background Skill Review"),
    );

    // ── MemoryBudgetBar ────────────────────────────────────────────────────
    const budgetSpan = document.querySelector("#budget-fixture span");
    checks.memoryBudgetBarRendered =
      budgetSpan !== null &&
      budgetSpan.textContent.includes("3,120") &&
      budgetSpan.textContent.includes("6,000") &&
      budgetSpan.textContent.includes("52%");

    // ── Review toggle wiring ───────────────────────────────────────────────
    const settingsSetBefore = settingsSetCalls.length;

    // Find the review card by heading text, then its toggle button
    const cards = [...document.querySelectorAll(".settings-card-block")];
    const reviewCard = cards.find((c) =>
      c.querySelector(".settings-card-heading")?.textContent?.includes("Background Skill Review"),
    );
    const reviewToggle = reviewCard?.querySelector(
      'button[role="switch"], input[type="checkbox"]',
    );

    if (reviewToggle) {
      checks.reviewToggleFound = true;
      flushSync(() => reviewToggle.click());
      // Let the async ompSettingsSet call resolve
      for (let i = 0; i < 8; i++) {
        await settle();
        if (settingsSetCalls.length > settingsSetBefore) break;
      }
      checks.reviewToggleFiredIpc = settingsSetCalls.length > settingsSetBefore;
      const lastCall = settingsSetCalls[settingsSetCalls.length - 1] ?? {};
      // toggle was off → should now be true
      checks.reviewTogglePersistedTrue =
        lastCall["skills.review.enabled"] === true;
    } else {
      checks.reviewToggleFound = false;
      checks.reviewToggleFiredIpc = false;
      checks.reviewTogglePersistedTrue = false;
    }

    const ok =
      checks.skillPackSectionRendered &&
      checks.skillCuratorSectionRendered &&
      checks.skillReviewSectionRendered &&
      checks.memoryBudgetBarRendered &&
      checks.reviewToggleFound &&
      checks.reviewToggleFiredIpc &&
      checks.reviewTogglePersistedTrue;

    return { ok, checks, settingsSetCalls };
  };
})();
