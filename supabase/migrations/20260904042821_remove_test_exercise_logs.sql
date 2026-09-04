-- These two rows were explicitly confirmed as disposable test data. Keep this
-- deletion separate from the history-preserving exercise-name migration.
delete from public.client_workout_logs
where lower(btrim(exercise_name)) in ('test', 'test 2');
