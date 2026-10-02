import SwiftUI

enum DailyCheckInEntry: String { case welcome, checkIn, workout }

/// A dismissal is local to this account and calendar day, never a workout log.
struct DailyCheckInPromptHistory {
    let defaults: UserDefaults
    init(defaults: UserDefaults = .standard) { self.defaults = defaults }
    private func key(_ account: SignedInAccount) -> String { "fwb.daily-checkin.prompt.v1.\(account.id.uuidString.lowercased())" }
    func shouldPresent(account: SignedInAccount, checkIn: ReadinessCheckIn?, date: Date = Date(), calendar: Calendar = .current) -> Bool {
        guard !account.isCoach else { return false }
        let day = ReadinessCheckIn.localDateKey(for: date, calendar: calendar)
        if let checkIn, checkIn.localDate == day,
           ContinuitySync.normalize(email: checkIn.clientEmail) == ContinuitySync.normalize(email: account.email) { return false }
        return defaults.string(forKey: key(account)) != day
    }
    func recordPresentation(account: SignedInAccount, date: Date = Date(), calendar: Calendar = .current) {
        guard !account.isCoach else { return }
        defaults.set(ReadinessCheckIn.localDateKey(for: date, calendar: calendar), forKey: key(account))
    }
}

struct DailyCheckInHomeCard: View {
    @ObservedObject var store: DailyReadinessStore
    let open: (DailyCheckInEntry) -> Void
    private var today: ReadinessCheckIn? {
        guard let checkIn = store.today, checkIn.localDate == ReadinessCheckIn.localDateKey() else { return nil }
        return checkIn
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("DAILY CHECK-IN", systemImage: "face.smiling")
                .font(FWBFont.caption.weight(.bold)).foregroundStyle(Color.fwbLime)
            Text(today == nil ? "How are you feeling today?" : "Your workout for today")
                .font(FWBFont.title3.weight(.bold))
            if store.state == .idle || store.state == .loading {
                ProgressView("Loading today’s check-in…")
            } else if case .failed(let message) = store.state {
                Text(message).font(FWBFont.footnote).foregroundStyle(Color.fwbRed)
                Button("Retry check-in") { Task { await store.load() } }.foregroundStyle(Color.fwbLime)
            } else if let today {
                Text("Mood \(today.mood.map { "\($0)/5" } ?? "not rated") · Energy \(today.energy)/5")
                    .font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted)
                Button("View today’s workout") { open(.workout) }
                    .buttonStyle(FWBPrimaryButtonStyle()).accessibilityIdentifier("daily.home.workout")
                Button("Update check-in") { open(.checkIn) }
                    .font(FWBFont.subheadline.weight(.semibold)).foregroundStyle(Color.fwbLime)
                    .accessibilityIdentifier("daily.home.update")
            } else {
                Text("Check in with your mood and energy, then find a session that fits today.")
                    .font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted)
                Button("Check in") { open(.checkIn) }
                    .buttonStyle(FWBPrimaryButtonStyle()).accessibilityIdentifier("daily.home.checkIn")
            }
        }.foregroundStyle(Color.fwbWarmWhite).fwbCard()
    }
}

