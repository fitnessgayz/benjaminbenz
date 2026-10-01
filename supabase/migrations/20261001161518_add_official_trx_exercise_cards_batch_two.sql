-- Add a second reviewed batch of movements demonstrated by TRX on its
-- official YouTube channel. The suspension_trainer equipment value was added
-- by 20261001133436_add_burpee_trx_exercise_cards.sql.
with new_exercises as (
  select * from jsonb_to_recordset($exercises$
[
  {
    "name":"TRX Plank","slug":"trx-plank",
    "aliases":["Suspension Trainer Plank","Suspended Plank"],
    "primary_muscle":"core","secondary_muscles":["shoulders","chest","glutes"],
    "difficulty":"beginner","movement_pattern":"isometric_core","default_sets":3,
    "default_reps":"20-45 sec","default_rest_seconds":45,"substitution_group":"plank","sort_order":1166,
    "demo_url":"https://www.youtube.com/watch?v=nLgeqEtm49M",
    "instructions":"Secure both toes in the foot cradles and begin on the knees with the hands beneath the shoulders. Extend the legs into a straight high plank, brace the ribs and glutes, and hold without letting the hips sag or rotate."
  },
  {
    "name":"TRX Forearm Plank","slug":"trx-forearm-plank",
    "aliases":["Suspension Trainer Forearm Plank","Suspended Forearm Plank"],
    "primary_muscle":"core","secondary_muscles":["shoulders","glutes"],
    "difficulty":"beginner","movement_pattern":"isometric_core","default_sets":3,
    "default_reps":"20-45 sec","default_rest_seconds":45,"substitution_group":"plank","sort_order":1167,
    "demo_url":"https://www.youtube.com/watch?v=3CXvwTv9m6Q",
    "instructions":"Place both toes in the foot cradles and set the forearms parallel with elbows under the shoulders. Lift the knees, make one straight line from head to heels, and maintain a firm brace with level hips."
  },
  {
    "name":"TRX Kneeling Rollout","slug":"trx-kneeling-rollout",
    "aliases":["TRX Kneeling Fallout","Suspension Trainer Kneeling Rollout"],
    "primary_muscle":"core","secondary_muscles":["lats","shoulders"],
    "difficulty":"intermediate","movement_pattern":"anti_extension","default_sets":3,
    "default_reps":"8-12","default_rest_seconds":60,"substitution_group":"rollout","sort_order":1168,
    "demo_url":"https://www.youtube.com/watch?v=XQOYs0nurds",
    "instructions":"Kneel facing away from the anchor with one handle in each hand and the body tall. Reach the arms forward and overhead as the whole body leans from the knees, stop before the low back arches, then pull the arms down to return."
  },
  {
    "name":"TRX Standing Rollout","slug":"trx-standing-rollout",
    "aliases":["TRX Standing Fallout","Suspension Trainer Standing Rollout"],
    "primary_muscle":"core","secondary_muscles":["lats","shoulders"],
    "difficulty":"advanced","movement_pattern":"anti_extension","default_sets":3,
    "default_reps":"6-10","default_rest_seconds":75,"substitution_group":"rollout","sort_order":1169,
    "demo_url":"https://www.youtube.com/shorts/kUb7N9sJ-vo",
    "instructions":"Stand facing away from the anchor in a stable staggered stance with the handles at shoulder height. Keep the ribs down as the arms reach overhead and the body leans forward in one line, then drive the handles down to return without arching the back."
  },
  {
    "name":"TRX Side Plank","slug":"trx-side-plank",
    "aliases":["Suspension Trainer Side Plank","Suspended Side Plank"],
    "primary_muscle":"core","secondary_muscles":["obliques","shoulders","glutes"],
    "difficulty":"intermediate","movement_pattern":"lateral_core","default_sets":3,
    "default_reps":"20-40 sec each","default_rest_seconds":45,"substitution_group":"side_plank","sort_order":1170,
    "demo_url":"https://www.youtube.com/watch?v=eSTnnrM_xhc",
    "instructions":"Place both feet in the foot cradles and lie on one side with the supporting elbow directly beneath the shoulder. Lift the hips until the body forms one straight line, keep the feet stacked and straps taut, and hold without rolling forward."
  },
  {
    "name":"TRX Atomic Push-Up","slug":"trx-atomic-push-up",
    "aliases":["TRX Atomic Pushup","Suspension Trainer Atomic Push-Up"],
    "primary_muscle":"chest","secondary_muscles":["core","triceps","shoulders","hips"],
    "difficulty":"advanced","movement_pattern":"push_up_to_tuck","default_sets":3,
    "default_reps":"6-12","default_rest_seconds":75,"substitution_group":"push_up","sort_order":1171,
    "demo_url":"https://www.youtube.com/watch?v=Xc5b-MvKxQY",
    "instructions":"Start in a strong high plank with both toes secured in the foot cradles. Complete a controlled push-up, return to straight arms, draw both knees toward the chest without rounding excessively, then extend back to plank."
  },
  {
    "name":"TRX Modified Burpee","slug":"trx-modified-burpee",
    "aliases":["TRX Single-Leg Burpee","Suspension Trainer Modified Burpee"],
    "primary_muscle":"full_body","secondary_muscles":["quads","glutes","chest","core"],
    "difficulty":"intermediate","movement_pattern":"burpee","default_sets":3,
    "default_reps":"6-10 each","default_rest_seconds":75,"substitution_group":"burpee","sort_order":1172,
    "demo_url":"https://www.youtube.com/watch?v=rTwzW6EX-BY",
    "instructions":"Face away from the anchor with one foot secured in both foot cradles. Balance on the free leg, place both hands on the floor and extend into a supported single-leg plank, step or hop the free foot back under the body, then stand tall with control."
  },
  {
    "name":"TRX Single-Leg Hip Press","slug":"trx-single-leg-hip-press",
    "aliases":["TRX Single Leg Hip Press","Suspension Trainer Single-Leg Hip Press"],
    "primary_muscle":"glutes","secondary_muscles":["hamstrings","core"],
    "difficulty":"intermediate","movement_pattern":"hip_extension","default_sets":3,
    "default_reps":"8-12 each","default_rest_seconds":60,"substitution_group":"hip_thrust","sort_order":1173,
    "demo_url":"https://www.youtube.com/watch?v=hXhqE5EKyAE",
    "instructions":"Lie on the back with one heel in a foot cradle, the working knee bent, and the opposite knee drawn toward the chest. Drive the suspended heel down to lift the hips while keeping the pelvis level, then lower slowly without twisting."
  },
  {
    "name":"TRX Hip Press","slug":"trx-hip-press",
    "aliases":["Suspension Trainer Hip Press","TRX Suspended Bridge"],
    "primary_muscle":"glutes","secondary_muscles":["hamstrings","core"],
    "difficulty":"beginner","movement_pattern":"hip_extension","default_sets":3,
    "default_reps":"10-15","default_rest_seconds":60,"substitution_group":"hip_thrust","sort_order":1174,
    "demo_url":"https://www.youtube.com/watch?v=rpxi7xQ1xUs",
    "instructions":"Lie on the back with both heels centered in the foot cradles and knees bent about 90 degrees. Press through the heels to lift the hips until shoulders, hips, and knees align, pause with the pelvis level, then lower under control."
  },
  {
    "name":"TRX Sprinter Start","slug":"trx-sprinter-start",
    "aliases":["Suspension Trainer Sprinter Start","TRX Runner Start"],
    "primary_muscle":"quads","secondary_muscles":["glutes","calves","core"],
    "difficulty":"intermediate","movement_pattern":"knee_drive","default_sets":3,
    "default_reps":"8-12 each","default_rest_seconds":60,"substitution_group":"lunge","sort_order":1175,
    "demo_url":"https://www.youtube.com/watch?v=Nr-iGy-0IUk",
    "instructions":"Face away from the anchor, keep the handles beside the ribs, and lean forward in a split stance. Drive through the front foot as the rear knee travels forward and up, maintain the body angle and firm core, then return smoothly to the split stance."
  },
  {
    "name":"TRX Squat Jump","slug":"trx-squat-jump",
    "aliases":["TRX Jump Squat","Suspension Trainer Squat Jump"],
    "primary_muscle":"quads","secondary_muscles":["glutes","calves","core"],
    "difficulty":"intermediate","movement_pattern":"squat_jump","default_sets":3,
    "default_reps":"8-12","default_rest_seconds":75,"substitution_group":"squat_jump","sort_order":1176,
    "demo_url":"https://www.youtube.com/watch?v=japaBJ9xtS4",
    "instructions":"Face the anchor with light handle tension and sit into a squat while the knees track over the toes. Drive through the feet into a small vertical jump, land softly through the whole foot, and flow into the next controlled squat."
  },
  {
    "name":"TRX Body Saw","slug":"trx-body-saw",
    "aliases":["Suspension Trainer Body Saw","Suspended Body Saw"],
    "primary_muscle":"core","secondary_muscles":["shoulders","lats","glutes"],
    "difficulty":"intermediate","movement_pattern":"anti_extension","default_sets":3,
    "default_reps":"8-15","default_rest_seconds":60,"substitution_group":"plank","sort_order":1177,
    "demo_url":"https://www.youtube.com/watch?v=ClXC0_yNsoM",
    "instructions":"Begin in a forearm plank with both toes secured in the foot cradles and elbows beneath the shoulders. Keep the body rigid as the shoulders glide several inches behind the elbows, then pull forward to the start without letting the hips sag."
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
