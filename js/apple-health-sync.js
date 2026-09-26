(function (global) {
  "use strict";

  const categoryLabels = { workouts: "Workouts", activity: "Steps", recovery: "Sleep & recovery", bodyWeight: "Body weight" };
  const metricDefinitions = [
    { key: "steps", category: "activity", label: "Steps", unit: "", max: 200000, digits: 0 },
    { key: "sleep_minutes", category: "recovery", label: "Sleep", unit: "hr", max: 1500, divisor: 60, digits: 1 },
    { key: "resting_heart_rate", category: "recovery", label: "Resting heart rate", unit: "bpm", min: 20, max: 300, digits: 0 },
    { key: "hrv_ms", category: "recovery", label: "Heart-rate variability", unit: "ms", max: 2000, digits: 1 },
    { key: "body_weight_kg", category: "bodyWeight", label: "Body weight", unit: "kg", min: 1, max: 700, digits: 1 }
  ];
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
  const emailKey = (value) => String(value || "").trim().toLowerCase();
  const categories = (value) => [...new Set(Array.isArray(value) ? value.filter((key) => Object.hasOwn(categoryLabels, key)) : [])];
  function numeric(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
    if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
  }
  function dayKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function validDay(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
    const date = new Date(`${value}T12:00:00`);
    return Number.isFinite(date.getTime()) && dayKey(date) === value;
  }
  function dateLabel(value) {
    if (!validDay(value)) return "";
    return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  function timeLabel(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  }
  const formatNumber = (value, digits = 1) => value.toLocaleString(undefined, { maximumFractionDigits: digits });
  const metricValue = (row, metric) => numeric(row?.[metric.key], metric.min ?? 0, metric.max);
  const displayMetric = (value, metric) => value === null ? "—" : `${formatNumber(value / (metric.divisor || 1), metric.digits)}${metric.unit ? ` ${metric.unit}` : ""}`;
  const notConfigured = (error) => ["42P01", "PGRST205", "PGRST204"].includes(error?.code);
  const fault = (code) => Object.assign(new Error(code), { code });

  async function read(query, signal) {
    const { data, error } = await (signal && query.abortSignal ? query.abortSignal(signal) : query);
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function loadSnapshot({ supabaseClient: client, clientEmail, isCoach = false, expectedUserId, signal, now = new Date() }) {
    const email = emailKey(clientEmail);
    if (!client || !email) return { state: "unselected", categories: [], daily: [], workouts: [] };
    const auth = await client.auth.getUser();
    const actor = auth.data?.user;
    if (auth.error || !actor?.id || (expectedUserId && actor.id !== expectedUserId)) throw fault("AUTH_CHANGED");
    if (!isCoach && emailKey(actor.email) !== email) throw fault("AUTH_CHANGED");
    const settingsQuery = () => client.from("client_apple_health_settings")
      .select("user_id,client_email,shared_categories,updated_at").eq("client_email", email).limit(2);
    const resolveSettings = (rows) => {
      if (rows.length > 1) throw fault("AMBIGUOUS_ACCOUNT");
      const row = rows[0];
      if (row && (emailKey(row.client_email) !== email || !row.user_id || (!isCoach && row.user_id !== actor.id))) throw fault("AUTH_CHANGED");
      return row;
    };
    try {
      const settings = resolveSettings(await read(settingsQuery(), signal));
      const shared = categories(settings?.shared_categories);
      const empty = { state: "not-shared", actorId: actor.id, categories: [], daily: [], workouts: [] };
      if (!shared.length) return empty;
      const since = new Date(now);
      since.setHours(0, 0, 0, 0);
      since.setDate(since.getDate() - 29);
      const metrics = metricDefinitions.filter((metric) => shared.includes(metric.category));
      const [daily, workouts] = await Promise.all([
        metrics.length ? read(client.from("client_apple_health_daily")
          .select(["user_id", "client_email", "date", "updated_at", ...metrics.map((metric) => metric.key)].join(","))
          .eq("user_id", settings.user_id).eq("client_email", email)
          .gte("date", dayKey(since)).lte("date", dayKey(now)).order("date", { ascending: false }).limit(32), signal) : [],
        shared.includes("workouts") ? read(client.from("client_apple_health_workouts")
          .select("user_id,client_email,healthkit_id,activity_type,started_at,ended_at,duration_seconds,active_calories,distance_meters,average_heart_rate,source_name,updated_at")
          .eq("user_id", settings.user_id).eq("client_email", email)
          .gte("started_at", since.toISOString()).lte("started_at", now.toISOString())
          .order("started_at", { ascending: false }).limit(1000), signal) : []
      ]);
      // Re-check consent after the reads: a revocation during loading never reveals stale fields.
      const currentSettings = resolveSettings(await read(settingsQuery(), signal));
      if (!currentSettings || currentSettings.user_id !== settings.user_id) return empty;
      const allowed = shared.filter((category) => categories(currentSettings.shared_categories).includes(category));
      if (!allowed.length) return empty;
      const owned = (row) => row.user_id === settings.user_id && emailKey(row.client_email) === email;
      const safeDaily = daily.filter((row) => owned(row) && validDay(row.date) && row.date >= dayKey(since) && row.date <= dayKey(now))
        .map((row) => {
          const record = { date: row.date, updated_at: row.updated_at };
          metricDefinitions.filter((metric) => allowed.includes(metric.category)).forEach((metric) => { record[metric.key] = metricValue(row, metric); });
          return record;
        }).sort((a, b) => b.date.localeCompare(a.date));
      const safeWorkouts = allowed.includes("workouts") ? workouts.filter((row) => owned(row)
        && Number.isFinite(Date.parse(row.started_at)) && Date.parse(row.started_at) >= since.getTime()
        && Date.parse(row.started_at) <= now.getTime()
        && numeric(row.duration_seconds, 1, 604800) !== null).map((row) => ({
        healthkit_id: String(row.healthkit_id || ""), activity_type: String(row.activity_type || "Workout").slice(0, 100),
        started_at: row.started_at, duration_seconds: numeric(row.duration_seconds, 1, 604800),
        active_calories: numeric(row.active_calories, 0, 100000), distance_meters: numeric(row.distance_meters, 0, 2000000),
        average_heart_rate: numeric(row.average_heart_rate, 20, 300), source_name: String(row.source_name || "Apple Health").slice(0, 100), updated_at: row.updated_at
      })).sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at)) : [];
      const timestamps = [...safeDaily, ...safeWorkouts].map((row) => Date.parse(row.updated_at))
        .filter((value) => Number.isFinite(value) && value <= now.getTime() + 60000);
      const currentActor = await client.auth.getUser();
      if (currentActor.error || currentActor.data?.user?.id !== actor.id) throw fault("AUTH_CHANGED");
      return { state: "ready", actorId: actor.id, categories: allowed, daily: safeDaily, workouts: safeWorkouts,
        lastImported: timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null };
    } catch (error) {
      if (notConfigured(error)) return { state: "not-configured", actorId: actor.id, categories: [], daily: [], workouts: [] };
      throw error;
    }
  }

  function weightTrend(daily) {
    const points = daily.filter((row) => numeric(row.body_weight_kg, 1, 700) !== null).slice().reverse();
    if (!points.length) return '<p class="apple-health-help">No shared weigh-ins in the last 30 days.</p>';
    const first = points[0], last = points[points.length - 1];
    const change = last.body_weight_kg - first.body_weight_kg;
    let chart = "";
    if (points.length > 1) {
      const values = points.map((row) => row.body_weight_kg), min = Math.min(...values), span = Math.max(...values) - min;
      const start = Date.parse(`${first.date}T12:00:00Z`), days = Math.max(86400000, Date.parse(`${last.date}T12:00:00Z`) - start);
      const coordinates = points.map((row) => `${(16 + 328 * (Date.parse(`${row.date}T12:00:00Z`) - start) / days).toFixed(2)},${(span ? 108 - 88 * (row.body_weight_kg - min) / span : 64).toFixed(2)}`);
      chart = `<svg class="apple-health-weight-chart" viewBox="0 0 360 128" role="img" aria-label="Body weight from ${escape(dateLabel(first.date))} to ${escape(dateLabel(last.date))}; ${escape(formatNumber(change))} kg change"><polyline points="${coordinates.join(" ")}" />${coordinates.map((point) => { const [x, y] = point.split(","); return `<circle cx="${x}" cy="${y}" r="3" />`; }).join("")}</svg>`;
    }
    return `<section class="apple-health-weight"><h4>Body weight · last 30 days</h4>${chart}<p class="apple-health-help">${points.length} shared weigh-in${points.length === 1 ? "" : "s"}${points.length > 1 ? ` · ${change > 0 ? "+" : ""}${escape(formatNumber(change))} kg from first to latest` : ""}. Missing days are not estimated.</p></section>`;
  }

  function renderSnapshot(snapshot, { compact = false, workoutLimit = 20 } = {}) {
    if (snapshot.state !== "ready") return "";
    const shared = `<p class="apple-health-shared">Shared: ${snapshot.categories.map((key) => escape(categoryLabels[key])).join(" · ")}</p>`;
    if (compact) return shared;
    const metrics = metricDefinitions.filter((metric) => snapshot.categories.includes(metric.category));
    const latest = metrics.length ? `<dl class="apple-health-metrics">${metrics.map((metric) => {
      const row = snapshot.daily.find((day) => metricValue(day, metric) !== null);
      return `<div><dt>${escape(metric.label)}</dt><dd>${escape(displayMetric(row ? metricValue(row, metric) : null, metric))}</dd><small>${row ? escape(dateLabel(row.date)) : "No shared reading"}</small></div>`;
    }).join("")}</dl>` : "";
    const history = snapshot.daily.length && metrics.length ? `<details class="apple-health-history"><summary>Daily history · last 30 days</summary><div class="apple-health-table-scroll"><table><thead><tr><th scope="col">Date</th>${metrics.map((metric) => `<th scope="col">${escape(metric.label)}</th>`).join("")}</tr></thead><tbody>${snapshot.daily.map((row) => `<tr><th scope="row">${escape(dateLabel(row.date))}</th>${metrics.map((metric) => `<td>${escape(displayMetric(metricValue(row, metric), metric))}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>` : "";
    const workouts = snapshot.categories.includes("workouts") ? `<section class="apple-health-workouts"><h4>Imported workouts · last 30 days</h4>${snapshot.workouts.length ? `<div class="apple-health-workout-list">${snapshot.workouts.slice(0, workoutLimit).map((row) => {
      const readings = [`${formatNumber(row.duration_seconds / 60)} min`];
      if (row.active_calories !== null) readings.push(`${formatNumber(row.active_calories, 0)} active kcal`);
      if (row.distance_meters !== null) readings.push(`${formatNumber(row.distance_meters / 1000, 2)} km`);
      if (row.average_heart_rate !== null) readings.push(`${formatNumber(row.average_heart_rate, 0)} bpm average`);
      return `<article><h5>${escape(row.activity_type.replace(/_/g, " "))}</h5><time datetime="${escape(row.started_at)}">${escape(timeLabel(row.started_at))}</time><p>${readings.map(escape).join(" · ")}</p><small>Source: ${escape(row.source_name)}</small></article>`;
    }).join("")}</div>${snapshot.workouts.length > workoutLimit ? `<button type="button" data-apple-health-more>Show more workouts (${Math.min(workoutLimit, snapshot.workouts.length)} of ${snapshot.workouts.length})</button>` : ""}` : '<p class="apple-health-help">No shared workouts in the last 30 days.</p>'}</section>` : "";
    return `${shared}${latest}${snapshot.categories.includes("bodyWeight") ? weightTrend(snapshot.daily) : ""}${history}${workouts}`;
  }

  function createController(options) {
    const document = global.document;
    const roots = options.roots ? Array.from(options.roots) : Array.from(document.querySelectorAll("[data-apple-health-view], [data-apple-health-summary]"));
    const client = options.supabaseClient;
    let destroyed = false, generation = 0, activeRequest = null, abort = null, requestTimeout = null;
    let actorId = options.expectedUserId || null, snapshot = null, workoutLimit = 20;
    const cleanups = [];
    const clear = (message) => roots.forEach((root) => {
      const content = root.querySelector("[data-apple-health-content]");
      const status = root.querySelector("[data-apple-health-status]");
      if (content) content.innerHTML = "";
      if (status) status.textContent = message;
    });
    function render() {
      if (destroyed || !snapshot) return;
      const coach = options.isCoach === true;
      const messages = {
        unselected: "Choose a client to see shared Apple Health information.",
        "not-configured": "Apple Health sharing is not available here yet.",
        "not-shared": coach ? "This client has not shared Apple Health information with FWB." : "Apple Health sharing is off. Choose what to share in the FWB iPhone app.",
        ready: snapshot.lastImported ? `Last imported ${timeLabel(snapshot.lastImported)}. Readings may be from different days.` : "Sharing is enabled. No readings have been imported in the last 30 days."
      };
      roots.forEach((root) => {
        const content = root.querySelector("[data-apple-health-content]");
        const status = root.querySelector("[data-apple-health-status]");
        if (content) content.innerHTML = renderSnapshot(snapshot, { compact: root.hasAttribute("data-apple-health-summary"), workoutLimit });
        if (status) status.textContent = messages[snapshot.state] || "Shared Apple Health information is unavailable.";
      });
    }
    function setBusy(value) {
      roots.forEach((root) => {
        root.setAttribute("aria-busy", String(value));
        const button = root.querySelector("[data-apple-health-refresh]");
        if (button) button.disabled = value;
      });
    }
    async function refresh() {
      if (destroyed || !roots.length) return;
      if (activeRequest) return activeRequest;
      const version = ++generation;
      clear("Checking shared Apple Health information…");
      snapshot = null;
      setBusy(true);
      abort = typeof global.AbortController === "function" ? new global.AbortController() : null;
      const timeout = new Promise((_, reject) => {
        requestTimeout = global.setTimeout(() => { abort?.abort(); reject(fault("TIMEOUT")); }, 15000);
      });
      activeRequest = (async () => {
        try {
          const result = await Promise.race([loadSnapshot({ ...options, expectedUserId: actorId, signal: abort?.signal }), timeout]);
          if (destroyed || version !== generation) return;
          actorId = result.actorId || actorId;
          snapshot = result;
          workoutLimit = 20;
          render();
        } catch (error) {
          if (destroyed || version !== generation) return;
          clear(error?.code === "AUTH_CHANGED" ? "Your session changed. Reopen this page to continue." : "Couldn’t load shared Apple Health information. Refresh to try again.");
        } finally {
          global.clearTimeout(requestTimeout);
          if (!destroyed && version === generation) { activeRequest = null; setBusy(false); }
        }
      })();
      return activeRequest;
    }
    function destroy() {
      if (destroyed) return;
      destroyed = true;
      generation++;
      abort?.abort();
      global.clearTimeout(requestTimeout);
      cleanups.splice(0).forEach((cleanup) => cleanup());
      snapshot = null;
      clear("");
      setBusy(false);
    }
    roots.forEach((root) => {
      const click = (event) => {
        if (event.target.closest?.("[data-apple-health-refresh]")) { event.preventDefault(); void refresh(); }
        if (event.target.closest?.("[data-apple-health-more]")) { event.preventDefault(); workoutLimit += 20; render(); }
        if (event.target.closest?.("[data-apple-health-open-stats]")) { event.preventDefault(); options.onOpenStats?.(); }
      };
      root.addEventListener("click", click);
      cleanups.push(() => root.removeEventListener("click", click));
    });
    const visibility = () => {
      if (document.visibilityState === "hidden") { snapshot = null; clear(""); }
      else if (roots.some((root) => !root.closest("[hidden]"))) void refresh();
    };
    document.addEventListener("visibilitychange", visibility);
    cleanups.push(() => document.removeEventListener("visibilitychange", visibility));
    const subscription = client?.auth.onAuthStateChange?.((event, session) => {
      if (event === "SIGNED_OUT" || (actorId && session?.user?.id && session.user.id !== actorId)) destroy();
    })?.data?.subscription;
    if (subscription) cleanups.push(() => subscription.unsubscribe());
    clear(options.clientEmail ? "Checking shared Apple Health information…" : "Choose a client to see shared Apple Health information.");
    return { initialize: refresh, refresh, destroy };
  }

  global.FWB_APPLE_HEALTH = Object.freeze({ createController, loadSnapshot, renderSnapshot, numeric, validDay });
})(typeof window === "undefined" ? globalThis : window);
