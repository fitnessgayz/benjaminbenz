// Optional FWB sharing. Every category requires separate client consent; tests use fakes.
import Foundation
import Supabase

@MainActor
protocol AppleHealthImportRepository {
    func sharedCategories(account: SignedInAccount) async throws -> Set<AppleHealthImportCategory>
    func setSharedCategories(_ categories: Set<AppleHealthImportCategory>, account: SignedInAccount) async throws
    func sync(_ snapshot: AppleHealthImportSnapshot, categories: Set<AppleHealthImportCategory>, account: SignedInAccount) async throws
}

@MainActor
final class SupabaseAppleHealthImportRepository: AppleHealthImportRepository {
    private let client: SupabaseClient
    init(client: SupabaseClient = AppConfiguration.supabase) { self.client = client }

    private func verify(_ account: SignedInAccount) async throws {
        let user = try await client.auth.user()
        guard user.id == account.id,
              user.email?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                == account.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() else {
            throw AppleHealthImportError.wrongAccount
        }
        try Task.checkCancellation()
    }

    func sharedCategories(account: SignedInAccount) async throws -> Set<AppleHealthImportCategory> {
        try await verify(account)
        struct Row: Decodable { let shared_categories: [AppleHealthImportCategory] }
        let rows: [Row] = try await client.from("client_apple_health_settings").select("shared_categories")
            .eq("user_id", value: account.id.uuidString).limit(1).execute().value
        return Set(rows.first?.shared_categories ?? [])
    }

    func setSharedCategories(_ categories: Set<AppleHealthImportCategory>, account: SignedInAccount) async throws {
        try await verify(account)
        struct Parameters: Encodable { let p_expected_user_id: UUID; let p_categories: [String] }
        try await client.rpc("set_apple_health_sharing", params: Parameters(p_expected_user_id: account.id, p_categories: categories.map(\.rawValue).sorted())).execute()
    }

    func sync(_ snapshot: AppleHealthImportSnapshot, categories: Set<AppleHealthImportCategory>, account: SignedInAccount) async throws {
        try await verify(account)
        guard !categories.isEmpty, snapshot.workouts.count <= 1000, snapshot.daily.count <= 32 else {
            throw AppleHealthImportError.invalidSelection
        }
        try await client.rpc("replace_apple_health_snapshot", params: AppleHealthSnapshotUpload(snapshot: snapshot, categories: categories, accountID: account.id)).execute()
    }
}

/// Category filtering is performed again at the serialization boundary. Server
/// consent and RLS independently enforce these limits; this is not authorization.
struct AppleHealthSnapshotUpload: Encodable {
    let p_expected_user_id: UUID
    let p_since: String
    let p_since_day: String
    let p_categories: [String]
    let p_workouts: [WorkoutUpload]
    let p_daily: [AppleHealthDailySummary]

    init(snapshot: AppleHealthImportSnapshot, categories: Set<AppleHealthImportCategory>, accountID: UUID) {
        p_expected_user_id = accountID
        let selected = snapshot.filtered(to: categories)
        p_since = snapshot.since.ISO8601Format()
        p_since_day = AppleHealthImportRules.day(snapshot.since)
        p_categories = categories.map(\.rawValue).sorted()
        p_workouts = selected.workouts.map(WorkoutUpload.init)
        p_daily = selected.daily
    }

    struct WorkoutUpload: Encodable {
        let healthkit_id: UUID
        let activity_type: String
        let started_at: String
        let ended_at: String
        let duration_seconds: Double
        let active_calories: Double?
        let distance_meters: Double?
        let average_heart_rate: Double?
        let source_name: String
        init(_ workout: AppleHealthImportedWorkout) {
            healthkit_id = workout.healthkitID
            activity_type = workout.activityType
            started_at = workout.startedAt.ISO8601Format()
            ended_at = workout.endedAt.ISO8601Format()
            duration_seconds = workout.durationSeconds
            active_calories = workout.activeCalories
            distance_meters = workout.distanceMeters
            average_heart_rate = workout.averageHeartRate
            source_name = workout.sourceName
        }
    }
}
