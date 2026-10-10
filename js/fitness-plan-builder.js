(function attachFitnessPlanBuilder(root, factory) {
  const builder = factory();
  if (typeof module === "object" && module.exports) module.exports = builder;
  root.FWB_FITNESS_PLAN_BUILDER = builder;
}(typeof globalThis !== "undefined" ? globalThis : this, function createFitnessPlanBuilder() {
  "use strict";

  const rotations = {
    2: ["full_body", "full_body"],
    3: ["full_body", "upper_body", "lower_body"],
    4: ["upper_body", "lower_body", "upper_body", "lower_body"],
    5: ["upper_body", "lower_body", "full_body", "upper_body", "lower_body"],
    6: ["upper_body", "lower_body", "chest_back", "lower_body", "arms", "full_body"]
  };
  const weaknessFocus = ["core", "glutes", "shoulders", "back", "chest", "quads", "hamstrings", "arms"];
  const fallbackFocus = {
    full_body: ["upper_body", "lower_body", "core", "glutes"],
    upper_body: ["chest_back", "arms", "chest", "back", "core"],
    lower_body: ["glutes", "quads", "hamstrings", "core"]
  };

  function normalized(value) {
    return String(value || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function blockedTerms(value) {
    return String(value || "").split(/[,;\n]+/).map(normalized).filter((term) => term.length >= 3);
  }

  function isBlocked(entry, terms) {
    const haystack = normalized(`${entry?.name || ""} ${entry?.movement_pattern || ""}`);
    return terms.some((term) => haystack.includes(term) || haystack.includes(term.replace(/s$/, "")));
  }

  function canRequestCoachReview(program) {
    return program?.active === true && program?.account_type === "client"
      && ["personal_training", "online_training"].includes(program?.membership_type);
  }

  function build(answers, library, generator, now = new Date()) {
    const count = Number(answers.training_frequency);
    const minutes = Number(answers.training_minutes);
    if (!rotations[count] || ![20, 30, 45, 60].includes(minutes)) throw new Error("Choose your training days and workout length.");
    if (String(answers.pain_or_injuries || "").trim()) {
      throw new Error("For a current injury or pain, send your answers to Benjamin for review before following a generated program.");
    }
    const terms = blockedTerms(answers.avoid_movements);
    const safeLibrary = (Array.isArray(library) ? library : []).filter((entry) => !isBlocked(entry, terms));
    if (!safeLibrary.length) throw new Error("The exercise library is unavailable. Try again after it loads.");
    const equipment = answers.training_equipment === "full_gym" ? ["full_gym"]
      : answers.training_equipment === "dumbbell" ? ["dumbbell", "bench"] : ["bodyweight"];
    const intensity = answers.training_experience === "beginner" ? "easy" : "moderate";
    const firstDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    const requestedFocus = weaknessFocus.find((focus) => normalized(answers.strengthen_weaknesses).includes(focus));
    const goal = normalized(answers.fitness_goals);
    const focusRotation = [...rotations[count]];
    if (count >= 3 && requestedFocus) focusRotation[focusRotation.length - 1] = requestedFocus;
    else if (count >= 3 && /mobility|flexibility|recovery/.test(goal)) focusRotation[focusRotation.length - 1] = "recovery_full";
    const workouts = focusRotation.map((focus, index) => {
      const day = new Date(firstDay);
      day.setDate(day.getDate() + Math.round(index * 7 / count));
      let workout;
      let lastError;
      for (const candidateFocus of [focus, ...(fallbackFocus[focus] || [])]) {
        try {
          workout = generator.generate({
            focus: candidateFocus, minutes, intensity: candidateFocus.startsWith("recovery_") ? "easy" : intensity,
            equipment, format: "single", library: safeLibrary,
            history: [], seed: index / count + 0.173
          });
          break;
        } catch (error) { lastError = error; }
      }
      if (!workout) throw lastError || new Error("The approved exercise library cannot build this plan yet.");
      return { id: globalThis.crypto.randomUUID(), date: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`, workout };
    });
    return { title: "Your app workout plan", goal: String(answers.fitness_goals || "").trim(), createdAt: now.toISOString(), daysPerWeek: count, workouts };
  }

  return { build, blockedTerms, isBlocked, canRequestCoachReview };
}));
