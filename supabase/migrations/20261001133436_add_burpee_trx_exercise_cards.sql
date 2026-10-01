-- Add the official TRX Suspension Trainer exercise set and attach the new
-- branded card to the existing Burpee record.
alter table public.exercise_library
  drop constraint if exists exercise_library_equipment_check;

alter table public.exercise_library
  add constraint exercise_library_equipment_check check (equipment in (
    'bodyweight', 'dumbbell', 'barbell', 'cable', 'machine',
    'smith_machine', 'bench', 'landmine', 'suspension_trainer', 'other'
  ));

update public.exercise_library
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-10-01/webp-768/burpee.webp',
    updated_at = now()
where lower(name) = 'burpee';

with new_exercises as (
  select * from jsonb_to_recordset($exercises$
[
  {
    "name":"TRX Mid Row",
    "slug":"trx-mid-row",
    "aliases":["TRX Row","Suspension Trainer Row","Suspension Row"],
    "primary_muscle":"back","secondary_muscles":["biceps","rear_delts","core"],
    "difficulty":"beginner","movement_pattern":"horizontal_pull","default_sets":3,
    "default_reps":"8-15","default_rest_seconds":60,"substitution_group":"row","sort_order":1146,
    "demo_url":"https://www.youtube.com/watch?v=7d8SbPUdHR0",
    "instructions":"Set the straps short and face the anchor with a handle in each hand. Lean back in one rigid line with the arms long, pull the chest toward the handles while keeping the elbows low, then lower under control without letting the hips sag."
  },
  {
    "name":"TRX Pull-Up",
    "slug":"trx-pull-up",
    "aliases":["TRX Pullup","Suspension Trainer Pull-Up","Suspension Pull-Up"],
    "primary_muscle":"back","secondary_muscles":["lats","biceps","shoulders"],
    "difficulty":"advanced","movement_pattern":"vertical_pull","default_sets":3,
    "default_reps":"6-12","default_rest_seconds":90,"substitution_group":"vertical_pull","sort_order":1147,
    "demo_url":"https://www.youtube.com/watch?v=fAQwN4t-2JI",
    "instructions":"Sit below the anchor with the straps over-shortened and both arms extended overhead. Keep the feet lightly grounded as needed, drive the elbows down to pull the chest upward until the chin clears the hands, then lower smoothly to full reach."
  },
  {
    "name":"TRX Squat to Y Fly",
    "slug":"trx-squat-to-y-fly",
    "aliases":["TRX Squat to Y-Fly","Suspension Squat to Y Fly"],
    "primary_muscle":"full_body","secondary_muscles":["quads","glutes","shoulders","back"],
    "difficulty":"beginner","movement_pattern":"squat_to_raise","default_sets":3,
    "default_reps":"8-12","default_rest_seconds":60,"substitution_group":"full_body","sort_order":1148,
    "demo_url":"https://www.youtube.com/watch?v=32SsJD-9UeQ",
    "instructions":"Face the anchor with long straps and sit into a controlled squat while the arms reach forward. Stand through the feet and pull the straight arms overhead into a wide Y without shrugging, then reverse both phases with control."
  },
  {
    "name":"TRX Push-Up",
    "slug":"trx-push-up",
    "aliases":["TRX Pushup","Suspension Trainer Push-Up","Suspended Push-Up"],
    "primary_muscle":"chest","secondary_muscles":["triceps","shoulders","core"],
    "difficulty":"intermediate","movement_pattern":"horizontal_press","default_sets":3,
    "default_reps":"8-15","default_rest_seconds":75,"substitution_group":"push_up","sort_order":1149,
    "demo_url":"https://www.youtube.com/watch?v=0FR4aqxb5XA",
    "instructions":"Place both toes securely in the foot cradles and form a rigid high plank with the hands under the shoulders. Lower the chest by bending the elbows about 45 degrees, then press back to straight arms without letting the hips rotate or sag."
  },
  {
    "name":"TRX Split Squat",
    "slug":"trx-split-squat",
    "aliases":["Suspension Trainer Split Squat","TRX Assisted Split Squat"],
    "primary_muscle":"quads","secondary_muscles":["glutes","hamstrings","core"],
    "difficulty":"beginner","movement_pattern":"single_leg_squat","default_sets":3,
    "default_reps":"8-12 each","default_rest_seconds":60,"substitution_group":"single_leg_squat","sort_order":1150,
    "demo_url":"https://www.youtube.com/watch?v=UVE3zNPMMY4",
    "instructions":"Face the anchor in a split stance with light tension on both handles. Keep the torso tall as the rear knee lowers and the front knee tracks over the toes, then drive through the full front foot to stand while using the straps only for balance."
  },
  {
    "name":"TRX Pistol Squat",
    "slug":"trx-pistol-squat",
    "aliases":["TRX Single-Leg Squat","Suspension Trainer Pistol Squat"],
    "primary_muscle":"quads","secondary_muscles":["glutes","hamstrings","core"],
    "difficulty":"intermediate","movement_pattern":"single_leg_squat","default_sets":3,
    "default_reps":"6-10 each","default_rest_seconds":75,"substitution_group":"single_leg_squat","sort_order":1151,
    "demo_url":"https://www.youtube.com/watch?v=LXHP1GS4OuU",
    "instructions":"Face the anchor with both handles and balance on one foot while extending the other leg forward. Sit the hips back into a controlled single-leg squat, keep the working knee aligned with the toes, and use only enough strap assistance to stand smoothly."
  },
  {
    "name":"TRX Chest Press",
    "slug":"trx-chest-press",
    "aliases":["Suspension Trainer Chest Press","TRX Standing Chest Press"],
    "primary_muscle":"chest","secondary_muscles":["triceps","shoulders","core"],
    "difficulty":"beginner","movement_pattern":"horizontal_press","default_sets":3,
    "default_reps":"8-15","default_rest_seconds":60,"substitution_group":"chest_press","sort_order":1152,
    "demo_url":"https://www.youtube.com/watch?v=i_45-JMoXg4",
    "instructions":"Face away from the anchor and lean forward in a rigid standing plank with the arms straight at chest height. Bend the elbows to lower the chest between the handles, keep the wrists neutral, then press back to the start without losing body alignment."
  },
  {
    "name":"TRX Mountain Climber",
    "slug":"trx-mountain-climber",
    "aliases":["TRX Mountain Climbers","Suspended Mountain Climber"],
    "primary_muscle":"core","secondary_muscles":["hips","shoulders","chest"],
    "difficulty":"intermediate","movement_pattern":"core_dynamic","default_sets":3,
    "default_reps":"10-20 each","default_rest_seconds":45,"substitution_group":"mountain_climber","sort_order":1153,
    "demo_url":"https://www.youtube.com/watch?v=wHLraop-0ZI",
    "instructions":"Secure both toes in the foot cradles and hold a strong high plank. Drive one knee toward the chest while the opposite leg stays long, switch legs without bouncing the hips, and keep the shoulders stacked over the hands."
  },
  {
    "name":"TRX Single-Arm Row",
    "slug":"trx-single-arm-row",
    "aliases":["TRX Single Arm Row","Suspension Trainer One-Arm Row"],
    "primary_muscle":"back","secondary_muscles":["biceps","core","forearms"],
    "difficulty":"intermediate","movement_pattern":"horizontal_pull","default_sets":3,
    "default_reps":"8-12 each","default_rest_seconds":60,"substitution_group":"single_arm_row","sort_order":1154,
    "demo_url":"https://www.youtube.com/watch?v=fZjzpiOJjpg",
    "instructions":"Set the straps to single-handle mode and face the anchor with a wide stable stance. Lower in a straight line by extending the working arm while resisting rotation, then pull the handle toward the ribs with the elbow low and shoulders square."
  },
  {
    "name":"TRX Biceps Curl",
    "slug":"trx-biceps-curl",
    "aliases":["TRX Bicep Curl","Suspension Trainer Biceps Curl"],
    "primary_muscle":"biceps","secondary_muscles":["forearms","core"],
    "difficulty":"beginner","movement_pattern":"elbow_flexion","default_sets":3,
    "default_reps":"8-15","default_rest_seconds":60,"substitution_group":"biceps_curl","sort_order":1155,
    "demo_url":"https://www.youtube.com/watch?v=AWJJxssRVDY",
    "instructions":"Face the anchor with palms up and lean back in one straight line while the arms extend at shoulder height. Keep the elbows high and fixed as the hands curl toward the temples, then straighten the arms slowly without dropping the hips."
  },
  {
    "name":"TRX Triceps Press",
    "slug":"trx-triceps-press",
    "aliases":["TRX Tricep Press","Suspension Trainer Triceps Press"],
    "primary_muscle":"triceps","secondary_muscles":["shoulders","core"],
    "difficulty":"intermediate","movement_pattern":"elbow_extension","default_sets":3,
    "default_reps":"8-15","default_rest_seconds":60,"substitution_group":"triceps_extension","sort_order":1156,
    "demo_url":"https://www.youtube.com/watch?v=0xn4N5XRN2o",
    "instructions":"Face away from the anchor in a firm forward-leaning plank with straight arms at eye level. Bend only the elbows so the hands move beside the temples, then extend the elbows to return without letting the upper arms or trunk collapse."
  },
  {
    "name":"TRX Chest Fly",
    "slug":"trx-chest-fly",
    "aliases":["TRX Chest Flye","TRX Chest Flys","Suspension Trainer Chest Fly"],
    "primary_muscle":"chest","secondary_muscles":["shoulders","core"],
    "difficulty":"intermediate","movement_pattern":"horizontal_adduction","default_sets":3,
    "default_reps":"8-12","default_rest_seconds":75,"substitution_group":"chest_fly","sort_order":1157,
    "demo_url":"https://www.youtube.com/watch?v=xpsTGTKyn8A",
    "instructions":"Face away from the anchor in a light forward body angle with the arms together at chest height. Open the arms slowly with a soft elbow bend while keeping the body rigid, then squeeze the chest to bring the handles together without clashing them."
  },
  {
    "name":"TRX Hamstring Curl",
    "slug":"trx-hamstring-curl",
    "aliases":["TRX Hamstring Curls","Suspension Trainer Hamstring Curl"],
    "primary_muscle":"hamstrings","secondary_muscles":["glutes","core"],
    "difficulty":"intermediate","movement_pattern":"knee_flexion","default_sets":3,
    "default_reps":"10-15","default_rest_seconds":60,"substitution_group":"hamstring_curl","sort_order":1158,
    "demo_url":"https://www.youtube.com/watch?v=RkEHyudfkyM",
    "instructions":"Lie on the back with both heels centered in the foot cradles and lift the hips into a bridge. Pull the heels toward the hips while keeping the knees parallel and hips elevated, then extend the legs slowly without resting the hips."
  },
  {
    "name":"TRX Triceps Kickback",
    "slug":"trx-triceps-kickback",
    "aliases":["TRX Tricep Kickback","Suspension Trainer Triceps Kickback"],
    "primary_muscle":"triceps","secondary_muscles":["core","forearms"],
    "difficulty":"intermediate","movement_pattern":"elbow_extension","default_sets":3,
    "default_reps":"8-12","default_rest_seconds":60,"substitution_group":"triceps_extension","sort_order":1159,
    "demo_url":"https://www.youtube.com/watch?v=0PV15OAETn8",
    "instructions":"Face the anchor in an offset stance with the arms beside the torso and elbows bent. Keep the upper arms pinned as the elbows extend and the hands press past the hips, then return slowly without letting the shoulders roll forward."
  },
  {
    "name":"TRX Clock Press",
    "slug":"trx-clock-press",
    "aliases":["Suspension Trainer Clock Press","TRX Clock Push-Up"],
    "primary_muscle":"chest","secondary_muscles":["shoulders","triceps","core"],
    "difficulty":"intermediate","movement_pattern":"horizontal_press","default_sets":3,
    "default_reps":"8-12 each","default_rest_seconds":75,"substitution_group":"chest_press","sort_order":1160,
    "demo_url":"https://www.youtube.com/watch?v=iAVxnRyqH7k",
    "instructions":"Face away from the anchor in a light forward angle with both arms extended. Bend one elbow toward the chest for a press while the opposite arm opens to the side for a fly, press both arms back together, and alternate sides without rotating the torso."
  },
  {
    "name":"TRX Pike",
    "slug":"trx-pike",
    "aliases":["Suspension Trainer Pike","Suspended Pike"],
    "primary_muscle":"core","secondary_muscles":["shoulders","hips"],
    "difficulty":"intermediate","movement_pattern":"core_flexion","default_sets":3,
    "default_reps":"8-15","default_rest_seconds":60,"substitution_group":"core_flexion","sort_order":1161,
    "demo_url":"https://www.youtube.com/watch?v=GzSdbUhYUuU",
    "instructions":"Place both toes securely in the cradles and begin in a rigid high plank. Keep the legs straight as the hips lift and the feet draw toward the hands, then lower the hips back to plank under control without sagging through the low back."
  },
  {
    "name":"TRX Power Pull",
    "slug":"trx-power-pull",
    "aliases":["Suspension Trainer Power Pull","TRX Rotational Power Pull"],
    "primary_muscle":"back","secondary_muscles":["core","biceps","shoulders"],
    "difficulty":"intermediate","movement_pattern":"rotational_pull","default_sets":3,
    "default_reps":"8-12 each","default_rest_seconds":60,"substitution_group":"rotational_pull","sort_order":1162,
    "demo_url":"https://www.youtube.com/watch?v=fFGhTpQHOBA",
    "instructions":"Use single-handle mode and face the anchor in a wide stance. Pull the working elbow to the ribs while the free arm reaches toward the anchor, then extend the working arm and rotate away as the free hand reaches toward the floor; reverse with control."
  },
  {
    "name":"TRX Suspended Lunge",
    "slug":"trx-suspended-lunge",
    "aliases":["TRX Lunge","Suspension Trainer Lunge","TRX Balance Lunge"],
    "primary_muscle":"quads","secondary_muscles":["glutes","hamstrings","core"],
    "difficulty":"advanced","movement_pattern":"single_leg_squat","default_sets":3,
    "default_reps":"8-12 each","default_rest_seconds":75,"substitution_group":"lunge","sort_order":1163,
    "demo_url":"https://www.youtube.com/watch?v=3lxfMuEI5CY",
    "instructions":"Face away from the anchor with the rear foot secured in both foot cradles and balance on the front leg. Lower the rear knee while the front knee tracks over the toes, keep the torso tall, then drive through the front foot to return to standing."
  },
  {
    "name":"TRX Squat",
    "slug":"trx-squat",
    "aliases":["Suspension Trainer Squat","TRX Assisted Squat"],
    "primary_muscle":"quads","secondary_muscles":["glutes","hamstrings","core"],
    "difficulty":"beginner","movement_pattern":"squat","default_sets":3,
    "default_reps":"12-20","default_rest_seconds":60,"substitution_group":"squat","sort_order":1164,
    "demo_url":"https://www.youtube.com/watch?v=DTXphTGYd0g",
    "instructions":"Face the anchor with the straps at mid length and elbows beneath the shoulders. Sit the hips down and back while the knees track over the toes and heels stay grounded, then drive through the feet to stand while using minimal arm assistance."
  },
  {
    "name":"TRX Lateral Lunge",
    "slug":"trx-lateral-lunge",
    "aliases":["TRX Side Lunge","Suspension Trainer Lateral Lunge"],
    "primary_muscle":"quads","secondary_muscles":["glutes","adductors","hamstrings"],
    "difficulty":"beginner","movement_pattern":"lateral_lunge","default_sets":3,
    "default_reps":"8-12 each","default_rest_seconds":60,"substitution_group":"lateral_lunge","sort_order":1165,
    "demo_url":"https://www.youtube.com/watch?v=brUcfm485ao",
    "instructions":"Face the anchor with both handles and start with the feet together. Step wide to one side, sit the hips back over the stepping leg while the opposite leg stays straight, then drive through the bent leg to return to center without pulling excessively on the straps."
  }
]
$exercises$::jsonb) as exercise(
    name text, slug text, aliases text[], primary_muscle text, secondary_muscles text[],
    difficulty text, movement_pattern text, default_sets integer, default_reps text,
    default_rest_seconds integer, substitution_group text, demo_url text,
    instructions text, sort_order integer
  )
)
insert into public.exercise_library (
  name, aliases, primary_muscle, secondary_muscles, equipment, difficulty,
  movement_pattern, default_sets, default_reps, default_rest_seconds,
  substitution_group, image_url, demo_url, instructions, is_approved, is_active, sort_order
)
select name, aliases, primary_muscle, secondary_muscles, 'suspension_trainer', difficulty,
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
