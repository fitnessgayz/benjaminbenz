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
let signedInDashboardEmail = "";
let isCoachDashboardPreview = false;
let trainingLogs = [];
let workoutSessionFeedback = [];
let foodLogs = [];
let foodSearchResults = [];
let progressEntries = [];
let progressPhotos = [];
let activeDashboardUser = null;
let activeProgressMetric = "bodyweight";
let clientTrainingLogDateFilter = "";
let clientTrainingLogSearchFilter = "";
let activeClientDashboardTab = "home";
let activeWorkoutTabIndex = 0;
let currentProgram = null;
const dashboardRequestTimeout = 15000;
const customWorkoutTitle = "Custom workout";
const customWorkoutFormats = {
  single: {
    label: "Straight sets",
    guide: "Finish all sets of one exercise before moving to the next."
  },
  superset: {
    label: "Superset",
    guide: "Alternate exercises in pairs, then repeat each pair for your remaining sets."
  },
  circuit: {
    label: "Circuit",
    guide: "Complete one set of every exercise in order, then begin the next round."
  }
};
const workoutCompletionMessages = [
  "Congratulations for completing the workout!",
  "Workout complete—great work!",
  "You did it! Another workout finished.",
  "Strong work—you showed up and finished!",
  "Nice job! Your workout is complete.",
  "That’s a wrap—way to finish strong!",
  "Great effort! You completed today’s workout.",
  "Mission accomplished—workout complete!"
];
const warmupExerciseCode = "WARMUP";
const cardioExerciseCode = "CARDIO";
const warmUpSetNumberBase = 1000;
const workingSetType = "working";
const warmUpSetType = "warm_up";
const clientDashboardUrl = "client-dashboard.html?v=manual-sessions-1";
const workoutElapsedTimerStorageKey = "fwb_workout_elapsed_timer_v1";
const workoutElapsedTimerCompactStorageKey = "fwb_workout_elapsed_timer_compact_v1";
const workoutElapsedTimerMaximumMilliseconds = 24 * 60 * 60 * 1000;
let exerciseLibraryEntries = [];
let activeCustomWorkoutFormat = "single";
let restTimerDurationSeconds = 60;
let restTimerRemainingSeconds = 60;
let restTimerEndsAt = 0;
let restTimerIntervalId = null;
let restTimerReturnFocus = null;
let workoutElapsedTimerState = null;
let workoutElapsedTimerIntervalId = null;
let workoutElapsedTimerIsCompact = null;
let activeRirButton = null;
let pendingRirValue = null;
let workoutDifficultyPromptResolve = null;
let workoutDifficultyReturnFocus = null;
let pendingWorkoutDifficulty = null;
let lastWorkoutCompletionMessageIndex = -1;
let nextExercisePromptPanel = null;
let nextExercisePromptReturnFocus = null;

function isCoachPortalEmail(email) {
  return coachPortalEmails.includes(String(email || "").toLowerCase());
}

function normalizeClientEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function dashboardClientEmailParam() {
  try {
    const value = new URLSearchParams(window.location.search).get("client");
    const email = normalizeClientEmail(value);

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
  } catch (error) {
    return "";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function truncateText(value, maxLength = 90) {
  const text = String(value || "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(maxLength - 1, 0)).trimEnd()}...`;
}

function normalizeLogSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function logFieldsMatchSearch(fields, query) {
  const term = normalizeLogSearch(query);

  if (!term) {
    return true;
  }

  const haystack = fields.map((value) => normalizeLogSearch(value)).join(" ");
  const tokens = term.split(/\s+/).filter(Boolean);

  return tokens.every((token) => haystack.includes(token));
}

function clientTrainingLogMatchesSearch(log, query) {
  return logFieldsMatchSearch([
    log.entry_date,
    log.workout_title,
    log.exercise_code,
    log.exercise_name,
    log.notes
  ], query);
}

function clientFoodLogMatchesSearch(log, query) {
  return logFieldsMatchSearch([
    log.entry_date,
    log.meal,
    log.food_name,
    log.serving,
    log.notes
  ], query);
}

function trustedClientSheetUrl(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    const isGoogleSheet = url.hostname === "docs.google.com" && url.pathname.startsWith("/spreadsheets/");

    return isGoogleSheet ? url.toString() : "";
  } catch (error) {
    return "";
  }
}

function clientToUtcIsoDateString(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function normalizeClientSessionDate(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);

  if (match) {
    let [, month, day, year] = match;
    const resolvedYear = year.length === 2 ? `20${year}` : year;
    return `${resolvedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  match = text.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);

  if (match) {
    let [, month, day, year] = match;
    const resolvedYear = year.length === 2 ? `20${year}` : year;
    return `${resolvedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);

    if (Number.isFinite(serial) && serial >= 20000 && serial <= 80000) {
      const roundedSerial = Math.floor(serial);
      const utcMs = Date.UTC(1899, 11, 30) + roundedSerial * 86400000;
      const date = new Date(utcMs);

      return clientToUtcIsoDateString(date);
    }

    return "";
  }

  if (!/[a-z]/i.test(text)) {
    return "";
  }

  const parsed = new Date(text);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return clientToUtcIsoDateString(parsed);
}

function normalizeClientSessionCount(value) {
  const number = Number(String(value ?? "").trim());

  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function clientSessionDatesFromProgram(program = {}) {
  if (!Array.isArray(program.session_dates)) {
    return [];
  }

  return Array.from(new Set(
    program.session_dates
      .map((item) => normalizeClientSessionDate(item))
      .filter(Boolean)
  ));
}

function clientSessionPackageHistoryFromProgram(program = {}) {
  if (!Array.isArray(program.session_package_history)) {
    return [];
  }

  return program.session_package_history
    .map((item, index) => {
      const source = item && typeof item === "object" ? item : {};
      const used = normalizeClientSessionCount(source.used);
      const total = normalizeClientSessionCount(source.total);
      const archivedAt = normalizeClientSessionDate(source.archived_at || source.archivedAt);
      const dates = Array.isArray(source.dates)
        ? Array.from(new Set(source.dates.map((date) => normalizeClientSessionDate(date)).filter(Boolean)))
        : [];

      return {
        label: String(source.label || `Package ${index + 1}`).trim(),
        used,
        total,
        dates,
        archived_at: archivedAt
      };
    })
    .filter((item) => item.used > 0 || item.total > 0 || item.dates.length > 0)
    .slice(0, 20);
}

function renderClientSessionManualState(program = {}) {
  const countPill = document.getElementById("client-session-count-pill");
  const countValue = document.getElementById("client-session-count-value");
  const countStatus = document.getElementById("client-session-count-status");
  const datesStatus = document.getElementById("client-session-dates-status");
  const dateList = document.getElementById("client-session-date-list");
  const sheetLinkCard = document.getElementById("client-session-sheet-link-card");
  const sheetLink = document.getElementById("client-session-sheet-link-text");
  const packageStatus = document.getElementById("client-session-package-history-status");
  const packageList = document.getElementById("client-session-package-history-list");
  const used = normalizeClientSessionCount(program.session_count_used);
  const total = normalizeClientSessionCount(program.session_count_total);
  const recentDates = clientSessionDatesFromProgram(program);
  const packageHistory = clientSessionPackageHistoryFromProgram(program);
  const sheetUrl = trustedClientSheetUrl(program.sheet_url);
  const countDisplay = total > 0 ? `${used}/${total}` : (used > 0 ? String(used) : "--");

  if (countPill) {
    countPill.textContent = countDisplay === "--" ? "No sessions yet" : countDisplay;
  }

  if (countValue) {
    countValue.textContent = countDisplay;
  }

  if (countStatus) {
    if (countDisplay === "--") {
      countStatus.textContent = "Your coach will update your session count.";
    } else if (total > 0) {
      countStatus.textContent = `${used} used out of ${total} sessions.`;
    } else {
      countStatus.textContent = `${used} sessions used.`;
    }
  }

  if (datesStatus) {
    datesStatus.textContent = recentDates.length > 0
      ? "Session dates saved for this package."
      : "Session dates will appear here.";
  }

  if (dateList) {
    if (recentDates.length > 0) {
      dateList.innerHTML = recentDates.map((date) => (
        `<span class="session-date-chip">${escapeHtml(formatLogDate(date))}</span>`
      )).join("");
    } else {
      dateList.innerHTML = '<p class="empty-state">No session dates yet.</p>';
    }
  }

  if (sheetLinkCard) {
    sheetLinkCard.hidden = !sheetUrl;
  }

  if (sheetLink && sheetUrl) {
    sheetLink.href = sheetUrl;
  }

  if (packageStatus) {
    packageStatus.textContent = packageHistory.length > 0
      ? `${packageHistory.length} old package${packageHistory.length === 1 ? "" : "s"} archived.`
      : "Old packages will appear after your coach starts a new package.";
  }

  if (packageList) {
    if (packageHistory.length > 0) {
      packageList.innerHTML = packageHistory.map((item, index) => {
        const count = item.total > 0 ? `${item.used}/${item.total}` : `${item.used} used`;
        const archived = item.archived_at ? `Archived ${formatLogDate(item.archived_at)}` : "Archived package";
        const dates = item.dates.length > 0
          ? `<div class="session-date-list">${item.dates.map((date) => (
            `<span class="session-date-chip">${escapeHtml(formatLogDate(date))}</span>`
          )).join("")}</div>`
          : '<p class="empty-state">No dates archived for this package.</p>';

        return `
          <article class="session-package-history-card">
            <header>
              <div>
                <strong>${escapeHtml(item.label || `Package ${index + 1}`)}</strong>
                <small>${escapeHtml(archived)}</small>
              </div>
              <span>${escapeHtml(count)}</span>
            </header>
            ${dates}
          </article>
        `;
      }).join("");
    } else {
      packageList.innerHTML = '<p class="empty-state">No archived packages yet.</p>';
    }
  }

  renderClientHomeSummary();
}

function setText(selector, value) {
  const element = document.querySelector(selector);

  if (element) {
    element.textContent = value || "";
  }
}

function latestWorkoutLogSummary() {
  const workoutLogs = trainingLogs
    .filter((log) => log.exercise_code !== warmupExerciseCode && log.exercise_code !== cardioExerciseCode)
    .slice()
    .sort((a, b) => {
      const left = `${b.entry_date || ""} ${b.created_at || ""}`;
      const right = `${a.entry_date || ""} ${a.created_at || ""}`;

      return left.localeCompare(right);
    });
  const latest = workoutLogs[0];

  if (!latest) {
    return null;
  }

  const sameWorkoutLogs = workoutLogs.filter((log) => (
    String(log.entry_date || "") === String(latest.entry_date || "") &&
    String(log.workout_title || "") === String(latest.workout_title || "")
  ));
  const exerciseNames = new Set(sameWorkoutLogs.map((log) => log.exercise_name).filter(Boolean));

  return {
    date: latest.entry_date || "",
    title: latest.workout_title || "Workout",
    exerciseCount: exerciseNames.size
  };
}

function renderClientHomeSummary() {
  const homePanel = document.querySelector('[data-client-dashboard-panel="home"]');

  if (!homePanel || !currentProgram) {
    return;
  }

  const workouts = Array.isArray(currentProgram.workouts) ? currentProgram.workouts : [];
  const hasAssignedWorkout = workouts.length > 0;
  const nextWorkout = workouts[activeWorkoutTabIndex] || workouts[0] || {
    title: customWorkoutTitle,
    focus: "Build your own",
    format: "custom"
  };
  const used = normalizeClientSessionCount(currentProgram.session_count_used);
  const total = normalizeClientSessionCount(currentProgram.session_count_total);
  const todayFoodTotals = foodLogTotals(foodLogs.filter((log) => String(log.entry_date || "") === todayDate()));
  const nutrition = nutritionPlanFromProgram(currentProgram);
  const latestWorkout = latestWorkoutLogSummary();
  const latestProgress = progressEntries[progressEntries.length - 1];
  const latestMood = latestMoodEntry();
  const noteTitle = String(currentProgram.coach_note_title || "").trim();
  const noteBody = String(currentProgram.coach_note_body || "").trim();
  const checklist = document.getElementById("client-home-checklist");

  setText("#client-home-status", "Ready");
  setText("#client-home-workout-title", nextWorkout.title || "Workout");
  setText("#client-home-workout-meta", [
    nextWorkout.focus || "",
    nextWorkout.format ? formatLabel(inferWorkoutFormat(nextWorkout)) : ""
  ].filter(Boolean).join(" · ") || "Your training is ready.");
  setText("#client-home-session-count", total > 0 ? `${used}/${total}` : (used > 0 ? `${used} used` : "--"));
  setText("#client-home-session-meta", total > 0
    ? `${Math.max(total - used, 0)} sessions remaining in this package.`
    : "Your coach will update your sessions.");
  setText("#client-home-latest-workout", latestWorkout ? latestWorkout.title : "No workout logged yet");
  setText("#client-home-latest-workout-meta", latestWorkout
    ? `${formatLogDate(latestWorkout.date)} · ${latestWorkout.exerciseCount || 0} exercises logged`
    : "Finished workouts will appear here.");
  setText("#client-home-food-total", `${foodLogNumberLabel(todayFoodTotals.calories)} calories`);
  setText("#client-home-food-meta", [
    `${foodLogNumberLabel(todayFoodTotals.protein, "g")} protein`,
    nutrition.calories ? `Target ${nutrition.calories}` : ""
  ].filter(Boolean).join(" · ") || "Log food to track calories and macros.");
  setText("#client-home-mood", latestMood ? "Latest mood" : "How are you feeling?");
  setText("#client-home-mood-meta", latestMood
    ? `${formatLogDate(latestMood.entry_date)} · ${truncateText(String(latestMood.goal_note || "").trim(), 90)}`
    : "Log mood, energy, body readiness, or anything Benjamin should know today.");
  setText("#client-home-note-title", noteTitle || "No note yet");
  setText("#client-home-note-body", noteBody || "Coach notes will appear here when Benjamin adds one.");

  if (checklist) {
    const todayFoodLogged = foodLogs.some((log) => String(log.entry_date || "") === todayDate());
    const hasSessionCount = used > 0 || total > 0;
    const items = [
      {
        done: true,
        label: hasAssignedWorkout ? "Workout loaded" : "Custom workout available"
      },
      {
        done: Boolean(latestWorkout),
        label: latestWorkout ? "Workout progress saved" : "Save workout progress"
      },
      {
        done: todayFoodLogged,
        label: todayFoodLogged ? "Food logged today" : "Log food today"
      },
      {
        done: Boolean(latestMood || latestProgress),
        label: latestMood ? "Mood check-in saved" : (latestProgress ? "Check-in started" : "Add mood check-in")
      },
      {
        done: hasSessionCount,
        label: hasSessionCount ? "Session package updated" : "Session package pending"
      }
    ];

    checklist.innerHTML = items.map((item) => `
      <li class="${item.done ? "is-done" : ""}">
        <span>${item.done ? "Done" : "Next"}</span>
        <strong>${escapeHtml(item.label)}</strong>
      </li>
    `).join("");
  }
}

function withTimeout(promise, message, timeoutMs = dashboardRequestTimeout) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
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
    <label class="summary-metric">
      <strong>Height</strong>
      <input type="text" name="height" value="${escapeHtml(program.height === "Not set" ? "" : (program.height || ""))}" placeholder="Not set" />
    </label>
    <label class="summary-metric">
      <strong>Starting weight</strong>
      <input type="text" name="starting_weight" value="${escapeHtml(program.starting_weight === "Not set" ? "" : (program.starting_weight || ""))}" placeholder="Not set" />
    </label>
    <label class="summary-metric">
      <strong>Starting bodyfat</strong>
      <input type="text" name="starting_bodyfat" value="${escapeHtml(program.starting_bodyfat === "Not set" ? "" : (program.starting_bodyfat || ""))}" placeholder="Not set" />
    </label>
    <div class="summary-metric-actions">
      <button class="button button-ghost" type="button" id="save-client-metrics-button">Save</button>
      <small id="client-metrics-status">Update these any time.</small>
    </div>
  `;
}

function nutritionPlanFromProgram(program = {}) {
  const source = program.nutrition_plan && typeof program.nutrition_plan === "object"
    ? program.nutrition_plan
    : {};

  return {
    calories: String(source.calories || "").trim(),
    protein: String(source.protein || "").trim(),
    carbs: String(source.carbs || "").trim(),
    fat: String(source.fat || "").trim(),
    guide: String(source.guide || "").trim(),
    source: String(source.source || "").trim(),
    goal: String(source.goal || "").trim(),
    sex: String(source.sex || "").trim(),
    age: String(source.age || "").trim(),
    height: String(source.height || "").trim(),
    current_weight: String(source.current_weight || "").trim(),
    workouts_per_week: String(source.workouts_per_week || "").trim(),
    daily_movement: String(source.daily_movement || "").trim(),
    training_intensity: String(source.training_intensity || "").trim(),
    activity_factor: String(source.activity_factor || "").trim(),
    maintenance_calories: String(source.maintenance_calories || "").trim(),
    updated_at: String(source.updated_at || "").trim()
  };
}

function nutritionTargetLabel(value) {
  return value || "Not set";
}

function editableNutritionTargetCard(label, name, value, placeholder) {
  return `
    <label class="nutrition-macro-card nutrition-macro-edit">
      <span>${escapeHtml(label)}</span>
      <input
        type="text"
        name="${escapeHtml(name)}"
        value="${escapeHtml(value || "")}"
        data-default-value="${escapeHtml(value || "")}"
        placeholder="${escapeHtml(placeholder)}"
      />
    </label>
  `;
}

function numberValue(value) {
  const parsed = Number.parseFloat(String(value || "").replace(/[^0-9.]/g, ""));

  return Number.isFinite(parsed) ? parsed : 0;
}

function roundToNearest(value, nearest) {
  return Math.round(value / nearest) * nearest;
}

function nutritionHeightInches(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"');

  if (!text) {
    return 0;
  }

  const cmMatch = text.match(/^(\d+(?:\.\d+)?)\s*cm\b/);

  if (cmMatch) {
    const inches = Number(cmMatch[1]) / 2.54;
    return inches >= 48 && inches <= 96 ? inches : 0;
  }

  const feetMatch = text.match(/^(\d+)\s*(?:'|ft|feet)\s*(\d+)?/);

  if (feetMatch) {
    const inches = (Number(feetMatch[1]) * 12) + Number(feetMatch[2] || 0);
    return inches >= 48 && inches <= 96 ? inches : 0;
  }

  const separatedFeetMatch = text.match(/^(\d)\s*(?:-|\.|\s)\s*(\d{1,2})\s*(?:in|")?$/);

  if (separatedFeetMatch) {
    const inches = (Number(separatedFeetMatch[1]) * 12) + Number(separatedFeetMatch[2] || 0);
    return inches >= 48 && inches <= 96 ? inches : 0;
  }

  const plainNumber = numberValue(text);

  if (!plainNumber) {
    return 0;
  }

  const inches = plainNumber <= 8 ? plainNumber * 12 : plainNumber;

  return inches >= 48 && inches <= 96 ? inches : 0;
}

function nutritionActivityFactor(workoutsPerWeek, movement, intensity) {
  const movementBase = {
    mostly_sitting: 1.2,
    mixed: 1.35,
    active_job: 1.5
  };
  const workoutNumber = Math.min(Math.max(Number.parseInt(workoutsPerWeek, 10) || 0, 0), 7);
  const workoutBoost = workoutNumber === 0
    ? 0
    : workoutNumber <= 2
      ? 0.1
      : workoutNumber <= 4
        ? 0.2
        : workoutNumber <= 6
          ? 0.3
          : 0.35;
  const intensityBoost = intensity === "hard" ? 0.05 : intensity === "light" ? -0.03 : 0;
  const factor = (movementBase[movement] || movementBase.mixed) + workoutBoost + intensityBoost;

  return Math.min(Math.max(factor, 1.2), 1.85);
}

function nutritionGoalMultiplier(goal) {
  if (goal === "fat_loss") {
    return 0.85;
  }

  if (goal === "muscle_gain") {
    return 1.1;
  }

  if (goal === "recomposition") {
    return 0.98;
  }

  return 1;
}

function nutritionProteinPerPound(goal) {
  if (goal === "fat_loss" || goal === "recomposition") {
    return 1;
  }

  if (goal === "muscle_gain") {
    return 0.9;
  }

  return 0.8;
}

function nutritionGoalLabel(goal) {
  const labels = {
    fat_loss: "fat loss",
    muscle_gain: "muscle gain",
    recomposition: "building muscle and leaning out",
    maintenance: "maintenance"
  };

  return labels[goal] || "your goal";
}

function calculateNutritionPlan(values) {
  const age = Number.parseInt(values.age, 10) || 0;
  const weightLbs = numberValue(values.current_weight);
  const heightInches = nutritionHeightInches(values.height);

  if (!age || !weightLbs || !heightInches || !values.sex) {
    return { error: new Error("Add age, sex, height, and current weight first.") };
  }

  const weightKg = weightLbs * 0.45359237;
  const heightCm = heightInches * 2.54;
  const bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * age) + (values.sex === "female" ? -161 : 5);
  const activityFactor = nutritionActivityFactor(values.workouts_per_week, values.daily_movement, values.training_intensity);
  const maintenanceCalories = roundToNearest(bmr * activityFactor, 25);
  const calories = roundToNearest(maintenanceCalories * nutritionGoalMultiplier(values.goal), 25);
  const protein = roundToNearest(weightLbs * nutritionProteinPerPound(values.goal), 5);
  const fat = roundToNearest((calories * 0.25) / 9, 5);
  const carbCalories = Math.max(calories - ((protein * 4) + (fat * 9)), 0);
  const carbs = roundToNearest(carbCalories / 4, 5);

  return {
    plan: {
      calories: `${calories} cal`,
      protein: `${protein}g`,
      carbs: `${carbs}g`,
      fat: `${fat}g`,
      guide: `Starting target for ${nutritionGoalLabel(values.goal)}. Review with Benjamin and adjust based on energy, hunger, performance, and progress.`,
      source: "client_calculator",
      goal: values.goal,
      sex: values.sex,
      age: String(age),
      height: values.height,
      current_weight: String(weightLbs),
      workouts_per_week: String(values.workouts_per_week || "0"),
      daily_movement: values.daily_movement,
      training_intensity: values.training_intensity,
      activity_factor: activityFactor.toFixed(2),
      maintenance_calories: String(maintenanceCalories),
      updated_at: new Date().toISOString()
    }
  };
}

function setSelectValue(select, value, fallback) {
  if (!select) {
    return;
  }

  select.value = value || fallback || "";
}

function fillClientNutritionSetup(program) {
  const setup = document.getElementById("client-nutrition-setup");

  if (!setup) {
    return;
  }

  const nutrition = nutritionPlanFromProgram(program);
  setSelectValue(setup.querySelector('[name="nutrition_goal"]'), nutrition.goal, "fat_loss");
  setSelectValue(setup.querySelector('[name="nutrition_sex"]'), nutrition.sex, "");
  setSelectValue(setup.querySelector('[name="nutrition_workouts"]'), nutrition.workouts_per_week, "3");
  setSelectValue(setup.querySelector('[name="nutrition_movement"]'), nutrition.daily_movement, "mixed");
  setSelectValue(setup.querySelector('[name="nutrition_intensity"]'), nutrition.training_intensity, "moderate");

  const ageInput = setup.querySelector('[name="nutrition_age"]');
  const heightInput = setup.querySelector('[name="nutrition_height"]');
  const weightInput = setup.querySelector('[name="nutrition_weight"]');

  if (ageInput) {
    ageInput.value = nutrition.age || "";
  }
  if (heightInput) {
    heightInput.value = nutrition.height || (program.height === "Not set" ? "" : (program.height || ""));
  }
  if (weightInput) {
    weightInput.value = nutrition.current_weight || (program.starting_weight === "Not set" ? "" : (program.starting_weight || ""));
  }
}

function renderClientNutrition(program) {
  const targets = document.getElementById("client-nutrition-targets");
  const guide = document.getElementById("client-nutrition-guide");
  const status = document.getElementById("client-nutrition-status");
  const nutrition = nutritionPlanFromProgram(program);
  const hasTargets = Boolean(nutrition.calories || nutrition.protein || nutrition.carbs || nutrition.fat || nutrition.guide);

  if (status) {
    status.textContent = nutrition.source === "client_calculator"
      ? "Client setup"
      : nutrition.source === "client_manual"
        ? "Client edited"
        : hasTargets
          ? "Coach plan"
          : "Not set yet";
  }

  if (targets) {
    targets.innerHTML = `
      ${editableNutritionTargetCard("Calories", "client_nutrition_calories", nutrition.calories, "2,400 cal")}
      ${editableNutritionTargetCard("Protein", "client_nutrition_protein", nutrition.protein, "180g")}
      ${editableNutritionTargetCard("Carbs", "client_nutrition_carbs", nutrition.carbs, "250g")}
      ${editableNutritionTargetCard("Fat", "client_nutrition_fat", nutrition.fat, "75g")}
    `;
  }

  if (guide) {
    guide.textContent = nutrition.guide || "Your coach will add calories, macros, and nutrition notes here.";
  }

  fillClientNutritionSetup(program);
}

function foodLogNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) && number >= 0 ? number : null;
}

function foodLogNumberLabel(value, suffix = "") {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "--";
  }

  return `${Math.round(number * 10) / 10}${suffix}`;
}

function progressNumber(value) {
  const text = String(value ?? "").trim();

  if (!text) {
    return null;
  }

  const number = Number(text);

  return Number.isFinite(number) && number >= 0 ? number : null;
}

function foodEntryForm() {
  return document.getElementById("client-food-entry-form");
}

function fillFoodEntryDefaults() {
  const form = foodEntryForm();

  if (!form) {
    return;
  }

  const dateInput = form.querySelector('[name="food_entry_date"]');

  if (dateInput && !dateInput.value) {
    dateInput.value = todayDate();
  }
}

function setFoodEntryStatus(message) {
  const status = document.getElementById("food-entry-status");

  if (status) {
    status.textContent = message;
  }
}

function foodLogTotals(logs) {
  return logs.reduce((totals, log) => {
    totals.calories += Number(log.calories || 0);
    totals.protein += Number(log.protein || 0);
    totals.carbs += Number(log.carbs || 0);
    totals.fat += Number(log.fat || 0);
    return totals;
  }, {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0
  });
}

function renderFoodLogSummary(logs) {
  const summary = document.getElementById("client-food-day-summary");
  const form = foodEntryForm();
  const dateInput = form?.querySelector('[name="food_entry_date"]');
  const activeDate = dateInput?.value || todayDate();

  if (!summary) {
    return;
  }

  const totals = foodLogTotals(logs.filter((log) => String(log.entry_date || "") === activeDate));

  summary.innerHTML = `
    <article class="food-log-summary-card">
      <span>${escapeHtml(formatLogDate(activeDate))}</span>
      <strong>${escapeHtml(foodLogNumberLabel(totals.calories))}</strong>
      <small>calories</small>
    </article>
    <article class="food-log-summary-card">
      <span>Protein</span>
      <strong>${escapeHtml(foodLogNumberLabel(totals.protein, "g"))}</strong>
    </article>
    <article class="food-log-summary-card">
      <span>Carbs</span>
      <strong>${escapeHtml(foodLogNumberLabel(totals.carbs, "g"))}</strong>
    </article>
    <article class="food-log-summary-card">
      <span>Fat</span>
      <strong>${escapeHtml(foodLogNumberLabel(totals.fat, "g"))}</strong>
    </article>
  `;
}

function renderClientFoodLogs() {
  const list = document.getElementById("client-food-log-list");
  const count = document.getElementById("client-food-log-count");

  if (!list) {
    return;
  }

  renderFoodLogSummary(foodLogs);

  if (count) {
    count.textContent = foodLogs.length
      ? `${foodLogs.length} ${foodLogs.length === 1 ? "entry" : "entries"}`
      : "No food yet";
  }

  if (!foodLogs.length) {
    list.innerHTML = '<p class="empty-state">No food logged yet.</p>';
    renderClientHomeSummary();
    return;
  }

  const grouped = foodLogs.reduce((groups, log) => {
    const date = log.entry_date || "";

    if (!groups.has(date)) {
      groups.set(date, []);
    }

    groups.get(date).push(log);
    return groups;
  }, new Map());

  list.innerHTML = Array.from(grouped.entries())
    .sort(([left], [right]) => String(right).localeCompare(String(left)))
    .slice(0, 7)
    .map(([date, logs]) => {
      const totals = foodLogTotals(logs);

      return `
        <section class="food-log-day">
          <div class="food-log-day-heading">
            <strong>${escapeHtml(formatLogDate(date))}</strong>
            <span>${escapeHtml(foodLogNumberLabel(totals.calories))} calories</span>
          </div>
          ${logs.map((log) => `
            <article class="food-log-row" data-food-log-id="${escapeHtml(log.id || "")}">
              <div class="food-log-row-main">
                <strong>${escapeHtml(log.food_name || "Food")}</strong>
                <em>${escapeHtml([log.meal, log.serving].filter(Boolean).join(" · "))}</em>
                <div class="food-log-macros">
                  <span>${escapeHtml(foodLogNumberLabel(log.calories))} cal</span>
                  <span>${escapeHtml(foodLogNumberLabel(log.protein, "g"))} protein</span>
                  <span>${escapeHtml(foodLogNumberLabel(log.carbs, "g"))} carbs</span>
                  <span>${escapeHtml(foodLogNumberLabel(log.fat, "g"))} fat</span>
                </div>
                ${log.notes ? `<small>${escapeHtml(log.notes)}</small>` : ""}
              </div>
              <button class="button food-log-delete" type="button" data-delete-food-log="${escapeHtml(log.id || "")}">Delete</button>
            </article>
          `).join("")}
        </section>
      `;
    }).join("");

  renderClientHomeSummary();
}

function populateFoodLogs(logs) {
  foodLogs = Array.isArray(logs) ? logs : [];
  renderClientFoodLogs();
  renderClientTrainingLogs();
  renderClientHomeSummary();
}

function resetFoodSearchResults() {
  foodSearchResults = [];
  const resultField = document.querySelector(".food-result-field");
  const resultSelect = document.getElementById("food-search-results");

  if (resultField) {
    resultField.hidden = true;
  }

  if (resultSelect) {
    resultSelect.innerHTML = "";
  }
}

function applyFoodResult(food) {
  const form = foodEntryForm();

  if (!form || !food) {
    return;
  }

  const fields = {
    food_name: food.description || "",
    food_serving: food.serving || "",
    food_calories: food.calories ?? "",
    food_protein: food.protein ?? "",
    food_carbs: food.carbs ?? "",
    food_fat: food.fat ?? ""
  };

  Object.entries(fields).forEach(([name, value]) => {
    const input = form.querySelector(`[name="${name}"]`);

    if (input) {
      input.value = value;
    }
  });

  form.dataset.foodSource = "USDA FoodData Central";
  form.dataset.fdcId = food.fdcId || "";
}

function foodSearchString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function foodSearchNutrientAmount(food, names) {
  const nutrients = Array.isArray(food?.foodNutrients) ? food.foodNutrients : [];

  for (const nutrient of nutrients) {
    if (!nutrient || typeof nutrient !== "object") {
      continue;
    }

    const nutrientName = String(nutrient.nutrientName || nutrient.name || "").toLowerCase();
    const hasMatch = names.some((name) => nutrientName === name || nutrientName.includes(name));

    if (!hasMatch) {
      continue;
    }

    const value = Number(nutrient.value ?? nutrient.amount);

    if (Number.isFinite(value)) {
      return Math.round(value * 10) / 10;
    }
  }

  return null;
}

function foodSearchServingLabel(food) {
  const household = foodSearchString(food?.householdServingFullText);

  if (household) {
    return household;
  }

  const size = Number(food?.servingSize);
  const unit = foodSearchString(food?.servingSizeUnit);

  if (Number.isFinite(size) && unit) {
    return `${size}${unit}`;
  }

  return "100g";
}

function normalizeFoodSearchResult(food) {
  const source = food && typeof food === "object" ? food : {};

  return {
    fdcId: String(source.fdcId || ""),
    description: foodSearchString(source.description),
    brandOwner: foodSearchString(source.brandOwner || source.brandName),
    serving: foodSearchServingLabel(source),
    calories: foodSearchNutrientAmount(source, ["energy"]),
    protein: foodSearchNutrientAmount(source, ["protein"]),
    carbs: foodSearchNutrientAmount(source, ["carbohydrate"]),
    fat: foodSearchNutrientAmount(source, ["total lipid", "fat"])
  };
}

async function searchUsdaFoodsDirect(query) {
  const response = await fetch("https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      pageSize: 8,
      dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"]
    })
  });

  if (!response.ok) {
    throw new Error("Food lookup is not available. Enter food manually.");
  }

  const payload = await response.json().catch(() => ({}));
  const foods = Array.isArray(payload.foods) ? payload.foods : [];

  return foods.map(normalizeFoodSearchResult).filter((food) => food.description);
}

async function searchFoods(query) {
  if (supabaseClient) {
    const { data, error } = await supabaseClient.functions.invoke("food-search", {
      body: { query }
    });

    if (!error) {
      return Array.isArray(data?.foods) ? data.foods : [];
    }
  }

  return searchUsdaFoodsDirect(query);
}

async function handleFoodSearch() {
  const button = document.getElementById("search-food-button");

  if (!button) {
    return;
  }

  button.addEventListener("click", async () => {
    const form = foodEntryForm();
    const query = form?.querySelector('[name="food_search"]')?.value.trim() || "";

    resetFoodSearchResults();

    if (!query) {
      setFoodEntryStatus("Enter a food to search, or fill the macros manually.");
      return;
    }

    button.disabled = true;
    setFoodEntryStatus("Searching foods...");

    try {
      foodSearchResults = await searchFoods(query);

      if (!foodSearchResults.length) {
        setFoodEntryStatus("No food matches found. Enter it manually.");
        return;
      }

      const resultField = document.querySelector(".food-result-field");
      const resultSelect = document.getElementById("food-search-results");

      if (resultField && resultSelect) {
        resultField.hidden = false;
        resultSelect.innerHTML = foodSearchResults.map((food, index) => `
          <option value="${escapeHtml(index)}">${escapeHtml([
            food.description,
            food.brandOwner,
            food.serving
          ].filter(Boolean).join(" · "))}</option>
        `).join("");
        resultSelect.value = "0";
      }

      applyFoodResult(foodSearchResults[0]);
      setFoodEntryStatus("Pick the closest match, then adjust the serving if needed.");
    } catch (error) {
      setFoodEntryStatus(error?.message || "Food lookup is not available. Enter food manually.");
    } finally {
      button.disabled = false;
    }
  });
}

function handleFoodResultSelect() {
  const resultSelect = document.getElementById("food-search-results");

  if (!resultSelect) {
    return;
  }

  resultSelect.addEventListener("change", () => {
    applyFoodResult(foodSearchResults[Number(resultSelect.value)] || null);
  });
}

function foodEntryPayload() {
  const form = foodEntryForm();

  if (!form) {
    return null;
  }

  return {
    client_email: activeClientEmail,
    entry_date: form.querySelector('[name="food_entry_date"]')?.value || todayDate(),
    meal: form.querySelector('[name="food_meal"]')?.value || "Meal",
    food_name: form.querySelector('[name="food_name"]')?.value.trim() || "",
    serving: form.querySelector('[name="food_serving"]')?.value.trim() || "",
    calories: foodLogNumber(form.querySelector('[name="food_calories"]')?.value),
    protein: foodLogNumber(form.querySelector('[name="food_protein"]')?.value),
    carbs: foodLogNumber(form.querySelector('[name="food_carbs"]')?.value),
    fat: foodLogNumber(form.querySelector('[name="food_fat"]')?.value),
    source: form.dataset.foodSource || "Manual",
    fdc_id: form.dataset.fdcId || "",
    notes: form.querySelector('[name="food_notes"]')?.value.trim() || ""
  };
}

function resetFoodEntryForm() {
  const form = foodEntryForm();

  if (!form) {
    return;
  }

  const dateValue = form.querySelector('[name="food_entry_date"]')?.value || todayDate();
  const mealValue = form.querySelector('[name="food_meal"]')?.value || "Breakfast";
  form.querySelectorAll("input, textarea").forEach((input) => {
    input.value = "";
  });
  const dateInput = form.querySelector('[name="food_entry_date"]');
  const mealInput = form.querySelector('[name="food_meal"]');

  if (dateInput) {
    dateInput.value = dateValue;
  }

  if (mealInput) {
    mealInput.value = mealValue;
  }

  form.dataset.foodSource = "";
  form.dataset.fdcId = "";
  resetFoodSearchResults();
}

function handleFoodSave() {
  const button = document.getElementById("save-food-entry-button");

  if (!button) {
    return;
  }

  button.addEventListener("click", async () => {
    const payload = foodEntryPayload();

    if (!payload?.food_name) {
      setFoodEntryStatus("Add a food name first.");
      return;
    }

    if (!supabaseClient || !activeClientEmail) {
      setFoodEntryStatus("Could not save food yet. Refresh and try again.");
      return;
    }

    button.disabled = true;
    setFoodEntryStatus("Saving food...");

    try {
      const { data, error } = await supabaseClient
        .from("client_food_logs")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        setFoodEntryStatus(error.message || "Could not save food.");
        return;
      }

      foodLogs = [data, ...foodLogs].sort((a, b) => String(b.entry_date || "").localeCompare(String(a.entry_date || "")));
      renderClientFoodLogs();
      renderClientTrainingLogs();
      resetFoodEntryForm();
      setFoodEntryStatus("Food saved.");
    } catch (error) {
      setFoodEntryStatus(error?.message || "Could not save food.");
    } finally {
      button.disabled = false;
    }
  });
}

function handleFoodDelete() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-food-log]");

    if (!button) {
      return;
    }

    const id = button.dataset.deleteFoodLog;

    if (!id || !supabaseClient) {
      return;
    }

    button.disabled = true;
    setFoodEntryStatus("Deleting food...");

    try {
      const { error } = await supabaseClient
        .from("client_food_logs")
        .delete()
        .eq("id", id);

      if (error) {
        setFoodEntryStatus(error.message || "Could not delete food.");
        button.disabled = false;
        return;
      }

      foodLogs = foodLogs.filter((log) => String(log.id) !== String(id));
      renderClientFoodLogs();
      renderClientTrainingLogs();
      setFoodEntryStatus("Food deleted.");
    } catch (error) {
      setFoodEntryStatus(error?.message || "Could not delete food.");
      button.disabled = false;
    }
  });
}

function handleFoodEntryDateChange() {
  const form = foodEntryForm();
  const dateInput = form?.querySelector('[name="food_entry_date"]');

  if (!dateInput) {
    return;
  }

  dateInput.addEventListener("change", () => {
    renderClientFoodLogs();
  });
}

function formatProgressValue(value, suffix) {
  if (value === null || value === undefined || value === "") {
    return "Not set";
  }

  return `${escapeHtml(value)}${suffix}`;
}

function progressMeasurements(entry = {}) {
  const measurements = entry && typeof entry.measurements === "object" && !Array.isArray(entry.measurements)
    ? entry.measurements
    : {};

  return {
    ...measurements,
    arm: measurements.arm ?? measurements.arms ?? null,
    thigh: measurements.thigh ?? measurements.thighs ?? null
  };
}

function measurementRows(entry = {}) {
  const measurements = progressMeasurements(entry);
  const rows = [
    ["Chest", measurements.chest],
    ["Waist", measurements.waist],
    ["Hips / glutes", measurements.hips],
    ["Arm", measurements.arm],
    ["Thigh", measurements.thigh]
  ];

  return rows.filter(([, value]) => value !== null && value !== undefined && value !== "");
}

function measurementSummary(entry = {}) {
  const rows = measurementRows(entry);

  if (rows.length === 0) {
    return "No measurements";
  }

  return rows.map(([label, value]) => `${label}: ${value} in`).join(" · ");
}

function latestMoodEntry() {
  return [...progressEntries].reverse().find((entry) => String(entry.goal_note || "").trim());
}

function homeMoodNote(form) {
  const mood = String(form.elements.home_mood?.value || "").trim();
  const energy = String(form.elements.home_energy?.value || "").trim();
  const sleep = String(form.elements.home_sleep?.value || "").trim();
  const eating = String(form.elements.home_eating?.value || "").trim();
  const bodyFeeling = String(form.elements.home_body_feeling?.value || "").trim();
  const note = String(form.elements.home_mood_note?.value || "").trim();
  const pieces = [];

  if (mood) {
    pieces.push(`Mood: ${mood}`);
  }

  if (energy) {
    pieces.push(`Energy: ${energy}/5`);
  }

  if (sleep) {
    pieces.push(`Sleep: ${sleep}/5`);
  }

  if (eating) {
    pieces.push(`Eating: ${eating}`);
  }

  if (bodyFeeling) {
    pieces.push(`Body: ${bodyFeeling}`);
  }

  if (note) {
    pieces.push(`Note: ${note}`);
  }

  return pieces.join(" · ");
}

function fillClientProgressForm(entry = {}) {
  const form = document.getElementById("client-checkin-form");

  if (!form) {
    return;
  }

  const measurements = progressMeasurements(entry);
  form.elements.progress_date.value = entry.entry_date || new Date().toISOString().slice(0, 10);
  form.elements.progress_bodyweight.value = entry.bodyweight ?? "";
  form.elements.progress_bodyfat.value = entry.bodyfat ?? "";
  form.elements.progress_muscle_mass.value = entry.muscle_mass ?? "";
  form.elements.progress_chest.value = measurements.chest ?? "";
  form.elements.progress_waist.value = measurements.waist ?? "";
  form.elements.progress_hips.value = measurements.hips ?? "";
  form.elements.progress_arm.value = measurements.arm ?? "";
  form.elements.progress_thigh.value = measurements.thigh ?? "";
  form.elements.progress_goal.value = entry.goal_note || "";
}

function clientProgressPayload(form, email) {
  const entryDate = form.elements.progress_date.value || todayDate();
  const existing = progressEntries.find((entry) => entry.entry_date === entryDate) || {};
  const existingMeasurements = progressMeasurements(existing);
  const nextNumber = (fieldName, current) => {
    const raw = String(form.elements[fieldName]?.value || "").trim();
    return raw ? progressNumber(raw) : current ?? null;
  };
  const note = form.elements.progress_goal.value.trim();

  return {
    client_email: email,
    entry_date: entryDate,
    bodyweight: nextNumber("progress_bodyweight", existing.bodyweight),
    bodyfat: nextNumber("progress_bodyfat", existing.bodyfat),
    muscle_mass: nextNumber("progress_muscle_mass", existing.muscle_mass),
    measurements: {
      ...existingMeasurements,
      chest: nextNumber("progress_chest", existingMeasurements.chest),
      waist: nextNumber("progress_waist", existingMeasurements.waist),
      hips: nextNumber("progress_hips", existingMeasurements.hips),
      arm: nextNumber("progress_arm", existingMeasurements.arm),
      thigh: nextNumber("progress_thigh", existingMeasurements.thigh)
    },
    goal_note: note || existing.goal_note || ""
  };
}

function renderRest(rest) {
  if (!rest) {
    return "";
  }

  return `<small>${escapeHtml(rest)}</small>`;
}

function youtubeExerciseSearchUrl(exerciseName) {
  const name = String(exerciseName || "").trim();

  if (!name) {
    return "";
  }

  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise demo`)}`;
}

function approvedExerciseForName(exerciseName) {
  const normalizedName = String(exerciseName || "").trim().toLowerCase();

  if (!normalizedName) {
    return null;
  }

  return exerciseLibraryEntries.find((exercise) => (
    String(exercise.name || "").trim().toLowerCase() === normalizedName
    || (exercise.aliases || []).some((alias) => String(alias).trim().toLowerCase() === normalizedName)
  )) || null;
}

function exerciseVideoUrl(exercise) {
  const approvedExercise = approvedExerciseForName(exercise.name);
  let rawUrl = String(
    exercise.video ||
    exercise.videoUrl ||
    exercise.video_url ||
    exercise.youtube_url ||
    approvedExercise?.demo_url ||
    ""
  ).trim();

  if (!rawUrl) {
    rawUrl = youtubeExerciseSearchUrl(exercise.name);
  }

  if (/^(www\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)\//i.test(rawUrl)) {
    rawUrl = `https://${rawUrl}`;
  }

  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    const allowedHosts = new Set(["youtube.com", "youtube-nocookie.com", "m.youtube.com", "youtu.be"]);

    if (!["http:", "https:"].includes(url.protocol) || !allowedHosts.has(host)) {
      return "";
    }

    return url.href;
  } catch (error) {
    return "";
  }
}

