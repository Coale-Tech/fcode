import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { bindingHasModifier, isTypingTarget } = await import("../src/lib/use-shortcut.ts");

test("bindingHasModifier: recognises Mod, Ctrl, Alt, Shift prefixes", () => {
  assert.equal(bindingHasModifier("Mod+K"), true);
  assert.equal(bindingHasModifier("Ctrl+Z"), true);
  assert.equal(bindingHasModifier("Alt+Space"), true);
  assert.equal(bindingHasModifier("Shift+F1"), true);
  assert.equal(bindingHasModifier("Mod+Shift+R"), true);
});

test("bindingHasModifier: rejects modifier-free and malformed bindings", () => {
  assert.equal(bindingHasModifier("Escape"), false);
  assert.equal(bindingHasModifier("F11"), false);
  assert.equal(bindingHasModifier(""), false);
  // Key that starts with a modifier letter but is not a modifier prefix
  assert.equal(bindingHasModifier("Mode+K"), false);
});

test("isTypingTarget: input / textarea / select are editable targets", () => {
  for (const tag of ["input", "textarea", "select"]) {
    const el = { tagName: tag.toUpperCase(), getAttribute: () => null };
    assert.equal(isTypingTarget(el), true, `${tag} should be a typing target`);
  }
});

test("isTypingTarget: contenteditable element is a typing target", () => {
  const el = { tagName: "DIV", getAttribute: (attr) => attr === "contenteditable" ? "true" : null };
  assert.equal(isTypingTarget(el), true);
});

test("isTypingTarget: contenteditable=false is NOT a typing target", () => {
  const el = { tagName: "DIV", getAttribute: (attr) => attr === "contenteditable" ? "false" : null };
  assert.equal(isTypingTarget(el), false);
});

test("isTypingTarget: plain div is NOT a typing target", () => {
  const el = { tagName: "DIV", getAttribute: () => null };
  assert.equal(isTypingTarget(el), false);
});

test("isTypingTarget: null target is not a typing target", () => {
  assert.equal(isTypingTarget(null), false);
});

test("typing guard logic: modifier binding fires even in inputs", () => {
  // Simulate the guard: if typing target AND no modifier → block
  const modifierBinding = "Mod+Shift+R";
  const el = { tagName: "INPUT", getAttribute: () => null };
  const blocked = isTypingTarget(el) && !bindingHasModifier(modifierBinding);
  assert.equal(blocked, false, "Mod+Shift+R should not be blocked in an input");
});

test("typing guard logic: unmodified binding is blocked in inputs", () => {
  const bareBinding = "Escape";
  const el = { tagName: "INPUT", getAttribute: () => null };
  const blocked = isTypingTarget(el) && !bindingHasModifier(bareBinding);
  assert.equal(blocked, true, "Escape should be blocked when user is typing in an input");
});

test("typing guard logic: unmodified binding fires outside inputs", () => {
  const bareBinding = "Escape";
  const el = { tagName: "BUTTON", getAttribute: () => null };
  const blocked = isTypingTarget(el) && !bindingHasModifier(bareBinding);
  assert.equal(blocked, false, "Escape should not be blocked on a non-editable element");
});
