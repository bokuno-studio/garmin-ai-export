import {
  convertGarminExportCoreBuffer,
  type ConversionBufferResult,
  type ConversionProgress,
} from "@/lib/garmin-converter-core";

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

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  void convertGarminExportCoreBuffer(message.file, (progress) => {
    self.postMessage({ type: "progress", progress } satisfies WorkerResponse);
  })
    .then((result) => {
      self.postMessage({ type: "done", result } satisfies WorkerResponse, {
        transfer: [result.buffer],
      });
    })
    .catch((error: unknown) => {
      self.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      } satisfies WorkerResponse);
    });
};

export {};
