-- Add a focused mobility batch built around slow, active joint control.
-- CARs are performed only through a comfortable, pain-free range and do not
-- replace individualized medical or rehabilitation guidance.
with new_exercises as (
  select *
  from jsonb_to_recordset($exercises$
  [
    {
      "name":"Quadruped Hip CARs",
      "aliases":["Hip CARs","Hip CAR","Hip Controlled Articular Rotations","Quadruped Hip Controlled Articular Rotations"],
      "primary_muscle":"hips",
      "default_reps":"2-3 each direction",
      "substitution_group":"hip_mobility",
      "sort_order":718,
      "slug":"quadruped-hip-cars",
      "instructions":"Begin on hands and knees with your spine neutral and pelvis square. Create gentle full-body tension, then draw one knee toward your chest. Without moving your trunk, guide the knee out to the side, rotate the thigh, and sweep it behind you to complete the largest smooth circle you can control. Reverse the path. Move slowly, avoid momentum, and reduce the circle if you feel pinching or pain."
    },
    {
      "name":"Standing Shoulder CARs",
      "aliases":["Shoulder CARs","Shoulder CAR","Shoulder Controlled Articular Rotations","Standing Shoulder Controlled Articular Rotations"],
      "primary_muscle":"shoulders",
      "default_reps":"2-3 each direction",
      "substitution_group":"shoulder_mobility",
      "sort_order":719,
      "slug":"standing-shoulder-cars",
      "instructions":"Stand tall with your ribs stacked and one arm straight at your side. Reach the arm forward and overhead while keeping the elbow straight. Rotate the upper arm as you continue the circle behind you, then return to the start without arching, leaning, or shrugging. Reverse direction and use only a smooth, pain-free range you can control."
    },
    {
      "name":"Scapular CARs",
      "aliases":["Scapula CARs","Scapular CAR","Scapular Controlled Articular Rotations","Shoulder Blade CARs"],
      "primary_muscle":"shoulders",
      "default_reps":"3-5 each direction",
      "substitution_group":"scapular_mobility",
      "sort_order":720,
      "slug":"scapular-cars",
      "instructions":"Stand tall with both arms straight forward at shoulder height. Keeping your elbows locked and ribs still, glide your shoulder blades forward, upward, backward, and downward to trace a controlled circle. Keep your neck relaxed and do not bend your elbows or swing your arms. Reverse direction and stay within a comfortable range."
    },
    {
      "name":"Cervical CARs",
      "aliases":["Neck CARs","Cervical CAR","Cervical Controlled Articular Rotations","Neck Controlled Articular Rotations"],
      "primary_muscle":"neck",
      "default_reps":"2-3 each direction",
      "substitution_group":"neck_mobility",
      "sort_order":721,
      "slug":"cervical-cars",
      "instructions":"Sit or stand tall with your shoulders level. Gently tuck your chin, then slowly sweep one ear toward the same-side shoulder, rotate your gaze upward, and continue the circle to the other side before returning to the start. Keep your torso still and use a small, comfortable range. Never force the neck; stop if you feel pain, dizziness, numbness, or tingling."
    },
    {
      "name":"Thoracic CARs",
      "aliases":["Upper Back CARs","Thoracic CAR","Thoracic Controlled Articular Rotations","Seated Thoracic CARs"],
      "primary_muscle":"back",
      "default_reps":"2-3 each direction",
      "substitution_group":"spine_mobility",
      "sort_order":722,
      "slug":"thoracic-cars",
      "instructions":"Sit tall with your knees together, pelvis still, and arms crossed over your chest. Slowly flex your upper back, side-bend, rotate, and extend to trace a controlled circle through your rib cage. Keep the motion above your low back and avoid shifting your hips. Reverse direction and reduce the range if you cannot keep the pelvis still or if the movement is painful."
    },
    {
      "name":"Knee CARs",
      "aliases":["Knee CAR","Knee Controlled Articular Rotations","Seated Knee CARs"],
      "primary_muscle":"quads",
      "default_reps":"3-5 each direction",
      "substitution_group":"knee_mobility",
      "sort_order":723,
      "slug":"knee-cars",
      "instructions":"Sit tall and hold behind one thigh so the hip stays still. With the knee bent, gently rotate the shin inward, extend the knee without locking it, rotate the shin outward, and bend the knee to return. Keep the ankle relaxed and make the movement slow and controlled. Use a small, pain-free range and never force rotation through the knee."
    },
    {
      "name":"Ankle CARs",
      "aliases":["Ankle CAR","Ankle Controlled Articular Rotations","Seated Ankle CARs"],
      "primary_muscle":"calves",
      "default_reps":"3-5 each direction",
      "substitution_group":"ankle_mobility",
      "sort_order":724,
      "slug":"ankle-cars",
      "instructions":"Sit and support one thigh so the knee and shin remain still. Pull the toes up, turn the sole inward, point the foot down, and turn the sole outward to trace the largest smooth circle available at the ankle. Keep the toes relaxed rather than drawing the circle with them. Reverse direction and avoid any range that causes pinching or pain."
    },
    {
      "name":"Wrist CARs",
      "aliases":["Wrist CAR","Wrist Controlled Articular Rotations","Wrist Circles"],
      "primary_muscle":"forearms",
      "default_reps":"3-5 each direction",
      "substitution_group":"wrist_mobility",
      "sort_order":725,
      "slug":"wrist-cars",
      "instructions":"Hold your elbows at your sides with your forearms still and make gentle fists. Slowly move the wrists through flexion, side-bending, extension, and the opposite side-bending to draw a controlled circle. Do not rotate the forearms or let the elbows drift. Reverse direction and use only a comfortable, pain-free range."
    }
  ]$exercises$::jsonb) as exercise(
    name text,
    aliases text[],
    primary_muscle text,
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
  'bodyweight',
  'beginner',
  'mobility',
  1,
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
