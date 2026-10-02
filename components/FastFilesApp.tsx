"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ToolWorkspace from "./ToolWorkspace";
import FileQueue from "./FileQueue";
import NavigationMenu from "./NavigationMenu";
import QRGenerator from "./QRGenerator";
import { TOOLS, TOOL_CATEGORIES, groupKind, searchTools, toolsFor, type ToolDefinition } from "@/lib/tools";
import { formatBytes } from "@/lib/download";
import { APP_VERSION } from "@/lib/app-info";
import { inspectFiles, isLargeWorkload, summarizeQueue, usableFiles, type FileQueueItem } from "@/lib/file-intake";

type Language = "en" | "th";
type Theme = "system" | "light" | "dark";

const copy = {
  en: {
    hero: "Files should be easier.",
    body: "Merge, convert, resize, compress, organize and generate QR codes without unnecessary uploads.",
    drop: "Drop files here",
    dropSub: "or click to browse · paste supported files",
    local: "Processed locally on your device",
    private: "No account. No permanent storage.",
    ask: "Choose what happens next.",
    search: "What do you want to do?",
    tools: "Tools",
    privacy: "Privacy",
    about: "About",
    newFiles: "Add files",
    detected: "Files ready",
    clear: "Clear",
    browse: "Browse files",
    popular: "Popular tools",
    popularSub: "Everyday PDF, image and QR work, without the clutter.",
    mixed: "Mixed PDF and image selections do not share a safe action yet. Remove a type or add matching files.",
    noReady: "Remove unavailable files before choosing a tool.",
    workload: "Large workload",
    workloadBody: "This operation may use significant memory on this device. FastFiles does not claim a fixed maximum file size because browser limits vary by device.",
    continue: "Continue anyway",
  },
  th: {
    hero: "จัดการไฟล์ให้ง่ายกว่านี้",
    body: "รวม แปลง ปรับขนาด บีบอัด จัดหน้าไฟล์ และสร้าง QR Code โดยลดการอัปโหลดที่ไม่จำเป็น",
    drop: "วางไฟล์ที่นี่",
    dropSub: "หรือคลิกเพื่อเลือกไฟล์ · รองรับการวางไฟล์จากคลิปบอร์ด",
    local: "ประมวลผลบนอุปกรณ์ของคุณ",
    private: "ไม่ต้องสมัครสมาชิก และไม่เก็บไฟล์ถาวร",
    ask: "เลือกสิ่งที่ต้องการทำต่อ",
    search: "คุณต้องการทำอะไร?",
    tools: "เครื่องมือ",
    privacy: "ความเป็นส่วนตัว",
    about: "เกี่ยวกับ",
    newFiles: "เพิ่มไฟล์",
    detected: "ไฟล์พร้อมแล้ว",
    clear: "ล้าง",
    browse: "เลือกไฟล์",
    popular: "เครื่องมือยอดนิยม",
    popularSub: "งาน PDF รูปภาพ และ QR Code ที่ใช้บ่อย โดยไม่เพิ่มขั้นตอนเกินจำเป็น",
    mixed: "ไฟล์ PDF และรูปภาพที่เลือกพร้อมกันยังไม่มีเครื่องมือร่วมที่ปลอดภัย กรุณาลบหนึ่งประเภทหรือเพิ่มไฟล์ชนิดเดียวกัน",
    noReady: "กรุณาลบไฟล์ที่ใช้ไม่ได้ก่อนเลือกเครื่องมือ",
    workload: "งานขนาดใหญ่",
    workloadBody: "การทำงานนี้อาจใช้หน่วยความจำมากบนอุปกรณ์นี้ FastFiles ไม่ระบุขนาดไฟล์สูงสุดตายตัว เพราะข้อจำกัดของเบราว์เซอร์แตกต่างกันในแต่ละอุปกรณ์",
    continue: "ดำเนินการต่อ",
  },
} satisfies Record<Language, Record<string, string>>;

