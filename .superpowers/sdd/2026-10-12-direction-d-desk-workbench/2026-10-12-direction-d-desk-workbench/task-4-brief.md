### Task 4: Settings → Appearance layout picker (UI + i18n + search)

**Files:**
- Create: `apps/desktop/src/components/settings/NavLayoutRow.tsx`
- Modify: `apps/desktop/src/features/settings/SettingsPage.tsx:51-52` (import), `:435-439` (render after `FontSizeRow`)
- Modify: `apps/desktop/src/styles/settings.css` (append `.nav-layout-*` rules)
- Modify: `apps/desktop/src/lib/settings-search.ts` (general tab, after `"settings.fontSize"` at ~line 73)
- Modify: all 9 `packages/i18n/src/locales/*/index.ts` (settings block, after `thinkingDisplayCompact`)
- Test: `pnpm --filter @pi-desktop/i18n test` (`catalogs`, `renderer-keys`, `user-facing-copy`)

**Interfaces:**
- Consumes: `SettingsRow` (`features/settings/primitives.tsx`), `NAV_LAYOUTS`/`resolveNavLayout`, `saveSettings(patch)` (instant save → `api.setSettings`).
- Produces: `<NavLayoutRow settings saveSettings />`; i18n keys `settings.navLayout`, `settings.navLayoutDesc`, `settings.navLayoutTabs`, `settings.navLayoutRail`, `settings.navLayoutIsland`.

- [ ] **Step 1: Add keys to `en` only; run i18n tests — expect FAIL** (catalog parity: 8 locales missing the keys).

```ts
    navLayout: "Navigation layout",
    navLayoutDesc: "Where the main destinations live. Applies instantly and is saved for your account.",
    navLayoutTabs: "Tabs",
    navLayoutRail: "Icon rail",
    navLayoutIsland: "Sidebar",
```

