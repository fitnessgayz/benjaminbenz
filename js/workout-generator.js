(function attachWorkoutGenerator(root, factory) {
  const generator = factory();
  if (typeof module === "object" && module.exports) module.exports = generator;
  root.FWB_WORKOUT_GENERATOR = generator;
}(typeof globalThis !== "undefined" ? globalThis : this, function createWorkoutGenerator() {
  "use strict";

  const MUSCLES = ["chest", "back", "lats", "shoulders", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves", "core", "adductors", "full_body"];
  const UPPER = ["chest", "back", "lats", "shoulders", "biceps", "triceps"];
  const LOWER = ["quads", "hamstrings", "glutes", "calves", "adductors"];
  const FOCUS_OPTIONS = [
    { value: "full_body", label: "Full body", muscles: MUSCLES },
    { value: "upper_body", label: "Upper body", muscles: UPPER },
    { value: "lower_body", label: "Lower body", muscles: LOWER },
    { value: "chest_back", label: "Chest & back", muscles: ["chest", "back", "lats"] },
    { value: "arms", label: "Arms", muscles: ["biceps", "triceps"] },
    { value: "chest", label: "Chest", muscles: ["chest"] },
    { value: "back", label: "Back", muscles: ["back", "lats"] },
    { value: "shoulders", label: "Shoulders", muscles: ["shoulders"] },
    { value: "glutes", label: "Glutes", muscles: ["glutes"] },
    { value: "core", label: "Core", muscles: ["core"] },
    { value: "quads", label: "Quads", muscles: ["quads"] },
    { value: "hamstrings", label: "Hamstrings", muscles: ["hamstrings"] },
    { value: "calves", label: "Calves", muscles: ["calves"] },
    { value: "biceps", label: "Biceps", muscles: ["biceps"] },
    { value: "triceps", label: "Triceps", muscles: ["triceps"] },
    { value: "lats", label: "Lats", muscles: ["lats"] },
    { value: "adductors", label: "Inner thighs", muscles: ["adductors"] },
    { value: "recovery_upper", label: "Upper body recovery", muscles: UPPER, recovery: true },
    { value: "recovery_lower", label: "Lower body recovery", muscles: LOWER, recovery: true },
    { value: "recovery_full", label: "Full body recovery", muscles: MUSCLES, recovery: true }
  ];
  const MUSCLE_OPTIONS = FOCUS_OPTIONS.filter((option) => MUSCLES.includes(option.value) && option.value !== "full_body");
  const EQUIPMENT_OPTIONS = [
    { value: "full_gym", label: "Full gym" },
    { value: "bodyweight", label: "Bodyweight" },
    { value: "dumbbell", label: "Dumbbells" },
    { value: "barbell", label: "Barbell" },
    { value: "cable", label: "Cables" },
    { value: "machine", label: "Machines" },
    { value: "smith_machine", label: "Smith machine" },
    { value: "bench", label: "Bench" }
  ];
  const EQUIPMENT = new Set(EQUIPMENT_OPTIONS.map((option) => option.value));
  const INTENSITIES = new Set(["easy", "moderate", "challenging"]);
  const DURATIONS = new Set([20, 30, 45, 60]);
  const WARMUP_SECONDS = 180;
  const RECENT_DAYS = 14;
  const INTENSITY_NOTES = {
    easy: "Keep the effort comfortable and finish each set with several good reps left.",
    moderate: "Choose a controlled weight and finish each set with a few good reps left.",
    challenging: "Use a challenging, controlled weight; keep good form and avoid training to failure."
  };

  function nameKey(value) {
    return typeof value === "string" ? value.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() : "";
  }

  // Numeric ranges and timed holds can be estimated reliably. Open-ended targets
  // (AMRAP, failure, ladders) remain available in the manual builder.
  function repInfo(value) {
    if (typeof value !== "string") return null;
    const reps = value.trim();
    const match = reps.match(/^(\d{1,3})(?:\s*[-–—−]\s*(\d{1,3}))?\s*(reps?|sec(?:onds?)?|s|min(?:utes?)?)?\s*(each|per side|\/\s*side)?$/i);
    if (!match) return null;
    const low = Number(match[1]);
    const high = Number(match[2] || match[1]);
    const unit = (match[3] || "").toLowerCase();
    const timed = /^(s|min)/.test(unit);
    const seconds = high * (/^min/.test(unit) ? 60 : timed ? 1 : 3);
    if (low < 1 || high < low || (!timed && high > 30) || (timed && seconds > 120)) return null;
    return { reps, seconds: seconds * (match[4] ? 2 : 1), timed, high, perSideSeconds: seconds };
  }

  function options(input) {
    const preset = FOCUS_OPTIONS.find((item) => item.value === input.focus);
    if (!preset) throw new Error("Choose a training focus to generate a workout.");
    if (input.selectedMuscles !== undefined && (!Array.isArray(input.selectedMuscles)
      || input.selectedMuscles.some((value) => !MUSCLE_OPTIONS.some((option) => option.value === value)))) {
      throw new Error("Choose available muscle groups to generate a workout.");
    }
    const selectedMuscles = preset.recovery ? [] : MUSCLE_OPTIONS
      .filter((option) => input.selectedMuscles?.includes(option.value)).map((option) => option.value);
    const labels = MUSCLE_OPTIONS.filter((option) => selectedMuscles.includes(option.value)).map((option) => option.label);
    const label = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} & ${labels.at(-1)}` : labels[0];
    const focus = selectedMuscles.length
      ? { ...preset, label, muscles: [...new Set(MUSCLE_OPTIONS.filter((option) => selectedMuscles.includes(option.value)).flatMap((option) => option.muscles))], recovery: false }
      : preset;
    if (!INTENSITIES.has(input.intensity)) throw new Error("Choose easy, moderate, or challenging intensity.");
    if (!Array.isArray(input.equipment) || input.equipment.some((value) => !EQUIPMENT.has(value))) {
      throw new Error("Choose the equipment you have available.");
    }
    return { focus, selectedMuscles, equipment: new Set(["bodyweight", ...input.equipment]), intensity: focus.recovery ? "easy" : input.intensity };
  }

  function isRecoveryMovement(entry) {
    return ["mobility", "stretch", "stretching", "flexibility", "recovery"].includes(nameKey(entry.movement_pattern));
  }

  function gentleRecoveryEntry(entry, reps = entry.default_reps) {
    const target = repInfo(reps);
    return isRecoveryMovement(entry) && entry.difficulty === "beginner" && entry.equipment === "bodyweight"
      && target && (target.timed ? target.perSideSeconds <= 60 : target.high <= 12);
  }

  function hasEquipment(entry, available) {
    if (available.has("full_gym")) return true;
    if (!available.has(entry.equipment)) return false;
    const name = nameKey(entry.name);
    // A normal bench is not a back-extension station or a hanging/pull-up bar.
    if (/\b(hanging|pull up|chin up|inverted row|suspension|trx|rings?|box|step up|back extension)\b/.test(name)) return false;
    if (entry.equipment === "bodyweight" && /\bdips?\b/.test(name) && !/\bbench\b/.test(name)) return false;
    if (/\b(back squat|front squat)\b/.test(name) && entry.equipment === "barbell") return false;
    if (!["machine", "smith_machine"].includes(entry.equipment)) {
      if (/\b(bench|incline|decline|chest supported|bulgarian|hip thrust|one arm dumbbell row|dumbbell chest fly|seated dumbbell|seated barbell)\b/.test(name) && !available.has("bench")) return false;
      for (const [token, equipment] of [["dumbbell", "dumbbell"], ["barbell", "barbell"], ["cable", "cable"], ["smith", "smith_machine"]]) {
        if (name.includes(token) && !available.has(equipment)) return false;
      }
    }
    return true;
  }

  function validEntry(entry) {
    return entry && typeof entry === "object"
      && typeof entry.id === "string" && Boolean(entry.id.trim())
      && typeof entry.name === "string" && entry.name.trim().length >= 2 && entry.name.trim().length <= 120
      && entry.is_approved === true && entry.is_active === true
      && MUSCLES.includes(entry.primary_muscle)
      && EQUIPMENT.has(entry.equipment) && entry.equipment !== "full_gym"
      && ["beginner", "intermediate"].includes(entry.difficulty)
      && typeof entry.movement_pattern === "string" && Boolean(entry.movement_pattern.trim())
      && Number.isInteger(entry.default_sets) && entry.default_sets >= 1 && entry.default_sets <= 10
      && Number.isInteger(entry.default_rest_seconds) && entry.default_rest_seconds >= 0 && entry.default_rest_seconds <= 600
      && Boolean(repInfo(entry.default_reps));
  }

  function candidates(library, selection, excludedNames) {
    const names = new Set((Array.isArray(excludedNames) ? excludedNames : []).map(nameKey));
    const ids = new Set();
    return (Array.isArray(library) ? library : []).filter((entry) => {
      if (!validEntry(entry) || !selection.focus.muscles.includes(entry.primary_muscle)
        || (selection.focus.recovery ? !gentleRecoveryEntry(entry) : isRecoveryMovement(entry))
        || (selection.intensity === "easy" && entry.difficulty !== "beginner")
        || !hasEquipment(entry, selection.equipment) || names.has(nameKey(entry.name)) || ids.has(entry.id)) return false;
      names.add(nameKey(entry.name));
      ids.add(entry.id);
      return true;
    });
  }

  function demoUrl(value) {
    if (typeof value !== "string") return "";
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password) return "";
      if (["youtube.com", "www.youtube.com", "youtu.be", "www.youtu.be"].includes(url.hostname)) return value;
      if (/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname)
        && /^\/storage\/v1\/object\/public\/exercise-videos\/[a-z0-9/-]+\.(mp4|mov|m4v|webm)$/i.test(url.pathname)
        && !url.search && !url.hash) return value;
    } catch { /* A malformed URL cannot be used as an exercise demo. */ }
    return "";
  }

  function makeExercise(entry, intensity, recovery = false) {
    const sets = recovery ? Math.min(2, entry.default_sets) : Math.min(intensity === "easy" ? 2 : intensity === "challenging" ? 4 : 3,
      Math.max(1, entry.default_sets + (intensity === "easy" ? -1 : intensity === "challenging" ? 1 : 0)));
    const exercise = {
      id: entry.id, name: entry.name.trim(), primary_muscle: entry.primary_muscle,
      equipment: entry.equipment, difficulty: entry.difficulty,
      movement_pattern: entry.movement_pattern, substitution_group: entry.substitution_group || "",
      sets, reps: entry.default_reps.trim(),
      restSeconds: recovery ? Math.min(60, entry.default_rest_seconds) : Math.max(45, Math.min(180, entry.default_rest_seconds)),
      demo_url: demoUrl(entry.demo_url),
      instructions: typeof entry.instructions === "string" ? entry.instructions : ""
    };
    return withSets(exercise, sets);
  }

  function withSets(exercise, sets) {
    const timed = repInfo(exercise.reps).timed;
    const sideSuffix = /\s*(?:each|per side|\/\s*side)$/i;
    const perSide = sideSuffix.test(exercise.reps);
    const target = exercise.reps.replace(sideSuffix, "").trim();
    const reps = (timed ? target.replace(/(\d)\s*s$/i, "$1 sec") : `${target.replace(/\s*reps?$/i, "").trim()} reps`) + (perSide ? "/side" : "");
    return { ...exercise, sets, prescription: `${reps} x ${sets} sets`, rest: `${exercise.restSeconds} sec` };
  }

  function exerciseSeconds(exercise) {
    return exercise.sets * repInfo(exercise.reps).seconds + Math.max(0, exercise.sets - 1) * exercise.restSeconds + 60;
  }

  function totalSeconds(exercises) {
    return WARMUP_SECONDS + exercises.reduce((sum, exercise) => sum + exerciseSeconds(exercise), 0);
  }

  function requiredGroups(focus, selectedMuscles = []) {
    if (selectedMuscles.length) {
      const groups = MUSCLE_OPTIONS.filter((option) => selectedMuscles.includes(option.value)).map((option) => option.muscles);
      // Explicit lats already satisfies back; reserve one slot and one time cost.
      return groups.filter((group, index) => !groups.some((other, otherIndex) => otherIndex !== index
        && other.length < group.length && other.every((muscle) => group.includes(muscle))));
    }
    switch (focus) {
      case "full_body": return [["chest", "shoulders"], ["back", "lats"], ["quads", "hamstrings", "glutes"]];
      case "upper_body": return [["chest", "shoulders"], ["back", "lats"]];
      case "lower_body": return [["quads"], ["hamstrings", "glutes"]];
      case "chest_back": return [["chest"], ["back", "lats"]];
      case "arms": return [["biceps"], ["triceps"]];
      case "recovery_upper": return [UPPER];
      case "recovery_lower": return [LOWER];
      case "recovery_full": return [UPPER, LOWER];
      default: return [];
    }
  }

  function missingGroups(focus, exercises, selectedMuscles = []) {
    return requiredGroups(focus, selectedMuscles).filter((group) => !exercises.some((exercise) => group.includes(exercise.primary_muscle)));
  }

  function dateDay(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed / 86400000 : null;
  }

  function recentHistory(history, now) {
    const date = now === undefined ? new Date() : new Date(now);
    if (!Number.isFinite(date.getTime())) return new Map();
    const today = dateDay(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
    const recent = new Map();
    (Array.isArray(history) ? history : []).forEach((row) => {
      if (!row || typeof row !== "object") return;
      const day = dateDay(row.entry_date);
      const age = day === null ? Infinity : today - day;
      const name = nameKey(row.exercise_name);
      if (name && age >= 0 && age <= RECENT_DAYS) recent.set(name, Math.max(recent.get(name) || 0, (RECENT_DAYS + 1 - age) / (RECENT_DAYS + 1)));
    });
    return recent;
  }

  function historyPenalty(entry, recent) {
    return Math.max(0, ...[entry.name, ...(Array.isArray(entry.aliases) ? entry.aliases : [])].map((name) => recent.get(nameKey(name)) || 0)) * 35;
  }

  function jitter(seed, entry) {
    let hash = 2166136261;
    for (const char of `${seed}:${entry.id}:${nameKey(entry.name)}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return (hash >>> 0) / 4294967296 * 12;
  }

  function score(entry, chosen, missing, recent, seed) {
    return (missing.some((group) => group.includes(entry.primary_muscle)) ? 200 : 0)
      + (chosen.some((item) => item.primary_muscle === entry.primary_muscle) ? 0 : 50)
      + (chosen.some((item) => item.movement_pattern === entry.movement_pattern) ? 0 : 35)
      - historyPenalty(entry, recent) + jitter(seed, entry);
  }

  function notesFor(workout) {
    const recovery = FOCUS_OPTIONS.some((focus) => focus.value === workout.focus && focus.recovery);
    const notes = recovery
      ? ["Gentle mobility, flexibility, and recovery. Move slowly within a comfortable range and breathe naturally.", "Time estimate includes 3 minutes to ease into movement, rests, and transitions."]
      : ["Time estimate includes a 3-minute warm-up, rests between sets, and equipment transitions.", INTENSITY_NOTES[workout.intensity]];
    if (workout.estimatedMinutes < workout.minutes * 0.8) {
      notes.push(recovery
        ? `This selection provides about ${workout.estimatedMinutes} minutes of gentle recovery. There is no need to add extra work to fill the time.`
        : `This library and equipment combination provides about ${workout.estimatedMinutes} minutes of training. Choose more equipment or another focus for a longer session.`);
    }
    if (workout.recentHistoryUsed) notes.push("Recent exercise history helped vary the selection; it does not determine recovery readiness.");
    return notes;
  }

  function finalize(workout) {
    const result = { ...workout, estimatedMinutes: Math.ceil(totalSeconds(workout.exercises) / 60) };
    result.notes = notesFor(result);
    return result;
  }

  function unavailable(focus) {
    if (focus.recovery) return new Error(`There aren't enough approved mobility or stretching exercises for ${focus.label.toLowerCase()}. Ask your coach to add recovery movements for this area to the exercise library.`);
    return new Error(`There aren't enough approved exercises for ${focus.label.toLowerCase()} with this equipment and intensity. Try another focus, add available equipment, or ask your coach to expand the library.`);
  }

  function generate(input = {}) {
    const selection = options(input);
    if (!DURATIONS.has(input.minutes)) throw new Error("Choose a 20, 30, 45, or 60 minute workout.");
    const pool = candidates(input.library, selection, input.excludedNames);
    if (!pool.length || missingGroups(input.focus, pool, selection.selectedMuscles).length) throw unavailable(selection.focus);
    const recent = recentHistory(input.history, input.now);
    const seed = input.seed === undefined ? Math.random() : input.seed;
    const chosen = [];
    const maxExercises = Math.min({ 20: 4, 30: 5, 45: 6, 60: 8 }[input.minutes],
      selection.focus.muscles.length <= 2 ? 4 : 8);
    const timeError = () => new Error(`These muscles cannot all fit a ${input.minutes}-minute workout. ${input.minutes < 60 ? "Choose more time or fewer muscles." : "Choose fewer muscles."}`);
    if (requiredGroups(input.focus, selection.selectedMuscles).length > maxExercises) throw timeError();
    const remaining = [...pool];

    while (remaining.length && chosen.length < maxExercises) {
      const missing = missingGroups(input.focus, chosen, selection.selectedMuscles);
      const ranked = [...remaining].sort((a, b) => score(b, chosen, missing, recent, seed) - score(a, chosen, missing, recent, seed));
      let next = null;
      for (const entry of ranked) {
        let exercise = makeExercise(entry, selection.intensity, selection.focus.recovery);
        // Reserve enough time for the smallest remaining required muscle group,
        // so a long unilateral movement cannot crowd all leg or pulling work out.
        const stillMissing = missingGroups(input.focus, [...chosen, exercise], selection.selectedMuscles);
        if (chosen.length + 1 + stillMissing.length > maxExercises) continue;
        const reserve = stillMissing.reduce((sum, group) => {
          const costs = remaining.filter((item) => item.id !== entry.id && group.includes(item.primary_muscle))
            .map((item) => exerciseSeconds(withSets(makeExercise(item, selection.intensity, selection.focus.recovery), 1)));
          return sum + (costs.length ? Math.min(...costs) : Infinity);
        }, 0);
        while (exercise.sets > 1 && totalSeconds([...chosen, exercise]) + reserve > input.minutes * 60) exercise = withSets(exercise, exercise.sets - 1);
        if (totalSeconds([...chosen, exercise]) + reserve <= input.minutes * 60) { next = exercise; break; }
      }
      if (!next) break;
      chosen.push(next);
      remaining.splice(remaining.findIndex((entry) => entry.id === next.id), 1);
    }
    if (!chosen.length || missingGroups(input.focus, chosen, selection.selectedMuscles).length) {
      throw selection.selectedMuscles.length ? timeError() : unavailable(selection.focus);
    }
    return finalize({
      title: selection.focus.recovery ? selection.focus.label : `${selection.focus.label} workout`, focus: input.focus,
      selectedMuscles: selection.selectedMuscles,
      minutes: input.minutes, intensity: selection.intensity, equipment: [...selection.equipment],
      exercises: chosen, recentHistoryUsed: pool.some((entry) => historyPenalty(entry, recent) > 0)
    });
  }

  function alternatives(input = {}) {
    const workout = input.workout;
    const exercise = input.exercise;
    if (!workout || !Array.isArray(workout.exercises) || !exercise || !DURATIONS.has(workout.minutes)) return [];
    const selection = options({ ...input, focus: workout.focus, selectedMuscles: workout.selectedMuscles ?? input.selectedMuscles });
    const index = workout.exercises.findIndex((item) => item.id === exercise.id && nameKey(item.name) === nameKey(exercise.name));
    if (index < 0) return [];
    const others = workout.exercises.filter((_, position) => position !== index);
    const recent = recentHistory(input.history, input.now);
    const muscleGroup = ["back", "lats"].includes(exercise.primary_muscle) ? ["back", "lats"] : [exercise.primary_muscle];
    return candidates(input.library, selection, workout.exercises.map((item) => item.name))
      .filter((entry) => muscleGroup.includes(entry.primary_muscle) && !others.some((item) => item.id === entry.id))
      .sort((a, b) => {
        const rank = (entry) => (entry.substitution_group && entry.substitution_group === exercise.substitution_group ? 100 : 0)
          + (entry.movement_pattern === exercise.movement_pattern ? 50 : 0)
          + (entry.primary_muscle === exercise.primary_muscle ? 30 : 0) - historyPenalty(entry, recent);
        return rank(b) - rank(a) || a.name.localeCompare(b.name);
      })
      .map((entry) => {
        let replacement = makeExercise(entry, selection.intensity, selection.focus.recovery);
        while (replacement.sets > 1 && totalSeconds([...others, replacement]) > workout.minutes * 60) replacement = withSets(replacement, replacement.sets - 1);
        return replacement;
      })
      .filter((replacement) => totalSeconds([...others, replacement]) <= workout.minutes * 60
        && !missingGroups(workout.focus, [...others, replacement], selection.selectedMuscles).length);
  }

  function swap(workout, index, replacement) {
    if (!workout || !Array.isArray(workout.exercises) || !Number.isInteger(index) || index < 0 || index >= workout.exercises.length
      || !replacement || !replacement.id || !nameKey(replacement.name) || !repInfo(replacement.reps)
      || !Number.isInteger(replacement.sets) || replacement.sets < 1 || replacement.sets > 4
      || !Number.isInteger(replacement.restSeconds) || replacement.restSeconds < 0 || replacement.restSeconds > 180) {
      throw new Error("Choose an available replacement exercise.");
    }
    const selection = options(workout);
    if (!DURATIONS.has(workout.minutes) || !selection.focus.muscles.includes(replacement.primary_muscle)
      || (selection.focus.recovery
        ? !gentleRecoveryEntry(replacement, replacement.reps) || replacement.sets > 2 || replacement.restSeconds > 60
        : isRecoveryMovement(replacement) || replacement.restSeconds < 45)
      || !["beginner", "intermediate"].includes(replacement.difficulty)
      || (workout.intensity === "easy" && replacement.difficulty !== "beginner")
      || !EQUIPMENT.has(replacement.equipment) || !hasEquipment(replacement, selection.equipment)) {
      throw new Error("Choose a replacement that matches your focus and available equipment.");
    }
    const exercises = workout.exercises.map((exercise, position) => position === index ? withSets({ ...replacement }, replacement.sets) : { ...exercise });
    if (new Set(exercises.map((item) => nameKey(item.name))).size !== exercises.length || new Set(exercises.map((item) => item.id)).size !== exercises.length) {
      throw new Error("That exercise is already in this workout. Choose a different replacement.");
    }
    if (missingGroups(workout.focus, exercises, selection.selectedMuscles).length || totalSeconds(exercises) > workout.minutes * 60) {
      throw new Error("That replacement does not fit this workout. Choose another exercise.");
    }
    return finalize({ ...workout, intensity: selection.intensity, exercises });
  }

  return { FOCUS_OPTIONS, MUSCLE_OPTIONS, EQUIPMENT_OPTIONS, generate, alternatives, swap };
}));
