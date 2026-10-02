import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";

export type ConversionQuality = "high" | "moderate" | "limited";
export type ConversionProgress = (done: number, total: number, detail?: string) => void;

export type DocxAnalysis = {
  paragraphs: number;
  tables: number;
  images: number;
  estimatedPages: number;
  quality: ConversionQuality;
  complexFeatures: string[];
  pageWidth: number;
  pageHeight: number;
};

export type PdfWordAnalysis = {
  pages: number;
  hasText: boolean;
  textCharacters: number;
  images: number;
  likelyScanned: boolean;
  possibleColumns: boolean;
  possibleTables: boolean;
  quality: ConversionQuality;
  pageWidth: number;
  pageHeight: number;
};

export type PdfTextItemInput = {
  str: string;
  transform?: ArrayLike<number>;
  width?: number;
  height?: number;
  fontName?: string;
  hasEOL?: boolean;
};

export type PdfLayoutSegment = {
  text: string;
  x: number;
  width: number;
};

export type PdfLayoutLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontName?: string;
  bold: boolean;
  italic: boolean;
  segments: PdfLayoutSegment[];
  column?: number;
};

export type PdfDocumentBlock =
  | { type: "heading"; level: 1 | 2; text: string; bold?: boolean; italic?: boolean }
  | { type: "paragraph"; text: string; bold?: boolean; italic?: boolean }
  | { type: "table"; rows: string[][] };

type DocxRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  fontSize: number;
  color: string;
  pageBreak: boolean;
  image?: DocxImage;
};

type DocxImage = {
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
};

type DocxParagraphBlock = {
  type: "paragraph";
  runs: DocxRun[];
  align: "left" | "center" | "right";
  spacingBefore: number;
  spacingAfter: number;
  headingLevel?: 1 | 2;
  list: boolean;
  pageBreakBefore: boolean;
};

type DocxTableBlock = {
  type: "table";
  rows: string[][];
};

type DocxBlock = DocxParagraphBlock | DocxTableBlock;

type ParsedDocx = {
  blocks: DocxBlock[];
  pageWidth: number;
  pageHeight: number;
  marginTop: number;
  marginRight: number;
  marginBottom: number;
  marginLeft: number;
  header: string;
  footer: string;
};

type PdfPageModel = {
  width: number;
  height: number;
  blocks: PdfDocumentBlock[];
  images: PdfImageAsset[];
};

type PdfImageAsset = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

type PdfJsModule = typeof import("pdfjs-dist");

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const EMU_PER_POINT = 12700;
const TWIPS_PER_POINT = 20;

let pdfWorkerConfigured = false;

async function getPdfJs(): Promise<PdfJsModule> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfWorkerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    pdfWorkerConfigured = true;
  }
  return pdfjs;
}

export function replaceExtension(name: string, extension: "pdf" | "docx") {
  const base = name.replace(/\.[^.]+$/, "") || "fastfiles-document";
  return `${base}.${extension}`;
}

export async function validateDocx(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const contentTypes = zip.file("[Content_Types].xml");
  const documentXml = zip.file("word/document.xml");
  if (!contentTypes || !documentXml) {
    throw new Error("This DOCX file is damaged or incomplete.");
  }
  const types = await contentTypes.async("text");
  if (!/wordprocessingml\.document\.main\+xml/i.test(types)) {
    throw new Error("This file does not appear to be a valid DOCX document.");
  }
  return zip;
}

export async function analyzeDocx(file: File): Promise<DocxAnalysis> {
  const zip = await validateDocx(file);
  const xml = await requiredText(zip, "word/document.xml");
  const documentXml = parseXml(xml);
  const paragraphs = elements(documentXml, "p").length;
  const tables = elements(documentXml, "tbl").length;
  const images = elements(documentXml, "drawing").length + elements(documentXml, "pict").length;
  const pageBreaks = elements(documentXml, "br").filter((node) => attribute(node, "type") === "page").length;
  const complexFeatures: string[] = [];
  if (elements(documentXml, "txbxContent").length) complexFeatures.push("text-boxes");
  if (elements(documentXml, "oMath").length || elements(documentXml, "oMathPara").length) complexFeatures.push("equations");
  if (elements(documentXml, "shape").length) complexFeatures.push("legacy-shapes");
  if (elements(documentXml, "altChunk").length) complexFeatures.push("embedded-html");

  const setup = readPageSetup(documentXml);
  const quality: ConversionQuality = complexFeatures.length
    ? "moderate"
    : tables > 3 || images > 5
      ? "moderate"
      : "high";

  return {
    paragraphs,
    tables,
    images,
    estimatedPages: Math.max(1, pageBreaks + 1),
    quality,
    complexFeatures,
    pageWidth: setup.pageWidth,
    pageHeight: setup.pageHeight,
  };
}

export async function analyzePdfForWord(file: File): Promise<PdfWordAnalysis> {
  const pdfjs = await getPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const pageCount = doc.numPages;
  let textCharacters = 0;
  let images = 0;
  let possibleColumns = false;
  let possibleTables = false;
  let pageWidth = A4_WIDTH;
  let pageHeight = A4_HEIGHT;

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      if (pageNumber === 1) {
        pageWidth = viewport.width;
        pageHeight = viewport.height;
      }
      const content = await page.getTextContent();
      const items = content.items
        .filter((item) => "str" in item && "transform" in item)
        .map((item) => {
          const textItem = item as unknown as PdfTextItemInput;
          return {
            str: textItem.str,
            transform: textItem.transform,
            width: textItem.width,
            height: textItem.height,
            fontName: textItem.fontName,
            hasEOL: textItem.hasEOL,
          };
        });
      textCharacters += items.reduce((sum, item) => sum + item.str.trim().length, 0);
      const lines = groupPdfTextItems(items, viewport.width);
      possibleColumns ||= detectPdfColumns(lines, viewport.width) > 1;
      possibleTables ||= detectTableRuns(lines).some((run) => run.length >= 2);
      images += await countPageImages(page, pdfjs);
      page.cleanup();
      await yieldToBrowser();
    }
  } finally {
    await doc.destroy();
  }

  const hasText = textCharacters > 0;
  const likelyScanned = textCharacters < Math.max(12, pageCount * 8) && images > 0;
  const quality: ConversionQuality = !hasText || likelyScanned
    ? "limited"
    : possibleColumns || possibleTables || images > 3
      ? "moderate"
      : "high";

  return {
    pages: pageCount,
    hasText,
    textCharacters,
    images,
    likelyScanned,
    possibleColumns,
    possibleTables,
    quality,
    pageWidth,
    pageHeight,
  };
}

