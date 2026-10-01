/**
 * Minimal fetch-based helper for the Hindsight HTTP API.
 *
 * Only the endpoints used by the MemoryTab extras (mental-model list/refresh,
 * bank mission update, and bench memory retain) are implemented here. The full
 * client lives in omp/packages/coding-agent/src/hindsight/client.ts; we
 * cannot import that from Electron main, so we keep it thin and defer to omp
 * for everything else.
 *
 * ponytail: raw fetch, no abstraction. Add client.ts import if omp is ever
 * exposed as a shared package.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

function authHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function hindsightFetch(
  url: string,
  token: string | null,
  method: string,
  body?: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: authHeaders(token),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ac.signal,
    });
    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as unknown) : {};
    if (!res.ok) {
      const detail = (parsed as { detail?: string; message?: string } | null)?.detail
        ?? (parsed as { message?: string } | null)?.message
        ?? text;
      throw new Error(`Hindsight ${method} ${url}: HTTP ${res.status} — ${detail}`);
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Bank ────────────────────────────────────────────────────────────────────

export async function hindsightCreateBank(
  baseUrl: string,
  token: string | null,
  bankId: string,
  opts: { reflectMission?: string; retainMission?: string } = {},
): Promise<unknown> {
  const url = `${baseUrl}/v1/default/banks/${encodeURIComponent(bankId)}`;
  return hindsightFetch(url, token, "PUT", opts);
}

// ─── Mental models ────────────────────────────────────────────────────────────

export interface RawMentalModel {
  id: string;
  name: string;
  content?: string;
  tags?: string[];
  updated_at?: string;
}

export async function hindsightListMentalModels(
  baseUrl: string,
  token: string | null,
  bankId: string,
): Promise<RawMentalModel[]> {
  const url = `${baseUrl}/v1/default/banks/${encodeURIComponent(bankId)}/mental-models?detail=content`;
  const raw = await hindsightFetch(url, token, "GET") as { items?: RawMentalModel[] } | RawMentalModel[] | null;
  if (Array.isArray(raw)) return raw;
  return (raw as { items?: RawMentalModel[] } | null)?.items ?? [];
}

export async function hindsightRefreshMentalModel(
  baseUrl: string,
  token: string | null,
  bankId: string,
  modelId: string,
): Promise<{ operation_id?: string }> {
  const url = `${baseUrl}/v1/default/banks/${encodeURIComponent(bankId)}/mental-models/${encodeURIComponent(modelId)}/refresh`;
  return hindsightFetch(url, token, "POST") as Promise<{ operation_id?: string }>;
}

// ─── Retain (bench bootstrap) ────────────────────────────────────────────────

export async function hindsightRetain(
  baseUrl: string,
  token: string | null,
  bankId: string,
  content: string,
  metadata?: Record<string, string>,
): Promise<unknown> {
  const url = `${baseUrl}/v1/default/banks/${encodeURIComponent(bankId)}/memories`;
  const item: Record<string, unknown> = { content, timestamp: new Date().toISOString() };
  if (metadata) item.metadata = metadata;
  return hindsightFetch(url, token, "POST", { items: [item] });
}
