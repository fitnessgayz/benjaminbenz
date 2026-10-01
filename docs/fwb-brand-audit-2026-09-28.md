# FWB Brand, UI, and UX Alignment Audit

Date: September 28, 2026

Scope: public website, client web app/PWA, coach web app/PWA, and FWB Coach iOS app.

Coordinated implementation documents:

- [Cross-platform brand contract](brand-workstreams/brand-contract.md)
- [Integrated roadmap](brand-workstreams/integrated-roadmap.md)
- [Website and acquisition workstream](brand-workstreams/website.md)
- [Mobile web and PWA workstream](brand-workstreams/mobile-web.md)
- [iOS and native workstream](brand-workstreams/ios.md)

## Executive decision

FWB should use **lime + near-black + warm neutral** as its master digital identity.

The current public website and product experience already communicate this identity consistently enough that switching the whole product to gold would be a larger, less natural change. The black/white/gold app icon should therefore be treated as legacy artwork. The recommended icon direction is the existing FWB monogram rebuilt in the digital palette: near-black field, white letterforms, and a lime `W`/barbell accent. Gold can remain as a tightly controlled heritage or premium accent, but it should not represent the installed app while lime represents the product users open.

This change should be more than a color swap. One shared semantic token system should drive every web surface and have a one-to-one Swift equivalent for native loading, error, and shell states.

## Brand spine

The visual system should express one stable idea before any screen-level styling begins.

- **Purpose:** Help people build strength through awareness, intention, and expert personal coaching.
- **Brand promise:** Train with intention. Feel your progress.
- **Positioning:** FWB is the connected coaching experience for people who want thoughtful, personal training rather than generic workouts or fitness hype.
- **Personality:** Energetic, grounded, precise, encouraging, and human.
- **Voice:** Direct and motivating without shouting; expert without sounding clinical; personal without becoming overly casual.
- **Visual signature:** Electric lime, near-black, warm neutrals, bold typography, real coaching photography, and clear progress cues.
- **Emotional outcome:** Users should feel capable, understood, and connected to their coach.

This should govern website headlines, onboarding, empty states, workout feedback, achievements, notifications, support language, App Store copy, and visual design.

## External inspiration applied

The Reteno mobile-branding guide usefully frames a brand as the complete way an app looks, sounds, and feels—not just its logo. Its strongest applicable principles are a simple scalable icon, a restrained core palette, a clear value proposition, a consistent voice, seamless UX, cross-platform continuity, appropriate personalization, accessible support, and a brand-aligned landing page.

Applied to FWB:

1. **Distill the icon.** Preserve the recognizable FWB monogram, remove the tiny tagline at app-icon scale, and use the same core colors users encounter after opening the product.
2. **Lead with the promise.** “Train with intention. Feel your progress.” should connect acquisition, onboarding, the home experience, and App Store presentation.
3. **Treat UX as branding.** Fast loading, obvious next actions, workout continuity, readable data, and graceful recovery states communicate care and coaching quality more convincingly than decoration.
4. **Use one voice everywhere.** Onboarding, coach messages, alerts, achievements, email, and push notifications should sound like the same calm, focused trainer.
5. **Personalize around coaching context.** Show the user’s current program, next meaningful action, recent progress, and coach connection. Avoid gamification that feels detached from real training outcomes.
6. **Make support part of trust.** Place concise, human help at moments of friction—account access, workout logging, health sync, and data/privacy controls.
7. **Build a dedicated app story.** Add a focused FWB app landing section/page with the promise, real product screenshots, key client benefits, coach connection, trust/privacy signals, testimonials, and direct download/install actions.

