const overviewConfig = window.FWB_SUPABASE_CONFIG || {};
const overviewCoachEmails = ["benjaminbenz.fit@gmail.com"];
const hasOverviewConfig = Boolean(
  overviewConfig.url &&
  overviewConfig.anonKey &&
  !overviewConfig.url.includes("PASTE_") &&
  !overviewConfig.anonKey.includes("PASTE_")
);
const overviewSupabase = hasOverviewConfig && window.supabase
  ? window.supabase.createClient(overviewConfig.url, overviewConfig.anonKey)
  : null;
const overviewLoginUrl = "client-login.html?v=manual-invite-copy-1";
const overviewWorkoutHistoryDays = 30;

const requestTypeLabels = {
  program_review: "Program review",
  scheduling: "Scheduling",
  pain_or_injury: "Pain or injury",
  motivation: "Motivation",
  nutrition: "Nutrition",
  other: "Other"
};

function isOverviewCoachEmail(email) {
  return overviewCoachEmails.includes(String(email || "").toLowerCase());
}

function sendToOverviewLogin() {
  window.location.href = overviewLoginUrl;
}

function normalizeOverviewEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function overviewTodayDate() {
  const now = new Date();
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60 * 1000));
  return localDate.toISOString().slice(0, 10);
}

function overviewDaysAgoDate(days) {
  const now = new Date();
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60 * 1000));
  localDate.setUTCDate(localDate.getUTCDate() - days);
  return localDate.toISOString().slice(0, 10);
}

function overviewStartOfWeekDate() {
  const now = new Date();
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60 * 1000));
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday);
  return localDate.toISOString().slice(0, 10);
}

function overviewInitials(name, email) {
  const source = String(name || "").trim() || String(email || "").split("@")[0];
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function overviewRelativeDayLabel(dateStr) {
  if (!dateStr) {
    return "No workouts logged";
  }

  const today = overviewTodayDate();

  if (dateStr === today) {
    return "Today";
  }

  const diffDays = Math.round((Date.parse(today) - Date.parse(dateStr)) / 86400000);

  if (diffDays === 1) {
    return "Yesterday";
  }

  if (diffDays > 1) {
    return `${diffDays} days ago`;
  }

  return dateStr;
}

function renderOverviewGreeting() {
  const dateEl = document.getElementById("overview-date");
  const titleEl = document.getElementById("overview-greeting-title");
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (titleEl) {
    titleEl.textContent = greeting;
  }

  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }
}

async function loadOverviewData() {
  const [programsResult, requestsResult, logsResult] = await Promise.all([
    overviewSupabase
      .from("client_programs")
      .select("client_email, client_name, program_title, session_count_used, session_count_total")
      .eq("active", true)
      .eq("client_archived", false),
    overviewSupabase
      .from("coach_requests")
      .select("id, client_email, request_type, urgency, message, created_at")
      .in("status", ["open", "in_review"])
      .order("created_at", { ascending: false }),
    overviewSupabase
      .from("client_workout_logs")
      .select("client_email, entry_date, workout_title")
      .gte("entry_date", overviewDaysAgoDate(overviewWorkoutHistoryDays))
      .order("entry_date", { ascending: false })
      .limit(2000)
  ]);

  if (programsResult.error) {
    console.error("Could not load clients.", programsResult.error);
  }

  if (requestsResult.error) {
    console.error("Could not load coach requests.", requestsResult.error);
  }

  if (logsResult.error) {
    console.error("Could not load workout logs.", logsResult.error);
  }

  const clients = programsResult.data || [];
  const requests = requestsResult.data || [];
  const logs = logsResult.data || [];

  const clientsByEmail = new Map();

  clients.forEach((client) => {
    const email = normalizeOverviewEmail(client.client_email);

    if (email) {
      clientsByEmail.set(email, client);
    }
  });

  const lastWorkoutByEmail = new Map();
  const weekStart = overviewStartOfWeekDate();
  const workoutsThisWeek = new Set();

  logs.forEach((log) => {
    const email = normalizeOverviewEmail(log.client_email);

    if (!email) {
      return;
    }

    if (!lastWorkoutByEmail.has(email)) {
      lastWorkoutByEmail.set(email, log.entry_date);
    }

    if (log.entry_date >= weekStart) {
      workoutsThisWeek.add(`${email}|${log.entry_date}|${log.workout_title}`);
    }
  });

  renderOverviewStats(clients.length, requests.length, workoutsThisWeek.size);
  renderOverviewRequests(requests, clientsByEmail);
  renderOverviewRoster(clients, lastWorkoutByEmail);
}

function renderOverviewStats(clientCount, requestCount, workoutCount) {
  const clientsEl = document.getElementById("overview-stat-clients");
  const requestsEl = document.getElementById("overview-stat-requests");
  const workoutsEl = document.getElementById("overview-stat-workouts");

  if (clientsEl) {
    clientsEl.textContent = String(clientCount);
  }

  if (requestsEl) {
    requestsEl.textContent = String(requestCount);
  }

  if (workoutsEl) {
    workoutsEl.textContent = String(workoutCount);
  }
}

