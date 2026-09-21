const config = window.FWB_SUPABASE_CONFIG || {};
const isConfigured = Boolean(
  config.url &&
  config.anonKey &&
  !config.url.includes("PASTE_") &&
  !config.anonKey.includes("PASTE_")
);
const supabaseClient = isConfigured && window.supabase
  ? window.supabase.createClient(config.url, config.anonKey, {
      auth: {
        storage: window.FWB_AUTH_SESSION.storage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;
const exerciseNameMatcher = window.FWB_EXERCISE_NAME_MATCHER || null;
const coachPortalEmails = ["benjaminbenz.fit@gmail.com"];
let activeClientEmail = "";
let signedInDashboardEmail = "";
let isCoachDashboardPreview = false;
let trainingLogs = [];
let workoutSessionFeedback = [];
let foodLogs = [];
let foodSearchResults = [];
let sharedFoodLibrary = [];
let foodBarcodeScanControls = null;
let foodBarcodeLookupInFlight = false;
let foodBarcodeReturnFocus = null;
let progressEntries = [];
let progressPhotos = [];
let dexaReports = [];
let activeDexaReviewId = "";
let clientQuestionnaire = null;
let activeDashboardUser = null;
let activeProgressMetric = "bodyweight";
let clientTrainingLogDateFilter = "";
let clientTrainingLogSearchFilter = "";
let activeClientDashboardTab = "home";
let latestMonthlyProgressReport = null;
let monthlyReportReturnTab = "progress";
let monthlyReportReturnFocus = null;
let clientExerciseProgressIndex = 0;
let clientExerciseProgressSearch = "";
let clientExerciseProgressDirection = 0;
let activeWorkoutTabIndex = 0;
let clientWorkoutPickerIsOpen = true;
let activeWorkoutHistoryDeckIndex = 0;
let activeFoodHistoryDeckIndex = 0;
let activeProgressHistoryDeckIndex = 0;
let clientProgressHistoryDirection = 0;
let archivedDexaReportsExpanded = false;
let currentProgram = null;
let clientAvailablePrograms = [];
let clientPreviewProgramSelected = false;
let clientWorkoutLayoutSaving = false;
let clientWebNotificationController = null;
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
const clientQuestionnaireQuestionGroups = [
  {
    title: "Contact",
    questions: [
      { label: "Date of birth", keys: ["date_of_birth", "Date of Birth"] },
      { label: "Phone number", keys: ["phone", "phone_number", "Phone Number"] },
      { label: "Home address", keys: ["home_address", "Home Address"] },
      { label: "Apartment, suite, or unit", keys: ["address_line_2"] },
      { label: "City", keys: ["address_city"] },
      { label: "State", keys: ["address_state"] },
      { label: "ZIP", keys: ["address_zip"] },
      { label: "Preferred communication", keys: ["preferred_communication", "Preferred Communication"] },
      { label: "Coaching service", keys: ["service_interest", "Which coaching service are you interested in?"] }
    ]
  },
  {
    title: "Readiness",
    questions: [
      {
        label: "Has a doctor recommended only doctor-approved physical activity?",
        keys: ["heart_condition", "Doctor recommended physical activity only?"]
      },
      {
        label: "Chest pain during physical activity?",
        keys: ["chest_pain_activity", "Chest pain during physical activity?"]
      },
      {
        label: "Chest pain at rest in the past month?",
        keys: ["chest_pain_rest", "Chest pain at rest in the past month?"]
      },
      {
        label: "Bone or joint problem that activity could worsen?",
        keys: ["bone_joint_problem", "Bone or joint problem?"]
      },
      {
        label: "Any other reason not to engage in physical activity?",
        keys: ["other_activity_reason", "Other reason not to engage in physical activity?"]
      }
    ]
  },
  {
    title: "Goals",
    questions: [
      {
        label: "Fitness history",
        keys: ["comfortable_fitness_history", "Comfortable fitness history"]
      },
      { label: "Fitness goals and why", keys: ["fitness_goals", "Fitness goals and why"] },
      { label: "Goal timeline", keys: ["goal_timeline", "Goal timeline"] },
      { label: "Why now", keys: ["why_now", "Why now"] },
      { label: "Plan for achieving goals", keys: ["goal_plan", "Plan for achieving goals"] },
      { label: "Daily nutrition", keys: ["daily_nutrition", "Daily nutrition"] },
      { label: "Fitness apps", keys: ["fitness_apps", "Fitness apps"] },
      { label: "Commitment level", keys: ["commitment_level", "Commitment level"] },
      { label: "Ready for a change today?", keys: ["ready_for_change", "Ready for a change today?"] }
    ]
  },
  {
    title: "Lifestyle",
    questions: [
      { label: "Occupation", keys: ["occupation", "Occupation"] },
      { label: "Repetitive movements at work", keys: ["repetitive_movements", "Repetitive movements at work"] },
      { label: "Work anxiety or mental stress", keys: ["work_stress", "Work anxiety or mental stress"] },
      { label: "Recreational activities", keys: ["recreational_activities", "Recreational activities"] },
      { label: "Hobbies", keys: ["hobbies", "Hobbies"] },
      { label: "Pain or injuries", keys: ["pain_or_injuries", "Pain or injuries"] },
      { label: "Surgeries", keys: ["surgeries", "Surgeries"] },
      { label: "Sleep schedule", keys: ["sleep_schedule", "Sleep schedule"] }
    ]
  },
  {
    title: "Training logistics",
    questions: [
      {
        label: "Able to train at Castro Fitness, Market Street?",
        keys: ["castro_fitness", "Able to train at Castro Fitness, Market Street?"]
      },
      { label: "Home workout equipment", keys: ["home_equipment", "Home workout equipment"] },
      { label: "Preferred days", keys: ["availability_days", "Availability by day"] },
      { label: "Preferred days and times", keys: ["availability_times", "Availability by time"] },
      { label: "Anything else", keys: ["additional_notes", "Anything else"] }
    ]
  }
];
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
const customWorkoutDefaultWorkingSetCount = 3;
const customWorkoutDraftVersion = 2;
const clientDashboardUrl = "client-dashboard.html?v=manual-sessions-1";
const clientDashboardSidebarStorageKey = "fwb_client_dashboard_sidebar_collapsed_v1";
const clientHomeCheckinPromptMetadataKey = "home_checkin_prompt_seen_v1";
const clientHomeCheckinPromptStoragePrefix = "fwb_home_checkin_prompt_seen_v1";
const clientExerciseProgressPageSize = 10;
const workoutElapsedTimerStorageKey = "fwb_workout_elapsed_timer_v1";
const workoutElapsedTimerCompactStorageKey = "fwb_workout_elapsed_timer_compact_v1";
const workoutElapsedTimerPositionStorageKey = "fwb_workout_elapsed_timer_position_v3";
const workoutElapsedTimerMaximumMilliseconds = 24 * 60 * 60 * 1000;
const restTimerNotificationPreferenceStorageKey = "fwb_rest_timer_notifications_v1";
const restTimerNotificationServiceWorkerUrl = "/timer-notifications-sw.js?v=web-push-notifications-1";
let exerciseLibraryEntries = [];
let activeCustomWorkoutFormat = "single";
let restTimerDurationSeconds = 60;
let restTimerRemainingSeconds = 60;
let restTimerEndsAt = 0;
let restTimerIntervalId = null;
let restTimerReturnFocus = null;
let restTimerRunSequence = 0;
let restTimerActiveRunId = 0;
let restTimerLastNotifiedRunId = 0;
let customWorkoutGroupedRestAction = null;
let restTimerNotificationRegistrationPromise = null;
let restTimerNotificationPreferenceFallback = false;
let workoutElapsedTimerState = null;
let workoutElapsedTimerIntervalId = null;
let workoutElapsedTimerIsCompact = null;
let workoutElapsedTimerPosition = null;
let lastClientDashboardMobileTabPress = "";
let activeRirButton = null;
let pendingRirValue = null;
let workoutDifficultyPromptResolve = null;
let workoutDifficultyReturnFocus = null;
let pendingWorkoutDifficulty = null;
let pendingWorkoutEnergy = { before: null, after: null };
let lastWorkoutCompletionMessageIndex = -1;
let workoutCompletionShareReturnFocus = null;
let pendingWorkoutCompletionShare = null;
let pendingWorkoutCompletionShareFile = null;
let nextExercisePromptPanel = null;
let nextExercisePromptReturnFocus = null;
let customGroupedFinishPanel = null;
let customGroupedFinishReturnFocus = null;
let pendingGroupedCustomWorkoutRestart = null;

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

function renderCoachPreviewReturn(program = null) {
  const toolbar = document.getElementById("coach-preview-toolbar");
  const link = document.getElementById("coach-preview-return");
  if (!toolbar || !link) return;
  const isCoach = isCoachPortalEmail(normalizeClientEmail(activeDashboardUser?.email));
  toolbar.hidden = !isCoach;
  if (!isCoach) {
    link.removeAttribute("href");
    return;
  }
  // Coach Admin selects by program ID; the client preview URL selects by email.
  link.href = program?.id
    ? `coach-admin.html?client=${encodeURIComponent(program.id)}&tab=profile`
    : "coach-admin.html?tab=clients";
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

function clientHomeSnapshotValue(value, suffix = "") {
  if (value === null || value === undefined || String(value).trim() === "") {
    return "Not set";
  }

  const text = String(value).trim();

  return suffix && !/[a-z%]/i.test(text) ? `${text}${suffix}` : text;
}

function clientProgressRmr(entry = {}) {
  const bodyspec = progressMeasurements(entry).bodyspec;
  const value = bodyspec && typeof bodyspec === "object" ? bodyspec.rmr_cal_per_day : null;

  return value === null || value === undefined || value === "" ? null : value;
}

function latestClientRmrEntry(entries = progressEntries) {
  return (Array.isArray(entries) ? entries : []).slice().reverse()
    .find((entry) => clientProgressRmr(entry) !== null) || null;
}

function latestClientProgressValue(entries = progressEntries, valueForEntry = () => null) {
  const orderedEntries = Array.isArray(entries) ? entries : [];

  for (let index = orderedEntries.length - 1; index >= 0; index -= 1) {
    const value = valueForEntry(orderedEntries[index]);

    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return value;
    }
  }

  return null;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function clientHomeWeekRange(referenceDate = todayDate()) {
  const date = new Date(`${referenceDate}T12:00:00`);
  const mondayOffset = (date.getDay() + 6) % 7;
  const start = new Date(date);
  const end = new Date(date);

  start.setDate(date.getDate() - mondayOffset);
  end.setDate(start.getDate() + 6);

  return {
    start: localDateKey(start),
    end: localDateKey(end)
  };
}

function clientHomeWorkingLogs(logs = []) {
  return (Array.isArray(logs) ? logs : []).filter((log) => {
    const code = String(log.exercise_code || "").trim().toUpperCase();

    return ![warmupExerciseCode, cardioExerciseCode].includes(code) &&
      normalizedSetType(log.set_type, log.set_number) !== warmUpSetType &&
      ((Number(log.weight_used) || 0) > 0 || (Number(log.reps) || 0) > 0);
  });
}

function clientHomeTrainingSnapshot(logs = trainingLogs, feedback = workoutSessionFeedback) {
  const range = clientHomeWeekRange();
  const workingLogs = clientHomeWorkingLogs(logs);
  const weeklyLogs = workingLogs.filter((log) => {
    const date = String(log.entry_date || "");

    return date >= range.start && date <= range.end;
  });
  const priorLogs = workingLogs.filter((log) => String(log.entry_date || "") < range.start);
  const weeklySessionKeys = new Set(weeklyLogs.map((log) => (
    String(log.workout_session_id || log.session_id || "").trim() ||
    `${log.entry_date || ""}|${log.workout_title || "Workout"}`
  )));
  const completedFeedbackKeys = new Set((Array.isArray(feedback) ? feedback : [])
    .filter((entry) => {
      const date = String(entry.entry_date || "");

      return date >= range.start && date <= range.end;
    })
    .map((entry) => workoutFeedbackSessionId(entry) || `${entry.entry_date || ""}|${entry.workout_title || "Workout"}`));
  const priorBest = new Map();
  const weeklyBest = new Map();

  priorLogs.forEach((log) => {
    const key = normalizeExerciseHistoryName(log.exercise_name || log.exercise_code);
    const score = monthlyReportSetScore(log);

    if (key) {
      priorBest.set(key, Math.max(priorBest.get(key) || 0, score));
    }
  });
  weeklyLogs.forEach((log) => {
    const key = normalizeExerciseHistoryName(log.exercise_name || log.exercise_code);
    const score = monthlyReportSetScore(log);

    if (key) {
      weeklyBest.set(key, Math.max(weeklyBest.get(key) || 0, score));
    }
  });

  const personalBests = Array.from(weeklyBest.entries()).filter(([key, score]) => {
    const previous = priorBest.get(key) || 0;

    return previous > 0 && score > previous * 1.005;
  }).length;
  const workoutTarget = Array.isArray(currentProgram?.workouts) ? currentProgram.workouts.length : 0;
  const completedWorkouts = completedFeedbackKeys.size || weeklySessionKeys.size;
  const volume = weeklyLogs.reduce((total, log) => (
    total + ((Number(log.weight_used) || 0) * (Number(log.reps) || 0))
  ), 0);

  return {
    range,
    workouts: workoutTarget > 0 ? `${completedWorkouts} / ${workoutTarget}` : String(completedWorkouts),
    workingSets: weeklyLogs.length,
    volume: `${Math.round(volume).toLocaleString("en-US")} lb`,
    personalBests: `${personalBests} new`
  };
}

function renderClientHomeSnapshots(nutrition = nutritionPlanFromProgram(currentProgram || {})) {
  const bodyweight = latestClientProgressValue(progressEntries, (entry) => entry?.bodyweight);
  const bodyfat = latestClientProgressValue(progressEntries, (entry) => entry?.bodyfat);
  const leanMass = latestClientProgressValue(progressEntries, (entry) => entry?.lean_mass);
  const waist = latestClientProgressValue(progressEntries, (entry) => progressMeasurements(entry).waist);
  const rmr = latestClientProgressValue(progressEntries, clientProgressRmr);
  const training = clientHomeTrainingSnapshot();
  const weekStart = new Date(`${training.range.start}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  });

  setText("#client-home-snapshot-bodyweight", clientHomeSnapshotValue(bodyweight, " lb"));
  setText("#client-home-snapshot-bodyfat", clientHomeSnapshotValue(bodyfat, "%"));
  setText("#client-home-snapshot-lean-mass", clientHomeSnapshotValue(leanMass, " lb"));
  setText("#client-home-snapshot-waist", clientHomeSnapshotValue(waist, " in"));
  setText("#client-home-snapshot-rmr", clientHomeSnapshotValue(rmr, " cal/day"));
  setText("#client-home-snapshot-calories", clientHomeSnapshotValue(nutrition.calories));
  setText("#client-home-snapshot-protein", clientHomeSnapshotValue(nutrition.protein, "g"));
  setText("#client-home-snapshot-carbs", clientHomeSnapshotValue(nutrition.carbs, "g"));
  setText("#client-home-snapshot-fat", clientHomeSnapshotValue(nutrition.fat, "g"));
  setText("#client-home-snapshot-workouts", training.workouts);
  setText("#client-home-snapshot-week", `Week of ${weekStart}`);
  setText("#client-home-snapshot-working-sets", String(training.workingSets));
  setText("#client-home-snapshot-volume", training.volume);
  setText("#client-home-snapshot-personal-bests", training.personalBests);
}

function renderClientHomeSummary() {
  window.FWB_WEEKLY_ACTIVITY?.configure(supabaseClient, activeClientEmail, isCoachDashboardPreview);
  const homePanel = document.querySelector('[data-client-dashboard-panel="home"]');

  if (!homePanel || !currentProgram) {
    return;
  }

  const workouts = Array.isArray(currentProgram.workouts) ? currentProgram.workouts : [];
  const hasAssignedWorkout = workouts.length > 0;
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
  renderClientHomeSnapshots(nutrition);

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

function nutritionMacroChartModel(nutrition = {}) {
  const proteinGrams = numberValue(nutrition.protein);
  const carbGrams = numberValue(nutrition.carbs);
  const fatGrams = numberValue(nutrition.fat);
  const proteinCalories = proteinGrams * 4;
  const carbCalories = carbGrams * 4;
  const fatCalories = fatGrams * 9;
  const macroCalories = proteinCalories + carbCalories + fatCalories;
  const percent = (value) => macroCalories > 0 ? (value / macroCalories) * 100 : 0;
  const proteinPercent = percent(proteinCalories);
  const carbPercent = percent(carbCalories);
  const fatPercent = percent(fatCalories);

  return {
    calories: numberValue(nutrition.calories),
    proteinGrams,
    carbGrams,
    fatGrams,
    proteinPercent,
    carbPercent,
    fatPercent,
    proteinEnd: proteinPercent,
    carbEnd: proteinPercent + carbPercent,
    hasMacros: macroCalories > 0
  };
}

function renderNutritionMacroChart(nutrition = {}) {
  const overview = document.getElementById("client-nutrition-macro-overview");

  if (!overview) {
    return;
  }

  const chart = nutritionMacroChartModel(nutrition);
  const percentLabel = (value) => `${Math.round(value)}%`;
  const gramsLabel = (value) => value > 0 ? `${foodLogNumberLabel(value)}g` : "Not set";
  const chartLabel = chart.hasMacros
    ? `Macro distribution: protein ${percentLabel(chart.proteinPercent)}, carbs ${percentLabel(chart.carbPercent)}, fat ${percentLabel(chart.fatPercent)}.`
    : "Macro distribution will appear after protein, carbs, and fat are entered.";

  overview.innerHTML = `
    <div
      class="nutrition-macro-chart${chart.hasMacros ? "" : " is-empty"}"
      role="img"
      aria-label="${escapeHtml(chartLabel)}"
      style="--macro-protein-end: ${chart.proteinEnd.toFixed(2)}%; --macro-carbs-end: ${chart.carbEnd.toFixed(2)}%;"
    >
      <div class="nutrition-macro-chart-center">
        <strong>${escapeHtml(chart.calories > 0 ? foodLogNumberLabel(chart.calories) : "—")}</strong>
        <span>calorie target</span>
      </div>
    </div>
    <div class="nutrition-macro-chart-legend" aria-hidden="true">
      <span class="is-protein"><i></i><strong>Protein</strong><em>${escapeHtml(gramsLabel(chart.proteinGrams))} · ${percentLabel(chart.proteinPercent)}</em></span>
      <span class="is-carbs"><i></i><strong>Carbs</strong><em>${escapeHtml(gramsLabel(chart.carbGrams))} · ${percentLabel(chart.carbPercent)}</em></span>
      <span class="is-fat"><i></i><strong>Fat</strong><em>${escapeHtml(gramsLabel(chart.fatGrams))} · ${percentLabel(chart.fatPercent)}</em></span>
    </div>
  `;
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
    mixed: 1.3,
    active_job: 1.4
  };
  const workoutNumber = Math.min(Math.max(Number.parseInt(workoutsPerWeek, 10) || 0, 0), 7);
  const workoutBoost = workoutNumber === 0
    ? 0
    : workoutNumber <= 2
      ? 0.05
      : workoutNumber <= 4
        ? 0.1
        : workoutNumber <= 6
          ? 0.15
          : 0.18;
  // Daily movement already captures most non-exercise activity. Keep the
  // workout adjustment incremental so active jobs and training are not
  // counted as two full activity multipliers.
  const intensityBoost = workoutNumber === 0
    ? 0
    : intensity === "hard"
      ? 0.03
      : intensity === "light"
        ? -0.02
        : 0;
  const factor = (movementBase[movement] || movementBase.mixed) + workoutBoost + intensityBoost;

  return Number(Math.min(Math.max(factor, 1.2), 1.65).toFixed(2));
}

function nutritionGoalMultiplier(goal) {
  if (goal === "fat_loss") {
    return 0.85;
  }

  if (goal === "muscle_gain") {
    return 1.05;
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

function latestDexaWeight(entries = []) {
  const latest = [...entries].reverse().find((entry) => {
    const measurements = progressMeasurements(entry);
    const hasDexaMeasurements = measurements.bodyspec &&
      typeof measurements.bodyspec === "object" &&
      !Array.isArray(measurements.bodyspec);

    return hasDexaMeasurements && numberValue(entry.bodyweight) > 0;
  });

  if (!latest) {
    return null;
  }

  return {
    value: String(numberValue(latest.bodyweight)),
    date: String(latest.entry_date || "")
  };
}

function fillClientNutritionSetup(program = {}) {
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
  const weightSource = document.getElementById("client-nutrition-weight-source");
  const dexaWeight = latestDexaWeight(progressEntries);

  if (ageInput) {
    ageInput.value = nutrition.age || "";
  }
  if (heightInput) {
    heightInput.value = nutrition.height || (program.height === "Not set" ? "" : (program.height || ""));
  }
  if (weightInput) {
    weightInput.value = dexaWeight?.value || nutrition.current_weight || (program.starting_weight === "Not set" ? "" : (program.starting_weight || ""));
  }
  if (weightSource) {
    weightSource.hidden = !dexaWeight;
    weightSource.textContent = dexaWeight
      ? `Matched to ${formatLogDate(dexaWeight.date)} DEXA scan.`
      : "";
  }
}

function renderClientNutrition(program) {
  const targets = document.getElementById("client-nutrition-targets");
  const guide = document.getElementById("client-nutrition-guide");
  const status = document.getElementById("client-nutrition-status");
  const nutrition = nutritionPlanFromProgram(program);
  const hasTargets = Boolean(nutrition.calories || nutrition.protein || nutrition.carbs || nutrition.fat || nutrition.guide);

  renderNutritionMacroChart(nutrition);

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

function setFoodLabelImportStatus(message) {
  const status = document.getElementById("food-label-import-status");

  if (status) {
    status.textContent = message;
  }
}

function setFoodBarcodeDialogStatus(message) {
  const status = document.getElementById("food-barcode-dialog-status");

  if (status) {
    status.textContent = message;
  }
}

function canonicalFoodBarcode(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  const canonical = digits.length === 12 ? `0${digits}` : digits;

  if (![8, 13, 14].includes(canonical.length)) {
    return "";
  }

  const checkDigit = Number(canonical.at(-1));
  const body = canonical.slice(0, -1);
  const sum = Array.from(body).reduce((total, digit, index) => {
    const positionFromRight = body.length - index;
    return total + Number(digit) * (positionFromRight % 2 === 1 ? 3 : 1);
  }, 0);

  return (10 - (sum % 10)) % 10 === checkDigit ? canonical : "";
}

function foodLabelFileDetails(file) {
  const allowedTypes = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
  };
  const extension = allowedTypes[String(file?.type || "").toLowerCase()] || "";

  if (!file || !extension) {
    return { valid: false, message: "Choose a JPG, PNG, or WebP photo of the Nutrition Facts label." };
  }

  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > 8 * 1024 * 1024) {
    return { valid: false, message: "Choose a food-label photo smaller than 8 MB." };
  }

  return { valid: true, extension, contentType: file.type };
}

function normalizeSharedFoodLibraryResult(food = {}) {
  const source = String(food.source || "");

  return {
    libraryId: String(food.id || food.libraryId || ""),
    description: String(food.food_name || food.description || "").trim(),
    brandOwner: String(food.brand || food.brandOwner || "").trim(),
    serving: String(food.serving || "").trim(),
    calories: foodLogNumber(food.calories),
    protein: foodLogNumber(food.protein),
    carbs: foodLogNumber(food.carbs),
    fat: foodLogNumber(food.fat),
    barcode: canonicalFoodBarcode(food.barcode),
    confidence: String(food.confidence || ""),
    warnings: Array.isArray(food.warnings) ? food.warnings.filter(Boolean).slice(0, 5) : [],
    source: source === "Open Food Facts barcode"
      ? source
      : source === "barcode" || source === "Shared barcode food"
        ? "Shared barcode food"
        : "Shared food label"
  };
}

function renderSharedFoodLibrary(records = sharedFoodLibrary) {
  const select = document.getElementById("shared-food-library-select");
  sharedFoodLibrary = Array.isArray(records)
    ? records.map(normalizeSharedFoodLibraryResult).filter((food) => food.libraryId && food.description)
    : [];

  if (!select) {
    return;
  }

  select.innerHTML = `
    <option value="">${sharedFoodLibrary.length ? "Choose a previously saved label" : "No saved food labels yet"}</option>
    ${sharedFoodLibrary.map((food) => `
      <option value="${escapeHtml(food.libraryId)}">${escapeHtml([
        food.description,
        food.brandOwner,
        food.serving
      ].filter(Boolean).join(" · "))}</option>
    `).join("")}
  `;
}

async function loadSharedFoodLibrary() {
  if (!supabaseClient) {
    renderSharedFoodLibrary([]);
    return;
  }

  const { data, error } = await supabaseClient
    .from("shared_food_library")
    .select("id,food_name,brand,serving,calories,protein,carbs,fat,barcode,source,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    renderSharedFoodLibrary([]);
    setFoodLabelImportStatus("The shared food-label library could not be loaded. You can still enter food manually.");
    return;
  }

  renderSharedFoodLibrary(data || []);
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

function applyFoodResult(food, options = {}) {
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

  form.dataset.foodSource = food.source || "USDA FoodData Central";
  form.dataset.fdcId = food.fdcId || "";
  form.dataset.foodLibraryId = food.libraryId || "";
  form.dataset.foodLabelPending = options.foodLabelPending ? "true" : "";
  form.dataset.foodLabelBrand = food.brandOwner || food.brand || "";
  form.dataset.foodBarcode = canonicalFoodBarcode(options.foodBarcode || food.barcode);
}

function applyExtractedFoodLabel(food = {}) {
  const normalized = normalizeSharedFoodLibraryResult({
    ...food,
    libraryId: "",
    source: "Food label scan"
  });

  normalized.source = "Food label scan";
  applyFoodResult(normalized, { foodLabelPending: true });
  resetFoodSearchResults();
  setFoodEntryStatus("Label values filled in. Review the serving and every macro, then tap Save food.");
}

async function publishPendingFoodLabel(payload) {
  const form = foodEntryForm();
  if (!supabaseClient || form?.dataset.foodLabelPending !== "true") {
    return { saved: false, skipped: true };
  }

  const { data, error } = await supabaseClient.functions.invoke("extract-food-label", {
    body: {
      action: "publish",
      barcode: form.dataset.foodBarcode || "",
      food: {
        food_name: payload.food_name,
        brand: form.dataset.foodLabelBrand || "",
        serving: payload.serving,
        calories: payload.calories,
        protein: payload.protein,
        carbs: payload.carbs,
        fat: payload.fat,
        confidence: "high",
        warnings: []
      }
    }
  });

  if (error || data?.error || !data?.food) {
    return {
      saved: false,
      skipped: false,
      message: data?.error || error?.message || "The food was logged, but could not be added to the shared library."
    };
  }

  await loadSharedFoodLibrary();
  return { saved: true, skipped: false };
}

function stopFoodBarcodeScanner() {
  try {
    foodBarcodeScanControls?.stop?.();
  } catch {
    // A scanner that already stopped does not need further cleanup.
  }
  foodBarcodeScanControls = null;

  const video = document.getElementById("food-barcode-camera");
  const stream = video?.srcObject;
  if (stream && typeof stream.getTracks === "function") {
    stream.getTracks().forEach((track) => track.stop());
  }
  if (video) {
    video.srcObject = null;
  }
}

function closeFoodBarcodeDialog() {
  const dialog = document.getElementById("food-barcode-dialog");
  stopFoodBarcodeScanner();
  if (dialog?.open) {
    dialog.close();
  }
}

async function lookupFoodBarcode(value) {
  const barcode = canonicalFoodBarcode(value);
  const input = document.getElementById("food-barcode-manual-input");
  const lookupButton = document.getElementById("lookup-food-barcode-button");

  if (!barcode) {
    setFoodBarcodeDialogStatus("That does not look like a valid UPC, EAN, or GTIN. Check the numbers and try again.");
    input?.focus();
    return false;
  }

  if (foodBarcodeLookupInFlight) {
    return false;
  }

  if (!supabaseClient || !activeDashboardUser || isCoachPortalEmail(activeDashboardUser.email)) {
    setFoodBarcodeDialogStatus("Sign in as the client before looking up a barcode.");
    return false;
  }

  foodBarcodeLookupInFlight = true;
  if (lookupButton) {
    lookupButton.disabled = true;
  }
  stopFoodBarcodeScanner();
  setFoodBarcodeDialogStatus("Looking up nutrition facts…");

  try {
    const { data, error } = await withTimeout(
      supabaseClient.functions.invoke("extract-food-label", {
        body: { action: "lookup_barcode", barcode }
      }),
      "Barcode lookup timed out. Try the Nutrition Facts photo instead.",
      25000
    );

    if (error || data?.error || !data?.food) {
      throw new Error(data?.error || error?.message || "That barcode was not found. Try the Nutrition Facts photo instead.");
    }

    const food = normalizeSharedFoodLibraryResult(data.food);
    applyFoodResult(food, {
      foodLabelPending: !data.cached,
      foodBarcode: barcode
    });
    resetFoodSearchResults();
    setFoodEntryStatus("Barcode values filled in. Review the serving and every macro, then tap Save food.");
    setFoodLabelImportStatus(`${data.cached ? "Saved barcode food" : "Barcode found"}. Review every value before saving.`);
    closeFoodBarcodeDialog();
    foodEntryForm()?.querySelector('[name="food_name"]')?.focus();
    return true;
  } catch (error) {
    setFoodBarcodeDialogStatus(error?.message || "That barcode could not be found. Try the Nutrition Facts photo instead.");
    return false;
  } finally {
    foodBarcodeLookupInFlight = false;
    if (lookupButton) {
      lookupButton.disabled = false;
    }
  }
}

async function startFoodBarcodeScanner() {
  const video = document.getElementById("food-barcode-camera");
  const Reader = window.ZXingBrowser?.BrowserMultiFormatOneDReader;

  stopFoodBarcodeScanner();
  if (!video || !Reader || !navigator.mediaDevices?.getUserMedia) {
    setFoodBarcodeDialogStatus("Live scanning is not available in this browser. Enter the barcode numbers below or use a Nutrition Facts photo.");
    document.getElementById("food-barcode-manual-input")?.focus();
    return;
  }

  setFoodBarcodeDialogStatus("Point the rear camera at the UPC or EAN barcode.");
  try {
    const reader = new Reader();
    foodBarcodeScanControls = await reader.decodeFromConstraints(
      { audio: false, video: { facingMode: { ideal: "environment" } } },
      video,
      (result) => {
        const value = result?.getText?.() || result?.text || "";
        if (value && !foodBarcodeLookupInFlight) {
          const input = document.getElementById("food-barcode-manual-input");
          if (input) {
            input.value = value;
          }
          lookupFoodBarcode(value);
        }
      }
    );
  } catch {
    stopFoodBarcodeScanner();
    setFoodBarcodeDialogStatus("Camera access was unavailable. Allow camera access, enter the barcode numbers, or use a Nutrition Facts photo.");
    document.getElementById("food-barcode-manual-input")?.focus();
  }
}

function handleFoodBarcodeScanner() {
  const openButton = document.getElementById("open-food-barcode-scanner");
  const dialog = document.getElementById("food-barcode-dialog");
  const input = document.getElementById("food-barcode-manual-input");
  const lookupButton = document.getElementById("lookup-food-barcode-button");
  const photoFallback = document.getElementById("food-barcode-photo-fallback");

  openButton?.addEventListener("click", () => {
    foodBarcodeReturnFocus = openButton;
    if (input) {
      input.value = "";
    }
    dialog?.showModal();
    startFoodBarcodeScanner();
  });

  dialog?.querySelector("[data-close-food-barcode]")?.addEventListener("click", closeFoodBarcodeDialog);
  dialog?.addEventListener("cancel", stopFoodBarcodeScanner);
  dialog?.addEventListener("close", () => {
    stopFoodBarcodeScanner();
    foodBarcodeReturnFocus?.focus?.();
  });
  lookupButton?.addEventListener("click", () => lookupFoodBarcode(input?.value));
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      lookupFoodBarcode(input.value);
    }
  });
  photoFallback?.addEventListener("click", () => {
    closeFoodBarcodeDialog();
    document.getElementById("client-food-label-photo")?.click();
  });
}

function handleFoodLabelUpload() {
  const button = document.getElementById("read-food-label-button");
  const input = document.getElementById("client-food-label-photo");

  button?.addEventListener("click", async () => {
    const file = input?.files?.[0];
    const details = foodLabelFileDetails(file);

    if (!details.valid) {
      setFoodLabelImportStatus(details.message);
      input?.focus();
      return;
    }

    if (!supabaseClient || !activeDashboardUser || isCoachPortalEmail(activeDashboardUser.email)) {
      setFoodLabelImportStatus("Sign in as the client before reading a food label.");
      return;
    }

    button.disabled = true;
    input.disabled = true;
    setFoodLabelImportStatus("Reading calories and macros from the label…");

    try {
      const formData = new FormData();
      formData.append("photo", file, String(file.name || `food-label.${details.extension}`).slice(0, 180));
      const { data, error } = await withTimeout(
        supabaseClient.functions.invoke("extract-food-label", { body: formData }),
        "Food-label reading timed out. Try again or enter the values manually.",
        90000
      );

      if (error || data?.error || !data?.food) {
        throw new Error(data?.error || error?.message || "The label could not be read. Try a closer photo.");
      }

      applyExtractedFoodLabel(data.food);
      const warningText = Array.isArray(data.food.warnings) && data.food.warnings.length
        ? ` Check: ${data.food.warnings.join(" ")}`
        : "";
      setFoodLabelImportStatus(`Label read with ${data.food.confidence || "low"} confidence.${warningText} Review every value before saving.`);
      input.value = "";
      foodEntryForm()?.querySelector('[name="food_name"]')?.focus();
    } catch (error) {
      setFoodLabelImportStatus(error?.message || "The label could not be read. Try a closer photo or enter it manually.");
    } finally {
      button.disabled = false;
      input.disabled = false;
    }
  });
}

function handleSharedFoodLibrarySelect() {
  const select = document.getElementById("shared-food-library-select");

  select?.addEventListener("change", () => {
    const food = sharedFoodLibrary.find((item) => item.libraryId === select.value);
    if (!food) {
      return;
    }

    applyFoodResult(food);
    resetFoodSearchResults();
    setFoodLabelImportStatus("Saved label selected. Review the serving and macros before saving this food log.");
    setFoodEntryStatus("Saved label filled in. Adjust anything needed, then tap Save food.");
  });
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
  form.dataset.foodLibraryId = "";
  form.dataset.foodLabelPending = "";
  form.dataset.foodLabelBrand = "";
  form.dataset.foodBarcode = "";
  const librarySelect = document.getElementById("shared-food-library-select");
  if (librarySelect) {
    librarySelect.value = "";
  }
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

      const libraryResult = await publishPendingFoodLabel(payload);
      foodLogs = [data, ...foodLogs].sort((a, b) => String(b.entry_date || "").localeCompare(String(a.entry_date || "")));
      renderClientFoodLogs();
      renderClientTrainingLogs();
      resetFoodEntryForm();
      if (libraryResult.saved) {
        setFoodEntryStatus("Food saved and added to the shared food-label library.");
        setFoodLabelImportStatus("Saved label added to the library for all clients.");
      } else if (!libraryResult.skipped) {
        setFoodEntryStatus(libraryResult.message || "Food saved, but the shared library could not be updated.");
      } else {
        setFoodEntryStatus("Food saved.");
      }
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

function bodySpecMeasurements(entry = {}) {
  const measurements = progressMeasurements(entry);

  return measurements.bodyspec && typeof measurements.bodyspec === "object" && !Array.isArray(measurements.bodyspec)
    ? measurements.bodyspec
    : {};
}

function bodySpecHistoryRows(entry = {}) {
  const metrics = bodySpecMeasurements(entry);

  return bodySpecDexaFields
    .map(({ key, label, unit }) => [label, metrics[key], unit])
    .filter(([, value]) => value !== null && value !== undefined && value !== "");
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
    pieces.push(`Mood: ${/^[1-5]$/.test(mood) ? `${mood}/5` : mood}`);
  }

  if (energy) {
    pieces.push(`Energy: ${energy}/5`);
  }

  if (sleep) {
    pieces.push(`Sleep: ${sleep}/5`);
  }

  if (eating) {
    pieces.push(`Eating: ${/^[1-5]$/.test(eating) ? `${eating}/5` : eating}`);
  }

  if (bodyFeeling) {
    pieces.push(`Body: ${/^[1-5]$/.test(bodyFeeling) ? `${bodyFeeling}/5` : bodyFeeling}`);
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
  form.elements.progress_date.value = entry.entry_date || todayDate();
  form.elements.progress_bodyweight.value = entry.bodyweight ?? "";
  form.elements.progress_bodyfat.value = entry.bodyfat ?? "";
  form.elements.progress_lean_mass.value = entry.lean_mass ?? "";
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
    lean_mass: nextNumber("progress_lean_mass", existing.lean_mass),
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
  const normalizeName = exerciseNameMatcher?.normalizeName || ((value) => String(value || "").trim().toLowerCase());
  const normalizedName = normalizeName(exerciseName);

  if (!normalizedName) {
    return null;
  }

  return exerciseLibraryEntries.find((exercise) => (
    normalizeName(exercise.name) === normalizedName
    || (exercise.aliases || []).some((alias) => normalizeName(alias) === normalizedName)
  )) || null;
}

function uploadedExerciseDemoUrl(value) {
  try {
    const url = new URL(value);
    const storageOrigin = new URL(window.FWB_SUPABASE_CONFIG.url).origin;
    return url.protocol === "https:" && url.origin === storageOrigin
      && !url.username && !url.password
      && /^\/storage\/v1\/object\/public\/exercise-videos\/[a-z0-9/-]+\.(mp4|mov|m4v|webm)$/i.test(url.pathname)
      ? url.href : "";
  } catch {
    return "";
  }
}

function exerciseVideoUrl(exercise) {
  const approvedExercise = approvedExerciseForName(exercise.name);
  // A newly uploaded library demo also applies to existing workout plans,
  // which can already contain a generated YouTube search link.
  const libraryUpload = uploadedExerciseDemoUrl(approvedExercise?.demo_url);
  if (libraryUpload) return libraryUpload;
  let rawUrl = String(
    exercise.video ||
    exercise.videoUrl ||
    exercise.video_url ||
    exercise.youtube_url ||
    approvedExercise?.demo_url ||
    ""
  ).trim();
  const uploadedUrl = uploadedExerciseDemoUrl(rawUrl);
  if (uploadedUrl) return uploadedUrl;

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

function exerciseVideoMarkup(exercise, options = {}) {
  const videoUrl = exerciseVideoUrl(exercise);

  if (!videoUrl) {
    return "";
  }

  return `
    <a class="exercise-video-link" href="${escapeHtml(videoUrl)}" target="_blank" rel="noopener noreferrer" aria-label="View demo for ${escapeHtml(exercise.name)} (opens in a new tab)" title="View demo for ${escapeHtml(exercise.name)}">
      ${options.iconOnly ? '<span aria-hidden="true">🎥</span>' : "View demo"}
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
    lean_mass: { label: "DEXA lean mass", suffix: " lb" },
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
  const padding = 46;
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
      ${metricPoints.split(" ").filter(Boolean).map((point, index) => {
        const [x, y] = point.split(",").map(Number);
        const labelY = Math.max(15, y - 13);

        return `<text class="progress-chart-value" x="${x}" y="${labelY}" text-anchor="middle">${escapeHtml(values[index])}${escapeHtml(metric.suffix)}</text>`;
      }).join("")}
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
    activeProgressHistoryDeckIndex = 0;
    history.innerHTML = '<p class="empty-state">No measurements yet.</p>';
    return;
  }

  const orderedEntries = entries.slice().reverse();
  activeProgressHistoryDeckIndex = Math.min(activeProgressHistoryDeckIndex, orderedEntries.length - 1);
  const directionClass = clientProgressHistoryDirection > 0
    ? " is-forward"
    : clientProgressHistoryDirection < 0
    ? " is-backward"
    : "";
  const cards = orderedEntries.map((entry, index) => {
    const measurements = progressMeasurements(entry);
    const values = [
      ["Weight", entry.bodyweight, "lb"],
      ["Body fat", entry.bodyfat, "%"],
      ["Lean mass", entry.lean_mass, "lb"],
      ["Muscle", entry.muscle_mass, "lb"],
      ["Chest", measurements.chest, "in"],
      ["Waist", measurements.waist, "in"],
      ["Hips", measurements.hips, "in"],
      ["Arm", measurements.arm, "in"],
      ["Thigh", measurements.thigh, "in"],
      ...bodySpecHistoryRows(entry)
    ].filter(([, value]) => value !== null && value !== undefined && value !== "");
    const current = index === activeProgressHistoryDeckIndex;

    return `
      <button class="client-progress-history-row${current ? " is-current" : ""}" type="button" data-client-progress-history-card data-client-progress-id="${escapeHtml(entry.id)}" aria-label="Edit measurements from ${escapeHtml(formatLogDate(entry.entry_date))}" aria-hidden="${String(!current)}" tabindex="${current ? "0" : "-1"}">
        <div><strong>${escapeHtml(formatLogDate(entry.entry_date))}</strong>${entry.goal_note ? `<p>${escapeHtml(entry.goal_note)}</p>` : ""}</div>
        <div class="client-progress-history-values">${values.map(([label, value, unit]) => `<span><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}${escapeHtml(unit)}</strong></span>`).join("") || '<span class="empty-state">No values recorded.</span>'}</div>
      </button>
    `;
  }).join("");

  history.innerHTML = `
    <div class="client-progress-history-deck-heading">
      <strong>${activeProgressHistoryDeckIndex + 1} of ${orderedEntries.length}</strong>
      <div class="client-progress-history-deck-controls" aria-label="Measurement history navigation">
        <button type="button" data-client-progress-history-previous aria-label="Previous measurement" ${activeProgressHistoryDeckIndex === 0 ? "disabled" : ""}>‹</button>
        <button type="button" data-client-progress-history-next aria-label="Next measurement" ${activeProgressHistoryDeckIndex === orderedEntries.length - 1 ? "disabled" : ""}>›</button>
      </div>
    </div>
    <div class="client-progress-history-deck${directionClass}" data-client-progress-history-deck tabindex="0" aria-label="Measurement history card ${activeProgressHistoryDeckIndex + 1} of ${orderedEntries.length}">
      ${cards}
    </div>
    <small class="client-progress-history-hint">Choose a card to edit that measurement.</small>
  `;

  clientProgressHistoryDirection = 0;
}

function moveClientProgressHistoryDeck(step) {
  const count = progressEntries.length;

  if (!count) {
    return;
  }

  const nextIndex = Math.max(0, Math.min(activeProgressHistoryDeckIndex + step, count - 1));

  if (nextIndex === activeProgressHistoryDeckIndex) {
    return;
  }

  clientProgressHistoryDirection = step;
  activeProgressHistoryDeckIndex = nextIndex;
  renderClientProgressHistory(progressEntries);
  document.querySelector("[data-client-progress-history-deck]")?.focus({ preventScroll: true });
}

function handleClientProgressHistoryDeck() {
  let gesture = null;

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-client-progress-history-previous]")) {
      moveClientProgressHistoryDeck(-1);
    } else if (event.target.closest("[data-client-progress-history-next]")) {
      moveClientProgressHistoryDeck(1);
    }
  });

  document.addEventListener("keydown", (event) => {
    const deck = event.target.closest("[data-client-progress-history-deck]");

    if (!deck || event.target !== deck) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveClientProgressHistoryDeck(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveClientProgressHistoryDeck(1);
    } else if (event.key === "Home") {
      event.preventDefault();
      clientProgressHistoryDirection = -1;
      activeProgressHistoryDeckIndex = 0;
      renderClientProgressHistory(progressEntries);
      document.querySelector("[data-client-progress-history-deck]")?.focus({ preventScroll: true });
    } else if (event.key === "End") {
      event.preventDefault();
      clientProgressHistoryDirection = 1;
      activeProgressHistoryDeckIndex = Math.max(0, progressEntries.length - 1);
      renderClientProgressHistory(progressEntries);
      document.querySelector("[data-client-progress-history-deck]")?.focus({ preventScroll: true });
    }
  });

  document.addEventListener("pointerdown", (event) => {
    const deck = event.target.closest("[data-client-progress-history-deck]");

    if (!deck || event.target.closest("button, input, a")) {
      gesture = null;
      return;
    }

    gesture = {
      deck,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: ""
    };
  });

  document.addEventListener("pointermove", (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const horizontalDistance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);

    if (!gesture.axis && Math.max(horizontalDistance, verticalDistance) >= 8) {
      gesture.axis = horizontalDistance > verticalDistance * 1.2 ? "horizontal" : "vertical";
    }

    if (gesture.axis === "horizontal") {
      event.preventDefault();
      applyPhysicalDeckDrag(gesture.deck, deltaX, gesture.deck.getBoundingClientRect().width);
    }
  }, { passive: false });

  document.addEventListener("pointerup", (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }

    const { deck, startX, startY, axis } = gesture;
    const step = axis === "vertical"
      ? 0
      : clientWorkoutPickerSwipeStep(
        event.clientX - startX,
        event.clientY - startY,
        deck.getBoundingClientRect().width
      );

    releasePhysicalDeckDrag(deck);
    gesture = null;
    if (step !== 0) {
      moveClientProgressHistoryDeck(step);
    }
  });

  document.addEventListener("pointercancel", () => {
    releasePhysicalDeckDrag(gesture?.deck);
    gesture = null;
  });
}

function exerciseProgressNumber(value) {
  const number = Number(value);

  return Number.isFinite(number) ? String(number) : "0";
}

function exerciseProgressRecords(logs = []) {
  const grouped = new Map();

  logs.forEach((log) => {
    const code = String(log.exercise_code || "").trim().toUpperCase();
    const name = String(log.exercise_name || "").trim();
    const normalizedName = normalizeExerciseHistoryName(name);
    const date = String(log.entry_date || "");

    if (
      !date ||
      [warmupExerciseCode, cardioExerciseCode].includes(code) ||
      normalizedSetType(log.set_type, log.set_number) === warmUpSetType
    ) {
      return;
    }

    const weight = Number.isFinite(Number(log.weight_used)) ? Math.max(0, Number(log.weight_used)) : 0;
    const reps = Number.isFinite(Number(log.reps)) ? Math.max(0, Number(log.reps)) : 0;

    if (weight <= 0 && reps <= 0) {
      return;
    }

    if (!normalizedName && !code) {
      return;
    }
    const key = normalizedName
      ? `name:${normalizedName}`
      : `code:${normalizeExerciseHistoryName(log.workout_title)}:${code.toLowerCase()}`;

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
    const valueKey = tracksWeight ? "maxWeight" : "maxReps";
    // Keep the first date this record was achieved when later sessions tie it.
    const best = comparablePoints.reduce((record, point) => (
      !record || point[valueKey] > record[valueKey] ? point : record
    ), null);

    return {
      ...exercise,
      started,
      best,
      latestDate: points[points.length - 1]?.date || "",
      unit: tracksWeight ? "lb" : "reps",
      change: started && best ? Number((best[valueKey] - started[valueKey]).toPrecision(12)) : 0,
      startingValue: started?.[valueKey] || 0,
      bestValue: best?.[valueKey] || 0
    };
  })
    .filter((exercise) => exercise.started && exercise.best)
    .sort((left, right) => right.latestDate.localeCompare(left.latestDate));
}

function paginateClientExerciseProgress(records = [], pageSize = clientExerciseProgressPageSize) {
  const safeRecords = Array.isArray(records) ? records : [];
  const safePageSize = Math.max(1, Math.floor(Number(pageSize) || clientExerciseProgressPageSize));

  return Array.from(
    { length: Math.ceil(safeRecords.length / safePageSize) },
    (_, pageIndex) => safeRecords.slice(pageIndex * safePageSize, (pageIndex + 1) * safePageSize)
  );
}

function clientExerciseProgressCardMarkup(record) {
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
          <small>Personal best</small>
          <strong>${escapeHtml(exerciseProgressNumber(record.bestValue))} ${escapeHtml(record.unit)}</strong>
          <em>${escapeHtml(formatLogDate(record.best.date))}</em>
        </span>
      </div>
    </article>
  `;
}

function renderClientExerciseProgress(logs = trainingLogs) {
  const container = document.getElementById("client-exercise-progress");
  const count = document.getElementById("client-exercise-progress-count");
  const previous = document.querySelector("[data-client-exercise-progress-previous]");
  const next = document.querySelector("[data-client-exercise-progress-next]");

  if (!container) {
    return;
  }

  const allRecords = exerciseProgressRecords(logs);
  const search = normalizeExerciseHistoryName(clientExerciseProgressSearch);
  const records = allRecords.filter((record) => (
    !search || normalizeExerciseHistoryName(`${record.code} ${record.name}`).includes(search)
  ));
  const pages = paginateClientExerciseProgress(records);

  if (records.length === 0) {
    const emptyMessage = search
      ? `No exercises match “${escapeHtml(clientExerciseProgressSearch)}.”`
      : "Log a working set to see your exercise personal bests.";

    container.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    if (count) {
      count.textContent = search ? "No matches" : "No exercises yet";
    }
    if (previous) {
      previous.disabled = true;
    }
    if (next) {
      next.disabled = true;
    }
    return;
  }

  clientExerciseProgressIndex = ((clientExerciseProgressIndex % pages.length) + pages.length) % pages.length;
  const pageRecords = pages[clientExerciseProgressIndex];
  const pageStart = clientExerciseProgressIndex * clientExerciseProgressPageSize;
  const directionClass = clientExerciseProgressDirection > 0
    ? " is-forward"
    : clientExerciseProgressDirection < 0
      ? " is-backward"
      : "";

  container.innerHTML = `
    <div class="progress-exercise-deck${directionClass}">
      <section class="progress-exercise-page" aria-label="Exercise card ${clientExerciseProgressIndex + 1} of ${pages.length}">
        ${pageRecords.map(clientExerciseProgressCardMarkup).join("")}
      </section>
    </div>
  `;
  clientExerciseProgressDirection = 0;
  if (count) {
    const pageEnd = Math.min(pageStart + pageRecords.length, records.length);
    count.textContent = pages.length > 1
      ? `${pageStart + 1}–${pageEnd} of ${records.length} exercises · Card ${clientExerciseProgressIndex + 1} of ${pages.length}`
      : `${records.length} exercise${records.length === 1 ? "" : "s"}`;
  }
  if (previous) {
    previous.disabled = pages.length < 2;
  }
  if (next) {
    next.disabled = pages.length < 2;
  }
}

function moveClientExerciseProgress(step) {
  const direction = Math.sign(Number(step) || 0);

  if (!direction) {
    return;
  }

  clientExerciseProgressDirection = direction;
  clientExerciseProgressIndex += direction;
  renderClientExerciseProgress(trainingLogs);
}

function handleClientExerciseProgressCarousel() {
  let gesture = null;

  document.addEventListener("input", (event) => {
    if (event.target.id !== "client-exercise-progress-search") {
      return;
    }

    clientExerciseProgressSearch = event.target.value || "";
    clientExerciseProgressIndex = 0;
    clientExerciseProgressDirection = 0;
    renderClientExerciseProgress(trainingLogs);
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-client-exercise-progress-previous]")) {
      moveClientExerciseProgress(-1);
    } else if (event.target.closest("[data-client-exercise-progress-next]")) {
      moveClientExerciseProgress(1);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!event.target.closest("[data-client-exercise-progress-carousel]") || !["ArrowLeft", "ArrowRight"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    moveClientExerciseProgress(event.key === "ArrowRight" ? 1 : -1);
  });

  document.addEventListener("pointerdown", (event) => {
    const carousel = event.target.closest("[data-client-exercise-progress-carousel]");

    if (!carousel || event.target.closest("button, input, a")) {
      gesture = null;
      return;
    }

    gesture = {
      deck: carousel.querySelector(".progress-exercise-deck"),
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: ""
    };
  });

  document.addEventListener("pointermove", (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const horizontalDistance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);

    if (!gesture.axis && Math.max(horizontalDistance, verticalDistance) >= 8) {
      gesture.axis = horizontalDistance > verticalDistance * 1.2 ? "horizontal" : "vertical";
    }

    if (gesture.axis === "horizontal" && gesture.deck) {
      event.preventDefault();
      applyPhysicalDeckDrag(gesture.deck, deltaX, gesture.deck.getBoundingClientRect().width);
    }
  }, { passive: false });

  document.addEventListener("pointerup", (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    releasePhysicalDeckDrag(gesture.deck);
    gesture = null;

    if (Math.abs(deltaX) >= 48 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
      moveClientExerciseProgress(deltaX < 0 ? 1 : -1);
    }
  });

  document.addEventListener("pointercancel", () => {
    releasePhysicalDeckDrag(gesture?.deck);
    gesture = null;
  });
}

function monthlyReportMonthLabel(monthKey) {
  const [year, month] = String(monthKey || "").split("-").map(Number);

  if (!year || !month) {
    return "Monthly";
  }

  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function monthlyReportClientName() {
  const metadata = activeDashboardUser?.user_metadata || {};
  const emailName = String(activeClientEmail || "").split("@")[0].replace(/[._-]+/g, " ");

  return String(
    currentProgram?.client_name ||
    metadata.full_name ||
    metadata.name ||
    emailName ||
    "Client"
  ).trim();
}

function monthlyReportWorkingLogs(logs, monthKey) {
  return (Array.isArray(logs) ? logs : []).filter((log) => {
    const code = String(log.exercise_code || "").trim().toUpperCase();
    const date = String(log.entry_date || "");

    return date.slice(0, 7) === monthKey &&
      ![warmupExerciseCode, cardioExerciseCode].includes(code) &&
      normalizedSetType(log.set_type, log.set_number) !== warmUpSetType &&
      ((Number(log.weight_used) || 0) > 0 || (Number(log.reps) || 0) > 0);
  });
}

function monthlyReportSetScore(log) {
  const weight = Number(log.weight_used) || 0;
  const reps = Number(log.reps) || 0;

  return weight > 0 ? weight * (1 + Math.max(reps, 0) / 30) : reps;
}

function monthlyReportBestSet(logs) {
  return logs.slice().sort((left, right) => {
    const scoreDifference = monthlyReportSetScore(right) - monthlyReportSetScore(left);

    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    return (Number(right.weight_used) || 0) - (Number(left.weight_used) || 0) ||
      (Number(right.reps) || 0) - (Number(left.reps) || 0);
  })[0] || null;
}

function monthlyReportSetLabel(log) {
  const weight = Number(log?.weight_used) || 0;
  const reps = Number(log?.reps) || 0;

  if (weight > 0 && reps > 0) {
    return `${exerciseProgressNumber(weight)} lb × ${exerciseProgressNumber(reps)}`;
  }
  if (weight > 0) {
    return `${exerciseProgressNumber(weight)} lb`;
  }

  return `${exerciseProgressNumber(reps)} reps`;
}

function monthlyReportExerciseHighlights(logs) {
  const exercises = new Map();

  logs.forEach((log) => {
    const name = String(log.exercise_name || log.exercise_code || "Exercise").trim();
    const key = normalizeExerciseHistoryName(name);
    const date = String(log.entry_date || "");

    if (!key || !date) {
      return;
    }
    if (!exercises.has(key)) {
      exercises.set(key, { name, dates: new Map(), logs: [] });
    }

    const exercise = exercises.get(key);
    exercise.logs.push(log);
    if (!exercise.dates.has(date)) {
      exercise.dates.set(date, []);
    }
    exercise.dates.get(date).push(log);
  });

  const records = Array.from(exercises.values()).map((exercise) => {
    const dates = Array.from(exercise.dates.keys()).sort();
    const first = monthlyReportBestSet(exercise.dates.get(dates[0]) || []);
    const latest = monthlyReportBestSet(exercise.dates.get(dates[dates.length - 1]) || []);
    const benchmark = monthlyReportBestSet(exercise.logs);
    const firstScore = monthlyReportSetScore(first || {});
    const latestScore = monthlyReportSetScore(latest || {});
    const improvement = firstScore > 0 ? (latestScore - firstScore) / firstScore : 0;
    const progressed = dates.length > 1 && improvement > 0.005;

    return {
      name: exercise.name,
      first,
      latest,
      benchmark,
      progressed,
      improvement,
      benchmarkScore: monthlyReportSetScore(benchmark || {})
    };
  });
  const progressRecords = records
    .filter((record) => record.progressed)
    .sort((left, right) => right.improvement - left.improvement)
    .slice(0, 3)
    .map((record) => ({
      name: record.name,
      type: "Progress",
      value: `${monthlyReportSetLabel(record.first)} → ${monthlyReportSetLabel(record.latest)}`
    }));
  const progressNames = new Set(progressRecords.map((record) => normalizeExerciseHistoryName(record.name)));
  const benchmarkRecords = records
    .filter((record) => !progressNames.has(normalizeExerciseHistoryName(record.name)))
    .sort((left, right) => right.benchmarkScore - left.benchmarkScore)
    .slice(0, Math.max(0, 5 - progressRecords.length))
    .map((record) => ({
      name: record.name,
      type: "Benchmark",
      value: monthlyReportSetLabel(record.benchmark)
    }));

  return [...progressRecords, ...benchmarkRecords].slice(0, 5);
}

function buildMonthlyProgressReport(logs, monthKey = "") {
  const currentMonth = todayDate().slice(0, 7);
  const availableMonths = Array.from(new Set((Array.isArray(logs) ? logs : [])
    .map((log) => String(log.entry_date || "").slice(0, 7))
    .filter((key) => /^\d{4}-\d{2}$/.test(key) && key < currentMonth)))
    .sort()
    .reverse();
  const selectedMonth = availableMonths.includes(monthKey) ? monthKey : availableMonths[0];

  if (!selectedMonth) {
    return null;
  }

  const workingLogs = monthlyReportWorkingLogs(logs, selectedMonth);

  if (workingLogs.length === 0) {
    return null;
  }

  const sessions = new Set(workingLogs.map((log) => (
    String(log.workout_session_id || log.session_id || "").trim() ||
    `${log.entry_date || ""}|${log.workout_title || "Workout"}`
  )));
  const exercises = new Set(workingLogs.map((log) => normalizeExerciseHistoryName(log.exercise_name || log.exercise_code)).filter(Boolean));
  const activeWeeks = new Set(workingLogs.map((log) => {
    const day = Number(String(log.entry_date || "").slice(8, 10)) || 1;

    return Math.floor((day - 1) / 7) + 1;
  }));
  const workouts = sessions.size;
  const nextMonthDate = new Date(`${selectedMonth}-01T00:00:00Z`);
  nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1);
  const nextMonth = nextMonthDate.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const frequencyFocus = workouts < 4
    ? "Schedule at least one workout each week."
    : `Keep training frequency near ${workouts} sessions per month.`;

  return {
    monthKey: selectedMonth,
    monthLabel: monthlyReportMonthLabel(selectedMonth),
    clientName: monthlyReportClientName(),
    workouts,
    workingSets: workingLogs.length,
    activeWeeks: activeWeeks.size,
    exerciseCount: exercises.size,
    highlights: monthlyReportExerciseHighlights(workingLogs),
    nextMonth,
    focus: [
      frequencyFocus,
      "Add load or reps only when prescribed reps stay controlled.",
      "Log every working set so comparisons stay complete."
    ]
  };
}

function monthlyProgressReportUrl(monthKey, tabName = "progress") {
  const url = new URL(window.location.href);

  url.searchParams.set("tab", tabName);
  url.searchParams.set("report", monthKey);
  url.hash = "";

  return url.toString();
}

function monthlyProgressReportMarkup(report) {
  const highlights = report.highlights.length > 0
    ? report.highlights.map((highlight) => `
        <div class="client-monthly-report-highlight">
          <span><strong>${escapeHtml(highlight.name)}</strong><small class="is-${escapeHtml(highlight.type.toLowerCase())}">${escapeHtml(highlight.type)}</small></span>
          <b>${escapeHtml(highlight.value)}</b>
        </div>
      `).join("")
    : '<p class="empty-state">No comparable exercise sets were logged this month.</p>';

  return `
    <header class="client-monthly-report-hero">
      <p>Fitness with Benjamin</p>
      <h2>${escapeHtml(report.monthLabel)}<br />Monthly Training Report</h2>
      <span>${escapeHtml(report.clientName)}</span>
    </header>
    <div class="client-monthly-report-metrics" aria-label="${escapeHtml(report.monthLabel)} summary">
      <div><strong>${escapeHtml(report.workouts)}</strong><span>Workouts</span></div>
      <div><strong>${escapeHtml(report.workingSets)}</strong><span>Working sets</span></div>
      <div><strong>${escapeHtml(report.exerciseCount)}</strong><span>Exercises</span></div>
      <div><strong>${escapeHtml(report.activeWeeks)}</strong><span>Active weeks</span></div>
    </div>
    <section class="client-monthly-report-highlights">
      <h3>Exercise highlights</h3>
      ${highlights}
    </section>
    <section class="client-monthly-report-focus">
      <h3>${escapeHtml(report.nextMonth)} focus</h3>
      <ul>${report.focus.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>
    <p class="client-monthly-report-note">Based on completed working sets logged from ${escapeHtml(report.monthLabel)}.</p>
    <div class="client-monthly-report-actions">
      <button class="button button-dark" type="button" data-close-monthly-report>Close report</button>
      <button class="button button-ghost" type="button" data-print-monthly-report>Print / Save PDF</button>
    </div>
  `;
}

function openMonthlyProgressReport(monthKey, updateUrl = true, returnFocus = null) {
  const report = buildMonthlyProgressReport(trainingLogs, monthKey);
  const dialog = document.getElementById("client-monthly-report-dialog");
  const documentElement = document.getElementById("client-monthly-report-document");

  if (!report || !dialog || !documentElement) {
    return;
  }

  documentElement.innerHTML = monthlyProgressReportMarkup(report);
  setText("#client-monthly-report-dialog-title", `${report.monthLabel} report`);
  monthlyReportReturnTab = activeClientDashboardTab || "progress";
  monthlyReportReturnFocus = returnFocus || document.activeElement;
  if (typeof dialog.showModal === "function") {
    if (!dialog.open) {
      dialog.showModal();
    }
  } else {
    dialog.setAttribute("open", "");
  }

  if (updateUrl) {
    window.history.replaceState({}, "", monthlyProgressReportUrl(report.monthKey, monthlyReportReturnTab));
  }
}

function closeMonthlyProgressReport() {
  const dialog = document.getElementById("client-monthly-report-dialog");

  if (dialog?.open && typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog?.removeAttribute("open");
  }

  const url = new URL(window.location.href);
  url.searchParams.set("tab", monthlyReportReturnTab || "progress");
  url.searchParams.delete("report");
  window.history.replaceState({}, "", url.toString());
  monthlyReportReturnFocus?.focus?.();
  monthlyReportReturnFocus = null;
}

function renderMonthlyProgressReport(logs = trainingLogs) {
  const reportCards = [
    {
      card: document.getElementById("client-monthly-report-card"),
      link: document.getElementById("client-monthly-report-link"),
      title: "#client-monthly-report-title",
      summary: "#client-monthly-report-summary",
      tabName: "progress"
    },
    {
      card: document.getElementById("client-home-monthly-report-card"),
      link: document.getElementById("client-home-monthly-report-link"),
      title: "#client-home-monthly-report-title",
      summary: "#client-home-monthly-report-summary",
      tabName: "home"
    }
  ];
  const requestedMonth = new URLSearchParams(window.location.search).get("report") || "";

  latestMonthlyProgressReport = buildMonthlyProgressReport(logs);
  if (!reportCards.some(({ card, link }) => card && link)) {
    return;
  }

  reportCards.forEach(({ card }) => {
    if (card) {
      card.hidden = !latestMonthlyProgressReport;
    }
  });
  if (!latestMonthlyProgressReport) {
    setText("#client-progress-report-month", "Monthly");
    return;
  }

  const report = latestMonthlyProgressReport;
  setText("#client-progress-report-month", report.monthLabel);
  const summary = `${report.workouts} workout${report.workouts === 1 ? "" : "s"} · ${report.workingSets} working sets · ${report.activeWeeks} active week${report.activeWeeks === 1 ? "" : "s"}`;

  reportCards.forEach(({ link, title, summary: summarySelector, tabName }) => {
    if (!link) {
      return;
    }

    link.href = monthlyProgressReportUrl(report.monthKey, tabName);
    setText(title, `${report.monthLabel} training report`);
    setText(summarySelector, summary);
  });

  if (requestedMonth && buildMonthlyProgressReport(logs, requestedMonth)) {
    window.requestAnimationFrame?.(() => openMonthlyProgressReport(requestedMonth, false));
  }
}

function handleMonthlyProgressReport() {
  document.addEventListener("click", (event) => {
    const openLink = event.target.closest("[data-monthly-report-link]");
    const closeButton = event.target.closest("[data-close-monthly-report]");
    const printButton = event.target.closest("[data-print-monthly-report]");

    if (openLink) {
      event.preventDefault();
      openMonthlyProgressReport(latestMonthlyProgressReport?.monthKey, true, openLink);
      return;
    }
    if (closeButton) {
      closeMonthlyProgressReport();
      return;
    }
    if (printButton) {
      document.body.classList.add("is-printing-monthly-report");
      window.print();
    }
  });

  window.addEventListener("afterprint", () => {
    document.body.classList.remove("is-printing-monthly-report");
  });

  document.getElementById("client-monthly-report-dialog")?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeMonthlyProgressReport();
  });
}

function normalizeQuestionnaireAnswerKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function questionnaireAnswersObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(value);

    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function questionnaireAnswerText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    try {
      return Object.keys(value).length ? JSON.stringify(value) : "";
    } catch (error) {
      return "";
    }
  }

  return String(value).trim();
}

function questionnaireAnswerLabel(key) {
  const text = String(key || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "Additional detail";
}

function questionnaireDisplayGroups(answersValue) {
  const answers = questionnaireAnswersObject(answersValue);
  const indexedAnswers = new Map();

  Object.entries(answers).forEach(([key, value]) => {
    const normalizedKey = normalizeQuestionnaireAnswerKey(key);
    const text = questionnaireAnswerText(value);

    if (normalizedKey && text && !indexedAnswers.has(normalizedKey)) {
      indexedAnswers.set(normalizedKey, { key, text });
    }
  });

  const usedKeys = new Set();
  const groups = clientQuestionnaireQuestionGroups.map((group) => {
    const questions = group.questions.reduce((items, question) => {
      const match = question.keys
        .map((key) => normalizeQuestionnaireAnswerKey(key))
        .map((key) => indexedAnswers.get(key))
        .find(Boolean);

      if (match) {
        usedKeys.add(normalizeQuestionnaireAnswerKey(match.key));
        items.push({ label: question.label, response: match.text });
      }

      return items;
    }, []);

    return { title: group.title, questions };
  }).filter((group) => group.questions.length > 0);
  const ignoredKeys = new Set([
    "submittedat",
    "submissionid",
    "source",
    "email",
    "name",
    "respondentemail",
    "respondentname"
  ]);
  const additionalQuestions = [];

  indexedAnswers.forEach((answer, normalizedKey) => {
    if (!usedKeys.has(normalizedKey) && !ignoredKeys.has(normalizedKey)) {
      additionalQuestions.push({
        label: questionnaireAnswerLabel(answer.key),
        response: answer.text
      });
    }
  });

  if (additionalQuestions.length > 0) {
    groups.push({ title: "Additional details", questions: additionalQuestions });
  }

  return groups;
}

function formatQuestionnaireSubmittedAt(value) {
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    return value ? String(value) : "Date not available";
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function questionnaireStateElement(className, title, message, includeLink = false) {
  const state = document.createElement("div");
  const heading = document.createElement("h3");
  const description = document.createElement("p");

  state.className = className;
  heading.textContent = title;
  description.textContent = message;
  state.append(heading, description);

  if (includeLink) {
    const link = document.createElement("a");

    link.className = "button button-accent";
    link.href = "questionnaire.html?return=client";
    link.textContent = "Complete fitness questionnaire";
    state.append(link);
  }

  return state;
}

function renderClientQuestionnaire(record, state = "available") {
  const container = document.getElementById("client-questionnaire-record");
  const status = document.getElementById("client-questionnaire-status");

  if (!container) {
    clientQuestionnaire = state === "available" ? record || null : null;
    return;
  }

  clientQuestionnaire = state === "available" ? record || null : null;
  container.replaceChildren();
  container.setAttribute("aria-busy", state === "loading" ? "true" : "false");

  if (state === "loading") {
    if (status) {
      status.textContent = "Loading";
    }
    container.append(questionnaireStateElement(
      "client-questionnaire-loading",
      "Loading your questionnaire",
      "Checking for a fitness questionnaire linked to your account."
    ));
    return;
  }

  if (state === "error") {
    if (status) {
      status.textContent = "Unavailable";
    }
    container.append(questionnaireStateElement(
      "client-questionnaire-error",
      "Questionnaire unavailable",
      "We could not load your questionnaire right now. Refresh the page or message Benjamin if this continues."
    ));
    return;
  }

  if (!record) {
    if (status) {
      status.textContent = "Not submitted";
    }
    container.append(questionnaireStateElement(
      "client-questionnaire-empty",
      "No questionnaire linked yet",
      "Complete the fitness questionnaire and use the same email address as your client account.",
      true
    ));
    return;
  }

  if (status) {
    status.textContent = "Available";
  }

  const identity = document.createElement("article");
  const identityKicker = document.createElement("p");
  const name = document.createElement("h3");
  const emailText = String(record.respondent_email || "").trim();
  const hasValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailText);
  const email = hasValidEmail
    ? document.createElement("a")
    : document.createElement("span");
  const meta = document.createElement("p");

  identity.className = "client-questionnaire-identity";
  identityKicker.className = "kicker";
  identityKicker.textContent = "Questionnaire on file";
  name.className = "client-questionnaire-name";
  name.textContent = String(record.respondent_name || "").trim() || "Name not provided";
  email.className = "client-questionnaire-email";
  email.textContent = emailText || "Email not provided";
  if (hasValidEmail) {
    email.href = `mailto:${emailText}`;
  }
  meta.className = "client-questionnaire-meta";
  meta.textContent = `Submitted ${formatQuestionnaireSubmittedAt(record.submitted_at)}`;
  identity.append(identityKicker, name, email, meta);
  container.append(identity);

  const groups = questionnaireDisplayGroups(record.answers);

  if (groups.length === 0) {
    const emptyAnswers = document.createElement("p");

    emptyAnswers.className = "empty-state client-questionnaire-empty";
    emptyAnswers.textContent = "This questionnaire is linked, but it does not contain any saved answers.";
    container.append(emptyAnswers);
    return;
  }

  const groupsContainer = document.createElement("div");

  groupsContainer.className = "client-questionnaire-groups";
  groups.forEach((group) => {
    const groupElement = document.createElement("section");
    const groupTitle = document.createElement("h3");
    const answersElement = document.createElement("div");

    groupElement.className = "client-questionnaire-group";
    groupTitle.textContent = group.title;
    answersElement.className = "client-questionnaire-answers";

    group.questions.forEach((question) => {
      const answer = document.createElement("article");
      const questionText = document.createElement("p");
      const response = document.createElement("p");

      answer.className = "client-questionnaire-answer";
      questionText.className = "client-questionnaire-question";
      questionText.textContent = question.label;
      response.className = "client-questionnaire-response";
      response.textContent = question.response;
      answer.append(questionText, response);
      answersElement.append(answer);
    });

    groupElement.append(groupTitle, answersElement);
    groupsContainer.append(groupElement);
  });
  container.append(groupsContainer);
}

function clearClientQuestionnaire() {
  clientQuestionnaire = null;
  const container = document.getElementById("client-questionnaire-record");
  const status = document.getElementById("client-questionnaire-status");

  container?.replaceChildren();
  container?.removeAttribute("aria-busy");
  if (status) {
    status.textContent = "";
  }
}

function renderProgress(entries) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  progressEntries = safeEntries;
  const latest = safeEntries[safeEntries.length - 1];

  if (!latest) {
    setText("#progress-date", "No measurements yet");
    setText("#client-current-rmr", "Not set");
    setText("#client-current-rmr-meta", "Upload and save a DEXA report to add resting metabolic rate.");
    setText("#progress-goal", "");
    renderProgressGraph([]);
    renderClientProgressHistory([]);
    fillClientProgressForm();
    renderClientHomeSummary();
    return;
  }

  setText("#progress-date", `Latest measurement · ${formatLogDate(latest.entry_date)}`);
  const rmrEntry = latestClientRmrEntry(safeEntries);
  setText("#client-current-rmr", clientHomeSnapshotValue(clientProgressRmr(rmrEntry), " cal/day"));
  setText("#client-current-rmr-meta", rmrEntry
    ? `Latest saved DEXA estimate · ${formatLogDate(rmrEntry.entry_date)}`
    : "Upload and save a DEXA report to add resting metabolic rate.");
  fillClientProgressForm(latest);
  setText("#progress-goal", latest.goal_note ? `Updated goal: ${latest.goal_note}` : "");
  renderProgressGraph(safeEntries);
  renderClientProgressHistory(safeEntries);
  fillClientProgressForm(safeEntries.find((entry) => entry.entry_date === todayDate()) || {});
  fillClientNutritionSetup(currentProgram || {});
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
    "#client-checkin-form input, #client-checkin-form textarea, #client-save-progress-button, #client-add-past-progress-button, #client-progress-photo-date, #client-progress-photo-file, #client-progress-photo-note, #upload-client-progress-photo-button, #client-dexa-file, #upload-client-dexa-button, #client-dexa-review-form input, #client-dexa-review-form button"
  );

  controls.forEach((control) => {
    control.disabled = coachPreview;
  });

  if (coachPreview) {
    setClientProgressStatus("Client measurements are read-only here. Use Coach Admin to make changes.");
    setClientProgressPhotoStatus("Client progress photos are read-only in Coach View.");
    setClientDexaStatus("DEXA reports are read-only in Coach View.");
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

function setClientDexaStatus(message) {
  setText("#client-dexa-status", message);
}

function dexaFileDetails(file) {
  const allowedTypes = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/png": "png"
  };
  const extension = allowedTypes[String(file?.type || "").toLowerCase()] || "";

  if (!file || !extension) {
    return { valid: false, message: "Choose a PDF, JPG, or PNG DEXA report." };
  }

  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > 10 * 1024 * 1024) {
    return { valid: false, message: "Choose a DEXA report smaller than 10 MB." };
  }

  return { valid: true, extension, contentType: file.type };
}

function dexaReportStatusLabel(status) {
  return {
    processing: "Reading report",
    ready: "Ready to review",
    failed: "Needs attention",
    confirmed: "Measurements saved"
  }[status] || "Uploaded";
}

const bodySpecDexaFields = [
  { key: "fat_mass_lb", form: "dexa_fat_mass", label: "Fat mass", unit: "lb", min: 0, max: 1000 },
  { key: "bone_mineral_content_lb", form: "dexa_bone_mineral_content", label: "Bone mineral content", unit: "lb", min: 0, max: 50 },
  { key: "arms_fat_percent", form: "dexa_arms_fat_percent", label: "Arm fat", unit: "%", min: 0, max: 75 },
  { key: "legs_fat_percent", form: "dexa_legs_fat_percent", label: "Leg fat", unit: "%", min: 0, max: 75 },
  { key: "trunk_fat_percent", form: "dexa_trunk_fat_percent", label: "Trunk fat", unit: "%", min: 0, max: 75 },
  { key: "android_fat_percent", form: "dexa_android_fat_percent", label: "Android fat", unit: "%", min: 0, max: 75 },
  { key: "gynoid_fat_percent", form: "dexa_gynoid_fat_percent", label: "Gynoid fat", unit: "%", min: 0, max: 75 },
  { key: "ag_ratio", form: "dexa_ag_ratio", label: "A/G ratio", unit: "", min: 0, max: 10 },
  { key: "rmr_cal_per_day", form: "dexa_rmr", label: "RMR", unit: " cal/day", min: 500, max: 10000 },
  { key: "vat_mass_lb", form: "dexa_vat_mass", label: "Visceral fat mass", unit: "lb", min: 0, max: 100 },
  { key: "vat_volume_in3", form: "dexa_vat_volume", label: "Visceral fat volume", unit: " in³", min: 0, max: 1000 },
  { key: "bone_density_g_cm2", form: "dexa_bone_density", label: "Bone density", unit: " g/cm²", min: 0, max: 5 },
  { key: "bone_t_score", form: "dexa_bone_t_score", label: "Bone T-score", unit: "", min: -10, max: 10 },
  { key: "bone_z_score", form: "dexa_bone_z_score", label: "Bone Z-score", unit: "", min: -10, max: 10 },
  { key: "arms_lean_mass_lb", form: "dexa_arms_lean_mass", label: "Arms lean mass", unit: "lb", min: 0, max: 500 },
  { key: "legs_lean_mass_lb", form: "dexa_legs_lean_mass", label: "Legs lean mass", unit: "lb", min: 0, max: 500 },
  { key: "trunk_lean_mass_lb", form: "dexa_trunk_lean_mass", label: "Trunk lean mass", unit: "lb", min: 0, max: 500 },
  { key: "right_arm_lean_mass_lb", form: "dexa_right_arm_lean_mass", label: "Right arm lean mass", unit: "lb", min: 0, max: 250 },
  { key: "left_arm_lean_mass_lb", form: "dexa_left_arm_lean_mass", label: "Left arm lean mass", unit: "lb", min: 0, max: 250 },
  { key: "right_leg_lean_mass_lb", form: "dexa_right_leg_lean_mass", label: "Right leg lean mass", unit: "lb", min: 0, max: 250 },
  { key: "left_leg_lean_mass_lb", form: "dexa_left_leg_lean_mass", label: "Left leg lean mass", unit: "lb", min: 0, max: 250 }
];

function dexaReportExtractedValues(report = {}) {
  const extractionData = report.extraction_data && typeof report.extraction_data === "object"
    ? report.extraction_data
    : {};
  const extractedMetrics = extractionData.bodyspec_metrics && typeof extractionData.bodyspec_metrics === "object"
    ? extractionData.bodyspec_metrics
    : {};
  const confirmedValues = extractionData.confirmed_values && typeof extractionData.confirmed_values === "object"
    ? extractionData.confirmed_values
    : {};
  const values = {
    scan_date: report.extracted_scan_date || "",
    bodyweight_lb: report.extracted_bodyweight_lb ?? null,
    bodyfat_percent: report.extracted_bodyfat_percent ?? null,
    lean_mass_lb: report.extracted_lean_mass_lb ?? null
  };

  bodySpecDexaFields.forEach(({ key }) => {
    values[key] = report[key] ?? confirmedValues[key] ?? extractedMetrics[key] ?? null;
  });

  return values;
}

function clientDexaReportMarkup(report, { archived = false, readOnly = false } = {}) {
  const dateLabel = report.extracted_scan_date
    ? formatLogDate(report.extracted_scan_date)
    : formatLogDate(String(report.created_at || "").slice(0, 10));
  const canReview = report.status === "ready" && !archived && !readOnly;
  const canRetry = report.status === "failed" && !archived && !readOnly;
  const canDelete = report.status === "confirmed" && !readOnly;

  return `
    <article class="dexa-report-row${archived ? " is-archived" : ""}">
      <div class="dexa-report-summary">
        <strong class="client-dexa-report-filename" title="${escapeHtml(report.original_filename || "DEXA report")}">${escapeHtml(report.original_filename || "DEXA report")}</strong>
        <span>${escapeHtml(dateLabel || "Date unavailable")} · ${escapeHtml(dexaReportStatusLabel(report.status))}</span>
      </div>
      <div class="dexa-report-actions">
        ${canReview ? `<button class="button button-accent" type="button" data-client-dexa-report-review="${escapeHtml(report.id)}">Review values</button>` : ""}
        ${canRetry ? `<button class="button button-ghost" type="button" data-client-dexa-report-retry="${escapeHtml(report.id)}">Try extraction again</button>` : ""}
        <button class="button button-ghost" type="button" data-client-dexa-report-view="${escapeHtml(report.id)}">View</button>
        ${!readOnly ? `<button class="button button-ghost" type="button" data-client-dexa-report-${archived ? "restore" : "archive"}="${escapeHtml(report.id)}">${archived ? "Restore" : "Archive"}</button>` : ""}
        ${canDelete ? `<button class="button button-ghost dexa-report-delete" type="button" data-client-dexa-report-delete="${escapeHtml(report.id)}">Delete</button>` : ""}
      </div>
    </article>
  `;
}

function renderClientDexaReports(records) {
  dexaReports = Array.isArray(records) ? records : [];
  const list = document.getElementById("client-dexa-report-list");

  if (!list) {
    return;
  }

  if (!dexaReports.length) {
    archivedDexaReportsExpanded = false;
    list.innerHTML = '<p class="empty-state">No DEXA reports uploaded yet.</p>';
    return;
  }

  const readOnly = isCoachPortalEmail(activeDashboardUser?.email);
  const activeReports = dexaReports.filter((report) => !report.archived_at);
  const archivedReports = dexaReports.filter((report) => Boolean(report.archived_at));

  if (!archivedReports.length) {
    archivedDexaReportsExpanded = false;
  }

  list.innerHTML = `
    <div class="dexa-report-active-list">
      ${activeReports.map((report) => clientDexaReportMarkup(report, { readOnly })).join("") || '<p class="empty-state">No active reports. Archived reports stay available below.</p>'}
    </div>
    ${archivedReports.length ? `
      <button class="dexa-archive-toggle" type="button" data-client-dexa-archived-toggle aria-expanded="${String(archivedDexaReportsExpanded)}" aria-controls="client-dexa-archived-list">
        <span>Archived reports (${archivedReports.length})</span>
        <strong aria-hidden="true">${archivedDexaReportsExpanded ? "−" : "+"}</strong>
      </button>
      <div class="dexa-report-archived-list" id="client-dexa-archived-list" ${archivedDexaReportsExpanded ? "" : "hidden"}>
        ${archivedReports.map((report) => clientDexaReportMarkup(report, { archived: true, readOnly })).join("")}
      </div>
    ` : ""}
  `;
}

async function loadClientDexaReports(email = activeClientEmail) {
  if (!supabaseClient || !email) {
    renderClientDexaReports([]);
    return;
  }

  const { data, error } = await supabaseClient
    .from("client_dexa_reports")
    .select("id,client_email,storage_path,original_filename,mime_type,file_size_bytes,status,extracted_scan_date,extracted_bodyweight_lb,extracted_bodyfat_percent,extracted_lean_mass_lb,extraction_confidence,extraction_data,extraction_warnings,extraction_error,progress_entry_id,processed_at,confirmed_at,archived_at,created_at")
    .ilike("client_email", email)
    .order("created_at", { ascending: false });

  if (error) {
    renderClientDexaReports([]);
    setClientDexaStatus("DEXA reports could not be loaded. Refresh and try again.");
    return;
  }

  renderClientDexaReports(data || []);
}

function setDexaReviewWarnings(warnings = []) {
  const list = document.getElementById("client-dexa-extraction-warnings");
  const safeWarnings = Array.isArray(warnings)
    ? warnings.map((warning) => String(warning || "").trim()).filter(Boolean).slice(0, 6)
    : [];

  if (!list) {
    return;
  }

  list.hidden = safeWarnings.length === 0;
  list.innerHTML = safeWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
}

function showClientDexaReview(report, extracted = null, warnings = null) {
  const review = document.getElementById("client-dexa-review");
  const form = document.getElementById("client-dexa-review-form");

  if (!review || !form || !report?.id) {
    return;
  }

  const values = extracted || dexaReportExtractedValues(report);
  activeDexaReviewId = String(report.id);
  form.elements.dexa_scan_date.max = todayDate();
  form.elements.dexa_scan_date.value = values.scan_date || "";
  form.elements.dexa_bodyweight.value = values.bodyweight_lb ?? "";
  form.elements.dexa_bodyfat.value = values.bodyfat_percent ?? "";
  form.elements.dexa_lean_mass.value = values.lean_mass_lb ?? "";
  bodySpecDexaFields.forEach(({ key, form: fieldName }) => {
    if (form.elements[fieldName]) {
      form.elements[fieldName].value = values[key] ?? "";
    }
  });
  setDexaReviewWarnings(warnings ?? report.extraction_warnings ?? []);
  updateDexaExistingEntryNote();
  review.hidden = false;
  review.focus({ preventScroll: true });
  review.scrollIntoView({
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
    block: "nearest"
  });
}

function hideClientDexaReview() {
  const review = document.getElementById("client-dexa-review");
  const form = document.getElementById("client-dexa-review-form");

  activeDexaReviewId = "";
  form?.reset();
  setDexaReviewWarnings([]);
  if (review) {
    review.hidden = true;
  }
}

function updateDexaExistingEntryNote() {
  const form = document.getElementById("client-dexa-review-form");
  const note = document.getElementById("client-dexa-existing-entry-note");
  const scanDate = form?.elements.dexa_scan_date?.value || "";
  const existing = progressEntries.some((entry) => entry.entry_date === scanDate);

  if (!note) {
    return;
  }

  note.textContent = existing
    ? "A measurement entry already exists for this date. Saving will update the DEXA and BodySpec values; your muscle mass, tape measurements, and notes will stay unchanged."
    : "A new measurement entry will be created for this scan date.";
}

function reviewedDexaValues(form) {
  const scanDate = String(form?.elements.dexa_scan_date?.value || "");
  const optionalNumber = (name) => {
    const raw = String(form?.elements[name]?.value || "").trim();
    return raw === "" ? null : Number(raw);
  };
  const values = {
    scan_date: scanDate,
    bodyweight_lb: optionalNumber("dexa_bodyweight"),
    bodyfat_percent: optionalNumber("dexa_bodyfat"),
    lean_mass_lb: optionalNumber("dexa_lean_mass")
  };

  bodySpecDexaFields.forEach(({ key, form: fieldName }) => {
    values[key] = optionalNumber(fieldName);
  });

  if (!/^\d{4}-\d{2}-\d{2}$/.test(scanDate) || scanDate < "1900-01-01" || scanDate > todayDate()) {
    return { valid: false, message: "Choose the date shown on the DEXA report." };
  }

  if (Object.entries(values).every(([key, value]) => key === "scan_date" || value === null)) {
    return { valid: false, message: "Enter at least one measurement from the DEXA report." };
  }

  if (values.bodyweight_lb !== null && (!Number.isFinite(values.bodyweight_lb) || values.bodyweight_lb < 20 || values.bodyweight_lb > 1500)) {
    return { valid: false, message: "Bodyweight must be between 20 and 1,500 lb." };
  }

  if (values.bodyfat_percent !== null && (!Number.isFinite(values.bodyfat_percent) || values.bodyfat_percent < 1 || values.bodyfat_percent > 75)) {
    return { valid: false, message: "Body fat must be between 1 and 75%." };
  }

  if (values.lean_mass_lb !== null && (!Number.isFinite(values.lean_mass_lb) || values.lean_mass_lb < 10 || values.lean_mass_lb > 1400)) {
    return { valid: false, message: "Lean mass must be between 10 and 1,400 lb." };
  }

  if (values.bodyweight_lb !== null && values.lean_mass_lb !== null && values.lean_mass_lb > values.bodyweight_lb) {
    return { valid: false, message: "Lean mass cannot be greater than total bodyweight. Compare both values with the report." };
  }

  const invalidBodySpecField = bodySpecDexaFields.find(({ key, min, max }) => {
    const value = values[key];
    return value !== null && (!Number.isFinite(value) || value < min || value > max);
  });

  if (invalidBodySpecField) {
    return {
      valid: false,
      message: `${invalidBodySpecField.label} must be between ${invalidBodySpecField.min} and ${invalidBodySpecField.max}${invalidBodySpecField.unit}.`
    };
  }

  return { valid: true, values };
}

async function invokeDexaExtraction(report) {
  const { data, error } = await withTimeout(
    supabaseClient.functions.invoke("extract-dexa-report", {
      body: {
        action: "extract",
        storage_path: report.storage_path,
        original_filename: report.original_filename
      }
    }),
    "Automatic DEXA extraction timed out. Your private upload is still saved.",
    90000
  );

  if (error || data?.error) {
    throw new Error(data?.error || error?.message || "Automatic extraction could not read this report.");
  }

  if (!data?.report_id) {
    throw new Error("The report uploaded, but no extraction result was returned.");
  }

  return data;
}

async function reloadClientProgressEntries() {
  const email = normalizeClientEmail(activeClientEmail || currentProgram?.client_email);

  if (!supabaseClient || !email) {
    return;
  }

  const { data, error } = await withTimeout(
    supabaseClient
      .from("client_progress")
      .select("*")
      .ilike("client_email", email)
      .order("entry_date", { ascending: true }),
    "Progress reload timed out."
  );

  if (error) {
    throw error;
  }

  renderProgress(data || []);
}

function handleClientDexaUpload() {
  const button = document.getElementById("upload-client-dexa-button");
  const fileInput = document.getElementById("client-dexa-file");

  button?.addEventListener("click", async () => {
    const file = fileInput?.files?.[0];
    const details = dexaFileDetails(file);

    if (!supabaseClient || !activeDashboardUser || !activeClientEmail || isCoachPortalEmail(activeDashboardUser.email)) {
      return;
    }

    if (!details.valid) {
      setClientDexaStatus(details.message);
      fileInput?.focus();
      return;
    }

    button.disabled = true;
    fileInput.disabled = true;
    setClientDexaStatus("Uploading your private DEXA report...");
    const reportId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const storagePath = `${activeDashboardUser.id}/${reportId}.${details.extension}`;

    try {
      const { error: uploadError } = await supabaseClient.storage
        .from("dexa-reports")
        .upload(storagePath, file, {
          contentType: details.contentType,
          cacheControl: "3600",
          upsert: false
        });

      if (uploadError) {
        throw uploadError;
      }

      setClientDexaStatus("Report uploaded. Reading the scan values...");
      const result = await invokeDexaExtraction({
        storage_path: storagePath,
        original_filename: String(file.name || `dexa-report.${details.extension}`).slice(0, 255)
      });

      await loadClientDexaReports();
      const report = dexaReports.find((item) => String(item.id) === String(result.report_id)) || { id: result.report_id };
      showClientDexaReview(report, result.extracted, result.warnings);
      setClientDexaStatus("Report read. Compare every extracted value with the original before saving.");
      fileInput.value = "";
    } catch (error) {
      await loadClientDexaReports();
      setClientDexaStatus(error?.message || "The report was uploaded, but automatic extraction could not finish.");
    } finally {
      button.disabled = false;
      fileInput.disabled = false;
    }
  });
}

function handleClientDexaReports() {
  const list = document.getElementById("client-dexa-report-list");

  list?.addEventListener("click", async (event) => {
    const archivedToggle = event.target.closest("[data-client-dexa-archived-toggle]");

    if (archivedToggle) {
      archivedDexaReportsExpanded = !archivedDexaReportsExpanded;
      renderClientDexaReports(dexaReports);
      document.querySelector("[data-client-dexa-archived-toggle]")?.focus({ preventScroll: true });
      return;
    }

    const reviewButton = event.target.closest("[data-client-dexa-report-review]");
    const retryButton = event.target.closest("[data-client-dexa-report-retry]");
    const viewButton = event.target.closest("[data-client-dexa-report-view]");
    const archiveButton = event.target.closest("[data-client-dexa-report-archive]");
    const restoreButton = event.target.closest("[data-client-dexa-report-restore]");
    const deleteButton = event.target.closest("[data-client-dexa-report-delete]");
    const reportId = reviewButton?.dataset.clientDexaReportReview ||
      retryButton?.dataset.clientDexaReportRetry ||
      viewButton?.dataset.clientDexaReportView ||
      archiveButton?.dataset.clientDexaReportArchive ||
      restoreButton?.dataset.clientDexaReportRestore ||
      deleteButton?.dataset.clientDexaReportDelete;
    const report = dexaReports.find((item) => String(item.id) === String(reportId));

    if (!report || !supabaseClient) {
      return;
    }

    if (reviewButton) {
      showClientDexaReview(report);
      setClientDexaStatus("Compare every extracted value with the original before saving.");
      return;
    }

    if (retryButton && !isCoachPortalEmail(activeDashboardUser?.email)) {
      retryButton.disabled = true;
      setClientDexaStatus("Reading the report again...");
      try {
        const result = await invokeDexaExtraction(report);
        await loadClientDexaReports();
        const updated = dexaReports.find((item) => String(item.id) === String(result.report_id)) || report;
        showClientDexaReview(updated, result.extracted, result.warnings);
        setClientDexaStatus("Report read. Compare every extracted value with the original before saving.");
      } catch (error) {
        await loadClientDexaReports();
        setClientDexaStatus(error?.message || "Automatic extraction could not finish.");
      } finally {
        retryButton.disabled = false;
      }
      return;
    }

    if ((archiveButton || restoreButton) && !isCoachPortalEmail(activeDashboardUser?.email)) {
      const shouldArchive = Boolean(archiveButton);
      const actionButton = archiveButton || restoreButton;

      actionButton.disabled = true;
      setClientDexaStatus(shouldArchive ? "Archiving report..." : "Restoring report...");
      try {
        const { data, error } = await withTimeout(
          supabaseClient.functions.invoke("extract-dexa-report", {
            body: { action: "archive", report_id: report.id, archived: shouldArchive }
          }),
          "The report archive request timed out. Try again."
        );

        if (error || data?.error) {
          throw new Error(data?.error || error?.message || "The report could not be updated.");
        }

        if (shouldArchive && String(activeDexaReviewId) === String(report.id)) {
          hideClientDexaReview();
        }
        await loadClientDexaReports();
        setClientDexaStatus(shouldArchive
          ? "Report archived. Its saved measurements were not changed."
          : "Report restored to Uploaded reports.");
      } catch (error) {
        actionButton.disabled = false;
        setClientDexaStatus(error?.message || "The report could not be updated.");
      }
      return;
    }

    if (deleteButton && !isCoachPortalEmail(activeDashboardUser?.email)) {
      if (report.status !== "confirmed") {
        setClientDexaStatus("Review and save this report before deleting it.");
        return;
      }

      const confirmed = window.confirm(
        "Permanently delete this reviewed report file? Its saved measurements will stay in your progress history."
      );

      if (!confirmed) {
        return;
      }

      deleteButton.disabled = true;
      setClientDexaStatus("Deleting reviewed report...");
      try {
        const { data, error } = await withTimeout(
          supabaseClient.functions.invoke("extract-dexa-report", {
            body: { action: "delete", report_id: report.id }
          }),
          "The report delete request timed out. Try again."
        );

        if (error || data?.error) {
          throw new Error(data?.error || error?.message || "The reviewed report could not be deleted.");
        }

        if (String(activeDexaReviewId) === String(report.id)) {
          hideClientDexaReview();
        }
        await loadClientDexaReports();
        setClientDexaStatus("Reviewed report deleted. Its saved measurements remain in your progress history.");
      } catch (error) {
        deleteButton.disabled = false;
        setClientDexaStatus(error?.message || "The reviewed report could not be deleted.");
      }
      return;
    }

    if (viewButton) {
      const reportWindow = window.open("", "_blank");
      if (reportWindow) {
        reportWindow.opener = null;
        reportWindow.document.title = "Opening private DEXA report";
        reportWindow.document.body.textContent = "Opening private DEXA report...";
      }
      viewButton.disabled = true;
      setClientDexaStatus("Creating a secure, short-lived report link...");
      const { data, error } = await supabaseClient.storage
        .from("dexa-reports")
        .createSignedUrl(report.storage_path, 300);
      const signedUrl = data?.signedUrl || data?.signed_url || "";

      if (error || !signedUrl) {
        reportWindow?.close();
        setClientDexaStatus("The private report could not be opened. Try again.");
      } else if (reportWindow) {
        reportWindow.location.replace(signedUrl);
        setClientDexaStatus("Private report opened in a new tab.");
      } else {
        setClientDexaStatus("Your browser blocked the report tab. Allow pop-ups, then tap View report again.");
      }
      viewButton.disabled = false;
    }
  });
}

function handleClientDexaReview() {
  const form = document.getElementById("client-dexa-review-form");
  const cancelButton = document.getElementById("cancel-client-dexa-review-button");

  form?.elements.dexa_scan_date?.addEventListener("change", updateDexaExistingEntryNote);
  cancelButton?.addEventListener("click", () => {
    hideClientDexaReview();
    setClientDexaStatus("Review closed. Your private uploaded report is still available below.");
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const reviewed = reviewedDexaValues(form);

    if (!activeDexaReviewId) {
      setClientDexaStatus("Choose a report to review first.");
      return;
    }

    if (!reviewed.valid) {
      setClientDexaStatus(reviewed.message);
      return;
    }

    const button = document.getElementById("confirm-client-dexa-button");
    button.disabled = true;
    setClientDexaStatus("Saving your reviewed DEXA measurements...");

    try {
      const { data, error } = await withTimeout(
        supabaseClient.functions.invoke("extract-dexa-report", {
          body: {
            action: "confirm",
            report_id: activeDexaReviewId,
            values: reviewed.values
          }
        }),
        "Saving the DEXA measurements timed out.",
        30000
      );

      if (error || data?.error) {
        throw new Error(data?.error || error?.message || "The reviewed measurements could not be saved.");
      }

      await Promise.all([reloadClientProgressEntries(), loadClientDexaReports()]);
      hideClientDexaReview();
      setClientDexaStatus("Reviewed DEXA measurements saved to your progress log.");
    } catch (error) {
      setClientDexaStatus(error?.message || "The reviewed measurements could not be saved.");
    } finally {
      button.disabled = false;
    }
  });
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

  if (dateInput) {
    dateInput.max = todayDate();
  }

  dateInput?.addEventListener("change", () => {
    const entry = progressEntries.find((item) => item.entry_date === dateInput.value);
    fillClientProgressForm(entry || { entry_date: dateInput.value });
    setClientProgressStatus(entry ? "Loaded this measurement entry for editing." : "Ready for a new measurement entry.");
  });
}

function handleClientPastProgressEntry() {
  const button = document.getElementById("client-add-past-progress-button");

  button?.addEventListener("click", () => {
    const content = document.getElementById("client-progress-entry-content");
    const dateInput = document.querySelector('[name="progress_date"]');

    setClientProgressStatus("Choose the date of the DEXA scan or past measurement.");
    content?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
      block: "start"
    });
    dateInput?.focus({ preventScroll: true });

    try {
      dateInput?.showPicker?.();
    } catch (_error) {
      // Focusing the native date input remains the fallback on older browsers.
    }
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

function setRowMarkup(setNumber, repPlaceholder = "", setType = workingSetType, weightPlaceholder = "0", options = {}) {
  const normalizedType = normalizedSetType(setType, setNumber);
  const ordinal = warmUpOrdinal(setNumber);
  const isWarmUp = normalizedType === warmUpSetType;
  const label = setNumberLabel(setNumber, normalizedType);
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
      ${options.showComplete === false ? "" : `
        <button class="set-complete-button" type="button" data-complete-set aria-label="Complete ${normalizedType === warmUpSetType ? `warm-up set ${ordinal}` : `set ${Number(setNumber) || 1}`} and start rest timer" aria-pressed="false">
          <span aria-hidden="true">✓</span>
        </button>
      `}
    </div>
  `;
}

function setRows(exercise, setCount = setCountFromPrescription(exercise.prescription), options = {}) {
  const repTargets = repTargetsFromPrescription(exercise.prescription);
  const workingRows = Array.from({ length: Math.max(Number(setCount) || 0, 0) }, (_, index) => (
    setRowMarkup(index + 1, repTargets[index] || repTargets[0] || "", workingSetType, "0", options)
  ));

  return [
    setRowMarkup(warmUpSetNumberBase + 1, repTargets[0] || "", warmUpSetType, "0", options),
    ...workingRows
  ].join("");
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
  const collapsedTitle = card?.querySelector("[data-exercise-collapsed-name]");
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

  if (collapsedTitle) {
    collapsedTitle.textContent = editedName || logElement.dataset.exerciseName || "Exercise name";
  }

  const carousel = card?.closest("[data-custom-workout-carousel]");
  const cardIndex = carousel ? customWorkoutCarouselCards(carousel).indexOf(card) : -1;
  const groupInput = cardIndex >= 0
    ? carousel.querySelector(`[data-custom-workout-group-name-input="${cardIndex}"]`)
    : null;
  if (groupInput && groupInput !== document.activeElement && groupInput.value !== rawName) {
    groupInput.value = rawName;
  }
}

function setWorkoutExerciseCardExpanded(card, expanded) {
  if (!card) {
    return;
  }

  const isExpanded = Boolean(expanded);

  card.classList.toggle("is-open", isExpanded);
  card.querySelector("[data-exercise-toggle]")
    ?.setAttribute("aria-expanded", isExpanded ? "true" : "false");
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
      data-exercise-rest="${escapeHtml(exercise.rest || "")}"
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
        <button class="rir-help-trigger" type="button" data-rir-help aria-label="What does RIR mean?" aria-haspopup="dialog"><span>RIR</span><svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="8"/><path d="M10 9v5M10 5.5v1"/></svg></button>
      </div>
        <div data-set-rows>
          ${setRows(exercise, setCount, { showComplete: options.showSetComplete !== false })}
        </div>
        <div class="set-table-actions${addsSupersetExercise ? " has-add-superset-action" : ""}">
          <button class="add-set-button" type="button" data-add-set>+ Add Set</button>
          <button class="set-delete-last-button" type="button" data-delete-last-set>Delete Set</button>
          <button class="set-finished-button" type="button" data-finish-set${addsSupersetExercise ? " data-add-superset" : ""}>${escapeHtml(finishButtonLabel)}</button>
        </div>
      </div>
      ${options.groupActionSlot ? `
        <div class="workout-group-primary-action" data-workout-group-primary-action hidden>
          <button type="button" data-workout-group-log-set></button>
          <p class="custom-workout-carousel-cue" data-custom-workout-carousel-cue></p>
        </div>
      ` : ""}
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
          <span class="custom-workout-name-field-label" aria-hidden="true">Exercise name</span>
          <strong class="custom-workout-collapsed-name" data-exercise-collapsed-name>${escapeHtml(exerciseName || "Exercise name")}</strong>
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
        <div class="custom-workout-card-actions">
            <button class="custom-workout-delete-icon" type="button" data-delete-exercise aria-label="Delete ${marker}">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" />
              </svg>
            </button>
          <button class="custom-workout-card-toggle" type="button" data-exercise-toggle aria-label="Toggle ${marker}" aria-expanded="${isOpen ? "true" : "false"}"><i>›</i></button>
        </div>
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
          userManagedSets: clientAdded,
          groupActionSlot: format !== "single",
          showSetComplete: format === "single"
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

function workoutGroupDeckNextCardMarkup() {
  return `
    <button class="custom-workout-group-next-card" type="button" data-workout-group-next-card hidden>
      <span>
        <small data-workout-group-next-label>Up next</small>
        <strong data-workout-group-next-name>Next exercise</strong>
      </span>
      <span aria-hidden="true">↗</span>
    </button>
  `;
}

function assignedWorkoutCarouselMarkup(exercises, workoutTitle, workoutFocus, format, groupIndex = 0, startIndex = 0) {
  return customWorkoutCarouselGroupMarkup(format, exercises, groupIndex, startIndex, workoutTitle, {
    assigned: true,
    workoutFocus,
    panelFormat: format,
    canAddExercise: false,
    isLastGroup: false
  });
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

function customWorkoutDefaultExerciseCount(format) {
  switch (normalizeCustomWorkoutFormat(format)) {
    case "superset": return 2;
    case "circuit": return 3;
    default: return 1;
  }
}

function customWorkoutPanelHasEnteredExerciseContent(panel) {
  return Array.from(panel?.querySelectorAll("[data-custom-exercise-card] [data-exercise-log]") || []).some((logElement) => {
    const name = exerciseNameInputForLog(logElement)?.value || logElement.dataset.exerciseName || "";
    const notes = logElement.querySelector("[data-log-notes]")?.value || "";

    if (String(name).trim() || String(notes).trim() || logElement.dataset.exerciseSkipped === "true") {
      return true;
    }

    return Array.from(logElement.querySelectorAll("[data-set-row]")).some((row) => (
      String(row.querySelector("[data-set-weight]")?.value || "").trim() ||
      String(row.querySelector("[data-set-reps]")?.value || "").trim() ||
      String(row.dataset.repsInReserve || "").trim() ||
      row.classList.contains("is-complete") ||
      row.querySelector("[data-complete-set]")?.getAttribute("aria-pressed") === "true"
    ));
  });
}

function setUntouchedCustomWorkoutDefaultExercises(panel, format, cards = []) {
  const defaultExerciseCount = customWorkoutDefaultExerciseCount(format);
  const adjustedCards = Array.from(cards);

  while (adjustedCards.length < defaultExerciseCount) {
    const newCard = appendInlineGroupingPartner(panel);
    if (!newCard) break;
    adjustedCards.push(newCard);
  }

  while (adjustedCards.length > defaultExerciseCount) {
    adjustedCards.pop()?.remove();
  }

  return adjustedCards;
}

function normalizeCustomWorkoutInlineGroupType(value) {
  const normalized = String(value || "").trim().toLowerCase();

  return normalized === "superset" || normalized === "circuit" ? normalized : "single";
}

function customWorkoutMixedGroups(items = []) {
  const normalizedItems = items.map((item, index) => ({
    item,
    index,
    groupType: normalizeCustomWorkoutInlineGroupType(item?.groupType),
    group: Math.max(Number(item?.group) || 0, 0)
  }));
  const memberCounts = new Map();

  normalizedItems.forEach((entry) => {
    if (entry.groupType === "single") return;
    const key = `${entry.groupType}:${entry.group}`;
    memberCounts.set(key, (memberCounts.get(key) || 0) + 1);
  });

  return normalizedItems.reduce((groups, entry) => {
    const groupedKey = `${entry.groupType}:${entry.group}`;
    const format = entry.groupType !== "single" && (memberCounts.get(groupedKey) || 0) > 1
      ? entry.groupType
      : "single";
    // Every unchecked exercise remains its own straight-set card. Only cards
    // with an explicit matching group type and id belong in one carousel.
    const key = format === "single" ? `single:${entry.index}` : groupedKey;
    const previous = groups[groups.length - 1];

    if (previous?.key === key) {
      previous.items.push(entry.item);
      return groups;
    }

    groups.push({
      key,
      format,
      index: format === "single" ? groups.length : entry.group,
      startIndex: entry.index,
      items: [entry.item]
    });
    return groups;
  }, []);
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
      version: customWorkoutDraftVersion,
      updatedAt: new Date().toISOString(),
      ...draft
    }));
  } catch (_) {
    // Draft persistence is best-effort only.
  }
}

function upgradeCustomWorkoutDraft(draft) {
  if (!draft || Number(draft.version || 1) >= customWorkoutDraftVersion) {
    return draft;
  }

  const exercises = Array.isArray(draft.exercises) ? draft.exercises : [];
  const upgradedExercises = exercises.map((exercise) => {
    const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
    const hasEnteredSetData = sets.some((set) => (
      String(set?.weight || "").trim() ||
      String(set?.reps || "").trim() ||
      String(set?.rir || "").trim() ||
      set?.complete
    ));
    const workingSets = sets.filter((set, index) => (
      normalizedSetType(set?.setType, index + 1) !== warmUpSetType
    ));

    if (draft.copiedFrom || hasEnteredSetData || workingSets.length >= customWorkoutDefaultWorkingSetCount) {
      return exercise;
    }

    const nextSets = sets.length > 0
      ? [...sets]
      : [{ label: "W", weight: "", reps: "", setType: warmUpSetType, rir: "" }];

    for (let index = workingSets.length; index < customWorkoutDefaultWorkingSetCount; index += 1) {
      nextSets.push({
        label: String(index + 1),
        weight: "",
        reps: "",
        setType: workingSetType,
        rir: "",
        complete: false
      });
    }

    return { ...exercise, sets: nextSets };
  });

  return {
    ...draft,
    version: customWorkoutDraftVersion,
    exercises: upgradedExercises
  };
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

  const upgradedDraft = upgradeCustomWorkoutDraft(draft);

  if (upgradedDraft !== draft) {
    storeCustomWorkoutDraft(upgradedDraft);
  }

  return upgradedDraft;
}

function customWorkoutCopyStatusMessage(draft = activeCustomWorkoutDraft()) {
  const source = draft?.copiedFrom;
  const workoutTitle = String(source?.workoutTitle || "").trim();
  const entryDate = String(source?.entryDate || "").trim();

  if (!workoutTitle) {
    return "";
  }

  const sourceLabel = entryDate ? `${workoutTitle} from ${formatLogDate(entryDate)}` : workoutTitle;

  return `Copied ${sourceLabel}. Exercise names and set structure are ready. Review the workout format before starting; previous weights remain visible for reference.`;
}

function customWorkoutStorageTitle(draft = activeCustomWorkoutDraft()) {
  return String(draft?.workoutTitle || customWorkoutTitle).trim() || customWorkoutTitle;
}

function freshCustomWorkoutStorageTitle(createdAt = new Date()) {
  const time = [createdAt.getHours(), createdAt.getMinutes(), createdAt.getSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  const milliseconds = String(createdAt.getMilliseconds()).padStart(3, "0");

  return `${customWorkoutTitle} · New · ${time}.${milliseconds}`;
}

function freshCustomWorkoutDraft(createdAt = new Date()) {
  return {
    format: "single",
    date: todayDate(),
    workoutTitle: freshCustomWorkoutStorageTitle(createdAt),
    exercises: []
  };
}

function customWorkoutDraftExercises() {
  const exercises = activeCustomWorkoutDraft()?.exercises;
  return Array.isArray(exercises) ? exercises : [];
}

function customWorkoutExercises(format = activeCustomWorkoutFormat) {
  const grouped = new Map();

  customWorkoutDraftExercises().forEach((draftExercise, index) => {
    const code = String(draftExercise?.code || customExerciseCode(index)).trim().toUpperCase();
    const exerciseName = String(draftExercise?.name || "").trim();

    if (!grouped.has(code)) {
      grouped.set(code, {
        code,
        name: exerciseName,
        group: Math.max(Number(draftExercise?.group) || 0, 0),
        groupType: normalizeCustomWorkoutInlineGroupType(draftExercise?.groupType),
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

  if (exercises.length > 0) {
    return exercises;
  }

  const defaultExerciseCount = customWorkoutDefaultExerciseCount(format);

  return Array.from({ length: defaultExerciseCount }, (_, index) => ({
    code: customExerciseCode(index),
    name: "",
    group: 0,
    groupType: "single",
    prescription: "Custom sets",
    rest: ""
  }));
}

function serializeSetRowDraft(row) {
  const completeButton = row.querySelector("[data-complete-set]");

  return {
    label: row.querySelector("[data-set-label]")?.value || "",
    weight: row.querySelector("[data-set-weight]")?.value || "",
    reps: row.querySelector("[data-set-reps]")?.value || "",
    setType: setTypeForRow(row),
    rir: row.dataset.repsInReserve || "",
    complete: row.classList.contains("is-complete") || completeButton?.getAttribute("aria-pressed") === "true",
    groupedRoundRequired: row.dataset.groupedRoundRequired === "true"
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
    groupType: normalizeCustomWorkoutInlineGroupType(
      logElement.closest("[data-custom-exercise-card]")?.dataset.customWorkoutGroupType
    ),
    date: logElement.querySelector("[data-log-date]")?.value || "",
    notes: logElement.querySelector("[data-log-notes]")?.value || "",
    skipped: logElement.dataset.exerciseSkipped === "true",
    sets: Array.from(logElement.querySelectorAll("[data-set-row]")).map(serializeSetRowDraft)
  };
}

function customWorkoutPanelDraft(panel) {
  const currentDraft = activeCustomWorkoutDraft();
  const logElements = Array.from(panel?.querySelectorAll("[data-exercise-log]") || []);

  return {
    format: normalizeCustomWorkoutFormat(panel?.dataset.customWorkoutFormat || activeCustomWorkoutFormat),
    date: panel?.querySelector("[data-workout-date]")?.value || todayDate(),
    workoutTitle: String(panel?.dataset.customWorkoutTitle || currentDraft?.workoutTitle || customWorkoutTitle),
    ...(currentDraft?.copiedFrom ? { copiedFrom: currentDraft.copiedFrom } : {}),
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
  const completeButton = row.querySelector("[data-complete-set]");
  const complete = Boolean(draftSet?.complete);
  const setType = normalizedSetType(draftSet?.setType, row.dataset.setNumber);

  row.dataset.setType = setType;
  if (draftSet?.groupedRoundRequired) {
    row.dataset.groupedRoundRequired = "true";
  } else {
    delete row.dataset.groupedRoundRequired;
  }
  if (labelInput && setType === warmUpSetType) {
    labelInput.value = setNumberLabel(row.dataset.setNumber, setType);
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
  row.classList.toggle("is-complete", complete);
  completeButton?.setAttribute("aria-pressed", complete ? "true" : "false");
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
    customCard.dataset.customWorkoutGroupType = normalizeCustomWorkoutInlineGroupType(exerciseDraft.groupType);
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

function exerciseSuggestionRecords() {
  const suggestions = new Map();
  const addSuggestion = (value, libraryEntry = null) => {
    const name = String(value || "").trim();
    const approvedExercise = libraryEntry || approvedExerciseForName(name);
    const canonicalName = String(approvedExercise?.name || name).trim();
    const key = canonicalName.toLowerCase();

    if (!canonicalName) {
      return;
    }

    if (!suggestions.has(key)) {
      suggestions.set(key, {
        name: canonicalName,
        aliases: new Set(),
        libraryEntry: approvedExercise || null
      });
    }

    const record = suggestions.get(key);
    if (name && name.toLowerCase() !== canonicalName.toLowerCase()) {
      record.aliases.add(name);
    }
    (approvedExercise?.aliases || []).forEach((alias) => record.aliases.add(alias));
  };

  exerciseLibraryEntries.forEach((exercise) => {
    addSuggestion(exercise.name, exercise);
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

  return Array.from(suggestions.values())
    .map((record) => ({ ...record, aliases: Array.from(record.aliases) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function exerciseSuggestionNames() {
  return exerciseSuggestionRecords().map((record) => record.name);
}

function customExerciseSuggestionMatches(value) {
  const query = String(value || "").trim();
  const normalizedQuery = exerciseNameMatcher?.normalizeName(query) || query.toLowerCase();
  const recommendation = exerciseNameMatcher?.recommendedLibraryMatch(query, exerciseLibraryEntries) || null;
  const recommendationName = recommendation?.exercise?.name || "";
  const records = exerciseSuggestionRecords();
  const scored = records.map((record) => {
    const labels = [record.name, ...record.aliases];
    const substringMatch = !normalizedQuery || labels.some((label) => {
      const normalizedLabel = exerciseNameMatcher?.normalizeName(label) || label.toLowerCase();
      return normalizedLabel.includes(normalizedQuery);
    });
    const score = query && exerciseNameMatcher
      ? Math.max(...labels.map((label) => exerciseNameMatcher.nameSimilarity(query, label, record.libraryEntry || {})))
      : 0;
    const startsWithQuery = Boolean(normalizedQuery) && labels.some((label) => {
      const normalizedLabel = exerciseNameMatcher?.normalizeName(label) || label.toLowerCase();
      return normalizedLabel.startsWith(normalizedQuery);
    });

    return { ...record, substringMatch, score, startsWithQuery };
  });
  const matches = scored
    .filter((record) => !query || record.substringMatch || record.score >= 0.58)
    .filter((record) => record.name !== recommendationName)
    .sort((left, right) => {
      if (left.startsWithQuery !== right.startsWithQuery) {
        return left.startsWithQuery ? -1 : 1;
      }

      return right.score - left.score || left.name.localeCompare(right.name);
    })
    .slice(0, recommendation ? 11 : 12)
    .map((record) => ({ name: record.name, recommended: false }));

  if (recommendation) {
    matches.unshift({
      name: recommendationName,
      recommended: true,
      matchedLabel: recommendation.matchedLabel,
      score: recommendation.score
    });
  }

  return matches;
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

function selectCustomExerciseSuggestion(button) {
  const editor = button?.closest(".custom-workout-name-editor");
  const input = editor?.querySelector("[data-exercise-title-name]");

  if (!input) {
    return false;
  }

  input.value = button.dataset.customExerciseSuggestion || "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.blur();
  button.blur();
  closeCustomExerciseSuggestions();

  return true;
}

function renderCustomExerciseSuggestions(input) {
  const editor = input?.closest(".custom-workout-name-editor");
  const menu = editor?.querySelector("[data-custom-exercise-suggestions]");

  if (!editor || !menu) {
    return;
  }

  const matches = customExerciseSuggestionMatches(input.value);

  menu.innerHTML = matches.map((match) => `
    <button
      class="${match.recommended ? "is-recommended" : ""}"
      type="button"
      role="option"
      data-custom-exercise-suggestion="${escapeHtml(match.name)}"
    >
      ${match.recommended ? `
        <small>Did you mean?</small>
        <strong>${escapeHtml(match.name)}</strong>
        <span>Use the library name to keep progress together.</span>
      ` : escapeHtml(match.name)}
    </button>
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

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent || "") ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneWebApp() {
  return Boolean(
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}

function restTimerNotificationSupport() {
  if (!window.isSecureContext || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return { supported: false, reason: "unsupported" };
  }
  if (isIosDevice() && !isStandaloneWebApp()) {
    return { supported: false, reason: "ios-home-screen" };
  }
  return { supported: true, reason: "" };
}

function readRestTimerNotificationPreference() {
  try {
    const storedPreference = window.localStorage.getItem(restTimerNotificationPreferenceStorageKey);
    return storedPreference === null
      ? restTimerNotificationPreferenceFallback
      : storedPreference === "true";
  } catch (error) {
    return restTimerNotificationPreferenceFallback;
  }
}

function storeRestTimerNotificationPreference(enabled) {
  restTimerNotificationPreferenceFallback = Boolean(enabled);
  try {
    window.localStorage.setItem(restTimerNotificationPreferenceStorageKey, String(restTimerNotificationPreferenceFallback));
  } catch (error) {
    // Notifications can still work for this page even when storage is blocked.
  }
}

function restTimerNotificationsEnabled() {
  const support = restTimerNotificationSupport();
  return support.supported && window.Notification.permission === "granted" && readRestTimerNotificationPreference();
}

function restTimerNotificationUiState() {
  const support = restTimerNotificationSupport();

  if (!support.supported) {
    return {
      enabled: false,
      disabled: true,
      label: "Timer alerts unavailable",
      help: support.reason === "ios-home-screen"
        ? "On iPhone, add FWB to your Home Screen, then open it there to enable alerts."
        : "This browser cannot show timer notifications. Vibration and the on-screen timer still work."
    };
  }
  if (window.Notification.permission === "denied") {
    return {
      enabled: false,
      disabled: true,
      label: "Timer alerts blocked",
      help: "Allow notifications for FWB in your browser or device settings."
    };
  }

  const enabled = restTimerNotificationsEnabled();
  return {
    enabled,
    disabled: false,
    label: enabled ? "Timer alerts on" : "Enable timer alerts",
    help: enabled
      ? "Keep FWB open while the timer runs; you’ll get a system alert when rest ends."
      : "Turn this on once, then keep FWB open while the timer runs."
  };
}

function restTimerNotificationRegistration() {
  if (!restTimerNotificationSupport().supported) {
    return Promise.resolve(null);
  }
  if (!restTimerNotificationRegistrationPromise) {
    restTimerNotificationRegistrationPromise = navigator.serviceWorker
      .register(restTimerNotificationServiceWorkerUrl, { scope: "/" })
      .then(() => navigator.serviceWorker.ready)
      .catch(() => {
        restTimerNotificationRegistrationPromise = null;
        return null;
      });
  }
  return restTimerNotificationRegistrationPromise;
}

function renderRestTimerNotificationSetting() {
  const buttons = Array.from(document.querySelectorAll?.("[data-rest-timer-notifications]") || []);
  const helpItems = Array.from(document.querySelectorAll?.("[data-rest-timer-notification-help]") || []);

  if (!buttons.length) {
    return;
  }

  const state = restTimerNotificationUiState();
  buttons.forEach((button) => {
    button.textContent = state.label;
    button.disabled = state.disabled;
    button.classList.toggle("is-enabled", state.enabled);
    button.setAttribute("aria-pressed", state.enabled ? "true" : "false");
  });
  helpItems.forEach((help) => {
    help.textContent = state.help;
  });
}

async function toggleRestTimerNotifications() {
  const support = restTimerNotificationSupport();

  if (!support.supported || window.Notification.permission === "denied") {
    renderRestTimerNotificationSetting();
    return false;
  }
  if (restTimerNotificationsEnabled()) {
    storeRestTimerNotificationPreference(false);
    renderRestTimerNotificationSetting();
    return false;
  }

  let permission = window.Notification.permission;
  if (permission === "default") {
    try {
      permission = await window.Notification.requestPermission();
    } catch (error) {
      permission = "denied";
    }
  }

  const registration = permission === "granted"
    ? await restTimerNotificationRegistration()
    : null;
  const enabled = Boolean(permission === "granted" && registration);
  storeRestTimerNotificationPreference(enabled);
  renderRestTimerNotificationSetting();
  return enabled;
}

async function showRestTimerCompleteNotification() {
  if (!restTimerNotificationsEnabled()) {
    return false;
  }

  const options = {
    body: "Your next set is ready.",
    icon: "/fwb-home-icon-192.png",
    badge: "/favicon-32.png",
    tag: "fwb-rest-timer-complete",
    renotify: true,
    silent: false,
    timestamp: Date.now(),
    data: { url: "/client-dashboard.html?tab=workouts" }
  };

  try {
    const registration = await restTimerNotificationRegistration();
    if (registration?.showNotification) {
      await registration.showNotification("Rest complete", options);
      return true;
    }
    if (typeof window.Notification === "function") {
      new window.Notification("Rest complete", options);
      return true;
    }
  } catch (error) {
    // Vibration and the visible timer remain available if the OS rejects an alert.
  }
  return false;
}

function restTimerCompletionShouldNotify(runId, lastNotifiedRunId) {
  const safeRunId = Number(runId) || 0;
  return safeRunId > 0 && safeRunId !== (Number(lastNotifiedRunId) || 0);
}

function initializeRestTimerNotifications() {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return;
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event.data?.type === "FWB_OPEN_WORKOUTS") {
        setClientDashboardTab("workouts");
      }
    });
  }
  if (restTimerNotificationsEnabled()) {
    void restTimerNotificationRegistration();
  }
  renderRestTimerNotificationSetting();
}

async function initializeClientWebNotifications(user) {
  const root = document.querySelector('[data-client-dashboard-panel="notifications"] [data-web-notifications]');

  if (!root || !supabaseClient || !user?.id || isCoachDashboardPreview) {
    if (root) {
      root.hidden = true;
    }
    return false;
  }

  clientWebNotificationController?.destroy?.();
  clientWebNotificationController = window.FWBWebNotifications?.createController?.({
    supabaseClient,
    user,
    role: "client",
    root,
    unreadBadges: document.querySelectorAll("[data-client-notification-unread]"),
    unreadStatus: document.querySelector("[data-client-notification-unread-status]"),
    serviceWorkerUrl: restTimerNotificationServiceWorkerUrl
  }) || null;

  return clientWebNotificationController
    ? clientWebNotificationController.init()
    : false;
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
        <div class="rest-timer-notification-setting">
          <button type="button" data-rest-timer-notifications aria-pressed="false">Enable timer alerts</button>
          <small data-rest-timer-notification-help>Turn this on once, then keep FWB open while the timer runs.</small>
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
    const completedRunId = restTimerActiveRunId;
    restTimerEndsAt = 0;
    restTimerActiveRunId = 0;
    clearRestTimerInterval();

    if (typeof navigator.vibrate === "function") {
      navigator.vibrate([200, 100, 200]);
    }
    if (restTimerCompletionShouldNotify(completedRunId, restTimerLastNotifiedRunId)) {
      restTimerLastNotifiedRunId = completedRunId;
      void showRestTimerCompleteNotification();
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
  renderCustomWorkoutGroupedRestControls();
  renderRestTimerNotificationSetting();

}

function renderCustomWorkoutGroupedRestControls() {
  if (customWorkoutGroupedRestAction && !customWorkoutGroupedRestAction.isConnected) {
    customWorkoutGroupedRestAction = null;
  }

  document.querySelectorAll("[data-custom-grouped-round-action]").forEach((action) => {
    const isActive = action === customWorkoutGroupedRestAction;
    const logButton = action.querySelector("[data-custom-grouped-log-round]");
    const controls = action.querySelector("[data-custom-grouped-rest-controls]");
    const toggle = action.querySelector("[data-custom-grouped-rest-toggle]");

    if (logButton) logButton.hidden = isActive;
    if (controls) controls.hidden = !isActive;
    if (!isActive || !toggle) return;

    const timerAction = restTimerEndsAt
      ? "Pause"
      : (restTimerRemainingSeconds === 0 ? "Start" : "Resume");
    toggle.textContent = `Rest ${restTimerTimeLabel(restTimerRemainingSeconds)} · ${timerAction}`;
    toggle.setAttribute("aria-label", `${timerAction} rest timer at ${restTimerTimeLabel(restTimerRemainingSeconds)}`);
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
    restTimerActiveRunId = 0;
    clearRestTimerInterval();
    renderRestTimer();
    return;
  }

  if (restTimerRemainingSeconds === 0) {
    restTimerRemainingSeconds = restTimerDurationSeconds;
  }

  restTimerEndsAt = Date.now() + restTimerRemainingSeconds * 1000;
  restTimerActiveRunId = ++restTimerRunSequence;
  clearRestTimerInterval();
  restTimerIntervalId = window.setInterval(tickRestTimer, 250);
  renderRestTimer();
}

function resetRestTimer() {
  restTimerEndsAt = 0;
  restTimerActiveRunId = 0;
  restTimerRemainingSeconds = restTimerDurationSeconds;
  clearRestTimerInterval();
  renderRestTimer();
}

function setRestTimerDuration(seconds) {
  restTimerDurationSeconds = Math.max(1, Math.round(Number(seconds) || 60));
  resetRestTimer();
}

function adjustRestTimer(seconds) {
  const adjustment = Math.round(Number(seconds) || 0);

  syncRestTimerRemaining();
  restTimerRemainingSeconds = Math.max(0, restTimerRemainingSeconds + adjustment);
  if (restTimerEndsAt && restTimerRemainingSeconds > 0) {
    restTimerEndsAt = Date.now() + restTimerRemainingSeconds * 1000;
  } else if (restTimerRemainingSeconds === 0) {
    restTimerEndsAt = 0;
    restTimerActiveRunId = 0;
    clearRestTimerInterval();
  }
  renderRestTimer();
}

function openRestTimer(button) {
  const overlay = ensureRestTimer();

  customWorkoutGroupedRestAction = null;
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

async function saveWorkoutDifficultyFeedback(rows, difficultyRating, energy = {}) {
  const workoutRow = (rows || []).find((row) => workoutFeedbackSessionId(row));
  const sessionId = workoutFeedbackSessionId(workoutRow);
  const rating = Number(difficultyRating);

  if (!supabaseClient || !workoutRow || !sessionId || !workoutDifficultyLabel(rating)) {
    return { saved: false };
  }

  if ([energy.before, energy.after].some(value => value != null && (!Number.isInteger(value) || value < 1 || value > 5))) {
    return { saved: false, error: new Error("Energy ratings must be between 1 and 5.") };
  }
  const now = new Date().toISOString();
  const payload = {
    session_id: sessionId,
    client_email: activeClientEmail,
    workout_template_id: workoutRow.workout_template_id || null,
    entry_date: workoutRow.entry_date,
    workout_title: workoutRow.workout_title,
    difficulty_rating: rating,
    energy_before: energy.before ?? null,
    energy_after: energy.after ?? null,
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
            <strong id="workout-difficulty-title">How was your workout?</strong>
          </div>
          <button class="rir-close" type="button" data-workout-difficulty-close aria-label="Close workout difficulty prompt">×</button>
        </header>
        <p class="workout-difficulty-congratulations">Congratulations for completing the workout!</p>
        <p class="workout-difficulty-question">How hard was it overall?</p>
        <div class="workout-difficulty-options" role="radiogroup" aria-label="Overall workout difficulty">
          ${workoutDifficultyOptions().map(([value, label]) => `
            <button type="button" role="radio" data-workout-difficulty-option="${value}" aria-checked="false" aria-label="${value} — ${label}">
              <strong>${value}</strong>
            </button>
          `).join("")}
        </div>
        <div class="workout-energy-endpoints"><span>1 · Very easy</span><span>5 · Very hard</span></div>
        <div class="workout-energy-ratings">
          <h3>How was your energy?</h3>
          <p>Rate your energy before and after this workout.</p>
          ${["before", "after"].map(period => `<fieldset class="workout-energy-field">
            <legend>${period === "before" ? "Before the workout" : "After the workout"}</legend>
            <div class="workout-energy-options">
              ${["Very low", "Low", "Moderate", "High", "Very high"].map((label, index) => `<label>
                <input type="radio" name="workout-energy-${period}" value="${index + 1}" data-workout-energy="${period}" aria-label="${index + 1} — ${label}">
                <span>${index + 1}</span>
              </label>`).join("")}
            </div>
            <div class="workout-energy-endpoints"><span>1 · Very low</span><span>5 · Very high</span></div>
          </fieldset>`).join("")}
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
    saveButton.disabled = pendingWorkoutDifficulty === null || !pendingWorkoutEnergy.before || !pendingWorkoutEnergy.after;
  }
}

function requestWorkoutDifficulty(returnFocus) {
  if (workoutDifficultyPromptResolve) {
    return Promise.resolve(null);
  }

  const overlay = ensureWorkoutDifficultyPrompt();
  workoutDifficultyReturnFocus = returnFocus || null;
  pendingWorkoutDifficulty = null;
  pendingWorkoutEnergy = { before: null, after: null };
  overlay.querySelectorAll("[data-workout-energy]").forEach(input => { input.checked = false; });
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
  if (pendingWorkoutDifficulty === null || !pendingWorkoutEnergy.before || !pendingWorkoutEnergy.after) {
    return;
  }

  closeWorkoutDifficultyPrompt({ difficulty: pendingWorkoutDifficulty, ...pendingWorkoutEnergy });
}

function completedWorkoutCountForWeek(entryDate = todayDate(), logs = trainingLogs, feedback = workoutSessionFeedback) {
  const range = clientHomeWeekRange(entryDate);
  const sessionKeys = new Set();
  const addSession = (record) => {
    const date = String(record?.entry_date || "");

    if (date < range.start || date > range.end) {
      return;
    }

    sessionKeys.add(
      workoutFeedbackSessionId(record) || `${date}|${record?.workout_title || "Workout"}`
    );
  };

  (Array.isArray(feedback) ? feedback : []).forEach(addSession);
  (Array.isArray(logs) ? logs : [])
    .filter((record) => String(record?.completed_at || "").trim())
    .forEach(addSession);

  return sessionKeys.size;
}

function workoutCompletionShareSummary(rows = [], workoutCompletion = {}, difficultyRating = null) {
  const savedRows = Array.isArray(rows) ? rows : [];
  const workoutRows = savedRows.filter((row) => (
    String(row?.exercise_code || "").toUpperCase() !== warmupExerciseCode
  ));
  const exerciseNamesByKey = new Map();

  workoutRows.forEach((row) => {
    const exerciseName = String(row?.exercise_name || row?.exercise_code || "Exercise").trim();
    const exerciseKey = String(row?.exercise_code || exerciseName).trim().toLowerCase();

    if (exerciseKey && !exerciseNamesByKey.has(exerciseKey)) {
      exerciseNamesByKey.set(exerciseKey, exerciseName || "Exercise");
    }
  });

  const title = String(savedRows[0]?.workout_title || "Workout").trim() || "Workout";
  const entryDate = String(savedRows[0]?.entry_date || todayDate());
  const durationSeconds = Math.max(
    0,
    Number(workoutCompletion?.workout_duration_seconds || savedRows[0]?.workout_duration_seconds) || 0
  );
  const exerciseNames = Array.from(exerciseNamesByKey.values());
  const historyKey = savedRows.length ? clientWorkoutHistorySessionKey(savedRows.find((row) => workoutFeedbackSessionId(row)) || savedRows[0]) : "";

  return {
    title,
    entryDate,
    historyKey,
    isComplete: Boolean(workoutCompletion?.completed_at || savedRows.some((row) => row.completed_at)),
    appleWorkout: window.FWBAppleWorkout?.getShareStats?.(historyKey) || null,
    durationSeconds,
    durationLabel: durationSeconds ? workoutElapsedTimeLabel(durationSeconds * 1000) : "—",
    exerciseCount: exerciseNames.length,
    exerciseNames,
    weeklyWorkoutCount: completedWorkoutCountForWeek(entryDate),
    difficultyLabel: workoutDifficultyLabel(difficultyRating) || "Completed"
  };
}

function workoutCompletionShareText(summary = {}) {
  return window.FWBWorkoutShareCard?.text(summary) || `${summary.title || "Workout"} · ${summary.durationLabel || ""}`;
}

function workoutCompletionSharePromptMarkup() {
  return `
    <div class="workout-completion-share-overlay" data-workout-share-overlay hidden>
      <section class="workout-completion-share-sheet" role="dialog" aria-modal="true" aria-labelledby="workout-share-title">
        <header class="workout-completion-share-heading">
          <div>
            <small>Workout saved</small>
            <strong id="workout-share-title">Share your win?</strong>
          </div>
          <button type="button" data-workout-share-dismiss aria-label="Close workout sharing prompt">×</button>
        </header>
        <article class="workout-completion-share-card" aria-label="Workout completion share preview">
          <span class="workout-completion-share-brand">FWB</span>
          <p data-workout-share-state>Workout complete</p>
          <h2 data-workout-share-workout-title>Workout</h2>
          <small class="workout-completion-share-date" data-workout-share-date></small>
          <div class="workout-completion-share-metrics">
            <span><strong data-workout-share-duration>—</strong><small data-workout-share-time-label>Workout time</small></span>
            <span><strong data-workout-share-exercises>0</strong><small data-workout-share-count-label>Exercises</small></span>
            <span><strong data-workout-share-week>0 workouts</strong><small data-workout-share-week-label>This week</small></span>
          </div>
          <div class="workout-completion-share-apple" data-workout-share-apple-stats hidden>
            <small>Apple Workout</small>
            <div class="workout-completion-share-apple-metrics" data-workout-share-apple-metrics></div>
          </div>
          <div class="workout-completion-share-exercises">
            <small data-workout-share-exercises-label>Exercises completed</small>
            <ul data-workout-share-exercise-list></ul>
            <small data-workout-share-more hidden></small>
          </div>
          <strong class="workout-completion-share-praise" data-workout-share-praise>Strong work. You showed up.</strong>
        </article>
        <p class="workout-completion-share-copy">Open your phone’s share menu to post this achievement to any available social app.</p>
        <p class="workout-completion-share-status" data-workout-share-status aria-live="polite"></p>
        <div class="workout-completion-share-actions">
          <button class="workout-completion-share-button" type="button" data-workout-share>Share workout</button>
          <button class="workout-completion-share-not-now" type="button" data-workout-share-apple hidden>Add Apple Workout</button>
          <button class="workout-completion-share-not-now" type="button" data-workout-share-dismiss>Not now</button>
        </div>
      </section>
    </div>
  `;
}

function ensureWorkoutCompletionSharePrompt() {
  let overlay = document.querySelector("[data-workout-share-overlay]");

  if (!overlay) {
    document.body.insertAdjacentHTML("beforeend", workoutCompletionSharePromptMarkup());
    overlay = document.querySelector("[data-workout-share-overlay]");
  }

  return overlay;
}

function workoutCompletionShareImage(summary = {}) {
  return window.FWBWorkoutShareCard?.image(summary) || Promise.resolve(null);
}

function openWorkoutCompletionSharePrompt(summary, returnFocus = null) {
  const overlay = ensureWorkoutCompletionSharePrompt();
  const shareMetrics = window.FWBWorkoutShareCard?.metrics(summary) || {
    durationLabel: summary.durationLabel, timeLabel: "Workout time", weekLabel: "This week", appleMetrics: []
  };

  pendingWorkoutCompletionShare = summary;
  pendingWorkoutCompletionShareFile = null;
  workoutCompletionShareReturnFocus = returnFocus;
  overlay.querySelector("[data-workout-share-state]").textContent = summary.isComplete === false ? "Workout saved" : "Workout complete";
  overlay.querySelector("[data-workout-share-workout-title]").textContent = summary.title;
  overlay.querySelector("[data-workout-share-date]").textContent = formatLogDate(summary.entryDate);
  overlay.querySelector("[data-workout-share-duration]").textContent = shareMetrics.durationLabel;
  overlay.querySelector("[data-workout-share-time-label]").textContent = shareMetrics.timeLabel;
  overlay.querySelector("[data-workout-share-exercises]").textContent = String(summary.exerciseCount || 0);
  overlay.querySelector("[data-workout-share-count-label]").textContent = summary.exerciseCount === 1 ? "Exercise" : "Exercises";
  overlay.querySelector("[data-workout-share-week]").textContent = `${summary.weeklyWorkoutCount} workout${summary.weeklyWorkoutCount === 1 ? "" : "s"}`;
  overlay.querySelector("[data-workout-share-week-label]").textContent = shareMetrics.weekLabel;
  overlay.querySelector("[data-workout-share-apple-stats]").hidden = shareMetrics.appleMetrics.length === 0;
  overlay.querySelector("[data-workout-share-apple-metrics]").innerHTML = shareMetrics.appleMetrics
    .map((metric) => `<span><strong>${escapeHtml(metric.value)}</strong><small>${escapeHtml(metric.label)}</small></span>`).join("");
  overlay.querySelector("[data-workout-share-exercise-list]").innerHTML = (summary.exerciseNames || [])
    .slice(0, 6)
    .map((exerciseName) => `<li>${escapeHtml(exerciseName)}</li>`)
    .join("");
  overlay.querySelector("[data-workout-share-exercises-label]").textContent = summary.isComplete === false ? "Exercises logged" : "Exercises completed";
  const extraExercises = Math.max(0, (summary.exerciseCount || 0) - Math.min((summary.exerciseNames || []).length, 6));
  overlay.querySelector("[data-workout-share-more]").hidden = !extraExercises;
  overlay.querySelector("[data-workout-share-more]").textContent = `+ ${extraExercises} more exercise${extraExercises === 1 ? "" : "s"}`;
  overlay.querySelector("[data-workout-share-praise]").textContent = summary.isComplete === false ? "Your session is saved." : "Strong work. You showed up.";
  const shareButton = overlay.querySelector("[data-workout-share]");
  shareButton.disabled = true;
  shareButton.textContent = "Preparing image…";
  overlay.querySelector("[data-workout-share-status]").textContent = "Preparing your workout card…";
  overlay.querySelector("[data-workout-share-apple]").hidden = !summary.historyKey || isCoachDashboardPreview || !window.FWBAppleWorkout;
  overlay.querySelector("[data-workout-share-apple]").textContent = summary.appleWorkout ? "Edit Apple Workout" : "Add Apple Workout";
  overlay.hidden = false;
  document.body.classList.add("workout-completion-share-open");
  overlay.querySelector("[data-workout-share-dismiss]")?.focus();

  Promise.resolve(workoutCompletionShareImage(summary)).catch(() => null).then((file) => {
    if (pendingWorkoutCompletionShare === summary) {
      pendingWorkoutCompletionShareFile = file;
      shareButton.disabled = false;
      shareButton.textContent = "Share workout";
      overlay.querySelector("[data-workout-share-status]").textContent = file ? "" : "The image couldn’t be prepared. You can still share the workout details as text.";
    }
  });
}

function closeWorkoutCompletionSharePrompt(options = {}) {
  const overlay = document.querySelector("[data-workout-share-overlay]");
  const returnFocus = workoutCompletionShareReturnFocus;

  if (overlay) overlay.hidden = true;
  document.body.classList.remove("workout-completion-share-open");
  workoutCompletionShareReturnFocus = null;
  pendingWorkoutCompletionShare = null;
  pendingWorkoutCompletionShareFile = null;
  if (options.restoreFocus !== false) returnFocus?.focus();
}

function workoutHistoryShareSummary(historyKey) {
  const rows = trainingLogs.filter((row) => clientWorkoutHistorySessionKey(row) === historyKey);
  if (!rows.length) return null;
  const durationSeconds = rows.reduce((maximum, row) => {
    const duration = Number(row.workout_duration_seconds);
    return Number.isFinite(duration) && duration >= 0 ? Math.max(maximum, duration) : maximum;
  }, 0);
  return workoutCompletionShareSummary(rows, {
    workout_duration_seconds: durationSeconds,
    completed_at: rows.find((row) => row.completed_at)?.completed_at || ""
  }, rows.map(workoutDifficultyForLog).find(Boolean) || null);
}

function openWorkoutHistoryShare(historyKey, returnFocus = null) {
  if (isCoachDashboardPreview) return false;
  const summary = workoutHistoryShareSummary(historyKey);
  if (!summary) return false;
  openWorkoutCompletionSharePrompt(summary, returnFocus);
  return true;
}

async function shareCompletedWorkout(button) {
  const overlay = button?.closest("[data-workout-share-overlay]");
  const status = overlay?.querySelector("[data-workout-share-status]");
  const summary = pendingWorkoutCompletionShare;

  if (!button || button.disabled || !summary) {
    return;
  }

  const text = workoutCompletionShareText(summary);
  const url = `${window.location.origin}/`;
  const shareData = { title: summary.isComplete === false ? "Workout saved" : "Workout complete", text, url };
  const file = pendingWorkoutCompletionShareFile;

  if (file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    shareData.files = [file];
    delete shareData.url;
  }

  button.disabled = true;
  if (status) status.textContent = "Opening your share menu...";

  try {
    if (typeof navigator.share === "function") {
      await navigator.share(shareData);
      if (pendingWorkoutCompletionShare === summary) closeWorkoutCompletionSharePrompt({ restoreFocus: false });
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      if (pendingWorkoutCompletionShare === summary && status) status.textContent = "Workout message copied. Paste it into any social app.";
      return;
    }

    if (status) status.textContent = "Sharing is not available in this browser.";
  } catch (error) {
    if (pendingWorkoutCompletionShare !== summary) return;
    if (error?.name === "AbortError") {
      if (status) status.textContent = "Sharing canceled. You can try again.";
    } else if (status) {
      status.textContent = "Could not open sharing. Please try again.";
    }
  } finally {
    if (pendingWorkoutCompletionShare === summary) button.disabled = false;
  }
}

function handleWorkoutCompletionSharePrompt() {
  document.addEventListener("click", async (event) => {
    const shareButton = event.target.closest("[data-workout-share]");
    const dismissButton = event.target.closest("[data-workout-share-dismiss]");
    const appleWorkoutButton = event.target.closest("[data-workout-share-apple]");
    const historyShareButton = event.target.closest("[data-share-workout-history]");

    if (historyShareButton) {
      openWorkoutHistoryShare(historyShareButton.dataset.shareWorkoutHistory, historyShareButton);
      return;
    }

    if (appleWorkoutButton && pendingWorkoutCompletionShare?.historyKey && !isCoachDashboardPreview) {
      const historyKey = pendingWorkoutCompletionShare.historyKey;
      const opened = window.FWBAppleWorkout?.open(historyKey, {
        onSaved: (record) => openWorkoutHistoryShare(record.history_key)
      });
      if (opened) {
        closeWorkoutCompletionSharePrompt({ restoreFocus: false });
        setClientDashboardTab("logs");
      } else {
        document.querySelector("[data-workout-share-status]").textContent = "Apple Workout details aren’t ready. Close this preview and try Add Apple Workout in Logs.";
      }
      return;
    }

    if (shareButton) {
      await shareCompletedWorkout(shareButton);
      return;
    }

    if (dismissButton || event.target.matches("[data-workout-share-overlay]")) {
      closeWorkoutCompletionSharePrompt();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.querySelector("[data-workout-share-overlay]")?.hidden === false) {
      closeWorkoutCompletionSharePrompt();
    }
  });
}

function nextExercisePromptMarkup() {
  return `
    <div class="next-exercise-overlay" data-next-exercise-overlay hidden>
      <section class="next-exercise-sheet" role="dialog" aria-modal="true" aria-labelledby="next-exercise-title">
        <header class="rir-heading">
          <strong id="next-exercise-title">Exercise finished</strong>
        </header>
        <div class="next-exercise-actions">
          <button class="next-exercise-confirm" type="button" data-next-exercise-yes>Start New Exercise</button>
          <button class="next-exercise-finish" type="button" data-next-exercise-finish>Workout Finished</button>
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

function workoutElapsedTimerControlIcon(icon) {
  const icons = {
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 5v14M17 5v14" /></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m8 5 11 7-11 7Z" /></svg>',
    reset: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4v6h6M5.5 15a7 7 0 1 0 .8-7.8L4 10" /></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18" /></svg>'
  };

  return icons[icon] || "";
}

function workoutElapsedTimerMarkup() {
  return `
    <aside class="workout-elapsed-timer" data-workout-elapsed-timer hidden aria-label="Workout duration">
      <button class="workout-elapsed-drag-handle" type="button" data-workout-elapsed-drag aria-label="Move workout timer" title="Drag to move timer">
        <span aria-hidden="true"></span>
      </button>
      <button class="workout-elapsed-compact-toggle" type="button" data-workout-elapsed-compact aria-expanded="true" aria-label="Minimize workout timer">
        <span data-workout-elapsed-compact-icon aria-hidden="true">−</span>
      </button>
      <output data-workout-elapsed-display role="timer" aria-live="off">00:00</output>
      <button type="button" data-workout-elapsed-toggle aria-label="Pause workout timer" title="Pause timer">
        <span data-workout-elapsed-pause-icon>${workoutElapsedTimerControlIcon("pause")}</span>
        <span data-workout-elapsed-play-icon hidden>${workoutElapsedTimerControlIcon("play")}</span>
      </button>
      <button type="button" data-workout-elapsed-reset aria-label="Reset workout timer" title="Reset timer">${workoutElapsedTimerControlIcon("reset")}</button>
      <button class="workout-elapsed-close" type="button" data-workout-elapsed-close aria-label="Hide workout timer" title="Hide timer">${workoutElapsedTimerControlIcon("close")}</button>
    </aside>
  `;
}

function ensureWorkoutElapsedTimer() {
  let timer = document.querySelector("[data-workout-elapsed-timer]");

  if (!timer) {
    document.body.insertAdjacentHTML("beforeend", workoutElapsedTimerMarkup());
    timer = document.querySelector("[data-workout-elapsed-timer]");
  }

  bindWorkoutElapsedTimerDragging(timer);

  return timer;
}

function workoutElapsedTimerPositionPreference() {
  if (workoutElapsedTimerPosition) {
    return workoutElapsedTimerPosition;
  }

  try {
    const storedPosition = JSON.parse(
      window.localStorage.getItem(workoutElapsedTimerPositionStorageKey) || "null"
    );
    const edge = storedPosition?.edge === "left" ? "left" : "right";
    const topRatio = Number(storedPosition?.topRatio);

    if (Number.isFinite(topRatio)) {
      workoutElapsedTimerPosition = {
        edge,
        topRatio: Math.min(1, Math.max(0, topRatio))
      };
      return workoutElapsedTimerPosition;
    }
  } catch (_error) {
    // Use the top-left default when storage is unavailable or invalid.
  }

  workoutElapsedTimerPosition = { edge: "left", topRatio: 0 };
  return workoutElapsedTimerPosition;
}

function persistWorkoutElapsedTimerPosition() {
  try {
    window.localStorage.setItem(
      workoutElapsedTimerPositionStorageKey,
      JSON.stringify(workoutElapsedTimerPositionPreference())
    );
  } catch (_error) {
    // Dragging still works for this page view when storage is unavailable.
  }
}

function workoutElapsedTimerDragBounds(timer) {
  const gap = 8;
  const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  const rect = timer.getBoundingClientRect();
  const navigation = document.querySelector(".client-dashboard-tabs");
  const navigationRect = navigation?.getBoundingClientRect();
  const navigationIsBottomDock = Boolean(
    navigationRect?.height > 0 &&
    window.matchMedia?.("(max-width: 900px)")?.matches
  );
  const viewportMaxTop = Math.max(gap, viewportHeight - rect.height - gap);
  const navigationMaxTop = navigationIsBottomDock
    ? navigationRect.top - rect.height - gap
    : viewportMaxTop;
  const maxLeft = Math.max(gap, viewportWidth - rect.width - gap);
  const sidebarMinLeft = navigationRect?.width > 0 && !navigationIsBottomDock
    ? navigationRect.right + gap
    : gap;
  const minLeft = Math.min(maxLeft, Math.max(gap, sidebarMinLeft));

  return {
    gap,
    minLeft,
    width: rect.width,
    height: rect.height,
    maxLeft,
    maxTop: Math.max(gap, Math.min(viewportMaxTop, navigationMaxTop))
  };
}

function applyWorkoutElapsedTimerPosition(timer = document.querySelector("[data-workout-elapsed-timer]")) {
  if (!timer || timer.hidden || timer.classList.contains("is-dragging")) {
    return;
  }

  const position = workoutElapsedTimerPositionPreference();
  const bounds = workoutElapsedTimerDragBounds(timer);
  const usableTop = Math.max(0, bounds.maxTop - bounds.gap);
  const top = bounds.gap + (usableTop * position.topRatio);

  timer.style.top = `${Math.round(top)}px`;
  timer.style.bottom = "auto";
  timer.style.left = position.edge === "left" ? `${bounds.minLeft}px` : "auto";
  timer.style.right = position.edge === "right" ? `${bounds.gap}px` : "auto";
}

function bindWorkoutElapsedTimerDragging(timer) {
  const handle = timer?.querySelector("[data-workout-elapsed-drag]");

  if (!timer || !handle || timer.dataset.dragBound === "true") {
    return;
  }

  timer.dataset.dragBound = "true";
  let dragState = null;

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    const rect = timer.getBoundingClientRect();
    dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    timer.classList.add("is-dragging");
    timer.style.left = `${Math.round(rect.left)}px`;
    timer.style.right = "auto";
    timer.style.top = `${Math.round(rect.top)}px`;
    timer.style.bottom = "auto";
    handle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const bounds = workoutElapsedTimerDragBounds(timer);
    const left = Math.min(bounds.maxLeft, Math.max(bounds.minLeft, event.clientX - dragState.offsetX));
    const top = Math.min(bounds.maxTop, Math.max(bounds.gap, event.clientY - dragState.offsetY));

    timer.style.left = `${Math.round(left)}px`;
    timer.style.top = `${Math.round(top)}px`;
    event.preventDefault();
  });

  const finishDragging = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const bounds = workoutElapsedTimerDragBounds(timer);
    const rect = timer.getBoundingClientRect();
    const viewportMidpoint = Math.max(document.documentElement.clientWidth, window.innerWidth || 0) / 2;
    const usableTop = Math.max(1, bounds.maxTop - bounds.gap);

    workoutElapsedTimerPosition = {
      edge: rect.left + (rect.width / 2) < viewportMidpoint ? "left" : "right",
      topRatio: Math.min(1, Math.max(0, (rect.top - bounds.gap) / usableTop))
    };
    persistWorkoutElapsedTimerPosition();
    dragState = null;
    timer.classList.remove("is-dragging");
    try {
      handle.releasePointerCapture?.(event.pointerId);
    } catch (_error) {
      // Pointer capture may already be released when the browser cancels a drag.
    }
    applyWorkoutElapsedTimerPosition(timer);
  };

  handle.addEventListener("pointerup", finishDragging);
  handle.addEventListener("pointercancel", finishDragging);

  if (!bindWorkoutElapsedTimerDragging.resizeBound) {
    bindWorkoutElapsedTimerDragging.resizeBound = true;
    window.addEventListener("resize", () => applyWorkoutElapsedTimerPosition());
  }
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
      workoutDate: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.workoutDate || ""))
        ? String(parsed.workoutDate)
        : "",
      panelIndex: parsed.panelIndex !== null &&
        parsed.panelIndex !== "" &&
        Number.isInteger(Number(parsed.panelIndex)) &&
        Number(parsed.panelIndex) >= 0
        ? Number(parsed.panelIndex)
        : null,
      accumulatedMilliseconds: Math.max(0, Number(parsed.accumulatedMilliseconds) || 0),
      startedAt: Math.max(0, Number(parsed.startedAt) || 0),
      updatedAt: Math.max(0, Number(parsed.updatedAt) || Number(parsed.startedAt) || 0),
      running: Boolean(parsed.running),
      dismissed: Boolean(parsed.dismissed),
      startedAfterRound: Math.max(0, Number(parsed.startedAfterRound) || 0)
    };
    const activeMilliseconds = state.running && state.startedAt
      ? Math.max(0, Date.now() - state.startedAt)
      : 0;

    if (
      workoutElapsedTimerIsStale(state) ||
      state.accumulatedMilliseconds + activeMilliseconds > workoutElapsedTimerMaximumMilliseconds
    ) {
      window.localStorage.removeItem(workoutElapsedTimerStorageKey);
      return null;
    }

    return state;
  } catch (_error) {
    return null;
  }
}

function workoutElapsedTimerIsStale(
  state,
  now = Date.now(),
  maximumAge = workoutElapsedTimerMaximumMilliseconds
) {
  const updatedAt = Math.max(0, Number(state?.updatedAt) || Number(state?.startedAt) || 0);

  if (!updatedAt) {
    return true;
  }

  return Math.max(0, Number(now) - updatedAt) > Math.max(0, Number(maximumAge) || 0);
}

function persistWorkoutElapsedTimerState() {
  if (!workoutElapsedTimerState) {
    return;
  }

  try {
    workoutElapsedTimerState.updatedAt = Date.now();
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
  const timerIsVisible = Boolean(workoutElapsedTimerState && !workoutElapsedTimerState.dismissed);

  renderWorkoutResumeActions();

  document.body.classList.toggle("workout-elapsed-timer-visible", timerIsVisible);

  if (!timerIsVisible) {
    document.body.classList.remove("workout-elapsed-timer-compact");
    timer.hidden = true;
    syncWorkoutStartButtons();
    renderCustomWorkoutGroupedTimerPanels();
    return;
  }

  const display = timer.querySelector("[data-workout-elapsed-display]");
  const toggleButton = timer.querySelector("[data-workout-elapsed-toggle]");
  const compactButton = timer.querySelector("[data-workout-elapsed-compact]");
  const compactIcon = timer.querySelector("[data-workout-elapsed-compact-icon]");
  const isCompact = workoutElapsedTimerCompactPreference();

  document.body.classList.toggle("workout-elapsed-timer-compact", isCompact);
  timer.hidden = false;
  timer.classList.toggle("is-compact", isCompact);
  if (display) {
    display.textContent = workoutElapsedTimeLabel(workoutElapsedMilliseconds());
  }
  if (toggleButton) {
    const pauseIcon = toggleButton.querySelector("[data-workout-elapsed-pause-icon]");
    const playIcon = toggleButton.querySelector("[data-workout-elapsed-play-icon]");

    if (pauseIcon) pauseIcon.hidden = !workoutElapsedTimerState.running;
    if (playIcon) playIcon.hidden = workoutElapsedTimerState.running;
    toggleButton.setAttribute(
      "aria-label",
      workoutElapsedTimerState.running ? "Pause workout timer" : "Resume workout timer"
    );
    toggleButton.setAttribute(
      "title",
      workoutElapsedTimerState.running ? "Pause timer" : "Resume timer"
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
  window.requestAnimationFrame(() => applyWorkoutElapsedTimerPosition(timer));
  syncWorkoutStartButtons();
  renderCustomWorkoutGroupedTimerPanels();
}

function renderWorkoutResumeActions() {
  const hasActiveWorkout = Boolean(workoutElapsedTimerState);
  const elapsedLabel = hasActiveWorkout
    ? workoutElapsedTimeLabel(workoutElapsedMilliseconds())
    : "00:00";
  const statusLabel = workoutElapsedTimerState?.running
    ? "Workout in progress"
    : "Workout paused";

  document.querySelectorAll("[data-workout-resume-card]").forEach((card) => {
    card.hidden = !hasActiveWorkout;

    if (!hasActiveWorkout) {
      return;
    }

    const status = card.querySelector("[data-workout-resume-status]");
    const title = card.querySelector("[data-workout-resume-title]");
    const time = card.querySelector("[data-workout-resume-time]");

    if (status) status.textContent = statusLabel;
    if (title) title.textContent = workoutElapsedTimerState.workoutTitle || "Workout";
    if (time) time.textContent = elapsedLabel;
  });
}

function syncWorkoutStartButtons() {
  document.querySelectorAll("[data-workout-start]").forEach((button) => {
    const workoutTitle = String(button.dataset.workoutTitle || "").trim();
    const workoutDate = button.closest(".client-workout-panel")
      ?.querySelector("[data-workout-date]")?.value || todayDate();
    const isActiveWorkout = Boolean(
      workoutElapsedTimerState &&
      workoutTitle === String(workoutElapsedTimerState.workoutTitle || "").trim() &&
      workoutDate === String(workoutElapsedTimerState.workoutDate || "")
    );

    button.disabled = Boolean(workoutElapsedTimerState && !isActiveWorkout);
    button.classList.toggle("is-active", isActiveWorkout);

    if (!workoutElapsedTimerState) {
      button.textContent = "Start workout";
    } else if (!isActiveWorkout) {
      button.textContent = "Workout timer active";
    } else if (workoutElapsedTimerState.dismissed) {
      button.textContent = "Show workout timer";
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

function startWorkoutElapsedTimer(workoutTitle = "", context = {}) {
  const clientEmail = workoutElapsedTimerClientEmail();
  const storedState = readWorkoutElapsedTimerState();
  const requestedTitle = String(workoutTitle || activeWorkoutElapsedTitle()).trim() || "Workout";
  const workoutDate = /^\d{4}-\d{2}-\d{2}$/.test(String(context.workoutDate || ""))
    ? String(context.workoutDate)
    : "";
  const canResumeStoredState = storedState &&
    (!storedState.clientEmail || storedState.clientEmail === clientEmail) &&
    String(storedState.workoutTitle || "").trim() === requestedTitle &&
    (!workoutDate || storedState.workoutDate === workoutDate);
  const panelIndex = context.panelIndex !== null &&
    context.panelIndex !== "" &&
    Number.isInteger(Number(context.panelIndex)) &&
    Number(context.panelIndex) >= 0
    ? Number(context.panelIndex)
    : null;

  workoutElapsedTimerState = canResumeStoredState
    ? storedState
    : {
        clientEmail,
        workoutTitle: requestedTitle,
        workoutDate,
        panelIndex,
        accumulatedMilliseconds: 0,
        startedAt: Date.now(),
        running: true,
        dismissed: false,
        startedAfterRound: Math.max(0, Number(context.startedAfterRound) || 0)
      };

  workoutElapsedTimerState.clientEmail = clientEmail;
  workoutElapsedTimerState.workoutTitle = String(
    workoutTitle || workoutElapsedTimerState.workoutTitle || activeWorkoutElapsedTitle()
  ).trim() || "Workout";
  workoutElapsedTimerState.workoutDate = workoutDate || workoutElapsedTimerState.workoutDate || todayDate();
  workoutElapsedTimerState.panelIndex = panelIndex ?? workoutElapsedTimerState.panelIndex ?? null;
  workoutElapsedTimerState.startedAfterRound = Math.max(
    0,
    Number(workoutElapsedTimerState.startedAfterRound) || Number(context.startedAfterRound) || 0
  );
  workoutElapsedTimerState.dismissed = false;

  if (!workoutElapsedTimerState.running) {
    workoutElapsedTimerState.startedAt = Date.now();
    workoutElapsedTimerState.running = true;
  }

  persistWorkoutElapsedTimerState();
  runWorkoutElapsedTimer();
}

function resumeActiveWorkout() {
  if (!workoutElapsedTimerState) {
    restoreWorkoutElapsedTimer();
  }

  if (!workoutElapsedTimerState) {
    return;
  }

  if (!workoutElapsedTimerState.running) {
    workoutElapsedTimerState.startedAt = Date.now();
    workoutElapsedTimerState.running = true;
  }
  workoutElapsedTimerState.dismissed = false;
  persistWorkoutElapsedTimerState();
  runWorkoutElapsedTimer();
  setClientDashboardTab("workouts");

  const panels = Array.from(document.querySelectorAll(".client-workout-panel"));
  const activeTitle = String(workoutElapsedTimerState.workoutTitle || "").trim();
  const activeDate = String(workoutElapsedTimerState.workoutDate || "");
  let panelIndex = panels.findIndex((panel) => (
    String(panel.querySelector("[data-workout-start]")?.dataset.workoutTitle || "").trim() === activeTitle &&
    (panel.querySelector("[data-workout-date]")?.value || todayDate()) === activeDate
  ));

  if (panelIndex < 0 && Number.isInteger(workoutElapsedTimerState.panelIndex)) {
    panelIndex = workoutElapsedTimerState.panelIndex;
  }

  const panel = panels[panelIndex];

  if (!panel) {
    showClientWorkoutPicker();
    return;
  }

  activeWorkoutTabIndex = panelIndex;
  if (workoutElapsedTimerState.workoutDate) {
    syncWorkoutPanelDate(panel, workoutElapsedTimerState.workoutDate);
  }
  activateClientWorkoutPanel(panelIndex, { focus: true, scroll: true });
}

function cancelActiveWorkout() {
  if (!workoutElapsedTimerState) {
    return;
  }

  const title = workoutElapsedTimerState.workoutTitle || "this workout";
  if (!window.confirm(
    `Cancel ${title}? The workout timer will be cleared so you can choose another workout. This will not mark the workout complete. Any sets already saved will stay in your history.`
  )) {
    return;
  }

  closeRestTimer();
  customWorkoutGroupedRestAction = null;
  resetRestTimer();
  finishWorkoutElapsedTimer();
  clientPreviewProgramSelected = false;
  const picker = document.getElementById("client-workout-tabs");
  if (picker) {
    picker.innerHTML = clientWorkoutListMarkup(clientWorkoutPickerItems(currentProgram.workouts));
  }
  setClientDashboardTab("workouts");
  showClientWorkoutPicker();
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

function resetWorkoutElapsedTimer() {
  if (!workoutElapsedTimerState) {
    return;
  }

  workoutElapsedTimerState.accumulatedMilliseconds = 0;
  workoutElapsedTimerState.startedAt = workoutElapsedTimerState.running ? Date.now() : 0;
  persistWorkoutElapsedTimerState();
  runWorkoutElapsedTimer();
}

function hideWorkoutElapsedTimer() {
  if (!workoutElapsedTimerState) {
    return;
  }

  workoutElapsedTimerState.dismissed = true;
  persistWorkoutElapsedTimerState();
  renderWorkoutElapsedTimer();
}

function showWorkoutElapsedTimer() {
  if (!workoutElapsedTimerState) {
    return;
  }

  workoutElapsedTimerState.dismissed = false;
  persistWorkoutElapsedTimerState();
  renderWorkoutElapsedTimer();
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

  return groups.map((group, groupIndex) => {
    const startIndex = exerciseOffset;
    exerciseOffset += group.exercises.length;

    return `
      <section class="workout-format-group compact-workout-group superset-group">
        ${assignedWorkoutCarouselMarkup(
          group.exercises,
          workoutTitle,
          workout.focus,
          "superset",
          groupIndex,
          startIndex
        )}
      </section>
    `;
  }).join("");
}

function circuitRows(workout, workoutTitle) {
  const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];
  const group = { key: "Circuit", exercises };

  return `
    <section class="workout-format-group circuit-group compact-workout-group">
      ${assignedWorkoutCarouselMarkup(exercises, workoutTitle, workout.focus, "circuit")}
    </section>
  `;
}

function straightSetRows(workout, workoutTitle) {
  return (workout.exercises || []).map((exercise, index) =>
    assignedWorkoutCarouselMarkup([exercise], workoutTitle, workout.focus, "single", index, index)
  ).join("");
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

function customWorkoutInlineGroupOptionsMarkup(groupType = "single", isVisible = true) {
  const normalizedType = normalizeCustomWorkoutInlineGroupType(groupType);

  return `
    <div class="custom-workout-inline-group-options" role="group" aria-label="Group exercises" data-custom-workout-inline-group-options ${isVisible ? "" : "hidden"}>
      <label>
        <input type="checkbox" data-custom-workout-inline-group-option="superset" ${normalizedType === "superset" ? "checked" : ""} />
        <span>Superset</span>
      </label>
      <label>
        <input type="checkbox" data-custom-workout-inline-group-option="circuit" ${normalizedType === "circuit" ? "checked" : ""} />
        <span>Circuit</span>
      </label>
    </div>
  `;
}

function customWorkoutGroupNameRowMarkup(exercise, format, groupIndex, index, namespace = "") {
  const exerciseName = String(exercise?.name || "").trim();
  const position = workoutCarouselExerciseCode(format, groupIndex, index);
  const groupKey = `${namespace}${format}-${groupIndex}`;
  const suggestionMenuId = `custom-group-exercise-options-${groupKey}-${index}`;

  return `
    <div class="custom-workout-group-name-row">
      <strong>${escapeHtml(position)}</strong>
      <span class="custom-workout-name-editor">
        <input
          id="custom-group-exercise-name-${groupKey}-${index}"
          type="text"
          value="${escapeHtml(exerciseName)}"
          placeholder="Input exercise name here"
          aria-label="${escapeHtml(position)} exercise name"
          aria-autocomplete="list"
          aria-controls="${suggestionMenuId}"
          aria-expanded="false"
          autocomplete="off"
          data-custom-workout-group-name-input="${index}"
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
      <button
        class="custom-workout-group-name-delete"
        type="button"
        data-custom-workout-group-delete="${index}"
        aria-label="Delete ${escapeHtml(position)}"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" />
        </svg>
      </button>
    </div>
  `;
}

function customWorkoutGroupNameEditorMarkup(format, exercises, groupIndex, namespace = "") {
  const names = Array.isArray(exercises) ? exercises : [];
  const positions = names.map((exercise, index) => workoutCarouselExerciseCode(format, groupIndex, index));
  const groupKey = `${namespace}${format}-${groupIndex}`;

  return `
    <section class="custom-workout-group-name-section" data-custom-workout-group-name-section>
      <button
        class="custom-workout-group-name-toggle"
        type="button"
        data-custom-workout-group-name-toggle
        aria-expanded="true"
        aria-controls="custom-workout-group-names-${groupKey}"
      >
        <span>
          <strong>Exercises</strong>
          <small data-custom-workout-group-name-summary>${escapeHtml(positions.join(" · ") || "Add exercise names")}</small>
        </span>
        <i data-custom-workout-group-name-icon aria-hidden="true">−</i>
      </button>
      <div
        class="custom-workout-group-name-fields"
        id="custom-workout-group-names-${groupKey}"
        data-custom-workout-group-name-fields
      >
        ${names.map((exercise, index) => customWorkoutGroupNameRowMarkup(exercise, format, groupIndex, index, namespace)).join("")}
      </div>
    </section>
  `;
}

function customWorkoutCardMarkup(exercise, workoutTitle, index = 0, options = {}) {
  const exerciseName = String(exercise.name || "").trim();
  const groupIndex = Math.max(Number(exercise.group) || 0, 0);
  const panelFormat = normalizeCustomWorkoutFormat(options.panelFormat || activeCustomWorkoutFormat);
  const cardFormat = panelFormat === "single"
    ? normalizeCustomWorkoutInlineGroupType(options.format || exercise.groupType)
    : panelFormat;
  const supersetPosition = Number.isInteger(options.groupPosition) ? options.groupPosition : index % 2;
  const isFirstSupersetExercise = cardFormat === "superset" && supersetPosition === 0;
  const isSecondSupersetExercise = cardFormat === "superset" && supersetPosition === 1;
  const suggestionMenuId = `custom-exercise-options-${String(exercise.code || index + 1).toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;

  return `
    <article class="workout-exercise-card workout-entry-card custom-workout-card is-open" data-custom-exercise-card data-custom-workout-group="${groupIndex}" data-custom-workout-group-type="${escapeHtml(cardFormat)}">
      <div class="exercise-card-summary custom-workout-card-summary">
        <span>
          <span class="custom-workout-group-card-code" data-custom-workout-group-card-code hidden></span>
          <span class="custom-workout-name-field-label" aria-hidden="true">Exercise name</span>
          <strong class="custom-workout-collapsed-name" data-exercise-collapsed-name>${escapeHtml(exerciseName || "Exercise name")}</strong>
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
          <small data-set-progress>0 / ${customWorkoutDefaultWorkingSetCount} working sets completed</small>
        </span>
        <div class="custom-workout-card-actions">
            <button class="custom-workout-delete-icon" type="button" data-delete-exercise aria-label="Delete exercise ${index + 1}">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5" />
              </svg>
            </button>
          <button class="custom-workout-card-toggle" type="button" data-exercise-toggle aria-label="Toggle exercise ${index + 1}" aria-expanded="true"><i>›</i></button>
        </div>
      </div>
      ${customWorkoutInlineGroupOptionsMarkup(cardFormat, panelFormat === "single")}
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
          setCount: customWorkoutDefaultWorkingSetCount,
          userManagedSets: true,
          // Custom cards can be regrouped in place after they render, so every
          // card keeps a dormant slot ready for Superset or Circuit mode.
          groupActionSlot: true,
          showSetComplete: cardFormat === "single",
          finishButtonLabel: isFirstSupersetExercise
            ? "Add Superset"
            : (isSecondSupersetExercise ? "Superset Completed" : "Set Finished"),
          finishButtonAction: isFirstSupersetExercise ? "add-superset" : "finish-set"
        })}
      </div>
    </article>
  `;
}

function customWorkoutListMarkup(workoutTitle = customWorkoutTitle) {
  const exercises = customWorkoutExercises();

  return exercises.map((exercise, index) => customWorkoutCardMarkup(exercise, workoutTitle, index)).join("");
}

function customWorkoutGroupedRoundCardMarkup(format, exercises, groupIndex = 0, startIndex = 0, workoutTitle = customWorkoutTitle, options = {}) {
  const panelFormat = normalizeCustomWorkoutFormat(options.panelFormat || format);
  const showSessionControls = format !== "single" && options.isLastGroup !== false;
  const groupTitle = format === "circuit"
    ? `Circuit ${groupIndex + 1}`
    : format === "single" ? `Straight sets ${groupIndex + 1}` : `Superset ${groupIndex + 1}`;

  return `
    <section
      class="custom-workout-carousel custom-workout-grouped-rounds"
      data-custom-workout-carousel
      ${options.assigned ? "data-assigned-workout-carousel" : ""}
      data-exercise-editor-namespace="${options.assigned ? escapeHtml(`${encodeURIComponent(workoutTitle)}-`) : ""}"
      data-custom-workout-grouped="true"
      data-custom-workout-group="${groupIndex}"
      data-custom-workout-format="${escapeHtml(format)}"
      aria-label="${escapeHtml(groupTitle)}"
    >
      ${customWorkoutGroupNameEditorMarkup(format, exercises, groupIndex, options.assigned ? `${encodeURIComponent(workoutTitle)}-` : "")}
      <article class="custom-workout-grouped-card">
        <header class="custom-workout-grouped-card-heading">
          <h3>${escapeHtml(groupTitle)}</h3>
          <p class="custom-workout-grouped-progress" data-custom-grouped-progress aria-live="polite">0 / 0 complete</p>
        </header>
        ${!options.assigned && panelFormat === "single"
          ? customWorkoutInlineGroupOptionsMarkup(format)
          : ""}
        <div class="custom-workout-grouped-exercise-key" data-custom-grouped-exercise-key role="list" aria-label="Exercises in this group"></div>
        <div class="custom-workout-grouped-round-stepper" role="group" aria-label="Number of ${format === "single" ? "sets" : "rounds"}">
          <button type="button" data-custom-grouped-remove-round aria-label="Remove last ${format === "single" ? "set" : "round"}">−</button>
          <output aria-live="polite"><span>${format === "single" ? "Sets" : "Rounds"}</span> <strong data-custom-grouped-round-count>1</strong></output>
          <button type="button" data-custom-grouped-add-round aria-label="Add ${format === "single" ? "set" : "round"}">+</button>
        </div>
        <div data-custom-grouped-sections></div>
        ${showSessionControls ? `
          <div class="custom-workout-grouped-timer" data-custom-grouped-timer role="timer" aria-label="Workout timer" hidden>
            <span class="custom-workout-grouped-timer-copy">
              <strong>Workout timer</strong>
              <small data-custom-grouped-timer-state>Started after the first logged round</small>
            </span>
            <time data-custom-grouped-timer-time datetime="PT0S">00:00</time>
          </div>
        ` : ""}
        ${showSessionControls ? '<footer class="custom-workout-grouped-actions"><button type="button" data-custom-grouped-finish-workout>Finish workout</button></footer>' : ""}
        <p class="custom-workout-grouped-status" data-custom-grouped-status aria-live="polite"></p>
      </article>
      <div class="custom-workout-grouped-source" data-custom-workout-grouped-source hidden aria-hidden="true">
        <div class="workout-app-list custom-workout-list" data-custom-workout-list data-custom-workout-format="${escapeHtml(format)}">
          ${options.assigned
            ? exerciseCardRows(exercises, workoutTitle, "all", options.workoutFocus, { format, startIndex })
            : exercises.map((exercise, index) => customWorkoutCardMarkup(exercise, workoutTitle, startIndex + index, { groupPosition: index, format, panelFormat })).join("")}
        </div>
      </div>
    </section>
  `;
}

function customWorkoutCarouselGroupMarkup(format, exercises, groupIndex = 0, startIndex = 0, workoutTitle = customWorkoutTitle, options = {}) {
  return customWorkoutGroupedRoundCardMarkup(format, exercises, groupIndex, startIndex, workoutTitle, options);
}

function customWorkoutCarouselMarkup(format, workoutTitle = customWorkoutTitle) {
  const exercises = customWorkoutExercises(format);
  let groups;

  if (format === "superset") {
    const hasExplicitGroups = exercises.some((exercise) => Math.max(Number(exercise.group) || 0, 0) > 0);

    if (hasExplicitGroups) {
      const supersetGroups = new Map();
      exercises.forEach((exercise, index) => {
        const groupIndex = Math.max(Number(exercise.group) || 0, 0);
        if (!supersetGroups.has(groupIndex)) {
          supersetGroups.set(groupIndex, { index: groupIndex, exercises: [], startIndex: index });
        }
        supersetGroups.get(groupIndex).exercises.push(exercise);
      });
      groups = Array.from(supersetGroups.values()).map((group, index) => ({ ...group, index }));
    } else {
      groups = Array.from({ length: Math.ceil(exercises.length / 2) }, (_, index) => ({
        index,
        exercises: exercises.slice(index * 2, (index * 2) + 2),
        startIndex: index * 2
      }));
    }
  } else if (format === "circuit") {
    const circuitGroups = new Map();
    exercises.forEach((exercise, index) => {
      const groupIndex = Math.max(Number(exercise.group) || 0, 0);
      if (!circuitGroups.has(groupIndex)) circuitGroups.set(groupIndex, { index: groupIndex, exercises: [], startIndex: index });
      circuitGroups.get(groupIndex).exercises.push(exercise);
    });
    groups = Array.from(circuitGroups.values()).map((group, index) => ({ ...group, index }));
  } else {
    groups = customWorkoutMixedGroups(exercises).map((group) => ({
      ...group,
      exercises: group.items
    }));
  }

  return `
    <div class="custom-workout-carousel-stack" data-custom-workout-carousel-stack>
      ${groups.map((group, index) => {
        const groupFormat = group.format || format;
        const canAddExercise = groupFormat === "single" && index === groups.length - 1;

        return customWorkoutCarouselGroupMarkup(
          groupFormat,
          group.exercises,
          group.index,
          group.startIndex,
          workoutTitle,
          { panelFormat: format, canAddExercise, isLastGroup: index === groups.length - 1 }
        );
      }).join("")}
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

function customWorkoutGroupedLogElements(carousel) {
  return customWorkoutCarouselCards(carousel)
    .map((card) => card.querySelector("[data-exercise-log]"))
    .filter(Boolean);
}

function customWorkoutGroupedRows(logElement, setType = workingSetType) {
  return Array.from(logElement?.querySelectorAll("[data-set-row]") || [])
    .filter((row) => setTypeForRow(row) === setType);
}

function customWorkoutGroupedRoundCode(roundNumber, exerciseIndex) {
  const safeRound = Math.max(1, Number(roundNumber) || 1);
  const letter = String.fromCharCode(64 + Math.min(safeRound, 26));
  return `${letter}${Math.max(0, Number(exerciseIndex) || 0) + 1}`;
}

function customWorkoutGroupedCanonicalRow(carousel, exerciseIndex, setType, setNumber) {
  const logElement = customWorkoutGroupedLogElements(carousel)[Number(exerciseIndex) || 0];
  const rows = customWorkoutGroupedRows(logElement, setType);

  if (setType === warmUpSetType) {
    return rows.find((row) => Number(row.dataset.setNumber) === Number(setNumber)) || null;
  }

  return rows[Math.max(0, Number(setNumber) - 1)] || null;
}

function setCustomWorkoutGroupedRowComplete(row, complete) {
  const isComplete = Boolean(complete);

  if (isComplete) {
    ["weight", "reps"].forEach((field) => clearCustomWorkoutGroupedWeightCopy(row?.querySelector(`[data-set-${field}]`)));
  }
  row?.classList.toggle("is-complete", isComplete);
  row?.querySelector("[data-complete-set]")?.setAttribute("aria-pressed", String(isComplete));
  if (isComplete && row) delete row.dataset.customGroupedReopened;
}

function customWorkoutGroupedFieldMarkup(field, value, context, placeholder = "", historyHint = "") {
  const fieldLabel = field === "weight" ? "Weight" : field === "reps" ? "Reps" : "RIR";
  const max = field === "rir" ? ' max="5"' : "";
  const step = field === "weight" ? "0.5" : "1";

  return `
    <label class="custom-workout-grouped-field">
      <span>${fieldLabel}</span>
      <input
        type="number"
        min="0"${max}
        step="${step}"
        inputmode="decimal"
        value="${escapeHtml(value)}"
        placeholder="${escapeHtml(placeholder)}"
        data-custom-grouped-field="${field}"
        aria-label="${escapeHtml(`${fieldLabel}, ${context}`)}"
        ${historyHint ? `title="${escapeHtml(historyHint)}" aria-description="${escapeHtml(historyHint)}"` : ""}
      />
    </label>
  `;
}

function customWorkoutGroupedSetRowMarkup(row, code, exerciseIndex, setType, roundNumber, exerciseName) {
  const values = setRowInputValues(row);
  const rir = String(row?.dataset.repsInReserve || "");
  const isWarmUp = setType === warmUpSetType;
  const context = isWarmUp
    ? `${code} warm-up, ${exerciseName}`
    : `round ${roundNumber}, ${code}, ${exerciseName}`;
  const complete = row?.classList.contains("is-complete") || false;
  const pendingRow = !complete;

  return `
    <div
      class="custom-workout-grouped-row${complete ? " is-complete" : ""}"
      data-custom-grouped-exercise-index="${exerciseIndex}"
      data-custom-grouped-set-type="${escapeHtml(setType)}"
      data-custom-grouped-set-number="${escapeHtml(row?.dataset.setNumber || roundNumber)}"
    >
      <button
        class="custom-workout-grouped-code"
        type="button"
        data-custom-grouped-set-toggle
        aria-label="${escapeHtml(complete ? `Reopen ${context}` : `${context} not logged`)}"
        aria-pressed="${complete}"
        ${pendingRow ? "disabled" : ""}
      >${escapeHtml(code)}</button>
      ${customWorkoutGroupedFieldMarkup("weight", values.weightRaw, context, row?.querySelector("[data-set-weight]")?.placeholder || "", row?.querySelector("[data-set-weight]")?.dataset.historyHint || "")}
      ${customWorkoutGroupedFieldMarkup("reps", values.repsRaw, context, row?.querySelector("[data-set-reps]")?.placeholder || "")}
      ${customWorkoutGroupedFieldMarkup("rir", rir, context)}
    </div>
  `;
}

function customWorkoutGroupedRoundCount(carousel) {
  return Math.max(
    1,
    ...customWorkoutGroupedLogElements(carousel)
      .map((logElement) => customWorkoutGroupedRows(logElement, workingSetType).length)
  );
}

function normalizeCustomWorkoutGroupedRoundRows(logElements) {
  const target = Math.max(
    1,
    ...logElements.map((logElement) => customWorkoutGroupedRows(logElement, workingSetType).length)
  );
  let changed = false;

  logElements.forEach((logElement) => {
    const rows = logElement.querySelector("[data-set-rows]");
    let workingCount = customWorkoutGroupedRows(logElement, workingSetType).length;
    const defaultReps = rows?.querySelector("[data-set-reps]")?.dataset.defaultPlaceholder || "0";
    let logChanged = false;

    while (rows && workingCount < target) {
      workingCount += 1;
      rows.insertAdjacentHTML("beforeend", setRowMarkup(workingCount, defaultReps, workingSetType));
      changed = true;
      logChanged = true;
    }
    if (logChanged) {
      renumberSetRows(logElement);
      syncVisibleSetTarget(logElement);
      updateVisibleSetProgress(logElement);
    }
  });

  return changed;
}

function customWorkoutGroupedRoundIsLogged(carousel, roundNumber) {
  const rows = customWorkoutGroupedLogElements(carousel)
    .map((logElement) => customWorkoutGroupedRows(logElement, workingSetType)[roundNumber - 1])
    .filter(Boolean);

  return rows.length > 0 && rows.length === customWorkoutGroupedLogElements(carousel).length &&
    rows.every((row) => row.classList.contains("is-complete"));
}

function customWorkoutGroupedExerciseKeyMarkup(carousel) {
  return customWorkoutGroupedLogElements(carousel).map((logElement, index) => {
    const nameInput = exerciseNameInputForLog(logElement);
    const exerciseName = String(nameInput ? nameInput.value : logElement.dataset.exerciseName || "").trim();
    const name = exerciseName || `Exercise ${index + 1}`;
    const originalName = String(logElement.dataset.exerciseName || "").trim();
    // Keep assigned videos until the exercise changes; custom names use the library.
    const originalVideo = exerciseName.toLowerCase() === originalName.toLowerCase()
      ? logElement.querySelector(".exercise-video-link")?.getAttribute("href") || ""
      : "";
    const demo = exerciseName ? exerciseVideoMarkup({ name: exerciseName, video: originalVideo }, { iconOnly: true }) : "";

    return `
      <div class="custom-workout-grouped-exercise-key-item" role="listitem">
        <span class="custom-workout-grouped-exercise-number">${index + 1}</span>
        <strong data-custom-grouped-exercise-name="${index}">${escapeHtml(name)}</strong>
        ${demo}
      </div>
    `;
  }).join("");
}

function renderCustomWorkoutGroupedExerciseKey(carousel) {
  const key = carousel?.querySelector("[data-custom-grouped-exercise-key]");

  if (key) {
    key.innerHTML = customWorkoutGroupedExerciseKeyMarkup(carousel);
    key.dataset.count = String(customWorkoutGroupedLogElements(carousel).length);
  }
}

function syncCustomWorkoutGroupedAccessibleNames(carousel, exerciseIndex, exerciseName) {
  const safeName = String(exerciseName || "").trim() || `Exercise ${Number(exerciseIndex) + 1}`;

  carousel?.querySelectorAll(
    `.custom-workout-grouped-row[data-custom-grouped-exercise-index="${Number(exerciseIndex)}"]`
  ).forEach((row) => {
    const code = String(row.querySelector("[data-custom-grouped-set-toggle]")?.textContent || "").trim();
    const setType = row.dataset.customGroupedSetType;
    const roundNumber = Number(row.closest("[data-custom-grouped-round]")?.dataset.customGroupedRound) || 0;
    const context = setType === warmUpSetType
      ? `${code} warm-up, ${safeName}`
      : `round ${roundNumber}, ${code}, ${safeName}`;
    const toggle = row.querySelector("[data-custom-grouped-set-toggle]");
    const complete = toggle?.getAttribute("aria-pressed") === "true";
    const action = complete ? "Reopen" : "";

    toggle?.setAttribute("aria-label", action ? `${action} ${context}` : `${context} not logged`);
    row.querySelectorAll("[data-custom-grouped-field]").forEach((input) => {
      const field = input.dataset.customGroupedField;
      const fieldLabel = field === "weight" ? "Weight" : field === "reps" ? "Reps" : "RIR";
      input.setAttribute("aria-label", `${fieldLabel}, ${context}`);
    });
  });
}

function syncCustomWorkoutGroupedHistoryPlaceholders(logElement) {
  const carousel = logElement?.closest("[data-custom-workout-grouped='true']");
  if (!carousel) return;

  const exerciseIndex = customWorkoutGroupedLogElements(carousel).indexOf(logElement);
  if (exerciseIndex < 0) return;

  carousel.querySelectorAll(
    `.custom-workout-grouped-row[data-custom-grouped-exercise-index="${exerciseIndex}"]`
  ).forEach((visibleRow) => {
    const canonicalRow = customWorkoutGroupedCanonicalRow(
      carousel,
      exerciseIndex,
      visibleRow.dataset.customGroupedSetType,
      visibleRow.dataset.customGroupedSetNumber
    );
    ["weight", "reps"].forEach((field) => {
      const input = visibleRow.querySelector(`[data-custom-grouped-field="${field}"]`);
      if (input) {
        input.placeholder = canonicalRow?.querySelector(`[data-set-${field}]`)?.placeholder || "";
        if (field === "weight") {
          const hint = canonicalRow?.querySelector("[data-set-weight]")?.dataset.historyHint || "";
          input.title = hint;
          if (hint) input.setAttribute("aria-description", hint);
          else input.removeAttribute("aria-description");
        }
      }
    });
  });
}

function workoutSetUnit(carousel) {
  return carousel?.dataset.customWorkoutFormat === "single" ? "Set" : "Round";
}

function customWorkoutGroupedCopyValue(value, field = "weight") {
  const raw = value === null || value === undefined || typeof value === "boolean" ? "" : String(value).trim();
  const number = Number(raw);
  if (!raw || !Number.isFinite(number) || number < 0) return null;
  if (field === "reps" && (!Number.isInteger(number) || number <= 0)) return null;
  return String(number);
}

function previousCustomWorkoutGroupedValue(logElement, roundNumber, field = "weight") {
  if (!Number.isInteger(roundNumber) || roundNumber <= 1) return null;
  const previousRow = customWorkoutGroupedRows(logElement, workingSetType)[roundNumber - 2];
  return customWorkoutGroupedCopyValue(previousRow?.querySelector(`[data-set-${field}]`)?.value, field);
}

function previousCustomWorkoutGroupedWeight(logElement, roundNumber) {
  return previousCustomWorkoutGroupedValue(logElement, roundNumber, "weight");
}

function customWorkoutGroupedPersonalBestLabel(logElement, best) {
  if (!best) return "";
  const reps = Number(best.reps);
  const repsLabel = Number.isFinite(reps) && reps > 0 ? ` × ${reps} reps` : "";
  return `${currentExerciseLabel(logElement)}: ${Number(best.weight_used)} lb${repsLabel} · ${formatLogDate(best.entry_date)}`;
}

function clearCustomWorkoutGroupedWeightCopy(input) {
  if (!input) return;
  delete input.dataset.lastWeightCopyValue;
  delete input.dataset.lastWeightCopyContext;
  delete input.dataset.lastWeightCopyRound;
  delete input.dataset.lastWeightCopySource;
  delete input.dataset.lastWeightCopyLabel;
}

function customWorkoutGroupedCopyContext(logElement) {
  return JSON.stringify([
    currentExerciseHistoryName(logElement),
    logElement.querySelector("[data-log-date]")?.value || todayDate(),
    logElement.dataset.workoutTitle || ""
  ]);
}

function customWorkoutGroupedCopyRows(carousel, roundNumber) {
  return customWorkoutGroupedLogElements(carousel).flatMap((logElement, exerciseIndex) => {
    const row = customWorkoutGroupedRows(logElement, workingSetType)[roundNumber - 1];
    const context = customWorkoutGroupedCopyContext(logElement);
    return ["weight", "reps"].map((field) => ({
      logElement, row, field, input: row?.querySelector(`[data-set-${field}]`), exerciseIndex, context
    }));
  }).filter((entry) => entry.input);
}

function customWorkoutGroupedCopyVisibleInput(section, exerciseIndex, field = "weight") {
  return section?.querySelector(
    `.custom-workout-grouped-row[data-custom-grouped-exercise-index="${exerciseIndex}"] [data-custom-grouped-field="${field}"]`
  );
}

function refreshCustomWorkoutGroupedCopyWeights(carousel) {
  const personalBests = new Map();
  if (carousel?.querySelector('[data-custom-grouped-copy-source="pr"]')) {
    customWorkoutGroupedLogElements(carousel).forEach((logElement) => {
      personalBests.set(logElement, personalBestWeightLog(logsForExerciseDisplay(logElement)));
    });
  }
  carousel?.querySelectorAll("[data-custom-grouped-round]").forEach((section) => {
    const roundNumber = Number(section.dataset.customGroupedRound);
    const entries = customWorkoutGroupedCopyRows(carousel, roundNumber);
    const copied = entries.filter(({ row, input, context }) => {
      if (row.classList.contains("is-complete") || input.dataset.lastWeightCopyContext !== context ||
        input.dataset.lastWeightCopyValue !== String(input.value)) {
        clearCustomWorkoutGroupedWeightCopy(input);
        return false;
      }
      return input.dataset.lastWeightCopyValue !== undefined;
    });
    section.querySelectorAll("[data-custom-grouped-copy-weights]").forEach((button) => {
      const usePersonalBest = button.dataset.customGroupedCopySource === "pr";
      button.disabled = !entries.some(({ logElement, row, input, field, exerciseIndex }) => {
        const best = personalBests.get(logElement);
        const value = usePersonalBest
          ? customWorkoutGroupedCopyValue(best?.[field === "weight" ? "weight_used" : "reps"], field)
          : previousCustomWorkoutGroupedValue(logElement, roundNumber, field);
        const visible = customWorkoutGroupedCopyVisibleInput(section, exerciseIndex, field);
        return value !== null && visible && !row.classList.contains("is-complete") &&
          String(input.value).trim() === "" && String(visible.value).trim() === "";
      });
    });
    const preview = section.querySelector("[data-custom-grouped-pr-preview]");
    if (preview) {
      const records = [...new Set(entries.map(({ logElement }) => logElement))]
        .map((logElement) => customWorkoutGroupedPersonalBestLabel(logElement, personalBests.get(logElement))).filter(Boolean);
      preview.textContent = records.length ? `Personal records: ${records.join("; ")}` : "";
      preview.hidden = records.length === 0;
    }
    const status = section.querySelector("[data-custom-grouped-copy-status]");
    const message = section.querySelector("[data-custom-grouped-copy-message]");
    const undo = section.querySelector("[data-custom-grouped-undo-weights]");
    if (status) status.hidden = copied.length === 0;
    if (undo) undo.hidden = copied.length === 0;
    if (message && copied.length) {
      const sources = [...new Set(copied.map(({ input }) => input.dataset.lastWeightCopyLabel || `${workoutSetUnit(carousel)} ${roundNumber - 1}`))];
      const weights = copied.filter(({ field }) => field === "weight").length;
      const reps = copied.some(({ field }) => field === "reps");
      const fields = weights ? `${weights === 1 ? "Weight" : "Weights"}${reps ? " and reps" : ""}` : "Reps";
      message.textContent = `${fields} copied · ${sources.join("; ")}`;
    }
  });
}

function copyCustomWorkoutGroupedWeights(button) {
  const carousel = button?.closest("[data-custom-workout-grouped='true']");
  const section = button?.closest("[data-custom-grouped-round]");
  const roundNumber = Number(button?.dataset.customGroupedCopyWeights);
  const usePersonalBest = button?.dataset.customGroupedCopySource === "pr";
  if (!carousel || !section || button.disabled || !Number.isInteger(roundNumber) || roundNumber < 1 || (!usePersonalBest && roundNumber === 1)) return;

  let count = 0;
  const personalBests = new Map();
  customWorkoutGroupedCopyRows(carousel, roundNumber).forEach(({ logElement, row, input, field, exerciseIndex, context }) => {
    const visible = customWorkoutGroupedCopyVisibleInput(section, exerciseIndex, field);
    if (!visible || row.classList.contains("is-complete") || String(input.value).trim() || String(visible.value).trim()) return;
    if (usePersonalBest && !personalBests.has(logElement)) {
      personalBests.set(logElement, personalBestWeightLog(logsForExerciseDisplay(logElement)));
    }
    const best = personalBests.get(logElement);
    const value = usePersonalBest
      ? customWorkoutGroupedCopyValue(best?.[field === "weight" ? "weight_used" : "reps"], field)
      : previousCustomWorkoutGroupedValue(logElement, roundNumber, field);
    if (value === null) return;
    input.value = value;
    visible.value = value;
    input.dataset.lastWeightCopyValue = value;
    input.dataset.lastWeightCopyContext = context;
    input.dataset.lastWeightCopyRound = usePersonalBest ? "" : String(roundNumber - 1);
    input.dataset.lastWeightCopySource = usePersonalBest ? "pr" : "previous";
    input.dataset.lastWeightCopyLabel = usePersonalBest
      ? `PR · ${customWorkoutGroupedPersonalBestLabel(logElement, best)}`
      : `${workoutSetUnit(carousel)} ${roundNumber - 1}`;
    input.removeAttribute("aria-invalid");
    visible.removeAttribute("aria-invalid");
    count += 1;
  });
  if (count) persistCustomWorkoutDraftForElement(carousel);
  refreshCustomWorkoutGroupedCopyWeights(carousel);
  if (count) {
    const undo = section.querySelector("[data-custom-grouped-undo-weights]");
    if (undo) {
      undo.dataset.customGroupedCopySource = usePersonalBest ? "pr" : "previous";
      undo.focus();
    }
  } else {
    const status = section.querySelector("[data-custom-grouped-copy-status]");
    const message = section.querySelector("[data-custom-grouped-copy-message]");
    if (status) status.hidden = false;
    if (message) message.textContent = usePersonalBest
      ? "No personal record weights or reps for the empty fields."
      : `No weights or reps to copy from the previous ${workoutSetUnit(carousel).toLowerCase()}.`;
  }
}

function undoCustomWorkoutGroupedWeights(button) {
  const carousel = button?.closest("[data-custom-workout-grouped='true']");
  const section = button?.closest("[data-custom-grouped-round]");
  const roundNumber = Number(button?.dataset.customGroupedUndoWeights);
  if (!carousel || !section) return;

  let count = 0;
  customWorkoutGroupedCopyRows(carousel, roundNumber).forEach(({ row, input, field, exerciseIndex, context }) => {
    const visible = customWorkoutGroupedCopyVisibleInput(section, exerciseIndex, field);
    if (input.dataset.lastWeightCopyValue !== undefined && input.dataset.lastWeightCopyContext === context &&
      !row.classList.contains("is-complete") && input.value === input.dataset.lastWeightCopyValue &&
      visible?.value === input.value) {
      input.value = "";
      visible.value = "";
      count += 1;
    }
    clearCustomWorkoutGroupedWeightCopy(input);
  });
  if (count) persistCustomWorkoutDraftForElement(carousel);
  refreshCustomWorkoutGroupedCopyWeights(carousel);
  const copyButtons = Array.from(section.querySelectorAll("[data-custom-grouped-copy-weights]"));
  const source = button.dataset.customGroupedCopySource || "previous";
  const returnFocus = copyButtons.find((copyButton) => !copyButton.disabled &&
    (copyButton.dataset.customGroupedCopySource || "previous") === source) ||
    copyButtons.find((copyButton) => !copyButton.disabled);
  returnFocus?.focus();
}

function customWorkoutGroupedSectionsMarkup(carousel) {
  const logElements = customWorkoutGroupedLogElements(carousel);
  const warmUps = [];
  const columnLabelsMarkup = `
    <div class="custom-workout-grouped-columns">
      <span>Set</span><span>Weight</span><span>Reps</span>
      <button class="rir-help-trigger" type="button" data-rir-help aria-label="What does RIR mean?" aria-haspopup="dialog"><span>RIR</span><svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="8"/><path d="M10 9v5M10 5.5v1"/></svg></button>
    </div>
  `;

  logElements.forEach((logElement, exerciseIndex) => {
    const exerciseName = currentExerciseLabel(logElement) || `Exercise ${exerciseIndex + 1}`;
    customWorkoutGroupedRows(logElement, warmUpSetType).forEach((row) => {
      warmUps.push({ row, exerciseIndex, exerciseName });
    });
  });

  const warmUpMarkup = warmUps.length > 0 ? `
    <section class="custom-workout-grouped-section" data-kind="warmup">
      <header class="custom-workout-grouped-section-heading">
        <h4>Warm-up</h4>
        <p>Excluded from working volume</p>
      </header>
      ${columnLabelsMarkup}
      ${warmUps.map((item, index) => customWorkoutGroupedSetRowMarkup(
        item.row,
        `W${index + 1}`,
        item.exerciseIndex,
        warmUpSetType,
        0,
        item.exerciseName
      )).join("")}
      <div class="custom-workout-grouped-round-action">
        <button class="custom-workout-grouped-log-round" type="button" data-custom-grouped-log-warmup aria-pressed="false">Log warm-up</button>
      </div>
    </section>
  ` : "";
  const roundCount = customWorkoutGroupedRoundCount(carousel);
  const roundsMarkup = Array.from({ length: roundCount }, (_, roundIndex) => {
    const roundNumber = roundIndex + 1;
    const rows = logElements.map((logElement, exerciseIndex) => ({
      row: customWorkoutGroupedRows(logElement, workingSetType)[roundIndex],
      exerciseIndex,
      exerciseName: currentExerciseLabel(logElement) || `Exercise ${exerciseIndex + 1}`
    })).filter((item) => item.row);
    const logged = customWorkoutGroupedRoundIsLogged(carousel, roundNumber);

    return `
      <section class="custom-workout-grouped-section" data-kind="round" data-custom-grouped-round="${roundNumber}" data-custom-grouped-round-logged="${logged}">
        <header class="custom-workout-grouped-section-heading">
          <h4>${workoutSetUnit(carousel)} ${roundNumber}</h4>
          <div class="custom-workout-grouped-copy-actions">
          ${roundNumber > 1 ? `<button class="custom-workout-grouped-copy-weights" type="button" data-custom-grouped-copy-weights="${roundNumber}" ${logged ? "disabled" : ""}
            aria-label="Copy weights and reps from ${workoutSetUnit(carousel).toLowerCase()} ${roundNumber - 1} into empty fields in ${workoutSetUnit(carousel).toLowerCase()} ${roundNumber}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4"/></svg>
            Copy previous ${workoutSetUnit(carousel).toLowerCase()}
          </button>` : ""}
          <button class="custom-workout-grouped-copy-weights" type="button" data-custom-grouped-copy-weights="${roundNumber}" data-custom-grouped-copy-source="pr" ${logged ? "disabled" : ""}
            aria-label="Copy personal record weights and reps into empty fields in ${workoutSetUnit(carousel).toLowerCase()} ${roundNumber}">Use PR weight &amp; reps</button>
          </div>
        </header>
        <p class="custom-workout-grouped-pr-preview" data-custom-grouped-pr-preview hidden></p>
        <div class="custom-workout-grouped-copy-status" data-custom-grouped-copy-status role="status" aria-live="polite" hidden>
          <span data-custom-grouped-copy-message></span>
          <button class="custom-workout-grouped-undo-weights" type="button" data-custom-grouped-undo-weights="${roundNumber}" aria-label="Undo copied weights and reps in ${workoutSetUnit(carousel).toLowerCase()} ${roundNumber}" hidden>Undo</button>
        </div>
        ${columnLabelsMarkup}
        ${rows.map((item) => customWorkoutGroupedSetRowMarkup(
          item.row,
          customWorkoutGroupedRoundCode(roundNumber, item.exerciseIndex),
          item.exerciseIndex,
          workingSetType,
          roundNumber,
          item.exerciseName
        )).join("")}
        <div class="custom-workout-grouped-round-action" data-custom-grouped-round-action>
          <button
            class="custom-workout-grouped-log-round"
            type="button"
            data-custom-grouped-log-round="${roundNumber}"
            aria-pressed="${logged}"
          >${logged ? `✓ ${workoutSetUnit(carousel)} ${roundNumber} logged` : `Log ${workoutSetUnit(carousel).toLowerCase()}`}</button>
          <div class="custom-workout-grouped-rest-controls" data-custom-grouped-rest-controls hidden>
            <button type="button" data-custom-grouped-rest-adjust="-15" aria-label="Remove 15 seconds from rest timer">−15</button>
            <button type="button" data-custom-grouped-rest-toggle>Rest 01:00 · Pause</button>
            <button type="button" data-custom-grouped-rest-adjust="15" aria-label="Add 15 seconds to rest timer">+15</button>
          </div>
        </div>
      </section>
    `;
  }).join("");

  return `${warmUpMarkup}${roundsMarkup}`;
}

function renderCustomWorkoutGroupedTimerPanels() {
  document.querySelectorAll("[data-custom-workout-grouped='true']").forEach((carousel) => {
    const panel = carousel.closest(".client-workout-panel-custom, .client-workout-panel-assigned");
    const timer = carousel.querySelector("[data-custom-grouped-timer]");
    const time = timer?.querySelector("[data-custom-grouped-timer-time]");
    const state = timer?.querySelector("[data-custom-grouped-timer-state]");
    const workoutTitle = String(panel?.dataset.customWorkoutTitle || "").trim();
    const workoutDate = panel?.querySelector("[data-workout-date]")?.value || todayDate();
    const isCurrentWorkout = Boolean(
      workoutElapsedTimerState &&
      workoutTitle === String(workoutElapsedTimerState.workoutTitle || "").trim() &&
      workoutDate === String(workoutElapsedTimerState.workoutDate || "")
    );

    if (!timer) return;
    timer.hidden = !isCurrentWorkout;
    if (!isCurrentWorkout) return;

    const milliseconds = workoutElapsedMilliseconds();
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    if (time) {
      time.textContent = workoutElapsedTimeLabel(milliseconds);
      time.setAttribute("datetime", `PT${seconds}S`);
    }
    if (state) {
      const startedAfterRound = Math.max(0, Number(workoutElapsedTimerState.startedAfterRound) || 0);
      state.textContent = startedAfterRound
        ? `Started after round ${startedAfterRound}`
        : (workoutElapsedTimerState.running ? "Workout in progress" : "Workout paused");
    }
  });
}

function refreshCustomWorkoutGroupedWarmUp(carousel) {
  const button = carousel?.querySelector("[data-custom-grouped-log-warmup]");
  if (!button) return;
  const enteredRows = customWorkoutGroupedLogElements(carousel)
    .flatMap((logElement) => customWorkoutGroupedRows(logElement, warmUpSetType))
    .filter((row) => {
      const values = setRowInputValues(row);
      return values.weightRaw !== "" || values.repsRaw !== "" || String(row.dataset.repsInReserve || "").trim() !== "";
    });
  const saving = carousel.dataset.customGroupedWarmupSaving === "true";
  const logged = enteredRows.length > 0 && enteredRows.every((row) => row.classList.contains("is-complete"));
  button.textContent = saving ? "Saving warm-up…" : logged ? "✓ Warm-up logged" : "Log warm-up";
  button.disabled = saving || logged;
  button.setAttribute("aria-pressed", String(logged && !saving));
  button.setAttribute("aria-busy", String(saving));
}

function refreshCustomWorkoutGroupedCompletion(carousel) {
  const visibleRows = Array.from(carousel?.querySelectorAll(".custom-workout-grouped-row") || []);
  let completeCount = 0;

  visibleRows.forEach((visibleRow) => {
    const canonicalRow = customWorkoutGroupedCanonicalRow(
      carousel,
      visibleRow.dataset.customGroupedExerciseIndex,
      visibleRow.dataset.customGroupedSetType,
      visibleRow.dataset.customGroupedSetNumber
    );
    const complete = canonicalRow?.classList.contains("is-complete") || false;
    const code = visibleRow.querySelector("[data-custom-grouped-set-toggle]");

    visibleRow.classList.toggle("is-complete", complete);
    if (code) {
      code.setAttribute("aria-pressed", String(complete));
      const context = (code.getAttribute("aria-label") || "")
        .replace(/^(Reopen|Mark)\s+/, "")
        .replace(/\s+not logged$/, "");
      code.disabled = !complete || carousel.dataset.customGroupedWarmupSaving === "true";
      code.setAttribute("aria-label", complete
        ? `Reopen ${context}`
        : `${context} not logged`);
    }
    if (complete) completeCount += 1;
  });

  carousel?.querySelectorAll("[data-custom-grouped-round]").forEach((section) => {
    const roundNumber = Number(section.dataset.customGroupedRound) || 1;
    const logged = customWorkoutGroupedRoundIsLogged(carousel, roundNumber);
    const button = section.querySelector("[data-custom-grouped-log-round]");

    section.dataset.customGroupedRoundLogged = String(logged);
    if (button) {
      button.setAttribute("aria-pressed", String(logged));
      button.textContent = logged ? `✓ ${workoutSetUnit(carousel)} ${roundNumber} logged` : `Log ${workoutSetUnit(carousel).toLowerCase()}`;
    }
  });

  const progress = carousel?.querySelector("[data-custom-grouped-progress]");
  if (progress) progress.textContent = `${completeCount} / ${visibleRows.length} complete`;
  refreshCustomWorkoutGroupedWarmUp(carousel);
  refreshCustomWorkoutGroupedCopyWeights(carousel);
}

function renderCustomWorkoutGroupedCard(carousel) {
  if (carousel?.dataset.customGroupedWarmupSaving === "true") return;
  const sections = carousel?.querySelector("[data-custom-grouped-sections]");
  const logElements = customWorkoutGroupedLogElements(carousel);

  if (!carousel || !sections) return;

  if (normalizeCustomWorkoutGroupedRoundRows(logElements)) {
    persistCustomWorkoutDraftForElement(carousel);
  }

  logElements.forEach((logElement) => {
    updateSetHistoryPlaceholders(logElement);
    logElement.querySelectorAll("[data-set-row]").forEach((row) => {
      row.dataset.groupedRoundRequired = "true";
    });
    logElement.dataset.groupedRoundMode = "true";
    logElement.dataset.groupLoggedSets = String(
      customWorkoutGroupedRows(logElement, workingSetType)
        .filter((row) => row.classList.contains("is-complete"))
        .length
    );
  });
  carousel.dataset.carouselEnabled = "false";
  carousel.dataset.customWorkoutDeck = "false";
  carousel.dataset.groupWorkoutDeck = "false";
  renderCustomWorkoutGroupedExerciseKey(carousel);
  sections.innerHTML = customWorkoutGroupedSectionsMarkup(carousel);
  syncCustomWorkoutGroupedRoundStepper(carousel);
  refreshCustomWorkoutGroupedCompletion(carousel);
  renderCustomWorkoutGroupedTimerPanels();
  renderCustomWorkoutGroupedRestControls();
}

function syncCustomWorkoutGroupedRoundStepper(carousel) {
  const count = customWorkoutGroupedRoundCount(carousel);
  const output = carousel?.querySelector("[data-custom-grouped-round-count]");
  const removeButton = carousel?.querySelector("[data-custom-grouped-remove-round]");

  if (output) output.textContent = String(count);
  if (removeButton) removeButton.disabled = count <= 1;
}

function customWorkoutGroupedStatus(carousel) {
  return carousel?.querySelector("[data-custom-grouped-status]") || null;
}

function customWorkoutGroupedTimerConflict(carousel) {
  const panel = carousel?.closest(".client-workout-panel-custom, .client-workout-panel-assigned");
  const workoutTitle = String(panel?.dataset.customWorkoutTitle || customWorkoutTitle).trim();
  const workoutDate = panel?.querySelector("[data-workout-date]")?.value || todayDate();

  return Boolean(
    workoutElapsedTimerState &&
    (
      String(workoutElapsedTimerState.workoutTitle || "").trim() !== workoutTitle ||
      String(workoutElapsedTimerState.workoutDate || "") !== workoutDate
    )
  );
}

function customWorkoutGroupedPendingRows(scope) {
  return Array.from(scope?.querySelectorAll('.custom-workout-grouped-row') || [])
    .filter((visibleRow) => {
      const carousel = visibleRow.closest("[data-custom-workout-grouped='true']");
      const canonicalRow = customWorkoutGroupedCanonicalRow(
        carousel,
        visibleRow.dataset.customGroupedExerciseIndex,
        visibleRow.dataset.customGroupedSetType,
        visibleRow.dataset.customGroupedSetNumber
      );
      const hasEntry = Array.from(visibleRow.querySelectorAll("[data-custom-grouped-field]"))
        .some((input) => String(input.value || "").trim() !== "");

      return !canonicalRow?.classList.contains("is-complete") && (
        hasEntry || canonicalRow?.dataset.customGroupedReopened === "true"
      );
    });
}

function validateCustomWorkoutGroupedExerciseNames(carousel, sectionLabel = "round") {
  const status = customWorkoutGroupedStatus(carousel);
  const inputs = Array.from(carousel?.querySelectorAll("[data-custom-workout-group-name-input]") || []);
  const firstBlank = inputs.find((input) => String(input.value || "").trim() === "");

  inputs.forEach((input) => {
    if (String(input.value || "").trim()) {
      input.removeAttribute("aria-invalid");
    } else {
      input.setAttribute("aria-invalid", "true");
    }
  });
  if (!firstBlank) return true;

  const section = firstBlank.closest("[data-custom-workout-group-name-section]");
  const fields = section?.querySelector("[data-custom-workout-group-name-fields]");
  const toggle = section?.querySelector("[data-custom-workout-group-name-toggle]");
  const icon = section?.querySelector("[data-custom-workout-group-name-icon]");
  if (carousel) carousel.dataset.groupNamesExpanded = "true";
  if (fields) fields.hidden = false;
  toggle?.setAttribute("aria-expanded", "true");
  if (icon) icon.textContent = "−";
  if (status) status.textContent = `Name every exercise before logging the ${sectionLabel}.`;
  firstBlank.focus();
  return false;
}

function syncCustomWorkoutGroupedField(input) {
  const visibleRow = input?.closest(".custom-workout-grouped-row");
  const carousel = input?.closest("[data-custom-workout-grouped='true']");

  if (!visibleRow || !carousel) return;

  const canonicalRow = customWorkoutGroupedCanonicalRow(
    carousel,
    visibleRow.dataset.customGroupedExerciseIndex,
    visibleRow.dataset.customGroupedSetType,
    visibleRow.dataset.customGroupedSetNumber
  );
  const field = input.dataset.customGroupedField;

  if (!canonicalRow || !field) return;

  if (field === "weight" || field === "reps") clearCustomWorkoutGroupedWeightCopy(canonicalRow.querySelector(`[data-set-${field}]`));
  if (field === "rir") {
    const value = String(input.value || "").trim();
    if (value === "") {
      delete canonicalRow.dataset.repsInReserve;
    } else {
      canonicalRow.dataset.repsInReserve = value;
    }
  } else {
    const canonicalInput = canonicalRow.querySelector(
      field === "weight" ? "[data-set-weight]" : "[data-set-reps]"
    );
    if (canonicalInput) canonicalInput.value = input.value;
  }

  const wasComplete = canonicalRow.classList.contains("is-complete");
  if (wasComplete) {
    canonicalRow.dataset.customGroupedReopened = "true";
    setCustomWorkoutGroupedRowComplete(canonicalRow, false);
    const section = visibleRow.closest("[data-custom-grouped-round]");
    const roundNumber = Number(section?.dataset.customGroupedRound) || 0;
    const status = customWorkoutGroupedStatus(carousel);
    if (status && roundNumber > 0) {
      status.textContent = `${workoutSetUnit(carousel)} ${roundNumber} reopened. Tap Log ${workoutSetUnit(carousel).toLowerCase()} when the edits are ready.`;
    } else if (status && visibleRow.dataset.customGroupedSetType === warmUpSetType) {
      status.textContent = "Warm-up reopened. Tap Log warm-up when the edits are ready.";
    }
  }

  input.removeAttribute("aria-invalid");
  persistCustomWorkoutDraftForElement(canonicalRow);
  refreshCustomWorkoutGroupedCompletion(carousel);
}

function validateCustomWorkoutGroupedSection(section, options = {}) {
  const rows = Array.isArray(options.rows)
    ? options.rows
    : Array.from(section?.querySelectorAll(".custom-workout-grouped-row") || []);
  const status = options.status || customWorkoutGroupedStatus(section?.closest("[data-custom-workout-grouped='true']"));
  let firstInvalid = null;

  rows.forEach((row) => {
    const weight = row.querySelector('[data-custom-grouped-field="weight"]');
    const reps = row.querySelector('[data-custom-grouped-field="reps"]');
    const rir = row.querySelector('[data-custom-grouped-field="rir"]');
    const isWarmUp = row.dataset.customGroupedSetType === warmUpSetType;
    const weightRaw = String(weight?.value || "").trim();
    const repsRaw = String(reps?.value || "").trim();
    const rirRaw = String(rir?.value || "").trim();
    const weightValue = Number(weight?.value);
    const repsValue = Number(reps?.value);
    const rirValue = Number(rir?.value);
    const weightInvalid = weightRaw === "" || !Number.isFinite(weightValue) || weightValue < 0;
    const repsInvalid = repsRaw === "" || !Number.isFinite(repsValue) || (isWarmUp ? repsValue < 0 : repsValue <= 0);
    const rirInvalid = rirRaw !== "" && (!Number.isFinite(rirValue) || rirValue < 0 || rirValue > 5);
    const weightValid = !weightInvalid;
    const repsValid = !repsInvalid;
    const rirValid = !rirInvalid;

    [[weight, weightValid], [reps, repsValid], [rir, rirValid]].forEach(([input, valid]) => {
      if (!input) return;
      if (valid) {
        input.removeAttribute("aria-invalid");
      } else {
        input.setAttribute("aria-invalid", "true");
        firstInvalid ||= input;
      }
    });
  });

  if (firstInvalid && status) {
    status.textContent = "Enter weight (0 is allowed) and reps (0 is allowed for warm-ups). Working reps must be above 0. RIR is optional and must be 0 to 5 when entered.";
  }
  if (firstInvalid && options.focus !== false) firstInvalid.focus();

  return { valid: !firstInvalid, firstInvalid };
}

function completeEnteredCustomWorkoutWarmUps(carousel) {
  const warmUpSection = carousel?.querySelector('.custom-workout-grouped-section[data-kind="warmup"]');
  if (!warmUpSection) return { valid: true, rows: [], previousStates: [] };

  const enteredRows = Array.from(warmUpSection.querySelectorAll(".custom-workout-grouped-row")).filter((row) => (
    Array.from(row.querySelectorAll("[data-custom-grouped-field]")).some((input) => String(input.value || "").trim() !== "")
  ));
  if (enteredRows.length === 0) return { valid: true, rows: [], previousStates: [] };

  const validation = validateCustomWorkoutGroupedSection(warmUpSection, {
    rows: enteredRows,
    focus: true,
    status: customWorkoutGroupedStatus(carousel)
  });
  if (!validation.valid) {
    return { valid: false, rows: [], previousStates: [] };
  }

  const canonicalRows = enteredRows.map((visibleRow) => customWorkoutGroupedCanonicalRow(
    carousel,
    visibleRow.dataset.customGroupedExerciseIndex,
    visibleRow.dataset.customGroupedSetType,
    visibleRow.dataset.customGroupedSetNumber
  )).filter(Boolean);
  const previousStates = canonicalRows.map((row) => row.classList.contains("is-complete"));
  canonicalRows.forEach((row) => setCustomWorkoutGroupedRowComplete(row, true));
  return { valid: true, rows: canonicalRows, previousStates };
}

async function logCustomWorkoutGroupedWarmUp(button) {
  const carousel = button?.closest("[data-custom-workout-grouped='true']");
  const section = button?.closest('[data-kind="warmup"]');
  const status = customWorkoutGroupedStatus(carousel);
  const logElements = customWorkoutGroupedLogElements(carousel);
  if (!carousel || !section || button.disabled || !logElements.length || carousel.dataset.customGroupedWarmupSaving === "true") return { saved: false };
  const workoutPanel = carousel.closest(".client-workout-panel") || carousel;
  if (Array.from(workoutPanel.querySelectorAll("[data-custom-grouped-log-round]")).some((control) => control.disabled)) return { saved: false };
  if (customWorkoutGroupedTimerConflict(carousel)) {
    if (status) status.textContent = "Finish the workout already in progress before logging this warm-up.";
    return { saved: false, timerConflict: true };
  }
  if (!validateCustomWorkoutGroupedExerciseNames(carousel, "warm-up")) return { saved: false, validation: true };
  const warmUps = completeEnteredCustomWorkoutWarmUps(carousel);
  if (!warmUps.valid) return { saved: false, validation: true };
  if (!warmUps.rows.length) {
    if (status) status.textContent = "Enter weight and reps for at least one warm-up set, then tap Log warm-up.";
    section.querySelector('[data-custom-grouped-field="weight"]')?.focus();
    return { saved: false, validation: true };
  }

  const controls = Array.from(workoutPanel.querySelectorAll("input, textarea, select, button"))
    .map((control) => ({ control, disabled: control.disabled }));
  controls.forEach(({ control }) => { control.disabled = true; });
  carousel.dataset.customGroupedWarmupSaving = "true";
  refreshCustomWorkoutGroupedWarmUp(carousel);
  let result = { saved: false };
  try {
    result = await saveTrainingLogRows(button, logElements, status, {
      savingMessage: "Logging warm-up...",
      successMessage: "Warm-up logged and autosaved.",
      setType: warmUpSetType,
      skipRemovedSetDelete: true,
      skipLogRefresh: true
    });
    return result;
  } catch (error) {
    if (status) status.textContent = "Could not save the warm-up. Your entries are still here. Please try again.";
    return { saved: false, error };
  } finally {
    if (!result.saved) {
      warmUps.rows.forEach((row, index) => setCustomWorkoutGroupedRowComplete(row, warmUps.previousStates[index]));
    }
    controls.forEach(({ control, disabled }) => { control.disabled = disabled; });
    delete carousel.dataset.customGroupedWarmupSaving;
    persistCustomWorkoutDraftForElement(carousel);
    refreshCustomWorkoutGroupedCompletion(carousel);
  }
}

async function logCustomWorkoutGroupedRound(button) {
  const carousel = button?.closest("[data-custom-workout-grouped='true']");
  const section = button?.closest("[data-custom-grouped-round]");
  const roundNumber = Number(button?.dataset.customGroupedLogRound || section?.dataset.customGroupedRound) || 1;
  const status = customWorkoutGroupedStatus(carousel);
  const logElements = customWorkoutGroupedLogElements(carousel);

  if (!carousel || !section || button.disabled || logElements.length === 0 || carousel.dataset.customGroupedWarmupSaving === "true") return { saved: false };

  if (customWorkoutGroupedTimerConflict(carousel)) {
    if (status) status.textContent = `Finish the workout already in progress before logging this ${workoutSetUnit(carousel).toLowerCase()}.`;
    return { saved: false, timerConflict: true };
  }

  if (!validateCustomWorkoutGroupedExerciseNames(carousel)) {
    return { saved: false, validation: true };
  }

  const validation = validateCustomWorkoutGroupedSection(section, { status });
  if (!validation.valid) return { saved: false, validation: true };

  const warmUps = completeEnteredCustomWorkoutWarmUps(carousel);
  if (!warmUps.valid) return { saved: false, validation: true };

  const roundRows = logElements
    .map((logElement) => customWorkoutGroupedRows(logElement, workingSetType)[roundNumber - 1])
    .filter(Boolean);
  const changedRows = [...warmUps.rows, ...roundRows];
  const previousStates = [
    ...warmUps.previousStates,
    ...roundRows.map((row) => row.classList.contains("is-complete"))
  ];

  roundRows.forEach((row) => setCustomWorkoutGroupedRowComplete(row, true));
  persistCustomWorkoutDraftForElement(carousel);
  refreshCustomWorkoutGroupedCompletion(carousel);

  const result = await saveTrainingLogRows(button, logElements, status, {
    savingMessage: `Logging ${workoutSetUnit(carousel).toLowerCase()} ${roundNumber}...`,
    successMessage: `${workoutSetUnit(carousel)} ${roundNumber} logged and autosaved.`,
    skipRemovedSetDelete: true,
    skipLogRefresh: true
  });

  if (!result.saved) {
    changedRows.forEach((row, index) => setCustomWorkoutGroupedRowComplete(row, previousStates[index]));
    persistCustomWorkoutDraftForElement(carousel);
    refreshCustomWorkoutGroupedCompletion(carousel);
    return result;
  }

  if (!workoutElapsedTimerState) {
    const panel = carousel.closest(".client-workout-panel-custom, .client-workout-panel-assigned");
    const panels = Array.from(document.querySelectorAll(".client-workout-panel"));
    startWorkoutElapsedTimer(panel?.dataset.customWorkoutTitle || customWorkoutTitle, {
      workoutDate: panel?.querySelector("[data-workout-date]")?.value || todayDate(),
      panelIndex: panels.indexOf(panel),
      startedAfterRound: roundNumber
    });
  }

  renderCustomWorkoutGroupedCard(carousel);
  customWorkoutGroupedRestAction = carousel.querySelector(
    `[data-custom-grouped-round="${roundNumber}"] [data-custom-grouped-round-action]`
  );
  resetRestTimer();
  startOrPauseRestTimer();
  const nextButton = carousel.querySelector(`[data-custom-grouped-log-round="${roundNumber + 1}"]`);
  nextButton?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  return result;
}

function removeCustomWorkoutGroupedRound(button) {
  const carousel = button?.closest("[data-custom-workout-grouped='true']");
  const logElements = customWorkoutGroupedLogElements(carousel);
  const roundCount = customWorkoutGroupedRoundCount(carousel);
  const status = customWorkoutGroupedStatus(carousel);

  if (!carousel || logElements.length === 0 || roundCount <= 1) {
    if (status) status.textContent = `Keep at least one ${workoutSetUnit(carousel).toLowerCase()}.`;
    syncCustomWorkoutGroupedRoundStepper(carousel);
    return false;
  }
  if (customWorkoutGroupedRoundIsLogged(carousel, roundCount)) {
    if (status) status.textContent = `${workoutSetUnit(carousel)} ${roundCount} is already logged and cannot be removed.`;
    return false;
  }

  const rows = logElements
    .map((logElement) => customWorkoutGroupedRows(logElement, workingSetType)[roundCount - 1])
    .filter(Boolean);
  const hasEntries = rows.some((row) => {
    const values = setRowInputValues(row);
    return Boolean(values.weightRaw || values.repsRaw || row.dataset.repsInReserve);
  });

  if (hasEntries && !window.confirm(`Remove ${workoutSetUnit(carousel).toLowerCase()} ${roundCount} and its entered values?`)) {
    return false;
  }

  rows.forEach((row) => row.remove());
  logElements.forEach((logElement) => {
    renumberSetRows(logElement);
    syncVisibleSetTarget(logElement);
    updateVisibleSetProgress(logElement);
  });
  if (customWorkoutGroupedRestAction?.closest(`[data-custom-grouped-round="${roundCount}"]`)) {
    customWorkoutGroupedRestAction = null;
  }
  persistCustomWorkoutDraftForElement(carousel);
  renderCustomWorkoutGroupedCard(carousel);
  if (status) status.textContent = `${workoutSetUnit(carousel)} ${roundCount} removed.`;
  return true;
}

function addCustomWorkoutGroupedRound(button) {
  const carousel = button?.closest("[data-custom-workout-grouped='true']");
  const logElements = customWorkoutGroupedLogElements(carousel);

  if (!carousel || logElements.length === 0) return;

  logElements.forEach((logElement) => addSetRow(logElement, { skipDraft: true }));
  persistCustomWorkoutDraftForElement(carousel);
  renderCustomWorkoutGroupedCard(carousel);

  const newRound = customWorkoutGroupedRoundCount(carousel);
  const firstField = carousel.querySelector(
    `[data-custom-grouped-round="${newRound}"] [data-custom-grouped-field="weight"]`
  );
  const status = customWorkoutGroupedStatus(carousel);
  if (status) status.textContent = `${workoutSetUnit(carousel)} ${newRound} added.`;
  firstField?.focus();
  firstField?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
}

function toggleCustomWorkoutGroupedSet(button) {
  const visibleRow = button?.closest(".custom-workout-grouped-row");
  const carousel = button?.closest("[data-custom-workout-grouped='true']");
  const canonicalRow = customWorkoutGroupedCanonicalRow(
    carousel,
    visibleRow?.dataset.customGroupedExerciseIndex,
    visibleRow?.dataset.customGroupedSetType,
    visibleRow?.dataset.customGroupedSetNumber
  );
  const status = customWorkoutGroupedStatus(carousel);

  if (!visibleRow || !canonicalRow || !carousel) return;

  if (canonicalRow.classList.contains("is-complete")) {
    canonicalRow.dataset.customGroupedReopened = "true";
    setCustomWorkoutGroupedRowComplete(canonicalRow, false);
    if (status) status.textContent = visibleRow.dataset.customGroupedSetType === warmUpSetType
      ? "Warm-up set reopened."
      : `Round ${Number(visibleRow.closest("[data-custom-grouped-round]")?.dataset.customGroupedRound) || 1} reopened.`;
  } else if (visibleRow.dataset.customGroupedSetType === warmUpSetType) {
    if (status) status.textContent = "Enter weight and reps, then tap Log warm-up.";
    return;
  } else if (status) {
    status.textContent = `Complete every exercise, then tap Log ${workoutSetUnit(carousel).toLowerCase()}.`;
    return;
  }

  persistCustomWorkoutDraftForElement(carousel);
  refreshCustomWorkoutGroupedCompletion(carousel);
}

function ensureCustomWorkoutGroupedFinishPanel() {
  if (customGroupedFinishPanel) return customGroupedFinishPanel;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="custom-workout-grouped-finish-overlay" data-custom-grouped-finish-overlay hidden>
      <section class="custom-workout-grouped-finish-dialog" role="dialog" aria-modal="true" aria-labelledby="custom-grouped-finish-title">
        <div class="custom-workout-grouped-finish-heading">
          <span>
            <small>Rounds complete</small>
            <h2 id="custom-grouped-finish-title">What would you like to do next?</h2>
          </span>
          <button type="button" class="custom-workout-grouped-finish-close" data-custom-grouped-finish-close aria-label="Close">×</button>
        </div>
        <p data-custom-grouped-finish-summary>Your logged rounds are saved.</p>
        <div class="custom-workout-grouped-finish-choices">
          <button type="button" data-custom-grouped-start-new>Start new workout</button>
          <button type="button" data-custom-grouped-workout-done>Workout done</button>
        </div>
      </section>
    </div>
  `.trim();
  customGroupedFinishPanel = wrapper.firstElementChild;
  document.body.appendChild(customGroupedFinishPanel);
  return customGroupedFinishPanel;
}

function closeCustomWorkoutGroupedFinishPanel(options = {}) {
  if (!customGroupedFinishPanel) return;
  customGroupedFinishPanel.hidden = true;
  document.body.classList.remove("custom-workout-grouped-finish-open");
  if (options.restoreFocus !== false) customGroupedFinishReturnFocus?.focus?.();
  customGroupedFinishReturnFocus = null;
}

function openCustomWorkoutGroupedFinishPanel(button) {
  const carousel = button?.closest("[data-custom-workout-grouped='true']");
  const panel = carousel?.closest(".client-workout-panel-custom");
  const loggedRounds = Array.from(panel?.querySelectorAll('[data-custom-grouped-round-logged="true"]') || []).length;
  const status = customWorkoutGroupedStatus(carousel);

  if (!carousel || loggedRounds === 0) {
    if (status) status.textContent = "Log at least one round before finishing the workout.";
    return;
  }
  if (customWorkoutGroupedTimerConflict(carousel)) {
    if (status) status.textContent = "Finish the workout already in progress before finishing this workout.";
    return;
  }
  const invalidNameCarousel = Array.from(panel.querySelectorAll("[data-custom-workout-grouped='true']"))
    .find((groupedCarousel) => !validateCustomWorkoutGroupedExerciseNames(groupedCarousel));
  if (invalidNameCarousel) return;
  if (customWorkoutGroupedPendingRows(panel).length > 0) {
    if (status) status.textContent = "Log your edited or partially entered round before finishing the workout.";
    return;
  }

  const overlay = ensureCustomWorkoutGroupedFinishPanel();
  const summary = overlay.querySelector("[data-custom-grouped-finish-summary]");
  customGroupedFinishReturnFocus = button;
  overlay.dataset.customGroupedFinishCarouselGroup = carousel.dataset.customWorkoutGroup || "0";
  if (summary) summary.textContent = `${loggedRounds} round${loggedRounds === 1 ? "" : "s"} logged and saved.`;
  overlay.hidden = false;
  document.body.classList.add("custom-workout-grouped-finish-open");
  overlay.querySelector("[data-custom-grouped-start-new]")?.focus();
}

function groupedCustomWorkoutRestartConfig(panel) {
  const format = normalizeCustomWorkoutFormat(panel?.dataset.customWorkoutFormat || activeCustomWorkoutFormat);
  return { panel, format, date: panel?.querySelector("[data-workout-date]")?.value || todayDate() };
}

function freshCustomWorkoutStorageTitle(now = new Date()) {
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  return `${customWorkoutTitle} · New · ${time}.${String(now.getMilliseconds()).padStart(3, "0")}`;
}

function startFreshGroupedCustomWorkout(config = {}) {
  const format = normalizeCustomWorkoutFormat(config.format || activeCustomWorkoutFormat);
  const exerciseCount = customWorkoutDefaultExerciseCount(format);
  const date = config.date || todayDate();
  const panels = Array.from(document.querySelectorAll(".client-workout-panel"));
  const panelIndex = Math.max(panels.indexOf(config.panel), 0);
  const sets = () => [
    { label: "W1", weight: "", reps: "", setType: warmUpSetType, rir: "", complete: false },
    ...Array.from({ length: customWorkoutDefaultWorkingSetCount }, (_, index) => ({
      label: String(index + 1), weight: "", reps: "", setType: workingSetType, rir: "", complete: false
    }))
  ];

  activeCustomWorkoutFormat = format;
  storeCustomWorkoutFormat(format);
  storeCustomWorkoutDraft({
    format,
    date,
    workoutTitle: freshCustomWorkoutStorageTitle(),
    exercises: Array.from({ length: exerciseCount }, (_, index) => ({
      code: customExerciseCode(index),
      name: "",
      group: format === "superset" ? Math.floor(index / 2) : 0,
      groupType: format,
      date,
      notes: "",
      skipped: false,
      sets: sets()
    }))
  });

  const replacement = replaceCustomWorkoutPanelFromDraft(panelIndex);
  if (replacement) activateClientWorkoutPanel(panelIndex, { focus: true, scroll: true });
}

function workoutCarouselExerciseCode(format, groupIndex, cardIndex) {
  const groupLetter = String.fromCharCode(65 + Math.min(Math.max(Number(groupIndex) || 0, 0), 25));
  return `${groupLetter}${cardIndex + 1}`;
}

function syncCustomWorkoutGroupNameEditor(carousel, cards, format, groupIndex) {
  const section = carousel?.querySelector("[data-custom-workout-group-name-section]");
  const fields = section?.querySelector("[data-custom-workout-group-name-fields]");
  const summary = section?.querySelector("[data-custom-workout-group-name-summary]");

  if (!section || !fields) {
    return;
  }

  const exercises = cards.map((card, index) => {
    const logElement = card.querySelector("[data-exercise-log]");
    const input = exerciseNameInputForLog(logElement);
    return {
      code: logElement?.dataset.exerciseCode || `CUSTOM${index + 1}`,
      name: String(input?.value || currentExerciseLabel(logElement) || "").trim()
    };
  });

  if (fields.children.length !== exercises.length) {
    fields.innerHTML = exercises
      .map((exercise, index) => customWorkoutGroupNameRowMarkup(exercise, format, groupIndex, index, carousel.dataset.exerciseEditorNamespace || ""))
      .join("");
  }

  const positions = [];
  cards.forEach((card, index) => {
    const position = workoutCarouselExerciseCode(format, groupIndex, index);
    const logElement = card.querySelector("[data-exercise-log]");
    const sourceInput = exerciseNameInputForLog(logElement);
    const groupInput = fields.querySelector(`[data-custom-workout-group-name-input="${index}"]`);
    const cardCode = card.querySelector("[data-custom-workout-group-card-code]");
    const name = String(sourceInput?.value || currentExerciseLabel(logElement) || "").trim();

    positions.push(position);
    if (groupInput && document.activeElement !== groupInput && groupInput.value !== name) {
      groupInput.value = name;
    }
    if (groupInput) {
      groupInput.setAttribute("aria-label", `${position} exercise name`);
    }
    if (cardCode) {
      cardCode.hidden = false;
      cardCode.textContent = position;
    }
  });

  if (summary) {
    summary.textContent = positions.join(" · ") || "Add exercise names";
  }

  const expanded = carousel.dataset.groupNamesExpanded !== "false";
  const toggle = section.querySelector("[data-custom-workout-group-name-toggle]");
  const icon = section.querySelector("[data-custom-workout-group-name-icon]");
  fields.hidden = !expanded;
  if (toggle) toggle.setAttribute("aria-expanded", String(expanded));
  if (icon) icon.textContent = expanded ? "−" : "+";
}

function customWorkoutEditableNameInput(card) {
  const carousel = card?.closest("[data-custom-workout-carousel]");
  const cardIndex = carousel ? customWorkoutCarouselCards(carousel).indexOf(card) : -1;
  return cardIndex >= 0
    ? carousel.querySelector(`[data-custom-workout-group-name-input="${cardIndex}"]`) || card.querySelector("[data-exercise-title-name]")
    : card?.querySelector("[data-exercise-title-name]") || null;
}

function workoutCarouselProgress(carousel, cards, format, groupIndex) {
  const exercises = cards.map((card, index) => {
    const logElement = card.querySelector("[data-exercise-log]");
    const name = currentExerciseLabel(logElement) || `Exercise ${index + 1}`;
    if (logElement && logElement.dataset.groupLoggedSets === undefined) {
      logElement.dataset.groupLoggedSets = String(filledSetCount(logElement));
    }
    return {
      card,
      logElement,
      name,
      code: workoutCarouselExerciseCode(format, groupIndex, index),
      completed: Math.max(Number(logElement?.dataset.groupLoggedSets) || 0, 0),
      target: Math.max(logElement ? visibleSetTarget(logElement) : 0, 1)
    };
  });
  const roundCount = Math.max(...exercises.map((exercise) => exercise.target), 1);
  let current = null;

  for (let round = 1; round <= roundCount && !current; round += 1) {
    const index = exercises.findIndex((exercise) => exercise.completed < Math.min(round, exercise.target));
    if (index >= 0) {
      current = { round, index, exercise: exercises[index] };
    }
  }

  const isComplete = current === null && exercises.length > 0;
  const displayRound = current?.round || roundCount;
  const nextIndex = !current
    ? -1
    : current.index + 1 < exercises.length
      ? current.index + 1
      : current.round < roundCount ? 0 : -1;

  return { exercises, roundCount, current, displayRound, nextIndex, isComplete };
}

function workoutCarouselSaveLabel(carousel) {
  switch (carousel?.dataset.autosaveState) {
    case "saving": return "↻ SAVING…";
    case "issue": return "! CHECK SAVE";
    case "saved": return "☁ AUTOSAVED";
    default: return "☁ AUTOSAVE ON";
  }
}

function setWorkoutCarouselAutosaveState(logElement, state) {
  const carousel = logElement?.closest("[data-custom-workout-carousel]");
  if (!carousel) return;
  carousel.dataset.autosaveState = state;
  renderCustomWorkoutCarousel(carousel);
}

function workoutCarouselRestSeconds(value) {
  const text = String(value || "").trim().toLowerCase();
  const number = Number(text.match(/[\d.]+/)?.[0]);
  if (!Number.isFinite(number) || number <= 0) return 60;
  return text.includes("min") ? Math.max(1, Math.round(number * 60)) : Math.max(1, Math.round(number));
}

function workoutCarouselProgressMarkup(carousel, progress, format, groupIndex) {
  const groupTitle = format === "circuit" ? `Circuit ${groupIndex + 1}` : `Superset ${groupIndex + 1}`;
  const roundTitle = progress.isComplete
    ? "All rounds complete"
    : `Round ${progress.displayRound} of ${progress.roundCount}`;

  return `
    <div class="workout-group-progress-heading">
      <span>
        <small>${escapeHtml(groupTitle)}</small>
        <strong>${escapeHtml(roundTitle)}</strong>
      </span>
      <em>${escapeHtml(workoutCarouselSaveLabel(carousel))}</em>
    </div>
    <div class="workout-group-sequence" role="list" aria-label="${escapeHtml(groupTitle)} sequence">
      ${progress.exercises.map((exercise, index) => {
        const isDone = progress.isComplete || exercise.completed >= Math.min(progress.displayRound, exercise.target);
        const isNext = !isDone && progress.current?.index === index;
        const status = isDone ? "Done" : isNext ? "Next" : "Wait";
        return `
          <span class="workout-group-sequence-item${isDone ? " is-done" : ""}${isNext ? " is-next" : ""}" role="listitem">
            <strong>${escapeHtml(exercise.code)} · ${status}</strong>
            <span>${escapeHtml(exercise.name)}</span>
          </span>
        `;
      }).join("")}
    </div>
  `;
}

function customWorkoutCarouselMeta(format, index, total, groupIndex = 0) {
  if (format === "single") {
    return {
      title: `Exercise ${index + 1} of ${total}`,
      count: "New exercise waiting below",
      cue: "Swipe between exercises or add another from the bottom of the deck."
    };
  }

  if (format === "superset") {
    const position = workoutCarouselExerciseCode(format, groupIndex, index);
    return {
      title: `Superset ${groupIndex + 1} · ${position}`,
      count: `Exercise ${index + 1} of ${total}`,
      cue: index % 2 === 0 && index + 1 < total
        ? "Next: complete the paired exercise."
        : "Rest, then repeat this pair."
    };
  }

  return {
    title: `Circuit ${groupIndex + 1} · ${workoutCarouselExerciseCode(format, groupIndex, index)}`,
    count: `Exercise ${index + 1} of ${total}`,
    cue: index + 1 < total
      ? `Next: move to ${workoutCarouselExerciseCode(format, groupIndex, index + 1)}.`
      : "Rest, then restart the circuit."
  };
}

function workoutCarouselDeckMeta(format, index, total, groupIndex, progress) {
  const groupTitle = `${groupTypeLabel(format)} ${groupIndex + 1}`;
  const position = workoutCarouselExerciseCode(format, groupIndex, index);
  const roundTitle = progress.isComplete
    ? "Complete"
    : `Round ${progress.displayRound} of ${progress.roundCount}`;

  return {
    title: `${groupTitle} · ${roundTitle}`,
    count: `${position} · Exercise ${index + 1} of ${total}`
  };
}

function workoutCarouselDeckCue(progress, activeIndex, format) {
  const exercises = Array.isArray(progress?.exercises) ? progress.exercises : [];

  if (exercises.length === 0) {
    return { hidden: true, complete: false, label: "", name: "", targetIndex: -1 };
  }

  if (progress.isComplete) {
    return {
      hidden: false,
      complete: true,
      label: `${groupTypeLabel(format)} complete ✓`,
      name: "All rounds are saved.",
      targetIndex: -1
    };
  }

  const index = Math.min(Math.max(Number(activeIndex) || 0, 0), exercises.length - 1);
  const wrapsToNextRound = index === exercises.length - 1;
  const targetIndex = wrapsToNextRound ? 0 : index + 1;
  const nextExercise = exercises[targetIndex];
  const nextPosition = nextExercise.code;

  return {
    hidden: false,
    complete: false,
    label: `${wrapsToNextRound ? "Next round" : "Up next"} · ${nextPosition}`,
    name: nextExercise.name,
    targetIndex
  };
}

function syncWorkoutGroupPrimaryActions(cards, progress, activeIndex, visible, format) {
  const safeCards = Array.isArray(cards) ? cards : [];
  const progressIndex = Number(progress?.current?.index);
  const hasProgressIndex = Number.isInteger(progressIndex) && progressIndex >= 0 && progressIndex < safeCards.length;
  const targetIndex = progress?.isComplete
    ? activeIndex
    : (hasProgressIndex ? progressIndex : activeIndex);
  const nextCode = progress?.nextIndex >= 0 ? progress.exercises?.[progress.nextIndex]?.code : "";

  safeCards.forEach((card, index) => {
    const primaryAction = card.querySelector("[data-workout-group-primary-action]");
    const logSetButton = primaryAction?.querySelector("[data-workout-group-log-set]");
    const cue = primaryAction?.querySelector("[data-custom-workout-carousel-cue]");
    const isCurrentVisibleCard = Boolean(visible && index === targetIndex && index === activeIndex);

    if (!primaryAction) {
      return;
    }

    primaryAction.hidden = !isCurrentVisibleCard;
    primaryAction.dataset.workoutGroupActionIndex = String(index);
    primaryAction.classList.toggle("is-complete", Boolean(progress?.isComplete));

    if (cue) {
      cue.textContent = progress?.isComplete
        ? `${groupTypeLabel(format)} complete. All rounds are saved.`
        : `No rest until the full ${groupTypeLabel(format).toLowerCase()} round is complete.`;
    }

    if (logSetButton) {
      logSetButton.textContent = progress?.isComplete
        ? `${groupTypeLabel(format)} complete ✓`
        : nextCode ? `Log set · Next: ${nextCode}` : "Log set · Finish group";
      logSetButton.disabled = Boolean(progress?.isComplete);
    }
  });
}

function renderCustomWorkoutCarousel(carousel) {
  const panel = carousel?.closest(".client-workout-panel-custom, .client-workout-panel-assigned");
  const cards = customWorkoutCarouselCards(carousel);
  const format = normalizeCustomWorkoutFormat(
    carousel?.dataset.customWorkoutFormat ||
    panel?.dataset.customWorkoutFormat ||
    panel?.dataset.assignedWorkoutFormat ||
    activeCustomWorkoutFormat
  );
  const groupIndex = Number(carousel?.dataset.customWorkoutGroup) || 0;
  const mobile = window.matchMedia("(max-width: 760px)").matches;
  const isCustomPanel = panel?.classList.contains("client-workout-panel-custom") || false;
  const straightDeckEnabled = mobile && format === "single" && cards.length > 1;
  const groupDeckEnabled = mobile && format !== "single" && cards.length > 1;
  const deckEnabled = straightDeckEnabled || groupDeckEnabled;
  const canAddExercise = straightDeckEnabled && isCustomPanel && carousel?.dataset.customWorkoutInlineAdd !== "false";
  const enabled = deckEnabled;
  const groupProgressEnabled = enabled && format !== "single";
  const activeIndex = Math.min(Math.max(Number(carousel?.dataset.activeIndex) || 0, 0), Math.max(cards.length - 1, 0));
  const status = carousel?.querySelector("[data-custom-workout-carousel-status]");
  const controls = carousel?.querySelector("[data-custom-workout-carousel-controls]");
  const dots = carousel?.querySelector("[data-custom-workout-carousel-dots]");
  const progressHeader = carousel?.querySelector("[data-workout-group-progress]");
  const newExerciseCard = carousel?.querySelector("[data-custom-workout-new-exercise]");
  const groupNextCard = carousel?.querySelector("[data-workout-group-next-card]");

  if (!carousel) {
    return;
  }

  if (carousel.dataset.customWorkoutGrouped === "true") {
    carousel.dataset.customWorkoutFormat = format;
    syncCustomWorkoutGroupNameEditor(carousel, cards, format, groupIndex);
    if (isCustomPanel) {
      panel.dataset.customWorkoutDeckEnabled = "false";
    }
    renderCustomWorkoutGroupedCard(carousel);
    return;
  }

  carousel.dataset.customWorkoutFormat = format;
  carousel.dataset.carouselEnabled = enabled ? "true" : "false";
  carousel.dataset.customWorkoutDeck = deckEnabled ? "true" : "false";
  carousel.dataset.groupWorkoutDeck = groupDeckEnabled ? "true" : "false";
  carousel.dataset.customWorkoutCanAddExercise = canAddExercise ? "true" : "false";
  carousel.dataset.activeIndex = String(activeIndex);
  syncCustomWorkoutGroupNameEditor(carousel, cards, format, groupIndex);
  if (isCustomPanel) {
    panel.dataset.customWorkoutDeckEnabled = straightDeckEnabled ? "true" : "false";
  }
  const progress = workoutCarouselProgress(carousel, cards, format, groupIndex);
  carousel.classList.toggle(
    "is-superset-complete",
    format === "superset" && cards.length > 1 && progress.isComplete
  );
  carousel.classList.toggle(
    "is-circuit-complete",
    format === "circuit" && cards.length > 1 && progress.isComplete
  );
  if (controls) controls.hidden = !enabled;
  if (status) status.hidden = !enabled;
  if (progressHeader) progressHeader.hidden = !groupProgressEnabled || groupDeckEnabled;
  syncWorkoutGroupPrimaryActions(cards, progress, activeIndex, groupProgressEnabled, format);
  if (newExerciseCard) {
    const nextExerciseNumber = (panel?.querySelectorAll("[data-custom-exercise-card]").length || cards.length) + 1;
    const label = newExerciseCard.querySelector("[data-custom-workout-new-exercise-label]");
    newExerciseCard.hidden = !canAddExercise;
    newExerciseCard.dataset.customWorkoutNewExercise = String(nextExerciseNumber);
    newExerciseCard.setAttribute("aria-label", `Add new exercise ${nextExerciseNumber}`);
    if (label) label.textContent = `+ New exercise ${nextExerciseNumber}`;
  }
  if (groupNextCard) {
    const deckCue = workoutCarouselDeckCue(progress, activeIndex, format);
    const label = groupNextCard.querySelector("[data-workout-group-next-label]");
    const name = groupNextCard.querySelector("[data-workout-group-next-name]");
    const canOpenNextCard = groupDeckEnabled && !deckCue.hidden && !deckCue.complete && deckCue.targetIndex >= 0;
    groupNextCard.hidden = !groupDeckEnabled || deckCue.hidden;
    groupNextCard.disabled = !canOpenNextCard;
    groupNextCard.dataset.workoutGroupNextIndex = canOpenNextCard ? String(deckCue.targetIndex) : "";
    groupNextCard.setAttribute(
      "aria-label",
      deckCue.complete
        ? `${groupTypeLabel(format)} complete. All rounds are saved.`
        : `Show ${deckCue.label}: ${deckCue.name}`
    );
    groupNextCard.classList.toggle("is-complete", groupDeckEnabled && deckCue.complete);
    if (label) label.textContent = deckCue.label;
    if (name) name.textContent = deckCue.name;
  }

  cards.forEach((card, index) => {
    const isActive = enabled && index === activeIndex;
    const isHiddenSlide = enabled && !isActive;
    const position = format === "single" ? `Exercise ${index + 1}` : workoutCarouselExerciseCode(format, groupIndex, index);
    const exerciseName = currentExerciseLabel(card.querySelector("[data-exercise-log]")) || "Exercise name";
    card.classList.toggle("is-carousel-active", isActive);
    card.setAttribute("aria-roledescription", enabled ? "slide" : "exercise");
    card.setAttribute("aria-label", `${position}: ${exerciseName}. ${index + 1} of ${cards.length}`);
    card.inert = isHiddenSlide;
    if (isHiddenSlide) {
      card.setAttribute("aria-hidden", "true");
    } else {
      card.removeAttribute("aria-hidden");
    }
  });

  if (!enabled) {
    if (dots) dots.innerHTML = "";
    return;
  }

  const meta = groupDeckEnabled
    ? workoutCarouselDeckMeta(format, activeIndex, cards.length, groupIndex, progress)
    : customWorkoutCarouselMeta(format, activeIndex, cards.length, groupIndex);
  if (format === "single" && !canAddExercise) {
    meta.count = "Swipe between exercises";
  }
  if (progressHeader) {
    progressHeader.innerHTML = workoutCarouselProgressMarkup(carousel, progress, format, groupIndex);
  }
  if (status) {
    status.innerHTML = `<strong>${escapeHtml(meta.title)}</strong><span>${escapeHtml(meta.count)}</span>`;
  }
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
  const wrapsGroupDeck = groupDeckEnabled && cards.length > 1;
  if (previous) {
    previous.disabled = !wrapsGroupDeck && activeIndex === 0;
    previous.setAttribute("aria-label", format === "circuit" ? "Previous station" : "Previous exercise");
  }
  if (next) {
    const addsExercise = canAddExercise && activeIndex === cards.length - 1;
    const startsNextRound = wrapsGroupDeck && activeIndex === cards.length - 1;
    next.disabled = !addsExercise && !wrapsGroupDeck && activeIndex === cards.length - 1;
    next.setAttribute(
      "aria-label",
      addsExercise
        ? `Add new exercise ${cards.length + 1}`
        : startsNextRound
          ? `Next round, ${format === "circuit" ? "station 1" : "exercise 1"}`
          : format === "circuit" ? "Next station" : "Next exercise"
    );
  }
}

function customWorkoutCarouselNavigationDecision(nextIndex, total, canAddExercise = false, wrap = false) {
  const count = Math.max(Number(total) || 0, 0);
  const requestedIndex = Number(nextIndex) || 0;

  if (canAddExercise && count > 0 && requestedIndex >= count) {
    return { action: "add", index: count };
  }

  if (wrap && count > 0) {
    return { action: "move", index: ((requestedIndex % count) + count) % count };
  }

  return {
    action: "move",
    index: Math.min(Math.max(requestedIndex, 0), Math.max(count - 1, 0))
  };
}

function requestCustomWorkoutNewExercise(carousel) {
  const addCard = carousel?.querySelector("[data-custom-workout-new-exercise]");

  if (!addCard || addCard.hidden) {
    return false;
  }

  addCard.click();
  return true;
}

function customWorkoutDeckDragMetrics(deltaX, width) {
  const safeWidth = Math.max(Number(width) || 0, 1);
  const rawX = Number(deltaX) || 0;
  const dragLimit = safeWidth * .72;
  const x = Math.max(-dragLimit, Math.min(rawX, dragLimit));
  const progress = Math.min(Math.abs(x) / safeWidth, 1);

  return {
    x: Math.round(x * 1000) / 1000,
    rotate: Math.round((x / safeWidth) * 2.4 * 1000) / 1000,
    opacity: Math.round((1 - (progress * .24)) * 1000) / 1000
  };
}

function applyCustomWorkoutDeckDrag(list, deltaX) {
  const metrics = customWorkoutDeckDragMetrics(deltaX, list?.clientWidth);

  list?.style.setProperty("--custom-workout-deck-drag-x", `${metrics.x}px`);
  list?.style.setProperty("--custom-workout-deck-drag-rotate", `${metrics.rotate}deg`);
  list?.style.setProperty("--custom-workout-deck-drag-opacity", String(metrics.opacity));
  return metrics;
}

function applyCustomWorkoutDeckExit(list, direction) {
  const normalizedDirection = Number(direction) > 0 ? 1 : -1;
  const exitX = normalizedDirection * -1 * (Math.max(Number(list?.clientWidth) || 0, 1) + 32);

  list?.style.setProperty("--custom-workout-deck-drag-x", `${exitX}px`);
  list?.style.setProperty("--custom-workout-deck-drag-rotate", `${normalizedDirection * -2.4}deg`);
  list?.style.setProperty("--custom-workout-deck-drag-opacity", "0");
}

function clearCustomWorkoutDeckDrag(list) {
  list?.style.removeProperty("--custom-workout-deck-drag-x");
  list?.style.removeProperty("--custom-workout-deck-drag-rotate");
  list?.style.removeProperty("--custom-workout-deck-drag-opacity");
  list?.classList.remove("is-touch-swiping", "is-deck-settling");
}

let customWorkoutDeckAnimationSequence = 0;

function moveCustomWorkoutCarousel(carousel, nextIndex, options = {}) {
  const list = carousel?.querySelector("[data-custom-workout-list]");
  const cards = customWorkoutCarouselCards(carousel);

  if (!carousel || !list || cards.length === 0 || carousel.dataset.customWorkoutGrouped === "true") {
    return;
  }

  const canAddExercise = carousel.dataset.customWorkoutCanAddExercise === "true";
  const isVisualDeck = carousel.dataset.customWorkoutDeck === "true";
  const wrapsGroupDeck = carousel.dataset.groupWorkoutDeck === "true";
  const instant = Boolean(options.instant);
  const reducedMotion = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  const currentIndex = Number(carousel.dataset.activeIndex) || 0;
  const decision = customWorkoutCarouselNavigationDecision(
    nextIndex,
    cards.length,
    canAddExercise,
    wrapsGroupDeck
  );
  if (decision.action === "add") {
    requestCustomWorkoutNewExercise(carousel);
    return;
  }

  const index = decision.index;
  const firstOffset = cards[0]?.offsetLeft || 0;
  const card = cards[index];
  const cardOffset = Math.max((card?.offsetLeft || 0) - firstOffset, 0);
  // Both custom and assigned workouts show one complete card at a time. Arrows,
  // dots, and swipe gestures provide the navigation cue without clipping cards.
  const targetLeft = cardOffset;
  carousel.dataset.activeIndex = String(index);
  renderCustomWorkoutCarousel(carousel);

  if (!instant && !reducedMotion && isVisualDeck && index !== currentIndex && !card.classList.contains("is-entering-deck")) {
    const transitionDirection = Number(options.direction) || (Number(nextIndex) > currentIndex ? 1 : -1);
    const transitionClass = transitionDirection > 0
      ? "is-deck-entering-forward"
      : "is-deck-entering-backward";
    card.classList.remove("is-deck-entering-forward", "is-deck-entering-backward");
    void card.offsetWidth;
    const animationToken = String(++customWorkoutDeckAnimationSequence);
    card.dataset.deckAnimationToken = animationToken;
    card.classList.add(transitionClass);
    const finishEntry = () => {
      card.removeEventListener("animationend", finishEntry);
      if (card.dataset.deckAnimationToken !== animationToken) return;
      card.classList.remove(transitionClass);
      delete card.dataset.deckAnimationToken;
    };
    card.addEventListener("animationend", finishEntry, { once: true });
    window.setTimeout(finishEntry, 520);
  }

  // Direct assignment works consistently in iOS/Android webviews and avoids a
  // smooth-scroll race where the scroll listener could restore the old slide.
  list.scrollLeft = targetLeft;
}

async function logCurrentWorkoutCarouselSet(button) {
  const carousel = button?.closest("[data-custom-workout-carousel]");
  const cards = customWorkoutCarouselCards(carousel);
  const panel = carousel?.closest(".client-workout-panel-custom, .client-workout-panel-assigned");
  const format = normalizeCustomWorkoutFormat(
    carousel?.dataset.customWorkoutFormat ||
    panel?.dataset.customWorkoutFormat ||
    panel?.dataset.assignedWorkoutFormat ||
    activeCustomWorkoutFormat
  );
  const groupIndex = Number(carousel?.dataset.customWorkoutGroup) || 0;
  const progress = workoutCarouselProgress(carousel, cards, format, groupIndex);
  const current = progress.current;
  const logElement = current?.exercise?.logElement;
  const status = logElement?.querySelector("[data-log-status]");

  if (!carousel || !current || !logElement) return;

  if (filledSetCount(logElement) < current.round) {
    if (status) {
      status.textContent = `Enter weight or reps for ${current.exercise.code}, set ${current.round}, before logging it.`;
    }
    const workingRows = Array.from(logElement.querySelectorAll("[data-set-row]"))
      .filter((row) => setTypeForRow(row) !== warmUpSetType);
    workingRows[Math.max(current.round - 1, 0)]
      ?.querySelector("[data-set-weight], [data-set-reps]")
      ?.focus();
    return;
  }

  setWorkoutCarouselAutosaveState(logElement, "saving");
  const result = await saveTrainingLogRows(button, [logElement], status, {
    savingMessage: "Logging set...",
    successMessage: "Set logged and autosaved."
  });

  if (!result.saved) {
    setWorkoutCarouselAutosaveState(logElement, "issue");
    return;
  }

  logElement.dataset.groupLoggedSets = String(Math.max(current.exercise.completed, current.round));
  setWorkoutCarouselAutosaveState(logElement, "saved");
  const nextProgress = workoutCarouselProgress(carousel, cards, format, groupIndex);
  const completedRound = current.index === cards.length - 1 &&
    (nextProgress.isComplete || (nextProgress.current?.round || current.round) > current.round);

  if (completedRound && !nextProgress.isComplete) {
    const restValue = current.exercise.logElement?.dataset.exerciseRest || "";
    setRestTimerDuration(workoutCarouselRestSeconds(restValue));
    openRestTimer(button);
    startOrPauseRestTimer();
  }

  if (nextProgress.current) {
    moveCustomWorkoutCarousel(carousel, nextProgress.current.index, { direction: 1 });
  } else {
    renderCustomWorkoutCarousel(carousel);
  }
}

function bindCustomWorkoutCarousel(carousel) {
  const list = carousel?.querySelector("[data-custom-workout-list]");

  if (!carousel || !list || carousel.dataset.carouselBound === "true") {
    return;
  }

  if (carousel.dataset.customWorkoutGrouped === "true") {
    carousel.dataset.carouselBound = "true";
    return;
  }

  carousel.dataset.carouselBound = "true";
  let frame = 0;
  let dragFrame = 0;
  let settleTimer = 0;
  let settleSequence = 0;
  let touchSwipe = null;
  carousel.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const previous = target?.closest("[data-custom-workout-carousel-previous]");
    const next = target?.closest("[data-custom-workout-carousel-next]");
    const dot = target?.closest("[data-custom-workout-carousel-dot]");
    const groupNextCard = target?.closest("[data-workout-group-next-card]");

    if (!previous && !next && !dot && !groupNextCard) return;
    event.preventDefault();
    event.stopPropagation();
    if (list.classList.contains("is-deck-settling")) return;

    const current = Number(carousel.dataset.activeIndex) || 0;
    const previewIndex = Number(groupNextCard?.dataset.workoutGroupNextIndex);
    if (groupNextCard && (groupNextCard.hasAttribute("disabled") || !Number.isInteger(previewIndex) || previewIndex < 0)) return;
    const nextIndex = groupNextCard
      ? previewIndex
      : dot
        ? Number(dot.dataset.customWorkoutCarouselDot)
        : current + (next ? 1 : -1);
    const direction = groupNextCard ? 1 : dot ? Math.sign(nextIndex - current) : (next ? 1 : -1);
    moveCustomWorkoutCarousel(carousel, nextIndex, { direction });
  });

  list.addEventListener("scroll", () => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      if (
        carousel.dataset.carouselEnabled !== "true" ||
        carousel.dataset.customWorkoutDeck === "true" ||
        list.classList.contains("is-touch-swiping")
      ) return;
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
    if (event.touches.length !== 1) {
      if (touchSwipe) {
        touchSwipe = null;
        settleSequence += 1;
        window.cancelAnimationFrame(dragFrame);
        window.clearTimeout(settleTimer);
        clearCustomWorkoutDeckDrag(list);
      }
      return;
    }

    if (
      carousel.dataset.carouselEnabled !== "true" ||
      list.classList.contains("is-deck-settling") ||
      event.target.closest("input, select, textarea, button, a")
    ) {
      touchSwipe = null;
      return;
    }

    const touch = event.touches[0];
    const activeCard = customWorkoutCarouselCards(carousel)[Number(carousel.dataset.activeIndex) || 0];
    activeCard?.classList.remove(
      "is-entering-deck",
      "is-deck-entering-forward",
      "is-deck-entering-backward"
    );
    if (activeCard) delete activeCard.dataset.deckAnimationToken;
    touchSwipe = {
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      startScrollLeft: list.scrollLeft,
      startIndex: Number(carousel.dataset.activeIndex) || 0,
      visualDeck: carousel.dataset.customWorkoutDeck === "true",
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
    if (!touchSwipe.visualDeck) {
      list.scrollLeft = touchSwipe.startScrollLeft - deltaX;
      return;
    }

    const cards = customWorkoutCarouselCards(carousel);
    const currentIndex = touchSwipe.startIndex;
    const wrapsGroupDeck = carousel.dataset.groupWorkoutDeck === "true";
    const canAddExercise = carousel.dataset.customWorkoutCanAddExercise === "true";
    const blockedAtStart = deltaX > 0 && currentIndex === 0 && !wrapsGroupDeck;
    const blockedAtEnd = deltaX < 0 && currentIndex === cards.length - 1 && !wrapsGroupDeck && !canAddExercise;
    const resistedDeltaX = blockedAtStart || blockedAtEnd ? deltaX * .28 : deltaX;
    const reducedMotion = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    if (reducedMotion) return;
    window.cancelAnimationFrame(dragFrame);
    dragFrame = window.requestAnimationFrame(() => {
      applyCustomWorkoutDeckDrag(list, resistedDeltaX);
    });
  }, { passive: false });

  const finishTouchSwipe = (cancelled = false) => {
    if (!touchSwipe) return;

    const deltaX = touchSwipe.lastX - touchSwipe.startX;
    const threshold = Math.min(54, list.clientWidth * .14);
    const wasHorizontal = touchSwipe.direction === "horizontal";
    const startIndex = touchSwipe.startIndex;
    const visualDeck = touchSwipe.visualDeck;
    touchSwipe = null;
    window.cancelAnimationFrame(dragFrame);

    if (!wasHorizontal) return;
    let direction = !cancelled && Math.abs(deltaX) >= threshold ? (deltaX < 0 ? 1 : -1) : 0;
    if (!visualDeck) {
      list.classList.remove("is-touch-swiping");
      moveCustomWorkoutCarousel(carousel, startIndex + direction);
      return;
    }

    if (direction) {
      const cards = customWorkoutCarouselCards(carousel);
      const decision = customWorkoutCarouselNavigationDecision(
        startIndex + direction,
        cards.length,
        carousel.dataset.customWorkoutCanAddExercise === "true",
        carousel.dataset.groupWorkoutDeck === "true"
      );
      if (decision.action === "move" && decision.index === startIndex) {
        direction = 0;
      }
    }

    const reducedMotion = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
    window.clearTimeout(settleTimer);
    const settleToken = ++settleSequence;
    list.classList.remove("is-touch-swiping");
    list.classList.add("is-deck-settling");

    if (!direction || reducedMotion) {
      applyCustomWorkoutDeckDrag(list, 0);
      if (direction) {
        clearCustomWorkoutDeckDrag(list);
        moveCustomWorkoutCarousel(carousel, startIndex + direction, {
          direction,
          instant: reducedMotion
        });
        return;
      }
      settleTimer = window.setTimeout(() => {
        if (settleToken === settleSequence) clearCustomWorkoutDeckDrag(list);
      }, reducedMotion ? 0 : 190);
      return;
    }

    const activeCard = customWorkoutCarouselCards(carousel)[startIndex];
    let exitFinished = false;
    const finishExit = (event) => {
      if (event && (event.target !== activeCard || event.propertyName !== "transform")) return;
      activeCard?.removeEventListener("transitionend", finishExit);
      if (exitFinished || settleToken !== settleSequence) return;
      exitFinished = true;
      window.clearTimeout(settleTimer);
      clearCustomWorkoutDeckDrag(list);
      moveCustomWorkoutCarousel(carousel, startIndex + direction, { direction });
    };
    activeCard?.addEventListener("transitionend", finishExit);
    applyCustomWorkoutDeckExit(list, direction);
    settleTimer = window.setTimeout(finishExit, 240);
  };

  list.addEventListener("touchend", () => finishTouchSwipe(), { passive: true });
  list.addEventListener("touchcancel", () => finishTouchSwipe(true), { passive: true });

  list.addEventListener("keydown", (event) => {
    if (event.target.closest("input, select, textarea, button")) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    if (list.classList.contains("is-deck-settling")) return;
    const direction = event.key === "ArrowRight" ? 1 : -1;
    moveCustomWorkoutCarousel(carousel, (Number(carousel.dataset.activeIndex) || 0) + direction, { direction });
  });
}

function regroupCustomWorkoutCarousels(panel) {
  const stack = panel?.querySelector("[data-custom-workout-carousel-stack]");
  const format = normalizeCustomWorkoutFormat(panel?.dataset.customWorkoutFormat || activeCustomWorkoutFormat);
  const workoutTitle = String(panel?.dataset.customWorkoutTitle || customWorkoutTitle);
  const cards = Array.from(stack?.querySelectorAll("[data-custom-exercise-card]") || []);
  let desiredGroups;

  if (format === "superset") {
    const hasExplicitGroups = cards.some((card) => Math.max(Number(card.dataset.customWorkoutGroup) || 0, 0) > 0);

    if (hasExplicitGroups) {
      const supersetGroups = new Map();
      cards.forEach((card) => {
        const groupIndex = Math.max(Number(card.dataset.customWorkoutGroup) || 0, 0);
        if (!supersetGroups.has(groupIndex)) {
          supersetGroups.set(groupIndex, { index: groupIndex, cards: [] });
        }
        supersetGroups.get(groupIndex).cards.push(card);
      });
      desiredGroups = Array.from(supersetGroups.values()).map((group, index) => {
        group.cards.forEach((card) => {
          card.dataset.customWorkoutGroup = String(index);
        });
        return { index, format, cards: group.cards };
      });
    } else {
      desiredGroups = Array.from({ length: Math.max(Math.ceil(cards.length / 2), 1) }, (_, index) => ({
        index,
        format,
        cards: cards.slice(index * 2, (index * 2) + 2)
      }));
    }
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
      return { index, format, cards: group.cards };
    });
    if (desiredGroups.length === 0) desiredGroups = [{ index: 0, format, cards: [] }];
  } else {
    desiredGroups = customWorkoutMixedGroups(cards.map((card) => ({
      card,
      group: Math.max(Number(card.dataset.customWorkoutGroup) || 0, 0),
      groupType: normalizeCustomWorkoutInlineGroupType(card.dataset.customWorkoutGroupType)
    }))).map((group) => {
      const groupedCards = group.items.map((item) => item.card);

      groupedCards.forEach((card) => {
        card.dataset.customWorkoutGroupType = group.format;
        if (group.format === "single") card.dataset.customWorkoutGroup = "0";
      });

      return {
        index: group.index,
        format: group.format,
        cards: groupedCards
      };
    });
  }
  const existing = customWorkoutCarousels(panel);
  const hasExpectedNewExerciseCards = existing.every(carousel => !carousel.querySelector("[data-custom-workout-new-exercise]"));
  const hasExpectedSessionControls = existing.every((carousel, index) => (
    Boolean(carousel.querySelector("[data-custom-grouped-finish-workout]")) === (
      desiredGroups[index]?.format !== "single" && index === desiredGroups.length - 1
    )
  ));
  const alreadyGrouped = hasExpectedNewExerciseCards && hasExpectedSessionControls && existing.length === desiredGroups.length && desiredGroups.every((group, groupIndex) => {
    const currentCards = customWorkoutCarouselCards(existing[groupIndex]);
    return existing[groupIndex].dataset.customWorkoutFormat === group.format &&
      Number(existing[groupIndex].dataset.customWorkoutGroup) === group.index &&
      currentCards.length === group.cards.length && currentCards.every((card, index) => card === group.cards[index]);
  });

  if (!stack || alreadyGrouped) {
    existing.forEach((carousel, index) => {
      const groupFormat = desiredGroups[index]?.format || format;
      carousel.dataset.customWorkoutFormat = groupFormat;
      carousel.dataset.customWorkoutGroup = String(desiredGroups[index]?.index ?? index);
      carousel.dataset.customWorkoutInlineAdd = String(groupFormat === "single" && index === desiredGroups.length - 1);
      const list = carousel.querySelector("[data-custom-workout-list]");
      if (list) list.dataset.customWorkoutFormat = groupFormat;
    });
    return;
  }

  const fragment = document.createDocumentFragment();
  desiredGroups.forEach((group, index) => {
    const template = document.createElement("template");
    template.innerHTML = customWorkoutCarouselGroupMarkup(
      group.format,
      [],
      group.index,
      0,
      workoutTitle,
      {
        panelFormat: format,
        canAddExercise: group.format === "single" && index === desiredGroups.length - 1,
        isLastGroup: index === desiredGroups.length - 1
      }
    );
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
    if (focusCarousel.dataset.customWorkoutGrouped === "true") {
      focusCarousel.querySelector(`[data-custom-workout-group-name-input="${Math.max(focusIndex, 0)}"]`)?.focus();
    }
  } else if (options.scrollToActive) {
    carousels.forEach((carousel) => {
      moveCustomWorkoutCarousel(carousel, Number(carousel.dataset.activeIndex) || 0, { instant: options.instant });
    });
  }

  syncCustomWorkoutFormatMarkers(panel);
}

function syncCustomWorkoutCarousels() {
  document.querySelectorAll(".client-workout-panel-custom").forEach((panel) => syncCustomWorkoutCarousel(panel));
  if (!syncCustomWorkoutCarousels.resizeBound) {
    syncCustomWorkoutCarousels.resizeBound = true;
    let viewportWidth = window.innerWidth;
    window.addEventListener("resize", () => {
      // Mobile keyboards and browser toolbars change height. Rebuilding here
      // removes the focused input and interrupts typing.
      if (window.innerWidth === viewportWidth) return;
      viewportWidth = window.innerWidth;

      // Grouped cards resize through CSS and must retain their live inputs.
      // Only the older swipe decks need to recalculate viewport navigation.
      document.querySelectorAll('[data-custom-workout-carousel]:not([data-custom-workout-grouped="true"])').forEach((carousel) => {
        renderCustomWorkoutCarousel(carousel);
        moveCustomWorkoutCarousel(carousel, Number(carousel.dataset.activeIndex) || 0, { instant: true });
      });
    });
  }
}

function syncAssignedWorkoutCarousels(panel = null) {
  const panels = panel ? [panel] : Array.from(document.querySelectorAll(".client-workout-panel-assigned"));

  panels.forEach((assignedPanel) => {
    assignedPanel.querySelectorAll("[data-assigned-workout-carousel]").forEach((carousel) => {
      bindCustomWorkoutCarousel(carousel);
      renderCustomWorkoutCarousel(carousel);
    });
  });
}

function customWorkoutPanelMarkup(index) {
  const activeDraft = activeCustomWorkoutDraft();
  const format = normalizeCustomWorkoutFormat(activeCustomWorkoutFormat);
  const exercises = customWorkoutExercises(format);
  const formatConfig = customWorkoutFormats[format];
  const copyStatusMessage = customWorkoutCopyStatusMessage(activeDraft);
  const workoutStorageTitle = customWorkoutStorageTitle(activeDraft);

  return `
    <section
      class="client-workout-panel client-workout-panel-custom"
      id="client-workout-panel-${index}"
      data-custom-workout-format="${format}"
      data-custom-workout-title="${escapeHtml(workoutStorageTitle)}"
      role="region"
      aria-labelledby="client-workout-card-title-${index}"
      hidden
    >
      <div class="panel-heading">
        <div>
          <h2 id="custom-workout-panel-title" tabindex="-1">${escapeHtml(customWorkoutTitle)}</h2>
        </div>
        <span class="status-pill">Build your own</span>
      </div>
      <p class="custom-workout-copy-status" data-custom-workout-copy-status role="status" aria-live="polite" ${copyStatusMessage ? "" : "hidden"}>${escapeHtml(copyStatusMessage)}</p>
      <label class="custom-workout-session-date workout-session-date">
        <span>Workout date</span>
        <span class="workout-session-date-control">
          <span class="workout-session-date-value" data-workout-date-value aria-hidden="true">${escapeHtml(formatLogDate(todayDate()))}</span>
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
        ${warmupLogFields(workoutStorageTitle, { showDate: false })}
        <div data-custom-workout-start-control ${format === "single" ? "" : "hidden"}>
          ${workoutStartControlMarkup(workoutStorageTitle)}
        </div>
        <div class="custom-workout-reset-control">
          <button class="button button-ghost custom-workout-reset-button" type="button" data-reset-custom-workout>Reset workout</button>
        </div>
        <p class="custom-workout-reset-status" data-custom-workout-reset-status role="status" aria-live="polite" hidden></p>
        ${customWorkoutCarouselMarkup(format, workoutStorageTitle)}
        <div class="custom-workout-add-actions" data-custom-workout-add-actions>
          <button class="button button-ghost custom-workout-add-bottom" type="button" data-add-custom-exercise data-custom-exercise-placement="current">${format === "single" ? "Add exercise" : format === "superset" ? "Add superset" : "Add circuit"}</button>
        </div>
        ${cardioLogFields(workoutStorageTitle, { showDate: false })}
        <div data-custom-workout-default-finish ${format === "single" ? "" : "hidden"}>
          ${workoutActionsMarkup({ exercises }, { includeCardio: true })}
        </div>
      </div>
    </section>
  `;
}

function replaceCustomWorkoutPanelFromDraft(index) {
  const currentPanel = document.querySelector(".client-workout-panel-custom");

  if (!currentPanel) {
    return null;
  }

  const template = document.createElement("template");
  template.innerHTML = customWorkoutPanelMarkup(index).trim();
  const replacement = template.content.firstElementChild;

  if (!replacement) {
    return null;
  }

  currentPanel.replaceWith(replacement);
  applyCustomWorkoutDraft(replacement);
  syncWorkoutStartButtons();

  return replacement;
}

function resetCustomWorkout(panel) {
  if (
    !panel ||
    !window.confirm(
      "Reset this Custom Workout and create a new one? Unsaved exercise names, sets, notes, warm-up, and cardio entries will be cleared. Saved workout history will not be deleted."
    )
  ) {
    return null;
  }

  const workoutPanels = Array.from(document.querySelectorAll(".client-workout-panel"));
  const panelIndex = Math.max(workoutPanels.indexOf(panel), 0);
  const currentWorkoutTitle = String(panel.dataset.customWorkoutTitle || customWorkoutTitle).trim();
  const endsCurrentTimer = Boolean(
    workoutElapsedTimerState &&
    currentWorkoutTitle === String(workoutElapsedTimerState.workoutTitle || "").trim()
  );

  cancelTrainingLogAutosaves(panel);
  closeCustomExerciseSuggestions();
  closeRirDialog();
  closeRestTimer();
  resetRestTimer();

  if (endsCurrentTimer) {
    finishWorkoutElapsedTimer();
  }

  clearCustomWorkoutDraft();
  activeCustomWorkoutFormat = "single";
  storeCustomWorkoutFormat("single");
  storeCustomWorkoutDraft(freshCustomWorkoutDraft());

  const replacement = replaceCustomWorkoutPanelFromDraft(panelIndex);

  if (!replacement) {
    return null;
  }

  replacement.querySelectorAll("[data-exercise-log]").forEach(updateExerciseLogField);
  activateClientWorkoutPanel(panelIndex, { scroll: false, focus: false });

  const status = replacement.querySelector("[data-custom-workout-reset-status]");
  if (status) {
    status.textContent = "New custom workout ready.";
    status.hidden = false;
  }

  window.requestAnimationFrame(() => {
    replacement.querySelector("#custom-workout-panel-title")?.focus({ preventScroll: true });
  });

  return replacement;
}

function syncWorkoutPanelDate(panel, value, refresh = true) {
  const date = value || todayDate();
  const picker = panel?.querySelector("[data-workout-date]");
  const display = panel?.querySelector("[data-workout-date-value]");
  const carouselsToRefresh = new Set();

  if (picker && picker.value !== date) {
    picker.value = date;
  }
  if (display) {
    display.textContent = formatLogDate(date);
  }

  panel?.querySelectorAll("[data-exercise-log] [data-log-date]").forEach((input) => {
    const logElement = input.closest("[data-exercise-log]");
    input.value = date;
    if (refresh && logElement) {
      updateExerciseLogField(logElement);
      const carousel = logElement.closest("[data-custom-workout-carousel]");
      if (carousel) {
        logElement.dataset.groupLoggedSets = String(filledSetCount(logElement));
        carouselsToRefresh.add(carousel);
      }
    }
  });

  carouselsToRefresh.forEach((carousel) => renderCustomWorkoutCarousel(carousel));
}

function syncCustomWorkoutFormatMarkers(panel) {
  const panelFormat = normalizeCustomWorkoutFormat(panel?.dataset.customWorkoutFormat || activeCustomWorkoutFormat);
  const circuitPositions = new Map();

  panel?.querySelectorAll("[data-custom-exercise-card]").forEach((card, index) => {
    const marker = card.querySelector("[data-custom-workout-format-marker]");
    const carousel = card.closest("[data-custom-workout-carousel]");
    const format = panelFormat === "single"
      ? normalizeCustomWorkoutInlineGroupType(
        card.dataset.customWorkoutGroupType || carousel?.dataset.customWorkoutFormat
      )
      : panelFormat;
    const groupIndex = Math.max(Number(carousel?.dataset.customWorkoutGroup ?? card.dataset.customWorkoutGroup) || 0, 0);
    const groupPosition = Math.max(customWorkoutCarouselCards(carousel).indexOf(card), 0);
    const circuitPosition = (circuitPositions.get(groupIndex) || 0) + 1;
    circuitPositions.set(groupIndex, circuitPosition);

    if (marker) {
      marker.textContent = format === "circuit"
        ? `Station ${circuitPosition}`
        : format === "superset"
          ? `Superset ${groupIndex + 1}${String.fromCharCode(65 + groupPosition)}`
          : customWorkoutFormatMarker(format, index);
    }

    const finishButton = card.querySelector("[data-finish-set]");
    const setActions = finishButton?.closest(".set-table-actions");
    const addsSupersetExercise = format === "superset" && groupPosition === 0;
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

    const inlineOptions = card.querySelector("[data-custom-workout-inline-group-options]");
    if (inlineOptions) {
      inlineOptions.hidden = panelFormat !== "single";
      inlineOptions.querySelectorAll("[data-custom-workout-inline-group-option]").forEach((input) => {
        input.checked = input.dataset.customWorkoutInlineGroupOption === format && format !== "single";
      });
    }
    card.dataset.customWorkoutGroupType = format;

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

  let currentCards = Array.from(panel.querySelectorAll("[data-custom-exercise-card]"));
  if (format !== previousFormat) {
    currentCards.forEach((card) => {
      card.dataset.customWorkoutGroup = "0";
      card.dataset.customWorkoutGroupType = "single";
    });
  }

  if (
    format !== previousFormat &&
    !options.skipDraft &&
    !customWorkoutPanelHasEnteredExerciseContent(panel)
  ) {
    currentCards = setUntouchedCustomWorkoutDefaultExercises(panel, format, currentCards);
  }

  if (format === "single" && previousFormat !== "single" && !options.skipDraft) {
    const panels = Array.from(document.querySelectorAll(".client-workout-panel"));
    const panelIndex = Math.max(panels.indexOf(panel), 0);
    const wasActive = panel.classList.contains("is-active") && !panel.hidden;
    const wasHidden = panel.hidden;

    persistCustomWorkoutDraftFromPanel(panel);
    const replacement = replaceCustomWorkoutPanelFromDraft(panelIndex);
    if (replacement && wasActive && document.getElementById("client-workout-tabs")) {
      activateClientWorkoutPanel(panelIndex, { focus: false, scroll: false });
    } else if (replacement) {
      replacement.hidden = wasHidden;
      replacement.classList.toggle("is-active", wasActive);
    }
    replacement?.querySelector('[data-custom-workout-format-option="single"]')?.focus();
    return;
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

  const addCurrentButton = panel.querySelector('[data-custom-workout-add-actions] [data-add-custom-exercise][data-custom-exercise-placement="current"]');
  if (addCurrentButton) {
    addCurrentButton.textContent = format === "single" ? "Add exercise" : format === "superset" ? "Add superset" : "Add circuit";
  }
  const defaultFinish = panel.querySelector("[data-custom-workout-default-finish]");
  if (defaultFinish) {
    defaultFinish.hidden = format !== "single";
  }
  const workoutStartControl = panel.querySelector("[data-custom-workout-start-control]");
  if (workoutStartControl) {
    workoutStartControl.hidden = format !== "single";
  }

  syncCustomWorkoutFormatMarkers(panel);
  syncCustomWorkoutCarousel(panel, { activeIndex: 0, scrollToActive: true, instant: true });
  if (!options.skipDraft) {
    persistCustomWorkoutDraftFromPanel(panel);
  }
}

function clientWorkoutSelectorDetails(workout, label) {
  const rawTitle = String(workout?.title || label || "Workout").trim();
  const focus = String(workout?.focus || "").trim();

  if (workout?.isCustom) {
    return {
      label: "Custom",
      day: "Build your own",
      target: customWorkoutTitle,
      tabLabel: "Custom",
      tabCaption: "Build your own"
    };
  }

  const titleMatch = rawTitle.match(/^(.+?)\s*[—–]\s*(.+)$/) || rawTitle.match(/^(.+?)\s+-\s+(.+)$/);
  const dayFromTitle = titleMatch?.[1]?.trim() || "";
  const targetFromTitle = titleMatch?.[2]?.trim() || "";
  const day = dayFromTitle || (focus && focus.toLowerCase() !== rawTitle.toLowerCase() ? rawTitle : "");
  const target = targetFromTitle || focus || rawTitle;

  return {
    label,
    day,
    target,
    tabLabel: String(Number.parseInt(label.replace(/\D/g, ""), 10) || 1).padStart(2, "0"),
    tabCaption: day || target
  };
}

function clientWorkoutPickerItems(workouts = []) {
  const scheduledWorkouts = Array.isArray(workouts) ? workouts : [];
  const assignedItems = scheduledWorkouts.map((workout, assignedWorkoutIndex) => ({
    ...workout,
    assignedWorkoutIndex,
    panelIndex: assignedWorkoutIndex + 1,
    pickerLabel: `Workout ${assignedWorkoutIndex + 1}`,
    isCustom: false
  }));

  return [
    {
      title: customWorkoutTitle,
      focus: "Build your own",
      format: "custom",
      isCustom: true,
      assignedWorkoutIndex: -1,
      panelIndex: 0,
      pickerLabel: "Custom"
    },
    ...assignedItems
  ];
}

function clientWorkoutPickerIndex(index, count) {
  const total = Math.max(0, Number(count) || 0);

  if (total === 0) {
    return 0;
  }

  return ((Number(index) || 0) % total + total) % total;
}

function clientWorkoutPickerSwipeStep(deltaX, deltaY, width = 0) {
  const horizontalDistance = Math.abs(Number(deltaX) || 0);
  const verticalDistance = Math.abs(Number(deltaY) || 0);
  const threshold = Math.max(44, Math.min(68, (Number(width) || 0) * .14));

  if (horizontalDistance < threshold || horizontalDistance <= verticalDistance * 1.15) {
    return 0;
  }

  return Number(deltaX) < 0 ? 1 : -1;
}

function applyPhysicalDeckDrag(deck, deltaX, width = 0) {
  if (!deck || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    return;
  }

  const safeWidth = Math.max(Number(width) || deck.getBoundingClientRect().width || 1, 1);
  const boundedX = Math.max(-safeWidth * .34, Math.min(safeWidth * .34, Number(deltaX) || 0));
  const progress = Math.min(Math.abs(boundedX) / safeWidth, 1);

  deck.classList.add("is-dragging");
  deck.style.setProperty("--deck-drag-x", `${boundedX}px`);
  deck.style.setProperty("--deck-drag-rotate", `${boundedX / safeWidth * 7}deg`);
  deck.style.setProperty("--deck-drag-scale", String(1 - progress * .025));
  deck.style.setProperty("--deck-drag-opacity", String(1 - progress * .18));
}

function releasePhysicalDeckDrag(deck) {
  if (!deck) {
    return;
  }

  deck.classList.remove("is-dragging");
  deck.style.removeProperty("--deck-drag-x");
  deck.style.removeProperty("--deck-drag-rotate");
  deck.style.removeProperty("--deck-drag-scale");
  deck.style.removeProperty("--deck-drag-opacity");
}

function animatePhysicalDeckChange(deck, direction, change) {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  if (!deck || reducedMotion || !direction) {
    change();
    return;
  }

  const className = direction > 0 ? "is-moving-forward" : "is-moving-backward";

  deck.classList.remove("is-moving-forward", "is-moving-backward");
  deck.classList.add(className);
  void deck.offsetWidth;
  change();
  window.setTimeout(() => deck.classList.remove(className), 540);
}

function clientWorkoutPickerSummary(workout, details) {
  const providedSummary = String(
    workout?.description ||
    workout?.summary ||
    workout?.notes ||
    ""
  ).trim();

  if (providedSummary) {
    return truncateText(providedSummary, 150);
  }

  if (workout?.isCustom) {
    return "Choose exercises from the library, add your sets, and log a workout outside your assigned program.";
  }

  const format = inferWorkoutFormat(workout);
  const formatDescription = format === "single"
    ? "straight-set"
    : formatLabel(format).toLowerCase();
  const target = String(details?.target || workout?.focus || "your training goals").trim();

  return `A ${formatDescription} session focused on ${target}. Review the exercises, then open the workout to start logging.`;
}

function clientWorkoutPickerPreviewMarkup(workout) {
  if (workout?.isCustom) {
    return [
      "Choose from the exercise library",
      "Add warm-up and working sets",
      "Track weight, reps, and RIR"
    ].map((item, index) => `
      <li><span>${index + 1}</span><strong>${escapeHtml(item)}</strong></li>
    `).join("");
  }

  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];

  if (exercises.length === 0) {
    return '<li class="is-empty"><strong>Your coach is building this workout.</strong></li>';
  }

  return exercises.slice(0, 3).map((exercise, index) => {
    const remaining = index === 2 && exercises.length > 3 ? ` + ${exercises.length - 3} more` : "";
    const name = `${String(exercise?.name || `Exercise ${index + 1}`).trim()}${remaining}`;

    return `
      <li><span>${index + 1}</span><strong>${escapeHtml(name)}</strong></li>
    `;
  }).join("");
}

function clientWorkoutPickerCardMarkup(workout, index, total) {
  const details = clientWorkoutSelectorDetails(workout, workout.pickerLabel);
  const insights = workout.isCustom
    ? { exerciseCount: 0, estimatedSets: 0, format: "Custom" }
    : workoutInsightData(workout);
  const badge = workout.isCustom
    ? "Custom workout"
    : [details.label, details.day].filter(Boolean).join(" · ");
  const title = workout.isCustom ? "Build your own workout" : details.target;
  const facts = workout.isCustom
    ? [
      { value: "Any", label: "Exercises" },
      { value: "You choose", label: "Format" },
      { value: "Flexible", label: "Plan" }
    ]
    : [
      { value: String(insights.exerciseCount || 0), label: "Exercises" },
      { value: String(insights.estimatedSets || 0), label: "Planned sets" },
      { value: insights.format || formatLabel(inferWorkoutFormat(workout)), label: "Format" }
    ];

  return `
    <article
      class="client-workout-picker-card"
      id="client-workout-card-${index}"
      data-client-workout-picker-card="${index}"
      data-client-workout-selection-label="${escapeHtml(details.label)}"
      data-client-workout-selection-day="${escapeHtml(details.day)}"
      data-client-workout-selection-target="${escapeHtml(details.target)}"
      role="group"
      aria-roledescription="slide"
      aria-label="${escapeHtml(`${details.label}: ${title}. Workout ${index + 1} of ${total}`)}"
    >
      <div class="client-workout-picker-card-top">
        <div class="client-workout-picker-card-meta">
          <span class="client-workout-picker-badge">${escapeHtml(badge)}</span>
          ${workout.isCustom ? `
            <button
              class="client-workout-picker-copy-link"
              type="button"
              data-client-workout-copy-history
              aria-label="Copy a previous workout to Custom Workout"
            >Copy previous</button>
          ` : ""}
        </div>
        <h3 id="client-workout-card-title-${index}">${escapeHtml(title)}</h3>
      </div>
      <div class="client-workout-picker-card-body">
        <p class="client-workout-picker-description">${escapeHtml(clientWorkoutPickerSummary(workout, details))}</p>
        <dl class="client-workout-picker-facts">
          ${facts.map((fact) => `
            <div><dt>${escapeHtml(fact.label)}</dt><dd>${escapeHtml(fact.value)}</dd></div>
          `).join("")}
        </dl>
        <ol class="client-workout-picker-preview" aria-label="Exercise preview">
          ${clientWorkoutPickerPreviewMarkup(workout)}
        </ol>
        <button
          class="client-workout-picker-choose"
          type="button"
          data-client-workout-picker-choose="${index}"
        >${workout.isCustom ? "Start custom workout" : "Choose workout"}</button>
      </div>
    </article>
  `;
}

function clientWorkoutPickerMarkup(workouts) {
  const total = workouts.length;

  return `
    <div class="client-workout-picker-status">
      <strong data-client-workout-picker-position aria-live="polite" aria-atomic="true">Workout 1 of ${total}</strong>
      <div class="client-workout-picker-controls" aria-label="Workout carousel controls">
        <button class="client-workout-picker-arrow" type="button" data-client-workout-picker-previous aria-label="Previous workout">←</button>
        <div class="client-workout-picker-dots" aria-label="Choose a workout">
          ${workouts.map((workout, index) => `
            <button
              class="client-workout-picker-dot"
              type="button"
              data-client-workout-picker-dot="${index}"
              aria-label="${escapeHtml(`Show ${workout.isCustom ? "custom workout" : String(workout.pickerLabel || "workout").toLowerCase()}`)}"
            ></button>
          `).join("")}
        </div>
        <button class="client-workout-picker-arrow" type="button" data-client-workout-picker-next aria-label="Next workout">→</button>
      </div>
    </div>
    <div
      class="client-workout-picker-deck"
      data-client-workout-picker-deck
      role="region"
      aria-roledescription="carousel"
      aria-label="Workout choices. Swipe left or right, or use the arrow buttons."
      tabindex="0"
    >
      ${workouts.map((workout, index) => clientWorkoutPickerCardMarkup(workout, index, total)).join("")}
    </div>
  `;
}

function clientWorkoutListMarkup(workouts) {
  if (!clientPreviewProgramSelected) {
    const programs = clientAvailablePrograms.length ? clientAvailablePrograms : [currentProgram];
    return `<div class="workout-program-picker"><h3>Select a program</h3>${programs.map((program, index) => `
      <button type="button" class="workout-program-choice" data-preview-program="${index}">
        <strong>${escapeHtml(program.program_title || "Your program")}</strong>
        <span>${(program.workouts || []).length} workouts <span aria-hidden="true">→</span></span>
      </button>`).join("")}
      <button type="button" class="button button-dark workout-preview-start"
        data-client-workout-picker-choose="0" data-client-workout-picker-card="0"
        data-client-workout-selection-target="Custom workout">
        <span aria-hidden="true">+&nbsp;</span><span id="client-workout-card-title-0">Build custom workout</span>
      </button>
    </div>`;
  }
  const assigned = workouts.filter(workout => !workout.isCustom);
  const locked = clientWorkoutLayoutSaving || Boolean(workoutElapsedTimerState);
  return `<div class="workout-preview-heading">
    <button type="button" class="workout-text-button" data-preview-programs>← Programs</button>
    <h3>${escapeHtml(currentProgram?.program_title || "Your workouts")}</h3>
    <p>Drag exercises to reorder them. Use each exercise’s menu to edit, substitute, or delete.</p>
    ${workoutElapsedTimerState ? '<p>Finish or cancel your current workout before editing exercises.</p>' : ""}
    <p data-workout-layout-status role="status" aria-live="polite"></p>
  </div><div class="workout-preview-list">${assigned.map((workout, position) => {
    const index = workout.panelIndex;
    const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];
    return `<article class="workout-preview-card" data-preview-position="${position}" data-client-workout-picker-card="${index}"
      data-client-workout-selection-day="Workout ${position + 1}" data-client-workout-selection-target="${escapeHtml(workout.title || "Workout")}">
      <div class="workout-preview-card-heading">
        <button type="button" class="workout-preview-toggle" data-preview-toggle="${index}" aria-expanded="${position === 0}" aria-controls="workout-preview-body-${index}">
          <span class="workout-row-number">${String(position + 1).padStart(2, "0")}</span>
          <span><strong id="client-workout-card-title-${index}">${escapeHtml(workout.title || `Workout ${position + 1}`)}</strong><small>${exercises.length} exercises</small></span>
          <span aria-hidden="true">⌄</span>
        </button>

      </div>
      <div id="workout-preview-body-${index}" class="workout-preview-body" ${position === 0 ? "" : "hidden"}>
        <div class="workout-preview-columns"><span>Exercises</span><span>Sets × reps</span></div>
        <ol class="workout-preview-exercises" data-preview-workout="${position}">${exercises.map((exercise, exerciseIndex) => `<li data-preview-exercise="${exerciseIndex}">
          <button type="button" class="workout-drag" data-exercise-drag ${locked ? "disabled" : ""} aria-label="Reorder ${escapeHtml(exercise.name || "exercise")}. Use up and down arrow keys.">⠿</button>
          <span class="workout-row-number">${exerciseIndex + 1}</span><strong>${escapeHtml(exercise.name || "Exercise")}</strong><span class="workout-prescription">${escapeHtml(WorkoutLayout.label(exercise.prescription))}</span>
          <details class="workout-preview-menu"><summary aria-label="${escapeHtml(exercise.name || "Exercise")} options">•••</summary><div>
            <button type="button" data-exercise-edit ${locked ? "disabled" : ""}>Edit exercise</button>
            <button type="button" data-exercise-substitute ${locked ? "disabled" : ""}>Substitute exercise</button>
            <button type="button" data-exercise-delete ${locked ? "disabled" : ""}>Delete exercise</button>
          </div></details>
        </li>`).join("")}</ol>
        <button type="button" class="button button-dark workout-preview-start" data-preview-start="${index}" ${exercises.length ? "" : "disabled"}>▶ Start workout</button>
      </div>
    </article>`;
  }).join("")}</div>
  ${assigned.length ? "" : '<p>No workouts in this plan. Restore the assigned plan or return to Programs to build a custom workout.</p>'}
  <div class="workout-preview-footer">
    <button type="button" class="workout-text-button" data-client-workout-copy-history>Copy previous</button>
    <button type="button" class="workout-text-button" data-preview-restore ${locked ? "disabled" : ""}>Restore assigned exercises</button>
  </div>`;
}

async function saveClientWorkoutLayout(exercises) {
  if (clientWorkoutLayoutSaving || workoutElapsedTimerState) return false;
  const program = currentProgram;
  const source = program?.assignedWorkouts || [];
  const layout = { version: 2, source: JSON.stringify(source), order: source.map((_, index) => index), exercises };
  const expanded = Array.from(document.querySelectorAll("[data-preview-toggle][aria-expanded=\"true\"]")).map(button => button.dataset.previewToggle);
  const status = document.querySelector("[data-workout-layout-status]");
  if (!program?.id || !supabaseClient) {
    if (status) status.textContent = "This program cannot be saved yet.";
    return false;
  }
  clientWorkoutLayoutSaving = true;
  if (status) status.textContent = "Saving your exercises…";
  document.querySelectorAll("#client-workout-tabs button").forEach(button => { button.disabled = true; });
  try {
    const { data, error } = await supabaseClient.from("client_programs")
      .update({ client_workout_layout: layout }).eq("id", program.id)
      .select("id, client_workout_layout").single();
    if (error || !data) throw error || new Error("No program was saved.");
    program.client_workout_layout = data.client_workout_layout;
    program.workouts = WorkoutLayout.apply(source, data.client_workout_layout);
    clientAvailablePrograms = clientAvailablePrograms.map(item => item.id === program.id ? { ...item, client_workout_layout: data.client_workout_layout } : item);
    clientWorkoutLayoutSaving = false;
    renderClientWorkoutTabs(program.workouts);
    expanded.forEach(index => {
      const toggle = document.querySelector(`[data-preview-toggle="${index}"]`);
      const body = document.getElementById(`workout-preview-body-${index}`);
      if (toggle && body) { toggle.setAttribute("aria-expanded", "true"); body.hidden = false; }
    });
    const savedStatus = document.querySelector("[data-workout-layout-status]");
    if (savedStatus) savedStatus.textContent = "Your exercises are saved.";
    return true;
  } catch (error) {
    clientWorkoutLayoutSaving = false;
    renderClientWorkoutTabs(program.workouts);
    const failedStatus = document.querySelector("[data-workout-layout-status]");
    if (failedStatus) failedStatus.textContent = "Could not save your changes. Your previous plan is still in place. Please try again.";
    return false;
  }
}

function handleClientWorkoutPreview() {
  const picker = document.getElementById("client-workout-tabs");
  if (!picker) return;
  const currentExercises = () => currentProgram.workouts.map(workout => (workout.exercises || []).map(exercise => ({ ...exercise })));
  WorkoutLayout.bindReorder(picker, "[data-preview-exercise]", "[data-exercise-drag]", async (from, to, row) => {
    const position = Number(row.closest("[data-preview-workout]").dataset.previewWorkout);
    const exercises = currentExercises();
    exercises[position].splice(to, 0, exercises[position].splice(from, 1)[0]);
    if (await saveClientWorkoutLayout(exercises)) picker.querySelector(`[data-preview-workout="${position}"]`)?.querySelectorAll("[data-exercise-drag]")[to]?.focus();
  });
  picker.addEventListener("click", async event => {
    if (clientWorkoutLayoutSaving) return;
    const programButton = event.target.closest("[data-preview-program]");
    if (programButton) {
      const program = clientAvailablePrograms[Number(programButton.dataset.previewProgram)];
      if (workoutElapsedTimerState && program && program.id !== currentProgram.id) {
        window.alert("Finish or cancel your current workout before switching programs.");
        return;
      }
      clientPreviewProgramSelected = true;
      if (program) renderProgram(program);
      else renderClientWorkoutTabs(currentProgram.workouts);
      picker.querySelector("[data-preview-toggle]")?.focus();
      return;
    }
    if (event.target.closest("[data-preview-programs]")) {
      clientPreviewProgramSelected = false;
      renderClientWorkoutTabs(currentProgram.workouts);
      return;
    }
    const toggle = event.target.closest("[data-preview-toggle]");
    if (toggle) {
      const body = document.getElementById(toggle.getAttribute("aria-controls"));
      body.hidden = !body.hidden;
      toggle.setAttribute("aria-expanded", String(!body.hidden));
      return;
    }
    const start = event.target.closest("[data-preview-start]");
    if (start) {
      const index = Number(start.dataset.previewStart);
      const panel = document.getElementById(`client-workout-panel-${index}`);
      const title = panel?.querySelector("[data-workout-start]")?.dataset.workoutTitle;
      if (workoutElapsedTimerState && workoutElapsedTimerState.workoutTitle !== title) {
        document.querySelector("[data-workout-layout-status]").textContent = "Finish or cancel your current workout before starting another.";
        return;
      }
      activateClientWorkoutPanel(index);
      if (!workoutElapsedTimerState) panel?.querySelector("[data-workout-start]")?.click();
      else showWorkoutElapsedTimer();
      return;
    }
    if (workoutElapsedTimerState) return;
    if (event.target.closest("[data-preview-restore]") && window.confirm("Restore all exercises assigned by your coach?")) {
      await saveClientWorkoutLayout([]);
      return;
    }
    const action = event.target.closest("[data-exercise-edit], [data-exercise-substitute], [data-exercise-delete]");
    if (!action) return;
    const position = Number(action.closest("[data-preview-workout]").dataset.previewWorkout);
    const index = Number(action.closest("[data-preview-exercise]").dataset.previewExercise);
    const exercises = currentExercises();
    const exercise = exercises[position][index];
    if (action.hasAttribute("data-exercise-delete")) {
      if (window.confirm(`Remove ${exercise.name || "this exercise"} from this workout?`)) {
        exercises[position].splice(index, 1);
        await saveClientWorkoutLayout(exercises);
      }
      return;
    }
    const substituting = action.hasAttribute("data-exercise-substitute");
    const parsed = WorkoutLayout.prescription(exercise.prescription);
    const dialog = document.createElement("dialog");
    dialog.className = "workout-substitute-dialog workout-exercise-editor";
    dialog.setAttribute("aria-labelledby", "exercise-editor-title");
    const names = [...new Set([...exerciseLibraryEntries.map(item => item.name), ...currentProgram.assignedWorkouts.flatMap(workout => (workout.exercises || []).map(item => item.name))])];
    dialog.innerHTML = `<form><h2 id="exercise-editor-title">${substituting ? "Substitute" : "Edit"} exercise</h2>
      <label>Exercise name<input name="name" list="preview-exercise-names" required maxlength="200" value="${escapeHtml(substituting ? "" : exercise.name || "")}"></label>
      <datalist id="preview-exercise-names">${names.map(name => `<option value="${escapeHtml(name)}"></option>`).join("")}</datalist>
      <label>Sets<input name="sets" type="number" min="1" max="99" step="1" required value="${escapeHtml(parsed.sets)}"></label>
      <label>Reps or duration<input name="reps" required maxlength="100" placeholder="8–12, 10/side, or 45 sec" value="${escapeHtml(parsed.reps || parsed.original)}"></label>
      <div class="workout-preview-footer"><button type="submit" class="button button-dark">Save exercise</button><button type="button" class="button button-ghost" data-close-substitute>Cancel</button></div></form>`;
    document.body.append(dialog);
    dialog.addEventListener("close", () => { dialog.remove(); action.focus(); });
    dialog.querySelector("[data-close-substitute]").addEventListener("click", () => dialog.close());
    dialog.querySelector("form").addEventListener("submit", async submit => {
      submit.preventDefault();
      const form = submit.currentTarget;
      const name = form.elements.name.value.trim();
      const reps = form.elements.reps.value.trim();
      if (!name || !reps) return;
      const updated = { ...exercise, name, prescription: WorkoutLayout.compose(form.elements.sets.value, reps) };
      if (name !== exercise.name) {
        // A different exercise must not inherit the previous exercise's demo or cues.
        for (const key of ["video", "videoUrl", "video_url", "youtube_url", "notes", "cues"]) delete updated[key];
      }
      exercises[position][index] = updated;
      dialog.close();
      await saveClientWorkoutLayout(exercises);
    });
    dialog.showModal();
  });
}

function syncClientWorkoutSelectionSummary(tab) {
  const summary = document.getElementById("client-workout-selection-summary");

  if (!summary) {
    return;
  }

  if (!tab) {
    summary.hidden = true;
    return;
  }

  const day = tab.dataset.clientWorkoutSelectionDay || "";
  const target = tab.dataset.clientWorkoutSelectionTarget || "Workout";
  const dayElement = summary.querySelector("[data-client-workout-selection-day]");
  const divider = summary.querySelector("[data-client-workout-selection-divider]");
  const titleElement = summary.querySelector("[data-client-workout-selection-title]");

  if (dayElement) {
    dayElement.textContent = day;
    dayElement.hidden = !day;
  }
  if (divider) divider.hidden = !day;
  if (titleElement) titleElement.textContent = target;
  summary.setAttribute("aria-label", `Back to workout choices. Currently viewing ${target}`);
}

function syncClientWorkoutPicker(nextIndex = activeWorkoutTabIndex) {
  const picker = document.getElementById("client-workout-tabs");
  if (picker?.querySelector(".workout-preview-list, .workout-program-picker")) {
    activeWorkoutTabIndex = nextIndex;
    return;
  }
  const cards = Array.from(picker?.querySelectorAll("[data-client-workout-picker-card]") || []);

  if (!picker || cards.length === 0) {
    return;
  }

  const index = clientWorkoutPickerIndex(nextIndex, cards.length);
  const dots = Array.from(picker.querySelectorAll("[data-client-workout-picker-dot]"));
  const position = picker.querySelector("[data-client-workout-picker-position]");
  const previousButton = picker.querySelector("[data-client-workout-picker-previous]");
  const nextButton = picker.querySelector("[data-client-workout-picker-next]");

  activeWorkoutTabIndex = index;
  picker.dataset.activeIndex = String(index);
  cards.forEach((card, cardIndex) => {
    const depth = clientWorkoutPickerIndex(cardIndex - index, cards.length);
    const isCurrent = depth === 0;

    card.classList.toggle("is-current", isCurrent);
    card.classList.toggle("is-deck-behind-1", depth === 1);
    card.classList.toggle("is-deck-behind-2", depth === 2);
    card.classList.toggle("is-deck-behind-3", depth === 3);
    card.setAttribute("aria-hidden", isCurrent ? "false" : "true");
    card.toggleAttribute("inert", !isCurrent);
  });
  dots.forEach((dot, dotIndex) => {
    const isCurrent = dotIndex === index;

    dot.classList.toggle("is-current", isCurrent);
    if (isCurrent) {
      dot.setAttribute("aria-current", "true");
    } else {
      dot.removeAttribute("aria-current");
    }
  });

  if (position) {
    position.textContent = `Workout ${index + 1} of ${cards.length}`;
  }
  if (previousButton) {
    previousButton.disabled = cards.length < 2;
  }
  if (nextButton) {
    nextButton.disabled = cards.length < 2;
  }
}

function setClientWorkoutPickerIndex(nextIndex) {
  const picker = document.getElementById("client-workout-tabs");
  const count = picker?.querySelectorAll("[data-client-workout-picker-card]").length || 0;

  if (count === 0) {
    return;
  }

  syncClientWorkoutPicker(clientWorkoutPickerIndex(nextIndex, count));
}

function moveClientWorkoutPicker(step) {
  const deck = document.querySelector("[data-client-workout-picker-deck]");

  animatePhysicalDeckChange(deck, step, () => {
    setClientWorkoutPickerIndex(activeWorkoutTabIndex + step);
  });
}

function activateClientWorkoutPanel(nextIndex, options = {}) {
  const picker = document.getElementById("client-workout-tabs");
  const summary = document.getElementById("client-workout-selection-summary");
  const panels = Array.from(document.querySelectorAll(".client-workout-panel"));
  const cards = Array.from(picker?.querySelectorAll("[data-client-workout-picker-card]") || []);
  const index = clientWorkoutPickerIndex(nextIndex, panels.length);
  const activePanel = panels[index];
  const activeCard = picker?.querySelector(`[data-client-workout-picker-card="${index}"]`);

  if (!picker || !activePanel) {
    return;
  }

  clientWorkoutPickerIsOpen = false;
  syncClientWorkoutPicker(index);
  picker.hidden = true;
  panels.forEach((panel, panelIndex) => {
    const isActive = panelIndex === index;

    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
  syncClientWorkoutSelectionSummary(activeCard);
  if (summary) {
    summary.hidden = false;
    if (options.focus !== false) {
      summary.focus({ preventScroll: true });
    }
  }

  if (activePanel.classList.contains("client-workout-panel-custom")) {
    syncCustomWorkoutCarousel(activePanel, { scrollToActive: true, instant: true });
  } else {
    syncAssignedWorkoutCarousels(activePanel);
  }

  if (options.scroll !== false) {
    window.requestAnimationFrame(() => {
      (summary || activePanel).scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
        block: "start"
      });
    });
  }
}

function showClientWorkoutPicker(options = {}) {
  const picker = document.getElementById("client-workout-tabs");
  const summary = document.getElementById("client-workout-selection-summary");
  const panels = document.querySelectorAll(".client-workout-panel");

  if (!picker) {
    return;
  }

  clientWorkoutPickerIsOpen = true;
  picker.hidden = false;
  if (summary) {
    summary.hidden = true;
  }
  panels.forEach((panel) => {
    panel.hidden = true;
    panel.classList.remove("is-active");
  });
  syncClientWorkoutPicker(activeWorkoutTabIndex);

  if (options.scroll !== false) {
    window.requestAnimationFrame(() => {
      picker.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
        block: "start"
      });
      picker.querySelector("[data-client-workout-picker-deck], [data-preview-program], [data-preview-toggle]")?.focus({ preventScroll: true });
    });
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
  const availableWorkouts = clientWorkoutPickerItems(scheduledWorkouts);

  if (count) {
    count.textContent = scheduledWorkouts.length > 0
      ? `${scheduledWorkouts.length} workout${scheduledWorkouts.length === 1 ? "" : "s"}`
      : "Custom workout";
  }

  if (activeWorkoutTabIndex >= availableWorkouts.length) {
    activeWorkoutTabIndex = 0;
  }

  tabs.innerHTML = clientWorkoutListMarkup(availableWorkouts);

  panels.innerHTML = availableWorkouts.map((workout, index) => {
    if (workout.isCustom) {
      return customWorkoutPanelMarkup(index);
    }

    const title = workout.title || `Workout ${workout.assignedWorkoutIndex + 1}`;
    const workoutFormat = inferWorkoutFormat(workout);

    return `
      <section
        class="client-workout-panel client-workout-panel-assigned"
        id="client-workout-panel-${index}"
        data-assigned-workout-format="${escapeHtml(workoutFormat)}"
        data-custom-workout-title="${escapeHtml(title)}"
        role="region"
        aria-labelledby="client-workout-card-title-${index}"
        hidden
      >
      <div class="panel-heading">
        <div>
          <h2>${escapeHtml(title)}</h2>
        </div>
        ${workout.focus ? `<span class="status-pill">${escapeHtml(workout.focus)}</span>` : ""}
      </div>
      <label class="custom-workout-session-date workout-session-date">
        <span>Workout date</span>
        <span class="workout-session-date-control">
          <span class="workout-session-date-value" data-workout-date-value aria-hidden="true">${escapeHtml(formatLogDate(todayDate()))}</span>
          <input type="date" value="${todayDate()}" data-workout-date />
        </span>
        <small>This date applies to every exercise in this workout.</small>
      </label>
      <div class="workout-format-pill">${escapeHtml(formatLabel(workoutFormat))}</div>
      <div class="custom-workout-builder" data-assigned-workout-list role="list" aria-label="${escapeHtml(title)} exercises">
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

  clientWorkoutPickerIsOpen = true;
  syncClientWorkoutPicker(activeWorkoutTabIndex);
  showClientWorkoutPicker({ scroll: false });
  renderClientHomeSummary();
  syncWorkoutStartButtons();
  syncCustomWorkoutCarousels();
  syncAssignedWorkoutCarousels();
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
  const input = exerciseNameInputForLog(logElement);
  return normalizeExerciseHistoryName(
    input ? input.value : logElement?.dataset.exerciseName || ""
  );
}

function logsForExerciseDisplay(logElement) {
  if (logElement.dataset.warmupLog !== undefined || logElement.dataset.cardioLog !== undefined) {
    return logsForExercise(logElement.dataset.workoutTitle, logElement.dataset.exerciseCode);
  }

  const exerciseName = currentExerciseHistoryName(logElement);

  if (!exerciseName) {
    return [];
  }

  return trainingLogs
    .filter((log) => (
      String(log.exercise_code || "").trim().toUpperCase() !== warmupExerciseCode &&
      String(log.exercise_code || "").trim().toUpperCase() !== cardioExerciseCode &&
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

  const best = personalBestWeightLog(logs);
  if (!best) {
    previous.textContent = "Personal best: none yet";
    return;
  }

  previous.innerHTML = `
    <strong>Personal best</strong>
    <span>${escapeHtml(best.weight_used)} lb${best.reps ? ` × ${escapeHtml(best.reps)}` : ""} · ${escapeHtml(formatLogDate(best.entry_date))}</span>
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
  const workingMinimum = Math.max(
    Number(logElement.dataset.prescribedSets || (logElement.dataset.setTargetMode === "visible" ? 0 : 1)),
    0
  );
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

function personalBestWeightLog(logs) {
  return logs.reduce((heaviestLog, log) => {
    const rawWeight = log.weight_used;
    const weight = Number(rawWeight);
    const code = String(log.exercise_code || "").trim().toUpperCase();
    const isWorkingSet = Boolean(log.entry_date) &&
      ![warmupExerciseCode, cardioExerciseCode].includes(code) &&
      normalizedSetType(log.set_type, log.set_number) !== warmUpSetType;

    if (
      !isWorkingSet ||
      rawWeight === null ||
      rawWeight === undefined ||
      String(rawWeight).trim() === "" ||
      !Number.isFinite(weight) ||
      weight < 0
    ) {
      return heaviestLog;
    }

    return !heaviestLog || weight > Number(heaviestLog.weight_used) ||
      (weight === Number(heaviestLog.weight_used) && String(log.entry_date) < String(heaviestLog.entry_date))
      ? log
      : heaviestLog;
  }, null);
}

function historyPlaceholder(value, fallback = "") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function syncExerciseFinishedState(logElement) {
  if (!logElement || logElement.dataset.warmupLog !== undefined || logElement.dataset.cardioLog !== undefined) {
    return false;
  }

  const card = logElement.closest(".workout-exercise-card");
  const completed = visibleSetTarget(logElement) > 0 && filledSetCount(logElement) >= visibleSetTarget(logElement);
  const finishButton = logElement.querySelector("[data-finish-set]");
  const format = normalizeCustomWorkoutFormat(
    card?.closest("[data-custom-workout-carousel]")?.dataset.customWorkoutFormat || "single"
  );
  const isCustomWorkout = Boolean(card?.closest(".client-workout-panel-custom"));

  logElement.classList.toggle("is-exercise-complete", completed);
  if ((card?.querySelectorAll("[data-exercise-log]").length || 0) <= 1) {
    card?.classList.toggle("is-exercise-complete", completed);
  }

  if (finishButton && !finishButton.matches("[data-add-superset]")) {
    finishButton.textContent = completed
      ? "Finished ✓"
      : isCustomWorkout && format === "superset" ? "Superset Completed" : "Set Finished";
    finishButton.setAttribute("aria-pressed", completed ? "true" : "false");
  }

  return completed;
}

function updateSetHistoryPlaceholders(logElement, logs = logsForExerciseDisplay(logElement)) {
  const selectedDate = logElement?.querySelector("[data-log-date]")?.value || todayDate();
  const best = personalBestWeightLog(logs);
  const previousByType = new Map([warmUpSetType, workingSetType].map((setType) => [
    setType,
    latestPreviousSetLogs(
      logs.filter((log) => normalizedSetType(log.set_type, log.set_number) === setType),
      selectedDate
    )
  ]));

  logElement?.querySelectorAll("[data-set-row]").forEach((row, index) => {
    const setNumber = Number(row.dataset.setNumber || index + 1);
    const setType = setTypeForRow(row);
    const previousLogs = previousByType.get(setType) || [];
    const previousLog =
      previousLogs.find((log) => Number(log.set_number || 1) === setNumber) ||
      previousLogs[Math.min(index, Math.max(previousLogs.length - 1, 0))];
    const weightInput = row.querySelector("[data-set-weight]");
    const repsInput = row.querySelector("[data-set-reps]");

    if (weightInput) {
      weightInput.placeholder = historyPlaceholder(
        (setType === warmUpSetType ? previousLog : best)?.weight_used,
        weightInput.dataset.defaultPlaceholder || "0"
      );
      const hint = setType !== warmUpSetType && best
        ? `Personal best: ${best.weight_used} lb · ${formatLogDate(best.entry_date)}`
        : "";
      weightInput.dataset.historyHint = hint;
      weightInput.title = hint;
      if (hint) weightInput.setAttribute("aria-description", hint);
      else weightInput.removeAttribute("aria-description");
    }

    if (repsInput) {
      repsInput.placeholder = historyPlaceholder(
        previousLog?.reps,
        repsInput.dataset.defaultPlaceholder || ""
      );
    }
  });
  syncCustomWorkoutGroupedHistoryPlaceholders(logElement);
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
  const exactSessionLogs = logsForExercise(logElement.dataset.workoutTitle, logElement.dataset.exerciseCode);
  const selectedDate = dateInput?.value || todayDate();
  const selectedLogs = exactSessionLogs.filter((log) => log.entry_date === selectedDate);

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
    const completeButton = row.querySelector("[data-complete-set]");
    const savedRir = Number(selectedLog?.effort_value);

    if (weightInput) {
      weightInput.value = selectedLog?.weight_used ?? "";
    }

    if (repsInput) {
      repsInput.value = selectedLog?.reps ?? "";
    }

    if (selectedLog?.effort_scale === "rir" && Number.isInteger(savedRir) && savedRir >= 0 && savedRir <= 5) {
      row.dataset.repsInReserve = String(savedRir);
    } else {
      delete row.dataset.repsInReserve;
    }

    row.classList.toggle("is-complete", Boolean(selectedLog));
    completeButton?.setAttribute("aria-pressed", selectedLog ? "true" : "false");
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
  syncExerciseFinishedState(logElement);
  renderPreviousExerciseWeights(logElement);
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

  document.querySelectorAll("[data-custom-workout-carousel] [data-exercise-log]").forEach((logElement) => {
    logElement.dataset.groupLoggedSets = String(filledSetCount(logElement));
  });

  restoreCustomWorkoutDrafts();
  syncCustomWorkoutCarousels();
  syncAssignedWorkoutCarousels();
  renderClientTrainingLogs();
  renderMonthlyProgressReport(trainingLogs);
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
      const panelWorkoutTitle = String(
        panel?.querySelector("[data-workout-start]")?.dataset.workoutTitle || ""
      ).trim();
      if (
        workoutElapsedTimerState &&
        panelWorkoutTitle === String(workoutElapsedTimerState.workoutTitle || "").trim()
      ) {
        workoutElapsedTimerState.workoutDate = workoutDate.value || todayDate();
        persistWorkoutElapsedTimerState();
        renderWorkoutResumeActions();
      }
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
  const days = sortedFoodLogDayGroups(logs);

  return days.map((day, dayIndex) => {
    const totals = foodLogTotals(day.entries);
    const macroSummary = [
      `${foodLogNumberLabel(totals.calories)} cal`,
      `${foodLogNumberLabel(totals.protein, "g")} protein`,
      `${foodLogNumberLabel(totals.carbs, "g")} carbs`,
      `${foodLogNumberLabel(totals.fat, "g")} fat`
    ].join(" · ");
    const detailsId = `client-food-history-details-${dayIndex}`;
    const foodEntriesHtml = `
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
    `;

    return {
      sort_key: `${day.entry_date || ""}::nutrition`,
      desktop_html: `
        <section class="training-log-workout-group training-log-nutrition-group">
          <div class="training-log-workout-heading">
            <strong>${escapeHtml(formatLogDate(day.entry_date))}</strong>
            <span>${escapeHtml(`Nutrition · ${macroSummary}`)}</span>
          </div>
          ${foodEntriesHtml}
        </section>
      `,
      mobile_html: `
        <article
          class="training-log-history-card training-log-food-history-card"
          data-client-food-history-card="${dayIndex}"
          role="group"
          aria-roledescription="slide"
          aria-label="${escapeHtml(`${formatLogDate(day.entry_date)} nutrition log. Day ${dayIndex + 1} of ${days.length}.`)}"
        >
          <div class="training-log-history-card-summary" data-client-food-history-summary>
            <div class="training-log-history-card-topline">
              <span class="training-log-history-state is-nutrition">Nutrition</span>
              <strong>${escapeHtml(formatLogDate(day.entry_date))}</strong>
            </div>
            <h3>${escapeHtml(`${day.entries.length} food ${day.entries.length === 1 ? "entry" : "entries"}`)}</h3>
            <p>Daily nutrition log</p>
            <dl class="training-log-history-metrics">
              <div><dt>Calories</dt><dd>${escapeHtml(foodLogNumberLabel(totals.calories))}</dd></div>
              <div><dt>Protein</dt><dd>${escapeHtml(foodLogNumberLabel(totals.protein, "g"))}</dd></div>
              <div><dt>Carbs</dt><dd>${escapeHtml(foodLogNumberLabel(totals.carbs, "g"))}</dd></div>
              <div><dt>Fat</dt><dd>${escapeHtml(foodLogNumberLabel(totals.fat, "g"))}</dd></div>
            </dl>
            <div class="training-log-history-card-actions">
              <button
                class="training-log-history-open"
                type="button"
                data-client-food-history-open
                aria-expanded="false"
                aria-controls="${escapeHtml(detailsId)}"
              >View Foods <span aria-hidden="true">→</span></button>
            </div>
          </div>
          <div
            class="training-log-history-card-details"
            id="${escapeHtml(detailsId)}"
            data-client-food-history-details
            hidden
          >
            <div class="training-log-history-details-heading">
              <div>
                <p class="kicker">Foods logged</p>
                <h3>${escapeHtml(`${day.entries.length} ${day.entries.length === 1 ? "entry" : "entries"}`)}</h3>
              </div>
              <button type="button" data-client-food-history-close>Back</button>
            </div>
            ${foodEntriesHtml}
          </div>
        </article>
      `
    };
  });
}

function clientWorkoutHistorySessionKey(record = {}) {
  const sessionId = String(record.session_id || record.workout_session_id || "").trim().toLowerCase();

  if (sessionId) {
    return `session:${sessionId}`;
  }

  const entryDate = String(record.entry_date || "").trim();
  const workoutTitle = String(record.workout_title || "Workout").trim().toLowerCase();

  return `legacy:${entryDate}::${workoutTitle}`;
}

function clientAppleWorkoutSessions() {
  const sessions = new Map();
  trainingLogs.forEach((log) => {
    const historyKey = clientWorkoutHistorySessionKey(log);
    if (!sessions.has(historyKey)) {
      sessions.set(historyKey, {
        history_key: historyKey,
        entry_date: log.entry_date || "",
        workout_title: log.workout_title || "Workout",
        completed_at: log.completed_at || log.created_at || ""
      });
    }
  });
  return Array.from(sessions.values()).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
}

function configureClientAppleWorkouts() {
  window.FWBAppleWorkout?.configure({
    supabaseClient,
    user: activeDashboardUser,
    clientEmail: normalizeClientEmail(activeClientEmail),
    readOnly: isCoachDashboardPreview,
    automaticReading: true,
    getWorkouts: clientAppleWorkoutSessions,
    onSaved: renderClientTrainingLogs
  });
  window.FWBAppleWorkout?.attach();
}

function isCopyableWorkoutHistoryLog(log = {}) {
  const exerciseCode = String(log.exercise_code || "").trim().toUpperCase();
  const exerciseName = String(log.exercise_name || "").trim();

  return Boolean(
    exerciseName &&
    exerciseCode !== warmupExerciseCode &&
    exerciseCode !== cardioExerciseCode
  );
}

function workoutHistoryLogsForCopy(sessionKey, logs = trainingLogs) {
  return (Array.isArray(logs) ? logs : []).filter((log) => (
    clientWorkoutHistorySessionKey(log) === sessionKey && isCopyableWorkoutHistoryLog(log)
  ));
}

function customWorkoutFormatForHistoryLogs(logs = []) {
  const sourceTitle = String(logs[0]?.workout_title || "").trim().toLowerCase();
  const assignedWorkout = (Array.isArray(currentProgram?.workouts) ? currentProgram.workouts : [])
    .find((workout) => String(workout?.title || "").trim().toLowerCase() === sourceTitle);

  if (assignedWorkout) {
    return normalizeCustomWorkoutFormat(inferWorkoutFormat(assignedWorkout));
  }

  // Historical Custom Workout rows do not store their original format. Keep the
  // safe straight-set fallback and let the client review the visible picker.
  if (sourceTitle.startsWith(customWorkoutTitle.toLowerCase())) {
    return "single";
  }

  if (sourceTitle.includes("circuit")) {
    return "circuit";
  }

  if (sourceTitle.includes("superset")) {
    return "superset";
  }

  const sourceGroups = new Map();
  logs.forEach((log) => {
    const match = String(log.exercise_code || "").trim().toUpperCase().match(/^([A-Z]+)(\d+)$/);
    if (!match) {
      return;
    }
    if (!sourceGroups.has(match[1])) {
      sourceGroups.set(match[1], new Set());
    }
    sourceGroups.get(match[1]).add(match[2]);
  });

  return Array.from(sourceGroups.values()).some((positions) => positions.size > 1)
    ? "superset"
    : "single";
}

function copiedCustomWorkoutStorageTitle(logs = [], copiedAt = new Date()) {
  const rawSourceTitle = String(logs[0]?.workout_title || "Previous workout").trim();
  const sourceTitle = rawSourceTitle.toLowerCase().startsWith(customWorkoutTitle.toLowerCase())
    ? "Previous custom"
    : truncateText(rawSourceTitle, 36);
  const time = [copiedAt.getHours(), copiedAt.getMinutes(), copiedAt.getSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  const milliseconds = String(copiedAt.getMilliseconds()).padStart(3, "0");

  return `${customWorkoutTitle} · ${sourceTitle} · ${time}.${milliseconds}`;
}

function customWorkoutDraftHasMeaningfulContent(draft, currentDate = "") {
  if (!draft || typeof draft !== "object") {
    return false;
  }

  if (normalizeCustomWorkoutFormat(draft.format) !== "single") {
    return true;
  }

  if (currentDate && draft.date && draft.date !== currentDate) {
    return true;
  }

  const exercises = Array.isArray(draft.exercises) ? draft.exercises : [];

  if (exercises.length > 1) {
    return true;
  }

  return exercises.some((exercise) => {
    const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];

    return Boolean(
      String(exercise?.name || "").trim() ||
      String(exercise?.notes || "").trim() ||
      exercise?.skipped ||
      sets.length > 1 ||
      sets.some((set) => (
        String(set?.weight ?? "").trim() ||
        String(set?.reps ?? "").trim() ||
        String(set?.rir ?? "").trim()
      ))
    );
  });
}

function customWorkoutPanelHasAuxiliaryContent(panel) {
  if (!panel) {
    return false;
  }

  const enteredValue = (selector) => String(panel.querySelector(selector)?.value || "").trim();
  const warmupType = enteredValue("[data-warmup-type]");
  const cardioType = enteredValue("[data-cardio-type]");

  return Boolean(
    (warmupType && warmupType.toLowerCase() !== "warm up") ||
    (cardioType && cardioType.toLowerCase() !== "cardio") ||
    enteredValue("[data-warmup-duration]") ||
    enteredValue("[data-warmup-log] [data-log-notes]") ||
    enteredValue("[data-cardio-duration]") ||
    enteredValue("[data-cardio-distance]") ||
    enteredValue("[data-cardio-calories]") ||
    enteredValue("[data-cardio-log] [data-log-notes]")
  );
}

function customWorkoutDraftFromLogs(logs = [], options = {}) {
  const format = ["superset", "circuit"].includes(options.format) ? options.format : "single";
  const date = String(options.date || "").trim();
  const exerciseGroups = new Map();

  (Array.isArray(logs) ? logs : []).filter(isCopyableWorkoutHistoryLog).forEach((log) => {
    const code = String(log.exercise_code || "").trim().toUpperCase();
    const name = String(log.exercise_name || "").trim();
    const key = `${code}::${name.toLowerCase()}`;

    if (!exerciseGroups.has(key)) {
      exerciseGroups.set(key, { code, name, sets: [] });
    }
    exerciseGroups.get(key).sets.push(log);
  });

  const exercises = Array.from(exerciseGroups.values()).sort((left, right) => (
    left.code.localeCompare(right.code, undefined, { numeric: true }) ||
    left.name.localeCompare(right.name)
  ));
  const sourceGroupIndexes = new Map();

  return {
    format,
    date,
    workoutTitle: String(options.workoutTitle || customWorkoutTitle),
    copiedFrom: {
      sessionKey: String(options.sessionKey || ""),
      workoutTitle: String(logs[0]?.workout_title || "Workout"),
      entryDate: String(logs[0]?.entry_date || "")
    },
    exercises: exercises.map((exercise, exerciseIndex) => {
      const warmUpSetNumbers = new Set();
      const workingSetNumbers = [];

      exercise.sets.forEach((set, index) => {
        const setNumber = Number(set.set_number);
        const isWarmUp = set.set_type === warmUpSetType || setNumber > warmUpSetNumberBase;

        if (isWarmUp) {
          warmUpSetNumbers.add(Number.isFinite(setNumber) ? setNumber : warmUpSetNumberBase + index + 1);
        } else {
          workingSetNumbers.push(Number.isFinite(setNumber) && setNumber > 0 ? setNumber : index + 1);
        }
      });

      const warmUpCount = warmUpSetNumbers.size;
      const workingSetCount = Math.max(1, Math.max(0, ...workingSetNumbers, workingSetNumbers.length));
      const sourceGroupKey = exercise.code.match(/^([A-Za-z]+)/)?.[1]?.toUpperCase() || `EXERCISE-${exerciseIndex}`;

      if (!sourceGroupIndexes.has(sourceGroupKey)) {
        sourceGroupIndexes.set(sourceGroupKey, sourceGroupIndexes.size);
      }

      return {
        code: customExerciseCode(exerciseIndex),
        name: exercise.name,
        group: format === "superset" ? sourceGroupIndexes.get(sourceGroupKey) : 0,
        date,
        notes: "",
        skipped: false,
        sets: [
          ...Array.from({ length: warmUpCount }, (_, index) => ({
            label: index === 0 ? "W" : `W${index + 1}`,
            weight: "",
            reps: "",
            setType: warmUpSetType,
            rir: ""
          })),
          ...Array.from({ length: workingSetCount }, (_, index) => ({
            label: String(index + 1),
            weight: "",
            reps: "",
            setType: workingSetType,
            rir: ""
          }))
        ]
      };
    })
  };
}

function workoutHistorySummaryMetrics(workout = {}) {
  const exercises = Array.from(workout.supersets?.values?.() || [])
    .flatMap((superset) => Array.from(superset.exercises?.values?.() || []));
  const workingSets = exercises.flatMap((exercise) => {
    const exerciseCode = String(exercise.exercise_code || "").trim().toUpperCase();

    if (exerciseCode === warmupExerciseCode || exerciseCode === cardioExerciseCode) {
      return [];
    }

    return (Array.isArray(exercise.sets) ? exercise.sets : []).filter((set) => (
      normalizedSetType(set.set_type, set.set_number) !== warmUpSetType
    ));
  });
  const totalVolume = workingSets.reduce((sum, set) => {
    const weight = Number(set.weight_used);
    const reps = Number(set.reps);

    return Number.isFinite(weight) && weight > 0 && Number.isFinite(reps) && reps > 0
      ? sum + (weight * reps)
      : sum;
  }, 0);
  const rirValues = workingSets
    .filter((set) => String(set.effort_scale || "").trim().toLowerCase() === "rir")
    .map((set) => Number(set.effort_value))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 5);
  const averageRir = rirValues.length > 0
    ? rirValues.reduce((sum, value) => sum + value, 0) / rirValues.length
    : null;

  return {
    exerciseCount: exercises.length,
    workingSetCount: workingSets.length,
    volumeLabel: totalVolume > 0 ? `${Math.round(totalVolume).toLocaleString("en-US")} lb` : "—",
    averageRirLabel: averageRir === null ? "—" : averageRir.toFixed(1)
  };
}

function filteredClientWorkoutHistoryLogs(logs = [], dateFilter = "", searchFilter = "") {
  const safeLogs = Array.isArray(logs) ? logs : [];
  const normalizedDate = String(dateFilter || "").trim();
  const normalizedSearch = String(searchFilter || "").trim();
  const matchesDate = (log) => !normalizedDate || String(log.entry_date || "") === normalizedDate;

  if (!normalizedSearch) {
    return safeLogs.filter(matchesDate);
  }

  const matchingSessionKeys = new Set(
    safeLogs
      .filter((log) => matchesDate(log) && clientTrainingLogMatchesSearch(log, normalizedSearch))
      .map((log) => clientWorkoutHistorySessionKey(log))
  );

  return safeLogs.filter((log) => (
    matchesDate(log) && matchingSessionKeys.has(clientWorkoutHistorySessionKey(log))
  ));
}

function renderClientTrainingLogs() {
  renderClientExerciseProgress(trainingLogs);
  const history = document.getElementById("client-training-log-history");
  const count = document.getElementById("client-logs-count");

  if (!history) {
    return;
  }

  activeWorkoutHistoryDeckIndex = 0;
  activeFoodHistoryDeckIndex = 0;
  const filteredLogs = filteredClientWorkoutHistoryLogs(
    trainingLogs,
    clientTrainingLogDateFilter,
    clientTrainingLogSearchFilter
  );
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
    const workoutKey = clientWorkoutHistorySessionKey(log);
    const exerciseCode = String(log.exercise_code || "");
    const supersetMatch = exerciseCode.match(/^([A-Za-z]+)/);
    const supersetKey = exerciseCode === warmupExerciseCode
      ? "WARMUP"
      : exerciseCode === cardioExerciseCode
        ? "CARDIO"
        : supersetMatch ? supersetMatch[1].toUpperCase() : "OTHER";

    if (!workoutGroups.has(workoutKey)) {
      workoutGroups.set(workoutKey, {
        history_key: workoutKey,
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
      effort_scale: log.effort_scale,
      effort_value: log.effort_value,
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

  const workoutHistorySections = workoutSections.map((workout, workoutIndex) => {
    const appleWorkoutMarkup = window.FWBAppleWorkout?.markup(workout.history_key) || "";
    const supersets = Array.from(workout.supersets.values()).sort((a, b) => a.key.localeCompare(b.key));
    const workoutDuration = workoutHistoryDurationLabel(workout.workout_duration_seconds);
    const workoutDifficulty = workoutHistoryDifficultyLabel(workout.workout_difficulty);
    const workoutHeading = [workout.workout_title, workoutDuration, workoutDifficulty].filter(Boolean).join(" · ");
    const mobileWorkoutMeta = [workoutDuration, workoutDifficulty].filter(Boolean).join(" · ") || "Workout saved";
    const workoutStatus = workout.completed_at ? "Completed" : "Saved";
    const metrics = workoutHistorySummaryMetrics(workout);
    const canCopyToCustom = workoutHistoryLogsForCopy(workout.history_key).length > 0;
    const shareButtonMarkup = !isCoachDashboardPreview ? `<button class="training-log-share-button" type="button" data-share-workout-history="${escapeHtml(workout.history_key)}" aria-label="${escapeHtml(`Share ${workout.workout_title} from ${formatLogDate(workout.entry_date)}`)}">Share workout</button>` : "";
    const copyButtonLabel = `Copy ${workout.workout_title} from ${formatLogDate(workout.entry_date)} to Custom workout`;
    const detailsId = `client-workout-history-details-${workoutIndex}`;
    const detailsHtml = `
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
    `;

    return {
      sort_key: `${workout.entry_date || ""}::workout::${workout.workout_title || ""}`,
      desktop_html: `
        <section class="training-log-workout-group">
          <div class="training-log-workout-heading has-copy-action">
            <div class="training-log-workout-title">
              <strong>${escapeHtml(formatLogDate(workout.entry_date))}</strong>
              <span>${escapeHtml(workoutHeading)}</span>
            </div>
            <div class="training-log-workout-actions">
            ${canCopyToCustom ? `
              <button
                class="training-log-copy-button"
                type="button"
                data-copy-workout-to-custom="${escapeHtml(workout.history_key)}"
                aria-label="${escapeHtml(copyButtonLabel)}"
              >Copy Workout</button>
            ` : ""}
            ${shareButtonMarkup}
            </div>
          </div>
          ${appleWorkoutMarkup}
          ${detailsHtml}
        </section>
      `,
      mobile_html: `
        <article
          class="training-log-history-card"
          data-client-workout-history-card="${workoutIndex}"
          data-client-workout-history-key="${escapeHtml(workout.history_key)}"
          role="group"
          aria-roledescription="slide"
          aria-label="${escapeHtml(`${workout.workout_title}, ${formatLogDate(workout.entry_date)}. Workout ${workoutIndex + 1} of ${workoutSections.length}.`)}"
        >
          <div class="training-log-history-card-summary" data-client-workout-history-summary>
            <div class="training-log-history-card-topline">
              <span class="training-log-history-state${workout.completed_at ? " is-complete" : ""}">${escapeHtml(workoutStatus)}</span>
              <strong>${escapeHtml(formatLogDate(workout.entry_date))}</strong>
            </div>
            <h3>${escapeHtml(workout.workout_title)}</h3>
            <p>${escapeHtml(mobileWorkoutMeta)}</p>
            <dl class="training-log-history-metrics">
              <div><dt>Exercises</dt><dd>${escapeHtml(String(metrics.exerciseCount))}</dd></div>
              <div><dt>Volume</dt><dd>${escapeHtml(metrics.volumeLabel)}</dd></div>
              <div><dt>Working sets</dt><dd>${escapeHtml(String(metrics.workingSetCount))}</dd></div>
              <div><dt>Average RIR</dt><dd>${escapeHtml(metrics.averageRirLabel)}</dd></div>
            </dl>
            ${appleWorkoutMarkup}
            <div class="training-log-history-card-actions">
              <button
                class="training-log-history-open"
                type="button"
                data-client-workout-history-open
                aria-expanded="false"
                aria-controls="${escapeHtml(detailsId)}"
              >View Exercises <span aria-hidden="true">→</span></button>
              ${canCopyToCustom ? `
                <button
                  class="training-log-copy-button"
                  type="button"
                  data-copy-workout-to-custom="${escapeHtml(workout.history_key)}"
                  aria-label="${escapeHtml(copyButtonLabel)}"
                >Copy Workout</button>
              ` : ""}
              ${shareButtonMarkup}
            </div>
          </div>
          <div
            class="training-log-history-card-details"
            id="${escapeHtml(detailsId)}"
            data-client-workout-history-details
            hidden
          >
            <div class="training-log-history-details-heading">
              <div>
                <p class="kicker">Exercises completed</p>
                <h3>${escapeHtml(`${metrics.exerciseCount} ${metrics.exerciseCount === 1 ? "exercise" : "exercises"}`)}</h3>
              </div>
              <button type="button" data-client-workout-history-close>Back</button>
            </div>
            ${detailsHtml}
          </div>
        </article>
      `
    };
  });
  const nutritionHistorySections = nutritionLogHistorySections(filteredFoodLogs);
  const chronologicalHistory = [
    ...workoutHistorySections.map((section) => ({ sort_key: section.sort_key, html: section.desktop_html })),
    ...nutritionHistorySections.map((section) => ({ sort_key: section.sort_key, html: section.desktop_html }))
  ].sort((a, b) => b.sort_key.localeCompare(a.sort_key));
  const mobileWorkoutBrowser = workoutHistorySections.length > 0 ? `
    <section class="training-log-mobile-workout-browser" data-client-workout-history-browser>
      <div class="training-log-history-deck-heading">
        <div>
          <p class="kicker">Past workouts</p>
          <strong data-client-workout-history-position aria-live="polite" aria-atomic="true">Workout 1 of ${workoutHistorySections.length}</strong>
        </div>
        <div class="training-log-history-deck-controls" aria-label="Past workout controls">
          <button type="button" data-client-workout-history-previous aria-label="Previous workout">←</button>
          <button type="button" data-client-workout-history-next aria-label="Next workout">→</button>
        </div>
      </div>
      <div
        class="training-log-history-deck"
        data-client-workout-history-deck
        role="region"
        aria-roledescription="carousel"
        aria-label="Past workouts. Swipe left or right, or use the arrow buttons."
        tabindex="0"
      >
        ${workoutHistorySections.map((section) => section.mobile_html).join("")}
      </div>
      <p class="training-log-history-swipe-hint">Swipe left or right to browse</p>
    </section>
  ` : "";
  const mobileFoodBrowser = nutritionHistorySections.length > 0 ? `
    <section class="training-log-mobile-nutrition-history" data-client-food-history-browser>
      <div class="training-log-history-deck-heading">
        <div>
          <p class="kicker">Food logs</p>
          <strong data-client-food-history-position aria-live="polite" aria-atomic="true">Day 1 of ${nutritionHistorySections.length}</strong>
        </div>
        <div class="training-log-history-deck-controls" aria-label="Food log controls">
          <button type="button" data-client-food-history-previous aria-label="Previous food log day">←</button>
          <button type="button" data-client-food-history-next aria-label="Next food log day">→</button>
        </div>
      </div>
      <div
        class="training-log-history-deck"
        data-client-food-history-deck
        role="region"
        aria-roledescription="carousel"
        aria-label="Food logs. Swipe left or right, or use the arrow buttons."
        tabindex="0"
      >
        ${nutritionHistorySections.map((section) => section.mobile_html).join("")}
      </div>
      <p class="training-log-history-swipe-hint">Swipe left or right to browse</p>
    </section>
  ` : "";

  history.innerHTML = `
    <div class="training-log-desktop-history">${chronologicalHistory.map((section) => section.html).join("")}</div>
    ${mobileWorkoutBrowser}
    ${mobileFoodBrowser}
  `;
  syncClientWorkoutHistoryDeck(activeWorkoutHistoryDeckIndex);
  syncClientFoodHistoryDeck(activeFoodHistoryDeckIndex);
}

function setClientWorkoutHistoryCardExpanded(card, expanded, options = {}) {
  const isFoodCard = card?.matches("[data-client-food-history-card]");
  const details = card?.querySelector(isFoodCard
    ? "[data-client-food-history-details]"
    : "[data-client-workout-history-details]");
  const openButton = card?.querySelector(isFoodCard
    ? "[data-client-food-history-open]"
    : "[data-client-workout-history-open]");

  if (!card || !details || !openButton) {
    return;
  }

  const isExpanded = Boolean(expanded);

  card.classList.toggle("is-detail-open", isExpanded);
  details.hidden = !isExpanded;
  openButton.setAttribute("aria-expanded", isExpanded ? "true" : "false");
  openButton.innerHTML = isExpanded
    ? `${isFoodCard ? "Hide Foods" : "Hide Exercises"} <span aria-hidden="true">↑</span>`
    : `${isFoodCard ? "View Foods" : "View Exercises"} <span aria-hidden="true">→</span>`;

  if (!isExpanded && options.restoreFocus) {
    openButton.focus({ preventScroll: true });
  }
}

function syncClientWorkoutHistoryDeck(nextIndex = activeWorkoutHistoryDeckIndex, historyType = "workout") {
  const isFoodHistory = historyType === "food";
  const browser = document.querySelector(isFoodHistory
    ? "[data-client-food-history-browser]"
    : "[data-client-workout-history-browser]");
  const deck = browser?.querySelector(isFoodHistory
    ? "[data-client-food-history-deck]"
    : "[data-client-workout-history-deck]");
  const cards = Array.from(deck?.querySelectorAll(isFoodHistory
    ? "[data-client-food-history-card]"
    : "[data-client-workout-history-card]") || []);

  if (!browser || !deck || cards.length === 0) {
    if (isFoodHistory) {
      activeFoodHistoryDeckIndex = 0;
    } else {
      activeWorkoutHistoryDeckIndex = 0;
    }
    return;
  }

  const index = clientWorkoutPickerIndex(nextIndex, cards.length);
  const position = browser.querySelector(isFoodHistory
    ? "[data-client-food-history-position]"
    : "[data-client-workout-history-position]");
  const previousButton = browser.querySelector(isFoodHistory
    ? "[data-client-food-history-previous]"
    : "[data-client-workout-history-previous]");
  const nextButton = browser.querySelector(isFoodHistory
    ? "[data-client-food-history-next]"
    : "[data-client-workout-history-next]");

  if (isFoodHistory) {
    activeFoodHistoryDeckIndex = index;
  } else {
    activeWorkoutHistoryDeckIndex = index;
  }
  browser.dataset.activeIndex = String(index);
  cards.forEach((card, cardIndex) => {
    const depth = clientWorkoutPickerIndex(cardIndex - index, cards.length);
    const isCurrent = depth === 0;

    card.classList.toggle("is-current", isCurrent);
    card.classList.toggle("is-deck-behind-1", depth === 1);
    card.classList.toggle("is-deck-behind-2", depth === 2);
    card.classList.toggle("is-deck-behind-3", depth === 3);
    card.setAttribute("aria-hidden", isCurrent ? "false" : "true");
    card.toggleAttribute("inert", !isCurrent);
    if (!isCurrent) {
      setClientWorkoutHistoryCardExpanded(card, false);
    }
  });

  if (position) {
    position.textContent = `${isFoodHistory ? "Day" : "Workout"} ${index + 1} of ${cards.length}`;
  }
  if (previousButton) {
    previousButton.disabled = cards.length < 2;
  }
  if (nextButton) {
    nextButton.disabled = cards.length < 2;
  }
}

function syncClientFoodHistoryDeck(nextIndex = activeFoodHistoryDeckIndex) {
  syncClientWorkoutHistoryDeck(nextIndex, "food");
}

function setClientWorkoutHistoryDeckIndex(nextIndex, historyType = "workout") {
  const count = document.querySelectorAll(historyType === "food"
    ? "[data-client-food-history-card]"
    : "[data-client-workout-history-card]").length;

  if (count === 0) {
    return;
  }

  syncClientWorkoutHistoryDeck(clientWorkoutPickerIndex(nextIndex, count), historyType);
}

function moveClientWorkoutHistoryDeck(step, historyType = "workout") {
  const currentIndex = historyType === "food"
    ? activeFoodHistoryDeckIndex
    : activeWorkoutHistoryDeckIndex;
  const deck = document.querySelector(historyType === "food"
    ? "[data-client-food-history-deck]"
    : "[data-client-workout-history-deck]");

  animatePhysicalDeckChange(deck, step, () => {
    setClientWorkoutHistoryDeckIndex(currentIndex + step, historyType);
  });
}

function handleClientWorkoutHistoryDeck() {
  let gesture = null;
  let ignoreCardClickUntil = 0;

  document.addEventListener("click", (event) => {
    const foodBrowser = event.target.closest("[data-client-food-history-browser]");
    const historyType = foodBrowser ? "food" : "workout";

    if (event.target.closest("[data-client-workout-history-previous], [data-client-food-history-previous]")) {
      moveClientWorkoutHistoryDeck(-1, historyType);
      return;
    }

    if (event.target.closest("[data-client-workout-history-next], [data-client-food-history-next]")) {
      moveClientWorkoutHistoryDeck(1, historyType);
      return;
    }

    const closeButton = event.target.closest("[data-client-workout-history-close], [data-client-food-history-close]");

    if (closeButton) {
      const card = closeButton.closest("[data-client-workout-history-card], [data-client-food-history-card]");

      setClientWorkoutHistoryCardExpanded(card, false, { restoreFocus: true });
      return;
    }

    const openButton = event.target.closest("[data-client-workout-history-open], [data-client-food-history-open]");

    if (openButton) {
      const card = openButton.closest("[data-client-workout-history-card], [data-client-food-history-card]");
      const details = card?.querySelector("[data-client-workout-history-details], [data-client-food-history-details]");

      setClientWorkoutHistoryCardExpanded(card, details?.hidden !== false);
      return;
    }

    if (Date.now() < ignoreCardClickUntil || event.target.closest("button, a, input, select, textarea")) {
      return;
    }

    const summary = event.target.closest("[data-client-workout-history-summary], [data-client-food-history-summary]");
    const card = summary?.closest("[data-client-workout-history-card], [data-client-food-history-card]");

    if (card?.classList.contains("is-current")) {
      setClientWorkoutHistoryCardExpanded(card, true);
    }
  });

  document.addEventListener("keydown", (event) => {
    const deck = event.target.closest("[data-client-workout-history-deck], [data-client-food-history-deck]");
    const historyType = deck?.matches("[data-client-food-history-deck]") ? "food" : "workout";

    if (!deck || event.target !== deck || deck.querySelector(".is-current.is-detail-open")) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveClientWorkoutHistoryDeck(-1, historyType);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveClientWorkoutHistoryDeck(1, historyType);
    } else if (event.key === "Home") {
      event.preventDefault();
      setClientWorkoutHistoryDeckIndex(0, historyType);
    } else if (event.key === "End") {
      event.preventDefault();
      setClientWorkoutHistoryDeckIndex(deck.querySelectorAll(
        historyType === "food" ? "[data-client-food-history-card]" : "[data-client-workout-history-card]"
      ).length - 1, historyType);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    const deck = event.target.closest("[data-client-workout-history-deck], [data-client-food-history-deck]");
    const interactive = event.target.closest("button, input, select, textarea, a");

    if (!deck || interactive || deck.querySelector(".is-current.is-detail-open")) {
      gesture = null;
      return;
    }

    gesture = {
      deck,
      historyType: deck.matches("[data-client-food-history-deck]") ? "food" : "workout",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: ""
    };
  });

  document.addEventListener("pointermove", (event) => {
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const horizontalDistance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);

    if (!gesture.axis && Math.max(horizontalDistance, verticalDistance) >= 8) {
      gesture.axis = horizontalDistance > verticalDistance * 1.15 ? "horizontal" : "vertical";
    }

    if (gesture.axis === "horizontal") {
      event.preventDefault();
      applyPhysicalDeckDrag(gesture.deck, deltaX, gesture.deck.getBoundingClientRect().width);
    }
  }, { passive: false });

  document.addEventListener("pointerup", (event) => {
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    const { deck, historyType, startX, startY, axis } = gesture;
    const step = axis === "vertical"
      ? 0
      : clientWorkoutPickerSwipeStep(
        event.clientX - startX,
        event.clientY - startY,
        deck.getBoundingClientRect().width
      );

    releasePhysicalDeckDrag(deck);
    gesture = null;
    if (step !== 0) {
      ignoreCardClickUntil = Date.now() + 350;
      moveClientWorkoutHistoryDeck(step, historyType);
    }
  });

  document.addEventListener("pointercancel", () => {
    releasePhysicalDeckDrag(gesture?.deck);
    gesture = null;
  });
}

function setClientWorkoutCopyStatus(message = "") {
  const status = document.getElementById("client-workout-copy-status");

  if (status) {
    status.textContent = message;
  }
}

function clientCustomWorkoutPanelIndex() {
  return Math.max(
    0,
    Array.from(document.querySelectorAll(".client-workout-panel"))
      .findIndex((panel) => panel.classList.contains("client-workout-panel-custom"))
  );
}

function openClientWorkoutCopyHistory() {
  const logsTitle = document.getElementById("client-logs-title");

  setClientDashboardTab("logs");
  window.requestAnimationFrame(() => {
    logsTitle?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
      block: "start"
    });
    logsTitle?.focus({ preventScroll: true });
  });
}

function handleCopyWorkoutToCustom() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-copy-workout-to-custom]");

    if (!button) {
      return;
    }

    const sessionKey = String(button.dataset.copyWorkoutToCustom || "");
    const sourceLogs = workoutHistoryLogsForCopy(sessionKey);

    if (sourceLogs.length === 0) {
      setClientWorkoutCopyStatus("This workout could not be copied. Refresh the page and try again.");
      return;
    }

    const date = todayDate();
    const existingDraft = activeCustomWorkoutDraft();
    const existingCustomPanel = document.querySelector(".client-workout-panel-custom");

    if (
      (
        customWorkoutDraftHasMeaningfulContent(existingDraft, date) ||
        customWorkoutPanelHasAuxiliaryContent(existingCustomPanel)
      ) &&
      !window.confirm("Replace your current Custom Workout draft with this previous workout? Your saved workout history will not be changed.")
    ) {
      setClientWorkoutCopyStatus("Copy canceled. Your current Custom Workout draft was not changed.");
      return;
    }

    const format = customWorkoutFormatForHistoryLogs(sourceLogs);
    const workoutTitle = copiedCustomWorkoutStorageTitle(sourceLogs);
    const draft = customWorkoutDraftFromLogs(sourceLogs, { date, format, sessionKey, workoutTitle });

    if (draft.exercises.length === 0) {
      setClientWorkoutCopyStatus("This workout has no strength exercises to copy.");
      return;
    }

    const endSavedTimer = Boolean(workoutElapsedTimerState);
    if (
      endSavedTimer &&
      !window.confirm(
        "A workout timer is still saved on this device. End it without saving its workout time and copy this workout?"
      )
    ) {
      setClientWorkoutCopyStatus("Copy canceled. Your saved workout timer is still open.");
      return;
    }

    storeCustomWorkoutDraft(draft);

    const storedDraft = activeCustomWorkoutDraft();
    if (storedDraft?.copiedFrom?.sessionKey !== sessionKey) {
      setClientWorkoutCopyStatus("The Custom Workout draft could not be created on this device.");
      return;
    }

    activeCustomWorkoutFormat = draft.format;
    storeCustomWorkoutFormat(draft.format);

    if (endSavedTimer) {
      finishWorkoutElapsedTimer();
    }

    setClientDashboardTab("workouts");

    const customPanelIndex = clientCustomWorkoutPanelIndex();
    const customPanel = replaceCustomWorkoutPanelFromDraft(customPanelIndex);

    if (!customPanel) {
      setClientWorkoutCopyStatus("The Custom Workout could not be opened. Refresh the page and try again.");
      return;
    }

    activateClientWorkoutPanel(customPanelIndex, { scroll: false, focus: false });
    const heading = customPanel?.querySelector("#custom-workout-panel-title");
    const copyStatus = customPanel?.querySelector("[data-custom-workout-copy-status]");

    if (copyStatus) {
      copyStatus.textContent = customWorkoutCopyStatusMessage(storedDraft);
      copyStatus.hidden = false;
    }
    setClientWorkoutCopyStatus("");

    window.requestAnimationFrame(() => {
      customPanel?.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
        block: "start"
      });
      heading?.focus({ preventScroll: true });
    });
  });
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
    const setLabel = setNumberLabel(setNumber, setType);

    if (labelInput) {
      labelInput.value = setLabel;
      labelInput.setAttribute("aria-label", isWarmUp ? `Warm-up set ${warmUpIndex} label` : `Set label ${setLabel}`);
    }

    const friendlyName = isWarmUp ? `warm-up set ${warmUpIndex}` : `set ${workingIndex}`;
    row.querySelector("[data-set-rir]")?.setAttribute("aria-label", `Choose reps in reserve for ${friendlyName}`);
    row.querySelector("[data-set-rest]")?.setAttribute("aria-label", `Start rest timer after ${friendlyName}`);
    row.querySelector("[data-complete-set]")?.setAttribute("aria-label", `Complete ${friendlyName} and start rest timer`);
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

function storedClientDashboardSidebarCollapsed() {
  try {
    return window.localStorage.getItem(clientDashboardSidebarStorageKey) === "true";
  } catch (_error) {
    return false;
  }
}

function persistClientDashboardSidebarCollapsed(collapsed) {
  try {
    window.localStorage.setItem(clientDashboardSidebarStorageKey, String(Boolean(collapsed)));
  } catch (_error) {
    // The navigation can still collapse for this page view when storage is unavailable.
  }
}

function setClientDashboardSidebarCollapsed(collapsed) {
  const grid = document.getElementById("client-dashboard-grid");
  const toggle = document.querySelector("[data-client-sidebar-toggle]");
  const toggleIcon = document.querySelector("[data-client-sidebar-toggle-icon]");
  const toggleLabel = toggle?.querySelector(".client-dashboard-sidebar-toggle-label");
  const desktopNavigation = window.matchMedia?.("(min-width: 901px)")?.matches ?? true;
  const isCollapsed = desktopNavigation && Boolean(collapsed);

  if (!grid || !toggle) {
    return;
  }

  grid.classList.toggle("is-client-sidebar-collapsed", isCollapsed);
  toggle.setAttribute("aria-expanded", String(!isCollapsed));
  toggle.setAttribute("aria-label", isCollapsed ? "Expand navigation" : "Minimize navigation");

  if (toggleIcon) {
    toggleIcon.textContent = isCollapsed ? "›" : "‹";
  }
  if (toggleLabel) {
    toggleLabel.textContent = isCollapsed ? "Expand" : "Minimize";
  }

  window.requestAnimationFrame?.(() => applyWorkoutElapsedTimerPosition());
}

function handleClientDashboardSidebar() {
  const grid = document.getElementById("client-dashboard-grid");
  const toggle = document.querySelector("[data-client-sidebar-toggle]");
  const desktopQuery = window.matchMedia?.("(min-width: 901px)");

  if (!grid || !toggle || !desktopQuery) {
    return;
  }

  setClientDashboardSidebarCollapsed(storedClientDashboardSidebarCollapsed());

  toggle.addEventListener("click", () => {
    if (!desktopQuery.matches) {
      return;
    }

    const nextCollapsed = !grid.classList.contains("is-client-sidebar-collapsed");

    setClientDashboardSidebarCollapsed(nextCollapsed);
    persistClientDashboardSidebarCollapsed(nextCollapsed);
  });

  grid.addEventListener("transitionend", (event) => {
    if (event.target === grid && event.propertyName === "grid-template-columns") {
      applyWorkoutElapsedTimerPosition();
    }
  });

  const handleDesktopChange = (event) => {
    setClientDashboardSidebarCollapsed(event.matches && storedClientDashboardSidebarCollapsed());
  };

  if (typeof desktopQuery.addEventListener === "function") {
    desktopQuery.addEventListener("change", handleDesktopChange);
  } else if (typeof desktopQuery.addListener === "function") {
    desktopQuery.addListener(handleDesktopChange);
  }
}

function syncClientDashboardMobileNavigationIcon(tabName = activeClientDashboardTab) {
  const toggle = document.querySelector("[data-client-mobile-nav-toggle]");
  const iconHost = toggle?.querySelector("[data-client-mobile-nav-icon]");
  const tabs = Array.from(document.querySelectorAll("[data-client-dashboard-tab]"));
  const selectedTab = tabs.find((tab) => tab.dataset.clientDashboardTab === tabName)
    || tabs.find((tab) => tab.classList.contains("is-active"));
  const selectedIcon = selectedTab?.querySelector(".client-dashboard-tab-icon");

  if (!toggle || !iconHost || !selectedTab || !selectedIcon) {
    return;
  }

  const icon = selectedIcon.cloneNode(true);
  const selectedLabel = selectedTab.getAttribute("aria-label") || "Selected tab";

  icon.classList.remove("client-dashboard-tab-icon");
  icon.classList.add("client-dashboard-mobile-nav-icon");
  iconHost.replaceChildren(icon);
  toggle.setAttribute("aria-label", `Open navigation, ${selectedLabel} selected`);
}

function centerActiveClientDashboardMobileTab(navigation = document.querySelector(".client-dashboard-tabs")) {
  const activeTab = navigation?.querySelector(".client-dashboard-tab.is-active");
  const mobileNavigation = window.matchMedia?.("(max-width: 900px)")?.matches ?? false;

  if (!navigation || !activeTab || !mobileNavigation) {
    return;
  }

  const maximumScroll = Math.max(0, navigation.scrollWidth - navigation.clientWidth);
  const centeredScroll = activeTab.offsetLeft - ((navigation.clientWidth - activeTab.offsetWidth) / 2);
  const left = Math.max(0, Math.min(maximumScroll, centeredScroll));

  if (typeof navigation.scrollTo === "function") {
    navigation.scrollTo({ left, behavior: "smooth" });
  } else {
    navigation.scrollLeft = left;
  }
}

function syncClientDashboardMobileNavigationScrollCue(navigation = document.querySelector(".client-dashboard-tabs")) {
  const fade = document.querySelector("[data-client-nav-scroll-fade]");
  const cue = document.querySelector("[data-client-nav-scroll-cue]");
  const mobileNavigation = window.matchMedia?.("(max-width: 900px)")?.matches ?? false;
  const maximumScroll = navigation ? Math.max(0, navigation.scrollWidth - navigation.clientWidth) : 0;
  const isExpanded = Boolean(navigation?.classList.contains("is-mobile-expanded"));
  const isAtEnd = !navigation || navigation.scrollLeft >= maximumScroll - 4;
  const shouldShow = Boolean(mobileNavigation && isExpanded && maximumScroll > 4 && !isAtEnd);

  if (fade) {
    fade.hidden = !shouldShow;
  }

  if (cue) {
    cue.hidden = !shouldShow;
  }
}

function setClientDashboardMobileNavigationExpanded(expanded, options = {}) {
  const navigation = document.querySelector(".client-dashboard-tabs");
  const toggle = document.querySelector("[data-client-mobile-nav-toggle]");
  const mobileNavigation = window.matchMedia?.("(max-width: 900px)")?.matches ?? false;
  const isExpanded = mobileNavigation && Boolean(expanded);

  if (!navigation || !toggle) {
    return;
  }

  toggle.hidden = !mobileNavigation || isExpanded;
  toggle.setAttribute("aria-expanded", String(isExpanded));
  navigation.classList.toggle("is-mobile-expanded", isExpanded);
  document.body.classList.toggle("client-dashboard-mobile-nav-expanded", isExpanded);

  if (mobileNavigation) {
    if (!isExpanded && options.focusToggle) {
      toggle.focus({ preventScroll: true });
    }
    navigation.inert = !isExpanded;
    navigation.setAttribute("aria-hidden", String(!isExpanded));
  } else {
    navigation.inert = false;
    navigation.removeAttribute("aria-hidden");
  }

  if (isExpanded && options.focusNavigation) {
    navigation.querySelector(".client-dashboard-tab.is-active")?.focus({ preventScroll: true });
  }

  window.requestAnimationFrame?.(() => {
    if (isExpanded) {
      centerActiveClientDashboardMobileTab(navigation);
    }
    syncClientDashboardMobileNavigationScrollCue(navigation);
    applyWorkoutElapsedTimerPosition();
  });
}

function handleClientDashboardMobileNavigation() {
  const toggle = document.querySelector("[data-client-mobile-nav-toggle]");
  const navigation = document.querySelector(".client-dashboard-tabs");
  const mobileQuery = window.matchMedia?.("(max-width: 900px)");

  if (!toggle || !navigation || !mobileQuery) {
    return;
  }

  syncClientDashboardMobileNavigationIcon();
  setClientDashboardMobileNavigationExpanded(true);

  toggle.addEventListener("click", () => {
    lastClientDashboardMobileTabPress = "";
    setClientDashboardMobileNavigationExpanded(true, { focusNavigation: true });
  });

  navigation.addEventListener("scroll", () => {
    syncClientDashboardMobileNavigationScrollCue(navigation);
  }, { passive: true });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileQuery.matches) {
      lastClientDashboardMobileTabPress = "";
      setClientDashboardMobileNavigationExpanded(false, { focusToggle: true });
    }
  });

  const handleMobileChange = () => {
    lastClientDashboardMobileTabPress = "";
    setClientDashboardMobileNavigationExpanded(mobileQuery.matches);
    syncClientDashboardMobileNavigationScrollCue(navigation);
  };

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", handleMobileChange);
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(handleMobileChange);
  }
}

function clientDashboardMobileTabPressAction(tabName, activeTab, previousTabPress, expanded) {
  const targetTab = String(tabName || "home");
  const shouldCollapse = Boolean(
    expanded &&
    targetTab === String(activeTab || "") &&
    targetTab === String(previousTabPress || "")
  );

  return {
    shouldCollapse,
    nextTabPress: shouldCollapse ? "" : targetTab
  };
}

function setClientDashboardTab(tabName) {
  const nextTab = tabName || "home";
  const tabs = document.querySelectorAll("[data-client-dashboard-tab]");
  const panels = document.querySelectorAll("[data-client-dashboard-panel]");

  activeClientDashboardTab = nextTab;
  tabs.forEach((button) => {
    const isActive = button.dataset.clientDashboardTab === nextTab;

    button.classList.toggle("is-active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
  syncClientDashboardMobileNavigationIcon(nextTab);
  panels.forEach((panel) => {
    const isActive = panel.dataset.clientDashboardPanel === nextTab;

    panel.hidden = !isActive;
  });

  if (nextTab === "notifications" && clientWebNotificationController) {
    clientWebNotificationController.refresh().catch(() => {
      // The notification center renders a user-facing retry message.
    });
  }
}

function setClientNotificationSettingsAvailable(available) {
  const settingsTab = document.querySelector('[data-client-dashboard-tab="notifications"]');
  const settingsPanel = document.querySelector('[data-client-dashboard-panel="notifications"]');
  const isAvailable = Boolean(available);

  if (settingsTab) {
    settingsTab.hidden = !isAvailable;
  }
  if (!isAvailable && settingsPanel) {
    settingsPanel.hidden = true;
  }
  if (!isAvailable && activeClientDashboardTab === "notifications") {
    activeClientDashboardTab = "home";
  }
}

function clientHomeCheckinPromptStorageKey(user = activeDashboardUser) {
  const identity = String(user?.id || user?.email || "client").trim().toLowerCase();

  return `${clientHomeCheckinPromptStoragePrefix}:${identity}`;
}

function clientHomeCheckinPromptSeen(user = activeDashboardUser) {
  if (user?.user_metadata?.[clientHomeCheckinPromptMetadataKey] === true) {
    return true;
  }

  try {
    return window.localStorage.getItem(clientHomeCheckinPromptStorageKey(user)) === "true";
  } catch (_error) {
    return false;
  }
}

async function rememberClientHomeCheckinPromptSeen() {
  if (!activeDashboardUser) {
    return;
  }

  try {
    window.localStorage.setItem(clientHomeCheckinPromptStorageKey(), "true");
  } catch (_error) {
    // Supabase metadata remains the cross-device source of truth when local storage is unavailable.
  }

  activeDashboardUser = {
    ...activeDashboardUser,
    user_metadata: {
      ...(activeDashboardUser.user_metadata || {}),
      [clientHomeCheckinPromptMetadataKey]: true
    }
  };

  if (!supabaseClient || isCoachPortalEmail(activeDashboardUser.email)) {
    return;
  }

  const { data, error } = await supabaseClient.auth.updateUser({
    data: { [clientHomeCheckinPromptMetadataKey]: true }
  });

  if (!error && data?.user) {
    activeDashboardUser = data.user;
  }
}

function setClientHomeCheckinExpanded(expanded) {
  const card = document.querySelector("[data-client-home-checkin]");
  const button = card?.querySelector("[data-client-home-checkin-toggle]");
  const content = card?.querySelector("[data-client-home-checkin-content]");
  const label = button?.querySelector("[data-client-home-checkin-toggle-label]");
  const icon = button?.querySelector("[data-client-home-checkin-toggle-icon]");
  const isExpanded = Boolean(expanded);
  const isPrompt = card?.classList.contains("is-first-login-prompt");

  if (!card || !button || !content) {
    return;
  }

  button.setAttribute("aria-expanded", String(isExpanded));
  button.setAttribute("aria-label", isPrompt ? "Close check-in" : (isExpanded ? "Minimize check-in" : "Open check-in"));
  content.hidden = !isExpanded;
  card.classList.toggle("is-collapsed", !isExpanded);

  if (label) {
    label.textContent = isPrompt ? "Close" : (isExpanded ? "Minimize" : "Open");
  }
  if (icon) {
    icon.textContent = isPrompt ? "×" : (isExpanded ? "−" : "+");
  }
}

function dismissClientHomeCheckinPrompt(restoreFocus = true) {
  const card = document.querySelector("[data-client-home-checkin]");
  const backdrop = document.querySelector("[data-client-home-checkin-backdrop]");
  const button = card?.querySelector("[data-client-home-checkin-toggle]");

  if (!card?.classList.contains("is-first-login-prompt")) {
    return;
  }

  card.classList.remove("is-first-login-prompt");
  card.removeAttribute("role");
  card.removeAttribute("aria-modal");
  card.removeAttribute("aria-labelledby");
  backdrop && (backdrop.hidden = true);
  document.body.classList.remove("is-client-checkin-prompt-open");
  setClientHomeCheckinExpanded(false);

  if (restoreFocus) {
    button?.focus();
  }
}

function maybeShowClientHomeCheckinPrompt() {
  const card = document.querySelector("[data-client-home-checkin]");
  const backdrop = document.querySelector("[data-client-home-checkin-backdrop]");

  if (
    !card ||
    !backdrop ||
    !activeDashboardUser ||
    activeClientDashboardTab !== "home" ||
    isCoachPortalEmail(activeDashboardUser.email) ||
    clientHomeCheckinPromptSeen()
  ) {
    return;
  }

  card.classList.add("is-first-login-prompt");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "client-home-mood");
  backdrop.hidden = false;
  document.body.classList.add("is-client-checkin-prompt-open");
  setClientHomeCheckinExpanded(true);
  void rememberClientHomeCheckinPromptSeen();
  window.setTimeout?.(() => card.querySelector("input[type=radio], select, textarea")?.focus(), 0);
}

function handleClientHomeCheckin() {
  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-client-home-checkin-toggle]");
    const backdrop = event.target.closest("[data-client-home-checkin-backdrop]");

    if (backdrop) {
      dismissClientHomeCheckinPrompt();
      return;
    }
    if (!toggle) {
      return;
    }

    const card = toggle.closest("[data-client-home-checkin]");

    if (card?.classList.contains("is-first-login-prompt")) {
      dismissClientHomeCheckinPrompt();
      return;
    }

    setClientHomeCheckinExpanded(toggle.getAttribute("aria-expanded") !== "true");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      dismissClientHomeCheckinPrompt();
    }
    const card = document.querySelector(".client-home-card-mood.is-first-login-prompt");
    if (event.key !== "Tab" || !card) return;
    const controls = Array.from(card.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled)"))
      .filter((control) => control.type !== "radio" || control === (card.querySelector(`input[name="${control.name}"]:checked`) || card.querySelector(`input[name="${control.name}"]`)));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || !card.contains(document.activeElement))) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !card.contains(document.activeElement))) {
      event.preventDefault();
      first?.focus();
    }
  });
}

function setClientHomeCarouselSlide(carousel, nextIndex) {
  const slides = Array.from(carousel?.querySelectorAll("[data-client-home-carousel-slide]") || []);

  if (!carousel || slides.length === 0) {
    return;
  }

  const index = ((Number(nextIndex) || 0) % slides.length + slides.length) % slides.length;
  const dots = Array.from(carousel.querySelectorAll("[data-client-home-carousel-dot]"));
  const status = carousel.querySelector("[data-client-home-carousel-status]");

  carousel.dataset.activeIndex = String(index);
  slides.forEach((slide, slideIndex) => {
    const isActive = slideIndex === index;

    slide.hidden = !isActive;
    slide.classList.toggle("is-active", isActive);
    slide.setAttribute("aria-hidden", isActive ? "false" : "true");
  });
  dots.forEach((dot, dotIndex) => {
    const isActive = dotIndex === index;

    dot.classList.toggle("is-active", isActive);
    dot.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  if (status) {
    const slideLabel = slides[index].getAttribute("aria-label") || `Slide ${index + 1}`;
    status.textContent = `${slideLabel} · ${index + 1} / ${slides.length}`;
  }
}

function handleClientHomeCarousel() {
  document.querySelectorAll("[data-client-home-carousel]").forEach((carousel) => {
    let touchStartX = null;
    let touchStartY = null;

    setClientHomeCarouselSlide(carousel, Number(carousel.dataset.activeIndex) || 0);
    carousel.addEventListener("touchstart", (event) => {
      const touch = event.touches[0];

      if (!touch || event.touches.length !== 1) {
        return;
      }
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    }, { passive: true });
    carousel.addEventListener("touchend", (event) => {
      const touch = event.changedTouches[0];

      if (!touch || touchStartX === null || touchStartY === null) {
        touchStartX = null;
        touchStartY = null;
        return;
      }

      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      touchStartX = null;
      touchStartY = null;

      if (Math.abs(deltaX) < 45 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) {
        return;
      }

      const current = Number(carousel.dataset.activeIndex) || 0;
      setClientHomeCarouselSlide(carousel, current + (deltaX < 0 ? 1 : -1));
    }, { passive: true });
  });

  document.addEventListener("click", (event) => {
    const previous = event.target.closest("[data-client-home-carousel-previous]");
    const next = event.target.closest("[data-client-home-carousel-next]");
    const dot = event.target.closest("[data-client-home-carousel-dot]");
    const control = previous || next || dot;
    const carousel = control?.closest("[data-client-home-carousel]");

    if (!carousel) {
      return;
    }

    const current = Number(carousel.dataset.activeIndex) || 0;
    const targetIndex = dot
      ? Number(dot.dataset.clientHomeCarouselDot)
      : current + (next ? 1 : -1);

    setClientHomeCarouselSlide(carousel, targetIndex);
  });

  document.addEventListener("keydown", (event) => {
    const carousel = event.target.closest("[data-client-home-carousel]");

    if (!carousel || !["ArrowLeft", "ArrowRight"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const current = Number(carousel.dataset.activeIndex) || 0;
    setClientHomeCarouselSlide(carousel, current + (event.key === "ArrowRight" ? 1 : -1));
  });
}

function syncClientHomeSnapshotControls(deck, index) {
  const section = deck?.closest(".client-home-snapshot-section");
  const cards = Array.from(deck?.querySelectorAll("[data-client-home-snapshot-card]") || []);
  const dots = Array.from(section?.querySelectorAll("[data-client-home-snapshot-dot]") || []);
  const safeIndex = Math.min(Math.max(Number(index) || 0, 0), Math.max(cards.length - 1, 0));

  if (!deck || cards.length === 0) {
    return;
  }

  deck.dataset.activeIndex = String(safeIndex);
  dots.forEach((dot, dotIndex) => {
    const isActive = dotIndex === safeIndex;

    dot.classList.toggle("is-active", isActive);
    dot.setAttribute("aria-pressed", String(isActive));
  });
}

function updateClientHomeSnapshotMotion(deck) {
  const cards = Array.from(deck?.querySelectorAll("[data-client-home-snapshot-card]") || []);
  const origin = cards[0]?.offsetLeft || 0;
  const step = Math.max((cards[1]?.offsetLeft || 0) - origin, cards[0]?.offsetWidth || 1, 1);
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  cards.forEach((card) => {
    const distance = reducedMotion ? 0 : Math.max(-1.15, Math.min(1.15, ((card.offsetLeft - origin) - deck.scrollLeft) / step));
    const depth = Math.abs(distance);

    card.style.setProperty("--snapshot-y", `${depth * 10}px`);
    card.style.setProperty("--snapshot-rotate", `${distance * -1.7}deg`);
    card.style.setProperty("--snapshot-scale", String(1 - depth * .035));
    card.style.setProperty("--snapshot-opacity", String(1 - depth * .2));
    card.classList.toggle("is-snapshot-active", depth < .45);
  });
}

function setClientHomeSnapshotCard(deck, nextIndex, behavior = "smooth") {
  const cards = Array.from(deck?.querySelectorAll("[data-client-home-snapshot-card]") || []);

  if (!deck || cards.length === 0) {
    return;
  }

  const index = ((Number(nextIndex) || 0) % cards.length + cards.length) % cards.length;
  const origin = cards[0].offsetLeft;

  deck.scrollTo({
    left: cards[index].offsetLeft - origin,
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : behavior
  });
  syncClientHomeSnapshotControls(deck, index);
}

function handleClientHomeSnapshotDeck() {
  document.querySelectorAll("[data-client-home-snapshot-deck]").forEach((deck) => {
    let scrollFrame = null;

    syncClientHomeSnapshotControls(deck, 0);
    updateClientHomeSnapshotMotion(deck);
    deck.addEventListener("scroll", () => {
      if (scrollFrame !== null) {
        return;
      }

      scrollFrame = window.requestAnimationFrame(() => {
        const cards = Array.from(deck.querySelectorAll("[data-client-home-snapshot-card]"));
        const origin = cards[0]?.offsetLeft || 0;
        const activeIndex = cards.reduce((closestIndex, card, index) => (
          Math.abs((card.offsetLeft - origin) - deck.scrollLeft) <
          Math.abs((cards[closestIndex].offsetLeft - origin) - deck.scrollLeft)
            ? index
            : closestIndex
        ), 0);

        updateClientHomeSnapshotMotion(deck);
        syncClientHomeSnapshotControls(deck, activeIndex);
        scrollFrame = null;
      });
    }, { passive: true });
  });

  document.addEventListener("click", (event) => {
    const dot = event.target.closest("[data-client-home-snapshot-dot]");
    const section = dot?.closest(".client-home-snapshot-section");
    const deck = section?.querySelector("[data-client-home-snapshot-deck]");

    if (dot && deck) {
      setClientHomeSnapshotCard(deck, Number(dot.dataset.clientHomeSnapshotDot));
    }
  });

  document.addEventListener("keydown", (event) => {
    const deck = event.target.closest("[data-client-home-snapshot-deck]");

    if (!deck || !["ArrowLeft", "ArrowRight"].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const current = Number(deck.dataset.activeIndex) || 0;
    setClientHomeSnapshotCard(deck, current + (event.key === "ArrowRight" ? 1 : -1));
  });
}

function handleClientSummaryActions() {
  document.addEventListener("click", async (event) => {
    const summaryTabButton = event.target.closest("[data-client-summary-go-tab]");
    const resetButton = event.target.closest("#client-dashboard-reset-password-button");

    if (summaryTabButton) {
      const tabName = summaryTabButton.dataset.clientSummaryGoTab;
      const panel = document.querySelector(`[data-client-dashboard-panel="${tabName}"]`);

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
      setText("#client-home-mood-status", "Choose a 1–5 rating or add a quick note.");
      return;
    }

    const button = document.getElementById("client-home-save-mood-button");

    if (button?.disabled) return;

    if (button) {
      button.disabled = true;
    }

    setText("#client-home-mood-status", "Saving mood check-in...");

    let checkinSaved = false;
    try {
      const entryDate = todayDate();
      const existing = progressEntries.find((entry) => entry.entry_date === entryDate) || {};
      const payload = {
        client_email: email,
        entry_date: entryDate,
        bodyweight: existing.bodyweight ?? null,
        bodyfat: existing.bodyfat ?? null,
        lean_mass: existing.lean_mass ?? null,
        muscle_mass: existing.muscle_mass ?? null,
        measurements: progressMeasurements(existing),
        goal_note: note,
        mood_checkin_submitted_at: new Date().toISOString()
      };
      const { error } = await withTimeout(
        supabaseClient
          .from("client_progress")
          .upsert(payload, { onConflict: "client_email,entry_date" }),
        "Mood check-in save timed out."
      );

      if (error) {
        setText("#client-home-mood-status", error.message || "Could not save mood check-in.");

        return;
      }

      checkinSaved = true;
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

        return;
      }

      renderProgress(data || []);
      form.reset();
      setText("#client-home-mood-status", "Mood check-in saved for today.");
      dismissClientHomeCheckinPrompt();
    } catch (_error) {
      setText("#client-home-mood-status", checkinSaved
        ? "Mood saved. Refresh to reload it."
        : "Could not confirm your check-in. Please try again.");
    } finally {
      if (button) button.disabled = false;
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

  const assignedWorkouts = Array.isArray(data.workouts) ? data.workouts : [];
  currentProgram = { ...data, assignedWorkouts, workouts: WorkoutLayout.apply(assignedWorkouts, data.client_workout_layout) };
  renderClientNutrition(currentProgram);
  return { data };
}

function handleClientNutritionSave() {
  document.addEventListener("input", (event) => {
    if (event.target.closest("#client-nutrition-targets")) {
      renderNutritionMacroChart(clientNutritionTargetValues());
    }
  });

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

    const tabName = tab.dataset.clientDashboardTab;
    const navigation = tab.closest(".client-dashboard-tabs");
    const mobileNavigation = window.matchMedia?.("(max-width: 900px)")?.matches ?? false;
    const action = clientDashboardMobileTabPressAction(
      tabName,
      activeClientDashboardTab,
      lastClientDashboardMobileTabPress,
      navigation?.classList.contains("is-mobile-expanded")
    );

    setClientDashboardTab(tabName);
    if (mobileNavigation) {
      lastClientDashboardMobileTabPress = action.nextTabPress;
      if (action.shouldCollapse) {
        setClientDashboardMobileNavigationExpanded(false, { focusToggle: true });
      }
    }
    if (tabName === "home") {
      window.requestAnimationFrame?.(() => maybeShowClientHomeCheckinPrompt());
    }
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
  logElement.querySelectorAll("input, select, textarea, [data-add-set], [data-delete-last-set], [data-finish-set], [data-complete-set], [data-set-rir], [data-set-rest], [data-exercise-notes-toggle]").forEach((control) => {
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
      setWorkoutExerciseCardExpanded(card, !skipped);
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
  }, panel.dataset.customWorkoutTitle || customWorkoutTitle);

  const defaultLogElement = list.querySelector("[data-exercise-log]");
  if (defaultLogElement) {
    updateExerciseLogField(defaultLogElement);
  }
  syncCustomWorkoutCarousel(panel, { activeIndex: 0, scrollToActive: true, instant: true });
}

function appendInlineGroupingPartner(panel) {
  const lists = Array.from(panel?.querySelectorAll("[data-custom-workout-list]") || []);
  const list = lists[lists.length - 1];

  if (!panel || !list) {
    return null;
  }

  const nextIndex = panel.querySelectorAll("[data-custom-exercise-card]").length;
  list.insertAdjacentHTML("beforeend", customWorkoutCardMarkup({
    code: nextCustomExerciseCode(panel),
    name: "",
    group: 0,
    groupType: "single",
    prescription: "Custom sets",
    rest: ""
  }, panel.dataset.customWorkoutTitle || customWorkoutTitle, nextIndex, {
    format: "single",
    panelFormat: "single"
  }));

  const newCard = list.querySelector("[data-custom-exercise-card]:last-child");
  const logElement = newCard?.querySelector("[data-exercise-log]");
  const hiddenDate = logElement?.querySelector("[data-log-date]");

  if (hiddenDate) {
    hiddenDate.value = panel.querySelector("[data-workout-date]")?.value || todayDate();
  }
  if (logElement) {
    updateExerciseLogField(logElement);
  }

  return newCard;
}

function clearCustomWorkoutInlineGroup(cards, card) {
  const groupType = normalizeCustomWorkoutInlineGroupType(card?.dataset.customWorkoutGroupType);
  const groupIndex = Math.max(Number(card?.dataset.customWorkoutGroup) || 0, 0);
  const members = groupType === "single"
    ? [card]
    : cards.filter((candidate) => (
      normalizeCustomWorkoutInlineGroupType(candidate.dataset.customWorkoutGroupType) === groupType &&
      Math.max(Number(candidate.dataset.customWorkoutGroup) || 0, 0) === groupIndex
    ));

  members.filter(Boolean).forEach((member) => {
    member.dataset.customWorkoutGroupType = "single";
    member.dataset.customWorkoutGroup = "0";
  });
}

function updateCustomWorkoutInlineGrouping(input) {
  // The round layout displays these controls outside its hidden source cards.
  const card = input?.closest("[data-custom-exercise-card]")
    || input?.closest("[data-custom-workout-carousel]")?.querySelector("[data-custom-exercise-card]");
  const panel = card?.closest(".client-workout-panel-custom");
  const panelFormat = normalizeCustomWorkoutFormat(panel?.dataset.customWorkoutFormat || activeCustomWorkoutFormat);

  if (!input || !card || !panel || panelFormat !== "single") {
    return;
  }

  const requestedType = normalizeCustomWorkoutInlineGroupType(input.dataset.customWorkoutInlineGroupOption);
  let cards = Array.from(panel.querySelectorAll("[data-custom-exercise-card]"));
  const currentIndex = cards.indexOf(card);

  if (requestedType === "single" || currentIndex < 0) {
    return;
  }

  if (!input.checked) {
    clearCustomWorkoutInlineGroup(cards, card);
    syncCustomWorkoutCarousel(panel, { focusCard: card, instant: true });
    syncCustomWorkoutFormatMarkers(panel);
    persistCustomWorkoutDraftFromPanel(panel);
    return;
  }

  const previousCard = cards[currentIndex - 1] || null;
  const nextCard = cards[currentIndex + 1] || null;
  const adjacentCircuit = requestedType === "circuit"
    ? [previousCard, nextCard].find((candidate) => (
      normalizeCustomWorkoutInlineGroupType(candidate?.dataset.customWorkoutGroupType) === "circuit"
    ))
    : null;

  clearCustomWorkoutInlineGroup(cards, card);

  if (adjacentCircuit) {
    card.dataset.customWorkoutGroupType = "circuit";
    card.dataset.customWorkoutGroup = adjacentCircuit.dataset.customWorkoutGroup;
  } else {
    let partner = nextCard || previousCard;

    if (!partner) {
      partner = appendInlineGroupingPartner(panel);
      cards = Array.from(panel.querySelectorAll("[data-custom-exercise-card]"));
    }

    if (!partner) {
      input.checked = false;
      return;
    }

    clearCustomWorkoutInlineGroup(cards, partner);
    const existingGroupIndices = cards
      .filter((candidate) => normalizeCustomWorkoutInlineGroupType(candidate.dataset.customWorkoutGroupType) === requestedType)
      .map((candidate) => Math.max(Number(candidate.dataset.customWorkoutGroup) || 0, 0));
    const nextGroupIndex = existingGroupIndices.length > 0
      ? Math.max(...existingGroupIndices) + 1
      : 0;

    [card, partner].forEach((member) => {
      member.dataset.customWorkoutGroupType = requestedType;
      member.dataset.customWorkoutGroup = String(nextGroupIndex);
    });
  }

  syncCustomWorkoutCarousel(panel, { focusCard: card, instant: true });
  syncCustomWorkoutFormatMarkers(panel);
  persistCustomWorkoutDraftFromPanel(panel);
}

function handleCustomWorkoutInlineGrouping() {
  document.addEventListener("change", (event) => {
    const input = event.target.closest("[data-custom-workout-inline-group-option]");

    if (input) {
      const card = input.closest("[data-custom-exercise-card]")
        || input.closest("[data-custom-workout-carousel]")?.querySelector("[data-custom-exercise-card]");
      updateCustomWorkoutInlineGrouping(input);
      // Regrouping replaces the visible shell. Keep keyboard focus on its control.
      if (!input.isConnected) {
        card?.closest("[data-custom-workout-carousel]")?.querySelector(
          `.custom-workout-grouped-card [data-custom-workout-inline-group-option="${input.dataset.customWorkoutInlineGroupOption}"]`
        )?.focus({ preventScroll: true });
      }
    }
  });
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
    moveCustomWorkoutCarousel(carousel, carouselIndex + 1, { direction: 1 });
    window.requestAnimationFrame(() => {
      customWorkoutEditableNameInput(existingSecondExercise)?.focus();
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
  }, panel.dataset.customWorkoutTitle || customWorkoutTitle, currentIndex + 1, { groupPosition: carouselCards.length }));

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
    customWorkoutEditableNameInput(newCard)?.focus();
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
  syncAssignedWorkoutCarousels(assignedPanel);
}

function handleWorkoutInteractions() {
  document.addEventListener("click", async (event) => {
    const exerciseSuggestionButton = event.target.closest("[data-custom-exercise-suggestion]");
    const customWorkoutGroupNameToggle = event.target.closest("[data-custom-workout-group-name-toggle]");
    const customWorkoutGroupDelete = event.target.closest("[data-custom-workout-group-delete]");
    const customGroupedLogRoundButton = event.target.closest("[data-custom-grouped-log-round]");
    const customGroupedLogWarmUpButton = event.target.closest("[data-custom-grouped-log-warmup]");
    const customGroupedCopyWeightsButton = event.target.closest("[data-custom-grouped-copy-weights]");
    const customGroupedUndoWeightsButton = event.target.closest("[data-custom-grouped-undo-weights]");
    const customGroupedAddRoundButton = event.target.closest("[data-custom-grouped-add-round]");
    const customGroupedRemoveRoundButton = event.target.closest("[data-custom-grouped-remove-round]");
    const customGroupedRestAdjustButton = event.target.closest("[data-custom-grouped-rest-adjust]");
    const customGroupedRestToggleButton = event.target.closest("[data-custom-grouped-rest-toggle]");
    const customGroupedFinishButton = event.target.closest("[data-custom-grouped-finish-workout]");
    const customGroupedSetToggle = event.target.closest("[data-custom-grouped-set-toggle]");
    const customGroupedFinishClose = event.target.closest("[data-custom-grouped-finish-close]");
    const customGroupedStartNew = event.target.closest("[data-custom-grouped-start-new]");
    const customGroupedWorkoutDone = event.target.closest("[data-custom-grouped-workout-done]");
    const toggle = event.target.closest("[data-exercise-toggle]");
    const addSetButton = event.target.closest("[data-add-set]");
    const deleteLastSetButton = event.target.closest("[data-delete-last-set]");
    const addSupersetButton = event.target.closest("[data-add-superset]");
    const finishSetButton = event.target.closest("[data-finish-set]");
    const completeSetButton = event.target.closest("[data-complete-set]");
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
    const workoutGroupLogSetButton = event.target.closest("[data-workout-group-log-set]");
    const closeRestTimerButton = event.target.closest("[data-rest-timer-close]");
    const restTimerPresetButton = event.target.closest("[data-rest-timer-preset]");
    const restTimerStartButton = event.target.closest("[data-rest-timer-start]");
    const restTimerResetButton = event.target.closest("[data-rest-timer-reset]");
    const restTimerNotificationButton = event.target.closest("[data-rest-timer-notifications]");
    const rirOptionButton = event.target.closest("[data-rir-option]");
    const rirSaveButton = event.target.closest("[data-rir-save]");
    const rirCloseButton = event.target.closest("[data-rir-close]");
    const workoutDifficultyOptionButton = event.target.closest("[data-workout-difficulty-option]");
    const workoutDifficultySaveButton = event.target.closest("[data-workout-difficulty-save]");
    const workoutDifficultyCloseButton = event.target.closest("[data-workout-difficulty-close]");
    const nextExerciseYesButton = event.target.closest("[data-next-exercise-yes]");
    const nextExerciseFinishButton = event.target.closest("[data-next-exercise-finish]");
    const workoutStartButton = event.target.closest("[data-workout-start]");
    const resumeActiveWorkoutButton = event.target.closest("[data-resume-active-workout]");
    const cancelActiveWorkoutButton = event.target.closest("[data-cancel-active-workout]");
    const workoutElapsedToggleButton = event.target.closest("[data-workout-elapsed-toggle]");
    const workoutElapsedResetButton = event.target.closest("[data-workout-elapsed-reset]");
    const workoutElapsedCompactButton = event.target.closest("[data-workout-elapsed-compact]");
    const workoutElapsedCloseButton = event.target.closest("[data-workout-elapsed-close]");
    const resetCustomWorkoutButton = event.target.closest("[data-reset-custom-workout]");

    if (customGroupedFinishClose || event.target.matches("[data-custom-grouped-finish-overlay]")) {
      closeCustomWorkoutGroupedFinishPanel();
      return;
    }

    if (customGroupedStartNew || customGroupedWorkoutDone) {
      const panel = customGroupedFinishReturnFocus?.closest(".client-workout-panel-custom");
      const finishWorkoutButton = panel?.querySelector("[data-custom-workout-default-finish] [data-workout-finish]");

      if (customGroupedStartNew && panel) {
        pendingGroupedCustomWorkoutRestart = groupedCustomWorkoutRestartConfig(panel);
      } else {
        pendingGroupedCustomWorkoutRestart = null;
      }
      closeCustomWorkoutGroupedFinishPanel({ restoreFocus: false });
      if (finishWorkoutButton) {
        finishWorkoutButton.dataset.allowIncompleteWorkoutFinish = "true";
        finishWorkoutButton.click();
      }
      return;
    }

    if (customGroupedCopyWeightsButton || customGroupedUndoWeightsButton) {
      if (customGroupedCopyWeightsButton) copyCustomWorkoutGroupedWeights(customGroupedCopyWeightsButton);
      else undoCustomWorkoutGroupedWeights(customGroupedUndoWeightsButton);
      return;
    }

    if (customGroupedLogWarmUpButton) {
      await logCustomWorkoutGroupedWarmUp(customGroupedLogWarmUpButton);
      return;
    }

    if (customGroupedLogRoundButton) {
      await logCustomWorkoutGroupedRound(customGroupedLogRoundButton);
      return;
    }

    if (customGroupedAddRoundButton) {
      addCustomWorkoutGroupedRound(customGroupedAddRoundButton);
      return;
    }

    if (customGroupedRemoveRoundButton) {
      removeCustomWorkoutGroupedRound(customGroupedRemoveRoundButton);
      return;
    }

    if (customGroupedRestAdjustButton) {
      adjustRestTimer(customGroupedRestAdjustButton.dataset.customGroupedRestAdjust);
      return;
    }

    if (customGroupedRestToggleButton) {
      startOrPauseRestTimer();
      return;
    }

    if (customGroupedFinishButton) {
      openCustomWorkoutGroupedFinishPanel(customGroupedFinishButton);
      return;
    }

    if (customGroupedSetToggle) {
      toggleCustomWorkoutGroupedSet(customGroupedSetToggle);
      return;
    }

    if (customWorkoutGroupDelete) {
      const carousel = customWorkoutGroupDelete.closest("[data-custom-workout-carousel]");
      const index = Number(customWorkoutGroupDelete.dataset.customWorkoutGroupDelete);
      const logElement = customWorkoutCarouselCards(carousel)[index]?.querySelector("[data-exercise-log]");
      removeExerciseLog(logElement);
      return;
    }

    if (customWorkoutGroupNameToggle) {
      const carousel = customWorkoutGroupNameToggle.closest("[data-custom-workout-carousel]");
      const fields = carousel?.querySelector("[data-custom-workout-group-name-fields]");
      const expanded = customWorkoutGroupNameToggle.getAttribute("aria-expanded") === "true";
      const icon = customWorkoutGroupNameToggle.querySelector("[data-custom-workout-group-name-icon]");

      customWorkoutGroupNameToggle.setAttribute("aria-expanded", String(!expanded));
      if (carousel) carousel.dataset.groupNamesExpanded = expanded ? "false" : "true";
      if (fields) fields.hidden = expanded;
      if (icon) icon.textContent = expanded ? "+" : "−";
      if (!expanded) fields?.querySelector("[data-custom-workout-group-name-input]")?.focus();
      return;
    }

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

    if (nextExerciseFinishButton) {
      const panel = nextExercisePromptPanel;
      const finishWorkoutButton = panel?.querySelector("[data-workout-finish]");

      closeNextExercisePrompt({ restoreFocus: false });
      if (finishWorkoutButton) {
        finishWorkoutButton.dataset.allowIncompleteWorkoutFinish = "true";
        finishWorkoutButton.click();
      }
      return;
    }

    if (resumeActiveWorkoutButton) {
      resumeActiveWorkout();
      return;
    }

    if (cancelActiveWorkoutButton) {
      cancelActiveWorkout();
      return;
    }

    if (resetCustomWorkoutButton) {
      resetCustomWorkout(resetCustomWorkoutButton.closest(".client-workout-panel-custom"));
      return;
    }

    if (workoutStartButton) {
      const workoutTitle = String(workoutStartButton.dataset.workoutTitle || activeWorkoutElapsedTitle()).trim();
      const workoutPanel = workoutStartButton.closest(".client-workout-panel");
      const workoutPanels = Array.from(document.querySelectorAll(".client-workout-panel"));
      const workoutDate = workoutPanel?.querySelector("[data-workout-date]")?.value || todayDate();
      const panelIndex = workoutPanels.indexOf(workoutPanel);
      const isActiveWorkout = Boolean(
        workoutElapsedTimerState &&
        workoutTitle === String(workoutElapsedTimerState.workoutTitle || "").trim() &&
        workoutDate === String(workoutElapsedTimerState.workoutDate || "")
      );

      if (isActiveWorkout && workoutElapsedTimerState.dismissed) {
        showWorkoutElapsedTimer();
      } else if (isActiveWorkout) {
        toggleWorkoutElapsedTimer();
      } else if (!workoutElapsedTimerState) {
        startWorkoutElapsedTimer(workoutTitle, { workoutDate, panelIndex });
      }
      return;
    }

    if (workoutElapsedCompactButton) {
      toggleWorkoutElapsedTimerCompact();
      return;
    }

    if (workoutElapsedCloseButton) {
      hideWorkoutElapsedTimer();
      return;
    }

    if (workoutElapsedToggleButton) {
      toggleWorkoutElapsedTimer();
      return;
    }

    if (workoutElapsedResetButton) {
      resetWorkoutElapsedTimer();
      return;
    }

    if (!event.target.closest(".custom-workout-name-editor")) {
      closeCustomExerciseSuggestions();
    }

    if (exerciseSuggestionButton) {
      event.preventDefault();
      selectCustomExerciseSuggestion(exerciseSuggestionButton);
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

    if (completeSetButton) {
      const setRow = completeSetButton.closest("[data-set-row]");
      const logElement = completeSetButton.closest("[data-exercise-log]");

      if (!workoutElapsedTimerState) {
        startWorkoutElapsedTimer(logElement?.dataset.workoutTitle || activeWorkoutElapsedTitle());
      }
      setRow?.classList.add("is-complete");
      completeSetButton.setAttribute("aria-pressed", "true");
      if (logElement) {
        updateVisibleSetProgress(logElement);
        persistCustomWorkoutDraftForElement(logElement);
        scheduleTrainingLogAutosave(logElement);
      }
      resetRestTimer();
      openRestTimer(completeSetButton);
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

        logElement.dataset.groupLoggedSets = String(filledSetCount(logElement));
        logElement.classList.add("is-exercise-complete");
        if (cardLogCount <= 1) {
          card?.classList.add("is-exercise-complete");
          setWorkoutExerciseCardExpanded(card, false);
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

    const energyInput = event.target.closest("[data-workout-energy]");
    if (energyInput) {
      pendingWorkoutEnergy[energyInput.dataset.workoutEnergy] = Number(energyInput.value);
      renderWorkoutDifficultyPrompt();
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

    if (restTimerNotificationButton) {
      await toggleRestTimerNotifications();
      return;
    }

    if (customWorkoutFormatButton) {
      updateCustomWorkoutFormat(
        customWorkoutFormatButton.closest(".client-workout-panel-custom"),
        customWorkoutFormatButton.dataset.customWorkoutFormatOption
      );
      return;
    }

    if (workoutGroupLogSetButton) {
      await logCurrentWorkoutCarouselSet(workoutGroupLogSetButton);
      return;
    }

    if (customWorkoutCarouselPrevious || customWorkoutCarouselNext || customWorkoutCarouselDot) {
      const carousel = event.target.closest("[data-custom-workout-carousel]");
      const current = Number(carousel?.dataset.activeIndex) || 0;
      const nextIndex = customWorkoutCarouselDot
        ? Number(customWorkoutCarouselDot.dataset.customWorkoutCarouselDot)
        : current + (customWorkoutCarouselNext ? 1 : -1);

      const direction = customWorkoutCarouselDot
        ? Math.sign(nextIndex - current)
        : (customWorkoutCarouselNext ? 1 : -1);
      moveCustomWorkoutCarousel(carousel, nextIndex, { direction });
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
        setWorkoutExerciseCardExpanded(card, !card.classList.contains("is-open"));
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
          setRow.querySelector("[data-complete-set]")?.setAttribute("aria-pressed", "false");
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
      const isDeckRequest = addCustomExerciseButton.matches("[data-custom-workout-new-exercise]");
      const expectedExerciseNumber = Number(addCustomExerciseButton.dataset.customWorkoutNewExercise);
      const nextExerciseNumber = (panel?.querySelectorAll("[data-custom-exercise-card]").length || 0) + 1;

      if (
        isDeckRequest &&
        (
          panel?.dataset.customWorkoutNewExercisePending === "true" ||
          expectedExerciseNumber !== nextExerciseNumber
        )
      ) {
        return;
      }

      if (isDeckRequest && panel) {
        panel.dataset.customWorkoutNewExercisePending = "true";
        window.setTimeout(() => {
          delete panel.dataset.customWorkoutNewExercisePending;
        }, 420);
      }

      const format = normalizeCustomWorkoutFormat(panel?.dataset.customWorkoutFormat || activeCustomWorkoutFormat);
      const stack = panel?.querySelector("[data-custom-workout-carousel-stack]");
      if (format !== "single" && stack) {
        const groupNumbers = customWorkoutCarousels(panel).map(carousel => Number(carousel.dataset.customWorkoutGroup) || 0);
        const groupIndex = groupNumbers.length ? Math.max(...groupNumbers) + 1 : 0;
        const startIndex = panel.querySelectorAll("[data-custom-exercise-card]").length;
        const firstCodeNumber = Number(nextCustomExerciseCode(panel).match(/\d+/)?.[0]) || 1;
        const exercises = Array.from({ length: customWorkoutDefaultExerciseCount(format) }, (_, index) => ({
          code: customExerciseCode(firstCodeNumber - 1 + index),
          name: "",
          group: groupIndex,
          groupType: format,
          prescription: "Custom sets",
          rest: ""
        }));
        stack.insertAdjacentHTML("beforeend", customWorkoutCarouselGroupMarkup(
          format, exercises, groupIndex, startIndex,
          panel.dataset.customWorkoutTitle || customWorkoutTitle,
          { panelFormat: format, isLastGroup: true }
        ));
        const newCards = Array.from(stack.lastElementChild.querySelectorAll("[data-custom-exercise-card]"));
        const sharedDate = panel.querySelector("[data-workout-date]")?.value || todayDate();
        newCards.forEach(card => {
          const logElement = card.querySelector("[data-exercise-log]");
          const date = logElement?.querySelector("[data-log-date]");
          if (date) date.value = sharedDate;
          if (logElement) updateExerciseLogField(logElement);
        });
        syncCustomWorkoutFormatMarkers(panel);
        syncCustomWorkoutCarousel(panel, { focusCard: newCards[0] });
        persistCustomWorkoutDraftFromPanel(panel);
        return;
      }
      const lists = Array.from(panel?.querySelectorAll("[data-custom-workout-list]") || []);
      const list = lists[lists.length - 1];
      const groupIndex = 0;

      if (list) {
        const nextCode = nextCustomExerciseCode(panel);
        const nextIndex = panel.querySelectorAll("[data-custom-exercise-card]").length + 1;

        list.insertAdjacentHTML("beforeend", customWorkoutCardMarkup({
          code: nextCode,
          name: "",
          group: groupIndex,
          prescription: "Custom sets",
          rest: ""
        }, panel.dataset.customWorkoutTitle || customWorkoutTitle, nextIndex - 1, {
          groupPosition: customWorkoutCarouselCards(list.closest("[data-custom-workout-carousel]")).length
        }));

        const newCard = list.querySelector("[data-custom-exercise-card]:last-child");
        const newLogElement = newCard?.querySelector("[data-exercise-log]");

        if (isDeckRequest && newCard) {
          newCard.classList.add("is-entering-deck");
          window.setTimeout(() => newCard.classList.remove("is-entering-deck"), 420);
        }

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
        customWorkoutEditableNameInput(newCard)?.focus();
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
        const workoutTitle = panel.querySelector(".panel-heading h2")?.textContent || "Workout";
        let targetList = list;

        if (format === "single") {
          addAssignedExerciseButton.insertAdjacentHTML("beforebegin", assignedWorkoutCarouselMarkup([], workoutTitle, "", "single", nextIndex, nextIndex));
          targetList = Array.from(panel.querySelectorAll("[data-assigned-workout-carousel] [data-custom-workout-list]")).at(-1) || list;
        } else if (format === "circuit") {
          targetList = panel.querySelector("[data-assigned-workout-carousel] [data-custom-workout-list]") || list;
        } else if (format === "superset") {
          let carousels = Array.from(panel.querySelectorAll("[data-assigned-workout-carousel]"));
          let targetCarousel = carousels[carousels.length - 1];

          if (!targetCarousel || customWorkoutCarouselCards(targetCarousel).length >= 2) {
            const groupIndex = carousels.length;
            addAssignedExerciseButton.insertAdjacentHTML("beforebegin", `
              <section class="workout-format-group compact-workout-group superset-group client-added-workout-group">
                ${assignedWorkoutCarouselMarkup([], workoutTitle, "", "superset", groupIndex, nextIndex)}
              </section>
            `);
            carousels = Array.from(panel.querySelectorAll("[data-assigned-workout-carousel]"));
            targetCarousel = carousels[carousels.length - 1];
          }

          targetList = targetCarousel?.querySelector("[data-custom-workout-list]") || list;
          if (targetCarousel) {
            targetCarousel.dataset.customWorkoutFormat = "superset";
            targetList.dataset.customWorkoutFormat = "superset";
          }
        }

        const cardMarkup = exerciseCard({
          code: nextCode,
          name: "",
          prescription: "Custom sets",
          rest: "",
          clientAdded: true,
          clientSetCount: 1
        }, workoutTitle, true, "", {
          exerciseIndex: nextIndex,
          format
        });

        targetList.insertAdjacentHTML("beforeend", cardMarkup);
        const newCard = targetList.querySelector("[data-assigned-exercise-card]:last-child");
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
        syncAssignedWorkoutCarousels(panel);
        const targetCarousel = newCard?.closest("[data-assigned-workout-carousel]");
        if (targetCarousel) {
          moveCustomWorkoutCarousel(
            targetCarousel,
            customWorkoutCarouselCards(targetCarousel).indexOf(newCard),
            { direction: 1 }
          );
        }
      }
    }
  });

  document.addEventListener("input", (event) => {
    const groupedField = event.target.closest("[data-custom-grouped-field]");
    const exerciseNameInput = event.target.closest("[data-exercise-name-input]");
    const setInput = event.target.closest("[data-set-label], [data-set-weight], [data-set-reps]");
    const notesInput = event.target.closest("[data-log-notes]");
    const timedLogInput = event.target.closest("[data-warmup-duration], [data-cardio-duration], [data-cardio-distance], [data-cardio-calories]");

    if (event.target.matches("[data-workout-energy]")) {
      pendingWorkoutEnergy[event.target.dataset.workoutEnergy] = Number(event.target.value);
      renderWorkoutDifficultyPrompt();
      return;
    }
    if (groupedField) {
      syncCustomWorkoutGroupedField(groupedField);
      return;
    }

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

    const groupedCarousel = exerciseNameInput.closest("[data-custom-workout-carousel]");
    const groupedIndex = Number(exerciseNameInput.dataset.customWorkoutGroupNameInput);
    const groupedCard = Number.isInteger(groupedIndex)
      ? customWorkoutCarouselCards(groupedCarousel)[groupedIndex]
      : null;
    const groupedCardInput = groupedCard?.querySelector("[data-exercise-title-name]");
    if (groupedCardInput && groupedCardInput !== exerciseNameInput) {
      groupedCardInput.value = exerciseNameInput.value;
    }
    const logElement = groupedCard?.querySelector("[data-exercise-log]") ||
      exerciseNameInput.closest("[data-exercise-log]") ||
      exerciseNameInput.closest(".workout-exercise-card")?.querySelector("[data-exercise-log]");

    syncExerciseNamePreview(logElement, exerciseNameInput.value);
    if (String(exerciseNameInput.value || "").trim()) {
      exerciseNameInput.removeAttribute("aria-invalid");
    }

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
    if (groupedCarousel?.dataset.customWorkoutGrouped === "true") {
      const accessibleIndex = Number.isInteger(groupedIndex)
        ? groupedIndex
        : customWorkoutGroupedLogElements(groupedCarousel).indexOf(logElement);
      renderCustomWorkoutGroupedExerciseKey(groupedCarousel);
      refreshCustomWorkoutGroupedCopyWeights(groupedCarousel);
      if (accessibleIndex >= 0) {
        syncCustomWorkoutGroupedAccessibleNames(groupedCarousel, accessibleIndex, exerciseNameInput.value);
      }
    }
    persistCustomWorkoutDraftForElement(logElement);
    if (groupedCarousel?.dataset.customWorkoutGrouped !== "true") {
      scheduleTrainingLogAutosave(logElement);
    }
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
    const nextExerciseOverlay = document.querySelector("[data-next-exercise-overlay]");

    if (event.key === "Tab" && customGroupedFinishPanel?.hidden === false) {
      const buttons = Array.from(customGroupedFinishPanel.querySelectorAll("button:not([disabled])"));
      const firstButton = buttons[0];
      const lastButton = buttons[buttons.length - 1];

      if (!firstButton || !lastButton) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && (event.target === firstButton || !customGroupedFinishPanel.contains(event.target))) {
        event.preventDefault();
        lastButton.focus();
        return;
      }
      if (!event.shiftKey && (event.target === lastButton || !customGroupedFinishPanel.contains(event.target))) {
        event.preventDefault();
        firstButton.focus();
        return;
      }
    }

    if (event.key === "Tab" && nextExerciseOverlay?.hidden === false) {
      const buttons = Array.from(nextExerciseOverlay.querySelectorAll("button:not([disabled])"));
      const firstButton = buttons[0];
      const lastButton = buttons[buttons.length - 1];

      if (!firstButton || !lastButton) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && (event.target === firstButton || !nextExerciseOverlay.contains(event.target))) {
        event.preventDefault();
        lastButton.focus();
        return;
      }

      if (!event.shiftKey && (event.target === lastButton || !nextExerciseOverlay.contains(event.target))) {
        event.preventDefault();
        firstButton.focus();
        return;
      }
    }

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
      return;
    }
    if (event.key === "Escape" && customGroupedFinishPanel?.hidden === false) {
      closeCustomWorkoutGroupedFinishPanel();
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
  let gesture = null;

  document.addEventListener("click", (event) => {
    if (clientWorkoutLayoutSaving) return;
    const copyHistoryLink = event.target.closest("[data-client-workout-copy-history]");

    if (copyHistoryLink) {
      openClientWorkoutCopyHistory();
      return;
    }

    const backButton = event.target.closest("[data-client-workout-picker-back]");

    if (backButton) {
      showClientWorkoutPicker();
      return;
    }

    const chooseButton = event.target.closest("[data-client-workout-picker-choose]");

    if (chooseButton) {
      activateClientWorkoutPanel(Number(chooseButton.dataset.clientWorkoutPickerChoose || 0));
      return;
    }

    if (event.target.closest("[data-client-workout-picker-previous]")) {
      moveClientWorkoutPicker(-1);
      return;
    }

    if (event.target.closest("[data-client-workout-picker-next]")) {
      moveClientWorkoutPicker(1);
      return;
    }

    const dot = event.target.closest("[data-client-workout-picker-dot]");

    if (dot) {
      setClientWorkoutPickerIndex(Number(dot.dataset.clientWorkoutPickerDot || 0));
    }
  });

  document.addEventListener("keydown", (event) => {
    const deck = event.target.closest("[data-client-workout-picker-deck]");

    if (!deck || event.target !== deck || !clientWorkoutPickerIsOpen) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveClientWorkoutPicker(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      moveClientWorkoutPicker(1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setClientWorkoutPickerIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setClientWorkoutPickerIndex(deck.querySelectorAll("[data-client-workout-picker-card]").length - 1);
    }
  });

  document.addEventListener("pointerdown", (event) => {
    const deck = event.target.closest("[data-client-workout-picker-deck]");
    const interactive = event.target.closest("button, input, select, textarea, a");

    if (!deck || interactive || !clientWorkoutPickerIsOpen) {
      gesture = null;
      return;
    }

    gesture = {
      deck,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      axis: ""
    };
  });

  document.addEventListener("pointermove", (event) => {
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const horizontalDistance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);

    if (!gesture.axis && Math.max(horizontalDistance, verticalDistance) >= 8) {
      gesture.axis = horizontalDistance > verticalDistance * 1.15 ? "horizontal" : "vertical";
    }

    if (gesture.axis === "horizontal") {
      event.preventDefault();
      applyPhysicalDeckDrag(gesture.deck, deltaX, gesture.deck.getBoundingClientRect().width);
    }
  }, { passive: false });

  document.addEventListener("pointerup", (event) => {
    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    const { deck, startX, startY, axis } = gesture;
    const step = axis === "vertical"
      ? 0
      : clientWorkoutPickerSwipeStep(
        event.clientX - startX,
        event.clientY - startY,
        deck.getBoundingClientRect().width
      );

    releasePhysicalDeckDrag(deck);
    gesture = null;
    if (step !== 0) {
      moveClientWorkoutPicker(step);
    }
  });

  document.addEventListener("pointercancel", () => {
    releasePhysicalDeckDrag(gesture?.deck);
    gesture = null;
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
    setWorkoutExerciseCardExpanded(card, !skipInput.checked);
  });
}

function renderProgram(program) {
  renderCoachPreviewReturn(program);
  const assignedWorkouts = program.assignedWorkouts || (Array.isArray(program.workouts) ? program.workouts : []);
  currentProgram = { ...program, assignedWorkouts, workouts: WorkoutLayout.apply(assignedWorkouts, program.client_workout_layout) };
  activeCustomWorkoutFormat = storedCustomWorkoutFormat();
  const displayProgram = displayProgramForCurrentView(program);
  const workouts = currentProgram.workouts;
  const programTitle = displayProgram.program_title || "Your Program";

  document.title = `${programTitle} | Fitness with Benjamin`;
  setText("#dashboard-program-title", programTitle);
  setText("#dashboard-program-summary", displayProgram.program_summary || "Your current training block is ready.");
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

let portalLoginSubmitting = false;

function portalLoginDestination(user) {
  const returnTo = new URLSearchParams(window.location.search).get("return_to");
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    const destination = new URL(returnTo, window.location.origin);
    if (destination.origin === window.location.origin && !destination.pathname.endsWith("/client-login.html")) {
      return destination.href;
    }
  }
  return isCoachPortalEmail(user?.email)
    ? "coach-admin.html?v=invite-list-layout-fix-1"
    : clientDashboardUrl;
}

async function restorePortalLogin() {
  if (!document.getElementById("client-login-form") || !supabaseClient) {
    return;
  }
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (!error && data?.session?.user && !portalLoginSubmitting) {
      window.location.replace(portalLoginDestination(data.session.user));
    }
  } catch (_error) {
    // Leave the forms available if the saved session cannot be restored yet.
  }
}

function initializeRememberMe(form) {
  const input = form.elements.remember_me;
  if (input) {
    input.checked = window.FWB_AUTH_SESSION.getRememberMe();
  }
}

async function signInToPortal(form) {
  // Finish restoring the previous session before changing its storage policy.
  await supabaseClient.auth.initialize();
  window.FWB_AUTH_SESSION.setRememberMe(Boolean(form.elements.remember_me?.checked));
  const data = new FormData(form);
  return supabaseClient.auth.signInWithPassword({ email: data.get("email"), password: data.get("password") });
}

async function handleLogin() {
  const form = document.getElementById("client-login-form");
  const status = document.getElementById("login-status");

  if (!form) {
    return;
  }

  initializeRememberMe(form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (portalLoginSubmitting) return;
    if (!supabaseClient) {
      if (status) {
        status.textContent = "Client login is being connected. Please try again soon.";
      }
      return;
    }

    if (status) {
      status.textContent = "Signing in...";
    }

    portalLoginSubmitting = true;
    try {
      const { data, error } = await signInToPortal(form);
      if (error) {
        if (status) status.textContent = "That email or password did not work. Please try again.";
        return;
      }
      window.location.href = portalLoginDestination(data.user);
    } catch (error) {
      if (status) {
        status.textContent = error.message || "Could not sign in. Please try again.";
      }
    } finally {
      portalLoginSubmitting = false;
    }
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

  initializeRememberMe(form);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (portalLoginSubmitting) return;
    if (!supabaseClient) {
      if (status) {
        status.textContent = "Coach login is being connected. Please try again soon.";
      }
      return;
    }

    if (status) {
      status.textContent = "Signing in...";
    }

    portalLoginSubmitting = true;
    try {
      const { data: loginData, error } = await signInToPortal(form);
      if (error) {
        if (status) status.textContent = "That email or password did not work. Please try again.";
        return;
      }

      if (!isCoachPortalEmail(loginData.user?.email)) {
        await supabaseClient.auth.signOut();
        if (status) status.textContent = "This login is not set up as a coach admin.";
        return;
      }

      window.location.href = portalLoginDestination(loginData.user);
    } catch (error) {
      if (status) status.textContent = error.message || "Could not sign in. Please try again.";
    } finally {
      portalLoginSubmitting = false;
    }
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

async function loadClientWorkoutLogHistory(clientEmail = activeClientEmail) {
  const pageSize = 500;
  const logs = [];

  try {
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await withTimeout(
        supabaseClient
          .from("client_workout_logs")
          .select("*")
          .ilike("client_email", clientEmail)
          .order("entry_date", { ascending: true })
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1),
        "Training log request timed out."
      );

      // A partial history could present a lower weight as an all-time record.
      if (error) return { data: null, error };

      logs.push(...(data || []));
      if (!data || data.length < pageSize) {
        return { data: logs, error: null };
      }
    }
  } catch (error) {
    return { data: null, error };
  }
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

    if (sessionError && !window.FWB_AUTH_SESSION.requiresLogin(sessionError)) {
      setDashboardMessage("Could not reconnect", "Check your connection and refresh to reopen your saved session.");
      return;
    }

    if (sessionError || !user) {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.location.href = `client-login.html?return_to=${encodeURIComponent(returnTo)}`;
      return;
    }

    activeDashboardUser = user;
    renderCoachPreviewReturn();
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    const availableTabs = new Set(Array.from(document.querySelectorAll("[data-client-dashboard-tab]"))
      .map((button) => button.dataset.clientDashboardTab));

    if (availableTabs.has(requestedTab)) {
      activeClientDashboardTab = requestedTab;
    }

    const signedInEmail = normalizeClientEmail(user.email);
    const previewEmail = dashboardClientEmailParam();
    const targetClientEmail = isCoachPortalEmail(signedInEmail) ? previewEmail : signedInEmail;
    signedInDashboardEmail = signedInEmail;
    isCoachDashboardPreview = isCoachPortalEmail(signedInEmail) && Boolean(previewEmail);
    setClientNotificationSettingsAvailable(!isCoachDashboardPreview);

    if (!targetClientEmail) {
      setDashboardMessage(
        "Choose a client",
        "Open Client View from the coach admin after selecting a client."
      );
      return;
    }

    renderClientQuestionnaire(null, "loading");

    const { data: programRows, error } = await withTimeout(
      supabaseClient
        .from("client_programs")
        .select("*")
        .eq("active", true)
        .ilike("client_email", targetClientEmail)
        .order("updated_at", { ascending: false }),
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
    configureClientAppleWorkouts();
    clientAvailablePrograms = Array.isArray(programRows) ? programRows : [];
    renderProgram(data);
    void initializeClientWebNotifications(user);
    const questionnaireQuery = supabaseClient
      .from("client_fitness_questionnaires")
      .select("id,respondent_email,respondent_name,submitted_at,answers,linked_client_email,match_status,profile_imported_at")
      .eq("match_status", "matched")
      .order("submitted_at", { ascending: false })
      .limit(1);

    if (isCoachDashboardPreview) {
      questionnaireQuery.ilike("linked_client_email", targetClientEmail);
    } else {
      questionnaireQuery.eq("linked_user_id", user.id);
    }

    const [progressResult, progressPhotoResult, dexaReportResult, trainingLogResult, workoutFeedbackResult, foodLogResult, sharedFoodLibraryResult, exerciseLibraryResult, questionnaireResult] = await Promise.allSettled([
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
          .from("client_dexa_reports")
          .select("id,client_email,storage_path,original_filename,mime_type,file_size_bytes,status,extracted_scan_date,extracted_bodyweight_lb,extracted_bodyfat_percent,extracted_lean_mass_lb,extraction_confidence,extraction_data,extraction_warnings,extraction_error,progress_entry_id,processed_at,confirmed_at,archived_at,created_at")
          .ilike("client_email", activeClientEmail)
          .order("created_at", { ascending: false }),
        "DEXA report request timed out."
      ),
      loadClientWorkoutLogHistory(activeClientEmail),
      withTimeout(
        supabaseClient
          .from("workout_session_feedback")
          .select("session_id,client_email,workout_template_id,entry_date,workout_title,difficulty_rating,energy_before,energy_after,source,source_version,client_updated_at")
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
          .from("shared_food_library")
          .select("id,food_name,brand,serving,calories,protein,carbs,fat,created_at")
          .order("created_at", { ascending: false })
          .limit(50),
        "Food library request timed out."
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
      ),
      withTimeout(
        questionnaireQuery,
        "Questionnaire request timed out."
      ),
      withTimeout(Promise.resolve(window.FWBAppleWorkout?.load()), "Apple Workout request timed out.")
    ]);

    const progressData = progressResult.status === "fulfilled" && !progressResult.value.error
      ? progressResult.value.data
      : [];
    const progressPhotoData = progressPhotoResult.status === "fulfilled" && !progressPhotoResult.value.error
      ? progressPhotoResult.value.data
      : [];
    const dexaReportData = dexaReportResult.status === "fulfilled" && !dexaReportResult.value.error
      ? dexaReportResult.value.data
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
    const sharedFoodLibraryData = sharedFoodLibraryResult.status === "fulfilled" && !sharedFoodLibraryResult.value.error
      ? sharedFoodLibraryResult.value.data
      : [];
    const exerciseLibraryData = exerciseLibraryResult.status === "fulfilled" && !exerciseLibraryResult.value.error
      ? exerciseLibraryResult.value.data
      : [];
    const questionnaireData = questionnaireResult.status === "fulfilled" && !questionnaireResult.value.error
      ? questionnaireResult.value.data
      : null;

    exerciseLibraryEntries = exerciseLibraryData || [];
    workoutSessionFeedback = workoutFeedbackData || [];

    renderProgress(progressData || []);
    renderClientProgressPhotos(await signedProgressPhotoRecords(progressPhotoData || []));
    renderClientDexaReports(dexaReportData || []);
    if (questionnaireResult.status !== "fulfilled" || questionnaireResult.value.error) {
      renderClientQuestionnaire(null, "error");
    } else {
      renderClientQuestionnaire(Array.isArray(questionnaireData) ? questionnaireData[0] || null : null);
    }
    if (progressPhotoResult.status !== "fulfilled" || progressPhotoResult.value.error) {
      setClientProgressPhotoStatus("Progress photos could not be loaded. Refresh and try again.");
    }
    if (dexaReportResult.status !== "fulfilled" || dexaReportResult.value.error) {
      setClientDexaStatus("DEXA reports could not be loaded. Refresh and try again.");
    }
    configureClientProgressAccess();
    fillFoodEntryDefaults();
    renderSharedFoodLibrary(sharedFoodLibraryData || []);
    if (sharedFoodLibraryResult.status !== "fulfilled" || sharedFoodLibraryResult.value.error) {
      setFoodLabelImportStatus("The shared food-label library could not be loaded. You can still enter food manually.");
    }
    populateFoodLogs(foodLogData || []);
    populateTrainingLogs(
      trainingLogData?.length || !shouldUseDemoTrainingLogs()
        ? trainingLogData || []
        : demoTrainingLogsForProgram(data)
    );
    refreshExerciseSuggestionsDatalist();
    window.requestAnimationFrame?.(() => maybeShowClientHomeCheckinPrompt());
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
  if (
    (
      setRow?.dataset.groupedRoundRequired === "true" ||
      setRow?.closest("[data-custom-workout-grouped-source]")
    ) &&
    !setRow.classList.contains("is-complete")
  ) {
    return false;
  }

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

function cancelTrainingLogAutosaves(container) {
  container?.querySelectorAll("[data-exercise-log]").forEach((logElement) => {
    const timer = trainingLogAutosaveTimers.get(logElement);

    if (timer) {
      window.clearTimeout(timer);
      trainingLogAutosaveTimers.delete(logElement);
    }
  });
}

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

  setWorkoutCarouselAutosaveState(logElement, "saving");

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
      const result = await saveTrainingLogRows(null, [logElement], status, {
        savingMessage: "Autosaving...",
        successMessage: "Autosaved."
      });
      setWorkoutCarouselAutosaveState(logElement, result.saved ? "saved" : "issue");
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

  const { deletedCount, error: deleteError } = options.skipRemovedSetDelete
    ? { deletedCount: 0, error: null }
    : await deleteRemovedTrainingLogRows(logElements);

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
    .filter((row) => !options.setType || row.set_type === options.setType)
    .map((row) => options.workoutCompletion
      ? { ...row, ...options.workoutCompletion }
      : row);

  if (rows.length === 0) {
    if (deletedCount > 0) {
      if (!options.skipLogRefresh) {
        logElements.forEach(updateExerciseLogField);
      } else {
        logElements.forEach(updateVisibleSetProgress);
      }
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
  if (!options.skipLogRefresh) {
    logElements.forEach(updateExerciseLogField);
  } else {
    logElements.forEach(updateVisibleSetProgress);
  }
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
    const allowIncompleteWorkoutFinish = workoutButton?.dataset.allowIncompleteWorkoutFinish === "true";

    if (workoutButton) {
      delete workoutButton.dataset.allowIncompleteWorkoutFinish;
    }

    if (!button) {
      return;
    }

    if (workoutButton) {
      const section = workoutSectionForButton(workoutButton);
      const logElements = Array.from(section?.querySelectorAll("[data-exercise-log]") || []);
      const groupedCustomWorkout = Boolean(section?.querySelector("[data-custom-workout-grouped='true']"));
      const groupedSaveOptions = groupedCustomWorkout
        ? { skipRemovedSetDelete: true, skipLogRefresh: true }
        : {};
      const status = section?.querySelector("[data-custom-grouped-status]") ||
        section?.querySelector("[data-workout-status]");

      const incompleteExercises = incompleteWorkoutExercises(logElements);

      if (incompleteExercises.length > 0 && !allowIncompleteWorkoutFinish) {
        const saveResult = await saveTrainingLogRows(finishWorkoutButton, logElements, status, {
          savingMessage: "Saving progress...",
          successMessage: "Workout progress saved.",
          ...groupedSaveOptions
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
      const difficultyTrigger = section?.querySelector("[data-custom-grouped-finish-workout]") || finishWorkoutButton;
      const workoutFeedback = await requestWorkoutDifficulty(difficultyTrigger);

      if (workoutFeedback === null) {
        if (pendingGroupedCustomWorkoutRestart?.panel === section) {
          pendingGroupedCustomWorkoutRestart = null;
        }
        return;
      }

      const workoutCompletion = workoutCompletionFields();
      const workoutDifficulty = workoutFeedback.difficulty;
      const difficultySummary = workoutHistoryDifficultyLabel(workoutDifficulty);
      const saveResult = await saveTrainingLogRows(workoutButton, logElements, status, {
        savingMessage: "Finishing workout...",
        successMessage: "Workout saved. Saving feedback...",
        workoutCompletion,
        ...groupedSaveOptions
      });

      if (!saveResult.saved) {
        if (allowIncompleteWorkoutFinish) {
          workoutButton.dataset.allowIncompleteWorkoutFinish = "true";
        }
        return;
      }

      const feedbackResult = await saveWorkoutDifficultyFeedback(saveResult.rows, workoutDifficulty, workoutFeedback);

      if (!feedbackResult.saved) {
        if (allowIncompleteWorkoutFinish) {
          workoutButton.dataset.allowIncompleteWorkoutFinish = "true";
        }
        if (status) {
          status.textContent = "Workout saved, but the workout ratings could not be saved. Tap Finish workout to try again.";
        }
        return;
      }

      renderClientTrainingLogs();
      if (status) {
        status.textContent = `Workout finished · ${difficultySummary}.`;
      }
      const groupedRestart = pendingGroupedCustomWorkoutRestart?.panel === section
        ? pendingGroupedCustomWorkoutRestart
        : null;
      pendingGroupedCustomWorkoutRestart = null;
      finishWorkoutElapsedTimer();
      if (section?.classList.contains("client-workout-panel-custom")) {
        clearCustomWorkoutDraft();
      }
      if (groupedRestart) {
        startFreshGroupedCustomWorkout(groupedRestart);
      } else {
        openWorkoutCompletionSharePrompt(
          workoutCompletionShareSummary(saveResult.rows, workoutCompletion, workoutDifficulty)
        );
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
      clearClientQuestionnaire();
      dexaReports = [];
      archivedDexaReportsExpanded = false;
      sharedFoodLibrary = [];
      hideClientDexaReview();
      renderClientDexaReports([]);
      renderSharedFoodLibrary([]);
      if (supabaseClient) {
        await clientWebNotificationController?.prepareForSignOut?.();
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
initializeRestTimerNotifications();
handleClientDashboardSidebar();
handleClientDashboardMobileNavigation();
handleLogin();
handleCoachPortalLogin();
void restorePortalLogin();
handlePasswordResetRequests();
loadDashboard();
handleSignOut();
handleTrainingDateChange();
handleClientTrainingLogDateFilter();
handleClientWorkoutHistoryDownload();
handleCopyWorkoutToCustom();
handleClientWorkoutHistoryDeck();
handleClientDashboardTabs();
handleMonthlyProgressReport();
handleClientExerciseProgressCarousel();
handleClientPastProgressEntry();
handleClientHomeCarousel();
handleClientHomeSnapshotDeck();
handleClientHomeCheckin();
handleClientSummaryActions();
handleClientWorkoutTabs();
handleClientWorkoutPreview();
handleWorkoutInteractions();
handleCustomWorkoutInlineGrouping();
handleSkipToggle();
handleTrainingLogSave();
handleWorkoutCompletionSharePrompt();
handleClientProgressHistoryDeck();
handleClientProgressHistorySelect();
handleClientProgressSave();
handleClientNutritionSave();
handleFoodBarcodeScanner();
handleFoodLabelUpload();
handleSharedFoodLibrarySelect();
handleFoodSearch();
handleFoodResultSelect();
handleFoodSave();
handleFoodDelete();
handleFoodEntryDateChange();
handleClientProgressMetricTabs();
handleClientProgressDateChange();
handleClientProgressPhotoUpload();
handleClientProgressPhotoDelete();
handleClientDexaUpload();
handleClientDexaReports();
handleClientDexaReview();
