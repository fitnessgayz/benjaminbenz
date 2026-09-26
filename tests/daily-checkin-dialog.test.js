const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/daily-checkin-dialog.js"), "utf8");
const { displayWorkoutTitle } = require("../js/daily-checkin-dialog.js");

function fixture() {
  let document;
  function element(tag) {
    const listeners = new Map();
    const attributes = new Map();
    const classes = new Set();
    const node = {
      tag, children: [], value: "", checked: false, disabled: false, hidden: false,
      textContent: "", open: false, isConnected: true, focusCount: 0,
      get className() { return [...classes].join(" "); },
      set className(value) { classes.clear(); for (const name of value.split(/\s+/)) if (name) classes.add(name); },
      classList: {
        add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name),
        toggle(name, force) { if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name); }
      },
      append(...children) { for (const child of children) { child.parent = node; node.children.push(child); } },
      replaceChildren(...children) { node.children = []; node.append(...children); },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name); },
      addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(listener); },
      emit(type, extra = {}) {
        const event = { target: node, preventDefault() { this.defaultPrevented = true; }, ...extra };
        return Promise.all((listeners.get(type) || []).map((listener) => listener(event)));
      },
      matches(selector) { return selector.startsWith(".") ? classes.has(selector.slice(1)) : tag === selector || selector === "*"; },
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
  const sandbox = vm.createContext({ window: {}, document, console });
  vm.runInContext(source, sandbox);
  const api = sandbox.window.FWB_DAILY_CHECKIN_DIALOG;
  const trigger = element("button");
  function open(options = {}) { return api.open({ returnFocus: trigger, ...options }); }
  function select(values = { mood: 3, energy: 2, sleep: 4, soreness: 2 }) {
    for (const input of document.body.querySelectorAll("input")) {
      input.checked = Number(input.value) === values[input.name.replace("daily_", "")];
    }
  }
  return {
    api, document, trigger, element, open, select,
    get dialog() { return document.body.querySelector("dialog"); },
    get form() { return document.body.querySelector("form"); },
    get status() { return document.body.querySelector(".daily-checkin-status"); },
    get save() { return document.body.querySelector(".daily-checkin-save"); },
    get use() { return document.body.querySelector(".daily-checkin-use"); },
    get original() { return document.body.querySelector(".daily-checkin-original"); },
    get generate() { return document.body.querySelector(".daily-checkin-generate"); },
    get gym() { return document.body.querySelector(".daily-checkin-gym"); }
  };
}

function recommendation(overrides = {}) {
  return {
    level: "lighter", headline: "A little less today", reasons: ["Your energy is lower today."], changes: ["One fewer set per exercise."],
    workout: { title: "Custom workout · Today: Strength A · 53c84c1e-93ad-47b0-aeb0-16effe0d7bce", format: "superset", exercises: [
      { code: "A1", name: "Goblet squat", prescription: "8-12 reps x 2 sets", rest: "90 sec", instructions: "Move with control." },
      { code: "A2", name: "Row", prescription: "8-12 reps x 2 sets", rest: "90 sec" }
    ] },
    originalWorkout: { title: "Strength A", exercises: [] }, generatorPreferences: { intensity: "easy", minutes: 20 },
    ...overrides
  };
}

test("welcome starts with the requested question and skip dismisses once with focus restored", async () => {
  const h = fixture();
  let dismissals = 0;
  assert.equal(h.open({ onDismiss() { dismissals++; } }), true);
  assert.equal(h.api.isOpen(), true);
  assert.equal(h.dialog.querySelector("h2").textContent, "How are you feeling today?");
  assert.equal(h.form.hidden, true);
  assert.equal(h.dialog.querySelector(".daily-checkin-start").textContent, "Check in");
  assert.equal(h.dialog.querySelector(".daily-checkin-skip").textContent, "Skip for now");
  await h.dialog.querySelector(".daily-checkin-skip").emit("click");
  assert.equal(h.api.isOpen(), false);
  assert.equal(dismissals, 1);
  assert.equal(h.trigger.focusCount, 1);
  assert.equal(h.document.body.classList.contains("daily-checkin-open"), false);
});

test("native dialog has named regions and required unselected rating groups with an explicit soreness direction", async () => {
  const h = fixture();
  h.open();
  await h.dialog.querySelector(".daily-checkin-start").emit("click");
  assert.equal(h.form.hidden, false);
  assert.equal(h.dialog.getAttribute("aria-labelledby"), "daily-checkin-title");
  assert.equal(h.dialog.getAttribute("aria-describedby"), "daily-checkin-description");
  assert.equal(h.status.getAttribute("role"), "status");
  const inputs = h.dialog.querySelectorAll("input");
  assert.equal(inputs.length, 20);
  assert.ok(inputs.every((input) => input.required && !input.checked));
  assert.equal(inputs.find((input) => input.name === "daily_soreness" && input.value === "1").getAttribute("aria-label"), "1 — Fresh");
  assert.equal(inputs.find((input) => input.name === "daily_soreness" && input.value === "5").getAttribute("aria-label"), "5 — Very sore");
});

