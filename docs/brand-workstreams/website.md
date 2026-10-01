# FWB Website and Acquisition Brand Workstream

Date: September 28, 2026
Owner: Website/acquisition workstream
Status: Coordinated discovery and specification; no production implementation in this pass

## Shared brand decision

The website should remain the expressive edge of the FWB system, but it must sell the same experience the client later opens in **FWB Training**: personal coaching that helps someone train with awareness, follow a plan, and recognize real progress.

The shared brand spine is:

- **Master brand:** Fitness with Benjamin
- **Client product:** FWB Training
- **Coach product:** FWB Coach
- **AI feature:** FWB Training Assistant
- **Promise:** Train with intention. Feel your progress.
- **Personality:** energetic, grounded, precise, encouraging, and human
- **Visual signature:** lime, near-black, warm neutrals, bold Inter typography, authentic coaching photography, and clear progress cues

The public site can use more photography, scale, and contrast than the utility-focused apps. It should not introduce a different logo, palette, vocabulary, or emotional promise.

## Scope and evidence reviewed

This pass read the full `docs/fwb-brand-audit-2026-09-28.md` and inspected:

- the deployed homepage at `https://benjaminbenz.com/` and its local `index.html` source;
- the public questionnaire in `questionnaire.html`;
- client account setup and invite onboarding in `client-signup.html` and `client-invite.html`;
- the iOS interest flow in `app-interest.html`;
- client support/privacy pages and the AI assistant support/privacy/terms/consent pages;
- the three web manifests and shared icon files;
- the current marketing, credential, transformation, and icon assets.

The deployed homepage matched the reviewed local structure and copy at the time of this review.

## Executive findings

### 1. The current visual identity is recognizable, but the first impression is not yet the intended coaching promise

The homepage has a confident FWB look: near-black photographic treatment, electric lime, warm white, bold typography, and direct language. Those are worth preserving.

However, the deployed desktop hero makes `Fitness With Benjamin` the largest message while the client benefit remains a general paragraph beginning with “Years of experience helping people transform their lives.” The more credible differentiators—16 years of certified coaching, body awareness, intentional movement, and individualized feedback—appear later.

The current hero crop is also a brand problem, not merely an image preference. It centers Benjamin's lower body while his face is not visible. The image demonstrates exercise, but not trust, coaching, care, or the human relationship that differentiates FWB. At first glance the site reads more like an energetic fitness campaign than a thoughtful personal-coaching service.

### 2. The conversion story requires visitors to assemble the value proposition themselves

The homepage uses `Training`, `Results`, and `Start` as tabbed panels and repeats those destinations in more than one navigation treatment. The hero's `Take the questionnaire` action first switches the visitor to the Start panel; the visitor must then choose `Start Questionnaire` to enter the form.

This adds an avoidable step at the moment of highest intent. It also makes important evidence mutually exclusive: a visitor sees the training story, results, or offer at one time rather than moving through a persuasive sequence of promise → method → proof → options → next step.

The offer cards provide useful detail, but their long, repeated feature lists make the three services feel more similar than distinct. The site needs to explain who each option is for and how coaching continues between sessions, not merely enumerate features.

### 3. The public intake feels administrative before it feels supportive

`questionnaire.html` exposes 46 inputs and 11 textareas on one page. It asks for date of birth and a complete home address before explaining why those details are necessary. Readiness, pain, injury, surgery, nutrition, work stress, and other personal questions are presented without a nearby privacy link, estimated completion time, step count, save state, or explanation of what happens after submission.

The questionnaire does preserve a useful, personal tone in places and collects information Benjamin genuinely uses to coach. The problem is sequencing and framing. The brand promise is “understood and connected”; the form currently feels like a long record request.

There is also a semantic mismatch between the current numeric `1–5` DTF commitment field and the grounded, trust-led positioning. A number without behavioral labels is difficult to interpret and the joke is doing more work than the question.

### 4. Signup and invite onboarding represent two different ideas of account creation

The client login exposes `Create new account`, but the destination only sends a fresh setup link to an email the coach already has on file. This is not open account creation. Calling it that can make prospective visitors think anyone can self-register and can make existing clients unsure whether they are in the right place.

The invite flow itself contains a strong pattern to preserve: a visible three-step model, back/next controls, progress, private-by-default reassurance, and an optional nutrition path. It is substantially easier to understand than the public questionnaire.

