const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const source = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf("\nfunction ", start + 1);
  assert.ok(start >= 0, `${name} exists`);
  return source.slice(start, end < 0 ? undefined : end);
}

function node(tagName) {
  return {
    tagName,
    children: [],
    textContent: "",
    className: "",
    append(...children) { this.children.push(...children); },
    replaceChildren(...children) { this.children = children; }
  };
}

test("Progress starts with an inline measurement preview and a direct stats control", () => {
  const progress = html.match(/<section class="progress-panel" data-client-dashboard-panel="progress"[\s\S]*?<section class="progress-panel client-stats-panel"/)?.[0] || "";
  assert.ok(progress.indexOf('id="client-progress-preview-values"') < progress.indexOf('id="client-exercise-progress-title"'));
  assert.match(progress, /data-client-progress-stats-open aria-controls="client-stats-panel">View all stats &amp; measurements/);
  assert.match(html, /data-client-dashboard-panel="stats" id="client-stats-panel"/);
});

test("preview uses the latest saved value for each metric and handles empty history", () => {
  const preview = node("div");
  const context = vm.createContext({
    document: {
      getElementById(id) { return id === "client-progress-preview-values" ? preview : null; },
      createElement: node
    },
    progressMeasurements(entry) { return entry.measurements || {}; }
  });
  for (const name of ["clientHomeSnapshotValue", "latestClientProgressValue", "clientProgressPreviewItems", "renderClientProgressPreview"]) {
    vm.runInContext(functionSource(name), context);
  }
  context.renderClientProgressPreview([
    { bodyweight: 180, bodyfat: 18.4, lean_mass: 145, measurements: { waist: 34 } },
    { bodyweight: 178, measurements: { waist: 33.5 } }
  ]);
  const values = preview.children[0].children.map((item) => [item.children[0].textContent, item.children[1].textContent]);
  assert.deepEqual(values, [
    ["Bodyweight", "178 lb"],
    ["Body fat", "18.4%"],
    ["Lean mass", "145 lb"],
    ["Waist", "33.5 in"]
  ]);

  context.renderClientProgressPreview([]);
  assert.match(preview.children[0].textContent, /No measurements saved yet/);
});

test("tapping active Progress again stays on Progress without a modal", () => {
  let clickHandler;
  const destinations = [];
  const tab = {
    dataset: { clientDashboardTab: "progress" },
    closest() { return { classList: { contains() { return true; } } }; }
  };
  const context = vm.createContext({
    document: { addEventListener(_event, handler) { clickHandler = handler; } },
    window: { matchMedia() { return { matches: true }; } },
    activeClientDashboardTab: "progress",
    lastClientDashboardMobileTabPress: "progress",
    clientDashboardMobileTabPressAction() { return { nextTabPress: "progress" }; },
    setClientDashboardTab(name) { destinations.push(name); }
  });
  vm.runInContext(functionSource("handleClientDashboardTabs"), context);
  context.handleClientDashboardTabs();
  clickHandler({ target: { closest(selector) { return selector === "[data-client-dashboard-tab]" ? tab : null; } } });
  assert.deepEqual(destinations, ["progress"]);
  assert.doesNotMatch(functionSource("handleClientDashboardTabs"), /showClientProgressSnapshot|showModal/);
});

test("preview button opens the full measurements panel and moves focus to its title", () => {
  let clickHandler;
  let focused = false;
  let scrolled = false;
  const destinations = [];
  const panel = {
    scrollIntoView() { scrolled = true; },
    querySelector() { return { focus() { focused = true; } }; }
  };
  const context = vm.createContext({
    document: {
      addEventListener(_event, handler) { clickHandler = handler; },
      querySelector(selector) { return selector === '[data-client-dashboard-panel="stats"]' ? panel : null; }
    },
    setClientDashboardTab(name) { destinations.push(name); }
  });
  vm.runInContext(functionSource("handleClientDashboardTabs"), context);
  context.handleClientDashboardTabs();
  clickHandler({ target: { closest(selector) { return selector === "[data-client-progress-stats-open]" ? {} : null; } } });
  assert.deepEqual(destinations, ["stats"]);
  assert.equal(scrolled, true);
  assert.equal(focused, true);
});
