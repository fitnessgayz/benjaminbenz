const coachConfig = window.FWB_SUPABASE_CONFIG || {};
const coachEmails = ["benjaminbenz.fit@gmail.com"];
const hasCoachConfig = Boolean(
  coachConfig.url &&
  coachConfig.anonKey &&
  !coachConfig.url.includes("PASTE_") &&
  !coachConfig.anonKey.includes("PASTE_")
);
const coachSupabase = hasCoachConfig && window.supabase
  ? window.supabase.createClient(coachConfig.url, coachConfig.anonKey)
  : null;
const workoutSlots = [1, 2, 3, 4, 5, 6, 7];
const coachLoginUrl = "client-login.html?v=manual-invite-copy-1";
const warmupExerciseCode = "WARMUP";
const cardioExerciseCode = "CARDIO";

let programs = [];
let selectedProgramId = "";
let progressEntries = [];
let trainingLogs = [];
let recentTrainingLogs = [];
let trainingLogDateFilter = "";
let showingArchivedClients = false;
let clientSearchTerm = "";
let activeAdminTab = "clients";
let pendingProgramCopy = null;

function adminStatus(message) {
  const status = document.getElementById("admin-save-status");

  if (status) {
    status.textContent = message;
  }
}

async function withSlowStatus(promise, message, onSlow, delayMs = 12000) {
  const delayId = window.setTimeout(() => {
    if (typeof onSlow === "function") {
      onSlow(message);
    }
  }, delayMs);

  try {
    return await promise;
  } finally {
    window.clearTimeout(delayId);
  }
}

function withRequestTimeout(promise, message, timeoutMs = 15000) {
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

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function setClientInviteBusy(isBusy) {
  const saveButton = document.getElementById("save-client-button");
  const inviteButton = document.getElementById("send-invite-button");

  if (saveButton) {
    saveButton.disabled = isBusy;
  }

  if (inviteButton) {
    inviteButton.disabled = isBusy;
  }
}

function errorMentionsMissingColumn(error, columnName) {
  const message = String(error?.message || error?.details || "");

  return message.includes(columnName) && (
    message.includes("column") ||
    message.includes("schema cache") ||
    message.includes("Could not find")
  );
}

async function insertCopiedProgram(payload) {
  const insertPayload = { ...payload };
  let result = await coachSupabase
    .from("client_programs")
    .insert(insertPayload)
    .select("*")
    .single();

  if (result.error && errorMentionsMissingColumn(result.error, "client_phone")) {
    delete insertPayload.client_phone;
    result = await coachSupabase
      .from("client_programs")
      .insert(insertPayload)
      .select("*")
      .single();
  }

  return result;
}

function sendToCoachLogin() {
  window.location.href = coachLoginUrl;
}

function inviteRedirectUrl() {
  if (window.location.hostname === "benjaminbenz.com" || window.location.hostname === "www.benjaminbenz.com") {
    return `${window.location.origin}/client-invite.html`;
  }

  return "https://benjaminbenz.com/client-invite.html";
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function programsForClientRecord(program) {
  const normalizedEmail = normalizeEmail(program?.client_email);

  if (!normalizedEmail) {
    return program?.id ? [program] : [];
  }

  const matches = programs.filter((item) => normalizeEmail(item.client_email) === normalizedEmail);

  return matches.length > 0 ? matches : (program?.id ? [program] : []);
}

function clientProgramIds(program) {
  return programsForClientRecord(program)
    .map((item) => item.id)
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function toUtcIsoDateString(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function normalizeSessionDate(value) {
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

      return toUtcIsoDateString(date);
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

  return toUtcIsoDateString(parsed);
}

function formatSessionDate(value) {
  const normalized = normalizeSessionDate(value);

  if (!normalized) {
    return "";
  }

  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  });
}

function normalizeSessionCount(value) {
  const number = Number(String(value ?? "").trim());

  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function trustedSheetUrl(value) {
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

function sessionDatesFromText(value) {
  return Array.from(new Set(
    String(value || "")
      .split(/\n|;/)
      .map((item) => normalizeSessionDate(item))
      .filter(Boolean)
  ));
}

function sessionDatesFromProgram(program = {}) {
  if (!Array.isArray(program.session_dates)) {
    return [];
  }

  return Array.from(new Set(
    program.session_dates
      .map((item) => normalizeSessionDate(item))
      .filter(Boolean)
  ));
}

function sessionPackageDatesFromText(value) {
  return Array.from(new Set(
    String(value || "")
      .split(/\n|;/)
      .map((item) => normalizeSessionDate(item))
      .filter(Boolean)
  ));
}

function sessionDatesToText(dates) {
  return (Array.isArray(dates) ? dates : [])
    .map((date) => formatSessionDate(date) || String(date || "").trim())
    .filter(Boolean)
    .join("\n");
}

function sessionPackageHistoryFromProgram(program = {}) {
  if (!Array.isArray(program.session_package_history)) {
    return [];
  }

  return program.session_package_history
    .map((item, index) => {
      const source = item && typeof item === "object" ? item : {};
      const used = normalizeSessionCount(source.used);
      const total = normalizeSessionCount(source.total);
      const archivedAt = normalizeSessionDate(source.archived_at || source.archivedAt);
      const recentDates = Array.isArray(source.dates)
        ? Array.from(new Set(source.dates.map((date) => normalizeSessionDate(date)).filter(Boolean)))
        : [];

      return {
        label: String(source.label || `Package ${index + 1}`).trim(),
        used,
        total,
        dates: recentDates,
        archived_at: archivedAt || new Date().toISOString().slice(0, 10)
      };
    })
    .filter((item) => item.used > 0 || item.total > 0 || item.dates.length > 0)
    .slice(0, 20);
}

function sessionPackageHistoryToFormValue(history) {
  return JSON.stringify(sessionPackageHistoryFromProgram({ session_package_history: history }));
}

function sessionPackageHistoryFromForm(form) {
  try {
    return sessionPackageHistoryFromProgram({
      session_package_history: JSON.parse(formValue(form, "session_package_history") || "[]")
    });
  } catch (error) {
    return [];
  }
}

function sessionSummaryFromProgram(program = {}) {
  const used = normalizeSessionCount(program.session_count_used);
  const total = normalizeSessionCount(program.session_count_total);
  const recentDates = sessionDatesFromProgram(program);
  const countDisplay = total > 0 ? `${used}/${total}` : (used > 0 ? String(used) : "--");

  return {
    used,
    total,
    countDisplay,
    recentDates
  };
}

function syncSessionEditor(program = {}) {
  const usedInput = document.getElementById("session-count-used-input");
  const totalInput = document.getElementById("session-count-total-input");
  const datesInput = document.getElementById("session-dates-input");
  const sheetUrlInput = document.getElementById("session-sheet-url-input");

  if (usedInput && document.activeElement !== usedInput) {
    usedInput.value = program.session_count_used || "";
  }

  if (totalInput && document.activeElement !== totalInput) {
    totalInput.value = program.session_count_total || "";
  }

  if (datesInput && document.activeElement !== datesInput) {
    datesInput.value = sessionDatesToText(sessionDatesFromProgram(program));
  }

  if (sheetUrlInput && document.activeElement !== sheetUrlInput) {
    sheetUrlInput.value = trustedSheetUrl(program.sheet_url);
  }
}

function renderSessionManualState(program = {}, options = {}) {
  const isExistingClient = options.isExistingClient !== false;
  const summary = sessionSummaryFromProgram(program);
  const summaryCard = document.getElementById("selected-session-count");
  const summaryValue = document.getElementById("selected-session-count-value");
  const programCount = document.getElementById("program-session-count");
  const panelCount = document.getElementById("session-sheet-count-value");
  const panelStatus = document.getElementById("session-sheet-count-status");
  const panelDatesStatus = document.getElementById("session-sheet-dates-status");
  const panelDateList = document.getElementById("session-sheet-date-list");
  const sheetLinkCard = document.getElementById("session-sheet-link-card");
  const sheetLink = document.getElementById("session-sheet-link-text");
  const historyStatus = document.getElementById("session-package-history-status");
  const historyList = document.getElementById("session-package-history-list");
  const sheetUrl = trustedSheetUrl(program.sheet_url);
  const packageHistory = sessionPackageHistoryFromProgram(program);

  if (summaryCard) {
    summaryCard.hidden = !isExistingClient || summary.countDisplay === "--";
  }

  if (summaryValue) {
    summaryValue.textContent = isExistingClient ? summary.countDisplay : "--";
  }

  if (programCount) {
    programCount.textContent = isExistingClient
      ? (summary.countDisplay === "--" ? "No sessions entered yet." : `${summary.countDisplay} sessions`)
      : "Save the client first, then add sessions.";
  }

  if (panelCount) {
    panelCount.textContent = isExistingClient ? summary.countDisplay : "--";
  }

  if (panelStatus) {
    if (!isExistingClient) {
      panelStatus.textContent = "Save the client first to track sessions.";
    } else if (summary.countDisplay === "--") {
      panelStatus.textContent = "No sessions entered yet.";
    } else if (summary.total > 0) {
      panelStatus.textContent = `${summary.used} used out of ${summary.total} sessions.`;
    } else {
      panelStatus.textContent = `${summary.used} sessions used.`;
    }
  }

  if (panelDatesStatus) {
    panelDatesStatus.textContent = summary.recentDates.length > 0
      ? "Session dates added manually."
      : "Add session dates manually.";
  }

  if (panelDateList) {
    if (summary.recentDates.length > 0) {
      panelDateList.innerHTML = summary.recentDates.map((date) => (
        `<span class="session-date-chip">${escapeHtml(formatSessionDate(date))}</span>`
      )).join("");
    } else {
      panelDateList.innerHTML = `<p class="empty-state">${isExistingClient ? "No session dates yet." : "No client selected."}</p>`;
    }
  }

  if (sheetLinkCard) {
    sheetLinkCard.hidden = !isExistingClient || !sheetUrl;
  }

  if (sheetLink && sheetUrl) {
    sheetLink.href = sheetUrl;
  }

  if (historyStatus) {
    historyStatus.textContent = packageHistory.length > 0
      ? `${packageHistory.length} old package${packageHistory.length === 1 ? "" : "s"} archived.`
      : "Old packages appear after starting a new package.";
  }

  if (historyList) {
    if (packageHistory.length > 0) {
      historyList.innerHTML = packageHistory.map((item, index) => {
        const count = item.total > 0 ? `${item.used}/${item.total}` : `${item.used} used`;
        const dates = item.dates.length > 0
          ? `<div class="session-date-list">${item.dates.map((date) => (
            `<span class="session-date-chip">${escapeHtml(formatSessionDate(date))}</span>`
          )).join("")}</div>`
          : '<p class="empty-state">No dates archived for this package.</p>';

        return `
          <article class="session-package-history-card">
            <header>
              <div>
                <strong>${escapeHtml(item.label || `Package ${index + 1}`)}</strong>
                <small>Archived ${escapeHtml(formatSessionDate(item.archived_at))}</small>
              </div>
              <span>${escapeHtml(count)}</span>
            </header>
            ${dates}
          </article>
        `;
      }).join("");
    } else {
      historyList.innerHTML = `<p class="empty-state">${isExistingClient ? "No archived packages yet." : "No client selected."}</p>`;
    }
  }

  syncSessionEditor(program);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function readableInviteMessage(message, manualInviteUrl = "") {
  const text = String(message || "").trim();
  const unhelpfulMessages = new Set(["{}", "[]", "null", "undefined", "[object Object]"]);

  if (!text || unhelpfulMessages.has(text)) {
    return manualInviteUrl
      ? "Email did not send automatically. Copy the invite link and send it to the client."
      : "Could not send invite. Check Supabase Auth logs for the exact email error.";
  }

  return text;
}

function readableClientRequestError(error, fallbackMessage) {
  const message = String(error?.message || error || "").trim();
  const lowerMessage = message.toLowerCase();

  if (
    !message ||
    lowerMessage === "load failed" ||
    lowerMessage.includes("failed to fetch") ||
    lowerMessage.includes("networkerror")
  ) {
    return fallbackMessage;
  }

  return message;
}

function inviteStatus(message, manualInviteUrl = "") {
  const status = document.getElementById("invite-status");

  if (status) {
    status.textContent = "";

    const messageNode = document.createElement("span");
    messageNode.textContent = readableInviteMessage(message, manualInviteUrl);
    status.append(messageNode);

    if (manualInviteUrl) {
      const link = document.createElement("a");
      const copyButton = document.createElement("button");

      link.href = manualInviteUrl;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Open invite link";
      copyButton.className = "text-button";
      copyButton.type = "button";
      copyButton.textContent = "Copy invite link";
      copyButton.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(manualInviteUrl);
          messageNode.textContent = "Invite link copied. Paste it into a text or email to send it to the client.";
        } catch {
          messageNode.textContent = "Could not copy automatically. Open the invite link and copy it from the address bar.";
        }
      });

      const actions = document.createElement("span");
      actions.className = "invite-link-actions";
      actions.append(copyButton, link);
      status.append(actions);
    }
  }
}

function progressStatus(message) {
  const status = document.getElementById("progress-status");

  if (status) {
    status.textContent = message;
  }
}

function coachNotesStatus(message) {
  const status = document.getElementById("coach-notes-status");

  if (status) {
    status.textContent = message;
  }
}

function trainingBlockStatus(message) {
  const status = document.getElementById("training-block-status");

  if (status) {
    status.textContent = message;
  }
}

function workoutsStatus(message) {
  const status = document.getElementById("workouts-status");

  if (status) {
    status.textContent = message;
  }
}

function trainingLogStatus(message) {
  const history = document.getElementById("training-log-history");

  if (history) {
    history.innerHTML = `<p class="empty-state">${message}</p>`;
  }
}

function profileManagementStatus(message) {
  const status = document.getElementById("profile-management-status");

  if (status) {
    status.textContent = message;
  }
}

function programHistoryStatus(message) {
  const status = document.getElementById("program-history-status");

  if (status) {
    status.textContent = message;
  }
}

function searchableClientText(program) {
  return [
    program.client_name,
    program.client_email,
    program.client_phone,
    program.program_title
  ].join(" ").toLowerCase();
}

function selectedProgram() {
  return programs.find((program) => program.id === selectedProgramId);
}

function setAdminTab(tabName) {
  const nextTab = tabName || "profile";

  activeAdminTab = nextTab;
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    const isActive = button.dataset.adminTab === nextTab;

    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.adminPanel !== nextTab;
  });

  if (nextTab === "clients") {
    loadRecentTrainingLogs();
  }

  if (nextTab === "progress") {
    const email = normalizeEmail(selectedProgram()?.client_email);

    if (email) {
      loadTrainingLogsForEmail(email);
    } else {
      renderSelectedClientTrainingLogs();
    }
  }
}

