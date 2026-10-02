"use client";

import { useEffect, useState } from "react";
import type { ToolDefinition } from "@/lib/tools";
import { formatBytes } from "@/lib/download";
import ResultCenter, { type WorkspaceResult } from "./ResultCenter";
import PdfPreview from "./PdfPreview";
import NavigationMenu from "./NavigationMenu";
import {
  analyzeDocx,
  analyzePdfForWord,
  convertDocxToPdf,
  convertPdfToDocx,
  replaceExtension,
  type ConversionQuality,
  type DocxAnalysis,
  type PdfWordAnalysis,
} from "@/lib/document-tools";

type Props = {
  tool: ToolDefinition;
  files: File[];
  language: "en" | "th";
  onBack: () => void;
  onReset: () => void;
  onToggleLanguage: () => void;
  onSelectTool?: (tool: ToolDefinition) => void;
};

type ProgressState = {
  label: string;
  done: number;
  total: number;
  detail?: string;
} | null;

type AnalysisState =
  | { type: "docx"; value: DocxAnalysis }
  | { type: "pdf"; value: PdfWordAnalysis }
  | null;

function qualityLabel(quality: ConversionQuality, language: "en" | "th") {
  const labels: Record<ConversionQuality, [string, string]> = {
    high: ["High", "สูง"],
    moderate: ["Moderate", "ปานกลาง"],
    limited: ["Limited", "จำกัด"],
  };
  return labels[quality][language === "th" ? 1 : 0];
}

function DocumentProgress({ value, language }: { value: ProgressState; language: "en" | "th" }) {
  if (!value) return null;
  const percent = value.total ? Math.min(100, Math.round((value.done / value.total) * 100)) : 0;
  return (
    <div className="progress-panel" aria-live="polite">
      <div className="progress-meta">
        <span>{value.label}</span>
        <strong>{String(value.done).padStart(2, "0")} / {String(value.total).padStart(2, "0")}</strong>
      </div>
      <div className="progress-track"><span style={{ width: `${percent}%` }} /></div>
      <span className="mono muted">
        {percent}% · {language === "th" ? "ประมวลผลบนอุปกรณ์" : "LOCAL PROCESSING"}
        {value.detail ? ` · ${value.detail}` : ""}
      </span>
    </div>
  );
}

