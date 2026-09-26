const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const engine = require("../js/daily-workout-recommendation.js");
const WorkoutLayout = require("../js/workout-layout.js");
const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
const email = "client@example.com";
const ready = { mood: 4, energy: 4, sleep: 4, soreness: 2, note: "Ready today." };
const fullNote = "Mood: 4/5 · Energy: 4/5 · Sleep: 4/5 · Body: 4/5";
const promptFunctions = ["clientHomeCheckinPromptStorageKey", "todayClientMoodEntry", "clientHomeCheckinPromptSeen", "rememberClientHomeCheckinPromptSeen"];

function declaration(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `${name} exists`);
  const after = source.slice(match.index + match[0].length);
  const end = after.search(/\n(?:async\s+)?function\s+[\w$]+\s*\(/);
  return source.slice(match.index, end < 0 ? undefined : match.index + match[0].length + end);
}

function evaluate(names, values) {
  const context = vm.createContext(values);
  vm.runInContext(names.map(declaration).join("\n"), context);
  return context;
}

function program() {
  return { id: "11111111-1111-4111-8111-111111111111", client_email: email,
    workouts: [{ title: "Strength", format: "superset", exercises: [
      { code: "A1", name: "Squat", prescription: "8 reps x 3 sets", rest: "60 sec", instructions: ["Controlled tempo"], video: "https://example.com/squat" },
      { code: "A2", name: "Row", prescription: "3 × 10", rest: "90 sec", instructions: ["Keep steady"], video: "https://example.com/row" },
      { code: "B1", name: "Carry", prescription: "2 rounds of 30 sec", rest: "45 sec" }
    ] }] };
}

function fixture(options = {}) {
  const state = { day: "2026-09-25", storage: new Map(), calls: [], dialog: null, saveResult: { error: null }, ...options.state };
  const context = evaluate([...promptFunctions, "clientDailyWorkoutRecommendation", "saveClientMoodNote", "openClientDailyCheckin", "maybeShowClientHomeCheckinPrompt"], {
    console, Date, Map, Set,
    clientHomeCheckinPromptStoragePrefix: "fwb_daily_checkin_prompt_v2",
    clientDailyPromptMemory: new Set(), clientDailyCheckinReady: true, clientDailyCheckinSaving: false,
    activeDashboardUser: { id: "client-id", email }, activeClientEmail: email,
    activeClientDashboardTab: "home", isCoachDashboardPreview: false,
    clientPreviewProgramSelected: false, clientWorkoutLayoutSaving: false, workoutElapsedTimerState: null,
    currentProgram: program(), progressEntries: [], trainingLogs: [],
    todayDate: () => state.day,
    normalizeClientEmail: value => String(value || "").trim().toLowerCase(),
    isCoachPortalEmail: value => value === "coach@example.com",
    setText: (...args) => state.calls.push(["text", ...args]),
    setClientHomeCheckinExpanded: value => state.calls.push(["expand", value]),
    setClientDashboardTab: value => state.calls.push(["tab", value]),
    renderClientWorkoutTabs: workouts => state.calls.push(["render-program", workouts]),
    showClientWorkoutPicker: settings => state.calls.push(["picker", plain(settings)]),
    activateClientWorkoutPanel: (...args) => state.calls.push(["activate", ...args]),
    startWorkoutElapsedTimer: () => { throw new Error("Check-in preview must not start a workout timer"); },
    withTimeout: promise => promise,
    supabaseClient: { from(table) { assert.equal(table, "client_progress"); return {
      upsert(payload, config) { state.calls.push(["upsert", plain(payload), plain(config)]); return Promise.resolve(state.saveResult); }
    }; } },
    document: {
      querySelector: selector => selector === "dialog[open]" ? Boolean(state.anotherDialog) : null,
      getElementById: () => null
    },
    window: {
      FWB_DAILY_WORKOUT: { ...engine, recommend(value) { state.calls.push(["recommend", value]); return engine.recommend(value); } },
      FWB_DAILY_CHECKIN_DIALOG: {
        open(settings) { state.dialog = settings; state.calls.push(["open", settings.stage]); return options.opens !== false; },
        close(settings) { state.calls.push(["close", plain(settings)]); }
      },
      FWB_WEEKLY_ACTIVITY: { checkIn() { state.calls.push(["gym"]); return Promise.resolve("Checked in"); } },
      localStorage: {
        getItem(key) { if (options.blockedStorage) throw new Error("Storage blocked"); return state.storage.get(key) || null; },
        setItem(key, value) { if (options.blockedStorage) throw new Error("Storage blocked"); state.storage.set(key, value); }
      },
      requestAnimationFrame: callback => callback()
    },
    activeCustomWorkoutDraft: () => state.draft,
    clientCustomWorkoutPanelIndex: () => 0,
    dailyCustomWorkoutDraft: result => ({ workoutTitle: result.workout.title }),
    useGeneratedClientWorkout: (...args) => { state.calls.push(["use-generated", ...args]); return true; },
    openClientWorkoutGenerator: (...args) => { state.calls.push(["generator", ...args]); return true; }
  });
  context.renderProgress = entries => { context.progressEntries = entries; state.calls.push(["render-progress", plain(entries)]); };
  return { context, state };
}

