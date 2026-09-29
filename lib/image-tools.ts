import {
  ImageWorkerInfrastructureError,
  ImageWorkerSession,
  imageWorkerSupported,
  type WorkerImageOptions,
} from "@/lib/image-worker-client";

export type ImageFormat = "image/jpeg" | "image/png" | "image/webp" | "image/avif";
export type WatermarkPosition = "top-left" | "top-center" | "top-right" | "center-left" | "center" | "center-right" | "bottom-left" | "bottom-center" | "bottom-right" | "custom";

export type ImageProcessOptions = {
  format: ImageFormat;
  quality: number;
  maxWidth?: number;
  maxHeight?: number;
  scalePercent?: number;
  cropSquare?: boolean;
  cropAspect?: number;
  cropRect?: { x: number; y: number; width: number; height: number };
  cropCenterX?: number;
  cropCenterY?: number;
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  watermark?: string;
  watermarkOpacity?: number;
  watermarkColor?: string;
  watermarkSize?: number;
  watermarkMargin?: number;
  watermarkPosition?: WatermarkPosition;
  watermarkShadow?: boolean;
  watermarkShadowIntensity?: number;
  watermarkWeight?: number;
  watermarkRotation?: number;
  watermarkX?: number;
  watermarkY?: number;
  watermarkTile?: boolean;
  watermarkSpacing?: number;
  watermarkImage?: File;
  preserveAspect?: boolean;
};

export type ProcessedImage = {
  name: string;
  blob: Blob;
  originalSize: number;
  source: File;
};

export type ImageFailure = {
  file: File;
  error: string;
};

export type BatchImageResult = {
  outputs: ProcessedImage[];
  failures: ImageFailure[];
  cancelled: boolean;
};

export type PixelCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
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

function dimensions(source: ImageBitmap | HTMLImageElement) {
  return {
    width: "naturalWidth" in source ? source.naturalWidth : source.width,
    height: "naturalHeight" in source ? source.naturalHeight : source.height,
  };
}

export function getAspectCropRect(
  width: number,
  height: number,
  aspect?: number,
  centerX = 0.5,
  centerY = 0.5,
): PixelCropRect {
  if (!width || !height || !aspect || !Number.isFinite(aspect) || aspect <= 0) {
    return { x: 0, y: 0, width: Math.max(0, width), height: Math.max(0, height) };
  }

  let cropWidth = width;
  let cropHeight = height;
  if (width / height > aspect) cropWidth = height * aspect;
  else cropHeight = width / aspect;

  const wantedX = Math.min(1, Math.max(0, centerX)) * width - cropWidth / 2;
  const wantedY = Math.min(1, Math.max(0, centerY)) * height - cropHeight / 2;
  const x = Math.min(Math.max(0, wantedX), Math.max(0, width - cropWidth));
  const y = Math.min(Math.max(0, wantedY), Math.max(0, height - cropHeight));
  return { x, y, width: cropWidth, height: cropHeight };
}

export async function probeImage(file: File) {
  const source = await loadImage(file);
  try {
    return dimensions(source);
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
  }
}

function toBlob(canvas: HTMLCanvasElement, type: ImageFormat, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Unable to export image in the selected format."))), type, quality);
  });
}

export async function supportsImageFormat(type: ImageFormat) {
  if (type !== "image/avif") return true;
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.8));
  return blob?.type === type;
}

