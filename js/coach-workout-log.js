const coachWorkoutConfig = window.FWB_SUPABASE_CONFIG || {};
const coachWorkoutEmails = ["benjaminbenz.fit@gmail.com"];
const coachWorkoutLoginUrl = "client-login.html?return_to=%2Fcoach-workout-log.html";
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
    <article class="coach-workout-exercise is-open" data-coach-workout-exercise>
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

  const previous = carousel.querySelector("[data-coach-workout-previous]");
  const next = carousel.querySelector("[data-coach-workout-next]");
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

function coachWorkoutExerciseValues() {
  const exerciseRows = coachWorkoutExerciseElements();

  if (exerciseRows.length === 0) {
    throw new Error("Add at least one exercise.");
  }

  const exercises = exerciseRows.map((row, index) => {
    const nameInput = row.querySelector("[data-coach-workout-name]");
    const name = nameInput?.value.trim() || "";

    if (!name) {
      nameInput?.focus();
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
        weightInput?.focus();
        throw new Error(`${name} set ${setIndex + 1} needs a valid non-negative weight.`);
      }

      if (repsText === "" || !Number.isInteger(reps) || reps < 1) {
        repsInput?.focus();
        throw new Error(`${name} set ${setIndex + 1} needs a positive whole-number rep count.`);
      }

      if (rir !== null && (!Number.isInteger(rir) || rir < 0 || rir > 4)) {
        rirInput?.focus();
        throw new Error(`${name} set ${setIndex + 1} RIR must be between 0 and 4.`);
      }

      return { weight, reps, rir };
    });

    return {
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

async function saveCoachWorkout(event) {
  event.preventDefault();

  const form = document.getElementById("coach-workout-log-form");
  const saveButton = document.getElementById("coach-workout-save");
  const clientEmail = normalizeCoachWorkoutEmail(document.getElementById("coach-workout-client")?.value);
  const entryDate = document.getElementById("coach-workout-date")?.value || "";

  if (!form?.reportValidity()) {
    setCoachWorkoutStatus("Complete every required field before saving.", true);
    return;
  }

  if (!clientEmail || !entryDate) {
    setCoachWorkoutStatus("Choose a client and workout date first.", true);
    return;
  }

  let exercises;

  try {
    exercises = coachWorkoutExerciseValues();
  } catch (error) {
    setCoachWorkoutStatus(error.message || "Check the exercise fields and try again.", true);
    return;
  }

  saveButton.disabled = true;
  setCoachWorkoutStatus("Saving the workout…");

  try {
    const { data: existingRows, error: existingError } = await coachWorkoutSupabase
      .from("client_workout_logs")
      .select("exercise_code,exercise_name,set_number,set_type")
      .ilike("client_email", clientEmail)
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

    const planned = exercises.map((exercise) => {
      const existingCode = existingCodeByName.get(exercise.name.toLowerCase());
      const code = existingCode || coachWorkoutCode(nextCodeNumber++);

      return { ...exercise, code };
    });

    for (const exercise of planned) {
      const hasStaleSets = existing.some((row) => (
        row.exercise_code === exercise.code &&
        row.set_type !== "warm_up" &&
        Number(row.set_number) > exercise.sets.length
      ));

      if (hasStaleSets) {
        const { error: deleteError } = await coachWorkoutSupabase
          .from("client_workout_logs")
          .delete()
          .ilike("client_email", clientEmail)
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

    const format = coachWorkoutFormatValue();
    const rows = planned.flatMap((exercise, exerciseIndex) => (
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
      .upsert(rows, { onConflict: "client_email,entry_date,workout_title,exercise_code,set_number" });

    if (saveError) {
      throw saveError;
    }

    setCoachWorkoutStatus(`${rows.length} set${rows.length === 1 ? "" : "s"} saved to ${planned.length} exercise${planned.length === 1 ? "" : "s"} in the client’s Custom workout.`);
  } catch (error) {
    setCoachWorkoutStatus(error.message || "The workout could not be saved. Try again.", true);
  } finally {
    saveButton.disabled = false;
  }
}

function resetCoachWorkoutForm() {
  const form = document.getElementById("coach-workout-log-form");
  const exerciseList = document.getElementById("coach-workout-exercises");
  const selectedClient = document.getElementById("coach-workout-client")?.value || "";

  form?.reset();

  if (exerciseList) {
    exerciseList.innerHTML = "";
  }

  renderCoachWorkoutClients();
  const clientSelect = document.getElementById("coach-workout-client");

  if (clientSelect && Array.from(clientSelect.options).some((option) => option.value === selectedClient)) {
    clientSelect.value = selectedClient;
  }

  const dateInput = document.getElementById("coach-workout-date");

  if (dateInput) {
    dateInput.value = coachWorkoutToday();
  }

  addCoachWorkoutExercise();
  setCoachWorkoutStatus("Choose a client and add the exercises completed today.");
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
    exercise?.querySelector("[data-coach-workout-name]")?.focus();
  });
  document.getElementById("coach-workout-reset")?.addEventListener("click", resetCoachWorkoutForm);
  form.addEventListener("submit", saveCoachWorkout);
  form.addEventListener("change", (event) => {
    if (event.target.matches('input[name="coach_workout_format"]')) {
      renumberCoachWorkoutExercises();
      moveCoachWorkoutCarousel(0);
    }
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
      rows?.querySelector("[data-coach-workout-set-row]:last-child [data-coach-workout-weight]")?.focus();
      return;
    }

    if (deleteSetButton && exercise) {
      const rows = exercise.querySelectorAll("[data-coach-workout-set-row]");
      if (rows.length > 1) rows[rows.length - 1].remove();
      updateCoachWorkoutSetRows(exercise);
      return;
    }

    if (addSupersetButton && exercise) {
      const pairedExercise = addCoachWorkoutExercise({}, exercise);
      const index = coachWorkoutExerciseElements().indexOf(pairedExercise);
      moveCoachWorkoutCarousel(index);
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
    exercise.remove();
    renumberCoachWorkoutExercises();
    moveCoachWorkoutCarousel(Math.max(removedIndex - 1, 0));
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

  carousel?.querySelector("[data-coach-workout-previous]")?.addEventListener("click", () => {
    moveCoachWorkoutCarousel(Number(carousel.dataset.activeIndex || 0) - 1);
  });
  carousel?.querySelector("[data-coach-workout-next]")?.addEventListener("click", () => {
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

  try {
    await loadCoachWorkoutData();
    resetCoachWorkoutForm();
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
