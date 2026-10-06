const test = require('node:test');
const assert = require('node:assert/strict');
const { mount } = require('../js/client-community.js');

function fixture() {
  const handlers = {};
  const xp = { checked: false, disabled: false };
  const badge = { checked: false, disabled: false };
  const workouts = { checked: false, disabled: false };
  const gymVisits = { checked: false, disabled: false };
  const publicProgress = { checked: false, disabled: false };
  const wallActivity = { checked: false, disabled: false };
  const daily = { checked: false, disabled: false };
  const weekly = { checked: false, disabled: false };
  const save = { disabled: false, closest: selector => selector === '[data-community-save]' ? save : null };
  const status = { textContent: '' };
  const title = { textContent: '' };
  const body = { textContent: '' };
  const buttons = ['wall', 'leaderboard', 'connections', 'challenges'].map(name => ({
    dataset: { communityView: name },
    setAttribute(key, value) { this[key] = value; },
    focus() {}
  }));
  const nodes = {
    '#client-community-share-xp': xp,
    '#client-community-share-badges': badge,
    '#client-community-share-workouts': workouts,
    '#client-community-share-gym-visits': gymVisits,
    '#client-community-share-public': publicProgress,
    '#client-community-share-wall-activity': wallActivity,
    '#client-community-share-daily': daily,
    '#client-community-share-weekly': weekly,
    '[data-community-save]': save,
    '#client-community-consent-status': status,
    '#client-community-feature-title': title,
    '#client-community-feature-body': body
  };
  const wall = { hidden: true };
  const connections = { hidden: true };
  const challenges = { hidden: true };
  const feature = { hidden: true };
  nodes['[data-community-wall]'] = wall;
  nodes['[data-community-connections]'] = connections;
  nodes['[data-community-challenges]'] = challenges;
  nodes['.client-community-feature'] = feature;
  const panel = {
    querySelector: key => nodes[key],
    querySelectorAll: key => key === '[data-community-view]' ? buttons : [],
    addEventListener: (event, fn) => { handlers[event] = fn; }
  };
  return { controller: mount({ querySelector: () => panel }), handlers, xp, badge, workouts, gymVisits,
    publicProgress, wallActivity, daily, weekly, save, status, title, body, buttons, wall, connections, challenges, feature };
}

test('FWB Wall is the default Community view and progress is hidden on other tabs', () => {
  const ui = fixture();
  assert.equal(ui.buttons[0]['aria-selected'], 'true');
  assert.equal(ui.wall.hidden, false);
  ui.handlers.click({ target: { closest: () => ui.buttons[2] } });
  assert.equal(ui.wall.hidden, true);
  assert.equal(ui.connections.hidden, false);
});

test('sharing choices default off, load only for the signed-in owner, and save separately', async () => {
  const ui = fixture();
  let selectedUser, saved;
  const client = { from(table) {
    assert.equal(table, 'client_community_preferences');
    return {
      select() { return this; },
      eq(key, value) { assert.equal(key, 'user_id'); selectedUser = value; return this; },
      async maybeSingle() { return { data: null, error: null }; },
      upsert(values, options) {
        assert.equal(options.onConflict, 'user_id');
        saved = values;
        return { select() { return this; }, async single() { return { data: values, error: null }; } };
      }
    };
  } };
  ui.controller.configure(client, 'user-1', false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(selectedUser, 'user-1');
  assert.equal(ui.badge.checked, false);
  assert.equal(ui.xp.checked, false);
  assert.equal(ui.workouts.checked, false);
  assert.equal(ui.gymVisits.checked, false);
  assert.equal(ui.publicProgress.checked, false);
  assert.equal(ui.wallActivity.checked, false);
  assert.equal(ui.daily.checked, false);
  assert.equal(ui.weekly.checked, false);
  assert.equal(ui.save.disabled, false);
  ui.badge.checked = true;
  ui.daily.checked = true;
  ui.handlers.click({ target: ui.save });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saved, { user_id: 'user-1', xp_opt_in: false, badges_opt_in: true,
    workout_count_opt_in: false, gym_visits_opt_in: false, public_progress_opt_in: false,
    wall_activity_opt_in: false, daily_challenge_opt_in: true, weekly_challenge_opt_in: false });
  assert.match(ui.status.textContent, /Saved/);
});

test('coach preview cannot alter a client’s sharing choices', () => {
  const ui = fixture();
  ui.controller.configure({ from() { throw new Error('Unexpected database access'); } }, 'user-1', true);
  assert.equal(ui.badge.disabled, true);
  assert.equal(ui.xp.disabled, true);
  assert.equal(ui.workouts.disabled, true);
  assert.equal(ui.gymVisits.disabled, true);
  assert.equal(ui.publicProgress.disabled, true);
  assert.equal(ui.wallActivity.disabled, true);
  assert.equal(ui.daily.disabled, true);
  assert.equal(ui.weekly.disabled, true);
  assert.equal(ui.save.disabled, true);
  assert.match(ui.status.textContent, /client signs in/);
});

test('failed consent save restores the previously saved privacy choices', async () => {
  const ui = fixture();
  const client = { from() {
    return {
      select() { return this; }, eq() { return this; },
      async maybeSingle() { return { data: { xp_opt_in: true, badges_opt_in: false,
        workout_count_opt_in: false, gym_visits_opt_in: false, public_progress_opt_in: false }, error: null }; },
      upsert() { return { select() { return this; }, async single() {
        return { data: null, error: new Error('Save failed') };
      } }; }
    };
  } };
  ui.controller.configure(client, 'user-1', false);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.xp.checked, true);
  ui.xp.checked = false;
  ui.gymVisits.checked = true;
  ui.publicProgress.checked = true;
  ui.wallActivity.checked = true;
  ui.daily.checked = true;
  ui.weekly.checked = true;
  ui.handlers.click({ target: ui.save });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ui.xp.checked, true);
  assert.equal(ui.gymVisits.checked, false);
  assert.equal(ui.publicProgress.checked, false);
  assert.equal(ui.wallActivity.checked, false);
  assert.equal(ui.daily.checked, false);
  assert.equal(ui.weekly.checked, false);
  assert.match(ui.status.textContent, /Previous choices restored/);
});
