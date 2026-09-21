const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../js/coach-workout-log.js"), "utf8");

function functionSource(name) {
  let start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Expected ${name} to exist`);
  if (source.slice(start - 6, start) === "async ") start -= 6;
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

// Minimal DOM fixture: production copy/undo functions operate on real selectors
// while autosave is counted without making network requests.
function element(tag, attributes = {}, children = []) {
  const node = {
    tagName: tag.toUpperCase(), attributes: { ...attributes }, dataset: {}, children: [],
    value: "", textContent: "", disabled: false, hidden: false, parentElement: null,
    connectedRoot: false, listeners: {},
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
    emit(type, target) { for (const listener of this.listeners[type] || []) listener({ target }); },
    checkValidity() { return Number.isFinite(Number(this.value)) && Number(this.value) >= 0; },
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
    focus() { if (!this.disabled && !this.hidden) this.focused = true; }
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

function fixture(specs = [{ name: "Press" }, { name: "Row" }], options = {}) {
  const round = options.round ?? 2;
  const format = options.format || "superset";
  const root = element("main");
  root.connectedRoot = true;
  const card = root.appendChild(element("article", {
    "data-coach-workout-group-card": "", "data-coach-workout-format": format,
    "data-coach-workout-group-indexes": specs.map((_, index) => index).join(",")
  }));
  const section = card.appendChild(element("section", {
    "data-coach-grouped-round": String(round), "data-coach-grouped-section": "round"
  }));
  const previous = section.appendChild(element("button", { "data-coach-copy-weights": "previous" }));
  const pr = section.appendChild(element("button", { "data-coach-copy-weights": "pr" }));
  const preview = section.appendChild(element("p", { "data-coach-pr-preview": "" }));
  const status = section.appendChild(element("div", { "data-coach-copy-status": "" }));
  const message = status.appendChild(element("span", { "data-coach-copy-message": "" }));
  const undo = status.appendChild(element("button", { "data-coach-undo-weights": "" }));
  const rows = specs.map((spec, exerciseIndex) => {
    const exercise = root.appendChild(element("article", { "data-coach-workout-exercise": "" }));
    const name = exercise.appendChild(input({ "data-coach-workout-name": "" }, spec.name));
    const warmup = exercise.appendChild(element("div", {
      "data-coach-workout-set-row": "", "data-coach-workout-set-type": "warm_up",
      "data-coach-workout-set-number": "1001"
    }));
    const warmupWeight = warmup.appendChild(input({ "data-coach-workout-weight": "" }, "999"));
    const working = Array.from({ length: round }, (_, setIndex) => {
      const row = exercise.appendChild(element("div", {
        "data-coach-workout-set-row": "", "data-coach-workout-set-type": "working",
        "data-coach-workout-set-number": String(setIndex + 1)
      }));
      const weight = setIndex === round - 1 ? spec.weight ?? ""
        : spec.previousWeights ? spec.previousWeights[setIndex] ?? "" : spec.previousWeight ?? "25";
      row.appendChild(input({ "data-coach-workout-weight": "" }, weight));
      row.appendChild(input({ "data-coach-workout-reps": "" }, "8"));
      row.appendChild(input({ "data-coach-workout-rir": "" }, "2"));
      if (setIndex === round - 1 && spec.complete) row.classList.add("is-complete");
      return row;
    });
    const row = working.at(-1);
    const weight = row.querySelector("[data-coach-workout-weight]");
    const visible = section.appendChild(input({
      "data-coach-grouped-field": "weight", "data-coach-grouped-exercise-index": String(exerciseIndex),
      "data-coach-grouped-set-type": "working", "data-coach-grouped-set-index": String(round - 1)
    }, spec.visibleWeight ?? weight.value));
    return { exercise, name, row, weight, visible, working, warmup, warmupWeight };
  });
  const client = { value: "client@example.com" };
  const date = { value: "2026-09-21" };
  const form = element("form");
  const list = element("div");
  let saves = 0;
  const context = vm.createContext({
    coachWorkoutWarmUpSetType: "warm_up", coachWorkoutWorkingSetType: "working", coachWorkoutWarmUpSetNumberBase: 1000,
    coachWorkoutWeightCopies: new WeakMap(), coachWorkoutChangeRevision: 0,
    coachWorkoutDraftOwner: "coach@example.com",
    coachWorkoutActiveContext: { clientEmail: client.value, entryDate: date.value },
    coachWorkoutPreviousHistoryStatus: options.historyStatus || "ready",
    coachWorkoutPersonalBests: new Map(options.prs || []),
    coachWorkoutExerciseElements: () => rows.map(item => item.exercise),
    scheduleCoachWorkoutAutosave: (options = {}) => { saves += 1; if (options.recordChange !== false) context.coachWorkoutChangeRevision += 1; },
    refreshCoachWorkoutGroupedProgress: () => {},
    saveCoachWorkout: () => {}, setCoachWorkoutStatus: () => {},
    window: { addEventListener() {} },
    document: {
      getElementById: id => ({ "coach-workout-client": client, "coach-workout-date": date,
        "coach-workout-log-form": form, "coach-workout-exercises": list, "coach-workout-group-stack": card })[id] || null,
      querySelectorAll: selector => root.querySelectorAll(selector), addEventListener() {}
    }
  });
  const names = [
    "normalizeCoachWorkoutEmail", "normalizeCoachWorkoutContext", "currentCoachWorkoutContext", "coachWorkoutContextId",
    "normalizeCoachWorkoutHistoryName", "coachWorkoutSetType", "coachWorkoutSetRowsByType", "coachWorkoutCanonicalGroupedRow",
    "coachWorkoutHistoryDateLabel", "coachWorkoutHistoryValue", "escapeCoachWorkoutHtml", "updateCoachWorkoutSetRows",
    "coachWorkoutCopyEntries", "coachWorkoutCopyContext", "previousCoachWorkoutSetWeight", "coachWorkoutPersonalBestForExercise",
    "coachWorkoutPersonalBestLabel", "refreshCoachWorkoutCopyControls", "copyCoachWorkoutWeights", "undoCoachWorkoutWeights",
    "clearCoachWorkoutWeightCopy", "handleCoachWorkoutForm"
  ];
  vm.runInContext(names.map(functionSource).join("\n"), context);
  return { context, root, card, section, previous, pr, preview, status, message, undo, rows, client, date, form, list, get saves() { return saves; } };
}

function best(weight = 60, extra = {}) {
  return { exercise_name: "Press", weight_used: weight, reps: 6, entry_date: "2026-08-01", set_type: "working", set_number: 1, ...extra };
}

test("previous copy fills only empty weights from the same exercise and saves once", () => {
  const h = fixture([{ name: "Press", previousWeight: "25" }, { name: "Row", previousWeight: "42.5" }]);
  h.context.copyCoachWorkoutWeights(h.previous);
  assert.deepEqual(h.rows.map(row => row.weight.value), ["25", "42.5"]);
  assert.deepEqual(h.rows.map(row => row.visible.value), ["25", "42.5"]);
  assert.equal(h.saves, 1);
  for (const row of h.rows) {
    assert.equal(row.row.querySelector("[data-coach-workout-reps]").value, "8");
    assert.equal(row.row.querySelector("[data-coach-workout-rir]").value, "2");
    assert.equal(row.warmupWeight.value, "999");
  }
  assert.equal(h.undo.hidden, false);
  assert.equal(h.undo.focused, true);
});

test("previous copy uses the immediately prior working row, including zero", () => {
  for (const value of ["0", "22.5"]) {
    const h = fixture([{ name: "Press", previousWeights: ["80", value] }], { round: 3 });
    h.context.copyCoachWorkoutWeights(h.previous);
    assert.equal(h.rows[0].weight.value, value);
  }
});

test("previous copy never falls back for missing, invalid, or negative prior weights", () => {
  for (const value of ["", " ", "invalid", "Infinity", "-1"]) {
    const h = fixture([{ name: "Press", previousWeights: ["80", value] }], { round: 3 });
    assert.equal(h.context.previousCoachWorkoutSetWeight(h.rows[0].exercise, h.rows[0].row), null);
    h.context.refreshCoachWorkoutCopyControls(h.card);
    assert.equal(h.previous.disabled, true);
    h.context.copyCoachWorkoutWeights(h.previous);
    assert.equal(h.rows[0].weight.value, "");
    assert.equal(h.saves, 0);
  }
});

test("first set disables previous copying while PR remains available and undo restores focus", () => {
  const h = fixture([{ name: "Press" }], { round: 1, format: "single", prs: [["press", best()]] });
  h.context.refreshCoachWorkoutCopyControls(h.card);
  assert.equal(h.previous.disabled, true);
  assert.equal(h.pr.disabled, false);
  h.context.copyCoachWorkoutWeights(h.pr);
  assert.equal(h.rows[0].weight.value, "60");
  h.context.undoCoachWorkoutWeights(h.undo);
  assert.equal(h.rows[0].weight.value, "");
  assert.equal(h.rows[0].visible.value, "");
  assert.equal(h.pr.focused, true);
  assert.equal(h.saves, 2);
});

test("both copy sources preserve typed zero, entered weights, and unsynchronized visible edits", () => {
  for (const source of ["previous", "pr"]) {
    const h = fixture([
      { name: "Press", weight: "0" }, { name: "Press", weight: "15" },
      { name: "Press", visibleWeight: "30" }, { name: "Press" }
    ], { prs: [["press", best()]] });
    h.context.copyCoachWorkoutWeights(h[source]);
    assert.deepEqual(h.rows.map(row => row.weight.value), ["0", "15", "", source === "pr" ? "60" : "25"]);
    assert.equal(h.rows[2].visible.value, "30");
    h.context.undoCoachWorkoutWeights(h.undo);
    assert.deepEqual(h.rows.map(row => row.weight.value), ["0", "15", "", ""]);
  }
});

test("PR lookup is normalized by current exercise and unavailable while history is not ready", () => {
  const h = fixture([{ name: "  PrESS  " }, { name: "Row" }], { prs: [["press", best(70)]] });
  h.context.copyCoachWorkoutWeights(h.pr);
  assert.deepEqual(h.rows.map(row => row.weight.value), ["70", ""]);
  for (const state of ["idle", "loading", "error"]) {
    const unavailable = fixture([{ name: "Press" }], { historyStatus: state, prs: [["press", best()]] });
    unavailable.context.refreshCoachWorkoutCopyControls(unavailable.card);
    assert.equal(unavailable.pr.disabled, true);
    unavailable.context.copyCoachWorkoutWeights(unavailable.pr);
    assert.equal(unavailable.rows[0].weight.value, "");
  }
});

test("PR preview identifies exercise, weight, reps and date without replacing current reps", () => {
  const h = fixture([{ name: "Press" }], { prs: [["press", best()]] });
  h.context.refreshCoachWorkoutCopyControls(h.card);
  assert.equal(h.preview.hidden, false);
  for (const text of [/Press/, /60/, /6/, /Aug.*1.*2026/]) assert.match(h.preview.textContent, text);
  h.context.copyCoachWorkoutWeights(h.pr);
  assert.equal(h.rows[0].row.querySelector("[data-coach-workout-reps]").value, "8");
  assert.match(h.message.textContent, /PR/);
});

test("zero PR is available and missing PR hides the preview", () => {
  const h = fixture([{ name: "Press" }], { prs: [["press", best(0)]] });
  h.context.copyCoachWorkoutWeights(h.pr);
  assert.equal(h.rows[0].weight.value, "0");
  const missing = fixture([{ name: "New exercise" }]);
  missing.context.refreshCoachWorkoutCopyControls(missing.card);
  assert.equal(missing.pr.disabled, true);
  assert.equal(missing.preview.hidden, true);
});

test("Undo never clears modified canonical or visible values", () => {
  const h = fixture();
  h.context.copyCoachWorkoutWeights(h.previous);
  h.rows[0].weight.value = "40";
  h.rows[1].visible.value = "45";
  h.context.undoCoachWorkoutWeights(h.undo);
  assert.equal(h.rows[0].weight.value, "40");
  assert.equal(h.rows[1].weight.value, "25");
  assert.equal(h.rows[1].visible.value, "45");
  assert.equal(h.saves, 1);
});

test("clearing copy provenance on manual edits or log/save prevents Undo", () => {
  for (const source of ["previous", "pr"]) {
    const h = fixture([{ name: "Press" }], { prs: [["press", best()]] });
    h.context.copyCoachWorkoutWeights(h[source]);
    const value = h.rows[0].weight.value;
    h.context.clearCoachWorkoutWeightCopy(h.rows[0].row);
    h.context.undoCoachWorkoutWeights(h.undo);
    assert.equal(h.rows[0].weight.value, value);
    assert.equal(h.saves, 1);
  }
});

test("Undo is isolated to owner, client, date, exercise name and set identity", () => {
  for (const mutate of [
    h => { h.context.coachWorkoutDraftOwner = "othercoach@example.com"; },
    h => { h.client.value = "otherclient@example.com"; },
    h => { h.date.value = "2026-09-22"; },
    h => { h.rows[0].name.value = "Row"; },
    h => { h.rows[0].row.dataset.coachWorkoutSetNumber = "3"; },
    h => { h.rows[0].row.dataset.coachWorkoutSetType = "warm_up"; }
  ]) {
    const h = fixture([{ name: "Press" }]);
    h.context.copyCoachWorkoutWeights(h.previous);
    mutate(h);
    h.context.undoCoachWorkoutWeights(h.undo);
    assert.equal(h.rows[0].weight.value, "25");
  }
});

test("refresh permanently invalidates stale context even if the old name returns", () => {
  const h = fixture([{ name: "Press" }]);
  h.context.copyCoachWorkoutWeights(h.previous);
  h.rows[0].name.value = "Row";
  h.context.refreshCoachWorkoutCopyControls(h.card);
  h.rows[0].name.value = "Press";
  h.context.undoCoachWorkoutWeights(h.undo);
  assert.equal(h.rows[0].weight.value, "25");
});

test("Undo survives replacing visible fields while canonical rows remain", () => {
  const h = fixture([{ name: "Press" }]);
  h.context.copyCoachWorkoutWeights(h.previous);
  const old = h.rows[0].visible;
  const replacement = input(old.attributes, h.rows[0].weight.value);
  old.remove();
  h.section.appendChild(replacement);
  h.context.refreshCoachWorkoutCopyControls(h.card);
  assert.equal(h.undo.hidden, false);
  h.context.undoCoachWorkoutWeights(h.undo);
  assert.equal(h.rows[0].weight.value, "");
  assert.equal(replacement.value, "");
});

test("copy labels use Set for straight sets and Round for supersets/circuits", () => {
  for (const format of ["single", "superset", "circuit"]) {
    const h = fixture([{ name: "Press" }], { format });
    h.context.copyCoachWorkoutWeights(h.previous);
    assert.match(h.message.textContent, new RegExp(`${format === "single" ? "Set" : "Round"} 1`));
  }
});

test("manual visible and canonical input handlers invalidate Undo even when the copied number returns", () => {
  for (const visible of [true, false]) {
    const h = fixture([{ name: "Press" }], { prs: [["press", best()]] });
    h.context.handleCoachWorkoutForm();
    h.context.copyCoachWorkoutWeights(h.pr);
    const field = visible ? h.rows[0].visible : h.rows[0].weight;
    const parent = visible ? h.card : h.list;
    field.value = "65";
    parent.emit("input", field);
    field.value = "60";
    parent.emit("input", field);
    h.context.undoCoachWorkoutWeights(h.undo);
    assert.equal(h.rows[0].weight.value, "60");
  }
});

test("explicit Log Set clears Undo only after validation succeeds", () => {
  for (const valid of [true, false]) {
    const h = fixture([{ name: "Press" }]);
    h.context.handleCoachWorkoutForm();
    h.context.copyCoachWorkoutWeights(h.previous);
    const log = h.section.appendChild(element("button", { "data-coach-grouped-log-round": "" }));
    const extra = h.section.appendChild(input({ "data-coach-grouped-field": "reps" }, valid ? "8" : "-1"));
    h.card.emit("click", log);
    assert.equal(h.context.coachWorkoutWeightCopies.has(h.rows[0].row), !valid);
    assert.equal(h.saves, valid ? 2 : 1);
    if (!valid) assert.equal(extra.focused, true);
    h.context.undoCoachWorkoutWeights(h.undo);
    assert.equal(h.rows[0].weight.value, valid ? "25" : "");
  }
});

test("copy and Undo stay within the active round and card", () => {
  const h = fixture([{ name: "Press", previousWeight: "25" }]);
  const neighbor = h.root.appendChild(element("article", { "data-coach-workout-group-card": "" }));
  const weight = neighbor.appendChild(input({ "data-coach-grouped-field": "weight" }, "999"));
  const otherRound = h.card.appendChild(element("section", { "data-coach-grouped-round": "3" }));
  const otherWeight = otherRound.appendChild(input({ "data-coach-grouped-field": "weight" }, "75"));
  h.context.copyCoachWorkoutWeights(h.previous);
  h.context.undoCoachWorkoutWeights(h.undo);
  assert.equal(weight.value, "999");
  assert.equal(otherWeight.value, "75");
});

test("rendered straight-set, superset and circuit sections expose both actions with correct labels", () => {
  for (const format of ["single", "superset", "circuit"]) {
    const h = fixture([{ name: "Press" }], { format });
    Object.assign(h.context, {
      coachWorkoutRestOwner: () => "fixture-rest-owner",
      coachWorkoutGroupedColumnLabelsMarkup: () => "",
      coachWorkoutGroupedSetRowMarkup: () => ""
    });
    vm.runInContext(["coachWorkoutGroupedRoundCode", "coachWorkoutGroupedSectionsMarkup"].map(functionSource).join("\n"), h.context);
    const html = h.context.coachWorkoutGroupedSectionsMarkup([{ exercise: h.rows[0].exercise, exerciseIndex: 0 }], format);
    assert.match(html, new RegExp(`Copy previous ${format === "single" ? "set" : "round"}`));
    assert.match(html, /data-coach-copy-weights="pr"[^>]*>Use PR weight/);
    assert.match(html, /data-coach-copy-weights="previous" disabled/);
    assert.match(html, /role="status" aria-live="polite"/);
  }
});

function pendingSave(h) {
  const planned = h.rows.map(({ exercise, name }, index) => ({
    name: name.value, code: `CW${index + 1}`,
    sets: h.context.coachWorkoutSetRowsByType(exercise, "working").map(row => ({
      setNumber: Number(row.dataset.coachWorkoutSetNumber), setType: "working",
      weight: Number(row.querySelector("[data-coach-workout-weight]").value), reps: 8, rir: 2
    }))
  }));
  let resolve;
  let reject;
  const historyReloads = [];
  const response = new Promise((yes, no) => { resolve = yes; reject = no; });
  h.form.reportValidity = () => true;
  h.form.checkValidity = () => true;
  h.context.document.body = { contains: exercise => exercise.isConnected };
  Object.assign(h.context, {
    coachWorkoutAutosaveInFlight: false, coachWorkoutAutosaveQueued: false, coachWorkoutAutosaveQueuedEpoch: null,
    coachWorkoutSaveEpoch: 0, coachWorkoutLastSavedSignature: "", coachWorkoutPendingDeletes: [],
    cancelCoachWorkoutAutosave: () => {}, coachWorkoutHasPendingDeletes: () => false,
    coachWorkoutFormatValue: () => h.card.dataset.coachWorkoutFormat,
    coachWorkoutExerciseValues: () => planned,
    coachWorkoutSaveSignature: values => JSON.stringify(values),
    withCoachWorkoutSaveLock: () => response,
    loadCoachWorkoutPreviousHistory: async context => { historyReloads.push({ ...context }); },
    storeCoachWorkoutDraft: () => true
  });
  vm.runInContext(["coachWorkoutContextsMatch", "saveCoachWorkout"].map(functionSource).join("\n"), h.context);
  const result = h.context.saveCoachWorkout();
  return { result, historyReloads, fail: reject, complete: () => resolve({ planned, rows: planned.flatMap(exercise => exercise.sets.map(set => ({
    exercise_name: exercise.name, exercise_code: exercise.code, entry_date: h.date.value,
    set_number: set.setNumber, set_type: set.setType, weight_used: set.weight, reps: set.reps
  }))) }) };
}

test("a successful save retires Undo and reloads current history to discard stale personal records", async () => {
  const h = fixture([{ name: "Press" }]);
  h.context.copyCoachWorkoutWeights(h.previous);
  const save = pendingSave(h);
  save.complete();
  assert.equal((await save.result).saved, true);
  assert.deepEqual(save.historyReloads, [{ clientEmail: "client@example.com", entryDate: "2026-09-21" }]);
  assert.equal(h.context.coachWorkoutWeightCopies.has(h.rows[0].row), false);
  h.context.undoCoachWorkoutWeights(h.undo);
  assert.equal(h.rows[0].weight.value, "25");
});

test("an in-flight save preserves a newer copy even when the saved number is identical", async () => {
  const h = fixture([{ name: "Press" }]);
  h.context.copyCoachWorkoutWeights(h.previous);
  const save = pendingSave(h);
  h.context.undoCoachWorkoutWeights(h.undo);
  h.context.copyCoachWorkoutWeights(h.previous);
  save.complete();
  assert.equal((await save.result).saved, true);
  assert.equal(save.historyReloads.length, 1);
  assert.equal(h.context.coachWorkoutWeightCopies.has(h.rows[0].row), true);
  h.context.undoCoachWorkoutWeights(h.undo);
  assert.equal(h.rows[0].weight.value, "");
});

test("failed and stale saves preserve Undo without reloading another context's history", async () => {
  for (const mode of ["failed", "stale"]) {
    const h = fixture([{ name: "Press" }]);
    h.context.copyCoachWorkoutWeights(h.previous);
    const save = pendingSave(h);
    if (mode === "failed") save.fail(new Error("Offline"));
    else {
      h.context.coachWorkoutSaveEpoch += 1;
      save.complete();
    }
    const result = await save.result;
    if (mode === "failed") assert.equal(result.saved, false);
    else assert.equal(result.stale, true);
    assert.equal(save.historyReloads.length, 0);
    assert.equal(h.context.coachWorkoutWeightCopies.has(h.rows[0].row), true);
    h.context.undoCoachWorkoutWeights(h.undo);
    assert.equal(h.rows[0].weight.value, "");
  }
});
