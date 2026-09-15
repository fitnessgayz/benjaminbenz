const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const dashboardHtml = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const inviteHtml = fs.readFileSync(path.join(root, "client-invite.html"), "utf8");
const portalSource = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const inviteSource = fs.readFileSync(path.join(root, "js/client-invite.js"), "utf8");

function sourceForFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return source.slice(start, end >= 0 ? end : undefined);
}

function portalCalculator() {
  const names = [
    "numberValue",
    "roundToNearest",
    "nutritionHeightInches",
    "nutritionActivityFactor",
    "nutritionGoalMultiplier",
    "nutritionProteinPerPound",
    "nutritionGoalLabel",
    "calculateNutritionPlan"
  ];
  const source = names.map((name) => sourceForFunction(portalSource, name)).join("\n");

  return Function(`${source}; return { nutritionActivityFactor, calculateNutritionPlan };`)();
}

test("uses workout frequency as a conservative increment instead of double-counting activity", () => {
  const { nutritionActivityFactor } = portalCalculator();
  const inviteFactorSource = sourceForFunction(inviteSource, "inviteActivityFactor");
  const inviteActivityFactor = Function(`${inviteFactorSource}; return inviteActivityFactor;`)();
  const examples = [
    [0, "mostly_sitting", "moderate", 1.2],
    [3, "mixed", "moderate", 1.4],
    [5, "active_job", "moderate", 1.55],
    [7, "active_job", "hard", 1.61]
  ];

  examples.forEach(([workouts, movement, intensity, expected]) => {
    assert.equal(nutritionActivityFactor(workouts, movement, intensity), expected);
    assert.equal(inviteActivityFactor(workouts, movement, intensity), expected);
  });
  assert.equal(nutritionActivityFactor(0, "active_job", "hard"), 1.4);
});

test("returns a conservative starting target for the reported client example", () => {
  const { calculateNutritionPlan } = portalCalculator();
  const result = calculateNutritionPlan({
    goal: "recomposition",
    age: "42",
    sex: "male",
    height: "5'6\"",
    current_weight: "154",
    workouts_per_week: "5",
    daily_movement: "active_job",
    training_intensity: "moderate"
  });

  assert.equal(result.error, undefined);
  assert.equal(result.plan.activity_factor, "1.55");
  assert.equal(result.plan.maintenance_calories, "2400");
  assert.equal(result.plan.calories, "2350 cal");
  assert.equal(result.plan.protein, "155g");
  assert.equal(result.plan.carbs, "285g");
  assert.equal(result.plan.fat, "65g");
});

test("uses a five percent starting surplus for muscle gain", () => {
  const { calculateNutritionPlan } = portalCalculator();
  const result = calculateNutritionPlan({
    goal: "muscle_gain",
    age: "42",
    sex: "male",
    height: "5'6\"",
    current_weight: "154",
    workouts_per_week: "5",
    daily_movement: "active_job",
    training_intensity: "moderate"
  });

  assert.equal(result.plan.calories, "2525 cal");
});

test("cache-busts both live calculator scripts", () => {
  assert.match(dashboardHtml, /js\/client-portal\.js\?v=nutrition-calculator-1/);
  assert.match(inviteHtml, /js\/client-invite\.js\?v=nutrition-calculator-1/);
});
