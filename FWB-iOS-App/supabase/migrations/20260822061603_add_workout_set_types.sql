alter table public.client_workout_logs
    add column set_type text not null default 'working',
    add column duration_seconds numeric;

alter table public.client_workout_logs
    add constraint client_workout_logs_set_type_check
        check (set_type in ('working', 'warm_up', 'drop', 'failure', 'timed')),
    add constraint client_workout_logs_duration_seconds_check
        check (
            (duration_seconds is null or duration_seconds > 0)
            and (set_type <> 'timed' or duration_seconds is not null)
        );

comment on column public.client_workout_logs.set_type is
    'Workout effort classification. Existing and unspecified rows are working sets.';

comment on column public.client_workout_logs.duration_seconds is
    'Positive duration for timed sets; null for repetition-based sets.';