export function groupPdfTextItems(items: PdfTextItemInput[], pageWidth = A4_WIDTH): PdfLayoutLine[] {
  type Positioned = {
    text: string;
    x: number;
    y: number;
    width: number;
    fontSize: number;
    fontName?: string;
    bold: boolean;
    italic: boolean;
    hasEOL: boolean;
  };

  const positioned: Positioned[] = items
    .map((item) => {
      const transform = item.transform;
      const x = Number(transform?.[4] ?? 0);
      const y = Number(transform?.[5] ?? 0);
      const matrixFontSize = Math.hypot(Number(transform?.[0] ?? 0), Number(transform?.[1] ?? 0));
      const fontSize = Math.max(5, Number(item.height) || matrixFontSize || 11);
      const text = item.str.replace(/\s+/g, " ").trim();
      const fontName = item.fontName;
      return {
        text,
        x,
        y,
        width: Math.max(0, Number(item.width) || Math.max(1, text.length) * fontSize * 0.48),
        fontSize,
        fontName,
        bold: /bold|black|semibold|demi/i.test(fontName ?? ""),
        italic: /italic|oblique/i.test(fontName ?? ""),
        hasEOL: Boolean(item.hasEOL),
      };
    })
    .filter((item) => item.text && Number.isFinite(item.x) && Number.isFinite(item.y))
    .sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x);

  const lineGroups: Positioned[][] = [];
  for (const item of positioned) {
    const candidate = lineGroups.find((group) => {
      const reference = group[0];
      const tolerance = Math.max(2.5, Math.min(reference.fontSize, item.fontSize) * 0.38);
      return Math.abs(reference.y - item.y) <= tolerance;
    });
    if (candidate) candidate.push(item);
    else lineGroups.push([item]);
  }

  const lines = lineGroups.map((group) => {
    group.sort((a, b) => a.x - b.x);
    const fontSize = median(group.map((item) => item.fontSize)) || 11;
    const segments: PdfLayoutSegment[] = [];
    let currentText = "";
    let currentX = group[0].x;
    let currentRight = group[0].x;
    let previous: Positioned | undefined;

    const flushSegment = () => {
      const text = normalizeInlineText(currentText);
      if (text) segments.push({ text, x: currentX, width: Math.max(1, currentRight - currentX) });
      currentText = "";
    };

    for (const item of group) {
      const gap = previous ? item.x - (previous.x + previous.width) : 0;
      if (previous && gap > Math.max(28, fontSize * 2.2)) {
        flushSegment();
        currentX = item.x;
      }
      const needsSpace = Boolean(currentText) && !/^([,.;:!?%)\]])/.test(item.text) && !/[([{\/]$/.test(currentText);
      currentText += `${needsSpace ? " " : ""}${item.text}`;
      currentRight = Math.max(currentRight, item.x + item.width);
      previous = item;
      if (item.hasEOL) {
        // PDF.js EOL markers confirm the line boundary but the y-group already owns it.
      }
    }
    flushSegment();

    const text = normalizeInlineText(segments.map((segment) => segment.text).join(" "));
    const x = Math.min(...group.map((item) => item.x));
    const right = Math.max(...group.map((item) => item.x + item.width));
    return {
      text,
      x,
      y: group.reduce((sum, item) => sum + item.y, 0) / group.length,
      width: Math.min(pageWidth, Math.max(1, right - x)),
      fontSize,
      fontName: group.find((item) => item.fontName)?.fontName,
      bold: group.some((item) => item.bold),
      italic: group.some((item) => item.italic),
      segments,
    } satisfies PdfLayoutLine;
  });

  return lines.sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x);
}

export function detectPdfColumns(lines: PdfLayoutLine[], pageWidth: number) {
  const meaningful = lines.filter((line) => line.text.length > 3 && line.width < pageWidth * 0.72);
  if (meaningful.length < 6) return 1;
  const midpoint = pageWidth / 2;
  const left = meaningful.filter((line) => line.x < midpoint * 0.9);
  const right = meaningful.filter((line) => line.x > midpoint * 0.88);
  if (left.length < 3 || right.length < 3) return 1;

  const leftYs = left.map((line) => line.y);
  const rightYs = right.map((line) => line.y);
  const overlapTop = Math.min(Math.max(...leftYs), Math.max(...rightYs));
  const overlapBottom = Math.max(Math.min(...leftYs), Math.min(...rightYs));
  const overlap = Math.max(0, overlapTop - overlapBottom);
  const span = Math.max(1, Math.max(...lines.map((line) => line.y)) - Math.min(...lines.map((line) => line.y)));
  return overlap / span > 0.3 ? 2 : 1;
}

