import Charts
import OSLog
import PhotosUI
import Supabase
import SwiftUI
import UIKit

private let progressPhotosBucket = "progress-photos"

struct ClientMeasurementEntry: Decodable, Identifiable, Equatable {
    let id: UUID
    let clientEmail: String
    let entryDate: String
    let bodyweight: Double?
    let bodyfat: Double?
    let muscleMass: Double?
    let measurements: [String: Double]
    let goalNote: String
    let source: String
    let sourceVersion: Int
    let updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case id
        case clientEmail = "client_email"
        case entryDate = "entry_date"
        case bodyweight
        case bodyfat
        case muscleMass = "muscle_mass"
        case measurements
        case goalNote = "goal_note"
        case source
        case sourceVersion = "source_version"
        case updatedAt = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(UUID.self, forKey: .id)
        clientEmail = try container.decode(String.self, forKey: .clientEmail)
        entryDate = try container.decode(String.self, forKey: .entryDate)
        bodyweight = try container.decodeIfPresent(Double.self, forKey: .bodyweight)
        bodyfat = try container.decodeIfPresent(Double.self, forKey: .bodyfat)
        muscleMass = try container.decodeIfPresent(Double.self, forKey: .muscleMass)
        // The web client stores unfilled tape-measurement fields as JSON null.
        // Treat those as absent values while continuing to reject genuinely
        // malformed (for example, string-valued) measurements.
        let nullableMeasurements = try container.decodeIfPresent(
            [String: Double?].self,
            forKey: .measurements
        ) ?? [:]
        measurements = nullableMeasurements.compactMapValues { $0 }
        goalNote = try container.decodeIfPresent(String.self, forKey: .goalNote) ?? ""
        source = try container.decodeIfPresent(String.self, forKey: .source) ?? "legacy"
        sourceVersion = try container.decodeIfPresent(Int.self, forKey: .sourceVersion) ?? 0
        updatedAt = ContinuityDateCoding.date(from: try container.decodeIfPresent(String.self, forKey: .updatedAt))
    }

    init(id: UUID, mutation: PendingMeasurementMutation) {
        self.id = id
        clientEmail = mutation.clientEmail
        entryDate = mutation.entryDate
        bodyweight = mutation.bodyweight
        bodyfat = mutation.bodyfat
        muscleMass = mutation.muscleMass
        measurements = mutation.measurements
        goalNote = mutation.goalNote
        source = ContinuitySync.source
        sourceVersion = ContinuitySync.sourceVersion
        updatedAt = mutation.clientUpdatedAt
    }
}

private struct ClientMeasurementPayload: Encodable {
    let clientEmail: String
    let entryDate: String
    let bodyweight: Double?
    let bodyfat: Double?
    let muscleMass: Double?
    let measurements: [String: Double]
    let goalNote: String

    enum CodingKeys: String, CodingKey {
        case clientEmail = "client_email"
        case entryDate = "entry_date"
        case bodyweight
        case bodyfat
        case muscleMass = "muscle_mass"
        case measurements
        case goalNote = "goal_note"
    }
}

private struct ClientMeasurementSyncPayload: Encodable {
    let mutationID: UUID
    let clientEmail: String
    let entryDate: String
    let bodyweight: Double?
    let bodyfat: Double?
    let muscleMass: Double?
    let measurements: [String: Double]
    let goalNote: String
    let source = ContinuitySync.source
    let sourceVersion = ContinuitySync.sourceVersion
    let clientUpdatedAt: String

    init(_ mutation: PendingMeasurementMutation) {
        mutationID = mutation.id
        clientEmail = mutation.clientEmail
        entryDate = mutation.entryDate
        bodyweight = mutation.bodyweight
        bodyfat = mutation.bodyfat
        muscleMass = mutation.muscleMass
        measurements = mutation.measurements
        goalNote = mutation.goalNote
        clientUpdatedAt = ContinuityDateCoding.string(from: mutation.clientUpdatedAt)
    }

    enum CodingKeys: String, CodingKey {
        case mutationID = "client_mutation_id"
        case clientEmail = "client_email"
        case entryDate = "entry_date"
        case bodyweight
        case bodyfat
        case muscleMass = "muscle_mass"
        case measurements
        case goalNote = "goal_note"
        case source
        case sourceVersion = "source_version"
        case clientUpdatedAt = "client_updated_at"
    }
}

struct ClientProgressPhotoRecord: Decodable, Identifiable, Equatable {
    let id: UUID
    let clientEmail: String
    let storagePath: String
    let capturedOn: String
    let note: String

    enum CodingKeys: String, CodingKey {
        case id
        case clientEmail = "client_email"
        case storagePath = "storage_path"
        case capturedOn = "captured_on"
        case note
    }
}

private struct ClientProgressPhotoPayload: Encodable {
    let clientMutationID: UUID
    let clientEmail: String
    let storagePath: String
    let capturedOn: String
    let note: String
    let source = ContinuitySync.source
    let sourceVersion = ContinuitySync.sourceVersion
    let clientUpdatedAt: String

    enum CodingKeys: String, CodingKey {
        case clientMutationID = "client_mutation_id"
        case clientEmail = "client_email"
        case storagePath = "storage_path"
        case capturedOn = "captured_on"
        case note
        case source
        case sourceVersion = "source_version"
        case clientUpdatedAt = "client_updated_at"
    }
}

private struct LegacyClientProgressPhotoPayload: Encodable {
    let clientEmail: String
    let storagePath: String
    let capturedOn: String
    let note: String

    init(_ payload: ClientProgressPhotoPayload) {
        clientEmail = payload.clientEmail
        storagePath = payload.storagePath
        capturedOn = payload.capturedOn
        note = payload.note
    }

