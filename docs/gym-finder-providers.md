# Gym finder providers (unpublished)

The shared gym directory on web and client iOS searches Geoapify Places when
`GEOAPIFY_API_KEY` is set on the Supabase Edge Function. It falls back to public
OpenStreetMap Overpass search if Geoapify is unconfigured or unavailable.
Searches are cached for 24 hours on an approximate 1 km grid. Client-added
gyms remain visible when both providers fail.

The client iOS Gyms tab also has a separate **Search Apple Maps** sheet. Its
results appear on an Apple map and exist only while that sheet is open. Apple
place data is never written to the shared directory or used to populate client
reviews, photos, or gym suggestions. The web app does not use Apple Maps.

## Activation when the feature is approved for release

1. Create a Geoapify free-plan account and API key. Keep the key out of the
   website and iOS binaries.
2. Apply `20261006235531_geoapify_gym_places.sql` after the existing gym
   migrations, then configure `GEOAPIFY_API_KEY` as a Supabase Edge Function
   secret.
3. Deploy `gym-search` and the web and client iOS changes together. Confirm a
   nearby search returns `source: "geoapify"` and visible Geoapify plus
   OpenStreetMap attribution. Then verify an invalid or missing key still
   allows the Overpass and client-added paths.
4. Open the Apple Maps sheet on an iPhone with location permission and confirm
   it shows a map with the live search results. Check both gym and hotel-gym
   searches. Hotel amenities must be confirmed with the hotel.

Geoapify's free plan has a daily credit allowance and requires its own and
OpenStreetMap attribution. The current Places query asks for up to 60 gyms per
cache miss. Apple Maps search uses the native MapKit service and needs no
Geoapify key.
