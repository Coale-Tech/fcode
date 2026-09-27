import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// Same failure mode as issue #507 (see agent-runtime-bundle-package.test.mjs):
// packaged installs copy packages/omp-bridge/dist-bundle to resources/omp-bridge
// via electron-builder extraResources. The esbuild output is ESM (.js entry +
// import banner), but Node resolves module type from the nearest package.json.
// Without dist-bundle/package.json declaring "type":"module", bridge.js loads
// as CommonJS and dies at startup.
//
// Tradeoff: the unit suite asserts the bundle-script contract (source + a
// real execution of the chained write step in a temp dir) instead of running
// full esbuild, for the same reason as agent-runtime's suite — a full bundle
// depends on a freshly built packages/shared/dist and takes multi-second CPU
// time, which is too heavy/flaky for this runner.

const desktopPackageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const ompBridgePackageJson = JSON.parse(
  await readFile(
    new URL("../../../packages/omp-bridge/package.json", import.meta.url),
    "utf8",
  ),
);

const bundleScript = ompBridgePackageJson.scripts.bundle ?? "";

test("desktop packaging ships the whole omp-bridge dist-bundle directory", () => {
  const entry = desktopPackageJson.build.extraResources.find(
    (resource) => resource.to === "omp-bridge",
  );

  assert.deepEqual(
    entry,
    {
      from: "../../packages/omp-bridge/dist-bundle",
      to: "omp-bridge",
    },
    "extraResources must copy dist-bundle (including its package.json) to resources/omp-bridge",
  );
});

test("omp-bridge bundle emits an ESM bridge entry", () => {
  assert.match(bundleScript, /esbuild\b/);
  assert.match(bundleScript, /--format=esm\b/);
  assert.match(bundleScript, /--outfile=dist-bundle\/bridge\.js\b/);
});

test("omp-bridge bundle writes dist-bundle/package.json with type module", () => {
  // The write must be chained after esbuild so a successful bundle always
  // produces the ESM marker that electron-builder will ship beside bridge.js.
  assert.match(
    bundleScript,
    /&&/,
    "bundle must chain the package.json write after esbuild so it cannot be skipped on success",
  );
  assert.match(
    bundleScript,
    /dist-bundle\/package\.json/,
    "bundle must write dist-bundle/package.json",
  );
  // Accept either JSON ("type":"module") or a JS object literal
  // ({ type: 'module' }) inside the chained node -e write.
  assert.match(
    bundleScript,
    /(?:["']type["']|type)\s*:\s*["']module["']/,
    'dist-bundle/package.json must set "type":"module"',
  );
});

test("the chained write step produces a package.json Node will treat as ESM", async () => {
  const writeStep = bundleScript
    .split("&&")
    .map((part) => part.trim())
    .find((part) => part.includes("dist-bundle/package.json"));

  assert.ok(
    writeStep,
    "bundle script must contain a chained write step for dist-bundle/package.json",
  );

  const workDir = await mkdtemp(join(tmpdir(), "pi-omp-bridge-bundle-"));
  try {
    await mkdir(join(workDir, "dist-bundle"), { recursive: true });

    // Execute the real write command from package.json against a scratch
    // dist-bundle so the payload (not just the source string) is validated.
    execFileSync("bash", ["-c", writeStep], {
      cwd: workDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const written = JSON.parse(
      await readFile(join(workDir, "dist-bundle/package.json"), "utf8"),
    );
    assert.equal(
      written.type,
      "module",
      'dist-bundle/package.json must declare {"type":"module"} so bridge.js loads as ESM',
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
});
