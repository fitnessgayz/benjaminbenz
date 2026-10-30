/* Client workout planning shared with the iOS workout schedule table. */
(function attachClientWorkoutCalendar(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FWB_CLIENT_WORKOUT_CALENDAR = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createClientWorkoutCalendar(root) {
  "use strict";

  const table = "client_workout_schedule";
  const savedTable = "client_saved_workout_plans";
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  let host;
  let panel;
  let context;
  let selectedDate = localDateKey(new Date());
  let visibleMonth = selectedDate.slice(0, 7);
  let schedule = [];
  let options = [];
  let choosing = false;
  let busy = false;
  let loadVersion = 0;
  let returnFocus;

  function escape(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  function localDateKey(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")].join("-");
  }

  function dateFromKey(key) {
    if (!datePattern.test(String(key || ""))) return null;
    const [year, month, day] = key.split("-").map(Number);
    const value = new Date(year, month - 1, day, 12);
    return value.getFullYear() === year && value.getMonth() === month - 1 && value.getDate() === day ? value : null;
  }

  function monthDays(key) {
    const first = dateFromKey(`${key}-01`);
    if (!first) return [];
    const leading = (first.getDay() + 6) % 7;
    const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells = [...Array(leading).fill(null), ...Array.from({ length: count }, (_, index) =>
      localDateKey(new Date(first.getFullYear(), first.getMonth(), index + 1, 12)))];
    while (cells.length % 7) cells.push(null);
    return cells;
  }

  function shiftedMonth(key, offset) {
    const first = dateFromKey(`${key}-01`);
    if (!first) return key;
    return localDateKey(new Date(first.getFullYear(), first.getMonth() + offset, 1, 12)).slice(0, 7);
  }

  function workoutOptions(assigned, saved) {
    const result = [];
    for (const item of assigned || []) {
      const workout = item?.workout || item;
      if (!workout || !Array.isArray(workout.exercises) || !workout.exercises.length) continue;
      result.push({
        key: `assigned:${item?.programId || ""}:${item?.index ?? result.length}`,
        type: "assigned", group: "From your coach", title: workout.title || "Workout",
        detail: item?.programTitle || `${workout.exercises.length} exercises`, workout,
        sourceId: workout.id || workout.sourceID || item?.programId || ""
      });
    }
    for (const row of saved || []) {
      const plan = row?.plan || row?.snapshot || {};
      const workouts = Array.isArray(plan.workouts) ? plan.workouts : [plan];
      workouts.forEach((item, index) => {
        const workout = item?.workout || item;
        if (!Array.isArray(workout?.exercises) || !workout.exercises.length) return;
        result.push({
          key: `saved:${row.id}:${index}`, type: "generated", group: "Saved workouts",
          title: workout.title || row.title || "Saved workout",
          detail: Array.isArray(plan.workouts) ? `${row.title || "Saved plan"} · Day ${index + 1}` : `${workout.exercises.length} exercises`,
          workout, sourceId: workout.id || item?.id || row.id
        });
      });
    }
    return result;
  }

  function snapshotFor(option, id, date) {
    const workout = option.workout;
    return JSON.stringify({ id, date, plan: {
      source: option.type, sourceID: option.sourceId || id,
      title: option.title, focus: workout.focus || "",
      format: workout.format || workout.formatRaw || "single",
      exercises: workout.exercises
    } });
  }

  function parsedWorkout(row) {
    try {
      const value = JSON.parse(row.snapshot_json || "{}");
      return value.plan && Array.isArray(value.plan.exercises) ? value.plan : null;
    } catch { return null; }
  }

  function announce(message, isError = false) {
    const status = host?.querySelector("[data-calendar-status]");
    if (status) { status.textContent = message; status.classList.toggle("is-error", isError); }
  }

  function render() {
    if (!host) return;
    const monthDate = dateFromKey(`${visibleMonth}-01`);
    const monthTitle = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(monthDate);
    const selected = dateFromKey(selectedDate) || new Date();
    const dayTitle = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(selected);
    const counts = new Map();
    schedule.forEach(row => counts.set(row.planned_date, (counts.get(row.planned_date) || 0) + 1));
    const dayRows = schedule.filter(row => row.planned_date === selectedDate);
    host.innerHTML = `<div class="client-calendar-header">
      <button type="button" class="client-calendar-back" data-calendar-back aria-label="Back to workout choices">‹</button>
      <h2>Workout calendar</h2><span aria-hidden="true"></span>
    </div>
    <div class="client-calendar-month">
      <button type="button" data-calendar-prev aria-label="Previous month">‹</button>
      <h3>${escape(monthTitle)}</h3>
      <button type="button" data-calendar-next aria-label="Next month">›</button>
    </div>
    <div class="client-calendar-grid" role="grid" aria-label="${escape(monthTitle)}">
      ${["M", "T", "W", "T", "F", "S", "S"].map(day => `<span class="client-calendar-weekday" aria-hidden="true">${day}</span>`).join("")}
      ${monthDays(visibleMonth).map(key => key ? `<button type="button" role="gridcell" data-calendar-date="${key}"
        class="${key === selectedDate ? "is-selected" : ""}${counts.has(key) ? " is-planned" : ""}"
        aria-selected="${key === selectedDate}" aria-label="${escape(new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(dateFromKey(key)))}${counts.has(key) ? `, ${counts.get(key)} planned workout${counts.get(key) === 1 ? "" : "s"}` : ""}"><span>${Number(key.slice(-2))}</span><i aria-hidden="true"></i></button>`
        : '<span class="client-calendar-blank" aria-hidden="true"></span>').join("")}
    </div>
    <section class="client-calendar-day" aria-label="Selected day">
      <h3>${escape(dayTitle)}</h3>
      ${dayRows.map(row => `<article class="client-calendar-workout">
        <div><strong>${escape(row.title)}</strong><span>${row.source_type === "assigned" ? "From your coach" : "Saved workout"}</span></div>
        <div class="client-calendar-workout-actions"><button type="button" data-calendar-open="${escape(row.id)}">Open workout</button>
          <button type="button" data-calendar-remove="${escape(row.id)}" aria-label="Remove ${escape(row.title)} from ${escape(dayTitle)}">Remove</button></div>
      </article>`).join("")}
      <button type="button" class="client-calendar-add" data-calendar-add><span aria-hidden="true">＋</span> Add workout to this day</button>
      <p class="client-calendar-help">Planned workouts appear here. Your finished sessions stay in Logs, and gym visits stay in check-in.</p>
      <p data-calendar-status role="status" aria-live="polite"></p>
    </section>
    <dialog class="client-calendar-picker" data-calendar-picker aria-labelledby="client-calendar-picker-title">
      <div class="client-calendar-picker-heading"><h3 id="client-calendar-picker-title">Add workout to ${escape(dayTitle)}</h3>
        <button type="button" data-calendar-picker-close aria-label="Close workout choices">×</button></div>
      <div data-calendar-options>${choosing ? optionsMarkup() : ""}</div>
      <p data-calendar-picker-status role="status" aria-live="polite"></p>
    </dialog>`;
    if (choosing) host.querySelector("[data-calendar-picker]")?.showModal();
  }

  function optionsMarkup() {
    if (!options.length) return '<p class="client-calendar-empty">No coach or saved workouts are available yet. Create a saved workout or ask your coach for a plan.</p>';
    return ["From your coach", "Saved workouts"].map(group => {
      const items = options.filter(option => option.group === group);
      return items.length ? `<section class="client-calendar-option-group"><h4>${group}</h4>${items.map(option =>
        `<button type="button" data-calendar-choose="${escape(option.key)}"><span><strong>${escape(option.title)}</strong><small>${escape(option.detail)}</small></span><span aria-hidden="true">＋</span></button>`).join("")}</section>` : "";
    }).join("");
  }

  async function loadSchedule() {
    if (!context?.client || !context.userId) return;
    const version = ++loadVersion;
    const month = visibleMonth;
    const nextMonth = shiftedMonth(month, 1);
    announce("Loading planned workouts…");
    const { data, error } = await context.client.from(table)
      .select("id,planned_date,title,source_type,snapshot_json")
      .eq("owner_user_id", context.userId).eq("is_deleted", false)
      .gte("planned_date", `${month}-01`).lt("planned_date", `${nextMonth}-01`)
      .order("planned_date", { ascending: true });
    if (version !== loadVersion || !host?.isConnected || visibleMonth !== month) return;
    if (error) { announce("Could not load planned workouts. Try another month or reopen the calendar.", true); return; }
    schedule = data || [];
    render();
  }

  async function loadOptions() {
    options = workoutOptions(context?.getAssignedWorkouts?.() || [], []);
    const { data, error } = await context.client.from(savedTable)
      .select("id,title,plan,snapshot_json,plan_kind")
      .eq("user_id", context.userId).eq("is_deleted", false)
      .order("created_at", { ascending: false }).limit(100);
    if (!choosing) return;
    if (error) {
      host.querySelector("[data-calendar-options]").innerHTML = optionsMarkup();
      host.querySelector("[data-calendar-picker-status]").textContent = "Saved workouts could not load. Coach workouts are still available.";
      return;
    }
    options = workoutOptions(context?.getAssignedWorkouts?.() || [], (data || []).map(row => ({
      ...row, plan: row.plan || (() => { try { return JSON.parse(row.snapshot_json || "{}"); } catch { return {}; } })()
    })));
    host.querySelector("[data-calendar-options]").innerHTML = optionsMarkup();
    host.querySelector("[data-calendar-picker-status]").textContent = "";
  }

  function notifyScheduleChanged() {
    root.document?.dispatchEvent(new CustomEvent("fwb:workout-schedule-changed"));
  }

  async function addWorkout(option) {
    if (busy || !option || !context?.userId) return;
    const id = root.crypto?.randomUUID?.();
    if (!id) { host.querySelector("[data-calendar-picker-status]").textContent = "This browser cannot create a workout plan. Refresh and try again."; return; }
    const snapshot = snapshotFor(option, id, selectedDate);
    if (new TextEncoder().encode(snapshot).length > 262144) {
      host.querySelector("[data-calendar-picker-status]").textContent = "This workout is too large to schedule.";
      return;
    }
    busy = true;
    const { data, error } = await context.client.from(table).insert({
      id, owner_user_id: context.userId, client_email: context.email,
      planned_date: selectedDate, source_type: option.type, title: option.title,
      snapshot_json: snapshot
    }).select("id,planned_date,title,source_type,snapshot_json").single();
    busy = false;
    if (error || !data) {
      host.querySelector("[data-calendar-picker-status]").textContent = "Could not save this workout. Please try again.";
      return;
    }
    choosing = false;
    schedule.push(data);
    render();
    announce(`${option.title} added to ${selectedDate}.`);
    notifyScheduleChanged();
  }

  async function removeWorkout(row) {
    if (busy || !row) return;
    busy = true;
    announce("Removing planned workout…");
    const { data, error } = await context.client.from(table).update({ is_deleted: true })
      .eq("id", row.id).eq("owner_user_id", context.userId)
      .select("id").single();
    busy = false;
    if (error || !data) { announce("Could not remove this workout. Please try again.", true); return; }
    schedule = schedule.filter(item => item.id !== row.id);
    render();
    announce("Workout removed from this day.");
    notifyScheduleChanged();
  }

  async function onClick(event) {
    if (event.target.closest("[data-calendar-back]")) { close(); return; }
    if (event.target.closest("[data-calendar-prev], [data-calendar-next]")) {
      visibleMonth = shiftedMonth(visibleMonth, event.target.closest("[data-calendar-prev]") ? -1 : 1);
      selectedDate = `${visibleMonth}-01`;
      schedule = [];
      render();
      void loadSchedule();
      return;
    }
    const day = event.target.closest("[data-calendar-date]");
    if (day) { selectedDate = day.dataset.calendarDate; render(); return; }
    if (event.target.closest("[data-calendar-add]")) {
      if (!context?.userId) { announce("Sign in as a client to plan workouts.", true); return; }
      choosing = true;
      options = workoutOptions(context.getAssignedWorkouts?.() || [], []);
      render();
      void loadOptions();
      return;
    }
    if (event.target.closest("[data-calendar-picker-close]")) { choosing = false; render(); return; }
    const optionButton = event.target.closest("[data-calendar-choose]");
    if (optionButton) { void addWorkout(options.find(item => item.key === optionButton.dataset.calendarChoose)); return; }
    const openButton = event.target.closest("[data-calendar-open]");
    if (openButton) {
      const row = schedule.find(item => item.id === openButton.dataset.calendarOpen);
      if (!row) return;
      const workout = parsedWorkout(row);
      if (!workout) { announce("This planned workout could not be opened. Try scheduling it again.", true); return; }
      try {
        const accepted = await context.onOpenWorkout?.(row, workout);
        if (accepted !== false) close(false);
      } catch (error) { announce(error?.message || "Could not open this workout.", true); }
      return;
    }
    const removeButton = event.target.closest("[data-calendar-remove]");
    if (removeButton) {
      const row = schedule.find(item => item.id === removeButton.dataset.calendarRemove);
      if (row && root.confirm(`Remove ${row.title} from ${selectedDate}?`)) void removeWorkout(row);
    }
  }

  function ensureHost() {
    panel = root.document?.getElementById("client-workouts-panel");
    if (!panel) return false;
    if (host?.isConnected) return true;
    host = root.document.createElement("div");
    host.className = "client-workout-calendar";
    host.hidden = true;
    host.addEventListener("click", onClick);
    host.addEventListener("cancel", event => {
      if (event.target.matches("[data-calendar-picker]")) { event.preventDefault(); choosing = false; render(); }
    }, true);
    panel.append(host);
    return true;
  }

  async function open(nextContext) {
    if (!ensureHost()) return;
    context = nextContext;
    returnFocus = nextContext.returnFocus;
    selectedDate = localDateKey(new Date());
    visibleMonth = selectedDate.slice(0, 7);
    schedule = [];
    choosing = false;
    panel.classList.add("is-calendar-open");
    host.hidden = false;
    render();
    host.querySelector("[data-calendar-back]")?.focus({ preventScroll: true });
    host.scrollIntoView({ block: "start", behavior: "auto" });
    if (!nextContext.userId) { announce("Sign in as a client to see your workout calendar.", true); return; }
    await loadSchedule();
  }

  function close(restoreFocus = true) {
    ++loadVersion;
    choosing = false;
    host?.querySelector("[data-calendar-picker]")?.close?.();
    if (host) host.hidden = true;
    panel?.classList.remove("is-calendar-open");
    if (restoreFocus) returnFocus?.focus?.({ preventScroll: true });
    context = null;
  }

  return { open, close, localDateKey, monthDays, shiftedMonth, workoutOptions, snapshotFor, parsedWorkout };
}));