function workoutSummaryFromForm(form, number) {
  const title = formValue(form, `workout_${number}_title`) || `Workout ${number}`;
  const focus = formValue(form, `workout_${number}_focus`);
  const exercises = parseExercises(formValue(form, `workout_${number}_exercises`)).length;
  const included = form.elements[`workout_${number}_include`]?.checked;
  const exerciseLabel = `${exercises} exercise${exercises === 1 ? "" : "s"}`;

  return [
    included ? "Included" : "Off",
    focus || title,
    exerciseLabel
  ].filter(Boolean).join(" · ");
}

function updateWorkoutSummaries() {
  const form = document.getElementById("program-editor");

  if (!form) {
    return;
  }

  workoutSlots.forEach((number) => {
    const summary = document.querySelector(`[data-workout-summary="${number}"]`);

    if (summary) {
      summary.textContent = workoutSummaryFromForm(form, number);
    }
  });
}

function updateSelectedClientSummary(program = selectedProgram()) {
  const form = document.getElementById("program-editor");
  const name = document.getElementById("selected-client-name");
  const email = document.getElementById("selected-client-email");
  const meta = document.getElementById("selected-client-meta");
  const saveButton = document.getElementById("selected-save-profile-button");
  const profileArchiveButton = document.getElementById("profile-archive-client-button");
  const profileDeleteButton = document.getElementById("profile-delete-client-button");
  const clientName = formValue(form, "client_name") || program?.client_name || "Choose a client";
  const clientEmail = formValue(form, "client_email") || program?.client_email || "Search or create a client to start editing.";
  const clientPhone = formValue(form, "client_phone") || program?.client_phone || "";
  const sessionProgram = {
    ...program,
    session_count_used: form?.elements.session_count_used?.value ?? program?.session_count_used,
    session_count_total: form?.elements.session_count_total?.value ?? program?.session_count_total,
    session_dates: form?.elements.session_dates
      ? sessionDatesFromText(formValue(form, "session_dates"))
      : sessionDatesFromProgram(program),
    sheet_url: form?.elements.sheet_url?.value ?? program?.sheet_url,
    session_package_history: form?.elements.session_package_history?.value
      ? sessionPackageHistoryFromForm(form)
      : sessionPackageHistoryFromProgram(program)
  };
  const isExistingClient = Boolean(form?.elements.id?.value || program?.id);
  const isActive = form?.elements.active ? form.elements.active.checked : program?.active !== false;
  const status = program?.client_archived
    ? "Archived"
    : !isActive
      ? "Inactive"
      : isExistingClient
        ? "Active"
        : "Draft";
  const programTitle = formValue(form, "program_title") || program?.program_title || "No program title";

  if (name) {
    name.textContent = clientName;
  }

  if (email) {
    email.textContent = clientEmail;
  }

  if (meta) {
    const statusNode = document.createElement("span");
    const titleNode = document.createElement("span");

    statusNode.textContent = status;
    titleNode.textContent = programTitle;

    if (clientPhone) {
      const phoneNode = document.createElement("span");

      phoneNode.textContent = clientPhone;
      meta.replaceChildren(statusNode, titleNode, phoneNode);
    } else {
      meta.replaceChildren(statusNode, titleNode);
    }
  }

  if (saveButton) {
    saveButton.disabled = !isExistingClient;
  }

  if (profileArchiveButton) {
    profileArchiveButton.disabled = !isExistingClient;
    profileArchiveButton.textContent = program?.client_archived ? "Restore client" : "Archive client";
  }

  if (profileDeleteButton) {
    profileDeleteButton.disabled = !isExistingClient;
  }

  renderSessionManualState(sessionProgram, { isExistingClient });

  if (!isExistingClient) {
    profileManagementStatus("Save this client first, then archive or delete them.");
  } else if (program?.client_archived) {
    profileManagementStatus("This client is archived. Restore or delete them from this profile.");
  } else {
    profileManagementStatus("This client is active. Archive or delete them from this profile.");
  }
}

function programsForCurrentClientView() {
  const basePrograms = showingArchivedClients
    ? archivedClientPrograms()
    : activeClientPrograms();

  if (!clientSearchTerm) {
    return basePrograms;
  }

  return basePrograms.filter((program) => searchableClientText(program).includes(clientSearchTerm));
}

function archivedClientPrograms() {
  const archivedByEmail = new Map();

  programs
    .filter((program) => program.client_archived === true)
    .forEach((program) => {
      const email = normalizeEmail(program.client_email);
      const existing = archivedByEmail.get(email);

      if (!existing) {
        archivedByEmail.set(email, program);
        return;
      }

      if (program.active && !existing.active) {
        archivedByEmail.set(email, program);
        return;
      }

      const programDate = String(program.updated_at || program.created_at || "");
      const existingDate = String(existing.updated_at || existing.created_at || "");

      if (programDate > existingDate) {
        archivedByEmail.set(email, program);
      }
    });

  return Array.from(archivedByEmail.values())
    .sort((a, b) => String(a.client_name).localeCompare(String(b.client_name)));
}

function activeClientPrograms() {
  const clientsByEmail = new Map();

  programs
    .filter((program) => program.client_archived !== true)
    .forEach((program) => {
      const email = normalizeEmail(program.client_email);

      if (!email) {
        return;
      }

      const existing = clientsByEmail.get(email);

      if (!existing) {
        clientsByEmail.set(email, program);
        return;
      }

      if (program.active !== false && existing.active === false) {
        clientsByEmail.set(email, program);
        return;
      }

      if (existing.active !== false && program.active === false) {
        return;
      }

      const programDate = String(program.updated_at || program.created_at || "");
      const existingDate = String(existing.updated_at || existing.created_at || "");

      if (programDate > existingDate) {
        clientsByEmail.set(email, program);
      }
    });

  return Array.from(clientsByEmail.values())
    .sort((a, b) => String(a.client_name || a.client_email).localeCompare(String(b.client_name || b.client_email)));
}

function activeClientOptionsForCopy(sourceEmail = "") {
  const source = normalizeEmail(sourceEmail);
  const clientsByEmail = new Map();

  activeClientPrograms()
    .forEach((program) => {
      const email = normalizeEmail(program.client_email);

      if (!email || email === source || clientsByEmail.has(email)) {
        return;
      }

      clientsByEmail.set(email, program);
    });

  return Array.from(clientsByEmail.values())
    .sort((a, b) => String(a.client_name || a.client_email).localeCompare(String(b.client_name || b.client_email)));
}

function isCoachEmail(email) {
  return coachEmails.includes(String(email || "").toLowerCase());
}

function initialsFromName(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function parseExercises(value) {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [code = "", name = "", prescription = "", rest = "", musclesOrVideo = "", videoUrl = ""] = line.split("|").map((part) => part.trim());
      const fifthFieldIsVideo = /^https?:\/\//i.test(musclesOrVideo) ||
        /^(www\.|m\.)?(youtube\.com|youtube-nocookie\.com|youtu\.be)\//i.test(musclesOrVideo);
      const muscles = fifthFieldIsVideo ? "" : musclesOrVideo;
      const video = fifthFieldIsVideo ? musclesOrVideo : videoUrl || youtubeExerciseSearchUrl(name);

      return { code, name, prescription, rest, muscles, video };
    });
}

