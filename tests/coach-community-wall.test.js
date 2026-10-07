const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../js/coach-community-wall.js'), 'utf8');

function node() {
  return {
    children: [], textContent: '', hidden: false, disabled: false, listeners: {},
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; },
    addEventListener(event, callback) { this.listeners[event] = callback; }
  };
}

function run(email) {
  const elements = Object.fromEntries(['wall-status', 'wall-posts', 'wall-sign-out', 'wall-refresh'].map(id => [id, node()]));
  const calls = [];
  let gaveProps = false;
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { email } }, error: null }),
      signOut: async () => ({ error: null })
    },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'community_wall_feed') return { data: [{
        event_id: 'workout:client:1', nickname: 'Client', avatar_id: 'lifting',
        headline: 'Completed a workout', occurred_at: '2026-10-06T12:00:00Z',
        props_count: gaveProps ? 1 : 0, gave_props: gaveProps, can_give_props: !gaveProps
      }], error: null };
      if (name === 'community_give_wall_props') {
        assert.equal(args.p_event_id, 'workout:client:1');
        gaveProps = true;
        return { data: true, error: null };
      }
      throw new Error('unexpected RPC');
    }
  };
  const window = {
    FWB_SUPABASE_CONFIG: { url: 'https://example.test', anonKey: 'test-key' },
    FWB_AUTH_SESSION: { storage: {} },
    supabase: { createClient: () => client },
    location: { replace() { throw new Error('unexpected redirect'); } }
  };
  const document = {
    getElementById: id => elements[id],
    createElement: () => node()
  };
  vm.runInNewContext(source, { window, document, Date, Number, String, Boolean });
  return { elements, calls };
}

async function settle() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

test('coach sees opted-in Wall events and can give props once', async () => {
  const { elements, calls } = run('benjaminbenz.fit@gmail.com');
  await settle();
  assert.equal(elements['wall-posts'].children.length, 1);
  const card = elements['wall-posts'].children[0];
  assert.equal(card.children[1].textContent, 'Completed a workout');
  const button = card.children[2].children[0];
  assert.equal(button.textContent, 'Give props 👏');
  await button.listeners.click();
  await settle();
  assert.deepEqual(calls.map(call => call.name), [
    'community_wall_feed', 'community_give_wall_props', 'community_wall_feed'
  ]);
  assert.equal(elements['wall-posts'].children[0].children[2].children[0].textContent, 'Props given');
});

test('another signed-in account cannot load the coach Wall', async () => {
  const { elements, calls } = run('client@example.com');
  await settle();
  assert.equal(calls.length, 0);
  assert.match(elements['wall-status'].textContent, /coach account/);
});
