export type WorkerImageOptions = {
  format: "image/jpeg" | "image/png" | "image/webp" | "image/avif";
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

export type WorkerProcessedImage = {
  name: string;
  blob: Blob;
  originalSize: number;
};

type WorkerSuccess = {
  id: string;
  ok: true;
  result: WorkerProcessedImage;
};

type WorkerFailure = {
  id: string;
  ok: false;
  error: string;
  infrastructure?: boolean;
};

type WorkerResponse = WorkerSuccess | WorkerFailure;

export class ImageWorkerInfrastructureError extends Error {}

function canvasEncoderIsNative() {
  if (typeof HTMLCanvasElement === "undefined") return true;
  try {
    return /\[native code\]/.test(Function.prototype.toString.call(HTMLCanvasElement.prototype.toBlob));
  } catch {
    return true;
  }
}

export function imageWorkerSupported() {
  return typeof window !== "undefined"
    && typeof Worker !== "undefined"
    && typeof OffscreenCanvas !== "undefined"
    && "convertToBlob" in OffscreenCanvas.prototype
    && canvasEncoderIsNative();
}

export class ImageWorkerSession {
  private readonly worker: Worker;
  private terminated = false;

  constructor() {
    this.worker = new Worker(new URL("../workers/image-processor.worker.ts", import.meta.url), {
      type: "module",
      name: "fastfiles-image-processor",
    });
  }

  process(file: File, options: WorkerImageOptions, signal?: AbortSignal): Promise<WorkerProcessedImage> {
    if (this.terminated) return Promise.reject(new ImageWorkerInfrastructureError("Image worker is unavailable."));

    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let settled = false;

      const cleanup = () => {
        this.worker.removeEventListener("message", onMessage);
        this.worker.removeEventListener("error", onError);
        signal?.removeEventListener("abort", onAbort);
      };

      const rejectOnce = (error: Error) => {
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
          resolve(event.data.result);
          return;
        }
        if (event.data.infrastructure) reject(new ImageWorkerInfrastructureError(event.data.error));
        else reject(new Error(event.data.error));
      };

      const onError = () => rejectOnce(new ImageWorkerInfrastructureError("Image worker failed to start."));
      const onAbort = () => rejectOnce(new DOMException("Image processing cancelled.", "AbortError"));

      this.worker.addEventListener("message", onMessage);
      this.worker.addEventListener("error", onError, { once: true });
      signal?.addEventListener("abort", onAbort, { once: true });

      if (signal?.aborted) {
        onAbort();
        return;
      }

      try {
        this.worker.postMessage({ id, file, options });
      } catch {
        rejectOnce(new ImageWorkerInfrastructureError("Image worker is unavailable."));
      }
    });
  }

  terminate() {
    if (this.terminated) return;
    this.terminated = true;
    this.worker.terminate();
  }
}
