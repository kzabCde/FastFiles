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
  variant?: "desktop" | "mobile";
};

export default function NavigationMenu({ language, variant = "desktop" }: Props) {
  const [open, setOpen] = useState(false);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const qrLabel = language === "th" ? "สร้าง QR Code" : "QR Generator";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    if (variant === "mobile") {
      document.body.style.overflow = "hidden";
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      const menu = document.getElementById("fastfiles-tool-menu");
      const mobileMenu = document.getElementById("fastfiles-tool-menu-mobile");
      const root = rootRef.current;
      if (root?.contains(event.target as Node)) return;
      if (menu?.contains(event.target as Node)) return;
      if (mobileMenu?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, variant]);

  const toggleCat = (key: string) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /* --- Desktop Mega Menu (4 sleek columns across top bar from 76c5255) --- */
  const desktopDropdown = (
    <div
      id="fastfiles-tool-menu"
      data-testid="navigation-dropdown"
      className={styles.megaMenu}
      role="navigation"
      aria-label={language === "th" ? "เมนูเครื่องมือ" : "Tools menu"}
    >
      <div className={styles.megaInner}>
        {TOOL_CATEGORIES.map((cat) => {
          const catTools = cat.toolIds
            .map((id) => TOOLS.find((t) => t.id === id))
            .filter(Boolean) as ToolDefinition[];
          return (
            <div key={cat.key} className={styles.megaCol}>
              <h3 className={styles.megaTitle}>{language === "th" ? cat.th : cat.en}</h3>
              {catTools.map((tool) => (
                <Link
                  key={tool.id}
                  href={`/tools/${tool.id}`}
                  className={`${styles.megaLink} ${pathname === `/tools/${tool.id}` ? styles.activeLink : ""}`}
                  onClick={() => setOpen(false)}
                >
                  {language === "th" ? tool.thai : tool.label}
                </Link>
              ))}
            </div>
          );
        })}
        <div className={styles.megaCol}>
          <h3 className={styles.megaTitle}>QR Code</h3>
          <Link
            data-testid="nav-qr-generator"
            href="/qr"
            className={`${styles.megaLink} ${pathname === "/qr" ? styles.activeLink : ""}`}
            onClick={() => setOpen(false)}
          >
            {qrLabel}
          </Link>
        </div>
      </div>
    </div>
  );

  /* --- Mobile accordion dropdown (from 76c5255) --- */
  const isQrExpanded = !collapsedCats.has("qr");
  const mobileDropdown = (
    <div
      id="fastfiles-tool-menu-mobile"
      data-testid="navigation-dropdown"
      className={styles.mobileDropdown}
      role="navigation"
      aria-label={language === "th" ? "เมนูเครื่องมือ" : "Tools menu"}
    >
      {TOOL_CATEGORIES.map((cat) => {
        const catTools = cat.toolIds
          .map((id) => TOOLS.find((t) => t.id === id))
          .filter(Boolean) as ToolDefinition[];
        const isExpanded = !collapsedCats.has(cat.key);
        return (
          <div key={cat.key} className={styles.catGroup}>
            <button
              type="button"
              className={styles.catHeader}
              onClick={() => toggleCat(cat.key)}
              aria-expanded={isExpanded}
            >
              <span>{language === "th" ? cat.th : cat.en}</span>
              <svg
                className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {isExpanded && (
              <div className={styles.catLinks}>
                {catTools.map((tool) => (
                  <Link
                    key={tool.id}
                    href={`/tools/${tool.id}`}
                    className={pathname === `/tools/${tool.id}` ? styles.activeLink : ""}
                    onClick={() => setOpen(false)}
                  >
                    {language === "th" ? tool.thai : tool.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className={styles.catGroup}>
        <button
          type="button"
          className={styles.catHeader}
          onClick={() => toggleCat("qr")}
          aria-expanded={isQrExpanded}
        >
          <span>QR Code</span>
          <svg
            className={`${styles.chevron} ${isQrExpanded ? styles.chevronOpen : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {isQrExpanded && (
          <div className={styles.catLinks}>
            <Link
              data-testid="nav-qr-generator"
              href="/qr"
              className={pathname === "/qr" ? styles.activeLink : ""}
              onClick={() => setOpen(false)}
            >
              {qrLabel}
            </Link>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={styles.root} ref={rootRef}>
      {variant === "mobile" ? (
        <button
          type="button"
          className={styles.menuButton}
          aria-label={language === "th" ? "เปิดเมนูเครื่องมือ" : "Open tools menu"}
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v);
          }}
        >
          {open ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          )}
        </button>
      ) : (
        <button
          type="button"
          className={styles.desktopTrigger}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={language === "th" ? "เครื่องมือ" : "Tools"}
        >
          {language === "th" ? "เครื่องมือ" : "Tools"}
          <svg
            className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}

      {open &&
        typeof document !== "undefined" &&
        createPortal(variant === "mobile" ? mobileDropdown : desktopDropdown, document.body)}
    </div>
  );
}
