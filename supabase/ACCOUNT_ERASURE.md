# Processor cleanup after a GRUNTR account deletion

Account deletion removes the login, associated database content, and account-owned media. In the same transaction it creates a private follow-up for fitness questionnaires stored outside GRUNTR. No client can access that queue.

Use the production Supabase SQL editor with authorized operator access. Review pending requests promptly.

```sql
select request_id, normalized_email, queued_at
from public.list_account_deletion_questionnaire_erasures(25);
```

Use the verified email to check the restricted Fitness Questionnaire Responses spreadsheets and any approved copies with the same retention policy. Only match the full email. The request timestamp is the cutoff. A newer submission by a person who re-registers with the same email belongs to a new account and must remain. Escalate any record with ambiguous ownership or timestamps before removing it. Use the organization's authorized retention process for any record legally required to remain.

Confirm the result to the verified email through GRUNTR support once all linked copies are checked. Resolve the exact request after confirming the result. This clears the temporary email from the queue.

```sql
select public.complete_account_deletion_questionnaire_erasure('<request UUID>');
```

Before release, verify the active spreadsheet and archival copies with the owner, assign responsibility for the queue, and exercise the flow with synthetic accounts only.
