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

function copyFixtureContext() {
  const context = vm.createContext({
    warmUpSetType: "warm_up",
    workingSetType: "working",
    warmUpSetNumberBase: 1000,
    warmupExerciseCode: "WARMUP",
    cardioExerciseCode: "CARDIO",
    todayDate: () => "2026-09-20",
    exerciseNameInputForLog: (element) => element.nameInput,
    logsForExerciseDisplay: () => { throw new Error("Copy must never read workout history"); },
    trainingLogs: new Proxy([], { get() { throw new Error("Copy must never read workout history"); } })
  });
  vm.runInContext([
    "normalizedSetType", "normalizeExerciseHistoryName", "currentExerciseHistoryName"
  ].map(functionSource).join("\n"), context);
  return context;
}

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

function workoutFixture(specs = [{ name: "Cable fly" }, { name: "Squat" }], options = {}) {
  const context = copyFixtureContext();
  if (options.prLogs) context.trainingLogs = options.prLogs;
  const roundNumber = options.roundNumber ?? 2;
  const root = element("main");
  root.connectedRoot = true;
  const panel = root.appendChild(element("section", { class: "client-workout-panel-custom" }));
  const carousel = panel.appendChild(element("div", { "data-custom-workout-grouped": "true", "data-custom-workout-format": options.format || "superset" }));
  const sourceNode = carousel.appendChild(element("div", { "data-custom-workout-grouped-source": "" }));
  const list = sourceNode.appendChild(element("div", { "data-custom-workout-list": "" }));
  const section = carousel.appendChild(element("section", { "data-custom-grouped-round": String(roundNumber) }));
  const copy = section.appendChild(element("button", { "data-custom-grouped-copy-weights": String(roundNumber) }));
  const prCopy = options.prLogs ? section.appendChild(element("button", {
    "data-custom-grouped-copy-weights": String(roundNumber), "data-custom-grouped-copy-source": "pr"
  })) : null;
  const prPreview = options.prLogs ? section.appendChild(element("p", { "data-custom-grouped-pr-preview": "" })) : null;
  const copyStatus = section.appendChild(element("div", { "data-custom-grouped-copy-status": "" }));
  const copyMessage = copyStatus.appendChild(element("span", { "data-custom-grouped-copy-message": "" }));
  const undo = copyStatus.appendChild(element("button", { "data-custom-grouped-undo-weights": String(roundNumber) }));
  const status = carousel.appendChild(element("p", { "data-custom-grouped-status": "" }));
  const rows = specs.map((spec, index) => {
    const card = list.appendChild(element("article", { "data-custom-exercise-card": "" }));
    const log = card.appendChild(element("div", {
      "data-exercise-log": "", "data-exercise-name": spec.name,
      "data-workout-title": "Custom Workout", "data-exercise-code": `CW${index}`
    }));
    log.nameInput = log.appendChild(input({ "data-exercise-name-input": "" }, spec.name));
    log.dateInput = log.appendChild(input({ "data-log-date": "" }, "2026-09-20"));
    const previousRows = Array.from({ length: roundNumber - 1 }, (_, priorIndex) => {
      const previous = log.appendChild(element("div", {
        "data-set-row": "", "data-set-number": String(priorIndex + 1), "data-set-type": "working"
      }));
      const value = spec.previousWeights ? spec.previousWeights[priorIndex]
        : Object.hasOwn(spec, "previousWeight") ? spec.previousWeight : spec.name === "Squat" ? "100" : "17.15";
      previous.appendChild(input({ "data-set-weight": "" }, value ?? ""));
      previous.appendChild(input({ "data-set-reps": "" }, "12"));
      if (spec.previousComplete) previous.classList.add("is-complete");
      return previous;
    });
    const row = log.appendChild(element("div", { "data-set-row": "", "data-set-number": String(roundNumber), "data-set-type": "working" }));
    const canonicalWeight = row.appendChild(input({ "data-set-weight": "" }, spec.weight || ""));
    const canonicalReps = row.appendChild(input({ "data-set-reps": "" }, spec.reps || "15"));
    row.dataset.repsInReserve = spec.rir || "2";
    row.appendChild(element("button", { "data-complete-set": "" }));
    if (spec.complete) row.classList.add("is-complete");
    const visibleRow = section.appendChild(element("div", {
      class: "custom-workout-grouped-row", "data-custom-grouped-exercise-index": String(index),
      "data-custom-grouped-set-type": "working", "data-custom-grouped-set-number": String(roundNumber)
    }));
    const visibleWeight = visibleRow.appendChild(input({ "data-custom-grouped-field": "weight" }, spec.visibleWeight ?? canonicalWeight.value));
    const visibleReps = visibleRow.appendChild(input({ "data-custom-grouped-field": "reps" }, canonicalReps.value));
    const visibleRir = visibleRow.appendChild(input({ "data-custom-grouped-field": "rir" }, row.dataset.repsInReserve));
    return { log, row, previousRows, visibleRow, canonicalWeight, canonicalReps, visibleWeight, visibleReps, visibleRir };
  });
  let persists = 0;
  Object.assign(context, {
    setTypeForRow: (row) => row.dataset.setType,
    persistCustomWorkoutDraftForElement: () => { persists += 1; },
    formatLogDate: (date) => date,
    escapeHtml: (value) => String(value ?? "")
  });
  vm.runInContext([
    "customWorkoutCarouselCards", "customWorkoutGroupedLogElements", "customWorkoutGroupedRows",
    "customWorkoutGroupedCanonicalRow", "customWorkoutGroupedRoundIsLogged", "customWorkoutGroupedStatus",
    "customWorkoutGroupedCopyContext", "customWorkoutGroupedCopyRows", "refreshCustomWorkoutGroupedCopyWeights",
    "clearCustomWorkoutGroupedWeightCopy", "customWorkoutGroupedCopyVisibleInput", "workoutSetUnit",
    "previousCustomWorkoutGroupedWeight",
    "copyCustomWorkoutGroupedWeights", "undoCustomWorkoutGroupedWeights", "setCustomWorkoutGroupedRowComplete",
    "refreshCustomWorkoutGroupedCompletion", "syncCustomWorkoutGroupedField",
    ...(options.prLogs ? ["logsForExerciseDisplay", "personalBestWeightLog", "customWorkoutGroupedPersonalBestLabel", "currentExerciseLabel", "exerciseProgressNumber"] : [])
  ].map(functionSource).join("\n"), context);
  return { context, root, panel, carousel, section, copy, prCopy, prPreview, undo, copyStatus, copyMessage, status, rows, get persists() { return persists; } };
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
  assert.match(fixture.copyMessage.textContent, /Weights copied.*Round 1/);
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

test("copy reads the immediately previous set in this workout without consulting history", () => {
  const fixture = workoutFixture([{ name: "Cable fly", previousWeights: ["10", "22.5", "35"] }], { roundNumber: 4 });
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.copy);
  assert.equal(fixture.rows[0].canonicalWeight.value, "35");
  assert.equal(fixture.rows[0].visibleWeight.value, "35");
  assert.match(fixture.copyMessage.textContent, /Weight copied.*Round 3/);
  assert.equal(fixture.rows[0].canonicalWeight.dataset.lastWeightCopyRound, "3");
});

