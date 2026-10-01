-- Add eight source-verified exercises with original, diversity-reviewed FWB cards.
with new_exercises as (
  select *
  from jsonb_to_recordset($exercises$
  [
    {
      "name":"Farmer's Carry","aliases":["Farmers Carry","Farmer Walk","Farmers Walk","Bilateral Farmer Carry"],
      "primary_muscle":"full_body","secondary_muscles":["forearms","core","shoulders"],
      "equipment":"dumbbell","difficulty":"beginner","movement_pattern":"carry",
      "default_sets":3,"default_reps":"20-40 m","default_rest_seconds":60,
      "substitution_group":"loaded_carry","sort_order":1104,"slug":"farmers-carry",
      "demo_url":"https://www.youtube.com/watch?v=lLAw6fUccKA",
      "instructions":"Stand tall with a heavy dumbbell in each hand and your arms long at your sides. Brace your trunk, keep your shoulders level, and walk with short controlled steps. Keep the weights quiet and close to your body without leaning, shrugging, or letting them swing, then set them down with a controlled hinge."
    },
    {
      "name":"Dead Hang","aliases":["Passive Hang","Bar Hang","Two-Arm Hang"],
      "primary_muscle":"back","secondary_muscles":["forearms","shoulders","lats"],
      "equipment":"bodyweight","difficulty":"beginner","movement_pattern":"vertical_pull",
      "default_sets":3,"default_reps":"15-45 sec","default_rest_seconds":60,
      "substitution_group":"vertical_pull","sort_order":1105,"slug":"dead-hang",
      "demo_url":"https://www.youtube.com/watch?v=Ay_qvzYZfqE",
      "instructions":"Grip a secure pull-up bar with both hands and step or carefully lift your feet from the floor. Let your arms straighten while maintaining a comfortable, controlled shoulder position and steady breathing. Keep your ribs and pelvis stacked, avoid swinging, and finish by returning your feet to support before releasing the bar."
    },
    {
      "name":"Cable Hip Abduction","aliases":["Standing Cable Hip Abduction","Cable Leg Abduction","Cable Hip Abductor"],
      "primary_muscle":"hips","secondary_muscles":["glutes"],
      "equipment":"cable","difficulty":"beginner","movement_pattern":"hip_abduction",
      "default_sets":3,"default_reps":"10-15 each","default_rest_seconds":45,
      "substitution_group":"hip_abduction","sort_order":1106,"slug":"cable-hip-abduction",
      "demo_url":"https://www.youtube.com/watch?v=EHq78mQYLbI",
      "instructions":"Attach an ankle cuff to the low pulley and stand side-on with the working leg away from the machine. Hold the frame lightly, brace your trunk, and move the working leg out to the side without tilting your pelvis or torso. Pause briefly, then return under control without letting the weight stack slam."
    },
    {
      "name":"Cable Hip Adduction","aliases":["Standing Cable Hip Adduction","Cable Leg Adduction","Cable Hip Adductor"],
      "primary_muscle":"adductors","secondary_muscles":["hips"],
      "equipment":"cable","difficulty":"beginner","movement_pattern":"hip_adduction",
      "default_sets":3,"default_reps":"10-15 each","default_rest_seconds":45,
      "substitution_group":"hip_adduction","sort_order":1107,"slug":"cable-hip-adduction",
      "demo_url":"https://www.youtube.com/watch?v=EHq78mQYLbI",
      "instructions":"Attach an ankle cuff to the low pulley and stand side-on with the working leg nearest the machine. Begin with that leg slightly out to the side, keep your pelvis level, and draw it inward toward or just across the stance leg. Pause, then return slowly while keeping your torso still and the cable under tension."
    },
    {
      "name":"Band Pull-Apart","aliases":["Resistance Band Pull-Apart","Band Pull Apart","Banded Pull-Apart"],
      "primary_muscle":"shoulders","secondary_muscles":["back"],
      "equipment":"other","difficulty":"beginner","movement_pattern":"horizontal_abduction",
      "default_sets":3,"default_reps":"12-20","default_rest_seconds":45,
      "substitution_group":"rear_delt","sort_order":1108,"slug":"band-pull-apart",
      "demo_url":"https://www.youtube.com/watch?v=nMB_zabRo74",
      "instructions":"Hold a light resistance band at shoulder height with your arms extended and slight tension already in the band. Keep your ribs down and pull your hands apart by moving your shoulders and shoulder blades until the band approaches your chest. Pause without shrugging, then return slowly while keeping the band controlled."
    },
    {
      "name":"Wall Slide","aliases":["Wall Shoulder Slide","Wall Angel Slide","Scapular Wall Slide"],
      "primary_muscle":"shoulders","secondary_muscles":["back","core"],
      "equipment":"bodyweight","difficulty":"beginner","movement_pattern":"shoulder_flexion",
      "default_sets":3,"default_reps":"8-15","default_rest_seconds":45,
      "substitution_group":"shoulder_mobility","sort_order":1109,"slug":"wall-slide",
      "demo_url":"https://www.youtube.com/watch?v=D351y9ecIwc",
      "instructions":"Stand with your back against a wall, ribs gently stacked, and elbows bent with the backs of your arms toward the wall. Slide your arms upward through a comfortable range without arching your lower back or shrugging. Pause, then lower under control while maintaining smooth shoulder-blade motion."
    },
    {
      "name":"Landmine Squat","aliases":["Landmine Front Squat","Barbell Landmine Squat"],
      "primary_muscle":"quads","secondary_muscles":["glutes","core"],
      "equipment":"landmine","difficulty":"beginner","movement_pattern":"squat",
      "default_sets":3,"default_reps":"8-12","default_rest_seconds":75,
      "substitution_group":"squat","sort_order":1110,"slug":"landmine-squat",
      "demo_url":"https://www.youtube.com/watch?v=_mfORB47xMs",
      "instructions":"Lift the free end of an anchored landmine bar to chest height and cup the sleeve securely with both hands. Set your feet at a comfortable squat width, brace, and sit down between your hips while your knees track over your toes. Keep your chest tall, then drive through your whole foot to stand without pushing the bar away."
    },
    {
      "name":"Pendlay Row","aliases":["Pendlay Barbell Row","Dead-Stop Barbell Row","Dead Stop Row"],
      "primary_muscle":"back","secondary_muscles":["lats","biceps"],
      "equipment":"barbell","difficulty":"intermediate","movement_pattern":"horizontal_pull",
      "default_sets":3,"default_reps":"5-8","default_rest_seconds":90,
      "substitution_group":"horizontal_pull","sort_order":1111,"slug":"pendlay-row",
      "demo_url":"https://www.youtube.com/watch?v=h4nkoayPFWw",
      "instructions":"Set a loaded barbell on the floor, hinge until your torso is close to parallel, and take a firm overhand grip with a neutral spine. Brace, then row the bar from a dead stop toward your lower chest while keeping your torso angle fixed. Lower the bar under control to a complete stop, reset your brace, and repeat."
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
