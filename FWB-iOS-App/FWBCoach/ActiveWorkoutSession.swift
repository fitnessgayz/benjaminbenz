import Combine
import Foundation

/// The complete in-progress workout, including unlogged entries and its original clock.
struct ActiveWorkoutSession: Codable, Equatable, Hashable, Identifiable {
    let snapshot: OfflineWorkoutSession
    let startedAt: Date
    let entryDate: Date
    let workoutID: UUID
    let workoutFocus: String
    let workoutFormat: String
    let isGeneratedWorkout: Bool
    let customWorkoutFormatRaw: String
    let energyBefore: Int?
    let energyAfter: Int?

    var id: UUID { snapshot.stableSessionID }

    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    var workout: Workout {
        Workout(id: workoutID, title: snapshot.workoutTitle, focus: workoutFocus,
                format: workoutFormat, exercises: snapshot.restoredExercises)
    }

    var drafts: [WorkoutSetDraft] { snapshot.restoredDrafts }
    var groupAssignments: [String: WorkoutGroupAssignment] { snapshot.restoredGroupAssignments }
}

/// One active workout per account. Preview sessions use a separate disk namespace.
@MainActor
final class ActiveWorkoutSessionStore: ObservableObject {
    @Published private(set) var session: ActiveWorkoutSession?
    @Published private(set) var storageError: String?
    let isPreview: Bool

    private let clientEmail: String
    private let fileURL: URL
    private var currentOwner: UUID?

    init(clientEmail: String, previewMode: Bool = false, directory: URL? = nil) {
        self.clientEmail = Self.normalized(clientEmail)
        isPreview = previewMode
        let directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("FWBActiveWorkouts", isDirectory: true)
        let namespace = previewMode ? "fwb-active-workout-preview-v1" : "fwb-active-workout-v1"
        let key = ContinuitySync.stableUUID(namespace: namespace, name: self.clientEmail)
        fileURL = directory.appendingPathComponent(key.uuidString).appendingPathExtension("json")

        guard !self.clientEmail.isEmpty else {
            storageError = "Sign in before starting a workout."
            return
        }
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return }
        do {
            let restored = try JSONDecoder().decode(ActiveWorkoutSession.self, from: Data(contentsOf: fileURL))
            guard owns(restored) else {
                storageError = "Your saved workout could not be opened for this account."
                return
            }
            if !restored.snapshot.isFinished { session = restored }
        } catch {
            storageError = "Your saved workout could not be opened. Try again."
        }
    }

    func claim(owner: UUID) {
        currentOwner = owner
    }

    func start(_ session: ActiveWorkoutSession) {
        guard owns(session), !session.snapshot.isFinished else { return }
        currentOwner = nil
        self.session = session
        persist()
    }

    /// Unowned updates are available before a logger claims the session.
    func update(_ session: ActiveWorkoutSession) {
        guard currentOwner == nil else { return }
        updateMatching(session)
    }

    /// A hidden logger must not overwrite entries from a more recently opened logger.
    func update(_ session: ActiveWorkoutSession, owner: UUID) {
        guard currentOwner == owner else { return }
        updateMatching(session)
    }

    func clear(sessionID: UUID) {
        guard session?.id == sessionID else { return }
        session = nil
        currentOwner = nil
        do {
            if FileManager.default.fileExists(atPath: fileURL.path) {
                try FileManager.default.removeItem(at: fileURL)
            }
            storageError = nil
        } catch {
            storageError = "Your workout ended, but its resume shortcut could not be removed from this device."
        }
    }

    private func updateMatching(_ session: ActiveWorkoutSession) {
        guard self.session?.id == session.id, owns(session), !session.snapshot.isFinished else { return }
        self.session = session
        persist()
    }

    private func owns(_ session: ActiveWorkoutSession) -> Bool {
        !clientEmail.isEmpty && Self.normalized(session.snapshot.clientEmail) == clientEmail
    }

    private func persist() {
        guard let session else { return }
        do {
            try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode(session).write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            storageError = nil
        } catch {
            storageError = "Your workout is still available here, but it could not be saved for reopening the app."
        }
    }

    private static func normalized(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}
