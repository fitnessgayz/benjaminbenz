# FWB brand release 1 implementation

Date: 2026-09-28

This release applies the shared brand contract to the highest-visibility boundaries without attempting the larger navigation and information-architecture rebuild.

## Shipped in this slice

- Public website: canonical promise, direct coaching-fit CTA, clearer experience proof, removal of public DTF language, and visible support/privacy continuity.
- Client web app: **FWB Training** installed identity, aligned login/onboarding copy, deep-ink browser chrome, and canonical PWA metadata.
- Coach web app: **FWB Coach** installed identity and a distinct coach sign-in boundary connected to the shared client product.
- AI surfaces: **FWB Training Assistant** naming across public, OAuth, and MCP presentation pages.
- iOS: explicit FWB Coach WebView-shell architecture, semantic named colors, aligned loading/recovery states, and the shared app icon.
- Shared identity: canonical semantic web/iOS tokens and versioned lime/ink app-icon masters.

## Verification

- Branding, auth, onboarding, public conversion, questionnaire, and signup tests: 105 passing.
- MCP typecheck: passing.
- MCP tests: 22 passing.
- iOS generic-device Debug build with signing disabled: passing.
- Asset catalogs: valid JSON.
- App icon: 1024 × 1024, no alpha; visually checked at 180 px and 32 px.
- Desktop and 390 × 844 browser previews: public homepage, FWB Training login, and FWB Coach login checked.
- `git diff --check`: passing.

The repository-wide web suite is not fully green: 1,335 tests pass, 15 are skipped, and 21 fail in navigation, cache-version, card-deck, health-settings, and related feature assertions outside this brand slice. These should be reconciled with the existing in-progress feature work before using the full suite as a release gate.

## Next coordinated slice

1. Consolidate client navigation to Home / Train / History / Progress / More.
2. Consolidate coach navigation to Home / Clients / Inbox / More with Log Workout contextual.
3. Split the long public prospect form from the post-enrollment PAR-Q/health workflow.
4. Replace remaining feature-level raw colors with semantic roles and verify contrast/state behavior.
5. Update hero photography/crop to show Benjamin’s face and a clearer coach-client interaction.
