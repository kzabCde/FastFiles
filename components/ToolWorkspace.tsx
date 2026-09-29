"use client";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ToolDefinition } from "@/lib/tools";
import { kindOf } from "@/lib/tools";
import { downloadBlob, downloadZip, formatBytes } from "@/lib/download";
import ResultCenter, { type WorkspaceResult } from "./ResultCenter";
import LiveImageWorkspace from "./LiveImageWorkspace";
import PdfPreview from "./PdfPreview";
import {
  addPdfPageNumbers,
  clearPdfTextMetadata,
  extractPdfPages,
  extractPdfText,
  getPdfMetadata,
  getPdfPageCount,
  imagesToPdf,
  mergePdfs,
  organizePdf,
  parsePageRange,
  pdfToPngs,
  renderPdfThumbnails,
  splitPdfIntoPages,
  updatePdfMetadata,
  watermarkPdf,
  type PageNumberPosition,
  type PdfMetadata,
  type PdfMetadataPatch,
  type PdfPageState,
  type PdfTextPage,
  type PdfWatermarkOptions,
} from "@/lib/pdf-tools";

type Props = {
  tool: ToolDefinition;
  files: File[];
  language: "en" | "th";
  onBack: () => void;
  onReset: () => void;
  onToggleLanguage: () => void;
};

type JobStatus = "idle" | "ready" | "processing" | "success" | "partial-success" | "failed" | "cancelled";
type ProgressState = { label: string; done: number; total: number; detail?: string } | null;
type Runner = (label: string, total: number, task: () => Promise<void>) => Promise<void>;
type ProgressUpdater = (label: string) => (done: number, total: number) => void;

function usePreviewUrls(files: File[]) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = files.map((file) => URL.createObjectURL(file));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  return urls;
}

function Progress({ value, language }: { value: ProgressState; language: "en" | "th" }) {
  if (!value) return null;
  const percent = value.total ? Math.round((value.done / value.total) * 100) : 0;
  return (
    <div className="progress-panel" aria-live="polite">
      <div className="progress-meta"><span>{value.label}</span><strong>{String(value.done).padStart(2, "0")} / {String(value.total).padStart(2, "0")}</strong></div>
      <div className="progress-track"><span style={{ width: `${percent}%` }} /></div>
      <span className="mono muted">{percent}% · {language === "th" ? "ประมวลผลบนอุปกรณ์" : "LOCAL PROCESSING"}{value.detail ? ` · ${value.detail}` : ""}</span>
    </div>
  );
}

