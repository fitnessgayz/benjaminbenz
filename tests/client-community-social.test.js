const test = require('node:test');
const assert = require('node:assert/strict');
const { mount, ranked, customEmoji, avatarSymbol, avatarPath, eventOwner, workoutMetrics } = require('../js/client-community-social.js');

const alice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const bob = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const session = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const eventID = 'workout:' + bob + ':' + session;

test('nickname, avatar, workout summaries and ranks use only the returned Social projection', () => {
  assert.equal(eventOwner(eventID), bob);
  assert.equal(eventOwner('weekly:' + session + ':' + bob), bob);
  assert.equal(eventOwner(eventID + ':unexpected'), null);
  assert.equal(avatarPath(bob + '/' + session + '.jpg', bob), true);
  assert.equal(avatarPath(alice + '/' + session + '.jpg', bob), false);
  assert.equal(customEmoji('  🧑🏽‍🚀  '), '🧑🏽‍🚀');
  assert.equal(customEmoji('👍👍'), '');
  assert.equal(avatarSymbol('emoji:<script>'), '💪');
  assert.equal(avatarSymbol('emoji:🇺🇸'), '🇺🇸');
  assert.deepEqual(workoutMetrics({ minutes: 44, sets: 0, volume_lb: null }), [['Duration', '44 min']]);
  const entries = [
    { nickname: 'A', check_in_count: 1, workout_count: 5 },
    { nickname: 'B', check_in_count: 4, workout_count: 3 },
    { nickname: 'C', check_in_count: 4, workout_count: 1 },
    { nickname: 'D', check_in_count: 0, workout_count: 0 }
  ];
  assert.deepEqual(ranked(entries, 'check_in_count').map(row => [row.nickname, row.rank]), [['B', 1], ['C', 1], ['A', 3]]);
});

