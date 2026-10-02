import Foundation
import CryptoKit
import Supabase

struct ClientDexaIdentity {
    let accountID: UUID
    let email: String
}

@MainActor
protocol ClientDexaRepository {
    func loadReports(accountID: UUID, email: String) async throws -> [ClientDexaReport]
    func upload(upload: ClientDexaUpload, path: String, accountID: UUID, email: String) async throws
    func extract(path: String, filename: String, accountID: UUID, email: String) async throws -> ClientDexaExtractionResult
    func confirm(report: ClientDexaReport, values: ClientDexaReviewValues, accountID: UUID, email: String) async throws
    func setArchived(report: ClientDexaReport, archived: Bool, accountID: UUID, email: String) async throws
    func signedURL(report: ClientDexaReport, accountID: UUID, email: String) async throws -> URL
}

private enum ClientDexaServiceError: LocalizedError {
    case differentAccount, invalidPath, notConfirmed, invalidState, service(Int)

    var errorDescription: String? {
        switch self {
        case .differentAccount: "Your account changed. Close this screen, sign in again, and try again."
        case .invalidPath: "This private report is not available for your account."
        case .notConfirmed: "The server could not confirm the change. Refresh and try again."
        case .invalidState: "Refresh your reports before trying this action again."
        case .service(409): "This report is still being read. Wait a moment, then refresh and try again."
        case .service(429): "This report has reached its extraction limit. Add the values manually in Stats or contact support."
        case .service(422): "The report could not be read automatically. Your private upload is still saved. Try a clearer report or add its measurements in Stats."
        case .service(503): "Automatic report reading is temporarily unavailable. Your private upload is still saved. Try again later."
        case .service: "The report request could not be completed. Check your connection and try again."
        }
    }
}

/// Uses the same private Storage bucket and Edge Function as the web app.
/// The function owns report creation and all measurement merges; the app never
/// writes extracted measurements directly to client_progress.
@MainActor
final class SupabaseClientDexaRepository: ClientDexaRepository {
    private let client: SupabaseClient
    private let identity: (@MainActor () async throws -> ClientDexaIdentity)?
    private let bucket = "dexa-reports"

    init(client: SupabaseClient = AppConfiguration.supabase,
         identity: (@MainActor () async throws -> ClientDexaIdentity)? = nil) {
        self.client = client
        self.identity = identity
    }

    func loadReports(accountID: UUID, email: String) async throws -> [ClientDexaReport] {
        try await verify(accountID: accountID, email: email)
        return try await client.from("client_dexa_reports")
            .select("id,storage_path,original_filename,mime_type,status,extracted_scan_date,extracted_bodyweight_lb,extracted_bodyfat_percent,extracted_lean_mass_lb,extraction_data,extraction_warnings,archived_at,created_at")
            .eq("owner_user_id", value: accountID.uuidString.lowercased())
            .ilike("client_email", pattern: normalized(email))
            .order("created_at", ascending: false)
            .execute().value
    }

    func upload(upload: ClientDexaUpload, path: String, accountID: UUID, email: String) async throws {
        let upload = try upload.validated()
        try await verify(accountID: accountID, email: email, path: path)
        guard path.hasSuffix(".\(upload.fileExtension)") else { throw ClientDexaServiceError.invalidPath }
        try await client.storage.from(bucket).upload(path, data: upload.data,
            options: FileOptions(cacheControl: "3600", contentType: upload.mimeType, upsert: false))
    }

    func extract(path: String, filename: String, accountID: UUID, email: String) async throws -> ClientDexaExtractionResult {
        try await verify(accountID: accountID, email: email, path: path)
        let body: [String: AnyJSON] = ["action": .string("extract"), "storage_path": .string(path),
                                        "original_filename": .string(String(filename.prefix(255)))]
        do {
            return try await client.functions.invoke("extract-dexa-report",
                options: FunctionInvokeOptions(body: body, timeoutInterval: 90))
        } catch FunctionsError.httpError(let code, _) {
            throw ClientDexaServiceError.service(code)
        }
    }