export default function ToolWorkspace({ tool, files, language, onBack, onReset, onToggleLanguage }: Props) {
  const [progress, setProgress] = useState<ProgressState>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<WorkspaceResult | null>(null);
  const [status, setStatus] = useState<JobStatus>("ready");
  const busy = status === "processing";

  const run: Runner = async (label, total, task) => {
    if (busy) return;
    setError("");
    setResult(null);
    setStatus("processing");
    setProgress({ label, done: 0, total: Math.max(1, total) });
    try {
      await task();
      setStatus("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : language === "th" ? "ประมวลผลไม่สำเร็จ กรุณาตรวจไฟล์แล้วลองใหม่" : "Processing failed. Check the file and try again.");
      setStatus("failed");
    } finally {
      setProgress(null);
    }
  };

  const update: ProgressUpdater = (label) => (done, total) => setProgress({ label, done, total });
  const title = language === "th" ? tool.thai : tool.label;

  const resultSetter = (next: WorkspaceResult) => {
    setResult(next);
    if (next.cancelled) setStatus("cancelled");
    else if (next.failed?.length) setStatus("partial-success");
    else setStatus("success");
  };

  return (
    <section className="workspace-shell" data-job-status={status}>
      <header className="workspace-head">
        <button className="text-button" onClick={onBack} disabled={busy}>← {language === "th" ? "เครื่องมือ" : "TOOLS"}</button>
        <div><span className="eyebrow">FASTFILES / {tool.short}</span><h1>{title}</h1></div>
        <div className="workspace-head-actions"><button className="chip-button workspace-language" onClick={onToggleLanguage} disabled={busy} aria-label={language === "en" ? "Switch to Thai" : "Switch to English"}>{language === "en" ? "TH" : "EN"}</button><button className="text-button" onClick={onReset} disabled={busy}>{language === "th" ? "ไฟล์ใหม่" : "NEW FILES"}</button></div>
      </header>

      {tool.id === "merge-pdf" && <MergeWorkspace files={files} language={language} run={run} update={update} setResult={resultSetter} busy={busy} />}
      {tool.id === "organize-pdf" && <OrganizeWorkspace file={files[0]} language={language} run={run} setResult={resultSetter} busy={busy} />}
      {tool.id === "split-pdf" && <SplitWorkspace file={files[0]} language={language} run={run} update={update} setResult={resultSetter} busy={busy} />}
      {tool.id === "page-numbers" && <PageNumbersWorkspace file={files[0]} language={language} run={run} setResult={resultSetter} busy={busy} />}
      {tool.id === "pdf-metadata" && <MetadataWorkspace file={files[0]} language={language} run={run} setResult={resultSetter} busy={busy} />}
      {tool.id === "pdf-text" && <PdfTextWorkspace file={files[0]} language={language} run={run} update={update} busy={busy} />}
      {tool.id === "images-to-pdf" && <ImagesToPdfWorkspace files={files} language={language} run={run} update={update} setResult={resultSetter} busy={busy} />}
      {tool.id === "pdf-to-images" && <PdfToImagesWorkspace file={files[0]} language={language} run={run} update={update} setResult={resultSetter} busy={busy} />}
      {tool.id === "watermark" && (files[0] && kindOf(files[0]) === "pdf" ? (
        <PdfWatermarkWorkspace file={files[0]} language={language} run={run} setResult={resultSetter} busy={busy} />
      ) : (
        <LiveImageWorkspace files={files} language={language} toolId={tool.id} run={run} update={update} setResult={resultSetter} busy={busy} />
      ))}
      {(["image-convert", "image-resize", "image-compress"] as string[]).includes(tool.id) && (
        <LiveImageWorkspace files={files} language={language} toolId={tool.id} run={run} update={update} setResult={resultSetter} busy={busy} />
      )}

      <Progress value={progress} language={language} />
      {error && <div className="error-panel" role="alert"><strong>{language === "th" ? "ประมวลผลไม่สำเร็จ" : "PROCESSING ERROR"}</strong><span>{error}</span><button className="text-button" onClick={() => setError("")}>{language === "th" ? "ปิด" : "Dismiss"}</button></div>}
      {result && <ResultCenter result={result} language={language} onChangeSettings={() => setResult(null)} onProcessMore={onReset} />}
    </section>
  );
}

function makeSingleResult(label: string, file: File, blob: Blob, name: string): WorkspaceResult {
  return { label, entries: [{ name, blob, originalSize: file.size, sourceName: file.name }], before: file.size, after: blob.size };
}

function FileList({ files }: { files: File[] }) {
  return <div className="file-list">{files.map((file, index) => <div className="file-row" key={`${file.name}-${file.lastModified}-${index}`}><span className="file-index mono">{String(index + 1).padStart(2, "0")}</span><div><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div><span className="status-dot">READY</span></div>)}</div>;
}

function MergeWorkspace({ files, language, run, update, setResult, busy }: { files: File[]; language: "en" | "th"; run: Runner; update: ProgressUpdater; setResult: (value: WorkspaceResult) => void; busy: boolean }) {
  const pdfs = files.filter((file) => kindOf(file) === "pdf");
  const process = () => run(language === "th" ? "กำลังรวม PDF" : "MERGING PDF", pdfs.length, async () => {
    if (pdfs.length < 2) throw new Error(language === "th" ? "ต้องมี PDF อย่างน้อย 2 ไฟล์" : "Drop at least two PDF files to merge.");
    const blob = await mergePdfs(pdfs, update("MERGING PDF"));
    const name = "fastfiles-merged.pdf";
    downloadBlob(blob, name);
    setResult({ label: language === "th" ? `รวม PDF ${pdfs.length} ไฟล์แล้ว` : `${pdfs.length} PDFs MERGED`, entries: [{ name, blob }], before: pdfs.reduce((sum, file) => sum + file.size, 0), after: blob.size });
  });
  return <div className="workspace-grid"><div><span className="eyebrow">{pdfs.length} PDF FILES</span><FileList files={pdfs} /></div><aside className="action-card"><h2>{language === "th" ? "รวมตามลำดับนี้" : "Merge in this order"}</h2><p>{language === "th" ? "ลำดับจาก File Queue จะถูกใช้ในการรวมไฟล์" : "The File Queue order is preserved in the merged PDF."}</p><button className="primary-button" disabled={busy} onClick={process}>{language === "th" ? "รวมและดาวน์โหลด" : "MERGE & DOWNLOAD"} ↗</button></aside></div>;
}

function OrganizeWorkspace({ file, language, run, setResult, busy }: { file: File; language: "en" | "th"; run: Runner; setResult: (value: WorkspaceResult) => void; busy: boolean }) {
  const [pages, setPages] = useState<PdfPageState[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<PdfPageState[][]>([]);
  const [future, setFuture] = useState<PdfPageState[][]>([]);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragIndex = useRef<number | null>(null);
  const lastSelected = useRef<number | null>(null);
  const organizerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const count = await getPdfPageCount(file);
        if (!active) return;
        setPages(Array.from({ length: count }, (_, sourceIndex) => ({ sourceIndex, rotation: 0 })));
        setThumbs(Array.from({ length: count }, () => ""));
        await renderPdfThumbnails(file, 210, undefined, (index, url) => {
          if (!active) return;
          setThumbs((current) => { const next = [...current]; next[index] = url; return next; });
        });
      } catch {
        if (active) setThumbs([]);
      }
    })();
    return () => { active = false; };
  }, [file]);

  const commit = (next: PdfPageState[]) => {
    setHistory((value) => [...value.slice(-29), pages]);
    setFuture([]);
    setPages(next);
  };
  const undo = () => { const previous = history.at(-1); if (!previous) return; setFuture((value) => [pages, ...value]); setPages(previous); setHistory((value) => value.slice(0, -1)); setSelected(new Set()); };
  const redo = () => { const next = future[0]; if (!next) return; setHistory((value) => [...value, pages]); setPages(next); setFuture((value) => value.slice(1)); setSelected(new Set()); };
  const rotateSelected = () => commit(pages.map((page, index) => selected.has(index) ? { ...page, rotation: (page.rotation + 90) % 360 } : page));
  const duplicateSelected = () => {
    if (!selected.size) return;
    const next: PdfPageState[] = [];
    pages.forEach((page, index) => { next.push(page); if (selected.has(index)) next.push({ ...page }); });
    commit(next);
    setSelected(new Set());
  };
  const deleteSelected = () => { if (!selected.size || selected.size >= pages.length) return; commit(pages.filter((_, index) => !selected.has(index))); setSelected(new Set()); };
  const selectAll = () => setSelected(new Set(pages.map((_, index) => index)));
  const deselectAll = () => setSelected(new Set());
  const selectPage = (index: number, event: ReactMouseEvent) => {
    if (event.shiftKey && lastSelected.current !== null) {
      const start = Math.min(lastSelected.current, index);
      const end = Math.max(lastSelected.current, index);
      setSelected(new Set(Array.from({ length: end - start + 1 }, (_, offset) => start + offset)));
    } else if (event.ctrlKey || event.metaKey) {
      setSelected((value) => { const next = new Set(value); if (next.has(index)) next.delete(index); else next.add(index); return next; });
      lastSelected.current = index;
    } else {
      setSelected(new Set([index]));
      lastSelected.current = index;
    }
  };
  const exportPdf = () => run("EXPORTING PDF", pages.length, async () => { const blob = await organizePdf(file, pages); const name = `${file.name.replace(/\.pdf$/i, "")}-organized.pdf`; downloadBlob(blob, name); setResult(makeSingleResult(language === "th" ? "จัดหน้า PDF แล้ว" : "PDF ORGANIZED", file, blob, name)); });
  const extractSelected = () => run("EXTRACTING PAGES", selected.size || 1, async () => { if (!selected.size) throw new Error(language === "th" ? "เลือกอย่างน้อยหนึ่งหน้าก่อน" : "Select one or more pages first."); const indices = [...selected].sort((a, b) => a - b).map((index) => pages[index].sourceIndex); const blob = await extractPdfPages(file, indices); const name = `${file.name.replace(/\.pdf$/i, "")}-selected.pdf`; downloadBlob(blob, name); setResult(makeSingleResult(language === "th" ? "ดึงหน้าที่เลือกแล้ว" : "PAGES EXTRACTED", file, blob, name)); });

  useEffect(() => {
    const node = organizerRef.current;
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "a") { event.preventDefault(); selectAll(); }
      else if (mod && event.key.toLowerCase() === "z" && event.shiftKey) { event.preventDefault(); redo(); }
      else if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); }
      else if ((event.key === "Delete" || event.key === "Backspace") && selected.size) { event.preventDefault(); deleteSelected(); }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="organize-wrap" ref={organizerRef} tabIndex={0} aria-label={language === "th" ? "พื้นที่จัดหน้า PDF" : "PDF organizer"}>
      <div className="organize-toolbar"><div><strong>{file.name}</strong><span className="muted">{pages.length} {language === "th" ? "หน้า" : "pages"} · {formatBytes(file.size)} · {selected.size} {language === "th" ? "เลือก" : "selected"}</span></div><div className="toolbar-actions">
        <button onClick={undo} disabled={!history.length || busy}>UNDO</button><button onClick={redo} disabled={!future.length || busy}>REDO</button>
        <button onClick={selectAll} disabled={!pages.length || busy}>{language === "th" ? "เลือกทั้งหมด" : "SELECT ALL"}</button><button onClick={deselectAll} disabled={!selected.size || busy}>{language === "th" ? "ยกเลิกเลือก" : "DESELECT"}</button>
        <button onClick={rotateSelected} disabled={!selected.size || busy}>ROTATE</button><button onClick={duplicateSelected} disabled={!selected.size || busy}>DUPLICATE</button><button onClick={extractSelected} disabled={!selected.size || busy}>EXTRACT</button><button onClick={deleteSelected} disabled={!selected.size || selected.size >= pages.length || busy}>DELETE</button>
        <button className="primary-button small" onClick={exportPdf} disabled={busy}>EXPORT PDF ↗</button>
      </div></div>
      <div className="page-grid">{pages.map((page, index) => <div className={`page-card ${selected.has(index) ? "selected" : ""} ${dragOverIndex === index ? "drag-over" : ""}`} key={`${page.sourceIndex}-${index}`} onDragOver={(event) => { event.preventDefault(); setDragOverIndex(index); }} onDragLeave={() => setDragOverIndex((value) => value === index ? null : value)} onDrop={() => { const from = dragIndex.current; setDragOverIndex(null); if (from === null || from === index) return; const next = [...pages]; const [moved] = next.splice(from, 1); next.splice(index, 0, moved); commit(next); dragIndex.current = null; }}>
        <button type="button" className="page-select" aria-pressed={selected.has(index)} aria-label={`${language === "th" ? "เลือกหน้า" : "Select page"} ${index + 1}`} onClick={(event) => selectPage(index, event)}><div className="page-thumb" style={{ transform: `rotate(${page.rotation}deg)` }}>{thumbs[page.sourceIndex] ? <img src={thumbs[page.sourceIndex]} alt={`Page ${page.sourceIndex + 1}`} /> : <div className="thumb-skeleton" />}</div><span className="mono">{String(index + 1).padStart(2, "0")}</span></button>
        <button type="button" className="page-drag-handle" draggable={!busy} aria-label={`${language === "th" ? "ลากเพื่อจัดลำดับหน้า" : "Drag to reorder page"} ${index + 1}`} onDragStart={(event) => { dragIndex.current = index; event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { dragIndex.current = null; setDragOverIndex(null); }}>⋮⋮</button>
      </div>)}</div>
    </div>
  );
}