struct DailyCheckInFlowView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var readiness: DailyReadinessStore
    @ObservedObject var programs: ClientProgramStore
    let account: SignedInAccount
    let previewMode: Bool
    let openAssignedProgram: (() -> Void)?
    @State private var step: DailyCheckInEntry
    @State private var launch: Workout?
    @State private var showLogger = false
    @State private var showAssignedProgram = false

    init(account: SignedInAccount, readiness: DailyReadinessStore, programs: ClientProgramStore,
         entry: DailyCheckInEntry = .welcome, previewMode: Bool = false,
         openAssignedProgram: (() -> Void)? = nil) {
        self.account = account; self.readiness = readiness; self.programs = programs
        self.previewMode = previewMode
        self.openAssignedProgram = openAssignedProgram
        _step = State(initialValue: entry)
    }

    var body: some View {
        NavigationStack {
            Group {
                switch step {
                case .welcome: welcome
                case .checkIn:
                    ReadinessCheckInView(store: readiness) { _ in step = .workout }
                case .workout:
                    if let checkIn = readiness.today, checkIn.localDate == ReadinessCheckIn.localDateKey() {
                        DailyWorkoutRecommendationView(account: account, checkIn: checkIn, programs: programs, previewMode: previewMode, openAssignedProgram: {
                            if let openAssignedProgram { openAssignedProgram() }
                            else { showAssignedProgram = true }
                        }) { workout in
                            launch = workout; showLogger = true
                        }
                    } else {
                        VStack(spacing: 20) {
                            Text("Start with today’s check-in").font(FWBFont.title2.bold())
                            Text("Your answers help choose today’s session.").foregroundStyle(Color.fwbMuted)
                            Button("Check in") { step = .checkIn }.buttonStyle(FWBPrimaryButtonStyle())
                        }.padding(24)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.fwbBackground.ignoresSafeArea())
            .toolbar {
                if !showLogger {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(step == .welcome ? "Skip" : "Done") { dismiss() }
                            .accessibilityIdentifier("daily.close")
                    }
                }
            }
            .navigationDestination(isPresented: $showLogger) {
                if let launch {
                    WorkoutLoggingView(workout: launch, clientEmail: account.email,
                        suggestedExercises: programs.program?.workouts.flatMap(\.exercises) ?? [],
                        previewMode: previewMode, isGeneratedWorkout: launch.title.hasPrefix("Custom workout")) { EmptyView() }
                        .navigationTitle("Workout Log").navigationBarTitleDisplayMode(.inline)
                }
            }
            .navigationDestination(isPresented: $showAssignedProgram) {
                WorkoutLibraryView(store: programs, clientEmail: account.email, initiallySelected: true)
            }
        }
        .tint(Color.fwbLime).font(FWBFont.body)
        .interactiveDismissDisabled(showLogger)
    }

    private var welcome: some View {
        ScrollView {
            VStack(spacing: 24) {
                Image(systemName: "face.smiling")
                    .font(.system(size: 48, weight: .medium)).foregroundStyle(Color.black)
                    .frame(width: 96, height: 96).background(Color.fwbAccentFill, in: RoundedRectangle(cornerRadius: 28))
                Text("How are you feeling today?")
                    .font(FWBFont.largeTitle.weight(.bold)).multilineTextAlignment(.center)
                    .accessibilityIdentifier("daily.prompt.title")
                Text("Take a quick mood and energy check-in. We’ll help you choose today’s workout.")
                    .font(FWBFont.body).foregroundStyle(Color.fwbMuted).multilineTextAlignment(.center)
                VStack(spacing: 12) {
                    Button("Check in") { step = .checkIn }
                        .buttonStyle(FWBPrimaryButtonStyle()).accessibilityIdentifier("daily.prompt.checkIn")
                    Button("Skip for today") { dismiss() }
                        .buttonStyle(FWBSecondaryButtonStyle()).accessibilityIdentifier("daily.prompt.skip")
                }
                Text("You can check in anytime from Home.")
                    .font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
            }.padding(24).padding(.top, 36)
        }.navigationTitle("Daily check-in").navigationBarTitleDisplayMode(.inline)
    }
}