function youtubeExerciseSearchUrl(exerciseName) {
  const name = String(exerciseName || "").trim();

  if (!name) {
    return "";
  }

  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} exercise demo`)}`;
}

function exercisesToText(exercises) {
  if (!Array.isArray(exercises)) {
    return "";
  }

  return exercises
    .map((exercise) => {
      const fields = [
        exercise.code || "",
        exercise.name || "",
        exercise.prescription || "",
        exercise.rest || ""
      ];
      const video = exercise.video || exercise.videoUrl || exercise.video_url || exercise.youtube_url || "";

      if (exercise.muscles || video) {
        fields.push(exercise.muscles);
      }

      if (video) {
        fields.push(video);
      }

      return fields.join(" | ");
    })
    .join("\n");
}

function normalizeWorkoutFormat(value) {
  const format = String(value || "").toLowerCase();

  if (format.includes("super")) {
    return "superset";
  }

  if (format.includes("circuit")) {
    return "circuit";
  }

  return "single";
}

function formValue(form, name) {
  return form.elements[name]?.value?.trim() || "";
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function numberOrNull(value) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function buildWorkoutFromForm(form, number) {
  return {
    title: formValue(form, `workout_${number}_title`) || `Workout ${number}`,
    focus: formValue(form, `workout_${number}_focus`),
    format: formValue(form, `workout_${number}_format`) || "single",
    exercises: parseExercises(formValue(form, `workout_${number}_exercises`))
  };
}

function workoutIsIncluded(form, number) {
  return Boolean(form.elements[`workout_${number}_include`]?.checked);
}

function programFromForm(form) {
  const clientName = formValue(form, "client_name");
  const clientEmail = formValue(form, "client_email").toLowerCase();
  const fallbackClientName = clientEmail ? clientEmail.split("@")[0] : "";
  const existingProgram = programs.find((program) => program.id === form.elements.id.value);
  const workouts = workoutSlots
    .filter((number) => workoutIsIncluded(form, number))
    .map((number) => buildWorkoutFromForm(form, number))
    .filter((workout) => workout.title || workout.focus || workout.exercises.length);

  return {
    client_email: clientEmail,
    client_name: clientName || fallbackClientName || "Client",
    client_phone: formValue(form, "client_phone"),
    initials: formValue(form, "initials") || initialsFromName(clientName || fallbackClientName),
    program_title: formValue(form, "program_title") || "Client Program",
    program_summary: formValue(form, "program_summary"),
    session_count_used: normalizeSessionCount(formValue(form, "session_count_used")),
    session_count_total: normalizeSessionCount(formValue(form, "session_count_total")),
    session_dates: sessionDatesFromText(formValue(form, "session_dates")),
    sheet_url: trustedSheetUrl(formValue(form, "sheet_url")) || null,
    session_package_history: sessionPackageHistoryFromForm(form),
    fitness_goal: formValue(form, "fitness_goal"),
    focus_target: formValue(form, "focus_target"),
    height: formValue(form, "height") || "Not set",
    starting_weight: formValue(form, "starting_weight") || "Not set",
    starting_bodyfat: formValue(form, "starting_bodyfat") || "Not set",
    coach_note_title: formValue(form, "coach_note_title"),
    coach_note_body: formValue(form, "coach_note_body"),
    workouts,
    active: form.elements.active.checked,
    client_archived: Boolean(existingProgram?.client_archived)
  };
}

function profileFromForm(form) {
  const clientEmail = normalizeEmail(formValue(form, "client_email"));
  const clientName = formValue(form, "client_name");
  const fallbackClientName = clientEmail ? clientEmail.split("@")[0] : "";

  return {
    client_email: clientEmail,
    client_name: clientName || fallbackClientName || "Client",
    client_phone: formValue(form, "client_phone"),
    initials: (formValue(form, "initials") || initialsFromName(clientName || fallbackClientName)).slice(0, 4).toUpperCase(),
    height: formValue(form, "height") || "Not set",
    starting_weight: formValue(form, "starting_weight") || "Not set",
    starting_bodyfat: formValue(form, "starting_bodyfat") || "Not set",
    session_count_used: normalizeSessionCount(formValue(form, "session_count_used")),
    session_count_total: normalizeSessionCount(formValue(form, "session_count_total")),
    session_dates: sessionDatesFromText(formValue(form, "session_dates")),
    sheet_url: trustedSheetUrl(formValue(form, "sheet_url")) || null,
    session_package_history: sessionPackageHistoryFromForm(form)
  };
}

async function coachSessionToken() {
  if (!coachSupabase) {
    return "";
  }

  const { data } = await coachSupabase.auth.getSession();

  return data.session?.access_token || "";
}

async function manageClientProgram(program, action) {
  const token = await coachSessionToken();

  if (!token) {
    return { error: { message: "Sign in as coach first." } };
  }

  if (!program?.id) {
    return { error: { message: "Choose a saved client first." } };
  }

  const response = await fetch(`${coachConfig.url}/functions/v1/manage-client-program`, {
    method: "POST",
    headers: {
      "apikey": coachConfig.anonKey,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      program_id: program.id,
      action
    })
  });
  const result = await response.json().catch(() => ({}));
  const safeResult = result && typeof result === "object" ? result : {};

  if (!response.ok) {
    return {
      error: {
        message: safeResult.error || safeResult.message || "Could not update this client."
      }
    };
  }

  return { data: safeResult };
}

function profileChanged(program, profile) {
  if (!program) {
    return false;
  }

  return normalizeEmail(program.client_email) !== profile.client_email ||
    String(program.client_name || "") !== profile.client_name ||
    String(program.client_phone || "") !== profile.client_phone ||
    String(program.initials || "") !== profile.initials ||
    String(program.height || "") !== profile.height ||
    String(program.starting_weight || "") !== profile.starting_weight ||
    String(program.starting_bodyfat || "") !== profile.starting_bodyfat ||
    normalizeSessionCount(program.session_count_used) !== profile.session_count_used ||
    normalizeSessionCount(program.session_count_total) !== profile.session_count_total ||
    JSON.stringify(sessionDatesFromProgram(program)) !== JSON.stringify(profile.session_dates) ||
    trustedSheetUrl(program.sheet_url) !== profile.sheet_url ||
    JSON.stringify(sessionPackageHistoryFromProgram(program)) !== JSON.stringify(profile.session_package_history);
}

async function saveProfileChangesFromForm(form, options = {}) {
  const id = form.elements.id.value;
  const currentProgram = programs.find((program) => program.id === id);
  const profile = profileFromForm(form);
  const shouldRefreshUi = options.refreshUi !== false;

  if (!id || !currentProgram) {
    return { error: { message: "Choose an existing client first. Use Save new client for new clients." } };
  }

  if (!profile.client_email) {
    return { error: { message: "Add the client email first." } };
  }

  if (!isValidEmail(profile.client_email)) {
    form.elements.client_email?.reportValidity();
    return { error: { message: "Add a valid client email." } };
  }

  const token = await coachSessionToken();

  if (!token) {
    return { error: { message: "Sign in as coach first." } };
  }

  const oldEmail = currentProgram.client_email || "";
  const oldEmailKey = normalizeEmail(oldEmail);
  const response = await fetch(`${coachConfig.url}/functions/v1/update-client-profile`, {
    method: "POST",
    headers: {
      "apikey": coachConfig.anonKey,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      program_id: id,
      old_email: oldEmail,
      ...profile
    })
  });
  const result = await response.json().catch(() => ({}));
  const safeResult = result && typeof result === "object" ? result : {};

  if (!response.ok) {
    return { error: { message: safeResult.error || safeResult.message || "Could not save profile changes." } };
  }

  const updatedProgram = safeResult.program || { ...currentProgram, ...profile };

  programs = programs.map((program) => (
    normalizeEmail(program.client_email) === oldEmailKey
      ? { ...program, ...profile, ...(program.id === updatedProgram.id ? updatedProgram : {}) }
      : program
  ));
  programs.sort((a, b) => String(a.client_name).localeCompare(String(b.client_name)));
  selectedProgramId = updatedProgram.id || id;
  renderRecentClientTrainingLogs();

  if (shouldRefreshUi) {
    fillForm(updatedProgram);
    renderClientList();
    renderProgramHistory(profile.client_email);
    await loadProgressForEmail(profile.client_email);
    await loadTrainingLogsForEmail(profile.client_email);
  }

  return {
    data: updatedProgram,
    message: safeResult.message || "Profile changes saved."
  };
}

async function saveProgramFromForm(form) {
  const payload = programFromForm(form);
  const id = form.elements.id.value;
  const currentProgram = id ? programs.find((program) => program.id === id) : null;

  if (!payload.client_email) {
    return { error: { message: "Add the client email first." } };
  }

  if (currentProgram && profileChanged(currentProgram, profileFromForm(form))) {
    const profileResult = await saveProfileChangesFromForm(form, { refreshUi: false });

    if (profileResult.error) {
      return { error: profileResult.error };
    }
  }

  if (payload.active) {
    let archiveQuery = coachSupabase
      .from("client_programs")
      .update({ active: false })
      .eq("client_email", payload.client_email)
      .eq("active", true);

    if (id) {
      archiveQuery = archiveQuery.neq("id", id);
    }

    const { error: archiveError } = await archiveQuery;

    if (archiveError) {
      return { error: archiveError };
    }

    programs = programs.map((program) => (
      program.client_email === payload.client_email && program.id !== id
        ? { ...program, active: false }
        : program
    ));
  }

  const query = id
    ? coachSupabase.from("client_programs").update(payload).eq("id", id).select("*").single()
    : coachSupabase.from("client_programs").insert(payload).select("*").single();

  const { data, error } = await query;

  if (error) {
    return { error };
  }

  const existingIndex = programs.findIndex((program) => program.id === data.id);

  if (existingIndex >= 0) {
    programs[existingIndex] = data;
  } else {
    programs.push(data);
  }

  selectedProgramId = data.id;
  programs.sort((a, b) => String(a.client_name).localeCompare(String(b.client_name)));
  fillForm(data);
  renderClientList();
  renderProgramHistory(data.client_email);

  return { data };
}

async function saveTrainingBlockFromForm(form) {
  const id = form.elements.id.value;

  if (!id) {
    return saveProgramFromForm(form);
  }

  const payload = {
    program_title: formValue(form, "program_title") || "Client Program",
    fitness_goal: formValue(form, "fitness_goal"),
    focus_target: formValue(form, "focus_target"),
    program_summary: formValue(form, "program_summary")
  };

  const { data, error } = await coachSupabase
    .from("client_programs")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return { error };
  }

  const existingIndex = programs.findIndex((program) => program.id === data.id);

  if (existingIndex >= 0) {
    programs[existingIndex] = data;
  }

  fillForm(data);
  renderClientList();
  renderProgramHistory(data.client_email);

  return { data };
}

