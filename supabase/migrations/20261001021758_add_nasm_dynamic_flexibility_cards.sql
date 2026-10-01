-- Add NASM-aligned dynamic and functional flexibility exercises. The coaching
-- copy is original and emphasizes controlled, pain-free warm-up movement.
with new_exercises as (
  select *
  from jsonb_to_recordset($exercises$
  [
    {
      "name":"Arm Circles",
      "aliases":["Arm Circle","Shoulder Arm Circles","Dynamic Arm Circles","Forward and Backward Arm Circles"],
      "primary_muscle":"shoulders",
      "equipment":"bodyweight",
      "movement_pattern":"mobility",
      "default_sets":1,
      "default_reps":"8-10 each direction",
      "substitution_group":"shoulder_mobility",
      "sort_order":868,
      "slug":"arm-circles",
      "instructions":"Stand tall with your ribs stacked over your pelvis and extend your arms comfortably to the sides. Make small controlled circles from the shoulder joints, gradually increasing the diameter without shrugging or arching your back. Complete the prescribed repetitions, reverse direction, and stay within a smooth pain-free range."
    },
    {
      "name":"Standing Hip Opener",
      "aliases":["Standing Hip Openers","Gate Opener","Open the Gate","Dynamic Hip Opener"],
      "primary_muscle":"hips",
      "equipment":"bodyweight",
      "movement_pattern":"mobility",
      "default_sets":1,
      "default_reps":"8-10 each",
      "substitution_group":"hip_mobility",
      "sort_order":869,
      "slug":"standing-hip-opener",
      "instructions":"Stand tall and use a stable support only as needed for balance. Lift one knee toward hip height without rounding your back, then rotate that thigh outward while keeping the pelvis level and the stance knee softly unlocked. Return through the same path with control, alternate sides, and avoid forcing the hip range."
    },
    {
      "name":"Front-to-Back Leg Swings",
      "aliases":["Front to Back Leg Swing","Forward and Backward Leg Swings","Sagittal Leg Swings","Dynamic Front Leg Swings"],
      "primary_muscle":"hips",
      "equipment":"bodyweight",
      "movement_pattern":"mobility",
      "default_sets":1,
      "default_reps":"10-15 each",
      "substitution_group":"hip_mobility",
      "sort_order":870,
      "slug":"front-to-back-leg-swings",
      "instructions":"Stand beside a stable support with your torso upright and pelvis square. Swing one mostly straight leg forward and backward from the hip using a small, controlled range. Keep the stance foot planted, ribs down, and movement free of bouncing or lower-back arching. Finish the repetitions, then switch legs."
    },
    {
      "name":"Lateral Leg Swings",
      "aliases":["Side-to-Side Leg Swings","Side to Side Leg Swing","Frontal Plane Leg Swings","Dynamic Lateral Leg Swing"],
      "primary_muscle":"hips",
      "equipment":"bodyweight",
      "movement_pattern":"mobility",
      "default_sets":1,
      "default_reps":"10-15 each",
      "substitution_group":"hip_mobility",
      "sort_order":871,
      "slug":"lateral-leg-swings",
      "instructions":"Face a stable support and hold it lightly with both hands. Keeping your torso tall and pelvis facing forward, swing one mostly straight leg across the front of your body and then out to the side. Use a controlled pain-free range, keep the stance knee soft, and avoid rotating the trunk. Complete both sides."
    },
    {
      "name":"Multiplanar Lunge With Reach",
      "aliases":["Multi-Planar Lunge With Reach","Multidirectional Lunge With Reach","Lunge Matrix With Reach","Three-Way Lunge With Reach"],
      "primary_muscle":"full_body",
      "equipment":"bodyweight",
      "movement_pattern":"mobility",
      "default_sets":1,
      "default_reps":"5-8 each direction",
      "substitution_group":"full_body_mobility",
      "sort_order":872,
      "slug":"multiplanar-lunge-with-reach",
      "instructions":"Stand tall, then step into a controlled forward, diagonal, or lateral lunge while reaching your arms in the direction of travel. Keep the stepping knee aligned with the middle toes, maintain a long spine, and push through the whole foot to return. Alternate sides and directions without rushing or forcing depth."
    },
    {
      "name":"Lateral Tube Walk",
      "aliases":["Lateral Band Walk","Side Band Walk","Mini-Band Lateral Walk","Resistance Band Side Steps"],
      "primary_muscle":"glutes",
      "equipment":"other",
      "movement_pattern":"mobility",
      "default_sets":1,
      "default_reps":"8-12 steps each",
      "substitution_group":"hip_mobility",
      "sort_order":873,
      "slug":"lateral-tube-walk",
      "instructions":"Place a loop band above your knees and settle into a shallow athletic squat with feet parallel. Brace your trunk and step sideways without letting either knee collapse inward. Follow with the trailing foot while keeping tension on the band rather than snapping the feet together. Complete the prescribed steps in both directions."
    },
    {
      "name":"Medicine Ball Chop and Lift",
      "aliases":["Medicine Ball Chop and Lift Exercise","Medicine Ball Diagonal Chop","Medicine Ball Lift and Chop","Diagonal Medicine Ball Lift"],
      "primary_muscle":"full_body",
      "equipment":"other",
      "movement_pattern":"mobility",
      "default_sets":1,
      "default_reps":"8-10 each",
      "substitution_group":"full_body_mobility",
      "sort_order":874,
      "slug":"medicine-ball-chop-and-lift",
      "instructions":"Hold a light medicine ball with both hands near the outside of one hip in a small squat. Stand and guide the ball diagonally across your body toward the opposite shoulder as your hips and rib cage rotate together. Reverse the path slowly, keep your spine long, and use control instead of momentum or throwing the ball."
    },
    {
      "name":"Push-Up With Rotation",
      "aliases":["Pushup With Rotation","Rotational Push-Up","T Push-Up","Push-Up to Side Plank"],
      "primary_muscle":"full_body",
      "equipment":"bodyweight",
      "movement_pattern":"mobility",
      "default_sets":1,
      "default_reps":"6-10 each",
      "substitution_group":"full_body_mobility",
      "sort_order":875,
      "slug":"push-up-with-rotation",
      "instructions":"Begin in a strong high plank and perform a controlled push-up within your available range. Return to the top, shift weight into one hand, and rotate into a side plank while reaching the opposite arm toward the ceiling. Keep hips lifted and shoulders stacked, return to plank, and alternate sides without rushing."
    }
  ]$exercises$::jsonb) as exercise(
    name text,
    aliases text[],
    primary_muscle text,
    equipment text,
    movement_pattern text,
    default_sets integer,
    default_reps text,
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
  'beginner',
  movement_pattern,
  default_sets,
  default_reps,
  20,
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
