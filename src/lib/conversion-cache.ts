import type { ConversionResult } from "./garmin-converter";

const DB_NAME = "garmin-ai-export";
const DB_VERSION = 1;
const STORE_NAME = "conversion-cache";
const LATEST_RESULT_ID = "latest";

type ConversionCacheRecord = {
  blob?: Blob;
  buffer?: ArrayBuffer;
  files: ConversionResult["files"];
  filename: string;
  id: typeof LATEST_RESULT_ID;
  savedAt: number;
  warnings: string[];
};

export async function saveConversionForPayment(
  result: ConversionResult,
): Promise<void> {
  const buffer = await result.blob.arrayBuffer();
  const db = await openConversionDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    await requestToPromise(
      transaction.objectStore(STORE_NAME).put({
        buffer,
        files: result.files,
        filename: result.filename,
        id: LATEST_RESULT_ID,
        savedAt: Date.now(),
        warnings: result.warnings,
      } satisfies ConversionCacheRecord),
    );
  } finally {
    db.close();
  }
}

export async function loadConversionForPayment(): Promise<ConversionResult | null> {
  const db = await openConversionDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const record = await requestToPromise<ConversionCacheRecord | undefined>(
      transaction.objectStore(STORE_NAME).get(LATEST_RESULT_ID),
    );

    if (!record) {
      return null;
    }

    const blob = record.buffer
      ? new Blob([record.buffer], { type: "application/zip" })
      : record.blob;

    if (!blob) {
      return null;
    }

    return {
      blob,
      filename: record.filename,
      files: record.files,
      warnings: record.warnings,
    };
  } finally {
    db.close();
  }
}

export async function clearConversionForPayment(): Promise<void> {
  const db = await openConversionDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    await requestToPromise(transaction.objectStore(STORE_NAME).delete(LATEST_RESULT_ID));
  } finally {
    db.close();
  }
}

function openConversionDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("Browser storage is not available for the payment return flow."),
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Unable to open browser storage."));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Browser storage request failed."));
  });
}
