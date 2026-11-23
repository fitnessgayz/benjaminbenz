import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import { recommendProgression, summarizePerformance } from "./gruntr-progression.js";
import { buildRoutine } from "./gruntr-routines.js";
import { type GruntrWorkouts, resolveExercise, setFields, WorkoutRequestError } from "./gruntr-workouts.js";
import type { CoachingRepository } from "./repository.js";

const text = (maximum: number) => z.string().trim().min(1).max(maximum);
export const requestId = z.uuid().describe("Generate a UUID for this intended write. Reuse the same UUID and inputs when retrying.");
const selector = {
  exercise_id: z.uuid().optional().describe("GRUNTR exercise ID when known."),
  exercise_name: text(120).optional().describe("Specific exercise name, including equipment if known."),
};
const reps = z.number().int().min(1).max(1000);
const strengthReps = z.number().int().min(1).max(50);
export const setDetails = {
  reps,
  weight: z.object({ value: z.number().min(0).max(5000), unit: z.enum(["lb", "kg"]) }).nullish(),
  bodyweight: z.boolean().optional(),
  notes: text(500).nullish(),
  rpe: z.number().min(1).max(10).nullish(),
  rir: z.number().min(0).max(10).nullish(),
};
const historyWindow = {
  days: z.number().int().min(1).max(180).default(56),
  through: z.iso.date().optional().describe("The last local date to include, if supplied by the user."),
};

const annotations = (readOnlyHint: boolean, destructiveHint = false) => ({
  readOnlyHint, destructiveHint, openWorldHint: false, idempotentHint: true,
});

export function toolResult(message: string, data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: message }], structuredContent: data };
}

export async function reportWorkout(action: () => Promise<ReturnType<typeof toolResult>>) {
  try {
    return await action();
  } catch (error) {
    return { isError: true, content: [{ type: "text" as const, text: error instanceof WorkoutRequestError
      ? error.message : "GRUNTR could not complete the request. Retry with the same request ID if this was a write." }] };
  }
}

function windowDates(days: number, through = new Date().toISOString().slice(0, 10)) {
  if (through < "1900-07-01" || new Date(through).getTime() > Date.now() + 86_400_000) {
    throw new WorkoutRequestError("Choose a valid historical date range.");
  }
  const from = new Date(through);
  from.setUTCDate(from.getUTCDate() - days + 1);
  return { from: from.toISOString().slice(0, 10), through };
}

