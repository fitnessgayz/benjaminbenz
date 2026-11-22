/* Client Community: public summaries and private connections. Raw activity stays server-side. */
(function attachCommunityConnections(root) {
  'use strict';
  const avatars = { strength: '💪', runner: '🏃', cycling: '🚴', boxing: '🥊',
    yoga: '🧘', swimming: '🏊', martial: '🥋', star: '⭐', lifting: '🏋️',
    walking: '🚶', hiking: '🥾', basketball: '🏀', soccer: '⚽', tennis: '🎾',
    rowing: '🚣', climbing: '🧗' };

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
    const customAvatar = panel.querySelector('#client-community-custom-emoji');
    const photoOptions = panel.querySelector('[data-community-photo-options]');
    const photoCurrent = panel.querySelector('[data-community-photo-current]');
    let client = null, userId = '', preview = false, generation = 0;
    let profile = null, preferences = null, snapshot = null, published = '', busy = false, wallBusy = false;
    let selectedAvatar = 'strength';
    let acceptedCount = 0, connected = [], photoPath = null, photoMode = 'keep', photoSupported = false;

    const socialAPI = root.FWB_COMMUNITY_SOCIAL;
    const socialPanel = document.querySelector('[data-client-dashboard-panel="community"]');
    const social = socialAPI && socialPanel && socialAPI.mount(document, socialPanel, {
      openCircles: () => root.FWB_CLIENT_COMMUNITY?.showView('connections', true),
      requestCircle: owner => perform(() => client.rpc('community_request_circle', { p_member_id: owner }), 'Squad request sent.')
    });
    const avatarSymbol = id => socialAPI?.avatarSymbol(id) || avatars[id] || avatars.strength;

    const current = (id, version) => id === userId && version === generation;
    const message = text => { status.textContent = text; };
    const field = (tag, text, className = '') => {
      const node = document.createElement(tag);
      node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    function updateAcceptedCount(rows, force = false) {
      const count = rows.filter(row => row.status === 'accepted').length;
      if (count === acceptedCount && !force) return;
      acceptedCount = count;
      document.querySelectorAll?.('[data-client-circle-count]').forEach(node => { node.textContent = String(count); });
      if (typeof root.CustomEvent === 'function') document.dispatchEvent?.(new root.CustomEvent('fwb:circle-count-updated', { detail: { count } }));
    }
    function chooseAvatar(id) {
      const custom = typeof id === 'string' && id.startsWith('emoji:') ? socialAPI?.customEmoji(id.slice(6)) : '';
      selectedAvatar = custom ? 'emoji:' + custom : Object.hasOwn(avatars, id) ? id : 'strength';
      if (customAvatar) customAvatar.value = custom || '';
      avatarButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.communityAvatar === selectedAvatar)));
      if (extraAvatars.some(button => button.dataset.communityAvatar === selectedAvatar)) setMoreAvatars(true);
    }
    function setMoreAvatars(open) {
      extraAvatars.forEach(button => { button.hidden = !open; });
      moreAvatars.setAttribute('aria-expanded', String(open));
      moreAvatars.textContent = open ? 'Show fewer avatars' : 'Choose more avatars';
    }
    moreAvatars.addEventListener('click', () => setMoreAvatars(moreAvatars.getAttribute('aria-expanded') !== 'true'));
    avatarButtons.forEach(button => button.addEventListener('click', () => chooseAvatar(button.dataset.communityAvatar)));
    customAvatar?.addEventListener('input', () => {
      const emoji = socialAPI?.customEmoji(customAvatar.value);
      if (emoji) chooseAvatar('emoji:' + emoji);
    });

    function updatePhotoOptions() {
      if (!photoOptions || !photoCurrent) return;
      photoOptions.hidden = !photoSupported;
      photoCurrent.textContent = photoMode === 'account' ? 'Account photo selected for your next save'
        : photoMode === 'emoji' || !photoPath ? 'Using an emoji' : 'Using your shared photo';
    }

    panel.querySelector('[data-community-use-photo]')?.addEventListener('click', () => {
      if (photoSupported) { photoMode = 'account'; updatePhotoOptions(); }
    });
    panel.querySelector('[data-community-use-emoji]')?.addEventListener('click', () => {
      photoMode = 'emoji'; updatePhotoOptions();
    });

    async function loadPhoto(requestClient, owner, version) {
      if (!photoOptions || !requestClient.storage || !root.FWB_PROFILE_PHOTO_STORE) return;
      try {
        const result = await requestClient.rpc('community_avatar_paths', { p_user_ids: [owner] });
        if (!current(owner, version)) return;
        photoSupported = !result.error && Array.isArray(result.data);
        const path = photoSupported ? result.data.find(row => row.user_id === owner)?.avatar_photo_path : null;
        photoPath = socialAPI.avatarPath(path, owner) ? path : null;
        updatePhotoOptions();
      } catch (_) { if (current(owner, version)) { photoSupported = false; updatePhotoOptions(); } }
    }

    async function savePhotoProfile(displayName) {
      const owner = userId, api = client;
      const previous = photoPath;
      const storage = api.storage.from(socialAPI.bucket);
      let path = photoMode === 'emoji' ? null : previous;
      let candidate;
      if (photoMode === 'account') {
        const store = root.FWB_PROFILE_PHOTO_STORE.createStore({ supabaseClient: api, userId: owner });
        const { blob } = await store.load();
        if (!blob) throw new Error('Add a photo to your account before using it here.');
        if (userId !== owner || client !== api || preview) return { error: new Error('Account changed.') };
        candidate = owner + '/' + root.crypto.randomUUID().toLowerCase() + '.jpg';
        const result = await storage.upload(candidate, blob, { contentType: 'image/jpeg', cacheControl: '60', upsert: false });
        if (result.error) return result;
        path = candidate;
      }
      if (userId !== owner || client !== api || preview) return { error: new Error('Account changed.') };
      const params = { p_display_name: displayName, p_avatar_id: selectedAvatar, p_avatar_photo_path: path };
      const result = await api.rpc('community_save_avatar_profile', params);
      if (result.error) {
        if (candidate && userId === owner && client === api) {
          const checked = await api.rpc('community_avatar_paths', { p_user_ids: [owner] });
          if (!checked.error && Array.isArray(checked.data) && !checked.data.some(row => row.avatar_photo_path === candidate)) {
            void storage.remove([candidate]);
          }
        }
        return result;
      }
      if (userId === owner && client === api) {
        photoPath = path;
        photoMode = 'keep';
        if (previous && previous !== path) void storage.remove([previous]);
      }
      return result;
    }

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
        card.append(field('span', avatarSymbol(entry.avatar_id), 'client-community-avatar'));
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
      if (social) return social.refreshFeed();
      if (!wallList || !wallStatus) return;
      wallStatus.textContent = 'Loading the FWB Wall…';
      const { data, error } = await client.rpc('community_wall_feed');
      if (!current(id, version)) return;
      wallList.replaceChildren();
      if (error) { wallStatus.textContent = 'The FWB Wall could not load. Try opening Community again.'; return; }
      for (const event of data || []) {
        const card = field('article', '', 'client-community-wall-card');
        const heading = field('div', '', 'client-community-wall-heading');
        heading.append(field('span', avatars[event.avatar_id] || avatars.strength, 'client-community-avatar'));
        heading.append(field('strong', event.nickname));
        const date = new Date(event.occurred_at);
        if (!Number.isNaN(date.getTime())) {
          const time = field('time', date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
          time.dateTime = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
          heading.append(time);
        }
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
        challengeList.append(field('p', 'No challenges yet. Choose someone from your Squad to start one.'));
        return;
      }
      for (const challenge of rows) {
        const card = field('article', '', 'client-community-challenge-card');
        card.append(field('strong', `${avatarSymbol(challenge.peer_avatar_id)} ${challenge.peer_nickname}`));
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
        list.append(field('p', 'No one in your Squad yet. Add someone from the Feed or use an invite code.'));
        return;
      }
      const photos = [];
      for (const connection of connections) {
        const peer = connection.user_a === userId ? connection.user_b : connection.user_a;
        const peerProfile = profiles.get(peer);
        const name = peerProfile?.display_name || 'Community member';
        const card = field('article', '', 'client-community-connection');
        const avatar = field('span', avatarSymbol(peerProfile?.avatar_id), 'client-community-avatar client-social-avatar');
        photos.push([peer, avatar]);
        card.append(avatar);
        card.append(field('strong', name));
        const incoming = connection.status === 'pending' && connection.requested_by !== userId;
        const statusLabel = connection.status === 'accepted' ? 'In your Squad' : incoming ? 'Squad request received' : 'Squad request sent';
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
          send.addEventListener('click', async () => {
            const saved = await perform(() => client.rpc('community_create_challenge',
              { p_connection_id: connection.id, p_metric: metric.value, p_target_count: Number(target.value) }), 'Challenge sent.');
            if (saved && social) root.FWB_CLIENT_COMMUNITY?.showView('challenges', true);
          });
          form.append(metric, target, send);
          card.append(form);
        }
        if (incoming) {
          const accept = field('button', 'Accept');
          accept.type = 'button';
          accept.addEventListener('click', () => void changeConnection('community_accept_connection', connection.id));
          actions.append(accept);
        }
        const remove = field('button', incoming ? 'Decline' : connection.status === 'pending' ? 'Cancel request' : 'Remove from Squad');
        remove.type = 'button';
        remove.addEventListener('click', () => void changeConnection('community_remove_connection', connection.id));
        actions.append(remove);
        card.append(actions);
        list.append(card);
      }
      void social?.enhancePhotos(photos);
    }

    async function readPeerProfiles(peerIds) {
      if (!peerIds.length) return { data: [], error: null };
      if (social) {
        const result = await client.rpc('community_connection_peer_profiles');
        if (result.error?.code !== 'PGRST202') return result;
      }
      return client.from('client_community_profiles').select('user_id,display_name,avatar_id').in('user_id', peerIds);
    }

    async function refresh() {
      if (!client || !userId || preview) return;
      const id = userId, version = ++generation;
      message('Loading your Squad…');
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
        void loadPhoto(client, id, version);
        social?.setMembers(profile, connected);
        profileEditor.hidden = false;
        join.hidden = Boolean(profile);
        member.hidden = !profile;
        if (!profile) {
          connected = [];
          updateAcceptedCount(connected);
          social?.setMembers(null, connected);
          list.replaceChildren(); chooseAvatar('strength');
          renderChallenges([]);
          message('Choose a nickname and avatar for your Social profile.'); return;
        }
        codeOutput.textContent = profile.invite_code;
        nameInput.value = profile.display_name;
        chooseAvatar(profile.avatar_id);
        const { data: rows, error: connectionError } = await client.from('client_community_connections')
          .select('id,user_a,user_b,requested_by,status').or(`user_a.eq.${id},user_b.eq.${id}`);
        if (connectionError) throw connectionError;
        const connections = rows || [];
        if (!current(id, version)) return;
        connected = connections;
        updateAcceptedCount(connected);
        social?.setMembers(profile, connected);
        const peerIds = connections.map(row => row.user_a === id ? row.user_b : row.user_a);
        const acceptedIds = connections.filter(row => row.status === 'accepted')
          .map(row => row.user_a === id ? row.user_b : row.user_a);
        const [profilePeers, shared, propsResult, challengeResult] = await Promise.all([
          readPeerProfiles(peerIds),
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
        if (challengeResult.error) challengeStatus.textContent = 'Challenges could not load. Try opening Social again.';
        else { renderChallenges(challengeResult.data || []); challengeStatus.textContent = ''; }
        message('Squad members can see the milestones you choose to share with them.');
        void publish();
      } catch (_) {
        if (current(id, version)) message('Your Squad could not load. Try opening this section again.');
      }
    }

    async function perform(action, success) {
      if (busy || !client || !userId || preview) return false;
      busy = true;
      message('Saving…');
      const id = userId;
      try {
        const result = await action();
        if (result.error) throw result.error;
        if (id !== userId) return false;
        await refresh();
        if (id !== userId) return false;
        message(success);
        return true;
      } catch (error) {
        if (id === userId) {
          const detail = String(error?.message || '');
          message(/^(Invite code not found|A connection or invitation already exists|Join Community before sending an invitation|An active challenge already exists for this goal|Add a photo to your account)/.test(detail)
            ? detail : 'Could not save. Please try again.');
        }
        return false;
      } finally { busy = false; }
    }

    function changeConnection(rpc, connectionId) {
      void perform(() => client.rpc(rpc, { p_connection_id: connectionId }), 'Squad updated.');
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

    function saveProfile(joining) {
      const name = nameInput.value.trim();
      if (name.length < 2 || name.length > 40) { message('Use a nickname between 2 and 40 characters.'); return; }
      if (customAvatar?.value.trim()) {
        const emoji = socialAPI?.customEmoji(customAvatar.value);
        if (!emoji) { message('Enter one emoji for your avatar.'); return; }
        selectedAvatar = 'emoji:' + emoji;
      }
      void perform(() => {
        if (photoSupported) return savePhotoProfile(name);
        const values = { display_name: name, avatar_id: selectedAvatar };
        return joining ? client.from('client_community_profiles').insert({ user_id: userId, ...values })
          : client.from('client_community_profiles').update(values).eq('user_id', userId);
      }, joining ? 'Welcome to Social.' : 'Social profile updated.');
    }
    panel.querySelector('[data-community-join-button]').addEventListener('click', () => saveProfile(true));
    panel.querySelector('[data-community-profile-save]').addEventListener('click', () => saveProfile(false));
    panel.querySelector('[data-community-invite]').addEventListener('click', () => {
      const code = codeInput.value.trim().toUpperCase();
      if (!/^[A-F0-9]{16}$/.test(code)) { message('Enter the 16-character invite code.'); return; }
      void perform(() => client.rpc('community_request_connection', { p_invite_code: code }), 'Squad request sent.');
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
      if (!root.confirm('Leave Social and remove all Squad members?')) return;
      await perform(async () => {
        const choice = await client.from('client_community_preferences')
          .update({ xp_opt_in: false, badges_opt_in: false, workout_count_opt_in: false,
            gym_visits_opt_in: false, progress_opt_in: false, public_progress_opt_in: false,
            wall_activity_opt_in: false, daily_challenge_opt_in: false,
            weekly_challenge_opt_in: false }).eq('user_id', userId);
        if (choice.error) return choice;
        return client.from('client_community_profiles').delete().eq('user_id', userId);
      }, 'You left Social.');
      if (!profile) {
        for (const selector of ['#client-community-share-xp', '#client-community-share-badges',
          '#client-community-share-workouts', '#client-community-share-gym-visits', '#client-community-share-public',
          '#client-community-share-wall-activity', '#client-community-share-daily', '#client-community-share-weekly']) {
          const control = document.querySelector(selector);
          if (control) control.checked = false;
        }
      }
    });

    return {
      configure(nextClient, nextUserId, isPreview) {
        generation++;
        client = nextClient; userId = String(nextUserId || ''); preview = Boolean(isPreview);
        profile = null; preferences = null; snapshot = null; published = ''; wallBusy = false;
        connected = []; photoPath = null; photoMode = 'keep'; photoSupported = false;
        updatePhotoOptions(); updateAcceptedCount([], true);
        social?.configure(client, userId, preview);
        profileEditor.hidden = true; join.hidden = true; member.hidden = true; list.replaceChildren();
        feedList?.replaceChildren(); wallList?.replaceChildren(); challengeList?.replaceChildren();
        if (preview) {
          if (wallStatus) wallStatus.textContent = 'The Feed is available when the client signs in.';
          message('Sign in to view your Squad.'); return;
        }
        if (!client || !userId) {
          if (wallStatus) wallStatus.textContent = 'Sign in to see the Feed.';
          message('Sign in to set up your Social profile.'); return;
        }
        void refresh();
        void social?.refreshBoard();
      },
      refresh,
      refreshBoard() { return social?.refreshBoard(); },
      getAcceptedCount() { return acceptedCount; },
      syncAchievements(nextSnapshot) { snapshot = nextSnapshot; void publish(); }
    };
  }

  const api = { achievementProjection, mount };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) root.FWB_COMMUNITY_CONNECTIONS = mount(root.document);
})(typeof window !== 'undefined' ? window : globalThis);
