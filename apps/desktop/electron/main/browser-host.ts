import type { BrowserState } from "@pi-desktop/shared";
import type { BrowserPane } from "./browser-view";
import { BrowserCdp } from "./browser-cdp";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const BROWSER_PLUGIN_ID = "pi.browser";
export const BROWSER_VIEW_ID = "browser";

export type BrowserRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BrowserNavigateInput = {
  url?: string;
  path?: string;
};

/**
 * Translate a plugin-page hole into window coordinates and clamp it so the
 * guest cannot cover chat/composer outside the calling plugin view.
 */
export function clampGuestBounds(
  view: BrowserRect,
  hole: BrowserRect,
): BrowserRect | null {
  const x = Math.max(view.x, view.x + hole.x);
  const y = Math.max(view.y, view.y + hole.y);
  const right = Math.min(view.x + view.width, view.x + hole.x + hole.width);
  const bottom = Math.min(view.y + view.height, view.y + hole.y + hole.height);
  const width = Math.floor(right - x);
  const height = Math.floor(bottom - y);
  if (width < 1 || height < 1) return null;
  return {
    x: Math.floor(x),
    y: Math.floor(y),
    width,
    height,
  };
}

function asRect(value: unknown): BrowserRect | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const width = Number(record.width);
  const height = Number(record.height);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  return { x, y, width, height };
}

export type BrowserHostDeps = {
  pane: BrowserPane;
  isPluginLoaded: (pluginId: string) => boolean;
  getFileRoot: (sessionId?: string) => Promise<string | null>;
  getScratchDir?: (sessionId?: string) => string | null;
  onState: (state: BrowserState) => void;
  /** Canvas ownership changed; owner id, or null when released (E13). */
  onOwnerChange?: (owner: string | null) => void;
};

type ChromeSurface = {
  pluginId: string;
  viewId: string;
  visible: boolean;
  bounds: BrowserRect;
};

/**
 * Minimal surface `withAgentCanvasOwnership` needs — satisfied structurally by
 * `BrowserHost` (E13). Kept separate so ownership handoff is testable without
 * constructing a full host.
 */
export type CanvasOwnership = {
  currentOwner(): string | null;
  forceAcquireCanvas(ownerId: string): void;
  releaseCanvas(ownerId: string): void;
};

/**
 * Run `fn` with the canvas force-acquired as "agent", then hand ownership
 * back to whoever held it before (or release it if nobody did). Never
 * refuses — the agent's tool call always proceeds, matching E13's chosen
 * "visible banner, not blocked" behavior — but restoring the prior owner
 * (instead of always releasing) keeps a foreground Build tab's own
 * navigate/action calls from breaking after the agent's call returns.
 */
export async function withAgentCanvasOwnership<T>(
  canvas: CanvasOwnership,
  fn: () => Promise<T>,
): Promise<T> {
  const previousOwner = canvas.currentOwner();
  canvas.forceAcquireCanvas("agent");
  try {
    return await fn();
  } finally {
    if (previousOwner) canvas.forceAcquireCanvas(previousOwner);
    else canvas.releaseCanvas("agent");
  }
}

/**
 * Public `pi.browser.*` implementation: one host-owned guest WebContentsView,
 * driven by plugin chrome through a clamped hole, plus CDP for the agent.
 */
export class BrowserHost {
  private readonly pane: BrowserPane;
  private readonly cdp = new BrowserCdp();
  private readonly deps: BrowserHostDeps;
  private chrome: ChromeSurface | null = null;
  private hole: BrowserRect | null = null;
  private holePluginId: string | null = null;
  private readonly locations = new Map<string, string>();
  private chromeSessionId: string | null = null;
  private started = false;
  private navigationEpoch = 0;

  constructor(deps: BrowserHostDeps) {
    this.deps = deps;
    this.pane = deps.pane;
  }

  /** Current canvas owner id, or null when free (E13). */
  currentOwner(): string | null {
    return this.pane.currentOwner();
  }

  /**
   * Force-acquire canvas ownership and notify the renderer so a visible
   * indicator can show while a non-previous owner holds it (E13).
   */
  forceAcquireCanvas(ownerId: string): void {
    this.pane.forceAcquireCanvas(ownerId);
    this.deps.onOwnerChange?.(ownerId);
  }

  /** Release ownership (no-op if the caller does not hold it) and notify (E13). */
  releaseCanvas(ownerId: string): void {
    this.pane.releaseCanvas(ownerId);
    this.deps.onOwnerChange?.(this.pane.currentOwner());
  }

  setChromeSurface(surface: ChromeSurface | null): void {
    this.chrome = surface;
    this.applyGuest();
  }

  setChromeSession(sessionId: string | undefined): void {
    const next = sessionId?.trim() || null;
    if (this.chromeSessionId === next) return;
    this.chromeSessionId = next;
    this.navigationEpoch += 1;
    this.pane.invalidateNavigation();
    this.started = false;
    this.pane.setVisible(false);
    if (next) {
      void this.rebindSession(next).catch((error) => {
        console.warn("Browser preview session restore failed", error);
      });
    }
  }

  /**
   * Content-relative hole inside the calling plugin view. Last writer wins
   * (v1 is a singleton guest).
   */
  setGuestHole(pluginId: string, hole: unknown): BrowserRect | null {
    const rect = asRect(hole);
    if (!rect) {
      this.hole = null;
      this.holePluginId = pluginId;
      this.applyGuest();
      return null;
    }
    this.hole = rect;
    this.holePluginId = pluginId;
    this.applyGuest();
    return this.guestBounds();
  }

