"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  FileArchive,
  Loader2,
  LockKeyhole,
  MessageSquareText,
  RefreshCcw,
  ShieldCheck,
  Table2,
  UploadCloud,
  WalletCards,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  abortConversion,
  convertGarminExport,
  downloadConversion,
  isZipFile,
  type ConversionProgress,
  type ConversionResult,
} from "@/lib/garmin-converter";
import {
  clearConversionForPayment,
  loadConversionForPayment,
  saveConversionForPayment,
} from "@/lib/conversion-cache";

type AppState = "idle" | "processing" | "complete" | "error";
type PaymentState = "idle" | "creating" | "error";

const outputLabels: Record<string, string> = {
  "activities.csv": "Activities",
  "sleep.csv": "Sleep",
  "daily_health.csv": "Daily health",
  "laps.csv": "Laps",
};

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const runIdRef = useRef(0);
  const autoDownloadRef = useRef(false);
  const [state, setState] = useState<AppState>("idle");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<ConversionProgress | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paidAccess, setPaidAccess] = useState(false);
  const [paymentState, setPaymentState] = useState<PaymentState>("idle");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [restoringPayment, setRestoringPayment] = useState(false);

  useEffect(() => {
    if (!consumePaidReturn()) {
      return undefined;
    }

    let cancelled = false;

    void Promise.resolve().then(async () => {
      if (cancelled) {
        return;
      }

      setPaidAccess(true);
      setPaymentError(null);
      setRestoringPayment(true);
      setProgress({ phase: "done", message: "Payment confirmed" });

      try {
        const cachedResult = await loadConversionForPayment();
        if (cancelled) {
          return;
        }

        if (!cachedResult) {
          setState("error");
          setError(
            "Payment confirmed, but the converted ZIP was not found. Upload the Garmin ZIP again to download.",
          );
          return;
        }

        setSelectedFile(null);
        setResult(cachedResult);
        setState("complete");
        setProgress({
          phase: "done",
          message: "Payment confirmed. Downloading ZIP",
        });
      } catch (cacheError) {
        if (cancelled) {
          return;
        }

        setState("error");
        setError(
          cacheError instanceof Error
            ? cacheError.message
            : "Unable to restore the converted ZIP after payment.",
        );
      } finally {
        if (!cancelled) {
          setRestoringPayment(false);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!paidAccess || !result || autoDownloadRef.current) {
      return;
    }

    autoDownloadRef.current = true;
    downloadConversion(result);
    void clearConversionForPayment();
  }, [paidAccess, result]);

  async function handleFile(file: File | undefined) {
    if (!file || state === "processing") {
      return;
    }

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    autoDownloadRef.current = false;
    setSelectedFile(file);
    setResult(null);
    setError(null);
    setPaymentError(null);
    setPaymentState("idle");

    if (!isZipFile(file)) {
      setState("error");
      setError("Select a Garmin Connect ZIP export.");
      return;
    }

    try {
      setState("processing");
      setProgress({ phase: "reading", message: "Reading ZIP archive" });
      const conversion = await convertGarminExport(file, setProgress);
      if (runIdRef.current !== runId) {
        return;
      }
      if (!paidAccess) {
        setProgress({
          phase: "done",
          message: "Saving ZIP for payment return",
        });
        // Preflight browser storage so storage failures block payment, not download.
        await saveConversionForPayment(conversion);
      }
      setResult(conversion);
      setState("complete");
    } catch (conversionError) {
      if (runIdRef.current !== runId) {
        return;
      }
      setState("error");
      setError(
        conversionError instanceof Error
          ? conversionError.message
          : "Conversion failed.",
      );
    }
  }

  async function startPayment() {
    if (!result || paymentState === "creating") {
      return;
    }

    try {
      setPaymentState("creating");
      setPaymentError(null);

      const response = await fetch("/api/square/payment-link", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ intent: "create_payment_link" }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getPaymentErrorMessage(payload));
      }

      const url = getPaymentLinkUrl(payload);
      if (!url) {
        throw new Error("Payment link response was invalid.");
      }

      window.location.assign(url);
    } catch (paymentFailure) {
      setPaymentState("error");
      setPaymentError(
        paymentFailure instanceof Error
          ? paymentFailure.message
          : "Unable to open Square checkout.",
      );
    }
  }

  function openPicker() {
    if (isProcessing) {
      return;
    }
    inputRef.current?.click();
  }

  function reset() {
    runIdRef.current += 1;
    abortConversion();
    autoDownloadRef.current = false;
    setState("idle");
    setSelectedFile(null);
    setProgress(null);
    setResult(null);
    setError(null);
    setPaidAccess(false);
    setPaymentState("idle");
    setPaymentError(null);
    void clearConversionForPayment();
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  const isProcessing = state === "processing" || restoringPayment;
  const downloadableResult = result && paidAccess ? result : null;
  const canDownload = Boolean(downloadableResult);
  const isCreatingPayment = paymentState === "creating";

  return (
    <main className="min-h-screen bg-[#f7f8fb] text-[#101827]">
      <header className="border-b border-[#d8dee8] bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#104c3f] text-white">
              <FileArchive aria-hidden="true" size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-normal">
                Garmin AI Export
              </h1>
              <p className="truncate text-sm text-[#5b6472]">
                Browser-only CSV converter
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-[#bfd8cc] bg-[#eef8f2] px-3 py-2 text-sm font-medium text-[#0f513f] sm:flex">
            <ShieldCheck aria-hidden="true" size={17} />
            Local processing
          </div>
        </div>
      </header>

      <section className="border-b border-[#d8dee8] bg-white">
        <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-normal text-[#28735f]">
              Garmin data to AI-ready CSV
            </p>
            <h2 className="max-w-3xl text-2xl font-semibold tracking-normal text-[#101827] sm:text-3xl">
              Convert your Garmin Connect history into AI-ready CSVs for ChatGPT, Gemini, and Claude.
            </h2>
            <p className="max-w-3xl text-base leading-7 text-[#475467]">
              Upload the ZIP you exported from Garmin Connect. We process it entirely in your browser and produce a clean CSV bundle ready for AI analysis. Your Garmin data never leaves your device.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <HeroFact
              icon={<LockKeyhole aria-hidden="true" size={19} />}
              label="Local processing"
              value="ZIP parsing and CSV generation run in your browser"
            />
            <HeroFact
              icon={<WalletCards aria-hidden="true" size={19} />}
              label="Download fee"
              value="¥300 — Apple Pay & Google Pay supported"
            />
          </div>
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.2fr)_380px]">
        <div className="space-y-5">
          <section className="rounded-lg border border-[#d8dee8] bg-white shadow-sm">
            <div className="border-b border-[#e4e8ef] px-4 py-4 sm:px-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">ZIP input</h2>
                  <p className="text-sm text-[#667085]">
                    Garmin Connect export archive
                  </p>
                </div>
                {selectedFile ? (
                  <button
                    className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#ccd4df] bg-white px-3 text-sm font-medium text-[#243044] transition hover:bg-[#f1f4f8] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={isProcessing}
                    type="button"
                    onClick={reset}
                  >
                    <RefreshCcw aria-hidden="true" size={16} />
                    Reset
                  </button>
                ) : null}
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <input
                ref={inputRef}
                accept=".zip,application/zip,application/x-zip-compressed"
                className="sr-only"
                type="file"
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />

              <button
                className={[
                  "flex min-h-[300px] w-full flex-col items-center justify-center gap-5 rounded-lg border-2 border-dashed px-5 py-8 text-center transition",
                  dragActive
                    ? "border-[#28735f] bg-[#eef8f2]"
                    : "border-[#cbd5e1] bg-[#f8fafc] hover:border-[#28735f] hover:bg-[#f3fbf6]",
                  isProcessing ? "cursor-wait opacity-80" : "cursor-pointer",
                ].join(" ")}
                disabled={isProcessing}
                type="button"
                onClick={openPicker}
                onDragLeave={() => setDragActive(false)}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  if (isProcessing) {
                    return;
                  }
                  void handleFile(event.dataTransfer.files?.[0]);
                }}
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-white text-[#28735f] shadow-sm ring-1 ring-[#dbe3ed]">
                  {isProcessing ? (
                    <Loader2 aria-hidden="true" className="animate-spin" size={32} />
                  ) : (
                    <UploadCloud aria-hidden="true" size={32} />
                  )}
                </span>
                <span className="space-y-2">
                  <span className="block text-xl font-semibold">
                    {selectedFile ? selectedFile.name : "Select Garmin ZIP"}
                  </span>
                  <span className="block text-sm text-[#667085]">
                    {selectedFile
                      ? formatBytes(selectedFile.size)
                      : "Tap to choose a file"}
                  </span>
                </span>
              </button>

              {progress ? (
                <div className="mt-4 rounded-lg border border-[#d8dee8] bg-[#fbfcfe] p-4">
                  <div className="flex items-center gap-3">
                    {state === "complete" ? (
                      <CheckCircle2
                        aria-hidden="true"
                        className="shrink-0 text-[#188455]"
                        size={22}
                      />
                    ) : state === "error" ? (
                      <AlertCircle
                        aria-hidden="true"
                        className="shrink-0 text-[#b42318]"
                        size={22}
                      />
                    ) : (
                      <Loader2
                        aria-hidden="true"
                        className="shrink-0 animate-spin text-[#28735f]"
                        size={22}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{progress.message}</p>
                      <p className="text-xs uppercase text-[#667085]">
                        {progress.phase}
                      </p>
                    </div>
                    {progress.total ? (
                      <span className="rounded-full bg-[#e9eef5] px-2.5 py-1 text-xs font-semibold text-[#344054]">
                        {progress.current ?? 0}/{progress.total}
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className="mt-4 flex gap-3 rounded-lg border border-[#f2b8b5] bg-[#fff5f5] p-4 text-[#8a241d]">
                  <AlertCircle aria-hidden="true" className="mt-0.5 shrink-0" size={20} />
                  <p className="text-sm font-medium">{error}</p>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-lg border border-[#d8dee8] bg-white shadow-sm">
            <div className="border-b border-[#e4e8ef] px-4 py-4 sm:px-5">
              <h2 className="text-base font-semibold">How it works</h2>
              <p className="text-sm text-[#667085]">
                From Garmin export to AI-ready CSV in three steps.
              </p>
            </div>
            <div className="grid gap-3 p-4 sm:p-5 md:grid-cols-3">
              <GuideStep
                detail="Garmin Connect > Account > Data Management > Export Your Data"
                icon={<Database aria-hidden="true" size={19} />}
                label="Export from Garmin"
                step="1"
              />
              <GuideStep
                detail="Upload the ZIP here. We generate a CSV bundle entirely in your browser."
                icon={<FileArchive aria-hidden="true" size={19} />}
                label="Convert here"
                step="2"
              />
              <GuideStep
                detail="Upload the converted ZIP to ChatGPT, Gemini, or Claude and ask away."
                icon={<MessageSquareText aria-hidden="true" size={19} />}
                isLast
                label="Send to AI"
                step="3"
              />
            </div>
            <div className="border-t border-[#e4e8ef] px-4 py-4 sm:px-5">
              <a
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#ccd4df] bg-white px-3 text-sm font-semibold text-[#243044] transition hover:bg-[#f1f4f8]"
                href="https://www.garmin.com/en-US/account/datamanagement/exportdata/"
                rel="noreferrer"
                target="_blank"
              >
                Open Garmin export page
                <ExternalLink aria-hidden="true" size={16} />
              </a>
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-lg border border-[#d8dee8] bg-white shadow-sm">
            <div className="border-b border-[#e4e8ef] px-4 py-4">
              <h2 className="text-base font-semibold">Output ZIP</h2>
              <p className="text-sm text-[#667085]">CSV files for AI analysis</p>
            </div>
            <div className="divide-y divide-[#edf0f5]">
              {["activities.csv", "sleep.csv", "daily_health.csv", "laps.csv"].map(
                (filename) => {
                  const file = result?.files.find((item) => item.filename === filename);
                  return (
                    <div
                      className="flex min-h-[74px] items-center justify-between gap-4 px-4 py-3"
                      key={filename}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#eef3fa] text-[#24527a]">
                          <Table2 aria-hidden="true" size={19} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {outputLabels[filename]}
                          </p>
                          <p className="truncate text-xs text-[#667085]">{filename}</p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#f1f4f8] px-2.5 py-1 text-xs font-semibold text-[#344054]">
                        {file ? file.rows.toLocaleString() : "0"} rows
                      </span>
                    </div>
                  );
                },
              )}
            </div>
            <div className="border-t border-[#e4e8ef] p-4">
              <div className="mb-3 rounded-md border border-[#f6d58f] bg-[#fff9eb] p-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#6f4b00]">
                  <WalletCards aria-hidden="true" size={17} />
                  Download fee: ¥300
                </div>
                <p className="mt-1 text-sm text-[#7a5a16]">
                  Apple Pay and Google Pay are supported via Square checkout.
                </p>
              </div>
              {downloadableResult ? (
                <button
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#28735f] px-4 text-sm font-semibold text-white transition hover:bg-[#1f614f]"
                  type="button"
                  onClick={() => downloadConversion(downloadableResult)}
                >
                  <Download aria-hidden="true" size={18} />
                  Download ZIP
                </button>
              ) : (
                <button
                  className="inline-flex min-h-11 w-full flex-wrap items-center justify-center gap-2 rounded-md bg-[#28735f] px-4 text-center text-sm font-semibold text-white transition hover:bg-[#1f614f] disabled:cursor-not-allowed disabled:bg-[#aab7c2]"
                  disabled={!result || isCreatingPayment}
                  type="button"
                  onClick={() => void startPayment()}
                >
                  {isCreatingPayment ? (
                    <Loader2 aria-hidden="true" className="animate-spin" size={18} />
                  ) : (
                    <CreditCard aria-hidden="true" size={18} />
                  )}
                  {isCreatingPayment ? "Opening Square checkout" : "Pay \u00a5300 to Download"}
                </button>
              )}

              {paymentError ? (
                <div className="mt-3 flex gap-2 rounded-md border border-[#f2b8b5] bg-[#fff5f5] p-3 text-[#8a241d]">
                  <AlertCircle
                    aria-hidden="true"
                    className="mt-0.5 shrink-0"
                    size={17}
                  />
                  <p className="text-sm font-medium">{paymentError}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[#667085]">
                  {canDownload
                    ? "Payment confirmed. Download is unlocked."
                    : "Upload and convert a Garmin ZIP before opening Square checkout."}
                </p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-[#d8dee8] bg-white shadow-sm">
            <div className="border-b border-[#e4e8ef] px-4 py-4">
              <h2 className="text-base font-semibold">Status</h2>
            </div>
            <div className="space-y-3 p-4">
              <StatusRow
                active={state === "processing" || state === "complete"}
                complete={state === "complete"}
                label="Archive read"
              />
              <StatusRow
                active={state === "processing" || state === "complete"}
                complete={state === "complete"}
                label="CSV generated"
              />
              <StatusRow
                active={state === "complete"}
                complete={state === "complete"}
                label="ZIP ready"
              />
              <StatusRow
                active={paidAccess}
                complete={paidAccess}
                label="Payment confirmed"
              />
              {result?.warnings.length ? (
                <div className="rounded-md border border-[#f6d58f] bg-[#fff9eb] p-3 text-sm text-[#7a4d00]">
                  {result.warnings.slice(0, 3).map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                  {result.warnings.length > 3 ? (
                    <p>{result.warnings.length - 3} more conversion notes</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </section>
        </aside>
      </div>

      <section className="border-t border-[#d8dee8] bg-white">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="max-w-3xl space-y-3">
            <p className="text-sm font-semibold uppercase tracking-normal text-[#28735f]">
              Built for Garmin data analysis
            </p>
            <h2 className="text-xl font-semibold tracking-normal text-[#101827]">
              What is Garmin AI Export?
            </h2>
            <p className="text-base leading-7 text-[#475467]">
              Garmin AI Export converts the ZIP file you export from Garmin Connect into clean CSV files that AI tools can read directly. It extracts activity history, sleep, daily health, and lap data into a compact CSV bundle for ChatGPT, Gemini, Claude, or your own analysis workflow.
            </p>
            <p className="text-base leading-7 text-[#475467]">
              Conversion runs in your browser using local JavaScript. Your Garmin health data is not uploaded to a conversion server, and the generated ZIP is prepared on your device.
            </p>
          </div>

          <div>
            <h2 className="text-base font-semibold tracking-normal text-[#101827]">
              FAQ
            </h2>
            <div className="mt-3 divide-y divide-[#e4e8ef] border-y border-[#e4e8ef]">
              <FaqItem question="Where do I get the Garmin export ZIP?">
                Garmin Connect provides it from Account, Data Management, Export Your Data.
              </FaqItem>
              <FaqItem question="Is my Garmin data sent to a server?">
                No. The ZIP is parsed in your browser, and CSV generation happens on your device.
              </FaqItem>
              <FaqItem question="Which files are generated?">
                The converted bundle includes activities.csv, sleep.csv, daily_health.csv, and laps.csv when those records are available in the Garmin export.
              </FaqItem>
              <FaqItem question="What can I do with the CSV files?">
                Upload them to ChatGPT, Gemini, Claude, spreadsheet software, or another analysis tool to review training patterns, sleep trends, and daily health signals.
              </FaqItem>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatusRow({
  active,
  complete,
  label,
}: {
  active: boolean;
  complete: boolean;
  label: string;
}) {
  return (
    <div className="flex min-h-9 items-center gap-3">
      <span
        className={[
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
          complete
            ? "border-[#188455] bg-[#eaf7ef] text-[#188455]"
            : active
              ? "border-[#28735f] bg-[#eef8f2] text-[#28735f]"
              : "border-[#d8dee8] bg-[#f7f8fb] text-[#8b95a1]",
        ].join(" ")}
      >
        {complete ? (
          <CheckCircle2 aria-hidden="true" size={16} />
        ) : active ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={15} />
        ) : (
          <span className="h-2 w-2 rounded-full bg-current" />
        )}
      </span>
      <span className="text-sm font-medium text-[#344054]">{label}</span>
    </div>
  );
}

function HeroFact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-[92px] items-start gap-3 rounded-lg border border-[#d8dee8] bg-[#fbfcfe] p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#eaf7ef] text-[#28735f]">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#101827]">{label}</p>
        <p className="mt-1 text-sm leading-6 text-[#667085]">{value}</p>
      </div>
    </div>
  );
}

function GuideStep({
  detail,
  icon,
  isLast = false,
  label,
  step,
}: {
  detail: string;
  icon: ReactNode;
  isLast?: boolean;
  label: string;
  step: string;
}) {
  return (
    <div className="flex min-h-[176px] flex-col gap-3 rounded-lg border border-[#d8dee8] bg-[#fbfcfe] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#eef3fa] text-[#24527a]">
          {icon}
        </div>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#eaf7ef] text-sm font-semibold text-[#28735f]">
          {step}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[#101827]">{label}</h3>
        <p className="mt-2 text-sm leading-6 text-[#667085]">{detail}</p>
      </div>
      {isLast ? null : (
        <ArrowRight
          aria-hidden="true"
          className="mt-auto text-[#8b95a1]"
          size={17}
        />
      )}
    </div>
  );
}

function FaqItem({
  children,
  question,
}: {
  children: ReactNode;
  question: string;
}) {
  return (
    <details className="group py-4">
      <summary className="cursor-pointer text-sm font-semibold text-[#101827]">
        {question}
      </summary>
      <p className="mt-2 text-sm leading-6 text-[#667085]">{children}</p>
    </details>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(value >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

function consumePaidReturn(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const url = new URL(window.location.href);
  if (url.searchParams.get("paid") !== "true") {
    return false;
  }

  url.searchParams.delete("paid");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
}

function getPaymentLinkUrl(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  return typeof payload.url === "string" ? payload.url : null;
}

function getPaymentErrorMessage(payload: unknown): string {
  if (!isRecord(payload) || typeof payload.error !== "string") {
    return "Unable to create a Square checkout link.";
  }

  return payload.error;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
