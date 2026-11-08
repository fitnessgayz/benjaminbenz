-- Correct the already applied hosted schedule to the first day of the month.
-- A named pg_cron schedule updates the existing job rather than creating a second job.
select cron.schedule(
  'fwb-monthly-training-reports',
  '5 17 1 * *',
  $$select fwb_private.generate_monthly_training_reports();$$
);
