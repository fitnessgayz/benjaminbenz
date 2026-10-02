import XCTest
@testable import FWBCoach

final class FeedbackParityTests: XCTestCase {
    private let exercise = Exercise(code: "A1", name: "Squat", prescription: "3 x 8")

    func testEnergyAndExplicitLoggingModeSurviveOfflineRoundTrip() throws {
        let session = makeSession(difficulty: 4, energyBefore: 2, energyAfter: 5, loggedSetsOnly: true)
        let restored = try JSONDecoder().decode(OfflineWorkoutSession.self, from: JSONEncoder().encode(session))

        XCTAssertEqual(restored, session)
        XCTAssertEqual(restored.energyBefore, 2)
        XCTAssertEqual(restored.energyAfter, 5)
        XCTAssertEqual(restored.loggedSetsOnly, true)
    }

    func testOlderSnapshotsDecodeWithoutEnergyOrExplicitLoggingFields() throws {
        let original = makeSession()
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(original)) as? [String: Any])
        json.removeValue(forKey: "energyBefore")
        json.removeValue(forKey: "energyAfter")
        json.removeValue(forKey: "loggedSetsOnly")

        let restored = try JSONDecoder().decode(
            OfflineWorkoutSession.self,
            from: JSONSerialization.data(withJSONObject: json)
        )
        XCTAssertNil(restored.energyBefore)
        XCTAssertNil(restored.energyAfter)
        XCTAssertNil(restored.loggedSetsOnly)
        XCTAssertEqual(restored.loggableSets.count, original.loggableSets.count)
    }

    func testFeedbackPayloadMatchesWebEnergyColumnNames() throws {
        let session = makeSession(difficulty: 3, energyBefore: 1, energyAfter: 5)
        let payload = WorkoutSessionFeedbackPayload(session: session, difficultyRating: 3)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(payload)) as? [String: Any])

        XCTAssertEqual(json["difficulty_rating"] as? Int, 3)
        XCTAssertEqual(json["energy_before"] as? Int, 1)
        XCTAssertEqual(json["energy_after"] as? Int, 5)
        XCTAssertEqual(json["client_email"] as? String, "client@example.com")
        XCTAssertNotNil(json["session_id"])
        XCTAssertNil(json["energyBefore"])
    }

    func testSkippedOptionalEnergyEncodesExplicitNulls() throws {
        let session = makeSession(difficulty: 3)
        let payload = WorkoutSessionFeedbackPayload(session: session, difficultyRating: 3)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(payload)) as? [String: Any])

        XCTAssertTrue(json["energy_before"] is NSNull)
        XCTAssertTrue(json["energy_after"] is NSNull)
    }

    func testEnergyBoundsAreValidatedWithoutRequiringOptionalEnergy() {
        XCTAssertNil(makeSession(difficulty: 3).saveValidationMessage)
        XCTAssertNil(makeSession().saveValidationMessage)
        XCTAssertNil(makeSession(difficulty: 3, energyBefore: 1, energyAfter: 5).saveValidationMessage)
        XCTAssertEqual(makeSession(difficulty: 3, energyBefore: 0).saveValidationMessage, "Choose energy ratings from 1 to 5.")
        XCTAssertEqual(makeSession(difficulty: 3, energyAfter: 6).saveValidationMessage, "Choose energy ratings from 1 to 5.")
        XCTAssertEqual(makeSession(energyBefore: 3).saveValidationMessage, "Choose the workout difficulty before saving energy feedback.")
    }

    func testExplicitLoggingFiltersHistoryButPreservesPendingDrafts() {
        let logged = WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "50", reps: "8", isCompleted: true)
        let pending = WorkoutSetDraft(exercise: exercise, setNumber: 2, weight: "60", reps: "", isCompleted: false)
        let blank = WorkoutSetDraft(exercise: exercise, setNumber: 3, isCompleted: false)
        let session = makeSession(drafts: [logged, pending, blank], loggedSetsOnly: true)

        XCTAssertEqual(session.loggableSets.map(\.setNumber), [1])
        XCTAssertEqual(session.restoredDrafts.count, 3)
        XCTAssertEqual(session.restoredDrafts[1].weight, "60")
        XCTAssertFalse(session.restoredDrafts[1].isCompleted)
        XCTAssertNil(session.saveValidationMessage)
    }

    func testPendingInvalidTimedAndEffortInputsDoNotBlockLoggedSets() {
        let logged = WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "50", reps: "8", isCompleted: true)
        let pendingTimed = WorkoutSetDraft(
            exercise: exercise, setNumber: 2, duration: "0", notes: "Still editing",
            isCompleted: false, setType: .timed
        )
        let pendingEffort = WorkoutSetDraft(
            exercise: exercise, setNumber: 3, weight: "60", effortScale: .rpe,
            effort: "100", isCompleted: false
        )
        let session = makeSession(drafts: [logged, pendingTimed, pendingEffort], loggedSetsOnly: true)

        XCTAssertEqual(session.loggableSets.count, 1)
        XCTAssertNil(session.saveValidationMessage)
    }

    func testLoggedInvalidTimedInputStillRequiresCorrection() {
        let invalid = WorkoutSetDraft(
            exercise: exercise, setNumber: 1, duration: "0", notes: "Invalid time",
            isCompleted: true, setType: .timed
        )
        let session = makeSession(drafts: [invalid], loggedSetsOnly: true)

        XCTAssertEqual(session.saveValidationMessage, "Enter a duration for every timed set before saving.")
    }

    func testOnlyPendingInputsCannotBeSavedAsLoggedHistory() {
        let pending = WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "50", reps: "8", isCompleted: false)
        let session = makeSession(drafts: [pending], loggedSetsOnly: true)

        XCTAssertTrue(session.containsEntry)
        XCTAssertTrue(session.loggableSets.isEmpty)
        XCTAssertEqual(session.saveValidationMessage, "Log at least one set or round before saving.")
    }

    func testDefaultModeRetainsCompatibilityForExistingCallers() {
        let pending = WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "50", reps: "8", isCompleted: false)
        let session = makeSession(drafts: [pending])

        XCTAssertEqual(session.loggedSetsOnly, false)
        XCTAssertEqual(session.loggableSets.count, 1)
        XCTAssertNil(session.saveValidationMessage)
    }

    func testCorrectingLoggedSetKeepsStableIdentityAndLoggedState() {
        let setID = UUID()
        let original = WorkoutSetDraft(
            id: setID, exercise: exercise, setNumber: 1,
            weight: "50", reps: "8", isCompleted: true
        )
        let corrected = WorkoutSetDraft(
            id: setID, exercise: exercise, setNumber: 1,
            weight: "55", reps: "9", isCompleted: true
        )

        let originalSession = makeSession(drafts: [original], loggedSetsOnly: true)
        let correctedSession = makeSession(drafts: [corrected], loggedSetsOnly: true)

        XCTAssertEqual(originalSession.loggableSets.map(\.stableID), [setID])
        XCTAssertEqual(correctedSession.loggableSets.map(\.stableID), [setID])
        XCTAssertEqual(correctedSession.loggableSets.map(\.weight), ["55"])
        XCTAssertEqual(correctedSession.loggableSets.map(\.reps), ["9"])
        XCTAssertTrue(correctedSession.loggableSets.allSatisfy(\.isCompleted))
        XCTAssertTrue(correctedSession.remoteDeletionCandidateIDs(from: [setID]).isEmpty)
    }

    func testReopenedRemoteSetIsNotDeletedWhileEditing() {
        let reopened = WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "60", reps: "8", isCompleted: false)
        let logged = WorkoutSetDraft(exercise: exercise, setNumber: 2, weight: "50", reps: "8", isCompleted: true)
        let session = makeSession(drafts: [reopened, logged], loggedSetsOnly: true)

        XCTAssertEqual(session.loggableSets.map(\.stableID), [logged.id])
        XCTAssertTrue(session.remoteDeletionCandidateIDs(from: [reopened.id, logged.id]).isEmpty)
    }

    func testOnlyExplicitlyRemovedRowsAreDeletionCandidatesInLoggedMode() {
        let reopenedAndCleared = WorkoutSetDraft(exercise: exercise, setNumber: 1, isCompleted: false)
        let removedID = UUID()
        let session = makeSession(drafts: [reopenedAndCleared], loggedSetsOnly: true)

        XCTAssertTrue(session.loggableSets.isEmpty)
        XCTAssertEqual(session.remoteDeletionCandidateIDs(from: [reopenedAndCleared.id, removedID]), [removedID])
    }

    @MainActor
    func testPreviewSyncStoresKeepTheirDraftsAndQueuesIsolatedInMemory() async {
        let first = WorkoutOfflineSyncStore.previewStore()
        let second = WorkoutOfflineSyncStore.previewStore()
        let draft = WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "50", reps: "8", isCompleted: true)
        let result = await first.save(
            email: "preview.client@example.com", sessionID: UUID(), workoutTemplateID: nil,
            workoutTitle: "Preview", entryDate: "2026-09-25", exercises: [exercise], drafts: [draft],
            baseRemoteUpdatedAt: nil, isFinished: false, loggedSetsOnly: true
        )

        XCTAssertEqual(result, .queued)
        XCTAssertEqual(first.pendingCount, 1)
        await second.retryPending()
        XCTAssertEqual(second.pendingCount, 0)
        let restored = await first.restoreDraft(email: "preview.client@example.com", workoutTitle: "Preview", entryDate: "2026-09-25")
        let unrelated = await second.restoreDraft(email: "preview.client@example.com", workoutTitle: "Preview", entryDate: "2026-09-25")
        XCTAssertEqual(restored?.restoredDrafts.first?.id, draft.id)
        XCTAssertNil(unrelated)
    }

    func testTwoSameDaySessionsRemainQueuedAndFinishingOlderPreservesNewDraft() async throws {
        let repository = OfflineWorkoutRepository(inMemory: true)
        let first = makeSession(updatedAt: Date(timeIntervalSince1970: 1_800_000_000))
        let second = makeSession(updatedAt: Date(timeIntervalSince1970: 1_800_000_010))
        XCTAssertEqual(first.id, second.id)
        XCTAssertNotEqual(first.stableSessionID, second.stableSessionID)
        try await repository.enqueue(first)
        try await repository.enqueue(second)

        let queued = await repository.queuedSessions()
        XCTAssertEqual(Set(queued.map(\.stableSessionID)), [first.stableSessionID, second.stableSessionID])
        try await repository.removeQueuedSession(sessionID: first.stableSessionID, clearDraft: true)
        let remaining = await repository.queuedSessions()
        let draft = await repository.draft(id: first.id)
        XCTAssertEqual(remaining.map(\.stableSessionID), [second.stableSessionID])
        XCTAssertEqual(draft?.stableSessionID, second.stableSessionID)
    }

    func testOneStableSessionCoalescesToNewestSnapshot() async throws {
        let repository = OfflineWorkoutRepository(inMemory: true)
        let identity = UUID()
        let older = makeSession(sessionID: identity, updatedAt: Date(timeIntervalSince1970: 1_800_000_000))
        let newer = makeSession(sessionID: identity, updatedAt: Date(timeIntervalSince1970: 1_800_000_010))
        try await repository.enqueue(older)
        try await repository.enqueue(newer)
        try await repository.enqueue(older)

        let queued = await repository.queuedSessions()
        XCTAssertEqual(queued, [newer])
    }

    func testAcknowledgingOlderSnapshotDoesNotRemoveNewerSaveOfSameSession() async throws {
        let repository = OfflineWorkoutRepository(inMemory: true)
        let identity = UUID()
        let older = makeSession(sessionID: identity, updatedAt: Date(timeIntervalSince1970: 1_800_000_000))
        let newer = makeSession(sessionID: identity, updatedAt: Date(timeIntervalSince1970: 1_800_000_010))
        try await repository.enqueue(older)
        try await repository.enqueue(newer)
        try await repository.removeQueuedSession(
            sessionID: identity, syncedUpdatedAt: older.updatedAt, clearDraft: true
        )

        let queued = await repository.queuedSessions()
        let draft = await repository.draft(id: newer.id)
        XCTAssertEqual(queued, [newer])
        XCTAssertEqual(draft, newer)
    }

    func testAcknowledgementCannotRemoveDifferentSnapshotWithSameTimestamp() async throws {
        let repository = OfflineWorkoutRepository(inMemory: true)
        let identity = UUID()
        let timestamp = Date(timeIntervalSince1970: 1_800_000_000)
        let older = makeSession(sessionID: identity, updatedAt: timestamp)
        let changedDraft = WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "70", reps: "8", isCompleted: true)
        let newer = makeSession(drafts: [changedDraft], sessionID: identity, updatedAt: timestamp)
        try await repository.enqueue(older)
        try await repository.enqueue(newer)
        try await repository.removeQueuedSession(
            sessionID: identity, syncedUpdatedAt: timestamp, syncedSnapshot: older, clearDraft: true
        )

        let queued = await repository.queuedSessions()
        XCTAssertEqual(queued, [newer])
    }

    func testNewSessionDraftWithSameTimestampReplacesPreviousSessionDraft() async throws {
        let repository = OfflineWorkoutRepository(inMemory: true)
        let timestamp = Date(timeIntervalSince1970: 1_800_000_000)
        let first = makeSession(updatedAt: timestamp)
        let second = makeSession(updatedAt: timestamp)
        try await repository.saveDraft(first)
        try await repository.saveDraft(second)

        let draft = await repository.draft(id: second.id)
        XCTAssertEqual(draft?.stableSessionID, second.stableSessionID)
    }

    func testLegacyLogicalQueueKeyMigratesAndCanBeAcknowledgedByStableID() async throws {
        let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent("fwb-queue-test-\(UUID()).json")
        defer { try? FileManager.default.removeItem(at: fileURL) }
        let first = makeSession(updatedAt: Date(timeIntervalSince1970: 1_800_000_000))
        let second = makeSession(updatedAt: Date(timeIntervalSince1970: 1_800_000_010))
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let snapshot = try JSONSerialization.jsonObject(with: encoder.encode(first))
        let legacyContainer: [String: Any] = [
            "schemaVersion": 2,
            "drafts": [first.id: snapshot],
            "queue": [first.id: snapshot]
        ]
        try JSONSerialization.data(withJSONObject: legacyContainer).write(to: fileURL)
        let repository = OfflineWorkoutRepository(fileURL: fileURL)
        let restored = await repository.queuedSessions()
        XCTAssertEqual(restored.map(\.stableSessionID), [first.stableSessionID])

        try await repository.enqueue(second)
        let migrated = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: fileURL)) as? [String: Any])
        let migratedQueue = try XCTUnwrap(migrated["queue"] as? [String: Any])
        XCTAssertEqual(Set(migratedQueue.keys), [first.stableSessionID.uuidString.lowercased(), second.stableSessionID.uuidString.lowercased()])
        XCTAssertEqual(migrated["schemaVersion"] as? Int, 3)

        try await repository.removeQueuedSession(sessionID: first.stableSessionID, clearDraft: true)
        let remaining = await repository.queuedSessions()
        let draft = await repository.draft(id: second.id)
        XCTAssertEqual(remaining.map(\.stableSessionID), [second.stableSessionID])
        XCTAssertEqual(draft?.stableSessionID, second.stableSessionID)
    }

    private func makeSession(
        drafts: [WorkoutSetDraft]? = nil,
        sessionID: UUID = UUID(),
        updatedAt: Date = Date(),
        difficulty: Int? = nil,
        energyBefore: Int? = nil,
        energyAfter: Int? = nil,
        loggedSetsOnly: Bool = false
    ) -> OfflineWorkoutSession {
        OfflineWorkoutSession(
            clientEmail: "client@example.com",
            sessionID: sessionID,
            entryDate: "2026-09-25",
            workoutTitle: "Strength",
            exercises: [exercise],
            drafts: drafts ?? [WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "50", reps: "8", isCompleted: true)],
            updatedAt: updatedAt,
            isFinished: true,
            difficultyRating: difficulty,
            energyBefore: energyBefore,
            energyAfter: energyAfter,
            loggedSetsOnly: loggedSetsOnly
        )
    }
}

