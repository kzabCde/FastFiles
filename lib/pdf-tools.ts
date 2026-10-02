import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

export type PdfPageState = {
  sourceIndex: number;
  rotation: number;
};

export type ExportedFile = { name: string; blob: Blob };

export type PdfTextPage = {
  pageNumber: number;
  text: string;
};

export type PdfTextFragment = {
  str: string;
  transform?: ArrayLike<number>;
  hasEOL?: boolean;
};

export type RasterPdfCompressionPreset = "balanced" | "small";

export type RasterPdfCompressionSettings = {
  dpi: number;
  quality: number;
};

export type PageNumberPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export type PageNumberOptions = {
  position: PageNumberPosition;
  startNumber: number;
  startPage: number;
  fontSize: number;
  margin: number;
};

export type PdfMetadata = {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
};

export type PdfMetadataPatch = {
  title: string;
  author: string;
  subject: string;
  keywords: string[];
  creator: string;
  producer: string;
};

export type PdfWatermarkOptions = {
  text: string;
  opacity: number;
  fontSize: number;
  rotation: number;
  color: string;
  position: "top-left" | "top-center" | "top-right" | "center-left" | "center" | "center-right" | "bottom-left" | "bottom-center" | "bottom-right";
  pages: "all" | "odd" | "even" | "custom";
  customPages?: string;
};

export type PdfRotationAngle = 90 | 180 | 270;
export type PdfRotationScope = "all" | "odd" | "even" | "custom";

export type PdfRotateOptions = {
  angle: PdfRotationAngle;
  scope: PdfRotationScope;
  customPages?: string;
};

export type PdfSignatureOptions = {
  imageData: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pages: "all" | "last" | "custom";
  customPages?: string;
};

async function loadPdf(file: File) {
  try {
    return await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/encrypt|password/i.test(message)) throw new Error("Password-protected PDFs are not supported yet.");
    throw new Error("Unable to open this PDF. The file may be corrupted or unsupported.");
  }
}

export async function getPdfPageCount(file: File) {
  const pdf = await loadPdf(file);
  return pdf.getPageCount();
}

export async function mergePdfs(files: File[], onProgress?: (done: number, total: number) => void) {
  const output = await PDFDocument.create();
  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const source = await loadPdf(files[fileIndex]);
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
    onProgress?.(fileIndex + 1, files.length);
  }
  const bytes = await output.save({ useObjectStreams: true });
  return bytesToBlob(bytes, "application/pdf");
}

export async function extractPdfPages(file: File, pageIndices: number[]) {
  const source = await loadPdf(file);
  const output = await PDFDocument.create();
  const unique = pageIndices.filter((index, position, values) => index >= 0 && index < source.getPageCount() && values.indexOf(index) === position);
  if (!unique.length) throw new Error("No valid pages selected.");
  const pages = await output.copyPages(source, unique);
  pages.forEach((page) => output.addPage(page));
  const bytes = await output.save({ useObjectStreams: true });
  return bytesToBlob(bytes, "application/pdf");
}

export async function splitPdfIntoPages(file: File, onProgress?: (done: number, total: number) => void): Promise<ExportedFile[]> {
  const source = await loadPdf(file);
  const total = source.getPageCount();
  const results: ExportedFile[] = [];

  for (let index = 0; index < total; index += 1) {
    const output = await PDFDocument.create();
    const [page] = await output.copyPages(source, [index]);
    output.addPage(page);
    const bytes = await output.save({ useObjectStreams: true });
    results.push({ name: `${stripExtension(file.name)}-page-${String(index + 1).padStart(2, "0")}.pdf`, blob: bytesToBlob(bytes, "application/pdf") });
    onProgress?.(index + 1, total);
    await yieldToBrowser();
  }

  return results;
}

