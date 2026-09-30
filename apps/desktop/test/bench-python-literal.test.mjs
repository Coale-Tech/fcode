/**
 * `bench execute --kwargs` eval()s its value. The literal we send must
 * round-trip through a real Python eval to the same JSON value.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { register } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "helpers/ts-import-hooks.mjs")));

const { pythonLiteral } = await import("../electron/main/bench/python-literal.ts");

const viaPython = (literal) =>
  JSON.parse(
    execFileSync("python3", ["-c", "import json,sys;print(json.dumps(eval(sys.argv[1])))", literal], {
      encoding: "utf8",
    }),
  );

test("booleans, null, nesting and hostile strings survive a Python eval", () => {
  const value = {
    a: true,
    b: false,
    c: null,
    n: [1, -2.5, 0],
    s: 'quote " back\\ nl\n uni \u2603 \'single\'',
    nested: { list: [{ x: true }, null, "true"] },
  };
  assert.deepEqual(viaPython(pythonLiteral(value)), value);
});

test("rejects non-finite numbers instead of emitting invalid Python", () => {
  assert.throws(() => pythonLiteral({ n: NaN }), /non-finite/);
});
