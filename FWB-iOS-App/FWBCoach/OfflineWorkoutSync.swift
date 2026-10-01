import Foundation
import Network
import Supabase

enum OfflineWorkoutSaveResult: Equatable {
    case synced
    case queued
    case invalid(String)
}

struct OfflineWorkoutSession: Codable, Equatable {
    struct ExerciseSnapshot: Codable, Equatable {
        let code: String
        let name: String
        let prescription: String
        let rest: String
        let instructions: [String]?
        let video: String
        let groupID: String?
        let groupKind: WorkoutGroupKind?
        let groupLabel: String?

        init(_ exercise: Exercise, assignment: WorkoutGroupAssignment?) {
            code = exercise.code
            name = exercise.name
            prescription = exercise.prescription
            rest = exercise.rest
            instructions = exercise.instructions
            video = exercise.video
            groupID = assignment?.id
            groupKind = assignment?.kind
            groupLabel = assignment?.label
        }

        var exercise: Exercise {
            Exercise(
                code: code,
                name: name,
                prescription: prescription,
                rest: rest,
                instructions: instructions ?? [],
                video: video
            )
        }
    }

    struct SetSnapshot: Codable, Equatable {
        let id: UUID?
        let exerciseCode: String
        let exerciseName: String
        let setNumber: Int
        let weight: String
        let reps: String
        let duration: String
        let notes: String
        let effortScale: WorkoutEffortScale?
        let effort: String?
        let isCompleted: Bool
        let setType: WorkoutSetType

        private enum CodingKeys: String, CodingKey {
            case id
            case exerciseCode
            case exerciseName
            case setNumber
            case weight
            case reps
            case duration
            case notes
            case effortScale
            case effort
            case isCompleted
            case setType
        }

        init(_ draft: WorkoutSetDraft) {
            id = draft.id
            exerciseCode = draft.exerciseCode
            exerciseName = draft.exerciseName
            setNumber = draft.setNumber
            weight = draft.weight
            reps = draft.reps
            duration = draft.duration
            notes = draft.notes
            effortScale = draft.effortScale
            effort = draft.effort
            isCompleted = draft.isCompleted
            setType = draft.setType
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = try container.decodeIfPresent(UUID.self, forKey: .id)
            exerciseCode = try container.decode(String.self, forKey: .exerciseCode)
            exerciseName = try container.decode(String.self, forKey: .exerciseName)
            setNumber = try container.decode(Int.self, forKey: .setNumber)
            weight = try container.decode(String.self, forKey: .weight)
            reps = try container.decode(String.self, forKey: .reps)
            duration = try container.decodeIfPresent(String.self, forKey: .duration) ?? ""
            notes = try container.decode(String.self, forKey: .notes)
            effortScale = try container.decodeIfPresent(WorkoutEffortScale.self, forKey: .effortScale)
            effort = try container.decodeIfPresent(String.self, forKey: .effort)
            isCompleted = try container.decode(Bool.self, forKey: .isCompleted)
            setType = try container.decodeIfPresent(WorkoutSetType.self, forKey: .setType) ?? .working
        }

        func draft(exercises: [Exercise]) -> WorkoutSetDraft {
            let exercise = exercises.first {
                $0.code == exerciseCode && $0.name == exerciseName
            } ?? Exercise(code: exerciseCode, name: exerciseName)

            return WorkoutSetDraft(
                id: stableID,
                exercise: exercise,
                setNumber: setNumber,
                weight: weight,
                reps: reps,
                duration: duration,
                notes: notes,
                effortScale: effortScale,
                effort: effort ?? "",
                isCompleted: isCompleted,
                setType: setType
            )
        }

        var stableID: UUID {
            id ?? ContinuitySync.stableUUID(
                namespace: "fwb-legacy-workout-set-v1",
                name: "\(exerciseCode)|\(setNumber)|\(exerciseName)"
            )
        }

        var containsEntry: Bool {
            !weight.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                !reps.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                !duration.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                !(effort ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }

        var logKey: WorkoutLogKey {
            WorkoutLogKey(exerciseCode: exerciseCode, setNumber: setNumber)
        }
    }

    let clientEmail: String
    let sessionID: UUID?
    let workoutTemplateID: UUID?
    let entryDate: String
    let workoutTitle: String
    let exercises: [ExerciseSnapshot]
    let sets: [SetSnapshot]
    let updatedAt: Date
    let baseRemoteUpdatedAt: Date?
    var isFinished: Bool
    let difficultyRating: Int?

