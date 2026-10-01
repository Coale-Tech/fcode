/**
 * E5 — Segment-aware read-only prefix matcher.
 * The matcher suppresses approval prompts (not form a security boundary);
 * the approval dialog is the boundary because omp's own bash tool can invoke
 * bench regardless.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { isReadOnlyBenchMethod } = await import(
  "../electron/main/bench/approval.ts"
);

test("frappe.client.get is read-only", () => {
  assert.ok(isReadOnlyBenchMethod("frappe.client.get"));
});

test("frappe.client.get_list is read-only", () => {
  assert.ok(isReadOnlyBenchMethod("frappe.client.get_list"));
});

test("frappe.db.get_value is read-only", () => {
  assert.ok(isReadOnlyBenchMethod("frappe.db.get_value"));
});

test("frappe.db.count is read-only", () => {
  assert.ok(isReadOnlyBenchMethod("frappe.db.count"));
});

test("frappe.client.get_value and get_count are read-only", () => {
  assert.ok(isReadOnlyBenchMethod("frappe.client.get_value"));
  assert.ok(isReadOnlyBenchMethod("frappe.client.get_count"));
});

test("frappe.utils.now is read-only", () => {
  assert.ok(isReadOnlyBenchMethod("frappe.utils.now"));
});

test("studio.api.get_app is read-only", () => {
  assert.ok(isReadOnlyBenchMethod("studio.api.get_app"));
});

test("builder.api.list_pages is read-only", () => {
  assert.ok(isReadOnlyBenchMethod("builder.api.list_pages"));
});

// Segment-aware: prefix that shares characters but not a full segment must NOT match.
test("frappe.client.get_list_evil is NOT read-only (segment check)", () => {
  assert.ok(!isReadOnlyBenchMethod("frappe.client.get_list_evil"));
});

test("frappe.client.set_value is NOT read-only", () => {
  assert.ok(!isReadOnlyBenchMethod("frappe.client.set_value"));
});

test("frappe.db.delete is NOT read-only", () => {
  assert.ok(!isReadOnlyBenchMethod("frappe.db.delete"));
});

test("studio.api.save_page is NOT read-only", () => {
  assert.ok(!isReadOnlyBenchMethod("studio.api.save_page"));
});

test("empty string is NOT read-only", () => {
  assert.ok(!isReadOnlyBenchMethod(""));
});

// `bench execute` eval()s any non-importable method string, so an expression
// that merely starts with an approved prefix must never skip the prompt.
test("expression that starts with an approved prefix is NOT read-only (eval bypass)", () => {
  assert.ok(!isReadOnlyBenchMethod("frappe.utils.now() and __import__('os').system('id')"));
  assert.ok(!isReadOnlyBenchMethod("frappe.client.get\n.x"));
});
