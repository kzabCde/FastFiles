export type ImageFormat = "image/jpeg" | "image/png" | "image/webp";

export type ImageProcessOptions = {
  format: ImageFormat;
  quality: number;
  maxWidth?: number;
  maxHeight?: number;
  cropSquare?: boolean;
  rotation?: 0 | 90 | 180 | 270;
  flipX?: boolean;
  flipY?: boolean;
  watermark?: string;
};

export type ProcessedImage = {
  name: string;
  blob: Blob;
  originalSize: number;
};

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) return createImageBitmap(file);
  const image = new Image();
  const url = URL.createObjectURL(file);
  image.src = url;
  await image.decode();
  URL.revokeObjectURL(url);
  return image;
}

function dimensions(source: ImageBitmap | HTMLImageElement) {
  return {
    width: "naturalWidth" in source ? source.naturalWidth : source.width,
    height: "naturalHeight" in source ? source.naturalHeight : source.height,
  };
}

function toBlob(canvas: HTMLCanvasElement, type: ImageFormat, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Unable to export image."))), type, quality);
  });
}

export async function processImage(file: File, options: ImageProcessOptions): Promise<ProcessedImage> {
  const source = await loadImage(file);
  const original = dimensions(source);
  const square = Boolean(options.cropSquare);
  const sourceWidth = square ? Math.min(original.width, original.height) : original.width;
  const sourceHeight = square ? Math.min(original.width, original.height) : original.height;
  const sourceX = square ? (original.width - sourceWidth) / 2 : 0;
  const sourceY = square ? (original.height - sourceHeight) / 2 : 0;

  const widthScale = options.maxWidth ? options.maxWidth / sourceWidth : 1;
  const heightScale = options.maxHeight ? options.maxHeight / sourceHeight : 1;
  const scale = Math.min(1, widthScale, heightScale);
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
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
  if ("close" in source && typeof source.close === "function") source.close();
  const extension = options.format === "image/jpeg" ? "jpg" : options.format === "image/png" ? "png" : "webp";
  return { name: `${file.name.replace(/\.[^.]+$/, "") || "image"}.${extension}`, blob, originalSize: file.size };
}

export async function processImages(files: File[], options: ImageProcessOptions, onProgress?: (done: number, total: number) => void) {
  const results: ProcessedImage[] = [];
  for (let index = 0; index < files.length; index += 1) {
    results.push(await processImage(files[index], options));
    onProgress?.(index + 1, files.length);
  }
  return results;
}
