(function attachProgressionUI(root, factory) {
  const api = factory(root.FWB_WORKOUT_PROGRESSION || (typeof require === "function" ? require("./workout-progression.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FWB_WORKOUT_PROGRESSION_UI = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function createProgressionUI(engine) {
  "use strict";
  const parse = (value) => { try { return JSON.parse(value || "null"); } catch (_) { return null; } };
  const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const workingRows = (log) => [...(log?.querySelectorAll("[data-set-row]") || [])].filter((row) => (!row.dataset.setType || row.dataset.setType === "working") && Number(row.dataset.setNumber) < 1000);
  const key = (log, context) => "fwb_progression_plan:" + JSON.stringify([
    String(context.clientEmail || "").trim().toLowerCase(), context.date, context.title,
    log.dataset.exerciseCode, engine.exerciseKey(context.name), context.sessionId || "legacy"
  ]);
  function readFrozen(log, context) {
    const contextKey = key(log, context);
    if (log.dataset.progressionContext !== contextKey) {
      if (log.dataset.progressionContext) delete log.dataset.progressionTarget;
      log.dataset.progressionContext = contextKey;
    }
    let target = engine.normalizeConfig(parse(log.dataset.progressionTarget));
    if (!target) {
      try { target = engine.normalizeConfig(parse(context.storage?.getItem(contextKey))); } catch (_) { /* Storage may be unavailable. */ }
    }
    if (target?.exercise_key !== engine.exerciseKey(context.name)) return null;
    if (target) log.dataset.progressionTarget = JSON.stringify(target);
    return target;
  }
  function configFor(log, context) {
    if (!engine || log?.dataset.cardioLog !== undefined || log?.dataset.warmupLog !== undefined) return null;
    const frozen = readFrozen(log, context);
    if (frozen) return frozen;
    const rawConfig = parse(log.dataset.progressionConfig);
    const configured = engine.normalizeConfig(rawConfig);
    if (configured) {
      // A substitution must be deliberately configured; never carry another exercise's targets across.
      if (configured.exercise_key !== engine.exerciseKey(context.name)) return null;
      return engine.normalizeConfig({ ...configured,
        planned_sets: context.custom ? Math.max(1, workingRows(log).length) : configured.planned_sets });
    }
    if (log.dataset.progressionConfig && log.dataset.progressionConfig !== "null") return null;
    return engine.deriveConfig({ name: context.name, prescription: log.dataset.exercisePrescription || "" },
      Math.max(1, workingRows(log).length || Number(log.dataset.prescribedSets) || 1));
  }
  function freeze(log, context) {
    const config = configFor(log, context);
    if (!config || config.unit !== "lb") return null;
    if (!context.sessionId) context.sessionId = context.ensureSessionId?.() || null;
    log.dataset.progressionTarget = JSON.stringify(config);
    log.dataset.progressionContext = key(log, context);
    try { context.storage?.setItem(key(log, context), JSON.stringify(config)); } catch (_) { /* Keep the in-memory draft. */ }
    return config;
  }
  function recommendation(log, context) {
    const config = configFor(log, context);
    if (config?.unit === "kg") return { config, result: { kind: "unavailable",
      reason: "This plan uses kilograms. This logger records pounds; ask your coach for a plan in pounds before applying targets.", targets: [] } };
    return { config, result: engine.recommend({ config, history: context.history || [],
      excludedSessionId: context.sessionId, historyComplete: context.historyComplete === true, now: context.now || new Date() }) };
  }
  function markup(log, context) {
    const { config, result } = recommendation(log, context);
    if (!String(context.name || "").trim() || result.kind === "disabled") return "";
    const targets = result.targets || [];
    const summary = targets.map((target) => `Set ${target.setNumber}: ${target.weight} ${config.unit} × ${target.reps}`).join(" · ");
    const canConfigure = context.custom && !readFrozen(log, context) && !/\b(sec|secs|seconds?|minutes?|mins?|amrap|failure)\b/i.test(log.dataset.exercisePrescription || "");
    return `<section class="workout-progression" aria-label="Suggested targets for ${escape(context.name)}">
      <strong>Suggested targets</strong>
      ${summary ? `<p class="workout-progression-targets">${escape(summary)}</p>` : ""}
      <p>${escape(result.reason)}</p>
      ${config ? `<small>${config.planned_sets} working sets · ${config.rep_min}–${config.rep_max} reps · ${config.target_rir} RIR</small>` : ""}
      ${targets.length ? '<button type="button" class="button button-dark" data-progression-apply>Use suggested targets</button><small>Fills empty fields only. Review before logging.</small>' : ""}
      ${canConfigure ? `<details data-progression-settings><summary>Set progression targets</summary>
        <div class="workout-progression-settings">
          <label>Minimum reps<input data-progression-field="rep_min" type="number" min="1" max="50" value="${config?.rep_min || 8}"></label>
          <label>Maximum reps<input data-progression-field="rep_max" type="number" min="1" max="50" value="${config?.rep_max || 12}"></label>
          <label>Target RIR<input data-progression-field="target_rir" type="number" min="0" max="5" step="0.5" value="${config?.target_rir ?? 2}"></label>
          <label>Weight increment (lb)<input data-progression-field="increment" type="number" min="0.25" max="100" step="0.25" value="${config?.increment || 2.5}"></label>
        </div><button type="button" data-progression-save>Save targets</button><small data-progression-status role="status"></small>
      </details>` : ""}
    </section>`;
  }
  function render(log, context) {
    if (!engine || !log) return;
    restorePending(log, context);
    const html = markup(log, context);
    const direct = log.querySelector("[data-workout-progression]");
    if (direct) direct.innerHTML = html;
    const carousel = log.closest("[data-custom-workout-grouped='true']");
    if (carousel) {
      const logs = [...carousel.querySelectorAll("[data-exercise-log]")];
      const index = logs.indexOf(log);
      const slot = carousel.querySelector(`[data-workout-progression-index="${index}"]`);
      if (slot) slot.innerHTML = html;
    }
  }
  function apply(log, context) {
    const { result } = recommendation(log, context);
    if (!result.targets?.length) return 0;
    freeze(log, context);
    let changed = 0;
    for (const row of workingRows(log)) {
      if (row.classList.contains("is-complete") || row.querySelector("[data-complete-set]")?.getAttribute("aria-pressed") === "true") continue;
      const target = result.targets.find((item) => item.setNumber === Number(row.dataset.setNumber));
      if (!target) continue;
      for (const field of ["weight", "reps"]) {
        const input = row.querySelector(`[data-set-${field}]`);
        if (input && String(input.value).trim() === "") { input.value = String(target[field]); row.dataset.progressionSuggested = "true"; row.dataset.progressionSuggestedContext = key(log, context); changed += 1; }
      }
    }
    persistPending(log, context);
    context.afterApply?.();
    render(log, context);
    return changed;
  }
  function configure(log, context, form) {
    if (!context.custom || readFrozen(log, context) || !form) return false;
    const values = Object.fromEntries(["rep_min", "rep_max", "target_rir", "increment"].map((field) =>
      [field, Number(form.querySelector(`[data-progression-field="${field}"]`)?.value)]));
    const config = engine.normalizeConfig({ ...values, enabled: true, exercise_key: engine.exerciseKey(context.name),
      planned_sets: Math.max(1, workingRows(log).length), unit: "lb", required_sessions: 2 });
    if (!config) { const status = form.querySelector("[data-progression-status]"); if (status) status.textContent = "Enter a valid rep range, RIR from 0 to 5, and a positive weight increment."; return false; }
    log.dataset.progressionConfig = JSON.stringify(config);
    context.afterApply?.();
    render(log, context);
    return true;
  }
  function serialize(log) {
    const config = parse(log?.dataset.progressionConfig);
    const target = engine?.normalizeConfig(parse(log?.dataset.progressionTarget));
    return { ...(config ? { progression: config } : {}), ...(target ? { progression_target: target,
      progression_context: log.dataset.progressionContext } : {}) };
  }
  function restore(log, draft, context) {
    if (draft.progression) log.dataset.progressionConfig = JSON.stringify(draft.progression);
    if (draft.progression_target) {
      log.dataset.progressionTarget = JSON.stringify(draft.progression_target);
      if (context) log.dataset.progressionContext = key(log, context);
      else if (draft.progression_context) log.dataset.progressionContext = draft.progression_context;
    }
  }
  function persistPending(log, context) {
    const rows = workingRows(log).filter((row) => isPending(log, row, context) && !row.classList.contains("is-complete"))
      .map((row) => ({ setNumber: Number(row.dataset.setNumber), weight: row.querySelector("[data-set-weight]")?.value || "",
        reps: row.querySelector("[data-set-reps]")?.value || "" }));
    try { context.storage?.setItem(key(log, context) + ":draft", JSON.stringify(rows)); } catch (_) { /* Keep live input intact. */ }
  }
  function restorePending(log, context) {
    const contextKey = key(log, context);
    if (log.dataset.progressionDraftRestored === contextKey) return;
    log.dataset.progressionDraftRestored = contextKey;
    let pending = [];
    try { pending = parse(context.storage?.getItem(contextKey + ":draft")) || []; } catch (_) { return; }
    if (!Array.isArray(pending)) return;
    for (const row of workingRows(log)) {
      const draft = pending.find((value) => value.setNumber === Number(row.dataset.setNumber));
      if (!draft || row.classList.contains("is-complete")) continue;
      for (const field of ["weight", "reps"]) {
        const input = row.querySelector(`[data-set-${field}]`);
        if (input && String(input.value).trim() === "" && typeof draft[field] === "string") input.value = draft[field];
      }
      row.dataset.progressionSuggested = "true";
      row.dataset.progressionSuggestedContext = contextKey;
    }
  }
  function isPending(log, row, context) {
    return row.dataset.progressionSuggested === "true" && row.dataset.progressionSuggestedContext === key(log, context);
  }
  function isMissingTargetColumn(error) {
    return Boolean(error && ["PGRST204", "42703"].includes(error.code) &&
      /progression_target/i.test(String(error.message || "")) && /column|schema cache/i.test(String(error.message || "")));
  }
  return { configFor, freeze, recommendation, markup, render, apply, configure, serialize, restore, persistPending, restorePending, isPending, isMissingTargetColumn };
}));
