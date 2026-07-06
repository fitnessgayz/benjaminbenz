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

let programs = [];
let selectedProgramId = "";
let progressEntries = [];
let trainingLogs = [];

function adminStatus(message) {
  const status = document.getElementById("admin-save-status");

  if (status) {
    status.textContent = message;
  }
}

function loginStatus(message) {
  const status = document.getElementById("coach-login-status");

  if (status) {
    status.textContent = message;
  }
}

function inviteStatus(message) {
  const status = document.getElementById("invite-status");

  if (status) {
    status.textContent = message;
  }
}

function progressStatus(message) {
  const status = document.getElementById("progress-status");

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
  const workouts = workoutSlots
    .filter((number) => workoutIsIncluded(form, number))
    .map((number) => buildWorkoutFromForm(form, number))
    .filter((workout) => workout.title || workout.focus || workout.exercises.length);

  return {
    client_email: formValue(form, "client_email").toLowerCase(),
    client_name: clientName,
    initials: formValue(form, "initials") || initialsFromName(clientName),
    program_title: formValue(form, "program_title"),
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
    active: form.elements.active.checked
  };
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
    loadProgressForEmail(program.client_email);
    loadTrainingLogsForEmail(program.client_email);
  } else {
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

function renderClientList() {
  const list = document.getElementById("client-list");

  if (!list) {
    return;
  }

  if (programs.length === 0) {
    list.innerHTML = '<p class="empty-state">No client programs yet.</p>';
    return;
  }

  list.innerHTML = programs.map((program) => `
    <button class="client-list-button${program.id === selectedProgramId ? " is-selected" : ""}" type="button" data-program-id="${program.id}">
      <strong>${program.client_name || "Client"}</strong>
      <span>${program.client_email || ""} · ${program.active ? "Active" : "Archived"}</span>
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

  if (programs.length > 0) {
    fillForm(programs[0]);
  } else {
    fillForm();
  }

  renderClientList();
  adminStatus("Ready.");
}

async function showAdminWorkspace(user) {
  const loginPanel = document.getElementById("coach-login-panel");
  const workspace = document.getElementById("coach-admin-workspace");
  const signOutButton = document.querySelector("[data-coach-sign-out]");

  if (!isCoachEmail(user.email)) {
    loginStatus("This login is not set up as a coach admin.");
    return;
  }

  if (loginPanel) {
    loginPanel.hidden = true;
  }

  if (workspace) {
    workspace.hidden = false;
  }

  if (signOutButton) {
    signOutButton.hidden = false;
  }

  await loadPrograms();
}

async function handleCoachLogin() {
  const form = document.getElementById("coach-login-form");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!coachSupabase) {
      loginStatus("Coach admin is not connected yet.");
      return;
    }

    loginStatus("Signing in...");

    const data = new FormData(form);
    const email = data.get("email");
    const password = data.get("password");
    const { data: loginData, error } = await coachSupabase.auth.signInWithPassword({ email, password });

    if (error) {
      loginStatus("That email or password did not work.");
      return;
    }

    await showAdminWorkspace(loginData.user);
  });
}

async function handleSave() {
  const form = document.getElementById("program-editor");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    adminStatus("Saving...");

    const payload = programFromForm(form);
    const id = form.elements.id.value;

    if (!id && payload.active && payload.client_email) {
      const { error: archiveError } = await coachSupabase
        .from("client_programs")
        .update({ active: false })
        .eq("client_email", payload.client_email)
        .eq("active", true);

      if (archiveError) {
        adminStatus(archiveError.message);
        return;
      }

      programs = programs.map((program) => (
        program.client_email === payload.client_email ? { ...program, active: false } : program
      ));
    }

    const query = id
      ? coachSupabase.from("client_programs").update(payload).eq("id", id).select("*").single()
      : coachSupabase.from("client_programs").insert(payload).select("*").single();

    const { data, error } = await query;

    if (error) {
      adminStatus(error.message);
      return;
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
    adminStatus("Saved.");
  });
}

async function handleSendInvite() {
  const button = document.getElementById("send-invite-button");
  const form = document.getElementById("program-editor");

  if (!button || !form) {
    return;
  }

  button.addEventListener("click", async () => {
    const email = formValue(form, "client_email").toLowerCase();

    if (!email) {
      inviteStatus("Add the client email first.");
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
    inviteStatus("Sending invite...");

    try {
      const response = await fetch(`${coachConfig.url}/functions/v1/invite-client`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          redirectTo: `${window.location.origin}/client-invite.html`
        })
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        inviteStatus(result.error || "Could not send invite.");
        return;
      }

      inviteStatus(result.message || `Invite sent to ${email}.`);
    } catch (error) {
      inviteStatus("Could not reach the invite function.");
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

    window.location.reload();
  });
}

function handleNewClient() {
  const button = document.getElementById("new-client-button");

  if (!button) {
    return;
  }

  button.addEventListener("click", () => {
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
  handleCoachLogin();
  handleSave();
  handleSendInvite();
  handleSaveProgress();
  handleCoachSignOut();
  handleNewClient();
  handleStartNewProgram();

  if (!coachSupabase) {
    loginStatus("Coach admin is not connected yet.");
    return;
  }

  const { data } = await coachSupabase.auth.getSession();
  const user = data.session?.user;

  if (user) {
    await showAdminWorkspace(user);
  }
}

bootCoachAdmin();
