"use client";

import { useEffect, useRef, useState } from "react";
import { getPdfPageCount, renderPdfPage } from "@/lib/pdf-tools";

type ViewMode = "fit-page" | "fit-width" | "100" | "custom";

export default function PdfPreview({ file, language }: { file: File; language: "en" | "th" }) {
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<ViewMode>("fit-page");
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    getPdfPageCount(file).then((count) => { if (active) setPageCount(count); }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Unable to open PDF."); });
    return () => { active = false; };
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage || !pageCount) return;
    let active = true;
    setError("");
    const width = Math.max(260, stage.clientWidth - 36);
    const options = mode === "fit-width" ? { maxWidth: width, scale: 4 } : mode === "fit-page" ? { maxWidth: width, maxHeight: 660, scale: 4 } : { scale: zoom };
    renderPdfPage(file, canvas, pageNumber, options).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "Unable to render PDF page."); });
    return () => { active = false; };
  }, [file, mode, pageCount, pageNumber, zoom]);

  const setPage = (value: number) => setPageNumber(Math.max(1, Math.min(pageCount || 1, value)));
  const changeZoom = (value: number) => { setMode("custom"); setZoom(Math.max(0.25, Math.min(4, value))); };

  return (
    <section className="pdf-viewer" tabIndex={0} aria-label={language === "th" ? "ตัวอย่าง PDF" : "PDF preview"} onKeyDown={(event) => { if (event.key === "ArrowLeft") setPage(pageNumber - 1); if (event.key === "ArrowRight") setPage(pageNumber + 1); }}>
      <div className="pdf-viewer-toolbar">
        <button type="button" onClick={() => setPage(pageNumber - 1)} disabled={pageNumber <= 1} aria-label={language === "th" ? "หน้าก่อนหน้า" : "Previous page"}>←</button>
        <label>{language === "th" ? "หน้า" : "Page"}<input aria-label={language === "th" ? "หมายเลขหน้า" : "Page number"} type="number" min="1" max={pageCount || 1} value={pageNumber} onChange={(event) => setPage(Number(event.target.value))} /><span>/ {pageCount || "—"}</span></label>
        <button type="button" onClick={() => setPage(pageNumber + 1)} disabled={!pageCount || pageNumber >= pageCount} aria-label={language === "th" ? "หน้าถัดไป" : "Next page"}>→</button>
        <span className="pdf-toolbar-spacer" />
        <button type="button" onClick={() => changeZoom(zoom / 1.2)} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => { setMode("100"); setZoom(1); }}>100%</button>
        <button type="button" onClick={() => setMode("fit-width")}>{language === "th" ? "พอดีกว้าง" : "Fit width"}</button>
        <button type="button" onClick={() => setMode("fit-page")}>{language === "th" ? "พอดีหน้า" : "Fit page"}</button>
        <button type="button" onClick={() => changeZoom(zoom * 1.2)} aria-label="Zoom in">+</button>
      </div>
      <div className="pdf-viewer-stage" ref={stageRef}>{error ? <div className="live-preview-error" role="alert">{error}</div> : <canvas ref={canvasRef} aria-label={`${language === "th" ? "หน้า" : "Page"} ${pageNumber}`} />}</div>
    </section>
  );
}
