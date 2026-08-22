import SwiftUI

struct ClientRootView: View {
    @ObservedObject var sessionStore: SessionStore
    let account: SignedInAccount

    @StateObject private var programStore = ClientProgramStore()

    var body: some View {
        TabView {
            NavigationStack {
                ClientDashboardView(store: programStore, clientEmail: account.email)
            }
            .tabItem {
                Label("Today", systemImage: "house.fill")
            }

            NavigationStack {
                WorkoutLibraryView(store: programStore, clientEmail: account.email)
            }
            .tabItem {
                Label("Workouts", systemImage: "figure.strengthtraining.traditional")
            }

            NavigationStack {
                ProgressDashboardView(clientEmail: account.email)
            }
            .tabItem {
                Label("Progress", systemImage: "chart.line.uptrend.xyaxis")
            }

            NavigationStack {
                NutritionTargetsView(store: programStore)
            }
            .tabItem {
                Label("Macros", systemImage: "chart.bar.fill")
            }

            NavigationStack {
                AccountView(account: account, sessionStore: sessionStore)
            }
            .tabItem {
                Label("Account", systemImage: "person.crop.circle")
            }
        }
        .tint(.fwbLime)
        .toolbarBackground(Color.fwbBackground, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
        .task {
            await programStore.loadIfNeeded()
        }
    }
}

struct ClientDashboardView: View {
    @ObservedObject var store: ClientProgramStore
    let clientEmail: String

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            switch store.state {
            case .idle, .loading:
                DashboardPlaceholder()
            case .loaded:
                if let program = store.program {
                    dashboard(program)
                } else {
                    FWBEmptyState(
                        icon: "calendar.badge.clock",
                        title: "Your plan is on the way",
                        message: "You’re signed in. Your active training program will appear here after your coach publishes it."
                    )
                }
            case .failed(let message):
                FWBErrorState(message: message) {
                    Task { await store.reload() }
                }
            }
        }
        .navigationTitle("Today")
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .refreshable {
            await store.reload()
        }
    }

    private func dashboard(_ program: ClientProgram) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                ClientGreeting(program: program)
                ProgramOverviewCard(program: program)
                ReadinessDashboardCard(clientEmail: clientEmail)

                if let workout = program.workouts.first {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeading(kicker: "UP NEXT", title: "Your next workout")
                        NavigationLink(value: workout) {
                            WorkoutCard(workout: workout, index: 0)
                        }
                        .buttonStyle(.plain)
                    }
                }

                if !program.coachNoteTitle.isEmpty || !program.coachNoteBody.isEmpty {
                    CoachNoteCard(program: program)
                }
            }
            .padding(20)
        }
        .navigationDestination(for: Workout.self) { workout in
            WorkoutLoggingView(workout: workout, clientEmail: clientEmail)
                .navigationTitle("Workout Log")
                .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct ClientGreeting: View {
    let program: ClientProgram

    var body: some View {
        HStack(spacing: 14) {
            Text(program.displayInitials)
                .font(.headline.bold())
                .foregroundStyle(.black)
                .frame(width: 48, height: 48)
                .background(Color.fwbAccentFill, in: Rectangle())

            VStack(alignment: .leading, spacing: 3) {
                Text("WELCOME BACK")
                    .font(.footnote.bold())
                    .tracking(1.3)
                    .foregroundStyle(Color.fwbLime)
                Text(program.clientName)
                    .font(.title2.weight(.black))
                    .fontWidth(.condensed)
                    .foregroundStyle(Color.fwbWarmWhite)
            }

            Spacer()
        }
        .accessibilityElement(children: .combine)
    }
}

private struct ProgramOverviewCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let program: ClientProgram

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 7) {
                Text(program.programTitle)
                    .font(.title2.weight(.black))
                    .fontWidth(.condensed)
                if !program.programSummary.isEmpty {
                    Text(program.programSummary)
                        .font(.subheadline)
                        .foregroundStyle(Color.fwbMuted)
                }
            }

            if program.sessionCountTotal > 0 {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Label("Training sessions", systemImage: "checkmark.circle")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Color.fwbMuted)
                        Spacer()
                        Text("\(program.sessionCountUsed) / \(program.sessionCountTotal)")
                            .font(.footnote.bold())
                    }

                    ProgressView(value: program.sessionProgress)
                        .tint(.fwbLime)
                }
            }

            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 18) {
                    ProgramMetric(title: "GOAL", value: program.fitnessGoal, icon: "target")
                    ProgramMetric(title: "FOCUS", value: program.focusTarget, icon: "scope")
                }
            } else {
                HStack(alignment: .top, spacing: 18) {
                    ProgramMetric(title: "GOAL", value: program.fitnessGoal, icon: "target")
                    ProgramMetric(title: "FOCUS", value: program.focusTarget, icon: "scope")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }
}

