(function (root) {
  'use strict';
  const prefix = 'gruntr.social.profile-setup-prompt.v1.';
  const categories = ['workouts', 'check_ins', 'achievements'];
  const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  const originPath = '/client-dashboard.html';
  function isSquadRoute(value, origin) {
    try {
      const url = new URL(value, origin);
      return url.origin === origin && url.pathname === originPath &&
        url.searchParams.getAll('tab').join() === 'community' &&
        url.searchParams.getAll('squad').join() === '1';
    } catch (_) { return false; }
  }
  function setupKey(owner) { return prefix + String(owner || '').toLowerCase(); }
  function claimSetup({ owner, profile, store, memory, open }) {
    if (!UUID.test(owner || '') || profile !== false || memory.has(owner)) return false;
    try { if (store()?.getItem(setupKey(owner)) === '1') return false; } catch (_) {}
    if (!open()) return false;
    memory.add(owner);
    try { store()?.setItem(setupKey(owner), '1'); } catch (_) {}
    return true;
  }
  function normalizeSharing(value) {
    if (!value || typeof value !== 'object' || !categories.every(key => {
      const row = value[key];
      return row && typeof row.available === 'boolean' && typeof row.enabled === 'boolean'
        && (row.decided_at === null || typeof row.decided_at === 'string');
    })) return null;
    return { available: value.workouts.available,
      enabled: value.workouts.available && value.workouts.enabled && Boolean(value.workouts.decided_at) };
  }
  function normalizeFeed(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(row => row?.kind === 'workouts' && UUID.test(row.post_id || '') &&
      /^\d{4}-\d{2}-\d{2}$/.test(row.activity_day || '') && row.headline === 'Completed a workout')
      .slice(0, 12).map(row => ({ id: row.post_id, day: row.activity_day, title: 'Completed a workout' }));
  }
  function mount(document) {
    const popup = document.querySelector('[data-gruntr-social-setup]');
    const control = document.querySelector('[data-gruntr-workout-share]');
    const status = document.querySelector('[data-gruntr-sharing-status]');
    const feed = document.querySelector('[data-gruntr-anonymous-feed]');
    if (!popup || !control || !status || !feed) return {};
    const memory = new Set();
    let client, owner = '', platformTab = '', view = 'wall', profile = null;
    let preview = true, scope = 0, reading = 0, saving = false, handledSquad = false;
    let state = null, lastFocus = null;
    let requestController = new AbortController();
    const statusText = 'Automatic sharing is unavailable. Your activity stays private here unless you explicitly share it using another option.';
    const setStatus = (message) => { status.textContent = message; };
    function closeSetup(restoreFocus = true) {
      if (popup.open) popup.close();
      if (restoreFocus && lastFocus?.isConnected) lastFocus.focus?.();
      lastFocus = null;
    }
    function offer() {
      if (!client || preview || platformTab !== 'community' || view !== 'wall' || handledSquad ||
          (document.querySelector('dialog[open]') && !popup.open)) return;
      claimSetup({ owner, profile, store: () => root.localStorage, memory, open: () => {
        if (typeof popup.showModal !== 'function' || !popup.isConnected || popup.open) return false;
        lastFocus = document.activeElement;
        try { popup.showModal(); return popup.open; } catch (_) { return false; }
      } });
    }
    function render() {
      control.disabled = saving || !state?.available || preview || !owner;
      control.checked = Boolean(state?.enabled);
      if (!state?.available) {
        feed.hidden = true;
        feed.replaceChildren();
      }
    }
    async function rpc(name, body, key, revision, signal) {
      const cfg = root.FWB_SUPABASE_CONFIG;
      if (!cfg?.url || !cfg.anonKey || !client?.auth || !key || !UUID.test(key)) throw Error('Unavailable');
      const { data, error } = await client.auth.getSession();
      const session = data?.session;
      if (error || !session?.access_token || session.user?.id !== key ||
          key !== owner || revision !== scope || signal.aborted || preview) throw Error('Unavailable');
      const target = new URL(cfg.url);
      if (target.protocol !== 'https:' || target.username || target.password) throw Error('Unavailable');
      const response = await root.fetch(new URL('/rest/v1/rpc/' + name, target.origin), {
        method: 'POST', headers: { apikey: cfg.anonKey, Authorization: 'Bearer ' + session.access_token,
          'Content-Type': 'application/json' }, body: JSON.stringify(body), signal
      });
      if (!response.ok || key !== owner || revision !== scope || signal.aborted || preview) throw Error('Unavailable');
      return response.json();
    }
    async function refresh() {
      if (!owner || preview || platformTab !== 'community' || saving) return;
      const key = owner, revision = scope, read = ++reading, signal = requestController.signal;
      try {
        const next = normalizeSharing(await rpc('community_get_auto_activity_sharing', {}, key, revision, signal));
        if (key !== owner || revision !== scope || read !== reading) return;
        state = next;
        setStatus(next?.available ? (next.enabled ? 'Automatic workout sharing is on.' : 'Automatic workout sharing is off.') : statusText);
        render();
        if (!next?.available || view !== 'wall' || platformTab !== 'community') return;
        const rows = normalizeFeed(await rpc('community_auto_activity_feed', {}, key, revision, signal));
        if (key !== owner || revision !== scope || read !== reading || view !== 'wall' || platformTab !== 'community') return;
        feed.replaceChildren();
        if (!rows.length) { feed.hidden = true; return; }
        const heading = document.createElement('h3');
        heading.textContent = 'Anonymous workout activity';
        const list = document.createElement('ul');
        for (const row of rows) {
          const item = document.createElement('li');
          item.textContent = row.title + ' · ' + row.day;
          list.append(item);
        }
        feed.append(heading, list);
        feed.hidden = false;
      } catch (_) {
        if (key !== owner || revision !== scope || read !== reading) return;
        state = null; setStatus(statusText); render();
      }
    }
    popup.querySelector('[data-gruntr-profile-later]').addEventListener('click', () => closeSetup());
    popup.querySelector('[data-gruntr-profile-now]').addEventListener('click', () => {
      closeSetup(false);
      root.FWB_CLIENT_COMMUNITY?.showView('connections', true);
      const nickname = document.querySelector('#client-community-display-name');
      if (nickname?.offsetParent) nickname.focus?.();
    });
    popup.addEventListener('cancel', event => {
      event.preventDefault();
      closeSetup();
    });
    control.addEventListener('change', async () => {
      const requested = control.checked, key = owner, revision = scope, signal = requestController.signal;
      if (!state?.available || saving || preview || !key) { render(); return; }
      reading++; saving = true; render();
      try {
        const result = normalizeSharing(await rpc('community_set_auto_activity_sharing',
          { p_category: 'workouts', p_enabled: requested }, key, revision, signal));
        if (key !== owner || revision !== scope) return;
        if (!result?.available || result.enabled !== requested) throw Error('Not saved');
        state = result;
        setStatus(requested ? 'Automatic workout sharing is on.' : 'Automatic workout sharing is off.');
      } catch (_) {
        if (key !== owner || revision !== scope) return;
        state = null;
        setStatus('Could not confirm the change. Reopen Social to check your saved choice.');
      } finally {
        if (key === owner && revision === scope) { saving = false; render(); }
      }
    });
    setStatus(statusText); render();
    return {
      configure(nextClient, nextOwner, nextPreview) {
        const id = String(nextOwner || '').toLowerCase();
        if (client === nextClient && owner === id && preview === Boolean(nextPreview)) return;
        scope++; reading++; requestController.abort(); requestController = new AbortController();
        closeSetup(false);
        client = nextClient; owner = id; preview = Boolean(nextPreview); state = null;
        profile = null; saving = false; handledSquad = false; view = 'wall';
        setStatus(statusText); render();
      },
      profileLoaded(id, hasProfile) {
        if (String(id || '').toLowerCase() !== owner || preview || typeof hasProfile !== 'boolean') return;
        profile = hasProfile;
        if (profile) closeSetup(false); else offer();
      },
      selectTab(tab, href = root.location.href) {
        if (platformTab !== tab) handledSquad = false;
        platformTab = tab;
        if (tab !== 'community') { closeSetup(false); feed.hidden = true; return; }
        if (!preview && owner && isSquadRoute(href, root.location.origin) && !handledSquad) {
          handledSquad = true;
          closeSetup(false);
          root.FWB_CLIENT_COMMUNITY?.showView('connections', true);
        } else offer();
        void refresh();
      },
      selectView(next) {
        view = next;
        if (next !== 'wall') { closeSetup(false); feed.hidden = true; }
        else { offer(); void refresh(); }
      }
    };
  }
  const api = { mount, isSquadRoute, setupKey, claimSetup, normalizeSharing, normalizeFeed };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) root.FWB_GRUNTR_SOCIAL = mount(root.document);
}(typeof window !== 'undefined' ? window : globalThis));
