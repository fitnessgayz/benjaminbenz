import Foundation
import Network
import Supabase
import SwiftUI

struct ReadinessCheckIn: Codable, Equatable, Identifiable {
    enum SyncState: String, Codable {
        case queued
        case synced
    }

    let id: UUID
    let clientEmail: String
    let localDate: String
    var energy: Int
    var soreness: Int
    var sleepRecovery: Int
    var note: String
    var updatedAt: Date
    var syncState: SyncState

    init(
        id: UUID = UUID(),
        clientEmail: String,
        localDate: String = Self.localDateKey(),
        energy: Int,
        soreness: Int,
        sleepRecovery: Int,
        note: String,
        updatedAt: Date = Date(),
        syncState: SyncState = .queued
    ) {
        self.id = id
        self.clientEmail = clientEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        self.localDate = localDate
        self.energy = Self.validatedRating(energy)
        self.soreness = Self.validatedRating(soreness)
        self.sleepRecovery = Self.validatedRating(sleepRecovery)
        self.note = String(note.trimmingCharacters(in: .whitespacesAndNewlines).prefix(300))
        self.updatedAt = updatedAt
        self.syncState = syncState
    }

    var readinessScore: Int {
        let recoveredFromSoreness = 6 - soreness
        let favorablePoints = energy + sleepRecovery + recoveredFromSoreness
        return Int((Double(favorablePoints) / 15.0 * 100.0).rounded())
    }

    var result: ReadinessResult {
        ReadinessResult(score: readinessScore)
    }

    static func localDateKey(for date: Date = Date(), calendar: Calendar = .current) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }

    private static func validatedRating(_ value: Int) -> Int {
        min(max(value, 1), 5)
    }
}

enum ReadinessResult: Equatable {
    case ready(score: Int)
    case adjust(score: Int)
    case recover(score: Int)

    init(score: Int) {
        switch score {
        case 80...:
            self = .ready(score: score)
        case 60...:
            self = .adjust(score: score)
        default:
            self = .recover(score: score)
        }
    }

    var score: Int {
        switch self {
        case .ready(let score), .adjust(let score), .recover(let score): score
        }
    }

    var title: String {
        switch self {
        case .ready: "READY TO TRAIN"
        case .adjust: "TRAIN WITH ADJUSTMENTS"
        case .recover: "RECOVERY RECOMMENDED"
        }
    }

    var recommendation: String {
        switch self {
        case .ready:
            "Train as planned. Your energy and recovery are in a strong place today."
        case .adjust:
            "Keep the session, but reduce load or volume if your warm-up feels heavier than usual."
        case .recover:
            "Favor mobility or an easy session today. Stop if soreness feels sharp or unusual."
        }
    }
}

