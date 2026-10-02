#if DEBUG
import SwiftUI

/// In-memory fixtures only. Audit sends never contact Supabase or a real client.
@MainActor
final class MessagingAuditRepository: MessagingRepository {
    static let clientID = UUID(uuidString: "A11D1700-0000-4000-8000-000000000001")!
    static let coachID = UUID(uuidString: "A11D1700-0000-4000-8000-000000000002")!
    static let clientEmail = "alex@example.com"
    let account: SignedInAccount
    private var rows: [CoachMessage]
    private var readThrough: [String: Int64] = [:]

    init(account: SignedInAccount, empty: Bool = false) {
        self.account = account
        let now = Date()
        rows = empty ? [] : [
            CoachMessage(id: 1, clientEmail: Self.clientEmail, senderUserID: Self.clientID, senderRole: .client,
                body: "Hey coach! I finished the mobility session. My hips are feeling much better.",
                createdAt: CheckInDateCoding.string(from: now.addingTimeInterval(-3600)), requestID: UUID()),
            CoachMessage(id: 2, clientEmail: Self.clientEmail, senderUserID: Self.coachID, senderRole: .coach,
                body: "Great to hear, Alex. Keep the movements comfortable and let me know how you feel after your next session.",
                createdAt: CheckInDateCoding.string(from: now.addingTimeInterval(-2400)), requestID: UUID()),
            CoachMessage(id: 3, clientEmail: Self.clientEmail, senderUserID: Self.clientID, senderRole: .client,
                body: "Will do! Should I use the recovery workout tomorrow?",
                createdAt: CheckInDateCoding.string(from: now.addingTimeInterval(-600)), requestID: UUID()),
            CoachMessage(id: 4, clientEmail: "jamie@example.com", senderUserID: UUID(), senderRole: .client,
                body: "Just wrapped up my first week. Thank you for the support!",
                createdAt: CheckInDateCoding.string(from: now.addingTimeInterval(-300)), requestID: UUID())
        ]
    }

    func inbox(limit: Int, offset: Int) async throws -> [MessageInboxItem] {
        let grouped = Dictionary(grouping: rows.filter { account.isCoach || $0.clientEmail == account.email }, by: \.clientEmail)
        let items = grouped.compactMap { email, messages -> MessageInboxItem? in
            guard let latest = messages.max(by: { $0.id < $1.id }) else { return nil }
            return MessageInboxItem(clientEmail: email, clientName: email == Self.clientEmail ? "Alex Morgan" : "Jamie Lee",
                lastMessageID: latest.id, lastMessageBody: latest.body, lastMessageAt: latest.createdAt,
                lastSenderRole: latest.senderRole,
                unreadCount: messages.filter { $0.id > (readThrough[email] ?? 0) && $0.senderRole.rawValue != account.role.rawValue }.count)
        }.sorted { $0.lastMessageID > $1.lastMessageID }
        return Array(items.dropFirst(offset).prefix(limit))
    }

    func history(clientEmail: String?, beforeID: Int64?, limit: Int) async throws -> [CoachMessage] {
        rows.filter { $0.clientEmail == (clientEmail ?? account.email) && (beforeID == nil || $0.id < beforeID!) }
            .sorted { $0.id > $1.id }.prefix(limit).map { $0 }
    }

    func send(body: String, requestID: UUID, clientEmail: String?) async throws -> CoachMessage {
        if let existing = rows.first(where: { $0.requestID == requestID }) { return existing }
        let message = CoachMessage(id: (rows.map(\.id).max() ?? 0) + 1, clientEmail: clientEmail ?? account.email,
            senderUserID: account.id, senderRole: account.isCoach ? .coach : .client, body: body,
            createdAt: CheckInDateCoding.string(from: Date()), requestID: requestID)
        rows.append(message)
        return message
    }

    func markRead(throughID: Int64, clientEmail: String?) async throws {
        let email = clientEmail ?? account.email
        readThrough[email] = max(readThrough[email] ?? 0, throughID)
    }
}

struct MessagingAuditRootView: View {
    @StateObject private var inbox: MessagingInboxStore
    private let mode: String

    init() {
        let mode = ProcessInfo.processInfo.arguments.first { $0.hasPrefix("--messaging-audit=") }?
            .components(separatedBy: "=").last ?? "client"
        self.mode = mode
        let isCoach = mode.hasPrefix("coach")
        let account = SignedInAccount(id: isCoach ? MessagingAuditRepository.coachID : MessagingAuditRepository.clientID,
            email: isCoach ? "coach@example.com" : MessagingAuditRepository.clientEmail, role: isCoach ? .coach : .client)
        let repository = MessagingAuditRepository(account: account, empty: mode.contains("empty"))
        _inbox = StateObject(wrappedValue: MessagingInboxStore(account: account, repository: repository))
    }

    var body: some View {
        NavigationStack {
            if mode.contains("chat") || mode.contains("empty") {
                MessageConversationView(store: inbox.conversation(clientEmail: MessagingAuditRepository.clientEmail, clientName: "Alex Morgan"))
            } else if inbox.account.isCoach {
                CoachMessageInboxView(inbox: inbox)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        Text("Today").font(FWBFont.largeTitle.weight(.bold))
                        Text("Welcome back, Alex.").foregroundStyle(Color.fwbMuted)
                        MessageCoachCard(inbox: inbox)
                        Text("YOUR TRAINING").font(FWBFont.caption.weight(.bold)).foregroundStyle(Color.fwbLime)
                        VStack(alignment: .leading, spacing: 10) {
                            Label("Mobility + recovery", systemImage: "figure.flexibility").font(FWBFont.headline)
                            Text("A little movement goes a long way.").foregroundStyle(Color.fwbMuted)
                        }.frame(maxWidth: .infinity, alignment: .leading).modifier(FWBCardModifier())
                    }.padding(16)
                }.navigationTitle("Home").background(Color.fwbBackground)
            }
        }
        .tint(Color.fwbLime)
        .task { await inbox.refresh() }
    }
}
#endif