export async function organizePdf(file: File, pages: PdfPageState[]) {
  const source = await loadPdf(file);
  const output = await PDFDocument.create();
  for (const pageState of pages) {
    if (pageState.sourceIndex < 0 || pageState.sourceIndex >= source.getPageCount()) continue;
    const [page] = await output.copyPages(source, [pageState.sourceIndex]);
    const existingRotation = page.getRotation().angle || 0;
    page.setRotation(degrees((existingRotation + pageState.rotation) % 360));
    output.addPage(page);
  }
  if (!output.getPageCount()) throw new Error("A PDF needs at least one page.");
  const bytes = await output.save({ useObjectStreams: true });
  return bytesToBlob(bytes, "application/pdf");
}

export async function rotatePdfPages(file: File, options: PdfRotateOptions) {
  const pdf = await loadPdf(file);
  const total = pdf.getPageCount();
  const custom = options.scope === "custom" ? new Set(parsePageRange(options.customPages ?? "", total)) : null;
  if (options.scope === "custom" && !custom?.size) throw new Error("Enter a valid page range such as 1-3, 6, 9-12.");

  pdf.getPages().forEach((page, index) => {
    if (options.scope === "odd" && (index + 1) % 2 === 0) return;
    if (options.scope === "even" && (index + 1) % 2 !== 0) return;
    if (custom && !custom.has(index)) return;
    const existing = page.getRotation().angle || 0;
    page.setRotation(degrees((existing + options.angle) % 360));
  });

  return bytesToBlob(await pdf.save({ useObjectStreams: true }), "application/pdf");
}

export async function watermarkPdf(file: File, options: PdfWatermarkOptions) {
  const text = options.text.trim();
  if (!text) throw new Error("Enter watermark text first.");
  const pdf = await loadPdf(file);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const custom = options.pages === "custom" ? new Set(parsePageRange(options.customPages ?? "", pdf.getPageCount())) : null;
  if (options.pages === "custom" && !custom?.size) throw new Error("Enter a valid page range such as 1-3, 6, 9-12.");
  const color = hexToRgb(options.color);

  pdf.getPages().forEach((page, index) => {
    if (options.pages === "odd" && (index + 1) % 2 === 0) return;
    if (options.pages === "even" && (index + 1) % 2 !== 0) return;
    if (custom && !custom.has(index)) return;
    const { width, height } = page.getSize();
    const size = Math.max(8, Math.min(144, options.fontSize));
    const textWidth = font.widthOfTextAtSize(text, size);
    const margin = Math.max(18, size * 0.75);
    const horizontal = options.position.split("-").at(-1);
    const vertical = options.position.split("-")[0];
    const x = horizontal === "left" ? margin : horizontal === "right" ? width - margin - textWidth : (width - textWidth) / 2;
    const y = vertical === "top" ? height - margin - size : vertical === "bottom" ? margin : height / 2;
    page.drawText(text, {
      x,
      y,
      size,
      font,
      color: rgb(color.r, color.g, color.b),
      opacity: Math.max(0.05, Math.min(1, options.opacity)),
      rotate: degrees(options.rotation),
    });
  });

  const bytes = await pdf.save({ useObjectStreams: true });
  return bytesToBlob(bytes, "application/pdf");
}

function hexToRgb(value: string) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(value);
  if (!match) return { r: 0.12, g: 0.12, b: 0.1 };
  return { r: Number.parseInt(match[1], 16) / 255, g: Number.parseInt(match[2], 16) / 255, b: Number.parseInt(match[3], 16) / 255 };
}

export async function addPdfPageNumbers(file: File, options: PageNumberOptions) {
  const pdf = await loadPdf(file);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const startPageIndex = Math.max(0, Math.min(pdf.getPageCount() - 1, options.startPage - 1));
  const margin = Math.max(0, options.margin);
  const size = Math.max(7, Math.min(72, options.fontSize));

  pdf.getPages().forEach((page, index) => {
    if (index < startPageIndex) return;
    const value = String(options.startNumber + (index - startPageIndex));
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(value, size);
    const top = options.position.startsWith("top-");
    const horizontal = options.position.split("-")[1];
    const x = horizontal === "left" ? margin : horizontal === "right" ? width - margin - textWidth : (width - textWidth) / 2;
    const y = top ? height - margin - size : margin;
    page.drawText(value, { x, y, size, font, color: rgb(0.18, 0.2, 0.19) });
  });

  return bytesToBlob(await pdf.save({ useObjectStreams: true }), "application/pdf");
}

