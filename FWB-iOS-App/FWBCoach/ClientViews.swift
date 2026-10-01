import SwiftUI

struct ClientDashboardView: View {
    @ObservedObject var store: ClientProgramStore
    @ObservedObject var notificationStore: NotificationInboxStore
    let account: SignedInAccount
    @State private var isShowingNotificationInbox = false

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
        .navigationTitle("Home")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    isShowingNotificationInbox = true
                } label: {
                    NotificationInboxBadge(unreadCount: notificationStore.unreadCount)
                }
                .accessibilityIdentifier("notifications.inbox")
            }
        }
        .navigationDestination(isPresented: $isShowingNotificationInbox) {
            NotificationInboxView(store: notificationStore)
        }
        .refreshable {
            await store.reload()
            await notificationStore.reload()
        }
    }

    private func dashboard(_ program: ClientProgram) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                ClientGreeting(program: program)
                ReadinessDashboardCard(clientEmail: account.email)
                WeeklyCoachCheckInCard(clientEmail: account.email)
                ClientHomeSnapshots(store: store, program: program, account: account)

                if let workout = program.workouts.first {
                    VStack(alignment: .leading, spacing: 12) {
                        SectionHeading(kicker: "Training", title: "Your next workout")
                        NavigationLink(value: workout) {
                            WorkoutCard(workout: workout, index: 0)
                        }
                        .buttonStyle(.plain)
                    }
                }

                ProgramOverviewCard(program: program)

                if !program.coachNoteTitle.isEmpty || !program.coachNoteBody.isEmpty {
                    CoachNoteCard(program: program)
                }
            }
            .padding(16)
        }
        .navigationDestination(for: Workout.self) { workout in
            WorkoutLoggingView(workout: workout, clientEmail: account.email)
                .navigationTitle("Workout Log")
                .navigationBarTitleDisplayMode(.inline)
        }
    }
}

private struct ClientGreeting: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let program: ClientProgram

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
        layout {
            VStack(alignment: .leading, spacing: 6) {
                Text("Home")
                    .font(FWBFont.caption.weight(.bold))
                    .foregroundStyle(Color.fwbMuted)
                Text("Today")
                    .font(FWBFont.largeTitle.weight(.bold))
                    .foregroundStyle(Color.fwbWarmWhite)
                Text("Welcome back, \(program.clientName).")
                    .font(FWBFont.subheadline)
                    .foregroundStyle(Color.fwbMuted)
            }
            if !dynamicTypeSize.isAccessibilitySize { Spacer() }
            Text("Ready")
                .font(FWBFont.caption.weight(.bold))
                .foregroundStyle(Color.fwbWarmWhite)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 9))
        }
        .accessibilityElement(children: .combine)
    }
}

