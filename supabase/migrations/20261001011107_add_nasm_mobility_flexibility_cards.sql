-- Add a second mobility/flexibility batch aligned with NASM's flexibility
-- continuum: self-myofascial release, static stretching, and dynamic mobility.
with new_exercises as (
  select *
  from jsonb_to_recordset($exercises$
  [
    {
      "name":"Foam Roll Adductors",
      "aliases":["Adductor Foam Roll","Foam Roll Inner Thigh","Inner Thigh Foam Rolling"],
      "primary_muscle":"adductors",
      "equipment":"other",
      "movement_pattern":"recovery",
      "default_sets":1,
      "default_reps":"30-60 sec each",
      "substitution_group":"adductor_recovery",
      "sort_order":860,
      "slug":"foam-roll-adductors",
      "demo_url":"https://www.youtube.com/watch?v=Nqol0T6rKDg",
      "instructions":"Lie face-down on your forearms with one hip opened to the side and that knee bent. Place the foam roller perpendicular beneath the inner thigh. Slowly shift from just below the groin toward just above the knee, never rolling across the knee joint. Use moderate pressure, pause briefly on tender areas, breathe normally, and repeat on the other side."
    },
    {
      "name":"Foam Roll Calves",
      "aliases":["Calf Foam Roll","Foam Rolling Calves","Foam Roll Gastrocnemius"],
      "primary_muscle":"calves",
      "equipment":"other",
      "movement_pattern":"recovery",
      "default_sets":1,
      "default_reps":"30-60 sec each",
      "substitution_group":"calf_recovery",
      "sort_order":861,
      "slug":"foam-roll-calves",
      "demo_url":"https://www.youtube.com/watch?v=6f2LO5EeB0I",
      "instructions":"Sit with the roller perpendicular beneath one calf and support yourself with your hands. Cross the other ankle lightly over the working leg only if you want more pressure. Lift your hips and slowly roll from just below the knee toward the lower calf, avoiding the knee and Achilles tendon. Pause on tender areas without forcing pressure, then switch sides."
    },
    {
      "name":"Foam Roll Latissimus Dorsi",
      "aliases":["Lat Foam Roll","Foam Roll Lats","Latissimus Dorsi Foam Rolling"],
      "primary_muscle":"lats",
      "equipment":"other",
      "movement_pattern":"recovery",
      "default_sets":1,
      "default_reps":"30-60 sec each",
      "substitution_group":"lat_recovery",
      "sort_order":862,
      "slug":"foam-roll-latissimus-dorsi",
      "demo_url":"https://www.youtube.com/watch?v=5S2suclGl7o",
      "instructions":"Lie on your side with the roller perpendicular beneath the lat just below your armpit. Extend the lower arm overhead and use the opposite hand and bent leg for support. Slowly move the roller a short distance down the outer side of your upper torso, then return. Use tolerable pressure, avoid rolling directly in the armpit or aggressively across the ribs, and repeat on the other side."
    },
    {
      "name":"Static Latissimus Dorsi Ball Stretch",
      "aliases":["Lat Ball Stretch","Stability Ball Lat Stretch","Static Lat Ball Stretch"],
      "primary_muscle":"lats",
      "equipment":"other",
      "movement_pattern":"stretching",
      "default_sets":2,
      "default_reps":"15-30 sec",
      "substitution_group":"lat_flexibility",
      "sort_order":863,
      "slug":"static-latissimus-dorsi-ball-stretch",
      "demo_url":"https://www.youtube.com/watch?v=kEH6jatSVSw",
      "instructions":"Kneel or sit back comfortably facing a stability ball and place both hands on top. Keeping your ribs controlled and spine long, slowly roll the ball forward as your chest lowers between your arms. Stop at mild tension along the sides of your back and shoulders. Breathe steadily for 15 to 30 seconds, then roll the ball back without forcing the range."
    },
    {
      "name":"Static Seated Calf Stretch",
      "aliases":["Seated Calf Stretch With Strap","Strap Calf Stretch","Seated Gastrocnemius Stretch"],
      "primary_muscle":"calves",
      "equipment":"other",
      "movement_pattern":"stretching",
      "default_sets":2,
      "default_reps":"15-30 sec each",
      "substitution_group":"calf_flexibility",
      "sort_order":864,
      "slug":"static-seated-calf-stretch",
      "demo_url":"https://www.youtube.com/watch?v=83G00Fwlqqw",
      "instructions":"Sit tall with one leg extended and loop a strap around the ball of that foot. Keep the knee softly unlocked and the leg from rotating. Gently pull the strap so the toes move toward your shin until you feel mild calf tension. Hold for 15 to 30 seconds without rounding your back or pulling aggressively, then release and switch sides."
    },
    {
      "name":"Static Standing Adductor Stretch",
      "aliases":["Standing Adductor Stretch","Standing Inner Thigh Stretch","Lateral Adductor Stretch"],
      "primary_muscle":"adductors",
      "equipment":"bodyweight",
      "movement_pattern":"stretching",
      "default_sets":2,
      "default_reps":"15-30 sec each",
      "substitution_group":"adductor_flexibility",
      "sort_order":865,
      "slug":"static-standing-adductor-stretch",
      "demo_url":"https://www.youtube.com/watch?v=IzHUoWs0maQ",
      "instructions":"Stand wider than shoulder width with your toes forward or slightly outward. Shift your weight toward one side, bending that knee while keeping the opposite leg extended and its foot flat. Keep your torso facing forward and avoid excessive leaning or rotation. Hold the mild inner-thigh stretch for 15 to 30 seconds, return to center, and repeat on the other side."
    },
    {
      "name":"Doorway Chest Stretch",
      "aliases":["Doorway Pec Stretch","Chest Doorway Stretch","Standing Doorframe Chest Stretch"],
      "primary_muscle":"chest",
      "equipment":"bodyweight",
      "movement_pattern":"stretching",
      "default_sets":2,
      "default_reps":"15-30 sec",
      "substitution_group":"chest_flexibility",
      "sort_order":866,
      "slug":"doorway-chest-stretch",
      "demo_url":null,
      "instructions":"Stand in a doorway with one foot forward and your forearms lightly against the frame at or slightly below shoulder height. Keep your ribs down, neck long, and shoulders relaxed. Shift your chest forward a few inches until you feel mild tension across your chest and front shoulders. Hold without arching your lower back, bouncing, or forcing the range."
    },
    {
      "name":"Walking Lunge With Rotation",
      "aliases":["Walking Lunge With Torso Rotation","Dynamic Lunge With Rotation","Walking Lunge and Rotate"],
      "primary_muscle":"full_body",
      "equipment":"bodyweight",
      "movement_pattern":"mobility",
      "default_sets":1,
      "default_reps":"8-10 each",
      "substitution_group":"full_body_mobility",
      "sort_order":867,
      "slug":"walking-lunge-with-rotation",
      "demo_url":null,
      "instructions":"Stand tall with your arms extended at chest height. Step forward into a controlled lunge, keeping the front knee aligned over the middle toes and the pelvis level. Rotate your rib cage toward the front-leg side without twisting the knee or collapsing your posture. Return to center, step through, and repeat on the opposite side with smooth dynamic control."
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
    demo_url text,
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
  demo_url,
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
  demo_url,
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
  demo_url = coalesce(excluded.demo_url, public.exercise_library.demo_url),
  instructions = excluded.instructions,
  is_approved = true,
  is_active = true,
  sort_order = excluded.sort_order,
  updated_at = now();
