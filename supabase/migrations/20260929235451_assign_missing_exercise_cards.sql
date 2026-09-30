-- Assign every reviewed branded exercise card to an exact canonical exercise.
-- Variations that differ by grip, equipment, stance, angle, or machine remain
-- distinct records. The 16 batch-10 cards whose 768px objects have not yet
-- been published intentionally use their verified live 480px WebPs.

with cards as (
  select *
  from jsonb_to_recordset($cards$
  [
    {"name":"45° Degree Glute Drive Machine","aliases":["45 Degree Glute Drive Machine"],"primary_muscle":"glutes","equipment":"machine","movement_pattern":"hip_extension","default_reps":"8-12","rest":90,"group_name":"hip_extension","sort_order":526,"slug":"45-degree-glute-drive-machine","size":"768"},
    {"name":"45° Degree Hip Extension","aliases":["45 Degree Hip Extension","45-Degree Hip Extension","45° Hip Extension"],"primary_muscle":"glutes","equipment":"machine","movement_pattern":"hip_extension","default_reps":"10-15","rest":60,"group_name":"hip_extension","sort_order":511,"slug":"45-degree-hip-extension","size":"768"},
    {"name":"45° Degree Lean Lateral Raise","aliases":["45 Degree Lean Lateral Raise"],"primary_muscle":"shoulders","equipment":"dumbbell","movement_pattern":"lateral_raise","default_reps":"10-15","rest":60,"group_name":"lateral_raise","sort_order":221,"slug":"45-degree-lean-lateral-raise","size":"768"},
    {"name":"Ab Coaster","aliases":[],"primary_muscle":"core","equipment":"machine","movement_pattern":"spinal_flexion","default_reps":"10-15","rest":60,"group_name":"core_flexion","sort_order":641,"slug":"ab-coaster","size":"768"},
    {"name":"Ab Wheel Rollout","aliases":[],"primary_muscle":"core","equipment":"other","movement_pattern":"anti_extension","default_reps":"8-12","rest":60,"group_name":"core_anti_extension","sort_order":621,"slug":"ab-wheel-rollout","size":"768"},
    {"name":"Alternating Dumbbell Chest Press","aliases":["Alternating Dumbbell Bench Press"],"primary_muscle":"chest","equipment":"dumbbell","movement_pattern":"horizontal_press","default_reps":"8-12 each","rest":90,"group_name":"horizontal_press","sort_order":22,"slug":"alternating-dumbbell-chest-press","size":"480"},
    {"name":"Arnold Press","aliases":["Arnold Dumbbell Press"],"primary_muscle":"shoulders","equipment":"dumbbell","movement_pattern":"vertical_press","default_reps":"8-12","rest":90,"group_name":"vertical_press","sort_order":211,"slug":"arnold-press","size":"480"},
    {"name":"Assisted Dip","aliases":[],"primary_muscle":"triceps","equipment":"machine","movement_pattern":"dip","default_reps":"8-12","rest":75,"group_name":"dip","sort_order":331,"slug":"assisted-dip","size":"768"},
    {"name":"Bicycle Kicks","aliases":[],"primary_muscle":"core","equipment":"bodyweight","movement_pattern":"rotation","default_reps":"12-20 each","rest":45,"group_name":"core_rotation","sort_order":635,"slug":"bicycle-kicks","size":"768"},
    {"name":"BOSU Push Up","aliases":[],"primary_muscle":"chest","equipment":"other","movement_pattern":"horizontal_press","default_reps":"8-15","rest":60,"group_name":"horizontal_press","sort_order":81,"slug":"bosu-push-up","size":"768"},
    {"name":"Cable Rotation","aliases":[],"primary_muscle":"core","equipment":"cable","movement_pattern":"rotation","default_reps":"10-12 each","rest":45,"group_name":"core_rotation","sort_order":633,"slug":"cable-rotation","size":"768"},
    {"name":"Cable Woodchop","aliases":[],"primary_muscle":"core","equipment":"cable","movement_pattern":"rotation","default_reps":"10-12 each","rest":60,"group_name":"core_rotation","sort_order":634,"slug":"cable-woodchop","size":"768"},
    {"name":"Decline Chest Press","aliases":[],"primary_muscle":"chest","equipment":"machine","movement_pattern":"decline_press","default_reps":"8-12","rest":90,"group_name":"horizontal_press","sort_order":51,"slug":"decline-chest-press","size":"768"},
    {"name":"Dumbbell Grave Digger","aliases":[],"primary_muscle":"core","equipment":"dumbbell","movement_pattern":"rotation","default_reps":"10-12 each","rest":60,"group_name":"core_rotation","sort_order":636,"slug":"dumbbell-grave-digger","size":"768"},
    {"name":"Dumbbell Skull Crusher","aliases":["Dumbbell Lying Triceps Extension"],"primary_muscle":"triceps","equipment":"dumbbell","movement_pattern":"elbow_extension","default_reps":"8-12","rest":60,"group_name":"triceps_extension","sort_order":322,"slug":"dumbbell-skull-crusher","size":"480"},
    {"name":"Dumbbell Step Up","aliases":[],"primary_muscle":"quads","equipment":"dumbbell","movement_pattern":"single_leg_squat","default_reps":"8-12 each","rest":90,"group_name":"single_leg_squat","sort_order":431,"slug":"dumbbell-step-up","size":"768"},
    {"name":"Dumbbell Triceps Kickback","aliases":[],"primary_muscle":"triceps","equipment":"dumbbell","movement_pattern":"elbow_extension","default_reps":"10-15","rest":60,"group_name":"triceps_extension","sort_order":323,"slug":"dumbbell-triceps-kickback","size":"768"},
    {"name":"EZ-Bar Biceps Curl","aliases":["EZ Bar Curl","Bicep Curl with EZ Curl Bar","Biceps Curl with EZ Curl Bar"],"primary_muscle":"biceps","equipment":"barbell","movement_pattern":"elbow_flexion","default_reps":"8-12","rest":60,"group_name":"biceps_curl","sort_order":251,"slug":"ez-bar-biceps-curl","size":"480"},
    {"name":"EZ-Bar Skull Crusher","aliases":["EZ Bar Skull Crusher","EZ-Bar Lying Triceps Extension"],"primary_muscle":"triceps","equipment":"barbell","movement_pattern":"elbow_extension","default_reps":"8-12","rest":60,"group_name":"triceps_extension","sort_order":321,"slug":"ez-bar-skull-crusher","size":"480"},
    {"name":"Frog Stretch","aliases":[],"primary_muscle":"adductors","equipment":"bodyweight","movement_pattern":"stretching","default_reps":"20-30 sec","rest":20,"group_name":"mobility","sort_order":841,"slug":"frog-stretch","size":"768"},
    {"name":"Glute Machine Bulgarian Split Squat","aliases":[],"primary_muscle":"glutes","equipment":"machine","movement_pattern":"single_leg_squat","default_reps":"8-12 each","rest":90,"group_name":"single_leg_squat","sort_order":432,"slug":"glute-machine-bulgarian-split-squat","size":"768"},
    {"name":"Half-Kneeling Cable Woodchop","aliases":["Kneeling Woodchop","Half Kneeling Woodchop"],"primary_muscle":"core","equipment":"cable","movement_pattern":"rotation","default_reps":"10-12 each","rest":60,"group_name":"core_rotation","sort_order":631,"slug":"half-kneeling-cable-woodchop","size":"480"},
    {"name":"Heel Elevated Squat","aliases":[],"primary_muscle":"quads","equipment":"bodyweight","movement_pattern":"squat","default_reps":"8-12","rest":90,"group_name":"squat","sort_order":400,"slug":"heel-elevated-squat","size":"768"},
    {"name":"Incline Barbell Bench Press","aliases":[],"primary_muscle":"chest","equipment":"barbell","movement_pattern":"incline_press","default_reps":"6-10","rest":120,"group_name":"incline_press","sort_order":31,"slug":"incline-barbell-bench-press","size":"768"},
    {"name":"Incline Bench Dumbbell Reverse Fly - Neutral Grip","aliases":["Incline Dumbbell Reverse Fly - Neutral Grip","Chest-Supported Reverse Fly - Neutral Grip"],"primary_muscle":"shoulders","equipment":"dumbbell","movement_pattern":"rear_delt_fly","default_reps":"10-15","rest":60,"group_name":"rear_delt","sort_order":181,"slug":"incline-bench-reverse-fly-neutral-grip","size":"480"},
    {"name":"Incline Bench Dumbbell Reverse Fly - Overhand Grip","aliases":["Incline Dumbbell Reverse Fly - Overhand Grip","Chest-Supported Reverse Fly - Overhand Grip"],"primary_muscle":"shoulders","equipment":"dumbbell","movement_pattern":"rear_delt_fly","default_reps":"10-15","rest":60,"group_name":"rear_delt","sort_order":182,"slug":"incline-bench-reverse-fly-overhand-grip","size":"480"},
    {"name":"Incline Dumbbell Fly","aliases":[],"primary_muscle":"chest","equipment":"dumbbell","movement_pattern":"chest_fly","default_reps":"10-15","rest":60,"group_name":"chest_fly","sort_order":63,"slug":"incline-dumbbell-fly","size":"768"},
    {"name":"Jesus Christ Curl","aliases":[],"primary_muscle":"biceps","equipment":"cable","movement_pattern":"elbow_flexion","default_reps":"10-15","rest":60,"group_name":"biceps_curl","sort_order":291,"slug":"jesus-christ-curl","size":"768"},
    {"name":"Jumping Jacks","aliases":[],"primary_muscle":"full_body","equipment":"bodyweight","movement_pattern":"conditioning","default_reps":"20-30","rest":30,"group_name":"conditioning","sort_order":900,"slug":"jumping-jacks","size":"768"},
    {"name":"Mountain Climber","aliases":[],"primary_muscle":"core","equipment":"bodyweight","movement_pattern":"conditioning","default_reps":"20-30 each","rest":30,"group_name":"conditioning","sort_order":901,"slug":"mountain-climber","size":"768"},
    {"name":"Narrow-Grip Seated Cable Row","aliases":["Seated Cable Row - Narrow Grip","Narrow Grip Cable Row"],"primary_muscle":"back","equipment":"cable","movement_pattern":"horizontal_pull","default_reps":"8-12","rest":75,"group_name":"horizontal_pull","sort_order":142,"slug":"narrow-grip-seated-cable-row","size":"480"},
    {"name":"One Dumbbell Bulgarian Split Squat","aliases":[],"primary_muscle":"quads","equipment":"dumbbell","movement_pattern":"single_leg_squat","default_reps":"8-12 each","rest":90,"group_name":"single_leg_squat","sort_order":433,"slug":"one-dumbbell-bulgarian-split-squat","size":"768"},
    {"name":"Pistol Squat","aliases":[],"primary_muscle":"quads","equipment":"bodyweight","movement_pattern":"single_leg_squat","default_reps":"5-10 each","rest":90,"group_name":"single_leg_squat","sort_order":434,"slug":"pistol-squat","size":"768"},
    {"name":"Romanian Deadlift","aliases":[],"primary_muscle":"hamstrings","equipment":"barbell","movement_pattern":"hinge","default_reps":"6-10","rest":120,"group_name":"hinge","sort_order":451,"slug":"romanian-deadlift","size":"768"},
    {"name":"Russian Twist","aliases":[],"primary_muscle":"core","equipment":"bodyweight","movement_pattern":"rotation","default_reps":"12-20 each","rest":45,"group_name":"core_rotation","sort_order":637,"slug":"russian-twist","size":"768"},
    {"name":"Seated Cable Fly","aliases":[],"primary_muscle":"chest","equipment":"cable","movement_pattern":"chest_fly","default_reps":"10-15","rest":60,"group_name":"chest_fly","sort_order":64,"slug":"seated-cable-fly","size":"768"},
    {"name":"Single-Arm Dumbbell Chest Press","aliases":["Single Arm Dumbbell Chest Press","One-Arm Dumbbell Chest Press"],"primary_muscle":"chest","equipment":"dumbbell","movement_pattern":"horizontal_press","default_reps":"8-12 each","rest":90,"group_name":"horizontal_press","sort_order":21,"slug":"single-arm-dumbbell-chest-press","size":"480"},
    {"name":"Single Leg Dumbbell RDL","aliases":[],"primary_muscle":"hamstrings","equipment":"dumbbell","movement_pattern":"hinge","default_reps":"8-12 each","rest":75,"group_name":"single_leg_hinge","sort_order":452,"slug":"single-leg-dumbbell-rdl","size":"768"},
    {"name":"Single Leg Hip Thrust","aliases":[],"primary_muscle":"glutes","equipment":"bodyweight","movement_pattern":"hip_extension","default_reps":"10-15 each","rest":60,"group_name":"hip_extension","sort_order":471,"slug":"single-leg-hip-thrust","size":"768"},
    {"name":"Single-Leg Leg Press","aliases":["Single Leg Leg Press","Unilateral Leg Press"],"primary_muscle":"quads","equipment":"machine","movement_pattern":"single_leg_squat","default_reps":"8-12 each","rest":90,"group_name":"single_leg_squat","sort_order":421,"slug":"single-leg-leg-press","size":"480"},
    {"name":"Sit Up","aliases":[],"primary_muscle":"core","equipment":"bodyweight","movement_pattern":"spinal_flexion","default_reps":"10-20","rest":45,"group_name":"core_flexion","sort_order":642,"slug":"sit-up","size":"768"},
    {"name":"Smith Machine Front Foot Elevated Split Squat","aliases":[],"primary_muscle":"quads","equipment":"smith_machine","movement_pattern":"single_leg_squat","default_reps":"8-12 each","rest":90,"group_name":"single_leg_squat","sort_order":435,"slug":"smith-machine-front-foot-elevated-split-squat","size":"768"},
    {"name":"Smith Machine Split Squat","aliases":[],"primary_muscle":"quads","equipment":"smith_machine","movement_pattern":"single_leg_squat","default_reps":"8-12 each","rest":90,"group_name":"single_leg_squat","sort_order":436,"slug":"smith-machine-split-squat","size":"768"},
    {"name":"Smith Machine Squat","aliases":[],"primary_muscle":"quads","equipment":"smith_machine","movement_pattern":"squat","default_reps":"8-12","rest":90,"group_name":"squat","sort_order":411,"slug":"smith-machine-squat","size":"768"},
    {"name":"Stability Ball Woodchop","aliases":[],"primary_muscle":"core","equipment":"other","movement_pattern":"rotation","default_reps":"10-12 each","rest":45,"group_name":"core_rotation","sort_order":638,"slug":"stability-ball-woodchop","size":"768"},
    {"name":"Standing Incline Cable Curl","aliases":[],"primary_muscle":"biceps","equipment":"cable","movement_pattern":"elbow_flexion","default_reps":"10-15","rest":60,"group_name":"biceps_curl","sort_order":292,"slug":"standing-incline-cable-curl","size":"768"},
    {"name":"Straight-Arm Lat Pulldown","aliases":["Straight Arm Lat Pulldown","Straight-Arm Cable Pulldown","Straight Arm Cable Pulldown"],"primary_muscle":"lats","equipment":"cable","movement_pattern":"shoulder_extension","default_reps":"10-15","rest":60,"group_name":"vertical_pull","sort_order":111,"slug":"straight-arm-lat-pulldown","size":"480"},
    {"name":"Two Dumbbell Bulgarian Split Squat","aliases":[],"primary_muscle":"quads","equipment":"dumbbell","movement_pattern":"single_leg_squat","default_reps":"8-12 each","rest":90,"group_name":"single_leg_squat","sort_order":437,"slug":"two-dumbbell-bulgarian-split-squat","size":"768"},
    {"name":"Underhand-Grip Seated Cable Row","aliases":["Seated Cable Row - Underhand Grip","Underhand Cable Row"],"primary_muscle":"back","equipment":"cable","movement_pattern":"horizontal_pull","default_reps":"8-12","rest":75,"group_name":"horizontal_pull","sort_order":143,"slug":"underhand-grip-seated-cable-row","size":"480"},
    {"name":"Walking Lunge","aliases":[],"primary_muscle":"quads","equipment":"bodyweight","movement_pattern":"single_leg_squat","default_reps":"10-16 each","rest":75,"group_name":"single_leg_squat","sort_order":438,"slug":"walking-lunge","size":"768"},
    {"name":"Wide-Grip Seated Cable Row","aliases":["Seated Cable Row - Wide Grip","Wide Grip Cable Row"],"primary_muscle":"back","equipment":"cable","movement_pattern":"horizontal_pull","default_reps":"8-12","rest":75,"group_name":"horizontal_pull","sort_order":141,"slug":"wide-grip-seated-cable-row","size":"480"},
    {"name":"Wide Neutral-Grip Seated Cable Row","aliases":["Wide Neutral Grip Cable Row","Wide Neutral-Grip Cable Row","Seated Cable Row - Wide Neutral Grip"],"primary_muscle":"back","equipment":"cable","movement_pattern":"horizontal_pull","default_reps":"8-12","rest":75,"group_name":"horizontal_pull","sort_order":144,"slug":"wide-neutral-grip-cable-row","size":"480"},
    {"name":"Zottman Curl","aliases":["Dumbbell Zottman Curl"],"primary_muscle":"biceps","equipment":"dumbbell","movement_pattern":"elbow_flexion","default_reps":"8-12","rest":60,"group_name":"biceps_curl","sort_order":281,"slug":"zottman-curl","size":"480"}
  ]$cards$::jsonb) as card(
    name text,
    aliases text[],
    primary_muscle text,
    equipment text,
    movement_pattern text,
    default_reps text,
    rest integer,
    group_name text,
    sort_order integer,
    slug text,
    size text
  )
)
insert into public.exercise_library (
  name, aliases, primary_muscle, equipment, difficulty, movement_pattern,
  default_sets, default_reps, default_rest_seconds, substitution_group,
  image_url, is_approved, is_active, sort_order
)
select
  name, aliases, primary_muscle, equipment, 'intermediate', movement_pattern,
  3, default_reps, rest, group_name,
  'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-' || size || '/' || slug || '.webp',
  true, true, sort_order
from cards
on conflict (lower(name)) do update set
  aliases = (
    select coalesce(array_agg(distinct alias order by alias), '{}'::text[])
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

-- Attach reviewed cards to the two canonical rows that already exist.
update public.exercise_library
set
  aliases = array[
    '45 Degree Back Extension',
    '45 Degree Back Extension - Glute Focus',
    'Back Ext Machine Glute Focused',
    'Back Extension (Glute Focus)',
    'Back Extension Glute Focus',
    'Dual 45 Degree Hip Extension',
    'Dual 45-Degree Hip Extension',
    'Dual 45° Hip Extension'
  ],
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/dual-45-hip-extension.webp',
  updated_at = now()
where lower(name) = lower('45-Degree Back Extension');

update public.exercise_library
set
  aliases = (
    select array_agg(distinct alias order by alias)
    from unnest(aliases || array['Pec Deck Fly','Machine Chest Fly','Machine Pec Fly']) as alias
  ),
  image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/pec-deck-fly.webp',
  updated_at = now()
where lower(name) = lower('Pec Deck Chest Fly');
