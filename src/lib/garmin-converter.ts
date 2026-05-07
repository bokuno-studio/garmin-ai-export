import saveAs from "file-saver";
import FitParser from "fit-file-parser";
import JSZip from "jszip";
import Papa from "papaparse";

type FlatValue = string | number | boolean | null;
type CsvRow = Record<string, FlatValue>;

type DatasetKey = "activities" | "sleep" | "dailyHealth" | "laps";

export type ConversionPhase =
  | "reading"
  | "json"
  | "fit"
  | "packaging"
  | "done";

export interface ConversionProgress {
  phase: ConversionPhase;
  message: string;
  current?: number;
  total?: number;
}

export interface OutputFileSummary {
  filename: string;
  rows: number;
  sources: number;
}

export interface ConversionResult {
  blob: Blob;
  filename: string;
  files: OutputFileSummary[];
  warnings: string[];
}

interface DatasetDefinition {
  key: DatasetKey;
  outputName: string;
  find: (path: string) => boolean;
  preferredPaths: string[];
  preferRootObject?: boolean;
}

interface JsonExtraction {
  rows: CsvRow[];
  sources: Set<string>;
  warnings: string[];
}

interface FitSource {
  path: string;
  read: () => Promise<ArrayBuffer>;
}

const DATASETS: DatasetDefinition[] = [
  {
    key: "activities",
    outputName: "activities.csv",
    find: (path) => /(^|\/)[^/]*summarizedactivities\.json$/i.test(path),
    preferredPaths: [
      "summarizedActivitiesExport",
      "summarizedActivities",
      "activities",
      "activityList",
    ],
  },
  {
    key: "sleep",
    outputName: "sleep.csv",
    find: (path) => /(^|\/)[^/]*sleepdata\.json$/i.test(path),
    preferredPaths: [
      "sleepData",
      "sleepDataExport",
      "sleepScores",
      "sleepSummaries",
      "dailySleepDTO",
    ],
  },
  {
    key: "dailyHealth",
    outputName: "daily_health.csv",
    find: (path) => /(^|\/)udsfile_[^/]*\.json$/i.test(path),
    preferredPaths: [
      "userDailySummaryExport",
      "dailyHealth",
      "dailySummaries",
      "wellnessData",
    ],
    preferRootObject: true,
  },
];

const EMPTY_CSV = "source_file\n";

export function isZipFile(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}

export async function convertGarminExport(
  file: File,
  onProgress?: (progress: ConversionProgress) => void,
): Promise<ConversionResult> {
  if (!isZipFile(file)) {
    throw new Error("Select a Garmin Connect ZIP export.");
  }

  onProgress?.({ phase: "reading", message: "Reading ZIP archive" });
  const sourceZip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = getZipFiles(sourceZip);
  const warnings: string[] = [];

  if (entries.length === 0) {
    throw new Error("The selected ZIP does not contain any files.");
  }

  const outputZip = new JSZip();
  const summaries: OutputFileSummary[] = [];
  let totalRows = 0;

  for (const dataset of DATASETS) {
    onProgress?.({
      phase: "json",
      message: `Extracting ${dataset.outputName}`,
    });

    const extraction = await extractJsonDataset(entries, dataset);
    warnings.push(...extraction.warnings);
    totalRows += extraction.rows.length;

    outputZip.file(
      dataset.outputName,
      extraction.rows.length > 0 ? toCsv(extraction.rows) : EMPTY_CSV,
    );
    summaries.push({
      filename: dataset.outputName,
      rows: extraction.rows.length,
      sources: extraction.sources.size,
    });
  }

  const fitSources = await collectFitSources(entries, onProgress);
  const lapRows = await extractLapRows(fitSources, onProgress);
  totalRows += lapRows.rows.length;
  warnings.push(...lapRows.warnings);
  outputZip.file("laps.csv", lapRows.rows.length > 0 ? toCsv(lapRows.rows) : EMPTY_CSV);
  summaries.push({
    filename: "laps.csv",
    rows: lapRows.rows.length,
    sources: lapRows.sources.size,
  });

  if (totalRows === 0) {
    throw new Error(
      "No Garmin activity, sleep, daily health, or FIT lap data was found in this ZIP.",
    );
  }

  addMissingSourceWarnings(summaries, warnings);
  outputZip.file("prompt_template.txt", buildPromptTemplate(summaries, warnings));

  onProgress?.({ phase: "packaging", message: "Creating output ZIP" });
  const blob = await outputZip.generateAsync(
    {
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      onProgress?.({
        phase: "packaging",
        message: `Creating output ZIP (${Math.round(metadata.percent)}%)`,
      });
    },
  );

  const filename = `garmin-ai-export-${new Date().toISOString().slice(0, 10)}.zip`;

  onProgress?.({ phase: "done", message: "Conversion complete" });
  return {
    blob,
    filename,
    files: summaries,
    warnings,
  };
}

