import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { ErrorCodes } from "@pi-desktop/shared";
import {
  MAX_TEXT_BYTES,
  previewFile,
  readOpenableImage,
  resolveOpenablePath,
  resolveRealOpenablePath,
  writeWorkspaceFile,
} from "./workspace-files.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const temps: string[] = [];
async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});

afterAll(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

afterEach(() => {
  vi.mocked(open).mockClear();
});

/** Creating links is not always permitted; callers skip then. */
async function linkOrSkip(target: string, path: string): Promise<boolean> {
  try {
    await symlink(target, path);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EACCES" || code === "ENOSYS") return false;
    throw error;
  }
}

it("opens a canonicalized path under a root that is still an alias", async (ctx) => {
  if (process.platform === "win32") ctx.skip();
  const base = await tempDir("pi-ws-alias-");
  const realRoot = join(base, "real");
  const aliasRoot = join(base, "alias");
  await mkdir(realRoot);
  await writeFile(join(realRoot, "generated.png"), PNG);
  await writeFile(join(realRoot, "notes.txt"), "hello");
  if (!(await linkOrSkip(realRoot, aliasRoot))) {
    ctx.skip();
    return;
  }

  // Writers canonicalize before recording the path (`image-generation-service`
  // realpaths its output dir), so the transcript can carry `/private/var/...`
  // while the allowed root is still spelled `/var/...`.
  const canonicalFile = await realpath(join(realRoot, "generated.png"));
  expect(resolveOpenablePath(canonicalFile, aliasRoot, [])).toBeNull();
  expect(await resolveRealOpenablePath(canonicalFile, aliasRoot, [])).toBe(canonicalFile);
  expect(await resolveRealOpenablePath(canonicalFile, null, [aliasRoot])).toBe(canonicalFile);
  expect(await resolveRealOpenablePath(canonicalFile, aliasRoot, [realRoot])).toBe(
    canonicalFile,
  );

  // Absolute paths and attachment blobs keep working through the alias too.
  const canonicalAlias = await realpath(join(aliasRoot, "notes.txt"));
  expect(await resolveRealOpenablePath(canonicalAlias, aliasRoot, [])).toBe(
    canonicalAlias,
  );
});

it("stores a generated image reference that the reader can open", async (ctx) => {
  if (process.platform === "win32") ctx.skip();
  const base = await tempDir("pi-ws-scratch-");
  const dataDir = join(base, "data");
  const scratch = join(dataDir, "scratch");
  const workspace = join(base, "workspace");
  await mkdir(scratch, { recursive: true });
  await mkdir(workspace);
  await writeFile(join(scratch, "generated-1.png"), PNG);
  if (!(await linkOrSkip(dataDir, join(base, "data-alias")))) {
    ctx.skip();
    return;
  }

  // Exactly what `image-generation-service` writes into the transcript.
  const stored = await realpath(join(scratch, "generated-1.png"));
  const result = await readOpenableImage(stored, workspace, [scratch]);
  expect(result).toMatchObject({ kind: "image", size: PNG.length });
  expect(String((result as { dataUrl?: string }).dataUrl)).toMatch(
    /^data:image\/png;base64,/,
  );

  // The alias spelling was always accepted and must keep working.
  const alias = await readOpenableImage(join(scratch, "generated-1.png"), workspace, [
    scratch,
  ]);
  expect(alias.kind).toBe("image");
});

it("still refuses a link inside an allowed root that points outside it", async (ctx) => {
  if (process.platform === "win32") ctx.skip();
  const base = await tempDir("pi-ws-escape-");
  const root = join(base, "root");
  const outside = join(base, "outside");
  const other = join(base, "other");
  await mkdir(root);
  await mkdir(outside);
  await mkdir(other);
  await writeFile(join(outside, "leak.png"), PNG);
  const link = join(root, "leak.png");
  if (!(await linkOrSkip(join(outside, "leak.png"), link))) {
    ctx.skip();
    return;
  }

  const canonicalOutside = await realpath(join(outside, "leak.png"));
  expect(await resolveRealOpenablePath(link, root, [])).toBeNull();
  expect(await resolveRealOpenablePath(canonicalOutside, root, [])).toBeNull();
  expect(await resolveRealOpenablePath(link, other, [root])).toBeNull();
  expect(await resolveRealOpenablePath(canonicalOutside, other, [root])).toBeNull();

  const result = await readOpenableImage(link, root, [], "image/png");
  expect(result).toMatchObject({
    kind: "missing",
    errorCode: "PATH_OUTSIDE_ALLOWED_ROOT",
  });
});

it("keeps relative, absolute and workspace-boundary behavior", async () => {
  const base = await tempDir("pi-ws-bounds-");
  const root = join(base, "workspace");
  const scratch = join(base, "scratch");
  const attachments = join(base, "attachments");
  const hash = "a".repeat(64);
  await mkdir(join(root, "src"), { recursive: true });
  await mkdir(scratch);
  await mkdir(attachments);
  await writeFile(join(root, "src", "a.ts"), "x");
  await writeFile(join(scratch, "pasted.png"), PNG);
  await writeFile(join(attachments, hash), PNG);
  await writeFile(join(base, "outside.png"), PNG);

  const workspaceFile = join(root, "src", "a.ts");
  expect(await resolveRealOpenablePath("src/a.ts", root, [scratch])).toBe(
    await realpath(workspaceFile),
  );
  expect(await resolveRealOpenablePath(workspaceFile, root, [scratch])).toBe(
    await realpath(workspaceFile),
  );
  expect(await resolveRealOpenablePath(join(scratch, "pasted.png"), root, [scratch])).toBe(
    await realpath(join(scratch, "pasted.png")),
  );
  expect(await resolveRealOpenablePath(`attachments/${hash}`, root, [attachments])).toBe(
    await realpath(join(attachments, hash)),
  );

  expect(await resolveRealOpenablePath("../outside.png", root, [scratch])).toBeNull();
  expect(await resolveRealOpenablePath("src/a.ts", null, [scratch])).toBeNull();
  expect(await resolveRealOpenablePath("~/secret.png", root, [scratch])).toBeNull();
  expect(await resolveRealOpenablePath(join(base, "outside.png"), root, [scratch])).toBeNull();
  expect(await resolveRealOpenablePath(`attachments/notes.png`, root, [attachments])).toBeNull();
  expect(await resolveRealOpenablePath(`attachments/${hash}`, root, [])).toBeNull();
  expect(await resolveRealOpenablePath("", root, [scratch])).toBeNull();
  if (process.platform !== "win32") {
    expect(await resolveRealOpenablePath("/etc/passwd", root, [scratch])).toBeNull();
  }
});

it("writes a new file inside the workspace root (E6, case 1: relative path)", async () => {
  const root = await tempDir("pi-ws-write-ok-");
  const result = await writeWorkspaceFile(root, "notes/new.txt", "hello");
  expect(result.size).toBe(5);
  expect(await readFile(join(root, "notes", "new.txt"), "utf8")).toBe("hello");
});

it("rejects an absolute path outside the workspace root (E6, case 2)", async () => {
  const root = await tempDir("pi-ws-write-abs-");
  const outside = join(await tempDir("pi-ws-write-outside-"), "escape.txt");
  await expect(writeWorkspaceFile(root, outside, "x")).rejects.toMatchObject({
    message: expect.stringMatching(/escapes workspace root/),
    errorCode: ErrorCodes.PATH_OUTSIDE_WORKSPACE,
  });
  await expect(stat(outside)).rejects.toThrow();
});

it("rejects a .. escape from a relative path (E6, case 3)", async () => {
  const root = await tempDir("pi-ws-write-dotdot-");
  await expect(writeWorkspaceFile(root, "../escape.txt", "x")).rejects.toMatchObject({
    message: expect.stringMatching(/escapes workspace root/),
    errorCode: ErrorCodes.PATH_OUTSIDE_WORKSPACE,
  });
});

it("rejects a parent directory swapped to point outside root on the next write through the same root/rel pair (E6, case 4: parent-swap race)", async (ctx) => {
  if (process.platform === "win32") ctx.skip();
  const base = await tempDir("pi-ws-write-race-");
  const root = join(base, "root");
  const insideTarget = join(root, "docs");
  const outsideTarget = join(base, "outside-docs");
  await mkdir(insideTarget, { recursive: true });
  await mkdir(outsideTarget, { recursive: true });

  // First resolution is legitimate: docs/ is a real directory inside root.
  const first = await writeWorkspaceFile(root, "docs/a.txt", "first");
  expect(first.size).toBe(5);

  // Swap docs/ for a symlink to a directory outside root, then write again
  // through the same root/rel pair. A cached resolution -- or a check that
  // trusted the walk-up result without re-validating the parent right
  // before opening -- would still trust the old, contained path; a fresh
  // per-call resolve plus the pre-open re-check must reject it.
  await rm(insideTarget, { recursive: true, force: true });
  if (!(await linkOrSkip(outsideTarget, insideTarget))) {
    ctx.skip();
    return;
  }
  await expect(writeWorkspaceFile(root, "docs/b.txt", "second")).rejects.toMatchObject({
    message: expect.stringMatching(/escapes workspace root/),
    errorCode: ErrorCodes.PATH_OUTSIDE_WORKSPACE,
  });
  await expect(stat(join(outsideTarget, "b.txt"))).rejects.toThrow();
});

it("rejects a parent directory swapped to point outside root inside a single write call (E6, case 5: in-flight race)", async (ctx) => {
  if (process.platform === "win32") ctx.skip();
  const base = await tempDir("pi-ws-write-inflight-race-");
  const root = join(base, "root");
  const insideTarget = join(root, "docs");
  const outsideTarget = join(base, "outside-docs");
  await mkdir(insideTarget, { recursive: true });
  await mkdir(outsideTarget, { recursive: true });

  // The swap happens *inside* the one writeWorkspaceFile call, right before
  // the real open() syscall runs -- after path resolution already trusted
  // docs/ as a real, contained directory. This is the window O_NOFOLLOW
  // alone does not cover (it only guards the leaf, not this parent).
  let swapped = false;
  vi.mocked(open).mockImplementationOnce(async (...args) => {
    await rm(insideTarget, { recursive: true, force: true });
    swapped = await linkOrSkip(outsideTarget, insideTarget);
    return open(...(args as Parameters<typeof open>));
  });

  await expect(writeWorkspaceFile(root, "docs/b.txt", "second")).rejects.toMatchObject({
    message: expect.stringMatching(/escapes workspace root/),
    errorCode: ErrorCodes.PATH_OUTSIDE_WORKSPACE,
  });
  if (!swapped) {
    ctx.skip();
    return;
  }
  // O_CREAT unavoidably creates the (empty) file before the post-open
  // identity check can run -- Node has no atomic "verify then create"
  // primitive. What matters is that the write's *content* never lands
  // outside root: the escaped file must not exist with the payload written.
  const leaked = await readFile(join(outsideTarget, "b.txt"), "utf8").catch(() => null);
  expect(leaked).not.toBe("second");
});

it("caps write size and rejects invalid UTF-8 content (E6)", async () => {
  const root = await tempDir("pi-ws-write-limits-");
  await expect(
    writeWorkspaceFile(root, "big.txt", "x".repeat(MAX_TEXT_BYTES + 1)),
  ).rejects.toMatchObject({
    message: expect.stringMatching(/too large/),
    errorCode: ErrorCodes.INVALID_ARGUMENT,
  });
  await expect(writeWorkspaceFile(root, "bad.txt", "\uD800")).rejects.toMatchObject({
    message: expect.stringMatching(/UTF-8/),
    errorCode: ErrorCodes.INVALID_ARGUMENT,
  });
});

it("detects an on-disk change since the caller's expected mtime (E6)", async () => {
  const root = await tempDir("pi-ws-write-conflict-");
  await writeFile(join(root, "shared.txt"), "v1");
  const staleMtimeMs = (await stat(join(root, "shared.txt"))).mtimeMs - 1000;
  await expect(
    writeWorkspaceFile(root, "shared.txt", "v2", staleMtimeMs),
  ).rejects.toMatchObject({
    message: expect.stringMatching(/changed on disk/),
    errorCode: ErrorCodes.CONFLICT,
  });
  expect(await readFile(join(root, "shared.txt"), "utf8")).toBe("v1");
});

it("round-trips mtimeMs from previewFile so a caller can supply expectedMtimeMs on write (E6)", async () => {
  const root = await tempDir("pi-ws-read-mtime-");
  await writeFile(join(root, "note.txt"), "v1");
  const onDisk = await stat(join(root, "note.txt"));
  const preview = await previewFile(join(root, "note.txt"), "note.txt");
  expect(preview.kind).toBe("text");
  expect(preview.mtimeMs).toBe(onDisk.mtimeMs);
});