    init(
        clientEmail: String,
        sessionID: UUID = UUID(),
        workoutTemplateID: UUID? = nil,
        entryDate: String,
        workoutTitle: String,
        exercises: [Exercise],
        drafts: [WorkoutSetDraft],
        groupAssignments: [String: WorkoutGroupAssignment] = [:],
        updatedAt: Date = Date(),
        baseRemoteUpdatedAt: Date? = nil,
        isFinished: Bool = false,
        difficultyRating: Int? = nil
    ) {
        self.clientEmail = clientEmail.lowercased()
        self.sessionID = sessionID
        self.workoutTemplateID = workoutTemplateID
        self.entryDate = entryDate
        self.workoutTitle = workoutTitle
        self.exercises = exercises.map {
            ExerciseSnapshot($0, assignment: groupAssignments[$0.id])
        }
        sets = drafts.map(SetSnapshot.init)
        self.updatedAt = updatedAt
        self.baseRemoteUpdatedAt = baseRemoteUpdatedAt
        self.isFinished = isFinished
        self.difficultyRating = difficultyRating
    }

    var id: String {
        Self.id(clientEmail: clientEmail, entryDate: entryDate, workoutTitle: workoutTitle)
    }

    var stableSessionID: UUID {
        sessionID ?? ContinuitySync.stableUUID(
            namespace: "fwb-legacy-workout-session-v1",
            name: id
        )
    }

    var restoredExercises: [Exercise] {
        exercises.map(\.exercise)
    }

    var restoredGroupAssignments: [String: WorkoutGroupAssignment] {
        Dictionary(uniqueKeysWithValues: exercises.compactMap { snapshot in
            guard let id = snapshot.groupID,
                  let kind = snapshot.groupKind,
                  let label = snapshot.groupLabel else { return nil }
            return (
                snapshot.exercise.id,
                WorkoutGroupAssignment(id: id, kind: kind, label: label)
            )
        })
    }

    var restoredDrafts: [WorkoutSetDraft] {
        let restoredExercises = restoredExercises
        return sets.map { $0.draft(exercises: restoredExercises) }
    }

    var containsEntry: Bool {
        sets.contains(where: \.containsEntry)
    }

    static func id(clientEmail: String, entryDate: String, workoutTitle: String) -> String {
        [
            clientEmail.lowercased().trimmingCharacters(in: .whitespacesAndNewlines),
            entryDate,
            workoutTitle.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        ].joined(separator: "|")
    }
}

private actor OfflineWorkoutRepository {
    static let shared = OfflineWorkoutRepository()

    private struct Container: Codable {
        var schemaVersion = 2
        var drafts: [String: OfflineWorkoutSession] = [:]
        var queue: [String: OfflineWorkoutSession] = [:]
    }

    private let fileManager: FileManager
    private let fileURL: URL

    init(fileManager: FileManager = .default, fileURL: URL? = nil) {
        self.fileManager = fileManager

        if let fileURL {
            self.fileURL = fileURL
        } else {
            let applicationSupport = fileManager.urls(
                for: .applicationSupportDirectory,
                in: .userDomainMask
            ).first ?? fileManager.temporaryDirectory
            self.fileURL = applicationSupport
                .appendingPathComponent("FWBTraining", isDirectory: true)
                .appendingPathComponent("offline-workouts.json", isDirectory: false)
        }
    }

    func draft(id: String) -> OfflineWorkoutSession? {
        read().drafts[id]
    }

    func saveDraft(_ session: OfflineWorkoutSession) throws {
        var container = read()
        guard container.drafts[session.id]?.updatedAt != session.updatedAt else { return }
        container.drafts[session.id] = session
        try write(container)
    }

    func removeDraft(id: String) throws {
        var container = read()
        guard container.drafts.removeValue(forKey: id) != nil else { return }
        try write(container)
    }

    func enqueue(_ session: OfflineWorkoutSession) throws {
        var container = read()
        // Replacing by the logical session id coalesces repeated taps and ensures
        // the queue always holds the newest complete workout snapshot.
        container.queue[session.id] = session
        container.drafts[session.id] = session
        try write(container)
    }

    func queuedSessions() -> [OfflineWorkoutSession] {
        read().queue.values.sorted { $0.updatedAt < $1.updatedAt }
    }

    func removeQueuedSession(id: String, clearDraft: Bool) throws {
        var container = read()
        let removed = container.queue.removeValue(forKey: id) != nil
        if clearDraft {
            container.drafts.removeValue(forKey: id)
        }
        guard removed || clearDraft else { return }
        try write(container)
    }

    func pendingCount() -> Int {
        read().queue.count
    }

    private func read() -> Container {
        guard let data = try? Data(contentsOf: fileURL),
              let container = try? JSONDecoder.offlineWorkoutDecoder.decode(Container.self, from: data) else {
            return Container()
        }
        return container
    }

    private func write(_ container: Container) throws {
        let directory = fileURL.deletingLastPathComponent()
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try JSONEncoder.offlineWorkoutEncoder.encode(container)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
    }
}

private extension JSONEncoder {
    static var offlineWorkoutEncoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }
}

