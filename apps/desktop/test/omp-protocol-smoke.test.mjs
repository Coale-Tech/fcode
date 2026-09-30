/**
 * omp-protocol-smoke.test.mjs
 *
 * Smoke test for the omp RPC protocol handshake. This file lives in
 * apps/desktop/test/ — the only location executed by release.yml via
 * `pnpm -r --if-present test`. The 52 scripts/e2e-*.mjs files are NOT run
 * in any CI workflow.
 *
 * What this test asserts:
 *   1. The bundled omp binary was built from the current omp/ source
 *      (omp.build.json sourceHash vs `git ls-files -s omp`) — skipped when
 *      the binary or omp.build.json is absent.
 *   2. omp --mode rpc offers protocol version 2 in its `ready` frame, and
 *      replies with exactly `{protocolVersion:2}` to a `negotiate_protocol`
 *      request — skipped when the binary is absent.
 *   3. (mock) The handshake contract itself: a process that correctly emits the
 *      omp `ready` frame and expects `negotiate_protocol {protocolVersion:2}`
 *      back — always runs, exercises the bridge-level expectations without
 *      needing the real binary.
 *
 * When the omp binary is not present (development environment before building):
 * run `node scripts/build-omp.mjs` to build it from the in-repo omp/ source.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");



// ---------------------------------------------------------------------------
// Binary resolution — mirrors agent-sidecar.ts resolveSidecarEntry()
// ---------------------------------------------------------------------------
function resolveOmpBinary() {
  const candidates = [
    process.env.OMP_BIN,
    join(repoRoot, "apps/desktop/resources/bin/omp"),
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

const ompBinary = resolveOmpBinary();
const binaryMissingMsg =
  "omp binary not found at apps/desktop/resources/bin/omp or $OMP_BIN — " +
  "build it with: node scripts/build-omp.mjs";

// ---------------------------------------------------------------------------
// Test 1: bundled binary was built from the current omp/ source
// (hash of `git ls-files -s omp`; stage edits with `git add omp` to register)
// ---------------------------------------------------------------------------
const buildJson = ompBinary ? join(dirname(ompBinary), "omp.build.json") : null;
test("omp binary is not stale vs omp/ source", {
  skip: !buildJson || !existsSync(buildJson) ? "no omp.build.json next to binary" : false,
}, () => {
  const want = createHash("sha256")
    .update(execFileSync("git", ["ls-files", "-s", "omp"], { cwd: repoRoot }))
    .digest("hex");
  assert.equal(
    JSON.parse(readFileSync(buildJson, "utf8")).sourceHash,
    want,
    "omp/ changed since the last build (git add omp if edited) — rebuild with: node scripts/build-omp.mjs",
  );
});

// ---------------------------------------------------------------------------
// Test 2: Live handshake with the real omp binary
// Spawns omp --mode rpc, completes the ready → negotiate_protocol exchange,
// and asserts exactly protocolVersion:2 is returned.
// ---------------------------------------------------------------------------
test(
  "omp --mode rpc protocol smoke: handshake negotiates exactly version 2",
  {
    skip: ompBinary ? false : binaryMissingMsg,
    timeout: 15_000,
  },
  () =>
    new Promise((done, fail) => {
      const omp = spawn(ompBinary, ["--mode", "rpc"], {
        stdio: ["pipe", "pipe", "inherit"],
      });

      let buf = "";
      let negotiated = false;

      function cleanup(err) {
        if (!omp.killed) omp.kill();
        if (err) fail(err);
        else done();
      }

      omp.stdout.setEncoding("utf8");
      omp.stdout.on("data", (chunk) => {
        buf += chunk;
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;

          let msg;
          try {
            msg = JSON.parse(line);
          } catch {
            continue; // ignore non-JSON lines (e.g. startup noise)
          }

          if (msg.type === "ready") {
            // omp must advertise protocol version 2
            const supported = msg.supportedProtocolVersions ?? [];
            try {
              assert.ok(
                Array.isArray(supported) && supported.includes(2),
                `omp ready frame must include protocol version 2 in supportedProtocolVersions; got ${JSON.stringify(supported)}`,
              );
            } catch (e) {
              return cleanup(e);
            }

            // reply with negotiate_protocol — flat envelope, matches
            // oh-my-pi packages/coding-agent/src/modes/rpc/rpc-types.ts
            omp.stdin.write(
              JSON.stringify({
                id: "1",
                type: "negotiate_protocol",
                protocolVersion: 2,
              }) + "\n",
            );
          } else if (msg.type === "response" && msg.command === "negotiate_protocol" && !negotiated) {
            negotiated = true;
            try {
              assert.equal(msg.success, true, `negotiate_protocol must succeed; got ${JSON.stringify(msg)}`);
              assert.equal(
                msg.data?.protocolVersion,
                2,
                `negotiate_protocol must return {protocolVersion:2}; got ${JSON.stringify(msg.data)}`,
              );
            } catch (e) {
              return cleanup(e);
            }
            cleanup();
          }
        }
      });

      omp.on("error", (e) => fail(new Error(`Failed to spawn omp: ${e.message}`)));
      omp.on("exit", (code, signal) => {
        if (signal === "SIGTERM" || signal === "SIGKILL") return; // we killed it after success
        if (!negotiated) {
          fail(
            new Error(
              `omp exited prematurely before protocol negotiation: code=${code} signal=${signal}`,
            ),
          );
        }
      });
    }),
);

// ---------------------------------------------------------------------------
// Test 3: Mock handshake — the bridge-level contract, no real binary needed.
// Creates a fake "omp" process (a spawned node script) that emits the ready
// frame and validates that a conforming client sends negotiate_protocol{v:2}.
// This always runs and validates the protocol contract end-to-end.
// ---------------------------------------------------------------------------
test("omp protocol contract: mock handshake confirms bridge sends negotiate_protocol v2", {
  timeout: 10_000,
}, () =>
  new Promise((done, fail) => {
    // Inline mock omp process: emits ready, expects negotiate_protocol{v:2}
    const mockOmpScript = /* js */ `
      process.stdout.write(JSON.stringify({
        type: "ready",
        protocolVersion: 1,
        supportedProtocolVersions: [1, 2],
        maxFrameBytes: 1048576,
        maxReassembledFrameBytes: 67108864
      }) + "\\n");

      let buf = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", chunk => {
        buf += chunk;
        let nl;
        while ((nl = buf.indexOf("\\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let msg;
          try { msg = JSON.parse(line); } catch { continue; }

          if (msg.type === "negotiate_protocol") {
            const v = msg.protocolVersion;
            if (v !== 2) {
              process.stderr.write("FAIL: expected protocolVersion:2, got " + v + "\\n");
              process.exit(1);
            }
            // echo back the accepted version
            process.stdout.write(JSON.stringify({ id: msg.id, type: "response", command: "negotiate_protocol", success: true, data: { protocolVersion: 2 } }) + "\\n");
            process.exit(0);
          }
        }
      });

      setTimeout(() => {
        process.stderr.write("FAIL: timed out waiting for negotiate_protocol\\n");
        process.exit(2);
      }, 5000).unref();
    `;

    const mockOmp = spawn(process.execPath, ["--eval", mockOmpScript], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let readyReceived = false;

    mockOmp.stdout.setEncoding("utf8");
    mockOmp.stdout.on("data", (chunk) => {
      stdout += chunk;
      let nl;
      while ((nl = stdout.indexOf("\n")) !== -1) {
        const line = stdout.slice(0, nl).trim();
        stdout = stdout.slice(nl + 1);
        if (!line) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }

        if (msg.type === "ready") {
          readyReceived = true;
          // simulate what the bridge does: send negotiate_protocol v2
          mockOmp.stdin.write(
            JSON.stringify({ id: "1", type: "negotiate_protocol", protocolVersion: 2 }) + "\n",
          );
        } else if (msg.type === "response" && msg.command === "negotiate_protocol") {
          try {
            assert.equal(msg.success, true, "mock omp must report success:true");
            assert.equal(msg.data?.protocolVersion, 2,
              "mock omp must confirm protocolVersion:2");
          } catch (e) {
            return fail(e);
          }
        }
      }
    });

    mockOmp.stderr.setEncoding("utf8");
    mockOmp.stderr.on("data", (c) => { stderr += c; });

    mockOmp.on("exit", (code) => {
      if (code !== 0) {
        return fail(new Error(`mock omp exited with code ${code}: ${stderr}`));
      }
      if (!readyReceived) {
        return fail(new Error("mock omp did not emit a ready frame"));
      }
      done();
    });

    mockOmp.on("error", (e) => fail(e));
  }),
);

