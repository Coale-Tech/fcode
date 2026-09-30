/**
 * bench-doctype-scanner — behavior tests for scanDoctypes.
 *
 * Builds real temporary Git repositories mirroring a Frappe bench layout and
 * exercises the actual scanner: entry shape, dirty detection (working tree and
 * index), multi-app benches, monorepo benches, and non-doctype filtering.
 * No live bench, no IPC, no DB.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { scanDoctypes } = await import("../electron/main/scan-doctypes.js");

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "tester",
  GIT_AUTHOR_EMAIL: "tester@localhost",
  GIT_COMMITTER_NAME: "tester",
  GIT_COMMITTER_EMAIL: "tester@localhost",
};

function git(cwd, ...args) {
  execFileSync("git", args, { cwd, stdio: "pipe", env: GIT_ENV });
}

function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  git(dir, "init");
}

function commitAll(dir) {
  git(dir, "add", ".");
  git(dir, "commit", "--allow-empty", "-m", "init");
}

/** Writes <appDir>/<app>/<module>/doctype/<name>/<name>.json and returns its path. */
function writeDoctype(appDir, app, module, name, body = { name }) {
  const dir = join(appDir, app, module, "doctype", name);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify(body));
  return file;
}

async function withBench(fn) {
  const tmp = mkdtempSync(join(tmpdir(), "fcode-scan-"));
  try {
    return await fn(tmp);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

test("returns [] when apps/ is missing or empty", async () => {
  await withBench(async (bench) => {
    assert.deepEqual(await scanDoctypes(bench), []);
    mkdirSync(join(bench, "apps"));
    assert.deepEqual(await scanDoctypes(bench), []);
  });
});

test("skips plain files inside apps/", async () => {
  await withBench(async (bench) => {
    mkdirSync(join(bench, "apps"));
    writeFileSync(join(bench, "apps", ".keep"), "");
    assert.deepEqual(await scanDoctypes(bench), []);
  });
});

test("committed doctype in an app-owned repo: bench-relative entry, clean", async () => {
  await withBench(async (bench) => {
    const appDir = join(bench, "apps", "myapp");
    initRepo(appDir);
    writeDoctype(appDir, "myapp", "accounts", "invoice");
    commitAll(appDir);

    assert.deepEqual(await scanDoctypes(bench), [
      {
        path: "apps/myapp/myapp/accounts/doctype/invoice/invoice.json",
        app: "myapp",
        module: "accounts",
        name: "invoice",
        dirty: false,
      },
    ]);
  });
});

test("unstaged and staged edits both mark the doctype dirty", async () => {
  await withBench(async (bench) => {
    const appDir = join(bench, "apps", "myapp");
    initRepo(appDir);
    const note = writeDoctype(appDir, "myapp", "core", "note");
    const order = writeDoctype(appDir, "myapp", "selling", "order");
    writeDoctype(appDir, "myapp", "selling", "quote");
    commitAll(appDir);

    writeFileSync(note, JSON.stringify({ name: "note", changed: true }));
    writeFileSync(order, JSON.stringify({ name: "order", changed: true }));
    git(appDir, "add", order);

    const byName = Object.fromEntries((await scanDoctypes(bench)).map((e) => [e.name, e.dirty]));
    assert.deepEqual(byName, { note: true, order: true, quote: false });
  });
});

test("dirtiness is tracked per app repo", async () => {
  await withBench(async (bench) => {
    const frappe = join(bench, "apps", "frappe");
    initRepo(frappe);
    writeDoctype(frappe, "frappe", "desk", "form_tour");
    commitAll(frappe);

    const erp = join(bench, "apps", "erpnext");
    initRepo(erp);
    const payment = writeDoctype(erp, "erpnext", "accounts", "payment");
    commitAll(erp);
    writeFileSync(payment, JSON.stringify({ name: "payment", changed: true }));

    const byApp = Object.fromEntries((await scanDoctypes(bench)).map((e) => [e.app, e.dirty]));
    assert.deepEqual(byApp, { erpnext: true, frappe: false });
  });
});

test("monorepo bench (git at bench root, none in apps): scopes to each app", async () => {
  await withBench(async (bench) => {
    initRepo(bench);
    const a = join(bench, "apps", "a");
    const b = join(bench, "apps", "b");
    writeDoctype(a, "a", "m", "one");
    const two = writeDoctype(b, "b", "m", "two");
    commitAll(bench);
    writeFileSync(two, JSON.stringify({ name: "two", changed: true }));

    const entries = (await scanDoctypes(bench)).sort((x, y) => x.app.localeCompare(y.app));
    assert.deepEqual(
      entries.map((e) => [e.path, e.dirty]),
      [
        ["apps/a/a/m/doctype/one/one.json", false],
        ["apps/b/b/m/doctype/two/two.json", true],
      ],
    );
  });
});

test("apps outside any git repo are skipped", async () => {
  await withBench(async (bench) => {
    writeDoctype(join(bench, "apps", "loose"), "loose", "m", "thing");
    assert.deepEqual(await scanDoctypes(bench), []);
  });
});

test("only <name>/<name>.json at doctype depth counts; untracked non-doctype files are ignored", async () => {
  await withBench(async (bench) => {
    const appDir = join(bench, "apps", "myapp");
    initRepo(appDir);
    const dir = join(appDir, "myapp", "accounts", "doctype", "invoice");
    writeDoctype(appDir, "myapp", "accounts", "invoice");
    writeFileSync(join(dir, "invoice.py"), "# controller");
    writeFileSync(join(dir, "other.json"), "{}"); // name mismatch
    mkdirSync(join(appDir, "myapp", "accounts", "report"), { recursive: true });
    writeFileSync(join(appDir, "myapp", "accounts", "report", "report.json"), "{}"); // not under doctype/
    commitAll(appDir);

    assert.deepEqual((await scanDoctypes(bench)).map((e) => e.name), ["invoice"]);
  });
});

test("a new, never-added DocType is listed and dirty (even inside a brand-new directory)", async () => {
  await withBench(async (bench) => {
    const appDir = join(bench, "apps", "myapp");
    initRepo(appDir);
    writeDoctype(appDir, "myapp", "accounts", "invoice");
    commitAll(appDir);
    writeDoctype(appDir, "myapp", "accounts", "fresh"); // new dir under an existing module
    writeDoctype(appDir, "myapp", "brand_new_module", "widget"); // whole module untracked

    const byName = Object.fromEntries((await scanDoctypes(bench)).map((e) => [e.name, e.dirty]));
    assert.deepEqual(byName, { invoice: false, fresh: true, widget: true });
  });
});

test("gitignored DocTypes are not listed", async () => {
  await withBench(async (bench) => {
    const appDir = join(bench, "apps", "myapp");
    initRepo(appDir);
    writeDoctype(appDir, "myapp", "accounts", "invoice");
    writeFileSync(join(appDir, ".gitignore"), "myapp/accounts/doctype/ignored/\n");
    commitAll(appDir);
    writeDoctype(appDir, "myapp", "accounts", "ignored");

    assert.deepEqual((await scanDoctypes(bench)).map((e) => e.name), ["invoice"]);
  });
});

test("non-ASCII module names are returned verbatim and dirtiness still matches", async () => {
  await withBench(async (bench) => {
    const appDir = join(bench, "apps", "myapp");
    initRepo(appDir);
    const factura = writeDoctype(appDir, "myapp", "módulo", "factura");
    commitAll(appDir);
    writeFileSync(factura, JSON.stringify({ name: "factura", changed: true }));

    assert.deepEqual(await scanDoctypes(bench), [
      {
        path: "apps/myapp/myapp/módulo/doctype/factura/factura.json",
        app: "myapp",
        module: "módulo",
        name: "factura",
        dirty: true,
      },
    ]);
  });
});

test("a staged rename is dirty under its new path only", async () => {
  await withBench(async (bench) => {
    const appDir = join(bench, "apps", "myapp");
    initRepo(appDir);
    writeDoctype(appDir, "myapp", "accounts", "invoice");
    writeDoctype(appDir, "myapp", "accounts", "stable");
    commitAll(appDir);
    git(appDir, "mv", join("myapp", "accounts"), join("myapp", "billing"));

    const entries = await scanDoctypes(bench);
    assert.deepEqual(
      entries.map((e) => [e.path, e.dirty]).sort(),
      [
        ["apps/myapp/myapp/billing/doctype/invoice/invoice.json", true],
        ["apps/myapp/myapp/billing/doctype/stable/stable.json", true],
      ],
    );
  });
});

test("a rename mixed with an untouched sibling app keeps the sibling clean", async () => {
  await withBench(async (bench) => {
    initRepo(bench);
    writeDoctype(join(bench, "apps", "a"), "a", "m", "one");
    writeDoctype(join(bench, "apps", "b"), "b", "m", "two");
    commitAll(bench);
    git(bench, "mv", join("apps", "b", "b", "m"), join("apps", "b", "b", "n"));

    const byApp = Object.fromEntries((await scanDoctypes(bench)).map((e) => [e.app, e.dirty]));
    assert.deepEqual(byApp, { a: false, b: true });
  });
});
