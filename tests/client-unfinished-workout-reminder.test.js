const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { createUnfinishedWorkoutReminder } = require("../js/client-unfinished-workout-reminder.js");

function harness({ permission = "default", hidden = false } = {}) {
  let now = 1_000;
  let workout = null;
  let notificationCount = 0;
  let permissionRequests = 0;
  const store = new Map();
  const body = { children: [], append(element) { this.children.push(element); } };
  const page = {
    hidden,
    body,
    listeners: new Map(),
    addEventListener(type, callback) { this.listeners.set(type, callback); },
    removeEventListener(type) { this.listeners.delete(type); },
    createElement() {
      return {
        attributes: {},
        listeners: new Map(),
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(type, callback) { this.listeners.set(type, callback); },
        remove() { body.children = body.children.filter((child) => child !== this); }
      };
    }
  };
  class NotificationApi {
    static permission = permission;
    static requestPermission() { permissionRequests++; return Promise.resolve("granted"); }
    constructor() { notificationCount++; }
  }
  const view = {
    Notification: NotificationApi,
    navigator: {},
    sessionStorage: {
      getItem(key) { return store.get(key) ?? null; },
      setItem(key, value) { store.set(key, value); },
      removeItem(key) { store.delete(key); }
    },
    setInterval: () => 1,
    clearInterval() {},
    addEventListener() {},
    removeEventListener() {}
  };
  const opened = [];
  const controller = createUnfinishedWorkoutReminder({
    window: view,
    document: page,
    getWorkoutState: () => workout,
    now: () => now,
    openWorkout: (state, finish) => opened.push({ state, finish })
  });
  return {
    controller, page, body, opened, store,
    setTime(value) { now = value; },
    setWorkout(value) { workout = value; },
    notifications: () => notificationCount,
    permissionRequests: () => permissionRequests,
    interaction(selector) {
      page.listeners.get("click")({ target: { closest: (query) => query.includes(selector) ? {} : null } });
    },
    bannerAction(name) {
      const banner = body.children.at(-1);
      const action = { hasAttribute: (attribute) => attribute === name };
      banner.listeners.get("click")({ target: { closest: () => action } });
    }
  };
}

function activeWorkout(updatedAt = 1_000) {
  return { clientEmail: "client@example.com", workoutTitle: "Leg day", workoutDate: "2026-10-06", updatedAt };
}

test("reminds after ten minutes of inactivity and resets after workout interaction", () => {
  const h = harness();
  h.setWorkout(activeWorkout());
  h.controller.start();
  h.setTime(600_999);
  h.controller.tick();
  assert.equal(h.body.children.length, 0);
  h.setTime(601_000);
  h.controller.tick();
  h.controller.tick();
  assert.equal(h.body.children.length, 1, "one on-screen reminder per idle period");
  assert.equal(h.body.children[0].attributes.role, "status");
  h.interaction(".client-workout-panel");
  assert.equal(h.body.children.length, 0);
  h.setTime(1_201_000);
  h.controller.tick();
  assert.equal(h.body.children.length, 1);
  h.controller.destroy();
});

test("dismiss stays dismissed until the client works out again; finish clears the session", () => {
  const h = harness();
  h.setWorkout(activeWorkout());
  h.controller.start();
  h.setTime(601_000);
  h.controller.tick();
  h.bannerAction("data-reminder-dismiss");
  h.setTime(2_000_000);
  h.controller.tick();
  assert.equal(h.body.children.length, 0);
  h.interaction(".client-workout-panel");
  h.setTime(2_600_000);
  h.controller.tick();
  assert.equal(h.body.children.length, 1);
  h.bannerAction("data-reminder-finish");
  assert.equal(h.opened.length, 1);
  assert.equal(h.opened[0].finish, true);
  h.setWorkout(null);
  h.controller.tick();
  assert.equal(h.body.children.length, 0);
  assert.equal(h.store.size, 0);
  h.controller.destroy();
});

test("uses existing notification permission while hidden, then shows on-screen reminder on return", async () => {
  const h = harness({ permission: "granted", hidden: true });
  h.setWorkout(activeWorkout());
  h.controller.start();
  h.setTime(601_000);
  h.controller.tick();
  h.controller.tick();
  await Promise.resolve();
  assert.equal(h.notifications(), 1);
  assert.equal(h.permissionRequests(), 0);
  assert.equal(h.body.children.length, 0);
  h.page.hidden = false;
  h.controller.tick();
  assert.equal(h.body.children.length, 1);
  h.controller.destroy();
});

test("does not request permission and clears reminders when signing out", () => {
  const h = harness({ hidden: true });
  h.setWorkout(activeWorkout());
  h.controller.start();
  h.setTime(601_000);
  h.controller.tick();
  assert.equal(h.notifications(), 0);
  assert.equal(h.permissionRequests(), 0);
  h.interaction("[data-sign-out]");
  assert.equal(h.store.size, 0);
  h.page.hidden = false;
  h.controller.tick();
  assert.equal(h.body.children.length, 0);
  h.controller.destroy();
});

test("dashboard loads the reminder after the workout logger and styles it above mobile navigation", () => {
  const root = path.resolve(__dirname, "..");
  const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
  const styles = fs.readFileSync(path.join(root, "css/client-unfinished-workout-reminder.css"), "utf8");
  assert.ok(dashboard.indexOf("js/client-portal.js?") < dashboard.indexOf("js/client-unfinished-workout-reminder.js?"));
  assert.match(dashboard, /css\/client-unfinished-workout-reminder\.css/);
  assert.match(styles, /bottom: calc\(96px \+ env\(safe-area-inset-bottom\)\)/);
});
