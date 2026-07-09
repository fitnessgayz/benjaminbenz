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

let programs = [];
let selectedProgramId = "";
let progressEntries = [];
let trainingLogs = [];
let showingArchivedClients = false;
let clientSearchTerm = "";

function adminStatus(message) {
  const status = document.getElementById("admin-save-status");

  if (status) {
    status.textContent = message;
  }
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

function trainingLogStatus(message) {
  const history = document.getElementById("training-log-history");

  if (history) {
    history.innerHTML = `<p class="empty-state">${message}</p>`;
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
    program.program_title
  ].join(" ").toLowerCase();
}

function programsForCurrentClientView() {
  const basePrograms = showingArchivedClients
    ? archivedClientPrograms()
    : programs.filter((program) => program.active !== false && program.client_archived !== true);

  if (!clientSearchTerm) {
    const selectedProgram = basePrograms.find((program) => program.id === selectedProgramId);

    return selectedProgram ? [selectedProgram] : [];
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
      const [code = "", name = "", prescription = "", rest = ""] = line.split("|").map((part) => part.trim());

      return { code, name, prescription, rest };
    });
}

function exercisesToText(exercises) {
  if (!Array.isArray(exercises)) {
    return "";
  }

  return exercises
    .map((exercise) => [
      exercise.code || "",
      exercise.name || "",
      exercise.prescription || "",
      exercise.rest || ""
    ].join(" | "))
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
    initials: formValue(form, "initials") || initialsFromName(clientName || fallbackClientName),
    program_title: formValue(form, "program_title") || "Client Program",
    program_summary: formValue(form, "program_summary"),
    sheet_url: formValue(form, "sheet_url") || null,
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

async function saveProgramFromForm(form) {
  const payload = programFromForm(form);
  const id = form.elements.id.value;

  if (!payload.client_email) {
    return { error: { message: "Add the client email first." } };
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
    sheet_url: formValue(form, "sheet_url") || null,
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
  form.elements.sheet_url.value = "";
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
}

function renderWorkoutFields() {
  const container = document.getElementById("workout-fields");

  if (!container) {
    return;
  }

  container.innerHTML = workoutSlots.map((number) => `
    <section class="admin-card workout-editor-card" data-workout-card="${number}">
      <div class="admin-section-heading workout-card-heading">
        <h2>Workout ${number}</h2>
        <label class="toggle-label workout-include-label">
          <input type="checkbox" name="workout_${number}_include" />
          Include
        </label>
      </div>
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
        <textarea class="exercise-textarea" name="workout_${number}_exercises" placeholder="A1 | Exercise name | 15 reps x 4 sets | 60-90s rest"></textarea>
      </label>
    </section>
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
  form.elements.initials.value = program.initials || "";
  form.elements.height.value = program.height || "";
  form.elements.starting_weight.value = program.starting_weight || "";
  form.elements.starting_bodyfat.value = program.starting_bodyfat || "";
  form.elements.program_title.value = program.program_title || "";
  form.elements.fitness_goal.value = program.fitness_goal || "";
  form.elements.focus_target.value = program.focus_target || "";
  form.elements.sheet_url.value = program.sheet_url || "";
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

  if (trainingLogs.length === 0) {
    history.innerHTML = '<p class="empty-state">No weights logged yet.</p>';
    return;
  }

  history.innerHTML = trainingLogs.map((log) => `
    <div class="training-log-row">
      <strong>${log.entry_date}</strong>
      <span>${log.workout_title}</span>
      <span>${log.exercise_code} ${log.exercise_name}${log.set_number ? ` · set ${log.set_number}` : ""}</span>
      <em>${log.weight_used} lb${log.reps ? ` x ${log.reps}` : ""}</em>
    </div>
  `).join("");
}

async function loadTrainingLogsForEmail(email) {
  if (!coachSupabase || !email) {
    return;
  }

  trainingLogStatus("Loading weights...");

  const { data, error } = await coachSupabase
    .from("client_workout_logs")
    .select("*")
    .eq("client_email", email)
    .order("entry_date", { ascending: false })
    .order("workout_title", { ascending: true })
    .order("exercise_code", { ascending: true })
    .order("set_number", { ascending: true })
    .limit(40);

  if (error) {
    trainingLogs = [];
    trainingLogStatus("Could not load weights. Run the training log SQL in Supabase.");
    return;
  }

  trainingLogs = data || [];
  renderTrainingLogs();
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
      <div>
        <strong>${program.program_title || "Client Program"}</strong>
        <span>${programHistoryLabel(program)} · ${program.updated_at ? new Date(program.updated_at).toLocaleDateString() : "No date"}</span>
      </div>
      <div class="program-history-actions">
        <button class="button button-ghost" type="button" data-program-history-view="${program.id}">View</button>
        <button class="button button-ghost" type="button" data-program-history-copy="${program.id}">Copy</button>
        <button class="button button-ghost" type="button" data-program-history-restore="${program.id}"${program.active !== false && !program.client_archived ? " disabled" : ""}>Restore</button>
      </div>
    </article>
  `).join("");
}

function renderClientList() {
  const list = document.getElementById("client-list");
  const archiveButton = document.getElementById("archive-client-button");
  const archivedButton = document.getElementById("archived-clients-button");
  const deleteArchivedButton = document.getElementById("delete-archived-client-button");
  const visiblePrograms = programsForCurrentClientView();
  const selectedProgram = programs.find((program) => program.id === selectedProgramId);

  if (!list) {
    return;
  }

  if (archiveButton) {
    archiveButton.disabled = !selectedProgramId;
    archiveButton.textContent = selectedProgram?.client_archived === true ? "Restore" : "Archive";
    archiveButton.hidden = showingArchivedClients && !selectedProgramId;
  }

  if (archivedButton) {
    archivedButton.textContent = showingArchivedClients ? "Active clients" : "Archived clients";
    archivedButton.classList.toggle("is-selected", showingArchivedClients);
  }

  if (deleteArchivedButton) {
    deleteArchivedButton.hidden = !showingArchivedClients;
    deleteArchivedButton.disabled = selectedProgram?.client_archived !== true;
  }

  if (visiblePrograms.length === 0) {
    const clientType = showingArchivedClients ? "archived" : "active";
    const message = clientSearchTerm
      ? `No ${clientType} clients match that search.`
      : `Search ${clientType} clients by name or email.`;

    list.innerHTML = `<p class="empty-state">${message}</p>`;
    return;
  }

  list.innerHTML = visiblePrograms.map((program) => `
    <button class="client-list-button${program.id === selectedProgramId ? " is-selected" : ""}" type="button" data-program-id="${program.id}">
      <strong>${program.client_name || "Client"}</strong>
      <span>${program.client_email || ""}</span>
    </button>
  `).join("");

  list.querySelectorAll("[data-program-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const program = programs.find((item) => item.id === button.dataset.programId);

      fillForm(program);
      renderClientList();
      adminStatus("Ready.");
    });
  });
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

