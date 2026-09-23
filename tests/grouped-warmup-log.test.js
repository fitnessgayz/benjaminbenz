const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function functionSource(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `${name} must exist`);
  const start = match.index;
  const next = source.slice(start + match[0].length).search(/\n(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(/);
  assert.ok(next >= 0, `${name} must have a following declaration`);
  return source.slice(start, start + match[0].length + next);
}

function evaluate(names, context = {}) {
  vm.createContext(context);
  vm.runInContext(names.map(functionSource).join("\n"), context);
  return context;
}

function classList(initial = []) {
  const values = new Set(initial);
  return {
    contains: (name) => values.has(name),
    add: (name) => values.add(name),
    remove: (name) => values.delete(name),
    toggle(name, enabled) {
      const next = enabled === undefined ? !values.has(name) : enabled;
      if (next) values.add(name); else values.delete(name);
      return next;
    }
  };
}

function field(value = "", name = "") {
  const attributes = {};
  return {
    value, dataset: name ? { customGroupedField: name } : {}, disabled: false,
    setAttribute: (key, value) => { attributes[key] = String(value); },
    getAttribute: (key) => attributes[key] || null,
    removeAttribute: (key) => { delete attributes[key]; },
    focus() { this.focused = true; }
  };
}

test("first working set or round omits Copy last, retains PR, and later rounds retain copying", () => {
  for (const format of ["single", "superset", "circuit"]) {
    const logs = [{ name: "Squat", warmups: [{}], working: [{}, {}] }];
    const context = evaluate(["workoutSetUnit", "customWorkoutGroupedSectionsMarkup"], {
      warmUpSetType: "warm_up", workingSetType: "working",
      customWorkoutGroupedLogElements: () => logs,
      currentExerciseLabel: (log) => log.name,
      customWorkoutGroupedRows: (log, type) => type === "warm_up" ? log.warmups : log.working,
      customWorkoutGroupedRoundCount: () => 2,
      customWorkoutGroupedRoundIsLogged: () => false,
      customWorkoutGroupedSetRowMarkup: (_row, _code, _index, type) => `<div data-test-fields="${type}"></div>`,
      customWorkoutGroupedRoundCode: () => "A1"
    });
    const html = context.customWorkoutGroupedSectionsMarkup({ dataset: { customWorkoutFormat: format } });
    const first = html.match(/<section[^>]*data-custom-grouped-round="1"[\s\S]*?<\/section>/)?.[0];
    const second = html.match(/<section[^>]*data-custom-grouped-round="2"[\s\S]*?<\/section>/)?.[0];
    assert.ok(first);
    assert.ok(second);
    assert.doesNotMatch(first, /Copy last|Copy previous|No previous/);
    assert.match(first, /data-custom-grouped-copy-source="pr"/);
    assert.match(second, new RegExp(`Copy last ${format === "single" ? "set" : "round"}`));
    assert.match(second, /data-custom-grouped-copy-weights="2"/);
    const warmup = html.match(/<section[^>]*data-kind="warmup"[\s\S]*?<\/section>/)?.[0];
    assert.ok(warmup);
    assert.match(warmup, /data-custom-grouped-log-warmup/);
    assert.ok(warmup.indexOf("data-custom-grouped-log-warmup") > warmup.indexOf('data-test-fields="warm_up"'));
  }
});

function warmupFixture(specs = [{ weight: "20", reps: "8" }], options = {}) {
  const status = { textContent: "" };
  const progress = { textContent: "" };
  const button = field();
  button.dataset.customGroupedLogWarmup = "";
  const roundButton = field();
  roundButton.dataset.customGroupedLogRound = "1";
  const nameFields = { hidden: true };
  const nameToggle = field();
  const nameSection = { querySelector: (selector) => selector.includes("name-fields") ? nameFields : selector.includes("name-toggle") ? nameToggle : null };
  const names = specs.map((spec, index) => {
    const name = field(spec.name === undefined ? `Exercise ${index + 1}` : spec.name);
    name.closest = () => nameSection;
    return name;
  });
  const panel = {};
  const carousel = {
    dataset: { customWorkoutFormat: options.format || "superset" },
    closest: (selector) => selector === ".client-workout-panel" ? panel : null
  };
  const section = { dataset: { kind: "warmup" }, closest: () => carousel };
  const workingSection = { dataset: { kind: "round", customGroupedRound: "1" }, closest: () => carousel };
  button.closest = (selector) => selector.includes("data-custom-workout-grouped") ? carousel : section;
  roundButton.closest = (selector) => selector.includes("data-custom-workout-grouped") ? carousel : workingSection;
  const rows = specs.map((spec, index) => {
    const canonicalFields = { weight: field(spec.weight ?? ""), reps: field(spec.reps ?? "") };
    const completeButton = field();
    const canonical = {
      dataset: { setNumber: "1001", setType: "warm_up", groupedRoundRequired: "true", repsInReserve: spec.rir || "" },
      classList: classList(spec.complete ? ["is-complete"] : []),
      querySelector: (selector) => selector.includes("data-complete-set") ? completeButton : canonicalFields[selector.match(/data-set-(weight|reps)/)?.[1]] || null
    };
    const fields = { weight: field(spec.weight ?? "", "weight"), reps: field(spec.reps ?? "", "reps"), rir: field(spec.rir ?? "", "rir") };
    const code = field();
    code.setAttribute("aria-label", `Warm-up ${index + 1} not logged`);
    const visible = {
      dataset: { customGroupedExerciseIndex: String(index), customGroupedSetType: "warm_up", customGroupedSetNumber: "1001" },
      classList: classList(),
      querySelector: (selector) => selector.includes("data-custom-grouped-set-toggle") ? code : fields[selector.match(/="([^"]+)"/)?.[1]] || null,
      querySelectorAll: () => Object.values(fields),
      closest: (selector) => selector.includes("data-custom-workout-grouped") ? carousel : selector.includes("data-custom-grouped-round") ? null : section
    };
    for (const input of Object.values(fields)) input.closest = (selector) => selector.includes("data-custom-workout-grouped") ? carousel : visible;
    const workingFields = { weight: field("70"), reps: field("5") };
    const working = {
      dataset: { setNumber: "1", setType: "working", groupedRoundRequired: "true" },
      classList: classList(spec.workingComplete ? ["is-complete"] : []),
      querySelector: (selector) => workingFields[selector.match(/data-set-(weight|reps)/)?.[1]] || null
    };
    const log = { warmups: [canonical], working: [working], querySelector: () => null };
    return { canonical, canonicalFields, fields, code, visible, working, workingFields, log };
  });
  const controls = [...rows.flatMap((row) => [...Object.values(row.fields), row.code]), button];
  section.querySelectorAll = (selector) => selector === ".custom-workout-grouped-row" ? rows.map((row) => row.visible) : controls;
  section.querySelector = (selector) => selector.includes("log-warmup") ? button : null;
  workingSection.querySelectorAll = () => [];
  workingSection.querySelector = (selector) => selector.includes("log-round") ? roundButton : null;
  carousel.querySelector = (selector) => selector.includes('data-kind="warmup"') ? section
    : selector.includes("log-warmup") ? button : selector.includes("grouped-progress") ? progress
      : selector.includes("grouped-status") ? status : null;
  carousel.querySelectorAll = (selector) => selector.includes("group-name-input") ? names
    : selector === ".custom-workout-grouped-row" ? rows.map((row) => row.visible)
      : selector === "[data-custom-grouped-round]" ? [workingSection]
        : selector === "[data-custom-grouped-log-round]" ? [roundButton] : [];
  const workoutFields = {
    title: field("Workout"), date: field("2026-09-21"), format: field(options.format || "superset"),
    notes: field("Keep my notes"), finish: field()
  };
  const otherCardRoundButton = field();
  const panelControls = [
    ...controls, ...names, ...Object.values(workoutFields), roundButton, otherCardRoundButton,
    ...rows.flatMap((row) => [...Object.values(row.canonicalFields), ...Object.values(row.workingFields)])
  ];
  panel.querySelectorAll = (selector) => selector === "input, textarea, select, button" ? panelControls
    : selector === "[data-custom-grouped-log-round]" ? [roundButton, otherCardRoundButton] : [];
  let persists = 0;
  const saves = [];
  const context = evaluate([
    "setRowInputValues", "customWorkoutGroupedCanonicalRow", "setCustomWorkoutGroupedRowComplete",
    "customWorkoutGroupedStatus", "workoutSetUnit", "validateCustomWorkoutGroupedExerciseNames",
    "validateCustomWorkoutGroupedSection", "completeEnteredCustomWorkoutWarmUps",
    "refreshCustomWorkoutGroupedWarmUp", "refreshCustomWorkoutGroupedCompletion",
    "syncCustomWorkoutGroupedField", "logCustomWorkoutGroupedWarmUp", "logCustomWorkoutGroupedRound"
  ], {
    warmUpSetType: "warm_up", workingSetType: "working",
    customWorkoutGroupedLogElements: () => rows.map((row) => row.log),
    customWorkoutGroupedRows: (log, type) => log ? type === "warm_up" ? log.warmups : log.working : [],
    customWorkoutGroupedRoundIsLogged: () => rows.every((row) => row.working.classList.contains("is-complete")),
    clearCustomWorkoutGroupedWeightCopy() {},
    refreshCustomWorkoutGroupedCopyWeights() {},
    syncWorkoutExerciseList() {},
    persistCustomWorkoutDraftForElement: () => persists++,
    customWorkoutGroupedTimerConflict: () => Boolean(options.timerConflict),
    saveTrainingLogRows: async (saveButton, logs, statusNode, saveOptions) => {
      saves.push({ logs, options: saveOptions, states: rows.map((row) => ({ warmup: row.canonical.classList.contains("is-complete"), working: row.working.classList.contains("is-complete") })) });
      const result = options.save ? await options.save() : { saved: true };
      if (result.saved) statusNode.textContent = saveOptions.successMessage;
      else statusNode.textContent = "Could not save yet.";
      return result;
    },
    renderCustomWorkoutGroupedCard: () => { throw new Error("Warm-up logging must not rebuild the workout"); },
    startWorkoutElapsedTimer: () => { throw new Error("Warm-up logging must not start the working-round timer"); },
    resetRestTimer: () => { throw new Error("Warm-up logging must not start a round rest timer"); }
  });
  return { context, panel, carousel, section, button, roundButton, otherCardRoundButton, controls, panelControls, workoutFields, rows, names, nameFields, status, saves, get persists() { return persists; } };
}

test("Log warm-up saves only entered warm-ups and leaves working and blank rows untouched", async () => {
  const fixture = warmupFixture([
    { weight: "20", reps: "8" }, { weight: "0", reps: "0" }, { weight: "", reps: "" }
  ]);
  const result = await fixture.context.logCustomWorkoutGroupedWarmUp(fixture.button);
  assert.equal(result.saved, true);
  assert.equal(fixture.saves.length, 1);
  assert.deepEqual(fixture.saves[0].states, [
    { warmup: true, working: false }, { warmup: true, working: false }, { warmup: false, working: false }
  ]);
  assert.equal(fixture.saves[0].options.setType, "warm_up");
  assert.equal(fixture.saves[0].options.skipRemovedSetDelete, true);
  assert.equal(fixture.saves[0].options.skipLogRefresh, true);
  assert.match(fixture.button.textContent, /Warm-up logged/);
  assert.equal(fixture.button.disabled, true);
  assert.equal(fixture.rows[2].canonical.classList.contains("is-complete"), false);
  assert.ok(fixture.persists > 0);
});

test("blank warm-ups and invalid partial rows never save or mark any rows", async () => {
  for (const spec of [
    {}, { weight: "20", reps: "" }, { weight: "", reps: "8" },
    { weight: "-1", reps: "8" }, { weight: "20", reps: "-1" },
    { weight: "20", reps: "8", rir: "6" }, { rir: "2" }
  ]) {
    const fixture = warmupFixture([spec]);
    const result = await fixture.context.logCustomWorkoutGroupedWarmUp(fixture.button);
    assert.equal(result.saved, false);
    assert.equal(fixture.saves.length, 0);
    assert.equal(fixture.rows[0].canonical.classList.contains("is-complete"), false);
    assert.equal(fixture.rows[0].working.classList.contains("is-complete"), false);
    assert.equal(fixture.button.disabled, false);
  }
});

test("warm-up logging requires exercise names and respects a different active workout", async () => {
  const unnamed = warmupFixture([{ name: "", weight: "20", reps: "8" }]);
  const invalid = await unnamed.context.logCustomWorkoutGroupedWarmUp(unnamed.button);
  assert.equal(invalid.saved, false);
  assert.equal(unnamed.saves.length, 0);
  assert.equal(unnamed.names[0].getAttribute("aria-invalid"), "true");
  assert.equal(unnamed.names[0].focused, true);
  assert.equal(unnamed.nameFields.hidden, false);
  assert.match(unnamed.status.textContent, /warm-up/);
  const conflict = warmupFixture(undefined, { timerConflict: true });
  const result = await conflict.context.logCustomWorkoutGroupedWarmUp(conflict.button);
  assert.equal(result.saved, false);
  assert.equal(conflict.saves.length, 0);
});

test("editing a saved warm-up reopens it and restores Log warm-up without changing working rows", async () => {
  const fixture = warmupFixture([{ weight: "20", reps: "8", workingComplete: true }]);
  await fixture.context.logCustomWorkoutGroupedWarmUp(fixture.button);
  fixture.rows[0].fields.reps.value = "10";
  fixture.context.syncCustomWorkoutGroupedField(fixture.rows[0].fields.reps);
  assert.equal(fixture.rows[0].canonicalFields.reps.value, "10");
  assert.equal(fixture.rows[0].canonical.classList.contains("is-complete"), false);
  assert.equal(fixture.rows[0].working.classList.contains("is-complete"), true);
  assert.equal(fixture.button.disabled, false);
  assert.match(fixture.button.textContent, /^Log warm-up$/);
  const result = await fixture.context.logCustomWorkoutGroupedWarmUp(fixture.button);
  assert.equal(result.saved, true);
  assert.equal(fixture.rows[0].canonical.classList.contains("is-complete"), true);
});

test("failed or thrown warm-up saves restore each row's original completion state and keep entered values", async () => {
  for (const save of [async () => ({ saved: false }), async () => { throw new Error("offline"); }]) {
    const fixture = warmupFixture([
      { weight: "20", reps: "8", complete: true }, { weight: "30", reps: "6", workingComplete: true }
    ], { save });
    const result = await fixture.context.logCustomWorkoutGroupedWarmUp(fixture.button);
    assert.equal(result.saved, false);
    assert.deepEqual(fixture.rows.map((row) => row.canonical.classList.contains("is-complete")), [true, false]);
    assert.deepEqual(fixture.rows.map((row) => row.working.classList.contains("is-complete")), [false, true]);
    assert.deepEqual(fixture.rows.map((row) => row.canonicalFields.reps.value), ["8", "6"]);
    assert.equal(fixture.button.disabled, false);
    assert.notEqual(fixture.carousel.dataset.customGroupedWarmupSaving, "true");
  }
});

test("warm-up saving locks the entire workout and prevents remounting or duplicate actions until completion", async () => {
  let resolveSave;
  const fixture = warmupFixture(undefined, { save: () => new Promise((resolve) => { resolveSave = resolve; }) });
  fixture.rows[0].fields.rir.disabled = true;
  fixture.workoutFields.notes.disabled = true;
  const pending = fixture.context.logCustomWorkoutGroupedWarmUp(fixture.button);
  assert.equal(fixture.carousel.dataset.customGroupedWarmupSaving, "true");
  assert.equal(fixture.button.disabled, true);
  assert.match(fixture.button.textContent, /Saving warm-up/);
  assert.equal(fixture.button.getAttribute("aria-busy"), "true");
  assert.ok(fixture.panelControls.every((control) => control.disabled), "Warm-up, working rows, other cards, names, format, date, and finish controls all remain locked");
  const renderingContext = evaluate(["renderCustomWorkoutGroupedCard"], {
    customWorkoutGroupedLogElements: () => { throw new Error("A pending warm-up save must keep the existing controls mounted"); }
  });
  renderingContext.renderCustomWorkoutGroupedCard(fixture.carousel);
  await fixture.context.logCustomWorkoutGroupedWarmUp(fixture.button);
  await fixture.context.logCustomWorkoutGroupedRound(fixture.roundButton);
  assert.equal(fixture.saves.length, 1);
  resolveSave({ saved: true });
  await pending;
  assert.equal(fixture.rows[0].fields.weight.disabled, false);
  assert.equal(fixture.rows[0].fields.rir.disabled, true, "Existing disabled state must be restored");
  assert.equal(fixture.workoutFields.notes.disabled, true, "Existing disabled state outside the warm-up is restored");
  for (const control of [fixture.names[0], fixture.workoutFields.date, fixture.workoutFields.title, fixture.workoutFields.format, fixture.workoutFields.finish, fixture.otherCardRoundButton, fixture.rows[0].workingFields.reps]) {
    assert.equal(control.disabled, false, "Other workout controls are reenabled when the warm-up finishes saving");
  }
  assert.equal(fixture.button.disabled, true, "The saved state keeps logging disabled until edits");
  assert.equal(fixture.button.getAttribute("aria-busy"), "false");
});

test("warm-up logging waits for an in-flight working round save in any workout card", async () => {
  for (const busyControl of ["roundButton", "otherCardRoundButton"]) {
    const fixture = warmupFixture();
    fixture[busyControl].disabled = true;
    const result = await fixture.context.logCustomWorkoutGroupedWarmUp(fixture.button);
    assert.equal(result.saved, false);
    assert.equal(fixture.saves.length, 0);
    assert.equal(fixture.rows[0].canonical.classList.contains("is-complete"), false);
    assert.equal(fixture.button.disabled, false);
  }
});

test("warm-up-only persistence filters out already completed working rows", async () => {
  const sent = [];
  const local = [];
  const warmup = { entry_date: "2026-09-21", set_type: "warm_up", set_number: 1001, weight_used: 20, reps: 8 };
  const working = { entry_date: "2026-09-21", set_type: "working", set_number: 1, weight_used: 100, reps: 5 };
  const context = evaluate(["saveTrainingLogRows"], {
    activeClientEmail: "client@example.test",
    supabaseClient: { from: () => ({ upsert: (rows) => {
      sent.push(plain(rows));
      return { select: async () => ({ data: rows, error: null }) };
    } }) },
    rowsForTrainingLog: () => [warmup, working],
    normalizedSetType: (type) => type,
    upsertLocalTrainingLog: (row) => local.push(row),
    updateVisibleSetProgress() {},
    renderClientTrainingLogs() {}
  });
  const result = await context.saveTrainingLogRows(null, [{}], {}, { setType: "warm_up", skipRemovedSetDelete: true, skipLogRefresh: true });
  assert.equal(result.saved, true);
  assert.deepEqual(sent, [[warmup]]);
  assert.deepEqual(plain(local), [warmup]);
});
