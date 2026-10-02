import { describe, expect, it } from "vitest";
import { isExternalFileDrag } from "../../lib/file-intake";

describe("isExternalFileDrag", () => {
  it("returns true when event contains external Files", () => {
    const fakeEvent = {
      dataTransfer: {
        types: ["Files"],
      } as unknown as DataTransfer,
    };
    expect(isExternalFileDrag(fakeEvent)).toBe(true);
  });

  it("returns false for internal reorder drags", () => {
    const fakeEvent = {
      dataTransfer: {
        types: ["application/x-fastfiles-reorder"],
      } as unknown as DataTransfer,
    };
    expect(isExternalFileDrag(fakeEvent)).toBe(false);
  });

  it("returns false when types does not contain Files", () => {
    const fakeEvent = {
      dataTransfer: {
        types: ["text/plain"],
      } as unknown as DataTransfer,
    };
    expect(isExternalFileDrag(fakeEvent)).toBe(false);
  });

  it("returns false when dataTransfer is null", () => {
    expect(isExternalFileDrag({ dataTransfer: null })).toBe(false);
  });
});
