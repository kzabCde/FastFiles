export type ImageFormat = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

export type ImageProcessOptions = {
  format: ImageFormat;
  quality: number;
  maxWidth?: number;
  maxHeight?: number;
  scalePercent?: number;
  cropSquare?: boolean;
  rotation?: 0 | 90 | 180 | 270;
  flipX?: boolean;
  flipY?: boolean;
  watermark?: string;
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

export async function processImage(file: File, options: ImageProcessOptions): Promise<ProcessedImage> {
  if (file.size <= 0) throw new Error("The image is empty.");
  const source = await loadImage(file);
  try {
    const original = dimensions(source);
    const square = Boolean(options.cropSquare);
    const sourceWidth = square ? Math.min(original.width, original.height) : original.width;
    const sourceHeight = square ? Math.min(original.width, original.height) : original.height;
    const sourceX = square ? (original.width - sourceWidth) / 2 : 0;
    const sourceY = square ? (original.height - sourceHeight) / 2 : 0;

    const percentage = Math.max(0.01, Math.min(1, (options.scalePercent ?? 100) / 100));
    const widthScale = options.maxWidth ? options.maxWidth / sourceWidth : 1;
    const heightScale = options.maxHeight ? options.maxHeight / sourceHeight : 1;
    const scale = Math.min(1, percentage, widthScale, heightScale);
    let targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    let targetHeight = Math.max(1, Math.round(sourceHeight * scale));

    if (options.preserveAspect === false) {
      if (options.maxWidth) targetWidth = Math.max(1, Math.round(options.maxWidth));
      if (options.maxHeight) targetHeight = Math.max(1, Math.round(options.maxHeight));
    }

    const rotation = options.rotation ?? 0;
    const swapped = rotation === 90 || rotation === 270;
    const canvas = document.createElement("canvas");
    canvas.width = swapped ? targetHeight : targetWidth;
    canvas.height = swapped ? targetWidth : targetHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available in this browser.");

    if (options.format === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.scale(options.flipX ? -1 : 1, options.flipY ? -1 : 1);
    context.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, -targetWidth / 2, -targetHeight / 2, targetWidth, targetHeight);
    context.restore();

    if (options.watermark?.trim()) {
      context.save();
      const fontSize = Math.max(16, Math.round(Math.min(canvas.width, canvas.height) * 0.055));
      context.font = `700 ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
      context.textAlign = "right";
      context.textBaseline = "bottom";
      context.fillStyle = "rgba(20, 20, 16, 0.38)";
      context.fillText(options.watermark.trim(), canvas.width - fontSize * 0.65, canvas.height - fontSize * 0.55);
      context.restore();
    }

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