function SplitWorkspace({ file, language, run, update, setResult, busy }: { file: File; language: "en" | "th"; run: Runner; update: ProgressUpdater; setResult: (value: WorkspaceResult) => void; busy: boolean }) {
  const [pageCount, setPageCount] = useState(0);
  const [range, setRange] = useState("1-3");
  useEffect(() => { getPdfPageCount(file).then(setPageCount).catch(() => setPageCount(0)); }, [file]);
  const extract = () => run("EXTRACTING", 1, async () => { const indices = parsePageRange(range, pageCount); if (!indices.length) throw new Error(language === "th" ? "ใช้รูปแบบเช่น 1-3, 5, 8-10" : "Use a range like 1-3, 5, 8-10."); const blob = await extractPdfPages(file, indices); const name = `${file.name.replace(/\.pdf$/i, "")}-extract.pdf`; downloadBlob(blob, name); setResult(makeSingleResult(language === "th" ? "ดึงหน้าที่เลือกแล้ว" : "PAGES EXTRACTED", file, blob, name)); });
  const split = () => run("SPLITTING PDF", pageCount || 1, async () => { const outputs = await splitPdfIntoPages(file, update("SPLITTING PDF")); await downloadZip(outputs, `${file.name.replace(/\.pdf$/i, "")}-pages.zip`); setResult({ label: language === "th" ? `แยก ${outputs.length} หน้าแล้ว` : `${outputs.length} PAGES SPLIT`, entries: outputs, before: file.size, after: outputs.reduce((sum, item) => sum + item.blob.size, 0) }); });
  return <div className="workspace-grid"><PdfPreview file={file} language={language} /><aside className="action-card"><span className="muted">{pageCount || "—"} {language === "th" ? "หน้า" : "pages"} · {formatBytes(file.size)}</span><label>{language === "th" ? "ช่วงหน้า" : "PAGE RANGE"}<input value={range} onChange={(event) => setRange(event.target.value)} placeholder="1-3, 5, 8-10" /></label><p>{language === "th" ? "ดึงหน้าที่ต้องการเป็น PDF เดียว หรือแยกทุกหน้าเป็น ZIP" : "Extract selected pages into one PDF, or split every page into a ZIP."}</p><button className="primary-button" disabled={busy} onClick={extract}>{language === "th" ? "ดึงหน้าที่เลือก" : "EXTRACT RANGE"} ↗</button><button className="secondary-button" disabled={busy} onClick={split}>{language === "th" ? "แยกทุกหน้าเป็น ZIP" : "SPLIT ALL TO ZIP"}</button></aside></div>;
}

