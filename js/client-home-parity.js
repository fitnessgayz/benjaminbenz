(function (root) {
  'use strict';
  const document = root.document;
  if (!document) return;
  const planner = document.querySelector('.client-home-planner');
  if (!planner) return;
  const daysHost = planner.querySelector('[data-client-home-week-days]');
  const label = planner.querySelector('[data-client-home-week-label]');
  const detail = planner.querySelector('[data-client-home-week-detail]');
  const streak = planner.querySelector('[data-client-home-streak]');
  const rewardTrack = planner.querySelector('[data-client-reward-track]');
  const rewardCards = [...rewardTrack.querySelectorAll('.client-home-reward-card')];
  const rewardDots = [...planner.querySelectorAll('.client-home-reward-dots span')];
  const rewardPrevious = planner.querySelector('[data-client-reward-prev]');
  const rewardNext = planner.querySelector('[data-client-reward-next]');
  const weekLink = document.querySelector('[data-client-weekly-checkin]');
  let logs = [];
  let weekOffset = 0;
  let selectedDay = '';
  let client = null;
  let email = '';
  let preview = false;
  let weeklyRecord = null;
  let scheduled = [];
  let scheduleCache = new Map();
  let activityVersion = 0;
  const rewardIndex = () => Math.min(rewardCards.length - 1,
    Math.max(0, Math.round(rewardTrack.scrollLeft / Math.max(1, rewardTrack.clientWidth))));
  const updateRewardControls = () => {
    const index = rewardIndex();
    rewardPrevious.disabled = index === 0;
    rewardNext.disabled = index === rewardCards.length - 1;
    rewardDots.forEach((dot, position) => dot.classList.toggle('is-active', position === index));
  };
  rewardPrevious.addEventListener('click', () => rewardCards[Math.max(0, rewardIndex() - 1)].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }));
  rewardNext.addEventListener('click', () => rewardCards[Math.min(rewardCards.length - 1, rewardIndex() + 1)].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }));
  rewardTrack.addEventListener('scroll', updateRewardControls, { passive: true });
  root.addEventListener('resize', updateRewardControls);
  updateRewardControls();
  const dateKey = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const monday = value => {
    const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
    date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    return date;
  };
  const addDays = (value, days) => {
    const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
    date.setDate(date.getDate() + days);
    return date;
  };
  const formatDay = date => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const completed = () => new Set(logs.filter(row => row.completed_at && /^\d{4}-\d{2}-\d{2}$/.test(row.entry_date || '')).map(row => row.entry_date));
  const workoutsOn = key => [...new Set(logs.filter(row => row.entry_date === key && row.completed_at).map(row => String(row.workout_title || 'Workout').split(' · ')[0]))];
  const plannedOn = key => scheduled.filter(row => row.planned_date === key).map(row => row.title);
  async function refreshActivityTotals() {
    const version = ++activityVersion;
    const challenge = planner.querySelector('[data-client-challenge-streak]');
    const visits = planner.querySelector('[data-client-gym-visits]');
    if (!client || !email || preview) { challenge.textContent = '—'; visits.textContent = '—'; return; }
    try {
      const { data, error } = await client.rpc('client_home_activity_totals', { p_local_day: dateKey(new Date()) });
      if (error) throw error;
      if (version !== activityVersion) return;
      challenge.textContent = String(data?.[0]?.challenge_streak ?? '—');
      visits.textContent = String(data?.[0]?.gym_visits ?? '—');
    } catch (_) {
      if (version === activityVersion) { challenge.textContent = '—'; visits.textContent = '—'; }
    }
  }
  document.addEventListener('fwb:gym-checkin-saved', () => void refreshActivityTotals());
  document.addEventListener('fwb:daily-challenge-updated', () => void refreshActivityTotals());
  function renderPlanner() {
    const start = addDays(monday(new Date()), weekOffset * 7);
    const end = addDays(start, 6);
    const today = dateKey(new Date());
    const done = completed();
    const selectedKey = selectedDay || (weekOffset === 0 ? today : dateKey(start));
    label.textContent = weekOffset === 0 ? 'This week' : `${formatDay(start)} – ${formatDay(end)}`;
    daysHost.replaceChildren();
    for (let i = 0; i < 7; i++) {
      const day = addDays(start, i);
      const key = dateKey(day);
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.clientHomeDay = key;
      button.className = `${done.has(key) ? 'is-complete ' : ''}${plannedOn(key).length ? 'is-planned ' : ''}${key === today ? 'is-today ' : ''}${selectedKey === key ? 'is-selected' : ''}`;
      button.setAttribute('aria-pressed', String(selectedKey === key));
      button.setAttribute('aria-label', `${day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${done.has(key) ? ', workout completed' : ''}${plannedOn(key).length ? ', workout planned' : ''}`);
      const name = document.createElement('span');
      name.textContent = day.toLocaleDateString(undefined, { weekday: 'short' });
      const number = document.createElement('strong');
      number.textContent = String(day.getDate());
      const dot = document.createElement('span');
      dot.className = 'client-home-day-dot';
      dot.setAttribute('aria-hidden', 'true');
      button.append(name, number, dot);
      daysHost.append(button);
    }
    const key = selectedKey;
    const titles = workoutsOn(key);
    const planned = plannedOn(key);
    detail.textContent = [titles.length ? `Completed: ${titles.join(', ')}` : '', planned.length ? `Planned: ${planned.join(', ')}` : ''].filter(Boolean).join(' · ') ||
      (key < today ? 'No workout logged on this day.' : 'No workout planned yet. Open Workouts to choose one.');
    let count = 0;
    let week = monday(new Date());
    if (![...done].some(key => key >= dateKey(week) && key <= dateKey(addDays(week, 6)))) week = addDays(week, -7);
    while ([...done].some(key => key >= dateKey(week) && key <= dateKey(addDays(week, 6)))) {
      count++;
      week = addDays(week, -7);
      if (count > 520) break;
    }
    streak.textContent = String(count);
  }
  async function refreshSchedule() {
    const start = addDays(monday(new Date()), weekOffset * 7);
    const key = `${email}:${dateKey(start)}`;
    if (!client || !email || preview) { scheduled = []; renderPlanner(); return; }
    if (scheduleCache.has(key)) { scheduled = scheduleCache.get(key); renderPlanner(); return; }
    scheduled = [];
    renderPlanner();
    try {
      const { data, error } = await client.from('client_workout_schedule')
        .select('planned_date,title,source_type')
        .eq('client_email', email).eq('is_deleted', false)
        .gte('planned_date', dateKey(start)).lte('planned_date', dateKey(addDays(start, 6)));
      if (error) return;
      scheduleCache.set(key, data || []);
      if (key === `${email}:${dateKey(addDays(monday(new Date()), weekOffset * 7))}`) {
        scheduled = data || [];
        renderPlanner();
      }
    } catch (_) {
      // The activity week remains usable if scheduled plans are unavailable.
    }
  }
  planner.addEventListener('click', event => {
    const previous = event.target.closest('[data-client-home-week-prev]');
    const next = event.target.closest('[data-client-home-week-next]');
    const day = event.target.closest('[data-client-home-day]');
    if (previous || next) {
      weekOffset += previous ? -1 : 1;
      selectedDay = '';
      void refreshSchedule();
    } else if (day) {
      selectedDay = day.dataset.clientHomeDay;
      renderPlanner();
    }
  });
  const nav = document.getElementById('client-dashboard-navigation');
  if (nav) {
    const arrows = document.createElement('div');
    arrows.className = 'client-dock-arrows';
    arrows.hidden = true;
    arrows.innerHTML = '<button type="button" data-dock-previous aria-label="Scroll navigation left">‹</button><button type="button" data-dock-next aria-label="Scroll navigation right">›</button>';
    nav.after(arrows);
    const update = () => {
      const mobile = root.matchMedia('(max-width: 900px)').matches;
      arrows.hidden = !mobile || nav.scrollWidth <= nav.clientWidth + 2;
      arrows.querySelector('[data-dock-previous]').disabled = nav.scrollLeft < 8;
      arrows.querySelector('[data-dock-next]').disabled = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 8;
    };
    arrows.addEventListener('click', event => {
      const direction = event.target.closest('[data-dock-previous]') ? -1 : 1;
      nav.scrollBy({ left: direction * Math.max(180, nav.clientWidth * .65), behavior: 'smooth' });
    });
    nav.addEventListener('scroll', update, { passive: true });
    root.addEventListener('resize', update);
    if (root.ResizeObserver) new root.ResizeObserver(update).observe(nav);
    new MutationObserver(update).observe(nav, { childList: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    root.setTimeout(update, 250);
  }
  const wall = document.querySelector('[data-community-wall-list]');
  const homeFeed = document.querySelector('[data-client-home-community-feed]');
  if (wall && homeFeed) {
    const syncFeed = () => {
      homeFeed.replaceChildren();
      const cards = [...wall.querySelectorAll('.client-community-wall-card')].slice(0, 2);
      if (!cards.length) {
        const empty = document.createElement('p');
        empty.textContent = 'No shared wins yet. Your next workout could be the first.';
        homeFeed.append(empty);
      }
      for (const card of cards) {
        const preview = document.createElement('article');
        preview.className = 'client-home-community-post';
        const author = document.createElement('strong');
        author.textContent = card.querySelector('.client-community-wall-heading')?.textContent || 'Community';
        const body = document.createElement('p');
        body.textContent = card.querySelector('p')?.textContent || '';
        preview.append(author, body);
        homeFeed.append(preview);
      }
    };
    new MutationObserver(syncFeed).observe(wall, { childList: true });
    syncFeed();
  }
  const dialog = document.createElement('dialog');
  dialog.className = 'client-weekly-dialog';
  dialog.setAttribute('aria-labelledby', 'client-weekly-dialog-title');
  dialog.innerHTML = `<form data-weekly-form>
    <header><div><p class="kicker">Weekly coach check-in</p><h2 id="client-weekly-dialog-title">How did your week go?</h2><p data-weekly-range></p></div><button type="button" data-weekly-close aria-label="Close check-in">×</button></header>
    <p data-weekly-status role="status" aria-live="polite"></p>
    <label>Wins this week<textarea name="win" maxlength="500" rows="3" required></textarea></label>
    <label>Challenges<textarea name="challenge" maxlength="500" rows="3" required></textarea></label>
    <label>Recovery and energy<textarea name="recovery_summary" maxlength="1000" rows="3" required></textarea></label>
    <label>Pain or limitations<textarea name="pain_limitations" maxlength="1000" rows="3" required></textarea></label>
    <label>Question for your coach (optional)<textarea name="coach_question" maxlength="1000" rows="3"></textarea></label>
    <button type="submit" data-weekly-submit>Send weekly check-in</button>
  </form>`;
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const status = dialog.querySelector('[data-weekly-status]');
  const weekStart = () => dateKey(monday(new Date()));
  const setFields = record => {
    for (const name of ['win', 'challenge', 'recovery_summary', 'pain_limitations', 'coach_question']) {
      form.elements[name].value = record?.[name] || '';
    }
    for (const field of form.querySelectorAll('textarea')) field.readOnly = Boolean(record?.weekly_submitted_at);
    form.querySelector('[data-weekly-submit]').hidden = Boolean(record?.weekly_submitted_at);
    status.textContent = record?.weekly_submitted_at ? 'Your check-in was sent to your coach.' : '';
  };
  async function loadWeekly() {
    if (!client || !email || preview) return;
    const { data, error } = await client.from('client_check_ins').select('id,occurred_on,win,challenge,recovery_summary,pain_limitations,coach_question,weekly_submitted_at').eq('client_email', email).eq('occurred_on', weekStart()).limit(10);
    if (error) throw error;
    weeklyRecord = data?.find(row => row.weekly_submitted_at) || data?.[0] || null;
    weekLink.textContent = weeklyRecord?.weekly_submitted_at ? 'View weekly coach check-in' : 'Weekly coach check-in';
    setFields(weeklyRecord);
  }
  weekLink?.addEventListener('click', async () => {
    if (preview) return;
    dialog.querySelector('[data-weekly-range]').textContent = `${formatDay(monday(new Date()))} – ${formatDay(addDays(monday(new Date()), 6))}`;
    status.textContent = 'Loading your check-in…';
    dialog.showModal();
    try { await loadWeekly(); } catch (_) { status.textContent = 'Could not load your check-in. Close and try again.'; }
  });
  dialog.querySelector('[data-weekly-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!client || !email || preview || weeklyRecord?.weekly_submitted_at) return;
    const button = form.querySelector('[data-weekly-submit]');
    button.disabled = true;
    status.textContent = 'Sending your check-in…';
    const now = new Date().toISOString();
    const payload = { client_email: email, occurred_on: weekStart(), source: 'client_portal', updated_at: now, weekly_submitted_at: now };
    for (const name of ['win', 'challenge', 'recovery_summary', 'pain_limitations', 'coach_question']) payload[name] = form.elements[name].value.trim();
    try {
      const request = weeklyRecord?.id ? client.from('client_check_ins').update(payload).eq('id', weeklyRecord.id) : client.from('client_check_ins').insert(payload);
      const { error } = await request;
      if (error) throw error;
      await loadWeekly();
    } catch (_) { status.textContent = 'Your check-in could not be sent. Your answers are still here. Try again.'; }
    button.disabled = false;
  });
  root.FWB_CLIENT_HOME_PARITY = {
    render(nextLogs) { logs = Array.isArray(nextLogs) ? nextLogs : []; renderPlanner(); void refreshSchedule(); void refreshActivityTotals(); },
    configure(nextClient, nextEmail, isPreview) {
      const normalizedEmail = String(nextEmail || '').trim().toLowerCase();
      if (client !== nextClient || email !== normalizedEmail || preview !== Boolean(isPreview)) {
        weeklyRecord = null;
        scheduleCache = new Map();
        activityVersion++;
      }
      client = nextClient;
      email = normalizedEmail;
      preview = Boolean(isPreview);
      if (weekLink) weekLink.hidden = preview;
      void refreshActivityTotals();
    }
  };
})(window);
