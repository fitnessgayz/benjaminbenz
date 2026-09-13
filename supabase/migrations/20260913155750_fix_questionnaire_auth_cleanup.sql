-- A matched questionnaire must always have an Auth owner. Delete its private
-- copy with the account instead of trying to null the required ownership link.
alter table public.client_fitness_questionnaires
  drop constraint if exists client_fitness_questionnaires_linked_user_id_fkey;

alter table public.client_fitness_questionnaires
  add constraint client_fitness_questionnaires_linked_user_id_fkey
  foreign key (linked_user_id)
  references auth.users(id)
  on delete cascade;
