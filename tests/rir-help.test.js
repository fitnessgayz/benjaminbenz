const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const plain = (value) => JSON.parse(JSON.stringify(value));

function fixture() {
  const documentListeners = new Map();
  const dialogs = [];
  let document;

  function element(tagName = "button", attributes = {}) {
    const listeners = new Map();
    const attrs = new Map(Object.entries(attributes));
    const classes = new Set();
    const children = [];
    let html = "";
    const node = {
      tagName: tagName.toUpperCase(), dataset: {}, disabled: false, hidden: false,
      isConnected: true, parentElement: null, value: "", textContent: "", focusCount: 0,
      get children() { return children; },
      get innerHTML() { return html; },
      set innerHTML(value) {
        html = value;
        children.length = 0;
        const stack = [node];
        for (const match of value.matchAll(/<(\/?)([a-z][a-z0-9-]*)\b([^>]*)>/gi)) {
          if (match[1]) {
            const index = stack.findLastIndex((parent) => parent.tagName.toLowerCase() === match[2]);
            if (index > 0) stack.length = index;
            continue;
          }
          const childAttributes = {};
          for (const attribute of match[3].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) childAttributes[attribute[1]] = attribute[2] ?? "";
          const child = element(match[2], childAttributes);
          stack.at(-1).append(child);
          if (!/^(input|br|hr|img|link|meta)$/.test(match[2]) && !match[3].trimEnd().endsWith("/")) stack.push(child);
        }
      },
      listeners,
      classList: {
        add: (name) => classes.add(name), remove: (name) => classes.delete(name),
        contains: (name) => classes.has(name),
        toggle(name, force) { if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name); }
      },
      setAttribute(name, value) { attrs.set(name, String(value)); },
      getAttribute: (name) => attrs.get(name) ?? null,
      hasAttribute: (name) => attrs.has(name),
      removeAttribute: (name) => attrs.delete(name),
      matches(selector) {
        if (selector === "button:not([disabled])") return node.tagName === "BUTTON" && !node.disabled;
        if (selector === "[hidden]") return node.hidden || attrs.has("hidden");
        if (selector.startsWith("#")) return attrs.get("id") === selector.slice(1);
        if (selector.startsWith(".")) return (attrs.get("class") || "").split(/\s+/).includes(selector.slice(1));
        const attr = selector.match(/^\[([^=\]]+)(?:=["']([^"']*)["'])?\]$/);
        return attr ? attrs.has(attr[1]) && (attr[2] === undefined || attrs.get(attr[1]) === attr[2]) : node.tagName.toLowerCase() === selector;
      },
      closest(selector) {
        return node.matches(selector) ? node : node.parentElement?.closest(selector) || null;
      },
      contains(target) { return node === target || children.some((child) => child.contains(target)); },
      querySelectorAll(selector) {
        const selectors = selector.split(",").map((item) => item.trim());
        return children.flatMap((child) => [child, ...child.querySelectorAll("*")])
          .filter((child) => selector === "*" || selectors.some((item) => child.matches(item)));
      },
      querySelector(selector) { return node.querySelectorAll(selector)[0] || null; },
      append(...nodes) { for (const child of nodes) { child.parentElement = node; children.push(child); } },
      appendChild(child) { node.append(child); return child; },
      insertAdjacentHTML(_position, value) {
        const container = element("div");
        container.innerHTML = value;
        for (const child of [...container.children]) node.append(child);
      },
      addEventListener(type, listener) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(listener);
      },
      emit(type, extra = {}) {
        const event = { target: node, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
        for (const listener of listeners.get(type) || []) listener(event);
        return event;
      },
      getBoundingClientRect: () => ({ top: 100, left: 100, right: 500, bottom: 650, width: 400, height: 550 }),
      getClientRects: () => node.hidden || node.closest("[hidden]") ? [] : [node.getBoundingClientRect()],
      focus() { node.focusCount++; document.activeElement = node; },
      showModal() { node.open = true; },
      close() { if (node.open) { node.open = false; node.emit("close"); } }
    };
    for (const [name, value] of Object.entries(attributes)) {
      if (name.startsWith("data-")) node.dataset[name.slice(5).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
    }
    if (tagName === "dialog") dialogs.push(node);
    return node;
  }

  const body = element("body");
  document = {
    body, readyState: "complete", activeElement: null,
    createElement: element,
    contains: (node) => node.isConnected,
    querySelector: (selector) => body.querySelector(selector),
    querySelectorAll: (selector) => body.querySelectorAll(selector),
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    },
    emit(type, extra = {}) {
      const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
      for (const listener of documentListeners.get(type) || []) listener(event);
      return event;
    }
  };
  const context = vm.createContext({ window: {}, document, console });
  vm.runInContext(fs.readFileSync(path.join(root, "js/rir-help.js"), "utf8"), context);
  const api = context.window.FWBRirHelp;

  function trigger({ format = "superset", warmup = false, legacy = false } = {}) {
    const panel = element("section");
    const carousel = legacy ? panel : element("div", { "data-custom-workout-grouped": "true", "data-custom-workout-format": format });
    const section = element("section", { "data-kind": warmup ? "warmup" : "round" });
    const button = element("button", { "data-rir-help": "", "type": "button" });
    const icon = element("span");
    body.append(panel);
    if (!legacy) panel.append(carousel);
    carousel.append(section);
    section.append(button);
    button.append(icon);
    return { button, icon, section, carousel, panel };
  }
  return { api, document, body, dialogs, documentListeners, trigger, element };
}

