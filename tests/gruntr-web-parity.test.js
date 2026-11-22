const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { isSquadRoute, setupKey, claimSetup, normalizeSharing, normalizeFeed, mount } = require('../js/client-social-parity');
const { collect } = require('../js/gruntr-profile-activity');
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const origin = 'https://benjaminbenz.com';
const unavailable = { available: false, enabled: false, decided_at: null };

test('only the exact same-site client route opens Squad', () => {
  const trusted = '/client-dashboard.html?tab=community&squad=1';
  assert.equal(isSquadRoute(trusted, origin), true);
  assert.equal(isSquadRoute(origin + trusted, origin), true);
  for (const value of ['/client-dashboard.html?tab=community',
    '/coach-admin.html?tab=community&squad=1', '/client-dashboard.html?tab=community&squad=1&squad=0',
    '//fake.test/client-dashboard.html?tab=community&squad=1',
    '/client-dashboard.html?tab=community&amp;squad=1',
    '/client-dashboard.html?tab=community&tab=home&squad=1']) assert.equal(isSquadRoute(value, origin), false);
});

test('setup offer is optional, scoped per account and only when profile absence is confirmed', () => {
  const values = new Map(), memory = new Set();
  const store = () => ({ getItem: values.get.bind(values), setItem: values.set.bind(values) });
  const invoke = (id, profile, opened = true) => claimSetup({ owner: id, profile, store, memory, open: () => opened });
  assert.equal(invoke(owner, null), false);
  assert.equal(invoke(owner, true), false);
  assert.equal(invoke(owner, false, false), false);
  assert.equal(values.size, 0);
  assert.equal(invoke(owner, false), true);
  assert.equal(invoke(owner, false), false);
  assert.equal(invoke(other, false), true);
  assert.equal(values.get(setupKey(owner)), '1');
  assert.equal(values.get(setupKey(other)), '1');
});

test('automatic sharing and anonymous Feed reject unknown/unavailable state and strip all private fields', () => {
  const payload = { workouts: { available: true, enabled: false, decided_at: null },
    check_ins: unavailable, achievements: unavailable };
  assert.deepEqual(normalizeSharing(payload), { available: true, enabled: false });
  assert.equal(normalizeSharing({ workouts: payload.workouts }), null);
  assert.deepEqual(normalizeSharing({ ...payload, workouts: { ...unavailable, enabled: true } }),
    { available: false, enabled: false });
  assert.deepEqual(normalizeFeed([{ kind: 'workouts', post_id: owner, headline: 'Completed a workout', activity_day: '2026-11-22', user_id: other, notes: 'private' },
    { kind: 'check_ins', post_id: other, headline: 'Checked in', activity_day: '2026-11-22' }]),
    [{ id: owner, day: '2026-11-22', title: 'Completed a workout' }]);
});

function domFixture() {
  const element = () => ({
    handlers: {}, children: [], hidden: false, disabled: false, checked: false, isConnected: true,
    textContent: '', addEventListener(name, callback) { this.handlers[name] = callback; },
    replaceChildren(...children) { this.children = children; }, append(...children) { this.children.push(...children); }
  });
  const select = {};
  ['[data-gruntr-social-setup]','[data-gruntr-workout-share]','[data-gruntr-sharing-status]',
    '[data-gruntr-anonymous-feed]','[data-gruntr-profile-later]','[data-gruntr-profile-now]'].forEach(key => { select[key] = element(); });
  const popup = select['[data-gruntr-social-setup]'];
  const control = select['[data-gruntr-workout-share]'];
  popup.querySelector = key => select[key];
  popup.open = false; popup.showModal = () => { popup.open = true; }; popup.close = () => { popup.open = false; };
  const document = {
    createElement: element, activeElement: element(),
    querySelector(value) { return value === 'dialog[open]' ? (popup.open ? popup : null) : select[value]; }
  };
  return { document, popup, control, select };
}

