(() => {
  const panel = document.querySelector('[data-client-dashboard-panel="progress"]');
  if (!panel) return;
  const state = { range: "3mo", tab: "overview", muscle: "All", sort: "Change", axis: "Week", logs: [] };
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const dateOf = (value) => new Date(`${String(value || "").slice(0, 10)}T12:00:00`);
  const shortDate = (value) => dateOf(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const axisDate = (value) => dateOf(value).toLocaleDateString("en-US", state.axis === "Month" ? { month: "short" } : { month: "short", day: "numeric" });
  const value = (number) => Number(number || 0).toLocaleString("en-US", { maximumFractionDigits: 1 });
  function filteredLogs() {
    if (state.range === "all") return state.logs;
    const now = new Date();
    const cutoff = new Date(now);
    if (state.range === "4wk") cutoff.setDate(now.getDate() - 28);
    else cutoff.setMonth(now.getMonth() - 3);
    cutoff.setHours(0, 0, 0, 0);
    return state.logs.filter((row) => dateOf(row.entry_date) >= cutoff);
  }
  function workoutData(logs) {
    const sessions = new Map();
    logs.forEach((row) => {
      const key = clientWorkoutHistorySessionKey(row);
      if (!sessions.has(key)) sessions.set(key, { date: row.entry_date, completed: false, sets: 0, volume: 0 });
      const session = sessions.get(key);
      session.completed ||= Boolean(row.completed_at);
      if (normalizedSetType(row.set_type, row.set_number) !== warmUpSetType) {
        session.sets += 1;
        session.volume += Math.max(0, Number(row.weight_used) || 0) * Math.max(0, Number(row.reps) || 0);
      }
    });
    return [...sessions.values()].filter((session) => session.completed).sort((a, b) => a.date.localeCompare(b.date));
  }
  function chartMarkup(sessions) {
    const points = sessions.filter((session) => session.volume > 0);
    if (!points.length) return '<div class="client-progress-chart-empty">Log weight and reps to start your volume chart.</div>';
    const max = Math.max(1, ...points.map((point) => point.volume));
    const positions = points.map((point, index) => ({ x: 34 + (index * 286 / Math.max(1, points.length - 1)), y: 124 - point.volume / max * 104 }));
    const line = positions.map((p, index) => `${index ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    const area = `${line} L${positions.at(-1).x.toFixed(1)} 124 L${positions[0].x.toFixed(1)} 124 Z`;
    const labels = [points[0], points[Math.floor((points.length - 1) / 2)], points.at(-1)];
    return `<svg viewBox="0 0 340 150" role="img" aria-label="Volume per workout for ${points.length} logged training days"><path class="progress-grid" d="M34 20H320 M34 72H320 M34 124H320"/><text x="0" y="24">${esc(Math.round(max / 1000))}K</text><text x="3" y="76">${esc(Math.round(max / 2000))}K</text><text x="19" y="128">0</text><path class="progress-chart-area" d="${area}"/><path class="progress-chart-line" d="${line}"/>${positions.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="2.5"/>`).join("")}${labels.map((row, index) => `<text x="${[34, 166, 290][index]}" y="147">${esc(axisDate(row.date))}</text>`).join("")}</svg>`;
  }
  function renderOverview(logs) {
    const sessions = workoutData(logs);
    const records = exerciseProgressRecords(logs).sort((a, b) => b.latestDate.localeCompare(a.latestDate));
    const sets = sessions.reduce((sum, row) => sum + row.sets, 0);
    const volume = sessions.reduce((sum, row) => sum + row.volume, 0);
    const metrics = [["Workouts", sessions.length], ["Sets logged", sets], ["Total volume", `${value(volume >= 1000 ? volume / 1000 : volume)}${volume >= 1000 ? "K" : ""} lb`], ["Personal bests", records.length]];
    document.getElementById("client-progress-overview").innerHTML = `<div class="client-progress-metrics">${metrics.map(([label, amount]) => `<div><span>${esc(label)}</span><strong>${esc(amount)}</strong></div>`).join("")}</div><section class="client-progress-chart"><div class="client-progress-chart-title"><span>VOLUME PER WORKOUT (LB)</span><button type="button" id="client-progress-axis" aria-label="Chart date labels: ${state.axis}">${state.axis}⌄</button></div>${chartMarkup(sessions)}<p>${sessions.filter((s) => s.volume > 0).length} logged training days · rest days skipped</p></section><div class="client-progress-latest-title"><span>LATEST PERSONAL BESTS</span><button type="button" data-progress-show-lifts>See all ${records.length} ›</button></div><div class="client-progress-latest-list">${records.slice(0, 2).map((record) => `<button type="button" data-client-exercise-history-open="${esc(record.name)}">${exerciseThumb(record)}<span><strong>${esc(record.name)}</strong><small>${record.dates.size} workouts · Last done ${esc(shortDate(record.latestDate))}</small></span><b>${esc(value(record.bestValue))} ${esc(record.unit)}</b></button>`).join("") || '<p class="client-progress-empty">Log a working set to see your personal bests.</p>'}</div>`;
  }
  function exerciseThumb(record) {
    const { imageUrl } = exerciseMedia({ name: record.name });
    const { fullUrl, thumbnailUrl } = responsiveExerciseImageUrls(imageUrl);
    if (!thumbnailUrl) return '<span class="client-progress-exercise-thumb is-empty" aria-hidden="true">▥</span>';
    const branded = isBrandedExerciseImage(thumbnailUrl) ? ' is-branded' : '';
    const fallback = fullUrl && fullUrl !== thumbnailUrl ? ` data-exercise-media-fallback="${esc(fullUrl)}"` : '';
    return `<span class="client-progress-exercise-thumb${branded}"><img src="${esc(thumbnailUrl)}"${fallback} alt="" loading="lazy" decoding="async"></span>`;
  }
  function muscleOf(record) {
    const exercise = approvedExerciseForName(record.name);
    const muscle = String(exercise?.primary_muscle || exercise?.primaryMuscle || exerciseSuggestionMuscleLabel(exercise || {}) || "").toLowerCase();
    if (/glute/.test(muscle)) return "Glutes";
    if (/quad|hamstring|leg|calf/.test(muscle)) return "Legs";
    if (/chest|pectoral/.test(muscle)) return "Chest";
    if (/back|lat|trap/.test(muscle)) return "Back";
    return "Other";
  }
  function renderLifts(logs) {
    let records = exerciseProgressRecords(logs).map((record) => ({ ...record, muscle: muscleOf(record), currentChange: record.latestValue - record.startingValue }));
    if (state.muscle !== "All") records = records.filter((record) => record.muscle === state.muscle);
    records.sort((a, b) => state.sort === "Change" ? ((a.dates.size < 2) - (b.dates.size < 2) || b.currentChange - a.currentChange || b.latestDate.localeCompare(a.latestDate)) : b.latestDate.localeCompare(a.latestDate));
    document.getElementById("client-progress-lifts").innerHTML = records.map((record) => {
      const count = record.dates.size;
      const change = record.currentChange;
      const badge = count < 2 ? "New" : change > 0 ? `▲ ${value(change)} ${record.unit}` : change < 0 ? `▼ ${value(Math.abs(change))} ${record.unit}` : `0 ${record.unit}`;
      return `<button type="button" class="client-progress-lift" data-client-exercise-history-open="${esc(record.name)}"><span class="client-progress-lift-top">${exerciseThumb(record)}<span class="client-progress-lift-info"><strong>${esc(record.name)}</strong><small>${esc(record.muscle)} · ${count} ${count === 1 ? "workout" : "workouts"}</small></span><b class="${change > 0 && count > 1 ? "positive" : ""}">${esc(badge)}</b></span>${count < 2 ? `<small>${esc(value(record.latestValue))} ${esc(record.unit)} · ${esc(shortDate(record.latestDate))}. Log it once more to see progress.</small>` : `<span class="client-progress-compare"><span><small>Started · ${esc(shortDate(record.started.date))}</small><strong>${esc(value(record.startingValue))} ${esc(record.unit)}</strong></span><i>→</i><span><small>Now · ${esc(shortDate(record.latest.date))}</small><strong>${esc(value(record.latestValue))} ${esc(record.unit)}</strong></span></span>${change < 0 ? '<small>Compare reps before reading this as a drop.</small>' : ""}`}</button>`;
    }).join("") || '<p class="client-progress-empty">Log an exercise to see your lift progress here.</p>';
  }
  function render() {
    const logs = filteredLogs();
    const completedKeys = new Set(logs.filter((row) => row.completed_at).map(clientWorkoutHistorySessionKey));
    const completedLogs = logs.filter((row) => completedKeys.has(clientWorkoutHistorySessionKey(row)));
    renderOverview(completedLogs);
    renderLifts(completedLogs);
    panel.querySelectorAll("[data-progress-range]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.progressRange === state.range)));
    panel.querySelectorAll("[data-progress-tab]").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.progressTab === state.tab)));
    panel.querySelectorAll("[data-progress-content]").forEach((section) => { section.hidden = section.dataset.progressContent !== state.tab; });
    panel.querySelectorAll("[data-progress-muscle]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.progressMuscle === state.muscle)));
    document.getElementById("client-progress-sort").textContent = `Sort: ${state.sort}⌄`;
  }
  window.FWB_RENDER_CLIENT_PROGRESS = (logs) => { state.logs = Array.isArray(logs) ? logs : []; render(); };
  panel.addEventListener("click", async (event) => {
    const range = event.target.closest("[data-progress-range]");
    const tab = event.target.closest("[data-progress-tab]");
    const muscle = event.target.closest("[data-progress-muscle]");
    if (range) state.range = range.dataset.progressRange;
    if (tab) state.tab = tab.dataset.progressTab;
    if (muscle) state.muscle = muscle.dataset.progressMuscle;
    if (event.target.closest("[data-progress-show-lifts]")) state.tab = "lifts";
    if (event.target.closest("#client-progress-sort")) state.sort = state.sort === "Change" ? "Recent" : "Change";
    if (event.target.closest("#client-progress-axis")) state.axis = state.axis === "Week" ? "Month" : "Week";
    if (range || tab || muscle || event.target.closest("[data-progress-show-lifts], #client-progress-sort, #client-progress-axis")) render();
    if (event.target.closest("#client-progress-share")) {
      const sessions = workoutData(filteredLogs());
      const text = `My FWB progress: ${sessions.length} workouts and ${sessions.reduce((sum, row) => sum + row.sets, 0)} sets logged.`;
      try { if (navigator.share) await navigator.share({ title: "FWB Progress", text }); else { await navigator.clipboard.writeText(text); event.target.setAttribute("aria-label", "Progress summary copied"); } } catch (_) { /* Dismissed share sheet. */ }
    }
  });
  state.logs = typeof trainingLogs !== "undefined" && Array.isArray(trainingLogs) ? trainingLogs : [];
  render();
})();
