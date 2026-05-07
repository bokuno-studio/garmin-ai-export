import saveAs from "file-saver";
import {
  convertGarminExportCore,
  isZipFile,
  type ConversionBufferResult,
  type ConversionProgress,
  type ConversionResult,
} from "./garmin-converter-core";

export { isZipFile, type ConversionProgress, type ConversionResult };

type WorkerRequest =
  | {
      type: "convert";
      file: File;
    }
  | {
      type: "abort";
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

export async function convertGarminExport(
  file: File,
  onProgress?: (progress: ConversionProgress) => void,
): Promise<ConversionResult> {
  if (canUseWorker()) {
    return convertGarminExportInWorker(file, onProgress);
  }

  return convertGarminExportCore(file, onProgress);
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
    const worker = new Worker(
      new URL("../workers/garmin-converter.worker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;

      if (message.type === "progress") {
        onProgress?.(message.progress);
        return;
      }

      worker.terminate();

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
      reject(new Error(event.message || "Conversion worker failed."));
    };

    worker.postMessage({ type: "convert", file } satisfies WorkerRequest);
  });
}