private struct ClientHomeSnapshots: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ObservedObject var store: ClientProgramStore
    let program: ClientProgram
    let account: SignedInAccount

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .bottom) {
                SectionHeading(kicker: "Your dashboard", title: "Today at a glance")
                Spacer(minLength: 8)
                if !dynamicTypeSize.isAccessibilitySize {
                    Text("Swipe cards")
                        .font(FWBFont.caption)
                        .foregroundStyle(Color.fwbMuted)
                }
            }

            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: 12) { cards }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(alignment: .top, spacing: 12) { cards }
                        .padding(.bottom, 3)
                }
            }
        }
    }

    @ViewBuilder
    private var cards: some View {
        NavigationLink {
            ClientStatsView(account: account)
        } label: {
            ClientSnapshotCard(number: "01", title: "Stats + measurements") {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Body measurements", systemImage: "ruler")
                    Label("Private progress photos", systemImage: "photo")
                    Text("Track your changes over time.")
                        .font(FWBFont.footnote)
                        .foregroundStyle(Color.fwbMuted)
                }
                .font(FWBFont.subheadline)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home.snapshot.stats")

        NavigationLink {
            NutritionTargetsView(store: store)
        } label: {
            ClientSnapshotCard(number: "02", title: "Calories + macros") {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 14) {
                    snapshotMetric("Calories", value: program.nutritionPlan?.calories)
                    snapshotMetric("Protein", value: program.nutritionPlan?.protein)
                    snapshotMetric("Carbs", value: program.nutritionPlan?.carbs)
                    snapshotMetric("Fat", value: program.nutritionPlan?.fat)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home.snapshot.nutrition")

        NavigationLink {
            ProgressDashboardView(clientEmail: account.email)
        } label: {
            ClientSnapshotCard(number: "03", title: "Training report") {
                VStack(alignment: .leading, spacing: 12) {
                    Label("Personal bests", systemImage: "trophy")
                    Label("Training trends", systemImage: "chart.line.uptrend.xyaxis")
                    Text("See your progress from saved workouts.")
                        .font(FWBFont.footnote)
                        .foregroundStyle(Color.fwbMuted)
                }
                .font(FWBFont.subheadline)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home.snapshot.progress")
    }

    private func snapshotMetric(_ title: String, value: String?) -> some View {
        let value = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(FWBFont.caption.weight(.semibold))
                .foregroundStyle(Color.fwbMuted)
            Text(value.isEmpty ? "Not set" : value)
                .font(FWBFont.headline.weight(.bold))
                .monospacedDigit()
        }
    }
}

private struct ClientSnapshotCard<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let number: String
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("Snapshot \(number)")
                        .font(FWBFont.caption.weight(.semibold))
                        .foregroundStyle(Color.fwbMuted)
                    Text(title)
                        .font(FWBFont.headline.weight(.bold))
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.right")
                    .font(FWBFont.subheadline.weight(.bold))
                    .foregroundStyle(Color.fwbLime)
                    .accessibilityHidden(true)
            }
            Divider().overlay(Color.fwbLine)
            content
            Spacer(minLength: 0)
        }
        .foregroundStyle(Color.fwbWarmWhite)
        .frame(width: dynamicTypeSize.isAccessibilitySize ? nil : 248, alignment: .leading)
        .frame(maxWidth: dynamicTypeSize.isAccessibilitySize ? .infinity : nil, minHeight: 200, alignment: .topLeading)
        .fwbCard()
        .accessibilityElement(children: .combine)
    }
}

