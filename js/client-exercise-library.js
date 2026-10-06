/* Client workout exercise picker. Receives the already-loaded approved catalog. */
(function (root) {
  "use strict";

  const MUSCLE_ORDER = [
    "Chest", "Back", "Shoulders", "Biceps", "Triceps", "Forearms",
    "Core", "Glutes", "Quads", "Hamstrings", "Calves", "Full Body",
    "Cardio", "Mobility", "Other"
  ];
  const MUSCLE_ALIASES = {
    abs: "Core", abdominals: "Core", abdominal: "Core", obliques: "Core", core: "Core",
    back: "Back", lats: "Back", latissimus: "Back", traps: "Back", trapezius: "Back",
    chest: "Chest", pectorals: "Chest", pecs: "Chest",
    shoulders: "Shoulders", shoulder: "Shoulders", delts: "Shoulders", deltoids: "Shoulders",
    biceps: "Biceps", triceps: "Triceps", forearms: "Forearms", forearm: "Forearms",
    glutes: "Glutes", gluteals: "Glutes", glute: "Glutes", hips: "Glutes",
    quadriceps: "Quads", quadricep: "Quads", quads: "Quads", quad: "Quads",
    hamstrings: "Hamstrings", hamstring: "Hamstrings",
    calves: "Calves", calf: "Calves", gastrocnemius: "Calves",
    "full body": "Full Body", "whole body": "Full Body", total_body: "Full Body",
    cardio: "Cardio", cardiovascular: "Cardio",
    mobility: "Mobility", stretching: "Mobility", flexibility: "Mobility", "foam rolling": "Mobility"
  };

  function normalize(value) {
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[_-]+/g, " ").trim().toLocaleLowerCase();
  }

  function muscleFor(value) {
    const normalized = normalize(value);
    return MUSCLE_ALIASES[normalized] || (normalized ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Other");
  }

  function prepareRecords(records) {
    const seen = new Set();
    return (Array.isArray(records) ? records : []).flatMap((record) => {
      const name = String(record?.name || "").trim();
      const key = normalize(name);
      if (!key || seen.has(key)) return [];
      seen.add(key);
      const entry = record.libraryEntry || {};
      const primary = muscleFor(entry.primary_muscle);
      const secondary = (Array.isArray(entry.secondary_muscles) ? entry.secondary_muscles : [])
        .map(muscleFor).filter((part) => part !== primary && part !== "Other");
      const aliases = (Array.isArray(record.aliases) ? record.aliases : entry.aliases || [])
        .filter((alias) => typeof alias === "string");
      return [{ name, primary, secondary: [...new Set(secondary)],
        searchText: normalize([name, ...aliases, primary, ...secondary, entry.equipment || ""].join(" ")) }];
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  function matchingRecords(records, query, muscle) {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return records.filter((record) => {
      const muscles = [record.primary, ...record.secondary];
      return (muscle === "All" || muscles.includes(muscle)) &&
        words.every((word) => record.searchText.includes(word));
    });
  }

  function groupedRecords(records, muscle) {
    const groups = new Map();
    records.forEach((record) => {
      const heading = muscle === "All" ? record.primary : muscle;
      if (!groups.has(heading)) groups.set(heading, []);
      groups.get(heading).push(record);
    });
    return [...groups].sort(([left], [right]) => {
      const leftIndex = MUSCLE_ORDER.indexOf(left);
      const rightIndex = MUSCLE_ORDER.indexOf(right);
      if (leftIndex !== rightIndex) return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
      return left.localeCompare(right);
    });
  }

  let dialog = null;
  let restoreFocus = null;
  let selection = null;
  let sourceRecords = [];
  let activeMuscle = "All";
  let renderFrame = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function close() {
    if (!dialog) return;
    if (renderFrame) root.cancelAnimationFrame(renderFrame);
    renderFrame = 0;
    if (dialog.open) dialog.close();
    else dialog.hidden = true;
    root.document.body.classList.remove("client-exercise-library-open");
    if (restoreFocus?.isConnected) restoreFocus.focus();
    restoreFocus = null;
    selection = null;
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = element("dialog", "client-exercise-library");
    dialog.hidden = true;
    dialog.setAttribute("aria-labelledby", "client-exercise-library-title");
    dialog.setAttribute("aria-describedby", "client-exercise-library-help");
    const shell = element("div", "client-exercise-library-shell");
    const header = element("header", "client-exercise-library-header");
    const closeButton = element("button", "client-exercise-library-close", "Close");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "Close exercise library");
    closeButton.addEventListener("click", close);
    const title = element("h2", "", "Add exercise");
    title.id = "client-exercise-library-title";
    header.append(closeButton, title);
    const help = element("p", "client-exercise-library-help", "Search the full exercise library or choose a muscle group.");
    help.id = "client-exercise-library-help";
    const searchLabel = element("label", "client-exercise-library-search-label", "Search exercises");
    const search = element("input", "client-exercise-library-search");
    search.type = "search";
    search.placeholder = "Exercise name or muscle";
    search.autocomplete = "off";
    search.setAttribute("aria-controls", "client-exercise-library-results");
    searchLabel.append(search);
    const filters = element("div", "client-exercise-library-filters");
    filters.setAttribute("role", "group");
    filters.setAttribute("aria-label", "Filter by muscle");
    const count = element("p", "client-exercise-library-count");
    count.setAttribute("role", "status");
    count.setAttribute("aria-live", "polite");
    const results = element("div", "client-exercise-library-results");
    results.id = "client-exercise-library-results";
    shell.append(header, help, searchLabel, filters, count, results);
    dialog.append(shell);
    root.document.body.append(dialog);
    dialog.addEventListener("close", () => {
      root.document.body.classList.remove("client-exercise-library-open");
      if (restoreFocus?.isConnected) restoreFocus.focus();
      restoreFocus = null;
      selection = null;
    });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && typeof dialog.showModal !== "function") close();
    });
    search.addEventListener("input", () => {
      if (renderFrame) root.cancelAnimationFrame(renderFrame);
      renderFrame = root.requestAnimationFrame(() => { renderFrame = 0; renderResults(); });
    });
    return dialog;
  }

  function renderFilters() {
    const filters = dialog.querySelector(".client-exercise-library-filters");
    filters.replaceChildren();
    const available = new Set(sourceRecords.flatMap((record) => [record.primary, ...record.secondary]));
    const sorted = [...available].sort((a, b) => {
      const left = MUSCLE_ORDER.indexOf(a), right = MUSCLE_ORDER.indexOf(b);
      return (left < 0 ? 99 : left) - (right < 0 ? 99 : right) || a.localeCompare(b);
    });
    ["All", ...sorted].forEach((muscle) => {
      const button = element("button", "client-exercise-library-filter", muscle);
      button.type = "button";
      button.setAttribute("aria-pressed", String(activeMuscle === muscle));
      button.addEventListener("click", () => {
        activeMuscle = muscle;
        filters.querySelectorAll("button").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
        renderResults();
      });
      filters.append(button);
    });
  }

  function renderResults() {
    const query = dialog.querySelector(".client-exercise-library-search").value;
    const matched = matchingRecords(sourceRecords, query, activeMuscle);
    const count = dialog.querySelector(".client-exercise-library-count");
    count.textContent = `${matched.length} ${matched.length === 1 ? "exercise" : "exercises"}`;
    const results = dialog.querySelector(".client-exercise-library-results");
    const fragment = document.createDocumentFragment();
    if (!matched.length) fragment.append(element("p", "client-exercise-library-empty", "No exercises found. Try another name or muscle group."));
    groupedRecords(matched, activeMuscle).forEach(([muscle, records]) => {
      const group = element("section", "client-exercise-library-group");
      group.append(element("h3", "client-exercise-library-group-title", muscle));
      const list = element("ul", "client-exercise-library-list");
      records.forEach((record) => {
        const item = element("li", "client-exercise-library-item");
        const button = element("button", "client-exercise-library-item-button");
        button.type = "button";
        const text = element("span", "client-exercise-library-item-copy");
        text.append(element("strong", "", record.name));
        const muscleText = [record.primary, ...record.secondary].join(" · ");
        text.append(element("small", "", muscleText));
        button.append(text, element("span", "client-exercise-library-item-plus", "+"));
        button.addEventListener("click", () => {
          const onSelect = selection;
          close();
          if (typeof onSelect === "function") onSelect(record.name);
        });
        item.append(button);
        list.append(item);
      });
      group.append(list);
      fragment.append(group);
    });
    results.replaceChildren(fragment);
    results.scrollTop = 0;
  }

  function open({ records = [], initialQuery = "", onSelect } = {}) {
    ensureDialog();
    if (dialog.open || !dialog.hidden) close();
    sourceRecords = prepareRecords(records);
    selection = onSelect;
    restoreFocus = root.document.activeElement;
    activeMuscle = "All";
    const search = dialog.querySelector(".client-exercise-library-search");
    search.value = String(initialQuery || "");
    renderFilters();
    renderResults();
    dialog.hidden = false;
    root.document.body.classList.add("client-exercise-library-open");
    if (typeof dialog.showModal === "function") dialog.showModal();
    search.focus();
  }

  root.FWB_CLIENT_EXERCISE_LIBRARY = { open, close };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { muscleFor, prepareRecords, matchingRecords, groupedRecords };
  }
})(typeof window !== "undefined" ? window : globalThis);