    func confirm(report: ClientDexaReport, values: ClientDexaReviewValues, accountID: UUID, email: String) async throws {
        try await verify(accountID: accountID, email: email, path: report.storagePath)
        guard !report.isArchived, ["ready", "confirmed"].contains(report.status) else { throw ClientDexaServiceError.invalidState }
        // Validate again at the request boundary, including callers outside the UI.
        let checked = try ClientDexaReviewDraft(scanDate: values.scanDate, values: values.values.mapValues { String($0) }).validatedValues()
        struct Body: Encodable {
            let action = "confirm"
            let report_id: UUID
            let values: ClientDexaReviewValues
        }
        let result = try await invoke(Body(report_id: report.id, values: checked))
        guard result["report_id"]?.stringValue.flatMap(UUID.init(uuidString:)) == report.id,
              result["status"]?.stringValue == "confirmed" else { throw ClientDexaServiceError.notConfirmed }
    }

    func setArchived(report: ClientDexaReport, archived: Bool, accountID: UUID, email: String) async throws {
        try await verify(accountID: accountID, email: email, path: report.storagePath)
        let body: [String: AnyJSON] = ["action": .string("archive"), "report_id": .string(report.id.uuidString.lowercased()), "archived": .bool(archived)]
        let result = try await invoke(body)
        guard result["report_id"]?.stringValue.flatMap(UUID.init(uuidString:)) == report.id,
              result["archived"]?.boolValue == archived else { throw ClientDexaServiceError.notConfirmed }
    }

    func signedURL(report: ClientDexaReport, accountID: UUID, email: String) async throws -> URL {
        try await verify(accountID: accountID, email: email, path: report.storagePath)
        return try await client.storage.from(bucket).createSignedURL(path: report.storagePath, expiresIn: 300)
    }

    private func invoke(_ body: some Encodable) async throws -> [String: AnyJSON] {
        do {
            let result: [String: AnyJSON] = try await client.functions.invoke("extract-dexa-report",
                options: FunctionInvokeOptions(body: body, timeoutInterval: 30))
            guard result["error"]?.stringValue == nil else { throw ClientDexaServiceError.notConfirmed }
            return result
        } catch FunctionsError.httpError(let code, _) {
            throw ClientDexaServiceError.service(code)
        }
    }

    private func normalized(_ email: String) -> String {
        email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func verify(accountID: UUID, email: String, path: String? = nil) async throws {
        if let path, !ClientDexaUpload.isOwnedPath(path, accountID: accountID) { throw ClientDexaServiceError.invalidPath }
        let current: ClientDexaIdentity
        if let identity {
            current = try await identity()
        } else {
            let user = try await client.auth.user()
            current = ClientDexaIdentity(accountID: user.id, email: user.email ?? "")
        }
        guard current.accountID == accountID, !normalized(email).isEmpty,
              normalized(current.email) == normalized(email) else { throw ClientDexaServiceError.differentAccount }
    }
}

@MainActor
final class ClientDexaStore: ObservableObject {
    @Published private(set) var reports: [ClientDexaReport] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isWorking = false
    @Published private(set) var lastUploadWasSaved = false
    @Published var statusMessage: String?
    @Published var errorMessage: String?

    private let accountID: UUID
    private let email: String
    private let repository: any ClientDexaRepository
    // Retain a retry/view entry even if a network failure happens before the
    // function creates its database row. Never delete a completed private upload
    // just because extraction failed or its response was lost.
    private var pendingUploads: [String: ClientDexaReport] = [:]
    private var uploadedPathsByDigest: [String: String] = [:]
    private var loadGeneration = 0

    init(accountID: UUID, email: String, repository: (any ClientDexaRepository)? = nil) {
        self.accountID = accountID
        self.email = email
        self.repository = repository ?? SupabaseClientDexaRepository()
    }