function exerciseVideoMarkup(exercise) {
  const videoUrl = exerciseVideoUrl(exercise);

  if (!videoUrl) {
    return "";
  }

  return `
    <a class="exercise-video-link" href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer">
      Watch demo
    </a>
  `;
}

const muscleMeta = {
  chest: { label: "Chest", group: "Push", selector: "chest" },
  shoulders: { label: "Shoulders", group: "Push", selector: "shoulders" },
  triceps: { label: "Triceps", group: "Push", selector: "triceps" },
  biceps: { label: "Biceps", group: "Pull", selector: "biceps" },
  back: { label: "Back", group: "Pull", selector: "back" },
  lats: { label: "Lats", group: "Pull", selector: "lats" },
  glutes: { label: "Glutes", group: "Lower", selector: "glutes" },
  hamstrings: { label: "Hamstrings", group: "Lower", selector: "hamstrings" },
  quads: { label: "Quads", group: "Lower", selector: "quads" },
  calves: { label: "Calves", group: "Lower", selector: "calves" },
  core: { label: "Core", group: "Core", selector: "core" }
};

const muscleRules = [
  { pattern: /\b(lat pulldown|pull[-\s]?up|chin[-\s]?up)\b/i, muscles: ["lats", "biceps"] },
  { pattern: /\b(row|pullover)\b/i, muscles: ["back", "lats", "biceps"] },
  { pattern: /\b(face pull|rear delt|reverse fly)\b/i, muscles: ["shoulders", "back"] },
  { pattern: /\b(shoulder press|overhead press|military press)\b/i, muscles: ["shoulders", "triceps"] },
  { pattern: /\b(lateral raise|front raise|upright row)\b/i, muscles: ["shoulders"] },
  { pattern: /\b(curl|hammer curl)\b/i, muscles: ["biceps"] },
  { pattern: /\b(triceps|pushdown|skull crusher|dip)\b/i, muscles: ["triceps"] },
  { pattern: /\b(bench|chest press|push[-\s]?up|fly|pec)\b/i, muscles: ["chest", "triceps", "shoulders"] },
  { pattern: /\b(hip thrust|glute bridge|kickback)\b/i, muscles: ["glutes", "hamstrings"] },
  { pattern: /\b(romanian deadlift|rdl|stiff leg|good morning)\b/i, muscles: ["hamstrings", "glutes", "back"] },
  { pattern: /\b(deadlift)\b/i, muscles: ["hamstrings", "glutes", "back"] },
  { pattern: /\b(squat|split squat|lunge|leg press|step[-\s]?up)\b/i, muscles: ["quads", "glutes", "hamstrings"] },
  { pattern: /\b(leg extension)\b/i, muscles: ["quads"] },
  { pattern: /\b(leg curl)\b/i, muscles: ["hamstrings"] },
  { pattern: /\b(back extension)\b/i, muscles: ["glutes", "hamstrings", "back"] },
  { pattern: /\b(lateral walk|abduction|clam)\b/i, muscles: ["glutes"] },
  { pattern: /\b(calf|calves)\b/i, muscles: ["calves"] },
  { pattern: /\b(plank|dead bug|crunch|sit[-\s]?up|pallof|woodchop|rotation|hollow)\b/i, muscles: ["core"] }
];

function normalizeMuscle(value) {
  const text = String(value || "").toLowerCase().trim();
  const aliases = {
    abs: "core",
    abdominal: "core",
    abdominals: "core",
    arm: "biceps",
    arms: "biceps",
    back: "back",
    chest: "chest",
    delts: "shoulders",
    delt: "shoulders",
    glute: "glutes",
    glutes: "glutes",
    hamstring: "hamstrings",
    hamstrings: "hamstrings",
    lats: "lats",
    lat: "lats",
    legs: "quads",
    quads: "quads",
    quadriceps: "quads",
    shoulders: "shoulders",
    shoulder: "shoulders",
    tricep: "triceps",
    triceps: "triceps",
    bicep: "biceps",
    biceps: "biceps",
    calves: "calves",
    calf: "calves"
  };

  return aliases[text] || "";
}

function uniqueMuscles(muscles) {
  return [...new Set((muscles || []).map(normalizeMuscle).filter(Boolean))];
}

function explicitMusclesForExercise(exercise) {
  return uniqueMuscles(String(exercise.muscles || exercise.targets || "")
    .split(/[,/]+/)
    .map((item) => item.trim()));
}

function inferExerciseMuscles(exercise, workoutFocus = "") {
  const explicit = explicitMusclesForExercise(exercise);

  if (explicit.length > 0) {
    return explicit.slice(0, 5);
  }

  const text = `${exercise.name || ""} ${exercise.prescription || ""}`;
  const matched = muscleRules.flatMap((rule) => rule.pattern.test(text) ? rule.muscles : []);
  const focusMuscles = uniqueMuscles(String(workoutFocus || "")
    .split(/[,/]+/)
    .map((item) => item.trim()));

  return uniqueMuscles([...matched, ...focusMuscles]).slice(0, 5);
}

function muscleLabels(muscles) {
  return (muscles || []).map((muscle) => muscleMeta[muscle]?.label || muscle);
}

function muscleTargetMarkup(muscles) {
  if (!muscles.length) {
    return '<span class="muscle-target-empty">Target muscles inferred after coach tags this exercise.</span>';
  }

  return `
    <div class="muscle-targets" aria-label="Targeted muscle groups">
      ${muscles.map((muscle, index) => `
        <span class="${index === 0 ? "is-primary" : ""}">${escapeHtml(muscleMeta[muscle]?.label || muscle)}</span>
      `).join("")}
    </div>
  `;
}

function workoutInsightData(workout) {
  const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];
  const muscleCounts = new Map();

  exercises.forEach((exercise) => {
    inferExerciseMuscles(exercise, workout.focus).forEach((muscle) => {
      muscleCounts.set(muscle, (muscleCounts.get(muscle) || 0) + 1);
    });
  });

  const topMuscles = Array.from(muscleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([muscle]) => muscle);
  const estimatedSets = exercises.reduce((total, exercise) => total + setCountFromPrescription(exercise.prescription), 0);
  const heavySetCount = exercises.filter((exercise) => setCountFromPrescription(exercise.prescription) >= 5).length;
  const format = formatLabel(inferWorkoutFormat(workout));

  return { exerciseCount: exercises.length, estimatedSets, format, topMuscles, heavySetCount };
}

function renderWorkoutInsights(program) {
  const panel = document.getElementById("workout-insights-panel");

  if (!panel) {
    return;
  }

  const workouts = Array.isArray(program.workouts) ? program.workouts : [];
  const firstWorkout = workouts[0] || {};
  const nextWorkout = workouts[1] || {};
  const todayInsights = workoutInsightData(firstWorkout);
  const nextInsights = workoutInsightData(nextWorkout);
  panel.innerHTML = `
    <div class="panel-heading">
      <div>
        <p class="kicker">Workout insights</p>
        <h2>What this block is training</h2>
      </div>
      <span class="status-pill">${escapeHtml(workouts.length || 0)} workouts</span>
    </div>
    <div class="insight-grid">
      <article class="insight-card">
        <span>Today</span>
        <strong>${escapeHtml(todayInsights.exerciseCount || 0)} exercises</strong>
        <p>${escapeHtml(todayInsights.estimatedSets || 0)} planned sets · ${escapeHtml(todayInsights.format)}</p>
        ${muscleTargetMarkup(todayInsights.topMuscles)}
      </article>
      <article class="insight-card">
        <span>Next focus</span>
        <strong>${escapeHtml(nextWorkout.focus || "Not set")}</strong>
        <p>${escapeHtml(nextInsights.estimatedSets || 0)} planned sets waiting in the next session.</p>
        ${muscleTargetMarkup(nextInsights.topMuscles)}
      </article>
    </div>
  `;
}

function todayDate() {
  const now = new Date();
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60 * 1000));
  return localDate.toISOString().slice(0, 10);
}

function passwordResetRedirectUrl() {
  if (window.location.hostname === "benjaminbenz.com" || window.location.hostname === "www.benjaminbenz.com") {
    return `${window.location.origin}/client-invite.html`;
  }

  return `${window.location.origin}/client-invite.html`;
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

function progressMetricValue(entry, key) {
  if (["chest", "waist", "hips", "arm", "thigh"].includes(key)) {
    return progressMeasurements(entry)[key];
  }

  return entry?.[key];
}

function progressMetricDetails(key) {
  return {
    bodyweight: { label: "Bodyweight", suffix: " lb" },
    bodyfat: { label: "Body fat", suffix: "%" },
    muscle_mass: { label: "Muscle mass", suffix: " lb" },
    chest: { label: "Chest", suffix: " in" },
    waist: { label: "Waist", suffix: " in" },
    hips: { label: "Hips", suffix: " in" },
    arm: { label: "Arm", suffix: " in" },
    thigh: { label: "Thigh", suffix: " in" }
  }[key] || { label: "Progress", suffix: "" };
}

function progressMetricNumber(entry, key) {
  const raw = progressMetricValue(entry, key);

  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  const number = Number(raw);

  return Number.isFinite(number) ? number : null;
}

function pointsFor(entries, key, width, height, padding) {
  const values = entries
    .map((entry) => progressMetricNumber(entry, key))
    .filter((value) => value !== null);

  if (values.length === 0) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  return entries.map((entry, index) => {
    const value = progressMetricNumber(entry, key);
    const x = padding + (entries.length === 1 ? usableWidth : (index / (entries.length - 1)) * usableWidth);
    const y = value !== null
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

  const metric = progressMetricDetails(activeProgressMetric);
  const chartEntries = Array.isArray(entries)
    ? entries.filter((entry) => progressMetricNumber(entry, activeProgressMetric) !== null)
    : [];

  if (chartEntries.length === 0) {
    chart.innerHTML = `<p class="empty-state">${escapeHtml(metric.label)} will appear after it is added to a measurement entry.</p>`;
    return;
  }

  const width = 680;
  const height = 260;
  const padding = 34;
  const metricPoints = pointsFor(chartEntries, activeProgressMetric, width, height, padding);
  const values = chartEntries.map((entry) => progressMetricNumber(entry, activeProgressMetric));
  const latestValue = values[values.length - 1];

  chart.innerHTML = `
    <div class="progress-chart-summary"><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(latestValue)}${escapeHtml(metric.suffix)}</strong></div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(metric.label)} progress">
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" />
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" />
      <polyline class="progress-metric-line" points="${metricPoints}" />
      ${circlesFor(metricPoints, "progress-metric-dot")}
      ${chartEntries.map((entry, index) => {
        const x = padding + (chartEntries.length === 1 ? width - padding * 2 : (index / (chartEntries.length - 1)) * (width - padding * 2));
        return `<text x="${x}" y="${height - 8}" text-anchor="middle">${escapeHtml(entry.entry_date.slice(5))}</text>`;
      }).join("")}
    </svg>
  `;
}

function renderClientProgressHistory(entries) {
  const history = document.getElementById("client-progress-history");

  if (!history) {
    return;
  }

  if (!entries.length) {
    history.innerHTML = '<p class="empty-state">No measurements yet.</p>';
    return;
  }

  history.innerHTML = entries.slice().reverse().map((entry) => {
    const measurements = progressMeasurements(entry);
    const values = [
      ["Weight", entry.bodyweight, "lb"],
      ["Body fat", entry.bodyfat, "%"],
      ["Muscle", entry.muscle_mass, "lb"],
      ["Chest", measurements.chest, "in"],
      ["Waist", measurements.waist, "in"],
      ["Hips", measurements.hips, "in"],
      ["Arm", measurements.arm, "in"],
      ["Thigh", measurements.thigh, "in"]
    ].filter(([, value]) => value !== null && value !== undefined && value !== "");

    return `
      <button class="client-progress-history-row" type="button" data-client-progress-id="${escapeHtml(entry.id)}">
        <div><strong>${escapeHtml(entry.entry_date)}</strong>${entry.goal_note ? `<p>${escapeHtml(entry.goal_note)}</p>` : ""}</div>
        <div class="client-progress-history-values">${values.map(([label, value, unit]) => `<span><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}${escapeHtml(unit)}</strong></span>`).join("") || '<span class="empty-state">No values recorded.</span>'}</div>
      </button>
    `;
  }).join("");
}

function exerciseProgressNumber(value) {
  const number = Number(value) || 0;

  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function exerciseProgressRecords(logs = []) {
  const grouped = new Map();

  logs.forEach((log) => {
    const code = String(log.exercise_code || "").trim().toUpperCase();
    const name = String(log.exercise_name || "").trim();
    const normalizedName = name.toLowerCase();
    const date = String(log.entry_date || "");

    if (
      !date ||
      [warmupExerciseCode, cardioExerciseCode].includes(code) ||
      normalizedSetType(log.set_type, log.set_number) === warmUpSetType
    ) {
      return;
    }

    const weight = Number(log.weight_used) || 0;
    const reps = Number(log.reps) || 0;

    if (weight <= 0 && reps <= 0) {
      return;
    }

    const key = normalizedName || code.toLowerCase();
    if (!key) {
      return;
    }

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        code,
        name: name || code || "Exercise",
        dates: new Map()
      });
    }

    const exercise = grouped.get(key);
    if (!exercise.dates.has(date)) {
      exercise.dates.set(date, { date, maxWeight: 0, maxReps: 0 });
    }

    const point = exercise.dates.get(date);
    point.maxWeight = Math.max(point.maxWeight, weight);
    point.maxReps = Math.max(point.maxReps, reps);
  });

  return Array.from(grouped.values()).map((exercise) => {
    const points = Array.from(exercise.dates.values()).sort((left, right) => left.date.localeCompare(right.date));
    const tracksWeight = points.some((point) => point.maxWeight > 0);
    const comparablePoints = points.filter((point) => tracksWeight ? point.maxWeight > 0 : point.maxReps > 0);
    const started = comparablePoints[0];
    const current = comparablePoints[comparablePoints.length - 1];
    const valueKey = tracksWeight ? "maxWeight" : "maxReps";

    return {
      ...exercise,
      started,
      current,
      unit: tracksWeight ? "lb" : "reps",
      change: started && current ? current[valueKey] - started[valueKey] : 0,
      startingValue: started?.[valueKey] || 0,
      currentValue: current?.[valueKey] || 0
    };
  })
    .filter((exercise) => exercise.started && exercise.current)
    .sort((left, right) => right.current.date.localeCompare(left.current.date));
}

function renderClientExerciseProgress(logs = trainingLogs) {
  const container = document.getElementById("client-exercise-progress");

  if (!container) {
    return;
  }

  const records = exerciseProgressRecords(logs);

  if (records.length === 0) {
    container.innerHTML = '<p class="empty-state">Log the same exercise in another workout to see how far you’ve come.</p>';
    return;
  }

  container.innerHTML = records.map((record) => {
    const changePrefix = record.change > 0 ? "+" : "";
    const changeClass = record.change > 0 ? " is-positive" : record.change < 0 ? " is-negative" : "";

    return `
      <article class="progress-exercise-card">
        <div class="progress-exercise-card-heading">
          <div>
            ${record.code ? `<span>${escapeHtml(record.code)}</span>` : ""}
            <h4>${escapeHtml(record.name)}</h4>
          </div>
          <strong class="progress-exercise-change${changeClass}">${escapeHtml(changePrefix)}${escapeHtml(exerciseProgressNumber(record.change))} ${escapeHtml(record.unit)}</strong>
        </div>
        <div class="progress-exercise-comparison">
          <span>
            <small>Started</small>
            <strong>${escapeHtml(exerciseProgressNumber(record.startingValue))} ${escapeHtml(record.unit)}</strong>
            <em>${escapeHtml(formatLogDate(record.started.date))}</em>
          </span>
          <i aria-hidden="true">→</i>
          <span>
            <small>Now</small>
            <strong>${escapeHtml(exerciseProgressNumber(record.currentValue))} ${escapeHtml(record.unit)}</strong>
            <em>${escapeHtml(formatLogDate(record.current.date))}</em>
          </span>
        </div>
      </article>
    `;
  }).join("");
}

function renderProgress(entries) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  progressEntries = safeEntries;
  const latest = safeEntries[safeEntries.length - 1];
  const current = document.getElementById("progress-current");

  if (!current) {
    renderClientHomeSummary();
    return;
  }

  if (!latest) {
    setText("#progress-date", "");
    current.innerHTML = '<p class="empty-state">No progress check-ins yet.</p>';
    setText("#progress-goal", "");
    renderProgressGraph([]);
    renderClientProgressHistory([]);
    fillClientProgressForm();
    renderClientHomeSummary();
    return;
  }

  setText("#progress-date", latest.entry_date);
  fillClientProgressForm(latest);
  current.innerHTML = `
    <span><strong>Current bodyweight</strong> ${formatProgressValue(latest.bodyweight, " lb")}</span>
    <span><strong>Current bodyfat</strong> ${formatProgressValue(latest.bodyfat, "%")}</span>
    <span><strong>Muscle mass</strong> ${formatProgressValue(latest.muscle_mass, " lb")}</span>
    <span><strong>Waist</strong> ${formatProgressValue(progressMeasurements(latest).waist, " in")}</span>
  `;
  setText("#progress-goal", latest.goal_note ? `Updated goal: ${latest.goal_note}` : "");
  renderProgressGraph(safeEntries);
  renderClientProgressHistory(safeEntries);
  fillClientProgressForm(safeEntries.find((entry) => entry.entry_date === todayDate()) || {});
  renderClientHomeSummary();
}

function setClientProgressStatus(message) {
  setText("#client-progress-save-status", message);
}

function setClientProgressPhotoStatus(message) {
  setText("#client-progress-photo-status", message);
}

function configureClientProgressAccess() {
  const coachPreview = isCoachPortalEmail(activeDashboardUser?.email);
  const controls = document.querySelectorAll(
    "#client-checkin-form input, #client-checkin-form textarea, #client-save-progress-button, #client-progress-photo-date, #client-progress-photo-file, #client-progress-photo-note, #upload-client-progress-photo-button"
  );

  controls.forEach((control) => {
    control.disabled = coachPreview;
  });

  if (coachPreview) {
    setClientProgressStatus("Client measurements are read-only here. Use Coach Admin to make changes.");
    setClientProgressPhotoStatus("Client progress photos are read-only in Coach View.");
  }
}

async function signedProgressPhotoRecords(records) {
  if (!supabaseClient || !records.length) {
    return records;
  }

  const signedRecords = await Promise.all(records.map(async (record) => {
    const { data, error } = await supabaseClient.storage
      .from("progress-photos")
      .createSignedUrl(record.storage_path, 3600);

    return {
      ...record,
      signed_url: error ? "" : data?.signedUrl || data?.signed_url || ""
    };
  }));

  return signedRecords;
}

function renderClientProgressPhotos(records) {
  progressPhotos = Array.isArray(records) ? records : [];
  const gallery = document.getElementById("client-progress-photo-gallery");

  if (!gallery) {
    return;
  }

  if (!progressPhotos.length) {
    gallery.innerHTML = '<p class="empty-state">No progress photos yet.</p>';
    return;
  }

  const canDelete = !isCoachPortalEmail(activeDashboardUser?.email);
  gallery.innerHTML = progressPhotos.map((photo) => `
    <article class="progress-photo-card">
      ${photo.signed_url
        ? `<img src="${escapeHtml(photo.signed_url)}" alt="Private progress photo from ${escapeHtml(photo.captured_on)}" loading="lazy" />`
        : '<div class="progress-photo-unavailable">Photo unavailable</div>'}
      <div>
        <strong>${escapeHtml(photo.captured_on)}</strong>
        ${photo.note ? `<p>${escapeHtml(photo.note)}</p>` : ""}
        ${canDelete ? `<button type="button" class="progress-photo-delete" data-progress-photo-id="${escapeHtml(photo.id)}">Remove</button>` : ""}
      </div>
    </article>
  `).join("");
}

async function loadClientProgressPhotos(email = activeClientEmail) {
  if (!supabaseClient || !email) {
    renderClientProgressPhotos([]);
    return;
  }

  const { data, error } = await supabaseClient
    .from("client_progress_photos")
    .select("id, client_email, storage_path, captured_on, note, created_at")
    .ilike("client_email", email)
    .order("captured_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    renderClientProgressPhotos([]);
    setClientProgressPhotoStatus("Progress photos could not be loaded.");
    return;
  }

  renderClientProgressPhotos(await signedProgressPhotoRecords(data || []));
}