@MainActor
final class WorkoutPraiseAchievementIntegrationTests: XCTestCase {
    private let exercise = Exercise(code: "A1", name: "Squat", prescription: "3 x 8")
    private let title = "Strength"

    func testFirstCompletedSessionAwardsFirstSparkWithoutAnInventedPR() {
        let result = praise(date: "2020-01-01", sessionID: UUID(), drafts: [draft(weight: "50")])

        XCTAssertEqual(result.progress?.workoutCount, 1)
        XCTAssertEqual(result.progress?.prCount, 0)
        XCTAssertEqual(result.achievements.map(\.id), ["badge:workout-1"])
        XCTAssertEqual(result.earnedXP, 200)
        XCTAssertFalse(result.awardsPendingSync)
    }

    func testQueuedOfflineCompletionSuppressesBadgesPRsXPAndLevelUntilSync() {
        let previous = history(date: "2020-01-01", sessionID: UUID(), weight: 50)
        let result = praise(date: "2020-01-02", sessionID: UUID(), drafts: [draft(weight: "60")],
            history: [previous], syncPending: true)

        XCTAssertTrue(result.achievements.isEmpty)
        XCTAssertNil(result.progress)
        XCTAssertEqual(result.earnedXP, 0)
        XCTAssertFalse(result.leveledUp)
        XCTAssertTrue(result.awardsPendingSync)
        XCTAssertTrue(result.message.contains("after it syncs"))
    }

