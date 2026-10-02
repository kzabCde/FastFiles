"use client";

import { useEffect, useRef, useState } from "react";
import { downloadBlob, formatBytes } from "@/lib/download";
import {
  imagesToPdf,
  type ImagesToPdfFit,
  type ImagesToPdfLayout,
  type ImagesToPdfMargin,
  type ImagesToPdfOrientation,
  type ImagesToPdfPageSize,
} from "@/lib/pdf-tools";
import { kindOf } from "@/lib/tools";
import type { WorkspaceResult } from "./ResultCenter";

type Props = {
  files: File[];
  language: "en" | "th";
  run: (label: string, total: number, task: () => Promise<void>) => Promise<void>;
  update: (label: string) => (done: number, total: number) => void;
  setResult: (result: WorkspaceResult) => void;
  busy: boolean;
};

function SimCellImage({ file, fit, alt }: { file: File; fit: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  if (!src) return <div className="img-placeholder">...</div>;

  return (
    <img
      src={src}
      alt={alt}
      style={{ objectFit: fit === "fill" ? "cover" : "contain" }}
      loading="lazy"
    />
  );
}

function ManageCardThumb({ file }: { file: File }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  if (!src) return null;

  return <img src={src} alt={file.name} loading="lazy" />;
}

export default function ImagesToPdfWorkspace({
  files,
  language,
  run,
  update,
  setResult,
  busy,
}: Props) {
  const [orderedFiles, setOrderedFiles] = useState<File[]>(() =>
    files.filter((file) => kindOf(file) === "image")
  );
  const [layout, setLayout] = useState<ImagesToPdfLayout>(1);
  const [pageSize, setPageSize] = useState<ImagesToPdfPageSize>("a4");
  const [orientation, setOrientation] = useState<ImagesToPdfOrientation>("portrait");
  const [margin, setMargin] = useState<ImagesToPdfMargin>("normal");
  const [fit, setFit] = useState<ImagesToPdfFit>("contain");
  const [viewMode, setViewMode] = useState<"sheet" | "manage">("sheet");
  const [activePageIndex, setActivePageIndex] = useState(0);

  const dragItem = useRef<number | null>(null);

  useEffect(() => {
    const valid = files.filter((file) => kindOf(file) === "image");
    setOrderedFiles(valid);
  }, [files]);

  const totalPages = Math.max(1, Math.ceil(orderedFiles.length / layout));
  const safePageIndex = Math.min(activePageIndex, totalPages - 1);

  const currentChunk = orderedFiles.slice(
    safePageIndex * layout,
    (safePageIndex + 1) * layout
  );

  // Reordering helpers
  const moveFile = (from: number, to: number) => {
    if (to < 0 || to >= orderedFiles.length) return;
    setOrderedFiles((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  };

  const removeFile = (index: number) => {
    if (orderedFiles.length <= 1) return;
    setOrderedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const sortByNameAsc = () => {
    setOrderedFiles((prev) =>
      [...prev].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    );
  };

  const sortByNameDesc = () => {
    setOrderedFiles((prev) =>
      [...prev].sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))
    );
  };

  const reverseList = () => {
    setOrderedFiles((prev) => [...prev].reverse());
  };

  // Determine grid geometry for Sheet preview
  const isLandscape =
    orientation === "landscape" ||
    (orientation === "auto" && layout === 2);

  let gridCols = 1;
  let gridRows = 1;
  if (layout === 2) {
    if (isLandscape) {
      gridCols = 2;
      gridRows = 1;
    } else {
      gridCols = 1;
      gridRows = 2;
    }
  } else if (layout === 4) {
    gridCols = 2;
    gridRows = 2;
  } else if (layout === 6) {
    if (isLandscape) {
      gridCols = 3;
      gridRows = 2;
    } else {
      gridCols = 2;
      gridRows = 3;
    }
  } else if (layout === 9) {
    gridCols = 3;
    gridRows = 3;
  }

  const marginPadding =
    margin === "none" ? "4px" : margin === "small" ? "12px" : margin === "normal" ? "24px" : "36px";
  const gapSize =
    layout === 1 || margin === "none" ? "0px" : margin === "small" ? "8px" : "14px";

  const process = () =>
    run(language === "th" ? "กำลังสร้าง PDF" : "BUILDING PDF", totalPages, async () => {
      if (!orderedFiles.length) {
        throw new Error(language === "th" ? "ไม่มีรูปภาพที่ใช้ได้" : "No valid images to convert.");
      }
      const blob = await imagesToPdf(
        orderedFiles,
        { layout, pageSize, orientation, margin, fit },
        update(language === "th" ? "กำลังสร้าง PDF" : "BUILDING PDF")
      );
      const name = "fastfiles-images.pdf";
      downloadBlob(blob, name);
      setResult({
        label:
          language === "th"
            ? `รวม ${orderedFiles.length} รูปเป็น PDF (${totalPages} หน้า)`
            : `${orderedFiles.length} IMAGES → PDF (${totalPages} PAGES)`,
        entries: [{ name, blob }],
        before: orderedFiles.reduce((sum, file) => sum + file.size, 0),
        after: blob.size,
        notice:
          language === "th"
            ? `สร้าง PDF ${totalPages} หน้า (จัดหน้าละ ${layout} รูป) เรียบร้อยแล้ว`
            : `Created a ${totalPages}-page PDF with ${layout} image(s) per page.`,
      });
    });

  const t =
    language === "th"
      ? {
          title: "รูปภาพเป็น PDF",
          sheetView: "ตัวอย่างหน้าพิมพ์ (Sheet Preview)",
          manageView: "จัดการลำดับภาพ (Reorder)",
          page: "หน้า",
          of: "จาก",
          images: "รูป",
          layoutTitle: "จำนวนรูปต่อหน้า (Layout)",
          layout1: "1 รูป / หน้า",
          layout2: "2 รูป / หน้า",
          layout4: "4 รูป (2×2)",
          layout6: "6 รูป (2×3)",
          layout9: "9 รูป (3×3)",
          pageSize: "ขนาดกระดาษ",
          a4: "A4 (มาตรฐาน)",
          letter: "Letter",
          legal: "Legal",
          fitPage: "ตามขนาดรูปจริง (Fit to Image)",
          orientation: "แนวกระดาษ",
          portrait: "แนวตั้ง (Portrait)",
          landscape: "แนวนอน (Landscape)",
          autoOrient: "อัตโนมัติ (Auto)",
          margin: "ระยะขอบ",
          marginNone: "ไม่มีขอบ (None)",
          marginSmall: "แคบ (5mm)",
          marginNormal: "ปกติ (12mm)",
          marginLarge: "กว้าง (20mm)",
          fitMode: "การวางรูป",
          fitContain: "คงสัดส่วนเดิม (Contain)",
          fitFill: "เต็มช่องกริด (Fill)",
          sortAz: "ชื่อ ก-ฮ (A-Z)",
          sortZa: "ชื่อ ฮ-ก (Z-A)",
          reverse: "สลับหน้าหลัง",
          summary: `รวม ${orderedFiles.length} รูป → สร้าง PDF ${totalPages} หน้า`,
          action: `สร้าง PDF (${totalPages} หน้า)`,
        }
      : {
          title: "Images to PDF",
          sheetView: "Live Sheet Preview",
          manageView: "Reorder Images",
          page: "Page",
          of: "of",
          images: "images",
          layoutTitle: "Images Per Page (Layout)",
          layout1: "1 per page",
          layout2: "2 per page",
          layout4: "4 per page (2×2)",
          layout6: "6 per page (2×3)",
          layout9: "9 per page (3×3)",
          pageSize: "Page Size",
          a4: "A4 (Standard)",
          letter: "Letter",
          legal: "Legal",
          fitPage: "Fit to Image Size",
          orientation: "Orientation",
          portrait: "Portrait",
          landscape: "Landscape",
          autoOrient: "Auto",
          margin: "Margin",
          marginNone: "None (0mm)",
          marginSmall: "Small (5mm)",
          marginNormal: "Normal (12mm)",
          marginLarge: "Large (20mm)",
          fitMode: "Image Fit",
          fitContain: "Fit Entire Image (Contain)",
          fitFill: "Fill Cell (Crop)",
          sortAz: "Sort A-Z",
          sortZa: "Sort Z-A",
          reverse: "Reverse Order",
          summary: `${orderedFiles.length} images → ${totalPages} PDF page${totalPages > 1 ? "s" : ""}`,
          action: `CREATE PDF (${totalPages} PAGE${totalPages > 1 ? "S" : ""})`,
        };

  return (
    <div className="workspace-grid img-to-pdf-workspace" data-testid="images-to-pdf-workspace">
      <div className="img-to-pdf-main">
        {/* Top View Mode & Sort Toolbar */}
        <div className="img-to-pdf-toolbar">
          <div className="view-mode-tabs">
            <button
              type="button"
              className={`tab-btn ${viewMode === "sheet" ? "active" : ""}`}
              onClick={() => setViewMode("sheet")}
            >
              📄 {t.sheetView}
            </button>
            <button
              type="button"
              className={`tab-btn ${viewMode === "manage" ? "active" : ""}`}
              onClick={() => setViewMode("manage")}
            >
              🖼️ {t.manageView} ({orderedFiles.length})
            </button>
          </div>

          <div className="quick-sort-actions">
            <button type="button" onClick={sortByNameAsc} title={t.sortAz}>
              A-Z
            </button>
            <button type="button" onClick={sortByNameDesc} title={t.sortZa}>
              Z-A
            </button>
            <button type="button" onClick={reverseList} title={t.reverse}>
              ⇅ {t.reverse}
            </button>
          </div>
        </div>

        {/* View Mode 1: Simulated PDF Sheet Preview */}
        {viewMode === "sheet" ? (
          <div className="img-sheet-container">
            {/* Sheet Page Navigation Bar */}
            {totalPages > 1 && (
              <div className="sheet-pagination">
                <button
                  type="button"
                  className="page-nav-btn"
                  disabled={safePageIndex === 0}
                  onClick={() => setActivePageIndex((p) => Math.max(0, p - 1))}
                  aria-label="Previous page"
                >
                  ◀
                </button>
                <span className="page-nav-info">
                  {t.page} <strong>{safePageIndex + 1}</strong> {t.of} {totalPages}
                </span>
                <button
                  type="button"
                  className="page-nav-btn"
                  disabled={safePageIndex >= totalPages - 1}
                  onClick={() => setActivePageIndex((p) => Math.min(totalPages - 1, p + 1))}
                  aria-label="Next page"
                >
                  ▶
                </button>
              </div>
            )}

            {/* Simulated Paper Sheet */}
            <div
              className={`img-sim-sheet ${isLandscape ? "landscape" : "portrait"}`}
              style={{ padding: marginPadding }}
            >
              <div
                className="img-sim-grid"
                style={{
                  gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                  gridTemplateRows: `repeat(${gridRows}, 1fr)`,
                  gap: gapSize,
                }}
              >
                {currentChunk.map((file, idx) => {
                  const globalIdx = safePageIndex * layout + idx + 1;
                  return (
                    <div key={`${file.name}-${globalIdx}`} className="img-sim-cell">
                      <SimCellImage file={file} fit={fit} alt={file.name} />
                      <span className="img-cell-tag">#{globalIdx}</span>
                    </div>
                  );
                })}

                {/* Empty placeholders to fill out the grid on last page */}
                {Array.from({ length: layout - currentChunk.length }).map((_, i) => (
                  <div key={`empty-${i}`} className="img-sim-cell empty-cell" />
                ))}
              </div>
            </div>

            <div className="sheet-footer-note">
              <span>{t.summary}</span> · <span>{layout} {t.images}/{t.page}</span>
            </div>
          </div>
        ) : (
          /* View Mode 2: Reorder & Image List Manager */
          <div className="img-manage-container">
            <div className="img-manage-grid">
              {orderedFiles.map((file, index) => {
                return (
                  <div
                    key={`${file.name}-${index}`}
                    className="img-manage-card"
                    draggable
                    onDragStart={() => {
                      dragItem.current = index;
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragItem.current !== null && dragItem.current !== index) {
                        moveFile(dragItem.current, index);
                      }
                      dragItem.current = null;
                    }}
                  >
                    <div className="card-thumb-wrap">
                      <ManageCardThumb file={file} />
                      <span className="card-badge">#{index + 1}</span>
                      {orderedFiles.length > 1 && (
                        <button
                          type="button"
                          className="card-remove-btn"
                          onClick={() => removeFile(index)}
                          title="Remove image"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className="card-details">
                      <strong title={file.name}>{file.name}</strong>
                      <small>{formatBytes(file.size)}</small>
                    </div>
                    <div className="card-reorder-actions">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => moveFile(index, index - 1)}
                        title="Move left"
                      >
                        ◀
                      </button>
                      <button
                        type="button"
                        disabled={index === orderedFiles.length - 1}
                        onClick={() => moveFile(index, index + 1)}
                        title="Move right"
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Control Panel */}
      <aside className="action-card img-to-pdf-controls">
        <span className="section-kicker">IMAGE → PDF OPTIONS</span>
        <h2>{t.title}</h2>
        <p>
          {language === "th"
            ? "ปรับแต่งการจัดวางรูปภาพ กำหนดจำนวนรูปต่อหน้า และขนาดกระดาษตามต้องการ"
            : "Customize page layout, images per page, orientation, and paper size."}
        </p>

        {/* Layout Grid Selector (1, 2, 4, 6, 9 per page) */}
        <div className="control-group">
          <label className="control-label">{t.layoutTitle}</label>
          <div className="layout-pill-grid">
            {([1, 2, 4, 6, 9] as ImagesToPdfLayout[]).map((count) => (
              <button
                key={count}
                type="button"
                data-testid={`layout-pill-${count}`}
                aria-label={`Layout ${count} per page`}
                className={`layout-pill ${layout === count ? "active" : ""}`}
                onClick={() => {
                  setLayout(count);
                  setActivePageIndex(0);
                }}
              >
                <span className="layout-pill-num">{count}</span>
                <span className="layout-pill-label">
                  {count === 1
                    ? "1 รูป"
                    : count === 2
                    ? "2 รูป"
                    : count === 4
                    ? "4 รูป (2×2)"
                    : count === 6
                    ? "6 รูป (2×3)"
                    : "9 รูป (3×3)"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Paper Size & Orientation */}
        <div className="field-pair">
          <label>
            {t.pageSize}
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as ImagesToPdfPageSize)}
            >
              <option value="a4">{t.a4}</option>
              <option value="letter">{t.letter}</option>
              <option value="legal">{t.legal}</option>
              {layout === 1 && <option value="fit">{t.fitPage}</option>}
            </select>
          </label>

          <label>
            {t.orientation}
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as ImagesToPdfOrientation)}
            >
              <option value="portrait">{t.portrait}</option>
              <option value="landscape">{t.landscape}</option>
              <option value="auto">{t.autoOrient}</option>
            </select>
          </label>
        </div>

        {/* Margin & Fit Mode */}
        <div className="field-pair">
          <label>
            {t.margin}
            <select
              value={margin}
              onChange={(e) => setMargin(e.target.value as ImagesToPdfMargin)}
            >
              <option value="none">{t.marginNone}</option>
              <option value="small">{t.marginSmall}</option>
              <option value="normal">{t.marginNormal}</option>
              <option value="large">{t.marginLarge}</option>
            </select>
          </label>

          <label>
            {t.fitMode}
            <select
              value={fit}
              onChange={(e) => setFit(e.target.value as ImagesToPdfFit)}
            >
              <option value="contain">{t.fitContain}</option>
              <option value="fill">{t.fitFill}</option>
            </select>
          </label>
        </div>

        {/* Summary Info Box */}
        <div className="img-pdf-summary-badge">
          <span className="summary-dot" />
          <span>{t.summary}</span>
        </div>

        {/* Submit Button */}
        <button
          className="primary-button"
          disabled={busy || !orderedFiles.length}
          onClick={process}
        >
          {t.action} ↗
        </button>
      </aside>
    </div>
  );
}