test("RIR help identifies warm-ups, straight sets, grouped rounds, and legacy picker actions", () => {
  const h = fixture();
  for (const format of ["single", "superset", "circuit"]) {
    for (const warmup of [true, false]) {
      const { button } = h.trigger({ format, warmup });
      assert.deepEqual(plain(h.api.helpContext(button)), {
        maxValue: 5, usesPicker: false,
        action: warmup ? "Log warm-up" : format === "single" ? "Log set" : "Log round"
      });
    }
  }
  assert.deepEqual(plain(h.api.helpContext(h.trigger({ legacy: true }).button)), {
    maxValue: 4, usesPicker: true, action: "Save RIR"
  });
});

test("help initializes once, opens from nested trigger content, and reuses one lazy dialog", () => {
  const h = fixture();
  h.api.initialize();
  h.api.initialize();
  assert.equal(h.dialogs.length, 0);
  assert.equal(h.documentListeners.get("click")?.length, 1);
  const first = h.trigger();
  h.document.emit("click", { target: first.icon });
  assert.equal(h.dialogs.length, 1);
  const dialog = h.dialogs[0];
  assert.equal(dialog.open, true);
  assert.equal(h.document.activeElement, dialog.querySelector("[data-rir-help-close]"));
  assert.equal(h.body.classList.contains("rir-help-open"), true);
  h.api.close();
  assert.equal(h.document.activeElement, first.button);
  h.document.emit("click", { target: h.trigger({ format: "single" }).button });
  assert.equal(h.dialogs.length, 1);
  assert.equal(dialog.open, true);
});

test("disabled triggers and ordinary numeric field clicks leave the workout alone", () => {
  const h = fixture();
  h.api.initialize();
  const disabled = h.trigger().button;
  disabled.disabled = true;
  h.document.emit("click", { target: disabled });
  const input = h.element("input", { type: "number", "data-custom-grouped-field": "rir" });
  input.value = "2";
  h.document.emit("click", { target: input });
  assert.equal(h.dialogs.length, 0);
  assert.equal(input.value, "2");
  assert.equal(h.documentListeners.has("input"), false);
  assert.equal(h.documentListeners.has("change"), false);
});

test("opening another help trigger while the dialog is open keeps the original context and focus return", () => {
  const h = fixture();
  const first = h.trigger({ warmup: true });
  const second = h.trigger({ legacy: true });
  h.api.open(first.button);
  const dialog = h.dialogs[0];
  const before = dialog.querySelector("[data-rir-help-next]").innerHTML;
  h.api.open(second.button);
  assert.equal(dialog.querySelector("[data-rir-help-next]").innerHTML, before);
  h.api.close();
  assert.equal(first.button.focusCount, 1);
  assert.equal(second.button.focusCount, 0);
});

test("native Escape cancellation closes help and restores focus without changing any entered values", () => {
  const h = fixture();
  const entry = h.trigger();
  const inputs = ["20", "10", "2"].map((value) => {
    const input = h.element("input", { type: "number" });
    input.value = value;
    entry.section.append(input);
    return input;
  });
  entry.carousel.dataset.roundLogged = "false";
  h.api.open(entry.button);
  const event = h.dialogs[0].emit("cancel");
  assert.equal(event.defaultPrevented, true);
  assert.equal(h.dialogs[0].open, false);
  assert.equal(h.body.classList.contains("rir-help-open"), false);
  assert.equal(h.document.activeElement, entry.button);
  assert.deepEqual(inputs.map((input) => input.value), ["20", "10", "2"]);
  assert.equal(entry.carousel.dataset.roundLogged, "false");
});