private struct ProgramMetric: View {
    let title: String
    let value: String
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Label(title, systemImage: icon)
                .font(.footnote.bold())
                .tracking(0.8)
                .foregroundStyle(Color.fwbLime)
            Text(value.isEmpty ? "Not set" : value)
                .font(.subheadline)
                .foregroundStyle(Color.fwbWarmWhite.opacity(0.9))
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct CoachNoteCard: View {
    let program: ClientProgram

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("COACH NOTE", systemImage: "quote.bubble.fill")
                .font(.footnote.bold())
                .tracking(1)
                .foregroundStyle(Color.fwbLime)
            Text(program.coachNoteTitle.isEmpty ? "From Benjamin" : program.coachNoteTitle)
                .font(.headline)
            Text(program.coachNoteBody)
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }
}

struct WorkoutLibraryView: View {
    @ObservedObject var store: ClientProgramStore
    let clientEmail: String

    private static let customWorkout = Workout(
        id: UUID(uuidString: "2EAF699D-F7CC-4DA8-A060-E029292B40C2")!,
        title: "Custom Workout",
        focus: "Build your own",
        format: "custom",
        exercises: []
    )

    private static let mobilityWorkout = Workout(
        id: UUID(uuidString: "2ACBD35B-9A6C-42E8-8F0D-95B32C82D276")!,
        title: "Mobility",
        focus: "Stretching and foam rolling",
        format: "mobility",
        exercises: []
    )

    var body: some View {
        Group {
            switch store.state {
            case .idle, .loading:
                ProgressView("Loading workouts…")
            case .loaded:
                libraryContent
            case .failed(let message):
                FWBErrorState(message: message) {
                    Task { await store.reload() }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.fwbBackground.ignoresSafeArea())
        .navigationTitle("Workouts")
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                NavigationLink {
                    WorkoutHistoryView(clientEmail: clientEmail)
                } label: {
                    HStack(spacing: 6) {
                        Text("LOG")
                            .font(.footnote.bold())
                            .tracking(0.8)
                        Image(systemName: "list.bullet.clipboard")
                            .font(.subheadline.weight(.bold))
                    }
                    .foregroundStyle(Color.fwbLime)
                }
                .accessibilityLabel("Workout history and log")
                .accessibilityIdentifier("workout.history")
            }
        }
        .refreshable {
            await store.reload()
        }
    }