export async function getPdfMetadata(file: File): Promise<PdfMetadata> {
  const pdf = await loadPdf(file);
  return {
    title: pdf.getTitle(),
    author: pdf.getAuthor(),
    subject: pdf.getSubject(),
    keywords: pdf.getKeywords(),
    creator: pdf.getCreator(),
    producer: pdf.getProducer(),
    creationDate: formatDate(pdf.getCreationDate()),
    modificationDate: formatDate(pdf.getModificationDate()),
  };
}

export async function updatePdfMetadata(file: File, metadata: PdfMetadataPatch) {
  const pdf = await loadPdf(file);
  pdf.setTitle(metadata.title.trim());
  pdf.setAuthor(metadata.author.trim());
  pdf.setSubject(metadata.subject.trim());
  pdf.setKeywords(metadata.keywords.map((keyword) => keyword.trim()).filter(Boolean));
  pdf.setCreator(metadata.creator.trim());
  pdf.setProducer(metadata.producer.trim());
  return bytesToBlob(await pdf.save({ useObjectStreams: true, updateFieldAppearances: false }), "application/pdf");
}

export async function clearPdfTextMetadata(file: File) {
  const pdf = await loadPdf(file);
  pdf.setTitle("");
  pdf.setAuthor("");
  pdf.setSubject("");
  pdf.setKeywords([]);
  pdf.setCreator("");
  pdf.setProducer("");
  return bytesToBlob(await pdf.save({ useObjectStreams: true, updateFieldAppearances: false }), "application/pdf");
}

async function imageBytesAsPng(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available in this browser.");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Unable to convert image."))), "image/png", 1);
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export type ImagesToPdfLayout = 1 | 2 | 4 | 6 | 9;
export type ImagesToPdfPageSize = "a4" | "letter" | "legal" | "fit";
export type ImagesToPdfOrientation = "portrait" | "landscape" | "auto";
export type ImagesToPdfMargin = "none" | "small" | "normal" | "large";
export type ImagesToPdfFit = "contain" | "fill";

export type ImagesToPdfOptions = {
  layout?: ImagesToPdfLayout;
  pageSize?: ImagesToPdfPageSize;
  orientation?: ImagesToPdfOrientation;
  margin?: ImagesToPdfMargin;
  fit?: ImagesToPdfFit;
};

const IMAGES_PAGE_SIZES: Record<"a4" | "letter" | "legal", [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
};

const IMAGES_MARGINS: Record<ImagesToPdfMargin, number> = {
  none: 0,
  small: 14.17,
  normal: 34.01,
  large: 56.69,
};

