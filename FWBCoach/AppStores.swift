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
        case failed(String)
    }

    @Published private(set) var state: LoadState = .idle
    @Published private(set) var program: ClientProgram?
    @Published private(set) var nutritionSaveState: NutritionSaveState = .idle

    private let client: SupabaseClient

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
    }

    func loadIfNeeded() async {
        guard state == .idle else { return }
        await reload()
    }

    func reload() async {
        state = .loading

        do {
            let programs: [ClientProgram] = try await client
                .from("client_programs")
                .select()
                .eq("active", value: true)
                .eq("client_archived", value: false)
                .order("updated_at", ascending: false)
                .limit(1)
                .execute()
                .value

            program = programs.first
            state = .loaded
        } catch is CancellationError {
            return
        } catch {
            state = .failed("Your training plan could not be loaded. Check your connection and try again.")
        }
    }

    func saveNutritionPlan(programID: UUID, plan: NutritionPlan) async -> Bool {
        nutritionSaveState = .saving

        do {
            let updatedProgram: ClientProgram = try await client
                .from("client_programs")
                .update(ClientNutritionPlanUpdate(nutritionPlan: plan))
                .eq("id", value: programID.uuidString)
                .select()
                .single()
                .execute()
                .value

            program = updatedProgram
            nutritionSaveState = .saved
            return true
        } catch is CancellationError {
            nutritionSaveState = .idle
            return false
        } catch {
            nutritionSaveState = .failed("Your targets could not be saved. Check your connection and try again.")
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
        ExerciseSuggestionLibrary.merged(
            exercises.map { exercise in
                [exercise.name] + exercise.aliases
            }
        )
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

        do {
            let pageSize = 500
            let maximumRows = 10_000
            var offset = 0
            var allRecords: [WorkoutHistoryRecord] = []

            while offset < maximumRows {
                let page: [WorkoutHistoryRecord] = try await client
                    .from("client_workout_logs")
                    .select(
                        "entry_date,workout_title,exercise_code,exercise_name,set_number,weight_used,reps,notes"
                    )
                    .eq("client_email", value: normalizedEmail)
                    .order("entry_date", ascending: false)
                    .order("workout_title", ascending: true)
                    .order("exercise_code", ascending: true)
                    .order("set_number", ascending: true)
                    .range(from: offset, to: offset + pageSize - 1)
                    .execute()
                    .value

                guard !Task.isCancelled else { return }
                allRecords.append(contentsOf: page)

                guard page.count == pageSize else { break }
                offset += pageSize
            }

            sessions = Self.makeSessions(from: allRecords)
            state = .loaded
        } catch is CancellationError {
            return
        } catch {
            state = .failed("Your workout history could not be loaded. Check your connection and try again.")
        }
    }

    private static func makeSessions(from records: [WorkoutHistoryRecord]) -> [WorkoutHistorySession] {
        struct SessionKey: Hashable {
            let entryDate: String
            let workoutTitle: String
        }

        return Dictionary(grouping: records) { record in
            SessionKey(entryDate: record.entryDate, workoutTitle: record.workoutTitle)
        }
        .map { key, records in
            WorkoutHistorySession(
                entryDate: key.entryDate,
                workoutTitle: key.workoutTitle,
                records: records
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

    private let client: SupabaseClient
    private var loadedKeys: Set<WorkoutLogKey> = []

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

        do {
            let records: [WorkoutLogRecord] = try await client
                .from("client_workout_logs")
                .select("exercise_code,exercise_name,set_number,weight_used,reps,notes")
                .eq("client_email", value: email)
                .eq("entry_date", value: entryDate)
                .eq("workout_title", value: workoutTitle)
                .order("exercise_code", ascending: true)
                .order("set_number", ascending: true)
                .execute()
                .value
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

    func save(
        email: String,
        workoutTitle: String,
        entryDate: String,
        drafts: [WorkoutSetDraft]
    ) async -> Bool {
        let payloads = drafts.compactMap { draft -> WorkoutLogPayload? in
            guard draft.containsEntry else { return nil }

            return WorkoutLogPayload(
                clientEmail: email.lowercased(),
                entryDate: entryDate,
                workoutTitle: workoutTitle,
                exerciseCode: draft.exerciseCode,
                exerciseName: draft.exerciseName,
                setNumber: draft.setNumber,
                weightUsed: Double(draft.weight) ?? 0,
                reps: Double(draft.reps),
                notes: draft.notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    ? nil
                    : draft.notes.trimmingCharacters(in: .whitespacesAndNewlines)
            )
        }

        guard !payloads.isEmpty || !loadedKeys.isEmpty else {
            state = .failed("Enter weight, reps, or a note for at least one set.")
            return false
        }

        state = .saving

        do {
            if !payloads.isEmpty {
                try await client
                    .from("client_workout_logs")
                    .upsert(
                        payloads,
                        onConflict: "client_email,entry_date,workout_title,exercise_code,set_number"
                    )
                    .execute()
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
