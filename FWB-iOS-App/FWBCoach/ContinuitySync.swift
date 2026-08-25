import CryptoKit
import Foundation

enum ContinuitySync {
    static let source = "ios_app"
    static let sourceVersion = 1

    static func normalize(email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    static func stableUUID(namespace: String, name: String) -> UUID {
        let digest = SHA256.hash(data: Data("\(namespace)|\(name)".utf8))
        var bytes = Array(digest.prefix(16))
        bytes[6] = (bytes[6] & 0x0F) | 0x50
        bytes[8] = (bytes[8] & 0x3F) | 0x80
        return UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3],
            bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11],
            bytes[12], bytes[13], bytes[14], bytes[15]
        ))
    }
}

enum ContinuityDateCoding {
    private static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let standardFormatter = ISO8601DateFormatter()

    static func string(from date: Date) -> String {
        fractionalFormatter.string(from: date)
    }

    static func date(from value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }
        return fractionalFormatter.date(from: value) ?? standardFormatter.date(from: value)
    }
}

extension Notification.Name {
    static let fwbForegroundRefresh = Notification.Name("com.benjaminbenz.fwbcoach.foreground-refresh")
}

struct RemoteWorkoutSetVersion: Equatable {
    let setID: UUID
    let updatedAt: Date
    let source: String
}

enum WorkoutSetMergeDecision: Equatable {
    case uploadLocal
    case keepRemote
    case deleteRemote
}

enum WorkoutConflictResolver {
    static func decision(
        localUpdatedAt: Date,
        baseRemoteUpdatedAt: Date?,
        localContainsSet: Bool,
        remote: RemoteWorkoutSetVersion
    ) -> WorkoutSetMergeDecision {
        if !localContainsSet {
            guard let baseRemoteUpdatedAt, remote.updatedAt <= baseRemoteUpdatedAt else {
                return .keepRemote
            }
            return .deleteRemote
        }

        if remote.source != ContinuitySync.source && remote.updatedAt > localUpdatedAt {
            return .keepRemote
        }
        return .uploadLocal
    }
}

struct PendingNutritionMutation: Codable, Identifiable, Equatable {
    let id: UUID
    let programID: UUID
    let plan: NutritionPlan
    let expectedRemoteUpdatedAt: String

    init(
        id: UUID = UUID(),
        programID: UUID,
        plan: NutritionPlan,
        expectedRemoteUpdatedAt: String
    ) {
        self.id = id
        self.programID = programID
        self.plan = plan
        self.expectedRemoteUpdatedAt = expectedRemoteUpdatedAt
    }
}

struct PendingMeasurementMutation: Codable, Identifiable, Equatable {
    let id: UUID
    let clientEmail: String
    let entryDate: String
    let bodyweight: Double?
    let bodyfat: Double?
    let muscleMass: Double?
    let measurements: [String: Double]
    let goalNote: String
    let clientUpdatedAt: Date
    let expectedRemoteUpdatedAt: Date?

    init(
        id: UUID = UUID(),
        clientEmail: String,
        entryDate: String,
        bodyweight: Double?,
        bodyfat: Double?,
        muscleMass: Double?,
        measurements: [String: Double],
        goalNote: String,
        clientUpdatedAt: Date = Date(),
        expectedRemoteUpdatedAt: Date?
    ) {
        self.id = id
        self.clientEmail = ContinuitySync.normalize(email: clientEmail)
        self.entryDate = entryDate
        self.bodyweight = bodyweight
        self.bodyfat = bodyfat
        self.muscleMass = muscleMass
        self.measurements = measurements
        self.goalNote = goalNote
        self.clientUpdatedAt = clientUpdatedAt
        self.expectedRemoteUpdatedAt = expectedRemoteUpdatedAt
    }
}

actor ContinuityOutbox {
    static let shared = ContinuityOutbox()

    private struct Container: Codable {
        var schemaVersion = 1
        var nutrition: [UUID: PendingNutritionMutation] = [:]
        var measurements: [String: PendingMeasurementMutation] = [:]
    }

    private let fileURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(fileManager: FileManager = .default, fileURL: URL? = nil) {
        if let fileURL {
            self.fileURL = fileURL
        } else {
            let baseURL = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
                ?? fileManager.temporaryDirectory
            self.fileURL = baseURL
                .appendingPathComponent("FWBTraining", isDirectory: true)
                .appendingPathComponent("continuity-outbox.json")
        }

        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }

    func enqueue(_ mutation: PendingNutritionMutation) throws {
        var container = read()
        container.nutrition[mutation.programID] = mutation
        try write(container)
    }

    func nutritionMutation(programID: UUID) -> PendingNutritionMutation? {
        read().nutrition[programID]
    }

    func removeNutrition(programID: UUID) throws {
        var container = read()
        guard container.nutrition.removeValue(forKey: programID) != nil else { return }
        try write(container)
    }

    func enqueue(_ mutation: PendingMeasurementMutation) throws {
        var container = read()
        container.measurements[measurementKey(email: mutation.clientEmail, date: mutation.entryDate)] = mutation
        try write(container)
    }

    func measurementMutations(email: String) -> [PendingMeasurementMutation] {
        let normalizedEmail = ContinuitySync.normalize(email: email)
        return read().measurements.values
            .filter { $0.clientEmail == normalizedEmail }
            .sorted { $0.clientUpdatedAt < $1.clientUpdatedAt }
    }

    func removeMeasurement(email: String, entryDate: String) throws {
        var container = read()
        let key = measurementKey(email: email, date: entryDate)
        guard container.measurements.removeValue(forKey: key) != nil else { return }
        try write(container)
    }

    private func measurementKey(email: String, date: String) -> String {
        "\(ContinuitySync.normalize(email: email))|\(date)"
    }

    private func read() -> Container {
        guard let data = try? Data(contentsOf: fileURL),
              let container = try? decoder.decode(Container.self, from: data) else {
            return Container()
        }
        return container
    }

    private func write(_ container: Container) throws {
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try encoder.encode(container).write(to: fileURL, options: [.atomic, .completeFileProtection])
    }
}
