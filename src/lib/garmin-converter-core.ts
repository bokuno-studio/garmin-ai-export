import { JSONParser } from "@streamparser/json";
import FitParser from "fit-file-parser";
import JSZip from "jszip";
import Papa from "papaparse";

type FlatValue = string | number | boolean | null;
type CsvRow = Record<string, FlatValue>;

type DatasetKey = "activities" | "sleep" | "dailyHealth";

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
  streamPaths: string[];
  preferredPaths: string[];
  columns: string[];
  preferRootObject?: boolean;
  streamRoot?: boolean;
}

interface JsonExtraction {
  rows: CsvRow[];
  sources: Set<string>;
  warnings: string[];
}

interface ZipStreamHelper<T> {
  on(event: "data", callback: (data: T) => void): ZipStreamHelper<T>;
  on(event: "error", callback: (error: Error) => void): ZipStreamHelper<T>;
  on(event: "end", callback: () => void): ZipStreamHelper<T>;
  resume(): ZipStreamHelper<T>;
}

type StreamableZipObject = JSZip.JSZipObject & {
  internalStream?: (type: "uint8array") => ZipStreamHelper<Uint8Array>;
  _data?: {
    uncompressedSize?: number;
  };
};

const SOURCE_COLUMNS = ["source_file", "source_row"];

const ACTIVITY_COLUMNS = [
  ...SOURCE_COLUMNS,
  "activity_name",
  "activity_type",
  "sport_type",
  "start_time_gmt",
  "start_time_local",
  "begin_timestamp",
  "duration",
  "elapsed_duration",
  "moving_duration",
  "distance",
  "calories",
  "average_speed",
  "max_speed",
  "elevation_gain",
  "elevation_loss",
  "min_elevation",
  "max_elevation",
  "average_hr",
  "max_hr",
  "avg_power",
  "max_power",
  "normalized_power",
  "average_running_cadence_in_steps_per_minute",
  "max_running_cadence_in_steps_per_minute",
  "average_biking_cadence_in_rev_per_minute",
  "max_biking_cadence_in_rev_per_minute",
  "aerobic_training_effect",
  "anaerobic_training_effect",
  "v_o2_max_value",
  "location_name",
];

const SLEEP_COLUMNS = [
  ...SOURCE_COLUMNS,
  "calendar_date",
  "sleep_start_timestamp_gmt",
  "sleep_end_timestamp_gmt",
  "sleep_start_timestamp_local",
  "sleep_end_timestamp_local",
  "duration_in_seconds",
  "total_sleep_seconds",
  "deep_sleep_seconds",
  "light_sleep_seconds",
  "rem_sleep_seconds",
  "awake_sleep_seconds",
  "sleep_score",
  "sleep_scores_overall",
  "sleep_scores_quality",
  "spo2_sleep_summary_average",
  "average_respiration_value",
  "average_spo2",
  "resting_heart_rate",
  "average_heart_rate",
];

const DAILY_HEALTH_COLUMNS = [
  ...SOURCE_COLUMNS,
  "calendar_date",
  "steps",
  "total_steps",
  "distance",
  "active_calories",
  "bmr_calories",
  "total_calories",
  "resting_heart_rate",
  "min_heart_rate",
  "max_heart_rate",
  "average_stress_level",
  "max_stress_level",
  "body_battery_charged",
  "body_battery_drained",
  "body_battery_highest_value",
  "body_battery_lowest_value",
  "floors_ascended",
  "floors_descended",
  "intensity_minutes",
  "moderate_intensity_minutes",
  "vigorous_intensity_minutes",
];

const LAP_COLUMNS = [
  "source_file",
  "lap_number",
  "start_time",
  "sport",
  "sub_sport",
  "total_elapsed_time",
  "total_timer_time",
  "total_distance",
  "total_calories",
  "avg_speed",
  "max_speed",
  "avg_heart_rate",
  "max_heart_rate",
  "avg_cadence",
  "max_cadence",
  "avg_power",
  "max_power",
  "total_ascent",
  "total_descent",
  "intensity",
  "lap_trigger",
];