function handleClientProgressMetricTabs() {
  const tabs = document.getElementById("progress-metric-tabs");

  tabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-progress-metric]");

    if (!button) {
      return;
    }

    activeProgressMetric = button.dataset.progressMetric;
    tabs.querySelectorAll("[data-progress-metric]").forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", String(active));
    });
    renderProgressGraph(progressEntries);
  });
}

function handleClientProgressDateChange() {
  const dateInput = document.querySelector('[name="progress_date"]');

  dateInput?.addEventListener("change", () => {
    const entry = progressEntries.find((item) => item.entry_date === dateInput.value);
    fillClientProgressForm(entry || { entry_date: dateInput.value });
    setClientProgressStatus(entry ? "Loaded this measurement entry for editing." : "Ready for a new measurement entry.");
  });
}

async function progressPhotoJpeg(file) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Choose an image first.");
  }

  const imageUrl = URL.createObjectURL(file);

  try {
    const image = new Image();
    image.src = imageUrl;
    await image.decode();
    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));

    if (!blob) {
      throw new Error("This photo could not be prepared for upload.");
    }

    if (blob.size > 6 * 1024 * 1024) {
      throw new Error("This photo is still over 6 MB. Choose a smaller image.");
    }

    return blob;
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function handleClientProgressPhotoUpload() {
  const button = document.getElementById("upload-client-progress-photo-button");
  const fileInput = document.getElementById("client-progress-photo-file");
  const dateInput = document.getElementById("client-progress-photo-date");
  const noteInput = document.getElementById("client-progress-photo-note");

  if (dateInput) {
    dateInput.value = todayDate();
  }

  button?.addEventListener("click", async () => {
    const file = fileInput?.files?.[0];

    if (!supabaseClient || !activeDashboardUser || !activeClientEmail || isCoachPortalEmail(activeDashboardUser.email)) {
      return;
    }

    if (!file) {
      setClientProgressPhotoStatus("Choose a photo first.");
      return;
    }

    button.disabled = true;
    setClientProgressPhotoStatus("Preparing private photo...");
    let storagePath = "";

    try {
      const blob = await progressPhotoJpeg(file);
      const photoId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const capturedOn = dateInput?.value || todayDate();
      storagePath = `${activeDashboardUser.id}/${capturedOn}-${photoId}.jpg`;
      const { error: uploadError } = await supabaseClient.storage
        .from("progress-photos")
        .upload(storagePath, blob, { contentType: "image/jpeg", cacheControl: "3600", upsert: false });

      if (uploadError) {
        throw uploadError;
      }

      const { error: recordError } = await supabaseClient
        .from("client_progress_photos")
        .insert({
          client_email: activeClientEmail,
          storage_path: storagePath,
          captured_on: capturedOn,
          note: String(noteInput?.value || "").trim()
        });

      if (recordError) {
        await supabaseClient.storage.from("progress-photos").remove([storagePath]);
        throw recordError;
      }

      fileInput.value = "";
      noteInput.value = "";
      await loadClientProgressPhotos();
      setClientProgressPhotoStatus("Private photo uploaded. It is now available in the iOS app and Coach Admin.");
    } catch (error) {
      setClientProgressPhotoStatus(error?.message || "Photo upload failed.");
    } finally {
      button.disabled = false;
    }
  });
}

function handleClientProgressPhotoDelete() {
  document.getElementById("client-progress-photo-gallery")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-progress-photo-id]");

    if (!button || !supabaseClient || isCoachPortalEmail(activeDashboardUser?.email)) {
      return;
    }

    const photo = progressPhotos.find((item) => item.id === button.dataset.progressPhotoId);

    if (!photo || !window.confirm("Remove this private progress photo?")) {
      return;
    }

    button.disabled = true;
    setClientProgressPhotoStatus("Removing photo...");
    const { error: storageError } = await supabaseClient.storage.from("progress-photos").remove([photo.storage_path]);

    if (storageError) {
      setClientProgressPhotoStatus(storageError.message);
      button.disabled = false;
      return;
    }

    const { error: recordError } = await supabaseClient
      .from("client_progress_photos")
      .delete()
      .eq("id", photo.id);

    if (recordError) {
      setClientProgressPhotoStatus(recordError.message);
      button.disabled = false;
      return;
    }

    await loadClientProgressPhotos();
    setClientProgressPhotoStatus("Photo removed.");
  });
}

function setCountFromPrescription(prescription) {
  const match = String(prescription || "").match(/(\d+)\s*(?:sets?|x)/i);
  const count = match ? Number(match[1]) : 3;

  return Number.isFinite(count) && count > 0 ? Math.min(count, 8) : 3;
}

function repTargetsFromPrescription(prescription) {
  const text = String(prescription || "");
  const ladderMatch = text.match(/((?:\d+\s*,\s*)+\d+)\s*reps?/i);

  if (ladderMatch) {
    return ladderMatch[1].split(",").map((rep) => rep.trim()).filter(Boolean);
  }

  const match = text.match(/(\d+\s*-\s*\d+|\d+)\s*reps?/i);

  return match ? [match[1].replace(/\s/g, "")] : [];
}

function repsFromPrescription(prescription) {
  return repTargetsFromPrescription(prescription)[0] || "";
}

function normalizedSetType(value, setNumber = 0) {
  if (value === warmUpSetType) {
    return warmUpSetType;
  }
  if (value === workingSetType) {
    return workingSetType;
  }
  return Number(setNumber) > warmUpSetNumberBase ? warmUpSetType : workingSetType;
}

function warmUpOrdinal(setNumber) {
  const ordinal = Number(setNumber) - warmUpSetNumberBase;
  return ordinal > 0 ? ordinal : 1;
}

function setNumberLabel(setNumber, setType) {
  if (normalizedSetType(setType, setNumber) === warmUpSetType) {
    const ordinal = warmUpOrdinal(setNumber);
    return ordinal === 1 ? "W" : `W${ordinal}`;
  }

  return String(Number(setNumber) || 1);
}

function setTypeForRow(row) {
  return normalizedSetType(row?.dataset.setType, row?.dataset.setNumber);
}

function setRowMarkup(setNumber, repPlaceholder = "", setType = workingSetType, weightPlaceholder = "0") {
  const normalizedType = normalizedSetType(setType, setNumber);
  const ordinal = warmUpOrdinal(setNumber);
  const isWarmUp = normalizedType === warmUpSetType;
  const label = isWarmUp ? "" : String(Number(setNumber) || 1);
  const labelAria = isWarmUp ? `Warm-up set ${ordinal} label` : `Set label ${label}`;
  return `
    <div class="set-row${normalizedType === warmUpSetType ? " is-warm-up" : ""}" data-set-row data-set-number="${setNumber}" data-set-type="${normalizedType}">
      <label class="set-label-field">
        <em>Set</em>
        <input type="text" value="${label}" maxlength="3" inputmode="text" autocomplete="off" data-set-label aria-label="${labelAria}" />
      </label>
      <label class="set-input-field">
        <em>Weight</em>
        <input type="number" min="0" step="0.5" placeholder="${escapeHtml(weightPlaceholder)}" data-default-placeholder="${escapeHtml(weightPlaceholder)}" data-set-weight />
      </label>
      <label class="set-input-field">
        <em>Reps</em>
        <input type="number" min="0" step="1" placeholder="${escapeHtml(repPlaceholder)}" data-default-placeholder="${escapeHtml(repPlaceholder)}" data-set-reps />
      </label>
      <button class="set-rir-button" type="button" data-set-rir aria-label="Choose reps in reserve for ${normalizedType === warmUpSetType ? `warm-up set ${ordinal}` : `set ${Number(setNumber) || 1}`}">
        <span>RIR</span>
        <strong data-set-rir-value>—</strong>
      </button>
    </div>
  `;
}

function setRows(exercise) {
  const repTargets = repTargetsFromPrescription(exercise.prescription);

  return setRowMarkup(warmUpSetNumberBase + 1, repTargets[0] || "", warmUpSetType);
}

function exerciseDisplayName(code, name) {
  return code ? `${code} ${name}` : name;
}

function exerciseNameInputForLog(logElement) {
  return logElement?.querySelector("[data-exercise-name-input]") ||
    logElement?.closest(".workout-exercise-card")?.querySelector("[data-exercise-name-input]") ||
    null;
}

function syncExerciseNamePreview(logElement, nextName) {
  if (!logElement) {
    return;
  }

  const rawName = String(nextName || "");
  const editedName = rawName.trim();
  const safeName = editedName ||
    logElement.dataset.exerciseName ||
    (logElement.closest("[data-custom-exercise-card]") ? "Custom exercise" : "");
  const displayName = exerciseDisplayName(logElement.dataset.exerciseCode || "", safeName);
  const card = logElement.closest(".workout-exercise-card");
  const summaryTitle = card?.querySelector("[data-exercise-title]");
  const summaryTitleName = summaryTitle?.querySelector("[data-exercise-title-name]");
  const detailTitle = logElement.querySelector("[data-exercise-heading]");

  if (summaryTitleName) {
    if (summaryTitleName.value !== rawName) {
      summaryTitleName.value = rawName;
    }
  } else if (summaryTitle) {
    summaryTitle.textContent = displayName;
  }

  if (detailTitle) {
    detailTitle.textContent = displayName;
  }
}

function renderExerciseNotesState(logElement) {
  const notesInput = logElement?.querySelector("[data-log-notes]");
  const notesState = logElement?.querySelector("[data-exercise-notes-state]");
  const hasNotes = Boolean(String(notesInput?.value || "").trim());

  if (notesState) {
    notesState.textContent = hasNotes ? "Added" : "";
  }
}

