# FWB Cross-Platform Brand Contract

Status: working contract for the website, mobile web/PWA, and iOS workstreams.

This document prevents each surface from inventing its own version of FWB. Surface-specific specifications may extend these rules but may not contradict them without recording and approving a cross-platform decision.

## Brand foundation

- Purpose: help people build strength through awareness, intention, and expert personal coaching.
- Promise: **Train with intention. Feel your progress.**
- Personality: energetic, grounded, precise, encouraging, and human.
- Emotional result: users feel capable, understood, and connected to their coach.
- Differentiator: thoughtful personal coaching and continuity between sessions—not another generic workout tracker.

## Naming architecture

| Role | Approved name |
| --- | --- |
| Master brand | Fitness with Benjamin |
| Compact mark | FWB |
| Client product | FWB Training |
| Coach product | FWB Coach |
| Client-facing AI feature | FWB Training Assistant |

Generic phrases such as `Training portal`, `Client Dashboard`, `Coach Admin`, and `Coach access` may describe internal routes or permissions, but they are not product names.

## Core visual system

- Primary brand: `#D6FF35`
- Primary ink: `#171A17`
- Deep field: `#080A08`
- Canvas: `#F2F3EE`
- Soft surface: `#F7F8F4`
- Raised surface: `#FFFFFF`
- Muted text: `#666B62`
- Border: `#DCDED7`
- Focus: `#718A18`

Lime identifies the most important action, current selection, progress, and compact brand moments. It is not a generic fill for every card or success state. Status colors remain semantic and distinct from brand color.

The app/PWA icon must be derived from one vector master and visually match the interface users see after opening the product. The current black/white/gold icon is legacy until explicitly reapproved as the master direction.

## Typography and imagery

- Use Inter as the shared UI and digital brand family unless a future identity decision replaces it everywhere.
- Preserve bold, compact headline hierarchy without turning every heading into display type.
- Prefer authentic coaching and training photography over generic fitness stock imagery or decorative illustration.
- Photography should show attention, form, effort, and human coaching—not only physique or intensity.

## Voice rules

- Direct and motivating without shouting.
- Expert without sounding clinical.
- Personal without forced slang.
- Specific about the next action and what was preserved when something fails.
- Celebrate real training behavior and progress, not arbitrary app engagement.

Do not use `Are you DTF?` in the primary acquisition or onboarding journey. Do not expose internal terminology such as `Client selector`, `private page`, or `Checking client access` when task-oriented language is available.

## Shared experience principles

1. Lead each screen with the user's next meaningful action.
2. Make coach connection visible and human.
3. Use progressive disclosure for complexity and sensitive information.
4. Keep installed icon, launch/loading state, authentication, and first interactive frame continuous.
5. Use the same semantic token names and meanings in CSS and Swift.
6. Keep client and coach products related through brand, but differentiated through tasks and information architecture.
7. Treat accessibility, recovery states, performance, and support as expressions of brand quality.

## Cross-platform component contract

Every surface should share equivalent roles for:

- brand mark and product lockup;
- primary, secondary, ghost, and destructive actions;
- inputs, validation, help, and sensitive-data explanations;
- cards, grouped sections, sheets/dialogs, and navigation;
- loading, empty, success, warning, error, and offline states;
- focus, selected, pressed, disabled, and unread states;
- coach message, next workout, progress, and achievement moments.

Components may be implemented natively per platform, but their hierarchy, semantics, copy patterns, and visual intent must remain equivalent.

## Decision and review process

Before a surface ships a new brand pattern:

1. Record the user need and semantic role.
2. Check whether the role already exists on another surface.
3. Reuse or extend the shared token/component contract.
4. Review the change in at least one adjacent surface.
5. Capture desktop/mobile/native evidence as applicable.
6. Verify accessibility and state coverage.

Shared decisions belong in this contract or the main brand audit. Surface-only implementation details belong in the corresponding workstream specification.

## Current open decisions

- Final vector construction for the simplified FWB mark and icon.
- Whether heritage gold is retired or retained for rare editorial/premium use.
- Final client and coach product lockups.
- Exact mobile navigation labels after usability validation.
- Final App Store/PWA screenshot and acquisition asset set.
