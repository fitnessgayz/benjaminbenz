const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
function functionSource(name) {
  const marker = source.includes(`async function ${name}(`) ? `async function ${name}(` : `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} must exist`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

const dataKey = (value) => value.replace(/^data-/, "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
class Element {
  constructor(tag = "div", dataset = {}, classes = []) {
    this.tag = tag; this.dataset = dataset; this.children = []; this.parentNode = null;
    this.attributes = {}; this.value = ""; this.textContent = ""; this.hidden = false;
    this.classes = new Set(classes);
    this.classList = {
      contains: (value) => this.classes.has(value),
      add: (value) => this.classes.add(value),
      remove: (value) => this.classes.delete(value),
      toggle: (value, enabled) => {
        const next = enabled === undefined ? !this.classes.has(value) : enabled;
        if (next) this.classes.add(value); else this.classes.delete(value);
        return next;
      }
    };
  }
  append(...nodes) { nodes.forEach((node) => { node.parentNode = this; this.children.push(node); }); }
  appendChild(node) { this.append(node); return node; }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  insertAdjacentElement(position, node) {
    assert.equal(position, "afterend");
    const index = this.parentNode.children.indexOf(this);
    this.parentNode.children.splice(index + 1, 0, node); node.parentNode = this.parentNode;
  }
  addEventListener(type, callback) { this.listeners ||= {}; this.listeners[type] = callback; }
  click() { this.listeners?.click?.(); }
  matches(selector) {
    return selector.split(/,(?![^\[]*\])/).some((choice) => {
      const parts = choice.trim().match(/(?:\[[^\]]*\]|[^\s])+/g) || [];
      const own = parts.pop();
      if (!own || !this.matchesCompound(own)) return false;
      let ancestor = this.parentNode;
      while (parts.length) {
        const previous = parts.pop();
        while (ancestor && !ancestor.matchesCompound(previous)) ancestor = ancestor.parentNode;
        if (!ancestor) return false;
        ancestor = ancestor.parentNode;
      }
      return true;
    });
  }
  matchesCompound(selector) {
    let valid = true;
    selector = selector.replace(/:not\(([^)]+)\)/g, (_, excluded) => {
      if (this.matches(excluded)) valid = false;
      return "";
    });
    const tag = selector.match(/^[a-z][\w-]*/i)?.[0];
    if (tag && this.tag !== tag) return false;
    for (const match of selector.matchAll(/\.([\w-]+)|\[(data-[\w-]+)(?:\s*=\s*["']?([^"'\]]*)["']?)?\]/g)) {
      if (match[1] && !this.classes.has(match[1])) valid = false;
      if (match[2]) {
        const key = dataKey(match[2]);
        if (!(key in this.dataset) || (match[3] !== undefined && this.dataset[key] !== match[3])) valid = false;
      }
    }
    return valid;
  }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  focus() { this.focused = true; }
  scrollIntoView() {}
}

