const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");
const { historyExerciseNames, launchSnapshot } = require("../js/client-planned-routines.js");

assert.deepEqual(historyExerciseNames([
  { exercise_code: "C2", exercise_name: "Row", exercise_order: 2 },
  { exercise_code: "WARMUP", exercise_name: "Bike", exercise_order: 0 },
  { exercise_code: "C1", exercise_name: "Bench", exercise_order: 1 },
  { exercise_code: "C1", exercise_name: "Bench Press", exercise_order: 1 },
  { exercise_code: "CARDIO", exercise_name: "Summary" },
  { exercise_code: "CARDIO", exercise_name: "Run", set_type: "timed", exercise_order: 3 },
], name => name === "Bench" ? "Bench Press" : name), ["Bench Press", "Row", "Run"]);
assert.throws(() => launchSnapshot({ id: "fixture", title: "Circuit", names: ["A", "B"], format: "circuit" }), /at least 3 exercises/);
assert.deepEqual(launchSnapshot({ id: "fixture", title: "Circuit", names: ["A", "B", "C", "D"], format: "circuit" })
  .exercises.map(exercise => [exercise.code, exercise.groupID]), [
  ["C1", "CIRCUIT"], ["C2", "CIRCUIT"], ["C3", "CIRCUIT"], ["C4", "CIRCUIT"],
]);

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [390, 1100]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("dialog", popup => popup.accept());
      await page.setContent("<main><button id=launch>Plan Your Routine</button></main>");
      await page.addScriptTag({ path: path.join(__dirname, "../js/client-planned-routines.js") });
      await page.evaluate(() => {
        let sequence = 0;
        const nextId = () => `63dae9de-5ca2-438a-98b2-${String(++sequence).padStart(12, "0")}`;
        if (!crypto.randomUUID) Object.defineProperty(crypto, "randomUUID", { value: nextId });
        const nativeID = "64DAE9DE-5CA2-438A-98B2-000000000000";
        const native = window.FWB_CLIENT_PLANNED_ROUTINES.launchSnapshot({
          id: nativeID, title: "From iPhone", names: ["Press", "Row"], format: "superset", createdAt: 817344000,
        });
        const rows = window.testRows = [
          { id: nativeID.toLowerCase(), user_id: "me", title: native.title, plan: native, plan_kind: "session", is_deleted: false, updated_at: "1" },
          { id: "someone-else", user_id: "other", title: native.title, plan: { ...native, id: "someone-else" }, plan_kind: "session", is_deleted: false, updated_at: "2" },
          { id: "weekly", user_id: "me", title: "Weekly", plan: { title: "Weekly" }, plan_kind: "program", is_deleted: false, updated_at: "2" },
        ];
        const supabase = { from(table) {
          if (table !== "client_saved_workout_plans") throw new Error(`unexpected table: ${table}`);
          const filters = [];
          let change, insert;
          const matching = () => rows.filter(row => filters.every(match => match(row)));
          const query = {
            select() { return query; },
            eq(key, value) { filters.push(row => row[key] === value); return query; },
            contains(key, values) { filters.push(row => Object.entries(values).every(([field, value]) => row[key]?.[field] === value)); return query; },
            order() { return query; },
            range(start, end) { return Promise.resolve({ data: matching().slice(start, end + 1) }); },
            insert(payload) { insert = payload; return query; },
            update(payload) { change = payload; return query; },
            async single() {
              const row = { ...insert, updated_at: String(++sequence) };
              rows.push(row);
              return { data: row };
            },
            async maybeSingle() {
              const target = matching()[0];
              if (!target) return { data: null };
              if (change) Object.assign(target, change, { updated_at: String(++sequence) });
              return { data: target };
            },
          };
          return query;
        } };
        window.testOptions = {
          userId: "me", supabase, returnFocus: document.getElementById("launch"), isCurrentAccount: () => true,
          library: [{ name: "Bench Press" }, { name: "Lat Pulldown" }],
          onStart: launch => { window.started = launch; return true; },
        };
        document.getElementById("launch").onclick = () => window.FWB_CLIENT_PLANNED_ROUTINES.open(window.testOptions);
      });
      await page.getByRole("button", { name: "Plan Your Routine" }).click();
      await page.getByRole("heading", { name: "From iPhone" }).waitFor();
      assert.equal(await page.getByRole("heading", { name: "From iPhone" }).count(), 1);
      assert.equal(await page.getByRole("heading", { name: "Weekly" }).count(), 0);

      await page.getByRole("button", { name: "New Routine" }).click();
      await page.getByLabel("Routine name").fill("From Web");
      await page.getByLabel("Add an exercise").fill("Lat Pulldown");
      await page.getByRole("button", { name: "Add exercise" }).click();
      await page.getByLabel("Add an exercise").fill("Bench Press");
      await page.getByLabel("Add an exercise").press("Enter");
      await page.getByRole("button", { name: "Move Bench Press up" }).click();
      await page.getByRole("button", { name: "Save Routine" }).click();
      await page.getByText("Saved to Plan Your Routine.").waitFor();
      const saved = await page.evaluate(() => testRows.find(row => row.title === "From Web"));
      assert.equal(saved.plan_kind, "session");
      assert.equal(saved.user_id, "me");
      assert.equal(saved.is_deleted, false);
      assert.equal(saved.plan.plannedRoutine, true);
      assert.equal(saved.plan.id, saved.id);
      assert.deepEqual(saved.plan, JSON.parse(saved.snapshot_json));
      assert.deepEqual(saved.plan.exercises.map(exercise => exercise.name), ["Bench Press", "Lat Pulldown"]);

      const nativeCard = page.locator("section.saved-plan-day").filter({ has: page.getByRole("heading", { name: "From iPhone" }) });
      await nativeCard.getByRole("button", { name: "Edit" }).click();
      await page.getByLabel("Routine name").fill("Obsolete edit");
      await page.evaluate(() => { testRows[0].updated_at = "new-native-revision"; });
      await page.getByRole("button", { name: "Save Routine" }).click();
      await page.getByText(/This routine changed on another device/).waitFor();
      assert.equal(await page.evaluate(() => testRows[0].title), "From iPhone");
      await page.getByRole("button", { name: "Cancel" }).click();
      await nativeCard.getByRole("button", { name: "Start Workout" }).click();
      assert.equal(await page.evaluate(() => started.formatRaw), "superset");

      await page.getByRole("button", { name: "Plan Your Routine" }).click();
      const webCard = page.locator("section.saved-plan-day").filter({ has: page.getByRole("heading", { name: "From Web" }) });
      await webCard.getByRole("button", { name: "Delete" }).click();
      await page.getByText("Routine deleted.").waitFor();
      assert.equal(await page.evaluate(() => testRows.find(row => row.title === "From Web").is_deleted), true);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log("Plan Your Routine desktop and mobile browser tests passed.");
  } finally { await browser.close(); }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
