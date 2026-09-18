const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "client-dashboard.html"), "utf8");
const portal = fs.readFileSync(path.join(root, "js/client-portal.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "css/style.css"), "utf8");
const mobileStyles = fs.readFileSync(path.join(root, "css/custom-workout-mobile-fix.css"), "utf8");

function sourceForFunction(name) {
  const start = portal.indexOf(`function ${name}(`);
  const end = portal.indexOf("\nfunction ", start + 1);

  assert.ok(start >= 0, `Expected ${name} to exist`);
  return portal.slice(start, end >= 0 ? end : undefined);
}

test("straight-set custom cards expose compact Superset and Circuit checkboxes", () => {
  const optionsMarkup = sourceForFunction("customWorkoutInlineGroupOptionsMarkup");
  const cardMarkup = sourceForFunction("customWorkoutCardMarkup");

  assert.match(optionsMarkup, /data-custom-workout-inline-group-option="superset"/);
  assert.match(optionsMarkup, /<span>Superset<\/span>/);
  assert.match(optionsMarkup, /data-custom-workout-inline-group-option="circuit"/);
  assert.match(optionsMarkup, /<span>Circuit<\/span>/);
  assert.match(optionsMarkup, /isVisible \? "" : "hidden"/);
  assert.match(cardMarkup, /panelFormat === "single"/);
  assert.match(cardMarkup, /customWorkoutInlineGroupOptionsMarkup\(cardFormat, panelFormat === "single"\)/);
  assert.match(styles, /\.custom-workout-inline-group-options input\s*\{[^}]*width:\s*16px\s*!important;[^}]*height:\s*16px\s*!important;/s);
  assert.match(styles, /\.custom-workout-inline-group-options label\s*\{[^}]*min-height:\s*44px;/s);
  assert.match(styles, /\.custom-workout-inline-group-options label\s*\{[^}]*white-space:\s*nowrap;/s);
});

test("mixed grouping leaves ordinary exercises straight and isolates selected groups", () => {
  const normalizeSource = sourceForFunction("normalizeCustomWorkoutInlineGroupType");
  const groupingSource = sourceForFunction("customWorkoutMixedGroups");
  const groupItems = Function(
    `${normalizeSource}; ${groupingSource}; return customWorkoutMixedGroups;`
  )();
  const plan = groupItems([
    { name: "Squat", groupType: "single", group: 0 },
    { name: "Press", groupType: "superset", group: 0 },
    { name: "Row", groupType: "superset", group: 0 },
    { name: "Curl", groupType: "single", group: 0 },
    { name: "Carry", groupType: "circuit", group: 1 },
    { name: "Bike", groupType: "circuit", group: 1 },
    { name: "Plank", groupType: "circuit", group: 1 }
  ]);

  assert.deepEqual(plan.map((group) => group.format), ["single", "superset", "single", "circuit"]);
  assert.deepEqual(plan.map((group) => group.items.map((item) => item.name)), [
    ["Squat"],
    ["Press", "Row"],
    ["Curl"],
    ["Carry", "Bike", "Plank"]
  ]);
  const singletonFallback = groupItems([
    { name: "Squat", groupType: "single", group: 0 },
    { name: "Press", groupType: "superset", group: 4 },
    { name: "Row", groupType: "single", group: 0 }
  ]);
  assert.deepEqual(singletonFallback.map((group) => group.format), ["single", "single", "single"]);
  assert.deepEqual(singletonFallback.map((group) => group.items.map((item) => item.name)), [
    ["Squat"],
    ["Press"],
    ["Row"]
  ]);
  assert.deepEqual(groupItems([
    { name: "Squat" },
    { name: "Press" },
    { name: "Row" },
    { name: "Curl" }
  ]).map((group) => group.items.map((item) => item.name)), [
    ["Squat"],
    ["Press"],
    ["Row"],
    ["Curl"]
  ]);
});

test("checkbox changes are mutually exclusive, reversible, and saved in the draft", () => {
  const updateSource = sourceForFunction("updateCustomWorkoutInlineGrouping");
  const markerSource = sourceForFunction("syncCustomWorkoutFormatMarkers");
  const serializeSource = sourceForFunction("serializeCustomExerciseDraft");

  assert.match(updateSource, /panelFormat !== "single"/);
  assert.match(updateSource, /clearCustomWorkoutInlineGroup\(cards, card\)/);
  assert.match(updateSource, /appendInlineGroupingPartner\(panel\)/);
  assert.match(updateSource, /adjacentCircuit/);
  assert.match(updateSource, /persistCustomWorkoutDraftFromPanel\(panel\)/);
  assert.match(markerSource, /input\.checked = input\.dataset\.customWorkoutInlineGroupOption === format/);
  assert.match(serializeSource, /groupType:\s*normalizeCustomWorkoutInlineGroupType/);
  assert.match(portal, /handleCustomWorkoutInlineGrouping\(\);/);
});

test("mixed supersets and circuits can return to straight sets without dropping field values", () => {
  const groupedMarkup = sourceForFunction("customWorkoutGroupedRoundCardMarkup");
  const returnToStraight = sourceForFunction("returnCustomWorkoutInlineGroupToStraight");
  const interactions = sourceForFunction("handleWorkoutInteractions");

  assert.match(groupedMarkup, /panelFormat === "single"/);
  assert.match(groupedMarkup, /data-custom-grouped-return-straight/);
  assert.match(groupedMarkup, /Return to straight sets/);
  assert.match(returnToStraight, /querySelectorAll\("\[data-custom-grouped-field\]"\)/);
  assert.match(returnToStraight, /syncCustomWorkoutGroupedField/);
  assert.match(returnToStraight, /if \(!fieldsSynced\) return false/);
  assert.match(returnToStraight, /clearCustomWorkoutInlineGroup/);
  assert.match(returnToStraight, /delete logElement\.dataset\.groupedRoundMode/);
  assert.match(returnToStraight, /delete row\.dataset\.groupedRoundRequired/);
  assert.match(returnToStraight, /syncCustomWorkoutCarousel/);
  assert.match(returnToStraight, /persistCustomWorkoutDraftFromPanel/);
  assert.match(interactions, /data-custom-grouped-return-straight/);
  assert.match(interactions, /returnCustomWorkoutInlineGroupToStraight/);
  assert.match(
    mobileStyles,
    /\.custom-workout-grouped-mode-actions button\s*\{[^}]*min-height:\s*44px;[^}]*touch-action:\s*manipulation;/s,
  );

  const rows = [{ dataset: { groupedRoundRequired: "true", customGroupedReopened: "true" } }];
  const logs = [{
    dataset: { groupedRoundMode: "true", groupLoggedSets: "0" },
    querySelectorAll: () => rows,
  }];
  const card = (focusable) => ({
    dataset: { customWorkoutGroupType: "superset", customWorkoutGroup: "0" },
    inert: true,
    removeAttribute() {},
    querySelector: () => focusable ? { focus() {} } : null,
    querySelectorAll: () => logs,
  });
  const cards = [card(true), card(false)];
  const fields = [{ value: "0" }, { value: "12" }];
  let synced = 0;
  let regrouped = false;
  let persisted = false;
  const panel = {
    dataset: { customWorkoutFormat: "single" },
    querySelectorAll: () => cards,
  };
  const carousel = {
    closest: () => panel,
    querySelectorAll: () => fields,
  };
  const button = { closest: () => carousel };
  const returnToStraightApi = Function(
    "normalizeCustomWorkoutFormat",
    "activeCustomWorkoutFormat",
    "customWorkoutCarouselCards",
    "syncCustomWorkoutGroupedField",
    "clearCustomWorkoutInlineGroup",
    "syncCustomWorkoutCarousel",
    "syncCustomWorkoutFormatMarkers",
    "persistCustomWorkoutDraftFromPanel",
    "updateVisibleSetProgress",
    "window",
    `${returnToStraight}; return returnCustomWorkoutInlineGroupToStraight;`,
  )(
    (value) => value,
    "single",
    () => cards,
    (field) => { synced += 1; return field.value === "0" || field.value === "12"; },
    (_allCards, focusCard) => {
      const groupType = focusCard.dataset.customWorkoutGroupType;
      const groupIndex = focusCard.dataset.customWorkoutGroup;
      cards.forEach((card) => {
      if (card.dataset.customWorkoutGroupType === groupType && card.dataset.customWorkoutGroup === groupIndex) {
        card.dataset.customWorkoutGroupType = "single";
        card.dataset.customWorkoutGroup = "0";
      }
      });
    },
    () => { regrouped = true; },
    () => {},
    () => { persisted = true; },
    () => {},
    { requestAnimationFrame: (callback) => callback() },
  );

  assert.equal(returnToStraightApi(button), true);
  assert.equal(synced, 2);
  assert.equal(regrouped, true);
  assert.equal(persisted, true);
  assert.deepEqual(cards.map((card) => card.dataset.customWorkoutGroupType), ["single", "single"]);
  assert.ok(cards.every((card) => card.inert === false));
  assert.equal(logs[0].dataset.groupedRoundMode, undefined);
  assert.equal(logs[0].dataset.groupLoggedSets, undefined);
  assert.equal(rows[0].dataset.groupedRoundRequired, undefined);
  assert.equal(rows[0].dataset.customGroupedReopened, undefined);
});

test("mixed groups reuse the existing mobile carousel and keep one add-card endpoint", () => {
  const carouselMarkup = sourceForFunction("customWorkoutCarouselMarkup");
  const regroupSource = sourceForFunction("regroupCustomWorkoutCarousels");
  const renderSource = sourceForFunction("renderCustomWorkoutCarousel");

  assert.match(carouselMarkup, /customWorkoutMixedGroups\(exercises\)/);
  assert.match(carouselMarkup, /groupFormat === "single" && index === groups\.length - 1/);
  assert.match(regroupSource, /existing\[groupIndex\]\.dataset\.customWorkoutFormat === group\.format/);
  assert.match(regroupSource, /panelFormat:\s*format/);
  assert.match(renderSource, /customWorkoutInlineAdd !== "false"/);
  assert.match(dashboard, /css\/style\.css\?v=client-notification-settings-1/);
  assert.match(dashboard, /js\/client-portal\.js\?v=history-suggestions-1/);
});