export function reconstructPdfBlocks(lines: PdfLayoutLine[], pageWidth = A4_WIDTH): PdfDocumentBlock[] {
  if (!lines.length) return [];
  const columnCount = detectPdfColumns(lines, pageWidth);
  const ordered: PdfLayoutLine[] = orderLines(lines, pageWidth, columnCount);
  const sizes = ordered.map((line) => line.fontSize).filter((size) => Number.isFinite(size));
  const baseFont = median(sizes) || 11;
  const tableRuns = detectTableRuns(ordered);
  const tableStart = new Map<number, PdfLayoutLine[]>();
  const consumed = new Set<number>();

  for (const run of tableRuns) {
    if (run.length < 2) continue;
    const firstIndex = ordered.indexOf(run[0]);
    if (firstIndex < 0) continue;
    tableStart.set(firstIndex, run);
    run.forEach((line) => consumed.add(ordered.indexOf(line)));
  }

  const blocks: PdfDocumentBlock[] = [];
  let paragraphLines: PdfLayoutLine[] = [];

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    const text = paragraphLines
      .map((line) => line.text)
      .join(" ")
      .replace(/-\s+([a-z])/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (text) {
      blocks.push({
        type: "paragraph",
        text,
        bold: paragraphLines.every((line) => line.bold),
        italic: paragraphLines.every((line) => line.italic),
      });
    }
    paragraphLines = [];
  };

  for (let index = 0; index < ordered.length; index += 1) {
    const line = ordered[index];
    const table = tableStart.get(index);
    if (table) {
      flushParagraph();
      blocks.push({ type: "table", rows: table.map((row) => row.segments.map((segment) => segment.text)) });
      index += table.length - 1;
      continue;
    }
    if (consumed.has(index)) continue;

    const headingLevel = line.fontSize >= baseFont * 1.45 ? 1 : line.fontSize >= baseFont * 1.2 ? 2 : null;
    if (headingLevel) {
      flushParagraph();
      blocks.push({ type: "heading", level: headingLevel, text: line.text, bold: line.bold, italic: line.italic });
      continue;
    }

    const previous = paragraphLines.at(-1);
    const newParagraph = previous
      ? previous.column !== line.column
        || Math.abs(previous.x - line.x) > Math.max(16, baseFont * 1.5)
        || Math.abs(previous.y - line.y) > Math.max(previous.fontSize, line.fontSize) * 1.9
      : false;
    if (newParagraph) flushParagraph();
    paragraphLines.push(line);
  }

  flushParagraph();
  return blocks;
}

export async function convertPdfToDocx(
  file: File,
  onProgress?: ConversionProgress,
  options?: { signal?: AbortSignal; analysis?: PdfWordAnalysis },
): Promise<{ blob: Blob; analysis: PdfWordAnalysis; extractedImages: number }> {
  const signal = options?.signal;
  assertNotAborted(signal);
  const analysis = options?.analysis ?? await analyzePdfForWord(file);
  assertNotAborted(signal);
  if (!analysis.hasText || analysis.likelyScanned) {
    throw new Error("Scanned document detected. OCR is required before FastFiles can create a reliable editable Word document.");
  }

  const pdfjs = await getPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  assertNotAborted(signal);
  const pages: PdfPageModel[] = [];
  let extractedImages = 0;

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      assertNotAborted(signal);
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items
        .filter((item) => "str" in item && "transform" in item)
        .map((item) => {
          const textItem = item as unknown as PdfTextItemInput;
          return {
            str: textItem.str,
            transform: textItem.transform,
            width: textItem.width,
            height: textItem.height,
            fontName: textItem.fontName,
            hasEOL: textItem.hasEOL,
          };
        });
      const lines = groupPdfTextItems(items, viewport.width);
      const blocks = reconstructPdfBlocks(lines, viewport.width);
      const images = await extractPageImages(page, pdfjs).catch(() => [] as PdfImageAsset[]);
      extractedImages += images.length;
      pages.push({ width: viewport.width, height: viewport.height, blocks, images });
      page.cleanup();
      onProgress?.(pageNumber, doc.numPages, `Page ${pageNumber} of ${doc.numPages}`);
      await yieldToBrowser();
      assertNotAborted(signal);
    }
  } finally {
    await doc.destroy();
  }

  assertNotAborted(signal);
  const blob = await buildEditableDocx(pages);
  assertNotAborted(signal);
  return { blob, analysis, extractedImages };
}

