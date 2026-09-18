const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function timerHarness() {
  let now = 1000;
  let tick;
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, value: "60", textContent: "", events: {},
      addEventListener(name, handler) { this.events[name] = handler; }
    });
    return elements.get(id);
  };
  const window = {
    setInterval(callback) { tick = callback; return 1; },
    clearInterval() { tick = null; }
  };
  const document = { getElementById: element, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/coach-rest-timer.js"), "utf8"), {
    window, document, Date: { now: () => now }
  });
  return {
    timer: window.CoachRestTimer,
    get: (name) => element(`coach-rest-timer${name ? `-${name}` : ""}`),
    advance(seconds) { now += seconds * 1000; tick?.(); }
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
