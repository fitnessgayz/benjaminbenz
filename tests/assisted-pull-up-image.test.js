const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/20260928223415_set_assisted_pull_up_image.sql"),
  "utf8"
);

test("Assisted Pull-Up keeps its library record and only changes the image reference", () => {
  assert.match(migration, /update\s+public\.exercise_library/i);
  assert.match(migration, /where\s+name\s*=\s*'Assisted Pull-Up'/i);
  assert.match(
    migration,
    /set\s+image_url\s*=\s*'https:\/\/qukdfjeupjhpthfbaonv\.supabase\.co\/storage\/v1\/object\/public\/exercise-images\/approved\/assisted-pull-up\.png'/i
  );

  const setClause = migration.match(/set\s+([\s\S]*?)\s+where/i)?.[1] || "";
  assert.doesNotMatch(setClause, /\b(name|aliases|primary_muscle|secondary_muscles|equipment|difficulty|movement_pattern|default_sets|default_reps|default_rest_seconds|substitution_group|demo_url|instructions|is_approved|is_active|sort_order|updated_at)\b/i);
});
