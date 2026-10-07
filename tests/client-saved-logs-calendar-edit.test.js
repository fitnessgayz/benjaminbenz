const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const portal = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");

function sourceForFunction(name) {
  const asyncStart = portal.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : portal.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const followingSync = portal.indexOf("\nfunction ", start + 1);
  const followingAsync = portal.indexOf("\nasync function ", start + 1);
  const end = [followingSync, followingAsync].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  return portal.slice(start, end);
}

test("calendar fills only dates with saved workouts and marks the selected date", () => {
  const nodes = Object.fromEntries([
    "client-saved-log-days", "client-saved-log-month-label", "client-saved-log-selected-date",
    "client-saved-log-selected-count"
  ].map((id) => [id, { innerHTML: "", textContent: "" }]));
  const render = Function("document", "nodes", "clientLogCalendarMonth", "clientTrainingLogDateFilter", "trainingLogs",
    "clientWorkoutHistorySessionKey", "escapeHtml", "todayDate",
    `${sourceForFunction("renderClientWorkoutCalendar")}; renderClientWorkoutCalendar(); return nodes;`)(
    { getElementById: (id) => nodes[id] }, nodes, "2026-10", "2026-10-06",
    [{ entry_date: "2026-10-06", session_id: "one" }, { entry_date: "2026-10-06", session_id: "one" },
      { entry_date: "2026-10-05", session_id: "two" }],
    (log) => log.session_id, (value) => value, () => "2026-10-07"
  );
  assert.equal(render["client-saved-log-month-label"].textContent, "October 2026");
  assert.equal((render["client-saved-log-days"].innerHTML.match(/data-has-log="true"/g) || []).length, 2);
  assert.match(render["client-saved-log-days"].innerHTML, /data-client-log-date="2026-10-06"[^>]*aria-pressed="true"/);
  assert.equal(render["client-saved-log-selected-count"].textContent, "1 LOG");
});

test("correction rejects empty or invalid set values", () => {
  const parse = Function(`${sourceForFunction("clientSavedSetCorrectionValues")}; return clientSavedSetCorrectionValues;`)();
  const form = (weight, reps, notes = "") => ({ elements: {
    weight: { value: weight }, reps: { value: reps }, notes: { value: notes }
  } });
  assert.deepEqual(parse(form("135.5", "8", "  Fixed typo  ")), {
    weight_used: 135.5, reps: 8, notes: "Fixed typo"
  });
  assert.throws(() => parse(form("", "")), /not empty/);
  assert.throws(() => parse(form("100", "2.5")), /whole reps/);
  assert.throws(() => parse(form("-1", "8")), /weight/);
});

test("unfinished live workouts stay in the active logger; completed and imported sets are editable", () => {
  const canEdit = Function("clientWorkoutHistorySessionKey", "trainingLogs",
    `${sourceForFunction("clientSavedSetCanEdit")}; return clientSavedSetCanEdit;`)(
      (row) => row.session_id || `${row.entry_date}:${row.workout_title}`, []
    );
  const row = { id: "set-one", session_id: "session-one", source: "ios_app" };
  assert.equal(canEdit(row, [row]), false);
  assert.equal(canEdit(row, [{ ...row, completed_at: "2026-10-07T17:00:00Z" }]), true);
  assert.equal(canEdit({ ...row, source: "fitbod" }, [row]), true);
  assert.equal(canEdit({ ...row, source: "client_log_correction" }, [row]), true);
});

test("correction timestamps advance past a future saved version", () => {
  const timestamp = Function(`${sourceForFunction("clientSavedSetCorrectionTimestamp")}; return clientSavedSetCorrectionTimestamp;`)();
  assert.equal(timestamp({ updated_at: "2026-10-07T17:00:00.000Z" }, Date.parse("2026-10-07T16:00:00.000Z")),
    "2026-10-07T17:00:01.000Z");
  assert.equal(timestamp({ updated_at: "2026-10-07T15:00:00.000Z" }, Date.parse("2026-10-07T16:00:00.000Z")),
    "2026-10-07T16:00:00.000Z");
});