function fixture() {
  function element(tag) {
    return {
      tag, children: [], handlers: {}, dataset: {}, isConnected: true, textContent: '',
      append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; },
      setAttribute(name, value) { this[name] = value; },
      addEventListener(name, handler) { this.handlers[name] = handler; },
      showModal() { this.open = true; },
      close() { this.open = false; this.handlers.close?.(); }
    };
  }
  const fields = Object.fromEntries([
    'wall-list', 'wall-status', 'leaderboard', 'ranks', 'board-status', 'board-setting',
    'board-sharing', 'week'
  ].map(key => [key, element('control')]));
  const metricButtons = ['workout_count', 'check_in_count', 'pr_count', 'badge_count'].map(value => {
    const item = element('button');
    item.dataset.communityMetric = value;
    return item;
  });
  const panel = {
    children: [],
    append(...nodes) { this.children.push(...nodes); },
    querySelector(selector) { return fields[selector.slice('[data-community-'.length, -1)]; },
    querySelectorAll(selector) { return selector === '[data-community-metric]' ? metricButtons : []; }
  };
  const actions = [];
  const controller = mount({ createElement: element }, panel, {
    openCircles() { actions.push('open'); },
    async requestCircle(owner) { actions.push(owner); return true; }
  });
  const row = { event_id: eventID, event_type: 'workout', nickname: 'Jordan', avatar_id: 'runner',
    occurred_at: new Date(Date.now() - 2000).toISOString(), headline: 'Completed a workout',
    props_count: 2, can_give_props: true, gave_props: false, is_own: false };
  const entry = { nickname: 'Alex', avatar_id: 'star', is_own: true, workout_count: 3, check_in_count: 1, pr_count: 0, badge_count: 2 };
  let sharing = true, comments = [];
  function result(data) { return Promise.resolve({ data, error: null }); }
  const client = {
    rpc(name, args) {
      actions.push([name, args]);
      if (name === 'community_wall_feed') return result([row]);
      if (name === 'community_wall_workout_summaries') return result([
        { event_id: eventID, title: 'Leg day', minutes: 37, sets: 9, volume_lb: 4230,
          exercises: ['Squat', 'Curl', 'Press', 'Extra'].map(name => ({ name, sets: 3 })) },
        { event_id: 'other', title: 'Not requested' }
      ]);
      if (name === 'community_give_wall_props') return result(true);
      if (name === 'community_wall_comments') return result(comments);
      if (name === 'community_add_wall_comment') {
        comments = [{ id: session, user_id: alice, nickname: 'Alex', avatar_id: 'star', is_own: true, body: args.p_body }];
        return result(session);
      }
      if (name === 'community_delete_wall_comment') { comments = []; return result(true); }
      if (name === 'community_weekly_leaderboard') return result({ week_start: '2026-11-16',
        can_participate: true, sharing_enabled: sharing, entries: sharing ? [entry] : [] });
      if (name === 'community_set_leaderboard_sharing') { sharing = args.p_enabled; return result(sharing); }
      throw new Error('Unexpected RPC ' + name);
    }
  };
  return { controller, client, panel, fields, actions, metricButtons };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('Feed renders three exercises, author workouts and live reactions and comments', async () => {
  const { controller, client, panel, fields, actions } = fixture();
  controller.configure(client, alice, false);
  controller.setMembers({ display_name: 'Alex' }, []);
  await controller.refreshFeed();
  assert.deepEqual(actions[1], ['community_wall_workout_summaries', { p_event_ids: [eventID] }]);
  const post = fields['wall-list'].children[0];
  assert.equal(post.children[1].textContent, 'Leg day');
  assert.deepEqual(post.children[2].children.map(metric => metric.children[0].textContent), ['Duration', 'Sets', 'Volume']);
  assert.deepEqual(post.children[3].children.map(exercise => exercise.children[0].textContent), ['Squat', 'Curl', 'Press']);
  const member = panel.children[1];
  assert.equal(post.children[0].children.length, 2);
  assert.equal(post.children[0].children[1].textContent, 'Add to Squad');
  post.children[0].children[0].handlers.click();
  assert.equal(member.open, true);
  const [profile, heading, workout] = member.children[1].children;
  assert.equal(profile.children[0].className, 'client-social-avatar');
  const add = profile.children[1].children[0];
  assert.equal(add.textContent, 'Add to Squad');
  add.handlers.click();
  await tick();
  assert.ok(actions.includes(bob));
  assert.equal(profile.children[1].children[0].textContent, 'Squad request pending');
  controller.setMembers({ display_name: 'Alex' }, [{ user_a: alice, user_b: bob, status: 'accepted' }]);
  assert.equal(profile.children[1].children[0].textContent, 'In your Squad');
  assert.equal(heading.textContent, 'Recent shared workouts');
  assert.equal(workout.children[0].textContent, 'Leg day');
  member.close();
  const [give, view] = post.children.at(-1).children;
  give.handlers.click();
  await tick();
  assert.equal(give.textContent, 'Props given · 3');
  view.handlers.click();
  await tick();
  const thread = panel.children[0];
  const form = thread.children.at(-1);
  form.children[0].children[0].value = '  Great workout  ';
  form.children[1].handlers.click();
  await tick();
  assert.deepEqual(actions.find(([call]) => call === 'community_add_wall_comment'),
    ['community_add_wall_comment', { p_event_id: eventID, p_body: 'Great workout' }]);
  const comment = thread.children[1].children[0];
  assert.equal(comment.children[1].children[1].textContent, 'Great workout');
  comment.children[2].handlers.click();
  await tick();
  assert.equal(thread.children[1].children.length, 0);
  controller.configure(client, null, true);
  assert.equal(thread.open, false);
  assert.equal(fields['wall-list'].children.length, 0);
});

test('leaderboard defaults to the saved server preference and opts out for all metrics together', async () => {
  const { controller, client, fields, metricButtons, actions } = fixture();
  controller.configure(client, alice, false);
  await controller.refreshBoard();
  assert.equal(fields['board-sharing'].checked, true);
  assert.equal(fields.ranks.children[0].children[3].textContent, '3');
  metricButtons[3].handlers.click();
  assert.equal(fields.ranks.children[0].children[3].textContent, '2');
  fields['board-sharing'].checked = false;
  await fields['board-sharing'].handlers.change();
  assert.ok(actions.some(([name, args]) => name === 'community_set_leaderboard_sharing' && args.p_enabled === false));
  assert.equal(fields['board-sharing'].checked, false);
  assert.equal(fields.ranks.children.length, 0);
});

test('compact Feed invite is joined/eligible only and an old account action cannot send', async () => {
  const { controller, client, fields, actions } = fixture();
  controller.configure(client, alice, false);
  const author = () => fields['wall-list'].children[0].children[0];
  await controller.refreshFeed();
  assert.equal(author().children.length, 1);
  controller.setMembers({ display_name: 'Alex' }, [], false);
  assert.equal(author().children.length, 1);
  controller.setMembers({ display_name: 'Alex' }, [], true);
  const click = author().children[1];
  assert.equal(click['aria-label'], 'Add Jordan to Squad');
  click.handlers.click(); click.handlers.click();
  await tick();
  assert.equal(actions.filter(x => x === bob).length, 1);
  assert.equal(click.textContent, 'Squad request pending');
  controller.configure(client, session, false);
  click.handlers.click();
  assert.equal(actions.filter(x => x === bob).length, 1);
});
