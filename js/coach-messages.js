(function attachCoachMessages(global) {
  "use strict";
  const PAGE_SIZE = 50;
  const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
  const messageLength = (value) => Array.from(String(value || "").trim()).length;
  const mergeMessages = (current, incoming) => [...new Map([...current, ...incoming].map((row) => [row.id, row])).values()].sort((a, b) => a.id - b.id);

  // Capture the verified account's token before each HTTP request. A Supabase
  // client's mutable session must never retarget an in-flight send to a new user.
  function createAccountTransport({ supabaseClient, user, config, fetchRequest = (...args) => global.fetch(...args) }) {
    return { async rpc(name, args) {
      const { data, error } = await supabaseClient.auth.getSession();
      const session = data?.session;
      if (error || !session?.access_token || session.user?.id !== user.id || normalizeEmail(session.user.email) !== normalizeEmail(user.email)) {
        return { error: { code: "42501", message: "Messaging account changed" } };
      }
      const token = session.access_token;
      const response = await fetchRequest(`${String(config.url).replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: config.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(args)
      });
      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;
      return response.ok ? { data: payload } : { error: payload || { message: "Message request failed" } };
    } };
  }

  // An authenticated store owns drafts and retry IDs for one account only.
  function createStore({ supabaseClient, user, role, onChange = () => {}, uuid = () => global.crypto.randomUUID(), timeoutMs = 15000 }) {
    let destroyed = false;
    let selectedEmail = role === "client" ? normalizeEmail(user.email) : "";
    let inbox = [];
    let inboxError = "";
    let inboxBusy = false;
    const threads = new Map();
    const changed = () => { if (!destroyed) onChange(); };
    const target = (email) => role === "coach" ? { p_client_email: normalizeEmail(email) } : {};
    function thread(email = selectedEmail) {
      const key = normalizeEmail(email);
      if (!key) return null;
      if (!threads.has(key)) threads.set(key, { email: key, messages: [], draft: "", pending: null, sending: false, loading: false, loadingOlder: false, loaded: false, hasOlder: false, fetchedLatest: 0, error: "", readThrough: 0, reading: false });
      return threads.get(key);
    }
    async function rpc(name, args) {
      let timer;
      try {
        const result = await Promise.race([
          supabaseClient.rpc(name, args),
          new Promise((_, reject) => { timer = global.setTimeout(() => reject(new Error("timeout")), timeoutMs); })
        ]);
        if (result.error) throw result.error;
        const data = result.data || [];
        if (name === "messaging_history" || name === "messaging_send") {
          if (!Array.isArray(data) || data.some((row) => !Number.isSafeInteger(row.id) || row.id <= 0)) throw new Error("Invalid message response");
          if (name === "messaging_send" && data.length !== 1) throw new Error("Missing message receipt");
        }
        return data;
      } finally { global.clearTimeout(timer); }
    }
    function reconcilePending(state, rows) {
      if (!state.pending || !rows.some((row) => row.request_id === state.pending.id && row.sender_user_id === user.id)) return;
      if (state.draft.trim() === state.pending.body) state.draft = "";
      state.pending = null;
      state.error = "";
    }
    async function refreshInbox() {
      if (destroyed || inboxBusy) return;
      inboxBusy = true;
      try {
        const rows = [];
        for (let offset = 0; ; offset += 100) {
          const page = await rpc("messaging_inbox", { p_limit: 100, p_offset: offset });
          if (destroyed) return;
          rows.push(...page);
          if (page.length < 100) break;
        }
        inbox = [...new Map(rows.map((row) => [normalizeEmail(row.client_email), row])).values()];
        inboxError = "";
      } catch (_error) { inboxError = "Messages could not refresh. Check your connection and try again."; }
      finally { inboxBusy = false; changed(); }
    }
    async function refreshThread(email = selectedEmail) {
      const state = thread(email);
      if (destroyed || !state || state.loading) return;
      state.loading = true;
      if (!state.pending) state.error = "";
      changed();
      try {
        const incoming = [];
        let before = null;
        // Catch up all pages back to the last fetched message. A locally sent
        // message must not advance this boundary and hide intervening replies.
        while (true) {
          const page = await rpc("messaging_history", { ...target(state.email), p_before_id: before, p_limit: PAGE_SIZE });
          if (destroyed) return;
          incoming.push(...page);
          if (!state.loaded || page.length < PAGE_SIZE || page.some((row) => row.id <= state.fetchedLatest)) break;
          before = Math.min(...page.map((row) => row.id));
        }
        if (!state.loaded) state.hasOlder = incoming.length === PAGE_SIZE;
        state.messages = mergeMessages(state.messages, incoming);
        reconcilePending(state, incoming);
        state.fetchedLatest = Math.max(state.fetchedLatest, ...incoming.map((row) => row.id), 0);
        state.loaded = true;
      } catch (_error) { state.error = "Conversation could not refresh. Your draft is still here. Try again."; }
      finally { state.loading = false; changed(); }
    }
    async function loadOlder() {
      const state = thread();
      if (destroyed || !state || state.loadingOlder || !state.hasOlder) return;
      state.loadingOlder = true;
      changed();
      try {
        const rows = await rpc("messaging_history", { ...target(state.email), p_before_id: state.messages[0]?.id, p_limit: PAGE_SIZE });
        if (destroyed) return;
        state.messages = mergeMessages(state.messages, rows);
        state.hasOlder = rows.length === PAGE_SIZE;
        state.error = "";
      } catch (_error) { state.error = "Earlier messages could not load. Try again."; }
      finally { state.loadingOlder = false; changed(); }
    }
    async function send() {
      const state = thread();
      if (destroyed || !state || !state.loaded || state.sending || (role === "coach" && !state.messages.length)) return;
      const draft = state.draft;
      const body = state.pending?.body || draft.trim();
      if (!messageLength(body) || messageLength(body) > 4000) {
        state.error = "Write a message between 1 and 4,000 characters.";
        changed();
        return;
      }
      if (!state.pending) state.pending = { body, id: uuid() };
      const pending = state.pending;
      state.sending = true;
      state.error = "";
      changed();
      try {
        const rows = await rpc("messaging_send", { ...target(state.email), p_body: body, p_request_id: pending.id });
        if (destroyed) return;
        state.messages = mergeMessages(state.messages, rows);
        if (state.draft === draft) state.draft = "";
        if (state.pending === pending) state.pending = null;
        void refreshInbox();
      } catch (error) {
        if (state.pending !== pending) return; // A fetched receipt already confirmed delivery.
        if (["42501", "22023", "P0002"].includes(error?.code)) {
          state.pending = null;
          state.error = error.code === "42501"
            ? "Messaging needs an active coaching account and program. Please contact Benjamin to check your access."
            : error.code === "P0002" ? "Your client needs to start the conversation before you can reply."
              : "Message could not be accepted. Check that it contains 1–4,000 characters, then try again.";
        } else {
          state.error = "Message delivery could not be confirmed. Your draft is saved here; retry Send to avoid sending it twice.";
        }
      }
      finally { state.sending = false; changed(); }
    }
    async function markRead(id, email = selectedEmail) {
      const state = thread(email);
      if (destroyed || !state || state.reading || !Number.isSafeInteger(id) || id <= 0 || id <= state.readThrough || id > state.fetchedLatest || !state.messages.some((row) => row.id === id)) return;
      state.reading = true;
      try {
        await rpc("messaging_mark_read", { ...target(state.email), p_through_message_id: id });
        if (destroyed) return;
        state.readThrough = Math.max(state.readThrough, id);
        void refreshInbox();
      } catch (_error) { /* Keep the unread badge; retry when visible again. */ }
      finally { state.reading = false; }
    }
    return {
      snapshot: () => ({ selectedEmail, current: thread(), inbox, inboxError, inboxBusy }),
      select(email) { if (destroyed) return; selectedEmail = role === "client" ? normalizeEmail(user.email) : normalizeEmail(email); changed(); return refreshThread(); },
      setDraft(value) { const state = thread(); if (state && !destroyed && !state.pending) state.draft = String(value); },
      editAsNewMessage() { const state = thread(); if (state && !destroyed && !state.sending) { state.pending = null; state.error = ""; changed(); } },
      refreshInbox, refreshThread, loadOlder, send, markRead,
      destroy() { destroyed = true; threads.clear(); inbox = []; selectedEmail = ""; }
    };
  }

  function createController({ supabaseClient, user, role, root, unreadBadges = [], openButtons = [], rpcTransport }) {
    const doc = root.ownerDocument;
    const isCoach = role === "coach";
    const dialog = !isCoach ? root : null;
    let active = isCoach && !root.hidden;
    let destroyed = false;
    let renderedEmail = "";
    let renderedIds = "";
    let restoreFocus = null;
    let unsubscribe = null;
    let pollTimer = null;
    const listeners = [];
    const names = new Map();
    function node(tag, className, text) {
      const element = doc.createElement(tag);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }
    function listen(element, event, handler) { element.addEventListener(event, handler); listeners.push(() => element.removeEventListener(event, handler)); }
    function button(text, className = "fwb-message-secondary") { const element = node("button", className, text); element.type = "button"; return element; }
    root.replaceChildren();
    root.classList.add("fwb-messages");
    const heading = node("div", "fwb-message-heading");
    const headingCopy = node("div");
    headingCopy.append(node("p", "kicker", isCoach ? "Coach" : "Your coach"));
    const title = node("h2", "", isCoach ? "Inbox" : "Message coach");
    title.id = isCoach ? "coach-inbox-title" : "client-message-title";
    headingCopy.append(title, node("p", "fwb-message-subtitle", "Your conversations stay in sync on the app and website."));
    heading.append(headingCopy);
    const refreshButton = button("Refresh");
    heading.append(refreshButton);
    if (dialog) {
      const close = button("Close");
      close.setAttribute("aria-label", "Close conversation");
      heading.append(close);
      listen(close, "click", () => dialog.close());
      root.setAttribute("aria-labelledby", title.id);
    }
    const inboxStatus = node("p", "fwb-message-status");
    inboxStatus.setAttribute("role", "status");
    const layout = node("div", isCoach ? "fwb-message-layout" : "fwb-message-client-layout");
    const list = node("div", "fwb-message-inbox");
    list.setAttribute("aria-label", "Client conversations");
    if (isCoach) layout.append(list);
    const conversation = node("section", "fwb-message-conversation");
    const conversationTitle = node("h3", "fwb-message-recipient", isCoach ? "Choose a conversation" : "Benjamin · Coach");
    conversationTitle.tabIndex = -1;
    const older = button("Load earlier messages");
    older.hidden = true;
    const history = node("div", "fwb-message-history");
    history.tabIndex = 0;
    history.setAttribute("role", "region");
    history.setAttribute("aria-label", "Conversation messages");
    const empty = node("p", "fwb-message-empty");
    const newer = button("New messages ↓");
    newer.hidden = true;
    const status = node("p", "fwb-message-status");
    status.setAttribute("role", "status");
    const pendingActions = node("div", "fwb-message-pending-actions");
    pendingActions.hidden = true;
    pendingActions.append(node("p", "fwb-message-status", "This message may already have arrived. Editing and sending again creates a new message."));
    const editPending = button("Edit as new message");
    pendingActions.append(editPending);
    const composer = node("div", "fwb-message-composer");
    const label = node("label", "", isCoach ? "Reply to your client" : "Message your coach");
    const input = node("textarea");
    input.id = isCoach ? "coach-message-draft" : "client-message-draft";
    input.rows = 3;
    input.placeholder = isCoach ? "Write a reply…" : "Ask a question or share an update…";
    label.htmlFor = input.id;
    input.setAttribute("aria-describedby", `${input.id}-count`);
    const actions = node("div", "fwb-message-composer-actions");
    const count = node("span", "fwb-message-count", "0 / 4,000");
    count.id = `${input.id}-count`;
    const sendButton = button("Send", "fwb-message-send");
    actions.append(count, sendButton);
    composer.append(label, input, actions);
    conversation.append(conversationTitle, older, history, empty, newer, status, pendingActions, composer);
    layout.append(conversation);
    root.append(heading, inboxStatus, layout);
    const store = createStore({ supabaseClient: rpcTransport || createAccountTransport({ supabaseClient, user, config: global.FWB_SUPABASE_CONFIG }), user, role, onChange: render });
    function visible() { return active && doc.visibilityState !== "hidden" && (!dialog || dialog.open) && !root.hidden; }
    function bottom() { return history.scrollHeight - history.scrollTop - history.clientHeight < 28; }
    function markVisibleRead() {
      if (!visible() || !bottom()) return;
      const state = store.snapshot().current;
      if (state?.loaded) {
        const fetchedMessage = [...state.messages].reverse().find((row) => row.id <= state.fetchedLatest);
        if (fetchedMessage) void store.markRead(fetchedMessage.id);
      }
      newer.hidden = true;
    }
    function renderComposer(state) {
      composer.hidden = !state || (isCoach && !state.messages.length);
      pendingActions.hidden = !state?.pending || state.sending;
      if (!state) return;
      input.disabled = !state.loaded || Boolean(state.pending);
      if (input.value !== state.draft) input.value = state.draft;
      const length = messageLength(state.draft);
      count.textContent = `${length.toLocaleString()} / 4,000`;
      input.setAttribute("aria-invalid", String(length > 4000));
      sendButton.disabled = !state.loaded || state.sending || length === 0 || length > 4000;
      sendButton.textContent = state.sending ? "Sending…" : state.pending ? "Retry send" : "Send";
    }
    function render() {
      if (destroyed) return;
      const state = store.snapshot();
      const unread = state.inbox.reduce((sum, row) => sum + Number(row.unread_count || 0), 0);
      for (const badge of unreadBadges) {
        badge.hidden = unread === 0;
        badge.textContent = unread > 99 ? "99+" : String(unread);
        badge.setAttribute("aria-label", `${unread} unread messages`);
      }
      inboxStatus.textContent = state.inboxError;
      refreshButton.disabled = state.inboxBusy || Boolean(state.current?.loading);
      if (isCoach) {
        const focusedEmail = list.contains(doc.activeElement) ? doc.activeElement.dataset.clientEmail : null;
        list.replaceChildren();
        if (!state.inbox.length) list.append(node("p", "fwb-message-empty", state.inboxBusy ? "Loading conversations…" : "No conversations yet. Clients can start a conversation with Message coach."));
        for (const row of state.inbox) {
          names.set(normalizeEmail(row.client_email), row.client_name || row.client_email);
          const item = button("", "fwb-message-inbox-item");
          item.dataset.clientEmail = normalizeEmail(row.client_email);
          item.classList.toggle("is-active", item.dataset.clientEmail === state.selectedEmail);
          if (item.dataset.clientEmail === state.selectedEmail) item.setAttribute("aria-current", "true");
          const line = node("span", "fwb-message-inbox-top");
          line.append(node("strong", "", row.client_name || row.client_email));
          if (Number(row.unread_count)) line.append(node("span", "fwb-message-badge", `${row.unread_count} new`));
          const time = node("time", "", formatTime(row.last_message_at));
          time.dateTime = row.last_message_at;
          item.append(line, node("span", "fwb-message-preview", `${row.last_sender_role === "coach" ? "You: " : ""}${row.last_message_body}`), time);
          list.append(item);
        }
        if (focusedEmail) [...list.children].find((item) => item.dataset.clientEmail === focusedEmail)?.focus({ preventScroll: true });
      }
      const current = state.current;
      const switching = renderedEmail !== state.selectedEmail;
      const ids = current?.messages.map((row) => row.id).join(",") || "";
      const oldHeight = history.scrollHeight;
      const oldTop = history.scrollTop;
      const atBottom = bottom();
      const previousFirstId = Number(history.firstElementChild?.dataset.messageId || 0);
      if (switching || renderedIds !== ids) {
        history.replaceChildren();
        for (const row of current?.messages || []) {
          const own = row.sender_user_id === user.id;
          const bubble = node("article", `fwb-message-bubble${own ? " is-own" : ""}`);
          bubble.dataset.messageId = String(row.id);
          const author = own ? "You" : row.sender_role === "coach" ? "Coach" : names.get(state.selectedEmail) || "Client";
          const time = node("time", "", formatTime(row.created_at));
          time.dateTime = row.created_at;
          const meta = node("div", "fwb-message-meta");
          meta.append(node("strong", "", author), time);
          bubble.append(meta, node("p", "", row.body));
          history.append(bubble);
        }
        const prepended = !switching && previousFirstId && current?.messages[0]?.id < previousFirstId;
        if (prepended) history.scrollTop = oldTop + history.scrollHeight - oldHeight;
        else if (switching || atBottom) history.scrollTop = history.scrollHeight;
        else newer.hidden = false;
        renderedIds = ids;
        renderedEmail = state.selectedEmail;
      }
      if (isCoach) conversationTitle.textContent = state.selectedEmail ? names.get(state.selectedEmail) || state.selectedEmail : "Choose a conversation";
      empty.hidden = Boolean(current?.messages.length);
      empty.textContent = !current ? "Open a client conversation to read and reply." : current.loading && !current.loaded ? "Loading conversation…" : current.error && !current.loaded ? "Use Refresh to try again." : isCoach ? "No messages yet. Your client can start a conversation with Message coach." : "No messages yet. Say hello to start the conversation.";
      older.hidden = !current?.hasOlder;
      older.disabled = Boolean(current?.loadingOlder);
      older.textContent = current?.loadingOlder ? "Loading…" : "Load earlier messages";
      status.textContent = current?.error || "";
      renderComposer(current);
      global.requestAnimationFrame(markVisibleRead);
    }
    function formatTime(value) {
      const date = new Date(value);
      return Number.isNaN(date.valueOf()) ? "" : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }
    async function refresh() {
      if (destroyed || doc.visibilityState === "hidden") return;
      await Promise.all([store.refreshInbox(), visible() ? store.refreshThread() : Promise.resolve()]);
    }
    function open(email, name, trigger) {
      if (destroyed) return;
      if (email && name) names.set(normalizeEmail(email), name);
      active = true;
      restoreFocus = trigger || doc.activeElement;
      if (dialog && !dialog.open) dialog.showModal();
      void store.select(isCoach ? email : user.email);
      void store.refreshInbox();
      conversationTitle.focus({ preventScroll: true });
    }
    listen(list, "click", (event) => { const item = event.target.closest("[data-client-email]"); if (item && list.contains(item)) open(item.dataset.clientEmail); });
    listen(refreshButton, "click", refresh);
    listen(older, "click", () => { void store.loadOlder(); });
    async function sendAndRefresh() { await store.send(); await store.refreshThread(); }
    listen(sendButton, "click", () => { void sendAndRefresh(); });
    listen(editPending, "click", () => { store.editAsNewMessage(); input.focus(); });
    listen(input, "input", () => { store.setDraft(input.value); renderComposer(store.snapshot().current); });
    // Enter creates a line break. Cmd/Ctrl+Enter is an explicit send shortcut.
    listen(input, "keydown", (event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); void sendAndRefresh(); } });
    listen(history, "scroll", markVisibleRead);
    listen(newer, "click", () => { history.scrollTop = history.scrollHeight; markVisibleRead(); });
    if (dialog) listen(dialog, "close", () => { active = false; restoreFocus?.focus?.(); });
    for (const trigger of openButtons) listen(trigger, "click", () => open(user.email, "", trigger));
    listen(doc, "visibilitychange", () => {
      global.clearInterval(pollTimer);
      pollTimer = null;
      if (doc.visibilityState !== "hidden") { startPolling(); void refresh(); markVisibleRead(); }
    });
    listen(global, "focus", () => { void refresh(); });
    listen(global, "online", () => { void refresh(); });
    listen(global, "pagehide", (event) => {
      if (event.persisted) { global.clearInterval(pollTimer); pollTimer = null; }
      else destroy();
    });
    listen(global, "pageshow", (event) => {
      if (event.persisted) { destroy(); global.location.reload(); }
    });
    if (supabaseClient.auth?.onAuthStateChange) {
      const result = supabaseClient.auth.onAuthStateChange((_event, session) => { if (!session?.user || session.user.id !== user.id || normalizeEmail(session.user.email) !== normalizeEmail(user.email)) destroy(); });
      unsubscribe = () => result.data?.subscription?.unsubscribe();
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      global.clearInterval(pollTimer);
      listeners.forEach((remove) => remove());
      unsubscribe?.();
      store.destroy();
      names.clear();
      if (dialog?.open) dialog.close();
      root.replaceChildren();
      for (const badge of unreadBadges) { badge.hidden = true; badge.textContent = "0"; }
      for (const trigger of openButtons) trigger.disabled = true;
    }
    function startPolling() {
      if (!destroyed && !pollTimer && doc.visibilityState !== "hidden") pollTimer = global.setInterval(() => { void refresh(); }, 15000);
    }
    startPolling();
    for (const trigger of openButtons) trigger.disabled = false;
    render();
    void refresh();
    return { open, refresh, destroy, setActive(value) { active = Boolean(value); if (active) { void refresh(); global.requestAnimationFrame(markVisibleRead); } } };
  }
  const api = { createController, createStore, createAccountTransport, mergeMessages, messageLength };
  global.FWBCoachMessages = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