function clearProgramFields(form) {
  form.elements.id.value = "";
  form.elements.program_title.value = "";
  form.elements.fitness_goal.value = "";
  form.elements.focus_target.value = "";
  form.elements.session_count_used.value = "";
  form.elements.session_count_total.value = "";
  form.elements.session_dates.value = "";
  form.elements.sheet_url.value = "";
  form.elements.session_package_history.value = "[]";
  form.elements.program_summary.value = "";
  form.elements.coach_note_title.value = "";
  form.elements.coach_note_body.value = "";
  form.elements.active.checked = true;

  workoutSlots.forEach((number) => {
    form.elements[`workout_${number}_include`].checked = number === 1;
    form.elements[`workout_${number}_title`].value = "";
    form.elements[`workout_${number}_focus`].value = "";
    form.elements[`workout_${number}_format`].value = "single";
    form.elements[`workout_${number}_exercises`].value = "";
  });

  selectedProgramId = "";
  renderProgramHistory("");
  updateSelectedClientSummary({});
  updateWorkoutSummaries();
}

function renderWorkoutFields() {
  const container = document.getElementById("workout-fields");

  if (!container) {
    return;
  }

  container.innerHTML = workoutSlots.map((number) => `
    <details class="admin-card workout-editor-card" data-workout-card="${number}"${number === 1 ? " open" : ""}>
      <summary class="workout-card-summary">
        <span>
          <strong>Workout ${number}</strong>
          <small data-workout-summary="${number}">Off · Workout ${number} · 0 exercises</small>
        </span>
        <label class="toggle-label workout-include-label">
          <input type="checkbox" name="workout_${number}_include" />
          Include
        </label>
      </summary>
      <div class="workout-card-body">
        <div class="admin-field-grid">
          <label>
            Workout title
            <input type="text" name="workout_${number}_title" placeholder="Workout ${number}" />
          </label>
          <label>
            Focus
            <input type="text" name="workout_${number}_focus" placeholder="Upper strength" />
          </label>
          <label>
            Workout format
            <select name="workout_${number}_format">
              <option value="single">Single exercises</option>
              <option value="superset">Superset</option>
              <option value="circuit">Circuit training</option>
            </select>
          </label>
        </div>
        <label>
          Exercises
          <textarea class="exercise-textarea" name="workout_${number}_exercises" placeholder="A1 | Exercise name | 15 reps x 4 sets | 60-90s rest | glutes, hamstrings | https://youtu.be/demo"></textarea>
        </label>
      </div>
    </details>
  `).join("");
}

function fillForm(program = {}) {
  const form = document.getElementById("program-editor");
  const workouts = Array.isArray(program.workouts) ? program.workouts : [];

  if (!form) {
    return;
  }

  form.reset();
  form.elements.id.value = program.id || "";
  form.elements.client_email.value = program.client_email || "";
  form.elements.client_name.value = program.client_name || "";
  form.elements.client_phone.value = program.client_phone || "";
  form.elements.initials.value = program.initials || "";
  form.elements.height.value = program.height || "";
  form.elements.starting_weight.value = program.starting_weight || "";
  form.elements.starting_bodyfat.value = program.starting_bodyfat || "";
  form.elements.program_title.value = program.program_title || "";
  form.elements.fitness_goal.value = program.fitness_goal || "";
  form.elements.focus_target.value = program.focus_target || "";
  form.elements.session_count_used.value = program.session_count_used || "";
  form.elements.session_count_total.value = program.session_count_total || "";
  form.elements.session_dates.value = sessionDatesToText(sessionDatesFromProgram(program));
  form.elements.sheet_url.value = trustedSheetUrl(program.sheet_url);
  form.elements.session_package_history.value = sessionPackageHistoryToFormValue(program.session_package_history);
  form.elements.program_summary.value = program.program_summary || "";
  form.elements.coach_note_title.value = program.coach_note_title || "";
  form.elements.coach_note_body.value = program.coach_note_body || "";
  workoutSlots.forEach((number, index) => {
    const workout = workouts[index] || {};

    form.elements[`workout_${number}_include`].checked = workouts.length > 0 ? index < workouts.length : number === 1;
    form.elements[`workout_${number}_title`].value = workout.title || "";
    form.elements[`workout_${number}_focus`].value = workout.focus || "";
    form.elements[`workout_${number}_format`].value = workout.format || "single";
    form.elements[`workout_${number}_exercises`].value = exercisesToText(workout.exercises);
  });
  form.elements.active.checked = program.active !== false;
  selectedProgramId = program.id || "";
  updateSelectedClientSummary(program);
  updateWorkoutSummaries();

  if (program.client_email) {
    renderProgramHistory(program.client_email);
    loadProgressForEmail(program.client_email);
    loadTrainingLogsForEmail(program.client_email);
  } else {
    renderProgramHistory("");
    progressEntries = [];
    trainingLogs = [];
    fillProgressForm();
    renderProgressHistory();
    renderTrainingLogs();
    renderSelectedClientTrainingLogs();
    progressStatus("Save the client first, then add progress check-ins.");
  }
}

function fillProgressForm(entry = {}) {
  const form = document.getElementById("program-editor");

  if (!form) {
    return;
  }

  form.elements.progress_date.value = entry.entry_date || todayDate();
  form.elements.progress_bodyweight.value = entry.bodyweight ?? "";
  form.elements.progress_bodyfat.value = entry.bodyfat ?? "";
  form.elements.progress_goal.value = entry.goal_note || "";
}

function renderProgressHistory() {
  const history = document.getElementById("progress-history");

  if (!history) {
    return;
  }

  if (progressEntries.length === 0) {
    history.innerHTML = '<p class="empty-state">No progress check-ins yet.</p>';
    return;
  }

  history.innerHTML = progressEntries
    .slice()
    .reverse()
    .map((entry) => `
      <button class="progress-history-row" type="button" data-progress-id="${entry.id}">
        <strong>${entry.entry_date}</strong>
        <span>${entry.bodyweight ?? "Not set"} lb</span>
        <span>${entry.bodyfat ?? "Not set"}% bodyfat</span>
        <em>${entry.goal_note || "No goal note"}</em>
      </button>
    `)
    .join("");

  history.querySelectorAll("[data-progress-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const entry = progressEntries.find((item) => item.id === button.dataset.progressId);

      fillProgressForm(entry);
      progressStatus("Editing selected check-in.");
    });
  });
}

async function loadProgressForEmail(email) {
  if (!coachSupabase || !email) {
    return;
  }

  progressStatus("Loading progress...");

  const { data, error } = await coachSupabase
    .from("client_progress")
    .select("*")
    .eq("client_email", email)
    .order("entry_date", { ascending: true });

  if (error) {
    progressEntries = [];
    renderProgressHistory();
    progressStatus("Could not load progress. Run the progress SQL in Supabase.");
    return;
  }

  progressEntries = data || [];
  renderProgressHistory();
  fillProgressForm();
  progressStatus("Ready for a new check-in.");
}

