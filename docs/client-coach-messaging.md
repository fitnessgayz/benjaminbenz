# Message your coach

Clients and coaches use the same conversation in the FWB Training iOS app and on the website. Sign in with the same account on either platform to pick up where you left off.

## Clients

Open **Home → Message coach**, write your message, and tap **Send**. Your first message starts the conversation. You need an active assigned program to start one. The badge on **Message coach** shows unread replies.

## Coaches

Open **Inbox** in the coach workspace, choose a client, and reply. You can also choose **View messages** from a client's details. Conversations appear after clients send their first message. The inbox shows the latest message and unread count for each client.

The inbox is shared by the verified coach administrators who already have access to the coach workspace. Each administrator has their own read status.

## Keeping a conversation up to date

Messages refresh while the app or website is open. Reopening it refreshes the conversation, and you can also refresh manually. Earlier messages remain available through **Load earlier messages**. New replies do not pull you away from older messages you are reading.

If a send cannot be confirmed, retry the same message. Retrying preserves its request ID so a connection failure does not create a duplicate. An unsent draft remains in memory while that account stays signed in; it is cleared when you sign out or close the app or page.

## Push notifications

Each new message creates a generic notification for the recipient. Client replies
use **New message from your coach** and open the shared conversation. Client
messages use **New client message** and open the coach Inbox. The private message
body is never copied into the notification or shown on the Lock Screen.

Web push delivery uses the existing FWB browser subscription and notification
preferences. On iPhone and iPad, the website must be added to the Home Screen
before Safari can grant web-push permission. The native iOS app also displays the
same notification in its in-app notification inbox; native APNs banners require
the signed app's Push Notifications entitlement and an active APNs delivery key.

Native app delivery connects directly to Apple's APNs provider API, so there is
no third-party notification fee. Before release, enable Push Notifications for
`com.benjaminbenz.fwbcoach`, regenerate the App Store provisioning profile, and
configure the APNs team ID, key ID, and downloaded `.p8` private key as protected
Edge Function secrets. The private key must never be committed.

## Email notifications

Email delivery is deployed but currently disabled while the sending account and verified sender are configured. Messages and unread badges already work in FWB Training.

After email delivery is enabled, each new incoming message sends an email notification: client messages notify verified coaches, and coach replies notify the client's verified email address. Messages sent from either iOS or the website use the same notification system. Retrying a send does not create another notification for the same message.

The email contains a notice and a link, with the private message body kept inside FWB Training. **Open messages** takes clients straight to their conversation on the website and coaches to **Inbox**. If you need to sign in first, the link returns you to messages afterward. The links contain no client email address or other client identity.

Messages support plain text up to 4,000 characters. Attachments are not included.

Implementation and database verification are described in [messaging-backend.md](messaging-backend.md).