    enum CodingKeys: String, CodingKey {
        case clientEmail = "client_email"
        case storagePath = "storage_path"
        case capturedOn = "captured_on"
        case note
    }
}

struct ClientProgressPhoto: Identifiable, Equatable {
    let record: ClientProgressPhotoRecord
    let signedURL: URL?

    var id: UUID { record.id }
}

struct ClientMeasurementDraft {
    let entryDate: Date
    let bodyweight: Double?
    let bodyfat: Double?
    let muscleMass: Double?
    let chest: Double?
    let waist: Double?
    let hips: Double?
    let arm: Double?
    let thigh: Double?
    let note: String

    var hasMeasurement: Bool {
        [bodyweight, bodyfat, muscleMass, chest, waist, hips, arm, thigh].contains { $0 != nil }
    }
}

enum ClientStatsErrorClassifier {
    private static let connectivityCodes: Set<Int> = [
        URLError.notConnectedToInternet.rawValue,
        URLError.networkConnectionLost.rawValue,
        URLError.dataNotAllowed.rawValue,
        URLError.internationalRoamingOff.rawValue
    ]

    static func isConnectivityFailure(_ error: Error) -> Bool {
        var candidate: NSError? = error as NSError
        var inspected = Set<ObjectIdentifier>()

        while let current = candidate, inspected.insert(ObjectIdentifier(current)).inserted {
            if current.domain == NSURLErrorDomain, connectivityCodes.contains(current.code) {
                return true
            }
            candidate = current.userInfo[NSUnderlyingErrorKey] as? NSError
        }

        return false
    }
}

