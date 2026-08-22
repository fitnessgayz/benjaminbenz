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

        init(_ exercise: Exercise) {
            code = exercise.code
            name = exercise.name
            prescription = exercise.prescription
            rest = exercise.rest
            instructions = exercise.instructions
            video = exercise.video
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
        let exerciseCode: String
        let exerciseName: String
        let setNumber: Int
        let weight: String
        let reps: String
        let notes: String
        let isCompleted: Bool

        init(_ draft: WorkoutSetDraft) {
            exerciseCode = draft.exerciseCode
            exerciseName = draft.exerciseName
            setNumber = draft.setNumber
            weight = draft.weight
            reps = draft.reps
            notes = draft.notes
            isCompleted = draft.isCompleted
        }

        func draft(exercises: [Exercise]) -> WorkoutSetDraft {
            let exercise = exercises.first {
                $0.code == exerciseCode && $0.name == exerciseName
            } ?? Exercise(code: exerciseCode, name: exerciseName)

            return WorkoutSetDraft(
                exercise: exercise,
                setNumber: setNumber,
                weight: weight,
                reps: reps,
                notes: notes,
                isCompleted: isCompleted
            )
        }

        var containsEntry: Bool {
            !weight.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                !reps.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }

        var logKey: WorkoutLogKey {
            WorkoutLogKey(exerciseCode: exerciseCode, setNumber: setNumber)
        }
    }

    let clientEmail: String
    let entryDate: String
    let workoutTitle: String
    let exercises: [ExerciseSnapshot]
    let sets: [SetSnapshot]
    let updatedAt: Date
    var isFinished: Bool

    init(
        clientEmail: String,
        entryDate: String,
        workoutTitle: String,
        exercises: [Exercise],
        drafts: [WorkoutSetDraft],
        updatedAt: Date = Date(),
        isFinished: Bool = false
    ) {
        self.clientEmail = clientEmail.lowercased()
        self.entryDate = entryDate
        self.workoutTitle = workoutTitle
        self.exercises = exercises.map(ExerciseSnapshot.init)
        sets = drafts.map(SetSnapshot.init)
        self.updatedAt = updatedAt
        self.isFinished = isFinished
    }

    var id: String {
        Self.id(clientEmail: clientEmail, entryDate: entryDate, workoutTitle: workoutTitle)
    }

    var restoredExercises: [Exercise] {
        exercises.map(\.exercise)
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
        var schemaVersion = 1
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

@MainActor
final class WorkoutOfflineSyncStore: ObservableObject {
    enum State: Equatable {
        case idle
        case restoring
        case draftSaved
        case restored
        case syncing
        case synced
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
        let draft = await repository.draft(id: id)
        pendingCount = await repository.pendingCount()

        if draft != nil {
            state = .restored
        } else if pendingCount > 0 {
            state = .queued(pendingCount)
        } else {
            state = .idle
        }
        return draft
    }

    func persistDraft(
        email: String,
        workoutTitle: String,
        entryDate: String,
        exercises: [Exercise],
        drafts: [WorkoutSetDraft]
    ) async {
        let session = OfflineWorkoutSession(
            clientEmail: email,
            entryDate: entryDate,
            workoutTitle: workoutTitle,
            exercises: exercises,
            drafts: drafts
        )

        do {
            try await repository.saveDraft(session)
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
        workoutTitle: String,
        entryDate: String,
        exercises: [Exercise],
        drafts: [WorkoutSetDraft],
        isFinished: Bool
    ) async -> OfflineWorkoutSaveResult {
        let session = OfflineWorkoutSession(
            clientEmail: email,
            entryDate: entryDate,
            workoutTitle: workoutTitle,
            exercises: exercises,
            drafts: drafts,
            isFinished: isFinished
        )

        guard session.containsEntry else {
            let message = "Enter weight, reps, or a note for at least one set."
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

        for session in queued {
            do {
                try await reconcile(session)
                try await repository.removeQueuedSession(
                    id: session.id,
                    clearDraft: true
                )
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
            state = .synced
        } else {
            state = .queued(pendingCount)
        }
        return preferredDidSync
    }

    private func reconcile(_ session: OfflineWorkoutSession) async throws {
        let remoteRecords: [WorkoutLogRecord] = try await client
            .from("client_workout_logs")
            .select("exercise_code,exercise_name,set_number,weight_used,reps,notes")
            .eq("client_email", value: session.clientEmail)
            .eq("entry_date", value: session.entryDate)
            .eq("workout_title", value: session.workoutTitle)
            .execute()
            .value

        let payloads = session.sets.compactMap { set -> WorkoutLogPayload? in
            guard set.containsEntry else { return nil }
            let trimmedNotes = set.notes.trimmingCharacters(in: .whitespacesAndNewlines)
            return WorkoutLogPayload(
                clientEmail: session.clientEmail,
                entryDate: session.entryDate,
                workoutTitle: session.workoutTitle,
                exerciseCode: set.exerciseCode,
                exerciseName: set.exerciseName,
                setNumber: set.setNumber,
                weightUsed: Double(set.weight) ?? 0,
                reps: Double(set.reps),
                notes: trimmedNotes.isEmpty ? nil : trimmedNotes
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

        let desiredKeys = Set(session.sets.filter(\.containsEntry).map(\.logKey))
        let remoteKeys = Set(remoteRecords.map(\.key))
        for key in remoteKeys.subtracting(desiredKeys) {
            try await client
                .from("client_workout_logs")
                .delete()
                .eq("client_email", value: session.clientEmail)
                .eq("entry_date", value: session.entryDate)
                .eq("workout_title", value: session.workoutTitle)
                .eq("exercise_code", value: key.exerciseCode)
                .eq("set_number", value: key.setNumber)
                .execute()
        }
    }
}
