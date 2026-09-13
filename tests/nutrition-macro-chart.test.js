const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const portal = fs.readFileSync(path.join(root, "js", "client-portal.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css", "style.css"), "utf8");

function sourceForFunction(name) {
  const start = portal.indexOf(`function ${name}(`);
  const end = portal.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return portal.slice(start, end >= 0 ? end : undefined);
}

test("calculates macro pie slices from protein, carb, and fat calories", () => {
  const numberSource = sourceForFunction("numberValue");
  const modelSource = sourceForFunction("nutritionMacroChartModel");
  const chartModel = Function(`${numberSource}\n${modelSource}; return nutritionMacroChartModel;`)();
  const chart = chartModel({ calories: "2725 cal", protein: "155g", carbs: "360g", fat: "75g" });

  assert.equal(chart.calories, 2725);
  assert.equal(chart.proteinGrams, 155);
  assert.equal(chart.carbGrams, 360);
  assert.equal(chart.fatGrams, 75);
  assert.equal(chart.hasMacros, true);
  assert.ok(Math.abs((chart.proteinPercent + chart.carbPercent + chart.fatPercent) - 100) < 0.0001);
  assert.ok(chart.proteinEnd > 0);
  assert.ok(chart.carbEnd > chart.proteinEnd);
  assert.ok(chart.carbEnd < 100);
});

test("renders an accessible live macro chart above compact editable targets", () => {
  const renderSource = sourceForFunction("renderNutritionMacroChart");
  const nutritionSource = sourceForFunction("renderClientNutrition");
  const saveHandlerSource = sourceForFunction("handleClientNutritionSave");
  const chartIndex = dashboard.indexOf('id="client-nutrition-macro-overview"');
  const targetIndex = dashboard.indexOf('id="client-nutrition-targets"');

  assert.notEqual(chartIndex, -1);
  assert.ok(chartIndex < targetIndex);
  assert.match(renderSource, /role="img"/);
  assert.match(renderSource, /Macro distribution:/);
  assert.match(renderSource, /--macro-protein-end/);
  assert.match(renderSource, /--macro-carbs-end/);
  assert.match(nutritionSource, /renderNutritionMacroChart\(nutrition\)/);
  assert.match(saveHandlerSource, /event\.target\.closest\("#client-nutrition-targets"\)/);
  assert.match(saveHandlerSource, /renderNutritionMacroChart\(clientNutritionTargetValues\(\)\)/);
});

test("keeps the chart and two-column target grid compact on mobile", () => {
  assert.match(styles, /\.nutrition-macro-chart\s*\{[\s\S]*?conic-gradient\(/);
  assert.match(styles, /\.nutrition-panel \.nutrition-macro-card\s*\{[\s\S]*?min-height:\s*88px/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?body\.client-dashboard-page #client-nutrition-targets\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\) !important/);
  assert.match(styles, /@media \(max-width: 390px\)[\s\S]*?\.nutrition-macro-chart\s*\{[\s\S]*?width:\s*150px/);
});
