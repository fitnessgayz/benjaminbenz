const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  assert.ok(start >= 0, `Expected ${startMarker}`);
  assert.ok(end > start, `Expected ${endMarker}`);
  return source.slice(start, end);
}

test("makes past DEXA and measurement dates easy to find", () => {
  assert.match(dashboard, /id="client-add-past-progress-button"[^>]*aria-controls="client-progress-entry-content"/);
  assert.match(dashboard, /Measurement date[\s\S]*?name="progress_date"[\s\S]*?For older DEXA results, choose the date of the scan\./);
  assert.match(styles, /\.progress-date-actions[\s\S]*?\.progress-past-entry-button/);
});

test("opens the stats editor and focuses the historical date picker", () => {
  const handler = sourceBetween(
    portal,
    "function handleClientPastProgressEntry()",
    "async function progressPhotoJpeg"
  );

  assert.match(handler, /setProgressSectionExpanded\(toggle, content, true\)/);
  assert.match(handler, /Choose the date of the DEXA scan or past measurement/);
  assert.match(handler, /dateInput\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(handler, /dateInput\?\.showPicker\?\.\(\)/);
  assert.match(portal, /#client-add-past-progress-button/);
});

test("loads only the selected date and keeps historical entries separate", () => {
  const dateHandler = sourceBetween(
    portal,
    "function handleClientProgressDateChange()",
    "function setProgressSectionExpanded"
  );
  const payload = sourceBetween(portal, "function clientProgressPayload", "function renderRest");

  assert.match(dateHandler, /dateInput\.max = todayDate\(\)/);
  assert.match(dateHandler, /progressEntries\.find\(\(item\) => item\.entry_date === dateInput\.value\)/);
  assert.match(dateHandler, /fillClientProgressForm\(entry \|\| \{ entry_date: dateInput\.value \}\)/);
  assert.match(payload, /existing = progressEntries\.find\(\(entry\) => entry\.entry_date === entryDate\) \|\| \{\}/);
  assert.match(portal, /upsert\(payload, \{ onConflict: "client_email,entry_date" \}\)/);
  assert.match(portal, /entry\.entry_date \|\| todayDate\(\)/);
});

test("labels the summary date as the latest measurement", () => {
  assert.match(portal, /Latest measurement · \$\{formatLogDate\(latest\.entry_date\)\}/);
  assert.doesNotMatch(portal, /setText\("#progress-date", latest\.entry_date\)/);
});
