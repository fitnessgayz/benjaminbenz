# FWB mobile web and PWA brand workstream

Date: September 28, 2026
Status: Coordinated discovery and implementation specification; no production code changed
Scope: client mobile web/PWA, coach mobile web/PWA, authentication, account setup/invite, navigation, home hierarchy, design-system ownership, installed identity, and responsive behavior

## Shared product decision

The client and coach products should feel like two roles inside one coaching relationship, not two unrelated apps and not the public website squeezed into a utility shell.

- Master brand: **Fitness with Benjamin**
- Compact mark: **FWB**
- Client product: **FWB Training**
- Coach product: **FWB Coach**
- Client AI feature: **FWB Training Assistant**
- Shared promise: **Train with intention. Feel your progress.**

The mobile-web expression should be calm, direct, and highly legible: warm canvas, white task surfaces, near-black structure, electric lime reserved for the current selection or one primary action, and copy that sounds like a thoughtful coach. Client and coach surfaces should share tokens and primitives exactly. Role, information density, and navigation—not a separate palette—should distinguish them.

## Evidence from the current implementation

### Product naming and installed identity drift

- `client-dashboard.html` still identifies itself as `Client Dashboard`, uses `FWB` for the Apple/app title, and loads a client manifest whose full name is `Fitness with Benjamin`. The approved client product name `FWB Training` appears nowhere at this boundary.
- `client-login.html` presents `Client access`, `Training portal`, `Private login`, and another `Client access` within one screen. The labels are functional but make the experience sound like a generic account utility.
- `coach-admin.html` uses `Coach Admin`, `Coach access`, `Coach Admin home`, and `Coach Admin` in visible or assistive labels while its manifest and login use `FWB Coach`.
- `client-signup.html` and `client-invite.html` use the general-site manifest rather than the client manifest, so install metadata can change during the account journey.
- The client, coach, and public manifests all point to the same icon files. Their launch colors differ: the client manifest uses a warm `#f5f6f2` background while the coach and public manifests use `#050505`. All use the legacy icon family identified in the main audit.
- `client.webmanifest` has a route-shaped `id` (`/client-dashboard.html`), while the coach uses a product-shaped `id` (`/coach-app`). This can complicate durable installed identity when routes change.

### Navigation is feature-first rather than task-first

- The client exposes nine peer destinations: Home, Workouts, Logs, Progress, Stats, Food, PAR-Q, Sessions, and Settings.
- The coach exposes thirteen `data-admin-tab` destinations (Home, Inbox, Clients, Profile, Program, Workouts, Exercise library, Food, Progress & stats, Notes, Logs, Sessions, Settings) plus a separate Workout logger link.
- At `max-width: 900px`, the coach sidebar becomes a horizontally scrolling dock. It gives fourteen controls roughly 78–84 px each, requires scroll discovery, and visually elevates the selected icon into a glossy gradient orb. This turns navigation density into a gesture problem rather than resolving the information architecture.
- The client dock already has a flatter, quieter selected-state language. The coach gradient, strong highlights, visible scrollbar, raised icon, and text shadow create a second brand style inside the same system.
- Existing tests assert the current long scrolling coach dock and exact visual selectors. Navigation migration must update the tests as product contracts, not treat those assertions as reasons to preserve the old structure.

### The client home has moved in the right direction but still has competing actions

- `client-dashboard.html` and `tests/home-today-first.test.js` establish a good first pass: Today, Start workout, weekly activity, coach note, then a collapsed `More from your dashboard` section.
- A resumable workout is rendered after weekly activity, even though resume should replace all other next actions when active.
- Start workout and Gym check-in are both prominent lime actions near the top. Lime therefore stops meaning “the one thing to do now.”
- The home heading is generic `Today`; it has no personalized greeting or state sentence that connects the recommendation to the client’s plan.
- Coach notes are personal and valuable, but the default `No note yet` frame emphasizes absence rather than continuity.
- The secondary disclosure is a strong containment mechanism, but it still holds achievements, measurements, macros, reports, mood, program, sessions, food, and next steps—a sign that destinations and summaries need clearer ownership.

### Coach home contains useful operational data without a single priority queue

