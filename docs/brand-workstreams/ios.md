# FWB iOS / Native Brand Workstream

Status: coordinated discovery and implementation specification. No production code or assets were changed in this pass.

This workstream extends the [FWB cross-platform brand contract](./brand-contract.md) and the [brand and UX audit](../fwb-brand-audit-2026-09-28.md). If this document conflicts with either, the shared contract governs until the team records a cross-platform decision.

## Outcome

FWB's native boundary should feel like the same coaching experience as the website and mobile web app: energetic but calm, personal rather than generic, and precise without becoming clinical. The iOS implementation should use the approved lime, near-black, and warm-neutral system and the canonical FWB mark. Native code should add platform quality—fast launch, clear recovery, accessible system behavior—not a separate visual identity.

The immediate native scope in this repository is **FWB Coach**. The current app is a SwiftUI/WKWebView shell around the coach web app, so the real brand journey is:

`Home Screen icon → iOS launch screen → native loading state → web authentication if needed → coach home`

Those five moments must be designed and tested as one sequence.

## Evidence-backed inventory

### What ships in the current iOS target

- `AppRootView` always renders `CoachWebAppView`; it does not branch on `AppSession` and does not call session restoration (`FWBCoach/FWBCoach/Views/AppRootView.swift:3-8`).
- The WebView opens the deployed coach admin page directly (`FWBCoach/FWBCoach/AppConfiguration.swift:8`). If no valid web session exists, `js/coach-admin.js` redirects to `coach-login.html` after checking Supabase session state.
- `LoginView`, `CoachTabView`, `HomeView`, `ClientsView`, `ProgramDetailView`, `SettingsView`, `AppSession`, and the native Supabase client are compiled but unreachable from the current root. They represent a previous or future native direction, not the current user journey.
- The target is named and displayed as `FWB Coach`, is iPhone-only, and supports iOS 17+ (`FWBCoach/FWBCoach.xcodeproj/project.pbxproj:265-308`).
- The app forces light appearance (`FWBCoach/FWBCoach/FWBCoachApp.swift:9-10`). Dark mode is therefore not a current product promise and should not be introduced only in isolated native states.

### Current identity boundary

- The only iOS app icon is a 1024×1024 PNG with a near-black field, white `F/B`, metallic-gold `W` and barbell, plus the small text `FITNESS WITH BENJAMIN`. It is byte-identical to `fwb-home-icon-1024.png`, so the native coach app, client PWA, coach PWA, and public-site PWA all inherit the same legacy artwork.
- `Assets.xcassets` has no named color sets and no canonical mark/lockup asset. `AppConfiguration.swift:11-15` hard-codes four approximate colors; its lime is roughly `#D6FF3D`, not the approved `#D6FF35`.
- The native loading screen redraws the brand as the letters `FWB` in a lime circle (`CoachWebAppView.swift:30-49`) rather than using the icon's monogram or a canonical asset. The icon, launch state, and loading mark are therefore visibly different.
- Xcode generates the launch screen automatically, but the project config does not specify a branded launch image or background (`project.pbxproj:271-275, 296-300`). The first explicitly branded frame is the native loading overlay.
- Loading uses a deep field and lime, while failure switches to a white card and exposes `error.localizedDescription` verbatim (`CoachWebAppView.swift:51-75, 174-176`). This can make the recovery experience feel technical and inconsistent with FWB's calm trainer voice.
- The WebView uses a persistent default data store and reload-revalidating requests (`CoachWebAppView.swift:88-99`), so web authentication can persist within the app. It does not share Safari's session automatically.

### Web and native handoff

- `coach.webmanifest` correctly names the product `FWB Coach`, but points at the shared legacy icon family and uses `#050505`, while the approved deep field is `#080A08`.
- `client.webmanifest` still names the client product `Fitness with Benjamin` / `FWB`, rather than `FWB Training`, and uses the same icon family. This matters to the future client-native/App Store story even though no client Xcode project is present in this repository.
- The coach web login uses `FWB Coach`, but its task labels still include `Coach access`; the coach workspace still exposes `Coach Admin`, `Coach access`, and `Fitness with Benjamin` in prominent UI. The native shell cannot create continuity until those first web frames adopt the shared naming contract.
- The coach WebView initially requests `coach-admin.html`, then unauthenticated users are redirected by JavaScript. This can produce multiple native loading transitions and makes the first-open path depend on a protected page painting before authentication routing completes.
- The public `app-interest.html` describes a generic `FWB iOS app` and uses `DTF—Dedicated to Fitness`. It should instead identify the client product as `FWB Training` and use the approved promise and voice.
- `fwb-training-support.html` and `fwb-training-privacy.html` describe a substantial client iOS experience, Apple Health, Watch, notifications, offline recovery, and web synchronization. No client-native project is present in this repository, so implementation and App Store review evidence for those claims must be located before client-native branding or store assets are finalized.
- The AI product still uses `FWB Coach` in its support/privacy/submission surfaces. That directly collides with the approved name of the human coach app and must become `FWB Training Assistant` before App Store or support messaging is locked.

