import { describe, expect, it } from "vitest";
import { getAspectCropRect, getRotatedBounds } from "../../lib/image-tools";

describe("getAspectCropRect", () => {
  it("fits a landscape crop inside the image", () => {
    expect(getAspectCropRect(1200, 900, 16 / 9)).toEqual({
      x: 0,
      y: 112.5,
      width: 1200,
      height: 675,
    });
  });

  it("clamps a moved crop to the source bounds", () => {
    const crop = getAspectCropRect(1200, 900, 1, 1, 0);
    expect(crop).toEqual({ x: 300, y: 0, width: 900, height: 900 });
  });

  it("returns the full image for an invalid aspect", () => {
    expect(getAspectCropRect(640, 480, 0)).toEqual({ x: 0, y: 0, width: 640, height: 480 });
  });
});

describe("getRotatedBounds", () => {
  it("swaps dimensions at a quarter turn", () => {
    const bounds = getRotatedBounds(1200, 800, 90);
    expect(bounds.width).toBeCloseTo(800, 5);
    expect(bounds.height).toBeCloseTo(1200, 5);
  });

  it("expands bounds for a custom angle", () => {
    const bounds = getRotatedBounds(100, 100, 45);
    expect(bounds.width).toBeCloseTo(Math.sqrt(2) * 100, 5);
    expect(bounds.height).toBeCloseTo(Math.sqrt(2) * 100, 5);
  });
});
