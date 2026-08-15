export const PROGRESS_CATEGORIES = [
  "strength",
  "mobility",
  "conditioning",
  "body_composition",
  "habit",
  "recovery",
  "general",
] as const;

export type ProgressCategory = (typeof PROGRESS_CATEGORIES)[number];

export const COACH_REQUEST_TYPES = [
  "program_review",
  "scheduling",
  "pain_or_injury",
  "motivation",
  "nutrition",
  "other",
] as const;

export type CoachRequestType = (typeof COACH_REQUEST_TYPES)[number];
export type RequestUrgency = "routine" | "soon" | "urgent";

export type ClientProfile = {
  display_name: string | null;
  goals: string | null;
  coaching_preferences: string | null;
  training_experience: string | null;
};

export type ConnectedAccount = {
  display_name: string | null;
  masked_email: string;
};

export type ProgramExercise = {
  code: string | null;
  name: string;
  prescription: string | null;
  rest: string | null;
  muscles: string | null;
  video_url: string | null;
};

export type ProgramWorkout = {
  title: string;
  focus: string | null;
  format: string | null;
  exercises: ProgramExercise[];
};

export type TrainingProgram = {
  id: string;
  title: string;
  focus: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  client_summary: string | null;
  workouts: ProgramWorkout[];
};

export type ProgressEntry = {
  id: string;
  occurred_on: string;
  category: ProgressCategory;
  metric_name: string | null;
  numeric_value: number | null;
  unit: string | null;
  note: string;
};

export type CheckInInput = {
  occurredOn: string;
  energy: number | null;
  sleepHours: number | null;
  stress: number | null;
  soreness: number | null;
  win: string | null;
  challenge: string | null;
  note: string | null;
};

export type ProgressNoteInput = {
  occurredOn: string;
  category: ProgressCategory;
  metricName: string | null;
  numericValue: number | null;
  unit: string | null;
  note: string;
};

export type CoachRequestInput = {
  requestType: CoachRequestType;
  urgency: RequestUrgency;
  message: string;
};

export type CoachRequest = {
  id: string;
  request_type: CoachRequestType;
  urgency: RequestUrgency;
  message: string;
  status: string;
  created_at: string;
};

export type WorkoutSetInput = {
  exerciseCode: string;
  exerciseName: string;
  setNumber: number;
  weightUsed: number | null;
  reps: number | null;
  notes: string | null;
};

export type WorkoutInput = {
  occurredOn: string;
  workoutTitle: string;
  sets: WorkoutSetInput[];
};

export type WorkoutLogEntry = {
  id: string;
  workout_session_id: string;
  entry_date: string;
  workout_title: string;
  exercise_code: string;
  exercise_name: string;
  set_number: number;
  weight_used: number | null;
  reps: number | null;
  notes: string | null;
  created_at: string;
};

export type WorkoutCorrectionInput = {
  occurredOn?: string;
  workoutTitle?: string;
  exerciseName: string;
  setNumber?: number;
  weightUsed?: number | null;
  reps?: number | null;
  notes?: string | null;
};

export type WorkoutUndoResult = {
  workout_session_id: string;
  entry_date: string;
  workout_title: string;
  deleted_sets: number;
};

export function isoDateOrToday(value?: string): string {
  return value ?? new Date().toISOString().slice(0, 10);
}

export function startDateForWindow(days: number, now = new Date()): string {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return start.toISOString().slice(0, 10);
}

export function summarizeProgress(entries: ProgressEntry[]) {
  const byCategory = Object.fromEntries(PROGRESS_CATEGORIES.map((category) => [category, 0])) as Record<
    ProgressCategory,
    number
  >;
  for (const entry of entries) {
    byCategory[entry.category] += 1;
  }

  return {
    entry_count: entries.length,
    by_category: byCategory,
    newest_entry_on: entries[0]?.occurred_on ?? null,
    oldest_entry_on: entries.at(-1)?.occurred_on ?? null,
  };
}
