(function () {
  "use strict";

  const workoutTypes = {
    general: "General HIIT",
    running: "Running",
    "jump-rope": "Jump Rope",
    cycling: "Cycling",
    rowing: "Rowing",
    "bodyweight-circuit": "Bodyweight Circuit",
    other: "Other"
  };
  // The same deterministic template ID used by HIITWorkoutLog on iOS and Watch.
  const templateID = "3593e1d7-4c7d-5bf0-938b-5da4257cc855";
  const uuidPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
  const inRange = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

  function timing(plan) {
    if (!plan || !Object.hasOwn(workoutTypes, plan.type)
        || !inRange(plan.work, 1, 600) || !inRange(plan.rest, 0, 600) || !inRange(plan.rounds, 1, 99)
        || !Array.isArray(plan.movements) || plan.movements.length > 12
        || plan.movements.some((name) => typeof name !== "string" || !name.trim() || Array.from(name).length > 100)) {
      return null;
    }
    const movementsPerRound = Math.max(1, plan.movements.length);
    const roundWork = plan.work * movementsPerRound;
    const cycle = roundWork + plan.rest;
    const total = plan.rounds * cycle - plan.rest;
    return total <= 86400 ? {roundWork, cycle, total} : null;
  }

  function elapsed(session, now) {
    const interval = session.runningSince == null ? 0 : Math.max(0, now - session.runningSince);
    return Math.min(timing(session.plan).total, (session.accumulated + interval) / 1000);
  }

  function progress(session, now) {
    const {plan} = session;
    const {total, cycle, roundWork} = timing(plan);
    const seconds = elapsed(session, now);
    const completed = Math.min(plan.rounds, Math.floor((Math.floor(seconds) + plan.rest) / cycle));
    if (session.endedAt != null || seconds >= total) {
      return {phase: "finished", total, seconds, completed};
    }
    const round = Math.floor(seconds / cycle) + 1;
    const inRound = seconds - (round - 1) * cycle;
    const paused = session.runningSince == null;
    if (inRound >= roundWork) {
      return {phase: "rest", total, seconds, completed, round, paused, left: Math.ceil(cycle - inRound),
        interval: round + ":rest", next: plan.movements[0] || "Work"};
    }
    const index = Math.floor(inRound / plan.work);
    const next = plan.movements[index + 1] || (round === plan.rounds ? "Finish" : plan.rest > 0 ? "Rest" : plan.movements[0] || "Work");
    return {phase: "work", total, seconds, completed, round, paused, left: Math.ceil((index + 1) * plan.work - inRound),
      interval: round + ":" + index, movement: plan.movements[index], next};
  }

  function localDay(instant) {
    const date = new Date(instant);
    return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
      .map((part) => String(part).padStart(2, "0"))
      .join("-");
  }

  function logRow(session, email) {
    const {plan} = session;
    const result = progress(session, session.endedAt);
    const duration = Math.floor(result.seconds);
    const notes = ["Cardio format: intervals", `Work: ${plan.work} seconds`, `Rest: ${plan.rest} seconds`, `Rounds: ${result.completed}`];
    if (plan.movements.length) notes.push("Stations: " + plan.movements.join(" | "));
    if (result.completed < plan.rounds) notes.push("Planned rounds: " + plan.rounds);
    const title = plan.type === "general" ? "HIIT Workout" : workoutTypes[plan.type] + " HIIT";
    const completedAt = new Date(session.endedAt).toISOString();
    return {
      client_email: email.trim().toLowerCase(),
      session_id: session.id,
      set_id: session.setID,
      workout_template_id: templateID,
      entry_date: session.entryDate,
      // Both clients strip a trailing UUID from the display title. Preserve distinct same-day sessions.
      workout_title: title + " · " + session.id,
      exercise_code: "CARDIO",
      exercise_name: plan.type === "general" ? "HIIT" : workoutTypes[plan.type],
      exercise_order: 0,
      set_number: 1,
      weight_used: duration / 60,
      set_type: "timed",
      duration_seconds: duration,
      workout_duration_seconds: duration,
      notes: notes.join("\n"),
      source: "website",
      source_version: 1,
      client_updated_at: completedAt,
      completed_at: completedAt
    };
  }

  function clock(seconds) {
    const field = (number) => String(number).padStart(2, "0");
    const minutes = field(Math.floor(seconds / 60) % 60);
    return (seconds >= 3600 ? Math.floor(seconds / 3600) + ":" : "") + minutes + ":" + field(seconds % 60);
  }

  function validSession(value) {
    return value && timing(value.plan) && uuidPattern.test(value.id) && uuidPattern.test(value.setID)
      && /^\d{4}-\d{2}-\d{2}$/.test(value.entryDate) && Number.isFinite(value.startedAt)
      && Number.isFinite(value.accumulated) && value.accumulated >= 0
      && (value.endedAt === null || Number.isFinite(value.endedAt))
      && (value.runningSince === null || Number.isFinite(value.runningSince));
  }

  if (typeof module === "object" && module.exports) {
    module.exports = {timing, progress, logRow, localDay};
    return;
  }

  const find = (name) => document.querySelector("[data-hiit-" + name + "]");
  const status = find("status");
  const setup = find("setup");
  const running = find("running");
  const finished = find("finished");
  const finishDialog = find("dialog");
  const pause = find("pause");
  const saveState = find("save-state");
  const retry = find("retry");
  const auth = window.FWB_AUTH_SESSION;
  let client, user, session, timer, wakeLock, audio, starting, saving, lastInterval;
  let stopped = false;
  let requestingWake = false;
  let lastWakeNotice = "";

  function showStatus(message = "", error = false) {
    status.textContent = message;
    status.classList.toggle("hiit-error", error);
  }

  function setSection(open) {
    for (const section of [setup, running, finished]) section.hidden = section !== open;
  }

  function storageKey() {
    return "fwb-web-hiit-session:" + user.id;
  }

  function persist() {
    try {
      if (session) sessionStorage.setItem(storageKey(), JSON.stringify(session));
      else sessionStorage.removeItem(storageKey());
    } catch { /* The current timer remains usable when browser storage is unavailable. */ }
  }

  function readSession() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey()));
      return validSession(stored) ? stored : null;
    } catch {
      return null;
    }
  }

  function eligibleWake() {
    return Boolean(!stopped && session && session.runningSince != null && session.endedAt == null
      && document.visibilityState === "visible");
  }

  function wakeStatus(message) {
    if (lastWakeNotice !== message) find("screen").textContent = message;
    lastWakeNotice = message;
  }

  function releaseWake() {
    const previous = wakeLock;
    wakeLock = null;
    void previous?.release().catch(() => {});
    wakeStatus("");
  }

  async function acquireWake() {
    if (!eligibleWake() || requestingWake || wakeLock) return;
    if (!navigator.wakeLock?.request) {
      wakeStatus("Screen wake lock is unavailable in this browser.");
      return;
    }
    requestingWake = true;
    const requestedFor = session.id;
    try {
      const sentinel = await navigator.wakeLock.request("screen");
      if (!eligibleWake() || session.id !== requestedFor || sentinel.released) {
        await sentinel.release();
        return;
      }
      wakeLock = sentinel;
      wakeStatus("Screen will stay awake while the timer runs.");
      sentinel.addEventListener("release", () => {
        if (wakeLock !== sentinel) return;
        wakeLock = null;
        wakeStatus(document.visibilityState === "visible" ? "The browser released screen wake lock." : "");
      }, {once: true});
    } catch {
      if (eligibleWake()) wakeStatus("The browser couldn’t keep the screen awake.");
    } finally {
      requestingWake = false;
    }
  }

  function unlockAudio() {
    if (!(session?.plan.sounds || setup.elements.sounds.checked)) return;
    try {
      if (!audio) audio = new window.AudioContext();
      void audio.resume().catch(() => {});
    } catch { /* Sound is optional. */ }
  }

  function sound(phase) {
    if (!session.plan.sounds || !audio || audio.state !== "running" || document.visibilityState !== "visible") return;
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    const start = audio.currentTime;
    tone.frequency.value = phase === "work" ? 680 : phase === "rest" ? 420 : 860;
    gain.gain.setValueAtTime(0.1, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
    tone.connect(gain).connect(audio.destination);
    tone.start(start);
    tone.stop(start + 0.25);
  }

  function readPlan() {
    const {type, work, rest, rounds, movements, sounds} = setup.elements;
    return {type: type.value, work: work.valueAsNumber, rest: rest.valueAsNumber, rounds: rounds.valueAsNumber,
      movements: movements.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean), sounds: sounds.checked};
  }

  function populate(plan) {
    const {type, work, rest, rounds, movements, sounds} = setup.elements;
    type.value = plan.type;
    work.value = plan.work;
    rest.value = plan.rest;
    rounds.value = plan.rounds;
    movements.value = plan.movements.join("\n");
    sounds.checked = Boolean(plan.sounds);
    showPlanTime();
  }

  function showPlanTime() {
    const plan = timing(readPlan());
    find("planned").textContent = plan ? `Planned time ${clock(plan.total)}` : "";
  }

  function setSaveState(message, state) {
    saveState.textContent = message;
    saveState.classList.toggle("hiit-error", state === "failed");
    retry.hidden = state !== "failed";
    find("logs").hidden = state !== "saved";
    find("new").hidden = state !== "saved";
  }

  async function save() {
    if (!session || session.saved || saving || stopped) return;
    saving = true;
    setSaveState("Saving workout…", "saving");
    const completed = session;
    try {
      const row = logRow(completed, user.email);
      const result = await auth.withAccount(client, {id: user.id, email: user.email}, () =>
        client.from("client_workout_logs").upsert(row, {onConflict: "session_id,set_id", ignoreDuplicates: true}).select("session_id"));
      if (result.error) throw result.error;
      if (!result.data?.length) {
        // An earlier request may have committed before its response was lost.
        const existing = await auth.withAccount(client, {id: user.id, email: user.email}, () =>
          client.from("client_workout_logs").select("session_id").eq("session_id", completed.id).eq("set_id", completed.setID).maybeSingle());
        if (existing.error || existing.data?.session_id !== completed.id) throw existing.error || new Error("Workout save unconfirmed.");
      }
      if (stopped || session !== completed) return;
      completed.saved = true;
      persist();
      setSaveState("Workout saved to Logs.", "saved");
    } catch (error) {
      if (stopped || session !== completed) return;
      if (auth.requiresLogin(error)) return goToLogin();
      const deleted = error?.message === "workout_session_deleted";
      if (deleted) {
        setSaveState("This workout was deleted from your logs.", "deleted");
        find("new").hidden = false;
      } else {
        setSaveState("Your workout hasn’t synced. Retry when you’re connected.", "failed");
      }
    } finally {
      saving = false;
    }
  }

  function renderFinished({focus = false} = {}) {
    const summary = progress(session, session.endedAt);
    setSection(finished);
    find("type").textContent = workoutTypes[session.plan.type];
    find("duration").textContent = clock(Math.floor(summary.seconds));
    find("rounds").textContent = `${summary.completed} of ${session.plan.rounds}`;
    if (focus) {
      const heading = finished.querySelector("h2");
      heading.tabIndex = -1;
      heading.focus();
    }
    if (session.saved) setSaveState("Workout saved to Logs.", "saved");
    else void save();
  }

  function finishSession(now = Date.now()) {
    const seconds = elapsed(session, now);
    if (seconds < 1) {
      showStatus("Log at least one second before finishing.", true);
      return;
    }
    showStatus();
    if (finishDialog.open) finishDialog.close();
    clearInterval(timer);
    sound("finished");
    releaseWake();
    const remaining = timing(session.plan).total * 1000 - session.accumulated;
    const end = session.runningSince == null ? now : Math.min(now, session.runningSince + remaining);
    session.endedAt = end;
    session.accumulated = seconds * 1000;
    session.runningSince = null;
    persist();
    renderFinished({focus: true});
  }

  function tick() {
    if (stopped || !session || session.endedAt != null) return;
    const now = Date.now();
    const current = progress(session, now);
    if (current.phase === "finished") {
      finishSession(now);
      return;
    }
    const phase = current.paused ? "Paused" : current.phase === "rest" ? "Rest" : current.movement || "Work";
    if (find("phase").textContent !== phase) find("phase").textContent = phase;
    find("clock").textContent = clock(current.left);
    find("round").textContent = `Round ${current.round} of ${session.plan.rounds}`;
    find("next").textContent = `Up next ${current.next}`;
    find("progress").max = current.total;
    find("progress").value = current.seconds;
    running.dataset.phase = current.phase;
    pause.textContent = current.paused ? "Resume" : "Pause";
    if (lastInterval !== current.interval && !current.paused) sound(current.phase);
    lastInterval = current.interval;
  }

  function showTimer() {
    setSection(running);
    showStatus();
    lastInterval = undefined;
    tick();
    clearInterval(timer);
    if (!session.endedAt && session.runningSince != null) {
      timer = window.setInterval(tick, 125);
      void acquireWake();
    }
  }

  function enterSetup() {
    clearInterval(timer);
    releaseWake();
    session = null;
    persist();
    showStatus();
    setSection(setup);
    showPlanTime();
  }

  function goToLogin() {
    stopped = true;
    clearInterval(timer);
    releaseWake();
    window.location.replace("/client-login.html?return_to=" + encodeURIComponent("/client-hiit.html"));
  }

  setup.addEventListener("input", showPlanTime);
  setup.addEventListener("submit", (event) => {
    event.preventDefault();
    if (stopped || session || !user) return;
    const plan = readPlan();
    if (!timing(plan)) {
      showStatus("Use up to 12 movements with 100 characters each. Keep the total time within 24 hours.", true);
      return;
    }
    unlockAudio();
    const start = Date.now();
    session = {id: crypto.randomUUID(), setID: crypto.randomUUID(), plan, entryDate: localDay(start),
      startedAt: start, runningSince: start, accumulated: 0, endedAt: null};
    persist();
    showTimer();
    pause.focus();
  });

  pause.addEventListener("click", () => {
    if (!session || session.endedAt != null || stopped) return;
    const now = Date.now();
    if (progress(session, now).phase === "finished") return finishSession(now);
    if (session.runningSince == null) {
      unlockAudio();
      session.runningSince = now;
      showTimer();
    } else {
      session.accumulated = elapsed(session, now) * 1000;
      session.runningSince = null;
      clearInterval(timer);
      releaseWake();
      tick();
    }
    persist();
  });

  find("finish").addEventListener("click", () => {
    if (!session || session.endedAt != null || stopped) return;
    finishDialog.returnValue = "";
    finishDialog.showModal();
  });
  finishDialog.addEventListener("close", () => {
    if (finishDialog.returnValue === "finish" && session?.endedAt == null && session && !stopped) finishSession();
  });
  retry.addEventListener("click", () => void save());
  find("new").addEventListener("click", enterSetup);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      tick();
      void acquireWake();
    } else {
      releaseWake();
    }
  });
  window.addEventListener("pagehide", releaseWake);
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted || !session) return;
    tick();
    void acquireWake();
  });

  async function start() {
    if (starting || user || stopped) return;
    starting = true;
    try {
      const config = window.FWB_SUPABASE_CONFIG;
      if (!config?.url || !config.anonKey || !auth || !window.supabase) throw new Error("HIIT Timer could not start.");
      client ||= window.supabase.createClient(config.url, config.anonKey, {
        auth: {storage: auth.storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false}
      });
      const {data, error} = await client.auth.getUser();
      if (auth.requiresLogin(error) || (!error && !data?.user)) return goToLogin();
      if (error || !data.user.email) throw error || new Error("Missing account email.");
      user = data.user;
      client.auth.onAuthStateChange((event, next) => {
        if (event === "SIGNED_OUT" || (next?.user?.id && next.user.id !== user.id)) queueMicrotask(goToLogin);
      });
      session = readSession();
      showStatus();
      if (session) {
        populate(session.plan);
        if (session.endedAt != null) renderFinished();
        else showTimer();
      } else {
        enterSetup();
      }
    } catch {
      showStatus("HIIT Timer couldn’t load. Check your connection and try again.", true);
      const reconnect = document.createElement("button");
      reconnect.className = "hiit-secondary";
      reconnect.textContent = "Retry";
      reconnect.addEventListener("click", () => { reconnect.remove(); void start(); });
      status.after(reconnect);
    } finally {
      starting = false;
    }
  }

  void start();
})();
