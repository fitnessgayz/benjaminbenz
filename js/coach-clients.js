const clientsConfig = window.FWB_SUPABASE_CONFIG || {};
const clientsCoachEmails = ["benjaminbenz.fit@gmail.com"];
const hasClientsConfig = Boolean(
  clientsConfig.url &&
  clientsConfig.anonKey &&
  !clientsConfig.url.includes("PASTE_") &&
  !clientsConfig.anonKey.includes("PASTE_")
);
const clientsSupabase = hasClientsConfig && window.supabase
  ? window.supabase.createClient(clientsConfig.url, clientsConfig.anonKey)
  : null;
const clientsLoginUrl = "client-login.html?v=manual-invite-copy-1";
const clientsWorkoutHistoryDays = 30;

let clientsFilter = "active";
let clientsAllRows = [];
let clientsLastWorkoutByEmail = new Map();

function isClientsCoachEmail(email) {
  return clientsCoachEmails.includes(String(email || "").toLowerCase());
}

function sendToClientsLogin() {
  window.location.href = clientsLoginUrl;
}

function normalizeClientsEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function clientsTodayDate() {
  const now = new Date();
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60 * 1000));
  return localDate.toISOString().slice(0, 10);
}

function clientsDaysAgoDate(days) {
  const now = new Date();
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60 * 1000));
  localDate.setUTCDate(localDate.getUTCDate() - days);
  return localDate.toISOString().slice(0, 10);
}

function clientsInitials(name, email) {
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

function clientsRelativeDayLabel(dateStr) {
  if (!dateStr) {
    return "No workouts logged";
  }

  const today = clientsTodayDate();

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

async function loadClientsData() {
  const [programsResult, logsResult] = await Promise.all([
    clientsSupabase
      .from("client_programs")
      .select("client_email, client_name, program_title, session_count_used, session_count_total, active, client_archived"),
    clientsSupabase
      .from("client_workout_logs")
      .select("client_email, entry_date")
      .gte("entry_date", clientsDaysAgoDate(clientsWorkoutHistoryDays))
      .order("entry_date", { ascending: false })
      .limit(2000)
  ]);

  if (programsResult.error) {
    console.error("Could not load clients.", programsResult.error);
  }

  if (logsResult.error) {
    console.error("Could not load workout logs.", logsResult.error);
  }

  clientsAllRows = programsResult.data || [];

  clientsLastWorkoutByEmail = new Map();
  (logsResult.data || []).forEach((log) => {
    const email = normalizeClientsEmail(log.client_email);

    if (email && !clientsLastWorkoutByEmail.has(email)) {
      clientsLastWorkoutByEmail.set(email, log.entry_date);
    }
  });

  renderClientsRoster();
}

function clientsMatchesFilter(client) {
  if (clientsFilter === "all") {
    return true;
  }

  if (clientsFilter === "archived") {
    return client.client_archived === true;
  }

  return client.client_archived !== true;
}

function clientsMatchesSearch(client, query) {
  if (!query) {
    return true;
  }

  const haystack = `${client.client_name || ""} ${client.client_email || ""}`.toLowerCase();

  return haystack.includes(query);
}

function renderClientsRoster() {
  const roster = document.getElementById("clients-roster");
  const emptyState = document.getElementById("clients-empty");

  if (!roster) {
    return;
  }

  roster.querySelectorAll("[data-clients-row]").forEach((node) => node.remove());

  const searchInput = document.getElementById("clients-search");
  const query = (searchInput?.value || "").trim().toLowerCase();

  const rows = clientsAllRows
    .filter((client) => clientsMatchesFilter(client))
    .filter((client) => clientsMatchesSearch(client, query))
    .sort((a, b) => String(a.client_name || a.client_email).localeCompare(String(b.client_name || b.client_email)));

  if (emptyState) {
    emptyState.hidden = rows.length > 0;
  }

  rows.forEach((client) => {
    const email = normalizeClientsEmail(client.client_email);
    const lastWorkout = clientsLastWorkoutByEmail.get(email) || null;
    const isStale = !lastWorkout || (Date.parse(clientsTodayDate()) - Date.parse(lastWorkout)) / 86400000 >= 7;

    const row = document.createElement("div");
    row.className = "overview-roster-row overview-roster-row-wide";
    row.dataset.clientsRow = email;

    const clientCell = document.createElement("div");
    clientCell.className = "overview-roster-client";

    const avatar = document.createElement("div");
    avatar.className = "overview-avatar";
    avatar.textContent = clientsInitials(client.client_name, client.client_email);
    clientCell.appendChild(avatar);

    const name = document.createElement("strong");
    name.textContent = client.client_name || client.client_email;
    clientCell.appendChild(name);

    if (client.client_archived) {
      const archivedTag = document.createElement("span");
      archivedTag.className = "overview-badge is-routine";
      archivedTag.textContent = "Archived";
      clientCell.appendChild(archivedTag);
    }

    row.appendChild(clientCell);

    const emailCell = document.createElement("span");
    emailCell.textContent = client.client_email || "";
    row.appendChild(emailCell);

    const programCell = document.createElement("span");
    programCell.textContent = client.program_title || "No program set";
    row.appendChild(programCell);

    const sessionsCell = document.createElement("span");
    sessionsCell.textContent = `${client.session_count_used ?? 0} / ${client.session_count_total ?? 0}`;
    row.appendChild(sessionsCell);

    const lastWorkoutCell = document.createElement("span");
    lastWorkoutCell.className = isStale ? "is-stale" : "";
    lastWorkoutCell.textContent = clientsRelativeDayLabel(lastWorkout);
    row.appendChild(lastWorkoutCell);

    const actionCell = document.createElement("a");
    actionCell.className = "text-link";
    actionCell.href = "coach-admin.html";
    actionCell.textContent = "Open";
    row.appendChild(actionCell);

    roster.appendChild(row);
  });
}

function handleClientsSearch() {
  const input = document.getElementById("clients-search");

  if (!input) {
    return;
  }

  input.addEventListener("input", () => {
    renderClientsRoster();
  });
}

function handleClientsFilterToggle() {
  const buttons = document.querySelectorAll("[data-clients-filter]");

  if (buttons.length === 0) {
    return;
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      clientsFilter = button.dataset.clientsFilter;
      buttons.forEach((other) => other.classList.toggle("is-active", other === button));
      renderClientsRoster();
    });
  });
}

function handleClientsSignOut() {
  const button = document.querySelector("[data-coach-sign-out]");

  if (!button) {
    return;
  }

  button.addEventListener("click", async () => {
    if (clientsSupabase) {
      await clientsSupabase.auth.signOut();
    }

    sendToClientsLogin();
  });
}

async function bootClients() {
  if (!document.querySelector(".coach-clients-page")) {
    return;
  }

  handleClientsSignOut();
  handleClientsSearch();
  handleClientsFilterToggle();

  if (!clientsSupabase) {
    const warning = document.getElementById("clients-config-warning");

    if (warning) {
      warning.hidden = false;
    }

    return;
  }

  const { data } = await clientsSupabase.auth.getSession();
  const user = data.session?.user;

  if (!user) {
    sendToClientsLogin();
    return;
  }

  if (!isClientsCoachEmail(user.email)) {
    await clientsSupabase.auth.signOut();
    sendToClientsLogin();
    return;
  }

  const workspace = document.getElementById("clients-workspace");
  const signOutButton = document.querySelector("[data-coach-sign-out]");

  if (workspace) {
    workspace.hidden = false;
  }

  if (signOutButton) {
    signOutButton.hidden = false;
  }

  await loadClientsData();
}

bootClients();
