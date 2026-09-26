# Client and coach messaging

One private conversation per authenticated client, shared by that client and the existing verified coach administrators. Message ownership is bound to the client's stable Auth UUID. All four endpoints use the caller's ordinary Supabase authenticated session; never a service key. Incoming messages queue generic push and in-app notifications for verified recipients. Email notifications are also queued, but production email dispatch remains disabled pending provider credentials and a verified sender. Private message bodies remain inside the authenticated app and website.

## RPC contract

All messages and inbox rows have non-null fields. PostgreSQL bigint message IDs currently fit JavaScript safe integers; native apps should decode them as Int64. Dates are ISO 8601 UTC timestamptz values. Bodies are plain text, never HTML. The server removes outer whitespace and accepts 1–4,000 Unicode characters. Do not pass sender IDs or roles; the server derives both.

### messaging_inbox(p_limit integer = 100, p_offset integer = 0)

Returns an array ordered by latest message ID descending:

```ts
{ client_email: string; client_name: string; last_message_id: number;
  last_message_body: string; last_message_at: string;
  last_sender_role: 'client' | 'coach'; unread_count: number }[]
```

Only existing conversations with messages appear. Clients receive only their own conversation; coaches receive the shared inbox. Unread excludes the viewer's own messages and is tracked independently for each viewer. Bounds: limit 1–100, offset >= 0. Continue with offset until a shorter page; refresh restarts at offset zero. Offset lists can move when messages arrive, so deduplicate by client email.

### messaging_history(p_client_email text = null, p_before_id bigint = null, p_limit integer = 50)

Returns the latest messages ordered by ID descending. Reverse the result to display chronological order. Load older messages with `p_before_id` set to the oldest displayed ID (exclusive). Bounds: limit 1–100. Empty conversations return `[]`.

```ts
{ id: number; client_email: string; sender_user_id: string;
  sender_role: 'client' | 'coach'; body: string; created_at: string;
  request_id: string }[]
```

On refresh, merge by ID. If a full page does not reach the last previously seen ID, continue fetching earlier pages before considering the gap filled. A latest page alone is not guaranteed to include all messages since the last refresh.

### messaging_send(p_body text, p_request_id uuid, p_client_email text = null)

Returns exactly one message in an array, using the history message shape. Generate the request UUID once per compose/send intent and preserve it across network retries. Reusing the same UUID for the same normalized body and conversation returns the original message. Changing the body or conversation under that UUID is rejected. The first client message creates the conversation; coaches reply to existing conversations. A client needs an active nonarchived assigned program to start a conversation.

### messaging_mark_read(p_through_message_id bigint, p_client_email text = null)

Returns void (clients should accept an empty/null RPC result). Advances only the current viewer's cursor, monotonically, through that exact existing message in that conversation. Pass the highest message ID actually displayed after a successful history load. Never call from an inbox preview or pass a guessed/global latest ID. Loading older history cannot move the cursor backward. Messages committed later remain unread.

## Incoming-message email notifications

Email delivery is currently disabled. Each newly inserted message still queues one notification per verified recipient: client messages notify verified coach administrators, and coach replies notify the verified owner of that conversation. Both iOS and web use the same message RPC, so notifications cover both platforms. An idempotent resend returns the existing message and must not enqueue another notification. Recipient addresses are resolved from verified Auth identities, never from request-supplied addresses or editable profile metadata.

Emails contain a generic new-message notice and a link. They do not contain the message body. Client links use `/client-dashboard.html?messages=1`; coach links use `/coach-admin.html?tab=inbox`. Links contain no recipient email, client identifier, or message body. The client destination opens the conversation only after its authenticated controller is ready. The coach destination opens Inbox after authentication. Missing or expired sessions preserve that destination through the validated same-origin login return route. Coach previews do not auto-open client messaging.

Email delivery runs separately from the interactive send. A private outbox uses a unique `(message_id, recipient_user_id)` entry, and only new messages create entries; existing conversations are not backfilled. The actual message text never enters the outbox or email. The first service-only claim freezes the generic Resend payload and an outbox UUID idempotency key. Retries reuse both within a 23-hour deadline, with two-minute leases, up to ten claims, and an exponential delay from one minute to one hour. Before sending, the worker revalidates the recipient and cancels delivery if the email changed or the account was deleted, banned, or is no longer verified.

The conversation remains available in FWB Training even if email delivery is delayed or fails. Email replies into the conversation are not implemented.

## Email setup and activation

Production currently has both delivery guards off: `messaging_private.email_dispatch_config.enabled = false` and cron job `fwb-messaging-email-dispatch` has `active = false`. The `send-message-email` worker also fails closed while the config flag is off. `RESEND_API_KEY` and a configured sender are missing; email notifications are not being delivered.

