import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createClientWorkoutMcpServer } from "../src/client-workout-mcp-server.js";
import type { WorkoutInput, WorkoutLogEntry } from "../src/domain.js";

describe("FWB Training Client plugin", () => {
  let client: Client;
  let server: ReturnType<typeof createClientWorkoutMcpServer>;
  const saved: WorkoutInput[] = [];

  beforeEach(async () => {
    saved.length = 0;
    server = createClientWorkoutMcpServer({
      async getConnectedAccount() {
        return { display_name: "Test Client", masked_email: "t***@example.com" };
      },
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
    });
    client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("exposes only client account verification and workout logging", async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "get_my_connected_client_account",
      "log_my_workout",
    ]);
    expect(tools.tools.find((tool) => tool.name === "log_my_workout")?.annotations?.readOnlyHint).toBe(false);
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
