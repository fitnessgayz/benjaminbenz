-- Add the distinct exercise variations from branded-card batch 10 and point
-- every canonical record at its reviewed WebP. Batch 10 currently has verified
-- 480px assets; a later migration can promote these URLs after matching 768px
-- assets and PNG masters are published.
with new_exercises as (
  select *
  from jsonb_to_recordset($exercises$
  [
    {"name":"Heel-Elevated Goblet Squat","aliases":["Heel Elevated Goblet Squat","Heels Elevated Goblet Squat"],"primary_muscle":"quads","equipment":"dumbbell","movement_pattern":"squat","default_reps":"8-12","default_rest_seconds":90,"substitution_group":"squat","sort_order":401,"slug":"heel-elevated-goblet-squat"},
    {"name":"Heel-Elevated Barbell Squat","aliases":["Heel Elevated Barbell Squat","Heels Elevated Barbell Squat"],"primary_muscle":"quads","equipment":"barbell","movement_pattern":"squat","default_reps":"6-10","default_rest_seconds":120,"substitution_group":"squat","sort_order":402,"slug":"heel-elevated-barbell-squat"},
    {"name":"Half-Kneeling Cable Woodchop","aliases":["Kneeling Woodchop","Half Kneeling Woodchop"],"primary_muscle":"core","equipment":"cable","movement_pattern":"rotation","default_reps":"10-12 each","default_rest_seconds":60,"substitution_group":"core_rotation","sort_order":631,"slug":"half-kneeling-cable-woodchop"},
    {"name":"Single-Arm Dumbbell Chest Press","aliases":["Single Arm Dumbbell Chest Press","One-Arm Dumbbell Chest Press"],"primary_muscle":"chest","equipment":"dumbbell","movement_pattern":"horizontal_press","default_reps":"8-12 each","default_rest_seconds":90,"substitution_group":"horizontal_press","sort_order":21,"slug":"single-arm-dumbbell-chest-press"},
    {"name":"Alternating Dumbbell Chest Press","aliases":["Alternating Dumbbell Bench Press"],"primary_muscle":"chest","equipment":"dumbbell","movement_pattern":"horizontal_press","default_reps":"8-12 each","default_rest_seconds":90,"substitution_group":"horizontal_press","sort_order":22,"slug":"alternating-dumbbell-chest-press"},
    {"name":"Single-Leg Leg Press","aliases":["Single Leg Leg Press","Unilateral Leg Press"],"primary_muscle":"quads","equipment":"machine","movement_pattern":"single_leg_squat","default_reps":"8-12 each","default_rest_seconds":90,"substitution_group":"single_leg_squat","sort_order":421,"slug":"single-leg-leg-press"},
    {"name":"Wide-Grip Seated Cable Row","aliases":["Seated Cable Row - Wide Grip","Wide Grip Cable Row"],"primary_muscle":"back","equipment":"cable","movement_pattern":"horizontal_pull","default_reps":"8-12","default_rest_seconds":75,"substitution_group":"horizontal_pull","sort_order":141,"slug":"wide-grip-seated-cable-row"},
    {"name":"Narrow-Grip Seated Cable Row","aliases":["Seated Cable Row - Narrow Grip","Narrow Grip Cable Row"],"primary_muscle":"back","equipment":"cable","movement_pattern":"horizontal_pull","default_reps":"8-12","default_rest_seconds":75,"substitution_group":"horizontal_pull","sort_order":142,"slug":"narrow-grip-seated-cable-row"},
    {"name":"Underhand-Grip Seated Cable Row","aliases":["Seated Cable Row - Underhand Grip","Underhand Cable Row"],"primary_muscle":"back","equipment":"cable","movement_pattern":"horizontal_pull","default_reps":"8-12","default_rest_seconds":75,"substitution_group":"horizontal_pull","sort_order":143,"slug":"underhand-grip-seated-cable-row"},
    {"name":"Incline Bench Dumbbell Reverse Fly - Neutral Grip","aliases":["Incline Dumbbell Reverse Fly - Neutral Grip","Chest-Supported Reverse Fly - Neutral Grip"],"primary_muscle":"shoulders","equipment":"dumbbell","movement_pattern":"rear_delt_fly","default_reps":"10-15","default_rest_seconds":60,"substitution_group":"rear_delt","sort_order":181,"slug":"incline-bench-reverse-fly-neutral-grip"},
    {"name":"Incline Bench Dumbbell Reverse Fly - Overhand Grip","aliases":["Incline Dumbbell Reverse Fly - Overhand Grip","Chest-Supported Reverse Fly - Overhand Grip"],"primary_muscle":"shoulders","equipment":"dumbbell","movement_pattern":"rear_delt_fly","default_reps":"10-15","default_rest_seconds":60,"substitution_group":"rear_delt","sort_order":182,"slug":"incline-bench-reverse-fly-overhand-grip"},
    {"name":"EZ-Bar Biceps Curl","aliases":["EZ Bar Curl","Bicep Curl with EZ Curl Bar","Biceps Curl with EZ Curl Bar"],"primary_muscle":"biceps","equipment":"barbell","movement_pattern":"elbow_flexion","default_reps":"8-12","default_rest_seconds":60,"substitution_group":"biceps_curl","sort_order":251,"slug":"ez-bar-biceps-curl"},
    {"name":"Straight-Arm Lat Pulldown","aliases":["Straight Arm Lat Pulldown","Straight-Arm Cable Pulldown","Straight Arm Cable Pulldown"],"primary_muscle":"lats","equipment":"cable","movement_pattern":"shoulder_extension","default_reps":"10-15","default_rest_seconds":60,"substitution_group":"vertical_pull","sort_order":111,"slug":"straight-arm-lat-pulldown"},
    {"name":"Arnold Press","aliases":["Arnold Dumbbell Press"],"primary_muscle":"shoulders","equipment":"dumbbell","movement_pattern":"vertical_press","default_reps":"8-12","default_rest_seconds":90,"substitution_group":"vertical_press","sort_order":211,"slug":"arnold-press"},
    {"name":"Zottman Curl","aliases":["Dumbbell Zottman Curl"],"primary_muscle":"biceps","equipment":"dumbbell","movement_pattern":"elbow_flexion","default_reps":"8-12","default_rest_seconds":60,"substitution_group":"biceps_curl","sort_order":281,"slug":"zottman-curl"},
    {"name":"EZ-Bar Skull Crusher","aliases":["EZ Bar Skull Crusher","EZ-Bar Lying Triceps Extension"],"primary_muscle":"triceps","equipment":"barbell","movement_pattern":"elbow_extension","default_reps":"8-12","default_rest_seconds":60,"substitution_group":"triceps_extension","sort_order":321,"slug":"ez-bar-skull-crusher"},
    {"name":"Dumbbell Skull Crusher","aliases":["Dumbbell Lying Triceps Extension"],"primary_muscle":"triceps","equipment":"dumbbell","movement_pattern":"elbow_extension","default_reps":"8-12","default_rest_seconds":60,"substitution_group":"triceps_extension","sort_order":322,"slug":"dumbbell-skull-crusher"},
    {"name":"Wide Neutral-Grip Seated Cable Row","aliases":["Wide Neutral Grip Cable Row","Wide Neutral-Grip Cable Row","Seated Cable Row - Wide Neutral Grip"],"primary_muscle":"back","equipment":"cable","movement_pattern":"horizontal_pull","default_reps":"8-12","default_rest_seconds":75,"substitution_group":"horizontal_pull","sort_order":144,"slug":"wide-neutral-grip-cable-row"},
    {"name":"Barbell Front Squat","aliases":["Front Squat","Barbell Front-Squat"],"primary_muscle":"quads","equipment":"barbell","movement_pattern":"squat","default_reps":"6-10","default_rest_seconds":120,"substitution_group":"squat","sort_order":403,"slug":"barbell-front-squat"},
    {"name":"Dumbbell Front Squat","aliases":["Dumbbell Front-Squat","DB Front Squat"],"primary_muscle":"quads","equipment":"dumbbell","movement_pattern":"squat","default_reps":"8-12","default_rest_seconds":90,"substitution_group":"squat","sort_order":404,"slug":"dumbbell-front-squat"}
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
    slug text
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
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-480/' || slug || '.webp',
  true,
  true,
  sort_order
from new_exercises
on conflict (lower(name)) do update set
  aliases = (
    select array_agg(distinct alias order by alias)
    from unnest(public.exercise_library.aliases || excluded.aliases) as alias
  ),
  primary_muscle = excluded.primary_muscle,
  equipment = excluded.equipment,
  movement_pattern = excluded.movement_pattern,
  default_reps = excluded.default_reps,
  default_rest_seconds = excluded.default_rest_seconds,
  substitution_group = excluded.substitution_group,
  image_url = excluded.image_url,
  is_approved = true,
  is_active = true,
  sort_order = excluded.sort_order,
  updated_at = now();