export async function convertDocxToPdf(
  file: File,
  onProgress?: ConversionProgress,
  options?: { signal?: AbortSignal; analysis?: DocxAnalysis },
): Promise<{ blob: Blob; pageCount: number; analysis: DocxAnalysis }> {
  const signal = options?.signal;
  assertNotAborted(signal);
  const analysis = options?.analysis ?? await analyzeDocx(file);
  assertNotAborted(signal);
  const parsed = await parseDocx(file);
  assertNotAborted(signal);
  const pdf = await PDFDocument.create();
  const scale = canvasScaleForPage(parsed.pageWidth, parsed.pageHeight);
  let canvas = createPageCanvas(parsed.pageWidth, parsed.pageHeight, scale);
  let context = required2d(canvas);
  let y = parsed.marginTop;
  let pageCount = 0;

  const beginPage = () => {
    canvas = createPageCanvas(parsed.pageWidth, parsed.pageHeight, scale);
    context = required2d(canvas);
    context.save();
    context.scale(scale, scale);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, parsed.pageWidth, parsed.pageHeight);
    drawHeaderFooter(context, parsed);
    context.restore();
    y = parsed.marginTop + (parsed.header ? 18 : 0);
  };

  const finishPage = async () => {
    assertNotAborted(signal);
    const pngBlob = await canvasToBlob(canvas, "image/png", 1);
    assertNotAborted(signal);
    const embedded = await pdf.embedPng(await pngBlob.arrayBuffer());
    const page = pdf.addPage([parsed.pageWidth, parsed.pageHeight]);
    page.drawImage(embedded, { x: 0, y: 0, width: parsed.pageWidth, height: parsed.pageHeight });
    pageCount += 1;
    onProgress?.(pageCount, Math.max(analysis.estimatedPages, pageCount), `Rendered page ${pageCount}`);
    canvas.width = 1;
    canvas.height = 1;
    await yieldToBrowser();
    assertNotAborted(signal);
  };

  const ensureSpace = async (height: number) => {
    if (y + height <= parsed.pageHeight - parsed.marginBottom - (parsed.footer ? 18 : 0)) return;
    await finishPage();
    beginPage();
  };

  beginPage();

  for (const block of parsed.blocks) {
    assertNotAborted(signal);
    if (block.type === "paragraph") {
      if (block.pageBreakBefore && y > parsed.marginTop + 8) {
        await finishPage();
        beginPage();
      }

      y += block.spacingBefore;
      const textRuns = block.runs.filter((run) => run.text);
      const imageRuns = block.runs.filter((run) => run.image);

      if (textRuns.length || block.list) {
        const normalizedRuns = block.list
          ? [{ text: "• ", bold: false, italic: false, underline: false, fontSize: textRuns[0]?.fontSize ?? 11, color: "#111111", pageBreak: false }, ...textRuns]
          : textRuns;
        const lines = layoutDocxLines(context, normalizedRuns, parsed.pageWidth - parsed.marginLeft - parsed.marginRight, block.headingLevel);
        const estimatedHeight = lines.reduce((sum, line) => sum + line.height, 0);
        await ensureSpace(estimatedHeight + block.spacingAfter);
        context.save();
        context.scale(scale, scale);
        for (const line of lines) {
          const available = parsed.pageWidth - parsed.marginLeft - parsed.marginRight;
          const x = block.align === "center"
            ? parsed.marginLeft + (available - line.width) / 2
            : block.align === "right"
              ? parsed.pageWidth - parsed.marginRight - line.width
              : parsed.marginLeft;
          drawDocxLine(context, line, x, y);
          y += line.height;
        }
        context.restore();
      }

      for (const run of imageRuns) {
        if (!run.image) continue;
        const maxWidth = parsed.pageWidth - parsed.marginLeft - parsed.marginRight;
        const width = Math.min(run.image.width, maxWidth);
        const height = run.image.height * (width / Math.max(1, run.image.width));
        await ensureSpace(height + 8);
        const source = await decodeImage(run.image.bytes, run.image.mime);
        context.save();
        context.scale(scale, scale);
        context.drawImage(source.image, parsed.marginLeft, y, width, height);
        context.restore();
        source.cleanup();
        y += height + 8;
      }

      if (block.runs.some((run) => run.pageBreak)) {
        await finishPage();
        beginPage();
      } else {
        y += block.spacingAfter;
      }
    } else {
      const availableWidth = parsed.pageWidth - parsed.marginLeft - parsed.marginRight;
      const columns = Math.max(1, Math.max(...block.rows.map((row) => row.length), 1));
      const cellWidth = availableWidth / columns;
      for (const row of block.rows) {
        const rowLines = row.map((cell) => wrapPlainText(context, cell, cellWidth - 12, 10));
        const rowHeight = Math.max(28, ...rowLines.map((lines) => lines.length * 14 + 12));
        await ensureSpace(rowHeight);
        context.save();
        context.scale(scale, scale);
        row.forEach((cell, column) => {
          const x = parsed.marginLeft + column * cellWidth;
          context.strokeStyle = "#9aa19d";
          context.lineWidth = 0.7;
          context.strokeRect(x, y, cellWidth, rowHeight);
          context.fillStyle = "#111111";
          context.font = '10px Arial, "Noto Sans Thai", sans-serif';
          const lines = rowLines[column] ?? [cell];
          lines.forEach((line, lineIndex) => context.fillText(line, x + 6, y + 15 + lineIndex * 14));
        });
        context.restore();
        y += rowHeight;
      }
      y += 8;
    }
  }

  if (pageCount === 0 || y > parsed.marginTop + 1) await finishPage();
  assertNotAborted(signal);
  const pdfBytes = await pdf.save({ useObjectStreams: true });
  assertNotAborted(signal);
  return { blob: bytesToBlob(pdfBytes, "application/pdf"), pageCount, analysis };
}

async function parseDocx(file: File): Promise<ParsedDocx> {
  const zip = await validateDocx(file);
  const xml = await requiredText(zip, "word/document.xml");
  const relsXml = await optionalText(zip, "word/_rels/document.xml.rels");
  const documentXml = parseXml(xml);
  const relationships = parseRelationships(relsXml);
  const setup = readPageSetup(documentXml);
  const body = elements(documentXml, "body")[0];
  if (!body) throw new Error("This DOCX file does not contain a document body.");

  const blocks: DocxBlock[] = [];
  for (const node of Array.from(body.children)) {
    if (node.localName === "p") blocks.push(await parseDocxParagraph(node, zip, relationships));
    else if (node.localName === "tbl") blocks.push(parseDocxTable(node));
  }

  const sectPr = elements(documentXml, "sectPr").at(-1);
  const header = await readHeaderFooter(zip, relationships, sectPr, "headerReference");
  const footer = await readHeaderFooter(zip, relationships, sectPr, "footerReference");

  return { blocks, ...setup, header, footer };
}

async function parseDocxParagraph(node: Element, zip: JSZip, relationships: Map<string, string>): Promise<DocxParagraphBlock> {
  const pPr = directChild(node, "pPr");
  const styleId = pPr ? attribute(directDescendant(pPr, "pStyle"), "val") : "";
  const headingLevel: 1 | 2 | undefined = /heading\s*1|heading1|title/i.test(styleId) ? 1 : /heading\s*2|heading2|subtitle/i.test(styleId) ? 2 : undefined;
  const jc = pPr ? attribute(directDescendant(pPr, "jc"), "val") : "";
  const align: "left" | "center" | "right" = jc === "center" ? "center" : jc === "right" || jc === "end" ? "right" : "left";
  const spacing = pPr ? directDescendant(pPr, "spacing") : null;
  const spacingBefore = twips(attribute(spacing, "before"), 0);
  const spacingAfter = twips(attribute(spacing, "after"), headingLevel ? 8 : 5);
  const pageBreakBefore = Boolean(pPr && directDescendant(pPr, "pageBreakBefore"));
  const list = Boolean(pPr && directDescendant(pPr, "numPr"));
  const runs: DocxRun[] = [];

  const runNodes: Element[] = [];
  for (const child of Array.from(node.children)) {
    if (child.localName === "r") runNodes.push(child);
    else if (child.localName === "hyperlink") runNodes.push(...Array.from(child.children).filter((element) => element.localName === "r"));
  }

  for (const runNode of runNodes) {
    const rPr = directChild(runNode, "rPr");
    const bold = Boolean(rPr && directDescendant(rPr, "b"));
    const italic = Boolean(rPr && directDescendant(rPr, "i"));
    const underline = Boolean(rPr && directDescendant(rPr, "u"));
    const sizeHalfPoints = Number.parseFloat(attribute(rPr ? directDescendant(rPr, "sz") : null, "val"));
    const fontSize = Number.isFinite(sizeHalfPoints) ? Math.max(6, sizeHalfPoints / 2) : headingLevel === 1 ? 22 : headingLevel === 2 ? 16 : 11;
    const rawColor = attribute(rPr ? directDescendant(rPr, "color") : null, "val");
    const color = /^[0-9a-f]{6}$/i.test(rawColor) ? `#${rawColor}` : "#111111";
    const texts = elements(runNode, "t").map((element) => element.textContent ?? "");
    const tabCount = elements(runNode, "tab").length;
    const breakNodes = elements(runNode, "br");
    const pageBreak = breakNodes.some((element) => attribute(element, "type") === "page");
    let text = texts.join("");
    if (tabCount) text += "\t".repeat(tabCount);

    const drawing = directDescendant(runNode, "drawing") ?? directDescendant(runNode, "pict");
    const image = drawing ? await readDocxImage(drawing, zip, relationships).catch(() => undefined) : undefined;
    if (text || image || pageBreak) runs.push({ text, bold, italic, underline, fontSize, color, pageBreak, image });
  }

  return { type: "paragraph", runs, align, spacingBefore, spacingAfter, headingLevel, list, pageBreakBefore };
}

