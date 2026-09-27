"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { downloadBlob, downloadZip, formatBytes } from "@/lib/download";
import {
  getAspectCropRect,
  processImagesSettled,
  supportsImageFormat,
  type ImageFormat,
  type ImageProcessOptions,
} from "@/lib/image-tools";
import type { WorkspaceResult } from "./ResultCenter";

type Language = "en" | "th";
type Runner = (label: string, total: number, task: () => Promise<void>) => Promise<void>;
type ProgressUpdater = (label: string) => (done: number, total: number) => void;
type CropPreset = "original" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
type PreviewSource = ImageBitmap | HTMLImageElement;

type Props = {
  files: File[];
  language: Language;
  toolId: string;
  run: Runner;
  update: ProgressUpdater;
  setResult: (value: WorkspaceResult) => void;
  busy: boolean;
};

const cropRatios: Record<Exclude<CropPreset, "original">, number> = {
  "1:1": 1,
  "4:3": 4 / 3,
  "3:4": 3 / 4,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
};

function usePreviewUrls(files: File[]) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = files.map((file) => URL.createObjectURL(file));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  return urls;
}

async function loadPreviewSource(file: File): Promise<PreviewSource> {
  if ("createImageBitmap" in window) return createImageBitmap(file);
  const image = new Image();
  const url = URL.createObjectURL(file);
  try {
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sourceDimensions(source: PreviewSource) {
  return {
    width: "naturalWidth" in source ? source.naturalWidth : source.width,
    height: "naturalHeight" in source ? source.naturalHeight : source.height,
  };
}

function closePreviewSource(source: PreviewSource | null) {
  if (source && "close" in source && typeof source.close === "function") source.close();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function LiveImageWorkspace({ files, language, toolId, run, update, setResult, busy }: Props) {
  const images = files.filter((file) => file.type.startsWith("image/") || /\.(jpe?g|png|webp|avif)$/i.test(file.name));
  const urls = usePreviewUrls(images);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [format, setFormat] = useState<ImageFormat>("image/webp");
  const [quality, setQuality] = useState(toolId === "image-compress" ? 0.74 : 0.86);
  const [maxWidth, setMaxWidth] = useState(toolId === "image-resize" ? 1920 : 0);
  const [maxHeight, setMaxHeight] = useState(0);
  const [scalePercent, setScalePercent] = useState(100);
  const [preserveAspect, setPreserveAspect] = useState(true);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [watermark, setWatermark] = useState(toolId === "watermark" ? "FastFiles" : "");
  const [watermarkOpacity, setWatermarkOpacity] = useState(38);
  const [cropPreset, setCropPreset] = useState<CropPreset>("original");
  const [cropCenter, setCropCenter] = useState({ x: 0.5, y: 0.5 });
  const [avifSupported, setAvifSupported] = useState(false);
  const [localProcessing, setLocalProcessing] = useState(false);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [previewError, setPreviewError] = useState("");
  const sourceRef = useRef<PreviewSource | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; centerX: number; centerY: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedFile = images[Math.min(selectedIndex, Math.max(0, images.length - 1))];
  const cropAspect = cropPreset === "original" ? undefined : cropRatios[cropPreset];
  const swapped = rotation === 90 || rotation === 270;
  const transformedSize = {
    width: swapped ? previewSize.height : previewSize.width,
    height: swapped ? previewSize.width : previewSize.height,
  };
  const cropRect = useMemo(
    () => getAspectCropRect(transformedSize.width, transformedSize.height, cropAspect, cropCenter.x, cropCenter.y),
    [transformedSize.width, transformedSize.height, cropAspect, cropCenter.x, cropCenter.y],
  );

  useEffect(() => {
    supportsImageFormat("image/avif").then(setAvifSupported).catch(() => setAvifSupported(false));
  }, []);

  useEffect(() => {
    if (selectedIndex < images.length) return;
    setSelectedIndex(Math.max(0, images.length - 1));
  }, [images.length, selectedIndex]);

  useEffect(() => {
    let active = true;
    closePreviewSource(sourceRef.current);
    sourceRef.current = null;
    setPreviewSize({ width: 0, height: 0 });
    setPreviewError("");
    if (!selectedFile) return () => { active = false; };

    loadPreviewSource(selectedFile)
      .then((source) => {
        if (!active) {
          closePreviewSource(source);
          return;
        }
        sourceRef.current = source;
        setPreviewSize(sourceDimensions(source));
      })
      .catch((error) => {
        if (active) setPreviewError(error instanceof Error ? error.message : "Unable to preview this image.");
      });

    return () => {
      active = false;
      closePreviewSource(sourceRef.current);
      sourceRef.current = null;
    };
  }, [selectedFile]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const source = sourceRef.current;
    if (!canvas || !source || !previewSize.width || !previewSize.height) return;

    const fullWidth = transformedSize.width;
    const fullHeight = transformedSize.height;
    const previewScale = Math.min(1, 1200 / Math.max(fullWidth, fullHeight));
    canvas.width = Math.max(1, Math.round(fullWidth * previewScale));
    canvas.height = Math.max(1, Math.round(fullHeight * previewScale));
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.scale(previewScale, previewScale);
    context.translate(fullWidth / 2, fullHeight / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    context.drawImage(source, -previewSize.width / 2, -previewSize.height / 2, previewSize.width, previewSize.height);
    context.restore();

    if (watermark.trim()) {
      context.save();
      const scaledCrop = {
        x: cropRect.x * previewScale,
        y: cropRect.y * previewScale,
        width: cropRect.width * previewScale,
        height: cropRect.height * previewScale,
      };
      const fontSize = Math.max(14, Math.round(Math.min(scaledCrop.width, scaledCrop.height) * 0.055));
      context.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
      context.textAlign = "right";
      context.textBaseline = "bottom";
      context.fillStyle = `rgba(20, 20, 16, ${watermarkOpacity / 100})`;
      context.fillText(watermark.trim(), scaledCrop.x + scaledCrop.width - fontSize * 0.65, scaledCrop.y + scaledCrop.height - fontSize * 0.55);
      context.restore();
    }
  }, [previewSize, transformedSize.width, transformedSize.height, rotation, flipX, flipY, watermark, watermarkOpacity, cropRect]);

  const options: ImageProcessOptions = {
    format,
    quality,
    maxWidth: maxWidth || undefined,
    maxHeight: maxHeight || undefined,
    scalePercent,
    cropAspect,
    cropCenterX: cropCenter.x,
    cropCenterY: cropCenter.y,
    rotation,
    flipX,
    flipY,
    watermark: watermark || undefined,
    watermarkOpacity: watermarkOpacity / 100,
    preserveAspect,
  };

  const runImages = (targets: File[], retryLabel?: string) => run(language === "th" ? "กำลังประมวลผลรูป" : "PROCESSING IMAGES", targets.length, async () => {
    if (!targets.length) throw new Error(language === "th" ? "เพิ่มรูปอย่างน้อยหนึ่งไฟล์" : "Add at least one image first.");
    const controller = new AbortController();
    abortRef.current = controller;
    setLocalProcessing(true);
    try {
      const settled = await processImagesSettled(targets, options, (done, total) => {
        update(language === "th" ? "กำลังประมวลผลรูป" : "PROCESSING IMAGES")(done, total);
      }, controller.signal);
      const before = targets.reduce((sum, file) => sum + file.size, 0);
      const after = settled.outputs.reduce((sum, item) => sum + item.blob.size, 0);
      const entries = settled.outputs.map((item) => ({ name: item.name, blob: item.blob, originalSize: item.originalSize, sourceName: item.source.name }));
      const failed = settled.failures.map((item) => ({ name: item.file.name, reason: item.error }));

      if (entries.length === 1 && !failed.length) downloadBlob(entries[0].blob, entries[0].name);
      else if (entries.length) await downloadZip(entries.map(({ name, blob }) => ({ name, blob })), "fastfiles-images.zip");

      const retryFiles = settled.failures.map((item) => item.file);
      setResult({
        label: retryLabel ?? (language === "th" ? `ประมวลผลสำเร็จ ${entries.length} จาก ${targets.length} ไฟล์` : `${entries.length} OF ${targets.length} IMAGES PROCESSED`),
        entries,
        failed,
        before,
        after,
        cancelled: settled.cancelled,
        retryFailed: retryFiles.length ? () => runImages(retryFiles, language === "th" ? "ลองไฟล์ที่ไม่สำเร็จอีกครั้ง" : "RETRY COMPLETED") : undefined,
      });
    } finally {
      abortRef.current = null;
      setLocalProcessing(false);
    }
  });

  const applyPreset = (preset: "original" | "50" | "25" | "1080" | "1920") => {
    if (preset === "original") { setScalePercent(100); setMaxWidth(0); setMaxHeight(0); }
    if (preset === "50") { setScalePercent(50); setMaxWidth(0); setMaxHeight(0); }
    if (preset === "25") { setScalePercent(25); setMaxWidth(0); setMaxHeight(0); }
    if (preset === "1080") { setScalePercent(100); setMaxWidth(1080); setMaxHeight(0); }
    if (preset === "1920") { setScalePercent(100); setMaxWidth(1920); setMaxHeight(0); }
  };

  const resetEdits = () => {
    setScalePercent(100);
    setMaxWidth(toolId === "image-resize" ? 1920 : 0);
    setMaxHeight(0);
    setPreserveAspect(true);
    setRotation(0);
    setFlipX(false);
    setFlipY(false);
    setCropPreset("original");
    setCropCenter({ x: 0.5, y: 0.5 });
    setWatermark(toolId === "watermark" ? "FastFiles" : "");
    setWatermarkOpacity(38);
  };

  const moveCrop = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !cropAspect) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const nextX = drag.centerX + (event.clientX - drag.x) / Math.max(1, bounds.width);
    const nextY = drag.centerY + (event.clientY - drag.y) / Math.max(1, bounds.height);
    setCropCenter({ x: clamp(nextX, 0, 1), y: clamp(nextY, 0, 1) });
  };

  const beginCropDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!cropAspect) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, centerX: cropCenter.x, centerY: cropCenter.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const endCropDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const totalSize = images.reduce((sum, file) => sum + file.size, 0);
  const cropArea = transformedSize.width && transformedSize.height ? (cropRect.width * cropRect.height) / (transformedSize.width * transformedSize.height) : 1;
  const estimated = Math.round(totalSize * quality * (scalePercent / 100) * cropArea * (maxWidth ? 0.72 : 1));
  const outputWidth = Math.max(1, Math.round(cropRect.width * Math.min(1, (scalePercent || 100) / 100, maxWidth ? maxWidth / Math.max(1, cropRect.width) : 1, maxHeight ? maxHeight / Math.max(1, cropRect.height) : 1)));
  const outputHeight = preserveAspect
    ? Math.max(1, Math.round(outputWidth * (cropRect.height / Math.max(1, cropRect.width))))
    : Math.max(1, maxHeight || Math.round(cropRect.height));

  return (
    <div className="image-workspace live-image-workspace" data-testid="live-image-editor">
      <div className="image-preview-column live-preview-column">
        <div className="live-editor-topline">
          <div><span className="eyebrow">{language === "th" ? "ตัวอย่างแบบเรียลไทม์" : "LIVE EDIT"}</span><strong>{selectedFile?.name ?? "—"}</strong></div>
          <div className="live-editor-meta"><span>{previewSize.width || "—"} × {previewSize.height || "—"}</span><span>→</span><strong>{previewSize.width ? `${outputWidth} × ${outputHeight}` : "—"}</strong></div>
        </div>

        <div className="live-preview-stage" data-testid="live-image-preview" data-preview-rotation={rotation}>
          {previewError ? <div className="live-preview-error">{previewError}</div> : !previewSize.width ? <div className="thumb-skeleton live-preview-loading" /> : (
            <div className="live-canvas-wrap">
              <canvas ref={canvasRef} aria-label={language === "th" ? "ตัวอย่างรูปที่กำลังแก้ไข" : "Live edited image preview"} />
              {cropAspect && transformedSize.width > 0 && transformedSize.height > 0 && (
                <div
                  className="crop-overlay"
                  data-testid="crop-overlay"
                  aria-label={language === "th" ? "ลากเพื่อเลื่อนพื้นที่ครอป" : "Drag to reposition crop"}
                  style={{
                    left: `${(cropRect.x / transformedSize.width) * 100}%`,
                    top: `${(cropRect.y / transformedSize.height) * 100}%`,
                    width: `${(cropRect.width / transformedSize.width) * 100}%`,
                    height: `${(cropRect.height / transformedSize.height) * 100}%`,
                  }}
                  onPointerDown={beginCropDrag}
                  onPointerMove={moveCrop}
                  onPointerUp={endCropDrag}
                  onPointerCancel={endCropDrag}
                >
                  <span className="crop-third crop-third-v one" /><span className="crop-third crop-third-v two" />
                  <span className="crop-third crop-third-h one" /><span className="crop-third crop-third-h two" />
                  <span className="crop-handle top-left" /><span className="crop-handle top-right" /><span className="crop-handle bottom-left" /><span className="crop-handle bottom-right" />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="live-preview-footer">
          <span>{language === "th" ? "Preview ใช้ภาพย่อเพื่อความลื่น · Export ใช้ไฟล์ต้นฉบับเต็มความละเอียด" : "Preview is lightweight · Export uses the full-resolution source"}</span>
          {cropAspect && <strong>{cropPreset} · {language === "th" ? "ลากกรอบเพื่อจัดตำแหน่ง" : "DRAG CROP TO REPOSITION"}</strong>}
        </div>

        {images.length > 1 && <div className="image-filmstrip" aria-label={language === "th" ? "เลือกรูปตัวอย่าง" : "Choose preview image"}>{images.slice(0, 24).map((file, index) => (
          <button type="button" className={index === selectedIndex ? "active" : ""} key={`${file.name}-${index}`} onClick={() => setSelectedIndex(index)} aria-label={`${language === "th" ? "ดูตัวอย่าง" : "Preview"} ${file.name}`}>
            <img src={urls[index]} alt="" /><span>{index + 1}</span>
          </button>
        ))}</div>}
      </div>

      <aside className="control-panel live-control-panel">
        <div className="control-head"><span>{language === "th" ? "การตั้งค่า" : "SETTINGS"}</span><button className="control-reset" type="button" onClick={resetEdits} disabled={busy}>{language === "th" ? "รีเซ็ต" : "RESET"}</button></div>

        <div className="control-section"><span className="control-section-title">{language === "th" ? "ตัดภาพ" : "CROP"}</span><div className="crop-preset-row">{(["original", "1:1", "4:3", "3:4", "16:9", "9:16"] as CropPreset[]).map((preset) => <button type="button" className={cropPreset === preset ? "active" : ""} key={preset} onClick={() => { setCropPreset(preset); setCropCenter({ x: 0.5, y: 0.5 }); }}>{preset === "original" ? (language === "th" ? "เต็มภาพ" : "Original") : preset}</button>)}</div></div>

        <div className="control-section"><span className="control-section-title">{language === "th" ? "ขนาด" : "SIZE"}</span><div className="preset-row"><button onClick={() => applyPreset("original")}>Original</button><button onClick={() => applyPreset("50")}>50%</button><button onClick={() => applyPreset("25")}>25%</button><button onClick={() => applyPreset("1080")}>1080px</button><button onClick={() => applyPreset("1920")}>1920px</button></div><div className="field-pair"><label>{language === "th" ? "กว้างสูงสุด" : "MAX WIDTH"}<input type="number" min="0" value={maxWidth || ""} placeholder="Original" onChange={(event) => setMaxWidth(Math.max(0, Number(event.target.value)))} /></label><label>{language === "th" ? "สูงสูงสุด" : "MAX HEIGHT"}<input type="number" min="0" value={maxHeight || ""} placeholder="Original" onChange={(event) => setMaxHeight(Math.max(0, Number(event.target.value)))} /></label></div><label className="check-label"><input type="checkbox" checked={preserveAspect} onChange={(event) => setPreserveAspect(event.target.checked)} /> {language === "th" ? "รักษาอัตราส่วนภาพ" : "Preserve aspect ratio"}</label></div>

        <div className="control-section"><span className="control-section-title">{language === "th" ? "หมุนและกลับด้าน" : "TRANSFORM"}</span><div className="toggle-grid live-toggle-grid"><button type="button" className={flipX ? "active" : ""} onClick={() => setFlipX((value) => !value)}>FLIP X</button><button type="button" className={flipY ? "active" : ""} onClick={() => setFlipY((value) => !value)}>FLIP Y</button><button type="button" data-testid="rotate-image" onClick={() => setRotation((value) => ((value + 90) % 360) as 0 | 90 | 180 | 270)}>ROTATE {rotation}°</button></div></div>

        <div className="control-section"><span className="control-section-title">{language === "th" ? "ส่งออก" : "OUTPUT"}</span><label>{language === "th" ? "รูปแบบ" : "FORMAT"}<select value={format} onChange={(event) => setFormat(event.target.value as ImageFormat)}><option value="image/webp">WEBP</option><option value="image/jpeg">JPG</option><option value="image/png">PNG</option>{avifSupported && <option value="image/avif">AVIF</option>}</select></label><label>{language === "th" ? "คุณภาพ" : "QUALITY"} · {Math.round(quality * 100)}%<input type="range" min="35" max="100" value={Math.round(quality * 100)} onChange={(event) => setQuality(Number(event.target.value) / 100)} /></label></div>

        <div className="control-section"><span className="control-section-title">{language === "th" ? "ลายน้ำ" : "WATERMARK"}</span><label>{language === "th" ? "ข้อความ" : "TEXT"}<input value={watermark} onChange={(event) => setWatermark(event.target.value)} placeholder={language === "th" ? "ไม่บังคับ" : "Optional"} /></label><label>{language === "th" ? "ความทึบ" : "OPACITY"} · {watermarkOpacity}%<input type="range" min="8" max="80" value={watermarkOpacity} onChange={(event) => setWatermarkOpacity(Number(event.target.value))} /></label></div>

        <div className="estimate"><span>{language === "th" ? "ต้นฉบับ" : "ORIGINAL"} <strong>{formatBytes(totalSize)}</strong></span><span>{language === "th" ? "ประมาณการ" : "ESTIMATED"} <strong>~{formatBytes(estimated)}</strong></span></div>
        <small className="estimate-note">{language === "th" ? `ค่าปัจจุบันใช้กับ ${images.length} รูป · ขนาดจริงจะแสดงหลัง Export` : `Current edits apply to ${images.length} image${images.length === 1 ? "" : "s"}. Actual size is shown after export.`}</small>
        {localProcessing ? <button className="secondary-button danger-outline" onClick={() => abortRef.current?.abort()}>{language === "th" ? "ยกเลิก" : "Cancel"}</button> : <button className="primary-button" disabled={busy || !images.length} onClick={() => runImages(images)}>{language === "th" ? `ประมวลผล ${images.length} ไฟล์` : `PROCESS ${images.length > 1 ? `${images.length} FILES` : "IMAGE"}`} ↗</button>}
      </aside>
    </div>
  );
}
