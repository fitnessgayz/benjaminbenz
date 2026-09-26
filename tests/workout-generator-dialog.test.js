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
      get options() { return node.children.flatMap((child) => child.tag === "optgroup" ? child.children : [child]).filter((child) => child.tag === "option"); },
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
    FOCUS_OPTIONS: require("../js/workout-generator.js").FOCUS_OPTIONS,
    MUSCLE_OPTIONS: require("../js/workout-generator.js").MUSCLE_OPTIONS,
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

test("recovery category contains three regions and locks gentle intensity while retaining strength preferences", async () => {
  const h = fixture();
  h.open();
  const group = h.dialog.querySelectorAll("optgroup").find((node) => node.label === "Mobility / flexibility / recovery");
  assert.deepEqual(group.children.map((option) => option.value), ["recovery_upper", "recovery_lower", "recovery_full"]);
  const focus = h.dialog.querySelectorAll("select").find((node) => node.name === "focus");
  const intensity = h.dialog.querySelectorAll("select").find((node) => node.name === "intensity");
  intensity.value = "challenging";
  for (const option of group.children) {
    focus.value = option.value;
    await focus.emit("change");
    assert.equal(intensity.value, "easy");
    assert.equal(intensity.disabled, true);
    await h.form.emit("submit");
    assert.equal(h.calls.at(-1).focus, option.value);
    assert.equal(h.calls.at(-1).intensity, "easy");
  }
  focus.value = "full_body";
  await focus.emit("change");
  assert.equal(intensity.disabled, false);
  assert.equal(intensity.value, "challenging");
});

test("initial preferences prefill daily recommendations and reopening restores ordinary defaults", async () => {
  const h = fixture();
  h.open({ initialPreferences: { focus: "recovery_lower", minutes: 20, intensity: "moderate", equipment: [] } });
  await h.form.emit("submit");
  assert.equal(h.calls[0].focus, "recovery_lower");
  assert.equal(h.calls[0].minutes, 20);
  assert.equal(h.calls[0].intensity, "easy");
  assert.deepEqual(Array.from(h.calls[0].equipment), ["bodyweight"]);
  await h.dialog.emit("cancel");
  h.open();
  await h.form.emit("submit");
  assert.equal(h.calls[1].focus, "full_body");
  assert.equal(h.calls[1].minutes, 30);
  assert.equal(h.calls[1].intensity, "moderate");
  assert.deepEqual(Array.from(h.calls[1].equipment), ["full_gym", "bodyweight"]);
  assert.equal(h.dialog.querySelectorAll("select").find((node) => node.name === "intensity").disabled, false);
});

test("initial preferences validate each field and never accept unsupported equipment", async () => {
  const h = fixture();
  h.open({ initialPreferences: { focus: "invalid", minutes: 5, intensity: "extreme", equipment: ["machine-that-does-not-exist"] } });
  await h.form.emit("submit");
  assert.equal(h.calls[0].focus, "full_body");
  assert.equal(h.calls[0].minutes, 30);
  assert.equal(h.calls[0].intensity, "moderate");
  assert.deepEqual(Array.from(h.calls[0].equipment), ["full_gym", "bodyweight"]);
  await h.dialog.emit("cancel");
  h.open({ initialPreferences: { focus: "arms", minutes: 45, intensity: "easy", equipment: ["dumbbell"] } });
  await h.form.emit("submit");
  assert.equal(h.calls[1].focus, "arms");
  assert.equal(h.calls[1].minutes, 45);
  assert.equal(h.calls[1].intensity, "easy");
  assert.deepEqual(Array.from(h.calls[1].equipment), ["bodyweight", "dumbbell"]);
});

test('muscle chips support multiple selections and invalidate the prior preview', async () => {
  const h = fixture();
  h.open();
  await h.form.emit('submit');
  const inputs = h.dialog.querySelector('.workout-generator-muscle-choices').querySelectorAll('input');
  assert.equal(inputs.length, 12);
  for (const value of ['triceps', 'chest', 'shoulders']) {
    const input = inputs.find((node) => node.value === value);
    input.checked = true;
    await input.emit('change');
  }
  assert.equal(h.use.hidden, true);
  await h.form.emit('submit');
  assert.deepEqual(Array.from(h.calls.at(-1).selectedMuscles), ['chest', 'shoulders', 'triceps']);
  assert.equal(h.calls.at(-1).focus, 'full_body');
  for (const input of inputs) { input.checked = false; await input.emit('change'); }
  await h.form.emit('submit');
  assert.equal(h.calls.at(-1).focus, 'full_body');
  assert.deepEqual(Array.from(h.calls.at(-1).selectedMuscles), []);
});

test('quick presets clear selected muscles and a muscle selection restores strength intensity after recovery', async () => {
  const h = fixture();
  h.open({ initialPreferences: { focus: 'full_body', intensity: 'challenging', selectedMuscles: ['chest', 'triceps'] } });
  const focus = h.dialog.querySelectorAll('select').find((node) => node.name === 'focus');
  const intensity = h.dialog.querySelectorAll('select').find((node) => node.name === 'intensity');
  const inputs = h.dialog.querySelector('.workout-generator-muscle-choices').querySelectorAll('input');
  for (const value of ['arms', 'recovery_upper']) {
    focus.value = value;
    await focus.emit('change');
    await h.form.emit('submit');
    assert.deepEqual(Array.from(h.calls.at(-1).selectedMuscles), []);
    assert.equal(h.calls.at(-1).focus, value);
  }
  assert.equal(intensity.value, 'easy');
  const chest = inputs.find((node) => node.value === 'chest');
  chest.checked = true;
  await chest.emit('change');
  assert.equal(intensity.disabled, false);
  assert.equal(intensity.value, 'challenging');
  await h.form.emit('submit');
  assert.equal(h.calls.at(-1).focus, 'chest');
  assert.deepEqual(Array.from(h.calls.at(-1).selectedMuscles), ['chest']);
});

test('legacy single-muscle preferences and canonical multi-muscle preferences reopen as checked chips', async () => {
  const h = fixture();
  for (const [initialPreferences, expected] of [
    [{ focus: 'lats' }, ['lats']],
    [{ focus: 'full_body', selectedMuscles: ['triceps', 'chest', 'chest'] }, ['chest', 'triceps']],
    [{ focus: 'back', selectedMuscles: [] }, ['back']],
    [{ focus: 'recovery_full', selectedMuscles: ['chest'] }, []],
    [{ focus: 'full_body', selectedMuscles: ['chest', 'invalid'] }, []]
  ]) {
    h.open({ initialPreferences });
    await h.form.emit('submit');
    assert.deepEqual(Array.from(h.calls.at(-1).selectedMuscles), expected);
    await h.dialog.emit('cancel');
  }
});