test("saved set correction updates only the matching owned row and detects stale values", async () => {
  const calls = [];
  const makeQuery = (result) => {
    const query = {
      update(values) { calls.push(["update", values]); return this; },
      eq(name, value) { calls.push(["eq", name, value]); return this; },
      ilike(name, value) { calls.push(["ilike", name, value]); return this; },
      is(name, value) { calls.push(["is", name, value]); return this; },
      select(value) { calls.push(["select", value]); return Promise.resolve(result); }
    };
    return { from(name) { calls.push(["from", name]); return query; } };
  };
  const row = { id: "set-one", client_email: "client@example.com", weight_used: 125,
    reps: null, source: "ios_app", updated_at: "2026-10-07T17:00:00Z" };
  const save = (result) => Function("supabaseClient", "isCoachDashboardPreview", "activeDashboardUser",
    "activeClientEmail", "normalizeClientEmail", "withTimeout", "clientSavedSetCanEdit", "trainingLogs",
    "clientSavedSetCorrectionTimestamp",
    `${sourceForFunction("saveClientSavedSetCorrection")}; return saveClientSavedSetCorrection;`)(
      makeQuery(result), false, { email: "client@example.com" }, "client@example.com",
      (value) => String(value || "").toLowerCase(), (promise) => promise, () => true, [row],
      () => "2026-10-07T17:00:01.000Z"
    );
  assert.deepEqual(await save({ data: [{ ...row, weight_used: 135, reps: 8 }], error: null })(row,
    { weight_used: 135, reps: 8, notes: "" }), { ...row, weight_used: 135, reps: 8 });
  assert.ok(calls.some((call) => call[0] === "eq" && call[1] === "id" && call[2] === "set-one"));
  assert.ok(calls.some((call) => call[0] === "eq" && call[1] === "weight_used" && call[2] === 125));
  assert.ok(calls.some((call) => call[0] === "is" && call[1] === "reps" && call[2] === null));
  assert.ok(calls.some((call) => call[0] === "is" && call[1] === "notes" && call[2] === null));
  assert.ok(calls.some((call) => call[0] === "eq" && call[1] === "source" && call[2] === "ios_app"));
  assert.ok(calls.some((call) => call[0] === "eq" && call[1] === "updated_at" && call[2] === row.updated_at));
  assert.ok(calls.some((call) => call[0] === "update" && call[1].source === "client_log_correction" &&
    Number.isFinite(Date.parse(call[1].updated_at))));
  await assert.rejects(save({ data: [], error: null })(row, { weight_used: 135, reps: 8, notes: "" }), /changed on another device/);
  const beforeOtherClient = calls.length;
  await assert.rejects(save({ data: [{ ...row }], error: null })(
    { ...row, client_email: "other@example.com" }, { weight_used: 135, reps: 8, notes: "" }
  ), /Sign in to correct/);
  assert.equal(calls.length, beforeOtherClient);
});

test("a corrected set updates matching open workout fields without discarding newer input", () => {
  const weight = { value: "125" };
  const reps = { value: "8" };
  const notes = { value: "Old note" };
  const setRow = { dataset: { setNumber: "1" }, querySelector: (selector) => ({
    "[data-set-weight]": weight, "[data-set-reps]": reps
  })[selector] };
  const logElement = {
    dataset: { exerciseCode: "A1", workoutTitle: "Upper" },
    querySelector: (selector) => ({ "[data-log-date]": { value: "2026-10-06" }, "[data-log-notes]": notes })[selector],
    querySelectorAll: () => [setRow]
  };
  const sync = Function("document", "setTypeForRow", "normalizedSetType",
    `${sourceForFunction("syncCorrectedSetInWorkoutEditor")}; return syncCorrectedSetInWorkoutEditor;`)(
      { querySelectorAll: () => [logElement] }, () => "working", () => "working"
    );
  const previous = { exercise_code: "A1", workout_title: "Upper", entry_date: "2026-10-06",
    set_number: 1, set_type: "working", weight_used: 125, reps: 8, notes: "Old note" };
  sync(previous, { weight_used: 135, reps: null, notes: "Corrected" });
  assert.equal(weight.value, 135);
  assert.equal(reps.value, "");
  assert.equal(notes.value, "Corrected");

  weight.value = "140"; // An unsaved change typed after loading the log.
  sync({ ...previous, weight_used: 135, reps: null, notes: "Corrected" },
    { weight_used: 130, reps: 6, notes: "Next" });
  assert.equal(weight.value, "140");
});

test("background autosave excludes corrected rows from future upserts", () => {
  const corrected = { client_email: "client@example.com", entry_date: "2026-10-06", workout_title: "Upper",
    exercise_code: "A1", set_number: 1, source: "client_log_correction" };
  const wasCorrected = Function("trainingLogs", "normalizeClientEmail",
    `${sourceForFunction("isPreviouslyCorrectedWorkoutSet")}; return isPreviouslyCorrectedWorkoutSet;`)(
      [corrected], (value) => String(value || "").toLowerCase()
    );
  assert.equal(wasCorrected({ ...corrected, source: "website" }), true);
  assert.equal(wasCorrected({ ...corrected, set_number: 2 }), false);
  assert.equal(wasCorrected({ ...corrected, client_email: "other@example.com" }), false);
  assert.match(portal, /autosave: true,[\s\S]*?savingMessage: "Autosaving/);
  assert.match(portal, /\.filter\(\(row\) => !options\.autosave \|\| !isPreviouslyCorrectedWorkoutSet\(row\)\)/);
});
