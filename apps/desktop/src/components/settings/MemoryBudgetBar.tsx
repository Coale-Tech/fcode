import { useTranslation } from "react-i18next";

interface MemoryBudgetBarProps {
  usedChars: number;
  capChars: number;
}

/** Shows "Always-on memory: 3,120 / 6,000 chars (52%)" with a progress bar. */
export function MemoryBudgetBar({ usedChars, capChars }: MemoryBudgetBarProps) {
  const { t } = useTranslation();
  const unlimited = capChars <= 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((usedChars / capChars) * 100));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%" }}>
      <span style={{ fontSize: "0.85em" }}>
        {unlimited
          ? t("settings.memoryBudgetUnknown", { usedChars: usedChars.toLocaleString() })
          : t("settings.memoryBudgetFill", {
              usedChars: usedChars.toLocaleString(),
              capChars: capChars.toLocaleString(),
              pct,
            })}
      </span>
      {!unlimited && (
        <div
          style={{
            height: "4px",
            borderRadius: "2px",
            background: "var(--surface-gray-3, #e5e7eb)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              borderRadius: "2px",
              background: pct >= 90 ? "var(--red-5, #ef4444)" : "var(--blue-5, #3b82f6)",
              transition: "width 0.3s",
            }}
          />
        </div>
      )}
    </div>
  );
}
