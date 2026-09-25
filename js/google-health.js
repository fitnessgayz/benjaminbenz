(function (global) {
  "use strict";

  const pendingKey = "fwb.google-health.pending";
  const emailKey = (value) => String(value || "").trim().toLowerCase();
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const numeric = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;

  function pendingConnection() {
    try { return JSON.parse(global.sessionStorage.getItem(pendingKey) || "null"); } catch (_error) { return null; }
  }

  function isCallbackUrl(href) {
    try {
      const params = new URL(href).searchParams;
      const state = params.get("state") || "";
      return state.startsWith("fwbgh_") && (params.has("code") || params.has("error"));
    } catch (_error) { return false; }
  }

  function dateLabel(value, includeTime) {
    if (!value) return "";
    const date = new Date(includeTime ? value : `${value}T12:00:00`);
    if (!Number.isFinite(date.getTime())) return "";
    return date.toLocaleString(undefined, includeTime
      ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric", year: "numeric" });
  }

  function activityMarkup(row) {
    const metrics = [];
    const metric = (label, value) => metrics.push(`<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`);
    if (numeric(row.duration_seconds)) metric("Workout time", `${Math.round(Number(row.duration_seconds) / 6) / 10} min`);
    if (numeric(row.elapsed_seconds)) metric("Elapsed time", `${Math.round(Number(row.elapsed_seconds) / 6) / 10} min`);
    if (numeric(row.calories)) metric("Total energy", `${Math.round(Number(row.calories))} kcal`);
    if (numeric(row.distance_meters)) metric("Distance", `${(Number(row.distance_meters) / 1000).toLocaleString(undefined, { maximumFractionDigits: 2 })} km`);
    if (numeric(row.average_heart_rate)) metric("Average heart rate", `${Math.round(Number(row.average_heart_rate))} bpm`);
    const activity = String(row.activity_type || "Workout").replace(/_/g, " ");
    const date = dateLabel(row.workout_date, false);
    return `<article class="google-health-activity"><header><div><p class="google-health-source">Google Health · Fitbit / Pixel Watch</p><h4>${escapeHtml(activity)}</h4></div><time datetime="${escapeHtml(row.workout_date)}">${escapeHtml(date)}</time></header>${metrics.length ? `<dl class="google-health-metrics">${metrics.join("")}</dl>` : '<p class="google-health-help">No workout metrics available.</p>'}</article>`;
  }

  function createController(options) {
    const document = global.document;
    const root = options.root || document.querySelector("[data-google-health-settings]");
    const activityRoot = options.activityRoot || document.querySelector("[data-google-health-activities]");
    const activityStatus = document.querySelector("[data-google-health-activities-status]");
    const client = options.supabaseClient;
    const email = emailKey(options.clientEmail);
    const preview = options.isPreview === true;
    const nodes = Object.fromEntries(["connect", "sync", "disconnect", "auto", "status", "last-sync", "message", "refresh", "revoke"].map((name) => [name, root?.querySelector(`[data-google-health-${name}]`)]));
    let destroyed = false;
    let initialized = false;
    let initializePromise = null;
    let refreshPromise = null;
    let busy = false;
    let statusLoaded = false;
    let statusFailed = false;
    let revocationPending = false;
    let status = { configured: false, connected: false, autoSync: false, needsReconnect: false };
    let activityRows = [];
    const listeners = [];

    function message(value) { if (!destroyed && nodes.message) nodes.message.textContent = value; }
    function render() {
      if (destroyed || !root) return;
      root.setAttribute("aria-busy", String(busy));
      const connected = status.connected;
      if (nodes.status) nodes.status.textContent = preview ? "Client preview" : statusFailed ? "Connection status unavailable" : !statusLoaded ? "Checking connection…" : !status.configured ? "Connection unavailable" : status.needsReconnect ? "Reconnect needed" : connected ? (status.autoSync ? "Automatic sync on" : "Automatic sync paused") : "Not connected";
      if (nodes.connect) {
        nodes.connect.hidden = connected && !status.needsReconnect;
        nodes.connect.disabled = busy || preview || !statusLoaded || !status.configured;
        nodes.connect.textContent = status.needsReconnect ? "Reconnect Google" : "Connect Google";
      }
      if (nodes.sync) { nodes.sync.hidden = !connected; nodes.sync.disabled = busy || preview || !status.configured || status.needsReconnect; }
      if (nodes.disconnect) { nodes.disconnect.hidden = !connected; nodes.disconnect.disabled = busy || preview; }
      if (nodes.auto) {
        nodes.auto.checked = connected && status.autoSync;
        nodes.auto.disabled = busy || preview || !connected || !status.configured || status.needsReconnect;
      }
      if (nodes.refresh) nodes.refresh.disabled = busy;
      if (nodes.revoke) nodes.revoke.hidden = !revocationPending;
      if (nodes["last-sync"]) nodes["last-sync"].textContent = status.lastSyncedAt ? `Last synced ${dateLabel(status.lastSyncedAt, true)}` : connected ? "Your first sync is pending." : "";
    }

    async function session() {
      if (destroyed || !client || !email) throw new Error("inactive");
      const result = await client.auth.getSession();
      const current = result.data?.session;
      if (destroyed || result.error || !current?.access_token || (!preview && emailKey(current.user?.email) !== email)) throw new Error("inactive");
      return current;
    }

    async function invoke(action, body = {}) {
      if (preview) throw new Error("preview");
      const current = await session();
      const result = await client.functions.invoke("fitbit-auth", {
        body: { action, ...body }, headers: { Authorization: `Bearer ${current.access_token}` }
      });
      if (destroyed) throw new Error("inactive");
      await session();
      if (result.error || result.data?.error) throw new Error("request-failed");
      return result.data || {};
    }

    async function loadStatus() {
      if (preview) { statusLoaded = true; render(); return; }
      const data = await invoke("status");
      if (destroyed) return;
      status = { configured: data.configured === true, connected: data.connected === true, autoSync: data.autoSync === true, needsReconnect: data.needsReconnect === true, lastSyncedAt: data.lastSyncedAt || null, lastSyncError: data.lastSyncError || null };
      statusLoaded = true;
      statusFailed = false;
      if (!status.configured) message("Google Health connections are not available yet. Please try again later.");
      else if (status.needsReconnect) message("Reconnect your Google account to resume importing workouts.");
      else if (status.lastSyncError) message("The last sync did not finish. Try Sync now, or reconnect if it keeps failing.");
      render();
    }

    async function loadActivities() {
      if (!activityRoot) return;
      await session();
      const result = await client.from("client_google_health_workouts")
        .select("source_name,workout_date,activity_type,duration_seconds,elapsed_seconds,calories,distance_meters,average_heart_rate")
        .eq("client_email", email).order("workout_date", { ascending: false }).order("started_at", { ascending: false }).limit(50);
      if (destroyed) return;
      await session();
      if (result.error) throw new Error("activities-failed");
      activityRows = Array.isArray(result.data) ? result.data : [];
      if (activityStatus) activityStatus.textContent = "";
      activityRoot.innerHTML = activityRows.length ? activityRows.map(activityMarkup).join("") : '<p class="google-health-help">No imported workouts yet. Connect Google Health in Settings to sync your Fitbit or Pixel Watch workouts.</p>';
    }

    async function readCurrent() {
      const results = await Promise.allSettled([loadStatus(), loadActivities()]);
      if (destroyed) return;
      if (results[0].status === "rejected") {
        statusFailed = true;
        render();
        message("Could not check your Google connection. Try Refresh status.");
      }
      if (results[1].status === "rejected") {
        const notice = "Imported workouts could not be refreshed. Open Settings and refresh to try again.";
        if (activityStatus) activityStatus.textContent = notice;
        else if (activityRoot && !activityRows.length) activityRoot.innerHTML = `<p class="google-health-help">${notice}</p>`;
      }
    }

    function refresh() {
      if (destroyed) return Promise.resolve();
      if (initializePromise && !initialized) return initializePromise;
      if (busy) return Promise.resolve();
      if (refreshPromise) return refreshPromise;
      refreshPromise = readCurrent().finally(() => { refreshPromise = null; });
      return refreshPromise;
    }

    async function run(operation, failure) {
      if (destroyed || busy || preview) return;
      if (refreshPromise) await refreshPromise;
      if (destroyed || busy) return;
      busy = true;
      message("");
      render();
      try { await operation(); }
      catch (_error) {
        if (!destroyed) { try { await loadStatus(); } catch (_statusError) {} message(failure); }
      } finally { busy = false; render(); }
    }

    function sync() {
      return run(async () => {
        if (!status.connected || status.needsReconnect) return;
        message("Syncing recent workouts…");
        const data = await invoke("sync");
        await readCurrent();
        const imported = Number(data.imported) || 0;
        const updated = Number(data.updated) || 0;
        message(imported || updated ? `Sync complete. ${imported} new workout${imported === 1 ? "" : "s"}${updated ? `, ${updated} updated` : ""}. View them in Saved logs.` : "Sync complete. Your workouts are up to date.");
      }, "Could not finish syncing. Try Sync now again, or reconnect your Google account.");
    }

    function connect() {
      return run(async () => {
        const data = await invoke("start");
        const url = new URL(data.authorizationUrl);
        if (url.protocol !== "https:" || url.hostname !== "accounts.google.com" || !String(data.state || "").startsWith("fwbgh_") || url.searchParams.get("state") !== data.state) throw new Error("invalid-authorization");
        global.sessionStorage.setItem(pendingKey, JSON.stringify({ state: data.state, clientEmail: email, createdAt: Date.now() }));
        message("Opening Google to connect your account…");
        global.location.assign(url.href);
      }, "Could not start the Google connection. Try again, or contact Benjamin if the problem continues.");
    }

    async function callback() {
      if (!isCallbackUrl(global.location.href)) return false;
      const url = new URL(global.location.href);
      const state = url.searchParams.get("state");
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const pending = pendingConnection();
      for (const name of ["code", "state", "error", "error_description", "error_uri", "scope", "authuser", "prompt"]) url.searchParams.delete(name);
      global.history.replaceState(global.history.state, "", `${url.pathname}${url.search}${url.hash}`);
      try { global.sessionStorage.removeItem(pendingKey); } catch (_error) {}
      const age = Date.now() - Number(pending?.createdAt);
      if (preview || !pending || pending.state !== state || emailKey(pending.clientEmail) !== email || !Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) {
        message("This Google connection request has expired or belongs to another account. Choose Connect Google to try again.");
        return false;
      }
      if (error || !code) { message("Google was not connected. You can try again when you are ready."); return false; }
      await invoke("callback", { code, state });
      if (destroyed) return false;
      options.onConnected?.();
      return true;
    }

    function initialize() {
      if (destroyed) return Promise.resolve();
      if (initializePromise) return initializePromise;
      busy = true;
      render();
      initializePromise = (async () => {
        let connected = false;
        try { connected = await callback(); }
        catch (_error) { message("Google could not be connected. Choose Connect Google to start again."); }
        await readCurrent();
        initialized = true;
        busy = false;
        render();
        if (connected && !destroyed) await sync();
      })();
      return initializePromise;
    }

    function listen(node, type, handler) {
      if (!node) return;
      node.addEventListener(type, handler);
      listeners.push(() => node.removeEventListener(type, handler));
    }
    listen(nodes.connect, "click", connect);
    listen(nodes.sync, "click", sync);
    listen(nodes.refresh, "click", () => { message(""); return refresh(); });
    listen(nodes.auto, "change", () => {
      const enabled = nodes.auto.checked;
      return run(async () => {
        await invoke("set-auto-sync", { enabled });
        await loadStatus();
        message(enabled ? "Automatic sync is on. Recent workouts are checked about every 15 minutes." : "Automatic sync is paused. You can still use Sync now.");
      }, "Could not change automatic sync. Your previous setting is still shown.");
    });
    listen(nodes.disconnect, "click", () => run(async () => {
      const result = await invoke("disconnect");
      status = { configured: status.configured, connected: false, autoSync: false, needsReconnect: false };
      revocationPending = result.revocationPending === true;
      try { global.sessionStorage.removeItem(pendingKey); } catch (_error) {}
      message(revocationPending
        ? "Google is disconnected from FWB. Remove FWB access from your Google Account connections to finish revoking access. Previously imported workouts remain in Saved logs."
        : "Google is disconnected. Previously imported workouts remain in Saved logs.");
    }, "Could not disconnect Google. Please try again."));

    render();
    return {
      initialize, refresh, sync,
      destroy() {
        destroyed = true;
        listeners.forEach((remove) => remove());
        if (activityRoot) activityRoot.innerHTML = "";
        if (activityStatus) activityStatus.textContent = "";
      }
    };
  }

  global.FWB_GOOGLE_HEALTH = { isCallbackUrl, createController };
})(typeof window !== "undefined" ? window : globalThis);