    func testIncompleteHistoryCannotGrantFirstWorkoutOrRecordAwards() {
        let result = praise(date: "2020-01-01", sessionID: UUID(), drafts: [draft(weight: "100")],
            historyIsComplete: false)

        XCTAssertTrue(result.achievements.isEmpty)
        XCTAssertNil(result.progress)
        XCTAssertEqual(result.earnedXP, 0)
        XCTAssertFalse(result.leveledUp)
        XCTAssertTrue(result.awardsPendingSync)
        XCTAssertTrue(result.message.contains("Refresh your history"))
    }

    func testSameDaySameTitleDifferentSessionIDsCountAsSeparateWorkoutsAndComparePRs() {
        let firstID = UUID()
        let secondID = UUID()
        let previous = history(date: "2020-01-01", sessionID: firstID, weight: 50)
        let result = praise(date: "2020-01-01", sessionID: secondID, drafts: [draft(weight: "60")], history: [previous])

        XCTAssertEqual(result.progress?.workoutCount, 2)
        XCTAssertEqual(result.progress?.prCount, 1)
        XCTAssertTrue(result.achievements.contains { $0.id == "pr:session:\(secondID.uuidString.lowercased()):squat" })
        XCTAssertTrue(result.achievements.contains { $0.id == "badge:pr-1" })
        XCTAssertFalse(result.achievements.contains { $0.id == "badge:workout-1" })
        XCTAssertEqual(result.earnedXP, 250)
        XCTAssertTrue(result.leveledUp)
    }

