/* Opt-in sharing choices for client Community. */
(function attachClientCommunity(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) root.FWB_CLIENT_COMMUNITY = api.mount(root.document);
}(typeof window !== 'undefined' ? window : globalThis, function createClientCommunity(root) {
  'use strict';
  const views = {
    wall: {
      title: 'FWB Wall',
      body: 'Celebrate the progress your community chooses to share.'
    },
    leaderboard: {
      title: 'Celebrate Your Consistency',
      body: 'Compare XP, levels, and badges with other clients who choose to join. Weekly rankings give everyone a fresh start.'
    },
    connections: {
      title: 'Train With Your People',
      body: 'Exchange invite codes, accept connections, and choose which milestones to share.'
    },
    challenges: {
      title: 'Move Together',
      body: 'Join friendly challenges built around showing up, moving well, and celebrating progress.'
    }
  };

  function mount(document) {
    const panel = document.querySelector('[data-client-dashboard-panel="community"]');
    if (!panel) return { configure() {} };
    const choices = {
      xp: panel.querySelector('#client-community-share-xp'),
      badges: panel.querySelector('#client-community-share-badges'),
      workouts: panel.querySelector('#client-community-share-workouts'),
      gymVisits: panel.querySelector('#client-community-share-gym-visits'),
      publicProgress: panel.querySelector('#client-community-share-public'),
      wallActivity: panel.querySelector('#client-community-share-wall-activity'),
      daily: panel.querySelector('#client-community-share-daily'),
      weekly: panel.querySelector('#client-community-share-weekly')
    };
    const save = panel.querySelector('[data-community-save]');
    const status = panel.querySelector('#client-community-consent-status');
    let client = null, userId = '', preview = false, generation = 0, busy = false;
    let savedChoices = { xp: false, badges: false, workouts: false, gymVisits: false,
      publicProgress: false, wallActivity: false, daily: false, weekly: false };
    const dailyCard = panel.querySelector('[data-daily-card]');
    const dailyPicker = panel.querySelector('[data-daily-picker]');
    const dailyStatus = panel.querySelector('[data-daily-status]');
    let dailyAssignment = null, dailyBusy = false, dailyVersion = 0;
    const localDay = () => {
      const date = new Date();
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    };

    function renderDaily(row) {
      if (!dailyCard) return;
      dailyAssignment = row;
      dailyCard.hidden = !row;
      dailyPicker.hidden = Boolean(row);
      if (!row) return;
      panel.querySelector('[data-daily-category]').textContent = row.category;
      panel.querySelector('[data-daily-title]').textContent = row.title;
      panel.querySelector('[data-daily-instruction]').textContent = row.instruction;
      const complete = panel.querySelector('[data-daily-complete]');
      complete.hidden = row.completion_kind !== 'self_report' || row.completed;
      panel.querySelector('[data-daily-reroll]').hidden = row.completed || row.rerolls_used > 0;
      panel.querySelector('[data-daily-refresh]').hidden = row.completion_kind === 'self_report' || row.completed;
      dailyStatus.textContent = row.completed ? 'Completed today. Nice work!' : row.completion_kind === 'self_report'
        ? 'Mark this complete when you finish.' : 'Your logged workout or gym check-in will complete this automatically.';
    }

    async function dailyAction(action, trainingDay = false) {
      if (!dailyCard || dailyBusy || !client || !userId || preview) return;
      dailyBusy = true;
      const version = ++dailyVersion;
      dailyStatus.textContent = 'Loading today’s challenge…';
      try {
        if (action === 'complete') {
          const result = await client.rpc('community_complete_daily_challenge', { p_local_day: localDay() });
          if (result.error) throw result.error;
        }
        const { data, error } = await client.rpc('community_daily_challenge', {
          p_local_day: localDay(), p_action: action === 'reroll' ? 'reroll' : 'draw',
          p_training_day: trainingDay
        });
        if (error) throw error;
        if (version !== dailyVersion) return;
        renderDaily(data?.[0] || null);
        void loadDailyWins();
      } catch (_) {
        if (version === dailyVersion) dailyStatus.textContent = 'Could not load the challenge. Join Community, then try again.';
      } finally { dailyBusy = false; }
    }

    panel.querySelectorAll('[data-daily-draw]').forEach(button => button.addEventListener('click',
      () => void dailyAction('draw', button.dataset.dailyDraw === 'true')));
    panel.querySelector('[data-daily-reroll]')?.addEventListener('click',
      () => void dailyAction('reroll', dailyAssignment?.training_day === true));
    panel.querySelector('[data-daily-complete]')?.addEventListener('click', () => void dailyAction('complete'));
    panel.querySelector('[data-daily-refresh]')?.addEventListener('click',
      () => void dailyAction('draw', dailyAssignment?.training_day === true));

    function applyChoices(values) {
      savedChoices = {
        xp: values.xp_opt_in === true,
        badges: values.badges_opt_in === true,
        workouts: values.workout_count_opt_in === true,
        gymVisits: values.gym_visits_opt_in === true,
        publicProgress: values.public_progress_opt_in === true,
        wallActivity: values.wall_activity_opt_in === true,
        daily: values.daily_challenge_opt_in === true,
        weekly: values.weekly_challenge_opt_in === true
      };
      Object.entries(savedChoices).forEach(([key, enabled]) => { if (choices[key]) choices[key].checked = enabled; });
    }

    function showView(name) {
      const view = views[name] || views.wall;
      panel.querySelectorAll('[data-community-view]').forEach((button) => {
        const active = button.dataset.communityView === name;
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
      });
      panel.querySelector('#client-community-feature-title').textContent = view.title;
      panel.querySelector('#client-community-feature-body').textContent = view.body;
      const connections = panel.querySelector('[data-community-connections]');
      const challenges = panel.querySelector('[data-community-challenges]');
      const wall = panel.querySelector('[data-community-wall]');
      const feature = panel.querySelector('.client-community-feature');
      if (connections && feature) {
        if (wall) wall.hidden = name !== 'wall';
        connections.hidden = name !== 'connections';
        if (challenges) challenges.hidden = name !== 'challenges';
        feature.hidden = name !== 'leaderboard';
        if (name === 'wall' || name === 'connections' || name === 'challenges') void root.FWB_COMMUNITY_CONNECTIONS?.refresh();
      }
    }

    function setControls(disabled) {
      Object.values(choices).forEach(control => { if (control) control.disabled = disabled; });
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
      if (Object.values(choices).includes(event.target)) status.textContent = 'You have unsaved sharing choices.';
    });

    async function loadChoices(request) {
      try {
        const { data, error } = await request.client.from('client_community_preferences')
          .select('xp_opt_in,badges_opt_in,workout_count_opt_in,gym_visits_opt_in,public_progress_opt_in,wall_activity_opt_in,daily_challenge_opt_in,weekly_challenge_opt_in')
          .eq('user_id', request.userId).maybeSingle();
        if (error) throw error;
        if (request.generation !== generation || userId !== request.userId) return;
        applyChoices(data || {});
        status.textContent = data
          ? 'Your sharing choices are saved. The FWB Wall follows the choices below.'
          : 'Your milestones are private. All sharing choices are off.';
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
      const values = { user_id: owner, xp_opt_in: choices.xp.checked,
        badges_opt_in: choices.badges.checked,
        workout_count_opt_in: choices.workouts.checked,
        gym_visits_opt_in: choices.gymVisits.checked,
        public_progress_opt_in: choices.publicProgress.checked,
        wall_activity_opt_in: choices.wallActivity?.checked === true,
        daily_challenge_opt_in: choices.daily?.checked === true,
        weekly_challenge_opt_in: choices.weekly?.checked === true };
      busy = true; setControls(true); status.textContent = 'Saving your sharing choices…';
      try {
        const { data, error } = await client.from('client_community_preferences')
          .upsert(values, { onConflict: 'user_id' })
          .select('user_id,xp_opt_in,badges_opt_in,workout_count_opt_in,gym_visits_opt_in,public_progress_opt_in,wall_activity_opt_in,daily_challenge_opt_in,weekly_challenge_opt_in').single();
        if (error || !data || data.user_id !== owner) throw error || new Error('No choices were saved.');
        if (request !== generation || owner !== userId) return;
        applyChoices(data);
        status.textContent = values.wall_activity_opt_in && !values.public_progress_opt_in
          ? 'Saved. Turn on public progress and a workout or gym visit choice to post those activities.'
          : 'Saved. You can change these choices any time.';
        void root.FWB_COMMUNITY_CONNECTIONS?.refresh();
      } catch (_) {
        if (request === generation && owner === userId) {
          Object.entries(savedChoices).forEach(([key, enabled]) => { if (choices[key]) choices[key].checked = enabled; });
          status.textContent = 'Could not save your sharing choices. Previous choices restored.';
        }
      } finally {
        busy = false;
        if (request === generation && owner === userId) setControls(false);
      }
    }

    showView('wall');
    setControls(true);
    return { configure(nextClient, nextUserId, isPreview) {
      const id = String(nextUserId || '').trim();
      if (id === userId && client === nextClient && preview === Boolean(isPreview)) return;
      generation++;
      client = nextClient; userId = id; preview = Boolean(isPreview);
      dailyVersion++; renderDaily(null);
      applyChoices({});
      setControls(true);
      if (preview) { status.textContent = 'Sharing choices are available only when the client signs in.'; return; }
      if (!client || !userId) { status.textContent = 'Sign in to manage sharing choices.'; return; }
      status.textContent = 'Loading your sharing choices…';
      void loadChoices({ client, userId, generation });
    } };
  }

  return { views, mount };
}));
