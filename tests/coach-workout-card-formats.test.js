const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/coach-workout-log.js"), "utf8");
function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Expected ${name}`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n(?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next + 1);
}
const plain = (value) => JSON.parse(JSON.stringify(value));

function fixture(format = "single", specifications = []) {
  const exercises = [];
  const calls = [];
  const codeContext = "client@example.com|2026-09-21";
  function makeExercise(values = {}) {
    const fields = {
      name: { value: values.name || "" }, notes: { value: values.notes || "" }
    };
    const rows = (values.sets || [{ label: "1", setType: "working", setNumber: 1, weight: "50", reps: "8", rir: "2" }]).map((set) => {
      const fields = {
        "set-label": { value: set.label ?? "1" },
        weight: { value: set.weight ?? "" }, reps: { value: set.reps ?? "" }, rir: { value: set.rir ?? "" }
      };
      return {
        dataset: { coachWorkoutSetType: set.setType || "working", coachWorkoutSetNumber: String(set.setNumber || 1) },
        fields,
        querySelector: (selector) => fields[selector.match(/\[data-coach-workout-(.+)\]/)?.[1]] || null
      };
    });
    const exercise = {
      dataset: {
        coachWorkoutCode: values.code || "", coachWorkoutCodeContext: values.codeContext || codeContext,
        ...(values.groupId ? { coachWorkoutGroupId: values.groupId } : {}),
        ...(values.groupFormat ? { coachWorkoutGroupFormat: values.groupFormat } : {})
      }, fields, rows,
      querySelector: (selector) => fields[selector.match(/\[data-coach-workout-(.+)\]/)?.[1]] || null,
      querySelectorAll: () => rows,
      insertAdjacentHTML(position, serializedValues) {
        assert.equal(position, "afterend");
        const added = makeExercise(JSON.parse(serializedValues));
        exercises.splice(exercises.indexOf(this) + 1, 0, added);
      },
      get nextElementSibling() { return exercises[exercises.indexOf(this) + 1] || null; }
    };
    return exercise;
  }
  specifications.forEach((values) => exercises.push(makeExercise(values)));
  const context = vm.createContext({
    coachWorkoutGroupId: 0,
    coachWorkoutWarmUpSetType: "warm_up", coachWorkoutWorkingSetType: "working", coachWorkoutWarmUpSetNumberBase: 1000,
    coachWorkoutFormatValue: () => format,
    coachWorkoutExerciseElements: () => exercises,
    coachWorkoutExerciseMarkup: (values) => JSON.stringify(values),
    renumberCoachWorkoutExercises: () => calls.push({ action: "render" }),
    scheduleCoachWorkoutAutosave: () => calls.push({ action: "autosave" }),
    focusCoachWorkoutVisibleField: (index, field) => calls.push({ action: "focus", index, field }),
    addCoachWorkoutExercise(values, after) {
      const added = makeExercise(values);
      exercises.splice(exercises.indexOf(after) + 1, 0, added);
      return added;
    },
    document: {
      querySelector: () => null,
      querySelectorAll: () => exercises,
      getElementById(id) {
        return id === "coach-workout-client" ? { value: "client@example.com" }
          : id === "coach-workout-date" ? { value: "2026-09-21" } : null;
      }
    }
  });
  vm.runInContext([
    "coachWorkoutGroups", "coachWorkoutGroupFormat", "nextCoachWorkoutGroupId", "setCoachWorkoutGroup",
    "materializeCoachWorkoutGroups", "coachWorkoutGroupedExerciseIndexes", "coachWorkoutDefaultExerciseCount",
    "changeCoachWorkoutGroupFormat", "addCoachWorkoutGroupExercise", "coachWorkoutSetType", "coachWorkoutSetRowsByType",
    "coachWorkoutExerciseDrafts", "normalizeCoachWorkoutEmail", "coachWorkoutExerciseValues",
    "coachWorkoutFormatMarker", "coachWorkoutExerciseNote", "coachWorkoutSaveSignature"
  ].map(functionSource).join("\n"), context);
  return {
    context, exercises, calls,
    groups: () => context.coachWorkoutGroups(format, exercises),
    indexes: () => Array.from(context.coachWorkoutGroups(format, exercises), (group) => Array.from(group, (item) => item.exerciseIndex)),
    formats: () => Array.from(context.coachWorkoutGroups(format, exercises), (group) => context.coachWorkoutGroupFormat(group)),
    card(indexes, cardFormat) {
      return { dataset: { coachWorkoutGroupIndexes: indexes.join(","), coachWorkoutFormat: cardFormat } };
    }
  };
}

test("legacy drafts retain global straight-set, superset and circuit grouping", () => {
  const specs = [{ name: "Press" }, { name: "Row" }, { name: "Squat" }];
  assert.deepEqual(fixture("single", specs).indexes(), [[0], [1], [2]]);
  assert.deepEqual(fixture("superset", specs).indexes(), [[0, 1], [2]]);
  assert.deepEqual(fixture("circuit", specs).indexes(), [[0, 1, 2]]);
});

test("explicit per-card formats coexist and ungrouped runs keep correct source indexes", () => {
  const h = fixture("superset", [
    { name: "Press" }, { name: "Row" },
    { name: "Squat", groupId: "single-a", groupFormat: "single" },
    { name: "Fly", groupId: "circuit-a", groupFormat: "circuit" },
    { name: "Curl", groupId: "circuit-a", groupFormat: "circuit" },
    { name: "Extension" }, { name: "Calf raise" }, { name: "Crunch" }
  ]);
  assert.deepEqual(h.indexes(), [[0, 1], [2], [3, 4], [5, 6], [7]]);
  assert.deepEqual(h.formats(), ["superset", "single", "circuit", "superset", "superset"]);
});

test("materializing groups preserves layouts and avoids restored group-ID collisions", () => {
  const h = fixture("superset", [
    { name: "Press" }, { name: "Row" },
    { name: "Squat", groupId: "coach-group-1", groupFormat: "single" },
    { name: "Fly", groupId: "coach-group-2", groupFormat: "single" },
    { name: "Curl" }, { name: "Extension" }
  ]);
  const originalGroups = h.indexes();
  h.context.materializeCoachWorkoutGroups();
  assert.deepEqual(h.indexes(), originalGroups);
  const ids = h.exercises.map((exercise) => exercise.dataset.coachWorkoutGroupId);
  assert.equal(ids[0], ids[1]);
  assert.equal(ids[4], ids[5]);
  assert.equal(new Set([ids[0], ids[2], ids[3], ids[4]]).size, 4);
  h.context.materializeCoachWorkoutGroups();
  assert.deepEqual(h.exercises.map((exercise) => exercise.dataset.coachWorkoutGroupId), ids);
});

test("converting one straight-set card adds its partner without regrouping neighbors or replacing entered rows", () => {
  const h = fixture("single", [
    { name: "Press", code: "CW01", notes: "Keep elbows tucked", sets: [
      { label: "W1", setType: "warm_up", setNumber: 1001, weight: "15", reps: "10", rir: "3" },
      { label: "1", setType: "working", setNumber: 1, weight: "55", reps: "8", rir: "2" }
    ] },
    { name: "Squat", code: "CW02" }
  ]);
  const first = h.exercises[0];
  const neighbor = h.exercises[1];
  const rows = first.rows.slice();
  const before = plain(h.context.coachWorkoutExerciseDrafts());
  h.context.changeCoachWorkoutGroupFormat(h.card([0], "single"), "superset");
  assert.deepEqual(h.indexes(), [[0, 1], [2]]);
  assert.deepEqual(h.formats(), ["superset", "single"]);
  assert.equal(h.exercises[0], first);
  assert.equal(h.exercises[2], neighbor);
  assert.deepEqual(first.rows, rows);
  const after = plain(h.context.coachWorkoutExerciseDrafts());
  for (const [original, updated] of [[before[0], after[0]], [before[1], after[2]]]) {
    for (const field of ["code", "codeContext", "name", "sets", "notes"]) assert.deepEqual(updated[field], original[field]);
  }
  assert.equal(after[1].name, "");
  assert.equal(after[1].code, "");
  assert.equal(h.calls.filter((call) => call.action === "autosave").length, 1);
  assert.deepEqual(h.calls.at(-1), { action: "focus", index: 1, field: "name" });
});

test("circuit conversions keep every existing exercise and split excess superset members into singles", () => {
  const h = fixture("circuit", [
    { name: "Press", code: "CW01" }, { name: "Row", code: "CW02" },
    { name: "Squat", code: "CW03" }, { name: "Curl", code: "CW04" }
  ]);
  const originals = h.exercises.slice();
  h.context.changeCoachWorkoutGroupFormat(h.card([0, 1, 2, 3], "circuit"), "superset");
  assert.deepEqual(h.indexes(), [[0, 1], [2], [3]]);
  assert.deepEqual(h.formats(), ["superset", "single", "single"]);
  assert.deepEqual(h.exercises, originals);
  h.context.changeCoachWorkoutGroupFormat(h.card([0, 1], "superset"), "single");
  assert.deepEqual(h.indexes(), [[0], [1], [2], [3]]);
  assert.deepEqual(h.formats(), ["single", "single", "single", "single"]);
  assert.deepEqual(h.exercises.map((exercise) => exercise.dataset.coachWorkoutCode), ["CW01", "CW02", "CW03", "CW04"]);
});

test("conversion to circuit supplies three stations and adding an exercise only grows that circuit", () => {
  const h = fixture("single", [{ name: "Press" }, { name: "Squat" }]);
  const neighbor = h.exercises[1];
  h.context.changeCoachWorkoutGroupFormat(h.card([0], "single"), "circuit");
  assert.deepEqual(h.indexes(), [[0, 1, 2], [3]]);
  assert.equal(h.exercises[3], neighbor);
  h.context.addCoachWorkoutGroupExercise(h.card([0, 1, 2], "circuit"));
  assert.deepEqual(h.indexes(), [[0, 1, 2, 3], [4]]);
  assert.equal(h.exercises[4], neighbor);
  assert.deepEqual(h.formats(), ["circuit", "single"]);
  assert.deepEqual(h.calls.at(-1), { action: "focus", index: 3, field: "name" });
});

test("invalid or unchanged formats are no-ops and full supersets cannot add a third member", () => {
  const h = fixture("superset", [{ name: "Press" }, { name: "Row" }]);
  const card = h.card([0, 1], "superset");
  h.context.changeCoachWorkoutGroupFormat(card, "superset");
  h.context.changeCoachWorkoutGroupFormat(card, "invalid");
  h.context.addCoachWorkoutGroupExercise(card);
  assert.equal(h.exercises.length, 2);
  assert.equal(h.calls.length, 0);
});

test("draft serialization retains optional per-card metadata while older drafts stay compatible", () => {
  const h = fixture("single", [
    { name: "Press", code: "CW01", groupId: "coach-group-4", groupFormat: "superset" },
    { name: "Row", code: "CW02", groupId: "coach-group-4", groupFormat: "superset" },
    { name: "Squat", code: "CW03" }
  ]);
  const drafts = plain(h.context.coachWorkoutExerciseDrafts());
  assert.equal(drafts[0].groupId, "coach-group-4");
  assert.equal(drafts[1].groupFormat, "superset");
  assert.equal(drafts[2].groupId, "");
  assert.equal(drafts[2].groupFormat, "");
  const restored = fixture("single", drafts);
  assert.deepEqual(restored.indexes(), [[0, 1], [2]]);
  assert.deepEqual(restored.formats(), ["superset", "single"]);
  assert.deepEqual(plain(restored.context.coachWorkoutExerciseDrafts()), drafts);
});

test("exercise markup restores grouping metadata and does not impose a format on legacy drafts", () => {
  const context = vm.createContext({
    coachWorkoutExerciseId: 0,
    coachWorkoutSetMarkup: () => "",
    escapeCoachWorkoutHtml: (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")
  });
  vm.runInContext(functionSource("coachWorkoutExerciseMarkup"), context);
  const grouped = context.coachWorkoutExerciseMarkup({ code: "CW05", groupId: 'group"5', groupFormat: "circuit" });
  assert.match(grouped, /data-coach-workout-code="CW05"/);
  assert.match(grouped, /data-coach-workout-group-id="group&quot;5"/);
  assert.match(grouped, /data-coach-workout-group-format="circuit"/);
  const legacy = context.coachWorkoutExerciseMarkup({ code: "CW05", name: "Press" });
  assert.doesNotMatch(legacy, /data-coach-workout-group-(?:id|format)="[^"]+"/);
});

test("save values and notes use each card's group format and local position", () => {
  const h = fixture("single", [
    { name: "Squat", code: "CW01", groupId: "a", groupFormat: "single" },
    { name: "Press", code: "CW02", groupId: "b", groupFormat: "superset", notes: "Slow eccentric" },
    { name: "Row", code: "CW03", groupId: "b", groupFormat: "superset" },
    { name: "Curl", code: "CW04", groupId: "c", groupFormat: "circuit" },
    { name: "Extension", code: "CW05", groupId: "c", groupFormat: "circuit" }
  ]);
  const values = plain(h.context.coachWorkoutExerciseValues());
  assert.deepEqual(values.map((exercise) => [exercise.groupFormat, exercise.groupIndex, exercise.groupPosition]), [
    ["single", 0, 0], ["superset", 1, 0], ["superset", 1, 1], ["circuit", 2, 0], ["circuit", 2, 1]
  ]);
  assert.deepEqual(values.map((exercise, index) => h.context.coachWorkoutExerciseNote("single", index, exercise)), [
    "Straight sets", "Superset 2A\nSlow eccentric", "Superset 2B", "Circuit 3 · Station 1", "Circuit 3 · Station 2"
  ]);
  assert.deepEqual(values.map((exercise) => exercise.code), ["CW01", "CW02", "CW03", "CW04", "CW05"]);
  assert.equal(h.context.coachWorkoutExerciseNote("superset", 3, { notes: "Legacy" }), "Superset 2B\nLegacy");
});

test("group-only changes invalidate the save signature even when all sets stay the same", () => {
  const h = fixture("single", [{ name: "Press", code: "CW01", groupId: "a", groupFormat: "single" }]);
  const data = { clientEmail: "client@example.com", entryDate: "2026-09-21", format: "single", exercises: plain(h.context.coachWorkoutExerciseValues()) };
  const original = h.context.coachWorkoutSaveSignature(data);
  for (const mutation of [
    { groupId: "b" }, { groupFormat: "circuit" }, { groupIndex: 3 }, { groupPosition: 1 }
  ]) {
    const changed = { ...data, exercises: [{ ...data.exercises[0], ...mutation }] };
    assert.notEqual(h.context.coachWorkoutSaveSignature(changed), original);
  }
  assert.equal(h.context.coachWorkoutSaveSignature(plain(data)), original);
});
