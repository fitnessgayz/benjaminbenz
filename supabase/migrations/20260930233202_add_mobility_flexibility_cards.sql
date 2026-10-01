-- Add non-duplicative mobility and flexibility movements with reviewed,
-- versioned branded cards and concise coaching instructions.
alter table public.exercise_library
  drop constraint if exists exercise_library_primary_muscle_check;

alter table public.exercise_library
  add constraint exercise_library_primary_muscle_check check (primary_muscle in (
    'chest', 'back', 'lats', 'shoulders', 'biceps', 'triceps', 'quads',
    'hamstrings', 'glutes', 'calves', 'core', 'adductors', 'full_body',
    'hips', 'neck', 'forearms'
  ));

with new_exercises as (
  select *
  from jsonb_to_recordset($exercises$
  [
    {
      "name":"90/90 Hip Switch",
      "aliases":["90-90 Hip Switch","90/90 Hip Rotation","Seated 90/90 Hip Switch"],
      "primary_muscle":"hips",
      "movement_pattern":"mobility",
      "default_reps":"6-10 each",
      "substitution_group":"hip_mobility",
      "sort_order":712,
      "slug":"90-90-hip-switch",
      "instructions":"Sit tall in a true 90/90 position with the front and rear knees each bent about 90 degrees. Keep your hands off the floor and create full-body tension. Slowly rotate both hips to the opposite 90/90 position without using momentum or twisting through your lower back. Use only the active range you can control."
    },
    {
      "name":"World's Greatest Stretch",
      "aliases":["Worlds Greatest Stretch","Lunge With Thoracic Rotation","Runner's Lunge With Rotation"],
      "primary_muscle":"hips",
      "movement_pattern":"stretching",
      "default_reps":"5-8 each",
      "substitution_group":"full_body_flexibility",
      "sort_order":713,
      "slug":"worlds-greatest-stretch",
      "instructions":"Step into a long lunge and place both hands inside the front foot. Keep your back leg long and your front knee aligned over your foot. Rotate your chest toward the front knee and reach the same-side arm upward, then return your hand to the floor and repeat with control."
    },
    {
      "name":"Thread the Needle",
      "aliases":["Thread-the-Needle Stretch","Quadruped Thread the Needle","Thread the Needle Thoracic Rotation"],
      "primary_muscle":"back",
      "movement_pattern":"stretching",
      "default_reps":"6-10 each",
      "substitution_group":"spine_mobility",
      "sort_order":714,
      "slug":"thread-the-needle",
      "instructions":"Begin on your hands and knees with your spine neutral. Slide one arm palm-up beneath the opposite arm as your shoulder and side of your head move toward the floor. Keep your hips over your knees, pause in the rotation, then press back to the starting position."
    },
    {
      "name":"Kneeling Ankle Mobilization",
      "aliases":["Half-Kneeling Ankle Mobilization","Knee-to-Wall Ankle Mobilization","Kneeling Ankle Dorsiflexion Mobilization"],
      "primary_muscle":"calves",
      "movement_pattern":"stretching",
      "default_reps":"8-12 each",
      "substitution_group":"ankle_mobility",
      "sort_order":715,
      "slug":"kneeling-ankle-mobilization",
      "instructions":"Start half-kneeling with the entire front foot flat and pointing forward. Keeping the heel down and arch controlled, guide the front knee forward over the second and third toes. Move only as far as you can without the heel lifting or the knee collapsing inward, then return slowly."
    },
    {
      "name":"Child's Pose",
      "aliases":["Childs Pose","Balasana","Kneeling Child's Pose"],
      "primary_muscle":"back",
      "movement_pattern":"stretching",
      "default_reps":"30-60 sec",
      "substitution_group":"spine_mobility",
      "sort_order":716,
      "slug":"childs-pose",
      "instructions":"Kneel with your knees comfortably apart and your toes together. Sit your hips back toward your heels as you reach both arms forward and lower your torso between your thighs. Relax your shoulders and breathe steadily without forcing your hips or forehead to the floor."
    },
    {
      "name":"Downward-Facing Dog",
      "aliases":["Downward Facing Dog","Downward Dog","Adho Mukha Svanasana"],
      "primary_muscle":"hamstrings",
      "movement_pattern":"stretching",
      "default_reps":"30-60 sec",
      "substitution_group":"full_body_flexibility",
      "sort_order":717,
      "slug":"downward-facing-dog",
      "instructions":"Begin on your hands and knees with your toes tucked. Press through your hands and lift your hips up and back, lengthening your spine into an inverted V. Keep a soft bend in your knees if needed, relax your head between your arms, and reach your heels toward the floor without forcing them down."
    }
  ]$exercises$::jsonb) as exercise(
    name text,
    aliases text[],
    primary_muscle text,
    movement_pattern text,
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
  movement_pattern,
  2,
  default_reps,
  30,
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
