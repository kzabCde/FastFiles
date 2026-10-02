"use client";

import { useState } from "react";
import { createZip, downloadBlob } from "@/lib/download";
import { pdfToVisualHtml, type HtmlRenderQuality, type PdfHtmlFormat } from "@/lib/html-tools";
import type { WorkspaceResult } from "./ResultCenter";
import PdfPreview from "./PdfPreview";

type Props = {
  file: File;
  language: "en" | "th";
  run: (label: string, total: number, task: () => Promise<void>) => Promise<void>;
  update: (label: string) => (done: number, total: number) => void;
  setResult: (result: WorkspaceResult) => void;
  busy: boolean;
};

export default function PdfToHtmlWorkspace({ file, language, run, update, setResult, busy }: Props) {
  const [format, setFormat] = useState<PdfHtmlFormat>("single");
  const [quality, setQuality] = useState<HtmlRenderQuality>("balanced");
  const [includeTextLayer, setIncludeTextLayer] = useState(true);

  const process = () => run(language === "th" ? "กำลังสร้าง HTML" : "BUILDING HTML", 1, async () => {
    const output = await pdfToVisualHtml(file, { format, quality, includeTextLayer }, update(language === "th" ? "กำลังสร้าง HTML" : "BUILDING HTML"));
    const blob = format === "single" ? output.entries[0].blob : await createZip(output.entries);
    downloadBlob(blob, output.outputName);
    setResult({
      label: language === "th" ? `แปลง ${output.pageCount} หน้าเป็น HTML แล้ว` : `${output.pageCount} PDF PAGES → HTML`,
      entries: [{ name: output.outputName, blob, originalSize: file.size, sourceName: file.name }],
      before: file.size,
      after: blob.size,
      notice: language === "th" ? "ผลลัพธ์เน้นรักษาหน้าตา PDF เดิม หากเป็นไฟล์สแกนจะไม่มีข้อความให้เลือก" : "The export prioritizes the original PDF appearance. Scanned pages do not contain selectable text without OCR.",
    });
  });

  return (
    <div className="workspace-grid" data-testid="pdf-to-html-workspace">
      <PdfPreview file={file} language={language} />
      <aside className="action-card converter-options">
        <span className="section-kicker">LOCAL PDF → HTML</span>
        <h2>{language === "th" ? "เว็บออฟไลน์แบบคงหน้าตา" : "Offline visual HTML"}</h2>
        <p>{language === "th" ? "ทุกหน้าจะถูกเรนเดอร์ในเครื่องและเปิดได้โดยไม่ต้องเชื่อมต่อ FastFiles" : "Every page is rendered locally and can be opened without reconnecting to FastFiles."}</p>
        <label>{language === "th" ? "รูปแบบผลลัพธ์" : "OUTPUT"}<select value={format} onChange={(event) => setFormat(event.target.value as PdfHtmlFormat)}><option value="single">Single HTML</option><option value="zip">HTML + assets ZIP</option></select></label>
        <label>{language === "th" ? "คุณภาพหน้า" : "PAGE QUALITY"}<select value={quality} onChange={(event) => setQuality(event.target.value as HtmlRenderQuality)}><option value="small">Small file</option><option value="balanced">Balanced</option><option value="sharp">Sharp</option></select></label>
        <label className="toggle-row"><input type="checkbox" checked={includeTextLayer} onChange={(event) => setIncludeTextLayer(event.target.checked)} /><span>{language === "th" ? "เพิ่มชั้นข้อความสำหรับค้นหาและเลือกข้อความ" : "Add a searchable, selectable text layer"}</span></label>
        <div className="inline-guidance">{format === "single" ? (language === "th" ? "ไฟล์เดียวเปิดง่าย แต่ขนาดจะใหญ่ขึ้นเมื่อมีหลายหน้า" : "One portable file; large PDFs produce larger HTML files.") : (language === "th" ? "เหมาะกับ PDF หลายหน้า ต้องแตก ZIP ก่อนเปิด" : "Best for longer PDFs; extract the ZIP before opening.")}</div>
        <button className="primary-button" disabled={busy} onClick={process}>{language === "th" ? "แปลงและดาวน์โหลด" : "CONVERT & DOWNLOAD"} ↗</button>
      </aside>
    </div>
  );
}