export async function imagesToPdf(
  files: File[],
  optionsOrProgress?: ImagesToPdfOptions | ((done: number, total: number) => void),
  onProgressCallback?: (done: number, total: number) => void,
) {
  const options: ImagesToPdfOptions = typeof optionsOrProgress === "object" && optionsOrProgress !== null ? optionsOrProgress : {};
  const onProgress = typeof optionsOrProgress === "function" ? optionsOrProgress : onProgressCallback;

  const layout = options.layout ?? 1;
  const pageSize = options.pageSize ?? "a4";
  const orientation = options.orientation ?? "portrait";
  const marginKey = options.margin ?? "normal";
  const fit = options.fit ?? "contain";

  const pdf = await PDFDocument.create();
  const totalPages = Math.ceil(files.length / layout);

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const chunk = files.slice(pageIndex * layout, (pageIndex + 1) * layout);
    if (!chunk.length) break;

    const embeddedImages = [];
    for (const file of chunk) {
      let img;
      if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) {
        img = await pdf.embedJpg(await file.arrayBuffer());
      } else if (file.type === "image/png" || /\.png$/i.test(file.name)) {
        img = await pdf.embedPng(await file.arrayBuffer());
      } else {
        img = await pdf.embedPng(await imageBytesAsPng(file));
      }
      embeddedImages.push(img);
    }

    let pageWidth: number;
    let pageHeight: number;

    if (pageSize === "fit" && layout === 1 && embeddedImages.length === 1) {
      pageWidth = embeddedImages[0].width;
      pageHeight = embeddedImages[0].height;
    } else {
      const base = IMAGES_PAGE_SIZES[pageSize === "fit" ? "a4" : pageSize];
      let isLandscape = orientation === "landscape";
      if (orientation === "auto") {
        if (layout === 1 && embeddedImages.length === 1) {
          isLandscape = embeddedImages[0].width > embeddedImages[0].height;
        } else if (layout === 2) {
          isLandscape = true;
        } else {
          isLandscape = false;
        }
      }
      [pageWidth, pageHeight] = isLandscape ? [base[1], base[0]] : base;
    }

    const marginPt = pageSize === "fit" && layout === 1 ? 0 : IMAGES_MARGINS[marginKey];
    let cols = 1;
    let rows = 1;

    if (layout === 2) {
      if (pageWidth > pageHeight) {
        cols = 2;
        rows = 1;
      } else {
        cols = 1;
        rows = 2;
      }
    } else if (layout === 4) {
      cols = 2;
      rows = 2;
    } else if (layout === 6) {
      if (pageWidth > pageHeight) {
        cols = 3;
        rows = 2;
      } else {
        cols = 2;
        rows = 3;
      }
    } else if (layout === 9) {
      cols = 3;
      rows = 3;
    }

    const gap = layout === 1 || marginKey === "none" ? 0 : marginKey === "small" ? 8 : 14;
    const availW = Math.max(1, pageWidth - marginPt * 2);
    const availH = Math.max(1, pageHeight - marginPt * 2);
    const cellW = (availW - (cols - 1) * gap) / cols;
    const cellH = (availH - (rows - 1) * gap) / rows;

    const page = pdf.addPage([pageWidth, pageHeight]);

    for (let i = 0; i < embeddedImages.length; i++) {
      const image = embeddedImages[i];
      const col = i % cols;
      const row = Math.floor(i / cols);

      const cellX = marginPt + col * (cellW + gap);
      const cellY = pageHeight - marginPt - (row + 1) * cellH - row * gap;

      const imgAspect = image.width / image.height;
      const cellAspect = cellW / cellH;

      let drawW = cellW;
      let drawH = cellH;
      if (fit === "contain") {
        if (imgAspect > cellAspect) {
          drawW = cellW;
          drawH = cellW / imgAspect;
        } else {
          drawH = cellH;
          drawW = cellH * imgAspect;
        }
      }
      const drawX = cellX + (cellW - drawW) / 2;
      const drawY = cellY + (cellH - drawH) / 2;

      page.drawImage(image, { x: drawX, y: drawY, width: drawW, height: drawH });
    }

    onProgress?.(pageIndex + 1, totalPages);
    await yieldToBrowser();
  }

  const bytes = await pdf.save({ useObjectStreams: true });
  return bytesToBlob(bytes, "application/pdf");
}

let pdfWorkerConfigured = false;

export async function getPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfWorkerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    pdfWorkerConfigured = true;
  }
  return pdfjs;
}

export function getRasterPdfCompressionSettings(preset: RasterPdfCompressionPreset): RasterPdfCompressionSettings {
  return preset === "small"
    ? { dpi: 96, quality: 0.56 }
    : { dpi: 144, quality: 0.78 };
}