private struct DailyWorkoutRecommendationView: View {
    let account: SignedInAccount
    let checkIn: ReadinessCheckIn
    @ObservedObject var programs: ClientProgramStore
    let previewMode: Bool
    let openAssignedProgram: () -> Void
    let start: (Workout) -> Void
    @StateObject private var history = WorkoutHistoryStore()
    @State private var loaded = false
    @State private var now = Date()
    @Environment(\.scenePhase) private var scenePhase
    private var recommendation: DailyWorkoutRecommendation {
        DailyWorkoutRecommendationEngine.recommend(program: programs.program, history: history.sessions, checkIn: checkIn)
    }
    private var isToday: Bool { checkIn.localDate == ReadinessCheckIn.localDateKey(for: now) }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                if !loaded {
                    ProgressView("Finding today’s workout…").frame(maxWidth: .infinity).padding(32)
                } else {
                    summary
                    if !isToday {
                        Text("It’s a new day. Close this screen and check in again for today’s workout.")
                            .foregroundStyle(Color.fwbMuted).fwbCard()
                    }
                    if case .failed = history.state {
                        Text("Recent workout history couldn’t refresh. Review the suggested session before starting.")
                            .font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
                    }
                    if case .failed(let message) = programs.state {
                        FWBErrorState(message: message) { Task { await programs.reload() } }
                    } else if let workout = recommendation.workout {
                        workoutCard(workout)
                        Button(recommendation.level == .planned ? "Start planned workout" : "Start today’s workout") { startToday(workout) }
                            .buttonStyle(FWBPrimaryButtonStyle()).disabled(!isToday)
                            .accessibilityIdentifier("daily.workout.start")
                    } else {
                        Text(recommendation.level == .recovery
                             ? "You can take a rest day, use an assigned session below, or build a comfortable workout."
                             : "Choose your equipment and focus to build today’s workout from your coach’s exercise library.")
                            .foregroundStyle(Color.fwbMuted).font(FWBFont.subheadline)
                        NavigationLink {
                            generator
                        } label: { Text("Choose a workout for today") }
                            .buttonStyle(FWBPrimaryButtonStyle()).disabled(!isToday)
                            .accessibilityIdentifier("daily.workout.generate")
                    }
                    if let original = recommendation.originalWorkout, original.id != recommendation.workout?.id {
                        Button("Keep my planned workout") {
                            now = Date()
                            guard isToday else { return }
                            openAssignedProgram()
                        }
                            .buttonStyle(FWBSecondaryButtonStyle()).disabled(!isToday)
                            .accessibilityIdentifier("daily.workout.original")
                    }
                    GymCheckInCard(account: account, previewMode: previewMode)
                }
            }.padding(16)
        }
        .navigationTitle("Today’s workout").navigationBarTitleDisplayMode(.inline)
        .task {
            if !previewMode { await programs.loadIfNeeded(); await history.loadIfNeeded(email: account.email) }
            guard !Task.isCancelled else { return }; loaded = true
        }
        .onChange(of: scenePhase) { phase in if phase == .active { now = Date() } }
    }
    private func startToday(_ workout: Workout) {
        now = Date()
        guard isToday else { return }
        start(workout)
    }
    private var summary: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("CHECK-IN SAVED", systemImage: "checkmark.circle.fill")
                .font(FWBFont.caption.bold()).foregroundStyle(Color.fwbLime)
            Text(recommendation.headline).font(FWBFont.title2.bold()).accessibilityIdentifier("daily.workout.headline")
            ForEach(recommendation.reasons, id: \.self) { Text($0).font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted) }
            ForEach(recommendation.changes, id: \.self) { Text($0).font(FWBFont.subheadline) }
            Text("This is for today’s session. Your assigned program stays the same.")
                .font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
            if checkIn.syncState != .synced {
                Text("Saved on this iPhone. Your check-in will sync when connected.")
                    .font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
            }
        }.fwbCard()
    }
    private func workoutCard(_ workout: Workout) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(workout.title.fwbWorkoutDisplayTitle).font(FWBFont.title3.bold())
            ForEach(Array(workout.exercises.enumerated()), id: \.offset) { _, exercise in
                VStack(alignment: .leading, spacing: 4) {
                    Text(exercise.name).font(FWBFont.headline)
                    Text(exercise.prescription).font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted)
                }
            }
        }.fwbCard()
    }
    @ViewBuilder private var generator: some View {
        #if DEBUG
        if previewMode {
            WorkoutGeneratorView(previewLibrary: WorkoutGeneratorAuditRootView.library, initialPreferences: recommendation.generatorPreferences, clientEmail: account.email)
        } else {
            WorkoutGeneratorView(clientEmail: account.email, initialPreferences: recommendation.generatorPreferences)
        }
        #else
        WorkoutGeneratorView(clientEmail: account.email, initialPreferences: recommendation.generatorPreferences)
        #endif
    }
}

#if DEBUG
struct DailyCheckInAuditRootView: View {
    private static let account = SignedInAccount(id: UUID(uuidString: "D1100000-0000-4000-8000-000000000001")!, email: ClientProgram.preview.clientEmail)
    @StateObject private var readiness = DailyReadinessStore(previewCheckIn: nil, clientEmail: Self.account.email)
    @StateObject private var programs = ClientProgramStore(previewProgram: .preview)
    @State private var entry: DailyCheckInEntry?
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    DailyCheckInHomeCard(store: readiness) { entry = $0 }
                    GymCheckInCard(account: Self.account, previewMode: true)
                }.padding(16)
            }.navigationTitle("Home").background(Color.fwbBackground)
        }
        .sheet(item: Binding(get: { entry.map(AuditEntry.init) }, set: { entry = $0?.entry })) { item in
            DailyCheckInFlowView(account: Self.account, readiness: readiness, programs: programs, entry: item.entry, previewMode: true)
        }
        .task { if !ProcessInfo.processInfo.arguments.contains("--daily-home-audit") { entry = .welcome } }
        .preferredColorScheme(ProcessInfo.processInfo.arguments.contains("--force-dark-audit") ? .dark : .light)
    }
    private struct AuditEntry: Identifiable { let entry: DailyCheckInEntry; var id: String { entry.rawValue } }
}
#endif
