import Foundation
import Combine
import Supabase

enum MessageSenderRole: String, Codable {
    case client, coach
    var title: String { rawValue.capitalized }
}

struct CoachMessage: Decodable, Identifiable, Equatable {
    let id: Int64
    let clientEmail: String
    let senderUserID: UUID
    let senderRole: MessageSenderRole
    let body: String
    let createdAt: String
    let requestID: UUID

    enum CodingKeys: String, CodingKey {
        case id, body
        case clientEmail = "client_email", senderUserID = "sender_user_id", senderRole = "sender_role"
        case createdAt = "created_at", requestID = "request_id"
    }
    var date: Date? { CheckInDateCoding.date(from: createdAt) }
}

struct MessageInboxItem: Decodable, Identifiable, Equatable {
    let clientEmail: String
    let clientName: String?
    let lastMessageID: Int64
    let lastMessageBody: String
    let lastMessageAt: String
    let lastSenderRole: MessageSenderRole
    let unreadCount: Int

    var id: String { clientEmail }
    var displayName: String {
        let name = clientName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return name.isEmpty ? clientEmail : name
    }
    enum CodingKeys: String, CodingKey {
        case clientEmail = "client_email", clientName = "client_name", lastMessageID = "last_message_id"
        case lastMessageBody = "last_message_body", lastMessageAt = "last_message_at"
        case lastSenderRole = "last_sender_role", unreadCount = "unread_count"
    }
}

@MainActor
protocol MessagingRepository {
    func inbox(limit: Int, offset: Int) async throws -> [MessageInboxItem]
    func history(clientEmail: String?, beforeID: Int64?, limit: Int) async throws -> [CoachMessage]
    func send(body: String, requestID: UUID, clientEmail: String?) async throws -> CoachMessage
    func markRead(throughID: Int64, clientEmail: String?) async throws
}

/// Every operation is scoped to the account that owns the UI. Server RPCs independently
/// verify the session, client membership and coach role; email is never authorization.
@MainActor
struct SupabaseMessagingRepository: MessagingRepository {
    let accountID: UUID
    var client: SupabaseClient = AppConfiguration.supabase

    private func verifyAccount() throws {
        guard client.auth.currentSession?.user.id == accountID else { throw CancellationError() }
    }

    private func authenticatedTransport() async throws -> PostgrestClient {
        try verifyAccount()
        let session = try await client.auth.session
        try verifyAccount()
        guard session.user.id == accountID else { throw CancellationError() }
        // The shared Supabase transport replaces Authorization just before a request.
        // Pin this operation to its verified account so a simultaneous account switch
        // cannot submit an old draft with the next account's token.
        let client = client
        let accountID = accountID
        return PostgrestClient(
            url: AppConfiguration.supabaseURL.appendingPathComponent("rest/v1"),
            headers: ["apikey": AppConfiguration.supabasePublishableKey, "Authorization": "Bearer \(session.accessToken)"],
            fetch: { request in
                try Task.checkCancellation()
                guard client.auth.currentSession?.user.id == accountID else { throw CancellationError() }
                return try await URLSession.shared.data(for: request)
            }
        )
    }

    func inbox(limit: Int, offset: Int) async throws -> [MessageInboxItem] {
        let transport = try await authenticatedTransport()
        let rows: [MessageInboxItem] = try await transport.rpc("messaging_inbox", params: ["p_limit": limit, "p_offset": offset]).execute().value
        try verifyAccount()
        return rows
    }

    func history(clientEmail: String?, beforeID: Int64?, limit: Int) async throws -> [CoachMessage] {
        struct Parameters: Encodable {
            let p_client_email: String?
            let p_before_id: Int64?
            let p_limit: Int
        }
        let transport = try await authenticatedTransport()
        let rows: [CoachMessage] = try await transport.rpc("messaging_history", params: Parameters(
            p_client_email: clientEmail, p_before_id: beforeID, p_limit: limit
        )).execute().value
        try verifyAccount()
        return rows
    }

    func send(body: String, requestID: UUID, clientEmail: String?) async throws -> CoachMessage {
        struct Parameters: Encodable {
            let p_body: String
            let p_request_id: UUID
            let p_client_email: String?
        }
        let transport = try await authenticatedTransport()
        let rows: [CoachMessage] = try await transport.rpc("messaging_send", params: Parameters(
            p_body: body, p_request_id: requestID, p_client_email: clientEmail
        )).execute().value
        try verifyAccount()
        guard let message = rows.first else { throw URLError(.badServerResponse) }
        return message
    }

