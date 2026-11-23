import { poundsPerKilogram, type HistorySet } from "./gruntr-workouts.js";

export type ProgressionOptions = {
  rep_min: number;
  rep_max: number;
  planned_sets: number;
  target_rir: number;
  required_sessions: number;
  unit: "lb" | "kg";
  increment?: number;
  technique?: "controlled" | "uncertain" | "form_broke";
  recovery?: "normal" | "fatigued" | "very_fatigued";
};

type Session = { id: string; date: string; sets: HistorySet[] };
type Recovery = {
  occurred_on: string;
  energy: number | null;
  soreness: number | null;
  sleep_hours: number | null;
  source?: "check_in" | "workout_feedback";
};
const round = (n: number) => Math.round(n * 100) / 100;
const tolerance = 0.025;
const sameLoad = (a: number, b: number) => Math.abs(a - b) <= tolerance;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
const effort = (set: HistorySet) => set.rir ?? (set.rpe === null ? null : 10 - set.rpe);

function workingSessions(rows: HistorySet[]): Session[] {
  const sessions = new Map<string, Session>();
  for (const set of rows) {
    if (set.set_type && set.set_type !== "working") continue;
    if (!Number.isInteger(set.reps) || set.reps <= 0) continue;
    const session = sessions.get(set.session_id) ?? { id: set.session_id, date: set.date, sets: [] };
    session.sets.push(set);
    sessions.set(set.session_id, session);
  }
  return [...sessions.values()].sort((a, b) => b.date.localeCompare(a.date)
    || (b.sets[0]?.completed_at ?? "").localeCompare(a.sets[0]?.completed_at ?? "")
    || a.id.localeCompare(b.id));
}

export function summarizePerformance(rows: HistorySet[], from: string, through: string) {
  const sessions = workingSessions(rows);
  const weighted = sessions.flatMap(({ sets }) => sets.filter((s) => s.weight_lb !== null && s.weight_lb > 0));
  const bodyweight = sessions.flatMap(({ sets }) => sets.filter((s) => s.bodyweight));
  const weightedBest = [...weighted].sort((a, b) => b.weight_lb! - a.weight_lb! || b.reps - a.reps)[0];
  const bodyweightBest = [...bodyweight].sort((a, b) => b.reps - a.reps)[0];
  const e1rm = weighted.filter((set) => set.reps <= 10).map((set) => Math.max(set.weight_lb!,
    set.reps === 1 ? set.weight_lb! : set.weight_lb! * (1 + set.reps / 30)));
  const span = daysBetween(through, from) + 1;
  const reference = sessions[0]?.sets.find((set) => set.bodyweight || (set.weight_lb ?? 0) > 0);
  const comparable = reference ? sessions.flatMap((session) => {
    const sets = session.sets.filter((set) => reference.bodyweight ? set.bodyweight :
      set.weight_lb !== null && reference.weight_lb !== null && sameLoad(set.weight_lb, reference.weight_lb)
      && set.gym === reference.gym);
    return sets.length ? [{ session_id: session.id, date: session.date, best_reps: Math.max(...sets.map((set) => set.reps)) }] : [];
  }) : [];
  const recentReps = comparable.slice(0, 2).map((row) => row.best_reps);
  const previousReps = comparable.slice(2, 4).map((row) => row.best_reps);
  const trend = previousReps.length < 2 ? "insufficient_history"
    : Math.min(...recentReps) > Math.max(...previousReps) ? "improving"
    : Math.max(...recentReps) < Math.min(...previousReps) ? "declining"
    : [...recentReps, ...previousReps].every((reps) => reps === recentReps[0]) ? "stable" : "variable";
  return {
    working_sessions: sessions.length,
    sessions_per_week: round(sessions.length * 7 / Math.max(span, 1)),
    heaviest_set: weightedBest ?? null,
    best_bodyweight_set: bodyweightBest ?? null,
    estimated_1rm_lb: e1rm.length ? round(Math.max(...e1rm)) : null,
    estimated_1rm_method: "Epley estimate from sets of 2–10 reps, or the actual load for a single",
    recorded_external_volume_lb_reps: weighted.length ? round(weighted.reduce((sum, s) => sum + s.weight_lb! * s.reps, 0)) : null,
    rep_trend: { direction: trend, load_lb: reference?.weight_lb ?? null,
      bodyweight: reference?.bodyweight ?? false, observations: comparable.slice(0, 8) },
    recent_sessions: sessions.slice(0, 8).map((s) => ({
      session_id: s.id, date: s.date, working_sets: s.sets.length,
      total_reps: s.sets.reduce((sum, set) => sum + set.reps, 0),
      loads_lb: [...new Set(s.sets.map((set) => set.weight_lb))],
    })),
  };
}

