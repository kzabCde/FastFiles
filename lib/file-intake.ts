import { getPdfPageCount } from "@/lib/pdf-tools";
import { probeImage } from "@/lib/image-tools";
import { kindOf, type FileKind } from "@/lib/tools";

export type IntakeStatus = "checking" | "ready" | "warning" | "error";

export type FileQueueItem = {
  id: string;
  file: File;
  kind: Exclude<FileKind, "mixed">;
  status: IntakeStatus;
  message?: string;
  pageCount?: number;
  width?: number;
  height?: number;
};

export type QueueSummary = {
  count: number;
  totalSize: number;
  pdfCount: number;
  imageCount: number;
  errorCount: number;
  totalPages: number;
};

const imageExtensions = new Set(["jpg", "jpeg", "png", "webp", "avif"]);
const imageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export function queueId(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}:${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export async function inspectFile(file: File): Promise<FileQueueItem> {
  const id = queueId(file);
  if (file.size === 0) {
    return { id, file, kind: kindOf(file), status: "error", message: "zero-byte" };
  }

  const kind = kindOf(file);
  if (kind === "unsupported") {
    return { id, file, kind, status: "error", message: "unsupported" };
  }

  if (kind === "pdf") {
    try {
      const signature = new TextDecoder("latin1").decode(new Uint8Array(await file.slice(0, 5).arrayBuffer()));
      if (signature !== "%PDF-") return { id, file, kind, status: "error", message: "invalid-pdf" };
      const pageCount = await getPdfPageCount(file);
      return { id, file, kind, status: "ready", pageCount };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { id, file, kind, status: "error", message: /encrypt|password/i.test(message) ? "password-pdf" : "invalid-pdf" };
    }
  }

  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (!imageExtensions.has(ext) && !imageMimeTypes.has(file.type)) {
    return { id, file, kind, status: "error", message: "unsupported-image" };
  }

  try {
    const { width, height } = await probeImage(file);
    const mimeMismatch = Boolean(file.type) && !mimeMatchesExtension(file.type, ext);
    return {
      id,
      file,
      kind,
      status: mimeMismatch ? "warning" : "ready",
      message: mimeMismatch ? "mime-mismatch" : undefined,
      width,
      height,
    };
  } catch {
    return { id, file, kind, status: "error", message: ext === "avif" || file.type === "image/avif" ? "unsupported-avif" : "invalid-image" };
  }
}

export async function inspectFiles(files: File[]) {
  return Promise.all(files.map(inspectFile));
}

export function summarizeQueue(items: FileQueueItem[]): QueueSummary {
  return items.reduce<QueueSummary>((summary, item) => {
    summary.count += 1;
    summary.totalSize += item.file.size;
    if (item.kind === "pdf") summary.pdfCount += 1;
    if (item.kind === "image") summary.imageCount += 1;
    if (item.status === "error") summary.errorCount += 1;
    summary.totalPages += item.pageCount ?? 0;
    return summary;
  }, { count: 0, totalSize: 0, pdfCount: 0, imageCount: 0, errorCount: 0, totalPages: 0 });
}

export function isLargeWorkload(summary: QueueSummary) {
  return summary.totalSize > 200 * 1024 * 1024 || summary.count > 60 || summary.totalPages > 150;
}

export function usableFiles(items: FileQueueItem[]) {
  return items.filter((item) => item.status !== "error").map((item) => item.file);
}

function mimeMatchesExtension(mime: string, extension: string) {
  if (!extension) return true;
  if (mime === "image/jpeg") return extension === "jpg" || extension === "jpeg";
  if (mime === "image/png") return extension === "png";
  if (mime === "image/webp") return extension === "webp";
  if (mime === "image/avif") return extension === "avif";
  return true;
}
