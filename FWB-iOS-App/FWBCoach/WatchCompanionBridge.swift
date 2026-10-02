import Foundation
import WatchConnectivity

/// One owner for WCSession. UI callbacks must save the identified set durably before
/// returning .accepted, and treat an already-saved set ID as a successful no-op.
@MainActor
final class WatchCompanionBridge: NSObject, ObservableObject {
    static let shared = WatchCompanionBridge()
    @Published private(set) var accountID: String?
    private(set) var connectionID: UUID?
    @Published private(set) var workout: FWBWatchWorkoutSnapshot?
    @Published private(set) var rest: FWBWatchRestSnapshot?
    @Published private(set) var isReachable = false
    var onCommand: ((FWBWatchCommand) async -> FWBWatchCommandOutcome)? {
        didSet { Task { await processInbox() } }
    }
    var onRefresh: (() -> Void)?
    var onRestAlertOwnershipChanged: ((UUID?) -> Void)?
    private var watchAlertID: UUID?
    private var receipts: [FWBWatchReceipt] = []
    private var inbox: [FWBWatchCommand] = []
    private var isProcessing = false
    private let defaults: UserDefaults
    private let session: WCSession?
    private var restoredAccountID: String?

    init(defaults: UserDefaults = .standard, session: WCSession? = WCSession.isSupported() ? .default : nil) {
        self.defaults = defaults
        self.session = session
        super.init()
        session?.delegate = self
    }

    func activate(accountID: String) {
        if self.accountID != accountID {
            if let previous = self.accountID {
                defaults.removeObject(forKey: storageKey("inbox", previous))
                defaults.removeObject(forKey: storageKey("connection", previous))
                defaults.removeObject(forKey: storageKey("rest", previous))
            }
            self.accountID = accountID
            connectionID = defaults.string(forKey: storageKey("connection", accountID)).flatMap(UUID.init(uuidString:)) ?? UUID()
            defaults.set(connectionID?.uuidString, forKey: storageKey("connection", accountID))
            workout = nil
            let restored = decodeStored(FWBWatchRestSnapshot.self, suffix: "rest", accountID: accountID)
            if let restored, restored.accountID == accountID,
               Date().timeIntervalSince(restored.updatedAt) <= 86_400,
               restored.updatedAt <= Date().addingTimeInterval(300) { rest = restored }
            else { rest = nil }
            setWatchAlertID(nil)
            receipts = decodeStored([FWBWatchReceipt].self, suffix: "receipts", accountID: accountID) ?? []
            inbox = decodeStored([FWBWatchCommand].self, suffix: "inbox", accountID: accountID) ?? []
            restoredAccountID = accountID
        }
        session?.activate()
        sendContext()
        Task { await processInbox() }
    }

    func clearAccount() {
        if let accountID {
            defaults.removeObject(forKey: storageKey("inbox", accountID))
            defaults.removeObject(forKey: storageKey("receipts", accountID))
            defaults.removeObject(forKey: storageKey("connection", accountID))
            defaults.removeObject(forKey: storageKey("rest", accountID))
        }
        accountID = nil
        connectionID = nil
        restoredAccountID = nil
        workout = nil
        rest = nil
        inbox = []
        receipts = []
        onCommand = nil
        setWatchAlertID(nil)
        sendContext()
    }

    func publish(workout: FWBWatchWorkoutSnapshot?) {
        guard workout == nil || workout?.accountID == accountID else { return }
        self.workout = workout
        sendContext()
        Task { await processInbox() }
    }

    func publish(rest: FWBWatchRestSnapshot?) {
        guard rest == nil || rest?.accountID == accountID else { return }
        if self.rest?.id != rest?.id || self.rest?.deadline != rest?.deadline || rest?.phase != .running {
            setWatchAlertID(nil)
        }
        self.rest = rest
        if let accountID { defaults.set(FWBWatchWire.encode(rest), forKey: storageKey("rest", accountID)) }
        sendContext()
        Task { await processInbox() }
    }

    func watchOwnsRestAlert(for id: UUID) -> Bool { watchAlertID == id }

    private func storageKey(_ suffix: String, _ accountID: String) -> String {
        "fwb.watch.\(accountID).\(suffix).v1"
    }

    private func decodeStored<T: Decodable>(_ type: T.Type, suffix: String, accountID: String) -> T? {
        FWBWatchWire.decode(type, from: defaults.data(forKey: storageKey(suffix, accountID)))
    }

    private func persist() {
        guard let accountID else { return }
        defaults.set(FWBWatchWire.encode(inbox), forKey: storageKey("inbox", accountID))
        defaults.set(FWBWatchWire.encode(receipts), forKey: storageKey("receipts", accountID))
    }

    private func setWatchAlertID(_ id: UUID?) {
        guard watchAlertID != id else { return }
        watchAlertID = id
        onRestAlertOwnershipChanged?(id)
    }