test("missing ratings cannot save or reveal a recommendation", async () => {
  const h = fixture();
  let saves = 0;
  h.open({ stage: "checkin", onSave() { saves++; } });
  await h.form.emit("submit");
  assert.equal(saves, 0);
  assert.match(h.status.textContent, /Choose a rating for mood/);
  assert.equal(h.dialog.querySelector(".daily-checkin-review").hidden, true);
  assert.equal(h.document.activeElement.name, "daily_mood");
});

test("a confirmed save passes all answers and shows the adapted prescription and original option", async () => {
  const h = fixture();
  let saved;
  h.open({ stage: "checkin", onSave(value) { saved = value; return recommendation(); }, onUse() {}, onKeepOriginal() {} });
  h.select();
  h.dialog.querySelector("textarea").value = "  Long day  ";
  await h.form.emit("submit");
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), { mood: 3, energy: 2, sleep: 4, soreness: 2, note: "Long day" });
  assert.equal(h.form.hidden, true);
  assert.equal(h.dialog.querySelector(".daily-checkin-review").hidden, false);
  assert.equal(h.dialog.querySelector(".daily-checkin-workout-title").textContent, "Strength A");
  assert.equal(h.dialog.querySelector(".daily-checkin-prescription").textContent, "8-12 reps x 2 sets");
  assert.deepEqual(h.dialog.querySelectorAll(".daily-checkin-exercise-code").map((node) => node.textContent), ["A1", "A2"]);
  assert.equal(h.original.hidden, false);
  assert.equal(h.use.hidden, false);
  assert.equal(h.generate.hidden, true);
});

test("a pending save blocks duplicate submission and user cancellation; failure retains answers for retry", async () => {
  const h = fixture();
  let rejectSave;
  let saves = 0;
  h.open({ stage: "checkin", onSave() { saves++; return saves === 1 ? new Promise((_, reject) => { rejectSave = reject; }) : recommendation(); } });
  h.select();
  h.dialog.querySelector("textarea").value = "Keep this note";
  const pending = h.form.emit("submit");
  await h.form.emit("submit");
  await h.dialog.emit("cancel");
  assert.equal(saves, 1);
  assert.equal(h.api.isOpen(), true);
  assert.equal(h.save.disabled, true);
  rejectSave(new Error("You’re offline. Please try again."));
  await pending;
  assert.match(h.status.textContent, /offline/);
  assert.equal(h.form.hidden, false);
  assert.equal(h.save.disabled, false);
  assert.equal(h.dialog.querySelector("textarea").value, "Keep this note");
  assert.equal(h.dialog.querySelectorAll("input").filter((node) => node.checked).length, 4);
  await h.form.emit("submit");
  assert.equal(saves, 2);
  assert.equal(h.form.hidden, true);
});

test("account replacement invalidates a pending save without exposing the old recommendation", async () => {
  const h = fixture();
  let resolveSave;
  let oldDismissals = 0;
  h.open({ stage: "checkin", onDismiss() { oldDismissals++; }, onSave() { return new Promise((resolve) => { resolveSave = resolve; }); } });
  h.select();
  const pending = h.form.emit("submit");
  h.open({ stage: "welcome" });
  resolveSave(recommendation({ headline: "Private old-account result" }));
  await pending;
  assert.equal(h.dialog.querySelector(".daily-checkin-review").hidden, true);
  assert.equal(h.dialog.querySelector(".daily-checkin-welcome").hidden, false);
  assert.equal(h.dialog.querySelector(".daily-checkin-result-title"), null);
  assert.equal(h.status.textContent, "");
  assert.equal(h.dialog.getAttribute("aria-busy"), "false");
  assert.equal(oldDismissals, 0);
  assert.equal(h.document.body.querySelectorAll("dialog").length, 1);
});

test("explicit close invalidates async callbacks and can hand focus to a navigation target", async () => {
  const h = fixture();
  let resolveSave;
  let dismissals = 0;
  h.open({ stage: "checkin", onSave() { return new Promise((resolve) => { resolveSave = resolve; }); }, onDismiss() { dismissals++; } });
  h.select();
  const pending = h.form.emit("submit");
  h.api.close({ restoreFocus: false, dismiss: false });
  resolveSave(recommendation());
  await pending;
  assert.equal(h.api.isOpen(), false);
  assert.equal(h.trigger.focusCount, 0);
  assert.equal(dismissals, 0);
});

