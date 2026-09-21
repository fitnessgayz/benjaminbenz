const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/coach-workout-log.js"), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Expected ${name}`);
  const remainder = source.slice(start);
  const next = remainder.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? remainder : remainder.slice(0, next + 1);
}

function ownershipFixture() {
  let format = "superset";
  const context = vm.createContext({
    coachWorkoutRestRowIds: new WeakMap(),
    coachWorkoutRestRowId: 0,
    coachWorkoutFormatValue: () => format
  });
  vm.runInContext(functionSource("coachWorkoutRestOwner"), context);
  return {
    owner: (rows) => context.coachWorkoutRestOwner(rows.map((row) => ({ row }))),
    format: (next) => { format = next; }
  };
}

function renderFixture() {
  const document = { activeElement: null, querySelectorAll: () => sections };
  function control() {
    let text = "";
    return {
      hidden: false, attributes: {}, textWrites: 0, focusCount: 0,
      get textContent() { return text; },
      set textContent(value) { text = value; this.textWrites += 1; },
      setAttribute(name, value) { this.attributes[name] = value; },
      focus(options) { document.activeElement = this; this.focusCount += 1; this.focusOptions = options; }
    };
  }
  function section(owner) {
    const log = control();
    const controls = control();
    const toggle = control();
    const status = control();
    controls.contains = (node) => node === controls || node === toggle;
    return {
      dataset: { coachRestOwner: owner }, log, controls, toggle, status,
      querySelector(selector) {
        return {
          "[data-coach-grouped-log-round]": log,
          "[data-coach-inline-rest]": controls,
          "[data-coach-rest-toggle]": toggle,
          "[data-coach-rest-status]": status
        }[selector] || null;
      }
    };
  }
  const sections = [section("set-a"), section("set-b")];
  let state = { active: false, inline: false, owner: null, remaining: 60, running: false, complete: false };
  const context = vm.createContext({ document, window: { CoachRestTimer: { getState: () => state } } });
  vm.runInContext(functionSource("renderCoachWorkoutInlineRest"), context);
  return {
    context, document, sections, section,
    render(next = {}) { state = { ...state, ...next }; context.renderCoachWorkoutInlineRest(); },
    get state() { return state; }
  };
}

test("timer ownership follows canonical row identity across rerenders and reordering", () => {
  const h = ownershipFixture();
  const rows = [{}, {}];
  const firstOwner = h.owner(rows);
  assert.equal(h.owner(rows), firstOwner);
  assert.equal(h.owner(rows.slice().reverse()), firstOwner);
  const secondGroup = [{}, {}];
  const secondOwner = h.owner(secondGroup);
  assert.notEqual(secondOwner, firstOwner);
  // Moving an existing group before another changes positions, not ownership.
  assert.equal(h.owner(secondGroup), secondOwner);
  assert.equal(h.owner(rows), firstOwner);
});

test("replacement sets, changed membership and workout format get different owners", () => {
  const h = ownershipFixture();
  const rows = [{}, {}];
  const owner = h.owner(rows);
  assert.notEqual(h.owner([rows[0], {}]), owner);
  assert.notEqual(h.owner([rows[0]]), owner);
  assert.notEqual(h.owner([{}, {}]), owner);
  h.format("circuit");
  assert.notEqual(h.owner(rows), owner);
});

test("only the active inline owner's Log button becomes rest controls", () => {
  const h = renderFixture();
  const [first, second] = h.sections;
  h.render({ active: true, inline: true, owner: "set-a", remaining: 59, running: true });
  assert.equal(first.log.hidden, true);
  assert.equal(first.controls.hidden, false);
  assert.equal(first.toggle.textContent, "Rest 00:59 · Pause");
  assert.equal(first.toggle.attributes["aria-label"], "Pause rest timer, 00:59 remaining");
  assert.equal(first.status.textContent, "Rest timer running.");
  assert.equal(second.log.hidden, false);
  assert.equal(second.controls.hidden, true);
  h.render({ owner: "set-b" });
  assert.equal(first.log.hidden, false);
  assert.equal(first.controls.hidden, true);
  assert.equal(first.status.textContent, "");
  assert.equal(second.log.hidden, true);
  assert.equal(second.controls.hidden, false);
});

