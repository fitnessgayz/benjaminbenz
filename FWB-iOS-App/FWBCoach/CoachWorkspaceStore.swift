import Foundation
import Combine
import Supabase

/// Preserve the complete server document when a coach edits only part of a program.
typealias CoachJSON = WorkoutLayoutJSON
typealias CoachJSONObject = [String: CoachJSON]

extension WorkoutLayoutJSON {
    var stringValue: String {
        switch self {
        case .string(let value): return value
        case .number(let value): return value.isFinite && value.rounded() == value ? String(format: "%.0f", value) : String(value)
        case .bool(let value): return value ? "true" : "false"
        default: return ""
        }
    }
    var doubleValue: Double? {
        switch self { case .number(let value): return value.isFinite ? value : nil
        case .string(let value): return Double(value).flatMap { $0.isFinite ? $0 : nil }
        default: return nil }
    }
    var intValue: Int? {
        guard let value = doubleValue, value >= Double(Int.min), value < Double(Int.max) else { return nil }
        return Int(value)
    }
    var boolValue: Bool? { if case .bool(let value) = self { return value }; return nil }
    var arrayValue: [CoachJSON] { if case .array(let value) = self { return value }; return [] }
    var objectValue: CoachJSONObject { if case .object(let value) = self { return value }; return [:] }
}

extension Dictionary where Key == String, Value == CoachJSON {
    func string(_ key: String) -> String { self[key]?.stringValue ?? "" }
    func int(_ key: String) -> Int { self[key]?.intValue ?? 0 }
    func double(_ key: String) -> Double? { self[key]?.doubleValue }
    func bool(_ key: String, default fallback: Bool = false) -> Bool { self[key]?.boolValue ?? fallback }
    func array(_ key: String) -> [CoachJSON] { self[key]?.arrayValue ?? [] }
    func object(_ key: String) -> CoachJSONObject { self[key]?.objectValue ?? [:] }
}

struct CoachClientProgram: Identifiable, Equatable {
    var raw: CoachJSONObject
    /// Immutable snapshot survives value-type edits and detects known stale writes.
    let originalRaw: CoachJSONObject
    private let draftID: UUID

    init(raw: CoachJSONObject) {
        self.raw = raw
        originalRaw = raw
        draftID = UUID()
    }

    var id: UUID { UUID(uuidString: raw.string("id")) ?? draftID }
    var isPersisted: Bool { UUID(uuidString: raw.string("id")) != nil }
    var email: String { ContinuitySync.normalize(email: raw.string("client_email")) }
    var name: String { raw.string("client_name").isEmpty ? email : raw.string("client_name") }
    var programTitle: String { raw.string("program_title").isEmpty ? "Client Program" : raw.string("program_title") }
    var isArchived: Bool { raw.bool("client_archived") }
    var isActive: Bool { raw.bool("active", default: true) }
    var sessionRemaining: Int { max(0, raw.int("session_count_total") - raw.int("session_count_used")) }
    subscript(key: String) -> CoachJSON {
        get { raw[key] ?? .null }
        set { raw[key] = newValue }
    }
    func text(_ key: String) -> String { raw.string(key) }
    mutating func setText(_ key: String, _ value: String) { raw[key] = .string(value) }
    var clientProgram: ClientProgram? {
        guard let data = try? JSONEncoder().encode(raw) else { return nil }
        return try? JSONDecoder().decode(ClientProgram.self, from: data)
    }

    static let profileKeys = ["client_email", "client_name", "client_phone", "initials", "height", "starting_weight", "starting_bodyfat", "session_count_used", "session_count_total", "session_dates", "session_package_history", "sheet_url", "nutrition_plan", "client_archived"]
    static let readonlyKeys = ["id", "created_at", "updated_at", "client_workout_layout", "sync_source", "source_version"]

    static func newClient(email: String, name: String) -> CoachClientProgram {
        CoachClientProgram(raw: [
            "client_email": .string(ContinuitySync.normalize(email: email)), "client_name": .string(name),
            "program_title": .string("Client Program"), "program_summary": .string(""),
            "active": .bool(true), "client_archived": .bool(false), "workouts": .array([]),
            "session_count_used": .number(0), "session_count_total": .number(0),
            "session_dates": .array([]), "session_package_history": .array([]), "nutrition_plan": .object([:])
        ])
    }