private struct ProgramOverviewCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let program: ClientProgram

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 7) {
                Text("Program overview")
                    .font(FWBFont.caption.weight(.bold))
                    .foregroundStyle(Color.fwbMuted)
                Text(program.programTitle.fwbTitleCased)
                    .font(FWBFont.title3.weight(.bold))
                if !program.programSummary.isEmpty {
                    Text(program.programSummary)
                        .font(FWBFont.subheadline)
                        .foregroundStyle(Color.fwbMuted)
                }
            }

            if program.sessionCountTotal > 0 {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Label("Training sessions", systemImage: "checkmark.circle")
                            .font(FWBFont.footnote.weight(.semibold))
                            .foregroundStyle(Color.fwbMuted)
                        Spacer()
                        Text("\(program.sessionCountUsed) / \(program.sessionCountTotal)")
                            .font(FWBFont.footnote.bold())
                    }

                    ProgressView(value: program.sessionProgress)
                        .tint(.fwbLime)
                }
            }

            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 18) {
                    ProgramMetric(title: "Goal", value: program.fitnessGoal, icon: "target")
                    ProgramMetric(title: "Focus", value: program.focusTarget, icon: "scope")
                }
            } else {
                HStack(alignment: .top, spacing: 18) {
                    ProgramMetric(title: "Goal", value: program.fitnessGoal, icon: "target")
                    ProgramMetric(title: "Focus", value: program.focusTarget, icon: "scope")
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
                .font(FWBFont.footnote.bold())
                .foregroundStyle(Color.fwbMuted)
            Text(value.isEmpty ? "Not set" : value)
                .font(FWBFont.subheadline)
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
            Label("Coach note", systemImage: "quote.bubble.fill")
                .font(FWBFont.footnote.bold())
                .foregroundStyle(Color.fwbMuted)
            Text(program.coachNoteTitle.isEmpty ? "From Benjamin" : program.coachNoteTitle)
                .font(FWBFont.headline)
            Text(program.coachNoteBody)
                .font(FWBFont.subheadline)
                .foregroundStyle(Color.fwbMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }
}

struct WorkoutLibraryView: View {
    @State private var programSelected = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ObservedObject var store: ClientProgramStore
    @ObservedObject var notificationStore: NotificationInboxStore
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
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                NavigationLink {
                    NotificationInboxView(store: notificationStore)
                } label: {
                    MessageInboxBadge(unreadCount: notificationStore.unreadCount)
                }
                .accessibilityIdentifier("workout.messages")
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
                let headingLayout = dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
                    : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
                headingLayout {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Workouts").font(FWBFont.caption.weight(.bold)).foregroundStyle(Color.fwbMuted)
                        Text("Training sessions").font(FWBFont.title2.weight(.bold))
                    }
                    if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: 0) }
                    Text("\(workouts.count) workouts")
                        .font(FWBFont.caption.weight(.bold))
                        .foregroundStyle(Color.fwbMuted)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 9))
                }

                if !programSelected {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Select a program")
                            .font(FWBFont.title3.weight(.bold))
                        if !store.availablePrograms.isEmpty {
                            ForEach(store.availablePrograms) { program in
                            Button {
                                store.selectProgram(program.id)
                                programSelected = true
                            } label: {
                                HStack(spacing: 16) {
                                    Text(program.programTitle)
                                        .font(FWBFont.body.weight(.bold))
                                        .foregroundStyle(Color.fwbWarmWhite)
                                    Spacer(minLength: 0)
                                    Text("\(program.workouts.count) workouts")
                                        .font(FWBFont.footnote)
                                        .foregroundStyle(Color.fwbMuted)
                                    Image(systemName: "arrow.right")
                                        .foregroundStyle(Color.fwbMuted)
                                }
                                .padding(20)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 14))
                                .overlay { RoundedRectangle(cornerRadius: 14).stroke(Color.fwbLine, lineWidth: 1) }
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("workout.selectProgram.\(program.id)")
                            }
                        } else {
                            Text("Your coach will add your program here. You can build a custom workout now.")
                                .font(FWBFont.subheadline)
                                .foregroundStyle(Color.fwbMuted)
                        }
                        customWorkoutLink(suggestedExercises: suggestedExercises)
                    }
                    .fwbCard()
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        Button {
                            programSelected = false
                        } label: {
                            Label("Programs", systemImage: "arrow.left")
                                .font(FWBFont.subheadline.weight(.semibold))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Color.fwbLime)
                        if let program = store.program {
                            Text(program.programTitle)
                                .font(FWBFont.title2.weight(.bold))
                        }
                        Text("Drag exercises to reorder them. Use each exercise’s menu to edit, substitute, or delete.")
                            .font(FWBFont.subheadline)
                            .foregroundStyle(Color.fwbMuted)
                    }
                    ForEach(Array(workouts.enumerated()), id: \.element.id) { index, workout in
                        WorkoutRoutineCard(
                            store: store,
                            workout: workout,
                            index: index,
                            clientEmail: clientEmail,
                            suggestedExercises: suggestedExercises
                        )
                    }
                    WorkoutLayoutSaveStatus(store: store)
                    HStack {
                        NavigationLink("Copy previous") { WorkoutHistoryView(clientEmail: clientEmail) }
                        Spacer()
                        Button("Restore assigned exercises") {
                            Task { await store.restoreAssignedWorkoutExercises() }
                        }
                        .disabled(store.workoutLayoutSaveState == .saving)
                    }
                    .font(FWBFont.footnote.weight(.semibold))
                    .foregroundStyle(Color.fwbLime)
                    customWorkoutLink(suggestedExercises: suggestedExercises)
                }

                DisclosureGroup("More ways to train") {
                    quickStartActions(suggestedExercises: suggestedExercises)
                        .padding(.top, 12)
                }
                .font(FWBFont.subheadline.weight(.semibold))
                .tint(Color.fwbMuted)

                NavigationLink {
                    FormCheckHistoryView(clientEmail: clientEmail)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "video.badge.waveform")
                            .foregroundStyle(Color.fwbLime)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Form checks")
                                .font(FWBFont.subheadline.weight(.bold))
                                .foregroundStyle(Color.fwbWarmWhite)
                            Text("Review your videos and coach feedback.")
                                .font(FWBFont.footnote)
                                .foregroundStyle(Color.fwbMuted)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right")
                            .font(FWBFont.caption.weight(.bold))
                            .foregroundStyle(Color.fwbMuted)
                    }
                    .fwbCard()
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("formCheck.history")
            }
            .padding(FWBLayout.pagePadding)
            .padding(.bottom, 12)
        }
    }

    private func customWorkoutLink(suggestedExercises: [Exercise]) -> some View {
        NavigationLink {
            WorkoutLoggingView(
                workout: Self.customWorkout,
                clientEmail: clientEmail,
                suggestedExercises: suggestedExercises
            )
            .navigationTitle("Custom workout")
            .navigationBarTitleDisplayMode(.inline)
        } label: {
            Label("Build custom workout", systemImage: "plus")
        }
        .buttonStyle(FWBPrimaryButtonStyle())
        .accessibilityIdentifier("workout.quickStart.custom")
    }

    private func quickStartActions(suggestedExercises: [Exercise]) -> some View {
        LazyVGrid(
            columns: dynamicTypeSize.isAccessibilitySize
                ? [GridItem(.flexible())]
                : [GridItem(.adaptive(minimum: 96), spacing: 10)],
            spacing: 10
        ) {
            NavigationLink {
                CardioLoggingView(clientEmail: clientEmail) { EmptyView() }
                    .navigationTitle("Cardio")
                    .navigationBarTitleDisplayMode(.inline)
            } label: {
                WorkoutQuickStartCard(title: "Cardio", subtitle: "Log a walk, run, ride, swim, or machine session", icon: "figure.run")
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
                WorkoutQuickStartCard(title: "Mobility", subtitle: "Stretching, joint mobility, and foam rolling", icon: "figure.flexibility")
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("workout.quickStart.mobility")
        }
    }
}

