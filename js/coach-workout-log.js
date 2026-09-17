const coachWorkoutConfig = window.FWB_SUPABASE_CONFIG || {};
const coachWorkoutEmails = ["benjaminbenz.fit@gmail.com"];
const coachWorkoutLoginUrl = "client-login.html?return_to=%2Fcoach-workout-log.html";
const coachWorkoutAutosaveDelayMs = 10000;
const coachWorkoutWarmUpSetNumberBase = 1000;
const coachWorkoutWarmUpSetType = "warm_up";
const coachWorkoutWorkingSetType = "working";
const coachWorkoutDraftMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
const coachWorkoutDraftStorageKey = "fwb_coach_session_logger_draft_v1";
const coachWorkoutDraftVersion = 2;
const coachWorkoutActiveContextStorageKey = "fwb_coach_session_logger_active_context_v2";
const hasCoachWorkoutConfig = Boolean(
  coachWorkoutConfig.url &&
  coachWorkoutConfig.anonKey &&
  !coachWorkoutConfig.url.includes("PASTE_") &&
  !coachWorkoutConfig.anonKey.includes("PASTE_")
);
const coachWorkoutSupabase = hasCoachWorkoutConfig && window.supabase
  ? window.supabase.createClient(coachWorkoutConfig.url, coachWorkoutConfig.anonKey)
  : null;

let coachWorkoutPrograms = [];
let coachWorkoutExerciseLibrary = [];
let coachWorkoutExerciseId = 0;
let coachWorkoutAutosaveTimer = null;
let coachWorkoutAutosaveInFlight = false;
let coachWorkoutAutosaveQueued = false;
let coachWorkoutAutosaveQueuedEpoch = null;
let coachWorkoutChangeRevision = 0;
let coachWorkoutLastSavedSignature = "";
let coachWorkoutPendingDeletes = [];
let coachWorkoutPendingDeleteRevision = 0;
let coachWorkoutSaveEpoch = 0;
let coachWorkoutDraftOwner = "";
let coachWorkoutActiveContext = { clientEmail: "", entryDate: "" };
const coachWorkoutDraftMemory = new Map();
const coachWorkoutCollapsedExerciseKeys = new Set();

function normalizeCoachWorkoutEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isCoachWorkoutEmail(email) {
  return coachWorkoutEmails.includes(normalizeCoachWorkoutEmail(email));
}

function escapeCoachWorkoutHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function coachWorkoutToday() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);

  return localDate.toISOString().slice(0, 10);
}

