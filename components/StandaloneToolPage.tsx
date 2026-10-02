"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import FastFilesMark from "./FastFilesMark";
import NavigationMenu from "./NavigationMenu";
import ToolWorkspace from "./ToolWorkspace";
import DocumentToolWorkspace from "./DocumentToolWorkspace";
import { kindOf, type ToolDefinition } from "@/lib/tools";
import { fileIssueMessage, inspectFiles } from "@/lib/file-intake";

type Language = "en" | "th";
type Theme = "system" | "light" | "dark";

type Props = { tool: ToolDefinition };

export default function StandaloneToolPage({ tool }: Props) {
  const [language, setLanguage] = useState<Language>("en");
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    return (window.localStorage.getItem("fastfiles-theme") as Theme | null) ?? "system";
  });
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("fastfiles-theme") as Theme | null;
    const savedLanguage = window.localStorage.getItem("fastfiles-language") as Language | null;
    if (savedTheme && ["system", "light", "dark"].includes(savedTheme)) setTheme(savedTheme);
    if (savedLanguage && ["en", "th"].includes(savedLanguage)) setLanguage(savedLanguage);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("fastfiles-theme", theme);
  }, [theme, ready]);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = language;
    window.localStorage.setItem("fastfiles-language", language);
  }, [language, ready]);

  const acceptsPdf = tool.accepts.includes("pdf");
  const acceptsImage = tool.accepts.includes("image");
  const acceptsDocx = tool.accepts.includes("docx");
  const inputAccept = useMemo(() => {
    const values: string[] = [];
    if (acceptsPdf) values.push("application/pdf", ".pdf");
    if (acceptsDocx) values.push("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx");
    if (acceptsImage) values.push("image/jpeg", "image/png", "image/webp", "image/avif", ".jpg", ".jpeg", ".png", ".webp", ".avif");
    return values.join(",");
  }, [acceptsPdf, acceptsImage, acceptsDocx]);

  const openPicker = () => {
    setError("");
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.click();
  };

  const acceptFiles = async (incoming: File[]) => {
    setError("");
    const matching = incoming.filter((file) => {
      const kind = kindOf(file);
      return (kind === "pdf" && acceptsPdf) || (kind === "docx" && acceptsDocx) || (kind === "image" && acceptsImage);
    });

    if (!matching.length) {
      setError(language === "th" ? "ไฟล์ที่เลือกไม่รองรับเครื่องมือนี้" : "Those files are not supported by this tool.");
      return;
    }

    const firstKind = kindOf(matching[0]);
    const sameKind = matching.filter((file) => kindOf(file) === firstKind);
    const candidates = tool.multiple ? sameKind : [sameKind[0]];
    setChecking(true);

    try {
      const inspected = await inspectFiles(candidates);
      const rejected = inspected.find((item) => item.status === "error");
      if (rejected) {
        const reason = fileIssueMessage(rejected.message ?? "unsupported", language);
        setError(`${rejected.file.name}: ${reason}`);
        return;
      }

      const next = inspected.map((item) => item.file);

      if (tool.id === "merge-pdf" && next.length < 2) {
        setError(language === "th" ? "เลือก PDF อย่างน้อย 2 ไฟล์เพื่อรวมไฟล์" : "Select at least two PDFs to merge.");
        return;
      }

      setFiles(next);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (files.length) return;
    const onPaste = (event: ClipboardEvent) => {
      const pasted = [...(event.clipboardData?.files ?? [])].map((file) => {
        if (file.name === "image.png" || file.name === "Untitled" || !file.name) {
          const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
          const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "png";
          return new File([file], `clipboard-${stamp}.${ext}`, { type: file.type });
        }
        return file;
      });
      if (pasted.length) void acceptFiles(pasted);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [files.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (files.length) {
    const Workspace = tool.id === "word-to-pdf" || tool.id === "pdf-to-word" ? DocumentToolWorkspace : ToolWorkspace;
    return (
      <Workspace
        tool={tool}
        files={files}
        language={language}
        onToggleLanguage={() => setLanguage((value) => (value === "en" ? "th" : "en"))}
        onBack={() => setFiles([])}
        onReset={() => setFiles([])}
        onSelectTool={(t) => { window.location.href = `/tools/${t.id}`; }}
      />
    );
  }

  const title = language === "th" ? tool.thai : tool.label;
  const fileHint = acceptsDocx
    ? "DOCX"
    : acceptsPdf && acceptsImage
      ? "PDF · JPG · PNG · WEBP · AVIF"
      : acceptsPdf
        ? "PDF"
        : "JPG · PNG · WEBP · AVIF";

  return (
    <main
      className={`app-shell ${dragging ? "global-dragging" : ""}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void acceptFiles([...event.dataTransfer.files]);
      }}
    >
      <header className="site-header">
        <div className="header-inner">
          <div style={{ justifySelf: "start", display: "flex", alignItems: "center", gap: 10 }}>
            <div className="mobile-only">
              <NavigationMenu variant="mobile" language={language} />
            </div>
            <Link className="brand" href="/" aria-label="FastFiles home"><FastFilesMark /><span>FastFiles</span></Link>
          </div>
          <nav><Link href="/">Home</Link><NavigationMenu variant="desktop" language={language} /><Link href="/#privacy">{language === "th" ? "ความเป็นส่วนตัว" : "Privacy"}</Link><Link href="/#about">{language === "th" ? "เกี่ยวกับ" : "About"}</Link></nav>
          <div className="header-actions">
            <select
              aria-label="Theme"
              value={theme}
              onChange={(event) => {
                const next = event.target.value as Theme;
                document.documentElement.dataset.theme = next;
                window.localStorage.setItem("fastfiles-theme", next);
                setTheme(next);
              }}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <button className="chip-button" onClick={() => setLanguage((value) => value === "en" ? "th" : "en")}>{language === "en" ? "TH" : "EN"}</button>
            <button className="top-drop-button" onClick={openPicker} disabled={checking}>{language === "th" ? "เลือกไฟล์" : "Choose files"}<span>+</span></button>
          </div>
        </div>
      </header>

      <input ref={inputRef} hidden multiple={Boolean(tool.multiple)} type="file" accept={inputAccept} onChange={(event) => void acceptFiles([...(event.target.files ?? [])])} />

      <section className="hero-section">
        <div className="hero-wrap">
          <div className="hero-copy">
            <div className="product-pill"><span className="live-dot" /> FASTFILES / {tool.short}</div>
            <h1>{title}</h1>
            <p className="hero-body">{language === "th" ? "เครื่องมือนี้ทำงานบนอุปกรณ์ของคุณ เลือกไฟล์เพื่อเริ่มใช้งาน" : "This tool runs on your device. Choose files to open the workspace."}</p>
            <div className="trust-row">
              <div className="trust-chip"><span><strong>{language === "th" ? "ประมวลผลในเครื่อง" : "Local processing"}</strong><small>{language === "th" ? "ไฟล์ไม่ถูกอัปโหลดโดยไม่จำเป็น" : "No unnecessary file uploads"}</small></span></div>
              <div className="trust-chip"><span><strong>{language === "th" ? "พร้อมใช้งานทันที" : "Ready when you are"}</strong><small>{language === "th" ? "วางไฟล์หรือเลือกจากอุปกรณ์" : "Drop files or choose from your device"}</small></span></div>
            </div>
          </div>

          <button className="drop-surface" onClick={openPicker} data-testid="standalone-tool-dropzone" disabled={checking}>
            <div className="drop-glow" aria-hidden="true" />
            <div className="drop-content">
              <span className="drop-plus">+</span>
              <strong>{checking ? (language === "th" ? "กำลังตรวจไฟล์…" : "Checking file…") : (language === "th" ? "วางไฟล์ที่นี่" : "Drop files here")}</strong>
              <span>{checking ? (language === "th" ? "FastFiles กำลังตรวจสอบว่าไฟล์ใช้งานได้" : "FastFiles is validating the selected file") : (language === "th" ? "หรือคลิกเพื่อเลือกไฟล์" : "or click to browse")}</span>
              <div className="format-pills">{fileHint.split(" · ").map((format) => <small key={format}>{format}</small>)}</div>
              <span className="browse-link">{language === "th" ? "เลือกไฟล์" : "Browse files"} <b>→</b></span>
            </div>
          </button>
        </div>
      </section>

      {error && <div className="error-panel" role="alert"><strong>{language === "th" ? "เลือกไฟล์อีกครั้ง" : "Choose files again"}</strong><span>{error}</span></div>}
      {dragging && <div className="drag-overlay"><strong>{language === "th" ? "วางไฟล์เพื่อเริ่ม" : "Drop to start"}</strong></div>}
    </main>
  );
}