private struct MessageInboxBadge: View {
    let unreadCount: Int

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Image(systemName: unreadCount > 0 ? "message.fill" : "message")
                .font(FWBFont.body.weight(.bold))
                .foregroundStyle(Color.fwbLime)
                .frame(width: 38, height: 38)

            if unreadCount > 0 {
                Text(unreadCount > 99 ? "99+" : String(unreadCount))
                    .font(.system(size: 9, weight: .black, design: .rounded))
                    .foregroundStyle(Color.black)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(minWidth: 17, minHeight: 17)
                    .padding(.horizontal, unreadCount > 9 ? 2 : 0)
                    .background(Color.fwbAccentFill, in: Capsule())
                    .overlay { Capsule().stroke(Color.fwbBackground, lineWidth: 2) }
                    .offset(x: 5, y: -3)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityLabel(
            unreadCount == 0
                ? "Messages, no unread updates"
                : "Messages, \(unreadCount) unread"
        )
    }
}

private struct WorkoutRoutineCard: View {
    @ObservedObject var store: ClientProgramStore
    @State private var editor: WorkoutPreviewEditRequest?
    @State private var draggedIndex: Int?
    let workout: Workout
    let index: Int
    let clientEmail: String
    let suggestedExercises: [Exercise]
    @State private var isExpanded: Bool