export function downloadConversion(result: ConversionResult): void {
  saveAs(result.blob, result.filename);
}

function getZipFiles(zip: JSZip): JSZip.JSZipObject[] {
  return Object.values(zip.files).filter((entry) => !entry.dir);
}

async function extractJsonDataset(
  entries: JSZip.JSZipObject[],
  dataset: DatasetDefinition,
): Promise<JsonExtraction> {
  const rows: CsvRow[] = [];
  const sources = new Set<string>();
  const warnings: string[] = [];
  const matches = entries.filter((entry) => dataset.find(entry.name));

  for (const entry of matches) {
    try {
      const raw = await entry.async("string");
      const parsed = JSON.parse(raw) as unknown;
      const records = getRecords(parsed, dataset);
      sources.add(entry.name);

      records.forEach((record, index) => {
        rows.push({
          source_file: entry.name,
          source_row: index + 1,
          ...flattenRecord(record),
        });
      });
    } catch (error) {
      warnings.push(
        `${dataset.outputName}: skipped ${entry.name} (${messageFromError(error)})`,
      );
    }
  }

  return { rows, sources, warnings };
}

function getRecords(root: unknown, dataset: DatasetDefinition): unknown[] {
  if (Array.isArray(root)) {
    return root;
  }

  for (const path of dataset.preferredPaths) {
    const value = getPath(root, path);
    if (Array.isArray(value)) {
      return value;
    }
    if (isPlainObject(value) && dataset.preferRootObject) {
      return [value];
    }
  }

  if (dataset.preferRootObject && isPlainObject(root)) {
    return [root];
  }

  const candidates = collectArrayCandidates(root);
  if (candidates.length > 0) {
    candidates.sort((a, b) => b.items.length - a.items.length);
    return candidates[0].items;
  }

  if (isPlainObject(root)) {
    return [root];
  }

  return [];
}

function getPath(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, segment) => {
    if (!isPlainObject(value)) {
      return undefined;
    }
    return value[segment];
  }, root);
}

function collectArrayCandidates(
  value: unknown,
  depth = 0,
  candidates: { path: string; items: unknown[] }[] = [],
  path = "",
): { path: string; items: unknown[] }[] {
  if (depth > 4 || !isPlainObject(value)) {
    return candidates;
  }

  Object.entries(value).forEach(([key, child]) => {
    const childPath = path ? `${path}.${key}` : key;
    if (Array.isArray(child) && child.some((item) => isPlainObject(item))) {
      candidates.push({ path: childPath, items: child });
    } else if (isPlainObject(child)) {
      collectArrayCandidates(child, depth + 1, candidates, childPath);
    }
  });

  return candidates;
}

async function collectFitSources(
  entries: JSZip.JSZipObject[],
  onProgress?: (progress: ConversionProgress) => void,
): Promise<FitSource[]> {
  const directFitSources = entries
    .filter((entry) => /\.fit$/i.test(entry.name))
    .map((entry) => ({
      path: entry.name,
      read: () => entry.async("arraybuffer"),
    }));

  const nestedZipEntries = entries.filter((entry) =>
    /(^|\/)uploadedfiles[^/]*\.zip$/i.test(entry.name),
  );
  const nestedFitSources: FitSource[] = [];

  for (let index = 0; index < nestedZipEntries.length; index += 1) {
    const entry = nestedZipEntries[index];
    onProgress?.({
      phase: "fit",
      message: `Scanning activity archive ${index + 1} of ${nestedZipEntries.length}`,
      current: index + 1,
      total: nestedZipEntries.length,
    });

    try {
      const nestedBuffer = await entry.async("arraybuffer");
      const nestedZip = await JSZip.loadAsync(nestedBuffer);
      getZipFiles(nestedZip)
        .filter((nestedEntry) => /\.fit$/i.test(nestedEntry.name))
        .forEach((nestedEntry) => {
          nestedFitSources.push({
            path: `${entry.name}/${nestedEntry.name}`,
            read: () => nestedEntry.async("arraybuffer"),
          });
        });
    } catch (error) {
      console.warn(`Skipped nested ZIP ${entry.name}`, error);
    }
  }

  const deduped = new Map<string, FitSource>();
  [...directFitSources, ...nestedFitSources].forEach((source) => {
    deduped.set(source.path, source);
  });

  return [...deduped.values()];
}