function PageNumbersWorkspace({ file, language, run, setResult, busy }: { file: File; language: "en" | "th"; run: Runner; setResult: (value: WorkspaceResult) => void; busy: boolean }) {
  const [position, setPosition] = useState<PageNumberPosition>("bottom-center");
  const [startNumber, setStartNumber] = useState(1);
  const [startPage, setStartPage] = useState(1);
  const [fontSize, setFontSize] = useState(11);
  const [margin, setMargin] = useState(24);
  const process = () => run("ADDING PAGE NUMBERS", 1, async () => {
    const blob = await addPdfPageNumbers(file, { position, startNumber, startPage, fontSize, margin });
    const name = `${file.name.replace(/\.pdf$/i, "")}-numbered.pdf`;
    downloadBlob(blob, name);
    setResult(makeSingleResult(language === "th" ? "ใส่เลขหน้าแล้ว" : "PAGE NUMBERS ADDED", file, blob, name));
  });
  return <div className="workspace-grid"><div className="preview-document page-number-preview"><span className="doc-mark">PDF</span><h2>{file.name}</h2><span>{language === "th" ? "ตัวอย่างตำแหน่ง" : "Position preview"}: {position}</span><b className={`number-marker ${position}`}>{startNumber}</b></div><aside className="action-card"><label>{language === "th" ? "ตำแหน่ง" : "POSITION"}<select value={position} onChange={(event) => setPosition(event.target.value as PageNumberPosition)}><option value="bottom-left">Bottom left</option><option value="bottom-center">Bottom center</option><option value="bottom-right">Bottom right</option><option value="top-left">Top left</option><option value="top-center">Top center</option><option value="top-right">Top right</option></select></label><div className="field-pair"><label>{language === "th" ? "เริ่มเลข" : "START NUMBER"}<input type="number" min="0" value={startNumber} onChange={(event) => setStartNumber(Number(event.target.value))} /></label><label>{language === "th" ? "เริ่มที่หน้า" : "START ON PAGE"}<input type="number" min="1" value={startPage} onChange={(event) => setStartPage(Math.max(1, Number(event.target.value)))} /></label></div><div className="field-pair"><label>{language === "th" ? "ขนาดตัวอักษร" : "FONT SIZE"}<input type="number" min="7" max="72" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label><label>{language === "th" ? "ระยะขอบ" : "MARGIN"}<input type="number" min="0" value={margin} onChange={(event) => setMargin(Number(event.target.value))} /></label></div><button className="primary-button" disabled={busy} onClick={process}>{language === "th" ? "เพิ่มเลขหน้า" : "ADD PAGE NUMBERS"} ↗</button></aside></div>;
}