    init(store: ClientProgramStore, workout: Workout, index: Int, clientEmail: String, suggestedExercises: [Exercise]) {
        self.store = store
        self.workout = workout
        self.index = index
        self.clientEmail = clientEmail
        self.suggestedExercises = suggestedExercises
        _isExpanded = State(initialValue: index == 0)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Button {
                isExpanded.toggle()
            } label: {
                HStack(spacing: 12) {
                    Text(String(format: "%02d", index + 1))
                        .font(FWBFont.caption.weight(.bold))
                        .monospacedDigit()
                        .frame(width: 32, height: 32)
                        .background(Color.fwbSurface, in: Circle())
                    VStack(alignment: .leading, spacing: 4) {
                        Text(workout.title.fwbTitleCased)
                            .font(FWBFont.headline.weight(.bold))
                            .multilineTextAlignment(.leading)
                        Text("\(workout.exercises.count) exercises")
                            .font(FWBFont.caption)
                            .foregroundStyle(Color.fwbMuted)
                            .multilineTextAlignment(.leading)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(FWBFont.caption.weight(.bold))
                        .foregroundStyle(Color.fwbMuted)
                        .accessibilityHidden(true)
                }
                .foregroundStyle(Color.fwbWarmWhite)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")
            .accessibilityHint(isExpanded ? "Hide exercise preview" : "Show exercise preview")
            .accessibilityIdentifier("workout.preview.\(index + 1)")

            if isExpanded {
                Divider().overlay(Color.fwbLine)
                HStack {
                    Text("EXERCISES")
                    Spacer()
                    Text("SETS × REPS")
                }
                .font(FWBFont.sized(10, relativeTo: .caption2).weight(.semibold))
                .foregroundStyle(Color.fwbMuted)

                ForEach(Array(workout.exercises.enumerated()), id: \.offset) { exerciseIndex, exercise in
                    HStack(spacing: 5) {
                        Image(systemName: "line.3.horizontal")
                            .font(FWBFont.footnote)
                            .foregroundStyle(Color.fwbMuted)
                            .frame(width: 24, height: 44)
                            .contentShape(Rectangle())
                            .onDrag {
                                draggedIndex = exerciseIndex
                                return NSItemProvider(object: "\(workout.id):\(exerciseIndex)" as NSString)
                            }
                            .accessibilityLabel("Reorder \(exercise.name)")
                        Text(exercise.name)
                            .font(FWBFont.footnote.weight(.semibold))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(exercise.prescription.isEmpty ? "—" : exercise.prescription)
                            .font(FWBFont.footnote.weight(.bold))
                            .multilineTextAlignment(.center)
                            .foregroundStyle(Color.black)
                            .padding(.horizontal, 8).padding(.vertical, 9)
                            .background(Color.fwbAccentFill, in: RoundedRectangle(cornerRadius: 10))
                        Menu {
                            Button("Edit exercise") { editor = WorkoutPreviewEditRequest(index: exerciseIndex, exercise: exercise, substitution: false) }
                            Button("Substitute exercise") { editor = WorkoutPreviewEditRequest(index: exerciseIndex, exercise: exercise, substitution: true) }
                            if exerciseIndex > 0 { Button("Move up") { moveExercise(from: exerciseIndex, to: exerciseIndex - 1) } }
                            if exerciseIndex + 1 < workout.exercises.count { Button("Move down") { moveExercise(from: exerciseIndex, to: exerciseIndex + 1) } }
                            Button("Delete exercise", role: .destructive) {
                                var updated = workout.exercises
                                updated.remove(at: exerciseIndex)
                                Task { await store.saveWorkoutExercises(workoutID: workout.id, exercises: updated) }
                            }
                        } label: {
                            Image(systemName: "ellipsis").font(FWBFont.subheadline.weight(.bold)).frame(width: 32, height: 44)
                        }
                        .accessibilityLabel("\(exercise.name) options")
                    }
                    .padding(.horizontal, 6).padding(.vertical, 4)
                    .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 10))
                    .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.fwbLine.opacity(0.6), lineWidth: 1) }
                    .onDrop(of: ["public.text"], isTargeted: nil) { _ in
                        guard let from = draggedIndex, from != exerciseIndex else { return false }
                        draggedIndex = nil
                        moveExercise(from: from, to: exerciseIndex)
                        return true
                    }
                    .disabled(store.workoutLayoutSaveState == .saving)
                }

