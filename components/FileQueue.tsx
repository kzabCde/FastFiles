"use client";

import { useEffect, useRef, useState } from "react";
import { formatBytes } from "@/lib/download";
import { fileIssueMessage, type FileQueueItem, type QueueSummary } from "@/lib/file-intake";

function QueueThumbnail({ item }: { item: FileQueueItem }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (item.kind !== "image" || !item.file) {
      setSrc(null);
      return;
    }
    const url = URL.createObjectURL(item.file);
    setSrc(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [item.file, item.kind]);

  if (item.kind === "image" && src) {
    return (
      <div className="queue-type queue-thumb-media" title={item.file.name}>
        <img
          src={src}
          alt={item.file.name}
          className="queue-img-preview"
          loading="lazy"
        />
      </div>
    );
  }

  const kindClass = item.kind === "pdf" ? "queue-type-pdf" : item.kind === "html" ? "queue-type-html" : "";
  const label = item.kind === "pdf" ? "PDF" : item.kind === "image" ? "IMG" : item.kind === "html" ? "HTML" : "?";

  return <div className={`queue-type ${kindClass}`}>{label}</div>;
}

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
    html: "HTML",
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
    html: "HTML",
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
          <small>{summary.pdfCount} {t.pdf} · {summary.imageCount} {t.images} · {summary.htmlCount} {t.html}{summary.errorCount ? ` · ${summary.errorCount} ${t.error}` : ""}</small>
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
            <QueueThumbnail item={item} />
            <div className="queue-file-copy">
              <strong title={item.file.name}>{item.file.name}</strong>
              <span>{formatBytes(item.file.size)}{item.pageCount ? ` · ${item.pageCount} ${language === "th" ? "หน้า" : "pages"}` : ""}{item.width && item.height ? ` · ${item.width}×${item.height}` : ""}</span>
              {item.message && <small>{fileIssueMessage(item.message, language)}</small>}
            </div>
            <span className={`queue-status ${item.status}`}>{item.status === "checking" ? t.checking : item.status === "error" ? t.error : item.status === "warning" ? t.warning : t.ready}</span>
            <button className="remove-file" onClick={() => onRemove(item.id)} aria-label={`${t.remove}: ${item.file.name}`}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

