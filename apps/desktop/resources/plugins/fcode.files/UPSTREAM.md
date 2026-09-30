# Fcode Files plugin — upstream provenance

`fcode.files` is a Fcode-owned source fork of the MIT-licensed
`pi.file-manager` plugin by Tioit-Wang.

## Upstream origin

| Field | Value |
| --- | --- |
| Repository | https://github.com/Tioit-Wang/pi-desktop-plugin-file-manager |
| Tag | `v0.5.2` |
| Commit | `d36ebe9f7fb82ee71e87670b0a65403660b18a00` |
| License | MIT (see `LICENSE`) |

## Fork changes from upstream v0.5.2

1. **Plugin identity**: `id` → `fcode.files`; name → "Files". View id `manager` unchanged.
2. **Version suffix**: `0.5.2-fcode.1` — marketplace cannot auto-update this ID.
3. **Dirty-draft persistence** (`main.js`):
   - `fm.draft.save` — atomic write (unique temp name + rename, temp removed on failure); stores disk-version `expectedMtimeMs`/`expectedSize`, the `expectedAbsent` sentinel, and `root` + `rel` so drafts can be listed.
   - `fm.draft.load` — reads draft WITHOUT deleting it; draft survives multiple loads until explicit discard.
   - `fm.draft.list` — drafts for the CURRENT root only, newest first, bounded (20; scans at most 500 files).
   - `fm.draft.discard` — explicit cleanup after successful save, user discard, or rename/move of the open file.
   - Draft key: SHA-256(root + NUL + rel)[0:40] — `root` is the one the view sends (the root the buffer was read from; `fm.read` returns it), falling back to the selected root. Bounded (40 hex chars), cross-root collision-free. Credential-denied paths are refused.
4. **Write guards** (`handleWrite`): the view sends `root`; if it is not the current root the write returns `ROOT_CHANGED` (a project switch during a dirty buffer can never write into another project). `expectedAbsent: true` and file now exists → CONFLICT (stale new-file draft cannot overwrite an agent-created file). A numeric `expectedMtimeMs` with the file gone → CONFLICT `deleted: true` (a Review rollback cannot be silently undone by a stale buffer); the conflict dialog's "overwrite" resends with `expectedAbsent: true` for that case and with the fresh disk mtime/size otherwise.
5. **View wiring** (`views-src/src/`): `App.tsx` saves a draft ~1 s after every dirty change, every 30 s while dirty, on `visibilitychange`/`pagehide`, and before the dirty-guard dialog; on start, with no file open and no host request queued, it opens the newest `fm.draft.list` entry through `openEntry`; `openEntry` restores a differing draft as the initial editor document (dirty, with the draft-time disk lock, so a file changed in between conflicts on save); a successful save, an explicit discard, or a rename/move of the open file removes the draft. `rpc.ts` carries the channel constants and types; `openFile.ts` carries `expectedAbsent` and `root`.
6. **`views-src/`** is the upstream React source at this commit (`<title>` changed to "Files").

## Rebuilding the view

`views/assets/index.js` is built from `views-src/` (Vite 5, IIFE output to `../views/`). `views-src` has its own lockfile and is not a member of the repository pnpm workspace, so install in isolation:

```
cd views-src && pnpm install --ignore-workspace --frozen-lockfile && pnpm build
```

## Checksums (sha256)

| File | Bytes | sha256 |
| --- | --- | --- |
| upstream `pi.file-manager views/assets/index.js` | 1345417 | `d0a1dc369764bed2ab12ce0e65fe983fe0b4f9919f2f8ff4546b736208d66dac` |
| `fcode.files views/assets/index.js` (this build) | 1346626 | `76a020be0cab0a9f226405474cadb3117e29f84213f5ced936befabc848f1a8b` |
