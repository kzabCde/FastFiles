"use client";

import { useEffect, useState } from "react";
import { TOOLS, type ToolDefinition } from "@/lib/tools";
import styles from "./NavigationMenu.module.css";

type Language = "en" | "th";

type Props = {
  language: Language;
  onSelectTool: (tool: ToolDefinition) => void;
  onOpenQr: () => void;
};

const fileToolIds = new Set(["merge-pdf", "organize-pdf", "split-pdf", "page-numbers", "pdf-metadata", "pdf-to-images", "watermark"]);
const imageToolIds = new Set(["image-convert", "image-resize", "image-compress", "images-to-pdf", "watermark"]);

export default function NavigationMenu({ language, onSelectTool, onOpenQr }: Props) {
  const [open, setOpen] = useState(false);
  const fileTools = TOOLS.filter((tool) => fileToolIds.has(tool.id));
  const imageTools = TOOLS.filter((tool) => imageToolIds.has(tool.id));

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const choose = (tool: ToolDefinition) => {
    setOpen(false);
    onSelectTool(tool);
  };

  return (
    <div className={styles.root}>
      <button className={styles.menuButton} aria-label={language === "th" ? "เปิดเมนูเครื่องมือ" : "Open tools menu"} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span /><span /><span />
      </button>
      {open && <>
        <button className={styles.backdrop} aria-label={language === "th" ? "ปิดเมนู" : "Close menu"} onClick={() => setOpen(false)} />
        <aside className={styles.drawer} data-testid="navigation-drawer" aria-label={language === "th" ? "เมนู FastFiles" : "FastFiles menu"}>
          <div className={styles.drawerHead}><div><span>FASTFILES</span><strong>{language === "th" ? "เครื่องมือทั้งหมด" : "All tools"}</strong></div><button aria-label={language === "th" ? "ปิดเมนู" : "Close menu"} onClick={() => setOpen(false)}>×</button></div>
          <nav className={styles.sections}>
            <section><span className={styles.kicker}>01</span><h2>{language === "th" ? "เครื่องมือไฟล์" : "File Tools"}</h2><div>{fileTools.map((tool) => <button key={`file-${tool.id}`} onClick={() => choose(tool)}><span>{language === "th" ? tool.thai : tool.label}</span><b>↗</b></button>)}</div></section>
            <section><span className={styles.kicker}>02</span><h2>{language === "th" ? "เครื่องมือรูปภาพ" : "Image Tools"}</h2><div>{imageTools.map((tool) => <button key={`image-${tool.id}`} onClick={() => choose(tool)}><span>{language === "th" ? tool.thai : tool.label}</span><b>↗</b></button>)}</div></section>
            <section><span className={styles.kicker}>03</span><h2>QR Code</h2><div><button onClick={() => { setOpen(false); onOpenQr(); }}><span>{language === "th" ? "สร้าง QR Code" : "QR Generator"}</span><b>↗</b></button></div></section>
          </nav>
          <div className={styles.bottomLinks}><a href="#privacy" onClick={() => setOpen(false)}>{language === "th" ? "ความเป็นส่วนตัว" : "Privacy"}</a><a href="#about" onClick={() => setOpen(false)}>{language === "th" ? "เกี่ยวกับ" : "About"}</a><span>Local-first · No account</span></div>
        </aside>
      </>}
    </div>
  );
}