test("pause, completion and stop update text in place and restore the Log button", () => {
  const h = renderFixture();
  const section = h.sections[0];
  const originalToggle = section.toggle;
  h.render({ active: true, inline: true, owner: "set-a", remaining: 75, running: false });
  assert.equal(section.toggle.textContent, "Rest 01:15 · Resume");
  assert.equal(section.toggle.attributes["aria-label"], "Resume rest timer, 01:15 remaining");
  assert.equal(section.status.textContent, "Rest timer paused.");
  h.render({ remaining: 0, complete: true });
  assert.equal(section.toggle, originalToggle);
  assert.equal(section.toggle.textContent, "Rest complete · Restart");
  assert.equal(section.toggle.attributes["aria-label"], "Restart rest timer");
  assert.equal(section.status.textContent, "Rest complete. Ready for the next set.");
  assert.equal(section.log.hidden, true);
  h.document.activeElement = section.toggle;
  h.render({ active: false, inline: false, owner: null, complete: false });
  assert.equal(section.log.hidden, false);
  assert.equal(section.controls.hidden, true);
  assert.equal(section.status.textContent, "");
  assert.equal(h.document.activeElement, section.log);
  assert.equal(section.log.focusOptions.preventScroll, true);
});

test("floating timers do not replace any inline Log button", () => {
  const h = renderFixture();
  h.render({ active: true, inline: false, owner: "set-a", running: true });
  assert.ok(h.sections.every((section) => !section.log.hidden && section.controls.hidden));
});

test("activation moves focus from Log to Pause once without stealing focus on ticks", () => {
  const h = renderFixture();
  const section = h.sections[0];
  h.document.activeElement = section.log;
  h.render({ active: true, inline: true, owner: "set-a", remaining: 60, running: true });
  assert.equal(h.document.activeElement, section.toggle);
  assert.equal(section.toggle.focusCount, 1);
  assert.equal(section.toggle.focusOptions.preventScroll, true);
  const statusWrites = section.status.textWrites;
  const nextWeightInput = {};
  h.document.activeElement = nextWeightInput;
  h.render({ remaining: 59 });
  h.render({ remaining: 58 });
  assert.equal(h.document.activeElement, nextWeightInput);
  assert.equal(section.toggle.focusCount, 1);
  assert.equal(section.status.textWrites, statusWrites, "A live status should not announce every second");
});

test("rerendered sections recover their owner's countdown without moving input focus", () => {
  const h = renderFixture();
  h.render({ active: true, inline: true, owner: "set-a", remaining: 43, running: true });
  const replacement = h.section("set-a");
  h.sections[0] = replacement;
  const focusedInput = {};
  h.document.activeElement = focusedInput;
  h.render();
  assert.equal(replacement.log.hidden, true);
  assert.equal(replacement.controls.hidden, false);
  assert.equal(replacement.toggle.textContent, "Rest 00:43 · Pause");
  assert.equal(h.document.activeElement, focusedInput);
  assert.equal(replacement.toggle.focusCount, 0);
});

