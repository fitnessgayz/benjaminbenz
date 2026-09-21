const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/apple-workout.js"), "utf8");
const metricNames = ["workout_date", "activity_type", "duration_seconds", "elapsed_seconds", "active_calories", "total_calories", "average_heart_rate", "started_at_local", "ended_at_local"];
const flush = () => new Promise(setImmediate);

function element() {
  const listeners = new Map();
  return {
    value: "", checked: false, disabled: false, hidden: false, textContent: "", innerHTML: "",
    addEventListener(type, listener) { listeners.set(type, listener); },
    emit(type, target) { return listeners.get(type)?.({ target, preventDefault() {} }); },
    setAttribute() {}, removeAttribute() {}, insertAdjacentHTML() {}, focus() {}
  };
}

async function fixture() {
  const form = element();
  form.elements = Object.fromEntries([...metricNames, "history_key", "photo", "confirm_link"].map((name) => [name, { ...element(), name }]));
  const submit = element();
  form.querySelector = () => submit;
  form.querySelectorAll = () => Object.values(form.elements);
  form.reset = () => Object.values(form.elements).forEach((control) => { control.value = ""; control.checked = false; });
  const nodes = new Map();
  const dialog = element();
  dialog.querySelector = (selector) => {
    if (selector === "form") return form;
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; dialog.emit("close"); };
  const calls = [];
  const query = { select() { return query; }, eq() { return query; }, order() { return query; }, range: async () => ({ data: [], error: null }) };
  const client = {
    auth: { getSession: async () => ({ data: { session: {
      access_token: "client-access-token", expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "client-id", email: "client@example.com" }
    } }, error: null }) },
    from: () => query,
    functions: { invoke(name, options) {
      return new Promise((resolve) => calls.push({ name, options, resolve }));
    } }
  };
  const context = vm.createContext({
    window: {}, document: { createElement: () => dialog, body: { append() {} }, activeElement: null, querySelectorAll: () => [] },
    URL, FormData, AbortController, setTimeout, clearTimeout
  });
  vm.runInContext(source, context);
  const api = context.window.FWBAppleWorkout;
  api.configure({
    supabaseClient: client, user: { id: "client-id" }, clientEmail: "client@example.com", readOnly: false, automaticReading: true,
    getWorkouts: () => [{ history_key: "session:existing-workout", entry_date: "2026-09-21", workout_title: "Strength" }]
  });
  await api.load();
  assert.equal(api.open("session:existing-workout"), true);
  const selectPhoto = () => {
    const photo = new File([new Uint8Array([0xff, 0xd8, 0xff])], "workout.jpg", { type: "image/jpeg" });
    form.elements.photo.files = [photo];
    form.emit("change", form.elements.photo);
    return photo;
  };
  return { form, dialog, submit, nodes, calls, selectPhoto };
}

test("selecting a screenshot automatically fills readable metrics, keeps manual edits, and requires review", async () => {
  const h = await fixture();
  assert.match(h.nodes.get(".apple-workout-disclosure").textContent, /OpenAI reads your screenshot/);
  h.form.elements.confirm_link.checked = true;
  h.selectPhoto();
  await flush();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].name, "extract-apple-workout");
  assert.equal(h.calls[0].options.body.get("photo").name, "workout.jpg");
  assert.equal(h.calls[0].options.body.get("workout_date"), "2026-09-21");
  assert.equal(h.form.elements.confirm_link.checked, false);
  assert.equal(h.submit.disabled, true, "Saving waits until automatic reading finishes");

  h.form.elements.activity_type.value = "My corrected activity";
  h.form.emit("input", h.form.elements.activity_type);
  h.calls[0].resolve({ data: { workout: {
    workout_date: "2026-09-20", activity_type: "Traditional Strength Training",
    duration_seconds: 4992, elapsed_seconds: 5080, active_calories: 0, total_calories: 465,
    average_heart_rate: null, started_at_local: "10:30:00", ended_at_local: "11:53:12"
  }, warnings: [], confidence: "high" }, error: null });
  await flush();

  assert.equal(h.form.elements.workout_date.value, "2026-09-20");
  assert.equal(h.form.elements.activity_type.value, "My corrected activity");
  assert.equal(h.form.elements.duration_seconds.value, "1:23:12");
  assert.equal(h.form.elements.elapsed_seconds.value, "1:24:40");
  assert.equal(h.form.elements.active_calories.value, "0");
  assert.equal(h.form.elements.total_calories.value, "465");
  assert.equal(h.form.elements.average_heart_rate.value, "", "An unreadable metric must remain blank");
  assert.equal(h.form.elements.started_at_local.value, "10:30:00");
  assert.equal(h.form.elements.ended_at_local.value, "11:53:12");
  assert.equal(h.form.elements.confirm_link.checked, false, "Automatic reading must not confirm the workout for the client");
  assert.equal(h.submit.disabled, false);
  assert.match(h.nodes.get("[data-apple-read-status]").textContent, /Screenshot read\. Review the details/);
  h.dialog.close();
});

test("an extraction failure keeps manual entries and allows reviewing and saving the original screenshot", async () => {
  const h = await fixture();
  h.selectPhoto();
  await flush();
  h.form.elements.active_calories.value = "245";
  h.form.emit("input", h.form.elements.active_calories);
  h.calls[0].resolve({ data: null, error: new Error("Extraction unavailable") });
  await flush();
  assert.equal(h.form.elements.active_calories.value, "245");
  assert.equal(h.form.elements.duration_seconds.value, "");
  assert.equal(h.form.elements.confirm_link.checked, false);
  assert.equal(h.submit.disabled, false);
  assert.match(h.nodes.get("[data-apple-read-status]").textContent, /Enter the details manually/);
  h.dialog.close();
});