function exerciseLogFields(exercise, workoutTitle, options = {}) {
  const setCount = Number(options.setCount) || setCountFromPrescription(exercise.prescription);
  const panelClass = options.panelClass || "exercise-detail";
  const showInlineHeader = Boolean(options.showInlineHeader);
  const finishButtonLabel = String(options.finishButtonLabel || "Set Finished");
  const addsSupersetExercise = options.finishButtonAction === "add-superset";
  const suggestionListAttr = options.suggestExerciseNames ? ' list="custom-exercise-suggestions"' : "";
  const notesContentId = `exercise-notes-${String(`${workoutTitle}-${exercise.code}`).toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
  const dateMarkup = options.showDate === false
    ? `<input type="hidden" value="${todayDate()}" data-log-date />`
    : '<label class="exercise-date"><span>Date</span><input type="date" data-log-date /></label>';

  return `
    <div class="${panelClass}"
      data-exercise-log
      data-workout-title="${escapeHtml(workoutTitle)}"
      data-exercise-code="${escapeHtml(exercise.code)}"
      data-exercise-name="${escapeHtml(exercise.name)}"
      data-prescribed-sets="${setCount}"
      data-set-target-mode="${options.userManagedSets ? "visible" : "prescribed"}"
    >
      ${showInlineHeader ? `
        <div class="superset-exercise-heading">
          <strong data-exercise-heading>${escapeHtml(exerciseDisplayName(exercise.code, exercise.name))}</strong>
          <em>${escapeHtml(exercise.prescription)}${exercise.rest ? ` · ${escapeHtml(exercise.rest)}` : ""}</em>
          <small data-set-progress>0 / ${setCount} sets completed</small>
        </div>
      ` : ""}
      ${options.showExerciseNameField === false ? "" : `
        <label class="exercise-name-field">
          <span>Exercise</span>
          <input type="text" value="${escapeHtml(exercise.name)}" placeholder="Type or search any exercise name"${suggestionListAttr} data-exercise-name-input />
          ${options.suggestExerciseNames ? '<small class="manual-exercise-hint">Choose a suggestion or type your own name or short description. Exact wording is not required.</small>' : ""}
        </label>
      `}
      ${options.showActions === false ? "" : exerciseLogActions({ showSkip: options.showSkipAction !== false })}
      ${options.showDemo === false ? "" : exerciseVideoMarkup(exercise)}
      ${dateMarkup}
      <div class="set-table" aria-label="${escapeHtml(exercise.name)} set tracker">
      <div class="set-header">
        <span>Set</span>
        <span>Weight</span>
        <span>Reps</span>
        <span>RIR</span>
      </div>
        <div data-set-rows>
          ${setRows(exercise)}
        </div>
        <div class="set-table-actions${addsSupersetExercise ? " has-add-superset-action" : ""}">
          <button class="add-set-button" type="button" data-add-set>+ Add Set</button>
          <button class="set-delete-last-button" type="button" data-delete-last-set>Delete Set</button>
          <button class="set-finished-button" type="button" data-finish-set${addsSupersetExercise ? " data-add-superset" : ""}>${escapeHtml(finishButtonLabel)}</button>
        </div>
      </div>
      <div class="exercise-notes exercise-notes-disclosure">
        <button class="exercise-notes-toggle" type="button" data-exercise-notes-toggle aria-expanded="false" aria-controls="${notesContentId}">
          <span>Notes</span>
          <small data-exercise-notes-state></small>
          <i data-exercise-notes-icon aria-hidden="true">+</i>
        </button>
        <label class="exercise-notes-content" id="${notesContentId}" hidden>
          <span class="sr-only">Exercise notes</span>
          <textarea aria-label="Exercise notes" placeholder="Any exercise modifications?" data-log-notes></textarea>
        </label>
      </div>
      <small data-log-status></small>
      <div class="previous-weights" data-previous-weights>Previous: none</div>
    </div>
  `;
}

function cardioLogFields(workoutTitle, options = {}) {
  const dateMarkup = options.showDate === false
    ? `<input type="hidden" value="${todayDate()}" data-log-date />`
    : '<label class="exercise-date"><span>Date</span><input type="date" data-log-date /></label>';

  return `
    <article class="workout-exercise-card workout-cardio-card workout-activity-card">
      <button class="exercise-card-summary" type="button" data-exercise-toggle>
        <span>
          <strong>Cardio log</strong>
          <em>Duration, distance, calories, and notes</em>
        </span>
        <i>›</i>
      </button>
      <div class="exercise-detail cardio-log-detail"
        data-exercise-log
        data-cardio-log
        data-workout-title="${escapeHtml(workoutTitle)}"
        data-exercise-code="${cardioExerciseCode}"
        data-exercise-name="Cardio"
        data-prescribed-sets="0"
      >
        <label class="exercise-name-field">
          <span>Cardio type</span>
          <input type="text" value="Cardio" placeholder="Walk, run, bike, stairs" data-exercise-name-input data-cardio-type />
        </label>
        ${dateMarkup}
        <div class="cardio-field-grid">
          <label>
            <span>Duration</span>
            <input type="number" min="0" step="1" placeholder="Minutes" data-cardio-duration />
          </label>
          <label>
            <span>Distance</span>
            <input type="number" min="0" step="0.01" placeholder="Miles" data-cardio-distance />
          </label>
          <label>
            <span>Calories</span>
            <input type="number" min="0" step="1" placeholder="Optional" data-cardio-calories />
          </label>
        </div>
        <label class="exercise-notes">
          <span>Notes</span>
          <textarea placeholder="Pace, incline, intensity, or how it felt." data-log-notes></textarea>
        </label>
        <small data-log-status></small>
        <div class="previous-weights" data-previous-weights>Previous: none</div>
      </div>
    </article>
  `;
}

function warmupLogFields(workoutTitle, options = {}) {
  const dateMarkup = options.showDate === false
    ? `<input type="hidden" value="${todayDate()}" data-log-date />`
    : '<label class="exercise-date"><span>Date</span><input type="date" data-log-date /></label>';

  return `
    <article class="workout-exercise-card workout-warmup-card workout-activity-card">
      <button class="exercise-card-summary" type="button" data-exercise-toggle>
        <span>
          <strong>Warm-up log</strong>
          <em>Mobility, treadmill, activation, and notes</em>
        </span>
        <i>›</i>
      </button>
      <div class="exercise-detail cardio-log-detail"
        data-exercise-log
        data-warmup-log
        data-workout-title="${escapeHtml(workoutTitle)}"
        data-exercise-code="${warmupExerciseCode}"
        data-exercise-name="Warm up"
        data-prescribed-sets="0"
      >
        <label class="exercise-name-field">
          <span>Warm-up type</span>
          <input type="text" value="Warm up" placeholder="Mobility, treadmill, activation" data-exercise-name-input data-warmup-type />
        </label>
        ${dateMarkup}
        <div class="cardio-field-grid warmup-field-grid">
          <label>
            <span>Duration</span>
            <input type="number" min="0" step="1" placeholder="Minutes" data-warmup-duration />
          </label>
        </div>
        <label class="exercise-notes">
          <span>Notes</span>
          <textarea placeholder="What did you warm up with?" data-log-notes></textarea>
        </label>
        <small data-log-status></small>
        <div class="previous-weights" data-previous-weights>Previous: none</div>
      </div>
    </article>
  `;
}

function workoutStartControlMarkup(workoutTitle) {
  return `
    <div class="workout-start-control">
      <button
        class="button button-dark workout-start-button"
        type="button"
        data-workout-start
        data-workout-title="${escapeHtml(workoutTitle)}"
      >Start workout</button>
    </div>
  `;
}

function exerciseCard(exercise, workoutTitle, isOpen = false, workoutFocus = "", options = {}) {
  const setCount = Number(exercise.clientSetCount) || setCountFromPrescription(exercise.prescription);
  const exerciseIndex = Number(options.exerciseIndex) || 0;
  const format = normalizeCustomWorkoutFormat(options.format || "single");
  const marker = options.marker || customWorkoutFormatMarker(format, exerciseIndex);
  const exerciseName = String(exercise.name || "").trim();
  const suggestionMenuId = `assigned-exercise-options-${String(exercise.code || exerciseIndex + 1).toLowerCase().replace(/[^a-z0-9-]/g, "-")}-${exerciseIndex + 1}`;
  const clientAdded = Boolean(exercise.clientAdded);

  return `
    <article class="workout-exercise-card workout-entry-card custom-workout-card assigned-workout-card${isOpen ? " is-open" : ""}" data-custom-exercise-card data-assigned-exercise-card${clientAdded ? " data-client-added-exercise" : ""}>
      <div class="exercise-card-summary custom-workout-card-summary">
        <span>
          <span class="custom-workout-card-marker-row">
            <span class="status-pill" data-assigned-workout-format-marker>${escapeHtml(marker)}</span>
            <button class="custom-workout-delete-icon" type="button" data-delete-exercise aria-label="Delete ${marker}">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" />
              </svg>
            </button>
          </span>
          <strong class="custom-workout-editable-title" data-exercise-title>
            <span class="custom-workout-name-editor">
              <input
                type="text"
                value="${escapeHtml(exerciseName)}"
                placeholder="Input exercise name here"
                aria-label="${escapeHtml(marker)} name"
                aria-autocomplete="list"
                aria-controls="${suggestionMenuId}"
                aria-expanded="false"
                autocomplete="off"
                data-exercise-title-name
                data-exercise-name-input
              />
              <span
                class="custom-workout-suggestion-menu"
                id="${suggestionMenuId}"
                role="listbox"
                data-custom-exercise-suggestions
                hidden
              ></span>
            </span>
          </strong>
          <small data-set-progress>0 / ${setCount} working sets completed</small>
        </span>
        <button class="custom-workout-card-toggle" type="button" data-exercise-toggle aria-label="Toggle ${marker}"><i>›</i></button>
      </div>
      <div class="exercise-detail custom-workout-detail">
        ${exerciseLogFields(exercise, workoutTitle, {
          panelClass: "assigned-exercise-log",
          workoutFocus,
          showDate: false,
          showExerciseNameField: false,
          showActions: false,
          suggestExerciseNames: true,
          setCount,
          userManagedSets: clientAdded
        })}
      </div>
    </article>
  `;
}

function exerciseCardRows(exercises, workoutTitle, openMode = "first", workoutFocus = "", options = {}) {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return '<p class="empty-state">Workout details will appear here when your coach adds them.</p>';
  }

  return exercises.map((exercise, index) => {
    const isOpen = openMode === "all" || (openMode === "first" && index === 0);
    const exerciseIndex = (Number(options.startIndex) || 0) + index;

    return exerciseCard(exercise, workoutTitle, isOpen, workoutFocus, {
      exerciseIndex,
      format: options.format || "single"
    });
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
  if (format === "custom") {
    return "Custom workout";
  }

  if (format === "superset") {
    return "Superset";
  }

  if (format === "circuit") {
    return "Circuit training";
  }

  return "Single exercises";
}

function groupRoundCount(exercises = []) {
  return exercises.reduce((max, exercise) => Math.max(max, setCountFromPrescription(exercise.prescription)), 0) || 3;
}

function groupTypeLabel(type) {
  if (type === "circuit") {
    return "Circuit";
  }

  if (type === "superset") {
    return "Superset";
  }

  return "Single";
}

function groupDisplayCode(exercise, group, index) {
  return String(exercise.code || "").trim() || (group.exercises.length > 1 ? `${group.key}${index + 1}` : group.key);
}

function compactGroupKeyLabel(group) {
  const key = String(group?.key || "").trim();
  return key.replace(/^Group\s+/i, "") || "1";
}

function groupDisplayTitle(group, type) {
  if (type === "circuit") {
    return "Circuit";
  }

  if (type === "superset") {
    return `Superset ${compactGroupKeyLabel(group)}`;
  }

  return `Straight Set ${compactGroupKeyLabel(group)}`;
}

function groupInstruction(group, type) {
  const rounds = groupRoundCount(group.exercises);

  if (type === "circuit") {
    return `Move through each exercise in order. Repeat for ${rounds} rounds.`;
  }

  if (type === "superset") {
    const sequence = group.exercises
      .map((exercise, index) => groupDisplayCode(exercise, group, index))
      .join(", then ");

    return `Do ${sequence}. Repeat for ${rounds} rounds.`;
  }

  return "Finish all sets before moving on.";
}

function groupRestCue(group, type) {
  if (type === "single") {
    return "";
  }

  const lastExercise = group.exercises[group.exercises.length - 1];
  const lastCode = groupDisplayCode(lastExercise || {}, group, Math.max(group.exercises.length - 1, 0));
  const rest = group.exercises.map((exercise) => String(exercise.rest || "").trim()).filter(Boolean).pop();

  if (rest) {
    return `${rest.replace(/\.$/, "")} after ${lastCode}, then start the next round.`;
  }

  return `Rest after ${lastCode}, then start the next round.`;
}

function compactWorkoutGroupOverview(group, type) {
  const cue = groupRestCue(group, type);

  return `
    <span class="compact-workout-group-card">
      <span class="compact-workout-group-copy">
        <strong>${escapeHtml(groupDisplayTitle(group, type))}</strong>
        <span>${escapeHtml(groupInstruction(group, type))}</span>
      </span>
      <span class="compact-workout-group-type">${escapeHtml(groupTypeLabel(type))}</span>
      <span class="compact-workout-exercise-list">
        ${group.exercises.map((exercise, index) => `
          <span class="compact-workout-exercise-row">
            <span class="compact-workout-exercise-code">${escapeHtml(groupDisplayCode(exercise, group, index))}</span>
            <span class="compact-workout-exercise-copy">
              <strong>${escapeHtml(exercise.name || "Exercise")}</strong>
              <em>${escapeHtml(exercise.prescription || "Custom sets")}</em>
            </span>
          </span>
        `).join("")}
      </span>
      ${cue ? `<span class="compact-workout-group-cue">${escapeHtml(cue)}</span>` : ""}
    </span>
  `;
}

function isCustomWorkoutTitle(value) {
  return String(value || "").trim().toLowerCase() === customWorkoutTitle;
}

function normalizeCustomWorkoutFormat(value) {
  return Object.hasOwn(customWorkoutFormats, value) ? value : "single";
}

function customWorkoutFormatPreferenceKey() {
  const programId = String(currentProgram?.id || "").trim();

  return programId ? `fwb_custom_workout_format:${programId}` : "";
}

function storedCustomWorkoutFormat() {
  const key = customWorkoutFormatPreferenceKey();

  if (!key) {
    return "single";
  }

  try {
    return normalizeCustomWorkoutFormat(window.localStorage.getItem(key));
  } catch (_) {
    return "single";
  }
}

function storeCustomWorkoutFormat(format) {
  const key = customWorkoutFormatPreferenceKey();

  if (!key) {
    return;
  }

  try {
    window.localStorage.setItem(key, normalizeCustomWorkoutFormat(format));
  } catch (_) {
    // The selected format still applies for this page when storage is unavailable.
  }
}

function customWorkoutFormatMarker(format, index) {
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

function customWorkoutFormatPickerMarkup() {
  const format = normalizeCustomWorkoutFormat(activeCustomWorkoutFormat);
  const config = customWorkoutFormats[format];

  return `
    <section class="custom-workout-format-picker" aria-labelledby="custom-workout-format-title">
      <div class="custom-workout-format-heading">
        <strong id="custom-workout-format-title">Choose a format</strong>
        <span>Applies to this custom workout</span>
      </div>
      <div class="custom-workout-format-options" role="group" aria-label="Custom workout format">
        ${Object.entries(customWorkoutFormats).map(([value, option]) => `
          <button
            class="custom-workout-format-button${value === format ? " is-active" : ""}"
            type="button"
            data-custom-workout-format-option="${value}"
            aria-pressed="${value === format ? "true" : "false"}"
          >${escapeHtml(option.label)}</button>
        `).join("")}
      </div>
      <p data-custom-workout-format-guide>${escapeHtml(config.guide)}</p>
    </section>
  `;
}

function customExerciseCode(index = 0) {
  return `CW${String(index + 1).padStart(2, "0")}`;
}

function customWorkoutDraftKey() {
  const programId = String(currentProgram?.id || "").trim();
  const clientEmail = String(currentProgram?.client_email || activeClientEmail || "").trim().toLowerCase();

  if (!programId && !clientEmail) {
    return "";
  }

  return `fwb_custom_workout_draft:${clientEmail || "client"}:${programId || "program"}`;
}

function readCustomWorkoutDraft() {
  const key = customWorkoutDraftKey();

  if (!key) {
    return null;
  }

  try {
    const draft = JSON.parse(window.localStorage.getItem(key) || "null");
    return draft && typeof draft === "object" ? draft : null;
  } catch (_) {
    return null;
  }
}

function storeCustomWorkoutDraft(draft) {
  const key = customWorkoutDraftKey();

  if (!key) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      ...draft
    }));
  } catch (_) {
    // Draft persistence is best-effort only.
  }
}

function clearCustomWorkoutDraft() {
  const key = customWorkoutDraftKey();

  if (!key) {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch (_) {
    // Draft persistence is best-effort only.
  }
}

function activeCustomWorkoutDraft() {
  const draft = readCustomWorkoutDraft();
  const updatedAt = new Date(draft?.updatedAt || "");

  if (!draft || Number.isNaN(updatedAt.getTime())) {
    if (draft) {
      clearCustomWorkoutDraft();
    }
    return null;
  }

  const localUpdatedAt = new Date(updatedAt.getTime() - (updatedAt.getTimezoneOffset() * 60 * 1000))
    .toISOString()
    .slice(0, 10);

  if (localUpdatedAt !== todayDate()) {
    clearCustomWorkoutDraft();
    return null;
  }

  return draft;
}

function customWorkoutDraftExercises() {
  const exercises = activeCustomWorkoutDraft()?.exercises;
  return Array.isArray(exercises) ? exercises : [];
}

function customWorkoutExercises() {
  const grouped = new Map();

  customWorkoutDraftExercises().forEach((draftExercise, index) => {
    const code = String(draftExercise?.code || customExerciseCode(index)).trim().toUpperCase();
    const exerciseName = String(draftExercise?.name || "").trim();

    if (!grouped.has(code)) {
      grouped.set(code, {
        code,
        name: exerciseName,
        group: Math.max(Number(draftExercise?.group) || 0, 0),
        prescription: "Custom sets",
        rest: ""
      });
      return;
    }

    if (exerciseName) {
      grouped.get(code).name = exerciseName;
    }
  });

  const exercises = Array.from(grouped.values()).sort((left, right) => left.code.localeCompare(right.code, undefined, { numeric: true }));

  return exercises.length > 0
    ? exercises
    : [{
      code: customExerciseCode(0),
      name: "",
      group: 0,
      prescription: "Custom sets",
      rest: ""
    }];
}

function serializeSetRowDraft(row) {
  return {
    label: row.querySelector("[data-set-label]")?.value || "",
    weight: row.querySelector("[data-set-weight]")?.value || "",
    reps: row.querySelector("[data-set-reps]")?.value || "",
    setType: setTypeForRow(row),
    rir: row.dataset.repsInReserve || ""
  };
}

function serializeCustomExerciseDraft(logElement, index) {
  if (
    !logElement ||
    logElement.dataset.cardioLog !== undefined ||
    logElement.dataset.warmupLog !== undefined
  ) {
    return null;
  }

  const code = String(logElement.dataset.exerciseCode || customExerciseCode(index)).trim().toUpperCase();

  return {
    code,
    name: exerciseNameInputForLog(logElement)?.value || logElement.dataset.exerciseName || "",
    group: Math.max(Number(logElement.closest("[data-custom-exercise-card]")?.dataset.customWorkoutGroup) || 0, 0),
    date: logElement.querySelector("[data-log-date]")?.value || "",
    notes: logElement.querySelector("[data-log-notes]")?.value || "",
    skipped: logElement.dataset.exerciseSkipped === "true",
    sets: Array.from(logElement.querySelectorAll("[data-set-row]")).map(serializeSetRowDraft)
  };
}

function customWorkoutPanelDraft(panel) {
  const logElements = Array.from(panel?.querySelectorAll("[data-exercise-log]") || []);

  return {
    format: normalizeCustomWorkoutFormat(panel?.dataset.customWorkoutFormat || activeCustomWorkoutFormat),
    date: panel?.querySelector("[data-workout-date]")?.value || todayDate(),
    exercises: logElements
      .map((logElement, index) => serializeCustomExerciseDraft(logElement, index))
      .filter(Boolean)
  };
}

function persistCustomWorkoutDraftFromPanel(panel) {
  if (!panel || !panel.classList.contains("client-workout-panel-custom")) {
    return;
  }

  storeCustomWorkoutDraft(customWorkoutPanelDraft(panel));
}

function persistCustomWorkoutDraftForElement(element) {
  const panel = element?.closest?.(".client-workout-panel-custom");
  persistCustomWorkoutDraftFromPanel(panel);
}

function applyCustomSetDraft(row, draftSet) {
  const labelInput = row.querySelector("[data-set-label]");
  const weightInput = row.querySelector("[data-set-weight]");
  const repsInput = row.querySelector("[data-set-reps]");
  const setType = normalizedSetType(draftSet?.setType, row.dataset.setNumber);

  row.dataset.setType = setType;
  if (labelInput && setType === warmUpSetType) {
    labelInput.value = "";
  } else if (labelInput && draftSet?.label) {
    labelInput.value = draftSet.label;
  }

  if (weightInput) {
    weightInput.value = draftSet?.weight || "";
  }

  if (repsInput) {
    repsInput.value = draftSet?.reps || "";
  }

  if (draftSet?.rir !== undefined && draftSet?.rir !== "") {
    row.dataset.repsInReserve = String(draftSet.rir);
  } else {
    delete row.dataset.repsInReserve;
  }
  renderSetRirValue(row);
}

function applyCustomExerciseDraft(logElement, exerciseDraft) {
  if (!logElement || !exerciseDraft) {
    return;
  }

  const rows = logElement.querySelector("[data-set-rows]");
  const savedDraftSets = Array.isArray(exerciseDraft.sets) ? exerciseDraft.sets : [];
  const hasWarmUpDraft = savedDraftSets.some((set, index) => (
    normalizedSetType(set?.setType, index + 1) === warmUpSetType ||
    String(set?.label || "").trim().toUpperCase().startsWith("W")
  ));
  const draftSets = hasWarmUpDraft
    ? savedDraftSets
    : [{ label: "W", weight: "", reps: "", setType: warmUpSetType, rir: "" }, ...savedDraftSets];
  const targetRows = Math.max(draftSets.length, 1);
  const nameInput = exerciseNameInputForLog(logElement);
  const dateInput = logElement.querySelector("[data-log-date]");
  const notesInput = logElement.querySelector("[data-log-notes]");

  ensureSetRows(logElement, targetRows);

  if (rows) {
    Array.from(rows.querySelectorAll("[data-set-row]")).forEach((row, index) => {
      if (index >= targetRows) {
        row.remove();
      }
    });
    renumberSetRows(logElement);
    Array.from(rows.querySelectorAll("[data-set-row]")).forEach((row, index) => {
      applyCustomSetDraft(row, draftSets[index]);
    });
    renumberSetRows(logElement);
  }

  if (nameInput) {
    nameInput.value = exerciseDraft.name || "";
  }

  if (dateInput && exerciseDraft.date) {
    dateInput.value = exerciseDraft.date;
  }

  if (notesInput) {
    notesInput.value = exerciseDraft.notes || "";
  }

  const customCard = logElement.closest("[data-custom-exercise-card]");
  if (customCard) {
    customCard.dataset.customWorkoutGroup = String(Math.max(Number(exerciseDraft.group) || 0, 0));
  }

  renderExerciseNotesState(logElement);
  syncExerciseNamePreview(logElement, exerciseDraft.name || "");
  setExerciseSkipped(logElement, false, { skipDraft: true });
  syncVisibleSetTarget(logElement);
  updateVisibleSetProgress(logElement);
  renderPreviousExerciseWeights(logElement);
}

function applyCustomWorkoutDraft(panel) {
  const draft = activeCustomWorkoutDraft();
  const exercises = Array.isArray(draft?.exercises) ? draft.exercises : [];

  if (!panel || !draft) {
    return;
  }

  if (draft.format) {
    updateCustomWorkoutFormat(panel, draft.format, { skipDraft: true });
  }

  const draftsByCode = new Map(exercises.map((exercise) => [
    String(exercise?.code || "").trim().toUpperCase(),
    exercise
  ]));

  panel.querySelectorAll("[data-exercise-log]").forEach((logElement) => {
    const code = String(logElement.dataset.exerciseCode || "").trim().toUpperCase();
    applyCustomExerciseDraft(logElement, draftsByCode.get(code));
  });

  syncWorkoutPanelDate(panel, draft.date || exercises[0]?.date || todayDate(), false);
  syncCustomWorkoutFormatMarkers(panel);
  syncCustomWorkoutCarousel(panel, { scrollToActive: true, instant: true });
}

function restoreCustomWorkoutDrafts() {
  document.querySelectorAll(".client-workout-panel-custom").forEach(applyCustomWorkoutDraft);
}

function exerciseSuggestionNames() {
  const suggestions = new Map();
  const addSuggestion = (value) => {
    const name = String(value || "").trim();
    const key = name.toLowerCase();

    if (name && !suggestions.has(key)) {
      suggestions.set(key, name);
    }
  };

  exerciseLibraryEntries.forEach((exercise) => {
    addSuggestion(exercise.name);
    (exercise.aliases || []).forEach(addSuggestion);
  });

  const workouts = Array.isArray(currentProgram?.workouts) ? currentProgram.workouts : [];
  workouts.forEach((workout) => {
    (Array.isArray(workout.exercises) ? workout.exercises : []).forEach((exercise) => {
      addSuggestion(exercise.name);
    });
  });

  trainingLogs.forEach((log) => {
    const code = String(log.exercise_code || "").trim().toUpperCase();

    if (code === warmupExerciseCode || code === cardioExerciseCode) {
      return;
    }

    addSuggestion(log.exercise_name);
  });

  return Array.from(suggestions.values()).sort((left, right) => left.localeCompare(right));
}

function customExerciseSuggestionMatches(value) {
  const query = String(value || "").trim().toLowerCase();

  return exerciseSuggestionNames()
    .filter((name) => !query || name.toLowerCase().includes(query))
    .sort((left, right) => {
      const leftStartsWithQuery = query && left.toLowerCase().startsWith(query);
      const rightStartsWithQuery = query && right.toLowerCase().startsWith(query);

      if (leftStartsWithQuery !== rightStartsWithQuery) {
        return leftStartsWithQuery ? -1 : 1;
      }

      return left.localeCompare(right);
    })
    .slice(0, 12);
}

function closeCustomExerciseSuggestions(exceptEditor = null) {
  document.querySelectorAll("[data-custom-exercise-suggestions]").forEach((menu) => {
    const editor = menu.closest(".custom-workout-name-editor");

    if (exceptEditor && editor === exceptEditor) {
      return;
    }

    menu.hidden = true;
    editor?.closest("[data-custom-exercise-card]")?.classList.remove("is-showing-suggestions");
    editor?.querySelector("[data-exercise-title-name]")?.setAttribute("aria-expanded", "false");
  });
}

function renderCustomExerciseSuggestions(input) {
  const editor = input?.closest(".custom-workout-name-editor");
  const menu = editor?.querySelector("[data-custom-exercise-suggestions]");

  if (!editor || !menu) {
    return;
  }

  const matches = customExerciseSuggestionMatches(input.value);

  menu.innerHTML = matches.map((name) => `
    <button
      type="button"
      role="option"
      data-custom-exercise-suggestion="${escapeHtml(name)}"
    >${escapeHtml(name)}</button>
  `).join("");
  menu.hidden = matches.length === 0;
  input.setAttribute("aria-expanded", matches.length > 0 ? "true" : "false");
  editor.closest("[data-custom-exercise-card]")?.classList.toggle("is-showing-suggestions", matches.length > 0);
  closeCustomExerciseSuggestions(editor);
}

function refreshExerciseSuggestionsDatalist() {
  const options = exerciseSuggestionNames()
    .map((name) => `<option value="${escapeHtml(name)}"></option>`)
    .join("");

  document.querySelectorAll("#custom-exercise-suggestions").forEach((datalist) => {
    datalist.innerHTML = options;
  });
}

function exerciseSuggestionsDatalist() {
  return `
    <datalist id="custom-exercise-suggestions">
      ${exerciseSuggestionNames().map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}
    </datalist>
  `;
}

function nextCustomExerciseCode(container) {
  const codes = Array.from(container?.querySelectorAll("[data-exercise-log]") || [])
    .map((element) => String(element.dataset.exerciseCode || "").match(/\d+/)?.[0])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const nextNumber = codes.length > 0 ? Math.max(...codes) + 1 : 1;

  return customExerciseCode(nextNumber - 1);
}

function nextAssignedExerciseCode(container) {
  const codes = Array.from(container?.querySelectorAll("[data-assigned-exercise-card] [data-exercise-log]") || [])
    .map((element) => String(element.dataset.exerciseCode || "").match(/^ADD(\d+)$/i)?.[1])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const nextNumber = codes.length > 0 ? Math.max(...codes) + 1 : 1;

  return `ADD${String(nextNumber).padStart(2, "0")}`;
}

function syncAssignedWorkoutMarkers(panel) {
  const format = normalizeCustomWorkoutFormat(panel?.dataset.assignedWorkoutFormat || "single");

  panel?.querySelectorAll("[data-assigned-exercise-card]").forEach((card, index) => {
    const markerLabel = customWorkoutFormatMarker(format, index);
    const marker = card.querySelector("[data-assigned-workout-format-marker]");

    if (marker) {
      marker.textContent = markerLabel;
    }

    card.querySelector("[data-exercise-title-name]")?.setAttribute("aria-label", `${markerLabel} name`);
    card.querySelector("[data-exercise-toggle]")?.setAttribute("aria-label", `Toggle ${markerLabel}`);
    card.querySelector("[data-delete-exercise]")?.setAttribute("aria-label", `Delete ${markerLabel}`);
  });
}

function skipControl() {
  return `
    <label class="skip-toggle">
      <input type="checkbox" data-skip-card />
      <span>Skip</span>
    </label>
  `;
}

function exerciseLogActions(options = {}) {
  const showSkip = options.showSkip !== false;

  return `
    <div class="exercise-log-actions${showSkip ? "" : " exercise-log-actions-single"}">
      ${showSkip ? '<button class="exercise-skip-button" type="button" data-skip-exercise aria-pressed="false">Skip</button>' : ""}
      <button class="exercise-delete-button" type="button" data-delete-exercise>Delete</button>
    </div>
  `;
}

function restTimerTimeLabel(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function restTimerMarkup() {
  return `
    <div class="rest-timer-overlay" data-rest-timer-overlay hidden>
      <section class="rest-timer-sheet" role="dialog" aria-modal="true" aria-labelledby="rest-timer-title">
        <header class="rest-timer-heading">
          <div>
            <small>Between sets</small>
            <strong id="rest-timer-title">Rest timer</strong>
          </div>
          <button class="rest-timer-close" type="button" data-rest-timer-close aria-label="Close timer">×</button>
        </header>
        <output class="rest-timer-display" data-rest-timer-display aria-live="polite">01:00</output>
        <p class="rest-timer-status" data-rest-timer-status>Ready</p>
        <div class="rest-timer-presets" role="group" aria-label="Timer duration">
          ${[30, 60, 90].map((seconds) => `
            <button type="button" data-rest-timer-preset="${seconds}" aria-pressed="${seconds === 60 ? "true" : "false"}">${seconds} sec</button>
          `).join("")}
        </div>
        <div class="rest-timer-actions">
          <button class="rest-timer-start" type="button" data-rest-timer-start>Start</button>
          <button class="rest-timer-reset" type="button" data-rest-timer-reset>Reset</button>
        </div>
      </section>
    </div>
  `;
}

function ensureRestTimer() {
  let overlay = document.querySelector("[data-rest-timer-overlay]");

  if (!overlay) {
    document.body.insertAdjacentHTML("beforeend", restTimerMarkup());
    overlay = document.querySelector("[data-rest-timer-overlay]");
  }

  return overlay;
}

function clearRestTimerInterval() {
  if (restTimerIntervalId) {
    window.clearInterval(restTimerIntervalId);
    restTimerIntervalId = null;
  }
}

function syncRestTimerRemaining() {
  if (!restTimerEndsAt) {
    return;
  }

  restTimerRemainingSeconds = Math.max(0, Math.ceil((restTimerEndsAt - Date.now()) / 1000));

  if (restTimerRemainingSeconds === 0) {
    restTimerEndsAt = 0;
    clearRestTimerInterval();

    if (typeof navigator.vibrate === "function") {
      navigator.vibrate([200, 100, 200]);
    }
  }
}

function renderRestTimer() {
  const overlay = ensureRestTimer();
  const display = overlay?.querySelector("[data-rest-timer-display]");
  const status = overlay?.querySelector("[data-rest-timer-status]");
  const startButton = overlay?.querySelector("[data-rest-timer-start]");

  syncRestTimerRemaining();
  const isRunning = restTimerEndsAt > 0;

  if (display) {
    display.textContent = restTimerTimeLabel(restTimerRemainingSeconds);
  }
  if (status) {
    status.textContent = isRunning ? "Running" : restTimerRemainingSeconds === 0 ? "Time's up" : "Ready";
  }
  if (startButton) {
    startButton.textContent = isRunning ? "Pause" : restTimerRemainingSeconds === 0 ? "Start again" : "Start";
  }
  overlay?.querySelectorAll("[data-rest-timer-preset]").forEach((button) => {
    const isActive = Number(button.dataset.restTimerPreset) === restTimerDurationSeconds;

    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

}

function tickRestTimer() {
  syncRestTimerRemaining();
  renderRestTimer();
}

function startOrPauseRestTimer() {
  if (restTimerEndsAt) {
    syncRestTimerRemaining();
    restTimerEndsAt = 0;
    clearRestTimerInterval();
    renderRestTimer();
    return;
  }

  if (restTimerRemainingSeconds === 0) {
    restTimerRemainingSeconds = restTimerDurationSeconds;
  }

  restTimerEndsAt = Date.now() + restTimerRemainingSeconds * 1000;
  clearRestTimerInterval();
  restTimerIntervalId = window.setInterval(tickRestTimer, 250);
  renderRestTimer();
}

function resetRestTimer() {
  restTimerEndsAt = 0;
  restTimerRemainingSeconds = restTimerDurationSeconds;
  clearRestTimerInterval();
  renderRestTimer();
}

function setRestTimerDuration(seconds) {
  restTimerDurationSeconds = Math.max(1, Math.round(Number(seconds) || 60));
  resetRestTimer();
}

function openRestTimer(button) {
  const overlay = ensureRestTimer();

  restTimerReturnFocus = button || null;
  overlay.hidden = false;
  document.body.classList.add("rest-timer-open");
  renderRestTimer();
  overlay.querySelector("[data-rest-timer-start]")?.focus();
}

function closeRestTimer() {
  const overlay = document.querySelector("[data-rest-timer-overlay]");

  if (!overlay) {
    return;
  }

  overlay.hidden = true;
  document.body.classList.remove("rest-timer-open");
  restTimerReturnFocus?.focus();
  restTimerReturnFocus = null;
}

function renderSetRirValue(setRow) {
  const button = setRow?.querySelector("[data-set-rir]");
  const value = button?.querySelector("[data-set-rir-value]");
  const rawValue = String(setRow?.dataset.repsInReserve || "").trim();

  if (value) {
    value.textContent = rawValue === "4" ? "4+" : rawValue || "—";
  }
  button?.classList.toggle("has-value", rawValue !== "");
}

function rirDialogMarkup() {
  const options = [
    [0, "None"],
    [1, "One more"],
    [2, "Two more"],
    [3, "Three more"],
    [4, "Four or more"]
  ];

  return `
    <div class="rir-overlay" data-rir-overlay hidden>
      <section class="rir-sheet" role="dialog" aria-modal="true" aria-labelledby="rir-dialog-title">
        <header class="rir-heading">
          <div>
            <small>Set effort</small>
            <strong id="rir-dialog-title">How many more reps?</strong>
          </div>
          <button class="rir-close" type="button" data-rir-close aria-label="Close RIR choices">×</button>
        </header>
        <p class="rir-question">If you kept going, how many more good-form reps could you have completed?</p>
        <div class="rir-options" role="radiogroup" aria-label="Reps in reserve">
          ${options.map(([value, label]) => `
            <button type="button" role="radio" data-rir-option="${value}" aria-checked="false">
              <strong>${value}${value === 4 ? "+" : ""}</strong>
              <span>${label}</span>
            </button>
          `).join("")}
        </div>
        <aside class="rir-explanation">
          <strong>RIR means reps in reserve</strong>
          <span>It estimates how many additional reps you could have completed with good form.</span>
        </aside>
        <button class="rir-save" type="button" data-rir-save disabled>Save RIR</button>
      </section>
    </div>
  `;
}

function ensureRirDialog() {
  let overlay = document.querySelector("[data-rir-overlay]");

  if (!overlay) {
    document.body.insertAdjacentHTML("beforeend", rirDialogMarkup());
    overlay = document.querySelector("[data-rir-overlay]");
  }

  return overlay;
}

function renderRirDialog() {
  const overlay = ensureRirDialog();

  overlay?.querySelectorAll("[data-rir-option]").forEach((button) => {
    const isSelected = Number(button.dataset.rirOption) === pendingRirValue;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-checked", isSelected ? "true" : "false");
  });

  const saveButton = overlay?.querySelector("[data-rir-save]");
  if (saveButton) {
    saveButton.disabled = pendingRirValue === null;
  }
}

function openRirDialog(button) {
  const overlay = ensureRirDialog();
  const setRow = button?.closest("[data-set-row]");
  const currentValue = String(setRow?.dataset.repsInReserve || "").trim();

  activeRirButton = button || null;
  pendingRirValue = currentValue === "" ? null : Number(currentValue);
  overlay.hidden = false;
  document.body.classList.add("rir-open");
  renderRirDialog();
  overlay.querySelector("[data-rir-option]")?.focus();
}

function closeRirDialog() {
  const overlay = document.querySelector("[data-rir-overlay]");

  if (!overlay) {
    return;
  }

  overlay.hidden = true;
  document.body.classList.remove("rir-open");
  activeRirButton?.focus();
  activeRirButton = null;
  pendingRirValue = null;
}

function saveRirSelection() {
  const setRow = activeRirButton?.closest("[data-set-row]");
  const logElement = activeRirButton?.closest("[data-exercise-log]");

  if (!setRow || pendingRirValue === null) {
    return;
  }

  setRow.dataset.repsInReserve = String(pendingRirValue);
  renderSetRirValue(setRow);
  persistCustomWorkoutDraftForElement(logElement);
  scheduleTrainingLogAutosave(logElement);
  closeRirDialog();
}

function workoutDifficultyOptions() {
  return [
    [1, "Very easy"],
    [2, "Easy"],
    [3, "Moderate"],
    [4, "Hard"],
    [5, "Very hard"]
  ];
}

function randomWorkoutCompletionMessage() {
  if (workoutCompletionMessages.length === 0) {
    return "Congratulations for completing the workout!";
  }

  let index = Math.floor(Math.random() * workoutCompletionMessages.length);

  if (workoutCompletionMessages.length > 1 && index === lastWorkoutCompletionMessageIndex) {
    index = (index + 1) % workoutCompletionMessages.length;
  }

  lastWorkoutCompletionMessageIndex = index;
  return workoutCompletionMessages[index];
}

function workoutDifficultyLabel(value) {
  const difficulty = Number(value);

  return workoutDifficultyOptions().find(([option]) => option === difficulty)?.[1] || "";
}

function workoutHistoryDifficultyLabel(value) {
  const difficulty = Number(value);
  const label = workoutDifficultyLabel(difficulty);

  return label ? `Difficulty ${difficulty}/5 (${label})` : "";
}

function workoutFeedbackSessionId(record) {
  return String(record?.session_id || record?.workout_session_id || "").trim().toLowerCase();
}

function workoutDifficultyForLog(log) {
  const sessionId = workoutFeedbackSessionId(log);

  if (!sessionId) {
    return null;
  }

  const feedback = workoutSessionFeedback.find((entry) => workoutFeedbackSessionId(entry) === sessionId);
  const rating = Number(feedback?.difficulty_rating);

  return workoutDifficultyLabel(rating) ? rating : null;
}

function upsertLocalWorkoutSessionFeedback(feedback) {
  const sessionId = workoutFeedbackSessionId(feedback);

  if (!sessionId) {
    return;
  }

  const index = workoutSessionFeedback.findIndex((entry) => workoutFeedbackSessionId(entry) === sessionId);

  if (index >= 0) {
    workoutSessionFeedback[index] = { ...workoutSessionFeedback[index], ...feedback };
  } else {
    workoutSessionFeedback.push(feedback);
  }
}

async function saveWorkoutDifficultyFeedback(rows, difficultyRating) {
  const workoutRow = (rows || []).find((row) => workoutFeedbackSessionId(row));
  const sessionId = workoutFeedbackSessionId(workoutRow);
  const rating = Number(difficultyRating);

  if (!supabaseClient || !workoutRow || !sessionId || !workoutDifficultyLabel(rating)) {
    return { saved: false };
  }

  const now = new Date().toISOString();
  const payload = {
    session_id: sessionId,
    client_email: activeClientEmail,
    workout_template_id: workoutRow.workout_template_id || null,
    entry_date: workoutRow.entry_date,
    workout_title: workoutRow.workout_title,
    difficulty_rating: rating,
    source: "website",
    source_version: 1,
    client_updated_at: now
  };
  const { data, error } = await supabaseClient
    .from("workout_session_feedback")
    .upsert(payload, { onConflict: "session_id" })
    .select()
    .single();

  if (error) {
    return { saved: false, error };
  }

  upsertLocalWorkoutSessionFeedback(data || payload);
  return { saved: true, feedback: data || payload };
}

function workoutDifficultyPromptMarkup() {
  return `
    <div class="workout-difficulty-overlay" data-workout-difficulty-overlay hidden>
      <section class="workout-difficulty-sheet" role="dialog" aria-modal="true" aria-labelledby="workout-difficulty-title">
        <header class="rir-heading">
          <div>
            <small>Workout complete</small>
            <strong id="workout-difficulty-title">How hard was this workout?</strong>
          </div>
          <button class="rir-close" type="button" data-workout-difficulty-close aria-label="Close workout difficulty prompt">×</button>
        </header>
        <p class="workout-difficulty-congratulations">Congratulations for completing the workout!</p>
        <p class="workout-difficulty-question">Choose the rating that best describes the workout overall.</p>
        <div class="workout-difficulty-options" role="radiogroup" aria-label="Overall workout difficulty">
          ${workoutDifficultyOptions().map(([value, label]) => `
            <button type="button" role="radio" data-workout-difficulty-option="${value}" aria-checked="false">
              <strong>${value}</strong>
              <span>${label}</span>
            </button>
          `).join("")}
        </div>
        <button class="workout-difficulty-save" type="button" data-workout-difficulty-save disabled>Save and finish workout</button>
      </section>
    </div>
  `;
}

function ensureWorkoutDifficultyPrompt() {
  let overlay = document.querySelector("[data-workout-difficulty-overlay]");

  if (!overlay) {
    document.body.insertAdjacentHTML("beforeend", workoutDifficultyPromptMarkup());
    overlay = document.querySelector("[data-workout-difficulty-overlay]");
  }

  return overlay;
}

function renderWorkoutDifficultyPrompt() {
  const overlay = ensureWorkoutDifficultyPrompt();

  overlay?.querySelectorAll("[data-workout-difficulty-option]").forEach((button) => {
    const isSelected = Number(button.dataset.workoutDifficultyOption) === pendingWorkoutDifficulty;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-checked", isSelected ? "true" : "false");
  });

  const saveButton = overlay?.querySelector("[data-workout-difficulty-save]");
  if (saveButton) {
    saveButton.disabled = pendingWorkoutDifficulty === null;
  }
}

function requestWorkoutDifficulty(returnFocus) {
  if (workoutDifficultyPromptResolve) {
    return Promise.resolve(null);
  }

  const overlay = ensureWorkoutDifficultyPrompt();
  workoutDifficultyReturnFocus = returnFocus || null;
  pendingWorkoutDifficulty = null;
  const congratulations = overlay.querySelector(".workout-difficulty-congratulations");
  if (congratulations) {
    congratulations.textContent = randomWorkoutCompletionMessage();
  }
  overlay.hidden = false;
  document.body.classList.add("workout-difficulty-open");
  renderWorkoutDifficultyPrompt();
  overlay.querySelector("[data-workout-difficulty-option]")?.focus();

  return new Promise((resolve) => {
    workoutDifficultyPromptResolve = resolve;
  });
}

function closeWorkoutDifficultyPrompt(value = null) {
  const overlay = document.querySelector("[data-workout-difficulty-overlay]");
  const resolve = workoutDifficultyPromptResolve;
  const returnFocus = workoutDifficultyReturnFocus;

  if (overlay) {
    overlay.hidden = true;
  }
  document.body.classList.remove("workout-difficulty-open");
  workoutDifficultyPromptResolve = null;
  workoutDifficultyReturnFocus = null;
  pendingWorkoutDifficulty = null;
  returnFocus?.focus();
  resolve?.(value);
}

function saveWorkoutDifficultySelection() {
  if (pendingWorkoutDifficulty === null) {
    return;
  }

  closeWorkoutDifficultyPrompt(pendingWorkoutDifficulty);
}

function nextExercisePromptMarkup() {
  return `
    <div class="next-exercise-overlay" data-next-exercise-overlay hidden>
      <section class="next-exercise-sheet" role="dialog" aria-modal="true" aria-labelledby="next-exercise-title">
        <header class="rir-heading">
          <div>
            <small>Exercise finished</small>
            <strong id="next-exercise-title">Start a new exercise?</strong>
          </div>
          <button class="rir-close" type="button" data-next-exercise-close aria-label="Close new exercise prompt">×</button>
        </header>
        <p>Would you like to add another exercise to this workout?</p>
        <div class="next-exercise-actions">
          <button class="next-exercise-decline" type="button" data-next-exercise-no>Not now</button>
          <button class="next-exercise-confirm" type="button" data-next-exercise-yes>Start New Exercise</button>
        </div>
      </section>
    </div>
  `;
}

function ensureNextExercisePrompt() {
  let overlay = document.querySelector("[data-next-exercise-overlay]");

  if (!overlay) {
    document.body.insertAdjacentHTML("beforeend", nextExercisePromptMarkup());
    overlay = document.querySelector("[data-next-exercise-overlay]");
  }

  return overlay;
}

function openNextExercisePrompt(panel, returnFocus) {
  const overlay = ensureNextExercisePrompt();

  nextExercisePromptPanel = panel || null;
  nextExercisePromptReturnFocus = returnFocus || null;
  overlay.hidden = false;
  document.body.classList.add("next-exercise-open");
  overlay.querySelector("[data-next-exercise-yes]")?.focus();
}

function closeNextExercisePrompt(options = {}) {
  const overlay = document.querySelector("[data-next-exercise-overlay]");
  const returnFocus = nextExercisePromptReturnFocus;

  if (overlay) {
    overlay.hidden = true;
  }
  document.body.classList.remove("next-exercise-open");
  nextExercisePromptPanel = null;
  nextExercisePromptReturnFocus = null;

  if (options.restoreFocus !== false) {
    returnFocus?.focus();
  }
}

function workoutElapsedTimerMarkup() {
  return `
    <aside class="workout-elapsed-timer" data-workout-elapsed-timer hidden aria-label="Workout duration">
      <button class="workout-elapsed-compact-toggle" type="button" data-workout-elapsed-compact aria-expanded="true" aria-label="Minimize workout timer">
        <span data-workout-elapsed-compact-icon aria-hidden="true">−</span>
        <small data-workout-elapsed-compact-label>Minimize</small>
      </button>
      <output data-workout-elapsed-display role="timer" aria-live="off">00:00</output>
      <button type="button" data-workout-elapsed-toggle aria-label="Pause workout timer">Pause</button>
    </aside>
  `;
}

function ensureWorkoutElapsedTimer() {
  let timer = document.querySelector("[data-workout-elapsed-timer]");

  if (!timer) {
    document.body.insertAdjacentHTML("beforeend", workoutElapsedTimerMarkup());
    timer = document.querySelector("[data-workout-elapsed-timer]");
  }

  return timer;
}

function workoutElapsedTimerCompactPreference() {
  if (typeof workoutElapsedTimerIsCompact === "boolean") {
    return workoutElapsedTimerIsCompact;
  }

  try {
    const storedPreference = window.localStorage.getItem(workoutElapsedTimerCompactStorageKey);

    if (storedPreference === "true" || storedPreference === "false") {
      workoutElapsedTimerIsCompact = storedPreference === "true";
      return workoutElapsedTimerIsCompact;
    }
  } catch (_error) {
    // Fall back to the phone-sized default when storage is unavailable.
  }

  workoutElapsedTimerIsCompact = Boolean(window.matchMedia?.("(max-width: 760px)").matches);
  return workoutElapsedTimerIsCompact;
}

function setWorkoutElapsedTimerCompact(isCompact) {
  workoutElapsedTimerIsCompact = Boolean(isCompact);

  try {
    window.localStorage.setItem(
      workoutElapsedTimerCompactStorageKey,
      String(workoutElapsedTimerIsCompact)
    );
  } catch (_error) {
    // The timer can still collapse for this page view without storage.
  }

  renderWorkoutElapsedTimer();
}

function toggleWorkoutElapsedTimerCompact() {
  setWorkoutElapsedTimerCompact(!workoutElapsedTimerCompactPreference());
}

function workoutElapsedTimerClientEmail() {
  return String(activeClientEmail || signedInDashboardEmail || "").trim().toLowerCase();
}

function readWorkoutElapsedTimerState() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(workoutElapsedTimerStorageKey) || "null");

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const state = {
      clientEmail: String(parsed.clientEmail || "").trim().toLowerCase(),
      workoutTitle: String(parsed.workoutTitle || "Workout").trim() || "Workout",
      accumulatedMilliseconds: Math.max(0, Number(parsed.accumulatedMilliseconds) || 0),
      startedAt: Math.max(0, Number(parsed.startedAt) || 0),
      running: Boolean(parsed.running)
    };
    const activeMilliseconds = state.running && state.startedAt
      ? Math.max(0, Date.now() - state.startedAt)
      : 0;

    if (state.accumulatedMilliseconds + activeMilliseconds > workoutElapsedTimerMaximumMilliseconds) {
      window.localStorage.removeItem(workoutElapsedTimerStorageKey);
      return null;
    }

    return state;
  } catch (_error) {
    return null;
  }
}

function persistWorkoutElapsedTimerState() {
  if (!workoutElapsedTimerState) {
    return;
  }

  try {
    window.localStorage.setItem(workoutElapsedTimerStorageKey, JSON.stringify(workoutElapsedTimerState));
  } catch (_error) {
    // The timer still works for this page view when storage is unavailable.
  }
}

function clearWorkoutElapsedTimerInterval() {
  if (workoutElapsedTimerIntervalId) {
    window.clearInterval(workoutElapsedTimerIntervalId);
    workoutElapsedTimerIntervalId = null;
  }
}

function workoutElapsedMilliseconds(now = Date.now()) {
  if (!workoutElapsedTimerState) {
    return 0;
  }

  const activeMilliseconds = workoutElapsedTimerState.running && workoutElapsedTimerState.startedAt
    ? Math.max(0, now - workoutElapsedTimerState.startedAt)
    : 0;

  return workoutElapsedTimerState.accumulatedMilliseconds + activeMilliseconds;
}

function workoutElapsedTimeLabel(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor((Number(milliseconds) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const minuteLabel = String(minutes).padStart(2, "0");
  const secondLabel = String(seconds).padStart(2, "0");

  return hours > 0
    ? `${hours}:${minuteLabel}:${secondLabel}`
    : `${minuteLabel}:${secondLabel}`;
}

function workoutCompletionFields(now = Date.now()) {
  const elapsedMilliseconds = workoutElapsedTimerState
    ? workoutElapsedMilliseconds(now)
    : 0;

  return {
    workout_duration_seconds: Math.max(1, Math.round(elapsedMilliseconds / 1000)),
    completed_at: new Date(now).toISOString()
  };
}

function workoutHistoryDurationLabel(seconds) {
  if (seconds === null || seconds === undefined || seconds === "") {
    return "";
  }

  const durationSeconds = Number(seconds);

  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return "";
  }

  return `Workout time ${workoutElapsedTimeLabel(durationSeconds * 1000)}`;
}

function activeWorkoutElapsedTitle() {
  const panelTitle = document
    .querySelector(".client-workout-panel.is-active:not([hidden]) .panel-heading h2")
    ?.textContent
    ?.trim();
  const homeTitle = document.getElementById("client-home-workout-title")?.textContent?.trim();

  return panelTitle || homeTitle || "Workout";
}

function renderWorkoutElapsedTimer() {
  const timer = ensureWorkoutElapsedTimer();

  if (!workoutElapsedTimerState) {
    timer.hidden = true;
    syncWorkoutStartButtons();
    return;
  }

  const display = timer.querySelector("[data-workout-elapsed-display]");
  const toggleButton = timer.querySelector("[data-workout-elapsed-toggle]");
  const compactButton = timer.querySelector("[data-workout-elapsed-compact]");
  const compactIcon = timer.querySelector("[data-workout-elapsed-compact-icon]");
  const compactLabel = timer.querySelector("[data-workout-elapsed-compact-label]");
  const isCompact = workoutElapsedTimerCompactPreference();

  timer.hidden = false;
  timer.classList.toggle("is-compact", isCompact);
  if (display) {
    display.textContent = workoutElapsedTimeLabel(workoutElapsedMilliseconds());
  }
  if (toggleButton) {
    toggleButton.textContent = workoutElapsedTimerState.running ? "Pause" : "Resume";
    toggleButton.setAttribute(
      "aria-label",
      workoutElapsedTimerState.running ? "Pause workout timer" : "Resume workout timer"
    );
  }
  if (compactButton) {
    compactButton.setAttribute("aria-expanded", isCompact ? "false" : "true");
    compactButton.setAttribute(
      "aria-label",
      isCompact ? "Expand workout timer" : "Minimize workout timer"
    );
  }
  if (compactIcon) {
    compactIcon.textContent = isCompact ? "+" : "−";
  }
  if (compactLabel) {
    compactLabel.textContent = isCompact ? "Expand" : "Minimize";
  }
  syncWorkoutStartButtons();
}

function syncWorkoutStartButtons() {
  document.querySelectorAll("[data-workout-start]").forEach((button) => {
    const workoutTitle = String(button.dataset.workoutTitle || "").trim();
    const isActiveWorkout = Boolean(
      workoutElapsedTimerState &&
      workoutTitle === String(workoutElapsedTimerState.workoutTitle || "").trim()
    );

    button.disabled = Boolean(workoutElapsedTimerState && !isActiveWorkout);
    button.classList.toggle("is-active", isActiveWorkout);

    if (!workoutElapsedTimerState) {
      button.textContent = "Start workout";
    } else if (!isActiveWorkout) {
      button.textContent = "Workout timer active";
    } else {
      button.textContent = workoutElapsedTimerState.running ? "Pause workout" : "Resume workout";
    }
  });
}

function runWorkoutElapsedTimer() {
  clearWorkoutElapsedTimerInterval();
  if (workoutElapsedTimerState?.running) {
    workoutElapsedTimerIntervalId = window.setInterval(renderWorkoutElapsedTimer, 1000);
  }
  renderWorkoutElapsedTimer();
}

function startWorkoutElapsedTimer(workoutTitle = "") {
  const clientEmail = workoutElapsedTimerClientEmail();
  const storedState = readWorkoutElapsedTimerState();
  const canResumeStoredState = storedState && (!storedState.clientEmail || storedState.clientEmail === clientEmail);

  workoutElapsedTimerState = canResumeStoredState
    ? storedState
    : {
        clientEmail,
        workoutTitle: String(workoutTitle || activeWorkoutElapsedTitle()).trim() || "Workout",
        accumulatedMilliseconds: 0,
        startedAt: Date.now(),
        running: true
      };

  workoutElapsedTimerState.clientEmail = clientEmail;
  workoutElapsedTimerState.workoutTitle = String(
    workoutTitle || workoutElapsedTimerState.workoutTitle || activeWorkoutElapsedTitle()
  ).trim() || "Workout";

  if (!workoutElapsedTimerState.running) {
    workoutElapsedTimerState.startedAt = Date.now();
    workoutElapsedTimerState.running = true;
  }

  persistWorkoutElapsedTimerState();
  runWorkoutElapsedTimer();
}

function restoreWorkoutElapsedTimer() {
  const storedState = readWorkoutElapsedTimerState();
  const clientEmail = workoutElapsedTimerClientEmail();

  if (!storedState || (storedState.clientEmail && storedState.clientEmail !== clientEmail)) {
    return;
  }

  workoutElapsedTimerState = storedState;
  runWorkoutElapsedTimer();
}

function toggleWorkoutElapsedTimer() {
  if (!workoutElapsedTimerState) {
    return;
  }

  if (workoutElapsedTimerState.running) {
    workoutElapsedTimerState.accumulatedMilliseconds = workoutElapsedMilliseconds();
    workoutElapsedTimerState.startedAt = 0;
    workoutElapsedTimerState.running = false;
  } else {
    workoutElapsedTimerState.startedAt = Date.now();
    workoutElapsedTimerState.running = true;
  }

  persistWorkoutElapsedTimerState();
  runWorkoutElapsedTimer();
}

function finishWorkoutElapsedTimer() {
  workoutElapsedTimerState = null;
  clearWorkoutElapsedTimerInterval();
  try {
    window.localStorage.removeItem(workoutElapsedTimerStorageKey);
  } catch (_error) {
    // Nothing else is required when storage is unavailable.
  }
  renderWorkoutElapsedTimer();
}

function supersetRows(workout, workoutTitle) {
  const groups = groupedExercises(workout.exercises || []);
  let exerciseOffset = 0;

  return groups.map((group) => {
    const startIndex = exerciseOffset;
    exerciseOffset += group.exercises.length;

    return `
      <section class="workout-format-group compact-workout-group superset-group">
        <div class="compact-static-group-card">
          ${compactWorkoutGroupOverview(group, group.exercises.length > 1 ? "superset" : "single")}
        </div>
        ${exerciseCardRows(group.exercises, workoutTitle, "all", workout.focus, {
          format: group.exercises.length > 1 ? "superset" : "single",
          startIndex
        })}
      </section>
    `;
  }).join("");
}

function circuitRows(workout, workoutTitle) {
  const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];
  const group = { key: "Circuit", exercises };

  return `
    <section class="workout-format-group circuit-group compact-workout-group">
      <div class="compact-static-group-card">
        ${compactWorkoutGroupOverview(group, "circuit")}
      </div>
      ${exerciseCardRows(exercises, workoutTitle, "all", workout.focus, { format: "circuit" })}
    </section>
  `;
}

function straightSetRows(workout, workoutTitle) {
  const groups = groupedExercises(workout.exercises || []);
  let exerciseOffset = 0;

  return groups.map((group) => {
    const startIndex = exerciseOffset;
    exerciseOffset += group.exercises.length;

    return exerciseCardRows(group.exercises, workoutTitle, "all", workout.focus, {
      format: "single",
      startIndex
    });
  }).join("");
}

function assignedWorkoutExercises(workout, workoutTitle) {
  const assignedExercises = Array.isArray(workout.exercises) ? workout.exercises : [];
  const assignedCodes = new Set(assignedExercises.map((exercise) => String(exercise.code || "").trim().toUpperCase()));
  const loggedExtras = new Map();

  trainingLogs
    .filter((log) => (
      String(log.workout_title || "") === String(workoutTitle || "") &&
      ![warmupExerciseCode, cardioExerciseCode].includes(String(log.exercise_code || "").trim().toUpperCase()) &&
      !assignedCodes.has(String(log.exercise_code || "").trim().toUpperCase())
    ))
    .forEach((log) => {
      const code = String(log.exercise_code || "").trim().toUpperCase();

      if (!code) {
        return;
      }

      if (!loggedExtras.has(code)) {
        loggedExtras.set(code, {
          code,
          name: String(log.exercise_name || "").trim(),
          prescription: "Custom sets",
          rest: "",
          clientAdded: true,
          workingSets: new Set()
        });
      }

      const extra = loggedExtras.get(code);
      if (log.exercise_name) {
        extra.name = String(log.exercise_name).trim();
      }
      if (normalizedSetType(log.set_type, log.set_number) !== warmUpSetType) {
        extra.workingSets.add(Number(log.set_number) || 1);
      }
    });

  const extras = Array.from(loggedExtras.values())
    .map(({ workingSets, ...exercise }) => ({
      ...exercise,
      clientSetCount: Math.max(workingSets.size, 1)
    }))
    .sort((left, right) => left.code.localeCompare(right.code, undefined, { numeric: true }));

  return [...assignedExercises, ...extras];
}

function workoutExerciseMarkup(workout, workoutTitle) {
  const format = inferWorkoutFormat(workout);
  const displayWorkout = {
    ...workout,
    format,
    exercises: assignedWorkoutExercises(workout, workoutTitle)
  };

  if (displayWorkout.exercises.length === 0) {
    return '<p class="empty-state">Workout details will appear here when your coach adds them.</p>';
  }

  if (format === "superset") {
    return supersetRows(displayWorkout, workoutTitle);
  }

  if (format === "circuit") {
    return circuitRows(displayWorkout, workoutTitle);
  }

  return straightSetRows(displayWorkout, workoutTitle);
}

function workoutActionsMarkup(workout, options = {}) {
  if (!options.includeCardio && (!Array.isArray(workout.exercises) || workout.exercises.length === 0)) {
    return "";
  }

  return `
    <div class="workout-actions">
      <div>
        <button class="workout-finish-button" type="button" data-workout-finish>Finish workout</button>
      </div>
      <small data-workout-status></small>
    </div>
  `;
}

function customWorkoutCardMarkup(exercise, workoutTitle, index = 0) {
  const exerciseName = String(exercise.name || "").trim();
  const groupIndex = Math.max(Number(exercise.group) || 0, 0);
  const marker = customWorkoutFormatMarker(activeCustomWorkoutFormat, index);
  const isFirstSupersetExercise = activeCustomWorkoutFormat === "superset" && index % 2 === 0;
  const isSecondSupersetExercise = activeCustomWorkoutFormat === "superset" && index % 2 === 1;
  const suggestionMenuId = `custom-exercise-options-${String(exercise.code || index + 1).toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;

  return `
    <article class="workout-exercise-card workout-entry-card custom-workout-card is-open" data-custom-exercise-card data-custom-workout-group="${groupIndex}">
      <div class="exercise-card-summary custom-workout-card-summary">
        <span>
          <span class="custom-workout-card-marker-row">
            <span class="status-pill" data-custom-workout-format-marker>${escapeHtml(marker)}</span>
            <button class="custom-workout-delete-icon" type="button" data-delete-exercise aria-label="Delete exercise ${index + 1}">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" />
              </svg>
            </button>
          </span>
          <strong class="custom-workout-editable-title" data-exercise-title>
            <span class="custom-workout-name-editor">
              <input
                type="text"
                value="${escapeHtml(exerciseName)}"
                placeholder="Input exercise name here"
                aria-label="Exercise ${index + 1} name"
                aria-autocomplete="list"
                aria-controls="${suggestionMenuId}"
                aria-expanded="false"
                autocomplete="off"
                data-exercise-title-name
                data-exercise-name-input
              />
              <span
                class="custom-workout-suggestion-menu"
                id="${suggestionMenuId}"
                role="listbox"
                data-custom-exercise-suggestions
                hidden
              ></span>
            </span>
          </strong>
          <small data-set-progress>0 / 1 sets completed</small>
        </span>
        <button class="custom-workout-card-toggle" type="button" data-exercise-toggle aria-label="Toggle exercise ${index + 1}"><i>›</i></button>
      </div>
      <div class="exercise-detail custom-workout-detail">
        ${exerciseLogFields({
          code: exercise.code,
          name: exerciseName,
          prescription: exercise.prescription || "Custom sets",
          rest: exercise.rest || ""
        }, workoutTitle, {
          panelClass: "custom-exercise-log",
          showSubmit: false,
          suggestExerciseNames: true,
          showExerciseNameField: false,
          showActions: false,
          showDate: false,
          showDemo: false,
          setCount: 1,
          userManagedSets: true,
          finishButtonLabel: isFirstSupersetExercise
            ? "Add Superset"
            : (isSecondSupersetExercise ? "Superset Completed" : "Set Finished"),
          finishButtonAction: isFirstSupersetExercise ? "add-superset" : "finish-set"
        })}
      </div>
    </article>
  `;
}

function customWorkoutListMarkup() {
  const exercises = customWorkoutExercises();

  return exercises.map((exercise, index) => customWorkoutCardMarkup(exercise, customWorkoutTitle, index)).join("");
}

function customWorkoutCarouselGroupMarkup(format, exercises, groupIndex = 0, startIndex = 0) {
  const label = format === "superset"
    ? `Superset ${groupIndex + 1}`
    : format === "circuit"
      ? `Circuit ${groupIndex + 1}`
      : "Custom workout";

  return `
    <section class="custom-workout-carousel" data-custom-workout-carousel data-custom-workout-group="${groupIndex}" data-custom-workout-format="${escapeHtml(format)}" aria-label="${escapeHtml(label)} exercise carousel">
      <div class="custom-workout-carousel-heading" data-custom-workout-carousel-status aria-live="polite"></div>
      <div class="workout-app-list custom-workout-list" data-custom-workout-list data-custom-workout-format="${escapeHtml(format)}" role="list" aria-label="Custom workout exercises" tabindex="0">
        ${exercises.map((exercise, index) => customWorkoutCardMarkup(exercise, customWorkoutTitle, startIndex + index)).join("")}
      </div>
      <div class="custom-workout-carousel-footer" data-custom-workout-carousel-controls hidden>
        <button class="custom-workout-carousel-arrow" type="button" data-custom-workout-carousel-previous aria-label="Previous exercise">←</button>
        <div class="custom-workout-carousel-dots" data-custom-workout-carousel-dots aria-label="Choose exercise"></div>
        <button class="custom-workout-carousel-arrow" type="button" data-custom-workout-carousel-next aria-label="Next exercise">→</button>
      </div>
      <p class="custom-workout-carousel-cue" data-custom-workout-carousel-cue hidden></p>
    </section>
  `;
}

function customWorkoutCarouselMarkup(format) {
  const exercises = customWorkoutExercises();
  let groups;

  if (format === "superset") {
    groups = Array.from({ length: Math.ceil(exercises.length / 2) }, (_, index) => ({
      index,
      exercises: exercises.slice(index * 2, (index * 2) + 2),
      startIndex: index * 2
    }));
  } else if (format === "circuit") {
    const circuitGroups = new Map();
    exercises.forEach((exercise, index) => {
      const groupIndex = Math.max(Number(exercise.group) || 0, 0);
      if (!circuitGroups.has(groupIndex)) circuitGroups.set(groupIndex, { index: groupIndex, exercises: [], startIndex: index });
      circuitGroups.get(groupIndex).exercises.push(exercise);
    });
    groups = Array.from(circuitGroups.values()).map((group, index) => ({ ...group, index }));
  } else {
    groups = [{ index: 0, exercises, startIndex: 0 }];
  }

  return `
    <div class="custom-workout-carousel-stack" data-custom-workout-carousel-stack>
      ${groups.map((group) => customWorkoutCarouselGroupMarkup(format, group.exercises, group.index, group.startIndex)).join("")}
    </div>
  `;
}

function customWorkoutCarousels(panel) {
  return Array.from(panel?.querySelectorAll("[data-custom-workout-carousel]") || []);
}

function customWorkoutCarouselCards(carousel) {
  const list = carousel?.querySelector("[data-custom-workout-list]");
  return Array.from(list?.children || []).filter((element) => element.matches("[data-custom-exercise-card]"));
}

function customWorkoutCarouselMeta(format, index, total, groupIndex = 0) {
  if (format === "superset") {
    const position = index % 2 === 0 ? "A1" : "A2";
    return {
      title: `Superset ${groupIndex + 1} · ${position}`,
      count: `Exercise ${index + 1} of ${total}`,
      cue: index % 2 === 0 && index + 1 < total
        ? "Next: complete the paired exercise."
        : "Rest, then repeat this pair."
    };
  }

  return {
    title: `Circuit ${groupIndex + 1} · Station ${index + 1}`,
    count: `${index + 1} of ${total}`,
    cue: index + 1 < total
      ? `Next: move to station ${index + 2}.`
      : "Rest, then restart the circuit."
  };
}

function renderCustomWorkoutCarousel(carousel) {
  const panel = carousel?.closest(".client-workout-panel-custom");
  const cards = customWorkoutCarouselCards(carousel);
  const format = normalizeCustomWorkoutFormat(panel?.dataset.customWorkoutFormat || activeCustomWorkoutFormat);
  const groupIndex = Number(carousel?.dataset.customWorkoutGroup) || 0;
  const mobile = window.matchMedia("(max-width: 760px)").matches;
  const enabled = mobile && format !== "single" && cards.length > 1;
  const activeIndex = Math.min(Math.max(Number(carousel?.dataset.activeIndex) || 0, 0), Math.max(cards.length - 1, 0));
  const status = carousel?.querySelector("[data-custom-workout-carousel-status]");
  const controls = carousel?.querySelector("[data-custom-workout-carousel-controls]");
  const dots = carousel?.querySelector("[data-custom-workout-carousel-dots]");
  const cue = carousel?.querySelector("[data-custom-workout-carousel-cue]");

  if (!carousel) {
    return;
  }

  carousel.dataset.customWorkoutFormat = format;
  carousel.dataset.carouselEnabled = enabled ? "true" : "false";
  carousel.dataset.activeIndex = String(activeIndex);
  carousel.classList.toggle(
    "is-superset-complete",
    format === "superset" && cards.length > 1 && cards[cards.length - 1].classList.contains("is-exercise-complete")
  );
  if (controls) controls.hidden = !enabled;
  if (cue) cue.hidden = !enabled;
  if (status) status.hidden = !enabled;

  cards.forEach((card, index) => {
    card.classList.toggle("is-carousel-active", enabled && index === activeIndex);
    card.setAttribute("aria-roledescription", enabled ? "slide" : "exercise");
    card.setAttribute("aria-label", `Exercise ${index + 1} of ${cards.length}`);
  });

  if (!enabled) {
    if (dots) dots.innerHTML = "";
    return;
  }

  const meta = customWorkoutCarouselMeta(format, activeIndex, cards.length, groupIndex);
  if (status) {
    status.innerHTML = `<strong>${escapeHtml(meta.title)}</strong><span>${escapeHtml(meta.count)}</span>`;
  }
  if (cue) cue.textContent = meta.cue;
  if (dots) {
    dots.innerHTML = cards.map((card, index) => `
      <button
        type="button"
        class="custom-workout-carousel-dot${index === activeIndex ? " is-active" : ""}"
        data-custom-workout-carousel-dot="${index}"
        aria-label="Show exercise ${index + 1}"
        ${index === activeIndex ? 'aria-current="true"' : ""}
      ></button>
    `).join("");
  }

  const previous = carousel.querySelector("[data-custom-workout-carousel-previous]");
  const next = carousel.querySelector("[data-custom-workout-carousel-next]");
  if (previous) previous.disabled = activeIndex === 0;
  if (next) next.disabled = activeIndex === cards.length - 1;
}

function moveCustomWorkoutCarousel(carousel, nextIndex, options = {}) {
  const list = carousel?.querySelector("[data-custom-workout-list]");
  const cards = customWorkoutCarouselCards(carousel);

  if (!carousel || !list || cards.length === 0) {
    return;
  }

  const index = Math.min(Math.max(Number(nextIndex) || 0, 0), cards.length - 1);
  const firstOffset = cards[0]?.offsetLeft || 0;
  const card = cards[index];
  const cardOffset = Math.max((card?.offsetLeft || 0) - firstOffset, 0);
  // The first exercise exposes the next card on the right. Once clients move
  // forward, keep the same inset on the left so the previous exercise remains
  // visible as a navigation cue instead of leaving an empty strip on the right.
  const previousCardPeek = index > 0
    ? Math.max(list.clientWidth - (card?.offsetWidth || list.clientWidth), 0)
    : 0;
  const targetLeft = Math.max(cardOffset - previousCardPeek, 0);
  carousel.dataset.activeIndex = String(index);
  renderCustomWorkoutCarousel(carousel);

  // Direct assignment works consistently in iOS/Android webviews and avoids a
  // smooth-scroll race where the scroll listener could restore the old slide.
  list.scrollLeft = targetLeft;
}

function bindCustomWorkoutCarousel(carousel) {
  const list = carousel?.querySelector("[data-custom-workout-list]");

  if (!carousel || !list || carousel.dataset.carouselBound === "true") {
    return;
  }

  carousel.dataset.carouselBound = "true";
  let frame = 0;
  let touchSwipe = null;
  carousel.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const previous = target?.closest("[data-custom-workout-carousel-previous]");
    const next = target?.closest("[data-custom-workout-carousel-next]");
    const dot = target?.closest("[data-custom-workout-carousel-dot]");

    if (!previous && !next && !dot) return;
    event.preventDefault();
    event.stopPropagation();

    const current = Number(carousel.dataset.activeIndex) || 0;
    const nextIndex = dot
      ? Number(dot.dataset.customWorkoutCarouselDot)
      : current + (next ? 1 : -1);
    moveCustomWorkoutCarousel(carousel, nextIndex);
  });

  list.addEventListener("scroll", () => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      if (carousel.dataset.carouselEnabled !== "true" || list.classList.contains("is-touch-swiping")) return;
      const cards = customWorkoutCarouselCards(carousel);
      const firstOffset = cards[0]?.offsetLeft || 0;
      const index = cards.reduce((closest, card, cardIndex) => (
        Math.abs((card.offsetLeft - firstOffset) - list.scrollLeft) <
        Math.abs((cards[closest]?.offsetLeft - firstOffset) - list.scrollLeft)
          ? cardIndex
          : closest
      ), 0);
      if (String(index) !== carousel.dataset.activeIndex) {
        carousel.dataset.activeIndex = String(index);
        renderCustomWorkoutCarousel(carousel);
      }
    });
  }, { passive: true });

  list.addEventListener("touchstart", (event) => {
    if (
      carousel.dataset.carouselEnabled !== "true" ||
      event.touches.length !== 1 ||
      event.target.closest("input, select, textarea")
    ) {
      touchSwipe = null;
      return;
    }

    const touch = event.touches[0];
    touchSwipe = {
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      startScrollLeft: list.scrollLeft,
      startIndex: Number(carousel.dataset.activeIndex) || 0,
      direction: ""
    };
  }, { passive: true });

  list.addEventListener("touchmove", (event) => {
    if (!touchSwipe || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - touchSwipe.startX;
    const deltaY = touch.clientY - touchSwipe.startY;
    touchSwipe.lastX = touch.clientX;

    if (!touchSwipe.direction && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 8) {
      touchSwipe.direction = Math.abs(deltaX) > Math.abs(deltaY) * 1.15 ? "horizontal" : "vertical";
      if (touchSwipe.direction === "horizontal") {
        list.classList.add("is-touch-swiping");
      }
    }

    if (touchSwipe.direction !== "horizontal") return;
    event.preventDefault();
    list.scrollLeft = touchSwipe.startScrollLeft - deltaX;
  }, { passive: false });

  const finishTouchSwipe = (cancelled = false) => {
    if (!touchSwipe) return;

    const deltaX = touchSwipe.lastX - touchSwipe.startX;
    const threshold = Math.min(54, list.clientWidth * .14);
    const wasHorizontal = touchSwipe.direction === "horizontal";
    const startIndex = touchSwipe.startIndex;
    touchSwipe = null;
    list.classList.remove("is-touch-swiping");

    if (!wasHorizontal) return;
    const direction = !cancelled && Math.abs(deltaX) >= threshold ? (deltaX < 0 ? 1 : -1) : 0;
    moveCustomWorkoutCarousel(carousel, startIndex + direction);
  };

  list.addEventListener("touchend", () => finishTouchSwipe(), { passive: true });
  list.addEventListener("touchcancel", () => finishTouchSwipe(true), { passive: true });

  list.addEventListener("keydown", (event) => {
    if (event.target.closest("input, select, textarea, button")) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    moveCustomWorkoutCarousel(carousel, (Number(carousel.dataset.activeIndex) || 0) + direction);
  });
}

