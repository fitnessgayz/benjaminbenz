# FWB Integrated Brand Program

Date: September 28, 2026
Status: coordinated implementation roadmap

This roadmap integrates the website, mobile-web/PWA, and iOS workstreams into one FWB brand program. The [cross-platform brand contract](./brand-contract.md) governs shared decisions. Surface specifications provide implementation detail:

- [Website and acquisition](./website.md)
- [Mobile web and PWA](./mobile-web.md)
- [iOS and native boundary](./ios.md)
- [Full brand and UX audit](../fwb-brand-audit-2026-09-28.md)

## Program outcome

A prospective client should move from the public website to coaching fit, account setup, FWB Training, and ongoing coach contact without encountering a different name, personality, visual language, or promise. Benjamin should open FWB Coach and feel like he is operating the other side of that same relationship.

The shared promise is:

> **Train with intention. Feel your progress.**

## Ownership model

| Workstream | Owns | Must receive from others |
| --- | --- | --- |
| Website/acquisition | Promise, public story, coaching-led photography, prospect fit, proof, public trust/support paths | Verified product states, capabilities, installed assets, navigation labels |
| Mobile web/PWA | Client and coach IA, onboarding handoff, one-action Home, selected-client workspace, bootstrap/ready state, web components and tokens | Canonical identity assets, approved public handoff, native boundary requirements |
| iOS/native | App icon/bundle presentation, launch/loading/recovery, WebView bridge, native accessibility, App Store evidence | Stable web bootstrap, final first frames, token/asset package, verified capability matrix |
| Integration owner | Brand contract, decisions, sequencing, cross-platform QA, release gate | Evidence and sign-off from all workstreams |

No workstream may independently redefine product names, the brand promise, palette meanings, canonical mark, or state language.

## Working decisions

The workstreams have aligned on these decisions:

- Master brand: **Fitness with Benjamin**
- Client product: **FWB Training**
- Coach product: **FWB Coach**
- AI feature: **FWB Training Assistant**
- Core visual system: electric lime, near-black, warm neutrals, bold Inter web typography, authentic coaching-led photography
- Client navigation: **Home / Train / History / Progress / More**
- Coach navigation: **Home / Clients / Inbox / More**, with **Log workout** as a task action
- Lime indicates one primary action, selection, progress emphasis, or compact brand moment; semantic success remains green
- The current FWB Coach release should be treated as a first-class WebView shell unless a separate native-product investment is approved
- The current release remains light-first; dark mode is a future coordinated phase
- Final marketing and App Store screenshots must come from verified final product states

## Recommended owner approvals

These defaults resolve the remaining decisions unless the owner chooses otherwise:

1. **Heritage gold:** retain only for rare founder/editorial material; remove it from installed product identity.
2. **Icon direction:** one canonical FWB monogram system with deep ink, white, and lime; prototype restrained client/coach composition variants and approve only if side-by-side install testing shows real confusion.
3. **Prospect versus client intake:** keep public coaching fit short and low-sensitivity. Collect required readiness/PAR-Q once after account enrollment, followed by optional nutrition and the first meaningful Home action.
4. **FWB Coach architecture:** harden the WebView-shell path for the current release; quarantine unreachable native screens rather than styling two competing app architectures.
5. **Native typography:** use San Francisco for native utility text and the canonical Inter-based brand assets for marks/lockups. Do not use system-rounded text as a third brand style.
6. **Launch expression:** FWB Coach uses deep ink from launch through web readiness. FWB Training uses warm canvas when its PWA/native implementation can keep that transition continuous.
7. **Client-native claims:** treat FWB Training as a verified PWA in this repository until the separate client-native source/build and capability evidence are located.

## Release sequence

### Gate 0 — Approve the foundation

Approve:

- working decisions and recommended defaults above;
- final mark/icon route and gold policy;
- navigation labels;
- FWB Coach WebView-shell architecture;
- public-fit versus enrolled-client field ownership;
- legal/support ownership and verified operational promises.

No broad recolor, final screenshot production, or store claim should start before this gate.

### Release 1 — Foundation package

Deliver one versioned package containing:

- vector FWB mark;
- Fitness with Benjamin wordmark;
- FWB Training and FWB Coach lockups;
- monochrome mark;
- icon construction and exports;
- platform-neutral design-token manifest;
- CSS token mapping;
- iOS named-color mapping;
- typography, spacing, radius, elevation, focus, and motion rules;
- loading, empty, success, warning, error, offline, and session-expired voice patterns.

Acceptance gate: website, mobile web, and iOS can each consume the package without redefining values or reconstructing the mark with text.

### Release 2 — Vertical continuity slice

Implement the smallest complete cross-platform journey:

#### Client

`Website promise → coaching fit → invited-client setup → FWB Training login/loading → Home with exactly one truthful primary action`

