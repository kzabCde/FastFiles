"use client";

import { useEffect, useRef, useState } from "react";
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
  convertPdfToDocxPreserveLayout,
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
  const [pdfMode, setPdfMode] = useState<"preserve" | "editable">("preserve");
  const abortRef = useRef<AbortController | null>(null);
  const isWordToPdf = tool.id === "word-to-pdf";

  useEffect(() => () => {
    abortRef.current?.abort();
  }, []);

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
    const controller = new AbortController();
    abortRef.current = controller;

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
        }, { signal: controller.signal, analysis: analysis.value });
        const name = replaceExtension(file.name, "pdf");
        setResult({
          label: language === "th" ? "แปลง Word เป็น PDF แล้ว" : "WORD → PDF COMPLETE",
          entries: [{ name, blob: converted.blob, originalSize: file.size, sourceName: file.name }],
          before: file.size,
          after: converted.blob.size,
          notice: language === "th"
            ? converted.layoutFidelity === "preserved"
              ? `สร้าง PDF ${converted.pageCount} หน้าโดยใช้ Word layout renderer เพื่อรักษาฟอนต์ ระยะ ตาราง รูปภาพ header/footer และ page break ให้ใกล้ต้นฉบับมากขึ้น ข้อความใน PDF อาจไม่สามารถเลือกได้ทุกกรณี`
              : `สร้าง PDF ${converted.pageCount} หน้าแล้ว แต่ browser นี้ใช้ compatibility renderer จึงอาจรักษารูปแบบได้ไม่ครบทุกจุด`
            : converted.layoutFidelity === "preserved"
              ? `Created ${converted.pageCount} PDF page${converted.pageCount === 1 ? "" : "s"} with the Word layout renderer to better preserve fonts, spacing, tables, images, headers/footers, and page breaks. PDF text may not remain selectable in every document.`
              : `Created ${converted.pageCount} PDF page${converted.pageCount === 1 ? "" : "s"} with the compatibility renderer; some document formatting may differ.`,
        });
      } else if (!isWordToPdf && analysis.type === "pdf") {
        setProgress({
          label: language === "th" ? "กำลังแปลง PDF เป็น Word" : "CONVERTING PDF TO WORD",
          done: 0,
          total: Math.max(1, analysis.value.pages),
        });

        const name = replaceExtension(file.name, "docx");
        if (pdfMode === "preserve") {
          const converted = await convertPdfToDocxPreserveLayout(file, (done, total, detail) => {
            setProgress({
              label: language === "th" ? "กำลังรักษารูปแบบแต่ละหน้า" : "PRESERVING PAGE LAYOUT",
              done,
              total,
              detail,
            });
          }, { signal: controller.signal, analysis: analysis.value });
          setResult({
            label: language === "th" ? "แปลง PDF เป็น Word แล้ว" : "PDF → WORD COMPLETE",
            entries: [{ name, blob: converted.blob, originalSize: file.size, sourceName: file.name }],
            before: file.size,
            after: converted.blob.size,
            notice: language === "th"
              ? `Preserve Layout: รักษาหน้าตาเอกสาร ${converted.pageCount} หน้าให้ใกล้ต้นฉบับที่สุดโดยวางแต่ละหน้าเป็นภาพเต็มหน้าใน Word เหมาะกับแบบฟอร์ม ตาราง เอกสารหลายคอลัมน์ และ PDF สแกน แต่ข้อความภายในหน้าไม่สามารถแก้ไขได้โดยตรง`
              : `Preserve Layout: kept ${converted.pageCount} page${converted.pageCount === 1 ? "" : "s"} visually close to the PDF by placing each page as a full-page image in Word. This is best for forms, tables, multi-column layouts, and scans, but page text is not directly editable.`,
          });
        } else {
          if (analysis.value.likelyScanned || !analysis.value.hasText) {
            throw new Error(language === "th"
              ? "โหมด Editable ต้องใช้ PDF ที่มี text layer เอกสารสแกนต้องใช้ OCR ก่อน"
              : "Editable mode requires a usable PDF text layer. Scanned documents need OCR first.");
          }
          const converted = await convertPdfToDocx(file, (done, total, detail) => {
            setProgress({
              label: language === "th" ? "กำลังสร้างโครงสร้าง Word" : "REBUILDING WORD DOCUMENT",
              done,
              total,
              detail,
            });
          }, { signal: controller.signal, analysis: analysis.value });
          setResult({
            label: language === "th" ? "แปลง PDF เป็น Word แล้ว" : "PDF → WORD COMPLETE",
            entries: [{ name, blob: converted.blob, originalSize: file.size, sourceName: file.name }],
            before: file.size,
            after: converted.blob.size,
            notice: language === "th"
              ? `Editable: สร้าง DOCX ที่แก้ไขข้อความได้จาก text layer แล้ว${converted.extractedImages ? ` และดึงภาพได้ ${converted.extractedImages} ภาพ` : ""} การจัดวาง ตาราง และหลายคอลัมน์เป็นการสร้างใหม่จึงอาจต่างจากต้นฉบับ`
              : `Editable: created an editable DOCX from the PDF text layer${converted.extractedImages ? ` and preserved ${converted.extractedImages} extracted image${converted.extractedImages === 1 ? "" : "s"}` : ""}. Layout, tables, and columns are reconstructed and may differ from the original.`,
          });
        }
      }
    } catch (caught) {
      if (!(caught instanceof Error && caught.name === "AbortError")) {
        setError(caught instanceof Error ? caught.message : language === "th" ? "ไม่สามารถแปลงเอกสารนี้ได้" : "Unable to convert this document.");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
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
                <span>{language === "th" ? "คุณภาพที่คาด" : "EXPECTED QUALITY"}<strong>{pdfMode === "preserve" ? (language === "th" ? "รักษารูปแบบ" : "Layout") : qualityLabel(analysis.value.quality, language)}</strong></span>
                <span>{language === "th" ? "หน้า" : "PAGES"}<strong>{analysis.value.pages}</strong></span>
                <span>{language === "th" ? "ข้อความ / รูป" : "TEXT / IMAGES"}<strong>{analysis.value.textCharacters.toLocaleString()} / {analysis.value.images}</strong></span>
                <span>{language === "th" ? "โครงสร้าง" : "LAYOUT"}<strong>{analysis.value.possibleColumns ? "Columns" : analysis.value.possibleTables ? "Tables" : "Standard"}</strong></span>
              </div>

              <div className="document-mode-grid" role="radiogroup" aria-label={language === "th" ? "โหมดการแปลง" : "Conversion mode"}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={pdfMode === "preserve"}
                  className={`document-mode-card ${pdfMode === "preserve" ? "selected" : ""}`}
                  onClick={() => setPdfMode("preserve")}
                  disabled={busy}
                >
                  <strong>{language === "th" ? "รักษารูปแบบ" : "Preserve layout"}</strong>
                  <span>{language === "th" ? "แนะนำ · หน้าตาใกล้ต้นฉบับที่สุด" : "Recommended · closest visual match"}</span>
                  <small>{language === "th" ? "เหมาะกับตาราง แบบฟอร์ม หลายคอลัมน์ และไฟล์สแกน" : "Best for tables, forms, columns, and scanned PDFs"}</small>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={pdfMode === "editable"}
                  className={`document-mode-card ${pdfMode === "editable" ? "selected" : ""}`}
                  onClick={() => setPdfMode("editable")}
                  disabled={busy || analysis.value.likelyScanned || !analysis.value.hasText}
                >
                  <strong>{language === "th" ? "แก้ไขข้อความได้" : "Editable"}</strong>
                  <span>{language === "th" ? "สร้างย่อหน้าและตารางใหม่" : "Rebuild paragraphs and tables"}</span>
                  <small>{analysis.value.likelyScanned || !analysis.value.hasText
                    ? (language === "th" ? "ต้องใช้ OCR สำหรับไฟล์สแกน" : "OCR is required for scans")
                    : (language === "th" ? "แก้ไขง่ายขึ้น แต่ layout อาจเปลี่ยน" : "Easier to edit, but layout may change")}
                  </small>
                </button>
              </div>

              {pdfMode === "preserve" ? (
                <div className="inline-guidance">
                  {language === "th"
                    ? "FastFiles จะวางแต่ละหน้า PDF เป็นภาพเต็มหน้าของ Word เพื่อรักษาตำแหน่ง ฟอนต์ ตาราง รูป และช่องว่างให้เหมือนต้นฉบับมากที่สุด ข้อความในหน้าจะไม่สามารถแก้ไขโดยตรง"
                    : "FastFiles places each PDF page as a full-page Word image to preserve positions, fonts, tables, graphics, and spacing as closely as possible. Text inside the page is not directly editable."}
                </div>
              ) : (
                <>
                  {(analysis.value.possibleColumns || analysis.value.possibleTables) && (
                    <div className="inline-guidance">
                      {language === "th"
                        ? "ตรวจพบ layout ซับซ้อน โหมด Editable จะสร้าง reading order และตารางใหม่ จึงอาจต่างจากต้นฉบับ"
                        : "Complex layout detected. Editable mode reconstructs reading order and tables, so formatting may differ from the original."}
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
            disabled={busy || !analysis || Boolean(analysisError) || (analysis?.type === "pdf" && pdfMode === "editable" && (analysis.value.likelyScanned || !analysis.value.hasText))}
            onClick={() => void process()}
          >
            {busy
              ? (language === "th" ? "กำลังประมวลผล…" : "PROCESSING…")
              : isWordToPdf
                ? (language === "th" ? "แปลงเป็น PDF" : "CONVERT TO PDF")
                : (language === "th" ? "แปลงเป็น Word" : "CONVERT TO WORD")} ↗
          </button>
          {busy && (
            <button className="secondary-button" onClick={() => abortRef.current?.abort()}>
              {language === "th" ? "ยกเลิก" : "CANCEL"}
            </button>
          )}
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