test("daily prompt suppression is scoped to the local calendar day and signed-in account", () => {
  const { context, state } = fixture();
  assert.equal(context.clientHomeCheckinPromptSeen(), false);
  context.rememberClientHomeCheckinPromptSeen();
  assert.equal(context.clientHomeCheckinPromptSeen(), true);
  assert.equal(state.storage.get("fwb_daily_checkin_prompt_v2:client-id"), "2026-09-25");
  state.day = "2026-09-26";
  assert.equal(context.clientHomeCheckinPromptSeen(), false);
  state.day = "2026-09-25";
  context.activeDashboardUser = { id: "other-client-id", email: "other@example.com" };
  assert.equal(context.clientHomeCheckinPromptSeen(), false);
});

test("blocked browser storage still suppresses repeated prompts during the same visit", () => {
  const { context, state } = fixture({ blockedStorage: true });
  assert.equal(context.clientHomeCheckinPromptSeen(), false);
  context.rememberClientHomeCheckinPromptSeen();
  assert.equal(context.clientHomeCheckinPromptSeen(), true);
  state.day = "2026-09-26";
  assert.equal(context.clientHomeCheckinPromptSeen(), false);
});

test("an already saved daily check-in suppresses the popup but arbitrary progress notes do not", () => {
  const { context, state } = fixture();
  context.progressEntries = [{ entry_date: state.day, goal_note: "Measurements improved" }];
  assert.equal(context.clientHomeCheckinPromptSeen(), false);
  context.progressEntries = [{ entry_date: "2026-09-24", goal_note: fullNote }];
  assert.equal(context.clientHomeCheckinPromptSeen(), false);
  context.progressEntries = [{ client_email: "other@example.com", entry_date: state.day, goal_note: fullNote }];
  assert.equal(context.clientHomeCheckinPromptSeen(), false);
  context.progressEntries = [{ client_email: ` ${email.toUpperCase()} `, entry_date: state.day, goal_note: fullNote }];
  assert.equal(context.clientHomeCheckinPromptSeen(), true);
  context.progressEntries = [{ entry_date: state.day, goal_note: fullNote }];
  assert.equal(context.clientHomeCheckinPromptSeen(), true);
  context.progressEntries = [{ entry_date: state.day, goal_note: "Energy: 2/5", mood_checkin_submitted_at: "2026-09-25T17:00:00Z" }];
  assert.equal(context.clientHomeCheckinPromptSeen(), true);
});

test("first ready client visit opens welcome once without creating a workout or checking into the gym", () => {
  const { context, state } = fixture();
  context.maybeShowClientHomeCheckinPrompt();
  context.maybeShowClientHomeCheckinPrompt();
  assert.deepEqual(state.calls, [["open", "welcome"]]);
  assert.equal(state.dialog.initialCheckIn, null);
  assert.equal(state.dialog.recommendation, null);
});

test("dismissing yesterday's or another account's open dialog does not consume a new daily prompt", () => {
  for (const change of [
    ({ state }) => { state.day = "2026-09-26"; },
    ({ context }) => { context.activeDashboardUser = { id: "other-client", email: "other@example.com" }; }
  ]) {
    const setup = fixture();
    setup.context.openClientDailyCheckin("welcome");
    change(setup);
    setup.state.dialog.onDismiss?.();
    assert.equal(setup.context.clientHomeCheckinPromptSeen(), false);
  }
});

test("automatic prompt excludes coach, preview, active workout, another modal and unloaded data", () => {
  for (const values of [
    { activeDashboardUser: null }, { activeDashboardUser: { id: "coach", email: "coach@example.com" } },
    { isCoachDashboardPreview: true }, { clientDailyCheckinReady: false },
    { workoutElapsedTimerState: { startedAt: 1 } }, { activeClientDashboardTab: "workouts" }
  ]) {
    const { context, state } = fixture();
    Object.assign(context, values);
    context.maybeShowClientHomeCheckinPrompt();
    assert.equal(state.dialog, null, JSON.stringify(values));
  }
  const { context, state } = fixture({ state: { anotherDialog: true } });
  context.maybeShowClientHomeCheckinPrompt();
  assert.equal(state.dialog, null);
});