Its weaknesses are brand and sequencing:

- it says `Welcome to FWB` rather than welcoming the client to **FWB Training**;
- it asks for body metrics, goals, limitations, and macro inputs before showing the payoff of the connected coaching experience;
- the macro estimate is presented as the third setup step and `Yes` is preselected, which can make an optional feature feel expected;
- completion copy does not yet clearly bridge into the first meaningful app action.

### 5. The site claims a connected coaching app but does not make that value tangible

The coaching cards repeat `Coaching app access`, but the homepage shows no real product frame, example coach note, workout continuation, or progress story. `app-interest.html` describes the product mainly as a fitness app for tracking workouts and uses `FWB iOS app` / `Want to try FWB?`, rather than the approved **FWB Training** name and its role in personal coaching.

The app should not be marketed as another tracker. Its differentiator is continuity: the client's plan, next action, workout history, progress, and connection to Benjamin remain available between live interactions.

### 6. Trust content exists but is inconsistently surfaced

Strong trust material is present: a 16-year coaching claim, multiple certifications, real training photography, progress images, Yelp attribution, a thorough FWB Training privacy policy, and a practical support page.

It is not yet assembled into a clear trust system:

- the homepage footer does not link to FWB Training support or privacy;
- the intake submit area does not link to the applicable privacy information;
- two review cards are attributed only as `Client review · Yelp`, without the specificity of the dated, named Yelp excerpts;
- transformation captions such as `Client progress` and `Body recomposition` provide little context and do not explain the process behind the result;
- the AI pages still use `FWB Coach`, colliding with the approved human coach product name;
- support and legal pages are readable, but mostly isolated document cards rather than a visibly related FWB family.

### 7. The photography is authentic source material, but not yet a cohesive brand library

The current `images/home` collection is real and energetic. That authenticity is an advantage over stock wellness imagery. Most images, however, show Benjamin performing exercises alone across different gyms, years, lighting, and image treatments. Several hide his face or emphasize physique more than coaching.

The library demonstrates that Benjamin trains. It does not adequately demonstrate the experience of being coached by Benjamin: observation, cueing, adjustment, conversation, encouragement, review of a plan, or progress reflection.

### 8. Shared naming and asset boundaries are still inconsistent

The site manifest correctly names the master brand `Fitness with Benjamin`, while the client manifest still uses `Fitness with Benjamin` instead of `FWB Training`. Public pages use text-built `FWB` marks, and all three manifests point to the same legacy icon family. The AI support, privacy, terms, landing, and consent pages call the AI feature `FWB Coach`, which conflicts with the coach workspace.

The website should not solve those platform files independently. It depends on the same approved vector mark, icon family, product names, and semantic color values as mobile web and iOS.

## What to preserve

- Lime, near-black, warm neutral, and white as the recognizable digital palette.
- Inter and the current confident, high-contrast typographic energy.
- The phrases `Train with intention`, `Feel your body`, `Move with intention`, and `progress built with patience` as authentic foundations.
- Real photography rather than generic fitness or wellness stock.
- The methodical `Assess / Connect / Optimize` structure, after translating it into client outcomes.
- Three clear service routes: online coaching, hybrid coaching, and San Francisco personal training.
- The 16 years of certified coaching and the actual credential set.
- Direct access to Benjamin and the human, non-hype tone found in the strongest review copy.
- The invite flow's visible progress, reversible steps, and privacy reassurance.
- The thorough client privacy disclosure and practical support contact.
- The use of lime for one high-priority action instead of decorating every surface.

## P0 changes

### P0.1 Lock the shared naming and promise before changing screens

Use the approved architecture everywhere:

| Context | Approved public name |
| --- | --- |
| Business/master brand | Fitness with Benjamin |
| Compact mark | FWB |
| Client experience | FWB Training |
| Coach workspace | FWB Coach |
| AI feature | FWB Training Assistant |

Rename AI public pages and consent language as one coordinated release with the mobile/web feature label and any external listing metadata. Do not leave `FWB Coach` referring to both an AI assistant and Benjamin's coach workspace.

### P0.2 Replace the hero message and image together

The hero must lead with the client promise rather than the business name. Recommended content is in the copy hierarchy below.

Replace the current hero image with an authentic, crop-safe image that shows Benjamin's face and either:

1. Benjamin actively coaching a client; or
2. Benjamin in a direct, approachable portrait with the training environment visible.

