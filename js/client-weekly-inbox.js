(function (root) {
  'use strict';
  const normalize = value => String(value || '').trim().toLowerCase();
  const storageKey = id => 'fwb.weeklyCoachCheckIn.inbox.v1.' + id;

  function mondaySlot(now) {
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7), 8);
    const key = [monday.getFullYear(), String(monday.getMonth() + 1).padStart(2, '0'),
      String(monday.getDate()).padStart(2, '0')].join('-');
    return { key, at:monday.toISOString(), eligible:now.getDay() === 1 && now >= monday };
  }

  function create({ client, user, preview, now = () => new Date(),
      getStorage = () => root.localStorage, document = root.document, publish, open } = {}) {
    const email = normalize(user?.email), owner = user?.id;
    const key = owner ? storageKey(owner) : '';
    let storage;
    try { storage = getStorage(); } catch (_) {}
    let active = Boolean(client?.auth && owner && email && !preview && storage);
    let attached = false, verifiedWeek = '', completedWeek = '', visible = '', pending, revision = 0, timer, auth;
    const read = () => {
      try { return JSON.parse(storage.getItem(key) || '{}') || {}; } catch (_) { return null; }
    };
    const write = value => {
      try { storage.setItem(key,JSON.stringify(value)); return true; } catch (_) { return false; }
    };
    function hide() {
      if (visible) { visible = ''; publish(null); }
    }
    function display(slot, state) {
      if (!active || state?.delivered !== slot.key || state.completed === slot.key) { hide(); return; }
      const unread = state.read !== slot.key;
      const next = slot.key + ':' + unread;
      if (next === visible) return;
      visible = next;
      publish({
        id:'local-weekly-' + slot.key, kind:'weekly_check_in', title:'Weekly coach check-in',
        body:'Take a moment to complete this week’s check-in.', created_at:slot.at, read_at:unread ? null : slot.at,
        onRead() {
          if (!active || mondaySlot(now()).key !== slot.key) return;
          const latest = read();
          if (latest?.delivered === slot.key && latest.read !== slot.key &&
              write({ ...latest, read:slot.key })) display(slot,read());
        },
        onOpen(focus) {
          if (active && mondaySlot(now()).key === slot.key) open(focus);
        }
      });
    }

    function complete(week) {
      if (!active || mondaySlot(now()).key !== week) return;
      revision++;
      completedWeek = week;
      const latest = read();
      if (latest) write({ ...latest, completed:week });
      verifiedWeek = week;
      hide();
    }
    function refresh(force = false) {
      if (!active || document?.hidden) return Promise.resolve();
      const slot = mondaySlot(now()), state = read();
      if (!state || completedWeek === slot.key || state.completed === slot.key || (!slot.eligible && state.delivered !== slot.key)) {
        hide();
        return Promise.resolve();
      }
      if (!force && verifiedWeek === slot.key) { display(slot,state); return Promise.resolve(); }
      if (pending?.week === slot.key) return pending.work;
      verifiedWeek = '';
      const token = ++revision;
      const work = (async () => {
        try {
          const { data:authData, error:authError } = await client.auth.getSession();
          if (!active || token !== revision) return;
          const signedIn = authData?.session?.user;
          if (authError || signedIn?.id !== owner || normalize(signedIn?.email) !== email) { hide(); return; }
          // Only verify submission status; never retrieve the answers to build the reminder.
          const { data,error } = await client.from('client_check_ins').select('weekly_submitted_at')
            .eq('client_email',email).eq('occurred_on',slot.key).not('weekly_submitted_at','is',null).limit(1);
          if (!active || token !== revision || mondaySlot(now()).key !== slot.key) return;
          if (error || !Array.isArray(data)) { hide(); return; }
          if (data.some(row => row.weekly_submitted_at)) { complete(slot.key); return; }
          const latest = read();
          if (!latest || latest.completed === slot.key) { hide(); return; }
          if (latest.delivered !== slot.key && !write({ ...latest, delivered:slot.key })) { hide(); return; }
          verifiedWeek = slot.key;
          display(slot,read());
        } catch (_) { if (active && token === revision) hide(); }
      })().finally(() => { if (pending?.work === work) pending = null; });
      pending = { week:slot.key, work };
      return work;
    }
    const onFocus = () => void refresh(true);
    const onStorage = event => { if (event.key === key) void refresh(); };

    function destroy() {
      active = false;
      revision++;
      hide();
      if (!attached) return;
      attached = false;
      root.clearInterval(timer);
      root.removeEventListener?.('focus',onFocus);
      root.removeEventListener?.('storage',onStorage);
      document?.removeEventListener?.('visibilitychange',onFocus);
      queueMicrotask(() => auth?.unsubscribe?.());
    }
    function attach() {
      if (!active || attached) return;
      attached = true;
      root.addEventListener?.('focus',onFocus);
      root.addEventListener?.('storage',onStorage);
      document?.addEventListener?.('visibilitychange',onFocus);
      timer = root.setInterval(() => void refresh(),60000);
      auth = client.auth.onAuthStateChange?.((event, session) => {
        if (event === 'INITIAL_SESSION') return;
        if (session?.user?.id !== owner || normalize(session?.user?.email) !== email) destroy();
      })?.data?.subscription;
      void refresh();
    }
    return { attach, refresh, complete, destroy };
  }
  const api = { mondaySlot, storageKey, create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FWB_WEEKLY_INBOX = api;
})(typeof window === 'undefined' ? globalThis : window);
