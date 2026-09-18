-- Personal order/substitutions are separate from the coach's assigned exercises.
-- Existing client_programs RLS restricts updates to the owner's active program.
alter table public.client_programs
  add column if not exists client_workout_layout jsonb;
alter table public.client_programs
  add constraint client_workout_layout_object check (
    client_workout_layout is null or (
      jsonb_typeof(client_workout_layout) = 'object'
      and client_workout_layout ?& array['source', 'order']
      and jsonb_typeof(client_workout_layout -> 'source') = 'string'
      and jsonb_typeof(client_workout_layout -> 'order') = 'array'
    )
  );
grant update (client_workout_layout) on public.client_programs to authenticated;
comment on column public.client_programs.client_workout_layout is
  'Client workout source fingerprint and ordered source indices; ignored when coach changes the assigned workouts.';