actor ReadinessCheckInRepository {
    static let shared = ReadinessCheckInRepository()

    private let fileURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(fileManager: FileManager = .default) {
        let baseURL = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        let directoryURL = baseURL.appendingPathComponent("FWB", isDirectory: true)
        fileURL = directoryURL.appendingPathComponent("readiness-check-ins.json")

        encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]

        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
    }

    func checkIn(clientEmail: String, localDate: String = ReadinessCheckIn.localDateKey()) throws -> ReadinessCheckIn? {
        let normalizedEmail = clientEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return try loadAll().first {
            $0.clientEmail == normalizedEmail && $0.localDate == localDate
        }
    }

    func save(_ checkIn: ReadinessCheckIn) throws {
        var records = try loadAll()
        records.removeAll {
            $0.clientEmail == checkIn.clientEmail && $0.localDate == checkIn.localDate
        }
        records.append(checkIn)
        records.sort { $0.updatedAt > $1.updatedAt }

        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let data = try encoder.encode(records)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
    }

    func queuedCheckIns() throws -> [ReadinessCheckIn] {
        try loadAll().filter { $0.syncState == .queued }
    }

    func mergeRemote(_ remote: ReadinessCheckIn) throws -> ReadinessCheckIn {
        var records = try loadAll()
        let index = records.firstIndex {
            $0.clientEmail == remote.clientEmail && $0.localDate == remote.localDate
        }

        if let index {
            let local = records[index]
            if local.syncState == .queued && local.updatedAt > remote.updatedAt {
                return local
            }

            var merged = remote
            merged = ReadinessCheckIn(
                id: local.id,
                clientEmail: remote.clientEmail,
                localDate: remote.localDate,
                energy: remote.energy,
                soreness: remote.soreness,
                sleepRecovery: remote.sleepRecovery,
                note: remote.note,
                updatedAt: remote.updatedAt,
                syncState: .synced
            )
            records[index] = merged
            try write(records)
            return merged
        }

        records.append(remote)
        records.sort { $0.updatedAt > $1.updatedAt }
        try write(records)
        return remote
    }

    func markSynced(_ uploaded: ReadinessCheckIn) throws -> ReadinessCheckIn? {
        var records = try loadAll()
        guard let index = records.firstIndex(where: {
            $0.clientEmail == uploaded.clientEmail && $0.localDate == uploaded.localDate
        }) else { return nil }

        // A newer edit may have been saved while this upload was in flight.
        // Leave that newer version queued for the next retry.
        guard records[index].updatedAt <= uploaded.updatedAt else {
            return records[index]
        }

        records[index].syncState = .synced
        try write(records)
        return records[index]
    }

    func pendingCount(clientEmail: String? = nil) throws -> Int {
        let normalizedEmail = clientEmail?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return try loadAll().filter {
            $0.syncState == .queued && (normalizedEmail == nil || $0.clientEmail == normalizedEmail)
        }.count
    }

    private func loadAll() throws -> [ReadinessCheckIn] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return [] }
        return try decoder.decode([ReadinessCheckIn].self, from: Data(contentsOf: fileURL))
    }

    private func write(_ records: [ReadinessCheckIn]) throws {
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let data = try encoder.encode(records)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
    }
}

private struct ReadinessCheckInPayload: Encodable {
    let clientMutationID: UUID
    let clientEmail: String
    let occurredOn: String
    let energy: Int
    let soreness: Int
    let sleepRecovery: Int
    let note: String?
    let source = "ios_app"
    let sourceVersion = ContinuitySync.sourceVersion
    let updatedAt: String

    init(_ checkIn: ReadinessCheckIn) {
        clientMutationID = checkIn.id
        clientEmail = checkIn.clientEmail
        occurredOn = checkIn.localDate
        energy = checkIn.energy
        soreness = checkIn.soreness
        sleepRecovery = checkIn.sleepRecovery
        note = checkIn.note.isEmpty ? nil : checkIn.note
        updatedAt = ReadinessDateCoding.string(from: checkIn.updatedAt)
    }

    enum CodingKeys: String, CodingKey {
        case clientMutationID = "client_mutation_id"
        case clientEmail = "client_email"
        case occurredOn = "occurred_on"
        case energy
        case soreness
        case sleepRecovery = "sleep_recovery"
        case note
        case source
        case sourceVersion = "source_version"
        case updatedAt = "updated_at"
    }
}

private struct LegacyReadinessCheckInPayload: Encodable {
    let clientEmail: String
    let occurredOn: String
    let energy: Int
    let soreness: Int
    let sleepRecovery: Int
    let note: String?
    let source = "ios_app"
    let updatedAt: String

    init(_ checkIn: ReadinessCheckIn) {
        clientEmail = checkIn.clientEmail
        occurredOn = checkIn.localDate
        energy = checkIn.energy
        soreness = checkIn.soreness
        sleepRecovery = checkIn.sleepRecovery
        note = checkIn.note.isEmpty ? nil : checkIn.note
        updatedAt = ContinuityDateCoding.string(from: checkIn.updatedAt)
    }

    enum CodingKeys: String, CodingKey {
        case clientEmail = "client_email"
        case occurredOn = "occurred_on"
        case energy
        case soreness
        case sleepRecovery = "sleep_recovery"
        case note
        case source
        case updatedAt = "updated_at"
    }
}

