import { describe, expect, it } from "vitest";
import { applyExtStatus, applyExtWidget } from "./ext-ui-state";

describe("ext-ui-state", () => {
  it("shows omp's coloured status text as plain text", () => {
    const text = "\u001b[38;2;107;114;128m○\u001b[39m 🐴 \u001b[38;2;156;163;176mponytail: \u001b[39m⚡ FULL\u001b[39m";
    expect(applyExtStatus({}, "ponytail", text)).toEqual({ ponytail: "○ 🐴 ponytail: ⚡ FULL" });
  });

  it("strips colour escapes from widget lines", () => {
    expect(applyExtWidget({}, "w", ["\u001b[1mtitle\u001b[0m", "plain"])).toEqual({ w: ["title", "plain"] });
  });
});