    /// New training block, keeping the client's profile and package information.
    func newBlock() -> CoachClientProgram {
        var fields = raw
        for key in Self.readonlyKeys { fields.removeValue(forKey: key) }
        fields["program_title"] = .string("New Training Block")
        fields["program_summary"] = .string("")
        fields["workouts"] = .array([])
        fields["active"] = .bool(true)
        return CoachClientProgram(raw: fields)
    }

    /// Copy training content into a new block for the target, retaining their profile.
    func copied(to client: CoachClientProgram) -> CoachClientProgram {
        var fields = raw
        for key in Self.readonlyKeys + Self.profileKeys { fields.removeValue(forKey: key) }
        for key in Self.profileKeys { fields[key] = client.raw[key] }
        fields["active"] = .bool(true)
        return CoachClientProgram(raw: fields)
    }
}

struct CoachWorkspaceError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// Injectable transport keeps tests independent of live clients and outbound email.
@MainActor
protocol CoachWorkspaceBackend {
    func select(table: String, filters: [String: String], order: String, ascending: Bool, offset: Int, limit: Int) async throws -> [CoachJSONObject]
    func invoke(_ function: String, body: CoachJSONObject) async throws -> CoachJSONObject
    func write(table: String, values: CoachJSONObject, id: String?, onConflict: String?) async throws -> CoachJSONObject
    func delete(table: String, id: String) async throws
    func rpc(_ function: String, params: CoachJSONObject) async throws -> Int
    func uploadVideo(path: String, data: Data, contentType: String) async throws -> URL
    func signedURL(bucket: String, path: String) async throws -> URL
}

@MainActor
final class SupabaseCoachWorkspaceBackend: CoachWorkspaceBackend {
    private let client: SupabaseClient
    init(client: SupabaseClient = AppConfiguration.supabase) { self.client = client }

    func select(table: String, filters: [String: String], order: String, ascending: Bool, offset: Int, limit: Int) async throws -> [CoachJSONObject] {
        var query = client.from(table).select()
        for (key, value) in filters {
            if key.hasSuffix(".gte") { query = query.gte(String(key.dropLast(4)), value: value) }
            else { query = query.eq(key, value: value) }
        }
        if table == "client_workout_logs", filters["entry_date.gte"] != nil {
            query = query.not("completed_at", operator: .is, value: "null")
        }
        return try await query.order(order, ascending: ascending).order("id", ascending: true)
            .range(from: offset, to: offset + limit - 1).execute().value
    }
    func invoke(_ function: String, body: CoachJSONObject) async throws -> CoachJSONObject {
        do {
            return try await client.functions.invoke(function, options: FunctionInvokeOptions(body: body, timeoutInterval: 90))
        } catch FunctionsError.httpError(_, let data) {
            let response = try? JSONDecoder().decode(CoachJSONObject.self, from: data)
            throw CoachWorkspaceError(message: response?.string("error").nonempty ?? response?.string("message").nonempty ?? "The coach request failed. Try again.")
        }
    }
    func write(table: String, values: CoachJSONObject, id: String?, onConflict: String?) async throws -> CoachJSONObject {
        if let id {
            return try await client.from(table).update(values).eq("id", value: id).select().single().execute().value
        }
        if let onConflict {
            return try await client.from(table).upsert(values, onConflict: onConflict).select().single().execute().value
        }
        return try await client.from(table).insert(values).select().single().execute().value
    }
    func delete(table: String, id: String) async throws {
        try await client.from(table).delete().eq("id", value: id).execute()
    }
    func rpc(_ function: String, params: CoachJSONObject) async throws -> Int {
        try await client.rpc(function, params: params).execute().value
    }
    func uploadVideo(path: String, data: Data, contentType: String) async throws -> URL {
        _ = try await client.storage.from("exercise-videos").upload(path, data: data,
            options: FileOptions(cacheControl: "3600", contentType: contentType, upsert: false))
        return try client.storage.from("exercise-videos").getPublicURL(path: path)
    }
    func signedURL(bucket: String, path: String) async throws -> URL {
        try await client.storage.from(bucket).createSignedURL(path: path, expiresIn: 300)
    }
}

