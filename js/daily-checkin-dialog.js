/* Daily client check-in and review. Persistence and workout navigation belong to the portal. */
(() => {
  "use strict";

  let dialog = null;
  let ui = null;
  let context = null;
  let recommendation = null;
  let busy = false;
  let generation = 0;

  const ratings = [
    { name: "mood", title: "Mood", labels: ["Very low", "Low", "Okay", "Good", "Great"] },
    { name: "energy", title: "Energy", labels: ["Exhausted", "Low", "Okay", "Good", "Full of energy"] },
    { name: "sleep", title: "Sleep", labels: ["Very poor", "Poor", "Okay", "Good", "Well rested"] },
    { name: "soreness", title: "Muscle soreness", labels: ["Fresh", "A little sore", "Moderately sore", "Sore", "Very sore"] }
  ];

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function button(text, className = "") {
    const node = element("button", `daily-checkin-button ${className}`.trim(), text);
    node.type = "button";
    return node;
  }

  function errorMessage(error, fallback) {
    return typeof error?.message === "string" && error.message.trim() ? error.message : fallback;
  }

  function setStatus(message, isError = false) {
    ui.status.textContent = message;
    ui.status.classList.toggle("is-error", isError);
    if (isError) ui.status.scrollIntoView?.({ block: "nearest" });
  }

  function setBusy(value) {
    busy = value;
    dialog.setAttribute("aria-busy", String(value));
    ui.fields.disabled = value;
    for (const control of dialog.querySelectorAll("button")) control.disabled = value;
    if (context?.gymCheckedIn) ui.gym.disabled = true;
    ui.save.textContent = value ? "Saving…" : "Save & see today’s workout";
  }

  function finish({ restoreFocus = true, dismiss = true } = {}) {
    const previous = context;
    if (!previous) return;
    generation++;
    context = null;
    recommendation = null;
    busy = false;
    document.body.classList.remove("daily-checkin-open");
    if (restoreFocus && previous.returnFocus?.isConnected && !previous.returnFocus.disabled) {
      previous.returnFocus.focus?.({ preventScroll: true });
    }
    if (dismiss && typeof previous.onDismiss === "function") previous.onDismiss();
  }

  // Explicit close can invalidate an in-flight save when an account changes.
  // User-initiated close and Escape remain disabled during writes.
  function close(options = {}) {
    if (!dialog?.open) return;
    const previous = context;
    context = null;
    dialog.close();
    context = previous;
    finish(options);
  }

  function dismiss() {
    if (!busy) close();
  }

  function focusHeading() {
    ui.heading.focus({ preventScroll: true });
    dialog.scrollTop = 0;
  }

  function showStage(stage) {
    ui.welcome.hidden = stage !== "welcome";
    ui.form.hidden = stage !== "checkin";
    ui.review.hidden = stage !== "recommendation";
    ui.heading.textContent = stage === "recommendation" ? "Your workout for today" : "How are you feeling today?";
    ui.description.textContent = stage === "welcome"
      ? "Check in with yourself, then find a workout that fits your energy and recovery today."
      : stage === "checkin"
        ? "Tell us about your mood, energy, sleep, and soreness. You’ll review today’s workout after saving."
        : "Choose the session that feels right today. Your assigned program stays the same.";
    setStatus("");
    focusHeading();
  }

  function ratingField(config) {
    const field = element("fieldset", "daily-checkin-rating");
    field.append(element("legend", "", config.title));
    const choices = element("div", "daily-checkin-rating-options");
    const inputs = config.labels.map((text, index) => {
      const label = element("label", "daily-checkin-rating-choice");
      const input = element("input");
      input.type = "radio";
      input.name = `daily_${config.name}`;
      input.value = String(index + 1);
      input.required = true;
      input.setAttribute("aria-label", `${index + 1} — ${text}`);
      const visible = element("span", "", String(index + 1));
      visible.setAttribute("aria-hidden", "true");
      label.append(input, visible);
      choices.append(label);
      return input;
    });
    const scale = element("div", "daily-checkin-rating-scale");
    scale.setAttribute("aria-hidden", "true");
    scale.append(element("span", "", `1 · ${config.labels[0]}`), element("span", "", `5 · ${config.labels[4]}`));
    field.append(choices, scale);
    return { field, inputs };
  }

  function readCheckIn() {
    const values = {};
    for (const rating of ratings) {
      const selected = ui.ratings[rating.name].find((input) => input.checked);
      if (!selected) {
        setStatus(`Choose a rating for ${rating.title.toLowerCase()} to continue.`, true);
        ui.ratings[rating.name][0].focus();
        return null;
      }
      values[rating.name] = Number(selected.value);
    }
    values.note = ui.note.value.trim();
    return values;
  }

  async function save(event) {
    event.preventDefault();
    if (busy || !context) return;
    const checkIn = readCheckIn();
    if (!checkIn) return;
    if (typeof context.onSave !== "function") {
      setStatus("Check-in is unavailable. Reload the app and try again.", true);
      return;
    }
    const token = generation;
    const saveCheckIn = context.onSave;
    setBusy(true);
    setStatus("Saving your check-in…");
    try {
      const result = await saveCheckIn(checkIn);
      if (generation !== token || !context) return;
      if (!result || typeof result !== "object") throw new Error("Your recommendation couldn’t be loaded. Please try again.");
      recommendation = result;
      renderRecommendation();
      showStage("recommendation");
      setStatus("Check-in saved. Review your workout below.");
    } catch (error) {
      if (generation === token && context) setStatus(errorMessage(error, "Your check-in couldn’t be saved. Please try again."), true);
    } finally {
      if (generation === token && context) setBusy(false);
    }
  }

  function displayWorkoutTitle(workout) {
    return String(workout?.title || "Today’s workout")
      .replace(/^Custom workout\s*·\s*Today:\s*/i, "")
      .replace(/\s*·\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "");
  }

  function appendList(parent, values, className) {
    if (!Array.isArray(values) || !values.length) return;
    const list = element("ul", className);
    for (const value of values) list.append(element("li", "", value));
    parent.append(list);
  }

  function renderRecommendation() {
    const current = recommendation;
    ui.result.replaceChildren();
    const levelLabels = { planned: "Feeling ready", lighter: "A shorter session", recovery: "Time to recover" };
    ui.result.append(element("p", "daily-checkin-result-label", levelLabels[current.level] || "Made for today"));
    ui.result.append(element("h3", "daily-checkin-result-title", current.headline || "Here’s a workout for today"));
    appendList(ui.result, current.reasons, "daily-checkin-reasons");
    if (Array.isArray(current.changes) && current.changes.length) {
      ui.result.append(element("h4", "daily-checkin-section-title", "For today’s session"));
      appendList(ui.result, current.changes, "daily-checkin-changes");
    }
    const workout = current.workout;
    if (workout) {
      const preview = element("section", "daily-checkin-workout");
      preview.append(element("h4", "daily-checkin-workout-title", displayWorkoutTitle(workout)));
      if (workout.format) preview.append(element("p", "daily-checkin-muted", String(workout.format).replace(/_/g, " ")));
      const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];
      const list = element("ol", "daily-checkin-exercises");
      for (const exercise of exercises) {
        const row = element("li", "daily-checkin-exercise");
        const heading = element("div", "daily-checkin-exercise-heading");
        if (exercise.code) heading.append(element("span", "daily-checkin-exercise-code", exercise.code));
        heading.append(element("h5", "", exercise.name || exercise.title || "Exercise"));
        row.append(heading);
        const target = exercise.prescription || [exercise.sets ? `${exercise.sets} sets` : "", exercise.reps].filter(Boolean).join(" · ");
        if (target) row.append(element("p", "daily-checkin-prescription", target));
        if (exercise.rest) row.append(element("p", "daily-checkin-muted", `Rest: ${exercise.rest}`));
        if (exercise.instructions) {
          const notes = element("details", "daily-checkin-notes");
          notes.append(element("summary", "", "Exercise notes"), element("p", "", exercise.instructions));
          row.append(notes);
        }
        list.append(row);
      }
      preview.append(list);
      ui.result.append(preview);
    } else {
      ui.result.append(element("p", "daily-checkin-fallback", current.level === "recovery"
        ? "Rest is an option today. If you’d like to move, review an easy workout before starting."
        : "Create a workout using the exercise library, then review it before starting."));
    }
    ui.use.hidden = !workout || typeof context.onUse !== "function";
    ui.original.hidden = !current.originalWorkout || typeof context.onKeepOriginal !== "function";
    ui.generate.hidden = Boolean(workout) || typeof context.onGenerate !== "function";
    ui.generate.textContent = current.generatorPreferences?.intensity === "easy" || current.level !== "planned"
      ? "Create an easy workout" : "Create today’s workout";
    ui.update.hidden = typeof context.onSave !== "function";
    ui.gym.hidden = typeof context.onGym !== "function";
    ui.gym.textContent = context.gymCheckedIn ? "✓ Checked in at the gym" : "Gym check-in";
    ui.gym.disabled = Boolean(context.gymCheckedIn);
  }

  async function act(name) {
    if (busy || !context || !recommendation || typeof context[name] !== "function") return;
    if (name === "onGym" && context.gymCheckedIn) return;
    const token = generation;
    const action = context[name];
    const current = recommendation;
    setBusy(true);
    setStatus(name === "onGym" ? "Checking in at the gym…" : "Opening your workout…");
    try {
      const accepted = await action(current);
      if (token !== generation || !context) return;
      if (name === "onGym") {
        if (accepted === false) setStatus("Gym check-in wasn’t completed. Please try again.", true);
        else {
          context.gymCheckedIn = true;
          ui.gym.textContent = "✓ Checked in at the gym";
          setStatus(typeof accepted === "string" ? accepted : "You’re checked in at the gym for today.");
        }
      } else if (accepted === true) {
        close({ restoreFocus: false, dismiss: false });
      } else {
        setStatus("Your recommendation is here when you’re ready.");
      }
    } catch (error) {
      if (token === generation && context) setStatus(errorMessage(error, name === "onGym"
        ? "Gym check-in couldn’t be saved. Please try again."
        : "Your workout couldn’t be opened. Please try again."), true);
    } finally {
      if (token === generation && context) setBusy(false);
    }
  }

  function ensureDialog() {
    if (dialog?.isConnected) return dialog;
    dialog = element("dialog", "daily-checkin-dialog");
    dialog.id = "daily-checkin-dialog";
    dialog.setAttribute("aria-labelledby", "daily-checkin-title");
    dialog.setAttribute("aria-describedby", "daily-checkin-description");
    const header = element("header", "daily-checkin-heading");
    const headingCopy = element("div");
    const heading = element("h2");
    heading.id = "daily-checkin-title";
    heading.tabIndex = -1;
    headingCopy.append(element("p", "daily-checkin-kicker", "Daily check-in"), heading);
    const closeButton = button("×", "daily-checkin-close");
    closeButton.setAttribute("aria-label", "Close daily check-in");
    closeButton.addEventListener("click", dismiss);
    header.append(headingCopy, closeButton);
    const description = element("p", "daily-checkin-description");
    description.id = "daily-checkin-description";
    const welcome = element("div", "daily-checkin-welcome daily-checkin-actions");
    const checkIn = button("Check in", "daily-checkin-start");
    checkIn.addEventListener("click", () => { if (!busy) showStage("checkin"); });
    const skip = button("Skip for now", "daily-checkin-secondary daily-checkin-skip");
    skip.addEventListener("click", dismiss);
    welcome.append(checkIn, skip);
    const form = element("form", "daily-checkin-form");
    const fields = element("fieldset", "daily-checkin-fields");
    const ratingInputs = {};
    for (const config of ratings) {
      const rating = ratingField(config);
      ratingInputs[config.name] = rating.inputs;
      fields.append(rating.field);
    }
    const noteLabel = element("label", "daily-checkin-note");
    noteLabel.append(element("span", "", "Anything else? (optional)"));
    const note = element("textarea");
    note.name = "daily_note";
    note.maxLength = 1000;
    note.rows = 3;
    note.placeholder = "Anything you’d like your coach to know";
    noteLabel.append(note);
    fields.append(noteLabel);
    const saveButton = button("Save & see today’s workout", "daily-checkin-save");
    saveButton.type = "submit";
    form.append(fields, saveButton);
    form.addEventListener("submit", save);
    const review = element("section", "daily-checkin-review");
    const result = element("div", "daily-checkin-result");
    const actions = element("div", "daily-checkin-actions");
    const use = button("Open today’s workout", "daily-checkin-use");
    const original = button("Keep my planned workout", "daily-checkin-secondary daily-checkin-original");
    const generate = button("Create an easy workout", "daily-checkin-generate");
    const update = button("Update check-in", "daily-checkin-secondary daily-checkin-update");
    const gym = button("Gym check-in", "daily-checkin-secondary daily-checkin-gym");
    use.addEventListener("click", () => act("onUse"));
    original.addEventListener("click", () => act("onKeepOriginal"));
    generate.addEventListener("click", () => act("onGenerate"));
    update.addEventListener("click", () => { if (!busy && context) showStage("checkin"); });
    gym.addEventListener("click", () => act("onGym"));
    actions.append(use, original, generate, update, gym);
    review.append(result, actions);
    const status = element("p", "daily-checkin-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    dialog.append(header, description, welcome, form, review, status);
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); dismiss(); });
    dialog.addEventListener("close", () => { if (!dialog.open) finish(); });
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog || busy) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dismiss();
    });
    ui = { heading, description, welcome, form, fields, ratings: ratingInputs, note, save: saveButton, review, result, use, original, generate, update, gym, status };
    document.body.append(dialog);
    return dialog;
  }

  function open(options = {}) {
    if (typeof document === "undefined" || !document.body) return false;
    const node = ensureDialog();
    if (typeof node.showModal !== "function") return false;
    if (node.open) close({ restoreFocus: false, dismiss: false });
    generation++;
    context = { ...options, returnFocus: options.returnFocus || document.activeElement };
    recommendation = options.recommendation || null;
    for (const rating of ratings) {
      const initial = Number(options.initialCheckIn?.[rating.name]);
      for (const input of ui.ratings[rating.name]) input.checked = Number(input.value) === initial;
    }
    ui.note.value = String(options.initialCheckIn?.note || "");
    ui.result.replaceChildren();
    const stage = options.stage === "recommendation" && recommendation ? "recommendation" : options.stage === "checkin" ? "checkin" : "welcome";
    if (stage === "recommendation") renderRecommendation();
    setBusy(false);
    showStage(stage);
    try { node.showModal(); }
    catch (_) { context = null; return false; }
    document.body.classList.add("daily-checkin-open");
    focusHeading();
    return true;
  }

  const api = { open, close, isOpen: () => Boolean(dialog?.open) };
  if (typeof window !== "undefined") window.FWB_DAILY_CHECKIN_DIALOG = api;
  if (typeof module !== "undefined" && module.exports) module.exports = { ...api, displayWorkoutTitle };
})();
