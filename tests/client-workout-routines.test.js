const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const routines = require("../js/client-workout-routines.js");
const { programs, sportPrograms } = require("../js/client-explore-programs.js");

const days = [
  ["full-body", "Full Body Day"],
  ["chest-triceps", "Chest & Triceps"],
  ["back-biceps", "Back & Biceps"],
  ["push-day", "Push Day"],
  ["pull-day", "Pull Day"],
  ["glutes", "Glute Focus"],
  ["lower-body", "Lower Body"]
];

const targeted = [
  ["arms-day", "Arms Day"],
  ["shoulders-arms", "Shoulders & Arms"],
  ["abs-core", "Abs & Core"],
  ["abs-butt", "Abs & Butt"]
];

test("opens each of Benjamin’s intermediate and advanced routines by its stable ID", () => {
  for (const [id, title] of days) {
    const intermediate = routines.find(`benjamin-${id}`);
    const advanced = routines.find(`benjamin-${id}-advanced`);
    assert.equal(intermediate.title, title);
    assert.equal(advanced.title, title);
    assert.equal(intermediate.level, "Intermediate");
    assert.equal(advanced.level, "Advanced");
    assert.equal(intermediate.cover, `benjamin-${id}`);
    assert.equal(advanced.cover, intermediate.cover);
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

test("opens Explore on five category choices and keeps the filters inside Training Programs", () => {
  const escape = value => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  const html = routines.markup(escape);
  const landing = html.split("</nav>")[0];
  assert.deepEqual(Array.from(landing.matchAll(/data-client-explore-category="([^"]+)"/g), match => match[1]),
    ["benjamin", "training", "sports", "targeted", "at-home"]);
  assert.equal((html.match(/data-client-explore-category-panel="[^"]+" hidden/g) || []).length, 5);
  const benjamin = html.split('data-client-explore-category-panel="benjamin"')[1].split("</section>")[0];
  const training = html.split('data-client-explore-category-panel="training"')[1].split("</section>")[0];
  assert.match(benjamin, /Benjamin’s Routine[\s\S]*>Intermediate<[\s\S]*>Advanced</);
  assert.match(html, />Chest &amp; Triceps</);
  for (const field of ["level", "goal", "equipment"]) assert.match(training, new RegExp(`data-client-explore-filter="${field}"`));
  for (const program of programs) {
    for (const routine of program.routines) {
      assert.equal(routines.find(routine.id), routine);
      assert.ok(html.includes(`data-client-explore-routine="${routine.id}"`));
    }
  }
  assert.equal((html.match(/data-client-explore-program="[^"]+"[^>]* hidden>/g) || []).length, programs.length - 3);
  assert.doesNotMatch(html, /data-client-explore-routine="benjamin-(push|superset|circuit)"/);
});

test("keeps the six sports with all native sessions, timers, rests, cues and stable IDs", () => {
  assert.deepEqual(sportPrograms.map(program => program.title), ["Pickleball", "Tennis", "Basketball", "Volleyball", "Swimming", "Running"]);
  const html = routines.markup(String).split('data-client-explore-category-panel="sports"')[1].split("</section>")[0];
  const identifiers = new Set();
  for (const program of sportPrograms) {
    assert.match(html, new RegExp(`data-client-sport-program="${program.id}"`));
    assert.deepEqual(program.routines.map(routine => routine.title), ["Warm-up", "Mobility", "Strength"].map(label => `${program.title} ${label}`));
    for (const routine of program.routines) {
      assert.match(routine.id, /^[a-f\d]{8}-[a-f\d]{4}-5[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/);
      identifiers.add(routine.id);
      assert.equal(routines.find(routine.id), routine);
      assert.equal(routine.format, "single");
      assert.equal(routine.warmUpCount, 0);
      assert.equal(routine.exercises.length, 5);
      assert.ok(html.includes(`data-client-explore-routine="${routine.id}"`));
      for (const exercise of routine.exercises) {
        assert.match(exercise.rest, /^\d+s$/);
        assert.equal(exercise.instructions.length, 1);
        assert.ok(html.includes(exercise.instructions[0]));
      }
    }
  }
  assert.equal(identifiers.size, 18);
  const pickleball = sportPrograms[0].routines[0].exercises;
  assert.equal(pickleball[0].timed, true);
  assert.equal(pickleball[0].prescription, "45 seconds x 2 sets");
  assert.equal(pickleball[3].timed, false);
  assert.equal(pickleball[3].prescription, "2 x 6 reps per side");
  assert.equal(sportPrograms[4].routines[2].exercises[0].rest, "60s");
  assert.equal(sportPrograms[5].routines[2].exercises[4].prescription, "25 sec/side x 2 sets");
});

test("keeps the four targeted workouts independent of Benjamin’s levels", () => {
  const html = routines.markup(String);
  const section = html.split('data-client-explore-category-panel="targeted"')[1].split("</section>")[0];
  for (const [id, title] of targeted) {
    const routine = routines.find(id);
    assert.equal(routine.title, title);
    assert.equal(routine.cover, id);
    assert.equal(routine.format, "single");
    assert.equal(routine.warmUpCount, 0);
    assert.equal(routines.find(`benjamin-${id}`), undefined);
    assert.equal(routines.find(`${id}-advanced`), undefined);
    assert.ok(section.includes(`data-client-explore-routine="${id}"`));
  }
  assert.equal(routines.find("abs-core").exercises[0].prescription, "10–15 reps x 3 sets");
  assert.equal(routines.find("abs-butt").exercises[0].prescription, "8–12 reps x 3 sets");
});

test("uses a cover on every personal routine and generic program family", () => {
  const allMarkup = routines.markup(String);
  const categoryArt = [...allMarkup.matchAll(/<div class="client-explore-category-art">([^<]*<img[^>]+>)<\/div>/g)].map(match => match[1]);
  assert.equal(categoryArt.length, 5);
  const html = allMarkup.split('data-client-explore-category-panel="at-home"')[0]
    .replace(/<div class="client-explore-category-art">[^<]*<img[^>]+><\/div>/g, "");
  for (const [id] of days) {
    assert.equal(html.split(`src="images/routines/benjamin-${id}.webp?v=2"`).length - 1, 2);
  }
  for (const [id] of targeted) {
    assert.equal(html.split(`src="images/routines/${id}.webp?v=2"`).length - 1, 1);
  }
  for (const [id, family] of [
    ["beginner-push-pull-legs-gym", "push-pull-legs"], ["intermediate-full-body-gym", "full-body"],
    ["beginner-upper-lower-gym", "upper-lower"], ["beginner-5x5", "five-by-five"],
    ["power-hypertrophy-4-day", "power-hypertrophy"]
  ]) {
    const header = html.split(`data-client-explore-program="${id}"`)[1].split("</summary>")[0];
    assert.ok(header.includes(`src="images/routines/${family}.webp?v=2"`));
  }
  const covers = Array.from(html.matchAll(/<img class="client-explore-cover"[^>]+>/g), match => match[0]);
  assert.equal(covers.length, days.length * 2 + targeted.length + programs.length);
  for (const cover of covers) assert.match(cover, /width="96" height="64" alt="" loading="lazy" decoding="async"/);
  const imagePaths = new Set(covers.map(cover => {
    const image = cover.match(/src="(images\/routines\/[a-z-]+\.webp)\?v=2"/);
    assert.ok(image, cover);
    return image[1];
  }));
  assert.equal(imagePaths.size, 16);
  for (const imagePath of imagePaths) {
    const bytes = fs.readFileSync(path.join(__dirname, "..", imagePath));
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", imagePath);
  }
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
  const container = { querySelector: selector => selector === "[data-client-explore-catalog]" ? catalog : null };
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
