"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolWorkspace from "./ToolWorkspace";
import { TOOLS, groupKind, searchTools, toolsFor, type ToolDefinition } from "@/lib/tools";
import { formatBytes } from "@/lib/download";

type Language = "en" | "th";
type Theme = "system" | "light" | "dark";

const copy = {
  en: {
    hero: "Files should be easier.",
    body: "Merge, convert, resize, compress and organize files without sending them across the internet.",
    drop: "Drop files here",
    dropSub: "or click to browse · paste supported files",
    local: "Processed locally on your device",
    private: "No account. No permanent storage.",
    ask: "What would you like to do?",
    search: "What do you want to do?",
    tools: "Tools",
    privacy: "Privacy",
    about: "About",
    newFiles: "Add files",
    detected: "Files ready",
    clear: "Clear",
    browse: "Browse files",
    popular: "Popular tools",
    popularSub: "Everything you need for everyday PDF and image work.",
  },
  th: {
    hero: "จัดการไฟล์ให้ง่ายกว่านี้",
    body: "รวม แปลง ปรับขนาด บีบอัด และจัดหน้าไฟล์ โดยไม่ต้องส่งไฟล์ออกจากเครื่องโดยไม่จำเป็น",
    drop: "วางไฟล์ที่นี่",
    dropSub: "หรือคลิกเพื่อเลือกไฟล์ · รองรับการวางไฟล์จากคลิปบอร์ด",
    local: "ประมวลผลบนอุปกรณ์ของคุณ",
    private: "ไม่ต้องสมัครสมาชิก และไม่เก็บไฟล์ถาวร",
    ask: "ต้องการทำอะไรกับไฟล์เหล่านี้?",
    search: "คุณต้องการทำอะไรกับไฟล์?",
    tools: "เครื่องมือ",
    privacy: "ความเป็นส่วนตัว",
    about: "เกี่ยวกับ",
    newFiles: "เพิ่มไฟล์",
    detected: "ไฟล์พร้อมแล้ว",
    clear: "ล้าง",
    browse: "เลือกไฟล์",
    popular: "เครื่องมือยอดนิยม",
    popularSub: "เครื่องมือที่ใช้บ่อยสำหรับ PDF และรูปภาพในที่เดียว",
  },
} satisfies Record<Language, Record<string, string>>;

const toolDescriptions: Record<ToolDefinition["id"], Record<Language, string>> = {
  "merge-pdf": { en: "Combine multiple PDFs into one file", th: "รวม PDF หลายไฟล์เป็นไฟล์เดียว" },
  "organize-pdf": { en: "Reorder, rotate and remove pages", th: "เรียง หมุน และลบหน้า PDF" },
  "split-pdf": { en: "Split a PDF or extract selected pages", th: "แยก PDF หรือดึงเฉพาะหน้าที่ต้องการ" },
  "images-to-pdf": { en: "Turn JPG, PNG and WebP into PDF", th: "รวม JPG, PNG และ WebP เป็น PDF" },
  "pdf-to-images": { en: "Export PDF pages as PNG images", th: "แปลงหน้า PDF ออกเป็น PNG" },
  "image-convert": { en: "Convert JPG, PNG and WebP formats", th: "แปลงไฟล์ JPG, PNG และ WebP" },
  "image-resize": { en: "Resize images while keeping them sharp", th: "ปรับขนาดรูปโดยคงความคมชัด" },
  "image-compress": { en: "Reduce image size for web and sharing", th: "ลดขนาดรูปสำหรับเว็บและการแชร์" },
  watermark: { en: "Add a clean text watermark to files", th: "เพิ่มลายน้ำข้อความให้ PDF หรือรูปภาพ" },
};

