const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/client-routine-approval.js"), "utf8");

function dashboard() {
  const elements = [];
  const document = {
    body: { append() {} },
    querySelector() { return null; },
    createElement(tag) {
      const element = { tag, children: [], listeners: {}, dataset: {},
        setAttribute() {}, showModal() {}, append(child) { this.children.push(child); },
        addEventListener(name, callback) { this.listeners[name] = callback; },
      };
      elements.push(element);
      return element;
    },
  };
  const window = { location: { href: "https://example.test/client-dashboard.html?routine_proposal=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } };
  vm.runInNewContext(source, { URL, document, window });
  return { open: window.FWB_ROUTINE_APPROVAL.open, elements };
}

test("routine preview requires a user click before issuing the approval RPC", async () => {
  const { open, elements } = dashboard();
  const calls = [];
  const name = "<img src=x onerror=alert(1)>";
  await open({ async rpc(method) {
    calls.push(method);
    return { data: method === "get_gruntr_routine_proposal" ? {
      state: "awaiting_approval", title: "Upper/Lower", after: [{ weekday: 0, title: "Upper A",
        exercises: [{ name, prescription: "8-12 reps x 3 sets", rest: "90 sec" }] }],
    } : { state: "saved", title: "Upper/Lower" } };
  } });
  const button = elements.find((element) => element.textContent === "Approve and save routine");
  assert.equal(button.hidden, false);
  assert.deepEqual(calls, ["get_gruntr_routine_proposal"]);
  assert.ok(elements.some((element) => element.tag === "li" && element.textContent.includes(name)));
  await button.listeners.click();
  assert.deepEqual(calls, ["get_gruntr_routine_proposal", "approve_gruntr_routine"]);
  assert.equal(button.hidden, true);
  assert.ok(elements.some((element) => element.textContent === "Saved Upper/Lower to your GRUNTR routines."));
});

test("an unavailable or expired proposal leaves the approval control hidden", async () => {
  for (const data of [null, { state: "expired" }]) {
    const { open, elements } = dashboard();
    await open({ async rpc() { return { data }; } });
    const button = elements.find((element) => element.textContent === "Approve and save routine");
    assert.equal(button.hidden, true);
    assert.equal(button.listeners.click, undefined);
  }
});
