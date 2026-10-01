-- Add the next reviewed set of missing strength and movement exercises. Demo
-- links point to the official publisher uploads; artwork is original FWB media.
with new_exercises as (
  select *
  from jsonb_to_recordset($exercises$
  [
    {
      "name":"Dumbbell Pullover",
      "aliases":["DB Pullover","Bench Dumbbell Pullover"],
      "primary_muscle":"lats",
      "secondary_muscles":["chest","triceps"],
      "equipment":"dumbbell",
      "difficulty":"intermediate",
      "movement_pattern":"shoulder_extension",
      "default_sets":3,
      "default_reps":"8-12",
      "default_rest_seconds":75,
      "substitution_group":"lat_isolation",
      "sort_order":1088,
      "slug":"dumbbell-pullover",
      "demo_url":"https://www.youtube.com/watch?v=jQjWlIwG4sI",
      "instructions":"Lie on a flat bench with both feet planted and hold one dumbbell securely above your chest with both hands. Keep a slight bend in your elbows and lower the weight in an arc behind your head only as far as you can keep your ribs controlled. Pull the dumbbell back over your chest without changing the elbow angle or arching your lower back."
    },
    {
      "name":"Meadows Row",
      "aliases":["Landmine Meadows Row","Single-Arm Landmine Row"],
      "primary_muscle":"back",
      "secondary_muscles":["lats","biceps"],
      "equipment":"barbell",
      "difficulty":"intermediate",
      "movement_pattern":"horizontal_pull",
      "default_sets":3,
      "default_reps":"8-12 each",
      "default_rest_seconds":75,
      "substitution_group":"horizontal_pull",
      "sort_order":1089,
      "slug":"meadows-row",
      "demo_url":"https://www.youtube.com/watch?v=j-H6OxNlhi8",
      "instructions":"Stand beside the loaded end of a landmine bar with a staggered stance. Hinge at your hips, brace your free hand on your thigh, and grip the sleeve with the working arm extended. Row the bar toward your lower ribs by driving your elbow back, keep your torso stable, then lower the weight under control to a full comfortable reach."
    },
    {
      "name":"Turkish Get-Up",
      "aliases":["Kettlebell Turkish Get-Up","Turkish Get Up"],
      "primary_muscle":"full_body",
      "secondary_muscles":["shoulders","core","glutes"],
      "equipment":"other",
      "difficulty":"advanced",
      "movement_pattern":"ground_to_stand",
      "default_sets":3,
      "default_reps":"1-3 each",
      "default_rest_seconds":90,
      "substitution_group":"full_body_stability",
      "sort_order":1090,
      "slug":"turkish-get-up",
      "demo_url":"https://www.youtube.com/watch?v=jFK8FOiLa_M",
      "instructions":"Begin on your back with the kettlebell locked over one shoulder, the same-side knee bent, and the opposite arm and leg extended. Keep your eyes on the bell as you roll to the opposite elbow and hand, bridge and sweep the straight leg underneath, then rise through a half-kneeling position to stand. Reverse each step slowly while keeping the bell stacked over the shoulder."
    },
    {
      "name":"Tall-Kneeling Pallof Press",
      "aliases":["Tall Kneeling Pallof Press","Kneeling Anti-Rotation Press"],
      "primary_muscle":"core",
      "secondary_muscles":["glutes","shoulders"],
      "equipment":"cable",
      "difficulty":"intermediate",
      "movement_pattern":"anti_rotation",
      "default_sets":3,
      "default_reps":"8-12 each",
      "default_rest_seconds":60,
      "substitution_group":"anti_rotation",
      "sort_order":1091,
      "slug":"tall-kneeling-pallof-press",
      "demo_url":"https://www.youtube.com/watch?v=tYsV8_X3vtw",
      "instructions":"Kneel tall with your hips extended and your body side-on to a cable or anchored band. Hold the handle at your sternum, squeeze your glutes, and stack your ribs over your pelvis. Press your hands straight forward without letting your torso rotate, pause at full reach, then return the handle slowly and repeat on both sides."
    },
    {
      "name":"Bear Crawl",
      "aliases":["Forward Bear Crawl","Quadruped Bear Crawl"],
      "primary_muscle":"full_body",
      "secondary_muscles":["core","shoulders","quads"],
      "equipment":"bodyweight",
      "difficulty":"intermediate",
      "movement_pattern":"locomotion",
      "default_sets":3,
      "default_reps":"10-20 m",
      "default_rest_seconds":60,
      "substitution_group":"quadruped_core",
      "sort_order":1092,
      "slug":"bear-crawl",
      "demo_url":"https://www.youtube.com/watch?v=ZnYa6e_MCvQ",
      "instructions":"Start on hands and knees with your hands under your shoulders and knees under your hips. Brace your trunk and lift your knees just off the floor. Move one hand and the opposite foot forward together, then alternate sides while keeping your hips low, back level, and steps short and controlled."
    },
    {
      "name":"Forward Step-Down",
      "aliases":["Forward Step Down","Front Step-Down","Heel Tap Step-Down"],
      "primary_muscle":"quads",
      "secondary_muscles":["glutes","calves"],
      "equipment":"bodyweight",
      "difficulty":"intermediate",
      "movement_pattern":"single_leg_squat",
      "default_sets":3,
      "default_reps":"8-12 each",
      "default_rest_seconds":60,
      "substitution_group":"single_leg_squat",
      "sort_order":1093,
      "slug":"forward-step-down",
      "demo_url":"https://www.youtube.com/watch?v=B3CjUyMouBA",
      "instructions":"Stand on one foot near the front edge of a low step with the other leg reaching forward. Keep your pelvis level and slowly bend the stance knee to lower the free heel toward the floor. Lightly tap if appropriate, keep the stance knee tracking over the toes, then drive through the planted foot to return to the top."
    },
    {
      "name":"Lateral Lunge",
      "aliases":["Side Lunge","Side-to-Side Lunge"],
      "primary_muscle":"quads",
      "secondary_muscles":["glutes","adductors"],
      "equipment":"bodyweight",
      "difficulty":"beginner",
      "movement_pattern":"lateral_lunge",
      "default_sets":3,
      "default_reps":"8-12 each",
      "default_rest_seconds":60,
      "substitution_group":"lateral_lunge",
      "sort_order":1094,
      "slug":"lateral-lunge",
      "demo_url":"https://www.youtube.com/watch?v=tVqYQkAYabo",
      "instructions":"Stand tall, then take a wide step to one side. Sit your hips back over the stepping leg while that knee tracks in line with the toes and the opposite leg stays long. Keep both feet planted and your chest controlled, then push through the bent-leg foot to return to standing and repeat on the other side."
    },
    {
      "name":"Single-Leg Glute Bridge",
      "aliases":["Single Leg Glute Bridge","Unilateral Glute Bridge"],
      "primary_muscle":"glutes",
      "secondary_muscles":["hamstrings","core"],
      "equipment":"bodyweight",
      "difficulty":"intermediate",
      "movement_pattern":"hip_extension",
      "default_sets":3,
      "default_reps":"8-12 each",
      "default_rest_seconds":60,
      "substitution_group":"glute_bridge",
      "sort_order":1095,
      "slug":"single-leg-glute-bridge",
      "demo_url":"https://www.youtube.com/watch?v=hpLQEPdqUXM",
      "instructions":"Lie on your back with one knee bent and that foot planted while the other leg extends. Brace your trunk and drive through the planted heel to lift your hips until your torso and thigh form a straight line. Keep your pelvis level, squeeze the working glute, then lower slowly without rotating and repeat on the other side."
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
