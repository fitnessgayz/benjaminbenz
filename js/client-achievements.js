(function attachClientAchievements(root) {
  "use strict";

  const DAY = 86400000;
  const LEVELS = [
    [0, "Getting Started"], [300, "Finding Your Groove"], [750, "Momentum Maker"],
    [1500, "Consistency Crew"], [3000, "Dedicated"], [5000, "Trailblazer"],
    [8000, "All-Star"], [12000, "FWB Legend"]
  ];
  const BADGES = [
    ["workout-1", "First Spark", "workouts", "bronze", 1, "sparkles"],
    ["workout-5", "Finding Your Groove", "workouts", "bronze", 5, "dumbbell.fill"],
    ["workout-10", "Double Digits", "workouts", "silver", 10, "dumbbell.fill"],
    ["workout-25", "Momentum Maker", "workouts", "silver", 25, "dumbbell.fill"],
    ["workout-50", "Half Century", "workouts", "gold", 50, "dumbbell.fill"],
    ["workout-100", "Century Club", "workouts", "gold", 100, "dumbbell.fill"],
    ["workout-250", "The Long Game", "workouts", "platinum", 250, "dumbbell.fill"],
    ["pr-1", "Personal Best", "records", "bronze", 1, "trophy.fill"],
    ["pr-5", "Record Breaker", "records", "silver", 5, "trophy.fill"],
    ["pr-10", "Raising the Bar", "records", "gold", 10, "trophy.fill"],
    ["pr-25", "Limit Lifter", "records", "platinum", 25, "trophy.fill"],
    ["weeks-3", "Finding Your Rhythm", "consistency", "bronze", 3, "calendar"],
    ["weeks-8", "Built to Last", "consistency", "silver", 8, "calendar"],
    ["weeks-12", "Consistency Icon", "consistency", "gold", 12, "calendar"],
    ["comeback-1", "Welcome Back", "consistency", "bronze", 1, "arrow.uturn.backward"],
    ["cardio-1", "Heart Starter", "cardio", "bronze", 1, "heart.fill"],
    ["mobility-1", "Stretch Start", "recovery", "bronze", 1, "figure.flexibility"],
    ["mobility-10", "Mobility Builder", "recovery", "silver", 10, "figure.flexibility"],
    ["mobility-25", "Move Freely", "recovery", "gold", 25, "figure.flexibility"],
    ["yoga-1", "First Flow", "recovery", "bronze", 1, "figure.yoga"],
    ["yoga-10", "Flow State", "recovery", "silver", 10, "figure.yoga"],
    ["yoga-25", "Rooted & Rising", "recovery", "gold", 25, "figure.yoga"],
    ["cardio-10", "Cardio Groove", "cardio", "silver", 10, "heart.fill"],
    ["cardio-50", "Endurance Engine", "cardio", "gold", 50, "heart.fill"]
  ];

  function normalize(value) {
    return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .trim().toLowerCase().replace(/\s+/g, " ");
  }

  function dateNumber(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return null;
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
      ? timestamp : null;
  }

  function timestamp(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    const result = Date.parse(value);
    return Number.isFinite(result) ? result : null;
  }

  function number(value, fallback = null) {
    if (value === null || value === undefined || String(value).trim() === "") return fallback;
    if (typeof value === "boolean") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function identifiedSession(row) {
    return String(row?.session_id || row?.workout_session_id || "").trim().toLowerCase();
  }

  function legacyKey(row) {
    return `${row?.entry_date || ""}::${normalize(row?.workout_title || "Workout")}`;
  }

  function sessionKey(row) {
    const identity = identifiedSession(row);
    return identity ? `session:${identity}` : `legacy:${legacyKey(row)}`;
  }

  function rowVersion(row) {
    return Math.max(...[row.client_updated_at, row.updated_at, row.created_at]
      .map(value => timestamp(value) ?? -Infinity));
  }

  function stableRowKey(row) {
    const set = String(row.set_id || "").trim().toLowerCase();
    const id = String(row.id || "").trim().toLowerCase();
    return set ? `set:${set}` : id ? `row:${id}` : "";
  }

  // Identical timestamps have a deterministic winner regardless of network order.
  function rowTieKey(row) {
    return JSON.stringify(Object.keys(row).sort().map(key => [key, row[key]]));
  }

  function latest(left, right) {
    const difference = rowVersion(right) - rowVersion(left);
    if (difference > 0) return right;
    if (difference < 0) return left;
    return rowTieKey(right) > rowTieKey(left) ? right : left;
  }

  function isWarmup(row) {
    return normalize(row.set_type) === "warm_up" || normalize(row.exercise_code) === "warmup" ||
      (number(row.set_number, 0) ?? 0) >= 1000;
  }

  function cardioCode(row) {
    return normalize(row.exercise_code) === "cardio";
  }

  function activityName(value) {
    return normalize(value).replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }

  const mobilityNames = new Set(["cat cow", "side lying open book", "open book", "shoulder circles",
    "supine ankle circles", "ankle circles", "hip circles", "worlds greatest stretch", "90 90 hip switches"]);
  const yogaNames = new Set(["downward dog", "downward facing dog", "upward dog", "upward facing dog",
    "childs pose", "child pose", "warrior pose", "warrior 1", "warrior 2", "warrior i", "warrior ii",
    "tree pose", "pigeon pose", "cobra pose", "triangle pose", "mountain pose", "corpse pose",
    "sun salutation", "sun salutations", "savasana", "balasana", "adho mukha svanasana"]);
  const cardioNames = new Set(["cardio", "walk", "walking", "brisk walk", "run", "running", "jog", "jogging",
    "bike", "biking", "cycling", "stationary bike", "indoor cycling", "elliptical", "stair climber",
    "stairclimber", "rowing", "rowing machine", "swim", "swimming", "treadmill", "jump rope"]);

  function mobilityLabel(value) {
    return /^(?:(?:upper body|lower body|full body|gentle|daily|morning|evening) )?(?:mobility|stretching|flexibility|mobility and flexibility|stretching and mobility)(?: session| workout| routine)?$/.test(value)
      || /^(upper body|lower body|full body) recovery$/.test(value);
  }

  function yogaLabel(value) {
    return /^(?:(?:morning|evening|gentle|power|restorative|yin|hatha|vinyasa|ashtanga|hot) )?yoga(?: flow| session| class| practice| workout)?$/.test(value)
      || /^(?:vinyasa|hatha|yin yoga)(?: flow| session| class| practice)?$/.test(value);
  }

  function titleMatches(row, predicate) {
    return String(row.workout_title || "").split("·").some(part => predicate(activityName(part)));
  }

  function isMobility(row) {
    const code = activityName(row.exercise_code), name = activityName(row.exercise_name);
    return ["mobility", "stretch", "stretching", "flexibility", "recovery"].includes(code)
      || mobilityNames.has(name) || mobilityLabel(name)
      || /(?:^| )(?:stretch|stretching|mobility|flexibility|foam roll|foam rolling)$/.test(name)
      || titleMatches(row, mobilityLabel);
  }

  function isYoga(row) {
    return activityName(row.exercise_code) === "yoga" || yogaNames.has(activityName(row.exercise_name))
      || yogaLabel(activityName(row.exercise_name)) || titleMatches(row, yogaLabel);
  }

  function isCardio(row) {
    if (isMobility(row) || isYoga(row)) return false;
    return cardioCode(row) || ((number(row.duration_seconds, 0) ?? 0) > 0
      && (cardioNames.has(activityName(row.exercise_name)) || titleMatches(row, value => cardioNames.has(value))));
  }

  function legacyRecoveryDuration(row) {
    // Native Mobility quick-start stores seconds/rounds in weight_used/reps.
    return titleMatches(row, value => value === "mobility" || yogaLabel(value))
      || ["mobility", "stretch", "stretching", "flexibility", "yoga"].includes(activityName(row.exercise_code));
  }

  function isTimed(row) {
    return normalize(row.set_type) === "timed" || (number(row.duration_seconds, 0) ?? 0) > 0;
  }

  function meaningful(row) {
    if (isWarmup(row)) return false;
    if (cardioCode(row) || legacyRecoveryDuration(row)) return (number(row.duration_seconds, 0) ?? 0) > 0
      || (number(row.weight_used, 0) ?? 0) > 0 || (!cardioCode(row) && (number(row.reps, 0) ?? 0) > 0);
    if (isTimed(row)) return (number(row.duration_seconds, 0) ?? 0) > 0;
    const weight = number(row.weight_used, 0);
    return weight !== null && weight >= 0 && (number(row.reps, 0) ?? 0) > 0;
  }

  function sessionsFromRows(records, today, clientEmail) {
    const stableRows = new Map();
    const idless = [];
    for (const row of Array.isArray(records) ? records : []) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      if (clientEmail && row.client_email && normalize(row.client_email) !== clientEmail) continue;
      const id = stableRowKey(row);
      if (!id) idless.push(row);
      else stableRows.set(id, stableRows.has(id) ? latest(stableRows.get(id), row) : row);
    }
    const rows = [...stableRows.values(), ...idless].filter(row => {
      const date = dateNumber(row.entry_date);
      return date !== null && row.entry_date <= today;
    });
    const identifiedByLegacy = new Map();
    for (const row of rows) {
      if (!identifiedSession(row)) continue;
      const key = legacyKey(row);
      if (!identifiedByLegacy.has(key)) identifiedByLegacy.set(key, new Set());
      identifiedByLegacy.get(key).add(sessionKey(row));
    }
    const groups = new Map();
    for (const row of rows) {
      const candidates = identifiedByLegacy.get(legacyKey(row));
      const key = !identifiedSession(row) && candidates?.size === 1
        ? candidates.values().next().value : sessionKey(row);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return [...groups.entries()].map(([id, members]) => {
      const unique = new Map();
      for (const row of members) {
        const stable = stableRowKey(row);
        const key = stable || `entry:${normalize(row.exercise_name || row.exercise_code)}:${row.set_number ?? ""}`;
        unique.set(key, unique.has(key) ? latest(unique.get(key), row) : row);
      }
      const rows = [...unique.values()];
      const dates = rows.map(row => row.entry_date).sort();
      const completions = rows.map(row => timestamp(row.completed_at)).filter(value => value !== null);
      return { id, date: dates[0], completion: completions.length ? Math.min(...completions) : null, rows };
    }).filter(session => session.completion !== null && session.rows.some(meaningful))
      .sort((left, right) => left.date.localeCompare(right.date) || left.completion - right.completion ||
        left.id.localeCompare(right.id));
  }

  function monday(date) {
    const day = dateNumber(date);
    const weekday = (new Date(day).getUTCDay() + 6) % 7;
    return day - weekday * DAY;
  }

  function badgeDetail(id, target) {
    if (id.startsWith("workout-")) return `Complete ${target} workout${target === 1 ? "" : "s"}.`;
    if (id.startsWith("pr-")) return `Set ${target} new personal record${target === 1 ? "" : "s"}.`;
    if (id.startsWith("weeks-")) return `Complete a workout in ${target} consecutive weeks.`;
    if (id === "comeback-1") return "Complete a workout after 14 or more days away.";
    if (id.startsWith("mobility-")) return `Complete ${target} workout${target === 1 ? "" : "s"} with stretching or mobility.`;
    if (id.startsWith("yoga-")) return `Complete ${target} workout${target === 1 ? "" : "s"} with yoga.`;
    return target === 1 ? "Complete a workout with cardio." : `Complete ${target} workouts with cardio.`;
  }

  function badgeValue(id, totals) {
    if (id.startsWith("workout-")) return totals.workouts;
    if (id.startsWith("pr-")) return totals.prs;
    if (id.startsWith("weeks-")) return totals.bestWeeks;
    if (id.startsWith("mobility-")) return totals.mobilityWorkouts;
    if (id.startsWith("yoga-")) return totals.yogaWorkouts;
    return id === "comeback-1" ? totals.comebacks : totals.cardioWorkouts;
  }

  function personalRecords(session, bests) {
    const exerciseSets = new Map();
    for (const row of session.rows) {
      if (!meaningful(row) || isWarmup(row) || isCardio(row) || isTimed(row) || isMobility(row) || isYoga(row)) continue;
      const name = normalize(row.exercise_name);
      if (!name) continue;
      const weight = number(row.weight_used, 0);
      const reps = number(row.reps, 0);
      if (!exerciseSets.has(name)) exerciseSets.set(name, { name: String(row.exercise_name).trim().replace(/\s+/g, " "), weight: 0, weightReps: 0, reps: 0 });
      const result = exerciseSets.get(name);
      if (weight > result.weight || (weight === result.weight && reps > result.weightReps)) {
        result.weight = weight;
        result.weightReps = reps;
      }
      if (weight === 0) result.reps = Math.max(result.reps, reps);
      // Display name selection is stable when a session contains case/spacing variants.
      const display = String(row.exercise_name).trim().replace(/\s+/g, " ");
      if (display < result.name) result.name = display;
    }
    const events = [];
    for (const [key, current] of [...exerciseSets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const previous = bests.get(key) || { weight: 0, reps: 0 };
      const weightPR = previous.weight > 0 && current.weight > previous.weight;
      const repsPR = previous.reps > 0 && current.reps > previous.reps;
      if (weightPR || repsPR) events.push({
        id: `pr:${session.id}:${key}`, kind: "pr", sessionId: session.id, date: session.date,
        title: `New PR · ${current.name}`,
        detail: weightPR ? `${current.weight} lb × ${current.weightReps} reps` : `${current.reps} bodyweight reps`
      });
      bests.set(key, { weight: Math.max(previous.weight, current.weight), reps: Math.max(previous.reps, current.reps) });
    }
    return events;
  }

  function evaluate(records, options = {}) {
    const now = new Date();
    const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const today = dateNumber(options.today) !== null ? options.today : localToday;
    const sessions = sessionsFromRows(records, today, normalize(options.clientEmail));
    const totals = { workouts: 0, prs: 0, bestWeeks: 0, comebacks: 0, cardioWorkouts: 0, mobilityWorkouts: 0, yogaWorkouts: 0 };
    const earned = new Map();
    const bests = new Map();
    const events = [];
    let previousDate = null, previousWeek = null, weeks = 0;
    for (const session of sessions) {
      totals.workouts += 1;
      if (session.rows.some(row => isCardio(row) && meaningful(row))) totals.cardioWorkouts += 1;
      if (session.rows.some(row => isMobility(row) && meaningful(row))) totals.mobilityWorkouts += 1;
      if (session.rows.some(row => isYoga(row) && meaningful(row))) totals.yogaWorkouts += 1;
      const date = dateNumber(session.date);
      if (previousDate !== null && date - previousDate >= 14 * DAY) totals.comebacks += 1;
      previousDate = date;
      const week = monday(session.date);
      if (week !== previousWeek) {
        weeks = previousWeek !== null && week - previousWeek === 7 * DAY ? weeks + 1 : 1;
        previousWeek = week;
        totals.bestWeeks = Math.max(totals.bestWeeks, weeks);
      }
      const records = personalRecords(session, bests);
      totals.prs += records.length;
      events.push(...records);
      for (const [id, title, , , target] of BADGES) {
        if (earned.has(id) || badgeValue(id, totals) < target) continue;
        earned.set(id, session.date);
        events.push({ id: `badge:${id}`, kind: "badge", sessionId: session.id, date: session.date,
          title, detail: badgeDetail(id, target), badgeId: id });
      }
    }
    const badges = BADGES.map(([id, title, category, tier, target, icon]) => ({
      id, title, detail: badgeDetail(id, target), icon, category, tier, target,
      current: Math.min(target, badgeValue(id, totals)), unlocked: earned.has(id), earnedOn: earned.get(id) || null
    }));
    const xp = 100 * totals.workouts + 50 * totals.prs + 100 * earned.size;
    let index = 0;
    while (index + 1 < LEVELS.length && xp >= LEVELS[index + 1][0]) index += 1;
    const [minimumXP, name] = LEVELS[index];
    const next = LEVELS[index + 1];
    const level = { number: index + 1, name, minimumXP, nextXP: next?.[0] ?? null,
      nextName: next?.[1] ?? null, progress: next ? (xp - minimumXP) / (next[0] - minimumXP) : 1 };
    return { ...totals, xp, level, badges, events };
  }

  const api = Object.freeze({ evaluate, sessionKey });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.FWB_ACHIEVEMENTS = api;
})(typeof window !== "undefined" ? window : globalThis);
