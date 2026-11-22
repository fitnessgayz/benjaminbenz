(function (root) {
  'use strict';
  const dayKey = /^\d{4}-\d{2}-\d{2}$/;
  const asText = value => String(value ?? '').trim();
  function collect({ logs, gymVisits, achievements, today, sessionKey }) {
    if (!dayKey.test(today) || typeof sessionKey !== 'function') return { entries: [], gymWorkouts: 0 };
    const groups = new Map(), visits = new Map();
    for (const row of logs || []) {
      const day = asText(row.entry_date);
      if (!dayKey.test(day) || day > today) continue;
      const key = asText(sessionKey(row));
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, {
        id: 'workout:' + key, type: 'workout', rank: 0, title: asText(row.workout_title) || 'Workout',
        day, time: 0, gym: asText(row.gym_name), exercises: new Set()
      });
      const item = groups.get(key);
      if (day < item.day) item.day = day;
      if (!item.gym) item.gym = asText(row.gym_name);
      const time = Date.parse(row.completed_at);
      if (Number.isFinite(time) && time > item.time) item.time = time;
      const label = asText(row.exercise_name);
      if (label) item.exercises.add(label);
    }
    const completed = [...groups.values()].filter(item => item.time > 0);
    const entries = completed.map(item => ({ ...item,
      detail: [...item.exercises].slice(0, 3).join(' · ')
    }));
    for (const visit of gymVisits || []) {
      const day = asText(visit.entry_date);
      if (!dayKey.test(day) || day > today || visits.has(day)) continue;
      visits.set(day, true);
      entries.push({ id: 'gym:' + day, type: 'checkIn', rank: 3, day, time: 0, title: 'Gym check-in', detail: asText(visit.gym_name) });
    }
    const activityIDs = new Set();
    for (const event of achievements?.events || []) {
      if (event.kind !== 'badge' && event.kind !== 'pr') continue;
      if (!dayKey.test(event.date || '') || event.date > today || !event.id || activityIDs.has(event.id)) continue;
      activityIDs.add(event.id);
      entries.push({ id: event.id, type: event.kind, rank: event.kind === 'pr' ? 1 : 2,
        day: event.date, time: groups.get(event.sessionId)?.time || 0,
        title: event.kind === 'badge' ? 'Badge earned' : asText(event.title),
        detail: event.kind === 'badge' ? asText(event.title) : asText(event.detail)
      });
    }
    entries.sort((a, b) => b.day.localeCompare(a.day) || (b.time - a.time)
      || (a.rank - b.rank) || a.id.localeCompare(b.id));
    const gymWorkouts = completed.filter(({ gym }) => gym
      && !/^(?:home|outdoors|home\s*\/\s*outdoors)$/i.test(gym)).length;
    return { entries, gymWorkouts };
  }
  function mount(document) {
    const feed = document.querySelector('[data-gruntr-profile-activity]');
    const insights = document.querySelector('[data-gruntr-profile-insights]');
    if (!feed || !insights) return {};
    const list = feed.querySelector('[data-gruntr-profile-activity-list]');
    const status = feed.querySelector('[data-gruntr-profile-activity-status]');
    const more = feed.querySelector('[data-gruntr-profile-more]');
    let selected = false, context = null, key = '', visits = [], visible = 12, version = 0, visitStatus = '';
    function realClient(data) { return Boolean(data?.owner && data?.email && data?.client?.auth && !data.preview); }
    function clear() {
      visits = []; visitStatus = ''; visible = 12;
      feed.hidden = true; insights.hidden = true;
      list.replaceChildren(); status.textContent = '';
      for (const element of insights.querySelectorAll('dd')) element.textContent = '–';
    }
    function display() {
      if (!selected || !realClient(context)) { feed.hidden = true; insights.hidden = true; return; }
      const result = collect({ ...context, gymVisits: visits });
      const complete = context.status === 'ready';
      const put = (selector, value) => { const element = insights.querySelector(selector); element.textContent = value ?? '–'; };
      put('[data-gruntr-profile-badges]', context.achievements?.badges?.filter(b => b.unlocked).length);
      put('[data-gruntr-profile-records]', context.achievements?.prs);
      put('[data-gruntr-profile-gym-workouts]', complete ? result.gymWorkouts : null);
      insights.hidden = false;
      const fragment = document.createDocumentFragment();
      for (const row of result.entries.slice(0, visible)) {
        const li = document.createElement('li');
        const title = document.createElement('strong');
        const time = document.createElement('time');
        title.textContent = row.title;
        time.dateTime = row.day; time.textContent = row.day;
        li.dataset.activityKind = row.type;
        li.append(title, time);
        if (row.detail) {
          const detail = document.createElement('span');
          detail.textContent = row.detail; li.append(detail);
        }
        fragment.append(li);
      }
      list.replaceChildren(fragment);
      more.hidden = result.entries.length <= visible;
      status.textContent = visitStatus === 'failed' ? 'Gym check-ins could not load. Reopen Profile to retry.'
        : result.entries.length ? '' : !complete && context.status !== 'error' ? 'Loading activity…'
        : context.status === 'error' ? 'Workout history could not load. Refresh to try again.'
        : 'Your workouts, gym check-ins, personal records, and badges will appear here.';
      feed.hidden = false;
    }
    async function loadVisits() {
      if (!selected || !realClient(context) || visitStatus === 'pending') return;
      const request = ++version, owner = context.owner, email = context.email;
      const day = context.today, client = context.client;
      visitStatus = 'pending';
      try {
        const { data: auth, error: authError } = await client.auth.getSession();
        if (request !== version || !selected) return;
        if (authError || auth?.session?.user?.id !== owner ||
            asText(auth.session.user.email).toLowerCase() !== asText(email).toLowerCase()) throw Error('Wrong account');
        const { data, error } = await client.from('client_gym_checkins').select('entry_date,gym_name')
          .eq('client_email', email).lte('entry_date', day).order('entry_date', { ascending: false }).limit(366);
        if (request !== version || !selected || key !== owner+'|'+email) return;
        if (error) throw error;
        visits = data || [];
        visitStatus = 'ready';
      } catch (_) {
        if (request !== version) return;
        visits = []; visitStatus = 'failed';
      }
      if (request === version) display();
    }
    more.addEventListener('click', () => { visible += 12; display(); });
    return {
      render(data) {
        const next = realClient(data) ? data.owner+'|'+data.email : '';
        if (next !== key) { version++; key = next; clear(); }
        context = data;
        display();
        if (selected && key && !visitStatus) void loadVisits();
      },
      selectTab(tab) {
        const changed = selected !== (tab === 'profile');
        selected = tab === 'profile';
        if (!selected && changed) {
          version++;
          if (visitStatus === 'pending') visitStatus = '';
        }
        if (selected) { display(); if (changed) void loadVisits(); }
      }
    };
  }
  const api = { collect, mount };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) root.FWB_GRUNTR_PROFILE_ACTIVITY = mount(root.document);
}(typeof window !== 'undefined' ? window : globalThis));
