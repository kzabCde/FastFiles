"use client";

import DOMPurify from "dompurify";
import { PDFDocument } from "pdf-lib";
import { getPdfJs, type ExportedFile } from "@/lib/pdf-tools";

export type HtmlPageSize = "a4" | "letter" | "legal";
export type HtmlOrientation = "portrait" | "landscape";
export type HtmlRenderQuality = "small" | "balanced" | "sharp";
export type PdfHtmlFormat = "single" | "zip";

export type HtmlToPdfOptions = {
  pageSize: HtmlPageSize;
  orientation: HtmlOrientation;
  margin: number;
  quality: HtmlRenderQuality;
};

export type PdfToHtmlOptions = {
  format: PdfHtmlFormat;
  quality: HtmlRenderQuality;
  includeTextLayer: boolean;
};

export type PdfToHtmlOutput = {
  entries: ExportedFile[];
  pageCount: number;
  outputName: string;
};

const PAGE_SIZES: Record<HtmlPageSize, [number, number]> = {
  a4: [595.28, 841.89],
  letter: [612, 792],
  legal: [612, 1008],
};

const FORBIDDEN_TAGS = ["script", "iframe", "frame", "object", "embed", "applet", "form", "input", "button", "textarea", "select", "option", "video", "audio", "source", "track", "link", "base"];
const EXTERNAL_CSS_URL = /(?:@import\s+[^;]+;?|url\(\s*(['"]?)(?!data:image\/|data:font\/|blob:)[^)]+\1\s*\))/gi;

export function sanitizeHtmlDocument(rawHtml: string) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    throw new Error("HTML preview is only available in a browser.");
  }

  const clean = DOMPurify.sanitize(rawHtml, {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: FORBIDDEN_TAGS,
    FORBID_ATTR: ["srcdoc"],
  });
  const documentNode = new DOMParser().parseFromString(clean, "text/html");

  documentNode.querySelectorAll("meta[http-equiv], base, link, script, iframe, object, embed, form").forEach((element) => element.remove());
  documentNode.querySelectorAll<HTMLElement>("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
    }

    if (element.hasAttribute("style")) {
      element.setAttribute("style", (element.getAttribute("style") ?? "").replace(EXTERNAL_CSS_URL, ""));
    }
  });

  documentNode.querySelectorAll("style").forEach((style) => {
    style.textContent = (style.textContent ?? "").replace(EXTERNAL_CSS_URL, "");
  });

  documentNode.querySelectorAll<HTMLImageElement>("img[src]").forEach((image) => {
    const source = image.getAttribute("src")?.trim() ?? "";
    if (!/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);/i.test(source) && !source.startsWith("blob:")) {
      image.removeAttribute("src");
      image.setAttribute("data-fastfiles-blocked-src", "true");
    }
  });

  documentNode.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
    const href = anchor.getAttribute("href")?.trim() ?? "";
    if (!/^(?:#|https?:|mailto:|tel:)/i.test(href)) anchor.removeAttribute("href");
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
  });

  const charset = documentNode.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  documentNode.head.prepend(charset);

  const policy = documentNode.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = "default-src 'none'; img-src data: blob:; font-src data: blob:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  documentNode.head.prepend(policy);

  const baseStyle = documentNode.createElement("style");
  baseStyle.textContent = `
    :root { color-scheme: only light; }
    *, *::before, *::after { box-sizing: border-box; }
    html { min-height: 100%; background: #fff; }
    body { min-height: 100%; margin: 0; background: #fff; overflow-wrap: anywhere; }
    img, svg, table, pre { max-width: 100%; }
    img[data-fastfiles-blocked-src] { min-height: 48px; border: 1px dashed #a8b0ab; background: #f3f5f4; }
    @media print { html, body { background: #fff !important; } }
  `;
  documentNode.head.append(baseStyle);

  return `<!doctype html>\n${documentNode.documentElement.outerHTML}`;
}

