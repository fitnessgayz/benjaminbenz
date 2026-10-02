import SwiftUI
import Supabase
import Charts
import SafariServices

struct CoachHealthMetric: Identifiable {
    let id: String
    let category: String
    let label: String
    let unit: String
    let range: ClosedRange<Double>
    var divisor = 1.0
    var digits = 0
    static let all: [CoachHealthMetric] = [
        .init(id: "steps", category: "activity", label: "Steps", unit: "", range: 0...200000),
        .init(id: "sleep_minutes", category: "recovery", label: "Sleep", unit: "hr", range: 0...1500, divisor: 60, digits: 1),
        .init(id: "resting_heart_rate", category: "recovery", label: "Resting heart rate", unit: "bpm", range: 20...300),
        .init(id: "hrv_ms", category: "recovery", label: "Heart-rate variability", unit: "ms", range: 0...2000, digits: 1),
        .init(id: "body_weight_kg", category: "bodyWeight", label: "Body weight", unit: "kg", range: 1...700, digits: 1)
    ]
    func value(in row: CoachJSONObject) -> Double? { row.double(id).flatMap { range.contains($0) ? $0 : nil } }
    func display(_ row: CoachJSONObject) -> String {
        guard let value = value(in: row) else { return "No shared reading" }
        return (value / divisor).formatted(.number.precision(.fractionLength(0...digits))) + (unit.isEmpty ? "" : " \(unit)")
    }
}

struct CoachSharedHealthSnapshot: Equatable {
    let categories: [String]
    let daily: [CoachJSONObject]
    let workouts: [CoachJSONObject]
    let lastImported: String?
    static let empty = CoachSharedHealthSnapshot(categories: [], daily: [], workouts: [], lastImported: nil)
}

