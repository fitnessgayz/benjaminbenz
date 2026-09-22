const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/pr-help.js"), "utf8");

function fixture() {
  const timers = new Map();
  const observers = [];
  const listeners = new Map();
  const windowListeners = new Map();
  let timerId = 0;
  let focusCalls = 0;
  function element(tag, attributes = {}) {
    const attrs = new Map(Object.entries(attributes));
    const node = {
      tagName: tag.toUpperCase(), parentNode: null, children: [], hidden: false, disabled: false,
      style: {}, value: "", textContent: "", rect: { left: 100, top: 200, width: 32, height: 32, right: 132, bottom: 232 },
      get id() { return attrs.get("id") || ""; },
      set id(value) { attrs.set("id", value); },
      get isConnected() { return node === body || Boolean(node.parentNode?.isConnected); },
      setAttribute: (name, value) => attrs.set(name, String(value)),
      getAttribute: (name) => attrs.get(name) ?? null,
      removeAttribute: (name) => attrs.delete(name),
      contains(target) { return node === target || node.children.some((child) => child.contains(target)); },
      closest(selector) { return selector === "[data-pr-help]" && attrs.has("data-pr-help") ? node : node.parentNode?.closest(selector) || null; },
      append(child) { child.parentNode = node; node.children.push(child); },
      remove() { node.parentNode.children = node.parentNode.children.filter((child) => child !== node); node.parentNode = null; },
      getBoundingClientRect() { return node.rect; },
      focus() { focusCalls++; document.activeElement = node; }
    };
    return node;
  }
  const body = element("body");
  const document = {
    body, activeElement: body, documentElement: { clientWidth: 390, clientHeight: 844 },
    createElement(tag) {
      const node = element(tag);
      node.rect = { left: 0, top: 0, width: 128, height: 36, right: 128, bottom: 36 };
      return node;
    },
    getElementById(id) { return body.children.find((node) => node.id === id) || null; },
    addEventListener(type, listener, options) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ listener, options });
    }
  };
  const window = {
    innerWidth: 390, innerHeight: 844,
    addEventListener(type, listener) { windowListeners.set(type, listener); }
  };
  class Observer {
    constructor(callback) { this.callback = callback; this.observing = false; observers.push(this); }
    observe() { this.observing = true; }
    disconnect() { this.observing = false; }
  }
  const context = vm.createContext({
    window, document, MutationObserver: Observer,
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(source, context);
  function trigger() {
    const button = element("button", { "data-pr-help": "", "aria-label": "What does PR mean?" });
    const icon = element("svg");
    button.append(icon);
    body.append(button);
    return { button, icon };
  }
  function emit(type, target, extra = {}) {
    const event = { target, defaultPrevented: false, propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; }, ...extra };
    for (const { listener } of listeners.get(type) || []) listener(event);
    return event;
  }
  return {
    api: window.FWBPrHelp, window, document, body, element, listeners, observers, trigger, emit,
    get tooltip() { return document.getElementById("pr-help-tooltip"); },
    get focusCalls() { return focusCalls; },
    flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach((callback) => callback()); },
    resize() { windowListeners.get("resize")?.(); },
    mutation() { observers.filter((observer) => observer.observing).forEach((observer) => observer.callback()); }
  };
}

test("PR help lazily reuses one literal tooltip and preserves preexisting accessible descriptions", () => {
  const h = fixture();
  h.api.initialize();
  h.api.initialize();
  assert.equal(h.listeners.get("click").length, 1);
  assert.equal(h.tooltip, null);
  const { button, icon } = h.trigger();
  button.setAttribute("aria-describedby", "existing-hint");
  h.emit("pointerover", icon);
  assert.equal(h.tooltip.hidden, false);
  assert.equal(h.tooltip.textContent, "Personal record");
  assert.equal(h.tooltip.getAttribute("role"), "tooltip");
  assert.equal(button.getAttribute("aria-describedby"), "existing-hint pr-help-tooltip");
  assert.equal(button.getAttribute("aria-expanded"), "true");
  h.api.close();
  assert.equal(button.getAttribute("aria-describedby"), "existing-hint");
  assert.equal(button.getAttribute("aria-expanded"), "false");
  h.api.open(button);
  assert.equal(h.body.children.filter((node) => node.id === "pr-help-tooltip").length, 1);
  assert.equal(h.focusCalls, 0);
});

test("the first click pins a focus-opened tooltip and the second click dismisses it", () => {
  const h = fixture();
  const { button, icon } = h.trigger();
  h.document.activeElement = button;
  h.emit("focusin", button);
  h.emit("click", icon);
  h.emit("pointerout", button, { relatedTarget: h.body });
  h.flushTimers();
  assert.equal(h.tooltip.hidden, false, "Focus opening must not make the first tap act like a dismissal");
  h.emit("click", button);
  assert.equal(h.tooltip.hidden, true);
  assert.equal(button.getAttribute("aria-describedby"), null);
});