@MainActor
final class ClientStatsStore: ObservableObject {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case offline(String)
        case failed(String)
    }

    @Published private(set) var state: LoadState = .idle
    @Published private(set) var measurements: [ClientMeasurementEntry] = []
    @Published private(set) var photos: [ClientProgressPhoto] = []
    @Published private(set) var isSavingMeasurement = false
    @Published private(set) var isUploadingPhoto = false
    @Published private(set) var photoLoadError: String?
    @Published var message: String?

    private let client: SupabaseClient
    private let measurementLoaderOverride: ((String) async throws -> [ClientMeasurementEntry])?
    private let photoLoaderOverride: ((String) async throws -> [ClientProgressPhotoRecord])?
    private let signedPhotoURLLoaderOverride: ((String) async throws -> URL)?
    private let measurementSynchronizerOverride: ((PendingMeasurementMutation) async throws -> ClientMeasurementEntry?)?
    private let retriesPendingMeasurements: Bool
    private var hasLoadedOnce = false

    private static let logger = Logger(
        subsystem: "com.benjaminbenz.fwbcoach",
        category: "ClientStats"
    )

    init(
        client: SupabaseClient = AppConfiguration.supabase,
        measurementLoader: ((String) async throws -> [ClientMeasurementEntry])? = nil,
        photoLoader: ((String) async throws -> [ClientProgressPhotoRecord])? = nil,
        signedPhotoURLLoader: ((String) async throws -> URL)? = nil,
        measurementSynchronizer: ((PendingMeasurementMutation) async throws -> ClientMeasurementEntry?)? = nil,
        retriesPendingMeasurements: Bool = true
    ) {
        self.client = client
        measurementLoaderOverride = measurementLoader
        photoLoaderOverride = photoLoader
        signedPhotoURLLoaderOverride = signedPhotoURLLoader
        measurementSynchronizerOverride = measurementSynchronizer
        self.retriesPendingMeasurements = retriesPendingMeasurements
    }

    func loadIfNeeded(email: String) async {
        guard state == .idle else { return }
        await reload(email: email)
    }

    func reload(email: String) async {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedEmail.isEmpty else {
            state = .failed("Your account email is missing. Sign in again and retry.")
            return
        }

        let wasLoaded = hasLoadedOnce
        state = .loading
        message = nil
        photoLoadError = nil

        do {
            if retriesPendingMeasurements {
                await retryPendingMeasurements(email: normalizedEmail)
            }
            let measurementRows = try await loadMeasurements(email: normalizedEmail)
            guard !Task.isCancelled else {
                state = wasLoaded ? .loaded : .idle
                return
            }
            measurements = measurementRows
            await loadPhotos(email: normalizedEmail)
            guard !Task.isCancelled else {
                state = wasLoaded ? .loaded : .idle
                return
            }
            hasLoadedOnce = true
            state = .loaded
        } catch is CancellationError {
            state = wasLoaded ? .loaded : .idle
            return
        } catch {
            Self.logger.error("Stats load failed: \(String(describing: error), privacy: .private)")
            let isOffline = ClientStatsErrorClassifier.isConnectivityFailure(error)
            let failureMessage = isOffline
                ? "You’re offline. Reconnect to load your latest stats."
                : "Your stats could not be loaded. Try again. If this continues, contact support."

            if wasLoaded {
                state = .loaded
                message = failureMessage
            } else {
                state = isOffline ? .offline(failureMessage) : .failed(failureMessage)
            }
        }
    }

    func saveMeasurement(email: String, draft: ClientMeasurementDraft) async -> Bool {
        guard draft.hasMeasurement else {
            message = "Enter at least one measurement before saving."
            return false
        }

        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedEmail.isEmpty else {
            message = "Your account email is missing. Sign in again before saving."
            return false
        }
        let entryDate = Self.apiDateFormatter.string(from: draft.entryDate)
        let existing = measurements.first { $0.entryDate == entryDate }
        var detailMeasurements = existing?.measurements ?? [:]
        Self.set(draft.chest, for: "chest", in: &detailMeasurements)
        Self.set(draft.waist, for: "waist", in: &detailMeasurements)
        Self.set(draft.hips, for: "hips", in: &detailMeasurements)
        Self.set(draft.arm, for: "arm", in: &detailMeasurements)
        Self.set(draft.thigh, for: "thigh", in: &detailMeasurements)

        let payload = ClientMeasurementPayload(
            clientEmail: normalizedEmail,
            entryDate: entryDate,
            bodyweight: draft.bodyweight ?? existing?.bodyweight,
            bodyfat: draft.bodyfat ?? existing?.bodyfat,
            muscleMass: draft.muscleMass ?? existing?.muscleMass,
            measurements: detailMeasurements,
            goalNote: draft.note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? (existing?.goalNote ?? "")
                : draft.note.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        let mutation = PendingMeasurementMutation(
            clientEmail: normalizedEmail,
            entryDate: entryDate,
            bodyweight: payload.bodyweight,
            bodyfat: payload.bodyfat,
            muscleMass: payload.muscleMass,
            measurements: payload.measurements,
            goalNote: payload.goalNote,
            expectedRemoteUpdatedAt: existing?.updatedAt
        )

        isSavingMeasurement = true
        message = nil
        defer { isSavingMeasurement = false }

        do {
            if let saved = try await synchronizeMeasurement(mutation) {
                measurements.removeAll { $0.id == saved.id || $0.entryDate == saved.entryDate }
                measurements.append(saved)
                measurements.sort { $0.entryDate > $1.entryDate }
                message = "Measurements saved."
                return true
            }

            message = "Newer measurements from the website were kept. Pull to refresh before editing again."
            return false
        } catch is CancellationError {
            return false
        } catch {
            guard ClientStatsErrorClassifier.isConnectivityFailure(error) else {
                Self.logger.error("Measurement save failed: \(String(describing: error), privacy: .private)")
                message = "Your measurements could not be saved. Try again. If this continues, contact support."
                return false
            }

            do {
                try await ContinuityOutbox.shared.enqueue(mutation)
                let local = ClientMeasurementEntry(id: existing?.id ?? mutation.id, mutation: mutation)
                measurements.removeAll { $0.id == local.id || $0.entryDate == local.entryDate }
                measurements.append(local)
                measurements.sort { $0.entryDate > $1.entryDate }
                message = "Measurements saved on this iPhone. They’ll sync when you’re back online."
                return true
            } catch {
                message = "Your measurements could not be secured on this iPhone. Try again."
                return false
            }
        }
    }

    private func loadMeasurements(email: String) async throws -> [ClientMeasurementEntry] {
        if let measurementLoaderOverride {
            return try await measurementLoaderOverride(email)
        }

        return try await client
            .from("client_progress")
            .select("id,client_email,entry_date,bodyweight,bodyfat,muscle_mass,measurements,goal_note,source,source_version,updated_at")
            .eq("client_email", value: email)
            .order("entry_date", ascending: false)
            .limit(365)
            .execute()
            .value
    }

    private func loadPhotos(email: String) async {
        do {
            let photoRows: [ClientProgressPhotoRecord]
            if let photoLoaderOverride {
                photoRows = try await photoLoaderOverride(email)
            } else {
                photoRows = try await client
                    .from("client_progress_photos")
                    .select("id,client_email,storage_path,captured_on,note")
                    .eq("client_email", value: email)
                    .order("captured_on", ascending: false)
                    .limit(100)
                    .execute()
                    .value
            }

            var signedPhotos: [ClientProgressPhoto] = []
            var signedURLFailureCount = 0
            for record in photoRows {
                let signedURL: URL?
                do {
                    if let signedPhotoURLLoaderOverride {
                        signedURL = try await signedPhotoURLLoaderOverride(record.storagePath)
                    } else {
                        signedURL = try await client.storage
                            .from(progressPhotosBucket)
                            .createSignedURL(path: record.storagePath, expiresIn: 3_600)
                    }
                } catch {
                    signedURL = nil
                    signedURLFailureCount += 1
                    Self.logger.error("Progress photo URL creation failed: \(String(describing: error), privacy: .private)")
                }
                signedPhotos.append(ClientProgressPhoto(record: record, signedURL: signedURL))
            }

            photos = signedPhotos
            if signedURLFailureCount > 0 {
                photoLoadError = signedURLFailureCount == 1
                    ? "One progress photo could not be opened. Try again."
                    : "Some progress photos could not be opened. Try again."
            }
        } catch is CancellationError {
            return
        } catch {
            Self.logger.error("Progress photos load failed: \(String(describing: error), privacy: .private)")
            photoLoadError = ClientStatsErrorClassifier.isConnectivityFailure(error)
                ? "Progress photos are unavailable while you’re offline."
                : "Progress photos could not be loaded. Try again."
        }
    }

    private func retryPendingMeasurements(email: String) async {
        let mutations = await ContinuityOutbox.shared.measurementMutations(email: email)
        for mutation in mutations {
            do {
                _ = try await synchronizeMeasurement(mutation)
            } catch {
                break
            }
        }
    }

    private func synchronizeMeasurement(_ mutation: PendingMeasurementMutation) async throws -> ClientMeasurementEntry? {
        if let measurementSynchronizerOverride {
            return try await measurementSynchronizerOverride(mutation)
        }

        let currentRows = try await loadMeasurements(email: mutation.clientEmail)
        if let remote = currentRows.first(where: { $0.entryDate == mutation.entryDate }),
           let remoteUpdatedAt = remote.updatedAt,
           remoteUpdatedAt > mutation.clientUpdatedAt,
           remoteUpdatedAt != mutation.expectedRemoteUpdatedAt {
            try? await ContinuityOutbox.shared.removeMeasurement(
                email: mutation.clientEmail,
                entryDate: mutation.entryDate
            )
            return nil
        }

        let saved: ClientMeasurementEntry
        do {
            saved = try await client
                .from("client_progress")
                .upsert(ClientMeasurementSyncPayload(mutation), onConflict: "client_email,entry_date")
                .select("id,client_email,entry_date,bodyweight,bodyfat,muscle_mass,measurements,goal_note,source,source_version,updated_at")
                .single()
                .execute()
                .value
        } catch {
            let legacy = ClientMeasurementPayload(
                clientEmail: mutation.clientEmail,
                entryDate: mutation.entryDate,
                bodyweight: mutation.bodyweight,
                bodyfat: mutation.bodyfat,
                muscleMass: mutation.muscleMass,
                measurements: mutation.measurements,
                goalNote: mutation.goalNote
            )
            saved = try await client
                .from("client_progress")
                .upsert(legacy, onConflict: "client_email,entry_date")
                .select("id,client_email,entry_date,bodyweight,bodyfat,muscle_mass,measurements,goal_note")
                .single()
                .execute()
                .value
        }

        try? await ContinuityOutbox.shared.removeMeasurement(
            email: mutation.clientEmail,
            entryDate: mutation.entryDate
        )
        return saved
    }

    func uploadPhoto(
        account: SignedInAccount,
        imageData: Data,
        capturedOn: Date,
        note: String
    ) async -> Bool {
        guard let jpegData = ProgressPhotoProcessor.jpegData(from: imageData) else {
            message = "That photo could not be prepared. Try another image."
            return false
        }

        let date = Self.apiDateFormatter.string(from: capturedOn)
        let mutationID = UUID()
        let path = "\(account.id.uuidString.lowercased())/\(date)-\(mutationID.uuidString.lowercased()).jpg"
        let payload = ClientProgressPhotoPayload(
            clientMutationID: mutationID,
            clientEmail: account.email.lowercased(),
            storagePath: path,
            capturedOn: date,
            note: String(note.trimmingCharacters(in: .whitespacesAndNewlines).prefix(300)),
            clientUpdatedAt: ContinuityDateCoding.string(from: Date())
        )

        isUploadingPhoto = true
        message = nil
        defer { isUploadingPhoto = false }

        do {
            try await client.storage
                .from(progressPhotosBucket)
                .upload(
                    path,
                    data: jpegData,
                    options: FileOptions(cacheControl: "3600", contentType: "image/jpeg", upsert: false)
                )

            do {
                let record: ClientProgressPhotoRecord
                do {
                    record = try await client
                        .from("client_progress_photos")
                        .upsert(payload, onConflict: "client_mutation_id")
                        .select("id,client_email,storage_path,captured_on,note")
                        .single()
                        .execute()
                        .value
                } catch {
                    record = try await client
                        .from("client_progress_photos")
                        .insert(LegacyClientProgressPhotoPayload(payload))
                        .select("id,client_email,storage_path,captured_on,note")
                        .single()
                        .execute()
                        .value
                }

                let signedURL = try? await client.storage
                    .from(progressPhotosBucket)
                    .createSignedURL(path: path, expiresIn: 3_600)
                photos.insert(ClientProgressPhoto(record: record, signedURL: signedURL), at: 0)
                message = "Progress photo added."
                return true
            } catch {
                _ = try? await client.storage.from(progressPhotosBucket).remove(paths: [path])
                throw error
            }
        } catch is CancellationError {
            return false
        } catch {
            message = "Your photo could not be uploaded. Check your connection and try again."
            return false
        }
    }

    private static func set(_ value: Double?, for key: String, in measurements: inout [String: Double]) {
        if let value {
            measurements[key] = value
        }
    }

    static let apiDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        // Postgres `date` values are calendar dates, not UTC instants. Parsing
        // them in UTC and then formatting in the device zone shifts them back
        // one day in the Americas.
        formatter.timeZone = .autoupdatingCurrent
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}