export async function compressScannedPdf(
  file: File,
  preset: RasterPdfCompressionPreset,
  onProgress?: (done: number, total: number) => void,
) {
  const pdfjs = await getPdfJs();
  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  const source = await pdfjs.getDocument({ data: sourceBytes }).promise;
  const output = await PDFDocument.create();
  const settings = getRasterPdfCompressionSettings(preset);

  try {
    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
      const page = await source.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const requestedScale = settings.dpi / 72;
      const maxPixelScale = Math.sqrt(12_000_000 / Math.max(1, base.width * base.height));
      const scale = Math.max(0.5, Math.min(requestedScale, maxPixelScale, 4));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      try {
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("Canvas is not available in this browser.");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;
        const jpeg = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Unable to encode a compressed PDF page."))), "image/jpeg", settings.quality);
        });
        canvas.width = 0;
        canvas.height = 0;
        const image = await output.embedJpg(await jpeg.arrayBuffer());
        const outputPage = output.addPage([base.width, base.height]);
        outputPage.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
      } finally {
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
      }
      onProgress?.(pageNumber, source.numPages);
      await yieldToBrowser();
    }
  } finally {
    await source.destroy();
  }

  return bytesToBlob(await output.save({ useObjectStreams: true }), "application/pdf");
}

export async function renderPdfThumbnails(
  file: File,
  maxWidth = 220,
  onProgress?: (done: number, total: number) => void,
  onThumbnail?: (index: number, url: string, total: number) => void,
) {
  const pdfjs = await getPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const urls: string[] = Array.from({ length: doc.numPages }, () => "");

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(1.2, maxWidth / base.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas is not available in this browser.");
      await page.render({ canvasContext: context, viewport }).promise;
      const url = canvas.toDataURL("image/jpeg", 0.72);
      urls[pageNumber - 1] = url;
      onThumbnail?.(pageNumber - 1, url, doc.numPages);
      page.cleanup();
      onProgress?.(pageNumber, doc.numPages);
      await yieldToBrowser();
    }
  } finally {
    await doc.destroy();
  }

  return urls;
}

export async function renderPdfPage(
  file: File,
  canvas: HTMLCanvasElement,
  pageNumber: number,
  options: { scale?: number; maxWidth?: number; maxHeight?: number } = {},
) {
  const pdfjs = await getPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  try {
    const resolvedPage = Math.max(1, Math.min(doc.numPages, pageNumber));
    const page = await doc.getPage(resolvedPage);
    const base = page.getViewport({ scale: 1 });
    const widthScale = options.maxWidth ? options.maxWidth / base.width : Number.POSITIVE_INFINITY;
    const heightScale = options.maxHeight ? options.maxHeight / base.height : Number.POSITIVE_INFINITY;
    const scale = Math.max(0.25, Math.min(4, options.scale ?? 1, widthScale, heightScale));
    const viewport = page.getViewport({ scale });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas is not available in this browser.");
    await page.render({ canvasContext: context, viewport }).promise;
    page.cleanup();
    return { pageNumber: resolvedPage, pageCount: doc.numPages, width: viewport.width, height: viewport.height };
  } finally {
    await doc.destroy();
  }
}

export async function pdfToPngs(file: File, onProgress?: (done: number, total: number) => void): Promise<ExportedFile[]> {
  const pdfjs = await getPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const results: ExportedFile[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, Math.max(1.25, 1800 / base.width));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas is not available in this browser.");
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Unable to render PDF page."))), "image/png", 1);
      });
      results.push({ name: `${stripExtension(file.name)}-page-${String(pageNumber).padStart(2, "0")}.png`, blob });
      page.cleanup();
      onProgress?.(pageNumber, doc.numPages);
      await yieldToBrowser();
    }
  } finally {
    await doc.destroy();
  }

  return results;
}

