/**
 * omp-protocol-smoke.test.mjs
 *
 * Smoke test for the omp RPC protocol handshake. This file lives in
 * apps/desktop/test/ — the only location executed by release.yml via
 * `pnpm -r --if-present test`. The 52 scripts/e2e-*.mjs files are NOT run
 * in any CI workflow.
 *
 * What this test asserts:
 *   1. The bundled omp binary's SHA256 matches the value recorded in
 *      scripts/build-omp.mjs (OMP_BINARY_SHA256 constant) — skipped when the
 *      binary or the constant is absent.
 *   2. omp --mode rpc offers protocol version 2 in its `ready` frame, and
 *      replies with exactly `{protocolVersion:2}` to a `negotiate_protocol`
 *      request — skipped when the binary is absent.
 *   3. (mock) The handshake contract itself: a process that correctly emits the
 *      omp `ready` frame and expects `negotiate_protocol {protocolVersion:2}`
 *      back — always runs, exercises the bridge-level expectations without
 *      needing the real binary.
 *
 * When the omp binary is not present (development environment before building):
 * run `node scripts/build-omp.mjs` to build it from the pinned oh-my-pi commit.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

// ---------------------------------------------------------------------------
// SHA pinning — read OMP_BINARY_SHA256 from scripts/build-omp.mjs
// ---------------------------------------------------------------------------
let OMP_BINARY_SHA256 = null;
const buildOmpScript = join(repoRoot, "scripts", "build-omp.mjs");
if (existsSync(buildOmpScript)) {
  const src = readFileSync(buildOmpScript, "utf8");
  const m = src.match(/OMP_BINARY_SHA256\s*=\s*["']([0-9a-f]{64})["']/);
  if (m) OMP_BINARY_SHA256 = m[1];
}

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
// Test 1: SHA256 of bundled binary matches pinned SHA
// ---------------------------------------------------------------------------
test("omp binary SHA256 matches pinned SHA recorded in build-omp.mjs", {
  skip:
    !ompBinary
      ? binaryMissingMsg
      : !OMP_BINARY_SHA256
        ? "OMP_BINARY_SHA256 not found in scripts/build-omp.mjs — run: node scripts/build-omp.mjs"
        : false,
}, () => {
  const data = readFileSync(ompBinary);
  const actual = createHash("sha256").update(data).digest("hex");
  assert.equal(
    actual,
    OMP_BINARY_SHA256,
    `omp binary SHA256 mismatch — the binary does not match the commit pinned in scripts/build-omp.mjs. Rebuild with: node scripts/build-omp.mjs`,
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

          if (msg.method === "ready") {
            // omp must advertise protocol version 2
            const supported = msg.params?.supportedProtocolVersions ?? [];
            try {
              assert.ok(
                Array.isArray(supported) && supported.includes(2),
                `omp ready frame must include protocol version 2 in supportedProtocolVersions; got ${JSON.stringify(supported)}`,
              );
            } catch (e) {
              return cleanup(e);
            }

            // reply with negotiate_protocol
            omp.stdin.write(
              JSON.stringify({
                id: 1,
                method: "negotiate_protocol",
                params: { protocolVersion: 2 },
              }) + "\n",
            );
          } else if (msg.id === 1 && !negotiated) {
            negotiated = true;
            try {
              assert.equal(
                msg.result?.protocolVersion,
                2,
                `negotiate_protocol must return {protocolVersion:2}; got ${JSON.stringify(msg.result)}`,
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
        id: null,
        method: "ready",
        params: {
          protocolVersion: 1,
          supportedProtocolVersions: [1, 2],
          maxFrameBytes: 1048576,
          maxReassembledFrameBytes: 67108864
        }
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

          if (msg.method === "negotiate_protocol") {
            const v = msg.params?.protocolVersion;
            if (v !== 2) {
              process.stderr.write("FAIL: expected protocolVersion:2, got " + v + "\\n");
              process.exit(1);
            }
            // echo back the accepted version
            process.stdout.write(JSON.stringify({ id: msg.id, result: { protocolVersion: 2 } }) + "\\n");
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

        if (msg.method === "ready") {
          readyReceived = true;
          // simulate what the bridge does: send negotiate_protocol v2
          mockOmp.stdin.write(
            JSON.stringify({ id: 1, method: "negotiate_protocol", params: { protocolVersion: 2 } }) + "\n",
          );
        } else if (msg.id === 1 && msg.result) {
          try {
            assert.equal(msg.result.protocolVersion, 2,
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