enum CoachSharedHealthPolicy {
    static let categoryOrder = ["workouts", "activity", "recovery", "bodyWeight"]
    static let categoryLabels = ["workouts": "Workouts", "activity": "Steps", "recovery": "Sleep & recovery", "bodyWeight": "Body weight"]
    static func categories(_ row: CoachJSONObject?) -> [String] {
        let values = Set(row?.array("shared_categories").map(\.stringValue) ?? [])
        return categoryOrder.filter(values.contains)
    }
    static func settings(_ rows: [CoachJSONObject], email: String) throws -> CoachJSONObject? {
        guard rows.count <= 1 else { throw CoachWorkspaceError(message: "More than one Apple Health sharing account matches this client. Sharing could not be confirmed.") }
        guard let row = rows.first else { return nil }
        guard ContinuitySync.normalize(email: row.string("client_email")) == email, UUID(uuidString: row.string("user_id")) != nil else {
            throw CoachWorkspaceError(message: "The Apple Health sharing account could not be confirmed. Refresh before viewing.")
        }
        return row
    }
    static func day(_ date: Date) -> String {
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
    static func since(_ now: Date) -> Date {
        let calendar = Calendar(identifier: .gregorian)
        return calendar.date(byAdding: .day, value: -29, to: calendar.startOfDay(for: now))!
    }
    static func validDay(_ text: String) -> Bool {
        guard text.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return false }
        let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; f.isLenient = false
        return f.date(from: text).map { f.string(from: $0) == text } ?? false
    }
    static func snapshot(email: String, initial: CoachJSONObject, current: CoachJSONObject?, daily: [CoachJSONObject], workouts: [CoachJSONObject], now: Date) -> CoachSharedHealthSnapshot {
        guard let current, current.string("user_id").lowercased() == initial.string("user_id").lowercased() else { return .empty }
        let allowed = categories(initial).filter { categories(current).contains($0) }
        guard !allowed.isEmpty else { return .empty }
        let owner = initial.string("user_id").lowercased()
        let start = since(now), startDay = day(start), endDay = day(now)
        let owned: (CoachJSONObject) -> Bool = { $0.string("user_id").lowercased() == owner && ContinuitySync.normalize(email: $0.string("client_email")) == email }
        let metrics = CoachHealthMetric.all.filter { allowed.contains($0.category) }
        let safeDaily = daily.filter { owned($0) && validDay($0.string("date")) && $0.string("date") >= startDay && $0.string("date") <= endDay }.map { row -> CoachJSONObject in
            var safe: CoachJSONObject = ["date": .string(row.string("date")), "updated_at": row["updated_at"] ?? .null]
            for metric in metrics { safe[metric.id] = metric.value(in: row).map(CoachJSON.number) ?? .null }
            return safe
        }.sorted { $0.string("date") > $1.string("date") }
        let safeWorkouts = allowed.contains("workouts") ? workouts.compactMap { row -> CoachJSONObject? in
            guard owned(row), let date = ContinuityDateCoding.date(from: row.string("started_at")), date >= start, date <= now,
                  let duration = row.double("duration_seconds"), (1...604800).contains(duration) else { return nil }
            var safe: CoachJSONObject = ["healthkit_id": .string(row.string("healthkit_id")), "activity_type": .string(String(row.string("activity_type").prefix(100))), "started_at": .string(row.string("started_at")), "duration_seconds": .number(duration), "source_name": .string(String(row.string("source_name").prefix(100))), "updated_at": row["updated_at"] ?? .null]
            for (key, range) in [("active_calories", 0.0...100000.0), ("distance_meters", 0.0...2000000.0), ("average_heart_rate", 20.0...300.0)] {
                safe[key] = row.double(key).flatMap { range.contains($0) ? CoachJSON.number($0) : nil } ?? .null
            }
            return safe
        }.sorted { $0.string("started_at") > $1.string("started_at") } : []
        let imported = (safeDaily + safeWorkouts).compactMap { ContinuityDateCoding.date(from: $0.string("updated_at")) }.filter { $0 <= now.addingTimeInterval(60) }.max()
        return CoachSharedHealthSnapshot(categories: allowed, daily: safeDaily, workouts: safeWorkouts, lastImported: imported.map { ContinuityDateCoding.string(from: $0) })
    }
    static func validAttachment(_ row: CoachJSONObject, email: String) -> Bool {
        guard ContinuitySync.normalize(email: row.string("client_email")) == email,
              let owner = UUID(uuidString: row.string("owner_user_id")), UUID(uuidString: row.string("id")) != nil else { return false }
        let path = row.string("storage_path")
        return path.lowercased().hasPrefix(owner.uuidString.lowercased() + "/") && !path.contains("..")
            && path.range(of: #"^[0-9a-fA-F-]{36}/[A-Za-z0-9][A-Za-z0-9._-]{0,220}$"#, options: .regularExpression) != nil
            && ["image/jpeg", "image/png", "image/webp"].contains(row.string("mime_type"))
    }
}

@MainActor
protocol CoachSharedHealthBackend {
    func actorID() async throws -> UUID
    func settings(email: String) async throws -> [CoachJSONObject]
    func daily(email: String, owner: String, columns: [String], since: Date, through: Date) async throws -> [CoachJSONObject]
    func workouts(email: String, owner: String, since: Date, through: Date) async throws -> [CoachJSONObject]
    func attachments(email: String, offset: Int, limit: Int) async throws -> [CoachJSONObject]
    func signedAttachment(path: String) async throws -> URL
}

@MainActor
private final class SupabaseCoachSharedHealthBackend: CoachSharedHealthBackend {
    private let client = AppConfiguration.supabase
    func actorID() async throws -> UUID { try await client.auth.user().id }
    func settings(email: String) async throws -> [CoachJSONObject] {
        try await client.from("client_apple_health_settings").select("user_id,client_email,shared_categories,updated_at").eq("client_email", value: email).limit(2).execute().value
    }
    func daily(email: String, owner: String, columns: [String], since: Date, through: Date) async throws -> [CoachJSONObject] {
        try await client.from("client_apple_health_daily").select((["user_id", "client_email", "date", "updated_at"] + columns).joined(separator: ","))
            .eq("user_id", value: owner).eq("client_email", value: email)
            .gte("date", value: CoachSharedHealthPolicy.day(since)).lte("date", value: CoachSharedHealthPolicy.day(through)).order("date", ascending: false).limit(32).execute().value
    }
    func workouts(email: String, owner: String, since: Date, through: Date) async throws -> [CoachJSONObject] {
        try await client.from("client_apple_health_workouts").select("user_id,client_email,healthkit_id,activity_type,started_at,ended_at,duration_seconds,active_calories,distance_meters,average_heart_rate,source_name,updated_at")
            .eq("user_id", value: owner).eq("client_email", value: email)
            .gte("started_at", value: ContinuityDateCoding.string(from: since)).lte("started_at", value: ContinuityDateCoding.string(from: through)).order("started_at", ascending: false).limit(1000).execute().value
    }
    func attachments(email: String, offset: Int, limit: Int) async throws -> [CoachJSONObject] {
        try await client.from("client_apple_workouts").select().eq("client_email", value: email)
            .order("created_at", ascending: false).order("id", ascending: true).range(from: offset, to: offset + limit - 1).execute().value
    }
    func signedAttachment(path: String) async throws -> URL {
        try await client.storage.from("apple-workouts").createSignedURL(path: path, expiresIn: 300)
    }
}

@MainActor
final class CoachSharedHealthStore: ObservableObject {
    enum State: Equatable { case idle, loading, ready, notShared, failed(String) }
    @Published private(set) var healthState: State = .idle
    @Published private(set) var attachmentState: State = .idle
    @Published private(set) var snapshot = CoachSharedHealthSnapshot.empty
    @Published private(set) var attachments: [CoachJSONObject] = []
    private let backend: (any CoachSharedHealthBackend)?
    private var requestID = UUID()
    private var loadedEmail = ""
    private var actor: UUID?
    init(previewMode: Bool = false) { backend = previewMode ? nil : SupabaseCoachSharedHealthBackend() }
    init(backend: any CoachSharedHealthBackend) { self.backend = backend }

