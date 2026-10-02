import Foundation

/// A generated plan has its own log identity and remains reachable after relaunch.
struct GeneratedWorkoutLaunch: Codable, Identifiable, Equatable {
    let id: UUID
    let title: String
    let createdAt: Date
    let estimatedMinutes: Int
    let exercises: [OfflineWorkoutSession.ExerciseSnapshot]
    // Optional keeps launch files written before archiving readable.
    var archivedAt: Date? = nil

    var isArchived: Bool { archivedAt != nil }

    init(plan: GeneratedWorkoutPlan, createdAt: Date = Date(), id: UUID = UUID()) {
        self.id = id
        title = plan.title
        self.createdAt = createdAt
        estimatedMinutes = plan.estimatedMinutes
        exercises = plan.exercises.enumerated().map { index, exercise in
            OfflineWorkoutSession.ExerciseSnapshot(
                exercise.exercise(code: String(format: "CW%02d", index + 1)), assignment: nil
            )
        }
    }

    var workout: Workout {
        Workout(
            id: id,
            title: "Custom workout · \(title) · \(id.uuidString.lowercased())",
            focus: title,
            format: "custom",
            exercises: exercises.map(\.exercise)
        )
    }
}

struct GeneratedWorkoutLaunchStore {
    private let directory: URL

    init(directory: URL? = nil) {
        self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("FWBGeneratedWorkouts", isDirectory: true)
    }

    func load(clientEmail: String) throws -> [GeneratedWorkoutLaunch] {
        let url = try fileURL(clientEmail: clientEmail)
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        do {
            return try JSONDecoder().decode([GeneratedWorkoutLaunch].self, from: Data(contentsOf: url))
                .sorted { $0.createdAt > $1.createdAt }
        } catch {
            throw StoreError.unavailable
        }
    }

    func save(_ launch: GeneratedWorkoutLaunch, clientEmail: String) throws {
        var launches = try load(clientEmail: clientEmail)
        launches.removeAll { $0.id == launch.id }
        launches.insert(launch, at: 0)
        try write(launches, clientEmail: clientEmail)
    }

    /// Only changes this saved launch. Logged sets and recovery drafts use
    /// separate stores and are deliberately untouched by archive or deletion.
    @discardableResult
    func setArchived(_ archived: Bool, id: UUID, clientEmail: String) throws -> [GeneratedWorkoutLaunch] {
        var launches = try load(clientEmail: clientEmail)
        guard let index = launches.firstIndex(where: { $0.id == id }),
              launches[index].isArchived != archived else { return launches }
        launches[index].archivedAt = archived ? Date() : nil
        try write(launches, clientEmail: clientEmail)
        return launches
    }

    @discardableResult
    func delete(id: UUID, clientEmail: String) throws -> [GeneratedWorkoutLaunch] {
        var launches = try load(clientEmail: clientEmail)
        guard launches.contains(where: { $0.id == id }) else { return launches }
        launches.removeAll { $0.id == id }
        try write(launches, clientEmail: clientEmail)
        return launches
    }

    private func write(_ launches: [GeneratedWorkoutLaunch], clientEmail: String) throws {
        let url = try fileURL(clientEmail: clientEmail)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try JSONEncoder().encode(launches).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        } catch {
            throw StoreError.unavailable
        }
    }

    private func fileURL(clientEmail: String) throws -> URL {
        let email = clientEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !email.isEmpty else { throw StoreError.missingClient }
        let key = ContinuitySync.stableUUID(namespace: "fwb-generated-workouts-v1", name: email)
        return directory.appendingPathComponent(key.uuidString).appendingPathExtension("json")
    }

    enum StoreError: LocalizedError {
        case missingClient, unavailable
        var errorDescription: String? {
            switch self {
            case .missingClient: "Sign in to manage your saved generated workouts."
            case .unavailable: "Saved generated workouts could not be opened or updated. Your existing workouts are still on this device. Try again."
            }
        }
    }
}