function regroupCustomWorkoutCarousels(panel) {
  const stack = panel?.querySelector("[data-custom-workout-carousel-stack]");
  const format = normalizeCustomWorkoutFormat(panel?.dataset.customWorkoutFormat || activeCustomWorkoutFormat);
  const cards = Array.from(stack?.querySelectorAll("[data-custom-exercise-card]") || []);
  let desiredGroups;

  if (format === "superset") {
    desiredGroups = Array.from({ length: Math.max(Math.ceil(cards.length / 2), 1) }, (_, index) => ({
      index,
      cards: cards.slice(index * 2, (index * 2) + 2)
    }));
  } else if (format === "circuit") {
    const circuitGroups = new Map();
    cards.forEach((card) => {
      const groupIndex = Math.max(Number(card.dataset.customWorkoutGroup) || 0, 0);
      if (!circuitGroups.has(groupIndex)) circuitGroups.set(groupIndex, { index: groupIndex, cards: [] });
      circuitGroups.get(groupIndex).cards.push(card);
    });
    desiredGroups = Array.from(circuitGroups.values()).map((group, index) => {
      group.cards.forEach((card) => {
        card.dataset.customWorkoutGroup = String(index);
      });
      return { index, cards: group.cards };
    });
    if (desiredGroups.length === 0) desiredGroups = [{ index: 0, cards: [] }];
  } else {
    desiredGroups = [{ index: 0, cards }];
  }
  const existing = customWorkoutCarousels(panel);
  const alreadyGrouped = existing.length === desiredGroups.length && desiredGroups.every((group, groupIndex) => {
    const currentCards = customWorkoutCarouselCards(existing[groupIndex]);
    return Number(existing[groupIndex].dataset.customWorkoutGroup) === group.index &&
      currentCards.length === group.cards.length && currentCards.every((card, index) => card === group.cards[index]);
  });

  if (!stack || alreadyGrouped) {
    existing.forEach((carousel, index) => {
      carousel.dataset.customWorkoutFormat = format;
      carousel.dataset.customWorkoutGroup = String(desiredGroups[index]?.index ?? index);
      const list = carousel.querySelector("[data-custom-workout-list]");
      if (list) list.dataset.customWorkoutFormat = format;
    });
    return;
  }

  const fragment = document.createDocumentFragment();
  desiredGroups.forEach((group) => {
    const template = document.createElement("template");
    template.innerHTML = customWorkoutCarouselGroupMarkup(format, [], group.index);
    const carousel = template.content.firstElementChild;
    const list = carousel.querySelector("[data-custom-workout-list]");
    group.cards.forEach((card) => list.append(card));
    fragment.append(carousel);
  });
  stack.replaceChildren(fragment);
}

function syncCustomWorkoutCarousel(panel, options = {}) {
  if (!panel) return;
  regroupCustomWorkoutCarousels(panel);
  const carousels = customWorkoutCarousels(panel);

  carousels.forEach((carousel) => {
    bindCustomWorkoutCarousel(carousel);
    if (options.activeIndex !== undefined) {
      carousel.dataset.activeIndex = String(options.activeIndex);
    }
    renderCustomWorkoutCarousel(carousel);
  });

  const focusCard = options.focusCard;
  const focusCarousel = focusCard?.closest("[data-custom-workout-carousel]");
  if (focusCarousel) {
    const focusIndex = customWorkoutCarouselCards(focusCarousel).indexOf(focusCard);
    moveCustomWorkoutCarousel(focusCarousel, Math.max(focusIndex, 0), { instant: options.instant });
  } else if (options.scrollToActive) {
    carousels.forEach((carousel) => {
      moveCustomWorkoutCarousel(carousel, Number(carousel.dataset.activeIndex) || 0, { instant: options.instant });
    });
  }
}

function syncCustomWorkoutCarousels() {
  document.querySelectorAll(".client-workout-panel-custom").forEach((panel) => syncCustomWorkoutCarousel(panel));
  if (!syncCustomWorkoutCarousels.resizeBound) {
    syncCustomWorkoutCarousels.resizeBound = true;
    window.addEventListener("resize", () => {
      document.querySelectorAll(".client-workout-panel-custom").forEach((panel) => {
        syncCustomWorkoutCarousel(panel, { scrollToActive: true, instant: true });
      });
    });
  }
}

function customWorkoutPanelMarkup(index) {
  const exercises = customWorkoutExercises();
  const format = normalizeCustomWorkoutFormat(activeCustomWorkoutFormat);
  const formatConfig = customWorkoutFormats[format];

  return `
    <section
      class="client-workout-panel client-workout-panel-custom${index === activeWorkoutTabIndex ? " is-active" : ""}"
      id="client-workout-panel-${index}"
      data-custom-workout-format="${format}"
      role="tabpanel"
      aria-labelledby="client-workout-tab-${index}"
      ${index === activeWorkoutTabIndex ? "" : "hidden"}
    >
      <div class="panel-heading">
        <div>
          <h2>${escapeHtml(customWorkoutTitle)}</h2>
        </div>
        <span class="status-pill">Build your own</span>
      </div>
      <label class="custom-workout-session-date workout-session-date">
        <span>Workout date</span>
        <span class="workout-session-date-control">
          <input type="date" value="${todayDate()}" data-workout-date />
        </span>
        <small>This date applies to every exercise in this custom workout.</small>
      </label>
      <div class="workout-format-pill" data-custom-workout-format-pill>${escapeHtml(formatConfig.label)}</div>
      <div class="custom-workout-builder">
        <div class="custom-workout-header">
          <p>Add your own exercises here and save them into your workout log.</p>
        </div>
        ${customWorkoutFormatPickerMarkup()}
        ${warmupLogFields(customWorkoutTitle, { showDate: false })}
        ${workoutStartControlMarkup(customWorkoutTitle)}
        ${customWorkoutCarouselMarkup(format)}
        <div class="custom-workout-add-actions" data-custom-workout-add-actions>
          <button class="button button-ghost custom-workout-add-bottom" type="button" data-add-custom-exercise data-custom-exercise-placement="current">${format === "circuit" ? "Add to current circuit" : "Add exercise"}</button>
          <button class="button button-ghost custom-workout-add-bottom" type="button" data-add-custom-exercise data-custom-exercise-placement="new-circuit" ${format === "circuit" ? "" : "hidden"}>Start new circuit</button>
        </div>
        ${cardioLogFields(customWorkoutTitle, { showDate: false })}
        ${workoutActionsMarkup({ exercises }, { includeCardio: true })}
      </div>
    </section>
  `;
}

function syncWorkoutPanelDate(panel, value, refresh = true) {
  const date = value || todayDate();
  const picker = panel?.querySelector("[data-workout-date]");

  if (picker && picker.value !== date) {
    picker.value = date;
  }

  panel?.querySelectorAll("[data-exercise-log] [data-log-date]").forEach((input) => {
    input.value = date;
    if (refresh) {
      updateExerciseLogField(input.closest("[data-exercise-log]"));
    }
  });
}

function syncCustomWorkoutFormatMarkers(panel) {
  const format = normalizeCustomWorkoutFormat(panel?.dataset.customWorkoutFormat || activeCustomWorkoutFormat);
  const circuitPositions = new Map();

  panel?.querySelectorAll("[data-custom-exercise-card]").forEach((card, index) => {
    const marker = card.querySelector("[data-custom-workout-format-marker]");
    const groupIndex = Math.max(Number(card.dataset.customWorkoutGroup) || 0, 0);
    const circuitPosition = (circuitPositions.get(groupIndex) || 0) + 1;
    circuitPositions.set(groupIndex, circuitPosition);

    if (marker) {
      marker.textContent = format === "circuit" ? `Station ${circuitPosition}` : customWorkoutFormatMarker(format, index);
    }

    const finishButton = card.querySelector("[data-finish-set]");
    const setActions = finishButton?.closest(".set-table-actions");
    const addsSupersetExercise = format === "superset" && index % 2 === 0;
    if (finishButton) {
      if (addsSupersetExercise) {
        finishButton.setAttribute("data-add-superset", "");
      } else {
        finishButton.removeAttribute("data-add-superset");
      }
    }
    setActions?.classList.toggle("has-add-superset-action", addsSupersetExercise);
    if (finishButton && finishButton.getAttribute("aria-pressed") !== "true") {
      finishButton.textContent = addsSupersetExercise
        ? "Add Superset"
        : (format === "superset" ? "Superset Completed" : "Set Finished");
    }

    card.querySelector("[data-exercise-title-name]")?.setAttribute("aria-label", `Exercise ${index + 1} name`);
    card.querySelector("[data-exercise-toggle]")?.setAttribute("aria-label", `Toggle exercise ${index + 1}`);
    card.querySelector("[data-delete-exercise]")?.setAttribute("aria-label", `Delete exercise ${index + 1}`);
  });
}

