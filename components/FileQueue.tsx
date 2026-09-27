"use client";

import { useRef } from "react";
import { formatBytes } from "@/lib/download";
import type { FileQueueItem, QueueSummary } from "@/lib/file-intake";

export default function FileQueue({
  items,
  summary,
  language,
  onRemove,
  onReorder,
  onAdd,
  onClear,
}: {
  items: FileQueueItem[];
  summary: QueueSummary;
  language: "en" | "th";
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onAdd: () => void;
  onClear: () => void;
}) {
  const dragIndex = useRef(-1);
  const t = language === "th" ? {
    title: "คิวไฟล์",
    add: "เพิ่มไฟล์",
    clear: "ล้างทั้งหมด",
    total: "รวม",
    files: "ไฟล์",
    pdf: "PDF",
    images: "รูป",
    ready: "พร้อม",
    checking: "กำลังตรวจ",
    warning: "ตรวจสอบ",
    error: "ใช้ไม่ได้",
    remove: "ลบไฟล์",
  } : {
    title: "File queue",
    add: "Add files",
    clear: "Clear all",
    total: "total",
    files: "files",
    pdf: "PDF",
    images: "images",
    ready: "Ready",
    checking: "Checking",
    warning: "Review",
    error: "Unavailable",
    remove: "Remove file",
  };

  return (
    <div className="file-queue" data-testid="file-queue">
      <div className="queue-head">
        <div>
          <span className="section-kicker">{t.title}</span>
          <strong>{summary.count} {t.files} · {formatBytes(summary.totalSize)} {t.total}</strong>
          <small>{summary.pdfCount} {t.pdf} · {summary.imageCount} {t.images}{summary.errorCount ? ` · ${summary.errorCount} ${t.error}` : ""}</small>
        </div>
        <div className="queue-actions">
          <button className="secondary-button compact" onClick={onAdd}>+ {t.add}</button>
          <button className="text-button" onClick={onClear}>{t.clear}</button>
        </div>
      </div>

      <div className="queue-list">
        {items.map((item, index) => (
          <div
            className={`queue-row status-${item.status}`}
            key={item.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex.current >= 0 && dragIndex.current !== index) onReorder(dragIndex.current, index);
              dragIndex.current = -1;
            }}
          >
            <button
              className="drag-handle"
              draggable
              aria-label={`${language === "th" ? "ลากเพื่อเรียง" : "Drag to reorder"} ${item.file.name}`}
              onDragStart={() => { dragIndex.current = index; }}
              onDragEnd={() => { dragIndex.current = -1; }}
            >
              <span /> <span /> <span />
            </button>
            <div className="queue-type">{item.kind === "pdf" ? "PDF" : item.kind === "image" ? "IMG" : "?"}</div>
            <div className="queue-file-copy">
              <strong title={item.file.name}>{item.file.name}</strong>
              <span>{formatBytes(item.file.size)}{item.pageCount ? ` · ${item.pageCount} ${language === "th" ? "หน้า" : "pages"}` : ""}{item.width && item.height ? ` · ${item.width}×${item.height}` : ""}</span>
              {item.message && <small>{messageFor(item.message, language)}</small>}
            </div>
            <span className={`queue-status ${item.status}`}>{item.status === "checking" ? t.checking : item.status === "error" ? t.error : item.status === "warning" ? t.warning : t.ready}</span>
            <button className="remove-file" onClick={() => onRemove(item.id)} aria-label={`${t.remove}: ${item.file.name}`}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function messageFor(code: string, language: "en" | "th") {
  const messages: Record<string, [string, string]> = {
    "zero-byte": ["This file is empty.", "ไฟล์นี้ไม่มีข้อมูล"],
    unsupported: ["This file type is not supported.", "ยังไม่รองรับไฟล์ประเภทนี้"],
    "unsupported-image": ["This image format is not supported in v0.2.", "เวอร์ชันนี้ยังไม่รองรับรูปแบบภาพนี้"],
    "invalid-image": ["The image could not be decoded.", "ไม่สามารถอ่านข้อมูลรูปภาพได้"],
    "invalid-pdf": ["The PDF appears to be corrupted or invalid.", "ไฟล์ PDF อาจเสียหายหรือรูปแบบไม่ถูกต้อง"],
    "password-pdf": ["Password-protected PDFs are not supported yet.", "ยังไม่รองรับ PDF ที่มีรหัสผ่าน"],
    "mime-mismatch": ["The filename and detected image type do not match. Processing may still work.", "นามสกุลไฟล์และชนิดรูปที่ตรวจพบไม่ตรงกัน แต่อาจยังประมวลผลได้"],
  };
  return (messages[code] ?? [code, code])[language === "th" ? 1 : 0];
}