## Shared brand direction

### Product expression

- Master brand: **Fitness with Benjamin**
- Native coach product: **FWB Coach**
- Client product referenced from native/web experiences: **FWB Training**
- AI feature: **FWB Training Assistant**
- Shared promise: **Train with intention. Feel your progress.**

FWB Coach should feel like the working side of the same personal relationship clients experience in FWB Training. It may be denser and more operational, but it should not become an “admin dashboard” brand.

### Visual posture

- Use deep ink for confidence and brief brand moments.
- Use warm canvas and white surfaces for sustained reading and data work.
- Reserve lime for the most important action, current selection, meaningful progress, and the compact mark.
- Keep status green, amber, red, and informational blue semantic; do not substitute lime for success.
- Keep imagery authentic and coaching-led when used in App Store or acquisition material. The utility-heavy coach app itself does not need decorative photography.

## P0 changes

### 1. Resolve the actual native architecture before visual implementation

Choose and document one path:

1. **Recommended for the current release:** treat FWB Coach as a branded WebView shell, remove or quarantine the unreachable native feature flow, and invest in a first-class launch/auth/error bridge.
2. **Future alternative:** restore the native session router and native tabs as the product, with web content only where intentionally embedded.

Do not style both paths independently. That would create two component systems and two authentication experiences inside one target.

### 2. Replace the legacy installed identity as one coordinated release

- Produce one canonical vector FWB mark from the approved master artwork.
- Export an app icon with a `#080A08` field, white `F/B`, lime `W`/barbell accent, and no small tagline.
- Update iOS, client PWA, coach PWA, Apple touch icons, favicons, loading mark, and authentication lockups from the same source package.
- Test the client and coach apps side by side. Product names should do most of the differentiation. If users cannot reliably distinguish two installed products, approve a restrained composition difference from the same mark system; do not invent a second palette or tiny unreadable badge.
- Validate default, dark, and tinted Home Screen appearances even while the in-app experience remains light-first.

### 3. Create a stable native-to-web entry route

The iOS app should open a stable coach-app bootstrap route rather than a versioned `coach-admin.html` URL. The route should determine authenticated vs signed-out state before showing the first meaningful frame and preserve intended deep links such as Inbox.

Required behavior:

- signed in → coach home or requested deep link;
- signed out/expired → FWB Coach sign-in with a clear return path;
- offline → native branded recovery without losing the intended destination;
- maintenance/server failure → human explanation, retry, and support path;
- external destinations → clearly leave the app or open an appropriate system surface.

### 4. Make launch, loading, auth, and coach home continuous

- Configure an explicit launch background using `ink-deep` and the canonical mark, with no animation or transient copy.
- Use the same mark, scale, field color, safe-area treatment, and product name in the native loading overlay.
- Use copy such as `Preparing your coaching workspace` rather than an unexplained spinner. Announce it once to VoiceOver.
- Make the web sign-in and first coach frame use the same lockup, exact tokens, and calm hierarchy.
- Remove `Coach Admin`, `Coach access`, and text-constructed FWB circles from user-facing frames.
- Avoid a white flash between launch, redirects, and WebView paint by coordinating native background, manifest background, HTML initial background, and WebView opacity/ready state.

### 5. Establish one token and asset source of truth

Add named colors to `Assets.xcassets` and expose semantic Swift accessors. Values and meanings must match CSS, not merely look close.

