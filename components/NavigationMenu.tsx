"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TOOLS, TOOL_CATEGORIES, type ToolDefinition } from "@/lib/tools";
import styles from "./NavigationMenu.module.css";

type Language = "en" | "th";

type Props = {
  language: Language;
  onSelectTool?: (tool: ToolDefinition) => void;
  onOpenQr?: () => void;
};

export default function NavigationMenu({ language }: Props) {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const qrLabel = language === "th" ? "สร้าง QR Code" : "QR Generator";

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 980);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const menu = document.getElementById("fastfiles-tool-menu");
      const root = rootRef.current;
      if (root?.contains(event.target as Node)) return;
      if (menu && !menu.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const toggleCat = (key: string) => setExpandedCat((prev) => prev === key ? null : key);

  /* --- Desktop mega-menu content (full-width, categories side by side) --- */
  const desktopDropdown = (
    <div id="fastfiles-tool-menu" className={styles.megaMenu}>
      <div className={styles.megaInner}>
        {TOOL_CATEGORIES.map((cat) => {
          const catTools = cat.toolIds.map((id) => TOOLS.find((t) => t.id === id)).filter(Boolean) as ToolDefinition[];
          return (
            <div key={cat.key} className={styles.megaCol}>
              <h3 className={styles.megaTitle}>{language === "th" ? cat.th : cat.en}</h3>
              {catTools.map((tool) => (
                <a key={tool.id} href={`/tools/${tool.id}`} className={`${styles.megaLink} ${pathname === `/tools/${tool.id}` ? styles.activeLink : ""}`} onClick={() => setOpen(false)}>
                  {language === "th" ? tool.thai : tool.label}
                </a>
              ))}
            </div>
          );
        })}
        <div className={styles.megaCol}>
          <h3 className={styles.megaTitle}>QR Code</h3>
          <a href="/qr" className={`${styles.megaLink} ${pathname === "/qr" ? styles.activeLink : ""}`} onClick={() => setOpen(false)}>{qrLabel}</a>
        </div>
      </div>
    </div>
  );

  /* --- Mobile accordion dropdown --- */
  const mobileDropdown = (
    <div id="fastfiles-tool-menu" className={styles.mobileDropdown}>
      {TOOL_CATEGORIES.map((cat) => {
        const catTools = cat.toolIds.map((id) => TOOLS.find((t) => t.id === id)).filter(Boolean) as ToolDefinition[];
        const isExpanded = expandedCat === cat.key;
        return (
          <div key={cat.key} className={styles.catGroup}>
            <button type="button" className={styles.catHeader} onClick={() => toggleCat(cat.key)} aria-expanded={isExpanded}>
              <span>{language === "th" ? cat.th : cat.en}</span>
              <svg className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            {isExpanded && (
              <div className={styles.catLinks}>
                {catTools.map((tool) => (
                  <a key={tool.id} href={`/tools/${tool.id}`} className={pathname === `/tools/${tool.id}` ? styles.activeLink : ""} onClick={() => setOpen(false)}>
                    {language === "th" ? tool.thai : tool.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className={styles.catGroup}>
        <button type="button" className={styles.catHeader} onClick={() => toggleCat("qr")} aria-expanded={expandedCat === "qr"}>
          <span>QR Code</span>
          <svg className={`${styles.chevron} ${expandedCat === "qr" ? styles.chevronOpen : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        {expandedCat === "qr" && (
          <div className={styles.catLinks}>
            <a href="/qr" className={pathname === "/qr" ? styles.activeLink : ""} onClick={() => setOpen(false)}>{qrLabel}</a>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={styles.root} ref={rootRef}>
      {/* Mobile: hamburger */}
      <button
        className={styles.menuButton}
        aria-label={language === "th" ? "เปิดเมนู" : "Open menu"}
        aria-expanded={open}
        onClick={() => { setOpen((v) => !v); setExpandedCat(null); }}
      >
        {open
          ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
        }
      </button>

      {/* Desktop: "เครื่องมือ" text trigger */}
      <button className={styles.desktopTrigger} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {language === "th" ? "เครื่องมือ" : "Tools"}
        <svg className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>

      {open && createPortal(isMobile ? mobileDropdown : desktopDropdown, document.body)}
    </div>
  );
}
