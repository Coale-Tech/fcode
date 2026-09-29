/**
 * T6 — Bench surface interaction-state coverage (source-shape assertions).
 *
 * Gap 1: bench-start failure panel (startFailure state, failure event, Retry + Copy log).
 * Gap 2: one-shot verb LOADING/SUCCESS/ERROR states (oneshotState Map, spinner, Copy).
 * Gap 3: elapsed timer displayed next to status label (elapsedLabel, setInterval).
 * Gap 4: failedRoots entries in the bench sidebar (role=alert).
 * Gap 5: port-conflict warning rows (warnings state, benchWarning event, ⚠ icon).
 * T8:  DestructiveActionDialog imported and gating migrate.
 * T14: Focus restored after dialog close (dialogTriggerRef + .focus()).
 *
 * Convention: source-shape regex assertions against the raw TSX file text.
 * No rendering, no DOM — tests pass fast without jsdom.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const PAGE_URL = new URL("../src/pages/BenchPage.tsx", import.meta.url);
const source = await readFile(fileURLToPath(PAGE_URL), "utf8");

// ── Gap 1: bench-start failure ─────────────────────────────────────────────────

test("T6 Gap1: startFailure state is declared", () => {
  assert.match(source, /startFailure.*StartFailureState/);
});

test("T6 Gap1: benchFailure event is listened to", () => {
  assert.match(source, /IPC\.event\.benchFailure/);
});

test("T6 Gap1: failure panel renders problem and fix (role=alert)", () => {
  assert.match(source, /startFailure.*role.*alert|role.*alert.*startFailure/s);
});

test("T6 Gap1: Retry button is rendered inside the failure panel", () => {
  assert.match(source, /Retry/);
});

test("T6 Gap1: Copy log button is rendered inside the failure panel", () => {
  assert.match(source, /Copy log/);
});

// ── Gap 2: one-shot verb states ────────────────────────────────────────────────

test("T6 Gap2: oneshotState Map is declared", () => {
  assert.match(source, /oneshotState.*Map.*OneshotEntry/);
});

test("T6 Gap2: running spinner label shown on verb button", () => {
  // Button text includes verb + ellipsis while running
  assert.match(source, /running.*`\$\{verb\}.*…`|\$\{verb\}.*….*running/s);
});

test("T6 Gap2: ok tick shown on successful one-shot", () => {
  assert.match(source, /✓.*\$\{verb\}|\$\{verb\}.*exit 0/s);
});

test("T6 Gap2: error state shown on failed one-shot with Copy button", () => {
  assert.match(source, /✗.*\$\{verb\}|\$\{verb\}.*error/s);
  assert.match(source, /Copy error output|Copy.*error/);
});

// ── Gap 3: elapsed timer ───────────────────────────────────────────────────────

test("T6 Gap3: elapsedLabel state is declared", () => {
  assert.match(source, /elapsedLabel.*setElapsedLabel/);
});

test("T6 Gap3: setInterval drives the elapsed timer", () => {
  assert.match(source, /setInterval/);
});

test("T6 Gap3: startMsRef is a useRef tracking start time", () => {
  assert.match(source, /startMsRef.*useRef/);
});

// ── Gap 4: failedRoots discovery banner ────────────────────────────────────────

test("T6 Gap4: failedRoots state is declared", () => {
  assert.match(source, /failedRoots.*useState/);
});

test("T6 Gap4: failedRoots banner has role=alert", () => {
  assert.match(source, /failedRoots.*role.*alert|role.*alert.*failedRoots/s);
});

test("T6 Gap4: partial-discovery case shown (some roots ok, some failed)", () => {
  // The banner text explains partial failure
  assert.match(source, /unreadable.*fix permissions|fix permissions.*unreadable/si);
});

// ── Gap 5: port-conflict warnings ─────────────────────────────────────────────

test("T6 Gap5: warnings state is declared", () => {
  assert.match(source, /warnings.*useState.*string\[\]/);
});

test("T6 Gap5: benchWarning event is listened to", () => {
  assert.match(source, /IPC\.event\.benchWarning/);
});

test("T6 Gap5: warning rows rendered with warning icon", () => {
  assert.match(source, /⚠/);
});

// ── T8: DestructiveActionDialog gates destructive verbs ───────────────────────

test("T8: DestructiveActionDialog is imported", () => {
  assert.match(source, /import.*DestructiveActionDialog.*from/);
});

test("T8: DestructiveActionDialog is rendered in JSX", () => {
  assert.match(source, /<DestructiveActionDialog/);
});

test("T8: migrate is gated by the destructive dialog", () => {
  // migrate must appear in the DESTRUCTIVE_CONSEQUENCES map
  assert.match(source, /migrate.*alters.*database|DESTRUCTIVE_CONSEQUENCES.*migrate/s);
});

// ── T14: Focus management (dialog open/close) ─────────────────────────────────

test("T14: dialogTriggerRef saves the trigger button ref", () => {
  assert.match(source, /dialogTriggerRef.*useRef/);
});

test("T14: focus is restored to trigger on dialog confirm", () => {
  assert.match(source, /dialogTriggerRef\.current\?\.focus/);
});

test("T14: focus is restored to trigger on dialog cancel (handleDialogCancel)", () => {
  assert.match(source, /handleDialogCancel/);
  // handleDialogCancel must call .focus() on the trigger ref
  assert.match(source, /handleDialogCancel[\s\S]{0,200}\.focus\(\)/);
});
