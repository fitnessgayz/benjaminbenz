# TestFlight and Sentry setup

The iOS workflow tests pull requests, then signs and uploads trusted `main` builds to TestFlight. It also uploads the matching dSYM files to Sentry. Signing credentials and the Sentry upload token live in GitHub **repository secrets**. This setup works with GitHub Free and does not use a GitHub deployment environment.

This guide prepares only the existing coach app. Its bundle stays unchanged. The separate native client app is owned by `fitnessgayz/fwb-ios` and must create/use `com.benjaminbenz.fwb`, never this coach app entry.

| App setting | Value |
| --- | --- |
| Bundle identifier | `com.benjaminbenz.fwbcoach` |
| Apple Developer team | `5Q4FU299QH` |
| Xcode project / scheme | `FWB-iOS-App/FWBCoach.xcodeproj` / `FWBCoach` |
| Release workflow | `.github/workflows/ios.yml` |
| Release branch | `main` |
| Sentry environment in CI | `testflight` |
| TestFlight group | `FWB Coach Beta` (internal, automatic distribution) |

You need admin access to the approved `fitnessgayz/benjaminbenz` repository with a `main` branch, an active Apple Developer membership with access to this app, and a Sentry organization/project. GitHub Free supports this repository-secret setup. Review the account's Actions minutes and storage; review the existing usage/budget before running macOS builds. See [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

The owner has approved `fitnessgayz/benjaminbenz` as the iOS release destination. It is a public repository, so signing credentials must remain repository secrets and the release job must stay restricted to trusted `main` push or manual-dispatch events. Forked pull requests and feature branches must never receive signing credentials. The repository must retain `FWB-iOS-App/`, `scripts/ios/`, and `.github/workflows/ios.yml` at those same paths.

