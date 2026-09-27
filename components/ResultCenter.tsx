"use client";

import { createZip, downloadBlob, formatBytes } from "@/lib/download";

export type ResultEntry = {
  name: string;
  blob: Blob;
  originalSize?: number;
  sourceName?: string;
};

export type FailedEntry = {
  name: string;
  reason: string;
};

export type WorkspaceResult = {
  label: string;
  entries: ResultEntry[];
  failed?: FailedEntry[];
  before: number;
  after: number;
  cancelled?: boolean;
  retryFailed?: () => void;
};

export default function ResultCenter({ result, language, onChangeSettings, onProcessMore }: {
  result: WorkspaceResult;
  language: "en" | "th";
  onChangeSettings?: () => void;
  onProcessMore?: () => void;
}) {
  const t = language === "th" ? {
    done: result.cancelled ? "ยกเลิกแล้ว" : result.failed?.length ? "เสร็จบางส่วน" : "เสร็จแล้ว",
    original: "ต้นฉบับ",
    output: "ผลลัพธ์",
    saved: "ลดลง",
    success: "สำเร็จ",
    failed: "ไม่สำเร็จ",
    download: "ดาวน์โหลด",
    all: "ดาวน์โหลด ZIP",
    settings: "เปลี่ยนการตั้งค่า",
    more: "ประมวลผลไฟล์อื่น",
    retry: "ลองไฟล์ที่ไม่สำเร็จอีกครั้ง",
  } : {
    done: result.cancelled ? "CANCELLED" : result.failed?.length ? "PARTIAL SUCCESS" : "DONE",
    original: "Original",
    output: "Result",
    saved: "Saved",
    success: "Success",
    failed: "Failed",
    download: "Download",
    all: "Download ZIP",
    settings: "Change settings",
    more: "Process more files",
    retry: "Retry failed",
  };

  const saved = result.before > 0 && result.after < result.before ? Math.round((1 - result.after / result.before) * 100) : 0;

  const downloadAll = async () => {
    if (result.entries.length === 1) {
      downloadBlob(result.entries[0].blob, result.entries[0].name);
      return;
    }
    const zip = await createZip(result.entries.map(({ name, blob }) => ({ name, blob })));
    downloadBlob(zip, "fastfiles-results.zip");
  };

  return (
    <section className="result-center" aria-live="polite" data-testid="result-center">
      <div className="result-heading">
        <div><span className="section-kicker">{t.done}</span><h2>{result.label}</h2></div>
        <div className="result-counts"><span><strong>{result.entries.length}</strong>{t.success}</span><span><strong>{result.failed?.length ?? 0}</strong>{t.failed}</span></div>
      </div>
      <div className="result-metrics">
        <div><span>{t.original}</span><strong>{formatBytes(result.before)}</strong></div>
        <div><span>{t.output}</span><strong>{formatBytes(result.after)}</strong></div>
        <div><span>{t.saved}</span><strong>{saved ? `${saved}%` : "—"}</strong></div>
      </div>
      <div className="result-files">
        {result.entries.map((entry) => (
          <div className="result-file" key={`${entry.name}-${entry.blob.size}`}>
            <div><strong>{entry.name}</strong><span>{formatBytes(entry.blob.size)}{entry.originalSize ? ` · ${formatBytes(entry.originalSize)} → ${formatBytes(entry.blob.size)}` : ""}</span></div>
            <button className="secondary-button compact" onClick={() => downloadBlob(entry.blob, entry.name)}>{t.download}</button>
          </div>
        ))}
        {result.failed?.map((entry) => (
          <div className="result-file failed" key={`${entry.name}-${entry.reason}`}>
            <div><strong>{entry.name}</strong><span>{entry.reason}</span></div><span className="queue-status error">{t.failed}</span>
          </div>
        ))}
      </div>
      <div className="result-actions">
        {result.entries.length > 0 && <button className="primary-button" onClick={downloadAll}>{result.entries.length > 1 ? t.all : t.download} ↗</button>}
        {result.retryFailed && (result.failed?.length ?? 0) > 0 && <button className="secondary-button" onClick={result.retryFailed}>{t.retry}</button>}
        {onChangeSettings && <button className="secondary-button" onClick={onChangeSettings}>{t.settings}</button>}
        {onProcessMore && <button className="text-button" onClick={onProcessMore}>{t.more}</button>}
      </div>
    </section>
  );
}
