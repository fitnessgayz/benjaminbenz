(function (global) {
  "use strict";

  function createController(options = {}) {
    const document = options.document || global.document;
    const window = options.window || global;
    const tab = document.querySelector('[data-client-dashboard-tab="workouts"]');
    const content = document.getElementById("dashboard-content");
    const getLogs = options.getLogs || global.workoutExerciseListLogs;
    const syncList = options.syncList || global.syncWorkoutExerciseList;
    const jump = options.jump || global.jumpToWorkoutExercise;
    let overlay = null;
    let sourcePanel = null;

    function currentPanel() {
      const section = document.querySelector('[data-client-dashboard-panel="workouts"]');
      if (!content || content.hidden || !section || section.hidden) return null;
      return section.querySelector(".client-workout-panel.is-active:not([hidden])");
    }

    function mobile() {
      return Boolean(window.matchMedia?.("(max-width: 900px)").matches);
    }

    function position() {
      if (!overlay) return;
      const navigation = tab.closest(".client-dashboard-tabs");
      if (!navigation) return;
      const bottom = Math.max(16, window.innerHeight - navigation.getBoundingClientRect().top + 8);
      overlay.style.setProperty("--exercise-dock-bottom", `${bottom}px`);
    }

    function refresh() {
      const panel = mobile() ? currentPanel() : null;
      const available = Boolean(panel?.querySelector("[data-workout-exercise-list]"));
      if (overlay && (!available || panel !== sourcePanel)) close({ restoreFocus: false });
      if (!tab) return;
      if (tab.classList.contains("has-exercise-list") !== available) {
        tab.classList.toggle("has-exercise-list", available);
      }
      const attributes = {
        "aria-label": available ? `Workouts, ${overlay ? "hide" : "show"} exercise list` : "Workouts",
        "aria-expanded": available ? String(Boolean(overlay)) : null,
        "aria-controls": available ? "workout-exercise-dock-sheet" : null
      };
      Object.entries(attributes).forEach(([name, value]) => {
        if (value === null) {
          if (tab.hasAttribute(name)) tab.removeAttribute(name);
        } else if (tab.getAttribute(name) !== value) tab.setAttribute(name, value);
      });
      position();
    }

    function close({ restoreFocus = true } = {}) {
      if (!overlay) return;
      overlay.remove();
      document.body.classList.remove("workout-exercise-dock-open");
      overlay = null;
      sourcePanel = null;
      refresh();
      if (restoreFocus && tab?.isConnected) tab.focus({ preventScroll: true });
    }

    function toggle() {
      if (overlay) {
        close();
        return true;
      }
      const panel = mobile() ? currentPanel() : null;
      const source = panel?.querySelector("[data-workout-exercise-list]");
      if (!source || !tab) return false;
      syncList(panel);
      const logs = getLogs(panel);
      const sheet = source.cloneNode(true);
      sheet.id = "workout-exercise-dock-sheet";
      sheet.classList.add("workout-exercise-dock-sheet");
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-label", "Current workout exercises");
      sheet.removeAttribute("data-workout-exercise-list");
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "workout-exercise-dock-close";
      closeButton.setAttribute("aria-label", "Close exercise list");
      closeButton.textContent = "×";
      sheet.prepend(closeButton);
      overlay = document.createElement("div");
      overlay.className = "workout-exercise-dock";
      const backdrop = document.createElement("div");
      backdrop.className = "workout-exercise-dock-backdrop";
      backdrop.setAttribute("aria-hidden", "true");
      overlay.append(backdrop, sheet);
      sourcePanel = panel;
      document.body.append(overlay);
      document.body.classList.add("workout-exercise-dock-open");
      overlay.addEventListener("click", (event) => {
        // These are navigation copies, not the live workout inputs or their handlers.
        event.stopPropagation();
        if (event.target === backdrop || event.target.closest(".workout-exercise-dock-close")) {
          close();
          return;
        }
        const choice = event.target.closest("[data-workout-exercise-jump]");
        if (!choice) return;
        const log = logs[Number(choice.dataset.workoutExerciseJump)];
        const index = panel.isConnected && currentPanel() === panel ? getLogs(panel).indexOf(log) : -1;
        if (index < 0) {
          close();
          return;
        }
        syncList(panel);
        const original = source.querySelector(`[data-workout-exercise-jump="${index}"]`);
        close({ restoreFocus: !original });
        if (original) jump(original);
      });
      refresh();
      (sheet.querySelector("[data-workout-exercise-jump]") || closeButton).focus({ preventScroll: true });
      return true;
    }

    function onKeydown(event) {
      if (event.key !== "Escape" || !overlay) return;
      // Dismiss the list without also collapsing the mobile navigation.
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }

    function onOutsideClick(event) {
      if (overlay && !overlay.contains(event.target) && !tab.contains(event.target)) {
        close({ restoreFocus: false });
      }
    }

    function onFocus(event) {
      if (overlay && !overlay.contains(event.target) && !tab.contains(event.target)) {
        close({ restoreFocus: false });
      }
    }

    const observer = new window.MutationObserver(refresh);
    if (content) observer.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class"] });
    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener("click", onOutsideClick, true);
    document.addEventListener("focusin", onFocus);
    window.addEventListener("resize", refresh);
    refresh();
    return {
      toggle, close, refresh,
      isOpen: () => Boolean(overlay),
      destroy() {
        close({ restoreFocus: false });
        observer.disconnect();
        document.removeEventListener("keydown", onKeydown, true);
        document.removeEventListener("click", onOutsideClick, true);
        document.removeEventListener("focusin", onFocus);
        window.removeEventListener("resize", refresh);
      }
    };
  }

  if (typeof module === "object" && module.exports) module.exports = { createController };
  else global.WorkoutExerciseDock = createController();
})(typeof window === "object" ? window : globalThis);
