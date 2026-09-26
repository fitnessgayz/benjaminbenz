# Client and coach messaging

One private conversation per authenticated client, shared by that client and the existing verified coach administrators. Message ownership is bound to the client's stable Auth UUID. All four endpoints use the caller's ordinary Supabase authenticated session; never a service key. No push, email, or external notification delivery is performed.

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
