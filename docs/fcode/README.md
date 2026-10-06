# Fcode — Developer Reference

Fcode is a desktop AI coding agent for Frappe/ERPNext developers. It forks [PI-Desktop](https://github.com/vastsa/PI-Desktop) and replaces the agent brain with [omp (oh-my-pi)](https://github.com/can1357/oh-my-pi), adds a supervised local bench, an in-app file editor (Chat → Files), and Studio/Builder canvas integration.

---

## Build from source

### Prerequisites

| Tool | Minimum | Install |
| --- | --- | --- |
| Node.js | `>= 22.19` | [nodejs.org](https://nodejs.org/) |
| pnpm | `>= 10` | `npm i -g pnpm` |
| Rust (stable) | latest stable | [rustup.rs](https://rustup.rs/) |
| Bun | `>= 1.2` | [bun.sh](https://bun.sh/) |

omp is vendored at `omp/` (a diverged snapshot of oh-my-pi; see [ADR 0307](../adr/0307-vendor-omp-snapshot.md)). `scripts/build-omp.mjs` installs its dependencies and compiles its native addon on first run (slow when cold: ~40 min on x64).

**Supported platforms:** macOS, Linux, and Windows are all packaged by the release pipeline. The Bench tab requires macOS, Linux, or WSL2 — Frappe bench is not supported natively on Windows. On Windows, PATH is inherited from the parent process rather than sourced from a login shell.

### Clone and build

```bash
git clone https://github.com/Coale-Tech/fcode.git
cd fcode
pnpm install
pnpm -C apps/desktop run build:host-release   # cargo build --release → pi-desktop-host-core
node scripts/build-omp.mjs                    # builds omp binary from omp/
pnpm -C apps/desktop run dist                 # electron-builder → apps/desktop/release/
```

### Development

```bash
pnpm dev
```

### Validation (must pass before every commit)

```bash
pnpm typecheck
node scripts/check-architecture.mjs   # index.ts ≤ 1500 LOC; new .ts/.tsx ≤ 800 LOC
pnpm lint:biome
node scripts/check-legal.mjs          # identity-keeplist assertion
```

### Contributor path (paved road)

```bash
pnpm fcode:doctor   # checks Node, pnpm, Rust, Bun, vendored omp/, platform
pnpm fcode:dev      # runs the full dev setup in sequence
```

`fcode:doctor` warns on Windows (Bench tab unavailable natively) and fails fast on missing toolchain prerequisites.

---

## Bridge architecture

```
Fcode (Electron)
├── renderer (React)      ← IPC via IPC_WHITELIST preload bridge
├── main process
│   ├── agent-sidecar.ts  ← launches omp-bridge as a Node child via ELECTRON_RUN_AS_NODE
│   ├── agent-host-bridge.ts  ← maps omp RPC frames → AgentEvent union
│   ├── bench/supervisor.ts   ← manages bench children (start, watch-studio, one-shots)
│   └── bench/discovery.ts    ← scans ~/ERPNext (and configured roots) for benches
└── packages/omp-bridge/  ← NEW: speaks PI-Desktop NDJSON JSON-RPC ↔ omp --mode rpc
        bridge.ts         ← spawns omp, negotiates protocol v2, maps methods + events
        sessions.ts       ← persists sessionId → omp session dir mapping
        state.ts          ← holds per-session pending request map
        ui-requests.ts    ← maps extension_ui_request frames to ToolPermissionRequest/AskToolRequest/editor textarea/set_editor_text

omp --mode rpc (child process)
  ↑ spawned with --approval-mode always-ask --config <dataDir>/omp-overlay.yml
  ↑ NDJSON JSON-RPC v2 on stdin/stdout
  ↑ host tools: fcode_bench_execute, fcode_bench_run, fcode_canvas, fcode_canvas_read
```

### Protocol handshake

1. omp emits `ready {protocolVersion:1, supportedProtocolVersions:[1,2], maxFrameBytes, maxReassembledFrameBytes}`
2. Bridge replies `negotiate_protocol {protocolVersion:2}`
3. omp confirms `{protocolVersion:2}` — if it doesn't, the bridge emits a `system` warning and keeps the session read-only
4. Large frames are chunked as `rpc_chunk {chunkId, index, count, byteLength, data}` (base64, 256 KB each); the bridge reassembles before mapping

The smoke test in `apps/desktop/test/omp-protocol-smoke.test.mjs` asserts exactly protocol version 2 is negotiated and that the bundled binary was built from the current `omp/` source (`omp.build.json` `sourceHash` vs `git ls-files -s omp`; `git add omp` after editing). This test is in `apps/desktop/test/` (not `scripts/e2e-*.mjs`) because only that location is executed by `release.yml` (`pnpm -r --if-present test`).

### omp overlay (`<dataDir>/omp-overlay.yml`)

Written by the bridge before spawning omp. Writing it is fatal to the spawn — if the file cannot be written, the bridge refuses to start omp and settles the turn with a `system` message naming the path and reason (never silently falls back to omp's `yolo` default).

```yaml
skills:
  customDirectories: ["<resourcesPath>/fcode-skills"]
  enableClaudeUser: true
browser:
  enabled: true
  headless: true
  screenshotDir: "<dataDir>/screenshots"
  relay: false
tools:
  approval:
    fcode_bench_execute: allow        # read-only method prefixes only; mutating paths prompt
    fcode_bench_run: always-ask       # state-changing verbs always prompt
    fcode_canvas_read: allow          # snapshot/console/screenshot — read-only
```

### Host tools registered by the bridge

All host tools default to `exec` tier in omp's approval model (`ExtensionToolWrapper`, `wrapper.ts:285-296`). `fcode_canvas_read` and the read-only method prefixes of `fcode_bench_execute` are pinned to `allow` in the overlay above; everything else prompts under `--approval-mode always-ask`.

| Tool | Purpose |
| --- | --- |
| `fcode_bench_execute {site?, method, kwargs?}` | `bench --site <site> execute <method> --kwargs <json>`. Auto-approved only for read-only prefixes: `frappe.client.get`, `frappe.client.get_list`, `frappe.db.get_value`, `frappe.db.count`, `frappe.utils.*`, and `get_*`/`list_*` members of `studio.api.*` and `builder.api.*`. All other methods prompt. |
| `fcode_bench_run {site?, command, args?}` | Runs one allow-listed verb through the supervisor: `migrate`, `clear-cache`, `build`, `build-studio-app`, `list-apps`, `install-app`. Always prompts. **Not a security boundary** — omp's own `bash` tool can run `bench` regardless. |
| `fcode_canvas {action, …}` | Drives the Build tab's `WebContentsView` via `BrowserHost`: `navigate`, `reload`, `click`, `fill`, `evaluate`. Always prompts. |
| `fcode_canvas_read {action, …}` | Read-only canvas actions: `snapshot`, `console`, `screenshot`. Auto-approved. |

---

## Release build

```bash
node scripts/build-omp.mjs            # build omp binary from omp/
pnpm -C apps/desktop run dist:mac     # electron-builder → DMG + blockmap
```

The release is gated by:
- `pnpm typecheck` + `node scripts/check-architecture.mjs` + `pnpm lint:biome`
- `node scripts/check-legal.mjs` — asserts `NOTICE.md` exists and contains the "Forked from" attribution and LGPL declaration, and that `docs/fcode/commercial-control-point.md` exists
- `apps/desktop/test/omp-protocol-smoke.test.mjs` — spawns the bundled omp binary, completes the `ready → negotiate_protocol {protocolVersion:2}` handshake, asserts v2 is negotiated

After packaging, verify the signed bundle:

```bash
codesign -dv --verbose=4 "apps/desktop/release/mac-arm64/Fcode.app" 2>&1 | grep -E "Identifier|Authority"
spctl -a -t exec -vv "apps/desktop/release/mac-arm64/Fcode.app"
ls -l "apps/desktop/release/mac-arm64/Fcode.app/Contents/Resources/bin/omp"
APP="apps/desktop/release/mac-arm64/Fcode.app"; RT="$(mktemp -d)"
HOME="$RT/home" XDG_DATA_HOME="$RT/xdg" "$APP/Contents/Resources/bin/omp" --smoke-test
```

Identifier must be `com.coaletech.fcode`, `spctl` must report accepted, the omp binary must be present, and `--smoke-test` must exit 0.

Launch the verified build through the window manager (`open apps/desktop/release/mac-arm64/Fcode.app`), not from the terminal — a terminal launch inherits the shell's `PATH`.

---

## Test matrix

| Suite | Command | Runs in CI |
| --- | --- | --- |
| Bridge unit (vitest) | `pnpm -C packages/omp-bridge test` | yes (`pnpm -r --if-present test`) |
| Protocol smoke | `node --test apps/desktop/test/omp-protocol-smoke.test.mjs` | yes (same) |
| Desktop unit (node --test) | `pnpm -C apps/desktop test` | yes |
| Package smoke | `pnpm -C packages/<pkg> test` | yes |
| Desktop typecheck | `pnpm --filter @pi-desktop/desktop typecheck` | yes (`ci.yml`) |
| Architecture budget | `node scripts/check-architecture.mjs` | yes |
| Identity keeplist | `node scripts/check-legal.mjs` | yes (release verify job) |

The 52 `scripts/e2e-*.mjs` Electron integration tests do **not** run in any CI workflow (`ci.yml` and `release.yml` both omit `pnpm test:e2e`). Run them locally for manual verification only.

---

## Common failures

### `pnpm -C apps/desktop run build:host-release` fails

The Rust host-core build (`cargo build -p host-core --release`) requires a stable Rust toolchain. Run `rustup update stable` and retry. Cold builds take several minutes.

### Bridge hangs at startup

The bridge settles the turn with a `system` message and never hangs on:
- `SpawnENOENT` — omp binary not found at `<resourcesPath>/bin/omp`, `$OMP_BIN`, or `PATH`
- Handshake timeout — omp did not emit `ready` within the timeout
- Frame-reassembly failure — a chunk stream was abandoned

If the binary is not found, the chat surface shows a blocking panel naming the three probed paths and offers "Choose binary…". Enable raw-frame logging with `FCODE_BRIDGE_TRACE=1` to log all omp frames to `<dataDir>/bridge-trace.ndjson`.

### Protocol version is 1, not 2

If `negotiate_protocol` does not return `{protocolVersion:2}`, the bridge emits a `system` warning and keeps the session read-only. This means the bundled omp binary is too old — rebuild with `node scripts/build-omp.mjs`.

### Bench not found

Discovery scans `~/ERPNext` at launch. If your benches live elsewhere, click **Choose bench folder…** on the Bench page (or **Bench folder…** above the bench table); the choice is saved in `bench-roots.json` in Fcode's data folder and replaces `~/ERPNext`. You can pick the folder that holds your benches or a single bench folder. `FCODE_BENCH_ROOTS` (paths separated by `:`, or `;` on Windows) overrides both. A bench is a directory containing both `apps/` and `sites/`. Known failure conditions:

| Condition | Problem | Fix |
| --- | --- | --- |
| `bench` not on PATH | PATH not inherited from a login-shell env; or bench is not installed | Run Fcode from the terminal, or ensure bench's `bin/` is on your PATH |
| Wrong Python env | virtualenv not activated (POSIX) | Ensure `.bashrc`/`.zshrc` activates the virtualenv; PATH is inherited directly on Windows |
| Port already bound | another bench is running | Stop the other process or change `webserver_port` in `sites/common_site_config.json` |
| Redis down | `redis-server` not running | `brew services start redis` |
| MariaDB down | `mysql.server` not running | `brew services start mariadb` |
| Site missing | `sites/<name>` directory doesn't exist | Run `bench new-site <name>` |
| `developer_mode` off | Studio watch and Builder file export disabled | Set `developer_mode: 1` in `sites/<name>/site_config.json` |
| App not installed | `studio`/`builder` not in `bench list-apps` | `bench get-app <app> && bench --site <site> install-app <app>` |

### Bench version shown as "unparseable"

If `apps/frappe/frappe/__init__.py` does not contain a parseable `__version__`, the bench is badged as "unparseable" — it is never silently coerced to v16. Fix the bench's Frappe installation.

---

## PI-Desktop → Fcode naming map

Internal identifiers (`@pi-desktop/*` package names, `pi-desktop/*` IPC channels, `pi-desktop-host-core` binary) are unchanged for upstream compatibility. User-facing strings use the Fcode name.

| PI-Desktop identifier | Fcode display | Notes |
| --- | --- | --- |
| `@pi-desktop/desktop` | Fcode | package name unchanged |
| `pi-desktop/*` IPC channels | unchanged | internal; not user-visible |
| `pi-desktop-host-core` | unchanged | Rust binary name |
| `net.aiuo.pi-desktop` (appId) | `com.coaletech.fcode` | changed in `package.json` |
| `PI-Desktop` (productName) | `Fcode` | changed in `package.json` |
| `~/.pi-desktop` (data dir) | `~/.fcode` | changed in `data-paths.ts` |
| `~/.pi-desktop-dev` (dev data) | `~/.fcode-dev` | changed in `data-paths.ts` |

User-facing error strings map `pi-desktop` → `Fcode`. Internal log lines, IPC channel names, and stack traces retain the upstream identifiers.

---

## omp provider configuration

Fcode does not manage API credentials — omp handles them through its own config. The first-run flow shows `ProviderSetupDialog` which triggers omp's login providers. For custom base URLs (Ollama, enterprise proxy, OpenAI-compatible endpoints):

```yaml
# ~/.omp/config.yml  (or the project-level .omp/config.yml)
providers:
  - id: custom
    baseUrl: https://your-endpoint/v1
    apiKey: "${CUSTOM_API_KEY}"
```

Restart Fcode after changing the omp config. The model menu is populated from `omp.models.list` at session open; it is not PI-Desktop's provider catalog.

---

## Memory

Fcode exposes omp's two memory backends through the **Settings → Memory** tab (Agent group).

### Backends

| Backend | Description | Default |
| --- | --- | --- |
| `mnemopi` | Local SQLite + vector store, runs inside the omp child process. No external service required. | ✓ |
| `hindsight` | Remote HTTP service (connect-only; no managed local server in this phase). Requires a URL, optional bank name, and an auth token. | — |

Changing the backend restarts the active omp session (same path as other overlay changes).

### Config and token handling

Backend selection and Hindsight connection details (`url`, `bank`) are stored in the host kv namespace `memory` and written into `omp-overlay.yml` by `packages/omp-bridge/src/bridge.ts` before omp starts. The Hindsight auth token is **never written to the overlay file** — it is passed to the omp child as the `HINDSIGHT_TOKEN` environment variable.

`mnemopi.llmMode` is always set to `session` in the Fcode overlay so memory extraction uses the session's active model instead of a separate role-chain model.

### Health card

The Memory settings page shows a live status card polled every **15 s** (60 s while the page is not open). Possible states:

| State | Meaning |
| --- | --- |
| `off` | Backend is `none` or not configured |
| `starting` | First poll in progress |
| `ok` | Active, writable, searchable, latency ≤ 2 s |
| `degraded` | Active but not writable/searchable, or latency > 2 s |
| `error` | Error returned, or 3 consecutive poll failures |

A sidebar badge reflects the state colour outside Settings. The Hindsight probe uses `GET /v1/default/banks/{bank}/memories/list?limit=1` with a 2 s timeout; a 404 means reachable but bank missing (`degraded`).

See [ADR 0308](../adr/0308-memory-backends.md) for the full design rationale.

---

## omp Settings Groups

Fcode exposes four groups of omp runtime settings in **Settings → AI** (below the prompt enhancement card). Settings persist in `<dataDir>/omp-settings.json`; changes take effect after the sidecar restarts (same path as approval mode and memory).

| Group | Key prefix | Controls |
| --- | --- | --- |
| Task Subagents | `task.*`, `isolation.*`, `worktree.*` | git-worktree isolation, backend, concurrency, recursion depth |
| Eval & Python | `eval.*`, `python.*` | Python/JS eval backends, kernel mode, interpreter path |
| Browser | `browser.*` | Playwright headless toggle, CDP URL, relay |
| Collab | `collab.*` | Relay URL, web URL, display name, auto-start mode |

The host validates every key against the omp schema (type, enum values, numeric range) before writing. Unknown keys and out-of-range values are rejected. `task.agentModelOverrides` is intentionally excluded — it is a free-form agent→model map best managed via the omp `/agents` hub.

Validated settings are serialised as JSON and passed to the bridge process as `FCODE_OMP_SETTINGS`, where `makeOmpOverlay` merges them into the appropriate YAML sections.

---


## Compatibility table

| Fcode release | Pinned omp commit | Bridge protocol | Frappe v15 | Frappe v16 | Frappe v17 |
| --- | --- | --- | --- | --- | --- |
| 0.15.7-fcode.1 (preview) | — | — | not tested | not tested | not tested |
| 0.15.7-fcode.2 (preview) | `ba344f5e69f2` | v2 (v1 read-only fallback) | not tested | not tested | not tested |
| 0.16.0 | `ba344f5e69f2` | v2 (v1 read-only fallback) | not tested | not tested | not tested |
| 0.17.0 | `ba344f5e69f2` | v2 (v1 read-only fallback) | not tested | not tested | not tested |
| 0.17.1 | `ba344f5e69f2` | v2 (v1 read-only fallback) | not tested | not tested | not tested |
| 0.18.2 | `ad66aa91e6e7` | v2 (v1 read-only fallback) | not tested | not tested | not tested |
| 0.18.3 | `ad66aa91e6e7` | v2 (v1 read-only fallback) | not tested | not tested | not tested |
| 0.18.4 | `ad66aa91e6e7` | v2 (v1 read-only fallback) | not tested | not tested | not tested |
| 0.18.5 | `ad66aa91e6e7` | v2 (v1 read-only fallback) | not tested | not tested | not tested |

The protocol smoke test (`apps/desktop/test/omp-protocol-smoke.test.mjs`) asserts that the pinned omp binary negotiates exactly protocol version 2. A pinned commit that stops offering v2 fails the release gate automatically.

---

## Recurring maintenance operations

### Rebase on upstream PI-Desktop

```bash
git remote add upstream https://github.com/vastsa/PI-Desktop.git
git fetch upstream
git rebase upstream/main
# run the protocol smoke test after every rebase
node --test apps/desktop/test/omp-protocol-smoke.test.mjs
pnpm -C apps/desktop test
```

### Bump the pinned omp commit

1. Update the SHA constant in `scripts/build-omp.mjs`.
2. Run `node scripts/build-omp.mjs` to rebuild the binary.
3. Run `node --test apps/desktop/test/omp-protocol-smoke.test.mjs` — it must negotiate v2.
4. Commit both the script change and the rebuilt binary.

---

## TTHW (time to hello world)

- **~4 minutes** when a Frappe bench already exists under `~/ERPNext`.
- **Unbounded** when Frappe itself is not installed — Fcode discovery will report zero benches and display copy-paste `bench init` and `bench new-site` commands, but installing Frappe is outside the app's control.

There is no network telemetry. First-run step completion is tracked locally via the `OnboardingChecklist` store.
