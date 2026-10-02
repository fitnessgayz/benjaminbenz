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
    let leanMass: Double?
    let measurements: [String: Double]
    let measurementValues: [String: AnyJSON]
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
        case leanMass = "lean_mass"
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
        leanMass = try container.decodeIfPresent(Double.self, forKey: .leanMass)
        // Web records also contain nested DEXA metadata. Keep the complete JSON
        // for round-trip saves, and expose only numbers to measurement charts.
        measurementValues = try container.decodeIfPresent(
            [String: AnyJSON].self, forKey: .measurements
        ) ?? [:]
        let numericValues = measurementValues.compactMapValues { value -> Double? in
            switch value {
            case .integer(let number): return Double(number)
            case .double(let number): return number
            default: return nil
            }
        }
        // Unknown metadata may have any JSON shape; actual tape fields must
        // remain numeric or null so corrupt entries never look like valid data.
        for key in ["chest", "waist", "hips", "arm", "arms", "thigh", "thighs"] {
            if let value = measurementValues[key], value != .null, numericValues[key] == nil {
                throw DecodingError.typeMismatch(Double.self, .init(
                    codingPath: container.codingPath + [CodingKeys.measurements],
                    debugDescription: "Tape measurements must be numbers or null."
                ))
            }
        }
        measurements = numericValues
        goalNote = try container.decodeIfPresent(String.self, forKey: .goalNote) ?? ""
        source = try container.decodeIfPresent(String.self, forKey: .source) ?? "legacy"
        sourceVersion = try container.decodeIfPresent(Int.self, forKey: .sourceVersion) ?? 0
        updatedAt = ContinuityDateCoding.date(from: try container.decodeIfPresent(String.self, forKey: .updatedAt))
    }

    init(id: UUID, mutation: PendingMeasurementMutation, preserving existing: ClientMeasurementEntry? = nil) {
        self.id = id
        clientEmail = mutation.clientEmail
        entryDate = mutation.entryDate
        bodyweight = mutation.bodyweight
        bodyfat = mutation.bodyfat
        muscleMass = mutation.muscleMass
        leanMass = existing?.leanMass
        measurements = mutation.measurements
        measurementValues = Self.mergedMeasurements(mutation.measurements, preserving: existing)
        goalNote = mutation.goalNote
        source = ContinuitySync.source
        sourceVersion = ContinuitySync.sourceVersion
        updatedAt = mutation.clientUpdatedAt
    }

    static func mergedMeasurements(
        _ edits: [String: Double], preserving existing: ClientMeasurementEntry?
    ) -> [String: AnyJSON] {
        (existing?.measurementValues ?? [:]).merging(edits.mapValues(AnyJSON.double)) { _, edited in edited }
    }
}

struct ClientMeasurementPayload: Encodable {
    let clientEmail: String
    let entryDate: String
    let bodyweight: Double?
    let bodyfat: Double?
    let muscleMass: Double?
    let measurements: [String: AnyJSON]
    let goalNote: String

    init(_ mutation: PendingMeasurementMutation, preserving existing: ClientMeasurementEntry?) {
        clientEmail = mutation.clientEmail
        entryDate = mutation.entryDate
        bodyweight = mutation.bodyweight
        bodyfat = mutation.bodyfat
        muscleMass = mutation.muscleMass
        measurements = ClientMeasurementEntry.mergedMeasurements(mutation.measurements, preserving: existing)
        goalNote = mutation.goalNote
    }

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

struct ClientMeasurementSyncPayload: Encodable {
    let mutationID: UUID
    let clientEmail: String
    let entryDate: String
    let bodyweight: Double?
    let bodyfat: Double?
    let muscleMass: Double?
    let measurements: [String: AnyJSON]
    let goalNote: String
    let source = ContinuitySync.source
    let sourceVersion = ContinuitySync.sourceVersion
    let clientUpdatedAt: String