export default function DocumentToolWorkspace({
  tool,
  files,
  language,
  onBack,
  onReset,
  onToggleLanguage,
  onSelectTool,
}: Props) {
  const file = files[0];
  const [analysis, setAnalysis] = useState<AnalysisState>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [progress, setProgress] = useState<ProgressState>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<WorkspaceResult | null>(null);
  const [busy, setBusy] = useState(false);
  const isWordToPdf = tool.id === "word-to-pdf";

  useEffect(() => {
    let active = true;
    setAnalysis(null);
    setAnalysisError("");
    setResult(null);
    setError("");

    const load = async () => {
      try {
        if (isWordToPdf) {
          const value = await analyzeDocx(file);
          if (active) setAnalysis({ type: "docx", value });
        } else {
          const value = await analyzePdfForWord(file);
          if (active) setAnalysis({ type: "pdf", value });
        }
      } catch (caught) {
        if (active) setAnalysisError(caught instanceof Error ? caught.message : "Unable to inspect this document.");
      }
    };

    void load();
    return () => { active = false; };
  }, [file, isWordToPdf]);

  const process = async () => {
    if (busy || !analysis) return;
    setBusy(true);
    setError("");
    setResult(null);

    try {
      if (isWordToPdf && analysis.type === "docx") {
        setProgress({
          label: language === "th" ? "กำลังแปลง Word เป็น PDF" : "CONVERTING WORD TO PDF",
          done: 0,
          total: Math.max(1, analysis.value.estimatedPages),
        });
        const converted = await convertDocxToPdf(file, (done, total, detail) => {
          setProgress({
            label: language === "th" ? "กำลังเรนเดอร์เอกสาร" : "RENDERING DOCUMENT",
            done,
            total,
            detail,
          });
        });
        const name = replaceExtension(file.name, "pdf");
        setResult({
          label: language === "th" ? "แปลง Word เป็น PDF แล้ว" : "WORD → PDF COMPLETE",
          entries: [{ name, blob: converted.blob, originalSize: file.size, sourceName: file.name }],
          before: file.size,
          after: converted.blob.size,
          notice: language === "th"
            ? `สร้าง PDF ${converted.pageCount} หน้าในเบราว์เซอร์แล้ว การเรนเดอร์เน้นรักษาหน้าตาเอกสาร ข้อความใน PDF อาจไม่สามารถเลือกได้ทุกกรณี`
            : `Created ${converted.pageCount} PDF page${converted.pageCount === 1 ? "" : "s"} in the browser. Rendering prioritizes visual fidelity, so PDF text may not remain selectable in every document.`,
        });
      } else if (!isWordToPdf && analysis.type === "pdf") {
        if (analysis.value.likelyScanned || !analysis.value.hasText) {
          throw new Error(language === "th"
            ? "ตรวจพบเอกสารสแกนที่ไม่มี text layer ที่ใช้งานได้ ต้องใช้ OCR ก่อนจึงจะสร้าง Word ที่แก้ไขข้อความได้อย่างน่าเชื่อถือ"
            : "Scanned document detected without a usable text layer. OCR is required before FastFiles can create a reliable editable Word document.");
        }
        setProgress({
          label: language === "th" ? "กำลังแปลง PDF เป็น Word" : "CONVERTING PDF TO WORD",
          done: 0,
          total: Math.max(1, analysis.value.pages),
        });
        const converted = await convertPdfToDocx(file, (done, total, detail) => {
          setProgress({
            label: language === "th" ? "กำลังสร้างโครงสร้าง Word" : "REBUILDING WORD DOCUMENT",
            done,
            total,
            detail,
          });
        });
        const name = replaceExtension(file.name, "docx");
        setResult({
          label: language === "th" ? "แปลง PDF เป็น Word แล้ว" : "PDF → WORD COMPLETE",
          entries: [{ name, blob: converted.blob, originalSize: file.size, sourceName: file.name }],
          before: file.size,
          after: converted.blob.size,
          notice: language === "th"
            ? `สร้าง DOCX ที่แก้ไขข้อความได้จาก text layer แล้ว${converted.extractedImages ? ` และดึงภาพได้ ${converted.extractedImages} ภาพ` : ""} การจัดวาง ตาราง และหลายคอลัมน์เป็นการสร้างใหม่ด้วย heuristics จึงอาจต่างจากต้นฉบับ`
            : `Created an editable DOCX from the PDF text layer${converted.extractedImages ? ` and preserved ${converted.extractedImages} extracted image${converted.extractedImages === 1 ? "" : "s"}` : ""}. Layout, tables, and columns are reconstructed heuristically and may differ from the original.`,
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : language === "th" ? "ไม่สามารถแปลงเอกสารนี้ได้" : "Unable to convert this document.");
    } finally {
      setProgress(null);
      setBusy(false);
    }
  };

  const title = language === "th" ? tool.thai : tool.label;

  return (
    <section className="workspace-shell" data-job-status={busy ? "processing" : result ? "success" : error ? "failed" : "ready"}>
      <header className="workspace-head">
        <div style={{ justifySelf: "start", display: "flex", alignItems: "center", gap: 8 }}>
          <div className="mobile-only">
            <NavigationMenu variant="mobile" language={language} onSelectTool={onSelectTool} />
          </div>
          <button
            className="text-button workspace-back-tools"
            onClick={onBack}
            disabled={busy}
            aria-label={language === "th" ? "เครื่องมือ" : "Tools"}
          >
            ← {language === "th" ? "เครื่องมือ" : "TOOLS"}
          </button>
        </div>
        <div><span className="eyebrow">FASTFILES / {tool.short}</span><h1>{title}</h1></div>
        <div className="workspace-head-actions">
          <button className="chip-button workspace-language" onClick={onToggleLanguage} disabled={busy} aria-label={language === "en" ? "Switch to Thai" : "Switch to English"}>
            {language === "en" ? "TH" : "EN"}
          </button>
          <button className="text-button" onClick={onReset} disabled={busy}>{language === "th" ? "ไฟล์ใหม่" : "NEW FILES"}</button>
        </div>
      </header>

      <div className="workspace-grid" data-testid={isWordToPdf ? "word-to-pdf-workspace" : "pdf-to-word-workspace"}>
        {isWordToPdf ? (
          <div className="preview-document">
            <span className="doc-mark">DOCX</span>
            <h2>{file.name}</h2>
            <span>{formatBytes(file.size)} · {language === "th" ? "ประมวลผลในเบราว์เซอร์" : "browser-local"}</span>
          </div>
        ) : (
          <PdfPreview file={file} language={language} />
        )}

        <aside className="action-card">
          <h2>{isWordToPdf
            ? (language === "th" ? "Word → PDF" : "Word → PDF")
            : (language === "th" ? "PDF → Word" : "PDF → Word")}
          </h2>

          {!analysis && !analysisError && <div className="inline-guidance">{language === "th" ? "กำลังวิเคราะห์เอกสาร…" : "Analyzing document…"}</div>}
          {analysisError && <div className="inline-guidance" role="alert">{analysisError}</div>}

          {analysis?.type === "docx" && (
            <>
              <div className="estimate">
                <span>{language === "th" ? "คุณภาพที่คาด" : "EXPECTED QUALITY"}<strong>{qualityLabel(analysis.value.quality, language)}</strong></span>
                <span>{language === "th" ? "ประมาณ" : "ESTIMATED"}<strong>{analysis.value.estimatedPages} {language === "th" ? "หน้า" : "pages"}</strong></span>
                <span>{language === "th" ? "ย่อหน้า" : "PARAGRAPHS"}<strong>{analysis.value.paragraphs}</strong></span>
                <span>{language === "th" ? "ตาราง / รูป" : "TABLES / IMAGES"}<strong>{analysis.value.tables} / {analysis.value.images}</strong></span>
              </div>
              {analysis.value.complexFeatures.length > 0 && (
                <div className="inline-guidance">
                  {language === "th" ? "ตรวจพบองค์ประกอบซับซ้อน: " : "Complex features detected: "}
                  {analysis.value.complexFeatures.join(", ")}.
                </div>
              )}
              <p>{language === "th"
                ? "รักษาหน้ากระดาษ ย่อหน้า รูปแบบข้อความ ตาราง รูปภาพ และ page break ที่รองรับ แล้วสร้าง PDF แบบหน้า-ต่อ-หน้าในเครื่อง"
                : "Preserves supported page geometry, paragraphs, text styling, tables, images, and page breaks, then builds the PDF page-by-page on your device."}
              </p>
              <div className="inline-guidance">{language === "th" ? "ไฟล์ไม่ถูกอัปโหลดออกจากอุปกรณ์" : "Your document is not uploaded. Conversion stays in this browser."}</div>
            </>
          )}

          {analysis?.type === "pdf" && (
            <>
              <div className="estimate">
                <span>{language === "th" ? "คุณภาพที่คาด" : "EXPECTED QUALITY"}<strong>{qualityLabel(analysis.value.quality, language)}</strong></span>
                <span>{language === "th" ? "หน้า" : "PAGES"}<strong>{analysis.value.pages}</strong></span>
                <span>{language === "th" ? "ข้อความ / รูป" : "TEXT / IMAGES"}<strong>{analysis.value.textCharacters.toLocaleString()} / {analysis.value.images}</strong></span>
                <span>{language === "th" ? "โครงสร้าง" : "LAYOUT"}<strong>{analysis.value.possibleColumns ? "Columns" : analysis.value.possibleTables ? "Tables" : "Standard"}</strong></span>
              </div>
              {analysis.value.likelyScanned || !analysis.value.hasText ? (
                <div className="inline-guidance" role="status">
                  {language === "th"
                    ? "ตรวจพบ PDF สแกนหรือไม่มี text layer ที่ใช้งานได้ เวอร์ชันนี้จะไม่สร้าง Word เปล่าหรือหลอกว่าแก้ไขข้อความได้ — ต้องใช้ OCR ก่อน"
                    : "This appears to be a scanned PDF or has no usable text layer. FastFiles will not create a misleading empty Word file; OCR is required first."}
                </div>
              ) : (
                <>
                  {(analysis.value.possibleColumns || analysis.value.possibleTables) && (
                    <div className="inline-guidance">
                      {language === "th"
                        ? "ตรวจพบ layout ที่ซับซ้อน FastFiles จะพยายามสร้าง reading order และตารางใหม่ แต่รูปแบบอาจต่างจากต้นฉบับ"
                        : "Complex layout detected. FastFiles will reconstruct reading order and simple tables, but formatting may differ from the original."}
                    </div>
                  )}
                  <p>{language === "th"
                    ? "ข้อความจะถูกสร้างเป็นย่อหน้า Word ที่แก้ไขได้ พร้อม heading, page break, ตารางอย่างง่าย และรูปภาพที่ดึงได้"
                    : "Selectable text is rebuilt into editable Word paragraphs with inferred headings, page breaks, simple tables, and extractable images."}
                  </p>
                </>
              )}
            </>
          )}

          <button
            className="primary-button"
            disabled={busy || !analysis || Boolean(analysisError) || (analysis?.type === "pdf" && (analysis.value.likelyScanned || !analysis.value.hasText))}
            onClick={() => void process()}
          >
            {busy
              ? (language === "th" ? "กำลังประมวลผล…" : "PROCESSING…")
              : isWordToPdf
                ? (language === "th" ? "แปลงเป็น PDF" : "CONVERT TO PDF")
                : (language === "th" ? "แปลงเป็น Word" : "CONVERT TO WORD")} ↗
          </button>
        </aside>
      </div>

      <DocumentProgress value={progress} language={language} />
      {error && (
        <div className="error-panel" role="alert">
          <strong>{language === "th" ? "แปลงเอกสารไม่สำเร็จ" : "CONVERSION ERROR"}</strong>
          <span>{error}</span>
          <button className="text-button" onClick={() => setError("")}>{language === "th" ? "ปิด" : "Dismiss"}</button>
        </div>
      )}
      {result && <ResultCenter result={result} language={language} onChangeSettings={() => setResult(null)} onProcessMore={onReset} />}
    </section>
  );
}
