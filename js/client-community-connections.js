/* Client Community: public summaries and private connections. Raw activity stays server-side. */
(function attachCommunityConnections(root) {
  'use strict';
  const avatars = { strength: '💪', runner: '🏃', cycling: '🚴', boxing: '🥊',
    yoga: '🧘', swimming: '🏊', martial: '🥋', star: '⭐', lifting: '🏋️',
    walking: '🚶', hiking: '🥾', basketball: '🏀', soccer: '⚽', tennis: '🎾',
    rowing: '🚣', climbing: '🧗' };

  function customAvatarID(value) {
    const emoji = String(value || '').trim().normalize('NFC');
    const graphemes = typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(emoji))
      : Array.from(emoji);
    if (graphemes.length !== 1 || Array.from(emoji).length > 16
        || new TextEncoder().encode(emoji).length > 64
        || /[\s\x00-\x1f\x7f]/u.test(emoji)
        || !/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Presentation}\u20e3]/u.test(emoji)) return '';
    return `emoji:${emoji}`;
  }

  function avatarEmoji(id) {
    if (Object.hasOwn(avatars, id)) return avatars[id];
    const emoji = typeof id === 'string' && id.startsWith('emoji:') ? id.slice(6) : '';
    return customAvatarID(emoji) === id ? emoji : avatars.strength;
  }

  function achievementProjection(snapshot) {
    if (!snapshot || !Number.isFinite(snapshot.xp) || !Array.isArray(snapshot.badges)) return null;
    return {
      xp: Math.max(0, Math.floor(snapshot.xp)),
      badge_ids: snapshot.badges.filter(badge => badge.unlocked).map(badge => badge.id).slice(0, 32),
      workout_count: Number.isFinite(snapshot.workouts) ? Math.max(0, Math.floor(snapshot.workouts)) : null
    };
  }

  function mount(document) {
    const panel = document.querySelector('[data-community-connections]');
    if (!panel) return { configure() {}, refresh() {}, syncAchievements() {} };
    const join = panel.querySelector('[data-community-join]');
    const member = panel.querySelector('[data-community-member]');
    const profileEditor = panel.querySelector('[data-community-profile]');
    const nameInput = panel.querySelector('#client-community-display-name');
    const avatarButtons = Array.from(panel.querySelectorAll('[data-community-avatar]'));
    const customEmojiInput = panel.querySelector('[data-community-custom-emoji]');
    const customEmojiButton = panel.querySelector('[data-community-avatar-custom]');
    const ownProps = panel.querySelector('[data-community-own-props]');
    const codeOutput = panel.querySelector('#client-community-own-code');
    const codeInput = panel.querySelector('#client-community-invite-code');
    const list = panel.querySelector('[data-community-connection-list]');
    const status = panel.querySelector('[data-community-connection-status]');
    const feedList = document.querySelector('[data-community-feed-list]');
    const feedStatus = document.querySelector('[data-community-feed-status]');
    const wallList = document.querySelector('[data-community-wall-list]');
    const wallStatus = document.querySelector('[data-community-wall-status]');
    const challengeList = document.querySelector('[data-community-challenge-list]');
    const challengeStatus = document.querySelector('[data-community-challenge-status]');
    const moreAvatars = panel.querySelector('[data-community-avatar-more]');
    const extraAvatars = Array.from(panel.querySelectorAll('[data-community-avatar-extra]'));
    let client = null, userId = '', preview = false, generation = 0;
    let profile = null, preferences = null, snapshot = null, published = '', busy = false, wallBusy = false;
    let selectedAvatar = 'strength';

    const current = (id, version) => id === userId && version === generation;
    const message = text => { status.textContent = text; };
    const field = (tag, text, className = '') => {
      const node = document.createElement(tag);
      node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    function chooseAvatar(id) {
      selectedAvatar = Object.hasOwn(avatars, id) ||
        (typeof id === 'string' && id.startsWith('emoji:') && customAvatarID(id.slice(6)) === id) ? id : 'strength';
      avatarButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.communityAvatar === selectedAvatar)));
      if (selectedAvatar.startsWith('emoji:')) customEmojiInput.value = selectedAvatar.slice(6);
      customEmojiButton.setAttribute('aria-pressed', String(selectedAvatar.startsWith('emoji:')));
      customEmojiButton.textContent = customAvatarID(customEmojiInput.value)
        ? `Use ${customEmojiInput.value.trim()}` : 'Use this emoji';
      if (extraAvatars.some(button => button.dataset.communityAvatar === selectedAvatar)) setMoreAvatars(true);
    }
    function setMoreAvatars(open) {
      extraAvatars.forEach(button => { button.hidden = !open; });
      moreAvatars.setAttribute('aria-expanded', String(open));
      moreAvatars.textContent = open ? 'Show fewer avatars' : 'Choose more avatars';
    }
    moreAvatars.addEventListener('click', () => setMoreAvatars(moreAvatars.getAttribute('aria-expanded') !== 'true'));
    avatarButtons.forEach(button => button.addEventListener('click', () => chooseAvatar(button.dataset.communityAvatar)));
    customEmojiInput.addEventListener('input', () => {
      if (selectedAvatar.startsWith('emoji:')) selectedAvatar = '';
      customEmojiButton.setAttribute('aria-pressed', 'false');
      customEmojiButton.textContent = customAvatarID(customEmojiInput.value)
        ? `Use ${customEmojiInput.value.trim()}` : 'Use this emoji';
    });
    customEmojiButton.addEventListener('click', () => {
      const id = customAvatarID(customEmojiInput.value);
      if (!id) { message('Type or paste one emoji for your avatar.'); return; }
      chooseAvatar(id);
      message('Emoji selected. Save your Community profile to use it.');
    });

    async function refreshPublic(id, version) {
      if (!feedList || !feedStatus) return;
      feedStatus.textContent = 'Loading shared progress…';
      const { data, error } = await client.rpc('community_public_progress');
      if (!current(id, version)) return;
      feedList.replaceChildren();
      if (error) { feedStatus.textContent = 'Shared progress could not load. Try opening Community again.'; return; }
      const entries = data || [];
      for (const entry of entries) {
        const card = field('article', '', 'client-community-feed-card');
        card.append(field('span', avatarEmoji(entry.avatar_id), 'client-community-avatar'));
        card.append(field('strong', entry.nickname));
        const metrics = [];
        if (entry.xp != null) metrics.push(`${entry.xp} XP`);
        if (Array.isArray(entry.badge_ids)) metrics.push(`${entry.badge_ids.length} badges`);
        if (entry.workout_count != null) metrics.push(`${entry.workout_count} workouts`);
        if (entry.gym_visit_count != null) metrics.push(`${entry.gym_visit_count} gym visits`);
        card.append(field('small', metrics.join(' · ')));
        if (Array.isArray(entry.badge_ids) && entry.badge_ids.length) {
          const titles = entry.badge_ids.map(badge => snapshot?.badges?.find(item => item.id === badge)?.title || badge.replace(/-/g, ' '));
          card.append(field('p', titles.join(' · ')));
        }
        feedList.append(card);
      }
      feedStatus.textContent = entries.length ? '' : 'No clients have chosen to share progress yet.';
    }

    async function refreshWall(id, version) {
      if (!wallList || !wallStatus) return;
      wallStatus.textContent = 'Loading the FWB Wall…';
      const { data, error } = await client.rpc('community_wall_feed');
      if (!current(id, version)) return;
      wallList.replaceChildren();
      if (error) { wallStatus.textContent = 'The FWB Wall could not load. Try opening Community again.'; return; }
      for (const event of data || []) {
        const card = field('article', '', 'client-community-wall-card');
        const heading = field('div', '', 'client-community-wall-heading');
        heading.append(field('span', avatarEmoji(event.avatar_id), 'client-community-avatar'));
        heading.append(field('strong', event.nickname));
        const date = new Date(event.occurred_at);
        if (!Number.isNaN(date.getTime())) heading.append(field('time', date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })));
        card.append(heading, field('p', event.headline));
        const actions = field('div', '', 'client-community-wall-actions');
        const button = field('button', event.is_own ? 'Your win' : event.gave_props ? 'Props given' : 'Give props 👏');
        button.type = 'button';
        button.disabled = !event.can_give_props || event.gave_props;
        if (!event.can_give_props && !event.gave_props && !event.is_own) button.title = 'Join Community to give props to another client.';
        button.addEventListener('click', () => void giveWallProps(event.event_id));
        actions.append(button, field('small', `${event.props_count || 0} props`));
        card.append(actions);
        wallList.append(card);
      }
      wallStatus.textContent = data?.length ? '' : 'No shared wins yet. Your next check-in, workout, or challenge could be the first.';
    }

    async function giveWallProps(eventId) {
      if (wallBusy || !client || !userId || preview) return;
      wallBusy = true;
      const id = userId;
      wallStatus.textContent = 'Sending props…';
      try {
        const { data, error } = await client.rpc('community_give_wall_props', { p_event_id: eventId });
        if (error) throw error;
        if (id !== userId) return;
        await refreshWall(id, generation);
        wallStatus.textContent = data ? 'Props sent!' : 'Props were already sent for this win.';
      } catch (_) {
        if (id === userId) wallStatus.textContent = 'Could not send props. Please try again.';
      } finally { wallBusy = false; }
    }

    function renderChallenges(rows) {
      if (!challengeList) return;
      challengeList.replaceChildren();
      if (!rows.length) {
        challengeList.append(field('p', 'No challenges yet. Challenge a connection from the Connections tab.'));
        return;
      }
      for (const challenge of rows) {
        const card = field('article', '', 'client-community-challenge-card');
        card.append(field('strong', `${avatarEmoji(challenge.peer_avatar_id)} ${challenge.peer_nickname}`));
        const label = challenge.metric === 'workouts' ? 'workouts' : 'gym visits';
        card.append(field('p', `${challenge.target_count} ${label} each in seven days`));
        if (challenge.status === 'pending') {
          card.append(field('small', challenge.incoming ? 'Waiting for you to accept' : 'Waiting for your friend to accept'));
          if (challenge.incoming) {
            const accept = field('button', 'Accept challenge');
            accept.type = 'button';
            accept.addEventListener('click', () => void challengeAction('community_accept_challenge', challenge.id));
            card.append(accept);
          }
        } else {
          card.append(field('p', `You: ${challenge.my_count ?? 0}/${challenge.target_count} · ${challenge.peer_nickname}: ${challenge.peer_count ?? 0}/${challenge.target_count}`));
          card.append(field('small', `Ends ${String(challenge.ends_at).slice(0, 10)}`));
        }
        const cancel = field('button', 'Cancel challenge');
        cancel.type = 'button';
        cancel.addEventListener('click', () => void challengeAction('community_cancel_challenge', challenge.id));
        card.append(cancel);
        challengeList.append(card);
      }
    }

    function challengeAction(rpc, challengeId) {
      void perform(() => client.rpc(rpc, { p_challenge_id: challengeId }), 'Challenge updated.');
    }

    async function publish() {
      const projection = achievementProjection(snapshot);
      if (!profile || !(preferences?.xp_opt_in || preferences?.badges_opt_in || preferences?.workout_count_opt_in)
          || !projection || !client || preview) return;
      const fingerprint = JSON.stringify(projection);
      if (fingerprint === published) return;
      const id = userId, version = generation;
      const { error } = await client.from('client_community_achievements')
        .upsert({ user_id: id, ...projection, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (!error && current(id, version)) { published = fingerprint; void refreshPublic(id, version); }
      if (error && current(id, version)) message('Your achievements could not be shared yet. Try opening Community again.');
    }

    function renderConnections(connections, profiles, achievements, props) {
      list.replaceChildren();
      if (!connections.length) {
        list.append(field('p', 'No invitations yet. Share your code or enter a friend’s code.'));
        return;
      }
      for (const connection of connections) {
        const peer = connection.user_a === userId ? connection.user_b : connection.user_a;
        const peerProfile = profiles.get(peer);
        const name = peerProfile?.display_name || 'Community member';
        const card = field('article', '', 'client-community-connection');
        card.append(field('span', avatarEmoji(peerProfile?.avatar_id), 'client-community-avatar'));
        card.append(field('strong', name));
        const incoming = connection.status === 'pending' && connection.requested_by !== userId;
        const statusLabel = connection.status === 'accepted' ? 'Connected' : incoming ? 'Invitation received' : 'Invitation sent';
        card.append(field('small', statusLabel));
        const achievement = connection.status === 'accepted' ? achievements.get(peer) : null;
        if (achievement && [achievement.xp, achievement.badge_ids, achievement.workout_count, achievement.gym_visit_count]
            .some(value => value !== null && value !== undefined)) {
          if (achievement.xp !== null && achievement.xp !== undefined) card.append(field('p', `${achievement.xp} XP`));
          if (Array.isArray(achievement.badge_ids)) {
            const titles = achievement.badge_ids.map(id => snapshot?.badges?.find(badge => badge.id === id)?.title || id.replace(/-/g, ' '));
            card.append(field('small', titles.length ? titles.join(' · ') : 'No badges earned yet'));
          }
          if (achievement.workout_count !== null && achievement.workout_count !== undefined) {
            const count = achievement.workout_count;
            card.append(field('p', `${count} completed workout${count === 1 ? '' : 's'}`));
          }
          if (achievement.gym_visit_count !== null && achievement.gym_visit_count !== undefined) {
            const count = achievement.gym_visit_count;
            card.append(field('p', `${count} gym visit${count === 1 ? '' : 's'}`));
          }
        } else if (connection.status === 'accepted') {
          card.append(field('p', 'Milestones are private until this member chooses to share them.'));
        }
        const actions = field('div', '', 'client-community-connection-actions');
        if (connection.status === 'accepted') {
          const summary = props.get(peer);
          card.append(field('small', `${summary?.received_count || 0} props received`));
          const give = field('button', summary?.sent_today ? 'Props sent today' : 'Give props 👏');
          give.type = 'button';
          give.disabled = Boolean(summary?.sent_today);
          give.addEventListener('click', () => void giveProps(peer));
          actions.append(give);
          const form = field('div', '', 'client-community-challenge-form');
          const metric = document.createElement('select');
          for (const [value, label] of [['workouts', 'Workouts'], ['gym_visits', 'Gym visits']]) {
            const option = document.createElement('option'); option.value = value; option.textContent = label; metric.append(option);
          }
          metric.value = 'workouts';
          metric.setAttribute('aria-label', `Challenge ${name} on`);
          const target = document.createElement('select');
          for (let value = 1; value <= 7; value++) {
            const option = document.createElement('option'); option.value = String(value); option.textContent = `${value} per week`; target.append(option);
          }
          target.value = '3'; target.setAttribute('aria-label', 'Weekly target');
          const send = field('button', 'Send challenge'); send.type = 'button';
          send.addEventListener('click', () => void perform(() => client.rpc('community_create_challenge',
            { p_connection_id: connection.id, p_metric: metric.value, p_target_count: Number(target.value) }), 'Challenge sent.'));
          form.append(metric, target, send);
          card.append(form);
        }
        if (incoming) {
          const accept = field('button', 'Accept');
          accept.type = 'button';
          accept.addEventListener('click', () => void changeConnection('community_accept_connection', connection.id));
          actions.append(accept);
        }
        const remove = field('button', incoming ? 'Decline' : connection.status === 'pending' ? 'Cancel invite' : 'Remove');
        remove.type = 'button';
        remove.addEventListener('click', () => void changeConnection('community_remove_connection', connection.id));
        actions.append(remove);
        card.append(actions);
        list.append(card);
      }
    }

    async function refresh() {
      if (!client || !userId || preview) return;
      const id = userId, version = ++generation;
      message('Loading Community…');
      void refreshPublic(id, version);
      void refreshWall(id, version);
      try {
        const [profileResult, preferenceResult] = await Promise.all([
          client.from('client_community_profiles').select('user_id,display_name,avatar_id,invite_code').eq('user_id', id).maybeSingle(),
          client.from('client_community_preferences')
            .select('xp_opt_in,badges_opt_in,workout_count_opt_in,gym_visits_opt_in,public_progress_opt_in')
            .eq('user_id', id).maybeSingle()
        ]);
        if (profileResult.error) throw profileResult.error;
        if (preferenceResult.error) throw preferenceResult.error;
        if (!current(id, version)) return;
        profile = profileResult.data;
        preferences = preferenceResult.data;
        profileEditor.hidden = false;
        join.hidden = Boolean(profile);
        member.hidden = !profile;
        if (!profile) {
          list.replaceChildren(); chooseAvatar('strength');
          renderChallenges([]);
          message('Choose a nickname and avatar to join Community.'); return;
        }
        codeOutput.textContent = profile.invite_code;
        nameInput.value = profile.display_name;
        chooseAvatar(profile.avatar_id);
        const { data: rows, error: connectionError } = await client.from('client_community_connections')
          .select('id,user_a,user_b,requested_by,status').or(`user_a.eq.${id},user_b.eq.${id}`);
        if (connectionError) throw connectionError;
        const connections = rows || [];
        const peerIds = connections.map(row => row.user_a === id ? row.user_b : row.user_a);
        const acceptedIds = connections.filter(row => row.status === 'accepted')
          .map(row => row.user_a === id ? row.user_b : row.user_a);
        const [profilePeers, shared, propsResult, challengeResult] = await Promise.all([
          peerIds.length ? client.from('client_community_profiles').select('user_id,display_name,avatar_id').in('user_id', peerIds) : { data: [], error: null },
          acceptedIds.length ? client.rpc('community_shared_progress') : { data: [], error: null },
          client.rpc('community_props_summary'),
          client.rpc('community_challenge_summary')
        ]);
        if (profilePeers.error || shared.error || propsResult.error) throw profilePeers.error || shared.error || propsResult.error;
        if (!current(id, version)) return;
        const props = new Map((propsResult.data || []).map(row => [row.user_id, row]));
        ownProps.textContent = String(props.get(id)?.received_count || 0);
        renderConnections(connections, new Map((profilePeers.data || []).map(row => [row.user_id, row])),
          new Map((shared.data || []).map(row => [row.user_id, row])), props);
        if (challengeResult.error) challengeStatus.textContent = 'Challenges could not load. Try opening Community again.';
        else { renderChallenges(challengeResult.data || []); challengeStatus.textContent = ''; }
        message('Only accepted connections can see milestones you choose to share.');
        void publish();
      } catch (_) {
        if (current(id, version)) message('Community could not load. Try opening this section again.');
      }
    }

    async function perform(action, success) {
      if (busy || !client || !userId || preview) return;
      busy = true;
      message('Saving…');
      const id = userId;
      try {
        const result = await action();
        if (result.error) throw result.error;
        if (id !== userId) return;
        message(success);
        await refresh();
      } catch (error) {
        if (id === userId) {
          const detail = String(error?.message || '');
          message(/^(Invite code not found|A connection or invitation already exists|Join Community before sending an invitation|An active challenge already exists for this goal)/.test(detail)
            ? detail : 'Could not save. Please try again.');
        }
      } finally { busy = false; }
    }

    function changeConnection(rpc, connectionId) {
      void perform(() => client.rpc(rpc, { p_connection_id: connectionId }), 'Connection updated.');
    }
    async function giveProps(peer) {
      if (busy || !client || !userId || preview) return;
      busy = true; message('Sending props…');
      const id = userId;
      try {
        const { data, error } = await client.rpc('community_give_props', { p_receiver_id: peer });
        if (error) throw error;
        if (id !== userId) return;
        await refresh();
        message(data ? 'Props sent!' : 'You already sent props today.');
      } catch (_) {
        if (id === userId) message('Could not send props. Please try again.');
      } finally { busy = false; }
    }

    panel.querySelector('[data-community-join-button]').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (name.length < 2 || name.length > 40 || !selectedAvatar) { message('Use a nickname between 2 and 40 characters and choose an avatar.'); return; }
      void perform(() => client.from('client_community_profiles')
        .insert({ user_id: userId, display_name: name, avatar_id: selectedAvatar }), 'Welcome to Community.');
    });
    panel.querySelector('[data-community-profile-save]').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (name.length < 2 || name.length > 40 || !selectedAvatar) { message('Use a nickname between 2 and 40 characters and choose an avatar.'); return; }
      void perform(() => client.from('client_community_profiles')
        .update({ display_name: name, avatar_id: selectedAvatar }).eq('user_id', userId), 'Profile updated.');
    });
    panel.querySelector('[data-community-invite]').addEventListener('click', () => {
      const code = codeInput.value.trim().toUpperCase();
      if (!/^[A-F0-9]{16}$/.test(code)) { message('Enter the 16-character invite code.'); return; }
      void perform(() => client.rpc('community_request_connection', { p_invite_code: code }), 'Invitation sent.');
      codeInput.value = '';
    });
    panel.querySelector('[data-community-copy]').addEventListener('click', async () => {
      try { await root.navigator.clipboard.writeText(profile?.invite_code || ''); message('Invite code copied.'); }
      catch (_) { message('Copy the code shown above to share it.'); }
    });
    panel.querySelector('[data-community-rotate]').addEventListener('click', () => {
      void perform(() => client.rpc('community_rotate_invite_code'), 'New invite code ready.');
    });
    panel.querySelector('[data-community-leave]').addEventListener('click', async () => {
      if (!root.confirm('Leave Community and remove all your connections?')) return;
      await perform(async () => {
        const choice = await client.from('client_community_preferences')
          .update({ xp_opt_in: false, badges_opt_in: false, workout_count_opt_in: false,
            gym_visits_opt_in: false, progress_opt_in: false, public_progress_opt_in: false,
            wall_activity_opt_in: false, daily_challenge_opt_in: false,
            weekly_challenge_opt_in: false }).eq('user_id', userId);
        if (choice.error) return choice;
        return client.from('client_community_profiles').delete().eq('user_id', userId);
      }, 'You left Community.');
      if (!profile) {
        for (const selector of ['#client-community-share-xp', '#client-community-share-badges',
          '#client-community-share-workouts', '#client-community-share-gym-visits', '#client-community-share-public',
          '#client-community-share-wall-activity', '#client-community-share-daily', '#client-community-share-weekly']) {
          document.querySelector(selector).checked = false;
        }
      }
    });

    return {
      configure(nextClient, nextUserId, isPreview) {
        generation++;
        client = nextClient; userId = String(nextUserId || ''); preview = Boolean(isPreview);
        profile = null; preferences = null; snapshot = null; published = ''; wallBusy = false;
        profileEditor.hidden = true; join.hidden = true; member.hidden = true; list.replaceChildren();
        feedList?.replaceChildren(); wallList?.replaceChildren(); challengeList?.replaceChildren();
        if (preview) {
          if (wallStatus) wallStatus.textContent = 'The FWB Wall is available when the client signs in.';
          message('Connections are available only when the client signs in.'); return;
        }
        if (!client || !userId) {
          if (wallStatus) wallStatus.textContent = 'Sign in to see the FWB Wall.';
          message('Sign in to join Community.'); return;
        }
        void refresh();
      },
      refresh,
      syncAchievements(nextSnapshot) { snapshot = nextSnapshot; void publish(); }
    };
  }

  const api = { achievementProjection, customAvatarID, avatarEmoji, mount };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.FWB_COMMUNITY_AVATAR = { customAvatarID, emojiFor: avatarEmoji };
  if (root.document) root.FWB_COMMUNITY_CONNECTIONS = mount(root.document);
})(typeof window !== 'undefined' ? window : globalThis);
