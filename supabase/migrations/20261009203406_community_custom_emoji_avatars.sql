-- Keep existing avatar IDs while allowing one client-selected emoji. The
-- applications validate a single grapheme; this constraint also bounds values
-- sent directly through the Data API before public Community feeds render them.
alter table public.client_community_profiles
  drop constraint client_community_profiles_avatar_id_check;

alter table public.client_community_profiles
  add constraint client_community_profiles_avatar_id_check
  check (
    avatar_id in ('strength','runner','cycling','boxing','yoga','swimming','martial','star',
      'lifting','walking','hiking','basketball','soccer','tennis','rowing','climbing')
    or (
      left(avatar_id, 6) = 'emoji:'
      and char_length(avatar_id) between 7 and 22
      and octet_length(avatar_id) <= 70
      and avatar_id !~ '[[:cntrl:][:space:]]'
      and octet_length(substring(avatar_id from 7)) > char_length(substring(avatar_id from 7))
    )
  );
