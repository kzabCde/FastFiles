"use client";

import { useEffect, useRef, useState } from "react";
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

export default function NavigationMenu({ language }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileTools = TOOLS.filter((tool) => fileToolIds.has(tool.id));
  const imageTools = TOOLS.filter((tool) => imageToolIds.has(tool.id));
  const qrLabel = language === "th" ? "สร้าง QR Code" : "QR Generator";

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        className={styles.menuButton}
        aria-label={language === "th" ? "เปิดเมนูเครื่องมือ" : "Open tools menu"}
        aria-expanded={open}
        aria-controls="fastfiles-tools-dropdown"
        onClick={() => setOpen((value) => !value)}
      >
        <span /><span /><span />
      </button>

      {open && (
        <div
          id="fastfiles-tools-dropdown"
          className={styles.dropdown}
          data-testid="navigation-dropdown"
          role="navigation"
          aria-label={language === "th" ? "เมนูเครื่องมือ FastFiles" : "FastFiles tools menu"}
        >
          <div className={styles.dropdownHead}>
            <div>
              <span>FASTFILES / TOOLS</span>
              <strong>{language === "th" ? "เลือกเครื่องมือ" : "Choose a tool"}</strong>
            </div>
            <small>{language === "th" ? "เปิดเป็นหน้าแยก" : "Opens in its own page"}</small>
          </div>

          <div className={styles.sections}>
            <section className={styles.fileGroup}>
              <span className={styles.kicker}>01</span>
              <h2>{language === "th" ? "เครื่องมือไฟล์" : "File Tools"}</h2>
              <div>
                {fileTools.map((tool) => (
                  <a key={`file-${tool.id}`} href={`/tools/${tool.id}`} onClick={() => setOpen(false)}>
                    <span>{language === "th" ? tool.thai : tool.label}</span><b>→</b>
                  </a>
                ))}
              </div>
            </section>

            <section className={styles.imageGroup}>
              <span className={styles.kicker}>02</span>
              <h2>{language === "th" ? "เครื่องมือรูปภาพ" : "Image Tools"}</h2>
              <div>
                {imageTools.map((tool) => (
                  <a key={`image-${tool.id}`} href={`/tools/${tool.id}`} onClick={() => setOpen(false)}>
                    <span>{language === "th" ? tool.thai : tool.label}</span><b>→</b>
                  </a>
                ))}
              </div>
            </section>

            <section className={styles.qrGroup}>
              <span className={styles.kicker}>03</span>
              <h2>QR Code</h2>
              <div>
                <a data-testid="nav-qr-generator" aria-label={qrLabel} href="/qr" onClick={() => setOpen(false)}>
                  <span>{qrLabel}</span><b>→</b>
                </a>
              </div>
            </section>
          </div>

          <div className={styles.bottomLinks}>
            <a href="/#privacy" onClick={() => setOpen(false)}>{language === "th" ? "ความเป็นส่วนตัว" : "Privacy"}</a>
            <a href="/#about" onClick={() => setOpen(false)}>{language === "th" ? "เกี่ยวกับ" : "About"}</a>
            <span>Local-first · No account</span>
          </div>
        </div>
      )}
    </div>
  );
}