function parseDocxTable(node: Element): DocxTableBlock {
  const rows = Array.from(node.children)
    .filter((element) => element.localName === "tr")
    .map((row) => Array.from(row.children)
      .filter((element) => element.localName === "tc")
      .map((cell) => elements(cell, "p")
        .map((paragraph) => elements(paragraph, "t").map((text) => text.textContent ?? "").join(""))
        .filter(Boolean)
        .join("\n")));
  return { type: "table", rows };
}

async function readDocxImage(node: Element, zip: JSZip, relationships: Map<string, string>): Promise<DocxImage | undefined> {
  const blip = elements(node, "blip")[0];
  const relationshipId = attribute(blip, "embed");
  if (!relationshipId) return undefined;
  const target = relationships.get(relationshipId);
  if (!target) return undefined;
  const path = normalizeWordTarget(target);
  const entry = zip.file(path);
  if (!entry) return undefined;
  const bytes = await entry.async("uint8array");
  const extent = elements(node, "extent")[0];
  const cx = Number.parseFloat(attribute(extent, "cx"));
  const cy = Number.parseFloat(attribute(extent, "cy"));
  const width = Number.isFinite(cx) ? cx / EMU_PER_POINT : 180;
  const height = Number.isFinite(cy) ? cy / EMU_PER_POINT : 120;
  return { bytes, mime: mimeForPath(path), width, height };
}

function readPageSetup(documentXml: Document) {
  const sectPr = elements(documentXml, "sectPr").at(-1);
  const pgSz = sectPr ? directDescendant(sectPr, "pgSz") : null;
  const pgMar = sectPr ? directDescendant(sectPr, "pgMar") : null;
  const rawWidth = Number.parseFloat(attribute(pgSz, "w"));
  const rawHeight = Number.parseFloat(attribute(pgSz, "h"));
  const pageWidth = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth / TWIPS_PER_POINT : A4_WIDTH;
  const pageHeight = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight / TWIPS_PER_POINT : A4_HEIGHT;
  return {
    pageWidth,
    pageHeight,
    marginTop: twips(attribute(pgMar, "top"), 54),
    marginRight: twips(attribute(pgMar, "right"), 54),
    marginBottom: twips(attribute(pgMar, "bottom"), 54),
    marginLeft: twips(attribute(pgMar, "left"), 54),
  };
}

async function readHeaderFooter(zip: JSZip, relationships: Map<string, string>, sectPr: Element | undefined, localName: "headerReference" | "footerReference") {
  if (!sectPr) return "";
  const reference = elements(sectPr, localName)[0];
  const id = attribute(reference, "id");
  const target = relationships.get(id);
  if (!target) return "";
  const xml = await optionalText(zip, normalizeWordTarget(target));
  if (!xml) return "";
  const documentXml = parseXml(xml);
  return elements(documentXml, "p")
    .map((paragraph) => elements(paragraph, "t").map((text) => text.textContent ?? "").join(""))
    .filter(Boolean)
    .join(" · ");
}

function parseRelationships(xml: string) {
  const result = new Map<string, string>();
  if (!xml) return result;
  const rels = parseXml(xml);
  for (const relationship of elements(rels, "Relationship")) {
    const id = relationship.getAttribute("Id") ?? "";
    const target = relationship.getAttribute("Target") ?? "";
    if (id && target && !/^https?:/i.test(target)) result.set(id, target);
  }
  return result;
}

type LayoutToken = {
  text: string;
  width: number;
  font: string;
  color: string;
  underline: boolean;
  fontSize: number;
};

type LayoutLine = {
  tokens: LayoutToken[];
  width: number;
  height: number;
};

function layoutDocxLines(
  context: CanvasRenderingContext2D,
  runs: Array<Pick<DocxRun, "text" | "bold" | "italic" | "underline" | "fontSize" | "color">>,
  maxWidth: number,
  headingLevel?: 1 | 2,
): LayoutLine[] {
  const lines: LayoutLine[] = [];
  let current: LayoutToken[] = [];
  let currentWidth = 0;
  let currentHeight = headingLevel === 1 ? 29 : headingLevel === 2 ? 22 : 15;

  const flush = () => {
    if (!current.length) return;
    lines.push({ tokens: current, width: currentWidth, height: currentHeight });
    current = [];
    currentWidth = 0;
    currentHeight = headingLevel === 1 ? 29 : headingLevel === 2 ? 22 : 15;
  };

  for (const run of runs) {
    const fontSize = headingLevel === 1 ? Math.max(20, run.fontSize) : headingLevel === 2 ? Math.max(15, run.fontSize) : run.fontSize;
    const font = cssFont(fontSize, run.bold || Boolean(headingLevel), run.italic);
    const rawTokens = tokenizeForWrapping(run.text);
    for (const raw of rawTokens) {
      if (raw === "\n") {
        flush();
        continue;
      }
      context.save();
      context.font = font;
      const tokenParts = splitTokenToFit(context, raw, maxWidth);
      context.restore();
      for (const text of tokenParts) {
        context.save();
        context.font = font;
        const width = context.measureText(text).width;
        context.restore();
        if (current.length && currentWidth + width > maxWidth) flush();
        current.push({ text, width, font, color: run.color, underline: run.underline, fontSize });
        currentWidth += width;
        currentHeight = Math.max(currentHeight, fontSize * 1.35);
      }
    }
  }

  flush();
  return lines.length ? lines : [{ tokens: [], width: 0, height: headingLevel === 1 ? 29 : headingLevel === 2 ? 22 : 15 }];
}

