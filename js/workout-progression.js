(function attachWorkoutProgression(root, factory) {
  const engine = factory();
  if (typeof module === "object" && module.exports) module.exports = engine;
  root.FWB_WORKOUT_PROGRESSION = engine;
}(typeof globalThis !== "undefined" ? globalThis : this, function createWorkoutProgression() {
  "use strict";

  // Keep this deterministic engine in sync with WorkoutProgression.swift and the
  // shared tests/fixtures/workout-progression.json. It never writes log records.
  const MAX_AGE_MS = 42 * 24 * 60 * 60 * 1000;
  const number = (value) => typeof value === "number" && Number.isFinite(value);
  const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
  const text = (value) => typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
  const exerciseKey = (name) => text(name) ? `name:${text(name)}` : "";

  function normalizeConfig(config) {
    if (!config || typeof config !== "object" || typeof config.enabled !== "boolean") return null;
    const required = config.required_sessions ?? 2;
    if (typeof config.exercise_key !== "string" || !config.exercise_key.startsWith("name:")
      || exerciseKey(config.exercise_key.slice(5)) !== config.exercise_key
      || !integer(config.rep_min, 1, 50) || !integer(config.rep_max, config.rep_min, 50)
      || !integer(config.planned_sets, 1, 20) || !number(config.target_rir) || config.target_rir < 0 || config.target_rir > 5
      || !number(config.increment) || config.increment <= 0 || config.increment > 100
      || !["lb", "kg"].includes(config.unit) || !integer(required, 2, 5)) return null;
    return { enabled: config.enabled, exercise_key: config.exercise_key, rep_min: config.rep_min, rep_max: config.rep_max,
      planned_sets: config.planned_sets, target_rir: config.target_rir, increment: config.increment,
      unit: config.unit, required_sessions: required };
  }

  function unsupported(name, prescription = "") {
    const nameText = text(name);
    if (/\b(assisted|assistance|stretch|mobility|foam roll|cardio)\b/.test(nameText)
      || /\b(sec|secs|seconds?|minutes?|mins?|amrap|failure)\b/i.test(prescription)) return true;
    const bodyweight = /\b(bodyweight|push[ -]?ups?|pull[ -]?ups?|chin[ -]?ups?|dips?|plank|dead bug|bird dog|burpee|jumping jack|mountain climber|inverted row|glute bridge|leg raise|knee raise|ab wheel|bear crawl)\b/.test(nameText);
    return bodyweight && !/\b(weighted|dumbbell|barbell|cable|machine)\b/.test(nameText);
  }

  function deriveConfig(exercise, plannedSets) {
    if (exercise && exercise.progression != null) {
      const configured = normalizeConfig(exercise.progression);
      if (!configured || configured.exercise_key !== exerciseKey(exercise.name)) return null;
      return normalizeConfig({ ...configured, planned_sets: plannedSets ?? configured.planned_sets });
    }
    if (!exercise || typeof exercise.name !== "string" || unsupported(exercise.name, exercise.prescription || "")) return null;
    const prescription = text(exercise.prescription || exercise.reps || "");
    const range = "(\\d{1,2})(?:\\s*[-–—−]\\s*(\\d{1,2}))?";
    let match = prescription.match(new RegExp(`^${range}\\s*(?:reps?)?(?:\\s*(?:x|×)\\s*(\\d{1,2})\\s*sets?)?(?:\\s*(?:each|per side|/side))?$`));
    let low, high, sets;
    if (match) { low = Number(match[1]); high = Number(match[2] || match[1]); sets = match[3] ? Number(match[3]) : null; }
    else {
      match = prescription.match(new RegExp(`^(\\d{1,2})\\s*(?:sets?\\s*(?:of|x|×)|x|×)\\s*${range}(?:\\s*reps?)?(?:\\s*(?:each|per side|/side))?$`));
      if (!match) return null;
      sets = Number(match[1]); low = Number(match[2]); high = Number(match[3] || match[2]);
    }
    return normalizeConfig({ enabled: true, exercise_key: exerciseKey(exercise.name), rep_min: low, rep_max: high,
      planned_sets: plannedSets ?? exercise.sets ?? sets, target_rir: 2, increment: 2.5, unit: "lb", required_sessions: 2 });
  }

  function sameConfig(a, b) {
    const normalized = normalizeConfig(a);
    return normalized && normalized.enabled && ["exercise_key", "rep_min", "rep_max", "planned_sets", "target_rir", "increment", "unit", "required_sessions"]
      .every((key) => normalized[key] === b[key]);
  }
  function timestamp(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      || !validDay(value.slice(0, 10))) return NaN;
    return Date.parse(value);
  }
  function validDay(day) {
    if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
    const parsed = new Date(day + "T00:00:00Z");
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === day;
  }
  function rir(row) {
    if (!number(row.effort_value)) return null;
    if (row.effort_scale === "rir" && row.effort_value >= 0 && row.effort_value <= 10) return row.effort_value;
    if (row.effort_scale === "rpe" && row.effort_value >= 1 && row.effort_value <= 10) return 10 - row.effort_value;
    return null;
  }
  const result = (kind, reason, targets = []) => ({ kind, reason, targets });

  function recommend({ config: input, history = [], now = new Date(), excludedSessionId = null, historyComplete = true } = {}) {
    const config = normalizeConfig(input);
    if (!config) return result("unavailable", "Set a valid rep range, working-set count, effort target, and weight increment first.");
    if (!config.enabled) return result("disabled", "Suggested targets are turned off for this exercise.");
    if (unsupported(config.exercise_key.slice(5))) return result("unavailable", "This exercise needs a different progression method. Set its targets manually.");
    const nowTime = now instanceof Date ? now.valueOf() : typeof now === "number" ? now : timestamp(now);
    if (!number(nowTime) || !Array.isArray(history)) return result("unavailable", "Workout history is unavailable. Keep your planned targets.");
    if (historyComplete !== true) return result("unavailable", "Load your complete recent workout history before using suggested targets.");
    const today = new Date(nowTime).toISOString().slice(0, 10);
    const groups = new Map();
    let latestAmbiguousTime = -Infinity;
    for (const row of history) {
      if (!row || exerciseKey(row.exercise_name) !== config.exercise_key
        || (excludedSessionId && typeof row.session_id === "string" && row.session_id.toLowerCase() === String(excludedSessionId).toLowerCase())) continue;
      const completed = timestamp(row.completed_at);
      if ((number(completed) && completed > nowTime) || !validDay(row.entry_date) || row.entry_date > today) continue;
      if (row.set_type === "warm_up" || row.set_number >= 1000 || row.exercise_code === "CARDIO") continue;
      // Keep incomplete and nonstandard sessions in chronology as barriers. Dropping
      // them would allow two older successes to silently justify a new increase.
      const sessionTime = number(completed) ? completed : Math.min(nowTime, Date.parse(row.entry_date + "T23:59:59Z"));
      if (typeof row.session_id !== "string" || !row.session_id.trim() || row.fwb_session_identity_known === false) {
        latestAmbiguousTime = Math.max(latestAmbiguousTime, sessionTime);
        continue;
      }
      const key = row.session_id.toLowerCase();
      if (!groups.has(key)) groups.set(key, { rows: [], time: sessionTime, id: key });
      const session = groups.get(key);
      session.rows.push(row); session.time = Math.max(session.time, sessionTime);
    }
    const sessions = [...groups.values()].sort((a, b) => b.time - a.time || a.id.localeCompare(b.id));
    if (!sessions.length) return result("baseline", "Log a complete workout to establish your starting weight. No weight is guessed.");
    if (latestAmbiguousTime >= sessions[0].time) return result("baseline", "Your newest matching history has no reliable session identity. Log a complete session with this plan first.");

    function assess(session) {
      const rows = [...session.rows].sort((a, b) => a.set_number - b.set_number);
      const complete = rows.length === config.planned_sets && rows.every((row, index) => row.set_number === index + 1
        && row.fwb_set_type_known !== false && (row.set_type == null || row.set_type === "working") && number(timestamp(row.completed_at))
        && number(row.weight_used) && row.weight_used > 0 && integer(row.reps, 1, 1000));
      const comparable = complete && rows.every((row) => sameConfig(row.progression_target, config));
      const legacy = complete && config.unit === "lb" && rows.every((row) => row.progression_target == null);
      const fresh = nowTime - session.time <= MAX_AGE_MS;
      const effortMet = rows.every((row) => rir(row) !== null && rir(row) >= config.target_rir);
      const upper = comparable && fresh && effortMet && rows.every((row) => row.reps >= config.rep_max);
      const below = comparable && fresh && rows.some((row) => row.reps < config.rep_min);
      const targets = complete ? rows.map((row) => ({ setNumber: row.set_number, weight: row.weight_used, reps: Math.max(config.rep_min, Math.min(config.rep_max, row.reps)) })) : [];
      return { rows, comparable, legacy, fresh, effortMet, upper, below, targets };
    }
    const latest = assess(sessions[0]);
    if (!latest.comparable && !latest.legacy) return result("baseline", "Your latest session is incomplete or uses different targets. Log a complete session with this plan first.");
    if (latest.legacy) return result("hold", "Repeat your last working weights. Earlier logs did not save the planned targets, so they cannot justify an increase.", latest.targets);
    if (!latest.fresh) return result("hold", "Your last comparable workout was over 42 days ago. Re-establish these targets before progressing.", latest.targets);
    const recent = sessions.filter((session) => session.time > latestAmbiguousTime).slice(0, config.required_sessions).map(assess);
    if (recent.length === config.required_sessions && recent.every((session) => session.below)) {
      return result("review", "Recent sessions missed the lower rep target. Keep the load and review the plan with your coach.", latest.targets);
    }
    if (!latest.effortMet) return result("hold", "Keep the same weight and record enough reps in reserve before progressing.", latest.targets);
    const uniformWeight = latest.rows[0].weight_used;
    const canIncrease = recent.length === config.required_sessions && recent.every((session) => session.upper
      && session.rows.every((row) => row.weight_used === uniformWeight));
    if (canIncrease) {
      if (config.increment > uniformWeight * 0.10 + 1e-9) return result("hold", "Your configured weight jump is over 10%. Choose a smaller equipment increment or review it with your coach.", latest.targets);
      return result("increase", `You reached the upper rep target with the planned effort in your last ${config.required_sessions} sessions.`,
        latest.targets.map((target) => ({ ...target, weight: Math.round((target.weight + config.increment) * 10000) / 10000, reps: config.rep_min })));
    }
    if (latest.rows.every((row) => row.reps >= config.rep_min && row.reps <= config.rep_max)) {
      const index = latest.targets.findIndex((target) => target.reps < config.rep_max);
      if (index >= 0) return result("reps", "Keep the same weight and aim for one additional total rep with the planned effort.",
        latest.targets.map((target, i) => ({ ...target, reps: target.reps + (i === index ? 1 : 0) })));
    }
    return result("hold", "Repeat these targets until you consistently reach the upper rep target with the planned effort.", latest.targets);
  }
  return { exerciseKey, normalizeConfig, deriveConfig, defaultConfig: deriveConfig, recommend };
}));
