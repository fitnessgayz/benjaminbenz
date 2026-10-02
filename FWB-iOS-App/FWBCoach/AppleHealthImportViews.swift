import SwiftUI
import Charts

struct AppleHealthImportSettingsView: View {
    let account: SignedInAccount
    @ObservedObject private var store: AppleHealthImportStore
    @Environment(\.scenePhase) private var scenePhase
    @State private var showClearConfirmation = false
    @State private var pendingSharing: AppleHealthImportCategory?
    @State private var showShareConfirmation = false
    @State private var showStopSharing = false

    @MainActor init(account: SignedInAccount, store: AppleHealthImportStore? = nil) {
        self.account = account
        self.store = store ?? .shared
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                SectionHeading(kicker: "Your health", title: "Apple Health")
                Text("View the last 30 days of information you choose to allow. Completed workouts from Apple Watch and apps that save to Apple Health appear in Logs.")
                    .foregroundStyle(Color.fwbMuted)
                VStack(alignment: .leading, spacing: 16) {
                    Text("Information to view").font(.headline)
                    ForEach(AppleHealthImportCategory.allCases) { category in
                        Toggle(category.title, isOn: Binding(
                            get: { store.selectedCategories.contains(category) },
                            set: { store.select(category, enabled: $0) }))
                            .disabled(store.isWorking || !store.isAvailable)
                            .accessibilityIdentifier("appleHealth.category.\(category.rawValue)")
                    }
                    Button {
                        Task { await store.requestAccess() }
                    } label: {
                        Label("Choose Apple Health permissions", systemImage: "heart.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(store.isWorking || store.selectedCategories.isEmpty || !store.isAvailable)
                    .accessibilityIdentifier("appleHealth.permissions")
                    if !store.isAvailable { Text("Apple Health is available on supported iPhones.").font(.footnote) }
                    Text("Your choices in Apple Health decide what FWB can read. To change an existing permission, open Health → your profile → Apps → FWB Training.")
                        .font(.footnote).foregroundStyle(Color.fwbMuted)
                }
                .padding().background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 20))

                VStack(alignment: .leading, spacing: 12) {
                    Label("Automatic workout import", systemImage: "arrow.triangle.2.circlepath")
                        .font(.headline)
                    Toggle("Automatically sync workouts", isOn: Binding(
                        get: { store.automaticWorkoutSyncEnabled },
                        set: { enabled in Task { await store.setAutomaticWorkoutSync(enabled) } }))
                        .disabled(store.isWorking || store.isUpdatingSharing || !store.isAvailable || !store.selectedCategories.contains(.workouts))
                        .accessibilityIdentifier("appleHealth.automaticWorkoutSync")
                    Text("Import completed workouts recorded by Apple Watch or other Apple Health apps. iOS controls when background updates arrive; FWB also checks when you open the app.")
                        .font(.footnote).foregroundStyle(Color.fwbMuted)
                    if !store.selectedCategories.contains(.workouts) {
                        Text("Select Workouts & workout heart rate above to enable automatic import.")
                            .font(.footnote).foregroundStyle(Color.fwbMuted)
                    }
                    Text(store.backgroundSyncMessage)
                        .font(.footnote)
                        .accessibilityAddTraits(.updatesFrequently)
                    Text("Sharing with your FWB account and coach is a separate choice below.")
                        .font(.footnote).foregroundStyle(Color.fwbMuted)
                }
                .padding().background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 20))

                WorkoutDetectionNotificationSettingsView(health: store)

                VStack(alignment: .leading, spacing: 10) {
                    Label("Share with FWB & your coach", systemImage: "person.2")
                        .font(.headline)
                    Text("Device access does not turn on sharing. Choose categories below to sync the last 30 days to your FWB account service and display them on the web and to your coach. Turning a category off deletes its imported FWB records. Manual logs and Apple Health records are unchanged.")
                        .font(.footnote).foregroundStyle(Color.fwbMuted)
                    ForEach(AppleHealthImportCategory.allCases) { category in
                        Toggle(category.title, isOn: Binding(
                            get: { store.sharedCategories.contains(category) },
                            set: { enabled in
                                if enabled { pendingSharing = category; showShareConfirmation = true }
                                else { Task { await store.setSharing(store.sharedCategories.subtracting([category])) } }
                            }))
                            .disabled(!store.sharingLoaded || store.isWorking || store.isUpdatingSharing || (!store.selectedCategories.contains(category) && !store.sharedCategories.contains(category)))
                            .accessibilityIdentifier("appleHealth.share.\(category.rawValue)")
                    }
                    Text(store.sharingMessage).font(.footnote)
                    if !store.sharingLoaded {
                        Button("Check sharing status") { Task { await store.loadSharing() } }
                    }
                    if !store.sharedCategories.isEmpty {
                        Button("Stop all sharing & delete imports", role: .destructive) { showStopSharing = true }
                            .disabled(store.isWorking || store.isUpdatingSharing || !store.sharingLoaded)
                    }
                }
                .padding().background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 20))

                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(store.message).font(.footnote)
                        if let refreshed = store.refreshedAt {
                            Text("Updated \(refreshed.formatted(date: .abbreviated, time: .shortened))")
                                .font(.caption).foregroundStyle(Color.fwbMuted)
                        }
                    }
                    Spacer()
                    if store.isWorking { ProgressView() }
                    else {
                        Button { Task { await store.refresh(force: true) } } label: {
                            Label("Sync now", systemImage: "arrow.clockwise")
                                .font(.footnote).padding(8)
                        }.accessibilityLabel("Refresh Apple Health")
                            .disabled(store.selectedCategories.isEmpty)
                    }
                }
                .accessibilityElement(children: .combine)

                if let snapshot = store.snapshot {
                    AppleHealthSummaryView(snapshot: snapshot)
                }
                Button("Turn off viewing & clear preview", role: .destructive) { showClearConfirmation = true }
                    .disabled(store.isWorking || store.isUpdatingSharing || (store.selectedCategories.isEmpty && store.snapshot == nil))
                    .accessibilityIdentifier("appleHealth.clear")
            }.padding()
        }
        .background(Color.fwbBackground)
        .tint(Color.fwbLime)
        .navigationTitle("Apple Health")
        .navigationBarTitleDisplayMode(.inline)
        .task { store.configure(account: account); await store.loadSharing(); await store.refresh() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.refresh() } }
        }
        .confirmationDialog("Turn off Apple Health viewing?", isPresented: $showClearConfirmation) {
            Button("Turn off & clear preview", role: .destructive) { store.clearLocalData() }
        } message: { Text("This clears the device preview and stops local reading. To delete previously shared FWB imports, use Stop all sharing. Apple Health is unchanged.") }
        .confirmationDialog("Share with FWB and your coach?", isPresented: $showShareConfirmation) {
            Button("Share selected category") {
                guard let category = pendingSharing else { return }
                Task { await store.setSharing(store.sharedCategories.union([category])) }
            }
        } message: {
            Text("\(pendingSharing?.sharingFields ?? "") These records and dates will be sent to your FWB account service and visible on the web and to your coach. You can stop sharing and delete imported records here.")
        }
        .confirmationDialog("Stop sharing and delete all imported FWB records?", isPresented: $showStopSharing) {
            Button("Stop sharing & delete imports", role: .destructive) { Task { await store.setSharing([]) } }
        } message: { Text("Your Apple Health records, manual training logs, and measurements remain unchanged.") }
    }
}

