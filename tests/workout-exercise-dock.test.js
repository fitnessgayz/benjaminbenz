const test = require("node:test");
const assert = require("node:assert/strict");
const { createController } = require("../js/workout-exercise-dock.js");

function fixture({ mobile = true, selected = true, count = 2 } = {}) {
  let document;
  function node(classes = "", attributes = {}) {
    const classNames = new Set(classes.split(" ").filter(Boolean));
    const attrs = new Map(Object.entries(attributes));
    const listeners = new Map();
    const element = {
      children: [], parentNode: null, hidden: false, dataset: {}, value: "",
      classList: {
        add: (...values) => values.forEach(value => classNames.add(value)),
        remove: (...values) => values.forEach(value => classNames.delete(value)),
        contains: value => classNames.has(value),
        toggle(value, enabled) { enabled ? classNames.add(value) : classNames.delete(value); }
      },
      style: { setProperty() {} },
      set className(value) { classNames.clear(); value.split(" ").forEach(name => classNames.add(name)); },
      get className() { return [...classNames].join(" "); },
      set id(value) { attrs.set("id", value); }, get id() { return attrs.get("id"); },
      get isConnected() { return element === body || Boolean(element.parentNode?.isConnected); },
      setAttribute: (key, value) => attrs.set(key, String(value)),
      getAttribute: key => attrs.get(key) ?? null,
      hasAttribute: key => attrs.has(key),
      removeAttribute: key => attrs.delete(key),
      append(...children) { children.forEach(child => { child.remove(); child.parentNode = element; element.children.push(child); }); },
      prepend(child) { child.remove(); child.parentNode = element; element.children.unshift(child); },
      remove() {
        if (element.parentNode) element.parentNode.children.splice(element.parentNode.children.indexOf(element), 1);
        element.parentNode = null;
      },
      contains(child) { return child === element || element.children.some(candidate => candidate.contains(child)); },
      matches(selector) {
        if (selector.includes(":not([hidden])") && element.hidden) return false;
        selector = selector.replace(":not([hidden])", "");
        if (selector.startsWith(".")) return selector.slice(1).split(".").every(name => classNames.has(name));
        const match = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
        return Boolean(match && attrs.has(match[1]) && (match[2] === undefined || attrs.get(match[1]) === match[2]));
      },
      querySelector(selector) {
        for (const child of element.children) {
          if (child.matches(selector)) return child;
          const nested = child.querySelector(selector);
          if (nested) return nested;
        }
        return null;
      },
      closest(selector) { return element.matches(selector) ? element : element.parentNode?.closest(selector) || null; },
      cloneNode(deep) {
        const copy = node(element.className, Object.fromEntries(attrs));
        copy.dataset = { ...element.dataset }; copy.hidden = element.hidden;
        if (deep) copy.append(...element.children.map(child => child.cloneNode(true)));
        return copy;
      },
      focus() { document.activeElement = element; },
      getBoundingClientRect: () => ({ top: 700 }),
      addEventListener(type, listener) { listeners.set(type, listener); },
      removeEventListener(type) { listeners.delete(type); },
      fire(type, details = {}) {
        const event = { target: element, prevented: false, stopped: false,
          preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; },
          stopImmediatePropagation() { this.stopped = true; }, ...details };
        listeners.get(type)?.(event);
        return event;
      }
    };
    return element;
  }
  const body = node(), content = node("", { id: "dashboard-content" });
  const section = node("", { "data-client-dashboard-panel": "workouts" });
  section.hidden = !selected;
  const panel = node("client-workout-panel is-active");
  const navigation = node("client-dashboard-tabs is-mobile-expanded");
  const tab = node("client-dashboard-tab is-active", { "data-client-dashboard-tab": "workouts", "aria-label": "Workouts" });
  const list = node("workout-exercise-list", { "data-workout-exercise-list": "" });
  const logs = Array.from({ length: count }, (_, i) => {
    const log = node(); log.value = `${17.5 + i}`; return log;
  });
  panel.logs = logs;
  body.append(content, navigation); content.append(section); section.append(panel);
  panel.append(list, ...logs); navigation.append(tab);
  document = node();
  document.body = body;
  document.querySelector = selector => body.querySelector(selector);
  document.getElementById = id => id === "dashboard-content" ? content : null;
  document.createElement = () => node();
  const window = node();
  window.innerHeight = 800;
  window.matchMedia = () => ({ matches: mobile });
  window.MutationObserver = class { observe() {} disconnect() {} };
  const jumps = [];
  const syncList = () => {
    [...list.children].forEach(child => child.remove());
    list.append(...panel.logs.map((_, i) => {
      const button = node("", { "data-workout-exercise-jump": String(i) });
      button.dataset.workoutExerciseJump = String(i);
      return button;
    }));
  };
  syncList();
  const controller = createController({ document, window,
    getLogs: source => source.logs, syncList,
    jump(button) { jumps.push(panel.logs[Number(button.dataset.workoutExerciseJump)]); jumps.at(-1).focus(); }
  });
  return { body, content, section, panel, tab, list, logs, document, window, jumps, controller,
    setMobile(value) { mobile = value; },
    overlay: () => body.querySelector(".workout-exercise-dock") };
}