The desktop and mobile crops must be intentionally art-directed. A face, gesture, and coaching context must remain legible at both breakpoints. Do not solve the current crop by adding a stronger overlay over the same composition.

### P0.3 Make the high-intent CTA a direct, honest next step

Use `Find your coaching fit` as the primary site CTA. It should open the first step of the guided intake directly, not only switch a homepage tab.

Use `See how Benjamin coaches` as the secondary CTA. It should move to the method/story section.

If the homepage tabs remain during an incremental migration, the hero primary CTA must still enter the intake directly. Longer-term, prefer a continuous acquisition story or clearly linked pages over mutually exclusive panels.

### P0.4 Replace the one-page questionnaire with a five-step guided intake

Recommended flow:

1. **Your coaching fit** — service interest, location/format, primary goal.
2. **Your training story** — experience, motivation, movement concerns, training preferences.
3. **Readiness** — required PAR-Q/readiness questions with a concise reason for collecting them and safe escalation language.
4. **Logistics** — availability and equipment; request a street address only when a selected in-person option actually needs it.
5. **Contact and review** — contact preference, privacy summary, editable review, and submit.

Requirements:

- visible step label and progress;
- a tested, honest time estimate;
- back/continue controls without losing answers;
- clear required/optional labeling;
- save-and-return when feasible;
- privacy link and plain-language data explanation before sensitive questions and at submit;
- behavioral commitment choices rather than a bare numeric `1–5` field;
- a confirmation that explains who reviews the answers, what happens next, and an operationally approved response window;
- a dedicated error state that says what was preserved and how to retry.

### P0.5 Remove `Are you DTF?` from the primary conversion journey

The phrase can express Benjamin's playful personality in a context where the audience already knows the joke. In the hero/start/intake funnel it introduces sexual slang immediately before health, injury, home-address, and contact questions. That works against safety and trust.

Retain the founder's edge through direct, specific language, energetic photography, and coaching candor. Do not replace it with generic wellness copy.

### P0.6 Add a visible trust and legal path before asking for personal information

The global footer and intake must expose:

- FWB Training Support;
- FWB Training Privacy Policy;
- contact email;
- service location and online availability;
- any required business/legal terms once defined.

Legal copy should remain accurate and be reviewed separately from marketing. The branding workstream may improve navigation and plain-language summaries, but should not silently change legal meaning.

## P1 changes

### P1.1 Rebuild the homepage as a single persuasive story

Recommended order:

1. promise and primary CTA;
2. short proof strip;
3. Benjamin's coaching method;
4. what connected coaching feels like;
5. coaching options by client fit;
6. credible client outcomes and testimonials;
7. Benjamin's story and credentials;
8. final coaching-fit CTA;
9. support/privacy/footer.

If tabs are retained, ensure every section is directly linkable, understandable when opened alone, and reachable without relying on horizontal scrolling or hidden state.

### P1.2 Differentiate coaching options by fit, not repeated feature inventories

Each option should answer:

- who it is best for;
- what kind of access and feedback the client receives;
- how often Benjamin reviews or adjusts the plan;
- how FWB Training supports the experience;
- the minimum commitment and a clear next action.

Shared features can appear once below the cards. Avoid vague labels such as `In-person training per session`; publish an accurate pricing approach or tell the visitor exactly when pricing is discussed.

### P1.3 Add a connected coaching product story

Create a homepage section or focused product page with real final-state screenshots. Show a simple sequence:

1. see today's plan;
2. train and record progress;
3. receive context from Benjamin;
4. recognize the next meaningful step.

Lead with `Your coaching stays connected between sessions.` Health integrations, reminders, logging, and achievements are supporting capabilities, not the central promise.

### P1.4 Strengthen proof without overclaiming

- Use only review excerpts that can be traced to an approved source and preserve the meaning of the original review.
- Prefer named/initialed, dated attribution when permission and source terms allow it.
- Replace generic transformation captions with consented context: starting challenge, coaching behavior, timeframe, and client-defined outcome.
- Pair physique change with strength, consistency, confidence, mobility, or training-skill outcomes so the brand does not reduce progress to appearance.
- Add a compact explanation that individual results vary; do not imply guaranteed transformations.

### P1.5 Clarify the account-setup path

Rename `Create new account` to `Request a new setup link` or `Need a fresh setup link?` wherever the action is limited to invited clients.

