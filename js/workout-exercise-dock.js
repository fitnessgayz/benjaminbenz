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
    const getNameInput = options.getNameInput || (log =>
      global.customWorkoutEditableNameInput?.(log?.closest?.("[data-custom-exercise-card]")) ||
      log?.querySelector?.("[data-exercise-name-input]") ||
      log?.closest?.(".workout-exercise-card")?.querySelector?.("[data-exercise-name-input]"));
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
      let logs = getLogs(panel);
      const sheet = source.cloneNode(true);
      sheet.id = "workout-exercise-dock-sheet";
      sheet.classList.add("workout-exercise-dock-sheet");
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-label", "Organize and add exercise");
      sheet.removeAttribute("data-workout-exercise-list");
      const heading = sheet.querySelector("h3");
      if (heading) heading.textContent = "Organize and add exercise";
      const description = sheet.querySelector("p");
      if (description) description.textContent = "Move exercises, edit names, or add another exercise.";
      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "workout-exercise-dock-close";
      closeButton.setAttribute("aria-label", "Close exercise list");
      closeButton.textContent = "×";
      sheet.prepend(closeButton);
      const finishButton = document.createElement("button");
      finishButton.type = "button";
      finishButton.className = "workout-exercise-list-finish";
      finishButton.setAttribute("data-workout-exercise-finish", "");
      finishButton.textContent = "Finish workout";
      sheet.append(finishButton);
      overlay = document.createElement("div");
      overlay.className = "workout-exercise-dock";
      const backdrop = document.createElement("div");
      backdrop.className = "workout-exercise-dock-backdrop";
      backdrop.setAttribute("aria-hidden", "true");
      overlay.append(backdrop, sheet);
      sourcePanel = panel;
      document.body.append(overlay);
      document.body.classList.add("workout-exercise-dock-open");
      const refreshSheet = () => {
        if (!overlay || !panel.isConnected || currentPanel() !== panel) return;
        syncList(panel);
        const liveItems = source.querySelector("[data-workout-exercise-list-items]");
        const sheetItems = sheet.querySelector("[data-workout-exercise-list-items]");
        if (liveItems && sheetItems) sheetItems.innerHTML = liveItems.innerHTML;
        logs = getLogs(panel);
      };
      overlay.addEventListener("click", (event) => {
        // These are navigation copies, not the live workout inputs or their handlers.
        event.stopPropagation();
        if (event.target === backdrop || event.target.closest(".workout-exercise-dock-close")) {
          close();
          return;
        }
        if (event.target.closest("[data-workout-exercise-add]")) {
          const add = panel.isConnected && currentPanel() === panel
            ? panel.querySelector("[data-pick-custom-exercise], [data-add-assigned-exercise]") : null;
          close({ restoreFocus: !add });
          add?.click();
          return;
        }
        if (event.target.closest("[data-workout-exercise-finish]")) {
          const finish = panel.isConnected && currentPanel() === panel
            ? panel.querySelector("[data-custom-grouped-finish-workout], [data-workout-finish]") : null;
          close({ restoreFocus: !finish });
          finish?.click();
          return;
        }
        const move = event.target.closest("[data-custom-exercise-move]") || event.target.closest("[data-workout-exercise-move]");
        if (move) {
          const attribute = move.hasAttribute("data-custom-exercise-move") ? "data-custom-exercise-move" : "data-workout-exercise-move";
          const direction = move.getAttribute(attribute);
          const index = move.dataset.customExerciseIndex;
          source.querySelector(`[${attribute}="${direction}"][data-custom-exercise-index="${index}"]`)?.click();
          refreshSheet();
          sheet.querySelector(`[${attribute}="${direction}"][data-custom-exercise-index="${Number(index) + (direction === "up" ? -1 : 1)}"]`)?.focus({ preventScroll: true });
          return;
        }
        const rename = event.target.closest("[data-workout-exercise-rename]");
        if (rename) {
          const index = Number(rename.dataset.workoutExerciseRename);
          const editor = sheet.querySelector(`[data-workout-exercise-rename-editor="${index}"]`);
          const input = editor?.querySelector("input");
          const original = getLogs(panel)[index];
          if (!input || !original) return;
          input.value = String((getNameInput(original)?.value || original.dataset.exerciseName || "")).trim();
          editor.hidden = false;
          input.focus();
          return;
        }
        const cancel = event.target.closest("[data-workout-exercise-rename-cancel]");
        if (cancel) {
          sheet.querySelector(`[data-workout-exercise-rename-editor="${cancel.dataset.workoutExerciseRenameCancel}"]`).hidden = true;
          return;
        }
        const save = event.target.closest("[data-workout-exercise-rename-save]");
        if (save) {
          const index = Number(save.dataset.workoutExerciseRenameSave);
          const editor = sheet.querySelector(`[data-workout-exercise-rename-editor="${index}"]`);
          const name = editor?.querySelector("input")?.value.trim();
          const log = getLogs(panel)[index];
          const original = getNameInput(log);
          if (!name || !original) return;
          original.value = name;
          original.dispatchEvent(new window.Event("input", { bubbles: true }));
          original.dispatchEvent(new window.Event("change", { bubbles: true }));
          editor.hidden = true;
          sheet.querySelector(`[data-workout-exercise-jump="${index}"] [data-workout-exercise-list-name]`)?.replaceChildren(name);
          window.setTimeout(refreshSheet, 400);
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
      overlay.addEventListener("change", (event) => {
        const select = event.target.closest("[data-custom-exercise-group]");
        if (!select) return;
        event.stopPropagation();
        const original = source.querySelector(`[data-custom-exercise-group="${select.dataset.customExerciseGroup}"]`);
        if (!original) return;
        original.value = select.value;
        original.dispatchEvent(new window.Event("change", { bubbles: true }));
        refreshSheet();
      });
      refresh();
      (sheet.querySelector("[data-workout-exercise-jump]") || closeButton).focus({ preventScroll: true });
      return true;
    }

    function open() {
      if (overlay) return true;
      return toggle();
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
      toggle, open, close, refresh,
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