const toolDescriptions: Record<ToolDefinition["id"], Record<Language, string>> = {
  "merge-pdf": { en: "Combine multiple PDFs into one file", th: "รวม PDF หลายไฟล์เป็นไฟล์เดียว" },
  "compress-pdf": { en: "Reduce image-heavy PDFs by flattening pages locally", th: "ลดขนาด PDF ที่มีภาพเยอะโดยแปลงหน้าเป็นภาพในเครื่อง" },
  "organize-pdf": { en: "Reorder, rotate, duplicate and remove pages", th: "เรียง หมุน ทำซ้ำ และลบหน้า PDF" },
  "rotate-pdf": { en: "Rotate all pages at once — ideal for scans", th: "หมุนทุกหน้าพร้อมกัน เหมาะกับไฟล์สแกน" },
  "split-pdf": { en: "Split a PDF or extract selected pages", th: "แยก PDF หรือดึงเฉพาะหน้าที่ต้องการ" },
  "page-numbers": { en: "Add configurable page numbers locally", th: "เพิ่มเลขหน้าพร้อมกำหนดตำแหน่งได้" },
  "pdf-metadata": { en: "View, edit and clear supported document metadata", th: "ดู แก้ไข และล้างข้อมูลเอกสารที่รองรับ" },
  "pdf-text": { en: "Extract selectable PDF text as a local TXT file", th: "ดึงข้อความที่เลือกได้จาก PDF เป็นไฟล์ TXT" },
  "pdf-to-html": { en: "Export PDF pages as an offline visual web document", th: "แปลงหน้า PDF เป็นเว็บออฟไลน์ที่คงหน้าตาเดิม" },
  "html-to-pdf": { en: "Turn safe local HTML into a downloadable PDF", th: "แปลง HTML ที่ตรวจสอบแล้วเป็น PDF ในเครื่อง" },
  "images-to-pdf": { en: "Turn JPG, PNG and WebP into PDF", th: "รวม JPG, PNG และ WebP เป็น PDF" },
  "pdf-to-images": { en: "Export PDF pages as PNG images", th: "แปลงหน้า PDF ออกเป็น PNG" },
  "image-convert": { en: "Convert JPG, PNG, WebP and supported AVIF", th: "แปลง JPG, PNG, WebP และ AVIF เมื่อเบราว์เซอร์รองรับ" },
  "image-resize": { en: "Resize one image or a whole batch", th: "ปรับขนาดรูปเดี่ยวหรือหลายรูปพร้อมกัน" },
  "image-compress": { en: "Reduce image size for web and sharing", th: "ลดขนาดรูปสำหรับเว็บและการแชร์" },
  watermark: { en: "Add a clean text watermark to files", th: "เพิ่มลายน้ำข้อความให้ PDF หรือรูปภาพ" },
  "pdf-sign": { en: "Draw or type your signature onto a PDF", th: "วาดหรือพิมพ์ลายเซ็นลงบน PDF" },
};