function clickFixture() {
  const h = renderFixture();
  const events = new Map();
  const eventHost = (name) => ({ addEventListener(type, handler) { events.set(`${name}:${type}`, handler); } });
  const form = eventHost("form");
  const list = eventHost("list");
  const stack = eventHost("stack");
  const calls = [];
  let state = { active: false, inline: false, owner: null };
  Object.assign(h.context, {
    Event: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
    finishCoachWorkout() {}, saveCoachWorkout() {},
    coachWorkoutCopyEntries() { return []; },
    clearCoachWorkoutWeightCopy() {}, refreshCoachWorkoutCopyControls() {},
    scheduleCoachWorkoutAutosave(options) { calls.push({ action: "save", options: { ...options } }); },
    setCoachWorkoutStatus(message, error) { calls.push({ action: "status", message, error }); }
  });
  h.document.getElementById = (id) => ({
    "coach-workout-log-form": form,
    "coach-workout-exercises": list,
    "coach-workout-group-stack": stack
  }[id] || null);
  h.document.addEventListener = () => {};
  h.context.window.addEventListener = () => {};
  h.context.window.CoachRestTimer = {
    subscribe() {}, getState: () => state,
    start(options) { calls.push({ action: "start", options: { ...options } }); },
    toggle() { calls.push({ action: "toggle" }); },
    adjust(seconds) { calls.push({ action: "adjust", seconds }); }
  };
  vm.runInContext(functionSource("handleCoachWorkoutForm"), h.context);
  h.context.handleCoachWorkoutForm();
  function click(kind, { owner = "set-a", values = ["50", "8"], validity = [true, true], amount = "15" } = {}) {
    const fields = values.map((value, index) => ({
      value, events: [], checkValidity: () => validity[index], focus() { this.focused = true; },
      dispatchEvent(event) { this.events.push({ type: event.type, bubbles: event.bubbles, value: this.value }); }
    }));
    const section = { dataset: { coachRestOwner: owner }, querySelectorAll: () => fields };
    const card = {};
    const target = {
      dataset: { coachRestAdjust: amount },
      closest(selector) {
        if (selector === "[data-coach-workout-group-card]") return card;
        if (["[data-coach-grouped-section]", "[data-coach-rest-owner]"].includes(selector)) return section;
        if (selector === `[${kind}]`) return target;
        return null;
      }
    };
    events.get("stack:click")({ target });
    return fields;
  }
  return { calls, click, setState(next) { state = next; } };
}

test("Log Set validates weight and reps before scheduling save and starting inline rest", () => {
  for (const options of [
    { values: ["-1", "8"], validity: [false, true] },
    { values: ["50", "1.5"], validity: [true, false] },
    { values: ["", "8"], validity: [false, true] }
  ]) {
    const h = clickFixture();
    const fields = h.click("data-coach-grouped-log-round", options);
    assert.ok(fields.some((field) => field.focused));
    assert.equal(h.calls.filter((call) => ["save", "start"].includes(call.action)).length, 0);
    assert.equal(h.calls.at(-1).error, true);
  }
  const h = clickFixture();
  h.click("data-coach-grouped-log-round", { values: ["0", "8"] });
  assert.deepEqual(h.calls, [
    { action: "save", options: { delayMs: 0 } },
    { action: "start", options: { inline: true, owner: "set-a" } }
  ]);
});

test("Log Set fills valid blank weight and reps with zero and synchronizes before save", () => {
  for (const values of [["", "8"], ["50", ""], ["", ""]]) {
    const h = clickFixture();
    const fields = h.click("data-coach-grouped-log-round", { values });
    assert.deepEqual(fields.map((field) => field.value), values.map((value) => value || "0"));
    fields.forEach((field, index) => {
      assert.deepEqual(field.events, values[index] === "" ? [{ type: "input", bubbles: true, value: "0" }] : []);
    });
    assert.deepEqual(h.calls.map((call) => call.action), ["save", "start"]);
  }
});

test("rest buttons only control the active inline owner", () => {
  const h = clickFixture();
  h.setState({ active: true, inline: true, owner: "set-a" });
  h.click("data-coach-rest-toggle", { owner: "set-b" });
  h.click("data-coach-rest-adjust", { owner: "set-b" });
  assert.equal(h.calls.length, 0);
  h.click("data-coach-rest-toggle");
  h.click("data-coach-rest-adjust", { amount: "-15" });
  h.click("data-coach-rest-adjust", { amount: "15" });
  assert.deepEqual(h.calls, [
    { action: "toggle" }, { action: "adjust", seconds: -15 }, { action: "adjust", seconds: 15 }
  ]);
  h.setState({ active: false, inline: true, owner: "set-a" });
  h.click("data-coach-rest-toggle");
  h.setState({ active: true, inline: false, owner: "set-a" });
  h.click("data-coach-rest-adjust");
  assert.equal(h.calls.length, 3);
});
