-- Add eight source-verified exercises with original, diversity-reviewed FWB cards.
with new_exercises as (
  select *
  from jsonb_to_recordset($exercises$
  [
    {
      "name":"Hand-Release Push-Up","aliases":["Hand Release Push Up","HR Push-Up"],
      "primary_muscle":"chest","secondary_muscles":["triceps","shoulders","core"],
      "equipment":"bodyweight","difficulty":"intermediate","movement_pattern":"horizontal_push",
      "default_sets":3,"default_reps":"6-12","default_rest_seconds":60,
      "substitution_group":"push_up","sort_order":1096,"slug":"hand-release-push-up",
      "demo_url":"https://www.youtube.com/watch?v=K0e8omOJZ14",
      "instructions":"Begin in a strong high plank with your hands under your shoulders. Lower your chest and thighs to the floor as one unit, briefly lift both hands without losing trunk tension, then replace your palms and press the floor away to return to the plank. Keep your head, ribs, pelvis, and legs aligned throughout."
    },
    {
      "name":"Plank Row","aliases":["Renegade Row","Dumbbell Plank Row"],
      "primary_muscle":"back","secondary_muscles":["lats","biceps","core"],
      "equipment":"dumbbell","difficulty":"advanced","movement_pattern":"horizontal_pull",
      "default_sets":3,"default_reps":"6-10 each","default_rest_seconds":75,
      "substitution_group":"horizontal_pull","sort_order":1097,"slug":"plank-row",
      "demo_url":"https://www.youtube.com/watch?v=BSdf2Y4nfXY",
      "instructions":"Set two dumbbells under your shoulders and hold a high plank with your feet wider than hip-width. Brace your trunk and press firmly through one dumbbell while rowing the other toward your lower ribs. Keep your hips and shoulders square, lower the weight under control, and alternate sides."
    },
    {
      "name":"Bent-Over Fly","aliases":["Bent-Over Reverse Fly","Dumbbell Rear-Delt Fly"],
      "primary_muscle":"shoulders","secondary_muscles":["back"],
      "equipment":"dumbbell","difficulty":"beginner","movement_pattern":"horizontal_abduction",
      "default_sets":3,"default_reps":"10-15","default_rest_seconds":60,
      "substitution_group":"rear_delt","sort_order":1098,"slug":"bent-over-fly",
      "demo_url":"https://www.youtube.com/watch?v=R0TK2cWM96s",
      "instructions":"Hold a dumbbell in each hand, soften your knees, and hinge at your hips with a neutral spine. Let your arms hang beneath your shoulders with a slight elbow bend. Raise both weights out to the sides until your upper arms approach shoulder height, pause without shrugging, then lower slowly while keeping the same torso angle."
    },
    {
      "name":"Rotational Press","aliases":["Dumbbell Rotational Press","Pivot Press"],
      "primary_muscle":"shoulders","secondary_muscles":["core","glutes"],
      "equipment":"dumbbell","difficulty":"intermediate","movement_pattern":"rotational_press",
      "default_sets":3,"default_reps":"6-10 each","default_rest_seconds":60,
      "substitution_group":"rotational_power","sort_order":1099,"slug":"rotational-press",
      "demo_url":"https://www.youtube.com/watch?v=IwrtVPsaZAA",
      "instructions":"Stand in an athletic stance with one dumbbell racked at your shoulder. Drive from the floor, pivot through your feet, and rotate your hips and torso as you press the weight diagonally overhead. Finish tall with the arm stacked over the shoulder, then reverse the motion under control before repeating on the other side."
    },
    {
      "name":"Overhead Carry","aliases":["Kettlebell Overhead Carry","Single-Arm Overhead Carry"],
      "primary_muscle":"shoulders","secondary_muscles":["core","forearms"],
      "equipment":"other","difficulty":"intermediate","movement_pattern":"carry",
      "default_sets":3,"default_reps":"15-30 m each","default_rest_seconds":60,
      "substitution_group":"loaded_carry","sort_order":1100,"slug":"overhead-carry",
      "demo_url":"https://www.youtube.com/watch?v=HkRlHxxI1oI",
      "instructions":"Press a kettlebell or dumbbell overhead and stabilize it with a straight arm and neutral wrist. Keep your ribs stacked over your pelvis, shoulder blade supported, and neck relaxed. Walk with short controlled steps without leaning or letting the weight drift, then lower it safely and repeat on the opposite side."
    },
    {
      "name":"Cossack Squat","aliases":["Cossack Lunge","Deep Side Squat"],
      "primary_muscle":"adductors","secondary_muscles":["quads","glutes"],
      "equipment":"bodyweight","difficulty":"intermediate","movement_pattern":"lateral_squat",
      "default_sets":3,"default_reps":"6-10 each","default_rest_seconds":60,
      "substitution_group":"lateral_lunge","sort_order":1101,"slug":"cossack-squat",
      "demo_url":"https://www.youtube.com/watch?v=shYSWbqBJPM",
      "instructions":"Take a very wide stance with your toes turned out comfortably. Shift your weight over one leg and sit your hips down and back while that knee tracks over the toes. Keep the opposite leg long, heel planted, and toes lifted if comfortable. Push through the bent leg to return to center and repeat on the other side."
    },
    {
      "name":"Scapular Push-Up","aliases":["Scap Push-Up","Push-Up Plus"],
      "primary_muscle":"shoulders","secondary_muscles":["core"],
      "equipment":"bodyweight","difficulty":"beginner","movement_pattern":"scapular_protraction",
      "default_sets":3,"default_reps":"10-15","default_rest_seconds":45,
      "substitution_group":"scapular_control","sort_order":1102,"slug":"scapular-push-up",
      "demo_url":"https://www.youtube.com/watch?v=DQKayQOU5Pw",
      "instructions":"Hold a high plank with your elbows straight and your body rigid. Without bending your arms, allow your shoulder blades to move gently toward each other so your chest lowers a small amount. Push the floor away to spread the shoulder blades and lift the upper back, then repeat through a controlled range without shrugging."
    },
    {
      "name":"Kettlebell Swing","aliases":["Two-Hand Kettlebell Swing","Russian Kettlebell Swing"],
      "primary_muscle":"glutes","secondary_muscles":["hamstrings","core","shoulders"],
      "equipment":"other","difficulty":"intermediate","movement_pattern":"hinge",
      "default_sets":3,"default_reps":"10-20","default_rest_seconds":75,
      "substitution_group":"hip_hinge_power","sort_order":1103,"slug":"kettlebell-swing",
      "demo_url":"https://www.youtube.com/watch?v=1cVT3ee9mgU",
      "instructions":"Stand over a kettlebell, hinge at your hips, and grip the handle with both hands. Hike the bell high between your thighs while keeping your spine neutral, then drive your feet into the floor and snap your hips forward. Let the bell float to about chest height with relaxed straight arms, then guide it back into the next hinge."
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