function setCoachWorkoutAccessStatus(message, isError = false) {
  const status = document.getElementById("coach-workout-access-status");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function setCoachWorkoutStatus(message, isError = false) {
  const status = document.getElementById("coach-workout-status");

  if (!status) {
    return;
  }

  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

function redirectToCoachWorkoutLogin() {
  window.location.replace(coachWorkoutLoginUrl);
}

function activeCoachWorkoutClients() {
  const clientsByEmail = new Map();

  coachWorkoutPrograms
    .filter((program) => program.active !== false && program.client_archived !== true)
    .forEach((program) => {
      const email = normalizeCoachWorkoutEmail(program.client_email);

      if (!email) {
        return;
      }

      const existing = clientsByEmail.get(email);
      const programDate = String(program.updated_at || program.created_at || "");
      const existingDate = String(existing?.updated_at || existing?.created_at || "");

      if (!existing || programDate > existingDate) {
        clientsByEmail.set(email, program);
      }
    });

  return Array.from(clientsByEmail.values())
    .sort((a, b) => String(a.client_name || a.client_email).localeCompare(String(b.client_name || b.client_email)));
}

function renderCoachWorkoutClients() {
  const select = document.getElementById("coach-workout-client");

  if (!select) {
    return;
  }

  const currentEmail = normalizeCoachWorkoutEmail(select.value);
  const clients = activeCoachWorkoutClients();
  const options = clients.map((program) => new Option(
    `${program.client_name || "Client"} — ${program.client_email}`,
    normalizeCoachWorkoutEmail(program.client_email)
  ));

  select.replaceChildren(new Option("Choose a client", ""), ...options);
  select.value = clients.some((program) => normalizeCoachWorkoutEmail(program.client_email) === currentEmail)
    ? currentEmail
    : "";
}

function closeCoachWorkoutSuggestions(exceptInput = null) {
  document.querySelectorAll("[data-coach-workout-suggestions]").forEach((menu) => {
    const input = menu.closest("[data-coach-workout-exercise]")?.querySelector("[data-coach-workout-name]");

    if (input === exceptInput) {
      return;
    }

    menu.hidden = true;
    input?.setAttribute("aria-expanded", "false");
  });
}

function renderCoachWorkoutSuggestions(input) {
  const exercise = input?.closest("[data-coach-workout-exercise]");
  const menu = exercise?.querySelector("[data-coach-workout-suggestions]");

  if (!input || !menu) {
    return;
  }

  const query = input.value.trim().toLowerCase();
  const matches = coachWorkoutExerciseLibrary
    .filter((item) => item.is_active !== false && (!query || String(item.name || "").toLowerCase().includes(query)))
    .sort((a, b) => {
      const aName = String(a.name || "").toLowerCase();
      const bName = String(b.name || "").toLowerCase();
      const aStarts = query && aName.startsWith(query) ? 0 : 1;
      const bStarts = query && bName.startsWith(query) ? 0 : 1;

      return aStarts - bStarts || aName.localeCompare(bName);
    })
    .slice(0, 16);

  menu.innerHTML = matches.map((item) => `
    <button type="button" role="option" data-coach-workout-suggestion="${escapeCoachWorkoutHtml(item.name)}">${escapeCoachWorkoutHtml(item.name)}</button>
  `).join("");
  menu.hidden = matches.length === 0;
  input.setAttribute("aria-expanded", String(matches.length > 0));
  closeCoachWorkoutSuggestions(input);
}

function coachWorkoutFormatValue() {
  return document.querySelector('input[name="coach_workout_format"]:checked')?.value || "single";
}

function coachWorkoutFormatMarker(format, index) {
  if (format === "superset") {
    const pair = Math.floor(index / 2) + 1;
    const position = index % 2 === 0 ? "A" : "B";

    return `Superset ${pair}${position}`;
  }

  if (format === "circuit") {
    return `Station ${index + 1}`;
  }

  return `Exercise ${index + 1}`;
}

function coachWorkoutSetType(value, setNumber = 0) {
  if (value === coachWorkoutWarmUpSetType) {
    return coachWorkoutWarmUpSetType;
  }

  if (value === coachWorkoutWorkingSetType) {
    return coachWorkoutWorkingSetType;
  }

  return Number(setNumber) > coachWorkoutWarmUpSetNumberBase
    ? coachWorkoutWarmUpSetType
    : coachWorkoutWorkingSetType;
}

function coachWorkoutSetMarkup(values = {}, index = 0) {
  const setType = coachWorkoutSetType(
    values.setType || (index === 0 ? coachWorkoutWarmUpSetType : coachWorkoutWorkingSetType),
    values.setNumber
  );
  const defaultLabel = setType === coachWorkoutWarmUpSetType ? "" : String(index);
  const setLabel = String(values.label ?? defaultLabel);
  const rir = String(values.rir ?? "");

  return `
    <div class="coach-workout-set-row${setType === coachWorkoutWarmUpSetType ? " is-warm-up" : ""}" data-coach-workout-set-row data-coach-workout-set-type="${setType}" data-coach-workout-set-number="${escapeCoachWorkoutHtml(values.setNumber || (setType === coachWorkoutWarmUpSetType ? coachWorkoutWarmUpSetNumberBase + 1 : Math.max(index, 1)))}">
      <label class="coach-workout-set-label">
        <span>Set</span>
        <input type="text" value="${escapeCoachWorkoutHtml(setLabel)}" maxlength="3" inputmode="text" autocomplete="off" aria-label="${setType === coachWorkoutWarmUpSetType ? "Warm-up set label" : `Set ${Math.max(index, 1)} label`}" placeholder="W" data-coach-workout-set-label />
      </label>
      <label>
        <span>Weight</span>
        <input type="number" value="${escapeCoachWorkoutHtml(values.weight ?? "")}" min="0" step="0.5" inputmode="decimal" placeholder="0" data-coach-workout-weight />
      </label>
      <label>
        <span>Reps</span>
        <input type="number" value="${escapeCoachWorkoutHtml(values.reps ?? "")}" min="0" step="1" inputmode="numeric" placeholder="0" data-coach-workout-reps />
      </label>
      <label>
        <span>RIR</span>
        <select data-coach-workout-rir aria-label="Reps in reserve">
          <option value=""${rir === "" ? " selected" : ""}>—</option>
          ${[0, 1, 2, 3, 4].map((value) => `<option value="${value}"${rir === String(value) ? " selected" : ""}>${value}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function coachWorkoutExerciseMarkup(values = {}) {
  const id = `coach-workout-exercise-${++coachWorkoutExerciseId}`;
  const suggestionsId = `${id}-suggestions`;
  const sets = Array.isArray(values.sets) && values.sets.length > 0 ? values.sets : [{}];

  return `
    <article class="coach-workout-exercise is-open" data-coach-workout-exercise data-coach-workout-code="${escapeCoachWorkoutHtml(values.code || "")}" data-coach-workout-code-context="${escapeCoachWorkoutHtml(values.codeContext || "")}">
      <div class="coach-workout-exercise-heading">
        <label class="coach-workout-exercise-name">
          <span class="coach-workout-exercise-marker" data-coach-workout-marker>Exercise</span>
          <input type="text" value="${escapeCoachWorkoutHtml(values.name || "")}" placeholder="Input exercise name here" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="${suggestionsId}" aria-expanded="false" data-coach-workout-name required />
        </label>
        <button class="coach-workout-remove-exercise" type="button" data-coach-workout-remove aria-label="Remove exercise">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" />
          </svg>
        </button>
        <button class="coach-workout-exercise-toggle" type="button" data-coach-workout-toggle aria-expanded="true" aria-controls="${id}" aria-label="Collapse exercise">
          <span aria-hidden="true">›</span>
        </button>
        <div class="coach-workout-suggestion-menu" id="${suggestionsId}" role="listbox" data-coach-workout-suggestions hidden></div>
      </div>
      <p class="coach-workout-set-progress" data-coach-workout-progress>0 / ${sets.length} working sets completed</p>
      <div class="coach-workout-exercise-detail" id="${id}">
        <div class="coach-workout-set-table">
          <div class="coach-workout-set-rows" data-coach-workout-set-rows>
            ${sets.map((set, index) => coachWorkoutSetMarkup(set, index)).join("")}
          </div>
          <div class="coach-workout-set-actions">
            <button type="button" data-coach-workout-add-set>+ Add Set</button>
            <button type="button" data-coach-workout-delete-set>Delete Set</button>
          </div>
          <button class="coach-workout-add-superset" type="button" data-coach-workout-add-superset hidden>Add Superset</button>
        </div>
        <div class="coach-workout-notes">
          <button type="button" data-coach-workout-notes-toggle aria-expanded="false" aria-controls="${id}-notes">
            <strong>Notes</strong><small data-coach-workout-notes-state></small><span aria-hidden="true">+</span>
          </button>
          <label id="${id}-notes" hidden>
            <span class="sr-only">Exercise notes</span>
            <textarea rows="3" placeholder="Any exercise modifications?" data-coach-workout-notes>${escapeCoachWorkoutHtml(values.notes || "")}</textarea>
          </label>
        </div>
        <p class="coach-workout-previous" data-coach-workout-previous>Previous: none</p>
      </div>
    </article>
  `;
}

function coachWorkoutExerciseElements() {
  return Array.from(document.querySelectorAll("[data-coach-workout-exercise]"));
}

function coachWorkoutUsesGroupedView(format = coachWorkoutFormatValue()) {
  return format === "superset" || format === "circuit";
}

function coachWorkoutGroupedExerciseGroups(format = coachWorkoutFormatValue()) {
  const exercises = coachWorkoutExerciseElements();

  if (format === "circuit") {
    return exercises.length > 0 ? [exercises] : [];
  }

  if (format === "superset") {
    return exercises.reduce((groups, exercise, index) => {
      const groupIndex = Math.floor(index / 2);

      if (!groups[groupIndex]) groups[groupIndex] = [];
      groups[groupIndex].push(exercise);
      return groups;
    }, []);
  }

  return [];
}

function coachWorkoutGroupedMarker(format, groupIndex, exerciseIndex) {
  if (format === "circuit") {
    return String(exerciseIndex + 1);
  }

  return `${String.fromCharCode(65 + groupIndex)}${exerciseIndex + 1}`;
}

function coachWorkoutGroupedSetControlMarkup(exerciseIndex, rowIndex, field, value = "") {
  const normalizedValue = String(value ?? "");
  const fieldLabel = field === "rir" ? "RIR" : field.charAt(0).toUpperCase() + field.slice(1);

  if (field === "rir") {
    return `
      <label>
        <span>${fieldLabel}</span>
        <select data-coach-workout-grouped-field="rir" data-coach-workout-exercise-index="${exerciseIndex}" data-coach-workout-row-index="${rowIndex}" aria-label="${fieldLabel}">
          <option value=""${normalizedValue === "" ? " selected" : ""}>—</option>
          ${[0, 1, 2, 3, 4].map((option) => `<option value="${option}"${normalizedValue === String(option) ? " selected" : ""}>${option}</option>`).join("")}
        </select>
      </label>
    `;
  }

  return `
    <label>
      <span>${fieldLabel}</span>
      <input type="number" value="${escapeCoachWorkoutHtml(normalizedValue)}" min="0" step="${field === "weight" ? "0.5" : "1"}" inputmode="${field === "weight" ? "decimal" : "numeric"}" placeholder="0" required data-coach-workout-grouped-field="${field}" data-coach-workout-exercise-index="${exerciseIndex}" data-coach-workout-row-index="${rowIndex}" />
    </label>
  `;
}

function coachWorkoutGroupedSetRowMarkup({ exercise, exerciseIndex, row, rowIndex, marker, warmUp = false }) {
  const name = exercise.querySelector("[data-coach-workout-name]")?.value.trim() || `Exercise ${exerciseIndex + 1}`;
  const weight = row.querySelector("[data-coach-workout-weight]")?.value || "";
  const reps = row.querySelector("[data-coach-workout-reps]")?.value || "";
  const rir = row.querySelector("[data-coach-workout-rir]")?.value || "";

  return `
    <div class="coach-workout-grouped-set-row${warmUp ? " is-warm-up" : ""}" data-coach-workout-grouped-set-row>
      <button class="coach-workout-grouped-set-marker" type="button" data-coach-workout-grouped-toggle-type data-coach-workout-exercise-index="${exerciseIndex}" data-coach-workout-row-index="${rowIndex}" aria-label="Change ${escapeCoachWorkoutHtml(name)} ${warmUp ? "warm-up" : "working"} set type" title="Tap to change set type">
        <span>${escapeCoachWorkoutHtml(marker)}</span>
      </button>
      ${coachWorkoutGroupedSetControlMarkup(exerciseIndex, rowIndex, "weight", weight)}
      ${coachWorkoutGroupedSetControlMarkup(exerciseIndex, rowIndex, "reps", reps)}
      ${coachWorkoutGroupedSetControlMarkup(exerciseIndex, rowIndex, "rir", rir)}
    </div>
  `;
}

function coachWorkoutGroupedExerciseKeyMarkup(exercise, exerciseIndex, marker) {
  const name = exercise.querySelector("[data-coach-workout-name]")?.value || "";
  const notes = exercise.querySelector("[data-coach-workout-notes]")?.value || "";
  const suggestionsId = `coach-workout-grouped-suggestions-${exerciseIndex}`;

  return `
    <div class="coach-workout-grouped-exercise-key" data-coach-workout-grouped-exercise-key>
      <span class="coach-workout-grouped-exercise-marker">${escapeCoachWorkoutHtml(marker)}</span>
      <label>
        <span class="sr-only">Exercise ${exerciseIndex + 1} name</span>
        <input type="text" value="${escapeCoachWorkoutHtml(name)}" placeholder="Input exercise name here" autocomplete="off" role="combobox" aria-autocomplete="list" aria-controls="${suggestionsId}" aria-expanded="false" required data-coach-workout-grouped-field="name" data-coach-workout-exercise-index="${exerciseIndex}" />
      </label>
      <button class="coach-workout-grouped-remove" type="button" data-coach-workout-grouped-remove data-coach-workout-exercise-index="${exerciseIndex}" aria-label="Remove ${escapeCoachWorkoutHtml(name || `exercise ${exerciseIndex + 1}`)}">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" /></svg>
      </button>
      <div class="coach-workout-suggestion-menu coach-workout-grouped-suggestions" id="${suggestionsId}" role="listbox" data-coach-workout-grouped-suggestions hidden></div>
      <details class="coach-workout-grouped-notes">
        <summary data-coach-workout-grouped-notes-summary data-coach-workout-exercise-index="${exerciseIndex}">Notes${notes.trim() ? " · Added" : ""}</summary>
        <label>
          <span class="sr-only">${escapeCoachWorkoutHtml(name || `Exercise ${exerciseIndex + 1}`)} notes</span>
          <textarea rows="3" placeholder="Any exercise modifications?" data-coach-workout-grouped-field="notes" data-coach-workout-exercise-index="${exerciseIndex}">${escapeCoachWorkoutHtml(notes)}</textarea>
        </label>
      </details>
    </div>
  `;
}

function coachWorkoutGroupedCardMarkup(group, groupIndex, format) {
  const allExercises = coachWorkoutExerciseElements();
  const groupId = `${format}-${groupIndex}`;
  const keyCollapsed = coachWorkoutCollapsedExerciseKeys.has(groupId);
  const exerciseEntries = group.map((exercise, position) => ({
    exercise,
    exerciseIndex: allExercises.indexOf(exercise),
    position,
    marker: coachWorkoutGroupedMarker(format, groupIndex, position),
    rows: Array.from(exercise.querySelectorAll("[data-coach-workout-set-row]"))
  }));
  const warmUps = exerciseEntries.flatMap((entry) => entry.rows
    .map((row, rowIndex) => ({ ...entry, row, rowIndex }))
    .filter((entryRow) => coachWorkoutSetType(entryRow.row.dataset.coachWorkoutSetType, entryRow.row.dataset.coachWorkoutSetNumber) === coachWorkoutWarmUpSetType));
  const workingByExercise = exerciseEntries.map((entry) => ({
    ...entry,
    rows: entry.rows
      .map((row, rowIndex) => ({ row, rowIndex }))
      .filter((entryRow) => coachWorkoutSetType(entryRow.row.dataset.coachWorkoutSetType, entryRow.row.dataset.coachWorkoutSetNumber) === coachWorkoutWorkingSetType)
  }));
  const roundCount = workingByExercise.reduce((maximum, entry) => Math.max(maximum, entry.rows.length), 0);
  const completed = workingByExercise.reduce((total, entry) => total + entry.rows.filter(({ row }) => (
    (row.querySelector("[data-coach-workout-weight]")?.value || "") !== "" &&
    (row.querySelector("[data-coach-workout-reps]")?.value || "") !== ""
  )).length, 0);
  const total = workingByExercise.reduce((sum, entry) => sum + entry.rows.length, 0);
  const title = format === "circuit" ? "Circuit" : `Superset ${groupIndex + 1}`;

  return `
    <section class="coach-workout-grouped-card" data-coach-workout-grouped-card data-coach-workout-group-index="${groupIndex}" data-coach-workout-group-id="${groupId}">
      <header class="coach-workout-grouped-card-header">
        <div>
          <p>Exercises</p>
          <h3>${title}</h3>
        </div>
        <p class="coach-workout-grouped-progress" data-coach-workout-grouped-progress>${completed} / ${total} working sets completed</p>
        <button type="button" data-coach-workout-grouped-key-toggle aria-expanded="${String(!keyCollapsed)}" aria-controls="coach-workout-grouped-key-${groupIndex}" aria-label="${keyCollapsed ? "Show" : "Hide"} exercise names"><span aria-hidden="true">${keyCollapsed ? "+" : "−"}</span></button>
      </header>
      <div class="coach-workout-grouped-exercise-keys" id="coach-workout-grouped-key-${groupIndex}"${keyCollapsed ? " hidden" : ""}>
        ${exerciseEntries.map((entry) => coachWorkoutGroupedExerciseKeyMarkup(entry.exercise, entry.exerciseIndex, entry.marker)).join("")}
      </div>
      <div class="coach-workout-grouped-rounds">
        ${warmUps.length > 0 ? `
          <section class="coach-workout-grouped-round is-warm-up">
            <header><strong>Warm-up</strong><span>Excluded from working volume</span></header>
            ${warmUps.map((entry, warmUpIndex) => coachWorkoutGroupedSetRowMarkup({
              ...entry,
              marker: `W${warmUpIndex + 1}`,
              warmUp: true
            })).join("")}
          </section>
        ` : ""}
        ${Array.from({ length: roundCount }, (_, roundIndex) => `
          <section class="coach-workout-grouped-round">
            <header><strong>Round ${roundIndex + 1}</strong><span>${exerciseEntries.map((entry) => entry.marker).join(" + ")}</span></header>
            ${workingByExercise.map((entry) => {
              const rowEntry = entry.rows[roundIndex];

              return rowEntry ? coachWorkoutGroupedSetRowMarkup({
                ...entry,
                ...rowEntry,
                marker: entry.marker
              }) : "";
            }).join("")}
          </section>
        `).join("")}
      </div>
      <footer class="coach-workout-grouped-actions">
        <button type="button" data-coach-workout-grouped-add-round>+ Add round</button>
        <button type="button" data-coach-workout-grouped-delete-round${roundCount === 0 ? " disabled" : ""}>Delete round</button>
        ${format === "superset" && group.length === 1 ? `<button type="button" data-coach-workout-grouped-add-pair>Add paired exercise</button>` : ""}
      </footer>
    </section>
  `;
}

function renderCoachWorkoutGroupedView() {
  const view = document.getElementById("coach-workout-grouped-view");
  const list = document.getElementById("coach-workout-exercises");
  const format = coachWorkoutFormatValue();
  const grouped = coachWorkoutUsesGroupedView(format);

  if (!view || !list) {
    return;
  }

  list.hidden = grouped;
  view.hidden = !grouped;
  list.querySelectorAll("[data-coach-workout-name]").forEach((input) => {
    input.required = !grouped;
  });

  if (!grouped) {
    closeCoachWorkoutGroupedSuggestions();
    view.replaceChildren();
    return;
  }

  closeCoachWorkoutSuggestions();
  view.innerHTML = coachWorkoutGroupedExerciseGroups(format)
    .map((group, groupIndex) => coachWorkoutGroupedCardMarkup(group, groupIndex, format))
    .join("");
}

function coachWorkoutGroupedCanonicalControl(control) {
  const exerciseIndex = Number(control?.dataset.coachWorkoutExerciseIndex);
  const rowIndex = Number(control?.dataset.coachWorkoutRowIndex);
  const field = control?.dataset.coachWorkoutGroupedField;
  const exercise = coachWorkoutExerciseElements()[exerciseIndex];

  if (!exercise) return null;
  if (field === "name") return exercise.querySelector("[data-coach-workout-name]");
  if (field === "notes") return exercise.querySelector("[data-coach-workout-notes]");

  const row = exercise.querySelectorAll("[data-coach-workout-set-row]")[rowIndex];
  if (!row) return null;

  return row.querySelector(`[data-coach-workout-${field}]`);
}

function renderCoachWorkoutGroupedSuggestions(input) {
  const key = input?.closest("[data-coach-workout-grouped-exercise-key]");
  const menu = key?.querySelector("[data-coach-workout-grouped-suggestions]");

  if (!input || !menu) return;

  const query = input.value.trim().toLowerCase();
  const matches = coachWorkoutExerciseLibrary
    .filter((item) => item.is_active !== false && (!query || String(item.name || "").toLowerCase().includes(query)))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .slice(0, 16);

  menu.innerHTML = matches.map((item) => `
    <button type="button" role="option" data-coach-workout-grouped-suggestion="${escapeCoachWorkoutHtml(item.name)}">${escapeCoachWorkoutHtml(item.name)}</button>
  `).join("");
  menu.hidden = matches.length === 0;
  input.setAttribute("aria-expanded", String(matches.length > 0));
}

function closeCoachWorkoutGroupedSuggestions(exceptInput = null) {
  document.querySelectorAll("[data-coach-workout-grouped-suggestions]").forEach((menu) => {
    const input = menu.closest("[data-coach-workout-grouped-exercise-key]")?.querySelector('[data-coach-workout-grouped-field="name"]');

    if (input === exceptInput) return;
    menu.hidden = true;
    input?.setAttribute("aria-expanded", "false");
  });
}

function updateCoachWorkoutGroupedDerivedState() {
  const format = coachWorkoutFormatValue();
  const groups = coachWorkoutGroupedExerciseGroups(format);

  document.querySelectorAll("[data-coach-workout-grouped-card]").forEach((card) => {
    const group = groups[Number(card.dataset.coachWorkoutGroupIndex || 0)] || [];
    const workingRows = group.flatMap((exercise) => Array.from(exercise.querySelectorAll("[data-coach-workout-set-row]"))
      .filter((row) => coachWorkoutSetType(row.dataset.coachWorkoutSetType, row.dataset.coachWorkoutSetNumber) === coachWorkoutWorkingSetType));
    const completed = workingRows.filter((row) => (
      (row.querySelector("[data-coach-workout-weight]")?.value || "") !== "" &&
      (row.querySelector("[data-coach-workout-reps]")?.value || "") !== ""
    )).length;
    const progress = card.querySelector("[data-coach-workout-grouped-progress]");

    if (progress) progress.textContent = `${completed} / ${workingRows.length} working sets completed`;
  });

  coachWorkoutExerciseElements().forEach((exercise, exerciseIndex) => {
    const name = exercise.querySelector("[data-coach-workout-name]")?.value.trim() || `Exercise ${exerciseIndex + 1}`;
    const notes = exercise.querySelector("[data-coach-workout-notes]")?.value.trim() || "";
    const remove = document.querySelector(
      `[data-coach-workout-grouped-remove][data-coach-workout-exercise-index="${exerciseIndex}"]`
    );
    const notesSummary = document.querySelector(
      `[data-coach-workout-grouped-notes-summary][data-coach-workout-exercise-index="${exerciseIndex}"]`
    );

    if (remove) remove.setAttribute("aria-label", `Remove ${name}`);
    if (notesSummary) notesSummary.textContent = `Notes${notes ? " · Added" : ""}`;

    document.querySelectorAll(
      `[data-coach-workout-grouped-toggle-type][data-coach-workout-exercise-index="${exerciseIndex}"]`
    ).forEach((button) => {
      const rowIndex = Number(button.dataset.coachWorkoutRowIndex);
      const row = exercise.querySelectorAll("[data-coach-workout-set-row]")[rowIndex];
      const isWarmUp = coachWorkoutSetType(
        row?.dataset.coachWorkoutSetType,
        row?.dataset.coachWorkoutSetNumber
      ) === coachWorkoutWarmUpSetType;

      button.setAttribute("aria-label", `Change ${name} ${isWarmUp ? "warm-up" : "working"} set type`);
    });
  });

}

function focusCoachWorkoutGroupedControl(exerciseIndex, rowIndex, field) {
  if (!coachWorkoutUsesGroupedView()) return false;

  const selector = `[data-coach-workout-grouped-field="${field}"][data-coach-workout-exercise-index="${exerciseIndex}"]${Number.isInteger(rowIndex) ? `[data-coach-workout-row-index="${rowIndex}"]` : ""}`;
  const control = document.querySelector(selector);

  control?.focus();
  return Boolean(control);
}

function updateCoachWorkoutSetRows(exercise) {
  const rows = Array.from(exercise?.querySelectorAll("[data-coach-workout-set-row]") || []);
  let completed = 0;
  let warmUpIndex = 0;
  let workingIndex = 0;

  rows.forEach((row) => {
    const label = row.querySelector("[data-coach-workout-set-label]");
    const normalizedLabel = String(label?.value || "").trim().toUpperCase().replace(/[^W0-9]/g, "").slice(0, 3);
    const wasWarmUp = coachWorkoutSetType(row.dataset.coachWorkoutSetType, row.dataset.coachWorkoutSetNumber) === coachWorkoutWarmUpSetType;
    const setType = normalizedLabel.startsWith("W") || (!normalizedLabel && wasWarmUp)
      ? coachWorkoutWarmUpSetType
      : coachWorkoutWorkingSetType;
    const weight = row.querySelector("[data-coach-workout-weight]")?.value.trim() || "";
    const reps = row.querySelector("[data-coach-workout-reps]")?.value.trim() || "";
    const setNumber = setType === coachWorkoutWarmUpSetType
      ? coachWorkoutWarmUpSetNumberBase + (warmUpIndex += 1)
      : (workingIndex += 1);

    if (label) {
      label.value = setType === coachWorkoutWarmUpSetType
        ? normalizedLabel
        : String(workingIndex);
      label.setAttribute("aria-label", setType === coachWorkoutWarmUpSetType
        ? `Warm-up set ${warmUpIndex} label`
        : `Set ${workingIndex} label`);
    }

    row.dataset.coachWorkoutSetType = setType;
    row.dataset.coachWorkoutSetNumber = String(setNumber);
    row.classList.toggle("is-warm-up", setType === coachWorkoutWarmUpSetType);

    if (setType === coachWorkoutWorkingSetType && weight !== "" && reps !== "") {
      completed += 1;
    }
  });

  const progress = exercise?.querySelector("[data-coach-workout-progress]");
  const deleteSet = exercise?.querySelector("[data-coach-workout-delete-set]");

  if (progress) {
    progress.textContent = `${completed} / ${workingIndex} working sets completed`;
  }

  if (deleteSet) {
    deleteSet.disabled = rows.length <= 1;
  }
}

function addCoachWorkoutSetToExercise(exercise) {
  const rows = exercise?.querySelector("[data-coach-workout-set-rows]");
  const currentRows = Array.from(rows?.querySelectorAll("[data-coach-workout-set-row]") || []);
  const last = currentRows[currentRows.length - 1];
  const values = {
    weight: last?.querySelector("[data-coach-workout-weight]")?.value || "",
    reps: last?.querySelector("[data-coach-workout-reps]")?.value || "",
    rir: last?.querySelector("[data-coach-workout-rir]")?.value || "",
    setType: coachWorkoutWorkingSetType
  };

  rows?.insertAdjacentHTML("beforeend", coachWorkoutSetMarkup(values, currentRows.length));
  updateCoachWorkoutSetRows(exercise);
  return rows?.querySelector("[data-coach-workout-set-row]:last-child") || null;
}

function deleteCoachWorkoutSetFromExercise(exercise) {
  const rows = Array.from(exercise?.querySelectorAll("[data-coach-workout-set-row]") || []);
  const lastWorkingRow = [...rows].reverse().find((row) => (
    coachWorkoutSetType(row.dataset.coachWorkoutSetType, row.dataset.coachWorkoutSetNumber) === coachWorkoutWorkingSetType
  ));

  if (rows.length <= 1 || !lastWorkingRow) return false;
  lastWorkingRow.remove();
  updateCoachWorkoutSetRows(exercise);
  return true;
}

function renderCoachWorkoutCarousel(preferredIndex) {
  const carousel = document.getElementById("coach-workout-carousel");
  const exercises = coachWorkoutExerciseElements();
  const format = coachWorkoutFormatValue();
  const current = Number.isInteger(preferredIndex)
    ? preferredIndex
    : Number(carousel?.dataset.activeIndex || 0);
  const activeIndex = Math.min(Math.max(current, 0), Math.max(exercises.length - 1, 0));

  if (!carousel) {
    return;
  }

  carousel.dataset.coachWorkoutFormat = format;
  carousel.dataset.carouselEnabled = "false";
  carousel.dataset.activeIndex = String(activeIndex);

  exercises.forEach((exercise, index) => {
    const marker = exercise.querySelector("[data-coach-workout-marker]");

    exercise.classList.remove("is-carousel-active");
    exercise.setAttribute("aria-label", `Exercise ${index + 1} of ${exercises.length}`);
    exercise.setAttribute("aria-roledescription", "exercise");
    if (marker) marker.textContent = coachWorkoutFormatMarker(format, index);
  });

  renderCoachWorkoutGroupedView();
}

function moveCoachWorkoutCarousel(index) {
  const exercises = coachWorkoutExerciseElements();

  if (exercises.length === 0) {
    return;
  }

  const activeIndex = Math.min(Math.max(Number(index) || 0, 0), exercises.length - 1);
  renderCoachWorkoutCarousel(activeIndex);
  const groupedControl = document.querySelector(
    `[data-coach-workout-grouped-field="name"][data-coach-workout-exercise-index="${activeIndex}"]`
  );

  (groupedControl?.closest("[data-coach-workout-grouped-card]") || exercises[activeIndex])
    ?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
}

function renumberCoachWorkoutExercises() {
  const exercises = coachWorkoutExerciseElements();
  const format = coachWorkoutFormatValue();

  exercises.forEach((exercise, index) => {
    const removeButton = exercise.querySelector("[data-coach-workout-remove]");
    const addSuperset = exercise.querySelector("[data-coach-workout-add-superset]");
    const marker = exercise.querySelector("[data-coach-workout-marker]");

    if (removeButton) {
      removeButton.disabled = exercises.length === 1;
      removeButton.setAttribute("aria-label", `Remove exercise ${index + 1}`);
    }

    if (addSuperset) {
      addSuperset.hidden = !(format === "superset" && index % 2 === 0 && index === exercises.length - 1);
    }

    if (marker) {
      marker.textContent = coachWorkoutFormatMarker(format, index);
    }

    updateCoachWorkoutSetRows(exercise);
  });

  renderCoachWorkoutCarousel();
}

function addCoachWorkoutExercise(values = {}, afterExercise = null) {
  const list = document.getElementById("coach-workout-exercises");

  if (!list) {
    return;
  }

  if (afterExercise) {
    afterExercise.insertAdjacentHTML("afterend", coachWorkoutExerciseMarkup(values));
  } else {
    list.insertAdjacentHTML("beforeend", coachWorkoutExerciseMarkup(values));
  }
  renumberCoachWorkoutExercises();
  return afterExercise?.nextElementSibling || list.lastElementChild;
}

function coachWorkoutExerciseDrafts() {
  return Array.from(document.querySelectorAll("[data-coach-workout-exercise]")).map((row) => ({
    code: String(row.dataset.coachWorkoutCode || "").trim().toUpperCase(),
    codeContext: String(row.dataset.coachWorkoutCodeContext || ""),
    name: row.querySelector("[data-coach-workout-name]")?.value || "",
    sets: Array.from(row.querySelectorAll("[data-coach-workout-set-row]")).map((setRow) => ({
      label: setRow.querySelector("[data-coach-workout-set-label]")?.value ?? "",
      setType: coachWorkoutSetType(setRow.dataset.coachWorkoutSetType, setRow.dataset.coachWorkoutSetNumber),
      setNumber: Number(setRow.dataset.coachWorkoutSetNumber || 1),
      weight: setRow.querySelector("[data-coach-workout-weight]")?.value ?? "",
      reps: setRow.querySelector("[data-coach-workout-reps]")?.value ?? "",
      rir: setRow.querySelector("[data-coach-workout-rir]")?.value ?? ""
    })),
    notes: row.querySelector("[data-coach-workout-notes]")?.value || ""
  }));
}

function normalizeCoachWorkoutContext(context = {}) {
  return {
    clientEmail: normalizeCoachWorkoutEmail(context.clientEmail),
    entryDate: String(context.entryDate || "")
  };
}

function currentCoachWorkoutContext() {
  return normalizeCoachWorkoutContext({
    clientEmail: document.getElementById("coach-workout-client")?.value,
    entryDate: document.getElementById("coach-workout-date")?.value
  });
}

function coachWorkoutContextId(context = {}) {
  const normalized = normalizeCoachWorkoutContext(context);

  return `${normalized.clientEmail}|${normalized.entryDate}`;
}

function coachWorkoutContextsMatch(first, second) {
  return coachWorkoutContextId(first) === coachWorkoutContextId(second);
}

function coachWorkoutDraftKey(context = coachWorkoutActiveContext) {
  const normalized = normalizeCoachWorkoutContext(context);

  return [
    coachWorkoutDraftStorageKey,
    encodeURIComponent(coachWorkoutDraftOwner),
    encodeURIComponent(normalized.clientEmail || "unassigned"),
    encodeURIComponent(normalized.entryDate || "undated")
  ].join(":");
}

function coachWorkoutOwnerContextKey() {
  return `${coachWorkoutActiveContextStorageKey}:${encodeURIComponent(coachWorkoutDraftOwner)}`;
}

function coachWorkoutDraftPayload(extra = {}, context = coachWorkoutActiveContext) {
  const normalized = normalizeCoachWorkoutContext(context);

  return {
    version: coachWorkoutDraftVersion,
    ownerEmail: coachWorkoutDraftOwner,
    updatedAt: new Date().toISOString(),
    clientEmail: normalized.clientEmail,
    entryDate: normalized.entryDate,
    format: coachWorkoutFormatValue(),
    exercises: coachWorkoutExerciseDrafts(),
    pendingDeletes: coachWorkoutPendingDeletes,
    syncedSignature: coachWorkoutLastSavedSignature,
    ...extra
  };
}

function storeCoachWorkoutActiveContext(context = coachWorkoutActiveContext) {
  if (!coachWorkoutDraftOwner) {
    return false;
  }

  try {
    window.localStorage.setItem(coachWorkoutOwnerContextKey(), JSON.stringify({
      version: coachWorkoutDraftVersion,
      ownerEmail: coachWorkoutDraftOwner,
      updatedAt: new Date().toISOString(),
      ...normalizeCoachWorkoutContext(context)
    }));
    return true;
  } catch (_error) {
    return false;
  }
}

function storeCoachWorkoutDraft(extra = {}, options = {}) {
  if (!coachWorkoutDraftOwner) {
    return false;
  }

  const context = normalizeCoachWorkoutContext(options.context || coachWorkoutActiveContext);
  const draftKey = coachWorkoutDraftKey(context);
  const payload = coachWorkoutDraftPayload(extra, context);

  coachWorkoutDraftMemory.set(draftKey, payload);

  try {
    window.localStorage.setItem(
      draftKey,
      JSON.stringify(payload)
    );

    if (options.markActive !== false && !storeCoachWorkoutActiveContext(context)) {
      return false;
    }

    return true;
  } catch (_error) {
    return false;
  }
}

function clearCoachWorkoutDraft(context = coachWorkoutActiveContext) {
  if (!coachWorkoutDraftOwner) {
    return false;
  }

  const draftKey = coachWorkoutDraftKey(context);

  coachWorkoutDraftMemory.delete(draftKey);

  try {
    window.localStorage.removeItem(draftKey);
    return true;
  } catch (_error) {
    return false;
  }
}

function isValidCoachWorkoutDraftRecord(record) {
  const updatedAt = new Date(record?.updatedAt || "");

  return Boolean(
    record &&
    record.version === coachWorkoutDraftVersion &&
    normalizeCoachWorkoutEmail(record.ownerEmail) === coachWorkoutDraftOwner &&
    !Number.isNaN(updatedAt.getTime()) &&
    Date.now() - updatedAt.getTime() <= coachWorkoutDraftMaxAgeMs
  );
}

function readCoachWorkoutActiveContext() {
  if (!coachWorkoutDraftOwner) {
    return null;
  }

  try {
    const context = JSON.parse(window.localStorage.getItem(coachWorkoutOwnerContextKey()) || "null");

    if (!isValidCoachWorkoutDraftRecord(context)) {
      return null;
    }

    return normalizeCoachWorkoutContext(context);
  } catch (_error) {
    return null;
  }
}

function readCoachWorkoutDraft(context = coachWorkoutActiveContext) {
  if (!coachWorkoutDraftOwner) {
    return null;
  }

  const normalizedContext = normalizeCoachWorkoutContext(context);
  const draftKey = coachWorkoutDraftKey(normalizedContext);

  try {
    const draft = coachWorkoutDraftMemory.get(draftKey) || JSON.parse(
      window.localStorage.getItem(draftKey) || "null"
    );

    if (
      !isValidCoachWorkoutDraftRecord(draft) ||
      !coachWorkoutContextsMatch(draft, normalizedContext)
    ) {
      if (draft) {
        clearCoachWorkoutDraft(normalizedContext);
      }
      return null;
    }

    coachWorkoutDraftMemory.set(draftKey, draft);
    return draft;
  } catch (_error) {
    return null;
  }
}

function resetCoachWorkoutEditor() {
  const exerciseList = document.getElementById("coach-workout-exercises");
  const singleFormat = document.querySelector('input[name="coach_workout_format"][value="single"]');

  if (singleFormat) {
    singleFormat.checked = true;
  }

  if (exerciseList) {
    exerciseList.innerHTML = "";
  }

  coachWorkoutPendingDeletes = [];
  coachWorkoutLastSavedSignature = "";
  coachWorkoutCollapsedExerciseKeys.clear();
  addCoachWorkoutExercise();
  renumberCoachWorkoutExercises();
}

function restoreCoachWorkoutDraft(options = {}) {
  const context = normalizeCoachWorkoutContext(
    options.context || readCoachWorkoutActiveContext() || currentCoachWorkoutContext()
  );
  const draft = readCoachWorkoutDraft(context);
  const clientSelect = document.getElementById("coach-workout-client");
  const dateInput = document.getElementById("coach-workout-date");
  const exerciseList = document.getElementById("coach-workout-exercises");
  const clientExists = !context.clientEmail || Array.from(clientSelect?.options || [])
    .some((option) => option.value === context.clientEmail);

  if (!draft || !exerciseList || !clientExists) {
    return false;
  }

  if (options.updateFields !== false) {
    if (clientSelect) {
      clientSelect.value = context.clientEmail;
    }

    if (dateInput && context.entryDate) {
      dateInput.value = context.entryDate;
    }
  }

  const formatInput = document.querySelector(
    `input[name="coach_workout_format"][value="${String(draft.format || "single").replace(/[^a-z_]/gi, "")}"]`
  );

  if (formatInput) {
    formatInput.checked = true;
  }

  exerciseList.innerHTML = "";
  const exercises = Array.isArray(draft.exercises) ? draft.exercises : [];

  (exercises.length > 0 ? exercises : [{}]).forEach((values) => {
    addCoachWorkoutExercise(values);
  });
  coachWorkoutPendingDeletes = (Array.isArray(draft.pendingDeletes) ? draft.pendingDeletes : [])
    .filter((item) => coachWorkoutContextsMatch(item, context))
    .map((item) => ({
      ...item,
      mutationId: Number(item.mutationId) || ++coachWorkoutPendingDeleteRevision
    }));
  coachWorkoutPendingDeleteRevision = coachWorkoutPendingDeletes.reduce((maximum, item) => (
    Math.max(maximum, Number(item.mutationId) || 0)
  ), coachWorkoutPendingDeleteRevision);
  coachWorkoutLastSavedSignature = String(draft.syncedSignature || "");
  coachWorkoutActiveContext = context;
  storeCoachWorkoutActiveContext(context);
  renumberCoachWorkoutExercises();
  setCoachWorkoutStatus("Draft restored. Autosave is on.");
  return true;
}

function switchCoachWorkoutContext() {
  const nextContext = currentCoachWorkoutContext();
  const previousContext = normalizeCoachWorkoutContext(coachWorkoutActiveContext);
  const isAssigningFirstClient = Boolean(
    !previousContext.clientEmail &&
    nextContext.clientEmail &&
    previousContext.entryDate === nextContext.entryDate
  );

  if (coachWorkoutContextsMatch(previousContext, nextContext)) {
    return false;
  }

  cancelCoachWorkoutAutosave();
  const previousDraftStored = storeCoachWorkoutDraft({}, {
    context: previousContext,
    markActive: false
  });
  coachWorkoutSaveEpoch += 1;
  coachWorkoutChangeRevision += 1;
  coachWorkoutAutosaveQueued = false;
  coachWorkoutAutosaveQueuedEpoch = null;
  coachWorkoutActiveContext = nextContext;

  const restored = restoreCoachWorkoutDraft({ context: nextContext, updateFields: false });

  if (!restored) {
    if (isAssigningFirstClient) {
      coachWorkoutLastSavedSignature = "";
      coachWorkoutPendingDeletes = [];
    } else {
      resetCoachWorkoutEditor();
    }
    storeCoachWorkoutActiveContext(nextContext);
    const draftStored = storeCoachWorkoutDraft();
    setCoachWorkoutStatus(
      draftStored
        ? isAssigningFirstClient
          ? "Session assigned to this client. Autosave is on."
          : "New session ready. Autosave is on."
        : "This session could not be backed up on this device. Keep this page open or use Save Workout.",
      !draftStored
    );

    if (isAssigningFirstClient) {
      scheduleCoachWorkoutAutosave({ recordChange: false });
    }
  } else {
    scheduleCoachWorkoutAutosave({ recordChange: false });
  }

  if (!previousDraftStored) {
    setCoachWorkoutStatus(
      "The previous session is kept only while this page stays open because this device could not store its draft.",
      true
    );
  }

  return true;
}

function cancelCoachWorkoutAutosave() {
  if (coachWorkoutAutosaveTimer) {
    window.clearTimeout(coachWorkoutAutosaveTimer);
    coachWorkoutAutosaveTimer = null;
  }
}

function coachWorkoutExerciseValues(options = {}) {
  const exerciseRows = Array.from(document.querySelectorAll("[data-coach-workout-exercise]"));
  const clientEmail = normalizeCoachWorkoutEmail(document.getElementById("coach-workout-client")?.value);
  const entryDate = document.getElementById("coach-workout-date")?.value || "";
  const codeContext = `${clientEmail}|${entryDate}`;

  if (exerciseRows.length === 0) {
    throw new Error("Add at least one exercise.");
  }

  const exercises = exerciseRows.map((row, index) => {
    const nameInput = row.querySelector("[data-coach-workout-name]");
    const name = nameInput?.value.trim() || "";

    if (!name) {
      if (options.focusInvalid) {
        if (!focusCoachWorkoutGroupedControl(index, null, "name")) nameInput?.focus();
      }
      throw new Error(`Exercise ${index + 1} needs a name.`);
    }

    const setRows = Array.from(row.querySelectorAll("[data-coach-workout-set-row]"));
    const sets = setRows.map((setRow, setIndex) => {
      const weightInput = setRow.querySelector("[data-coach-workout-weight]");
      const repsInput = setRow.querySelector("[data-coach-workout-reps]");
      const rirInput = setRow.querySelector("[data-coach-workout-rir]");
      const setType = coachWorkoutSetType(setRow.dataset.coachWorkoutSetType, setRow.dataset.coachWorkoutSetNumber);
      const setNumber = Number(setRow.dataset.coachWorkoutSetNumber || setIndex + 1);
      const weightText = weightInput?.value.trim() || "";
      const repsText = repsInput?.value.trim() || "";
      const weight = Number(weightText);
      const reps = Number(repsText);
      const rir = rirInput?.value === "" ? null : Number(rirInput?.value);

      if (weightText === "" || !Number.isFinite(weight) || weight < 0) {
        if (options.focusInvalid) {
          if (!focusCoachWorkoutGroupedControl(index, setIndex, "weight")) weightInput?.focus();
        }
        throw new Error(`${name} set ${setIndex + 1} needs a valid non-negative weight.`);
      }

      if (repsText === "" || !Number.isInteger(reps) || reps < 0) {
        if (options.focusInvalid) {
          if (!focusCoachWorkoutGroupedControl(index, setIndex, "reps")) repsInput?.focus();
        }
        throw new Error(`${name} set ${setIndex + 1} needs a non-negative whole-number rep count.`);
      }

      if (rir !== null && (!Number.isInteger(rir) || rir < 0 || rir > 4)) {
        if (options.focusInvalid) {
          if (!focusCoachWorkoutGroupedControl(index, setIndex, "rir")) rirInput?.focus();
        }
        throw new Error(`${name} set ${setIndex + 1} RIR must be between 0 and 4.`);
      }

      return { setType, setNumber, weight, reps, rir };
    });

    return {
      code: row.dataset.coachWorkoutCodeContext === codeContext
        ? String(row.dataset.coachWorkoutCode || "").trim().toUpperCase()
        : "",
      name,
      sets,
      notes: row.querySelector("[data-coach-workout-notes]")?.value.trim() || ""
    };
  });
  const normalizedNames = exercises.map((exercise) => exercise.name.toLowerCase());

  if (new Set(normalizedNames).size !== normalizedNames.length) {
    throw new Error("Each exercise name must be unique. Combine repeated sets in one exercise card.");
  }

  return exercises;
}

function coachWorkoutExerciseNote(format, index, exercise) {
  const formatNote = format === "superset"
    ? coachWorkoutFormatMarker(format, index)
    : format === "circuit"
      ? `Circuit training · ${coachWorkoutFormatMarker(format, index)}`
      : "Straight sets";
  const notes = [formatNote];

  if (exercise.notes) {
    notes.push(exercise.notes);
  }

  return notes.join("\n");
}

function coachWorkoutCodeNumber(code) {
  const match = String(code || "").match(/^CW(\d+)$/i);

  return match ? Number(match[1]) : 0;
}

function coachWorkoutCode(number) {
  return `CW${String(number).padStart(2, "0")}`;
}

function coachWorkoutSaveSignature(data) {
  return JSON.stringify({
    clientEmail: data.clientEmail,
    entryDate: data.entryDate,
    format: data.format,
    exercises: data.exercises.map((exercise) => ({
      code: exercise.code || "",
      name: exercise.name,
      sets: exercise.sets.map((set) => ({
        setType: set.setType,
        setNumber: set.setNumber,
        weight: set.weight,
        reps: set.reps,
        rir: set.rir
      })),
      notes: exercise.notes
    }))
  });
}

function coachWorkoutAutosaveData() {
  const form = document.getElementById("coach-workout-log-form");
  const clientEmail = normalizeCoachWorkoutEmail(document.getElementById("coach-workout-client")?.value);
  const entryDate = document.getElementById("coach-workout-date")?.value || "";

  if (!form?.checkValidity() || !clientEmail || !entryDate) {
    return null;
  }

  try {
    return {
      clientEmail,
      entryDate,
      format: coachWorkoutFormatValue(),
      exercises: coachWorkoutExerciseValues()
    };
  } catch (_error) {
    return null;
  }
}

function coachWorkoutHasPendingDeletes(clientEmail, entryDate) {
  return coachWorkoutPendingDeletes.some((item) => (
    item.clientEmail === clientEmail && item.entryDate === entryDate
  ));
}

function queueCoachWorkoutPendingDelete(code, clientEmail, entryDate) {
  coachWorkoutPendingDeletes = coachWorkoutPendingDeletes.filter((item) => !(
    item.code === code && item.clientEmail === clientEmail && item.entryDate === entryDate
  ));
  coachWorkoutPendingDeleteRevision += 1;
  coachWorkoutPendingDeletes.push({
    code,
    clientEmail,
    entryDate,
    mutationId: coachWorkoutPendingDeleteRevision
  });
}

function queueCoachWorkoutExerciseRemoval(exercise) {
  const code = String(exercise?.dataset.coachWorkoutCode || "").trim().toUpperCase();
  const clientEmail = normalizeCoachWorkoutEmail(document.getElementById("coach-workout-client")?.value);
  const entryDate = document.getElementById("coach-workout-date")?.value || "";
  const codeContext = `${clientEmail}|${entryDate}`;

  if (!code || !clientEmail || !entryDate || exercise?.dataset.coachWorkoutCodeContext !== codeContext) {
    return;
  }

  queueCoachWorkoutPendingDelete(code, clientEmail, entryDate);
}

function scheduleCoachWorkoutAutosave(options = {}) {
  const recordChange = options.recordChange !== false;
  const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : coachWorkoutAutosaveDelayMs;

  if (recordChange) {
    coachWorkoutChangeRevision += 1;
  }

  const draftStored = storeCoachWorkoutDraft();
  cancelCoachWorkoutAutosave();

  const autosaveData = coachWorkoutAutosaveData();

  if (!autosaveData) {
    setCoachWorkoutStatus(
      draftStored
        ? "Draft saved on this device. Complete the required fields to sync it."
        : "This draft could not be saved on this device. Keep this page open or use Save Workout.",
      !draftStored
    );
    return;
  }

  const signature = coachWorkoutSaveSignature(autosaveData);
  const hasPendingDeletes = coachWorkoutHasPendingDeletes(autosaveData.clientEmail, autosaveData.entryDate);

  if (signature === coachWorkoutLastSavedSignature && !hasPendingDeletes) {
    setCoachWorkoutStatus("Autosaved.");
    return;
  }

  if (coachWorkoutAutosaveInFlight) {
    coachWorkoutAutosaveQueued = true;
    coachWorkoutAutosaveQueuedEpoch = coachWorkoutSaveEpoch;
    setCoachWorkoutStatus("Saving the latest changes…");
    return;
  }

  setCoachWorkoutStatus(
    delayMs === 0
      ? "Autosaving…"
      : draftStored
        ? "Changes saved as a draft. Autosaving soon…"
        : "Changes could not be backed up on this device. Autosaving soon…",
    !draftStored
  );
  coachWorkoutAutosaveTimer = window.setTimeout(() => {
    coachWorkoutAutosaveTimer = null;
    saveCoachWorkout(null, { automatic: true });
  }, Math.max(delayMs, 0));
}

function withCoachWorkoutSaveLock(clientEmail, entryDate, operation) {
  const lockManager = window.navigator?.locks;

  if (!lockManager || typeof lockManager.request !== "function") {
    return operation();
  }

  return lockManager.request(
    `fwb-coach-session-logger:${clientEmail}|${entryDate}`,
    operation
  );
}

async function saveCoachWorkout(event, options = {}) {
  event?.preventDefault();

  const automatic = options.automatic === true;

  const form = document.getElementById("coach-workout-log-form");
  const saveButton = document.getElementById("coach-workout-save");
  const finishButton = document.getElementById("coach-workout-finish");
  const clientEmail = normalizeCoachWorkoutEmail(document.getElementById("coach-workout-client")?.value);
  const entryDate = document.getElementById("coach-workout-date")?.value || "";
  const exerciseElements = Array.from(document.querySelectorAll("[data-coach-workout-exercise]"));

  if (!automatic) {
    cancelCoachWorkoutAutosave();
  }

  if (coachWorkoutAutosaveInFlight) {
    coachWorkoutAutosaveQueued = true;
    coachWorkoutAutosaveQueuedEpoch = coachWorkoutSaveEpoch;
    setCoachWorkoutStatus(automatic ? "Saving the latest changes…" : "Finishing the current autosave, then saving again…");
    return { saved: false, queued: true };
  }

  const isFormValid = automatic ? form?.checkValidity() : form?.reportValidity();

  if (!isFormValid) {
    const draftStored = automatic ? storeCoachWorkoutDraft() : false;

    setCoachWorkoutStatus(
      automatic
        ? draftStored
          ? "Draft saved on this device. Complete the required fields to sync it."
          : "This draft could not be saved on this device. Keep this page open or use Save Workout."
        : "Complete every required field before saving.",
      !automatic || !draftStored
    );
    return { saved: false, incomplete: true };
  }

  if (!clientEmail || !entryDate) {
    const draftStored = automatic ? storeCoachWorkoutDraft() : false;

    setCoachWorkoutStatus(
      automatic
        ? draftStored
          ? "Draft saved on this device. Choose a client and workout date to sync it."
          : "This draft could not be saved on this device. Keep this page open or use Save Workout."
        : "Choose a client and workout date first.",
      !automatic || !draftStored
    );
    return { saved: false, incomplete: true };
  }

  let exercises;

  try {
    exercises = coachWorkoutExerciseValues({ focusInvalid: !automatic });
  } catch (error) {
    const draftStored = automatic ? storeCoachWorkoutDraft() : false;

    setCoachWorkoutStatus(
      automatic
        ? draftStored
          ? "Draft saved on this device. Complete the exercise details to sync it."
          : "This draft could not be saved on this device. Keep this page open or use Save Workout."
        : error.message || "Check the exercise fields and try again.",
      !automatic || !draftStored
    );
    return { saved: false, incomplete: true };
  }

  const format = coachWorkoutFormatValue();
  const requestedData = { clientEmail, entryDate, format, exercises };
  const requestedSignature = coachWorkoutSaveSignature(requestedData);
  const requestedContext = { clientEmail, entryDate };
  const requestedPendingDeletes = coachWorkoutPendingDeletes
    .filter((item) => coachWorkoutContextsMatch(item, requestedContext))
    .map((item) => ({ ...item }));

  if (
    automatic &&
    requestedSignature === coachWorkoutLastSavedSignature &&
    !coachWorkoutHasPendingDeletes(clientEmail, entryDate)
  ) {
    setCoachWorkoutStatus("Autosaved.");
    return { saved: true, unchanged: true };
  }

  coachWorkoutAutosaveInFlight = true;
  const saveRevision = coachWorkoutChangeRevision;
  const saveEpoch = coachWorkoutSaveEpoch;

  if (saveButton) {
    saveButton.disabled = true;
  }
  if (finishButton) {
    finishButton.disabled = true;
  }
  setCoachWorkoutStatus(automatic ? "Autosaving…" : "Saving the workout…");

  try {
    const { planned, rows } = await withCoachWorkoutSaveLock(clientEmail, entryDate, async () => {
      const { data: existingRows, error: existingError } = await coachWorkoutSupabase
        .from("client_workout_logs")
        .select("exercise_code,exercise_name,set_number,set_type")
        .eq("client_email", clientEmail)
        .eq("entry_date", entryDate)
        .eq("workout_title", "Custom workout");

      if (existingError) {
        throw existingError;
      }

      const existing = existingRows || [];
      const existingCodeByName = new Map();
      let nextCodeNumber = existing.reduce((maximum, row) => (
        Math.max(maximum, coachWorkoutCodeNumber(row.exercise_code))
      ), 0) + 1;

      existing.forEach((row) => {
        const normalizedName = String(row.exercise_name || "").trim().toLowerCase();

        if (normalizedName && !existingCodeByName.has(normalizedName)) {
          existingCodeByName.set(normalizedName, row.exercise_code);
        }
      });

      const usedCodes = new Set();
      const plannedExercises = exercises.map((exercise) => {
        let code = exercise.code || existingCodeByName.get(exercise.name.toLowerCase()) || "";

        if (usedCodes.has(code)) {
          code = "";
        }

        while (!code || usedCodes.has(code)) {
          code = coachWorkoutCode(nextCodeNumber++);
        }

        usedCodes.add(code);

        return { ...exercise, code };
      });
      const plannedCodes = new Set(plannedExercises.map((exercise) => exercise.code));
      const pendingDeletes = requestedPendingDeletes.filter((item) => !plannedCodes.has(item.code));
      const plannedRows = plannedExercises.flatMap((exercise, exerciseIndex) => (
        exercise.sets.map((set, setIndex) => ({
          client_email: clientEmail,
          entry_date: entryDate,
          workout_title: "Custom workout",
          exercise_code: exercise.code,
          exercise_name: exercise.name,
          set_number: set.setNumber,
          weight_used: set.weight,
          reps: set.reps,
          effort_scale: set.rir === null ? null : "rir",
          effort_value: set.rir,
          notes: coachWorkoutExerciseNote(format, exerciseIndex, exercise),
          source: "website",
          set_type: set.setType,
          exercise_order: exerciseIndex
        }))
      ));
      const { error: saveError } = await coachWorkoutSupabase
        .from("client_workout_logs")
        .upsert(plannedRows, { onConflict: "client_email,entry_date,workout_title,exercise_code,set_number" });

      if (saveError) {
        throw saveError;
      }

      for (const pendingDelete of pendingDeletes) {
        const { error: deleteError } = await coachWorkoutSupabase
          .from("client_workout_logs")
          .delete()
          .eq("client_email", pendingDelete.clientEmail)
          .eq("entry_date", pendingDelete.entryDate)
          .eq("workout_title", "Custom workout")
          .eq("exercise_code", pendingDelete.code);

        if (deleteError) {
          throw deleteError;
        }
      }

      for (const exercise of plannedExercises) {
        const plannedSetNumbers = new Set(exercise.sets.map((set) => Number(set.setNumber)));
        const staleSetNumbers = existing
          .filter((row) => row.exercise_code === exercise.code && !plannedSetNumbers.has(Number(row.set_number)))
          .map((row) => Number(row.set_number));

        if (staleSetNumbers.length > 0) {
          const { error: deleteError } = await coachWorkoutSupabase
            .from("client_workout_logs")
            .delete()
            .eq("client_email", clientEmail)
            .eq("entry_date", entryDate)
            .eq("workout_title", "Custom workout")
            .eq("exercise_code", exercise.code)
            .in("set_number", staleSetNumbers);

          if (deleteError) {
            throw deleteError;
          }
        }
      }

      return { planned: plannedExercises, rows: plannedRows };
    });
    const saveIsCurrent = (
      saveEpoch === coachWorkoutSaveEpoch &&
      coachWorkoutContextsMatch(coachWorkoutActiveContext, requestedContext)
    );

    if (!saveIsCurrent) {
      return { saved: true, rows: rows.length, stale: true };
    }

    const settledDeleteIds = new Set(requestedPendingDeletes.map((item) => item.mutationId));

    coachWorkoutPendingDeletes = coachWorkoutPendingDeletes.filter((item) => (
      !settledDeleteIds.has(item.mutationId)
    ));
    exerciseElements.forEach((exercise, index) => {
      if (document.body.contains(exercise) && planned[index]?.code) {
        exercise.dataset.coachWorkoutCode = planned[index].code;
        exercise.dataset.coachWorkoutCodeContext = `${clientEmail}|${entryDate}`;
      } else if (!document.body.contains(exercise) && planned[index]?.code) {
        queueCoachWorkoutPendingDelete(planned[index].code, clientEmail, entryDate);
      }
    });

    coachWorkoutLastSavedSignature = coachWorkoutSaveSignature({
      clientEmail,
      entryDate,
      format,
      exercises: planned
    });
    storeCoachWorkoutDraft({
      syncedAt: new Date().toISOString(),
      syncedSignature: coachWorkoutLastSavedSignature
    });

    setCoachWorkoutStatus(
      automatic
        ? `${rows.length} set${rows.length === 1 ? "" : "s"} autosaved.`
        : `${rows.length} set${rows.length === 1 ? "" : "s"} saved to ${planned.length} exercise${planned.length === 1 ? "" : "s"}. Autosave remains on.`
    );
    return { saved: true, rows: rows.length };
  } catch (error) {
    const saveIsCurrent = (
      saveEpoch === coachWorkoutSaveEpoch &&
      coachWorkoutContextsMatch(coachWorkoutActiveContext, requestedContext)
    );

    if (saveIsCurrent) {
      const draftStored = storeCoachWorkoutDraft();

      setCoachWorkoutStatus(
        automatic
          ? draftStored
            ? "Autosave could not sync. Your draft is safe on this device; use Save Workout to retry."
            : "Autosave could not sync and this device could not back up the draft. Keep this page open and use Save Workout to retry."
          : error.message || "The workout could not be saved. Try again.",
        true
      );
    }
    return { saved: false, error, stale: !saveIsCurrent };
  } finally {
    coachWorkoutAutosaveInFlight = false;

    if (saveButton) {
      saveButton.disabled = false;
    }
    if (finishButton) {
      finishButton.disabled = false;
    }

    const queuedSave = (
      coachWorkoutAutosaveQueued &&
      coachWorkoutAutosaveQueuedEpoch === coachWorkoutSaveEpoch
    );
    const sameEpochChanged = (
      saveEpoch === coachWorkoutSaveEpoch &&
      coachWorkoutChangeRevision !== saveRevision
    );

    coachWorkoutAutosaveQueued = false;
    coachWorkoutAutosaveQueuedEpoch = null;

    if (queuedSave || sameEpochChanged) {
      scheduleCoachWorkoutAutosave({ recordChange: false, delayMs: 0 });
    }
  }
}

async function finishCoachWorkout() {
  if (coachWorkoutAutosaveInFlight) {
    setCoachWorkoutStatus("An autosave is finishing. Tap Finish Workout again in a moment.");
    return;
  }

  const finishButton = document.getElementById("coach-workout-finish");

  if (finishButton) {
    finishButton.disabled = true;
  }

  const result = await saveCoachWorkout();

  if (result.saved && !result.stale) {
    resetCoachWorkoutForm();
    setCoachWorkoutStatus("Workout finished and saved. The logger is ready for the next session.");
  }

  if (finishButton) {
    finishButton.disabled = false;
  }
}

function resetCoachWorkoutForm(options = {}) {
  const form = document.getElementById("coach-workout-log-form");
  const selectedClient = document.getElementById("coach-workout-client")?.value || "";
  const selectedDate = document.getElementById("coach-workout-date")?.value || coachWorkoutToday();
  const previousContext = normalizeCoachWorkoutContext(coachWorkoutActiveContext);

  cancelCoachWorkoutAutosave();
  coachWorkoutAutosaveQueued = false;
  coachWorkoutAutosaveQueuedEpoch = null;
  coachWorkoutSaveEpoch += 1;
  coachWorkoutChangeRevision += 1;

  if (options.clearDraft !== false) {
    clearCoachWorkoutDraft(previousContext);
  }

  form?.reset();
  renderCoachWorkoutClients();
  const clientSelect = document.getElementById("coach-workout-client");

  if (clientSelect && Array.from(clientSelect.options).some((option) => option.value === selectedClient)) {
    clientSelect.value = selectedClient;
  }

  const dateInput = document.getElementById("coach-workout-date");

  if (dateInput) {
    dateInput.value = selectedDate;
  }

  resetCoachWorkoutEditor();
  coachWorkoutActiveContext = currentCoachWorkoutContext();

  if (
    options.clearDraft !== false &&
    !coachWorkoutContextsMatch(previousContext, coachWorkoutActiveContext)
  ) {
    clearCoachWorkoutDraft(coachWorkoutActiveContext);
  }

  if (options.persistContext !== false) {
    storeCoachWorkoutActiveContext(coachWorkoutActiveContext);
  }
  setCoachWorkoutStatus("Autosave is on. Choose a client and add the exercises completed today.");
}

function handleCoachWorkoutForm() {
  const form = document.getElementById("coach-workout-log-form");
  const exerciseList = document.getElementById("coach-workout-exercises");
  const groupedView = document.getElementById("coach-workout-grouped-view");

  if (!form || !exerciseList || !groupedView) {
    return;
  }

  document.getElementById("coach-workout-add-exercise")?.addEventListener("click", () => {
    const exercise = addCoachWorkoutExercise();
    const index = coachWorkoutExerciseElements().indexOf(exercise);
    moveCoachWorkoutCarousel(index);
    scheduleCoachWorkoutAutosave();
    if (!focusCoachWorkoutGroupedControl(index, null, "name")) {
      exercise?.querySelector("[data-coach-workout-name]")?.focus();
    }
  });
  document.getElementById("coach-workout-reset")?.addEventListener("click", () => resetCoachWorkoutForm());
  document.getElementById("coach-workout-finish")?.addEventListener("click", finishCoachWorkout);
  form.addEventListener("submit", saveCoachWorkout);
  form.addEventListener("input", (event) => {
    if (event.target.matches("#coach-workout-client, #coach-workout-date")) {
      return;
    }

    scheduleCoachWorkoutAutosave();
  });
  form.addEventListener("change", (event) => {
    if (event.target.matches("#coach-workout-client, #coach-workout-date")) {
      switchCoachWorkoutContext();
      return;
    }

    if (event.target.matches('input[name="coach_workout_format"]')) {
      renumberCoachWorkoutExercises();
    }

    scheduleCoachWorkoutAutosave();
  });
  exerciseList.addEventListener("input", (event) => {
    const exercise = event.target.closest("[data-coach-workout-exercise]");

    if (event.target.matches("[data-coach-workout-name]")) {
      renderCoachWorkoutSuggestions(event.target);
      return;
    }

    if (exercise && event.target.matches("[data-coach-workout-set-label], [data-coach-workout-weight], [data-coach-workout-reps], [data-coach-workout-notes]")) {
      updateCoachWorkoutSetRows(exercise);
      const notesState = exercise.querySelector("[data-coach-workout-notes-state]");
      if (notesState) notesState.textContent = exercise.querySelector("[data-coach-workout-notes]")?.value.trim() ? "Added" : "";
    }
  });
  exerciseList.addEventListener("click", (event) => {
    const suggestionButton = event.target.closest("[data-coach-workout-suggestion]");
    const removeButton = event.target.closest("[data-coach-workout-remove]");
    const toggleButton = event.target.closest("[data-coach-workout-toggle]");
    const addSetButton = event.target.closest("[data-coach-workout-add-set]");
    const deleteSetButton = event.target.closest("[data-coach-workout-delete-set]");
    const addSupersetButton = event.target.closest("[data-coach-workout-add-superset]");
    const notesButton = event.target.closest("[data-coach-workout-notes-toggle]");
    const exercise = event.target.closest("[data-coach-workout-exercise]");

    if (suggestionButton && exercise) {
      const input = exercise.querySelector("[data-coach-workout-name]");
      if (input) input.value = suggestionButton.dataset.coachWorkoutSuggestion || "";
      closeCoachWorkoutSuggestions();
      scheduleCoachWorkoutAutosave();
      input?.focus();
      return;
    }

    if (toggleButton && exercise) {
      const detail = exercise.querySelector(".coach-workout-exercise-detail");
      const expanded = toggleButton.getAttribute("aria-expanded") !== "false";
      toggleButton.setAttribute("aria-expanded", String(!expanded));
      toggleButton.setAttribute("aria-label", expanded ? "Expand exercise" : "Collapse exercise");
      exercise.classList.toggle("is-open", !expanded);
      if (detail) detail.hidden = expanded;
      return;
    }

    if (addSetButton && exercise) {
      const addedRow = addCoachWorkoutSetToExercise(exercise);
      renderCoachWorkoutGroupedView();
      scheduleCoachWorkoutAutosave();
      addedRow?.querySelector("[data-coach-workout-weight]")?.focus();
      return;
    }

    if (deleteSetButton && exercise) {
      deleteCoachWorkoutSetFromExercise(exercise);
      renderCoachWorkoutGroupedView();
      scheduleCoachWorkoutAutosave();
      return;
    }

    if (addSupersetButton && exercise) {
      const pairedExercise = addCoachWorkoutExercise({}, exercise);
      const index = coachWorkoutExerciseElements().indexOf(pairedExercise);
      moveCoachWorkoutCarousel(index);
      scheduleCoachWorkoutAutosave();
      pairedExercise?.querySelector("[data-coach-workout-name]")?.focus();
      return;
    }

    if (notesButton && exercise) {
      const content = document.getElementById(notesButton.getAttribute("aria-controls"));
      const icon = notesButton.querySelector("span[aria-hidden]");
      const expanded = notesButton.getAttribute("aria-expanded") === "true";
      notesButton.setAttribute("aria-expanded", String(!expanded));
      if (content) content.hidden = expanded;
      if (icon) icon.textContent = expanded ? "+" : "−";
      if (!expanded) content?.querySelector("textarea")?.focus();
      return;
    }

    if (!removeButton || !exercise || exerciseList.querySelectorAll("[data-coach-workout-exercise]").length <= 1) {
      return;
    }

    const removedIndex = coachWorkoutExerciseElements().indexOf(exercise);
    queueCoachWorkoutExerciseRemoval(exercise);
    exercise.remove();
    renumberCoachWorkoutExercises();
    moveCoachWorkoutCarousel(Math.max(removedIndex - 1, 0));
    scheduleCoachWorkoutAutosave();
  });
  exerciseList.addEventListener("focusin", (event) => {
    if (event.target.matches("[data-coach-workout-name]")) {
      renderCoachWorkoutSuggestions(event.target);
    }
  });
  exerciseList.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && event.target.matches("[data-coach-workout-name]")) {
      closeCoachWorkoutSuggestions();
      event.target.setAttribute("aria-expanded", "false");
    }
  });
  groupedView.addEventListener("input", (event) => {
    const control = event.target.closest("[data-coach-workout-grouped-field]");

    if (!control) return;
    event.stopPropagation();

    const canonical = coachWorkoutGroupedCanonicalControl(control);
    if (!canonical) return;

    canonical.value = control.value;
    canonical.dispatchEvent(new Event("input", { bubbles: true }));
    updateCoachWorkoutGroupedDerivedState();

    if (control.dataset.coachWorkoutGroupedField === "name") {
      renderCoachWorkoutGroupedSuggestions(control);
    }
  });
  groupedView.addEventListener("change", (event) => {
    const control = event.target.closest("[data-coach-workout-grouped-field]");

    if (!control) return;
    event.stopPropagation();

    const canonical = coachWorkoutGroupedCanonicalControl(control);
    if (canonical) {
      canonical.value = control.value;
      canonical.dispatchEvent(new Event("change", { bubbles: true }));
    }
    updateCoachWorkoutGroupedDerivedState();
  });
  groupedView.addEventListener("focusin", (event) => {
    const nameInput = event.target.closest('[data-coach-workout-grouped-field="name"]');
    if (nameInput) renderCoachWorkoutGroupedSuggestions(nameInput);
  });
  groupedView.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && event.target.matches('[data-coach-workout-grouped-field="name"]')) {
      closeCoachWorkoutGroupedSuggestions();
      event.target.setAttribute("aria-expanded", "false");
    }
  });
  groupedView.addEventListener("click", (event) => {
    const suggestion = event.target.closest("[data-coach-workout-grouped-suggestion]");
    const card = event.target.closest("[data-coach-workout-grouped-card]");
    const groupIndex = Number(card?.dataset.coachWorkoutGroupIndex || 0);
    const format = coachWorkoutFormatValue();
    const group = coachWorkoutGroupedExerciseGroups(format)[groupIndex] || [];

    if (suggestion) {
      const input = suggestion.closest("[data-coach-workout-grouped-exercise-key]")
        ?.querySelector('[data-coach-workout-grouped-field="name"]');
      const canonical = coachWorkoutGroupedCanonicalControl(input);

      if (input) input.value = suggestion.dataset.coachWorkoutGroupedSuggestion || "";
      if (canonical) {
        canonical.value = input.value;
        canonical.dispatchEvent(new Event("input", { bubbles: true }));
      }
      closeCoachWorkoutGroupedSuggestions();
      renderCoachWorkoutGroupedView();
      return;
    }

    const keyToggle = event.target.closest("[data-coach-workout-grouped-key-toggle]");
    if (keyToggle && card) {
      const groupId = card.dataset.coachWorkoutGroupId;
      if (coachWorkoutCollapsedExerciseKeys.has(groupId)) {
        coachWorkoutCollapsedExerciseKeys.delete(groupId);
      } else {
        coachWorkoutCollapsedExerciseKeys.add(groupId);
      }
      renderCoachWorkoutGroupedView();
      return;
    }

    const remove = event.target.closest("[data-coach-workout-grouped-remove]");
    if (remove) {
      coachWorkoutExerciseElements()[Number(remove.dataset.coachWorkoutExerciseIndex)]
        ?.querySelector("[data-coach-workout-remove]")?.click();
      return;
    }

    const typeToggle = event.target.closest("[data-coach-workout-grouped-toggle-type]");
    if (typeToggle) {
      const exercise = coachWorkoutExerciseElements()[Number(typeToggle.dataset.coachWorkoutExerciseIndex)];
      const row = exercise?.querySelectorAll("[data-coach-workout-set-row]")[Number(typeToggle.dataset.coachWorkoutRowIndex)];
      const label = row?.querySelector("[data-coach-workout-set-label]");
      const isWarmUp = coachWorkoutSetType(row?.dataset.coachWorkoutSetType, row?.dataset.coachWorkoutSetNumber) === coachWorkoutWarmUpSetType;

      if (label) label.value = isWarmUp ? "1" : "W";
      updateCoachWorkoutSetRows(exercise);
      renderCoachWorkoutGroupedView();
      scheduleCoachWorkoutAutosave();
      return;
    }

    if (event.target.closest("[data-coach-workout-grouped-add-round]")) {
      group.forEach(addCoachWorkoutSetToExercise);
      renderCoachWorkoutGroupedView();
      scheduleCoachWorkoutAutosave();
      return;
    }

    if (event.target.closest("[data-coach-workout-grouped-delete-round]")) {
      const removed = group.map(deleteCoachWorkoutSetFromExercise).some(Boolean);
      if (removed) scheduleCoachWorkoutAutosave();
      renderCoachWorkoutGroupedView();
      return;
    }

    if (event.target.closest("[data-coach-workout-grouped-add-pair]") && group[0]) {
      const pairedExercise = addCoachWorkoutExercise({}, group[group.length - 1]);
      const index = coachWorkoutExerciseElements().indexOf(pairedExercise);
      scheduleCoachWorkoutAutosave();
      renderCoachWorkoutGroupedView();
      focusCoachWorkoutGroupedControl(index, null, "name");
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".coach-workout-exercise-name, [data-coach-workout-suggestions], [data-coach-workout-grouped-exercise-key]")) {
      closeCoachWorkoutSuggestions();
      closeCoachWorkoutGroupedSuggestions();
    }
  });

  window.addEventListener("pagehide", () => storeCoachWorkoutDraft());
}