    func load() async {
        guard !isWorking else { return }
        loadGeneration += 1
        let generation = loadGeneration
        isLoading = true
        errorMessage = nil
        defer { if loadGeneration == generation { isLoading = false } }
        do {
            let loaded = try await repository.loadReports(accountID: accountID, email: email)
            guard generation == loadGeneration else { return }
            accept(loaded)
        } catch {
            guard generation == loadGeneration else { return }
            report(error, operation: .loadDexaReports, fallback: "Your DEXA reports could not be loaded. Check your connection and try again.")
        }
    }

    func upload(_ upload: ClientDexaUpload) async -> ClientDexaReport? {
        guard !isWorking else { return nil }
        lastUploadWasSaved = false
        let checked: ClientDexaUpload
        do { checked = try upload.validated() }
        catch { errorMessage = error.localizedDescription; return nil }
        beginWork()
        defer { isWorking = false }
        let digest = SHA256.hash(data: checked.data).map { String(format: "%02x", $0) }.joined()
        if let uploadedPath = uploadedPathsByDigest[digest] {
            lastUploadWasSaved = true
            if let existing = reports.first(where: { $0.storagePath == uploadedPath }), existing.isArchived {
                statusMessage = "This report is already uploaded. Restore it from Archived reports to review it."
                return nil
            }
            statusMessage = "Your report is already uploaded. Reading the scan values…"
            return await extractUploaded(path: uploadedPath, filename: checked.filename, mimeType: checked.mimeType)
        }
        statusMessage = "Uploading your private DEXA report…"
        let temporaryID = UUID()
        let path = checked.storagePath(accountID: accountID, reportID: temporaryID)
        do {
            try await repository.upload(upload: checked, path: path, accountID: accountID, email: email)
        } catch {
            report(error, operation: .uploadDexaReport, fallback: "Your DEXA report could not be uploaded. Check your connection and try again.")
            return nil
        }
        lastUploadWasSaved = true
        uploadedPathsByDigest[digest] = path
        pendingUploads[path] = ClientDexaReport(id: temporaryID, storagePath: path,
            originalFilename: checked.filename, mimeType: checked.mimeType, status: "failed",
            createdAt: ISO8601DateFormatter().string(from: Date()))
        statusMessage = "Report uploaded. Reading the scan values…"
        return await extractUploaded(path: path, filename: checked.filename, mimeType: checked.mimeType)
    }

    func upload(data: Data, filename: String, mimeType: String) async -> ClientDexaReport? {
        await upload(ClientDexaUpload(data: data, mimeType: mimeType, filename: filename))
    }

    func extract(_ report: ClientDexaReport) async -> ClientDexaReport? {
        guard !isWorking, !report.isArchived else { return nil }
        beginWork()
        defer { isWorking = false }
        statusMessage = "Reading the report again…"
        return await extractUploaded(path: report.storagePath, filename: report.originalFilename, mimeType: report.mimeType)
    }

    func confirm(_ report: ClientDexaReport, draft: ClientDexaReviewDraft) async -> Bool {
        guard !isWorking else { return false }
        let reviewed: ClientDexaReviewValues
        do { reviewed = try draft.validatedValues() }
        catch { errorMessage = error.localizedDescription; return false }
        beginWork()
        defer { isWorking = false }
        statusMessage = "Saving your reviewed DEXA measurements…"
        do {
            try await repository.confirm(report: report, values: reviewed, accountID: accountID, email: email)
            pendingUploads[report.storagePath] = ClientDexaReport(id: report.id,
                storagePath: report.storagePath, originalFilename: report.originalFilename,
                mimeType: report.mimeType, status: "confirmed", scanDate: reviewed.scanDate,
                createdAt: report.createdAt, archivedAt: report.archivedAt,
                warnings: report.warnings, values: reviewed.values)
            let refreshed = await refreshAfterAction()
            statusMessage = refreshed ? "Reviewed DEXA measurements saved to your progress log."
                : "Measurements saved. Refresh to update your report history."
            return true
        } catch {
            reportFailure(error, operation: .confirmDexaReport, fallback: "The reviewed measurements could not be confirmed. Try again; already saved measurements will be preserved.")
            await refreshAfterAction()
            return false
        }
    }

