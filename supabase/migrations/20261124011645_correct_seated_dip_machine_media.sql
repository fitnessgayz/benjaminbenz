-- Replace the incorrect illustrated machine with a still and inline motion
-- based on the existing seated dip demo. The full demo stays playable.
do $$
declare
  changed integer;
begin
  update public.exercise_library
  set image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/anatomy/2026-11-24/seated-dip-machine.webp',
      motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-24/motion-webp/seated-dip-machine.webp',
      updated_at = now()
  where name = 'Seated Dip Machine'
    and is_active and is_approved
    and image_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/anatomy/2026-11-21/seated-dip-machine.webp'
    and motion_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-images/approved/2026-11-21/motion-webp/seated-dip-machine-anatomy.webp'
    and demo_url = 'https://qukdfjeupjhpthfbaonv.supabase.co/storage/v1/object/public/exercise-videos/generated/2026-09-30/seated-dip-machine.mp4';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'Expected one unchanged active Seated Dip Machine media mapping, found %', changed;
  end if;
end;
$$;
