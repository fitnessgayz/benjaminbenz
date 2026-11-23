import { describe, expect, it } from "vitest";

import { recommendProgression, summarizePerformance, type ProgressionOptions } from "../src/gruntr-progression.js";
import { poundsPerKilogram, resolveExercise, setFields, type Exercise, type HistorySet } from "../src/gruntr-workouts.js";

const options: ProgressionOptions = {
  rep_min: 8, rep_max: 12, planned_sets: 2, target_rir: 2, required_sessions: 2,
  unit: "lb", increment: 5, technique: "controlled",
};
const through = "2026-11-20";
const exercise: Exercise = {
  id: "bench", name: "Barbell Bench Press", aliases: ["Bench Press", "Flat Bench"], equipment: "barbell",
  default_reps: "8-12", default_sets: 2, default_rest_seconds: 120,
};
const session = (date: string, weight: number | null, reps = 12, extra: Partial<HistorySet> = {}): HistorySet[] =>
  [1, 2].map((set_number) => ({
    id: `${date}:${set_number}`, session_id: date, set_id: null, date, title: "Upper A",
    exercise: exercise.name, exercise_id: exercise.id, exercise_order: 0, set_number,
    set_type: "working", reps, weight_lb: weight, recorded_unit: "lb", bodyweight: false,
    rpe: null, rir: 2, notes: null, gym: null, completed_at: `${date}T20:00:00Z`, ...extra,
  }));

describe("GRUNTR exercise and effort normalization", () => {
  it("distinguishes exercise variants and declines ambiguous aliases", () => {
    const dumbbell = { ...exercise, id: "dumbbell", name: "Dumbbell Bench Press", equipment: "dumbbell" };
    expect(resolveExercise([exercise, dumbbell], { exercise_name: " BARBELL  BENCH-PRESS " })).toBe(exercise);
    expect(() => resolveExercise([exercise, dumbbell], { exercise_name: "bench press" })).toThrow(/Choose the exercise/);
    expect(resolveExercise([exercise, dumbbell], { exercise_id: "dumbbell" })).toBe(dumbbell);
    expect(resolveExercise([exercise, dumbbell], { exercise_name: "incline bench press" })).toBeNull();
  });

  it("stores canonical pounds and respects explicitly omitted or cleared fields", () => {
    expect(setFields({ reps: 9, weight: { value: 60, unit: "kg" }, rpe: 8 })).toMatchObject({
      reps: 9, weight_lb: 132.277357, unit: "kg", effort_scale: "rpe", effort_value: 8,
    });
    expect(setFields({ notes: null }, true)).toEqual({ notes: null });
    expect(setFields({ bodyweight: true }, true)).toMatchObject({ bodyweight: true, weight_lb: null, unit: null });
    expect(() => setFields({ rpe: 9, rir: 3 })).toThrow(/one effort scale/);
    expect(() => setFields({ bodyweight: true, weight: { value: 1, unit: "lb" } })).toThrow(/Choose bodyweight/);
  });
});

describe("GRUNTR progression", () => {
  const successful = [
    ...session("2026-11-18", 135),
    ...session("2026-11-14", 135, 12, { rir: null, rpe: 8 }),
  ];
  const recommend = (rows: HistorySet[], config = options, checkIn: Parameters<typeof recommendProgression>[3] = null) =>
    recommendProgression(rows, config, through, checkIn, true, true);

  it("requires repeated comparable sets, effort, confirmed technique, and a sensible increment", () => {
    expect(recommend(successful)).toMatchObject({ action: "increase", target_load: 140, target_reps_by_set: [8, 8] });
    expect(recommend(successful.slice(0, 2)).action).toBe("maintain");
    expect(recommend(successful, { ...options, technique: undefined }).action).toBe("maintain");
    expect(recommend(successful, { ...options, increment: 20 }).action).toBe("maintain");
    expect(recommend(successful, { ...options, required_sessions: 3 }).action).toBe("maintain");
  });

  it("combines explicit kilograms and pounds with small conversion tolerance", () => {
    const rows = [...session("2026-11-18", 60 * poundsPerKilogram, 12, { recorded_unit: "kg" }),
      ...session("2026-11-14", 132.28)];
    expect(recommend(rows, { ...options, unit: "kg", increment: 2.5 })).toMatchObject({
      action: "increase", target_load: 62.5, unit: "kg",
    });
  });

  it("preserves sparse evidence and avoids mixing bodyweight with external load", () => {
    expect(recommend([]).action).toBe("baseline");
    const missingEffort = session("2026-11-18", 135, 10, { rir: null });
    expect(recommend(missingEffort)).toMatchObject({ action: "maintain", evidence: [{ sets: [{ rir: null }, { rir: null }] }] });
    const bodyweight = session("2026-11-18", null, 10, { bodyweight: true });
    expect(recommend(bodyweight)).toMatchObject({ action: "reps_first", target_load: null, target_reps_by_set: [11, 10] });
    expect(recommend([...bodyweight, ...successful]).action).not.toBe("increase");
    expect(summarizePerformance(bodyweight, "2026-11-14", through)).toMatchObject({
      estimated_1rm_lb: null, recorded_external_volume_lb_reps: null, working_sessions: 1,
    });
  });

  it("distinguishes deload and rest from a one-session dip", () => {
    const checks = { occurred_on: "2026-11-20", energy: 2, soreness: 4, sleep_hours: null };
    const below = [...session("2026-11-18", 135, 6), ...session("2026-11-14", 135, 7)];
    expect(recommend(below, options, checks)).toMatchObject({ action: "deload", target_load: 130, target_reps_by_set: [8] });
    expect(recommend(below.slice(0, 2), options, checks).action).toBe("maintain");
    expect(recommend(below, options, { ...checks, soreness: 5 }).action).toBe("rest");
  });
});
