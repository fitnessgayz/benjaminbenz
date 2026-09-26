/* Client workout preferences and review. Applying a preview remains owned by the portal. */
(() => {
  "use strict";

  let dialog = null;
  let ui = null;
  let context = null;
  let preview = null;
  let busy = false;
  let restoreFocus = true;
  let generation = 0;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function button(text, className) {
    const node = element("button", className, text);
    node.type = "button";
    return node;
  }

  function safeDemoUrl(value) {
    if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) return "";
    try {
      const url = new URL(value.trim());
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function setStatus(message, isError = false) {
    ui.status.textContent = message;
    ui.status.classList.toggle("is-error", isError);
  }

  function errorMessage(error, fallback) {
    return error && typeof error.message === "string" && error.message.trim() ? error.message : fallback;
  }

  function close() {
    if (dialog?.open && !busy) dialog.close();
  }

  function field(labelText, name, options) {
    const label = element("label", "workout-generator-field");
    label.append(element("span", "workout-generator-label", labelText));
    const select = element("select");
    select.name = name;
    select.id = `workout-generator-${name}`;
    for (const option of options) {
      const item = element("option", "", option.label);
      item.value = option.value;
      select.append(item);
    }
    label.append(select);
    return { label, select };
  }

  function setBusy(value) {
    busy = value;
    dialog.setAttribute("aria-busy", String(value));
    ui.formFields.disabled = value;
    ui.intensity.disabled = value || ui.recoveryMode;
    ui.close.disabled = value;
    ui.generate.disabled = value || !context?.library?.length;
    ui.use.disabled = value || !preview;
    ui.use.textContent = value ? "Adding workout…" : "Use this workout";
    for (const control of ui.review.querySelectorAll("button, select")) control.disabled = value;
  }

  function syncRecoveryPreferences() {
    const recovery = Boolean(window.FWB_WORKOUT_GENERATOR?.FOCUS_OPTIONS?.find((option) => option.value === ui.focus.value)?.recovery);
    if (recovery && !ui.recoveryMode) ui.strengthIntensity = ui.intensity.value;
    if (!recovery && ui.recoveryMode) ui.intensity.value = ui.strengthIntensity || "moderate";
    ui.recoveryMode = recovery;
    if (recovery) ui.intensity.value = "easy";
    ui.intensity.disabled = busy || recovery;
    ui.recoveryHint.hidden = !recovery;
  }

  function preferences() {
    const selectedMuscles = Array.from(ui.muscleChoices.querySelectorAll("input:checked"), (input) => input.value);
    return {
      focus: ui.focus.value === "custom_muscles" ? (selectedMuscles.length === 1 ? selectedMuscles[0] : "full_body") : ui.focus.value,
      selectedMuscles,
      minutes: Number(ui.minutes.value),
      intensity: ui.intensity.value,
      equipment: Array.from(ui.equipment.querySelectorAll("input:checked"), (input) => input.value)
    };
  }

  function invalidatePreview() {
    if (!preview) return;
    preview = null;
    ui.review.hidden = true;
    ui.use.hidden = true;
    ui.use.disabled = true;
    ui.generate.textContent = "Generate workout";
    setStatus("Preferences changed. Generate a workout to review your new plan.");
  }

  function showAlternatives(exercise, index, row, swapButton) {
    const existing = row.querySelector(".workout-generator-swap");
    if (existing) {
      existing.remove();
      swapButton.setAttribute("aria-expanded", "false");
      return;
    }
    try {
      const engine = window.FWB_WORKOUT_GENERATOR;
      const alternatives = engine.alternatives({
        library: context.library,
        history: context.history,
        exercise,
        workout: preview,
        ...preferences()
      });
      if (!Array.isArray(alternatives) || alternatives.length === 0) {
        setStatus(`No other approved exercises match ${exercise.name} with this equipment. Try changing your equipment or focus.`);
        return;
      }
      const panel = element("div", "workout-generator-swap");
      const replacement = field(`Replace ${exercise.name} with`, `swap-${index}`, alternatives.map((item, position) => ({ value: String(position), label: item.name })));
      const apply = button("Replace exercise", "workout-generator-button workout-generator-button-secondary");
      apply.addEventListener("click", () => {
        if (busy || !preview) return;
        try {
          const choice = alternatives[Number(replacement.select.value)];
          if (!choice) return;
          const updated = engine.swap(preview, index, choice);
          if (!updated || !Array.isArray(updated.exercises) || updated.exercises.length === 0) throw new Error("This exercise could not be replaced. Please try another option.");
          preview = updated;
          renderPreview();
          setStatus(`${exercise.name} replaced with ${choice.name}.`);
          ui.review.querySelector(`[data-generator-swap="${index}"]`)?.focus({ preventScroll: true });
        } catch (error) {
          setStatus(errorMessage(error, "This exercise could not be replaced. Please try again."), true);
        }
      });
      panel.append(replacement.label, apply);
      row.append(panel);
      swapButton.setAttribute("aria-expanded", "true");
      replacement.select.focus({ preventScroll: true });
    } catch (error) {
      setStatus(errorMessage(error, "Alternatives could not be loaded. Please try again."), true);
    }
  }

  function renderPreview() {
    ui.review.replaceChildren();
    const heading = element("div", "workout-generator-review-heading");
    const title = element("h3", "", preview.title || "Your workout");
    title.id = "workout-generator-review-title";
    title.tabIndex = -1;
    const minutes = Number(preview.estimatedMinutes);
    const duration = Number.isFinite(minutes) && minutes > 0 ? ` · About ${Math.round(minutes)} min` : "";
    heading.append(title, element("p", "workout-generator-muted", `${preview.exercises.length} exercises${duration}`));
    ui.review.append(heading);
    const list = element("ol", "workout-generator-exercises");
    preview.exercises.forEach((exercise, index) => {
      const row = element("li", "workout-generator-exercise");
      const rowHeading = element("div", "workout-generator-exercise-heading");
      const identity = element("div", "workout-generator-exercise-identity");
      const number = element("span", "workout-generator-number", String(index + 1).padStart(2, "0"));
      number.setAttribute("aria-hidden", "true");
      const name = element("h4", "", exercise.name);
      identity.append(number, name);
      const swapButton = button("Swap", "workout-generator-button workout-generator-button-secondary workout-generator-swap-trigger");
      swapButton.dataset.generatorSwap = String(index);
      swapButton.setAttribute("aria-label", `Swap ${exercise.name}`);
      swapButton.setAttribute("aria-expanded", "false");
      swapButton.addEventListener("click", () => {
        if (!busy) showAlternatives(exercise, index, row, swapButton);
      });
      rowHeading.append(identity, swapButton);
      row.append(rowHeading);
      const prescription = element("p", "workout-generator-prescription", exercise.prescription || `${exercise.sets} sets · ${exercise.reps}`);
      const rest = exercise.rest || (Number.isFinite(Number(exercise.restSeconds)) ? `${exercise.restSeconds} sec` : "");
      if (rest) prescription.append(element("span", "", `Rest ${rest}`));
      row.append(prescription);
      const demo = safeDemoUrl(exercise.demo_url);
      if (demo) {
        const link = element("a", "workout-generator-demo", "Watch demo ↗");
        link.href = demo;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.setAttribute("aria-label", `Watch ${exercise.name} demo (opens in a new tab)`);
        row.append(link);
      }
      if (exercise.instructions) {
        const details = element("details", "workout-generator-instructions");
        details.append(element("summary", "", "Exercise notes"), element("p", "", exercise.instructions));
        row.append(details);
      }
      list.append(row);
    });
    ui.review.append(list);
    if (Array.isArray(preview.notes) && preview.notes.length) {
      const notes = element("ul", "workout-generator-notes");
      for (const note of preview.notes) notes.append(element("li", "", note));
      ui.review.append(notes);
    }
    ui.review.hidden = false;
    ui.use.hidden = false;
    ui.use.disabled = false;
    ui.generate.textContent = "Generate another";
  }

  function generate(event) {
    event.preventDefault();
    if (busy || !context) return;
    try {
      const engine = window.FWB_WORKOUT_GENERATOR;
      if (!engine || typeof engine.generate !== "function") throw new Error("Workout generation is unavailable. Reload the app and try again.");
      const result = engine.generate({
        library: context.library,
        history: context.history,
        ...preferences(),
        seed: `${Date.now()}-${++generation}-${Math.random()}`
      });
      if (!result || !Array.isArray(result.exercises) || result.exercises.length === 0) throw new Error("No exercises match these preferences. Try another focus or equipment selection.");
      preview = result;
      renderPreview();
      setStatus("Your workout is ready. Review the exercises or swap one before using it.");
      ui.review.querySelector("h3")?.focus({ preventScroll: true });
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      ui.review.scrollIntoView?.({ block: "start", behavior: reducedMotion ? "auto" : "smooth" });
    } catch (error) {
      setStatus(errorMessage(error, "We couldn’t generate a workout. Please try again."), true);
    }
  }

  async function usePreview() {
    if (busy || !preview || !context) return;
    if (typeof context.onUse !== "function") {
      setStatus("This workout could not be added. Reload the app and try again.", true);
      return;
    }
    setBusy(true);
    setStatus("Adding your workout…");
    try {
      const accepted = await context.onUse(preview);
      if (accepted === true) {
        restoreFocus = false;
        setBusy(false);
        dialog.close();
        return;
      }
      setStatus("Your preview is still here when you’re ready to use it.");
    } catch (error) {
      setStatus(errorMessage(error, "Your workout could not be added. Please try again."), true);
    } finally {
      setBusy(false);
    }
  }

  function ensureDialog() {
    if (dialog?.isConnected) return dialog;
    dialog = element("dialog", "workout-generator-dialog");
    dialog.id = "workout-generator-dialog";
    dialog.setAttribute("aria-labelledby", "workout-generator-title");
    dialog.setAttribute("aria-describedby", "workout-generator-description");
    const header = element("header", "workout-generator-heading");
    const headingText = element("div");
    const kicker = element("p", "workout-generator-kicker", "Made for today");
    const heading = element("h2", "", "Generate your workout");
    heading.id = "workout-generator-title";
    headingText.append(kicker, heading);
    const closeButton = button("×", "workout-generator-close");
    closeButton.setAttribute("aria-label", "Close workout generator");
    closeButton.addEventListener("click", close);
    header.append(headingText, closeButton);
    const description = element("p", "workout-generator-description", "Choose what you want to train. Review a plan from the exercise library, then make it yours.");
    description.id = "workout-generator-description";
    const form = element("form", "workout-generator-form");
    const fields = element("fieldset", "workout-generator-fields");
    const focus = field("Quick focus", "focus", []);
    const recoveryHint = element("p", "workout-generator-muted", "Gentle mobility and stretching for your selected area. Recovery sessions use easy intensity.");
    recoveryHint.id = "workout-generator-recovery-hint";
    recoveryHint.hidden = true;
    focus.select.setAttribute("aria-describedby", recoveryHint.id);
    focus.select.addEventListener("change", () => {
      for (const checkbox of ui.muscleChoices.querySelectorAll("input")) checkbox.checked = false;
      syncRecoveryPreferences();
      invalidatePreview();
    });
    const muscles = element("fieldset", "workout-generator-muscles");
    muscles.append(element("legend", "workout-generator-label", "Or choose muscles"));
    const muscleHint = element("p", "workout-generator-muted", "Select one or more. Every selected muscle will be included.");
    muscleHint.id = "workout-generator-muscle-hint";
    muscles.setAttribute("aria-describedby", muscleHint.id);
    const muscleChoices = element("div", "workout-generator-muscle-choices");
    muscles.append(muscleHint, muscleChoices);
    const split = element("div", "workout-generator-preferences-row");
    const minutes = field("How much time?", "minutes", [20, 30, 45, 60].map((value) => ({ value, label: `${value} minutes` })));
    const intensity = field("How hard today?", "intensity", [
      { value: "easy", label: "Easy" },
      { value: "moderate", label: "Moderate" },
      { value: "challenging", label: "Challenging" }
    ]);
    split.append(minutes.label, intensity.label);
    const equipment = element("fieldset", "workout-generator-equipment");
    equipment.append(element("legend", "workout-generator-label", "Available equipment"));
    const equipmentChoices = element("div", "workout-generator-equipment-choices");
    equipment.append(equipmentChoices, element("p", "workout-generator-muted", "Bodyweight exercises are always included."));
    fields.append(focus.label, recoveryHint, muscles, split, equipment);
    const generateButton = element("button", "workout-generator-button workout-generator-generate", "Generate workout");
    generateButton.type = "submit";
    form.append(fields, generateButton);
    form.addEventListener("submit", generate);
    form.addEventListener("change", invalidatePreview);
    const status = element("p", "workout-generator-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    const review = element("section", "workout-generator-review");
    review.setAttribute("aria-labelledby", "workout-generator-review-title");
    review.hidden = true;
    const footer = element("footer", "workout-generator-actions");
    const useButton = button("Use this workout", "workout-generator-button workout-generator-use");
    useButton.hidden = true;
    useButton.disabled = true;
    useButton.addEventListener("click", usePreview);
    footer.append(useButton);
    dialog.append(header, description, form, status, review, footer);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog || busy) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    });
    dialog.addEventListener("close", () => {
      if (dialog.open) return;
      document.body.classList.remove("workout-generator-open");
      const target = context?.returnFocus;
      context = null;
      preview = null;
      if (restoreFocus && target?.isConnected && !target.disabled) target.focus?.({ preventScroll: true });
    });
    ui = {
      close: closeButton, form, formFields: fields, focus: focus.select,
      muscleChoices,
      minutes: minutes.select, intensity: intensity.select, equipment,
      equipmentChoices, generate: generateButton, status, review, use: useButton,
      recoveryHint, recoveryMode: false, strengthIntensity: "moderate"
    };
    document.body.append(dialog);
    return dialog;
  }

  function open(options = {}) {
    if (typeof document === "undefined" || !document.body) return false;
    const node = ensureDialog();
    if (node.open) return true;
    if (typeof node.showModal !== "function") return false;
    const engine = window.FWB_WORKOUT_GENERATOR;
    context = {
      library: Array.isArray(options.library) ? options.library : [],
      history: Array.isArray(options.history) ? options.history : [],
      onUse: options.onUse,
      returnFocus: options.returnFocus || document.activeElement
    };
    restoreFocus = true;
    preview = null;
    ui.focus.replaceChildren();
    const strengthChoices = element("optgroup");
    strengthChoices.label = "Strength";
    const recoveryChoices = element("optgroup");
    recoveryChoices.label = "Mobility / flexibility / recovery";
    for (const option of engine?.FOCUS_OPTIONS || []) {
      if (engine?.MUSCLE_OPTIONS?.some((muscle) => muscle.value === option.value)) continue;
      const item = element("option", "", option.label);
      item.value = option.value;
      (option.recovery ? recoveryChoices : strengthChoices).append(item);
    }
    if (strengthChoices.children.length) ui.focus.append(strengthChoices);
    if (recoveryChoices.children.length) ui.focus.append(recoveryChoices);
    const customChoice = element("option", "", "Selected muscles");
    customChoice.value = "custom_muscles";
    customChoice.disabled = true;
    ui.focus.append(customChoice);
    if (Array.from(ui.focus.options).some((item) => item.value === "full_body")) ui.focus.value = "full_body";
    ui.minutes.value = "30";
    ui.intensity.value = "moderate";
    ui.recoveryMode = false;
    ui.strengthIntensity = "moderate";
    const initial = options.initialPreferences && typeof options.initialPreferences === "object" ? options.initialPreferences : {};
    if (Array.from(ui.focus.options).some((item) => item.value === initial.focus)) ui.focus.value = initial.focus;
    if ([20, 30, 45, 60].includes(initial.minutes)) ui.minutes.value = String(initial.minutes);
    if (["easy", "moderate", "challenging"].includes(initial.intensity)) ui.intensity.value = initial.intensity;
    const muscleOptions = engine?.MUSCLE_OPTIONS || [];
    const recovery = Boolean(engine?.FOCUS_OPTIONS?.find((option) => option.value === initial.focus)?.recovery);
    const initialMuscles = recovery ? [] : Array.isArray(initial.selectedMuscles)
      && initial.selectedMuscles.every((value) => muscleOptions.some((option) => option.value === value))
      && initial.selectedMuscles.length ? initial.selectedMuscles
      : muscleOptions.some((option) => option.value === initial.focus) ? [initial.focus] : [];
    ui.muscleChoices.replaceChildren();
    for (const option of muscleOptions) {
      const label = element("label", "workout-generator-muscle-choice");
      const checkbox = element("input");
      checkbox.type = "checkbox";
      checkbox.name = "selectedMuscles";
      checkbox.value = option.value;
      checkbox.checked = initialMuscles.includes(option.value);
      checkbox.addEventListener("change", () => {
        ui.focus.value = ui.muscleChoices.querySelectorAll("input:checked").length ? "custom_muscles" : "full_body";
        syncRecoveryPreferences();
        invalidatePreview();
      });
      label.append(checkbox, element("span", "", option.label));
      ui.muscleChoices.append(label);
    }
    if (initialMuscles.length) ui.focus.value = "custom_muscles";
    const validEquipment = new Set((engine?.EQUIPMENT_OPTIONS || []).map((option) => option.value));
    const initialEquipment = Array.isArray(initial.equipment) && initial.equipment.every((value) => validEquipment.has(value))
      ? new Set(initial.equipment) : new Set(["full_gym"]);
    syncRecoveryPreferences();
    ui.equipmentChoices.replaceChildren();
    for (const option of engine?.EQUIPMENT_OPTIONS || []) {
      const label = element("label", "workout-generator-equipment-choice");
      const checkbox = element("input");
      checkbox.type = "checkbox";
      checkbox.name = "equipment";
      checkbox.value = option.value;
      checkbox.checked = option.value === "bodyweight" || (initialEquipment.has("full_gym") ? option.value === "full_gym" : initialEquipment.has(option.value));
      checkbox.disabled = option.value === "bodyweight";
      checkbox.addEventListener("change", () => {
        if (!checkbox.checked) return;
        for (const other of ui.equipmentChoices.querySelectorAll("input")) {
          if (other === checkbox || other.value === "bodyweight") continue;
          if (checkbox.value === "full_gym" || other.value === "full_gym") other.checked = false;
        }
      });
      label.append(checkbox, element("span", "", option.label));
      ui.equipmentChoices.append(label);
    }
    ui.review.replaceChildren();
    ui.review.hidden = true;
    ui.use.hidden = true;
    ui.generate.textContent = "Generate workout";
    setBusy(false);
    if (!engine) {
      setStatus("Workout generation is unavailable. Reload the app and try again.", true);
      ui.generate.disabled = true;
    } else if (!context.library.length) {
      setStatus("There are no approved exercises available yet. Ask your coach to add exercises to the library, then try again.");
    } else {
      setStatus("");
    }
    try {
      node.showModal();
    } catch (_) {
      context = null;
      return false;
    }
    document.body.classList.add("workout-generator-open");
    ui.focus.focus({ preventScroll: true });
    return true;
  }

  const api = { open, close };
  if (typeof window !== "undefined") window.FWB_WORKOUT_GENERATOR_DIALOG = api;
  if (typeof module !== "undefined" && module.exports) module.exports = { ...api, safeDemoUrl };
})();