test("arrow is available only on a selected mobile workout and clears when leaving", () => {
  const h = fixture();
  assert.equal(h.tab.classList.contains("has-exercise-list"), true);
  assert.equal(h.tab.getAttribute("aria-expanded"), "false");
  h.section.hidden = true; h.controller.refresh();
  assert.equal(h.controller.toggle(), false);
  assert.equal(h.tab.classList.contains("has-exercise-list"), false);
  assert.equal(h.tab.getAttribute("aria-label"), "Workouts");
  assert.equal(h.tab.hasAttribute("aria-expanded"), false);
  h.section.hidden = false; h.setMobile(false); h.controller.refresh();
  assert.equal(h.controller.toggle(), false);
  h.setMobile(true); h.content.hidden = true; h.controller.refresh();
  assert.equal(h.controller.toggle(), false);
});

test("opening and toggling the list preserves live input identity and returns focus", () => {
  const h = fixture();
  h.logs[0].focus();
  assert.equal(h.controller.toggle(), true);
  assert.equal(h.tab.getAttribute("aria-expanded"), "true");
  assert.equal(h.overlay().contains(h.document.activeElement), true);
  assert.equal(h.logs[0].parentNode, h.panel);
  assert.equal(h.logs[0].value, "17.5");
  assert.equal(h.controller.toggle(), true);
  assert.equal(h.overlay(), null);
  assert.equal(h.document.activeElement, h.tab);
  assert.equal(h.tab.getAttribute("aria-expanded"), "false");
  assert.equal(h.body.classList.contains("workout-exercise-dock-open"), false);
});

test("selection closes the sheet and jumps through the original list without touching values", () => {
  const h = fixture(); h.controller.toggle();
  const overlay = h.overlay();
  const choice = overlay.querySelector('[data-workout-exercise-jump="1"]');
  const event = overlay.fire("click", { target: choice });
  assert.equal(event.stopped, true, "The copied row must not reach the main workout click handler");
  assert.equal(h.overlay(), null);
  assert.deepEqual(h.jumps, [h.logs[1]]);
  assert.equal(h.document.activeElement, h.logs[1]);
  assert.deepEqual(h.logs.map(log => log.value), ["17.5", "18.5"]);
});

test("selection follows the same exercise after reordering, and ignores a deleted exercise", () => {
  const h = fixture(); h.controller.toggle();
  const chosen = h.logs[1];
  const choice = h.overlay().querySelector('[data-workout-exercise-jump="1"]');
  h.panel.logs = [chosen, h.logs[0]];
  h.overlay().fire("click", { target: choice });
  assert.deepEqual(h.jumps, [chosen]);
  h.controller.toggle();
  const stale = h.overlay().querySelector('[data-workout-exercise-jump="0"]');
  h.panel.logs = [h.logs[0]];
  h.overlay().fire("click", { target: stale });
  assert.equal(h.jumps.length, 1);
  assert.equal(h.controller.isOpen(), false);
});

test("Escape and backdrop dismissal close the sheet; Escape does not collapse navigation", () => {
  const h = fixture(); h.controller.toggle();
  const event = h.document.fire("keydown", { key: "Escape" });
  assert.equal(event.prevented, true); assert.equal(event.stopped, true);
  assert.equal(h.controller.isOpen(), false); assert.equal(h.document.activeElement, h.tab);
  assert.equal(h.document.fire("keydown", { key: "Escape" }).stopped, false);
  h.controller.toggle();
  h.overlay().fire("click", { target: h.overlay().querySelector(".workout-exercise-dock-backdrop") });
  assert.equal(h.controller.isOpen(), false);
});

test("changing workout, leaving the page, or moving to desktop dismisses stale content", () => {
  for (const change of [h => { h.section.hidden = true; }, h => { h.panel.remove(); }, h => h.setMobile(false)]) {
    const h = fixture(); h.controller.toggle(); change(h); h.controller.refresh();
    assert.equal(h.controller.isOpen(), false);
    assert.equal(h.tab.classList.contains("has-exercise-list"), false);
  }
});

test("empty workouts still open a dismissible sheet, and outside focus remains untouched", () => {
  const h = fixture({ count: 0 }); h.controller.toggle();
  assert.equal(h.document.activeElement.className, "workout-exercise-dock-close");
  h.section.focus(); h.document.fire("focusin", { target: h.section });
  assert.equal(h.controller.isOpen(), false);
  assert.equal(h.document.activeElement, h.section);
  h.controller.toggle(); h.controller.destroy();
  assert.equal(h.controller.isOpen(), false);
});