| Shared semantic role | iOS asset/accessor | Value | Native use |
| --- | --- | --- | --- |
| `brand-primary` | `BrandPrimary` | `#D6FF35` | Primary action, selected state, compact mark |
| `brand-primary-hover` | `BrandPrimaryPressed` | `#C8EE2F` | Pressed/highlighted action only |
| `brand-primary-ink` | `BrandPrimaryInk` | `#171A17` | Text/icons on lime |
| `ink` | `Ink` | `#171A17` | Primary text and controls |
| `ink-deep` | `InkDeep` | `#080A08` | Launch/loading/icon field |
| `canvas` | `Canvas` | `#F2F3EE` | Main background |
| `surface-soft` | `SurfaceSoft` | `#F7F8F4` | Inputs and nested groups |
| `surface` | `Surface` | `#FFFFFF` | Cards, sheets, dialogs |
| `text-muted` | `TextMuted` | `#666B62` | Secondary text |
| `border` | `Border` | `#DCDED7` | Dividers/outlines |
| `focus` | `Focus` | `#718A18` | High-contrast focus treatment |
| `danger` | `Danger` | `#B52D25` | Errors/destructive actions |
| `warning` | `Warning` | `#8C5A0A` | Warnings |
| `success` | `Success` | `#287A3D` | Confirmed success |

Add high-contrast variants where they materially improve system accessibility. Do not add a partial native dark theme while the WebView and product remain light-only; dark appearance should be a coordinated cross-platform phase.

## P1 changes

### Native loading and recovery components

- Replace the raw `localizedDescription` with mapped user-facing states: offline, timed out, server unavailable, session expired, and unknown failure.
- Tell users what remains safe: for example, `Your coaching data is safe. Reconnect and try again.`
- Add `Try again` and a secondary `Get support` action when retry cannot resolve the issue.
- Preserve deep-link intent across retry and reauthentication.
- Delay nonessential loading detail so a fast launch does not flash a spinner or announce transient state.

### Authentication

- Keep authentication in one layer. If web auth remains authoritative, remove the impression that native `AppSession` is active and test persisted/temporary sessions in `WKWebsiteDataStore` deliberately.
- Use the canonical `FWB Coach` lockup, `Welcome back`, and a short task-oriented line.
- Make password reset, disabled, loading, validation, success, and expired-session states match FWB Training patterns.
- Do not call the client product `FWB Client`; use `FWB Training` in native and web copy.

### App Store and support identity

- Create a dedicated FWB Coach support/privacy landing path or explicitly extend the master policy to cover the coach app. Do not use the AI `FWB Coach` pages for the human coach product.
- Make App Store subtitle, description, screenshots, and privacy answers use the approved architecture and promise.
- Verify whether web analytics loaded inside the app must be reflected in App Store privacy disclosures.
- Show real states in screenshots: coach home, clients, inbox, and a selected client workspace. Avoid screenshots dominated by the current fifteen-item navigation.

### Future client-native alignment

When the FWB Training native source is available, reuse this token/asset package and continuity checklist. Client-specific capabilities—Apple Health, Watch, push notifications, offline workout recovery, media, and account deletion—must be validated against the published support/privacy copy before store submission. Do not infer that the current FWB Coach target implements those capabilities.

## Accessibility requirements

### Native shell

- Support Dynamic Type without clipped brand copy or fixed-height text containers. Replace fixed display sizes with text styles or scaled metrics when native screens become reachable.
- Give the mark an accessibility label only when it conveys identity; hide redundant decorative copies.
- Announce loading once, move VoiceOver focus to a persistent error heading on failure, and return focus to meaningful web content after successful load.
- Honor Reduce Motion, Differentiate Without Color, Button Shapes, Bold Text, and Increase Contrast where applicable.
- Keep interactive targets at least 44×44 points and preserve sufficient spacing at accessibility text sizes.
- Do not encode selection, unread, success, or failure through color alone.

### Web content inside iOS

- Support text enlargement to at least 200% without horizontal page scrolling for primary flows.
- Preserve semantic headings, landmarks, labels, error association, live regions, keyboard/focus order, and visible focus.
- Honor `prefers-reduced-motion` and `prefers-contrast` where supported.
- Respect safe-area insets and the software keyboard; bottom navigation, dialogs, and primary actions must remain reachable.
- Test VoiceOver transitions across the SwiftUI/WebKit boundary, not only each layer in isolation.

### Contrast and icon checks

- Use ink on lime; never white text on lime.
- Validate every component state in context, including disabled and pressed states—not just token pairs.
- Review icon/mark legibility at 20, 29, 40, 60, 120, and 180 points plus the 1024-pixel store asset.
- Ensure the simplified mark remains recognizable in notification, Spotlight, Settings, App Library, and tinted Home Screen contexts.

