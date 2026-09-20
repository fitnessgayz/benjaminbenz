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
  ? window.supabase.createClient(coachWorkoutConfig.url, coachWorkoutConfig.anonKey, {
      auth: { storage: window.FWB_AUTH_SESSION.storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
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
let coachWorkoutPreviousHistory = new Map();
let coachWorkoutPreviousHistoryStatus = "idle";
let coachWorkoutPreviousHistoryRequest = 0;

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

async function restoreCoachWorkoutUser() {
  try {
    const { data, error } = await coachWorkoutSupabase.auth.getUser();
    if (error) throw error;

    const user = data?.user;
    if (!user) redirectToCoachWorkoutLogin();
    return user || null;
  } catch (error) {
    if (window.FWB_AUTH_SESSION.requiresLogin(error)) {
      redirectToCoachWorkoutLogin();
    } else {
      setCoachWorkoutAccessStatus(
        "We couldn't confirm your sign-in. Check your connection and refresh this page to try again.",
        true
      );
    }
    return null;
  }
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

function coachWorkoutClientNameOptions() {
  const clients = activeCoachWorkoutClients();
  return clients.map(client => {
    const name = String(client.client_name || client.client_email).trim();
    const duplicates = clients.filter(item => String(item.client_name || item.client_email).trim().toLowerCase() === name.toLowerCase()).length;
    return { email: normalizeCoachWorkoutEmail(client.client_email), name,
      value: duplicates > 1 ? `${name} — ${client.client_email}` : name };
  });
}

function syncCoachWorkoutClientName() {
  const input = document.getElementById("coach-workout-client-name");
  if (!input) return;
  const email = normalizeCoachWorkoutEmail(document.getElementById("coach-workout-client")?.value);
  input.value = coachWorkoutClientNameOptions().find(client => client.email === email)?.value || "";
  input.setCustomValidity("");
}

function handleCoachWorkoutClientNameInput(input) {
  const select = document.getElementById("coach-workout-client");
  if (!select) return;
  const query = input.value.trim().toLowerCase();
  const match = coachWorkoutClientNameOptions().find(client => client.value.toLowerCase() === query || client.email === query);
  input.setCustomValidity(query && !match ? "Choose an active client from the suggestions to save this workout." : "");
  const email = match?.email || "";
  if (select.value !== email) {
    select.value = email;
    // Clear the old client immediately so typing cannot save to the previous client.
    switchCoachWorkoutContext();
  }
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
  const suggestions = document.getElementById("coach-workout-client-suggestions");
  suggestions?.replaceChildren(...coachWorkoutClientNameOptions().map(client => new Option(client.email, client.value)));
  syncCoachWorkoutClientName();
}

function closeCoachWorkoutSuggestions(exceptInput = null) {
  document.querySelectorAll("[data-coach-workout-suggestions]").forEach((menu) => {
    const editor = menu.closest("[data-coach-workout-exercise], [data-coach-grouped-name-row]");
    const input = editor?.querySelector("[data-coach-workout-name], [data-coach-grouped-name]");

    if (input === exceptInput) {
      return;
    }

    menu.hidden = true;
    input?.setAttribute("aria-expanded", "false");
  });
}

function renderCoachWorkoutSuggestions(input) {
  const editor = input?.closest("[data-coach-workout-exercise], [data-coach-grouped-name-row]");
  const menu = editor?.querySelector("[data-coach-workout-suggestions]");

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
          <span class="coach-workout-name-field-label">Exercise name</span>
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
          <div class="coach-workout-set-header" aria-hidden="true">
            <span>Set</span><span>Weight</span><span>Reps</span><span>RIR</span>
          </div>
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

function coachWorkoutDefaultExerciseCount(format = coachWorkoutFormatValue()) {
  if (format === "superset") return 2;
  if (format === "circuit") return 3;
  return 1;
}

function coachWorkoutExerciseHasEnteredContent(exercise) {
  if (!exercise) return false;

  const name = exercise.querySelector("[data-coach-workout-name]")?.value.trim() || "";
  const notes = exercise.querySelector("[data-coach-workout-notes]")?.value.trim() || "";
  const hasSetValue = Array.from(exercise.querySelectorAll("[data-coach-workout-set-row]")).some((row) => (
    Boolean(row.querySelector("[data-coach-workout-weight]")?.value.trim()) ||
    Boolean(row.querySelector("[data-coach-workout-reps]")?.value.trim()) ||
    Boolean(row.querySelector("[data-coach-workout-rir]")?.value.trim())
  ));

  return Boolean(name || notes || hasSetValue);
}

function resizeUntouchedCoachWorkoutExercises(format, target = coachWorkoutDefaultExerciseCount(format)) {
  const list = document.getElementById("coach-workout-exercises");
  const exercises = coachWorkoutExerciseElements();
  const hasEnteredContent = exercises.some(coachWorkoutExerciseHasEnteredContent);

  if (!list) {
    return false;
  }

  while (list.querySelectorAll("[data-coach-workout-exercise]").length < target) {
    list.insertAdjacentHTML("beforeend", coachWorkoutExerciseMarkup());
  }

  if (!hasEnteredContent) {
    while (list.querySelectorAll("[data-coach-workout-exercise]").length > target) {
      list.querySelector("[data-coach-workout-exercise]:last-child")?.remove();
    }

    if (format === "single") {
      const firstExercise = list.querySelector("[data-coach-workout-exercise]");
      const rows = firstExercise?.querySelector("[data-coach-workout-set-rows]");
      if (rows) rows.innerHTML = coachWorkoutSetMarkup({}, 0);
      updateCoachWorkoutSetRows(firstExercise);
    }
  }

  return true;
}

function coachWorkoutSetRowsByType(exercise, setType) {
  return Array.from(exercise?.querySelectorAll("[data-coach-workout-set-row]") || [])
    .filter((row) => coachWorkoutSetType(
      row.dataset.coachWorkoutSetType,
      row.dataset.coachWorkoutSetNumber
    ) === setType);
}

function normalizeCoachWorkoutGroupedRows(exercises) {
  const target = Math.max(
    1,
    ...exercises.map((exercise) => coachWorkoutSetRowsByType(exercise, coachWorkoutWorkingSetType).length)
  );

  exercises.forEach((exercise) => {
    const rows = exercise.querySelector("[data-coach-workout-set-rows]");
    let workingRows = coachWorkoutSetRowsByType(exercise, coachWorkoutWorkingSetType);

    while (rows && workingRows.length < target) {
      rows.insertAdjacentHTML("beforeend", coachWorkoutSetMarkup({ setType: coachWorkoutWorkingSetType }, rows.children.length));
      workingRows = coachWorkoutSetRowsByType(exercise, coachWorkoutWorkingSetType);
    }

    updateCoachWorkoutSetRows(exercise);
  });

  return target;
}

function coachWorkoutGroupedExerciseCode(groupIndex, exerciseIndex) {
  const groupLetter = String.fromCharCode(65 + Math.min(Math.max(Number(groupIndex) || 0, 0), 25));
  return `${groupLetter}${Number(exerciseIndex) + 1}`;
}

function coachWorkoutGroupedRoundCode(roundNumber, exerciseIndex) {
  const roundLetter = String.fromCharCode(64 + Math.min(Math.max(Number(roundNumber) || 1, 1), 26));
  return `${roundLetter}${Number(exerciseIndex) + 1}`;
}

function coachWorkoutGroupedFieldMarkup(field, value, context, exerciseIndex, setType, setIndex, placeholder = "") {
  const label = field === "weight" ? "Weight" : field === "reps" ? "Reps" : "RIR";
  const step = field === "weight" ? "0.5" : "1";
  const attributes = `data-coach-grouped-field="${field}" data-coach-grouped-exercise-index="${exerciseIndex}" data-coach-grouped-set-type="${setType}" data-coach-grouped-set-index="${setIndex}" aria-label="${escapeCoachWorkoutHtml(`${label}, ${context}`)}"`;

  if (field === "rir") {
    return `
      <label class="coach-workout-grouped-field">
        <span>${label}</span>
        <select ${attributes}>
          <option value=""${String(value) === "" ? " selected" : ""}>—</option>
          ${[0, 1, 2, 3, 4].map((option) => `<option value="${option}"${String(value) === String(option) ? " selected" : ""}>${option}</option>`).join("")}
        </select>
      </label>
    `;
  }

  return `
    <label class="coach-workout-grouped-field">
      <span>${label}</span>
      <input
        type="number"
        min="0"
        step="${step}"
        inputmode="decimal"
        value="${escapeCoachWorkoutHtml(value)}"
        placeholder="${escapeCoachWorkoutHtml(placeholder)}"
        ${attributes}
      />
    </label>
  `;
}

function coachWorkoutGroupedSetRowMarkup(row, code, exerciseIndex, setType, setIndex, context) {
  return `
    <div class="coach-workout-grouped-row${setType === coachWorkoutWarmUpSetType ? " is-warm-up" : ""}" data-coach-grouped-row>
      <span class="coach-workout-grouped-code">${escapeCoachWorkoutHtml(code)}</span>
      ${coachWorkoutGroupedFieldMarkup("weight", row?.querySelector("[data-coach-workout-weight]")?.value || "", context, exerciseIndex, setType, setIndex, row?.querySelector("[data-coach-workout-weight]")?.placeholder || "0")}
      ${coachWorkoutGroupedFieldMarkup("reps", row?.querySelector("[data-coach-workout-reps]")?.value || "", context, exerciseIndex, setType, setIndex, row?.querySelector("[data-coach-workout-reps]")?.placeholder || "0")}
      ${coachWorkoutGroupedFieldMarkup("rir", row?.querySelector("[data-coach-workout-rir]")?.value || "", context, exerciseIndex, setType, setIndex)}
    </div>
  `;
}

function coachWorkoutGroupedColumnLabelsMarkup() {
  return `
    <div class="coach-workout-grouped-columns" aria-hidden="true">
      <span>Set</span><span>Weight</span><span>Reps</span><span>RIR</span>
    </div>
  `;
}

function coachWorkoutGroupedNameRowMarkup(exercise, groupIndex, position, exerciseIndex) {
  const code = coachWorkoutGroupedExerciseCode(groupIndex, position);
  const input = exercise.querySelector("[data-coach-workout-name]");
  const suggestionId = `coach-grouped-exercise-${groupIndex}-${position}-suggestions`;

  return `
    <div class="coach-workout-group-name-row" data-coach-grouped-name-row>
      <strong>${escapeCoachWorkoutHtml(code)}</strong>
      <span class="coach-workout-group-name-input">
        <input
          type="text"
          value="${escapeCoachWorkoutHtml(input?.value || "")}"
          placeholder="Input exercise name here"
          autocomplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="${suggestionId}"
          aria-expanded="false"
          data-coach-grouped-name
          data-coach-grouped-name-input
          data-coach-grouped-exercise-index="${exerciseIndex}"
        />
        <span class="coach-workout-suggestion-menu" id="${suggestionId}" role="listbox" data-coach-workout-suggestions hidden></span>
      </span>
      <button type="button" data-coach-grouped-delete-exercise="${exerciseIndex}" aria-label="Delete ${escapeCoachWorkoutHtml(code)}"${coachWorkoutExerciseElements().length <= 1 ? " disabled" : ""}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" />
        </svg>
      </button>
    </div>
  `;
}

function coachWorkoutGroupedNameEditorMarkup(group, groupIndex) {
  const codes = group.map((_, index) => coachWorkoutGroupedExerciseCode(groupIndex, index));
  const fieldsId = `coach-workout-group-names-${groupIndex}`;

  return `
    <section class="coach-workout-group-name-section">
      <button class="coach-workout-group-name-toggle" type="button" data-coach-grouped-name-toggle aria-expanded="true" aria-controls="${fieldsId}">
        <span><strong>Exercises</strong><small>${escapeCoachWorkoutHtml(codes.join(" · "))}</small></span>
        <i aria-hidden="true">−</i>
      </button>
      <div class="coach-workout-group-name-fields" id="${fieldsId}" data-coach-grouped-name-fields>
        ${group.map(({ exercise, exerciseIndex }, position) => coachWorkoutGroupedNameRowMarkup(exercise, groupIndex, position, exerciseIndex)).join("")}
      </div>
    </section>
  `;
}

function normalizeCoachWorkoutHistoryName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function coachWorkoutHistorySessionKey(row) {
  return String(row?.workout_session_id || "").trim()
    || `${String(row?.entry_date || "")}|${String(row?.workout_title || "")}`;
}

function coachWorkoutHistoryTimestamp(row) {
  const timestamp = Date.parse(row?.completed_at || row?.created_at || `${row?.entry_date || ""}T00:00:00`);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function buildCoachWorkoutPreviousHistory(rows = []) {
  const sessionsByExercise = new Map();

  rows.forEach((row) => {
    const exerciseName = String(row?.exercise_name || "").trim();
    const exerciseKey = normalizeCoachWorkoutHistoryName(exerciseName);
    const sessionKey = coachWorkoutHistorySessionKey(row);

    if (!exerciseKey || !row?.entry_date || !sessionKey) return;

    if (!sessionsByExercise.has(exerciseKey)) {
      sessionsByExercise.set(exerciseKey, new Map());
    }

    const exerciseSessions = sessionsByExercise.get(exerciseKey);
    const session = exerciseSessions.get(sessionKey) || {
      exerciseName,
      entryDate: String(row.entry_date),
      workoutTitle: String(row.workout_title || "Workout"),
      timestamp: 0,
      rows: []
    };

    session.timestamp = Math.max(session.timestamp, coachWorkoutHistoryTimestamp(row));
    session.rows.push(row);
    exerciseSessions.set(sessionKey, session);
  });

  const history = new Map();

  sessionsByExercise.forEach((sessions, exerciseKey) => {
    const latest = Array.from(sessions.values()).sort((first, second) => (
      second.entryDate.localeCompare(first.entryDate) || second.timestamp - first.timestamp
    ))[0];

    if (!latest) return;

    latest.rows.sort((first, second) => {
      const firstWarmUp = coachWorkoutSetType(first.set_type, first.set_number) === coachWorkoutWarmUpSetType;
      const secondWarmUp = coachWorkoutSetType(second.set_type, second.set_number) === coachWorkoutWarmUpSetType;

      return Number(secondWarmUp) - Number(firstWarmUp)
        || Number(first.set_number || 0) - Number(second.set_number || 0);
    });
    history.set(exerciseKey, latest);
  });

  return history;
}

function coachWorkoutHistoryDateLabel(value) {
  const date = new Date(`${String(value || "")}T12:00:00`);

  if (Number.isNaN(date.getTime())) return String(value || "Previous session");

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function updateCoachWorkoutHistoryPlaceholders(exercise) {
  const name = exercise.querySelector("[data-coach-workout-name]")?.value || "";
  const history = coachWorkoutPreviousHistoryStatus === "ready"
    ? coachWorkoutPreviousHistory.get(normalizeCoachWorkoutHistoryName(name))
    : null;

  [coachWorkoutWarmUpSetType, coachWorkoutWorkingSetType].forEach((setType) => {
    const previousRows = (history?.rows || []).filter((row) => (
      coachWorkoutSetType(row.set_type, row.set_number) === setType
    ));
    coachWorkoutSetRowsByType(exercise, setType).forEach((row, index) => {
      const previous = previousRows.find((entry) => Number(entry.set_number) === Number(row.dataset.coachWorkoutSetNumber))
        || previousRows[Math.min(index, previousRows.length - 1)];
      [["weight", previous?.weight_used], ["reps", previous?.reps]].forEach(([field, value]) => {
        const input = row.querySelector(`[data-coach-workout-${field}]`);
        if (input) input.placeholder = value === null || value === undefined || value === "" ? "0" : String(value);
      });
    });
  });
}

function coachWorkoutHistoryValue(value) {
  const number = Number(value);

  return Number.isFinite(number) ? String(Number(number.toFixed(2))) : "—";
}

function coachWorkoutPreviousExerciseMarkup(exercise, groupIndex, position) {
  const exerciseName = exercise.querySelector("[data-coach-workout-name]")?.value.trim() || "";
  const history = coachWorkoutPreviousHistory.get(normalizeCoachWorkoutHistoryName(exerciseName));
  const code = coachWorkoutGroupedExerciseCode(groupIndex, position);

  if (!exerciseName) {
    return `<p class="coach-workout-history-empty">Enter an exercise name to see its previous workout.</p>`;
  }

  if (coachWorkoutPreviousHistoryStatus === "loading") {
    return `<p class="coach-workout-history-empty">Checking previous workout history…</p>`;
  }

  if (coachWorkoutPreviousHistoryStatus === "error") {
    return `<p class="coach-workout-history-empty">Previous workout history is temporarily unavailable.</p>`;
  }

  if (!history) {
    return `<p class="coach-workout-history-empty"><strong>${escapeCoachWorkoutHtml(code)} · ${escapeCoachWorkoutHtml(exerciseName)}</strong><span>No earlier workout found.</span></p>`;
  }

  return `
    <article class="coach-workout-history-exercise">
      <header>
        <strong>${escapeCoachWorkoutHtml(code)} · ${escapeCoachWorkoutHtml(exerciseName)}</strong>
        <span>${escapeCoachWorkoutHtml(coachWorkoutHistoryDateLabel(history.entryDate))} · ${escapeCoachWorkoutHtml(history.workoutTitle)}</span>
      </header>
      <div class="coach-workout-history-sets">
        ${history.rows.map((row, index) => {
          const isWarmUp = coachWorkoutSetType(row.set_type, row.set_number) === coachWorkoutWarmUpSetType;
          const setLabel = isWarmUp ? `W${index + 1}` : String(row.set_number || index + 1);
          const rir = row.effort_scale === "rir" && row.effort_value !== null && row.effort_value !== undefined
            ? `RIR ${coachWorkoutHistoryValue(row.effort_value)}`
            : "RIR —";

          return `<div><b>${escapeCoachWorkoutHtml(setLabel)}</b><span>${escapeCoachWorkoutHtml(coachWorkoutHistoryValue(row.weight_used))} lb</span><span>${escapeCoachWorkoutHtml(coachWorkoutHistoryValue(row.reps))} reps</span><span>${escapeCoachWorkoutHtml(rir)}</span></div>`;
        }).join("")}
      </div>
    </article>
  `;
}

function coachWorkoutGroupedHistoryMarkup(group, groupIndex) {
  return `
    <section class="coach-workout-grouped-history" data-coach-grouped-history>
      <header><strong>Previous workout</strong><span>Latest earlier session</span></header>
      ${group.map(({ exercise }, position) => coachWorkoutPreviousExerciseMarkup(exercise, groupIndex, position)).join("")}
    </section>
  `;
}

function coachWorkoutGroupedSectionsMarkup(group) {
  const warmUps = group.flatMap(({ exercise, exerciseIndex }, position) => (
    coachWorkoutSetRowsByType(exercise, coachWorkoutWarmUpSetType).map((row, warmUpIndex) => ({
      row,
      exerciseIndex,
      position,
      setIndex: warmUpIndex,
      name: exercise.querySelector("[data-coach-workout-name]")?.value.trim() || `Exercise ${exerciseIndex + 1}`
    }))
  ));
  const warmUpMarkup = warmUps.length > 0 ? `
    <section class="coach-workout-grouped-section is-warm-up" data-coach-grouped-section="warm-up">
      <header><h4>Warm-up</h4><p>Excluded from working volume</p></header>
      ${coachWorkoutGroupedColumnLabelsMarkup()}
      ${warmUps.map((item, index) => coachWorkoutGroupedSetRowMarkup(
        item.row,
        `W${index + 1}`,
        item.exerciseIndex,
        coachWorkoutWarmUpSetType,
        item.setIndex,
        `warm-up, ${item.name}`
      )).join("")}
    </section>
  ` : "";
  const roundCount = Math.max(
    1,
    ...group.map(({ exercise }) => coachWorkoutSetRowsByType(exercise, coachWorkoutWorkingSetType).length)
  );
  const roundsMarkup = Array.from({ length: roundCount }, (_, roundIndex) => {
    const roundNumber = roundIndex + 1;
    const rows = group.map(({ exercise, exerciseIndex }, position) => ({
      row: coachWorkoutSetRowsByType(exercise, coachWorkoutWorkingSetType)[roundIndex],
      exerciseIndex,
      position,
      name: exercise.querySelector("[data-coach-workout-name]")?.value.trim() || `Exercise ${exerciseIndex + 1}`
    }));

    return `
      <section class="coach-workout-grouped-section" data-coach-grouped-section="round" data-coach-grouped-round="${roundNumber}">
        <header><h4>${coachWorkoutFormatValue() === "single" ? "Set" : "Round"} ${roundNumber}</h4><p>${rows.map((item) => coachWorkoutGroupedRoundCode(roundNumber, item.position)).join(" + ")}</p></header>
        ${coachWorkoutGroupedColumnLabelsMarkup()}
        ${rows.map((item) => coachWorkoutGroupedSetRowMarkup(
          item.row,
          coachWorkoutGroupedRoundCode(roundNumber, item.position),
          item.exerciseIndex,
          coachWorkoutWorkingSetType,
          roundIndex,
          `round ${roundNumber}, ${item.name}`
        )).join("")}
        <button class="coach-workout-log-round" type="button" data-coach-grouped-log-round>${coachWorkoutFormatValue() === "single" ? "Log Set" : "Log Round"}</button>
      </section>
    `;
  }).join("");

  return `${warmUpMarkup}${roundsMarkup}`;
}

function coachWorkoutGroupedCardMarkup(format, group, groupIndex) {
  const exercises = group.map(({ exercise }) => exercise);
  const roundCount = normalizeCoachWorkoutGroupedRows(exercises);
  exercises.forEach(updateCoachWorkoutHistoryPlaceholders);
  const title = format === "circuit"
    ? `Circuit ${groupIndex + 1}`
    : format === "superset"
      ? `Superset ${groupIndex + 1}`
      : `Straight set ${groupIndex + 1}`;
  const indexes = group.map(({ exerciseIndex }) => exerciseIndex).join(",");

  return `
    <section class="coach-workout-group-shell" data-coach-workout-group-card data-coach-workout-grouped="true" data-coach-workout-format="${format}" data-coach-workout-group-indexes="${indexes}">
      ${coachWorkoutGroupedNameEditorMarkup(group, groupIndex)}
      <article class="coach-workout-grouped-card">
        <header class="coach-workout-grouped-card-heading">
          <h3>${escapeCoachWorkoutHtml(title)}</h3>
          <p data-coach-grouped-progress>0 / 0 complete</p>
        </header>
        <div class="coach-workout-grouped-exercise-key" role="list" aria-label="Exercises in ${escapeCoachWorkoutHtml(title)}">
          ${group.map(({ exercise }, position) => `
            <div role="listitem"><span>${position + 1}</span><strong data-coach-grouped-exercise-name="${position}">${escapeCoachWorkoutHtml(exercise.querySelector("[data-coach-workout-name]")?.value.trim() || `Exercise ${position + 1}`)}</strong></div>
          `).join("")}
        </div>
        <div class="coach-workout-round-stepper" role="group" aria-label="Number of ${format === "single" ? "sets" : "rounds"}">
          <button type="button" data-coach-grouped-delete-round aria-label="Remove last ${format === "single" ? "set" : "round"}"${roundCount <= 1 ? " disabled" : ""}>−</button>
          <output><span>${format === "single" ? "Sets" : "Rounds"}</span> <strong>${roundCount}</strong></output>
          <button type="button" data-coach-grouped-add-round aria-label="Add ${format === "single" ? "set" : "round"}">+</button>
        </div>
        <div data-coach-grouped-sections>${coachWorkoutGroupedSectionsMarkup(group)}</div>
        <details class="coach-workout-grouped-notes">
          <summary>Exercise notes <span>Optional</span></summary>
          <div>
            ${group.map(({ exercise, exerciseIndex }, position) => `
              <label><span>${escapeCoachWorkoutHtml(coachWorkoutGroupedExerciseCode(groupIndex, position))}</span><textarea rows="2" placeholder="Any exercise modifications?" data-coach-grouped-notes data-coach-grouped-exercise-index="${exerciseIndex}">${escapeCoachWorkoutHtml(exercise.querySelector("[data-coach-workout-notes]")?.value || "")}</textarea></label>
            `).join("")}
          </div>
        </details>
        ${coachWorkoutGroupedHistoryMarkup(group, groupIndex)}
      </article>
    </section>
  `;
}

function coachWorkoutGroups(format, exercises = coachWorkoutExerciseElements()) {
  if (format === "circuit") {
    return [exercises.map((exercise, exerciseIndex) => ({ exercise, exerciseIndex }))];
  }

  if (format === "single") {
    return exercises.map((exercise, exerciseIndex) => [{ exercise, exerciseIndex }]);
  }

  return Array.from({ length: Math.ceil(exercises.length / 2) }, (_, groupIndex) => (
    exercises.slice(groupIndex * 2, (groupIndex * 2) + 2).map((exercise, position) => ({
      exercise,
      exerciseIndex: (groupIndex * 2) + position
    }))
  ));
}

function refreshCoachWorkoutGroupedProgress(card) {
  const rows = Array.from(card?.querySelectorAll("[data-coach-grouped-row]") || []);
  const completed = rows.filter((row) => (
    Boolean(row.querySelector('[data-coach-grouped-field="weight"]')?.value.trim()) &&
    Boolean(row.querySelector('[data-coach-grouped-field="reps"]')?.value.trim())
  )).length;
  const progress = card?.querySelector("[data-coach-grouped-progress]");

  if (progress) progress.textContent = `${completed} / ${rows.length} complete`;
}

function refreshCoachWorkoutPreviousHistoryCards() {
  coachWorkoutExerciseElements().forEach(updateCoachWorkoutHistoryPlaceholders);
  document.querySelectorAll("[data-coach-workout-group-card]").forEach((card) => {
    const indexes = coachWorkoutGroupedExerciseIndexes(card);
    const format = card.dataset.coachWorkoutFormat || coachWorkoutFormatValue();
    const group = indexes.map((exerciseIndex) => ({
      exercise: coachWorkoutExerciseElements()[exerciseIndex],
      exerciseIndex
    })).filter(({ exercise }) => exercise);
    const visibleGroupIndex = format === "single" ? indexes[0] : (
      format === "superset" ? Math.floor((indexes[0] || 0) / 2) : 0
    );
    const history = card.querySelector("[data-coach-grouped-history]");

    card.querySelectorAll('[data-coach-grouped-field="weight"], [data-coach-grouped-field="reps"]').forEach((input) => {
      const row = coachWorkoutCanonicalGroupedRow(
        input.dataset.coachGroupedExerciseIndex,
        input.dataset.coachGroupedSetType,
        input.dataset.coachGroupedSetIndex
      );
      input.placeholder = row?.querySelector(`[data-coach-workout-${input.dataset.coachGroupedField}]`)?.placeholder || "0";
    });

    if (history && group.length > 0) {
      history.outerHTML = coachWorkoutGroupedHistoryMarkup(
        group,
        Number.isFinite(visibleGroupIndex) ? visibleGroupIndex : 0
      );
    }
  });
}

async function loadCoachWorkoutPreviousHistory(context = currentCoachWorkoutContext()) {
  const normalizedContext = normalizeCoachWorkoutContext(context);
  const requestId = ++coachWorkoutPreviousHistoryRequest;

  coachWorkoutPreviousHistory = new Map();

  if (!coachWorkoutSupabase || !normalizedContext.clientEmail || !normalizedContext.entryDate) {
    coachWorkoutPreviousHistoryStatus = "idle";
    refreshCoachWorkoutPreviousHistoryCards();
    return { rows: 0, skipped: true };
  }

  coachWorkoutPreviousHistoryStatus = "loading";
  refreshCoachWorkoutPreviousHistoryCards();

  const { data, error } = await coachWorkoutSupabase
    .from("client_workout_logs")
    .select("entry_date,workout_title,workout_session_id,exercise_name,set_number,weight_used,reps,effort_scale,effort_value,set_type,completed_at,created_at")
    .eq("client_email", normalizedContext.clientEmail)
    .lt("entry_date", normalizedContext.entryDate)
    .order("entry_date", { ascending: false })
    .limit(1000);

  if (
    requestId !== coachWorkoutPreviousHistoryRequest ||
    !coachWorkoutContextsMatch(normalizedContext, currentCoachWorkoutContext())
  ) {
    return { rows: 0, stale: true };
  }

  if (error) {
    coachWorkoutPreviousHistoryStatus = "error";
    coachWorkoutPreviousHistory = new Map();
    refreshCoachWorkoutPreviousHistoryCards();
    return { rows: 0, error };
  }

  coachWorkoutPreviousHistory = buildCoachWorkoutPreviousHistory(data || []);
  coachWorkoutPreviousHistoryStatus = "ready";
  refreshCoachWorkoutPreviousHistoryCards();
  return { rows: (data || []).length };
}

function renderCoachWorkoutCardLayout() {
  const carousel = document.getElementById("coach-workout-carousel");
  const list = document.getElementById("coach-workout-exercises");
  const stack = document.getElementById("coach-workout-group-stack");
  const exercises = coachWorkoutExerciseElements();
  const format = coachWorkoutFormatValue();
  const usesWorkoutCards = ["single", "superset", "circuit"].includes(format);

  if (!carousel) return;

  carousel.dataset.coachWorkoutFormat = format;
  carousel.dataset.carouselEnabled = "false";
  list?.classList.toggle("is-grouped-source", usesWorkoutCards);
  if (stack) stack.hidden = !usesWorkoutCards;
  if (stack && usesWorkoutCards) {
    stack.innerHTML = coachWorkoutGroups(format, exercises)
      .filter((group) => group.length > 0)
      .map((group, groupIndex) => coachWorkoutGroupedCardMarkup(format, group, groupIndex))
      .join("");
    stack.querySelectorAll("[data-coach-workout-group-card]").forEach(refreshCoachWorkoutGroupedProgress);
  } else if (stack) {
    stack.innerHTML = "";
  }

  exercises.forEach((exercise, index) => {
    const nameInput = exercise.querySelector("[data-coach-workout-name]");
    if (nameInput) nameInput.required = !usesWorkoutCards;
    exercise.setAttribute("aria-label", `Exercise ${index + 1} of ${exercises.length}`);
    exercise.setAttribute("aria-roledescription", "exercise");
  });
}

function renderCoachWorkoutCarousel() {
  renderCoachWorkoutCardLayout();
}

function coachWorkoutGroupedExerciseIndexes(card) {
  return String(card?.dataset.coachWorkoutGroupIndexes || "")
    .split(",")
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0);
}

function coachWorkoutCanonicalGroupedRow(exerciseIndex, setType, setIndex) {
  const exercise = coachWorkoutExerciseElements()[Number(exerciseIndex)];
  return coachWorkoutSetRowsByType(exercise, setType)[Number(setIndex)] || null;
}

function addCoachWorkoutGroupedRound(card) {
  coachWorkoutGroupedExerciseIndexes(card).forEach((exerciseIndex) => {
    const exercise = coachWorkoutExerciseElements()[exerciseIndex];
    const rows = exercise?.querySelector("[data-coach-workout-set-rows]");
    const workingRows = coachWorkoutSetRowsByType(exercise, coachWorkoutWorkingSetType);
    const last = workingRows[workingRows.length - 1];
    const values = {
      setType: coachWorkoutWorkingSetType,
      weight: last?.querySelector("[data-coach-workout-weight]")?.value || "",
      reps: last?.querySelector("[data-coach-workout-reps]")?.value || "",
      rir: last?.querySelector("[data-coach-workout-rir]")?.value || ""
    };

    rows?.insertAdjacentHTML("beforeend", coachWorkoutSetMarkup(values, rows.children.length));
    updateCoachWorkoutSetRows(exercise);
  });
  renderCoachWorkoutCardLayout();
}

function deleteCoachWorkoutGroupedRound(card) {
  const indexes = coachWorkoutGroupedExerciseIndexes(card);
  const canDelete = indexes.every((exerciseIndex) => (
    coachWorkoutSetRowsByType(coachWorkoutExerciseElements()[exerciseIndex], coachWorkoutWorkingSetType).length > 1
  ));

  if (!canDelete) return false;

  indexes.forEach((exerciseIndex) => {
    const exercise = coachWorkoutExerciseElements()[exerciseIndex];
    const workingRows = coachWorkoutSetRowsByType(exercise, coachWorkoutWorkingSetType);
    workingRows[workingRows.length - 1]?.remove();
    updateCoachWorkoutSetRows(exercise);
  });
  renderCoachWorkoutCardLayout();
  return true;
}

function renumberCoachWorkoutExercises() {
  const exercises = coachWorkoutExerciseElements();
  const format = coachWorkoutFormatValue();

  exercises.forEach((exercise, index) => {
    const removeButton = exercise.querySelector("[data-coach-workout-remove]");
    const addSuperset = exercise.querySelector("[data-coach-workout-add-superset]");

    if (removeButton) {
      removeButton.disabled = exercises.length === 1;
      removeButton.setAttribute("aria-label", `Remove exercise ${index + 1}`);
    }

    if (addSuperset) {
      addSuperset.hidden = !(format === "superset" && index % 2 === 0 && index === exercises.length - 1);
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
      syncCoachWorkoutClientName();
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

  window.CoachRestTimer?.stop();
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

  void loadCoachWorkoutPreviousHistory(nextContext);

  return true;
}

function cancelCoachWorkoutAutosave() {
  if (coachWorkoutAutosaveTimer) {
    window.clearTimeout(coachWorkoutAutosaveTimer);
    coachWorkoutAutosaveTimer = null;
  }
}

function focusCoachWorkoutVisibleField(exerciseIndex, field, setType = "", setIndex = 0, fallback = null) {
  const stack = document.getElementById("coach-workout-group-stack");
  const selector = field === "name"
    ? `[data-coach-grouped-name-input][data-coach-grouped-exercise-index="${exerciseIndex}"]`
    : `[data-coach-grouped-field="${field}"][data-coach-grouped-exercise-index="${exerciseIndex}"][data-coach-grouped-set-type="${setType}"][data-coach-grouped-set-index="${setIndex}"]`;
  const visible = stack?.querySelector(selector);

  if (visible) {
    const fields = visible.closest("[data-coach-grouped-name-fields]");
    const card = visible.closest("[data-coach-workout-group-card]");
    const toggle = card?.querySelector("[data-coach-grouped-name-toggle]");
    if (fields?.hidden) {
      fields.hidden = false;
      toggle?.setAttribute("aria-expanded", "true");
      const icon = toggle?.querySelector("i");
      if (icon) icon.textContent = "−";
    }
    visible.focus();
    visible.scrollIntoView({ block: "center", behavior: "smooth" });
  } else {
    fallback?.focus();
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
        focusCoachWorkoutVisibleField(index, "name", "", 0, nameInput);
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
      const typeIndex = coachWorkoutSetRowsByType(row, setType).indexOf(setRow);
      const weightText = weightInput?.value.trim() || "";
      const repsText = repsInput?.value.trim() || "";
      const weight = Number(weightText);
      const reps = Number(repsText);
      const rir = rirInput?.value === "" ? null : Number(rirInput?.value);

      if (weightText === "" || !Number.isFinite(weight) || weight < 0) {
        if (options.focusInvalid) {
          focusCoachWorkoutVisibleField(index, "weight", setType, typeIndex, weightInput);
        }
        throw new Error(`${name} set ${setIndex + 1} needs a valid non-negative weight.`);
      }

      if (repsText === "" || !Number.isInteger(reps) || reps < 0) {
        if (options.focusInvalid) {
          focusCoachWorkoutVisibleField(index, "reps", setType, typeIndex, repsInput);
        }
        throw new Error(`${name} set ${setIndex + 1} needs a non-negative whole-number rep count.`);
      }

      if (rir !== null && (!Number.isInteger(rir) || rir < 0 || rir > 4)) {
        if (options.focusInvalid) {
          focusCoachWorkoutVisibleField(index, "rir", setType, typeIndex, rirInput);
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
  window.CoachRestTimer?.stop();
  const form = document.getElementById("coach-workout-log-form");
  const selectedClient = document.getElementById("coach-workout-client")?.value || "";
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
    syncCoachWorkoutClientName();
  }

  const dateInput = document.getElementById("coach-workout-date");

  if (dateInput) {
    dateInput.value = coachWorkoutToday();
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
  if (options.refreshHistory !== false) {
    void loadCoachWorkoutPreviousHistory(coachWorkoutActiveContext);
  }
  setCoachWorkoutStatus("Autosave is on. Choose a client and add the exercises completed today.");
}

function handleCoachWorkoutForm() {
  const form = document.getElementById("coach-workout-log-form");
  const exerciseList = document.getElementById("coach-workout-exercises");
  const groupStack = document.getElementById("coach-workout-group-stack");

  if (!form || !exerciseList) {
    return;
  }

  document.getElementById("coach-workout-add-exercise")?.addEventListener("click", () => {
    const exercise = addCoachWorkoutExercise();
    const index = coachWorkoutExerciseElements().indexOf(exercise);
    scheduleCoachWorkoutAutosave();
    const visibleName = groupStack?.querySelector(`[data-coach-grouped-name-input][data-coach-grouped-exercise-index="${index}"]`)
      || exercise?.querySelector("[data-coach-workout-name]");
    visibleName?.focus();
  });
  document.getElementById("coach-workout-reset")?.addEventListener("click", () => resetCoachWorkoutForm());
  document.getElementById("coach-workout-finish")?.addEventListener("click", finishCoachWorkout);
  form.addEventListener("submit", saveCoachWorkout);
  form.addEventListener("input", (event) => {
    if (event.target.matches("#coach-workout-client-name")) {
      handleCoachWorkoutClientNameInput(event.target);
      return;
    }
    if (event.target.matches("#coach-workout-client, #coach-workout-date")) {
      return;
    }

    scheduleCoachWorkoutAutosave();
  });
  form.addEventListener("change", (event) => {
    if (event.target.matches("#coach-workout-client-name")) return;
    if (event.target.matches("#coach-workout-client, #coach-workout-date")) {
      switchCoachWorkoutContext();
      return;
    }

    if (event.target.matches('input[name="coach_workout_format"]')) {
      const format = event.target.value;
      resizeUntouchedCoachWorkoutExercises(format, coachWorkoutDefaultExerciseCount(format));
      renumberCoachWorkoutExercises();
    }

    scheduleCoachWorkoutAutosave();
  });
  exerciseList.addEventListener("input", (event) => {
    const exercise = event.target.closest("[data-coach-workout-exercise]");

    if (event.target.matches("[data-coach-workout-name]")) {
      refreshCoachWorkoutPreviousHistoryCards();
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
      const rows = exercise.querySelector("[data-coach-workout-set-rows]");
      const currentRows = Array.from(rows?.querySelectorAll("[data-coach-workout-set-row]") || []);
      const last = currentRows[currentRows.length - 1];
      const values = {
        weight: last?.querySelector("[data-coach-workout-weight]")?.value || "",
        reps: last?.querySelector("[data-coach-workout-reps]")?.value || "",
        rir: last?.querySelector("[data-coach-workout-rir]")?.value || ""
      };
      rows?.insertAdjacentHTML("beforeend", coachWorkoutSetMarkup(values, currentRows.length));
      updateCoachWorkoutSetRows(exercise);
      scheduleCoachWorkoutAutosave();
      rows?.querySelector("[data-coach-workout-set-row]:last-child [data-coach-workout-weight]")?.focus();
      return;
    }

    if (deleteSetButton && exercise) {
      const rows = exercise.querySelectorAll("[data-coach-workout-set-row]");
      if (rows.length > 1) rows[rows.length - 1].remove();
      updateCoachWorkoutSetRows(exercise);
      scheduleCoachWorkoutAutosave();
      return;
    }

    if (addSupersetButton && exercise) {
      const pairedExercise = addCoachWorkoutExercise({}, exercise);
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

    queueCoachWorkoutExerciseRemoval(exercise);
    exercise.remove();
    renumberCoachWorkoutExercises();
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
  groupStack?.addEventListener("input", (event) => {
    const card = event.target.closest("[data-coach-workout-group-card]");
    const exerciseIndex = Number(event.target.dataset.coachGroupedExerciseIndex);
    const exercise = coachWorkoutExerciseElements()[exerciseIndex];

    if (event.target.matches("[data-coach-grouped-name-input]")) {
      const canonicalName = exercise?.querySelector("[data-coach-workout-name]");
      const nameRows = Array.from(card?.querySelectorAll("[data-coach-grouped-name-row]") || []);
      const position = nameRows.indexOf(event.target.closest("[data-coach-grouped-name-row]"));
      const keyName = card?.querySelector(`[data-coach-grouped-exercise-name="${position}"]`);

      if (canonicalName) canonicalName.value = event.target.value;
      if (keyName) keyName.textContent = event.target.value.trim() || `Exercise ${exerciseIndex + 1}`;
      refreshCoachWorkoutPreviousHistoryCards();
      renderCoachWorkoutSuggestions(event.target);
      return;
    }

    if (event.target.matches("[data-coach-grouped-notes]")) {
      const canonicalNotes = exercise?.querySelector("[data-coach-workout-notes]");
      if (canonicalNotes) canonicalNotes.value = event.target.value;
      return;
    }

    if (event.target.matches("[data-coach-grouped-field]")) {
      const row = coachWorkoutCanonicalGroupedRow(
        exerciseIndex,
        event.target.dataset.coachGroupedSetType,
        event.target.dataset.coachGroupedSetIndex
      );
      const field = event.target.dataset.coachGroupedField;
      const canonicalField = field === "weight"
        ? row?.querySelector("[data-coach-workout-weight]")
        : field === "reps"
          ? row?.querySelector("[data-coach-workout-reps]")
          : row?.querySelector("[data-coach-workout-rir]");

      if (canonicalField) canonicalField.value = event.target.value;
      updateCoachWorkoutSetRows(exercise);
      refreshCoachWorkoutGroupedProgress(card);
    }
  });
  groupStack?.addEventListener("change", (event) => {
    if (event.target.matches('[data-coach-grouped-field="rir"]')) {
      event.target.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  groupStack?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-coach-workout-group-card]");
    const suggestion = event.target.closest("[data-coach-workout-suggestion]");
    const toggle = event.target.closest("[data-coach-grouped-name-toggle]");
    const remove = event.target.closest("[data-coach-grouped-delete-exercise]");
    const addRound = event.target.closest("[data-coach-grouped-add-round]");
    const deleteRound = event.target.closest("[data-coach-grouped-delete-round]");
    const logRound = event.target.closest("[data-coach-grouped-log-round]");

    if (logRound && card) {
      const section = logRound.closest("[data-coach-grouped-section]");
      const fields = Array.from(section.querySelectorAll('input[data-coach-grouped-field]'));
      const invalid = fields.find((field) => field.value === "" || !field.checkValidity());
      if (invalid) {
        invalid.focus();
        setCoachWorkoutStatus("Enter valid weight and reps for each exercise before logging this set or round.", true);
        return;
      }
      scheduleCoachWorkoutAutosave({ delayMs: 0 });
      window.CoachRestTimer?.start();
      return;
    }

    if (suggestion) {
      const input = suggestion.closest("[data-coach-grouped-name-row]")?.querySelector("[data-coach-grouped-name-input]");
      if (input) {
        input.value = suggestion.dataset.coachWorkoutSuggestion || "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        closeCoachWorkoutSuggestions();
        input.focus();
      }
      return;
    }

    if (toggle) {
      const fields = card?.querySelector("[data-coach-grouped-name-fields]");
      const expanded = toggle.getAttribute("aria-expanded") !== "false";
      toggle.setAttribute("aria-expanded", String(!expanded));
      if (fields) fields.hidden = expanded;
      const icon = toggle.querySelector("i");
      if (icon) icon.textContent = expanded ? "+" : "−";
      return;
    }

    if (remove && coachWorkoutExerciseElements().length > 1) {
      const exerciseIndex = Number(remove.dataset.coachGroupedDeleteExercise);
      const exercise = coachWorkoutExerciseElements()[exerciseIndex];
      if (exercise) {
        queueCoachWorkoutExerciseRemoval(exercise);
        exercise.remove();
        renumberCoachWorkoutExercises();
        scheduleCoachWorkoutAutosave();
      }
      return;
    }

    if (addRound && card) {
      addCoachWorkoutGroupedRound(card);
      scheduleCoachWorkoutAutosave();
      return;
    }

    if (deleteRound && card) {
      if (deleteCoachWorkoutGroupedRound(card)) scheduleCoachWorkoutAutosave();
    }
  });
  groupStack?.addEventListener("focusin", (event) => {
    if (event.target.matches("[data-coach-grouped-name-input]")) {
      renderCoachWorkoutSuggestions(event.target);
    }
  });
  groupStack?.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && event.target.matches("[data-coach-grouped-name-input]")) {
      closeCoachWorkoutSuggestions();
      event.target.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".coach-workout-exercise-name, .coach-workout-group-name-input, [data-coach-workout-suggestions]")) {
      closeCoachWorkoutSuggestions();
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
  window.CoachRestTimer?.stop();
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

  const user = await restoreCoachWorkoutUser();

  if (!user) {
    return;
  }

  if (!isCoachWorkoutEmail(user.email)) {
    await coachWorkoutSupabase.auth.signOut();
    redirectToCoachWorkoutLogin();
    return;
  }

  coachWorkoutDraftOwner = normalizeCoachWorkoutEmail(user.email);

  try {
    await loadCoachWorkoutData();
    resetCoachWorkoutForm({ clearDraft: false, persistContext: false, refreshHistory: false });
    // Reopen on the current local date; older drafts remain available by selecting their date.
    const initialContext = {
      clientEmail: "",
      entryDate: coachWorkoutToday()
    };
    const clientSelect = document.getElementById("coach-workout-client");
    if (Array.from(clientSelect?.options || []).some((option) => option.value === initialContext.clientEmail)) {
      clientSelect.value = initialContext.clientEmail;
    }
    const restoredDraft = restoreCoachWorkoutDraft({ context: initialContext });

    if (restoredDraft) {
      scheduleCoachWorkoutAutosave({ recordChange: false });
    } else {
      coachWorkoutActiveContext = currentCoachWorkoutContext();
      storeCoachWorkoutActiveContext(coachWorkoutActiveContext);
    }
    void loadCoachWorkoutPreviousHistory(coachWorkoutActiveContext);
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