private struct ReadinessRemoteRecord: Decodable {
    let id: UUID
    let clientEmail: String
    let occurredOn: String
    let energy: Int?
    let soreness: Int?
    let sleepRecovery: Int?
    let stress: Int?
    let note: String?
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case clientEmail = "client_email"
        case occurredOn = "occurred_on"
        case energy
        case soreness
        case sleepRecovery = "sleep_recovery"
        case stress
        case note
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    var checkIn: ReadinessCheckIn? {
        guard energy != nil && soreness != nil && (sleepRecovery != nil || stress != nil) else {
            return nil
        }
        return ReadinessCheckIn(
            id: id,
            clientEmail: clientEmail,
            localDate: occurredOn,
            energy: energy ?? 3,
            soreness: soreness ?? 3,
            sleepRecovery: sleepRecovery ?? stress.map { 6 - $0 } ?? 3,
            note: note ?? "",
            updatedAt: ReadinessDateCoding.date(from: updatedAt)
                ?? ReadinessDateCoding.date(from: createdAt)
                ?? Date(),
            syncState: .synced
        )
    }
}

enum CheckInDateCoding {
    private static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let standardFormatter = ISO8601DateFormatter()

    static func string(from date: Date) -> String {
        fractionalFormatter.string(from: date)
    }

    static func date(from string: String) -> Date? {
        fractionalFormatter.date(from: string) ?? standardFormatter.date(from: string)
    }
}

private typealias ReadinessDateCoding = CheckInDateCoding

@MainActor
final class ReadinessSyncStore: ObservableObject {
    enum State: Equatable {
        case idle
        case syncing
        case synced
        case queued(Int)
    }

    static let shared = ReadinessSyncStore()

    @Published private(set) var state: State = .idle
    @Published private(set) var pendingCount = 0

    private let client: SupabaseClient
    private let repository: ReadinessCheckInRepository
    private let monitor: NWPathMonitor
    private let monitorQueue = DispatchQueue(label: "com.benjaminbenz.fwbcoach.readiness-network")
    private var activeClientEmail: String?
    private var isNetworkAvailable = true
    private var isSynchronizing = false

    private init(
        client: SupabaseClient = AppConfiguration.supabase,
        repository: ReadinessCheckInRepository = .shared,
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
                if self.isNetworkAvailable && wasUnavailable,
                   let activeClientEmail = self.activeClientEmail {
                    await self.retryPending(clientEmail: activeClientEmail)
                }
            }
        }
        monitor.start(queue: monitorQueue)
    }

    func activate(clientEmail: String) async {
        let normalizedEmail = normalize(clientEmail)
        guard !normalizedEmail.isEmpty else { return }
        activeClientEmail = normalizedEmail
        await retryPending(clientEmail: normalizedEmail)
    }

    func loadToday(clientEmail: String) async throws -> ReadinessCheckIn? {
        let normalizedEmail = normalize(clientEmail)
        activeClientEmail = normalizedEmail
        await retryPending(clientEmail: normalizedEmail)

        let local = try await repository.checkIn(clientEmail: normalizedEmail)
        guard isNetworkAvailable else { return local }

        do {
            let records: [ReadinessRemoteRecord] = try await client
                .from("client_check_ins")
                .select("id,client_email,occurred_on,energy,soreness,sleep_recovery,stress,note,created_at,updated_at")
                .eq("client_email", value: normalizedEmail)
                .eq("occurred_on", value: ReadinessCheckIn.localDateKey())
                .order("updated_at", ascending: false)
                .limit(1)
                .execute()
                .value

            guard let remote = records.lazy.compactMap(\.checkIn).first else { return local }
            return try await repository.mergeRemote(remote)
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            return local
        }
    }

    func save(_ checkIn: ReadinessCheckIn) async throws -> ReadinessCheckIn {
        try await repository.save(checkIn)
        activeClientEmail = checkIn.clientEmail
        await retryPending(clientEmail: checkIn.clientEmail)
        return try await repository.checkIn(
            clientEmail: checkIn.clientEmail,
            localDate: checkIn.localDate
        ) ?? checkIn
    }

    func retryPending(clientEmail: String) async {
        let normalizedEmail = normalize(clientEmail)
        guard !normalizedEmail.isEmpty else { return }

        guard isNetworkAvailable else {
            pendingCount = (try? await repository.pendingCount(clientEmail: normalizedEmail)) ?? 0
            state = pendingCount > 0 ? .queued(pendingCount) : .idle
            return
        }

        guard !isSynchronizing else { return }
        isSynchronizing = true
        state = .syncing
        defer { isSynchronizing = false }

        let queued = ((try? await repository.queuedCheckIns()) ?? [])
            .filter { $0.clientEmail == normalizedEmail }
            .sorted { $0.updatedAt < $1.updatedAt }

        for checkIn in queued {
            do {
                try await persist(checkIn)
                _ = try await repository.markSynced(checkIn)
            } catch is CancellationError {
                break
            } catch {
                break
            }
        }

        pendingCount = (try? await repository.pendingCount(clientEmail: normalizedEmail)) ?? 0
        state = pendingCount > 0 ? .queued(pendingCount) : .synced
    }

    private func normalize(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func persist(_ checkIn: ReadinessCheckIn) async throws {
        let existing: [CheckInRowIdentifier] = try await client
            .from("client_check_ins")
            .select("id")
            .eq("client_email", value: checkIn.clientEmail)
            .eq("occurred_on", value: checkIn.localDate)
            .limit(1)
            .execute()
            .value

        let payload = ReadinessCheckInPayload(checkIn)
        if let id = existing.first?.id {
            try await client
                .from("client_check_ins")
                .update(payload)
                .eq("id", value: id.uuidString)
                .execute()
        } else {
            try await client
                .from("client_check_ins")
                .insert(payload)
                .execute()
        }
    }
}