    init(_ mutation: PendingMeasurementMutation, preserving existing: ClientMeasurementEntry?) {
        mutationID = mutation.id
        clientEmail = mutation.clientEmail
        entryDate = mutation.entryDate
        bodyweight = mutation.bodyweight
        bodyfat = mutation.bodyfat
        muscleMass = mutation.muscleMass
        measurements = ClientMeasurementEntry.mergedMeasurements(mutation.measurements, preserving: existing)
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
            ErrorReporting.capture(error, operation: .loadClientStats)
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

        let mutation = PendingMeasurementMutation(
            clientEmail: normalizedEmail,
            entryDate: entryDate,
            bodyweight: draft.bodyweight ?? existing?.bodyweight,
            bodyfat: draft.bodyfat ?? existing?.bodyfat,
            muscleMass: draft.muscleMass ?? existing?.muscleMass,
            measurements: detailMeasurements,
            goalNote: draft.note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? (existing?.goalNote ?? "")
                : draft.note.trimmingCharacters(in: .whitespacesAndNewlines),
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
                ErrorReporting.capture(error, operation: .saveClientMeasurement)
                Self.logger.error("Measurement save failed: \(String(describing: error), privacy: .private)")
                message = "Your measurements could not be saved. Try again. If this continues, contact support."
                return false
            }

            do {
                try await ContinuityOutbox.shared.enqueue(mutation)
                let local = ClientMeasurementEntry(id: existing?.id ?? mutation.id, mutation: mutation, preserving: existing)
                measurements.removeAll { $0.id == local.id || $0.entryDate == local.entryDate }
                measurements.append(local)
                measurements.sort { $0.entryDate > $1.entryDate }
                message = "Measurements saved on this iPhone. They’ll sync when you’re back online."
                return true
            } catch {
                ErrorReporting.capture(error, operation: .saveClientMeasurementLocally)
                message = "Your measurements could not be secured on this iPhone. Try again."
                return false
            }
        }
    }

    private func loadMeasurements(email: String, entryDate: String? = nil) async throws -> [ClientMeasurementEntry] {
        if let measurementLoaderOverride {
            let rows = try await measurementLoaderOverride(email)
            return rows.filter { entryDate == nil || $0.entryDate == entryDate }
        }

        let request = client
            .from("client_progress")
            .select("id,client_email,entry_date,bodyweight,bodyfat,muscle_mass,lean_mass,measurements,goal_note,source,source_version,updated_at")
            .eq("client_email", value: email)
        // Saving an older date must still read its metadata even when it falls
        // outside the latest 365 records shown in Stats.
        if let entryDate {
            _ = request.eq("entry_date", value: entryDate)
        }
        return try await request
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
                    ErrorReporting.capture(error, operation: .signProgressPhotoURL)
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
            ErrorReporting.capture(error, operation: .loadProgressPhotos)
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
                ErrorReporting.capture(error, operation: .syncClientMeasurement)
                break
            }
        }
    }

    private func synchronizeMeasurement(_ mutation: PendingMeasurementMutation) async throws -> ClientMeasurementEntry? {
        if let measurementSynchronizerOverride {
            return try await measurementSynchronizerOverride(mutation)
        }

        let currentRows = try await loadMeasurements(email: mutation.clientEmail, entryDate: mutation.entryDate)
        let remote = currentRows.first(where: { $0.entryDate == mutation.entryDate })
        if let remoteUpdatedAt = remote?.updatedAt,
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
                .upsert(ClientMeasurementSyncPayload(mutation, preserving: remote), onConflict: "client_email,entry_date")
                .select("id,client_email,entry_date,bodyweight,bodyfat,muscle_mass,lean_mass,measurements,goal_note,source,source_version,updated_at")
                .single()
                .execute()
                .value
        } catch {
            let legacy = ClientMeasurementPayload(mutation, preserving: remote)
            saved = try await client
                .from("client_progress")
                .upsert(legacy, onConflict: "client_email,entry_date")
                .select("id,client_email,entry_date,bodyweight,bodyfat,muscle_mass,lean_mass,measurements,goal_note")
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

                let signedURL: URL?
                do {
                    signedURL = try await client.storage
                        .from(progressPhotosBucket)
                        .createSignedURL(path: path, expiresIn: 3_600)
                } catch {
                    ErrorReporting.capture(error, operation: .signProgressPhotoURL)
                    signedURL = nil
                }
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
            ErrorReporting.capture(error, operation: .uploadProgressPhoto)
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
    case dexa

    var id: String { rawValue }
}

private enum ClientStatsMetric: String, CaseIterable, Identifiable {
    case bodyweight
    case bodyfat
    case muscleMass
    case leanMass
    case waist
    case chest

    var id: String { rawValue }

    var title: String {
        switch self {
        case .bodyweight: "Body weight"
        case .bodyfat: "Body fat"
        case .muscleMass: "Muscle mass"
        case .leanMass: "DEXA lean mass"
        case .waist: "Waist"
        case .chest: "Chest"
        }
    }

    var shortTitle: String {
        switch self {
        case .bodyweight: "Weight"
        case .bodyfat: "Body fat"
        case .muscleMass: "Muscle"
        case .leanMass: "Lean mass"
        case .waist: "Waist"
        case .chest: "Chest"
        }
    }