Source inspiration: [Reteno — A Guide to Mobile App Branding](https://reteno.com/blog/a-guide-to-mobile-app-branding-actionable-tips-strategies-and-examples).

## What the review found

### 1. The installed identity and the in-product identity contradict each other

The iOS icon and web/PWA icons use black, white, and metallic gold. The public website, login, web apps, and native shell use electric lime as the primary action and brand color.

This creates the exact user-experience break reported: the thing a user taps does not look like the thing that opens.

### 2. FWB has a design system, but not yet one source of truth

The repository contains a shared design-system stylesheet, but the base stylesheet, feature stylesheets, and Swift theme still define their own palettes.

- `css/style.css` defines `--lime: #d7ff3f`.
- `css/fwb-design-system.css` defines `--lime: #d6ff35`.
- Feature files use additional variants including `#d1ff2c`, `#caff2c`, and `#d6ff26`.
- `FWBTheme.lime` resolves to approximately `#d6ff3d`.
- Messaging, achievements, health, workout, invite, and profile components introduce local grays, greens, focus colors, and dark surfaces.
- Production CSS currently contains 369 distinct hex literals across 911 occurrences. Not all are brand colors, but the count is a strong signal that semantic tokens are not governing the UI.

Because `client-dashboard.html` loads feature styles both before and after `fwb-design-system.css`, visual ownership depends on cascade order. The resulting UI can drift as individual features ship.

### 3. The public website is the strongest expression of the intended brand

The public homepage has a clear visual voice:

- bold Inter typography;
- near-black photography overlays and navigation surfaces;
- electric lime for the monogram, headline emphasis, active state, and primary CTA;
- warm off-white content surfaces;
- direct, energetic language.

This is the right anchor for the rest of the ecosystem. It feels energetic and modern without adopting generic “health app” blues or greens.

### 4. The web-app login is aligned, but more generic than the website

The client login correctly uses the lime CTA, circular FWB mark, warm background, and black type. However, it loses the website's more distinctive photographic energy and strong layout rhythm. It reads as a clean SaaS login rather than unmistakably FWB.

The solution is not to add decoration everywhere. Authentication and utility screens should stay calm, but retain a recognizable FWB signature through the mark, headline voice, spacing, and one intentional brand moment.

### 5. The iOS app duplicates branding at the shell boundary

The iOS app is largely a SwiftUI/WKWebView shell around the coach web app. Its native loading and error states use a separate hard-coded `FWBTheme`, while the rendered product uses CSS tokens. This makes drift likely even when the visible app is mostly web content.

The native login code also includes an FWB circle treatment rather than using a canonical brand asset. Brand marks should not be reconstructed independently in text on each platform.

## Second-pass UX review

This pass reviewed the deployed public site, the local website and acquisition flow, client and coach entry points, current mobile-navigation artifacts, PWA manifests, coach iOS shell, page copy, and the current uncommitted interface changes.

### What is already working

- The public hero is visually distinctive and recognizably FWB: real coaching photography, black, white, and lime work well together.
- Inter is used consistently and supports both bold marketing headlines and dense product UI.
- The website, questionnaire, and login pages share a recognizable header and core layout language.
- The client mobile navigation now has clear icons, readable labels, a strong selected state, and appropriate touch sizing.
- The product already has several human coaching moments—coach notes, messages, weekly activity, next workout, check-ins, and achievements—that can make FWB feel more personal than a generic workout tracker.
- Client and coach login separation is improving. The dedicated `FWB Coach` manifest and entry point are the right architectural direction.

### P0 — Resolve the product naming system

Users currently encounter `Fitness with Benjamin`, `FWB`, `FWB Training`, `Training portal`, `Client access`, `Client Dashboard`, `FWB Coach`, `Coach Admin`, `Coach access`, `Coach workspace`, and an AI assistant also named `FWB Coach`.

Use this fixed architecture:

| Role | Approved name | Where it appears |
| --- | --- | --- |
| Master brand | Fitness with Benjamin | Public website, legal, billing, footer |
| Short master mark | FWB | Icon, compact navigation, social avatar |
| Client product | FWB Training | Client PWA/iOS product name, login, notifications, support |
| Coach product | FWB Coach | Coach PWA/iOS product name and workspace |
| AI feature | FWB Training Assistant | Client-facing AI surface; avoids colliding with the human coach product |

Replace generic screen titles such as `Training portal`, `Client access`, `Coach access`, and `Coach Admin` with the approved product name plus a task-oriented heading. Examples:

- `FWB Training` / `Welcome back`
- `FWB Coach` / `Your coaching workspace`
- `FWB Training Assistant` / `Reflect, log, or message Benjamin`

### P0 — Turn the homepage message into a specific promise

The current hero leads with the brand name and the generic phrase “Years of experience helping people transform their lives.” The more differentiated language—body awareness, intentional movement, and 16 years of certified coaching—appears later.

Recommended hierarchy:

- Kicker: `SAN FRANCISCO PERSONAL TRAINING + ONLINE COACHING`
- Headline: `Train with intention. Feel your progress.`
- Supporting copy: `Sixteen years of certified coaching to help you build strength, move with awareness, and stay consistent with a plan shaped around you.`
- Primary CTA: `Find your coaching fit`
- Secondary CTA: `See how Benjamin coaches`

Keep “Fitness with Benjamin” prominent in the header and metadata; the hero headline should spend its largest type on the client promise.

The `Are you DTF? / Dedicated To Fitness` line is memorable but introduces unrelated sexual slang at the exact point where a prospective client is deciding whether the service feels trustworthy and professional. Remove it from the primary conversion journey. If retained at all, use it only as an opt-in social campaign where the joke has context.

### P0 — Redesign the questionnaire as a guided intake

The questionnaire currently exposes 46 inputs and 11 textareas in one long page. It requests date of birth and full home address before the visitor has built much trust or knows why those details are needed.

Recommended five-step flow:

1. **Your coaching fit** — service interest, location, goals, preferred training format.
2. **Your training story** — experience, injuries, movement concerns, motivation, schedule.
3. **Readiness** — PAR-Q/readiness questions with a short explanation of why they are asked.
4. **Logistics** — availability and equipment; request a street address only when in-person service actually requires it.
5. **Contact and review** — name, email, phone preference, privacy summary, editable response review, submit.

Add a visible step count, estimated completion time, back/continue controls, save-and-return when feasible, and a clear privacy explanation beside sensitive questions. Convert commitment level from a numeric input to five labeled choices. Preserve all required safety and legal questions while reducing perceived burden through grouping and progressive disclosure.

### P0 — Simplify client and coach navigation

The client app exposes nine primary destinations on desktop and six persistent destinations on mobile. The coach workspace exposes roughly fifteen navigation destinations and turns the mobile version into a horizontally scrolling dock. This makes the products feel like collections of features instead of guided coaching tools.

Recommended client mobile navigation:

1. `Home`
2. `Train` — assigned workouts and active workout
3. `History` — completed logs
4. `Progress` — progress, stats, achievements
5. `More` — food, sessions, readiness questionnaire, integrations, notifications, settings

Recommended coach mobile navigation:

1. `Home`
2. `Clients`
3. `Inbox`
4. `More`

Put program, workouts, food, progress, notes, logs, and sessions inside a selected client's workspace rather than treating all of them as equal global destinations. Keep `Log workout` as a prominent quick action.

The current uncommitted coach-mobile navigation styling introduces glossy gradients, heavy highlights, and a raised lime orb while the client dock and shared design system are largely flat. Do not ship that as a separate visual language. Use the same warm translucent/solid surface, flat lime selected state, icon weight, shadow restraint, and label treatment in both products.

### P1 — Make authentication unmistakably FWB

The client and coach login pages are clear and usable but resemble generic SaaS entry screens. They need one distinctive, quiet brand moment rather than more decoration.

- Use the canonical mark/lockup instead of a text-created circle.
- Use the approved product name consistently.
- Add one short promise or contextual line, not another feature list.
- Consider one restrained crop of authentic coaching photography on wide screens; keep mobile focused on the form.
- Make the client/coach switch secondary and explicit: `Are you a coach? Open FWB Coach.`
- Use identical field, error, reset, loading, and success patterns across both products.

### P1 — Design the client home around the next meaningful action

The strongest FWB experience is not “a dashboard”; it is the feeling that Benjamin and the plan know what the client should do next.

Prioritize the home screen in this order:

1. personalized greeting and today's training status;
2. one dominant next action—start, resume, recover, or check in;
3. coach note/message;
4. compact weekly progress;
5. upcoming session or program milestone;
6. secondary insights and achievements.

Avoid giving workout start, gym check-in, weekly totals, mood, recommendations, achievements, messages, and reports equal visual weight. Lime should point to the single primary next action.

### P1 — Make voice part of the component system

Create reusable copy patterns alongside visual components:

- Loading: say what is happening and what will appear next.
- Empty state: explain the value, who acts next, and one available action.
- Success: confirm the result and reinforce progress without exaggerated celebration.
- Error: state what was preserved, what failed, and how to recover.
- Reminder: sound like a calm trainer, not a growth-marketing notification.
- Achievement: connect the badge to an actual training behavior or milestone.

Replace internal language such as `Client selector`, `Coach admin`, `Checking client access`, and `private page` when it reaches end users. Prefer task language such as `Choose a client`, `Your coaching workspace`, `Preparing your training`, and `Only you and your coach can see this`.

### P1 — Align installed and first-open experiences

The client PWA, coach PWA, and iOS coach app currently share the legacy black/white/gold icon even though their visible UI is lime-led. In addition, the native coach loading screen rebuilds the mark with text and a circle.

- Export client and coach icons from one canonical vector master.
- Preserve the same core mark; distinguish products through name and, only if necessary, a restrained product badge or composition difference.
- Match manifest background colors, launch/loading screen, authentication screen, and first product frame.
- Use CSS and Swift semantic tokens with identical names and values.
- Review icon legibility at 20, 29, 40, 60, 120, and 180 points—not only at 1024 pixels.

### P2 — Build a focused app landing story

The public website mentions “coaching app access” as a feature, but does not yet turn the connected product into a tangible reason to choose FWB.

Add a focused app section or page showing:

- today's workout and clear next action;
- direct coach connection;
- progress and achievements tied to real training;
- Apple Health/Google Health integrations as optional conveniences;
- privacy and control in plain language;
- real mobile screenshots using the final shared brand system;
- install/download actions only for the audience that can use them.

The message should be that the app keeps personal coaching connected between sessions—not that FWB is another fitness tracker.

## Recommended digital brand system

### Brand roles

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Primary brand | `brand-primary` | `#D6FF35` | Primary CTA, active tabs, progress emphasis, compact FWB mark |
| Primary hover | `brand-primary-hover` | `#C8EE2F` | Pointer hover only |
| Accessible brand ink | `brand-primary-ink` | `#171A17` | Text/icons on lime |
| Core ink | `ink` | `#171A17` | Main text, dark controls |
| Deep field | `ink-deep` | `#080A08` | Hero overlays, app icon field, premium/dark panels |
| Canvas | `canvas` | `#F2F3EE` | Page background |
| Soft surface | `surface-soft` | `#F7F8F4` | Inputs, nested sections, quiet cards |
| Raised surface | `surface` | `#FFFFFF` | Cards, dialogs, sheets |
| Muted text | `text-muted` | `#666B62` | Secondary copy |
| Border | `border` | `#DCDED7` | Dividers and neutral outlines |
| Focus | `focus` | `#718A18` | Accessible light-surface focus ring |
| Danger | `danger` | `#B52D25` | Destructive actions/errors |
| Warning | `warning` | `#8C5A0A` | Warnings and attention states |
| Success | `success` | `#287A3D` | Confirmed success states; not brand decoration |
| Heritage accent | `heritage-gold` | TBD from source artwork | Rare editorial/premium use only; never a competing primary CTA |

The heritage gold should be sampled from the original vector/source artwork before it becomes a token. Do not sample a compressed PNG and promote that value into the system.

The proposed core pairings pass WCAG AA in the intended roles: ink on lime is 15.22:1, muted text on the warm canvas is 4.90:1, and the focus color against white is 3.92:1. Danger, warning, and success text against white are each above 5:1. These checks validate the starting palette; every final component state still needs contrast testing in context.

### Usage rules

1. Lime means brand emphasis, current selection, progress, or primary action. It should not become a generic background for large reading areas.
2. Black/ink is the visual foundation. Use it for contrast and confidence, not to make every utility screen dark.
3. White and warm neutrals carry most product content so training data stays easy to scan.
4. Blue is reserved for conventional informational/link meaning when needed; it is not an FWB brand color.
5. Red, amber, and green are semantic state colors only.
6. Never place white text on lime. Use `brand-primary-ink`.
7. Use one canonical logo asset per lockup instead of recreating `FWB` with platform text.

## Logo and icon recommendation

Create a small canonical asset family from one vector master:

- `FWB mark`: compact monogram for nav bars, avatars, and loading states.
- `FWB wordmark`: mark plus “Fitness with Benjamin” for the public website and login.
- `FWB Coach lockup`: mark plus product descriptor; “Coach” is a descriptor, not a new brand.
- `App icon`: near-black field, white `F/B`, lime `W` and optional simplified barbell. Remove the small “FITNESS WITH BENJAMIN” text at icon sizes because it becomes visual noise.
- `Monochrome mark`: one-color version for system contexts, notification artwork, and accessibility fallbacks.

The public website, client PWA, coach PWA, and iOS app may have different product labels, but should share the same mark and palette.

## Product UX alignment

### Website

- Keep the current bold, photographic, lime-led direction as the brand benchmark.
- Standardize the header mark and wordmark against the canonical assets.
- Preserve one primary CTA per section; secondary actions should be outline or text actions.
- Reuse the same radius, focus, and motion rules used by the apps.

### Client web app/PWA

- Optimize for calm scanability: warm canvas, white cards, strong ink, limited lime.
- Use lime for the most important next action, current tab, workout progress, and success moments.
- Replace feature-local color systems with shared semantic aliases.
- Keep workout state colors distinct from brand color so “selected,” “complete,” “warning,” and “error” never blur together.

### Coach web app/PWA

- Share the client system exactly; differentiate through information density and navigation, not a separate palette.
- Use the same mark with the “Coach” descriptor.
- Convert the dark messaging area to shared dark-surface tokens instead of its own green-gray palette.

### iOS

- Replace the black/white/gold icon with the digital app icon family.
- Implement the shared palette as named colors in the asset catalog with light/dark variants where appropriate.
- Map Swift semantic names one-to-one to web semantic names.
- Use real logo assets in loading and login states rather than a text-generated circle.
- Make native loading/error transitions visually seamless with the first rendered web frame.
- Keep Dynamic Type, Reduce Motion, increased contrast, and VoiceOver behavior native.

## Implementation plan

### Phase 0 — Approve the identity direction

Deliverables:

- approve lime/ink as the master digital identity;
- approve gold as either heritage-only or fully retired;
- approve the product naming architecture (`Fitness with Benjamin`, `FWB Training`, `FWB Coach`, and `FWB Training Assistant`);
- approve the simplified client and coach navigation models;
- approve the simplified icon construction;
- approve the canonical wordmark/mark lockups.

Do not perform a broad CSS migration before this decision is locked.

### Phase 1 — Establish the single source of truth

1. Create one platform-neutral token manifest containing raw palette values and semantic aliases.
2. Generate or mirror those tokens into:
   - CSS custom properties;
   - iOS named color assets/Swift accessors;
   - icon and social-asset export documentation.
3. Keep `css/fwb-design-system.css` as the web entry point, but remove duplicate root brand definitions from `css/style.css`.
4. Add linting that blocks new raw brand-color literals outside the token files.

### Phase 2 — Fix the identity boundary first

1. Produce the canonical vector mark and app icon.
2. Export every required web/PWA/iOS size from that master.
3. Update favicons, Apple touch icons, client/coach manifests, iOS asset catalogs, loading states, and login marks together.
4. Verify installed names and icons for public/client, coach PWA, and native coach app.

This phase will resolve the most visible user complaint before the larger component migration is complete.

### Phase 3 — Migrate shared foundations

1. Normalize typography roles, spacing, radii, borders, shadows, focus rings, and motion.
2. Replace component-local lime/ink/neutral values with semantic tokens.
3. Define reusable button, input, card, sheet/dialog, tab, navigation, badge, and status primitives.
4. Resolve cascade ownership: foundations first, components second, page exceptions last. The design system should not rely on broad `!important` bridges as its permanent architecture.

### Phase 4 — Migrate by user journey

Suggested order:

1. website promise → coaching fit → guided questionnaire → confirmation;
2. install/open → splash/loading → login/sign-up/invite;
3. client home → start workout → log sets → finish/share;
4. progress/check-ins/achievements;
5. coach home → client → program → workout log;
6. settings, health integrations, messaging, dialogs, and edge states;
7. marketing secondary pages, support, consent, privacy, and terms.

Migrating complete journeys prevents polished screens from leading into visibly old ones.

### Phase 5 — Visual and accessibility QA

Create reference screenshots for mobile and desktop web plus supported iPhone sizes. Test:

- default, hover, focus, pressed, selected, disabled, loading, empty, success, warning, and error states;
- light/dark native appearances where supported;
- WCAG AA contrast for text and meaningful controls;
- keyboard navigation and visible focus on web;
- Dynamic Type, VoiceOver, Reduce Motion, and increased contrast on iOS;
- PWA/home-screen icons on iOS and Android;
- native app icon, launch/loading state, and first web frame as one continuous brand experience.

## Definition of done

- A user can move from website → sign-up/login → installed PWA/native app without encountering a different visual identity.
- All primary UI colors resolve through semantic tokens.
- The public, client, coach, and native surfaces use the same canonical mark.
- Client and coach products differ by content/navigation, not by conflicting palettes.
- Component states remain semantically distinct and accessible.
- Automated checks catch unauthorized raw brand colors and visual regressions on critical journeys.
- The icon, launch/loading state, and first interactive screen look like one product.

## Immediate next move

Prototype two icon/lockup routes before implementation:

1. **Recommended:** near-black field, white `F/B`, lime `W`, simplified barbell.
2. **Alternative:** near-black field, white monogram, restrained gold detail, with lime removed from the product and replaced system-wide by gold-derived accessible tokens.

Route 1 fits the existing product and requires much less UI rework. Route 2 is viable only if FWB wants the premium gold identity to supersede the current energetic digital identity across every screen.