async function extractLapRows(
  fitSources: FitSource[],
  onProgress?: (progress: ConversionProgress) => void,
): Promise<JsonExtraction> {
  const rows: CsvRow[] = [];
  const sources = new Set<string>();
  const warnings: string[] = [];

  for (let index = 0; index < fitSources.length; index += 1) {
    const source = fitSources[index];
    onProgress?.({
      phase: "fit",
      message: `Parsing FIT laps ${index + 1} of ${fitSources.length}`,
      current: index + 1,
      total: fitSources.length,
    });

    try {
      const parser = new FitParser({
        force: true,
        mode: "list",
        lengthUnit: "km",
        speedUnit: "km/h",
        elapsedRecordField: true,
      });
      const fit = (await parser.parseAsync(await source.read())) as {
        laps?: unknown[];
        sessions?: unknown[];
        activity?: unknown;
      };
      const laps = Array.isArray(fit.laps) ? fit.laps : [];
      sources.add(source.path);

      laps.forEach((lap, lapIndex) => {
        rows.push({
          source_file: source.path,
          lap_number: lapIndex + 1,
          ...flattenRecord(lap),
        });
      });
    } catch (error) {
      warnings.push(`laps.csv: skipped ${source.path} (${messageFromError(error)})`);
    }
  }

  return { rows, sources, warnings };
}

function flattenRecord(record: unknown, prefix = ""): CsvRow {
  const output: CsvRow = {};

  if (!isPlainObject(record)) {
    output[prefix ? normalizeHeader(prefix) : "value"] = formatValue(record);
    return output;
  }

  Object.entries(record).forEach(([key, value]) => {
    const nextKey = prefix ? `${prefix}_${key}` : key;
    if (isPlainObject(value)) {
      Object.assign(output, flattenRecord(value, nextKey));
      return;
    }

    output[normalizeHeader(nextKey)] = formatValue(value);
  });

  return output;
}

function normalizeHeader(header: string): string {
  const cleaned = header
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return cleaned || "value";
}

function formatValue(value: unknown): FlatValue {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return null;
    }

    if (value.every((item) => !isPlainObject(item) && !Array.isArray(item))) {
      return value.map((item) => String(formatValue(item) ?? "")).join("; ");
    }

    return JSON.stringify(value);
  }

  return JSON.stringify(value);
}

function toCsv(rows: CsvRow[]): string {
  const columns = collectColumns(rows);
  return Papa.unparse(rows, {
    columns,
    header: true,
    newline: "\n",
  });
}

function collectColumns(rows: CsvRow[]): string[] {
  const columns = new Set<string>(["source_file"]);
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => columns.add(key));
  });

  return [...columns];
}

function buildPromptTemplate(
  summaries: OutputFileSummary[],
  warnings: string[],
): string {
  const fileList = summaries
    .map((file) => `- ${file.filename}: ${file.rows} rows from ${file.sources} source file(s)`)
    .join("\n");
  const warningList =
    warnings.length > 0
      ? `\n\nConversion notes:\n${warnings.map((warning) => `- ${warning}`).join("\n")}`
      : "";

  return `You are analyzing Garmin Connect export data that has been converted to CSV.

Files in this ZIP:
${fileList}
- prompt_template.txt: this guide

Use activities.csv for activity history, sleep.csv for sleep history, daily_health.csv for daily wellness summaries, and laps.csv for workout lap-level detail.

Treat blank cells as missing values. Columns with JSON text contain nested Garmin data that did not fit cleanly into a single flat metric.

Start by summarizing the available date range and data quality. Then identify trends, outliers, and practical observations across activity load, sleep, recovery, stress, Body Battery, heart rate, and lap performance.${warningList}
`;
}

function addMissingSourceWarnings(
  summaries: OutputFileSummary[],
  warnings: string[],
): void {
  summaries.forEach((summary) => {
    if (summary.rows === 0) {
      warnings.push(`${summary.filename}: no matching Garmin data was found`);
    }
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
