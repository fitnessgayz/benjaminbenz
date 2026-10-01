/* Shared estimated 1RM calculator for client and coach workout loggers. */
(function oneRepMaxModule(global, document) {
  "use strict";

  const percentages = [70, 75, 80, 85, 90];
  const rowSelector = [
    ".set-row",
    ".coach-workout-set-row",
    ".custom-workout-grouped-row",
    ".coach-workout-grouped-row"
  ].join(",");
  const weightSelector = [
    "[data-set-weight]",
    "[data-coach-workout-weight]",
    '[data-custom-grouped-field="weight"]',
    '[data-coach-grouped-field="weight"]'
  ].join(",");
  const repsSelector = [
    "[data-set-reps]",
    "[data-coach-workout-reps]",
    '[data-custom-grouped-field="reps"]',
    '[data-coach-grouped-field="reps"]'
  ].join(",");
  let dialog;
  let returnFocus;
  let lastEditedInput;
  let activeSources = [];

  function estimate(weight, reps) {
    const safeWeight = Number(weight);
    const safeReps = Number(reps);
    if (!Number.isFinite(safeWeight) || safeWeight <= 0 || !Number.isInteger(safeReps) || safeReps < 1 || safeReps > 30) {
      return null;
    }
    return safeReps === 1 ? safeWeight : safeWeight * (1 + (safeReps / 30));
  }

  function roundToIncrement(value, increment = 5) {
    const safeValue = Number(value);
    const safeIncrement = Number(increment);
    if (!Number.isFinite(safeValue) || !Number.isFinite(safeIncrement) || safeIncrement <= 0) return null;
    return Math.round(safeValue / safeIncrement) * safeIncrement;
  }

  function trainingWeights(oneRepMax) {
    return percentages.map((percentage) => ({
      percentage,
      weight: roundToIncrement(oneRepMax * (percentage / 100))
    }));
  }

  function calculatorIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M8 6.5h8M8.5 11h1M12 11h1M15.5 11h1M8.5 14.5h1M12 14.5h1M15.5 14.5h1M8.5 18h1M12 18h1M15.5 18h1"/></svg>';
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "one-rm-dialog";
    dialog.setAttribute("aria-labelledby", "one-rm-title");
    dialog.innerHTML = `
      <form class="one-rm-card" method="dialog">
        <header class="one-rm-heading">
          <div><p class="kicker">Training tool</p><h2 id="one-rm-title">Estimated 1RM</h2></div>
          <button class="one-rm-close" type="button" data-one-rm-close aria-label="Close 1RM calculator">×</button>
        </header>
        <p class="one-rm-intro">Estimate your one-rep max from a completed set. This is a guide, not a tested maximum.</p>
        <label class="one-rm-source" data-one-rm-source-field hidden>
          <span>Exercise</span>
          <select data-one-rm-source-select></select>
        </label>
        <div class="one-rm-inputs">
          <label><span>Weight (lb)</span><input type="number" min="0" step="0.5" inputmode="decimal" data-one-rm-weight /></label>
          <label><span>Reps</span><input type="number" min="1" max="30" step="1" inputmode="numeric" data-one-rm-reps /></label>
        </div>
        <p class="one-rm-prompt" data-one-rm-prompt>Enter a weight and 1–30 reps.</p>
        <section class="one-rm-result" data-one-rm-result hidden aria-live="polite">
          <span>Estimated one-rep max</span>
          <strong><output data-one-rm-output>—</output> lb</strong>
          <small data-one-rm-caution></small>
        </section>
        <section class="one-rm-percentages" data-one-rm-percentages hidden aria-labelledby="one-rm-percentages-title">
          <h3 id="one-rm-percentages-title">Training weights</h3>
          <div data-one-rm-percentage-rows></div>
          <small>Rounded to the nearest 5 lb.</small>
        </section>
        <button class="one-rm-done" type="button" data-one-rm-close>Done</button>
      </form>
    `;
    document.body.append(dialog);
    dialog.querySelectorAll("[data-one-rm-close]").forEach((button) => button.addEventListener("click", close));
    dialog.querySelector("[data-one-rm-weight]").addEventListener("input", render);
    dialog.querySelector("[data-one-rm-reps]").addEventListener("input", render);
    dialog.querySelector("[data-one-rm-source-select]").addEventListener("change", (event) => {
      populate(activeSources[Number(event.target.value)] || {});
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) close();
    });
    dialog.addEventListener("close", () => {
      returnFocus?.focus?.({ preventScroll: true });
      returnFocus = null;
    });
    return dialog;
  }

  function sourceLabel(row, index) {
    const input = row?.querySelector(weightSelector);
    const aria = String(input?.getAttribute("aria-label") || "");
    const parts = aria.split(",").map((part) => part.trim()).filter(Boolean);
    return parts.at(-1) || `Set ${index + 1}`;
  }

  function rowSource(row, index) {
    if (!row) return null;
    const weight = row.querySelector(weightSelector)?.value ?? "";
    const reps = row.querySelector(repsSelector)?.value ?? "";
    return { label: sourceLabel(row, index), weight, reps };
  }

  function parsedSources(trigger) {
    try {
      const parsed = JSON.parse(trigger.dataset.oneRmSources || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  function sourcesNear(trigger) {
    const stored = parsedSources(trigger);
    if (stored.length) return stored;
    const scope = trigger.closest(
      "[data-custom-grouped-round], [data-coach-grouped-round], .set-table, .coach-workout-set-table"
    ) || trigger.closest("[data-custom-workout-grouped], [data-coach-workout-group-card], [data-exercise-log], [data-coach-workout-exercise]");
    const rows = Array.from(scope?.querySelectorAll(rowSelector) || []);
    const editedRow = lastEditedInput?.closest(rowSelector);
    if (editedRow && scope?.contains(editedRow)) {
      rows.splice(rows.indexOf(editedRow), 1);
      rows.unshift(editedRow);
    }
    const sources = rows.map(rowSource).filter(Boolean);
    const completed = sources.filter((source) => estimate(source.weight, source.reps) !== null);
    return completed.length ? completed : (sources.slice(0, 1).length ? sources.slice(0, 1) : [{}]);
  }

  function populate(source) {
    const calculator = ensureDialog();
    calculator.querySelector("[data-one-rm-weight]").value = source.weight ?? "";
    calculator.querySelector("[data-one-rm-reps]").value = source.reps ?? "";
    render();
  }

  function render() {
    const calculator = ensureDialog();
    const weight = calculator.querySelector("[data-one-rm-weight]").value;
    const reps = calculator.querySelector("[data-one-rm-reps]").value;
    const result = estimate(weight, reps);
    const resultPanel = calculator.querySelector("[data-one-rm-result]");
    const percentagesPanel = calculator.querySelector("[data-one-rm-percentages]");
    const prompt = calculator.querySelector("[data-one-rm-prompt]");
    resultPanel.hidden = result === null;
    percentagesPanel.hidden = result === null;
    prompt.hidden = result !== null;
    if (result === null) return;
    calculator.querySelector("[data-one-rm-output]").value = String(roundToIncrement(result));
    calculator.querySelector("[data-one-rm-caution]").textContent = Number(reps) > 10
      ? "Higher-rep estimates are less precise; use this as a broad guide."
      : "Calculated with the Epley formula.";
    calculator.querySelector("[data-one-rm-percentage-rows]").innerHTML = trainingWeights(result)
      .map(({ percentage, weight: trainingWeight }) => `<div><span>${percentage}%</span><strong>${trainingWeight} lb</strong></div>`)
      .join("");
  }

  function open(trigger, suppliedSources) {
    const calculator = ensureDialog();
    returnFocus = trigger || document.activeElement;
    activeSources = (suppliedSources?.length ? suppliedSources : sourcesNear(trigger)).filter(Boolean);
    if (!activeSources.length) activeSources = [{}];
    const sourceField = calculator.querySelector("[data-one-rm-source-field]");
    const sourceSelect = calculator.querySelector("[data-one-rm-source-select]");
    sourceField.hidden = activeSources.length < 2;
    sourceSelect.innerHTML = activeSources.map((source, index) => (
      `<option value="${index}">${String(source.label || `Set ${index + 1}`).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character])}</option>`
    )).join("");
    sourceSelect.value = "0";
    populate(activeSources[0]);
    if (typeof calculator.showModal === "function") calculator.showModal();
    else calculator.setAttribute("open", "");
    calculator.querySelector(resultIsReady() ? "[data-one-rm-output]" : "[data-one-rm-weight]")?.focus();
  }

  function resultIsReady() {
    return estimate(
      dialog?.querySelector("[data-one-rm-weight]")?.value,
      dialog?.querySelector("[data-one-rm-reps]")?.value
    ) !== null;
  }

  function close() {
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else {
      dialog.removeAttribute("open");
      returnFocus?.focus?.({ preventScroll: true });
      returnFocus = null;
    }
  }

  document.addEventListener("input", (event) => {
    if (event.target?.matches?.(`${weightSelector},${repsSelector}`)) lastEditedInput = event.target;
  });
  document.addEventListener("click", (event) => {
    const trigger = event.target?.closest?.("[data-one-rm-open]");
    if (!trigger || trigger.disabled) return;
    event.preventDefault();
    open(trigger);
  });

  global.FWBOneRepMax = { estimate, roundToIncrement, trainingWeights, calculatorIcon, open };
})(window, document);