1. Verify the sending domain/address in Resend, then securely configure the Edge Function secrets `RESEND_API_KEY` and `MESSAGE_NOTIFICATION_FROM`. The sender must be authorized by that Resend account. The worker supports existing `PASSWORD_NOTIFICATION_FROM` or `CONTACT_MESSAGE_FROM` as fallbacks, but a dedicated messaging sender is clearer. Never put secret values in source control, documentation, or terminal output.
2. Confirm the deployed `send-message-email` function has its standard `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment. Its private dispatcher credential is the Vault secret `fwb_messaging_email_worker_token`, created by the scheduler migration. The service-only `messaging_email_worker_config` RPC reads this credential and the enabled flag; do not expose either service credentials or the Vault token in client code.
3. Verify configuration and run the isolated SQL and mocked email-worker tests. Do not send real test emails. Check the private outbox's status counts before activation: enabling delivery processes eligible queued notifications as well as future ones.
4. With the verified sender configured, enable `messaging_private.email_dispatch_config` row `id = 1` and activate the existing `fwb-messaging-email-dispatch` cron job using `cron.alter_job`. Its schedule runs every minute and dispatches only when eligible work exists. Keep both guards disabled until setup is complete; turn both off again to pause delivery.

No plaintext credentials are required in these instructions, and no real email was sent during verification.

## Session and errors

For client calls, omit `p_client_email`/send null, or pass the client's current email. For coach history/send/mark-read calls, pass the selected client's email. Email comparison is case-insensitive. A verified current Auth identity is required, including matching signed JWT email and current verified Auth email. An account that changes its email keeps its original conversation through its stable Auth UUID; the stored conversation email remains its routing alias. A newly registered account that later reuses that old email cannot read or take over the existing conversation, and cannot open a replacement under that occupied alias. Changing this safe restriction would require an explicit migration/reassignment workflow. Editing `user_metadata` never grants coach access. The existing `is_coach_admin()` rule is reused only after verifying this identity. Anonymous, deleted, banned, unverified, or stale-email sessions are rejected. Other clients' conversation identifiers are not accepted.

Expected SQLSTATE errors: `42501` not authorized; `22023` invalid body/request/cursor/paging arguments or changed idempotency payload; `P0002` no conversation available for a coach reply. UI should preserve drafts and request IDs on uncertain send failures, provide retry, and clear all messages/drafts on sign-out or account change.

## Storage and concurrency

Tables and privileged mutation helpers live in the unexposed `messaging_private` schema, with RLS enabled. Public RPC wrappers use security invoker. Authenticated read grants exist only in the private schema so invoker reads obey RLS; direct table writes and sequence access are denied. The only elevated functions are internal verified-identity lookup and atomic mutations. Function privileges are explicitly revoked from PUBLIC/anon and granted only where required.

A conversation row lock serializes message insertion before assigning a monotonic identity ID. This prevents a delayed transaction's lower ID from committing after a read cursor has advanced. Send and mark-read both lock the conversation. Message sender, conversation ownership, creation time, IDs, and read cursors cannot be provided through direct writes. No message edit/delete endpoint is exposed.

## Verification and release

Run the standalone local SQL harness in `supabase/tests/messaging-backend.mjs` against its isolated PGlite database (details in that file). It loads the exact migration and asserts identity checks, RLS isolation, role spoofing, denied direct writes, pagination, idempotent retries, body validation, unread counts, and monotonic read cursors. Live deployment requires migration review, migration application, rollback-only RPC checks using synthetic identities, and the Supabase security advisor. No real client records should be modified during tests. `supabase/tests/messaging-rollback-smoke.sql` is the complete rollback-only live smoke transaction: it creates only synthetic Auth users and private conversation fixtures, leaves all client programs untouched, and emits a PASS result before rolling back. The PGlite harness also covers active/archived program gating, soft deletion, Unicode-only whitespace, and safe email reuse.

## Verified release state (2026-09-26)

The migration was deployed to the shared FWB Supabase project. The isolated harness passes 63 checks. The full rollback smoke passed against the deployed functions; follow-up queries confirmed zero synthetic users, conversations, messages, or read cursors remained. The security advisor added no findings relative to the existing project baseline. Performance review found only expected unused-index informational notices for the empty read-cursor table's foreign-key support indexes; those indexes are retained for ownership cleanup and referential integrity performance. No message-body notifications or existing client record changes were introduced.

Email infrastructure is deployed in a disabled state. Provider setup remains incomplete: no production `RESEND_API_KEY` or configured sender was available at verification time. The outbox and worker checks use isolated or mocked delivery; no real test emails were sent. The scheduler and worker configuration must be explicitly enabled only after setup above is complete.