function renderOverviewRequests(requests, clientsByEmail) {
  const list = document.getElementById("overview-request-list");
  const emptyState = document.getElementById("overview-requests-empty");

  if (!list) {
    return;
  }

  list.querySelectorAll("[data-overview-request]").forEach((node) => node.remove());

  if (emptyState) {
    emptyState.hidden = requests.length > 0;
  }

  requests.forEach((request) => {
    const email = normalizeOverviewEmail(request.client_email);
    const client = clientsByEmail.get(email);
    const displayName = client?.client_name || request.client_email;

    const card = document.createElement("article");
    card.className = "overview-request-card";
    card.dataset.overviewRequest = request.id;

    const avatar = document.createElement("div");
    avatar.className = "overview-avatar";
    avatar.textContent = overviewInitials(client?.client_name, request.client_email);
    card.appendChild(avatar);

    const body = document.createElement("div");
    body.className = "overview-request-body";

    const meta = document.createElement("div");
    meta.className = "overview-request-meta";

    const name = document.createElement("strong");
    name.textContent = displayName;
    meta.appendChild(name);

    const badge = document.createElement("span");
    badge.className = `overview-badge is-${request.urgency || "routine"}`;
    badge.textContent = request.urgency || "routine";
    meta.appendChild(badge);

    const type = document.createElement("span");
    type.className = "overview-request-type";
    type.textContent = requestTypeLabels[request.request_type] || "Other";
    meta.appendChild(type);

    body.appendChild(meta);

    const message = document.createElement("p");
    message.textContent = request.message || "";
    body.appendChild(message);

    card.appendChild(body);

    const resolveButton = document.createElement("button");
    resolveButton.type = "button";
    resolveButton.className = "overview-resolve-button";
    resolveButton.textContent = "Mark resolved";
    resolveButton.addEventListener("click", () => resolveOverviewRequest(request.id, card));
    card.appendChild(resolveButton);

    list.appendChild(card);
  });
}

async function resolveOverviewRequest(requestId, card) {
  if (!overviewSupabase) {
    return;
  }

  const button = card.querySelector(".overview-resolve-button");

  if (button) {
    button.disabled = true;
    button.textContent = "Saving…";
  }

  const { error } = await overviewSupabase
    .from("coach_requests")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", requestId);

  if (error) {
    console.error("Could not resolve the request.", error);

    if (button) {
      button.disabled = false;
      button.textContent = "Mark resolved";
    }

    return;
  }

  card.remove();

  const list = document.getElementById("overview-request-list");
  const emptyState = document.getElementById("overview-requests-empty");
  const statEl = document.getElementById("overview-stat-requests");
  const remaining = list ? list.querySelectorAll("[data-overview-request]").length : 0;

  if (emptyState) {
    emptyState.hidden = remaining > 0;
  }

  if (statEl) {
    statEl.textContent = String(remaining);
  }
}

function renderOverviewRoster(clients, lastWorkoutByEmail) {
  const roster = document.getElementById("overview-roster");
  const emptyState = document.getElementById("overview-roster-empty");

  if (!roster) {
    return;
  }

  roster.querySelectorAll("[data-overview-client]").forEach((node) => node.remove());

  if (emptyState) {
    emptyState.hidden = clients.length > 0;
  }

  const sortedClients = [...clients].sort((a, b) =>
    String(a.client_name || a.client_email).localeCompare(String(b.client_name || b.client_email))
  );

  sortedClients.forEach((client) => {
    const email = normalizeOverviewEmail(client.client_email);
    const lastWorkout = lastWorkoutByEmail.get(email) || null;
    const isStale = !lastWorkout || (Date.parse(overviewTodayDate()) - Date.parse(lastWorkout)) / 86400000 >= 7;

    const row = document.createElement("div");
    row.className = "overview-roster-row";
    row.dataset.overviewClient = email;

    const clientCell = document.createElement("div");
    clientCell.className = "overview-roster-client";

    const avatar = document.createElement("div");
    avatar.className = "overview-avatar";
    avatar.textContent = overviewInitials(client.client_name, client.client_email);
    clientCell.appendChild(avatar);

    const name = document.createElement("strong");
    name.textContent = client.client_name || client.client_email;
    clientCell.appendChild(name);

    row.appendChild(clientCell);

    const programCell = document.createElement("span");
    programCell.textContent = client.program_title || "No program set";
    row.appendChild(programCell);

    const sessionsCell = document.createElement("span");
    sessionsCell.textContent = `${client.session_count_used ?? 0} / ${client.session_count_total ?? 0}`;
    row.appendChild(sessionsCell);

    const lastWorkoutCell = document.createElement("span");
    lastWorkoutCell.className = isStale ? "is-stale" : "";
    lastWorkoutCell.textContent = overviewRelativeDayLabel(lastWorkout);
    row.appendChild(lastWorkoutCell);

    roster.appendChild(row);
  });
}

function handleOverviewSignOut() {
  const button = document.querySelector("[data-coach-sign-out]");

  if (!button) {
    return;
  }

  button.addEventListener("click", async () => {
    if (overviewSupabase) {
      await overviewSupabase.auth.signOut();
    }

    sendToOverviewLogin();
  });
}

async function bootOverview() {
  if (!document.querySelector(".coach-overview-page")) {
    return;
  }

  handleOverviewSignOut();

  if (!overviewSupabase) {
    const warning = document.getElementById("overview-config-warning");

    if (warning) {
      warning.hidden = false;
    }

    return;
  }

  const { data } = await overviewSupabase.auth.getSession();
  const user = data.session?.user;

  if (!user) {
    sendToOverviewLogin();
    return;
  }

  if (!isOverviewCoachEmail(user.email)) {
    await overviewSupabase.auth.signOut();
    sendToOverviewLogin();
    return;
  }

  const workspace = document.getElementById("overview-workspace");
  const signOutButton = document.querySelector("[data-coach-sign-out]");

  if (workspace) {
    workspace.hidden = false;
  }

  if (signOutButton) {
    signOutButton.hidden = false;
  }

  renderOverviewGreeting();
  await loadOverviewData();
}

bootOverview();