test("copy accepts zero and a logged previous set, and uses each exercise's own prior weight", () => {
  const fixture = workoutFixture([
    { name: "Cable fly", previousWeight: "0", previousComplete: true },
    { name: "Cable fly", previousWeight: "27.5", previousComplete: true },
    { name: "Squat", previousWeight: "120" }
  ]);
  const unrelated = workoutFixture([{ name: "Cable fly", previousWeight: "999" }]);
  fixture.panel.appendChild(unrelated.carousel);
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.copy);
  assert.deepEqual(fixture.rows.map((row) => row.canonicalWeight.value), ["0", "27.5", "120"]);
  assert.equal(unrelated.rows[0].canonicalWeight.value, "");
  assert.equal(fixture.rows[0].previousRows[0].classList.contains("is-complete"), true);
});

test("blank or invalid immediately previous weights never fall back to an earlier set or history", () => {
  for (const value of ["", " ", "invalid", "Infinity", "-1"]) {
    const fixture = workoutFixture([{ name: "Cable fly", previousWeights: ["50", value] }], { roundNumber: 3 });
    assert.equal(fixture.context.previousCustomWorkoutGroupedWeight(fixture.rows[0].log, 3), null);
    fixture.context.copyCustomWorkoutGroupedWeights(fixture.copy);
    assert.equal(fixture.rows[0].canonicalWeight.value, "");
    assert.equal(fixture.rows[0].visibleWeight.value, "");
    assert.equal(fixture.rows[0].canonicalReps.value, "15");
    assert.equal(fixture.persists, 0);
  }
});

