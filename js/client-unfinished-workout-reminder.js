(function (root) {
  "use strict";

  const defaultIdleMs = 10 * 60 * 1000;
  const storageKey = "fwb_unfinished_workout_reminder_v1";

  function createUnfinishedWorkoutReminder(options) {
    const view = options.window;
    const page = options.document;
    const clock = options.now || Date.now;
    const idleMs = options.idleMs || defaultIdleMs;
    const pollMs = options.pollMs || 15 * 1000;
    const getWorkoutState = options.getWorkoutState;
    const openWorkout = options.openWorkout || (() => {});
    let identity = "";
    let lastActivityAt = 0;
    let notified = false;
    let dismissed = false;
    let banner = null;
    let interval = null;
    let signingOut = false;
    let stateReference = null;

    function readSaved() {
      try { return JSON.parse(view.sessionStorage?.getItem(storageKey) || "null"); }
      catch (_error) { return null; }
    }

    function save() {
      try {
        view.sessionStorage?.setItem(storageKey, JSON.stringify({ identity, lastActivityAt, notified, dismissed }));
      } catch (_error) { /* The reminder still works in this tab. */ }
    }

    function hideBanner() {
      banner?.remove();
      banner = null;
    }

    function clear() {
      hideBanner();
      identity = "";
      lastActivityAt = 0;
      notified = false;
      dismissed = false;
      stateReference = null;
      try { view.sessionStorage?.removeItem(storageKey); }
      catch (_error) { /* Storage may be unavailable. */ }
    }

    function workoutIdentity(state) {
      if (!state || !String(state.workoutTitle || "").trim()) return "";
      return JSON.stringify([
        String(state.clientEmail || "").trim().toLowerCase(),
        String(state.workoutTitle).trim(),
        String(state.workoutDate || "")
      ]);
    }

    function syncWorkout() {
      if (signingOut) return null;
      const state = getWorkoutState();
      const currentIdentity = workoutIdentity(state);
      if (!currentIdentity) {
        if (identity) clear();
        return null;
      }
      // A restarted workout can reuse the same title and date in one page view.
      if (stateReference && stateReference !== state && currentIdentity === identity) clear();
      if (currentIdentity !== identity) {
        hideBanner();
        const saved = readSaved();
        identity = currentIdentity;
        lastActivityAt = saved?.identity === identity && Number.isFinite(saved.lastActivityAt)
          ? Math.min(clock(), saved.lastActivityAt)
          : Math.min(clock(), Math.max(0, Number(state.updatedAt || state.startedAt) || clock()));
        notified = saved?.identity === identity && saved.notified === true;
        dismissed = saved?.identity === identity && saved.dismissed === true;
        save();
      }
      stateReference = state;
      return state;
    }

    function recordActivity() {
      if (!syncWorkout()) return;
      lastActivityAt = clock();
      notified = false;
      dismissed = false;
      hideBanner();
      save();
    }

    async function notifyWhileHidden() {
      const NotificationApi = view.Notification;
      if (!NotificationApi || NotificationApi.permission !== "granted") return;
      notified = true;
      save();
      const details = {
        body: "Done with your workout? Open FWB, then hit Finish and save.",
        icon: "/fwb-brand-icon-gold-192-v5.png",
        badge: "/favicon-32.png",
        tag: "fwb-unfinished-workout",
        data: { url: "/client-dashboard.html?tab=workouts" }
      };
      try {
        const registration = await view.navigator?.serviceWorker?.getRegistration?.();
        if (registration?.showNotification) {
          await registration.showNotification("Still working out?", details);
        } else {
          new NotificationApi("Still working out?", details);
        }
      } catch (_error) { /* The on-screen reminder appears when the page returns. */ }
    }

    function showBanner() {
      if (banner || dismissed || !page.body) return;
      banner = page.createElement("aside");
      banner.className = "client-unfinished-workout-reminder";
      banner.setAttribute("role", "status");
      banner.setAttribute("aria-live", "polite");
      banner.innerHTML = `
        <button class="client-unfinished-workout-reminder-close" type="button" data-reminder-dismiss aria-label="Dismiss workout reminder">×</button>
        <strong>Still working out?</strong>
        <p>Done with your workout? Hit Finish and save so your progress is recorded.</p>
        <div class="client-unfinished-workout-reminder-actions">
          <button type="button" data-reminder-finish>Finish and save</button>
          <button type="button" data-reminder-continue>Keep working out</button>
        </div>`;
      banner.addEventListener("click", (event) => {
        const action = event.target?.closest?.("[data-reminder-finish], [data-reminder-continue], [data-reminder-dismiss]");
        if (!action) return;
        if (action.hasAttribute("data-reminder-dismiss")) {
          dismissed = true;
          notified = true;
          save();
          hideBanner();
          return;
        }
        const state = syncWorkout();
        if (!state) return;
        const finish = action.hasAttribute("data-reminder-finish");
        recordActivity();
        openWorkout(state, finish);
      });
      page.body.append(banner);
    }

    function tick() {
      if (!syncWorkout() || clock() - lastActivityAt < idleMs) return;
      if (page.hidden) {
        if (!notified && !dismissed) void notifyWhileHidden();
      } else {
        showBanner();
      }
    }

    function onInteraction(event) {
      const target = event.target;
      if (!target?.closest) return;
      if (target.closest("[data-sign-out]")) {
        signingOut = true;
        clear();
        return;
      }
      if (target.closest(".client-workout-panel, [data-workout-start], [data-workout-elapsed-reset], [data-workout-elapsed-toggle], [data-workout-finish]")) {
        recordActivity();
      }
    }

    function start() {
      if (interval !== null) return;
      page.addEventListener("click", onInteraction, true);
      page.addEventListener("input", onInteraction, true);
      page.addEventListener("change", onInteraction, true);
      page.addEventListener("visibilitychange", tick);
      view.addEventListener("focus", tick);
      interval = view.setInterval(tick, pollMs);
      tick();
    }

    function destroy() {
      if (interval !== null) view.clearInterval(interval);
      interval = null;
      page.removeEventListener("click", onInteraction, true);
      page.removeEventListener("input", onInteraction, true);
      page.removeEventListener("change", onInteraction, true);
      page.removeEventListener("visibilitychange", tick);
      view.removeEventListener("focus", tick);
      clear();
    }

    return { start, destroy, tick, recordActivity };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createUnfinishedWorkoutReminder };
  }

  if (root?.document) {
    const controller = createUnfinishedWorkoutReminder({
      window: root,
      document: root.document,
      getWorkoutState: () => typeof workoutElapsedTimerState === "undefined" ? null : workoutElapsedTimerState,
      openWorkout: (state, finish) => {
        if (typeof setClientDashboardTab === "function") setClientDashboardTab("workouts");
        const panels = Array.from(root.document.querySelectorAll(".client-workout-panel"));
        const panel = panels.find((candidate) => {
          const title = candidate.querySelector("[data-workout-start]")?.dataset.workoutTitle;
          return title === state.workoutTitle;
        }) || panels[Number(state.panelIndex)] || null;
        if (panel && typeof activateClientWorkoutPanel === "function") {
          activateClientWorkoutPanel(panels.indexOf(panel), { focus: false });
        }
        if (finish) {
          const finishButton = panel?.querySelector("[data-workout-finish]");
          if (finishButton) finishButton.click();
          else panel?.scrollIntoView?.({ block: "start" });
        }
      }
    });
    controller.start();
    root.FWB_UNFINISHED_WORKOUT_REMINDER = controller;
  }
})(typeof window === "undefined" ? null : window);
