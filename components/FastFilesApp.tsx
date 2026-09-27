"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ToolWorkspace from "./ToolWorkspace";
import { TOOLS, groupKind, searchTools, toolsFor, type ToolDefinition } from "@/lib/tools";
import { formatBytes } from "@/lib/download";

type Language = "en" | "th";
type Theme = "system" | "light" | "dark";

const copy = {
  en: {
    tagline: "DROP. EDIT. DONE.",
    hero: "Files should be easier.",
    body: "Merge, convert, resize, compress and organize files directly in your browser.",
    drop: "DROP FILES HERE",
    dropSub: "or click to browse · paste supported files anywhere",
    local: "Your files stay on your device.",
    ask: "What would you like to do?",
    search: "What do you want to do?",
    tools: "TOOLS",
    privacy: "PRIVACY",
    about: "ABOUT",
    newFiles: "DROP FILES",
    detected: "DETECTED",
    clear: "CLEAR",
  },
  th: {
    tagline: "DROP. EDIT. DONE.",
    hero: "จัดการไฟล์ควรง่ายกว่านี้",
    body: "รวม แปลง ปรับขนาด บีบอัด และจัดหน้าไฟล์ได้โดยตรงจากเบราว์เซอร์",
    drop: "วางไฟล์ที่นี่",
    dropSub: "หรือคลิกเพื่อเลือกไฟล์ · สามารถวางไฟล์จากคลิปบอร์ดได้",
    local: "ไฟล์ของคุณยังอยู่บนอุปกรณ์ของคุณ",
    ask: "ต้องการทำอะไรกับไฟล์เหล่านี้?",
    search: "คุณต้องการทำอะไรกับไฟล์?",
    tools: "เครื่องมือ",
    privacy: "ความเป็นส่วนตัว",
    about: "เกี่ยวกับ",
    newFiles: "เลือกไฟล์",
    detected: "ตรวจพบ",
    clear: "ล้าง",
  },
} satisfies Record<Language, Record<string, string>>;

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
      setNotice(language === "th" ? "รองรับ PDF, JPG, PNG และ WebP ในเวอร์ชันนี้" : "This version supports PDF, JPG, PNG and WebP files.");
      return;
    }
    setNotice(supported.length < incoming.length ? (language === "th" ? "ไฟล์ที่ไม่รองรับถูกข้าม" : "Unsupported files were skipped.") : "");
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
        <button className="brand" onClick={reset} aria-label="FastFiles home"><span className="brand-mark">F</span><span>FastFiles</span></button>
        <nav>
          <a href="#tools">{t.tools}</a>
          <a href="#privacy">{t.privacy}</a>
          <a href="#about">{t.about}</a>
        </nav>
        <div className="header-actions">
          <select aria-label="Theme" value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
            <option value="system">SYSTEM</option><option value="light">LIGHT</option><option value="dark">DARK</option>
          </select>
          <button className="chip-button" onClick={() => setLanguage((value) => value === "en" ? "th" : "en")}>{language === "en" ? "TH" : "EN"}</button>
          <button className="top-drop-button" onClick={() => inputRef.current?.click()}>{t.newFiles} ↗</button>
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
        <div className="hero-copy">
          <span className="eyebrow">FASTFILES / 01</span>
          <p className="hero-kicker">{t.tagline}</p>
          <h1>{t.hero}</h1>
          <p className="hero-body">{t.body}</p>
          <div className="local-badge"><span className="live-dot" /> LOCAL PROCESSING <span>{t.local}</span></div>
        </div>

        <button className={`drop-surface ${files.length ? "has-files" : ""}`} onClick={() => inputRef.current?.click()}>
          <div className="drop-grid" aria-hidden="true" />
          <span className="drop-corner top-left">+</span><span className="drop-corner top-right">+</span><span className="drop-corner bottom-left">+</span><span className="drop-corner bottom-right">+</span>
          {!files.length ? (
            <div className="drop-content">
              <span className="drop-arrow">↘</span>
              <strong>{t.drop}</strong>
              <span>{t.dropSub}</span>
              <small>PDF · JPG · PNG · WEBP</small>
            </div>
          ) : (
            <div className="drop-content loaded">
              <span className="mono">{t.detected}</span>
              <strong>{files.length} FILE{files.length === 1 ? "" : "S"}</strong>
              <span>{formatBytes(totalSize)} · {kind.toUpperCase()}</span>
              <small>+ DROP MORE FILES</small>
            </div>
          )}
        </button>
      </section>

      {notice && <div className="notice-bar"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}

      {files.length > 0 && (
        <section className="detected-panel">
          <div className="detected-head">
            <div><span className="eyebrow">{t.detected}</span><h2>{t.ask}</h2></div>
            <button className="text-button" onClick={reset}>{t.clear}</button>
          </div>
          <div className="selected-files">
            {files.slice(0, 5).map((file, index) => (
              <div key={`${file.name}-${file.lastModified}-${index}`}><span className="mono">{String(index + 1).padStart(2, "0")}</span><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div>
            ))}
            {files.length > 5 && <div><span className="mono">+{files.length - 5}</span><strong>MORE FILES</strong><span>{formatBytes(totalSize)}</span></div>}
          </div>
          <div className="suggested-tools">
            {availableTools.map((tool, index) => <ToolButton key={tool.id} tool={tool} index={index} language={language} onClick={() => setActiveTool(tool)} />)}
          </div>
        </section>
      )}

      <section className="tool-section" id="tools">
        <div className="section-label"><span>02 / TOOL INDEX</span><span>{String(TOOLS.length).padStart(2, "0")} MODULES</span></div>
        <div className="tool-search-wrap">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} aria-label={t.search} />
          <kbd>⌘ K</kbd>
        </div>
        <div className="tool-index">
          {(query ? searchResults : TOOLS).map((tool, index) => <ToolButton key={tool.id} tool={tool} index={index} language={language} onClick={() => {
            if (files.length && tool.accepts.includes(kind === "image" ? "image" : "pdf")) setActiveTool(tool);
            else inputRef.current?.click();
          }} />)}
        </div>
      </section>

      <section className="privacy-section" id="privacy">
        <div><span className="section-label-inline">03 / LOCAL-FIRST</span><h2>Your files.<br />Your device.</h2></div>
        <div className="privacy-copy"><p>{language === "th" ? "FastFiles ประมวลผลเครื่องมือหลักในเบราว์เซอร์โดยตรง ไฟล์ต้นฉบับไม่ถูกเก็บไว้ถาวร และไม่ต้องสร้างบัญชีเพื่อใช้งาน" : "Core FastFiles tools run directly in your browser. Original files are not permanently stored, and no account is required for the local toolset."}</p><div className="privacy-points"><span>01 — NO ACCOUNT</span><span>02 — NO PERMANENT FILE STORAGE</span><span>03 — CLIENT-SIDE PROCESSING</span></div></div>
      </section>

      <section className="about-strip" id="about"><span>FASTFILES / V0.1</span><strong>ONE DROP. MULTIPLE TOOLS.</strong><span>PDF + IMAGE</span></section>

      <footer><span>© 2026 FASTFILES</span><span>DROP. EDIT. DONE.</span><span>BUILT FOR THE BROWSER</span></footer>

      {dragging && <div className="drag-overlay"><strong>DROP ANYTHING.</strong><span>PDF · JPG · PNG · WEBP</span></div>}
    </main>
  );
}

function ToolButton({ tool, index, language, onClick }: { tool: ToolDefinition; index: number; language: Language; onClick: () => void }) {
  return (
    <button className="tool-row" onClick={onClick}>
      <span className="mono tool-number">{String(index + 1).padStart(2, "0")}</span>
      <span className="tool-name">{language === "th" ? tool.thai : tool.label}</span>
      <span className="tool-code">{tool.short}</span>
      <span className="tool-arrow">↗</span>
    </button>
  );
}