                NavigationLink {
                    WorkoutLoggingView(
                        workout: workout,
                        clientEmail: clientEmail,
                        suggestedExercises: suggestedExercises
                    )
                    .navigationTitle("Workout Log")
                    .navigationBarTitleDisplayMode(.inline)
                } label: {
                    Label("Start workout", systemImage: "play.fill")
                }
                .buttonStyle(FWBPrimaryButtonStyle())
                .disabled(workout.exercises.isEmpty || store.workoutLayoutSaveState == .saving)
                .accessibilityIdentifier("workout.program.\(index + 1)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .sheet(item: $editor) { request in
            WorkoutPreviewEditor(store: store, workoutID: workout.id, exercises: workout.exercises,
                                 request: request, suggestions: suggestedExercises)
        }
    }

    private func moveExercise(from: Int, to: Int) {
        guard store.workoutLayoutSaveState != .saving,
              workout.exercises.indices.contains(from), workout.exercises.indices.contains(to) else { return }
        var updated = workout.exercises
        updated.insert(updated.remove(at: from), at: to)
        Task { await store.saveWorkoutExercises(workoutID: workout.id, exercises: updated) }
    }
}



private struct WorkoutQuickStartCard: View {
    let title: String
    let subtitle: String
    let icon: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: icon)
                .font(FWBFont.title3.weight(.semibold))
                .foregroundStyle(Color.fwbLime)
            Text(title)
                .font(FWBFont.subheadline.weight(.bold))
                .foregroundStyle(Color.fwbWarmWhite)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: 58)
        .fwbCard()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title). \(subtitle)")
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
                .font(FWBFont.title2.bold())
            Text("DAY")
                .font(FWBFont.footnote.bold())
                .tracking(0.8)
        }
        .frame(width: 48, height: 58)
        .foregroundStyle(Color.black)
        .background(Color.fwbAccentFill, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
    }

    private var workoutText: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(workout.title.fwbTitleCased)
                .font(FWBFont.headline)
                .foregroundStyle(Color.fwbWarmWhite)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            Text(workout.focus.isEmpty ? workout.formatLabel : workout.focus)
                .font(FWBFont.subheadline)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)
            Text("\(workout.exercises.count) exercises")
                .font(FWBFont.footnote.weight(.semibold))
                .foregroundStyle(Color.fwbLime)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var disclosureIcon: some View {
        Image(systemName: "chevron.right")
            .font(FWBFont.footnote.bold())
            .foregroundStyle(Color.fwbMuted)
    }
}

struct ExerciseDemoLink: View {
    let exercise: Exercise

    var body: some View {
        if let demoURL = exercise.demoURL {
            Link(destination: demoURL) {
                Label("Watch Demo", systemImage: "play.rectangle.fill")
                    .font(FWBFont.footnote.weight(.bold))
                    .foregroundStyle(Color.fwbLime)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .frame(minHeight: 36)
                    .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLime, lineWidth: 1) }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("exercise.watchDemo.\(exercise.id)")
        }
    }
}

struct AccountView: View {
    let account: SignedInAccount
    @ObservedObject var sessionStore: SessionStore
    @ObservedObject var programStore: ClientProgramStore
    @State private var isShowingFood: Bool

