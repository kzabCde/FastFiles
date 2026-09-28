import {
  processImagesSettled,
  type BatchImageResult,
  type ImageFailure,
  type ImageProcessOptions,
  type ProcessedImage,
} from "@/lib/image-tools";

type WorkerSuccess = {
  id: string;
  ok: true;
  result: { name: string; blob: Blob; originalSize: number };
};

type WorkerFailure = {
  id: string;
  ok: false;
  error: string;
  infrastructure?: boolean;
};

type WorkerResponse = WorkerSuccess | WorkerFailure;

class WorkerInfrastructureError extends Error {}

function canUseWorker(options: ImageProcessOptions) {
  if (typeof window === "undefined" || typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return false;
  if (!("convertToBlob" in OffscreenCanvas.prototype)) return false;
  if (options.watermarkImage || options.watermark?.trim()) return false;
  return true;
}

function createProcessorWorker() {
  return new Worker(new URL("../workers/image-processor.worker.ts", import.meta.url), {
    type: "module",
    name: "fastfiles-image-processor",
  });
}

function workerOptions(options: ImageProcessOptions) {
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

function processWithWorker(worker: Worker, file: File, options: ImageProcessOptions, signal?: AbortSignal): Promise<ProcessedImage> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let settled = false;

    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };

    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id || settled) return;
      settled = true;
      cleanup();
      if (event.data.ok) {
        resolve({ ...event.data.result, source: file });
        return;
      }
      if (event.data.infrastructure) reject(new WorkerInfrastructureError(event.data.error));
      else reject(new Error(event.data.error));
    };

    const onError = () => finishReject(new WorkerInfrastructureError("Image worker failed to start."));
    const onAbort = () => finishReject(new DOMException("Image processing cancelled.", "AbortError"));

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError, { once: true });
    signal?.addEventListener("abort", onAbort, { once: true });

    if (signal?.aborted) {
      onAbort();
      return;
    }

    try {
      worker.postMessage({ id, file, options: workerOptions(options) });
    } catch {
      finishReject(new WorkerInfrastructureError("Image worker is unavailable."));
    }
  });
}

export async function processImagesSettledAccelerated(
  files: File[],
  options: ImageProcessOptions,
  onProgress?: (done: number, total: number, file: File) => void,
  signal?: AbortSignal,
): Promise<BatchImageResult> {
  if (!files.length) return { outputs: [], failures: [], cancelled: false };
  if (!canUseWorker(options)) return processImagesSettled(files, options, onProgress, signal);

  let worker: Worker;
  try {
    worker = createProcessorWorker();
  } catch {
    return processImagesSettled(files, options, onProgress, signal);
  }

  const outputs: ProcessedImage[] = [];
  const failures: ImageFailure[] = [];
  let workerHealthy = true;

  try {
    for (let index = 0; index < files.length; index += 1) {
      if (signal?.aborted) return { outputs, failures, cancelled: true };
      const file = files[index];
      try {
        if (workerHealthy) {
          outputs.push(await processWithWorker(worker, file, options, signal));
        } else {
          const fallback = await processImagesSettled([file], options, undefined, signal);
          if (fallback.outputs[0]) outputs.push(fallback.outputs[0]);
          if (fallback.failures[0]) failures.push(fallback.failures[0]);
        }
      } catch (error) {
        if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          return { outputs, failures, cancelled: true };
        }
        if (error instanceof WorkerInfrastructureError) {
          workerHealthy = false;
          worker.terminate();
          const fallback = await processImagesSettled([file], options, undefined, signal);
          if (fallback.outputs[0]) outputs.push(fallback.outputs[0]);
          if (fallback.failures[0]) failures.push(fallback.failures[0]);
        } else {
          failures.push({ file, error: error instanceof Error ? error.message : "Unable to process this image." });
        }
      }
      onProgress?.(index + 1, files.length, file);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  } finally {
    if (workerHealthy) worker.terminate();
  }

  return { outputs, failures, cancelled: false };
}
