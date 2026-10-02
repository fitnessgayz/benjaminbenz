import XCTest
import Supabase
@testable import FWBCoach

@MainActor
final class MessagingStoreTests: XCTestCase {
    private let account = SignedInAccount(id: UUID(), email: "client@example.com")

    func testLostSendResponseRetriesSameRequestAndRetainsDraftWithoutDuplicate() async {
        let repository = FakeMessagingRepository()
        let store = makeStore(repository)
        await store.refresh()
        store.draft = "  Can we adjust tomorrow’s workout?  "
        repository.loseNextSendResponse = true
        await store.send()
        let originalRequest = store.pendingRequestID
        XCTAssertNotNil(originalRequest)
        XCTAssertNotNil(store.sendError)
        XCTAssertEqual(store.draft, "  Can we adjust tomorrow’s workout?  ")
        XCTAssertEqual(repository.rows.count, 1)

        await store.send()
        XCTAssertEqual(repository.sentRequestIDs, [originalRequest!, originalRequest!])
        XCTAssertEqual(repository.rows.count, 1)
        XCTAssertEqual(store.messages.count, 1)
        XCTAssertEqual(store.messages.first?.body, "Can we adjust tomorrow’s workout?")
        XCTAssertEqual(store.draft, "")
        XCTAssertNil(store.pendingRequestID)
        XCTAssertNil(store.sendError)
    }

    func testHistoryReconcilesSendWhoseResponseWasLost() async {
        let repository = FakeMessagingRepository()
        let store = makeStore(repository)
        await store.refresh()
        store.draft = "Thanks coach!"
        repository.loseNextSendResponse = true
        await store.send()
        await store.refresh()
        XCTAssertNil(store.pendingRequestID)
        XCTAssertNil(store.sendError)
        XCTAssertEqual(store.draft, "")
        XCTAssertEqual(repository.sentRequestIDs.count, 1)
    }

    func testDefiniteServerRejectionKeepsDraftEditableAndUsesFreshRequestAfterCorrection() async {
        let repository = FakeMessagingRepository()
        let store = makeStore(repository)
        await store.refresh()
        store.draft = "Hello coach"
        repository.sendRejectionCode = "42501"
        await store.send()
        XCTAssertNil(store.pendingRequestID)
        XCTAssertEqual(store.draft, "Hello coach")
        XCTAssertTrue(store.sendError?.contains("assign your training program") == true)
        XCTAssertTrue(repository.rows.isEmpty)
        repository.sendRejectionCode = nil
        await store.send()
        XCTAssertEqual(repository.sentRequestIDs.count, 2)
        XCTAssertNotEqual(repository.sentRequestIDs[0], repository.sentRequestIDs[1])
        XCTAssertEqual(store.messages.count, 1)
    }

    func testDoubleTapAndSignOutDuringSendCannotLeakState() async {
        let repository = FakeMessagingRepository()
        let store = makeStore(repository)
        await store.refresh()
        store.draft = "My update"
        repository.suspendSend = true
        let task = Task { await store.send() }
        await repository.waitForSendStart()
        XCTAssertTrue(store.isSending)
        await store.send()
        XCTAssertEqual(repository.sentRequestIDs.count, 1)
        store.invalidate()
        repository.resumeSend()
        await task.value
        XCTAssertTrue(store.messages.isEmpty)
        XCTAssertEqual(store.draft, "")
        XCTAssertNil(store.pendingRequestID)
        XCTAssertFalse(store.canSend)
    }

    func testHistoryPagesNewestFirstAndMergesWithoutDuplicateRows() async {
        let repository = FakeMessagingRepository()
        repository.rows = (1...125).map { message(Int64($0)) }
        let store = makeStore(repository)
        await store.refresh()
        XCTAssertEqual(store.messages.map(\.id), Array(Int64(76)...125))
        XCTAssertTrue(store.hasOlder)
        await store.loadOlder()
        XCTAssertEqual(store.messages.map(\.id), Array(Int64(26)...125))
        await store.loadOlder()
        XCTAssertEqual(store.messages.map(\.id), Array(Int64(1)...125))
        XCTAssertFalse(store.hasOlder)
        await store.refresh()
        XCTAssertEqual(store.messages.count, 125)
    }

