(() => {
  const panel = document.getElementById("coach-rest-timer");
  if (!panel) return;

  const display = document.getElementById("coach-rest-timer-display");
  const status = document.getElementById("coach-rest-timer-status");
  const duration = document.getElementById("coach-rest-timer-duration");
  const toggle = document.getElementById("coach-rest-timer-toggle");
  let remaining = 60;
  let endsAt = 0;
  let interval = null;

  function clearTick() {
    window.clearInterval(interval);
    interval = null;
  }

  function render() {
    if (endsAt) {
      remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      if (!remaining) {
        endsAt = 0;
        clearTick();
      }
    }
    display.textContent = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
    const message = endsAt ? "Rest timer" : remaining ? "Rest paused" : "Rest complete — ready for the next set";
    if (status.textContent !== message) status.textContent = message;
    toggle.textContent = endsAt ? "Pause" : remaining ? "Resume" : "Restart";
  }

  function run() {
    clearTick();
    endsAt = Date.now() + remaining * 1000;
    interval = window.setInterval(render, 250);
    panel.hidden = false;
    render();
  }

  function start() {
    remaining = Number(duration.value) || 60;
    run();
  }

  function stop() {
    clearTick();
    endsAt = 0;
    panel.hidden = true;
  }

  toggle.addEventListener("click", () => {
    if (endsAt) {
      render();
      endsAt = 0;
      clearTick();
      render();
    } else if (remaining) {
      run();
    } else {
      start();
    }
  });
  duration.addEventListener("change", start);
  document.getElementById("coach-rest-timer-skip").addEventListener("click", stop);
  document.addEventListener("visibilitychange", () => {
    if (!panel.hidden) render();
  });
  window.CoachRestTimer = { start, stop };
})();
