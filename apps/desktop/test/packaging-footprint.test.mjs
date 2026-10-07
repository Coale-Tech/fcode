import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const sharedPackageJson = JSON.parse(
  await readFile(new URL("../../../packages/shared/package.json", import.meta.url), "utf8"),
);
const macOpenFixNote = await readFile(
  new URL("../PI-Desktop-macOS-opening-help.txt", import.meta.url),
  "utf8",
);
const macOpenScript = await readFile(
  new URL("../PI-Desktop-macOS-open.command", import.meta.url),
  "utf8",
);
const macOpenScriptStat = await stat(
  new URL("../PI-Desktop-macOS-open.command", import.meta.url),
);
const dmgBackground = await readFile(
  new URL("../build/dmg-background.png", import.meta.url),
);
const dmgBackgroundRetina = await readFile(
  new URL("../build/dmg-background@2x.png", import.meta.url),
);
const viteConfigSource = await readFile(
  new URL("../electron.vite.config.ts", import.meta.url),
  "utf8",
);
const preloadSource = await readFile(
  new URL("../electron/preload/index.ts", import.meta.url),
  "utf8",
);
const pluginPanelPreloadSource = await readFile(
  new URL("../electron/preload/plugin-panel.ts", import.meta.url),
  "utf8",
);

test("packaging installs the updater and FileBird's native runtime dependencies", () => {
  // FileBird (ADR 0309) runs in main: node-pty and the keyring are native.
  assert.deepEqual(Object.keys(packageJson.dependencies).sort(), [
    "@napi-rs/keyring",
    "electron-updater",
    "node-pty",
  ]);

  for (const dependency of [
    "@pi-desktop/agent-runtime",
    "@pi-desktop/i18n",
    "@pi-desktop/plugin-sdk",
    "@pi-desktop/shared",
    "mermaid",
    "pinyin-pro",
    "react",
    "shiki",
  ]) {
    assert.ok(
      packageJson.devDependencies[dependency],
      `${dependency} must be available for bundling without shipping its package tree`,
    );
  }
});

