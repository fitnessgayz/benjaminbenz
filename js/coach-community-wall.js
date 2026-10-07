(function () {
  'use strict';
  const config = window.FWB_SUPABASE_CONFIG || {};
  const status = document.getElementById('wall-status');
  const posts = document.getElementById('wall-posts');
  const signOut = document.getElementById('wall-sign-out');
  const refresh = document.getElementById('wall-refresh');
  const avatars = { strength: '💪', runner: '🏃', cycling: '🚴', boxing: '🥊', yoga: '🧘', swimming: '🏊', martial: '🥋', star: '⭐', lifting: '🏋️', walking: '🚶', hiking: '🥾' };
  let client;
  let busy = false;

  function element(tag, value, className) {
    const node = document.createElement(tag);
    node.textContent = value;
    if (className) node.className = className;
    return node;
  }

  async function load() {
    if (!client || busy) return;
    busy = true;
    refresh.disabled = true;
    status.textContent = 'Loading shared wins…';
    try {
      const { data, error } = await client.rpc('community_wall_feed');
      if (error) throw error;
      posts.replaceChildren();
      for (const event of data || []) {
        const card = element('article', '', 'wall-post');
        const head = element('div', '', 'wall-post-head');
        head.append(element('span', avatars[event.avatar_id] || avatars.strength, 'wall-avatar'));
        head.append(element('strong', event.nickname || 'FWB client'));
        const date = new Date(event.occurred_at);
        if (!Number.isNaN(date.getTime())) {
          const time = element('time', date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
          time.dateTime = date.toISOString();
          head.append(time);
        }
        card.append(head, element('p', event.headline || 'Shared a win'));
        const actions = element('div', '', 'wall-post-actions');
        const button = element('button', event.gave_props ? 'Props given' : 'Give props 👏');
        button.type = 'button';
        button.disabled = Boolean(event.gave_props || !event.can_give_props);
        button.addEventListener('click', () => void giveProps(event.event_id));
        actions.append(button, element('span', `${Number(event.props_count) || 0} props`));
        card.append(actions);
        posts.append(card);
      }
      status.textContent = data?.length ? '' : 'No activity has been shared on the Wall yet. Clients can enable Wall posts in Community → FWB Wall → Sharing choices.';
    } catch (_) {
      status.textContent = 'The Wall could not load. Please try Refresh.';
    } finally {
      busy = false;
      refresh.disabled = false;
    }
  }

  async function giveProps(eventId) {
    if (!client || busy || !eventId) return;
    busy = true;
    status.textContent = 'Sending props…';
    try {
      const { data, error } = await client.rpc('community_give_wall_props', { p_event_id: eventId });
      if (error) throw error;
      busy = false;
      await load();
      status.textContent = data ? 'Props sent!' : 'Props were already sent for this win.';
    } catch (_) {
      status.textContent = 'Could not send props. Please try again.';
    } finally { busy = false; }
  }

  async function start() {
    if (!config.url || !config.anonKey || !window.supabase || !window.FWB_AUTH_SESSION) {
      status.textContent = 'The Wall is unavailable right now.';
      return;
    }
    client = window.supabase.createClient(config.url, config.anonKey, {
      auth: { storage: window.FWB_AUTH_SESSION.storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) {
      window.location.replace('coach-login.html?return_to=%2Fcoach-community-wall.html');
      return;
    }
    if (String(data.user.email || '').toLowerCase() !== 'benjaminbenz.fit@gmail.com') {
      status.textContent = 'This page is available to the FWB coach account.';
      return;
    }
    signOut.hidden = false;
    refresh.addEventListener('click', () => void load());
    signOut.addEventListener('click', async () => {
      await client.auth.signOut();
      window.location.replace('coach-login.html');
    });
    await load();
  }
  void start();
})();
