-- Complete the high-confidence exercise backlog with source-verified tutorials
-- and original, diversity-reviewed FWB cards.
with new_exercises as (
  select *
  from jsonb_to_recordset($exercises$
  [
    {
      "name":"Sled Push","aliases":["Prowler Push","Weighted Sled Push"],
      "primary_muscle":"full_body","secondary_muscles":["quads","glutes","calves","shoulders"],
      "equipment":"other","difficulty":"intermediate","movement_pattern":"loaded_carry",
      "default_sets":4,"default_reps":"15-30 m","default_rest_seconds":75,
      "substitution_group":"conditioning","sort_order":1120,"slug":"sled-push",
      "demo_url":"https://www.youtube.com/watch?v=YJbKlXj4WhI",
      "instructions":"Load the sled evenly and take a firm two-handed grip on the handles. Brace your trunk, lean forward as one strong line, and drive through the floor with short powerful steps. Keep your hips from rising above your shoulders and maintain steady pressure until you reach the target distance."
    },
    {
      "name":"Reverse Nordic Curl","aliases":["Reverse Nordic","Bodyweight Knee Extension"],
      "primary_muscle":"quads","secondary_muscles":["core"],
      "equipment":"bodyweight","difficulty":"intermediate","movement_pattern":"knee_extension",
      "default_sets":3,"default_reps":"6-12","default_rest_seconds":60,
      "substitution_group":"quad_isolation","sort_order":1121,"slug":"reverse-nordic-curl",
      "demo_url":"https://www.youtube.com/watch?v=DmiMI62lmWM",
      "instructions":"Kneel on a padded surface with your hips extended and your body tall from knees to shoulders. Brace your trunk and lean backward as one rigid line without sitting toward your heels. Move only as far as you can control, then use your quads to pull your body back to the upright start."
    },
    {
      "name":"Hip Airplane","aliases":["Single-Leg Hip Airplane","Hip Airplane Drill"],
      "primary_muscle":"glutes","secondary_muscles":["hips","hamstrings","core"],
      "equipment":"bodyweight","difficulty":"intermediate","movement_pattern":"single_leg_stability",
      "default_sets":3,"default_reps":"5-8 each","default_rest_seconds":45,
      "substitution_group":"hip_stability","sort_order":1122,"slug":"hip-airplane",
      "demo_url":"https://www.youtube.com/watch?v=zNGpdD6ig4U",
      "instructions":"Balance on one leg and hinge until your torso and free leg form a long line. Keep the planted knee softly bent, then rotate your pelvis and chest open without losing your foot tripod. Reverse the rotation until your hips are square, maintaining a stable spine and controlled tempo throughout."
    },
    {
      "name":"Barbell Shrug","aliases":["Standing Barbell Shrug","Barbell Shoulder Shrug"],
      "primary_muscle":"back","secondary_muscles":["shoulders","forearms"],
      "equipment":"barbell","difficulty":"beginner","movement_pattern":"scapular_elevation",
      "default_sets":3,"default_reps":"8-15","default_rest_seconds":60,
      "substitution_group":"upper_traps","sort_order":1123,"slug":"barbell-shrug",
      "demo_url":"https://www.youtube.com/watch?v=NAqCVe2mwzM",
      "instructions":"Stand tall with a bar held evenly in front of your thighs and your arms long. Without bending your elbows or rolling your shoulders, elevate both shoulders straight toward your ears. Pause briefly at the top, then lower under control until your shoulder blades return to a neutral position."
    },
    {
      "name":"Dumbbell Front Raise","aliases":["Dumbbell Shoulder Front Raise","DB Front Raise"],
      "primary_muscle":"shoulders","secondary_muscles":["core"],
      "equipment":"dumbbell","difficulty":"beginner","movement_pattern":"shoulder_flexion",
      "default_sets":3,"default_reps":"8-15","default_rest_seconds":60,
      "substitution_group":"shoulder_isolation","sort_order":1124,"slug":"dumbbell-front-raise",
      "demo_url":"https://www.youtube.com/watch?v=zkP0MsTcIVU",
      "instructions":"Stand tall with a dumbbell in each hand, palms facing your thighs, and your ribs stacked over your pelvis. Raise both weights forward with softly bent elbows until your arms reach about shoulder height. Keep your torso quiet, then lower the dumbbells slowly without letting them swing."
    },
    {
      "name":"Hanging Leg Raise","aliases":["Straight-Leg Hanging Raise","Hanging Straight Leg Raise"],
      "primary_muscle":"core","secondary_muscles":["hips","forearms"],
      "equipment":"bodyweight","difficulty":"advanced","movement_pattern":"hip_flexion",
      "default_sets":3,"default_reps":"6-12","default_rest_seconds":75,
      "substitution_group":"core_flexion","sort_order":1125,"slug":"hanging-leg-raise",
      "demo_url":"https://www.youtube.com/watch?v=Pr1ieGZ5atk",
      "instructions":"Hang from a secure bar with an even overhand grip and your legs together. Set your shoulders, brace your trunk, and curl your pelvis as you raise your straight legs in front of you. Avoid swinging or leaning back, then lower slowly until your body returns to a controlled hang."
    },
    {
      "name":"Glute-Ham Raise","aliases":["GHR","Glute Ham Developer Raise"],
      "primary_muscle":"hamstrings","secondary_muscles":["glutes","calves","back"],
      "equipment":"machine","difficulty":"advanced","movement_pattern":"knee_flexion",
      "default_sets":3,"default_reps":"5-10","default_rest_seconds":90,
      "substitution_group":"hamstring_curl","sort_order":1126,"slug":"glute-ham-raise",
      "demo_url":"https://www.youtube.com/watch?v=cwaCdA9qFNI",
      "instructions":"Secure your ankles in a glute-ham developer with your knees supported just behind the pad. Start tall with your hips extended, then lower forward under control while keeping a straight line from knees to shoulders. Contract your hamstrings to return upright without folding at the hips or over-arching your lower back."
    },
    {
      "name":"Single-Leg Calf Raise","aliases":["Single Leg Heel Raise","Unilateral Calf Raise"],
      "primary_muscle":"calves","secondary_muscles":[],
      "equipment":"bodyweight","difficulty":"beginner","movement_pattern":"ankle_plantar_flexion",
      "default_sets":3,"default_reps":"10-20 each","default_rest_seconds":45,
      "substitution_group":"calf_raise","sort_order":1127,"slug":"single-leg-calf-raise",
      "demo_url":"https://www.youtube.com/watch?v=qkZZLWPAt-A",
      "instructions":"Stand on one foot with the ball of that foot supported and use a stable rail only as needed for balance. Lower your heel through a comfortable range, then press through your forefoot to rise as high as you can. Keep the knee and ankle aligned and lower slowly before the next repetition."
    }
  ]$exercises$::jsonb) as exercise(
    name text, aliases text[], primary_muscle text, secondary_muscles text[],
    equipment text, difficulty text, movement_pattern text, default_sets integer,
    default_reps text, default_rest_seconds integer, substitution_group text,
    sort_order integer, slug text, demo_url text, instructions text
  )
)
insert into public.exercise_library (
  name, aliases, primary_muscle, secondary_muscles, equipment, difficulty,
  movement_pattern, default_sets, default_reps, default_rest_seconds,
  substitution_group, image_url, demo_url, instructions, is_approved,
  is_active, sort_order
)
select
  name, aliases, primary_muscle, secondary_muscles, equipment, difficulty,
  movement_pattern, default_sets, default_reps, default_rest_seconds,
  substitution_group,
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-30/webp-768/' || slug || '.webp',
  demo_url, instructions, true, true, sort_order
from new_exercises
on conflict (lower(name)) do update set
  aliases = (
    select array_agg(distinct alias order by alias)
    from unnest(coalesce(public.exercise_library.aliases, '{}'::text[]) || excluded.aliases) as alias
  ),
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  equipment = excluded.equipment,
  difficulty = excluded.difficulty,
  movement_pattern = excluded.movement_pattern,
  default_sets = excluded.default_sets,
  default_reps = excluded.default_reps,
  default_rest_seconds = excluded.default_rest_seconds,
  substitution_group = excluded.substitution_group,
  image_url = excluded.image_url,
  demo_url = excluded.demo_url,
  instructions = excluded.instructions,
  is_approved = true,
  is_active = true,
  sort_order = excluded.sort_order,
  updated_at = now();