private enum ProgressPhotoProcessor {
    static func jpegData(from data: Data, maximumDimension: CGFloat = 1_800) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let longestSide = max(image.size.width, image.size.height)
        guard longestSide > 0 else { return nil }

        let scale = min(1, maximumDimension / longestSide)
        let targetSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let resized = UIGraphicsImageRenderer(size: targetSize, format: format).image { _ in
            UIColor.black.setFill()
            UIRectFill(CGRect(origin: .zero, size: targetSize))
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }
        return resized.jpegData(compressionQuality: 0.84)
    }
}

private enum ClientStatsSheet: String, Identifiable {
    case measurement
    case photo

    var id: String { rawValue }
}

private enum ClientStatsMetric: String, CaseIterable, Identifiable {
    case bodyweight
    case bodyfat
    case muscleMass
    case waist
    case chest

    var id: String { rawValue }

    var title: String {
        switch self {
        case .bodyweight: "Body weight"
        case .bodyfat: "Body fat"
        case .muscleMass: "Muscle mass"
        case .waist: "Waist"
        case .chest: "Chest"
        }
    }

    var shortTitle: String {
        switch self {
        case .bodyweight: "Weight"
        case .bodyfat: "Body fat"
        case .muscleMass: "Muscle"
        case .waist: "Waist"
        case .chest: "Chest"
        }
    }

    var unit: String {
        switch self {
        case .bodyweight, .muscleMass: "lb"
        case .bodyfat: "%"
        case .waist, .chest: "in"
        }
    }

