const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createGymCheckinPrompt } = require("../js/client-gym-checkin-prompt.js");

function setup({ visits = [], checked = false, failRead = false } = {}) {
  const storage = new Map();
  const listeners = new Map();
  let reads = 0;
  let saves = 0;
  let focused = 0;
  const page = {
    visibilityState: "visible",
    body: { children: [], append(element) { this.children.push(element); } },
    addEventListener(type, callback) { listeners.set(type, callback); },
    querySelector(selector) {
      assert.equal(selector, "dialog[open]");
      return this.body.children.find((child) => child.open) || null;
    },
    createElement(tag) {
      assert.equal(tag, "dialog");
      const elements = new Map([
        ["[data-gym-prompt-status]", { textContent: "" }],
        ["[data-gym-prompt-checkin]", { disabled: false, focus() { focused++; } }]
      ]);
      return {
        open: false, listeners: new Map(), attributes: {},
        setAttribute(key, value) { this.attributes[key] = value; },
        addEventListener(type, callback) { this.listeners.set(type, callback); },
        querySelector(selector) { return elements.get(selector); },
        showModal() { this.open = true; },
        close() { this.open = false; this.listeners.get("close")?.(); },
        remove() { page.body.children = page.body.children.filter((child) => child !== this); }
      };
    }
  };
  const activity = {
    isCheckedIn: () => checked,
    async readRows(_client, table, columns, email, range) {
      reads++;
      assert.equal(table, "client_gym_checkins");
      assert.equal(columns, "entry_date");
      assert.equal(email, "client@example.com");
      assert.deepEqual(range, { start: "2026-10-06", end: "2026-10-06" });
      if (failRead) throw new Error("offline");
      return visits;
    },
    async checkIn() { saves++; checked = true; return "Gym check-in saved for today."; }
  };
  const prompt = createGymCheckinPrompt({
    window: { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } },
    document: page,
    activity
  });
  const context = {
    client: {}, email: "client@example.com", user: { id: "account-1" }, day: "2026-10-06",
    returnFocus: { focus() { focused++; } }, isCurrent: () => true
  };
  return {
    prompt, page, context, storage, listeners,
    reads: () => reads, saves: () => saves, focused: () => focused,
    setVisits(value) { visits = value; }, setChecked(value) { checked = value; }, setFailRead(value) { failRead = value; },
    click(attribute) {
      const dialog = page.body.children.at(-1);
      dialog.listeners.get("click")({ target: { closest: (selector) => selector.includes(attribute) ? {} : null } });
    }
  };
}

test("gym prompt appears once per account and local day, including dismissal", async () => {
  const h = setup();
  assert.equal(await h.prompt.maybeShow(h.context), true);
  assert.equal(h.page.body.children.length, 1);
  assert.equal(h.page.body.children[0].attributes["aria-labelledby"], "client-gym-checkin-prompt-title");
  assert.equal(h.focused(), 1);
  h.click("data-gym-prompt-later");
  assert.equal(h.page.body.children.length, 0);
  assert.equal(await h.prompt.maybeShow(h.context), false);
  assert.equal(h.reads(), 1);
  assert.equal(h.storage.get("fwb_gym_checkin_prompt_v1:account-1:2026-10-06"), "seen");
});

test("an existing gym visit suppresses the prompt without consuming it", async () => {
  const h = setup({ visits: [{ entry_date: "2026-10-06" }] });
  assert.equal(await h.prompt.maybeShow(h.context), false);
  assert.equal(h.page.body.children.length, 0);
  assert.equal(h.storage.size, 0);
  h.setVisits([]);
  assert.equal(await h.prompt.maybeShow(h.context), true);
});

test("a check-in on another device and a failed read do not produce a false prompt", async () => {
  const h = setup({ checked: true });
  assert.equal(await h.prompt.maybeShow(h.context), false);
  assert.equal(h.reads(), 0);
  h.setChecked(false);
  h.setFailRead(true);
  assert.equal(await h.prompt.maybeShow(h.context), false);
  assert.equal(h.storage.size, 0);
  h.setFailRead(false);
  assert.equal(await h.prompt.maybeShow(h.context), true);
});

test("check-in action uses the existing gym flow and closes after save", async () => {
  const h = setup();
  await h.prompt.maybeShow(h.context);
  h.click("data-gym-prompt-checkin");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(h.saves(), 1);
  assert.equal(h.page.body.children.length, 0);
  assert.equal(h.focused(), 2);
});

test("a gym check-in saved elsewhere closes an already open prompt", async () => {
  const h = setup();
  await h.prompt.maybeShow(h.context);
  h.listeners.get("fwb:gym-checkin-saved")();
  assert.equal(h.page.body.children.length, 0);
  assert.equal(h.saves(), 0);
});

test("modal defers for other dialogs, inactive tabs, and an account change during loading", async () => {
  const h = setup();
  h.page.visibilityState = "hidden";
  assert.equal(await h.prompt.maybeShow(h.context), false);
  h.page.visibilityState = "visible";
  assert.equal(await h.prompt.maybeShow({ ...h.context, isCurrent: () => false }), false);
  assert.equal(h.storage.size, 0);
  assert.equal(await h.prompt.maybeShow(h.context), true);
});

test("client dashboard keeps manual daily check-in and loads mobile friendly gym modal", () => {
  const root = path.resolve(__dirname, "..");
  const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
  const styles = fs.readFileSync(path.join(root, "css/client-gym-checkin-prompt.css"), "utf8");
  assert.match(dashboard, /Gym check-in prompt/);
  assert.match(dashboard, /data-client-daily-checkin/);
  assert.match(dashboard, /js\/client-gym-checkin-prompt\.js/);
  assert.match(styles, /max-height: calc\(100dvh - 32px\)/);
  assert.match(styles, /min-height: 48px/);
});