Use:

- product label: `FWB Training`;
- page heading: `Set up your client access`;
- explanation: `Use the email Benjamin has on file and we'll send a secure one-time link.`

The invite opening should say `Welcome to FWB Training` and briefly explain the payoff before requesting profile data. Rename the steps to `Account`, `About your training`, and `Optional nutrition`. Do not preselect consent to an optional macro estimate; let the client make an active choice.

Completion should lead to the correct first product action—such as viewing the assigned plan or completing the next onboarding task—using copy supplied by the mobile-web workstream.

### P1.6 Bring support, privacy, AI, and consent pages into the family

Keep these pages calm and readable. Add the canonical mark/lockup, approved product name, consistent page title pattern, shared footer, and direct links among support/privacy/terms where applicable.

Rename public AI surfaces to `FWB Training Assistant`. Make the boundary explicit: it is an AI feature, not Benjamin and not the FWB Coach workspace. Preserve emergency/medical limitations and the precise data-use disclosures.

### P1.7 Add social and search presentation assets

The homepage currently has basic title and description metadata but no coherent social-preview system. Produce:

- an Open Graph/social card using the canonical mark, promise, and an approved image;
- page-specific title/description patterns for training, questionnaire, support, privacy, and product pages;
- structured business/person/service data after facts are verified;
- a canonical favicon/touch-icon set exported from the same master as the apps.

## Recommended copy hierarchy

### Global header

- Lockup: `Fitness with Benjamin`
- Navigation: `How it works` · `Coaching` · `Results` · `About`
- Utility: `FWB Training login`
- Primary action: `Find your coaching fit`

### Hero

- Kicker: `SAN FRANCISCO PERSONAL TRAINING + ONLINE COACHING`
- H1: `Train with intention. Feel your progress.`
- Support: `Sixteen years of certified coaching to help you build strength, move with awareness, and stay consistent with a plan shaped around you.`
- Primary CTA: `Find your coaching fit`
- Secondary CTA: `See how Benjamin coaches`

### Proof strip

- `16 years of certified coaching`
- `San Francisco + online`
- `A personal plan, direct feedback, and connected progress`

Only use claims that can be kept current and substantiated.

### Method section

- Kicker: `THE METHOD`
- H2: `Learn how your body moves—not just what exercise comes next.`
- **Assess:** `Understand your movement, history, goals, and constraints.`
- **Connect:** `Build the awareness to feel the right work in every rep.`
- **Progress:** `Adjust the plan using what your body and training are showing us.`

`Progress` is recommended in public copy instead of `Optimize`; it is more human, less technical, and connects directly to the master promise. The underlying coaching method does not change.

### Connected coaching section

- Kicker: `FWB TRAINING`
- H2: `Your coaching stays connected between sessions.`
- Support: `See your plan, continue a workout, track meaningful progress, and stay connected to Benjamin wherever you train.`
- Supporting labels: `Know what's next` · `Train with context` · `Share real progress`

### Coaching options

- H2: `Choose the support that fits how you train.`
- `Online coaching` — for independent training with an individualized plan and regular feedback.
- `Hybrid coaching` — for independent training plus periodic in-person refinement.
- `Personal training` — for hands-on San Francisco sessions with connected support between visits.
- CTA on each: `Find out if this fits`

### Results

- Kicker: `CLIENT PROGRESS`
- H2: `Progress you can feel—and understand.`
- Support: `Strength, consistency, movement quality, and confidence build differently for every client. The plan should make that progress visible.`

### Final CTA

- H2: `Let's find the right way to train.`
- Support: `Tell Benjamin about your goals, training history, and what support would help you stay consistent.`
- CTA: `Find your coaching fit`
- Reassurance: `Start with a short fit check. Sensitive readiness questions come later with an explanation of why they're needed.`

### Questionnaire

- H1: `Let's find your coaching fit.`
- Intro: `We'll start with your goals and training preferences, then ask the readiness questions Benjamin needs to coach safely.`
- Submit: `Send to Benjamin`
- Confirmation: `Your answers are with Benjamin. He'll review them and follow up within [approved response window].`

Do not publish a response-time promise until Benjamin confirms an operational service level.

### Invite setup

- Product label: `FWB TRAINING`
- H1: `Your coaching starts here.`
- Support: `Create your access, share the training details Benjamin needs, and see your plan.`
- Step labels: `Account` · `About your training` · `Optional nutrition`
- Completion: `You're ready. Let's see what's next in your plan.`