test("manual check-in guards unavailable data and active workouts with a visible message", () => {
  for (const values of [{ clientDailyCheckinReady: false }, { workoutElapsedTimerState: { startedAt: 1 } }]) {
    const { context, state } = fixture();
    Object.assign(context, values);
    assert.equal(context.openClientDailyCheckin(), false);
    assert.equal(state.dialog, null);
    assert.equal(state.calls[0][0], "text");
    assert.deepEqual(state.calls[1], ["expand", true]);
  }
});

test("manual revisit shows a saved recommendation, while a partial check-in asks for all ratings", () => {
  const { context, state } = fixture();
  context.progressEntries = [{ entry_date: state.day, goal_note: fullNote }];
  context.openClientDailyCheckin("recommendation");
  assert.equal(state.dialog.stage, "recommendation");
  assert.equal(state.dialog.recommendation.level, "planned");
  context.progressEntries = [{ entry_date: state.day, goal_note: "Mood: 4/5", mood_checkin_submitted_at: "2026-09-25T17:00:00Z" }];
  context.openClientDailyCheckin("recommendation");
  assert.equal(state.dialog.stage, "checkin");
  assert.equal(state.dialog.recommendation, null);
});

test("check-in saves only mood fields and preserves existing measurement data in local state", async () => {
  const { context, state } = fixture();
  context.progressEntries = [{ entry_date: state.day, bodyweight: 170, measurements: { waist: 30 }, goal_note: "Old note" }];
  const result = await context.saveClientMoodNote(fullNote);
  const [, payload, config] = state.calls.find(([name]) => name === "upsert");
  assert.deepEqual(Object.keys(payload).sort(), ["client_email", "entry_date", "goal_note", "mood_checkin_submitted_at"]);
  assert.deepEqual(config, { onConflict: "client_email,entry_date" });
  assert.equal(result.goal_note, fullNote);
  assert.equal(context.progressEntries[0].bodyweight, 170);
  assert.deepEqual(context.progressEntries[0].measurements, { waist: 30 });
  assert.equal(context.clientDailyCheckinSaving, false);
});

test("a saved response is required before showing a recommendation and failures are retryable", async () => {
  const { context, state } = fixture();
  let finish;
  state.saveResult = new Promise(resolve => { finish = resolve; });
  context.openClientDailyCheckin();
  const pending = state.dialog.onSave(ready);
  assert.equal(context.clientDailyCheckinSaving, true);
  assert.equal(state.calls.some(([name]) => name === "recommend"), false);
  await assert.rejects(() => state.dialog.onSave(ready), /already saving/);
  finish({ error: new Error("Connection failed") });
  await assert.rejects(() => pending, /Connection failed/);
  assert.equal(context.clientDailyCheckinSaving, false);
  assert.equal(context.progressEntries.length, 0);
  assert.equal(state.calls.some(([name]) => name === "recommend"), false);
  state.saveResult = { error: null };
  const result = await state.dialog.onSave(ready);
  assert.equal(result.level, "planned");
  assert.equal(state.calls.filter(([name]) => name === "recommend").length, 1);
});

test("account changes during a save never put the old client's record or recommendation into the new account", async () => {
  const { context, state } = fixture();
  let finish;
  state.saveResult = new Promise(resolve => { finish = resolve; });
  context.openClientDailyCheckin();
  const pending = state.dialog.onSave(ready);
  context.activeDashboardUser = { id: "another-client", email: "another@example.com" };
  context.activeClientEmail = "another@example.com";
  finish({ error: null });
  await assert.rejects(() => pending, /account changed/);
  assert.equal(context.progressEntries.length, 0);
  assert.equal(state.calls.some(([name]) => name === "recommend"), false);
});

test("midnight during a save retains yesterday's saved record and requires a fresh recommendation", async () => {
  const { context, state } = fixture();
  let finish;
  state.saveResult = new Promise(resolve => { finish = resolve; });
  context.openClientDailyCheckin();
  const pending = state.dialog.onSave(ready);
  state.day = "2026-09-26";
  finish({ error: null });
  await assert.rejects(() => pending, /saved for yesterday/);
  assert.equal(context.progressEntries[0].entry_date, "2026-09-25");
  assert.equal(context.clientHomeCheckinPromptSeen(), false);
  assert.equal(state.calls.some(([name]) => name === "recommend"), false);
});

