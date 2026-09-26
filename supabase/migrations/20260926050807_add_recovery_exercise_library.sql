-- Older generators treat every movement pattern as strength. A request must
-- explicitly support the recovery catalog before seeing those rows. This
-- restrictive policy only narrows visibility; existing approval and coach
-- authorization policies still apply, including to callers that send the header.
create policy "Recovery catalog requires a compatible client"
on public.exercise_library as restrictive
for select to authenticated
using (
  lower(trim(movement_pattern)) not in ('mobility', 'stretch', 'stretching', 'flexibility', 'recovery')
  or coalesce((select nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-fwb-recovery-catalog'), '') = '1'
);

-- Explicit recovery metadata keeps these movements separate from strength plans.
-- Approve these curated entries explicitly: production defaults new rows to false.
-- Preserve any existing coach edits or inactive/unapproved entries with the same name.
insert into public.exercise_library
  (name, primary_muscle, equipment, difficulty, movement_pattern, default_sets, default_reps, default_rest_seconds, substitution_group, instructions, sort_order, is_approved)
values
  ('Cat-Cow', 'back', 'bodyweight', 'beginner', 'mobility', 2, '6-8', 20, 'spine_mobility', 'On hands and knees, slowly alternate a comfortable rounded and gently extended back. Let your breathing set an easy pace.', 700, true),
  ('Side-Lying Open Book', 'back', 'bodyweight', 'beginner', 'mobility', 2, '6-8 each', 20, 'spine_mobility', 'Lie on your side with knees comfortably bent and arms reaching forward. Slowly open the top arm and chest, then return. Keep the movement comfortable and repeat on both sides.', 710, true),
  ('Shoulder Circles', 'shoulders', 'bodyweight', 'beginner', 'mobility', 2, '8-10', 20, 'shoulder_mobility', 'Stand or sit comfortably. Make slow, relaxed shoulder circles, using a small range that feels easy. Change direction partway through.', 720, true),
  ('Cross-Body Shoulder Stretch', 'shoulders', 'bodyweight', 'beginner', 'stretching', 2, '20-30 sec each', 20, 'shoulder_mobility', 'Bring one arm gently across your chest and support it with the other arm. Keep your shoulders relaxed and avoid pulling into discomfort. Repeat on both sides.', 730, true),
  ('Supine Chest Stretch', 'chest', 'bodyweight', 'beginner', 'stretching', 2, '20-30 sec', 20, 'chest_flexibility', 'Lie on your back with knees bent. Let your arms open to a comfortable position at your sides, palms up. Relax and breathe without forcing your arms toward the floor.', 740, true),
  ('Overhead Triceps Stretch', 'triceps', 'bodyweight', 'beginner', 'stretching', 2, '20-30 sec each', 20, 'arm_flexibility', 'Raise one arm and bend the elbow so your hand rests toward your upper back. Keep your ribs relaxed and use only a comfortable range. Repeat on both sides without pulling hard on the elbow.', 750, true),
  ('Supine Figure-Four Stretch', 'glutes', 'bodyweight', 'beginner', 'stretching', 2, '20-30 sec each', 20, 'hip_flexibility', 'Lie on your back with knees bent. Rest one ankle above the other knee, then gently bring the supporting thigh toward you if comfortable. Keep the crossed knee relaxed and repeat on both sides.', 800, true),
  ('Supine Hamstring Stretch', 'hamstrings', 'bodyweight', 'beginner', 'stretching', 2, '20-30 sec each', 20, 'hamstring_flexibility', 'Lie on your back and support one thigh with your hands. Slowly straighten that knee only as far as comfortable, keeping a soft bend if needed. Breathe easily and repeat on both sides.', 810, true),
  ('Half-Kneeling Hip Flexor Stretch', 'quads', 'bodyweight', 'beginner', 'stretching', 2, '20-30 sec each', 20, 'hip_flexibility', 'From a comfortable half-kneeling position, keep your torso upright and gently shift forward a small amount. Keep your lower back relaxed. Repeat on both sides without forcing a deeper stretch.', 820, true),
  ('Side-Lying Quad Stretch', 'quads', 'bodyweight', 'beginner', 'stretching', 2, '20-30 sec each', 20, 'quad_flexibility', 'Lie on your side and gently bend the top knee. If comfortable, hold the ankle without pulling hard, keeping your hips stacked. Use an easy range and repeat on both sides.', 830, true),
  ('Seated Butterfly Stretch', 'adductors', 'bodyweight', 'beginner', 'stretching', 2, '20-30 sec', 20, 'hip_flexibility', 'Sit comfortably with the soles of your feet together and knees open. Keep your back relaxed and upright. Let your knees settle naturally without pressing them down.', 840, true),
  ('Supine Ankle Circles', 'calves', 'bodyweight', 'beginner', 'mobility', 2, '8-10 each', 20, 'ankle_mobility', 'Lie comfortably on your back and make slow, small ankle circles. Change direction partway through and repeat on both sides. Keep the movement easy and controlled.', 850, true)
on conflict (lower(name)) do nothing;
