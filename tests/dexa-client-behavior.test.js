const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const portal = fs.readFileSync(path.resolve(__dirname, "../js/client-portal.js"), "utf8");
const edgeFunction = fs.readFileSync(path.resolve(__dirname, "../supabase/functions/extract-dexa-report/index.ts"), "utf8");

function sourceBetween(startMarker, endMarker) {
  const start = portal.indexOf(startMarker);
  const end = portal.indexOf(endMarker, start);

  assert.ok(start >= 0, `Expected ${startMarker}`);
  assert.ok(end > start, `Expected ${endMarker} after ${startMarker}`);
  return portal.slice(start, end);
}

const dexaFileDetails = Function(
  `${sourceBetween("function dexaFileDetails", "function dexaReportStatusLabel")}\nreturn dexaFileDetails;`
)();

const bodySpecDexaFields = Function(
  `${sourceBetween("const bodySpecDexaFields", "function dexaReportExtractedValues")}\nreturn bodySpecDexaFields;`
)();

const reviewedDexaValues = Function(
  "todayDate",
  "bodySpecDexaFields",
  `${sourceBetween("function reviewedDexaValues", "async function invokeDexaExtraction")}\nreturn reviewedDexaValues;`
)(() => "2026-09-13", bodySpecDexaFields);

function reviewForm(values = {}) {
  const field = (value = "") => ({ value: String(value) });

  return {
    elements: {
      dexa_scan_date: field(values.scanDate ?? "2026-05-04"),
      dexa_bodyweight: field(values.bodyweight ?? "180"),
      dexa_bodyfat: field(values.bodyfat ?? "20"),
      dexa_lean_mass: field(values.leanMass ?? "140")
    }
  };
}

test("client file validation accepts only supported reports within 10 MB", () => {
  assert.deepEqual(
    dexaFileDetails({ type: "application/pdf", size: 1024 }),
    { valid: true, extension: "pdf", contentType: "application/pdf" }
  );
  assert.equal(dexaFileDetails({ type: "text/plain", size: 100 }).valid, false);
  assert.equal(dexaFileDetails({ type: "image/png", size: 10 * 1024 * 1024 + 1 }).valid, false);
  assert.equal(dexaFileDetails({ type: "image/jpeg", size: 0 }).valid, false);
});

test("client review validation requires a nonfuture scan date and at least one value", () => {
  assert.equal(reviewedDexaValues(reviewForm()).valid, true);
  assert.equal(reviewedDexaValues(reviewForm({ scanDate: "2026-09-14" })).valid, false);
  assert.equal(reviewedDexaValues(reviewForm({ bodyweight: "", bodyfat: "", leanMass: "" })).valid, false);
});

test("client review validation catches impossible or out-of-range measurements", () => {
  assert.equal(reviewedDexaValues(reviewForm({ bodyweight: "150", leanMass: "151" })).valid, false);
  assert.equal(reviewedDexaValues(reviewForm({ bodyfat: "101" })).valid, false);
  assert.equal(reviewedDexaValues(reviewForm({ leanMass: "1501" })).valid, false);
});

test("client review keeps missing optional fields null instead of manufacturing values", () => {
  const result = reviewedDexaValues(reviewForm({ bodyfat: "", leanMass: "" }));

  assert.equal(result.valid, true);
  assert.equal(result.values.scan_date, "2026-05-04");
  assert.equal(result.values.bodyweight_lb, 180);
  assert.equal(result.values.bodyfat_percent, null);
  assert.equal(result.values.lean_mass_lb, null);
  bodySpecDexaFields.forEach(({ key }) => assert.equal(result.values[key], null));
});

test("BodySpec extraction prioritizes Measured Date and accepts its printed US format", () => {
  assert.match(edgeFunction, /BodySpec report, the scan date is labeled Measured Date/i);
  assert.match(edgeFunction, /newest\/current row, normally the first row/i);
  assert.match(edgeFunction, /Do not treat older comparison rows as the current scan/i);

  const start = edgeFunction.indexOf("function validPastOrPresentDate");
  const end = edgeFunction.indexOf("\nfunction rounded", start);
  const validPastOrPresentDate = Function(
    "stringValue",
    "currentDateInLosAngeles",
    `${edgeFunction.slice(start, end).replace("value: unknown", "value")}; return validPastOrPresentDate;`
  )((value) => String(value || "").trim(), () => "2026-09-13");

  assert.equal(validPastOrPresentDate("3/7/2025"), "2025-03-07");
  assert.equal(validPastOrPresentDate("2025-03-07"), "2025-03-07");
});
