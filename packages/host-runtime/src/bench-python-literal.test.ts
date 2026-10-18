/**
 * `bench execute --kwargs` eval()s its value. The literal we send must
 * round-trip through a real Python eval to the same JSON value.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "vitest";
import { pythonLiteral } from "./bench-python-literal.js";

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
