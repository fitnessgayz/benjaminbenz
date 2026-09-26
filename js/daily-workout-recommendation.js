(function attachDailyWorkout(root, factory) {
  const engine = factory();
  if (typeof module === "object" && module.exports) module.exports = engine;
  root.FWB_DAILY_WORKOUT = engine;
}(typeof globalThis !== "undefined" ? globalThis : this, function createDailyWorkout() {
  "use strict";

  const normalized = (value) => String(value || "").trim().toLowerCase();
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  // Parse structured fields only, stopping before the client's free-form note.
  function parseCheckIn(note) {
    if (typeof note !== "string") return null;
    const fields = {};
    const parts = note.split(" · ");
    let freeNote;
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      const field = part.trim();
      if (/^Note:/i.test(field)) {
        freeNote = [field.replace(/^Note:\s*/i, ""), ...parts.slice(index + 1)].join(" · ");
        break;
      }
      const match = field.match(/^(Mood|Energy|Sleep|Body): ([1-5])\/5$/);
      if (!match) {
        if (/^Eating:/.test(field)) continue;
        return null;
      }
      const name = match[1].toLowerCase();
      if (hasOwn(fields, name)) return null;
      fields[name] = Number(match[2]);
    }
    if (!["mood", "energy", "sleep", "body"].every((field) => hasOwn(fields, field))) return null;
    return { mood: fields.mood, energy: fields.energy, sleep: fields.sleep, soreness: 6 - fields.body,
      ...(freeNote !== undefined ? { note: freeNote } : {}) };
  }

  function hasCheckIn(entry, date) {
    if (!entry || !validDate(date) || entry.entry_date !== date) return false;
    return Boolean(parseCheckIn(entry.goal_note)) ||
      (typeof entry.mood_checkin_submitted_at === "string" &&
        Number.isFinite(Date.parse(entry.mood_checkin_submitted_at)));
  }

  // Synchronous SHA-256 keeps recommendation selection synchronous in browsers.
  // These IDs match ContinuitySync.stableUUID in the native app, including UTF-8.
  function stableUUID(namespace, name) {
    const bytes = Array.from(new TextEncoder().encode(`${namespace}|${name}`));
    const length = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let index = 7; index >= 0; index--) bytes.push(Math.floor(length / (2 ** (index * 8))) & 255);
    const constants = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const rotate = (value, count) => (value >>> count) | (value << (32 - count));
    for (let offset = 0; offset < bytes.length; offset += 64) {
      const words = new Array(64);
      for (let index = 0; index < 16; index++) {
        const start = offset + index * 4;
        words[index] = (bytes[start] << 24) | (bytes[start + 1] << 16) | (bytes[start + 2] << 8) | bytes[start + 3];
      }
      for (let index = 16; index < 64; index++) {
        const left = words[index - 15], right = words[index - 2];
        const s0 = rotate(left, 7) ^ rotate(left, 18) ^ (left >>> 3);
        const s1 = rotate(right, 17) ^ rotate(right, 19) ^ (right >>> 10);
        words[index] = (words[index - 16] + s0 + words[index - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = hash;
      for (let index = 0; index < 64; index++) {
        const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
        const first = (h + s1 + ((e & f) ^ (~e & g)) + constants[index] + words[index]) | 0;
        const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
        const second = (s0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        [a, b, c, d, e, f, g, h] = [(first + second) | 0, a, b, c, (d + first) | 0, e, f, g];
      }
      [a, b, c, d, e, f, g, h].forEach((value, index) => { hash[index] = (hash[index] + value) | 0; });
    }
    const result = hash.slice(0, 4).flatMap((value) => [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
    result[6] = (result[6] & 15) | 0x50;
    result[8] = (result[8] & 63) | 0x80;
    const hex = result.map((value) => value.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function workoutID(workout) {
    const supplied = [workout.id, workout.workout_id, workout.template_id].find((id) => uuidPattern.test(String(id || "")));
    return supplied ? normalized(supplied) : stableUUID("fwb-workout-template-v1",
      [workout.title ?? "Workout", workout.focus || "", workout.format || ""].join("|").toLowerCase());
  }

  function dailyID(email, date, program, workout) {
    return stableUUID("fwb-daily-check-in-workout-v1", [normalized(email), date, normalized(program.id), workoutID(workout)].join("|"));
  }

  function recoveryWorkout(workout) {
    return ["mobility", "recovery", "stretching"].includes(normalized(workout.format)) ||
      ["mobility", "recovery", "active recovery", "recovery day", "mobility day", "stretching", "easy mobility"].includes(normalized(workout.title));
  }

  function preparationExercise(exercise) {
    return ["WARMUP", "COOLDOWN"].includes(String(exercise.code || "").toUpperCase().replace(/[^A-Z]/g, "")) ||
      /warm\s*up|cool\s*down/.test(normalized(exercise.name).replace(/-/g, " "));
  }

  function reducePrescription(value) {
    if (typeof value !== "string") return null;
    const setMatches = [...value.matchAll(/\b([1-9]|1[0-2])\s*(?:sets?|rounds?)\b/gi)];
    if (setMatches.length > 1) return null;
    const match = setMatches[0] || value.match(/^\s*([1-9]|1[0-2])\s*[x×]\s*\d/i);
    if (!match || Number(match[1]) <= 1) return null;
    const position = match.index + match[0].indexOf(match[1]);
    if (/[\d.\-–—/]$/.test(value.slice(0, position).trim())) return null;
    const sets = Number(match[1]) - 1;
    return { prescription: value.slice(0, position) + sets + value.slice(position + match[1].length), sets };
  }

  function completedRecord(row) {
    if (typeof row.completed_at === "string" && Number.isFinite(Date.parse(row.completed_at))) return true;
    const sessionKnown = row.fwb_session_identity_known === false ? false :
      row.fwb_session_identity_known === true || hasOwn(row, "session_id") || Boolean(row.workout_session_id);
    const code = String(row.exercise_code || "").toUpperCase();
    const warmup = row.set_type === "warm_up" || Number(row.set_number) > 1000 || code === "WARMUP";
    return !sessionKnown && !warmup && (Number(row.reps) > 0 || Number(row.duration_seconds) > 0 || code === "CARDIO");
  }

  function nextWorkout(options, eligible) {
    const { program, history, date, clientEmail } = options;
    const sessions = new Map();
    (Array.isArray(history) ? history : []).forEach((row) => {
      if (!row || !validDate(row.entry_date) || row.entry_date > date) return;
      if (row.client_email && normalized(row.client_email) !== normalized(clientEmail)) return;
      if (row.program_id && normalized(row.program_id) !== normalized(program.id)) return;
      const title = normalized(row.workout_title);
      const sessionKey = [row.entry_date, title, normalized(row.session_id || row.workout_session_id)].join("|");
      const session = sessions.get(sessionKey) || { date: row.entry_date, title, rows: [], completion: 0, key: sessionKey };
      session.rows.push(row);
      session.completion = Math.max(session.completion, Date.parse(row.completed_at) || 0);
      sessions.set(sessionKey, session);
    });
    const completed = [...sessions.values()].filter((session) => session.rows.some(completedRecord))
      .sort((left, right) => right.date.localeCompare(left.date) || right.completion - left.completion || left.key.localeCompare(right.key));
    for (const session of completed) {
      const index = eligible.findIndex(({ workout }) => {
        const templateID = workoutID(workout);
        const adjustedID = dailyID(clientEmail, session.date, program, workout);
        const records = session.rows.filter((row) => !row.workout_template_id ||
          [templateID, adjustedID].includes(normalized(row.workout_template_id)));
        if (!records.length) return false;
        if (session.title === normalized(workout.title)) return true;
        return session.title === normalized(`Custom workout · Today: ${workout.title} · ${adjustedID}`);
      });
      if (index >= 0) return eligible[session.date === date ? index : (index + 1) % eligible.length];
    }
    return eligible[0];
  }

  function recommend({ program, history = [], checkIn, date, clientEmail } = {}) {
    if (!validDate(date)) throw new Error("Choose a valid date for today's workout.");
    if (!checkIn || !["mood", "energy", "sleep", "soreness"].every((key) => Number.isInteger(checkIn[key]) && checkIn[key] >= 1 && checkIn[key] <= 5)) {
      throw new Error("Answer mood, energy, sleep, and body readiness before choosing today's workout.");
    }
    const { mood, energy, sleep, soreness } = checkIn;
    const score = Math.round((energy + sleep + 6 - soreness) / 15 * 100);
    const level = energy === 1 || sleep === 1 || soreness === 5 || score < 60 ? "recovery"
      : energy <= 2 || sleep <= 2 || soreness >= 4 || score < 80 || mood <= 2 ? "lighter" : "planned";
    const reasons = [];
    if (energy <= 2) reasons.push("You reported low energy today.");
    if (sleep <= 2) reasons.push("You reported less restorative sleep.");
    if (soreness >= 4) reasons.push("You reported more soreness today.");
    if (mood <= 2) reasons.push("You reported a lower mood, so a shorter session may feel more manageable.");
    if (!reasons.length) reasons.push(level === "planned"
      ? "Your energy and recovery support following your plan today."
      : "Your check-in suggests keeping today's effort comfortable.");
    const result = {
      level, date, reasons, changes: [], workout: null, originalWorkout: null, originalIndex: null, workoutIndex: null,
      headline: level === "recovery" ? "Make room for recovery" : "Build a session for today",
      generatorPreferences: { focus: level === "recovery" ? "recovery_full" : "full_body", minutes: level === "planned" ? 30 : 20, intensity: level === "planned" ? "moderate" : "easy" }
    };
    const eligible = normalized(clientEmail) && program && normalized(program.client_email || program.clientEmail) === normalized(clientEmail)
      ? (Array.isArray(program.workouts) ? program.workouts : []).map((workout, index) => ({ workout, index }))
        .filter(({ workout }) => Array.isArray(workout?.exercises) && workout.exercises.length > 0)
      : [];
    if (!eligible.length) {
      result.changes.push(level === "recovery"
        ? "Choose rest or gentle movement today. If you want a session, the generator starts with easy full-body recovery."
        : "Choose your focus and available equipment to generate a workout from the approved exercise library.");
      return result;
    }
    const original = nextWorkout({ program, history, date, clientEmail }, eligible);
    result.originalWorkout = original.workout;
    result.originalIndex = original.index;
    const selected = level === "recovery"
      ? recoveryWorkout(original.workout) ? original : eligible.find(({ workout }) => recoveryWorkout(workout))
      : original;
    if (!selected) {
      result.changes.push("Your program has no assigned recovery routine. Choose rest or gentle movement, or generate an easy recovery session if you feel up to it.");
      return result;
    }
    result.headline = level === "planned" ? "Your planned workout" : level === "lighter" ? "A shorter session today" : "Your recovery session";
    result.workout = selected.workout;
    result.workoutIndex = selected.index;
    if (level === "planned") {
      result.changes.push("Follow the planned exercises, sets, and reps. No extra load or volume is added.");
    } else if (level === "recovery") {
      result.changes.push(`Use your assigned ${selected.workout.title} routine for today's recovery option.`);
    } else {
      const exercises = selected.workout.exercises.map((exercise) => {
        const reduced = preparationExercise(exercise) ? null : reducePrescription(exercise.prescription);
        if (!reduced) return { ...exercise };
        result.changes.push(`${exercise.name}: ${exercise.prescription} → ${reduced.prescription}`);
        const copy = { ...exercise, prescription: reduced.prescription };
        if (Number.isInteger(exercise.sets)) copy.sets = Math.min(exercise.sets, reduced.sets);
        return copy;
      });
      const id = dailyID(clientEmail, date, program, selected.workout);
      result.workout = { ...selected.workout, id, title: `Custom workout · Today: ${selected.workout.title} · ${id}`, exercises };
      result.workoutIndex = null;
      if (!result.changes.length) result.changes.push("Keep the prescribed movements and use a comfortable effort. No load targets are added.");
    }
    return result;
  }

  return { recommend, parseCheckIn, hasCheckIn };
}));
