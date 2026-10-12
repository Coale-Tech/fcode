# pi-host

Headless Fcode host: host-core + omp-bridge sidecar, served over RACP-WS.
`pi-host` reads the same data-dir files as the desktop (`omp-settings.json`
incl. `advanced`, `approval-mode.json`, `memory.json`) and passes them to the
bridge (see `ompSidecarExtraEnv` in `@pi-desktop/host-runtime`). The omp agent
dir is isolated at `<data-dir>/omp-agent`.

## Environment

| Variable | Purpose |
| --- | --- |
| `FCODE_BENCH_PATH` | Frappe bench for `fcode_bench_*` / `fcode_studio`; also omp's cwd |
| `FCODE_BENCH_SITE` | Default site when a bench tool call omits `site` |
| `HINDSIGHT_API_TOKEN` | Token for the Hindsight memory backend (no secret store on pi-host) |

## Host tools

| Tool | pi-host | Why |
| --- | --- | --- |
| `fcode_bench_execute`, `fcode_bench_execute_read`, `fcode_bench_run`, `fcode_studio` | yes | needs `FCODE_BENCH_PATH` |
| `kanban_*` | yes | offered when `<data-dir>/kanban-settings.json` is `{"enabled":true}`; board at `<data-dir>/kanban-board.json`; no auto-dispatch of workers |
| `BrowserPreview` | desktop only | needs the Electron webview |
| `fcode_canvas`, `fcode_canvas_read` | desktop only | needs the Electron canvas webview |
| `GenerateImages` | desktop only | desktop image service + renderer preview |
| `PluginScaffold`, `PluginCheck`, `PluginPack` | desktop only | desktop plugin runtime |
