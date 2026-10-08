import { describe, expect, it } from "vitest";
import { TOOL_CATEGORIES, TOOLS } from "../../lib/tools";

describe("tool categories", () => {
  it("has exactly three categories in the requested order", () => {
    expect(TOOL_CATEGORIES.map((category) => category.key)).toEqual(["pdf", "image", "general"]);
    for (const category of TOOL_CATEGORIES) {
      expect(category.en.length).toBeGreaterThan(0);
      expect(category.th.length).toBeGreaterThan(0);
      expect(category.descriptionEn.length).toBeGreaterThan(0);
      expect(category.descriptionTh.length).toBeGreaterThan(0);
    }
  });

  it("includes every visible tool exactly once without exposing legacy image routes", () => {
    const categoryIds = TOOL_CATEGORIES.flatMap((category) => category.toolIds);
    expect(new Set(categoryIds).size).toBe(categoryIds.length);
    expect([...categoryIds].sort()).toEqual(TOOLS.map((tool) => tool.id).sort());
    expect(categoryIds).not.toContain("image-resize");
    expect(categoryIds).not.toContain("image-compress");
  });

  it("groups PDF, image and everyday utilities under the expected headings", () => {
    const [pdf, image, general] = TOOL_CATEGORIES;
    expect(pdf.toolIds).toEqual(expect.arrayContaining(["merge-pdf", "split-pdf", "compress-pdf", "word-to-pdf", "pdf-to-word"]));
    expect(image.toolIds).toEqual(expect.arrayContaining(["image-convert", "watermark"]));
    expect(general.toolIds).toEqual(expect.arrayContaining(["html-to-pdf", "pdf-to-html"]));
  });
});
