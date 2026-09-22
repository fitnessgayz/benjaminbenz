const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const WorkoutLayout = require("../js/workout-layout.js");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}
const escapeHtml = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const plain = (value) => JSON.parse(JSON.stringify(value));
const attributes = (html) => Object.fromEntries(Array.from(html.matchAll(/([\w-]+)="([^"]*)"/g), (match) => [match[1], match[2]]));

function field(value = "", placeholder = "") {
  return {
    value, placeholder, dataset: { defaultPlaceholder: placeholder }, attributes: {},
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; }
  };
}
function rowsFromMarkup(html) {
  return Array.from(html.matchAll(/<div class="set-row[^"]*"[^>]*>[\s\S]*?<\/div>/g), (match) => {
    const data = attributes(match[0].slice(0, match[0].indexOf(">")));
    const values = new Set();
    const fields = Object.fromEntries(["weight", "reps"].map((name) => {
      const input = match[0].match(new RegExp(`<input[^>]*data-set-${name}[^>]*>`))?.[0] || "";
      const attrs = attributes(input);
      return [name, field(attrs.value || "", attrs["data-default-placeholder"] || attrs.placeholder || "")];
    }));
    const complete = { setAttribute(name, value) { this[name] = value; } };
    return {
      dataset: { setNumber: data["data-set-number"], setType: data["data-set-type"] }, fields,
      classList: {
        contains: (value) => values.has(value),
        toggle(value, enabled) { if (enabled) values.add(value); else values.delete(value); }
      },
      querySelector(selector) {
        if (selector === "[data-complete-set]") return complete;
        return fields[selector.match(/data-set-(weight|reps)/)?.[1]] || null;
      }
    };
  });
}

function api(extra = {}) {
  const context = vm.createContext({
    WorkoutLayout, escapeHtml, console,
    warmUpSetType: "warm_up", workingSetType: "working", warmUpSetNumberBase: 1000,
    warmupExerciseCode: "WU", cardioExerciseCode: "CARDIO",
    customWorkoutDefaultWorkingSetCount: 3, activeCustomWorkoutFormat: "single",
    todayDate: () => "2026-09-22", normalizeCustomWorkoutFormat: (value) => value,
    normalizeCustomWorkoutInlineGroupType: (value) => value,
    customWorkoutFormatMarker: (_format, index) => `A${index + 1}`,
    exerciseVideoMarkup: () => "", exerciseLogActions: () => "", customWorkoutInlineGroupOptionsMarkup: () => "",
    customWorkoutGroupedLogElements: (carousel) => carousel.logs,
    exerciseNameInputForLog: (log) => log.nameInput,
    currentExerciseLabel: (log) => log.nameInput.value,
    renumberSetRows: () => {}, syncVisibleSetTarget: () => {}, updateVisibleSetProgress: () => {},
    renderSetRirValue: () => {}, renderExerciseNotesState: () => {}, syncExerciseNamePreview: () => {},
    syncExerciseFinishedState: () => {}, renderPreviousExerciseWeights: () => {},
    logsForExerciseDisplay: (log) => log.history || [], logsForExercise: () => [],
    ...extra
  });
  const names = [
    "setCountFromPrescription", "repTargetsFromPrescription", "repsFromPrescription",
    "normalizedSetType", "warmUpOrdinal", "setNumberLabel", "setTypeForRow", "setRowMarkup", "setRows",
    "exerciseLogFields", "exerciseCard", "customWorkoutCardMarkup", "setRowInputValues",
    "customWorkoutGroupedRows", "customWorkoutGroupedRoundCount", "normalizeCustomWorkoutGroupedRoundRows",
    "customWorkoutGroupedRoundIsLogged", "workoutSetUnit", "customWorkoutGroupedRoundCode",
    "customWorkoutGroupedFieldMarkup", "customWorkoutGroupedSetRowMarkup", "customWorkoutGroupedSectionsMarkup",
    "assignedWorkoutPrescriptionLabel", "customWorkoutGroupedExerciseKeyMarkup",
    "savedStrengthSetSpecs", "restoreStrengthSetRows", "updateExerciseLogField"
  ];
  vm.runInContext(names.map(functionSource).join("\n"), context);
  return context;
}

