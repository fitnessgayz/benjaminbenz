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

  // A compact anatomical guide for each primary muscle. Keeping this artwork local
  // makes the full catalog quick to browse, even when exercise media is unavailable.
  const FRONT_BODY = `
    <ellipse cx="48" cy="12" rx="8" ry="10"/><path d="M43 21h10l2 7H41z"/>
    <path d="M39 27 28 30 31 47 38 58 42 65h12l4-7 7-11 3-17-11-3-9 4z"/>
    <path d="M28 30 21 34 16 51 12 66l5 3 8-16 8-13zM68 30l7 4 5 17 4 15-5 3-8-16-8-13z"/>
    <path d="M42 63 35 66 34 84l-3 22 8 1 8-23 2-13zM54 63l7 3 1 18 3 22-8 1-8-23-2-13z"/>`;
  const BACK_BODY = `
    <ellipse cx="48" cy="12" rx="8" ry="10"/><path d="M43 21h10l2 7H41z"/>
    <path d="M39 27 27 31l5 18 7 13 4 4h10l4-4 7-13 5-18-12-4-9 4z"/>
    <path d="M27 31 20 35l-5 18-3 13 5 3 8-16 8-12zM69 31l7 4 5 18 3 13-5 3-8-16-8-12z"/>
    <path d="M43 64 35 66 34 84l-3 22 8 1 8-23 1-13zM53 64l8 2 1 18 3 22-8 1-8-23-1-13z"/>`;
  const MUSCLE_ART = {
    Chest: { view: "front", regions: `<path d="M32 32q8-5 15 0v14q-7 6-14-1zM49 32q7-5 15 0l-1 13q-7 7-14 1z"/>` },
    Back: { view: "back", regions: `<path d="M34 32 47 36v24L37 53zM62 32 49 36v24l10-7z"/>` },
    Shoulders: { view: "front", regions: `<path d="M29 30q5-4 10-2l-5 13-8-3zM67 30q-5-4-10-2l5 13 8-3z"/>` },
    Biceps: { view: "front", regions: `<path d="M23 39 30 42l-5 13-7-2zM73 39l-7 3 5 13 7-2z"/>` },
    Triceps: { view: "back", regions: `<path d="M22 39 30 42l-5 14-7-3zM74 39l-8 3 5 14 7-3z"/>` },
    Forearms: { view: "front", regions: `<path d="m17 52 7 3-7 12-5-2zM79 52l-7 3 7 12 5-2z"/>` },
    Core: { view: "front", regions: `<path d="M40 46h16l-3 16H43z"/>` },
    Glutes: { view: "back", regions: `<path d="M37 62q6-3 10 3v10q-8 5-12-4zM59 62q-6-3-10 3v10q8 5 12-4z"/>` },
    Quads: { view: "front", regions: `<path d="M37 69 46 72l-2 14-6 9-4-2zM59 69l-9 3 2 14 6 9 4-2z"/>` },
    Hamstrings: { view: "back", regions: `<path d="M36 74 46 76l-4 18-7-2zM60 74l-10 2 4 18 7-2z"/>` },
    Calves: { view: "back", regions: `<path d="M35 88 42 91l-3 14-7-1zM61 88l-7 3 3 14 7-1z"/>` },
    "Full Body": { view: "front", regions: `<path d="M33 33h30l-4 14-6 15H43l-6-15zM21 40l8 3-5 13-7-3zM75 40l-8 3 5 13 7-3zM37 70l9 3-4 20-8-2zM59 70l-9 3 4 20 8-2z"/>` },
    Cardio: { view: "front", regions: `<path d="M37 69 46 72l-4 21-8-2zM59 69l-9 3 4 21 8-2z"/>` },
    Mobility: { view: "front", regions: `<path d="M33 34h30l-5 12H38zM37 72l9 3-3 16-8-2zM59 72l-9 3 3 16 8-2z"/>` }
  };

  function muscleArtwork(primary) {
    const art = MUSCLE_ART[primary] || MUSCLE_ART["Full Body"];
    return `<svg viewBox="0 0 96 112" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      <g fill="#11151b" stroke="#41464c" stroke-width=".6" stroke-linejoin="round">${art.view === "back" ? BACK_BODY : FRONT_BODY}</g>
      <g fill="#29a9ff" stroke="#087bc6" stroke-width=".7" stroke-linejoin="round">${art.regions}</g>
    </svg>`;
  }
  const artworkUrls = new Map();
  function muscleArtworkUrl(primary) {
    if (!artworkUrls.has(primary)) {
      artworkUrls.set(primary, `data:image/svg+xml,${encodeURIComponent(muscleArtwork(primary))}`);
    }
    return artworkUrls.get(primary);
  }

  function muscleHighlightKey(entry) {
    const primary = String(entry?.primary_muscle || "").trim().toLowerCase();
    if (!/^[a-z0-9_]+$/.test(primary)) return "";
    const secondary = [...new Set((Array.isArray(entry?.secondary_muscles)
      ? entry.secondary_muscles : [])
      .map((muscle) => String(muscle || "").trim().toLowerCase())
      .filter((muscle) => muscle !== primary && /^[a-z0-9_]+$/.test(muscle)))].sort();
    return [primary, ...secondary].join("--");
  }

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
        highlightKey: muscleHighlightKey(entry),
        highlightFallback: String(entry.primary_muscle || "").trim().toLowerCase(),
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
        button.setAttribute("aria-label", `Add ${record.name}, ${[record.primary, ...record.secondary].join(", ")}`);
        const artwork = element("span", "client-exercise-library-item-artwork");
        const image = element("img", "");
        image.src = record.highlightKey
          ? `images/muscle-highlights/library/${record.highlightKey}.png`
          : muscleArtworkUrl(record.primary);
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        if (record.highlightKey) image.addEventListener("error", () => {
          const fallback = `images/muscle-highlights/library/${record.highlightFallback}.png`;
          if (!image.dataset.muscleFallbackUsed && image.src.endsWith(`/${record.highlightKey}.png`)) {
            image.dataset.muscleFallbackUsed = "true";
            image.src = fallback;
          } else {
            image.src = muscleArtworkUrl(record.primary);
          }
        });
        artwork.append(image);
        const text = element("span", "client-exercise-library-item-copy");
        text.append(element("strong", "", record.name));
        const muscles = element("span", "client-exercise-library-item-muscles");
        [record.primary, ...record.secondary].forEach((muscle) => {
          muscles.append(element("small", "client-exercise-library-item-muscle", muscle));
        });
        text.append(muscles);
        const add = element("span", "client-exercise-library-item-plus", "+");
        add.setAttribute("aria-hidden", "true");
        button.append(artwork, text, add);
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
    module.exports = { muscleFor, prepareRecords, matchingRecords, groupedRecords, muscleArtwork };
  }
})(typeof window !== "undefined" ? window : globalThis);
