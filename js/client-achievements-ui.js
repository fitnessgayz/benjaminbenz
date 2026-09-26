(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FWB_ACHIEVEMENTS_UI = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const filters = ["all", "workouts", "records", "consistency", "cardio", "recovery"];
  const filterLabels = { all: "All badges", workouts: "Workouts", records: "Personal records", consistency: "Consistency", cardio: "Cardio", recovery: "Recovery" };
  const badgeArtworkIDs = new Set([
    "workout-1", "workout-5", "workout-10", "workout-25", "workout-50", "workout-100", "workout-250",
    "pr-1", "pr-5", "pr-10", "pr-25", "weeks-3", "weeks-8", "weeks-12", "comeback-1",
    "cardio-1", "cardio-10", "cardio-50", "mobility-1", "mobility-10", "mobility-25", "yoga-1", "yoga-10", "yoga-25"
  ]);
  const seenCelebrations = new Set();
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
  const count = (value) => Math.max(0, Number(value) || 0).toLocaleString("en-US");
  const percent = (value) => Math.max(0, Math.min(100, Number(value) || 0));

  function iconMarkup(name = "trophy") {
    const paths = {
      trophy: '<path d="M8 3h8v5a4 4 0 0 1-8 0V3Z"/><path d="M8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 12v6m-4 3h8m-6-3h4v3"/>',
      star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
      bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>',
      flame: '<path d="M13 3c1 5-4 5-2 9 2-1 3-3 3-5 4 4 6 7 4 11a7 7 0 0 1-12-1C4 12 9 9 9 6c1 2 1 3 1 4 2-2 3-4 3-7Z"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-14 4h2m6 0h2m-10 4h2m6 0h2"/>',
      heart: '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 5 2 10 8 15 6-5 12-10 8-15Z"/><path d="M4 12h4l2-4 3 8 2-4h5"/>',
      return: '<path d="M4 9a8 8 0 1 1 0 8M4 3v6h6"/>',
      dumbbell: '<path d="M6 7v10M3 9v6m15-8v10m3-8v6M6 12h12"/>',
      lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>'
    };
    const alias = /heart|cardio/.test(name) ? "heart" : /calendar|week/.test(name) ? "calendar"
      : /return|comeback|arrow/.test(name) ? "return" : /flame|fire/.test(name) ? "flame"
      : /bolt|spark/.test(name) ? "bolt" : /dumbbell|workout/.test(name) ? "dumbbell"
      : /star|medal/.test(name) ? "star" : name;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[alias] || paths.trophy}</svg>`;
  }

  function dateLabel(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    if (!match) return "Earned";
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
    return `Earned ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  }

  function badgeArtworkMarkup(id, fallbackIcon) {
    return badgeArtworkIDs.has(id)
      ? `<img class="achievement-badge-art" src="images/achievements/${id}.svg?v=1" width="128" height="128" alt="" decoding="async" />`
      : iconMarkup(fallbackIcon);
  }

  function levelMarkup(snapshot, compact = false) {
    const level = snapshot.level;
    const next = level.nextXP == null ? "Top level unlocked. Keep collecting your wins."
      : `${count(level.nextXP - snapshot.xp)} XP to ${escape(level.nextName)}`;
    const fill = level.nextXP == null ? 100
      : percent((snapshot.xp - level.minimumXP) / Math.max(1, level.nextXP - level.minimumXP) * 100);
    return `<div class="achievement-level${compact ? " is-compact" : ""}">
      <span class="achievement-level-medallion" aria-hidden="true">${iconMarkup("trophy")}<b>${count(level.number)}</b></span>
      <div class="achievement-level-copy"><span class="achievement-eyebrow">Level ${count(level.number)}</span>
        <h${compact ? "4" : "3"}>${escape(level.name)}</h${compact ? "4" : "3"}>
        <div class="achievement-xp-label"><strong>${count(snapshot.xp)} XP</strong><span>${next}</span></div>
        <progress class="achievement-progress" max="100" value="${fill}" aria-label="Progress toward ${escape(level.nextName || "the highest level")}">${Math.round(fill)}%</progress>
      </div></div>`;
  }

  function nextBadge(snapshot) {
    return snapshot.badges.filter((badge) => !badge.unlocked).sort((a, b) => (
      (b.current / Math.max(1, b.target)) - (a.current / Math.max(1, a.target))
    ))[0];
  }

  function homeMarkup(snapshot) {
    const next = nextBadge(snapshot);
    const earned = snapshot.badges.filter((badge) => badge.unlocked).length;
    return `<header class="achievement-section-heading"><div><p class="kicker">Every effort counts</p><h3>Your wins</h3></div>
      <button type="button" class="achievement-link" data-client-summary-go-tab="progress">Trophy room <span aria-hidden="true">↗</span></button></header>
      ${levelMarkup(snapshot, true)}
      <div class="achievement-home-next"><span class="achievement-mini-icon achievement-medal-preview" aria-hidden="true">${badgeArtworkMarkup(next?.id || "workout-250", next?.icon)}</span><div><small>${next ? "Next badge" : "Collection complete"}</small>
      <strong>${escape(next?.title || "All badges unlocked")}</strong><span>${next ? `${count(Math.min(next.current, next.target))} / ${count(next.target)} · ${escape(next.detail)}` : "Look at everything you’ve accomplished."}</span></div>
      <span class="achievement-earned-count">${earned}<small>badges earned</small></span></div>`;
  }

  function badgeMarkup(badge) {
    const tier = ["bronze", "silver", "gold", "platinum"].includes(badge.tier) ? badge.tier : "bronze";
    const fill = percent(badge.current / Math.max(1, badge.target) * 100);
    return `<li class="achievement-badge achievement-tier-${tier}${badge.unlocked ? " is-earned" : " is-locked"}">
      <div class="achievement-badge-top"><span class="achievement-badge-emblem" aria-hidden="true">${badgeArtworkMarkup(badge.id, badge.icon)}</span><span class="achievement-tier">${escape(tier)}</span></div>
      <h4>${escape(badge.title)}</h4><p>${escape(badge.detail)}</p>
      ${badge.unlocked ? `<span class="achievement-badge-earned">${iconMarkup("star")}${escape(dateLabel(badge.earnedOn))}</span>`
        : `<div class="achievement-badge-target"><span>${iconMarkup("lock")}To unlock</span><strong>${count(Math.min(badge.current, badge.target))} / ${count(badge.target)}</strong></div><progress class="achievement-progress" max="100" value="${fill}" aria-label="${escape(badge.title)} progress">${Math.round(fill)}%</progress>`}
    </li>`;
  }

  function roomMarkup(snapshot, filter = "all") {
    const selected = filters.includes(filter) ? filter : "all";
    const earned = snapshot.badges.filter((badge) => badge.unlocked).length;
    const badges = snapshot.badges.filter((badge) => selected === "all" || badge.category === selected);
    return `<header class="achievement-section-heading"><div><p class="kicker">Small steps. Big wins.</p><h3 id="client-trophy-room-title">Your trophy room</h3></div><span class="achievement-collection-count">${earned} / ${snapshot.badges.length} earned</span></header>
      <p class="achievement-intro">Celebrate showing up, getting stronger, and finding your rhythm. Your journey, your pace.</p>
      ${levelMarkup(snapshot)}
      <details class="achievement-how"><summary>How you level up</summary><p>Earn 100 XP for each completed workout, 50 XP for each new personal record, and 100 XP for each badge. Rest days are part of the plan—there’s no daily streak to lose.</p></details>
      <div class="achievement-filters" role="group" aria-label="Filter badges">${filters.map((item) => `<button type="button" data-achievement-filter="${item}" aria-pressed="${item === selected}">${filterLabels[item]}</button>`).join("")}</div>
      <ul class="achievement-badge-grid" aria-label="${filterLabels[selected]}">${badges.map(badgeMarkup).join("")}</ul>`;
  }

  function stateMarkup(status, compact) {
    const error = status === "error";
    return `<header class="achievement-section-heading"><div><p class="kicker">Every effort counts</p><h3${compact ? "" : ' id="client-trophy-room-title"'}>${compact ? "Your wins" : "Your trophy room"}</h3></div></header>
      <p class="achievement-state" role="status">${error ? "Couldn’t load your wins. Your workout history is safe. Try again when you’re connected." : "Loading your wins…"}</p>
      ${error ? '<button class="achievement-retry" type="button" data-achievement-retry>Retry</button>' : ""}`;
  }

  function celebrationForSession(before, after, sessionIds, { completedSession = false } = {}) {
    if (!before || !after || !sessionIds?.length) return null;
    const known = new Set(before.events.map((event) => event.id));
    const events = after.events.filter((event) => sessionIds.includes(event.sessionId) && !known.has(event.id));
    // A historic import or a changed account must never turn into a completion popup.
    if (!events.length && (!completedSession || after.workouts <= before.workouts)) return null;
    const level = after.level.number > before.level.number ? after.level : null;
    if (!events.length && !level) return null;
    return { events, level, sessionIds, xp: Math.max(0, after.xp - before.xp) };
  }

  function takeCelebration(celebration, account, storage) {
    if (!celebration || !String(account || "").trim()) return null;
    const key = `fwb-achievement-celebration-v1:${String(account).trim().toLowerCase()}:${celebration.sessionIds.slice().sort().join("|")}`;
    if (seenCelebrations.has(key)) return null;
    try { if (storage?.getItem(key)) { seenCelebrations.add(key); return null; } } catch (_) { /* Private browsing still gets one celebration this visit. */ }
    seenCelebrations.add(key);
    try { storage?.setItem(key, "1"); } catch (_) { /* Keep the in-memory acknowledgement. */ }
    return celebration;
  }

  function celebrationMarkup(celebration) {
    if (!celebration) return "";
    return `<div class="achievement-celebration-confetti" aria-hidden="true">${Array.from({ length: 10 }, (_, index) => `<i style="--piece:${index}"></i>`).join("")}</div>
      <p class="achievement-eyebrow">${celebration.level ? "Level up!" : "Fresh wins unlocked"} <span>+${count(celebration.xp)} XP</span></p>
      ${celebration.level ? `<h3>Level ${count(celebration.level.number)} · ${escape(celebration.level.name)}</h3>` : ""}
      <ul>${celebration.events.map((event) => `<li><span class="achievement-mini-icon achievement-medal-preview" aria-hidden="true">${badgeArtworkMarkup(event.badgeId || (event.kind === "pr" ? "pr-1" : null), "dumbbell")}</span><div><strong>${escape(event.title)}</strong><span>${escape(event.detail)}</span></div></li>`).join("")}</ul>`;
  }

  function createController(document, onRetry) {
    let latest = null;
    let status = "loading";
    let filter = "all";
    function render(snapshot = latest, nextStatus = status) {
      latest = snapshot;
      status = nextStatus;
      const home = document.querySelector("[data-client-achievements-home]");
      const room = document.querySelector("[data-client-achievements-room]");
      if (home) home.innerHTML = latest && status === "ready" ? homeMarkup(latest) : stateMarkup(status, true);
      if (room) room.innerHTML = latest && status === "ready" ? roomMarkup(latest, filter) : stateMarkup(status, false);
    }
    document.addEventListener("click", (event) => {
      const dialog = document.querySelector("[data-achievements-dialog]");
      if (event.target.closest("[data-achievements-dialog-open]")) {
        if (dialog && !dialog.open) dialog.showModal();
      }
      if (event.target.closest("[data-achievements-dialog-close]")) dialog?.close();
      const choice = event.target.closest("[data-achievement-filter]");
      if (choice) {
        filter = filters.includes(choice.dataset.achievementFilter) ? choice.dataset.achievementFilter : "all";
        render();
        document.querySelector(`[data-achievement-filter="${filter}"]`)?.focus();
      }
      if (event.target.closest("[data-achievement-retry]")) onRetry?.();
    });
    return { render };
  }

  return { iconMarkup, homeMarkup, roomMarkup, badgeMarkup, stateMarkup, celebrationForSession, takeCelebration, celebrationMarkup, createController };
});
