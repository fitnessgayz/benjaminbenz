-- Add eight source-verified exercises with original, diversity-reviewed FWB cards.
with new_exercises as (
  select *
  from jsonb_to_recordset($exercises$
  [
    {
      "name":"Barbell Back Squat","aliases":["Back Squat","Barbell Squat","High-Bar Back Squat"],
      "primary_muscle":"quads","secondary_muscles":["glutes","hamstrings","core"],
      "equipment":"barbell","difficulty":"intermediate","movement_pattern":"squat",
      "default_sets":3,"default_reps":"5-10","default_rest_seconds":120,
      "substitution_group":"squat","sort_order":1112,"slug":"barbell-back-squat",
      "demo_url":"https://www.youtube.com/watch?v=UFs6E3Ti1jg",
      "instructions":"Set a bar securely across your upper back, brace your trunk, and stand with your feet at a comfortable squat width. Sit down between your hips while your knees track over your toes and your whole foot stays planted. Reach a controlled depth you can own, then drive the floor away to stand without letting your chest collapse."
    },
    {
      "name":"Barbell Overhead Press","aliases":["Standing Barbell Press","Military Press","Strict Press"],
      "primary_muscle":"shoulders","secondary_muscles":["triceps","core"],
      "equipment":"barbell","difficulty":"intermediate","movement_pattern":"vertical_push",
      "default_sets":3,"default_reps":"5-10","default_rest_seconds":90,
      "substitution_group":"overhead_press","sort_order":1113,"slug":"barbell-overhead-press",
      "demo_url":"https://www.youtube.com/watch?v=eNFXEEdfQp4",
      "instructions":"Stand tall with the bar at your upper chest, wrists stacked over your forearms, and elbows slightly in front of the bar. Brace your glutes and trunk, move your head just enough to clear a straight bar path, and press overhead. Finish with the bar over mid-foot and ribs controlled, then lower it smoothly to the start."
    },
    {
      "name":"Trap-Bar Deadlift","aliases":["Trap Bar Deadlift","Hex-Bar Deadlift","Hex Bar Deadlift"],
      "primary_muscle":"full_body","secondary_muscles":["glutes","hamstrings","quads","forearms"],
      "equipment":"other","difficulty":"beginner","movement_pattern":"hinge",
      "default_sets":3,"default_reps":"5-10","default_rest_seconds":120,
      "substitution_group":"deadlift","sort_order":1114,"slug":"trap-bar-deadlift",
      "demo_url":"https://www.youtube.com/watch?v=1a7WNMgKIZQ",
      "instructions":"Step into the center of the trap bar with your feet around hip-width. Hinge and bend your knees to grip both handles, brace your trunk, and pull the slack from your body before lifting. Push the floor away and stand tall with hips and knees extending together, then return the bar under control without rounding your spine."
    },
    {
      "name":"Push Press","aliases":["Barbell Push Press","Power Press"],
      "primary_muscle":"shoulders","secondary_muscles":["triceps","quads","glutes","core"],
      "equipment":"barbell","difficulty":"intermediate","movement_pattern":"vertical_push_power",
      "default_sets":3,"default_reps":"3-8","default_rest_seconds":90,
      "substitution_group":"overhead_press","sort_order":1115,"slug":"push-press",
      "demo_url":"https://www.youtube.com/watch?v=iaBVSJm78ko",
      "instructions":"Rack the bar across your shoulders with your torso upright. Make a short vertical dip by bending your knees and hips slightly, then drive hard through the floor to accelerate the bar upward. Finish the press with straight arms and the bar stacked overhead, then lower it under control and reset before the next rep."
    },
    {
      "name":"Reverse Hyperextension","aliases":["Reverse Hyper","Bench Reverse Hyperextension","Bodyweight Reverse Hyper"],
      "primary_muscle":"glutes","secondary_muscles":["hamstrings","back"],
      "equipment":"bench","difficulty":"intermediate","movement_pattern":"hip_extension",
      "default_sets":3,"default_reps":"10-15","default_rest_seconds":60,
      "substitution_group":"hip_extension","sort_order":1116,"slug":"reverse-hyperextension",
      "demo_url":"https://www.youtube.com/watch?v=Ef4noCz83A4",
      "instructions":"Lie face down with your torso supported and your hips near the edge of a stable bench or reverse-hyper pad. Hold the frame, brace your trunk, and squeeze your glutes to lift both legs until they align with your torso. Avoid swinging or over-arching your lower back, then lower your legs smoothly through the available range."
    },
    {
      "name":"Tibialis Raise","aliases":["Wall Tibialis Raise","Tib Raise","Toe Raise"],
      "primary_muscle":"calves","secondary_muscles":[],
      "equipment":"bodyweight","difficulty":"beginner","movement_pattern":"ankle_dorsiflexion",
      "default_sets":3,"default_reps":"15-25","default_rest_seconds":45,
      "substitution_group":"lower_leg","sort_order":1117,"slug":"tibialis-raise",
      "demo_url":"https://www.youtube.com/watch?v=boFuKPm5w2Q",
      "instructions":"Lean your back against a wall and place your feet several inches forward with your heels planted. Keeping your knees and hips still, lift the fronts of both feet and your toes toward your shins as high as you can control. Pause briefly, then lower your forefeet slowly without letting your heels leave the floor."
    },
    {
      "name":"Battle-Rope Alternating Waves","aliases":["Battle Rope Alternating Waves","Alternating Rope Waves","Battle Ropes"],
      "primary_muscle":"full_body","secondary_muscles":["shoulders","core","forearms"],
      "equipment":"other","difficulty":"intermediate","movement_pattern":"conditioning",
      "default_sets":4,"default_reps":"20-40 sec","default_rest_seconds":45,
      "substitution_group":"conditioning","sort_order":1118,"slug":"battle-rope-alternating-waves",
      "demo_url":"https://www.youtube.com/watch?v=uyaANzMXQHY",
      "instructions":"Stand in an athletic stance with one rope end in each hand and enough distance to create light tension. Brace your trunk and alternate lifting and lowering your hands quickly to send smooth waves toward the anchor. Keep your shoulders relaxed, knees soft, and rhythm even rather than pulling the ropes with your whole body."
    },
    {
      "name":"Seal Row","aliases":["Barbell Seal Row","Prone Barbell Row","Bench-Supported Barbell Row"],
      "primary_muscle":"back","secondary_muscles":["lats","biceps"],
      "equipment":"barbell","difficulty":"intermediate","movement_pattern":"horizontal_pull",
      "default_sets":3,"default_reps":"6-12","default_rest_seconds":75,
      "substitution_group":"horizontal_pull","sort_order":1119,"slug":"seal-row",
      "demo_url":"https://www.youtube.com/watch?v=Xq_C_USoHdk",
      "instructions":"Lie face down on a high flat bench with your chest and hips fully supported. Grip the bar below your shoulders, brace against the pad, and row it toward the underside of the bench or lower chest. Keep your legs quiet and avoid lifting your torso, then lower the bar until your arms are straight before repeating."
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
