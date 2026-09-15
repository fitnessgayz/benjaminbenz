const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const portal = fs.readFileSync(path.join(root, "js", "client-portal.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css", "style.css"), "utf8");
const edgeFunction = fs.readFileSync(path.join(root, "supabase/functions/extract-food-label/index.ts"), "utf8");
const privacy = fs.readFileSync(path.join(root, "fwb-training-privacy.html"), "utf8");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/20260915142223_add_food_barcode_library.sql"),
  "utf8"
);

function sourceForFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  const nextAsyncFunction = source.indexOf("\nasync function ", start + 1);
  const ends = [nextFunction, nextAsyncFunction].filter((index) => index > start);
  assert.ok(start >= 0, `Expected ${name}`);
  return source.slice(start, ends.length ? Math.min(...ends) : source.length);
}

test("adds a mobile barcode scanner with manual entry and label-photo fallback", () => {
  assert.match(dashboard, /id="open-food-barcode-scanner"/);
  assert.match(dashboard, /id="food-barcode-dialog"/);
  assert.match(dashboard, /id="food-barcode-camera"[^>]*playsinline[^>]*muted/);
  assert.match(dashboard, /id="food-barcode-manual-input"[^>]*inputmode="numeric"/);
  assert.match(dashboard, /id="food-barcode-photo-fallback"/);
  assert.match(styles, /\.food-barcode-camera-shell\s*\{[\s\S]*?aspect-ratio:/);
  assert.match(styles, /\.food-barcode-dialog::backdrop/);
});

test("pins the barcode reader and verifies its downloaded asset", () => {
  assert.match(dashboard, /@zxing\/browser@0\.2\.1\/umd\/zxing-browser\.min\.js/);
  assert.match(dashboard, /integrity="sha384-HRtzk9lZgkbSgvUyQrnfC\/GxiXZgwaNyD7hC9wcXlsBpDhkS80ISl73juef2FRuf"/);
  assert.match(dashboard, /crossorigin="anonymous"/);
});

test("accepts valid GTINs, canonicalizes UPC-A, and rejects a bad check digit", () => {
  const barcodeSource = sourceForFunction(portal, "canonicalFoodBarcode");
  const canonicalFoodBarcode = Function(`${barcodeSource}; return canonicalFoodBarcode;`)();

  assert.equal(canonicalFoodBarcode("3017620422003"), "3017620422003");
  assert.equal(canonicalFoodBarcode("012345678905"), "0012345678905");
  assert.equal(canonicalFoodBarcode("96385074"), "96385074");
  assert.equal(canonicalFoodBarcode("3017620422004"), "");
  assert.equal(canonicalFoodBarcode("123"), "");
});

test("uses the rear camera, stops its tracks, and looks up through the authenticated function", () => {
  const startSource = sourceForFunction(portal, "startFoodBarcodeScanner");
  const stopSource = sourceForFunction(portal, "stopFoodBarcodeScanner");
  const lookupSource = sourceForFunction(portal, "lookupFoodBarcode");

  assert.match(startSource, /BrowserMultiFormatOneDReader/);
  assert.match(startSource, /facingMode:\s*\{\s*ideal:\s*"environment"/);
  assert.match(stopSource, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(lookupSource, /functions\.invoke\("extract-food-label"/);
  assert.match(lookupSource, /action:\s*"lookup_barcode"/);
  assert.match(lookupSource, /foodLabelPending:\s*!data\.cached/);
  assert.match(lookupSource, /Review the serving and every macro/);
});

test("checks the shared library before Open Food Facts and does not log sensitive output", () => {
  const lookupStart = edgeFunction.indexOf("async function lookupBarcode(");
  const publishStart = edgeFunction.indexOf("async function publishFoodLabel(");
  const lookupSource = edgeFunction.slice(lookupStart, publishStart);

  assert.match(lookupSource, /\.from\("shared_food_library"\)/);
  assert.match(lookupSource, /https:\/\/world\.openfoodfacts\.org\/api\/v3\/product\//);
  assert.ok(lookupSource.indexOf('.from("shared_food_library")') < lookupSource.indexOf("world.openfoodfacts.org"));
  assert.match(lookupSource, /"User-Agent":\s*OPEN_FOOD_FACTS_USER_AGENT/);
  assert.match(lookupSource, /AbortSignal\.timeout\(15_000\)/);
  assert.match(edgeFunction, /auth\.getUser\(\)/);
  assert.doesNotMatch(edgeFunction, /console\.(?:log|info|debug|warn|error)/);
});

test("stores only reviewed barcode foods in the existing read-only shared library", () => {
  assert.match(migration, /add column if not exists barcode text/);
  assert.match(migration, /source in \('food_label', 'barcode'\)/);
  assert.match(migration, /create unique index if not exists shared_food_library_barcode_idx/);
  assert.match(migration, /where barcode is not null/);
  assert.match(portal, /barcode:\s*form\.dataset\.foodBarcode/);
  assert.match(edgeFunction, /action === "publish"/);
  assert.match(edgeFunction, /source:\s*barcode \? "barcode" : "food_label"/);
});

test("attributes Open Food Facts and explains barcode processing", () => {
  assert.match(dashboard, /Product data from[\s\S]*?Open Food Facts[\s\S]*?ODbL/i);
  assert.match(privacy, /barcode number is checked against the shared food library/i);
  assert.match(privacy, /sent to Open Food Facts/i);
  assert.match(privacy, /review and editing before the food log is saved/i);
});