    func testRefreshFillsGapEvenWhenOwnSendIsNewerThanUnfetchedReplies() async {
        let repository = FakeMessagingRepository()
        repository.rows = [message(1)]
        let store = makeStore(repository)
        await store.refresh()
        repository.rows.append(contentsOf: (2...130).map { message(Int64($0)) })
        store.draft = "My response"
        await store.send()
        XCTAssertEqual(store.messages.map(\.id), [1, 131])
        await store.refresh()
        XCTAssertEqual(store.messages.map(\.id), Array(Int64(1)...131))
        XCTAssertTrue(repository.historyBeforeIDs.contains(82))
        XCTAssertTrue(repository.historyBeforeIDs.contains(32))
    }

    func testReadsOnlyExplicitVisibleMessageAndNeverUnknownOrOlderID() async {
        let repository = FakeMessagingRepository()
        repository.rows = [message(1), message(2), message(3)]
        let store = makeStore(repository)
        await store.refresh()
        XCTAssertTrue(repository.markedReadIDs.isEmpty)
        await store.markVisible(throughID: 2)
        await store.markVisible(throughID: 1)
        await store.markVisible(throughID: 99)
        XCTAssertEqual(repository.markedReadIDs, [2])
        await store.markVisible(throughID: 3)
        XCTAssertEqual(repository.markedReadIDs, [2, 3])
    }

    func testReadFailureRetriesWithoutLosingConversation() async {
        let repository = FakeMessagingRepository()
        repository.rows = [message(1)]
        let store = makeStore(repository)
        await store.refresh()
        repository.failRead = true
        await store.markVisible(throughID: 1)
        XCTAssertNotNil(store.readError)
        XCTAssertEqual(store.messages.count, 1)
        repository.failRead = false
        await store.retryReadStatus()
        XCTAssertNil(store.readError)
        XCTAssertEqual(repository.markedReadIDs, [1, 1])
    }

    func testOwnSendCannotMarkAnUnfetchedIncomingReplyRead() async {
        let repository = FakeMessagingRepository()
        repository.rows = [message(1)]
        let store = makeStore(repository)
        await store.refresh()
        repository.rows.append(message(2))
        store.draft = "My reply"
        await store.send()
        XCTAssertEqual(store.messages.map(\.id), [1, 3])
        await store.markVisible(throughID: 3)
        XCTAssertEqual(repository.markedReadIDs, [1])
        await store.refresh()
        XCTAssertEqual(store.messages.map(\.id), [1, 2, 3])
        await store.markVisible(throughID: 3)
        XCTAssertEqual(repository.markedReadIDs, [1, 3])
    }

    func testValidationMatchesPostgresUnicodeScalarLimitAndCoachCannotInitiate() async {
        let repository = FakeMessagingRepository()
        let store = makeStore(repository)
        store.draft = "Hello"
        XCTAssertFalse(store.canSend)
        await store.refresh()
        store.draft = " \n\t "
        XCTAssertFalse(store.canSend)
        store.draft = String(repeating: "👨‍👩‍👧‍👦", count: 572)
        XCTAssertEqual(store.draft.count, 572)
        XCTAssertGreaterThan(store.characterCount, 4_000)
        XCTAssertFalse(store.canSend)
        store.draft = String(repeating: "a", count: 4_000)
        XCTAssertTrue(store.canSend)

        let coach = SignedInAccount(id: UUID(), email: "coach@example.com", role: .coach)
        let coachStore = MessageConversationStore(account: coach, clientEmail: account.email, title: "Client", repository: repository)
        await coachStore.refresh()
        coachStore.draft = "Hello"
        XCTAssertFalse(coachStore.canSend)
    }

    func testInboxPaginationAndSignOutClearCachedConversationsAndDrafts() async {
        let repository = FakeMessagingRepository()
        repository.inboxItems = (1...105).map { index in
            MessageInboxItem(clientEmail: "client\(index)@example.com", clientName: "Client \(index)",
                lastMessageID: Int64(index), lastMessageBody: "Hi", lastMessageAt: "2026-09-26T12:00:00Z",
                lastSenderRole: .client, unreadCount: 1)
        }
        let inbox = MessagingInboxStore(account: account, repository: repository)
        await inbox.refresh()
        XCTAssertEqual(inbox.items.count, 105)
        XCTAssertEqual(inbox.unreadCount, 105)
        XCTAssertEqual(repository.inboxOffsets, [0, 100])
        let conversation = inbox.conversation()
        conversation.draft = "Private unsent draft"
        XCTAssertTrue(inbox.conversation() === conversation)
        inbox.invalidate()
        XCTAssertTrue(inbox.items.isEmpty)
        XCTAssertEqual(conversation.draft, "")
        await inbox.refresh()
        XCTAssertEqual(repository.inboxOffsets, [0, 100])
    }