function logFixture(context, prescription, { assigned = true, name = "Bench press", count, history = [] } = {}) {
  const parsedCount = count ?? context.setCountFromPrescription(prescription);
  let rows = rowsFromMarkup(context.setRows({ prescription }, parsedCount));
  const host = {
    querySelectorAll: () => rows,
    querySelector(selector) { return selector === "[data-set-reps]" ? rows[0]?.fields.reps : null; },
    insertAdjacentHTML(position, html) { assert.equal(position, "beforeend"); rows.push(...rowsFromMarkup(html)); },
    set innerHTML(html) { rows = rowsFromMarkup(html); },
    get innerHTML() { return ""; }
  };
  const card = { matches: () => false, querySelector: () => null, classList: { contains: () => false } };
  const panel = assigned ? {} : null;
  const log = {
    dataset: { exerciseName: name, exercisePrescription: prescription, prescribedSets: String(parsedCount), exerciseCode: "A", workoutTitle: "Assigned workout", setTargetMode: assigned ? "prescribed" : "visible" },
    nameInput: { value: name }, dateInput: { value: "2026-09-22" }, notes: { value: "" }, history,
    closest(selector) { return selector === ".client-workout-panel-assigned" ? panel : selector === ".workout-exercise-card" ? card : null; },
    querySelector(selector) {
      if (selector === "[data-set-rows]") return host;
      if (selector === "[data-log-date]") return this.dateInput;
      if (selector === "[data-log-notes]") return this.notes;
      return null;
    },
    querySelectorAll: () => rows,
    rows: () => rows,
    host
  };
  return log;
}
const working = (log) => log.rows().filter((row) => row.dataset.setType === "working");
const carouselFixture = (logs, assigned = true, format = "superset") => ({
  logs, dataset: { customWorkoutFormat: format },
  closest: (selector) => assigned && selector === ".client-workout-panel-assigned" ? {} : null
});

test("logger agrees with preview for multiplication signs, ranges, explicit sets and supported count limits", () => {
  const context = api();
  for (const [prescription, sets, reps] of [
    ["5×6–8", 5, ["6–8"]], ["4 × 6–8", 4, ["6–8"]], ["5x6-8", 5, ["6-8"]],
    ["6–8 reps x 5 sets", 5, ["6–8"]], ["4 sets x 6–8", 4, ["6–8"]],
    ["12, 10, 8 reps x 3 sets", 3, ["12", "10", "8"]], ["4 × 6–8/side", 4, ["6–8/side"]]
  ]) {
    assert.equal(context.setCountFromPrescription(prescription), sets, prescription);
    assert.equal(Number(WorkoutLayout.prescription(prescription).sets), sets);
    assert.deepEqual(plain(context.repTargetsFromPrescription(prescription)), reps);
  }
  assert.equal(context.setCountFromPrescription("12 sets x 6 reps"), 12, "Valid prescriptions must not be capped at the old 8-set limit");
  assert.equal(context.setCountFromPrescription("120 sets x 6 reps"), 99);
  for (const prescription of ["", "Custom sets", null, "0 sets"]) assert.equal(context.setCountFromPrescription(prescription), 3);
  for (const prescription of ["3 × 30–45 seconds", "45 sec x 3 sets", "3 × AMRAP", "AMRAP"]) {
    assert.deepEqual(plain(context.repTargetsFromPrescription(prescription)), [], "Time and effort instructions must not become numeric reps");
  }
});

test("real assigned exercise markup initializes five or four working sets plus one separate warm-up", () => {
  const context = api();
  for (const [prescription, count] of [["5×6–8", 5], ["4 × 6–8", 4]]) {
    const html = context.exerciseCard({ code: "A1", name: "Bench press", prescription }, "Upper body");
    const rows = rowsFromMarkup(html);
    assert.equal(rows.filter((row) => row.dataset.setType === "working").length, count);
    assert.equal(rows.filter((row) => row.dataset.setType === "warm_up").length, 1);
    assert.match(html, new RegExp(`data-prescribed-sets="${count}"`));
    assert.ok(html.includes(`data-exercise-prescription="${prescription}"`));
    rows.forEach((row) => { assert.equal(row.fields.weight.value, ""); assert.equal(row.fields.reps.value, ""); });
    assert.ok(rows.filter((row) => row.dataset.setType === "working").every((row) => row.fields.reps.dataset.defaultPlaceholder === "6–8"));
  }
});

test("a saved three-set session restores into the five-set prescription without losing saved values or status", () => {
  const saved = [1, 2, 3].map((number) => ({ entry_date: "2026-09-22", set_number: number, set_type: "working", weight_used: 100 + number, reps: 9 - number, exercise_name: "Bench press", effort_scale: "rir", effort_value: 2 }));
  const context = api({ logsForExercise: () => saved });
  const log = logFixture(context, "5×6–8");
  context.updateExerciseLogField(log);
  const rows = working(log);
  assert.equal(rows.length, 5);
  rows.slice(0, 3).forEach((row, index) => {
    assert.equal(row.fields.weight.value, saved[index].weight_used);
    assert.equal(row.fields.reps.value, saved[index].reps);
    assert.equal(row.dataset.repsInReserve, "2");
    assert.equal(row.classList.contains("is-complete"), true);
  });
  rows.slice(3).forEach((row) => {
    assert.equal(row.fields.weight.value, ""); assert.equal(row.fields.reps.value, "");
    assert.equal(row.fields.reps.dataset.defaultPlaceholder, "6–8");
    assert.equal(row.classList.contains("is-complete"), false);
  });
  context.restoreStrengthSetRows(log, [...saved, { set_number: 6, set_type: "working" }]);
  assert.equal(working(log).length, 6, "Saved extra sets must not be truncated to the prescription");
});