    func testRefinishingAnAlreadyCompletedSessionDoesNotReplayOldAwardsOnAnotherDevice() {
        let sessionID = UUID()
        let first = history(date: "2020-01-01", sessionID: UUID(), weight: 50)
        let alreadySaved = history(date: "2020-01-02", sessionID: sessionID, weight: 60)
        let result = praise(date: "2020-01-02", sessionID: sessionID, drafts: [draft(weight: "60")], history: [first, alreadySaved])

        XCTAssertEqual(result.progress?.workoutCount, 2)
        XCTAssertEqual(result.progress?.prCount, 1)
        XCTAssertTrue(result.achievements.isEmpty, "The old PR and badge already exist in the complete before snapshot.")
        XCTAssertEqual(result.earnedXP, 0)
        XCTAssertFalse(result.leveledUp)
    }

    func testACompletedSessionReplacesItsAutosavedDraftAndEarnsOnlyTheNewSessionEvents() {
        let sessionID = UUID()
        let first = history(date: "2020-01-01", sessionID: UUID(), weight: 50)
        let autosaved = history(date: "2020-01-02", sessionID: sessionID, weight: 60, completed: false)
        let result = praise(date: "2020-01-02", sessionID: sessionID, drafts: [draft(weight: "60")], history: [first, autosaved])

        XCTAssertEqual(result.progress?.workoutCount, 2)
        XCTAssertEqual(result.progress?.prCount, 1)
        XCTAssertEqual(result.earnedXP, 250)
        XCTAssertEqual(result.achievements.count, 2)
    }

