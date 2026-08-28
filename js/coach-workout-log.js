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

function renderCoachWorkoutSuggestions() {
  const datalist = document.getElementById("coach-workout-exercise-suggestions");

  if (!datalist) {
    return;
  }

  datalist.replaceChildren(...coachWorkoutExerciseLibrary
    .filter((exercise) => exercise.is_active !== false)
    .map((exercise) => new Option(exercise.name, exercise.name)));
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

function coachWorkoutExerciseMarkup(values = {}) {
  return `
    <article class="coach-workout-exercise" data-coach-workout-exercise>
      <div class="coach-workout-exercise-heading">
        <span class="status-pill" data-coach-workout-marker>Exercise</span>
        <button class="coach-workout-remove-exercise" type="button" data-coach-workout-remove aria-label="Remove exercise">Remove</button>
      </div>
      <div class="coach-workout-exercise-grid">
        <label class="coach-workout-exercise-name">
          Exercise
          <input type="text" value="${escapeCoachWorkoutHtml(values.name || "")}" list="coach-workout-exercise-suggestions" placeholder="Exercise name" autocomplete="off" data-coach-workout-name required />
        </label>
        <label>
          Sets
          <input type="number" value="${escapeCoachWorkoutHtml(values.sets || 3)}" min="1" max="10" step="1" inputmode="numeric" data-coach-workout-sets required />
        </label>
        <label>
          Reps / range
          <input type="text" value="${escapeCoachWorkoutHtml(values.reps || "")}" placeholder="15 or 10–12" inputmode="numeric" data-coach-workout-reps required />
        </label>
        <label>
          Weight (lb)
          <input type="text" value="${escapeCoachWorkoutHtml(values.weight || "")}" placeholder="40 or 45, 75, 75" inputmode="decimal" data-coach-workout-weight required />
        </label>
        <label class="coach-workout-exercise-notes">
          Notes <span>optional</span>
          <textarea rows="2" placeholder="Tempo, setup, or coaching note" data-coach-workout-notes>${escapeCoachWorkoutHtml(values.notes || "")}</textarea>
        </label>
      </div>
    </article>
  `;
}

function renumberCoachWorkoutExercises() {
  const exercises = Array.from(document.querySelectorAll("[data-coach-workout-exercise]"));
  const format = coachWorkoutFormatValue();

  exercises.forEach((exercise, index) => {
    const marker = exercise.querySelector("[data-coach-workout-marker]");
    const removeButton = exercise.querySelector("[data-coach-workout-remove]");

    if (marker) {
      marker.textContent = coachWorkoutFormatMarker(format, index);
    }

    if (removeButton) {
      removeButton.disabled = exercises.length === 1;
      removeButton.setAttribute("aria-label", `Remove exercise ${index + 1}`);
    }
  });
}

function addCoachWorkoutExercise(values = {}) {
  const list = document.getElementById("coach-workout-exercises");

  if (!list) {
    return;
  }

  list.insertAdjacentHTML("beforeend", coachWorkoutExerciseMarkup(values));
  renumberCoachWorkoutExercises();
}

function coachWorkoutNumericValues(rawValue, setCount, label, options = {}) {
  const text = String(rawValue || "").trim().replace(/[–—]/g, "-");
  const minimum = options.minimum ?? 0;

  if (!text) {
    throw new Error(`${label} is required.`);
  }

  if (options.allowRange) {
    const range = text.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);

    if (range) {
      const low = Number(range[1]);
      const high = Number(range[2]);

      if (low < minimum || high < low) {
        throw new Error(`${label} range must run from a smaller positive number to a larger one.`);
      }

      return {
        values: Array(setCount).fill(high),
        range: `${range[1]}-${range[2]}`
      };
    }
  }

  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);

  if (parts.length !== 1 && parts.length !== setCount) {
    throw new Error(`${label} needs one value or exactly ${setCount} comma-separated values.`);
  }

  const values = parts.map(Number);

  if (values.some((value) => !Number.isFinite(value) || value < minimum)) {
    throw new Error(`${label} must contain valid ${minimum > 0 ? "positive " : "non-negative "}numbers.`);
  }

  return {
    values: parts.length === 1 ? Array(setCount).fill(values[0]) : values,
    range: ""
  };
}

function coachWorkoutExerciseValues() {
  const exerciseRows = Array.from(document.querySelectorAll("[data-coach-workout-exercise]"));

  if (exerciseRows.length === 0) {
    throw new Error("Add at least one exercise.");
  }

  const exercises = exerciseRows.map((row, index) => {
    const nameInput = row.querySelector("[data-coach-workout-name]");
    const setsInput = row.querySelector("[data-coach-workout-sets]");
    const name = nameInput?.value.trim() || "";
    const sets = Number(setsInput?.value || 0);

    if (!name) {
      nameInput?.focus();
      throw new Error(`Exercise ${index + 1} needs a name.`);
    }

    if (!Number.isInteger(sets) || sets < 1 || sets > 10) {
      setsInput?.focus();
      throw new Error(`${name} needs between 1 and 10 sets.`);
    }

    const reps = coachWorkoutNumericValues(
      row.querySelector("[data-coach-workout-reps]")?.value,
      sets,
      `${name} reps`,
      { minimum: 1, allowRange: true }
    );
    const weights = coachWorkoutNumericValues(
      row.querySelector("[data-coach-workout-weight]")?.value,
      sets,
      `${name} weight`,
      { minimum: 0 }
    );

    return {
      name,
      sets,
      reps: reps.values,
      repsRange: reps.range,
      weights: weights.values,
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

  if (exercise.repsRange) {
    notes.push(`Target reps: ${exercise.repsRange}`);
  }

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
        Number(row.set_number) > exercise.sets
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
          .gt("set_number", exercise.sets);

        if (deleteError) {
          throw deleteError;
        }
      }
    }

    const format = coachWorkoutFormatValue();
    const rows = planned.flatMap((exercise, exerciseIndex) => (
      Array.from({ length: exercise.sets }, (_, setIndex) => ({
        client_email: clientEmail,
        entry_date: entryDate,
        workout_title: "Custom workout",
        exercise_code: exercise.code,
        exercise_name: exercise.name,
        set_number: setIndex + 1,
        weight_used: exercise.weights[setIndex],
        reps: exercise.reps[setIndex],
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

  if (!form || !exerciseList) {
    return;
  }

  document.getElementById("coach-workout-add-exercise")?.addEventListener("click", () => {
    addCoachWorkoutExercise();
    exerciseList.querySelector("[data-coach-workout-exercise]:last-child [data-coach-workout-name]")?.focus();
  });
  document.getElementById("coach-workout-reset")?.addEventListener("click", resetCoachWorkoutForm);
  form.addEventListener("submit", saveCoachWorkout);
  form.addEventListener("change", (event) => {
    if (event.target.matches('input[name="coach_workout_format"]')) {
      renumberCoachWorkoutExercises();
    }
  });
  exerciseList.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-coach-workout-remove]");

    if (!removeButton || exerciseList.querySelectorAll("[data-coach-workout-exercise]").length <= 1) {
      return;
    }

    removeButton.closest("[data-coach-workout-exercise]")?.remove();
    renumberCoachWorkoutExercises();
  });
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
  renderCoachWorkoutSuggestions();
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
