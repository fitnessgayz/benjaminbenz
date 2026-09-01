import Foundation
import Supabase

@MainActor
final class SessionStore: ObservableObject {
    enum State: Equatable {
        case restoring
        case signedOut
        case signedIn(SignedInAccount)
    }

    @Published private(set) var state: State = .restoring
    @Published private(set) var isSubmitting = false
    @Published var message: String?

    private let client: SupabaseClient
    private var didRestore = false

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
    }

#if DEBUG
    init(previewAccount: SignedInAccount, client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
        state = .signedIn(previewAccount)
        didRestore = true
    }
#endif

    func restoreSession() async {
        guard !didRestore else { return }
        didRestore = true

        do {
            let session = try await client.auth.session
            apply(session: session)
        } catch {
            state = .signedOut
        }
    }

    func refreshSession() async {
        guard case .signedIn = state else { return }
        do {
            let session = try await client.auth.refreshSession()
            apply(session: session)
        } catch {
            // Keep the current session through transient foreground/network failures.
            // Authenticated requests will still surface an actionable sign-in error.
        }
    }

    func signIn(email: String, password: String) async {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedEmail.isEmpty, !password.isEmpty else {
            message = "Enter your email and password."
            return
        }

        isSubmitting = true
        message = nil

        do {
            let session = try await client.auth.signIn(email: normalizedEmail, password: password)
            apply(session: session)
        } catch {
            message = "That email or password did not work. Please try again."
        }

        isSubmitting = false
    }

    func sendPasswordReset(email: String) async {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedEmail.isEmpty else {
            message = "Enter your email first, then request a reset link."
            return
        }

        isSubmitting = true
        message = nil

        do {
            try await client.auth.resetPasswordForEmail(
                normalizedEmail,
                redirectTo: AppConfiguration.passwordResetURL
            )
            message = "If that account exists, a password reset link was sent."
        } catch {
            message = "The reset link could not be sent. Please try again."
        }

        isSubmitting = false
    }

    func signOut() async {
        isSubmitting = true
        message = nil

        await PushRegistrationCoordinator.shared.deactivateCurrentDeviceToken()

        do {
            try await client.auth.signOut()
        } catch {
            message = "You were signed out on this device."
        }

        state = .signedOut
        isSubmitting = false
    }

    private func apply(session: Session) {
        guard let email = session.user.email?.trimmingCharacters(in: .whitespacesAndNewlines),
              !email.isEmpty else {
            state = .signedOut
            message = "This account does not have an email address."
            return
        }

        guard email.caseInsensitiveCompare(AppConfiguration.coachEmail) != .orderedSame else {
            state = .signedOut
            message = "Coach administration is available on the website. Sign in here with a client account."
            return
        }

        state = .signedIn(
            SignedInAccount(
                id: session.user.id,
                email: email
            )
        )
    }
}

@MainActor
final class ClientProgramStore: ObservableObject {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    enum NutritionSaveState: Equatable {
        case idle
        case saving
        case saved
        case queued
        case conflict(String)
        case failed(String)
    }

    @Published private(set) var state: LoadState = .idle
    @Published private(set) var program: ClientProgram?
    @Published private(set) var nutritionSaveState: NutritionSaveState = .idle

    private let client: SupabaseClient
    private let isPreview: Bool

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
        isPreview = false
    }

#if DEBUG
    init(previewProgram: ClientProgram, client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
        isPreview = true
        program = previewProgram
        state = .loaded
    }