- The coach home has valuable modules for recent training, calendar, session sheets, package alerts, and inactive clients.
- Four summary shortcuts compete equally, and one is coupled to a hard-coded `Alex Fitness Master` session summary. That client-specific operational detail should not define the general coach-home hierarchy or brand experience.
- Client details are global peer tabs even though Profile, Program, Workouts, Food, Progress, Notes, Logs, and Sessions all depend on one selected client. This is the central information-architecture mismatch.
- `Client selector` and `Coach admin` are implementation language. `Choose a client`, `Client workspace`, and `FWB Coach` describe user intent.

### Authentication and onboarding are usable but not one continuous product journey

- Client and coach logins share field and surface styling, which is a good foundation.
- The client login uses the public site manifest, while the coach login uses the coach manifest. Client account setup and password invite also use the public manifest.
- Client copy shifts among `Fitness with Benjamin`, `FWB`, `Client access`, `Training portal`, and `Secure client portal`. Coach copy is closer to the approved product name but still falls back to `Coach access`.
- Account setup promises that a questionnaire follows; invite onboarding instead presents three steps for Account, Fitness, and Macros. The flow is compact and progressively disclosed, but its relationship to the separate PAR-Q/fitness questionnaire is unclear.
- `client-invite.html` uses a text-created `FWB` mark rather than the canonical brand asset.
- The invite flow asks for sex for calorie calculation. The reason should be stated at the field, its use limited to the calculation, and the optional nature of macro setup kept explicit.

### CSS ownership permits continued drift

- There are 23 CSS files, 911 hex literal occurrences, and 369 distinct normalized hex values in the current CSS tree.
- Lime exists in at least seven nearby literals: `#d7ff3f`, `#d6ff35`, `#d1ff2c`, `#caff2c`, `#d6ff26`, `#d2ff28`, and `#c9f12e`.
- `css/style.css` defines one root palette; `css/fwb-design-system.css` redefines it. The design-system file also contains raw focus, danger, selected-border, and neutral values instead of semantic tokens.
- The shared file says it should load after page-specific styles, but the client loads fifteen feature stylesheets after it and the coach loads three after it. Final appearance therefore depends on specificity and order.
- `css/coach-messages.css` creates an independent dark green-gray theme with its own lime, focus, border, bubble, and text values.
- `css/fwb-design-system.css` uses broad `:root body` selectors and `!important` as a bridge over legacy rules. This is reasonable as a temporary migration layer but not a stable component architecture.

### Responsive and accessibility observations

- The client viewport prevents zoom with `maximum-scale=1.0, user-scalable=no`; this should be removed. It interferes with a basic low-vision accommodation and is not necessary for an app-like layout.
- Both products account for safe-area insets and preserve bottom clearance for fixed navigation, which should be retained.
- The client and coach navigation use `aria-current="page"`, visible labels, and real buttons/links. Those semantics should survive the IA change.
- Reparenting tests protect focus, typed values, scroll positions, and hidden-workspace behavior when the dock moves in the DOM. Those are valuable behavioral contracts to preserve even if the rendered navigation becomes much smaller.
- The shared design system defines a visible focus ring and reduced-motion fallback. Token migration must keep those behaviors while removing component-local focus colors.

## Target client experience: FWB Training

### Primary mobile navigation

Use five persistent destinations:

1. **Home** — today’s state, one next action, coach connection, compact weekly context.
2. **Train** — assigned plan, active/resumable workout, other allowed workouts.
3. **History** — completed workouts and training logs, with filters/details inside the section.
4. **Progress** — progress trends, measurements, achievements, and check-ins.
5. **More** — Food, Sessions, Readiness/PAR-Q, connected health, notifications, account, privacy, and support.

`Stats` becomes a subsection of Progress. `Logs` becomes History. `Workouts` becomes Train. `Food`, `Sessions`, `PAR-Q`, and Settings leave the persistent dock but remain directly reachable from More and contextual home alerts. Deep links must still open the correct subsection.

Desktop may use the same five top-level destinations with expanded labels. It should not reintroduce every feature as a peer simply because there is more space.

### Client home priority resolver

Home should render exactly one dominant action based on state:

1. Active workout exists → **Resume workout**.
2. Assigned workout is due/available → **Start today’s workout**.
3. Recovery/readiness check is required → **Check in before training**.
4. Session or coach-requested action is time-sensitive → the relevant task.
5. No planned action → **View your training plan** or a calm recovery message.

