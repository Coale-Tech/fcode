# ADR 0309: Embed FileBird and restore an integrated terminal

- Status: Accepted
- Date: 2026-10-04
- Deciders: Fcode core
- Decision: D625
- Supersedes: [ADR 0108](0108-remove-built-in-interactive-terminal.md) (the
  "no interactive shell in the app" clauses 3 and 4 and its consequences)
- Related: [ADR 0170](0170-work-panel-browser-as-bundled-plugin.md) clause 6 ·
  [ADR 0292](0292-ssh-remote-host-bootstrap.md) · E2E-058

## Context

FileBird is a standalone Electron SFTP client (MIT, titansoftlimited): a
local/remote dual-pane file manager with transfers, saved connections, a
keychain-backed secret store, and local and remote terminals built on node-pty
and xterm.js. Users want it inside Fcode's window, from the nav rail, and they
want an interactive terminal under chat like VS Code or Hermes Agent.

ADR 0108 removed the old work-panel PTY so the app would not own a second shell
lifecycle or a native terminal module. FileBird already ships a hardened
terminal service (validated IPC, ack-based flow control, a session cap, an
environment scrub), so taking FileBird means the native module comes back
anyway.

A plugin cannot host FileBird: plugins add no nav pages and run no
main-process code, and ADR 0108's objection to a plugin PTY permission still
holds.

## Decision

1. **FileBird is vendored verbatim** at `apps/filebird` (upstream `93b562f`),
   keeping its own toolchain, tests and build. The only source changes are an
   `installFileBird(host)` entry (`src/main/embed.ts`) that its standalone
   `main.ts` now uses too, a `Session` parameter on its CSP helper, and an
   `?embedded` query that hides its title bar. Its electron-builder packaging is
   dropped; Fcode packages it.
2. **Its UI runs in a main-owned `WebContentsView`**, the Raven pattern
   (ADR 0170 clause 6): partition `persist:filebird`, FileBird's own preload and
   navigation guard, `resources/filebird/renderer/index.html?embedded=1`. A
   full-width `filebird` page reports the hole's bounds and drives visibility;
   the view hides under blocking overlays and off the route.
3. **Its services run in Fcode's main process** through
   `registerFileBirdIpc`, loaded with a dynamic import so a native-module
   failure costs only FileBird and the terminal, never Fcode's startup. Data
   lives in `<dataDir>/filebird`; secrets stay in the OS keychain under service
   `Fcode FileBird`. Every PTY is killed on `before-quit`.
4. **The integrated terminal reuses FileBird's terminal service.** Fcode's
   whitelisted preload gains FileBird's own `terminal:*` channel names, so the
   chat window reaches the same validated handlers; there is no second PTY
   manager. The panel sits under chat (xterm.js, tabs, Ctrl+` or the workspace
   bar button), starts each shell in the active session's workspace, and stays
   mounted while hidden so shells survive navigation. Closing a tab kills its
   shell.
5. **Agent Bash is unchanged** and stays approval-gated; the agent cannot type
   into the user's terminal. There is still no plugin PTY API.
6. **FileBird keeps its own ssh2 client.** ADR 0292's system-`ssh` rule covers
   remote agent hosts; FileBird's SFTP sessions are a separate, user-driven
   surface with their own known-hosts store.

## Consequences

- Desktop packaging carries node-pty, `@napi-rs/keyring` and ssh2 as runtime
  dependencies (native payloads unpacked from the asar) plus FileBird's built
  preload and renderer as extra resources. ssh2's optional `cpu-features`
  binding is skipped (`ignoredOptionalDependencies`); ssh2 falls back without it.
- `pnpm -r build` and `pnpm -r test` include FileBird (452 unit tests).
- Running transfers are cancelled at quit without FileBird's standalone
  "stop transfers?" prompt.

## Alternatives considered

- **Launch FileBird as a separate app from the sidebar** (the earlier option,
  compatible with ADR 0108): rejected by the user in favour of one window.
- **A second, Fcode-owned PTY manager for the terminal:** rejected; it would
  duplicate FileBird's validated service and flow control.
- **FileBird as a plugin:** rejected; see Context.
