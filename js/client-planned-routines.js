(function attachPlannedRoutines(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FWB_CLIENT_PLANNED_ROUTINES = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createPlannedRoutines(root) {
  "use strict";

  const table = "client_saved_workout_plans";
  const columns = "id,title,plan,snapshot_json,plan_kind,is_deleted,updated_at,created_at";
  const formats = { single: "Straight Sets", superset: "Superset", circuit: "Circuit" };
  const minimum = { single: 1, superset: 2, circuit: 3 };
  const swiftDateOffset = 978307200;
  let dialog, context, draft;
  let rows = [];
  let busy = false;

  const escaped = value => String(value ?? "").replace(/[&<>"']/g, character =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

  function groupLetter(number) {
    let label = "";
    for (let index = number; index > 0; index = Math.floor((index - 1) / 26)) {
      label = String.fromCharCode(65 + (index - 1) % 26) + label;
    }
    return label;
  }

  function launchSnapshot({ id, title, names, format, createdAt, existing }) {
    title = String(title || "").trim();
    names = names.map(name => String(name || "").trim()).filter(Boolean);
    if (!id || !title || [...title].length > 80) throw new Error("Enter a routine name of 80 characters or fewer.");
    if (!Object.hasOwn(formats, format)) throw new Error("Choose a workout format.");
    if (names.length < minimum[format]) {
      throw new Error(`${formats[format]} needs at least ${minimum[format]} ${minimum[format] === 1 ? "exercise" : "exercises"}.`);
    }
    const launch = {
      ...existing, id, title, createdAt, estimatedMinutes: 0, formatRaw: format,
      warmUpCount: 0, workingSetCount: 1, plannedRoutine: true,
      exercises: names.map((name, index) => {
        const pair = Math.floor(index / 2) + 1;
        const letter = `${pair <= 26 ? "" : "S"}${groupLetter(pair)}`;
        const code = format === "circuit" ? `C${index + 1}`
          : format === "superset" ? `${letter}${index % 2 + 1}`
            : `CW${String(index + 1).padStart(2, "0")}`;
        const exercise = { code, name, prescription: "1 set", rest: "", instructions: [], video: "", hasInvalidProgression: false };
        if (format === "circuit") Object.assign(exercise, { groupID: "CIRCUIT", groupKind: "circuit", groupLabel: "Circuit" });
        if (format === "superset" && (index % 2 === 1 || index + 1 < names.length)) {
          Object.assign(exercise, { groupID: letter, groupKind: "superset", groupLabel: `Superset ${letter}` });
        }
        return exercise;
      })
    };
    if (format === "circuit") launch.circuitSize = names.length;
    else delete launch.circuitSize;
    return launch;
  }

  function routineRow(row) {
    const launch = row?.plan;
    if (row?.plan_kind !== "session" || row.is_deleted || launch?.plannedRoutine !== true || launch.archivedAt != null ||
      typeof launch.id !== "string" || launch.id.toLowerCase() !== String(row.id).toLowerCase() ||
      typeof launch.title !== "string" || !Number.isFinite(launch.createdAt) ||
      !Array.isArray(launch.exercises) || !launch.exercises.length ||
      launch.exercises.some(exercise => typeof exercise?.name !== "string" || !exercise.name.trim())) return null;
    return { ...row, launch };
  }

  function historyExerciseNames(logs, canonicalName = name => name) {
    const seen = new Set();
    const nameKey = name => name.normalize("NFKD").replace(/\p{Diacritic}/gu, "")
      .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const order = log => log.exercise_order == null ? Infinity : Number(log.exercise_order);
    return [...logs].filter(log => {
      const code = String(log.exercise_code || "").trim().toUpperCase();
      return String(log.exercise_name || "").trim() && code !== "WARMUP" &&
        (code !== "CARDIO" || String(log.set_type || "").toLowerCase() === "timed");
    }).sort((left, right) => (order(left) - order(right)) ||
      String(left.exercise_code || "").localeCompare(String(right.exercise_code || ""), undefined, { numeric: true }) ||
      String(left.exercise_name).localeCompare(String(right.exercise_name)))
      .flatMap(log => {
        const name = String(canonicalName(String(log.exercise_name).trim()) || "").trim();
        const key = nameKey(name);
        if (!key || seen.has(key)) return [];
        seen.add(key);
        return [name];
      });
  }

  function scoped(context) {
    return context.supabase.from(table).select(columns).eq("user_id", context.userId)
      .eq("plan_kind", "session").eq("is_deleted", false).contains("plan", { plannedRoutine: true });
  }

  function isCurrent(current) {
    return context === current && dialog.open && current.isCurrentAccount();
  }

  function status(message, error = false) {
    const element = dialog.querySelector("[data-routine-status]");
    element.textContent = message;
    element.classList.toggle("is-error", error);
  }

  function setBusy(value) {
    busy = value;
    dialog.setAttribute("aria-busy", String(value));
    dialog.querySelector("fieldset")?.toggleAttribute("disabled", value);
  }

  async function load(current) {
    const loaded = [];
    for (let start = 0; ; start += 100) {
      const { data, error } = await scoped(current)
        .order("created_at", { ascending: false }).order("id").range(start, start + 99);
      if (!isCurrent(current)) return false;
      if (error) throw error;
      loaded.push(...(data || []).map(routineRow).filter(Boolean));
      if (!data || data.length < 100) break;
    }
    rows = loaded;
    return true;
  }

  function render() {
    const content = dialog.querySelector("[data-routine-content]");
    if (draft) {
      content.innerHTML = `<form data-routine-form><fieldset class="routine-editor">
        <label>Routine name<input name="title" value="${escaped(draft.title)}" required></label>
        <label>Workout format<select name="format">${Object.entries(formats).map(([key, label]) =>
          `<option value="${key}" ${draft.format === key ? "selected" : ""}>${label}</option>`).join("")}</select></label>
        <h3>Exercises</h3><ol>${draft.names.map((name, index) => `<li><span>${escaped(name)}</span>
          <button type="button" data-routine-move="${index}" data-routine-step="-1" aria-label="Move ${escaped(name)} up" ${index === 0 ? "disabled" : ""}>↑</button>
          <button type="button" data-routine-move="${index}" data-routine-step="1" aria-label="Move ${escaped(name)} down" ${index === draft.names.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" data-routine-remove="${index}" aria-label="Remove ${escaped(name)}">Remove</button></li>`).join("")}</ol>
        <label>Add an exercise<input name="exercise" placeholder="Search the library or enter an exercise" list="planned-routine-exercise-library"></label>
        <datalist id="planned-routine-exercise-library">${(context.library || []).map(entry =>
          `<option value="${escaped(entry.name)}"></option>`).join("")}</datalist>
        <button type="button" data-routine-add>Add exercise</button>
        <p>Find this routine in Workouts → Routines → Plan Your Routine.</p>
        <button type="submit" class="plan-primary">Save Routine</button>
        <button type="button" data-routine-cancel>Cancel</button>
      </fieldset></form>`;
      return;
    }
    content.innerHTML = `<button type="button" class="plan-primary" data-routine-new>New Routine</button>
      ${rows.length ? `<div class="saved-plan-days">${rows.map(row => `<section class="saved-plan-day">
        <h3>${escaped(row.launch.title)}</h3>
        <p>${row.launch.exercises.length} ${row.launch.exercises.length === 1 ? "exercise" : "exercises"} · ${escaped(formats[row.launch.formatRaw] || formats.single)}</p>
        <ul>${row.launch.exercises.map(exercise => `<li>${escaped(exercise.name)}</li>`).join("")}</ul>
        <button type="button" class="plan-primary" data-routine-start="${escaped(row.id)}">Start Workout</button>
        <button type="button" data-routine-edit="${escaped(row.id)}">Edit</button>
        <button type="button" data-routine-delete="${escaped(row.id)}">Delete</button>
      </section>`).join("")}</div>` : '<p class="plan-empty">Choose the exercises you want to do and save them for your next gym visit.</p>'}`;
  }

  function begin(seed = {}) {
    const id = seed.row?.id || root.crypto?.randomUUID?.();
    if (!id) { status("This browser could not create a routine. Refresh and try again.", true); return; }
    const existing = seed.row?.launch;
    draft = {
      id, row: seed.row, existing, title: existing?.title || [...(seed.title || "")].slice(0, 80).join(""),
      names: [...(existing?.exercises.map(exercise => exercise.name) || seed.names || [])],
      format: existing?.formatRaw || "single", createdAt: existing?.createdAt ?? Date.now() / 1000 - swiftDateOffset,
    };
    render();
    dialog.querySelector("[name=title]")?.focus();
  }

  function readEditor() {
    const form = dialog.querySelector("[data-routine-form]");
    draft.title = form.elements.title.value;
    draft.format = form.elements.format.value;
    return form;
  }

  async function save(current) {
    const form = readEditor();
    if (form.elements.exercise.value.trim()) { status("Add the exercise before saving, or clear its name.", true); return; }
    let launch;
    try { launch = launchSnapshot(draft); }
    catch (error) { status(error.message, true); return; }
    const snapshot = JSON.stringify(launch);
    if (new TextEncoder().encode(snapshot).length > 262144) { status("This routine is too large to save.", true); return; }
    const fields = { title: launch.title, plan: launch, snapshot_json: snapshot };
    setBusy(true);
    try {
      let result;
      if (draft.row) {
        result = await current.supabase.from(table).update(fields)
          .eq("id", draft.id).eq("user_id", current.userId).eq("plan_kind", "session")
          .eq("is_deleted", false).eq("updated_at", draft.row.updated_at)
          .contains("plan", { plannedRoutine: true }).select(columns).maybeSingle();
      } else {
        result = await current.supabase.from(table).insert({
          ...fields, id: draft.id, user_id: current.userId, plan_kind: "session", is_deleted: false
        }).select(columns).single();
        if (result.error?.code === "23505" && isCurrent(current)) {
          const retry = await scoped(current).eq("id", draft.id).maybeSingle();
          if (retry.data?.snapshot_json === snapshot) result = retry;
        }
      }
      if (!isCurrent(current)) return;
      const saved = routineRow(result.data);
      if (result.error || !saved) {
        status(!result.error ? "This routine changed on another device. Close and reopen it to check the latest version."
          : "Could not save this routine. Please try again.", true);
        return;
      }
      rows = [saved, ...rows.filter(row => row.id !== saved.id)];
      draft = null;
      current.onSaved?.();
      render();
      status("Saved to Plan Your Routine.");
    } catch { if (isCurrent(current)) status("Could not save this routine. Please try again.", true); }
    finally { if (context === current) setBusy(false); }
  }

  async function remove(current, row) {
    if (!root.confirm(`Delete ${row.launch.title} from your routines?`)) return;
    setBusy(true);
    try {
      const { data, error } = await current.supabase.from(table).update({ is_deleted: true })
        .eq("id", row.id).eq("user_id", current.userId).eq("plan_kind", "session")
        .eq("is_deleted", false).eq("updated_at", row.updated_at)
        .contains("plan", { plannedRoutine: true }).select("id").maybeSingle();
      if (!isCurrent(current)) return;
      if (error || !data) {
        status(!error ? "This routine changed on another device. Reopen Plan Your Routine and try again."
          : "Could not delete this routine. Please try again.", true);
        return;
      }
      rows = rows.filter(saved => saved.id !== row.id);
      render();
      status("Routine deleted.");
    } catch { if (isCurrent(current)) status("Could not delete this routine. Please try again.", true); }
    finally { if (context === current) setBusy(false); }
  }

  async function click(event) {
    const button = event.target.closest("button");
    const current = context;
    if (busy || !button || !current || !isCurrent(current)) return;
    if (button.hasAttribute("data-routine-close")) { dialog.close(); return; }
    if (button.hasAttribute("data-routine-new")) { status(""); begin(); return; }
    if (button.hasAttribute("data-routine-cancel")) { draft = null; status(""); render(); return; }
    const { routineEdit, routineDelete, routineStart, routineMove, routineRemove, routineStep } = button.dataset;
    const row = rows.find(item => item.id === (routineEdit || routineDelete || routineStart));
    if (row && routineEdit) { status(""); begin({ row }); return; }
    if (row && routineDelete) { await remove(current, row); return; }
    if (row && routineStart) {
      try {
        if (current.onStart(row.launch)) {
          current.returnFocus = null;
          dialog.close();
        }
      } catch (error) { status(error.message, true); }
      return;
    }
    if (!draft) return;
    const form = readEditor();
    if (button.hasAttribute("data-routine-add")) {
      const name = form.elements.exercise.value.trim();
      if (!name) { form.elements.exercise.focus(); return; }
      draft.names.push(name);
    } else if (routineMove !== undefined) {
      const from = Number(routineMove), to = from + Number(routineStep);
      [draft.names[from], draft.names[to]] = [draft.names[to], draft.names[from]];
    } else if (routineRemove !== undefined) {
      draft.names.splice(Number(routineRemove), 1);
    } else { return; }
    const pendingName = button.hasAttribute("data-routine-add") ? "" : form.elements.exercise.value;
    render();
    const exerciseInput = dialog.querySelector("[name=exercise]");
    exerciseInput.value = pendingName;
    exerciseInput.focus();
  }

  function ensureDialog() {
    if (dialog?.isConnected) return;
    dialog = root.document.createElement("dialog");
    dialog.className = "client-workout-plan-dialog client-planned-routines-dialog";
    dialog.setAttribute("aria-labelledby", "planned-routines-heading");
    dialog.innerHTML = `<div class="plan-dialog-top"><h2 id="planned-routines-heading">Plan Your Routine</h2>
      <button type="button" data-routine-close data-plan-close aria-label="Close">×</button></div>
      <p data-routine-status data-plan-status role="status" aria-live="polite"></p><div data-routine-content></div>`;
    dialog.addEventListener("close", () => {
      const opener = context?.returnFocus;
      context = null;
      draft = null;
      busy = false;
      opener?.focus?.({ preventScroll: true });
    });
    dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
    dialog.addEventListener("click", event => { void click(event); });
    dialog.addEventListener("submit", event => {
      event.preventDefault();
      if (!busy && context && isCurrent(context)) void save(context);
    });
    dialog.addEventListener("keydown", event => {
      if (event.key === "Enter" && event.target.name === "exercise") {
        event.preventDefault();
        dialog.querySelector("[data-routine-add]")?.click();
      }
    });
    root.document.body.append(dialog);
  }

  async function open(current, seed) {
    ensureDialog();
    if (dialog.open) return;
    context = current;
    rows = [];
    draft = null;
    dialog.querySelector("[data-routine-content]").textContent = "";
    dialog.showModal();
    status("Loading routines…");
    try {
      if (!await load(current)) return;
      if (seed) begin(seed);
      else render();
      status("");
    } catch {
      if (isCurrent(current)) {
        if (seed) begin(seed);
        else render();
        status("Could not load your saved routines. Reopen to try again.", true);
      }
    }
  }

  return { open, launchSnapshot, routineRow, historyExerciseNames };
}));
