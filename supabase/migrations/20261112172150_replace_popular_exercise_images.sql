-- Replace the ten most frequently logged exercise cards with reviewed
-- likeness cards and two-frame start/end loops. Object paths are versioned
-- because existing media is cached.
do $migration$
declare
  changed_count integer;
begin
  update public.exercise_library as exercise
  set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-12/webp-768/' || cards.slug || '-benjamin.webp',
      motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-12/motion-webp/' || cards.slug || '-benjamin.webp',
      updated_at = now()
  from (values
    ('893ca987-7d3c-48c0-a07f-7a5e2b37da73'::uuid, 'Barbell Bench Press', 'barbell-bench-press'),
    ('91955c87-38aa-4679-a179-6197ec917c73'::uuid, 'Dumbbell Lateral Raise', 'dumbbell-lateral-raise'),
    ('adbcc6b7-c0c5-48ae-a473-663fb3ce9c0b'::uuid, 'Incline Dumbbell Press', 'incline-dumbbell-press'),
    ('aa33be6c-cdaf-4a52-810d-0364d932d904'::uuid, 'Dumbbell Bench Press', 'dumbbell-bench-press'),
    ('f44a71b8-8783-4b6b-937e-245a5128501b'::uuid, 'Leg Press', 'leg-press'),
    ('af3fb3ec-929d-45ab-8974-41959d5598ee'::uuid, 'Lat Pulldown', 'lat-pulldown'),
    ('f0a8695a-e046-4e64-9aa8-63b93dab0ca9'::uuid, 'Hip Thrust Machine', 'hip-thrust-machine'),
    ('7d7145b0-9320-48d7-8817-fd6d7d535846'::uuid, 'One-Arm Dumbbell Row', 'one-arm-dumbbell-row'),
    ('97c2e940-0a03-4eac-98ed-7419e23d2d9d'::uuid, 'Seated Cable Row', 'seated-cable-row'),
    ('7e0f4318-25b5-448c-9739-147e27ce50a3'::uuid, 'Dumbbell Curl', 'dumbbell-curl')
  ) as cards(id, name, slug)
  where exercise.id = cards.id
    and exercise.name = cards.name
    and exercise.is_active
    and exercise.is_approved
    and exercise.motion_url is null
    and exercise.image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/' || cards.slug || '.webp';

  get diagnostics changed_count = row_count;
  if changed_count <> 10 then
    raise exception 'Expected 10 active, approved popular exercises; updated %', changed_count;
  end if;
end
$migration$;
