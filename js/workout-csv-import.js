/* Client-side parser for workout-history exports. The file never leaves the device. */
(function (root) {
  "use strict";

  const months = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

  function parseCsv(text) {
    const rows = [];
    let row = [], field = "", quoted = false;
    const input = String(text || "").replace(/^\uFEFF/, "");
    for (let i = 0; i < input.length; i += 1) {
      const char = input[i];
      if (quoted) {
        if (char === '"' && input[i + 1] === '"') { field += '"'; i += 1; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"') {
        if (field) throw new Error("This CSV has an invalid quoted field.");
        quoted = true;
      } else if (char === ",") {
        row.push(field); field = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && input[i + 1] === "\n") i += 1;
        row.push(field); field = "";
        if (row.some((value) => value.trim())) rows.push(row);
        row = [];
      } else field += char;
    }
    if (quoted) throw new Error("This CSV has an unfinished quoted field.");
    row.push(field);
    if (row.some((value) => value.trim())) rows.push(row);
    if (!rows.length) throw new Error("The CSV file is empty.");
    const header = rows.shift().map((value) => value.trim().toLowerCase());
    if (new Set(header).size !== header.length) throw new Error("The CSV has duplicate column names.");
    return rows.map((values) => Object.fromEntries(header.map((name, index) => [name, (values[index] || "").trim()])));
  }

  function workoutDate(value) {
    const text = String(value || "").trim();
    let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]|$)/);
    if (match) return validDate(match[1], match[2], match[3]);
    match = text.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/);
    if (match && months[match[2].slice(0, 3).toLowerCase()]) {
      return validDate(match[3], months[match[2].slice(0, 3).toLowerCase()], match[1]);
    }
    match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) return validDate(match[3], match[1], match[2]);
    return null;
  }

  function validDate(year, month, day) {
    const y = Number(year), m = Number(month), d = Number(day);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
      ? `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;
  }

  function number(value) {
    if (value === "" || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function detect(headers) {
    const set = new Set(headers);
    if (set.has("start_time") && set.has("exercise_title") && set.has("set_index")) return "hevy";
    if (set.has("date") && set.has("exercise") && set.has("iswarmup")) return "fitbod";
    throw new Error("Choose a workout-history CSV exported from Fitbod or Hevy.");
  }

  function normalizedSetType(value, isWarmup, duration) {
    if (isWarmup || value === "warmup") return "warm_up";
    if (value === "dropset") return "drop";
    if (value === "failure") return "failure";
    if (duration && value !== "normal") return "timed";
    return "working";
  }

  function parse(text) {
    const records = parseCsv(text);
    if (!records.length) throw new Error("The CSV has no workout sets.");
    if (records.length > 20000) throw new Error("Import at most 20,000 sets at a time.");
    const source = detect(Object.keys(records[0]));
    const groups = new Map();
    let skipped = 0;
    for (const record of records) {
      const rawDate = source === "hevy" ? record.start_time : record.date;
      const date = workoutDate(rawDate);
      const exercise = (source === "hevy" ? record.exercise_title : record.exercise || "").slice(0, 180).trim();
      const weight = source === "hevy"
        ? record.weight_lbs !== undefined ? number(record.weight_lbs) : record.weight_kg !== undefined ? number(record.weight_kg) : null
        : number(record["weight(kg)"]);
      const weightUnit = source === "hevy" && record.weight_lbs !== undefined ? "lb" : "kg";
      const reps = number(record.reps);
      const duration = source === "hevy" ? number(record.duration_seconds) : number(record["duration(s)"]);
      if (!date || !exercise || (weight === null && reps === null && !duration)) { skipped += 1; continue; }
      if (source === "hevy" && record.weight_lbs === undefined && record.weight_kg === undefined && weight !== null) {
        throw new Error("The Hevy weight unit is unclear. Export a CSV with weight_kg or weight_lbs.");
      }
      const title = source === "hevy" ? (record.title || "Workout").slice(0, 100) : "Workout";
      const stamp = String(rawDate || "").trim();
      const key = `${source}|${date}|${stamp}|${title}`;
      if (!groups.has(key)) groups.set(key, { date, title, stamp, exercises: new Map(), rows: [] });
      const group = groups.get(key);
      if (!group.exercises.has(exercise)) group.exercises.set(exercise, group.exercises.size + 1);
      const exerciseOrder = group.exercises.get(exercise);
      const sameExercise = group.rows.filter((row) => row.exercise_code === String(exerciseOrder));
      let setNumber = source === "hevy" && Number.isInteger(Number(record.set_index)) && record.set_index !== ""
        ? Number(record.set_index) + 1 : sameExercise.length + 1;
      if (sameExercise.some((row) => row.set_number === setNumber)) {
        setNumber = Math.max(...sameExercise.map((row) => row.set_number)) + 1;
      }
      if (setNumber < 1 || setNumber > 200) { skipped += 1; continue; }
      const setType = weight === null && reps === null && duration ? "timed" :
        normalizedSetType(source === "hevy" ? record.set_type : "", source === "fitbod" && /^(true|1|yes)$/i.test(record.iswarmup), duration);
      const rpe = source === "hevy" ? number(record.rpe) : null;
      const notes = [source === "hevy" ? record.exercise_notes : record.note,
        source === "hevy" ? record.description : "",
        source === "hevy" && record.distance_km ? `Distance: ${record.distance_km} km` : "",
        source === "hevy" && record.distance_miles ? `Distance: ${record.distance_miles} miles` : "",
        source === "fitbod" && record["distance(m)"] ? `Distance: ${record["distance(m)"]} m` : "",
        source === "fitbod" && record.incline ? `Incline: ${record.incline}` : "",
        source === "fitbod" && record.resistance ? `Resistance: ${record.resistance}` : ""
      ].filter(Boolean).join(" · ").slice(0, 1000);
      group.rows.push({ entry_date: date, exercise_code: String(exerciseOrder), exercise_name: exercise,
        exercise_order: exerciseOrder - 1, set_number: setNumber,
        set_type: setType, weight_used: weight === null ? 0 : Math.round((weightUnit === "kg" ? weight * 2.2046226218 : weight) * 100) / 100,
        reps, duration_seconds: duration || null, notes: notes || null,
        effort_scale: rpe !== null && rpe >= 1 && rpe <= 10 ? "rpe" : null,
        effort_value: rpe !== null && rpe >= 1 && rpe <= 10 ? rpe : null });
    }
    const workouts = [...groups.values()].map((group) => ({
      ...group,
      // The source and start time make repeated imports stable and avoid replacing manually logged sets.
      workout_title: `${source === "hevy" ? "Hevy" : "Fitbod"} import · ${group.title} · ${group.stamp}`.slice(0, 240)
    }));
    return { source, workouts, setCount: workouts.reduce((total, group) => total + group.rows.length, 0), skipped };
  }

  const api = { parse, parseCsv, workoutDate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FWBWorkoutCSVImport = api;
})(typeof window === "undefined" ? globalThis : window);
