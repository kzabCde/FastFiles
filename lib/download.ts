import JSZip from "jszip";

export function safeFilename(filename: string, fallback = "fastfiles-export") {
  const normalized = filename
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  return (normalized || fallback).slice(0, 180);
}

export function downloadBlob(blob: Blob, filename: string) {
  if (!blob.size) throw new Error("The generated file is empty and was not downloaded.");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeFilename(filename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function createZip(files: Array<{ name: string; blob: Blob }>) {
  if (!files.length) throw new Error("There are no successful files to download.");
  const zip = new JSZip();
  files.forEach((file) => {
    if (file.blob.size) zip.file(safeFilename(file.name, "file"), file.blob);
  });
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
  if (!blob.size) throw new Error("Unable to create a valid ZIP archive.");
  return blob;
}

export async function downloadZip(files: Array<{ name: string; blob: Blob }>, filename = "fastfiles-export.zip") {
  const blob = await createZip(files);
  downloadBlob(blob, filename);
  return blob;
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}