    func testBackdatedWorkoutComparesAgainstEarlierHistoryRatherThanLaterAllTimeBest() {
        let earlier = history(date: "2020-01-01", sessionID: UUID(), weight: 50)
        let later = history(date: "2020-01-03", sessionID: UUID(), weight: 80)
        let sessionID = UUID()
        let result = praise(date: "2020-01-02", sessionID: sessionID, drafts: [draft(weight: "60")], history: [earlier, later])

        XCTAssertEqual(result.progress?.workoutCount, 3)
        XCTAssertEqual(result.progress?.prCount, 2)
        XCTAssertTrue(result.achievements.contains { $0.id == "pr:session:\(sessionID.uuidString.lowercased()):squat" })
        XCTAssertEqual(result.earnedXP, 150)
    }

    func testPendingSetsAndWarmupsCannotCreateCompletionOrPRs() {
        let pending = WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: "500", reps: "8", isCompleted: false)
        let warmup = WorkoutSetDraft(exercise: exercise, setNumber: 1001, weight: "500", reps: "8",
            isCompleted: true, setType: .warmUp)
        let previous = history(date: "2020-01-01", sessionID: UUID(), weight: 50)
        let result = praise(date: "2020-01-02", sessionID: UUID(), drafts: [pending, warmup], history: [previous])

