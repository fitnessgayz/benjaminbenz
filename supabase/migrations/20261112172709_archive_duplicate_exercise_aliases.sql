-- Keep historical workout text and archived catalog rows intact. Copy every
-- retired label to the active survivor so web and iOS name lookup still finds
-- the same media for existing plans.
do $migration$
declare
  pair record;
  source_row public.exercise_library%rowtype;
  survivor_row public.exercise_library%rowtype;
  archived_count integer := 0;
begin
  for pair in
    select source_id, survivor_id
    from (values
      ('b71f2ead-f5bf-488c-936f-33da7fd7790b'::uuid, '55c9ab7c-b6c5-4ca9-9447-79883a341bd1'::uuid), -- Ab Crunch -> Crunches
      ('b06e3dee-9b69-4ec7-ba02-8a7ef03a6eaf'::uuid, '68a151ba-76d3-4b12-ab6a-d9899b691b14'::uuid), -- Ab roller -> Ab Wheel Rollout
      ('0e7faf13-8e07-490a-992c-fa5cd5fc32ea'::uuid, '496042a0-aee4-4254-9f56-6cd2611f2f7d'::uuid), -- cable oblique twist -> Cable Rotation
      ('0d3c75f9-b946-4624-aa30-739481f6fe6c'::uuid, '496042a0-aee4-4254-9f56-6cd2611f2f7d'::uuid), -- Cable Torso Twists -> Cable Rotation
      ('01d766c6-10b9-463f-9090-32e83625a3ad'::uuid, '496042a0-aee4-4254-9f56-6cd2611f2f7d'::uuid), -- Cable twist -> Cable Rotation
      ('91e34d51-569b-46e9-91f5-f571d9c6f1c6'::uuid, '8b2171d4-dae1-4efe-b462-17ed33a0330d'::uuid), -- Decline Chest Press -> Decline Chest Press Machine
      ('8fb42e32-b6a0-4ab2-b537-9596b5dac49f'::uuid, '4c5c8e03-2cc6-49cb-abba-137585c1deb6'::uuid), -- Dumbbell Hammer Curl -> Hammer Curl
      ('c5cff319-0fb9-44bc-98cb-155d4ca1b375'::uuid, '61e1dd96-cfa2-4861-9c9b-5a6bc0121d45'::uuid), -- Incline Chest -> Incline chest press
      ('31cb8a7d-ac6b-4f42-8b82-1c7ab929e448'::uuid, '61e1dd96-cfa2-4861-9c9b-5a6bc0121d45'::uuid), -- Incline press -> Incline chest press
      ('c3bf6c72-802e-4a52-aae4-51d5fc655024'::uuid, '8878b141-32a6-4019-90af-7a3712577c41'::uuid), -- Close-Grip Seated Machine Row -> Narrow-Grip Seated Cable Row
      ('29c7d3b0-3675-4a40-8f0a-106c5e1e5c5d'::uuid, '9221786d-3249-447f-99f2-a2fd219cecee'::uuid), -- Rear Delt Machine Fly -> Reverse Pec Deck
      ('76491bba-e0b0-437c-8e1c-bee73b72c102'::uuid, '6560ad7d-7ddf-43fe-85ab-f7d7252d2963'::uuid), -- Standing single leg curl -> Standing Leg Curl
      ('904c284d-21d2-422c-a2b7-08063074f8d9'::uuid, '61259292-e56b-4869-8e52-63f5783b9068'::uuid), -- Cardio bike -> stationary bike
      ('b2daa6b4-c378-4cdc-924a-93142218ccc7'::uuid, '3a7d0b6f-f810-4647-b22e-7075ebec7113'::uuid), -- Thoracic Open Book Stretch -> Side-Lying Open Book
      ('536ed9b4-9030-41f1-b535-04af916cd06c'::uuid, '71ef23f3-1e66-43c2-854d-78ccddb72dd5'::uuid)  -- Flat Machine Chest Press -> Machine Chest Press
    ) as duplicates(source_id, survivor_id)
  loop
    select * into strict source_row from public.exercise_library where id = pair.source_id for update;
    select * into strict survivor_row from public.exercise_library where id = pair.survivor_id for update;

    if not source_row.is_active or not source_row.is_approved
      or not survivor_row.is_active or not survivor_row.is_approved
      or source_row.image_url is distinct from survivor_row.image_url
      or source_row.equipment is distinct from survivor_row.equipment
      or source_row.primary_muscle is distinct from survivor_row.primary_muscle then
      raise exception 'Duplicate archive precondition failed for % -> %', source_row.name, survivor_row.name;
    end if;

    update public.exercise_library
    set aliases = array(
          select distinct label
          from unnest(coalesce(survivor_row.aliases, '{}'::text[]) ||
                      coalesce(source_row.aliases, '{}'::text[]) ||
                      array[source_row.name]) as label
          where btrim(label) <> ''
          order by label
        ),
        instructions = case when btrim(survivor_row.instructions) = ''
          then source_row.instructions else survivor_row.instructions end,
        demo_url = coalesce(survivor_row.demo_url, source_row.demo_url),
        updated_at = now()
    where id = pair.survivor_id;

    update public.exercise_library
    set is_active = false,
        updated_at = now()
    where id = pair.source_id;
    archived_count := archived_count + 1;
  end loop;

  if archived_count <> 15 then
    raise exception 'Expected to archive 15 duplicate rows; archived %', archived_count;
  end if;
end
$migration$;