private extension JSONDecoder {
    static var offlineWorkoutDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}

private struct RemoteWorkoutDraftRecord: Decodable {
    let sessionID: UUID
    let snapshot: OfflineWorkoutSession
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case sessionID = "session_id"
        case snapshot
        case updatedAt = "updated_at"
    }
}

private struct RemoteWorkoutDraftPayload: Encodable {
    let sessionID: UUID
    let clientEmail: String
    let workoutKey: String
    let workoutTemplateID: UUID?
    let entryDate: String
    let workoutTitle: String
    let snapshot: OfflineWorkoutSession
    let source = ContinuitySync.source
    let sourceVersion = ContinuitySync.sourceVersion
    let clientUpdatedAt: String

    init(_ session: OfflineWorkoutSession) {
        sessionID = session.stableSessionID
        clientEmail = session.clientEmail
        workoutKey = session.id
        workoutTemplateID = session.workoutTemplateID
        entryDate = session.entryDate
        workoutTitle = session.workoutTitle
        snapshot = session
        clientUpdatedAt = ContinuityDateCoding.string(from: session.updatedAt)
    }

    enum CodingKeys: String, CodingKey {
        case sessionID = "session_id"
        case clientEmail = "client_email"
        case workoutKey = "workout_key"
        case workoutTemplateID = "workout_template_id"
        case entryDate = "entry_date"
        case workoutTitle = "workout_title"
        case snapshot
        case source
        case sourceVersion = "source_version"
        case clientUpdatedAt = "client_updated_at"
    }
}

private struct WorkoutSessionFeedbackPayload: Encodable {
    let sessionID: UUID
    let clientEmail: String
    let workoutTemplateID: UUID?
    let entryDate: String
    let workoutTitle: String
    let difficultyRating: Int
    let source = ContinuitySync.source
    let sourceVersion = ContinuitySync.sourceVersion
    let clientUpdatedAt: String

    init(session: OfflineWorkoutSession, difficultyRating: Int) {
        sessionID = session.stableSessionID
        clientEmail = session.clientEmail
        workoutTemplateID = session.workoutTemplateID
        entryDate = session.entryDate
        workoutTitle = session.workoutTitle
        self.difficultyRating = difficultyRating
        clientUpdatedAt = ContinuityDateCoding.string(from: session.updatedAt)
    }

    enum CodingKeys: String, CodingKey {
        case sessionID = "session_id"
        case clientEmail = "client_email"
        case workoutTemplateID = "workout_template_id"
        case entryDate = "entry_date"
        case workoutTitle = "workout_title"
        case difficultyRating = "difficulty_rating"
        case source
        case sourceVersion = "source_version"
        case clientUpdatedAt = "client_updated_at"
    }
}

@MainActor
final class WorkoutOfflineSyncStore: ObservableObject {
    enum State: Equatable {
        case idle
        case restoring
        case draftSaved
        case restored
        case restoredFromWeb
        case syncing
        case synced
        case conflictResolved(Int)
        case queued(Int)
        case failed(String)
    }

    static let shared = WorkoutOfflineSyncStore()

    @Published private(set) var state: State = .idle
    @Published private(set) var pendingCount = 0

    private let client: SupabaseClient
    private let repository: OfflineWorkoutRepository
    private let monitor: NWPathMonitor
    private let monitorQueue = DispatchQueue(label: "com.benjaminbenz.fwbcoach.workout-network")
    private var isNetworkAvailable = true
    private var isSynchronizing = false