private extension String { var nonempty: String? { isEmpty ? nil : self } }

@MainActor
final class CoachWorkspaceStore: ObservableObject {
    @Published private(set) var programs: [CoachClientProgram] = []
    @Published private(set) var library: [CoachJSONObject] = []
    @Published private(set) var recentLogs: [CoachJSONObject] = []
    @Published private(set) var calendarEvents: [CoachJSONObject] = []
    @Published private(set) var questionnaires: [CoachJSONObject] = []
    @Published var selectedProgramID: UUID? {
        didSet { if oldValue != selectedProgramID { clearDetails() } }
    }
    @Published private(set) var progress: [CoachJSONObject] = []
    @Published private(set) var foodLogs: [CoachJSONObject] = []
    @Published private(set) var photos: [CoachJSONObject] = []
    @Published private(set) var dexaReports: [CoachJSONObject] = []
    @Published private(set) var logs: [CoachJSONObject] = []
    @Published private(set) var isLoading = false
    @Published private(set) var isLoadingDetails = false
    @Published private(set) var isSaving = false
    @Published var errorMessage: String?
    @Published var statusMessage: String?
    @Published private(set) var detailErrors: [String: String] = [:]
    @Published private(set) var calendarError: String?
    @Published private(set) var libraryError: String?
    @Published private(set) var recentLogsError: String?
    @Published private(set) var questionnairesError: String?
    private let backend: (any CoachWorkspaceBackend)?
    private var detailRequest = UUID()
    private var reloadRequest = UUID()
    private var calendarRequest = UUID()

