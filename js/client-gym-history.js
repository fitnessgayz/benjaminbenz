(function (root) {
  "use strict";

  const clean = (value) => String(value || "").trim().replace(/\s+/g, " ");
  const gymKey = (value) => clean(value).toLocaleLowerCase();
  const working = (row) => !["warmup", "warm_up", "warm-up"].includes(String(row?.set_type || "working").toLowerCase())
    && Number(row?.set_number || 1) < 1000
    && Number.isFinite(Number(row?.reps)) && Number(row.reps) > 0;

  function recommendations(logs, date, selectedGym, limit = 3) {
    const groups = new Map();
    (Array.isArray(logs) ? logs : []).filter((row) => (
      working(row) && String(row.entry_date || "") < String(date || "9999-12-31")
    )).forEach((row) => {
      const key = gymKey(row.gym_name);
      const session = String(row.session_id || `${row.entry_date}:${row.workout_title || ""}`);
      const candidate = { key, gym: clean(row.gym_name) || "Gym not recorded", date: row.entry_date, session, sets: [] };
      const group = groups.get(key);
      if (!group || String(candidate.date) > String(group.date) ||
          (candidate.date === group.date && session > group.session)) groups.set(key, candidate);
    });
    (Array.isArray(logs) ? logs : []).filter(working).forEach((row) => {
      const group = groups.get(gymKey(row.gym_name));
      const session = String(row.session_id || `${row.entry_date}:${row.workout_title || ""}`);
      if (group && row.entry_date === group.date && session === group.session) group.sets.push(row);
    });
    return [...groups.values()].filter((group) => group.sets.length)
      .map((group) => ({ ...group, sets: group.sets.sort((a, b) => Number(a.set_number || 1) - Number(b.set_number || 1)) }))
      .sort((a, b) => Number(b.key === gymKey(selectedGym)) - Number(a.key === gymKey(selectedGym))
        || String(b.date).localeCompare(String(a.date)))
      .slice(0, Math.max(0, limit));
  }

  root.FWB_GYM_HISTORY = Object.freeze({ recommendations });
  if (typeof module !== "undefined" && module.exports) module.exports = { recommendations };
})(typeof window === "undefined" ? globalThis : window);
