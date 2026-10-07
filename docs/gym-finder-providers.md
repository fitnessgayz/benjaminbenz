# Gym finder providers (apps unpublished)

The shared gym directory on web and client iOS searches Geoapify Places when
`GEOAPIFY_API_KEY` is set on the Supabase Edge Function. It supplements those
results with hotels explicitly tagged as having a gym in OpenStreetMap. If
Geoapify is unavailable, public OpenStreetMap Overpass supplies gym results.
Searches are cached for 24 hours on an approximate 1 km grid. If the hotel
query is busy, gym results remain available and the incomplete search is cached
for 15 minutes. Client-added gyms remain visible when both providers fail.

The client iOS Gyms tab also has a separate **Search Apple Maps** sheet. Its
results appear on an Apple map and exist only while that sheet is open. Apple
place data is never written to the shared directory or used to populate client
reviews, photos, or gym suggestions. The web app does not use Apple Maps.

## Current activation state

The Geoapify place-identity and gym-search partial-cache migrations are applied
to the FWB Supabase project. `GEOAPIFY_API_KEY` is saved as an Edge Function
secret. Authenticated web requests to `gym-search` version 9 returned 60 nearby
Geoapify gyms and Geoapify/OpenStreetMap attribution. The public Overpass hotel
query was busy in the live test, so the hotel-only filter showed an honest retry
message. The function source is still staged: a production workflow run from
`main` can overwrite this deployment until this branch is merged.

The unpublished web Gyms tab and add-place form render without JavaScript
errors. The photo/amenity migration `20261006232647_gym_photos_without_reviews`
has been applied live: `gym_photos_for_place` and `gym_features_for_place` work,
and the gallery displays "No photos yet" when no client uploads exist. The
authenticated `gym-place-photo` Edge Function is active as version 1. It asks
Geoapify Place Details for the image URL of a selected Geoapify gym; the key
stays server-side and the result is cached in the function isolate for one day.
Folk and Barry's returned no source image, which is expected when OpenStreetMap
has no image data for a place. Client photos remain available as a fallback.
The web and iOS app changes remain unpublished. The newest TestFlight build
verified in App Store Connect on 2026-10-06 is `100.33.1 (1084.1.0)`; the iOS
staging branch now contains the latest `origin/main` plus the gym changes.
The published web homepage's existing "Explore nearby gyms & reviews" entry
still timed out requesting this Mac's location, so that entry was not an
end-to-end confirmation of the production UI.

## Remaining activation and release checks

1. Merge the Geoapify function source into `main` before another production
   workflow deploy overwrites version 9. Verify an invalid or missing key still
   allows the Overpass and client-added paths.
2. Test client photo upload and deletion with a signed-in account and an
   appropriate gym photo before publishing the Gyms tab. Confirm display in
   both web and iOS. Geoapify provider photos appear only where OpenStreetMap
   has an image tag; Folk and Barry's had none. Retry a live hotel-gym search
   when Overpass is responsive.
3. Open the Apple Maps sheet on an iPhone with location permission and confirm
   it shows a map with the live search results. Check both gym and hotel-gym
   searches. Hotel amenities must be confirmed with the hotel.
4. Release the web and client iOS changes only after those checks pass.

Geoapify's free plan has a daily credit allowance and requires its own and
OpenStreetMap attribution. The current Places query asks for up to 60 gyms per
cache miss. Apple Maps search uses the native MapKit service and needs no
Geoapify key.