function drawDocxLine(context: CanvasRenderingContext2D, line: LayoutLine, x: number, y: number) {
  let cursor = x;
  for (const token of line.tokens) {
    context.font = token.font;
    context.fillStyle = token.color;
    context.textBaseline = "top";
    context.fillText(token.text, cursor, y);
    if (token.underline && token.text.trim()) {
      context.strokeStyle = token.color;
      context.lineWidth = 0.7;
      context.beginPath();
      context.moveTo(cursor, y + token.fontSize + 1);
      context.lineTo(cursor + token.width, y + token.fontSize + 1);
      context.stroke();
    }
    cursor += token.width;
  }
}

function wrapPlainText(context: CanvasRenderingContext2D, text: string, maxWidth: number, fontSize: number) {
  context.save();
  context.font = cssFont(fontSize, false, false);
  const tokens = tokenizeForWrapping(text);
  const lines: string[] = [];
  let current = "";
  for (const token of tokens) {
    if (token === "\n") {
      if (current) lines.push(current.trimEnd());
      current = "";
      continue;
    }
    for (const piece of splitTokenToFit(context, token, maxWidth)) {
      const candidate = current + piece;
      if (current && context.measureText(candidate).width > maxWidth) {
        lines.push(current.trimEnd());
        current = piece.trimStart();
      } else {
        current = candidate;
      }
    }
  }
  if (current || !lines.length) lines.push(current.trimEnd());
  context.restore();
  return lines;
}

function tokenizeForWrapping(text: string) {
  const normalized = text.replace(/\r\n?/g, "\n");
  const pieces: string[] = [];
  normalized.split(/(\n|\s+)/).forEach((piece) => {
    if (!piece) return;
    if (piece.includes("\n")) pieces.push("\n");
    else pieces.push(piece);
  });
  return pieces;
}

function splitTokenToFit(context: CanvasRenderingContext2D, token: string, maxWidth: number) {
  if (/^\s+$/.test(token) || context.measureText(token).width <= maxWidth) return [token];
  const graphemes = typeof Intl !== "undefined" && "Segmenter" in Intl
    ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(token), (part) => part.segment)
    : Array.from(token);
  const chunks: string[] = [];
  let current = "";
  for (const grapheme of graphemes) {
    const next = current + grapheme;
    if (current && context.measureText(next).width > maxWidth) {
      chunks.push(current);
      current = grapheme;
    } else current = next;
  }
  if (current) chunks.push(current);
  return chunks;
}

function cssFont(size: number, bold: boolean, italic: boolean) {
  return `${italic ? "italic " : ""}${bold ? "700 " : "400 "}${Math.max(6, size)}px Arial, "Noto Sans Thai", "Tahoma", sans-serif`;
}

function createPageCanvas(width: number, height: number, scale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  return canvas;
}

function canvasScaleForPage(width: number, height: number) {
  const preferred = 2;
  const maxPixels = 12_000_000;
  return Math.max(1, Math.min(preferred, Math.sqrt(maxPixels / Math.max(1, width * height))));
}

function required2d(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas is not available in this browser.");
  return context;
}

function drawHeaderFooter(context: CanvasRenderingContext2D, parsed: ParsedDocx) {
  context.font = '9px Arial, "Noto Sans Thai", sans-serif';
  context.fillStyle = "#59625d";
  context.textBaseline = "top";
  if (parsed.header) {
    const lines = wrapPlainText(context, parsed.header, parsed.pageWidth - parsed.marginLeft - parsed.marginRight, 9);
    lines.slice(0, 2).forEach((line, index) => context.fillText(line, parsed.marginLeft, Math.max(10, parsed.marginTop - 26) + index * 11));
  }
  if (parsed.footer) {
    const lines = wrapPlainText(context, parsed.footer, parsed.pageWidth - parsed.marginLeft - parsed.marginRight, 9);
    lines.slice(0, 2).forEach((line, index) => context.fillText(line, parsed.marginLeft, parsed.pageHeight - Math.max(28, parsed.marginBottom - 10) + index * 11));
  }
}

async function decodeImage(bytes: Uint8Array, mime: string) {
  const blob = new Blob([copyBytes(bytes)], { type: mime });
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return { image: bitmap as CanvasImageSource, cleanup: () => bitmap.close() };
  }
  const url = URL.createObjectURL(blob);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Unable to decode an embedded DOCX image."));
    element.src = url;
  });
  return { image: image as CanvasImageSource, cleanup: () => URL.revokeObjectURL(url) };
}

async function countPageImages(page: { getOperatorList: () => Promise<{ fnArray: number[] }> }, pdfjs: PdfJsModule) {
  try {
    const list = await page.getOperatorList();
    const ops = pdfjs.OPS as unknown as Record<string, number>;
    const imageOps = new Set([ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintJpegXObject].filter((value) => Number.isFinite(value)));
    return list.fnArray.filter((fn) => imageOps.has(fn)).length;
  } catch {
    return 0;
  }
}

