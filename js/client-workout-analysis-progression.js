(function attachWorkoutAnalysisProgression(root, factory) {
  const model = factory(root.FWB_WORKOUT_PROGRESSION ||
    (typeof require === "function" ? require("./workout-progression.js") : null));
  if (typeof module === "object" && module.exports) module.exports = model;
  root.FWB_WORKOUT_ANALYSIS_PROGRESSION = model;
}(typeof globalThis !== "undefined" ? globalThis : this, function createWorkoutAnalysisProgression(engine) {
  "use strict";

  const time = (date) => Date.parse(date);
  const day = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || "") &&
    Number.isFinite(time(value)) && new Date(time(value)).toISOString().slice(0, 10) === value;
  const recordedLoad = (row) => Number.isFinite(row.weight_used) && row.weight_used > 0 &&
    Number.isInteger(row.reps) && row.reps > 0 && row.reps <= 1000;
  const isWorkingExerciseRow = (row) => row && !["CARDIO", "WARMUP"].includes(String(row.exercise_code || "").trim().toUpperCase())
    && row.set_type !== "warm_up" && row.set_number < 1000;
  const ordinarySet = (row) => Number.isInteger(row.set_number) && row.set_number > 0 && row.fwb_set_type_known !== false &&
    (!row.set_type || row.set_type === "working") && !(Number(row.duration_seconds) > 0);
  const orderedSets = (rows) => [...rows].sort((left, right) => left.set_number - right.set_number);
  const bestSet = (rows) => rows.filter((row) => ordinarySet(row) && recordedLoad(row))
    .reduce((best, row) => {
      if (!best || row.weight_used > best.weight ||
          (row.weight_used === best.weight && row.reps > best.reps)) return { weight: row.weight_used, reps: row.reps };
      return best;
    }, null);

  function canonicalExerciseNames(catalog, normalizeName) {
    const exactNames = new Set();
    const aliases = new Map();
    for (const exercise of catalog) {
      const key = normalizeName(exercise.name);
      if (!key) continue;
      exactNames.add(key);
      for (const alias of exercise.aliases || []) {
        const aliasKey = normalizeName(alias);
        if (!aliasKey) continue;
        if (!aliases.has(aliasKey)) aliases.set(aliasKey, new Set());
        aliases.get(aliasKey).add(key);
      }
    }
    return (name) => {
      const key = normalizeName(name);
      if (exactNames.has(key) || !aliases.has(key)) return key;
      const owners = aliases.get(key);
      return owners.size === 1 ? owners.values().next().value : "";
    };
  }

  function prepare(currentRows, history, {
    owner, historyComplete, canonicalName, sameGym, sessionKey, now = new Date()
  }) {
    const normalizedOwner = String(owner || "").trim().toLowerCase();
    const owns = (row) => String(row?.client_email || "").trim().toLowerCase() === normalizedOwner;
    if (!engine?.supportsExercise || !normalizedOwner || !currentRows.length || !currentRows.every(owns)) return () => null;
    const currentKey = sessionKey(currentRows[0]);
    const currentDate = currentRows[0].entry_date;
    const currentGym = currentRows.find((row) => row.gym_name)?.gym_name;
    const nowTime = now.valueOf();
    if (!Number.isFinite(nowTime)) return () => null;
    const today = new Date(nowTime).toISOString().slice(0, 10);
    const completion = currentRows.reduce((latest, row) => Math.max(latest, time(row.completed_at) || 0), 0);
    const currentCodesByName = new Map();
    for (const row of currentRows.filter(isWorkingExerciseRow)) {
      const name = canonicalName(row.exercise_name);
      if (!currentCodesByName.has(name)) currentCodesByName.set(name, new Set());
      currentCodesByName.get(name).add(row.exercise_code);
    }
    const previousByName = new Map();
    for (const row of history) {
      const finished = time(row?.completed_at);
      if (!isWorkingExerciseRow(row) || !day(row.entry_date) ||
          !owns(row) ||
          sessionKey(row) === currentKey || !(finished <= nowTime) || row.entry_date > currentDate ||
          (row.entry_date === currentDate && !(completion && finished < completion))) continue;
      const name = canonicalName(row.exercise_name);
      if (!currentCodesByName.has(name)) continue;
      if (!previousByName.has(name)) previousByName.set(name, []);
      previousByName.get(name).push(row);
    }

    return (exerciseRows) => {
      if (!exerciseRows.length) return null;
      const name = canonicalName(exerciseRows[0].exercise_name);
      if (!engine.supportsExercise(name)) return null;
      const current = orderedSets(exerciseRows.filter(isWorkingExerciseRow));
      const thisWorkout = bestSet(current);
      if (!thisWorkout) return null;
      const gym = exerciseRows.find((row) => row.gym_name)?.gym_name || currentGym;
      const earlier = (previousByName.get(name) || []).filter((row) => sameGym(row.gym_name, gym));
      const comparableSets = earlier.filter((row) => ordinarySet(row) && recordedLoad(row)).sort((left, right) =>
        right.entry_date.localeCompare(left.entry_date) || time(right.completed_at) - time(left.completed_at) ||
        sessionKey(right).localeCompare(sessionKey(left))
      );
      const latest = comparableSets[0];
      const previous = latest ? { date: latest.entry_date,
        ...bestSet(comparableSets.filter((row) => sessionKey(row) === sessionKey(latest))) } : null;
      const response = (reason, targets = [], kind = "unavailable") => ({ thisWorkout, previous, reason, targets, kind });
      const completeWorkingSets = current.length <= 20 && current.every((row, index) =>
        row.set_number === index + 1 && ordinarySet(row) && recordedLoad(row));
      const repeatTargets = () => current.map((row) => ({ setNumber: row.set_number, weight: row.weight_used, reps: row.reps }));
      if (!historyComplete || !day(currentDate) || currentDate > today || completion > nowTime) {
        return response("Complete recent workout history is needed to suggest your next targets.");
      }
      if (currentCodesByName.get(name)?.size > 1) {
        return response("This exercise was logged more than once in the workout. Use the recorded sets to choose a target for each occurrence.");
      }

      const rawConfig = current.find((row) => row.progression_target != null)?.progression_target;
      if (rawConfig == null) {
        if (!completeWorkingSets) {
          return response("Log a complete set of working weights and reps to establish a starting point.");
        }
        return response("Repeat these logged sets as your starting point. Set a rep range and effort target before increasing the weight.",
          repeatTargets(), "baseline");
      }
      const adaptConfig = (raw) => {
        const config = engine.normalizeConfig(raw);
        if (!config || canonicalName(config.exercise_key.slice(5)) !== name) return null;
        return { ...config, exercise_key: engine.exerciseKey(name) };
      };
      const config = adaptConfig(rawConfig);
      if (!config || config.unit !== "lb") {
        return response("This workout’s saved targets do not match a supported plan in pounds.");
      }
      if (!config.enabled) return response("Progression is turned off for this exercise.");
      const hasConsistentTargets = current.every((row) => {
        const candidate = adaptConfig(row.progression_target);
        return candidate && Object.keys(config).every((key) => candidate[key] === config[key]);
      });
      if (!completion || !currentKey.startsWith("session:") || !hasConsistentTargets) {
        return response("A completed session with consistent saved targets is needed before suggesting progression.");
      }
      if (earlier.some((row) => time(row.completed_at) >= completion)) {
        const canRepeat = completeWorkingSets && current.length === config.planned_sets;
        return response("An earlier workout was logged later. Its sets are shown for comparison, and the target stays at your recorded effort.",
          canRepeat ? repeatTargets() : [], "hold");
      }
      // Keep incomplete or differently programmed working sets in completed earlier sessions so the
      // shared engine can withhold increases rather than jumping past a more recent incompatible session.
      const rows = [...earlier, ...current].map((row) => {
        const key = sessionKey(row);
        return { ...row, exercise_name: name, session_id: key.startsWith("session:") ? key.slice(8) : null,
          set_type: Number(row.duration_seconds) > 0 ? "timed" : row.set_type,
          progression_target: row.progression_target == null ? null : adaptConfig(row.progression_target) || {} };
      });
      const result = engine.recommend({ config, history: rows, now, historyComplete: true });
      return response(result.reason, result.targets, result.kind);
    };
  }

  return { canonicalExerciseNames, prepare };
}));