test("dialog padding and content clicks stay open while a real outside backdrop click closes", () => {
  const h = fixture();
  const { button } = h.trigger();
  h.api.open(button);
  const dialog = h.dialogs[0];
  dialog.emit("click", { clientX: 110, clientY: 110 });
  assert.equal(dialog.open, true);
  dialog.emit("click", { target: dialog.querySelector("[data-rir-help-scale]"), clientX: 50, clientY: 50 });
  assert.equal(dialog.open, true);
  dialog.emit("click", { clientX: 50, clientY: 50 });
  assert.equal(dialog.open, false);
  assert.equal(h.document.activeElement, button);
});

test("closing help does not focus a disconnected, hidden, or disabled original trigger", () => {
  for (const invalidation of [
    (entry) => { entry.button.isConnected = false; },
    (entry) => { entry.button.hidden = true; },
    (entry) => { entry.section.hidden = true; },
    (entry) => { entry.button.disabled = true; }
  ]) {
    const h = fixture();
    const entry = h.trigger();
    h.api.open(entry.button);
    invalidation(entry);
    h.api.close();
    assert.equal(entry.button.focusCount, 0);
    h.api.close();
    assert.equal(entry.button.focusCount, 0, "Repeated close cannot restore a stale trigger");
  }
});

test("help explains extra good-form reps with an accessible native dialog and no rating selection", () => {
  const h = fixture();
  const markup = h.api.markup();
  assert.match(markup, /RIR means reps in reserve/);
  assert.match(markup, /how many more reps[\s\S]*good form/);
  assert.match(markup, /8 reps[\s\S]*2 more[\s\S]*2 RIR/);
  assert.match(markup, /RIR is optional/);
  h.api.open(h.trigger().button);
  const dialog = h.dialogs[0];
  assert.equal(dialog.tagName, "DIALOG");
  assert.ok(dialog.querySelector(`#${dialog.getAttribute("aria-labelledby")}`));
  assert.ok(dialog.querySelector(`#${dialog.getAttribute("aria-describedby")}`));
  assert.equal(dialog.querySelectorAll("input, select, textarea").length, 0);
  assert.equal(dialog.querySelectorAll('[role="radio"], [data-rir-option]').length, 0);
  assert.equal(dialog.querySelectorAll("[data-rir-help-close]").length, 2);
});

test("help displays the available RIR scale and the correct next action without entering a rating", () => {
  for (const options of [{ warmup: true }, { format: "single" }, { format: "circuit" }, { legacy: true }]) {
    const h = fixture();
    const { button } = h.trigger(options);
    const context = h.api.helpContext(button);
    assert.equal(h.api.open(button), true);
    const dialog = h.dialogs[0];
    const scale = dialog.querySelector("[data-rir-help-scale]");
    const steps = dialog.querySelector("[data-rir-help-next]");
    const expected = Array.from({ length: context.maxValue + 1 }, (_value, index) => `${index}${index === context.maxValue ? "+" : ""}`);
    assert.deepEqual([...scale.innerHTML.matchAll(/<strong>([^<]*)<\/strong>/g)].map((match) => match[1]), expected);
    assert.match(scale.innerHTML, /No reps left/);
    assert.ok(steps.innerHTML.includes(`Tap ${context.action}`));
    if (context.usesPicker) {
      assert.match(steps.innerHTML, /tap its RIR box and choose/);
      assert.doesNotMatch(steps.innerHTML, /enter 0–5/);
    } else {
      assert.match(steps.innerHTML, /enter 0–5 in its RIR field/);
      assert.match(steps.innerHTML, /Use 5 for five or more reps left/);
    }
    assert.equal(scale.querySelectorAll("button, input, select").length, 0);
  }
});

test("both close buttons dismiss help and return focus to the opening label", () => {
  for (const index of [0, 1]) {
    const h = fixture();
    const { button } = h.trigger();
    h.api.open(button);
    const dialog = h.dialogs[0];
    dialog.emit("click", { target: dialog.querySelectorAll("[data-rir-help-close]")[index] });
    assert.equal(dialog.open, false);
    assert.equal(h.document.activeElement, button);
  }
});

test("Tab and Shift-Tab wrap between dialog controls while ordinary keys retain native behavior", () => {
  const h = fixture();
  h.api.open(h.trigger().button);
  const dialog = h.dialogs[0];
  const [first, last] = dialog.querySelectorAll("[data-rir-help-close]");
  first.focus();
  const back = dialog.emit("keydown", { key: "Tab", shiftKey: true });
  assert.equal(back.defaultPrevented, true);
  assert.equal(h.document.activeElement, last);
  const forward = dialog.emit("keydown", { key: "Tab", shiftKey: false });
  assert.equal(forward.defaultPrevented, true);
  assert.equal(h.document.activeElement, first);
  assert.equal(dialog.emit("keydown", { key: "Tab", shiftKey: false }).defaultPrevented, false);
  assert.equal(dialog.emit("keydown", { key: "ArrowDown" }).defaultPrevented, false);
});