function updateCustomWorkoutFormat(panel, value, options = {}) {
  if (!panel) {
    return;
  }

  const format = normalizeCustomWorkoutFormat(value);
  const previousFormat = normalizeCustomWorkoutFormat(panel.dataset.customWorkoutFormat || activeCustomWorkoutFormat);
  const config = customWorkoutFormats[format];
  const pill = panel.querySelector("[data-custom-workout-format-pill]");
  const guide = panel.querySelector("[data-custom-workout-format-guide]");

  activeCustomWorkoutFormat = format;
  panel.dataset.customWorkoutFormat = format;
  storeCustomWorkoutFormat(format);

  if (format !== previousFormat) {
    panel.querySelectorAll("[data-custom-exercise-card]").forEach((card) => {
      card.dataset.customWorkoutGroup = "0";
    });
  }

  panel.querySelectorAll("[data-custom-workout-format-option]").forEach((button) => {
    const isActive = button.dataset.customWorkoutFormatOption === format;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  panel.querySelectorAll("[data-custom-workout-list]").forEach((list) => {
    list.dataset.customWorkoutFormat = format;
  });
  if (pill) {
    pill.textContent = config.label;
  }
  if (guide) {
    guide.textContent = config.guide;
  }

  const addCurrentButton = panel.querySelector('[data-add-custom-exercise][data-custom-exercise-placement="current"]');
  const addCircuitButton = panel.querySelector('[data-add-custom-exercise][data-custom-exercise-placement="new-circuit"]');
  if (addCurrentButton) {
    addCurrentButton.textContent = format === "circuit" ? "Add to current circuit" : "Add exercise";
  }
  if (addCircuitButton) {
    addCircuitButton.hidden = format !== "circuit";
  }

  syncCustomWorkoutFormatMarkers(panel);
  syncCustomWorkoutCarousel(panel, { activeIndex: 0, scrollToActive: true, instant: true });
  if (!options.skipDraft) {
    persistCustomWorkoutDraftFromPanel(panel);
  }
}

function renderClientWorkoutTabs(workouts = []) {
  const tabs = document.getElementById("client-workout-tabs");
  const panels = document.getElementById("client-workout-panels");
  const count = document.getElementById("client-workouts-count");

  if (!tabs || !panels) {
    return;
  }

  const scheduledWorkouts = Array.isArray(workouts) ? workouts : [];
  const availableWorkouts = [...scheduledWorkouts, {
    title: customWorkoutTitle,
    focus: "Build your own",
    format: "custom",
    isCustom: true
  }];

  if (count) {
    count.textContent = scheduledWorkouts.length > 0
      ? `${scheduledWorkouts.length} workout${scheduledWorkouts.length === 1 ? "" : "s"}`
      : "Custom workout";
  }

  if (availableWorkouts.length === 0) {
    tabs.innerHTML = "";
    panels.innerHTML = '<p class="empty-state">No workouts have been added yet.</p>';
    return;
  }

  if (activeWorkoutTabIndex >= availableWorkouts.length) {
    activeWorkoutTabIndex = 0;
  }

  tabs.innerHTML = availableWorkouts.map((workout, index) => {
    const title = workout.title || `Workout ${index + 1}`;
    const isActive = index === activeWorkoutTabIndex;
    const label = workout.isCustom ? "Custom" : `Workout ${index + 1}`;

    return `
      <button
        class="client-workout-tab${isActive ? " is-active" : ""}"
        type="button"
        role="tab"
        id="client-workout-tab-${index}"
        aria-selected="${isActive ? "true" : "false"}"
        aria-controls="client-workout-panel-${index}"
        data-client-workout-tab="${index}"
      >
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(title)}</strong>
      </button>
    `;
  }).join("");

  panels.innerHTML = availableWorkouts.map((workout, index) => {
    if (workout.isCustom) {
      return customWorkoutPanelMarkup(index);
    }

    const title = workout.title || `Workout ${index + 1}`;
    const isActive = index === activeWorkoutTabIndex;
    const workoutFormat = inferWorkoutFormat(workout);

    return `
      <section
        class="client-workout-panel client-workout-panel-assigned${isActive ? " is-active" : ""}"
        id="client-workout-panel-${index}"
        data-assigned-workout-format="${escapeHtml(workoutFormat)}"
        role="tabpanel"
        aria-labelledby="client-workout-tab-${index}"
        ${isActive ? "" : "hidden"}
      >
      <div class="panel-heading">
        <div>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <span class="status-pill">${escapeHtml(workout.focus || "")}</span>
      </div>
      <label class="custom-workout-session-date workout-session-date">
        <span>Workout date</span>
        <span class="workout-session-date-control">
          <input type="date" value="${todayDate()}" data-workout-date />
        </span>
        <small>This date applies to every exercise in this workout.</small>
      </label>
      <div class="workout-format-pill">${escapeHtml(formatLabel(workoutFormat))}</div>
      <div class="workout-app-list" data-assigned-workout-list role="list" aria-label="${escapeHtml(title)} exercises">
        ${warmupLogFields(title, { showDate: false })}
        ${workoutStartControlMarkup(title)}
        ${workoutExerciseMarkup(workout, title)}
        <button class="button button-ghost custom-workout-add-bottom" type="button" data-add-assigned-exercise>Add exercise</button>
        ${cardioLogFields(title, { showDate: false })}
        ${workoutActionsMarkup(workout, { includeCardio: true })}
      </div>
    </section>
  `;
  }).join("");

  renderClientHomeSummary();
  syncWorkoutStartButtons();
  syncCustomWorkoutCarousels();
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

function normalizeExerciseHistoryName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function currentExerciseHistoryName(logElement) {
  return normalizeExerciseHistoryName(
    exerciseNameInputForLog(logElement)?.value ||
    logElement?.dataset.exerciseName ||
    ""
  );
}

function logsForExerciseDisplay(logElement) {
  if (!logElement.closest("[data-custom-exercise-card]")) {
    return logsForExercise(logElement.dataset.workoutTitle, logElement.dataset.exerciseCode);
  }

  const exerciseName = currentExerciseHistoryName(logElement);

  if (!exerciseName) {
    return [];
  }

  return trainingLogs
    .filter((log) => (
      log.workout_title === logElement.dataset.workoutTitle &&
      normalizeExerciseHistoryName(log.exercise_name) === exerciseName
    ))
    .sort((left, right) => {
      const dateCompare = String(right.entry_date).localeCompare(String(left.entry_date));

      return dateCompare || Number(left.set_number || 1) - Number(right.set_number || 1);
    });
}

function parseCardioNotes(notes = "") {
  const text = String(notes || "");
  const caloriesMatch = text.match(/(?:^|\n)Calories:\s*(\d+(?:\.\d+)?)/i);
  const noteText = text
    .replace(/(?:^|\n)Calories:\s*\d+(?:\.\d+)?\.?/i, "")
    .trim();

  return {
    calories: caloriesMatch ? caloriesMatch[1] : "",
    notes: noteText
  };
}

function buildCardioNotes(calories, notes) {
  const parts = [];
  const caloriesText = String(calories || "").trim();
  const notesText = String(notes || "").trim();

  if (caloriesText) {
    parts.push(`Calories: ${caloriesText}`);
  }

  if (notesText) {
    parts.push(notesText);
  }

  return parts.join("\n");
}

function cardioDisplay(log) {
  const parts = [];

  if (log.weight_used !== null && log.weight_used !== undefined && log.weight_used !== "") {
    parts.push(`${log.weight_used} min`);
  }

  if (log.reps !== null && log.reps !== undefined && log.reps !== "") {
    parts.push(`${log.reps} mi`);
  }

  const parsedNotes = parseCardioNotes(log.notes);

  if (parsedNotes.calories) {
    parts.push(`${parsedNotes.calories} cal`);
  }

  return parts.join(" · ") || "Cardio saved";
}

function warmupDisplay(log) {
  const parts = [];

  if (log.weight_used !== null && log.weight_used !== undefined && log.weight_used !== "") {
    parts.push(`${log.weight_used} min`);
  }

  if (log.notes) {
    parts.push(log.notes);
  }

  return parts.join(" · ") || "Warm-up saved";
}

function exerciseNoteSummary(sets = []) {
  const notes = sets
    .map((set) => ({
      setNumber: set.set_number,
      note: String(set.notes || "").trim()
    }))
    .filter((set) => set.note);
  const uniqueNotes = Array.from(new Set(notes.map((set) => set.note)));

  if (uniqueNotes.length <= 1) {
    return uniqueNotes[0] || "";
  }

  return notes
    .map((set) => `${set.setNumber ? `Set ${set.setNumber}: ` : ""}${set.note}`)
    .join("  |  ");
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

function renderPreviousExerciseWeights(logElement, logs = logsForExerciseDisplay(logElement)) {
  updateSetHistoryPlaceholders(logElement, logs);
  const previous = logElement.querySelector("[data-previous-weights]");

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
        const setLabel = setNumberLabel(log.set_number, log.set_type);
        const typeLabel = normalizedSetType(log.set_type, log.set_number) === warmUpSetType ? "Warm-up" : "Set";

        return `${typeLabel} ${setLabel}: ${escapeHtml(log.weight_used)} lb${escapeHtml(reps)}`;
      }).join(", ")}</span>
    `).join("")}
  `;
}

function savedStrengthSetSpecs(selectedLogs, workingMinimum = 1) {
  const warmUps = selectedLogs
    .filter((log) => normalizedSetType(log.set_type, log.set_number) === warmUpSetType)
    .sort((a, b) => Number(a.set_number || 0) - Number(b.set_number || 0));
  const workingLogs = selectedLogs
    .filter((log) => normalizedSetType(log.set_type, log.set_number) !== warmUpSetType)
    .sort((a, b) => Number(a.set_number || 0) - Number(b.set_number || 0));
  const highestWorkingSet = workingLogs.reduce((max, log) => Math.max(max, Number(log.set_number || 0)), 0);
  const workingCount = Math.max(highestWorkingSet, Math.max(Number(workingMinimum) || 0, 0));
  const warmUpSpecs = warmUps.length > 0
    ? warmUps.map((log, index) => ({
      setNumber: Number(log.set_number) > warmUpSetNumberBase
        ? Number(log.set_number)
        : warmUpSetNumberBase + index + 1,
      setType: warmUpSetType
    }))
    : [{ setNumber: warmUpSetNumberBase + 1, setType: warmUpSetType }];

  return [
    ...warmUpSpecs,
    ...Array.from({ length: workingCount }, (_, index) => ({
      setNumber: index + 1,
      setType: workingSetType
    }))
  ];
}

function restoreStrengthSetRows(logElement, selectedLogs) {
  const rows = logElement?.querySelector("[data-set-rows]");

  if (!rows) {
    return;
  }

  const defaultReps = rows.querySelector("[data-set-reps]")?.dataset.defaultPlaceholder || "0";
  const workingMinimum = logElement.dataset.setTargetMode === "visible"
    ? 0
    : Math.max(Number(logElement.dataset.prescribedSets || 1), 1);
  const specs = savedStrengthSetSpecs(selectedLogs, workingMinimum);

  rows.innerHTML = specs
    .map(({ setNumber, setType }) => setRowMarkup(setNumber, defaultReps, setType))
    .join("");
}

function latestPreviousSetLogs(logs, selectedDate) {
  const previousDate = logs.reduce((latestDate, log) => {
    const entryDate = String(log.entry_date || "");

    return entryDate < selectedDate && entryDate > latestDate ? entryDate : latestDate;
  }, "");

  if (!previousDate) {
    return [];
  }

  return logs
    .filter((log) => log.entry_date === previousDate)
    .sort((left, right) => Number(left.set_number || 1) - Number(right.set_number || 1));
}

function heaviestPreviousSetLog(logs, selectedDate) {
  return logs.reduce((heaviestLog, log) => {
    const rawWeight = log.weight_used;
    const weight = Number(rawWeight);
    const isPreviousWorkingSet = String(log.entry_date || "") < selectedDate &&
      normalizedSetType(log.set_type, log.set_number) !== warmUpSetType;

    if (
      !isPreviousWorkingSet ||
      rawWeight === null ||
      rawWeight === undefined ||
      rawWeight === "" ||
      !Number.isFinite(weight)
    ) {
      return heaviestLog;
    }

    return !heaviestLog || weight > Number(heaviestLog.weight_used)
      ? log
      : heaviestLog;
  }, null);
}

function historyPlaceholder(value, fallback = "") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function updateSetHistoryPlaceholders(logElement, logs = logsForExerciseDisplay(logElement)) {
  const selectedDate = logElement?.querySelector("[data-log-date]")?.value || todayDate();
  const previousLogs = latestPreviousSetLogs(logs, selectedDate);
  const customHeaviestLog = logElement?.closest("[data-custom-exercise-card]")
    ? heaviestPreviousSetLog(logs, selectedDate)
    : null;

  logElement?.querySelectorAll("[data-set-row]").forEach((row, index) => {
    const setNumber = Number(row.dataset.setNumber || index + 1);
    const previousLog = customHeaviestLog ||
      previousLogs.find((log) => Number(log.set_number || 1) === setNumber) ||
      previousLogs[Math.min(index, Math.max(previousLogs.length - 1, 0))];
    const weightInput = row.querySelector("[data-set-weight]");
    const repsInput = row.querySelector("[data-set-reps]");

    if (weightInput) {
      weightInput.placeholder = historyPlaceholder(
        previousLog?.weight_used,
        weightInput.dataset.defaultPlaceholder || "0"
      );
    }

    if (repsInput) {
      repsInput.placeholder = historyPlaceholder(
        previousLog?.reps,
        repsInput.dataset.defaultPlaceholder || ""
      );
    }
  });
}

function updateExerciseLogField(logElement) {
  const dateInput = logElement.querySelector("[data-log-date]");
  const exerciseNameInput = exerciseNameInputForLog(logElement);
  const notesInput = logElement.querySelector("[data-log-notes]");
  const previous = logElement.querySelector("[data-previous-weights]");
  const card = logElement.closest(".workout-exercise-card");
  const progress = card?.matches(".superset-card")
    ? logElement.querySelector("[data-set-progress]")
    : card?.querySelector("[data-set-progress]");
  const logs = logsForExerciseDisplay(logElement);
  const selectedDate = dateInput?.value || todayDate();
  const selectedLogs = logs.filter((log) => log.entry_date === selectedDate);

  if (dateInput && !dateInput.value) {
    dateInput.value = todayDate();
  }

  if (logElement.dataset.warmupLog !== undefined) {
    const selectedLog = selectedLogs.find((log) => Number(log.set_number || 1) === 1);
    const durationInput = logElement.querySelector("[data-warmup-duration]");

    if (exerciseNameInput) {
      exerciseNameInput.value = selectedLog?.exercise_name || logElement.dataset.exerciseName || "Warm up";
    }

    if (durationInput) {
      durationInput.value = selectedLog?.weight_used ?? "";
    }

    if (notesInput) {
      notesInput.value = selectedLog?.notes || "";
    }

    if (previous) {
      const previousWarmups = logs
        .filter((log) => log.entry_date !== selectedDate)
        .slice(0, 4);

      previous.innerHTML = previousWarmups.length === 0
        ? "Previous: none"
        : `
          <strong>Previous</strong>
          ${previousWarmups.map((log) => `
            <span>${escapeHtml(formatLogDate(log.entry_date))} - ${escapeHtml(log.exercise_name || "Warm up")}: ${escapeHtml(warmupDisplay(log))}</span>
          `).join("")}
        `;
    }

    return;
  }

  if (logElement.dataset.cardioLog !== undefined) {
    const selectedLog = selectedLogs.find((log) => Number(log.set_number || 1) === 1);
    const durationInput = logElement.querySelector("[data-cardio-duration]");
    const distanceInput = logElement.querySelector("[data-cardio-distance]");
    const caloriesInput = logElement.querySelector("[data-cardio-calories]");
    const parsedNotes = parseCardioNotes(selectedLog?.notes || "");

    if (exerciseNameInput) {
      exerciseNameInput.value = selectedLog?.exercise_name || logElement.dataset.exerciseName || "Cardio";
    }

    if (durationInput) {
      durationInput.value = selectedLog?.weight_used ?? "";
    }

    if (distanceInput) {
      distanceInput.value = selectedLog?.reps ?? "";
    }

    if (caloriesInput) {
      caloriesInput.value = parsedNotes.calories;
    }

    if (notesInput) {
      notesInput.value = parsedNotes.notes;
    }

    if (previous) {
      const previousCardio = logs
        .filter((log) => log.entry_date !== selectedDate)
        .slice(0, 4);

      previous.innerHTML = previousCardio.length === 0
        ? "Previous: none"
        : `
          <strong>Previous</strong>
          ${previousCardio.map((log) => `
            <span>${escapeHtml(formatLogDate(log.entry_date))} - ${escapeHtml(log.exercise_name || "Cardio")}: ${escapeHtml(cardioDisplay(log))}</span>
          `).join("")}
        `;
    }

    return;
  }

  restoreStrengthSetRows(logElement, selectedLogs);

  logElement.querySelectorAll("[data-set-row]").forEach((row) => {
    const setNumber = Number(row.dataset.setNumber || 1);
    const selectedLog = selectedLogs.find((log) => Number(log.set_number || 1) === setNumber);
    const weightInput = row.querySelector("[data-set-weight]");
    const repsInput = row.querySelector("[data-set-reps]");
    const savedRir = Number(selectedLog?.effort_value);

    if (weightInput) {
      weightInput.value = selectedLog?.weight_used ?? "";
    }

    if (repsInput) {
      repsInput.value = selectedLog?.reps ?? "";
    }

    if (selectedLog?.effort_scale === "rir" && Number.isInteger(savedRir) && savedRir >= 0 && savedRir <= 4) {
      row.dataset.repsInReserve = String(savedRir);
    } else {
      delete row.dataset.repsInReserve;
    }

    renderSetRirValue(row);
  });

  if (notesInput) {
    notesInput.value = selectedLogs.find((log) => log.notes)?.notes || "";
  }

  renderExerciseNotesState(logElement);

  if (exerciseNameInput) {
    const loggedExerciseName = selectedLogs.find((log) => log.exercise_name)?.exercise_name || "";
    const nextName = loggedExerciseName || logElement.dataset.exerciseName || "";
    exerciseNameInput.value = nextName;
    syncExerciseNamePreview(logElement, nextName);
  }

  updateVisibleSetProgress(logElement);
  renderPreviousExerciseWeights(logElement, logs);
}

function populateTrainingLogs(logs) {
  trainingLogs = Array.isArray(logs) ? logs : [];

  if (currentProgram) {
    renderClientWorkoutTabs(Array.isArray(currentProgram.workouts) ? currentProgram.workouts : []);
  }

  document.querySelectorAll(".client-workout-panel").forEach((panel) => {
    syncWorkoutPanelDate(panel, panel.querySelector("[data-workout-date]")?.value || todayDate(), false);
  });

  document.querySelectorAll("[data-exercise-log]").forEach((logElement) => {
    updateExerciseLogField(logElement);
  });

  restoreCustomWorkoutDrafts();
  renderClientTrainingLogs();
  renderClientHomeSummary();
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
    const workoutDate = event.target.closest("[data-workout-date]");

    if (workoutDate) {
      const panel = workoutDate.closest(".client-workout-panel");
      syncWorkoutPanelDate(panel, workoutDate.value || todayDate());
      persistCustomWorkoutDraftFromPanel(panel);
      return;
    }

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

function sortedFoodLogDayGroups(logs = []) {
  const grouped = logs.reduce((groups, log) => {
    const date = log.entry_date || "";

    if (!groups.has(date)) {
      groups.set(date, []);
    }

    groups.get(date).push(log);
    return groups;
  }, new Map());

  return Array.from(grouped.entries())
    .sort(([left], [right]) => String(right).localeCompare(String(left)))
    .map(([date, entries]) => ({
      entry_date: date,
      entries: [...entries].sort((a, b) => {
        const left = [
          b.entry_date || "",
          b.created_at || "",
          b.meal || "",
          b.food_name || ""
        ].join("::");
        const right = [
          a.entry_date || "",
          a.created_at || "",
          a.meal || "",
          a.food_name || ""
        ].join("::");

        return left.localeCompare(right);
      })
    }));
}

function nutritionLogHistorySections(logs = []) {
  return sortedFoodLogDayGroups(logs).map((day) => {
    const totals = foodLogTotals(day.entries);
    const macroSummary = [
      `${foodLogNumberLabel(totals.calories)} cal`,
      `${foodLogNumberLabel(totals.protein, "g")} protein`,
      `${foodLogNumberLabel(totals.carbs, "g")} carbs`,
      `${foodLogNumberLabel(totals.fat, "g")} fat`
    ].join(" · ");

    return {
      sort_key: `${day.entry_date || ""}::nutrition`,
      html: `
        <section class="training-log-workout-group training-log-nutrition-group">
          <div class="training-log-workout-heading">
            <strong>${escapeHtml(formatLogDate(day.entry_date))}</strong>
            <span>${escapeHtml(`Nutrition · ${macroSummary}`)}</span>
          </div>
          <div class="training-log-exercise-list">
            ${day.entries.map((log) => `
              <article class="training-log-row training-log-row-compact training-log-row-nested">
                <div class="training-log-row-main">
                  <span>${escapeHtml(log.food_name || "Food")}</span>
                  <em>${escapeHtml([log.meal, log.serving].filter(Boolean).join(" · ") || "Food entry")}</em>
                  <small class="training-log-notes">${escapeHtml([
                    `${foodLogNumberLabel(log.calories)} cal`,
                    `${foodLogNumberLabel(log.protein, "g")} protein`,
                    `${foodLogNumberLabel(log.carbs, "g")} carbs`,
                    `${foodLogNumberLabel(log.fat, "g")} fat`
                  ].join(" · "))}</small>
                  ${log.notes ? `<small class="training-log-notes"><strong>Notes:</strong> ${escapeHtml(log.notes)}</small>` : ""}
                </div>
              </article>
            `).join("")}
          </div>
        </section>
      `
    };
  });
}

function renderClientTrainingLogs() {
  renderClientExerciseProgress(trainingLogs);
  const history = document.getElementById("client-training-log-history");
  const count = document.getElementById("client-logs-count");

  if (!history) {
    return;
  }

  const filteredLogs = trainingLogs.filter((log) => {
    const matchesDate = !clientTrainingLogDateFilter || String(log.entry_date || "") === clientTrainingLogDateFilter;

    return matchesDate && clientTrainingLogMatchesSearch(log, clientTrainingLogSearchFilter);
  });
  const filteredFoodLogs = foodLogs.filter((log) => {
    const matchesDate = !clientTrainingLogDateFilter || String(log.entry_date || "") === clientTrainingLogDateFilter;

    return matchesDate && clientFoodLogMatchesSearch(log, clientTrainingLogSearchFilter);
  });

  if (filteredLogs.length === 0 && filteredFoodLogs.length === 0) {
    const hasFilter = clientTrainingLogDateFilter || clientTrainingLogSearchFilter;

    if (count) {
      count.textContent = hasFilter ? "No matching logs" : "No logs yet";
    }

    history.innerHTML = hasFilter
      ? '<p class="empty-state">No workout or nutrition logs match that search.</p>'
      : '<p class="empty-state">No workout or nutrition logs yet.</p>';
    return;
  }

  const workoutGroups = new Map();

  filteredLogs.forEach((log) => {
    const workoutKey = workoutFeedbackSessionId(log) || [
      log.entry_date || "",
      log.workout_title || "Workout"
    ].join("::");
    const exerciseCode = String(log.exercise_code || "");
    const supersetMatch = exerciseCode.match(/^([A-Za-z]+)/);
    const supersetKey = exerciseCode === warmupExerciseCode
      ? "WARMUP"
      : exerciseCode === cardioExerciseCode
        ? "CARDIO"
        : supersetMatch ? supersetMatch[1].toUpperCase() : "OTHER";

    if (!workoutGroups.has(workoutKey)) {
      workoutGroups.set(workoutKey, {
        entry_date: log.entry_date || "",
        workout_title: log.workout_title || "Workout",
        workout_duration_seconds: null,
        workout_difficulty: null,
        completed_at: "",
        supersets: new Map()
      });
    }

    const workoutGroup = workoutGroups.get(workoutKey);
    const hasWorkoutDuration = log.workout_duration_seconds !== null &&
      log.workout_duration_seconds !== undefined &&
      log.workout_duration_seconds !== "";
    const durationSeconds = Number(log.workout_duration_seconds);

    if (hasWorkoutDuration && Number.isFinite(durationSeconds) && durationSeconds >= 0) {
      workoutGroup.workout_duration_seconds = Math.max(
        Number(workoutGroup.workout_duration_seconds) || 0,
        durationSeconds
      );
    }
    if (log.completed_at) {
      workoutGroup.completed_at = String(log.completed_at);
    }
    const difficultyRating = workoutDifficultyForLog(log);
    if (difficultyRating) {
      workoutGroup.workout_difficulty = difficultyRating;
    }

    if (!workoutGroup.supersets.has(supersetKey)) {
      workoutGroup.supersets.set(supersetKey, {
        key: supersetKey,
        exercises: new Map()
      });
    }

    const supersetGroup = workoutGroup.supersets.get(supersetKey);
    const exerciseKey = [
      log.exercise_code || "",
      log.exercise_name || ""
    ].join("::");

    if (!supersetGroup.exercises.has(exerciseKey)) {
      supersetGroup.exercises.set(exerciseKey, {
        exercise_code: log.exercise_code || "",
        exercise_name: log.exercise_name || "",
        sets: []
      });
    }

    supersetGroup.exercises.get(exerciseKey).sets.push({
      set_number: log.set_number,
      set_type: log.set_type,
      weight_used: log.weight_used,
      reps: log.reps,
      notes: log.notes
    });
  });

  const workoutSections = Array.from(workoutGroups.values()).sort((a, b) => {
    const left = `${b.entry_date} ${b.workout_title}`;
    const right = `${a.entry_date} ${a.workout_title}`;
    return left.localeCompare(right);
  });

  if (count) {
    const nutritionDays = sortedFoodLogDayGroups(filteredFoodLogs).length;
    const sessionLabel = `${workoutSections.length} ${workoutSections.length === 1 ? "session" : "sessions"}`;
    const nutritionLabel = `${nutritionDays} nutrition ${nutritionDays === 1 ? "day" : "days"}`;

    count.textContent = filteredFoodLogs.length
      ? `${sessionLabel} · ${nutritionLabel}`
      : sessionLabel;
  }

  const workoutHistorySections = workoutSections.map((workout) => {
    const supersets = Array.from(workout.supersets.values()).sort((a, b) => a.key.localeCompare(b.key));
    const workoutDuration = workoutHistoryDurationLabel(workout.workout_duration_seconds);
    const workoutDifficulty = workoutHistoryDifficultyLabel(workout.workout_difficulty);
    const workoutHeading = [workout.workout_title, workoutDuration, workoutDifficulty].filter(Boolean).join(" · ");

    return {
      sort_key: `${workout.entry_date || ""}::workout::${workout.workout_title || ""}`,
      html: `
        <section class="training-log-workout-group">
          <div class="training-log-workout-heading">
            <strong>${escapeHtml(formatLogDate(workout.entry_date))}</strong>
            <span>${escapeHtml(workoutHeading)}</span>
          </div>
          <div class="training-log-superset-list">
            ${supersets.map((superset) => {
              const exercises = Array.from(superset.exercises.values()).sort((a, b) => {
                const left = `${a.exercise_code} ${a.exercise_name}`;
                const right = `${b.exercise_code} ${b.exercise_name}`;
                return left.localeCompare(right);
              });

              return `
                <section class="training-log-superset-group">
                  <div class="training-log-superset-heading">${escapeHtml(
                    superset.key === "WARMUP"
                      ? "Warm up"
                      : superset.key === "CARDIO"
                        ? "Cardio"
                        : superset.key === "OTHER" ? "Other" : `Superset ${superset.key}`
                  )}</div>
                  <div class="training-log-exercise-list">
                    ${exercises.map((entry) => {
                      const noteSummary = exerciseNoteSummary(entry.sets);
                      const setSummary = entry.exercise_code === warmupExerciseCode
                        ? entry.sets
                          .sort((a, b) => Number(a.set_number || 0) - Number(b.set_number || 0))
                          .map((set) => warmupDisplay(set))
                          .filter(Boolean)
                          .join("  |  ")
                        : entry.exercise_code === cardioExerciseCode
                        ? entry.sets
                          .sort((a, b) => Number(a.set_number || 0) - Number(b.set_number || 0))
                          .map((set) => cardioDisplay(set))
                          .filter(Boolean)
                          .join("  |  ")
                        : entry.sets
                        .sort((a, b) => {
                          const leftWarmUp = normalizedSetType(a.set_type, a.set_number) === warmUpSetType;
                          const rightWarmUp = normalizedSetType(b.set_type, b.set_number) === warmUpSetType;
                          if (leftWarmUp !== rightWarmUp) {
                            return leftWarmUp ? -1 : 1;
                          }
                          return Number(a.set_number || 0) - Number(b.set_number || 0);
                        })
                        .map((set) => {
                          const parts = [];

                          if (set.set_number) {
                            const isWarmUpSet = normalizedSetType(set.set_type, set.set_number) === warmUpSetType;
                            parts.push(isWarmUpSet
                              ? `Warm-up ${setNumberLabel(set.set_number, set.set_type)}`
                              : `Set ${setNumberLabel(set.set_number, set.set_type)}`);
                          }

                          if (set.weight_used !== null && set.weight_used !== undefined && set.weight_used !== "") {
                            parts.push(`${set.weight_used} lb${set.reps ? ` x ${set.reps}` : ""}`);
                          } else if (set.reps) {
                            parts.push(`${set.reps} reps`);
                          }

                          return parts.join(": ");
                        })
                        .filter(Boolean)
                        .join("  |  ");

                      return `
                        <article class="training-log-row training-log-row-compact training-log-row-nested">
                          <div class="training-log-row-main">
                            <span>${escapeHtml(
                              entry.exercise_code === warmupExerciseCode || entry.exercise_code === cardioExerciseCode
                                ? entry.exercise_name
                                : `${entry.exercise_code} ${entry.exercise_name}`
                            )}</span>
                            <em>${escapeHtml(setSummary || "Sets saved")}</em>
                            ${noteSummary ? `<small class="training-log-notes"><strong>Notes:</strong> ${escapeHtml(noteSummary)}</small>` : ""}
                          </div>
                        </article>
                      `;
                    }).join("")}
                  </div>
                </section>
              `;
            }).join("")}
          </div>
        </section>
      `
    };
  });
  const nutritionHistorySections = nutritionLogHistorySections(filteredFoodLogs);

  history.innerHTML = [...workoutHistorySections, ...nutritionHistorySections]
    .sort((a, b) => b.sort_key.localeCompare(a.sort_key))
    .map((section) => section.html)
    .join("");
}

function csvCell(value) {
  const text = String(value ?? "");

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function csvSectionForLog(log) {
  const code = String(log.exercise_code || "");

  if (code === warmupExerciseCode) {
    return "Warm up";
  }

  if (code === cardioExerciseCode) {
    return "Cardio";
  }

  const supersetMatch = code.match(/^([A-Za-z]+)/);

  return supersetMatch ? `Superset ${supersetMatch[1].toUpperCase()}` : "Other";
}

function sortedTrainingLogsForExport(logs = []) {
  return [...logs].sort((a, b) => {
    const left = [
      b.entry_date || "",
      b.workout_title || "",
      b.exercise_code || "",
      String(b.exercise_name || ""),
      String(999 - Number(b.set_number || 0)).padStart(3, "0")
    ].join("::");
    const right = [
      a.entry_date || "",
      a.workout_title || "",
      a.exercise_code || "",
      String(a.exercise_name || ""),
      String(999 - Number(a.set_number || 0)).padStart(3, "0")
    ].join("::");

    return left.localeCompare(right);
  });
}

function workoutHistoryCsv(logs = []) {
  const headers = [
    "Date",
    "Workout",
    "Section",
    "Exercise code",
    "Exercise",
    "Set",
    "Set type",
    "Weight (lbs)",
    "Reps",
    "Workout time (seconds)",
    "Workout difficulty (1-5)",
    "Workout finished at",
    "Duration (min)",
    "Distance",
    "Notes"
  ];
  const rows = sortedTrainingLogsForExport(logs).map((log) => {
    const isWarmup = log.exercise_code === warmupExerciseCode;
    const isCardio = log.exercise_code === cardioExerciseCode;

    return [
      log.entry_date || "",
      log.workout_title || "",
      csvSectionForLog(log),
      log.exercise_code || "",
      log.exercise_name || "",
      setNumberLabel(log.set_number, log.set_type),
      isWarmup || isCardio
        ? "Activity"
        : normalizedSetType(log.set_type, log.set_number) === warmUpSetType ? "Warm-up" : "Working",
      isWarmup || isCardio ? "" : log.weight_used ?? "",
      isWarmup || isCardio ? "" : log.reps ?? "",
      log.workout_duration_seconds ?? "",
      workoutDifficultyForLog(log) ?? "",
      log.completed_at || "",
      isWarmup || isCardio ? log.weight_used ?? "" : "",
      isCardio ? log.reps ?? "" : "",
      log.notes || ""
    ];
  });

  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
}

function clientWorkoutHistoryFileName() {
  const clientName = currentProgram?.client_name || activeClientEmail || "client";
  const safeName = String(clientName)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "client";

  return `${safeName}-workout-history-${todayDate()}.csv`;
}

function handleClientWorkoutHistoryDownload() {
  const button = document.getElementById("download-client-workout-history");
  const status = document.getElementById("client-workout-history-download-status");

  if (!button) {
    return;
  }

  button.addEventListener("click", () => {
    if (!trainingLogs.length) {
      if (status) {
        status.textContent = "No workout history to download yet.";
      }
      return;
    }

    const csv = workoutHistoryCsv(trainingLogs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = clientWorkoutHistoryFileName();
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);

    if (status) {
      status.textContent = "Workout history CSV downloaded.";
    }
  });
}

function handleClientTrainingLogDateFilter() {
  const input = document.getElementById("client-training-log-date-filter");
  const searchInput = document.getElementById("client-training-log-search-filter");
  const clearButton = document.getElementById("clear-client-training-log-date-filter");

  if (!input || !searchInput || !clearButton) {
    return;
  }

  input.addEventListener("input", () => {
    clientTrainingLogDateFilter = input.value || "";
    renderClientTrainingLogs();
  });

  searchInput.addEventListener("input", () => {
    clientTrainingLogSearchFilter = searchInput.value || "";
    renderClientTrainingLogs();
  });

  clearButton.addEventListener("click", () => {
    clientTrainingLogDateFilter = "";
    clientTrainingLogSearchFilter = "";
    input.value = "";
    searchInput.value = "";
    renderClientTrainingLogs();
  });
}

function addSetRow(logElement, options = {}) {
  const rows = logElement.querySelector("[data-set-rows]");

  if (!rows) {
    return;
  }

  const workingRows = Array.from(rows.querySelectorAll("[data-set-row]"))
    .filter((row) => setTypeForRow(row) !== warmUpSetType);
  const lastRow = workingRows[workingRows.length - 1] || rows.querySelector("[data-set-row]:last-child");
  const nextSet = workingRows.length + 1;
  const previousWeight = lastRow?.querySelector("[data-set-weight]")?.value || "";
  const previousReps = lastRow?.querySelector("[data-set-reps]")?.value || "";
  const defaultReps = lastRow?.querySelector("[data-set-reps]")?.dataset.defaultPlaceholder || "0";

  rows.insertAdjacentHTML("beforeend", setRowMarkup(nextSet, defaultReps, workingSetType));

  const nextRow = rows.querySelector("[data-set-row]:last-child");
  const nextWeightInput = nextRow?.querySelector("[data-set-weight]");
  const nextRepsInput = nextRow?.querySelector("[data-set-reps]");

  if (nextWeightInput && previousWeight) {
    nextWeightInput.value = previousWeight;
  }

  if (nextRepsInput && previousReps) {
    nextRepsInput.value = previousReps;
  }

  renumberSetRows(logElement);
  updateSetHistoryPlaceholders(logElement);
  syncVisibleSetTarget(logElement);
  updateVisibleSetProgress(logElement);
  if (!options.skipDraft) {
    persistCustomWorkoutDraftForElement(logElement);
  }
}

function updateSetTypeFromLabel(row) {
  const labelInput = row?.querySelector("[data-set-label]");
  const normalizedLabel = String(labelInput?.value || "").trim().toUpperCase();
  const wasWarmUp = setTypeForRow(row) === warmUpSetType;

  if (labelInput) {
    labelInput.value = normalizedLabel.replace(/[^W0-9]/g, "").slice(0, 3);
  }
  row.dataset.setType = normalizedLabel.startsWith("W") || (!normalizedLabel && wasWarmUp)
    ? warmUpSetType
    : workingSetType;
}

function renumberSetRows(logElement) {
  let warmUpIndex = 0;
  let workingIndex = 0;
  const rowsContainer = logElement?.querySelector("[data-set-rows]");
  const currentRows = Array.from(rowsContainer?.querySelectorAll("[data-set-row]") || []);

  currentRows.forEach(updateSetTypeFromLabel);
  const orderedRows = [
    ...currentRows.filter((row) => setTypeForRow(row) === warmUpSetType),
    ...currentRows.filter((row) => setTypeForRow(row) !== warmUpSetType)
  ];

  orderedRows.forEach((row) => rowsContainer?.appendChild(row));

  orderedRows.forEach((row) => {
    const setType = setTypeForRow(row);
    const isWarmUp = setType === warmUpSetType;
    const setNumber = isWarmUp
      ? warmUpSetNumberBase + (warmUpIndex += 1)
      : (workingIndex += 1);
    row.dataset.setNumber = String(setNumber);
    row.dataset.setType = setType;
    row.classList.toggle("is-warm-up", isWarmUp);
    const labelInput = row.querySelector("[data-set-label]");
    const setLabel = isWarmUp ? "" : String(workingIndex);

    if (labelInput) {
      labelInput.value = setLabel;
      labelInput.setAttribute("aria-label", isWarmUp ? `Warm-up set ${warmUpIndex} label` : `Set label ${setLabel}`);
    }

    const friendlyName = isWarmUp ? `warm-up set ${warmUpIndex}` : `set ${workingIndex}`;
    row.querySelector("[data-set-rir]")?.setAttribute("aria-label", `Choose reps in reserve for ${friendlyName}`);
    row.querySelector("[data-set-rest]")?.setAttribute("aria-label", `Start rest timer after ${friendlyName}`);
    renderSetRirValue(row);
  });
}

function ensureSetRows(logElement, count) {
  const rows = logElement?.querySelector("[data-set-rows]");

  if (!rows) {
    return;
  }

  const existingCount = rows.querySelectorAll("[data-set-row]").length;

  if (existingCount >= count) {
    return;
  }

  const defaultReps = rows.querySelector("[data-set-reps]")?.dataset.defaultPlaceholder || "0";

  for (let index = existingCount; index < count; index += 1) {
    rows.insertAdjacentHTML("beforeend", setRowMarkup(index + 1, defaultReps, workingSetType));
  }
  renumberSetRows(logElement);
}

function visibleSetTarget(logElement) {
  const rowCount = Array.from(logElement?.querySelectorAll("[data-set-row]") || [])
    .filter((row) => setTypeForRow(row) !== warmUpSetType)
    .length;
  const prescribedSets = Number(logElement?.dataset.prescribedSets || 0);

  return Math.max(rowCount, prescribedSets);
}

function syncVisibleSetTarget(logElement) {
  const rowCount = Array.from(logElement?.querySelectorAll("[data-set-row]") || [])
    .filter((row) => setTypeForRow(row) !== warmUpSetType)
    .length;

  if (logElement?.dataset.setTargetMode === "visible" && rowCount > 0) {
    logElement.dataset.prescribedSets = String(rowCount);
  }
}

function updateVisibleSetProgress(logElement) {
  const card = logElement?.closest(".workout-exercise-card");
  const progress = card?.matches(".superset-card")
    ? logElement?.querySelector("[data-set-progress]")
    : card?.querySelector("[data-set-progress]");
  const completedSets = filledSetCount(logElement);
  const setTarget = visibleSetTarget(logElement);

  if (progress) {
    progress.textContent = `${completedSets} / ${setTarget || completedSets || 0} working sets completed`;
  }
}

function removeLocalTrainingLog(row) {
  const index = trainingLogs.findIndex((log) => (
    String(log.client_email).toLowerCase() === String(row.client_email).toLowerCase() &&
    log.entry_date === row.entry_date &&
    log.workout_title === row.workout_title &&
    log.exercise_code === row.exercise_code &&
    Number(log.set_number || 1) === Number(row.set_number || 1)
  ));

  if (index >= 0) {
    trainingLogs.splice(index, 1);
  }
}

async function deleteRemovedTrainingLogRows(logElements) {
  let deletedCount = 0;

  for (const logElement of logElements) {
    const dateInput = logElement?.querySelector("[data-log-date]");
    const entryDate = dateInput?.value || todayDate();
    const workoutTitle = logElement?.dataset.workoutTitle || "";
    const exerciseCode = logElement?.dataset.exerciseCode || "";

    if (!workoutTitle || !exerciseCode || !entryDate) {
      continue;
    }

    const currentSetNumbers = new Set(
      rowsForTrainingLog(logElement).map((row) => Number(row.set_number || 1))
    );

    const existingRows = trainingLogs.filter((log) => (
      String(log.client_email).toLowerCase() === String(activeClientEmail).toLowerCase() &&
      log.entry_date === entryDate &&
      log.workout_title === workoutTitle &&
      log.exercise_code === exerciseCode
    ));

    const missingSetNumbers = existingRows
      .map((log) => Number(log.set_number || 1))
      .filter((setNumber) => !currentSetNumbers.has(setNumber));

    if (missingSetNumbers.length === 0) {
      continue;
    }

    const { error } = await supabaseClient
      .from("client_workout_logs")
      .delete()
      .eq("client_email", activeClientEmail)
      .eq("entry_date", entryDate)
      .eq("workout_title", workoutTitle)
      .eq("exercise_code", exerciseCode)
      .in("set_number", missingSetNumbers);

    if (error) {
      return { deletedCount, error };
    }

    existingRows
      .filter((row) => missingSetNumbers.includes(Number(row.set_number || 1)))
      .forEach((row) => removeLocalTrainingLog(row));

    deletedCount += missingSetNumbers.length;
  }

  return { deletedCount, error: null };
}

function setClientDashboardTab(tabName) {
  const nextTab = tabName || "home";
  const tabs = document.querySelectorAll("[data-client-dashboard-tab]");
  const panels = document.querySelectorAll("[data-client-dashboard-panel]");

  activeClientDashboardTab = nextTab;
  tabs.forEach((button) => {
    const isActive = button.dataset.clientDashboardTab === nextTab;

    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  panels.forEach((panel) => {
    const isActive = panel.dataset.clientDashboardPanel === nextTab;

    panel.hidden = !isActive;
  });
}

function handleClientSummaryActions() {
  document.addEventListener("click", async (event) => {
    const sessionsButton = event.target.closest("#client-summary-sessions-button");
    const summaryTabButton = event.target.closest("[data-client-summary-go-tab]");
    const resetButton = event.target.closest("#client-dashboard-reset-password-button");

    if (sessionsButton || summaryTabButton) {
      const tabName = summaryTabButton?.dataset.clientSummaryGoTab || "sessions";
      const panel = document.querySelector(`[data-client-dashboard-panel="${tabName}"]`);

      if (tabName === "workouts") {
        startWorkoutElapsedTimer(
          document.getElementById("client-home-workout-title")?.textContent || activeWorkoutElapsedTitle()
        );
      }
      setClientDashboardTab(tabName);
      panel?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (!resetButton) {
      return;
    }

    const status = document.getElementById("client-dashboard-reset-status");
    const email = String(activeClientEmail || currentProgram?.client_email || "").trim().toLowerCase();

    if (!supabaseClient || !email) {
      if (status) {
        status.textContent = "Password reset is not connected yet.";
      }
      return;
    }

    resetButton.disabled = true;

    if (status) {
      status.textContent = "Sending reset link...";
    }

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: passwordResetRedirectUrl()
    });

    if (error) {
      if (status) {
        status.textContent = error.message;
      }
      resetButton.disabled = false;
      return;
    }

    if (status) {
      status.textContent = "Password reset link sent.";
    }

    resetButton.disabled = false;
  });
}

async function saveClientMetrics() {
  if (!supabaseClient || !currentProgram?.id) {
    return { error: new Error("Client profile is not connected yet.") };
  }

  const metrics = document.getElementById("summary-metrics");

  if (!metrics) {
    return { error: new Error("Profile fields are not available.") };
  }

  const payload = {
    height: metrics.querySelector('[name="height"]')?.value.trim() || "Not set",
    starting_weight: metrics.querySelector('[name="starting_weight"]')?.value.trim() || "Not set",
    starting_bodyfat: metrics.querySelector('[name="starting_bodyfat"]')?.value.trim() || "Not set"
  };

  const { data, error } = await supabaseClient
    .from("client_programs")
    .update(payload)
    .eq("id", currentProgram.id)
    .select("*")
    .single();

  if (error) {
    return { error };
  }

  currentProgram = data;
  renderMetrics(currentProgram);
  return { data };
}

function handleClientMetricSave() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("#save-client-metrics-button");

    if (!button) {
      return;
    }

    const status = document.getElementById("client-metrics-status");
    button.disabled = true;

    if (status) {
      status.textContent = "Saving...";
    }

    const { error } = await saveClientMetrics();

    if (error) {
      if (status) {
        status.textContent = error.message || "Could not save yet.";
      }
      button.disabled = false;
      return;
    }

    const nextStatus = document.getElementById("client-metrics-status");
    const nextButton = document.getElementById("save-client-metrics-button");

    if (nextStatus) {
      nextStatus.textContent = "Saved.";
    }
    if (nextButton) {
      nextButton.disabled = false;
    }
  });
}

function handleClientProgressHistorySelect() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-client-progress-id]");

    if (!button) {
      return;
    }

    const entry = progressEntries.find((item) => String(item.id) === button.dataset.clientProgressId);

    if (!entry) {
      return;
    }

    fillClientProgressForm(entry);
    setText("#client-progress-save-status", "Editing selected check-in.");
  });
}