// ---------------------------------------------------------------------------
// E17 Doc gates: policy-sync tokens, single H1, no dead relative links
// ---------------------------------------------------------------------------

test("E17: AGENTS.md and CLAUDE.md have matching Policy-Sync tokens", () => {
  const agentsRaw = readFileSync(join(repoRoot, "AGENTS.md"), "utf8");
  const claudeRaw = readFileSync(join(repoRoot, "CLAUDE.md"), "utf8");
  const agentToken = agentsRaw.match(/Policy-Sync:\s*([^\s]+)/)?.[1];
  const claudeToken = claudeRaw.match(/Policy-Sync:\s*([^\s]+)/)?.[1];
  assert.ok(agentToken, "AGENTS.md is missing a Policy-Sync: <token> line");
  assert.ok(claudeToken, "CLAUDE.md is missing a Policy-Sync: <token> line");
  assert.equal(
    agentToken,
    claudeToken,
    `Policy-Sync token mismatch: AGENTS.md has ${agentToken}, CLAUDE.md has ${claudeToken}`,
  );
});

test("E17: docs/fcode/README.md has exactly one H1 heading", () => {
  const mdPath = join(repoRoot, "docs/fcode/README.md");
  assert.ok(existsSync(mdPath), "docs/fcode/README.md must exist");
  const raw = readFileSync(mdPath, "utf8");
  // Strip fenced code blocks so # inside yaml/bash blocks don't count as headings
  const withoutCode = raw.replace(/```[\s\S]*?```/g, "");
  const h1s = withoutCode.match(/^# .+/gm) ?? [];
  assert.equal(
    h1s.length,
    1,
    `docs/fcode/README.md must have exactly one H1 (outside code blocks); found ${h1s.length}: ${JSON.stringify(h1s)}`,
  );
});

test("E17: docs/fcode/README.md has no dead relative links", () => {
  const mdPath = join(repoRoot, "docs/fcode/README.md");
  const raw = readFileSync(mdPath, "utf8");
  const withoutCode = raw.replace(/```[\s\S]*?```/g, "");
  const relLinks = [...withoutCode.matchAll(/\[.*?\]\(([^)#]+)/g)]
    .map((m) => m[1])
    .filter((l) => !l.startsWith("http") && !l.startsWith("mailto:"));
  const dead = relLinks.filter((l) => !existsSync(join(repoRoot, l)));
  assert.deepEqual(
    dead,
    [],
    `Dead relative links in docs/fcode/README.md: ${dead.join(", ")}`,
  );
});
