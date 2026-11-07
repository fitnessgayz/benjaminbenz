(function (root) {
  'use strict';
  const document = root.document;
  if (!document) return;
  const planner = document.querySelector('.client-home-planner');
  if (!planner) return;
  const streakSection = document.querySelector('.client-home-streak');
  const daysHost = planner.querySelector('[data-client-home-week-days]');
  const label = planner.querySelector('[data-client-home-week-label]');
  const detail = planner.querySelector('[data-client-home-week-detail]');
  const streak = streakSection.querySelector('[data-client-home-streak]');
  const rewardTrack = streakSection.querySelector('[data-client-reward-track]');
  const rewardCards = [...rewardTrack.querySelectorAll('.client-home-reward-card')];
  const rewardDots = [...streakSection.querySelectorAll('.client-home-reward-dots span')];
  const rewardPrevious = streakSection.querySelector('[data-client-reward-prev]');
  const rewardNext = streakSection.querySelector('[data-client-reward-next]');
  const weekLink = document.querySelector('[data-client-weekly-checkin]');
  let logs = [];
  let weekOffset = 0;
  let selectedDay = '';
  let client = null;
  let email = '';
  let preview = false;
  let weeklyRecord = null;
  let scheduled = [];
  let program = null;
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
  function renderNextWorkout() {
    const card = document.querySelector('.client-home-last-workout');
    const suggestion = document.querySelector('[data-client-home-suggestion]');
    if (!card || !suggestion) return;
    const sessions = new Map();
    for (const row of logs) {
      const key = String(row.session_id || row.workout_session_id || '').trim().toLowerCase()
        || `${row.entry_date || ''}::${String(row.workout_title || '').toLowerCase()}`;
      if (!sessions.has(key)) sessions.set(key, []);
      sessions.get(key).push(row);
    }
    const latest = [...sessions.entries()].filter(([, rows]) => rows.some(row => row.completed_at)).sort((a, b) => {
      const stamp = rows => `${rows[0]?.entry_date || ''} ${rows.map(row => row.completed_at || '').sort().at(-1) || ''}`;
      return stamp(b[1]).localeCompare(stamp(a[1]));
    })[0];
    card.hidden = !latest;
    if (latest) {
      const [key, rows] = latest;
      const day = new Date(`${rows[0].entry_date}T12:00:00`);
      const today = new Date();
      const days = Number.isNaN(day.getTime()) ? null : Math.max(0, Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()) - new Date(day.getFullYear(), day.getMonth(), day.getDate())) / 86400000));
      const recency = days === 0 ? 'Today' : days === 1 ? '1 day ago' : days !== null ? `${days} days ago` : 'Recent';
      card.querySelector('[data-client-last-recency]').textContent = recency;
      card.querySelector('[data-client-last-title]').textContent = String(rows[0].workout_title || 'Workout').split(' · ')[0];
      const working = rows.filter(row => String(row.exercise_code || '').toUpperCase() !== 'WARMUP'
        && String(row.exercise_code || '').toUpperCase() !== 'CARDIO'
        && String(row.set_type || '').toLowerCase().replace(/[^a-z]/g, '') !== 'warmup'
        && Number(row.set_number || 0) < 1000);
      const duration = Math.max(0, ...rows.map(row => Number(row.workout_duration_seconds) || 0));
      const volume = working.reduce((sum, row) => sum + (Number(row.weight_used) || 0) * (Number(row.reps) || 0), 0);
      card.querySelector('[data-client-last-stats]').textContent = [
        duration > 0 ? `${Math.max(1, Math.round(duration / 60))} min` : null,
        `${working.length} ${working.length === 1 ? 'set' : 'sets'}`,
        volume > 0 ? `${Math.round(volume).toLocaleString()} lb` : null
      ].filter(Boolean).join(' · ');
      const historyKey = key.startsWith('session:') || key.startsWith('legacy:') ? key
        : rows[0].session_id || rows[0].workout_session_id ? `session:${key}` : `legacy:${key}`;
      card.querySelector('.client-home-last-detail').dataset.clientLastWorkoutKey = historyKey;
      card.querySelector('[data-copy-workout-to-custom]').dataset.copyWorkoutToCustom = historyKey;
    }
    const workouts = (Array.isArray(program?.workouts) ? program.workouts : [])
      .filter(row => Array.isArray(row.exercises) && row.exercises.length);
    const planned = scheduled.filter(row => row.planned_date >= dateKey(new Date())).sort((a, b) => a.planned_date.localeCompare(b.planned_date))[0];
    const plannedIndex = planned ? workouts.findIndex(row => String(row.title || '').toLowerCase() === String(planned.title || '').toLowerCase()) : -1;
    const lastTitle = latest ? String(latest[1][0].workout_title || '').split(' · ')[0].toLowerCase() : '';
    const lastIndex = workouts.findIndex(row => String(row.title || '').toLowerCase() === lastTitle);
    const nextIndex = plannedIndex >= 0 ? plannedIndex : lastIndex >= 0 ? (lastIndex + 1) % workouts.length : 0;
    const next = workouts[nextIndex];
    suggestion.textContent = next?.title || 'Choose your next workout';
    const nextDay = document.querySelector('[data-client-home-next-day]');
    if (nextDay) nextDay.textContent = planned && plannedIndex >= 0
      ? new Date(`${planned.planned_date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })
      : 'Ready when you are';
  }
  async function refreshActivityTotals() {
    const version = ++activityVersion;
    const challenge = streakSection.querySelector('[data-client-challenge-streak]');
    const visits = streakSection.querySelector('[data-client-gym-visits]');
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
    const gymDays = new Set([...document.querySelectorAll('#client-weekly-days .client-weekly-day')]
      .filter(day => day.querySelector('.has-checkin'))
      .map(day => day.dataset.clientWeeklyDate));
    const selectedKey = selectedDay || (weekOffset === 0 ? today : dateKey(start));
    label.textContent = `${formatDay(start)}–${end.getDate()}`;
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
      const dots = document.createElement('span');
      dots.className = 'client-home-day-dots';
      const workoutDot = document.createElement('span');
      workoutDot.className = `client-home-day-dot workout${done.has(key) ? ' is-active' : ''}`;
      const gymDot = document.createElement('span');
      gymDot.className = `client-home-day-dot gym${gymDays.has(key) ? ' is-active' : ''}`;
      dots.append(workoutDot, gymDot);
      dots.setAttribute('aria-hidden', 'true');
      button.append(name, number, dots);
      daysHost.append(button);
    }
    const key = selectedKey;
    const titles = workoutsOn(key);
    const planned = plannedOn(key);
    detail.textContent = [titles.length ? `Completed: ${titles.join(', ')}` : '', planned.length ? `Planned: ${planned.join(', ')}` : ''].filter(Boolean).join(' · ') ||
      (key < today ? 'No workout logged on this day.' : 'No workout planned yet. Open Workouts to choose one.');
    detail.hidden = !selectedDay;
    let count = 0;
    let week = monday(new Date());
    if (![...done].some(key => key >= dateKey(week) && key <= dateKey(addDays(week, 6)))) week = addDays(week, -7);
    while ([...done].some(key => key >= dateKey(week) && key <= dateKey(addDays(week, 6)))) {
      count++;
      week = addDays(week, -7);
      if (count > 520) break;
    }
    streak.textContent = String(count);
    const weekStreak = document.querySelector('[data-client-home-week-streak]');
    if (weekStreak) weekStreak.textContent = String(count);
    renderNextWorkout();
  }
  const gymDaysHost = document.getElementById('client-weekly-days');
  if (gymDaysHost) new MutationObserver(() => renderPlanner()).observe(gymDaysHost, { childList: true });
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
  document.addEventListener('fwb:workout-schedule-changed', () => {
    scheduleCache.clear();
    void refreshSchedule();
  });
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
      const allCards = [...wall.querySelectorAll('.client-community-wall-card')];
      const recentDay = allCards.map(card => card.querySelector('time')?.dateTime || '').sort().at(-1);
      const cards = recentDay
        ? allCards.filter(card => card.querySelector('time')?.dateTime === recentDay)
        : allCards.slice(0, 1);
      if (!cards.length) {
        const empty = document.createElement('p');
        empty.textContent = 'No shared wins yet. Your next workout could be the first.';
        homeFeed.append(empty);
      }
      for (const card of cards) {
        const preview = document.createElement('article');
        preview.className = 'client-home-community-post';
        const sourceHeading = card.querySelector('.client-community-wall-heading');
        const heading = document.createElement('div');
        heading.className = 'client-home-community-post-heading';
        const avatar = document.createElement('span');
        avatar.className = 'client-home-community-post-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        avatar.textContent = sourceHeading?.querySelector('.client-community-avatar')?.textContent || '';
        const author = document.createElement('strong');
        author.textContent = sourceHeading?.querySelector('strong')?.textContent || 'Community';
        const time = document.createElement('time');
        time.textContent = sourceHeading?.querySelector('time')?.textContent || '';
        if (time.textContent) heading.append(avatar, author, time);
        else heading.append(avatar, author);
        const body = document.createElement('p');
        body.textContent = card.querySelector('p')?.textContent || '';
        preview.append(heading, body);
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
    const weeklyLabel = weekLink.querySelector('[data-client-weekly-checkin-label]') || weekLink;
    weeklyLabel.textContent = weeklyRecord?.weekly_submitted_at ? 'View weekly coach check-in' : 'Weekly coach check-in';
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
    render(nextLogs, nextProgram) { logs = Array.isArray(nextLogs) ? nextLogs : []; program = nextProgram || null; renderPlanner(); void refreshSchedule(); void refreshActivityTotals(); },
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
