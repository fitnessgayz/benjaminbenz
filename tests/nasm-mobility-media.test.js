const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const migration = fs.readFileSync(
  path.join(
    __dirname,
    "../supabase/migrations/20261001042737_link_verified_nasm_mobility_videos.sql",
  ),
  "utf8",
);

const exercises = [
  ["Doorway Chest Stretch", "doorway-chest-stretch"],
  ["Walking Lunge With Rotation", "walking-lunge-with-rotation"],
  ["Arm Circles", "arm-circles"],
  ["Standing Hip Opener", "standing-hip-opener"],
  ["Front-to-Back Leg Swings", "front-to-back-leg-swings"],
  ["Lateral Leg Swings", "lateral-leg-swings"],
  ["Multiplanar Lunge With Reach", "multiplanar-lunge-with-reach"],
  ["Lateral Tube Walk", "lateral-tube-walk"],
  ["Medicine Ball Chop and Lift", "medicine-ball-chop-and-lift"],
  ["Push-Up With Rotation", "push-up-with-rotation"],
];

test("all ten NASM mobility entries keep their branded exercise cards", () => {
  for (const [name, slug] of exercises) {
    assert.match(migration, new RegExp(`'${name}', '${slug}'`));
  }
  assert.match(migration, /exercise-images\/approved\/2026-09-30\/webp-768\//);
  assert.match(migration, /image_url\s*=/i);
});

test("only exact official NASM demonstrations are linked", () => {
  assert.match(
    migration,
    /'Multiplanar Lunge With Reach'[^\n]*https:\/\/www[.]youtube[.]com\/watch[?]v=ynLR-FL1VpA/,
  );
  assert.match(
    migration,
    /'Push-Up With Rotation'[^\n]*https:\/\/www[.]youtube[.]com\/watch[?]v=miN74vJbE_w/,
  );
  assert.equal(
    (migration.match(/https:\/\/www[.]youtube[.]com\/watch[?]v=/g) || []).length,
    2,
  );
  assert.match(migration, /demo_url\s*=\s*coalesce\(mobility_media[.]demo_url, exercise[.]demo_url\)/i);
});