#endif

    func loadIfNeeded() async {
        guard state == .idle else { return }
        await reload()
    }

    func reload() async {
        guard !isPreview else { return }
        state = .loading

        do {
            let session = try await client.auth.session
            guard let accountEmail = session.user.email.map({ ContinuitySync.normalize(email: $0) }),
                  !accountEmail.isEmpty else {
                state = .failed("Your account email is missing. Sign in again and retry.")
                return
            }
            let programs: [ClientProgram] = try await client
                .from("client_programs")
                .select()
                .eq("client_email", value: accountEmail)
                .eq("active", value: true)
                .eq("client_archived", value: false)
                .order("updated_at", ascending: false)
                .limit(1)
                .execute()
                .value

            program = programs.first
            if let programID = program?.id,
               let pending = await ContinuityOutbox.shared.nutritionMutation(programID: programID) {
                _ = await synchronizeNutrition(pending)
            }
            state = .loaded
        } catch is CancellationError {
            return
        } catch {
            state = .failed("Your training plan could not be loaded. Check your connection and try again.")
        }
    }

    func saveNutritionPlan(programID: UUID, plan: NutritionPlan) async -> Bool {
        nutritionSaveState = .saving
        let mutation = PendingNutritionMutation(
            programID: programID,
            plan: plan,
            expectedRemoteUpdatedAt: program?.nutritionPlan?.updatedAt ?? ""
        )

        if await synchronizeNutrition(mutation) {
            return true
        }

        if case .conflict = nutritionSaveState {
            return false
        }

        do {
            try await ContinuityOutbox.shared.enqueue(mutation)
            if let program {
                self.program = program.replacingNutritionPlan(plan)
            }
            nutritionSaveState = .queued
            return true
        } catch {
            nutritionSaveState = .failed("Your targets could not be secured on this iPhone. Try saving again.")
            return false
        }
    }

    private func synchronizeNutrition(_ mutation: PendingNutritionMutation) async -> Bool {
        do {
            let current: ClientProgram = try await client
                .from("client_programs")
                .select()
                .eq("id", value: mutation.programID.uuidString)
                .single()
                .execute()
                .value

            let remoteDate = ContinuityDateCoding.date(from: current.nutritionPlan?.updatedAt)
            let localDate = ContinuityDateCoding.date(from: mutation.plan.updatedAt) ?? .distantPast
            let expectedDate = ContinuityDateCoding.date(from: mutation.expectedRemoteUpdatedAt)
            if let remoteDate, remoteDate > localDate, remoteDate != expectedDate {
                program = current
                try? await ContinuityOutbox.shared.removeNutrition(programID: mutation.programID)
                nutritionSaveState = .conflict("Targets changed on the website after this edit. The newer website targets were kept.")
                return false
            }

            let updatedProgram: ClientProgram
            do {
                updatedProgram = try await client
                    .from("client_programs")
                    .update(ClientNutritionPlanSyncUpdate(nutritionPlan: mutation.plan))
                    .eq("id", value: mutation.programID.uuidString)
                    .select()
                    .single()
                    .execute()
                    .value
            } catch {
                updatedProgram = try await client
                    .from("client_programs")
                    .update(ClientNutritionPlanUpdate(nutritionPlan: mutation.plan))
                    .eq("id", value: mutation.programID.uuidString)
                    .select()
                    .single()
                    .execute()
                    .value
            }

            program = updatedProgram
            try? await ContinuityOutbox.shared.removeNutrition(programID: mutation.programID)
            nutritionSaveState = .saved
            return true
        } catch is CancellationError {
            nutritionSaveState = .idle
            return false
        } catch {
            return false
        }
    }
}

@MainActor
final class ExerciseSuggestionStore: ObservableObject {
    @Published private(set) var historyNames: [String] = []

    private let client: SupabaseClient
    private var loadedEmail: String?

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
    }

    func load(email: String) async {
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalizedEmail.isEmpty, loadedEmail != normalizedEmail else { return }

        loadedEmail = normalizedEmail

        do {
            let records: [ExerciseNameRecord] = try await client
                .from("client_workout_logs")
                .select("exercise_code,exercise_name")
                .eq("client_email", value: normalizedEmail)
                .order("exercise_name", ascending: true)
                .limit(1_000)
                .execute()
                .value

            historyNames = ExerciseSuggestionLibrary.merged([
                records.compactMap { record in
                    let code = record.exerciseCode.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
                    return ["WARMUP", "CARDIO"].contains(code) ? nil : record.exerciseName
                }
            ])
        } catch is CancellationError {
            return
        } catch {
            historyNames = []
        }
    }
}

@MainActor
final class ExerciseLibraryStore: ObservableObject {
    @Published private(set) var exercises: [ApprovedExercise] = []
    @Published private(set) var isLoading = false

    private let client: SupabaseClient
    private var didLoad = false

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
    }

    var suggestionNames: [String] {
        ExerciseSuggestionLibrary.merged([exercises.map(\.name)])
    }

    func loadIfNeeded() async {
        guard !didLoad else { return }
        didLoad = true
        isLoading = true

        defer { isLoading = false }

        do {
            exercises = try await client
                .from("exercise_library")
                .select()
                .eq("is_active", value: true)
                .eq("is_approved", value: true)
                .order("sort_order", ascending: true)
                .order("name", ascending: true)
                .execute()
                .value
        } catch is CancellationError {
            didLoad = false
        } catch {
            exercises = []
            didLoad = false
        }
    }
}

