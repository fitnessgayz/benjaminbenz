/* Private, opt-in sharing choices for the client Community preview. */
(function attachClientCommunity(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) root.FWB_CLIENT_COMMUNITY = api.mount(root.document);
}(typeof window !== 'undefined' ? window : globalThis, function createClientCommunity(root) {
  'use strict';
  const views = {
    leaderboard: {
      title: 'Celebrate Your Consistency',
      body: 'Compare XP, levels, and badges with other clients who choose to join. Weekly rankings give everyone a fresh start.'
    },
    connections: {
      title: 'Train With Your People',
      body: 'Exchange invite codes, accept connections, and choose whether to share XP and badges.'
    },
    challenges: {
      title: 'Move Together',
      body: 'Join friendly challenges built around showing up, moving well, and celebrating progress.'
    }
  };

  function mount(document) {
    const panel = document.querySelector('[data-client-dashboard-panel="community"]');
    if (!panel) return { configure() {} };
    const badges = panel.querySelector('#client-community-share-badges');
    const progress = panel.querySelector('#client-community-share-progress');
    const save = panel.querySelector('[data-community-save]');
    const status = panel.querySelector('#client-community-consent-status');
    let client = null, userId = '', preview = false, generation = 0, busy = false;

    function showView(name) {
      const view = views[name] || views.leaderboard;
      panel.querySelectorAll('[data-community-view]').forEach((button) => {
        const active = button.dataset.communityView === name;
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
      });
      panel.querySelector('#client-community-feature-title').textContent = view.title;
      panel.querySelector('#client-community-feature-body').textContent = view.body;
      const connections = panel.querySelector('[data-community-connections]');
      const feature = panel.querySelector('.client-community-feature');
      if (connections && feature) {
        connections.hidden = name !== 'connections';
        feature.hidden = name === 'connections';
        if (name === 'connections') void root.FWB_COMMUNITY_CONNECTIONS?.refresh();
      }
    }

    function setControls(disabled) {
      badges.disabled = disabled;
      progress.disabled = disabled;
      save.disabled = disabled;
    }

    panel.addEventListener('click', (event) => {
      const view = event.target.closest('[data-community-view]');
      if (view) { showView(view.dataset.communityView); return; }
      if (event.target.closest('[data-community-save]')) void saveChoices();
    });
    panel.addEventListener('keydown', (event) => {
      const selected = event.target.closest('[data-community-view]');
      if (!selected || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const buttons = Array.from(panel.querySelectorAll('[data-community-view]'));
      const current = buttons.indexOf(selected);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      showView(buttons[next].dataset.communityView);
      buttons[next].focus();
    });
    panel.addEventListener('change', (event) => {
      if (event.target === badges || event.target === progress) status.textContent = 'You have unsaved sharing choices.';
    });

    async function loadChoices(request) {
      try {
        const { data, error } = await request.client.from('client_community_preferences')
          .select('badges_opt_in,progress_opt_in').eq('user_id', request.userId).maybeSingle();
        if (error) throw error;
        if (request.generation !== generation || userId !== request.userId) return;
        badges.checked = data?.badges_opt_in === true;
        progress.checked = data?.progress_opt_in === true;
        status.textContent = data
          ? 'Your sharing choices are saved. Accepted connections can see only what you enable.'
          : 'Your activity is private. Both sharing choices are off.';
        setControls(false);
      } catch (_) {
        if (request.generation !== generation) return;
        status.textContent = 'Sharing choices could not load. Try again later.';
        setControls(true);
      }
    }

    async function saveChoices() {
      if (busy || preview || !client || !userId) return;
      const owner = userId, request = ++generation;
      const values = { user_id: owner, badges_opt_in: badges.checked, progress_opt_in: progress.checked };
      busy = true; setControls(true); status.textContent = 'Saving your sharing choices…';
      try {
        const { data, error } = await client.from('client_community_preferences')
          .upsert(values, { onConflict: 'user_id' })
          .select('user_id,badges_opt_in,progress_opt_in').single();
        if (error || !data || data.user_id !== owner) throw error || new Error('No choices were saved.');
        if (request !== generation || owner !== userId) return;
        badges.checked = data.badges_opt_in === true;
        progress.checked = data.progress_opt_in === true;
        status.textContent = 'Saved. You can change either choice any time.';
        void root.FWB_COMMUNITY_CONNECTIONS?.refresh();
      } catch (_) {
        if (request === generation && owner === userId) status.textContent = 'Could not save your sharing choices. Please try again.';
      } finally {
        busy = false;
        if (request === generation && owner === userId) setControls(false);
      }
    }

    showView('connections');
    setControls(true);
    return { configure(nextClient, nextUserId, isPreview) {
      const id = String(nextUserId || '').trim();
      if (id === userId && client === nextClient && preview === Boolean(isPreview)) return;
      generation++;
      client = nextClient; userId = id; preview = Boolean(isPreview);
      badges.checked = false; progress.checked = false;
      setControls(true);
      if (preview) { status.textContent = 'Sharing choices are available only when the client signs in.'; return; }
      if (!client || !userId) { status.textContent = 'Sign in to manage sharing choices.'; return; }
      status.textContent = 'Loading your sharing choices…';
      void loadChoices({ client, userId, generation });
    } };
  }

  return { views, mount };
}));
