import type { SupabaseClient } from "@supabase/supabase-js";

export class WorkoutRequestError extends Error {}

export type Exercise = {
  id: string;
  name: string;
  aliases: string[];
  equipment: string;
  default_reps: string;
  default_sets: number;
  default_rest_seconds: number;
};

export type SetInput = {
  reps: number;
  weight?: { value: number; unit: "lb" | "kg" } | null;
  bodyweight?: boolean;
  notes?: string | null;
  rpe?: number | null;
  rir?: number | null;
};

export type HistorySet = {
  id: string;
  session_id: string;
  set_id: string | null;
  date: string;
  title: string;
  exercise: string;
  exercise_id: string | null;
  exercise_order: number | null;
  set_number: number;
  set_type: string | null;
  reps: number;
  weight_lb: number | null;
  recorded_unit: "lb" | "kg" | null;
  bodyweight: boolean;
  rpe: number | null;
  rir: number | null;
  notes: string | null;
  gym: string | null;
  completed_at: string | null;
};

type HistoryRow = {
  id: string;
  session_id: string | null;
  workout_session_id: string | null;
  set_id: string | null;
  entry_date: string;
  workout_title: string;
  exercise_name: string;
  exercise_order: number | null;
  set_number: number;
  set_type: string | null;
  reps: number | string;
  weight_used: number | string | null;
  gruntr_exercise_id: string | null;
  gruntr_load_unit: "lb" | "kg" | null;
  gruntr_bodyweight: boolean | null;
  effort_scale: string | null;
  effort_value: number | string | null;
  notes: string | null;
  gym_name: string | null;
  completed_at: string | null;
};

const historyColumns = "id,session_id,workout_session_id,set_id,entry_date,workout_title,exercise_name,exercise_order,set_number,set_type,reps,weight_used,gruntr_exercise_id,gruntr_load_unit,gruntr_bodyweight,effort_scale,effort_value,notes,gym_name,completed_at";
const exactName = (name: string) => name.normalize("NFKC").trim().toLowerCase().replace(/[\s_-]+/g, " ");
export const poundsPerKilogram = 2.20462262185;
const rounded = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

export function resolveExercise(catalog: Exercise[], selector: { exercise_id?: string; exercise_name?: string }) {
  if (selector.exercise_id) {
    const result = catalog.find(({ id }) => id === selector.exercise_id);
    if (!result) throw new WorkoutRequestError("That exercise is unavailable in the GRUNTR library.");
    return result;
  }
  const name = exactName(selector.exercise_name ?? "");
  const exact = catalog.find((exercise) => exactName(exercise.name) === name);
  if (exact) return exact;
  const matches = catalog.filter((exercise) => exercise.aliases.some((alias) => exactName(alias) === name));
  if (matches.length > 1) {
    throw new WorkoutRequestError(`Choose the exercise and equipment: ${matches.map((exercise) => exercise.name).join(", ")}.`);
  }
  return matches[0] ?? null;
}

export function setFields(input: Partial<SetInput>, editing = false) {
  if (input.rpe != null && input.rir != null) {
    throw new WorkoutRequestError("Provide one effort scale, either RPE or RIR.");
  }
  if (input.bodyweight && input.weight) {
    throw new WorkoutRequestError("Choose bodyweight or an external load.");
  }
  const fields: Record<string, unknown> = {};
  if (input.reps !== undefined) fields.reps = input.reps;
  if (input.notes !== undefined) fields.notes = input.notes;
  if (input.bodyweight !== undefined) fields.bodyweight = input.bodyweight;
  if (input.weight !== undefined || input.bodyweight === true || !editing) {
    fields.weight_lb = input.weight ? rounded(input.weight.value * (input.weight.unit === "kg" ? poundsPerKilogram : 1)) : null;
    fields.unit = input.weight?.unit ?? null;
    if (input.weight) fields.bodyweight = false;
  }
  if (input.rpe !== undefined || input.rir !== undefined) {
    fields.effort_scale = input.rpe != null ? "rpe" : input.rir != null ? "rir" : null;
    fields.effort_value = input.rpe ?? input.rir ?? null;
  }
  return fields;
}