## Asset needs

### Required before implementation

1. **Canonical vector identity master**
   - FWB mark;
   - Fitness with Benjamin wordmark;
   - FWB Training lockup;
   - FWB Coach lockup;
   - monochrome versions;
   - near-black/white/lime icon construction.

2. **Authentic photography shoot**
   - Benjamin coaching a client through a movement;
   - close-up cueing/adjustment with appropriate consent;
   - coach/client conversation or plan review;
   - client using FWB Training between sets;
   - approachable Benjamin portrait with eye contact;
   - environment/detail images that feel San Francisco and real, not staged stock;
   - horizontal and vertical versions with documented safe crop areas.

3. **Product screenshot set**
   - today's next action;
   - workout in progress;
   - coach note/message;
   - meaningful progress view;
   - one iPhone set and one responsive web set using the final shared tokens.

4. **Trust assets and permissions**
   - source links or records for published testimonials;
   - explicit usage status for client photos and transformation stories;
   - accurate credential names and current status;
   - approved response-time and service/pricing language.

5. **Delivery assets**
   - favicon/touch/PWA exports;
   - Open Graph/social card;
   - image optimization variants and meaningful alt-text brief;
   - a short asset-usage guide covering minimum size, clear space, crop, and backgrounds.

### Existing assets that can remain as secondary material

The current exercise photographs can support method tiles, editorial stories, or social content after color/crop review. They should not all be treated as one coherent campaign shoot, and the current split-squat image should not remain the primary hero crop.

## Dependencies and coordination

### Mobile web app dependency

The website needs the mobile-web workstream to provide:

- final `FWB Training` naming in login, manifest, navigation, and onboarding;
- the canonical first meaningful action after invite completion;
- final screenshots and approved example client data;
- the exact product capability language so marketing does not promise unsupported behavior;
- a shared set of loading, success, error, and privacy phrases;
- the same semantic colors, typography roles, radii, and icon master.

The mobile-web workstream needs the website to provide:

- the master promise and voice rules;
- approved wordmark/mark assets;
- acquisition source/intent context passed into intake when useful;
- a clear handoff from form confirmation to invite or coach follow-up;
- final support/privacy URLs and product naming.

### iOS dependency

The website needs the iOS workstream to provide:

- accurate availability and platform language;
- final installed product name, icon, launch/loading frame, and App Store naming;
- approved iPhone screenshots and device framing rules;
- confirmed Health feature language and privacy constraints;
- the correct install/test access action.

The iOS workstream needs the website to provide:

- the same icon/mark master and palette values;
- social/App Store copy derived from the shared promise;
- stable support and privacy URLs;
- a first-open experience that continues the expectations set by acquisition.

### Shared decisions that block independent implementation

Do not independently finalize any of the following in website, mobile web, or iOS:

- a different lime, black, or neutral palette;
- a platform-specific recreation of the mark;
- a different name for the client product, coach product, or AI feature;
- a different central promise;
- screenshots using temporary or conflicting visual systems;
- an onboarding completion route that is not supported on every relevant platform.

## Cross-workstream alignment

This section records the website review of `mobile-web.md`, `ios.md`, and `brand-contract.md`. Where an earlier paragraph in this website specification is more specific but conflicts with this section, this section governs until the owner records a different shared decision.

### Resolved agreements

