"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ToolDefinition } from "@/lib/tools";
import { kindOf } from "@/lib/tools";
import { downloadBlob, downloadZip, formatBytes } from "@/lib/download";
import { processImages, type ImageFormat, type ImageProcessOptions } from "@/lib/image-tools";
import {
  extractPdfPages,
  getPdfPageCount,
  imagesToPdf,
  mergePdfs,
  organizePdf,
  parsePageRange,
  pdfToPngs,
  renderPdfThumbnails,
  splitPdfIntoPages,
  watermarkPdf,
  type PdfPageState,
} from "@/lib/pdf-tools";

type Props = {
  tool: ToolDefinition;
  files: File[];
  language: "en" | "th";
  onBack: () => void;
  onReset: () => void;
};

type ProgressState = { label: string; done: number; total: number } | null;

function usePreviewUrls(files: File[]) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = files.map((file) => URL.createObjectURL(file));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  return urls;
}

function Progress({ value }: { value: ProgressState }) {
  if (!value) return null;
  const percent = value.total ? Math.round((value.done / value.total) * 100) : 0;
  return (
    <div className="progress-panel" aria-live="polite">
      <div className="progress-meta"><span>{value.label}</span><strong>{String(value.done).padStart(2, "0")} / {String(value.total).padStart(2, "0")}</strong></div>
      <div className="progress-track"><span style={{ width: `${percent}%` }} /></div>
      <span className="mono muted">{percent}% · LOCAL PROCESSING</span>
    </div>
  );
}

export default function ToolWorkspace({ tool, files, language, onBack, onReset }: Props) {
  const [progress, setProgress] = useState<ProgressState>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ before: number; after: number; label: string } | null>(null);
  const busy = Boolean(progress);

  const run = async (label: string, total: number, task: () => Promise<void>) => {
    setError("");
    setResult(null);
    setProgress({ label, done: 0, total: Math.max(1, total) });
    try {
      await task();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Processing failed. Try a smaller file or another browser.");
    } finally {
      setProgress(null);
    }
  };

  const update = (label: string) => (done: number, total: number) => setProgress({ label, done, total });
  const title = language === "th" ? tool.thai : tool.label;

  return (
    <section className="workspace-shell">
      <header className="workspace-head">
        <button className="text-button" onClick={onBack} disabled={busy}>← {language === "th" ? "เครื่องมือ" : "TOOLS"}</button>
        <div>
          <span className="eyebrow">FASTFILES / {tool.short}</span>
          <h1>{title}</h1>
        </div>
        <button className="text-button" onClick={onReset} disabled={busy}>{language === "th" ? "ไฟล์ใหม่" : "NEW FILES"}</button>
      </header>

      {tool.id === "merge-pdf" && <MergeWorkspace files={files} language={language} run={run} update={update} setResult={setResult} />}
      {tool.id === "organize-pdf" && <OrganizeWorkspace file={files[0]} language={language} run={run} />}
      {tool.id === "split-pdf" && <SplitWorkspace file={files[0]} language={language} run={run} update={update} />}
      {tool.id === "images-to-pdf" && <ImagesToPdfWorkspace files={files} language={language} run={run} update={update} setResult={setResult} />}
      {tool.id === "pdf-to-images" && <PdfToImagesWorkspace file={files[0]} language={language} run={run} update={update} />}
      {tool.id === "watermark" && (files[0] && kindOf(files[0]) === "pdf" ? (
        <PdfWatermarkWorkspace file={files[0]} language={language} run={run} />
      ) : (
        <ImageWorkspace files={files} language={language} toolId={tool.id} run={run} update={update} setResult={setResult} />
      ))}
      {(["image-convert", "image-resize", "image-compress"] as string[]).includes(tool.id) && (
        <ImageWorkspace files={files} language={language} toolId={tool.id} run={run} update={update} setResult={setResult} />
      )}

      <Progress value={progress} />
      {error && <div className="error-panel"><strong>PROCESSING ERROR</strong><span>{error}</span></div>}
      {result && (
        <div className="result-panel">
          <span className="eyebrow">DONE.</span>
          <strong>{result.label}</strong>
          <div className="result-stats"><span>{formatBytes(result.before)}</span><span>→</span><span>{formatBytes(result.after)}</span></div>
          {result.before > 0 && result.after < result.before && <span className="mono muted">SAVED {Math.round((1 - result.after / result.before) * 100)}%</span>}
        </div>
      )}
    </section>
  );
}

