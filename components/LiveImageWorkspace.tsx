"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import { downloadBlob, downloadZip, formatBytes } from "@/lib/download";
import {
  drawTextWatermark,
  drawImageWatermark,
  getAspectCropRect,
  getRotatedBounds,
  processImagesSettled,
  supportsImageFormat,
  type ImageFormat,
  type ImageProcessOptions,
  type WatermarkPosition,
} from "@/lib/image-tools";
import type { WorkspaceResult } from "./ResultCenter";

type Language = "en" | "th";
type Runner = (label: string, total: number, task: () => Promise<void>) => Promise<void>;
type ProgressUpdater = (label: string) => (done: number, total: number) => void;
type CropPreset = "free" | "original" | "1:1" | "4:3" | "3:4" | "16:9" | "9:16";
type PreviewSource = ImageBitmap | HTMLImageElement;
type ApplyScope = "all" | "selected" | "current";
type CropBox = { x: number; y: number; width: number; height: number };
type EditorSnapshot = {
  format: ImageFormat;
  quality: number;
  maxWidth: number;
  maxHeight: number;
  scalePercent: number;
  preserveAspect: boolean;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  cropPreset: CropPreset;
  cropBox: CropBox;
  watermark: string;
  watermarkOpacity: number;
  watermarkColor: string;
  watermarkSize: number;
  watermarkMargin: number;
  watermarkPosition: WatermarkPosition;
  watermarkShadow: boolean;
  watermarkShadowIntensity: number;
  watermarkWeight: number;
  watermarkRotation: number;
  watermarkX: number;
  watermarkY: number;
  watermarkTile: boolean;
  watermarkSpacing: number;
};

type Props = {
  files: File[];
  language: Language;
  toolId: string;
  run: Runner;
  update: ProgressUpdater;
  setResult: (value: WorkspaceResult) => void;
  busy: boolean;
};

const cropRatios: Record<Exclude<CropPreset, "original" | "free">, number> = {
  "1:1": 1,
  "4:3": 4 / 3,
  "3:4": 3 / 4,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
};

const watermarkPositions: Array<{ value: WatermarkPosition; en: string; th: string; mark: string }> = [
  { value: "top-left", en: "Top left", th: "ซ้ายบน", mark: "↖" },
  { value: "top-center", en: "Top center", th: "กลางบน", mark: "↑" },
  { value: "top-right", en: "Top right", th: "ขวาบน", mark: "↗" },
  { value: "center-left", en: "Center left", th: "ซ้ายกลาง", mark: "←" },
  { value: "center", en: "Center", th: "กึ่งกลาง", mark: "•" },
  { value: "center-right", en: "Center right", th: "ขวากลาง", mark: "→" },
  { value: "bottom-left", en: "Bottom left", th: "ซ้ายล่าง", mark: "↙" },
  { value: "bottom-center", en: "Bottom center", th: "กลางล่าง", mark: "↓" },
  { value: "bottom-right", en: "Bottom right", th: "ขวาล่าง", mark: "↘" },
];

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

function cropBoxForPreset(preset: CropPreset, width: number, height: number): CropBox {
  if (preset === "original") return { x: 0, y: 0, width: 1, height: 1 };
  if (preset === "free") return { x: 0.1, y: 0.1, width: 0.8, height: 0.8 };
  const rect = getAspectCropRect(width, height, cropRatios[preset]);
  return {
    x: rect.x / Math.max(1, width),
    y: rect.y / Math.max(1, height),
    width: rect.width / Math.max(1, width),
    height: rect.height / Math.max(1, height),
  };
}

function formatForFile(file?: File): ImageFormat {
  if (file?.type === "image/jpeg") return "image/jpeg";
  if (file?.type === "image/png") return "image/png";
  if (file?.type === "image/avif") return "image/avif";
  return "image/webp";
}