const DATASETS: DatasetDefinition[] = [
  {
    key: "activities",
    outputName: "activities.csv",
    find: (path) => /(^|\/)[^/]*summarizedactivities\.json$/i.test(path),
    streamPaths: [
      "$.summarizedActivitiesExport.*",
      "$.summarizedActivities.*",
      "$.activities.*",
      "$.activityList.*",
    ],
    preferredPaths: [
      "summarizedActivitiesExport",
      "summarizedActivities",
      "activities",
      "activityList",
    ],
    columns: ACTIVITY_COLUMNS,
  },
  {
    key: "sleep",
    outputName: "sleep.csv",
    find: (path) => /(^|\/)[^/]*sleepdata\.json$/i.test(path),
    streamPaths: ["$.*"],
    preferredPaths: [
      "sleepData",
      "sleepDataExport",
      "sleepScores",
      "sleepSummaries",
      "dailySleepDTO",
    ],
    columns: SLEEP_COLUMNS,
  },
  {
    key: "dailyHealth",
    outputName: "daily_health.csv",
    find: (path) => /(^|\/)udsfile_[^/]*\.json$/i.test(path),
    streamPaths: ["$"],
    preferredPaths: [
      "userDailySummaryExport",
      "dailyHealth",
      "dailySummaries",
      "wellnessData",
    ],
    columns: DAILY_HEALTH_COLUMNS,
    preferRootObject: true,
    streamRoot: true,
  },
];

const LARGE_JSON_FALLBACK_LIMIT_BYTES = 10 * 1024 * 1024;
const GLOBAL_EXCLUDED_FIELD_PATTERNS = [
  /(^|_)id($|_)/,
  /uuid/,
  /device/,
  /manufacturer/,
  /split/,
  /sample/,
  /geo/,
  /polyline/,
  /map/,
  /privacy/,
  /favorite/,
  /manual/,
];

const DATASET_ALLOWED_PATTERNS: Record<DatasetKey | "laps", RegExp[]> = {
  activities: [
    /(^|_)name$/,
    /activity/,
    /sport/,
    /time_gmt$/,
    /time_local$/,
    /timestamp$/,
    /duration$/,
    /distance$/,
    /calorie/,
    /speed$/,
    /pace$/,
    /elevation/,
    /altitude/,
    /heart_rate$/,
    /(^|_)hr$/,
    /cadence/,
    /power$/,
    /training_effect/,
    /v_?o2/,
    /location_name$/,
    /temperature/,
  ],
  sleep: [
    /calendar_date$/,
    /timestamp/,
    /duration/,
    /sleep/,
    /score/,
    /spo2/,
    /respiration/,
    /heart_rate$/,
    /(^|_)hr$/,
    /stress/,
    /body_battery/,
  ],
  dailyHealth: [
    /calendar_date$/,
    /^date$/,
    /step/,
    /distance/,
    /calorie/,
    /heart_rate$/,
    /(^|_)hr$/,
    /resting/,
    /stress/,
    /body_battery/,
    /floor/,
    /intensity/,
    /active/,
    /vigorous/,
    /moderate/,
  ],
  laps: [
    /^start_time$/,
    /^sport$/,
    /^sub_sport$/,
    /elapsed_time$/,
    /timer_time$/,
    /distance$/,
    /calorie/,
    /speed$/,
    /heart_rate$/,
    /cadence$/,
    /power$/,
    /ascent$/,
    /descent$/,
    /intensity$/,
    /lap_trigger$/,
    /grade$/,
    /temperature$/,
    /altitude$/,
  ],
};

export function isZipFile(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(".zip") ||
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed"
  );
}

export async function convertGarminExportCore(
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
      extraction.rows.length > 0
        ? toCsv(extraction.rows, dataset.columns)
        : emptyCsv(dataset.columns),
    );
    summaries.push({
      filename: dataset.outputName,
      rows: extraction.rows.length,
      sources: extraction.sources.size,
    });
  }

  const lapRows = await extractLapRows(entries, onProgress);
  totalRows += lapRows.rows.length;
  warnings.push(...lapRows.warnings);
  outputZip.file(
    "laps.csv",
    lapRows.rows.length > 0 ? toCsv(lapRows.rows, LAP_COLUMNS) : emptyCsv(LAP_COLUMNS),
  );
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
      const streamedCount = await streamJsonRecords(entry, dataset, (record, index) => {
        rows.push({
          source_file: entry.name,
          source_row: index + 1,
          ...flattenRecord(record, dataset.key),
        });
      });

      if (streamedCount === 0) {
        const size = getEntrySize(entry);
        if (size > LARGE_JSON_FALLBACK_LIMIT_BYTES) {
          warnings.push(
            `${dataset.outputName}: skipped fallback parse for large unrecognized JSON ${entry.name}`,
          );
        } else {
          await yieldToEventLoop();
          const raw = await entry.async("string");
          await yieldToEventLoop();
          const parsed = JSON.parse(raw) as unknown;
          const records = getRecords(parsed, dataset);
          records.forEach((record, index) => {
            rows.push({
              source_file: entry.name,
              source_row: index + 1,
              ...flattenRecord(record, dataset.key),
            });
          });
        }
      }

      sources.add(entry.name);
    } catch (error) {
      warnings.push(
        `${dataset.outputName}: skipped ${entry.name} (${messageFromError(error)})`,
      );
    }
  }

  return { rows, sources, warnings };
}

