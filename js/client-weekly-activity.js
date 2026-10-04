(function (root) {
  'use strict';
  const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  function weekRange(now = new Date(), offset = 0) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    start.setDate(start.getDate() - (start.getDay() + 6) % 7 + offset * 7);
    const dates = Array.from({ length: 7 }, (_, i) => { const day = new Date(start); day.setDate(day.getDate() + i); return dateKey(day); });
    return { start: dates[0], end: dates[6], dates };
  }
  function summarize(logs, checkins, range) {
    const inside = row => row.entry_date >= range.start && row.entry_date <= range.end;
    const rows = logs.filter(inside);
    const legacyKey = row => `${row.entry_date}|${row.workout_title || 'Workout'}`;
    const sessionId = row => row.workout_session_id || row.session_id;
    const identified = new Set(rows.filter(sessionId).map(legacyKey));
    const sessions = new Map();
    rows.forEach(row => {
      if (!sessionId(row) && identified.has(legacyKey(row))) return;
      const key = sessionId(row) || legacyKey(row);
      if (!sessions.has(key)) sessions.set(key, { date: row.entry_date, label: row.workout_title || 'Gym workout', type: 'workout' });
    });
    const visits = new Map(checkins.filter(inside).map(row => [row.entry_date, { date: row.entry_date, label: 'Gym check-in', type: 'checkin' }]));
    const activity = [...sessions.values(), ...visits.values()].sort((a, b) => a.date.localeCompare(b.date));
    return { workouts: sessions.size, checkins: visits.size, activity };
  }
  async function readRows(client, table, columns, email, range) {
    const rows = [];
    for (let offset = 0; ; offset += 500) {
      const result = await client.from(table).select(columns).eq('client_email', email)
        .gte('entry_date', range.start).lte('entry_date', range.end)
        .order('entry_date', { ascending: true }).order(table === 'client_workout_logs' ? 'id' : 'client_email', { ascending: true })
        .range(offset, offset + 499).abortSignal(requestSignal());
      if (result.error) throw result.error;
      rows.push(...(result.data || []));
      if ((result.data || []).length < 500) return rows;
    }
  }
  function requestSignal() {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(15000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    timer?.unref?.();
    return controller.signal;
  }
  async function saveVisit(client, email, date) {
    // ON CONFLICT DO NOTHING makes retries and simultaneous tabs idempotent.
    const save = () => client.from('client_gym_checkins').upsert({ client_email: email, entry_date: date }, {
      onConflict: 'client_email,entry_date', ignoreDuplicates: true
    }).abortSignal(requestSignal());
    const result = root.FWB_AUTH_SESSION?.withAccount
      ? await root.FWB_AUTH_SESSION.withAccount(client, { email }, save)
      : await save();
    if (result.error) throw result.error;
  }
  function celebrateCheckIn(panel, today, schedule = setTimeout) {
    if (!panel) return false;
    const day = panel.querySelector(`[data-client-weekly-date="${today}"]`);
    panel.classList.remove('is-checkin-celebrating');
    day?.classList.add('is-today');
    void panel.offsetWidth;
    panel.classList.add('is-checkin-celebrating');
    schedule(() => panel.classList.remove('is-checkin-celebrating'), 1250);
    return true;
  }
  function mount(document) {
    const panel = document.getElementById('client-weekly-activity');
    if (!panel) return { configure() {} };
    const find = id => document.getElementById(id);
    let client, email = '', preview = false, offset = 0, monthOffset = 0, busy = false, checkedDate = '', generation = 0, monthGeneration = 0, timer;
    const text = (id, value) => { const node = find(id); if (node) node.textContent = value; };
    const shortDate = key => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    function buttonState() {
      const done = checkedDate === dateKey(new Date());
      panel.classList.toggle('is-checked-in', done);
      text('client-gym-hero-title', done ? 'You showed up today' : 'Show up for yourself today');
      const button = find('client-gym-checkin');
      const label = button.querySelector('[data-client-gym-checkin-label]') || button;
      button.disabled = !email || preview || busy || done;
      label.textContent = busy ? 'Saving check-in…' : done ? 'Checked in today' : 'Gym check-in';
    }
    async function refresh() {
      if (!client || !email) return;
      const request = ++generation, range = weekRange(new Date(), offset), requestEmail = email;
      text('client-weekly-heading', offset === 0 ? 'This week' : offset === -1 ? 'Last week' : 'Weekly activity');
      text('client-weekly-dates', `${shortDate(range.start)} – ${shortDate(range.end)}, ${range.end.slice(0, 4)} · Mon–Sun`);
      panel.querySelectorAll('.client-weekly-totals small').forEach((label, index) => {
        label.textContent = `${index ? 'completed' : 'logged'} ${offset === 0 ? 'this' : 'that'} week`;
      });
      find('client-week-next').disabled = offset === 0;
      text('client-weekly-workouts', '…'); text('client-weekly-checkins', '…');
      text('client-weekly-status', 'Loading weekly activity…');
      find('client-weekly-days').replaceChildren(); find('client-weekly-list').replaceChildren();
      try {
        const today = dateKey(new Date());
        const [logs, visits, todayVisits] = await Promise.all([
          readRows(client, 'client_workout_logs', 'id,entry_date,workout_title,workout_session_id,session_id', requestEmail, range),
          readRows(client, 'client_gym_checkins', 'entry_date', requestEmail, range),
          readRows(client, 'client_gym_checkins', 'entry_date', requestEmail, { start: today, end: today })
        ]);
        if (request !== generation) return;
        checkedDate = todayVisits.length ? today : '';
        buttonState();
        const summary = summarize(logs, visits, range);
        text('client-weekly-workouts', summary.workouts); text('client-weekly-checkins', summary.checkins);
        text('client-weekly-checkins-summary', summary.checkins);
        text('client-weekly-status', summary.activity.length ? '' : 'No activity logged this week yet.');
        range.dates.forEach((date, i) => {
          const workout = summary.activity.some(row => row.date === date && row.type === 'workout');
          const visit = visits.some(row => row.entry_date === date);
          const day = document.createElement('div');
          day.className = 'client-weekly-day';
          day.dataset.clientWeeklyDate = date;
          if (date === today) day.classList.add('is-today');
          day.setAttribute('aria-label', `${shortDate(date)}: ${workout ? 'workout logged' : 'no workout'}, ${visit ? 'gym check-in' : 'no gym check-in'}`);
          const label = document.createElement('span'); label.textContent = ['M', 'T', 'W', 'T', 'F', 'S', 'S'][i];
          const mark = document.createElement('span'); mark.className = `client-weekly-mark${workout ? ' has-workout' : ''}${visit ? ' has-checkin' : ''}`;
          mark.textContent = workout && visit ? '✓✓' : workout || visit ? '✓' : '·';
          day.append(label, mark); find('client-weekly-days').append(day);
        });
        summary.activity.forEach(row => {
          const item = document.createElement('li');
          const label = document.createElement('span'); label.textContent = row.label;
          const date = document.createElement('span'); date.textContent = shortDate(row.date);
          item.append(label, date); find('client-weekly-list').append(item);
        });
      } catch (_) {
        if (request !== generation) return;
        text('client-weekly-workouts', '—'); text('client-weekly-checkins', '—');
        text('client-weekly-checkins-summary', '—');
        text('client-weekly-status', 'Activity could not be loaded. Try again.');
      }
    }
    async function renderMonth() {
      const grid = find('client-month-days');
      if (!grid || !client || !email) return;
      const request = ++monthGeneration, requestEmail = email;
      const month = new Date(new Date().getFullYear(), new Date().getMonth() + monthOffset, 1, 12);
      const year = month.getFullYear(), monthNumber = month.getMonth();
      const start = dateKey(month), end = dateKey(new Date(year, monthNumber + 1, 0, 12));
      text('client-month-label', month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }));
      find('client-month-next').disabled = monthOffset >= 0;
      grid.replaceChildren();
      text('client-month-status', 'Loading gym visits…');
      try {
        const visits = await readRows(client, 'client_gym_checkins', 'entry_date', requestEmail, { start, end });
        if (request !== monthGeneration || requestEmail !== email) return;
        const checked = new Set(visits.map(row => row.entry_date));
        const blanks = (month.getDay() + 6) % 7;
        for (let i = 0; i < blanks; i++) {
          const blank = document.createElement('span'); blank.setAttribute('aria-hidden', 'true');
          grid.append(blank);
        }
        const total = new Date(year, monthNumber + 1, 0).getDate();
        for (let day = 1; day <= total; day++) {
          const date = dateKey(new Date(year, monthNumber, day, 12));
          const cell = document.createElement('span');
          cell.className = `client-month-day${checked.has(date) ? ' is-checked' : ''}${date === dateKey(new Date()) ? ' is-today' : ''}`;
          cell.textContent = checked.has(date) ? '✓' : String(day);
          cell.setAttribute('aria-label', `${shortDate(date)}: ${checked.has(date) ? 'gym check-in' : 'no check-in'}`);
          grid.append(cell);
        }
        text('client-month-status', `${checked.size} gym ${checked.size === 1 ? 'visit' : 'visits'} this month.`);
      } catch (_) {
        if (request === monthGeneration) text('client-month-status', 'Could not load this month. Try again.');
      }
    }
    find('client-month-details')?.addEventListener('toggle', event => {
      if (event.target.open) void renderMonth();
    });
    if (find('client-month-prev')) find('client-month-prev').onclick = () => { monthOffset--; void renderMonth(); };
    if (find('client-month-next')) find('client-month-next').onclick = () => { monthOffset = Math.min(0, monthOffset + 1); void renderMonth(); };
    find('client-week-prev').onclick = () => { offset--; void refresh(); };
    find('client-week-next').onclick = () => { offset = Math.min(0, offset + 1); void refresh(); };
    find('client-weekly-retry').onclick = () => { void refresh(); };
    async function checkIn() {
      if (!client || !email || preview) throw new Error('Sign in as a client to check in at the gym.');
      if (checkedDate === dateKey(new Date())) return 'You’re already checked in at the gym today.';
      if (busy) throw new Error('Your gym check-in is already saving.');
      const targetEmail = email, today = dateKey(new Date());
      busy = true; buttonState(); text('client-gym-checkin-status', 'Saving gym check-in…');
      try {
        await saveVisit(client, targetEmail, today);
        if (email !== targetEmail) throw new Error('Your account changed. Reopen your check-in.');
        checkedDate = today; offset = 0;
        await refresh();
        if (find('client-month-details')?.open) void renderMonth();
        text('client-gym-checkin-status', 'You showed up. Check-in complete.');
        root.document?.dispatchEvent(new CustomEvent("fwb:gym-checkin-saved"));
        celebrateCheckIn(panel, today);
        return today === dateKey(new Date()) ? 'Gym check-in saved for today.' : 'Gym check-in saved for yesterday. Check in again for today.';
      } catch (error) {
        if (email === targetEmail) text('client-gym-checkin-status', root.FWB_AUTH_SESSION?.requiresLogin(error)
          ? 'Your sign-in has expired. Sign in again to save your gym check-in.'
          : 'Could not save your check-in. Please try again.');
        throw error;
      } finally { busy = false; buttonState(); }
    };
    find('client-gym-checkin').onclick = () => checkIn().catch(() => {});
    return { checkIn, isCheckedIn: () => checkedDate === dateKey(new Date()), configure(nextClient, nextEmail, isPreview) {
      if (!nextClient || !nextEmail) return;
      const normalized = nextEmail.trim().toLowerCase();
      if (email !== normalized) { offset = 0; monthOffset = 0; checkedDate = ''; generation++; monthGeneration++; }
      client = nextClient; email = normalized; preview = Boolean(isPreview); buttonState();
      if (preview) text('client-gym-checkin-status', 'Viewing client activity. Gym check-in is available to the client.');
      clearTimeout(timer); timer = setTimeout(() => void refresh(), 150);
    } };
  }
  const api = { dateKey, weekRange, summarize, readRows, saveVisit, celebrateCheckIn, mount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root.document) root.FWB_WEEKLY_ACTIVITY = mount(root.document);
})(typeof window !== 'undefined' ? window : globalThis);
