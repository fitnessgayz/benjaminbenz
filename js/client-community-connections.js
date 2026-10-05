/* Invite-only Community connections. Raw training and health records are never queried here. */
(function attachCommunityConnections(root) {
  'use strict';

  function achievementProjection(snapshot) {
    if (!snapshot || !Number.isFinite(snapshot.xp) || !Array.isArray(snapshot.badges)) return null;
    return {
      xp: Math.max(0, Math.floor(snapshot.xp)),
      badge_ids: snapshot.badges.filter(badge => badge.unlocked).map(badge => badge.id).slice(0, 32)
    };
  }

  function mount(document) {
    const panel = document.querySelector('[data-community-connections]');
    if (!panel) return { configure() {}, refresh() {}, syncAchievements() {} };
    const join = panel.querySelector('[data-community-join]');
    const member = panel.querySelector('[data-community-member]');
    const nameInput = panel.querySelector('#client-community-display-name');
    const codeOutput = panel.querySelector('#client-community-own-code');
    const codeInput = panel.querySelector('#client-community-invite-code');
    const list = panel.querySelector('[data-community-connection-list]');
    const status = panel.querySelector('[data-community-connection-status]');
    let client = null, userId = '', preview = false, generation = 0;
    let profile = null, preferences = null, snapshot = null, published = '', busy = false;

    const current = (id, version) => id === userId && version === generation;
    const message = text => { status.textContent = text; };
    const field = (tag, text, className = '') => {
      const node = document.createElement(tag);
      node.textContent = text;
      if (className) node.className = className;
      return node;
    };

    async function publish() {
      const projection = achievementProjection(snapshot);
      if (!profile || !preferences?.badges_opt_in || !projection || !client || preview) return;
      const fingerprint = JSON.stringify(projection);
      if (fingerprint === published) return;
      const id = userId, version = generation;
      const { error } = await client.from('client_community_achievements')
        .upsert({ user_id: id, ...projection, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (!error && current(id, version)) published = fingerprint;
      if (error && current(id, version)) message('Your achievements could not be shared yet. Try opening Community again.');
    }

    function renderConnections(connections, profiles, achievements) {
      list.replaceChildren();
      if (!connections.length) {
        list.append(field('p', 'No invitations yet. Share your code or enter a friend’s code.'));
        return;
      }
      for (const connection of connections) {
        const peer = connection.user_a === userId ? connection.user_b : connection.user_a;
        const name = profiles.get(peer)?.display_name || 'Community member';
        const card = field('article', '', 'client-community-connection');
        card.append(field('strong', name));
        const incoming = connection.status === 'pending' && connection.requested_by !== userId;
        const statusLabel = connection.status === 'accepted' ? 'Connected' : incoming ? 'Invitation received' : 'Invitation sent';
        card.append(field('small', statusLabel));
        const achievement = connection.status === 'accepted' ? achievements.get(peer) : null;
        if (achievement) {
          const count = Array.isArray(achievement.badge_ids) ? achievement.badge_ids.length : 0;
          card.append(field('p', `${achievement.xp} XP · ${count} earned badge${count === 1 ? '' : 's'}`));
          if (count) {
            const titles = achievement.badge_ids.map(id => snapshot?.badges?.find(badge => badge.id === id)?.title || id.replace(/-/g, ' '));
            card.append(field('small', titles.join(' · ')));
          }
        } else if (connection.status === 'accepted') {
          card.append(field('p', 'Achievements are private until this member chooses to share them.'));
        }
        const actions = field('div', '', 'client-community-connection-actions');
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
      try {
        const [profileResult, preferenceResult] = await Promise.all([
          client.from('client_community_profiles').select('user_id,display_name,invite_code').eq('user_id', id).maybeSingle(),
          client.from('client_community_preferences').select('badges_opt_in').eq('user_id', id).maybeSingle()
        ]);
        if (profileResult.error) throw profileResult.error;
        if (preferenceResult.error) throw preferenceResult.error;
        if (!current(id, version)) return;
        profile = profileResult.data;
        preferences = preferenceResult.data;
        join.hidden = Boolean(profile);
        member.hidden = !profile;
        if (!profile) { list.replaceChildren(); message('Join Community to exchange invitations.'); return; }
        codeOutput.textContent = profile.invite_code;
        nameInput.value = profile.display_name;
        const { data: rows, error: connectionError } = await client.from('client_community_connections')
          .select('id,user_a,user_b,requested_by,status').or(`user_a.eq.${id},user_b.eq.${id}`);
        if (connectionError) throw connectionError;
        const connections = rows || [];
        const peerIds = connections.map(row => row.user_a === id ? row.user_b : row.user_a);
        const acceptedIds = connections.filter(row => row.status === 'accepted')
          .map(row => row.user_a === id ? row.user_b : row.user_a);
        const [profilePeers, shared] = await Promise.all([
          peerIds.length ? client.from('client_community_profiles').select('user_id,display_name').in('user_id', peerIds) : { data: [], error: null },
          acceptedIds.length ? client.from('client_community_achievements').select('user_id,xp,badge_ids').in('user_id', acceptedIds) : { data: [], error: null }
        ]);
        if (profilePeers.error || shared.error) throw profilePeers.error || shared.error;
        if (!current(id, version)) return;
        renderConnections(connections, new Map((profilePeers.data || []).map(row => [row.user_id, row])),
          new Map((shared.data || []).map(row => [row.user_id, row])));
        message('Only accepted connections can see achievements you choose to share.');
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
          message(/^(Invite code not found|A connection or invitation already exists|Join Community before sending an invitation)/.test(detail)
            ? detail : 'Could not save. Please try again.');
        }
      } finally { busy = false; }
    }

    function changeConnection(rpc, connectionId) {
      void perform(() => client.rpc(rpc, { p_connection_id: connectionId }), 'Connection updated.');
    }

    panel.querySelector('[data-community-join-button]').addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (name.length < 2 || name.length > 40) { message('Use a display name between 2 and 40 characters.'); return; }
      void perform(() => client.from('client_community_profiles').insert({ user_id: userId, display_name: name }), 'Welcome to Community.');
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
          .update({ badges_opt_in: false, progress_opt_in: false }).eq('user_id', userId);
        if (choice.error) return choice;
        return client.from('client_community_profiles').delete().eq('user_id', userId);
      }, 'You left Community.');
      if (!profile) {
        document.querySelector('#client-community-share-badges').checked = false;
        document.querySelector('#client-community-share-progress').checked = false;
      }
    });

    return {
      configure(nextClient, nextUserId, isPreview) {
        generation++;
        client = nextClient; userId = String(nextUserId || ''); preview = Boolean(isPreview);
        profile = null; preferences = null; snapshot = null; published = '';
        join.hidden = true; member.hidden = true; list.replaceChildren();
        if (preview) { message('Connections are available only when the client signs in.'); return; }
        if (!client || !userId) { message('Sign in to join Community.'); return; }
        void refresh();
      },
      refresh,
      syncAchievements(nextSnapshot) { snapshot = nextSnapshot; void publish(); }
    };
  }

  const api = { achievementProjection, mount };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) root.FWB_COMMUNITY_CONNECTIONS = mount(root.document);
})(typeof window !== 'undefined' ? window : globalThis);