    func setArchived(_ report: ClientDexaReport, archived: Bool) async -> Bool {
        guard !isWorking else { return false }
        beginWork()
        defer { isWorking = false }
        do {
            try await repository.setArchived(report: report, archived: archived, accountID: accountID, email: email)
            pendingUploads[report.storagePath] = ClientDexaReport(id: report.id,
                storagePath: report.storagePath, originalFilename: report.originalFilename,
                mimeType: report.mimeType, status: report.status, scanDate: report.scanDate,
                createdAt: report.createdAt,
                archivedAt: archived ? ISO8601DateFormatter().string(from: Date()) : nil,
                warnings: report.warnings, values: report.values)
            let refreshed = await refreshAfterAction()
            statusMessage = refreshed
                ? (archived ? "Report archived. Its saved measurements were not changed." : "Report restored to Uploaded reports.")
                : "Report updated. Refresh to update your report history."
            return true
        } catch {
            reportFailure(error, operation: .updateDexaReport, fallback: "The report could not be updated. Check your connection and try again.")
            return false
        }
    }

    func signedURL(for report: ClientDexaReport) async -> URL? {
        guard !isWorking else { return nil }
        beginWork()
        defer { isWorking = false }
        do {
            return try await repository.signedURL(report: report, accountID: accountID, email: email)
        } catch {
            reportFailure(error, operation: .signDexaReportURL, fallback: "The private report could not be opened. Check your connection and try again.")
            return nil
        }
    }

    private func extractUploaded(path: String, filename: String, mimeType: String) async -> ClientDexaReport? {
        do {
            let result = try await repository.extract(path: path, filename: filename, accountID: accountID, email: email)
            let report = ClientDexaReport(id: result.reportID, storagePath: path, originalFilename: filename,
                mimeType: mimeType, status: result.status, scanDate: result.scanDate,
                createdAt: ISO8601DateFormatter().string(from: Date()), warnings: result.warnings, values: result.values)
            pendingUploads[path] = report
            await refreshAfterAction()
            statusMessage = result.status == "confirmed" ? "This report's measurements are already saved."
                : "Report read. Compare every extracted value with the original before saving."
            return reports.first { $0.id == result.reportID } ?? report
        } catch {
            await refreshAfterAction()
            report(error, operation: .extractDexaReport, fallback: "Your private upload is saved, but automatic extraction could not finish. Try extraction again from Uploaded reports.")
            return nil
        }
    }

    private func beginWork() {
        loadGeneration += 1
        isLoading = false
        isWorking = true
        errorMessage = nil
        statusMessage = nil
    }

    @discardableResult
    private func refreshAfterAction() async -> Bool {
        do {
            accept(try await repository.loadReports(accountID: accountID, email: email))
            return true
        } catch {
            // Preserve known reports, including the retained upload, if refresh
            // fails after a successful operation.
            reports = reports.map { pendingUploads[$0.storagePath] ?? $0 }
            let knownPaths = Set(reports.map(\.storagePath))
            reports.insert(contentsOf: pendingUploads.values.filter { !knownPaths.contains($0.storagePath) }, at: 0)
            ErrorReporting.capture(error, operation: .loadDexaReports)
            return false
        }
    }

    private func accept(_ loaded: [ClientDexaReport]) {
        let paths = Set(loaded.map(\.storagePath))
        pendingUploads = pendingUploads.filter { !paths.contains($0.key) }
        reports = Array(pendingUploads.values).sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") } + loaded
    }

    private func report(_ error: Error, operation: ErrorReporting.Operation, fallback: String) {
        reportFailure(error, operation: operation, fallback: fallback)
    }

    private func reportFailure(_ error: Error, operation: ErrorReporting.Operation, fallback: String) {
        statusMessage = nil
        errorMessage = (error as? ClientDexaServiceError)?.errorDescription ?? fallback
        ErrorReporting.capture(error, operation: operation)
    }
}