export default function LiveImageWorkspace({ files, language, toolId, run, update, setResult, busy }: Props) {
  const images = files.filter((file) => file.type.startsWith("image/") || /\.(jpe?g|png|webp|avif)$/i.test(file.name));
  const watermarkMode = toolId === "watermark";
  const urls = usePreviewUrls(images);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [format, setFormat] = useState<ImageFormat>(() => watermarkMode ? formatForFile(images[0]) : "image/webp");
  const [quality, setQuality] = useState(watermarkMode ? 0.95 : toolId === "image-compress" ? 0.74 : 0.86);
  const [maxWidth, setMaxWidth] = useState(toolId === "image-resize" ? 1920 : 0);
  const [maxHeight, setMaxHeight] = useState(0);
  const [scalePercent, setScalePercent] = useState(100);
  const [preserveAspect, setPreserveAspect] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [watermark, setWatermark] = useState(watermarkMode ? "FastFiles" : "");
  const [watermarkOpacity, setWatermarkOpacity] = useState(42);
  const [watermarkColor, setWatermarkColor] = useState("#ffffff");
  const [watermarkSize, setWatermarkSize] = useState(7);
  const [watermarkMargin, setWatermarkMargin] = useState(4);
  const [watermarkPosition, setWatermarkPosition] = useState<WatermarkPosition>("bottom-right");
  const [watermarkShadow, setWatermarkShadow] = useState(true);
  const [watermarkShadowIntensity, setWatermarkShadowIntensity] = useState(70);
  const [watermarkWeight, setWatermarkWeight] = useState(700);
  const [watermarkRotation, setWatermarkRotation] = useState(0);
  const [watermarkX, setWatermarkX] = useState(0.5);
  const [watermarkY, setWatermarkY] = useState(0.5);
  const [watermarkTile, setWatermarkTile] = useState(false);
  const [watermarkSpacing, setWatermarkSpacing] = useState(12);
  const [watermarkType, setWatermarkType] = useState<"text" | "image">("text");
  const [watermarkImage, setWatermarkImage] = useState<File | null>(null);
  const [cropPreset, setCropPreset] = useState<CropPreset>("original");
  const [cropBox, setCropBox] = useState<CropBox>({ x: 0, y: 0, width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [compareBefore, setCompareBefore] = useState(false);
  const [applyScope, setApplyScope] = useState<ApplyScope>("all");
  const [selectedImages, setSelectedImages] = useState<Set<number>>(() => new Set(images.map((_, index) => index)));
  const [history, setHistory] = useState<EditorSnapshot[]>([]);
  const [future, setFuture] = useState<EditorSnapshot[]>([]);
  const [avifSupported, setAvifSupported] = useState(false);
  const [localProcessing, setLocalProcessing] = useState(false);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });
  const [previewError, setPreviewError] = useState("");
  const sourceRef = useRef<PreviewSource | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; box: CropBox; handle: string } | null>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const watermarkDragRef = useRef<{ pointerId: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedFile = images[Math.min(selectedIndex, Math.max(0, images.length - 1))];
  const transformedSize = useMemo(() => getRotatedBounds(previewSize.width, previewSize.height, rotation), [previewSize, rotation]);
  const cropRect = useMemo(() => ({
    x: cropBox.x * transformedSize.width,
    y: cropBox.y * transformedSize.height,
    width: cropBox.width * transformedSize.width,
    height: cropBox.height * transformedSize.height,
  }), [cropBox, transformedSize]);

  const snapshot = useCallback((): EditorSnapshot => ({
    format, quality, maxWidth, maxHeight, scalePercent, preserveAspect, rotation, flipX, flipY,
    cropPreset, cropBox, watermark, watermarkOpacity, watermarkColor, watermarkSize, watermarkMargin,
    watermarkPosition, watermarkShadow, watermarkShadowIntensity, watermarkWeight, watermarkRotation,
    watermarkX, watermarkY, watermarkTile, watermarkSpacing,
  }), [format, quality, maxWidth, maxHeight, scalePercent, preserveAspect, rotation, flipX, flipY, cropPreset, cropBox, watermark, watermarkOpacity, watermarkColor, watermarkSize, watermarkMargin, watermarkPosition, watermarkShadow, watermarkShadowIntensity, watermarkWeight, watermarkRotation, watermarkX, watermarkY, watermarkTile, watermarkSpacing]);

  const restoreSnapshot = useCallback((value: EditorSnapshot) => {
    setFormat(value.format); setQuality(value.quality); setMaxWidth(value.maxWidth); setMaxHeight(value.maxHeight);
    setScalePercent(value.scalePercent); setPreserveAspect(value.preserveAspect); setRotation(value.rotation);
    setFlipX(value.flipX); setFlipY(value.flipY); setCropPreset(value.cropPreset); setCropBox(value.cropBox);
    setWatermark(value.watermark); setWatermarkOpacity(value.watermarkOpacity); setWatermarkColor(value.watermarkColor);
    setWatermarkSize(value.watermarkSize); setWatermarkMargin(value.watermarkMargin); setWatermarkPosition(value.watermarkPosition);
    setWatermarkShadow(value.watermarkShadow); setWatermarkShadowIntensity(value.watermarkShadowIntensity);
    setWatermarkWeight(value.watermarkWeight); setWatermarkRotation(value.watermarkRotation);
    setWatermarkX(value.watermarkX); setWatermarkY(value.watermarkY); setWatermarkTile(value.watermarkTile);
    setWatermarkSpacing(value.watermarkSpacing);
  }, []);

  const remember = useCallback(() => {
    setHistory((value) => [...value.slice(-49), snapshot()]);
    setFuture([]);
  }, [snapshot]);

  const undo = useCallback(() => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((value) => [snapshot(), ...value].slice(0, 50));
    setHistory((value) => value.slice(0, -1));
    restoreSnapshot(previous);
  }, [history, restoreSnapshot, snapshot]);

  const redo = useCallback(() => {
    const next = future[0];
    if (!next) return;
    setHistory((value) => [...value.slice(-49), snapshot()]);
    setFuture((value) => value.slice(1));
    restoreSnapshot(next);
  }, [future, restoreSnapshot, snapshot]);

  useEffect(() => {
    supportsImageFormat("image/avif").then(setAvifSupported).catch(() => setAvifSupported(false));
  }, []);

  useEffect(() => {
    if (selectedIndex < images.length) return;
    setSelectedIndex(Math.max(0, images.length - 1));
  }, [images.length, selectedIndex]);

  useEffect(() => {
    setSelectedImages((current) => new Set([...current].filter((index) => index < images.length)));
  }, [images.length]);

  useEffect(() => {
    const node = editorRef.current;
    if (!node) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    };
    node.addEventListener("keydown", onKeyDown);
    return () => node.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

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

    const fullWidth = compareBefore ? previewSize.width : transformedSize.width;
    const fullHeight = compareBefore ? previewSize.height : transformedSize.height;
    const previewScale = Math.min(1, 1200 / Math.max(fullWidth, fullHeight));
    canvas.width = Math.max(1, Math.round(fullWidth * previewScale));
    canvas.height = Math.max(1, Math.round(fullHeight * previewScale));
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.scale(previewScale, previewScale);
    context.translate(fullWidth / 2, fullHeight / 2);
    context.rotate(((compareBefore ? 0 : rotation) * Math.PI) / 180);
    context.scale(!compareBefore && flipX ? -1 : 1, !compareBefore && flipY ? -1 : 1);
    context.drawImage(source, -previewSize.width / 2, -previewSize.height / 2, previewSize.width, previewSize.height);
    context.restore();

    const watermarkOptions: ImageProcessOptions = {
      format, quality,
        watermarkOpacity: watermarkOpacity / 100,
        watermarkColor,
        watermarkSize: watermarkSize / 100,
        watermarkMargin: watermarkMargin / 100,
        watermarkPosition,
        watermarkShadow,
      watermarkShadowIntensity: watermarkShadowIntensity / 100,
      watermarkWeight,
      watermarkRotation,
      watermarkX,
      watermarkY,
      watermarkTile,
      watermarkSpacing: watermarkSpacing / 100,
    };
    if (watermarkMode && !compareBefore) {
      if (watermarkType === "image" && watermarkImage) void drawImageWatermark(context, canvas.width, canvas.height, watermarkImage, watermarkOptions);
      else if (watermark.trim()) drawTextWatermark(context, canvas.width, canvas.height, watermark, watermarkOptions);
    }
  }, [previewSize, transformedSize.width, transformedSize.height, rotation, flipX, flipY, watermarkMode, watermark, watermarkOpacity, watermarkColor, watermarkSize, watermarkMargin, watermarkPosition, watermarkShadow, watermarkShadowIntensity, watermarkWeight, watermarkRotation, watermarkX, watermarkY, watermarkTile, watermarkSpacing, watermarkType, watermarkImage, compareBefore, format, quality]);

  const options: ImageProcessOptions = {
    format,
    quality,
    maxWidth: watermarkMode ? undefined : maxWidth || undefined,
    maxHeight: watermarkMode ? undefined : maxHeight || undefined,
    scalePercent: watermarkMode ? 100 : scalePercent,
    cropRect: watermarkMode || cropPreset === "original" ? undefined : cropBox,
    rotation: watermarkMode ? 0 : rotation,
    flipX: watermarkMode ? false : flipX,
    flipY: watermarkMode ? false : flipY,
    watermark: watermarkMode && watermarkType === "text" ? watermark || undefined : undefined,
    watermarkImage: watermarkMode && watermarkType === "image" ? watermarkImage ?? undefined : undefined,
    watermarkOpacity: watermarkOpacity / 100,
    watermarkColor,
    watermarkSize: watermarkSize / 100,
    watermarkMargin: watermarkMargin / 100,
    watermarkPosition,
    watermarkShadow,
    watermarkShadowIntensity: watermarkShadowIntensity / 100,
    watermarkWeight,
    watermarkRotation,
    watermarkX,
    watermarkY,
    watermarkTile,
    watermarkSpacing: watermarkSpacing / 100,
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
      else if (entries.length) await downloadZip(entries.map(({ name, blob }) => ({ name, blob })), watermarkMode ? "fastfiles-watermarked-images.zip" : "fastfiles-images.zip");

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

  const applyPreset = (preset: "original" | "75" | "50" | "25" | "1080" | "1920" | "1440" | "4k") => {
    remember();
    if (preset === "original") { setScalePercent(100); setMaxWidth(0); setMaxHeight(0); }
    if (preset === "75") { setScalePercent(75); setMaxWidth(0); setMaxHeight(0); }
    if (preset === "50") { setScalePercent(50); setMaxWidth(0); setMaxHeight(0); }
    if (preset === "25") { setScalePercent(25); setMaxWidth(0); setMaxHeight(0); }
    if (preset === "1080") { setScalePercent(100); setMaxWidth(1080); setMaxHeight(0); }
    if (preset === "1920") { setScalePercent(100); setMaxWidth(1920); setMaxHeight(0); }
    if (preset === "1440") { setScalePercent(100); setMaxWidth(2560); setMaxHeight(1440); }
    if (preset === "4k") { setScalePercent(100); setMaxWidth(3840); setMaxHeight(2160); }
  };

  const applyQualityPreset = (value: number) => { remember(); setQuality(value); };

  const resetEdits = () => {
    remember();
    setScalePercent(100);
    setMaxWidth(toolId === "image-resize" ? 1920 : 0);
    setMaxHeight(0);
    setPreserveAspect(true);
    setRotation(0);
    setFlipX(false);
    setFlipY(false);
    setCropPreset("original");
    setCropBox({ x: 0, y: 0, width: 1, height: 1 });
    setWatermark(watermarkMode ? "FastFiles" : "");
    setWatermarkOpacity(42);
    setWatermarkColor("#ffffff");
    setWatermarkSize(7);
    setWatermarkMargin(4);
    setWatermarkPosition("bottom-right");
    setWatermarkShadow(true);
    setWatermarkShadowIntensity(70);
    setWatermarkWeight(700);
    setWatermarkRotation(0);
    setWatermarkX(0.5);
    setWatermarkY(0.5);
    setWatermarkTile(false);
    setWatermarkSpacing(12);
    setWatermarkType("text");
    setWatermarkImage(null);
    setQuality(watermarkMode ? 0.95 : 0.86);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    if (watermarkMode) setFormat(formatForFile(selectedFile));
  };

  const moveCrop = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || cropPreset === "original") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const dx = (event.clientX - drag.x) / Math.max(1, bounds.width);
    const dy = (event.clientY - drag.y) / Math.max(1, bounds.height);
    const minimum = 0.05;
    let { x, y, width, height } = drag.box;
    if (drag.handle === "move") {
      x = clamp(x + dx, 0, 1 - width);
      y = clamp(y + dy, 0, 1 - height);
    } else {
      if (drag.handle.includes("e")) width = clamp(width + dx, minimum, 1 - x);
      if (drag.handle.includes("s")) height = clamp(height + dy, minimum, 1 - y);
      if (drag.handle.includes("w")) { const nextX = clamp(x + dx, 0, x + width - minimum); width += x - nextX; x = nextX; }
      if (drag.handle.includes("n")) { const nextY = clamp(y + dy, 0, y + height - minimum); height += y - nextY; y = nextY; }
      setCropPreset("free");
    }
    setCropBox({ x, y, width, height });
  };

  const beginCropDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (cropPreset === "original") return;
    remember();
    const target = event.target as HTMLElement;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, box: cropBox, handle: target.dataset.cropHandle ?? "move" };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const endCropDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const beginPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (zoom <= 1 || (event.target as HTMLElement).closest(".crop-overlay, .watermark-drag-handle")) return;
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = panRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
  };
  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    panRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const changeZoom = (next: number) => {
    const value = clamp(next, 0.25, 4);
    setZoom(value);
    if (value <= 1) setPan({ x: 0, y: 0 });
  };
  const zoomWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    changeZoom(zoom * (event.deltaY > 0 ? 0.9 : 1.1));
  };
  const moveWatermark = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (watermarkDragRef.current?.pointerId !== event.pointerId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    setWatermarkX(clamp((event.clientX - bounds.left) / Math.max(1, bounds.width), 0, 1));
    setWatermarkY(clamp((event.clientY - bounds.top) / Math.max(1, bounds.height), 0, 1));
    setWatermarkPosition("custom");
  };

  const targetImages = applyScope === "current" ? (selectedFile ? [selectedFile] : []) : applyScope === "selected" ? images.filter((_, index) => selectedImages.has(index)) : images;

  const totalSize = targetImages.reduce((sum, file) => sum + file.size, 0);
  const cropArea = transformedSize.width && transformedSize.height ? (cropRect.width * cropRect.height) / (transformedSize.width * transformedSize.height) : 1;
  const estimated = Math.round(totalSize * quality * (watermarkMode ? 1 : scalePercent / 100) * cropArea * (!watermarkMode && maxWidth ? 0.72 : 1));
  const outputWidth = watermarkMode ? transformedSize.width : Math.max(1, Math.round(cropRect.width * Math.min(1, (scalePercent || 100) / 100, maxWidth ? maxWidth / Math.max(1, cropRect.width) : 1, maxHeight ? maxHeight / Math.max(1, cropRect.height) : 1)));
  const outputHeight = watermarkMode
    ? transformedSize.height
    : preserveAspect
      ? Math.max(1, Math.round(outputWidth * (cropRect.height / Math.max(1, cropRect.width))))
      : Math.max(1, maxHeight || Math.round(cropRect.height));

  return (
    <div ref={editorRef} tabIndex={0} aria-label={watermarkMode ? (language === "th" ? "พื้นที่แก้ไขลายน้ำ" : "Watermark editor") : (language === "th" ? "พื้นที่แก้ไขรูปภาพ" : "Image editor")} className={`image-workspace live-image-workspace ${watermarkMode ? "watermark-workspace" : "image-editor-workspace"}`} data-testid={watermarkMode ? "watermark-image-editor" : "live-image-editor"}>
      <div className="image-preview-column live-preview-column">
        <div className="live-editor-topline">
          <div><span className="eyebrow">{watermarkMode ? (language === "th" ? "ตัวอย่างลายน้ำแบบเรียลไทม์" : "LIVE WATERMARK") : (language === "th" ? "ตัวอย่างแบบเรียลไทม์" : "LIVE EDIT")}</span><strong>{selectedFile?.name ?? "—"}</strong></div>
          <div className="live-editor-meta"><span>{previewSize.width || "—"} × {previewSize.height || "—"}</span><span>→</span><strong>{previewSize.width ? `${outputWidth} × ${outputHeight}` : "—"}</strong></div>
        </div>

        <div className="preview-toolbar" aria-label={language === "th" ? "เครื่องมือมุมมอง" : "View controls"}>
          <button type="button" onClick={() => changeZoom(zoom / 1.2)} aria-label="Zoom out">−</button>
          <button type="button" onClick={() => changeZoom(1)}>{language === "th" ? "พอดี" : "Fit"}</button>
          <button type="button" onClick={() => changeZoom(1)}>100%</button>
          <button type="button" onClick={() => changeZoom(zoom * 1.2)} aria-label="Zoom in">+</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" className={compareBefore ? "active" : ""} onPointerDown={() => setCompareBefore(true)} onPointerUp={() => setCompareBefore(false)} onPointerCancel={() => setCompareBefore(false)} onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") setCompareBefore(true); }} onKeyUp={() => setCompareBefore(false)}>{language === "th" ? "กดค้างดูต้นฉบับ" : "Hold for before"}</button>
          <button type="button" onClick={undo} disabled={!history.length} aria-label="Undo">↶</button>
          <button type="button" onClick={redo} disabled={!future.length} aria-label="Redo">↷</button>
        </div>

        <div
          className="live-preview-stage"
          data-testid="live-image-preview"
          data-preview-rotation={rotation}
          data-watermark-position={watermarkMode ? watermarkPosition : undefined}
          data-watermark-color={watermarkMode ? watermarkColor : undefined}
          data-watermark-text={watermarkMode ? watermark : undefined}
          onWheel={zoomWheel}
        >
          {previewError ? <div className="live-preview-error">{previewError}</div> : !previewSize.width ? <div className="thumb-skeleton live-preview-loading" /> : (
            <div className="live-canvas-wrap" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}>
              <canvas ref={canvasRef} aria-label={watermarkMode ? (language === "th" ? "ตัวอย่างลายน้ำบนรูป" : "Live image watermark preview") : (language === "th" ? "ตัวอย่างรูปที่กำลังแก้ไข" : "Live edited image preview")} />
              {!watermarkMode && !compareBefore && cropPreset !== "original" && transformedSize.width > 0 && transformedSize.height > 0 && (
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
                  <span className="crop-handle top-left" data-crop-handle="nw" /><span className="crop-handle top" data-crop-handle="n" /><span className="crop-handle top-right" data-crop-handle="ne" />
                  <span className="crop-handle right" data-crop-handle="e" /><span className="crop-handle bottom-right" data-crop-handle="se" /><span className="crop-handle bottom" data-crop-handle="s" />
                  <span className="crop-handle bottom-left" data-crop-handle="sw" /><span className="crop-handle left" data-crop-handle="w" />
                </div>
              )}
              {watermarkMode && !watermarkTile && !compareBefore && (watermarkType === "text" ? watermark.trim() : watermarkImage) && <button
                type="button"
                className="watermark-drag-handle"
                aria-label={language === "th" ? "ลากเพื่อย้ายลายน้ำ" : "Drag to move watermark"}
                style={{ left: `${watermarkX * 100}%`, top: `${watermarkY * 100}%` }}
                onPointerDown={(event) => { remember(); watermarkDragRef.current = { pointerId: event.pointerId }; event.currentTarget.setPointerCapture(event.pointerId); }}
                onPointerMove={moveWatermark}
                onPointerUp={(event) => { watermarkDragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
              />}
            </div>
          )}
        </div>

        <div className="live-preview-footer">
          <span>{language === "th" ? "Preview ใช้ภาพย่อเพื่อความลื่น · Export ใช้ไฟล์ต้นฉบับเต็มความละเอียด" : "Preview is lightweight · Export uses the full-resolution source"}</span>
          {!watermarkMode && cropPreset !== "original" && <strong>{cropPreset} · {language === "th" ? "ลากกรอบหรือจุดจับเพื่อปรับครอป" : "DRAG OR RESIZE THE CROP"}</strong>}
          {watermarkMode && <strong>{language === "th" ? "การตั้งค่าลายน้ำจะใช้กับทุกภาพที่เลือก" : "WATERMARK SETTINGS APPLY TO ALL SELECTED IMAGES"}</strong>}
        </div>

        {images.length > 1 && <div className="filmstrip-wrap">
          <div className="scope-row"><span>{language === "th" ? "ใช้กับ" : "Apply to"}</span>{(["all", "selected", "current"] as ApplyScope[]).map((scope) => <button type="button" className={applyScope === scope ? "active" : ""} key={scope} onClick={() => setApplyScope(scope)}>{language === "th" ? (scope === "all" ? "ทั้งหมด" : scope === "selected" ? "ที่เลือก" : "รูปปัจจุบัน") : scope}</button>)}</div>
          <div className="image-filmstrip" aria-label={language === "th" ? "เลือกรูปตัวอย่าง" : "Choose preview image"}>{images.slice(0, 24).map((file, index) => (
            <div className={`filmstrip-item ${index === selectedIndex ? "active" : ""}`} key={`${file.name}-${index}`}>
              <button type="button" onClick={() => setSelectedIndex(index)} aria-label={`${language === "th" ? "ดูตัวอย่าง" : "Preview"} ${file.name}`}><img src={urls[index]} alt="" /><span>{index + 1}</span></button>
              <label><input type="checkbox" checked={selectedImages.has(index)} onChange={() => setSelectedImages((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; })} aria-label={`${language === "th" ? "เลือก" : "Select"} ${file.name}`} /></label>
            </div>
          ))}</div>
        </div>}
      </div>

      <aside className="control-panel live-control-panel">
        <div className="control-head"><span>{watermarkMode ? (language === "th" ? "ตั้งค่าลายน้ำ" : "WATERMARK SETTINGS") : (language === "th" ? "การตั้งค่า" : "SETTINGS")}</span><button className="control-reset" type="button" onClick={resetEdits} disabled={busy}>{language === "th" ? "รีเซ็ต" : "RESET"}</button></div>

        {!watermarkMode && <>
          <div className="control-section"><span className="control-section-title">{language === "th" ? "ตัดภาพ" : "CROP"}</span><div className="crop-preset-row">{(["free", "original", "1:1", "4:3", "3:4", "16:9", "9:16"] as CropPreset[]).map((preset) => <button type="button" className={cropPreset === preset ? "active" : ""} key={preset} onClick={() => { remember(); setCropPreset(preset); setCropBox(cropBoxForPreset(preset, transformedSize.width, transformedSize.height)); }}>{preset === "original" ? (language === "th" ? "เต็มภาพ" : "Original") : preset === "free" ? (language === "th" ? "อิสระ" : "Free") : preset}</button>)}</div></div>

          <div className="control-section"><span className="control-section-title">{language === "th" ? "ขนาด" : "SIZE"}</span><div className="preset-row"><button onClick={() => applyPreset("original")}>Original</button><button onClick={() => applyPreset("25")}>25%</button><button onClick={() => applyPreset("50")}>50%</button><button onClick={() => applyPreset("75")}>75%</button><button onClick={() => applyPreset("1080")}>1080px</button><button onClick={() => applyPreset("1920")}>1920px</button><button onClick={() => applyPreset("1440")}>1440p</button><button onClick={() => applyPreset("4k")}>4K</button></div><div className="field-pair"><label>{language === "th" ? "กว้างสูงสุด" : "MAX WIDTH"}<input type="number" min="0" max="32767" value={maxWidth || ""} placeholder="Original" onFocus={remember} onChange={(event) => setMaxWidth(clamp(Number(event.target.value), 0, 32767))} /></label><label>{language === "th" ? "สูงสูงสุด" : "MAX HEIGHT"}<input type="number" min="0" max="32767" value={maxHeight || ""} placeholder="Original" onFocus={remember} onChange={(event) => setMaxHeight(clamp(Number(event.target.value), 0, 32767))} /></label></div><label className="check-label"><input type="checkbox" checked={preserveAspect} onChange={(event) => { remember(); setPreserveAspect(event.target.checked); }} /> {language === "th" ? "รักษาอัตราส่วนภาพ" : "Preserve aspect ratio"}</label></div>

          <div className="control-section"><span className="control-section-title">{language === "th" ? "หมุนและกลับด้าน" : "TRANSFORM"}</span><div className="toggle-grid live-toggle-grid"><button type="button" className={flipX ? "active" : ""} onClick={() => { remember(); setFlipX((value) => !value); }}>FLIP X</button><button type="button" className={flipY ? "active" : ""} onClick={() => { remember(); setFlipY((value) => !value); }}>FLIP Y</button><button type="button" onClick={() => { remember(); setRotation((value) => value - 90); }}>↶ 90°</button><button type="button" data-testid="rotate-image" onClick={() => { remember(); setRotation((value) => value + 90); }}>↷ 90°</button></div><label>{language === "th" ? "ปรับเอียง" : "CUSTOM ANGLE"} · {rotation}°<input aria-label={language === "th" ? "องศาหมุนเอง" : "Custom rotation angle"} type="range" min="-45" max="45" step="0.5" value={clamp(rotation, -45, 45)} onPointerDown={remember} onChange={(event) => setRotation(Number(event.target.value))} /></label></div>
        </>}

        {watermarkMode && <>
          <div className="control-section"><span className="control-section-title">{language === "th" ? "ชนิดลายน้ำ" : "WATERMARK TYPE"}</span><div className="toggle-grid"><button type="button" className={watermarkType === "text" ? "active" : ""} onClick={() => { remember(); setWatermarkType("text"); }}>Text</button><button type="button" className={watermarkType === "image" ? "active" : ""} onClick={() => { remember(); setWatermarkType("image"); }}>Logo / Image</button></div>{watermarkType === "text" ? <label>{language === "th" ? "ข้อความ" : "TEXT"}<input aria-label={language === "th" ? "ข้อความลายน้ำ" : "Watermark text"} value={watermark} onFocus={remember} onChange={(event) => setWatermark(event.target.value)} placeholder={language === "th" ? "พิมพ์ข้อความลายน้ำ" : "Type watermark text"} /></label> : <label>{language === "th" ? "ไฟล์โลโก้" : "LOGO FILE"}<input type="file" accept="image/png,image/jpeg,image/webp" aria-label={language === "th" ? "อัปโหลดโลโก้ลายน้ำ" : "Upload watermark logo"} onChange={(event) => { remember(); setWatermarkImage(event.target.files?.[0] ?? null); }} /></label>}</div>

          <div className="control-section"><span className="control-section-title">{language === "th" ? "ตำแหน่ง" : "POSITION"}</span><div className="toggle-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>{watermarkPositions.map((position) => <button type="button" key={position.value} className={watermarkPosition === position.value ? "active" : ""} aria-label={language === "th" ? position.th : position.en} onClick={() => { remember(); setWatermarkPosition(position.value); }}><span aria-hidden="true">{position.mark}</span></button>)}</div><small>{language === "th" ? "ลากจุดบนตัวอย่างเพื่อกำหนดตำแหน่งเอง" : "Drag the handle on the preview for a custom position."}</small></div>

          <div className="control-section"><span className="control-section-title">{language === "th" ? "รูปแบบ" : "STYLE"}</span><label>{language === "th" ? "ขนาด" : "SIZE"} · {watermarkSize}%<input aria-label={language === "th" ? "ขนาดลายน้ำ" : "Watermark size"} type="range" min="2" max="50" value={watermarkSize} onPointerDown={remember} onChange={(event) => setWatermarkSize(Number(event.target.value))} /></label><label>{language === "th" ? "ความทึบ" : "OPACITY"} · {watermarkOpacity}%<input aria-label={language === "th" ? "ความทึบลายน้ำ" : "Watermark opacity"} type="range" min="5" max="100" value={watermarkOpacity} onPointerDown={remember} onChange={(event) => setWatermarkOpacity(Number(event.target.value))} /></label><label>{language === "th" ? "การหมุน" : "ROTATION"} · {watermarkRotation}°<input aria-label={language === "th" ? "องศาลายน้ำ" : "Watermark rotation"} type="range" min="-180" max="180" value={watermarkRotation} onPointerDown={remember} onChange={(event) => setWatermarkRotation(Number(event.target.value))} /></label><label>{language === "th" ? "ระยะขอบ" : "MARGIN"} · {watermarkMargin}%<input aria-label={language === "th" ? "ระยะขอบลายน้ำ" : "Watermark margin"} type="range" min="0" max="15" value={watermarkMargin} onPointerDown={remember} onChange={(event) => setWatermarkMargin(Number(event.target.value))} /></label>{watermarkType === "text" && <><div className="field-pair"><label>{language === "th" ? "น้ำหนัก" : "WEIGHT"}<select value={watermarkWeight} onChange={(event) => { remember(); setWatermarkWeight(Number(event.target.value)); }}><option value="400">Regular</option><option value="600">Semi bold</option><option value="700">Bold</option><option value="900">Black</option></select></label><label>{language === "th" ? "สี" : "COLOR"}<input aria-label={language === "th" ? "สีลายน้ำ" : "Watermark color"} type="color" value={watermarkColor} onFocus={remember} onChange={(event) => setWatermarkColor(event.target.value)} /></label></div><label className="check-label"><input type="checkbox" checked={watermarkShadow} onChange={(event) => { remember(); setWatermarkShadow(event.target.checked); }} /> {language === "th" ? "เพิ่มเงาเพื่อให้อ่านง่าย" : "Add shadow for readability"}</label>{watermarkShadow && <label>{language === "th" ? "ความเข้มเงา" : "SHADOW"} · {watermarkShadowIntensity}%<input type="range" min="10" max="100" value={watermarkShadowIntensity} onPointerDown={remember} onChange={(event) => setWatermarkShadowIntensity(Number(event.target.value))} /></label>}</>}<label className="check-label"><input type="checkbox" checked={watermarkTile} onChange={(event) => { remember(); setWatermarkTile(event.target.checked); }} /> {language === "th" ? "ทำซ้ำเต็มภาพ" : "Repeat across image"}</label>{watermarkTile && <label>{language === "th" ? "ระยะห่าง" : "SPACING"} · {watermarkSpacing}%<input type="range" min="2" max="35" value={watermarkSpacing} onPointerDown={remember} onChange={(event) => setWatermarkSpacing(Number(event.target.value))} /></label>}</div>
        </>}

        <div className="control-section"><span className="control-section-title">{language === "th" ? "ส่งออก" : "OUTPUT"}</span><label>{language === "th" ? "รูปแบบ" : "FORMAT"}<select aria-label={language === "th" ? "รูปแบบ" : "FORMAT"} value={format} onChange={(event) => { remember(); setFormat(event.target.value as ImageFormat); }}><option value="image/webp">WEBP</option><option value="image/jpeg">JPG</option><option value="image/png">PNG</option>{avifSupported && <option value="image/avif">AVIF</option>}</select></label><div className="preset-row"><button onClick={() => applyQualityPreset(0.95)}>{language === "th" ? "สูงสุด" : "Maximum"}</button><button onClick={() => applyQualityPreset(0.82)}>{language === "th" ? "สมดุล" : "Balanced"}</button><button onClick={() => applyQualityPreset(0.72)}>Web</button><button onClick={() => applyQualityPreset(0.55)}>{language === "th" ? "ไฟล์เล็ก" : "Small"}</button></div><label>{language === "th" ? "คุณภาพ" : "QUALITY"} · {Math.round(quality * 100)}%<input type="range" min="35" max="100" value={Math.round(quality * 100)} onPointerDown={remember} onChange={(event) => setQuality(Number(event.target.value) / 100)} /></label></div>

        <div className="estimate"><span>{language === "th" ? "ต้นฉบับ" : "ORIGINAL"} <strong>{formatBytes(totalSize)}</strong></span><span>{language === "th" ? "ประมาณการ" : "ESTIMATED"} <strong>~{formatBytes(estimated)}</strong></span></div>
        <small className="estimate-note">{language === "th" ? `ค่าปัจจุบันใช้กับ ${targetImages.length} รูป · ขนาดจริงจะแสดงหลัง Export` : `Current settings apply to ${targetImages.length} image${targetImages.length === 1 ? "" : "s"}. Actual size is shown after export.`}</small>
        {localProcessing ? <button className="secondary-button danger-outline" onClick={() => abortRef.current?.abort()}>{language === "th" ? "ยกเลิก" : "Cancel"}</button> : <button className="primary-button" disabled={busy || !targetImages.length || (watermarkMode && watermarkType === "text" && !watermark.trim()) || (watermarkMode && watermarkType === "image" && !watermarkImage)} onClick={() => runImages(targetImages)}>{watermarkMode ? (language === "th" ? `ใส่ลายน้ำ ${targetImages.length} ไฟล์` : `WATERMARK ${targetImages.length > 1 ? `${targetImages.length} FILES` : "IMAGE"}`) : (language === "th" ? `ประมวลผล ${targetImages.length} ไฟล์` : `PROCESS ${targetImages.length > 1 ? `${targetImages.length} FILES` : "IMAGE"}`)} ↗</button>}
      </aside>
    </div>
  );
}
