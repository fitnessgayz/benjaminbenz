-- The established Pec Deck row predated the approval flag. Keep the canonical
-- row and its newly assigned branded card visible to the shared app resolver.
update public.exercise_library
set is_approved = true,
    is_active = true,
    updated_at = now()
where lower(name) = lower('Pec Deck Chest Fly')
  and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-09-29/webp-768/pec-deck-fly.webp';