    func value(in entry: ClientMeasurementEntry) -> Double? {
        switch self {
        case .bodyweight: entry.bodyweight
        case .bodyfat: entry.bodyfat
        case .muscleMass: entry.muscleMass
        case .waist: entry.measurements["waist"]
        case .chest: entry.measurements["chest"]
        }
    }
}

private struct ClientStatsPoint: Identifiable {
    let entry: ClientMeasurementEntry
    let date: Date
    let value: Double

    var id: UUID { entry.id }
}

@MainActor
struct ClientStatsView: View {
    let account: SignedInAccount

    @StateObject private var store: ClientStatsStore
    @State private var selectedMetric: ClientStatsMetric = .bodyweight
    @State private var presentedSheet: ClientStatsSheet?

    init(account: SignedInAccount) {
        self.account = account
        _store = StateObject(wrappedValue: ClientStatsStore())
    }

    init(account: SignedInAccount, store: ClientStatsStore) {
        self.account = account
        _store = StateObject(wrappedValue: store)
    }

    private var chartPoints: [ClientStatsPoint] {
        store.measurements.compactMap { entry in
            guard let date = ClientStatsStore.apiDateFormatter.date(from: entry.entryDate),
                  let value = selectedMetric.value(in: entry) else { return nil }
            return ClientStatsPoint(entry: entry, date: date, value: value)
        }
        .sorted { $0.date < $1.date }
    }

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            Group {
                switch store.state {
                case .idle, .loading:
                    ProgressView("Loading client stats…")
                        .tint(.fwbLime)
                        .foregroundStyle(Color.fwbMuted)
                case .offline(let message):
                    StatsLoadErrorView(
                        message: message,
                        systemImage: "wifi.slash",
                        accentColor: .fwbMuted
                    ) {
                        Task { await store.reload(email: account.email) }
                    }
                case .failed(let message):
                    StatsLoadErrorView(message: message) {
                        Task { await store.reload(email: account.email) }
                    }
                case .loaded:
                    statsContent
                }
            }
        }
        .navigationTitle("Stats & Measurements")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        presentedSheet = .measurement
                    } label: {
                        Label("Log measurements", systemImage: "ruler")
                    }

                    Button {
                        presentedSheet = .photo
                    } label: {
                        Label("Add progress photo", systemImage: "photo.badge.plus")
                    }
                } label: {
                    Image(systemName: "plus")
                        .font(.headline.bold())
                        .foregroundStyle(Color.fwbLime)
                }
                .accessibilityLabel("Add client stat")
            }
        }
        .sheet(item: $presentedSheet) { sheet in
            switch sheet {
            case .measurement:
                MeasurementEntrySheet(account: account, store: store)
            case .photo:
                ProgressPhotoEntrySheet(account: account, store: store)
            }
        }
        .task {
            await store.loadIfNeeded(email: account.email)
        }
        .onReceive(NotificationCenter.default.publisher(for: .fwbForegroundRefresh)) { _ in
            Task { await store.reload(email: account.email) }
        }
    }

    private var statsContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("CLIENT PROFILE")
                        .font(.footnote.bold())
                        .tracking(1.4)
                        .foregroundStyle(Color.fwbLime)
                    Text("TRACK\nYOUR PROGRESS")
                        .font(.system(size: 42, weight: .black))
                        .fontWidth(.condensed)
                        .foregroundStyle(Color.fwbWarmWhite)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Save measurements and private progress photos in one place.")
                        .font(.subheadline)
                        .foregroundStyle(Color.fwbMuted)
                }

                if let message = store.message {
                    Text(message)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(statusColor(for: message))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Color.fwbCard, in: Rectangle())
                        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                }

                progressPhotosSection
                measurementChartSection
                measurementHistorySection
            }
            .padding(20)
        }
        .refreshable {
            await store.reload(email: account.email)
        }
    }

    private var progressPhotosSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                SectionHeading(kicker: "PRIVATE", title: "PROGRESS PHOTOS")
                Spacer()
                Button("Add Photo") {
                    presentedSheet = .photo
                }
                .font(.footnote.weight(.black))
                .foregroundStyle(Color.fwbLime)
            }

            if let photoLoadError = store.photoLoadError {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(Color.fwbRed)
                    Text(photoLoadError)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Color.fwbMuted)
                    Spacer(minLength: 8)
                    Button("Retry") {
                        Task { await store.reload(email: account.email) }
                    }
                    .font(.footnote.weight(.black))
                    .foregroundStyle(Color.fwbLime)
                }
                .padding(12)
                .background(Color.fwbCard, in: Rectangle())
                .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
            }

            if store.photos.isEmpty {
                if store.photoLoadError == nil {
                    Button {
                        presentedSheet = .photo
                    } label: {
                        VStack(spacing: 12) {
                            Image(systemName: "photo.badge.plus")
                                .font(.system(size: 30, weight: .semibold))
                            Text("ADD YOUR FIRST PROGRESS PHOTO")
                                .font(.subheadline.weight(.black))
                                .fontWidth(.condensed)
                            Text("Photos are private and visible only to your authenticated account and coach.")
                                .font(.footnote)
                                .foregroundStyle(Color.fwbMuted)
                                .multilineTextAlignment(.center)
                        }
                        .foregroundStyle(Color.fwbLime)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 26)
                        .background(Color.fwbCard, in: Rectangle())
                        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                    }
                    .buttonStyle(.plain)
                }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 12) {
                        ForEach(store.photos) { photo in
                            ProgressPhotoCard(photo: photo)
                        }
                    }
                }
            }
        }
    }

    private func statusColor(for message: String) -> Color {
        switch message {
        case "Measurements saved.", "Progress photo added.":
            Color.fwbLime
        default:
            message.hasPrefix("Measurements saved on this iPhone") ? Color.fwbLime : Color.fwbRed
        }
    }

    private var measurementChartSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                SectionHeading(kicker: "TRENDS", title: selectedMetric.title.uppercased())
                Spacer()
                Button("Log Stats") {
                    presentedSheet = .measurement
                }
                .font(.footnote.weight(.black))
                .foregroundStyle(Color.fwbLime)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(ClientStatsMetric.allCases) { metric in
                        Button(metric.shortTitle) {
                            selectedMetric = metric
                        }
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(selectedMetric == metric ? Color.black : Color.fwbWarmWhite)
                        .padding(.horizontal, 13)
                        .padding(.vertical, 8)
                        .frame(minHeight: 36)
                        .background(selectedMetric == metric ? Color.fwbAccentFill : Color.fwbCard, in: Rectangle())
                        .overlay { Rectangle().stroke(selectedMetric == metric ? Color.fwbAccentFill : Color.fwbLine, lineWidth: 1) }
                    }
                }
            }

            if chartPoints.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "chart.xyaxis.line")
                        .font(.title)
                        .foregroundStyle(Color.fwbLime)
                    Text("No \(selectedMetric.title.lowercased()) entries yet")
                        .font(.subheadline.weight(.bold))
                    Text("Log a measurement to start your trend line.")
                        .font(.footnote)
                        .foregroundStyle(Color.fwbMuted)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 190)
                .background(Color.fwbCard, in: Rectangle())
                .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    if let latest = chartPoints.last {
                        HStack(alignment: .firstTextBaseline, spacing: 5) {
                            Text(latest.value.formatted(.number.precision(.fractionLength(0...1))))
                                .font(.system(size: 36, weight: .black))
                                .fontWidth(.condensed)
                            Text(selectedMetric.unit)
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(Color.fwbMuted)
                        }
                    }

                    Chart(chartPoints) { point in
                        LineMark(
                            x: .value("Date", point.date),
                            y: .value(selectedMetric.title, point.value)
                        )
                        .foregroundStyle(Color.fwbLime)
                        .lineStyle(StrokeStyle(lineWidth: 3))
                        .interpolationMethod(.catmullRom)

                        PointMark(
                            x: .value("Date", point.date),
                            y: .value(selectedMetric.title, point.value)
                        )
                        .foregroundStyle(Color.fwbLime)
                        .symbolSize(42)
                    }
                    .chartXAxis {
                        AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                            AxisGridLine().foregroundStyle(Color.fwbLine.opacity(0.45))
                            AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                                .foregroundStyle(Color.fwbMuted)
                        }
                    }
                    .chartYAxis {
                        AxisMarks(position: .leading) { _ in
                            AxisGridLine().foregroundStyle(Color.fwbLine.opacity(0.45))
                            AxisValueLabel().foregroundStyle(Color.fwbMuted)
                        }
                    }
                    .frame(height: 210)
                }
                .padding(18)
                .background(Color.fwbCard, in: Rectangle())
                .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
            }
        }
    }

    private var measurementHistorySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(kicker: "LATEST", title: "MEASUREMENT HISTORY")

            if store.measurements.isEmpty {
                Text("Your saved measurements will appear here.")
                    .font(.subheadline)
                    .foregroundStyle(Color.fwbMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fwbCard()
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(Array(store.measurements.prefix(12).enumerated()), id: \.element.id) { index, entry in
                        MeasurementHistoryRow(entry: entry)
                        if index < min(store.measurements.count, 12) - 1 {
                            Divider().overlay(Color.fwbLine.opacity(0.7))
                        }
                    }
                }
                .background(Color.fwbCard, in: Rectangle())
                .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
            }
        }
    }
}