function historySet(row: HistoryRow): HistorySet {
  const stored = row.weight_used === null ? null : Number(row.weight_used);
  // A zero sentinel lets existing iOS history decoders open unweighted sets.
  const weight = stored === 0 && row.gruntr_bodyweight !== null && row.gruntr_load_unit === null ? null : stored;
  const effort = row.effort_value === null ? null : Number(row.effort_value);
  return {
    id: row.id,
    session_id: row.session_id ?? row.workout_session_id ?? `legacy:${row.entry_date}:${row.workout_title}`,
    set_id: row.set_id,
    date: row.entry_date,
    title: row.workout_title,
    exercise: row.exercise_name,
    exercise_id: row.gruntr_exercise_id,
    exercise_order: row.exercise_order,
    set_number: row.set_number,
    set_type: row.set_type,
    reps: Number(row.reps),
    weight_lb: weight,
    recorded_unit: weight !== null ? row.gruntr_load_unit : null,
    bodyweight: weight === null && (row.gruntr_bodyweight === true || /(?:^| · )Bodyweight(?: · |$)/i.test(row.notes ?? "")),
    rpe: row.effort_scale === "rpe" && effort !== null && effort >= 1 && effort <= 10 ? effort : null,
    rir: row.effort_scale === "rir" && effort !== null && effort >= 0 && effort <= 10 ? effort : null,
    notes: row.notes,
    gym: row.gym_name,
    completed_at: row.completed_at,
  };
}

function checkError(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "22023" || error.code === "42501" || error.message === "workout_session_deleted") {
    // Only send messages raised explicitly by this migration to the caller.
    throw new WorkoutRequestError(error.code === "22023" ? error.message
      : error.message === "workout_session_deleted" ? "That workout was deleted on another device."
      : "GRUNTR could not authorize that action.");
  }
  throw new Error("GRUNTR could not complete the database request.");
}

export class GruntrWorkouts {
  constructor(
    private readonly client: SupabaseClient,
    private readonly email: string,
    private readonly ownerId: string,
  ) {}

  async catalog(): Promise<Exercise[]> {
    const items: Exercise[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await this.client.from("exercise_library")
        .select("id,name,aliases,equipment,default_reps,default_sets,default_rest_seconds")
        .eq("is_active", true).eq("is_approved", true).order("id").range(offset, offset + 499);
      checkError(error);
      const page = (data ?? []) as Exercise[];
      items.push(...page);
      if (page.length < 500) return items;
    }
  }

  async active() {
    const { data, error } = await this.client.from("client_workout_drafts")
      .select("session_id,entry_date,workout_title,snapshot,updated_at")
      .eq("client_email", this.email).eq("source", "gruntr_chatgpt").maybeSingle();
    checkError(error);
    return data ? {
      session_id: data.session_id, occurred_on: data.entry_date, workout_title: data.workout_title,
      sets: data.snapshot?.sets ?? [], gym: data.snapshot?.gym_name ?? null, updated_at: data.updated_at,
    } : null;
  }

  async write(action: "start" | "append" | "edit" | "finish" | "complete" | "cancel",
    requestId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const { data, error } = await this.client.rpc("write_gruntr_workout", {
      p_request_id: requestId, p_action: action, p_input: input,
    });
    checkError(error);
    if (!data?.state) throw new Error("GRUNTR did not confirm the saved workout.");
    return data;
  }

