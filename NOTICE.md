# NOTICE

Fcode is a fork of **PI-Desktop** (https://github.com/vastsa/PI-Desktop), distributed under
the GNU Lesser General Public License, version 3.0 (LGPL-3.0).

## Forked from

https://github.com/vastsa/PI-Desktop

This repository was forked from the PI-Desktop project. The original work is the property of
its respective contributors and is used here under the terms of the LGPL-3.0 license, a copy
of which is provided in the `LICENSE` file at the root of this repository.

## Modifications

This fork modifies PI-Desktop in the following ways (required notice under LGPL-3.0 §4a):

- **Agent brain replaced**: The `packages/agent-runtime` Pi-AI sidecar is no longer the
  active agent runtime. A new `packages/omp-bridge` Node package drives an `omp` (oh-my-pi)
  child process via `omp --mode rpc` instead.
- **New pages added**: Code (Monaco editor), Build (Studio/Builder canvases), and Bench
  (bench cockpit and supervisor) pages have been added to the Electron shell.
- **Bench subsystem**: A new `apps/desktop/electron/main/bench/` module handles bench
  discovery, supervision, and one-shot commands.
- **IPC extensions**: New channels have been added to `packages/shared/src/protocol.ts` for
  bench management and file writing.
- **Fork identity**: Application IDs, product names, artifact names, and release URLs have
  been updated to Coale-Tech/fcode.
- **Release pipeline**: The `.github/workflows/release.yml` signing and notarization steps
  have been re-targeted to Coale-Tech's Developer ID and the `Coale-Tech/fcode` GitHub
  repository.

A full list of changed files is available via `git log` in this repository.

## Bundled third-party software

### omp (oh-my-pi)

The `omp` binary bundled in the release artifacts is built from source vendored at `omp/`.
It is a pruned snapshot of the [oh-my-pi](https://github.com/can1357/oh-my-pi) project at
commit `ba344f5e69f28535e7e9a2cf09e5af3643861b73`, modified by Fcode and no longer synced
with upstream. oh-my-pi is distributed under the MIT License (full text in `omp/LICENSE`).

```
MIT License

Copyright (c) 2025 Mario Zechner
Copyright (c) 2025-2026 Can Bölük
Copyright (c) 2026 Stencil Labs, Inc.
Copyright (c) oh-my-pi contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### FileBird

The FileBird SFTP client embedded in Fcode (nav rail page and the integrated terminal's
PTY service) is vendored at `apps/filebird` from commit
`93b562f51727300582ca1884c80a7cb2bcde9653`, with the embedding changes described in
ADR 0309. FileBird is distributed under the MIT License (full text in
`apps/filebird/LICENSE`).

```
MIT License

Copyright (c) 2026 titansoftlimited

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Frappe skill packs

`apps/desktop/resources/skill-packs/` holds offline snapshots of two skill repositories.
At runtime Fcode clones the live repositories into `<dataDir>/skills/` and keeps them updated;
the snapshots are used only until the first clone succeeds.

- `frappe-skills/` — [frappe/skills](https://github.com/frappe/skills), the Frappe team's official
  agent skills, at commit `0bef982e933705c30706efc1db3bc3bc5e7aca62`. The repository publishes no
  licence file; copyright remains with Frappe Technologies and its contributors.
- `frappeskills/` — [Coale-Tech/frappeskills](https://github.com/Coale-Tech/frappeskills) at commit
  `11ff8758a412a8906859e6215c674dc9c1358115`. Its own `NOTICE` credits frappe/skills and
  [lubusIN/frappe-skills](https://github.com/lubusIN/frappe-skills), the latter under the MIT License
  (full text in `frappeskills/LICENSES/frappe-skills-lubusIN-MIT.txt`).