    private func sendContext() {
        guard let session, session.activationState == .activated else { return }
        let context = FWBWatchContext(accountID: accountID, connectionID: connectionID, workout: workout, rest: rest, receipts: receipts)
        guard let data = FWBWatchWire.encode(context) else { return }
        try? session.updateApplicationContext([FWBWatchWire.contextKey: data])
        if session.isReachable {
            session.sendMessage([FWBWatchWire.contextKey: data], replyHandler: nil, errorHandler: { _ in })
        }
    }

    func receive(_ message: [String: Any]) async -> [String: Any] {
        if message[FWBWatchWire.refreshKey] != nil {
            onRefresh?()
            sendContext()
            return [:]
        }
        if let alertID = message["fwb.watchAlertID"] as? String,
           message["accountID"] as? String == accountID,
           let id = UUID(uuidString: alertID), id == rest?.id,
           rest?.phase == .running,
           let deadline = message["deadline"] as? Double,
           let updatedAt = message["updatedAt"] as? Double,
           abs((rest?.updatedAt.timeIntervalSince1970 ?? 0) - updatedAt) < 0.1,
           abs((rest?.deadline?.timeIntervalSince1970 ?? 0) - deadline) < 0.1 {
            setWatchAlertID(message["scheduled"] as? Bool == true ? id : nil)
            return [:]
        }
        guard let command = FWBWatchWire.decode(FWBWatchCommand.self, from: message[FWBWatchWire.commandKey]) else { return [:] }
        guard accountID != nil else {
            // WC can wake the app before Auth has restored its account. The Watch
            // retains its durable command until the account has been resolved.
            return receiptMessage(.init(commandID: command.id, outcome: .deferred()))
        }
        if let receipt = receipts.first(where: { $0.commandID == command.id }) {
            return receiptMessage(receipt)
        }
        guard command.accountID == accountID, command.connectionID == connectionID, connectionID != nil else {
            return receiptMessage(.init(commandID: command.id, outcome: .rejected("Sign in to the matching account on iPhone.")))
        }
        if !inbox.contains(where: { $0.id == command.id }) {
            guard inbox.count < 128 else {
                return receiptMessage(.init(commandID: command.id, outcome: .deferred("Open FWB Training on iPhone to finish syncing.")))
            }
            inbox.append(command)
            persist()
        }
        await processInbox()
        let receipt = receipts.first(where: { $0.commandID == command.id })
            ?? .init(commandID: command.id, outcome: .deferred())
        return receiptMessage(receipt)
    }

    private func receiptMessage(_ receipt: FWBWatchReceipt) -> [String: Any] {
        guard let data = FWBWatchWire.encode(receipt) else { return [:] }
        return [FWBWatchWire.receiptKey: data]
    }

    private func processInbox() async {
        guard !isProcessing, let onCommand, accountID != nil else { return }
        isProcessing = true
        defer { isProcessing = false }
        var visited = Set<UUID>()
        while let command = inbox.first(where: { !visited.contains($0.id) }) {
            visited.insert(command.id)
            let outcome: FWBWatchCommandOutcome
            // The callback may acknowledge a durably saved set after a process
            // died before its receipt was persisted. It still rejects any new
            // mutation unless the exact identified set is the active next set.
            let sameSessionPreviousSet = command.kind == .completeSet
                && command.accountID == accountID
                && (workout == nil || command.sessionID == workout?.sessionID)
                && command.connectionID == connectionID
                && (command.setID != workout?.setID || command.exerciseID != workout?.exerciseID)
                && Date().timeIntervalSince(command.createdAt) <= 86_400
                && command.createdAt <= Date().addingTimeInterval(300)
            if command.connectionID != connectionID {
                outcome = .rejected("The signed-in account changed. Refresh your Watch.")
            } else if sameSessionPreviousSet {
                outcome = await onCommand(command)
            } else if let reason = command.rejectionReason(accountID: accountID, workout: workout, rest: rest) {
                outcome = .rejected(reason)
            } else {
                outcome = await onCommand(command)
            }
            guard command.accountID == accountID, command.connectionID == connectionID else { return }
            if outcome.status != .deferred {
                inbox.removeAll { $0.id == command.id }
                receipts.removeAll { $0.commandID == command.id }
                receipts.append(.init(commandID: command.id, outcome: outcome))
                receipts = Array(receipts.suffix(128))
                persist()
                sendContext()
            }
        }
    }
}

extension WatchCompanionBridge: WCSessionDelegate {
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        Task { @MainActor in
            self.isReachable = session.isReachable
            self.sendContext()
            await self.processInbox()
        }
    }
    nonisolated func sessionDidBecomeInactive(_ session: WCSession) {}
    nonisolated func sessionDidDeactivate(_ session: WCSession) { session.activate() }
    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        Task { @MainActor in
            self.isReachable = session.isReachable
            if session.isReachable { self.onRefresh?(); self.sendContext() }
        }
    }
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        Task { @MainActor in replyHandler(await self.receive(message)) }
    }
    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in _ = await self.receive(message) }
    }
    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        Task { @MainActor in
            let reply = await self.receive(userInfo)
            if !reply.isEmpty, session.activationState == .activated { session.transferUserInfo(reply) }
        }
    }
}
