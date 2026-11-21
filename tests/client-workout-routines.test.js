const assert = require("node:assert/strict");
const test = require("node:test");
const routines = require("../js/client-workout-routines.js");
const { programs } = require("../js/client-explore-programs.js");

const days = [
  ["full-body", "Full Body Day"],
  ["chest-triceps", "Chest & Triceps"],
  ["back-biceps", "Back & Biceps"],
  ["push-day", "Push Day"],
  ["pull-day", "Pull Day"],
  ["glutes", "Glute Focus"],
  ["lower-body", "Lower Body"]
];

test("opens each of Benjamin’s intermediate and advanced routines by its stable ID", () => {
  for (const [id, title] of days) {
    const intermediate = routines.find(`benjamin-${id}`);
    const advanced = routines.find(`benjamin-${id}-advanced`);
    assert.equal(intermediate.title, title);
    assert.equal(advanced.title, title);
    assert.equal(intermediate.level, "Intermediate");
    assert.equal(advanced.level, "Advanced");
    assert.equal(intermediate.format, "single");
    assert.equal(advanced.format, "single");
    assert.equal(intermediate.warmUpCount, 0);
    assert.equal(advanced.warmUpCount, 0);
    assert.deepEqual(advanced.exercises.map(exercise => exercise.name), intermediate.exercises.map(exercise => exercise.name));
    advanced.exercises.forEach((exercise, index) => {
      const base = intermediate.exercises[index];
      const sets = index < 2 ? Math.min(4, base.sets + 1) : base.sets;
      const reps = index === 0 && id !== "lower-body" ? "6–8" : base.prescription.split(" reps")[0];
      assert.equal(exercise.sets, sets);
      assert.equal(exercise.prescription, `${reps} reps x ${sets} sets`);
      assert.deepEqual(Object.keys(exercise), ["name", "sets", "prescription"]);
    });
  }
  assert.equal(routines.find("benjamin-full-body").exercises[2].name, "One Dumbbell Bulgarian Split Squat");
  assert.equal(routines.find("benjamin-lower-body").exercises[3].name, "Single Leg Dumbbell RDL");
  assert.equal(routines.find("benjamin-glutes-advanced").exercises[0].sets, 4);
  assert.equal(routines.find("benjamin-push").title, "Benjamin’s Push Workout");
  assert.equal(routines.find("benjamin-superset").format, "superset");
  assert.equal(routines.find("benjamin-circuit").format, "circuit");
  assert.equal(routines.find("does-not-exist"), undefined);
});

test("renders the two personal levels before the generic program catalog", () => {
  const escape = value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const html = routines.markup(escape);
  assert.match(html, /Benjamin’s Routine[\s\S]*>Intermediate<[\s\S]*>Advanced<[\s\S]*>Programs</);
  assert.match(html, />Chest &amp; Triceps</);
  for (const field of ["level", "goal", "equipment"]) assert.match(html, new RegExp(`data-client-explore-filter="${field}"`));
  for (const program of programs) {
    for (const routine of program.routines) {
      assert.equal(routines.find(routine.id), routine);
      assert.ok(html.includes(`data-client-explore-routine="${routine.id}"`));
    }
  }
  assert.equal((html.match(/data-client-explore-program="[^"]+"[^>]* hidden>/g) || []).length, programs.length - 3);
  assert.doesNotMatch(html, /data-client-explore-routine="benjamin-(push|superset|circuit)"/);
});

test("filters the full catalog and resets without adding duplicate dialog listeners", () => {
  function node(properties = {}) {
    return {
      ...properties,
      listeners: {},
      addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); },
      emit(type) { for (const listener of this.listeners[type]) listener(); },
      setAttribute(name, value) { this[name] = value; },
      focus() { this.focused = true; }
    };
  }
  const fields = ["level", "goal", "equipment"].map(key => node({ value: "", dataset: { clientExploreFilter: key } }));
  const cards = ["one", "two", "three", "four"].map((id, index) => node({
    dataset: { id, level: index < 3 ? "Beginner" : "Advanced", goal: "Strength", equipment: "Gym" },
    hidden: index >= 3
  }));
  const more = node();
  const reset = node({ hidden: true });
  const empty = node({ hidden: true });
  const status = node();
  const selectors = {
    "[data-client-explore-filter]": fields,
    "[data-client-explore-program]": cards,
    "[data-client-explore-more]": more,
    "[data-client-explore-reset]": reset,
    "[data-client-explore-empty]": empty,
    "[data-client-explore-results]": status
  };
  const catalog = { querySelector: selector => selectors[selector], querySelectorAll: selector => selectors[selector] };
  const container = { querySelector: () => catalog };
  routines.bind(container);
  routines.bind(container);
  const shown = () => cards.filter(card => !card.hidden).map(card => card.dataset.id);

  assert.deepEqual(shown(), ["one", "two", "three"]);
  fields[0].value = "Advanced";
  fields[0].emit("change");
  assert.deepEqual(shown(), ["four"]);
  assert.equal(more.hidden, true);
  assert.equal(status.textContent, "Showing 1 of 1 program.");
  fields[2].value = "Dumbbells";
  fields[2].emit("change");
  assert.deepEqual(shown(), []);
  assert.equal(empty.hidden, false);
  reset.emit("click");
  assert.deepEqual(shown(), ["one", "two", "three"]);
  assert.equal(empty.hidden, true);
  assert.equal(fields[0].focused, true);
  more.emit("click");
  assert.deepEqual(shown(), ["one", "two", "three", "four"]);
  assert.equal(more["aria-expanded"], "true");
  more.emit("click");
  assert.deepEqual(shown(), ["one", "two", "three"]);
});
