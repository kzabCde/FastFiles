import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";

export type PdfPageState = {
  sourceIndex: number;
  rotation: number;
};

export type ExportedFile = { name: string; blob: Blob };

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
  creator?: string;
  producer?: string;
  creationDate?: string;
  modificationDate?: string;
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

export async function watermarkPdf(file: File, text: string, opacity = 0.16) {
  if (!text.trim()) throw new Error("Enter watermark text first.");
  const pdf = await loadPdf(file);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  pdf.getPages().forEach((page) => {
    const { width, height } = page.getSize();
    const size = Math.max(28, Math.min(64, width / Math.max(8, text.length * 0.65)));
    const textWidth = font.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: (width - textWidth) / 2,
      y: height / 2,
      size,
      font,
      color: rgb(0.12, 0.12, 0.1),
      opacity,
      rotate: degrees(-24),
    });
  });

  const bytes = await pdf.save({ useObjectStreams: true });
  return bytesToBlob(bytes, "application/pdf");
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
    creator: pdf.getCreator(),
    producer: pdf.getProducer(),
    creationDate: formatDate(pdf.getCreationDate()),
    modificationDate: formatDate(pdf.getModificationDate()),
  };
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

export async function imagesToPdf(files: File[], onProgress?: (done: number, total: number) => void) {
  const pdf = await PDFDocument.create();

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    let image;
    if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) {
      image = await pdf.embedJpg(await file.arrayBuffer());
    } else if (file.type === "image/png" || /\.png$/i.test(file.name)) {
      image = await pdf.embedPng(await file.arrayBuffer());
    } else {
      image = await pdf.embedPng(await imageBytesAsPng(file));
    }

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 28;
    const scale = Math.min((pageWidth - margin * 2) / image.width, (pageHeight - margin * 2) / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    const page = pdf.addPage([pageWidth, pageHeight]);
    page.drawImage(image, { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height });
    onProgress?.(index + 1, files.length);
    await yieldToBrowser();
  }

  const bytes = await pdf.save({ useObjectStreams: true });
  return bytesToBlob(bytes, "application/pdf");
}

let pdfWorkerConfigured = false;

async function getPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfWorkerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    pdfWorkerConfigured = true;
  }
  return pdfjs;
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