    func load(email: String, now: Date = Date()) async {
        let email = ContinuitySync.normalize(email: email)
        let request = UUID(); requestID = request; loadedEmail = email
        snapshot = .empty; attachments = []; actor = nil
        guard let backend else { healthState = .notShared; attachmentState = .ready; return }
        healthState = .loading; attachmentState = .loading
        do {
            let actor = try await backend.actorID()
            async let health = healthResult(email: email, actor: actor, now: now)
            async let files = attachmentResult(email: email, actor: actor)
            let (loadedHealth, fileResult) = await (health, files)
            guard request == requestID, !Task.isCancelled else { return }
            self.actor = actor
            switch loadedHealth {
            case .success(let snapshot): self.snapshot = snapshot; healthState = snapshot.categories.isEmpty ? .notShared : .ready
            case .failure(let error): healthState = .failed(error.localizedDescription)
            }
            switch fileResult {
            case .success(let files): attachments = files; attachmentState = .ready
            case .failure(let error): attachmentState = .failed(error.localizedDescription)
            }
        } catch {
            guard request == requestID, !Task.isCancelled else { return }
            healthState = .failed(error.localizedDescription); attachmentState = .failed(error.localizedDescription)
        }
    }

    private func healthResult(email: String, actor: UUID, now: Date) async -> Result<CoachSharedHealthSnapshot, Error> {
        do {
            guard let backend else { return .success(.empty) }
            let initial = try CoachSharedHealthPolicy.settings(await backend.settings(email: email), email: email)
            guard let initial, !CoachSharedHealthPolicy.categories(initial).isEmpty else { return .success(.empty) }
            let categories = CoachSharedHealthPolicy.categories(initial)
            let metrics = CoachHealthMetric.all.filter { categories.contains($0.category) }.map(\.id)
            let start = CoachSharedHealthPolicy.since(now)
            let daily = metrics.isEmpty ? [] : try await backend.daily(email: email, owner: initial.string("user_id"), columns: metrics, since: start, through: now)
            let workouts = categories.contains("workouts") ? try await backend.workouts(email: email, owner: initial.string("user_id"), since: start, through: now) : []
            let current = try CoachSharedHealthPolicy.settings(await backend.settings(email: email), email: email)
            guard try await backend.actorID() == actor else { throw CoachWorkspaceError(message: "Your sign-in changed. Reopen this client's shared health information.") }
            return .success(CoachSharedHealthPolicy.snapshot(email: email, initial: initial, current: current, daily: daily, workouts: workouts, now: now))
        } catch { return .failure(error) }
    }
    private func attachmentResult(email: String, actor: UUID) async -> Result<[CoachJSONObject], Error> {
        do {
            guard let backend else { return .success([]) }
            var rows: [CoachJSONObject] = []
            while true {
                try Task.checkCancellation()
                let page = try await backend.attachments(email: email, offset: rows.count, limit: 500)
                rows += page
                if page.count < 500 { break }
            }
            guard try await backend.actorID() == actor else { throw CoachWorkspaceError(message: "Your sign-in changed. Reopen this client's workout attachments.") }
            return .success(rows.filter { CoachSharedHealthPolicy.validAttachment($0, email: email) })
        } catch { return .failure(error) }
    }
    func openAttachment(_ row: CoachJSONObject) async throws -> URL {
        guard let backend, let actor, CoachSharedHealthPolicy.validAttachment(row, email: loadedEmail), attachments.contains(row) else { throw CoachWorkspaceError(message: "This private attachment is unavailable. Refresh and try again.") }
        let request = requestID
        guard try await backend.actorID() == actor else { throw CoachWorkspaceError(message: "Your sign-in changed. Reopen this client before viewing their screenshot.") }
        let url = try await backend.signedAttachment(path: row.string("storage_path"))
        guard try await backend.actorID() == actor else { throw CoachWorkspaceError(message: "Your sign-in changed. Reopen this client before viewing their screenshot.") }
        guard request == requestID, attachments.contains(row) else { throw CoachWorkspaceError(message: "The selected client changed. Open their screenshot again.") }
        return url
    }
}

struct CoachSharedHealthView: View {
    let program: CoachClientProgram
    @StateObject private var store: CoachSharedHealthStore
    @State private var visibleWorkouts = 20
    @State private var document: CoachHealthDocument?
    @State private var opening = false
    @State private var error: String?
    init(program: CoachClientProgram, previewMode: Bool = false) {
        self.program = program
        _store = StateObject(wrappedValue: CoachSharedHealthStore(previewMode: previewMode))
    }
    private var metrics: [CoachHealthMetric] { CoachHealthMetric.all.filter { store.snapshot.categories.contains($0.category) } }
    private var weights: [CoachJSONObject] { store.snapshot.daily.reversed().filter { $0.double("body_weight_kg") != nil } }
    var body: some View {
        List {
            Section {
                Text(program.name).font(.headline)
                Text("Information this client shared from their iPhone. Imported readings stay separate from manual FWB logs and measurements.").font(.subheadline).foregroundStyle(.secondary)
            }
            Section("Apple Health · last 30 days") {
                switch store.healthState {
                case .idle, .loading: ProgressView("Loading shared health information…")
                case .notShared: Text("This client has not shared Apple Health information with FWB.").foregroundStyle(.secondary)
                case .failed(let message): Text(message).foregroundStyle(.red); Button("Retry") { Task { await reload() } }
                case .ready:
                    Text("Shared: " + store.snapshot.categories.compactMap { CoachSharedHealthPolicy.categoryLabels[$0] }.joined(separator: " · ")).font(.subheadline)
                    if let imported = store.snapshot.lastImported, let date = ContinuityDateCoding.date(from: imported) { Text("Last imported \(date.formatted(date: .abbreviated, time: .shortened))").font(.caption).foregroundStyle(.secondary) }
                    ForEach(metrics) { metric in
                        let latest = store.snapshot.daily.first { metric.value(in: $0) != nil }
                        VStack(alignment: .leading, spacing: 4) {
                            HStack { Text(metric.label); Spacer(); Text(metric.display(latest ?? [:])).foregroundStyle(.secondary) }
                            if let latest { Text(latest.string("date")).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                }
            }
            if store.snapshot.categories.contains("bodyWeight"), weights.count > 1 {
                Section("Body weight · kg") {
                    Chart(Array(weights.enumerated()), id: \.offset) { _, row in
                        LineMark(x: .value("Date", row.string("date")), y: .value("Weight", row.double("body_weight_kg") ?? 0)).foregroundStyle(Color.fwbLime)
                        PointMark(x: .value("Date", row.string("date")), y: .value("Weight", row.double("body_weight_kg") ?? 0)).foregroundStyle(Color.fwbLime)
                    }.frame(height: 180).chartYScale(domain: .automatic(includesZero: false))
                    Text("Missing days are not estimated.").font(.caption).foregroundStyle(.secondary)
                }
            }
            if !store.snapshot.daily.isEmpty, !metrics.isEmpty {
                Section {
                    DisclosureGroup("Daily history") {
                        ForEach(Array(store.snapshot.daily.enumerated()), id: \.offset) { _, row in
                            VStack(alignment: .leading, spacing: 5) {
                                Text(row.string("date")).bold()
                                ForEach(metrics) { metric in Text("\(metric.label): \(metric.display(row))").font(.subheadline).foregroundStyle(.secondary) }
                            }
                        }
                    }
                }
            }
            if store.snapshot.categories.contains("workouts") {
                Section("Imported workouts · last 30 days") {
                    if store.snapshot.workouts.isEmpty { Text("No shared workouts in the last 30 days.").foregroundStyle(.secondary) }
                    ForEach(Array(store.snapshot.workouts.prefix(visibleWorkouts).enumerated()), id: \.offset) { _, row in workout(row, attachment: false) }
                    if store.snapshot.workouts.count > visibleWorkouts { Button("Show more workouts") { visibleWorkouts += 20 } }
                }
            }
            Section {
                switch store.attachmentState {
                case .idle, .loading: ProgressView("Loading workout attachments…")
                case .failed(let message): Text(message).foregroundStyle(.red); Button("Retry attachments") { Task { await reload() } }
                default:
                    if store.attachments.isEmpty { Text("No Apple Workout screenshots shared by this client.").foregroundStyle(.secondary) }
                    ForEach(Array(store.attachments.enumerated()), id: \.offset) { _, row in
                        VStack(alignment: .leading, spacing: 10) {
                            workout(row, attachment: true)
                            Button("Open private screenshot") { open(row) }.disabled(opening)
                        }
                    }
                }
                if opening { ProgressView("Opening screenshot…") }
                if let error { Text(error).foregroundStyle(.red) }
            } header: { Text("Apple Workout attachments") } footer: { Text("Screenshots and reviewed stats the client explicitly attached to saved workouts. These do not create additional workouts.") }
        }
        .navigationTitle("Shared Apple Health").navigationBarTitleDisplayMode(.inline)
        .scrollContentBackground(.hidden).background(Color.fwbBackground)
        .task(id: program.email) { await reload() }
        .refreshable { await reload() }
        .onReceive(NotificationCenter.default.publisher(for: .fwbForegroundRefresh)) { _ in Task { await reload() } }
        .sheet(item: $document) { item in CoachHealthDocumentView(url: item.url).ignoresSafeArea() }
    }
    private func reload() async { error = nil; document = nil; await store.load(email: program.email) }
    private func open(_ row: CoachJSONObject) {
        guard !opening else { return }; opening = true; error = nil
        Task { @MainActor in defer { opening = false }; do { document = CoachHealthDocument(url: try await store.openAttachment(row)) } catch { self.error = error.localizedDescription } }
    }
    private func workout(_ row: CoachJSONObject, attachment: Bool) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(row.string("activity_type").isEmpty ? "Apple Workout" : row.string("activity_type").replacingOccurrences(of: "_", with: " ")).font(.headline)
            if attachment { Text(row.string("workout_date")).font(.caption).foregroundStyle(.secondary) }
            else if let date = ContinuityDateCoding.date(from: row.string("started_at")) { Text(date, style: .date).font(.caption); Text(date, style: .time).font(.caption).foregroundStyle(.secondary) }
            Text(Self.workoutSummary(row, attachment: attachment)).font(.subheadline).foregroundStyle(.secondary)
            if attachment {
                if !row.string("started_at_local").isEmpty { Text("Local time: \(row.string("started_at_local")) – \(row.string("ended_at_local"))").font(.caption) }
                if !row.string("original_filename").isEmpty { Text(row.string("original_filename")).font(.caption).foregroundStyle(.secondary) }
            } else { Text("Source: \(row.string("source_name").isEmpty ? "Apple Health" : row.string("source_name"))").font(.caption).foregroundStyle(.secondary) }
        }
    }
    static func workoutSummary(_ row: CoachJSONObject, attachment: Bool) -> String {
        var fields = [("duration_seconds", "min", 60.0), ("active_calories", "active kcal", 1.0), ("average_heart_rate", "bpm average", 1.0)]
        fields += attachment ? [("elapsed_seconds", "min elapsed", 60), ("total_calories", "total kcal", 1)] : [("distance_meters", "km", 1000)]
        return fields.compactMap { key, unit, divisor -> String? in row.double(key).map { ($0 / divisor).formatted(.number.precision(.fractionLength(0...1))) + " " + unit } }.joined(separator: " · ")
    }
}

private struct CoachHealthDocument: Identifiable { let id = UUID(); let url: URL }
private struct CoachHealthDocumentView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) { }
}