- **Foundation:** all three workstreams use the same purpose, promise, personality, and naming architecture. `Fitness with Benjamin`, `FWB Training`, `FWB Coach`, and `FWB Training Assistant` are fixed working names; `portal`, `dashboard`, `admin`, and `client access` are not product identities.
- **Visual system:** lime `#D6FF35`, near-black/ink, deep field, warm neutrals, Inter, and authentic coaching-led photography form one system. Lime is reserved for the primary action, selection, progress emphasis, and compact brand moments; semantic success remains green.
- **Token contract:** `brand-contract.md` owns core values and meanings. The expanded mobile-web tokens for actions, states, navigation, radii, and elevation are valid extensions, not a competing palette. CSS custom properties and iOS asset/accessor names must map to one platform-neutral manifest with exact values.
- **Identity boundary:** mark, icon, favicon/touch icons, PWA assets, native launch/loading, authentication, and first interactive frames release as one versioned asset family. No surface may recreate the mark with live text. Client and coach differentiation comes first from product name and task context; a restrained icon-composition difference is considered only after side-by-side install testing.
- **Product IA:** website acquisition material may describe the product only against the agreed client `Home / Train / History / Progress / More` and coach `Home / Clients / Inbox / More` models. Website screenshots wait for those frames; they must not preserve the current nine-destination client or scrolling coach navigation as brand imagery.
- **Current native scope:** the iOS source in this repository proves an **FWB Coach** WebView shell, not an FWB Training native app. The recommended current-release path is to harden that shell around a stable bootstrap route, web authentication, loading, recovery, deep links, and the four-destination coach frame. The website must not imply that this repository proves client-native capabilities.
- **Support identity:** FWB Training, FWB Coach, and FWB Training Assistant need unambiguous support/privacy destinations. The existing AI pages cannot double as support or privacy coverage for the human-coach app.
- **Voice and recovery:** acquisition, onboarding, app state, and native recovery use the same calm, specific language. Errors state what was preserved and how to continue; routine saves are not over-celebrated.
- **Accessibility:** web zoom to 200%, visible focus, reduced motion, semantic states, safe areas, keyboard reachability, VoiceOver/Dynamic Type at the native boundary, and ink-on-lime are shared release criteria rather than platform polish.

### Agreed sequence and hold points

1. Approve names, canonical mark/icon route, gold policy, navigation maps, and the current iOS architecture.
2. Publish the versioned vector/export package and platform-neutral token manifest before any broad recolor or platform-specific logo work.
3. Build the mobile-web vertical continuity slice: invite → FWB Training login/loading → one-action Home, plus FWB Coach login → stable native/PWA loading → four-destination Home.
4. Release installed icons, manifests, launch/loading, authentication, and first frames together only after that slice is visually and behaviorally ready.
5. The website may implement the promise, coaching photography, method, proof, footer, and intake structure in parallel. Hold the connected-app section, App Store claims, and final product screenshots until the client and coach frames pass shared visual/capability review.
6. Rename the AI feature across public pages, consent, metadata, and integrations as one migration; do not create an interval where `FWB Coach` identifies both products.
7. Run cross-platform screenshot, accessibility, install, deep-link, recovery, and claim QA before removing legacy assets, selectors, or routes.

This sequencing resolves two major risks: publishing marketing screenshots of an interface already scheduled for replacement, and shipping a new icon into an unchanged first-open experience that still feels like a different product.

### Decisions still requiring owner approval

1. **Prospect intake versus enrolled-client onboarding.** The website draft currently places readiness/PAR-Q inside a five-step public intake, while the mobile-web flow places readiness after account creation. Recommended resolution: keep the public `Find your coaching fit` form short and low-sensitivity, then use one enrolled-client sequence—account → coaching profile → required readiness/PAR-Q → optional nutrition → Home—as the source of truth. Owner, coaching-safety, privacy, and data-operations approval are required before either form is rebuilt; until then, do not duplicate the same health answers in both flows.
2. **Client iOS product evidence.** Locate the FWB Training native source/build and validate Apple Health, Watch, notifications, offline recovery, media, and synchronization claims. If that evidence is not available for the release, change `app-interest.html`, public product copy, screenshots, and store language to verified web/PWA availability rather than implying a currently evidenced client iOS app. Android `coming soon` also needs an owned roadmap commitment before publication.
3. **Native architecture.** Formally approve the current-release FWB Coach WebView-shell path or fund the alternative native router. Website/App Store imagery and native implementation cannot finalize while both architectures remain design targets.
4. **Final identity artwork.** Approve the vector construction, final product lockups, whether gold is retired or heritage-only, and whether side-by-side client/coach install testing justifies a composition distinction.
5. **Navigation labels.** The five-client/four-coach maps are the shared direction, but final labels require usability validation before screenshots, help content, deep links, or acquisition copy are frozen.
6. **Legal/support ownership.** Approve dedicated FWB Coach support/privacy coverage, the renamed Assistant documents, questionnaire privacy summary, and App Store privacy answers. Marketing layout work must not rewrite their legal meaning.
7. **Operational promises and proof:** approve response-time language, pricing disclosure approach, current credential claims, testimonial wording/source, and client-media permissions before those elements ship.

