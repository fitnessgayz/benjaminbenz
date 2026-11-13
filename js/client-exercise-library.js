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

  function approvedLikenessMediaUrl(value, variant) {
    try {
      const url = new URL(value);
      const storageOrigin = new URL(root.FWB_SUPABASE_CONFIG?.url).origin;
      const pattern = variant === "motion"
        ? /^\/storage\/v1\/object\/public\/exercise-images\/approved\/\d{4}-\d{2}-\d{2}\/motion-webp\/[a-z0-9-]+\.webp$/i
        : /^\/storage\/v1\/object\/public\/exercise-images\/approved\/\d{4}-\d{2}-\d{2}\/webp-768\/[a-z0-9-]+\.webp$/i;
      return url.protocol === "https:" && url.origin === storageOrigin
        && !url.username && !url.password && pattern.test(url.pathname) ? url.href : "";
    } catch {
      return "";
    }
  }

  function normalize(value) {
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[_-]+/g, " ").trim().toLocaleLowerCase();
  }

  function searchWords(value) {
    return normalize(value).replace(/\b(one|single)\s+(arm|leg)\b/g, "single $2")
      .replace(/\bdumbells?\b|\bdbs?\b/g, "dumbbell")
      .replace(/\bkbs?\b/g, "kettlebell")
      .replace(/\bpull\s+downs?\b/g, "pulldown").split(/\s+/).filter(Boolean)
      .map((word) => {
        if (word.length <= 3 || /(?:ss|us)$/.test(word) || !word.endsWith("s")) return word;
        if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
        if (/(?:sses|ches|shes|xes|zes)$/.test(word)) return word.slice(0, -2);
        return word.slice(0, -1);
      });
  }

  // Group recognizable variations only. A shared movement pattern does not
  // mean every press or row belongs under one heading.
  const FAMILY_GROUPS = [
      ["chest", "Chest Press", (value) => value.includes("bench press") || value.includes("chest press") || value.includes("dumbbell press")],
      ["chest", "Chest Fly", (value) => value.includes("chest fly") || value.includes("cable fly") || value.includes("pec deck")],
      ["chest", "Push-Up", (value) => value.includes("push up")],
      ["back", "Lat Pulldown", (value) => value.includes("lat pulldown") && !value.includes("straight arm")],
      ["back", "Straight-Arm Pulldown", (value) => value.includes("straight arm") && value.includes("pulldown")],
      ["back", "Row", (value) => value.includes("row") && !value.includes("upright row")],
      ["back", "Pull-Up", (value) => value.includes("pull up") && !value.includes(" or ")],
      ["shoulders", "Shoulder Press", (value) => value.includes("shoulder press") || value.includes("overhead press")],
      ["shoulders", "Lateral Raise", (value) => value.includes("lateral raise")],
      ["biceps", "Biceps Curl", (value) => value.includes("curl")],
      ["triceps", "Triceps Pushdown", (value) => value.includes("tricep") && /pushdown|pressdown|pulldown/.test(value)],
      ["triceps", "Triceps Kickback", (value) => value.includes("tricep") && value.includes("kickback")],
      ["triceps", "Skull Crusher", (value) => value.includes("skull crusher")],
      ["triceps", "Triceps Extension", (value) => value.includes("tricep") && /extension| ext\b/.test(value)],
      ["triceps", "Triceps Dip", (value) => value.includes("dip")],
      ["triceps", "Triceps Press", (value) => value.includes("press") || value === "tricep push"],
      ["quads", "Leg Press", (value) => value.includes("leg press")],
      ["quads", "Squat", isSquatVariation],
      ["glutes", "Squat", isSquatVariation],
      ["full body", "Squat", isSquatVariation],
      ["quads", "Deadlift", (value) => value.includes("deadlift") || value.includes(" rdl")],
      ["glutes", "Deadlift", (value) => value.includes("deadlift") || value.includes(" rdl")],
      ["hamstrings", "Deadlift", (value) => value.includes("deadlift") || value.includes(" rdl")],
      ["full body", "Deadlift", (value) => value.includes("deadlift") || value.includes(" rdl")],
      ["quads", "Lunge", (value) => value.includes("lunge")],
      ["glutes", "Lunge", (value) => value.includes("lunge")],
      ["hamstrings", "Leg Curl", (value) => value.includes("leg curl")],
      ["glutes", "Hip Thrust", (value) => value.includes("hip thrust")],
      ["glutes", "Glute Bridge", (value) => value.includes("glute bridge") || value.includes("floor bridge")],
      ["glutes", "Glute Kickback", (value) => value.includes("glute kickback") || value.includes("machine kickback")],
      ["calves", "Calf Raise", (value) => value.includes("calf raise")],
      ["core", "Sit-Up", (value) => value === "sit up" || value.includes(" sit up")],
      ["core", "Plank", (value) => (value === "plank" || value.includes(" plank")) && !value.includes("side plank")],
      ["core", "Side Plank", (value) => value.includes("side plank")]
  ];

  function isSquatVariation(value) {
    return value.includes("squat") && !["jump", "stretch", "rotation", "to row", "hip hinge", " rdl"]
      .some((modifier) => value.includes(modifier));
  }

  function exerciseFamily(record) {
    const name = searchWords(record.name).join(" ");
    const muscle = record.primary.toLowerCase();
    const group = FAMILY_GROUPS.find(([target, , matches]) => target === muscle && matches(name));
    return group ? { key: group[1].toLowerCase(), title: group[1] } : { key: name, title: record.name };
  }

  function browseMuscle(record) {
    switch (exerciseFamily(record).title) {
      case "Deadlift": return "Full Body";
      case "Squat": return "Quads";
      default: return record.primary;
    }
  }

  function variationOrder(name, familyTitle) {
    const value = searchWords(name).join(" ");
    if (value === searchWords(familyTitle).join(" ")) return [0, 0];
    if (familyTitle === "Deadlift" && value === "barbell deadlift") return [0, 1];
    if (familyTitle === "Squat" && value === "barbell back squat") return [0, 1];
    const equipment = ["dumbbell", "barbell", "trap bar", "cable", "machine", "smith", "kettlebell", "band"];
    const equipmentRank = equipment.findIndex((word) => value.includes(word)) + 1;
    if (familyTitle === "Biceps Curl") {
      if (value === "dumbbell curl") return [0, 0];
      if (value === "barbell curl" || value === "cable curl") return [1, equipmentRank];
      if (value.includes("hammer")) return [2, equipmentRank];
      if (value.includes("preacher")) return [3, equipmentRank];
      if (value.includes("spider")) return [4, equipmentRank];
      if (value.includes("concentration")) return [5, equipmentRank];
      if (value.includes("incline")) return [6, equipmentRank];
      if (value.includes("single arm")) return [7, equipmentRank];
      return [8, equipmentRank];
    }
    if (familyTitle === "Triceps Pushdown" && value === "cable tricep pushdown") return [0, 0];
    if (familyTitle === "Deadlift") {
      if (value.includes("romanian") || value.includes(" rdl")) return [2, equipmentRank];
      if (value.includes("sumo")) return [3, equipmentRank];
      if (value.includes("stiff leg")) return [4, equipmentRank];
    }
    if (familyTitle === "Squat") {
      if (value.includes("front squat")) return [2, equipmentRank];
      if (value.includes("single leg") || value.includes("pistol")) return [4, equipmentRank];
      if (value.includes("bulgarian") || value.includes("split squat")) return [5, equipmentRank];
    }
    if (value.includes("incline")) return [2, equipmentRank];
    if (value.includes("decline")) return [3, equipmentRank];
    if (value.includes("single arm") || value.includes("single leg")) return [4, equipmentRank];
    if (value.includes("neutral grip")) return [5, equipmentRank];
    if (value.includes("underhand grip") || value.includes("supinated")) return [6, equipmentRank];
    if (value.includes("overhand grip") || value.includes("pronated")) return [7, equipmentRank];
    if (["wide grip", "close grip", "narrow grip"].some((word) => value.includes(word))) return [8, equipmentRank];
    return [1, equipmentRank];
  }

  function exerciseFamilies(records, byUsage = false) {
    const families = new Map();
    records.forEach((record) => {
      const family = exerciseFamily(record);
      const key = `${browseMuscle(record)}|${family.key}`;
      if (!families.has(key)) families.set(key, { ...family, entries: [] });
      families.get(key).entries.push(record);
    });
    families.forEach((family) => family.entries.sort((a, b) => {
      const left = variationOrder(a.name, family.title);
      const right = variationOrder(b.name, family.title);
      return left[0] - right[0] || left[1] - right[1] || a.name.localeCompare(b.name);
    }));
    return [...families.values()].sort((a, b) => byUsage
      ? b.entries.reduce((total, entry) => total + entry.useCount, 0)
        - a.entries.reduce((total, entry) => total + entry.useCount, 0)
        || Math.min(...a.entries.map((entry) => entry.recentRank)) - Math.min(...b.entries.map((entry) => entry.recentRank))
      : a.title.localeCompare(b.title));
  }

  function muscleFor(value) {
    const normalized = normalize(value);
    return MUSCLE_ALIASES[normalized] || (normalized ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Other");
  }

  function prepareRecords(records, recentNames = []) {
    const seen = new Set();
    const recent = new Map();
    const useCounts = new Map();
    recentNames.forEach((name, index) => {
      const key = normalize(name);
      if (key && !recent.has(key)) recent.set(key, index);
      if (key) useCounts.set(key, (useCounts.get(key) || 0) + 1);
    });
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
      const equipment = String(entry.equipment || "").trim();
      const motionUrl = approvedLikenessMediaUrl(entry.motion_url, "motion");
      const imageUrl = motionUrl ? approvedLikenessMediaUrl(entry.image_url, "image") : "";
      const substitutionGroup = normalize(entry.substitution_group);
      const recentRank = Math.min(...[name, ...aliases].map((label) => recent.get(normalize(label)) ?? Infinity));
      const useCount = [name, ...aliases].reduce((total, label) => total + (useCounts.get(normalize(label)) || 0), 0);
      return [{ name, primary, secondary: [...new Set(secondary)],
        equipment, substitutionGroup, recentRank, useCount,
        imageUrl, motionUrl: imageUrl ? motionUrl : "", instructions: String(entry.instructions || "").trim(),
        highlightKey: muscleHighlightKey(entry),
        highlightFallback: String(entry.primary_muscle || "").trim().toLowerCase(),
        searchText: searchWords([name, ...aliases, primary, ...secondary, equipment].join(" ")).join(" ") }];
    }).sort((a, b) => a.name.localeCompare(b.name));
  }

  function matchingRecords(records, query, muscle, equipment = "All", recentOnly = false) {
    const words = searchWords(query);
    return records.filter((record) => {
      return (muscle === "All" || record.primary === muscle || browseMuscle(record) === muscle) &&
        (equipment === "All" || normalize(record.equipment) === normalize(equipment)) &&
        (!recentOnly || Number.isFinite(record.recentRank)) &&
        words.every((word) => record.searchText.includes(word));
    });
  }

  function groupedRecords(records, muscle) {
    const groups = new Map();
    records.forEach((record) => {
      const heading = muscle === "All" ? browseMuscle(record) : muscle;
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
  let recentNamesInView = [];
  let activeMuscle = "All";
  let activeEquipment = "All";
  let recentOnly = false;
  let referenceName = "";
  let renderFrame = 0;
  let searchTimer = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function close() {
    if (!dialog) return;
    if (searchTimer) root.clearTimeout(searchTimer);
    searchTimer = 0;
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
    const browse = element("div", "client-exercise-library-browse");
    browse.setAttribute("role", "group");
    browse.setAttribute("aria-label", "Browse exercises");
    const allButton = element("button", "client-exercise-library-browse-button", "All exercises");
    const recentButton = element("button", "client-exercise-library-browse-button", "Recent");
    [allButton, recentButton].forEach((button, index) => {
      button.type = "button";
      button.addEventListener("click", () => {
        recentOnly = index === 1;
        renderBrowse();
        renderResults();
      });
      browse.append(button);
    });
    const filters = element("div", "client-exercise-library-filters");
    filters.setAttribute("role", "group");
    filters.setAttribute("aria-label", "Filter by muscle");
    const equipmentLabel = element("label", "client-exercise-library-equipment-label", "Equipment");
    const equipmentSelect = element("select", "client-exercise-library-equipment");
    equipmentSelect.setAttribute("aria-label", "Filter by equipment");
    equipmentSelect.addEventListener("change", () => {
      activeEquipment = equipmentSelect.value;
      renderResults();
    });
    equipmentLabel.append(equipmentSelect);
    const count = element("p", "client-exercise-library-count");
    count.setAttribute("role", "status");
    count.setAttribute("aria-live", "polite");
    const customButton = element("button", "client-exercise-library-custom");
    customButton.type = "button";
    customButton.hidden = true;
    customButton.addEventListener("click", () => {
      const name = search.value.trim();
      if (!name) return;
      const onSelect = selection;
      close();
      if (typeof onSelect === "function") onSelect(name);
    });
    const results = element("div", "client-exercise-library-results");
    results.id = "client-exercise-library-results";
    shell.append(header, help, searchLabel, browse, filters, equipmentLabel, count, customButton, results);
    dialog.append(shell);
    root.document.body.append(dialog);
    dialog.addEventListener("close", () => {
      if (searchTimer) root.clearTimeout(searchTimer);
      searchTimer = 0;
      if (renderFrame) root.cancelAnimationFrame(renderFrame);
      renderFrame = 0;
      root.document.body.classList.remove("client-exercise-library-open");
      if (restoreFocus?.isConnected) restoreFocus.focus();
      restoreFocus = null;
      selection = null;
    });
    dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && typeof dialog.showModal !== "function") close();
    });
    const updateSearch = () => {
      if (recentOnly && search.value.trim()) {
        recentOnly = false;
        renderBrowse();
      }
      if (searchTimer) root.clearTimeout(searchTimer);
      if (renderFrame) root.cancelAnimationFrame(renderFrame);
      results.classList.add("is-searching");
      results.setAttribute("aria-busy", "true");
      searchTimer = root.setTimeout(() => {
        searchTimer = 0;
        renderFrame = root.requestAnimationFrame(() => { renderFrame = 0; renderResults(); });
      }, 240);
    };
    search.addEventListener("input", (event) => {
      if (!event.isComposing) updateSearch();
    });
    search.addEventListener("compositionend", updateSearch);
    return dialog;
  }

  function renderBrowse() {
    dialog.querySelectorAll(".client-exercise-library-browse-button").forEach((button, index) => {
      button.setAttribute("aria-pressed", String(recentOnly === (index === 1)));
    });
    dialog.querySelectorAll(".client-exercise-library-browse-button")[1].disabled =
      !sourceRecords.some((record) => Number.isFinite(record.recentRank));
  }

  function renderEquipment() {
    const select = dialog.querySelector(".client-exercise-library-equipment");
    const choices = [...new Set(sourceRecords.map((record) => record.equipment).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    select.replaceChildren(...["All", ...choices].map((value) => {
      const option = element("option", "", value === "All" ? "All equipment" : value.replace(/[_-]+/g, " "));
      option.value = value;
      return option;
    }));
    select.value = activeEquipment;
  }

  function renderFilters() {
    const filters = dialog.querySelector(".client-exercise-library-filters");
    filters.replaceChildren();
    const available = new Set(sourceRecords.flatMap((record) => [record.primary, browseMuscle(record)]));
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
    const customButton = dialog.querySelector(".client-exercise-library-custom");
    customButton.hidden = !query.trim();
    customButton.textContent = query.trim() ? `Add “${query.trim()}” to this workout` : "";
    const matched = matchingRecords(sourceRecords, query, activeMuscle, activeEquipment, recentOnly);
    const count = dialog.querySelector(".client-exercise-library-count");
    count.textContent = `${matched.length} ${matched.length === 1 ? "exercise" : "exercises"}`;
    const results = dialog.querySelector(".client-exercise-library-results");
    const fragment = document.createDocumentFragment();
    if (!matched.length) fragment.append(element("p", "client-exercise-library-empty", "No library match. You can add the name you typed above."));
    const showRecentFirst = !recentOnly && !query.trim() && activeMuscle === "All" && activeEquipment === "All";
    const reference = sourceRecords.find((record) => normalize(record.name) === normalize(referenceName));
    const alternatives = showRecentFirst && reference?.substitutionGroup
      ? matched.filter((record) => record.name !== reference.name && record.substitutionGroup === reference.substitutionGroup)
      : [];
    const alternativeNames = new Set(alternatives.map((record) => record.name));
    const recent = showRecentFirst ? matched.filter((record) => Number.isFinite(record.recentRank))
      .filter((record) => !alternativeNames.has(record.name))
      .sort((a, b) => b.useCount - a.useCount || a.recentRank - b.recentRank).slice(0, 8) : [];
    const groups = recentOnly
      ? [["Recent", [...matched].sort((a, b) => b.useCount - a.useCount || a.recentRank - b.recentRank)]]
      : [...(alternatives.length ? [["Suggested alternatives", alternatives]] : []),
        ...(recent.length ? [["Recently used", recent]] : []),
        ...groupedRecords(matched, activeMuscle)];
    groups.forEach(([muscle, records]) => {
      const group = element("section", "client-exercise-library-group");
      group.append(element("h3", "client-exercise-library-group-title", muscle));
      const list = element("ul", "client-exercise-library-list");
      const showsUseCount = muscle === "Recent" || muscle === "Recently used";
      const usageLabel = (count) => `Used ${count} ${count === 1 ? "time" : "times"}`;
      function renderEntry(record, target, highlighted = false) {
        const item = element("li", "client-exercise-library-item");
        if (highlighted) item.classList.add("is-variant-match");
        const button = element("button", "client-exercise-library-item-button");
        button.type = "button";
        button.setAttribute("aria-label", `Add ${record.name}, ${[record.primary, ...record.secondary].join(", ")}${showsUseCount ? `, ${usageLabel(record.useCount)}` : ""}`);
        const artwork = element("span", "client-exercise-library-item-artwork");
        const image = element("img", "");
        const muscleImageUrl = record.highlightKey
          ? `images/muscle-highlights/library/${record.highlightKey}.png?v=2`
          : muscleArtworkUrl(record.primary);
        image.src = record.imageUrl || muscleImageUrl;
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        if (record.imageUrl) artwork.classList.add("is-likeness-card");
        if (record.imageUrl || record.highlightKey) image.addEventListener("error", () => {
          if (record.imageUrl && !image.dataset.likenessFallbackUsed) {
            image.dataset.likenessFallbackUsed = "true";
            artwork.classList.remove("is-likeness-card");
            image.src = muscleImageUrl;
            return;
          }
          const fallback = `images/muscle-highlights/library/${record.highlightFallback}.png?v=2`;
          if (!image.dataset.muscleFallbackUsed && image.src.includes(`/${record.highlightKey}.png`)) {
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
        if (record.equipment) text.append(element("small", "client-exercise-library-item-equipment", record.equipment.replace(/[_-]+/g, " ")));
        if (showsUseCount) text.append(element("small", "client-exercise-library-item-use-count", usageLabel(record.useCount)));
        const add = element("span", "client-exercise-library-item-plus", "+");
        add.setAttribute("aria-hidden", "true");
        button.append(artwork, text, add);
        button.addEventListener("click", () => {
          const onSelect = selection;
          close();
          if (typeof onSelect === "function") onSelect(record.name);
        });
        item.append(button);
        if (record.imageUrl && record.motionUrl) {
          const preview = element("button", "client-exercise-library-preview", "▶");
          preview.type = "button";
          preview.setAttribute("aria-label", `Preview ${record.name} start and end animation`);
          preview.dataset.exerciseMediaOpen = "";
          preview.dataset.exerciseMediaStatic = record.imageUrl;
          preview.dataset.exerciseMediaVideo = record.motionUrl;
          preview.dataset.exerciseMediaName = record.name;
          preview.dataset.exerciseMediaInstructions = record.instructions;
          item.append(preview);
        }
        target.append(item);
      }
      exerciseFamilies(records, muscle === "Recent" || muscle === "Recently used").forEach((family) => {
        if (family.entries.length === 1) {
          renderEntry(family.entries[0], list, Boolean(query.trim()));
          return;
        }
        const item = element("li", "client-exercise-library-family");
        const details = element("details", "client-exercise-library-family-details");
        if (query.trim()) details.open = true;
        const summary = element("summary", "client-exercise-library-family-summary");
        const summaryCopy = element("div", "client-exercise-library-family-copy");
        summaryCopy.append(element("strong", "", family.title));
        if (showsUseCount) summaryCopy.append(element("small", "client-exercise-library-item-use-count",
          usageLabel(family.entries.reduce((total, entry) => total + entry.useCount, 0))));
        summary.append(summaryCopy, element("span", "", `${family.entries.length} variations`));
        const variants = element("ul", "client-exercise-library-variants");
        family.entries.forEach((record) => renderEntry(record, variants, true));
        details.append(summary, variants);
        item.append(details);
        list.append(item);
      });
      group.append(list);
      fragment.append(group);
    });
    results.replaceChildren(fragment);
    results.scrollTop = 0;
    results.classList.remove("is-searching");
    results.removeAttribute("aria-busy");
  }

  function open({ records = [], recentNames = [], referenceName: currentName = "", initialQuery = "", onSelect } = {}) {
    ensureDialog();
    if (dialog.open || !dialog.hidden) close();
    recentNamesInView = recentNames;
    sourceRecords = prepareRecords(records, recentNames);
    selection = onSelect;
    restoreFocus = root.document.activeElement;
    activeMuscle = "All";
    activeEquipment = "All";
    recentOnly = !String(currentName || "").trim() && !String(initialQuery || "").trim()
      && sourceRecords.some((record) => Number.isFinite(record.recentRank));
    referenceName = String(currentName || "");
    const search = dialog.querySelector(".client-exercise-library-search");
    search.value = String(initialQuery || "");
    renderBrowse();
    renderFilters();
    renderEquipment();
    renderResults();
    dialog.hidden = false;
    root.document.body.classList.add("client-exercise-library-open");
    if (typeof dialog.showModal === "function") dialog.showModal();
    search.focus();
  }

  function refresh({ records = [] } = {}) {
    if (!dialog || (dialog.hidden && !dialog.open)) return;
    if (searchTimer) root.clearTimeout(searchTimer);
    searchTimer = 0;
    if (renderFrame) root.cancelAnimationFrame(renderFrame);
    renderFrame = 0;
    sourceRecords = prepareRecords(records, recentNamesInView);
    renderBrowse();
    renderFilters();
    renderEquipment();
    renderResults();
  }

  root.FWB_CLIENT_EXERCISE_LIBRARY = { open, close, refresh };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { muscleFor, prepareRecords, matchingRecords, groupedRecords, exerciseFamilies, muscleArtwork };
  }
})(typeof window !== "undefined" ? window : globalThis);