    func markRead(throughID: Int64, clientEmail: String?) async throws {
        struct Parameters: Encodable {
            let p_through_message_id: Int64
            let p_client_email: String?
        }
        let transport = try await authenticatedTransport()
        try await transport.rpc("messaging_mark_read", params: Parameters(
            p_through_message_id: throughID, p_client_email: clientEmail
        )).execute()
        try verifyAccount()
    }
}

@MainActor
final class MessagingInboxStore: ObservableObject {
    let account: SignedInAccount
    @Published private(set) var items: [MessageInboxItem] = []
    @Published private(set) var isLoading = false
    @Published private(set) var hasLoaded = false
    @Published private(set) var errorMessage: String?
    private let repository: any MessagingRepository
    private var conversations: [String: MessageConversationStore] = [:]
    private var isValid = true

    init(account: SignedInAccount, repository: (any MessagingRepository)? = nil) {
        self.account = account
        self.repository = repository ?? SupabaseMessagingRepository(accountID: account.id)
    }

    var unreadCount: Int { items.reduce(0) { $0 + $1.unreadCount } }

    func conversation(clientEmail: String? = nil, clientName: String? = nil) -> MessageConversationStore {
        let email = (account.isCoach ? clientEmail ?? "" : account.email).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if let existing = conversations[email] { return existing }
        let conversation = MessageConversationStore(
            account: account, clientEmail: account.isCoach ? email : nil,
            title: account.isCoach ? clientName ?? email : "Your coach", repository: repository,
            didChange: { [weak self] in await self?.refresh() }
        )
        if !isValid { conversation.invalidate() }
        conversations[email] = conversation
        return conversation
    }

    func refresh() async {
        guard isValid, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            // The complete paginated inbox makes the total badge accurate for every client.
            var rows: [MessageInboxItem] = []
            var offset = 0
            while true {
                let page = try await repository.inbox(limit: 100, offset: offset)
                guard isValid, !Task.isCancelled else { return }
                rows.append(contentsOf: page)
                if page.count < 100 { break }
                offset += page.count
            }
            var seen = Set<String>()
            items = rows.filter { seen.insert($0.id).inserted }
            hasLoaded = true
            errorMessage = nil
        } catch is CancellationError { } catch {
            guard isValid, !Task.isCancelled else { return }
            errorMessage = "Messages couldn’t refresh. Check your connection and try again."
        }
    }

    func invalidate() {
        isValid = false
        items = []
        errorMessage = nil
        hasLoaded = false
        conversations.values.forEach { $0.invalidate() }
        conversations.removeAll()
    }
}

@MainActor
final class MessageConversationStore: ObservableObject {
    static let messageLimit = 4_000
    static let pageSize = 50
    let account: SignedInAccount
    let clientEmail: String?
    let title: String
    @Published var draft = ""
    @Published private(set) var messages: [CoachMessage] = []
    @Published private(set) var hasLoaded = false
    @Published private(set) var hasOlder = false
    @Published private(set) var isLoading = false
    @Published private(set) var isLoadingOlder = false
    @Published private(set) var isSending = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var sendError: String?
    @Published private(set) var readError: String?
    @Published private(set) var pendingRequestID: UUID?
    private var pendingBody: String?
    private var pendingDraft: String?
    private let repository: any MessagingRepository
    private let didChange: @MainActor () async -> Void
    private var isValid = true
    private var newestFetchedID: Int64?
    private var readThroughID: Int64 = 0
    private var requestedReadID: Int64 = 0
    private var isMarkingRead = false

    init(account: SignedInAccount, clientEmail: String?, title: String, repository: any MessagingRepository,
         didChange: @escaping @MainActor () async -> Void = {}) {
        self.account = account
        self.clientEmail = clientEmail
        self.title = title
        self.repository = repository
        self.didChange = didChange
    }

    var characterCount: Int { draft.unicodeScalars.count }
    var canSend: Bool {
        isValid && hasLoaded && !isSending && (!account.isCoach || !messages.isEmpty) && (pendingRequestID != nil ||
            (!draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && characterCount <= Self.messageLimit))
    }

