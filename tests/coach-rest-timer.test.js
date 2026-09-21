const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function timerHarness() {
  let now = 1000;
  let nextInterval = 1;
  const intervals = new Map();
  const documentEvents = {};
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, value: "60", textContent: "", events: {},
      addEventListener(name, handler) { this.events[name] = handler; }
    });
    return elements.get(id);
  };
  const window = {
    setInterval(callback) {
      const id = nextInterval++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) { intervals.delete(id); }
  };
  const document = {
    getElementById: element,
    addEventListener(name, handler) { documentEvents[name] = handler; }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/coach-rest-timer.js"), "utf8"), {
    window, document, Date: { now: () => now }
  });
  return {
    timer: window.CoachRestTimer,
    get: (name) => element(`coach-rest-timer${name ? `-${name}` : ""}`),
    advance(seconds) { now += seconds * 1000; [...intervals.values()].forEach((tick) => tick()); },
    elapse(seconds) { now += seconds * 1000; },
    visibilityChange() { documentEvents.visibilitychange?.(); },
    get intervalCount() { return intervals.size; }
  };
}

test("rest timer counts wall time and catches up after delayed ticks", () => {
  const h = timerHarness();
  h.timer.start();
  assert.equal(h.get("").hidden, false);
  assert.equal(h.get("display").textContent, "01:00");
  h.advance(17);
  assert.equal(h.get("display").textContent, "00:43");
  h.advance(120);
  assert.equal(h.get("display").textContent, "00:00");
  assert.match(h.get("status").textContent, /Rest complete/);
});

test("pause freezes remaining time and resume continues from it", () => {
  const h = timerHarness();
  h.timer.start();
  h.advance(10);
  h.get("toggle").events.click();
  h.advance(100);
  assert.equal(h.get("display").textContent, "00:50");
  h.get("toggle").events.click();
  h.advance(10);
  assert.equal(h.get("display").textContent, "00:40");
});

test("new sets restart the chosen duration and skip cancels the timer", () => {
  const h = timerHarness();
  h.get("duration").value = "90";
  h.get("duration").events.change();
  h.advance(30);
  h.timer.start();
  assert.equal(h.get("display").textContent, "01:30");
  h.get("skip").events.click();
  h.advance(200);
  assert.equal(h.get("").hidden, true);
  assert.equal(h.get("display").textContent, "01:30");
});

test("inline timers hide the floating panel and publish state to subscribers", () => {
  const h = timerHarness();
  const snapshots = [];
  const unsubscribe = h.timer.subscribe((state) => snapshots.push({ ...state }));
  assert.deepEqual(snapshots[0], {
    remaining: 60, running: false, active: false, complete: false, owner: null, inline: false
  });
  h.timer.start({ inline: true, owner: "group-1:round-2" });
  assert.equal(h.get("").hidden, true);
  assert.deepEqual(snapshots.at(-1), {
    remaining: 60, running: true, active: true, complete: false, owner: "group-1:round-2", inline: true
  });
  h.advance(9);
  assert.equal(snapshots.at(-1).remaining, 51);
  unsubscribe();
  const count = snapshots.length;
  h.advance(1);
  assert.equal(snapshots.length, count);
  assert.equal(h.timer.getState().remaining, 50);
});

test("inline pause and resume preserve the owner and freeze the countdown", () => {
  const h = timerHarness();
  h.timer.start({ inline: true, owner: "press:1", durationSeconds: 90 });
  h.advance(20);
  h.timer.toggle();
  assert.equal(h.timer.getState().running, false);
  assert.equal(h.intervalCount, 0);
  h.advance(300);
  assert.equal(h.timer.getState().remaining, 70);
  h.timer.adjust(-15);
  assert.equal(h.timer.getState().remaining, 55);
  assert.equal(h.timer.getState().running, false);
  h.timer.toggle();
  h.advance(5);
  assert.equal(h.timer.getState().remaining, 50);
  assert.equal(h.timer.getState().owner, "press:1");
  assert.equal(h.get("").hidden, true);
  assert.equal(h.intervalCount, 1);
});

