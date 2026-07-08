# Client Portal Live Setup

Use this for the first live test client account.

## 1. Run the database setup

In Supabase:

1. Open the project.
2. Go to SQL Editor.
3. Paste the contents of `supabase-live-setup.sql`.
4. Run it.

This creates:

- Client programs
- Progress check-ins
- Workout logs
- Coach-only permissions
- The starter Benjamin test program for `benzzzzy@gmail.com`

## 2. Deploy the invite function

Deploy `supabase/functions/invite-client`.

Set this secret in Supabase functions:

```text
COACH_ADMIN_EMAILS=benjaminbenz.fit@gmail.com
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

## 5. Create the first login

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

## 6. Test the loop

1. Sign in as the client.
2. Open Workout 1.
3. Log weights and reps.
4. Confirm the entries appear under Previous.
5. Sign in as coach.
6. Confirm the training logs and progress check-ins appear.
7. Create or edit a program manually, then save it.