Gym check-in becomes a compact secondary control or part of workout start—not a second equal lime CTA. The weekly summary follows the primary action. A coach note/message follows weekly context and uses a positive empty state such as `Benjamin’s next note will appear here. You can message him anytime.` The More disclosure should show summaries only when they are timely or meaningfully changed.

Suggested first frame:

- `Good morning, [first name]`
- State line: `Lower Body A is ready when you are.`
- Primary button: `Start Lower Body A`
- Supporting continuity: `Last trained Tuesday · 2 of 3 sessions this week`
- Coach note/message

The greeting should not fabricate personalization when name or plan data is unavailable. Fall back to `Your training` and a truthful state sentence.

## Target coach experience: FWB Coach

### Primary mobile navigation

Use four persistent destinations plus a task action:

1. **Home** — priority queue, today’s schedule, recent activity.
2. **Clients** — client search/list and entry to a selected client workspace.
3. **Inbox** — conversations and unread state.
4. **More** — exercise library, notification settings, account, support, and sign out.

Expose **Log workout** as a prominent task action, not a fifth information destination. It can be a header action or floating action that remains visually subordinate to urgent workflow alerts and meets safe-area/keyboard constraints.

### Selected client workspace

After selecting a client, use a client header with name, current program/status, message shortcut, and a back path to Clients. Place client-dependent tools within that workspace:

- **Overview** — latest workout, next session, open alerts, coach note summary.
- **Plan** — program and workout builder.
- **Activity** — completed workouts/logs and analysis.
- **Progress** — measurements, photos, DEXA, and trends.
- **More** — profile, food, sessions/packages, notes, readiness/onboarding, archive controls.

These may be local tabs or a segmented/subnavigation pattern. They must never join the global bottom navigation. Preserve URLs/query state so a refresh, back action, or client-view return restores both selected client and workspace section.

### Coach home priority

Replace equal-weight reporting with a short ordered queue:

1. actions needed today (unread client message, expiring/empty sessions, requested review, upcoming session);
2. today’s schedule;
3. recently completed training worth reviewing;
4. clients who may need contact;
5. operational summaries.

Keep metrics compact. A count is useful only when it leads to a clear action. Remove client-specific constants such as `Alex Fitness Master only` from the generic home contract; represent them as normal client/package records.

## Shared component and voice contract

### Required semantic tokens

The web token layer should use the names agreed in the main audit and add state/surface aliases rather than feature colors:

- Brand: `--brand-primary`, `--brand-primary-hover`, `--brand-primary-ink`.
- Text: `--text-primary`, `--text-secondary`, `--text-on-dark`, `--text-disabled`.
- Surfaces: `--surface-canvas`, `--surface-raised`, `--surface-soft`, `--surface-dark`, `--surface-overlay`.
- Structure: `--border-default`, `--border-strong`, `--focus-ring`.
- States: `--state-success`, `--state-success-surface`, `--state-warning`, `--state-warning-surface`, `--state-danger`, `--state-danger-surface`, `--state-info`, `--state-info-surface`.
- Interaction: `--action-primary-*`, `--action-secondary-*`, `--action-danger-*`, `--selection-*`.
- Shape/elevation: named control/card/sheet radii and low/medium/high elevation tokens.
- Navigation: one dock/sidebar surface, selected state, icon size, label style, height, and safe-area clearance used by both products.

Completion, success, warning, error, information, selection, and brand emphasis must remain distinct. In particular, do not use lime as the general success color.

### Required primitives

- Canonical FWB mark, Fitness with Benjamin wordmark, FWB Training lockup, and FWB Coach lockup.
- App shell/header, global navigation, local section navigation, and contextual back header.
- Primary, secondary, quiet, and destructive buttons with full state coverage.
- Text field, select, textarea, checkbox/radio, segmented choice, and search/combobox.
- Task card, summary card, coach-note card, status/banner, empty state, skeleton/loading state, inline error, toast/confirmation, dialog/sheet, and destructive confirmation.
- Notification/unread badge with a non-color cue and accessible label.
- One workout-status component that clearly separates assigned, in progress, completed, skipped, and needs review.

Each primitive should own its layout and visual states. Feature CSS may arrange primitives but should not redefine their colors, typography, radius, focus, or elevation.

