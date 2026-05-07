import {
  convertGarminExportCore,
  type ConversionProgress,
  type ConversionResult,
} from "@/lib/garmin-converter-core";

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
      result: ConversionResult;
    }
  | {
      type: "error";
      message: string;
    };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type !== "convert") {
    return;
  }

  void convertGarminExportCore(message.file, (progress) => {
    self.postMessage({ type: "progress", progress } satisfies WorkerResponse);
  })
    .then((result) => {
      self.postMessage({ type: "done", result } satisfies WorkerResponse);
    })
    .catch((error: unknown) => {
      self.postMessage({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      } satisfies WorkerResponse);
    });
};

export {};