## Dependencies on the website and mobile-web workstreams

1. **Canonical asset package:** vector mark, wordmark, FWB Coach lockup, FWB Training lockup, monochrome mark, app-icon construction, safe areas, and export naming.
2. **Token manifest:** platform-neutral values and semantics that generate or govern both CSS and asset-catalog colors.
3. **Stable route contract:** one native coach entry URL, auth/deep-link behavior, ready-state signal, offline behavior, and external-link policy.
4. **First-frame alignment:** web login and coach home must adopt approved names, mark, background, typography, and navigation before native continuity can be signed off.
5. **Navigation model:** coach web must converge on `Home`, `Clients`, `Inbox`, `More`; the shell should not compensate for a conflicting web information architecture.
6. **Copy/state contract:** shared loading, empty, success, warning, error, session-expired, and support language.
7. **Product naming migration:** all AI surfaces must move to `FWB Training Assistant`; client surfaces and manifests must move to `FWB Training`.
8. **Acquisition and legal truth:** app-interest, support, privacy, App Store, and in-product capability statements must describe the same product and release state.

## Cross-workstream alignment

### Resolved agreements

- All three workstreams use the same naming architecture, promise, lime/ink/warm-neutral direction, voice, and rule that lime identifies one primary action rather than generic success.
- The website remains the expressive acquisition surface; mobile web and iOS remain calmer task surfaces. This is a difference in composition and information density, not a different brand.
- Identity-boundary assets ship together: canonical mark/lockups, favicon and touch icons, client and coach PWA icons, native icon, launch/loading artwork, authentication marks, and first-frame marks. No surface may recreate the mark with text.
- The current release remains light-first across native and web. Dark mode is deferred until it can be implemented as a complete cross-platform experience; dark/tinted Home Screen icon validation remains required.
- Mobile web owns the stable coach bootstrap URL, auth/deep-link routing, ready-state hooks, safe-area behavior, and first interactive coach frame. iOS consumes that contract and owns native launch, loading, offline/error recovery, and SwiftUI/WebKit accessibility transitions.
- Website owns the acquisition promise, public handoff, and stable support/privacy destinations. Mobile web owns invite/login/onboarding completion and the first meaningful client action. Public screenshots and App Store material must use final product states supplied by the app workstreams.
- The mobile navigation target is the shared working model: client `Home / Train / History / Progress / More`; coach `Home / Clients / Inbox / More`, with `Log workout` as a task action. Native screenshots and deep-link tests must wait until that hierarchy and route state are implemented.
- Support, privacy, App Store, app-interest, and website capability claims require one jointly owned capability matrix. Missing client-native source/build evidence blocks public claims and screenshots; it does not authorize the coach target to stand in for FWB Training.

### Sequencing guardrails

1. Approve identity and architecture decisions below before exporting assets or producing final screenshots.
2. Freeze one platform-neutral token schema and the asset package before CSS migration or native named-color work. Platform aliases may differ in syntax, not meaning or value.
3. Implement the mobile-web bootstrap/ready-state contract and first coach frames before finalizing the native launch/loading transition.
4. Release naming, icons, manifests/bundle metadata, login, launch/loading, and first frames as one identity-boundary slice.
5. Complete navigation and one-action home migrations before website product screenshots, App Store screenshots, or acquisition claims are approved.
6. Run cross-platform claim, accessibility, install, session-expiry, persistence, and deep-link QA before retiring legacy assets or selectors.

### Decisions still requiring owner approval

- **Icon master and heritage gold:** approve the final vector construction, the proposed near-black/white/lime route, and whether gold is retired or retained only as a heritage/editorial accent. The iOS icon recommendation remains a proposal until this is signed off.
- **Product icon distinction:** decide whether FWB Training and FWB Coach share one icon composition or use restrained variants from the same master. Test both installed side by side before approval.
- **Launch expression:** approve deep-ink launch/loading for FWB Coach and whether FWB Training also uses it or uses a warm-canvas first frame. Either choice must transition without a flash into its product.
- **Canonical token names:** the contract uses concise roles such as `ink` and `canvas`, while the mobile-web spec proposes expanded roles such as `text-primary` and `surface-canvas`. Approve one canonical manifest schema before generators/accessors are created; avoid maintaining two synonym sets as independent sources.
- **Native typography adaptation:** approve Inter in the native shell for exact continuity, or approve San Francisco for native utility text while canonical lockups carry the Inter brand expression. The current system-rounded Swift text is not an approved third style.
- **Navigation labels:** formally approve the client five-destination and coach four-destination models after usability review; the brand contract still lists exact labels as open.
- **Native architecture:** approve the recommended WebView-shell release path or fund restoration of the native session/router/tab product. Do not brand and maintain both paths simultaneously.
- **App Store/acquisition set:** approve final device framing, screenshots, platform availability language, Health capability wording, and install/test access only after the capability matrix and final UI are verified.

## Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Unreachable native screens remain active design targets | Duplicate systems and wasted work | Decide WebView shell vs native product at P0; quarantine the inactive path |
| JS redirect controls first launch | Loading flashes, loops, lost deep links | Stable server/web bootstrap route with explicit auth outcomes |
| CSS and Swift values drift | Native boundary feels subtly wrong | Shared token manifest plus snapshot/lint checks |
| One legacy icon represents every product | Installed experience contradicts UI and apps are hard to distinguish | Canonical icon family, side-by-side install testing, approved composition distinction if needed |
| Partial dark mode | Launch/native/web frames visibly disagree | Keep coordinated light-first release; schedule dark mode cross-platform |
| Raw network errors reach users | Technical, unhelpful, inconsistent voice | Map errors to controlled copy and recovery actions |
| Published client iOS claims lack source evidence here | App Store review and trust risk | Locate the client-native source/build evidence and validate each claim |
| AI and human coach products share `FWB Coach` | Support, search, and privacy confusion | Rename AI product before store/support launch |
| Web analytics run inside WKWebView | Disclosure mismatch | Review data collection and App Store privacy answers |
| Remote-first shell has no usable first frame offline | App feels broken at the exact trust boundary | Native offline/recovery state, cached-safe strategy, and preserved destination |

## Acceptance criteria

### Identity

- The iOS icon, coach PWA icon, native loading mark, web login mark, and coach-home mark derive from the same approved source.
- No app icon contains the small `FITNESS WITH BENJAMIN` tagline.
- Installed names are `FWB Coach` and, for the client product, `FWB Training`.
- No human-coach app or AI surface uses an ambiguous shared `FWB Coach` product identity.

### Launch continuity

- Cold launch, warm launch, signed-in, signed-out, expired-session, offline, timeout, and server-error journeys have captured evidence on each supported iPhone size.
- No white or mismatched-color flash appears from launch through the first interactive web frame.
- Loading does not loop across auth redirects and preserves an Inbox/deep-link destination.
- Retry and support actions work, and user-facing errors do not expose raw system descriptions.

### Design system

- Every native brand color resolves through a named semantic asset/accessor with an exact shared value.
- No canonical mark is reconstructed with Swift text.
- Primary, secondary, destructive, selected, unread, success, warning, error, disabled, and pressed states are visually and semantically distinct.
- FWB Coach and FWB Training share the system but remain distinguishable by product name, tasks, and approved icon composition—not competing palettes.

### Accessibility

- VoiceOver can move from loading to auth/home and recover from an error without losing context.
- Dynamic Type and web text enlargement pass at accessibility sizes without clipping or blocked actions.
- Reduce Motion and Increase Contrast checks pass across both the native overlay and WebView.
- All meaningful text and controls meet WCAG AA/appropriate platform contrast, and every target is at least 44×44 points.

### Product and store truth

- App Store screenshots, support, privacy, app-interest, manifests, notifications, and in-product names describe the same current capabilities.
- The team has identified the source/build evidence for every published FWB Training native capability, or removed/deferred unsupported claims.
- FWB Coach privacy/support coverage is distinct from the AI assistant and is linked from its store listing and recovery states.

## Recommended implementation sequence

1. Approve the canonical mark/icon and product naming migration.
2. Decide WebView shell vs native product; use the shell path for the current release unless a native roadmap is funded.
3. Publish the shared token and asset package.
4. Add the stable web bootstrap/ready-state contract.
5. Implement icon, launch, loading, auth, error, and first-frame continuity together.
6. Align support/privacy/App Store/acquisition content.
7. Run simulator/device visual and accessibility QA only after the first web frames are on the shared system.

No simulator was launched during this discovery pass; findings are based on source, project configuration, assets, manifests, and published support/privacy/acquisition content in the repository.
