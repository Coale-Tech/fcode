import { describe, expect, it } from "bun:test";
import { applyMemoryCharCap } from "../src/memory-backend/injection-tracker";

describe("applyMemoryCharCap", () => {
	const text = "alpha\n\nbravo bravo\n\ncharlie";

	it("leaves text alone when unlimited or already within the cap", () => {
		expect(applyMemoryCharCap(text, 0)).toBe(text);
		expect(applyMemoryCharCap(text, text.length)).toBe(text);
	});

	it("cuts on an entry boundary, never mid-entry", () => {
		expect(applyMemoryCharCap(text, 15)).toBe("alpha");
		expect(applyMemoryCharCap(text, 25)).toBe("alpha\n\nbravo bravo");
	});

	it("hard-cuts when no boundary precedes the cap", () => {
		expect(applyMemoryCharCap("abcdefghij", 4)).toBe("abcd");
	});
});