test("missing previous set rows or inputs return no source", () => {
  const fixture = workoutFixture();
  assert.equal(fixture.context.previousCustomWorkoutGroupedWeight(fixture.rows[0].log, 8), null);
  fixture.rows[0].previousRows[0].querySelector("[data-set-weight]").remove();
  assert.equal(fixture.context.previousCustomWorkoutGroupedWeight(fixture.rows[0].log, 2), null);
  assert.equal(fixture.context.previousCustomWorkoutGroupedWeight(null, 2), null);
});

test("first set has no source and disables copying", () => {
  const fixture = workoutFixture([{ name: "Cable fly" }], { roundNumber: 1, format: "single" });
  assert.equal(fixture.context.previousCustomWorkoutGroupedWeight(fixture.rows[0].log, 1), null);
  fixture.context.refreshCustomWorkoutGroupedCopyWeights(fixture.carousel);
  assert.equal(fixture.copy.disabled, true);
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.copy);
  assert.equal(fixture.rows[0].canonicalWeight.value, "");
  assert.equal(fixture.persists, 0);
});

test("straight-set copy status identifies the preceding set", () => {
  const fixture = workoutFixture([{ name: "Cable fly", previousWeight: "25" }], { format: "single" });
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.copy);
  assert.match(fixture.copyMessage.textContent, /Weight copied.*Set 1/);
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

function personalBestLog(weight, overrides = {}) {
  return {
    exercise_name: "Cable fly", exercise_code: "A", workout_title: "Old workout",
    entry_date: "2026-08-01", set_type: "working", set_number: 1,
    weight_used: weight, reps: 8, ...overrides
  };
}

test("PR action uses the exercise's highest logged working weight and displays its reps and date", () => {
  const fixture = workoutFixture([{ name: "Cable fly", previousWeight: "17.5" }], { prLogs: [
    personalBestLog(25, { entry_date: "2026-09-19", reps: 15 }),
    personalBestLog(60, { reps: 6 }),
    personalBestLog(40, { entry_date: "2026-07-01", reps: 12 })
  ] });
  fixture.context.refreshCustomWorkoutGroupedCopyWeights(fixture.carousel);
  assert.equal(fixture.prPreview.hidden, false);
  assert.match(fixture.prPreview.textContent, /Personal records: Cable fly: 60 lb × 6 reps · 2026-08-01/);
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.prCopy);
  assert.equal(fixture.rows[0].canonicalWeight.value, "60");
  assert.equal(fixture.rows[0].visibleWeight.value, "60");
  assert.equal(fixture.rows[0].canonicalReps.value, "15", "PR reps are reference text, not a replacement for current reps");
  assert.equal(fixture.rows[0].visibleReps.value, "15");
  assert.equal(fixture.rows[0].row.dataset.repsInReserve, "2");
  assert.match(fixture.copyMessage.textContent, /Cable fly/);
  assert.match(fixture.copyMessage.textContent, /60 lb/);
  assert.match(fixture.copyMessage.textContent, /6/);
  assert.match(fixture.copyMessage.textContent, /2026-08-01/);
  assert.equal(fixture.rows[0].canonicalWeight.dataset.lastWeightCopySource, "pr");
  assert.equal(fixture.persists, 1);
  fixture.context.undoCustomWorkoutGroupedWeights(fixture.undo);
  assert.equal(fixture.rows[0].canonicalWeight.value, "");
  assert.equal(fixture.rows[0].visibleWeight.value, "");
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.copy);
  assert.equal(fixture.rows[0].canonicalWeight.value, "17.5", "The separate previous-set action retains its source");
  assert.match(fixture.copyMessage.textContent, /Round 1/);
});

test("PR copying is available on the first set while previous-set copying stays disabled", () => {
  const fixture = workoutFixture([{ name: "Cable fly" }], {
    roundNumber: 1, format: "single", prLogs: [personalBestLog(30)]
  });
  fixture.context.refreshCustomWorkoutGroupedCopyWeights(fixture.carousel);
  assert.equal(fixture.copy.disabled, true);
  assert.equal(fixture.prCopy.disabled, false);
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.prCopy);
  assert.equal(fixture.rows[0].canonicalWeight.value, "30");
  assert.equal(fixture.rows[0].row.classList.contains("is-complete"), false);
  fixture.context.undoCustomWorkoutGroupedWeights(fixture.undo);
  assert.equal(fixture.rows[0].canonicalWeight.value, "");
  assert.equal(fixture.copy.disabled, true);
  assert.equal(fixture.prCopy.focused, true, "Undo returns keyboard focus to the enabled PR action");
});