    @ViewBuilder
    private var libraryContent: some View {
        let workouts = store.program?.workouts ?? []
        let suggestedExercises = ExerciseLibrary.items.map(\.exercise) + workouts.flatMap(\.exercises)

        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 7) {
                    Text("TRAINING")
                        .font(.footnote.weight(.black))
                        .tracking(1.2)
                        .foregroundStyle(Color.fwbLime)
                    Text("CHOOSE YOUR WORKOUT")
                        .font(.largeTitle.weight(.black))
                        .fontWidth(.condensed)
                        .foregroundStyle(Color.fwbWarmWhite)
                    Text("Start from your program or build a session from the exercise library.")
                        .font(.subheadline)
                        .foregroundStyle(Color.fwbMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("QUICK START")
                        .font(.footnote.weight(.black))
                        .tracking(1)
                        .foregroundStyle(Color.fwbMuted)

                    NavigationLink {
                        WorkoutLoggingView(
                            workout: Self.customWorkout,
                            clientEmail: clientEmail,
                            suggestedExercises: suggestedExercises
                        )
                        .navigationTitle("Custom Workout")
                        .navigationBarTitleDisplayMode(.inline)
                    } label: {
                        WorkoutQuickStartCard(
                            title: "CUSTOM WORKOUT",
                            subtitle: "Choose exercises from the library",
                            icon: "plus"
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("workout.quickStart.custom")

                    NavigationLink {
                        CardioLoggingView(clientEmail: clientEmail) { EmptyView() }
                            .navigationTitle("Cardio")
                            .navigationBarTitleDisplayMode(.inline)
                    } label: {
                        WorkoutQuickStartCard(
                            title: "CARDIO",
                            subtitle: "Log a walk, run, ride, swim, or machine session",
                            icon: "figure.run"
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("workout.quickStart.cardio")

                    NavigationLink {
                        WorkoutLoggingView(
                            workout: Self.mobilityWorkout,
                            clientEmail: clientEmail,
                            suggestedExercises: ExerciseLibrary.mobilityExercises
                        )
                        .navigationTitle("Mobility")
                        .navigationBarTitleDisplayMode(.inline)
                    } label: {
                        WorkoutQuickStartCard(
                            title: "MOBILITY",
                            subtitle: "Stretching, joint mobility, and foam rolling",
                            icon: "figure.flexibility"
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("workout.quickStart.mobility")
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("PROGRAM ROUTINES")
                        .font(.footnote.weight(.black))
                        .tracking(1)
                        .foregroundStyle(Color.fwbMuted)

                    if workouts.isEmpty {
                        FWBEmptyState(
                            icon: "calendar.badge.clock",
                            title: "Your program is on the way",
                            message: "You can still start a custom, cardio, or mobility session now."
                        )
                    } else {
                        ForEach(Array(workouts.enumerated()), id: \.element.id) { index, workout in
                            NavigationLink {
                                WorkoutLoggingView(
                                    workout: workout,
                                    clientEmail: clientEmail,
                                    suggestedExercises: suggestedExercises
                                )
                                .navigationTitle("Workout Log")
                                .navigationBarTitleDisplayMode(.inline)
                            } label: {
                                WorkoutCard(workout: workout, index: index)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("workout.program.\(index + 1)")
                        }
                    }
                }
            }
            .padding(20)
            .padding(.bottom, 22)
        }
    }
}

private struct WorkoutQuickStartCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let title: String
    let subtitle: String
    let icon: String

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        quickStartIcon
                        Spacer()
                        disclosureIcon
                    }
                    quickStartText
                }
            } else {
                HStack(spacing: 14) {
                    quickStartIcon
                    quickStartText
                    Spacer(minLength: 8)
                    disclosureIcon
                }
            }
        }
        .frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
        .padding(14)
        .background(Color.fwbCard, in: Rectangle())
        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private var quickStartIcon: some View {
        Image(systemName: icon)
            .font(.title3.weight(.black))
            .foregroundStyle(Color.black)
            .frame(width: 46, height: 46)
            .background(Color.fwbAccentFill, in: Rectangle())
    }

    private var quickStartText: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.headline.weight(.black))
                .fontWidth(.condensed)
                .foregroundStyle(Color.fwbWarmWhite)
                .fixedSize(horizontal: false, vertical: true)
            Text(subtitle)
                .font(.footnote)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var disclosureIcon: some View {
        Image(systemName: "chevron.right")
            .font(.footnote.weight(.black))
            .foregroundStyle(Color.fwbLime)
    }
}

struct WorkoutCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let workout: Workout
    let index: Int

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        dayBadge
                        Spacer()
                        disclosureIcon
                    }
                    workoutText
                }
            } else {
                HStack(spacing: 16) {
                    dayBadge
                    workoutText
                    Spacer(minLength: 8)
                    disclosureIcon
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .accessibilityElement(children: .combine)
    }

    private var dayBadge: some View {
        VStack(spacing: 2) {
            Text("\(index + 1)")
                .font(.title2.bold())
            Text("DAY")
                .font(.footnote.bold())
                .tracking(0.8)
        }
        .frame(width: 48, height: 58)
        .foregroundStyle(Color.black)
        .background(Color.fwbAccentFill, in: Rectangle())
    }

    private var workoutText: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(workout.title)
                .font(.headline)
                .foregroundStyle(Color.fwbWarmWhite)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            Text(workout.focus.isEmpty ? workout.formatLabel : workout.focus)
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)
            Text("\(workout.exercises.count) exercises")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color.fwbLime)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var disclosureIcon: some View {
        Image(systemName: "chevron.right")
            .font(.footnote.bold())
            .foregroundStyle(Color.fwbMuted)
    }
}

