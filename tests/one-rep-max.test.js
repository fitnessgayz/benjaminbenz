const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const calculatorSource = fs.readFileSync(path.join(root, "js/one-rep-max.js"), "utf8");
const progressionSource = fs.readFileSync(path.join(root, "js/workout-progression.js"), "utf8");
const clientSource = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const coachSource = fs.readFileSync(path.join(root, "js/coach-workout-log.js"), "utf8");
const clientHTML = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const coachHTML = fs.readFileSync(path.join(root, "coach-workout-log.html"), "utf8");

function calculatorAPI() {
  const context = vm.createContext({
    window: {},
    document: { addEventListener() {} }
  });
  vm.runInContext(calculatorSource, context);
  return context.window.FWBOneRepMax;
}

function calculatorAPIWithProgression() {
  const context = vm.createContext({
    window: {},
    document: { addEventListener() {} }
  });
  vm.runInContext(progressionSource, context);
  context.window.FWB_WORKOUT_PROGRESSION = context.FWB_WORKOUT_PROGRESSION;
  vm.runInContext(calculatorSource, context);
  return context.window.FWBOneRepMax;
}

test("Epley 1RM estimate preserves a true single and rejects invalid sets", () => {
  const api = calculatorAPI();
  assert.equal(api.estimate(225, 1), 225);
  assert.equal(api.estimate(185, 5), 185 * (1 + (5 / 30)));
  for (const values of [[0, 5], [-1, 5], [185, 0], [185, 31], [185, 2.5]]) {
    assert.equal(api.estimate(...values), null);
  }
});

test("calculator rounds the estimate and training percentages to practical 5 lb increments", () => {
  const api = calculatorAPI();
  const estimated = api.estimate(185, 5);
  assert.equal(api.roundToIncrement(estimated), 215);
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.trainingWeights(estimated))),
    [
      { percentage: 70, weight: 150 },
      { percentage: 75, weight: 160 },
      { percentage: 80, weight: 175 },
      { percentage: 85, weight: 185 },
      { percentage: 90, weight: 195 }
    ]
  );
});

test("8–12 rep programs start at the lighter 70 percent end of the working range", () => {
  const api = calculatorAPI();
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.trainingRecommendation(265, 8, 12))),
    {
      repMin: 8,
      repMax: 12,
      startingWeight: 185,
      minimumWeight: 185,
      maximumWeight: 210,
      minimumPercentage: .70,
      maximumPercentage: .80
    }
  );
  assert.equal(api.trainingRecommendation(0, 8, 12), null);
  assert.equal(api.trainingRecommendation(200, 31, 35), null);
});

test("calculator reads the assigned exercise rep range from workout metadata", () => {
  const api = calculatorAPIWithProgression();
  const rows = [1, 2, 3].map((number) => ({ dataset: { setType: "working", setNumber: String(number) } }));
  const log = {
    dataset: {
      exerciseName: "Dumbbell bench press",
      exercisePrescription: "3 × 8–12",
      progressionConfig: "null"
    },
    querySelector() { return null; },
    querySelectorAll() { return rows; }
  };

  const program = api.programForLog(log);
  assert.equal(program.rep_min, 8);
  assert.equal(program.rep_max, 12);
  assert.equal(program.planned_sets, 3);
});

test("client and coach workout loggers expose Weight and PR calculator entry points", () => {
  for (const source of [clientSource, coachSource]) {
    assert.match(source, /class="one-rm-trigger"[^>]*data-one-rm-open/);
    assert.match(source, /class="one-rm-pr-trigger"[^>]*data-one-rm-open[^>]*data-one-rm-source="pr"/);
    assert.match(source, /dataset\.oneRmSources = JSON\.stringify/);
  }
});

test("client web, installed mobile web app, and coach iOS web workspace load the shared calculator", () => {
  for (const html of [clientHTML, coachHTML]) {
    assert.match(html, /css\/one-rep-max\.css\?v=2/);
    assert.match(html, /js\/one-rep-max\.js\?v=2/);
  }
  assert.match(clientHTML, /apple-mobile-web-app-capable/);
  assert.match(coachHTML, /apple-mobile-web-app-capable/);
});