export default function FastFilesApp() {
  const [queue, setQueue] = useState<FileQueueItem[]>([]);
  const [activeTool, setActiveTool] = useState<ToolDefinition | null>(null);
  const [activeQr, setActiveQr] = useState(false);
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    return (window.localStorage.getItem("fastfiles-theme") as Theme | null) ?? "system";
  });
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const [acceptLargeWorkload, setAcceptLargeWorkload] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = copy[language];

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("fastfiles-theme") as Theme | null;
    const savedLanguage = window.localStorage.getItem("fastfiles-language") as Language | null;
    if (savedTheme && ["system", "light", "dark"].includes(savedTheme)) setTheme(savedTheme);
    if (savedLanguage && ["en", "th"].includes(savedLanguage)) setLanguage(savedLanguage);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("fastfiles-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language;
    window.localStorage.setItem("fastfiles-language", language);
  }, [language]);

  const acceptFiles = useCallback(async (incoming: File[], source?: "drop" | "picker" | "paste") => {
    if (!incoming.length) return;
    setNotice(language === "th" ? "กำลังตรวจไฟล์…" : "Checking files…");
    const inspected = await inspectFiles(incoming);
    setQueue((current) => {
      const fingerprints = new Set(current.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
      const additions = inspected.filter((item) => !fingerprints.has(`${item.file.name}:${item.file.size}:${item.file.lastModified}`));
      return [...current, ...additions];
    });
    if (source === "paste") {
      const count = incoming.length;
      setNotice(language === "th" ? `วางจาก clipboard ${count} ไฟล์สำเร็จ` : `Pasted ${count} file${count > 1 ? "s" : ""} from clipboard`);
      window.setTimeout(() => setNotice((current) => current.includes("clipboard") || current.includes("Pasted") ? "" : current), 2500);
    } else {
      setNotice("");
    }
    setActiveTool(null);
    setActiveQr(false);
    setAcceptLargeWorkload(false);
  }, [language]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const pasted = [...(event.clipboardData?.files ?? [])].map((file) => {
        if (file.name === "image.png" || file.name === "Untitled" || !file.name) {
          const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
          const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
          return new File([file], `clipboard-${stamp}.${ext}`, { type: file.type });
        }
        return file;
      });
      if (pasted.length) void acceptFiles(pasted, "paste");
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [acceptFiles]);

  const reset = () => {
    setQueue([]);
    setActiveTool(null);
    setActiveQr(false);
    setNotice("");
    setAcceptLargeWorkload(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const files = useMemo(() => usableFiles(queue), [queue]);
  const summary = useMemo(() => summarizeQueue(queue), [queue]);
  const availableTools = useMemo(() => toolsFor(files), [files]);
  const searchResults = useMemo(() => searchTools(query).slice(0, 8), [query]);
  const kind = groupKind(files);
  const largeWorkload = isLargeWorkload(summary) && !acceptLargeWorkload;
  const qrMatches = /(^|\s)(qr|wifi|wi-fi|คิวอาร์|ไวไฟ)/i.test(query.trim()) || query.trim().toLowerCase() === "code";

  const removeFile = (id: string) => {
    setQueue((current) => current.filter((item) => item.id !== id));
    setActiveTool(null);
    setAcceptLargeWorkload(false);
  };

  const reorderFiles = (from: number, to: number) => {
    setQueue((current) => {
      if (from < 0 || to < 0 || from >= current.length || to >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const openPicker = () => {
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.click();
  };

  const openTool = (tool: ToolDefinition) => {
    setActiveQr(false);
    const currentKind = groupKind(files);
    const normalizedKind = currentKind === "image" ? "image" : currentKind === "pdf" ? "pdf" : currentKind === "html" ? "html" : null;
    if (files.length && normalizedKind && tool.accepts.includes(normalizedKind)) setActiveTool(tool);
    else openPicker();
  };

  if (activeQr) {
    return (
      <QRGenerator
        language={language}
        theme={theme}
        onThemeChange={(nextTheme) => {
          document.documentElement.dataset.theme = nextTheme;
          window.localStorage.setItem("fastfiles-theme", nextTheme);
          setTheme(nextTheme);
        }}
        onToggleLanguage={() => setLanguage((value) => value === "en" ? "th" : "en")}
        onBack={() => setActiveQr(false)}
      />
    );
  }

  if (activeTool && files.length) {
    return (
      <ToolWorkspace
        tool={activeTool}
        files={files}
        language={language}
        onToggleLanguage={() => setLanguage((value) => value === "en" ? "th" : "en")}
        onBack={() => setActiveTool(null)}
        onReset={reset}
        onSelectTool={openTool}
      />
    );
  }

  return (
    <main
      className={`app-shell ${dragging ? "global-dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void acceptFiles([...event.dataTransfer.files]); }}
    >
      <header className="site-header">
        <div className="header-inner">
          <div style={{ justifySelf: "start", display: "flex", alignItems: "center", gap: 10 }}>
            <div className="mobile-only">
              <NavigationMenu variant="mobile" language={language} onSelectTool={openTool} onOpenQr={() => { setActiveTool(null); setActiveQr(true); }} />
            </div>
            <button className="brand" onClick={reset} aria-label="FastFiles home"><FastFilesMark /><span>FastFiles</span></button>
          </div>
          <nav><NavigationMenu variant="desktop" language={language} onSelectTool={openTool} onOpenQr={() => { setActiveTool(null); setActiveQr(true); }} /><a href="#privacy">{t.privacy}</a><a href="#about">{t.about}</a></nav>
          <div className="header-actions">
            <select
              aria-label="Theme"
              value={theme}
              onChange={(event) => {
                const nextTheme = event.target.value as Theme;
                document.documentElement.dataset.theme = nextTheme;
                window.localStorage.setItem("fastfiles-theme", nextTheme);
                setTheme(nextTheme);
              }}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <button className="chip-button" onClick={() => setLanguage((value) => value === "en" ? "th" : "en")}>{language === "en" ? "TH" : "EN"}</button>
            <button className="top-drop-button" onClick={openPicker}>{t.newFiles}<span>+</span></button>
          </div>
        </div>
      </header>

      <input ref={inputRef} hidden multiple type="file" accept="application/pdf,text/html,image/jpeg,image/png,image/webp,image/avif,.pdf,.html,.htm,.jpg,.jpeg,.png,.webp,.avif" onChange={(event) => void acceptFiles([...(event.target.files ?? [])])} />

      <section className="hero-section">
        <div className="hero-wrap">
          <div className="hero-copy">
            <div className="product-pill"><span className="live-dot" /> FastFiles v{APP_VERSION}</div>
            <h1>{t.hero}</h1>
            <p className="hero-body">{t.body}</p>
            <div className="trust-row">
              <div className="trust-chip"><ShieldIcon /><span><strong>{t.local}</strong><small>Browser-first workflow</small></span></div>
              <div className="trust-chip"><SparkIcon /><span><strong>{t.private}</strong><small>Start immediately</small></span></div>
            </div>
          </div>

          <button className={`drop-surface ${queue.length ? "has-files" : ""}`} onClick={openPicker}>
            <div className="drop-glow" aria-hidden="true" />
            {!queue.length ? (
              <div className="drop-content"><span className="drop-plus">+</span><strong>{t.drop}</strong><span>{t.dropSub}</span><div className="format-pills"><small>PDF</small><small>JPG</small><small>PNG</small><small>WEBP</small><small>AVIF</small></div><span className="browse-link">{t.browse} <b>→</b></span><span className="paste-hint muted">{language === "th" ? "หรือกด Ctrl+V วางจาก clipboard" : "or press Ctrl+V to paste from clipboard"}</span></div>
            ) : (
              <div className="drop-content loaded">
                <span className="ready-badge"><span className="live-dot" /> {t.detected}</span>
                <DropzoneThumbnails items={queue} />
                <strong>{summary.count} {language === "th" ? "ไฟล์" : summary.count === 1 ? "file" : "files"}</strong>
                <span>{formatBytes(summary.totalSize)} · {summary.pdfCount} PDF · {summary.imageCount} IMG · {summary.htmlCount} HTML</span>
                <span className="browse-link">+ {t.newFiles}</span>
              </div>
            )}
          </button>
        </div>
      </section>

      {notice && <div className="notice-bar"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Close">×</button></div>}

      {queue.length > 0 && (
        <section className="detected-panel section-shell">
          <div className="detected-card">
            <FileQueue items={queue} summary={summary} language={language} onRemove={removeFile} onReorder={reorderFiles} onAdd={openPicker} onClear={reset} />

            {largeWorkload && (
              <div className="workload-warning" role="alert">
                <div><strong>{t.workload}</strong><p>{t.workloadBody}</p></div>
                <div><button className="secondary-button" onClick={reset}>{t.clear}</button><button className="primary-button small" onClick={() => setAcceptLargeWorkload(true)}>{t.continue}</button></div>
              </div>
            )}

            <div className="detected-head suggestions-head"><div><span className="section-kicker">Smart actions</span><h2>{t.ask}</h2></div></div>
            {files.length === 0 ? <p className="inline-guidance">{t.noReady}</p> : kind === "mixed" ? <p className="inline-guidance">{t.mixed}</p> : (
              <div className={`suggested-tools tool-card-grid ${largeWorkload ? "disabled-zone" : ""}`}>
                {availableTools.map((tool) => <ToolButton key={tool.id} tool={tool} language={language} disabled={largeWorkload} onClick={() => setActiveTool(tool)} />)}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="tool-section section-shell" id="tools">
        <div className="section-heading">
          <div><span className="section-kicker">FastFiles toolkit</span><h2>{t.popular}</h2><p>{t.popularSub}</p></div>
          <div className="tool-search-wrap"><SearchIcon /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} aria-label={t.search} /><kbd>⌘ K</kbd></div>
        </div>
        {query ? (
          <div className="tool-card-grid">
            {searchResults.map((tool) => <ToolButton key={tool.id} tool={tool} language={language} onClick={() => openTool(tool)} />)}
            {qrMatches && <button className="tool-card" onClick={() => setActiveQr(true)} aria-label={language === "th" ? "สร้าง QR Code" : "QR Generator"}><div className="tool-card-top"><span className="tool-icon"><QrGlyph /></span></div><div><strong className="tool-name">{language === "th" ? "สร้าง QR Code" : "QR Generator"}</strong><p>{language === "th" ? "สร้าง QR จากข้อความ ลิงก์ Wi-Fi อีเมล โทรศัพท์ และ SMS" : "Create QR codes for text, URLs, Wi-Fi, email, phone and SMS."}</p></div><span className="tool-code">QR · LOCAL</span></button>}
          </div>
        ) : (
          <>
            {TOOL_CATEGORIES.map((category) => {
              const categoryTools = category.toolIds.map((id) => TOOLS.find((t) => t.id === id)).filter(Boolean) as ToolDefinition[];
              if (!categoryTools.length) return null;
              return (
                <div key={category.key} className="tool-category">
                  <h3 className="tool-category-title">{language === "th" ? category.th : category.en}</h3>
                  <div className="tool-card-grid">
                    {categoryTools.map((tool) => <ToolButton key={tool.id} tool={tool} language={language} onClick={() => openTool(tool)} />)}
                    {category.key === "enhance" && <button className="tool-card" onClick={() => setActiveQr(true)} aria-label={language === "th" ? "สร้าง QR Code" : "QR Generator"}><div className="tool-card-top"><span className="tool-icon"><QrGlyph /></span></div><div><strong className="tool-name">{language === "th" ? "สร้าง QR Code" : "QR Generator"}</strong><p>{language === "th" ? "สร้าง QR จากข้อความ ลิงก์ Wi-Fi อีเมล" : "Create QR codes for text, URLs, Wi-Fi, email."}</p></div><span className="tool-code">QR · LOCAL</span></button>}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </section>

      <section className="privacy-section section-shell" id="privacy">
        <div className="privacy-card"><div className="privacy-icon"><ShieldIcon /></div><div><span className="section-kicker">Local-first</span><h2>{language === "th" ? "ไฟล์และข้อมูลของคุณยังเป็นของคุณ" : "Your files and data stay yours."}</h2></div><div className="privacy-copy"><p>{language === "th" ? "เครื่องมือหลักของ FastFiles รวมถึง QR Generator ทำงานในเบราว์เซอร์ ไฟล์ต้นฉบับและข้อมูล QR ไม่ถูกเก็บถาวร และไม่มีบัญชีผู้ใช้" : "Core FastFiles tools, including QR generation, run in your browser. Original files and QR content are not permanently stored and no account is required."}</p><div className="privacy-points"><span>Local processing</span><span>No account</span><span>No permanent file storage</span></div></div></div>
      </section>

      <section className="about-strip section-shell" id="about"><div><FastFilesMark /><span><strong>FastFiles</strong><small>Drop. Edit. Done.</small></span></div><p>PDF + Image + QR tools designed for reliable everyday work.</p><span>v{APP_VERSION}</span></section>
      <footer className="section-shell"><span>© 2026 FastFiles</span><span>Private by design</span><span>Built for the browser</span></footer>
      {dragging && <div className="drag-overlay"><span className="drop-plus">+</span><strong>{language === "th" ? "วางไฟล์ได้ทุกที่" : "Drop files anywhere"}</strong><span>PDF · JPG · PNG · WEBP</span></div>}
    </main>
  );
}

function ToolButton({ tool, language, onClick, disabled = false }: { tool: ToolDefinition; language: Language; onClick: () => void; disabled?: boolean }) {
  return <button className="tool-card" onClick={onClick} disabled={disabled}><div className="tool-card-top"><span className="tool-icon"><ToolGlyph id={tool.id} /></span></div><div><strong className="tool-name">{language === "th" ? tool.thai : tool.label}</strong><p>{toolDescriptions[tool.id][language]}</p></div><span className="tool-code">{tool.short}</span></button>;
}

function FastFilesMark() {
  return <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 64 64"><g transform="skewX(-11)"><rect x="18" y="14" width="31" height="9" rx="4.5" /><rect className="mark-accent" x="18" y="28" width="24" height="9" rx="4.5" /><rect x="18" y="42" width="15" height="9" rx="4.5" /></g></svg></span>;
}

function ToolGlyph({ id }: { id: ToolDefinition["id"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (id === "merge-pdf") return <svg viewBox="0 0 24 24" {...common}><path d="M7 5h8a2 2 0 0 1 2 2v10"/><path d="M5 7v10a2 2 0 0 0 2 2h8"/><path d="M12 11v6M9 14h6"/></svg>;
  if (id === "compress-pdf") return <svg viewBox="0 0 24 24" {...common}><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h4M9 12h6M9 16h6"/><path d="m4 10 3 3-3 3M20 10l-3 3 3 3"/></svg>;
  if (id === "organize-pdf") return <svg viewBox="0 0 24 24" {...common}><rect x="4" y="5" width="6" height="6" rx="1"/><rect x="14" y="5" width="6" height="6" rx="1"/><rect x="4" y="15" width="6" height="4" rx="1"/><path d="M14 17h6M17 14v6"/></svg>;
  if (id === "rotate-pdf") return <svg viewBox="0 0 24 24" {...common}><path d="M12 5V1L7 6l5 5V7a6 6 0 0 1 6 6"/><path d="M12 19v4l5-5-5-5v4a6 6 0 0 1-6-6"/></svg>;
  if (id === "split-pdf") return <svg viewBox="0 0 24 24" {...common}><path d="M8 4h5l4 4v12H8z"/><path d="M13 4v4h4M5 12h6M8 9v6"/></svg>;
  if (id === "page-numbers") return <svg viewBox="0 0 24 24" {...common}><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h4M9 12h2v5M14 12h2a1 1 0 0 1 0 2h-2v3h3"/></svg>;
  if (id === "pdf-metadata") return <svg viewBox="0 0 24 24" {...common}><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h4M9 12h6M9 15h6M9 18h4"/></svg>;
  if (id === "pdf-text") return <svg viewBox="0 0 24 24" {...common}><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v5h4M9 12h6M9 15h6M9 18h6"/><path d="M4 9h5"/></svg>;
  if (id === "pdf-to-html") return <svg viewBox="0 0 24 24" {...common}><path d="M5 3h9l4 4v5M14 3v5h4"/><path d="m8 15-3 3 3 3M16 15l3 3-3 3M13 14l-2 8"/></svg>;
  if (id === "html-to-pdf") return <svg viewBox="0 0 24 24" {...common}><path d="m7 5-4 4 4 4M13 5l4 4-4 4M11 3 9 15"/><path d="M8 19h11M16 16l3 3-3 3"/></svg>;
  if (id === "images-to-pdf") return <svg viewBox="0 0 24 24" {...common}><rect x="3" y="5" width="8" height="8" rx="1.5"/><path d="m4.5 11 2-2 1.5 1.5 1.5-2 1.5 2.5M15 5h4a2 2 0 0 1 2 2v12h-8v-4"/><path d="M16 16h2M17 15v2"/></svg>;
  if (id === "pdf-to-images") return <svg viewBox="0 0 24 24" {...common}><path d="M5 4h8l4 4v4"/><path d="M13 4v4h4"/><rect x="10" y="13" width="10" height="7" rx="1.5"/><path d="m11.5 18 2-2 1.5 1.5 1.5-2 2 2.5"/></svg>;
  if (id === "image-convert") return <svg viewBox="0 0 24 24" {...common}><rect x="4" y="5" width="12" height="12" rx="2"/><path d="m5.5 15 3-3 2 2 2-3 3.5 4M17 8h3v3M20 8l-4 4"/></svg>;
  if (id === "image-resize") return <svg viewBox="0 0 24 24" {...common}><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4"/><path d="m4 8 5-5M20 8l-5-5M4 16l5 5M20 16l-5 5"/></svg>;
  if (id === "image-compress") return <svg viewBox="0 0 24 24" {...common}><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/><path d="m4 9 6-6M20 9l-6-6M4 15l6 6M20 15l-6 6"/></svg>;
  if (id === "pdf-sign") return <svg viewBox="0 0 24 24" {...common}><path d="m16.5 3.5 4 4L9 19H5v-4zM13 7l4 4"/><path d="M5 21h14" strokeDasharray="2 2"/></svg>;
  return <svg viewBox="0 0 24 24" {...common}><path d="M6 4h12v16H6z"/><path d="M9 15c2-4 4-6 6-8M8 17h8"/></svg>;
}

function QrGlyph() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2v4h-2M14 18v2h4M20 20h.01"/></svg>; }
function SearchIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>; }
function ShieldIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.7 7.8-7 10-4.3-2.2-7-5.4-7-10V6z"/><path d="m9 12 2 2 4-4"/></svg>; }
function SparkIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c.7 4.2 2.8 6.3 7 7-4.2.7-6.3 2.8-7 7-.7-4.2-2.8-6.3-7-7 4.2-.7 6.3-2.8 7-7Z"/><path d="M19 16c.2 1.4.9 2.1 2.3 2.3-1.4.2-2.1.9-2.3 2.3-.2-1.4-.9-2.1-2.3-2.3 1.4-.2 2.1-.9 2.3-2.3Z"/></svg>; }

function DropzoneThumbnails({ items }: { items: FileQueueItem[] }) {
  const images = items.filter((item) => item.kind === "image");
  if (!images.length) return null;

  return (
    <div className="dropzone-thumbnails">
      {images.slice(0, 4).map((item) => (
        <DropzoneThumbItem key={item.id} file={item.file} />
      ))}
      {images.length > 4 && (
        <span className="dropzone-more-badge">+{images.length - 4}</span>
      )}
    </div>
  );
}

function DropzoneThumbItem({ file }: { file: File }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  if (!src) return null;

  return (
    <span className="dropzone-thumb" title={file.name}>
      <img src={src} alt={file.name} loading="lazy" />
    </span>
  );
}