    var unit: String {
        switch self {
        case .bodyweight, .muscleMass, .leanMass: "lb"
        case .bodyfat: "%"
        case .waist, .chest: "in"
        }
    }

    func value(in entry: ClientMeasurementEntry) -> Double? {
        switch self {
        case .bodyweight: entry.bodyweight
        case .bodyfat: entry.bodyfat
        case .muscleMass: entry.muscleMass
        case .leanMass: entry.leanMass
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
    @StateObject private var dexaStore: ClientDexaStore
    @State private var selectedMetric: ClientStatsMetric = .bodyweight
    @State private var presentedSheet: ClientStatsSheet?

    init(account: SignedInAccount) {
        self.account = account
        _store = StateObject(wrappedValue: ClientStatsStore())
        _dexaStore = StateObject(wrappedValue: ClientDexaStore(accountID: account.id, email: account.email))
    }

    init(account: SignedInAccount, store: ClientStatsStore, dexaStore: ClientDexaStore? = nil) {
        self.account = account
        _store = StateObject(wrappedValue: store)
        _dexaStore = StateObject(wrappedValue: dexaStore ?? ClientDexaStore(accountID: account.id, email: account.email))
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
                    FWBLoadingState(
                        title: "Loading your stats",
                        message: "Measurements and private progress records will appear here."
                    )
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
        .navigationTitle("Stats & measurements")
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

                    Button {
                        presentedSheet = .dexa
                    } label: {
                        Label("Upload DEXA scan", systemImage: "arrow.up.doc")
                    }
                } label: {
                    Image(systemName: "plus")
                        .font(FWBFont.headline.bold())
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
            case .dexa:
                ClientDexaReportsView(
                    store: dexaStore, measurementDates: Set(store.measurements.map(\.entryDate))
                ) {
                    await store.reload(email: account.email)
                }
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
            LazyVStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("CLIENT PROFILE")
                        .font(FWBFont.footnote.bold())
                        .tracking(1)
                        .foregroundStyle(Color.fwbMuted)
                    Text("Stats & measurements")
                        .font(FWBFont.title.weight(.bold))
                        .foregroundStyle(Color.fwbWarmWhite)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Track measurements, DEXA scans, and private progress photos over time.")
                        .font(FWBFont.subheadline)
                        .foregroundStyle(Color.fwbMuted)
                }

                if let message = store.message {
                    Text(message)
                        .font(FWBFont.footnote.weight(.semibold))
                        .foregroundStyle(statusColor(for: message))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 18))
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                        .overlay { RoundedRectangle(cornerRadius: 18).stroke(Color.fwbLine, lineWidth: 1) }
                }