  setGuestVisible(pluginId: string, visible: boolean): void {
    if (!visible && this.holePluginId === pluginId) {
      this.pane.setVisible(false);
      return;
    }
    if (visible) this.applyGuest();
  }

  rememberLocation(sessionId: string | undefined, location: string): void {
    const id = sessionId?.trim();
    const value = location.trim();
    if (!id || !value) return;
    this.locations.set(id, value);
  }

  async navigate(
    input: BrowserNavigateInput,
    sessionId?: string,
  ): Promise<BrowserState | null> {
    const target = String(input.path ?? input.url ?? "").trim();
    if (!target) return this.pane.getState();
    this.rememberLocation(sessionId ?? this.chromeSessionId ?? undefined, target);
    const background =
      Boolean(sessionId) &&
      Boolean(this.chromeSessionId) &&
      sessionId !== this.chromeSessionId;
    if (background) return this.pane.getState();
    const state = await this.navigateGuest(
      target,
      this.deps.getFileRoot(sessionId ?? this.chromeSessionId ?? undefined),
    );
    if (state) this.deps.onState(state);
    return state;
  }

  action(action: "back" | "forward" | "reload" | "stop"): void {
    this.pane.action(action);
  }

  getState(): BrowserState | null {
    return this.pane.getState();
  }

  openExternal(): void {
    this.pane.openExternal();
  }

  async snapshot(): Promise<{ tree: string; url: string; title: string }> {
    const wc = this.requireWebContents();
    return this.cdp.snapshot(wc);
  }

  async screenshot(
    input: { fullPage?: boolean } = {},
    sessionId?: string,
  ): Promise<{ mimeType: string; data: string; path?: string }> {
    const wc = this.requireWebContents();
    const shot = await this.cdp.screenshot(wc, input);
    const scratch = this.deps.getScratchDir?.(sessionId ?? this.chromeSessionId ?? undefined);
    if (!scratch) return shot;
    try {
      mkdirSync(scratch, { recursive: true });
      const path = join(scratch, `browser-screenshot-${Date.now()}.jpg`);
      writeFileSync(path, Buffer.from(shot.data, "base64"));
      return { ...shot, path };
    } catch {
      return shot;
    }
  }

  async click(uid: string): Promise<void> {
    await this.cdp.click(this.requireWebContents(), uid);
  }

  async fill(uid: string, text: string): Promise<void> {
    await this.cdp.fill(this.requireWebContents(), uid, text);
  }

  async evaluate(expression: string): Promise<unknown> {
    return this.cdp.evaluate(this.requireWebContents(), expression);
  }

  console(limit?: number): { messages: ReturnType<BrowserCdp["console"]> } {
    this.ensureCdp();
    return { messages: this.cdp.console(limit) };
  }

  async cdpCommand(method: string, params?: unknown): Promise<unknown> {
    return this.cdp.send(this.requireWebContents(), method, params);
  }

  /**
   * Host `BrowserPreview` facade: plugin must be enabled; the guest loads the
   * workspace file only when that session's chrome is visible (D142).
   */
  async previewWorkspaceFile(
    sessionId: string,
    path: string,
    root: string,
  ): Promise<{ ok: true } | { ok: false; content: string }> {
    if (!this.deps.isPluginLoaded(BROWSER_PLUGIN_ID)) {
      return {
        ok: false,
        content:
          "BrowserPreview: the Browser plugin is disabled. Enable pi.browser in Plugins to preview HTML.",
      };
    }
    this.rememberLocation(sessionId, path);
    const background =
      Boolean(this.chromeSessionId) && this.chromeSessionId !== sessionId;
    if (!background) {
      await this.navigateGuest(path, root);
    }
    return { ok: true };
  }

  disposeGuest(): void {
    this.navigationEpoch += 1;
    this.cdp.detach(this.pane.getWebContents() ?? undefined);
    this.pane.dispose();
    this.started = false;
    this.hole = null;
    this.holePluginId = null;
  }

  private guestBounds(): BrowserRect | null {
    if (!this.chrome?.visible || !this.hole) return null;
    if (this.holePluginId !== this.chrome.pluginId) return null;
    return clampGuestBounds(this.chrome.bounds, this.hole);
  }

  private applyGuest(): void {
    const bounds = this.guestBounds();
    if (!bounds || !this.started) {
      this.pane.setVisible(false);
      return;
    }
    this.pane.setBounds(bounds);
    this.pane.setVisible(true);
  }

  private async rebindSession(sessionId: string): Promise<void> {
    const location = this.locations.get(sessionId);
    if (!location) return;
    await this.navigateGuest(location, this.deps.getFileRoot(sessionId));
  }

  private async navigateGuest(
    target: string,
    root: string | null | Promise<string | null>,
  ): Promise<BrowserState | null> {
    const epoch = ++this.navigationEpoch;
    const fileRoot = await root;
    if (epoch !== this.navigationEpoch) return null;
    const state = await this.pane.navigateAndWait(target, fileRoot);
    if (epoch !== this.navigationEpoch) return null;
    // A failed or timed-out load is not evidence that the previous session's
    // document has been replaced. Only a completed navigation makes it ready.
    if (state) this.started = true;
    this.applyGuest();
    return state;
  }

  private requireWebContents() {
    const wc = this.pane.getWebContents();
    if (!wc || wc.isDestroyed()) {
      throw Object.assign(new Error("browser guest is not available"), {
        code: "UNAVAILABLE",
      });
    }
    return wc;
  }

  private ensureCdp(): void {
    const wc = this.pane.getWebContents();
    if (wc && !wc.isDestroyed()) void this.cdp.attach(wc);
  }
}