private actor WorkoutHistoryCache {
    static let shared = WorkoutHistoryCache()

    private struct Container: Codable {
        var schemaVersion = 1
        var recordsByClient: [String: [WorkoutHistoryRecord]] = [:]
    }

    private let fileManager: FileManager
    private let fileURL: URL

    init(fileManager: FileManager = .default, fileURL: URL? = nil) {
        self.fileManager = fileManager
        if let fileURL {
            self.fileURL = fileURL
        } else {
            let applicationSupport = fileManager.urls(
                for: .applicationSupportDirectory,
                in: .userDomainMask
            ).first ?? fileManager.temporaryDirectory
            self.fileURL = applicationSupport
                .appendingPathComponent("FWBTraining", isDirectory: true)
                .appendingPathComponent("workout-history.json", isDirectory: false)
        }
    }

    func records(email: String) -> [WorkoutHistoryRecord] {
        read().recordsByClient[email] ?? []
    }

    func store(_ records: [WorkoutHistoryRecord], email: String) throws {
        var container = read()
        container.recordsByClient[email] = records
        try write(container)
    }

    private func read() -> Container {
        guard let data = try? Data(contentsOf: fileURL),
              let container = try? JSONDecoder().decode(Container.self, from: data) else {
            return Container()
        }
        return container
    }

    private func write(_ container: Container) throws {
        let directory = fileURL.deletingLastPathComponent()
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        try encoder.encode(container).write(to: fileURL, options: [.atomic, .completeFileProtection])
    }
}

@MainActor
final class WorkoutHistoryStore: ObservableObject {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    @Published private(set) var state: LoadState = .idle
    @Published private(set) var sessions: [WorkoutHistorySession] = []

    private let client: SupabaseClient
    private let cache = WorkoutHistoryCache.shared

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
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

        state = .loading
        let cachedRecords = await cache.records(email: normalizedEmail)
        if !cachedRecords.isEmpty {
            sessions = Self.makeSessions(from: cachedRecords)
        }

        do {
            let pageSize = 500
            let maximumRows = 10_000
            var offset = 0
            var allRecords: [WorkoutHistoryRecord] = []
            while offset < maximumRows {
                let page = try await loadHistoryPage(
                    email: normalizedEmail,
                    from: offset,
                    to: offset + pageSize - 1
                )

                guard !Task.isCancelled else { return }
                allRecords.append(contentsOf: page)

                guard page.count == pageSize else { break }
                offset += pageSize
            }

            sessions = Self.makeSessions(from: allRecords)
            try? await cache.store(allRecords, email: normalizedEmail)
            state = .loaded
        } catch is CancellationError {
            return
        } catch {
            state = sessions.isEmpty
                ? .failed("Your workout history could not be loaded. Check your connection and try again.")
                : .loaded
        }
    }

    private func loadHistoryPage(email: String, from: Int, to: Int) async throws -> [WorkoutHistoryRecord] {
        do {
            return try await client
                .from("client_workout_logs")
                .select(
                    "session_id,set_id,entry_date,workout_title,exercise_code,exercise_name,exercise_order,set_number,weight_used,reps,notes,source,source_version,updated_at,completed_at,effort_scale,effort_value,set_type,duration_seconds"
                )
                .eq("client_email", value: email)
                .order("entry_date", ascending: false)
                .order("updated_at", ascending: false)
                .range(from: from, to: to)
                .execute()
                .value
        } catch {
            do {
                return try await client
                    .from("client_workout_logs")
                    .select(
                        "session_id,set_id,entry_date,workout_title,exercise_code,exercise_name,set_number,weight_used,reps,notes,source,source_version,updated_at,completed_at"
                    )
                    .eq("client_email", value: email)
                    .order("entry_date", ascending: false)
                    .order("updated_at", ascending: false)
                    .range(from: from, to: to)
                    .execute()
                    .value
            } catch {
                return try await client
                    .from("client_workout_logs")
                    .select("entry_date,workout_title,exercise_code,exercise_name,set_number,weight_used,reps,notes")
                    .eq("client_email", value: email)
                    .order("entry_date", ascending: false)
                    .order("workout_title", ascending: true)
                    .order("exercise_code", ascending: true)
                    .order("set_number", ascending: true)
                    .range(from: from, to: to)
                    .execute()
                    .value
            }
        }
    }

    private static func makeSessions(from records: [WorkoutHistoryRecord]) -> [WorkoutHistorySession] {
        struct SessionKey: Hashable {
            let sessionID: UUID?
            let entryDate: String
            let workoutTitle: String
        }

        return Dictionary(grouping: records) { record in
            SessionKey(
                sessionID: record.sessionID,
                entryDate: record.entryDate,
                workoutTitle: record.workoutTitle
            )
        }
        .map { key, records in
            var recordsByIdentity: [String: WorkoutHistoryRecord] = [:]
            for record in records {
                let identity: String
                if let setID = record.setID {
                    identity = setID.uuidString.lowercased()
                } else {
                    identity = "legacy|\(record.exerciseCode.lowercased())|\(record.setNumber)"
                }

                if let saved = recordsByIdentity[identity],
                   (saved.updatedAt ?? .distantPast) > (record.updatedAt ?? .distantPast) {
                    continue
                }
                recordsByIdentity[identity] = record
            }
            let deduplicated = Array(recordsByIdentity.values)
            return WorkoutHistorySession(
                entryDate: key.entryDate,
                workoutTitle: key.workoutTitle,
                records: deduplicated
            )
        }
        .sorted { left, right in
            if left.entryDate == right.entryDate {
                return left.workoutTitle.localizedCaseInsensitiveCompare(right.workoutTitle) == .orderedAscending
            }
            return left.entryDate > right.entryDate
        }
    }
}