@MainActor
final class DailyReadinessStore: ObservableObject {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    @Published private(set) var state: LoadState = .idle
    @Published private(set) var today: ReadinessCheckIn?

    let clientEmail: String
    private let repository: ReadinessCheckInRepository
    private let syncStore: ReadinessSyncStore

    init(
        clientEmail: String,
        repository: ReadinessCheckInRepository = .shared,
        syncStore: ReadinessSyncStore? = nil
    ) {
        self.clientEmail = clientEmail
        self.repository = repository
        self.syncStore = syncStore ?? .shared
    }

    func load() async {
        state = .loading
        do {
            today = try await syncStore.loadToday(clientEmail: clientEmail)
            state = .loaded
        } catch is CancellationError {
            return
        } catch {
            state = .failed("Your readiness check-in could not be loaded.")
        }
    }

    @discardableResult
    func save(energy: Int, soreness: Int, sleepRecovery: Int, note: String) async -> Bool {
        let checkIn = ReadinessCheckIn(
            id: today?.id ?? UUID(),
            clientEmail: clientEmail,
            energy: energy,
            soreness: soreness,
            sleepRecovery: sleepRecovery,
            note: note
        )

        do {
            today = try await syncStore.save(checkIn)
            state = .loaded
            return true
        } catch is CancellationError {
            return false
        } catch {
            state = .failed("Your readiness check-in could not be saved. Please try again.")
            return false
        }
    }
}

struct ReadinessDashboardCard: View {
    @StateObject private var store: DailyReadinessStore

