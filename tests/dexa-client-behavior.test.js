const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const portal = fs.readFileSync(path.resolve(__dirname, "../js/client-portal.js"), "utf8");

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

const reviewedDexaValues = Function(
  "todayDate",
  `${sourceBetween("function reviewedDexaValues", "async function invokeDexaExtraction")}\nreturn reviewedDexaValues;`
)(() => "2026-09-13");

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
  assert.deepEqual(result.values, {
    scan_date: "2026-05-04",
    bodyweight_lb: 180,
    bodyfat_percent: null,
    lean_mass_lb: null
  });
});
