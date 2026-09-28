import { describe, expect, it } from "vitest";
import { parsePageRange } from "../../lib/pdf-tools";

describe("parsePageRange", () => {
  it("parses, sorts, and de-duplicates valid pages", () => {
    expect(parsePageRange("6, 1-3, 2, 9-12", 10)).toEqual([0, 1, 2, 5, 8, 9]);
  });

  it("accepts reversed ranges and ignores invalid pages", () => {
    expect(parsePageRange("5-3, 0, nope, 99", 6)).toEqual([2, 3, 4]);
  });
});