test("workout action errors allow retry and a confirmed launch closes without dismissal or restoring old focus", async () => {
  const h = fixture();
  let attempts = 0;
  let dismissals = 0;
  const rec = recommendation();
  h.open({ stage: "recommendation", recommendation: rec, onDismiss() { dismissals++; }, onUse(value) {
    assert.equal(value, rec);
    attempts++;
    if (attempts === 1) throw new Error("Finish your current session first.");
    return true;
  } });
  await h.use.emit("click");
  assert.equal(h.api.isOpen(), true);
  assert.match(h.status.textContent, /Finish your current session/);
  assert.equal(h.use.disabled, false);
  await h.use.emit("click");
  assert.equal(h.api.isOpen(), false);
  assert.equal(h.trigger.focusCount, 0);
  assert.equal(dismissals, 0);
});

test("declined navigation keeps the recommendation and original uses its own callback", async () => {
  const h = fixture();
  let originalUses = 0;
  h.open({ stage: "recommendation", recommendation: recommendation(), onUse() { return false; }, onKeepOriginal() { originalUses++; return true; } });
  await h.use.emit("click");
  assert.equal(h.api.isOpen(), true);
  assert.equal(h.use.disabled, false);
  await h.original.emit("click");
  assert.equal(originalUses, 1);
  assert.equal(h.api.isOpen(), false);
});

test("ready workouts can open the assigned plan, while recovery with no workout offers an easy generator and rest", async () => {
  const h = fixture();
  let generated = 0;
  h.open({ stage: "recommendation", recommendation: recommendation({ level: "planned" }), onUse() {}, onKeepOriginal() {} });
  assert.equal(h.original.hidden, false);
  assert.equal(h.original.textContent, "Keep my planned workout");
  h.open({ stage: "recommendation", recommendation: recommendation({ level: "recovery", workout: null }), onUse() {}, onKeepOriginal() {}, onGenerate() { generated++; return true; } });
  assert.equal(h.use.hidden, true);
  assert.equal(h.original.hidden, false);
  assert.equal(h.generate.hidden, false);
  assert.equal(h.generate.textContent, "Create an easy workout");
  assert.match(h.dialog.querySelector(".daily-checkin-fallback").textContent, /Rest is an option today/);
  await h.generate.emit("click");
  assert.equal(generated, 1);
  assert.equal(h.api.isOpen(), false);
});

test("gym check-in waits for confirmation, prevents duplicates, and keeps the recommendation open", async () => {
  const h = fixture();
  let confirm;
  let gymCalls = 0;
  h.open({ stage: "recommendation", recommendation: recommendation(), onGym() { gymCalls++; return new Promise((resolve) => { confirm = resolve; }); } });
  const pending = h.gym.emit("click");
  await h.gym.emit("click");
  assert.equal(gymCalls, 1);
  assert.equal(h.gym.textContent, "Gym check-in");
  confirm(true);
  await pending;
  assert.equal(h.api.isOpen(), true);
  assert.equal(h.gym.textContent, "✓ Checked in at the gym");
  assert.equal(h.gym.disabled, true);
  assert.match(h.status.textContent, /checked in at the gym for today/);
  await h.gym.emit("click");
  assert.equal(gymCalls, 1);
});

test("gym failure allows retry and does not claim attendance", async () => {
  const h = fixture();
  let calls = 0;
  h.open({ stage: "recommendation", recommendation: recommendation(), onGym() { calls++; if (calls === 1) throw new Error("Connection lost"); return true; } });
  await h.gym.emit("click");
  assert.equal(h.gym.textContent, "Gym check-in");
  assert.equal(h.gym.disabled, false);
  assert.match(h.status.textContent, /Connection lost/);
  await h.gym.emit("click");
  assert.equal(h.gym.disabled, true);
});

test("confirmed gym status strings from weekly activity are displayed without closing the review", async () => {
  const h = fixture();
  h.open({ stage: "recommendation", recommendation: recommendation(), onGym() { return "You’re already checked in at the gym today."; } });
  await h.gym.emit("click");
  assert.equal(h.status.textContent, "You’re already checked in at the gym today.");
  assert.equal(h.api.isOpen(), true);
  assert.equal(h.gym.disabled, true);
});

test("a stale navigation result cannot close a replacement account’s dialog", async () => {
  const h = fixture();
  let resolveUse;
  h.open({ stage: "recommendation", recommendation: recommendation(), onUse() { return new Promise((resolve) => { resolveUse = resolve; }); } });
  const pending = h.use.emit("click");
  h.open({ stage: "welcome" });
  resolveUse(true);
  await pending;
  assert.equal(h.api.isOpen(), true);
  assert.equal(h.dialog.querySelector(".daily-checkin-welcome").hidden, false);
  assert.equal(h.status.textContent, "");
  assert.equal(h.dialog.getAttribute("aria-busy"), "false");
});

