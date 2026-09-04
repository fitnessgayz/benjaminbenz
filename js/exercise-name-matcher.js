(function attachExerciseNameMatcher(root, factory) {
  const matcher = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = matcher;
  }

  root.FWB_EXERCISE_NAME_MATCHER = matcher;
}(typeof globalThis !== "undefined" ? globalThis : this, function createExerciseNameMatcher() {
  const directionalGroups = [
    ["incline", "decline", "flat"],
    ["abduction", "adduction"],
    ["chest", "reverse"],
    ["seated", "standing", "lying"]
  ];
  const equipmentTokens = new Set(["barbell", "cable", "dumbbell", "machine", "smith"]);
  const pluralReplacements = new Map([
    ["curls", "curl"],
    ["dips", "dip"],
    ["extensions", "extension"],
    ["flies", "fly"],
    ["flys", "fly"],
    ["lunges", "lunge"],
    ["pressdowns", "pressdown"],
    ["pullups", "pull up"],
    ["pushups", "push up"],
    ["raises", "raise"],
    ["rows", "row"]
  ]);

  function displayNameKey(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeName(value) {
    const expanded = displayNameKey(value)
      .replace(/\bdb\b/g, "dumbbell")
      .replace(/\bbb\b/g, "barbell")
      .replace(/\basst\b/g, "assisted")
      .replace(/\bdumbell\b/g, "dumbbell")
      .replace(/\bpullups?\b/g, "pull up")
      .replace(/\bpushups?\b/g, "push up")
      .replace(/\bpulldowns?\b/g, "pull down");

    return expanded
      .split(" ")
      .map((token) => pluralReplacements.get(token) || token)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokenSet(value) {
    return new Set(normalizeName(value).split(" ").filter(Boolean));
  }

  function levenshtein(left, right) {
    const a = normalizeName(left);
    const b = normalizeName(right);
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

    for (let row = 1; row <= a.length; row += 1) {
      const current = [row];

      for (let column = 1; column <= b.length; column += 1) {
        current[column] = Math.min(
          current[column - 1] + 1,
          previous[column] + 1,
          previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1)
        );
      }

      previous.splice(0, previous.length, ...current);
    }

    return previous[b.length];
  }

  function conflictingModifierPenalty(query, candidate, exercise = {}) {
    const queryTokens = tokenSet(query);
    const candidateTokens = tokenSet(candidate);
    let penalty = 0;

    directionalGroups.forEach((group) => {
      const queryModifier = group.find((token) => queryTokens.has(token));
      const candidateModifier = group.find((token) => candidateTokens.has(token));

      if (queryModifier && candidateModifier && queryModifier !== candidateModifier) {
        penalty += 0.5;
      } else if (queryModifier && !candidateModifier) {
        penalty += 0.22;
      }
    });

    const queryEquipment = [...equipmentTokens].find((token) => queryTokens.has(token));
    const candidateEquipment = String(exercise.equipment || "").replaceAll("_", " ");

    if (queryEquipment && candidateEquipment && !normalizeName(candidateEquipment).includes(queryEquipment)) {
      penalty += 0.3;
    }

    return penalty;
  }

  function nameSimilarity(query, candidate, exercise = {}) {
    const normalizedQuery = normalizeName(query);
    const normalizedCandidate = normalizeName(candidate);

    if (!normalizedQuery || !normalizedCandidate) {
      return 0;
    }

    if (normalizedQuery === normalizedCandidate) {
      return 1;
    }

    const queryTokens = tokenSet(normalizedQuery);
    const candidateTokens = tokenSet(normalizedCandidate);
    const intersection = [...queryTokens].filter((token) => candidateTokens.has(token)).length;
    const union = new Set([...queryTokens, ...candidateTokens]).size || 1;
    const jaccard = intersection / union;
    const edit = 1 - (levenshtein(normalizedQuery, normalizedCandidate) /
      Math.max(normalizedQuery.length, normalizedCandidate.length, 1));
    const containsBonus = normalizedQuery.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedQuery)
      ? 0.08
      : 0;

    return Math.max(
      0,
      Math.min(1, edit * 0.58 + jaccard * 0.42 + containsBonus - conflictingModifierPenalty(query, candidate, exercise))
    );
  }

  function rankedLibraryMatches(query, entries = []) {
    const text = String(query || "").trim();

    if (!text) {
      return [];
    }

    return entries
      .filter((exercise) => exercise && exercise.name)
      .map((exercise) => {
        const labels = [exercise.name, ...(exercise.aliases || [])];
        const best = labels
          .map((label) => ({ label, score: nameSimilarity(text, label, exercise) }))
          .sort((left, right) => right.score - left.score)[0];

        return { exercise, matchedLabel: best.label, score: best.score };
      })
      .sort((left, right) => right.score - left.score ||
        String(left.exercise.name).localeCompare(String(right.exercise.name)));
  }

  function recommendedLibraryMatch(query, entries = [], minimumScore = 0.72) {
    const text = String(query || "").trim();

    if (text.length < 3) {
      return null;
    }

    const match = rankedLibraryMatches(text, entries)[0];

    if (!match || match.score < minimumScore) {
      return null;
    }

    if (displayNameKey(text) === displayNameKey(match.exercise.name)) {
      return null;
    }

    return match;
  }

  return {
    displayNameKey,
    normalizeName,
    nameSimilarity,
    rankedLibraryMatches,
    recommendedLibraryMatch
  };
}));