async function extractPageImages(
  page: {
    getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
    objs: { get: (id: string, callback?: (value: unknown) => void) => unknown };
  },
  pdfjs: PdfJsModule,
): Promise<PdfImageAsset[]> {
  if (typeof document === "undefined") return [];
  const list = await page.getOperatorList();
  const ops = pdfjs.OPS as unknown as Record<string, number>;
  const results: PdfImageAsset[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < list.fnArray.length && results.length < 8; index += 1) {
    const fn = list.fnArray[index];
    const args = list.argsArray[index] ?? [];
    let raw: unknown = null;
    let key = `inline-${index}`;

    if (fn === ops.paintInlineImageXObject) {
      raw = args[0];
    } else if (fn === ops.paintImageXObject || fn === ops.paintJpegXObject) {
      key = String(args[0] ?? "");
      if (!key || seen.has(key)) continue;
      seen.add(key);
      raw = await resolvePdfObject(page.objs, key);
    } else continue;

    const asset = await pdfImageToPng(raw).catch(() => null);
    if (asset && asset.width >= 48 && asset.height >= 48) results.push(asset);
  }
  return results;
}

async function resolvePdfObject(store: { get: (id: string, callback?: (value: unknown) => void) => unknown }, id: string) {
  return await new Promise<unknown>((resolve) => {
    let settled = false;
    const done = (value: unknown) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = window.setTimeout(() => done(null), 1200);
    try {
      const immediate = store.get(id, (value) => {
        window.clearTimeout(timer);
        done(value);
      });
      if (immediate !== undefined && immediate !== null) {
        window.clearTimeout(timer);
        done(immediate);
      }
    } catch {
      window.clearTimeout(timer);
      done(null);
    }
  });
}

