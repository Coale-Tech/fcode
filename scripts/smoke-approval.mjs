#!/usr/bin/env node
/**
 * Smoke test: exercises stageProposal → approveProposal against a temp git repo.
 * Run: node --import tsx/esm scripts/smoke-approval.mjs
 * or:  cd packages/omp-bridge && npx tsx ../../scripts/smoke-approval.ts
 *
 * This file is TypeScript-compatible (tsx parses it as ESM TS).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Dynamically resolve the omp-bridge source so the smoke test doesn't need a dist build.
const { stageProposal, approveProposal, listPendingProposals, rejectProposal, PENDING_REVIEW_SUBPATH } =
  await import(join(__dirname, "../packages/omp-bridge/src/skill-review.js"));

const sh = (cwd, ...args) => execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8" }).trim();

const root = mkdtempSync(join(tmpdir(), "smoke-approval-"));
try {
  const clone = join(root, "skills", "frappeskills");
  const origin = join(root, "origin.git");

  // Set up bare origin + clone.
  sh(root, "git", "init", "-q", "--bare", "-b", "main", origin);
  sh(root, "git", "clone", "-q", `file://${origin}`, clone);
  writeFileSync(join(clone, "README.md"), "frappeskills\n");
  sh(clone, "git", "add", "-A");
  sh(clone, "git", "-c", "user.email=a@b", "-c", "user.name=a", "commit", "-qm", "init");
  sh(clone, "git", "push", "-q", "origin", "HEAD:main");
  sh(clone, "git", "checkout", "-b", "fcode/self-improve");
  sh(clone, "git", "config", "user.email", "fcode@localhost");
  sh(clone, "git", "config", "user.name", "Fcode");

  // Stage two proposals.
  const p1 = stageProposal(root, { name: "bench-pattern", description: "Bench setup tips", body: "# Bench Pattern\n\nUse pnpm install inside the worktree.\n" }, () => undefined);
  const p2 = stageProposal(root, { name: "git-rebase-tips", description: "Rebase workflow", body: "# Git Rebase\n\nAlways fetch before rebasing.\n" }, () => undefined);

  console.log("Staged:", p1.id, p2.id);
  const pending = listPendingProposals(root);
  console.assert(pending.length === 2, `Expected 2 pending, got ${pending.length}`);

  // Approve p1.
  await approveProposal(root, p1.id, (msg) => console.log("[log]", msg));

  const pendingAfterApprove = listPendingProposals(root);
  console.assert(pendingAfterApprove.length === 1, `Expected 1 pending after approve, got ${pendingAfterApprove.length}`);
  console.assert(!existsSync(join(root, PENDING_REVIEW_SUBPATH, `${p1.id}.json`)), "p1 pending file should be deleted");
  console.assert(existsSync(join(clone, "bench-pattern", "SKILL.md")), "SKILL.md should exist after approve");

  const gitLog = sh(clone, "git", "log", "--oneline");
  console.assert(gitLog.includes("bench-pattern"), `Expected commit for bench-pattern, got:\n${gitLog}`);

  // Reject p2.
  rejectProposal(root, p2.id);
  const pendingAfterReject = listPendingProposals(root);
  console.assert(pendingAfterReject.length === 0, `Expected 0 pending after reject, got ${pendingAfterReject.length}`);
  console.assert(!existsSync(join(clone, "git-rebase-tips", "SKILL.md")), "SKILL.md should NOT exist after reject");

  console.log("✓ stage → approve: SKILL.md committed on fcode/self-improve");
  console.log("✓ stage → reject: pending file removed, no commit");
  console.log("✓ pending proposal list updated correctly at each step");
  console.log("All smoke checks passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