struct AppleHealthSummaryView: View {
    let snapshot: AppleHealthImportSnapshot
    @State private var showKilograms = false
    private var latest: AppleHealthDailySummary? { snapshot.daily.first }
    private var weights: [AppleHealthDailySummary] { snapshot.daily.filter { $0.bodyWeightKG != nil }.sorted { $0.date < $1.date } }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let latest {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Daily activity & recovery").font(.headline)
                    Text(latest.date).font(.caption).foregroundStyle(Color.fwbMuted)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 14) {
                        metric("Steps", value: latest.steps.map { $0.formatted(.number.precision(.fractionLength(0))) })
                        metric("Sleep", value: latest.sleepMinutes.map { String(format: "%.1f h", $0 / 60) })
                        metric("Resting heart rate", value: latest.restingHeartRate.map { String(format: "%.0f bpm", $0) })
                        metric("HRV", value: latest.hrvMS.map { String(format: "%.0f ms", $0) })
                    }
                    Text("Sleep is total time asleep during this calendar day. Trends describe your records; they are not a readiness score.")
                        .font(.caption).foregroundStyle(Color.fwbMuted)
                }.padding().background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 20))
            }
            if snapshot.daily.contains(where: { $0.steps != nil || $0.sleepMinutes != nil || $0.restingHeartRate != nil || $0.hrvMS != nil }) {
                AppleHealthDailyTrendView(days: snapshot.daily)
            }
            if !weights.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Body weight trend").font(.headline)
                        Spacer()
                        Picker("Weight unit", selection: $showKilograms) {
                            Text("lb").tag(false); Text("kg").tag(true)
                        }.pickerStyle(.segmented).frame(width: 100)
                    }
                    if let last = weights.last, let weight = last.bodyWeightKG {
                        Text("\(weight * (showKilograms ? 1 : 2.2046226218), specifier: "%.1f") \(showKilograms ? "kg" : "lb")")
                            .font(.title2.bold())
                        Text(last.date).font(.caption).foregroundStyle(Color.fwbMuted)
                    }
                    Chart(weights) { row in
                        if let weight = row.bodyWeightKG {
                            LineMark(x: .value("Date", row.date), y: .value("Weight", weight * (showKilograms ? 1 : 2.2046226218)))
                            PointMark(x: .value("Date", row.date), y: .value("Weight", weight * (showKilograms ? 1 : 2.2046226218)))
                        }
                    }
                    .chartYScale(domain: .automatic(includesZero: false))
                    .chartXAxis(.hidden)
                    .frame(height: 150)
                    Text("Latest available weigh-in each day from Apple Health. Manual FWB measurements are kept separately.")
                        .font(.caption).foregroundStyle(Color.fwbMuted)
                }.padding().background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 20))
            }
            if !snapshot.daily.isEmpty {
                DisclosureGroup("Daily history · \(snapshot.daily.count) days") {
                    ForEach(snapshot.daily) { day in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(day.date).font(.subheadline.bold())
                            Text(historyText(day)).font(.caption).foregroundStyle(Color.fwbMuted)
                        }.frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 6)
                    }
                }.padding().background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 20))
            }
            if !snapshot.workouts.isEmpty {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Apple Health workouts · \(snapshot.workouts.count)").font(.headline)
                    Text("Imported for viewing. Workouts already saved by FWB are excluded to prevent duplicates.")
                        .font(.caption).foregroundStyle(Color.fwbMuted)
                    LazyVStack(spacing: 12) {
                        ForEach(snapshot.workouts) { workout in
                            AppleHealthWorkoutRow(workout: workout)
                            Divider()
                        }
                    }
                }.padding().background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 20))
            }
        }
    }

    private func metric(_ title: String, value: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption).foregroundStyle(Color.fwbMuted)
            Text(value ?? "No data").font(.headline)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private func historyText(_ day: AppleHealthDailySummary) -> String {
        [day.steps.map { String(format: "%.0f steps", $0) },
         day.sleepMinutes.map { String(format: "%.1f h asleep", $0 / 60) },
         day.restingHeartRate.map { String(format: "RHR %.0f bpm", $0) },
         day.hrvMS.map { String(format: "HRV %.0f ms", $0) },
         day.bodyWeightKG.map { String(format: "%.1f %@", $0 * (showKilograms ? 1 : 2.2046226218), showKilograms ? "kg" : "lb") }]
            .compactMap { $0 }.joined(separator: " · ")
    }
}

