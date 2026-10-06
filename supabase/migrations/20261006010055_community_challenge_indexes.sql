-- Support participant lookups and cascading deletes for private challenges.
create index client_community_challenges_initiator_idx
  on community_private.client_community_challenges(initiator_id, created_at desc);
create index client_community_challenges_recipient_idx
  on community_private.client_community_challenges(recipient_id, created_at desc);