test("Tabbing away dismisses click-pinned help without moving focus back to the trigger", () => {
  const h = fixture();
  const { button } = h.trigger();
  const next = h.element("input");
  h.body.append(next);
  h.document.activeElement = button;
  h.emit("focusin", button);
  h.emit("click", button);
  h.document.activeElement = next;
  h.emit("focusout", button, { relatedTarget: next });
  h.flushTimers();
  assert.equal(h.tooltip.hidden, true);
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(h.document.activeElement, next);
  assert.equal(h.focusCalls, 0);
});

test("hovering tooltip content keeps it open across the gap, then leaving closes it", () => {
  const h = fixture();
  const { button, icon } = h.trigger();
  h.emit("pointerover", icon);
  h.emit("pointerout", icon, { relatedTarget: button });
  h.flushTimers();
  assert.equal(h.tooltip.hidden, false);
  h.emit("pointerout", button, { relatedTarget: h.body });
  h.emit("pointerover", h.tooltip);
  h.flushTimers();
  assert.equal(h.tooltip.hidden, false);
  h.emit("pointerout", h.tooltip, { relatedTarget: h.body });
  h.flushTimers();
  assert.equal(h.tooltip.hidden, true);
});

test("keyboard focus holds an unpinned tooltip after pointerout until focus leaves", () => {
  const h = fixture();
  const { button } = h.trigger();
  h.document.activeElement = button;
  h.emit("focusin", button);
  h.emit("pointerout", button, { relatedTarget: h.body });
  h.flushTimers();
  assert.equal(h.tooltip.hidden, false);
  h.document.activeElement = h.body;
  h.emit("focusout", button, { relatedTarget: h.body });
  h.flushTimers();
  assert.equal(h.tooltip.hidden, true);
  assert.equal(h.focusCalls, 0);
});

test("Escape is captured only while help is open so dismissing it cannot collapse mobile navigation", () => {
  const h = fixture();
  const { button } = h.trigger();
  assert.equal(h.listeners.get("keydown")[0].options, true);
  const before = h.emit("keydown", button, { key: "Escape" });
  assert.equal(before.defaultPrevented, false);
  assert.equal(before.propagationStopped, false);
  h.api.open(button);
  const otherKey = h.emit("keydown", button, { key: "Enter" });
  assert.equal(otherKey.defaultPrevented, false);
  const close = h.emit("keydown", button, { key: "Escape" });
  assert.equal(close.defaultPrevented, true);
  assert.equal(close.propagationStopped, true);
  assert.equal(h.tooltip.hidden, true);
  const after = h.emit("keydown", button, { key: "Escape" });
  assert.equal(after.propagationStopped, false);
});

test("outside clicks, scrolling, and resizing dismiss pinned help without touching workout values or focus", () => {
  for (const dismiss of [
    (h) => h.emit("click", h.body), (h) => h.emit("scroll", h.body), (h) => h.resize()
  ]) {
    const h = fixture();
    const { button } = h.trigger();
    const input = h.element("input");
    input.value = "17.5";
    h.body.append(input);
    h.document.activeElement = input;
    h.emit("click", button);
    assert.equal(h.tooltip.hidden, false);
    dismiss(h);
    assert.equal(h.tooltip.hidden, true);
    assert.equal(input.value, "17.5");
    assert.equal(h.document.activeElement, input);
    assert.equal(h.focusCalls, 0);
  }
  const h = fixture();
  assert.equal(h.listeners.get("scroll")[0].options.capture, true, "Nested workout scroll containers also dismiss help");
});

test("tooltip positions above or below its trigger and stays within narrow viewport edges", () => {
  for (const rect of [
    { left: 0, top: 3, width: 32, height: 32 },
    { left: 375, top: 700, width: 15, height: 32 }
  ]) {
    const h = fixture();
    const { button } = h.trigger();
    button.rect = { ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height };
    h.api.open(button);
    const x = parseFloat(h.tooltip.style.left);
    const y = parseFloat(h.tooltip.style.top);
    assert.ok(x >= 8 && x + 128 <= 382);
    assert.ok(y >= 8 && y + 36 <= 836);
    if (rect.top < 40) assert.ok(y > button.rect.bottom);
    else assert.ok(y + 36 < button.rect.top);
  }
});

test("card remounts dismiss orphaned help and disconnect its temporary observer", () => {
  const h = fixture();
  const { button } = h.trigger();
  h.api.open(button, { pin: true });
  assert.equal(h.observers.length, 1);
  assert.equal(h.observers[0].observing, true);
  button.remove();
  h.mutation();
  assert.equal(h.tooltip.hidden, true);
  assert.equal(button.getAttribute("aria-describedby"), null);
  assert.equal(h.observers[0].observing, false);
  assert.equal(h.focusCalls, 0);
});

test("changing triggers removes the old description and ignores disabled or detached buttons", () => {
  const h = fixture();
  const first = h.trigger().button;
  const second = h.trigger().button;
  h.api.open(first, { pin: true });
  h.api.open(second);
  assert.equal(first.getAttribute("aria-describedby"), null);
  assert.equal(second.getAttribute("aria-describedby"), "pr-help-tooltip");
  h.api.close();
  second.disabled = true;
  assert.equal(h.api.open(second), false);
  first.remove();
  assert.equal(h.api.open(first), false);
  assert.equal(h.tooltip.hidden, true);
});
