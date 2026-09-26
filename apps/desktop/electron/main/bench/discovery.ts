/**
 * Bench discovery — scaffold stub.
 *
 * Owner: agent P (lane `feat/omp-bridge`), task DX10. Real implementation
 * scans configured roots (default `~/ERPNext`, plus manually added paths,
 * deduped by realpath) for directories containing both `apps/` and `sites/`,
 * reads sites from `sites/<name>/site_config.json` (named fields only — E12/E13
 * hardening), the default site from `sites/currentsite.txt`, and the Frappe
 * version from `apps/frappe/frappe/__init__.py` (`15 | 16 | 17`, unparseable
 * treated as 16). See plan Approach step 6.
 *
 * This stub exists only so `ipc/bench-ipc.ts` (lane N) has a real import to
 * compile and wire against while P builds the lane in parallel.
 */

export type BenchVersion = 15 | 16 | 17;

export type BenchSite = {
  name: string;
  isDefault: boolean;
};

export type BenchSummary = {
  id: string;
  path: string;
  version: BenchVersion;
  sites: BenchSite[];
};

export async function discoverBenches(): Promise<BenchSummary[]> {
  return [];
}
