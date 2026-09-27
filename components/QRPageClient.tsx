"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRGenerator from "./QRGenerator";

type Language = "en" | "th";
type Theme = "system" | "light" | "dark";

export default function QRPageClient() {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>("en");
  const [theme, setTheme] = useState<Theme>("system");
  const [ready, setReady] = useState(false);

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

  return (
    <QRGenerator
      language={language}
      theme={theme}
      onThemeChange={setTheme}
      onToggleLanguage={() => setLanguage((value) => value === "en" ? "th" : "en")}
      onBack={() => router.push("/")}
    />
  );
}
