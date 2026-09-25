const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/workout-generator-dialog.js"), "utf8");
const { safeDemoUrl } = require("../js/workout-generator-dialog.js");

function fixture() {
  let document;
  function element(tag) {
    const listeners = new Map();
    const attributes = new Map();
    const classes = new Set();
    const node = {
      tag, children: [], dataset: {}, value: "", checked: false, disabled: false, hidden: false,
      textContent: "", open: false, isConnected: true, focusCount: 0,
      get className() { return [...classes].join(" "); },
      set className(value) { classes.clear(); for (const name of value.split(/\s+/)) if (name) classes.add(name); },
      classList: {
        add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name),
        toggle(name, force) { if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name); }
      },
      get options() { return node.children.filter((child) => child.tag === "option"); },
      append(...children) {
        for (const child of children) { child.parent = node; node.children.push(child); }
        if (tag === "select" && !node.value) node.value = node.options[0]?.value || "";
      },
      replaceChildren(...children) { node.children = []; if (tag === "select") node.value = ""; node.append(...children); },
      remove() { if (node.parent) node.parent.children = node.parent.children.filter((child) => child !== node); },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name); },
      addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
      emit(type, extra = {}) {
        const event = { target: node, preventDefault() { this.defaultPrevented = true; }, ...extra };
        return Promise.all((listeners.get(type) || []).map((listener) => listener(event)));
      },
      matches(selector) {
        if (selector.startsWith(".")) return classes.has(selector.slice(1));
        if (selector === "input:checked") return tag === "input" && node.checked;
        const dataMatch = selector.match(/^\[data-([^=]+)="([^"]+)"\]$/);
        if (dataMatch) return node.dataset[dataMatch[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase())] === dataMatch[2];
        return tag === selector || selector === "*";
      },
      querySelectorAll(selector) {
        return node.children.flatMap((child) => [child, ...child.querySelectorAll("*")])
          .filter((child) => selector.split(",").some((value) => child.matches(value.trim())));
      },
      querySelector(selector) { return node.querySelectorAll(selector)[0] || null; },
      getBoundingClientRect: () => ({ top: 20, left: 20, right: 620, bottom: 820 }),
      scrollIntoView() {},
      focus() { node.focusCount++; document.activeElement = node; },
      showModal() { node.open = true; },
      close() { node.open = false; node.emit("close"); }
    };
    return node;
  }
  document = { body: element("body"), createElement: element, activeElement: null };
  const workout = {
    title: "Today's workout", estimatedMinutes: 30, notes: ["Allow time to warm up."],
    exercises: [{ id: "one", name: "Goblet squat", sets: 3, reps: "8-12", prescription: "8-12 reps x 3 sets", rest: "90 sec", demo_url: "https://example.com/demo", instructions: "Move with control." }]
  };
  const calls = [];
  const engine = {
    FOCUS_OPTIONS: [{ value: "full_body", label: "Full body" }, { value: "arms", label: "Arms" }],
    EQUIPMENT_OPTIONS: [{ value: "full_gym", label: "Full gym" }, { value: "bodyweight", label: "Bodyweight" }, { value: "dumbbell", label: "Dumbbells" }],
    generate(options) { calls.push(options); return JSON.parse(JSON.stringify(workout)); },
    alternatives() { return [{ ...workout.exercises[0], id: "two", name: "Split squat" }]; },
    swap(current, index, replacement) { const updated = JSON.parse(JSON.stringify(current)); updated.exercises[index] = replacement; return updated; }
  };
  const context = vm.createContext({ window: { FWB_WORKOUT_GENERATOR: engine }, document, URL, console });
  vm.runInContext(source, context);
  const api = context.window.FWB_WORKOUT_GENERATOR_DIALOG;
  const trigger = element("button");
  function open(options = {}) { return api.open({ library: [{ id: "one" }], history: [], returnFocus: trigger, ...options }); }
  return {
    document, element, api, engine, calls, trigger, workout, open,
    get dialog() { return document.body.querySelector("dialog"); },
    get form() { return document.body.querySelector("form"); },
    get use() { return document.body.querySelector(".workout-generator-use"); },
    get status() { return document.body.querySelector(".workout-generator-status"); }
  };
}

test("demo links accept web URLs and reject script, data, credentials, and control characters", () => {
  assert.equal(safeDemoUrl("https://example.com/demo"), "https://example.com/demo");
  assert.equal(safeDemoUrl("http://example.com/demo"), "http://example.com/demo");
  for (const value of ["javascript:alert(1)", "data:text/html,<script>", "https://user:password@example.com", "https://exam\nple.com", "/relative", null]) {
    assert.equal(safeDemoUrl(value), "");
  }
});