async function handleSave() {
  const form = document.getElementById("program-editor");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    adminStatus("Saving...");

    const { error } = await saveProgramFromForm(form);

    if (error) {
      adminStatus(error.message);
      return;
    }
    adminStatus("Saved.");
  });
}

function handleSaveNewClient() {
  const button = document.getElementById("save-new-client-button");
  const form = document.getElementById("program-editor");

  if (!button || !form) {
    return;
  }

  button.addEventListener("click", () => {
    if (form.elements.id.value) {
      adminStatus("Use New first, then Save new client.");
      return;
    }

    adminStatus("Saving new client...");
    form.requestSubmit();
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

async function handleArchiveClient() {
  const button = document.getElementById("archive-client-button");
  const form = document.getElementById("program-editor");

  if (!button || !form) {
    return;
  }

  button.addEventListener("click", async () => {
    const id = form.elements.id.value || selectedProgramId;
    const selectedProgram = programs.find((program) => program.id === id);

    if (!id || !selectedProgram) {
      adminStatus("Choose a client first.");
      return;
    }

    const shouldRestore = selectedProgram.client_archived === true;
    const label = selectedProgram.client_name || selectedProgram.client_email || "this client";
    const actionLabel = shouldRestore ? "restore" : "archive";
    const confirmed = window.confirm(`${shouldRestore ? "Restore" : "Archive"} ${label}?`);

    if (!confirmed) {
      return;
    }

    button.disabled = true;
    adminStatus(`${shouldRestore ? "Restoring" : "Archiving"} client...`);

    const { error } = await coachSupabase
      .from("client_programs")
      .update({ client_archived: !shouldRestore })
      .eq("client_email", selectedProgram.client_email);

    if (error) {
      adminStatus(error.message);
      button.disabled = false;
      return;
    }

    let restoredProgram = selectedProgram;

    if (shouldRestore && selectedProgram.active === false) {
      const hasActiveProgram = programs.some((program) => (
        program.client_email === selectedProgram.client_email && program.active !== false
      ));

      if (!hasActiveProgram) {
        const { data: restoredData, error: restoreError } = await coachSupabase
          .from("client_programs")
          .update({ active: true, client_archived: false })
          .eq("id", selectedProgram.id)
          .select("*")
          .single();

        if (restoreError) {
          adminStatus(restoreError.message);
          button.disabled = false;
          return;
        }

        restoredProgram = restoredData;
      }
    }

    programs = programs.map((program) => (
      program.client_email === selectedProgram.client_email
        ? {
          ...program,
          client_archived: !shouldRestore,
          active: program.id === restoredProgram.id ? restoredProgram.active : program.active,
          ...(program.id === restoredProgram.id ? restoredProgram : {})
        }
        : program
    ));
    const nextProgram = programsForCurrentClientView()[0] || {};

    selectedProgramId = nextProgram.id || "";
    fillForm(nextProgram);
    renderClientList();
    adminStatus(`Client ${actionLabel}d.`);
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

    fillForm(visiblePrograms[0] || {});
    renderClientList();
    adminStatus(showingArchivedClients ? "Showing archived clients." : "Showing active clients.");
  });
}

function handleClientSearch() {
  const input = document.getElementById("client-search-input");

  if (!input) {
    return;
  }

  input.addEventListener("input", () => {
    clientSearchTerm = input.value.trim().toLowerCase();

    const visiblePrograms = programsForCurrentClientView();
    const selectedVisible = visiblePrograms.some((program) => program.id === selectedProgramId);

    if (clientSearchTerm && !selectedVisible) {
      fillForm(visiblePrograms[0] || {});
    }

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
    const selectedProgram = programs.find((program) => program.id === id);

    if (!id || selectedProgram?.client_archived !== true) {
      adminStatus("Choose an archived client first.");
      return;
    }

    const label = selectedProgram.client_name || selectedProgram.client_email || "this archived client";
    const confirmed = window.confirm(`Permanently delete ${label} from archived clients?`);

    if (!confirmed) {
      return;
    }

    button.disabled = true;
    adminStatus("Deleting archived client...");

    const { error } = await coachSupabase
      .from("client_programs")
      .delete()
      .eq("client_email", selectedProgram.client_email)
      .eq("client_archived", true);

    if (error) {
      adminStatus(error.message);
      button.disabled = false;
      return;
    }

    programs = programs.filter((program) => program.client_email !== selectedProgram.client_email);
    const nextProgram = programsForCurrentClientView()[0] || {};

    selectedProgramId = nextProgram.id || "";
    fillForm(nextProgram);
    renderClientList();
    adminStatus("Archived client deleted.");
  });
}

function handleProgramHistoryActions() {
  document.addEventListener("click", async (event) => {
    const viewButton = event.target.closest("[data-program-history-view]");
    const copyButton = event.target.closest("[data-program-history-copy]");
    const restoreButton = event.target.closest("[data-program-history-restore]");
    const button = viewButton || copyButton || restoreButton;

    if (!button) {
      return;
    }

    const programId = button.dataset.programHistoryView || button.dataset.programHistoryCopy || button.dataset.programHistoryRestore;
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
      fillForm({
        ...program,
        id: "",
        active: true,
        client_archived: false,
        program_title: `${program.program_title || "Client Program"} copy`
      });
      renderClientList();
      adminStatus("Program copied as a new draft. Save when ready.");
      programHistoryStatus("Copied as a new draft.");
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

    button.disabled = true;
    inviteStatus("Saving client, then sending invite...");

    const saveResult = await saveProgramFromForm(form);

    if (saveResult.error) {
      inviteStatus(saveResult.error.message || "Could not save this client before sending invite.");
      button.disabled = false;
      return;
    }

    const savedProgram = saveResult.data || {};
    const inviteEmail = normalizeEmail(savedProgram.client_email || requestedEmail);
    const clientName = String(savedProgram.client_name || formValue(form, "client_name")).trim();

    if (!isValidEmail(inviteEmail)) {
      inviteStatus("Saved client email is not valid. Fix it, save, then send the invite again.");
      button.disabled = false;
      return;
    }

    try {
      const response = await fetch(`${coachConfig.url}/functions/v1/invite-client`, {
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
      });
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
      inviteStatus(`Could not reach the invite function: ${error.message}`);
    } finally {
      button.disabled = false;
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
  handleSave();
  handleSaveNewClient();
  handleSaveTrainingBlock();
  handleSaveCoachNotes();
  handleArchiveClient();
  handleArchivedClientsToggle();
  handleClientSearch();
  handleDeleteArchivedClient();
  handleProgramHistoryActions();
  handleSendInvite();
  handleSaveProgress();
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