test("adjusting a running timer retains its wall-time deadline without rounding drift", () => {
  const h = timerHarness();
  h.timer.start({ inline: true, owner: "squat:1" });
  h.advance(10.5);
  assert.equal(h.timer.getState().remaining, 50);
  h.timer.adjust(15);
  assert.equal(h.timer.getState().remaining, 65);
  h.advance(0.5);
  assert.equal(h.timer.getState().remaining, 64);
  assert.equal(h.timer.getState().running, true);
  h.timer.adjust(-15);
  assert.equal(h.timer.getState().remaining, 49);
  h.timer.adjust(-1000);
  assert.equal(h.timer.getState().remaining, 0);
  assert.equal(h.timer.getState().complete, true);
  assert.equal(h.timer.getState().owner, "squat:1");
  assert.equal(h.intervalCount, 0);
});

test("completion remains available until the next action and restart keeps its inline owner", () => {
  const h = timerHarness();
  h.timer.start({ inline: true, owner: "row:3", durationSeconds: 30 });
  h.advance(80);
  const completed = { ...h.timer.getState() };
  assert.deepEqual(completed, {
    remaining: 0, running: false, active: true, complete: true, owner: "row:3", inline: true
  });
  h.advance(120);
  assert.deepEqual({ ...h.timer.getState() }, completed);
  assert.equal(h.intervalCount, 0);
  h.timer.toggle();
  assert.equal(h.timer.getState().remaining, 30);
  assert.equal(h.timer.getState().owner, "row:3");
  assert.equal(h.timer.getState().complete, false);
  assert.equal(h.timer.getState().running, true);
  assert.equal(h.get("").hidden, true);
});

test("a new owner replaces the active rest interval and stop clears ownership", () => {
  const h = timerHarness();
  const snapshots = [];
  h.timer.subscribe((state) => snapshots.push({ ...state }));
  h.timer.start({ inline: true, owner: "first:1" });
  h.advance(20);
  h.timer.start({ inline: true, owner: "second:1" });
  assert.equal(h.timer.getState().remaining, 60);
  assert.equal(h.timer.getState().owner, "second:1");
  assert.equal(h.intervalCount, 1);
  h.advance(10);
  h.timer.stop();
  assert.deepEqual(snapshots.at(-1), {
    remaining: 50, running: false, active: false, complete: false, owner: null, inline: false
  });
  assert.equal(h.intervalCount, 0);
  assert.equal(h.get("").hidden, true);
  const count = snapshots.length;
  h.advance(200);
  assert.equal(snapshots.length, count);
  h.timer.adjust(15);
  assert.equal(h.timer.getState().remaining, 50);
});

test("inline timers catch up when the page becomes visible even though the floating panel is hidden", () => {
  const h = timerHarness();
  const snapshots = [];
  h.timer.subscribe((state) => snapshots.push({ ...state }));
  h.timer.start({ inline: true, owner: "row:1" });
  h.elapse(80);
  h.visibilityChange();
  assert.equal(snapshots.at(-1).remaining, 0);
  assert.equal(snapshots.at(-1).complete, true);
  assert.equal(snapshots.at(-1).owner, "row:1");
  assert.equal(h.intervalCount, 0);
  assert.equal(h.get("").hidden, true);
});

test("getState reflects elapsed wall time without waiting for the next tick", () => {
  const h = timerHarness();
  h.timer.start({ inline: true, owner: "row:1" });
  h.elapse(17);
  assert.equal(h.timer.getState().remaining, 43);
  h.elapse(100);
  assert.equal(h.timer.getState().complete, true);
  assert.equal(h.intervalCount, 0);
});

test("duration controls and floating starts remain compatible after an inline timer", () => {
  const h = timerHarness();
  h.get("duration").value = "120";
  h.timer.start({ inline: true, owner: "row:1" });
  assert.equal(h.timer.getState().remaining, 120);
  h.timer.start();
  assert.equal(h.get("").hidden, false);
  assert.equal(h.timer.getState().inline, false);
  assert.equal(h.timer.getState().owner, null);
  h.get("duration").value = "30";
  h.get("duration").events.change();
  assert.equal(h.timer.getState().remaining, 30);
  h.get("duration").value = "invalid";
  h.timer.start();
  assert.equal(h.timer.getState().remaining, 60);
});

test("adding time after completion creates a paused extension under the same owner", () => {
  const h = timerHarness();
  h.timer.start({ inline: true, owner: "row:1" });
  h.advance(60);
  h.timer.adjust(15);
  assert.equal(h.timer.getState().remaining, 15);
  assert.equal(h.timer.getState().complete, false);
  assert.equal(h.timer.getState().running, false);
  assert.equal(h.timer.getState().owner, "row:1");
  h.timer.toggle();
  h.advance(15);
  assert.equal(h.timer.getState().complete, true);
});