        XCTAssertEqual(result.progress?.workoutCount, 1)
        XCTAssertEqual(result.progress?.prCount, 0)
        XCTAssertTrue(result.achievements.isEmpty)
        XCTAssertEqual(result.earnedXP, 0)
    }

    func testTimedRecoveryCompletionCountsAWorkoutWithoutInventingARepetitionPR() {
        let timed = WorkoutSetDraft(exercise: Exercise(code: "M1", name: "Hip stretch", prescription: "30 sec"),
            setNumber: 1, duration: "30", isCompleted: true, setType: .timed)
        let result = praise(date: "2020-01-01", sessionID: UUID(), drafts: [timed])

        XCTAssertEqual(result.progress?.workoutCount, 1)
        XCTAssertEqual(result.progress?.prCount, 0)
        XCTAssertEqual(result.achievements.map(\.id), ["badge:workout-1", "badge:mobility-1"])
        XCTAssertEqual(result.progress?.mobilityWorkoutCount, 1)
        XCTAssertEqual(result.earnedXP, 300)
    }

    private func draft(weight: String) -> WorkoutSetDraft {
        WorkoutSetDraft(exercise: exercise, setNumber: 1, weight: weight, reps: "8", isCompleted: true)
    }

    private func history(date: String, sessionID: UUID, weight: Double, completed: Bool = true) -> WorkoutHistorySession {
        let timestamp = ISO8601DateFormatter().date(from: "\(date)T12:00:00Z")!
        let record = WorkoutHistoryRecord(sessionID: sessionID, setID: UUID(), entryDate: date,
            workoutTitle: title, exerciseCode: exercise.code, exerciseName: exercise.name,
            setNumber: 1, weightUsed: weight, reps: 8, notes: nil,
            completedAt: completed ? timestamp : nil, setType: .working)
        return WorkoutHistorySession(entryDate: date, workoutTitle: title, records: [record])
    }

    private func praise(date: String, sessionID: UUID, drafts: [WorkoutSetDraft],
        history: [WorkoutHistorySession] = [], historyIsComplete: Bool = true, syncPending: Bool = false) -> WorkoutCelebration {
        WorkoutPraiseEvaluator.strength(clientEmail: "achievement-test-\(UUID())@example.com", workoutTitle: title,
            entryDate: date, startedAt: Date().addingTimeInterval(-1200), drafts: drafts, history: history,
            weeklyGoal: 3, sessionID: sessionID, historyIsComplete: historyIsComplete,
            syncPending: syncPending, recordAwards: false)
    }
}