async function streamJsonRecords(
  entry: JSZip.JSZipObject,
  dataset: DatasetDefinition,
  onRecord: (record: unknown, index: number) => void,
): Promise<number> {
  let records = 0;
  const parser = new JSONParser({
    paths: dataset.streamPaths,
    keepStack: Boolean(dataset.streamRoot),
    stringBufferSize: 64 * 1024,
    numberBufferSize: 1024,
  });

  parser.onValue = ({ value }) => {
    if (typeof value === "undefined") {
      return;
    }

    const values = recordsFromStreamValue(value, dataset);
    values.forEach((record) => {
      if (!isPlainObject(record)) {
        return;
      }
      records += 1;
      onRecord(record, records - 1);
    });
  };

  await pipeZipEntryToParser(entry, parser);
  return records;
}

function recordsFromStreamValue(value: unknown, dataset: DatasetDefinition): unknown[] {
  if (Array.isArray(value)) {
    return value.filter((item) => isPlainObject(item));
  }

  if (isPlainObject(value)) {
    return [value];
  }

  if (dataset.preferRootObject && isPlainObject(value)) {
    return [value];
  }

  return [];
}

function pipeZipEntryToParser(entry: JSZip.JSZipObject, parser: JSONParser): Promise<void> {
  const stream = (entry as StreamableZipObject).internalStream?.("uint8array");
  if (!stream) {
    return entry.async("uint8array").then((content) => {
      parser.write(content);
      if (!parser.isEnded) {
        parser.end();
      }
    });
  }

  return new Promise((resolve, reject) => {
    stream
      .on("data", (chunk) => {
        parser.write(chunk);
      })
      .on("error", reject)
      .on("end", () => {
        try {
          if (!parser.isEnded) {
            parser.end();
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      })
      .resume();
  });
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

async function extractLapRows(
  entries: JSZip.JSZipObject[],
  onProgress?: (progress: ConversionProgress) => void,
): Promise<JsonExtraction> {
  const rows: CsvRow[] = [];
  const sources = new Set<string>();
  const warnings: string[] = [];
  const directFitEntries = entries.filter((entry) => /\.fit$/i.test(entry.name));

  for (let index = 0; index < directFitEntries.length; index += 1) {
    const entry = directFitEntries[index];
    onProgress?.({
      phase: "fit",
      message: `Parsing FIT file ${index + 1} of ${directFitEntries.length}`,
      current: index + 1,
      total: directFitEntries.length,
    });

    await appendFitLaps(
      entry.name,
      () => entry.async("arraybuffer"),
      rows,
      sources,
      warnings,
    );
  }

  const nestedZipEntries = entries.filter((entry) =>
    /(^|\/)uploadedfiles[^/]*\.zip$/i.test(entry.name),
  );

  for (let index = 0; index < nestedZipEntries.length; index += 1) {
    const entry = nestedZipEntries[index];
    onProgress?.({
      phase: "fit",
      message: `Scanning activity archive ${index + 1} of ${nestedZipEntries.length}`,
      current: index + 1,
      total: nestedZipEntries.length,
    });

    try {
      const nestedZip = await JSZip.loadAsync(await entry.async("arraybuffer"));
      const nestedFitEntries = getZipFiles(nestedZip).filter((nestedEntry) =>
        /\.fit$/i.test(nestedEntry.name),
      );

      for (let nestedIndex = 0; nestedIndex < nestedFitEntries.length; nestedIndex += 1) {
        const nestedEntry = nestedFitEntries[nestedIndex];
        onProgress?.({
          phase: "fit",
          message: `Parsing nested FIT ${nestedIndex + 1} of ${nestedFitEntries.length}`,
          current: nestedIndex + 1,
          total: nestedFitEntries.length,
        });
        await appendFitLaps(
          `${entry.name}/${nestedEntry.name}`,
          () => nestedEntry.async("arraybuffer"),
          rows,
          sources,
          warnings,
        );
      }
    } catch (error) {
      warnings.push(`laps.csv: skipped ${entry.name} (${messageFromError(error)})`);
    }

    await yieldToEventLoop();
  }

  return { rows, sources, warnings };
}

async function appendFitLaps(
  sourcePath: string,
  read: () => Promise<ArrayBuffer>,
  rows: CsvRow[],
  sources: Set<string>,
  warnings: string[],
): Promise<void> {
  try {
    const parser = new FitParser({
      force: true,
      mode: "list",
      lengthUnit: "km",
      speedUnit: "km/h",
      elapsedRecordField: true,
    });
    const fit = (await parser.parseAsync(await read())) as {
      laps?: unknown[];
    };
    const laps = Array.isArray(fit.laps) ? fit.laps : [];
    sources.add(sourcePath);

    laps.forEach((lap, lapIndex) => {
      rows.push({
        source_file: sourcePath,
        lap_number: lapIndex + 1,
        ...flattenRecord(lap, "laps"),
      });
    });
  } catch (error) {
    warnings.push(`laps.csv: skipped ${sourcePath} (${messageFromError(error)})`);
  }
}

function flattenRecord(
  record: unknown,
  datasetKey: DatasetKey | "laps",
  prefix = "",
): CsvRow {
  const output: CsvRow = {};

  if (!isPlainObject(record)) {
    const header = normalizeHeader(prefix || "value");
    if (shouldIncludeField(datasetKey, header, record)) {
      output[header] = formatValue(header, record);
    }
    return output;
  }

  Object.entries(record).forEach(([key, value]) => {
    const nextKey = prefix ? `${prefix}_${key}` : key;
    const header = normalizeHeader(nextKey);

    if (isPlainObject(value)) {
      Object.assign(output, flattenRecord(value, datasetKey, nextKey));
      return;
    }

    if (!shouldIncludeField(datasetKey, header, value)) {
      return;
    }

    output[header] = formatValue(header, value);
  });

  return output;
}

function shouldIncludeField(
  datasetKey: DatasetKey | "laps",
  header: string,
  value: unknown,
): boolean {
  if (GLOBAL_EXCLUDED_FIELD_PATTERNS.some((pattern) => pattern.test(header))) {
    return false;
  }

  if (Array.isArray(value) && value.some((item) => isPlainObject(item) || Array.isArray(item))) {
    return false;
  }

  if (isPlainObject(value)) {
    return false;
  }

  return DATASET_ALLOWED_PATTERNS[datasetKey].some((pattern) => pattern.test(header));
}

function normalizeHeader(header: string): string {
  const cleaned = header
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  return cleaned || "value";
}

function formatValue(header: string, value: unknown): FlatValue {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "number" && isTimestampField(header)) {
    return numberToIsoTimestamp(value) ?? value;
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    if (isTimestampField(header)) {
      return stringToTimestamp(value, header) ?? value;
    }
    return value;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return null;
    }

    if (value.every((item) => !isPlainObject(item) && !Array.isArray(item))) {
      return value.map((item) => String(formatValue(header, item) ?? "")).join("; ");
    }

    return null;
  }

  return null;
}

function isTimestampField(header: string): boolean {
  if (/(duration|elapsed|timer|moving|zone|offset)/.test(header)) {
    return false;
  }

  return /(timestamp|start_time|end_time|begin_time|time_gmt|time_local|_gmt$|_local$)/.test(
    header,
  );
}

function numberToIsoTimestamp(value: number): string | null {
  if (!Number.isFinite(value)) {
    return null;
  }

  const milliseconds = value > 100_000_000_000 ? value : value * 1000;
  if (milliseconds < 946684800000 || milliseconds > 4102444800000) {
    return null;
  }

  return new Date(milliseconds).toISOString();
}

function stringToTimestamp(value: string, header: string): string | null {
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return numberToIsoTimestamp(Number(trimmed));
  }

  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(trimmed)) {
    const normalized = trimmed.replace(" ", "T");
    return /gmt|utc/.test(header) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)
      ? `${normalized}Z`
      : normalized;
  }

  return null;
}

function toCsv(rows: CsvRow[], preferredColumns: string[]): string {
  const columns = collectColumns(rows, preferredColumns);
  return Papa.unparse(rows, {
    columns,
    header: true,
    newline: "\n",
  });
}

function emptyCsv(columns: string[]): string {
  return `${columns.join(",")}\n`;
}

function collectColumns(rows: CsvRow[], preferredColumns: string[]): string[] {
  const columns = new Set<string>(preferredColumns);
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

Treat blank cells as missing values. Repeated low-level identifiers, device metadata, maps, and split blobs have been excluded so the CSV stays compact and easier to analyze.

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

function getEntrySize(entry: JSZip.JSZipObject): number {
  return (entry as StreamableZipObject)._data?.uncompressedSize ?? 0;
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

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