    init(clientEmail: String) {
        _store = StateObject(wrappedValue: DailyReadinessStore(clientEmail: clientEmail))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("DAILY CHECK-IN")
                        .font(.footnote.bold())
                        .tracking(1.2)
                        .foregroundStyle(Color.fwbLime)
                    Text("How are you showing up?")
                        .font(.title3.weight(.black))
                        .fontWidth(.condensed)
                        .foregroundStyle(Color.fwbWarmWhite)
                }
                Spacer()
                Image(systemName: "waveform.path.ecg")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(Color.fwbLime)
            }

            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .task { await store.load() }
        .onReceive(NotificationCenter.default.publisher(for: .fwbForegroundRefresh)) { _ in
            Task { await store.load() }
        }
        .accessibilityIdentifier("readiness.dashboardCard")
    }

    @ViewBuilder
    private var content: some View {
        switch store.state {
        case .idle, .loading:
            ProgressView()
                .tint(.fwbLime)
                .frame(maxWidth: .infinity, minHeight: 62)
        case .failed(let message):
            VStack(alignment: .leading, spacing: 10) {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)
                Button("TRY AGAIN") { Task { await store.load() } }
                    .font(.footnote.bold())
                    .foregroundStyle(Color.fwbLime)
            }
        case .loaded:
            if let checkIn = store.today {
                completedContent(checkIn)
            } else {
                incompleteContent
            }
        }
    }

    private var incompleteContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Log energy, soreness, and sleep before today’s training.")
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)

            NavigationLink {
                ReadinessCheckInView(store: store)
            } label: {
                Label("START CHECK-IN", systemImage: "arrow.right")
            }
            .buttonStyle(FWBPrimaryButtonStyle())
            .accessibilityIdentifier("readiness.start")
        }
    }

    private func completedContent(_ checkIn: ReadinessCheckIn) -> some View {
        HStack(spacing: 16) {
            readinessScore(checkIn.result)

            VStack(alignment: .leading, spacing: 5) {
                Text(checkIn.result.title)
                    .font(.subheadline.weight(.black))
                    .tracking(0.7)
                    .foregroundStyle(readinessColor(checkIn.result))
                Text(checkIn.result.recommendation)
                    .font(.subheadline)
                    .foregroundStyle(Color.fwbMuted)
                    .fixedSize(horizontal: false, vertical: true)
                Label(
                    checkIn.syncState == .synced ? "SYNCED" : "SAVED OFFLINE — WILL SYNC",
                    systemImage: checkIn.syncState == .synced ? "checkmark.icloud" : "icloud.slash"
                )
                .font(.footnote.bold())
                .tracking(0.5)
                .foregroundStyle(checkIn.syncState == .synced ? Color.fwbLime : Color.fwbMuted)
                NavigationLink("UPDATE CHECK-IN") {
                    ReadinessCheckInView(store: store)
                }
                .font(.subheadline.bold())
                .tracking(0.7)
                .foregroundStyle(Color.fwbLime)
                .padding(.top, 3)
                .accessibilityIdentifier("readiness.update")
            }
        }
    }

    private func readinessScore(_ result: ReadinessResult) -> some View {
        VStack(spacing: 0) {
            Text("\(result.score)")
                .font(.title.weight(.black))
                .fontWidth(.condensed)
            Text("/100")
                .font(.footnote.bold())
        }
        .foregroundStyle(.black)
        .frame(width: 70, height: 70)
        .background(readinessColor(result), in: Rectangle())
        .accessibilityLabel("Readiness score \(result.score) out of 100")
    }
}

struct ReadinessCheckInView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: DailyReadinessStore

    @State private var energy: Int
    @State private var soreness: Int
    @State private var sleepRecovery: Int
    @State private var note: String
    @State private var isSaving = false

    init(store: DailyReadinessStore) {
        self.store = store
        _energy = State(initialValue: store.today?.energy ?? 3)
        _soreness = State(initialValue: store.today?.soreness ?? 3)
        _sleepRecovery = State(initialValue: store.today?.sleepRecovery ?? 3)
        _note = State(initialValue: store.today?.note ?? "")
    }

    private var draft: ReadinessCheckIn {
        ReadinessCheckIn(
            clientEmail: store.clientEmail,
            energy: energy,
            soreness: soreness,
            sleepRecovery: sleepRecovery,
            note: note
        )
    }

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    checkInHeader

                    ReadinessScale(
                        title: "ENERGY",
                        prompt: "How much energy do you have?",
                        lowLabel: "LOW",
                        highLabel: "HIGH",
                        selection: $energy
                    )

                    ReadinessScale(
                        title: "SORENESS",
                        prompt: "How sore does your body feel?",
                        lowLabel: "FRESH",
                        highLabel: "VERY SORE",
                        selection: $soreness
                    )

                    ReadinessScale(
                        title: "SLEEP + RECOVERY",
                        prompt: "How recovered do you feel?",
                        lowLabel: "POOR",
                        highLabel: "GREAT",
                        selection: $sleepRecovery
                    )

                    notesCard
                    ReadinessResultCard(result: draft.result)

                    Button {
                        Task { await save() }
                    } label: {
                        if isSaving {
                            ProgressView().tint(.black)
                        } else {
                            Label(store.today == nil ? "SAVE TODAY’S CHECK-IN" : "UPDATE TODAY’S CHECK-IN", systemImage: "checkmark")
                        }
                    }
                    .buttonStyle(FWBPrimaryButtonStyle())
                    .disabled(isSaving)
                    .accessibilityIdentifier("readiness.save")

                    if case .failed(let message) = store.state {
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(Color.fwbRed)
                    }
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .navigationTitle("Readiness")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
    }

    private var checkInHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("TODAY’S READINESS")
                .font(.footnote.bold())
                .tracking(1.4)
                .foregroundStyle(Color.fwbLime)
            Text("CHECK IN\nBEFORE YOU TRAIN")
                .font(.system(size: 34, weight: .black))
                .fontWidth(.condensed)
                .foregroundStyle(Color.fwbWarmWhite)
            Text("Choose the answer that best reflects how you feel right now. You can update it later today.")
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
        }
    }

    private var notesCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("OPTIONAL NOTE")
                .font(.footnote.bold())
                .tracking(1)
                .foregroundStyle(Color.fwbLime)
            TextField("Add context for today", text: $note, axis: .vertical)
                .lineLimit(3...6)
                .padding(14)
                .background(Color.fwbSurface, in: Rectangle())
                .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                .onChange(of: note) { value in
                    if value.count > 300 { note = String(value.prefix(300)) }
                }
                .accessibilityIdentifier("readiness.note")
            Text("\(note.count)/300")
                .font(.footnote)
                .foregroundStyle(Color.fwbMuted)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .fwbCard()
    }

    private func save() async {
        guard !isSaving else { return }
        isSaving = true
        let didSave = await store.save(
            energy: energy,
            soreness: soreness,
            sleepRecovery: sleepRecovery,
            note: note
        )
        isSaving = false
        if didSave { dismiss() }
    }
}

