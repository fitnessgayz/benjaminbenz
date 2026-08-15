import { describe, expect, it } from "vitest";

import {
  mapBodyProgress,
  mapCheckIns,
  mapLiveProgram,
  mapWorkoutProgress,
  maskEmail,
} from "../src/repository.js";

describe("live portal mapping", () => {
  it("masks connected-account emails without revealing the full address", () => {
    expect(maskEmail("benjamin@gmail.com")).toBe("b***@gmail.com");
    expect(maskEmail("x@example.com")).toBe("x***@example.com");
    expect(maskEmail("invalid-address")).toBe("Hidden");
  });

  it("maps the active client program into the MCP profile and program shapes", () => {
    const result = mapLiveProgram({
      id: "program-1",
      client_name: "Test Client",
      program_title: "Strength Base",
      program_summary: "Three sessions weekly",
      fitness_goal: "Build strength",
      focus_target: "Clean mechanics",
      coach_note_title: "This week",
      coach_note_body: "Keep the tempo steady",
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
              video: "https://example.com/squat",
            },
          ],
        },
      ],
      created_at: "2026-08-01T12:00:00Z",
      updated_at: "2026-08-12T12:00:00Z",
    });

    expect(result.profile).toMatchObject({
      display_name: "Test Client",
      goals: "Build strength",
      coaching_preferences: "Clean mechanics",
    });
    expect(result.program).toMatchObject({
      title: "Strength Base",
      status: "active",
      start_date: "2026-08-01",
      workouts: [
        expect.objectContaining({
          title: "Lower A",
          exercises: [
            expect.objectContaining({ name: "Back Squat", prescription: "5 reps x 4 sets" }),
          ],
        }),
      ],
    });
  });

  it("normalizes body measurements and workout sets as progress entries", () => {
    const bodyEntries = mapBodyProgress([
      {
        id: "body-1",
        entry_date: "2026-08-12",
        bodyweight: "185.5",
        bodyfat: null,
        goal_note: "Morning check-in",
      },
    ]);
    const workoutEntries = mapWorkoutProgress([
      {
        id: "set-1",
        entry_date: "2026-08-11",
        workout_title: "Lower A",
        exercise_name: "Squat",
        set_number: 2,
        weight_used: "205",
        reps: 5,
        notes: "Controlled",
      },
    ]);

    expect(bodyEntries[0]).toMatchObject({ category: "body_composition", numeric_value: 185.5, unit: "lb" });
    expect(workoutEntries[0]).toMatchObject({ category: "strength", numeric_value: 205, metric_name: "Squat" });
    expect(workoutEntries[0]?.note).toContain("5 reps");
  });

  it("summarizes a structured check-in without storing a conversation", () => {
    const [entry] = mapCheckIns([
      {
        id: "check-1",
        occurred_on: "2026-08-12",
        energy: 4,
        sleep_hours: "7.5",
        stress: 2,
        soreness: 3,
        win: "Finished every session",
        challenge: null,
        note: null,
      },
    ]);

    expect(entry).toMatchObject({ category: "recovery", numeric_value: 4, unit: "1-5" });
    expect(entry?.note).toContain("Finished every session");
  });
});
