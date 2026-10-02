import { getPdfPageCount } from "@/lib/pdf-tools";
import { probeImage } from "@/lib/image-tools";
import { validateDocx } from "@/lib/document-tools";
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
  docxCount: number;
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
    const legacyDoc = /\.doc$/i.test(file.name) || file.type === "application/msword";
    return { id, file, kind, status: "error", message: legacyDoc ? "legacy-doc" : "unsupported" };
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

  if (kind === "docx") {
    try {
      await validateDocx(file);
      return { id, file, kind, status: "ready" };
    } catch {
      return { id, file, kind, status: "error", message: "invalid-docx" };
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
    if (item.kind === "docx") summary.docxCount += 1;
    if (item.status === "error") summary.errorCount += 1;
    summary.totalPages += item.pageCount ?? 0;
    return summary;
  }, { count: 0, totalSize: 0, pdfCount: 0, imageCount: 0, docxCount: 0, errorCount: 0, totalPages: 0 });
}

export function isLargeWorkload(summary: QueueSummary) {
  return summary.totalSize > 200 * 1024 * 1024 || summary.count > 60 || summary.totalPages > 150;
}

export function usableFiles(items: FileQueueItem[]) {
  return items.filter((item) => item.status !== "error").map((item) => item.file);
}

export function fileIssueMessage(code: string, language: "en" | "th") {
  const messages: Record<string, [string, string]> = {
    "zero-byte": ["This file is empty.", "ไฟล์นี้ไม่มีข้อมูล"],
    unsupported: ["This file type is not supported.", "ยังไม่รองรับไฟล์ประเภทนี้"],
    "legacy-doc": ["Legacy .doc files are not supported yet. Save the document as .docx and try again.", "ยังไม่รองรับไฟล์ .doc รุ่นเก่า กรุณาบันทึกเป็น .docx แล้วลองอีกครั้ง"],
    "invalid-docx": ["The DOCX file appears to be damaged or incomplete.", "ไฟล์ DOCX อาจเสียหายหรือมีข้อมูลไม่ครบ"],
    "unsupported-image": ["This image format is not supported by FastFiles.", "FastFiles ยังไม่รองรับรูปแบบภาพนี้"],
    "unsupported-avif": ["This browser cannot decode this AVIF image. Try a current Chromium, Firefox, or Safari release, or convert it first.", "เบราว์เซอร์นี้ไม่สามารถอ่านภาพ AVIF ไฟล์นี้ได้ กรุณาใช้เบราว์เซอร์เวอร์ชันปัจจุบันหรือแปลงไฟล์ก่อน"],
    "invalid-image": ["The image could not be decoded.", "ไม่สามารถอ่านข้อมูลรูปภาพได้"],
    "invalid-pdf": ["The PDF appears to be corrupted or invalid.", "ไฟล์ PDF อาจเสียหายหรือรูปแบบไม่ถูกต้อง"],
    "password-pdf": ["Password-protected PDFs are not supported yet.", "ยังไม่รองรับ PDF ที่มีรหัสผ่าน"],
    "mime-mismatch": ["The filename and detected image type do not match. Processing may still work.", "นามสกุลไฟล์และชนิดรูปที่ตรวจพบไม่ตรงกัน แต่อาจยังประมวลผลได้"],
  };
  return (messages[code] ?? [code, code])[language === "th" ? 1 : 0];
}

function mimeMatchesExtension(mime: string, extension: string) {
  if (!extension) return true;
  if (mime === "image/jpeg") return extension === "jpg" || extension === "jpeg";
  if (mime === "image/png") return extension === "png";
  if (mime === "image/webp") return extension === "webp";
  if (mime === "image/avif") return extension === "avif";
  return true;
}
