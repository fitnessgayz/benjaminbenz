const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");

function declaration(name) {
  const start = new RegExp(`function ${name}\\s*\\(`).exec(source);
  assert.ok(start, `${name} exists`);
  const next = source.slice(start.index + start[0].length).search(/\n(?:async\s+)?function\s+[\w$]+\s*\(/);
  return source.slice(start.index, next < 0 ? undefined : start.index + start[0].length + next);
}

function cardioContext(names) {
  const context = vm.createContext({
    cardioExerciseCode: "CARDIO", activeClientEmail: "client@example.com",
    todayDate: () => "2026-11-04", workoutGymLocationForElement: () => "",
    exerciseNameInputForLog: (log) => log.querySelector("[data-cardio-type]"),
    clearInterval: () => {}, persistCustomWorkoutDraftForElement: () => {},
    scheduleTrainingLogAutosave: () => {}
  });
  vm.runInContext("const cardioIntervalTimers = new WeakMap();", context);
  vm.runInContext("const cardioHybridTimers = new WeakMap();", context);
  vm.runInContext(names.map(declaration).join("\n"), context);
  return context;
}

test("cardio notes preserve interval settings, effort, heart rate and free text", () => {
  const context = cardioContext(["parseCardioNotes", "buildCardioNotes"]);
  const saved = context.buildCardioNotes("185", "Felt strong", {
    mode: "intervals", heartRate: "147", effort: "8", workSeconds: "40", restSeconds: "20", rounds: "6",
    stations: "Air bike\nBurpees"
  });
  assert.deepEqual(JSON.parse(JSON.stringify(context.parseCardioNotes(saved))), {
    calories: "185", heartRate: "147", effort: "8", mode: "intervals",
    workSeconds: "40", restSeconds: "20", rounds: "6", stations: "Air bike | Burpees",
    amrapCap: "", amrapRounds: "", amrapReps: "", hybridSegments: "", hybridSplits: "", notes: "Felt strong"
  });
  assert.equal(context.parseCardioNotes("Calories: 90\nEasy run").notes, "Easy run");
});

test("AMRAP and hybrid details survive save and reopen", () => {
  const context = cardioContext(["parseCardioNotes", "buildCardioNotes"]);
  const amrap = context.parseCardioNotes(context.buildCardioNotes("", "Hard effort", {
    mode: "amrap", amrapCap: "20", amrapRounds: "5", amrapReps: "12"
  }));
  assert.equal(amrap.mode, "amrap");
  assert.equal(amrap.amrapCap, "20");
  assert.equal(amrap.amrapRounds, "5");
  assert.equal(amrap.amrapReps, "12");
  const hybrid = context.parseCardioNotes(context.buildCardioNotes("", "", {
    mode: "hybrid", hybridSegments: "Run 1 km\nSkiErg", hybridSplits: "300 | 540"
  }));
  assert.equal(hybrid.mode, "hybrid");
  assert.equal(hybrid.hybridSegments, "Run 1 km | SkiErg");
  assert.equal(hybrid.hybridSplits, "300 | 540");
});

test("HIIT timing rests between rounds and pace derives from distance", () => {
  const context = cardioContext(["cardioIntervalTotalSeconds", "cardioPaceText"]);
  assert.equal(context.cardioIntervalTotalSeconds("40", "20", "6"), 340);
  assert.equal(context.cardioIntervalTotalSeconds("40", "20", "2", 3), 260);
  assert.equal(context.cardioIntervalTotalSeconds("40", "20", "1"), 40);
  assert.equal(context.cardioIntervalTotalSeconds("0", "20", "6"), 0);
  assert.equal(context.cardioPaceText("30", "3"), "Average pace 10:00 / mi");
});

test("saved cardio summary shows heart rate and pace", () => {
  const context = cardioContext(["parseCardioNotes", "cardioPaceText", "cardioDisplay"]);
  const summary = context.cardioDisplay({
    weight_used: 30, reps: 3,
    notes: "Average heart rate: 145 bpm\nEffort: 7/10\nHill run"
  });
  assert.match(summary, /145 bpm/);
  assert.match(summary, /10:00 \/ mi/);
  assert.match(summary, /effort 7\/10/);
});

test("interval timer changes from work to rest and skips rest after the last round", () => {
  const context = cardioContext(["cardioIntervalTotalSeconds", "cardioStationNames", "cardioIntervalTick"]);
  const status = { textContent: "" };
  const toggle = { textContent: "" };
  const fields = {
    "[data-cardio-work]": { value: "40" }, "[data-cardio-rest]": { value: "20" },
    "[data-cardio-rounds]": { value: "2" }, "[data-cardio-stations]": { value: "Air bike\nBurpees" },
    "[data-cardio-timer-status]": status,
    "[data-cardio-timer-toggle]": toggle
  };
  const log = { querySelector: (selector) => fields[selector], isConnected: true };
  context.log = log;
  vm.runInContext("cardioIntervalTimers.set(log, { elapsed: 0, startedAt: 1000, running: true, intervalID: 1 })", context);
  context.cardioIntervalTick(log, 46_000);
  assert.equal(status.textContent, "Burpees · round 1 of 2 · 0:35");
  context.cardioIntervalTick(log, 86_000);
  assert.equal(status.textContent, "Rest · round 1 of 2 · 0:15");
  context.cardioIntervalTick(log, 101_000);
  assert.equal(status.textContent, "Air bike · round 2 of 2 · 0:40");
  context.cardioIntervalTick(log, 181_000);
  assert.equal(status.textContent, "Intervals complete");
  assert.equal(toggle.textContent, "Restart timer");
});

test("AMRAP countdown reaches its cap and fills actual duration", () => {
  const context = cardioContext(["cardioIntervalTotalSeconds", "cardioStationNames", "cardioIntervalTick"]);
  const status = { textContent: "" };
  const duration = { value: "" };
  const fields = {
    "[data-cardio-mode]": { value: "amrap" }, "[data-cardio-amrap-cap]": { value: "20" },
    "[data-cardio-timer-status]": status, "[data-cardio-timer-toggle]": { textContent: "" },
    "[data-cardio-duration]": duration
  };
  const log = { querySelector: (selector) => fields[selector], isConnected: true };
  context.log = log;
  vm.runInContext("cardioIntervalTimers.set(log, { elapsed: 0, startedAt: 1000, running: true, intervalID: 1 })", context);
  context.cardioIntervalTick(log, 601_000);
  assert.equal(status.textContent, "AMRAP · 10:00 remaining");
  context.cardioIntervalTick(log, 1_201_000);
  assert.equal(status.textContent, "Time cap reached");
  assert.equal(duration.value, "20");
});

test("hybrid stopwatch records segment splits and final duration", () => {
  const context = cardioContext(["cardioHybridSegmentNames", "cardioHybridSavedSplits", "cardioHybridTick", "completeCardioHybridSegment"]);
  const fields = {
    "[data-cardio-hybrid-segments]": { value: "Run 1 km\nSkiErg" },
    "[data-cardio-hybrid-splits]": { value: "" },
    "[data-cardio-hybrid-status]": { textContent: "" },
    "[data-cardio-hybrid-toggle]": { textContent: "" },
    "[data-cardio-hybrid-next]": { disabled: false },
    "[data-cardio-hybrid-split-display]": { textContent: "" },
    "[data-cardio-duration]": { value: "" }
  };
  const log = { querySelector: (selector) => fields[selector], isConnected: true };
  context.log = log;
  vm.runInContext("cardioHybridTimers.set(log, { elapsed: 300, startedAt: Date.now() - 2000, running: true, splits: [300], intervalID: 1 })", context);
  context.completeCardioHybridSegment(log);
  assert.match(fields["[data-cardio-hybrid-splits]"].value, /^300 \| \d+$/);
  assert.equal(fields["[data-cardio-hybrid-status]"].textContent, "All segments complete");
  assert.ok(Number(fields["[data-cardio-duration]"].value) > 5);
});

test("cardio entry saves interval metadata in the existing workout row", () => {
  const context = cardioContext(["buildCardioNotes", "rowsForTrainingLog"]);
  const fields = {
    "[data-log-date]": { value: "2026-11-04" },
    "[data-log-notes]": { value: "Hill repeats" },
    "[data-cardio-type]": { value: "HIIT" },
    "[data-cardio-duration]": { value: "5.67" },
    "[data-cardio-distance]": { value: "" },
    "[data-cardio-calories]": { value: "120" },
    "[data-cardio-mode]": { value: "intervals" },
    "[data-cardio-heart-rate]": { value: "156" },
    "[data-cardio-effort]": { value: "9" },
    "[data-cardio-work]": { value: "40" },
    "[data-cardio-rest]": { value: "20" },
    "[data-cardio-rounds]": { value: "6" },
    "[data-cardio-stations]": { value: "Air bike\nBurpees" }
  };
  const log = {
    dataset: { cardioLog: "", workoutTitle: "Cardio", exerciseName: "Cardio" },
    querySelector: (selector) => fields[selector] || null,
    closest: () => null
  };
  const rows = context.rowsForTrainingLog(log);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].weight_used, 5.67);
  assert.equal(rows[0].reps, null);
  assert.match(rows[0].notes, /Cardio format: intervals\nWork: 40 seconds\nRest: 20 seconds\nRounds: 6\nStations: Air bike \| Burpees/);
  assert.match(rows[0].notes, /Average heart rate: 156 bpm/);
});

test("invalid interval values and heart rate block a cardio save", () => {
  const context = cardioContext(["cardioIntervalTotalSeconds", "cardioStationNames", "cardioLogIssues"]);
  const fields = {
    "[data-cardio-duration]": { value: "5.67" },
    "[data-cardio-distance]": { value: "" },
    "[data-cardio-calories]": { value: "" },
    "[data-cardio-mode]": { value: "intervals" },
    "[data-cardio-heart-rate]": { value: "300" },
    "[data-cardio-effort]": { value: "" },
    "[data-cardio-work]": { value: "0" },
    "[data-cardio-rest]": { value: "20" },
    "[data-cardio-rounds]": { value: "6" }
  };
  const issues = context.cardioLogIssues({ querySelector: (selector) => fields[selector] || null });
  assert.equal(issues.length, 2);
});
