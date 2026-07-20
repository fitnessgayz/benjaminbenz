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
let clientTrainingLogDateFilter = "";
let activeClientDashboardTab = "workouts";
let activeWorkoutTabIndex = 0;
let currentProgram = null;
let clientSessionSheetRequestId = 0;
const clientSessionSheetCache = new Map();
const dashboardRequestTimeout = 15000;
const customWorkoutTitle = "Custom workout";
const warmupExerciseCode = "WARMUP";
const cardioExerciseCode = "CARDIO";
const clientDashboardUrl = "client-dashboard.html?v=custom-workout-default-1";

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

function parseClientGoogleSheetReference(sheetUrl) {
  try {
    const url = new URL(String(sheetUrl || "").trim());
    const match = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);

    if (!match) {
      return null;
    }

    const hash = new URLSearchParams((url.hash || "").replace(/^#/, ""));
    const gid = url.searchParams.get("gid") || hash.get("gid") || "";

    return {
      sheetId: match[1],
      gid
    };
  } catch {
    return null;
  }
}

function clientGoogleSheetCsvUrl(sheetUrl) {
  const reference = parseClientGoogleSheetReference(sheetUrl);

  if (!reference) {
    return "";
  }

  return `https://docs.google.com/spreadsheets/d/${reference.sheetId}/export?format=csv${reference.gid ? `&gid=${reference.gid}` : ""}`;
}

function parseClientCsvRows(csvText) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }

      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows;
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

function firstClientSessionDateInRow(row) {
  for (const value of row) {
    const normalized = normalizeClientSessionDate(value);

    if (normalized) {
      return normalized;
    }
  }

  return "";
}

function clientSessionIndexInRow(row) {
  const firstValue = String(row?.[0] || "").trim();

  if (!/^\d+$/.test(firstValue)) {
    return 0;
  }

  return Number(firstValue);
}

function isLikelyClientHeaderRow(row) {
  const values = row.filter((value) => String(value || "").trim() !== "");

  return values.length > 0 &&
    values.every((value) => !normalizeClientSessionDate(value) && Number.isNaN(Number(value)));
}

function clientSessionSummaryFromRows(rows) {
  const populatedRows = rows.filter((row) => row.some((value) => String(value || "").trim() !== ""));
  const dataRows = populatedRows.length > 1 && isLikelyClientHeaderRow(populatedRows[0])
    ? populatedRows.slice(1)
    : populatedRows;
  const datedRows = dataRows.map((row) => firstClientSessionDateInRow(row.slice(1).length > 0 ? row.slice(1) : row));
  const completedCount = datedRows.filter(Boolean).length;
  const totalCount = dataRows.reduce((max, row) => Math.max(max, clientSessionIndexInRow(row)), 0) || dataRows.length;
  const recentDates = Array.from(new Set(
    datedRows.filter(Boolean)
  ))
    .sort((left, right) => right.localeCompare(left))
    .slice(0, 10);

  return {
    count: completedCount,
    totalCount,
    recentDates
  };
}

function renderClientSessionSheetState(state = {}) {
  const countPill = document.getElementById("client-session-count-pill");
  const countValue = document.getElementById("client-session-count-value");
  const countStatus = document.getElementById("client-session-count-status");
  const datesStatus = document.getElementById("client-session-dates-status");
  const dateList = document.getElementById("client-session-date-list");
  const sessionLink = document.getElementById("client-session-link");

  if (countPill) {
    countPill.textContent = state.pillMessage || "No sheet linked";
  }

  if (countValue) {
    countValue.textContent = String(state.countDisplay || state.count || "--");
  }

  if (countStatus) {
    countStatus.textContent = state.countMessage || "Add a Google Sheet link to load the count.";
  }

  if (datesStatus) {
    datesStatus.textContent = state.datesMessage || "Recent session dates will appear here.";
  }

  if (dateList) {
    if (Array.isArray(state.recentDates) && state.recentDates.length > 0) {
      dateList.innerHTML = state.recentDates.map((date) => (
        `<span class="session-date-chip">${escapeHtml(formatLogDate(date))}</span>`
      )).join("");
    } else {
      dateList.innerHTML = `<p class="empty-state">${escapeHtml(state.emptyDatesMessage || "No session dates yet.")}</p>`;
    }
  }

  if (sessionLink) {
    if (state.sheetUrl) {
      sessionLink.href = state.sheetUrl;
      sessionLink.hidden = false;
    } else {
      sessionLink.removeAttribute("href");
      sessionLink.hidden = true;
    }
  }
}