test("renderer output keeps its size controls", async () => {
  // electron-vite's renderer preset hard-defaults minify to false, unlike plain
  // Vite, so leaving it implicit ships unminified chunks.
  assert.match(viteConfigSource, /minify:\s*"esbuild"/);

  // The bundled Chromium supports woff2 universally; woff/truetype src entries
  // would be emitted as assets and never served.
  assert.match(viteConfigSource, /dropLegacyFontFallbacks/);
  assert.match(viteConfigSource, /plugins:\s*\[[^\]]*dropLegacyFontFallbacks\(\)/);

  // build/*.png are electron-builder installer icons (1024px+). The renderer
  // must import the downscaled marks instead.
  const brandLogoSource = await readFile(
    new URL("../src/components/BrandLogo.tsx", import.meta.url),
    "utf8",
  );
  assert.match(brandLogoSource, /"\.\.\/assets\/brand\/logo-light\.png"/);
  assert.match(brandLogoSource, /"\.\.\/assets\/brand\/logo-dark\.png"/);
  assert.doesNotMatch(brandLogoSource, /\.\.\/\.\.\/build\//);
});

test("legacy font fallback stripping only removes redundant fallback sources", () => {
  // Mirror of the pi-drop-legacy-font-fallbacks regex in electron.vite.config.ts.
  const pattern = new RegExp(
    viteConfigSource.match(/code\.replace\(\s*(\/[^\n]+\/g)/)[1].slice(1, -2),
    "g",
  );
  const strip = (css) => css.replace(pattern, "");

  // A KaTeX-shaped face keeps only its woff2 source.
  assert.equal(
    strip('src:url(a.woff2) format("woff2"),url(a.woff) format("woff"),url(a.ttf) format("truetype");'),
    'src:url(a.woff2) format("woff2");',
  );

  // A variable face declaring only woff2-variations must survive untouched.
  const variations = 'src: url("../f.woff2") format("woff2-variations");';
  assert.equal(strip(variations), variations);

  // A face whose only source is a legacy format would otherwise lose every
  // source; the leading comma in the pattern is what protects it.
  for (const soleSource of [
    'src: url(only.woff) format("woff");',
    'src: url(only.ttf) format("truetype");',
  ]) {
    assert.equal(strip(soleSource), soleSource);
  }

  // Stripping must never leave a dangling comma or an empty declaration.
  for (const css of [
    'src:url(a.woff2) format("woff2"),url(a.woff) format("woff");',
    'src:url(a.woff2) format("woff2"),url("data:font/woff;base64,AA)BB") format("woff");',
  ]) {
    const out = strip(css);
    assert.doesNotMatch(out, /,\s*;/);
    assert.doesNotMatch(out, /src:\s*;/);
  }
});

test("main bundles JavaScript dependencies and externalizes only runtime modules", () => {
  assert.doesNotMatch(viteConfigSource, /externalizeDepsPlugin\s*\(/);
  // jiti is listed so the trusted-extension loader's lazy import never
  // enters the main bundle; main itself never loads it (spec 16 §4.2).
  assert.match(
    viteConfigSource,
    /external:\s*\["electron-updater", "jiti", "jiti\/static", "node-pty", "@napi-rs\/keyring"\]/,
  );
});

test("sandbox preload entries use standalone shared subpath bundles", () => {
  const sharedExports = sharedPackageJson.exports ?? {};

  assert.match(preloadSource, /from "@pi-desktop\/shared\/protocol"/);
  assert.match(pluginPanelPreloadSource, /from "@pi-desktop\/shared\/theme"/);
  assert.ok(sharedExports["./protocol"], "protocol must be available as a shared subpath");
  assert.ok(sharedExports["./theme"], "theme must be available as a shared subpath");
  assert.doesNotMatch(preloadSource, /from "@pi-desktop\/shared"/);
  assert.doesNotMatch(pluginPanelPreloadSource, /from "@pi-desktop\/shared"/);
});

test("packaging keeps only shipped locales and excludes non-runtime artifacts", () => {
  assert.deepEqual(packageJson.build.electronLanguages, [
    "en-US",
    "zh-CN",
    // electron-builder uses underscore locale directories in macOS bundles.
    "zh_CN",
    "zh-TW",
    "zh_TW",
    "tr",
    "de",
    "es",
    "fr",
    "ko",
    "pt-BR",
    "pt_BR",
  ]);
  assert.ok(packageJson.build.files.includes("!**/*.map"));
  assert.ok(
    packageJson.build.files.includes(
      "!**/node_modules/*/{test,tests,__tests__,powered-test,example,examples}/**",
    ),
  );
  assert.ok(
    packageJson.build.files.includes(
      "!**/node_modules/**/*.{test,spec}.{js,cjs,mjs}",
    ),
  );
  assert.ok(
    packageJson.build.files.includes(
      "!**/node_modules/node-addon-api/tools/**",
    ),
  );
  assert.ok(
    packageJson.build.files.includes(
      "!**/node_modules/node-addon-api/*.{c,gyp,gypi,h,js,json}",
    ),
  );
  assert.ok(
    packageJson.build.files.includes(
      "!**/node_modules/node-addon-api/README.md",
    ),
  );
  assert.ok(
    !packageJson.build.files.includes("!**/node_modules/node-addon-api/**"),
    "node-addon-api license must not be removed with its build-only files",
  );
  assert.ok(
    packageJson.build.files.every(
      (pattern) => !/LICENSE|NOTICE|\*\.md/.test(pattern),
    ),
    "third-party license and notice files must remain packageable",
  );
  // The omp-bridge dist-bundle mapping must remain a directory copy: the bundle
  // emits dist-bundle/package.json with "type":"module" so the ESM entry loads
  // in packaged installs (issue #507).
  assert.deepEqual(packageJson.build.extraResources, [
    {
      from: "build/icon.png",
      to: "tray-icon.png",
    },
    {
      from: "../../packages/omp-bridge/dist-bundle",
      to: "omp-bridge",
    },
    // Built-in skills stay outside the asar so they read as plain files.
    {
      from: "resources/skills",
      to: "skills",
    },
    // Bundled first-party plugins, for the same reason: host-core reads their
    // manifests from disk and the views are loaded as file:// pages (ADR 0105).
    {
      from: "resources/plugins",
      to: "plugins",
    },
    {
      from: "resources/models.dev",
      to: "models.dev",
    },
    // Fcode-specific skills shipped as a separate resource directory so the
    // overlay can point skills.customDirectories at it without colliding with
    // the PI-Desktop skills format (skills/fcode-skills would not match the
    // overlay path <resourcesPath>/fcode-skills).
    {
      from: "resources/fcode-skills",
      to: "fcode-skills",
    },
    // Offline snapshot of the two Frappe skill packs; live clones in the data
    // dir replace it once the first sync lands (omp-bridge/src/skill-packs.ts).
    {
      from: "resources/skill-packs",
      to: "skill-packs",
    },
    // FileBird's own preload and renderer load as file:// pages in its view (ADR 0309).
    {
      from: "../filebird/out/preload",
      to: "filebird/preload",
    },
    {
      from: "../filebird/out/renderer",
      to: "filebird/renderer",
    },
  ]);
});

test("macOS targets follow the native architecture selected by the runner", () => {
  const macTargets = packageJson.build.mac.target;
  assert.deepEqual(
    macTargets.map((entry) => entry.target),
    ["dmg", "zip"],
  );
  assert.ok(
    macTargets.every((entry) => entry.arch === undefined),
    "macOS targets must not pin the package to Apple Silicon",
  );
  assert.doesNotMatch(packageJson.scripts["dist:mac"], /--(?:arm64|x64)/);
});

test("macOS DMG is a two-icon install; ZIP keeps the unsigned helper", () => {
  assert.deepEqual(packageJson.build.mac.extraDistFiles, [
    "PI-Desktop-macOS-open.command",
    "PI-Desktop-macOS-opening-help.txt",
  ]);
  assert.equal(packageJson.build.dmg.background, "build/dmg-background.png");
  assert.equal(packageJson.build.dmg.icon, "build/icon.icns");
  assert.deepEqual(packageJson.build.dmg.window, { width: 720, height: 440 });
  assert.equal(packageJson.build.dmg.iconSize, 128);
  assert.equal(packageJson.build.dmg.iconTextSize, 12);
  assert.deepEqual(packageJson.build.dmg.contents, [
    { x: 180, y: 196 },
    { x: 540, y: 196, type: "link", path: "/Applications" },
  ]);
  assert.doesNotMatch(
    JSON.stringify(packageJson.build.dmg.contents),
    /PI-Desktop-macOS-open\.command|Open PI-Desktop\.command|opening-help|If app won't open/,
    "the DMG must not expose the unsigned helper or opening note",
  );
  assert.deepEqual([...dmgBackground.subarray(0, 8)], [
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  assert.equal(dmgBackground.readUInt32BE(16), 720);
  assert.equal(dmgBackground.readUInt32BE(20), 440);
  assert.deepEqual([...dmgBackgroundRetina.subarray(0, 8)], [
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  assert.equal(dmgBackgroundRetina.readUInt32BE(16), 1440);
  assert.equal(dmgBackgroundRetina.readUInt32BE(20), 880);
  assert.ok(macOpenScriptStat.mode & 0o111, "opening helper must be executable");
  assert.match(
    macOpenFixNote,
    /xattr -r -d com\.apple\.quarantine \/Applications\/PI-Desktop\.app/,
  );
  assert.match(macOpenFixNote, /trusted PI-Desktop source/);
  assert.match(macOpenFixNote, /Signed and\s+notarized\s+builds do not need/);
  assert.match(macOpenFixNote, /PI-Desktop-macOS-open\.command/);
  assert.match(macOpenScript, /\/Applications\/\$\{APP_BUNDLE_NAME\}/);
  assert.match(macOpenScript, /CFBundleIdentifier/);
  assert.match(macOpenScript, /net\.aiuo\.pi-desktop/);
  assert.match(macOpenScript, /\/usr\/bin\/xattr -r -d com\.apple\.quarantine/);
  assert.match(macOpenScript, /\/usr\/bin\/open/);
  assert.doesNotMatch(macOpenScript, /\bsudo\s+\//);
  assert.doesNotMatch(macOpenScript, /xattr -cr/);
});

test("packaging keeps voice, PTY and keyring native payloads unpacked", () => {
  assert.deepEqual(packageJson.build.asar, { smartUnpack: false });
  assert.deepEqual(packageJson.build.asarUnpack, [
    "node_modules/transcribe-cpp/**/*.node",
    "node_modules/transcribe-cpp/**/bin/**",
    "node_modules/@picovoice/pvrecorder-node/**/*.node",
    "node_modules/@picovoice/pvrecorder-node/**/lib/**",
    "node_modules/node-pty/**",
    "node_modules/@napi-rs/keyring-*/**",
  ]);
});