### Voice patterns

Use concise task language and explicitly state what was preserved during errors.

| Moment | Pattern | Example |
| --- | --- | --- |
| Loading | action + expected result | `Preparing your training…` |
| Empty | value + who acts next + available action | `Benjamin’s next note will appear here. You can message him anytime.` |
| Success | concrete result + useful next state | `Workout saved. Your progress is up to date.` |
| Recoverable error | failure + preservation + retry | `Your workout is still on this device. We couldn’t sync it yet—try again.` |
| Access | product + task | `FWB Training` / `Welcome back` |
| Privacy | audience + control | `Only you and your coach can see this.` |

Avoid `portal`, `admin`, `private page`, `client selector`, and generic `Ready.` in user-facing UI. Do not over-celebrate routine saves or use pressure/growth language for reminders.

## P0 changes

1. Lock product names and replace installed/document/visible labels at the entire identity boundary: manifests, titles, app-title meta, login, account setup, invite, loading, navigation mark, and support links.
2. Replace the mobile IA with the five-destination client model and four-destination coach model; move client-specific coach tools into the selected client workspace.
3. Implement the one-action client-home resolver and give Resume precedence over Start, readiness, check-in, and secondary summaries.
4. Create one platform-neutral semantic token source and make `fwb-design-system.css` the generated/authoritative web entry. Define the matching iOS names before migration begins.
5. Normalize stylesheet layering: reset/foundation → tokens → primitives → layout → feature exceptions. No feature stylesheet loaded after the system may redeclare a brand/semantic primitive.
6. Replace shared legacy installed art and text-built marks together across client PWA, coach PWA, native iOS, login, invite, loading, favicon/touch icons, and first frame.
7. Remove viewport zoom prevention and verify touch, focus, safe-area, keyboard, reduced-motion, and 200% browser zoom behavior.

## P1 changes

1. Reframe coach home as an action queue and move client-specific package constants out of the generic summary.
2. Rewrite authentication, loading, empty, success, and recovery copy using the shared patterns; keep client and coach wording role-specific but tonally identical.
3. Clarify the client account-setup chain: account → coaching profile → readiness/PAR-Q → optional nutrition. Explain why sensitive/calculation inputs are requested and when they can be skipped.
4. Consolidate the coach messaging dark theme into shared dark-surface and conversation tokens.
5. Add durable navigation/deep-link state for global destination, selected client, and local workspace section.
6. Add a real More surface for each product with logical groups, search only if the group grows, and direct contextual links from alerts/home cards.
7. Replace brittle selector-presence tests with a mix of semantic DOM tests, navigation-state unit tests, browser interaction tests, and reference screenshots for critical journeys.

## Cross-workstream dependencies

### Website stream

Mobile web needs the website team to finalize:

- canonical master mark, wordmark, product lockups, and the public promise;
- shared typography scale, photo treatment, core CTA language, and support/privacy language;
- the exact website-to-client handoff: prospect CTA → coaching fit/intake → confirmation → invite/account setup;
- a product landing section whose screenshots reflect the final client IA, not the current nine-tab layout.

The product should inherit identity from the website, but not large marketing composition inside dense task screens.

### iOS stream

Mobile web needs the iOS team to align:

- one-to-one semantic token names and values;
- canonical icon/mark assets and export matrix;
- background/launch/loading/error states that transition seamlessly into the coach web frame;
- safe-area, keyboard, deep-link, back-navigation, session-expiry, offline, and web-view refresh behavior;
- product naming in the bundle, App Store, native shell, and PWA manifests.

Web must expose stable shell/state hooks rather than require native code to infer page appearance.

### Shared implementation sequence

1. Approve names, mark/icon route, palette, and navigation maps.
2. Define token manifest, component contracts, and voice patterns.
3. Fix installed/first-open/auth boundaries across website, PWA, and iOS in one coordinated release.
4. Migrate client Home → Train → History → Progress → More as complete journeys.
5. Migrate coach Home → Clients/client workspace → Inbox → More and Log workout.
6. Run cross-platform visual, accessibility, persistence, and deep-link QA before removing legacy selectors/tokens.

## Cross-workstream alignment

