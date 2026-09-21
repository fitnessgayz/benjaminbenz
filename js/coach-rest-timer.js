(() => {
  const panel = document.getElementById("coach-rest-timer");
  if (!panel) return;

  const display = document.getElementById("coach-rest-timer-display");
  const status = document.getElementById("coach-rest-timer-status");
  const duration = document.getElementById("coach-rest-timer-duration");
  const toggleButton = document.getElementById("coach-rest-timer-toggle");
  let remaining = 60;
  let restDuration = 60;
  let endsAt = 0;
  let interval = null;
  let active = false;
  let complete = false;
  let inline = false;
  let owner = null;
  const listeners = new Set();

  function clearTick() {
    window.clearInterval(interval);
    interval = null;
  }

  function syncTime() {
    if (endsAt) {
      remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (!remaining) {
        endsAt = 0;
        complete = true;
        clearTick();
      }
    }
  }

  function getState() {
    syncTime();
    return { remaining, running: Boolean(endsAt), active, complete, owner, inline };
  }

  function render() {
    const state = getState();
    panel.hidden = !active || inline;
    if (display) display.textContent = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
    const message = endsAt ? "Rest timer" : remaining ? "Rest paused" : "Rest complete — ready for the next set";
    if (status && status.textContent !== message) status.textContent = message;
    if (toggleButton) toggleButton.textContent = endsAt ? "Pause" : remaining ? "Resume" : "Restart";
    listeners.forEach((listener) => listener({ ...state }));
  }

  function run() {
    clearTick();
    active = true;
    complete = false;
    endsAt = Date.now() + remaining * 1000;
    interval = window.setInterval(render, 250);
    render();
  }

  function start(options = {}) {
    const chosenDuration = Number(options.durationSeconds ?? duration?.value);
    remaining = Number.isFinite(chosenDuration) && chosenDuration > 0
      ? Math.ceil(chosenDuration)
      : 60;
    restDuration = remaining;
    inline = options.inline === true;
    owner = options.owner ?? null;
    run();
  }

  function stop() {
    syncTime();
    clearTick();
    endsAt = 0;
    active = false;
    complete = false;
    owner = null;
    inline = false;
    render();
  }

  function toggle() {
    syncTime();
    if (endsAt) {
      endsAt = 0;
      clearTick();
      render();
    } else if (active && remaining) {
      run();
    } else {
      start({ inline, owner, durationSeconds: active ? restDuration : undefined });
    }
  }

  function adjust(seconds) {
    if (!active || !Number.isFinite(Number(seconds))) return;
    syncTime();
    const adjustment = Number(seconds);
    if (endsAt) {
      endsAt += adjustment * 1000;
      if (endsAt <= Date.now()) {
        remaining = 0;
        endsAt = 0;
        complete = true;
        clearTick();
      } else {
        syncTime();
      }
    } else {
      remaining = Math.max(0, Math.ceil(remaining + adjustment));
      complete = remaining === 0;
    }
    render();
  }

  function subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    listeners.add(listener);
    listener(getState());
    return () => listeners.delete(listener);
  }

  toggleButton?.addEventListener("click", toggle);
  duration?.addEventListener("change", () => start({ inline, owner }));
  document.getElementById("coach-rest-timer-skip")?.addEventListener("click", stop);
  document.addEventListener("visibilitychange", () => {
    if (active) render();
  });
  window.CoachRestTimer = { start, stop, toggle, adjust, getState, subscribe };
})();
