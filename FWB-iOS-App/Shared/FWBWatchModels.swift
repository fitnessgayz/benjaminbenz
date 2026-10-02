import Foundation

/// The Watch receives only the active set, never the account's full workout history.
struct FWBWatchWorkoutSnapshot: Codable, Equatable {
    var accountID: String
    var sessionID: String
    var title: String
    var exerciseID: String
    var exerciseName: String
    var setID: String
    var setNumber: Int
    var totalSets: Int
    var suggestedWeight: Double?
    var suggestedReps: Int?
    var weightUnit: String
    var setType: String = "working"
    var suggestedDurationSeconds: Double? = nil
    var updatedAt: Date = Date()
}

struct FWBWatchRestSnapshot: Codable, Equatable {
    enum Phase: String, Codable { case idle, running, paused, complete }
    var id: UUID = UUID()
    var accountID: String?
    var sessionID: String?
    var exerciseName: String
    var durationSeconds: Int
    var deadline: Date?
    var pausedRemainingSeconds: Int
    var phase: Phase
    var updatedAt: Date = Date()

    func remainingSeconds(at now: Date) -> Int {
        switch phase {
        case .running:
            guard let deadline else { return 0 }
            let seconds = ceil(deadline.timeIntervalSince(now))
            guard seconds.isFinite else { return 0 }
            return Int(max(0, min(86_400, seconds)))
        case .paused: return max(0, min(86_400, pausedRemainingSeconds))
        case .idle, .complete: return 0
        }
    }

    mutating func pause(at now: Date) {
        guard phase == .running else { return }
        pausedRemainingSeconds = remainingSeconds(at: now)
        deadline = nil
        phase = pausedRemainingSeconds > 0 ? .paused : .complete
        updatedAt = now
    }

    mutating func resume(at now: Date) {
        guard phase == .paused, pausedRemainingSeconds > 0 else { return }
        deadline = now.addingTimeInterval(TimeInterval(pausedRemainingSeconds))
        phase = .running
        updatedAt = now
    }

    mutating func restart(at now: Date) {
        // A new identity makes each completion alert independently idempotent.
        id = UUID()
        durationSeconds = min(86_400, max(1, durationSeconds))
        deadline = now.addingTimeInterval(TimeInterval(durationSeconds))
        pausedRemainingSeconds = durationSeconds
        phase = .running
        updatedAt = now
    }
}

struct FWBWatchCommand: Codable, Equatable, Identifiable {
    enum Kind: String, Codable { case completeSet, pauseRest, resumeRest, restartRest, stopRest }
    var id: UUID = UUID()
    var kind: Kind
    var accountID: String
    var sessionID: String
    var exerciseID: String?
    var setID: String?
    var weight: Double?
    var reps: Int?
    var durationSeconds: Double? = nil
    var connectionID: UUID? = nil
    var baseRestID: UUID? = nil
    var rest: FWBWatchRestSnapshot?
    var createdAt: Date = Date()

    /// Validation is repeated on the phone before invoking any application mutation.
    func rejectionReason(accountID currentAccountID: String?, workout: FWBWatchWorkoutSnapshot?, rest currentRest: FWBWatchRestSnapshot?, now: Date = Date()) -> String? {
        guard accountID == currentAccountID else { return "This workout belongs to a different signed-in account." }
        guard createdAt <= now.addingTimeInterval(300), now.timeIntervalSince(createdAt) <= 86_400 else {
            return "This Watch action has expired. Open the workout again on iPhone."
        }
        if kind == .completeSet {
            guard let workout, sessionID == workout.sessionID,
                  exerciseID == workout.exerciseID, setID == workout.setID else {
                return "The active set changed. Refresh the workout on your Watch."
            }
            guard let weight, weight.isFinite, weight >= 0, weight <= 100_000 else { return "Enter a valid weight." }
            if workout.setType == "timed" {
                guard let durationSeconds, durationSeconds.isFinite,
                      durationSeconds > 0, durationSeconds <= 86_400 else { return "Enter a valid set duration." }
            } else {
                guard let reps, reps > 0, reps <= 10_000 else { return "Enter a valid rep count." }
            }
        } else {
            guard let currentRest, currentRest.accountID == accountID,
                  currentRest.sessionID == sessionID else { return "This rest timer is no longer active." }
            guard let rest, rest.accountID == accountID, rest.sessionID == sessionID,
                  rest.updatedAt >= currentRest.updatedAt,
                  rest.updatedAt <= now.addingTimeInterval(300),
                  rest.durationSeconds > 0, rest.durationSeconds <= 86_400,
                  rest.pausedRemainingSeconds >= 0, rest.pausedRemainingSeconds <= 86_400 else {
                return "The rest timer changed on iPhone."
            }
            // A restart creates a new timer ID. Carry its phone-side base through
            // coalesced pause/resume commands, without replacing a newer phone timer.
            if rest.id != currentRest.id && baseRestID != currentRest.id { return "The rest timer changed on iPhone." }
            let expected: FWBWatchRestSnapshot.Phase = kind == .pauseRest ? .paused : (kind == .stopRest ? .idle : .running)
            guard rest.phase == expected else { return "The timer action is invalid." }
            if rest.phase == .running {
                guard let deadline = rest.deadline,
                      deadline.timeIntervalSince(rest.updatedAt) > 0,
                      deadline.timeIntervalSince(rest.updatedAt) <= 86_401 else { return "The timer deadline is invalid." }
            }
        }
        return nil
    }
}

struct FWBWatchCommandOutcome: Codable, Equatable {
    enum Status: String, Codable { case accepted, rejected, deferred }
    var status: Status
    var message: String?
    static let accepted = FWBWatchCommandOutcome(status: .accepted)
    static func rejected(_ message: String) -> Self { Self(status: .rejected, message: message) }
    static func deferred(_ message: String = "Open FWB on iPhone to sync this set.") -> Self { Self(status: .deferred, message: message) }
}

struct FWBWatchReceipt: Codable, Equatable {
    var commandID: UUID
    var outcome: FWBWatchCommandOutcome
}

struct FWBWatchContext: Codable, Equatable {
    var accountID: String?
    var connectionID: UUID? = nil
    var workout: FWBWatchWorkoutSnapshot?
    var rest: FWBWatchRestSnapshot?
    var receipts: [FWBWatchReceipt] = []
    var updatedAt: Date = Date()
}

enum FWBWatchWire {
    static let contextKey = "fwb.context.v1"
    static let commandKey = "fwb.command.v1"
    static let receiptKey = "fwb.receipt.v1"
    static let refreshKey = "fwb.refresh.v1"
    static func encode<T: Encodable>(_ value: T) -> Data? { try? JSONEncoder().encode(value) }
    static func decode<T: Decodable>(_ type: T.Type, from data: Any?) -> T? {
        guard let data = data as? Data, data.count <= 128_000 else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
}
