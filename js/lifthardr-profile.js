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
  let historyInput = null;
  let activeRange = 3;
  let pack = null;
  const ranges = { 1: "last month", 3: "last 3 months", 6: "last 6 months" };
  const emailKey = value => typeof value === "string" ? value.trim().toLowerCase() : "";
  const activePersonal = program => emailKey(program.membership_type) === "personal_training"
    && emailKey(program.account_type) !== "beta_tester" && program.active === true && program.client_archived !== true;

  function copyOwnedPrograms(programs, email) {
    if (!emailKey(email)) return [];
    return (Array.isArray(programs) ? programs : []).filter(program => program?.id && emailKey(program.client_email) === emailKey(email))
      .map(({ id, client_email, active, client_archived, membership_type, account_type,
              updated_at, created_at, session_count_used, session_count_total }) => ({
        id, client_email, active, client_archived, membership_type, account_type,
        updated_at, created_at, session_count_used, session_count_total
      }));
  }

  function currentPackBalance(programs, { user, ownerId, clientEmail, preview = false, isCoach = false } = {}) {
    const email = emailKey(clientEmail);
    if (preview || isCoach || !ownerId || user?.id !== ownerId || !email || emailKey(user.email) !== email) return null;
    const time = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : -Infinity;
    const current = copyOwnedPrograms(programs, email).filter(activePersonal).sort((a, b) =>
      (time(b.updated_at) - time(a.updated_at)) || (time(b.created_at) - time(a.created_at))
      || String(b.id).localeCompare(String(a.id))
    )[0];
    if (!current || !Number.isSafeInteger(current.session_count_total) || current.session_count_total <= 0
      || !Number.isSafeInteger(current.session_count_used) || current.session_count_used < 0) return null;
    return Math.max(0, current.session_count_total - current.session_count_used);
  }

  function drawPack(value) {
    const node = root.document.querySelector("[data-client-profile-session-pack]");
    const label = node?.querySelector("[data-client-profile-session-pack-label]");
    if (!label) return;
    const text = value === null ? "" : `${new Intl.NumberFormat().format(value)} ${value === 1 ? "session" : "sessions"} left in current pack`;
    if (label.textContent !== text) label.textContent = text;
    node.hidden = value === null;
  }

  function clearPack() {
    const previous = pack;
    pack = null;
    drawPack(null);
    previous?.subscription?.unsubscribe?.();
  }

  function configurePack({ user, clientEmail, preview, isCoach, programs, auth }) {
    clearPack();
    if (preview || isCoach || !user?.id || !emailKey(clientEmail)
      || emailKey(user.email) !== emailKey(clientEmail) || typeof auth?.onAuthStateChange !== "function") return;
    const next = pack = { user, ownerId: user.id, clientEmail, preview, isCoach,
      programs: copyOwnedPrograms(programs, clientEmail), subscription: null };
    // Confirm the restored auth session before displaying anything; once identity changes,
    // forget both the visible count and its private input, including on cross-tab logout.
    try {
      next.subscription = auth.onAuthStateChange((_event, session) => {
        if (pack !== next) return;
        if (session?.user?.id !== next.ownerId || emailKey(session?.user?.email) !== emailKey(next.clientEmail)) {
          pack = null;
          next.programs = [];
          drawPack(null);
          // Supabase auth callbacks should not call back into auth synchronously.
          queueMicrotask(() => next.subscription?.unsubscribe?.());
          return;
        }
        next.user = session.user;
        next.authenticated = true;
        drawPack(currentPackBalance(next.programs, next));
      })?.data?.subscription;
    } catch (_) { clearPack(); }
  }

  function refreshPack(program) {
    if (!pack) return;
    const row = copyOwnedPrograms([program], pack.clientEmail)[0];
    if (!program) pack.programs = [];
    else if (!row || !Object.hasOwn(program, "membership_type")) return;
    else pack.programs = [...pack.programs.filter(item => item.id !== row.id), row];
    if (pack.authenticated) drawPack(currentPackBalance(pack.programs, pack));
  }
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

  function snapshotWeeks(records, today, sessionKey, isWorkingSet, months) {
    const todayNumber = dateNumber(today);
    if (!Number.isFinite(todayNumber)) return [];
    const date = new Date(todayNumber);
    const firstOfTargetMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, 1));
    const lastDay = new Date(Date.UTC(firstOfTargetMonth.getUTCFullYear(), firstOfTargetMonth.getUTCMonth() + 1, 0)).getUTCDate();
    const start = Object.hasOwn(ranges, months)
      ? monday(Date.UTC(firstOfTargetMonth.getUTCFullYear(), firstOfTargetMonth.getUTCMonth(), Math.min(date.getUTCDate(), lastDay)))
      : monday(todayNumber) - 11 * weekMilliseconds;
    const length = 1 + Math.floor((monday(todayNumber) - start) / weekMilliseconds);
    const result = Array.from({ length }, (_, index) => ({
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
    const metric = metrics[activeMetric];
    const display = number => {
      const format = new Intl.NumberFormat(undefined, { maximumFractionDigits: metric.precision });
      if (activeMetric === "duration" && number >= 60) {
        return `${Math.floor(number / 60)} hr ${Math.floor(number % 60)} min`;
      }
      return `${format.format(number)} ${metric.unit}`;
    };
    const current = weeks.at(-1)?.[activeMetric] || 0;
    const ready = historyStatus === "ready" && weeks.length > 0;
    const weekSummary = root.document.querySelector("[data-lifthardr-profile-week-summary]");
    const weekDisplay = root.document.querySelector("[data-lifthardr-profile-week-value]");
    if (weekSummary) weekSummary.textContent = ready ? display(current) : "";
    if (weekDisplay) weekDisplay.textContent = ready ? display(current) : "–";
    if (!ready) {
      target.replaceChildren(element("p", historyStatus === "loading" ? "Loading workouts…" : "Workout history is unavailable."));
      return;
    }
    const values = weeks.map(week => week[activeMetric]);
    const highest = Math.max(...values);
    if (!highest) {
      target.replaceChildren(element("p", `No ${metric.title.toLowerCase()} logged in the ${ranges[activeRange]}.`));
      return;
    }
    const bars = element("ol", null, "lifthardr-profile-chart-bars");
    bars.style.setProperty("--profile-week-count", String(weeks.length));
    bars.setAttribute("aria-label", `${metric.title} by week`);
    for (const week of weeks) {
      const value = week[activeMetric];
      const bar = element("li");
      const description = `Week of ${labels.format(week.start)}, ${display(value)}`;
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
    target.replaceChildren(bars, range);
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
    for (const badge of earned) {
      if (!/^(workout|pr|weeks|comeback|cardio|mobility|yoga)-\d+$/.test(badge.id)) continue;
      const item = element("li");
      const details = element("details");
      const summary = element("summary");
      const icon = element("img");
      icon.src = `images/achievements/${badge.id}.svg?v=1`;
      icon.alt = "";
      icon.loading = "lazy";
      summary.append(icon, element("span", badge.title));
      details.append(summary);
      if (badge.detail) details.append(element("p", badge.detail));
      if (badge.earnedOn) details.append(element("p", `Earned ${badge.earnedOn}`));
      if (details.childElementCount > 1) item.append(details);
      else item.append(icon, element("span", badge.title));
      grid.append(item);
    }
    target.replaceChildren(grid);
  }

  function render(data) {
    const name = root.document.querySelector("[data-lifthardr-profile-name]");
    if (name) name.textContent = data.name || "Your profile";
    historyStatus = data.status;
    historyInput = data;
    weeks = snapshotWeeks(data.logs, data.today, data.sessionKey, data.isWorkingSet, activeRange);
    renderChart();
    renderBadges(data.achievements);
  }

  if (typeof module === "object" && module.exports) module.exports = { snapshotWeeks, currentPackBalance, copyOwnedPrograms };
  if (!root?.document) return;
  root.FWB_LIFTHARDR_PROFILE = { render, configurePack, refreshPack, clearPack };
  const earnedDialog = root.document.getElementById("client-profile-earned-badges");
  root.document.addEventListener("click", event => {
    if (event.target.closest("[data-client-profile-earned-open]") && earnedDialog && !earnedDialog.open) earnedDialog.showModal();
    if (event.target.closest("[data-client-profile-earned-all]") && earnedDialog?.open) earnedDialog.close();
  }, true);
  root.document.addEventListener("change", event => {
    if (!event.target.matches("[data-lifthardr-profile-range]") || !historyInput) return;
    const requested = Number(event.target.value);
    if (!Object.hasOwn(ranges, requested)) return;
    activeRange = requested;
    const data = historyInput;
    weeks = snapshotWeeks(data.logs, data.today, data.sessionKey, data.isWorkingSet, activeRange);
    renderChart();
  });
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