export async function htmlFrameToPdf(
  frame: HTMLIFrameElement,
  options: HtmlToPdfOptions,
  onProgress?: (done: number, total: number) => void,
) {
  const documentNode = frame.contentDocument;
  if (!documentNode?.documentElement || !documentNode.body) throw new Error("The HTML preview is not ready yet.");

  // WebKit can leave font/image readiness promises pending inside a sandboxed
  // srcdoc frame. Rendering may safely continue with the browser fallbacks, so
  // bound this preparation step instead of allowing a local conversion to hang.
  await settleWithin(documentNode.fonts?.ready, 3_000);
  await settleWithin(
    Promise.all([...documentNode.images].map((image) => image.decode().catch(() => undefined))),
    3_000,
  );

  const root = documentNode.documentElement;
  const body = documentNode.body;
  const contentWidth = Math.ceil(Math.max(root.scrollWidth, body.scrollWidth, root.clientWidth, body.clientWidth));
  const contentHeight = Math.ceil(Math.max(root.scrollHeight, body.scrollHeight, root.clientHeight, body.clientHeight));
  if (!contentWidth || !contentHeight) throw new Error("The HTML document has no visible content.");
  if (contentWidth > 12_000 || contentHeight > 120_000) throw new Error("This HTML document is too large to render safely in this browser.");

  const baseSize = PAGE_SIZES[options.pageSize];
  const [pageWidth, pageHeight] = options.orientation === "landscape" ? [baseSize[1], baseSize[0]] : baseSize;
  const margin = Math.max(0, Math.min(options.margin, Math.min(pageWidth, pageHeight) / 3));
  const printableWidth = pageWidth - margin * 2;
  const printableHeight = pageHeight - margin * 2;
  const sliceHeight = Math.max(1, Math.floor(contentWidth * (printableHeight / printableWidth)));
  const totalPages = Math.ceil(contentHeight / sliceHeight);
  if (totalPages > 100) throw new Error("This document would create more than 100 pages. Split it into smaller HTML files first.");

  const requestedScale = options.quality === "sharp" ? 2 : options.quality === "small" ? 1 : 1.5;
  const safeScale = Math.max(0.75, Math.min(requestedScale, Math.sqrt(12_000_000 / Math.max(1, contentWidth * sliceHeight))));
  const jpegQuality = options.quality === "small" ? 0.68 : options.quality === "sharp" ? 0.94 : 0.84;
  const isWebKit = /AppleWebKit/i.test(navigator.userAgent) && !("chrome" in window);
  const html2canvas = isWebKit ? undefined : (await import("html2canvas")).default;
  const output = await PDFDocument.create();

  for (let index = 0; index < totalPages; index += 1) {
    const offsetY = index * sliceHeight;
    const currentHeight = Math.min(sliceHeight, contentHeight - offsetY);
    const canvas = html2canvas
      ? await html2canvas(body, {
        backgroundColor: "#ffffff",
        logging: false,
        scale: safeScale,
        useCORS: false,
        allowTaint: false,
        x: 0,
        y: offsetY,
        width: contentWidth,
        height: currentHeight,
        windowWidth: contentWidth,
        windowHeight: contentHeight,
        scrollX: 0,
        scrollY: 0,
      })
      : renderHtmlSliceWithCanvasText(documentNode, contentWidth, currentHeight, offsetY, safeScale);

    const jpeg = await canvasToBlob(canvas, "image/jpeg", jpegQuality);
    const image = await output.embedJpg(await jpeg.arrayBuffer());
    const page = output.addPage([pageWidth, pageHeight]);
    const drawHeight = printableHeight * (currentHeight / sliceHeight);
    page.drawImage(image, {
      x: margin,
      y: pageHeight - margin - drawHeight,
      width: printableWidth,
      height: drawHeight,
    });
    canvas.width = 0;
    canvas.height = 0;
    onProgress?.(index + 1, totalPages);
    await yieldToBrowser();
  }

  return bytesToBlob(await output.save({ useObjectStreams: true }), "application/pdf");
}