test("restoration retains per-set ladder targets instead of repeating the first rep target", () => {
  const context = api(); const log = logFixture(context, "12, 10, 8 reps x 3 sets");
  context.restoreStrengthSetRows(log, []);
  assert.deepEqual(working(log).map((row) => row.fields.reps.dataset.defaultPlaceholder), ["12", "10", "8"]);
});

test("assigned groups preserve unequal and manually edited counts and values when normalizing", () => {
  const context = api();
  const first = logFixture(context, "5×6–8"); const second = logFixture(context, "4×6–8");
  const originalRows = [...first.rows(), ...second.rows()];
  working(second)[1].fields.weight.value = "37.5"; working(second)[1].fields.reps.value = "7";
  assert.equal(context.normalizeCustomWorkoutGroupedRoundRows([first, second]), false);
  assert.deepEqual([working(first).length, working(second).length], [5, 4]);
  assert.deepEqual([...first.rows(), ...second.rows()], originalRows, "Existing input rows retain identity");
  assert.equal(working(second)[1].fields.weight.value, "37.5");
  assert.equal(working(second)[1].fields.reps.value, "7");
  first.host.insertAdjacentHTML("beforeend", context.setRowMarkup(6, "6–8", "working"));
  second.rows().pop();
  context.normalizeCustomWorkoutGroupedRoundRows([first, second]);
  assert.deepEqual([working(first).length, working(second).length], [6, 3], "Manual add/remove must survive rerender normalization");
});

test("the last assigned round contains only existing exercises and completes when those rows are logged", () => {
  const context = api();
  const first = logFixture(context, "5×6–8"); const second = logFixture(context, "4×6–8", { name: "Row" });
  const carousel = carouselFixture([first, second]);
  const sections = context.customWorkoutGroupedSectionsMarkup(carousel);
  const fifth = sections.match(/<section[^>]*data-custom-grouped-round="5"[\s\S]*?<\/section>/)?.[0];
  assert.ok(fifth);
  assert.equal((fifth.match(/class="custom-workout-grouped-row/g) || []).length, 1);
  assert.match(fifth, /data-custom-grouped-exercise-index="0"/);
  assert.doesNotMatch(fifth, /data-custom-grouped-exercise-index="1"/);
  assert.equal(context.customWorkoutGroupedRoundIsLogged(carousel, 5), false);
  working(first)[4].classList.toggle("is-complete", true);
  assert.equal(context.customWorkoutGroupedRoundIsLogged(carousel, 5), true);
  assert.equal(context.customWorkoutGroupedRoundIsLogged(carousel, 6), false, "A nonexistent round cannot count as logged");
});

test("target labels stay visible independently of history hints and retain timed or unilateral meaning", () => {
  const context = api();
  const first = logFixture(context, "5×6–8"); const second = logFixture(context, "4 × 6–8/side", { name: "Split squat" });
  working(first)[0].fields.reps.placeholder = "12";
  working(first)[0].fields.weight.placeholder = "200";
  const html = context.customWorkoutGroupedExerciseKeyMarkup(carouselFixture([first, second]));
  assert.match(html, /Target: 5 sets × 6–8 reps/);
  assert.match(html, /Target: 4 sets × 6–8\/side reps/);
  assert.equal((html.match(/data-custom-grouped-target=/g) || []).length, 2);
  assert.match(context.assignedWorkoutPrescriptionLabel(logFixture(context, "3 × 30–45 seconds")), /3 sets × 30–45 seconds$/);
  assert.match(context.assignedWorkoutPrescriptionLabel(logFixture(context, "3 × AMRAP")), /3 sets × AMRAP$/);
  assert.equal(context.assignedWorkoutPrescriptionLabel(logFixture(context, "Custom sets")), "");
  assert.equal(context.assignedWorkoutPrescriptionLabel(logFixture(context, "5×6–8", { assigned: false })), "");
});

test("custom workouts still default to three working sets and pad unequal grouped cards", () => {
  const context = api();
  const html = context.customWorkoutCardMarkup({ code: "CW1", name: "Custom press" }, "Custom workout");
  assert.equal(rowsFromMarkup(html).filter((row) => row.dataset.setType === "working").length, 3);
  const first = logFixture(context, "Custom sets", { assigned: false, count: 3 });
  const second = logFixture(context, "Custom sets", { assigned: false, count: 2 });
  assert.equal(context.normalizeCustomWorkoutGroupedRoundRows([first, second]), true);
  assert.deepEqual([working(first).length, working(second).length], [3, 3]);
  assert.equal(context.customWorkoutGroupedRoundIsLogged(carouselFixture([first, second], false), 3), false);
});
