# FWB Apps Script deployment bundle

Version 3 was deployed on September 26, 2026 at 8:22 PM, as displayed by Google Apps Script. The deployed handler saves each new signup to the existing `App Interest` sheet and sends one notification to `benjaminbenz.fit@gmail.com`. Duplicate email addresses continue to return a success page without adding a row or sending another notification.

[Web-app endpoint](https://script.google.com/macros/s/AKfycbwvaSYvFV-Ls22i_K1httUktwmOgmeIIqPdurdyGvH99R_tM7IgJUfu0kqU7j1EoLjZ/exec). The signup page sends a POST request to this URL; opening it directly does not submit a signup.

[Open the Apps Script project](https://script.google.com/u/0/home/projects/1AW34lMKDOV40e9vGDE5GkfmUs4k95VOh21odSBz4_WnvdSqDDoZMx6wz/edit).

- `Code.gs`: validated signup handler, duplicate protection, and new-signup email notification.
- `appsscript.json`: V8 manifest with the Sheets and send-mail OAuth scopes and public web-app configuration.
- `deployment.json`: observed script ID, deployment ID, version, endpoint, permissions, verification results, and source hashes.
- `live-test-report.md`: live submission, notification, duplicate, and cleanup evidence.
- `../../app-interest.html`: signup-page source connected to the deployed endpoint. A production copy is published under an opaque root filename on the main domain without a navigation link.
- `../../tests/app-interest-backend.test.cjs`: offline Apps Script API simulation. From the repository root, run `node --test tests/app-interest-backend.test.cjs`. The latest run passed all 68 tests.

## Notification behavior

Each genuinely new signup sends an email with the person's name, email address, primary goal, training experience, device, and a link to the response sheet. Phone numbers are intentionally omitted from the alert. Duplicate submissions do not send an alert.

The row is flushed to Google Sheets before the email is attempted. A temporary email-delivery failure is logged without changing the successful signup response or removing the saved row. There is no automatic retry queue for a failed alert, so the sheet remains the source of truth.

Google authorization for the send-mail scope was completed on September 28, 2026. Live verification confirmed one alert for a new synthetic signup, no second alert for its mixed-case duplicate, and a separate alert for a real signup received during the test. The synthetic sheet row was removed afterward and the real signup was preserved. Six signups received before send-mail authorization did not generate retroactive alerts.

## Data and input safeguards

The handler verifies the exact A1:L1 headers before inspecting signup emails or writing a row. Missing, moved, renamed, or incomplete headers cause a controlled failure. It does not insert headers, overwrite cells, create sheets, or repair data.

Headers: Signup date; Name; Email; Phone (optional); Primary fitness goal; Training experience; Device; Contact consent; Status; Invitation date; Follow-up date; Notes.

Input validation, formula escaping, a script lock, case-insensitive email deduplication, and controlled response pages protect the submission path. The response-page return link points to the FWB homepage.

## Exact deployment permissions

- OAuth: `https://www.googleapis.com/auth/spreadsheets` and `https://www.googleapis.com/auth/script.send_mail`.
- Web app execution: `USER_DEPLOYING`.
- Web app access: `ANYONE_ANONYMOUS` so the public signup form can post without Google sign-in.

The Sheets scope permits the deploying account to read and write Google Sheets, while the code opens only the fixed spreadsheet ID and the `App Interest` tab. The send-mail scope permits the script to send the notification; `MailApp` does not provide inbox access. The script has no Drive, Gmail-reading, external-request, or trigger-management scope. It does not change spreadsheet sharing or expose existing rows through a response.

Official references:
- https://developers.google.com/apps-script/reference/mail/mail-app
- https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#openById(String)
- https://developers.google.com/apps-script/guides/services/authorization
- https://developers.google.com/apps-script/manifest/web-app-api-executable

## Publication boundary

The signup page is published at an unlisted address on the main domain and is not linked from the website. Its `noindex` directive asks search engines not to index it. Anyone who receives the address can still open or reshare it. The Apps Script response returns visitors to `https://benjaminbenz.com/` after submission.
