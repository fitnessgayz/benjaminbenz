-- Keep the existing approved exercise record and metadata intact; only point
-- its image at the uploaded start-to-finish artwork.
update public.exercise_library
set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/assisted-pull-up.png'
where name = 'Assisted Pull-Up';