function renderTrainingLogs() {
  const history = document.getElementById("training-log-history");

  if (!history) {
    return;
  }

  const filteredLogs = trainingLogDateFilter
    ? trainingLogs.filter((log) => String(log.entry_date || "") === trainingLogDateFilter)
    : trainingLogs;

  if (filteredLogs.length === 0) {
    history.innerHTML = trainingLogDateFilter
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

  history.innerHTML = workoutSections.map((workout) => {
    const supersets = Array.from(workout.supersets.values()).sort((a, b) => a.key.localeCompare(b.key));

    return `
      <section class="training-log-workout-group">
        <div class="training-log-workout-heading">
          <strong>${escapeHtml(formatAdminDate(workout.entry_date))}</strong>
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

function handleTrainingLogDateFilter() {
  const input = document.getElementById("training-log-date-filter");
  const clearButton = document.getElementById("clear-training-log-date-filter");

  if (!input || !clearButton) {
    return;
  }

  input.addEventListener("input", () => {
    trainingLogDateFilter = input.value || "";
    renderTrainingLogs();
  });

  clearButton.addEventListener("click", () => {
    trainingLogDateFilter = "";
    input.value = "";
    renderTrainingLogs();
  });
}

async function loadTrainingLogsForEmail(email) {
  if (!coachSupabase || !email) {
    trainingLogs = [];
    renderTrainingLogs();
    renderSelectedClientTrainingLogs();
    return;
  }

  const normalizedEmail = normalizeEmail(email);
  trainingLogStatus("Loading weights...");

  try {
    const { data, error } = await withRequestTimeout(
      coachSupabase
        .from("client_workout_logs")
        .select("*")
        .ilike("client_email", normalizedEmail)
        .order("entry_date", { ascending: false })
        .order("workout_title", { ascending: true })
        .order("exercise_code", { ascending: true })
        .order("set_number", { ascending: true })
        .limit(250),
      "Could not load weights right now. Please refresh and try again."
    );

    if (error) {
      trainingLogs = [];
      trainingLogStatus("Could not load weights. Please refresh and try again.");
      renderSelectedClientTrainingLogs();
      return;
    }

    trainingLogs = data || [];
    renderTrainingLogs();
    renderSelectedClientTrainingLogs();
  } catch (error) {
    trainingLogs = [];
    trainingLogStatus(error?.message || "Could not load weights. Please refresh and try again.");
    renderSelectedClientTrainingLogs();
  }
}

function programsForEmail(email) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    return [];
  }

  return programs
    .filter((program) => normalizeEmail(program.client_email) === normalizedEmail)
    .sort((a, b) => {
      if (a.active !== b.active) {
        return a.active ? -1 : 1;
      }

      return String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || ""));
    });
}

function clientNameForEmail(email) {
  const history = programsForEmail(email);
  const current = history.find((program) => program.active !== false && program.client_archived !== true);

  return current?.client_name || history[0]?.client_name || email || "Client";
}

function formatAdminDate(value) {
  if (!value) {
    return "No date";
  }

  const parsed = new Date(`${value}T12:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatAdminTime(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function summarizeTrainingLogs(logs = []) {
  const grouped = new Map();

  logs.forEach((log) => {
    const clientEmail = normalizeEmail(log.client_email);
    const key = [clientEmail, log.entry_date || "", log.workout_title || ""].join("::");
    const lastUpdated = String(log.updated_at || log.created_at || "");

    if (!grouped.has(key)) {
      grouped.set(key, {
        client_email: clientEmail,
        entry_date: log.entry_date || "",
        workout_title: log.workout_title || "Workout",
        last_updated: lastUpdated,
        exercise_codes: new Set(),
        set_count: 0
      });
    }

    const entry = grouped.get(key);

    entry.exercise_codes.add(`${log.exercise_code || ""}:${log.exercise_name || ""}`);
    entry.set_count += 1;

    if (lastUpdated && String(entry.last_updated || "") < lastUpdated) {
      entry.last_updated = lastUpdated;
    }
  });

  return Array.from(grouped.values())
    .map((entry) => ({
      ...entry,
      exercise_count: entry.exercise_codes.size
    }))
    .sort((a, b) => String(b.last_updated || b.entry_date || "").localeCompare(String(a.last_updated || a.entry_date || "")));
}

function renderTrainingLogSummaryList(targetId, logs = [], options = {}) {
  const history = document.getElementById(targetId);

  if (!history) {
    return;
  }

  if (logs.length === 0) {
    history.innerHTML = `<p class="empty-state">${options.emptyMessage || "No workout logs yet."}</p>`;
    return;
  }

  const summaries = summarizeTrainingLogs(logs);
  const showClient = options.showClient !== false;

  history.innerHTML = summaries.map((entry) => `
    <article class="training-log-summary-row">
      <div class="training-log-summary-date">
        <strong>${escapeHtml(formatAdminDate(entry.entry_date))}</strong>
        <span>${escapeHtml(showClient ? clientNameForEmail(entry.client_email) : "Saved workout")}</span>
      </div>
      <div class="training-log-summary-body">
        <span>${escapeHtml(entry.workout_title || "Workout")}</span>
        <small>${entry.exercise_count} exercise${entry.exercise_count === 1 ? "" : "s"} · ${entry.set_count} sets logged</small>
      </div>
      <em>${escapeHtml(formatAdminTime(entry.last_updated) || "Saved")}</em>
    </article>
  `).join("");
}

function renderRecentClientTrainingLogs() {
  renderTrainingLogSummaryList("recent-client-log-history", recentTrainingLogs, {
    emptyMessage: "No workout logs yet."
  });
}

function renderSelectedClientTrainingLogs() {
  const program = selectedProgram();
  const email = normalizeEmail(program?.client_email);

  renderTrainingLogSummaryList("progress-training-log-history", email ? trainingLogs : [], {
    showClient: false,
    emptyMessage: email
      ? "No saved workouts for this client yet."
      : "Choose a client to view saved workouts."
  });
}

async function loadRecentTrainingLogs() {
  if (!coachSupabase) {
    return;
  }

  const { data, error } = await coachSupabase
    .from("client_workout_logs")
    .select("*")
    .order("updated_at", { ascending: false })
    .order("entry_date", { ascending: false })
    .limit(120);

  if (error) {
    recentTrainingLogs = [];
    renderRecentClientTrainingLogs();
    return;
  }

  recentTrainingLogs = data || [];
  renderRecentClientTrainingLogs();
}

function programHistoryLabel(program) {
  if (program.client_archived) {
    return program.active === false ? "Archived client · old program" : "Archived client";
  }

  return program.active === false ? "Old program" : "Current program";
}

function renderProgramHistory(email = "") {
  const list = document.getElementById("program-history-list");

  if (!list) {
    return;
  }

  const historyPrograms = programsForEmail(email);

  if (historyPrograms.length === 0) {
    list.innerHTML = '<p class="empty-state">Save this client first to build program history.</p>';
    programHistoryStatus("Save old training blocks for reference.");
    return;
  }

  programHistoryStatus(`${historyPrograms.length} program${historyPrograms.length === 1 ? "" : "s"} saved for this client.`);
  list.innerHTML = historyPrograms.map((program) => `
    <article class="program-history-row${program.id === selectedProgramId ? " is-selected" : ""}">
      <div class="program-history-summary">
        <strong>${program.program_title || "Client Program"}</strong>
        <span>${programHistoryLabel(program)} · ${program.updated_at ? new Date(program.updated_at).toLocaleDateString() : "No date"}</span>
      </div>
      <div class="program-history-actions">
        <button class="button button-ghost" type="button" data-program-history-view="${program.id}">View</button>
        <button class="button button-ghost" type="button" data-program-history-copy="${program.id}">Copy to client</button>
        <button class="button button-ghost" type="button" data-program-history-restore="${program.id}"${program.active !== false && !program.client_archived ? " disabled" : ""}>Restore</button>
        <button class="button button-ghost danger-button" type="button" data-program-history-delete="${program.id}">Delete</button>
      </div>
    </article>
  `).join("");
}

function renderClientList() {
  const select = document.getElementById("client-select");
  const statusNode = document.getElementById("client-selector-status");
  const archiveButton = document.getElementById("archive-client-button");
  const archivedButton = document.getElementById("archived-clients-button");
  const deleteArchivedButton = document.getElementById("delete-archived-client-button");
  const visiblePrograms = programsForCurrentClientView();
  const currentProgram = selectedProgram();

  if (!select) {
    return;
  }

  if (archiveButton) {
    archiveButton.disabled = !selectedProgramId;
    archiveButton.textContent = currentProgram?.client_archived === true ? "Restore" : "Archive";
    archiveButton.hidden = showingArchivedClients && !selectedProgramId;
  }

  if (archivedButton) {
    archivedButton.textContent = showingArchivedClients ? "Active clients" : "Archived clients";
    archivedButton.classList.toggle("is-selected", showingArchivedClients);
  }

  if (deleteArchivedButton) {
    deleteArchivedButton.hidden = !showingArchivedClients;
    deleteArchivedButton.disabled = currentProgram?.client_archived !== true;
  }

  if (visiblePrograms.length === 0) {
    const clientType = showingArchivedClients ? "archived" : "active";
    const message = clientSearchTerm
      ? `No ${clientType} clients match that search.`
      : `No ${clientType} clients to show.`;

    select.replaceChildren(new Option(message, ""));
    select.disabled = true;
    if (statusNode) {
      statusNode.textContent = message;
    }
    return;
  }

  const placeholder = new Option(
    showingArchivedClients ? "Choose archived client" : "Choose client",
    ""
  );
  const options = visiblePrograms.map((program) => {
    const status = program.client_archived === true
      ? "Archived"
      : program.active === false
        ? "Inactive"
        : "Active";
    const name = program.client_name || "Client";
    const email = program.client_email ? ` - ${program.client_email}` : "";

    return new Option(`${name}${email} (${status})`, program.id);
  });

  select.disabled = false;
  select.replaceChildren(placeholder, ...options);
  select.value = visiblePrograms.some((program) => program.id === selectedProgramId) ? selectedProgramId : "";
  if (statusNode) {
    const label = showingArchivedClients ? "archived client" : "client";
    statusNode.textContent = `${visiblePrograms.length} ${label}${visiblePrograms.length === 1 ? "" : "s"} available.`;
  }
}

async function loadPrograms() {
  adminStatus("Loading clients...");

  const { data, error } = await coachSupabase
    .from("client_programs")
    .select("*")
    .order("client_name", { ascending: true });

  if (error) {
    adminStatus("Could not load clients. Check the coach admin Supabase policy.");
    return;
  }

  programs = data || [];

  const visiblePrograms = programsForCurrentClientView();

  if (visiblePrograms.length > 0) {
    fillForm(visiblePrograms[0]);
  } else {
    fillForm();
  }

  renderClientList();
  await loadRecentTrainingLogs();
  adminStatus("Ready.");
}

async function showAdminWorkspace(user) {
  const workspace = document.getElementById("coach-admin-workspace");
  const signOutButton = document.querySelector("[data-coach-sign-out]");

  if (!isCoachEmail(user.email)) {
    if (coachSupabase) {
      await coachSupabase.auth.signOut();
    }

    sendToCoachLogin();
    return;
  }

  if (workspace) {
    workspace.hidden = false;
  }

  if (signOutButton) {
    signOutButton.hidden = false;
  }

  await loadPrograms();
}

function handleAdminTabs() {
  const tabs = document.querySelectorAll("[data-admin-tab]");

  if (tabs.length === 0) {
    return;
  }

  tabs.forEach((button) => {
    button.addEventListener("click", () => {
      setAdminTab(button.dataset.adminTab);
    });
  });

  setAdminTab(activeAdminTab);
}

function handleSelectedClientActions() {
  const saveProfileButton = document.getElementById("selected-save-profile-button");

  saveProfileButton?.addEventListener("click", () => {
    setAdminTab("profile");
    document.getElementById("save-profile-changes-button")?.click();
  });
}

function handleSessionManualEditor() {
  const form = document.getElementById("program-editor");
  const usedInput = document.getElementById("session-count-used-input");
  const totalInput = document.getElementById("session-count-total-input");
  const datesInput = document.getElementById("session-dates-input");
  const sheetUrlInput = document.getElementById("session-sheet-url-input");
  const button = document.getElementById("save-session-count-button");
  const newPackageButton = document.getElementById("start-new-session-package-button");
  const status = document.getElementById("session-sheet-save-status");

  if (!form || !usedInput || !totalInput || !datesInput || !sheetUrlInput || !button || !newPackageButton) {
    return;
  }

  const syncInputsToForm = () => {
    if (form.elements.session_count_used) {
      form.elements.session_count_used.value = usedInput.value;
    }

    if (form.elements.session_count_total) {
      form.elements.session_count_total.value = totalInput.value;
    }

    if (form.elements.session_dates) {
      form.elements.session_dates.value = datesInput.value;
    }

    if (form.elements.sheet_url) {
      form.elements.sheet_url.value = trustedSheetUrl(sheetUrlInput.value);
    }

    updateSelectedClientSummary(selectedProgram());
  };

  [usedInput, totalInput, datesInput, sheetUrlInput].forEach((input) => {
    input.addEventListener("input", syncInputsToForm);
  });

  button.addEventListener("click", async () => {
    const currentProgram = selectedProgram();

    if (!currentProgram?.id) {
      if (status) {
        status.textContent = "Choose a saved client first.";
      }
      adminStatus("Choose a saved client first.");
      return;
    }

    syncInputsToForm();

    button.disabled = true;
    if (status) {
      status.textContent = "Saving sessions...";
    }
    adminStatus("Saving sessions...");

    const { error } = await saveProfileChangesFromForm(form);

    if (error) {
      if (status) {
        status.textContent = error.message;
      }
      adminStatus(error.message);
      button.disabled = false;
      return;
    }

    if (status) {
      status.textContent = "Sessions saved.";
    }
    adminStatus("Sessions saved.");
    updateSelectedClientSummary(selectedProgram());
    button.disabled = false;
  });

  newPackageButton.addEventListener("click", async () => {
    const currentProgram = selectedProgram();
    const packageTotal = normalizeSessionCount(totalInput.value);

    if (!currentProgram?.id) {
      if (status) {
        status.textContent = "Choose a saved client first.";
      }
      adminStatus("Choose a saved client first.");
      return;
    }

    if (packageTotal <= 0) {
      if (status) {
        status.textContent = "Add the total sessions for the new package first.";
      }
      adminStatus("Add the total sessions for the new package first.");
      totalInput.focus();
      return;
    }

    const confirmed = window.confirm(
      "Start a new package for this client? This will reset sessions used to 0 and clear session dates."
    );

    if (!confirmed) {
      return;
    }

    const currentHistory = sessionPackageHistoryFromForm(form);
    const packageUsed = normalizeSessionCount(usedInput.value);
    const packageDates = sessionPackageDatesFromText(datesInput.value);
    const archivedPackage = {
      label: `Package ${currentHistory.length + 1}`,
      used: packageUsed,
      total: packageTotal,
      dates: packageDates,
      archived_at: new Date().toISOString().slice(0, 10)
    };

    if (form.elements.session_package_history) {
      form.elements.session_package_history.value = sessionPackageHistoryToFormValue([
        archivedPackage,
        ...currentHistory
      ]);
    }

    usedInput.value = "0";
    datesInput.value = "";
    syncInputsToForm();

    newPackageButton.disabled = true;
    button.disabled = true;
    if (status) {
      status.textContent = "Starting new package...";
    }
    adminStatus("Starting new package...");

    const { error } = await saveProfileChangesFromForm(form);

    if (error) {
      if (status) {
        status.textContent = error.message;
      }
      adminStatus(error.message);
      newPackageButton.disabled = false;
      button.disabled = false;
      return;
    }

    if (status) {
      status.textContent = `New ${packageTotal}-session package started.`;
    }
    adminStatus(`New ${packageTotal}-session package started.`);
    updateSelectedClientSummary(selectedProgram());
    newPackageButton.disabled = false;
    button.disabled = false;
  });
}

function handleAdminLiveUpdates() {
  const form = document.getElementById("program-editor");

  if (!form) {
    return;
  }

  form.addEventListener("input", (event) => {
    const name = event.target?.name || "";

    if (name.startsWith("workout_")) {
      updateWorkoutSummaries();
    }

    if ([
      "client_email",
      "client_name",
      "client_phone",
      "initials",
      "program_title",
      "session_count_used",
      "session_count_total",
      "session_dates",
      "sheet_url"
    ].includes(name)) {
      updateSelectedClientSummary();
    }
  });

  form.addEventListener("change", (event) => {
    const name = event.target?.name || "";

    if (name.startsWith("workout_")) {
      updateWorkoutSummaries();
    }

    if (name === "active") {
      updateSelectedClientSummary();
    }

    updateSelectedClientSummary();
  });
}

function handleWorkoutCards() {
  const container = document.getElementById("workout-fields");

  if (!container) {
    return;
  }

  container.addEventListener("click", (event) => {
    const includeLabel = event.target.closest(".workout-include-label");

    if (includeLabel) {
      const input = includeLabel.querySelector("input");

      event.preventDefault();
      event.stopPropagation();

      if (input) {
        input.checked = !input.checked;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  });

  container.addEventListener("toggle", (event) => {
    const openedCard = event.target;

    if (!openedCard.matches?.("[data-workout-card]") || !openedCard.open) {
      return;
    }

    container.querySelectorAll("[data-workout-card]").forEach((card) => {
      if (card !== openedCard) {
        card.open = false;
      }
    });
  }, true);
}

function handleSaveWorkouts() {
  const button = document.getElementById("save-workouts-button");
  const form = document.getElementById("program-editor");

  if (!button || !form) {
    return;
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    workoutsStatus("Saving workouts...");
    adminStatus("Saving workouts...");

    const { error } = await saveProgramFromForm(form);

    if (error) {
      workoutsStatus(error.message);
      adminStatus(error.message);
      button.disabled = false;
      return;
    }

    workoutsStatus("Workouts saved.");
    adminStatus("Workouts saved.");
    button.disabled = false;
  });
}

function handleCopyWorkouts() {
  const button = document.getElementById("copy-workouts-button");
  const form = document.getElementById("program-editor");

  if (!button || !form) {
    return;
  }

  button.addEventListener("click", async () => {
    const sourceEmail = normalizeEmail(formValue(form, "client_email"));

    if (!sourceEmail) {
      workoutsStatus("Choose or create a client first.");
      return;
    }

    const sourceProgram = {
      ...programFromForm(form),
      id: form.elements.id.value || selectedProgramId
    };

    openCopyClientDialog(sourceProgram, button, {
      nextTab: "workouts",
      status: workoutsStatus,
      successMessage: "Workouts copied."
    });
  });
}

function validateClientDetails(form) {
  const clientEmail = normalizeEmail(formValue(form, "client_email"));
  const clientName = formValue(form, "client_name");

  if (!clientEmail) {
    form.elements.client_email?.reportValidity();
    inviteStatus("Add the client email first.");
    adminStatus("Add the client email first.");
    return false;
  }

  if (!isValidEmail(clientEmail)) {
    form.elements.client_email?.reportValidity();
    inviteStatus("Add a valid client email.");
    adminStatus("Add a valid client email.");
    return false;
  }

  if (!clientName) {
    form.elements.client_name?.reportValidity();
    inviteStatus("Add the client name first.");
    adminStatus("Add the client name first.");
    return false;
  }

  return true;
}

function handleSaveClientDetails() {
  const button = document.getElementById("save-client-button");
  const form = document.getElementById("program-editor");

  if (!button || !form) {
    return;
  }

  button.addEventListener("click", async () => {
    if (!validateClientDetails(form)) {
      return;
    }

    setClientInviteBusy(true);
    inviteStatus("Saving client...");
    adminStatus("Saving client...");

    try {
      const { error } = await withSlowStatus(
        withRequestTimeout(
          saveProgramFromForm(form),
          "Saving the client is taking too long. Check your connection and try again.",
          45000
        ),
        "Still saving client...",
        inviteStatus,
        8000
      );

      if (error) {
        inviteStatus(error.message || "Could not save client.");
        adminStatus(error.message || "Could not save client.");
        return;
      }

      setAdminTab("clients");
      inviteStatus("Client saved. Send invite link when ready.");
      adminStatus("Client saved.");
    } catch (error) {
      const message = readableClientRequestError(
        error,
        "Could not connect while saving. Refresh and check the client list before trying again."
      );

      inviteStatus(message);
      adminStatus(message);
    } finally {
      setClientInviteBusy(false);
    }
  });
}

function handleSaveTrainingBlock() {
  const button = document.getElementById("save-training-block-button");
  const form = document.getElementById("program-editor");

  if (!button || !form) {
    return;
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    trainingBlockStatus("Saving training block...");
    adminStatus("Saving training block...");

    const { error } = await saveTrainingBlockFromForm(form);

    if (error) {
      trainingBlockStatus(error.message);
      adminStatus(error.message);
      button.disabled = false;
      return;
    }

    trainingBlockStatus("Training block saved.");
    adminStatus("Training block saved.");
    button.disabled = false;
  });
}

function handleSaveCoachNotes() {
  const button = document.getElementById("save-coach-notes-button");
  const form = document.getElementById("program-editor");

  if (!button || !form) {
    return;
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    coachNotesStatus("Saving notes...");
    adminStatus("Saving notes...");

    const { error } = await saveProgramFromForm(form);

    if (error) {
      coachNotesStatus(error.message);
      adminStatus(error.message);
      button.disabled = false;
      return;
    }

    coachNotesStatus("Notes saved.");
    adminStatus("Notes saved.");
    button.disabled = false;
  });
}

async function archiveClientProgram(program, button) {
  if (!program) {
    adminStatus("Choose a client first.");
    return;
  }

  const shouldRestore = program.client_archived === true;
  const label = program.client_name || program.client_email || "this client";
  const actionLabel = shouldRestore ? "restore" : "archive";
  const confirmed = window.confirm(`${shouldRestore ? "Restore" : "Archive"} ${label}?`);

  if (!confirmed) {
    return;
  }

  if (button) {
    button.disabled = true;
  }
  adminStatus(`${shouldRestore ? "Restoring" : "Archiving"} client...`);

  const ids = clientProgramIds(program);
  const { data: actionData, error } = await manageClientProgram(program, shouldRestore ? "restore" : "archive");

  if (error) {
    adminStatus(error.message);
    if (button) {
      button.disabled = false;
    }
    return;
  }

  const updatedRows = Array.isArray(actionData?.programs) ? actionData.programs : [];
  const updatedById = new Map(updatedRows.map((item) => [item.id, item]));
  programs = programs.map((item) => (
    ids.includes(item.id)
      ? (updatedById.get(item.id) || {
        ...item,
        client_archived: !shouldRestore
      })
      : item
  ));
  updatedRows.forEach((updatedProgram) => {
    if (!programs.some((item) => item.id === updatedProgram.id)) {
      programs.push(updatedProgram);
    }
  });
  const selectedAfterAction = actionData?.selected_program;
  const nextProgram = programsForCurrentClientView()[0] || {};

  selectedProgramId = selectedAfterAction?.id || nextProgram.id || "";
  fillForm(selectedAfterAction || nextProgram);
  renderClientList();
  adminStatus(`Client ${actionLabel}d.`);
  if (button) {
    button.disabled = false;
  }
}

async function deleteArchivedClientProgram(program, button) {
  if (!program || program.client_archived !== true) {
    adminStatus("Choose an archived client first.");
    return;
  }

  const label = program.client_name || program.client_email || "this archived client";
  const confirmed = window.confirm(`Permanently delete ${label} from archived clients?`);

  if (!confirmed) {
    return;
  }

  if (button) {
    button.disabled = true;
  }
  adminStatus("Deleting archived client...");

  const ids = programsForClientRecord(program)
    .filter((item) => item.client_archived === true)
    .map((item) => item.id)
    .filter(Boolean);
  const { data: actionData, error } = await manageClientProgram(program, "delete_archived");

  if (error) {
    adminStatus(error.message);
    if (button) {
      button.disabled = false;
    }
    return;
  }

  const deletedIds = Array.isArray(actionData?.deleted_ids) ? actionData.deleted_ids : ids;
  programs = programs.filter((item) => !deletedIds.includes(item.id));
  const nextProgram = programsForCurrentClientView()[0] || {};

  selectedProgramId = nextProgram.id || "";
  fillForm(nextProgram);
  renderClientList();
  adminStatus("Archived client deleted.");
  if (button) {
    button.disabled = false;
  }
}

async function deleteClientProgram(program, button) {
  if (!program) {
    adminStatus("Choose a client first.");
    profileManagementStatus("Choose a client first.");
    return;
  }

  const label = program.client_name || program.client_email || "this client";
  const confirmed = window.confirm(`Delete ${label} from the coach admin? This removes their saved programs from this page.`);

  if (!confirmed) {
    return;
  }

  if (button) {
    button.disabled = true;
  }
  adminStatus("Deleting client...");
  profileManagementStatus("Deleting client...");

  const ids = clientProgramIds(program);
  const { data: actionData, error } = await manageClientProgram(program, "delete");

  if (error) {
    adminStatus(error.message);
    profileManagementStatus(error.message);
    if (button) {
      button.disabled = false;
    }
    return;
  }

  const deletedIds = Array.isArray(actionData?.deleted_ids) ? actionData.deleted_ids : ids;
  programs = programs.filter((item) => !deletedIds.includes(item.id));
  const nextProgram = programsForCurrentClientView()[0] || {};

  selectedProgramId = nextProgram.id || "";
  fillForm(nextProgram);
  renderClientList();
  adminStatus("Client deleted from coach admin.");
  profileManagementStatus("Client deleted from coach admin.");
  if (button) {
    button.disabled = false;
  }
}

function handleSaveProfileChanges() {
  const button = document.getElementById("save-profile-changes-button");
  const form = document.getElementById("program-editor");

  if (!button || !form) {
    return;
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    adminStatus("Saving changes...");

    const { error } = await saveProgramFromForm(form);

    if (error) {
      adminStatus(error.message);
      button.disabled = false;
      return;
    }

    adminStatus("Changes saved.");
    button.disabled = false;
  });
}

function handleProfileClientManagement() {
  const archiveButton = document.getElementById("profile-archive-client-button");
  const deleteButton = document.getElementById("profile-delete-client-button");
  const form = document.getElementById("program-editor");

  archiveButton?.addEventListener("click", async () => {
    const id = form?.elements.id.value || selectedProgramId;
    const program = programs.find((item) => item.id === id);

    await archiveClientProgram(program, archiveButton);
    updateSelectedClientSummary(selectedProgram());
  });

  deleteButton?.addEventListener("click", async () => {
    const id = form?.elements.id.value || selectedProgramId;
    const program = programs.find((item) => item.id === id);

    await deleteClientProgram(program, deleteButton);
  });
}

async function handleArchiveClient() {
  const button = document.getElementById("archive-client-button");
  const form = document.getElementById("program-editor");

  if (!button || !form) {
    return;
  }

  button.addEventListener("click", async () => {
    const id = form.elements.id.value || selectedProgramId;
    const program = programs.find((item) => item.id === id);

    await archiveClientProgram(program, button);
  });
}

function handleArchivedClientsToggle() {
  const button = document.getElementById("archived-clients-button");

  if (!button) {
    return;
  }

  button.addEventListener("click", () => {
    showingArchivedClients = !showingArchivedClients;

    const visiblePrograms = programsForCurrentClientView();
    const selectedVisible = visiblePrograms.some((program) => program.id === selectedProgramId);

    if (!selectedVisible) {
      fillForm({});
    }
    renderClientList();
    adminStatus(showingArchivedClients ? "Showing archived clients." : "Showing active clients.");
  });
}

function handleClientSelect() {
  const select = document.getElementById("client-select");

  if (!select) {
    return;
  }

  select.addEventListener("change", () => {
    const program = programs.find((item) => item.id === select.value);

    if (!program) {
      return;
    }

    fillForm(program);
    renderClientList();
    setAdminTab("profile");
    adminStatus("Ready.");
  });
}

function handleClientSearch() {
  const input = document.getElementById("client-search-input");

  if (!input) {
    return;
  }

  input.addEventListener("input", () => {
    clientSearchTerm = input.value.trim().toLowerCase();
    renderClientList();
  });
}

function handleDeleteArchivedClient() {
  const button = document.getElementById("delete-archived-client-button");
  const form = document.getElementById("program-editor");

  if (!button || !form) {
    return;
  }

  button.addEventListener("click", async () => {
    const id = form.elements.id.value || selectedProgramId;
    const program = programs.find((item) => item.id === id);

    await deleteArchivedClientProgram(program, button);
  });
}

function copyClientStatus(message) {
  const status = document.getElementById("copy-client-status");

  if (status) {
    status.textContent = message;
  }
}

function copyClientWarning(message = "") {
  const warning = document.getElementById("copy-client-warning");

  if (warning) {
    warning.textContent = message;
    warning.hidden = !message;
  }
}

function copyClientWarningForTarget(targetEmail) {
  const email = normalizeEmail(targetEmail);

  if (!email) {
    return "";
  }

  const targetCurrent = programsForEmail(email)
    .find((item) => item.active !== false && item.client_archived !== true);

  if (!targetCurrent) {
    return "";
  }

  const targetName = targetCurrent.client_name || email;

  return `${targetName} already has an active program. Copying will move that program to history and make this copied program active.`;
}

function closeCopyClientDialog() {
  const modal = document.getElementById("copy-client-modal");

  pendingProgramCopy = null;
  copyClientWarning("");
  if (modal) {
    modal.hidden = true;
  }
}

function openCopyClientDialog(program, button, options = {}) {
  if (!program) {
    const status = options.status || programHistoryStatus;

    status("Choose a saved program first.");
    return;
  }

  const modal = document.getElementById("copy-client-modal");
  const select = document.getElementById("copy-client-select");
  const confirmButton = document.getElementById("confirm-copy-client-button");
  const sourceEmail = normalizeEmail(program.client_email);
  const clients = activeClientOptionsForCopy(sourceEmail);

  if (!modal || !select || !confirmButton) {
    return;
  }

  pendingProgramCopy = {
    program,
    button,
    options
  };

  select.replaceChildren(new Option("Choose client", ""));
  copyClientWarning("");
  clients.forEach((client) => {
    const name = client.client_name || "Client";
    const email = normalizeEmail(client.client_email);

    select.append(new Option(`${name} - ${email}`, email));
  });
  select.disabled = clients.length === 0;
  confirmButton.disabled = clients.length === 0;
  modal.hidden = false;
  copyClientStatus(
    clients.length === 0
      ? "No other clients available."
      : "Choose who should receive this program."
  );
}

async function copyProgramToClient(program, button, targetEmail, options = {}) {
  const status = options.status || programHistoryStatus;
  const nextTab = options.nextTab || "program";
  const successMessage = options.successMessage || "Program copied.";
  const confirmButton = document.getElementById("confirm-copy-client-button");
  const cancelButton = document.getElementById("cancel-copy-client-button");
  const select = document.getElementById("copy-client-select");

  if (!program) {
    status("Choose a saved program first.");
    return;
  }

  if (!targetEmail) {
    copyClientStatus("Choose a client first.");
    return;
  }

  const sourceEmail = normalizeEmail(program.client_email);

  if (targetEmail === sourceEmail) {
    copyClientStatus("Choose a different client email.");
    return;
  }

  const targetPrograms = programsForEmail(targetEmail);
  const targetCurrent = targetPrograms.find((item) => item.active !== false && item.client_archived !== true);
  const targetProfile = targetCurrent || targetPrograms[0] || null;
  const targetName = targetProfile?.client_name || targetEmail.split("@")[0];
  let movedTargetToHistory = false;

  if (!targetName) {
    return;
  }

  if (!coachSupabase) {
    copyClientStatus("Coach admin is not connected yet.");
    status("Coach admin is not connected yet.");
    return;
  }

  if (button) {
    button.disabled = true;
  }
  if (confirmButton) {
    confirmButton.disabled = true;
  }
  if (cancelButton) {
    cancelButton.disabled = true;
  }
  if (select) {
    select.disabled = true;
  }
  copyClientStatus("Copying program...");
  status("Copying program...");
  adminStatus("Copying program...");

  try {
    if (targetCurrent) {
      const { error: archiveError } = await withSlowStatus(
        coachSupabase
          .from("client_programs")
          .update({ active: false })
          .eq("client_email", targetEmail)
          .eq("active", true),
        "Still moving the target client's current program to history...",
        (message) => {
          copyClientStatus(message);
          status(message);
          adminStatus(message);
        }
      );

      if (archiveError) {
        throw new Error(archiveError.message);
      }

      movedTargetToHistory = true;
      programs = programs.map((item) => (
        normalizeEmail(item.client_email) === targetEmail && item.active !== false
          ? { ...item, active: false }
          : item
      ));
    }

    const payload = {
      client_email: targetEmail,
      client_name: targetName,
      client_phone: targetProfile?.client_phone || "",
      initials: targetProfile?.initials || initialsFromName(targetName),
      program_title: program.program_title || "Client Program",
      program_summary: program.program_summary || "",
      session_count_used: normalizeSessionCount(targetProfile?.session_count_used),
      session_count_total: normalizeSessionCount(targetProfile?.session_count_total),
      session_dates: sessionDatesFromProgram(targetProfile),
      sheet_url: trustedSheetUrl(targetProfile?.sheet_url) || null,
      session_package_history: sessionPackageHistoryFromProgram(targetProfile),
      fitness_goal: program.fitness_goal || "",
      focus_target: program.focus_target || "",
      height: targetProfile?.height || "Not set",
      starting_weight: targetProfile?.starting_weight || "Not set",
      starting_bodyfat: targetProfile?.starting_bodyfat || "Not set",
      coach_note_title: program.coach_note_title || "",
      coach_note_body: program.coach_note_body || "",
      workouts: Array.isArray(program.workouts) ? program.workouts : [],
      active: true,
      client_archived: false
    };

    const { data, error } = await withSlowStatus(
      insertCopiedProgram(payload),
      "Still creating the copied program...",
      (message) => {
        copyClientStatus(message);
        status(message);
        adminStatus(message);
      }
    );

    if (error) {
      throw new Error(error.message);
    }

    programs.push(data);
    programs.sort((a, b) => String(a.client_name).localeCompare(String(b.client_name)));
    selectedProgramId = data.id;
    fillForm(data);
    renderClientList();
    renderProgramHistory(targetEmail);
    setAdminTab(nextTab);
    status(`Program copied to ${targetName}.`);
    copyClientStatus(`Program copied to ${targetName}.`);
    adminStatus(successMessage);
    closeCopyClientDialog();
  } catch (error) {
    let message = error?.message || "Could not copy program.";

    if (movedTargetToHistory && targetCurrent?.id) {
      const restoringMessage = "Copy failed. Restoring the target client's original active program...";

      copyClientStatus(restoringMessage);
      status(restoringMessage);
      adminStatus(restoringMessage);

      const { error: restoreError } = await coachSupabase
        .from("client_programs")
        .update({ active: true, client_archived: false })
        .eq("id", targetCurrent.id);

      if (restoreError) {
        message = `${message} The original program could not be restored automatically: ${restoreError.message}`;
      } else {
        programs = programs.map((item) => (
          item.id === targetCurrent.id
            ? { ...item, active: true, client_archived: false }
            : item
        ));
        renderClientList();
        message = `${message} The original active program was restored.`;
      }
    }

    copyClientStatus(message);
    status(message);
    adminStatus(message);
  } finally {
    if (button) {
      button.disabled = false;
    }
    if (!document.getElementById("copy-client-modal")?.hidden) {
      if (confirmButton) {
        confirmButton.disabled = !select?.value;
      }
      if (cancelButton) {
        cancelButton.disabled = false;
      }
      if (select) {
        select.disabled = false;
      }
    }
  }
}

function handleCopyClientDialog() {
  const cancelButton = document.getElementById("cancel-copy-client-button");
  const confirmButton = document.getElementById("confirm-copy-client-button");
  const select = document.getElementById("copy-client-select");
  const modal = document.getElementById("copy-client-modal");

  cancelButton?.addEventListener("click", closeCopyClientDialog);

  modal?.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeCopyClientDialog();
    }
  });

  select?.addEventListener("change", () => {
    confirmButton.disabled = !select.value;
    copyClientWarning(copyClientWarningForTarget(select.value));
    copyClientStatus(select.value ? "Ready to copy." : "Choose who should receive this program.");
  });

  confirmButton?.addEventListener("click", async () => {
    if (!pendingProgramCopy) {
      copyClientStatus("Choose a program first.");
      return;
    }

    const targetEmail = normalizeEmail(select?.value);

    if (!targetEmail) {
      copyClientStatus("Choose a client first.");
      return;
    }

    await copyProgramToClient(
      pendingProgramCopy.program,
      pendingProgramCopy.button,
      targetEmail,
      pendingProgramCopy.options
    );
  });
}

