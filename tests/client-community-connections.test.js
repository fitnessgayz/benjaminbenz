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
  let createdChallenge;
  function node() {
    return {
      hidden: false, value: '', textContent: '', children: [], listeners: {}, dataset: {},
      addEventListener(type, callback) { this.listeners[type] = callback; },
      setAttribute(name, value) { this[name] = value; },
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; }
    };
  }
  const elements = Object.fromEntries([
    '[data-community-profile]', '[data-community-join]', '[data-community-member]', '#client-community-display-name',
    '#client-community-own-code', '#client-community-invite-code', '[data-community-connection-list]',
    '[data-community-connection-status]', '[data-community-join-button]', '[data-community-invite]',
    '[data-community-copy]', '[data-community-rotate]', '[data-community-leave]',
    '[data-community-profile-save]', '[data-community-own-props]', '[data-community-avatar-more]'
  ].map(selector => [selector, node()]));
  const avatarButtons = ['strength', 'runner', 'cycling', 'boxing', 'yoga', 'swimming', 'martial', 'star']
    .map(id => Object.assign(node(), { dataset: { communityAvatar: id } }));
  const panel = {
    querySelector: selector => elements[selector],
    querySelectorAll: selector => selector === '[data-community-avatar]' ? avatarButtons : []
  };
  const publicElements = Object.fromEntries(['[data-community-feed-list]', '[data-community-feed-status]',
    '[data-community-challenge-list]', '[data-community-challenge-status]'].map(selector => [selector, node()]));
  const document = {
    querySelector: selector => selector === '[data-community-connections]' ? panel : publicElements[selector],
    createElement: () => node()
  };
  const rows = {
    client_community_profiles: [
      { user_id: owner, display_name: 'Alex', avatar_id: 'strength', invite_code: 'AAAAAAAAAAAAAAAA' },
      { user_id: peer, display_name: 'Jordan', avatar_id: 'runner' }
    ],
    client_community_preferences: [{ user_id: owner, badges_opt_in: true, xp_opt_in: false,
      workout_count_opt_in: false, gym_visits_opt_in: false }],
    client_community_connections: [{ id: 'connection-id', user_a: owner, user_b: peer, requested_by: owner, status: 'accepted' }],
    shared: [{ user_id: peer, xp: null, badge_ids: ['workout-1'], workout_count: null, gym_visit_count: 8 }],
    props: [{ user_id: owner, received_count: 2, sent_today: false },
      { user_id: peer, received_count: 4, sent_today: false }]
  };
  const client = {
    rpc(name, params) {
      calls.push(name);
      assert.ok(['community_shared_progress', 'community_props_summary', 'community_give_props',
        'community_public_progress', 'community_challenge_summary', 'community_create_challenge'].includes(name));
      if (name === 'community_create_challenge') createdChallenge = params;
      return Promise.resolve({ data: name === 'community_shared_progress' ? rows.shared
        : name === 'community_props_summary' ? rows.props
          : name === 'community_public_progress' ? [{ nickname: 'Sam', avatar_id: 'star',
            xp: null, badge_ids: null, workout_count: 3, gym_visit_count: null }]
            : name === 'community_challenge_summary' ? [] : true, error: null });
    },
    from(table) {
      calls.push(table);
      assert.ok(table.startsWith('client_community_'), 'Community never reads raw logs or health data');
      let selected = rows[table];
      const query = {
        select() { return this; },
        update(values) {
          assert.equal(table, 'client_community_profiles');
          calls.push({ profileUpdate: values });
          Object.assign(rows[table][0], values);
          return this;
        },
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
  assert.equal(elements['[data-community-own-props]'].textContent, '2');
  const connection = elements['[data-community-connection-list]'].children[0];
  assert.equal(connection.children[0].textContent, '🏃');
  assert.equal(connection.children[1].textContent, 'Jordan');
  assert.ok(connection.children.some(child => /First Spark|workout 1/i.test(child.textContent)));
  assert.ok(connection.children.some(child => /8 gym visits/.test(child.textContent)));
  assert.ok(connection.children.some(child => /4 props received/.test(child.textContent)));
  assert.equal(connection.children.some(child => /XP/.test(child.textContent)), false);
  assert.ok(calls.includes('community_shared_progress'));
  assert.ok(calls.includes('community_props_summary'));
  assert.ok(calls.includes('community_public_progress'));
  assert.equal(publicElements['[data-community-feed-list]'].children[0].children[1].textContent, 'Sam');
  assert.equal(calls.includes('client_community_achievements'), false);
  const actions = connection.children.find(child => child.className === 'client-community-connection-actions');
  actions.children[0].listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.includes('community_give_props'));
  const challengeForm = connection.children.find(child => child.className === 'client-community-challenge-form');
  challengeForm.children[2].listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(createdChallenge, { p_connection_id: 'connection-id', p_metric: 'workouts', p_target_count: 3 });
  elements['#client-community-display-name'].value = 'Alex Fit';
  avatarButtons.find(button => button.dataset.communityAvatar === 'yoga').listeners.click();
  elements['[data-community-profile-save]'].listeners.click();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls.some(call => call.profileUpdate?.display_name === 'Alex Fit' && call.profileUpdate.avatar_id === 'yoga'));
});