export function registerGruntrTools(server: McpServer, workouts: GruntrWorkouts,
  repository: Pick<CoachingRepository, "getActiveProgram">) {
  server.registerTool("get_my_active_program", {
    description: "Read the signed-in user's active coach-assigned program and workout prescriptions.",
    annotations: annotations(true),
  }, () => reportWorkout(async () => toolResult("Loaded the current program.", { program: await repository.getActiveProgram() })));

  server.registerTool("get_my_active_workout", {
    description: "Read the current ChatGPT workout and its logged sets, including stable set and session IDs.",
    annotations: annotations(true),
  }, () => reportWorkout(async () => {
    const workout = await workouts.active();
    return toolResult(workout ? "Loaded your active ChatGPT workout." : "You have no active ChatGPT workout.", { workout });
  }));

  server.registerTool("start_my_workout", {
    description: "Start a live ChatGPT workout when the user asks to start. Look up the active program or saved routine for named workouts. Ask for the local workout date or title if unclear. A start saves a draft without crediting any sets.",
    inputSchema: { request_id: requestId, occurred_on: z.iso.date(), workout_title: text(120), gym_name: text(120).optional() },
    annotations: annotations(false),
  }, ({ request_id, ...input }) => reportWorkout(async () => {
    const saved = await workouts.write("start", request_id, input);
    return toolResult(saved.replayed ? "GRUNTR previously confirmed this draft." : "GRUNTR saved the workout draft.", saved);
  }));

  server.registerTool("log_my_set", {
    description: "Save one performed set in the specified active workout. Call only for a set the user says they performed and wants logged. Ask for load units if unclear. Prefer an exact exercise ID or an equipment-specific name and resolve ambiguous matches with the user.",
    inputSchema: { request_id: requestId, session_id: z.uuid(), ...selector, ...setDetails },
    annotations: annotations(false),
  }, ({ request_id, session_id, exercise_id, exercise_name, ...input }) => reportWorkout(async () => {
    if (!exercise_id && !exercise_name) throw new WorkoutRequestError("Provide an exercise name or exercise ID.");
    const exercise = resolveExercise(await workouts.catalog(), { exercise_id, exercise_name });
    const set = { ...setFields(input), exercise_id: exercise?.id ?? null, exercise_name: exercise?.name ?? exercise_name };
    const saved = await workouts.write("append", request_id, { session_id, set });
    return toolResult(saved.replayed ? "GRUNTR already saved this set request." : "GRUNTR saved this set to the active workout.", saved);
  }));

  server.registerTool("edit_my_set", {
    description: "Correct a set within the active ChatGPT workout after the user clearly confirms the set and correction. Omitted fields are kept. Use null to clear notes, load or effort.",
    inputSchema: { request_id: requestId, session_id: z.uuid(), set_id: z.uuid(), ...setDetails, reps: reps.optional() },
    annotations: annotations(false, true),
  }, ({ request_id, session_id, set_id, ...input }) => reportWorkout(async () => {
    const set = setFields(input, true);
    if (!Object.keys(set).length) throw new WorkoutRequestError("Provide at least one set correction.");
    const saved = await workouts.write("edit", request_id, { session_id, set_id, set });
    return toolResult(saved.replayed ? "GRUNTR already saved this correction." : "GRUNTR saved this correction.", saved);
  }));

  server.registerTool("finish_my_workout", {
    description: "Finish the specified ChatGPT workout when the user asks to finish. Move performed sets into shared GRUNTR history. Fetch the active workout before finalizing if uncertain.",
    inputSchema: { request_id: requestId, session_id: z.uuid() },
    annotations: annotations(false),
  }, ({ request_id, ...input }) => reportWorkout(async () => {
    const saved = await workouts.write("finish", request_id, input);
    return toolResult(saved.replayed ? "GRUNTR previously confirmed this workout." : "GRUNTR confirmed the completed workout in shared history.", saved);
  }));

  server.registerTool("cancel_my_empty_workout", {
    description: "Cancel an empty ChatGPT workout draft after the user asks. Drafts containing performed sets cannot be canceled with this tool.",
    inputSchema: { request_id: requestId, session_id: z.uuid() },
    annotations: annotations(false),
  }, ({ request_id, ...input }) => reportWorkout(async () =>
    toolResult("GRUNTR canceled the empty draft.", await workouts.write("cancel", request_id, input))));

  server.registerTool("get_my_exercise_history", {
    description: "Read the user's completed sets and trends for a specific exercise. Omit both exercise fields to see recent workouts for routine planning. Distinguish actual sets from targets and preserve exercise variants.",
    inputSchema: { ...selector, ...historyWindow, limit: z.number().int().min(1).max(200).default(80) },
    annotations: annotations(true),
  }, ({ exercise_id, exercise_name, days, through, limit }) => reportWorkout(async () => {
    const dates = windowDates(days, through);
    const filter = exercise_id || exercise_name ? { exercise_id, exercise_name } : undefined;
    const history = await workouts.history(dates.from, dates.through, filter);
    return toolResult("Loaded your completed performance history.", {
      exercise: history.exercise, ...dates, completed_sets: history.rows.slice(0, limit),
      matching_set_count: history.rows.length, scan_complete: history.complete, set_list_truncated: history.rows.length > limit,
      ...(filter ? { metrics: summarizePerformance(history.rows, dates.from, dates.through) } : {}),
      weight_storage: "External loads are shown in pounds. Older records may have missing effort, load, or equipment details.",
    });
  }));

  server.registerTool("recommend_my_exercise_progression", {
    description: "Suggest next-session targets based on the user's comparable working sets and recorded recovery. Give the evidence and uncertainty. Supply rep range and set count from the current plan or ask the user. Set technique or recovery only when the user supplied it. Suggestions never log a set.",
    inputSchema: { ...selector, ...historyWindow, rep_min: strengthReps, rep_max: strengthReps,
      planned_sets: z.number().int().min(1).max(20), target_rir: z.number().min(0).max(5).default(2),
      required_sessions: z.number().int().min(2).max(5).default(2), unit: z.enum(["lb", "kg"]).default("lb"),
      increment: z.number().positive().max(100).optional().describe("Smallest available load increment in the output unit, if known."),
      technique: z.enum(["controlled", "uncertain", "form_broke"]).optional(),
      recovery: z.enum(["normal", "fatigued", "very_fatigued"]).optional(),
    },
    annotations: annotations(true),
  }, ({ exercise_id, exercise_name, days, through, ...options }) => reportWorkout(async () => {
    if (!exercise_id && !exercise_name) throw new WorkoutRequestError("Choose an exercise for this recommendation.");
    if (options.rep_min > options.rep_max) throw new WorkoutRequestError("The rep minimum cannot exceed the maximum.");
    const dates = windowDates(days, through);
    const recoveryWindow = windowDates(7, dates.through);
    const [history, recovery] = await Promise.all([
      workouts.history(dates.from, dates.through, { exercise_id, exercise_name }),
      workouts.latestRecovery(recoveryWindow.from, dates.through),
    ]);
    const suggestion = recommendProgression(history.rows, options, dates.through, recovery, history.complete,
      !!history.exercise, history.exercise?.equipment, history.exercise?.name ?? exercise_name);
    return toolResult(suggestion.reason, { exercise: history.exercise, ...dates, recommendation: suggestion });
  }));

  server.registerTool("find_my_workout_exercises", {
    description: "Find canonical GRUNTR exercise IDs, equipment, and default prescription details for workout logging or routine proposals.",
    inputSchema: { query: text(120) },
    annotations: annotations(true),
  }, ({ query }) => reportWorkout(async () => {
    const term = query.toLowerCase();
    const matches = (await workouts.catalog()).filter((e) =>
      e.name.toLowerCase().includes(term) || e.aliases.some((a) => a.toLowerCase().includes(term)));
    return toolResult("Searched the GRUNTR exercise library.", { exercises: matches.slice(0, 15), matches: matches.length });
  }));

  server.registerTool("list_my_saved_routines", {
    description: "List client-owned weekly routines that can be considered for a proposal. The active coach-assigned program is separate.",
    annotations: annotations(true),
  }, () => reportWorkout(async () => toolResult("Loaded your saved routines.", { routines: await workouts.savedRoutines() })));

  server.registerTool("preview_my_routine", {
    description: "Prepare a preview of a weekly routine based on the user's preferences and recent sessions. Show the before/after and give the user the GRUNTR approval link. A preview does not save or update any routine. Use an existing saved routine ID only for an explicit update request.",
    inputSchema: { request_id: requestId, plan_id: z.uuid().optional(), title: text(120),
      split: z.enum(["upper_lower", "full_body", "balanced"]), minutes: z.number().int().min(15).max(120),
      goal: z.enum(["strength", "muscle", "fitness"]),
      workouts: z.array(z.object({ title: text(100), weekday: z.number().int().min(0).max(6)
        .describe("Monday = 0. Sunday = 6."), exercises: z.array(z.object({
        exercise_id: z.uuid(), sets: z.number().int().min(1).max(6), rep_min: strengthReps, rep_max: strengthReps,
        rest_seconds: z.number().int().min(0).max(600),
      })).min(1).max(12) })).min(2).max(5),
    },
    annotations: annotations(false),
  }, ({ request_id, plan_id, ...input }) => reportWorkout(async () => {
    const plan = buildRoutine(input, request_id, await workouts.catalog());
    const preview = await workouts.proposeRoutine(request_id, plan, plan_id);
    return toolResult(preview.state === "awaiting_approval" ? "GRUNTR prepared the routine preview for your review."
      : `GRUNTR reports this proposal is ${preview.state}.`, {
      ...preview, ...(preview.state === "awaiting_approval" ? {
        approval_url: `https://benjaminbenz.com/client-dashboard.html?routine_proposal=${encodeURIComponent(preview.proposal_id)}`,
      } : {}),
    });
  }));

  server.registerTool("get_my_routine_proposal_status", {
    description: "Check whether the signed-in user approved and saved a proposal in GRUNTR. Only report saved when GRUNTR confirms it.",
    inputSchema: { proposal_id: z.uuid() },
    annotations: annotations(true),
  }, ({ proposal_id }) => reportWorkout(async () => {
    const proposal = await workouts.routineProposal(proposal_id);
    return toolResult("Checked the proposal in GRUNTR.", { proposal });
  }));
}
