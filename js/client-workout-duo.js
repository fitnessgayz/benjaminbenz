(function (global) {
  "use strict";

  const panelStates = new WeakMap();

  function markup() {
    return `<aside class="workout-duo-sidebar" data-workout-duo-sidebar aria-label="Workout exercises">
      <header><h3>Exercises</h3><p data-workout-duo-count></p></header>
      <ol data-workout-duo-list></ol>
      <footer>
        <button type="button" data-workout-exercise-add>+ Add exercise</button>
        <button type="button" data-workout-duo-finish disabled>Finish workout</button>
      </footer>
    </aside>`;
  }

  function sidebar(panel) {
    return panel?.querySelector?.("[data-workout-duo-sidebar]");
  }

  function isVisible(panel) {
    return Boolean(sidebar(panel)?.getClientRects().length);
  }

  function stateFor(panel) {
    if (!panelStates.has(panel)) panelStates.set(panel, { active: null, code: "", logs: [], items: [] });
    return panelStates.get(panel);
  }

  function groupFor(carousel) {
    return carousel?.closest(".workout-format-group") || carousel;
  }

  function makeItem() {
    const item = global.document.createElement("li");
    item.innerHTML = `<button type="button" data-workout-duo-exercise>
      <span class="workout-duo-code" aria-hidden="true"></span>
      <span class="workout-duo-copy"><strong></strong><small></small></span>
      <span class="workout-duo-progress" aria-hidden="true"></span>
    </button>`;
    return item;
  }

  function setText(element, value) {
    if (element.textContent !== value) element.textContent = value;
  }

  function sync(panel, logs) {
    const rail = sidebar(panel);
    if (!rail) return;
    const state = stateFor(panel);
    const list = rail.querySelector("[data-workout-duo-list]");
    const selected = logs.includes(state.active) ? state.active
      : (state.code && logs.find((log) => log.dataset.exerciseCode === state.code)) || logs[0];
    state.active = selected || null;
    state.code = selected?.dataset.exerciseCode || "";

    if (state.logs.length !== logs.length || logs.some((log, index) => log !== state.logs[index])) {
      const previousItems = new Map(state.logs.map((log, index) => [log, state.items[index]]));
      const focused = list.contains(global.document.activeElement) ? global.document.activeElement : null;
      state.logs = logs;
      state.items = logs.map((log) => previousItems.get(log) || makeItem());
      list.replaceChildren(...state.items);
      if (focused && list.contains(focused)) focused.focus({ preventScroll: true });
    }

    logs.forEach((log, index) => {
      const button = state.items[index].firstElementChild;
      const name = String(global.exerciseNameInputForLog(log)?.value ?? log.dataset.exerciseName ?? "").trim()
        || `Exercise ${index + 1}`;
      const carousel = log.closest("[data-custom-workout-carousel]");
      const format = carousel?.dataset.customWorkoutFormat;
      const group = format === "superset" ? "Superset" : format === "circuit" ? "Circuit" : "";
      const rows = Array.from(log.querySelectorAll("[data-set-row]"))
        .filter((row) => global.setTypeForRow(row) !== "warm_up");
      const completed = rows.filter((row) => row.classList.contains("is-complete")).length;
      button.dataset.workoutDuoExercise = String(index);
      setText(button.querySelector(".workout-duo-code"), log.dataset.exerciseCode || String(index + 1));
      setText(button.querySelector("strong"), name);
      const label = button.querySelector("small");
      setText(label, group);
      label.hidden = !group;
      setText(button.querySelector(".workout-duo-progress"), `${completed}/${rows.length}`);
      button.setAttribute("aria-label", `${name}${group ? `, ${group}` : ""}, ${completed} of ${rows.length} sets complete`);
      if (log === selected) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });

    setText(rail.querySelector("[data-workout-duo-count]"), `${logs.length} in this workout`);
    rail.querySelector("[data-workout-duo-finish]").disabled = !logs.length;
    const visibleGroup = groupFor(selected?.closest("[data-custom-workout-carousel]"));
    panel.querySelectorAll("[data-custom-workout-carousel]").forEach((carousel) => {
      const group = groupFor(carousel);
      group.classList.toggle("is-workout-duo-inactive-group", Boolean(visibleGroup && group !== visibleGroup));
    });
  }

  function select(panel, log, { expand = false } = {}) {
    if (!log || !panel?.contains(log) || !sidebar(panel)) return false;
    const state = stateFor(panel);
    state.active = log;
    state.code = log.dataset.exerciseCode || "";
    sync(panel, global.workoutExerciseListLogs(panel));
    if (expand) {
      const carousel = log.closest("[data-custom-workout-grouped='true']");
      if (carousel) {
        delete log.dataset.exerciseManuallyCollapsed;
        log.dataset.exerciseManuallyExpanded = "true";
        global.refreshCustomWorkoutGroupedCompletion(carousel);
      } else {
        global.setWorkoutExerciseCardExpanded(log.closest("[data-custom-exercise-card]"), true);
      }
    }
    return true;
  }

  function revealTarget(panel, target) {
    if (!isVisible(panel)) return;
    const carousel = target?.closest?.("[data-custom-workout-carousel]");
    if (!carousel) return;
    const block = target.closest("[data-ios-log-exercise-index]");
    const row = target.closest("[data-custom-grouped-exercise-index]");
    const index = block?.dataset.iosLogExerciseIndex ?? row?.dataset.customGroupedExerciseIndex
      ?? target.dataset.customWorkoutGroupNameInput ?? 0;
    const log = target.closest("[data-exercise-log]") || global.customWorkoutGroupedLogElements(carousel)[Number(index)];
    select(panel, log, { expand: true });
  }

  function advance(carousel, nextLog) {
    const panel = carousel.closest(".client-workout-panel");
    if (!isVisible(panel)) return;
    const selectedCarousel = stateFor(panel).active?.closest("[data-custom-workout-carousel]");
    if (selectedCarousel === carousel) select(panel, nextLog, { expand: true });
  }

  global.ClientWorkoutDuo = { markup, sync, select, isVisible, revealTarget, advance };
})(globalThis);