type Runner = (label: string, total: number, task: () => Promise<void>) => Promise<void>;
type ProgressUpdater = (label: string) => (done: number, total: number) => void;

function FileList({ files }: { files: File[] }) {
  return (
    <div className="file-list">
      {files.map((file, index) => (
        <div className="file-row" key={`${file.name}-${file.lastModified}-${index}`}>
          <span className="file-index mono">{String(index + 1).padStart(2, "0")}</span>
          <div><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div>
          <span className="status-dot">READY</span>
        </div>
      ))}
    </div>
  );
}

function MergeWorkspace({ files, language, run, update, setResult }: { files: File[]; language: "en" | "th"; run: Runner; update: ProgressUpdater; setResult: (value: { before: number; after: number; label: string }) => void }) {
  const pdfs = files.filter((file) => kindOf(file) === "pdf");
  const process = () => run("MERGING PDF", pdfs.length, async () => {
    if (pdfs.length < 2) throw new Error("Drop at least two PDF files to merge.");
    const blob = await mergePdfs(pdfs, update("MERGING PDF"));
    downloadBlob(blob, "fastfiles-merged.pdf");
    setResult({ before: pdfs.reduce((sum, file) => sum + file.size, 0), after: blob.size, label: `${pdfs.length} PDFs MERGED` });
  });
  return <div className="workspace-grid"><div><span className="eyebrow">{pdfs.length} PDF FILES</span><FileList files={pdfs} /></div><aside className="action-card"><h2>{language === "th" ? "รวมตามลำดับนี้" : "Merge in this order"}</h2><p>{language === "th" ? "ไฟล์จะถูกประมวลผลบนอุปกรณ์นี้ และดาวน์โหลดเป็น PDF เดียว" : "Files are processed on this device and exported as one PDF."}</p><button className="primary-button" onClick={process}>MERGE & DOWNLOAD ↗</button></aside></div>;
}