                ClientDexaEntryCard { presentedSheet = .dexa }
                progressPhotosSection
                measurementChartSection
                measurementHistorySection
            }
            .padding(16)
        }
        .refreshable {
            await store.reload(email: account.email)
        }
    }

    private var progressPhotosSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                SectionHeading(kicker: "PRIVATE", title: "Progress photos")
                Spacer()
                Button("Add photo") {
                    presentedSheet = .photo
                }
                .font(FWBFont.footnote.weight(.semibold))
                .foregroundStyle(Color.fwbLime)
            }

            if let photoLoadError = store.photoLoadError {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(Color.fwbRed)
                    Text(photoLoadError)
                        .font(FWBFont.footnote.weight(.semibold))
                        .foregroundStyle(Color.fwbMuted)
                    Spacer(minLength: 8)
                    Button("Retry") {
                        Task { await store.reload(email: account.email) }
                    }
                    .font(FWBFont.footnote.weight(.semibold))
                    .foregroundStyle(Color.fwbLime)
                }
                .padding(12)
                .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 18))
                .overlay { RoundedRectangle(cornerRadius: 18).stroke(Color.fwbLine, lineWidth: 1) }
            }

            if store.photos.isEmpty {
                if store.photoLoadError == nil {
                    Button {
                        presentedSheet = .photo
                    } label: {
                        VStack(spacing: 12) {
                            Image(systemName: "photo.badge.plus")
                                .font(.system(size: 30, weight: .semibold))
                            Text("Add your first progress photo")
                                .font(FWBFont.subheadline.weight(.semibold))
                            Text("Photos are private and visible only to your authenticated account and coach.")
                                .font(FWBFont.footnote)
                                .foregroundStyle(Color.fwbMuted)
                                .multilineTextAlignment(.center)
                        }
                        .foregroundStyle(Color.fwbLime)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 26)
                        .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 18))
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                        .overlay { RoundedRectangle(cornerRadius: 18).stroke(Color.fwbLine, lineWidth: 1) }
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
                SectionHeading(kicker: "TRENDS", title: selectedMetric.title)
                Spacer()
                Button("Add measurements") {
                    presentedSheet = .measurement
                }
                .font(FWBFont.footnote.weight(.semibold))
                .foregroundStyle(Color.fwbLime)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(ClientStatsMetric.allCases) { metric in
                        Button(metric.shortTitle) {
                            selectedMetric = metric
                        }
                        .font(FWBFont.footnote.weight(.bold))
                        .foregroundStyle(selectedMetric == metric ? Color.black : Color.fwbWarmWhite)
                        .padding(.horizontal, 13)
                        .padding(.vertical, 8)
                        .frame(minHeight: 44)
                        .background(selectedMetric == metric ? Color.fwbAccentFill : Color.fwbCard, in: RoundedRectangle(cornerRadius: 12))
                        .overlay { RoundedRectangle(cornerRadius: 12).stroke(selectedMetric == metric ? Color.fwbAccentFill : Color.fwbLine, lineWidth: 1) }
                    }
                }
            }

            if chartPoints.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "chart.xyaxis.line")
                        .font(FWBFont.title)
                        .foregroundStyle(Color.fwbLime)
                    Text("No \(selectedMetric.title.lowercased()) entries yet")
                        .font(FWBFont.subheadline.weight(.bold))
                    Text("Log a measurement to start your trend line.")
                        .font(FWBFont.footnote)
                        .foregroundStyle(Color.fwbMuted)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 190)
                .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 18))
                .overlay { RoundedRectangle(cornerRadius: 18).stroke(Color.fwbLine, lineWidth: 1) }
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    if let latest = chartPoints.last {
                        HStack(alignment: .firstTextBaseline, spacing: 5) {
                            Text(latest.value.formatted(.number.precision(.fractionLength(0...1))))
                                .font(.system(size: 32, weight: .bold))
                            Text(selectedMetric.unit)
                                .font(FWBFont.subheadline.weight(.bold))
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
                .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 18))
                .overlay { RoundedRectangle(cornerRadius: 18).stroke(Color.fwbLine, lineWidth: 1) }
            }
        }
    }

    private var measurementHistorySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading(kicker: "LATEST", title: "Measurement history")

            if store.measurements.isEmpty {
                Text("Your saved measurements will appear here.")
                    .font(FWBFont.subheadline)
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
                .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 18))
                .overlay { RoundedRectangle(cornerRadius: 18).stroke(Color.fwbLine, lineWidth: 1) }
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
                    .font(FWBFont.footnote.weight(.semibold))
                    .foregroundStyle(.white)
                if !photo.record.note.isEmpty {
                    Text(photo.record.note)
                        .font(FWBFont.footnote)
                        .foregroundStyle(Color.white.opacity(0.78))
                        .lineLimit(2)
                }
            }
            .padding(12)
        }
        .frame(width: 164, height: 220)
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay { RoundedRectangle(cornerRadius: 18).stroke(Color.fwbLine, lineWidth: 1) }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Progress photo from \(photo.record.capturedOn)")
    }

    private func photoPlaceholder(systemName: String) -> some View {
        ZStack {
            Color.fwbSurface
            Image(systemName: systemName)
                .font(FWBFont.title)
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
        if let value = entry.leanMass { parts.append("\(value.formatted(.number.precision(.fractionLength(0...1)))) lb lean mass") }
        if let value = entry.measurements["waist"] { parts.append("\(value.formatted(.number.precision(.fractionLength(0...1)))) in waist") }
        return parts.isEmpty ? "Detailed measurements saved" : parts.joined(separator: "  •  ")
    }

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "ruler")
                .font(FWBFont.headline)
                .foregroundStyle(Color.fwbLime)
                .frame(width: 30)

            VStack(alignment: .leading, spacing: 4) {
                Text(ClientStatsStore.apiDateFormatter.date(from: entry.entryDate)?.formatted(date: .abbreviated, time: .omitted) ?? entry.entryDate)
                    .font(FWBFont.subheadline.weight(.bold))
                    .foregroundStyle(Color.fwbWarmWhite)
                Text(summary)
                    .font(FWBFont.footnote)
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
                        .font(FWBFont.footnote.bold())
                        .tracking(1.3)
                        .foregroundStyle(Color.fwbLime)
                    Text("Add measurements")
                        .font(FWBFont.title.weight(.bold))
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
                            .font(FWBFont.footnote.weight(.semibold))
                            .foregroundStyle(Color.fwbMuted)
                        TextField("Optional progress note", text: $note, axis: .vertical)
                            .lineLimit(2...5)
                            .padding(14)
                            .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 12))
                            .overlay { RoundedRectangle(cornerRadius: 12).stroke(Color.fwbLine, lineWidth: 1) }
                            .accessibilityLabel("Progress note")
                            .accessibilityIdentifier("stats.measurement.note")
                    }

                if let message = store.message, message.contains("Enter at least") || message.contains("could not") {
                    Text(message)
                        .font(FWBFont.footnote.weight(.semibold))
                        .foregroundStyle(Color.fwbRed)
                }

                    Button {
                        save()
                    } label: {
                        if store.isSavingMeasurement {
                            ProgressView().tint(.black)
                        } else {
                            Label("Save measurements", systemImage: "checkmark")
                        }
                    }
                    .buttonStyle(FWBPrimaryButtonStyle())
                    .disabled(store.isSavingMeasurement)
                }
                .padding(16)
            }
            .background(Color.fwbBackground)
            .navigationTitle("Add measurements")
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
                .accessibilityLabel("\(title), \(unit)")
                .accessibilityIdentifier(
                    "stats.measurement.\(title.lowercased().replacingOccurrences(of: " ", with: "-"))"
                )
            Text(unit)
                .font(FWBFont.footnote.weight(.bold))
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
                .font(FWBFont.footnote.weight(.semibold))
                .foregroundStyle(Color.fwbMuted)
            content()
                .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 18))
                .overlay { RoundedRectangle(cornerRadius: 18).stroke(Color.fwbLine, lineWidth: 1) }
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
                        .font(FWBFont.footnote.bold())
                        .tracking(1.3)
                        .foregroundStyle(Color.fwbLime)
                    Text("Add a private progress photo")
                        .font(FWBFont.title.weight(.bold))
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
                                    Text("Choose photo")
                                        .font(FWBFont.headline.weight(.semibold))
                                    Text("Select a front, side, or back progress photo from your library.")
                                        .font(FWBFont.footnote)
                                        .foregroundStyle(Color.fwbMuted)
                                        .multilineTextAlignment(.center)
                                }
                                .foregroundStyle(Color.fwbLime)
                                .frame(maxWidth: .infinity)
                                .frame(height: 230)
                            }
                        }
                        .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 18))
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                        .overlay { RoundedRectangle(cornerRadius: 18).stroke(Color.fwbLine, lineWidth: 1) }
                    }
                    .buttonStyle(.plain)

                    VStack(alignment: .leading, spacing: 8) {
                        Text("PHOTO DATE")
                            .font(FWBFont.footnote.weight(.semibold))
                            .foregroundStyle(Color.fwbMuted)
                        DatePicker("Photo date", selection: $capturedOn, in: ...Date(), displayedComponents: .date)
                            .labelsHidden()
                            .datePickerStyle(.compact)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("NOTE")
                            .font(FWBFont.footnote.weight(.semibold))
                            .foregroundStyle(Color.fwbMuted)
                        TextField("Optional: front, side, week 4…", text: $note, axis: .vertical)
                            .lineLimit(2...4)
                            .padding(14)
                            .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 12))
                            .overlay { RoundedRectangle(cornerRadius: 12).stroke(Color.fwbLine, lineWidth: 1) }
                    }

                    if let message = localMessage ?? (store.message?.contains("could not") == true ? store.message : nil) {
                        Text(message)
                            .font(FWBFont.footnote.weight(.semibold))
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
                            Label("Add progress photo", systemImage: "lock.fill")
                        }
                    }
                    .buttonStyle(FWBPrimaryButtonStyle())
                    .disabled(store.isUploadingPhoto)

                    Label("Stored privately. Photos use short-lived secure links inside the app.", systemImage: "lock.shield.fill")
                        .font(FWBFont.footnote)
                        .foregroundStyle(Color.fwbMuted)
                }
                .padding(16)
            }
            .background(Color.fwbBackground)
            .navigationTitle("Add photo")
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
                .font(FWBFont.largeTitle)
                .foregroundStyle(accentColor)
            Text(message)
                .font(FWBFont.subheadline)
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
            ClientStatsView(
                account: account, store: store,
                dexaStore: ClientDexaStore(accountID: account.id, email: account.email, repository: ClientDexaAuditRepository())
            )
        }
    }
}
#endif
