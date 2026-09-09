const coachWorkoutConfig = window.FWB_SUPABASE_CONFIG || {};
const coachWorkoutEmails = ["benjaminbenz.fit@gmail.com"];
const coachWorkoutLoginUrl = "client-login.html?return_to=%2Fcoach-workout-log.html";
const coachWorkoutAutosaveDelayMs = 10000;
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

function coachWorkoutSetMarkup(values = {}, index = 0) {
  const setLabel = index === 0 ? "" : String(index);
  const rir = String(values.rir ?? "");

  return `
    <div class="coach-workout-set-row" data-coach-workout-set-row>
      <label class="coach-workout-set-label">
        <span>Set</span>
        <input type="text" value="${setLabel}" tabindex="-1" aria-label="Set ${index + 1}" readonly />
      </label>
      <label>
        <span>Weight</span>
        <input type="number" value="${escapeCoachWorkoutHtml(values.weight ?? "")}" min="0" step="0.5" inputmode="decimal" placeholder="0" data-coach-workout-weight />
      </label>
      <label>
        <span>Reps</span>
        <input type="number" value="${escapeCoachWorkoutHtml(values.reps ?? "")}" min="1" step="1" inputmode="numeric" placeholder="0" data-coach-workout-reps />
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
          <span class="sr-only">Exercise name</span>
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

  rows.forEach((row, index) => {
    const label = row.querySelector(".coach-workout-set-label input");
    const weight = row.querySelector("[data-coach-workout-weight]")?.value.trim() || "";
    const reps = row.querySelector("[data-coach-workout-reps]")?.value.trim() || "";

    if (label) {
      label.value = index === 0 ? "" : String(index);
      label.setAttribute("aria-label", `Set ${index + 1}`);
    }

    if (weight !== "" && reps !== "") {
      completed += 1;
    }
  });

  const progress = exercise?.querySelector("[data-coach-workout-progress]");
  const deleteSet = exercise?.querySelector("[data-coach-workout-delete-set]");

  if (progress) {
    progress.textContent = `${completed} / ${rows.length} working sets completed`;
  }

  if (deleteSet) {
    deleteSet.disabled = rows.length <= 1;
  }
}

function coachWorkoutCarouselEnabled() {
  return coachWorkoutFormatValue() !== "single" && coachWorkoutExerciseElements().length > 1;
}

function renderCoachWorkoutCarousel(preferredIndex) {
  const carousel = document.getElementById("coach-workout-carousel");
  const controls = document.getElementById("coach-workout-carousel-controls");
  const status = document.getElementById("coach-workout-carousel-status");
  const dots = document.getElementById("coach-workout-carousel-dots");
  const exercises = coachWorkoutExerciseElements();
  const format = coachWorkoutFormatValue();
  const enabled = format !== "single" && exercises.length > 1;
  const current = Number.isInteger(preferredIndex)
    ? preferredIndex
    : Number(carousel?.dataset.activeIndex || 0);
  const activeIndex = Math.min(Math.max(current, 0), Math.max(exercises.length - 1, 0));

  if (!carousel) {
    return;
  }

  carousel.dataset.coachWorkoutFormat = format;
  carousel.dataset.carouselEnabled = enabled ? "true" : "false";
  carousel.dataset.activeIndex = String(activeIndex);
  if (controls) controls.hidden = !enabled;
  if (status) {
    status.hidden = !enabled;
    status.innerHTML = enabled
      ? `<strong>${escapeCoachWorkoutHtml(coachWorkoutFormatMarker(format, activeIndex))}</strong><span>${activeIndex + 1} of ${exercises.length}</span>`
      : "";
  }
  if (dots) {
    dots.innerHTML = enabled ? exercises.map((_, index) => `
      <button type="button" data-coach-workout-dot="${index}" aria-label="Show exercise ${index + 1}"${index === activeIndex ? ' class="is-active" aria-current="true"' : ""}></button>
    `).join("") : "";
  }

  exercises.forEach((exercise, index) => {
    exercise.classList.toggle("is-carousel-active", enabled && index === activeIndex);
    exercise.setAttribute("aria-label", `Exercise ${index + 1} of ${exercises.length}`);
    exercise.setAttribute("aria-roledescription", enabled ? "slide" : "exercise");
  });

  const previous = carousel.querySelector("button[data-coach-workout-previous]");
  const next = carousel.querySelector("button[data-coach-workout-next]");
  if (previous) previous.disabled = activeIndex === 0;
  if (next) next.disabled = activeIndex === exercises.length - 1;
}

function moveCoachWorkoutCarousel(index) {
  const list = document.getElementById("coach-workout-exercises");
  const exercises = coachWorkoutExerciseElements();

  if (!list || !coachWorkoutCarouselEnabled() || exercises.length === 0) {
    return;
  }

  const activeIndex = Math.min(Math.max(Number(index) || 0, 0), exercises.length - 1);
  renderCoachWorkoutCarousel(activeIndex);
  list.scrollTo({ left: exercises[activeIndex].offsetLeft - list.offsetLeft, behavior: "smooth" });
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
        : "This session could not be backed up on this device. Keep this page open or use Save now.",
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
        nameInput?.focus();
      }
      throw new Error(`Exercise ${index + 1} needs a name.`);
    }

    const setRows = Array.from(row.querySelectorAll("[data-coach-workout-set-row]"));
    const sets = setRows.map((setRow, setIndex) => {
      const weightInput = setRow.querySelector("[data-coach-workout-weight]");
      const repsInput = setRow.querySelector("[data-coach-workout-reps]");
      const rirInput = setRow.querySelector("[data-coach-workout-rir]");
      const weightText = weightInput?.value.trim() || "";
      const repsText = repsInput?.value.trim() || "";
      const weight = Number(weightText);
      const reps = Number(repsText);
      const rir = rirInput?.value === "" ? null : Number(rirInput?.value);

      if (weightText === "" || !Number.isFinite(weight) || weight < 0) {
        if (options.focusInvalid) {
          weightInput?.focus();
        }
        throw new Error(`${name} set ${setIndex + 1} needs a valid non-negative weight.`);
      }

      if (repsText === "" || !Number.isInteger(reps) || reps < 1) {
        if (options.focusInvalid) {
          repsInput?.focus();
        }
        throw new Error(`${name} set ${setIndex + 1} needs a positive whole-number rep count.`);
      }

      if (rir !== null && (!Number.isInteger(rir) || rir < 0 || rir > 4)) {
        if (options.focusInvalid) {
          rirInput?.focus();
        }
        throw new Error(`${name} set ${setIndex + 1} RIR must be between 0 and 4.`);
      }

      return { weight, reps, rir };
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
        : "This draft could not be saved on this device. Keep this page open or use Save now.",
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
          : "This draft could not be saved on this device. Keep this page open or use Save now."
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
          : "This draft could not be saved on this device. Keep this page open or use Save now."
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
          : "This draft could not be saved on this device. Keep this page open or use Save now."
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
          set_number: setIndex + 1,
          weight_used: set.weight,
          reps: set.reps,
          effort_scale: set.rir === null ? null : "rir",
          effort_value: set.rir,
          notes: coachWorkoutExerciseNote(format, exerciseIndex, exercise),
          source: "website",
          set_type: "working",
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
        const hasStaleSets = existing.some((row) => (
          row.exercise_code === exercise.code &&
          row.set_type !== "warm_up" &&
          Number(row.set_number) > exercise.sets.length
        ));

        if (hasStaleSets) {
          const { error: deleteError } = await coachWorkoutSupabase
            .from("client_workout_logs")
            .delete()
            .eq("client_email", clientEmail)
            .eq("entry_date", entryDate)
            .eq("workout_title", "Custom workout")
            .eq("exercise_code", exercise.code)
            .neq("set_type", "warm_up")
            .gt("set_number", exercise.sets.length);

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
            ? "Autosave could not sync. Your draft is safe on this device; use Save now to retry."
            : "Autosave could not sync and this device could not back up the draft. Keep this page open and use Save now to retry."
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
  const carousel = document.getElementById("coach-workout-carousel");

  if (!form || !exerciseList) {
    return;
  }

  document.getElementById("coach-workout-add-exercise")?.addEventListener("click", () => {
    const exercise = addCoachWorkoutExercise();
    const index = coachWorkoutExerciseElements().indexOf(exercise);
    moveCoachWorkoutCarousel(index);
    scheduleCoachWorkoutAutosave();
    exercise?.querySelector("[data-coach-workout-name]")?.focus();
  });
  document.getElementById("coach-workout-reset")?.addEventListener("click", () => resetCoachWorkoutForm());
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
      moveCoachWorkoutCarousel(0);
    }

    scheduleCoachWorkoutAutosave();
  });
  exerciseList.addEventListener("input", (event) => {
    const exercise = event.target.closest("[data-coach-workout-exercise]");

    if (event.target.matches("[data-coach-workout-name]")) {
      renderCoachWorkoutSuggestions(event.target);
      return;
    }

    if (exercise && event.target.matches("[data-coach-workout-weight], [data-coach-workout-reps], [data-coach-workout-notes]")) {
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
    const dotButton = event.target.closest("[data-coach-workout-dot]");
    const exercise = event.target.closest("[data-coach-workout-exercise]");

    if (suggestionButton && exercise) {
      const input = exercise.querySelector("[data-coach-workout-name]");
      if (input) input.value = suggestionButton.dataset.coachWorkoutSuggestion || "";
      closeCoachWorkoutSuggestions();
      scheduleCoachWorkoutAutosave();
      input?.focus();
      return;
    }

    if (dotButton) {
      moveCoachWorkoutCarousel(Number(dotButton.dataset.coachWorkoutDot));
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
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".coach-workout-exercise-name, [data-coach-workout-suggestions]")) {
      closeCoachWorkoutSuggestions();
    }
  });

  carousel?.querySelector("button[data-coach-workout-previous]")?.addEventListener("click", () => {
    moveCoachWorkoutCarousel(Number(carousel.dataset.activeIndex || 0) - 1);
  });
  carousel?.querySelector("button[data-coach-workout-next]")?.addEventListener("click", () => {
    moveCoachWorkoutCarousel(Number(carousel.dataset.activeIndex || 0) + 1);
  });
  carousel?.addEventListener("click", (event) => {
    const dotButton = event.target.closest("[data-coach-workout-dot]");
    if (dotButton) moveCoachWorkoutCarousel(Number(dotButton.dataset.coachWorkoutDot));
  });
  exerciseList.addEventListener("scroll", () => {
    if (!coachWorkoutCarouselEnabled()) return;
    const exercises = coachWorkoutExerciseElements();
    const left = exerciseList.scrollLeft;
    const closestIndex = exercises.reduce((closest, exercise, index) => (
      Math.abs((exercise.offsetLeft - exerciseList.offsetLeft) - left) < Math.abs((exercises[closest].offsetLeft - exerciseList.offsetLeft) - left)
        ? index
        : closest
    ), 0);
    renderCoachWorkoutCarousel(closestIndex);
  }, { passive: true });
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
