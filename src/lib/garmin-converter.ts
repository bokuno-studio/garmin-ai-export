import saveAs from "file-saver";
import {
  convertGarminExportCore,
  isZipFile,
  type ConversionBufferResult,
  type ConversionProgress,
  type ConversionResult,
} from "./garmin-converter-core";

export { isZipFile, type ConversionProgress, type ConversionResult };

type WorkerRequest = {
  type: "convert";
  file: File;
};

type WorkerResponse =
  | {
      type: "progress";
      progress: ConversionProgress;
    }
  | {
      type: "done";
      result: ConversionBufferResult;
    }
  | {
      type: "error";
      message: string;
    };

let activeWorker: Worker | null = null;
let activeReject: ((error: Error) => void) | null = null;

export async function convertGarminExport(
  file: File,
  onProgress?: (progress: ConversionProgress) => void,
): Promise<ConversionResult> {
  if (canUseWorker()) {
    return convertGarminExportInWorker(file, onProgress);
  }

  return convertGarminExportCore(file, onProgress);
}

export function abortConversion(): void {
  activeWorker?.terminate();
  activeWorker = null;
  activeReject?.(new DOMException("Conversion aborted.", "AbortError"));
  activeReject = null;
}

export function downloadConversion(result: ConversionResult): void {
  saveAs(result.blob, result.filename);
}

function canUseWorker(): boolean {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

function convertGarminExportInWorker(
  file: File,
  onProgress?: (progress: ConversionProgress) => void,
): Promise<ConversionResult> {
  return new Promise((resolve, reject) => {
    abortConversion();

    const worker = new Worker(
      new URL("../workers/garmin-converter.worker.ts", import.meta.url),
      { type: "module" },
    );
    activeWorker = worker;
    activeReject = reject;

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;

      if (message.type === "progress") {
        onProgress?.(message.progress);
        return;
      }

      worker.terminate();
      if (activeWorker === worker) {
        activeWorker = null;
        activeReject = null;
      }

      if (message.type === "done") {
        const { buffer, ...result } = message.result;
        resolve({
          ...result,
          blob: new Blob([buffer], { type: "application/zip" }),
        });
      } else {
        reject(new Error(message.message));
      }
    };

    worker.onerror = (event) => {
      worker.terminate();
      if (activeWorker === worker) {
        activeWorker = null;
        activeReject = null;
      }
      reject(new Error(event.message || "Conversion worker failed."));
    };

    worker.postMessage({ type: "convert", file } satisfies WorkerRequest);
  });
}
