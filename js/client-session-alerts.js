(function (global) {
  "use strict";

  const lowThreshold = 2;
  const emailKey = (value) => String(value || "").trim().toLowerCase();

  function summarize(program) {
    if (!program || program.active === false || program.client_archived === true) return null;
    const used = Number(program.session_count_used ?? 0);
    const total = Number(program.session_count_total);
    if (!Number.isInteger(used) || used < 0 || !Number.isInteger(total) || total <= 0) return null;
    const remaining = Math.max(total - used, 0);
    return { used, total, remaining, state: remaining === 0 ? "out" : remaining <= lowThreshold ? "low" : "ready" };
  }

  function latestProgram(programs, email) {
    if (!emailKey(email)) return null;
    return (Array.isArray(programs) ? programs : []).filter((program) => (
      emailKey(program.client_email) === emailKey(email) && program.active !== false && program.client_archived !== true
    )).slice().sort((a, b) => (
      String(b.updated_at || "").localeCompare(String(a.updated_at || "")) ||
      String(b.created_at || "").localeCompare(String(a.created_at || "")) ||
      String(b.id || "").localeCompare(String(a.id || ""))
    ))[0] || null;
  }

  function render(document, program) {
    const balance = summarize(program);
    const visible = balance && balance.state !== "ready";
    document.querySelectorAll("[data-client-session-alert]").forEach((notice) => {
      notice.hidden = !visible;
      if (!visible) {
        delete notice.dataset.state;
        return;
      }
      notice.dataset.state = balance.state;
      const title = balance.state === "out" ? "No sessions remaining"
        : `${balance.remaining} coaching session${balance.remaining === 1 ? "" : "s"} remaining`;
      const message = balance.state === "out"
        ? "Your current session package is complete. Contact Benjamin to renew."
        : "Your session package is running low. Contact Benjamin to plan your next package.";
      for (const [selector, value] of [["[data-session-alert-title]", title], ["[data-session-alert-message]", message]]) {
        const field = notice.querySelector(selector);
        if (field && field.textContent !== value) field.textContent = value;
      }
    });
    return balance;
  }

  function createController(options) {
    const document = options.document || global.document;
    const email = emailKey(options.clientEmail);
    let destroyed = false;
    let pending = null;
    let abort = null;
    let signature;

    function publish(program) {
      if (destroyed) return;
      render(document, program);
      const next = JSON.stringify(program);
      if (next !== signature) {
        signature = next;
        options.onUpdate?.(program);
      }
    }

    function refresh() {
      if (destroyed || document.hidden || !email || !options.supabaseClient) return Promise.resolve();
      if (pending) return pending;
      abort = new global.AbortController();
      const timeout = global.setTimeout(() => abort?.abort(), 15000);
      pending = Promise.resolve().then(async () => {
        try {
          const { data, error } = await options.supabaseClient.from("client_programs")
            .select("id,client_email,active,client_archived,updated_at,created_at,session_count_used,session_count_total,session_dates,session_package_history,sheet_url")
            .eq("active", true)
            .ilike("client_email", email.replace(/[\\%_]/g, "\\$&"))
            .or("client_archived.is.null,client_archived.eq.false")
            .order("updated_at", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false, nullsFirst: false })
            .order("id", { ascending: false })
            .limit(1).abortSignal(abort.signal);
          if (!error && !destroyed) publish(latestProgram(data, email));
        } catch (_error) {
          // Keep the last confirmed balance through temporary connection failures.
        } finally {
          global.clearTimeout(timeout);
          pending = null;
          abort = null;
        }
      });
      return pending;
    }

    publish(latestProgram(options.programs, email));
    const onVisible = () => { if (!document.hidden) void refresh(); };
    global.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const timer = global.setInterval(onVisible, 60000);
    return {
      refresh,
      destroy() {
        destroyed = true;
        abort?.abort();
        global.clearInterval(timer);
        global.removeEventListener("focus", onVisible);
        document.removeEventListener("visibilitychange", onVisible);
        render(document, null);
      }
    };
  }

  const api = { lowThreshold, summarize, latestProgram, render, createController };
  global.FWB_SESSION_BALANCE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
