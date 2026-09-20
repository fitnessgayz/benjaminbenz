const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Expected ${name} to exist`);
  const remainder = source.slice(start);
  const next = remainder.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? remainder : remainder.slice(0, next + 1);
}

function historyFixture(logs = []) {
  const context = vm.createContext({
    warmUpSetType: "warm_up",
    workingSetType: "working",
    warmUpSetNumberBase: 1000,
    warmupExerciseCode: "WARMUP",
    cardioExerciseCode: "CARDIO",
    trainingLogs: logs,
    todayDate: () => "2026-09-20",
    exerciseNameInputForLog: (element) => element.nameInput
  });
  vm.runInContext([
    "normalizedSetType",
    "normalizeExerciseHistoryName",
    "currentExerciseHistoryName",
    "logsForExerciseDisplay",
    "clientWorkoutHistorySessionKey",
    "previousWorkoutWeightLog"
  ].map(functionSource).join("\n"), context);
  return context;
}

function historyLog(weight, overrides = {}) {
  return {
    exercise_name: "Cable fly",
    exercise_code: "A",
    workout_title: "Workout A",
    entry_date: "2026-09-18",
    created_at: "2026-09-18T12:00:00Z",
    set_type: "working",
    set_number: 1,
    weight_used: weight,
    reps: 12,
    ...overrides
  };
}

test("copy uses the latest prior workout, not the personal record or active workout", () => {
  const context = historyFixture();
  const logs = [
    historyLog(60, { entry_date: "2026-08-01" }),
    historyLog(17.15),
    historyLog(50, { entry_date: "2026-09-20" }),
    historyLog(80, { entry_date: "2026-09-21" })
  ];
  assert.equal(context.previousWorkoutWeightLog(logs, "2026-09-20", 1).weight_used, 17.15);
  assert.equal(context.previousWorkoutWeightLog(logs, "2026-08-01", 1), null);
  assert.equal(context.previousWorkoutWeightLog([], "2026-09-20", 1), null);
});

test("copy selects one latest session on the previous day and matches the round's set", () => {
  const context = historyFixture();
  const logs = [
    historyLog(20, { session_id: "early", created_at: "2026-09-18T08:00:00Z" }),
    historyLog(25, { session_id: "early", set_number: 2, created_at: "2026-09-18T08:01:00Z" }),
    historyLog(40, { workout_session_id: "late", created_at: "2026-09-18T18:00:00Z" }),
    historyLog(45, { workout_session_id: "late", set_number: 3, created_at: "2026-09-18T18:02:00Z" }),
    historyLog(42.5, { workout_session_id: "late", set_number: 2, created_at: "2026-09-18T18:01:00Z" })
  ];
  assert.equal(context.previousWorkoutWeightLog(logs, "2026-09-20", 1).weight_used, 40);
  assert.equal(context.previousWorkoutWeightLog(logs, "2026-09-20", 2).weight_used, 42.5);
  assert.equal(context.previousWorkoutWeightLog(logs, "2026-09-20", 5).weight_used, 45);
  assert.equal(context.previousWorkoutWeightLog(logs.slice().reverse(), "2026-09-20", 2).weight_used, 42.5);
});

test("legacy sessions use workout titles and do not mix same-day sets", () => {
  const context = historyFixture();
  const logs = [
    historyLog(20, { workout_title: "Morning", created_at: "2026-09-18T08:00:00Z" }),
    historyLog(25, { workout_title: "Morning", set_number: 2, created_at: "2026-09-18T08:01:00Z" }),
    historyLog(30, { workout_title: "Evening", created_at: "2026-09-18T18:00:00Z" })
  ];
  assert.equal(context.previousWorkoutWeightLog(logs, "2026-09-20", 2).weight_used, 30);
});

test("copy ignores warm-ups, cardio and invalid weights while accepting recorded zero", () => {
  const context = historyFixture();
  const logs = [
    historyLog(0),
    ...[
      { weight_used: 900, set_type: "warm_up" },
      { weight_used: 800, set_type: null, set_number: 1001 },
      { weight_used: 700, exercise_code: "WARMUP" },
      { weight_used: 600, exercise_code: "CARDIO" },
      { weight_used: null }, { weight_used: undefined }, { weight_used: "" },
      { weight_used: " " }, { weight_used: "bad" }, { weight_used: Infinity },
      { weight_used: -1 }
    ].map((overrides) => historyLog(10, { entry_date: "2026-09-19", ...overrides }))
  ];
  assert.equal(context.previousWorkoutWeightLog(logs, "2026-09-20", 1).weight_used, 0);
  assert.equal(context.previousWorkoutWeightLog(logs.slice(1), "2026-09-20", 1), null);
});

test("copy follows the edited normalized exercise name across workout programs", () => {
  const context = historyFixture([
    historyLog(10, { entry_date: "2026-09-15" }),
    historyLog(17.5, { exercise_name: "  CABLE   FLY ", exercise_code: "CW3", workout_title: "Custom Workout" }),
    historyLog(80, { exercise_name: "Cable reverse fly", entry_date: "2026-09-19" }),
    historyLog(60, { exercise_code: "WARMUP", entry_date: "2026-09-19" })
  ]);
  const exercise = { dataset: { exerciseName: "Old exercise" }, nameInput: { value: "Cable fly" } };
  assert.equal(context.previousWorkoutWeightLog(context.logsForExerciseDisplay(exercise), "2026-09-20", 1).weight_used, 17.5);
  exercise.nameInput.value = "Cable reverse fly";
  assert.equal(context.previousWorkoutWeightLog(context.logsForExerciseDisplay(exercise), "2026-09-20", 1).weight_used, 80);
  exercise.nameInput.value = "";
  assert.equal(context.previousWorkoutWeightLog(context.logsForExerciseDisplay(exercise), "2026-09-20", 1), null);
});

// A small DOM fixture keeps these behavior checks on the real portal functions
// without requiring a browser, network access, or a database write.
function element(tag, attributes = {}, children = []) {
  const node = {
    tagName: tag.toUpperCase(), attributes: { ...attributes }, dataset: {}, children: [],
    value: "", textContent: "", disabled: false, hidden: false, parentElement: null,
    connectedRoot: false,
    get isConnected() { return this.connectedRoot || Boolean(this.parentElement?.isConnected); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; },
    remove() {
      if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      this.parentElement = null;
    },
    matches(selector) {
      return selector.split(",").some((alternative) => {
        const parts = alternative.trim().split(/\s+(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/);
        const matchesPart = (candidate, part) => {
          if (!candidate) return false;
          const name = part.match(/^[a-z][a-z0-9-]*/i)?.[0];
          if (name && candidate.tagName !== name.toUpperCase()) return false;
          const classes = Array.from(part.matchAll(/\.([\w-]+)/g), (match) => match[1]);
          if (classes.some((className) => !candidate.classList.contains(className))) return false;
          return Array.from(part.matchAll(/\[([^\]=]+)(?:=["']?([^\]"']*)["']?)?\]/g)).every((match) => {
            const key = match[1].startsWith("data-") ? match[1].slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()) : null;
            const value = key ? candidate.dataset[key] : candidate.attributes[match[1]];
            return match[2] === undefined ? value !== undefined : String(value) === match[2];
          });
        };
        if (!matchesPart(this, parts.pop())) return false;
        let ancestor = this.parentElement;
        while (parts.length) {
          const part = parts.pop();
          while (ancestor && !matchesPart(ancestor, part)) ancestor = ancestor.parentElement;
          if (!ancestor) return false;
          ancestor = ancestor.parentElement;
        }
        return true;
      });
    },
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; },
    querySelectorAll(selector) {
      return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
    },
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    focus() { this.focused = true; }
  };
  Object.entries(attributes).forEach(([key, value]) => {
    if (key.startsWith("data-")) node.dataset[key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = String(value);
  });
  const classes = new Set((attributes.class || "").split(/\s+/).filter(Boolean));
  node.classList = {
    contains: (name) => classes.has(name),
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    toggle: (name, force) => {
      const next = force === undefined ? !classes.has(name) : force;
      if (next) classes.add(name); else classes.delete(name);
      return next;
    }
  };
  children.forEach((child) => node.appendChild(child));
  return node;
}

function input(attributes, value = "") {
  const field = element("input", attributes);
  field.value = value;
  return field;
}

function workoutFixture(specs = [{ name: "Cable fly" }, { name: "Squat" }], logs) {
  const history = logs || [historyLog(17.15), historyLog(100, { exercise_name: "Squat" })];
  const context = historyFixture(history);
  const root = element("main");
  root.connectedRoot = true;
  const panel = root.appendChild(element("section", { class: "client-workout-panel-custom" }));
  const carousel = panel.appendChild(element("div", { "data-custom-workout-grouped": "true", "data-custom-workout-format": "superset" }));
  const sourceNode = carousel.appendChild(element("div", { "data-custom-workout-grouped-source": "" }));
  const list = sourceNode.appendChild(element("div", { "data-custom-workout-list": "" }));
  const section = carousel.appendChild(element("section", { "data-custom-grouped-round": "1" }));
  const copy = section.appendChild(element("button", { "data-custom-grouped-copy-weights": "1" }));
  const copyStatus = section.appendChild(element("div", { "data-custom-grouped-copy-status": "" }));
  const copyMessage = copyStatus.appendChild(element("span", { "data-custom-grouped-copy-message": "" }));
  const undo = copyStatus.appendChild(element("button", { "data-custom-grouped-undo-weights": "1" }));
  const status = carousel.appendChild(element("p", { "data-custom-grouped-status": "" }));
  const rows = specs.map((spec, index) => {
    const card = list.appendChild(element("article", { "data-custom-exercise-card": "" }));
    const log = card.appendChild(element("div", {
      "data-exercise-log": "", "data-exercise-name": spec.name,
      "data-workout-title": "Custom Workout", "data-exercise-code": `CW${index}`
    }));
    log.nameInput = log.appendChild(input({ "data-exercise-name-input": "" }, spec.name));
    log.dateInput = log.appendChild(input({ "data-log-date": "" }, "2026-09-20"));
    const row = log.appendChild(element("div", { "data-set-row": "", "data-set-number": "1", "data-set-type": "working" }));
    const canonicalWeight = row.appendChild(input({ "data-set-weight": "" }, spec.weight || ""));
    const canonicalReps = row.appendChild(input({ "data-set-reps": "" }, spec.reps || "15"));
    row.dataset.repsInReserve = spec.rir || "2";
    row.appendChild(element("button", { "data-complete-set": "" }));
    if (spec.complete) row.classList.add("is-complete");
    const visibleRow = section.appendChild(element("div", {
      class: "custom-workout-grouped-row", "data-custom-grouped-exercise-index": String(index),
      "data-custom-grouped-set-type": "working", "data-custom-grouped-set-number": "1"
    }));
    const visibleWeight = visibleRow.appendChild(input({ "data-custom-grouped-field": "weight" }, spec.visibleWeight ?? canonicalWeight.value));
    const visibleReps = visibleRow.appendChild(input({ "data-custom-grouped-field": "reps" }, canonicalReps.value));
    const visibleRir = visibleRow.appendChild(input({ "data-custom-grouped-field": "rir" }, row.dataset.repsInReserve));
    return { log, row, visibleRow, canonicalWeight, canonicalReps, visibleWeight, visibleReps, visibleRir };
  });
  let persists = 0;
  Object.assign(context, {
    setTypeForRow: (row) => row.dataset.setType,
    persistCustomWorkoutDraftForElement: () => { persists += 1; },
    formatLogDate: (date) => date,
    workoutSetUnit: () => "Round",
    escapeHtml: (value) => String(value ?? "")
  });
  vm.runInContext([
    "customWorkoutCarouselCards", "customWorkoutGroupedLogElements", "customWorkoutGroupedRows",
    "customWorkoutGroupedCanonicalRow", "customWorkoutGroupedRoundIsLogged", "customWorkoutGroupedStatus",
    "customWorkoutGroupedCopyContext", "customWorkoutGroupedCopyRows", "refreshCustomWorkoutGroupedCopyWeights",
    "clearCustomWorkoutGroupedWeightCopy", "customWorkoutGroupedCopyVisibleInput",
    "copyCustomWorkoutGroupedWeights", "undoCustomWorkoutGroupedWeights", "setCustomWorkoutGroupedRowComplete",
    "refreshCustomWorkoutGroupedCompletion", "syncCustomWorkoutGroupedField"
  ].map(functionSource).join("\n"), context);
  return { context, carousel, section, copy, undo, copyStatus, copyMessage, status, rows, get persists() { return persists; } };
}

test("copy fills empty working weights and keeps reps and RIR untouched", () => {
  const fixture = workoutFixture();
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.copy);
  assert.deepEqual(fixture.rows.map((row) => row.canonicalWeight.value), ["17.15", "100"]);
  assert.deepEqual(fixture.rows.map((row) => row.visibleWeight.value), ["17.15", "100"]);
  for (const row of fixture.rows) {
    assert.equal(row.canonicalReps.value, "15");
    assert.equal(row.visibleReps.value, "15");
    assert.equal(row.row.dataset.repsInReserve, "2");
    assert.equal(row.visibleRir.value, "2");
    assert.equal(row.row.classList.contains("is-complete"), false);
  }
  assert.equal(fixture.persists, 1, "Copy persists the draft once without logging any set");
  assert.equal(fixture.copy.disabled, true);
  assert.equal(fixture.undo.hidden, false);
  assert.equal(fixture.undo.focused, true);
  assert.match(fixture.copyMessage.textContent, /Weights copied.*2026-09-18/);
  fixture.context.undoCustomWorkoutGroupedWeights(fixture.undo);
  assert.deepEqual(fixture.rows.map((row) => row.canonicalWeight.value), ["", ""]);
  assert.deepEqual(fixture.rows.map((row) => row.visibleWeight.value), ["", ""]);
  assert.equal(fixture.copy.disabled, false);
  assert.equal(fixture.copy.focused, true);
  assert.equal(fixture.undo.hidden, true);
});

test("copy preserves typed zero, other entered weights and already logged rows", () => {
  const fixture = workoutFixture([
    { name: "Cable fly", weight: "0" }, { name: "Squat", weight: "80" },
    { name: "Cable fly", complete: true }, { name: "Squat", visibleWeight: "75" },
    { name: "Cable fly" }
  ]);
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.copy);
  assert.deepEqual(fixture.rows.map((row) => row.canonicalWeight.value), ["0", "80", "", "", "17.15"]);
  assert.equal(fixture.rows[3].visibleWeight.value, "75");
  fixture.context.undoCustomWorkoutGroupedWeights(fixture.undo);
  assert.deepEqual(fixture.rows.map((row) => row.canonicalWeight.value), ["0", "80", "", "", ""]);
});

test("no matching workout history leaves the round unchanged", () => {
  const fixture = workoutFixture([{ name: "New exercise" }]);
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.copy);
  assert.equal(fixture.rows[0].canonicalWeight.value, "");
  assert.equal(fixture.rows[0].visibleWeight.value, "");
  assert.equal(fixture.rows[0].canonicalReps.value, "15");
  assert.equal(fixture.persists, 0);
  assert.equal(fixture.copyStatus.hidden, false);
  assert.match(fixture.copyMessage.textContent, /No previous weights/);
});

test("manual edits invalidate Undo even when the copied value is entered again", () => {
  const fixture = workoutFixture();
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.copy);
  fixture.rows[0].visibleWeight.value = "20";
  fixture.context.syncCustomWorkoutGroupedField(fixture.rows[0].visibleWeight);
  fixture.rows[0].visibleWeight.value = "17.15";
  fixture.context.syncCustomWorkoutGroupedField(fixture.rows[0].visibleWeight);
  fixture.context.undoCustomWorkoutGroupedWeights(fixture.undo);
  assert.equal(fixture.rows[0].canonicalWeight.value, "17.15");
  assert.equal(fixture.rows[1].canonicalWeight.value, "");
});

test("logging and reopening a copied row cannot undo the logged weight", () => {
  const fixture = workoutFixture([{ name: "Cable fly" }]);
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.copy);
  fixture.context.setCustomWorkoutGroupedRowComplete(fixture.rows[0].row, true);
  fixture.context.setCustomWorkoutGroupedRowComplete(fixture.rows[0].row, false);
  fixture.context.undoCustomWorkoutGroupedWeights(fixture.undo);
  assert.equal(fixture.rows[0].canonicalWeight.value, "17.15");
});

test("Undo never clears weights after the exercise, workout date or title changes", () => {
  for (const change of [
    (row) => { row.log.nameInput.value = "Cable reverse fly"; },
    (row) => { row.log.dateInput.value = "2026-09-21"; },
    (row) => { row.log.dataset.workoutTitle = "Different workout"; }
  ]) {
    const fixture = workoutFixture([{ name: "Cable fly" }]);
    fixture.context.copyCustomWorkoutGroupedWeights(fixture.copy);
    change(fixture.rows[0]);
    fixture.context.undoCustomWorkoutGroupedWeights(fixture.undo);
    assert.equal(fixture.rows[0].canonicalWeight.value, "17.15");
  }
});

test("copy leaves warm-up inputs untouched", () => {
  const fixture = workoutFixture([{ name: "Cable fly" }]);
  const warmup = fixture.rows[0].log.appendChild(element("div", {
    "data-set-row": "", "data-set-number": "1001", "data-set-type": "warm_up"
  }));
  const weight = warmup.appendChild(input({ "data-set-weight": "" }, ""));
  const reps = warmup.appendChild(input({ "data-set-reps": "" }, "8"));
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.copy);
  assert.equal(fixture.rows[0].canonicalWeight.value, "17.15");
  assert.equal(weight.value, "");
  assert.equal(reps.value, "8");
});

test("Undo survives replacement of visible fields while canonical rows remain", () => {
  const fixture = workoutFixture([{ name: "Cable fly" }]);
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.copy);
  const row = fixture.rows[0];
  row.visibleWeight.remove();
  const replacement = row.visibleRow.appendChild(input({ "data-custom-grouped-field": "weight" }, row.canonicalWeight.value));
  fixture.context.refreshCustomWorkoutGroupedCopyWeights(fixture.carousel);
  assert.equal(fixture.undo.hidden, false);
  fixture.context.undoCustomWorkoutGroupedWeights(fixture.undo);
  assert.equal(row.canonicalWeight.value, "");
  assert.equal(replacement.value, "");
});

test("Undo preserves a visible edit that has not yet reached the canonical input", () => {
  const fixture = workoutFixture([{ name: "Cable fly" }]);
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.copy);
  fixture.rows[0].visibleWeight.value = "20";
  fixture.context.undoCustomWorkoutGroupedWeights(fixture.undo);
  assert.equal(fixture.rows[0].canonicalWeight.value, "17.15");
  assert.equal(fixture.rows[0].visibleWeight.value, "20");
});

test("refresh invalidates Undo permanently when the exercise context changes", () => {
  const fixture = workoutFixture([{ name: "Cable fly" }]);
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.copy);
  fixture.rows[0].log.nameInput.value = "Squat";
  fixture.context.refreshCustomWorkoutGroupedCopyWeights(fixture.carousel);
  fixture.rows[0].log.nameInput.value = "Cable fly";
  fixture.context.undoCustomWorkoutGroupedWeights(fixture.undo);
  assert.equal(fixture.rows[0].canonicalWeight.value, "17.15");
});
