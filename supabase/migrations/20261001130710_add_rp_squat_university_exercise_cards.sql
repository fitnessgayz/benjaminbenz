-- Add the missing, prescribable exercise tutorials found in the official
-- Renaissance Periodization and Squat University channel audit.
with new_exercises as (
  select * from jsonb_to_recordset($exercises$
[
  {
    "name": "EZ-Bar Spider Curl",
    "slug": "ez-bar-spider-curl",
    "aliases": [
      "EZ Bar Spider Curl"
    ],
    "primary_muscle": "biceps",
    "secondary_muscles": [
      "forearms"
    ],
    "equipment": "other",
    "difficulty": "intermediate",
    "movement_pattern": "elbow_flexion",
    "default_sets": 3,
    "default_reps": "8-15",
    "default_rest_seconds": 60,
    "substitution_group": "biceps_curl",
    "instructions": "Lie chest-down on an incline bench with both upper arms hanging vertically. Curl the EZ bar without swinging the shoulders, pause near the top, and lower under control until the elbows are extended.",
    "sort_order": 1128,
    "demo_url": "https://www.youtube.com/watch?v=WG3vdcq__I0"
  },
  {
    "name": "Dumbbell Spider Curl",
    "slug": "dumbbell-spider-curl",
    "aliases": [
      "DB Spider Curl"
    ],
    "primary_muscle": "biceps",
    "secondary_muscles": [
      "forearms"
    ],
    "equipment": "dumbbell",
    "difficulty": "intermediate",
    "movement_pattern": "elbow_flexion",
    "default_sets": 3,
    "default_reps": "8-15",
    "default_rest_seconds": 60,
    "substitution_group": "biceps_curl",
    "instructions": "Lie chest-down on an incline bench with a dumbbell in each hand. Keep the upper arms vertical, curl both weights smoothly, then lower to full elbow extension without letting the shoulders roll forward.",
    "sort_order": 1129,
    "demo_url": "https://www.youtube.com/watch?v=ke2shAeQ0O8"
  },
  {
    "name": "Deficit Push-Up",
    "slug": "deficit-push-up",
    "aliases": [
      "Deep Push-Up",
      "Elevated-Hand Push-Up"
    ],
    "primary_muscle": "chest",
    "secondary_muscles": [
      "triceps",
      "shoulders",
      "core"
    ],
    "equipment": "bodyweight",
    "difficulty": "intermediate",
    "movement_pattern": "horizontal_press",
    "default_sets": 3,
    "default_reps": "8-15",
    "default_rest_seconds": 75,
    "substitution_group": "push_up",
    "instructions": "Place each hand on an equal stable support and form a rigid plank. Lower your chest slightly below hand level while keeping the elbows controlled, then press back to the top without losing trunk position.",
    "sort_order": 1130,
    "demo_url": "https://www.youtube.com/watch?v=gmNlqsE3Onc"
  },
  {
    "name": "Machine Lateral Raise",
    "slug": "machine-lateral-raise",
    "aliases": [
      "Lateral Raise Machine"
    ],
    "primary_muscle": "shoulders",
    "secondary_muscles": [],
    "equipment": "machine",
    "difficulty": "beginner",
    "movement_pattern": "shoulder_abduction",
    "default_sets": 3,
    "default_reps": "10-20",
    "default_rest_seconds": 60,
    "substitution_group": "lateral_raise",
    "instructions": "Sit tall with the machine pads against the outside of your upper arms. Raise the arms out to about shoulder height without shrugging, pause briefly, and return slowly to the start.",
    "sort_order": 1131,
    "demo_url": "https://www.youtube.com/watch?v=0o07iGKUarI"
  },
  {
    "name": "Stiff-Leg Deadlift",
    "slug": "stiff-leg-deadlift",
    "aliases": [
      "Stiff-Legged Deadlift",
      "SLDL"
    ],
    "primary_muscle": "hamstrings",
    "secondary_muscles": [
      "glutes",
      "back"
    ],
    "equipment": "barbell",
    "difficulty": "intermediate",
    "movement_pattern": "hinge",
    "default_sets": 3,
    "default_reps": "6-12",
    "default_rest_seconds": 90,
    "substitution_group": "hinge",
    "instructions": "Stand with the bar at your thighs and keep the knees softly unlocked. Push the hips back while keeping the bar close and spine neutral, then drive the hips forward to return upright.",
    "sort_order": 1132,
    "demo_url": "https://www.youtube.com/watch?v=Ka6GhzIfh-c"
  },
  {
    "name": "Sumo Deficit Deadlift",
    "slug": "sumo-deficit-deadlift",
    "aliases": [
      "Deficit Sumo Deadlift"
    ],
    "primary_muscle": "glutes",
    "secondary_muscles": [
      "quads",
      "hamstrings",
      "back"
    ],
    "equipment": "barbell",
    "difficulty": "advanced",
    "movement_pattern": "hinge",
    "default_sets": 3,
    "default_reps": "4-8",
    "default_rest_seconds": 120,
    "substitution_group": "deadlift",
    "instructions": "Stand on a low stable platform in a wide sumo stance with the bar over midfoot. Brace, push the knees out, and lift by driving through the floor; finish tall without leaning back, then lower under control.",
    "sort_order": 1133,
    "demo_url": "https://www.youtube.com/watch?v=bnYekgCKfv0"
  },
  {
    "name": "JM Press",
    "slug": "jm-press",
    "aliases": [
      "Barbell JM Press"
    ],
    "primary_muscle": "triceps",
    "secondary_muscles": [
      "chest",
      "shoulders"
    ],
    "equipment": "barbell",
    "difficulty": "advanced",
    "movement_pattern": "elbow_extension",
    "default_sets": 3,
    "default_reps": "6-12",
    "default_rest_seconds": 75,
    "substitution_group": "triceps_extension",
    "instructions": "Lie on a flat bench with the bar above the upper chest. Bend the elbows and bring the bar toward the chin or upper chest while keeping the upper arms angled, then extend the elbows to press back up.",
    "sort_order": 1134,
    "demo_url": "https://www.youtube.com/watch?v=Tih5iHyELsE"
  },
  {
    "name": "T-Bar Row",
    "slug": "t-bar-row",
    "aliases": [
      "Landmine T-Bar Row"
    ],
    "primary_muscle": "back",
    "secondary_muscles": [
      "biceps",
      "rear_delts"
    ],
    "equipment": "landmine",
    "difficulty": "intermediate",
    "movement_pattern": "horizontal_pull",
    "default_sets": 3,
    "default_reps": "8-15",
    "default_rest_seconds": 75,
    "substitution_group": "row",
    "instructions": "Straddle the landmine bar and hinge with a neutral spine. Pull the handle toward the lower chest by driving the elbows back, then lower until the arms are long without rounding the torso.",
    "sort_order": 1135,
    "demo_url": "https://www.youtube.com/watch?v=yPis7nlbqdY"
  },
  {
    "name": "Kettlebell Arm Bar",
    "slug": "kettlebell-arm-bar",
    "aliases": [
      "KB Arm Bar"
    ],
    "primary_muscle": "shoulders",
    "secondary_muscles": [
      "core",
      "chest"
    ],
    "equipment": "other",
    "difficulty": "intermediate",
    "movement_pattern": "shoulder_stability",
    "default_sets": 3,
    "default_reps": "20-40 sec each",
    "default_rest_seconds": 45,
    "substitution_group": "shoulder_stability",
    "instructions": "Press one kettlebell over the shoulder from a supine position. Keep the wrist stacked and roll gently toward the opposite side while the loaded arm stays vertical, then return with control.",
    "sort_order": 1136,
    "demo_url": "https://www.youtube.com/watch?v=Ya0DCt11wGI"
  },
  {
    "name": "Box Squat",
    "slug": "box-squat",
    "aliases": [
      "Barbell Box Squat"
    ],
    "primary_muscle": "quads",
    "secondary_muscles": [
      "glutes",
      "hamstrings",
      "core"
    ],
    "equipment": "barbell",
    "difficulty": "intermediate",
    "movement_pattern": "squat",
    "default_sets": 3,
    "default_reps": "5-10",
    "default_rest_seconds": 90,
    "substitution_group": "squat",
    "instructions": "Set a stable box at an appropriate height and place the bar securely across the upper back. Sit the hips back until you touch the box with control, stay braced, then drive through the feet to stand.",
    "sort_order": 1137,
    "demo_url": "https://www.youtube.com/watch?v=rRihE4weYg4"
  },
  {
    "name": "GHD Back Extension",
    "slug": "ghd-back-extension",
    "aliases": [
      "GHD Hip Extension",
      "Glute-Ham Developer Back Extension"
    ],
    "primary_muscle": "back",
    "secondary_muscles": [
      "glutes",
      "hamstrings"
    ],
    "equipment": "machine",
    "difficulty": "intermediate",
    "movement_pattern": "hip_extension",
    "default_sets": 3,
    "default_reps": "8-15",
    "default_rest_seconds": 60,
    "substitution_group": "back_extension",
    "instructions": "Secure the feet in the GHD with the hips supported on the pad. Hinge forward under control, then extend the hips until the torso forms a straight line with the legs; do not overarch the low back.",
    "sort_order": 1138,
    "demo_url": "https://www.youtube.com/watch?v=ixr4_1POpzg"
  },
  {
    "name": "Goblet Squat Stretch",
    "slug": "goblet-squat-stretch",
    "aliases": [
      "Weighted Deep Squat Stretch"
    ],
    "primary_muscle": "hips",
    "secondary_muscles": [
      "adductors",
      "ankles",
      "quads"
    ],
    "equipment": "other",
    "difficulty": "beginner",
    "movement_pattern": "mobility",
    "default_sets": 2,
    "default_reps": "20-40 sec",
    "default_rest_seconds": 30,
    "substitution_group": "squat_mobility",
    "instructions": "Hold a light kettlebell at the chest and descend into a comfortable deep squat. Keep the heels grounded, use the elbows to gently guide the knees outward, and breathe while maintaining a long spine.",
    "sort_order": 1139,
    "demo_url": "https://www.youtube.com/watch?v=ShvTpCsgTiw"
  },
  {
    "name": "Banded Hip Mobilization",
    "slug": "banded-hip-mobilization",
    "aliases": [
      "Banded Hip Joint Mobilization"
    ],
    "primary_muscle": "hips",
    "secondary_muscles": [
      "glutes"
    ],
    "equipment": "other",
    "difficulty": "beginner",
    "movement_pattern": "mobility",
    "default_sets": 2,
    "default_reps": "8-12 each",
    "default_rest_seconds": 30,
    "substitution_group": "hip_mobility",
    "instructions": "Anchor a strong band low behind you and loop it high around the working hip. In a half-kneeling stance, stay tall and glide the pelvis forward gently while keeping the front foot planted.",
    "sort_order": 1140,
    "demo_url": "https://www.youtube.com/watch?v=99pb0NnE4Kw"
  },
  {
    "name": "Banded Ankle Mobilization",
    "slug": "banded-ankle-mobilization",
    "aliases": [
      "Banded Ankle Joint Mobilization"
    ],
    "primary_muscle": "calves",
    "secondary_muscles": [
      "ankles"
    ],
    "equipment": "other",
    "difficulty": "beginner",
    "movement_pattern": "mobility",
    "default_sets": 2,
    "default_reps": "8-12 each",
    "default_rest_seconds": 30,
    "substitution_group": "ankle_mobility",
    "instructions": "Anchor a band behind you and loop it low around the front ankle. Keep the heel flat and guide the knee forward over the toes through a pain-free range, then return slowly.",
    "sort_order": 1141,
    "demo_url": "https://www.youtube.com/watch?v=ILSbK8RnGdI"
  },
  {
    "name": "Foam Roller Pec Stretch",
    "slug": "foam-roller-pec-stretch",
    "aliases": [
      "Foam Roller Chest Stretch"
    ],
    "primary_muscle": "chest",
    "secondary_muscles": [
      "shoulders"
    ],
    "equipment": "other",
    "difficulty": "beginner",
    "movement_pattern": "stretching",
    "default_sets": 2,
    "default_reps": "30-60 sec",
    "default_rest_seconds": 30,
    "substitution_group": "chest_mobility",
    "instructions": "Lie lengthwise on a foam roller so the head and spine are supported. Open both arms into a comfortable goalpost position with palms up and allow the chest to relax without forcing the shoulders.",
    "sort_order": 1142,
    "demo_url": "https://www.youtube.com/watch?v=OJ4G6gg8Y9I"
  },
  {
    "name": "Deep Squat Rotation",
    "slug": "deep-squat-rotation",
    "aliases": [
      "Deep Squat Thoracic Rotation"
    ],
    "primary_muscle": "hips",
    "secondary_muscles": [
      "back",
      "adductors",
      "ankles"
    ],
    "equipment": "bodyweight",
    "difficulty": "intermediate",
    "movement_pattern": "mobility",
    "default_sets": 2,
    "default_reps": "5-8 each",
    "default_rest_seconds": 30,
    "substitution_group": "squat_mobility",
    "instructions": "Settle into a stable deep squat with the heels down. Place one hand near the floor and rotate the opposite arm upward while following it with your eyes, then return and repeat on the other side.",
    "sort_order": 1143,
    "demo_url": "https://www.youtube.com/watch?v=enThal66tUs"
  },
  {
    "name": "External Rotation Press",
    "slug": "external-rotation-press",
    "aliases": [
      "Band External Rotation Press"
    ],
    "primary_muscle": "shoulders",
    "secondary_muscles": [
      "upper_back"
    ],
    "equipment": "other",
    "difficulty": "intermediate",
    "movement_pattern": "vertical_press",
    "default_sets": 3,
    "default_reps": "8-15",
    "default_rest_seconds": 45,
    "substitution_group": "shoulder_stability",
    "instructions": "Hold a light band between the hands with elbows bent at shoulder height. Maintain outward tension as you press overhead, then lower to the start without letting the elbows or wrists collapse inward.",
    "sort_order": 1144,
    "demo_url": "https://www.youtube.com/watch?v=NIK0aJDO7Pk"
  },
  {
    "name": "Split-Stance Romanian Deadlift",
    "slug": "split-stance-romanian-deadlift",
    "aliases": [
      "Split-Stance RDL",
      "Kickstand RDL"
    ],
    "primary_muscle": "hamstrings",
    "secondary_muscles": [
      "glutes",
      "core"
    ],
    "equipment": "dumbbell",
    "difficulty": "intermediate",
    "movement_pattern": "hinge",
    "default_sets": 3,
    "default_reps": "8-12 each",
    "default_rest_seconds": 60,
    "substitution_group": "single_leg_hinge",
    "instructions": "Use a short split stance with most of your weight on the front leg and the rear toes as a kickstand. Hinge over the lead hip with a neutral spine, lower the dumbbells close to the leg, then stand by driving the lead hip forward.",
    "sort_order": 1145,
    "demo_url": "https://www.youtube.com/watch?v=_e7OFsxJMfU"
  }
]
$exercises$::jsonb) as exercise(
    name text, slug text, aliases text[], primary_muscle text, secondary_muscles text[],
    equipment text, difficulty text, movement_pattern text, default_sets integer,
    default_reps text, default_rest_seconds integer, substitution_group text,
    demo_url text, instructions text, sort_order integer
  )
)
insert into public.exercise_library (
  name, aliases, primary_muscle, secondary_muscles, equipment, difficulty,
  movement_pattern, default_sets, default_reps, default_rest_seconds,
  substitution_group, image_url, demo_url, instructions, is_approved, is_active, sort_order
)
select name, aliases, primary_muscle, secondary_muscles, equipment, difficulty,
  movement_pattern, default_sets, default_reps, default_rest_seconds, substitution_group,
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-01/webp-768/' || slug || '.webp',
  demo_url, instructions, true, true, sort_order
from new_exercises
on conflict (lower(name)) do update set
  aliases = (select array_agg(distinct alias order by alias) from unnest(coalesce(public.exercise_library.aliases, '{}'::text[]) || excluded.aliases) alias),
  primary_muscle = excluded.primary_muscle, secondary_muscles = excluded.secondary_muscles,
  equipment = excluded.equipment, difficulty = excluded.difficulty, movement_pattern = excluded.movement_pattern,
  default_sets = excluded.default_sets, default_reps = excluded.default_reps,
  default_rest_seconds = excluded.default_rest_seconds, substitution_group = excluded.substitution_group,
  image_url = excluded.image_url, demo_url = excluded.demo_url, instructions = excluded.instructions,
  is_approved = true, is_active = true, sort_order = excluded.sort_order, updated_at = now();