function fixture({ format = "single", assigned = false, grouped = true } = {}) {
  const panel = new Element("section", {}, ["client-workout-panel", `client-workout-panel-${assigned ? "assigned" : "custom"}`]);
  const carousel = new Element("section", { customWorkoutGrouped: "true", customWorkoutFormat: format, customWorkoutCarousel: "" });
  const sourceHost = new Element("div", { customWorkoutGroupedSource: "" });
  const sourceList = new Element("div", { customWorkoutList: "" });
  const visibleHost = new Element("div", { customGroupedSections: "" });
  if (grouped) { panel.append(carousel); carousel.append(visibleHost, sourceHost); sourceHost.append(sourceList); }
  else panel.append(sourceList);
  const names = new Element("section", { customWorkoutGroupNameSection: "" });
  const nameFields = new Element("div", { customWorkoutGroupNameFields: "" }); nameFields.hidden = true;
  const nameToggle = new Element("button", { customWorkoutGroupNameToggle: "" }); nameToggle.setAttribute("aria-expanded", "false");
  const nameIcon = new Element("i", { customWorkoutGroupNameIcon: "" }); nameIcon.textContent = "+";
  names.append(nameToggle, nameIcon, nameFields); if (grouped) carousel.append(names);
  const context = vm.createContext({
    console, document: { createElement: (tag) => new Element(tag) },
    warmUpSetType: "warm_up", workingSetType: "working", warmUpSetNumberBase: 1000
  });
  const helpers = [
    "normalizedSetType", "setTypeForRow", "setRowInputValues", "setNumberLabel", "warmUpOrdinal",
    "exerciseNameInputForLog", "currentExerciseLabel", "workoutSetUnit",
    "customWorkoutCarouselCards", "customWorkoutGroupedLogElements", "customWorkoutGroupedRows", "customWorkoutGroupedCanonicalRow",
    "showWorkoutFinishIssues", "workoutSectionForButton",
    ...Array.from(source.matchAll(/^function (workoutFinish\w+)\(/gm), (match) => match[1])
  ];
  vm.runInContext([...new Set(helpers)].map(functionSource).join("\n"), context);
  assert.equal(typeof context.workoutFinishIssues, "function");

  const logs = [];
  const input = (data, value) => { const element = new Element("input", data); element.value = String(value ?? ""); return element; };
  const addExercise = (name = "Dumbbell row", specs = [{ weight: "30", reps: "10", complete: true }], options = {}) => {
    const index = logs.length;
    const card = new Element("article", { customExerciseCard: "" }, ["workout-exercise-card", ...(options.skippedCard ? ["is-skipped"] : [])]);
    const log = new Element("div", { exerciseLog: "", exerciseName: name, exerciseCode: `CW${index + 1}`, ...options.dataset });
    const nameInput = input({ exerciseNameInput: "" }, name);
    const visibleNameInput = input({ customWorkoutGroupNameInput: String(index) }, name);
    if (grouped) nameFields.append(visibleNameInput);
    card.append(nameInput, log); sourceList.append(card); logs.push(log);
    const canonicalHost = new Element("div", { setRows: "" }); log.append(canonicalHost);
    const rows = specs.map((spec, rowIndex) => {
      const type = spec.type || "working";
      const number = spec.number ?? (type === "warm_up" ? 1001 : rowIndex + 1);
      const row = new Element("div", {
        setRow: "", setNumber: String(number), setType: type,
        ...(grouped ? { groupedRoundRequired: "true" } : {}),
        ...(spec.reopened ? { customGroupedReopened: "true" } : {}),
        ...(spec.rir !== undefined ? { repsInReserve: String(spec.rir) } : {})
      }, ["set-row", ...(spec.complete ? ["is-complete"] : [])]);
      const fields = { weight: input({ setWeight: "" }, spec.weight), reps: input({ setReps: "" }, spec.reps) };
      const label = input({ setLabel: "" }, type === "warm_up" ? "W1" : number);
      const rirButton = new Element("button", { setRir: "" });
      row.append(label, fields.weight, fields.reps, rirButton); canonicalHost.append(row);
      if (!grouped) return { row, fields, rirButton };
      const round = new Element("section", { kind: type === "warm_up" ? "warmup" : "round", ...(type === "working" ? { customGroupedRound: String(number) } : {}) });
      const visibleRow = new Element("div", { customGroupedExerciseIndex: String(index), customGroupedSetType: type, customGroupedSetNumber: String(number) }, ["custom-workout-grouped-row"]);
      const visibleFields = Object.fromEntries(["weight", "reps", "rir"].map((field) => [field, input({ customGroupedField: field }, spec[field])]));
      const button = new Element("button", type === "working" ? { customGroupedLogRound: String(number) } : { customGroupedLogWarmup: "" });
      visibleRow.append(...Object.values(visibleFields)); round.append(visibleRow, button); visibleHost.append(round);
      return { row, fields, visibleRow, visibleFields, button, rirButton };
    });
    return { log, card, rows, nameInput, visibleNameInput };
  };
  return { panel, carousel, nameFields, nameToggle, nameIcon, addExercise, context, issues: (options) => Array.from(context.workoutFinishIssues(panel, options)) };
}

test("assigned and custom formats finish with logged working sets and optional blank, zero or partial warm-ups", () => {
  for (const assigned of [false, true]) for (const format of ["single", "superset", "circuit"]) {
    const h = fixture({ assigned, format });
    h.addExercise("Squat", [
      { type: "warm_up", number: 1001, weight: "", reps: "" },
      { type: "warm_up", number: 1002, weight: "0", reps: "0" },
      { type: "warm_up", number: 1003, weight: "20", reps: "", reopened: true },
      { type: "warm_up", number: 1004, weight: "", reps: "", rir: "2" },
      { number: 1, weight: "50", reps: "8", complete: true }
    ]);
    assert.equal(h.issues().length, 0, `${assigned ? "assigned" : "custom"} ${format}`);
  }
});

test("zero working weight is valid for bodyweight exercises when reps are positive", () => {
  for (const grouped of [false, true]) {
    const h = fixture({ grouped }); h.addExercise("Push-up", [{ weight: "0", reps: "12", complete: true, rir: "0" }]);
    assert.equal(h.issues().length, 0);
  }
});

test("missing working reps names the exercise and set, and targets its visible reps field", () => {
  const h = fixture();
  const exercise = h.addExercise("Dumbbell row", [
    { weight: "30", reps: "10", complete: true }, { weight: "30", reps: "", number: 2 }
  ]);
  const issues = h.issues();
  assert.ok(issues.length > 0);
  assert.match(issues[0].message, /Dumbbell row/);
  assert.match(issues[0].message, /set\s*2/i);
  assert.match(issues[0].message, /reps/i);
  assert.equal(issues[0].target, exercise.rows[1].visibleFields.reps);
});

test("missing weight is reported separately from valid reps and valid completed sets", () => {
  const h = fixture({ grouped: false });
  const exercise = h.addExercise("Cable row", [{ weight: "", reps: "10" }]);
  const issues = h.issues();
  assert.ok(issues.length > 0);
  assert.match(issues[0].message, /Cable row.*weight|weight.*Cable row/i);
  assert.equal(issues[0].target, exercise.rows[0].fields.weight);
});

test("working fields reject negative/nonfinite weight, zero/nonfinite reps, and invalid optional RIR", () => {
  for (const [field, value] of [["weight", "-1"], ["weight", "Infinity"], ["weight", "NaN"], ["reps", "0"], ["reps", "-1"], ["reps", "Infinity"], ["rir", "-1"], ["rir", "6"], ["rir", "NaN"]]) {
    const h = fixture();
    const exercise = h.addExercise("Press", [{ weight: "20", reps: "8", complete: true, [field]: value }]);
    const issues = h.issues();
    assert.ok(issues.length > 0, `${field}=${value}`);
    assert.match(issues[0].message, new RegExp(field, "i"));
    assert.equal(issues[0].target, exercise.rows[0].visibleFields[field]);
  }
  for (const rir of [undefined, "", "0", "5"]) {
    const h = fixture(); h.addExercise("Press", [{ weight: "20", reps: "8", complete: true, rir }]);
    assert.equal(h.issues().length, 0);
  }
});

test("valid but unlogged grouped values explain which Log set or Log round action is needed", () => {
  for (const format of ["single", "superset", "circuit"]) {
    const h = fixture({ format });
    const exercise = h.addExercise("Split squat", [{ weight: "20", reps: "8", number: 2 }]);
    const issues = h.issues();
    assert.ok(issues.length > 0);
    assert.match(issues[0].message, /Split squat/);
    assert.match(issues[0].message, format === "single" ? /log set/i : /log round/i);
    assert.equal(issues[0].target, exercise.rows[0].button);
    assert.equal(exercise.rows[0].row.classList.contains("is-complete"), false, "Validation never logs a set");
  }
});

test("allowUnstarted skips only untouched blank working rows, preserving edited and reopened requirements", () => {
  const blank = fixture(); blank.addExercise("Row", [{ weight: "", reps: "" }]);
  assert.ok(blank.issues().length > 0);
  assert.equal(blank.issues({ allowUnstarted: true }).length, 0);
  for (const spec of [
    { weight: "0", reps: "" }, { weight: "", reps: "8" },
    { weight: "", reps: "", rir: "1" }, { weight: "", reps: "", reopened: true }
  ]) {
    const h = fixture(); h.addExercise("Row", [spec]);
    assert.ok(h.issues({ allowUnstarted: true }).length > 0, JSON.stringify(spec));
  }
});

test("skipped exercises, separate warm-up logs and cardio do not add working-set issues", () => {
  const h = fixture();
  h.addExercise("Skipped card", [{ weight: "", reps: "" }], { skippedCard: true });
  h.addExercise("Skipped log", [{ weight: "", reps: "" }], { dataset: { exerciseSkipped: "true" } });
  h.addExercise("Warm-up duration", [{ weight: "", reps: "" }], { dataset: { warmupLog: "" } });
  h.addExercise("Cardio duration", [{ weight: "", reps: "" }], { dataset: { cardioLog: "" } });
  assert.equal(h.issues().length, 0);
});

test("duplicate exercise names still target the failing exercise rather than the first matching label", () => {
  const h = fixture({ format: "superset" });
  const first = h.addExercise("Cable fly", [{ weight: "20", reps: "10", complete: true }]);
  const second = h.addExercise("Cable fly", [{ weight: "25", reps: "" }]);
  const issues = h.issues();
  assert.ok(issues.length > 0);
  assert.equal(issues[0].target, second.rows[0].visibleFields.reps);
  assert.notEqual(issues[0].target, first.rows[0].visibleFields.reps);
  assert.equal(first.rows[0].row.classList.contains("is-complete"), true);
  assert.equal(second.rows[0].fields.weight.value, "25");
});

test("a missing name on a later grouped card is reported once and its action reveals the visible editor", () => {
  const h = fixture(); h.addExercise("Row");
  const later = fixture({ format: "circuit" });
  const exercise = later.addExercise("Previous name", [
    { weight: "20", reps: "8", complete: true }, { weight: "20", reps: "8", complete: true }
  ]);
  exercise.visibleNameInput.value = "";
  h.panel.append(later.carousel);
  const issues = h.issues();
  assert.equal(issues.length, 1, "A missing name is explained once per exercise, across the whole panel");
  assert.match(issues[0].message, /Exercise 2.*exercise name/i);
  assert.equal(issues[0].target, exercise.visibleNameInput, "The hidden canonical input must not receive focus");
  const footer = new Element("footer"); const finish = new Element("button", { workoutFinish: "" });
  footer.append(finish); h.panel.append(footer);
  assert.equal(h.context.showWorkoutFinishIssues(finish, issues), false);
  const summary = h.panel.querySelector("[data-workout-finish-issues]");
  assert.equal(summary.getAttribute("role"), "alert");
  assert.match(summary.querySelector("p").textContent, /Warm-ups.*optional.*Log warm-up is not required/);
  summary.querySelector("button").click();
  assert.equal(later.nameFields.hidden, false);
  assert.equal(later.nameToggle.getAttribute("aria-expanded"), "true");
  assert.equal(later.nameIcon.textContent, "−");
  assert.equal(later.carousel.dataset.groupNamesExpanded, "true");
  assert.equal(exercise.visibleNameInput.focused, true);
  assert.equal(exercise.nameInput.focused, undefined);
});