    private init(
        client: SupabaseClient = AppConfiguration.supabase,
        repository: OfflineWorkoutRepository = .shared,
        monitor: NWPathMonitor = NWPathMonitor()
    ) {
        self.client = client
        self.repository = repository
        self.monitor = monitor

        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let wasUnavailable = !self.isNetworkAvailable
                self.isNetworkAvailable = path.status == .satisfied
                if self.isNetworkAvailable && wasUnavailable {
                    await self.retryPending()
                }
            }
        }
        monitor.start(queue: monitorQueue)

        Task {
            pendingCount = await repository.pendingCount()
            if pendingCount > 0 {
                state = .queued(pendingCount)
            }
        }
    }

    func restoreDraft(
        email: String,
        workoutTitle: String,
        entryDate: String
    ) async -> OfflineWorkoutSession? {
        state = .restoring
        let id = OfflineWorkoutSession.id(
            clientEmail: email,
            entryDate: entryDate,
            workoutTitle: workoutTitle
        )
        let localDraft = await repository.draft(id: id)
        let remoteDraft = await loadRemoteDraft(email: email, workoutKey: id)
        let draft: OfflineWorkoutSession?

        if let localDraft, localDraft.isFinished {
            draft = localDraft
        } else if let localDraft, let remoteDraft {
            draft = localDraft.updatedAt >= remoteDraft.updatedAt ? localDraft : remoteDraft
        } else {
            draft = localDraft ?? remoteDraft
        }

        if let draft, await completedLogSupersedes(draft) {
            try? await repository.removeDraft(id: id)
            await removeRemoteDraft(sessionID: draft.stableSessionID)
            pendingCount = await repository.pendingCount()
            state = pendingCount > 0 ? .queued(pendingCount) : .idle
            return nil
        }

        if let draft, draft == remoteDraft, localDraft != remoteDraft {
            try? await repository.saveDraft(draft)
        }
        pendingCount = await repository.pendingCount()

        if draft != nil {
            state = draft == remoteDraft && localDraft != remoteDraft ? .restoredFromWeb : .restored
        } else if pendingCount > 0 {
            state = .queued(pendingCount)
        } else {
            state = .idle
        }
        return draft
    }

    func persistDraft(
        email: String,
        sessionID: UUID,
        workoutTemplateID: UUID?,
        workoutTitle: String,
        entryDate: String,
        exercises: [Exercise],
        drafts: [WorkoutSetDraft],
        groupAssignments: [String: WorkoutGroupAssignment] = [:],
        baseRemoteUpdatedAt: Date?
    ) async {
        let session = OfflineWorkoutSession(
            clientEmail: email,
            sessionID: sessionID,
            workoutTemplateID: workoutTemplateID,
            entryDate: entryDate,
            workoutTitle: workoutTitle,
            exercises: exercises,
            drafts: drafts,
            groupAssignments: groupAssignments,
            baseRemoteUpdatedAt: baseRemoteUpdatedAt
        )

        do {
            try await repository.saveDraft(session)
            if isNetworkAvailable {
                await uploadRemoteDraft(session)
            }
            if !isSynchronizing {
                state = pendingCount > 0 ? .queued(pendingCount) : .draftSaved
            }
        } catch {
            state = .failed("Your workout is still open, but its recovery copy could not be updated.")
        }
    }

    func discardDraft(email: String, workoutTitle: String, entryDate: String) async {
        let id = OfflineWorkoutSession.id(
            clientEmail: email,
            entryDate: entryDate,
            workoutTitle: workoutTitle
        )

        do {
            try await repository.removeDraft(id: id)
            if !isSynchronizing {
                pendingCount = await repository.pendingCount()
                state = pendingCount > 0 ? .queued(pendingCount) : .idle
            }
        } catch {
            state = .failed("The cleared workout could not be removed from local recovery storage.")
        }
    }

    func save(
        email: String,
        sessionID: UUID,
        workoutTemplateID: UUID?,
        workoutTitle: String,
        entryDate: String,
        exercises: [Exercise],
        drafts: [WorkoutSetDraft],
        groupAssignments: [String: WorkoutGroupAssignment] = [:],
        baseRemoteUpdatedAt: Date?,
        isFinished: Bool,
        difficultyRating: Int? = nil
    ) async -> OfflineWorkoutSaveResult {
        let session = OfflineWorkoutSession(
            clientEmail: email,
            sessionID: sessionID,
            workoutTemplateID: workoutTemplateID,
            entryDate: entryDate,
            workoutTitle: workoutTitle,
            exercises: exercises,
            drafts: drafts,
            groupAssignments: groupAssignments,
            baseRemoteUpdatedAt: baseRemoteUpdatedAt,
            isFinished: isFinished,
            difficultyRating: difficultyRating
        )

        if session.sets.contains(where: {
            $0.setType == .timed && $0.containsEntry && (Double($0.duration) ?? 0) <= 0
        }) {
            let message = "Enter a duration for every timed set before saving."
            state = .failed(message)
            return .invalid(message)
        }

        guard session.containsEntry else {
            let message = "Enter weight, reps, time, a note, or effort for at least one set."
            state = .failed(message)
            return .invalid(message)
        }

        if let invalidDraft = drafts.first(where: { $0.effortValidationMessage != nil }) {
            let message = invalidDraft.effortValidationMessage ?? "Check the effort rating and try again."
            state = .failed(message)
            return .invalid(message)
        }

        do {
            // Persist before starting the request. A crash or suspension at any
            // later point leaves a recoverable, retryable operation on disk.
            try await repository.enqueue(session)
            pendingCount = await repository.pendingCount()
        } catch {
            let message = "This workout could not be secured on your iPhone. Try saving again."
            state = .failed(message)
            return .invalid(message)
        }

        guard isNetworkAvailable else {
            state = .queued(pendingCount)
            return .queued
        }

        let didSync = await synchronize(preferredSessionID: session.id)
        return didSync ? .synced : .queued
    }

    func retryPending() async {
        guard isNetworkAvailable else {
            pendingCount = await repository.pendingCount()
            if pendingCount > 0 {
                state = .queued(pendingCount)
            }
            return
        }
        _ = await synchronize(preferredSessionID: nil)
    }

    private func synchronize(preferredSessionID: String?) async -> Bool {
        guard !isSynchronizing else { return false }
        isSynchronizing = true
        state = .syncing
        defer { isSynchronizing = false }

        var queued = await repository.queuedSessions()
        if let preferredSessionID,
           let index = queued.firstIndex(where: { $0.id == preferredSessionID }) {
            let preferred = queued.remove(at: index)
            queued.insert(preferred, at: 0)
        }

        var preferredDidSync = preferredSessionID == nil
        var remoteWins = 0

        for session in queued {
            do {
                remoteWins += try await reconcile(session)
                try await repository.removeQueuedSession(
                    id: session.id,
                    clearDraft: session.isFinished
                )
                if session.isFinished {
                    await removeRemoteDraft(sessionID: session.stableSessionID)
                } else {
                    await uploadRemoteDraft(session)
                }
                if session.id == preferredSessionID {
                    preferredDidSync = true
                }
            } catch is CancellationError {
                break
            } catch {
                // A later item would use the same unavailable service. Keep every
                // remaining operation intact and wait for the next retry signal.
                break
            }
        }

        pendingCount = await repository.pendingCount()
        if pendingCount == 0 {
            state = remoteWins > 0 ? .conflictResolved(remoteWins) : .synced
        } else {
            state = .queued(pendingCount)
        }
        return preferredDidSync
    }

    private func reconcile(_ session: OfflineWorkoutSession) async throws -> Int {
        let remoteRecords: [WorkoutLogRecord]
        do {
            remoteRecords = try await client
                .from("client_workout_logs")
                .select("session_id,set_id,exercise_code,exercise_name,exercise_order,set_number,weight_used,reps,notes,source,source_version,updated_at,completed_at,effort_scale,effort_value,set_type,duration_seconds")
                .eq("session_id", value: session.stableSessionID.uuidString.lowercased())
                .execute()
                .value
        } catch {
            do {
                remoteRecords = try await client
                    .from("client_workout_logs")
                    .select("session_id,set_id,exercise_code,exercise_name,set_number,weight_used,reps,notes,source,source_version,updated_at,completed_at")
                    .eq("session_id", value: session.stableSessionID.uuidString.lowercased())
                    .execute()
                    .value
            } catch {
                return try await reconcileLegacy(session)
            }
        }

        let remoteBySetID = Dictionary(
            remoteRecords.compactMap { record in
                record.setID.map { ($0, record) }
            },
            uniquingKeysWith: { first, second in
                (first.updatedAt ?? .distantPast) >= (second.updatedAt ?? .distantPast) ? first : second
            }
        )

        let exerciseOrder = Dictionary(
            session.exercises.enumerated().map { ($0.element.code, $0.offset) },
            uniquingKeysWith: { first, _ in first }
        )
        var remoteWins = 0
        let payloads = session.sets.compactMap { set -> WorkoutLogPayload? in
            guard set.containsEntry else { return nil }
            let setID = set.stableID
            let remote = remoteBySetID[setID]
            if let remote,
               let remoteUpdatedAt = remote.updatedAt,
               WorkoutConflictResolver.decision(
                localUpdatedAt: session.updatedAt,
                baseRemoteUpdatedAt: session.baseRemoteUpdatedAt,
                localContainsSet: true,
                remote: RemoteWorkoutSetVersion(
                    setID: setID,
                    updatedAt: remoteUpdatedAt,
                    source: remote.source
                )
               ) == .keepRemote {
                remoteWins += 1
                return nil
            }

            let trimmedNotes = set.notes.trimmingCharacters(in: .whitespacesAndNewlines)
            let effortValue = set.effortScale.flatMap { scale in
                let value = Double((set.effort ?? "").trimmingCharacters(in: .whitespacesAndNewlines))
                return value.flatMap { scale.range.contains($0) ? $0 : nil }
            }
            return WorkoutLogPayload(
                sessionID: session.stableSessionID,
                setID: setID,
                workoutTemplateID: session.workoutTemplateID,
                clientEmail: session.clientEmail,
                entryDate: session.entryDate,
                workoutTitle: session.workoutTitle,
                exerciseCode: set.exerciseCode,
                exerciseName: set.exerciseName,
                exerciseOrder: exerciseOrder[set.exerciseCode] ?? 0,
                setNumber: set.setNumber,
                weightUsed: Double(set.weight) ?? 0,
                reps: set.setType == .timed ? nil : Double(set.reps),
                notes: trimmedNotes.isEmpty ? nil : trimmedNotes,
                source: ContinuitySync.source,
                sourceVersion: ContinuitySync.sourceVersion,
                clientUpdatedAt: ContinuityDateCoding.string(from: session.updatedAt),
                completedAt: session.isFinished
                    ? ContinuityDateCoding.string(from: session.updatedAt)
                    : remote?.completedAt.map(ContinuityDateCoding.string),
                effortScale: effortValue == nil ? nil : set.effortScale,
                effortValue: effortValue,
                setType: set.setType,
                durationSeconds: set.setType == .timed ? Double(set.duration) : nil
            )
        }

        if !payloads.isEmpty {
            try await client
                .from("client_workout_logs")
                .upsert(payloads, onConflict: "session_id,set_id")
                .execute()
        }

        let desiredSetIDs = Set(session.sets.filter(\.containsEntry).map(\.stableID))
        for record in remoteRecords where !desiredSetIDs.contains(record.setID ?? UUID()) {
            guard let setID = record.setID, let updatedAt = record.updatedAt else { continue }
            let decision = WorkoutConflictResolver.decision(
                localUpdatedAt: session.updatedAt,
                baseRemoteUpdatedAt: session.baseRemoteUpdatedAt,
                localContainsSet: false,
                remote: RemoteWorkoutSetVersion(setID: setID, updatedAt: updatedAt, source: record.source)
            )
            if decision == .deleteRemote {
                try await client
                    .from("client_workout_logs")
                    .delete()
                    .eq("session_id", value: session.stableSessionID.uuidString.lowercased())
                    .eq("set_id", value: setID.uuidString.lowercased())
                    .lte("updated_at", value: ContinuityDateCoding.string(from: session.baseRemoteUpdatedAt ?? .distantPast))
                    .execute()
            } else {
                remoteWins += 1
            }
        }
        try await upsertDifficultyFeedback(for: session)
        return remoteWins
    }

    private func reconcileLegacy(_ session: OfflineWorkoutSession) async throws -> Int {
        let exerciseOrder = Dictionary(
            session.exercises.enumerated().map { ($0.element.code, $0.offset) },
            uniquingKeysWith: { first, _ in first }
        )
        let payloads = session.sets.compactMap { set -> LegacyWorkoutLogPayload? in
            guard set.containsEntry else { return nil }
            let trimmedNotes = set.notes.trimmingCharacters(in: .whitespacesAndNewlines)
            return LegacyWorkoutLogPayload(
                WorkoutLogPayload(
                    sessionID: session.stableSessionID,
                    setID: set.stableID,
                    workoutTemplateID: session.workoutTemplateID,
                    clientEmail: session.clientEmail,
                    entryDate: session.entryDate,
                    workoutTitle: session.workoutTitle,
                    exerciseCode: set.exerciseCode,
                    exerciseName: set.exerciseName,
                    exerciseOrder: exerciseOrder[set.exerciseCode] ?? 0,
                    setNumber: set.setNumber,
                    weightUsed: Double(set.weight) ?? 0,
                    reps: Double(set.reps),
                    notes: trimmedNotes.isEmpty ? nil : trimmedNotes,
                    source: ContinuitySync.source,
                    sourceVersion: ContinuitySync.sourceVersion,
                    clientUpdatedAt: ContinuityDateCoding.string(from: session.updatedAt),
                    completedAt: nil,
                    effortScale: nil,
                    effortValue: nil,
                    setType: .working,
                    durationSeconds: nil
                )
            )
        }

        if !payloads.isEmpty {
            try await client
                .from("client_workout_logs")
                .upsert(
                    payloads,
                    onConflict: "client_email,entry_date,workout_title,exercise_code,set_number"
                )
                .execute()
        }

        try await upsertDifficultyFeedback(for: session)

        // Legacy schemas have no row versions. Never delete in this path: an
        // apparently missing set may be a newer web edit that this phone has not seen.
        return 0
    }

    private func upsertDifficultyFeedback(for session: OfflineWorkoutSession) async throws {
        guard session.isFinished, let difficultyRating = session.difficultyRating else { return }
        try await client
            .from("workout_session_feedback")
            .upsert(
                WorkoutSessionFeedbackPayload(session: session, difficultyRating: difficultyRating),
                onConflict: "session_id"
            )
            .execute()
    }

    private func loadRemoteDraft(email: String, workoutKey: String) async -> OfflineWorkoutSession? {
        guard isNetworkAvailable else { return nil }
        do {
            let rows: [RemoteWorkoutDraftRecord] = try await client
                .from("client_workout_drafts")
                .select("session_id,snapshot,updated_at")
                .eq("client_email", value: ContinuitySync.normalize(email: email))
                .eq("workout_key", value: workoutKey)
                .order("updated_at", ascending: false)
                .limit(1)
                .execute()
                .value
            return rows.first?.snapshot
        } catch {
            // The continuity migration is deliberately shipped unapplied. Until
            // it is installed, local drafts remain fully functional.
            return nil
        }
    }

    private func uploadRemoteDraft(_ session: OfflineWorkoutSession) async {
        guard !session.isFinished else { return }
        _ = try? await client
            .from("client_workout_drafts")
            .upsert(RemoteWorkoutDraftPayload(session), onConflict: "client_email,workout_key")
            .execute()
    }

    private func removeRemoteDraft(sessionID: UUID) async {
        _ = try? await client
            .from("client_workout_drafts")
            .delete()
            .eq("session_id", value: sessionID.uuidString.lowercased())
            .execute()
    }

    private func completedLogSupersedes(_ draft: OfflineWorkoutSession) async -> Bool {
        guard isNetworkAvailable else { return false }
        struct CompletionRecord: Decodable {
            let completedAt: String?

            enum CodingKeys: String, CodingKey {
                case completedAt = "completed_at"
            }
        }

        do {
            let rows: [CompletionRecord] = try await client
                .from("client_workout_logs")
                .select("completed_at")
                .eq("session_id", value: draft.stableSessionID.uuidString.lowercased())
                .not("completed_at", operator: .is, value: "null")
                .order("completed_at", ascending: false)
                .limit(1)
                .execute()
                .value
            guard let completedAt = ContinuityDateCoding.date(from: rows.first?.completedAt) else { return false }
            return completedAt >= draft.updatedAt
        } catch {
            return false
        }
    }

    private func fetchRemoteRecords(
        for session: OfflineWorkoutSession,
        columns: String
    ) async throws -> [WorkoutLogRecord] {
        try await client
            .from("client_workout_logs")
            .select(columns)
            .eq("client_email", value: session.clientEmail)
            .eq("entry_date", value: session.entryDate)
            .eq("workout_title", value: session.workoutTitle)
            .execute()
            .value
    }
}
