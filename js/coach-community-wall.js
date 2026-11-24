(function () {
  'use strict';
  const config = window.FWB_SUPABASE_CONFIG || {};
  const status = document.getElementById('wall-status');
  const posts = document.getElementById('wall-posts');
  const signOut = document.getElementById('wall-sign-out');
  const refresh = document.getElementById('wall-refresh');
  const avatars = { strength: '💪', runner: '🏃', cycling: '🚴', boxing: '🥊', yoga: '🧘', swimming: '🏊', martial: '🥋', star: '⭐', lifting: '🏋️', walking: '🚶', hiking: '🥾' };
  const dayLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const fullDayLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const timeLabel = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  let client;
  let busy = false;
  let openComment;

  function element(tag, value, className) {
    const node = document.createElement(tag);
    node.textContent = value;
    if (className) node.className = className;
    return node;
  }

  function action(kind, label, className) {
    const button = element('button', '', className);
    const icon = element('span', '', kind === 'props' ? 'web-notification-like-icon' : 'coach-activity-comment-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = `<svg viewBox="0 0 24 24" focusable="false"><use href="/images/gruntr/coach-feed-actions.svg#${kind}"/></svg>`;
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.append(icon);
    return button;
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
        const avatar = element('span', avatars[event.avatar_id] || avatars.strength, 'wall-avatar');
        avatar.setAttribute('aria-hidden', 'true');
        head.append(avatar);
        head.append(element('strong', event.nickname || 'GRUNTR client'));
        let timestamp = '';
        const date = new Date(event.occurred_at || '');
        if (!Number.isNaN(date.getTime())) {
          const day = (date.getFullYear() === new Date().getFullYear() ? dayLabel : fullDayLabel).format(date);
          const localTime = timeLabel.format(date);
          const time = element('time', `${day} · ${localTime}`);
          time.dateTime = date.toISOString();
          time.title = `${fullDayLabel.format(date)} · ${localTime}`;
          timestamp = time.title;
          head.append(time);
        }
        card.append(head, element('p', event.headline || 'Shared a win'));
        const actions = element('div', '', 'wall-post-actions coach-activity-actions');
        const button = action('props', event.gave_props ? 'Props given' : 'Give props', 'web-notification-like');
        button.setAttribute('aria-pressed', String(Boolean(event.gave_props)));
        button.disabled = Boolean(event.gave_props || !event.can_give_props);
        button.addEventListener('click', () => void giveProps(event.event_id));
        actions.append(button);
        if (openComment && event.event_id && !event.is_own) {
          const comment = action('comment', 'Comment privately', 'coach-activity-comment');
          comment.setAttribute('aria-haspopup', 'dialog');
          comment.addEventListener('click', () => openComment({
            clientName: event.nickname || 'GRUNTR client',
            activity: { wallEventId: event.event_id, context: [event.headline || 'Shared a win', timestamp].filter(Boolean).join(' · ') },
            button: comment
          }));
          actions.append(comment);
        }
        const props = Number(event.props_count) || 0;
        actions.append(element('span', `${props} ${props === 1 ? 'prop' : 'props'}`, 'wall-props-count'));
        card.append(actions);
        posts.append(card);
      }
      status.textContent = data?.length ? '' : 'No shared posts yet.';
    } catch (_) {
      status.textContent = 'GRUNTR FEED could not load. Please try Refresh.';
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
      status.textContent = 'GRUNTR FEED is unavailable right now.';
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
      status.textContent = 'This page is available to the GRUNTR Coach account.';
      return;
    }
    openComment = window.FWBCoachFeedComment?.create({
      dialog: document.getElementById('coach-activity-comment-dialog'),
      fallbackFocus: refresh,
      send: (payload) => client.rpc('send_coach_activity_comment', payload),
      onSent() { status.textContent = 'Comment sent to the client’s notifications.'; }
    });
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
