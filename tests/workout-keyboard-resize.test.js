const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../js/client-portal.js"), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Expected ${name} to exist`);
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}

function fixture() {
  const customPanels = [{ id: "custom-a" }, { id: "custom-b" }];
  const groupedCarousels = ["custom", "assigned"].flatMap((owner) => (
    ["single", "superset", "circuit"].map((format) => ({
      id: `${owner}-${format}`,
      dataset: { customWorkoutCarousel: "", customWorkoutGrouped: "true", customWorkoutFormat: format },
      fields: [{ value: "17.5", connected: true }, { value: "12", connected: true }]
    }))
  ));
  const legacyCarousels = [
    { id: "legacy-custom", dataset: { customWorkoutCarousel: "", activeIndex: "2" } },
    { id: "legacy-assigned", dataset: { customWorkoutCarousel: "", activeIndex: "0" } },
    { id: "legacy-default", dataset: { customWorkoutCarousel: "", customWorkoutGrouped: "false" } }
  ];
  const syncedPanels = [];
  const rendered = [];
  const moved = [];
  const listeners = [];
  const window = {
    innerWidth: 390,
    innerHeight: 844,
    addEventListener(type, handler) {
      assert.equal(type, "resize");
      listeners.push(handler);
    }
  };
  const document = {
    activeElement: groupedCarousels.find((carousel) => carousel.id === "assigned-superset").fields[0],
    querySelectorAll(selector) {
      if (selector === ".client-workout-panel-custom") return customPanels;
      if (selector === '[data-custom-workout-carousel]:not([data-custom-workout-grouped="true"])') {
        return [...groupedCarousels, ...legacyCarousels]
          .filter((carousel) => carousel.dataset.customWorkoutGrouped !== "true");
      }
      assert.fail(`Unexpected selector: ${selector}`);
    }
  };
  const context = vm.createContext({
    window,
    document,
    syncCustomWorkoutCarousel(panel) { syncedPanels.push(panel); },
    syncAssignedWorkoutCarousels() { assert.fail("Resize must not rebuild assigned workout cards"); },
    renderCustomWorkoutCarousel(carousel) {
      rendered.push(carousel);
      // Rebuilding a grouped card replaces its input nodes and loses focus.
      carousel.fields?.forEach((field) => {
        field.connected = false;
        if (document.activeElement === field) document.activeElement = null;
      });
    },
    moveCustomWorkoutCarousel(carousel, activeIndex, options) {
      moved.push({ carousel, activeIndex, instant: options.instant });
    }
  });
  vm.runInContext(functionSource("syncCustomWorkoutCarousels"), context);
  return {
    context, window, document, customPanels, groupedCarousels, legacyCarousels,
    syncedPanels, rendered, moved, listeners,
    resize(width, height) {
      window.innerWidth = width;
      window.innerHeight = height;
      listeners.forEach((listener) => listener());
    }
  };
}

test("keyboard height changes keep assigned weight and reps fields mounted and focused", () => {
  const scene = fixture();
  scene.context.syncCustomWorkoutCarousels();
  const originalField = scene.document.activeElement;
  const initialSyncCount = scene.syncedPanels.length;

  for (const height of [430, 500, 844]) scene.resize(390, height);

  assert.equal(scene.document.activeElement, originalField);
  assert.equal(originalField.connected, true);
  assert.equal(originalField.value, "17.5");
  assert.equal(scene.syncedPanels.length, initialSyncCount);
  assert.equal(scene.rendered.length, 0);
  assert.equal(scene.moved.length, 0);
  for (const carousel of scene.groupedCarousels) {
    assert.deepEqual(carousel.fields.map((field) => field.value), ["17.5", "12"]);
    assert.ok(carousel.fields.every((field) => field.connected));
  }
});

test("width changes reposition legacy decks while leaving all grouped workout formats intact", () => {
  const scene = fixture();
  scene.context.syncCustomWorkoutCarousels();
  const originalField = scene.document.activeElement;
  scene.resize(844, 390);

  assert.deepEqual(scene.rendered, scene.legacyCarousels);
  assert.deepEqual(scene.moved.map((move) => move.carousel), scene.legacyCarousels);
  assert.deepEqual(scene.moved.map((move) => move.activeIndex), [2, 0, 0]);
  assert.ok(scene.moved.every((move) => move.instant === true));
  assert.equal(scene.syncedPanels.length, scene.customPanels.length);
  assert.equal(scene.document.activeElement, originalField);
  assert.ok(scene.groupedCarousels.every((carousel) => carousel.fields.every((field) => field.connected)));
});

test("the recorded width updates so later height-only events do not reflow legacy decks", () => {
  const scene = fixture();
  scene.context.syncCustomWorkoutCarousels();
  scene.resize(768, 844);
  const renderedAfterWidthChange = scene.rendered.length;
  scene.resize(768, 430);
  scene.resize(768, 844);
  assert.equal(scene.rendered.length, renderedAfterWidthChange);
  assert.equal(scene.moved.length, renderedAfterWidthChange);

  scene.resize(1024, 768);
  assert.equal(scene.rendered.length, scene.legacyCarousels.length * 2);
  assert.equal(scene.moved.length, scene.legacyCarousels.length * 2);
});

test("repeated initialization still syncs custom panels but binds only one resize listener", () => {
  const scene = fixture();
  scene.context.syncCustomWorkoutCarousels();
  scene.context.syncCustomWorkoutCarousels();
  scene.context.syncCustomWorkoutCarousels();
  assert.equal(scene.listeners.length, 1);
  assert.deepEqual(scene.syncedPanels, [...scene.customPanels, ...scene.customPanels, ...scene.customPanels]);

  scene.resize(844, 390);
  assert.equal(scene.rendered.length, scene.legacyCarousels.length);
  assert.equal(scene.moved.length, scene.legacyCarousels.length);
});
