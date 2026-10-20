/**
 * Design Mode: guest-page element picker + main-side payload clamper.
 *
 * PICKER_SCRIPT architecture
 * ─────────────────────────────────────────────────────────────────────────────
 * CDP `Runtime.evaluate` runs in the V8 context of the guest page but bypasses
 * the page's Content-Security-Policy (DevTools protocol layer, not a network
 * resource), so arbitrary JS can be injected without widening the page's CSP.
 *
 * We use `awaitPromise: true` on the main side so the IIFE returns a Promise
 * that settles only when the user clicks (→ grab object) or cancels (→ null),
 * delivering the full payload in one CDP roundtrip.
 *
 * Re-entrancy via nonce: each injection carries a unique numeric nonce stored
 * at `window.__PI_PICK.n`. On entry the script cancels any existing picker
 * ONLY when the nonce differs, so a stale `cancelPick()` CDP message arriving
 * after a fresh arm cannot inadvertently cancel the new picker.
 */
import type { ElementGrab, ElementGrabReact } from "../../src/lib/element-grab.ts";
import { ELEMENT_GRAB_BUDGETS, ELEMENT_GRAB_STYLE_KEYS } from "../../src/lib/element-grab.ts";

// ── Picker script ─────────────────────────────────────────────────────────────

/**
 * Build the IIFE string injected into the guest page via `Runtime.evaluate`.
 * `Promise.withResolvers()` is used inside since Electron's guest Chromium
 * (Chrome 119+) guarantees its availability at the V8 level regardless of
 * the page's own target environment.
 */
