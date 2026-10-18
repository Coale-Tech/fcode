import type { OmpLspSaveInput } from "@pi-desktop/shared";

export interface LspForm {
  name: string;
  command: string;
  args: string;
  fileTypes: string;
}

const words = (s: string, sep: RegExp) => s.split(sep).map((x) => x.trim()).filter(Boolean);

/**
 * The save request for the Add server form. A blank field is omitted, never sent as an empty
 * list: omp shallow-merges a user entry over the built-in, so `args: []` would wipe a built-in's
 * required arguments (ruff: ["server"], pyright: ["--stdio"]) when only its command is changed.
 */
export function lspSavePayload(form: LspForm): OmpLspSaveInput {
  const args = words(form.args, /\s+/);
  const fileTypes = words(form.fileTypes, /[\s,]+/);
  return {
    name: form.name,
    command: form.command,
    ...(args.length ? { args } : {}),
    ...(fileTypes.length ? { fileTypes } : {}),
  };
}
