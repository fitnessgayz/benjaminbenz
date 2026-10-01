-- Add the first reviewed batch of strength movements that were explicitly
-- requested but were not yet present in the exercise library. Each canonical
-- movement points at its immutable 768px branded card; the 480px derivative
-- and PNG master are published alongside it for responsive clients and future
-- editing.
with new_exercises as (
  select *
  from jsonb_to_recordset($exercises$
  [
    {
      "name":"Chest-Supported Dumbbell Wide Row",
      "aliases":["Chest Supported Dumbbell Wide Row","Incline Bench Dumbbell Wide Row","Chest-Supported Wide Dumbbell Row"],
      "primary_muscle":"back",
      "equipment":"dumbbell",
      "movement_pattern":"horizontal_pull",
      "default_reps":"8-12",
      "default_rest_seconds":75,
      "substitution_group":"horizontal_pull",
      "sort_order":145,
      "slug":"chest-supported-dumbbell-wide-row",
      "instructions":"Set an incline bench and lie chest-down with a dumbbell in each hand. Keep your neck neutral, draw your shoulder blades back, and row with your elbows about 45 degrees from your torso. Pause beside your lower chest, then lower with control without lifting your chest from the pad."
    },
    {
      "name":"Overhead Rope Triceps Extension",
      "aliases":["Cable Rope Overhead Triceps Extension","Overhead Cable Rope Triceps Extension"],
      "primary_muscle":"triceps",
      "equipment":"cable",
      "movement_pattern":"elbow_extension",
      "default_reps":"10-15",
      "default_rest_seconds":60,
      "substitution_group":"triceps_extension",
      "sort_order":323,
      "slug":"overhead-rope-triceps-extension",
      "instructions":"Face away from a high pulley in a stable split stance and hold the rope behind your head. Keep your ribs stacked and upper arms beside your ears. Extend your elbows until your arms are straight, separate the rope ends slightly, then return slowly without letting your elbows flare."
    },
    {
      "name":"Lateral Step-Up",
      "aliases":["Lateral Box Step-Up","Side Step-Up","Side Box Step-Up"],
      "primary_muscle":"quads",
      "equipment":"bodyweight",
      "movement_pattern":"single_leg_squat",
      "default_reps":"8-12 each",
      "default_rest_seconds":75,
      "substitution_group":"single_leg_squat",
      "sort_order":439,
      "slug":"lateral-step-up",
      "instructions":"Stand beside a stable box and place the nearer foot fully on top. Keep your torso tall and knee aligned over your second toe. Drive through the planted foot to stand on the box without pushing off the floor leg, then lower slowly under control."
    },
    {
      "name":"Half-Kneeling Single-Arm Landmine Press",
      "aliases":["Half Kneeling Single Arm Landmine Press","Half-Kneeling Landmine Press"],
      "primary_muscle":"shoulders",
      "equipment":"landmine",
      "movement_pattern":"vertical_press",
      "default_reps":"8-12 each",
      "default_rest_seconds":75,
      "substitution_group":"vertical_press",
      "sort_order":216,
      "slug":"half-kneeling-single-arm-landmine-press",
      "instructions":"Kneel with the working-side knee down and the opposite foot planted. Hold the bar sleeve at shoulder height, brace your core, and keep your ribs stacked over your pelvis. Press the bar up and forward along its natural arc, then return to your shoulder without rotating or leaning back."
    },
    {
      "name":"Standing Single-Arm Landmine Press",
      "aliases":["Standing Single Arm Landmine Press","Single-Arm Landmine Press"],
      "primary_muscle":"shoulders",
      "equipment":"landmine",
      "movement_pattern":"vertical_press",
      "default_reps":"8-12 each",
      "default_rest_seconds":75,
      "substitution_group":"vertical_press",
      "sort_order":217,
      "slug":"standing-single-arm-landmine-press",
      "instructions":"Stand in a stable split stance with the bar sleeve at shoulder height. Brace your trunk and keep your wrist neutral. Press the bar up and forward until your arm is extended, then lower it with control while keeping your torso square and avoiding back lean."
    },
    {
      "name":"Landmine Row",
      "aliases":["Bent-Over Landmine Row","Two-Hand Landmine Row"],
      "primary_muscle":"back",
      "equipment":"landmine",
      "movement_pattern":"horizontal_pull",
      "default_reps":"8-12",
      "default_rest_seconds":75,
      "substitution_group":"horizontal_pull",
      "sort_order":146,
      "slug":"landmine-row",
      "instructions":"Straddle the bar and hinge at your hips with a long neutral spine. Hold the close-grip handle with straight arms and keep your torso angle fixed. Pull toward your lower chest or upper abdomen, squeeze your shoulder blades together, then lower until your arms are extended without rounding your back."
    }
  ]$exercises$::jsonb) as exercise(
    name text,
    aliases text[],
    primary_muscle text,
    equipment text,
    movement_pattern text,
    default_reps text,
    default_rest_seconds integer,
    substitution_group text,
    sort_order integer,
    slug text,
    instructions text
  )
)
insert into public.exercise_library (
  name,
  aliases,
  primary_muscle,
  equipment,
  difficulty,
  movement_pattern,
  default_sets,
  default_reps,
  default_rest_seconds,
  substitution_group,
  image_url,
  instructions,
  is_approved,
  is_active,
  sort_order
)
select
  name,
  aliases,
  primary_muscle,
  equipment,
  'intermediate',
  movement_pattern,
  3,
  default_reps,
  default_rest_seconds,
  substitution_group,
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-30/webp-768/' || slug || '.webp',
  instructions,
  true,
  true,
  sort_order
from new_exercises
on conflict (lower(name)) do update set
  aliases = (
    select array_agg(distinct alias order by alias)
    from unnest(coalesce(public.exercise_library.aliases, '{}'::text[]) || excluded.aliases) as alias
  ),
  primary_muscle = excluded.primary_muscle,
  equipment = excluded.equipment,
  difficulty = excluded.difficulty,
  movement_pattern = excluded.movement_pattern,
  default_sets = excluded.default_sets,
  default_reps = excluded.default_reps,
  default_rest_seconds = excluded.default_rest_seconds,
  substitution_group = excluded.substitution_group,
  image_url = excluded.image_url,
  instructions = excluded.instructions,
  is_approved = true,
  is_active = true,
  sort_order = excluded.sort_order,
  updated_at = now();

-- The historical generic row is retained for compatibility with saved
-- workouts, but it reuses the canonical barbell card and instructions instead
-- of creating a duplicate visual asset.
update public.exercise_library
set
  aliases = array['Barbell Upright Row', 'Upright Barbell Row'],
  primary_muscle = 'shoulders',
  equipment = 'barbell',
  movement_pattern = 'vertical_pull',
  substitution_group = 'upright_row',
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/barbell-upright-row.webp',
  instructions = 'Stand tall with the bar close to your body. Lead with your elbows as you pull toward your upper chest, keep your shoulders down, then lower the bar slowly with control.',
  is_approved = true,
  is_active = true,
  updated_at = now()
where lower(name) = 'upright row';