function MetadataWorkspace({ file, language, run, setResult, busy }: { file: File; language: "en" | "th"; run: Runner; setResult: (value: WorkspaceResult) => void; busy: boolean }) {
  const [metadata, setMetadata] = useState<PdfMetadata | null>(null);
  const [form, setForm] = useState<PdfMetadataPatch>({ title: "", author: "", subject: "", keywords: [], creator: "", producer: "" });
  const [metadataError, setMetadataError] = useState("");
  useEffect(() => {
    let active = true;
    setMetadata(null);
    setMetadataError("");
    getPdfMetadata(file).then((value) => {
      if (!active) return;
      setMetadata(value);
      setForm({
        title: value.title ?? "",
        author: value.author ?? "",
        subject: value.subject ?? "",
        keywords: (value.keywords ?? "").split(/[,;]\s*/).filter(Boolean),
        creator: value.creator ?? "",
        producer: value.producer ?? "",
      });
    }).catch((error) => {
      if (active) setMetadataError(error instanceof Error ? error.message : "Unable to read metadata.");
    });
    return () => { active = false; };
  }, [file]);
  const updateField = (field: Exclude<keyof PdfMetadataPatch, "keywords">, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const save = () => run(language === "th" ? "กำลังบันทึก Metadata" : "SAVING METADATA", 1, async () => {
    const blob = await updatePdfMetadata(file, form);
    const name = `${file.name.replace(/\.pdf$/i, "")}-metadata-edited.pdf`;
    downloadBlob(blob, name);
    setResult(makeSingleResult(language === "th" ? "แก้ไข Metadata แล้ว" : "PDF METADATA UPDATED", file, blob, name));
  });
  const clear = () => run("CLEARING METADATA", 1, async () => { const blob = await clearPdfTextMetadata(file); const name = `${file.name.replace(/\.pdf$/i, "")}-metadata-cleared.pdf`; downloadBlob(blob, name); setResult(makeSingleResult(language === "th" ? "ล้างข้อมูลข้อความที่รองรับแล้ว" : "SUPPORTED TEXT METADATA CLEARED", file, blob, name)); });
  const rows = metadata ? Object.entries(metadata).filter(([, value]) => value) : [];
  return (
    <div className="workspace-grid">
      <div className="metadata-panel">
        <span className="eyebrow">PDF METADATA</span>
        <h2>{file.name}</h2>
        {metadataError ? <p>{metadataError}</p> : !metadata ? <div className="thumb-skeleton metadata-skeleton" /> : rows.length ? (
          <dl>{rows.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
        ) : <p>{language === "th" ? "ไม่พบข้อมูลข้อความในเอกสาร" : "No text metadata was found."}</p>}
      </div>
      <aside className="action-card">
        <h2>{language === "th" ? "แก้ไข Metadata" : "Edit metadata"}</h2>
        <label>{language === "th" ? "ชื่อเอกสาร" : "TITLE"}<input value={form.title} onChange={(event) => updateField("title", event.target.value)} /></label>
        <label>{language === "th" ? "ผู้เขียน" : "AUTHOR"}<input value={form.author} onChange={(event) => updateField("author", event.target.value)} /></label>
        <label>{language === "th" ? "หัวข้อ" : "SUBJECT"}<input value={form.subject} onChange={(event) => updateField("subject", event.target.value)} /></label>
        <label>{language === "th" ? "คำสำคัญ คั่นด้วยจุลภาค" : "KEYWORDS, COMMA-SEPARATED"}<input value={form.keywords.join(", ")} onChange={(event) => setForm((current) => ({ ...current, keywords: event.target.value.split(/[,;]\s*/) }))} /></label>
        <div className="field-pair">
          <label>{language === "th" ? "โปรแกรมผู้สร้าง" : "CREATOR"}<input value={form.creator} onChange={(event) => updateField("creator", event.target.value)} /></label>
          <label>{language === "th" ? "โปรแกรมผลิต PDF" : "PRODUCER"}<input value={form.producer} onChange={(event) => updateField("producer", event.target.value)} /></label>
        </div>
        <p>{language === "th" ? "วันที่สร้าง/แก้ไขและ metadata ระดับล่างบางชนิดอาจยังคงอยู่" : "Creation dates and some low-level metadata may remain unchanged."}</p>
        <button className="primary-button" disabled={busy || !metadata} onClick={save}>{language === "th" ? "บันทึก Metadata" : "SAVE METADATA"} ↗</button>
        <button className="secondary-button" disabled={busy || !metadata} onClick={clear}>{language === "th" ? "ล้างข้อมูลข้อความ" : "CLEAR TEXT METADATA"}</button>
      </aside>
    </div>
  );
}

function PdfTextWorkspace({ file, language, run, update, busy }: { file: File; language: "en" | "th"; run: Runner; update: ProgressUpdater; busy: boolean }) {
  const [pageCount, setPageCount] = useState(0);
  const [range, setRange] = useState("");
  const [pages, setPages] = useState<PdfTextPage[]>([]);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    let active = true;
    getPdfPageCount(file).then((count) => { if (active) setPageCount(count); }).catch(() => { if (active) setPageCount(0); });
    setPages([]);
    setRange("");
    return () => { active = false; };
  }, [file]);

  const combinedText = pages.map((page) => `--- Page ${page.pageNumber} ---\n${page.text}`).join("\n\n");
  const hasText = pages.some((page) => page.text.trim());
  const process = () => {
    const selected = range.trim() ? parsePageRange(range, pageCount) : undefined;
    if (range.trim() && !selected?.length) {
      return run(language === "th" ? "กำลังตรวจช่วงหน้า" : "VALIDATING PAGE RANGE", 1, async () => {
        throw new Error(language === "th" ? "ใช้รูปแบบช่วงหน้า เช่น 1-3, 5, 8-10" : "Use a page range such as 1-3, 5, 8-10.");
      });
    }
    const total = selected?.length || pageCount || 1;
    return run(language === "th" ? "กำลังดึงข้อความ" : "EXTRACTING PDF TEXT", total, async () => {
      const extracted = await extractPdfText(file, selected, update(language === "th" ? "กำลังดึงข้อความ" : "EXTRACTING PDF TEXT"));
      setPages(extracted);
      setCopyState("idle");
    });
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(combinedText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };
  const download = () => {
    const name = `${file.name.replace(/\.pdf$/i, "")}-text.txt`;
    downloadBlob(new Blob([combinedText], { type: "text/plain;charset=utf-8" }), name);
  };

  return (
    <>
      <div className="workspace-grid">
        <PdfPreview file={file} language={language} />
        <aside className="action-card">
          <h2>{language === "th" ? "ดึงข้อความที่เลือกได้" : "Extract selectable text"}</h2>
          <span className="muted">{pageCount || "—"} {language === "th" ? "หน้า" : "pages"} · {formatBytes(file.size)}</span>
          <label>{language === "th" ? "ช่วงหน้า (เว้นว่าง = ทุกหน้า)" : "PAGE RANGE (BLANK = ALL)"}<input value={range} onChange={(event) => setRange(event.target.value)} placeholder="1-3, 5, 8-10" /></label>
          <p>{language === "th" ? "ดึงเฉพาะ text layer ที่อยู่ใน PDF การสแกนที่เป็นภาพอย่างเดียวต้องใช้ OCR ซึ่งยังไม่รวมในเครื่องมือนี้" : "This reads the PDF text layer. Image-only scans require OCR, which is not part of this tool yet."}</p>
          <button className="primary-button" disabled={busy || !pageCount} onClick={() => void process()}>{language === "th" ? "ดึงข้อความ" : "EXTRACT TEXT"} ↗</button>
        </aside>
      </div>

      {pages.length > 0 && (
        <section className="pdf-text-panel" aria-live="polite" data-testid="pdf-text-result">
          <div className="pdf-text-heading">
            <div><span className="section-kicker">{language === "th" ? "ข้อความที่พบ" : "EXTRACTED TEXT"}</span><h2>{file.name}</h2></div>
            <div className="pdf-text-actions">
              {hasText && <button className="secondary-button" onClick={() => void copy()}>{copyState === "copied" ? (language === "th" ? "คัดลอกแล้ว" : "COPIED") : copyState === "failed" ? (language === "th" ? "คัดลอกไม่สำเร็จ" : "COPY FAILED") : (language === "th" ? "คัดลอกทั้งหมด" : "COPY ALL")}</button>}
              {hasText && <button className="primary-button" onClick={download}>{language === "th" ? "ดาวน์โหลด TXT" : "DOWNLOAD TXT"} ↗</button>}
            </div>
          </div>
          {!hasText ? (
            <div className="inline-guidance">{language === "th" ? "ไม่พบข้อความที่เลือกได้ เอกสารนี้อาจเป็นไฟล์สแกนหรือไม่มี Unicode text layer" : "No selectable text was found. This may be a scanned document or a PDF without a usable Unicode text layer."}</div>
          ) : (
            <div className="pdf-text-pages">{pages.map((page) => <article key={page.pageNumber}><strong>{language === "th" ? `หน้า ${page.pageNumber}` : `Page ${page.pageNumber}`}</strong><pre>{page.text || (language === "th" ? "ไม่พบข้อความในหน้านี้" : "No text on this page")}</pre></article>)}</div>
          )}
        </section>
      )}
    </>
  );
}

function ImagesToPdfWorkspace({ files, language, run, update, setResult, busy }: { files: File[]; language: "en" | "th"; run: Runner; update: ProgressUpdater; setResult: (value: WorkspaceResult) => void; busy: boolean }) {
  const images = files.filter((file) => kindOf(file) === "image");
  const urls = usePreviewUrls(images);
  const process = () => run("BUILDING PDF", images.length, async () => { const blob = await imagesToPdf(images, update("BUILDING PDF")); const name = "fastfiles-images.pdf"; downloadBlob(blob, name); setResult({ label: language === "th" ? `${images.length} รูปเป็น PDF` : `${images.length} IMAGES → PDF`, entries: [{ name, blob }], before: images.reduce((sum, file) => sum + file.size, 0), after: blob.size }); });
  return <div className="workspace-grid"><div className="image-grid">{images.map((file, index) => <figure key={`${file.name}-${index}`}><img src={urls[index]} alt={file.name} /><figcaption><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></figcaption></figure>)}</div><aside className="action-card"><h2>A4 DOCUMENT</h2><p>{language === "th" ? "รูปจะถูกจัดกึ่งกลางลงบนหน้า A4 ตามลำดับจาก File Queue" : "Images are centered on A4 pages using the File Queue order."}</p><button className="primary-button" disabled={busy} onClick={process}>{language === "th" ? "สร้าง PDF" : "CREATE PDF"} ↗</button></aside></div>;
}

function PdfToImagesWorkspace({ file, language, run, update, setResult, busy }: { file: File; language: "en" | "th"; run: Runner; update: ProgressUpdater; setResult: (value: WorkspaceResult) => void; busy: boolean }) {
  const process = () => run("RENDERING PDF", 1, async () => { const outputs = await pdfToPngs(file, update("RENDERING PDF")); await downloadZip(outputs, `${file.name.replace(/\.pdf$/i, "")}-images.zip`); setResult({ label: language === "th" ? `แปลง ${outputs.length} หน้าเป็น PNG แล้ว` : `${outputs.length} PDF PAGES → PNG`, entries: outputs, before: file.size, after: outputs.reduce((sum, item) => sum + item.blob.size, 0) }); });
  return <div className="workspace-grid"><PdfPreview file={file} language={language} /><aside className="action-card"><h2>PNG EXPORT</h2><p>{language === "th" ? "เรนเดอร์ทุกหน้าเป็น PNG และรวมผลลัพธ์เป็น ZIP" : "Render every page as PNG and bundle the results as ZIP."}</p><button className="primary-button" disabled={busy} onClick={process}>{language === "th" ? "แปลงและดาวน์โหลด ZIP" : "CONVERT & DOWNLOAD ZIP"} ↗</button></aside></div>;
}

function PdfWatermarkWorkspace({ file, language, run, setResult, busy }: { file: File; language: "en" | "th"; run: Runner; setResult: (value: WorkspaceResult) => void; busy: boolean }) {
  const [text, setText] = useState("CONFIDENTIAL");
  const [opacity, setOpacity] = useState(16);
  const [fontSize, setFontSize] = useState(44);
  const [rotation, setRotation] = useState(-24);
  const [color, setColor] = useState("#202320");
  const [position, setPosition] = useState<PdfWatermarkOptions["position"]>("center");
  const [pages, setPages] = useState<PdfWatermarkOptions["pages"]>("all");
  const [customPages, setCustomPages] = useState("1-3, 6");
  const positions: PdfWatermarkOptions["position"][] = ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"];
  const process = () => run("WATERMARKING PDF", 1, async () => {
    const blob = await watermarkPdf(file, { text, opacity: opacity / 100, fontSize, rotation, color, position, pages, customPages });
    const name = `${file.name.replace(/\.pdf$/i, "")}-watermarked.pdf`;
    downloadBlob(blob, name);
    setResult(makeSingleResult(language === "th" ? "ใส่ลายน้ำแล้ว" : "WATERMARK APPLIED", file, blob, name));
  });
  return <div className="workspace-grid"><PdfPreview file={file} language={language} /><aside className="action-card pdf-watermark-controls"><label>{language === "th" ? "ข้อความลายน้ำ" : "WATERMARK TEXT"}<input value={text} onChange={(event) => setText(event.target.value)} /></label><div className="field-pair"><label>{language === "th" ? "ขนาด" : "FONT SIZE"}<input type="number" min="8" max="144" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label><label>{language === "th" ? "สี" : "COLOR"}<input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label></div><label>{language === "th" ? "ความทึบ" : "OPACITY"} · {opacity}%<input type="range" min="5" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label><label>{language === "th" ? "การหมุน" : "ROTATION"} · {rotation}°<input type="range" min="-180" max="180" value={rotation} onChange={(event) => setRotation(Number(event.target.value))} /></label><span className="control-section-title">{language === "th" ? "ตำแหน่ง" : "POSITION"}</span><div className="watermark-position-grid">{positions.map((value) => <button type="button" key={value} className={position === value ? "active" : ""} aria-label={value} onClick={() => setPosition(value)}>{value.replace(/top|bottom|center/g, (part) => part === "top" ? "↑" : part === "bottom" ? "↓" : "•")}</button>)}</div><label>{language === "th" ? "ใช้กับหน้า" : "PAGES"}<select value={pages} onChange={(event) => setPages(event.target.value as PdfWatermarkOptions["pages"])}><option value="all">{language === "th" ? "ทั้งหมด" : "All"}</option><option value="odd">{language === "th" ? "หน้าคี่" : "Odd"}</option><option value="even">{language === "th" ? "หน้าคู่" : "Even"}</option><option value="custom">{language === "th" ? "กำหนดเอง" : "Custom"}</option></select></label>{pages === "custom" && <label>{language === "th" ? "ช่วงหน้า" : "PAGE RANGE"}<input value={customPages} onChange={(event) => setCustomPages(event.target.value)} placeholder="1-3, 6, 9-12" /></label>}<p>{language === "th" ? "ประมวลผลบนอุปกรณ์และตรวจสอบช่วงหน้าก่อนส่งออก" : "Processed on-device with page-range validation before export."}</p><button className="primary-button" disabled={busy || !text.trim()} onClick={process}>{language === "th" ? "ใส่ลายน้ำ" : "APPLY & DOWNLOAD"} ↗</button></aside></div>;
}
