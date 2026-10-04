/* Weekly workout plans for the signed-in client dashboard. */
(function attachWorkoutPlans(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FWB_CLIENT_WORKOUT_PLANS = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createWorkoutPlans(root) {
  "use strict";

  const table = "client_saved_workout_plans";
  const focusSchedules = {
    balanced: {
      2: ["full_body", "full_body"],
      3: ["full_body", "upper_body", "lower_body"],
      4: ["upper_body", "lower_body", "upper_body", "lower_body"],
      5: ["full_body", "upper_body", "lower_body", "upper_body", "lower_body"]
    },
    full_body: {
      2: ["full_body", "full_body"],
      3: ["full_body", "full_body", "full_body"],
      4: ["full_body", "full_body", "full_body", "full_body"],
      5: ["full_body", "full_body", "full_body", "full_body", "full_body"]
    },
    upper_lower: {
      2: ["upper_body", "lower_body"],
      3: ["upper_body", "lower_body", "full_body"],
      4: ["upper_body", "lower_body", "upper_body", "lower_body"],
      5: ["upper_body", "lower_body", "full_body", "upper_body", "lower_body"]
    }
  };
  const focusLabels = { full_body: "Full body", upper_body: "Upper body", lower_body: "Lower body" };
  let dialog;
  let context;
  let preview;
  let saved = [];
  let busy = false;
  let returnFocus;
  let currentView = "saved";

  function escape(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  function build(input, generator) {
    const days = Number(input.days);
    const schedule = focusSchedules[input.split]?.[days];
    if (!schedule || ![20, 30, 45, 60].includes(Number(input.minutes))
      || !["easy", "moderate", "challenging"].includes(input.intensity)
      || !Array.isArray(input.equipment) || !generator?.generate) {
      throw new Error("Choose your schedule, training focus, time, and equipment.");
    }
    const workouts = schedule.map((focus, index) => {
      try {
        const workout = generator.generate({ ...input, focus, minutes: Number(input.minutes),
          format: "single", seed: `${input.seed || Date.now()}:${index}` });
        return { ...workout, day: index + 1, title: `${focusLabels[focus]} · Day ${index + 1}` };
      } catch (error) {
        throw new Error(`Day ${index + 1}: ${error?.message || "This workout could not be generated."}`);
      }
    });
    return { version: 1, title: `${days}-day ${input.split === "upper_lower" ? "Upper / Lower" : input.split === "full_body" ? "Full Body" : "Balanced Strength"} Plan`,
      days, split: input.split, minutes: Number(input.minutes), intensity: input.intensity,
      equipment: [...input.equipment], workouts };
  }

  function validPlan(plan) {
    return plan && plan.version === 1 && typeof plan.title === "string"
      && Number.isInteger(plan.days) && plan.days >= 2 && plan.days <= 5
      && Array.isArray(plan.workouts) && plan.workouts.length === plan.days
      && plan.workouts.every((workout) => workout && typeof workout.title === "string"
        && Array.isArray(workout.exercises) && workout.exercises.length > 0
        && workout.exercises.every((exercise) => typeof exercise?.name === "string" && exercise.name.length > 0));
  }

  function status(message, error = false) {
    const node = dialog?.querySelector("[data-plan-status]");
    if (node) { node.textContent = message; node.classList.toggle("is-error", error); }
  }

  function setBusy(value) {
    busy = value;
    dialog?.setAttribute("aria-busy", String(value));
    dialog?.querySelectorAll("button, input, select").forEach((node) => { node.disabled = value; });
  }

  function formMarkup() {
    return `<form data-plan-form>
      <label>Workouts per week<select name="days"><option value="2">2 days</option><option value="3" selected>3 days</option><option value="4">4 days</option><option value="5">5 days</option></select></label>
      <label>Training focus<select name="split"><option value="balanced">Balanced strength</option><option value="full_body">Full body</option><option value="upper_lower">Upper / lower</option></select></label>
      <label>Time per workout<select name="minutes"><option value="20">20 minutes</option><option value="30" selected>30 minutes</option><option value="45">45 minutes</option><option value="60">60 minutes</option></select></label>
      <label>Intensity<select name="intensity"><option value="easy">Easy</option><option value="moderate" selected>Moderate</option><option value="challenging">Challenging</option></select></label>
      <fieldset><legend>Equipment available</legend>${(root.FWB_WORKOUT_GENERATOR?.EQUIPMENT_OPTIONS || [])
        .map((item) => `<label class="plan-equipment"><input type="checkbox" name="equipment" value="${escape(item.value)}" ${item.value === "full_gym" ? "checked" : ""}>${escape(item.label)}</label>`).join("")}</fieldset>
      <button class="plan-primary" type="submit">Generate weekly plan</button>
    </form><div data-plan-preview></div>`;
  }

  function planMarkup(plan, savedId = "") {
    return `<article class="saved-plan-detail"><h3>${escape(plan.title)}</h3><p>${plan.days} workouts per week · About ${plan.minutes} minutes each</p>
      <div class="saved-plan-days">${plan.workouts.map((workout, index) => `<section class="saved-plan-day"><h4>Day ${index + 1}: ${escape(workout.title.replace(/ · Day \d+$/, ""))}</h4>
        <p>${workout.exercises.length} exercises · About ${Math.round(Number(workout.estimatedMinutes) || plan.minutes)} minutes</p>
        <ul>${workout.exercises.map((exercise) => `<li>${escape(exercise.name)} <span>${escape(exercise.prescription || `${exercise.sets} sets`)}</span></li>`).join("")}</ul>
        ${savedId ? `<button type="button" data-plan-start="${escape(savedId)}" data-plan-day="${index}">Start this workout</button>` : ""}</section>`).join("")}</div>
      ${savedId ? `<button type="button" class="plan-delete" data-plan-delete="${escape(savedId)}">Delete this plan</button>` : '<button type="button" class="plan-primary" data-plan-save>Save to Saved Workout Program</button>'}</article>`;
  }

  function ensureDialog() {
    if (dialog?.isConnected) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "client-workout-plan-dialog";
    dialog.setAttribute("aria-labelledby", "client-workout-plan-heading");
    dialog.innerHTML = `<div class="plan-dialog-top"><div><p class="plan-kicker">Your training</p><h2 id="client-workout-plan-heading">Workout plans</h2></div><button type="button" data-plan-close aria-label="Close">×</button></div>
      <nav aria-label="Workout plan views"><button type="button" data-plan-view="saved">Saved Workout Program</button><button type="button" data-plan-view="generate">Generate Workout Plan</button></nav>
      <p data-plan-status role="status" aria-live="polite"></p><div data-plan-body></div>`;
    dialog.addEventListener("close", () => { returnFocus?.focus?.({ preventScroll: true }); context = null; preview = null; });
    dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
    dialog.addEventListener("click", handleClick);
    dialog.addEventListener("submit", handleSubmit);
    dialog.addEventListener("change", (event) => {
      if (!event.target.closest("[data-plan-form]")) return;
      if (event.target.matches('input[name="equipment"]') && event.target.checked) {
        const all = dialog.querySelectorAll('input[name="equipment"]');
        all.forEach((input) => {
          if (input !== event.target && (input.value === "full_gym" || event.target.value === "full_gym")) input.checked = false;
        });
      }
      preview = null;
      const review = dialog.querySelector("[data-plan-preview]");
      if (review) review.innerHTML = "";
      status("Preferences changed. Generate your updated plan before saving.");
    });
    document.body.append(dialog);
    return dialog;
  }

  function showView(view) {
    currentView = view;
    const body = dialog.querySelector("[data-plan-body]");
    dialog.querySelectorAll("[data-plan-view]").forEach((button) => button.classList.toggle("is-active", button.dataset.planView === view));
    if (view === "generate") {
      body.innerHTML = formMarkup();
      preview = null;
      status("Choose your schedule to build a reusable weekly plan.");
    } else {
      body.innerHTML = saved.length ? `<div class="saved-plan-list">${saved.map((row) => `<button type="button" data-plan-open="${escape(row.id)}"><strong>${escape(row.title)}</strong><span>${escape(row.plan.days)} workouts per week</span><span aria-hidden="true">→</span></button>`).join("")}</div><div data-plan-detail></div>`
        : '<p class="plan-empty">No saved plans yet. Generate a weekly plan to see it here.</p>';
      status(saved.length ? `${saved.length} saved ${saved.length === 1 ? "plan" : "plans"}` : "Your saved workout plans will appear here.");
    }
  }

  async function load() {
    const userId = context?.userId;
    if (!userId) throw new Error("Sign in to open your saved workout plans.");
    const { data, error } = await context.supabase.from(table).select("id,title,plan,created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    if (context?.userId !== userId) return;
    saved = (data || []).filter((row) => validPlan(row.plan));
  }

  async function open(view, options) {
    ensureDialog();
    context = options;
    returnFocus = options.returnFocus;
    saved = [];
    preview = null;
    dialog.showModal();
    showView(view);
    if (view === "saved") {
      status("Loading saved plans…");
      try { await load(); if (context === options && currentView === "saved") showView("saved"); }
      catch (error) { if (context === options) status(`Could not load plans: ${error.message}`, true); }
    }
  }

  function readForm(form) {
    const data = new FormData(form);
    return { days: Number(data.get("days")), split: data.get("split"), minutes: Number(data.get("minutes")),
      intensity: data.get("intensity"), equipment: data.getAll("equipment"),
      library: context.library, history: context.history, seed: `${Date.now()}-${Math.random()}` };
  }

  function handleSubmit(event) {
    if (!event.target.matches("[data-plan-form]") || busy) return;
    event.preventDefault();
    try {
      preview = build(readForm(event.target), root.FWB_WORKOUT_GENERATOR);
      dialog.querySelector("[data-plan-preview]").innerHTML = planMarkup(preview);
      status("Review your plan, then save it to your program library.");
      dialog.querySelector("[data-plan-preview]").scrollIntoView({ block: "start", behavior: "smooth" });
    } catch (error) { preview = null; dialog.querySelector("[data-plan-preview]").innerHTML = ""; status(error.message, true); }
  }

  async function handleClick(event) {
    if (busy) return;
    if (event.target.closest("[data-plan-close]")) { dialog.close(); return; }
    const viewButton = event.target.closest("[data-plan-view]");
    if (viewButton) {
      const view = viewButton.dataset.planView;
      showView(view);
      if (view === "saved") {
        status("Loading saved plans…");
        try { await load(); if (dialog.open && currentView === "saved") showView("saved"); }
        catch (error) { status(`Could not load plans: ${error.message}`, true); }
      }
      return;
    }
    if (event.target.closest("[data-plan-save]")) {
      if (!validPlan(preview) || !context?.userId) return;
      setBusy(true); status("Saving your plan…");
      try {
        const { data, error } = await context.supabase.from(table)
          .insert({ user_id: context.userId, title: preview.title, plan: preview })
          .select("id,title,plan,created_at").single();
        if (error || !data) throw error || new Error("The plan was not saved.");
        saved.unshift(data); preview = null;
        setBusy(false); showView("saved");
        dialog.querySelector(`[data-plan-open="${data.id}"]`)?.click();
        status("Your weekly plan is saved. Choose a day to start.");
      } catch (error) { setBusy(false); status(`Could not save plan: ${error.message}`, true); }
      return;
    }
    const openButton = event.target.closest("[data-plan-open]");
    if (openButton) {
      const row = saved.find((item) => item.id === openButton.dataset.planOpen);
      const detail = dialog.querySelector("[data-plan-detail]");
      if (row && detail) { detail.innerHTML = planMarkup(row.plan, row.id); detail.scrollIntoView({ block: "nearest" }); }
      return;
    }
    const startButton = event.target.closest("[data-plan-start]");
    if (startButton) {
      const row = saved.find((item) => item.id === startButton.dataset.planStart);
      const workout = row?.plan?.workouts?.[Number(startButton.dataset.planDay)];
      if (!workout) return;
      try {
        const accepted = await context.onStart(workout);
        if (accepted) { returnFocus = null; dialog.close(); }
      } catch (error) { status(error.message, true); }
      return;
    }
    const deleteButton = event.target.closest("[data-plan-delete]");
    if (deleteButton) {
      const row = saved.find((item) => item.id === deleteButton.dataset.planDelete);
      if (!row || !root.confirm(`Delete ${row.title}? This cannot be undone.`)) return;
      setBusy(true); status("Deleting plan…");
      try {
        const { error } = await context.supabase.from(table).delete().eq("id", row.id).eq("user_id", context.userId);
        if (error) throw error;
        saved = saved.filter((item) => item.id !== row.id);
        setBusy(false); showView("saved"); status("Plan deleted.");
      } catch (error) { setBusy(false); status(`Could not delete plan: ${error.message}`, true); }
    }
  }

  return { build, validPlan, open };
}));