async function deleteProgramHistoryItem(program, button) {
  if (!program) {
    programHistoryStatus("Could not find that saved program.");
    return;
  }

  const isCurrent = program.active !== false && program.client_archived !== true;
  const label = program.program_title || "this program";
  const confirmed = window.confirm(
    isCurrent
      ? `Delete ${label}? This is the client's current program, so they may have no active program afterward.`
      : `Delete ${label} from program history?`
  );

  if (!confirmed) {
    return;
  }

  if (button) {
    button.disabled = true;
  }
  programHistoryStatus("Deleting program...");
  adminStatus("Deleting program...");

  const deletedEmail = normalizeEmail(program.client_email);
  const { error } = await coachSupabase
    .from("client_programs")
    .delete()
    .eq("id", program.id);

  if (error) {
    programHistoryStatus(error.message);
    adminStatus(error.message);
    if (button) {
      button.disabled = false;
    }
    return;
  }

  programs = programs.filter((item) => item.id !== program.id);

  if (selectedProgramId === program.id) {
    const nextProgram = programsForEmail(deletedEmail)[0] || {};

    selectedProgramId = nextProgram.id || "";
    fillForm(nextProgram);
  }

  renderClientList();
  renderProgramHistory(deletedEmail);
  programHistoryStatus("Program deleted.");
  adminStatus("Program deleted.");
  if (button) {
    button.disabled = false;
  }
}