    func refresh() async {
        guard isValid, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            // A local send may jump past replies not yet fetched. Only a completed
            // history fetch can advance the catch-up boundary.
            let existingNewestID: Int64? = hasLoaded ? (newestFetchedID ?? 0) : nil
            var beforeID: Int64?
            var fetched: [CoachMessage] = []
            var firstPageCount = 0
            // Catch up all new messages after a long background period without creating gaps.
            repeat {
                let page = try await repository.history(clientEmail: clientEmail, beforeID: beforeID, limit: Self.pageSize)
                guard isValid, !Task.isCancelled else { return }
                if beforeID == nil { firstPageCount = page.count }
                fetched.append(contentsOf: page)
                guard let existingNewestID, page.count == Self.pageSize,
                      let oldest = page.last?.id, oldest > existingNewestID else { break }
                beforeID = oldest
            } while true
            if !hasLoaded { hasOlder = firstPageCount == Self.pageSize }
            newestFetchedID = max(newestFetchedID ?? 0, fetched.map(\.id).max() ?? 0)
            merge(fetched)
            hasLoaded = true
            errorMessage = nil
            reconcilePendingSend()
        } catch is CancellationError { } catch {
            guard isValid, !Task.isCancelled else { return }
            errorMessage = "Messages couldn’t load. Check your connection and try again."
        }
    }

    func loadOlder() async {
        guard isValid, hasOlder, !isLoadingOlder, let oldest = messages.first?.id else { return }
        isLoadingOlder = true
        defer { isLoadingOlder = false }
        do {
            let page = try await repository.history(clientEmail: clientEmail, beforeID: oldest, limit: Self.pageSize)
            guard isValid, !Task.isCancelled else { return }
            merge(page)
            hasOlder = page.count == Self.pageSize
            errorMessage = nil
        } catch is CancellationError { } catch {
            guard isValid, !Task.isCancelled else { return }
            errorMessage = "Earlier messages couldn’t load. Try again."
        }
    }

    func send() async {
        guard canSend else { return }
        isSending = true
        sendError = nil
        if pendingRequestID == nil {
            pendingRequestID = UUID()
            pendingBody = draft.trimmingCharacters(in: .whitespacesAndNewlines)
            pendingDraft = draft
        }
        guard let requestID = pendingRequestID, let body = pendingBody else { isSending = false; return }
        defer { isSending = false }
        do {
            let message = try await repository.send(body: body, requestID: requestID, clientEmail: clientEmail)
            guard isValid else { return }
            merge([message])
            reconcilePendingSend()
            await didChange()
        } catch is CancellationError { } catch {
            guard isValid else { return }
            if let code = (error as? PostgrestError)?.code, ["42501", "22023", "P0002"].contains(code) {
                pendingRequestID = nil
                pendingBody = nil
                pendingDraft = nil
                switch code {
                case "42501":
                    sendError = "Messaging isn’t available for this account. Your coach may need to assign your training program."
                case "P0002":
                    sendError = "Your client needs to send the first message before you can reply."
                default:
                    sendError = "Your message couldn’t be sent. Use 1–4,000 characters and try again."
                }
                return
            }
            // A timeout can happen after the write committed. Freeze this exact attempt
            // until RPC retry or history confirms it, preserving its idempotency key.
            sendError = "Delivery wasn’t confirmed. Retry safely; your message won’t be sent twice."
        }
    }

    /// Called for a message that appeared on screen, never just because history loaded.
    func markVisible(throughID: Int64) async {
        guard isValid, messages.contains(where: { $0.id == throughID }) else { return }
        // A confirmed own send can be newer than an unseen incoming reply. Never
        // advance through that gap until a complete history fetch has filled it.
        requestedReadID = max(requestedReadID, min(throughID, newestFetchedID ?? 0))
        guard !isMarkingRead, requestedReadID > readThroughID else { return }
        isMarkingRead = true
        defer { isMarkingRead = false }
        do {
            while requestedReadID > readThroughID {
                let through = requestedReadID
                try await repository.markRead(throughID: through, clientEmail: clientEmail)
                guard isValid, !Task.isCancelled else { return }
                readThroughID = max(readThroughID, through)
            }
            readError = nil
            await didChange()
        } catch is CancellationError { } catch {
            guard isValid, !Task.isCancelled else { return }
            readError = "Read status hasn’t synced yet. It will retry while this conversation is open."
        }
    }

    func retryReadStatus() async {
        guard requestedReadID > readThroughID else { return }
        await markVisible(throughID: requestedReadID)
    }

    func invalidate() {
        isValid = false
        messages = []
        draft = ""
        pendingRequestID = nil
        pendingBody = nil
        pendingDraft = nil
        sendError = nil
        errorMessage = nil
        readError = nil
        hasLoaded = false
        newestFetchedID = nil
    }

    private func merge(_ rows: [CoachMessage]) {
        var indexed = Dictionary(uniqueKeysWithValues: messages.map { ($0.id, $0) })
        for row in rows { indexed[row.id] = row }
        messages = indexed.values.sorted { $0.id < $1.id }
    }

    private func reconcilePendingSend() {
        guard let pendingRequestID, messages.contains(where: { $0.requestID == pendingRequestID }) else { return }
        if draft == pendingDraft { draft = "" }
        self.pendingRequestID = nil
        pendingBody = nil
        pendingDraft = nil
        sendError = nil
    }
}
