import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  CheckInInput,
  ClientProfile,
  CoachRequest,
  CoachRequestInput,
  ProgressCategory,
  ProgressEntry,
  ProgressNoteInput,
  TrainingProgram,
} from "../src/domain.js";
import { createBenjaminMcpServer } from "../src/mcp-server.js";
import type { CoachingRepository } from "../src/repository.js";

class FakeRepository implements CoachingRepository {
  progressWrites: ProgressNoteInput[] = [];

  async getProfile(): Promise<ClientProfile> {
    return { display_name: "Test Client", goals: "Build strength", coaching_preferences: null, training_experience: "Intermediate" };
  }

  async getActiveProgram(): Promise<TrainingProgram> {
    return {
      id: "program",
      title: "Strength Base",
      focus: "Clean mechanics",
      status: "active",
      start_date: "2026-08-01",
      end_date: null,
      client_summary: "Three sessions weekly",
      workouts: [
        {
          title: "Lower A",
          focus: "Strength",
          format: "single",
          exercises: [
            {
              code: "A",
              name: "Back Squat",
              prescription: "5 reps x 4 sets",
              rest: "2 minutes",
              muscles: "quads, glutes",
              video_url: null,
            },
          ],
        },
      ],
    };
  }

  async listProgress(_days: number, _category?: ProgressCategory): Promise<ProgressEntry[]> {
    return [{ id: "progress", occurred_on: "2026-08-12", category: "strength", metric_name: "squat", numeric_value: 185, unit: "lb", note: "Controlled reps" }];
  }

  async recordCheckIn(_input: CheckInInput) {
    return { id: "check-in", created_at: "2026-08-12T12:00:00Z" };
  }

  async addProgressNote(input: ProgressNoteInput): Promise<ProgressEntry> {
    this.progressWrites.push(input);
    return { id: "new-progress", occurred_on: input.occurredOn, category: input.category, metric_name: input.metricName, numeric_value: input.numericValue, unit: input.unit, note: input.note };
  }

  async createCoachRequest(input: CoachRequestInput): Promise<CoachRequest> {
    return { id: "request", request_type: input.requestType, urgency: input.urgency, message: input.message, status: "open", created_at: "2026-08-12T12:00:00Z" };
  }

  async listOpenCoachRequests(): Promise<CoachRequest[]> {
    return [];
  }
}

describe("Benjamin MCP server", () => {
  let client: Client;
  let server: ReturnType<typeof createBenjaminMcpServer>;
  let repository: FakeRepository;

  beforeEach(async () => {
    repository = new FakeRepository();
    server = createBenjaminMcpServer(repository);
    client = new Client({ name: "test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it("advertises the expected client-safe tools", async () => {
    const result = await client.listTools();
    expect(result.tools.map((tool) => tool.name)).toEqual([
      "get_my_coaching_profile",
      "get_my_active_program",
      "get_my_recent_progress",
      "record_my_check_in",
      "add_my_progress_note",
      "contact_benjamin",
      "get_my_open_coach_requests",
    ]);
  });

  it("advertises Benjamin's coaching prompt for MCP clients", async () => {
    const prompts = await client.listPrompts();
    expect(prompts.prompts).toEqual([
      expect.objectContaining({
        name: "coach_with_benjamin",
        title: "Coach with Benjamin",
      }),
    ]);

    const prompt = await client.getPrompt({ name: "coach_with_benjamin" });
    expect(prompt.messages[0]).toMatchObject({
      role: "user",
      content: expect.objectContaining({ type: "text" }),
    });
    expect(prompt.messages[0]?.content).toMatchObject({
      text: expect.stringContaining("never claim to be Benjamin"),
    });
  });

  it("returns structured progress data", async () => {
    const result = await client.callTool({ name: "get_my_recent_progress", arguments: { days: 30 } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      window_days: 30,
      summary: { entry_count: 1 },
    });
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("squat: 185 lb"),
        }),
      ]),
    );
  });

  it("returns the full active program as readable text", async () => {
    const result = await client.callTool({ name: "get_my_active_program" });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      program: {
        title: "Strength Base",
        workouts: [expect.objectContaining({ title: "Lower A" })],
      },
    });
    expect(result.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringContaining("Back Squat: 5 reps x 4 sets"),
        }),
      ]),
    );
  });

  it("validates and records an explicit progress write", async () => {
    const result = await client.callTool({
      name: "add_my_progress_note",
      arguments: {
        occurred_on: "2026-08-12",
        category: "strength",
        metric_name: "squat",
        numeric_value: 190,
        unit: "lb",
        note: "Felt controlled",
      },
    });

    expect(result.isError).not.toBe(true);
    expect(repository.progressWrites).toHaveLength(1);
    expect(repository.progressWrites[0]).toMatchObject({ category: "strength", numericValue: 190 });
  });

  it("rejects out-of-range check-in values before the repository is called", async () => {
    const result = await client.callTool({
      name: "record_my_check_in",
      arguments: { energy: 8, sleep_hours: 7, stress: 2, soreness: 2 },
    });
    expect(result.isError).toBe(true);
  });
});