export function drawTextWatermark(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string,
  options: Pick<ImageProcessOptions, "watermarkOpacity" | "watermarkColor" | "watermarkSize" | "watermarkMargin" | "watermarkPosition" | "watermarkShadow" | "watermarkShadowIntensity" | "watermarkWeight" | "watermarkRotation" | "watermarkX" | "watermarkY" | "watermarkTile" | "watermarkSpacing">,
) {
  const value = text.trim();
  if (!value || !width || !height) return;

  const opacity = Math.min(1, Math.max(0.05, options.watermarkOpacity ?? 0.38));
  const sizeRatio = Math.min(0.5, Math.max(0.02, options.watermarkSize ?? 0.055));
  const marginRatio = Math.min(0.2, Math.max(0, options.watermarkMargin ?? 0.035));
  const position = options.watermarkPosition ?? "bottom-right";
  const fontSize = Math.max(12, Math.round(Math.min(width, height) * sizeRatio));
  const margin = Math.max(4, Math.round(Math.min(width, height) * marginRatio));
  const maxWidth = Math.max(1, width - margin * 2);

  let x = width / 2;
  let y = height / 2;
  let align: CanvasTextAlign = "center";
  let baseline: CanvasTextBaseline = "middle";

  if (position.endsWith("left")) { x = margin; align = "left"; }
  if (position.endsWith("right")) { x = width - margin; align = "right"; }
  if (position.startsWith("top")) { y = margin; baseline = "top"; }
  if (position.startsWith("bottom")) { y = height - margin; baseline = "bottom"; }

  if (position === "custom") {
    x = Math.min(1, Math.max(0, options.watermarkX ?? 0.5)) * width;
    y = Math.min(1, Math.max(0, options.watermarkY ?? 0.5)) * height;
    align = "center";
    baseline = "middle";
  }

  context.save();
  context.globalAlpha = opacity;
  context.font = `${Math.min(900, Math.max(300, options.watermarkWeight ?? 700))} ${fontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
  context.textAlign = align;
  context.textBaseline = baseline;
  context.fillStyle = options.watermarkColor || "#141410";
  if (options.watermarkShadow) {
    context.shadowColor = "rgba(0, 0, 0, 0.45)";
    context.shadowBlur = Math.max(2, Math.round(fontSize * 0.2 * (options.watermarkShadowIntensity ?? 0.7)));
    context.shadowOffsetY = Math.max(1, Math.round(fontSize * 0.05));
  }

  const drawAt = (drawX: number, drawY: number) => {
    context.save();
    context.translate(drawX, drawY);
    context.rotate(((options.watermarkRotation ?? 0) * Math.PI) / 180);
    context.fillText(value, 0, 0, maxWidth);
    context.restore();
  };

  if (options.watermarkTile) {
    context.textAlign = "center";
    context.textBaseline = "middle";
    const measured = Math.max(fontSize * 2, context.measureText(value).width);
    const spacing = Math.max(fontSize, Math.min(width, height) * (options.watermarkSpacing ?? 0.12));
    const stepX = measured + spacing;
    const stepY = fontSize * 2.2 + spacing;
    for (let drawY = -stepY; drawY <= height + stepY; drawY += stepY) {
      for (let drawX = -stepX; drawX <= width + stepX; drawX += stepX) drawAt(drawX, drawY);
    }
  } else {
    context.translate(x, y);
    context.rotate(((options.watermarkRotation ?? 0) * Math.PI) / 180);
    context.fillText(value, 0, 0, maxWidth);
  }
  context.restore();
}

export function getRotatedBounds(width: number, height: number, rotation = 0) {
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  return {
    width: width * cosine + height * sine,
    height: width * sine + height * cosine,
  };
}

function normalizedCropRect(width: number, height: number, rect?: ImageProcessOptions["cropRect"]): PixelCropRect | undefined {
  if (!rect) return undefined;
  const x = Math.min(1, Math.max(0, rect.x));
  const y = Math.min(1, Math.max(0, rect.y));
  const cropWidth = Math.min(1 - x, Math.max(0.01, rect.width));
  const cropHeight = Math.min(1 - y, Math.max(0.01, rect.height));
  return { x: x * width, y: y * height, width: cropWidth * width, height: cropHeight * height };
}

export async function drawImageWatermark(context: CanvasRenderingContext2D, width: number, height: number, file: File, options: ImageProcessOptions) {
  const source = await loadImage(file);
  try {
    const original = dimensions(source);
    const targetWidth = Math.max(12, width * Math.min(0.8, Math.max(0.02, options.watermarkSize ?? 0.18)));
    const targetHeight = targetWidth * (original.height / Math.max(1, original.width));
    const opacity = Math.min(1, Math.max(0.05, options.watermarkOpacity ?? 0.5));
    const rotation = ((options.watermarkRotation ?? 0) * Math.PI) / 180;
    const spacing = Math.max(12, Math.min(width, height) * (options.watermarkSpacing ?? 0.12));
    const position = options.watermarkPosition ?? "bottom-right";
    const margin = Math.max(4, Math.min(width, height) * (options.watermarkMargin ?? 0.035));
    let x = width / 2;
    let y = height / 2;
    if (position.endsWith("left")) x = margin + targetWidth / 2;
    if (position.endsWith("right")) x = width - margin - targetWidth / 2;
    if (position.startsWith("top")) y = margin + targetHeight / 2;
    if (position.startsWith("bottom")) y = height - margin - targetHeight / 2;
    if (position === "custom") {
      x = Math.min(1, Math.max(0, options.watermarkX ?? 0.5)) * width;
      y = Math.min(1, Math.max(0, options.watermarkY ?? 0.5)) * height;
    }
    const drawAt = (drawX: number, drawY: number) => {
      context.save();
      context.globalAlpha = opacity;
      context.translate(drawX, drawY);
      context.rotate(rotation);
      context.drawImage(source, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
      context.restore();
    };
    if (options.watermarkTile) {
      for (let drawY = -targetHeight; drawY <= height + targetHeight; drawY += targetHeight + spacing) {
        for (let drawX = -targetWidth; drawX <= width + targetWidth; drawX += targetWidth + spacing) drawAt(drawX, drawY);
      }
    } else drawAt(x, y);
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
  }
}

export async function processImage(file: File, options: ImageProcessOptions): Promise<ProcessedImage> {
  if (file.size <= 0) throw new Error("The image is empty.");
  const source = await loadImage(file);
  try {
    const original = dimensions(source);
    const rotation = options.rotation ?? 0;
    const bounds = getRotatedBounds(original.width, original.height, rotation);
    const transformedWidth = bounds.width;
    const transformedHeight = bounds.height;
    const cropAspect = options.cropSquare ? 1 : options.cropAspect;
    const crop = normalizedCropRect(transformedWidth, transformedHeight, options.cropRect) ?? getAspectCropRect(
      transformedWidth,
      transformedHeight,
      cropAspect,
      options.cropCenterX ?? 0.5,
      options.cropCenterY ?? 0.5,
    );

    const percentage = Math.max(0.01, Math.min(1, (options.scalePercent ?? 100) / 100));
    const widthScale = options.maxWidth ? options.maxWidth / Math.max(1, crop.width) : 1;
    const heightScale = options.maxHeight ? options.maxHeight / Math.max(1, crop.height) : 1;
    const scale = Math.min(1, percentage, widthScale, heightScale);
    let targetWidth = Math.max(1, Math.round(crop.width * scale));
    let targetHeight = Math.max(1, Math.round(crop.height * scale));

    if (options.preserveAspect === false) {
      if (options.maxWidth) targetWidth = Math.max(1, Math.round(options.maxWidth));
      if (options.maxHeight) targetHeight = Math.max(1, Math.round(options.maxHeight));
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available in this browser.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    if (options.format === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.save();
    context.scale(targetWidth / Math.max(1, crop.width), targetHeight / Math.max(1, crop.height));
    context.translate(-crop.x, -crop.y);
    context.translate(transformedWidth / 2, transformedHeight / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.scale(options.flipX ? -1 : 1, options.flipY ? -1 : 1);
    context.drawImage(source, -original.width / 2, -original.height / 2, original.width, original.height);
    context.restore();

    if (options.watermarkImage) await drawImageWatermark(context, canvas.width, canvas.height, options.watermarkImage, options);
    else if (options.watermark?.trim()) drawTextWatermark(context, canvas.width, canvas.height, options.watermark, options);

    const blob = await toBlob(canvas, options.format, options.quality);
    if (!blob.size) throw new Error("The browser produced an empty image.");
    const extension = options.format === "image/jpeg" ? "jpg" : options.format === "image/png" ? "png" : options.format === "image/avif" ? "avif" : "webp";
    return { name: `${stripExtension(file.name)}.${extension}`, blob, originalSize: file.size, source: file };
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
  }
}

function workerOptions(options: ImageProcessOptions): WorkerImageOptions {
  return {
    format: options.format,
    quality: options.quality,
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight,
    scalePercent: options.scalePercent,
    cropSquare: options.cropSquare,
    cropAspect: options.cropAspect,
    cropRect: options.cropRect,
    cropCenterX: options.cropCenterX,
    cropCenterY: options.cropCenterY,
    rotation: options.rotation,
    flipX: options.flipX,
    flipY: options.flipY,
    preserveAspect: options.preserveAspect,
  };
}

function canAccelerate(options: ImageProcessOptions) {
  return imageWorkerSupported() && !options.watermarkImage && !options.watermark?.trim();
}

export async function processImagesSettled(
  files: File[],
  options: ImageProcessOptions,
  onProgress?: (done: number, total: number, file: File) => void,
  signal?: AbortSignal,
): Promise<BatchImageResult> {
  const outputs: ProcessedImage[] = [];
  const failures: ImageFailure[] = [];
  let worker: ImageWorkerSession | null = null;
  let workerHealthy = false;

  if (canAccelerate(options)) {
    try {
      worker = new ImageWorkerSession();
      workerHealthy = true;
    } catch {
      worker = null;
    }
  }

  try {
    for (let index = 0; index < files.length; index += 1) {
      if (signal?.aborted) return { outputs, failures, cancelled: true };
      const file = files[index];
      try {
        if (worker && workerHealthy) {
          const processed = await worker.process(file, workerOptions(options), signal);
          outputs.push({ ...processed, source: file });
        } else {
          outputs.push(await processImage(file, options));
        }
      } catch (error) {
        if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return { outputs, failures, cancelled: true };
        }

        if (error instanceof ImageWorkerInfrastructureError) {
          workerHealthy = false;
          worker?.terminate();
          worker = null;
          try {
            outputs.push(await processImage(file, options));
          } catch (fallbackError) {
            failures.push({ file, error: fallbackError instanceof Error ? fallbackError.message : "Unable to process this image." });
          }
        } else {
          failures.push({ file, error: error instanceof Error ? error.message : "Unable to process this image." });
        }
      }
      onProgress?.(index + 1, files.length, file);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  } finally {
    worker?.terminate();
  }

  return { outputs, failures, cancelled: false };
}

export async function processImages(files: File[], options: ImageProcessOptions, onProgress?: (done: number, total: number) => void) {
  const result = await processImagesSettled(files, options, (done, total) => onProgress?.(done, total));
  if (result.failures.length) throw new Error(result.failures[0].error);
  return result.outputs;
}

function stripExtension(name: string) {
  return name.replace(/\.[^.]+$/, "") || "image";
}