function handleClientProgressSave() {
  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("#client-home-mood-form");

    if (!form) {
      return;
    }

    event.preventDefault();

    if (!supabaseClient) {
      setText("#client-home-mood-status", "Client portal is not connected.");
      return;
    }

    const email = normalizeClientEmail(activeClientEmail || currentProgram?.client_email);

    if (!email) {
      setText("#client-home-mood-status", "Client profile is not loaded yet.");
      return;
    }

    const note = homeMoodNote(form);

    if (!note) {
      setText("#client-home-mood-status", "Choose a mood, energy level, body feeling, or add a quick note.");
      return;
    }

    const button = document.getElementById("client-home-save-mood-button");

    if (button) {
      button.disabled = true;
    }

    setText("#client-home-mood-status", "Saving mood check-in...");

    const entryDate = todayDate();
    const existing = progressEntries.find((entry) => entry.entry_date === entryDate) || {};
    const payload = {
      client_email: email,
      entry_date: entryDate,
      bodyweight: existing.bodyweight ?? null,
      bodyfat: existing.bodyfat ?? null,
      muscle_mass: existing.muscle_mass ?? null,
      measurements: progressMeasurements(existing),
      goal_note: note
    };
    const { error } = await withTimeout(
      supabaseClient
        .from("client_progress")
        .upsert(payload, { onConflict: "client_email,entry_date" }),
      "Mood check-in save timed out."
    );

    if (error) {
      setText("#client-home-mood-status", error.message || "Could not save mood check-in.");

      if (button) {
        button.disabled = false;
      }

      return;
    }

    const { data, error: loadError } = await withTimeout(
      supabaseClient
        .from("client_progress")
        .select("*")
        .ilike("client_email", email)
        .order("entry_date", { ascending: true }),
      "Mood check-in reload timed out."
    );

    if (loadError) {
      setText("#client-home-mood-status", "Mood saved. Refresh to reload it.");

      if (button) {
        button.disabled = false;
      }

      return;
    }

    renderProgress(data || []);
    form.reset();
    setText("#client-home-mood-status", "Mood check-in saved for today.");

    if (button) {
      button.disabled = false;
    }
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("#client-checkin-form");

    if (!form) {
      return;
    }

    event.preventDefault();

    if (!supabaseClient) {
      setText("#client-progress-save-status", "Client portal is not connected.");
      return;
    }

    const email = normalizeClientEmail(activeClientEmail || currentProgram?.client_email);

    if (!email) {
      setText("#client-progress-save-status", "Client profile is not loaded yet.");
      return;
    }

    const button = document.getElementById("client-save-progress-button");

    if (button) {
      button.disabled = true;
    }

    setText("#client-progress-save-status", "Saving check-in...");

    const payload = clientProgressPayload(form, email);
    const { error } = await withTimeout(
      supabaseClient
        .from("client_progress")
        .upsert(payload, { onConflict: "client_email,entry_date" }),
      "Progress save timed out."
    );

    if (error) {
      setText("#client-progress-save-status", error.message || "Could not save check-in.");
      if (button) {
        button.disabled = false;
      }
      return;
    }

    const { data, error: loadError } = await withTimeout(
      supabaseClient
        .from("client_progress")
        .select("*")
        .ilike("client_email", email)
        .order("entry_date", { ascending: true }),
      "Progress reload timed out."
    );

    if (loadError) {
      setText("#client-progress-save-status", "Check-in saved. Refresh to reload history.");
      if (button) {
        button.disabled = false;
      }
      return;
    }

    renderProgress(data || []);
    setText("#client-progress-save-status", "Measurements saved. They are now available in the iOS app and Coach Admin.");

    if (button) {
      button.disabled = false;
    }
  });
}

function clientNutritionFormValues() {
  const setup = document.getElementById("client-nutrition-setup");

  if (!setup) {
    return null;
  }

  return {
    goal: setup.querySelector('[name="nutrition_goal"]')?.value || "fat_loss",
    age: setup.querySelector('[name="nutrition_age"]')?.value.trim() || "",
    sex: setup.querySelector('[name="nutrition_sex"]')?.value || "",
    height: setup.querySelector('[name="nutrition_height"]')?.value.trim() || "",
    current_weight: setup.querySelector('[name="nutrition_weight"]')?.value.trim() || "",
    workouts_per_week: setup.querySelector('[name="nutrition_workouts"]')?.value || "0",
    daily_movement: setup.querySelector('[name="nutrition_movement"]')?.value || "mixed",
    training_intensity: setup.querySelector('[name="nutrition_intensity"]')?.value || "moderate"
  };
}

function clientNutritionTargetValues(options = {}) {
  const targets = document.getElementById("client-nutrition-targets");

  if (!targets) {
    return {};
  }

  const targetValue = (name) => {
    const input = targets.querySelector(`[name="${name}"]`);
    const value = input?.value.trim() || "";

    if (options.onlyChanged && value === (input?.dataset.defaultValue || "")) {
      return "";
    }

    return value;
  };

  return {
    calories: targetValue("client_nutrition_calories"),
    protein: targetValue("client_nutrition_protein"),
    carbs: targetValue("client_nutrition_carbs"),
    fat: targetValue("client_nutrition_fat")
  };
}

function manualNutritionPlan(values) {
  const existing = nutritionPlanFromProgram(currentProgram);

  return {
    ...existing,
    guide: existing.guide || "Review these targets with Benjamin and adjust based on energy, hunger, performance, and progress.",
    source: "client_manual",
    goal: values.goal,
    sex: values.sex,
    age: values.age,
    height: values.height,
    current_weight: values.current_weight,
    workouts_per_week: values.workouts_per_week,
    daily_movement: values.daily_movement,
    training_intensity: values.training_intensity,
    updated_at: new Date().toISOString()
  };
}

async function saveClientNutritionPlan() {
  if (!supabaseClient || !currentProgram?.id) {
    return { error: new Error("Nutrition setup is not connected yet.") };
  }

  const values = clientNutritionFormValues();

  if (!values) {
    return { error: new Error("Nutrition fields are not available.") };
  }

  const targetValues = clientNutritionTargetValues();
  const changedTargetValues = clientNutritionTargetValues({ onlyChanged: true });
  const hasTargetValues = Object.values(targetValues).some(Boolean);
  const hasChangedTargetValues = Object.values(changedTargetValues).some(Boolean);
  const { plan, error: calculationError } = calculateNutritionPlan(values);

  if (calculationError && !hasTargetValues) {
    return { error: calculationError };
  }

  const basePlan = calculationError ? manualNutritionPlan(values) : plan;
  const overrideValues = calculationError ? targetValues : changedTargetValues;
  const editablePlan = {
    ...basePlan,
    calories: overrideValues.calories || basePlan.calories,
    protein: overrideValues.protein || basePlan.protein,
    carbs: overrideValues.carbs || basePlan.carbs,
    fat: overrideValues.fat || basePlan.fat,
    source: calculationError || hasChangedTargetValues ? "client_manual" : basePlan.source
  };

  const { data, error } = await supabaseClient
    .from("client_programs")
    .update({ nutrition_plan: editablePlan })
    .eq("id", currentProgram.id)
    .select("*")
    .single();

  if (error) {
    return { error };
  }

  currentProgram = data;
  renderClientNutrition(currentProgram);
  return { data };
}

function handleClientNutritionSave() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("#save-client-nutrition-button");

    if (!button) {
      return;
    }

    const status = document.getElementById("client-nutrition-save-status");
    button.disabled = true;

    if (status) {
      status.textContent = "Calculating...";
    }

    const { error } = await saveClientNutritionPlan();

    if (error) {
      if (status) {
        status.textContent = error.message || "Could not save nutrition yet.";
      }
      button.disabled = false;
      return;
    }

    const nextStatus = document.getElementById("client-nutrition-save-status");
    const nextButton = document.getElementById("save-client-nutrition-button");

    if (nextStatus) {
      nextStatus.textContent = "Nutrition target saved.";
    }
    if (nextButton) {
      nextButton.disabled = false;
    }
  });
}

function handleClientDashboardTabs() {
  document.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-client-dashboard-tab]");

    if (!tab) {
      return;
    }

    setClientDashboardTab(tab.dataset.clientDashboardTab);
  });
}

function setExerciseSkipped(logElement, skipped, options = {}) {
  if (!logElement) {
    return;
  }

  const card = logElement.closest(".workout-exercise-card");
  const logCount = card?.querySelectorAll("[data-exercise-log]").length || 0;
  const skipButton = logElement.querySelector("[data-skip-exercise]");

  if (skipped) {
    logElement.dataset.exerciseSkipped = "true";
  } else {
    delete logElement.dataset.exerciseSkipped;
  }

  logElement.classList.toggle("is-exercise-skipped", skipped);
  logElement.querySelectorAll("input, select, textarea, [data-add-set], [data-delete-last-set], [data-finish-set], [data-set-rir], [data-set-rest], [data-exercise-notes-toggle]").forEach((control) => {
    control.disabled = skipped;
  });
  const exerciseNameInput = exerciseNameInputForLog(logElement);
  if (exerciseNameInput) {
    exerciseNameInput.disabled = skipped;
  }

  if (skipButton) {
    skipButton.textContent = skipped ? "Use" : "Skip";
    skipButton.setAttribute("aria-pressed", skipped ? "true" : "false");
  }

  if (options.syncCard !== false && card && logCount <= 1) {
    card.classList.toggle("is-skipped", skipped);
    if (!skipButton) {
      card.classList.toggle("is-open", !skipped);
    }
    const skipInput = card.querySelector("[data-skip-card]");

    if (skipInput) {
      skipInput.checked = skipped;
    }
  }

  updateVisibleSetProgress(logElement);
  if (!options.skipDraft) {
    persistCustomWorkoutDraftForElement(logElement);
  }
}

function ensureDefaultCustomExercise(panel) {
  const list = panel?.querySelector("[data-custom-workout-list]");

  if (!list || panel.querySelector("[data-custom-exercise-card]")) {
    return;
  }

  list.innerHTML = customWorkoutCardMarkup({
    code: customExerciseCode(0),
    name: "",
    prescription: "Custom sets",
    rest: ""
  }, customWorkoutTitle);

  const defaultLogElement = list.querySelector("[data-exercise-log]");
  if (defaultLogElement) {
    updateExerciseLogField(defaultLogElement);
  }
  syncCustomWorkoutCarousel(panel, { activeIndex: 0, scrollToActive: true, instant: true });
}

function addOrOpenSupersetExercise(button) {
  const card = button?.closest("[data-custom-exercise-card]");
  const carousel = card?.closest("[data-custom-workout-carousel]");
  const panel = card?.closest(".client-workout-panel-custom");
  const list = carousel?.querySelector("[data-custom-workout-list]");
  const carouselCards = customWorkoutCarouselCards(carousel);
  const carouselIndex = carouselCards.indexOf(card);

  if (!card || !carousel || !panel || !list || carouselIndex < 0) {
    return;
  }

  const existingSecondExercise = carouselCards[carouselIndex + 1];
  if (existingSecondExercise) {
    moveCustomWorkoutCarousel(carousel, carouselIndex + 1);
    window.requestAnimationFrame(() => {
      existingSecondExercise.querySelector("[data-exercise-title-name]")?.focus();
    });
    return;
  }

  const allCards = Array.from(panel.querySelectorAll("[data-custom-exercise-card]"));
  const currentIndex = Math.max(allCards.indexOf(card), 0);
  const groupIndex = Math.max(Number(carousel.dataset.customWorkoutGroup) || 0, 0);

  list.insertAdjacentHTML("beforeend", customWorkoutCardMarkup({
    code: nextCustomExerciseCode(panel),
    name: "",
    group: groupIndex,
    prescription: "Custom sets",
    rest: ""
  }, customWorkoutTitle, currentIndex + 1));

  const newCard = list.querySelector("[data-custom-exercise-card]:last-child");
  const newLogElement = newCard?.querySelector("[data-exercise-log]");
  const sharedDate = panel.querySelector("[data-workout-date]")?.value || todayDate();
  const hiddenDate = newLogElement?.querySelector("[data-log-date]");

  if (hiddenDate) {
    hiddenDate.value = sharedDate;
  }
  if (newLogElement) {
    updateExerciseLogField(newLogElement);
  }

  syncCustomWorkoutFormatMarkers(panel);
  syncCustomWorkoutCarousel(panel, { focusCard: newCard });
  persistCustomWorkoutDraftFromPanel(panel);
  window.requestAnimationFrame(() => {
    newCard?.querySelector("[data-exercise-title-name]")?.focus();
  });
}

function updateSupersetSummaryCount(card) {
  if (!card?.matches("[data-superset-card]")) {
    return;
  }

  const count = card.querySelectorAll("[data-exercise-log]").length;
  const summaryMeta = card.querySelector(".exercise-card-summary em");

  if (summaryMeta) {
    summaryMeta.textContent = `${count} exercise${count === 1 ? "" : "s"} · log each round`;
  }
}

function removeExerciseLog(logElement) {
  const card = logElement?.closest(".workout-exercise-card");
  const customPanel = card?.closest(".client-workout-panel-custom");
  const assignedPanel = card?.closest(".client-workout-panel-assigned");
  const logCount = card?.querySelectorAll("[data-exercise-log]").length || 0;

  if (!logElement || !card) {
    return;
  }

  if (logCount <= 1) {
    card.remove();
  } else {
    logElement.remove();
    updateSupersetSummaryCount(card);
  }

  ensureDefaultCustomExercise(customPanel);
  syncCustomWorkoutFormatMarkers(customPanel);
  syncCustomWorkoutCarousel(customPanel, { scrollToActive: true, instant: true });
  persistCustomWorkoutDraftFromPanel(customPanel);
  syncAssignedWorkoutMarkers(assignedPanel);
}