test("a queued close event cannot steal focus or clear the current dialog state after reopening", () => {
  const h = fixture();
  const first = h.trigger().button;
  const second = h.trigger({ warmup: true }).button;
  h.api.open(first);
  h.api.close();
  h.api.open(second);
  const dialog = h.dialogs[0];
  dialog.emit("close");
  assert.equal(dialog.open, true);
  assert.equal(h.body.classList.contains("rir-help-open"), true);
  assert.equal(second.focusCount, 0);
  h.api.close();
  assert.equal(h.document.activeElement, second);
  assert.equal(second.focusCount, 1);
});

function portalFunctions(names, globals = {}) {
  const source = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
  const functions = names.map((name) => {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `${name} must exist`);
    const tail = source.slice(start);
    const next = tail.slice(1).search(/\n(?:async )?function /);
    return next < 0 ? tail : tail.slice(0, next + 1);
  });
  return vm.runInNewContext(`${functions.join("\n")}\n({${names.join(",")}})`, globals);
}

test("each grouped warm-up and working section has a keyboard-accessible RIR help label in every format", () => {
  const h = fixture();
  const logs = [{ name: "Squat", warmups: [{}], working: [{}, {}] }];
  const renderer = portalFunctions(["workoutSetUnit", "customWorkoutGroupedSectionsMarkup"], {
    warmUpSetType: "warm_up", workingSetType: "working",
    customWorkoutGroupedLogElements: () => logs,
    currentExerciseLabel: (log) => log.name,
    customWorkoutGroupedRows: (log, type) => type === "warm_up" ? log.warmups : log.working,
    customWorkoutGroupedRoundCount: () => 2,
    customWorkoutGroupedRoundIsLogged: () => false,
    customWorkoutGroupedSetRowMarkup: () => "",
    customWorkoutGroupedRoundCode: () => "A1"
  });
  for (const format of ["single", "superset", "circuit"]) {
    const group = h.element("div", { "data-custom-workout-grouped": "true", "data-custom-workout-format": format });
    group.innerHTML = renderer.customWorkoutGroupedSectionsMarkup(group);
    const buttons = group.querySelectorAll("[data-rir-help]");
    assert.equal(buttons.length, 3, "Warm-up and both working sections provide help");
    for (const button of buttons) {
      assert.equal(button.tagName, "BUTTON");
      assert.equal(button.getAttribute("type"), "button");
      assert.equal(button.getAttribute("aria-haspopup"), "dialog");
      assert.match(button.getAttribute("aria-label"), /RIR/);
      assert.equal(button.closest('[aria-hidden="true"]'), null);
    }
    assert.equal(h.api.helpContext(buttons[0]).action, "Log warm-up");
    assert.equal(h.api.helpContext(buttons[1]).action, format === "single" ? "Log set" : "Log round");
  }
});

test("legacy set headers also expose help while numeric grouped RIR fields remain editable", () => {
  const h = fixture();
  const renderer = portalFunctions(["exerciseLogFields", "customWorkoutGroupedFieldMarkup"], {
    escapeHtml: (value) => String(value ?? ""),
    setRows: () => ""
  });
  const legacy = h.element("div");
  legacy.innerHTML = renderer.exerciseLogFields({ code: "A1", name: "Squat" }, "Strength", { setCount: 2, showActions: false, showDemo: false });
  const header = legacy.querySelector(".set-header");
  const button = header.querySelector("[data-rir-help]");
  assert.ok(button);
  assert.equal(button.closest('[aria-hidden="true"]'), null);
  assert.equal(h.api.helpContext(button).usesPicker, true);
  const groupedField = h.element("div");
  groupedField.innerHTML = renderer.customWorkoutGroupedFieldMarkup("rir", "2", "Round 1, squat");
  const input = groupedField.querySelector("input");
  assert.equal(input.getAttribute("type"), "number");
  assert.equal(input.getAttribute("min"), "0");
  assert.equal(input.getAttribute("max"), "5");
  assert.equal(input.getAttribute("value"), "2");
  assert.equal(input.hasAttribute("readonly"), false);
  assert.equal(input.hasAttribute("disabled"), false);
  assert.equal(input.hasAttribute("data-rir-help"), false);
  const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
  assert.match(dashboard, /<script src="js\/rir-help\.js\?[^\"]*"><\/script>/);
});