async function loadClientSessionSheetSummary(sheetUrl) {
  const trimmedUrl = String(sheetUrl || "").trim();

  if (!trimmedUrl) {
    renderClientSessionSheetState({
      count: "--",
      pillMessage: "No sheet linked",
      countMessage: "No session sheet is linked to this client.",
      datesMessage: "Recent session dates will appear here.",
      emptyDatesMessage: "No session sheet linked.",
      sheetUrl: ""
    });
    return;
  }

  const csvUrl = clientGoogleSheetCsvUrl(trimmedUrl);

  if (!csvUrl) {
    renderClientSessionSheetState({
      count: "--",
      pillMessage: "Unsupported link",
      countMessage: "This session link is not a Google Sheets URL.",
      datesMessage: "Recent session dates require a Google Sheets link.",
      emptyDatesMessage: "Session sheet format not supported yet.",
      sheetUrl: trimmedUrl
    });
    return;
  }

  if (clientSessionSheetCache.has(csvUrl)) {
    const cached = clientSessionSheetCache.get(csvUrl);

    renderClientSessionSheetState({
      count: cached.count,
      totalCount: cached.totalCount,
      countDisplay: cached.totalCount > 0 ? `${cached.count}/${cached.totalCount}` : String(cached.count),
      recentDates: cached.recentDates,
      pillMessage: cached.totalCount > 0 ? `${cached.count}/${cached.totalCount}` : `${cached.count}`,
      countMessage: "Loaded from your linked session sheet.",
      datesMessage: cached.recentDates.length > 0 ? "Most recent dates found in the sheet." : "No dates were detected in the sheet.",
      emptyDatesMessage: "No dated sessions found yet.",
      sheetUrl: trimmedUrl
    });
    return;
  }

  const requestId = ++clientSessionSheetRequestId;

  renderClientSessionSheetState({
    count: "--",
    recentDates: [],
    pillMessage: "Loading...",
    countMessage: "Loading session count...",
    datesMessage: "Reading recent session dates...",
    emptyDatesMessage: "Loading session dates...",
    sheetUrl: trimmedUrl
  });

  try {
    const response = await fetch(csvUrl);

    if (!response.ok) {
      throw new Error("Could not open the linked Google Sheet.");
    }

    const csvText = await response.text();
    const summary = clientSessionSummaryFromRows(parseClientCsvRows(csvText));

    clientSessionSheetCache.set(csvUrl, summary);

    if (requestId !== clientSessionSheetRequestId) {
      return;
    }

    renderClientSessionSheetState({
      count: summary.count,
      totalCount: summary.totalCount,
      countDisplay: summary.totalCount > 0 ? `${summary.count}/${summary.totalCount}` : String(summary.count),
      recentDates: summary.recentDates,
      pillMessage: summary.totalCount > 0 ? `${summary.count}/${summary.totalCount}` : `${summary.count}`,
      countMessage: "Loaded from your linked session sheet.",
      datesMessage: summary.recentDates.length > 0 ? "Most recent dates found in the sheet." : "No dates were detected in the sheet.",
      emptyDatesMessage: "No dated sessions found yet.",
      sheetUrl: trimmedUrl
    });
  } catch (error) {
    if (requestId !== clientSessionSheetRequestId) {
      return;
    }

    renderClientSessionSheetState({
      count: "--",
      recentDates: [],
      pillMessage: "Unavailable",
      countMessage: error.message || "Could not load the linked session sheet.",
      datesMessage: "Recent session dates could not be loaded.",
      emptyDatesMessage: "Session dates unavailable.",
      sheetUrl: trimmedUrl
    });
  }
}