async function pdfImageToPng(raw: unknown): Promise<PdfImageAsset | null> {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as {
    width?: number;
    height?: number;
    data?: Uint8Array | Uint8ClampedArray;
    bitmap?: ImageBitmap;
  };
  const width = Number(source.width);
  const height = Number(source.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;

  if (source.bitmap) {
    context.drawImage(source.bitmap, 0, 0);
  } else if (source.data) {
    const data = source.data;
    const rgba = new Uint8ClampedArray(width * height * 4);
    if (data.length === width * height * 4) {
      rgba.set(data);
    } else if (data.length === width * height * 3) {
      for (let index = 0, pixel = 0; index < data.length; index += 3, pixel += 4) {
        rgba[pixel] = data[index];
        rgba[pixel + 1] = data[index + 1];
        rgba[pixel + 2] = data[index + 2];
        rgba[pixel + 3] = 255;
      }
    } else if (data.length === width * height) {
      for (let index = 0, pixel = 0; index < data.length; index += 1, pixel += 4) {
        rgba[pixel] = data[index];
        rgba[pixel + 1] = data[index];
        rgba[pixel + 2] = data[index];
        rgba[pixel + 3] = 255;
      }
    } else return null;
    context.putImageData(new ImageData(rgba, width, height), 0, 0);
  } else return null;

  const blob = await canvasToBlob(canvas, "image/png", 1);
  canvas.width = 1;
  canvas.height = 1;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

async function buildEditableDocx(pages: PdfPageModel[]) {
  const zip = new JSZip();
  const first = pages[0] ?? { width: A4_WIDTH, height: A4_HEIGHT, blocks: [], images: [] };
  const media: Array<{ id: string; target: string; bytes: Uint8Array; width: number; height: number; docPrId: number }> = [];
  let imageCounter = 0;
  let docPrCounter = 1;

  const bodyParts: string[] = [];
  pages.forEach((page, pageIndex) => {
    for (const block of page.blocks) {
      if (block.type === "heading") bodyParts.push(wordParagraph(block.text, block.level === 1 ? "Heading1" : "Heading2", block.bold, block.italic));
      else if (block.type === "paragraph") bodyParts.push(wordParagraph(block.text, "Normal", block.bold, block.italic));
      else bodyParts.push(wordTable(block.rows));
    }

    for (const image of page.images) {
      imageCounter += 1;
      const id = `rIdImage${imageCounter}`;
      const target = `media/image${imageCounter}.png`;
      media.push({ id, target, bytes: image.bytes, width: image.width, height: image.height, docPrId: docPrCounter++ });
      bodyParts.push(wordImageParagraph(id, image.width, image.height, docPrCounter));
    }

    if (pageIndex < pages.length - 1) bodyParts.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  });

  const widthTwips = Math.max(1, Math.round(first.width * TWIPS_PER_POINT));
  const heightTwips = Math.max(1, Math.round(first.height * TWIPS_PER_POINT));
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${WORD_NS}" xmlns:r="${REL_NS}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${bodyParts.join("\n")}
    <w:sectPr>
      <w:pgSz w:w="${widthTwips}" w:h="${heightTwips}"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="360" w:footer="360" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const imageRelationships = media.map((image) => `<Relationship Id="${image.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${image.target}"/>`).join("");
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${imageRelationships}
</Relationships>`;

  zip.file("[Content_Types].xml", contentTypesXml(media.length > 0));
  zip.folder("_rels")?.file(".rels", rootRelsXml());
  zip.folder("docProps")?.file("core.xml", corePropsXml());
  zip.folder("docProps")?.file("app.xml", appPropsXml());
  zip.folder("word")?.file("document.xml", documentXml);
  zip.folder("word")?.file("styles.xml", stylesXml());
  zip.folder("word")?.folder("_rels")?.file("document.xml.rels", documentRels);
  media.forEach((image) => zip.folder("word")?.file(image.target, copyBytes(image.bytes)));

  return await zip.generateAsync({
    type: "blob",
    mimeType: DOCX_MIME,
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

function wordParagraph(text: string, style: "Normal" | "Heading1" | "Heading2", bold = false, italic = false) {
  const runProperties = `${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}`;
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r>${runProperties ? `<w:rPr>${runProperties}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function wordTable(rows: string[][]) {
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const cellWidth = Math.floor(9000 / columns);
  const grid = Array.from({ length: columns }, () => `<w:gridCol w:w="${cellWidth}"/>`).join("");
  const body = rows.map((row) => `<w:tr>${Array.from({ length: columns }, (_, index) => {
    const text = row[index] ?? "";
    return `<w:tc><w:tcPr><w:tcW w:w="${cellWidth}" w:type="dxa"/></w:tcPr><w:p><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p></w:tc>`;
  }).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B8BDBA"/><w:left w:val="single" w:sz="4" w:color="B8BDBA"/><w:bottom w:val="single" w:sz="4" w:color="B8BDBA"/><w:right w:val="single" w:sz="4" w:color="B8BDBA"/><w:insideH w:val="single" w:sz="4" w:color="D7DBD8"/><w:insideV w:val="single" w:sz="4" w:color="D7DBD8"/></w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>`;
}

function wordImageParagraph(relationshipId: string, pixelWidth: number, pixelHeight: number, docPrId: number) {
  const widthPoints = Math.min(420, Math.max(48, pixelWidth * 0.75));
  const heightPoints = Math.max(36, pixelHeight * 0.75 * (widthPoints / Math.max(1, pixelWidth * 0.75)));
  const cx = Math.round(widthPoints * EMU_PER_POINT);
  const cy = Math.round(heightPoints * EMU_PER_POINT);
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docPrId}" name="FastFiles image ${docPrId}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="image.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

function contentTypesXml(hasImages: boolean) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${hasImages ? '<Default Extension="png" ContentType="image/png"/>' : ""}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="${WORD_NS}">
  <w:docDefaults><w:rPrDefault><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault/></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
</w:styles>`;
}

function corePropsXml() {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>FastFiles</dc:creator><cp:lastModifiedBy>FastFiles</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
}

function appPropsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>FastFiles</Application></Properties>`;
}

function orderLines(lines: PdfLayoutLine[], pageWidth: number, columns: number) {
  if (columns < 2) return [...lines].sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x).map((line) => ({ ...line, column: 0 }));
  const midpoint = pageWidth / 2;
  const spanning = lines.filter((line) => line.width > pageWidth * 0.62 || (line.x < midpoint * 0.7 && line.x + line.width > midpoint * 1.3));
  const regular = lines.filter((line) => !spanning.includes(line));
  const topSpanning = spanning.filter((line) => line.y >= Math.max(...regular.map((item) => item.y), 0) - 20);
  const otherSpanning = spanning.filter((line) => !topSpanning.includes(line));
  const left = regular.filter((line) => line.x < midpoint).sort((a, b) => b.y - a.y || a.x - b.x).map((line) => ({ ...line, column: 0 }));
  const right = regular.filter((line) => line.x >= midpoint).sort((a, b) => b.y - a.y || a.x - b.x).map((line) => ({ ...line, column: 1 }));
  return [
    ...topSpanning.sort((a, b) => b.y - a.y).map((line) => ({ ...line, column: -1 })),
    ...left,
    ...right,
    ...otherSpanning.sort((a, b) => b.y - a.y).map((line) => ({ ...line, column: 2 })),
  ];
}

function detectTableRuns(lines: PdfLayoutLine[]) {
  const runs: PdfLayoutLine[][] = [];
  let current: PdfLayoutLine[] = [];

  const compatible = (a: PdfLayoutLine, b: PdfLayoutLine) => {
    if (a.segments.length < 2 || b.segments.length !== a.segments.length || a.column !== b.column) return false;
    return a.segments.every((segment, index) => Math.abs(segment.x - b.segments[index].x) <= 24);
  };

  for (const line of lines) {
    if (line.segments.length < 2 || line.segments.length > 6) {
      if (current.length >= 2) runs.push(current);
      current = [];
      continue;
    }
    if (!current.length || compatible(current.at(-1)!, line)) current.push(line);
    else {
      if (current.length >= 2) runs.push(current);
      current = [line];
    }
  }
  if (current.length >= 2) runs.push(current);
  return runs;
}

function normalizeInlineText(value: string) {
  return value
    .replace(/\s+([,.;:!?%)\]])/g, "$1")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function parseXml(xml: string) {
  if (typeof DOMParser === "undefined") throw new Error("XML parsing is not available in this browser.");
  const documentXml = new DOMParser().parseFromString(xml, "application/xml");
  if (documentXml.getElementsByTagName("parsererror").length) throw new Error("The document XML is malformed.");
  return documentXml;
}

function elements(root: Document | Element, localName: string) {
  return Array.from(root.getElementsByTagNameNS("*", localName));
}

function directChild(root: Element, localName: string) {
  return Array.from(root.children).find((child) => child.localName === localName) ?? null;
}

function directDescendant(root: Element, localName: string) {
  return elements(root, localName)[0] ?? null;
}

function attribute(node: Element | null | undefined, localName: string) {
  if (!node) return "";
  for (const attr of Array.from(node.attributes)) {
    if (attr.localName === localName || attr.name === localName || attr.name.endsWith(`:${localName}`)) return attr.value;
  }
  return "";
}

function twips(value: string, fallback: number) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed / TWIPS_PER_POINT) : fallback;
}

function normalizeWordTarget(target: string) {
  const parts = ["word", ...target.replace(/^\//, "").split("/")];
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  }
  return normalized.join("/");
}

function mimeForPath(path: string) {
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.jpe?g$/i.test(path)) return "image/jpeg";
  if (/\.gif$/i.test(path)) return "image/gif";
  if (/\.webp$/i.test(path)) return "image/webp";
  if (/\.bmp$/i.test(path)) return "image/bmp";
  return "application/octet-stream";
}

async function requiredText(zip: JSZip, path: string) {
  const file = zip.file(path);
  if (!file) throw new Error(`Missing DOCX part: ${path}`);
  return await file.async("text");
}

async function optionalText(zip: JSZip, path: string) {
  const file = zip.file(path);
  return file ? await file.async("text") : "";
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function xmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

function copyBytes(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function bytesToBlob(bytes: Uint8Array, type: string) {
  return new Blob([copyBytes(bytes)], { type });
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Unable to encode a document page.")), type, quality);
  });
}

function assertNotAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const error = new Error("Conversion cancelled.");
  error.name = "AbortError";
  throw error;
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}