    init(
        account: SignedInAccount,
        sessionStore: SessionStore,
        programStore: ClientProgramStore,
        initiallyShowFood: Bool = false
    ) {
        self.account = account
        self.sessionStore = sessionStore
        self.programStore = programStore
        _isShowingFood = State(initialValue: initiallyShowFood)
    }

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SectionHeading(kicker: "Your app", title: "Settings")
                    HStack(spacing: 12) {
                        Image(systemName: "person.crop.circle.fill")
                            .font(FWBFont.largeTitle)
                            .foregroundStyle(Color.fwbLime)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(account.email)
                                .font(FWBFont.subheadline.weight(.semibold))
                                .textSelection(.enabled)
                            Text("Client account")
                                .font(FWBFont.caption)
                                .foregroundStyle(Color.fwbMuted)
                        }
                        Spacer(minLength: 0)
                    }
                    .frame(maxWidth: .infinity)
                    .fwbCard()

                    VStack(spacing: 0) {
                        NavigationLink {
                            NutritionTargetsView(store: programStore)
                        } label: {
                            SettingsRow(title: "Food · calories & macros", icon: "fork.knife", trailingIcon: "chevron.right")
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("more.food")

                        Divider().overlay(Color.fwbLine)

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
                            NotificationPreferencesView(account: account)
                        } label: {
                            SettingsRow(title: "Notifications", icon: "bell.badge", trailingIcon: "chevron.right")
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
                    .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: FWBLayout.cardRadius))
                    .overlay {
                        RoundedRectangle(cornerRadius: FWBLayout.cardRadius)
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
                .padding(FWBLayout.pagePadding)
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .navigationDestination(isPresented: $isShowingFood) {
            NutritionTargetsView(store: programStore)
        }
    }
}

private struct NotificationInboxBadge: View {
    let unreadCount: Int

    private var badgeLabel: String {
        unreadCount > 99 ? "99+" : "\(unreadCount)"
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            Image(systemName: unreadCount > 0 ? "bell.fill" : "bell")
                .font(FWBFont.body.weight(.semibold))
                .frame(width: 34, height: 34)

            if unreadCount > 0 {
                Text(badgeLabel)
                    .font(.system(size: 9, weight: .black, design: .rounded))
                    .foregroundStyle(Color.black)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(minWidth: 17, minHeight: 17)
                    .padding(.horizontal, unreadCount > 9 ? 2 : 0)
                    .background(Color.fwbAccentFill, in: Capsule())
                    .overlay { Capsule().stroke(Color.fwbBackground, lineWidth: 2) }
                    .offset(x: 5, y: -3)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityLabel(
            unreadCount == 0
                ? "Notifications, no unread updates"
                : "Notifications, \(unreadCount) unread"
        )
    }
}

private struct PrivacyPolicyView: View {
    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text("PRIVACY")
                        .font(FWBFont.footnote.bold())
                        .tracking(1.2)
                        .foregroundStyle(Color.fwbLime)

                    Text("FWB TRAINING\nPRIVACY NOTICE")
                        .font(.system(size: 36, weight: .black))
                                .foregroundStyle(Color.fwbWarmWhite)

                    privacyParagraph("FWB Training is available to authorized Fitness with Benjamin clients. The app uses your email address to authenticate you and connect you to your assigned coaching account.")
                    privacyParagraph("The app processes assigned programs, exercise and cardio logs, workout history, daily readiness and weekly coach check-ins, progress measurements, progress photos you choose to upload, and calorie and macro targets to provide its training and progress features. Authentication and coaching records are handled through Fitness with Benjamin’s Supabase project.")
                    privacyParagraph("Limited preferences and unfinished workout data may be stored on your device to support timers, settings, and offline continuity. FWB Training does not use this data for advertising and does not track you across other companies’ apps or websites.")
                    privacyParagraph("If you choose to connect Apple Health, FWB Training writes completed workout type, start and end time, duration, and any distance or calories you entered. The app does not read information from Apple Health or use Health data for advertising or marketing.")
                    privacyParagraph("Exercise demo links may open YouTube. Your use of YouTube is governed by YouTube’s terms and privacy practices.")
                    privacyParagraph("Records are retained while needed to provide coaching services and meet applicable business or legal obligations. You may request access, correction, export, or deletion of your account and associated data through the Settings tab or by contacting FWB support.")

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
            .font(FWBFont.subheadline)
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
                .font(FWBFont.footnote)
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
                .font(FWBFont.footnote.bold())
                .foregroundStyle(Color.fwbMuted)
            Text(title)
                .font(FWBFont.title3.weight(.bold))
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
                .font(FWBFont.title3.weight(.black))
            Text(message)
                .font(FWBFont.subheadline)
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
                .font(FWBFont.title3.weight(.black))
            Text(message)
                .font(FWBFont.subheadline)
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
                        Text("Client Name").font(FWBFont.title2.bold())
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

private struct WorkoutPreviewEditRequest: Identifiable {
    let id = UUID()
    let index: Int
    let exercise: Exercise
    let substitution: Bool
}

private struct WorkoutLayoutSaveStatus: View {
    @ObservedObject var store: ClientProgramStore
    var body: some View {
        Group {
            switch store.workoutLayoutSaveState {
            case .idle: EmptyView()
            case .saving: Label("Saving your exercises…", systemImage: "arrow.triangle.2.circlepath")
            case .saved: Label("Your exercises are saved.", systemImage: "checkmark.circle")
            case .failed(let message), .conflict(let message): Text(message)
            }
        }.font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
    }
}

private struct WorkoutPreviewEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: ClientProgramStore
    let workoutID: UUID
    let exercises: [Exercise]
    let request: WorkoutPreviewEditRequest
    let suggestions: [Exercise]
    @State private var name: String
    @State private var prescription: String
    @State private var rest: String
    @State private var replacement: Exercise?