    func testInitialHistoryFailureRetainsDraftAndDisablesSendUntilRetry() async {
        let repository = FakeMessagingRepository()
        let store = makeStore(repository)
        store.draft = "Saved locally during this session"
        repository.failHistory = true
        await store.refresh()
        XCTAssertFalse(store.hasLoaded)
        XCTAssertFalse(store.canSend)
        XCTAssertNotNil(store.errorMessage)
        repository.failHistory = false
        await store.refresh()
        XCTAssertTrue(store.canSend)
        XCTAssertNil(store.errorMessage)
        XCTAssertEqual(store.draft, "Saved locally during this session")
    }

    private func makeStore(_ repository: FakeMessagingRepository) -> MessageConversationStore {
        MessageConversationStore(account: account, clientEmail: nil, title: "Your coach", repository: repository)
    }
    private func message(_ id: Int64) -> CoachMessage {
        CoachMessage(id: id, clientEmail: account.email, senderUserID: UUID(), senderRole: .coach,
            body: "Message \(id)", createdAt: "2026-09-26T12:00:00Z", requestID: UUID())
    }
}

@MainActor
private final class FakeMessagingRepository: MessagingRepository {
    var rows: [CoachMessage] = []
    var inboxItems: [MessageInboxItem] = []
    var sentRequestIDs: [UUID] = []
    var markedReadIDs: [Int64] = []
    var historyBeforeIDs: [Int64?] = []
    var inboxOffsets: [Int] = []
    var loseNextSendResponse = false
    var failRead = false
    var failHistory = false
    var suspendSend = false
    var sendRejectionCode: String?
    private var sendContinuation: CheckedContinuation<Void, Never>?
    private var sendStartedContinuation: CheckedContinuation<Void, Never>?

    func inbox(limit: Int, offset: Int) async throws -> [MessageInboxItem] {
        inboxOffsets.append(offset)
        return Array(inboxItems.dropFirst(offset).prefix(limit))
    }
    func history(clientEmail: String?, beforeID: Int64?, limit: Int) async throws -> [CoachMessage] {
        historyBeforeIDs.append(beforeID)
        if failHistory { throw URLError(.notConnectedToInternet) }
        return Array(rows.filter { beforeID == nil || $0.id < beforeID! }.sorted { $0.id > $1.id }.prefix(limit))
    }
    func send(body: String, requestID: UUID, clientEmail: String?) async throws -> CoachMessage {
        sentRequestIDs.append(requestID)
        if let sendRejectionCode { throw PostgrestError(code: sendRejectionCode, message: "Rejected") }
        if suspendSend {
            await withCheckedContinuation { continuation in
                sendContinuation = continuation
                sendStartedContinuation?.resume()
                sendStartedContinuation = nil
            }
        }
        if let existing = rows.first(where: { $0.requestID == requestID }) { return existing }
        let message = CoachMessage(id: (rows.map(\.id).max() ?? 0) + 1, clientEmail: clientEmail ?? "client@example.com",
            senderUserID: UUID(), senderRole: .client, body: body, createdAt: "2026-09-26T12:00:00Z", requestID: requestID)
        rows.append(message)
        if loseNextSendResponse {
            loseNextSendResponse = false
            throw URLError(.networkConnectionLost)
        }
        return message
    }
    func markRead(throughID: Int64, clientEmail: String?) async throws {
        markedReadIDs.append(throughID)
        if failRead { throw URLError(.notConnectedToInternet) }
    }
    func waitForSendStart() async {
        if sendContinuation != nil { return }
        await withCheckedContinuation { sendStartedContinuation = $0 }
    }
    func resumeSend() { sendContinuation?.resume(); sendContinuation = nil }
}