export function formatPdfTextItems(items: PdfTextFragment[]) {
  const lines: string[] = [];
  let fragments: string[] = [];
  let previousY: number | undefined;

  const flush = () => {
    const line = fragments.join(" ").replace(/\s+([,.;:!?%)\]])/g, "$1").replace(/([(\[])\s+/g, "$1").trim();
    if (line) lines.push(line);
    fragments = [];
  };

  for (const item of items) {
    const y = Number(item.transform?.[5]);
    const hasPosition = Number.isFinite(y);
    if (fragments.length && hasPosition && previousY !== undefined && Math.abs(y - previousY) > 2.5) flush();

    const text = item.str.replace(/\s+/g, " ").trim();
    if (text) fragments.push(text);
    if (hasPosition) previousY = y;
    if (item.hasEOL) flush();
  }

  flush();
  return lines.join("\n");
}

export async function extractPdfText(
  file: File,
  pageIndices?: number[],
  onProgress?: (done: number, total: number) => void,
): Promise<PdfTextPage[]> {
  const pdfjs = await getPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const selected = pageIndices?.length
    ? [...new Set(pageIndices)].filter((index) => index >= 0 && index < doc.numPages).sort((a, b) => a - b)
    : Array.from({ length: doc.numPages }, (_, index) => index);

  if (!selected.length) {
    await doc.destroy();
    throw new Error("No valid pages selected.");
  }

  const results: PdfTextPage[] = [];
  try {
    for (let position = 0; position < selected.length; position += 1) {
      const pageIndex = selected[position];
      const page = await doc.getPage(pageIndex + 1);
      const content = await page.getTextContent();
      const items = content.items.filter((item): item is typeof item & { str: string } => "str" in item);
      results.push({ pageNumber: pageIndex + 1, text: formatPdfTextItems(items) });
      page.cleanup();
      onProgress?.(position + 1, selected.length);
      await yieldToBrowser();
    }
  } finally {
    await doc.destroy();
  }

  return results;
}

export function parsePageRange(input: string, pageCount: number) {
  const indices = new Set<number>();
  input
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .forEach((chunk) => {
      if (chunk.includes("-")) {
        const [rawStart, rawEnd] = chunk.split("-").map((value) => Number.parseInt(value.trim(), 10));
        if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) return;
        const start = Math.max(1, Math.min(rawStart, rawEnd));
        const end = Math.min(pageCount, Math.max(rawStart, rawEnd));
        for (let page = start; page <= end; page += 1) indices.add(page - 1);
      } else {
        const page = Number.parseInt(chunk, 10);
        if (Number.isFinite(page) && page >= 1 && page <= pageCount) indices.add(page - 1);
      }
    });
  return [...indices].sort((a, b) => a - b);
}

function bytesToBlob(bytes: Uint8Array, type: string) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type });
}

function stripExtension(name: string) {
  return name.replace(/\.[^.]+$/, "") || "fastfiles";
}

function formatDate(value?: Date) {
  if (!value || Number.isNaN(value.getTime())) return undefined;
  return value.toISOString();
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

export async function signPdf(file: File, options: PdfSignatureOptions): Promise<Blob> {
  const pdf = await loadPdf(file);
  const pngBytes = Uint8Array.from(atob(options.imageData.split(",")[1] || options.imageData), (c) => c.charCodeAt(0));
  const signatureImage = await pdf.embedPng(pngBytes);
  const pages = pdf.getPages();
  const totalPages = pages.length;

  let targetIndices: number[];
  if (options.pages === "last") {
    targetIndices = [totalPages - 1];
  } else if (options.pages === "custom" && options.customPages) {
    targetIndices = parsePageRange(options.customPages, totalPages).map((n) => n - 1);
  } else {
    targetIndices = Array.from({ length: totalPages }, (_, i) => i);
  }

  for (const index of targetIndices) {
    const page = pages[index];
    if (!page) continue;
    const { width: pageW, height: pageH } = page.getSize();
    const drawW = options.width * pageW;
    const drawH = options.height * pageH;
    const drawX = options.x * pageW;
    const drawY = pageH - (options.y * pageH) - drawH;
    page.drawImage(signatureImage, { x: drawX, y: drawY, width: drawW, height: drawH });
  }

  const bytes = await pdf.save();
  return new Blob([bytes as unknown as ArrayBuffer], { type: "application/pdf" });
}