## Risks and mitigations

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| The redesign becomes polished but generic | Removing founder-specific language can erase the energy that already feels authentic | Keep Benjamin's direct voice, real photography, mind-body method, and specific coaching behaviors; remove only language that damages trust in a given context |
| New photography still centers physique rather than relationship | The differentiator is personal coaching, not simply looking fit | Approve a shot list and crop plan before the shoot; require coaching interaction and eye-contact options |
| Results and testimonials overpromise | Fitness outcomes vary and client media is sensitive | Verify sources, permissions, context, and claims; avoid guaranteed language |
| A multi-step questionnaire loses or duplicates submissions | The current endpoint and profile-linking behavior are already operational | Preserve field keys and submission IDs, add draft/state handling deliberately, and test anonymous plus signed-in paths before replacing the live form |
| Progressive disclosure hides safety questions or makes them optional | Readiness data has safety and operational value | Define required fields with Benjamin and legal/privacy review; redesign presentation without weakening collection requirements |
| Marketing promises app behavior that is not consistently available | Web, PWA, and iOS capabilities differ | Use a capability matrix owned jointly by all three workstreams and approve every public claim against it |
| Renaming the AI feature breaks external integrations or listings | Names may exist in MCP/plugin metadata and consent flows | Inventory every surface and release the rename atomically with redirects or compatibility copy where needed |
| Legal pages are visually rewritten and their meaning changes | Health, privacy, and data-use statements require precision | Treat layout/navigation and legal content as separate review tracks |
| Existing client progress imagery lacks documented permissions | Public proof can expose sensitive identity or health context | Record consent scope and remove or anonymize anything that cannot be verified |

## Acceptance criteria

### Brand and message

- The first viewport states who the service is for, where/how it is offered, the shared promise, and one primary action.
- The hero uses the approved master promise and no longer spends the largest type on repeating the business name.
- The primary hero image shows an authentic human/coaching signal and maintains its intended subject at supported desktop and mobile crops.
- `Fitness with Benjamin`, `FWB Training`, `FWB Coach`, and `FWB Training Assistant` are used according to the approved naming architecture.
- No primary acquisition or intake screen uses `Are you DTF?`.

### Conversion journey

- The primary CTA opens the coaching-fit intake directly.
- A visitor can understand method, options, connected coaching, proof, and next step in a deliberate sequence without discovering hidden tabs.
- Coaching options explain audience fit and service differences without repeating the same long feature list.
- The site shows how FWB Training connects the relationship between sessions using real final-state screenshots.

### Intake and onboarding

- The questionnaire contains no more than five understandable stages and displays progress plus a tested time estimate.
- Sensitive questions include purpose/privacy context; home address is conditional on an actual in-person need.
- Required and optional inputs are explicit, readiness requirements are preserved, and entered values survive backward navigation and recoverable errors.
- The review step lets a visitor edit earlier answers.
- Submit confirmation explains the real next step and only promises a response window Benjamin has approved.
- Account recovery/setup is labeled as an invited-client setup-link flow, not open account creation.
- Invite onboarding says `FWB Training`, treats nutrition targeting as an active optional choice, and routes to a meaningful first app action.

### Trust, accessibility, and continuity

- Homepage, intake, support, privacy, consent, and account entry points use the same canonical mark and semantic design tokens.
- The global footer exposes support, privacy, contact, and service-area information.
- Published reviews, client stories, credentials, and results claims have a traceable source and documented permission where needed.
- All meaningful text/control combinations meet WCAG AA; keyboard order, focus, validation, reduced motion, and 200% zoom are verified.
- The website → questionnaire → confirmation → invite/login → first FWB Training screen reads and looks like one relationship, not separate products.
- The installed icon/launch state shown in public materials matches the assets actually delivered by mobile web and iOS.
- Desktop and mobile reference screenshots are approved for the hero, method, product story, options, results, questionnaire stages, confirmation, invite opening, support, and privacy pages.

## Suggested implementation order

1. Approve shared names, promise, logo/icon route, and voice guardrails.
2. Commission/select the hero and coaching-relationship photography.
3. Prototype the continuous homepage story and guided intake together.
4. Validate field requirements, privacy language, endpoint compatibility, and response operations.
5. Align invite/login naming and the post-completion handoff with mobile web.
6. Add the product story only after final mobile/iOS tokens and screenshots exist.
7. Align support, privacy, AI, consent, metadata, social preview, favicon, and footer.
8. Run cross-platform visual, accessibility, content, and claim QA before release.
