-- Update the next forty most-used approved exercises with reviewed likeness media.
-- The old URLs guard against replacing a card changed after this batch was reviewed.
do $migration$
declare
  changed_count integer;
begin
  update public.exercise_library as exercise
  set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-14/webp-768/' || cards.slug || '-benjamin.webp',
      motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-14/motion-webp/' || cards.slug || '-benjamin.webp',
      updated_at = now()
  from (values
    ('f0f7bfab-5919-4d3f-a2e8-efae2c5f2d9d'::uuid, 'Barbell Deadlift', 'barbell-deadlift', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/barbell-deadlift.webp', null),
    ('434bd4e2-a877-4e72-b701-656ac5d3abe6'::uuid, 'Barbell Back Squat', 'barbell-back-squat', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-30/webp-768/barbell-back-squat.webp', null),
    ('3a5728d6-401c-4c62-96f3-afd1239744df'::uuid, 'Incline Barbell Bench Press', 'incline-barbell-bench-press', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/incline-barbell-bench-press.webp', null),
    ('83b76f5d-d7aa-4ad0-9948-2e3f06f9f1bb'::uuid, 'Wide-Grip Lat Pulldown', 'wide-grip-lat-pulldown', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/wide-grip-lat-pulldown-v2.webp', null),
    ('e17d1c48-b6d1-430a-afb5-0210e936aa8d'::uuid, 'EZ-Bar Biceps Curl', 'ez-bar-biceps-curl', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-480/ez-bar-biceps-curl.webp', null),
    ('b97edf78-0391-4ff4-a257-da1b426aadbf'::uuid, 'Barbell Row', 'barbell-row', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-30/webp-768/barbell-row.webp', null),
    ('54f051a1-2a0a-4788-bb9d-7ea6fad9ec8e'::uuid, 'Seated Leg Curl', 'seated-leg-curl', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/seated-leg-curl.webp', null),
    ('4c5c8e03-2cc6-49cb-abba-137585c1deb6'::uuid, 'Hammer Curl', 'hammer-curl', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/hammer-curl.webp', null),
    ('5b0c83e6-1585-4014-8f94-c8a6cdafa808'::uuid, 'Leg Extension', 'leg-extension', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/leg-extension.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/leg-extension.mp4'),
    ('94793ed8-ee41-4af3-9d5c-0b03c74f5c1e'::uuid, 'Dumbbell Rows', 'dumbbell-rows', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/dumbell-rows.webp', null),
    ('a1f8eb80-c6d0-44a7-8e5b-237333b651df'::uuid, 'Hip Abduction Machine', 'hip-abduction-machine', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/hip-abduction-machine.webp', null),
    ('a2b78545-b2fc-41c5-a250-9021d64dd8f7'::uuid, 'Dumbbell Romanian Deadlift', 'dumbbell-romanian-deadlift', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/dumbbell-romanian-deadlift.webp', null),
    ('1e7b8d90-8a37-4051-9fad-b070430c8a58'::uuid, 'DB Shoulder Press', 'db-shoulder-press', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/db-shoulder-press.webp', null),
    ('d3b4befa-79a7-4b64-9add-4b84ced61ba0'::uuid, 'Romanian Deadlift', 'romanian-deadlift', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/romanian-deadlift.webp', null),
    ('e1ef58e3-d5dd-42c5-a8b8-d40767565998'::uuid, 'Cable Chest Fly', 'cable-chest-fly', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/cable-chest-fly.webp', null),
    ('0b03ae4c-6bd4-48be-8158-a9b60ae7dbd9'::uuid, 'Seated Dip Machine', 'seated-dip-machine', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/seated-dip-machine.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/seated-dip-machine.mp4'),
    ('71ef23f3-1e66-43c2-854d-78ccddb72dd5'::uuid, 'Machine Chest Press', 'machine-chest-press', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/machine-chest-press.webp', null),
    ('663a3366-ebe0-401f-a41c-2ce30ae8dbe1'::uuid, 'Incline Machine Chest Press', 'incline-machine-chest-press', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/incline-machine-chest-press.webp', null),
    ('07931525-adcc-474d-8582-98e79ccdaaff'::uuid, 'Push-Up', 'push-up', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/push-up.webp', null),
    ('8c3fe671-ff24-4755-b9f3-ef4c5c1e4820'::uuid, 'Seated Dumbbell Shoulder Press', 'seated-dumbbell-shoulder-press', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/seated-dumbbell-shoulder-press.webp', null),
    ('e787cf81-c0f7-40fc-94db-0589e22a4ed7'::uuid, 'Hip Thrust', 'hip-thrust', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/hip-thrust.webp', null),
    ('c1c4e27f-b6ba-485d-abb9-bccad9d4ea88'::uuid, 'Barbell Curl', 'barbell-curl', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/barbell-curl.webp', null),
    ('012cd17c-e06e-4367-ac7b-4d432d2347c4'::uuid, 'Dumbbell Reverse Fly', 'dumbbell-reverse-fly', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/dumbbell-reverse-fly.webp', null),
    ('8b2171d4-dae1-4efe-b462-17ed33a0330d'::uuid, 'Decline Chest Press Machine', 'decline-chest-press-machine', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/decline-chest-press-machine.webp', null),
    ('eeded50d-2e21-4cad-a25e-f37dcc4e3ad1'::uuid, 'Face Pull', 'face-pull', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/face-pull.webp', null),
    ('68b1eabf-0c14-4a10-b30c-efdcdaa867bd'::uuid, 'Hack Squat', 'hack-squat', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/hack-squat.webp', null),
    ('d5d1f9b4-5be8-41d4-a761-aa0e2d5ab5bc'::uuid, 'Standing Calf Raise', 'standing-calf-raise', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/standing-calf-raise.webp', null),
    ('7631a136-d172-48e5-8890-fd4f51aa2f14'::uuid, 'Incline Dumbbell Curl', 'incline-dumbbell-curl', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/incline-dumbbell-curl.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/incline-dumbbell-curl.mp4'),
    ('1c591a67-247d-41da-8458-d2e326abc06a'::uuid, 'Rope Triceps Pressdown', 'rope-triceps-pressdown', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/rope-triceps-pressdown.webp', null),
    ('9221786d-3249-447f-99f2-a2fd219cecee'::uuid, 'Reverse Pec Deck', 'reverse-pec-deck', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/reverse-pec-deck.webp', null),
    ('3c4e2a76-658d-414a-bbb5-20dd542281b5'::uuid, 'Cable Triceps Pushdown', 'cable-triceps-pushdown', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/cable-triceps-pushdown.webp', null),
    ('6ccfb1ea-70ef-4fa5-a17a-bf2e048992b6'::uuid, 'Cable Crunch', 'cable-crunch', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/cable-crunch.webp', null),
    ('762b3ebe-d766-47ca-bde6-392977aee000'::uuid, 'Preacher Curl', 'preacher-curl', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/preacher-curl.webp', null),
    ('80d296fa-7238-4366-8598-02e875ae802d'::uuid, 'Dumbbell Chest Fly', 'dumbbell-chest-fly', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/dumbbell-chest-fly.webp', null),
    ('29685b9a-0812-4ffa-9146-0fa17fb79b7c'::uuid, 'Pec Deck Chest Fly', 'pec-deck-chest-fly', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/pec-deck-fly.webp', null),
    ('44fa714a-6293-445e-a2cf-db9f77a18bfd'::uuid, 'Dumbbell Front Raise', 'dumbbell-front-raise', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-30/webp-768/dumbbell-front-raise.webp', null),
    ('55c9ab7c-b6c5-4ca9-9447-79883a341bd1'::uuid, 'Crunches', 'crunches', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-04/webp-768/crunches.webp', null),
    ('74393147-8e68-4590-9a69-31ae0fb08440'::uuid, 'Bulgarian Split Squat', 'bulgarian-split-squat', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/bulgarian-split-squat.webp', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/bulgarian-split-squat.mp4'),
    ('17f273de-b9ab-4850-94f4-78091bd19bac'::uuid, 'Glute Kickback Machine', 'glute-kickback-machine', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/machine-glute-kickback.webp', null),
    ('3a377d34-5f02-441d-b227-1557cc76c388'::uuid, 'Cable Curl', 'cable-curl', 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/cable-curl.webp', null)
  ) as cards(id, name, slug, old_image_url, old_motion_url)
  where exercise.id = cards.id
    and exercise.name = cards.name
    and exercise.is_active
    and exercise.is_approved
    and exercise.image_url is not distinct from cards.old_image_url
    and exercise.motion_url is not distinct from cards.old_motion_url;

  get diagnostics changed_count = row_count;
  if changed_count <> 40 then
    raise exception 'Expected 40 active, approved popular exercises; updated %', changed_count;
  end if;
end
$migration$;
