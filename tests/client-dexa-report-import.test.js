const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const coachAdmin = fs.readFileSync(path.join(root, "coach-admin.html"), "utf8");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const coachPortal = fs.readFileSync(path.join(root, "js/coach-admin.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

function formMarkup(source, formId) {
  const marker = `id="${formId}"`;
  const markerIndex = source.indexOf(marker);
  const start = source.lastIndexOf("<form", markerIndex);
  const end = source.indexOf("</form>", markerIndex);

  assert.ok(markerIndex >= 0, `Expected ${formId}`);
  assert.ok(start >= 0 && end > start, `Expected complete markup for ${formId}`);
  return source.slice(start, end + "</form>".length);
}

function sourceWindow(source, marker, before = 1400, after = 5200) {
  const markerIndex = source.indexOf(marker);

  assert.ok(markerIndex >= 0, `Expected ${marker}`);
  return source.slice(Math.max(0, markerIndex - before), markerIndex + after);
}

function sourceForFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name}`);
  return source.slice(start, end >= 0 ? end : undefined);
}

test("offers a private DEXA PDF or image upload before the manual progress cards", () => {
  const dexaIndex = dashboard.search(/(?:client-)?dexa-(?:report-)?(?:upload|import)/i);
  const manualCardsIndex = dashboard.indexOf('class="progress-profile-grid"');

  assert.ok(dexaIndex >= 0, "Expected the DEXA importer");
  assert.ok(manualCardsIndex > dexaIndex, "Expected DEXA import before manual measurement cards");
  assert.match(dashboard, /type="file"[^>]*accept="[^"]*(?:application\/pdf|\.pdf)[^"]*(?:image\/jpeg|image\/\*)[^"]*(?:image\/png|image\/\*)[^"]*"/i);
  assert.match(dashboard, /private[^<]*(?:DEXA|report)|(?:DEXA|report)[^<]*private/i);
  assert.match(dashboard, /(?:10\s*MB|PDF,? JPG,? or PNG)/i);
  assert.match(dashboard, /fwb-training-privacy\.html/);
});

test("provides an accessible inline review that requires confirmation", () => {
  assert.match(dashboard, /(?:dexa[^>]*(?:status|message)|(?:status|message)[^>]*dexa)[^>]*role="status"/i);
  assert.match(dashboard, /(?:dexa[^>]*(?:status|review)|(?:status|review)[^>]*dexa)[^>]*aria-live="polite"/i);
  assert.match(dashboard, /(?:dexa_scan_date|dexa-scan-date)/i);
  assert.match(dashboard, /(?:dexa_bodyweight|dexa-bodyweight)/i);
  assert.match(dashboard, /(?:dexa_bodyfat|dexa-bodyfat)/i);
  assert.match(dashboard, /(?:dexa_lean_mass|dexa-lean-mass)/i);
  assert.match(dashboard, /Automatic extraction can be wrong/i);
  assert.match(dashboard, /Compare every value[^<]*(?:DEXA|report)/i);
  assert.match(dashboard, /(?:Confirm|Save)[^<]*(?:measurement|DEXA|review)/i);
  assert.match(dashboard, /(?:Discard|Cancel|Clear)[^<]*(?:review|import|extraction)/i);
  assert.match(portal, /(?:uploading|extracting|reviewing|saving|confirmed)/i);
});

test("uploads to the signed-in client's private folder and invokes extraction then confirmation", () => {
  const uploadSource = sourceWindow(portal, '.from("dexa-reports")', 2600, 8000);

  assert.match(uploadSource, /(?:activeDashboardUser|user)\.id/);
  assert.match(uploadSource, /\.upload\(/);
  assert.match(uploadSource, /\.functions\.invoke\("extract-dexa-report"/);
  assert.match(portal, /action:\s*"extract"/);
  assert.match(portal, /action:\s*"confirm"/);
  assert.match(portal, /report_id:/);
});

test("rejects unsupported or oversized files before uploading", () => {
  const detailsSource = sourceForFunction(portal, "dexaFileDetails");
  const fileDetails = Function(`${detailsSource}; return dexaFileDetails;`)();

  assert.deepEqual(
    fileDetails({ type: "application/pdf", size: 2048 }),
    { valid: true, extension: "pdf", contentType: "application/pdf" }
  );
  assert.equal(fileDetails({ type: "text/plain", size: 2048 }).valid, false);
  assert.equal(fileDetails({ type: "image/png", size: 10 * 1024 * 1024 + 1 }).valid, false);
  assert.equal(fileDetails({ type: "image/jpeg", size: 0 }).valid, false);
});

test("validates the reviewed values before confirmation", () => {
  const reviewSource = sourceForFunction(portal, "reviewedDexaValues");
  const reviewValues = Function("todayDate", `${reviewSource}; return reviewedDexaValues;`)(
    () => "2026-09-13"
  );
  const formFor = (values = {}) => ({
    elements: {
      dexa_scan_date: { value: values.scanDate ?? "2026-06-05" },
      dexa_bodyweight: { value: values.bodyweight ?? "180" },
      dexa_bodyfat: { value: values.bodyfat ?? "18.5" },
      dexa_lean_mass: { value: values.leanMass ?? "145" }
    }
  });

  assert.deepEqual(reviewValues(formFor()), {
    valid: true,
    values: {
      scan_date: "2026-06-05",
      bodyweight_lb: 180,
      bodyfat_percent: 18.5,
      lean_mass_lb: 145
    }
  });
  assert.equal(reviewValues(formFor({ scanDate: "2026-09-14" })).valid, false);
  assert.equal(reviewValues(formFor({ bodyweight: "", bodyfat: "", leanMass: "" })).valid, false);
  assert.equal(reviewValues(formFor({ bodyfat: "101" })).valid, false);
  assert.equal(reviewValues(formFor({ bodyweight: "140", leanMass: "145" })).valid, false);
});

test("keeps DEXA lean mass separate from muscle mass in client editing and history", () => {
  const clientForm = formMarkup(dashboard, "client-checkin-form");

  assert.match(clientForm, /Lean mass[^<]*<input[^>]*name="progress_lean_mass"/i);
  assert.match(clientForm, /Muscle mass[^<]*<input[^>]*name="progress_muscle_mass"/i);
  assert.match(portal, /progress_lean_mass\.value\s*=\s*entry\.lean_mass/);
  assert.match(portal, /lean_mass:\s*nextNumber\("progress_lean_mass",\s*existing\.lean_mass\)/);
  assert.match(portal, /\["Lean mass",\s*entry\.lean_mass,\s*"lb"\]/);
  assert.match(portal, /\["Muscle",\s*entry\.muscle_mass,\s*"lb"\]/);
});

test("keeps DEXA lean mass separate from muscle mass in coach editing and history", () => {
  const coachForm = formMarkup(coachAdmin, "program-editor");

  assert.match(coachForm, /Lean mass[^<]*<input[^>]*name="progress_lean_mass"/i);
  assert.match(coachForm, /Muscle mass[^<]*<input[^>]*name="progress_muscle_mass"/i);
  assert.match(coachPortal, /progress_lean_mass\.value\s*=\s*entry\.lean_mass/);
  assert.match(coachPortal, /lean_mass:\s*nextNumber\("progress_lean_mass",\s*existing\.lean_mass\)/);
  assert.match(coachPortal, /\["Lean mass",\s*entry\.lean_mass,\s*"lb"\]/);
  assert.match(coachPortal, /\["Muscle",\s*entry\.muscle_mass,\s*"lb"\]/);
});

test("loads report metadata and creates short-lived private links only when requested", () => {
  const clientLinkSource = sourceWindow(portal, '.from("dexa-reports")');
  const coachLinkSource = sourceWindow(coachPortal, '.from("dexa-reports")');

  assert.match(portal, /\.from\("client_dexa_reports"\)/);
  assert.match(coachPortal, /\.from\("client_dexa_reports"\)/);
  assert.match(portal, /data-(?:client-)?dexa-report-(?:view|open)/);
  assert.match(coachPortal, /data-coach-dexa-report-(?:view|open)/);
  assert.match(clientLinkSource, /\.createSignedUrl\([^,]+,\s*(?:300|600)\)/);
  assert.match(coachLinkSource, /\.createSignedUrl\([^,]+,\s*(?:300|600)\)/);
  assert.match(clientLinkSource, /window\.open\(/);
  assert.match(coachLinkSource, /window\.open\(/);
  assert.doesNotMatch(`${portal}\n${coachPortal}`, /(?:insert|update|upsert)\([^)]*signed_(?:url|link)/i);
});

test("contains long filenames and collapses review fields on phones", () => {
  assert.match(styles, /\.dexa-report-summary strong,[\s\S]*?\{[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap[^}]*\}/s);
  assert.match(styles, /@media \(max-width:\s*(?:620|700|760|820)px\)[\s\S]*?\.dexa-review-grid,[\s\S]*?\{[^}]*grid-template-columns:\s*(?:minmax\(0,\s*1fr\)|1fr)[^}]*\}/s);
});
