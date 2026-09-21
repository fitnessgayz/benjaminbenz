const test = require("node:test");
const assert = require("node:assert/strict");
const {
  api, parseDuration, formatDuration, validDate, localTime, validateMetrics,
  validateFile, extractionUpdates, persistRecord, workoutLabel, bounded
} = require("../js/apple-workout.js");

const fields = (values = {}) => ({ workout_date: "2026-09-21", ...values });
const metrics = (values = {}) => validateMetrics(fields(values));
const photo = { name: "Apple Workout.png", type: "image/png", size: 2048 };
const baseRecord = (values = {}) => ({
  id: "record-1", owner_user_id: "user-1", client_email: "client@example.com", history_key: "session:one",
  storage_path: "user-1/old.png", original_filename: "original.png", mime_type: "image/png", file_size_bytes: 500,
  updated_at: "2026-09-21T12:00:00Z", ...metrics(), ...values
});

function database({ reads = [null], writeError, writeEmpty = false, uploadError, loadPages = [] } = {}) {
  const calls = { uploads: [], removes: [], writes: [], filters: [] };
  const client = {
    from() {
      let method = "read";
      let payload;
      let options;
      const filters = [];
      const query = {
        select() { return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        order() { return query; },
        range() { return loadPages.shift() || Promise.resolve({ data: [], error: null }); },
        update(value) { method = "update"; payload = value; return query; },
        upsert(value, opts) { method = "upsert"; payload = value; options = opts; return query; },
        async maybeSingle() {
          if (method === "read") {
            const result = reads.shift();
            if (result instanceof Error) throw result;
            return { data: typeof result === "function" ? result(calls) : result || null, error: null };
          }
          calls.writes.push({ method, payload, options, filters });
          return { data: writeError || writeEmpty ? null : baseRecord(payload), error: writeError || null };
        }
      };
      return query;
    },
    storage: {
      from() { return {
        async upload(path, file, options) { calls.uploads.push({ path, file, options }); return { data: { path }, error: uploadError || null }; },
        async remove(paths) { calls.removes.push(...paths); return { data: paths, error: null }; }
      }; }
    }
  };
  return { client, calls };
}

const saveOptions = (h, extra = {}) => ({
  client: h.client, userId: "user-1", clientEmail: "client@example.com", historyKey: "session:one", metrics: metrics(), file: photo, ...extra
});

test("duration parsing distinguishes minutes from explicit hours and rejects ambiguous clocks", () => {
  assert.equal(parseDuration("45"), 2700);
  assert.equal(parseDuration("45.5"), 2730);
  assert.equal(parseDuration("1:02:03"), 3723);
  assert.equal(parseDuration("0"), 0);
  assert.equal(parseDuration(" "), null);
  for (const value of ["45:30", "1:65:00", "-10", "Infinity", "text", "999:00:00"]) assert.throws(() => parseDuration(value));
});

test("missing durations remain missing while zero values remain visible", () => {
  assert.equal(formatDuration(null), "—");
  assert.equal(formatDuration(undefined), "—");
  assert.equal(formatDuration(""), "—");
  assert.equal(formatDuration(0), "0:00:00");
  assert.equal(formatDuration(3661), "1:01:01");
});

test("metrics keep nulls, decimal energy and heart rate, and zero calories", () => {
  const value = metrics({ active_calories: "0", total_calories: "100.5", average_heart_rate: "121.5" });
  assert.equal(value.duration_seconds, null);
  assert.equal(value.elapsed_seconds, null);
  assert.equal(value.active_calories, 0);
  assert.equal(value.total_calories, 100.5);
  assert.equal(value.average_heart_rate, 121.5);
  assert.equal(value.activity_type, null);
  assert.equal(value.started_at_local, null);
});

test("validation catches impossible dates, metric ranges, and reversed totals", () => {
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2024-02-29"), true);
  for (const invalid of [
    { workout_date: "2026-02-29" }, { average_heart_rate: "19" }, { average_heart_rate: "301" },
    { active_calories: "-1" }, { total_calories: "100001" }, { active_calories: "200", total_calories: "100" },
    { duration_seconds: "60", elapsed_seconds: "30" }, { started_at_local: "25:00" }
  ]) assert.throws(() => metrics(invalid));
  assert.equal(localTime("09:05", "Start"), "09:05:00");
  assert.equal(localTime("2026-09-21T09:05:03", "Start"), "09:05:03");
  assert.equal(localTime("", "Start"), null);
});

test("file validation permits supported screenshots and rejects empty, oversized, or other uploads", () => {
  assert.equal(validateFile(photo), "png");
  assert.equal(validateFile({ ...photo, type: "image/jpeg" }), "jpg");
  assert.equal(validateFile({ ...photo, type: "image/webp" }), "webp");
  for (const invalid of [null, { ...photo, size: 0 }, { ...photo, size: 8 * 1024 * 1024 }, { ...photo, type: "image/heic" }, { ...photo, type: "text/html" }]) assert.throws(() => validateFile(invalid));
});

test("OCR merges preserve manual edits and normalize missing values without turning them into zero", () => {
  const changes = extractionUpdates({ duration_seconds: 2700, active_calories: 0, average_heart_rate: null, workout_date: "2026-09-21", started_at_local: "08:15" }, new Set(["duration_seconds", "workout_date"]));
  assert.equal(Object.hasOwn(changes, "duration_seconds"), false);
  assert.equal(Object.hasOwn(changes, "workout_date"), false);
  assert.equal(changes.active_calories, "0");
  assert.equal(changes.average_heart_rate, "");
  assert.equal(changes.started_at_local, "08:15:00");
});

test("duplicate saved session labels include time and stable session ordinal", () => {
  const list = [
    { history_key: "session:a", workout_title: "Custom workout", entry_date: "2026-09-21", completed_at: "2026-09-21T10:00:00Z" },
    { history_key: "session:b", workout_title: "Custom workout", entry_date: "2026-09-21" }
  ];
  assert.match(workoutLabel(list[0], list), /Session 1/);
  assert.match(workoutLabel(list[1], list), /Session 2/);
  assert.notEqual(workoutLabel(list[0], list), workoutLabel(list[1], list));
});

test("new saves use unique private paths and ignoreDuplicates to prevent replacing an existing link", async () => {
  const h = database();
  const saved = await persistRecord(saveOptions(h));
  assert.match(saved.storage_path, /^user-1\/[0-9a-f-]+\.png$/);
  assert.equal(h.calls.uploads[0].options.upsert, false);
  assert.deepEqual(h.calls.writes[0].options, { onConflict: "client_email,history_key", ignoreDuplicates: true });
  assert.equal(h.calls.writes[0].payload.owner_user_id, "user-1");
  assert.equal(h.calls.writes[0].payload.duration_seconds, null);
  assert.equal(h.calls.removes.length, 0);
});

test("first save requires a screenshot and preflight conflicts do not upload or overwrite", async () => {
  const h = database({ reads: [baseRecord()] });
  await assert.rejects(persistRecord(saveOptions(h, { file: null })), /screenshot/);
  await assert.rejects(persistRecord(saveOptions(h)), /changed elsewhere/);
  assert.equal(h.calls.uploads.length, 0);
  assert.equal(h.calls.writes.length, 0);
});

test("editing without a replacement preserves the saved image and uses optimistic update", async () => {
  const existing = baseRecord();
  const h = database({ reads: [existing] });
  const saved = await persistRecord(saveOptions(h, { existing, file: null, metrics: metrics({ active_calories: "42.5" }) }));
  assert.equal(saved.storage_path, existing.storage_path);
  assert.equal(saved.original_filename, existing.original_filename);
  assert.equal(h.calls.uploads.length, 0);
  assert.equal(h.calls.writes[0].method, "update");
  assert.deepEqual(h.calls.writes[0].filters, [["id", existing.id], ["updated_at", existing.updated_at]]);
});

test("successful image replacement removes only the old image after the database write", async () => {
  const existing = baseRecord();
  const h = database({ reads: [existing] });
  const saved = await persistRecord(saveOptions(h, { existing }));
  assert.notEqual(saved.storage_path, existing.storage_path);
  assert.deepEqual(h.calls.removes, [existing.storage_path]);
});

test("failed upload leaves the existing record and image alone", async () => {
  const existing = baseRecord();
  const h = database({ reads: [existing], uploadError: new Error("offline") });
  await assert.rejects(persistRecord(saveOptions(h, { existing })), /could not be uploaded/);
  assert.equal(h.calls.writes.length, 0);
  assert.equal(h.calls.removes.length, 0);
});

test("definite database failures clean a new upload but preserve the previous file", async () => {
  const existing = baseRecord();
  const h = database({ reads: [existing, existing], writeError: new Error("validation failed") });
  await assert.rejects(persistRecord(saveOptions(h, { existing })), /validation failed/);
  assert.deepEqual(h.calls.removes, [h.calls.uploads[0].path]);
  assert.equal(h.calls.removes.includes(existing.storage_path), false);
});

test("an empty conflict upsert result is not treated as success", async () => {
  const h = database({ reads: [null, baseRecord()], writeEmpty: true });
  await assert.rejects(persistRecord(saveOptions(h)), /already has Apple details/);
  assert.deepEqual(h.calls.removes, [h.calls.uploads[0].path]);
});

test("lost response after a committed write reconciles without deleting its screenshot", async () => {
  const h = database({ reads: [null, (calls) => baseRecord(calls.writes[0].payload)], writeError: new Error("network timeout") });
  const saved = await persistRecord(saveOptions(h));
  assert.equal(saved.storage_path, h.calls.uploads[0].path);
  assert.equal(h.calls.removes.length, 0);
});

test("uncertain write and failed readback retain the pending image for safe retry", async () => {
  const h = database({ reads: [null, new Error("still offline")], writeError: new Error("timeout") });
  let pending;
  await assert.rejects(persistRecord(saveOptions(h)), (error) => {
    assert.match(error.message, /couldn’t confirm/);
    pending = error.pendingUpload;
    return true;
  });
  assert.equal(pending.path, h.calls.uploads[0].path);
  assert.equal(h.calls.removes.length, 0);
  const retry = database({ reads: [baseRecord({ ...metrics(), storage_path: pending.path })] });
  const saved = await persistRecord(saveOptions(retry, { pendingUpload: pending }));
  assert.equal(saved.storage_path, pending.path);
  assert.equal(retry.calls.uploads.length, 0);
  assert.equal(retry.calls.writes.length, 0);
});

test("load failure shows retry rather than a misleading Add button", async () => {
  const h = database({ loadPages: [Promise.resolve({ error: new Error("offline") })] });
  api.configure({ supabaseClient: h.client, user: { id: "user-1" }, clientEmail: "client@example.com", readOnly: false });
  const result = await api.load();
  assert.ok(result.error);
  const html = api.markup("session:one");
  assert.match(html, /details are unavailable/);
  assert.match(html, /Retry/);
  assert.doesNotMatch(html, /Add Apple Workout/);
});

test("stale loads cannot repopulate a newly selected client", async () => {
  let resolveOld;
  const old = database({ loadPages: [new Promise((resolve) => { resolveOld = resolve; })] });
  api.configure({ supabaseClient: old.client, clientEmail: "old@example.com", readOnly: true });
  const oldLoad = api.load();
  const current = database({ loadPages: [Promise.resolve({ data: [] })] });
  api.configure({ supabaseClient: current.client, clientEmail: "new@example.com", readOnly: true });
  await api.load();
  resolveOld({ data: [baseRecord()] });
  assert.deepEqual(await oldLoad, { stale: true });
  assert.equal(api.markup("session:one"), "");
});

test("summary escapes names, keeps zero energy, and never offers uploads in coach read-only mode", async () => {
  const h = database({ loadPages: [Promise.resolve({ data: [baseRecord({ activity_type: '<img src=x onerror="bad()">', active_calories: 0, duration_seconds: null })] })] });
  api.configure({ supabaseClient: h.client, clientEmail: "client@example.com", readOnly: true });
  await api.load();
  const html = api.markup("session:one");
  assert.match(html, /&lt;img/);
  assert.match(html, /<dd>0 <small>kcal/);
  assert.match(html, /Workout time<\/dt><dd>—/);
  assert.doesNotMatch(html, /<img|>Edit<|Add Apple Workout/);
  assert.equal(api.markup("session:missing"), "");
  assert.equal(api.open("session:one"), false);
});

test("bounded requests reject and abort instead of leaving the interface busy forever", async () => {
  const controller = new AbortController();
  await assert.rejects(bounded(new Promise(() => {}), 5, controller), /took too long/);
  assert.equal(controller.signal.aborted, true);
});
