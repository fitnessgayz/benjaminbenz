const test = require("node:test");
const assert = require("node:assert/strict");
const { createController } = require("../js/workout-exercise-dock.js");

function fixture({ mobile = true, selected = true, count = 2, grouped = false } = {}) {
  let document;
  function node(classes = "", attributes = {}, tag = "div") {
    const classNames = new Set(classes.split(" ").filter(Boolean));
    const attrs = new Map(Object.entries(attributes));
    const listeners = new Map();
    let clickCount = 0;
    const element = {
      children: [], parentNode: null, hidden: false, dataset: {}, value: "",
      tagName: tag.toUpperCase(), dispatched: [],
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
        if (/^[a-z]+$/.test(selector)) return selector === tag;
        const parts = [...selector.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
        return Boolean(parts.length && parts.map(part => part[0]).join("") === selector && parts.every(part =>
          attrs.has(part[1]) && (part[2] === undefined || attrs.get(part[1]) === part[2])));
      },
      querySelector(selector) {
        if (selector.includes(",")) {
          return selector.split(",").map((part) => element.querySelector(part.trim())).find(Boolean) || null;
        }
        for (const child of element.children) {
          if (child.matches(selector)) return child;
          const nested = child.querySelector(selector);
          if (nested) return nested;
        }
        return null;
      },
      closest(selector) { return element.matches(selector) ? element : element.parentNode?.closest(selector) || null; },
      cloneNode(deep) {
        const copy = node(element.className, Object.fromEntries(attrs), tag);
        copy.dataset = { ...element.dataset }; copy.hidden = element.hidden;
        if (deep) copy.append(...element.children.map(child => child.cloneNode(true)));
        return copy;
      },
      focus() { document.activeElement = element; },
      click() { clickCount++; },
      dispatchEvent(event) { element.dispatched.push(event.type); },
      get clickCount() { return clickCount; },
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
  const add = node("", { "data-workout-exercise-add": "" });
  const assignedAdd = node("", { "data-add-assigned-exercise": "" });
  const finish = node("", { "data-workout-finish": "" });
  const groupedFinish = grouped ? node("", { "data-custom-grouped-finish-workout": "" }) : null;
  const logs = Array.from({ length: count }, (_, i) => {
    const log = node(); log.value = `${17.5 + i}`;
    const name = node("", { "data-exercise-name-input": "" }, "input");
    name.value = `Exercise ${i + 1}`;
    log.append(name);
    return log;
  });
  panel.logs = logs;
  body.append(content, navigation); content.append(section); section.append(panel);
  panel.append(list, assignedAdd, finish, ...(groupedFinish ? [groupedFinish] : []), ...logs);
  list.append(add); navigation.append(tab);
  document = node();
  document.body = body;
  document.querySelector = selector => body.querySelector(selector);
  document.getElementById = id => id === "dashboard-content" ? content : null;
  document.createElement = tag => node("", {}, tag);
  const window = node();
  window.innerHeight = 800;
  window.matchMedia = () => ({ matches: mobile });
  window.MutationObserver = class { observe() {} disconnect() {} };
  window.Event = class { constructor(type) { this.type = type; } };
  window.setTimeout = callback => callback();
  const jumps = [];
  const syncList = () => {
    [...list.children].filter(child => child !== add).forEach(child => child.remove());
    list.append(...panel.logs.map((_, i) => {
      const button = node("", { "data-workout-exercise-jump": String(i) });
      button.dataset.workoutExerciseJump = String(i);
      const move = node("", { "data-custom-exercise-move": "down", "data-custom-exercise-index": String(i) }, "button");
      move.dataset.customExerciseIndex = String(i);
      const rename = node("", { "data-workout-exercise-rename": String(i) }, "button");
      rename.dataset.workoutExerciseRename = String(i);
      const editor = node("", { "data-workout-exercise-rename-editor": String(i) });
      editor.hidden = true;
      const input = node("", {}, "input");
      const save = node("", { "data-workout-exercise-rename-save": String(i) }, "button");
      save.dataset.workoutExerciseRenameSave = String(i);
      const cancel = node("", { "data-workout-exercise-rename-cancel": String(i) }, "button");
      cancel.dataset.workoutExerciseRenameCancel = String(i);
      editor.append(input, save, cancel);
      list.append(move, rename, editor);
      return button;
    }));
  };
  syncList();
  const controller = createController({ document, window,
    getLogs: source => source.logs, syncList,
    jump(button) { jumps.push(panel.logs[Number(button.dataset.workoutExerciseJump)]); jumps.at(-1).focus(); }
  });
  return { body, content, section, panel, tab, list, add, assignedAdd, finish, groupedFinish, logs, document, window, jumps, controller,
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

test("open shows the exercise list without closing an already open list", () => {
  const h = fixture();
  assert.equal(h.controller.open(), true);
  const overlay = h.overlay();
  assert.ok(overlay);
  assert.equal(h.controller.open(), true);
  assert.equal(h.overlay(), overlay);
  assert.equal(h.controller.isOpen(), true);
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

test("Finish workout closes the list and uses the active workout's existing finish flow", () => {
  for (const grouped of [false, true]) {
    const h = fixture({ grouped });
    h.controller.toggle();
    const button = h.overlay().querySelector("[data-workout-exercise-finish]");
    assert.ok(button);
    const event = h.overlay().fire("click", { target: button });
    assert.equal(event.stopped, true);
    assert.equal(h.overlay(), null);
    assert.equal(h.finish.clickCount, grouped ? 0 : 1);
    assert.equal(h.groupedFinish?.clickCount ?? 0, grouped ? 1 : 0);
  }
});

test("Add exercise in the mobile sheet closes it and invokes the active workout editor", () => {
  const h = fixture(); h.controller.toggle();
  const choice = h.overlay().querySelector("[data-workout-exercise-add]");
  const event = h.overlay().fire("click", { target: choice });
  assert.equal(event.stopped, true);
  assert.equal(h.overlay(), null);
  assert.equal(h.assignedAdd.clickCount, 1);
});

test("organization controls in the sheet operate on the live workout", () => {
  const h = fixture(); h.controller.toggle();
  const original = h.list.querySelector('[data-custom-exercise-move="down"][data-custom-exercise-index="0"]');
  const copied = h.overlay().querySelector('[data-custom-exercise-move="down"][data-custom-exercise-index="0"]');
  h.overlay().fire("click", { target: copied });
  assert.equal(original.clickCount, 1);
  assert.equal(h.controller.isOpen(), true);
});

test("editing a name in the sheet updates the live exercise input", () => {
  const h = fixture(); h.controller.toggle();
  const overlay = h.overlay();
  overlay.fire("click", { target: overlay.querySelector('[data-workout-exercise-rename="0"]') });
  const editor = overlay.querySelector('[data-workout-exercise-rename-editor="0"]');
  const input = editor.querySelector("input");
  assert.equal(editor.hidden, false);
  assert.equal(input.value, "Exercise 1");
  input.value = "Barbell Bench Press";
  overlay.fire("click", { target: editor.querySelector('[data-workout-exercise-rename-save="0"]') });
  const liveInput = h.logs[0].querySelector("[data-exercise-name-input]");
  assert.equal(liveInput.value, "Barbell Bench Press");
  assert.deepEqual(liveInput.dispatched, ["input", "change"]);
  assert.equal(h.controller.isOpen(), true);
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