On your Mac, have Python 3.9 or newer and the [GitHub CLI](https://cli.github.com/) installed and signed in with `gh auth login`. The setup helper does not install tools, create accounts, change repository visibility, or start a release.

Keep the `.p8`, `.p12`, provisioning profile, and passwords outside the checkout, with access limited to you. Keep recovery copies in your password manager or another private store. Enter credentials directly in your own Terminal when prompted; do not paste them into chat, issue comments, or a committed configuration file.

## 1. Get the Apple upload key

1. Open App Store Connect → **Users and Access → Integrations → App Store Connect API**. If API access is unavailable, the Account Holder must request it.
2. Under **Team Keys**, have an Account Holder or Admin generate a dedicated key, such as `FWB GitHub TestFlight`. Use **App Manager** for this workflow. Apple team keys apply across the account's apps; they cannot be restricted to this one app.
3. Record the **Key ID** and **Issuer ID**, then download the `.p8` private key. Apple allows the private key download only once. Retain that file privately. Use a team key, not an individual key, for this Issuer ID setup. See Apple's [API access guide](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api) and [key creation guide](https://developer.apple.com/documentation/AppStoreConnectAPI/creating-api-keys-for-app-store-connect-api).

The coach lane uses Developer upload access and read-only processing checks. It deliberately bypasses Pilot's beta metadata updates, including changelog and external auto-notify settings, which otherwise require App Manager access even when submission is skipped. Automatic internal group distribution remains enabled in Apple. Admin is unnecessary for the upload key. See [Fastlane's role requirements](https://docs.fastlane.tools/actions/pilot/#role-for-app-store-connect-user).

## 2. Export the signing identity and create its profile

The upload key authenticates to App Store Connect. The signing identity below signs the app; both are needed.

1. In Xcode → **Settings → Accounts**, select your Apple account and team `5Q4FU299QH`, then **Manage Certificates**. Reuse a valid **Apple Distribution** identity if you have its private key. Otherwise create a local Apple Distribution certificate using the `+` control, if your team permissions allow it.
2. Open **Keychain Access → login → My Certificates**. Find the Apple Distribution certificate for this team and expand it to verify that its private key is present. Export the signing identity as a password-protected `.p12`, including the private key. Choose a strong password and retain it privately. A downloaded `.cer` alone, or a cloud-managed certificate without a local private key, is insufficient. See Apple's [signing-certificate export guidance](https://developer.apple.com/documentation/xcode/sharing-your-teams-signing-certificates).
3. In Apple Developer → **Certificates, Identifiers & Profiles → Identifiers**, open `com.benjaminbenz.fwbcoach` and confirm **HealthKit** and **Push Notifications** are enabled. Shared exercise logging retains HealthKit compatibility, but the coach app does not start personal Health observation. Native coach notifications require a profile supplying the production push entitlement.
4. Under **Profiles**, press `+`, choose the **App Store Connect** distribution type, select this explicit App ID, and select the same Apple Distribution certificate exported into your `.p12`. Name the profile and download its `.mobileprovision` file. Use an App Store distribution profile, not Development, Ad Hoc, or Enterprise. See [Apple's profile instructions](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile).

The helper validates the profile's app, team, expiry, distribution type, and required capabilities. It does not prove that the `.p12` password/private key matches the selected certificate; the signing job performs that check. If the certificate expires or app capabilities change, [regenerate the profile](https://developer.apple.com/help/account/provisioning-profiles/edit-download-or-delete-profiles) and replace the corresponding GitHub secrets.

## 3. Prepare the Sentry project

1. In Sentry, select the intended organization and create or choose an **Apple / iOS** project for this app. Record the organization and project **slugs**, not their display names.
2. Open **Project Settings → Client Keys (DSN)** and copy the modern public DSN exactly, including its regional ingest hostname. This is the app's event destination and is embedded in the app; it is different from the private upload token. See [Sentry's DSN guide](https://www.sentry.help/en/articles/13964441-what-is-a-sentry-dsn).
3. In organization **Settings → Auth Tokens**, create a dedicated organization token for CI, such as `FWB iOS symbols`, with the organization CI scope `org:ci`. Retain the token privately. This scope supports CI/deployment uploads; do not grant unrelated administrative permissions. If your installation uses internal integrations instead, an organization Manager/Admin can follow Sentry's [internal token instructions](https://docs.sentry.io/api/guides/create-auth-token/) with the permissions required for debug-information uploads. See [Sentry's scope reference](https://docs.sentry.io/api/permissions/).
4. Keep the service URL at `https://sentry.io` for standard Sentry SaaS. Use your own service base URL only for a different Sentry installation. Do not substitute the DSN's ingest hostname for this URL.
5. Enable **Prevent Storing of IP Addresses** in the project's security/privacy settings. Review the event payload during the verification below before sharing the build broadly.

Only dSYM files are uploaded by this workflow; source bundles are not included. `SENTRY_AUTH_TOKEN` is available to CI, never embedded in the app.

## 4. Provision repository settings from your Mac

Use GitHub → repository **Settings → Secrets and variables → Actions** for release credentials. The workflow enforces tests, the exact approved repository, and the trusted `main` branch directly; no GitHub deployment environment needs to be created.

All commands below run from the repository root. Use the exact approved coach repository `fitnessgayz/benjaminbenz`. The default/dry-run command is offline, reads no credential files, and lists names only:

```sh
python3 scripts/ios/configure-release-secrets.py --dry-run
python3 scripts/ios/configure-release-secrets.py --check --repo fitnessgayz/benjaminbenz
python3 scripts/ios/configure-release-secrets.py --apply --repo fitnessgayz/benjaminbenz
```

`--check` verifies the exact approved repository, admin access, and the `main` branch without changing anything. `--apply` asks for file paths and hidden secret input in your local Terminal, validates everything it can locally, rechecks GitHub access, and uploads the settings below. It does not trigger the workflow.

| Repository secret | Enter locally |
| --- | --- |
| `ASC_KEY_ID` | Team API key's Key ID |
| `ASC_ISSUER_ID` | Team API Issuer ID |
| `ASC_PRIVATE_KEY_P8_BASE64` | Path to the downloaded `.p8`; helper encodes it |
| `IOS_DISTRIBUTION_P12_BASE64` | Path to the exported identity; helper encodes it |
| `IOS_DISTRIBUTION_P12_PASSWORD` | The export password, using hidden input |
| `IOS_PROVISIONING_PROFILE_BASE64` | Path to the App Store profile; helper encodes it |
| `SENTRY_AUTH_TOKEN` | The dedicated Sentry CI token, using hidden input |

| Repository variable | Enter locally |
| --- | --- |
| `SENTRY_DSN` | The project's public DSN |
| `SENTRY_ORG` | Organization slug |
| `SENTRY_PROJECT` | Project slug |
| `SENTRY_URL` | Optional service URL; defaults to `https://sentry.io` |

These appear in GitHub → repository **Settings → Secrets and variables → Actions** and are read directly by the deployment job. CI fixes the Sentry event label `SENTRY_ENVIRONMENT` to `testflight`; there is no repository variable to configure for it. This Sentry label is independent of GitHub deployment environments.

The helper sends values to [`gh secret set`](https://cli.github.com/manual/gh_secret_set) and [`gh variable set`](https://cli.github.com/manual/gh_variable_set) through standard input. It does not put values in arguments or write a plaintext intermediate file. CLI output is suppressed, and progress displays setting names only. GitHub CLI encrypts secrets before uploading. Base64 is just the binary-file transport format; the helper enforces GitHub's [48 KB secret limit](https://docs.github.com/en/actions/reference/security/secrets) after encoding.

To replace just one set of credentials later:

```sh
python3 scripts/ios/configure-release-secrets.py --apply --component apple --repo fitnessgayz/benjaminbenz
python3 scripts/ios/configure-release-secrets.py --apply --component sentry --repo fitnessgayz/benjaminbenz
```

A failed upload may have updated earlier settings; rerun the selected component once access is fixed. The helper deliberately does not print raw CLI errors containing possible credentials. Use GitHub's settings page to confirm the names and update times; saved secret values cannot be read back.

## 5. Run the release and enable internal distribution

After provisioning, use GitHub **Actions → iOS TestFlight → Run workflow**, choosing `main`, or push any change to `main`. Pull requests run unsigned checks. Signed uploads run only for `fitnessgayz/benjaminbenz` on trusted `main` push/dispatch events after tests pass and the release verifies the coach-only entry point, bundle, and profile.

CI derives a unique increasing build number from the run/attempt and the latest uploaded build. It does not rely on the local Xcode build number `8`; the archive gets a valid dotted Apple build number. Avoid manually uploading the same build number while CI is running.

In App Store Connect, open the existing app → **TestFlight** and wait for Apple's processing. Address any export-compliance or account-agreement questions there. A successful upload does not itself invite every tester.

Use the **FWB Coach Beta** internal group, enable **automatic distribution**, and add only explicitly approved eligible App Store Connect users. They accept the invitation in TestFlight. If automatic distribution is off, this release lane stops before uploading; enable it once in the group's Settings. CI waits for the exact uploaded build to finish processing, without external review or external tester notifications. Apple documents the group controls in [Add internal testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers). This workflow does not submit external beta review, automatically invite external testers, or publish to the App Store; external testing has a separate [TestFlight review process](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).

## 6. Verify diagnostics and update the privacy disclosure

The native integration starts in configured Release builds. With no valid DSN it remains inactive. Debug builds are inactive by default; tests, previews, and UI audit runs never send events. There is no new in-app opt-in switch.

Configured builds report crashes and selected terminal failures using fixed operation names and failure categories. The sanitizer removes raw error messages, user identity, requests, breadcrumbs, arbitrary context/tags, local variables, and source context. Account emails, HealthKit values, readiness/PAR-Q answers, and workout/nutrition contents are not intentionally attached. Network tracing, performance/profiling, replay, screenshots, view hierarchy, sessions, logs, metrics, and attachments are disabled. Build identifiers, stack addresses, and selected OS/device metadata remain for diagnosis.

For a controlled local verification:

1. Build Debug with Xcode build settings `SENTRY_DSN` set to the public project DSN and `SENTRY_ENVIRONMENT` set to `development`.
2. In **Edit Scheme → Run → Arguments → Environment Variables**, temporarily add `SENTRY_ENABLE_DEBUG=1` and `SENTRY_SMOKE_TEST=1`.
3. Run the normal app, without the UI audit launch option. It sends one fixed `integration.verification` error; it does not intentionally crash.
4. Confirm the event arrives in the intended Sentry project with the expected environment and release `com.benjaminbenz.fwbcoach@VERSION+BUILD`. Inspect the event data for unexpected personal/health/workout content. Remove both scheme environment variables after the check.
5. For the CI build, confirm the workflow's symbol-upload step succeeded and Sentry shows the corresponding debug files. A smoke event verifies delivery; a real crash stack from that exact build verifies crash collection and symbolication. Do not deliberately crash a tester's active workout.

Before distributing configured diagnostics, review the published privacy policy and App Store Connect **App Privacy** answers for crash data and other diagnostics used for app functionality, including Sentry as a third-party processor. The app manifest declares those categories as not linked to identity and not used for tracking; ensure the actual service settings and disclosures remain consistent. A privacy manifest does not replace the questionnaire or policy. See Apple's [App Privacy instructions](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy). TestFlight also has its own [crash-report sharing behavior](https://developer.apple.com/documentation/xcode/acquiring-crash-reports-and-diagnostic-logs), independent of this Sentry integration.

## Troubleshooting and renewal

| Symptom | Check |
| --- | --- |
| Helper cannot verify access | Exact approved `fitnessgayz/benjaminbenz`, GitHub CLI login, repository admin permission, and existing `main` branch |
| No signing identity / failed import | `.p12` includes the private key, password is correct, and the certificate is valid |
| Provisioning profile mismatch | Explicit bundle ID, correct team/certificate, App Store profile type, HealthKit capability, and expiry |
| Upload authorization failure | Team API Key ID/Issuer ID pair, original `.p8`, role, active membership, and outstanding Apple agreements |
| Build missing from tester's app | Apple processing/compliance complete, correct internal group/build assignment, and accepted tester invitation |
| Sentry symbol upload fails | Token is valid, organization/project slugs match the DSN project, service URL is correct, and token permits CI uploads |
| No local smoke event | Build has a valid DSN, both temporary Run variables are set, and this is a normal launch rather than a test/UI audit |

Rotate credentials by creating replacements in the owning service, rerunning the relevant helper component, and verifying a build before retiring the previous credentials. For a known compromised credential, revoke it promptly and replace it before the next release. No Apple certificate or key is revoked by the helper.

The helper's offline safety checks can be rerun with:

```sh
python3 scripts/ios/configure-release-secrets.py --self-test
```
