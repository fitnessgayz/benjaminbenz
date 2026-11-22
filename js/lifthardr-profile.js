(function (root) {
  "use strict";

  const weekMilliseconds = 7 * 86400000;
  const metrics = {
    duration: { title: "Duration", unit: "min", precision: 1 },
    volume: { title: "Volume", unit: "lb", precision: 0 },
    reps: { title: "Reps", unit: "reps", precision: 0 }
  };
  const labels = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  let activeMetric = "duration";
  let weeks = [];
  let historyStatus = "loading";

  function dateNumber(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || "") ? Date.parse(value + "T00:00:00Z") : NaN;
  }

  function monday(value) {
    return value - ((new Date(value).getUTCDay() + 6) % 7) * 86400000;
  }

  function positive(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function snapshotWeeks(records, today, sessionKey, isWorkingSet) {
    const todayNumber = dateNumber(today);
    if (!Number.isFinite(todayNumber)) return [];
    const start = monday(todayNumber) - 11 * weekMilliseconds;
    const result = Array.from({ length: 12 }, (_, index) => ({
      start: start + index * weekMilliseconds, duration: 0, volume: 0, reps: 0
    }));
    const sessions = new Map();
    for (const row of records || []) {
      const day = dateNumber(row.entry_date);
      if (!Number.isFinite(day) || day < start || day > todayNumber) continue;
      const key = sessionKey(row);
      if (!sessions.has(key)) sessions.set(key, { day, duration: 0, volume: 0, reps: 0, completed: false });
      const session = sessions.get(key);
      session.duration = Math.max(session.duration, positive(row.workout_duration_seconds));
      session.completed ||= Boolean(row.completed_at || (!row.session_id && !row.workout_session_id && !row.set_id));
      if (!isWorkingSet(row)) continue;
      const reps = positive(row.reps);
      session.reps += reps;
      session.volume += positive(row.weight_used) * reps;
    }
    for (const session of sessions.values()) {
      if (!session.completed) continue;
      const week = result[Math.floor((session.day - start) / weekMilliseconds)];
      week.duration += session.duration / 60;
      week.volume += session.volume;
      week.reps += session.reps;
    }
    return result;
  }

  function element(tag, text, className) {
    const node = root.document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function renderChart() {
    const target = root.document.querySelector("[data-lifthardr-profile-chart]");
    if (!target) return;
    if (historyStatus !== "ready" || !weeks.length) {
      target.replaceChildren(element("p", historyStatus === "loading" ? "Loading workouts…" : "Workout history is unavailable."));
      return;
    }
    const metric = metrics[activeMetric];
    const values = weeks.map(week => week[activeMetric]);
    const highest = Math.max(...values);
    if (!highest) {
      target.replaceChildren(element("p", `No ${metric.title.toLowerCase()} logged in the last 12 weeks.`));
      return;
    }
    const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: metric.precision });
    const total = values.reduce((sum, value) => sum + value, 0);
    const label = element("p", `${format.format(total)} ${metric.unit}`, "lifthardr-profile-chart-total");
    const bars = element("ol", null, "lifthardr-profile-chart-bars");
    bars.setAttribute("aria-label", `${metric.title} by week`);
    for (const week of weeks) {
      const value = week[activeMetric];
      const bar = element("li");
      const description = `Week of ${labels.format(week.start)}, ${format.format(value)} ${metric.unit}`;
      bar.title = description;
      bar.setAttribute("aria-label", description);
      const fill = element("span");
      fill.style.height = value ? `max(2px, ${(100 * value / highest).toFixed(2)}%)` : "0";
      fill.setAttribute("aria-hidden", "true");
      bar.append(fill);
      bars.append(bar);
    }
    const range = element("div", null, "lifthardr-profile-chart-range");
    range.setAttribute("aria-hidden", "true");
    range.append(element("span", labels.format(weeks[0].start)), element("span", labels.format(weeks.at(-1).start)));
    target.replaceChildren(label, bars, range);
  }

  function renderBadges(snapshot) {
    const target = root.document.querySelector("[data-lifthardr-profile-badges]");
    if (!target) return;
    if (!snapshot) {
      target.replaceChildren(element("p", historyStatus === "loading" ? "Loading badges…" : "Badges are unavailable."));
      return;
    }
    const earned = snapshot.badges.filter(badge => badge.unlocked)
      .sort((first, second) => (second.earnedOn || "").localeCompare(first.earnedOn || ""));
    if (!earned.length) {
      target.replaceChildren(element("p", "Earned badges will appear here."));
      return;
    }
    const grid = element("ul", null, "lifthardr-profile-badge-grid");
    for (const badge of earned.slice(0, 6)) {
      if (!/^(workout|pr|weeks|comeback|cardio|mobility|yoga)-\d+$/.test(badge.id)) continue;
      const item = element("li");
      const icon = element("img");
      icon.src = `images/achievements/${badge.id}.svg?v=1`;
      icon.alt = "";
      icon.loading = "lazy";
      item.append(icon, element("span", badge.title));
      grid.append(item);
    }
    target.replaceChildren(grid);
  }

  function render(data) {
    const name = root.document.querySelector("[data-lifthardr-profile-name]");
    if (name) name.textContent = data.name || "Client";
    historyStatus = data.status;
    weeks = snapshotWeeks(data.logs, data.today, data.sessionKey, data.isWorkingSet);
    renderChart();
    renderBadges(data.achievements);
  }

  if (typeof module === "object" && module.exports) module.exports = { snapshotWeeks };
  if (!root?.document) return;
  root.FWB_LIFTHARDR_PROFILE = { render };
  root.document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-lifthardr-profile-metric]");
    if (!button || !Object.hasOwn(metrics, button.dataset.lifthardrProfileMetric)) return;
    activeMetric = button.dataset.lifthardrProfileMetric;
    button.parentElement.querySelectorAll("[data-lifthardr-profile-metric]").forEach(option => {
      option.setAttribute("aria-pressed", String(option === button));
    });
    renderChart();
  });
})(typeof window === "undefined" ? null : window);
