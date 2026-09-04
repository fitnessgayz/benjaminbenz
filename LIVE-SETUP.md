# Client Portal Live Setup

Use this for the first live test client account.

## 1. Run the database setup

Apply the versioned schema in `supabase/migrations/` to the live project:

```sh
supabase link --project-ref <your-project-ref>
supabase db push
```

This creates:

- Client programs
- Progress check-ins
- Workout logs
- Coach-only permissions

Then, in the Supabase SQL Editor, paste and run `supabase/seed-first-live-client.sql`
to create the starter Benjamin test program for `benzzzzy@gmail.com`.

## 2. Deploy the invite function

Deploy `supabase/functions/invite-client`.

Set this secret in Supabase functions:

```text
COACH_ADMIN_EMAILS=benjaminbenz.fit@gmail.com
```

To add another coach later, add their email to `COACH_ADMIN_EMAILS` above
**and** insert it into the `public.coach_admins` table (the database's own
admin check doesn't read the env var):

```sql
insert into public.coach_admins (email) values (lower('new-coach@example.com'));
```

The function already allows:

- `https://benjaminbenz.com`
- `https://www.benjaminbenz.com`
- local testing at `127.0.0.1:4177`
- local testing at `127.0.0.1:4191`

## 3. Deploy the password notification function

Deploy `supabase/functions/notify-client-password-set`.

Set these secrets in Supabase functions:

```text
RESEND_API_KEY=your Resend API key
PASSWORD_NOTIFICATION_FROM=Fitness with Benjamin <notify@your-verified-domain.com>
PASSWORD_NOTIFICATION_EMAILS=benjaminbenz.fit@gmail.com
```

The notification email is sent after a client successfully creates their portal password. It includes the client email and completion time, never the password.

## 4. Deploy the website contact form function

Deploy `supabase/functions/send-contact-message`.

Set these secrets in Supabase functions:

```text
RESEND_API_KEY=your Resend API key
CONTACT_MESSAGE_FROM=Fitness with Benjamin <notify@your-verified-domain.com>
CONTACT_MESSAGE_EMAILS=fwb@benjaminbenz.com
```

Set `CONTACT_MESSAGE_EMAILS` to the inbox that should receive website contact form messages.

## 5. Deploy the coach calendar function (optional)

Deploy `supabase/functions/coach-calendar-auth` to show today's booked
sessions on `/coach-overview.html`, pulled from a Google Calendar.

In Google Cloud Console, enable the **Google Calendar API** on the same
project used for Google Health (or a new one), and add
`https://www.googleapis.com/auth/calendar.readonly` to the OAuth consent
screen's scopes. You can reuse the existing `GOOGLE_HEALTH_CLIENT_ID` /
`GOOGLE_HEALTH_CLIENT_SECRET` if that project already covers this scope, or
set dedicated ones:

```text
GOOGLE_CALENDAR_CLIENT_ID=your OAuth client ID
GOOGLE_CALENDAR_CLIENT_SECRET=your OAuth client secret
GOOGLE_CALENDAR_ID=the calendar ID to read sessions from (defaults to "primary")
```

`GOOGLE_CALENDAR_REDIRECT_URI` is optional — it defaults to
`<site origin>/coach-overview.html`, which is where the OAuth flow lands
back after the coach approves access.

A calendar event counts as a client session when its title contains the
word "training" (case-insensitive) — e.g. "Alex training". The event's
first non-coach attendee email is matched against `client_programs` to show
the client's name; unmatched attendees show the raw email instead.

## 6. Create the first login

Use Supabase Authentication to invite or create the coach admin:

```text
benjaminbenz.fit@gmail.com
```

Then invite or create the first test client:

```text
benzzzzy@gmail.com
```

Use the coach admin login for:

- Coach admin: `/coach-admin.html`

Use the test client login for:

- Client dashboard: `/client-login.html`

## 7. Test the loop

1. Sign in as the client.
2. Open Workout 1.
3. Log weights and reps.
4. Confirm the entries appear under Previous.
5. Sign in as coach.
6. Confirm the training logs and progress check-ins appear.
7. Create or edit a program manually, then save it.
