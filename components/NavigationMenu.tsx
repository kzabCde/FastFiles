"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TOOLS, type ToolDefinition } from "@/lib/tools";
import styles from "./NavigationMenu.module.css";

type Language = "en" | "th";

type Props = {
  language: Language;
  onSelectTool?: (tool: ToolDefinition) => void;
  onOpenQr?: () => void;
};

const fileToolIds = new Set(["merge-pdf", "organize-pdf", "split-pdf", "page-numbers", "pdf-metadata", "pdf-to-images", "images-to-pdf"]);
const imageToolIds = new Set(["image-convert", "watermark"]);

export default function NavigationMenu({ language }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const fileTools = TOOLS.filter((tool) => fileToolIds.has(tool.id));
  const imageTools = TOOLS.filter((tool) => imageToolIds.has(tool.id));
  const qrLabel = language === "th" ? "สร้าง QR Code" : "QR Generator";

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus(); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const links = [...(rootRef.current?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [])];
      if (!links.length) return;
      event.preventDefault();
      const current = links.indexOf(document.activeElement as HTMLAnchorElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? links.length - 1 : event.key === "ArrowDown" ? (current + 1 + links.length) % links.length : (current - 1 + links.length) % links.length;
      links[next]?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
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
        className={`${styles.menuButton} ${open ? styles.open : ""}`}
        aria-label={language === "th" ? "เปิดเมนูเครื่องมือ" : "Open tools menu"}
        aria-expanded={open}
        aria-controls="fastfiles-tool-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <span /><span /><span />
      </button>

      {open && (
        <div id="fastfiles-tool-menu" className={styles.dropdown} data-testid="navigation-dropdown" role="navigation" aria-label={language === "th" ? "เมนู FastFiles" : "FastFiles menu"}>
          <div className={styles.dropdownHead}>
            <div><span>FASTFILES</span><strong>{language === "th" ? "เลือกเครื่องมือ" : "Choose a tool"}</strong></div>
            <small>{language === "th" ? "แต่ละเครื่องมือเปิดเป็นหน้าแยก" : "Each tool opens on its own page"}</small>
          </div>

          <div className={styles.sections}>
            <section className={styles.fileGroup}>
              <div className={styles.groupTitle}><span className={styles.kicker}>01</span><h2>{language === "th" ? "เครื่องมือไฟล์" : "File Tools"}</h2></div>
              <div className={styles.links}>{fileTools.map((tool) => {
                const label = language === "th" ? tool.thai : tool.label;
                return <a key={`file-${tool.id}`} className={pathname === `/tools/${tool.id}` ? styles.activeLink : ""} aria-current={pathname === `/tools/${tool.id}` ? "page" : undefined} aria-label={label} href={`/tools/${tool.id}`} onClick={() => setOpen(false)}><span>{label}</span><b aria-hidden="true">↗</b></a>;
              })}</div>
            </section>

            <section className={styles.imageGroup}>
              <div className={styles.groupTitle}><span className={styles.kicker}>02</span><h2>{language === "th" ? "เครื่องมือรูปภาพ" : "Image Tools"}</h2></div>
              <div className={styles.links}>{imageTools.map((tool) => {
                const label = language === "th" ? tool.thai : tool.label;
                return <a key={`image-${tool.id}`} className={pathname === `/tools/${tool.id}` ? styles.activeLink : ""} aria-current={pathname === `/tools/${tool.id}` ? "page" : undefined} aria-label={label} href={`/tools/${tool.id}`} onClick={() => setOpen(false)}><span>{label}</span><b aria-hidden="true">↗</b></a>;
              })}</div>
            </section>

            <section className={styles.qrGroup}>
              <div className={styles.groupTitle}><span className={styles.kicker}>03</span><h2>QR Code</h2></div>
              <div className={styles.links}><a data-testid="nav-qr-generator" className={pathname === "/qr" ? styles.activeLink : ""} aria-current={pathname === "/qr" ? "page" : undefined} aria-label={qrLabel} href="/qr" onClick={() => setOpen(false)}><span>{qrLabel}</span><b aria-hidden="true">↗</b></a></div>
            </section>
          </div>

          <div className={styles.bottomLinks}>
            <Link href="/#privacy" onClick={() => setOpen(false)}>{language === "th" ? "ความเป็นส่วนตัว" : "Privacy"}</Link>
            <Link href="/#about" onClick={() => setOpen(false)}>{language === "th" ? "เกี่ยวกับ" : "About"}</Link>
            <span>Local-first · No account</span>
          </div>
        </div>
      )}
    </div>
  );
}