  async history(from: string, through: string, selector?: { exercise_id?: string; exercise_name?: string }) {
    const catalog = selector ? await this.catalog() : [];
    const exercise = selector ? resolveExercise(catalog, selector) : null;
    const name = exercise?.name ?? selector?.exercise_name ?? "";
    const canonicalName = exactName(name);
    // Restrict legacy aliases to names that resolve unambiguously back to this
    // equipment variant. Explicit exercise IDs always override the legacy name.
    const scope = new Set([canonicalName]);
    if (exercise) {
      for (const alias of exercise.aliases) {
        try {
          if (resolveExercise(catalog, { exercise_name: alias })?.id === exercise.id) scope.add(exactName(alias));
        } catch (error) {
          if (!(error instanceof WorkoutRequestError)) throw error;
        }
      }
    }
    const rows: HistorySet[] = [];
    const pageSize = 500;
    const maxPages = 10;
    let complete = false;
    for (let page = 0; page < maxPages; page += 1) {
      const { data, error } = await this.client.from("client_workout_logs")
        .select(historyColumns).eq("client_email", this.email).gte("entry_date", from).lte("entry_date", through)
        .gt("reps", 0)
        .or("completed_at.not.is.null,source.in.(mcp,website,legacy,csv_import,import,fitbod,hevy,client_log_correction)")
        .order("entry_date", { ascending: false }).order("id").range(page * pageSize, (page + 1) * pageSize - 1);
      checkError(error);
      const batch = (data ?? []) as HistoryRow[];
      rows.push(...batch.filter((row) => !selector ||
        (row.gruntr_exercise_id ? row.gruntr_exercise_id === exercise?.id : scope.has(exactName(row.exercise_name))))
        .map(historySet));
      if (batch.length < pageSize) {
        complete = true;
        break;
      }
    }
    rows.sort((a, b) => b.date.localeCompare(a.date)
      || (b.completed_at ?? "").localeCompare(a.completed_at ?? "")
      || a.session_id.localeCompare(b.session_id)
      || (a.exercise_order ?? 0) - (b.exercise_order ?? 0) || a.set_number - b.set_number);
    return { exercise: exercise ? { id: exercise.id, name: exercise.name, equipment: exercise.equipment,
      default_reps: exercise.default_reps, default_sets: exercise.default_sets } : null, from, through, rows, complete };
  }

  async latestRecovery(from: string, through: string) {
    const [checkIn, feedback] = await Promise.all([
      this.client.from("client_check_ins")
        .select("occurred_on,energy,soreness,sleep_hours").eq("client_email", this.email)
        .gte("occurred_on", from).lte("occurred_on", through)
        .order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      this.client.from("workout_session_feedback")
        .select("entry_date,energy_before").eq("client_email", this.email)
        .gte("entry_date", from).lte("entry_date", through).not("energy_before", "is", null)
        .order("entry_date", { ascending: false }).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    checkError(checkIn.error);
    checkError(feedback.error);
    const item = checkIn.data;
    const workout = feedback.data;
    const workoutEnergy = workout && (!item || workout.entry_date > item.occurred_on);
    if (workoutEnergy) {
      return { occurred_on: workout.entry_date, energy: workout.energy_before, soreness: null,
        sleep_hours: null, source: "workout_feedback" as const };
    }
    return item ? { occurred_on: item.occurred_on, energy: item.energy, soreness: item.soreness,
      sleep_hours: item.sleep_hours === null ? null : Number(item.sleep_hours), source: "check_in" as const } : null;
  }

  async savedRoutines() {
    const { data, error } = await this.client.from("client_saved_workout_plans")
      .select("id,title,plan,updated_at").eq("user_id", this.ownerId).eq("is_deleted", false)
      .order("updated_at", { ascending: false }).limit(30);
    checkError(error);
    return (data ?? []).filter((row) => Array.isArray(row.plan?.workouts) && row.plan?.source !== "fitness-plan")
      .map(({ id, title, plan, updated_at }) => ({ id, title, workouts: plan.workouts, updated_at }));
  }

  async proposeRoutine(requestId: string, plan: object, planId?: string) {
    const { data, error } = await this.client.rpc("propose_gruntr_routine", {
      p_request_id: requestId, p_plan: plan, p_plan_id: planId ?? null,
    });
    checkError(error);
    if (!data?.state) throw new Error("GRUNTR did not confirm the routine preview.");
    return data;
  }

  async routineProposal(proposalId: string) {
    const { data, error } = await this.client.rpc("get_gruntr_routine_proposal", { p_proposal_id: proposalId });
    checkError(error);
    return data;
  }
}
