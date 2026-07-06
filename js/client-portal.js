const config = window.FWB_SUPABASE_CONFIG || {};
const isConfigured = Boolean(
  config.url &&
  config.anonKey &&
  !config.url.includes("PASTE_") &&
  !config.anonKey.includes("PASTE_")
);
const supabaseClient = isConfigured && window.supabase
  ? window.supabase.createClient(config.url, config.anonKey)
  : null;
const coachPortalEmails = ["benjaminbenz.fit@gmail.com"];
let activeClientEmail = "";
let trainingLogs = [];

function isCoachPortalEmail(email) {
  return coachPortalEmails.includes(String(email || "").toLowerCase());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setText(selector, value) {
  const element = document.querySelector(selector);

  if (element) {
    element.textContent = value || "";
  }
}

function setDashboardMessage(title, message) {
  const page = document.querySelector(".dashboard-page");
  const loading = document.getElementById("dashboard-loading");
  const content = document.getElementById("dashboard-content");

  if (!page || !loading) {
    return;
  }

  setText("#dashboard-loading h1", title);
  setText("#dashboard-loading p:not(.kicker)", message);

  loading.hidden = false;

  if (content) {
    content.hidden = true;
  }

  page.classList.add("is-loading");
}

function showDashboardContent() {
  const page = document.querySelector(".dashboard-page");
  const loading = document.getElementById("dashboard-loading");
  const content = document.getElementById("dashboard-content");

  if (loading) {
    loading.hidden = true;
  }

  if (content) {
    content.hidden = false;
  }

  if (page) {
    page.classList.remove("is-loading");
  }
}

function clientInitials(program) {
  if (program.initials) {
    return program.initials;
  }

  return String(program.client_name || "Client")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function renderMetrics(program) {
  const metrics = document.getElementById("summary-metrics");

  if (!metrics) {
    return;
  }

  metrics.innerHTML = `
    <span><strong>Height</strong> ${escapeHtml(program.height || "Not set")}</span>
    <span><strong>Starting weight</strong> ${escapeHtml(program.starting_weight || "Not set")}</span>
    <span><strong>Starting bodyfat</strong> ${escapeHtml(program.starting_bodyfat || "Not set")}</span>
  `;
}

function formatProgressValue(value, suffix) {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  return `${escapeHtml(value)}${suffix}`;
}

function renderRest(rest) {
  if (!rest) {
    return "";
  }

  return `<small>${escapeHtml(rest)}</small>`;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function shouldUseDemoTrainingLogs() {
  const params = new URLSearchParams(window.location.search);

  return params.has("demoLogs");
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);

  return date.toISOString().slice(0, 10);
}

function pointsFor(entries, key, width, height, padding) {
  const values = entries
    .map((entry) => Number(entry[key]))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  return entries.map((entry, index) => {
    const value = Number(entry[key]);
    const x = padding + (entries.length === 1 ? usableWidth : (index / (entries.length - 1)) * usableWidth);
    const y = Number.isFinite(value)
      ? padding + ((max - value) / range) * usableHeight
      : height - padding;

    return `${x},${y}`;
  }).join(" ");
}

function circlesFor(points, className) {
  if (!points) {
    return "";
  }

  return points
    .split(" ")
    .filter(Boolean)
    .map((point) => {
      const [cx, cy] = point.split(",");

      return `<circle class="${className}" cx="${cx}" cy="${cy}" r="6" />`;
    })
    .join("");
}

function renderProgressGraph(entries) {
  const chart = document.getElementById("progress-chart");

  if (!chart) {
    return;
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    chart.innerHTML = '<p class="empty-state">Progress graph will appear after your first check-in.</p>';
    return;
  }

  const width = 680;
  const height = 260;
  const padding = 34;
  const weightPoints = pointsFor(entries, "bodyweight", width, height, padding);
  const bodyfatPoints = pointsFor(entries, "bodyfat", width, height, padding);

  chart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bodyweight and bodyfat progress">
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" />
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" />
      ${weightPoints ? `<polyline class="weight-line" points="${weightPoints}" />` : ""}
      ${bodyfatPoints ? `<polyline class="bodyfat-line" points="${bodyfatPoints}" />` : ""}
      ${circlesFor(weightPoints, "weight-dot")}
      ${circlesFor(bodyfatPoints, "bodyfat-dot")}
      ${entries.map((entry, index) => {
        const x = padding + (entries.length === 1 ? width - padding * 2 : (index / (entries.length - 1)) * (width - padding * 2));
        return `<text x="${x}" y="${height - 8}" text-anchor="middle">${escapeHtml(entry.entry_date.slice(5))}</text>`;
      }).join("")}
    </svg>
    <div class="chart-legend">
      <span><i class="weight-key"></i> Bodyweight</span>
      <span><i class="bodyfat-key"></i> Bodyfat</span>
    </div>
  `;
}

function renderProgress(entries) {
  const latest = entries[entries.length - 1];
  const current = document.getElementById("progress-current");

  if (!current) {
    return;
  }

  if (!latest) {
    setText("#progress-date", "");
    current.innerHTML = '<p class="empty-state">No progress check-ins yet.</p>';
    setText("#progress-goal", "");
    renderProgressGraph([]);
    return;
  }

  setText("#progress-date", latest.entry_date);
  current.innerHTML = `
    <span><strong>Current bodyweight</strong> ${formatProgressValue(latest.bodyweight, " lb")}</span>
    <span><strong>Current bodyfat</strong> ${formatProgressValue(latest.bodyfat, "%")}</span>
  `;
  setText("#progress-goal", latest.goal_note ? `Updated goal: ${latest.goal_note}` : "");
  renderProgressGraph(entries);
}

function setCountFromPrescription(prescription) {
  const match = String(prescription || "").match(/(\d+)\s*(?:sets?|x)/i);
  const count = match ? Number(match[1]) : 3;

  return Number.isFinite(count) && count > 0 ? Math.min(count, 8) : 3;
}

function repsFromPrescription(prescription) {
  const text = String(prescription || "");
  const match = text.match(/(\d+\s*-\s*\d+|\d+)\s*reps?/i);

  return match ? match[1].replace(/\s/g, "") : "";
}

function setRows(exercise) {
  const setCount = setCountFromPrescription(exercise.prescription);
  const reps = repsFromPrescription(exercise.prescription);

  return Array.from({ length: setCount }, (_, index) => `
    <div class="set-row" data-set-row data-set-number="${index + 1}">
      <span>${index + 1}</span>
      <input type="number" min="0" step="0.5" placeholder="0" data-set-weight />
      <b>x</b>
      <input type="number" min="0" step="1" placeholder="${escapeHtml(reps)}" data-set-reps />
    </div>
  `).join("");
}

function exerciseLogFields(exercise, workoutTitle, options = {}) {
  const setCount = setCountFromPrescription(exercise.prescription);
  const panelClass = options.panelClass || "exercise-detail";
  const showSubmit = options.showSubmit !== false;
  const showInlineHeader = Boolean(options.showInlineHeader);

  return `
    <div class="${panelClass}"
      data-exercise-log
      data-workout-title="${escapeHtml(workoutTitle)}"
      data-exercise-code="${escapeHtml(exercise.code)}"
      data-exercise-name="${escapeHtml(exercise.name)}"
      data-prescribed-sets="${setCount}"
    >
      ${showInlineHeader ? `
        <div class="superset-exercise-heading">
          <strong>${escapeHtml(exercise.code ? `${exercise.code} ${exercise.name}` : exercise.name)}</strong>
          <em>${escapeHtml(exercise.prescription)}${exercise.rest ? ` · ${escapeHtml(exercise.rest)}` : ""}</em>
          <small data-set-progress>0 / ${setCount} sets completed</small>
        </div>
      ` : ""}
      <label class="exercise-substitute">
        <span>Substitute exercise</span>
        <input type="text" placeholder="Optional replacement" data-substitute-exercise />
        <small>Use this if you swap the exercise today.</small>
      </label>
      <label class="exercise-date">
        <span>Date</span>
        <input type="date" data-log-date />
      </label>
      <div class="set-table" aria-label="${escapeHtml(exercise.name)} set tracker">
        <div class="set-header">
          <span>Set</span>
          <span>Weight (lbs)</span>
          <span></span>
          <span>Reps</span>
        </div>
        <div data-set-rows>
          ${setRows(exercise)}
        </div>
        <button class="add-set-button" type="button" data-add-set>+ Add Set</button>
      </div>
      <label class="exercise-notes">
        <span>Notes</span>
        <textarea placeholder="How did that set feel?" data-log-notes></textarea>
      </label>
      ${showSubmit ? '<button class="complete-exercise-button" type="button" data-log-submit>Complete Exercise</button>' : ""}
      <small data-log-status></small>
      <div class="previous-weights" data-previous-weights>Previous: none</div>
    </div>
  `;
}

function exerciseCard(exercise, workoutTitle, isOpen = false) {
  const setCount = setCountFromPrescription(exercise.prescription);

  return `
    <article class="workout-exercise-card${isOpen ? " is-open" : ""}">
      ${skipControl()}
      <button class="exercise-card-summary" type="button" data-exercise-toggle>
        <span>
          <strong>${escapeHtml(exercise.name)}</strong>
          <em>${escapeHtml(exercise.prescription)}${exercise.rest ? ` · ${escapeHtml(exercise.rest)}` : ""}</em>
          <small data-set-progress>0 / ${setCount} sets completed</small>
        </span>
        <i>›</i>
      </button>
      ${exerciseLogFields(exercise, workoutTitle)}
    </article>
  `;
}

function exerciseCardRows(exercises, workoutTitle, openMode = "first") {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return '<p class="empty-state">Workout details will appear here when your coach adds them.</p>';
  }

  return exercises.map((exercise, index) => {
    const isOpen = openMode === "all" || (openMode === "first" && index === 0);

    return exerciseCard(exercise, workoutTitle, isOpen);
  }).join("");
}

function groupKeyForExercise(exercise, index) {
  const match = String(exercise.code || "").match(/^([A-Za-z]+)/);

  return match ? match[1].toUpperCase() : `Group ${index + 1}`;
}

function groupedExercises(exercises) {
  const groups = [];

  (exercises || []).forEach((exercise, index) => {
    const key = groupKeyForExercise(exercise, index);
    let group = groups.find((item) => item.key === key);

    if (!group) {
      group = { key, exercises: [] };
      groups.push(group);
    }

    group.exercises.push(exercise);
  });

  return groups;
}

function inferWorkoutFormat(workout) {
  if (workout.format) {
    return workout.format;
  }

  const groups = groupedExercises(workout.exercises || []);
  const hasPairs = groups.some((group) => group.exercises.length > 1);

  return hasPairs ? "superset" : "single";
}

function formatLabel(format) {
  if (format === "superset") {
    return "Superset";
  }

  if (format === "circuit") {
    return "Circuit training";
  }

  return "Single exercises";
}

function skipControl() {
  return `
    <label class="skip-toggle">
      <input type="checkbox" data-skip-card />
      <span>Skip</span>
    </label>
  `;
}

function supersetCard(group, workoutTitle) {
  const countLabel = `${group.exercises.length} exercise${group.exercises.length === 1 ? "" : "s"}`;

  return `
    <article class="workout-exercise-card superset-card is-open" data-superset-card>
      ${skipControl()}
      <button class="exercise-card-summary" type="button" data-exercise-toggle>
        <span>
          <strong>Superset ${escapeHtml(group.key)}</strong>
          <em>${countLabel} · log both exercises each round</em>
        </span>
        <i>›</i>
      </button>
      <div class="exercise-detail superset-detail">
        ${group.exercises.map((exercise) => exerciseLogFields(exercise, workoutTitle, {
          panelClass: "superset-exercise-log",
          showInlineHeader: true,
          showSubmit: false
        })).join("")}
        <button class="complete-exercise-button" type="button" data-superset-submit>Complete Superset</button>
        <small data-superset-status></small>
      </div>
    </article>
  `;
}

function supersetRows(workout, workoutTitle) {
  const groups = groupedExercises(workout.exercises || []);

  return groups.map((group, groupIndex) => {
    const isPair = group.exercises.length > 1;
    const countLabel = `${group.exercises.length} exercise${group.exercises.length === 1 ? "" : "s"}`;

    return isPair ? supersetCard(group, workoutTitle) : `
      <section class="workout-format-group">
        <div class="workout-format-heading">
          <div>
            <strong>${isPair ? "Superset" : "Exercise"} ${escapeHtml(group.key)}</strong>
            <span>${countLabel}${isPair ? " · log both exercises each round" : ""}</span>
          </div>
        </div>
        ${exerciseCardRows(group.exercises, workoutTitle, "all")}
      </section>
    `;
  }).join("");
}

function circuitRows(workout, workoutTitle) {
  const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];
  const roundCount = exercises.reduce((max, exercise) => Math.max(max, setCountFromPrescription(exercise.prescription)), 0) || 3;

  return `
    <section class="workout-format-group circuit-group">
      <div class="workout-format-heading">
        <div>
          <strong>Circuit</strong>
          <span>${roundCount} rounds · move through each exercise in order</span>
        </div>
      </div>
      ${exerciseCardRows(exercises, workoutTitle, "first")}
    </section>
  `;
}

function workoutExerciseMarkup(workout, workoutTitle) {
  const format = inferWorkoutFormat(workout);

  if (!Array.isArray(workout.exercises) || workout.exercises.length === 0) {
    return '<p class="empty-state">Workout details will appear here when your coach adds them.</p>';
  }

  if (format === "superset") {
    return supersetRows(workout, workoutTitle);
  }

  if (format === "circuit") {
    return circuitRows(workout, workoutTitle);
  }

  return exerciseCardRows(workout.exercises, workoutTitle, "first");
}

function renderExerciseList(elementId, workout, workoutTitle) {
  const element = document.getElementById(elementId);

  if (!element) {
    return;
  }

  element.innerHTML = workoutExerciseMarkup(workout, workoutTitle);
}

function renderAdditionalWorkouts(workouts) {
  const container = document.getElementById("additional-workouts");

  if (!container) {
    return;
  }

  const extraWorkouts = workouts.slice(2);

  if (extraWorkouts.length === 0) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = extraWorkouts.map((workout, index) => `
    <section class="lower-panel extra-workout-panel" aria-label="${escapeHtml(workout.title || `Workout ${index + 3}`)}">
      <div class="panel-heading">
        <div>
          <h2>${escapeHtml(workout.title || `Workout ${index + 3}`)}</h2>
        </div>
        <span class="status-pill">${escapeHtml(workout.focus || "")}</span>
      </div>
      <div class="workout-format-pill">${escapeHtml(formatLabel(inferWorkoutFormat(workout)))}</div>
      <div class="workout-app-list" role="list" aria-label="${escapeHtml(workout.title || `Workout ${index + 3}`)} exercises">
        ${workoutExerciseMarkup(workout, workout.title || `Workout ${index + 3}`)}
      </div>
    </section>
  `).join("");
}

function logKey(workoutTitle, exerciseCode) {
  return `${workoutTitle}::${exerciseCode}`;
}

function logsForExercise(workoutTitle, exerciseCode) {
  const key = logKey(workoutTitle, exerciseCode);

  return trainingLogs
    .filter((log) => logKey(log.workout_title, log.exercise_code) === key)
    .sort((a, b) => {
      const dateCompare = String(b.entry_date).localeCompare(String(a.entry_date));

      if (dateCompare !== 0) {
        return dateCompare;
      }

      return Number(a.set_number || 1) - Number(b.set_number || 1);
    });
}

function formatLogDate(value) {
  if (!value) {
    return "";
  }

  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

function updateExerciseLogField(logElement) {
  const dateInput = logElement.querySelector("[data-log-date]");
  const substituteInput = logElement.querySelector("[data-substitute-exercise]");
  const notesInput = logElement.querySelector("[data-log-notes]");
  const previous = logElement.querySelector("[data-previous-weights]");
  const card = logElement.closest(".workout-exercise-card");
  const progress = card?.matches(".superset-card")
    ? logElement.querySelector("[data-set-progress]")
    : card?.querySelector("[data-set-progress]");
  const logs = logsForExercise(logElement.dataset.workoutTitle, logElement.dataset.exerciseCode);
  const selectedDate = dateInput?.value || todayDate();
  const selectedLogs = logs.filter((log) => log.entry_date === selectedDate);

  if (dateInput && !dateInput.value) {
    dateInput.value = todayDate();
  }

  logElement.querySelectorAll("[data-set-row]").forEach((row) => {
    const setNumber = Number(row.dataset.setNumber || 1);
    const selectedLog = selectedLogs.find((log) => Number(log.set_number || 1) === setNumber);
    const weightInput = row.querySelector("[data-set-weight]");
    const repsInput = row.querySelector("[data-set-reps]");

    if (weightInput) {
      weightInput.value = selectedLog?.weight_used ?? "";
    }

    if (repsInput) {
      repsInput.value = selectedLog?.reps ?? "";
    }
  });

  if (notesInput) {
    notesInput.value = selectedLogs.find((log) => log.notes)?.notes || "";
  }

  if (substituteInput) {
    const loggedExerciseName = selectedLogs.find((log) => log.exercise_name)?.exercise_name || "";
    substituteInput.value = loggedExerciseName && loggedExerciseName !== logElement.dataset.exerciseName
      ? loggedExerciseName
      : "";
  }

  const completedSets = selectedLogs.filter((log) => log.weight_used !== null && log.weight_used !== undefined).length;
  const prescribedSets = Number(logElement.dataset.prescribedSets || 0);

  if (progress) {
    progress.textContent = `${completedSets} / ${prescribedSets || completedSets || 0} sets completed`;
  }

  if (!previous) {
    return;
  }

  if (logs.length === 0) {
    previous.textContent = "Previous: none";
    return;
  }

  const logsByDate = logs.reduce((groups, log) => {
    if (!groups.has(log.entry_date)) {
      groups.set(log.entry_date, []);
    }

    groups.get(log.entry_date).push(log);
    return groups;
  }, new Map());

  previous.innerHTML = `
    <strong>Previous</strong>
    ${Array.from(logsByDate.entries()).slice(0, 4).map(([date, dateLogs]) => `
      <span>${escapeHtml(formatLogDate(date))} - ${dateLogs.map((log) => {
        const reps = log.reps ? ` x ${log.reps}` : "";

        return `${escapeHtml(log.weight_used)} lb${escapeHtml(reps)}`;
      }).join(", ")}</span>
    `).join("")}
  `;
}

function populateTrainingLogs(logs) {
  trainingLogs = Array.isArray(logs) ? logs : [];

  document.querySelectorAll("[data-exercise-log]").forEach((logElement) => {
    updateExerciseLogField(logElement);
  });
}

function demoTrainingLogsForProgram(program) {
  const workouts = Array.isArray(program.workouts) ? program.workouts : [];
  const workout = workouts[0] || {};
  const exercises = Array.isArray(workout.exercises) ? workout.exercises.slice(0, 5) : [];
  const dates = [dateDaysAgo(7), dateDaysAgo(14)];
  const baseWeights = [55, 80, 65, 50, 25];

  return exercises.flatMap((exercise, exerciseIndex) => {
    const setCount = setCountFromPrescription(exercise.prescription);
    const reps = Number.parseInt(repsFromPrescription(exercise.prescription), 10) || 10;

    return dates.flatMap((entryDate, dateIndex) => (
      Array.from({ length: setCount }, (_, setIndex) => ({
        client_email: activeClientEmail,
        entry_date: entryDate,
        workout_title: workout.title || "Workout 1",
        exercise_code: exercise.code,
        exercise_name: exercise.name,
        set_number: setIndex + 1,
        weight_used: baseWeights[exerciseIndex] + setIndex * 5 - dateIndex * 5,
        reps: Math.max(reps - (setIndex > 0 ? 1 : 0), 1),
        notes: dateIndex === 0 ? "Felt strong. Keep this pace next week." : ""
      }))
    ));
  });
}

function displayProgramForCurrentView(program) {
  if (!shouldUseDemoTrainingLogs()) {
    return program;
  }

  return {
    ...program,
    program_title: "Benjamin Program",
    client_name: "Benjamin",
    initials: "BG"
  };
}

function upsertLocalTrainingLog(savedLog) {
  const index = trainingLogs.findIndex((log) => (
    String(log.client_email).toLowerCase() === String(savedLog.client_email).toLowerCase() &&
    log.entry_date === savedLog.entry_date &&
    log.workout_title === savedLog.workout_title &&
    log.exercise_code === savedLog.exercise_code &&
    Number(log.set_number || 1) === Number(savedLog.set_number || 1)
  ));

  if (index >= 0) {
    trainingLogs[index] = { ...trainingLogs[index], ...savedLog };
  } else {
    trainingLogs.push(savedLog);
  }
}

function handleTrainingDateChange() {
  document.addEventListener("change", (event) => {
    const dateInput = event.target.closest("[data-log-date]");

    if (!dateInput) {
      return;
    }

    const logElement = dateInput.closest("[data-exercise-log]");

    if (logElement) {
      updateExerciseLogField(logElement);
    }
  });
}

function addSetRow(logElement) {
  const rows = logElement.querySelector("[data-set-rows]");
  const lastRow = rows?.querySelector("[data-set-row]:last-child");

  if (!rows) {
    return;
  }

  const nextSet = lastRow ? Number(lastRow.dataset.setNumber || 0) + 1 : 1;
  rows.insertAdjacentHTML("beforeend", `
    <div class="set-row" data-set-row data-set-number="${nextSet}">
      <span>${nextSet}</span>
      <input type="number" min="0" step="0.5" placeholder="0" data-set-weight />
      <b>x</b>
      <input type="number" min="0" step="1" placeholder="0" data-set-reps />
    </div>
  `);
}

function handleWorkoutInteractions() {
  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-exercise-toggle]");
    const addSetButton = event.target.closest("[data-add-set]");

    if (toggle) {
      const card = toggle.closest(".workout-exercise-card");

      if (card && !card.classList.contains("is-skipped")) {
        card.classList.toggle("is-open");
      }
    }

    if (addSetButton) {
      const logElement = addSetButton.closest("[data-exercise-log]");

      if (logElement) {
        addSetRow(logElement);
      }
    }
  });
}

function handleSkipToggle() {
  document.addEventListener("change", (event) => {
    const skipInput = event.target.closest("[data-skip-card]");

    if (!skipInput) {
      return;
    }

    const card = skipInput.closest(".workout-exercise-card");

    if (!card) {
      return;
    }

    card.classList.toggle("is-skipped", skipInput.checked);
    card.classList.toggle("is-open", !skipInput.checked);
  });
}

function renderProgram(program) {
  const displayProgram = displayProgramForCurrentView(program);
  const workouts = Array.isArray(program.workouts) ? program.workouts : [];
  const firstWorkout = workouts[0] || {};
  const nextWorkout = workouts[1] || {};
  const sheetLink = document.getElementById("workout-sheet-link");
  const programTitle = displayProgram.program_title || "Your Program";

  document.title = `${programTitle} | Fitness with Benjamin`;
  setText("#dashboard-program-title", programTitle);
  setText("#dashboard-program-summary", displayProgram.program_summary || "Your current training block is ready.");
  setText("#client-avatar", clientInitials(displayProgram));
  setText("#client-name", displayProgram.client_name || "Client");
  setText("#today-title", firstWorkout.title || "Workout 1");
  setText("#today-focus", firstWorkout.focus || "");
  setText("#lower-title", nextWorkout.title || "Next workout");
  setText("#next-focus", nextWorkout.focus || "");

  if (sheetLink) {
    if (program.sheet_url) {
      sheetLink.href = program.sheet_url;
      sheetLink.hidden = false;
    } else {
      sheetLink.removeAttribute("href");
      sheetLink.hidden = true;
    }
  }

  renderMetrics(program);
  renderExerciseList("today-exercises", firstWorkout, firstWorkout.title || "Workout 1");
  renderExerciseList("next-exercises", nextWorkout, nextWorkout.title || "Workout 2");
  renderAdditionalWorkouts(workouts);
  showDashboardContent();
}

async function handleLogin() {
  const form = document.getElementById("client-login-form");
  const status = document.getElementById("login-status");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!supabaseClient) {
      if (status) {
        status.textContent = "Client login is being connected. Please try again soon.";
      }
      return;
    }

    const data = new FormData(form);
    const email = data.get("email");
    const password = data.get("password");

    if (status) {
      status.textContent = "Signing in...";
    }

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      if (status) {
        status.textContent = "That email or password did not work. Please try again.";
      }
      return;
    }

    window.location.href = "client-dashboard.html";
  });

  if (status && supabaseClient) {
    status.textContent = "Use the email and password from your coach.";
  }
}

async function handleCoachPortalLogin() {
  const form = document.getElementById("coach-login-form");
  const status = document.getElementById("coach-login-status");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!supabaseClient) {
      if (status) {
        status.textContent = "Coach login is being connected. Please try again soon.";
      }
      return;
    }

    const data = new FormData(form);
    const email = data.get("email");
    const password = data.get("password");

    if (status) {
      status.textContent = "Signing in...";
    }

    const { data: loginData, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      if (status) {
        status.textContent = "That email or password did not work. Please try again.";
      }
      return;
    }

    if (!isCoachPortalEmail(loginData.user?.email)) {
      await supabaseClient.auth.signOut();

      if (status) {
        status.textContent = "This login is not set up as a coach admin.";
      }
      return;
    }

    window.location.href = "coach-admin.html?v=coach-login-refresh-8";
  });
}

async function loadDashboard() {
  if (!document.querySelector(".dashboard-page")) {
    return;
  }

  if (!supabaseClient) {
    setDashboardMessage(
      "Client login unavailable",
      "This page is not connected yet. Please message Benjamin for your workout."
    );
    return;
  }

  const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
  const user = sessionData?.session?.user;

  if (sessionError || !user) {
    window.location.href = "client-login.html";
    return;
  }

  activeClientEmail = user.email;

  const { data, error } = await supabaseClient
    .from("client_programs")
    .select("*")
    .eq("client_email", user.email)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    setDashboardMessage(
      "Could not load dashboard",
      "Please refresh the page. If it still does not load, message Benjamin."
    );
    return;
  }

  if (!data) {
    setDashboardMessage(
      "No active program yet",
      "You are signed in, but your workout has not been added to this dashboard yet."
    );
    return;
  }

  const { data: progressData } = await supabaseClient
    .from("client_progress")
    .select("*")
    .eq("client_email", user.email)
    .order("entry_date", { ascending: true });

  const { data: trainingLogData } = await supabaseClient
    .from("client_workout_logs")
    .select("*")
    .eq("client_email", user.email)
    .order("entry_date", { ascending: true })
    .limit(500);

  renderProgram(data);
  renderProgress(progressData || []);
  populateTrainingLogs(
    trainingLogData?.length || !shouldUseDemoTrainingLogs()
      ? trainingLogData || []
      : demoTrainingLogsForProgram(data)
  );
}

function rowsForTrainingLog(logElement) {
  const dateInput = logElement?.querySelector("[data-log-date]");

  if (!logElement || !dateInput) {
    return [];
  }

  const notes = logElement.querySelector("[data-log-notes]")?.value || "";
  const substitute = logElement.querySelector("[data-substitute-exercise]")?.value?.trim() || "";
  const exerciseName = substitute || logElement.dataset.exerciseName;

  return Array.from(logElement.querySelectorAll("[data-set-row]"))
    .map((setRow) => ({
      client_email: activeClientEmail,
      entry_date: dateInput.value || todayDate(),
      workout_title: logElement.dataset.workoutTitle,
      exercise_code: logElement.dataset.exerciseCode,
      exercise_name: exerciseName,
      set_number: Number(setRow.dataset.setNumber || 1),
      weight_used: Number(setRow.querySelector("[data-set-weight]")?.value || 0),
      reps: setRow.querySelector("[data-set-reps]")?.value
        ? Number(setRow.querySelector("[data-set-reps]").value)
        : null,
      notes
    }))
    .filter((row) => row.weight_used > 0);
}

async function saveTrainingLogRows(button, logElements, status) {
  if (!supabaseClient || !activeClientEmail) {
    if (status) {
      status.textContent = "Sign in first.";
    }
    return;
  }

  if (logElements.length === 0) {
    if (status) {
      status.textContent = "Choose a date first.";
    }
    return;
  }

  const rows = logElements.flatMap(rowsForTrainingLog);

  if (rows.length === 0) {
    if (status) {
      status.textContent = "Enter at least one weight.";
    }
    return;
  }

  button.disabled = true;
  if (status) {
    status.textContent = "Saving...";
  }

  const { data, error } = await supabaseClient
    .from("client_workout_logs")
    .upsert(rows, { onConflict: "client_email,entry_date,workout_title,exercise_code,set_number" })
    .select();

  if (error) {
    if (status) {
      status.textContent = "Could not save yet.";
    }
    button.disabled = false;
    return;
  }

  (data || rows).forEach((row) => upsertLocalTrainingLog(row));
  logElements.forEach(updateExerciseLogField);

  if (status) {
    status.textContent = "Saved.";
  }
  button.disabled = false;
}

async function handleTrainingLogSave() {
  document.addEventListener("click", async (event) => {
    const supersetButton = event.target.closest("[data-superset-submit]");
    const exerciseButton = event.target.closest("[data-log-submit]");
    const button = supersetButton || exerciseButton;

    if (!button) {
      return;
    }

    if (supersetButton) {
      const supersetCard = supersetButton.closest("[data-superset-card]");
      const logElements = Array.from(supersetCard?.querySelectorAll("[data-exercise-log]") || []);
      const status = supersetCard?.querySelector("[data-superset-status]");

      await saveTrainingLogRows(button, logElements, status);
      return;
    }

    const logElement = exerciseButton.closest("[data-exercise-log]");
    const status = logElement?.querySelector("[data-log-status]");

    await saveTrainingLogRows(button, logElement ? [logElement] : [], status);
  });
}

async function handleSignOut() {
  const buttons = document.querySelectorAll("[data-sign-out]");

  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      if (supabaseClient) {
        await supabaseClient.auth.signOut();
      }

      window.location.href = "client-login.html";
    });
  });
}

handleLogin();
handleCoachPortalLogin();
loadDashboard();
handleSignOut();
handleTrainingDateChange();
handleSkipToggle();
handleTrainingLogSave();
