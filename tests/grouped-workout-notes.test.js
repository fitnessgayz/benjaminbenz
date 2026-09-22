const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
function functionSource(name) {
  const marker = source.includes(`async function ${name}(`) ? `async function ${name}(` : `function ${name}(`;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `Expected ${name}`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}
const dataKey = (name) => name.replace(/^data-/, "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

function fixture() {
  const document = { activeElement: null };
  class Element {
    constructor(tag) {
      this.tag = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.value = "";
      this.hidden = false; this.disabled = false; this.parentNode = null; this.textContent = "";
      this.classes = new Set(); this.classList = { contains: (name) => this.classes.has(name) };
    }
    matches(selector) {
      if (selector[0] === ".") return this.classes.has(selector.slice(1));
      const match = selector.match(/^\[(data-[\w-]+)(?:=['"]([^'"]+)['"])?\]$/);
      return match ? dataKey(match[1]) in this.dataset && (match[2] === undefined || this.dataset[dataKey(match[1])] === match[2]) : this.tag === selector;
    }
    append(...nodes) { nodes.forEach((node) => this.insertBefore(node, null)); }
    insertBefore(node, reference) {
      if (node.parentNode) node.remove();
      const index = reference ? this.children.indexOf(reference) : this.children.length;
      this.children.splice(index, 0, node); node.parentNode = this;
    }
    remove() {
      if (this.contains(document.activeElement)) document.activeElement = null;
      if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
      this.parentNode = null;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    querySelectorAll(selector) { return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) || null; }
    contains(node) { return this === node || this.children.some((child) => child.contains(node)); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    focus() { document.activeElement = this; }
  }
  document.createElement = (tag) => new Element(tag);
  const carousel = new Element("section");
  carousel.dataset.customWorkoutGrouped = "true";
  carousel.dataset.customWorkoutCarousel = "";
  const host = new Element("div"); host.dataset.customGroupedNotes = ""; carousel.append(host);
  const backing = new Element("div"); backing.dataset.customWorkoutGroupedSource = ""; carousel.append(backing);
  let logs = [];
  const calls = { drafts: [], scheduled: [], timerCallbacks: [], payloads: [], rebuilds: 0, deletes: 0, renders: 0 };
  const context = vm.createContext({
    document, console, customWorkoutGroupedLogElements: () => logs,
    currentExerciseLabel: (log) => log.name,
    persistCustomWorkoutDraftForElement: (log) => calls.drafts.push(log),
    scheduleTrainingLogAutosave: (log) => calls.scheduled.push(log)
  });
  vm.runInContext(["renderCustomWorkoutGroupedNotes", "syncCustomWorkoutGroupedNotesInput", "renderExerciseNotesState"]
    .map(functionSource).join("\n"), context);
  const addLog = (name, value = "") => {
    const log = new Element("div"); log.dataset.exerciseLog = ""; log.name = name;
    log.dataset.workoutTitle = "Workout"; log.dataset.exerciseCode = `CW${logs.length + 1}`;
    const notes = new Element("textarea"); notes.dataset.logNotes = ""; notes.value = value;
    const date = new Element("input"); date.dataset.logDate = ""; date.value = "2026-09-21";
    log.append(notes, date); backing.append(log); logs.push(log); return log;
  };
  return {
    context, document, Element, carousel, host, calls, addLog,
    logs: () => logs, setLogs: (next) => { logs = next; },
    render: () => context.renderCustomWorkoutGroupedNotes(carousel),
    input: (index) => host.querySelectorAll("textarea")[index],
    details: () => host.querySelector("details")
  };
}

test("places the notes host below all rounds and before the timer/footer", () => {
  const markup = functionSource("customWorkoutGroupedRoundCardMarkup");
  const index = markup.indexOf('data-custom-grouped-notes');
  assert.ok(index > markup.indexOf('data-custom-grouped-sections'));
  assert.ok(index < markup.indexOf('data-custom-grouped-timer'));
  assert.match(functionSource("renderCustomWorkoutGroupedCard"), /renderCustomWorkoutGroupedNotes\(carousel\)/);
});

test("notes use canonical exercise identity and retain textareas, focus and open state during rerenders", () => {
  const h = fixture();
  const a = h.addLog("Row", "Slow eccentric");
  const b = h.addLog("Row", "Second variation");
  h.render();
  const inputA = h.input(0), inputB = h.input(1), details = h.details();
  details.open = true; inputA.focus(); inputA.selectionStart = 5;
  h.render();
  assert.equal(h.input(0), inputA);
  assert.equal(h.document.activeElement, inputA);
  assert.equal(inputA.selectionStart, 5);
  h.setLogs([b, a]); h.render();
  assert.equal(h.input(0), inputB); assert.equal(h.input(1), inputA);
  assert.equal(inputA.dataset.customGroupedNotesInput, "1");
  assert.equal(h.document.activeElement, inputA);
  assert.equal(h.details(), details); assert.equal(details.open, true);
  assert.equal(inputA.value, "Slow eccentric");
});

test("typing immediately updates canonical notes and persistence without replacing the focused textarea", () => {
  const h = fixture(); const log = h.addLog("Squat"); h.render();
  const input = h.input(0); input.focus(); input.value = "Use a box <not HTML>";
  h.context.syncCustomWorkoutGroupedNotesInput(input);
  assert.equal(log.querySelector("[data-log-notes]").value, input.value);
  assert.equal(h.input(0), input); assert.equal(h.document.activeElement, input);
  assert.deepEqual(h.calls.drafts, [log]); assert.deepEqual(h.calls.scheduled, [log]);
  assert.equal(h.host.querySelector("[data-custom-grouped-notes-state]").textContent, "Added");
});

test("restoring notes, renaming, adding and removing exercises updates the right stable fields", () => {
  const h = fixture(); const a = h.addLog("A"); const b = h.addLog("B", "Keep B"); h.render();
  const inputB = h.input(1); h.details().open = true;
  a.name = "Renamed A"; a.querySelector("[data-log-notes]").value = "Restored from log";
  h.context.renderExerciseNotesState(a);
  assert.equal(h.input(0).value, "Restored from log");
  assert.equal(h.input(0).attributes["aria-label"], "Notes for Renamed A");
  const c = h.addLog("C", "New exercise"); h.setLogs([b, c]); h.render();
  assert.equal(h.input(0), inputB); assert.equal(h.input(0).value, "Keep B");
  assert.equal(h.input(1).value, "New exercise");
  assert.equal(h.host.querySelectorAll("textarea").length, 2);
});

test("disabled and detached exercise note inputs cannot modify canonical values", () => {
  const h = fixture(); const log = h.addLog("A", "Original"); h.render();
  const input = h.input(0); input.value = "Attempted change"; input.disabled = true;
  h.context.syncCustomWorkoutGroupedNotesInput(input);
  assert.equal(log.querySelector("[data-log-notes]").value, "Original");
  input.disabled = false; h.setLogs([]);
  h.context.syncCustomWorkoutGroupedNotesInput(input);
  assert.equal(log.querySelector("[data-log-notes]").value, "Original");
  assert.equal(h.calls.drafts.length, 0);
});

test("grouped notes autosave persists notes while preserving pending sets and live input DOM", async () => {
  const h = fixture(); const log = h.addLog("Squat", "Pause at the bottom"); h.render();
  const addRow = (complete, weight, reps, number) => {
    const row = new h.Element("div"); row.dataset.setRow = ""; row.dataset.setNumber = String(number);
    row.dataset.groupedRoundRequired = "true";
    if (complete) row.classes.add("is-complete");
    for (const [field, value] of [["weight", weight], ["reps", reps]]) {
      const input = new h.Element("input"); input.dataset[`set${field[0].toUpperCase()}${field.slice(1)}`] = ""; input.value = value; row.append(input);
    }
    log.append(row); return row;
  };
  addRow(true, "60", "10", 1);
  const pending = addRow(false, "65", "8", 2);
  const liveNote = h.input(0); liveNote.focus();
  const body = new h.Element("body"); body.append(h.carousel); h.document.body = body;
  Object.assign(h.context, {
    activeClientEmail: "client@example.com", warmUpSetType: "warm_up", trainingLogs: [],
    trainingLogAutosaveTimers: new WeakMap(), trainingLogAutosaveDelayMs: 10000,
    window: { setTimeout: (fn) => { h.calls.timerCallbacks.push(fn); return 1; }, clearTimeout() {} },
    supabaseClient: { from: () => ({ upsert: (rows) => {
      h.calls.payloads.push(rows);
      return { select: async () => ({ data: rows, error: null }) };
    } }) },
    todayDate: () => "2026-09-21", exerciseNameInputForLog: () => ({ value: "Squat" }),
    setTypeForRow: () => "working", upsertLocalTrainingLog() {}, updateVisibleSetProgress() {}, renderClientTrainingLogs() {},
    updateExerciseLogField: () => { h.calls.rebuilds++; pending.remove(); },
    deleteRemovedTrainingLogRows: async () => { h.calls.deletes++; return { deletedCount: 0, error: null }; },
    renderCustomWorkoutCarousel: () => { h.calls.renders++; liveNote.remove(); }
  });
  vm.runInContext(["setWorkoutCarouselAutosaveState", "setRowInputValues", "isSetRowLogged", "rowsForTrainingLog",
    "trainingLogHasAutosavePayload", "scheduleTrainingLogAutosave", "saveTrainingLogRows"].map(functionSource).join("\n"), h.context);
  h.context.scheduleTrainingLogAutosave(log);
  await h.calls.timerCallbacks[0]();
  assert.equal(h.calls.payloads.length, 1);
  assert.equal(h.calls.payloads[0].length, 1, "Only the already logged set is written");
  assert.equal(h.calls.payloads[0][0].notes, "Pause at the bottom");
  assert.equal(h.calls.rebuilds, 0); assert.equal(h.calls.deletes, 0); assert.equal(h.calls.renders, 0);
  assert.equal(pending.querySelector("[data-set-weight]").value, "65");
  assert.equal(pending.querySelector("[data-set-reps]").value, "8");
  assert.equal(pending.classList.contains("is-complete"), false);
  assert.equal(h.document.activeElement, liveNote);
  assert.equal(h.input(0), liveNote);
});
