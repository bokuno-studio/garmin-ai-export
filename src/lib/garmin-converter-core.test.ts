import { strict as assert } from "node:assert";
import test from "node:test";
import JSZip from "jszip";
import { convertGarminExportCoreBuffer } from "./garmin-converter-core.ts";

test("escapes spreadsheet formula prefixes in generated activity CSV strings", async () => {
  const sourceZip = new JSZip();
  sourceZip.file(
    "DI-Connect-Fitness/SummarizedActivities.json",
    JSON.stringify({
      summarizedActivitiesExport: [
        { activityName: "=Attack", distance: 1 },
        { activityName: "+Attack", distance: 2 },
        { activityName: "-Attack", distance: 3 },
        { activityName: "@Attack", distance: 4 },
        { activityName: "\tAttack", distance: 5 },
        { activityName: "\rAttack", distance: 6 },
        { activityName: "  =Attack", distance: 7 },
        { activityName: "Normal activity", distance: 8 },
      ],
    }),
  );
  const sourceBuffer = await sourceZip.generateAsync({ type: "arraybuffer" });
  const result = await convertGarminExportCoreBuffer(
    new File([sourceBuffer], "garmin-export.zip", {
      type: "application/zip",
    }),
  );
  const outputZip = await JSZip.loadAsync(result.buffer);
  const csv = await outputZip.file("activities.csv")?.async("string");

  assert.ok(csv);
  assert.ok(csv.includes("\"'=Attack\""));
  assert.ok(csv.includes("\"'+Attack\""));
  assert.ok(csv.includes("\"'-Attack\""));
  assert.ok(csv.includes("\"'@Attack\""));
  assert.ok(csv.includes("\"'\tAttack\""));
  assert.ok(csv.includes("\"'\rAttack\""));
  assert.ok(csv.includes("\"'  =Attack\""));
  assert.ok(csv.includes("Normal activity"));
  assert.equal(csv.includes("'Normal activity"), false);
});