export async function pdfToVisualHtml(
  file: File,
  options: PdfToHtmlOptions,
  onProgress?: (done: number, total: number) => void,
): Promise<PdfToHtmlOutput> {
  const pdfjs = await getPdfJs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const documentTask = pdfjs.getDocument({ data: bytes });
  const pdf = await documentTask.promise;
  const baseName = stripExtension(file.name);
  const assetEntries: ExportedFile[] = [];
  const pageMarkup: string[] = [];
  const imageScale = options.quality === "sharp" ? 2 : options.quality === "small" ? 1 : 1.5;
  const imageQuality = options.quality === "small" ? 0.66 : options.quality === "sharp" ? 0.94 : 0.82;

  try {
    if (pdf.numPages > 150) throw new Error("PDF to HTML is limited to 150 pages per local job.");

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const maxScale = Math.sqrt(12_000_000 / Math.max(1, baseViewport.width * baseViewport.height));
      const viewport = page.getViewport({ scale: Math.max(0.75, Math.min(imageScale, maxScale)) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas is not available in this browser.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;

      const supportsWebp = canvas.toDataURL("image/webp", 0.1).startsWith("data:image/webp");
      const mimeType = supportsWebp ? "image/webp" : "image/jpeg";
      const extension = supportsWebp ? "webp" : "jpg";
      const imageBlob = await canvasToBlob(canvas, mimeType, imageQuality);
      const assetName = `page-${String(pageNumber).padStart(3, "0")}.${extension}`;
      const source = options.format === "single" ? await blobToDataUrl(imageBlob) : assetName;
      const textLayer = options.includeTextLayer ? await buildSvgTextLayer(pdfjs, page, viewport) : "";

      pageMarkup.push(`
        <section class="page" aria-label="Page ${pageNumber}" style="--page-ratio:${round(viewport.width)} / ${round(viewport.height)}">
          <img src="${escapeAttribute(source)}" alt="Page ${pageNumber}">
          ${textLayer}
        </section>`);
      if (options.format === "zip") assetEntries.push({ name: assetName, blob: imageBlob });

      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      onProgress?.(pageNumber, pdf.numPages);
      await yieldToBrowser();
    }
  } finally {
    await pdf.destroy();
  }

  const html = buildOfflineHtml(baseName, pageMarkup.join("\n"));
  const htmlName = `${baseName}.html`;
  const htmlEntry = { name: options.format === "zip" ? "index.html" : htmlName, blob: new Blob([html], { type: "text/html;charset=utf-8" }) };
  return {
    entries: options.format === "single" ? [htmlEntry] : [htmlEntry, ...assetEntries],
    pageCount: pageMarkup.length,
    outputName: options.format === "single" ? htmlName : `${baseName}-html.zip`,
  };
}

async function buildSvgTextLayer(
  pdfjs: { Util: { transform: (first: ArrayLike<number>, second: ArrayLike<number>) => number[] } },
  page: { getTextContent: () => Promise<unknown> },
  viewport: { width: number; height: number; transform: number[] },
) {
  const content = await page.getTextContent() as {
    items: Array<{ str?: string; transform?: ArrayLike<number>; fontName?: string }>;
    styles: Record<string, { fontFamily?: string }>;
  };
  const text = content.items.flatMap((item) => {
    if (!item.str || !item.transform) return [];
    const transformed = pdfjs.Util.transform(pdfjs.Util.transform(viewport.transform, item.transform), [1, 0, 0, -1, 0, 0]);
    if (transformed.some((value) => !Number.isFinite(value))) return [];
    const fontFamily = item.fontName ? content.styles[item.fontName]?.fontFamily : undefined;
    return [`<text transform="matrix(${transformed.map(round).join(" ")})" font-family="${escapeAttribute(fontFamily || "sans-serif")}" xml:space="preserve">${escapeHtml(item.str)}</text>`];
  }).join("");

  if (!text) return "";
  return `<svg class="text-layer" viewBox="0 0 ${round(viewport.width)} ${round(viewport.height)}" preserveAspectRatio="none" aria-hidden="true" font-size="1">${text}</svg>`;
}

function buildOfflineHtml(title: string, pages: string) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="generator" content="FastFiles PDF to HTML">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: Inter, system-ui, sans-serif; background: #e7ebe8; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: clamp(12px, 3vw, 36px); background: #e7ebe8; }
    main { display: grid; gap: 24px; justify-items: center; }
    .page { position: relative; width: min(100%, 1100px); aspect-ratio: var(--page-ratio); overflow: hidden; background: #fff; box-shadow: 0 10px 35px rgba(16, 30, 22, .16); }
    .page > img, .text-layer { position: absolute; inset: 0; width: 100%; height: 100%; }
    .page > img { display: block; object-fit: fill; }
    .text-layer { z-index: 2; overflow: visible; }
    .text-layer text { fill: #000; fill-opacity: .001; stroke: none; user-select: text; }
    @media print { body { padding: 0; background: #fff; } main { gap: 0; } .page { width: 100%; box-shadow: none; break-after: page; } }
  </style>
</head>
<body>
  <main>${pages}</main>
</body>
</html>`;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    let settled = false;
    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(fallbackId);
      if (blob) resolve(blob);
      else reject(new Error("Unable to encode the rendered page."));
    };
    const fallbackId = window.setTimeout(() => {
      try {
        finish(dataUrlToBlob(canvas.toDataURL(type, quality)));
      } catch (error) {
        settled = true;
        reject(error);
      }
    }, 3_000);
    canvas.toBlob(finish, type, quality);
  });
}

function renderHtmlSliceWithCanvasText(
  documentNode: Document,
  width: number,
  height: number,
  offsetY: number,
  scale: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas is not available in this browser.");

  const bodyStyle = documentNode.defaultView?.getComputedStyle(documentNode.body);
  const fontSize = Math.max(12, Math.min(24, Number.parseFloat(bodyStyle?.fontSize ?? "16") || 16));
  const lineHeight = Math.max(fontSize * 1.45, Number.parseFloat(bodyStyle?.lineHeight ?? "") || 0);
  const padding = Math.max(20, fontSize * 1.5);
  const lines = wrapCanvasText(
    context,
    documentNode.body.innerText.trim() || documentNode.body.textContent?.trim() || "HTML document",
    Math.max(1, width - padding * 2),
    `${bodyStyle?.fontWeight ?? "400"} ${fontSize}px ${bodyStyle?.fontFamily ?? "Arial, sans-serif"}`,
  );

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(scale, scale);
  context.font = `${bodyStyle?.fontWeight ?? "400"} ${fontSize}px ${bodyStyle?.fontFamily ?? "Arial, sans-serif"}`;
  context.textBaseline = "top";
  context.fillStyle = bodyStyle?.color || "#111111";
  lines.forEach((line, index) => {
    const y = padding + index * lineHeight - offsetY;
    if (y > -lineHeight && y < height) context.fillText(line, padding, y);
  });
  return canvas;
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number, font: string) {
  context.font = font;
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    const words = paragraph.trim().split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && context.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function dataUrlToBlob(dataUrl: string) {
  const [header, encoded = ""] = dataUrl.split(",", 2);
  const type = header.match(/^data:([^;,]+)/i)?.[1] ?? "application/octet-stream";
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to embed the rendered page."));
    reader.readAsDataURL(blob);
  });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function stripExtension(name: string) {
  return name.replace(/\.[^.]+$/, "") || "fastfiles-document";
}

function bytesToBlob(bytes: Uint8Array, type: string) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type });
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

function settleWithin(promise: Promise<unknown> | undefined, timeoutMs: number) {
  if (!promise) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, timeoutMs);
    promise.then(finish, finish);
  });
}
