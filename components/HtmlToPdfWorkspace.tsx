"use client";

import { useEffect, useRef, useState } from "react";
import { downloadBlob, formatBytes } from "@/lib/download";
import { htmlFrameToPdf, sanitizeHtmlDocument, type HtmlOrientation, type HtmlPageSize, type HtmlRenderQuality } from "@/lib/html-tools";
import type { WorkspaceResult } from "./ResultCenter";

type Props = {
  file: File;
  language: "en" | "th";
  run: (label: string, total: number, task: () => Promise<void>) => Promise<void>;
  update: (label: string) => (done: number, total: number) => void;
  setResult: (result: WorkspaceResult) => void;
  busy: boolean;
};

export default function HtmlToPdfWorkspace({ file, language, run, update, setResult, busy }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [pageSize, setPageSize] = useState<HtmlPageSize>("a4");
  const [orientation, setOrientation] = useState<HtmlOrientation>("portrait");
  const [marginMm, setMarginMm] = useState(12);
  const [quality, setQuality] = useState<HtmlRenderQuality>("balanced");

  useEffect(() => {
    let active = true;
    file.text().then((text) => {
      if (!active) return;
      setSource(text);
      try {
        setPreview(sanitizeHtmlDocument(text));
        setPreviewError("");
      } catch (error) {
        setPreviewError(error instanceof Error ? error.message : "Unable to prepare this HTML file.");
      }
    }).catch((error) => {
      if (active) setPreviewError(error instanceof Error ? error.message : "Unable to read this HTML file.");
    });
    return () => { active = false; };
  }, [file]);

  const refreshPreview = () => {
    try {
      setPreviewReady(false);
      setPreview(sanitizeHtmlDocument(source));
      setPreviewError("");
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Unable to prepare this HTML file.");
    }
  };

  const process = () => run(language === "th" ? "กำลังสร้าง PDF" : "BUILDING PDF", 1, async () => {
    if (!frameRef.current || !previewReady) throw new Error(language === "th" ? "ตัวอย่าง HTML ยังไม่พร้อม" : "The HTML preview is not ready yet.");
    const blob = await htmlFrameToPdf(frameRef.current, {
      pageSize,
      orientation,
      margin: Math.max(0, marginMm) * 72 / 25.4,
      quality,
    }, update(language === "th" ? "กำลังสร้าง PDF" : "BUILDING PDF"));
    const name = `${file.name.replace(/\.html?$/i, "") || "fastfiles-html"}.pdf`;
    downloadBlob(blob, name);
    setResult({
      label: language === "th" ? "แปลง HTML เป็น PDF แล้ว" : "HTML CONVERTED TO PDF",
      entries: [{ name, blob, originalSize: file.size, sourceName: file.name }],
      before: file.size,
      after: blob.size,
      notice: language === "th" ? "ไฟล์นี้สร้างจากภาพของหน้า HTML เพื่อรักษาหน้าตา โดยข้อความใน PDF อาจเลือกไม่ได้" : "This PDF uses rendered page images for consistent appearance, so its text may not be selectable.",
    });
  });

  const printPreview = () => {
    if (!previewReady) return;
    frameRef.current?.contentWindow?.focus();
    frameRef.current?.contentWindow?.print();
  };

  return (
    <div className="workspace-grid converter-workspace" data-testid="html-to-pdf-workspace">
      <div className="html-document-column">
        <div className="converter-section-head">
          <div><span className="eyebrow">SAFE HTML PREVIEW</span><h2>{file.name}</h2></div>
          <span className="muted">{formatBytes(file.size)}</span>
        </div>
        <label className="html-source-label">
          <span>{language === "th" ? "HTML ที่จะใช้สร้างไฟล์" : "HTML source"}</span>
          <textarea className="html-source-editor" value={source} onChange={(event) => setSource(event.target.value)} spellCheck={false} />
        </label>
        <button className="secondary-button compact" type="button" onClick={refreshPreview} disabled={busy || !source.trim()}>
          {language === "th" ? "อัปเดตตัวอย่าง" : "UPDATE PREVIEW"}
        </button>
        {previewError && <div className="error-panel" role="alert"><span>{previewError}</span></div>}
        <div className="html-preview-shell">
          <iframe
            ref={frameRef}
            title={language === "th" ? "ตัวอย่าง HTML ที่ปลอดภัย" : "Sanitized HTML preview"}
            srcDoc={preview}
            sandbox="allow-same-origin allow-modals"
            referrerPolicy="no-referrer"
            onLoad={() => setPreviewReady(true)}
          />
        </div>
      </div>
      <aside className="action-card converter-options">
        <span className="section-kicker">LOCAL HTML → PDF</span>
        <h2>{language === "th" ? "ตั้งค่าหน้ากระดาษ" : "Page setup"}</h2>
        <p>{language === "th" ? "JavaScript, แบบฟอร์ม และทรัพยากรภายนอกถูกปิดก่อนแสดงตัวอย่าง" : "JavaScript, forms, and external resources are disabled before previewing."}</p>
        <div className="field-pair">
          <label>{language === "th" ? "ขนาด" : "PAGE SIZE"}<select value={pageSize} onChange={(event) => setPageSize(event.target.value as HtmlPageSize)}><option value="a4">A4</option><option value="letter">Letter</option><option value="legal">Legal</option></select></label>
          <label>{language === "th" ? "แนวกระดาษ" : "ORIENTATION"}<select value={orientation} onChange={(event) => setOrientation(event.target.value as HtmlOrientation)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
        </div>
        <div className="field-pair">
          <label>{language === "th" ? "ขอบ (มม.)" : "MARGIN (MM)"}<input type="number" min="0" max="60" value={marginMm} onChange={(event) => setMarginMm(Number(event.target.value))} /></label>
          <label>{language === "th" ? "คุณภาพ" : "QUALITY"}<select value={quality} onChange={(event) => setQuality(event.target.value as HtmlRenderQuality)}><option value="small">Small file</option><option value="balanced">Balanced</option><option value="sharp">Sharp</option></select></label>
        </div>
        <button className="primary-button" disabled={busy || !previewReady || Boolean(previewError)} onClick={process}>{language === "th" ? "ดาวน์โหลด PDF" : "DOWNLOAD PDF"} ↗</button>
        <button className="secondary-button" disabled={busy || !previewReady || Boolean(previewError)} onClick={printPreview}>{language === "th" ? "พิมพ์ / บันทึกเป็น PDF" : "PRINT / SAVE AS PDF"}</button>
      </aside>
    </div>
  );
}
