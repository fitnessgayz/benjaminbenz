# Next update fixes

## Allow weight and rep corrections after logging a set

- **Status:** Implemented for the next update on September 27, 2026.
- **Reported:** September 26, 2026.
- **Affected screen:** Workouts → Custom workout.
- **Reported behavior:** After logging a set, the user cannot update its weight or reps.
- **Expected behavior:** Allow the user to edit and save weight and reps on an already logged set.
- **Reference:** [User screenshot](attachments/logged-set-weight-reps.jpg).

### Acceptance checks

- Weight and reps can be edited after the set is logged.
- Saving updates the existing set, keeps it logged, and does not create a duplicate.
- Updated values remain after leaving and reopening the workout.

### Implementation and validation

- Completed-set weight, reps, duration, and effort fields remain editable while the set stays logged.
- Autosave keeps the existing set identifier, so correcting a value updates the same stored set instead of creating another row.
- `FeedbackParityTests` covers corrected values, stable set identity, logged state, and deletion safety: 20 tests passed on iOS Simulator.