function OrganizeWorkspace({ file, language, run }: { file: File; language: "en" | "th"; run: Runner }) {
  const [pages, setPages] = useState<PdfPageState[]>([]);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [history, setHistory] = useState<PdfPageState[][]>([]);
  const [future, setFuture] = useState<PdfPageState[][]>([]);
  const dragIndex = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const count = await getPdfPageCount(file);
        if (!active) return;
        setPages(Array.from({ length: count }, (_, sourceIndex) => ({ sourceIndex, rotation: 0 })));
        const rendered = await renderPdfThumbnails(file, 210);
        if (active) setThumbs(rendered);
      } catch {
        if (active) setThumbs([]);
      }
    })();
    return () => { active = false; };
  }, [file]);

  const commit = (next: PdfPageState[]) => {
    setHistory((value) => [...value.slice(-19), pages]);
    setFuture([]);
    setPages(next);
  };
  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((value) => [pages, ...value]);
    setPages(previous);
    setHistory((value) => value.slice(0, -1));
    setSelected(new Set());
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((value) => [...value, pages]);
    setPages(next);
    setFuture((value) => value.slice(1));
    setSelected(new Set());
  };
  const rotateSelected = () => commit(pages.map((page, index) => selected.has(index) ? { ...page, rotation: (page.rotation + 90) % 360 } : page));
  const deleteSelected = () => {
    if (selected.size >= pages.length) return;
    commit(pages.filter((_, index) => !selected.has(index)));
    setSelected(new Set());
  };
  const exportPdf = () => run("EXPORTING PDF", pages.length, async () => {
    const blob = await organizePdf(file, pages);
    downloadBlob(blob, `${file.name.replace(/\.pdf$/i, "")}-organized.pdf`);
  });
  const extractSelected = () => run("EXTRACTING PAGES", selected.size || 1, async () => {
    if (!selected.size) throw new Error("Select one or more pages first.");
    const indices = [...selected].sort((a, b) => a - b).map((index) => pages[index].sourceIndex);
    const blob = await extractPdfPages(file, indices);
    downloadBlob(blob, `${file.name.replace(/\.pdf$/i, "")}-selected.pdf`);
  });

  return (
    <div className="organize-wrap">
      <div className="organize-toolbar">
        <div><strong>{file.name}</strong><span className="muted">{pages.length} {language === "th" ? "หน้า" : "pages"} · {formatBytes(file.size)}</span></div>
        <div className="toolbar-actions">
          <button onClick={undo} disabled={!history.length}>UNDO</button><button onClick={redo} disabled={!future.length}>REDO</button>
          <button onClick={rotateSelected} disabled={!selected.size}>ROTATE</button><button onClick={extractSelected} disabled={!selected.size}>EXTRACT</button><button onClick={deleteSelected} disabled={!selected.size || selected.size >= pages.length}>DELETE</button>
          <button className="primary-button small" onClick={exportPdf}>EXPORT PDF ↗</button>
        </div>
      </div>
      <div className="page-grid">
        {pages.map((page, index) => (
          <button
            type="button"
            className={`page-card ${selected.has(index) ? "selected" : ""}`}
            key={`${page.sourceIndex}-${index}`}
            draggable
            onDragStart={() => { dragIndex.current = index; }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              const from = dragIndex.current;
              if (from === null || from === index) return;
              const next = [...pages];
              const [moved] = next.splice(from, 1);
              next.splice(index, 0, moved);
              commit(next);
              dragIndex.current = null;
            }}
            onClick={() => setSelected((value) => {
              const next = new Set(value);
              next.has(index) ? next.delete(index) : next.add(index);
              return next;
            })}
          >
            <div className="page-thumb" style={{ transform: `rotate(${page.rotation}deg)` }}>
              {thumbs[page.sourceIndex] ? <img src={thumbs[page.sourceIndex]} alt={`Page ${page.sourceIndex + 1}`} /> : <div className="thumb-skeleton" />}
            </div>
            <span className="mono">{String(index + 1).padStart(2, "0")}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SplitWorkspace({ file, language, run, update }: { file: File; language: "en" | "th"; run: Runner; update: ProgressUpdater }) {
  const [pageCount, setPageCount] = useState(0);
  const [range, setRange] = useState("1-3");
  useEffect(() => { getPdfPageCount(file).then(setPageCount).catch(() => setPageCount(0)); }, [file]);
  const extract = () => run("EXTRACTING", 1, async () => {
    const indices = parsePageRange(range, pageCount);
    if (!indices.length) throw new Error("Use a range like 1-3, 5, 8-10.");
    const blob = await extractPdfPages(file, indices);
    downloadBlob(blob, `${file.name.replace(/\.pdf$/i, "")}-extract.pdf`);
  });
  const split = () => run("SPLITTING PDF", pageCount || 1, async () => {
    const outputs = await splitPdfIntoPages(file, update("SPLITTING PDF"));
    await downloadZip(outputs, `${file.name.replace(/\.pdf$/i, "")}-pages.zip`);
  });
  return <div className="workspace-grid"><div className="preview-document"><span className="doc-mark">PDF</span><h2>{file.name}</h2><span>{pageCount || "—"} {language === "th" ? "หน้า" : "pages"} · {formatBytes(file.size)}</span></div><aside className="action-card"><label>PAGE RANGE<input value={range} onChange={(event) => setRange(event.target.value)} placeholder="1-3, 5, 8-10" /></label><p>{language === "th" ? "ดึงหน้าที่ต้องการเป็น PDF เดียว หรือแยกทุกหน้าเป็น ZIP" : "Extract selected pages into one PDF, or split every page into a ZIP."}</p><button className="primary-button" onClick={extract}>EXTRACT RANGE ↗</button><button className="secondary-button" onClick={split}>SPLIT ALL TO ZIP</button></aside></div>;
}

function ImagesToPdfWorkspace({ files, language, run, update, setResult }: { files: File[]; language: "en" | "th"; run: Runner; update: ProgressUpdater; setResult: (value: { before: number; after: number; label: string }) => void }) {
  const images = files.filter((file) => kindOf(file) === "image");
  const urls = usePreviewUrls(images);
  const process = () => run("BUILDING PDF", images.length, async () => {
    const blob = await imagesToPdf(images, update("BUILDING PDF"));
    downloadBlob(blob, "fastfiles-images.pdf");
    setResult({ before: images.reduce((sum, file) => sum + file.size, 0), after: blob.size, label: `${images.length} IMAGES → PDF` });
  });
  return <div className="workspace-grid"><div className="image-grid">{images.map((file, index) => <figure key={`${file.name}-${index}`}><img src={urls[index]} alt={file.name} /><figcaption><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></figcaption></figure>)}</div><aside className="action-card"><h2>A4 DOCUMENT</h2><p>{language === "th" ? "รูปจะถูกจัดกึ่งกลางลงบนหน้า A4 ตามลำดับปัจจุบัน" : "Images are centered on A4 pages in the current order."}</p><button className="primary-button" onClick={process}>CREATE PDF ↗</button></aside></div>;
}

function PdfToImagesWorkspace({ file, language, run, update }: { file: File; language: "en" | "th"; run: Runner; update: ProgressUpdater }) {
  const process = () => run("RENDERING PDF", 1, async () => {
    const outputs = await pdfToPngs(file, update("RENDERING PDF"));
    await downloadZip(outputs, `${file.name.replace(/\.pdf$/i, "")}-images.zip`);
  });
  return <div className="workspace-grid"><div className="preview-document"><span className="doc-mark">PDF</span><h2>{file.name}</h2><span>{formatBytes(file.size)}</span></div><aside className="action-card"><h2>PNG EXPORT</h2><p>{language === "th" ? "เรนเดอร์ทุกหน้าเป็น PNG และรวมผลลัพธ์เป็น ZIP" : "Render every page as a high-quality PNG and bundle the results as ZIP."}</p><button className="primary-button" onClick={process}>CONVERT & DOWNLOAD ZIP ↗</button></aside></div>;
}

function PdfWatermarkWorkspace({ file, language, run }: { file: File; language: "en" | "th"; run: Runner }) {
  const [text, setText] = useState("CONFIDENTIAL");
  const [opacity, setOpacity] = useState(16);
  const process = () => run("WATERMARKING PDF", 1, async () => {
    const blob = await watermarkPdf(file, text, opacity / 100);
    downloadBlob(blob, `${file.name.replace(/\.pdf$/i, "")}-watermarked.pdf`);
  });
  return <div className="workspace-grid"><div className="preview-document"><span className="doc-mark">PDF</span><h2>{file.name}</h2><span>{formatBytes(file.size)}</span></div><aside className="action-card"><label>WATERMARK TEXT<input value={text} onChange={(event) => setText(event.target.value)} /></label><label>OPACITY · {opacity}%<input type="range" min="5" max="55" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label><p>{language === "th" ? "ใส่ลายน้ำกึ่งกลางทุกหน้าโดยไม่ส่งไฟล์ขึ้นเซิร์ฟเวอร์" : "Apply a centered watermark to every page without uploading the file."}</p><button className="primary-button" onClick={process}>APPLY & DOWNLOAD ↗</button></aside></div>;
}

function ImageWorkspace({ files, language, toolId, run, update, setResult }: { files: File[]; language: "en" | "th"; toolId: string; run: Runner; update: ProgressUpdater; setResult: (value: { before: number; after: number; label: string }) => void }) {
  const images = files.filter((file) => kindOf(file) === "image");
  const urls = usePreviewUrls(images);
  const [format, setFormat] = useState<ImageFormat>(toolId === "image-compress" ? "image/webp" : "image/webp");
  const [quality, setQuality] = useState(toolId === "image-compress" ? 0.74 : 0.86);
  const [maxWidth, setMaxWidth] = useState(toolId === "image-resize" ? 1920 : 0);
  const [maxHeight, setMaxHeight] = useState(0);
  const [cropSquare, setCropSquare] = useState(false);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [flipX, setFlipX] = useState(false);
  const [watermark, setWatermark] = useState(toolId === "watermark" ? "FastFiles" : "");

  const options: ImageProcessOptions = { format, quality, maxWidth: maxWidth || undefined, maxHeight: maxHeight || undefined, cropSquare, rotation, flipX, watermark: watermark || undefined };
  const process = () => run("PROCESSING IMAGES", images.length, async () => {
    if (!images.length) throw new Error("Add at least one image first.");
    const outputs = await processImages(images, options, update("PROCESSING IMAGES"));
    const before = outputs.reduce((sum, item) => sum + item.originalSize, 0);
    const after = outputs.reduce((sum, item) => sum + item.blob.size, 0);
    if (outputs.length === 1) downloadBlob(outputs[0].blob, outputs[0].name);
    else await downloadZip(outputs.map((item) => ({ name: item.name, blob: item.blob })), "fastfiles-images.zip");
    setResult({ before, after, label: `${outputs.length} IMAGE${outputs.length === 1 ? "" : "S"} PROCESSED` });
  });

  const estimated = useMemo(() => Math.round(images.reduce((sum, file) => sum + file.size, 0) * quality * (maxWidth ? 0.72 : 1)), [images, quality, maxWidth]);
  return (
    <div className="image-workspace">
      <div className="image-preview-column">
        <span className="eyebrow">{images.length} {language === "th" ? "รูป" : "IMAGES"}</span>
        <div className="image-grid large">{images.slice(0, 12).map((file, index) => <figure key={`${file.name}-${index}`}><img src={urls[index]} alt={file.name} /><figcaption><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></figcaption></figure>)}</div>
      </div>
      <aside className="control-panel">
        <div className="control-head"><span>SETTINGS</span><span className="mono muted">LOCAL ONLY</span></div>
        <label>FORMAT<select value={format} onChange={(event) => setFormat(event.target.value as ImageFormat)}><option value="image/webp">WEBP</option><option value="image/jpeg">JPG</option><option value="image/png">PNG</option></select></label>
        <label>QUALITY · {Math.round(quality * 100)}%<input type="range" min="35" max="100" value={Math.round(quality * 100)} onChange={(event) => setQuality(Number(event.target.value) / 100)} /></label>
        <div className="field-pair"><label>MAX WIDTH<input type="number" min="0" value={maxWidth || ""} placeholder="Original" onChange={(event) => setMaxWidth(Math.max(0, Number(event.target.value)))} /></label><label>MAX HEIGHT<input type="number" min="0" value={maxHeight || ""} placeholder="Original" onChange={(event) => setMaxHeight(Math.max(0, Number(event.target.value)))} /></label></div>
        <div className="toggle-grid"><button className={cropSquare ? "active" : ""} onClick={() => setCropSquare((value) => !value)}>1:1 CROP</button><button className={flipX ? "active" : ""} onClick={() => setFlipX((value) => !value)}>FLIP X</button><button onClick={() => setRotation((value) => ((value + 90) % 360) as 0 | 90 | 180 | 270)}>ROTATE {rotation}°</button></div>
        <label>WATERMARK<input value={watermark} onChange={(event) => setWatermark(event.target.value)} placeholder="Optional" /></label>
        <div className="estimate"><span>ORIGINAL <strong>{formatBytes(images.reduce((sum, file) => sum + file.size, 0))}</strong></span><span>ESTIMATED <strong>{formatBytes(estimated)}</strong></span></div>
        <button className="primary-button" onClick={process}>PROCESS {images.length > 1 ? `${images.length} FILES` : "IMAGE"} ↗</button>
      </aside>
    </div>
  );
}