    init() { backend = SupabaseCoachWorkspaceBackend() }
    init(backend: any CoachWorkspaceBackend) { self.backend = backend }
    init(previewPrograms: [CoachClientProgram], library: [CoachJSONObject] = [], recentLogs: [CoachJSONObject] = []) {
        backend = nil
        programs = previewPrograms
        self.library = library
        self.recentLogs = recentLogs
        selectedProgramID = previewPrograms.first?.id
    }
    var selectedProgram: CoachClientProgram? { programs.first { $0.id == selectedProgramID } }
    var isPreview: Bool { backend == nil }
    func selectProgram(_ id: UUID) { selectedProgramID = id }
    func programs(for email: String) -> [CoachClientProgram] {
        programs.filter { $0.email == ContinuitySync.normalize(email: email) }.sorted(by: Self.preferProgram)
    }
    func clientPrograms(archived: Bool) -> [CoachClientProgram] {
        let rows = programs.filter { $0.isArchived == archived }.sorted(by: Self.preferProgram)
        var emails = Set<String>()
        return rows.filter { emails.insert($0.email).inserted }.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
    private static func preferProgram(_ lhs: CoachClientProgram, _ rhs: CoachClientProgram) -> Bool {
        if lhs.isActive != rhs.isActive { return lhs.isActive }
        if lhs.raw.string("updated_at") != rhs.raw.string("updated_at") { return lhs.raw.string("updated_at") > rhs.raw.string("updated_at") }
        return lhs.id.uuidString < rhs.id.uuidString
    }

    func load() async { await reload() }
    func reload() async {
        guard backend != nil else { return }
        let request = UUID(); reloadRequest = request
        isLoading = true; errorMessage = nil
        defer { if request == reloadRequest { isLoading = false } }
        async let programResult = fetchResult(table: "client_programs", order: "updated_at")
        async let libraryResult = fetchResult(table: "exercise_library", order: "sort_order", ascending: true)
        let recentStart = String(ContinuityDateCoding.string(from: Date().addingTimeInterval(-15 * 86400)).prefix(10))
        async let recentResult = fetchResult(table: "client_workout_logs", filters: ["entry_date.gte": recentStart], order: "entry_date")
        async let questionnaireResult = fetchResult(table: "client_fitness_questionnaires", order: "submitted_at")
        let (saved, exercises, recent, forms) = await (programResult, libraryResult, recentResult, questionnaireResult)
        guard request == reloadRequest else { return }
        switch saved {
        case .success(let rows):
            programs = rows.map(CoachClientProgram.init(raw:))
            if !programs.contains(where: { $0.id == selectedProgramID }) { selectedProgramID = clientPrograms(archived: false).first?.id }
        case .failure(let error): errorMessage = error.localizedDescription
        }
        switch exercises { case .success(let rows): library = rows; libraryError = nil
        case .failure(let error): libraryError = error.localizedDescription }
        switch recent { case .success(let rows): recentLogs = rows; recentLogsError = nil
        case .failure(let error): recentLogsError = error.localizedDescription }
        switch forms { case .success(let rows): questionnaires = rows; questionnairesError = nil
        case .failure(let error): questionnairesError = error.localizedDescription }
    }

    func loadCalendar(around date: Date = Date()) async {
        guard let backend else { return }
        let request = UUID(); calendarRequest = request
        do {
            let result = try await backend.invoke("coach-calendar-events", body: [
                "from": .string(ContinuityDateCoding.string(from: date.addingTimeInterval(-35 * 86400))),
                "to": .string(ContinuityDateCoding.string(from: date.addingTimeInterval(95 * 86400)))
            ])
            guard request == calendarRequest, !Task.isCancelled else { return }
            calendarEvents = result.array("events").map(\.objectValue)
            calendarError = nil
        } catch {
            guard request == calendarRequest, !Task.isCancelled else { return }
            calendarError = error.localizedDescription
        }
    }

    func loadSelectedClient() async {
        guard backend != nil, let selected = selectedProgram else { return }
        let request = UUID(); detailRequest = request
        isLoadingDetails = true; detailErrors = [:]
        let email = selected.email
        async let p = fetchResult(table: "client_progress", filters: ["client_email": email], order: "entry_date")
        async let f = fetchResult(table: "client_food_logs", filters: ["client_email": email], order: "entry_date")
        async let ph = fetchResult(table: "client_progress_photos", filters: ["client_email": email], order: "captured_on")
        async let d = fetchResult(table: "client_dexa_reports", filters: ["client_email": email], order: "created_at")
        async let l = fetchResult(table: "client_workout_logs", filters: ["client_email": email], order: "entry_date")
        let results = await [("client_progress", p), ("client_food_logs", f), ("client_progress_photos", ph), ("client_dexa_reports", d), ("client_workout_logs", l)]
        guard request == detailRequest, selectedProgram?.email == email else { return }
        for (table, result) in results {
            switch result {
            case .success(let rows):
                switch table {
                case "client_progress": progress = rows
                case "client_food_logs": foodLogs = rows
                case "client_progress_photos": photos = rows
                case "client_dexa_reports": dexaReports = rows
                default: logs = rows
                }
            case .failure(let error): detailErrors[table] = error.localizedDescription
            }
        }
        isLoadingDetails = false
    }

    private func clearDetails() {
        detailRequest = UUID()
        progress = []; foodLogs = []; photos = []; dexaReports = []; logs = []
        detailErrors = [:]; isLoadingDetails = false
    }
    private func fetchResult(table: String, filters: [String: String] = [:], order: String, ascending: Bool = false, maximum: Int? = nil) async -> Result<[CoachJSONObject], Error> {
        do { return .success(try await fetchAll(table: table, filters: filters, order: order, ascending: ascending, maximum: maximum)) }
        catch { return .failure(error) }
    }
    private func fetchAll(table: String, filters: [String: String] = [:], order: String, ascending: Bool = false, maximum: Int? = nil) async throws -> [CoachJSONObject] {
        let backend = try requireBackend()
        var rows: [CoachJSONObject] = []
        while true {
            try Task.checkCancellation()
            let count = min(500, maximum.map { $0 - rows.count } ?? 500)
            guard count > 0 else { return rows }
            let page = try await backend.select(table: table, filters: filters, order: order, ascending: ascending, offset: rows.count, limit: count)
            rows += page
            if page.count < count { return rows }
        }
    }

    @discardableResult
    func saveProgram(_ program: CoachClientProgram) async throws -> CoachClientProgram {
        try await mutate {
            let backend = try self.requireBackend()
            try Self.validateEmail(program.email)
            if program.isPersisted {
                let latest = try await self.validateFresh(program)
                guard ContinuitySync.normalize(email: latest.string("client_email")) == program.email else {
                    throw CoachWorkspaceError(message: "Save email changes from the client profile first, then reopen this program.")
                }
            }
            let response = try await backend.invoke("save-client-program", body: Self.programPayload(program))
            let saved = try self.savedProgram(response)
            self.accept(saved)
            self.statusMessage = response.string("message").nonempty ?? "Program saved."
            return saved
        }
    }

    static func programPayload(_ program: CoachClientProgram) -> CoachJSONObject {
        var raw = program.raw
        raw["client_email"] = .string(program.email)
        return ["program_id": .string(program.isPersisted ? program.id.uuidString : ""), "program": .object(raw)]
    }

    @discardableResult
    func saveProfile(_ program: CoachClientProgram, originalEmail: String) async throws -> CoachClientProgram {
        try await mutate {
            let backend = try self.requireBackend()
            try Self.validateEmail(program.email)
            let latest = try await self.validateFresh(program)
            guard ContinuitySync.normalize(email: latest.string("client_email")) == ContinuitySync.normalize(email: originalEmail) else {
                throw CoachWorkspaceError(message: "This client's email changed elsewhere. Reload the profile before saving.")
            }
            var payload = program.raw.filter { CoachClientProgram.profileKeys.contains($0.key) }
            payload["program_id"] = .string(program.id.uuidString)
            payload["old_email"] = .string(originalEmail)
            payload["client_email"] = .string(program.email)
            let response = try await backend.invoke("update-client-profile", body: payload)
            let saved = try self.savedProgram(response)
            // The endpoint updates every block. Replace their shared profile fields too.
            self.programs = self.programs.map { row in
                guard row.email == ContinuitySync.normalize(email: originalEmail), row.id != saved.id else { return row }
                var raw = row.raw
                for key in CoachClientProgram.profileKeys { raw[key] = saved.raw[key] }
                // A future save must re-read rather than reuse an obsolete revision.
                raw.removeValue(forKey: "updated_at")
                return CoachClientProgram(raw: raw)
            }
            self.accept(saved)
            self.clearDetails()
            self.statusMessage = response.string("message").nonempty ?? "Profile saved."
            do {
                self.programs = try await self.fetchAll(table: "client_programs", order: "updated_at").map(CoachClientProgram.init(raw:))
            } catch {
                self.errorMessage = "Profile saved, but the updated program list could not load. Refresh before editing another block. \(error.localizedDescription)"
            }
            return saved
        }
    }

    func manageClient(_ program: CoachClientProgram, action: String) async throws {
        try await mutate {
            guard ["archive", "restore", "delete", "delete_archived"].contains(action) else { throw CoachWorkspaceError(message: "Choose a valid client action.") }
            _ = try await self.validateFresh(program)
            let result = try await self.requireBackend().invoke("manage-client-program", body: ["program_id": .string(program.id.uuidString), "action": .string(action)])
            if action.hasPrefix("delete") {
                let deleted = Set(result.array("deleted_ids").map(\.stringValue).map { $0.lowercased() })
                self.programs.removeAll { deleted.contains($0.id.uuidString.lowercased()) }
            } else {
                for row in result.array("programs") { self.accept(CoachClientProgram(raw: row.objectValue), select: false) }
            }
            if !self.programs.contains(where: { $0.id == self.selectedProgramID }) { self.selectedProgramID = self.clientPrograms(archived: false).first?.id }
            self.statusMessage = result.string("message")
        }
    }
    func deleteProgram(_ program: CoachClientProgram) async throws {
        try await mutate {
            _ = try await self.validateFresh(program)
            try await self.requireBackend().delete(table: "client_programs", id: program.id.uuidString)
            self.programs.removeAll { $0.id == program.id }
            if self.selectedProgramID == program.id { self.selectedProgramID = self.programs(for: program.email).first?.id }
            self.statusMessage = "Training block deleted."
        }
    }
    @discardableResult
    func copyProgram(_ program: CoachClientProgram, to client: CoachClientProgram) async throws -> CoachClientProgram {
        let latest = try await validateFresh(client)
        return try await saveProgram(program.copied(to: CoachClientProgram(raw: latest)))
    }
    func inviteClient(email: String, name: String) async throws -> String {
        try await mutate {
            let email = ContinuitySync.normalize(email: email)
            try Self.validateEmail(email)
            let result = try await self.requireBackend().invoke("invite-client", body: [
                "email": .string(email), "clientName": .string(name), "redirectTo": .string(AppConfiguration.passwordResetURL.absoluteString)
            ])
            let message = result.string("message").nonempty ?? "Invitation sent."
            self.statusMessage = message
            return message
        }
    }

    func saveProgress(_ row: CoachJSONObject) async throws {
        try await mutate {
            let email = ContinuitySync.normalize(email: row.string("client_email"))
            let date = row.string("entry_date")
            try Self.validateEmail(email)
            guard date.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { throw CoachWorkspaceError(message: "Choose a progress entry date.") }
            let backend = try self.requireBackend()
            let existing: CoachJSONObject
            do {
                let rows = try await backend.select(table: "client_progress",
                    filters: ["client_email": email, "entry_date": date], order: "updated_at",
                    ascending: false, offset: 0, limit: 1)
                if let saved = rows.first {
                    guard ContinuitySync.normalize(email: saved.string("client_email")) == email,
                          saved.string("entry_date") == date else {
                        throw CoachWorkspaceError(message: "The saved check-in did not match this client and date.")
                    }
                    existing = saved
                } else { existing = [:] }
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                throw CoachWorkspaceError(message: "We couldn't check the saved measurements for this date. Check your connection and try again. Nothing was saved.")
            }
            func isBlank(_ value: CoachJSON?) -> Bool {
                guard let value, value != .null else { return true }
                if case .string(let text) = value { return text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
                return false
            }
            let keys = ["client_email", "entry_date", "bodyweight", "bodyfat", "lean_mass", "muscle_mass", "measurements", "goal_note"]
            var payload = row.filter { keys.contains($0.key) }
            payload["client_email"] = .string(email)
            for key in ["bodyweight", "bodyfat", "lean_mass", "muscle_mass"] where isBlank(payload[key]) {
                payload[key] = existing[key] ?? .null
            }
            if isBlank(payload["goal_note"]) { payload["goal_note"] = existing["goal_note"] ?? .string("") }
            var measurements = existing.object("measurements")
            for (key, value) in row.object("measurements") where !isBlank(value) { measurements[key] = value }
            payload["measurements"] = .object(measurements)
            try Task.checkCancellation()
            let saved = try await backend.write(table: "client_progress", values: payload, id: nil, onConflict: "client_email,entry_date")
            if self.selectedProgram?.email == saved.string("client_email") {
                self.progress.removeAll { $0.string("entry_date") == saved.string("entry_date") }
                self.progress.append(saved)
                self.progress.sort { $0.string("entry_date") > $1.string("entry_date") }
            }
            self.statusMessage = "Progress saved."
        }
    }

    @discardableResult
    func saveExercise(_ row: CoachJSONObject, id: UUID?, videoData: Data? = nil, videoExtension: String = "mp4", videoContentType: String = "video/mp4") async throws -> CoachJSONObject {
        try await mutate {
            let backend = try self.requireBackend()
            var payload = try Self.exercisePayload(row)
            if let videoData {
                let ext = videoExtension.lowercased()
                let mime = ["mp4": "video/mp4", "mov": "video/quicktime", "m4v": "video/x-m4v", "webm": "video/webm"]
                guard let contentType = mime[ext], !videoData.isEmpty, videoData.count <= 50 * 1024 * 1024 else {
                    throw CoachWorkspaceError(message: "Choose an MP4, MOV, M4V, or WebM video under 50 MB.")
                }
                let path = "\((id ?? UUID()).uuidString.lowercased())/\(UUID().uuidString.lowercased()).\(ext)"
                let url = try await backend.uploadVideo(path: path, data: videoData, contentType: contentType)
                payload["demo_url"] = .string(url.absoluteString)
            }
            // Validate the resulting URL, so a new upload can replace an invalid old link.
            payload["demo_url"] = try Self.validatedExerciseDemoURL(payload.string("demo_url")).map(CoachJSON.string) ?? .null
            // Retain uploads on an ambiguous failed response: the row may have committed.
            // Older demos are retained because existing assigned programs can reference them.
            let saved = try await backend.write(table: "exercise_library", values: payload, id: id?.uuidString, onConflict: nil)
            self.library.removeAll { $0.string("id") == saved.string("id") }
            self.library.append(saved)
            self.library.sort { $0.string("name").localizedCaseInsensitiveCompare($1.string("name")) == .orderedAscending }
            self.statusMessage = "Exercise saved."
            return saved
        }
    }
    static func exercisePayload(_ row: CoachJSONObject) throws -> CoachJSONObject {
        guard !row.string("name").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw CoachWorkspaceError(message: "Add an exercise name.") }
        guard (1...10).contains(row.int("default_sets")), (0...600).contains(row.int("default_rest_seconds")) else { throw CoachWorkspaceError(message: "Use 1–10 sets and 0–600 seconds of rest.") }
        let keys = ["name", "aliases", "primary_muscle", "secondary_muscles", "equipment", "difficulty", "movement_pattern", "default_sets", "default_reps", "default_rest_seconds", "substitution_group", "demo_url", "instructions", "is_approved", "is_active", "sort_order"]
        var payload = row.filter { keys.contains($0.key) }
        payload["name"] = .string(row.string("name").trimmingCharacters(in: .whitespacesAndNewlines))
        payload["instructions"] = .string(String(row.string("instructions").prefix(2000)))
        if row.string("demo_url").isEmpty { payload["demo_url"] = .null }
        return payload
    }
    static func validatedExerciseDemoURL(_ value: String, supabaseURL: URL = AppConfiguration.supabaseURL) throws -> String? {
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        let invalid = CoachWorkspaceError(message: "Use an HTTPS YouTube link or upload a demo video.")
        guard let components = URLComponents(string: text), let url = components.url,
              components.scheme?.lowercased() == "https", components.user == nil, components.password == nil,
              let host = components.host?.lowercased() else { throw invalid }
        // Same hosts accepted by the web exercise-library editor (including www).
        let youtubeHosts: Set<String> = ["youtube.com", "www.youtube.com", "youtu.be", "www.youtu.be"]
        if youtubeHosts.contains(host), components.port == nil || components.port == 443, !components.path.isEmpty {
            return url.absoluteString
        }
        let isStorageOrigin = host == supabaseURL.host?.lowercased() && (components.port ?? 443) == (supabaseURL.port ?? 443)
        let videoPath = #"^/storage/v1/object/public/exercise-videos/[a-z0-9/-]+\.(mp4|mov|m4v|webm)$"#
        guard isStorageOrigin, components.percentEncodedPath.range(of: videoPath, options: [.regularExpression, .caseInsensitive]) != nil else { throw invalid }
        return url.absoluteString
    }
    func deleteExercise(_ id: UUID) async throws {
        try await mutate {
            try await self.requireBackend().delete(table: "exercise_library", id: id.uuidString)
            self.library.removeAll { $0.string("id").lowercased() == id.uuidString.lowercased() }
            self.statusMessage = "Exercise deleted from the library. Existing workout logs are retained."
        }
    }
    func correctExerciseName(email: String, previous: String, corrected: String) async throws -> Int {
        try await mutate {
            try Self.validateEmail(email)
            guard !previous.isEmpty, !corrected.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw CoachWorkspaceError(message: "Enter the previous and corrected exercise names.") }
            let count = try await self.requireBackend().rpc("correct_client_exercise_name", params: ["target_client_email": .string(ContinuitySync.normalize(email: email)), "previous_exercise_name": .string(previous), "corrected_exercise_name": .string(corrected)])
            self.statusMessage = "Updated \(count) workout log entries."
            await self.loadSelectedClient()
            return count
        }
    }
    func deleteExerciseHistory(email: String, name: String) async throws -> Int {
        try await mutate {
            try Self.validateEmail(email)
            guard !name.isEmpty else { throw CoachWorkspaceError(message: "Choose an exercise to remove from custom workout history.") }
            let count = try await self.requireBackend().rpc("delete_client_custom_exercise_history", params: ["target_client_email": .string(ContinuitySync.normalize(email: email)), "exercise_name_to_delete": .string(name)])
            self.statusMessage = "Deleted \(count) custom workout log entries."
            await self.loadSelectedClient()
            return count
        }
    }
    func latestAnalysis(email: String) async throws -> CoachJSONObject? {
        let result = try await requireBackend().invoke("analyze-workout", body: ["action": .string("latest"), "client_email": .string(ContinuitySync.normalize(email: email))])
        guard case .object(let analysis) = result["analysis"] else { return nil }
        return analysis
    }
    func analyze(client: CoachClientProgram, logs: [CoachJSONObject]) async throws -> CoachJSONObject {
        try await mutate {
            let analysisFields: Set<String> = ["entry_date", "workout_title", "exercise_code", "exercise_name", "set_number", "weight_used", "reps", "notes"]
            let rows = logs.filter { ContinuitySync.normalize(email: $0.string("client_email")) == client.email }
                .prefix(120).map { $0.filter { analysisFields.contains($0.key) } }
            guard !rows.isEmpty else { throw CoachWorkspaceError(message: "Load this client's workout logs before running an analysis.") }
            let result = try await self.requireBackend().invoke("analyze-workout", body: [
                "action": .string("analyze"), "client_email": .string(client.email), "client_name": .string(client.name),
                "program_title": .string(client.programTitle), "logs": .array(rows.map(CoachJSON.object))
            ])
            self.statusMessage = "Workout analysis saved."
            return result
        }
    }
    func signedURL(bucket: String, path: String) async throws -> URL {
        guard ["progress-photos", "dexa-reports"].contains(bucket), !path.isEmpty else { throw CoachWorkspaceError(message: "This client file is unavailable.") }
        return try await requireBackend().signedURL(bucket: bucket, path: path)
    }