The website, iOS, mobile-web, and shared-contract specifications agree on the brand promise, naming architecture, lime/ink/warm-neutral direction, Inter, canonical asset family, human coaching voice, semantic status colors, and the need for continuous icon → launch/loading → authentication → first-frame experiences. They also agree that the public site may be more expressive while product surfaces stay calmer and that coach density must come from the work, not a separate visual brand.

Resolved coordination agreements:

- **The shared contract governs.** Use its base roles and values (`brand-primary`, `brand-primary-ink`, `ink`, `ink-deep`, `canvas`, `surface-soft`, `surface`, `text-muted`, `border`, `focus`) as the platform-neutral source. The more detailed web action/state/surface names in this spec are derived semantic aliases, not competing canonical tokens. CSS and Swift must map back to the same base role and exact value.
- **Continuity is journey-specific, not one universal background.** The coach iOS/PWA boundary should use `ink-deep` from launch through WebView readiness to avoid a flash. The light client product may enter on the warm canvas if its manifest, HTML boot frame, loading/auth frame, and first screen remain continuous. Both still use the same palette and mark system.
- **Current iOS delivery is coach-only.** Mobile web must not imply that a client-native target exists. FWB Training remains a client PWA unless the separate native source and shipped capability evidence are located. Marketing, support, and privacy claims must describe the release that actually exists.
- **The coach shell depends on web contracts.** Mobile web will provide a stable bootstrap route, authentication/deep-link outcomes, a ready-state signal, initial background, external-link policy, and mapped recovery states. Native code should not infer readiness from arbitrary DOM paint or compensate for web navigation.
- **Onboarding needs one data-ownership map.** The public five-step coaching-fit intake is the prospect journey. Invite onboarding creates credentials and collects only missing client-profile information, with nutrition requiring an active optional choice. In-product readiness/PAR-Q handles required safety completion or renewal. The same question should not be asked again merely because a user crosses surfaces; previously supplied data should be reviewed or confirmed where policy permits.
- **Post-invite handoff uses the mobile-web state resolver.** Completion routes to the highest-priority truthful FWB Training action—finish required readiness, view the assigned plan, or Home—not a generic dashboard or unsupported native route.
- **Acquisition screenshots come last.** Website product storytelling may be structured earlier, but final screenshots and capability copy wait until the mobile IA, tokens, first frames, and iOS shell are implemented and verified.
- **Support and privacy are part of the release gate.** FWB Training, FWB Coach, and FWB Training Assistant need unambiguous destinations and capability-accurate language. Visual/navigation edits can proceed independently; legal meaning and App Store privacy claims require their own approval.

Sequencing gates:

1. Owner approves the shared open decisions below.
2. iOS owner confirms WebView shell vs native product; the current-release recommendation is the WebView shell.
3. Brand asset and token packages are published before any broad CSS, manifest, or Swift migration.
4. Mobile web publishes the coach bootstrap/ready-state contract before native launch/loading/auth implementation.
5. Website and mobile web agree on intake/invite/PAR-Q field ownership, persistence, privacy text, and the first post-invite action before changing those flows.
6. Implement one cross-platform continuity slice and verify it before migrating remaining screens.
7. Produce acquisition/App Store screenshots and finalize public capability claims only from verified release states.

Decisions still requiring owner approval:

- final vector mark, FWB Training/FWB Coach lockups, and whether installed products need a restrained composition distinction after side-by-side testing;
- whether heritage gold is retired or retained only for rare editorial/premium use;
- final mobile navigation labels and grouping after usability validation (the proposed structures remain client `Home / Train / History / Progress / More` and coach `Home / Clients / Inbox / More` plus `Log workout`);
- WebView shell vs native architecture for the current FWB Coach release;
- client launch/boot background treatment (warm canvas is recommended) and final PWA manifest IDs/scopes;
- authoritative field ownership and retention rules across prospect intake, invite onboarding, and readiness/PAR-Q, including which sensitive fields are truly required;
- the operationally supported first action after invite completion and fallback when no plan exists;
- FWB Coach support/privacy coverage, verified client-native capability claims, analytics disclosure, and final App Store/PWA screenshot set.