- [ ] **Step 2: Add the same keys to the other 8 locales** (match each file's key quoting — de/es/fr quote keys, the others do not):

| locale | navLayout | navLayoutDesc | Tabs | Rail | Island |
|---|---|---|---|---|---|
| zh-CN | 导航布局 | 主要入口的位置。立即生效，并保存到你的账户。 | 标签页 | 图标栏 | 侧边栏 |
| zh-TW | 導覽版面 | 主要入口的位置。立即生效，並儲存到你的帳戶。 | 分頁 | 圖示列 | 側邊欄 |
| de | Navigationslayout | Wo die Hauptziele liegen. Wirkt sofort und wird für dein Konto gespeichert. | Tabs | Symbolleiste | Seitenleiste |
| es | Diseño de navegación | Dónde están los destinos principales. Se aplica al instante y se guarda en tu cuenta. | Pestañas | Barra de iconos | Barra lateral |
| fr | Disposition de navigation | Où se trouvent les destinations principales. S'applique immédiatement et est enregistré pour votre compte. | Onglets | Barre d'icônes | Barre latérale |
| ko | 내비게이션 레이아웃 | 주요 이동 항목의 위치입니다. 즉시 적용되며 계정에 저장됩니다. | 탭 | 아이콘 레일 | 사이드바 |
| tr | Gezinme düzeni | Ana hedeflerin nerede durduğunu belirler. Anında uygulanır ve hesabınız için kaydedilir. | Sekmeler | Simge çubuğu | Kenar çubuğu |
| pt-BR | Layout de navegação | Onde ficam os destinos principais. Aplica na hora e é salvo na sua conta. | Abas | Barra de ícones | Barra lateral |

- [ ] **Step 3: Write the component**

```tsx
// apps/desktop/src/components/settings/NavLayoutRow.tsx
import { useTranslation } from "react-i18next";
import type { AppSettings } from "@pi-desktop/shared";
import { SettingsRow } from "../../features/settings/primitives";
import { NAV_LAYOUTS, resolveNavLayout, type NavLayout } from "../../lib/nav-layout";
import { cx } from "../ui";

const LABEL = {
  tabs: "settings.navLayoutTabs",
  rail: "settings.navLayoutRail",
  island: "settings.navLayoutIsland",
} as const satisfies Record<NavLayout, string>;

/** 64×44 wireframe: navbar band, then the layout's nav chrome, then the canvas. */
function Thumb({ layout }: { layout: NavLayout }) {
  return (
    <svg className="nav-layout-thumb" viewBox="0 0 64 44" aria-hidden>
      <rect x=".5" y=".5" width="63" height="43" rx="5" fill="none" stroke="currentColor" opacity=".35" />
      <rect x="1" y="1" width="62" height="7" fill="currentColor" opacity=".12" />
      {layout === "tabs" && (
        <>
          <rect x="6" y="3" width="9" height="3" rx="1.5" fill="currentColor" />
          <rect x="17" y="3" width="9" height="3" rx="1.5" fill="currentColor" opacity=".4" />
          <rect x="28" y="3" width="9" height="3" rx="1.5" fill="currentColor" opacity=".4" />
        </>
      )}
      {layout === "rail" && <rect x="1" y="8" width="7" height="35" fill="currentColor" opacity=".12" />}
      {layout === "island" && (
        <>
          <rect x="1" y="8" width="10" height="35" fill="currentColor" opacity=".12" />
          <rect x="12" y="8" width="14" height="35" fill="currentColor" opacity=".08" />
        </>
      )}
      <rect
        x={layout === "tabs" ? 4 : layout === "rail" ? 11 : 29}
        y="11"
        width={layout === "tabs" ? 56 : layout === "rail" ? 49 : 31}
        height="29"
        rx="3"
        fill="currentColor"
        opacity=".18"
      />
    </svg>
  );
}

export function NavLayoutRow({
  settings,
  saveSettings,
}: {
  settings: AppSettings;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const current = resolveNavLayout(settings.navLayout);
  return (
    <SettingsRow title={t("settings.navLayout")} description={t("settings.navLayoutDesc")}>
      <div className="nav-layout-picker" role="radiogroup" aria-label={t("settings.navLayout")}>
        {NAV_LAYOUTS.map((id) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={current === id}
            data-nav-layout-option={id}
            className={cx("nav-layout-card", current === id && "is-selected")}
            onClick={() => void saveSettings({ navLayout: id })}
          >
            <Thumb layout={id} />
            <span className="nav-layout-card-label">{t(LABEL[id])}</span>
          </button>
        ))}
      </div>
    </SettingsRow>
  );
}
```

- [ ] **Step 4:** `SettingsPage.tsx`: `import { NavLayoutRow } from "../../components/settings/NavLayoutRow";` and add `<NavLayoutRow settings={settings} saveSettings={saveSettings} />` after `<FontSizeRow … />` (line 439).

- [ ] **Step 5:** CSS appended to `settings.css`:

```css
.nav-layout-picker { display: flex; gap: 8px; }
.nav-layout-card {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 8px; min-width: 88px;
  color: var(--ds-text-secondary);
  background: var(--ds-bg-primary);
  border: 1px solid var(--ds-border-default);
  border-radius: var(--d-r-ctrl);
  cursor: pointer;
}
.nav-layout-card:hover { border-color: var(--ds-text-tertiary); }
.nav-layout-card:focus-visible { outline: var(--focus-outline-default); outline-offset: 2px; }
.nav-layout-card.is-selected {
  color: var(--ds-accent);
  border-color: var(--ds-accent);
  box-shadow: 0 0 0 1px var(--ds-accent);
}
.nav-layout-thumb { width: 64px; height: 44px; }
.nav-layout-card-label { font-size: var(--d-text-sm); color: var(--ds-text-primary); }
```
(Verify `--ds-text-secondary`, `--ds-bg-primary`, `--ds-border-default` exist: `grep -n` them in `tokens.css`; they are used by the existing settings rows. If a name is absent use the nearest existing token from `settings.css`'s `.settings-segment` rule.)

- [ ] **Step 6:** Search index: add `"settings.navLayout", "settings.navLayoutDesc", "settings.navLayoutTabs", "settings.navLayoutRail", "settings.navLayoutIsland",` after `"settings.fontSize",` in the `general` entry.

- [ ] **Step 7:** `pnpm --filter @pi-desktop/i18n test` → PASS. `tsc` baseline. Capture rig → Settings → General → Appearance; click each card; confirm `document.documentElement.dataset.navLayout` changes and survives `Cmd+R`.
- [ ] **Step 8: Commit** `feat(settings): navigation layout picker`

---

