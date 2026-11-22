-- Retain the former records and names for existing workout history and plans.
do $migration$
declare
  pair record;
  duplicate_row public.exercise_library%rowtype;
  canonical_row public.exercise_library%rowtype;
begin
  for pair in
    select *
    from (values
      ('16afa6ce-722d-4b85-b46f-219843482768'::uuid, '45° Degree Hip Extension', 'c1bd71ac-7a29-4776-8352-0335850b4cdc'::uuid, '45-Degree Back Extension'),
      ('58f16fc2-95da-4634-9b9e-fe505aab9b8b'::uuid, 'Lat Pulldown Machine', 'af3fb3ec-929d-45ab-8974-41959d5598ee'::uuid, 'Lat Pulldown'),
      ('7c560838-9d5d-4b9d-86ea-5760e8bc84d0'::uuid, 'Narrow grip lat pull down', '14e0e888-5182-44e0-b73f-0e6ba65a49f4'::uuid, 'Close-Grip Lat Pulldown'),
      ('0333e0eb-711c-466a-abc9-e517a238680b'::uuid, 'Exercise 3close Grip Lat Pulldown', '14e0e888-5182-44e0-b73f-0e6ba65a49f4'::uuid, 'Close-Grip Lat Pulldown'),
      ('6cbf6f20-de21-49da-ad0b-185400071f55'::uuid, 'Open-Book Thoracic Rotation', '3a7d0b6f-f810-4647-b22e-7075ebec7113'::uuid, 'Side-Lying Open Book'),
      ('37f52647-2a88-45da-ba7a-454059a29638'::uuid, 'Jesus Bicep Curl', '16f38a9d-d42e-44db-860c-fd8b6ffeab7f'::uuid, 'Jesus Christ Curl'),
      ('945b44bf-2b60-41e6-9a00-3af89de660a5'::uuid, 'World’s greatest stretch with rotation', 'ab68c23a-3795-404d-8dc8-ba265e3c2270'::uuid, 'World''s Greatest Stretch'),
      ('2f5ec1f9-503b-424a-9dc0-7e8689787fdd'::uuid, 'Seated Hip Abduction', 'a1f8eb80-c6d0-44a7-8e5b-237333b651df'::uuid, 'Hip Abduction Machine'),
      ('ad58be3b-133e-40b7-8095-23fc3e4628dd'::uuid, 'hanging leg straight', 'd3fbbbb8-0391-436f-82c0-99a216bf6373'::uuid, 'Hanging Leg Raise'),
      ('da22ce51-f9df-424f-b59c-9849af2f3502'::uuid, 'Pex Fly', '29685b9a-0812-4ffa-9146-0fa17fb79b7c'::uuid, 'Pec Deck Chest Fly'),
      ('7bff5f27-4308-43bb-b5bd-d8e475406110'::uuid, 'Chest Pres', '71ef23f3-1e66-43c2-854d-78ccddb72dd5'::uuid, 'Machine Chest Press'),
      ('0a0dbee1-922b-4cab-9d5d-1a0c610f6128'::uuid, 'Tricep Pulldown', '3c4e2a76-658d-414a-bbb5-20dd542281b5'::uuid, 'Cable Triceps Pushdown'),
      ('68e29bfe-5d8f-4133-8c02-80da483954a5'::uuid, 'tricep push', '3c4e2a76-658d-414a-bbb5-20dd542281b5'::uuid, 'Cable Triceps Pushdown'),
      ('ba830dda-b5f3-4724-a235-a445f89991d6'::uuid, 'Bent-Over Fly', '012cd17c-e06e-4367-ac7b-4d432d2347c4'::uuid, 'Dumbbell Reverse Fly'),
      ('83edb7ac-2994-436b-98ab-d99e79225e43'::uuid, 'Rear-Delt Cable Fly', 'ecf9a7b3-ed07-456b-bbc3-6723167be3c0'::uuid, 'Cable Reverse Fly')
    ) as pairs(duplicate_id, duplicate_name, canonical_id, canonical_name)
  loop
    select * into strict duplicate_row from public.exercise_library where id = pair.duplicate_id for update;
    select * into strict canonical_row from public.exercise_library where id = pair.canonical_id for update;

    if duplicate_row.name is distinct from pair.duplicate_name
      or canonical_row.name is distinct from pair.canonical_name
      or not duplicate_row.is_approved
      or not canonical_row.is_approved
      or not canonical_row.is_active then
      raise exception 'Exercise consolidation precondition failed for % → %', pair.duplicate_name, pair.canonical_name;
    end if;

    update public.exercise_library
    set aliases = array(
          select distinct label
          from unnest(coalesce(canonical_row.aliases, '{}'::text[]) ||
                      coalesce(duplicate_row.aliases, '{}'::text[]) ||
                      array[duplicate_row.name]) as aliases(label)
          where btrim(label) <> '' and lower(label) <> lower(canonical_row.name)
          order by label
        ),
        updated_at = now()
    where id = canonical_row.id;

    update public.exercise_library
    set is_active = false, updated_at = now()
    where id = duplicate_row.id and is_active;
  end loop;
end
$migration$;