test('mounted Social UI does not auto-consent, prioritizes an incoming Squad link, and safely uses account-pinned explicit RPC', async () => {
  const { document, popup, control, select } = domFixture();
  const memory = new Map(), writes = [], views = [];
  const restore = new Map(['location','localStorage','FWB_SUPABASE_CONFIG','FWB_CLIENT_COMMUNITY','fetch'].map(k => [k, globalThis[k]]));
  try {
    globalThis.location = { href: origin + '/client-dashboard.html?tab=community&squad=1', origin };
    globalThis.localStorage = { getItem: memory.get.bind(memory), setItem: memory.set.bind(memory) };
    globalThis.FWB_SUPABASE_CONFIG = { url: 'https://synthetic.example.invalid', anonKey: 'fixture-only' };
    let result = { workouts: unavailable, check_ins: unavailable, achievements: unavailable };
    globalThis.fetch = async (url, opts) => {
      const call = new URL(url).pathname.split('/').at(-1);
      assert.equal(opts.headers.Authorization, 'Bearer synthetic-original-owner');
      if (call === 'community_set_auto_activity_sharing') {
        const body = JSON.parse(opts.body);
        writes.push(body);
        result = { ...result, workouts: { available: true, enabled: body.p_enabled, decided_at: '2026-11-22T12:00:00Z' } };
      }
      return { ok: true, async json() {
        if (!call.endsWith('_feed')) return result;
        return result.workouts.enabled ? [{ kind: 'workouts', post_id: other,
          activity_day: '2026-11-22', headline: 'Completed a workout' }] : [];
      } };
    };
    const ui = mount(document);
    globalThis.FWB_CLIENT_COMMUNITY = { showView(name, focus) { views.push([name, focus]); ui.selectView(name); } };
    const client = { auth: { getSession: async () => ({ data: { session: { user: { id: owner }, access_token: 'synthetic-original-owner' } } }) } };
    ui.configure(client, owner, false);
    ui.selectTab('community');
    ui.profileLoaded(owner, false);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(views, [['connections', true]]);
    assert.equal(popup.open, false);
    assert.equal(control.disabled, true);
    assert.deepEqual(writes, []);
    ui.selectTab('home');
    ui.selectView('wall');
    globalThis.location.href = origin + '/client-dashboard.html?tab=community';
    result = { ...result, workouts: { available: true, enabled: false, decided_at: null } };
    ui.selectTab('community');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(popup.open, true);
    select['[data-gruntr-profile-later]'].handlers.click();
    assert.equal(popup.open, false);
    assert.deepEqual(writes, []);
    assert.equal(control.disabled, false);
    control.checked = true;
    await control.handlers.change();
    assert.deepEqual(writes, [{ p_category: 'workouts', p_enabled: true }]);
    assert.equal(control.checked, true);
    const feed = select['[data-gruntr-anonymous-feed]'];
    assert.equal(feed.hidden, false);
    control.checked = false;
    const disabling = control.handlers.change();
    assert.equal(feed.hidden, true);
    assert.deepEqual(feed.children, []);
    await disabling;
    assert.equal(control.checked, false);
    assert.equal(feed.hidden, true);
    ui.configure(client, other, false);
    ui.selectTab('community');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(control.disabled, true); // stored token belonged to previous owner
    assert.equal(control.checked, false);
    assert.equal(popup.open, false);
    assert.deepEqual(writes, [{ p_category: 'workouts', p_enabled: true }, { p_category: 'workouts', p_enabled: false }]);
  } finally {
    for (const [key,val] of restore) {
      if (val === undefined) delete globalThis[key];
      else globalThis[key] = val;
    }
  }
});

test('personal Profile Activity groups only completed workouts and merges saved visits, PRs and badges', () => {
  const today = '2026-11-22';
  const row = { entry_date: today, completed_at: today+'T10:00:00Z', workout_title: 'Strength', gym_name: 'Example gym', exercise_name: 'Squat' };
  const out = collect({ today, sessionKey: r => r.session, logs: [
    {...row, session: 'a'}, {...row, session: 'a', exercise_name: 'Row'}, {...row, session: 'b', completed_at: null},
    {...row, session: 'c', gym_name: 'Home / Outdoors', entry_date: '2026-11-21'}
  ], gymVisits: [{entry_date: today, gym_name:'My gym'}, {entry_date: today}, {entry_date:'2026-11-23'}],
  achievements: { events: [
    {id:'p1',kind:'pr',sessionId:'a',date:today,title:'New PR',detail:'100 lb × 8'},
    {id:'b1',kind:'badge',sessionId:'a',date:today,title:'First Spark'},
    {id:'b1',kind:'badge',sessionId:'a',date:today,title:'First Spark'}] } });
  assert.equal(out.gymWorkouts, 1);
  assert.deepEqual(out.entries.map(e => e.type), ['workout','pr','badge','checkIn','workout']);
  assert.equal(out.entries[0].detail, 'Squat · Row');
  assert.equal(out.entries[1].detail, '100 lb × 8');
  assert.equal(out.entries[3].detail, 'My gym');
});

test('page surfaces separate opt-in, truthful iPhone-only source and existing leaderboard disclosure', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'client-dashboard.html'), 'utf8');
  assert.match(html, /Set up your social profile now\?/);
  assert.match(html, /Only new workouts finished and synced in the iPhone app after you opt in/);
  assert.match(html, /data-gruntr-workout-share disabled/);
  assert.match(html, /Joining can list your nickname, avatar, and weekly counts/);
  assert.match(html, /data-gruntr-profile-activity hidden/);
});
