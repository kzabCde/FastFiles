import { describe, expect, it } from "vitest";
import { formatPdfTextItems, getRasterPdfCompressionSettings, parsePageRange } from "../../lib/pdf-tools";

describe("getRasterPdfCompressionSettings", () => {
  it("uses a higher render density and JPEG quality for the balanced preset", () => {
    const balanced = getRasterPdfCompressionSettings("balanced");
    const small = getRasterPdfCompressionSettings("small");
    expect(balanced.dpi).toBeGreaterThan(small.dpi);
    expect(balanced.quality).toBeGreaterThan(small.quality);
  });
});

describe("parsePageRange", () => {
  it("parses, sorts, and de-duplicates valid pages", () => {
    expect(parsePageRange("6, 1-3, 2, 9-12", 10)).toEqual([0, 1, 2, 5, 8, 9]);
  });

  it("accepts reversed ranges and ignores invalid pages", () => {
    expect(parsePageRange("5-3, 0, nope, 99", 6)).toEqual([2, 3, 4]);
  });
});

describe("formatPdfTextItems", () => {
  it("groups fragments into readable lines using PDF positions and EOL markers", () => {
    expect(formatPdfTextItems([
      { str: "Fast", transform: [1, 0, 0, 1, 10, 100] },
      { str: "Files", transform: [1, 0, 0, 1, 42, 100], hasEOL: true },
      { str: "Local", transform: [1, 0, 0, 1, 10, 80] },
      { str: "PDF", transform: [1, 0, 0, 1, 48, 80] },
    ])).toBe("Fast Files\nLocal PDF");
  });

  it("does not add spaces before common punctuation", () => {
    expect(formatPdfTextItems([
      { str: "Hello", transform: [1, 0, 0, 1, 10, 100] },
      { str: ",", transform: [1, 0, 0, 1, 40, 100] },
      { str: "world", transform: [1, 0, 0, 1, 48, 100] },
      { str: "!", transform: [1, 0, 0, 1, 82, 100] },
    ])).toBe("Hello, world!");
  });
});
