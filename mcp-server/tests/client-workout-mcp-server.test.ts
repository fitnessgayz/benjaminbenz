import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createClientWorkoutMcpServer } from "../src/client-workout-mcp-server.js";
import { GruntrWorkouts } from "../src/gruntr-workouts.js";
import type { WorkoutInput, WorkoutLogEntry } from "../src/domain.js";

describe("FWB Training Client plugin", () => {
  let client: Client;
  let server: ReturnType<typeof createClientWorkoutMcpServer>;
  const saved: WorkoutInput[] = [];
  let workouts: GruntrWorkouts;
  const writes: { action: string; requestId: string; input: Record<string, unknown> }[] = [];
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const requestId = "22222222-2222-4222-8222-222222222222";

  beforeEach(async () => {
    saved.length = 0;
    writes.length = 0;
    workouts = new GruntrWorkouts({} as SupabaseClient, "test@example.test", requestId);
    vi.spyOn(workouts, "catalog").mockResolvedValue([]);
    vi.spyOn(workouts, "write").mockImplementation(async (action, id, input) => {
      writes.push({ action, requestId: id, input });
      return { state: "active", session_id: sessionId, set_id: id };
    });
    server = createClientWorkoutMcpServer({
      async getConnectedAccount() {
        return { display_name: "Test Client", masked_email: "t***@example.com" };
      },
      async getActiveProgram() { return null; },
      async recordWorkout(input) {
        saved.push(input);
        return input.sets.map((set, index): WorkoutLogEntry => ({
          id: `set-${index + 1}`,
          workout_session_id: "internal-session-id",
          entry_date: input.occurredOn,
          workout_title: input.workoutTitle,
          exercise_code: set.exerciseCode,
          exercise_name: set.exerciseName,
          set_number: set.setNumber,
          weight_used: set.weightUsed,
          reps: set.reps,
          notes: set.notes,
          created_at: "2026-11-02T18:00:00Z",
        }));
      },
    }, workouts, "https://staging.example.test/client-dashboard.html?tab=workouts");
    client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("advertises owner-scoped client tools and keeps routine approval outside MCP", async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
      "get_my_connected_client_account", "log_my_workout", "get_my_active_program",
      "get_my_active_workout", "start_my_workout", "log_my_set", "edit_my_set", "finish_my_workout",
      "get_my_exercise_history", "recommend_my_exercise_progression", "preview_my_routine", "get_my_routine_proposal_status",
    ]));
    expect(tools.tools.some((tool) => /approve|contact_benjamin/.test(tool.name))).toBe(false);
    expect(tools.tools.find((tool) => tool.name === "log_my_set")?.annotations?.idempotentHint).toBe(true);
    expect(tools.tools.find((tool) => tool.name === "log_my_workout")?.annotations?.readOnlyHint).toBe(false);
  });

  it("accepts a live set with explicit kg and returns persisted IDs", async () => {
    const result = await client.callTool({
      name: "log_my_set",
      arguments: { request_id: requestId, session_id: sessionId, exercise_name: "Barbell Bench Press",
        reps: 9, weight: { value: 60, unit: "kg" }, rpe: 8 },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ session_id: sessionId, set_id: requestId, state: "active" });
    expect(writes).toEqual([{ action: "append", requestId, input: {
      session_id: sessionId, set: { exercise_id: null, exercise_name: "Barbell Bench Press", reps: 9,
        weight_lb: 132.277357, unit: "kg", bodyweight: false, effort_scale: "rpe", effort_value: 8 },
    } }]);
  });

  it("rejects invalid and contradictory live set input before persistence", async () => {
    for (const set of [{ reps: 0 }, { reps: 5, rir: 2, rpe: 9 }, { reps: 3, weight: { value: 10, unit: "stone" } }]) {
      const result = await client.callTool({
        name: "log_my_set",
        arguments: { request_id: requestId, session_id: sessionId, exercise_name: "Squat", ...set },
      });
      expect(result.isError).toBe(true);
    }
    expect(writes).toHaveLength(0);
  });

  it("sends routine approvals to the configured staging dashboard", async () => {
    vi.mocked(workouts.catalog).mockResolvedValue([{
      id: sessionId, name: "Barbell Bench Press", aliases: [], equipment: "barbell",
      default_reps: "8-12", default_sets: 3, default_rest_seconds: 90,
    }]);
    vi.spyOn(workouts, "proposeRoutine").mockResolvedValue({ state: "awaiting_approval", proposal_id: requestId });
    const exercise = { exercise_id: sessionId, sets: 3, rep_min: 8, rep_max: 12, rest_seconds: 90 };
    const result = await client.callTool({
      name: "preview_my_routine",
      arguments: { request_id: requestId, title: "Test split", split: "balanced", minutes: 45, goal: "fitness",
        workouts: [{ title: "Monday", weekday: 0, exercises: [exercise] },
          { title: "Thursday", weekday: 3, exercises: [exercise] }] },
    });
    expect(result.structuredContent).toMatchObject({
      approval_url: `https://staging.example.test/client-dashboard.html?tab=workouts&routine_proposal=${requestId}`,
    });
  });

  it("saves one completed workout and minimizes the response", async () => {
    const result = await client.callTool({
      name: "log_my_workout",
      arguments: {
        occurred_on: "2026-11-02",
        workout_title: "Strength Day",
        exercises: [
          { name: "Squat", sets: [{ reps: 8, weight_lb: 135 }, { reps: 6, weight_lb: 155 }] },
          { name: "Push-up", sets: [{ reps: 12, bodyweight: true }] },
        ],
      },
    });
    expect(result.isError).not.toBe(true);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.sets).toMatchObject([
      { exerciseCode: "A", setNumber: 1, weightUsed: 135, reps: 8 },
      { exerciseCode: "A", setNumber: 2, weightUsed: 155, reps: 6 },
      { exerciseCode: "B", setNumber: 1, weightUsed: null, reps: 12, notes: "Bodyweight" },
    ]);
    expect(result.structuredContent).toMatchObject({ date: "2026-11-02", exercises: 2, sets: 3 });
    expect(JSON.stringify(result)).not.toContain("internal-session-id");
  });

  it("rejects conflicting bodyweight and resistance values without writing", async () => {
    const result = await client.callTool({
      name: "log_my_workout",
      arguments: {
        occurred_on: "2026-11-02",
        workout_title: "Strength Day",
        exercises: [{ name: "Push-up", sets: [{ reps: 12, bodyweight: true, weight_lb: 25 }] }],
      },
    });
    expect(result.isError).toBe(true);
    expect(saved).toHaveLength(0);
  });
});
