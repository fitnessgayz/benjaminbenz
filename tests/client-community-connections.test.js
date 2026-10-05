const test = require('node:test');
const assert = require('node:assert/strict');
const { achievementProjection, mount } = require('../js/client-community-connections.js');

test('community upload includes earned badge IDs and XP, never workout or health details', () => {
  const snapshot = {
    xp: 350,
    badges: [
      { id: 'workout-1', unlocked: true, title: 'First Spark' },
      { id: 'pr-5', unlocked: false, title: 'Record Breaker' }
    ],
    events: [{ title: 'Bench press PR', detail: '225 lb' }],
    workouts: 2,
    bodyWeight: 180
  };
  assert.deepEqual(achievementProjection(snapshot), { xp: 350, badge_ids: ['workout-1'], workout_count: 2 });
  assert.equal(achievementProjection(null), null);
});

test('accepted connection shows shared achievements without reading workout records', async () => {
  const owner = 'owner-id', peer = 'peer-id';
  const calls = [];
  function node() {
    return {
      hidden: false, value: '', textContent: '', children: [], listeners: {},
      addEventListener(type, callback) { this.listeners[type] = callback; },
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; }
    };
  }
  const elements = Object.fromEntries([
    '[data-community-join]', '[data-community-member]', '#client-community-display-name',
    '#client-community-own-code', '#client-community-invite-code', '[data-community-connection-list]',
    '[data-community-connection-status]', '[data-community-join-button]', '[data-community-invite]',
    '[data-community-copy]', '[data-community-rotate]', '[data-community-leave]'
  ].map(selector => [selector, node()]));
  const panel = { querySelector: selector => elements[selector] };
  const document = {
    querySelector: selector => selector === '[data-community-connections]' ? panel : null,
    createElement: () => node()
  };
  const rows = {
    client_community_profiles: [
      { user_id: owner, display_name: 'Alex', invite_code: 'AAAAAAAAAAAAAAAA' },
      { user_id: peer, display_name: 'Jordan' }
    ],
    client_community_preferences: [{ user_id: owner, badges_opt_in: true, xp_opt_in: false,
      workout_count_opt_in: false, gym_visits_opt_in: false }],
    client_community_connections: [{ id: 'connection-id', user_a: owner, user_b: peer, requested_by: owner, status: 'accepted' }],
    shared: [{ user_id: peer, xp: null, badge_ids: ['workout-1'], workout_count: null, gym_visit_count: 8 }]
  };
  const client = {
    rpc(name) {
      calls.push(name);
      assert.equal(name, 'community_shared_progress');
      return Promise.resolve({ data: rows.shared, error: null });
    },
    from(table) {
      calls.push(table);
      assert.ok(table.startsWith('client_community_'), 'Community never reads raw logs or health data');
      let selected = rows[table];
      const query = {
        select() { return this; },
        eq(field, value) { selected = selected.filter(row => row[field] === value); return this; },
        in(field, values) { selected = selected.filter(row => values.includes(row[field])); return this; },
        or() { return this; },
        async maybeSingle() { return { data: selected[0] || null, error: null }; },
        then(resolve) { return Promise.resolve({ data: selected, error: null }).then(resolve); }
      };
      return query;
    }
  };
  const controller = mount(document);
  controller.configure(client, owner, false);
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements['[data-community-member]'].hidden, false);
  assert.equal(elements['#client-community-own-code'].textContent, 'AAAAAAAAAAAAAAAA');
  const connection = elements['[data-community-connection-list]'].children[0];
  assert.equal(connection.children[0].textContent, 'Jordan');
  assert.match(connection.children[2].textContent, /First Spark|workout 1/i);
  assert.match(connection.children[3].textContent, /8 gym visits/);
  assert.equal(connection.children.some(child => /XP/.test(child.textContent)), false);
  assert.ok(calls.includes('community_shared_progress'));
  assert.equal(calls.includes('client_community_achievements'), false);
});
