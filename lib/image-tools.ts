export type ImageFormat = "image/jpeg" | "image/png" | "image/webp" | "image/avif";
export type WatermarkPosition = "top-left" | "top-center" | "top-right" | "center-left" | "center" | "center-right" | "bottom-left" | "bottom-center" | "bottom-right";

export type ImageProcessOptions = {
  format: ImageFormat;
  quality: number;
  maxWidth?: number;
  maxHeight?: number;
  scalePercent?: number;
  cropSquare?: boolean;
  cropAspect?: number;
  cropCenterX?: number;
  cropCenterY?: number;
  rotation?: 0 | 90 | 180 | 270;
  flipX?: boolean;
  flipY?: boolean;
  watermark?: string;
  watermarkOpacity?: number;
  watermarkColor?: string;
  watermarkSize?: number;
  watermarkMargin?: number;
  watermarkPosition?: WatermarkPosition;
  watermarkShadow?: boolean;
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
  options: Pick<ImageProcessOptions, "watermarkOpacity" | "watermarkColor" | "watermarkSize" | "watermarkMargin" | "watermarkPosition" | "watermarkShadow">,
) {
  const value = text.trim();
  if (!value || !width || !height) return;

  const opacity = Math.min(1, Math.max(0.05, options.watermarkOpacity ?? 0.38));
  const sizeRatio = Math.min(0.22, Math.max(0.02, options.watermarkSize ?? 0.055));
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

  context.save();
  context.globalAlpha = opacity;
  context.font = `700 ${fontSize}px ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`;
  context.textAlign = align;
  context.textBaseline = baseline;
  context.fillStyle = options.watermarkColor || "#141410";
  if (options.watermarkShadow) {
    context.shadowColor = "rgba(0, 0, 0, 0.45)";
    context.shadowBlur = Math.max(2, Math.round(fontSize * 0.14));
    context.shadowOffsetY = Math.max(1, Math.round(fontSize * 0.05));
  }
  context.fillText(value, x, y, maxWidth);
  context.restore();
}

export async function processImage(file: File, options: ImageProcessOptions): Promise<ProcessedImage> {
  if (file.size <= 0) throw new Error("The image is empty.");
  const source = await loadImage(file);
  try {
    const original = dimensions(source);
    const rotation = options.rotation ?? 0;
    const swapped = rotation === 90 || rotation === 270;
    const transformedWidth = swapped ? original.height : original.width;
    const transformedHeight = swapped ? original.width : original.height;
    const cropAspect = options.cropSquare ? 1 : options.cropAspect;
    const crop = getAspectCropRect(
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

    if (options.watermark?.trim()) drawTextWatermark(context, canvas.width, canvas.height, options.watermark, options);

    const blob = await toBlob(canvas, options.format, options.quality);
    if (!blob.size) throw new Error("The browser produced an empty image.");
    const extension = options.format === "image/jpeg" ? "jpg" : options.format === "image/png" ? "png" : options.format === "image/avif" ? "avif" : "webp";
    return { name: `${stripExtension(file.name)}.${extension}`, blob, originalSize: file.size, source: file };
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
  }
}

export async function processImagesSettled(
  files: File[],
  options: ImageProcessOptions,
  onProgress?: (done: number, total: number, file: File) => void,
  signal?: AbortSignal,
): Promise<BatchImageResult> {
  const outputs: ProcessedImage[] = [];
  const failures: ImageFailure[] = [];

  for (let index = 0; index < files.length; index += 1) {
    if (signal?.aborted) return { outputs, failures, cancelled: true };
    const file = files[index];
    try {
      outputs.push(await processImage(file, options));
    } catch (error) {
      failures.push({ file, error: error instanceof Error ? error.message : "Unable to process this image." });
    }
    onProgress?.(index + 1, files.length, file);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
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