@MainActor
final class WorkoutLogStore: ObservableObject {
    enum SaveState: Equatable {
        case idle
        case loading
        case ready
        case saving
        case saved
        case failed(String)
    }

    @Published private(set) var state: SaveState = .idle
    @Published private(set) var remoteSessionID: UUID?
    @Published private(set) var baseRemoteUpdatedAt: Date?
    @Published private(set) var completedAt: Date?

    private let client: SupabaseClient
    private var loadedKeys: Set<WorkoutLogKey> = []
    private var supportsEffortColumns = true

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
    }

    func load(
        email: String,
        workoutTitle: String,
        entryDate: String,
        excludedExerciseCodes: Set<String> = []
    ) async -> [WorkoutLogRecord] {
        state = .loading
        remoteSessionID = nil
        baseRemoteUpdatedAt = nil
        completedAt = nil

        do {
            let normalizedEmail = ContinuitySync.normalize(email: email)
            let records: [WorkoutLogRecord]
            do {
                records = try await client
                    .from("client_workout_logs")
                    .select("session_id,set_id,exercise_code,exercise_name,exercise_order,set_number,weight_used,reps,notes,source,source_version,updated_at,completed_at,effort_scale,effort_value,set_type,duration_seconds")
                    .eq("client_email", value: normalizedEmail)
                    .eq("entry_date", value: entryDate)
                    .eq("workout_title", value: workoutTitle)
                    .order("updated_at", ascending: false)
                    .execute()
                    .value
                supportsEffortColumns = true
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                do {
                    records = try await client
                        .from("client_workout_logs")
                        .select("session_id,set_id,exercise_code,exercise_name,set_number,weight_used,reps,notes,source,source_version,updated_at,completed_at")
                        .eq("client_email", value: normalizedEmail)
                        .eq("entry_date", value: entryDate)
                        .eq("workout_title", value: workoutTitle)
                        .order("updated_at", ascending: false)
                        .execute()
                        .value
                    supportsEffortColumns = false
                } catch {
                    records = try await loadRecords(
                        email: normalizedEmail,
                        workoutTitle: workoutTitle,
                        entryDate: entryDate,
                        columns: "exercise_code,exercise_name,set_number,weight_used,reps,notes"
                    )
                    supportsEffortColumns = false
                }
            }
            remoteSessionID = records.compactMap(\.sessionID).first
            baseRemoteUpdatedAt = records.compactMap(\.updatedAt).max()
            completedAt = records.compactMap(\.completedAt).max()
            let visibleRecords = records.filter {
                !excludedExerciseCodes.contains($0.exerciseCode.uppercased())
            }
            loadedKeys = Set(visibleRecords.map(\.key))
            state = .ready
            return visibleRecords
        } catch is CancellationError {
            return []
        } catch {
            state = .failed("Existing sets could not be loaded. You can try again before saving.")
            return []
        }
    }

    private func loadRecords(
        email: String,
        workoutTitle: String,
        entryDate: String,
        columns: String
    ) async throws -> [WorkoutLogRecord] {
        try await client
            .from("client_workout_logs")
            .select(columns)
            .eq("client_email", value: email)
            .eq("entry_date", value: entryDate)
            .eq("workout_title", value: workoutTitle)
            .order("exercise_code", ascending: true)
            .order("set_number", ascending: true)
            .execute()
            .value
    }

    func save(
        email: String,
        workoutTitle: String,
        entryDate: String,
        drafts: [WorkoutSetDraft]
    ) async -> Bool {
        if drafts.contains(where: {
            $0.setType == .timed && $0.containsEntry && $0.durationValue <= 0
        }) {
            state = .failed("Enter a duration for every timed set before saving.")
            return false
        }

        var nextExerciseOrder = 0
        var exerciseOrder: [String: Int] = [:]
        for draft in drafts where exerciseOrder[draft.exerciseCode] == nil {
            exerciseOrder[draft.exerciseCode] = nextExerciseOrder
            nextExerciseOrder += 1
        }

        let payloads = drafts.compactMap { draft -> WorkoutLogPayload? in
            guard draft.containsEntry else { return nil }

            return WorkoutLogPayload(
                sessionID: remoteSessionID ?? UUID(),
                setID: draft.id,
                workoutTemplateID: nil,
                clientEmail: email.lowercased(),
                entryDate: entryDate,
                workoutTitle: workoutTitle,
                exerciseCode: draft.exerciseCode,
                exerciseName: draft.exerciseName,
                exerciseOrder: exerciseOrder[draft.exerciseCode] ?? 0,
                setNumber: draft.setNumber,
                weightUsed: Double(draft.weight) ?? 0,
                reps: draft.setType == .timed ? nil : Double(draft.reps),
                notes: draft.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? nil
                    : draft.notes.trimmingCharacters(in: .whitespacesAndNewlines),
                source: ContinuitySync.source,
                sourceVersion: ContinuitySync.sourceVersion,
                clientUpdatedAt: ContinuityDateCoding.string(from: Date()),
                completedAt: completedAt.map(ContinuityDateCoding.string),
                effortScale: draft.validatedEffortValue == nil ? nil : draft.effortScale,
                effortValue: draft.validatedEffortValue,
                setType: draft.setType,
                durationSeconds: draft.setType == .timed ? Double(draft.duration) : nil
            )
        }

        if let invalidDraft = drafts.first(where: { $0.effortValidationMessage != nil }) {
            state = .failed(invalidDraft.effortValidationMessage ?? "Check the effort rating and try again.")
            return false
        }

        guard !payloads.isEmpty || !loadedKeys.isEmpty else {
            state = .failed("Enter weight, reps, time, a note, or effort for at least one set.")
            return false
        }

        state = .saving

        do {
            if !payloads.isEmpty {
                do {
                    try await client
                        .from("client_workout_logs")
                        .upsert(payloads, onConflict: "session_id,set_id")
                        .execute()
                } catch {
                    try await client
                        .from("client_workout_logs")
                        .upsert(
                            payloads.map(LegacyWorkoutLogPayload.init),
                            onConflict: "client_email,entry_date,workout_title,exercise_code,set_number"
                        )
                        .execute()
                }
            }

            let currentKeys = Set(
                drafts
                    .filter(\.containsEntry)
                    .map(\.logKey)
            )
            let removedKeys = loadedKeys.subtracting(currentKeys)

            for key in removedKeys {
                try await client
                    .from("client_workout_logs")
                    .delete()
                    .eq("client_email", value: email.lowercased())
                    .eq("entry_date", value: entryDate)
                    .eq("workout_title", value: workoutTitle)
                    .eq("exercise_code", value: key.exerciseCode)
                    .eq("set_number", value: key.setNumber)
                    .execute()
            }

            loadedKeys = currentKeys
            state = .saved
            return true
        } catch is CancellationError {
            return false
        } catch {
            state = .failed("Your sets could not be saved. Check your connection and try again.")
            return false
        }
    }
}
