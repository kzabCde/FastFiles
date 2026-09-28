type WorkerImageFormat = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

type WorkerImageOptions = {
  format: WorkerImageFormat;
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
  preserveAspect?: boolean;
};

type WorkerRequest = {
  id: string;
  file: File;
  options: WorkerImageOptions;
};

type PixelCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function getRotatedBounds(width: number, height: number, rotation = 0) {
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));
  return {
    width: width * cosine + height * sine,
    height: width * sine + height * cosine,
  };
}

function getAspectCropRect(width: number, height: number, aspect?: number, centerX = 0.5, centerY = 0.5): PixelCropRect {
  if (!width || !height || !aspect || !Number.isFinite(aspect) || aspect <= 0) {
    return { x: 0, y: 0, width: Math.max(0, width), height: Math.max(0, height) };
  }

  let cropWidth = width;
  let cropHeight = height;
  if (width / height > aspect) cropWidth = height * aspect;
  else cropHeight = width / aspect;

  const wantedX = Math.min(1, Math.max(0, centerX)) * width - cropWidth / 2;
  const wantedY = Math.min(1, Math.max(0, centerY)) * height - cropHeight / 2;
  return {
    x: Math.min(Math.max(0, wantedX), Math.max(0, width - cropWidth)),
    y: Math.min(Math.max(0, wantedY), Math.max(0, height - cropHeight)),
    width: cropWidth,
    height: cropHeight,
  };
}

function normalizedCropRect(width: number, height: number, rect?: WorkerImageOptions["cropRect"]): PixelCropRect | undefined {
  if (!rect) return undefined;
  const x = Math.min(1, Math.max(0, rect.x));
  const y = Math.min(1, Math.max(0, rect.y));
  const cropWidth = Math.min(1 - x, Math.max(0.01, rect.width));
  const cropHeight = Math.min(1 - y, Math.max(0.01, rect.height));
  return { x: x * width, y: y * height, width: cropWidth * width, height: cropHeight * height };
}

function stripExtension(name: string) {
  return name.replace(/\.[^.]+$/, "") || "image";
}

async function processImage(file: File, options: WorkerImageOptions) {
  if (file.size <= 0) throw new Error("The image is empty.");
  if (typeof OffscreenCanvas === "undefined" || typeof createImageBitmap !== "function") {
    throw new Error("WORKER_UNAVAILABLE");
  }

  const source = await createImageBitmap(file);
  try {
    const original = { width: source.width, height: source.height };
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

    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("WORKER_UNAVAILABLE");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    if (options.format === "image/jpeg") {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, targetWidth, targetHeight);
    }

    context.save();
    context.scale(targetWidth / Math.max(1, crop.width), targetHeight / Math.max(1, crop.height));
    context.translate(-crop.x, -crop.y);
    context.translate(transformedWidth / 2, transformedHeight / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.scale(options.flipX ? -1 : 1, options.flipY ? -1 : 1);
    context.drawImage(source, -original.width / 2, -original.height / 2, original.width, original.height);
    context.restore();

    const blob = await canvas.convertToBlob({ type: options.format, quality: options.quality });
    if (!blob.size) throw new Error("The browser produced an empty image.");
    const extension = options.format === "image/jpeg" ? "jpg" : options.format === "image/png" ? "png" : options.format === "image/avif" ? "avif" : "webp";
    return { name: `${stripExtension(file.name)}.${extension}`, blob, originalSize: file.size };
  } finally {
    source.close();
  }
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const { id, file, options } = event.data;
  void processImage(file, options)
    .then((result) => {
      self.postMessage({ id, ok: true, result });
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : "Unable to process this image.";
      self.postMessage({ id, ok: false, error: message, infrastructure: message === "WORKER_UNAVAILABLE" });
    });
});
