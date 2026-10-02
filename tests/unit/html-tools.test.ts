import { describe, expect, it } from "vitest";
import { groupKind, kindOf, searchTools, toolsFor } from "../../lib/tools";

function mockFile(name: string, type: string) {
  return { name, type } as File;
}

describe("HTML converter tool routing", () => {
  it("detects HTML files by MIME type or extension", () => {
    expect(kindOf(mockFile("document.html", ""))).toBe("html");
    expect(kindOf(mockFile("document.htm", "application/octet-stream"))).toBe("html");
    expect(kindOf(mockFile("document", "text/html"))).toBe("html");
  });

  it("offers only HTML-compatible actions for an HTML upload", () => {
    const file = mockFile("document.html", "text/html");
    expect(groupKind([file])).toBe("html");
    expect(toolsFor([file]).map((tool) => tool.id)).toEqual(["html-to-pdf"]);
  });

  it("finds both converters through English and Thai aliases", () => {
    expect(searchTools("pdf html").map((tool) => tool.id)).toEqual(expect.arrayContaining(["pdf-to-html", "html-to-pdf"]));
    expect(searchTools("เว็บเป็น pdf").map((tool) => tool.id)).toContain("html-to-pdf");
  });
});