## Risks and mitigations

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| Current uncommitted work overlaps coach navigation and shared CSS | Lost work or merge regressions | Treat the working tree as user-owned; isolate commits by workstream, reconcile before edits, and never blanket-reformat `style.css`. |
| IA change breaks tab-based deep links and tests | Users land in the wrong section; regressions hidden by test churn | Publish old→new destination mapping, add redirect/state adapters, and update behavior tests before deleting old identifiers. |
| One root scope for both PWAs | Install prompts or service-worker behavior can collide | Validate stable manifest IDs, installation from every auth route, and whether route-specific scope/service workers are needed. |
| Token migration changes semantic workout colors | Completed/selected/warning states become ambiguous | Inventory state meanings before replacement; migrate semantic roles, never search-and-replace raw colors blindly. |
| Fixed docks collide with keyboards, workout controls, sheets, or native safe areas | Hidden controls and accidental input | Test viewport/visualViewport changes, device rotation, short screens, installed PWA mode, WKWebView, and open keyboards. |
| Personalization data is missing or stale | False or awkward coaching language | Define honest fallbacks for name, assigned plan, coach note, schedule, and sync state. |
| Coach feature density simply moves into More | A drawer becomes another feature dump | Use the selected-client workspace, contextual actions, and frequency/urgency data to determine placement. |
| Asset rollout is partial | Icon, login, splash, and first frame still conflict | Version the canonical asset family and release all identity-boundary updates together. |

## Acceptance criteria

### Identity and continuity

- Website handoff, client invite, client login, installed client PWA, coach login, installed coach PWA, native shell, loading state, and first interactive frame use approved names, canonical assets, and the same palette.
- Client installs as `FWB Training`; coach installs as `FWB Coach`; stable manifest IDs and launch colors are verified on iOS and Android.
- No UI recreates the FWB mark with live text.

### Client UX

- Mobile and desktop expose exactly five top-level destinations: Home, Train, History, Progress, More.
- An active workout always makes Resume the single primary home action; Start, readiness, or plan view are selected only when higher-priority states do not apply.
- Stats live within Progress; Food, Sessions, Readiness/PAR-Q, connected health, notifications, account, privacy, and support are reachable from More and contextual links.
- Back/forward, reload, deep links, coach preview, and session restoration preserve the correct destination and active workout without data loss.

### Coach UX

- Mobile exposes exactly Home, Clients, Inbox, and More as persistent destinations, with Log workout as a task action.
- Profile, Plan, Workouts, Activity/Logs, Food, Progress, Notes, Sessions, and readiness tools live within a selected client workspace.
- Changing client, reloading, returning from client preview, and using browser/native back preserve or intentionally clear client context with no ambiguous state.
- The coach home ranks actionable work above metrics and contains no hard-coded client-specific summary contract.

### Design system and accessibility

- All primary UI colors, focus rings, surfaces, semantic states, radii, and elevations resolve through approved semantic tokens.
- New raw brand-color literals are blocked outside token/asset source files; feature styles do not override primitive appearance.
- Client and coach use one navigation primitive and one set of field, button, card, dialog, badge, loading, empty, success, and error components.
- Text/control contrast meets WCAG AA; visible focus, keyboard navigation, reduced motion, safe areas, screen-reader labels, 200% zoom, and platform text scaling are verified.
- The client page no longer disables user zoom.

### Verification

- Reference screenshots cover login, account setup/invite, home states, global navigation, More, selected-client workspace, loading, empty, offline/retry, success, warning, error, keyboard-open, and installed modes at agreed phone and desktop widths.
- Browser tests verify destination count and names, active-state semantics, deep-link restoration, reparenting/focus preservation, one-action priority, safe-area clearance, and no dock/control collision.
- A cross-platform release checklist verifies icon sizes, manifest metadata, splash/loading colors, iOS shell transition, and first-frame parity before deployment.

## Recommended first implementation slice

Do not begin with a broad recolor. Build a vertical continuity slice that proves collaboration among all workstreams:

1. canonical mark and product names;
2. shared tokens and primary/button/navigation primitives;
3. client invite → FWB Training login → loading → Home with one resolved action;
4. coach login → native/PWA loading → FWB Coach Home with four-destination navigation;
5. installed icons and launch backgrounds for both products;
6. automated behavior, screenshot, accessibility, and install verification.

Once that slice feels like one authentic FWB experience, migrate the remaining journeys behind the same contracts.
