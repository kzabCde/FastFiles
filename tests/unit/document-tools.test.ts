import { describe, expect, it } from "vitest";
import {
  calculateDocxPageSliceCount,
  detectPdfColumns,
  groupPdfTextItems,
  reconstructPdfBlocks,
  replaceExtension,
  type PdfLayoutLine,
} from "../../lib/document-tools";

describe("calculateDocxPageSliceCount", () => {
  it("keeps a normal rendered page as one source-sized page", () => {
    expect(calculateDocxPageSliceCount(1122.52, 1122.52)).toBe(1);
    expect(calculateDocxPageSliceCount(1123.2, 1122.52)).toBe(1);
  });

  it("splits overflow into additional source-sized pages", () => {
    expect(calculateDocxPageSliceCount(2245.04, 1122.52)).toBe(2);
    expect(calculateDocxPageSliceCount(2800, 1122.52)).toBe(3);
  });
});

describe("replaceExtension", () => {
  it("replaces the input extension without duplicating it", () => {
    expect(replaceExtension("report.pdf", "docx")).toBe("report.docx");
    expect(replaceExtension("assignment.docx", "pdf")).toBe("assignment.pdf");
    expect(replaceExtension("archive.final.docx", "pdf")).toBe("archive.final.pdf");
  });
});

describe("groupPdfTextItems", () => {
  it("groups positioned text into lines and keeps large horizontal gaps as segments", () => {
    const lines = groupPdfTextItems([
      { str: "Name", transform: [11, 0, 0, 11, 40, 700], width: 32, fontName: "Helvetica" },
      { str: "Score", transform: [11, 0, 0, 11, 230, 700], width: 34, fontName: "Helvetica" },
      { str: "Alice", transform: [11, 0, 0, 11, 40, 680], width: 35, fontName: "Helvetica" },
      { str: "95", transform: [11, 0, 0, 11, 230, 680], width: 15, fontName: "Helvetica" },
    ], 595);

    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe("Name Score");
    expect(lines[0].segments.map((segment) => segment.text)).toEqual(["Name", "Score"]);
    expect(lines[1].segments.map((segment) => segment.text)).toEqual(["Alice", "95"]);
  });
});

describe("detectPdfColumns", () => {
  it("detects two sustained text columns", () => {
    const lines: PdfLayoutLine[] = [
      line("Left one", 42, 700, 190),
      line("Left two", 42, 670, 190),
      line("Left three", 42, 640, 190),
      line("Right one", 330, 700, 190),
      line("Right two", 330, 670, 190),
      line("Right three", 330, 640, 190),
    ];
    expect(detectPdfColumns(lines, 595)).toBe(2);
  });
});

describe("reconstructPdfBlocks", () => {
  it("infers headings and reconstructs simple aligned tables", () => {
    const lines: PdfLayoutLine[] = [
      { ...line("Quarterly report", 50, 760, 300), fontSize: 20, bold: true },
      line("Overview of the quarter.", 50, 720, 350),
      tableLine(["Name", "Score"], [50, 250], 680),
      tableLine(["Alice", "95"], [50, 250], 660),
      tableLine(["Bob", "90"], [50, 250], 640),
    ];

    const blocks = reconstructPdfBlocks(lines, 595);
    expect(blocks[0]).toMatchObject({ type: "heading", level: 1, text: "Quarterly report" });
    expect(blocks.some((block) => block.type === "paragraph" && block.text.includes("Overview"))).toBe(true);
    const table = blocks.find((block) => block.type === "table");
    expect(table).toEqual({
      type: "table",
      rows: [
        ["Name", "Score"],
        ["Alice", "95"],
        ["Bob", "90"],
      ],
    });
  });
});

function line(text: string, x: number, y: number, width: number): PdfLayoutLine {
  return {
    text,
    x,
    y,
    width,
    fontSize: 11,
    fontName: "Helvetica",
    bold: false,
    italic: false,
    segments: [{ text, x, width }],
    column: 0,
  };
}

function tableLine(texts: string[], xs: number[], y: number): PdfLayoutLine {
  const segments = texts.map((text, index) => ({ text, x: xs[index], width: 60 }));
  return {
    text: texts.join(" "),
    x: xs[0],
    y,
    width: xs.at(-1)! - xs[0] + 60,
    fontSize: 11,
    fontName: "Helvetica",
    bold: false,
    italic: false,
    segments,
    column: 0,
  };
}