private struct ProgressPhotoCard: View {
    let photo: ClientProgressPhoto

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            AsyncImage(url: photo.signedURL) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                case .failure:
                    photoPlaceholder(systemName: "exclamationmark.triangle")
                case .empty:
                    ZStack {
                        Color.fwbSurface
                        ProgressView().tint(.fwbLime)
                    }
                @unknown default:
                    photoPlaceholder(systemName: "photo")
                }
            }
            .frame(width: 164, height: 220)
            .clipped()

            LinearGradient(
                colors: [.clear, .black.opacity(0.84)],
                startPoint: .center,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 3) {
                Text(ClientStatsStore.apiDateFormatter.date(from: photo.record.capturedOn)?.formatted(date: .abbreviated, time: .omitted) ?? photo.record.capturedOn)
                    .font(.footnote.weight(.black))
                    .foregroundStyle(.white)
                if !photo.record.note.isEmpty {
                    Text(photo.record.note)
                        .font(.footnote)
                        .foregroundStyle(Color.white.opacity(0.78))
                        .lineLimit(2)
                }
            }
            .padding(12)
        }
        .frame(width: 164, height: 220)
        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Progress photo from \(photo.record.capturedOn)")
    }

    private func photoPlaceholder(systemName: String) -> some View {
        ZStack {
            Color.fwbSurface
            Image(systemName: systemName)
                .font(.title)
                .foregroundStyle(Color.fwbMuted)
        }
    }
}

private struct MeasurementHistoryRow: View {
    let entry: ClientMeasurementEntry