/// Shared by the Health preview and Logs; unavailable measurements stay absent.
struct AppleHealthWorkoutRow: View {
    let workout: AppleHealthImportedWorkout

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(workout.activityType).font(.subheadline.bold())
            Text(workout.startedAt.formatted(date: .abbreviated, time: .shortened))
                .font(.caption).foregroundStyle(Color.fwbMuted)
            Text(measurements).font(.footnote)
            Label(workout.sourceName, systemImage: "heart.fill")
                .font(.caption).foregroundStyle(Color.fwbMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    private var measurements: String {
        [String(format: "%.0f min", workout.durationSeconds / 60),
         workout.activeCalories.map { String(format: "%.0f active kcal", $0) },
         workout.distanceMeters.map { String(format: "%.2f mi", $0 / 1609.344) },
         workout.averageHeartRate.map { String(format: "%.0f bpm avg", $0) }]
            .compactMap { $0 }.joined(separator: " · ")
    }
}

private struct AppleHealthDailyTrendView: View {
    let days: [AppleHealthDailySummary]
    @State private var metric: Metric = .steps
    private enum Metric: String, CaseIterable, Identifiable {
        case steps = "Steps", sleep = "Sleep", resting = "Resting HR", hrv = "HRV"
        var id: String { rawValue }
        var unit: String {
            switch self { case .steps: "steps"; case .sleep: "hours"; case .resting: "bpm"; case .hrv: "ms" }
        }
        func value(_ day: AppleHealthDailySummary) -> Double? {
            switch self {
            case .steps: day.steps
            case .sleep: day.sleepMinutes.map { $0 / 60 }
            case .resting: day.restingHeartRate
            case .hrv: day.hrvMS
            }
        }
    }
    private var available: [Metric] { Metric.allCases.filter { candidate in days.contains { candidate.value($0) != nil } } }
    private var selected: Metric { available.contains(metric) ? metric : (available.first ?? .steps) }
    private var points: [AppleHealthDailySummary] { days.filter { selected.value($0) != nil }.sorted { $0.date < $1.date } }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("30-day trends").font(.headline)
            Picker("Health trend", selection: Binding(get: { selected }, set: { metric = $0 })) {
                ForEach(available) { item in Text(item.rawValue).tag(item) }
            }.pickerStyle(.segmented)
            Chart(points) { day in
                if let value = selected.value(day) {
                    BarMark(x: .value("Date", day.date), y: .value(selected.unit, value))
                }
            }.chartXAxis(.hidden).frame(height: 150)
            Text("\(selected.rawValue) in \(selected.unit) · \(points.count) days with available readings")
                .font(.caption).foregroundStyle(Color.fwbMuted)
        }.padding().background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 20))
    }
}