export function recommendProgression(
  rows: HistorySet[], options: ProgressionOptions, through: string,
  recovery: Recovery | null,
  complete: boolean, knownExercise: boolean, equipment?: string, exerciseName?: string,
) {
  const { rep_min: low, rep_max: high, planned_sets: count, target_rir: targetRir, unit } = options;
  const outputLoad = (weight: number) => round(unit === "kg" ? weight / poundsPerKilogram : weight);
  const sessions = workingSessions(rows);
  const notes: string[] = [];
  if (!complete) notes.push("The history scan reached its limit.");
  if (!knownExercise) notes.push("The exercise name has no verified library match.");
  if (options.technique !== "controlled") notes.push("Controlled technique has not been confirmed for the qualifying sets.");
  if (!options.recovery && !recovery) notes.push("No recent recovery information was recorded or provided.");
  if (equipment === "machine" || equipment === "cable" || equipment === "smith_machine") {
    notes.push("Equipment settings and machine calibration may vary, including within one gym.");
  }
  const evidence = sessions.slice(0, 5).map((session) => ({
    session_id: session.id, date: session.date, sets: session.sets.map((set) => ({
      set_id: set.set_id, reps: set.reps, load: set.weight_lb === null ? null : outputLoad(set.weight_lb),
      bodyweight: set.bodyweight, rpe: set.rpe, rir: set.rir,
    })),
  }));
  const result = (action: string, reason: string, reps: number[] = [], load: number | null = null) => ({
    action, reason, unit, target_load: load, target_reps_by_set: reps, rep_range: [low, high],
    target_rir: targetRir, recovery_check_in: recovery, evidence, caveats: notes,
    guidance_source: "https://doi.org/10.1249/MSS.0000000000003897",
  });
  if (exerciseName && /\b(assisted|assistance|stretch|mobility)\b/i.test(exerciseName)) {
    return result("baseline", "This movement needs a movement-specific progression rule for assistance, time, or range of motion.");
  }
  if (options.recovery === "very_fatigued" || (recovery?.soreness != null && recovery.soreness >= 5)) {
    return result("rest", "Recent recovery feedback supports taking a rest day or rescheduling the hard session.");
  }
  const latest = sessions[0];
  if (!latest || daysBetween(through, latest.date) > 42) {
    return result("baseline", "There are no recent comparable working sets. Establish a comfortable baseline and record reps, load and effort.");
  }
  const first = latest.sets[0];
  if (!first) return result("baseline", "No working sets are available for comparison.");
  const bodyweight = first.bodyweight;
  const load = first.weight_lb;
  // Position may change between days. Compare one exercise occurrence per
  // session while accepting a different position in another workout.
  const comparable = (session: Session) => session.sets.length === count
    && new Set(session.sets.map((set) => set.exercise_order)).size === 1
    && new Set(session.sets.map((set) => set.set_number)).size === count
    && session.sets.every((set) => bodyweight ? set.bodyweight : load !== null
      && set.weight_lb !== null && sameLoad(set.weight_lb, load)
      && (!(equipment === "machine" || equipment === "cable" || equipment === "smith_machine") || set.gym === first.gym));
  if (!comparable(latest) || (!bodyweight && (load === null || load <= 0))) {
    return result("baseline", "The latest session has mixed or unknown loads, or a different working-set count. Establish one comparable baseline.");
  }
  const shownLoad = load === null ? null : outputLoad(load);
  const latestReps = latest.sets.map((set) => Math.max(1, Math.min(high, set.reps)));
  const recent = sessions.slice(0, options.required_sessions);
  const matched = recent.length === options.required_sessions && recent.every((s) => comparable(s) && daysBetween(through, s.date) <= 42);
  const missed = matched && recent.every((s) => s.sets.some((set) => set.reps < low));
  const fatigue = options.recovery === "fatigued" ||
    (recovery?.energy != null && recovery.energy <= 2) || (recovery?.soreness != null && recovery.soreness >= 4);
  if (fatigue && missed) {
    const lighter = shownLoad === null || !options.increment || shownLoad <= options.increment
      ? null : round(shownLoad - options.increment);
    return result("deload", "Repeated misses below the minimum plus reported fatigue or soreness favor an easier session.",
      Array<number>(Math.max(1, count - 1)).fill(low), lighter);
  }
  if (fatigue || missed || options.technique === "form_broke") {
    return result("maintain", "Repeat or ease the workload while you address the recorded fatigue, repeated rep misses, or loss of form.", latestReps, shownLoad);
  }
  const enoughEffort = (session: Session) => session.sets.every((set) => {
    const rir = effort(set);
    return rir !== null && rir >= targetRir;
  });
  if (!enoughEffort(latest)) {
    return result("maintain", "Recent recorded effort is missing or closer to failure than the target. Repeat the load and record effort.", latestReps, shownLoad);
  }
  const upper = matched && recent.every((s) => enoughEffort(s) && s.sets.every((set) => set.reps >= high));
  const completionVerified = recent.every((s) => s.sets.every((set) => set.completed_at));
  if (upper && !completionVerified) notes.push("Some historical sessions lack a confirmed finish time.");
  if (upper && !bodyweight && shownLoad !== null && options.increment && complete && knownExercise
    && options.technique === "controlled" && completionVerified && options.increment <= shownLoad * 0.10
    && (!(equipment === "machine" || equipment === "cable" || equipment === "smith_machine") || first.gym !== null)) {
    return result("increase", `All working sets reached the top of the range with enough recorded reserve in ${options.required_sessions} comparable sessions.`,
      Array<number>(count).fill(low), round(shownLoad + options.increment));
  }
  const next = latestReps.findIndex((reps) => reps < high);
  if (next >= 0 && latestReps.every((reps) => reps >= low)) {
    return result("reps_first", "Keep the same resistance and aim for one additional rep while maintaining the recorded effort target.",
      latestReps.map((reps, index) => reps + Number(index === next)), shownLoad);
  }
  return result("maintain", bodyweight && upper
    ? "You consistently reached the rep target at bodyweight. Consider a separately tracked harder variation if you want to progress."
    : "Repeat these targets until the comparable sessions, technique, effort, and equipment increment support progression.", latestReps, shownLoad);
}
