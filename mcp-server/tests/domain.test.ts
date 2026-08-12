import { describe, expect, it } from "vitest";

import { startDateForWindow, summarizeProgress, type ProgressEntry } from "../src/domain.js";

describe("progress helpers", () => {
  it("calculates an inclusive UTC date window", () => {
    expect(startDateForWindow(30, new Date("2026-08-12T12:00:00Z"))).toBe("2026-07-14");
  });

  it("summarizes entries without inventing metrics", () => {
    const entries: ProgressEntry[] = [
      {
        id: "one",
        occurred_on: "2026-08-12",
        category: "strength",
        metric_name: "squat",
        numeric_value: 185,
        unit: "lb",
        note: "Controlled reps",
      },
      {
        id: "two",
        occurred_on: "2026-08-10",
        category: "recovery",
        metric_name: null,
        numeric_value: null,
        unit: null,
        note: "Slept well",
      },
    ];

    expect(summarizeProgress(entries)).toMatchObject({
      entry_count: 2,
      newest_entry_on: "2026-08-12",
      oldest_entry_on: "2026-08-10",
      by_category: { strength: 1, recovery: 1 },
    });
  });
});