struct ExerciseDemoLink: View {
    let exercise: Exercise

    var body: some View {
        if let demoURL = exercise.demoURL {
            Link(destination: demoURL) {
                Label("Watch Demo", systemImage: "play.rectangle.fill")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(Color.fwbLime)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .frame(minHeight: 36)
                    .overlay { Rectangle().stroke(Color.fwbLime, lineWidth: 1) }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("exercise.watchDemo.\(exercise.id)")
        }
    }
}

struct AccountView: View {
    let account: SignedInAccount
    @ObservedObject var sessionStore: SessionStore

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 18) {
                    VStack(spacing: 12) {
                        Image(systemName: "person.crop.circle.fill")
                            .font(.system(size: 64))
                            .foregroundStyle(Color.fwbLime)
                        Text(account.email)
                            .font(.headline)
                        Text("Client account")
                            .font(.footnote)
                            .foregroundStyle(Color.fwbMuted)
                    }
                    .frame(maxWidth: .infinity)
                    .fwbCard()

                    VStack(spacing: 0) {
                        NavigationLink {
                            ClientStatsView(account: account)
                        } label: {
                            SettingsRow(title: "Stats & measurements", icon: "ruler", trailingIcon: "chevron.right")
                        }
                        .buttonStyle(.plain)

                        Divider().overlay(Color.fwbLine)

                        NavigationLink {
                            WorkoutSettingsView()
                        } label: {
                            SettingsRow(title: "Workout settings", icon: "slider.horizontal.3", trailingIcon: "chevron.right")
                        }
                        .buttonStyle(.plain)

                        Divider().overlay(Color.fwbLine)

                        NavigationLink {
                            AppearanceSettingsView()
                        } label: {
                            SettingsRow(title: "Appearance", icon: "circle.lefthalf.filled", trailingIcon: "chevron.right")
                        }
                        .buttonStyle(.plain)

                        Divider().overlay(Color.fwbLine)

                        Link(destination: AppConfiguration.clientWebPortalURL) {
                            SettingsRow(title: "Open web app", icon: "globe")
                        }

                        Divider().overlay(Color.fwbLine)

                        NavigationLink {
                            PrivacyPolicyView()
                        } label: {
                            SettingsRow(title: "Privacy policy", icon: "hand.raised", trailingIcon: "chevron.right")
                        }
                        .buttonStyle(.plain)

                        Divider().overlay(Color.fwbLine)

                        Link(destination: AppConfiguration.supportURL) {
                            SettingsRow(title: "Help and support", icon: "questionmark.circle")
                        }

                        Divider().overlay(Color.fwbLine)

                        Link(destination: AppConfiguration.accountDeletionRequestURL) {
                            SettingsRow(title: "Request account deletion", icon: "person.crop.circle.badge.minus")
                        }
                    }
                    .background(Color.fwbCard, in: Rectangle())
                    .overlay {
                        Rectangle()
                            .stroke(Color.fwbLine, lineWidth: 1)
                    }

                    Button(role: .destructive) {
                        Task { await sessionStore.signOut() }
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                    .buttonStyle(FWBDestructiveButtonStyle())
                    .disabled(sessionStore.isSubmitting)
                }
                .padding(20)
            }
        }
        .navigationTitle("Account")
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
    }
}

private struct PrivacyPolicyView: View {
    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("PRIVACY")
                        .font(.footnote.bold())
                        .tracking(1.2)
                        .foregroundStyle(Color.fwbLime)