    private var summary: String {
        var parts: [String] = []
        if let value = entry.bodyweight { parts.append("\(value.formatted(.number.precision(.fractionLength(0...1)))) lb") }
        if let value = entry.bodyfat { parts.append("\(value.formatted(.number.precision(.fractionLength(0...1))))% body fat") }
        if let value = entry.measurements["waist"] { parts.append("\(value.formatted(.number.precision(.fractionLength(0...1)))) in waist") }
        return parts.isEmpty ? "Detailed measurements saved" : parts.joined(separator: "  •  ")
    }

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "ruler")
                .font(.headline)
                .foregroundStyle(Color.fwbLime)
                .frame(width: 30)

            VStack(alignment: .leading, spacing: 4) {
                Text(ClientStatsStore.apiDateFormatter.date(from: entry.entryDate)?.formatted(date: .abbreviated, time: .omitted) ?? entry.entryDate)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.fwbWarmWhite)
                Text(summary)
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)
                    .lineLimit(2)
            }
            Spacer()
        }
        .padding(16)
        .accessibilityElement(children: .combine)
    }
}

private struct MeasurementEntrySheet: View {
    let account: SignedInAccount
    @ObservedObject var store: ClientStatsStore

    @Environment(\.dismiss) private var dismiss
    @State private var entryDate = Date()
    @State private var bodyweight = ""
    @State private var bodyfat = ""
    @State private var muscleMass = ""
    @State private var chest = ""
    @State private var waist = ""
    @State private var hips = ""
    @State private var arm = ""
    @State private var thigh = ""
    @State private var note = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("MEASUREMENT ENTRY")
                        .font(.footnote.bold())
                        .tracking(1.3)
                        .foregroundStyle(Color.fwbLime)
                    Text("LOG TODAY'S\nCLIENT STATS")
                        .font(.system(size: 34, weight: .black))
                        .fontWidth(.condensed)
                        .foregroundStyle(Color.fwbWarmWhite)

                    entrySection(title: "ENTRY") {
                        HStack {
                            Text("Date")
                            Spacer()
                            DatePicker("Date", selection: $entryDate, in: ...Date(), displayedComponents: .date)
                                .labelsHidden()
                                .datePickerStyle(.compact)
                        }
                        .padding(16)
                    }

                    entrySection(title: "BODY COMPOSITION") {
                        VStack(spacing: 0) {
                            measurementField("Body weight", unit: "lb", text: $bodyweight)
                            measurementDivider
                            measurementField("Body fat", unit: "%", text: $bodyfat)
                            measurementDivider
                            measurementField("Muscle mass", unit: "lb", text: $muscleMass)
                        }
                    }

                    entrySection(title: "TAPE MEASUREMENTS") {
                        VStack(spacing: 0) {
                            measurementField("Chest", unit: "in", text: $chest)
                            measurementDivider
                            measurementField("Waist", unit: "in", text: $waist)
                            measurementDivider
                            measurementField("Hips", unit: "in", text: $hips)
                            measurementDivider
                            measurementField("Arm", unit: "in", text: $arm)
                            measurementDivider
                            measurementField("Thigh", unit: "in", text: $thigh)
                        }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("NOTE")
                            .font(.footnote.weight(.black))
                            .foregroundStyle(Color.fwbMuted)
                        TextField("Optional progress note", text: $note, axis: .vertical)
                            .lineLimit(2...5)
                            .padding(14)
                            .background(Color.fwbSurface, in: Rectangle())
                            .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                    }

                if let message = store.message, message.contains("Enter at least") || message.contains("could not") {
                    Text(message)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Color.fwbRed)
                }

                    Button {
                        save()
                    } label: {
                        if store.isSavingMeasurement {
                            ProgressView().tint(.black)
                        } else {
                            Label("Save Measurements", systemImage: "checkmark")
                        }
                    }
                    .buttonStyle(FWBPrimaryButtonStyle())
                    .disabled(store.isSavingMeasurement)
                }
                .padding(20)
            }
            .background(Color.fwbBackground)
            .navigationTitle("Log Measurements")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.fwbBackground, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Color.fwbMuted)
                }
            }
        }
    }

    private func measurementField(_ title: String, unit: String, text: Binding<String>) -> some View {
        HStack {
            Text(title)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            Spacer()
            TextField("—", text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(minWidth: 56, maxWidth: 90)
            Text(unit)
                .font(.footnote.weight(.bold))
                .foregroundStyle(Color.fwbMuted)
                .lineLimit(1)
                .frame(minWidth: 20, alignment: .leading)
        }
        .padding(16)
    }

    private var measurementDivider: some View {
        Divider()
            .overlay(Color.fwbLine.opacity(0.65))
            .padding(.leading, 16)
    }

    private func entrySection<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.footnote.weight(.black))
                .foregroundStyle(Color.fwbMuted)
            content()
                .background(Color.fwbCard, in: Rectangle())
                .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
        }
    }

    private func save() {
        Task {
            let saved = await store.saveMeasurement(
                email: account.email,
                draft: ClientMeasurementDraft(
                    entryDate: entryDate,
                    bodyweight: numeric(bodyweight),
                    bodyfat: numeric(bodyfat),
                    muscleMass: numeric(muscleMass),
                    chest: numeric(chest),
                    waist: numeric(waist),
                    hips: numeric(hips),
                    arm: numeric(arm),
                    thigh: numeric(thigh),
                    note: note
                )
            )
            if saved { dismiss() }
        }
    }

    private func numeric(_ value: String) -> Double? {
        Double(value.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespacesAndNewlines))
    }
}

private struct ProgressPhotoEntrySheet: View {
    let account: SignedInAccount
    @ObservedObject var store: ClientStatsStore