    private func validateFresh(_ program: CoachClientProgram) async throws -> CoachJSONObject {
        guard program.isPersisted else { throw CoachWorkspaceError(message: "Save this client before continuing.") }
        let rows = try await requireBackend().select(table: "client_programs", filters: ["id": program.id.uuidString], order: "id", ascending: true, offset: 0, limit: 1)
        guard let latest = rows.first else { throw CoachWorkspaceError(message: "This program is no longer available. Reload the client list.") }
        let original = program.originalRaw
        if let updatedAt = original["updated_at"], updatedAt != .null, !updatedAt.stringValue.isEmpty {
            guard latest["updated_at"] == updatedAt else { throw Self.staleError }
        } else {
            // Legacy rows without a revision still get a conservative snapshot check.
            guard latest == original else { throw Self.staleError }
        }
        return latest
    }
    private static var staleError: CoachWorkspaceError {
        CoachWorkspaceError(message: "This program changed since you opened it. Reload the client, reopen the editor, and apply your changes again.")
    }
    private static func validateEmail(_ email: String) throws {
        guard email.range(of: #"^[^\s@]+@[^\s@]+\.[^\s@]+$"#, options: .regularExpression) != nil else { throw CoachWorkspaceError(message: "Add a valid client email.") }
    }
    private func savedProgram(_ response: CoachJSONObject) throws -> CoachClientProgram {
        let row = response.object("program")
        guard UUID(uuidString: row.string("id")) != nil else { throw CoachWorkspaceError(message: "The save response did not include the program. Reload before trying again.") }
        return CoachClientProgram(raw: row)
    }
    private func accept(_ program: CoachClientProgram, select: Bool = true) {
        if program.isActive {
            for index in programs.indices where programs[index].email == program.email && programs[index].id != program.id {
                programs[index].raw["active"] = .bool(false)
            }
        }
        if let index = programs.firstIndex(where: { $0.id == program.id }) { programs[index] = program }
        else { programs.append(program) }
        if select { selectedProgramID = program.id }
    }
    private func requireBackend() throws -> any CoachWorkspaceBackend {
        guard let backend else { throw CoachWorkspaceError(message: "Preview data is read-only. Sign in to save changes.") }
        return backend
    }
    private func mutate<T>(_ action: () async throws -> T) async throws -> T {
        guard !isSaving else { throw CoachWorkspaceError(message: "Wait for the current save to finish.") }
        isSaving = true; errorMessage = nil; statusMessage = nil
        defer { isSaving = false }
        do { return try await action() }
        catch { errorMessage = error.localizedDescription; throw error }
    }
}
