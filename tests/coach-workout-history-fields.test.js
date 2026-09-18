const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const source = fs.readFileSync(path.join(__dirname, "../js/coach-workout-log.js"), "utf8");
function sourceForFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Expected ${name} to exist`);
  const tail = source.slice(start);
  const end = tail.search(/\n(?:async )?function /);
  return end < 0 ? tail : tail.slice(0, end);
}

function fixture() {
  function row(setType, number) {
    const fields = Object.fromEntries(["weight", "reps", "rir"].map((field) => [field, { value: "", placeholder: "0" }]));
    return {
      dataset: { coachWorkoutSetType: setType, coachWorkoutSetNumber: String(number) }, fields,
      querySelector(selector) { return fields[selector.match(/data-coach-workout-(\w+)/)?.[1]] || null; }
    };
  }
  const rows = [row("warm_up", 1001), row("working", 1), row("working", 2)];
  const name = { value: "  BENCH   press " };
  const exercise = {
    querySelector: (selector) => selector === "[data-coach-workout-name]" ? name : null,
    querySelectorAll: () => rows
  };
  const visibleInputs = rows.flatMap((row, index) => ["weight", "reps"].map((field) => ({
    value: "", placeholder: "0",
    dataset: {
      coachGroupedField: field, coachGroupedExerciseIndex: "0",
      coachGroupedSetType: row.dataset.coachWorkoutSetType,
      coachGroupedSetIndex: String(index === 0 ? 0 : index - 1)
    }
  })));
  const card = {
    dataset: { coachWorkoutFormat: "single", coachWorkoutGroupIndexes: "0" },
    querySelector: () => null,
    querySelectorAll: () => visibleInputs
  };
  const functions = [
    "escapeCoachWorkoutHtml", "coachWorkoutSetType", "coachWorkoutSetRowsByType",
    "normalizeCoachWorkoutHistoryName", "updateCoachWorkoutHistoryPlaceholders",
    "coachWorkoutGroupedFieldMarkup", "coachWorkoutGroupedSetRowMarkup", "coachWorkoutGroupedCardMarkup",
    "coachWorkoutGroupedExerciseIndexes", "coachWorkoutCanonicalGroupedRow",
    "refreshCoachWorkoutPreviousHistoryCards"
  ];
  const dependencies = {
    coachWorkoutWarmUpSetType: "warm_up", coachWorkoutWorkingSetType: "working", coachWorkoutWarmUpSetNumberBase: 1000,
    coachWorkoutExerciseElements: () => [exercise],
    document: { querySelectorAll: () => [card] },
    normalizeCoachWorkoutGroupedRows: () => 2,
    coachWorkoutGroupedNameEditorMarkup: () => "", coachWorkoutGroupedHistoryMarkup: () => "",
    coachWorkoutGroupedExerciseCode: () => "A1"
  };
  const api = Function(...Object.keys(dependencies), `
    let coachWorkoutPreviousHistory = new Map();
    let coachWorkoutPreviousHistoryStatus = 'idle';
    ${functions.map(sourceForFunction).join("\n")}
    function coachWorkoutGroupedSectionsMarkup(group) {
      return group[0].exercise.querySelectorAll().map((row, index) =>
        coachWorkoutGroupedSetRowMarkup(row, 'A1', 0, row.dataset.coachWorkoutSetType, index, 'Bench press')
      ).join('');
    }
    return {
      updateCoachWorkoutHistoryPlaceholders, refreshCoachWorkoutPreviousHistoryCards,
      coachWorkoutGroupedCardMarkup,
      setHistory(rows, status = 'ready') {
        coachWorkoutPreviousHistory = new Map([['bench press', { rows }]]);
        coachWorkoutPreviousHistoryStatus = status;
      }
    };
  `)(...Object.values(dependencies));
  const history = [
    { set_type: "warm_up", set_number: 1001, weight_used: 0, reps: 0 },
    { set_type: "working", set_number: 1, weight_used: 135, reps: 8 },
    { set_type: "working", set_number: 2, weight_used: 145, reps: 6 }
  ];
  return { ...api, rows, row, name, exercise, visibleInputs, history };
}

for (const format of ["single", "superset", "circuit"]) {
  test(`coach ${format}: renders history in editable weight and reps fields without entering values`, () => {
    const f = fixture();
    f.setHistory(f.history);
    const html = f.coachWorkoutGroupedCardMarkup(format, [{ exercise: f.exercise, exerciseIndex: 0 }], 0);
    assert.match(html, /value=""\s+placeholder="135"\s+data-coach-grouped-field="weight"/);
    assert.match(html, /value=""\s+placeholder="8"\s+data-coach-grouped-field="reps"/);
    assert.match(html, /placeholder="145"\s+data-coach-grouped-field="weight"/);
    assert.equal(f.rows[0].fields.weight.placeholder, "0");
    assert.equal(f.rows[0].fields.reps.placeholder, "0");
    assert.equal(f.rows[1].fields.weight.value, "");
    assert.equal(f.rows[1].fields.rir.value, "");
    f.rows.push(f.row("working", 3));
    f.updateCoachWorkoutHistoryPlaceholders(f.exercise);
    assert.equal(f.rows[3].fields.weight.placeholder, "145");
    assert.equal(f.rows[3].fields.reps.placeholder, "6");
  });
}

test("coach history arriving after render updates visible fields without changing entered values", () => {
  const f = fixture();
  f.visibleInputs[2].value = "140";
  f.rows[1].fields.weight.value = "140";
  f.rows[1].fields.rir.value = "2";
  f.refreshCoachWorkoutPreviousHistoryCards();
  assert.equal(f.visibleInputs[2].placeholder, "0");
  f.setHistory(f.history);
  f.refreshCoachWorkoutPreviousHistoryCards();
  assert.equal(f.visibleInputs[2].placeholder, "135");
  assert.equal(f.visibleInputs[3].placeholder, "8");
  assert.equal(f.visibleInputs[4].placeholder, "145");
  assert.equal(f.visibleInputs[2].value, "140");
  assert.equal(f.rows[1].fields.weight.value, "140");
  assert.equal(f.rows[1].fields.rir.value, "2");
  f.name.value = "Squat";
  f.refreshCoachWorkoutPreviousHistoryCards();
  assert.equal(f.visibleInputs[2].placeholder, "0");
  assert.equal(f.visibleInputs[3].placeholder, "0");
});

test("coach hints clear while switching clients or dates and when history cannot load", () => {
  const f = fixture();
  for (const status of ["loading", "idle", "error"]) {
    f.setHistory(f.history);
    f.refreshCoachWorkoutPreviousHistoryCards();
    assert.equal(f.visibleInputs[2].placeholder, "135");
    f.setHistory(f.history, status);
    f.refreshCoachWorkoutPreviousHistoryCards();
    assert.equal(f.visibleInputs[2].placeholder, "0");
    assert.equal(f.visibleInputs[3].placeholder, "0");
  }
});

test("coach warm-ups never borrow working-set history", () => {
  const f = fixture();
  f.setHistory(f.history.filter((row) => row.set_type === "working"));
  f.refreshCoachWorkoutPreviousHistoryCards();
  assert.equal(f.visibleInputs[0].placeholder, "0");
  assert.equal(f.visibleInputs[1].placeholder, "0");
  assert.equal(f.visibleInputs[2].placeholder, "135");
});
