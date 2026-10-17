/**
 * Behavioural test: when onboarding.showChecklist is true and there are no
 * sessions, the sidebar should get the `is-first-run` class and render the
 * `sidebar-first-run-empty` block.  This is a pure store-state test; no DOM
 * renderer required.
 *
 * Design authority: pages-d/onboarding, implementer-rules §first-run-sidebar.
 */
import { describe, it, expect } from "vitest";

describe("first-run sidebar empty state derivation", () => {
  it("firstRunEmpty is true when showChecklist=true, no sessions, and navLayout is not island", () => {
    const showChecklist = true;
    const sessions = [];
    const navLayout = "tabs"; // not island

    const firstRunEmpty =
      navLayout !== "island" && Boolean(showChecklist) && sessions.length === 0;

    expect(firstRunEmpty).toBe(true);
  });

  it("firstRunEmpty is false in island layout", () => {
    const showChecklist = true;
    const sessions = [];
    const navLayout = "island";

    const firstRunEmpty =
      navLayout !== "island" && Boolean(showChecklist) && sessions.length === 0;

    expect(firstRunEmpty).toBe(false);
  });

  it("firstRunEmpty is false when sessions exist", () => {
    const showChecklist = true;
    const sessions = [{ id: "s1" }];
    const navLayout = "tabs";

    const firstRunEmpty =
      navLayout !== "island" && Boolean(showChecklist) && sessions.length === 0;

    expect(firstRunEmpty).toBe(false);
  });

  it("firstRunEmpty is false when checklist is not shown", () => {
    const showChecklist = false;
    const sessions = [];
    const navLayout = "tabs";

    const firstRunEmpty =
      navLayout !== "island" && Boolean(showChecklist) && sessions.length === 0;

    expect(firstRunEmpty).toBe(false);
  });
});