    init(store: ClientProgramStore, workoutID: UUID, exercises: [Exercise],
         request: WorkoutPreviewEditRequest, suggestions: [Exercise]) {
        self.store = store; self.workoutID = workoutID; self.exercises = exercises
        self.request = request; self.suggestions = suggestions
        _name = State(initialValue: request.substitution ? "" : request.exercise.name)
        _prescription = State(initialValue: request.exercise.prescription)
        _rest = State(initialValue: request.exercise.rest)
    }

    private var matches: [Exercise] {
        var seen = Set<String>()
        return suggestions.filter { exercise in
            let key = exercise.name.lowercased()
            return seen.insert(key).inserted && (name.isEmpty || key.localizedCaseInsensitiveContains(name))
        }.prefix(12).map { $0 }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(request.substitution ? "Choose a replacement exercise. Your sets and reps stay in place." : "Update the exercise details for your plan.")
                        .font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted)
                    Text("Exercise name").font(FWBFont.caption.weight(.bold))
                    TextField("Search or enter an exercise", text: $name).textFieldStyle(FWBTextFieldStyle())
                    if request.substitution {
                        ForEach(matches, id: \.name) { exercise in
                            Button {
                                name = exercise.name; replacement = exercise
                            } label: {
                                HStack {
                                    Text(exercise.name).frame(maxWidth: .infinity, alignment: .leading)
                                    if replacement?.name == exercise.name { Image(systemName: "checkmark") }
                                }.font(FWBFont.subheadline).padding(12)
                            }.buttonStyle(.plain)
                        }
                    }
                    Text("Sets × reps").font(FWBFont.caption.weight(.bold))
                    TextField("3 × 10", text: $prescription).textFieldStyle(FWBTextFieldStyle())
                    Text("Rest").font(FWBFont.caption.weight(.bold))
                    TextField("60 sec", text: $rest).textFieldStyle(FWBTextFieldStyle())
                    WorkoutLayoutSaveStatus(store: store)
                    Button("Save exercise") {
                        let original = request.exercise
                        let updated = Exercise(code: original.code, name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                                               prescription: prescription, rest: rest,
                                               instructions: request.substitution ? (replacement?.name == name ? replacement?.instructions ?? [] : []) : original.instructions,
                                               video: request.substitution ? (replacement?.name == name ? replacement?.video ?? "" : "") : original.video)
                        var changed = exercises
                        guard changed.indices.contains(request.index) else { return }
                        changed[request.index] = updated
                        Task {
                            if await store.saveWorkoutExercises(workoutID: workoutID, exercises: changed) { dismiss() }
                        }
                    }.buttonStyle(FWBPrimaryButtonStyle())
                        .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.workoutLayoutSaveState == .saving)
                }.padding(16)
            }.background(Color.fwbBackground)
                .font(FWBFont.body)
                .navigationTitle(request.substitution ? "Substitute exercise" : "Edit exercise")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }.tint(Color.fwbLime)
    }
}
