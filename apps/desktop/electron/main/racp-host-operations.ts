import { RacpError } from "@pi-desktop/agent-host";
import { createHostOperations } from "@pi-desktop/host-runtime";
import type { RacpHostOperations } from "@pi-desktop/racp";

import type { BrowserHost } from "./browser-host.js";
import { withAgentCanvasOwnership } from "./browser-host.js";
import { createBenchControl } from "./ipc/bench-ipc.js";
import type { BenchControlDeps } from "./ipc/bench-ipc.js";
import { addWorktree, clearWorktree, listWorktrees } from "./ipc/omp-ipc.js";
import type { HostProcess } from "./host-process.js";

export type DesktopOperationsDeps = {
  getHost: () => HostProcess | null;
  isSessionBusy: (sessionId: string) => boolean;
  compact: (sessionId: string) => Promise<{ accepted: boolean }>;
  bench: BenchControlDeps;
  browserHost?: BrowserHost | null;
  browseRoot?: string;
};

export function createDesktopHostOperations(deps: DesktopOperationsDeps): RacpHostOperations {
  const base = createHostOperations({
    getHost: deps.getHost,
    runtime: { isBusy: deps.isSessionBusy, compact: deps.compact },
    browseRoot: deps.browseRoot,
  });

  const benchControl = createBenchControl(deps.bench);

  const canvas: RacpHostOperations["canvas"] = deps.browserHost
    ? buildCanvas(deps.browserHost)
    : undefined;

  return {
    ...base,
    worktrees: {
      list: () => listWorktrees(),
      add: ({ repoPath, branch, create }) => addWorktree(repoPath, branch, create),
      remove: ({ path, force }) => clearWorktree(path, force ?? false),
    },
    bench: benchControl,
    ...(canvas ? { canvas } : {}),
  };
}

function buildCanvas(bh: BrowserHost): NonNullable<RacpHostOperations["canvas"]> {
  return {
    snapshot: bh.snapshot.bind(bh),
    screenshot: bh.screenshot.bind(bh),
    async act(input) {
      return withAgentCanvasOwnership(bh, async () => {
        switch (input.action) {
          case "navigate": {
            if (!input.url) throw new RacpError("INVALID_ARGUMENT", "navigate requires url");
            await bh.navigate({ url: input.url });
            return { ok: true as const };
          }
          case "reload": {
            bh.action("reload");
            return { ok: true as const };
          }
          case "click": {
            if (!input.uid) throw new RacpError("INVALID_ARGUMENT", "click requires uid");
            await bh.click(input.uid);
            return { ok: true as const };
          }
          case "fill": {
            if (!input.uid) throw new RacpError("INVALID_ARGUMENT", "fill requires uid");
            await bh.fill(input.uid, input.text ?? "");
            return { ok: true as const };
          }
        }
      });
    },
  };
}
