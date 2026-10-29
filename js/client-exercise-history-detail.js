(function (root) {
  "use strict";

  const allGyms = "__all__";
  const unknownGym = "__unknown__";
  const pageSize = 10;
  let logs = [];
  let dialog = null;
  let exerciseName = "";
  let selectedGym = allGyms;
  let visibleCount = pageSize;
  let returnFocus = null;

  function normalizedName(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function gymKey(value) {
    return normalizedName(value) || unknownGym;
  }

  function validNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function isWarmUp(set) {
    return String(set.set_type || "").toLowerCase() === "warm_up" || Number(set.set_number) > 1000;
  }

  function sessionKey(set) {
    const id = String(set.session_id || set.workout_session_id || "").trim().toLowerCase();
    if (id) return `session:${id}`;
    return `legacy:${set.entry_date || ""}:${normalizedName(set.workout_title || "Workout")}:${gymKey(set.gym_name)}`;
  }

  function summarize(sessions) {
    const working = sessions.flatMap((session) => session.sets.filter((set) => !isWarmUp(set)));
    const weighted = working.filter((set) => validNumber(set.weight_used) > 0 && validNumber(set.reps) > 0);
    const maxWeight = weighted.reduce((best, set) => Math.max(best, Number(set.weight_used)), 0);
    const maxReps = working.reduce((best, set) => Math.max(best, validNumber(set.reps) || 0), 0);
    const totalVolume = weighted.reduce((total, set) => total + Number(set.weight_used) * Number(set.reps), 0);
    const totalReps = working.reduce((total, set) => total + (validNumber(set.reps) || 0), 0);
    return { sessionCount: sessions.length, workingCount: working.length, maxWeight, maxReps, totalVolume, totalReps };
  }

  function topSet(session) {
    return session?.sets.filter((set) => !isWarmUp(set) && validNumber(set.reps) > 0)
      .sort((a, b) => (validNumber(b.weight_used) || 0) - (validNumber(a.weight_used) || 0)
        || Number(b.reps) - Number(a.reps))[0] || null;
  }

  function buildHistory(source, name, filter = allGyms) {
    const target = normalizedName(name);
    const matching = (Array.isArray(source) ? source : []).filter((set) => (
      target && normalizedName(set.exercise_name) === target &&
      !["WARMUP", "CARDIO"].includes(String(set.exercise_code || "").toUpperCase())
    ));
    const groups = new Map();
    matching.forEach((set) => {
      const key = sessionKey(set);
      if (!groups.has(key)) groups.set(key, {
        key, date: String(set.entry_date || ""),
        title: String(set.workout_title || "Workout"),
        gym: "", gymId: unknownGym, sets: []
      });
      const session = groups.get(key);
      if (!session.gym && String(set.gym_name || "").trim()) {
        session.gym = String(set.gym_name).trim();
        session.gymId = gymKey(session.gym);
      }
      session.sets.push(set);
    });
    const allSessions = Array.from(groups.values()).sort((a, b) => (
      b.date.localeCompare(a.date) || b.key.localeCompare(a.key)
    ));
    allSessions.forEach((session) => session.sets.sort((a, b) => (
      Number(isWarmUp(b)) - Number(isWarmUp(a)) ||
      Number(a.set_number || 0) - Number(b.set_number || 0) ||
      String(a.id || "").localeCompare(String(b.id || ""))
    )));
    const gyms = Array.from(new Set(allSessions.map((session) => session.gymId))).map((id) => {
      const gymSessions = allSessions.filter((session) => session.gymId === id);
      return {
        id,
        name: gymSessions.find((session) => session.gym)?.gym || "Gym not recorded",
        sessions: gymSessions,
        metrics: summarize(gymSessions),
        latestTopSet: topSet(gymSessions[0])
      };
    });
    const sessions = filter === allGyms ? allSessions : allSessions.filter((session) => session.gymId === filter);
    return { name: String(name || "").trim(), sessions, allSessions, gyms, metrics: summarize(sessions) };
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function numberLabel(value) {
    return Number(value).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  function setValue(set, key) {
    const value = validNumber(set[key]);
    return value === null ? "—" : numberLabel(value);
  }

  function topSetLabel(set) {
    if (!set) return "—";
    const reps = validNumber(set.reps);
    const weight = validNumber(set.weight_used);
    if (reps === null) return "—";
    return weight > 0 ? `${numberLabel(weight)} lb × ${numberLabel(reps)}` : `${numberLabel(reps)} reps`;
  }

  function dateLabel(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return String(value || "Date not recorded");
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
  }

  function setLabel(set, index) {
    if (isWarmUp(set)) {
      const ordinal = Number(set.set_number) > 1000 ? Number(set.set_number) - 1000 : index + 1;
      return `W${ordinal}`;
    }
    const number = Number(set.set_number);
    return Number.isInteger(number) && number > 0 && number <= 1000 ? String(number) : String(index + 1);
  }

  function sessionMarkup(session) {
    const metrics = summarize([session]);
    return `<section class="client-exercise-history-session">
      <div class="client-exercise-history-session-heading"><div><strong>${escapeHtml(dateLabel(session.date))}</strong><span>${escapeHtml(session.title)} · ${escapeHtml(session.gym || "Gym not recorded")}</span></div><small>${metrics.totalVolume > 0 ? `${numberLabel(metrics.totalVolume)} lb volume` : `${numberLabel(metrics.totalReps)} reps`}</small></div>
      <div class="client-exercise-history-table-wrap"><table><thead><tr><th scope="col">Set</th><th scope="col">Weight</th><th scope="col">Reps</th></tr></thead><tbody>
      ${session.sets.map((set, index) => `<tr class="${isWarmUp(set) ? "is-warmup" : ""}"><th scope="row">${escapeHtml(setLabel(set, index))}</th><td>${escapeHtml(setValue(set, "weight_used"))}${validNumber(set.weight_used) === null ? "" : " lb"}</td><td>${escapeHtml(setValue(set, "reps"))}</td></tr>`).join("")}
      </tbody></table></div></section>`;
  }

  function trendMarkup(sessions) {
    const sample = sessions.slice(0, 8).reverse();
    if (!sample.length) return "";
    const weighted = sample.some((session) => summarize([session]).totalVolume > 0);
    const points = sample.map((session) => ({
      date: dateLabel(session.date),
      value: weighted ? summarize([session]).totalVolume : summarize([session]).totalReps
    }));
    const peak = Math.max(1, ...points.map((point) => point.value));
    const unit = weighted ? "lb volume" : "reps";
    return `<section class="client-exercise-history-section" aria-labelledby="client-exercise-history-trend-title"><h3 id="client-exercise-history-trend-title">Trend</h3><p>${weighted ? "Working-set volume" : "Working-set reps"} across the latest ${points.length} ${points.length === 1 ? "session" : "sessions"}.</p>
      <ol class="client-exercise-history-trend">${points.map((point) => `<li><span>${escapeHtml(point.date)}</span><span class="client-exercise-history-trend-track"><span style="width:${Math.round(point.value / peak * 100)}%"></span></span><strong>${escapeHtml(`${numberLabel(point.value)} ${unit}`)}</strong></li>`).join("")}</ol></section>`;
  }

  function render() {
    if (!dialog) return;
    const history = buildHistory(logs, exerciseName, selectedGym);
    const selected = history.sessions;
    const latestTop = topSet(selected[0]);
    const more = selected.length > visibleCount;
    dialog.innerHTML = `<div class="client-exercise-history-header"><div><p>Exercise history</p><h2 id="client-exercise-history-title">${escapeHtml(history.name)}</h2></div><button type="button" data-client-exercise-history-close aria-label="Close exercise history">×</button></div>
      <div class="client-exercise-history-body">
      <label class="client-exercise-history-filter">Gym <select data-client-exercise-history-gym><option value="${allGyms}">All gyms</option>${history.gyms.map((gym) => `<option value="${escapeHtml(gym.id)}" ${selectedGym === gym.id ? "selected" : ""}>${escapeHtml(gym.name)}</option>`).join("")}</select></label>
      <div class="client-exercise-history-metrics"><div><span>Sessions</span><strong>${history.metrics.sessionCount}</strong></div><div><span>Best weight</span><strong>${history.metrics.maxWeight > 0 ? `${numberLabel(history.metrics.maxWeight)} lb` : "—"}</strong></div><div><span>Best reps</span><strong>${history.metrics.maxReps > 0 ? numberLabel(history.metrics.maxReps) : "—"}</strong></div><div><span>Total volume</span><strong>${history.metrics.totalVolume > 0 ? `${numberLabel(history.metrics.totalVolume)} lb` : "—"}</strong></div></div>
      <p class="client-exercise-history-latest">Latest top set: <strong>${escapeHtml(topSetLabel(latestTop))}</strong></p>
      ${trendMarkup(selected)}
      <section class="client-exercise-history-section" aria-labelledby="client-exercise-history-gyms-title"><h3 id="client-exercise-history-gyms-title">By gym</h3>
        ${history.gyms.length ? `<div class="client-exercise-history-gym-list">${history.gyms.map((gym) => `<div><strong>${escapeHtml(gym.name)}</strong><span>${gym.metrics.sessionCount} ${gym.metrics.sessionCount === 1 ? "session" : "sessions"}</span><span>Latest top set: ${escapeHtml(topSetLabel(gym.latestTopSet))}</span><span>Best: ${gym.metrics.maxWeight > 0 ? `${numberLabel(gym.metrics.maxWeight)} lb` : "—"}</span><span>Volume: ${numberLabel(gym.metrics.totalVolume)} lb</span></div>`).join("")}</div>` : '<p>No saved sets yet.</p>'}
      </section>
      <section class="client-exercise-history-section" aria-labelledby="client-exercise-history-sets-title"><h3 id="client-exercise-history-sets-title">Dated sets</h3>
        ${selected.length ? selected.slice(0, visibleCount).map(sessionMarkup).join("") : '<p>No saved sets for this gym.</p>'}
        ${more ? `<button type="button" class="client-exercise-history-more" data-client-exercise-history-more>Show ${Math.min(pageSize, selected.length - visibleCount)} more sessions</button>` : ""}
      </section></div>`;
  }

  function ensureDialog() {
    if (dialog || !root.document?.body) return dialog;
    dialog = root.document.createElement("dialog");
    dialog.className = "client-exercise-history-dialog";
    dialog.setAttribute("aria-labelledby", "client-exercise-history-title");
    root.document.body.append(dialog);
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog || event.target.closest?.("[data-client-exercise-history-close]")) dialog.close();
      if (event.target.closest?.("[data-client-exercise-history-more]")) {
        visibleCount += pageSize;
        render();
        dialog.querySelector("[data-client-exercise-history-more]")?.focus({ preventScroll: true });
      }
    });
    dialog.addEventListener("change", (event) => {
      if (!event.target.matches?.("[data-client-exercise-history-gym]")) return;
      selectedGym = event.target.value;
      visibleCount = pageSize;
      render();
      dialog.querySelector("[data-client-exercise-history-gym]")?.focus({ preventScroll: true });
    });
    dialog.addEventListener("close", () => {
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
      returnFocus = null;
    });
    return dialog;
  }

  function setLogs(value) {
    logs = Array.isArray(value) ? value : [];
    if (dialog?.open) render();
  }

  function open(name, trigger) {
    if (!normalizedName(name)) return;
    exerciseName = String(name).trim();
    selectedGym = allGyms;
    visibleCount = pageSize;
    returnFocus = trigger || null;
    const node = ensureDialog();
    if (!node) return;
    render();
    if (!node.open) node.showModal();
    node.querySelector("[data-client-exercise-history-gym]")?.focus({ preventScroll: true });
  }

  const api = { buildHistory, setLogs, open };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FWB_CLIENT_EXERCISE_HISTORY_DETAIL = api;
  if (root.FWB_CLIENT_EXERCISE_HISTORY_LOGS) setLogs(root.FWB_CLIENT_EXERCISE_HISTORY_LOGS);
  root.document?.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-client-exercise-history-open]");
    if (!trigger) return;
    event.preventDefault();
    event.stopPropagation();
    open(trigger.dataset.clientExerciseHistoryOpen, trigger);
  }, true);
})(typeof window === "undefined" ? globalThis : window);
