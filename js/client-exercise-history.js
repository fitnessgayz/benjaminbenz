(function (root, factory) {
  const history = factory();
  if (typeof module === "object" && module.exports) module.exports = history;
  if (root) root.FWB_CLIENT_EXERCISE_HISTORY = history;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const normalize = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const number = (value) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 1 });
  const gymLabel = (row) => String(row?.gym_name || "").trim() || "Gym not recorded";
  const working = (row) => !String(row?.set_type || "").toLowerCase().includes("warm") && Number(row?.set_number) > 0;
  const volume = (row) => Math.max(0, Number(row?.weight_used) || 0) * Math.max(0, Number(row?.reps) || 0);
  const estimatedMax = (row) => {
    const weight = Number(row?.weight_used), reps = Number(row?.reps);
    return weight > 0 && reps > 0 ? weight * (1 + reps / 30) : 0;
  };

  function rowsForExercise(logs, name, gym = "All gyms") {
    const key = normalize(name);
    return (Array.isArray(logs) ? logs : []).filter((row) =>
      normalize(row?.exercise_name) === key && key &&
      !["CARDIO", "WARMUP"].includes(String(row?.exercise_code || "").toUpperCase()) &&
      (gym === "All gyms" || gymLabel(row) === gym));
  }

  function sessionsForRows(rows) {
    const sessions = new Map();
    rows.forEach((row) => {
      const gym = gymLabel(row);
      const key = row.session_id || `${row.entry_date}|${row.workout_title}|${gym}`;
      if (!sessions.has(key)) sessions.set(key, {
        key, date: String(row.entry_date || ""), title: String(row.workout_title || "Workout"), gym, rows: []
      });
      sessions.get(key).rows.push(row);
    });
    return [...sessions.values()].map((session) => ({
      ...session,
      rows: session.rows.sort((a, b) => Number(a.set_number || 0) - Number(b.set_number || 0)),
      volume: session.rows.filter(working).reduce((sum, row) => sum + volume(row), 0)
    })).sort((a, b) => b.date.localeCompare(a.date));
  }

  function metricsForRows(rows) {
    const sets = rows.filter(working);
    return {
      workouts: sessionsForRows(rows).length,
      sets: sets.length,
      volume: sets.reduce((sum, row) => sum + volume(row), 0),
      bestWeight: Math.max(0, ...sets.map((row) => Number(row.weight_used) || 0)),
      bestEstimatedMax: Math.max(0, ...sets.map(estimatedMax))
    };
  }

  function chartMarkup(sessions, metric) {
    const points = [...sessions].reverse().map((session) => ({
      date: session.date,
      value: metric === "volume" ? session.volume :
        Math.max(0, ...session.rows.filter(working).map(metric === "max" ? estimatedMax :
          (row) => Number(row.weight_used) || 0))
    })).filter((point) => point.value > 0);
    if (!points.length) return '<p class="client-exercise-history-empty">Log weight and reps to see your progress.</p>';
    const max = Math.max(...points.map((point) => point.value));
    const coordinates = points.map((point, index) => {
      const x = points.length === 1 ? 200 : 15 + index * 370 / (points.length - 1);
      const y = 145 - point.value / max * 120;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const label = metric === "max" ? "Estimated one rep max" : metric === "volume" ? "Workout volume" : "Max weight";
    return `<svg viewBox="0 0 400 165" role="img" aria-label="${escape(label)} trend across ${points.length} sessions">
      <path d="M15 145H385" stroke="#45505f" fill="none" />
      <polyline points="${coordinates.join(" ")}" fill="none" stroke="#42aaff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
      ${coordinates.map((coordinate) => `<circle cx="${coordinate.split(",")[0]}" cy="${coordinate.split(",")[1]}" r="4" fill="#42aaff" />`).join("")}
    </svg><div class="client-exercise-history-chart-labels"><span>${escape(points[0].date)}</span><strong>${escape(number(points.at(-1).value))} lb</strong><span>${escape(points.at(-1).date)}</span></div>`;
  }

  function historyMarkup(name, allRows, gym = "All gyms", metric = "weight") {
    const gyms = [...new Set(allRows.map(gymLabel))].sort();
    const rows = gym === "All gyms" ? allRows : allRows.filter((row) => gymLabel(row) === gym);
    const sessions = sessionsForRows(rows);
    const summary = metricsForRows(rows);
    const bestSet = rows.filter(working).sort((a, b) => Number(b.weight_used || 0) - Number(a.weight_used || 0))[0];
    const bestReps = rows.filter(working).sort((a, b) => Number(b.reps || 0) - Number(a.reps || 0))[0];
    const topSession = [...sessions].sort((a, b) => b.volume - a.volume)[0];
    return `<header class="client-exercise-history-header">
      <div><small>EXERCISE HISTORY</small><h2>${escape(name)}</h2></div>
      <button type="button" data-exercise-history-close aria-label="Close exercise history">×</button>
    </header>
    <div class="client-exercise-history-body">
      <label class="client-exercise-history-filter">Gym
        <select data-exercise-history-gym aria-label="Filter exercise history by gym">
          <option value="All gyms">All gyms</option>
          ${gyms.map((item) => `<option value="${escape(item)}"${gym === item ? " selected" : ""}>${escape(item)}</option>`).join("")}
        </select>
      </label>
      <div class="client-exercise-history-metrics">
        <div><span>Sessions</span><strong>${summary.workouts}</strong></div>
        <div><span>Working sets</span><strong>${summary.sets}</strong></div>
        <div><span>Lifetime volume</span><strong>${number(summary.volume)} lb</strong></div>
        <div><span>Best weight</span><strong>${summary.bestWeight ? `${number(summary.bestWeight)} lb` : "—"}</strong></div>
        <div><span>Best est. 1RM</span><strong>${summary.bestEstimatedMax ? `${number(summary.bestEstimatedMax)} lb` : "—"}</strong></div>
      </div>
      <section class="client-exercise-history-section">
        <h3>Strength trend</h3>
        <div class="client-exercise-history-metrics-switch" role="group" aria-label="Chart metric">
          ${[["weight", "Weight"], ["max", "Est. 1RM"], ["volume", "Volume"]].map(([value, label]) =>
            `<button type="button" data-exercise-history-metric="${value}" aria-pressed="${metric === value}">${label}</button>`).join("")}
        </div>
        ${chartMarkup(sessions, metric)}
      </section>
      ${gym === "All gyms" && gyms.length > 1 ? `<section class="client-exercise-history-section"><h3>By gym</h3>
        <div class="client-exercise-history-gyms">${gyms.map((item) => {
          const gymRows = allRows.filter((row) => gymLabel(row) === item);
          const gymMetrics = metricsForRows(gymRows);
          return `<button type="button" data-exercise-history-gym-choice="${escape(item)}"><strong>${escape(item)}</strong>
            <span>${gymMetrics.workouts} sessions · ${gymMetrics.sets} sets</span>
            <span>Best weight ${gymMetrics.bestWeight ? `${number(gymMetrics.bestWeight)} lb` : "—"}</span></button>`;
        }).join("")}</div></section>` : ""}
      <section class="client-exercise-history-section"><h3>Records</h3>
        <div class="client-exercise-history-records">
          <p><span>Heaviest set</span><strong>${bestSet ? `${number(bestSet.weight_used)} lb × ${number(bestSet.reps)} reps` : "—"}</strong></p>
          <p><span>Most reps</span><strong>${bestReps ? `${number(bestReps.reps)} at ${number(bestReps.weight_used)} lb` : "—"}</strong></p>
          <p><span>Most volume in a session</span><strong>${topSession ? `${number(topSession.volume)} lb` : "—"}</strong></p>
        </div>
      </section>
      <section class="client-exercise-history-section"><h3>Session history</h3>
        ${sessions.length ? sessions.map((session, index) => `<details class="client-exercise-history-session"${index === 0 ? " open" : ""}>
          <summary><strong>${escape(session.date)}</strong><span>${escape(session.gym)} · ${session.rows.length} sets</span></summary>
          <p>${escape(session.title)}</p>
          <table><thead><tr><th>Set</th><th>Type</th><th>Weight</th><th>Reps</th></tr></thead><tbody>
            ${session.rows.map((row) => `<tr><td>${escape(row.set_number)}</td><td>${escape(row.set_type || "Working")}</td>
              <td>${escape(number(row.weight_used))} lb</td><td>${escape(row.reps ?? "—")}</td></tr>`).join("")}
          </tbody></table><p><strong>Session volume:</strong> ${number(session.volume)} lb</p>
          ${[...new Set(session.rows.map((row) => String(row.notes || "").trim()).filter(Boolean))].map((note) => `<p class="client-exercise-history-note">${escape(note)}</p>`).join("")}
        </details>`).join("") : '<p class="client-exercise-history-empty">No saved sessions for this gym yet.</p>'}
      </section>
    </div>`;
  }

  function open({ name, logs, returnFocus } = {}) {
    if (typeof document === "undefined" || !name) return null;
    const allRows = rowsForExercise(logs, name);
    let gym = "All gyms", metric = "weight";
    const dialog = document.createElement("dialog");
    dialog.className = "client-exercise-history-dialog";
    const render = () => { dialog.innerHTML = historyMarkup(name, allRows, gym, metric); };
    render();
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog || event.target.closest("[data-exercise-history-close]")) { dialog.close(); return; }
      const metricButton = event.target.closest("[data-exercise-history-metric]");
      const gymButton = event.target.closest("[data-exercise-history-gym-choice]");
      if (metricButton) { metric = metricButton.dataset.exerciseHistoryMetric; render(); }
      if (gymButton) { gym = gymButton.dataset.exerciseHistoryGymChoice; render(); }
    });
    dialog.addEventListener("change", (event) => {
      if (event.target.matches("[data-exercise-history-gym]")) { gym = event.target.value; render(); }
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      returnFocus?.focus?.({ preventScroll: true });
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  }

  return { rowsForExercise, sessionsForRows, metricsForRows, historyMarkup, open };
});