test("one native dialog is reused and cancel restores the invoking button", async () => {
  const h = fixture();
  assert.equal(h.open(), true);
  h.open();
  assert.equal(h.document.body.querySelectorAll("dialog").length, 1);
  assert.equal(h.document.body.classList.contains("workout-generator-open"), true);
  await h.dialog.emit("cancel");
  assert.equal(h.dialog.open, false);
  assert.equal(h.trigger.focusCount, 1);
  assert.equal(h.document.body.classList.contains("workout-generator-open"), false);
  h.open();
  assert.equal(h.document.body.querySelectorAll("dialog").length, 1);
});

test("generation previews without applying, and preference changes invalidate the preview", async () => {
  const h = fixture();
  let uses = 0;
  h.open({ onUse() { uses++; return true; } });
  await h.form.emit("submit");
  assert.equal(uses, 0);
  assert.equal(h.use.hidden, false);
  assert.equal(h.calls[0].focus, "full_body");
  assert.equal(h.calls[0].minutes, 30);
  assert.deepEqual(Array.from(h.calls[0].equipment), ["full_gym", "bodyweight"]);
  await h.form.emit("change");
  assert.equal(h.use.hidden, true);
  assert.equal(h.use.disabled, true);
  assert.match(h.status.textContent, /Preferences changed/);
});

test("equipment choices are exclusive with full gym and always include bodyweight", async () => {
  const h = fixture();
  h.open();
  const inputs = h.dialog.querySelectorAll("input");
  const fullGym = inputs.find((node) => node.value === "full_gym");
  const bodyweight = inputs.find((node) => node.value === "bodyweight");
  const dumbbell = inputs.find((node) => node.value === "dumbbell");
  assert.equal(bodyweight.disabled, true);
  dumbbell.checked = true;
  await dumbbell.emit("change");
  await h.form.emit("submit");
  assert.equal(fullGym.checked, false);
  assert.deepEqual(Array.from(h.calls[0].equipment), ["bodyweight", "dumbbell"]);
  fullGym.checked = true;
  await fullGym.emit("change");
  assert.equal(dumbbell.checked, false);
  assert.equal(bodyweight.checked, true);
});

test("swapping replaces one reviewed exercise and uses the revised workout", async () => {
  const h = fixture();
  let accepted;
  h.open({ onUse(workout) { accepted = workout; return true; } });
  await h.form.emit("submit");
  await h.dialog.querySelector(".workout-generator-swap-trigger").emit("click");
  await h.dialog.querySelector(".workout-generator-swap").querySelector("button").emit("click");
  assert.match(h.status.textContent, /replaced with Split squat/);
  await h.use.emit("click");
  assert.equal(accepted.exercises[0].name, "Split squat");
  assert.equal(h.dialog.open, false);
  assert.equal(h.trigger.focusCount, 0);
});

test("pending apply ignores duplicate clicks and Escape; rejection keeps a usable preview", async () => {
  const h = fixture();
  let resolve;
  let uses = 0;
  h.open({ onUse() { uses++; return uses > 1 ? true : new Promise((done) => { resolve = done; }); } });
  await h.form.emit("submit");
  const pending = h.use.emit("click");
  await h.use.emit("click");
  await h.dialog.emit("cancel");
  assert.equal(uses, 1);
  assert.equal(h.dialog.open, true);
  assert.equal(h.use.disabled, true);
  resolve(false);
  await pending;
  assert.equal(h.dialog.open, true);
  assert.equal(h.use.disabled, false);
  assert.equal(h.use.hidden, false);
  await h.use.emit("click");
  assert.equal(uses, 2);
  assert.equal(h.dialog.open, false);
});

test("apply errors remain visible and allow retry; empty libraries disable generation", async () => {
  const h = fixture();
  let fail = true;
  h.open({ onUse() { if (fail) throw new Error("Finish or cancel your current workout first."); return true; } });
  await h.form.emit("submit");
  await h.use.emit("click");
  assert.equal(h.dialog.open, true);
  assert.equal(h.use.disabled, false);
  assert.match(h.status.textContent, /Finish or cancel/);
  fail = false;
  await h.use.emit("click");
  assert.equal(h.dialog.open, false);
  h.open({ library: [] });
  assert.equal(h.dialog.querySelector(".workout-generator-generate").disabled, true);
  assert.match(h.status.textContent, /no approved exercises/);
});

test("untrusted exercise text stays text and unsafe demo links are not rendered", async () => {
  const h = fixture();
  h.workout.exercises[0].name = '<img src=x onerror="alert(1)">';
  h.workout.exercises[0].demo_url = "javascript:alert(1)";
  h.open();
  await h.form.emit("submit");
  assert.equal(h.dialog.querySelector("h4").textContent, h.workout.exercises[0].name);
  assert.equal(h.dialog.querySelector("a"), null);
  assert.equal(h.dialog.querySelector("img"), null);
});