private struct WorkoutDetectionNotificationSettingsView: View {
    @ObservedObject var health: AppleHealthImportStore
    @ObservedObject private var notifications: WorkoutDetectionNotificationStore

    init(health: AppleHealthImportStore) {
        self.health = health
        self.notifications = health.detectionNotifications
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Workout detection alerts", systemImage: "bell.badge")
                .font(.headline)
            Toggle("Notify me when a workout is detected", isOn: Binding(
                get: { notifications.isEnabled },
                set: { enabled in
                    Task { await notifications.setEnabled(enabled, knownWorkouts: health.snapshot?.workouts ?? []) }
                }))
                .disabled(notifications.isUpdatingAuthorization || health.isWorking
                    || !health.selectedCategories.contains(.workouts))
                .accessibilityIdentifier("appleHealth.detectionNotifications")
            Text("Get an alert when FWB finds a newly completed Apple Health workout. Tap it to view the activity in Logs. Older workouts won't trigger alerts when you enable this.")
                .font(.footnote).foregroundStyle(Color.fwbMuted)
            Text(notifications.message).font(.footnote)
                .accessibilityAddTraits(.updatesFrequently)
            if !health.automaticWorkoutSyncEnabled {
                Text("Enable automatic workout sync above to receive alerts when iOS delivers updates in the background. Otherwise, FWB checks when you open the app.")
                    .font(.footnote).foregroundStyle(Color.fwbMuted)
            }
        }
        .padding().background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 20))
    }
}

struct AppleHealthDetectedWorkoutView: View {
    let account: SignedInAccount
    let workoutID: UUID
    @ObservedObject private var health: AppleHealthImportStore
    @State private var hasChecked = false

    @MainActor init(account: SignedInAccount, workoutID: UUID, health: AppleHealthImportStore? = nil) {
        self.account = account
        self.workoutID = workoutID
        self.health = health ?? .shared
    }

    private var workout: AppleHealthImportedWorkout? {
        guard health.account?.id == account.id, health.selectedCategories.contains(.workouts) else { return nil }
        return health.snapshot?.workouts.first { $0.id == workoutID }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let workout {
                    Label("Apple Health workout", systemImage: "heart.fill").font(.headline)
                    AppleHealthWorkoutRow(workout: workout)
                        .padding().background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 20))
                    Text("This activity is available under Logs → Apple Health workouts. Sharing with your coach follows your Apple Health sharing settings.")
                        .font(.footnote).foregroundStyle(Color.fwbMuted)
                } else if !hasChecked || health.isWorking {
                    ProgressView("Loading detected workout…")
                } else {
                    Text("Workout unavailable").font(.headline)
                    Text("The workout may have been removed, be outside the last 30 days, or no longer be readable. Check your workout access in Settings → Apple Health.")
                        .foregroundStyle(Color.fwbMuted)
                    Button("Try again") { Task { await refresh() } }
                }
            }.frame(maxWidth: .infinity, alignment: .leading).padding()
        }
        .background(Color.fwbBackground)
        .navigationTitle("Detected workout")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: workoutID) { await refresh() }
        .accessibilityIdentifier("appleHealth.detectedWorkout")
    }

    private func refresh() async {
        guard health.account?.id == account.id else { hasChecked = true; return }
        await health.refresh(force: true)
        hasChecked = true
    }
}
