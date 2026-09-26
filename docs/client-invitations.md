# Client invitations

Coach admin → **Invite new client** offers **Save & email invite** and **Save & text invite**.

Both require the client's email and name. Text also requires a phone number. Email uses the existing Supabase Auth mail delivery. Text generates a secure setup link and shows **Open text message**, which opens the device's messaging app with the recipient and invitation filled in. The coach reviews and sends it there. **Copy invite link** is available when a messaging app is unavailable. Preparing a text never sends an email or an SMS automatically.

The authenticated `invite-client` function accepts `delivery: "email"` (also the default for older pages) or `delivery: "link"`. Link delivery verifies the coach, generates an invite, and checks the returned recipient before exposing its link. Links remain in the open invitation dialog and are not stored in browser storage.

Release the updated `supabase/functions/invite-client/index.ts` **before** publishing the static coach-admin files through the existing GitHub Pages workflow. The older function ignores the delivery field and sends email, so the frontend must not be released first. No SMS-provider setup or schema migration is required.

Local verification:

```sh
node --test tests/coach-invite-delivery.test.js tests/coach-client-invite-modal.test.js tests/invite-client-delivery.test.js tests/client-invite-onboarding.test.js
node --check js/coach-admin.js
```

The backend tests use Node's TypeScript stripping support (Node 22.13+). Tests mock authentication and delivery; they do not contact clients. Live SMTP delivery and native messaging-app behavior require a separate test with an authorized recipient after deployment.