    @Environment(\.dismiss) private var dismiss
    @State private var selectedItem: PhotosPickerItem?
    @State private var selectedData: Data?
    @State private var capturedOn = Date()
    @State private var note = ""
    @State private var localMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("PROGRESS PHOTO")
                        .font(.footnote.bold())
                        .tracking(1.3)
                        .foregroundStyle(Color.fwbLime)
                    Text("ADD A PRIVATE\nCHECK-IN PHOTO")
                        .font(.system(size: 34, weight: .black))
                        .fontWidth(.condensed)
                        .foregroundStyle(Color.fwbWarmWhite)

                    PhotosPicker(selection: $selectedItem, matching: .images) {
                        Group {
                            if let selectedData, let image = UIImage(data: selectedData) {
                                Image(uiImage: image)
                                    .resizable()
                                    .scaledToFit()
                                    .frame(maxWidth: .infinity)
                                    .frame(maxHeight: 420)
                                    .background(Color.black)
                            } else {
                                VStack(spacing: 12) {
                                    Image(systemName: "photo.badge.plus")
                                        .font(.system(size: 36, weight: .semibold))
                                    Text("CHOOSE PHOTO")
                                        .font(.headline.weight(.black))
                                    Text("Select a front, side, or back progress photo from your library.")
                                        .font(.footnote)
                                        .foregroundStyle(Color.fwbMuted)
                                        .multilineTextAlignment(.center)
                                }
                                .foregroundStyle(Color.fwbLime)
                                .frame(maxWidth: .infinity)
                                .frame(height: 230)
                            }
                        }
                        .background(Color.fwbCard, in: Rectangle())
                        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                    }
                    .buttonStyle(.plain)

                    VStack(alignment: .leading, spacing: 8) {
                        Text("PHOTO DATE")
                            .font(.footnote.weight(.black))
                            .foregroundStyle(Color.fwbMuted)
                        DatePicker("Photo date", selection: $capturedOn, in: ...Date(), displayedComponents: .date)
                            .labelsHidden()
                            .datePickerStyle(.compact)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("NOTE")
                            .font(.footnote.weight(.black))
                            .foregroundStyle(Color.fwbMuted)
                        TextField("Optional: front, side, week 4…", text: $note, axis: .vertical)
                            .lineLimit(2...4)
                            .padding(14)
                            .background(Color.fwbSurface, in: Rectangle())
                            .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                    }

                    if let message = localMessage ?? (store.message?.contains("could not") == true ? store.message : nil) {
                        Text(message)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Color.fwbRed)
                    }

                    Button {
                        guard let selectedData else {
                            localMessage = "Choose a photo before uploading."
                            return
                        }
                        Task {
                            let uploaded = await store.uploadPhoto(
                                account: account,
                                imageData: selectedData,
                                capturedOn: capturedOn,
                                note: note
                            )
                            if uploaded { dismiss() }
                        }
                    } label: {
                        if store.isUploadingPhoto {
                            ProgressView().tint(.black)
                        } else {
                            Label("Add Progress Photo", systemImage: "lock.fill")
                        }
                    }
                    .buttonStyle(FWBPrimaryButtonStyle())
                    .disabled(store.isUploadingPhoto)

                    Label("Stored privately. Photos use short-lived secure links inside the app.", systemImage: "lock.shield.fill")
                        .font(.footnote)
                        .foregroundStyle(Color.fwbMuted)
                }
                .padding(20)
            }
            .background(Color.fwbBackground)
            .navigationTitle("Add Photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.fwbBackground, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Color.fwbMuted)
                }
            }
            .onChange(of: selectedItem) { item in
                guard let item else { return }
                localMessage = nil
                Task {
                    do {
                        selectedData = try await item.loadTransferable(type: Data.self)
                        if selectedData == nil {
                            localMessage = "That photo could not be loaded. Try another image."
                        }
                    } catch {
                        localMessage = "That photo could not be loaded. Try another image."
                    }
                }
            }
        }
    }
}

private struct StatsLoadErrorView: View {
    let message: String
    var systemImage = "exclamationmark.triangle.fill"
    var accentColor = Color.fwbRed
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: systemImage)
                .font(.largeTitle)
                .foregroundStyle(accentColor)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
                .multilineTextAlignment(.center)
            Button("Try Again", action: retry)
                .buttonStyle(FWBSecondaryButtonStyle())
        }
        .padding(24)
    }
}

#if DEBUG
@MainActor
struct ClientStatsSmokeHarness: View {
    private let account = SignedInAccount(
        id: UUID(uuidString: "c0a7f519-d71a-4d9f-bb4e-63a77e402dde")!,
        email: "stats-smoke@example.invalid"
    )
    @StateObject private var store: ClientStatsStore

    init() {
        let initialMutation = PendingMeasurementMutation(
            clientEmail: "stats-smoke@example.invalid",
            entryDate: "2026-08-25",
            bodyweight: 160,
            bodyfat: 12,
            muscleMass: nil,
            measurements: ["waist": 31.5],
            goalNote: "",
            expectedRemoteUpdatedAt: nil
        )
        let initialEntry = ClientMeasurementEntry(
            id: UUID(uuidString: "ba2146f1-eb5e-41ae-9c38-131d5a4f55cc")!,
            mutation: initialMutation
        )

        _store = StateObject(
            wrappedValue: ClientStatsStore(
                measurementLoader: { _ in [initialEntry] },
                photoLoader: { _ in [] },
                signedPhotoURLLoader: { _ in URL(string: "https://example.invalid/photo.jpg")! },
                measurementSynchronizer: { mutation in
                    ClientMeasurementEntry(id: mutation.id, mutation: mutation)
                },
                retriesPendingMeasurements: false
            )
        )
    }

    var body: some View {
        NavigationStack {
            ClientStatsView(account: account, store: store)
        }
    }
}
#endif
