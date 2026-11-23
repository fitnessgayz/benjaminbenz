(function (root) {
  'use strict';
  const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const commentWindow = 72 * 60 * 60 * 1000;
  function commentable(event, now = Date.now()) {
    const time = Date.parse(event?.occurred_at);
    return time <= now && now - time <= commentWindow;
  }
  function ownSharedPosts(data, owner) {
    const posts = new Map();
    if (!uuid.test(owner || '') || !Array.isArray(data)) return posts;
    for (const row of data.slice(0, 100)) {
      if (row?.is_own !== true || !Number.isSafeInteger(row.props_count) || row.props_count < 0) continue;
      const [prefix, id, key, ...rest] = String(row.event_id || '').split(':');
      if (rest.length || id?.toLowerCase() !== owner.toLowerCase()) continue;
      if (prefix === 'workout' && row.event_type === 'workout' && uuid.test(key || '')) {
        posts.set('workout:' + key.toLowerCase(), row);
      } else if (prefix === 'gym' && row.event_type === 'gym_visit' && dayKey.test(key || '')) {
        posts.set('gym:' + key, row);
      }
    }
    return posts;
  }
  const dayKey = /^\d{4}-\d{2}-\d{2}$/;
  const asText = value => String(value ?? '').trim();
  const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
  const dateLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
  const paths = {
    workout: 'M7 7v10m-4-7v4m14-7v10m4-7v4M7 12h10M3 12h4m10 0h4',
    pr: 'M8 4h8v5c0 3-1.8 5-4 5S8 12 8 9V4ZM8 6H4v3c0 2 2 3 5 3m7-6h4v3c0 2-2 3-5 3m-3 2v4m-4 2h8',
    badge: 'm7 3 4 6m6-6-4 6M12 9a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z',
    props: 'M7 10v11H3V10h4Zm0 0 5-7c2 0 2 2 1 5h5a2 2 0 0 1 2 2l-2 8a2 2 0 0 1-2 2H7',
    comments: 'M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4v-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z',
    share: 'M12 15V2m-4 4 4-4 4 4M7 9H5v12h14V9h-2',
    checkIn: 'M12 22s6-5 6-11a6 6 0 1 0-12 0c0 6 6 11 6 11Zm0-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'
  };
  function icon(document, type) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [attr,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',
      'stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'})) node.setAttribute(attr,value);
    const path = document.createElementNS(node.namespaceURI,'path');
    path.setAttribute('d',paths[type]);
    node.append(path);
    return node;
  }
  function durationLabel(minutes) {
    if (!minutes) return '—';
    const rounded = Math.max(1, Math.round(minutes));
    const hours = Math.floor(rounded / 60), min = rounded % 60;
    return hours ? `${number.format(hours)} hr${min ? ` ${number.format(min)} min` : ''}` : `${number.format(min)} min`;
  }
  function collect({ logs, gymVisits, achievements, today, sessionKey, setKind }) {
    if (!dayKey.test(today) || typeof sessionKey !== 'function') return { entries: [], gymWorkouts: 0 };
    const groups = new Map(), visits = new Map();
    for (const row of logs || []) {
      const day = asText(row.entry_date);
      if (!dayKey.test(day) || day > today) continue;
      const key = asText(sessionKey(row));
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, {
        id: 'workout:' + key, type: 'workout', rank: 0, title: asText(row.workout_title) || 'Workout',
        key, day, time: 0, gym: asText(row.gym_name), exercises: new Set(), exerciseSets: new Map(),
        duration: 0, cardioMinutes: 0, sets: 0, volume: 0, hasStrength: false, postIDs: new Set(), hasSavedSession: false
      });
      const item = groups.get(key);
      if (day < item.day) item.day = day;
      if (!item.gym) item.gym = asText(row.gym_name);
      const time = Date.parse(row.completed_at);
      if (Number.isFinite(time)) {
        if (time > item.time) item.time = time;
        // The Wall RPC prioritizes workout_session_id; private Logs retains its original grouping.
        const postID = row.workout_session_id || row.session_id || row.id;
        item.postIDs.add(uuid.test(postID || '') ? postID.toLowerCase() : null);
        if (uuid.test(row.session_id || row.workout_session_id || '') && uuid.test(row.id || '') &&
            Number.isFinite(Date.parse(row.updated_at))) item.hasSavedSession = true;
      }
      const label = asText(row.exercise_name);
      if (label) item.exercises.add(label);
      item.duration = Math.max(item.duration, positive(row.workout_duration_seconds));
      const type = setKind?.(row) || 'strength';
      if (type === 'warmup') continue;
      item.sets++;
      if (type === 'cardio') {
        item.cardioMinutes += positive(row.weight_used) || positive(row.duration_seconds) / 60;
      } else {
        item.hasStrength = true;
        if (type === 'strength') item.volume += positive(row.weight_used) * positive(row.reps);
      }
      const name = label || asText(row.exercise_code);
      if (name) {
        const exerciseKey = name.toLowerCase();
        const previous = item.exerciseSets.get(exerciseKey);
        const position = Number.isFinite(row.exercise_order) ? row.exercise_order : Infinity;
        item.exerciseSets.set(exerciseKey, {
          name: previous?.name || name, sets: (previous?.sets || 0) + 1,
          position: Math.min(previous?.position ?? Infinity, position)
        });
      }
    }
    const completed = [...groups.values()].filter(item => item.time > 0);
    const occurrences = new Map();
    for (const item of completed) for (const id of item.postIDs) {
      if (id) occurrences.set(id, (occurrences.get(id) || 0) + 1);
    }
    const entries = completed.map(item => ({ ...item,
      postIDs: new Set([...item.postIDs].map(id => occurrences.get(id) === 1 ? id : null)),
      detail: [...item.exercises].slice(0, 3).join(' · '),
      exerciseRows: [...item.exerciseSets.values()].sort((a,b) => a.position - b.position),
      durationMinutes: item.duration ? item.duration / 60 : !item.hasStrength ? item.cardioMinutes : 0
    }));
    for (const visit of gymVisits || []) {
      const day = asText(visit.entry_date);
      if (!dayKey.test(day) || day > today || visits.has(day)) continue;
      visits.set(day, true);
      entries.push({ id: 'gym:' + day, type: 'checkIn', rank: 3, day, time: 0, title: 'Gym Check-In', detail: asText(visit.gym_name) });
    }
    const activityIDs = new Set();
    for (const event of achievements?.events || []) {
      if (event.kind !== 'badge' && event.kind !== 'pr') continue;
      if (!dayKey.test(event.date || '') || event.date > today || !event.id || activityIDs.has(event.id)) continue;
      activityIDs.add(event.id);
      entries.push({ id: event.id, type: event.kind, rank: event.kind === 'pr' ? 1 : 2,
        day: event.date, time: groups.get(event.sessionId)?.time || 0,
        title: event.kind === 'badge' ? 'Badge Earned' : asText(event.title),
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
    const retry = feed.querySelector('[data-gruntr-profile-retry]');
    let selected = false, context = null, key = '', visits = [], visible = 12, version = 0, visitStatus = '';
    let posts = new Map(), sharedVersion = 0, sharedStatus = '', sharedClose, ownerVerified = false;
    function resetShared() {
      ++sharedVersion;
      posts = new Map();
      ownerVerified = false;
      sharedStatus = '';
      sharedClose?.();
      sharedClose = null;
    }
    function getPost(row) {
      if (row.type === 'checkIn') return posts.get(row.id);
      if (row.type !== 'workout' || row.postIDs.size !== 1 || !row.key.startsWith('session:')) return;
      const [id] = row.postIDs;
      return id ? posts.get('workout:' + id) : undefined;
    }
    async function activeOwner(data) {
      const { data: auth, error } = await data.client.auth.getSession();
      const user = auth?.session?.user;
      return !error && user?.id === data.owner && asText(user.email).toLowerCase() === asText(data.email).toLowerCase();
    }
    async function loadShared() {
      if (!selected || !realClient(context) || !context.openComments || !context.client.rpc || sharedStatus) return;
      const data = context, ownerKey = key, request = ++sharedVersion;
      sharedStatus = 'pending';
      try {
        if (!await activeOwner(data) || request !== sharedVersion || !selected) return;
        ownerVerified = true;
        const { data: rows, error } = await data.client.rpc('community_wall_feed');
        if (!selected || request !== sharedVersion || key !== ownerKey) return;
        const confirmed = await activeOwner(data);
        if (selected && request === sharedVersion && key === ownerKey) {
          ownerVerified = confirmed;
          if (confirmed && !error) posts = ownSharedPosts(rows, data.owner);
        }
      } catch (_) { /* The private Activity Feed remains available without Social. */ }
      finally {
        if (request === sharedVersion) { sharedStatus = 'checked'; display(); }
      }
    }
    function refreshShared() {
      if (!selected) return;
      resetShared();
      display();
      void loadShared();
    }
    document.addEventListener('fwb:community-visibility-changed', refreshShared);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshShared(); });
    function realClient(data) { return Boolean(data?.owner && data?.email && data?.client?.auth && !data.preview); }
    function clear() {
      resetShared(); visits = []; visitStatus = ''; visible = 12;
      feed.hidden = true;
      list.replaceChildren(); status.textContent = '';
      if (retry) retry.hidden = true;
      for (const element of insights.querySelectorAll('[data-gruntr-profile-badges], [data-gruntr-profile-records], [data-gruntr-profile-gym-workouts]')) element.textContent = '–';
    }
    function display() {
      if (!selected || !realClient(context)) { feed.hidden = true; return; }
      const result = collect({ ...context, gymVisits: visits });
      const complete = context.status === 'ready';
      const put = (selector, value) => { const element = insights.querySelector(selector); element.textContent = value ?? '–'; };
      put('[data-gruntr-profile-badges]', context.achievements?.badges?.filter(b => b.unlocked).length);
      put('[data-gruntr-profile-records]', context.achievements?.prs);
      put('[data-gruntr-profile-gym-workouts]', complete ? result.gymWorkouts : null);
      const fragment = document.createDocumentFragment();
      const add = (parent, tag, value, className) => {
        const node = document.createElement(tag);
        if (value) node.textContent = value;
        if (className) node.className = className;
        parent.append(node);
        return node;
      };
      function addActions(parent, row, shared, title, canShare) {
        const actions = add(parent, 'div', '', 'gruntr-profile-activity-actions');
        if (shared) {
          const left = add(actions, 'div', '', 'gruntr-profile-activity-left-actions');
          const count = shared.props_count;
          add(left, 'span', '', 'gruntr-profile-activity-props')
            .append(icon(document, 'props'), `${number.format(count)} ${count === 1 ? 'prop' : 'props'}`);
          if (commentable(shared) && context.openComments) {
            const button = add(left, 'button', '', 'gruntr-profile-activity-comments');
            button.type = 'button';
            button.setAttribute('aria-haspopup', 'dialog');
            button.append(icon(document, 'comments'), 'Comments');
            button.addEventListener('click', () => {
              if (!selected || getPost(row) !== shared) return;
              if (!commentable(shared)) { refreshShared(); return; }
              sharedClose = context.closeComments;
              context.openComments(shared, title);
            });
          }
        }
        if (canShare) {
          const button = add(actions, 'button', '', 'gruntr-profile-activity-share');
          button.type = 'button';
          button.setAttribute('aria-label', 'Share workout');
          button.setAttribute('aria-haspopup', 'dialog');
          button.append(icon(document, 'share'));
          button.addEventListener('click', async () => {
            const data = context, current = key;
            try {
              if (selected && button.isConnected && await activeOwner(data) && selected && button.isConnected && key === current)
                context.shareWorkout?.(row, button);
            } catch (_) { /* Signed-out or unavailable sessions cannot share. */ }
          });
        }
      }
      for (const row of result.entries.slice(0, visible)) {
        const li = add(fragment, 'li');
        li.dataset.activityKind = row.type;
        const date = document.createElement('time');
        date.dateTime = row.day;
        const parsed = new Date(row.day + 'T00:00:00Z');
        date.textContent = Number.isNaN(parsed.getTime()) ? row.day : dateLabel.format(parsed);
        const shared = getPost(row);
        if (row.type !== 'workout') {
          const badge = add(li, 'span', '', 'gruntr-profile-activity-icon');
          badge.append(icon(document,row.type));
          const copy = add(li, 'div', '', 'gruntr-profile-activity-event-copy');
          add(copy,'strong',row.title);
          if (row.detail) add(copy,'span',row.detail);
          li.append(date);
          if (shared) addActions(li, row, shared, shared.headline, false);
          continue;
        }
        const head = add(li, 'div', '', 'gruntr-profile-activity-workout-head');
        const tag = add(head, 'span', '', 'gruntr-profile-activity-tag');
        tag.append(icon(document,'workout'), 'Workout');
        const meta = add(head, 'div', '', 'gruntr-profile-activity-meta');
        if (shared) add(meta, 'span', 'Shared', 'gruntr-profile-activity-shared');
        meta.append(date);
        const title = context.workoutTitle?.(row.title) || row.title;
        if (context.openWorkout) {
          const action = add(li,'button','', 'gruntr-profile-activity-open');
          action.type = 'button';
          add(action,'strong',title);
          const arrow = add(action,'span','›');
          arrow.setAttribute('aria-hidden','true');
          action.addEventListener('click', () => context.openWorkout(row.key));
        } else add(li,'strong',title,'gruntr-profile-activity-open');
        if (row.gym) {
          const gym = add(li, 'div', '', 'gruntr-profile-activity-location');
          gym.append(icon(document,'checkIn'), row.gym);
        }
        const metrics = add(li, 'dl', '', 'gruntr-profile-activity-metrics');
        const items = [['Duration', durationLabel(row.durationMinutes)], ['Sets', number.format(row.sets)]];
        if (row.hasStrength) items.push(['Volume', `${number.format(row.volume)} lb`]);
        for (const [label,value] of items) {
          const metric = add(metrics,'div');
          add(metric,'dt',label);
          add(metric,'dd',value);
        }
        if (row.exerciseRows.length) {
          const listBox = add(li,'div','', 'gruntr-profile-activity-exercises');
          const extras = [];
          row.exerciseRows.forEach(({name,sets}, index) => {
            const exercise = add(listBox,'div','', 'gruntr-profile-activity-exercise');
            add(exercise,'span',name);
            add(exercise,'span',`${number.format(sets)} ${sets === 1 ? 'set' : 'sets'}`);
            if (index >= 2) {
              exercise.hidden = true;
              extras.push(exercise);
            }
          });
          if (extras.length) {
            const collapsed = `See ${number.format(extras.length)} More Exercise${extras.length === 1 ? '' : 's'}`;
            const toggle = add(listBox,'button',collapsed,'gruntr-profile-activity-toggle');
            toggle.type = 'button';
            toggle.setAttribute('aria-expanded','false');
            toggle.addEventListener('click', () => {
              const expanded = toggle.getAttribute('aria-expanded') === 'true';
              toggle.setAttribute('aria-expanded', String(!expanded));
              toggle.textContent = expanded ? collapsed : 'Show Fewer Exercises';
              extras.forEach(exercise => { exercise.hidden = expanded; });
            });
          }
        }
        const canShare = ownerVerified && row.hasSavedSession && context.canShareWorkout?.(row);
        if (shared || canShare) addActions(li, row, shared, title, canShare);
      }
      list.replaceChildren(fragment);
      more.hidden = result.entries.length <= visible;
      if (retry) retry.hidden = context.status !== 'error' || result.entries.length > 0 || !context.retry;
      status.textContent = visitStatus === 'failed' ? 'Gym check-ins could not load. Reopen Profile to retry.'
        : result.entries.length ? '' : !complete && context.status !== 'error' ? 'Loading activity…'
        : context.status === 'error' ? 'Workout history could not load.'
        : 'Your logged workouts, gym check-ins, PRs, and earned badges will appear here.';
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
    more.addEventListener('click', () => {
      const firstNew = visible;
      visible += 12;
      display();
      const node = list.children[firstNew];
      if (node) {
        node.tabIndex = -1;
        node.focus({preventScroll:true});
      }
    });
    retry?.addEventListener('click', () => { if (selected && realClient(context)) void context.retry?.(); });
    return {
      render(data) {
        const next = realClient(data) ? data.owner+'|'+data.email : '';
        if (next !== key || data.client !== context?.client) { version++; key = next; clear(); }
        context = data;
        display();
        if (selected && key && !visitStatus) void loadVisits();
        if (selected && key) void loadShared();
      },
      selectTab(tab) {
        const changed = selected !== (tab === 'profile');
        selected = tab === 'profile';
        if (!selected && changed) {
          version++;
          resetShared();
          if (visitStatus === 'pending') visitStatus = '';
        }
        if (selected) { display(); if (changed) { void loadVisits(); void loadShared(); } }
      }
    };
  }
  const api = { collect, mount, ownSharedPosts, commentable };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) root.FWB_GRUNTR_PROFILE_ACTIVITY = mount(root.document);
}(typeof window !== 'undefined' ? window : globalThis));