test("all workout and gym callbacks reject stale account, date, program or active-session context", async () => {
  for (const change of [
    ({ context }) => { context.activeClientEmail = "other@example.com"; },
    ({ context }) => { context.activeDashboardUser = { id: "other", email }; },
    ({ context }) => { context.currentProgram = program(); },
    ({ context }) => { context.currentProgram.workouts = [...context.currentProgram.workouts]; },
    ({ context }) => { context.clientWorkoutLayoutSaving = true; },
    ({ state }) => { state.day = "2026-09-26"; },
    ({ context }) => { context.workoutElapsedTimerState = { startedAt: 1 }; }
  ]) {
    const setup = fixture();
    setup.context.openClientDailyCheckin();
    change(setup);
    const { onUse, onKeepOriginal, onGenerate, onGym, onSave } = setup.state.dialog;
    const before = setup.state.calls.length;
    assert.throws(() => onUse({ workoutIndex: 0 }), /changed|current workout/);
    assert.throws(() => onKeepOriginal(), /changed|current workout/);
    assert.throws(() => onGenerate({}), /changed|current workout/);
    await assert.rejects(() => onGym(), /changed|current workout/);
    await assert.rejects(() => onSave(ready), /changed|current workout/);
    assert.equal(setup.state.calls.length, before);
  }
});

test("keep original opens the full assigned program overview without choosing or starting a session", () => {
  const { context, state } = fixture();
  context.openClientDailyCheckin();
  state.calls.length = 0;
  assert.equal(state.dialog.onKeepOriginal(), true);
  assert.equal(context.clientPreviewProgramSelected, true);
  assert.equal(state.calls[0][0], "render-program");
  assert.equal(state.calls[0][1], context.currentProgram.workouts);
  assert.deepEqual(state.calls.slice(1), [["tab", "workouts"], ["picker", { scroll: true }]]);
});

test("assigned recommendation opens its workout preview without starting a timer", () => {
  const { context, state } = fixture();
  context.openClientDailyCheckin();
  state.calls.length = 0;
  assert.equal(state.dialog.onUse({ workoutIndex: 0 }), true);
  assert.deepEqual(plain(state.calls), [["tab", "workouts"], ["activate", 1, { scroll: false, focus: false }]]);
});

test("gym attendance requires its explicit action and recovery generator receives the recommendation preferences", async () => {
  const { context, state } = fixture();
  context.openClientDailyCheckin();
  await state.dialog.onSave(ready);
  assert.equal(state.calls.some(([name]) => name === "gym"), false);
  assert.equal(await state.dialog.onGym(), "Checked in");
  const preferences = { focus: "recovery_full", minutes: 20, intensity: "easy" };
  state.calls.length = 0;
  assert.equal(state.dialog.onGenerate({ generatorPreferences: preferences }), true);
  assert.deepEqual(state.calls, [["close", { restoreFocus: false, dismiss: false }], ["generator", null, preferences]]);
});

test("shorter custom drafts retain reduced targets, groups, cues and demos with blank performance entries", () => {
  const context = evaluate(["groupKeyForExercise", "groupedExercises", "inferWorkoutFormat", "normalizeCustomWorkoutFormat", "setCountFromPrescription", "customExerciseCode", "dailyCustomWorkoutDraft"], {
    Map, WorkoutLayout, customWorkoutDraftVersion: 2,
    customWorkoutFormats: { single: {}, superset: {}, circuit: {} }, warmUpSetType: "warm_up", workingSetType: "working"
  });
  const assigned = program();
  const recommendation = engine.recommend({ program: assigned, history: [], checkIn: { ...ready, mood: 2 }, date: "2026-09-25", clientEmail: email });
  const before = plain(assigned);
  const draft = plain(context.dailyCustomWorkoutDraft(recommendation));
  assert.equal(draft.workoutTitle, recommendation.workout.title);
  assert.equal(draft.generatedFrom.daily, true);
  assert.equal(draft.date, "2026-09-25");
  assert.deepEqual(draft.exercises.map(exercise => exercise.group), [0, 0, 1]);
  assert.deepEqual(draft.exercises.map(exercise => exercise.groupType), ["superset", "superset", "superset"]);
  assert.deepEqual(draft.exercises.map(exercise => exercise.sets.length), [3, 3, 2]);
  draft.exercises.forEach((exercise, index) => {
    assert.equal(exercise.prescription, recommendation.workout.exercises[index].prescription);
    assert.equal(exercise.rest, assigned.workouts[0].exercises[index].rest);
    assert.deepEqual(exercise.instructions, assigned.workouts[0].exercises[index].instructions);
    assert.equal(exercise.video, assigned.workouts[0].exercises[index].video);
    assert.equal(exercise.notes, "");
    assert.equal(exercise.skipped, false);
    exercise.sets.forEach(set => assert.deepEqual([set.weight, set.reps, set.rir, set.complete], ["", "", "", false]));
  });
  assert.deepEqual(assigned, before);
  assigned.workouts[0].format = "circuit";
  const circuit = engine.recommend({ program: assigned, history: [], checkIn: { ...ready, mood: 2 }, date: "2026-09-25", clientEmail: email });
  assert.deepEqual(plain(context.dailyCustomWorkoutDraft(circuit)).exercises.map(exercise => exercise.group), [0, 0, 0]);
});