#### Coach

`FWB Coach icon → launch/loading → stable bootstrap/auth → Home with Home / Clients / Inbox / More`

This release includes names, icons, manifests, launch/loading, authentication, initial navigation, support/recovery paths, and the first interactive frames. It must be reviewed as a journey rather than as separate screens.

Acceptance gate: the installed object and first-open experience look and sound like the product shown on the website.

### Release 3 — Acquisition and onboarding

- Replace the homepage hero with the shared promise and coaching-relationship photography.
- Make `Find your coaching fit` enter the short public fit flow directly.
- Remove `Are you DTF?` from the primary journey.
- Rebuild the homepage as promise → method → connected coaching → fit-based options → proof → next step.
- Clarify invited-client account setup; do not call it open account creation.
- Implement the enrolled-client sequence: account → profile → readiness/PAR-Q → optional nutrition → first meaningful action.
- Add visible privacy/support paths before collecting sensitive information.

Acceptance gate: the same question is not needlessly asked on multiple surfaces, sensitive information has purpose context, and the confirmation/handoff truthfully describes what happens next.

### Release 4 — Product information architecture

#### FWB Training

- Ship five primary destinations.
- Use a state resolver so Resume, Start, finish readiness, view plan, or recovery yields exactly one primary Home action.
- Place stats and achievements inside Progress.
- Place food, sessions, readiness, integrations, notifications, account, privacy, and support inside More with contextual links.

#### FWB Coach

- Ship four primary destinations plus contextual Log workout.
- Move profile, plan, workouts, history, food, progress, notes, sessions, and readiness into the selected-client workspace.
- Turn coach Home into an urgency/action queue rather than equal summary cards.

Acceptance gate: navigation is task-first, deep links and back/forward state remain stable, and mobile docks do not require horizontal discovery.

### Release 5 — Full system migration

- Move all CSS brand and semantic values behind the shared token manifest.
- Remove feature-local primitive overrides and resolve stylesheet ownership.
- Map native shell colors through named assets/accessors.
- Align messaging, health, workouts, achievements, settings, dialogs, and edge states.
- Rename FWB Training Assistant atomically across UI, support, privacy, terms, consent, metadata, and integrations.
- Build accurate support/privacy destinations for all three products.

Acceptance gate: raw brand colors are blocked outside designated source files and all product names are unambiguous.

### Release 6 — Evidence and launch

- Validate capability claims against a shared matrix.
- Capture final website, PWA, iPhone, install, launch, auth, home, selected-client, offline, error, and accessibility evidence.
- Produce public product and App Store screenshots only from verified release states.
- Verify testimonials, credentials, permissions, response-time language, privacy answers, and platform availability.
- Retire legacy assets and routes only after compatibility and rollback checks pass.

## Shared capability matrix

Before public claims or store assets are approved, record each capability by release and platform:

| Capability | Website | FWB Training PWA | FWB Training native | FWB Coach PWA | FWB Coach iOS | Evidence owner |
| --- | --- | --- | --- | --- | --- | --- |
| Assigned programs |  |  |  |  |  | Mobile web |
| Workout logging/recovery |  |  |  |  |  | Mobile web/native source owner |
| Coach messaging |  |  |  |  |  | Mobile web |
| Progress and achievements |  |  |  |  |  | Mobile web |
| Apple Health/Watch |  |  |  |  |  | Client-native source owner |
| Google Health |  |  |  |  |  | Mobile web/client-native owner |
| Push notifications |  |  |  |  |  | Platform owner |
| Offline behavior |  |  |  |  |  | Platform owner |
| Selected-client coaching tools |  |  |  |  |  | Mobile web/iOS |

Blank cells mean unverified, not unavailable. Marketing may claim only evidenced states.

## Cross-platform release checklist

- Approved names appear in title, visible headings, manifests, bundle metadata, notifications, support, privacy, and store copy.
- Canonical marks and icons derive from the versioned source package.
- No icon contains the tiny legacy tagline.
- No interface recreates the brand mark using live text.
- Every journey contains exactly one primary action at a time.
- Ink is used on lime; status is not communicated through color alone.
- Website and web apps pass keyboard, focus, reduced-motion, responsive, safe-area, and 200% zoom checks.
- Native boundary passes Dynamic Type, VoiceOver, Reduce Motion, Increase Contrast, session-expiry, offline, and deep-link checks.
- Client and coach installs are distinguishable without unrelated palettes.
- Support and privacy destinations match the actual product and capabilities.
- Screenshot and claim evidence is current for the release being marketed.

## Change isolation

The current working tree contains user-owned changes, including active coach-navigation and shared CSS work. Implementation should use small workstream-scoped commits, avoid broad formatting or search-and-replace in `css/style.css`, and reconcile shared-file changes through the integration owner before each release gate.