function handleProgramHistoryActions() {
  document.addEventListener("click", async (event) => {
    const viewButton = event.target.closest("[data-program-history-view]");
    const copyButton = event.target.closest("[data-program-history-copy]");
    const restoreButton = event.target.closest("[data-program-history-restore]");
    const deleteButton = event.target.closest("[data-program-history-delete]");
    const button = viewButton || copyButton || restoreButton || deleteButton;

    if (!button) {
      return;
    }

    const programId = button.dataset.programHistoryView || button.dataset.programHistoryCopy || button.dataset.programHistoryRestore || button.dataset.programHistoryDelete;
    const program = programs.find((item) => item.id === programId);

    if (!program) {
      programHistoryStatus("Could not find that saved program.");
      return;
    }

    if (viewButton) {
      fillForm(program);
      renderClientList();
      adminStatus("Viewing saved program.");
      programHistoryStatus("Viewing saved program.");
      return;
    }

    if (copyButton) {
      openCopyClientDialog(program, copyButton);
      return;
    }

    if (deleteButton) {
      await deleteProgramHistoryItem(program, deleteButton);
      return;
    }

    const confirmed = window.confirm(`Restore ${program.program_title || "this program"} as the current program for ${program.client_name || program.client_email}?`);

    if (!confirmed) {
      return;
    }

    restoreButton.disabled = true;
    adminStatus("Restoring program...");
    programHistoryStatus("Restoring program...");

    const { error: archiveError } = await coachSupabase
      .from("client_programs")
      .update({ active: false, client_archived: false })
      .eq("client_email", program.client_email);

    if (archiveError) {
      adminStatus(archiveError.message);
      programHistoryStatus(archiveError.message);
      restoreButton.disabled = false;
      return;
    }

    const { data, error } = await coachSupabase
      .from("client_programs")
      .update({ active: true, client_archived: false })
      .eq("id", program.id)
      .select("*")
      .single();

    if (error) {
      adminStatus(error.message);
      programHistoryStatus(error.message);
      restoreButton.disabled = false;
      return;
    }

    programs = programs.map((item) => {
      if (item.client_email !== program.client_email) {
        return item;
      }

      return {
        ...item,
        active: item.id === program.id,
        client_archived: false,
        ...(item.id === program.id ? data : {})
      };
    });

    fillForm(data);
    renderClientList();
    adminStatus("Program restored.");
    programHistoryStatus("Program restored as current.");
  });
}

