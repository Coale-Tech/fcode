/**
 * OmpBridge — main-process integration layer between the omp-bridge sidecar
 * and the rest of the desktop app.
 *
 * Usage: import registerOmpBridgeHandlers and call it with the sidecar after
 * wireSidecar has run. The sidecar.fatal notification is forwarded to the
 * renderer through IPC.event.sidecarFatal so ChatSurface can render the
 * blocking "omp binary not found" panel.
 *
 *   registerOmpBridgeHandlers(sidecar, sendToRenderer);
 */

import { IPC } from "@pi-desktop/shared";
import type { AgentSidecar } from "../agent-sidecar";

export interface SidecarFatalParams {
  /** Short error code, e.g. "ENOENT" */
  code: string;
  /** All three candidate paths that were probed, in resolution order. */
  paths: string[];
  /** Human-readable detail for the blocking panel. */
  detail: string;
}

/**
 * Register an additional onNotification handler on the sidecar that forwards
 * sidecar.fatal events to the renderer via IPC.event.sidecarFatal.
 *
 * Call this once, right after wireSidecar, from the main-process runtime.
 * Multiple onNotification calls are stacked by AgentSidecar and all fire.
 */
export function registerOmpBridgeHandlers(
  sidecar: AgentSidecar,
  sendToRenderer: (channel: string, payload: unknown) => void,
): void {
  sidecar.onNotification((method, params) => {
    if (method === "sidecar.fatal") {
      sendToRenderer(IPC.event.sidecarFatal, params);
    }
    // Other omp-specific notifications can be handled here in future.
  });
}
