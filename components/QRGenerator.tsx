"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { downloadBlob } from "@/lib/download";
import styles from "./QRGenerator.module.css";

type Language = "en" | "th";
type Theme = "system" | "light" | "dark";
type QrType = "text" | "url" | "phone" | "email" | "sms" | "wifi" | "contact";
type ErrorLevel = "L" | "M" | "Q" | "H";
type WifiSecurity = "WPA" | "WEP" | "nopass";

type Props = {
  language: Language;
  theme: Theme;
  onBack: () => void;
  onToggleLanguage: () => void;
  onThemeChange: (theme: Theme) => void;
};

const labels = {
  en: {
    title: "QR Generator",
    subtitle: "Create QR codes locally in your browser.",
    back: "TOOLS",
    type: "CONTENT TYPE",
    content: "CONTENT",
    text: "Text",
    url: "URL",
    phone: "Phone",
    email: "Email",
    sms: "SMS",
    wifi: "Wi-Fi",
    contact: "Contact",
    value: "Text",
    urlValue: "Website URL",
    phoneValue: "Phone number",
    emailTo: "To",
    subject: "Subject",
    body: "Body",
    smsMessage: "Message",
    ssid: "Network name (SSID)",
    password: "Password",
    security: "Security",
    hidden: "Hidden network",
    appearance: "APPEARANCE",
    size: "Size",
    margin: "Margin",
    correction: "Error correction",
    foreground: "Foreground",
    background: "Background",
    local: "Local only",
    localBody: "QR content is encoded on this device and is not uploaded by FastFiles.",
    png: "DOWNLOAD PNG",
    svg: "DOWNLOAD SVG",
    copyImage: "COPY QR IMAGE",
    copyValue: "COPY CONTENT",
    copied: "Copied",
    imageCopied: "QR image copied",
    imageCopyUnavailable: "Image clipboard is not available in this browser.",
    preview: "LIVE PREVIEW",
    encoded: "Encoded payload",
    contactName: "Full name",
    organization: "Organization",
    logo: "Center logo",
    logoSize: "Logo size",
    safety: "This design may reduce QR readability.",
  },
  th: {
    title: "สร้าง QR Code",
    subtitle: "สร้าง QR Code ภายในเบราว์เซอร์ โดยไม่ส่งข้อมูลขึ้นเซิร์ฟเวอร์",
    back: "เครื่องมือ",
    type: "ประเภทข้อมูล",
    content: "ข้อมูล",
    text: "ข้อความ",
    url: "ลิงก์",
    phone: "โทรศัพท์",
    email: "อีเมล",
    sms: "SMS",
    wifi: "Wi-Fi",
    contact: "ผู้ติดต่อ",
    value: "ข้อความ",
    urlValue: "เว็บไซต์ / URL",
    phoneValue: "หมายเลขโทรศัพท์",
    emailTo: "ผู้รับ",
    subject: "หัวเรื่อง",
    body: "ข้อความ",
    smsMessage: "ข้อความ SMS",
    ssid: "ชื่อเครือข่าย (SSID)",
    password: "รหัสผ่าน",
    security: "ความปลอดภัย",
    hidden: "เครือข่ายซ่อนชื่อ",
    appearance: "รูปแบบ QR",
    size: "ขนาด",
    margin: "ระยะขอบ",
    correction: "ระดับแก้ไขข้อผิดพลาด",
    foreground: "สี QR",
    background: "สีพื้นหลัง",
    local: "ประมวลผลในเครื่อง",
    localBody: "FastFiles เข้ารหัสข้อมูล QR บนอุปกรณ์นี้ และไม่อัปโหลดข้อมูล QR ขึ้นเซิร์ฟเวอร์",
    png: "ดาวน์โหลด PNG",
    svg: "ดาวน์โหลด SVG",
    copyImage: "คัดลอกรูป QR",
    copyValue: "คัดลอกข้อมูล",
    copied: "คัดลอกแล้ว",
    imageCopied: "คัดลอกรูป QR แล้ว",
    imageCopyUnavailable: "เบราว์เซอร์นี้ไม่รองรับการคัดลอกรูปไปยังคลิปบอร์ด",
    preview: "ตัวอย่างแบบสด",
    encoded: "ข้อมูลที่เข้ารหัส",
    contactName: "ชื่อ-นามสกุล",
    organization: "องค์กร",
    logo: "โลโก้ตรงกลาง",
    logoSize: "ขนาดโลโก้",
    safety: "รูปแบบนี้อาจลดความสามารถในการอ่าน QR",
  },
} as const;

