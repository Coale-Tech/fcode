/**
 * Unit tests for omp-binary.ts:
 *   appResourcesPath  — dev fallback when process.resourcesPath lacks fcode-agents
 *   resolveOmpBin     — OMP_BIN wins; staged binary found; PATH fallback + warning
 *   ompChildEnv       — sets PI_CODING_AGENT_DIR; respects extra overrides
 *
 * Run with: node --test test/omp-binary.test.mjs
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { register } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { appResourcesPath, resolveOmpBin, ompChildEnv } = await import(
  "../electron/main/omp-binary.ts"
);

// ── helpers ───────────────────────────────────────────────────────────────────

/** Create a temp dir with a fcode-agents subdirectory (looks like a real resources dir). */
async function makeFakeResources(extra = []) {
  const tmp = await mkdtemp(join(tmpdir(), "omp-rp-"));
  await mkdir(join(tmp, "fcode-agents"), { recursive: true });
  for (const sub of extra) await mkdir(join(tmp, sub), { recursive: true });
  return tmp;
}

/** Save and restore process.resourcesPath around a test. */
function withResourcesPath(path, fn) {
  const saved = process.resourcesPath;
  process.resourcesPath = path;
  try {
    return fn();
  } finally {
    process.resourcesPath = saved;
  }
}

/** Save and restore process.env.OMP_BIN around a test. */
function withoutOmpBin(fn) {
  const saved = process.env.OMP_BIN;
  delete process.env.OMP_BIN;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.OMP_BIN;
    else process.env.OMP_BIN = saved;
  }
}

// ── appResourcesPath ──────────────────────────────────────────────────────────

describe("appResourcesPath", () => {
  it("falls back to source-relative resources when process.resourcesPath is unset", () => {
    const saved = process.resourcesPath;
    process.resourcesPath = undefined;
    try {
      const p = appResourcesPath();
      // The fallback resolves to apps/desktop/resources (import.meta.url-relative)
      assert.ok(
        p.endsWith("resources") || p.endsWith("resources/"),
        `expected path ending in 'resources', got: ${p}`,
      );
    } finally {
      process.resourcesPath = saved;
    }
  });

  it("falls back when process.resourcesPath lacks fcode-agents subdir", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "omp-rp-"));
    // no fcode-agents inside tmp
    try {
      const p = withResourcesPath(tmp, () => appResourcesPath());
      assert.ok(
        p.endsWith("resources") || p.endsWith("resources/"),
        `should fall back to source-relative resources, got: ${p}`,
      );
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("returns process.resourcesPath when it contains fcode-agents", async () => {
    const tmp = await makeFakeResources();
    try {
      const p = withResourcesPath(tmp, () => appResourcesPath());
      assert.equal(p, tmp);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

// ── resolveOmpBin ─────────────────────────────────────────────────────────────

describe("resolveOmpBin", () => {
  it("OMP_BIN env wins over everything", async () => {
    const tmp = await makeFakeResources(["bin"]);
    try {
      const savedOmpBin = process.env.OMP_BIN;
      process.env.OMP_BIN = "/my/custom/omp";
      const savedRp = process.resourcesPath;
      process.resourcesPath = tmp;
      try {
        assert.equal(resolveOmpBin(), "/my/custom/omp");
      } finally {
        if (savedOmpBin === undefined) delete process.env.OMP_BIN;
        else process.env.OMP_BIN = savedOmpBin;
        process.resourcesPath = savedRp;
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("finds dev staged binary (omp-<platform>-<arch>) in bin/", async () => {
    const tmp = await makeFakeResources(["bin"]);
    try {
      const devBin = join(tmp, "bin", `omp-${process.platform}-${process.arch}`);
      await writeFile(devBin, "#!/bin/sh\n", { mode: 0o755 });
      const result = await withoutOmpBin(() => withResourcesPath(tmp, () => resolveOmpBin()));
      assert.equal(result, devBin);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("packaged binary (bin/omp) takes priority over dev staged", async () => {
    const tmp = await makeFakeResources(["bin"]);
    try {
      const packed = join(tmp, "bin", "omp");
      const staged = join(tmp, "bin", `omp-${process.platform}-${process.arch}`);
      await writeFile(packed, "#!/bin/sh\n", { mode: 0o755 });
      await writeFile(staged, "#!/bin/sh\n", { mode: 0o755 });
      const result = await withoutOmpBin(() => withResourcesPath(tmp, () => resolveOmpBin()));
      assert.equal(result, packed);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it("falls back to 'omp' on PATH and emits WARNING when no binary found", async () => {
    const tmp = await makeFakeResources(); // no bin/ subdir → no binary
    try {
      const chunks = [];
      const origWrite = process.stderr.write.bind(process.stderr);
      process.stderr.write = (s, ...rest) => {
        chunks.push(String(s));
        return origWrite(s, ...rest);
      };
      try {
        const result = await withoutOmpBin(() => withResourcesPath(tmp, () => resolveOmpBin()));
        assert.equal(result, "omp");
        assert.ok(
          chunks.some((c) => c.includes("WARNING")),
          `expected WARNING on stderr, got: ${JSON.stringify(chunks)}`,
        );
      } finally {
        process.stderr.write = origWrite;
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

// ── ompChildEnv ───────────────────────────────────────────────────────────────

describe("ompChildEnv", () => {
  it("sets PI_CODING_AGENT_DIR to a non-empty string", () => {
    const env = ompChildEnv();
    assert.ok(
      typeof env.PI_CODING_AGENT_DIR === "string" && env.PI_CODING_AGENT_DIR.length > 0,
      `PI_CODING_AGENT_DIR should be non-empty, got: ${env.PI_CODING_AGENT_DIR}`,
    );
  });

  it("includes existing process.env keys", () => {
    const env = ompChildEnv();
    // HOME or USERPROFILE is always present on any platform
    const hasHome = "HOME" in env || "USERPROFILE" in env || "HOMEPATH" in env;
    assert.ok(hasHome, "expected a home env key in ompChildEnv output");
  });

  it("extra values are passed through", () => {
    const env = ompChildEnv({ MY_TEST_KEY: "hello-world" });
    assert.equal(env.MY_TEST_KEY, "hello-world");
  });

  it("extra can override PI_CODING_AGENT_DIR", () => {
    const env = ompChildEnv({ PI_CODING_AGENT_DIR: "/override/agent-dir" });
    assert.equal(env.PI_CODING_AGENT_DIR, "/override/agent-dir");
  });
});