async function handleSendInvite() {
  const button = document.getElementById("send-invite-button");
  const form = document.getElementById("program-editor");

  if (!button || !form) {
    return;
  }

  button.addEventListener("click", async () => {
    const requestedEmail = normalizeEmail(formValue(form, "client_email"));

    if (!requestedEmail) {
      inviteStatus("Add the client email first.");
      return;
    }

    if (!isValidEmail(requestedEmail)) {
      form.elements.client_email?.reportValidity();
      inviteStatus("Add a valid client email.");
      return;
    }

    if (!coachSupabase) {
      inviteStatus("Coach admin is not connected yet.");
      return;
    }

    const { data } = await coachSupabase.auth.getSession();
    const token = data.session?.access_token;

    if (!token) {
      inviteStatus("Sign in as coach first.");
      return;
    }

    setClientInviteBusy(true);
    inviteStatus("Saving client, then sending invite...");

    try {
      const saveResult = await withSlowStatus(
        withRequestTimeout(
          saveProgramFromForm(form),
          "Saving the client is taking too long. Check your connection and try again.",
          45000
        ),
        "Still saving client before sending invite...",
        inviteStatus,
        8000
      );

      if (saveResult.error) {
        inviteStatus(saveResult.error.message || "Could not save this client before sending invite.");
        return;
      }

      const savedProgram = saveResult.data || {};
      const inviteEmail = normalizeEmail(savedProgram.client_email || requestedEmail);
      const clientName = String(savedProgram.client_name || formValue(form, "client_name")).trim();

      if (!isValidEmail(inviteEmail)) {
        inviteStatus("Saved client email is not valid. Fix it, save, then send the invite again.");
        return;
      }

      inviteStatus("Client saved. Sending invite email...");

      const response = await fetchWithTimeout(
        `${coachConfig.url}/functions/v1/invite-client`,
        {
          method: "POST",
          headers: {
            "apikey": coachConfig.anonKey,
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            email: inviteEmail,
            clientName,
            redirectTo: inviteRedirectUrl()
          })
        },
        90000
      );
      const result = await response.json().catch(() => ({}));
      const safeResult = result && typeof result === "object" ? result : {};
      const manualInviteUrl = typeof safeResult.manualInviteUrl === "string" ? safeResult.manualInviteUrl : "";

      if (!response.ok) {
        inviteStatus(
          safeResult.error || safeResult.message,
          manualInviteUrl
        );
        return;
      }

      inviteStatus(safeResult.message || `Invite sent to ${inviteEmail}.`);
    } catch (error) {
      const message = error.name === "AbortError"
        ? "Invite email is taking too long to send. The client was saved. Try sending the invite again."
        : error.message && error.message.includes("Saving the client")
          ? error.message
          : readableClientRequestError(
            error,
            "Client saved, but the invite email could not be sent from this connection. Try Send invite link again."
          );

      inviteStatus(message);
    } finally {
      setClientInviteBusy(false);
    }
  });
}

async function handleSaveProgress() {
  const button = document.getElementById("save-progress-button");
  const form = document.getElementById("program-editor");

  if (!button || !form) {
    return;
  }

  button.addEventListener("click", async () => {
    const email = formValue(form, "client_email").toLowerCase();
    const entryDate = formValue(form, "progress_date");

    if (!email) {
      progressStatus("Add the client email first.");
      return;
    }

    if (!entryDate) {
      progressStatus("Choose a date first.");
      return;
    }

    button.disabled = true;
    progressStatus("Saving check-in...");

    const payload = {
      client_email: email,
      entry_date: entryDate,
      bodyweight: numberOrNull(formValue(form, "progress_bodyweight")),
      bodyfat: numberOrNull(formValue(form, "progress_bodyfat")),
      goal_note: formValue(form, "progress_goal")
    };

    const { error } = await coachSupabase
      .from("client_progress")
      .upsert(payload, { onConflict: "client_email,entry_date" });

    if (error) {
      progressStatus(error.message);
      button.disabled = false;
      return;
    }

    await loadProgressForEmail(email);
    progressStatus("Check-in saved.");
    button.disabled = false;
  });
}

async function handleCoachSignOut() {
  const button = document.querySelector("[data-coach-sign-out]");

  if (!button) {
    return;
  }

  button.addEventListener("click", async () => {
    if (coachSupabase) {
      await coachSupabase.auth.signOut();
    }

    sendToCoachLogin();
  });
}

function handleNewClient() {
  const button = document.getElementById("new-client-button");

  if (!button) {
    return;
  }

  button.addEventListener("click", () => {
    const searchInput = document.getElementById("client-search-input");

    clientSearchTerm = "";
    if (searchInput) {
      searchInput.value = "";
    }

    fillForm();
    renderClientList();
    adminStatus("New client ready.");
  });
}

function handleStartNewProgram() {
  const button = document.getElementById("start-new-program-button");
  const form = document.getElementById("program-editor");

  if (!button || !form) {
    return;
  }

  button.addEventListener("click", async () => {
    const email = formValue(form, "client_email").toLowerCase();

    if (!email) {
      adminStatus("Choose or create a client first.");
      return;
    }

    button.disabled = true;
    adminStatus("Starting new program...");

    if (coachSupabase) {
      const { error } = await coachSupabase
        .from("client_programs")
        .update({ active: false })
        .eq("client_email", email)
        .eq("active", true);

      if (error) {
        adminStatus(error.message);
        button.disabled = false;
        return;
      }

      programs = programs.map((program) => (
        program.client_email === email ? { ...program, active: false } : program
      ));
    }

    clearProgramFields(form);
    renderClientList();
    adminStatus("New program ready. Fill it out, then save.");
    button.disabled = false;
  });
}

async function bootCoachAdmin() {
  if (!document.querySelector(".coach-admin-page")) {
    return;
  }

  renderWorkoutFields();
  handleAdminTabs();
  handleSelectedClientActions();
  handleSessionManualEditor();
  handleAdminLiveUpdates();
  handleWorkoutCards();
  handleSaveProfileChanges();
  handleProfileClientManagement();
  handleSaveClientDetails();
  handleSaveTrainingBlock();
  handleSaveWorkouts();
  handleCopyWorkouts();
  handleSaveCoachNotes();
  handleArchiveClient();
  handleArchivedClientsToggle();
  handleClientSelect();
  handleClientSearch();
  handleDeleteArchivedClient();
  handleCopyClientDialog();
  handleProgramHistoryActions();
  handleSendInvite();
  handleSaveProgress();
  handleTrainingLogDateFilter();
  handleCoachSignOut();
  handleNewClient();
  handleStartNewProgram();

  if (!coachSupabase) {
    sendToCoachLogin();
    return;
  }

  const { data } = await coachSupabase.auth.getSession();
  const user = data.session?.user;

  if (user) {
    await showAdminWorkspace(user);
  } else {
    sendToCoachLogin();
  }
}

bootCoachAdmin();
