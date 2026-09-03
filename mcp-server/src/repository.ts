import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type CheckInInput,
  type ClientProfile,
  type ConnectedAccount,
  type CoachRequest,
  type CoachRequestInput,
  type ProgressCategory,
  type ProgressEntry,
  type ProgressNoteInput,
  type ProgramExercise,
  type ProgramWorkout,
  type TrainingProgram,
  type WorkoutCorrectionInput,
  type WorkoutInput,
  type WorkoutLogEntry,
  type WorkoutUndoResult,
  startDateForWindow,
} from "./domain.js";

export interface CoachingRepository {
  getConnectedAccount(): Promise<ConnectedAccount>;
  getProfile(): Promise<ClientProfile | null>;
  getActiveProgram(): Promise<TrainingProgram | null>;
  listProgress(days: number, category?: ProgressCategory): Promise<ProgressEntry[]>;
  recordCheckIn(input: CheckInInput): Promise<{ id: string; created_at: string }>;
  addProgressNote(input: ProgressNoteInput): Promise<ProgressEntry>;
  recordWorkout(input: WorkoutInput): Promise<WorkoutLogEntry[]>;
  correctWorkout(input: WorkoutCorrectionInput): Promise<WorkoutLogEntry[]>;
  undoLastWorkout(): Promise<WorkoutUndoResult>;
  createCoachRequest(input: CoachRequestInput): Promise<CoachRequest>;
  listOpenCoachRequests(): Promise<CoachRequest[]>;
}

export function maskEmail(email: string): string {
  const separator = email.lastIndexOf("@");
  if (separator <= 0 || separator === email.length - 1) return "Hidden";

  return `${email.slice(0, 1)}***${email.slice(separator)}`;
}

type LiveProgramRow = {
  id: string;
  client_name: string;
  program_title: string;
  program_summary: string;
  fitness_goal: string;
  focus_target: string;
  coach_note_title: string;
  coach_note_body: string;
  workouts: unknown;
  created_at: string;
  updated_at: string;
};

type LiveBodyProgressRow = {
  id: string;
  entry_date: string;
  bodyweight: number | string | null;
  bodyfat: number | string | null;
  goal_note: string;
};

type LiveWorkoutLogRow = {
  id: string;
  workout_session_id?: string | null;
  entry_date: string;
  workout_title: string;
  exercise_code?: string;
  exercise_name: string;
  set_number: number;
  weight_used: number | string | null;
  reps: number | string | null;
  notes: string | null;
  created_at?: string;
};

type LiveProgressNoteRow = {
  id: string;
  occurred_on: string;
  category: ProgressCategory;
  metric_name: string | null;
  numeric_value: number | string | null;
  unit: string | null;
  note: string;
};

type LiveCheckInRow = {
  id: string;
  occurred_on: string;
  energy: number | null;
  sleep_hours: number | string | null;
  stress: number | null;
  soreness: number | null;
  win: string | null;
  challenge: string | null;
  note: string | null;
};

function requireData<T>(data: T | null, error: { message: string } | null): T {
  if (error) {
    throw new Error(`Supabase request failed: ${error.message}`);
  }
  if (data === null) {
    throw new Error("Supabase returned no data for a required write.");
  }
  return data;
}

