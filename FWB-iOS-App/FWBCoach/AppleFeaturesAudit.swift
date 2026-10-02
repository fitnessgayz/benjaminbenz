#if DEBUG
import SwiftUI

/// Simulator-only fixtures: no account authentication, HealthKit or network reads.
struct AppleFeaturesAuditView: View {
    private let account = SignedInAccount(id: UUID(uuidString: "11111111-1111-4111-8111-111111111111")!, email: "fixture@example.test")
    @StateObject private var health = AppleHealthImportStore(reader: AuditHealthReader(), defaults: UserDefaults(suiteName: "fwb.apple.audit")!, repository: AuditHealthRepository())
    var body: some View {
        NavigationStack {
            if ProcessInfo.processInfo.arguments.contains("--apple-health-history-audit") {
                WorkoutHistoryView(clientEmail: account.email, healthStore: health)
                    .task {
                        health.configure(account: account)
                        health.select(.workouts, enabled: true)
                        await health.refresh(force: true)
                    }
            } else { List {
                Text("Apple feature preview · fixture data").font(.caption)
                NavigationLink("Apple Health") { AppleHealthImportSettingsView(account: account, store: health) }
                NavigationLink("Detected workout preview") {
                    AppleHealthDetectedWorkoutView(account: account,
                        workoutID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!, health: health)
                }
                NavigationLink("Unavailable workout preview") {
                    AppleHealthDetectedWorkoutView(account: account, workoutID: UUID(), health: health)
                }
                NavigationLink("Apple Watch & widgets") { AppleWorkoutFeaturesView() }
            }.navigationTitle("FWB Apple features") }
        }.tint(Color.fwbLime)
        .task {
            health.configure(account: account)
            health.select(.workouts, enabled: true)
            await health.refresh(force: true)
        }
    }
}
@MainActor
private final class AuditHealthReader: AppleHealthImportReading {
    var isAvailable: Bool { true }
    func requestAccess(to categories: Set<AppleHealthImportCategory>) async throws {}
    func read(categories: Set<AppleHealthImportCategory>, now: Date) async throws -> AppleHealthImportSnapshot {
        AppleHealthImportSnapshot(since: now.addingTimeInterval(-86400), workouts: [
            AppleHealthImportedWorkout(healthkitID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!, activityType: "Running", startedAt: now.addingTimeInterval(-7200), endedAt: now.addingTimeInterval(-5400), durationSeconds: 1800, activeCalories: 280, distanceMeters: 5000, averageHeartRate: 142, sourceName: "Apple Watch"),
            AppleHealthImportedWorkout(healthkitID: UUID(uuidString: "33333333-3333-4333-8333-333333333333")!, activityType: "Yoga", startedAt: now.addingTimeInterval(-18000), endedAt: now.addingTimeInterval(-16200), durationSeconds: 1800, sourceName: "Health app")
        ], daily: [AppleHealthDailySummary(date: AppleHealthImportRules.day(now), steps: 7000, sleepMinutes: 450, restingHeartRate: 60, hrvMS: 50, bodyWeightKG: 80)]).filtered(to: categories)
    }
    func observe(categories: Set<AppleHealthImportCategory>, changed: @escaping @MainActor () async -> Void) {}
    func stopObserving() {}
}
@MainActor
private final class AuditHealthRepository: AppleHealthImportRepository {
    private var categories: Set<AppleHealthImportCategory> = []
    func sharedCategories(account: SignedInAccount) async throws -> Set<AppleHealthImportCategory> { categories }
    func setSharedCategories(_ categories: Set<AppleHealthImportCategory>, account: SignedInAccount) async throws { self.categories = categories }
    func sync(_ snapshot: AppleHealthImportSnapshot, categories: Set<AppleHealthImportCategory>, account: SignedInAccount) async throws {}
}
#endif
