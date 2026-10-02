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
  const [dragOverState, setDragOverState] = useState<{ index: number; position: "above" | "below" } | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const t = language === "th" ? {
    title: "คิวไฟล์",
    add: "เพิ่มไฟล์",
    clear: "ล้างทั้งหมด",
    total: "รวม",
    files: "ไฟล์",
    pdf: "PDF",
    images: "รูป",
    html: "HTML",
    word: "Word",
    ready: "พร้อม",
    checking: "กำลังตรวจ",
    warning: "ตรวจสอบ",
    error: "ใช้ไม่ได้",
    remove: "ลบไฟล์",
    moveUp: "เลื่อนขึ้น",
    moveDown: "เลื่อนลง",
  } : {
    title: "File queue",
    add: "Add files",
    clear: "Clear all",
    total: "total",
    files: "files",
    pdf: "PDF",
    images: "images",
    html: "HTML",
    word: "Word",
    ready: "Ready",
    checking: "Checking",
    warning: "Review",
    error: "Unavailable",
    remove: "Remove file",
    moveUp: "Move up",
    moveDown: "Move down",
  };

  return (
    <div className="file-queue" data-testid="file-queue">
      <div className="queue-head">
        <div>
          <span className="section-kicker">{t.title}</span>
          <strong>{summary.count} {t.files} · {formatBytes(summary.totalSize)} {t.total}</strong>
          <small>{summary.pdfCount} {t.pdf} · {summary.imageCount} {t.images} · {summary.htmlCount} {t.html} · {summary.docxCount} {t.word}{summary.errorCount ? ` · ${summary.errorCount} ${t.error}` : ""}</small>
        </div>
        <div className="queue-actions">
          <button className="secondary-button compact" onClick={onAdd}>+ {t.add}</button>
          <button className="text-button" onClick={onClear}>{t.clear}</button>
        </div>
      </div>

      <div className="queue-list">
        {items.map((item, index) => {
          const isOver = dragOverState?.index === index;
          const pos = isOver ? dragOverState.position : null;
          const isCurrentDrag = draggingIndex === index;

          return (
            <div
              className={`queue-row status-${item.status}${pos ? ` drag-over-${pos}` : ""}${isCurrentDrag ? " is-dragging" : ""}`}
              key={item.id}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (event.dataTransfer) {
                  event.dataTransfer.dropEffect = "move";
                }
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = (event.clientY - rect.top) / rect.height;
                const position: "above" | "below" = ratio < 0.5 ? "above" : "below";
                if (!dragOverState || dragOverState.index !== index || dragOverState.position !== position) {
                  setDragOverState({ index, position });
                }
              }}
              onDragLeave={(event) => {
                if (event.currentTarget === event.target) {
                  setDragOverState((curr) => (curr?.index === index ? null : curr));
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const from = dragIndex.current;
                const target = dragOverState;
                dragIndex.current = -1;
                setDraggingIndex(null);
                setDragOverState(null);

                if (from >= 0) {
                  const to = target ? target.index : index;
                  const targetPos = target ? target.position : (from < index ? "below" : "above");
                  if (from === to && targetPos === (from < to ? "below" : "above")) return;

                  let targetIndex = to;
                  if (from < to) {
                    targetIndex = targetPos === "above" ? to - 1 : to;
                  } else {
                    targetIndex = targetPos === "above" ? to : to + 1;
                  }

                  if (targetIndex !== from && targetIndex >= 0 && targetIndex < items.length) {
                    onReorder(from, targetIndex);
                  }
                }
              }}
            >
              {isOver && pos && (
                <div className={`queue-drop-indicator ${pos}`} role="presentation">
                  <span className="queue-drop-line" />
                  <span className="queue-drop-pill">
                    {pos === "above" ? (
                      <>
                        <span className="drop-arrow">↑</span>{" "}
                        {language === "th" ? (index === 0 ? "วางบนสุด" : "แทรกด้านบน") : (index === 0 ? "Insert at top" : "Insert above")}
                      </>
                    ) : (
                      <>
                        <span className="drop-arrow">↓</span>{" "}
                        {language === "th" ? (index === items.length - 1 ? "วางล่างสุด" : "แทรกด้านล่าง") : (index === items.length - 1 ? "Insert at bottom" : "Insert below")}
                      </>
                    )}
                  </span>
                </div>
              )}

              <button
                type="button"
                className="drag-handle"
                draggable
                aria-label={`${language === "th" ? "ลากเพื่อเรียง" : "Drag to reorder"} ${item.file.name}`}
                onDragStart={(event) => {
                  dragIndex.current = index;
                  setDraggingIndex(index);
                  event.dataTransfer.setData("application/x-fastfiles-reorder", String(index));
                  event.dataTransfer.effectAllowed = "move";
                  event.stopPropagation();
                }}
                onDragEnd={() => {
                  dragIndex.current = -1;
                  setDraggingIndex(null);
                  setDragOverState(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" && index > 0) {
                    event.preventDefault();
                    onReorder(index, index - 1);
                  } else if (event.key === "ArrowDown" && index < items.length - 1) {
                    event.preventDefault();
                    onReorder(index, index + 1);
                  }
                }}
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
              <div className="queue-row-actions">
                <button
                  type="button"
                  className="queue-move-btn"
                  disabled={index === 0}
                  onClick={() => onReorder(index, index - 1)}
                  title={t.moveUp}
                  aria-label={`${t.moveUp}: ${item.file.name}`}
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="queue-move-btn"
                  disabled={index === items.length - 1}
                  onClick={() => onReorder(index, index + 1)}
                  title={t.moveDown}
                  aria-label={`${t.moveDown}: ${item.file.name}`}
                >
                  ▼
                </button>
                <button className="remove-file" onClick={() => onRemove(item.id)} aria-label={`${t.remove}: ${item.file.name}`}>×</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