export function buildPickerScript(nonce: number): string {
  // String.raw avoids double-escaping regex backslashes in the template.
  return String.raw`(function () {
  var NONCE = ${nonce};
  if (window.__PI_PICK && window.__PI_PICK.n !== NONCE) {
    try { window.__PI_PICK.cancel(); } catch {}
  }
  var wr = Promise.withResolvers();
  var done = false;
  function finish(payload) {
    if (done) return;
    done = true;
    cleanup();
    if (window.__PI_PICK && window.__PI_PICK.n === NONCE) delete window.__PI_PICK;
    wr.resolve(payload);
  }
  window.__PI_PICK = { n: NONCE, cancel: function () { finish(null); } };

  // Overlay (pointer-events:none so cursor events reach the real page elements)
  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;overflow:visible;';
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;border:2px solid #3b82f6;border-radius:3px;background:rgba(59,130,246,0.07);pointer-events:none;box-sizing:border-box;display:none;';
  overlay.appendChild(box);
  document.documentElement.appendChild(overlay);

  var SECRET_ATTR = /^(?:value|password|data-token|data-secret|data-key|authorization|x-api-key)$/i;
  var SECRET_VAL  = /^[A-Za-z0-9_\-+\/]{24,}={0,2}$|^eyJ[A-Za-z0-9_\-]+/;

  function getSelector(el) {
    try {
      if (el.id) return '#' + CSS.escape(el.id);
      var parts = [];
      var cur = el;
      for (var i = 0; i < 6 && cur && cur !== document.documentElement; i++) {
        var tag = cur.tagName.toLowerCase();
        var cls = Array.from(cur.classList).slice(0, 2).map(function (c) { return '.' + CSS.escape(c); }).join('');
        var sibs = cur.parentElement ? Array.from(cur.parentElement.children).filter(function (s) { return s.tagName === cur.tagName; }) : [];
        var idx = sibs.length > 1 ? ':nth-child(' + (Array.from(cur.parentElement.children).indexOf(cur) + 1) + ')' : '';
        parts.unshift(tag + cls + idx);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    } catch { return el.tagName ? el.tagName.toLowerCase() : 'unknown'; }
  }

  function getPath(el) {
    try {
      var parts = [];
      var cur = el;
      for (var i = 0; i < 8 && cur && cur !== document.body && cur !== document.documentElement; i++) {
        var tag = cur.tagName.toLowerCase();
        var suffix = cur.id ? '#' + cur.id : cur.classList.length ? '.' + Array.from(cur.classList).slice(0, 2).join('.') : '';
        parts.unshift(tag + suffix);
        cur = cur.parentElement;
      }
      return parts.join(' > ');
    } catch { return ''; }
  }

  function getAccessibleName(el) {
    try {
      var a = el.getAttribute('aria-label');
      if (a) return a.trim().slice(0, 200);
      var lb = el.getAttribute('aria-labelledby');
      if (lb) { var ref = document.getElementById(lb); if (ref) return (ref.textContent || '').trim().slice(0, 200); }
      var t = el.getAttribute('title') || el.getAttribute('alt');
      if (t) return t.trim().slice(0, 200);
      return (el.textContent || '').trim().slice(0, 100);
    } catch { return ''; }
  }

  function getNearbyText(el) {
    try {
      var own = (el.textContent || '').trim().slice(0, 200);
      var sib = el.parentElement ? Array.from(el.parentElement.children).map(function (c) { return (c.textContent || '').trim(); }).filter(Boolean).join(' ').slice(0, 200) : '';
      return (own || sib).slice(0, 300);
    } catch { return ''; }
  }

  var STYLE_KEYS = ['display','position','color','background-color','font-family','font-size','font-weight','line-height','margin','padding','border','border-radius','width','height','opacity','z-index'];

  function getStyles(el) {
    try {
      var cs = window.getComputedStyle(el);
      var out = {};
      for (var i = 0; i < STYLE_KEYS.length; i++) out[STYLE_KEYS[i]] = (cs.getPropertyValue(STYLE_KEYS[i]) || '').slice(0, 100);
      return out;
    } catch { return {}; }
  }

  function isFixedOrSticky(el) {
    try {
      for (var cur = el; cur && cur !== document.documentElement; cur = cur.parentElement) {
        var pos = window.getComputedStyle(cur).position;
        if (pos === 'fixed' || pos === 'sticky') return true;
      }
    } catch {}
    return false;
  }

  function getReact(el) {
    try {
      var key = Object.keys(el).find(function (k) { return k.startsWith('__reactFiber') || k.startsWith('__reactInternals'); });
      if (!key) return undefined;
      for (var i = 0, cur = el[key]; i < 30 && cur; i++, cur = cur.return) {
        var t = cur.type;
        if (!t || (typeof t !== 'function' && typeof t !== 'object')) continue;
        var name = t.displayName || t.name;
        if (!name || name === 'Anonymous') continue;
        var dbg = cur._debugSource;
        return { component: name, source: dbg ? { file: dbg.fileName, line: dbg.lineNumber } : undefined };
      }
    } catch {}
    return undefined;
  }

  function redactHTML(html) {
    return html.replace(/\s(?:value|data-token|data-secret|data-key|authorization|x-api-key)="[^"]*"/gi, function (m) {
      return m.replace(/"[^"]*"$/, '"[REDACTED]"');
    }).slice(0, 6000);
  }

  function collect(el) {
    var rect = el.getBoundingClientRect();
    var react = getReact(el);
    var payload = {
      url: window.location.href,
      title: document.title,
      selector: getSelector(el),
      path: getPath(el),
      tag: el.tagName.toLowerCase(),
      accessibleName: getAccessibleName(el),
      nearbyText: getNearbyText(el),
      outerHTML: redactHTML(el.outerHTML),
      styles: getStyles(el),
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      fixedOrSticky: isFixedOrSticky(el),
    };
    if (react) payload.react = react;
    return payload;
  }

  function onMove(e) {
    var t = e.target;
    if (!t || t === overlay || t === box || !t.getBoundingClientRect) return;
    try {
      var r = t.getBoundingClientRect();
      box.style.display = 'block';
      box.style.left = r.left + 'px'; box.style.top = r.top + 'px';
      box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
    } catch {}
  }

  function onClick(e) {
    var t = e.target;
    if (!t || t === overlay || t === box) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    try { finish(collect(t)); } catch { finish(null); }
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); }
  }

  function cleanup() {
    try { document.removeEventListener('mousemove', onMove,  true); } catch {}
    try { document.removeEventListener('click',     onClick, true); } catch {}
    try { document.removeEventListener('keydown',   onKey,   true); } catch {}
    try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch {}
  }

  document.addEventListener('mousemove', onMove,  true);
  document.addEventListener('click',     onClick, true);
  document.addEventListener('keydown',   onKey,   true);

  return wr.promise;
})()`;
}

// ── Screenshot clip validation ────────────────────────────────────────────────

const MAX_CLIP_DIM = 8192;

/**
 * Validate and normalise an element screenshot clip rect.
 * Returns undefined when any value is non-finite, zero/negative, or exceeds
 * the per-dimension maximum. Exported for unit tests.
 */
export function validateScreenshotClip(
  raw: unknown,
): { x: number; y: number; width: number; height: number; scale: number } | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const c = raw as Record<string, unknown>;
  const x = Number(c.x ?? 0);
  const y = Number(c.y ?? 0);
  const w = Number(c.width);
  const h = Number(c.height);
  const s = Number(c.scale ?? 1);
  if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h) || !isFinite(s)) return undefined;
  if (w <= 0 || h <= 0 || s <= 0) return undefined;
  if (w > MAX_CLIP_DIM || h > MAX_CLIP_DIM) return undefined;
  return { x: Math.max(0, x), y: Math.max(0, y), width: w, height: h, scale: s };
}

// ── Payload clamper ───────────────────────────────────────────────────────────