test("a late gym error is not shown in a replacement dialog", async () => {
  const h = fixture();
  let rejectGym;
  h.open({ stage: "recommendation", recommendation: recommendation(), onGym() { return new Promise((_, reject) => { rejectGym = reject; }); } });
  const pending = h.gym.emit("click");
  h.open({ stage: "checkin" });
  rejectGym(new Error("Your old account changed."));
  await pending;
  assert.equal(h.api.isOpen(), true);
  assert.equal(h.form.hidden, false);
  assert.equal(h.status.textContent, "");
  assert.equal(h.save.disabled, false);
});

test("initial check-in can be edited without leaking answers to a later opening", () => {
  const h = fixture();
  h.open({ stage: "checkin", initialCheckIn: { mood: 4, energy: 5, sleep: 3, soreness: 1, note: "Yesterday was busy" } });
  assert.equal(h.dialog.querySelectorAll("input").filter((input) => input.checked).length, 4);
  assert.equal(h.dialog.querySelector("textarea").value, "Yesterday was busy");
  h.open({ stage: "checkin" });
  assert.equal(h.dialog.querySelectorAll("input").filter((input) => input.checked).length, 0);
  assert.equal(h.dialog.querySelector("textarea").value, "");
});

test("updating a recommendation retains answers and only rerecommends after a successful save", async () => {
  const h = fixture();
  let resolveSave;
  let rejectSave;
  let saved;
  let attempts = 0;
  const initial = { mood: 4, energy: 3, sleep: 4, soreness: 2, note: "Busy day" };
  h.open({ stage: "recommendation", recommendation: recommendation(), initialCheckIn: initial, onSave(value) {
    saved = value;
    attempts++;
    return new Promise((resolve, reject) => { resolveSave = resolve; rejectSave = reject; });
  } });
  const update = h.dialog.querySelector(".daily-checkin-update");
  assert.equal(update.hidden, false);
  assert.equal(update.textContent, "Update check-in");
  await update.emit("click");
  assert.equal(h.form.hidden, false);
  assert.equal(h.dialog.querySelector(".daily-checkin-review").hidden, true);
  assert.equal(h.dialog.querySelector("textarea").value, "Busy day");
  assert.deepEqual(h.dialog.querySelectorAll("input").filter((input) => input.checked).map((input) => Number(input.value)), [4, 3, 4, 2]);
  assert.equal(attempts, 0);
  h.select({ mood: 4, energy: 5, sleep: 5, soreness: 1 });
  const failed = h.form.emit("submit");
  await update.emit("click");
  assert.equal(h.form.hidden, false);
  assert.equal(h.dialog.querySelector(".daily-checkin-review").hidden, true);
  rejectSave(new Error("Connection lost"));
  await failed;
  assert.equal(h.form.hidden, false);
  assert.equal(h.dialog.querySelector("textarea").value, "Busy day");
  const success = h.form.emit("submit");
  assert.equal(h.dialog.querySelector(".daily-checkin-review").hidden, true);
  resolveSave(recommendation({ level: "planned", headline: "Your planned workout" }));
  await success;
  assert.equal(attempts, 2);
  assert.equal(saved.energy, 5);
  assert.equal(saved.note, "Busy day");
  assert.equal(h.form.hidden, true);
  assert.equal(h.dialog.querySelector(".daily-checkin-result-title").textContent, "Your planned workout");
});

test("update check-in is hidden when saving is unavailable", () => {
  const h = fixture();
  h.open({ stage: "recommendation", recommendation: recommendation() });
  assert.equal(h.dialog.querySelector(".daily-checkin-update").hidden, true);
});

test("untrusted recommendation and exercise strings stay text", () => {
  const h = fixture();
  const rec = recommendation();
  rec.headline = '<img src=x onerror="alert(1)">';
  rec.workout.exercises[0].name = "<script>alert(1)</script>";
  h.open({ stage: "recommendation", recommendation: rec });
  assert.equal(h.dialog.querySelector(".daily-checkin-result-title").textContent, rec.headline);
  assert.equal(h.dialog.querySelector("h5").textContent, rec.workout.exercises[0].name);
  assert.equal(h.dialog.querySelector("img"), null);
  assert.equal(h.dialog.querySelector("script"), null);
});

test("display names strip only known daily custom identity wrappers", () => {
  assert.equal(displayWorkoutTitle(recommendation().workout), "Strength A");
  assert.equal(displayWorkoutTitle({ title: "Strength · A" }), "Strength · A");
  assert.equal(displayWorkoutTitle({ title: "Custom workout · Today: My workout · not-an-id" }), "My workout · not-an-id");
});