private struct ReadinessScale: View {
    let title: String
    let prompt: String
    let lowLabel: String
    let highLabel: String
    @Binding var selection: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.footnote.bold())
                    .tracking(1)
                    .foregroundStyle(Color.fwbLime)
                Text(prompt)
                    .font(.headline)
                    .foregroundStyle(Color.fwbWarmWhite)
            }

            HStack(spacing: 8) {
                ForEach(1...5, id: \.self) { rating in
                    Button {
                        selection = rating
                    } label: {
                        Text("\(rating)")
                            .font(.headline.weight(.black))
                            .foregroundStyle(selection == rating ? .black : .white)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                            .background(selection == rating ? Color.fwbAccentFill : Color.fwbSurface, in: Rectangle())
                            .overlay {
                                Rectangle().stroke(selection == rating ? Color.fwbAccentFill : Color.fwbLine, lineWidth: 1)
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(title), \(rating) out of 5")
                    .accessibilityAddTraits(selection == rating ? .isSelected : [])
                    .accessibilityIdentifier("readiness.\(title.lowercased()).\(rating)")
                }
            }

            HStack {
                Text(lowLabel)
                Spacer()
                Text(highLabel)
            }
            .font(.footnote.bold())
            .tracking(0.8)
            .foregroundStyle(Color.fwbMuted)
            .lineLimit(2)
            .minimumScaleFactor(0.75)
        }
        .fwbCard()
    }
}

private struct ReadinessResultCard: View {
    let result: ReadinessResult

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            VStack(spacing: 0) {
                Text("\(result.score)")
                    .font(.system(size: 36, weight: .black))
                    .fontWidth(.condensed)
                Text("/100")
                    .font(.footnote.bold())
            }
            .foregroundStyle(.black)
            .frame(width: 82, height: 82)
            .background(readinessColor(result), in: Rectangle())

            VStack(alignment: .leading, spacing: 7) {
                Text("READINESS RESULT")
                    .font(.footnote.bold())
                    .tracking(1)
                    .foregroundStyle(Color.fwbMuted)
                Text(result.title)
                    .font(.headline.weight(.black))
                    .fontWidth(.condensed)
                    .foregroundStyle(readinessColor(result))
                Text(result.recommendation)
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("readiness.result")
    }
}

private func readinessColor(_ result: ReadinessResult) -> Color {
    switch result {
    case .ready: .fwbLime
    case .adjust: .orange
    case .recover: .fwbRed
    }
}