async function loadCoachWorkoutData() {
  const [programResult, exerciseResult] = await Promise.all([
    coachWorkoutSupabase
      .from("client_programs")
      .select("id,client_email,client_name,active,client_archived,updated_at,created_at")
      .order("client_name", { ascending: true }),
    coachWorkoutSupabase
      .from("exercise_library")
      .select("name,is_active,sort_order")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
  ]);

  if (programResult.error) {
    throw new Error(`Clients could not be loaded: ${programResult.error.message}`);
  }

  if (exerciseResult.error) {
    throw new Error(`Exercise suggestions could not be loaded: ${exerciseResult.error.message}`);
  }

  coachWorkoutPrograms = programResult.data || [];
  coachWorkoutExerciseLibrary = exerciseResult.data || [];
  renderCoachWorkoutClients();
}

async function signOutCoachWorkout() {
  cancelCoachWorkoutAutosave();
  coachWorkoutSaveEpoch += 1;
  coachWorkoutAutosaveQueued = false;
  coachWorkoutAutosaveQueuedEpoch = null;

  if (coachWorkoutSupabase) {
    await coachWorkoutSupabase.auth.signOut();
  }

  redirectToCoachWorkoutLogin();
}

async function bootCoachWorkoutPage() {
  if (!document.querySelector(".coach-workout-log-page")) {
    return;
  }

  handleCoachWorkoutForm();
  document.querySelector("[data-coach-workout-sign-out]")?.addEventListener("click", signOutCoachWorkout);

  if (!coachWorkoutSupabase) {
    setCoachWorkoutAccessStatus("The private coach portal is not configured.", true);
    return;
  }

  const { data, error } = await coachWorkoutSupabase.auth.getUser();
  const user = data?.user;

  if (error || !user) {
    redirectToCoachWorkoutLogin();
    return;
  }

  if (!isCoachWorkoutEmail(user.email)) {
    await coachWorkoutSupabase.auth.signOut();
    redirectToCoachWorkoutLogin();
    return;
  }

  coachWorkoutDraftOwner = normalizeCoachWorkoutEmail(user.email);

  try {
    const storedContext = readCoachWorkoutActiveContext();

    await loadCoachWorkoutData();
    resetCoachWorkoutForm({ clearDraft: false, persistContext: false });
    const restoredDraft = restoreCoachWorkoutDraft({ context: storedContext || currentCoachWorkoutContext() });

    if (restoredDraft) {
      scheduleCoachWorkoutAutosave({ recordChange: false });
    } else {
      coachWorkoutActiveContext = currentCoachWorkoutContext();
      storeCoachWorkoutActiveContext(coachWorkoutActiveContext);
    }
    document.getElementById("coach-workout-access-status")?.setAttribute("hidden", "");
    document.getElementById("coach-workout-log-form")?.removeAttribute("hidden");
    const signOutButton = document.querySelector("[data-coach-workout-sign-out]");

    if (signOutButton) {
      signOutButton.hidden = false;
    }
  } catch (loadError) {
    setCoachWorkoutAccessStatus(loadError.message || "The workout logger could not be loaded.", true);
  }
}

bootCoachWorkoutPage();
