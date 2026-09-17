(function attachFwbWebNotifications(global) {
  "use strict";

  const defaultServiceWorkerUrl = "/timer-notifications-sw.js?v=web-push-notifications-1";
  const modernFunctionName = "send-web-push";
  const deployedFunctionName = "fwb-web-push";
  const maximumInboxItems = 12;
  const clientPreferenceKeys = new Set([
    "coach_replies",
    "program_updates",
    "session_reminders",
    "workout_reminders",
    "weekly_check_ins",
    "monthly_reports",
    "session_balance",
    "nutrition_reminders",
    "progress_reminders",
    "achievements"
  ]);
  const coachPreferenceKeys = new Set([
    "client_workout_completed",
    "client_workout_comments",
    "client_check_ins",
    "client_progress_updates",
    "client_nutrition_activity",
    "client_form_checks",
    "client_dexa_uploads",
    "client_questionnaires",
    "client_coach_requests",
    "client_session_balance",
    "client_inactivity"
  ]);
  const deployedPreferenceCategories = Object.freeze({
    coach_replies: "coach_reply",
    program_updates: "program_update",
    session_reminders: "session_reminder",
    workout_reminders: "workout_reminder",
    weekly_check_ins: "weekly_check_in",
    monthly_reports: "monthly_report",
    session_balance: "low_sessions",
    nutrition_reminders: "nutrition_reminder",
    progress_reminders: "progress_reminder",
    achievements: "achievement",
    client_workout_completed: "workout_completed",
    client_workout_comments: "client_message",
    client_check_ins: "check_in_submitted",
    client_progress_updates: "progress_submitted",
    client_nutrition_activity: "nutrition_activity",
    client_form_checks: "form_check_submitted",
    client_dexa_uploads: "dexa_uploaded",
    client_questionnaires: "questionnaire_submitted",
    client_coach_requests: "client_message",
    client_session_balance: "low_sessions",
    client_inactivity: "inactivity"
  });
  const deployedSchemaErrorCodes = new Set(["42703", "42P01", "PGRST204", "PGRST205"]);

  function isIosDevice() {
    return /iPad|iPhone|iPod/.test(global.navigator?.userAgent || "") ||
      (global.navigator?.platform === "MacIntel" && global.navigator?.maxTouchPoints > 1);
  }

  function isStandaloneWebApp() {
    return Boolean(
      global.matchMedia?.("(display-mode: standalone)")?.matches ||
      global.navigator?.standalone === true
    );
  }

  function pushSupport() {
    if (
      !global.isSecureContext ||
      !("Notification" in global) ||
      !("serviceWorker" in global.navigator) ||
      !("PushManager" in global)
    ) {
      return { supported: false, reason: "unsupported" };
    }
    if (isIosDevice() && !isStandaloneWebApp()) {
      return { supported: false, reason: "ios-home-screen" };
    }
    return { supported: true, reason: "" };
  }

  function base64UrlToUint8Array(value) {
    const padding = "=".repeat((4 - (value.length % 4)) % 4);
    const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
    const decoded = global.atob(base64);
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  }

  function safeActionUrl(value, role) {
    const fallback = role === "coach" ? "/coach-admin.html" : "/client-dashboard.html?tab=home";
    if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
      return fallback;
    }

    try {
      const destination = new URL(value, global.location.origin);
      return destination.origin === global.location.origin
        ? `${destination.pathname}${destination.search}${destination.hash}`
        : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function formatNotificationDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Recently";
    }
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  function createController(options = {}) {
    const supabaseClient = options.supabaseClient;
    const user = options.user;
    const role = options.role === "coach" ? "coach" : "client";
    const root = options.root || global.document?.querySelector("[data-web-notifications]");
    const serviceWorkerUrl = options.serviceWorkerUrl || defaultServiceWorkerUrl;
    const allowedPreferenceKeys = role === "coach" ? coachPreferenceKeys : clientPreferenceKeys;
    let preferences = null;
    let registrationPromise = null;
    let subscription = null;
    let backend = "modern";
    let preferenceSavePromise = Promise.resolve();
    let initialized = false;
    let destroyed = false;
    let busy = false;

    function element(selector) {
      return root?.querySelector(selector) || null;
    }

    function setStatus(message, state = "") {
      const status = element("[data-web-notification-status]");
      if (!status) {
        return;
      }
      status.textContent = message;
      status.dataset.state = state;
    }

    function setBusy(nextBusy) {
      busy = Boolean(nextBusy);
      root?.querySelectorAll("button, input").forEach((control) => {
        if (control.matches("[data-web-notification-enable], [data-web-notification-test], [data-web-notification-mark-all]")) {
          control.disabled = busy || control.dataset.webNotificationUnavailable === "true";
        } else if (control.matches("[data-web-notification-preference]")) {
          control.disabled = busy;
        }
      });
    }

    function permissionHelp() {
      const support = pushSupport();
      if (!support.supported) {
        return support.reason === "ios-home-screen"
          ? "On iPhone, add FWB to your Home Screen and open that icon to receive alerts."
          : "This browser does not support background alerts. Your notification inbox still works here.";
      }
      if (global.Notification.permission === "denied") {
        return "Notifications are blocked. Allow FWB in your browser or device settings, then reload this page.";
      }
      return "Choose which private updates you want. You can change these anytime.";
    }

    async function serviceWorkerRegistration() {
      if (!pushSupport().supported) {
        return null;
      }
      if (!registrationPromise) {
        registrationPromise = global.navigator.serviceWorker
          .register(serviceWorkerUrl, { scope: "/" })
          .then(() => global.navigator.serviceWorker.ready)
          .catch(() => {
            registrationPromise = null;
            return null;
          });
      }
      return registrationPromise;
    }

    async function currentSubscription() {
      const registration = await serviceWorkerRegistration();
      subscription = registration ? await registration.pushManager.getSubscription() : null;
      return subscription;
    }

    async function invokeNotificationFunction(action) {
      const functionName = backend === "deployed" ? deployedFunctionName : modernFunctionName;
      const { data, error } = await supabaseClient.functions.invoke(functionName, {
        body: { action }
      });
      if (error) {
        throw error;
      }
      if (data?.error) {
        throw new Error(data.error);
      }
      return data || {};
    }

    function normalizeDeployedPreferences(row) {
      const categories = row?.categories && typeof row.categories === "object" ? row.categories : {};
      const normalized = {
        ...row,
        push_enabled: row?.push_enabled === true,
        _deployed_categories: categories
      };

      allowedPreferenceKeys.forEach((key) => {
        const category = deployedPreferenceCategories[key] || key;
        normalized[key] = categories[category] !== false;
      });

      return normalized;
    }

    async function modernPreferencesProbe() {
      return supabaseClient
        .from("client_notification_preferences")
        .select("user_id,push_enabled,client_workout_completed")
        .eq("user_id", user.id)
        .maybeSingle();
    }

    function isDeployedSchemaFallback(error) {
      return deployedSchemaErrorCodes.has(String(error?.code || ""));
    }

    async function ensurePreferences() {
      const probe = await modernPreferencesProbe();
      if (probe.error) {
        if (!isDeployedSchemaFallback(probe.error)) {
          throw probe.error;
        }
        backend = "deployed";
        const { data, error } = await supabaseClient
          .from("fwb_notification_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          throw error;
        }
        if (data) {
          preferences = normalizeDeployedPreferences(data);
          return preferences;
        }

        const { data: created, error: createError } = await supabaseClient
          .from("fwb_notification_settings")
          .insert({ user_id: user.id })
          .select("*")
          .single();
        if (createError) {
          throw createError;
        }
        preferences = normalizeDeployedPreferences(created);
        return preferences;
      }

      backend = "modern";
      if (probe.data) {
        const { data, error } = await supabaseClient
          .from("client_notification_preferences")
          .select("*")
          .eq("user_id", user.id)
          .single();
        if (error) {
          throw error;
        }
        preferences = data;
        return preferences;
      }

      const { data, error } = await supabaseClient
        .from("client_notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }
      if (data) {
        preferences = data;
        return preferences;
      }

      const { data: created, error: createError } = await supabaseClient
        .from("client_notification_preferences")
        .insert({ user_id: user.id })
        .select("*")
        .single();
      if (createError) {
        throw createError;
      }
      preferences = created;
      return preferences;
    }

    async function persistPreferences(updates) {
      if (backend === "deployed") {
        const { data: latest, error: latestError } = await supabaseClient
          .from("fwb_notification_settings")
          .select("*")
          .eq("user_id", user.id)
          .single();
        if (latestError) {
          throw latestError;
        }

        const categories = {
          ...(latest?.categories && typeof latest.categories === "object" ? latest.categories : {})
        };
        const payload = {};

        Object.entries(updates).forEach(([key, value]) => {
          if (key === "push_enabled") {
            payload.push_enabled = Boolean(value);
            return;
          }
          const category = deployedPreferenceCategories[key];
          if (category) {
            categories[category] = Boolean(value);
          }
        });
        payload.categories = categories;

        const { data, error } = await supabaseClient
          .from("fwb_notification_settings")
          .update(payload)
          .eq("user_id", user.id)
          .select("*")
          .single();
        if (error) {
          throw error;
        }
        preferences = normalizeDeployedPreferences(data);
        return preferences;
      }

      const payload = { ...updates, updated_at: new Date().toISOString() };
      const { data, error } = await supabaseClient
        .from("client_notification_preferences")
        .update(payload)
        .eq("user_id", user.id)
        .select("*")
        .single();
      if (error) {
        throw error;
      }
      preferences = data;
      return data;
    }

    function savePreferences(updates) {
      const nextSave = preferenceSavePromise.then(() => persistPreferences(updates));
      preferenceSavePromise = nextSave.catch(() => {});
      return nextSave;
    }

    async function storeSubscription(pushSubscription) {
      const serialized = pushSubscription?.toJSON?.() || {};
      const endpoint = String(serialized.endpoint || pushSubscription?.endpoint || "");
      const p256dh = String(serialized.keys?.p256dh || "");
      const auth = String(serialized.keys?.auth || "");
      if (!endpoint || !p256dh || !auth) {
        throw new Error("The browser did not return a complete push subscription.");
      }

      const subscriptionTable = backend === "deployed"
        ? "fwb_web_push_subscriptions"
        : "web_push_subscriptions";
      const subscriptionPayload = {
        user_id: user.id,
        endpoint,
        p256dh,
        auth
      };
      if (backend !== "deployed") {
        Object.assign(subscriptionPayload, {
          expiration_time: serialized.expirationTime || null,
          user_agent: String(global.navigator.userAgent || "").slice(0, 500),
          is_active: true,
          last_seen_at: new Date().toISOString()
        });
      }

      const { error } = await supabaseClient
        .from(subscriptionTable)
        .upsert(subscriptionPayload, {
          onConflict: backend === "deployed" ? "endpoint" : "user_id,endpoint"
        });
      if (error) {
        throw error;
      }
    }

    async function deactivateSubscription(pushSubscription, { unsubscribe = true } = {}) {
      const endpoint = String(pushSubscription?.endpoint || "");
      if (endpoint) {
        const query = supabaseClient
          .from(backend === "deployed" ? "fwb_web_push_subscriptions" : "web_push_subscriptions");
        let result;
        if (backend === "deployed") {
          result = await query.delete().eq("user_id", user.id).eq("endpoint", endpoint);
        } else {
          result = await query
            .update({ is_active: false, last_seen_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .eq("endpoint", endpoint);
        }
        if (result.error) {
          throw result.error;
        }
      }
      if (unsubscribe && pushSubscription?.unsubscribe) {
        try {
          await pushSubscription.unsubscribe();
        } catch (error) {
          // The server record is already inactive; local cleanup can safely fail closed.
        }
      }
      subscription = null;
    }

    function renderPreferences() {
      root?.querySelectorAll("[data-web-notification-preference]").forEach((input) => {
        const key = input.dataset.webNotificationPreference;
        if (!allowedPreferenceKeys.has(key)) {
          input.closest("label")?.setAttribute("hidden", "");
          return;
        }
        input.checked = preferences?.[key] !== false;
      });
    }

    function renderEnableState() {
      const support = pushSupport();
      const enabled = Boolean(
        support.supported &&
        global.Notification.permission === "granted" &&
        subscription &&
        preferences?.push_enabled !== false
      );
      const enableButton = element("[data-web-notification-enable]");
      const testButton = element("[data-web-notification-test]");
      const help = element("[data-web-notification-help]");

      root?.classList.toggle("is-enabled", enabled);
      if (enableButton) {
        enableButton.textContent = enabled ? "Turn off alerts" : "Enable alerts";
        enableButton.setAttribute("aria-pressed", enabled ? "true" : "false");
        enableButton.dataset.webNotificationUnavailable = support.supported && global.Notification.permission !== "denied"
          ? "false"
          : "true";
        enableButton.disabled = busy || enableButton.dataset.webNotificationUnavailable === "true";
      }
      if (testButton) {
        testButton.dataset.webNotificationUnavailable = enabled ? "false" : "true";
        testButton.disabled = busy || !enabled;
      }
      if (help) {
        help.textContent = enabled
          ? "Background alerts are on for this device."
          : permissionHelp();
      }
    }

    function notificationItem(row) {
      const item = global.document.createElement("li");
      const link = global.document.createElement("a");
      const title = global.document.createElement("strong");
      const body = global.document.createElement("span");
      const date = global.document.createElement("time");
      const actionUrl = safeActionUrl(row.action_url, role);

      item.className = "web-notification-item";
      item.classList.toggle("is-unread", !row.read_at);
      link.href = actionUrl;
      link.dataset.webNotificationOpen = row.id;
      title.textContent = String(row.title || "FWB update");
      body.textContent = String(row.body || "Open FWB for the latest update.");
      date.dateTime = String(row.created_at || "");
      date.textContent = formatNotificationDate(row.created_at);
      link.append(title, body, date);
      item.append(link);
      return item;
    }

    function renderInbox(rows) {
      const list = element("[data-web-notification-list]");
      const empty = element("[data-web-notification-empty]");
      const unreadBadge = element("[data-web-notification-unread]");
      const markAllButton = element("[data-web-notification-mark-all]");
      const unreadCount = rows.filter((row) => !row.read_at).length;

      if (list) {
        list.replaceChildren(...rows.map(notificationItem));
      }
      if (empty) {
        empty.hidden = rows.length > 0;
      }
      if (unreadBadge) {
        unreadBadge.textContent = unreadCount ? String(unreadCount) : "";
        unreadBadge.hidden = unreadCount === 0;
        unreadBadge.setAttribute("aria-label", `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`);
      }
      if (markAllButton) {
        markAllButton.hidden = unreadCount === 0;
      }
    }

    async function loadInbox() {
      let query = supabaseClient.from("client_notifications");
      if (backend === "deployed") {
        query = query.select("id,kind,title,body,web_url,created_at,read_at").eq("user_id", user.id);
      } else {
        query = query
          .select("id,recipient_role,kind,title,body,action_url,created_at,read_at")
          .eq("user_id", user.id)
          .eq("recipient_role", role);
      }
      const { data, error } = await query.order("created_at", { ascending: false }).limit(maximumInboxItems);
      if (error) {
        throw error;
      }
      const rows = (data || []).map((row) => ({
        ...row,
        action_url: row.action_url || row.web_url
      }));
      renderInbox(rows);
      return rows;
    }

    async function enableAlerts() {
      const support = pushSupport();
      if (!support.supported) {
        renderEnableState();
        return false;
      }
      if (global.Notification.permission === "denied") {
        renderEnableState();
        return false;
      }

      let permission = global.Notification.permission;
      if (permission === "default") {
        permission = await global.Notification.requestPermission();
      }
      if (permission !== "granted") {
        renderEnableState();
        return false;
      }

      const registration = await serviceWorkerRegistration();
      if (!registration) {
        throw new Error("FWB could not start background alerts on this device.");
      }
      const existing = await registration.pushManager.getSubscription();
      let nextSubscription = existing;
      if (!nextSubscription) {
        const { publicKey } = await invokeNotificationFunction("public-key");
        if (!publicKey) {
          throw new Error("Browser alerts are still being connected. Please try again soon.");
        }
        nextSubscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(publicKey)
        });
      }

      await storeSubscription(nextSubscription);
      subscription = nextSubscription;
      await savePreferences({ push_enabled: true });
      renderEnableState();
      return true;
    }

    async function disableAlerts() {
      const existing = subscription || await currentSubscription();
      if (existing) {
        await deactivateSubscription(existing);
      }
      await savePreferences({ push_enabled: false });
      renderEnableState();
      return false;
    }

    async function toggleAlerts() {
      if (busy) {
        return false;
      }
      setBusy(true);
      setStatus("Updating notification settings…");
      try {
        const enabled = Boolean(subscription && preferences?.push_enabled !== false);
        const result = enabled ? await disableAlerts() : await enableAlerts();
        setStatus(result ? "Alerts are on for this device." : "Background alerts are off.", result ? "success" : "");
        return result;
      } catch (error) {
        setStatus(error?.message || "Could not update notification settings.", "error");
        renderEnableState();
        return false;
      } finally {
        setBusy(false);
        renderEnableState();
      }
    }

    async function sendTest() {
      if (busy || !subscription || preferences?.push_enabled === false) {
        return false;
      }
      setBusy(true);
      setStatus("Sending a private test alert…");
      try {
        await invokeNotificationFunction("test");
        await loadInbox();
        setStatus("Test sent. It should appear on this device shortly.", "success");
        return true;
      } catch (error) {
        setStatus(error?.message || "Could not send the test alert.", "error");
        return false;
      } finally {
        setBusy(false);
        renderEnableState();
      }
    }

    async function updatePreference(input) {
      const key = input.dataset.webNotificationPreference;
      if (!allowedPreferenceKeys.has(key)) {
        return;
      }
      setStatus("Saving notification choices…");
      try {
        await savePreferences({ [key]: input.checked });
        renderPreferences();
        setStatus("Notification choices saved.", "success");
      } catch (error) {
        input.checked = !input.checked;
        setStatus("Could not save that choice. Please try again.", "error");
      }
    }

    async function markRead(notificationId) {
      if (!notificationId) {
        return;
      }
      await supabaseClient
        .from("client_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("id", notificationId);
    }

    async function markAllRead() {
      let query = supabaseClient
        .from("client_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id);
      if (backend !== "deployed") {
        query = query.eq("recipient_role", role);
      }
      const { error } = await query.is("read_at", null);
      if (error) {
        setStatus("Could not mark notifications as read.", "error");
        return;
      }
      await loadInbox();
      setStatus("Notifications marked as read.", "success");
    }

    async function handleClick(event) {
      const enableButton = event.target.closest("[data-web-notification-enable]");
      const testButton = event.target.closest("[data-web-notification-test]");
      const markAllButton = event.target.closest("[data-web-notification-mark-all]");
      const notificationLink = event.target.closest("[data-web-notification-open]");

      if (enableButton) {
        event.preventDefault();
        toggleAlerts();
      } else if (testButton) {
        event.preventDefault();
        sendTest();
      } else if (markAllButton) {
        event.preventDefault();
        await markAllRead();
      } else if (notificationLink) {
        const modifiedClick = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
        if (!modifiedClick && (event.button === 0 || event.button === undefined)) {
          event.preventDefault();
          await markRead(notificationLink.dataset.webNotificationOpen);
          global.location.assign(safeActionUrl(notificationLink.getAttribute("href"), role));
        } else {
          await markRead(notificationLink.dataset.webNotificationOpen);
        }
      }
    }

    function handleChange(event) {
      const input = event.target.closest("[data-web-notification-preference]");
      if (input) {
        updatePreference(input);
      }
    }

    async function refresh() {
      if (!initialized || destroyed) {
        return false;
      }
      try {
        await ensurePreferences();
        await loadInbox();
        subscription = pushSupport().supported && global.Notification.permission === "granted"
          ? await currentSubscription()
          : null;
        if (subscription && preferences?.push_enabled !== false) {
          await storeSubscription(subscription);
        }
        renderPreferences();
        renderEnableState();
        return true;
      } catch (error) {
        setStatus("Notifications are being connected. Please try again soon.", "error");
        return false;
      }
    }

    async function init() {
      if (initialized || !root || !supabaseClient || !user?.id) {
        return false;
      }
      initialized = true;
      root.hidden = false;
      root.addEventListener("click", handleClick);
      root.addEventListener("change", handleChange);
      setStatus("Loading notification settings…");
      const loaded = await refresh();
      if (!loaded) {
        return false;
      }
      const support = pushSupport();
      if (!support.supported || global.Notification.permission === "denied") {
        setStatus(permissionHelp());
      } else {
        setStatus(subscription && preferences?.push_enabled !== false
          ? "Alerts are on for this device."
          : "Enable alerts when you’re ready.");
      }
      return true;
    }

    async function prepareForSignOut() {
      if (!supabaseClient || !user?.id || !pushSupport().supported) {
        return;
      }
      try {
        const existing = subscription || await currentSubscription();
        if (existing) {
          await deactivateSubscription(existing);
        }
      } catch (error) {
        // Signing out must continue even if this device is already unsubscribed.
      }
    }

    function destroy() {
      destroyed = true;
      root?.removeEventListener("click", handleClick);
      root?.removeEventListener("change", handleChange);
    }

    return {
      init,
      refresh,
      prepareForSignOut,
      destroy
    };
  }

  global.FWBWebNotifications = Object.freeze({
    createController,
    pushSupport,
    safeActionUrl,
    base64UrlToUint8Array
  });
})(window);
