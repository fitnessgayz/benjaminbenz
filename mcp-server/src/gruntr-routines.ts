import { createHash } from "node:crypto";
import type { Exercise } from "./gruntr-workouts.js";
import { resolveExercise, WorkoutRequestError } from "./gruntr-workouts.js";

type RoutineInput = {
  title: string;
  split: "upper_lower" | "full_body" | "balanced";
  minutes: number;
  goal: "strength" | "muscle" | "fitness";
  workouts: { title: string; weekday: number; exercises: {
    exercise_id: string; sets: number; rep_min: number; rep_max: number; rest_seconds: number;
  }[] }[];
};

function launchId(requestId: string, weekday: number) {
  const digest = createHash("sha256").update(`gruntr-routine:${requestId}:${weekday}`).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export function buildRoutine(input: RoutineInput, requestId: string, catalog: Exercise[]) {
  const ordered = [...input.workouts].sort((a, b) => a.weekday - b.weekday);
  if (new Set(ordered.map((item) => item.weekday)).size !== ordered.length) {
    throw new WorkoutRequestError("Choose a different weekday for each workout.");
  }
  const workouts = ordered.map((day, index) => ({
    day: index + 1, weekday: day.weekday, title: day.title, estimatedMinutes: input.minutes, format: "single",
    exercises: day.exercises.map((item, exerciseIndex) => {
      const exercise = resolveExercise(catalog, item)!;
      if (item.rep_min > item.rep_max) throw new WorkoutRequestError("The rep minimum cannot exceed the maximum.");
      const reps = item.rep_min === item.rep_max ? String(item.rep_min) : `${item.rep_min}-${item.rep_max}`;
      return {
        id: exercise.id, exercise_id: exercise.id, name: exercise.name, equipment: exercise.equipment,
        code: String.fromCharCode(65 + exerciseIndex), sets: item.sets, reps,
        prescription: `${reps} reps x ${item.sets} sets`, rest: `${item.rest_seconds} sec`, restSeconds: item.rest_seconds,
      };
    }),
  }));
  const equipment = [...new Set(workouts.flatMap(({ exercises }) => exercises.map((item) => item.equipment)))].sort();
  return {
    version: 1, source: "gruntr_chatgpt", title: input.title, customTitle: input.title, days: ordered.length, split: input.split,
    minutes: input.minutes, format: "single", workouts, equipment,
    answers: {
      daysPerWeek: ordered.length, goal: input.goal, focus: "balanced", experience: "regular",
      minutes: input.minutes, equipment: equipment.includes("other") ? ["full_gym"] : equipment,
      formatRaw: "single", trainingStyleRaw: "strength",
    },
    sessions: workouts.map((day) => ({
      weekday: day.weekday,
      launch: { id: launchId(requestId, day.weekday), title: day.title, estimatedMinutes: input.minutes,
        formatRaw: "single", exercises: day.exercises.map(({ code, name, prescription, rest }) => ({
          code, name, prescription, rest, instructions: [], video: "",
        })),
      },
    })),
  };
}