/** Long base64-ish strings and JWT prefixes that look like tokens. */
const SECRET_VAL_RE = /\b(?:[A-Za-z0-9+/]{32,}={0,2}|eyJ[A-Za-z0-9_-]+)\b/g;
/** CSS ids / classes that look like random tokens (≥32 alnum chars). */
const SECRET_CLASS_ID_RE = /(?:#|\.)[A-Za-z0-9_-]{32,}/g;

/** Apply both secret patterns to a string. Named for readability at 2+ sites. */
function redactSecrets(s: string): string {
  return s.replace(SECRET_VAL_RE, "[REDACTED]").replace(SECRET_CLASS_ID_RE, (m) => m[0] + "[REDACTED]");
}

/**
 * Main-side pass over outerHTML (the page script is untrusted): drop
 * query/hash from URL-bearing attributes and blank secret-ish attributes.
 */
function redactHtml(html: string): string {
  return html
    .replace(/(\s(?:href|src|action|formaction|poster|data-src))=(["'])([^"'#?]*)[?#][^"']*\2/gi, "$1=$2$3$2")
    .replace(/(\s(?:value|data-token|data-secret|data-key|authorization|x-api-key))=(["'])[^"']*\2/gi, "$1=$2[REDACTED]$2");
}

function clampStr(raw: unknown, budget: number): string {
  const s = typeof raw === "string" ? raw : String(raw ?? "");
  return s.slice(0, budget * 4).slice(0, budget); // fast-reject huge inputs first
}

function sanitizeUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  try {
    const u = new URL(raw.slice(0, ELEMENT_GRAB_BUDGETS.url * 4));
    if (u.protocol !== "http:" && u.protocol !== "https:" && u.protocol !== "file:") return "";
    u.search = "";
    u.hash = "";
    u.username = "";
    u.password = "";
    return u.toString().slice(0, ELEMENT_GRAB_BUDGETS.url);
  } catch {
    return "";
  }
}

function clampStyles(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const src = raw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of ELEMENT_GRAB_STYLE_KEYS) {
    const v = src[key];
    if (typeof v === "string") out[key] = v.slice(0, ELEMENT_GRAB_BUDGETS.styleValue);
  }
  return out;
}

function clampReact(raw: unknown): ElementGrabReact | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const component =
    typeof r.component === "string" ? r.component.slice(0, ELEMENT_GRAB_BUDGETS.reactComponent) : null;
  if (!component) return undefined;
  let source: { file: string; line: number } | undefined;
  if (r.source && typeof r.source === "object" && !Array.isArray(r.source)) {
    const s = r.source as Record<string, unknown>;
    const file = typeof s.file === "string" ? s.file.slice(0, ELEMENT_GRAB_BUDGETS.sourceFile) : null;
    const line = Number(s.line);
    if (file && isFinite(line) && Number.isInteger(line)) source = { file, line };
  }
  return { component, ...(source ? { source } : {}) };
}

/**
 * Clamp an untrusted guest payload to the `ElementGrab` contract.
 *
 * Never throws — invalid shapes return null. The input is already parsed JSON
 * (CDP `returnByValue: true`) so there are no Proxy/getter risks, but fields
 * may be the wrong type, missing, or contain huge strings.
 */
export function clampElementGrab(untrusted: unknown): ElementGrab | null {
  if (!untrusted || typeof untrusted !== "object" || Array.isArray(untrusted)) return null;
  const raw = untrusted as Record<string, unknown>;

  const url = sanitizeUrl(raw.url);
  if (!url) return null;

  const tag = typeof raw.tag === "string" ? raw.tag.toLowerCase().slice(0, ELEMENT_GRAB_BUDGETS.tag) : "";
  if (!tag) return null;

  // Rect is required — main uses it for the element screenshot clip.
  if (!raw.rect || typeof raw.rect !== "object" || Array.isArray(raw.rect)) return null;
  const rr = raw.rect as Record<string, unknown>;
  const rx = Number(rr.x);
  const ry = Number(rr.y);
  const rw = Number(rr.width);
  const rh = Number(rr.height);
  if (!isFinite(rx) || !isFinite(ry) || !isFinite(rw) || !isFinite(rh)) return null;

  return {
    url,
    title: clampStr(raw.title, ELEMENT_GRAB_BUDGETS.title),
    selector: redactSecrets(clampStr(raw.selector, ELEMENT_GRAB_BUDGETS.selector)),
    path: redactSecrets(clampStr(raw.path, ELEMENT_GRAB_BUDGETS.path)),
    tag,
    accessibleName: clampStr(raw.accessibleName, ELEMENT_GRAB_BUDGETS.accessibleName),
    nearbyText: clampStr(raw.nearbyText, ELEMENT_GRAB_BUDGETS.nearbyText),
    outerHTML: redactHtml(clampStr(raw.outerHTML, ELEMENT_GRAB_BUDGETS.outerHTML)),
    styles: clampStyles(raw.styles),
    rect: { x: rx, y: ry, width: Math.max(0, rw), height: Math.max(0, rh) },
    fixedOrSticky: Boolean(raw.fixedOrSticky),
    react: clampReact(raw.react),
  };
}
