# Apple Workout attachments

Clients can attach a JPG, PNG, or WebP screenshot under 8 MB to an existing workout from Logs or the completion screen. They review the date and numbers, confirm the selected session, and save. The coach sees the summary alongside the client's saved exercise sets and can open the private original image.

Apple workout time and energy remain separate from the app's elapsed timer. Missing metrics stay null, zero calories stays zero, and the screenshot preserves the heart-rate graph without inventing a time series. No new exercise log or second workout is created by attaching a screenshot.

Clients can use **Share workout** on each saved session in Logs or after completing a workout. The preview and exported card include saved Apple workout time, active and total calories, and average heart rate when available. Adding or editing Apple details from the preview returns to an updated card after saving. Sharing uses only the reviewed metrics; it does not include the private screenshot or storage link. Historical cards show the workout date and the count for that week.

## Deployment

The `add_apple_workout_attachments` migration creates the private `apple-workouts` bucket, `client_apple_workouts`, and a service-only daily extraction quota. Clients write their own attachments; coaches have read access. Replacements use new storage paths, and referenced screenshots cannot be deleted during cleanup. Session keys match `clientWorkoutHistorySessionKey`; legacy date/title keys are supported only for logs without a session UUID.

Automatic reading is **disabled** in `configureClientAppleWorkouts`. The `extract-apple-workout` function is implemented and tested but was not deployed: automatic approval review requires explicit authorization before screenshots and health data are sent to OpenAI. Manual upload, review, and saving work independently.

If automatic reading is authorized, deploy `extract-apple-workout` with JWT verification enabled before setting `automaticReading: true` in the client configuration. It uses the project's existing `OPENAI_API_KEY` and defaults to `gpt-4.1-mini-2025-04-14` (`APPLE_WORKOUT_EXTRACTION_MODEL` overrides it). The form explicitly names OpenAI before file selection. Extraction does not save metrics; the user must still review and confirm. Unreadable images, provider errors, and quota limits fall back to manual entry.

## Verification

Run `node --test tests/apple-workout*.test.js`. The optional actual PostgreSQL policy test uses PGlite: set `APPLE_WORKOUT_PGLITE_PATH` to an installed `@electric-sql/pglite` package directory. Without it, that test explicitly skips.

Coverage includes ownership and coach access, canonical and legacy sessions, file bounds, extraction authentication and sanitization, null/zero handling, optimistic edits, conflicting uploads, uncertain-write recovery, and client-switch races. Mobile browser checks also cover upload/review/save, failed-save retry, manual mode with zero extraction requests, image viewing, completion shortcuts, and layouts from 320 to 1280 pixels.