function numberOrNull(value: number | string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// RLS policies on client_email compare case-insensitively (lower(client_email)),
// but client_email is business-entered data and isn't guaranteed to be stored
// lowercase. Match that convention here so a client whose stored casing differs
// from their login email can still see and write their own rows. `ilike` is used
// instead of `eq` for this, with `%`/`_` escaped so the email is matched literally
// rather than as a wildcard pattern.
function emailFilterValue(email: string): string {
  return email.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function workoutLogEntry(row: LiveWorkoutLogRow): WorkoutLogEntry {
  if (!row.workout_session_id || !row.created_at) {
    throw new Error("The saved workout is missing its session information.");
  }

  return {
    id: row.id,
    workout_session_id: row.workout_session_id,
    entry_date: row.entry_date,
    workout_title: row.workout_title,
    exercise_code: row.exercise_code ?? "",
    exercise_name: row.exercise_name,
    set_number: row.set_number,
    weight_used: numberOrNull(row.weight_used),
    reps: numberOrNull(row.reps),
    notes: row.notes,
    created_at: row.created_at,
  };
}

export function availableWorkoutTitle(baseTitle: string, existingTitles: string[]): string {
  const used = new Set(existingTitles.map((title) => title.toLocaleLowerCase()));
  if (!used.has(baseTitle.toLocaleLowerCase())) return baseTitle;

  for (let suffix = 2; suffix <= 100; suffix += 1) {
    const candidate = `${baseTitle} (${suffix})`;
    if (!used.has(candidate.toLocaleLowerCase())) return candidate;
  }

  throw new Error("Too many workouts with this title are already logged for that date.");
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapProgramExercise(value: unknown): ProgramExercise | null {
  const exercise = objectValue(value);
  const name = stringOrNull(exercise.name);
  if (!name) return null;

  return {
    code: stringOrNull(exercise.code),
    name,
    prescription: stringOrNull(exercise.prescription),
    rest: stringOrNull(exercise.rest),
    muscles: stringOrNull(exercise.muscles ?? exercise.targets),
    video_url: stringOrNull(
      exercise.video ?? exercise.videoUrl ?? exercise.video_url ?? exercise.youtube_url,
    ),
  };
}

function mapProgramWorkouts(value: unknown): ProgramWorkout[] {
  if (!Array.isArray(value)) return [];

  return value.map((candidate, index) => {
    const workout = objectValue(candidate);
    const exercises = Array.isArray(workout.exercises)
      ? workout.exercises
          .map(mapProgramExercise)
          .filter((exercise): exercise is ProgramExercise => exercise !== null)
      : [];

    return {
      title: stringOrNull(workout.title) ?? `Workout ${index + 1}`,
      focus: stringOrNull(workout.focus),
      format: stringOrNull(workout.format),
      exercises,
    };
  });
}

export function mapLiveProgram(row: LiveProgramRow): {
  profile: ClientProfile;
  program: TrainingProgram;
} {
  const coachingNote = [row.coach_note_title, row.coach_note_body].filter(Boolean).join(": ") || null;
  return {
    profile: {
      display_name: row.client_name,
      goals: row.fitness_goal || null,
      coaching_preferences: row.focus_target || null,
      training_experience: coachingNote,
    },
    program: {
      id: row.id,
      title: row.program_title,
      focus: row.focus_target || null,
      status: "active",
      start_date: row.created_at.slice(0, 10),
      end_date: null,
      client_summary: row.program_summary || coachingNote,
      workouts: mapProgramWorkouts(row.workouts),
    },
  };
}

export function mapBodyProgress(rows: LiveBodyProgressRow[]): ProgressEntry[] {
  return rows.flatMap((row) => {
    const entries: ProgressEntry[] = [];
    const bodyweight = numberOrNull(row.bodyweight);
    const bodyfat = numberOrNull(row.bodyfat);
    if (bodyweight !== null) {
      entries.push({
        id: `${row.id}:bodyweight`,
        occurred_on: row.entry_date,
        category: "body_composition",
        metric_name: "bodyweight",
        numeric_value: bodyweight,
        unit: "lb",
        note: row.goal_note || "Bodyweight check-in",
      });
    }
    if (bodyfat !== null) {
      entries.push({
        id: `${row.id}:bodyfat`,
        occurred_on: row.entry_date,
        category: "body_composition",
        metric_name: "bodyfat",
        numeric_value: bodyfat,
        unit: "%",
        note: row.goal_note || "Body-fat check-in",
      });
    }
    if (row.goal_note && bodyweight === null && bodyfat === null) {
      entries.push({
        id: `${row.id}:goal`,
        occurred_on: row.entry_date,
        category: "general",
        metric_name: null,
        numeric_value: null,
        unit: null,
        note: row.goal_note,
      });
    }
    return entries;
  });
}

export function mapWorkoutProgress(rows: LiveWorkoutLogRow[]): ProgressEntry[] {
  return rows.map((row) => {
    const weightUsed = numberOrNull(row.weight_used);
    const detail = [
      row.reps === null ? null : `${row.reps} reps`,
      row.notes,
      `${row.workout_title}, set ${row.set_number}`,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      id: `${row.id}:set`,
      occurred_on: row.entry_date,
      category: "strength",
      metric_name: row.exercise_name,
      numeric_value: weightUsed,
      unit: weightUsed === null ? null : "lb",
      note: detail,
    };
  });
}

export function mapProgressNotes(rows: LiveProgressNoteRow[]): ProgressEntry[] {
  return rows.map((row) => ({
    id: row.id,
    occurred_on: row.occurred_on,
    category: row.category,
    metric_name: row.metric_name,
    numeric_value: numberOrNull(row.numeric_value),
    unit: row.unit,
    note: row.note,
  }));
}

export function mapCheckIns(rows: LiveCheckInRow[]): ProgressEntry[] {
  return rows.map((row) => {
    const ratings = [
      row.energy === null ? null : `energy ${row.energy}/5`,
      row.sleep_hours === null ? null : `sleep ${row.sleep_hours}h`,
      row.stress === null ? null : `stress ${row.stress}/5`,
      row.soreness === null ? null : `soreness ${row.soreness}/5`,
    ].filter(Boolean);
    const reflections = [
      row.win ? `Win: ${row.win}` : null,
      row.challenge ? `Challenge: ${row.challenge}` : null,
      row.note,
    ].filter(Boolean);
    return {
      id: `${row.id}:check-in`,
      occurred_on: row.occurred_on,
      category: "recovery",
      metric_name: "client_check_in",
      numeric_value: row.energy,
      unit: row.energy === null ? null : "1-5",
      note: [...ratings, ...reflections].join(" · ") || "Client check-in",
    };
  });
}

export class SupabaseCoachingRepository implements CoachingRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly clientEmail: string,
  ) {}

  private activeProgramQuery() {
    return this.client
      .from("client_programs")
      .select(
        "id, client_name, program_title, program_summary, fitness_goal, focus_target, coach_note_title, coach_note_body, workouts, created_at, updated_at",
      )
      .ilike("client_email", emailFilterValue(this.clientEmail))
      .eq("active", true)
      .eq("client_archived", false)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  async getConnectedAccount(): Promise<ConnectedAccount> {
    const profile = await this.getProfile();
    return {
      display_name: profile?.display_name ?? null,
      masked_email: maskEmail(this.clientEmail),
    };
  }

  async getProfile(): Promise<ClientProfile | null> {
    const { data, error } = await this.activeProgramQuery();
    if (error) throw new Error(`Could not load coaching profile: ${error.message}`);
    return data ? mapLiveProgram(data as LiveProgramRow).profile : null;
  }

  async getActiveProgram(): Promise<TrainingProgram | null> {
    const { data, error } = await this.activeProgramQuery();
    if (error) throw new Error(`Could not load training program: ${error.message}`);
    return data ? mapLiveProgram(data as LiveProgramRow).program : null;
  }

  async listProgress(days: number, category?: ProgressCategory): Promise<ProgressEntry[]> {
    const startDate = startDateForWindow(days);
    const [bodyResult, workoutResult, noteResult, checkInResult] = await Promise.all([
      this.client
        .from("client_progress")
        .select("id, entry_date, bodyweight, bodyfat, goal_note")
        .ilike("client_email", emailFilterValue(this.clientEmail))
        .gte("entry_date", startDate)
        .order("entry_date", { ascending: false })
        .limit(100),
      this.client
        .from("client_workout_logs")
        .select("id, entry_date, workout_title, exercise_name, set_number, weight_used, reps, notes")
        .ilike("client_email", emailFilterValue(this.clientEmail))
        .gte("entry_date", startDate)
        .order("entry_date", { ascending: false })
        .limit(100),
      this.client
        .from("client_progress_notes")
        .select("id, occurred_on, category, metric_name, numeric_value, unit, note")
        .ilike("client_email", emailFilterValue(this.clientEmail))
        .gte("occurred_on", startDate)
        .order("occurred_on", { ascending: false })
        .limit(100),
      this.client
        .from("client_check_ins")
        .select("id, occurred_on, energy, sleep_hours, stress, soreness, win, challenge, note")
        .ilike("client_email", emailFilterValue(this.clientEmail))
        .gte("occurred_on", startDate)
        .order("occurred_on", { ascending: false })
        .limit(100),
    ]);

    const failed = [bodyResult, workoutResult, noteResult, checkInResult].find((result) => result.error);
    if (failed?.error) throw new Error(`Could not load recent progress: ${failed.error.message}`);

    const entries = [
      ...mapBodyProgress((bodyResult.data ?? []) as LiveBodyProgressRow[]),
      ...mapWorkoutProgress((workoutResult.data ?? []) as LiveWorkoutLogRow[]),
      ...mapProgressNotes((noteResult.data ?? []) as LiveProgressNoteRow[]),
      ...mapCheckIns((checkInResult.data ?? []) as LiveCheckInRow[]),
    ]
      .filter((entry) => !category || entry.category === category)
      .sort((left, right) => right.occurred_on.localeCompare(left.occurred_on))
      .slice(0, 100);

    return entries;
  }

  async recordCheckIn(input: CheckInInput): Promise<{ id: string; created_at: string }> {
    const { data, error } = await this.client
      .from("client_check_ins")
      .insert({
        client_email: this.clientEmail,
        occurred_on: input.occurredOn,
        energy: input.energy,
        sleep_hours: input.sleepHours,
        stress: input.stress,
        soreness: input.soreness,
        win: input.win,
        challenge: input.challenge,
        note: input.note,
        source: "chatgpt_plugin",
      })
      .select("id, created_at")
      .single();
    return requireData(data as { id: string; created_at: string } | null, error);
  }

  async addProgressNote(input: ProgressNoteInput): Promise<ProgressEntry> {
    const { data, error } = await this.client
      .from("client_progress_notes")
      .insert({
        client_email: this.clientEmail,
        occurred_on: input.occurredOn,
        category: input.category,
        metric_name: input.metricName,
        numeric_value: input.numericValue,
        unit: input.unit,
        note: input.note,
        source: "chatgpt_plugin",
      })
      .select("id, occurred_on, category, metric_name, numeric_value, unit, note")
      .single();
    const row = requireData(data as LiveProgressNoteRow | null, error);
    return { ...row, numeric_value: numberOrNull(row.numeric_value) };
  }

  async recordWorkout(input: WorkoutInput): Promise<WorkoutLogEntry[]> {
    const existingResult = await this.client
      .from("client_workout_logs")
      .select("workout_title")
      .ilike("client_email", emailFilterValue(this.clientEmail))
      .eq("entry_date", input.occurredOn)
      .limit(200);
    if (existingResult.error) {
      throw new Error(`Could not prepare the workout log: ${existingResult.error.message}`);
    }

    const workoutTitle = availableWorkoutTitle(
      input.workoutTitle,
      (existingResult.data ?? []).map((row) => String(row.workout_title ?? "")),
    );
    const workoutSessionId = crypto.randomUUID();
    const rows = input.sets.map((set) => ({
      client_email: this.clientEmail,
      workout_session_id: workoutSessionId,
      entry_date: input.occurredOn,
      workout_title: workoutTitle,
      exercise_code: set.exerciseCode,
      exercise_name: set.exerciseName,
      set_number: set.setNumber,
      weight_used: set.weightUsed,
      reps: set.reps,
      notes: set.notes,
      source: "mcp",
    }));
    const { data, error } = await this.client
      .from("client_workout_logs")
      .insert(rows)
      .select(
        "id, workout_session_id, entry_date, workout_title, exercise_code, exercise_name, set_number, weight_used, reps, notes, created_at",
      );
    if (error) throw new Error(`Could not save the workout: ${error.message}`);
    if (data?.length !== rows.length) {
      throw new Error("The workout was not saved completely.");
    }
    return (data as LiveWorkoutLogRow[]).map(workoutLogEntry);
  }

  async correctWorkout(input: WorkoutCorrectionInput): Promise<WorkoutLogEntry[]> {
    let lookup = this.client
      .from("client_workout_logs")
      .select(
        "id, workout_session_id, entry_date, workout_title, exercise_code, exercise_name, set_number, weight_used, reps, notes, created_at",
      )
      .ilike("client_email", emailFilterValue(this.clientEmail))
      .eq("source", "mcp")
      .not("workout_session_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (input.occurredOn) lookup = lookup.eq("entry_date", input.occurredOn);

    const { data: candidateData, error: candidateError } = await lookup;
    if (candidateError) {
      throw new Error(`Could not find the workout to correct: ${candidateError.message}`);
    }

    const normalizedName = input.exerciseName.toLocaleLowerCase();
    const normalizedTitle = input.workoutTitle?.toLocaleLowerCase();
    const candidate = ((candidateData ?? []) as LiveWorkoutLogRow[]).find(
      (row) =>
        row.exercise_name.toLocaleLowerCase() === normalizedName &&
        (!normalizedTitle || row.workout_title.toLocaleLowerCase() === normalizedTitle) &&
        (input.setNumber === undefined || row.set_number === input.setNumber),
    );
    if (!candidate?.workout_session_id) {
      throw new Error("No matching MCP-recorded workout set was found to correct.");
    }

    const changes: Record<string, number | string | null> = {};
    if (input.weightUsed !== undefined) changes.weight_used = input.weightUsed;
    if (input.reps !== undefined) changes.reps = input.reps;
    if (input.notes !== undefined) changes.notes = input.notes;

    let update = this.client
      .from("client_workout_logs")
      .update(changes)
      .ilike("client_email", emailFilterValue(this.clientEmail))
      .eq("workout_session_id", candidate.workout_session_id)
      .eq("exercise_name", candidate.exercise_name);
    if (input.setNumber !== undefined) update = update.eq("set_number", input.setNumber);

    const { data, error } = await update.select(
      "id, workout_session_id, entry_date, workout_title, exercise_code, exercise_name, set_number, weight_used, reps, notes, created_at",
    );
    if (error) throw new Error(`Could not correct the workout: ${error.message}`);
    if (!data?.length) throw new Error("No workout sets were changed.");
    return (data as LiveWorkoutLogRow[]).map(workoutLogEntry);
  }

  async undoLastWorkout(): Promise<WorkoutUndoResult> {
    const { data: latest, error: latestError } = await this.client
      .from("client_workout_logs")
      .select("workout_session_id, entry_date, workout_title")
      .ilike("client_email", emailFilterValue(this.clientEmail))
      .eq("source", "mcp")
      .not("workout_session_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw new Error(`Could not find the last workout: ${latestError.message}`);
    if (!latest?.workout_session_id) {
      throw new Error("There is no MCP-recorded workout available to undo.");
    }

    const { data, error } = await this.client
      .from("client_workout_logs")
      .delete()
      .ilike("client_email", emailFilterValue(this.clientEmail))
      .eq("workout_session_id", latest.workout_session_id)
      .select("id");
    if (error) throw new Error(`Could not undo the last workout: ${error.message}`);
    if (!data?.length) throw new Error("No workout sets were removed.");

    return {
      workout_session_id: latest.workout_session_id,
      entry_date: latest.entry_date,
      workout_title: latest.workout_title,
      deleted_sets: data.length,
    };
  }

  async createCoachRequest(input: CoachRequestInput): Promise<CoachRequest> {
    const { data, error } = await this.client
      .from("coach_requests")
      .insert({
        client_email: this.clientEmail,
        request_type: input.requestType,
        urgency: input.urgency,
        message: input.message,
        source: "chatgpt_plugin",
      })
      .select("id, request_type, urgency, message, status, created_at")
      .single();
    return requireData(data as CoachRequest | null, error);
  }

  async listOpenCoachRequests(): Promise<CoachRequest[]> {
    const { data, error } = await this.client
      .from("coach_requests")
      .select("id, request_type, urgency, message, status, created_at")
      .ilike("client_email", emailFilterValue(this.clientEmail))
      .in("status", ["open", "in_review"])
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(`Could not load coach requests: ${error.message}`);
    return (data ?? []) as CoachRequest[];
  }
}