function handleWorkoutInteractions() {
  document.addEventListener("click", async (event) => {
    const exerciseSuggestionButton = event.target.closest("[data-custom-exercise-suggestion]");
    const toggle = event.target.closest("[data-exercise-toggle]");
    const addSetButton = event.target.closest("[data-add-set]");
    const deleteLastSetButton = event.target.closest("[data-delete-last-set]");
    const addSupersetButton = event.target.closest("[data-add-superset]");
    const finishSetButton = event.target.closest("[data-finish-set]");
    const exerciseNotesToggle = event.target.closest("[data-exercise-notes-toggle]");
    const setRirButton = event.target.closest("[data-set-rir]");
    const setRestButton = event.target.closest("[data-set-rest]");
    const skipExerciseButton = event.target.closest("[data-skip-exercise]");
    const deleteExerciseButton = event.target.closest("[data-delete-exercise]");
    const addCustomExerciseButton = event.target.closest("[data-add-custom-exercise]");
    const addAssignedExerciseButton = event.target.closest("[data-add-assigned-exercise]");
    const customWorkoutFormatButton = event.target.closest("[data-custom-workout-format-option]");
    const customWorkoutCarouselPrevious = event.target.closest("[data-custom-workout-carousel-previous]");
    const customWorkoutCarouselNext = event.target.closest("[data-custom-workout-carousel-next]");
    const customWorkoutCarouselDot = event.target.closest("[data-custom-workout-carousel-dot]");
    const closeRestTimerButton = event.target.closest("[data-rest-timer-close]");
    const restTimerPresetButton = event.target.closest("[data-rest-timer-preset]");
    const restTimerStartButton = event.target.closest("[data-rest-timer-start]");
    const restTimerResetButton = event.target.closest("[data-rest-timer-reset]");
    const rirOptionButton = event.target.closest("[data-rir-option]");
    const rirSaveButton = event.target.closest("[data-rir-save]");
    const rirCloseButton = event.target.closest("[data-rir-close]");
    const workoutDifficultyOptionButton = event.target.closest("[data-workout-difficulty-option]");
    const workoutDifficultySaveButton = event.target.closest("[data-workout-difficulty-save]");
    const workoutDifficultyCloseButton = event.target.closest("[data-workout-difficulty-close]");
    const nextExerciseYesButton = event.target.closest("[data-next-exercise-yes]");
    const nextExerciseNoButton = event.target.closest("[data-next-exercise-no]");
    const nextExerciseCloseButton = event.target.closest("[data-next-exercise-close]");
    const workoutStartButton = event.target.closest("[data-workout-start]");
    const workoutElapsedToggleButton = event.target.closest("[data-workout-elapsed-toggle]");
    const workoutElapsedCompactButton = event.target.closest("[data-workout-elapsed-compact]");

    if (exerciseNotesToggle) {
      const notesContent = exerciseNotesToggle.closest(".exercise-notes")?.querySelector(".exercise-notes-content");
      const isExpanded = exerciseNotesToggle.getAttribute("aria-expanded") === "true";

      exerciseNotesToggle.setAttribute("aria-expanded", String(!isExpanded));
      if (notesContent) {
        notesContent.hidden = isExpanded;
      }
      const icon = exerciseNotesToggle.querySelector("[data-exercise-notes-icon]");
      if (icon) {
        icon.textContent = isExpanded ? "+" : "−";
      }
      if (!isExpanded) {
        notesContent?.querySelector("[data-log-notes]")?.focus();
      }
      return;
    }

    if (nextExerciseYesButton) {
      const panel = nextExercisePromptPanel;

      closeNextExercisePrompt({ restoreFocus: false });
      panel?.querySelector("[data-add-custom-exercise], [data-add-assigned-exercise]")?.click();
      return;
    }

    if (
      nextExerciseNoButton ||
      nextExerciseCloseButton ||
      event.target.matches("[data-next-exercise-overlay]")
    ) {
      closeNextExercisePrompt();
      return;
    }

    if (workoutStartButton) {
      const workoutTitle = String(workoutStartButton.dataset.workoutTitle || activeWorkoutElapsedTitle()).trim();
      const isActiveWorkout = Boolean(
        workoutElapsedTimerState &&
        workoutTitle === String(workoutElapsedTimerState.workoutTitle || "").trim()
      );

      if (isActiveWorkout) {
        toggleWorkoutElapsedTimer();
      } else if (!workoutElapsedTimerState) {
        startWorkoutElapsedTimer(workoutTitle);
      }
      return;
    }

    if (workoutElapsedCompactButton) {
      toggleWorkoutElapsedTimerCompact();
      return;
    }

    if (workoutElapsedToggleButton) {
      toggleWorkoutElapsedTimer();
      return;
    }

    if (!event.target.closest(".custom-workout-name-editor")) {
      closeCustomExerciseSuggestions();
    }

    if (exerciseSuggestionButton) {
      const editor = exerciseSuggestionButton.closest(".custom-workout-name-editor");
      const input = editor?.querySelector("[data-exercise-title-name]");

      if (input) {
        input.value = exerciseSuggestionButton.dataset.customExerciseSuggestion || "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        closeCustomExerciseSuggestions();
      }
      return;
    }

    if (setRestButton) {
      const logElement = setRestButton.closest("[data-exercise-log]");
      if (!workoutElapsedTimerState) {
        startWorkoutElapsedTimer(logElement?.dataset.workoutTitle || activeWorkoutElapsedTitle());
      }
      resetRestTimer();
      openRestTimer(setRestButton);
      startOrPauseRestTimer();
      return;
    }

    if (addSupersetButton) {
      addOrOpenSupersetExercise(addSupersetButton);
      return;
    }

    if (finishSetButton) {
      const logElement = finishSetButton.closest("[data-exercise-log]");
      const card = finishSetButton.closest(".workout-exercise-card");
      const status = logElement?.querySelector("[data-log-status]");

      if (!logElement) {
        return;
      }

      const completedSets = filledSetCount(logElement);
      const setTarget = visibleSetTarget(logElement);

      if (completedSets < setTarget) {
        if (status) {
          status.textContent = `Enter all ${setTarget} working set${setTarget === 1 ? "" : "s"} before finishing this exercise.`;
        }
        return;
      }

      const saveResult = await saveTrainingLogRows(finishSetButton, [logElement], status, {
        savingMessage: "Finishing exercise...",
        successMessage: "Exercise finished."
      });

      if (saveResult.saved) {
        const cardLogCount = card?.querySelectorAll("[data-exercise-log]").length || 0;

        logElement.classList.add("is-exercise-complete");
        if (cardLogCount <= 1) {
          card?.classList.add("is-exercise-complete");
          card?.classList.remove("is-open");
        }
        finishSetButton.textContent = "Finished ✓";
        finishSetButton.setAttribute("aria-pressed", "true");
        const customWorkoutCarousel = card?.closest("[data-custom-workout-carousel]");
        if (customWorkoutCarousel) {
          renderCustomWorkoutCarousel(customWorkoutCarousel);
        }
        openNextExercisePrompt(
          card?.closest(".client-workout-panel-custom, .client-workout-panel-assigned"),
          finishSetButton
        );
      }
      return;
    }

    if (setRirButton) {
      openRirDialog(setRirButton);
      return;
    }

    if (rirOptionButton) {
      pendingRirValue = Number(rirOptionButton.dataset.rirOption);
      renderRirDialog();
      return;
    }

    if (rirSaveButton) {
      saveRirSelection();
      return;
    }

    if (rirCloseButton || event.target.matches("[data-rir-overlay]")) {
      closeRirDialog();
      return;
    }

    if (workoutDifficultyOptionButton) {
      pendingWorkoutDifficulty = Number(workoutDifficultyOptionButton.dataset.workoutDifficultyOption);
      renderWorkoutDifficultyPrompt();
      return;
    }

    if (workoutDifficultySaveButton) {
      saveWorkoutDifficultySelection();
      return;
    }

    if (
      workoutDifficultyCloseButton ||
      event.target.matches("[data-workout-difficulty-overlay]")
    ) {
      closeWorkoutDifficultyPrompt();
      return;
    }

    if (closeRestTimerButton || event.target.matches("[data-rest-timer-overlay]")) {
      closeRestTimer();
      return;
    }

    if (restTimerPresetButton) {
      setRestTimerDuration(restTimerPresetButton.dataset.restTimerPreset);
      return;
    }

    if (restTimerStartButton) {
      startOrPauseRestTimer();
      return;
    }

    if (restTimerResetButton) {
      resetRestTimer();
      return;
    }

    if (customWorkoutFormatButton) {
      updateCustomWorkoutFormat(
        customWorkoutFormatButton.closest(".client-workout-panel-custom"),
        customWorkoutFormatButton.dataset.customWorkoutFormatOption
      );
      return;
    }

    if (customWorkoutCarouselPrevious || customWorkoutCarouselNext || customWorkoutCarouselDot) {
      const carousel = event.target.closest("[data-custom-workout-carousel]");
      const current = Number(carousel?.dataset.activeIndex) || 0;
      const nextIndex = customWorkoutCarouselDot
        ? Number(customWorkoutCarouselDot.dataset.customWorkoutCarouselDot)
        : current + (customWorkoutCarouselNext ? 1 : -1);

      moveCustomWorkoutCarousel(carousel, nextIndex);
      return;
    }

    if (skipExerciseButton) {
      const logElement = skipExerciseButton.closest("[data-exercise-log]");
      const isSkipped = logElement?.dataset.exerciseSkipped === "true";

      setExerciseSkipped(logElement, !isSkipped);
      scheduleTrainingLogAutosave(logElement);
      return;
    }

    if (deleteExerciseButton) {
      const logElement = deleteExerciseButton.closest("[data-exercise-log]") ||
        deleteExerciseButton.closest("[data-custom-exercise-card]")?.querySelector("[data-exercise-log]");

      removeExerciseLog(logElement);
      scheduleTrainingLogAutosave(logElement);
      return;
    }

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

    if (deleteLastSetButton) {
      const logElement = deleteLastSetButton.closest("[data-exercise-log]");
      const setRows = Array.from(logElement?.querySelectorAll("[data-set-row]") || []);
      const setRow = setRows[setRows.length - 1];

      if (logElement && setRow) {
        if (setRows.length <= 1) {
          const weightInput = setRow.querySelector("[data-set-weight]");
          const repsInput = setRow.querySelector("[data-set-reps]");

          if (weightInput) {
            weightInput.value = "";
          }

          if (repsInput) {
            repsInput.value = "";
          }

          setRow.classList.remove("is-complete");
          delete setRow.dataset.repsInReserve;
          renderSetRirValue(setRow);

          updateVisibleSetProgress(logElement);
          persistCustomWorkoutDraftForElement(logElement);
          scheduleTrainingLogAutosave(logElement);
          return;
        }

        setRow.remove();
        renumberSetRows(logElement);
        syncVisibleSetTarget(logElement);
        updateVisibleSetProgress(logElement);
        persistCustomWorkoutDraftForElement(logElement);
        scheduleTrainingLogAutosave(logElement);
      }
    }

    if (addCustomExerciseButton) {
      const panel = addCustomExerciseButton.closest(".client-workout-panel-custom");
      const format = normalizeCustomWorkoutFormat(panel?.dataset.customWorkoutFormat || activeCustomWorkoutFormat);
      const placement = addCustomExerciseButton.dataset.customExercisePlacement || "current";
      const stack = panel?.querySelector("[data-custom-workout-carousel-stack]");
      let lists = Array.from(panel?.querySelectorAll("[data-custom-workout-list]") || []);
      let list = lists[lists.length - 1];
      let groupIndex = format === "circuit"
        ? Math.max(Number(list?.closest("[data-custom-workout-carousel]")?.dataset.customWorkoutGroup) || 0, 0)
        : 0;

      if (format === "circuit" && placement === "new-circuit" && stack) {
        const groupNumbers = customWorkoutCarousels(panel).map((carousel) => Number(carousel.dataset.customWorkoutGroup) || 0);
        groupIndex = groupNumbers.length > 0 ? Math.max(...groupNumbers) + 1 : 0;
        stack.insertAdjacentHTML("beforeend", customWorkoutCarouselGroupMarkup(format, [], groupIndex));
        lists = Array.from(panel.querySelectorAll("[data-custom-workout-list]"));
        list = lists[lists.length - 1];
      }

      if (list) {
        const nextCode = nextCustomExerciseCode(panel);
        const nextIndex = panel.querySelectorAll("[data-custom-exercise-card]").length + 1;

        list.insertAdjacentHTML("beforeend", customWorkoutCardMarkup({
          code: nextCode,
          name: "",
          group: groupIndex,
          prescription: "Custom sets",
          rest: ""
        }, customWorkoutTitle, nextIndex - 1));

        const newCard = list.querySelector("[data-custom-exercise-card]:last-child");
        const newLogElement = newCard?.querySelector("[data-exercise-log]");

        if (newLogElement) {
          const sharedDate = panel.querySelector("[data-workout-date]")?.value || todayDate();
          const hiddenDate = newLogElement.querySelector("[data-log-date]");
          if (hiddenDate) {
            hiddenDate.value = sharedDate;
          }
          updateExerciseLogField(newLogElement);
        }

        syncCustomWorkoutFormatMarkers(panel);
        syncCustomWorkoutCarousel(panel, { focusCard: newCard });
        exerciseNameInputForLog(newLogElement)?.focus();
        persistCustomWorkoutDraftFromPanel(panel);
      }
      return;
    }

    if (addAssignedExerciseButton) {
      const panel = addAssignedExerciseButton.closest(".client-workout-panel-assigned");
      const list = panel?.querySelector("[data-assigned-workout-list]");

      if (list) {
        const nextCode = nextAssignedExerciseCode(list);
        const nextIndex = list.querySelectorAll("[data-assigned-exercise-card]").length;
        const format = normalizeCustomWorkoutFormat(panel.dataset.assignedWorkoutFormat || "single");
        const cardMarkup = exerciseCard({
          code: nextCode,
          name: "",
          prescription: "Custom sets",
          rest: "",
          clientAdded: true,
          clientSetCount: 1
        }, panel.querySelector(".panel-heading h2")?.textContent || "Workout", true, "", {
          exerciseIndex: nextIndex,
          format
        });

        addAssignedExerciseButton.insertAdjacentHTML("beforebegin", cardMarkup);
        const newCard = addAssignedExerciseButton.previousElementSibling;
        const newLogElement = newCard?.querySelector("[data-exercise-log]");

        if (newLogElement) {
          const sharedDate = panel.querySelector("[data-workout-date]")?.value || todayDate();
          const hiddenDate = newLogElement.querySelector("[data-log-date]");
          if (hiddenDate) {
            hiddenDate.value = sharedDate;
          }
          updateExerciseLogField(newLogElement);
          exerciseNameInputForLog(newLogElement)?.focus();
        }

        syncAssignedWorkoutMarkers(panel);
      }
    }
  });

  document.addEventListener("input", (event) => {
    const exerciseNameInput = event.target.closest("[data-exercise-name-input]");
    const setInput = event.target.closest("[data-set-label], [data-set-weight], [data-set-reps]");
    const notesInput = event.target.closest("[data-log-notes]");
    const timedLogInput = event.target.closest("[data-warmup-duration], [data-cardio-duration], [data-cardio-distance], [data-cardio-calories]");

    if (setInput) {
      const logElement = setInput.closest("[data-exercise-log]");

      if (setInput.matches("[data-set-label]")) {
        updateSetTypeFromLabel(setInput.closest("[data-set-row]"));
        renumberSetRows(logElement);
        syncVisibleSetTarget(logElement);
      }

      updateVisibleSetProgress(logElement);
      persistCustomWorkoutDraftForElement(logElement);
      scheduleTrainingLogAutosave(logElement);
    }

    if (notesInput) {
      const logElement = notesInput.closest("[data-exercise-log]");

      renderExerciseNotesState(logElement);
      persistCustomWorkoutDraftForElement(logElement || notesInput);
      scheduleTrainingLogAutosave(logElement);
    }

    if (timedLogInput) {
      const logElement = timedLogInput.closest("[data-exercise-log]");

      persistCustomWorkoutDraftForElement(logElement || timedLogInput);
      scheduleTrainingLogAutosave(logElement);
    }

    if (!exerciseNameInput) {
      return;
    }

    const logElement = exerciseNameInput.closest("[data-exercise-log]") ||
      exerciseNameInput.closest(".workout-exercise-card")?.querySelector("[data-exercise-log]");

    syncExerciseNamePreview(logElement, exerciseNameInput.value);

    if (
      logElement &&
      logElement.dataset.cardioLog === undefined &&
      logElement.dataset.warmupLog === undefined
    ) {
      renderPreviousExerciseWeights(logElement);
    }
    if (exerciseNameInput.matches("[data-exercise-title-name]")) {
      renderCustomExerciseSuggestions(exerciseNameInput);
    }
    persistCustomWorkoutDraftForElement(logElement);
    scheduleTrainingLogAutosave(logElement);
  });

  document.addEventListener("change", (event) => {
    const dateInput = event.target.closest("[data-log-date]");

    if (dateInput) {
      const logElement = dateInput.closest("[data-exercise-log]");

      persistCustomWorkoutDraftForElement(logElement || dateInput);
      scheduleTrainingLogAutosave(logElement);
    }
  });

  document.addEventListener("focusin", (event) => {
    const exerciseNameInput = event.target.closest("[data-exercise-title-name]");

    if (exerciseNameInput) {
      renderCustomExerciseSuggestions(exerciseNameInput);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.querySelector("[data-rir-overlay]")?.hidden === false) {
      closeRirDialog();
      return;
    }
    if (event.key === "Escape" && document.querySelector("[data-workout-difficulty-overlay]")?.hidden === false) {
      closeWorkoutDifficultyPrompt();
      return;
    }
    if (event.key === "Escape" && event.target.closest(".custom-workout-name-editor")) {
      closeCustomExerciseSuggestions();
    }
    if (event.key === "Escape" && document.querySelector("[data-rest-timer-overlay]")?.hidden === false) {
      closeRestTimer();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && restTimerEndsAt) {
      tickRestTimer();
    }
    if (!document.hidden && workoutElapsedTimerState) {
      renderWorkoutElapsedTimer();
    }
  });
}

function handleClientWorkoutTabs() {
  document.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-client-workout-tab]");

    if (!tab) {
      return;
    }

    const nextIndex = Number(tab.dataset.clientWorkoutTab || 0);
    const tabs = document.querySelectorAll("[data-client-workout-tab]");
    const panels = document.querySelectorAll(".client-workout-panel");

    activeWorkoutTabIndex = nextIndex;
    tabs.forEach((button) => {
      const isActive = Number(button.dataset.clientWorkoutTab || 0) === nextIndex;

      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", isActive ? "true" : "false");
    });
    panels.forEach((panel, index) => {
      const isActive = index === nextIndex;

      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });
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

    card.querySelectorAll("[data-exercise-log]").forEach((logElement) => {
      setExerciseSkipped(logElement, skipInput.checked, { syncCard: false });
    });
    card.classList.toggle("is-skipped", skipInput.checked);
    card.classList.toggle("is-open", !skipInput.checked);
  });
}

function renderProgram(program) {
  currentProgram = { ...program };
  activeCustomWorkoutFormat = storedCustomWorkoutFormat();
  const displayProgram = displayProgramForCurrentView(program);
  const workouts = Array.isArray(program.workouts) ? program.workouts : [];
  const programTitle = displayProgram.program_title || "Your Program";

  document.title = `${programTitle} | Fitness with Benjamin`;
  setText("#dashboard-program-title", programTitle);
  setText("#dashboard-program-summary", displayProgram.program_summary || "Your current training block is ready.");
  setText("#client-avatar", clientInitials(displayProgram));
  setText("#client-name", displayProgram.client_name || "Client");

  renderMetrics(program);
  renderClientNutrition(program);
  renderWorkoutInsights(program);
  renderClientSessionManualState(program);
  renderClientWorkoutTabs(workouts);
  setClientDashboardTab(activeClientDashboardTab);
  if (!workoutElapsedTimerState) {
    restoreWorkoutElapsedTimer();
  }
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

    const returnTo = new URLSearchParams(window.location.search).get("return_to");
    const isSafeLocalReturn = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//");
    window.location.href = isSafeLocalReturn ? returnTo : clientDashboardUrl;
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

    const returnTo = new URLSearchParams(window.location.search).get("return_to");
    const isSafeLocalReturn = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//");

    window.location.href = isSafeLocalReturn ? returnTo : "coach-admin.html?v=invite-list-layout-fix-1";
  });
}

function handlePasswordResetRequests() {
  const buttons = document.querySelectorAll("[data-password-reset]");

  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      if (!supabaseClient) {
        const status = button.dataset.passwordReset === "coach"
          ? document.getElementById("coach-login-status")
          : document.getElementById("login-status");

        if (status) {
          status.textContent = "Password reset is not connected yet.";
        }
        return;
      }

      const isCoach = button.dataset.passwordReset === "coach";
      const form = document.getElementById(isCoach ? "coach-login-form" : "client-login-form");
      const status = document.getElementById(isCoach ? "coach-login-status" : "login-status");
      const email = String(form?.elements.email?.value || "").trim().toLowerCase();

      if (!email) {
        if (status) {
          status.textContent = "Enter your email first, then request a reset link.";
        }
        form?.elements.email?.focus();
        return;
      }

      button.disabled = true;

      if (status) {
        status.textContent = "Sending password reset link...";
      }

      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: passwordResetRedirectUrl()
      });

      if (error) {
        if (status) {
          status.textContent = error.message;
        }
        button.disabled = false;
        return;
      }

      if (status) {
        status.textContent = "If that account exists, a password reset link was sent.";
      }

      button.disabled = false;
    });
  });
}

async function loadDashboard() {
  if (!document.querySelector(".dashboard-page")) {
    return;
  }

  try {
    if (!supabaseClient) {
      setDashboardMessage(
        "Client login unavailable",
        "This page is not connected yet. Please message Benjamin for your workout."
      );
      return;
    }

    const { data: sessionData, error: sessionError } = await withTimeout(
      supabaseClient.auth.getSession(),
      "Client access check timed out."
    );
    const user = sessionData?.session?.user;

    if (sessionError || !user) {
      window.location.href = "client-login.html";
      return;
    }

    activeDashboardUser = user;

    const signedInEmail = normalizeClientEmail(user.email);
    const previewEmail = dashboardClientEmailParam();
    const targetClientEmail = isCoachPortalEmail(signedInEmail) ? previewEmail : signedInEmail;
    signedInDashboardEmail = signedInEmail;
    isCoachDashboardPreview = isCoachPortalEmail(signedInEmail) && Boolean(previewEmail);

    if (!targetClientEmail) {
      setDashboardMessage(
        "Choose a client",
        "Open Client View from the coach admin after selecting a client."
      );
      return;
    }

    const { data: programRows, error } = await withTimeout(
      supabaseClient
        .from("client_programs")
        .select("*")
        .eq("active", true)
        .ilike("client_email", targetClientEmail)
        .order("updated_at", { ascending: false })
        .limit(1),
      "Program request timed out."
    );
    const assignedProgram = Array.isArray(programRows) ? programRows[0] : null;

    if (error) {
      setDashboardMessage(
        "Could not load dashboard",
        "Please refresh the page. If it still does not load, message Benjamin."
      );
      return;
    }

    const data = assignedProgram || {
      client_email: targetClientEmail,
      client_name: "Client",
      program_title: "Custom Workout",
      program_summary: "Build and log your own workout.",
      workouts: []
    };

    activeClientEmail = data.client_email || targetClientEmail;
    renderProgram(data);
    const [progressResult, progressPhotoResult, trainingLogResult, workoutFeedbackResult, foodLogResult, exerciseLibraryResult] = await Promise.allSettled([
      withTimeout(
        supabaseClient
          .from("client_progress")
          .select("*")
          .ilike("client_email", activeClientEmail)
          .order("entry_date", { ascending: true }),
        "Progress request timed out."
      ),
      withTimeout(
        supabaseClient
          .from("client_progress_photos")
          .select("id, client_email, storage_path, captured_on, note, created_at")
          .ilike("client_email", activeClientEmail)
          .order("captured_on", { ascending: false })
          .order("created_at", { ascending: false }),
        "Progress photo request timed out."
      ),
      withTimeout(
        supabaseClient
          .from("client_workout_logs")
          .select("*")
          .ilike("client_email", activeClientEmail)
          .order("entry_date", { ascending: true })
          .limit(500),
        "Training log request timed out."
      ),
      withTimeout(
        supabaseClient
          .from("workout_session_feedback")
          .select("session_id,client_email,workout_template_id,entry_date,workout_title,difficulty_rating,source,source_version,client_updated_at")
          .ilike("client_email", activeClientEmail)
          .order("entry_date", { ascending: true })
          .limit(500),
        "Workout feedback request timed out."
      ),
      withTimeout(
        supabaseClient
          .from("client_food_logs")
          .select("*")
          .ilike("client_email", activeClientEmail)
          .order("entry_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(200),
        "Food log request timed out."
      ),
      withTimeout(
        supabaseClient
          .from("exercise_library")
          .select("id,name,aliases,primary_muscle,secondary_muscles,equipment,difficulty,movement_pattern,default_sets,default_reps,default_rest_seconds,substitution_group,demo_url,instructions")
          .eq("is_active", true)
          .eq("is_approved", true)
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
        "Exercise library request timed out."
      )
    ]);

    const progressData = progressResult.status === "fulfilled" && !progressResult.value.error
      ? progressResult.value.data
      : [];
    const progressPhotoData = progressPhotoResult.status === "fulfilled" && !progressPhotoResult.value.error
      ? progressPhotoResult.value.data
      : [];
    const trainingLogData = trainingLogResult.status === "fulfilled" && !trainingLogResult.value.error
      ? trainingLogResult.value.data
      : [];
    const workoutFeedbackData = workoutFeedbackResult.status === "fulfilled" && !workoutFeedbackResult.value.error
      ? workoutFeedbackResult.value.data
      : [];
    const foodLogData = foodLogResult.status === "fulfilled" && !foodLogResult.value.error
      ? foodLogResult.value.data
      : [];
    const exerciseLibraryData = exerciseLibraryResult.status === "fulfilled" && !exerciseLibraryResult.value.error
      ? exerciseLibraryResult.value.data
      : [];

    exerciseLibraryEntries = exerciseLibraryData || [];
    workoutSessionFeedback = workoutFeedbackData || [];

    renderProgress(progressData || []);
    renderClientProgressPhotos(await signedProgressPhotoRecords(progressPhotoData || []));
    if (progressPhotoResult.status !== "fulfilled" || progressPhotoResult.value.error) {
      setClientProgressPhotoStatus("Progress photos could not be loaded. Refresh and try again.");
    }
    configureClientProgressAccess();
    fillFoodEntryDefaults();
    populateFoodLogs(foodLogData || []);
    populateTrainingLogs(
      trainingLogData?.length || !shouldUseDemoTrainingLogs()
        ? trainingLogData || []
        : demoTrainingLogsForProgram(data)
    );
    refreshExerciseSuggestionsDatalist();
  } catch (error) {
    setDashboardMessage(
      "Could not load dashboard",
      "Please refresh the page. If it still does not load, message Benjamin."
    );
  }
}

function rowsForTrainingLog(logElement) {
  const dateInput = logElement?.querySelector("[data-log-date]");

  if (!logElement || !dateInput) {
    return [];
  }

  if (logElement.dataset.exerciseSkipped === "true" || logElement.closest(".workout-exercise-card")?.classList.contains("is-skipped")) {
    return [];
  }

  const notes = logElement.querySelector("[data-log-notes]")?.value || "";
  const exerciseName = exerciseNameInputForLog(logElement)?.value?.trim() || logElement.dataset.exerciseName;

  if (logElement.dataset.cardioLog !== undefined) {
    const duration = Number(logElement.querySelector("[data-cardio-duration]")?.value || 0);
    const distanceInput = logElement.querySelector("[data-cardio-distance]")?.value;
    const calories = logElement.querySelector("[data-cardio-calories]")?.value;

    if (duration <= 0) {
      return [];
    }

    return [{
      client_email: activeClientEmail,
      entry_date: dateInput.value || todayDate(),
      workout_title: logElement.dataset.workoutTitle,
      exercise_code: cardioExerciseCode,
      exercise_name: exerciseName || "Cardio",
      set_number: 1,
      weight_used: duration,
      reps: distanceInput ? Number(distanceInput) : null,
      notes: buildCardioNotes(calories, notes)
    }];
  }

  if (logElement.dataset.warmupLog !== undefined) {
    const duration = Number(logElement.querySelector("[data-warmup-duration]")?.value || 0);

    if (duration <= 0) {
      return [];
    }

    return [{
      client_email: activeClientEmail,
      entry_date: dateInput.value || todayDate(),
      workout_title: logElement.dataset.workoutTitle,
      exercise_code: warmupExerciseCode,
      exercise_name: exerciseName || "Warm up",
      set_number: 1,
      weight_used: duration,
      reps: null,
      notes
    }];
  }

  return Array.from(logElement.querySelectorAll("[data-set-row]"))
    .map((setRow) => {
      const values = setRowInputValues(setRow);
      const setType = setTypeForRow(setRow);

      return {
        is_logged: isSetRowLogged(setRow),
        row: {
          client_email: activeClientEmail,
          entry_date: dateInput.value || todayDate(),
          workout_title: logElement.dataset.workoutTitle,
          exercise_code: logElement.dataset.exerciseCode,
          exercise_name: exerciseName,
          set_number: Number(setRow.dataset.setNumber || 1),
          set_type: setType,
          weight_used: values.weightRaw === "" ? 0 : values.weightValue,
          reps: values.repsRaw === "" ? null : values.repsValue,
          ...(setRow.dataset.repsInReserve === undefined ? {} : {
            effort_scale: "rir",
            effort_value: Number(setRow.dataset.repsInReserve)
          }),
          notes
        }
      };
    })
    .filter(({ is_logged }) => is_logged)
    .map(({ row }) => row);
}

function setRowInputValues(setRow) {
  const weightRaw = setRow.querySelector("[data-set-weight]")?.value?.trim() || "";
  const repsRaw = setRow.querySelector("[data-set-reps]")?.value?.trim() || "";
  const weightValue = weightRaw === "" ? null : Number(weightRaw);
  const repsValue = repsRaw === "" ? null : Number(repsRaw);

  return { weightRaw, repsRaw, weightValue, repsValue };
}

function isSetRowLogged(setRow) {
  const { weightRaw, repsRaw, weightValue, repsValue } = setRowInputValues(setRow);
  const hasWeight = weightRaw !== "" && Number.isFinite(weightValue) && weightValue >= 0;
  const hasReps = repsRaw !== "" && Number.isFinite(repsValue) && repsValue > 0;

  return hasWeight || hasReps;
}

function filledSetCount(logElement) {
  return Array.from(logElement.querySelectorAll("[data-set-row]"))
    .filter((row) => setTypeForRow(row) !== warmUpSetType)
    .filter(isSetRowLogged)
    .length;
}

function currentExerciseLabel(logElement) {
  const editedName = exerciseNameInputForLog(logElement)?.value?.trim();
  return editedName || logElement?.dataset.exerciseName || "";
}

function incompleteWorkoutExercises(logElements) {
  return logElements.filter((logElement) => {
    const card = logElement.closest(".workout-exercise-card");
    const setTarget = visibleSetTarget(logElement);

    if (logElement.dataset.warmupLog !== undefined || logElement.dataset.cardioLog !== undefined) {
      return false;
    }

    if (card?.classList.contains("is-skipped")) {
      return false;
    }

    if (logElement.dataset.exerciseSkipped === "true") {
      return false;
    }

    return filledSetCount(logElement) < setTarget;
  });
}

function workoutSectionForButton(button) {
  return button.closest(".client-workout-panel, .today-panel, .lower-panel, .extra-workout-panel");
}

const trainingLogAutosaveTimers = new WeakMap();
const trainingLogAutosaveDelayMs = 10000;

function trainingLogHasAutosavePayload(logElement) {
  if (!logElement) {
    return false;
  }

  if (rowsForTrainingLog(logElement).length > 0) {
    return true;
  }

  const dateInput = logElement.querySelector("[data-log-date]");
  const entryDate = dateInput?.value || todayDate();
  const workoutTitle = logElement.dataset.workoutTitle || "";
  const exerciseCode = logElement.dataset.exerciseCode || "";

  if (!activeClientEmail || !entryDate || !workoutTitle || !exerciseCode) {
    return false;
  }

  return trainingLogs.some((log) => (
    String(log.client_email || "").toLowerCase() === String(activeClientEmail).toLowerCase() &&
    log.entry_date === entryDate &&
    log.workout_title === workoutTitle &&
    log.exercise_code === exerciseCode
  ));
}

function scheduleTrainingLogAutosave(logElement) {
  if (!logElement || !supabaseClient || !activeClientEmail || !trainingLogHasAutosavePayload(logElement)) {
    return;
  }

  const status = logElement.querySelector("[data-log-status]");

  const existingTimer = trainingLogAutosaveTimers.get(logElement);

  if (existingTimer) {
    window.clearTimeout(existingTimer);
  }

  const timer = window.setTimeout(async () => {
    trainingLogAutosaveTimers.delete(logElement);

    if (!document.body.contains(logElement) || !trainingLogHasAutosavePayload(logElement)) {
      return;
    }

    if (logElement.dataset.autosaveInFlight === "true") {
      scheduleTrainingLogAutosave(logElement);
      return;
    }

    logElement.dataset.autosaveInFlight = "true";

    try {
      await saveTrainingLogRows(null, [logElement], status, {
        savingMessage: "Autosaving...",
        successMessage: "Autosaved."
      });
    } finally {
      delete logElement.dataset.autosaveInFlight;
    }
  }, trainingLogAutosaveDelayMs);

  trainingLogAutosaveTimers.set(logElement, timer);
}

async function saveTrainingLogRows(button, logElements, status, options = {}) {
  const savingMessage = options.savingMessage || "Saving...";
  const successMessage = options.successMessage || "Saved.";

  if (!supabaseClient || !activeClientEmail) {
    if (status) {
      status.textContent = "Sign in first.";
    }
    return { saved: false };
  }

  if (logElements.length === 0) {
    if (status) {
      status.textContent = "Choose a date first.";
    }
    return { saved: false };
  }

  if (button) {
    button.disabled = true;
  }
  if (status) {
    status.textContent = savingMessage;
  }

  const { deletedCount, error: deleteError } = await deleteRemovedTrainingLogRows(logElements);

  if (deleteError) {
    if (status) {
      status.textContent = "Could not save yet.";
    }
    if (button) {
      button.disabled = false;
    }
    return { saved: false, error: deleteError };
  }

  const rows = logElements
    .flatMap(rowsForTrainingLog)
    .map((row) => options.workoutCompletion
      ? { ...row, ...options.workoutCompletion }
      : row);

  if (rows.length === 0) {
    if (deletedCount > 0) {
      logElements.forEach(updateExerciseLogField);
      renderClientTrainingLogs();

      if (status) {
        status.textContent = successMessage;
      }
        if (button) {
          button.disabled = false;
        }
      return { saved: true, rows: [] };
    }

    if (status) {
      status.textContent = "Enter at least one weight or rep count, warm-up duration, or cardio duration.";
    }
    if (button) {
      button.disabled = false;
    }
    return { saved: false };
  }

  const { data, error } = await supabaseClient
    .from("client_workout_logs")
    .upsert(rows, { onConflict: "client_email,entry_date,workout_title,exercise_code,set_number" })
    .select();

  if (error) {
    if (status) {
      status.textContent = "Could not save yet.";
    }
    if (button) {
      button.disabled = false;
    }
    return { saved: false, error };
  }

  (data || rows).forEach((row) => upsertLocalTrainingLog(row));
  logElements.forEach(updateExerciseLogField);
  renderClientTrainingLogs();

  if (status) {
    status.textContent = successMessage;
  }
  if (button) {
    button.disabled = false;
  }
  return { saved: true, rows: data || rows };
}

async function handleTrainingLogSave() {
  document.addEventListener("click", async (event) => {
    const finishWorkoutButton = event.target.closest("[data-workout-finish]");
    const supersetButton = event.target.closest("[data-superset-submit]");
    const workoutButton = finishWorkoutButton;
    const button = workoutButton || supersetButton;

    if (!button) {
      return;
    }

    if (workoutButton) {
      const section = workoutSectionForButton(workoutButton);
      const logElements = Array.from(section?.querySelectorAll("[data-exercise-log]") || []);
      const status = section?.querySelector("[data-workout-status]");

      const incompleteExercises = incompleteWorkoutExercises(logElements);

      if (incompleteExercises.length > 0) {
        const saveResult = await saveTrainingLogRows(finishWorkoutButton, logElements, status, {
          savingMessage: "Saving progress...",
          successMessage: "Workout progress saved."
        });

        if (!saveResult.saved) {
          return;
        }

        const names = incompleteExercises
          .slice(0, 3)
          .map((logElement) => currentExerciseLabel(logElement))
          .filter(Boolean)
          .join(", ");
        const extra = incompleteExercises.length > 3 ? ` and ${incompleteExercises.length - 3} more` : "";

        if (status) {
          status.textContent = `Workout progress saved. Finish still needs all sets logged${names ? `: ${names}${extra}.` : "."}`;
        }
        return;
      }

      if (!workoutElapsedTimerState) {
        startWorkoutElapsedTimer(logElements[0]?.dataset.workoutTitle || activeWorkoutElapsedTitle());
      }
      const workoutDifficulty = await requestWorkoutDifficulty(finishWorkoutButton);

      if (workoutDifficulty === null) {
        return;
      }

      const workoutCompletion = workoutCompletionFields();
      const difficultySummary = workoutHistoryDifficultyLabel(workoutDifficulty);
      const saveResult = await saveTrainingLogRows(workoutButton, logElements, status, {
        savingMessage: "Finishing workout...",
        successMessage: "Workout saved. Saving difficulty...",
        workoutCompletion
      });

      if (saveResult.saved) {
        const feedbackResult = await saveWorkoutDifficultyFeedback(saveResult.rows, workoutDifficulty);

        if (!feedbackResult.saved) {
          if (status) {
            status.textContent = "Workout saved, but the difficulty rating could not be saved. Tap Finish workout to try again.";
          }
          return;
        }

        renderClientTrainingLogs();
        if (status) {
          status.textContent = `Workout finished · ${difficultySummary}.`;
        }
        finishWorkoutElapsedTimer();
        if (section?.classList.contains("client-workout-panel-custom")) {
          clearCustomWorkoutDraft();
        }
      }
      return;
    }

    if (supersetButton) {
      const supersetCard = supersetButton.closest("[data-superset-card]");
      const logElements = Array.from(supersetCard?.querySelectorAll("[data-exercise-log]") || []);
      const status = supersetCard?.querySelector("[data-superset-status]");

      await saveTrainingLogRows(button, logElements, status);
      return;
    }

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

function disableClientDashboardZoom() {
  const preventGestureZoom = (event) => {
    event.preventDefault();
  };

  document.addEventListener("gesturestart", preventGestureZoom, { passive: false });
  document.addEventListener("gesturechange", preventGestureZoom, { passive: false });
  document.addEventListener("gestureend", preventGestureZoom, { passive: false });
  document.addEventListener("touchmove", (event) => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  }, { passive: false });
}

disableClientDashboardZoom();
handleLogin();
handleCoachPortalLogin();
handlePasswordResetRequests();
loadDashboard();
handleSignOut();
handleTrainingDateChange();
handleClientTrainingLogDateFilter();
handleClientWorkoutHistoryDownload();
handleClientDashboardTabs();
handleClientSummaryActions();
handleClientWorkoutTabs();
handleWorkoutInteractions();
handleSkipToggle();
handleTrainingLogSave();
handleClientMetricSave();
handleClientProgressHistorySelect();
handleClientProgressSave();
handleClientNutritionSave();
handleFoodSearch();
handleFoodResultSelect();
handleFoodSave();
handleFoodDelete();
handleFoodEntryDateChange();
handleClientProgressMetricTabs();
handleClientProgressDateChange();
handleClientProgressPhotoUpload();
handleClientProgressPhotoDelete();