                    Text("FWB TRAINING\nPRIVACY NOTICE")
                        .font(.system(size: 36, weight: .black))
                        .fontWidth(.condensed)
                        .foregroundStyle(Color.fwbWarmWhite)

                    privacyParagraph("FWB Training is available to authorized Fitness with Benjamin clients. The app uses your email address to authenticate you and connect you to your assigned coaching account.")
                    privacyParagraph("The app processes assigned programs, exercise and cardio logs, workout history, readiness check-ins, progress measurements, progress photos you choose to upload, and calorie and macro targets to provide its training and progress features. Authentication and coaching records are handled through Fitness with Benjamin’s Supabase project.")
                    privacyParagraph("Limited preferences and unfinished workout data may be stored on your device to support timers, settings, and offline continuity. FWB Training does not use this data for advertising and does not track you across other companies’ apps or websites.")
                    privacyParagraph("If you choose to connect Apple Health, FWB Training writes completed workout type, start and end time, duration, and any distance or calories you entered. The app does not read information from Apple Health or use Health data for advertising or marketing.")
                    privacyParagraph("Exercise demo links may open YouTube. Your use of YouTube is governed by YouTube’s terms and privacy practices.")
                    privacyParagraph("Records are retained while needed to provide coaching services and meet applicable business or legal obligations. You may request access, correction, export, or deletion of your account and associated data through the Account tab or by contacting FWB support.")

                    Link(destination: AppConfiguration.supportURL) {
                        Label("Contact FWB Support", systemImage: "envelope.fill")
                    }
                    .buttonStyle(FWBSecondaryButtonStyle())
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
            }
        }
        .navigationTitle("Privacy Policy")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
    }

    private func privacyParagraph(_ text: String) -> some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(Color.fwbMuted)
            .fixedSize(horizontal: false, vertical: true)
    }
}

private struct SettingsRow: View {
    let title: String
    let icon: String
    var trailingIcon = "arrow.up.right"

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .foregroundStyle(Color.fwbLime)
                .frame(width: 24)
            Text(title)
                .foregroundStyle(Color.fwbWarmWhite)
            Spacer()
            Image(systemName: trailingIcon)
                .font(.footnote)
                .foregroundStyle(Color.fwbMuted)
        }
        .padding(17)
    }
}

struct SectionHeading: View {
    let kicker: String
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(kicker)
                .font(.footnote.bold())
                .tracking(1.1)
                .foregroundStyle(Color.fwbLime)
            Text(title)
                .font(.title2.weight(.black))
                .fontWidth(.condensed)
        }
    }
}

struct FWBEmptyState: View {
    let icon: String
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 42))
                .foregroundStyle(Color.fwbLime)
            Text(title)
                .font(.title3.weight(.black))
                .fontWidth(.condensed)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

struct FWBErrorState: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 42))
                .foregroundStyle(Color.fwbRed)
            Text("Couldn’t load FWB Training")
                .font(.title3.weight(.black))
                .fontWidth(.condensed)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
                .multilineTextAlignment(.center)
            Button("Try Again", action: retry)
                .buttonStyle(FWBPrimaryButtonStyle())
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct DashboardPlaceholder: View {
    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                HStack {
                    Rectangle().frame(width: 48, height: 48)
                    VStack(alignment: .leading) {
                        Text("WELCOME BACK")
                        Text("Client Name").font(.title2.bold())
                    }
                    Spacer()
                }

                ForEach(0..<2, id: \.self) { _ in
                    Rectangle()
                        .fill(Color.fwbCard)
                        .frame(height: 180)
                }
            }
            .padding(20)
            .redacted(reason: .placeholder)
        }
    }
}

#Preview("Client dashboard") {
    NavigationStack {
        PreviewClientDashboard(program: .preview)
    }
    .preferredColorScheme(.dark)
}

private struct PreviewClientDashboard: View {
    let program: ClientProgram

    var body: some View {
        ScrollView {
            VStack(spacing: 18) {
                ClientGreeting(program: program)
                ProgramOverviewCard(program: program)
                WorkoutCard(workout: program.workouts[0], index: 0)
                CoachNoteCard(program: program)
            }
            .padding(20)
        }
        .background(Color.fwbBackground)
    }
}