export default function FastFilesApp() {
  const [files, setFiles] = useState<File[]>([]);
  const [activeTool, setActiveTool] = useState<ToolDefinition | null>(null);
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [theme, setTheme] = useState<Theme>("system");
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
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

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const pasted = [...(event.clipboardData?.files ?? [])];
      if (pasted.length) acceptFiles(pasted);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const acceptFiles = (incoming: File[]) => {
    const supported = incoming.filter((file) => file.type === "application/pdf" || file.type.startsWith("image/") || /\.pdf$/i.test(file.name));
    if (!supported.length) {
      setNotice(language === "th" ? "เวอร์ชันนี้รองรับ PDF, JPG, PNG และ WebP" : "This version supports PDF, JPG, PNG and WebP files.");
      return;
    }
    setNotice(supported.length < incoming.length ? (language === "th" ? "ข้ามไฟล์ที่ยังไม่รองรับแล้ว" : "Unsupported files were skipped.") : "");
    setFiles((current) => [...current, ...supported]);
    setActiveTool(null);
  };

  const reset = () => {
    setFiles([]);
    setActiveTool(null);
    setNotice("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const availableTools = useMemo(() => toolsFor(files), [files]);
  const searchResults = useMemo(() => searchTools(query).slice(0, 6), [query]);
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const kind = groupKind(files);

  if (activeTool && files.length) {
    return <ToolWorkspace tool={activeTool} files={files} language={language} onBack={() => setActiveTool(null)} onReset={reset} />;
  }

  return (
    <main
      className={`app-shell ${dragging ? "global-dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFiles([...event.dataTransfer.files]); }}
    >
      <header className="site-header">
        <div className="header-inner">
          <button className="brand" onClick={reset} aria-label="FastFiles home">
            <FastFilesMark />
            <span>FastFiles</span>
          </button>
          <nav>
            <a href="#tools">{t.tools}</a>
            <a href="#privacy">{t.privacy}</a>
            <a href="#about">{t.about}</a>
          </nav>
          <div className="header-actions">
            <select aria-label="Theme" value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <button className="chip-button" onClick={() => setLanguage((value) => value === "en" ? "th" : "en")}>{language === "en" ? "TH" : "EN"}</button>
            <button className="top-drop-button" onClick={() => inputRef.current?.click()}>{t.newFiles}<span>+</span></button>
          </div>
        </div>
      </header>

      <input
        ref={inputRef}
        hidden
        multiple
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={(event) => acceptFiles([...(event.target.files ?? [])])}
      />

      <section className="hero-section">
        <div className="hero-wrap">
          <div className="hero-copy">
            <div className="product-pill"><span className="live-dot" /> Private by design</div>
            <h1>{t.hero}</h1>
            <p className="hero-body">{t.body}</p>
            <div className="trust-row">
              <div className="trust-chip"><ShieldIcon /><span><strong>{t.local}</strong><small>Fast, browser-based workflow</small></span></div>
              <div className="trust-chip"><SparkIcon /><span><strong>{t.private}</strong><small>Start working immediately</small></span></div>
            </div>
          </div>

          <button className={`drop-surface ${files.length ? "has-files" : ""}`} onClick={() => inputRef.current?.click()}>
            <div className="drop-glow" aria-hidden="true" />
            {!files.length ? (
              <div className="drop-content">
                <span className="drop-plus">+</span>
                <strong>{t.drop}</strong>
                <span>{t.dropSub}</span>
                <div className="format-pills"><small>PDF</small><small>JPG</small><small>PNG</small><small>WEBP</small></div>
                <span className="browse-link">{t.browse} <b>→</b></span>
              </div>
            ) : (
              <div className="drop-content loaded">
                <span className="ready-badge"><span className="live-dot" /> {t.detected}</span>
                <strong>{files.length} {files.length === 1 ? "file" : "files"}</strong>
                <span>{formatBytes(totalSize)} · {kind.toUpperCase()}</span>
                <span className="browse-link">+ {t.newFiles}</span>
              </div>
            )}
          </button>
        </div>
      </section>

      {notice && <div className="notice-bar"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Close">×</button></div>}

      {files.length > 0 && (
        <section className="detected-panel section-shell">
          <div className="detected-card">
            <div className="detected-head">
              <div><span className="section-kicker">{t.detected}</span><h2>{t.ask}</h2></div>
              <button className="text-button" onClick={reset}>{t.clear}</button>
            </div>
            <div className="selected-files">
              {files.slice(0, 5).map((file, index) => (
                <div key={`${file.name}-${file.lastModified}-${index}`}><span className="file-type-mini">{file.name.split(".").pop()?.toUpperCase()}</span><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div>
              ))}
              {files.length > 5 && <div><span className="file-type-mini">+{files.length - 5}</span><strong>More files</strong><span>{formatBytes(totalSize)}</span></div>}
            </div>
            <div className="suggested-tools tool-card-grid">
              {availableTools.map((tool) => <ToolButton key={tool.id} tool={tool} language={language} onClick={() => setActiveTool(tool)} />)}
            </div>
          </div>
        </section>
      )}

      <section className="tool-section section-shell" id="tools">
        <div className="section-heading">
          <div><span className="section-kicker">FastFiles toolkit</span><h2>{t.popular}</h2><p>{t.popularSub}</p></div>
          <div className="tool-search-wrap">
            <SearchIcon />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} aria-label={t.search} />
            <kbd>⌘ K</kbd>
          </div>
        </div>
        <div className="tool-card-grid">
          {(query ? searchResults : TOOLS).map((tool) => <ToolButton key={tool.id} tool={tool} language={language} onClick={() => {
            if (files.length && tool.accepts.includes(kind === "image" ? "image" : "pdf")) setActiveTool(tool);
            else inputRef.current?.click();
          }} />)}
        </div>
      </section>

      <section className="privacy-section section-shell" id="privacy">
        <div className="privacy-card">
          <div className="privacy-icon"><ShieldIcon /></div>
          <div><span className="section-kicker">Local-first</span><h2>Your files stay yours.</h2></div>
          <div className="privacy-copy">
            <p>{language === "th" ? "FastFiles ประมวลผลเครื่องมือหลักในเบราว์เซอร์โดยตรง ไฟล์ต้นฉบับไม่ถูกเก็บถาวร และไม่ต้องสร้างบัญชีเพื่อเริ่มใช้งาน" : "Core FastFiles tools run directly in your browser. Original files are not permanently stored, and no account is required to start working."}</p>
            <div className="privacy-points"><span>Local processing</span><span>No account</span><span>No permanent file storage</span></div>
          </div>
        </div>
      </section>

      <section className="about-strip section-shell" id="about">
        <div><FastFilesMark /><span><strong>FastFiles</strong><small>Drop. Edit. Done.</small></span></div>
        <p>PDF + Image tools designed for quick everyday work.</p>
        <span>v0.1</span>
      </section>

      <footer className="section-shell"><span>© 2026 FastFiles</span><span>Private by design</span><span>Built for the browser</span></footer>

      {dragging && <div className="drag-overlay"><span className="drop-plus">+</span><strong>Drop files anywhere</strong><span>PDF · JPG · PNG · WEBP</span></div>}
    </main>
  );
}

function ToolButton({ tool, language, onClick }: { tool: ToolDefinition; language: Language; onClick: () => void }) {
  return (
    <button className="tool-card" onClick={onClick}>
      <div className="tool-card-top"><span className="tool-icon"><ToolGlyph id={tool.id} /></span><span className="tool-arrow">↗</span></div>
      <div><strong className="tool-name">{language === "th" ? tool.thai : tool.label}</strong><p>{toolDescriptions[tool.id][language]}</p></div>
      <span className="tool-code">{tool.short}</span>
    </button>
  );
}

function FastFilesMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 64 64"><g transform="skewX(-11)"><rect x="18" y="14" width="31" height="9" rx="4.5" /><rect className="mark-accent" x="18" y="28" width="24" height="9" rx="4.5" /><rect x="18" y="42" width="15" height="9" rx="4.5" /></g></svg>
    </span>
  );
}

function ToolGlyph({ id }: { id: ToolDefinition["id"] }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (id === "merge-pdf") return <svg viewBox="0 0 24 24" {...common}><path d="M7 5h8a2 2 0 0 1 2 2v10"/><path d="M5 7v10a2 2 0 0 0 2 2h8"/><path d="M12 11v6M9 14h6"/></svg>;
  if (id === "organize-pdf") return <svg viewBox="0 0 24 24" {...common}><rect x="4" y="5" width="6" height="6" rx="1"/><rect x="14" y="5" width="6" height="6" rx="1"/><rect x="4" y="15" width="6" height="4" rx="1"/><path d="M14 17h6M17 14v6"/></svg>;
  if (id === "split-pdf") return <svg viewBox="0 0 24 24" {...common}><path d="M8 4h5l4 4v12H8z"/><path d="M13 4v4h4M5 12h6M8 9v6"/></svg>;
  if (id === "images-to-pdf") return <svg viewBox="0 0 24 24" {...common}><rect x="3" y="5" width="8" height="8" rx="1.5"/><path d="m4.5 11 2-2 1.5 1.5 1.5-2 1.5 2.5M15 5h4a2 2 0 0 1 2 2v12h-8v-4"/><path d="M16 16h2M17 15v2"/></svg>;
  if (id === "pdf-to-images") return <svg viewBox="0 0 24 24" {...common}><path d="M5 4h8l4 4v4"/><path d="M13 4v4h4"/><rect x="10" y="13" width="10" height="7" rx="1.5"/><path d="m11.5 18 2-2 1.5 1.5 1.5-2 2 2.5"/></svg>;
  if (id === "image-convert") return <svg viewBox="0 0 24 24" {...common}><rect x="4" y="5" width="12" height="12" rx="2"/><path d="m5.5 15 3-3 2 2 2-3 3.5 4M17 8h3v3M20 8l-4 4"/></svg>;
  if (id === "image-resize") return <svg viewBox="0 0 24 24" {...common}><path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4"/><path d="m4 8 5-5M20 8l-5-5M4 16l5 5M20 16l-5 5"/></svg>;
  if (id === "image-compress") return <svg viewBox="0 0 24 24" {...common}><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/><path d="m4 9 6-6M20 9l-6-6M4 15l6 6M20 15l-6 6"/></svg>;
  return <svg viewBox="0 0 24 24" {...common}><path d="M6 4h12v16H6z"/><path d="M9 15c2-4 4-6 6-8M8 17h8"/></svg>;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></svg>;
}

function ShieldIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 4.6-2.7 7.8-7 10-4.3-2.2-7-5.4-7-10V6z"/><path d="m9 12 2 2 4-4"/></svg>;
}

function SparkIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c.7 4.2 2.8 6.3 7 7-4.2.7-6.3 2.8-7 7-.7-4.2-2.8-6.3-7-7 4.2-.7 6.3-2.8 7-7Z"/><path d="M19 16c.2 1.4.9 2.1 2.3 2.3-1.4.2-2.1.9-2.3 2.3-.2-1.4-.9-2.1-2.3-2.3 1.4-.2 2.1-.9 2.3-2.3Z"/></svg>;
}