function escapeWifi(value: string) {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

function escapeVcard(value: string) {
  return value.replace(/([\\;,\n])/g, "\\$1");
}

function luminance(hex: string) {
  const values = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255).map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}

async function addLogoToQr(dataUrl: string, logoUrl: string, size: number, logoPercent: number) {
  const [qrImage, logoImage] = await Promise.all([loadImage(dataUrl), loadImage(logoUrl)]);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available in this browser.");
  context.drawImage(qrImage, 0, 0, size, size);
  const logoSize = size * (logoPercent / 100);
  const padding = Math.max(4, logoSize * 0.1);
  context.fillStyle = "#ffffff";
  context.fillRect((size - logoSize) / 2 - padding, (size - logoSize) / 2 - padding, logoSize + padding * 2, logoSize + padding * 2);
  context.drawImage(logoImage, (size - logoSize) / 2, (size - logoSize) / 2, logoSize, logoSize);
  return canvas.toDataURL("image/png");
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load QR logo."));
    image.src = source;
  });
}

export default function QRGenerator({ language, theme, onBack, onToggleLanguage, onThemeChange }: Props) {
  const t = labels[language];
  const [type, setType] = useState<QrType>("url");
  const [text, setText] = useState("FastFiles — Drop. Edit. Done.");
  const [url, setUrl] = useState("https://github.com/kzabCde/FastFiles");
  const [phone, setPhone] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [ssid, setSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [security, setSecurity] = useState<WifiSecurity>("WPA");
  const [hidden, setHidden] = useState(false);
  const [contactName, setContactName] = useState("");
  const [organization, setOrganization] = useState("");
  const [size, setSize] = useState(360);
  const [margin, setMargin] = useState(3);
  const [errorLevel, setErrorLevel] = useState<ErrorLevel>("M");
  const [foreground, setForeground] = useState("#111412");
  const [background, setBackground] = useState("#ffffff");
  const [logo, setLogo] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState("");
  const [logoSize, setLogoSize] = useState(20);
  const [preview, setPreview] = useState("");
  const [svg, setSvg] = useState("");
  const [status, setStatus] = useState("");

  const payload = useMemo(() => {
    if (type === "text") return text || " ";
    if (type === "url") return url || "https://";
    if (type === "phone") return `tel:${phone}`;
    if (type === "email") {
      const params = new URLSearchParams();
      if (subject) params.set("subject", subject);
      if (body) params.set("body", body);
      const query = params.toString();
      return `mailto:${emailTo}${query ? `?${query}` : ""}`;
    }
    if (type === "sms") return `SMSTO:${phone}:${smsMessage}`;
    if (type === "contact") return ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeVcard(contactName)}`, organization ? `ORG:${escapeVcard(organization)}` : "", phone ? `TEL:${escapeVcard(phone)}` : "", emailTo ? `EMAIL:${escapeVcard(emailTo)}` : "", "END:VCARD"].filter(Boolean).join("\n");
    const wifiType = security === "nopass" ? "nopass" : security;
    const passwordPart = security === "nopass" ? "" : `P:${escapeWifi(wifiPassword)};`;
    return `WIFI:T:${wifiType};S:${escapeWifi(ssid)};${passwordPart}H:${hidden ? "true" : "false"};;`;
  }, [type, text, url, phone, emailTo, subject, body, smsMessage, ssid, wifiPassword, security, hidden, contactName, organization]);

  useEffect(() => {
    if (!logo) { setLogoUrl(""); return; }
    const next = URL.createObjectURL(logo);
    setLogoUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [logo]);

  const options = useMemo(() => ({
    width: size,
    margin,
    errorCorrectionLevel: errorLevel,
    color: { dark: foreground, light: background },
  }), [size, margin, errorLevel, foreground, background]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      QRCode.toDataURL(payload, options),
      QRCode.toString(payload, { ...options, type: "svg" }),
    ]).then(([dataUrl, svgMarkup]) => {
      return logoUrl ? addLogoToQr(dataUrl, logoUrl, size, logoSize).then((composed) => [composed, svgMarkup] as const) : [dataUrl, svgMarkup] as const;
    }).then(([dataUrl, svgMarkup]) => {
      if (!active) return;
      setPreview(dataUrl); setSvg(svgMarkup); setStatus("");
    }).catch((error) => {
      if (!active) return;
      setPreview("");
      setSvg("");
      setStatus(error instanceof Error ? error.message : "Unable to generate QR code.");
    });
    return () => { active = false; };
  }, [payload, options, logoSize, logoUrl, size]);

  const foregroundLum = luminance(foreground);
  const backgroundLum = luminance(background);
  const contrast = (Math.max(foregroundLum, backgroundLum) + 0.05) / (Math.min(foregroundLum, backgroundLum) + 0.05);
  const safetyWarnings = [contrast < 4 ? (language === "th" ? "สีพื้นหน้าและพื้นหลังมีความต่างต่ำ" : "Foreground/background contrast is low.") : "", margin < 2 ? (language === "th" ? "ระยะขอบน้อยเกินไป" : "The quiet-zone margin is very small.") : "", logo && errorLevel !== "H" ? (language === "th" ? "ควรใช้ Error correction H เมื่อมีโลโก้" : "Use error correction H with a logo.") : "", logo && logoSize > 24 ? (language === "th" ? "โลโก้อาจบังข้อมูลมากเกินไป" : "The logo may cover too much QR data.") : ""].filter(Boolean);

  const downloadPng = async () => {
    const raw = await QRCode.toDataURL(payload, options);
    const dataUrl = logoUrl ? await addLogoToQr(raw, logoUrl, size, logoSize) : raw;
    const blob = await (await fetch(dataUrl)).blob();
    downloadBlob(blob, "fastfiles-qr.png");
  };

  const downloadSvg = () => {
    downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), "fastfiles-qr.svg");
  };

  const copyContent = async () => {
    await navigator.clipboard.writeText(payload);
    setStatus(t.copied);
  };

  const copyImage = async () => {
    try {
      const dataUrl = preview || await QRCode.toDataURL(payload, options);
      const blob = await (await fetch(dataUrl)).blob();
      if (!("ClipboardItem" in window) || !navigator.clipboard?.write) throw new Error("clipboard-image-unavailable");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setStatus(t.imageCopied);
    } catch {
      setStatus(t.imageCopyUnavailable);
    }
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <button className={styles.back} onClick={onBack}>← {t.back}</button>
        <div className={styles.titleBlock}><span>FASTFILES / QR</span><h1>{t.title}</h1></div>
        <div className={styles.headerActions}>
          <select aria-label="Theme" value={theme} onChange={(event) => onThemeChange(event.target.value as Theme)}>
            <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
          <button onClick={onToggleLanguage} aria-label={language === "en" ? "Switch to Thai" : "Switch to English"}>{language === "en" ? "TH" : "EN"}</button>
        </div>
      </header>

      <section className={styles.intro}>
        <span className={styles.localBadge}>● {t.local}</span>
        <p>{t.subtitle}</p>
      </section>

      <section className={styles.workspace} data-testid="qr-generator">
        <div className={styles.previewColumn}>
          <div className={styles.previewTop}><span>{t.preview}</span><strong>{size} × {size}</strong></div>
          <div className={styles.previewStage}>
            {preview ? <img src={preview} alt="Generated QR code preview" data-testid="qr-preview" data-foreground={foreground} data-background={background} /> : <div className={styles.previewEmpty}>QR</div>}
          </div>
          <div className={styles.payload}>
            <span>{t.encoded}</span>
            <code data-testid="qr-payload">{payload}</code>
          </div>
          <div className={styles.privacyNote}><strong>{t.local}</strong><p>{t.localBody}</p></div>
        </div>

        <aside className={styles.controls}>
          <div className={styles.controlSection}>
            <label>{t.type}</label>
            <div className={styles.typeGrid}>
              {(["text", "url", "wifi", "email", "phone", "sms", "contact"] as QrType[]).map((item) => (
                <button key={item} className={type === item ? styles.activeType : ""} onClick={() => setType(item)}>{t[item]}</button>
              ))}
            </div>
          </div>

          <div className={styles.controlSection}>
            <label>{t.content}</label>
            {type === "text" && <textarea aria-label={t.value} value={text} onChange={(event) => setText(event.target.value)} />}
            {type === "url" && <input aria-label={t.urlValue} value={url} onChange={(event) => setUrl(event.target.value)} />}
            {(type === "phone" || type === "sms") && <input aria-label={t.phoneValue} value={phone} onChange={(event) => setPhone(event.target.value)} />}
            {type === "sms" && <textarea aria-label={t.smsMessage} value={smsMessage} onChange={(event) => setSmsMessage(event.target.value)} />}
            {type === "email" && <>
              <input aria-label={t.emailTo} value={emailTo} onChange={(event) => setEmailTo(event.target.value)} />
              <input aria-label={t.subject} value={subject} onChange={(event) => setSubject(event.target.value)} />
              <textarea aria-label={t.body} value={body} onChange={(event) => setBody(event.target.value)} />
            </>}
            {type === "wifi" && <>
              <input aria-label={t.ssid} value={ssid} onChange={(event) => setSsid(event.target.value)} />
              {security !== "nopass" && <input type="password" aria-label={t.password} value={wifiPassword} onChange={(event) => setWifiPassword(event.target.value)} />}
              <label className={styles.inlineLabel}>{t.security}<select aria-label={t.security} value={security} onChange={(event) => setSecurity(event.target.value as WifiSecurity)}><option value="WPA">WPA/WPA2/WPA3</option><option value="WEP">WEP</option><option value="nopass">None</option></select></label>
              <label className={styles.checkLabel}><input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} /> {t.hidden}</label>
            </>}
            {type === "contact" && <>
              <input aria-label={t.contactName} value={contactName} onChange={(event) => setContactName(event.target.value)} placeholder={t.contactName} />
              <input aria-label={t.organization} value={organization} onChange={(event) => setOrganization(event.target.value)} placeholder={t.organization} />
              <input aria-label={t.phoneValue} value={phone} onChange={(event) => setPhone(event.target.value)} placeholder={t.phoneValue} />
              <input aria-label={t.emailTo} value={emailTo} onChange={(event) => setEmailTo(event.target.value)} placeholder={t.emailTo} />
            </>}
          </div>

          <div className={styles.controlSection}>
            <label>{t.appearance}</label>
            <label className={styles.rangeLabel}>{t.size}<span>{size}px</span><input aria-label={t.size} type="range" min="160" max="1024" step="16" value={size} onChange={(event) => setSize(Number(event.target.value))} /></label>
            <label className={styles.rangeLabel}>{t.margin}<span>{margin}</span><input aria-label={t.margin} type="range" min="0" max="8" value={margin} onChange={(event) => setMargin(Number(event.target.value))} /></label>
            <label className={styles.inlineLabel}>{t.correction}<select aria-label={t.correction} value={errorLevel} onChange={(event) => setErrorLevel(event.target.value as ErrorLevel)}><option value="L">L · 7%</option><option value="M">M · 15%</option><option value="Q">Q · 25%</option><option value="H">H · 30%</option></select></label>
            <div className={styles.colorGrid}>
              <label>{t.foreground}<input aria-label={t.foreground} type="color" value={foreground} onChange={(event) => setForeground(event.target.value)} /></label>
              <label>{t.background}<input aria-label={t.background} type="color" value={background} onChange={(event) => setBackground(event.target.value)} /></label>
            </div>
            <label className={styles.inlineLabel}>{t.logo}<input aria-label={t.logo} type="file" accept="image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0] ?? null; setLogo(file); if (file) setErrorLevel("H"); }} /></label>
            {logo && <label className={styles.rangeLabel}>{t.logoSize}<span>{logoSize}%</span><input aria-label={t.logoSize} type="range" min="10" max="30" value={logoSize} onChange={(event) => setLogoSize(Number(event.target.value))} /></label>}
            {safetyWarnings.length > 0 && <div className={styles.safetyWarning} role="alert"><strong>{t.safety}</strong><ul>{safetyWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          </div>

          <div className={styles.actions}>
            <button className={styles.primary} onClick={() => void downloadPng()}>{t.png}</button>
            <button onClick={downloadSvg} disabled={!svg || Boolean(logo)} title={logo ? (language === "th" ? "SVG ยังไม่รวมโลโก้ กรุณาใช้ PNG" : "SVG export does not include the logo; use PNG.") : undefined}>{t.svg}</button>
            <button onClick={() => void copyImage()}>{t.copyImage}</button>
            <button onClick={() => void copyContent()}>{t.copyValue}</button>
          </div>
          {status && <div className={styles.status} role="status">{status}</div>}
        </aside>
      </section>
    </main>
  );
}
