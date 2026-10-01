import Foundation

struct CoachProgram: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let clientEmail: String
    let clientName: String
    let clientPhone: String
    let initials: String
    let programTitle: String
    let programSummary: String
    let sessionCountUsed: Int
    let sessionCountTotal: Int
    let fitnessGoal: String
    let focusTarget: String
    let height: String
    let startingWeight: String
    let startingBodyfat: String
    let coachNoteTitle: String
    let coachNoteBody: String
    let active: Bool
    let clientArchived: Bool
    let updatedAt: String

    var displayName: String {
        clientName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? clientEmail : clientName
    }

    var displayInitials: String {
        let saved = initials.trimmingCharacters(in: .whitespacesAndNewlines)
        if !saved.isEmpty { return saved.uppercased() }
        return displayName
            .split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
    }

    var sessionsRemaining: Int {
        max(sessionCountTotal - sessionCountUsed, 0)
    }

    var sessionProgress: Double {
        guard sessionCountTotal > 0 else { return 0 }
        return min(Double(sessionCountUsed) / Double(sessionCountTotal), 1)
    }

    enum CodingKeys: String, CodingKey {
        case id
        case clientEmail = "client_email"
        case clientName = "client_name"
        case clientPhone = "client_phone"
        case initials
        case programTitle = "program_title"
        case programSummary = "program_summary"
        case sessionCountUsed = "session_count_used"
        case sessionCountTotal = "session_count_total"
        case fitnessGoal = "fitness_goal"
        case focusTarget = "focus_target"
        case height
        case startingWeight = "starting_weight"
        case startingBodyfat = "starting_bodyfat"
        case coachNoteTitle = "coach_note_title"
        case coachNoteBody = "coach_note_body"
        case active
        case clientArchived = "client_archived"
        case updatedAt = "updated_at"
    }
}

extension CoachProgram {
    static let preview = CoachProgram(
        id: "preview-client",
        clientEmail: "alex@example.com",
        clientName: "Alex Morgan",
        clientPhone: "(415) 555-0142",
        initials: "AM",
        programTitle: "Build strength · Phase 2",
        programSummary: "Three focused strength days with recovery work between sessions.",
        sessionCountUsed: 7,
        sessionCountTotal: 12,
        fitnessGoal: "Build strength and move without pain",
        focusTarget: "Posterior chain",
        height: "5'10\"",
        startingWeight: "178 lb",
        startingBodyfat: "18%",
        coachNoteTitle: "This week",
        coachNoteBody: "Keep the hinge pattern crisp and leave two reps in reserve.",
        active: true,
        clientArchived: false,
        updatedAt: "2026-09-28T12:00:00Z"
    )
}