test("PR ignores warm-ups, cardio, missing dates and invalid weights while preserving a recorded zero", () => {
  const invalidLogs = [
    personalBestLog(900, { set_type: "warm_up" }),
    personalBestLog(800, { set_type: null, set_number: 1001 }),
    personalBestLog(700, { exercise_code: "WARMUP" }),
    personalBestLog(600, { exercise_code: "CARDIO" }),
    personalBestLog(500, { entry_date: "" }),
    ...[null, undefined, "", " ", "bad", Infinity, -1].map((value) => personalBestLog(value))
  ];
  const fixture = workoutFixture([{ name: "Cable fly" }], { prLogs: [...invalidLogs, personalBestLog(0)] });
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.prCopy);
  assert.equal(fixture.rows[0].canonicalWeight.value, "0");
  assert.equal(fixture.rows[0].visibleWeight.value, "0");
  const unavailable = workoutFixture([{ name: "Cable fly" }], { prLogs: invalidLogs });
  unavailable.context.refreshCustomWorkoutGroupedCopyWeights(unavailable.carousel);
  assert.equal(unavailable.prCopy.disabled, true);
  assert.equal(unavailable.prPreview.hidden, true);
  assert.equal(unavailable.prPreview.textContent, "");
  unavailable.context.copyCustomWorkoutGroupedWeights(unavailable.prCopy);
  assert.equal(unavailable.rows[0].canonicalWeight.value, "");
  assert.equal(unavailable.persists, 0);
});

test("PR lookup follows the edited exercise name across programs and does not mix other exercises", () => {
  const fixture = workoutFixture([{ name: "Cable fly" }, { name: "New exercise" }], { prLogs: [
    personalBestLog(50, { exercise_name: "  CABLE   FLY  ", exercise_code: "CW7", workout_title: "Different program" }),
    personalBestLog(80, { exercise_name: "Cable reverse fly", exercise_code: "A" })
  ] });
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.prCopy);
  assert.deepEqual(fixture.rows.map((row) => row.canonicalWeight.value), ["50", ""]);
  fixture.context.undoCustomWorkoutGroupedWeights(fixture.undo);
  fixture.rows[0].log.nameInput.value = "Cable reverse fly";
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.prCopy);
  assert.equal(fixture.rows[0].canonicalWeight.value, "80");
});

test("PR preserves entered weights, unsynchronized edits and completed rows", () => {
  const fixture = workoutFixture([
    { name: "Cable fly", weight: "0" },
    { name: "Cable fly", weight: "20" },
    { name: "Cable fly", visibleWeight: "25" },
    { name: "Cable fly", complete: true },
    { name: "Cable fly" }
  ], { prLogs: [personalBestLog(60)] });
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.prCopy);
  assert.deepEqual(fixture.rows.map((row) => row.canonicalWeight.value), ["0", "20", "", "", "60"]);
  assert.equal(fixture.rows[2].visibleWeight.value, "25");
  fixture.context.undoCustomWorkoutGroupedWeights(fixture.undo);
  assert.deepEqual(fixture.rows.map((row) => row.canonicalWeight.value), ["0", "20", "", "", ""]);
});

test("manual edits and logging also invalidate Undo for PR weights", () => {
  const fixture = workoutFixture([{ name: "Cable fly" }, { name: "Cable fly" }], { prLogs: [personalBestLog(60)] });
  fixture.context.copyCustomWorkoutGroupedWeights(fixture.prCopy);
  fixture.rows[0].visibleWeight.value = "65";
  fixture.context.syncCustomWorkoutGroupedField(fixture.rows[0].visibleWeight);
  fixture.rows[0].visibleWeight.value = "60";
  fixture.context.syncCustomWorkoutGroupedField(fixture.rows[0].visibleWeight);
  fixture.context.setCustomWorkoutGroupedRowComplete(fixture.rows[1].row, true);
  fixture.context.setCustomWorkoutGroupedRowComplete(fixture.rows[1].row, false);
  fixture.context.undoCustomWorkoutGroupedWeights(fixture.undo);
  assert.deepEqual(fixture.rows.map((row) => row.canonicalWeight.value), ["60", "60"]);
});

test("PR preview omits missing or invalid reps while retaining exercise, weight and date", () => {
  for (const reps of [null, undefined, "", "invalid", 0, -1]) {
    const fixture = workoutFixture([{ name: "Cable fly" }], { prLogs: [personalBestLog(20, { reps })] });
    fixture.context.refreshCustomWorkoutGroupedCopyWeights(fixture.carousel);
    assert.equal(fixture.prPreview.textContent, "Personal records: Cable fly: 20 lb · 2026-08-01");
  }
});