function setText(selector, value) {
  const element = document.querySelector(selector);

  if (element) {
    element.textContent = value || "";
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

function youtubeExerciseSearchUrl(exerciseName) {
  const name = String(exerciseName || "").trim();

  if (!name) {
    return "";
  }

  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise demo`)}`;
}

function exerciseVideoUrl(exercise) {
  let rawUrl = String(
    exercise.video ||
    exercise.videoUrl ||
    exercise.video_url ||
    exercise.youtube_url ||
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
  return new Date().toISOString().slice(0, 10);
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

function setRowMarkup(setNumber, repPlaceholder = "") {
  return `
    <div class="set-row" data-set-row data-set-number="${setNumber}">
      <span>${setNumber}</span>
      <input type="number" min="0" step="0.5" placeholder="0" data-set-weight />
      <b>x</b>
      <input type="number" min="0" step="1" placeholder="${escapeHtml(repPlaceholder)}" data-set-reps />
      <button class="set-delete-button" type="button" data-delete-set aria-label="Delete set ${setNumber}">Delete</button>
    </div>
  `;
}

function setRows(exercise) {
  const setCount = setCountFromPrescription(exercise.prescription);
  const repTargets = repTargetsFromPrescription(exercise.prescription);

  return Array.from({ length: setCount }, (_, index) => (
    setRowMarkup(index + 1, repTargets[index] || repTargets[0] || "")
  )).join("");
}

function exerciseDisplayName(code, name) {
  return code ? `${code} ${name}` : name;
}

function syncExerciseNamePreview(logElement, nextName) {
  if (!logElement) {
    return;
  }

  const safeName = String(nextName || "").trim() || logElement.dataset.exerciseName || "";
  const displayName = exerciseDisplayName(logElement.dataset.exerciseCode || "", safeName);
  const card = logElement.closest(".workout-exercise-card");
  const summaryTitle = card?.querySelector("[data-exercise-title]");
  const detailTitle = logElement.querySelector("[data-exercise-heading]");

  if (summaryTitle) {
    summaryTitle.textContent = displayName;
  }

  if (detailTitle) {
    detailTitle.textContent = displayName;
  }
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
          <strong data-exercise-heading>${escapeHtml(exerciseDisplayName(exercise.code, exercise.name))}</strong>
          <em>${escapeHtml(exercise.prescription)}${exercise.rest ? ` · ${escapeHtml(exercise.rest)}` : ""}</em>
          <small data-set-progress>0 / ${setCount} sets completed</small>
        </div>
      ` : ""}
      <label class="exercise-name-field">
        <span>Exercise</span>
        <input type="text" value="${escapeHtml(exercise.name)}" placeholder="Exercise name" data-exercise-name-input />
      </label>
      ${exerciseVideoMarkup(exercise)}
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
        <span></span>
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
      ${showSubmit ? '<button class="complete-exercise-button" type="button" data-log-submit>Save Exercise</button>' : ""}
      <small data-log-status></small>
      <div class="previous-weights" data-previous-weights>Previous: none</div>
    </div>
  `;
}

function cardioLogFields(workoutTitle) {
  return `
    <section class="workout-cardio-card">
      <div class="workout-cardio-heading">
        <p class="kicker">Cardio</p>
        <h3>Cardio log</h3>
      </div>
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
        <label class="exercise-date">
          <span>Date</span>
          <input type="date" data-log-date />
        </label>
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
    </section>
  `;
}

function warmupLogFields(workoutTitle) {
  return `
    <section class="workout-warmup-card">
      <div class="workout-cardio-heading">
        <p class="kicker">Warm up</p>
        <h3>Warm-up log</h3>
      </div>
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
        <label class="exercise-date">
          <span>Date</span>
          <input type="date" data-log-date />
        </label>
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
    </section>
  `;
}

function exerciseCard(exercise, workoutTitle, isOpen = false, workoutFocus = "") {
  const setCount = setCountFromPrescription(exercise.prescription);

  return `
    <article class="workout-exercise-card${isOpen ? " is-open" : ""}">
      ${skipControl()}
      <button class="exercise-card-summary" type="button" data-exercise-toggle>
        <span>
          <strong data-exercise-title>${escapeHtml(exerciseDisplayName(exercise.code, exercise.name))}</strong>
          <em>${escapeHtml(exercise.prescription)}${exercise.rest ? ` · ${escapeHtml(exercise.rest)}` : ""}</em>
          <small data-set-progress>0 / ${setCount} sets completed</small>
        </span>
        <i>›</i>
      </button>
      ${exerciseLogFields(exercise, workoutTitle, { workoutFocus })}
    </article>
  `;
}

function exerciseCardRows(exercises, workoutTitle, openMode = "first", workoutFocus = "") {
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return '<p class="empty-state">Workout details will appear here when your coach adds them.</p>';
  }

  return exercises.map((exercise, index) => {
    const isOpen = openMode === "all" || (openMode === "first" && index === 0);

    return exerciseCard(exercise, workoutTitle, isOpen, workoutFocus);
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

function isCustomWorkoutTitle(value) {
  return String(value || "").trim().toLowerCase() === customWorkoutTitle;
}

function customExerciseCode(index = 0) {
  return `CW${String(index + 1).padStart(2, "0")}`;
}

function customWorkoutLogs() {
  return trainingLogs.filter((log) => (
    isCustomWorkoutTitle(log.workout_title) &&
    /^CW\d+/i.test(String(log.exercise_code || ""))
  ));
}

function customWorkoutExercises() {
  const grouped = new Map();

  customWorkoutLogs().forEach((log) => {
    const code = String(log.exercise_code || "").trim() || customExerciseCode(grouped.size);
    const exerciseName = String(log.exercise_name || "").trim();

    if (!grouped.has(code)) {
      grouped.set(code, {
        code,
        name: exerciseName || `Exercise ${grouped.size + 1}`,
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
      name: "Exercise 1",
      prescription: "Custom sets",
      rest: ""
    }];
}

function nextCustomExerciseCode(container) {
  const codes = Array.from(container?.querySelectorAll("[data-exercise-log]") || [])
    .map((element) => String(element.dataset.exerciseCode || "").match(/\d+/)?.[0])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  const nextNumber = codes.length > 0 ? Math.max(...codes) + 1 : 1;

  return customExerciseCode(nextNumber - 1);
}

function skipControl() {
  return `
    <label class="skip-toggle">
      <input type="checkbox" data-skip-card />
      <span>Skip</span>
    </label>
  `;
}

function supersetCard(group, workoutTitle, workoutFocus = "") {
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
          showSubmit: false,
          workoutFocus
        })).join("")}
        <button class="complete-exercise-button" type="button" data-superset-submit>Save Superset</button>
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

    return isPair ? supersetCard(group, workoutTitle, workout.focus) : `
      <section class="workout-format-group">
        <div class="workout-format-heading">
          <div>
            <strong>${isPair ? "Superset" : "Exercise"} ${escapeHtml(group.key)}</strong>
            <span>${countLabel}${isPair ? " · log both exercises each round" : ""}</span>
          </div>
        </div>
        ${exerciseCardRows(group.exercises, workoutTitle, "all", workout.focus)}
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
      ${exerciseCardRows(exercises, workoutTitle, "first", workout.focus)}
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

  return exerciseCardRows(workout.exercises, workoutTitle, "first", workout.focus);
}

function workoutActionsMarkup(workout, options = {}) {
  if (!options.includeCardio && (!Array.isArray(workout.exercises) || workout.exercises.length === 0)) {
    return "";
  }

  return `
    <div class="workout-actions">
      <div>
        <button class="workout-save-button" type="button" data-workout-save>Save progress</button>
        <button class="workout-finish-button" type="button" data-workout-finish>Finish and save workout</button>
      </div>
      <small data-workout-status></small>
    </div>
  `;
}

function customWorkoutCardMarkup(exercise, workoutTitle) {
  const exerciseName = String(exercise.name || "").trim() || "Custom exercise";

  return `
    <article class="workout-exercise-card custom-workout-card is-open" data-custom-exercise-card>
      <button class="exercise-card-summary" type="button" data-exercise-toggle>
        <span>
          <strong data-exercise-title>${escapeHtml(exerciseDisplayName(exercise.code, exerciseName))}</strong>
          <em>Log sets, weight, and notes.</em>
          <small data-set-progress>0 / 3 sets completed</small>
        </span>
        <i>›</i>
      </button>
      <div class="exercise-detail custom-workout-detail">
        <div class="custom-workout-card-actions">
          <span class="status-pill">Custom exercise</span>
          <button class="button button-ghost danger-button" type="button" data-remove-custom-exercise>Remove</button>
        </div>
        ${exerciseLogFields({
          code: exercise.code,
          name: exerciseName,
          prescription: exercise.prescription || "Custom sets",
          rest: exercise.rest || ""
        }, workoutTitle, {
          panelClass: "custom-exercise-log",
          showSubmit: false
        })}
      </div>
    </article>
  `;
}

function customWorkoutListMarkup() {
  const exercises = customWorkoutExercises();

  return exercises.map((exercise) => customWorkoutCardMarkup(exercise, customWorkoutTitle)).join("");
}

function customWorkoutPanelMarkup(index) {
  const exercises = customWorkoutExercises();

  return `
    <section
      class="client-workout-panel client-workout-panel-custom${index === activeWorkoutTabIndex ? " is-active" : ""}"
      id="client-workout-panel-${index}"
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
      <div class="workout-format-pill">${escapeHtml(formatLabel("custom"))}</div>
      <div class="custom-workout-builder">
        <div class="custom-workout-header">
          <p>Add your own exercises here and save them into your workout log.</p>
        </div>
        ${warmupLogFields(customWorkoutTitle)}
        <div class="workout-app-list custom-workout-list" data-custom-workout-list role="list" aria-label="Custom workout exercises">
          ${customWorkoutListMarkup()}
        </div>
        <button class="button button-ghost custom-workout-add-bottom" type="button" data-add-custom-exercise>Add exercise</button>
        ${cardioLogFields(customWorkoutTitle)}
        ${workoutActionsMarkup({ exercises }, { includeCardio: true })}
      </div>
    </section>
  `;
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
    count.textContent = `${scheduledWorkouts.length} workout${scheduledWorkouts.length === 1 ? "" : "s"}`;
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

    return `
      <section
        class="client-workout-panel${isActive ? " is-active" : ""}"
        id="client-workout-panel-${index}"
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
      <div class="workout-format-pill">${escapeHtml(formatLabel(inferWorkoutFormat(workout)))}</div>
      <div class="workout-app-list" role="list" aria-label="${escapeHtml(title)} exercises">
        ${warmupLogFields(title)}
        ${workoutExerciseMarkup(workout, title)}
        ${cardioLogFields(title)}
        ${workoutActionsMarkup(workout, { includeCardio: true })}
      </div>
    </section>
  `;
  }).join("");
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
  const exerciseNameInput = logElement.querySelector("[data-exercise-name-input]");
  const notesInput = logElement.querySelector("[data-log-notes]");
  const previous = logElement.querySelector("[data-previous-weights]");
  const card = logElement.closest(".workout-exercise-card");
  const progress = card?.matches(".superset-card")
    ? logElement.querySelector("[data-set-progress]")
    : card?.querySelector("[data-set-progress]");
  const logs = logsForExercise(logElement.dataset.workoutTitle, logElement.dataset.exerciseCode);
  const selectedDate = dateInput?.value || todayDate();
  const selectedLogs = logs.filter((log) => log.entry_date === selectedDate);
  const prescribedSets = Number(logElement.dataset.prescribedSets || 0);
  const highestLoggedSet = selectedLogs.reduce((max, log) => (
    Math.max(max, Number(log.set_number || 0))
  ), 0);

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

  ensureSetRows(logElement, Math.max(prescribedSets, highestLoggedSet));

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

  if (exerciseNameInput) {
    const loggedExerciseName = selectedLogs.find((log) => log.exercise_name)?.exercise_name || "";
    const nextName = loggedExerciseName || logElement.dataset.exerciseName || "";
    exerciseNameInput.value = nextName;
    syncExerciseNamePreview(logElement, nextName);
  }

  const completedSets = selectedLogs.filter((log) => log.weight_used !== null && log.weight_used !== undefined).length;

  if (progress) {
    const setTarget = visibleSetTarget(logElement);
    progress.textContent = `${completedSets} / ${setTarget || completedSets || 0} sets completed`;
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

  if (currentProgram) {
    renderClientWorkoutTabs(Array.isArray(currentProgram.workouts) ? currentProgram.workouts : []);
  }

  document.querySelectorAll("[data-exercise-log]").forEach((logElement) => {
    updateExerciseLogField(logElement);
  });

  renderClientTrainingLogs();
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

function renderClientTrainingLogs() {
  const history = document.getElementById("client-training-log-history");
  const count = document.getElementById("client-logs-count");

  if (!history) {
    return;
  }

  const filteredLogs = clientTrainingLogDateFilter
    ? trainingLogs.filter((log) => String(log.entry_date || "") === clientTrainingLogDateFilter)
    : trainingLogs;

  if (filteredLogs.length === 0) {
    if (count) {
      count.textContent = clientTrainingLogDateFilter ? "No logs for that date" : "No logs yet";
    }

    history.innerHTML = clientTrainingLogDateFilter
      ? '<p class="empty-state">No workout logs for that date.</p>'
      : '<p class="empty-state">No weights logged yet.</p>';
    return;
  }

  const workoutGroups = new Map();

  filteredLogs.forEach((log) => {
    const workoutKey = [
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
        supersets: new Map()
      });
    }

    const workoutGroup = workoutGroups.get(workoutKey);

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
    count.textContent = `${workoutSections.length} ${workoutSections.length === 1 ? "session" : "sessions"}`;
  }

  history.innerHTML = workoutSections.map((workout) => {
    const supersets = Array.from(workout.supersets.values()).sort((a, b) => a.key.localeCompare(b.key));

    return `
      <section class="training-log-workout-group">
        <div class="training-log-workout-heading">
          <strong>${escapeHtml(formatLogDate(workout.entry_date))}</strong>
          <span>${escapeHtml(workout.workout_title)}</span>
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
                      .sort((a, b) => Number(a.set_number || 0) - Number(b.set_number || 0))
                      .map((set) => {
                        const parts = [];

                        if (set.set_number) {
                          parts.push(`Set ${set.set_number}`);
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
    `;
  }).join("");
}

function handleClientTrainingLogDateFilter() {
  const input = document.getElementById("client-training-log-date-filter");
  const clearButton = document.getElementById("clear-client-training-log-date-filter");

  if (!input || !clearButton) {
    return;
  }

  input.addEventListener("input", () => {
    clientTrainingLogDateFilter = input.value || "";
    renderClientTrainingLogs();
  });

  clearButton.addEventListener("click", () => {
    clientTrainingLogDateFilter = "";
    input.value = "";
    renderClientTrainingLogs();
  });
}

function addSetRow(logElement) {
  const rows = logElement.querySelector("[data-set-rows]");
  const lastRow = rows?.querySelector("[data-set-row]:last-child");

  if (!rows) {
    return;
  }

  const nextSet = lastRow ? Number(lastRow.dataset.setNumber || 0) + 1 : 1;
  rows.insertAdjacentHTML("beforeend", setRowMarkup(nextSet, "0"));
  syncVisibleSetTarget(logElement);
  updateVisibleSetProgress(logElement);
}

function renumberSetRows(logElement) {
  logElement?.querySelectorAll("[data-set-row]").forEach((row, index) => {
    const setNumber = index + 1;
    row.dataset.setNumber = String(setNumber);
    const numberCell = row.querySelector("span");
    const deleteButton = row.querySelector("[data-delete-set]");

    if (numberCell) {
      numberCell.textContent = String(setNumber);
    }

    if (deleteButton) {
      deleteButton.setAttribute("aria-label", `Delete set ${setNumber}`);
    }
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

  for (let index = existingCount; index < count; index += 1) {
    rows.insertAdjacentHTML("beforeend", setRowMarkup(index + 1, "0"));
  }
}

function visibleSetTarget(logElement) {
  const rowCount = logElement?.querySelectorAll("[data-set-row]").length || 0;
  const prescribedSets = Number(logElement?.dataset.prescribedSets || 0);

  return rowCount || prescribedSets;
}

function syncVisibleSetTarget(logElement) {
  const rowCount = logElement?.querySelectorAll("[data-set-row]").length || 0;

  if (logElement && rowCount > 0) {
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
    progress.textContent = `${completedSets} / ${setTarget || completedSets || 0} sets completed`;
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
  const nextTab = tabName || "workouts";
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

function handleClientDashboardTabs() {
  document.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-client-dashboard-tab]");

    if (!tab) {
      return;
    }

    setClientDashboardTab(tab.dataset.clientDashboardTab);
  });
}

function handleWorkoutInteractions() {
  document.addEventListener("click", (event) => {
    const toggle = event.target.closest("[data-exercise-toggle]");
    const addSetButton = event.target.closest("[data-add-set]");
    const deleteSetButton = event.target.closest("[data-delete-set]");
    const addCustomExerciseButton = event.target.closest("[data-add-custom-exercise]");
    const removeCustomExerciseButton = event.target.closest("[data-remove-custom-exercise]");

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

    if (deleteSetButton) {
      const logElement = deleteSetButton.closest("[data-exercise-log]");
      const setRow = deleteSetButton.closest("[data-set-row]");
      const setRows = logElement?.querySelectorAll("[data-set-row]") || [];

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

          updateVisibleSetProgress(logElement);
          return;
        }

        setRow.remove();
        renumberSetRows(logElement);
        syncVisibleSetTarget(logElement);
        updateVisibleSetProgress(logElement);
      }
    }

    if (addCustomExerciseButton) {
      const panel = addCustomExerciseButton.closest(".client-workout-panel-custom");
      const list = panel?.querySelector("[data-custom-workout-list]");

      if (list) {
        const nextCode = nextCustomExerciseCode(list);
        const nextIndex = list.querySelectorAll("[data-custom-exercise-card]").length + 1;

        list.insertAdjacentHTML("beforeend", customWorkoutCardMarkup({
          code: nextCode,
          name: `Exercise ${nextIndex}`,
          prescription: "Custom sets",
          rest: ""
        }, customWorkoutTitle));

        const newLogElement = list.querySelector("[data-custom-exercise-card]:last-child [data-exercise-log]");

        if (newLogElement) {
          updateExerciseLogField(newLogElement);
          newLogElement.querySelector("[data-exercise-name-input]")?.focus();
        }
      }
    }

    if (removeCustomExerciseButton) {
      const panel = removeCustomExerciseButton.closest(".client-workout-panel-custom");
      const card = removeCustomExerciseButton.closest("[data-custom-exercise-card]");
      const list = panel?.querySelector("[data-custom-workout-list]");

      card?.remove();

      if (list && list.querySelectorAll("[data-custom-exercise-card]").length === 0) {
        list.innerHTML = customWorkoutCardMarkup({
          code: customExerciseCode(0),
          name: "Exercise 1",
          prescription: "Custom sets",
          rest: ""
        }, customWorkoutTitle);
        const defaultLogElement = list.querySelector("[data-exercise-log]");
        if (defaultLogElement) {
          updateExerciseLogField(defaultLogElement);
        }
      }
    }
  });

  document.addEventListener("input", (event) => {
    const exerciseNameInput = event.target.closest("[data-exercise-name-input]");

    if (!exerciseNameInput) {
      return;
    }

    syncExerciseNamePreview(
      exerciseNameInput.closest("[data-exercise-log]"),
      exerciseNameInput.value
    );
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

    card.classList.toggle("is-skipped", skipInput.checked);
    card.classList.toggle("is-open", !skipInput.checked);
  });
}

function renderProgram(program) {
  currentProgram = { ...program };
  const displayProgram = displayProgramForCurrentView(program);
  const workouts = Array.isArray(program.workouts) ? program.workouts : [];
  const sheetLink = document.getElementById("workout-sheet-link");
  const programTitle = displayProgram.program_title || "Your Program";

  document.title = `${programTitle} | Fitness with Benjamin`;
  setText("#dashboard-program-title", programTitle);
  setText("#dashboard-program-summary", displayProgram.program_summary || "Your current training block is ready.");
  setText("#client-avatar", clientInitials(displayProgram));
  setText("#client-name", displayProgram.client_name || "Client");

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
  renderWorkoutInsights(program);
  void loadClientSessionSheetSummary(program.sheet_url);
  renderClientWorkoutTabs(workouts);
  setClientDashboardTab(activeClientDashboardTab);
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

    window.location.href = clientDashboardUrl;
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

    window.location.href = "coach-admin.html?v=invite-list-layout-fix-1";
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

    const { data, error } = await withTimeout(
      supabaseClient
        .from("client_programs")
        .select("*")
        .eq("active", true)
        .maybeSingle(),
      "Program request timed out."
    );

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

    activeClientEmail = data.client_email || user.email;
    renderProgram(data);

    const [progressResult, trainingLogResult] = await Promise.allSettled([
      withTimeout(
        supabaseClient
          .from("client_progress")
          .select("*")
          .order("entry_date", { ascending: true }),
        "Progress request timed out."
      ),
      withTimeout(
        supabaseClient
          .from("client_workout_logs")
          .select("*")
          .order("entry_date", { ascending: true })
          .limit(500),
        "Training log request timed out."
      )
    ]);

    const progressData = progressResult.status === "fulfilled" && !progressResult.value.error
      ? progressResult.value.data
      : [];
    const trainingLogData = trainingLogResult.status === "fulfilled" && !trainingLogResult.value.error
      ? trainingLogResult.value.data
      : [];

    renderProgress(progressData || []);
    populateTrainingLogs(
      trainingLogData?.length || !shouldUseDemoTrainingLogs()
        ? trainingLogData || []
        : demoTrainingLogsForProgram(data)
    );
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

  const notes = logElement.querySelector("[data-log-notes]")?.value || "";
  const exerciseName = logElement.querySelector("[data-exercise-name-input]")?.value?.trim() || logElement.dataset.exerciseName;

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

function filledSetCount(logElement) {
  return Array.from(logElement.querySelectorAll("[data-set-row]"))
    .filter((setRow) => Number(setRow.querySelector("[data-set-weight]")?.value || 0) > 0)
    .length;
}

function currentExerciseLabel(logElement) {
  const editedName = logElement?.querySelector("[data-exercise-name-input]")?.value?.trim();
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

    return filledSetCount(logElement) < setTarget;
  });
}

function workoutSectionForButton(button) {
  return button.closest(".client-workout-panel, .today-panel, .lower-panel, .extra-workout-panel");
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

  button.disabled = true;
  if (status) {
    status.textContent = savingMessage;
  }

  const { deletedCount, error: deleteError } = await deleteRemovedTrainingLogRows(logElements);

  if (deleteError) {
    if (status) {
      status.textContent = "Could not save yet.";
    }
    button.disabled = false;
    return { saved: false, error: deleteError };
  }

  const rows = logElements.flatMap(rowsForTrainingLog);

  if (rows.length === 0) {
    if (deletedCount > 0) {
      logElements.forEach(updateExerciseLogField);
      renderClientTrainingLogs();

      if (status) {
        status.textContent = successMessage;
      }
      button.disabled = false;
      return { saved: true, rows: [] };
    }

    if (status) {
      status.textContent = "Enter at least one weight, warm-up duration, or cardio duration.";
    }
    button.disabled = false;
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
    button.disabled = false;
    return { saved: false, error };
  }

  (data || rows).forEach((row) => upsertLocalTrainingLog(row));
  logElements.forEach(updateExerciseLogField);
  renderClientTrainingLogs();

  if (status) {
    status.textContent = successMessage;
  }
  button.disabled = false;
  return { saved: true, rows: data || rows };
}

async function handleTrainingLogSave() {
  document.addEventListener("click", async (event) => {
    const saveWorkoutButton = event.target.closest("[data-workout-save]");
    const finishWorkoutButton = event.target.closest("[data-workout-finish]");
    const supersetButton = event.target.closest("[data-superset-submit]");
    const exerciseButton = event.target.closest("[data-log-submit]");
    const workoutButton = saveWorkoutButton || finishWorkoutButton;
    const button = workoutButton || supersetButton || exerciseButton;

    if (!button) {
      return;
    }

    if (workoutButton) {
      const section = workoutSectionForButton(workoutButton);
      const logElements = Array.from(section?.querySelectorAll("[data-exercise-log]") || []);
      const status = section?.querySelector("[data-workout-status]");

      if (finishWorkoutButton) {
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
      }

      await saveTrainingLogRows(workoutButton, logElements, status, {
        savingMessage: finishWorkoutButton ? "Finishing workout..." : "Saving workout...",
        successMessage: finishWorkoutButton ? "Workout finished." : "Workout progress saved."
      });
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
handlePasswordResetRequests();
loadDashboard();
handleSignOut();
handleTrainingDateChange();
handleClientTrainingLogDateFilter();
handleClientDashboardTabs();
handleClientWorkoutTabs();
handleWorkoutInteractions();
handleSkipToggle();
handleTrainingLogSave();
handleClientMetricSave();
