import SwiftUI

private enum WorkoutLogFocus: Hashable {
    case set(UUID)
    case weight(UUID)
    case reps(UUID)
    case effort(UUID)
    case duration(UUID)
    case note(UUID)
}

private enum WorkoutSaveIntent: Equatable {
    case progress
    case finish
}

private enum WorkoutEntryStyle {
    case strength
    case mobility

    var firstHeading: String { self == .mobility ? "SECONDS" : "WEIGHT" }
    var secondHeading: String { self == .mobility ? "ROUNDS" : "REPS" }
    var firstSuffix: String { self == .mobility ? "sec" : "lb" }
    var secondSuffix: String { self == .mobility ? "rounds" : "reps" }
}

private struct ExerciseEditorRequest: Identifiable {
    enum Mode {
        case add
        case substitute(Exercise)
    }

    let id = UUID()
    let mode: Mode

    var title: String {
        switch mode {
        case .add:
            return "Add Exercise"
        case .substitute:
            return "Substitute Exercise"
        }
    }

    var actionTitle: String {
        switch mode {
        case .add:
            return "ADD EXERCISE"
        case .substitute:
            return "SUBSTITUTE EXERCISE"
        }
    }
}

private struct SequenceEditorRequest: Identifiable {
    let id = UUID()
}

struct WorkoutLoggingView<WorkoutSelector: View>: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let workout: Workout
    let clientEmail: String
    let embedded: Bool
    let suggestedExercises: [Exercise]
    let workoutSelector: WorkoutSelector

    @StateObject private var logStore = WorkoutLogStore()
    @StateObject private var suggestionStore = ExerciseSuggestionStore()
    @StateObject private var exerciseLibraryStore = ExerciseLibraryStore()
    @StateObject private var restTimerStore = RestTimerStore()
    @StateObject private var achievementHistoryStore = WorkoutHistoryStore()
    @StateObject private var commentStore = WorkoutCommentStore()
    @ObservedObject private var offlineSyncStore = WorkoutOfflineSyncStore.shared
    @AppStorage("restTimerHapticsEnabled") private var restTimerHapticsEnabled = true
    @AppStorage("workoutPraiseHapticsEnabled") private var workoutPraiseHapticsEnabled = true
    @AppStorage("weeklyWorkoutGoal") private var weeklyWorkoutGoal = 3
    @AppStorage("workoutEffortScale") private var workoutEffortScale = WorkoutEffortScale.rpe.rawValue
    @State private var entryDate = Date()
    @State private var exercises: [Exercise]
    @State private var drafts: [WorkoutSetDraft]
    @State private var groupAssignments: [String: WorkoutGroupAssignment]
    @State private var startedAt = Date()
    @State private var sessionID = UUID()
    @State private var baseRemoteUpdatedAt: Date?
    @State private var activeSaveIntent: WorkoutSaveIntent?
    @State private var activeExerciseSaveID: String?
    @State private var lastSuccessfulSave: WorkoutSaveIntent?
    @State private var lastSavedExerciseID: String?
    @State private var exerciseEditorRequest: ExerciseEditorRequest?
    @State private var sequenceEditorRequest: SequenceEditorRequest?
    @State private var formCheckContext: FormCheckContext?
    @State private var pendingExerciseRemoval: Exercise?
    @State private var substitutionOriginals: [String: Exercise] = [:]
    @State private var copiedDraftIDs: Set<UUID> = []
    @State private var didLoadSession = false
    @State private var restoredPersistenceToken: String?
    @State private var praiseBanner: WorkoutPraiseBannerItem?
    @State private var difficultyPrompt: WorkoutDifficultyPromptRequest?
    @State private var completionCelebration: WorkoutCelebration?
    @FocusState private var focusedField: WorkoutLogFocus?

    init(
        workout: Workout,
        clientEmail: String,
        embedded: Bool = false,
        suggestedExercises: [Exercise] = [],
        @ViewBuilder workoutSelector: () -> WorkoutSelector
    ) {
        self.workout = workout
        self.clientEmail = clientEmail
        self.embedded = embedded
        self.suggestedExercises = suggestedExercises
        self.workoutSelector = workoutSelector()
        _exercises = State(initialValue: workout.exercises)
        _drafts = State(initialValue: Self.makeDrafts(for: workout.exercises))
        _groupAssignments = State(initialValue: WorkoutSequencePlanner.inferredAssignments(for: workout))
    }

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    workoutSelector
                        .padding(.horizontal, -20)

                    if embedded {
                        EmbeddedWorkoutHeader(workout: workout)
                    } else {
                        WorkoutSessionHeader(title: workout.title, startedAt: startedAt)
                    }
                    workoutDateCard
                    WorkoutCommentSummaryCard(store: commentStore, context: commentContext)

                    if let guidedStep {
                        GuidedSequenceBanner(step: guidedStep)
                    }

                    Button {
                        sequenceEditorRequest = SequenceEditorRequest()
                    } label: {
                        Label("EDIT SEQUENCE & GROUPS", systemImage: "arrow.up.arrow.down.square")
                    }
                    .buttonStyle(FWBSecondaryButtonStyle())
                    .disabled(exercises.isEmpty)
                    .accessibilityIdentifier("workout.editSequence")

                    ForEach(sequenceSections) { section in
                        if section.isGroup, let assignment = section.assignment {
                            VStack(alignment: .leading, spacing: 12) {
                                WorkoutGroupHeader(
                                    assignment: assignment,
                                    exerciseCount: section.exercises.count,
                                    roundCount: roundCount(for: section),
                                    restText: roundRestText(for: section)
                                )

                                ForEach(section.exercises) { exercise in
                                    exerciseCard(for: exercise)
                                }
                            }
                            .padding(12)
                            .background(Color.fwbSurface.opacity(0.55), in: Rectangle())
                            .overlay { Rectangle().stroke(Color.fwbLime.opacity(0.72), lineWidth: 1) }
                            .accessibilityElement(children: .contain)
                            .accessibilityLabel(assignment.label)
                        } else {
                            ForEach(section.exercises) { exercise in
                                exerciseCard(for: exercise)
                            }
                        }
                    }

                    if exercises.isEmpty {
                        LoggerEmptyState()
                    }

                    Button {
                        exerciseEditorRequest = ExerciseEditorRequest(mode: .add)
                    } label: {
                        Label("ADD EXERCISE", systemImage: "plus")
                    }
                    .buttonStyle(FWBSecondaryButtonStyle())
                    .accessibilityIdentifier("workout.addExercise")

                    WorkoutSessionSummary(
                        entryStyle: entryStyle,
                        exerciseCount: exercises.count,
                        completedSets: drafts.filter { !$0.isWarmUp && $0.isCompleted }.count,
                        totalSets: drafts.filter { !$0.isWarmUp }.count,
                        totalReps: drafts
                            .filter { !$0.isWarmUp && (entryStyle == .mobility || $0.setType.countsTowardWorkingMetrics) }
                            .reduce(0) { $0 + $1.repsValue },
                        totalVolume: entryStyle == .mobility
                            ? drafts.filter { !$0.isWarmUp }.reduce(0) { $0 + $1.weightValue }
                            : drafts.filter { !$0.isWarmUp }.reduce(0) { $0 + $1.volume },
                        totalTimedSeconds: drafts
                            .filter { $0.setType == .timed }
                            .reduce(0) { $0 + $1.durationValue }
                    )

                    statusMessage

                    Button {
                        difficultyPrompt = WorkoutDifficultyPromptRequest(workoutTitle: workout.title)
                    } label: {
                        HStack(spacing: 10) {
                            if isSyncing && activeSaveIntent == .finish {
                                ProgressView()
                                    .tint(.black)
                            } else {
                                Image(systemName: "checkmark")
                            }
                            Text(isSyncing && activeSaveIntent == .finish ? "FINISHING…" : "SAVE & FINISH WORKOUT")
                        }
                    }
                    .buttonStyle(FWBPrimaryButtonStyle())
                    .disabled(isSyncing || logStore.state == .loading)
                    .accessibilityIdentifier("workout.finish")
                }
                .padding(20)
                .padding(.bottom, 22)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if restTimerStore.isVisible {
                RestTimerBanner(store: restTimerStore)
                    .padding(.horizontal, 14)
                    .padding(.bottom, 8)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.2), value: restTimerStore.isVisible)
        .overlay(alignment: .top) {
            if let praiseBanner {
                WorkoutPraiseBanner(item: praiseBanner)
                    .padding(.horizontal, 14)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .zIndex(10)
            }
        }
        .animation(.spring(response: 0.34, dampingFraction: 0.82), value: praiseBanner)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focusedField = nil }
            }
        }
        .task(id: dateString) {
            didLoadSession = false
            restoredPersistenceToken = nil
            await loadSavedSets()
            didLoadSession = true
        }
        .task(id: commentContext) {
            await commentStore.refresh(context: commentContext)
        }
        .task(id: draftPersistenceTaskID) {
            guard didLoadSession,
                  draftPersistenceToken != restoredPersistenceToken else { return }
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }

            if shouldPersistDraft {
                await offlineSyncStore.persistDraft(
                    email: clientEmail,
                    sessionID: sessionID,
                    workoutTemplateID: workout.id,
                    workoutTitle: workout.title,
                    entryDate: dateString,
                    exercises: exercises,
                    drafts: drafts,
                    groupAssignments: groupAssignments,
                    baseRemoteUpdatedAt: baseRemoteUpdatedAt
                )
            } else {
                await offlineSyncStore.discardDraft(
                    email: clientEmail,
                    workoutTitle: workout.title,
                    entryDate: dateString
                )
            }
        }
        .task {
            await suggestionStore.load(email: clientEmail)
        }
        .task {
            await exerciseLibraryStore.loadIfNeeded()
        }
        .task {
            await achievementHistoryStore.loadIfNeeded(email: clientEmail)
        }
        .onAppear {
            startedAt = Date()
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            Task {
                await offlineSyncStore.retryPending()
                await commentStore.refresh(context: commentContext)
            }
        }
        .sheet(item: $exerciseEditorRequest) { request in
            ExercisePickerSheet(
                request: request,
                suggestions: suggestionNames
            ) { exerciseName in
                applyExerciseEdit(request, exerciseName: exerciseName)
            }
        }
        .sheet(item: $sequenceEditorRequest) { _ in
            WorkoutSequenceEditorView(
                exercises: $exercises,
                assignments: $groupAssignments
            )
        }
        .sheet(item: $formCheckContext) { context in
            FormCheckSubmissionSheet(context: context, clientEmail: clientEmail)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $difficultyPrompt) { request in
            WorkoutDifficultyPromptView(request: request) { rating in
                saveWorkout(intent: .finish, difficultyRating: rating)
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.hidden)
        }
        .sheet(item: $completionCelebration) { celebration in
            WorkoutCelebrationView(celebration: celebration) {
                if !embedded {
                    dismiss()
                }
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.hidden)
        }
        .confirmationDialog(
            "Remove exercise?",
            isPresented: Binding(
                get: { pendingExerciseRemoval != nil },
                set: { isPresented in
                    if !isPresented {
                        pendingExerciseRemoval = nil
                    }
                }
            ),
            titleVisibility: .visible
        ) {
            Button("Remove Exercise", role: .destructive) {
                if let exercise = pendingExerciseRemoval {
                    deleteExercise(exercise)
                }
                pendingExerciseRemoval = nil
            }
            Button("Cancel", role: .cancel) {
                pendingExerciseRemoval = nil
            }
        } message: {
            Text("This removes the exercise and its current set entries from this workout only. The original program stays unchanged.")
        }
    }

    private var workoutDateCard: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 14) {
                    workoutDatePicker
                    webSyncLabel
                }
            } else {
                HStack(spacing: 14) {
                    workoutDatePicker
                    Spacer(minLength: 8)
                    webSyncLabel
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }

    private var workoutDatePicker: some View {
        HStack(spacing: 14) {
            Image(systemName: "calendar")
                .font(.headline)
                .foregroundStyle(Color.fwbLime)
                .frame(width: 42, height: 42)
                .background(Color.fwbSurface, in: Rectangle())

            VStack(alignment: .leading, spacing: 3) {
                Text("WORKOUT DATE")
                    .font(.footnote.bold())
                    .tracking(0.8)
                    .foregroundStyle(Color.fwbMuted)
                DatePicker("Workout date", selection: $entryDate, in: ...Date(), displayedComponents: .date)
                    .labelsHidden()
                    .tint(Color.fwbLime)
            }
        }
    }

    private var webSyncLabel: some View {
        Label("WEB SYNC", systemImage: "arrow.triangle.2.circlepath")
            .font(.footnote.bold())
            .foregroundStyle(Color.fwbLime)
    }

    private var isCustomWorkout: Bool {
        workout.format.lowercased() == "custom"
    }

    private var entryStyle: WorkoutEntryStyle {
        workout.format.lowercased() == "mobility" ? .mobility : .strength
    }

    private var suggestionNames: [String] {
        let rawNames = [
            exerciseLibraryStore.suggestionNames,
            ExerciseLibrary.names,
            suggestedExercises.map(\.name),
            exercises.map(\.name),
            suggestionStore.historyNames
        ]
        .flatMap { $0 }
        .map {
            ExerciseNameIdentity.canonicalName(
                for: $0,
                approvedExercises: exerciseLibraryStore.exercises
            )
        }

        return ExerciseSuggestionLibrary.merged([rawNames])
    }

    private var sequenceSections: [WorkoutSequenceSection] {
        WorkoutSequencePlanner.sections(
            exercises: exercises,
            assignments: groupAssignments
        )
    }

    private var guidedStep: GuidedWorkoutStep? {
        WorkoutSequencePlanner.guidedStep(sections: sequenceSections, drafts: drafts)
    }

    @ViewBuilder
    private func exerciseCard(for exercise: Exercise) -> some View {
        let index = exercises.firstIndex(where: { $0.id == exercise.id }) ?? 0
        let step = guidedStep
        WorkoutExerciseLogCard(
            exercise: exercise,
            drafts: $drafts,
            focusedField: $focusedField,
            entryStyle: entryStyle,
            preferredEffortScale: preferredEffortScale,
            previousSets: PreviousWorkoutResults.sets(
                for: exercise,
                before: dateString,
                in: achievementHistoryStore.sessions
            ),
            isPreviousHistoryLoading: achievementHistoryStore.state == .idle
                || achievementHistoryStore.state == .loading,
            editableName: isCustomWorkout ? nameBinding(for: exercise) : nil,
            suggestions: suggestionNames,
            substitutedFromName: substitutionOriginals[exercise.code]?.name,
            copySource: copySource(for: exercise),
            isCopyHistoryLoading: achievementHistoryStore.state == .idle
                || achievementHistoryStore.state == .loading,
            copiedDraftIDs: copiedDraftIDs,
            initiallyExpanded: isCustomWorkout || index == 0 || step?.exerciseID == exercise.id,
            guidedRoundText: step?.exerciseID == exercise.id
                ? "Round \(step?.round ?? 1) · exercise \(step?.position ?? 1) of \(step?.exerciseCount ?? 1)"
                : nil,
            isGuidedCurrent: step?.exerciseID == exercise.id,
            isSavingProgress: isSyncing && activeExerciseSaveID == exercise.id,
            didSaveProgress: lastSavedExerciseID == exercise.id,
            saveProgressDisabled: isSyncing || logStore.state == .loading,
            onAddSet: { addSet(to: exercise) },
            onDeleteSet: { deleteSet($0, from: exercise) },
            onCopyLastWorkout: { source in
                copyLastWorkout(source, to: exercise)
            },
            onCopyPreviousSet: { draftID in
                copyPreviousSet(draftID, for: exercise)
            },
            onDraftEdited: { copiedDraftIDs.remove($0) },
            onSetCompletionChanged: { draft, isCompleted in
                handleSetCompletion(
                    for: exercise,
                    draft: draft,
                    isCompleted: isCompleted
                )
            },
            onInsertWarmUps: { plans in
                insertWarmUps(plans, for: exercise)
            },
            onSetTypeChanged: { draftID, setType in
                updateSetType(setType, for: draftID, in: exercise)
            },
            onSetLabelChanged: { draftID, label in
                updateSetLabel(label, for: draftID, in: exercise)
            },
            onStartRestTimer: {
                startRestTimer(for: exercise)
            },
            onSubstituteExercise: {
                exerciseEditorRequest = ExerciseEditorRequest(mode: .substitute(exercise))
            },
            onRevertSubstitution: {
                revertSubstitution(for: exercise)
            },
            onDeleteExercise: {
                pendingExerciseRemoval = exercise
            },
            onSaveProgress: {
                saveExerciseProgress(for: exercise)
            },
            onSendFormCheck: {
                formCheckContext = FormCheckContext(
                    exerciseCode: exercise.code,
                    exerciseName: exercise.name,
                    workoutTitle: workout.title
                )
            }
        )
    }

    private func roundCount(for section: WorkoutSequenceSection) -> Int {
        section.exercises.reduce(0) { result, exercise in
            max(result, drafts.filter { matches($0, exercise) }.map(\.setNumber).max() ?? 0)
        }
    }

    private func copySource(for exercise: Exercise) -> WorkoutExerciseCopySource? {
        WorkoutCopyHistory.previousExercise(
            for: exercise,
            workoutTitle: workout.title,
            before: dateString,
            sessions: achievementHistoryStore.sessions
        )
    }

    private func copyLastWorkout(_ source: WorkoutExerciseCopySource, to exercise: Exercise) {
        focusedField = nil
        let result = WorkoutDraftCopy.lastWorkout(source, to: exercise, in: drafts)
        withAnimation(.easeOut(duration: 0.18)) {
            drafts = result.drafts
            copiedDraftIDs.formUnion(result.copiedDraftIDs)
        }
    }

    private func copyPreviousSet(_ draftID: UUID, for exercise: Exercise) {
        focusedField = nil
        let result = WorkoutDraftCopy.previousSet(draftID, for: exercise, in: drafts)
        withAnimation(.easeOut(duration: 0.18)) {
            drafts = result.drafts
            copiedDraftIDs.formUnion(result.copiedDraftIDs)
        }
    }

    private func roundRestText(for section: WorkoutSequenceSection) -> String {
        section.exercises.reversed().first {
            !$0.rest.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }?.rest ?? "60 sec"
    }

    @ViewBuilder
    private var statusMessage: some View {
        switch offlineSyncStore.state {
        case .restoring:
            LoggerStatusBanner(text: "Checking for a recovered workout…", icon: "arrow.clockwise", color: .fwbMuted)
        case .restored:
            LoggerStatusBanner(text: "Recovered your unsaved workout from this iPhone.", icon: "clock.arrow.circlepath", color: .fwbLime)
        case .restoredFromWeb:
            LoggerStatusBanner(text: "Continued your newer workout draft from the web app.", icon: "laptopcomputer.and.iphone", color: .fwbLime)
        case .draftSaved:
            LoggerStatusBanner(text: "Draft saved on this iPhone.", icon: "iphone.and.arrow.forward", color: .fwbMuted)
        case .syncing:
            LoggerStatusBanner(text: "Syncing workout with the web app…", icon: "arrow.triangle.2.circlepath", color: .fwbLime)
        case .synced:
            LoggerStatusBanner(
                text: lastSuccessfulSave == .progress
                    ? "Progress saved. Keep training when you’re ready."
                    : "Workout saved and synced with the web app.",
                icon: "checkmark.circle.fill",
                color: .fwbLime
            )
        case .conflictResolved(let count):
            LoggerStatusBanner(
                text: count == 1
                    ? "A newer web change was kept while your other workout updates synced."
                    : "\(count) newer web changes were kept while your other workout updates synced.",
                icon: "arrow.triangle.branch",
                color: .fwbLime
            )
        case .queued(let count):
            LoggerStatusBanner(
                text: count == 1
                    ? "Saved on this iPhone. It will sync automatically when you’re back online."
                    : "Saved on this iPhone. \(count) workouts will sync automatically when you’re back online.",
                icon: "icloud.slash",
                color: .fwbLime
            )
        case .failed(let message):
            LoggerStatusBanner(text: message, icon: "exclamationmark.triangle.fill", color: .fwbRed)
        case .idle:
            switch logStore.state {
            case .loading:
                LoggerStatusBanner(text: "Loading saved sets…", icon: "arrow.clockwise", color: .fwbMuted)
            case .failed(let message):
                LoggerStatusBanner(text: message, icon: "exclamationmark.triangle.fill", color: .fwbRed)
            case .idle, .ready, .saving, .saved:
                EmptyView()
            }
        }
    }

    private var isSyncing: Bool {
        offlineSyncStore.state == .syncing
    }

    private var dateString: String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: entryDate)
    }

    private var commentContext: WorkoutCommentContext {
        WorkoutCommentContext(
            clientEmail: clientEmail,
            entryDate: dateString,
            workoutTitle: workout.title
        )
    }

    private var draftPersistenceTaskID: String {
        "\(didLoadSession)|\(dateString)|\(draftPersistenceToken)"
    }

    private var draftPersistenceToken: String {
        let exercisePart = exercises.map {
            [
                $0.code,
                $0.name,
                $0.prescription,
                $0.rest,
                $0.instructions.joined(separator: "\u{1C}"),
                $0.video
            ].joined(separator: "\u{1F}")
        }.joined(separator: "\u{1E}")
        let setPart = drafts.map {
            [
                $0.exerciseCode,
                $0.exerciseName,
                String($0.setNumber),
                $0.weight,
                $0.reps,
                $0.duration,
                $0.notes,
                $0.effortScale?.rawValue ?? "",
                $0.effort,
                String($0.isCompleted),
                $0.setType.rawValue
            ].joined(separator: "\u{1F}")
        }.joined(separator: "\u{1E}")
        let groupPart = groupAssignments
            .sorted { $0.key < $1.key }
            .map { key, assignment in
                [key, assignment.id, assignment.kind.rawValue, assignment.label]
                    .joined(separator: "\u{1F}")
            }
            .joined(separator: "\u{1E}")
        return exercisePart + "\u{1D}" + setPart + "\u{1D}" + groupPart
    }

    private var shouldPersistDraft: Bool {
        drafts.contains { $0.containsEntry || $0.isCompleted } ||
            exercises != workout.exercises ||
            groupAssignments != WorkoutSequencePlanner.inferredAssignments(for: workout) ||
            drafts.count != Self.makeDrafts(for: exercises).count
    }

    private func saveWorkout(
        intent: WorkoutSaveIntent,
        exerciseID: String? = nil,
        difficultyRating: Int? = nil
    ) {
        focusedField = nil
        activeSaveIntent = exerciseID == nil ? intent : nil
        activeExerciseSaveID = exerciseID
        Task {
            let result = await offlineSyncStore.save(
                email: clientEmail,
                sessionID: sessionID,
                workoutTemplateID: workout.id,
                workoutTitle: workout.title,
                entryDate: dateString,
                exercises: exercises,
                drafts: drafts,
                groupAssignments: groupAssignments,
                baseRemoteUpdatedAt: baseRemoteUpdatedAt,
                isFinished: intent == .finish,
                difficultyRating: difficultyRating
            )
            activeSaveIntent = nil
            activeExerciseSaveID = nil

            guard result == .synced || result == .queued else { return }
            lastSuccessfulSave = intent
            lastSavedExerciseID = exerciseID

            if intent == .finish {
                let celebration = WorkoutPraiseEvaluator.strength(
                    clientEmail: clientEmail,
                    workoutTitle: workout.title,
                    entryDate: dateString,
                    startedAt: startedAt,
                    drafts: drafts,
                    history: achievementHistoryStore.sessions,
                    weeklyGoal: weeklyWorkoutGoal
                )
                completionCelebration = celebration
                WorkoutPraiseHaptics.workoutComplete(isEnabled: workoutPraiseHapticsEnabled)

                await HealthKitWorkoutSyncStore.shared.saveStrengthWorkoutIfAuthorized(
                    title: workout.title,
                    entryDate: entryDate,
                    startedAt: startedAt,
                    endedAt: Date()
                )
            }

            if let exerciseID {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                if lastSavedExerciseID == exerciseID {
                    lastSavedExerciseID = nil
                }
            }

        }
    }

    private func addSet(to exercise: Exercise) {
        let nextSet = drafts
            .filter { matches($0, exercise) && !$0.isWarmUp }
            .map(\.setNumber)
            .max()
            .map { $0 + 1 } ?? 1
        let draft = WorkoutSetDraft(exercise: exercise, setNumber: nextSet)
        withAnimation(.easeOut(duration: 0.18)) {
            drafts.append(draft)
        }
        focusedField = .weight(draft.id)
    }

    private func saveExerciseProgress(for exercise: Exercise) {
        for index in drafts.indices where matches(drafts[index], exercise) && drafts[index].containsEntry {
            drafts[index].isCompleted = true
        }
        saveWorkout(intent: .progress, exerciseID: exercise.id)
    }

    private func startRestTimer(for exercise: Exercise) {
        focusedField = nil
        restTimerStore.start(
            seconds: RestDurationParser.seconds(from: exercise.rest),
            exerciseName: exercise.name.isEmpty ? "Exercise" : exercise.name,
            hapticsEnabled: restTimerHapticsEnabled
        )
    }

    private func handleSetCompletion(
        for exercise: Exercise,
        draft: WorkoutSetDraft,
        isCompleted: Bool
    ) {
        guard isCompleted else { return }
        let exerciseDrafts = drafts.filter { matches($0, exercise) && !$0.isWarmUp }
        let exerciseIsComplete = !exerciseDrafts.isEmpty && exerciseDrafts.allSatisfy(\.isCompleted)

        if !draft.isWarmUp,
           let assignment = groupAssignments[exercise.id],
           let section = sequenceSections.first(where: { $0.assignment?.id == assignment.id }),
           section.isGroup {
            handleGroupedSetCompletion(
                exercise: exercise,
                setNumber: draft.setNumber,
                section: section,
                exerciseIsComplete: exerciseIsComplete
            )
            return
        }

        showPraise(
            WorkoutPraiseBannerItem(
                title: draft.isWarmUp ? "WARM-UP LOGGED." : exerciseIsComplete ? "EXERCISE COMPLETE." : "STRONG SET.",
                detail: draft.isWarmUp
                    ? "Keep building toward your working weight."
                    : exerciseIsComplete ? "\(exercise.name) is done. Keep building." : "Set logged. Stay with it.",
                icon: draft.isWarmUp ? "flame.fill" : exerciseIsComplete ? "checkmark.seal.fill" : "checkmark"
            )
        )
        if !draft.isWarmUp && exerciseIsComplete && !restTimerHapticsEnabled {
            WorkoutPraiseHaptics.exerciseComplete(isEnabled: workoutPraiseHapticsEnabled)
        }

        let seconds = RestDurationParser.seconds(from: exercise.rest)
        restTimerStore.start(
            seconds: seconds,
            exerciseName: exercise.name.isEmpty ? "Exercise" : exercise.name,
            hapticsEnabled: restTimerHapticsEnabled
        )
    }

    private func handleGroupedSetCompletion(
        exercise: Exercise,
        setNumber: Int,
        section: WorkoutSequenceSection,
        exerciseIsComplete: Bool
    ) {
        let pendingInRound = section.exercises.first { member in
            drafts.contains {
                matches($0, member) && $0.setNumber == setNumber && !$0.isCompleted
            }
        }
        let hasLaterRound = section.exercises.contains { member in
            drafts.contains { matches($0, member) && $0.setNumber > setNumber && !$0.isCompleted }
        }

        if let pendingInRound {
            restTimerStore.dismiss()
            showPraise(
                WorkoutPraiseBannerItem(
                    title: "NEXT: \(pendingInRound.name.uppercased())",
                    detail: "Stay in \(section.label). No rest between exercises.",
                    icon: "arrow.right"
                )
            )
        } else if hasLaterRound {
            let restText = roundRestText(for: section)
            showPraise(
                WorkoutPraiseBannerItem(
                    title: "ROUND \(setNumber) COMPLETE.",
                    detail: "Rest now, then begin the next round.",
                    icon: "timer"
                )
            )
            restTimerStore.start(
                seconds: RestDurationParser.seconds(from: restText),
                exerciseName: "\(section.label) · between rounds",
                hapticsEnabled: restTimerHapticsEnabled
            )
        } else {
            restTimerStore.dismiss()
            showPraise(
                WorkoutPraiseBannerItem(
                    title: "\(section.label.uppercased()) COMPLETE.",
                    detail: "All rounds are logged. Keep building.",
                    icon: "checkmark.seal.fill"
                )
            )
        }

        if exerciseIsComplete && !restTimerHapticsEnabled {
            WorkoutPraiseHaptics.exerciseComplete(isEnabled: workoutPraiseHapticsEnabled)
        }
    }

    private func showPraise(_ item: WorkoutPraiseBannerItem) {
        withAnimation {
            praiseBanner = item
        }
        Task {
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            guard !Task.isCancelled, praiseBanner?.id == item.id else { return }
            withAnimation {
                praiseBanner = nil
            }
        }
    }

    private func deleteSet(_ id: UUID, from exercise: Exercise) {
        focusedField = nil
        withAnimation(.easeOut(duration: 0.18)) {
            drafts.removeAll { $0.id == id }
            copiedDraftIDs.remove(id)
            renumberSets(for: exercise)
        }
    }

    private func insertWarmUps(_ plans: [WarmUpSetPlan], for exercise: Exercise) {
        focusedField = nil
        withAnimation(.easeOut(duration: 0.18)) {
            drafts.removeAll { matches($0, exercise) && $0.isWarmUp }
            drafts.append(contentsOf: plans.enumerated().map { index, plan in
                WorkoutSetDraft(
                    exercise: exercise,
                    setNumber: WorkoutSetNumber.warmUp(index + 1),
                    weight: Self.numberString(plan.weight),
                    reps: String(plan.reps),
                    setType: .warmUp
                )
            })
        }
    }

    private func updateSetType(_ setType: WorkoutSetType, for draftID: UUID, in exercise: Exercise) {
        focusedField = nil
        withAnimation(.easeOut(duration: 0.18)) {
            guard let index = drafts.firstIndex(where: { $0.id == draftID }) else { return }
            drafts[index].setType = setType
            if setType == .warmUp {
                drafts[index].effortScale = nil
                drafts[index].effort = ""
            }
            renumberSets(for: exercise)
        }
    }

    private func updateSetLabel(_ label: String, for draftID: UUID, in exercise: Exercise) {
        focusedField = nil
        let normalized = label
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()

        withAnimation(.easeOut(duration: 0.18)) {
            guard let index = drafts.firstIndex(where: { $0.id == draftID }) else { return }

            if normalized.hasPrefix("W") {
                let requestedOrdinal = Int(normalized.dropFirst())
                let usedOrdinals = Set(
                    drafts
                        .filter { matches($0, exercise) && $0.id != draftID && $0.isWarmUp }
                        .compactMap(\.warmUpOrdinal)
                )
                let ordinal = requestedOrdinal.flatMap { usedOrdinals.contains($0) ? nil : max($0, 1) }
                    ?? (1...12).first(where: { !usedOrdinals.contains($0) })
                    ?? 1
                drafts[index].setType = .warmUp
                drafts[index].setNumber = WorkoutSetNumber.warmUp(ordinal)
                drafts[index].effortScale = nil
                drafts[index].effort = ""
                return
            }

            guard let requestedNumber = Int(normalized), requestedNumber > 0 else { return }
            let usedNumbers = Set(
                drafts
                    .filter { matches($0, exercise) && $0.id != draftID && !$0.isWarmUp }
                    .map(\.setNumber)
            )
            let number = usedNumbers.contains(requestedNumber)
                ? (1...99).first(where: { !usedNumbers.contains($0) }) ?? requestedNumber
                : min(requestedNumber, 99)
            drafts[index].setType = .working
            drafts[index].setNumber = number
        }
    }

    private func deleteExercise(_ exercise: Exercise) {
        focusedField = nil
        withAnimation(.easeOut(duration: 0.18)) {
            exercises.removeAll { $0.id == exercise.id }
            copiedDraftIDs.subtract(drafts.filter { matches($0, exercise) }.map(\.id))
            drafts.removeAll { matches($0, exercise) }
            groupAssignments.removeValue(forKey: exercise.id)
            groupAssignments = WorkoutSequencePlanner.normalizedAssignments(
                exercises: exercises,
                assignments: groupAssignments
            )
            substitutionOriginals.removeValue(forKey: exercise.code)
        }
    }

    private func applyExerciseEdit(_ request: ExerciseEditorRequest, exerciseName: String) {
        switch request.mode {
        case .add:
            insertCustomExercise(code: nextAddedExerciseCode(), name: exerciseName)
        case .substitute(let exercise):
            substituteExercise(exercise, with: exerciseName)
        }
    }

    private func nextAddedExerciseCode() -> String {
        let currentNumbers = exercises.compactMap { exercise -> Int? in
            let uppercasedCode = exercise.code.uppercased()
            guard uppercasedCode.hasPrefix("ADD") || uppercasedCode.hasPrefix("CW") else { return nil }
            return Int(uppercasedCode.filter(\.isNumber))
        }
        return String(format: "ADD%02d", (currentNumbers.max() ?? 0) + 1)
    }

    private func insertCustomExercise(code: String, name: String) {
        let approvedExercise = approvedExercise(matching: name)
        let resolvedName = (approvedExercise?.name ?? name).fwbTitleCased
        let template = suggestedExercises.first {
            $0.name.caseInsensitiveCompare(resolvedName) == .orderedSame
                || $0.name.caseInsensitiveCompare(name) == .orderedSame
        } ?? libraryTemplate(from: approvedExercise) ?? ExerciseLibrary.exercise(named: resolvedName)
        let exercise = Exercise(
            code: code,
            name: resolvedName,
            prescription: template?.prescription ?? "Custom sets",
            rest: template?.rest ?? "",
            instructions: template?.instructions ?? [],
            video: template?.video ?? ""
        )
        exercises.append(exercise)
        drafts.append(contentsOf: (1...3).map {
            WorkoutSetDraft(exercise: exercise, setNumber: $0)
        })
    }

    private func substituteExercise(_ exercise: Exercise, with name: String) {
        guard let exerciseIndex = exercises.firstIndex(where: { $0.id == exercise.id }) else { return }

        let approvedExercise = approvedExercise(matching: name)
        let replacementName = (approvedExercise?.name ?? name)
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .fwbTitleCased
        guard !replacementName.isEmpty else { return }

        if let original = substitutionOriginals[exercise.code],
           original.name.caseInsensitiveCompare(replacementName) == .orderedSame {
            revertSubstitution(for: exercise)
            return
        }

        guard exercise.name.caseInsensitiveCompare(replacementName) != .orderedSame else { return }

        if substitutionOriginals[exercise.code] == nil {
            substitutionOriginals[exercise.code] = exercise
        }

        let replacementTemplate = suggestedExercises.first {
            $0.name.caseInsensitiveCompare(replacementName) == .orderedSame
        } ?? libraryTemplate(from: approvedExercise) ?? ExerciseLibrary.exercise(named: replacementName)

        let replacement = Exercise(
            code: exercise.code,
            name: replacementName,
            prescription: exercise.prescription,
            rest: exercise.rest,
            instructions: replacementTemplate?.instructions ?? exercise.instructions,
            video: replacementTemplate?.video ?? ""
        )
        focusedField = nil
        withAnimation(.easeOut(duration: 0.18)) {
            exercises[exerciseIndex] = replacement
            for draftIndex in drafts.indices where matches(drafts[draftIndex], exercise) {
                drafts[draftIndex].exerciseName = replacement.name
            }
        }
    }

    private func approvedExercise(matching name: String) -> ApprovedExercise? {
        let normalizedName = ExerciseNameIdentity.key(for: name)

        return exerciseLibraryStore.exercises.first { exercise in
            ExerciseNameIdentity.key(for: exercise.name) == normalizedName
                || exercise.aliases.contains {
                    ExerciseNameIdentity.key(for: $0) == normalizedName
                }
        }
    }

    private func libraryTemplate(from approvedExercise: ApprovedExercise?) -> Exercise? {
        guard let approvedExercise else { return nil }

        let instructions = approvedExercise.instructions
            .split(whereSeparator: \.isNewline)
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        return Exercise(
            code: "",
            name: approvedExercise.name,
            prescription: "\(approvedExercise.defaultSets) x \(approvedExercise.defaultReps)",
            rest: "\(approvedExercise.defaultRestSeconds) sec",
            instructions: instructions,
            video: approvedExercise.demoURL ?? ""
        )
    }

    private func revertSubstitution(for exercise: Exercise) {
        guard let original = substitutionOriginals[exercise.code],
              let exerciseIndex = exercises.firstIndex(where: { $0.id == exercise.id }) else { return }

        focusedField = nil
        withAnimation(.easeOut(duration: 0.18)) {
            exercises[exerciseIndex] = original
            for draftIndex in drafts.indices where matches(drafts[draftIndex], exercise) {
                drafts[draftIndex].exerciseName = original.name
            }
            substitutionOriginals.removeValue(forKey: exercise.code)
        }
    }

    private func nameBinding(for snapshot: Exercise) -> Binding<String> {
        Binding(
            get: {
                (exercises.first(where: { $0.code == snapshot.code })?.name ?? snapshot.name)
                    .fwbTitleCased
            },
            set: { nextName in
                renameExercise(code: snapshot.code, to: nextName.fwbTitleCased)
            }
        )
    }

    private func renameExercise(code: String, to nextName: String) {
        guard let exerciseIndex = exercises.firstIndex(where: { $0.code == code }) else { return }
        let current = exercises[exerciseIndex]
        exercises[exerciseIndex] = Exercise(
            code: current.code,
            name: nextName,
            prescription: current.prescription,
            rest: current.rest,
            instructions: current.instructions,
            video: current.video
        )

        for draftIndex in drafts.indices where drafts[draftIndex].exerciseCode == code {
            drafts[draftIndex].exerciseName = nextName
        }
    }

    private func renumberSets(for exercise: Exercise) {
        let warmUpIndexes = drafts.indices.filter { matches(drafts[$0], exercise) && drafts[$0].isWarmUp }
        for (offset, index) in warmUpIndexes.enumerated() {
            drafts[index].setNumber = WorkoutSetNumber.warmUp(offset + 1)
        }

        let matchingIndexes = drafts.indices.filter { matches(drafts[$0], exercise) && !drafts[$0].isWarmUp }
        for (offset, index) in matchingIndexes.enumerated() {
            drafts[index].setNumber = offset + 1
        }
    }

    private func matches(_ draft: WorkoutSetDraft, _ exercise: Exercise) -> Bool {
        draft.exerciseCode == exercise.code && draft.exerciseName == exercise.name
    }

    private func loadSavedSets() async {
        substitutionOriginals = [:]
        copiedDraftIDs = []
        groupAssignments = WorkoutSequencePlanner.inferredAssignments(for: workout)

        if isCustomWorkout {
            exercises = []
            drafts = []
        } else {
            exercises = workout.exercises
            drafts = Self.makeDrafts(for: exercises)
        }

        let records = await logStore.load(
            email: clientEmail,
            workoutTitle: workout.title,
            entryDate: dateString,
            excludedExerciseCodes: ["WARMUP", "CARDIO"]
        )
        sessionID = logStore.remoteSessionID ?? UUID()
        baseRemoteUpdatedAt = logStore.baseRemoteUpdatedAt

        for record in records {
            if !isCustomWorkout,
               let matchingExercise = exercises.first(where: { $0.code == record.exerciseCode }),
               matchingExercise.name != record.exerciseName {
                substituteExercise(matchingExercise, with: record.exerciseName)
            }

            if !exercises.contains(where: {
                $0.code == record.exerciseCode && $0.name == record.exerciseName
            }) {
                exercises.append(
                    Exercise(code: record.exerciseCode, name: record.exerciseName, prescription: "Custom", rest: "")
                )
            }

            let exercise = exercises.first {
                $0.code == record.exerciseCode && $0.name == record.exerciseName
            } ?? Exercise(code: record.exerciseCode, name: record.exerciseName)

            if let index = drafts.firstIndex(where: {
                $0.exerciseCode == record.exerciseCode && $0.setNumber == record.setNumber
            }) {
                drafts[index] = WorkoutSetDraft(
                    id: record.setID ?? drafts[index].id,
                    exercise: exercise,
                    setNumber: record.setNumber,
                    weight: Self.numberString(record.weightUsed),
                    reps: record.reps.map(Self.numberString) ?? "",
                    duration: record.durationSeconds.map(Self.numberString) ?? "",
                    notes: record.notes ?? "",
                    effortScale: record.effortScale,
                    effort: record.effortValue.map(Self.numberString) ?? "",
                    isCompleted: true,
                    setType: record.resolvedSetType
                )
            } else {
                drafts.append(
                    WorkoutSetDraft(
                        id: record.setID ?? UUID(),
                        exercise: exercise,
                        setNumber: record.setNumber,
                        weight: Self.numberString(record.weightUsed),
                        reps: record.reps.map(Self.numberString) ?? "",
                        duration: record.durationSeconds.map(Self.numberString) ?? "",
                        notes: record.notes ?? "",
                        effortScale: record.effortScale,
                        effort: record.effortValue.map(Self.numberString) ?? "",
                        isCompleted: true,
                        setType: record.resolvedSetType
                    )
                )
            }
        }

        if isCustomWorkout && exercises.isEmpty {
            exercises = workout.exercises
            drafts = Self.makeDrafts(for: exercises)
        }

        if let recovered = await offlineSyncStore.restoreDraft(
            email: clientEmail,
            workoutTitle: workout.title,
            entryDate: dateString
        ) {
            sessionID = recovered.stableSessionID
            baseRemoteUpdatedAt = recovered.baseRemoteUpdatedAt ?? baseRemoteUpdatedAt
            exercises = recovered.restoredExercises
            drafts = recovered.restoredDrafts
            let recoveredAssignments = WorkoutSequencePlanner.normalizedAssignments(
                exercises: exercises,
                assignments: recovered.restoredGroupAssignments
            )
            groupAssignments = recoveredAssignments.isEmpty
                ? WorkoutSequencePlanner.inferredAssignments(
                    for: Workout(
                        title: workout.title,
                        focus: workout.focus,
                        format: workout.format,
                        exercises: exercises
                    )
                )
                : recoveredAssignments
            substitutionOriginals = [:]

            if !isCustomWorkout {
                for exercise in exercises {
                    if let original = workout.exercises.first(where: { $0.code == exercise.code }),
                       original.name.caseInsensitiveCompare(exercise.name) != .orderedSame {
                        substitutionOriginals[exercise.code] = original
                    }
                }
            }

            restoredPersistenceToken = draftPersistenceToken
        }
    }

    private static func makeDrafts(for exercises: [Exercise]) -> [WorkoutSetDraft] {
        exercises.flatMap { exercise in
            (1...setCount(from: exercise.prescription)).map {
                WorkoutSetDraft(exercise: exercise, setNumber: $0)
            }
        }
    }

    private static func setCount(from prescription: String) -> Int {
        let normalized = prescription.lowercased().replacingOccurrences(of: "×", with: "x")
        let patterns = [
            #"\d+\s*(?:sets?|rounds?)"#,
            #"\d+\s*x"#,
            #"x\s*\d+"#
        ]

        for pattern in patterns {
            guard let range = normalized.range(of: pattern, options: .regularExpression) else { continue }
            let number = normalized[range].filter(\.isNumber)
            if let count = Int(number) {
                return min(max(count, 1), 12)
            }
        }

        return 3
    }

    private static func numberString(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(value)
    }

    private var preferredEffortScale: WorkoutEffortScale {
        WorkoutEffortScale(rawValue: workoutEffortScale) ?? .rpe
    }

    private func previousResults(for exercise: Exercise) -> [Int: WorkoutHistoryRecord] {
        var results: [Int: WorkoutHistoryRecord] = [:]

        for session in achievementHistoryStore.sessions where session.entryDate < dateString {
            for record in session.records where results[record.setNumber] == nil {
                guard !record.isCardio,
                      record.exerciseCode == exercise.code,
                      record.exerciseName.caseInsensitiveCompare(exercise.name) == .orderedSame else { continue }
                results[record.setNumber] = record
            }
        }

        return results
    }
}

extension WorkoutLoggingView where WorkoutSelector == EmptyView {
    init(
        workout: Workout,
        clientEmail: String,
        embedded: Bool = false,
        suggestedExercises: [Exercise] = []
    ) {
        self.init(
            workout: workout,
            clientEmail: clientEmail,
            embedded: embedded,
            suggestedExercises: suggestedExercises
        ) {
            EmptyView()
        }
    }
}

private struct EmbeddedWorkoutHeader: View {
    let workout: Workout

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text(workout.formatLabel.uppercased())
                .font(.footnote.bold())
                .tracking(1.1)
                .foregroundStyle(Color.fwbLime)

            Text(workout.title.fwbTitleCased)
                .font(.title.weight(.black))
                .fontWidth(.condensed)
                .foregroundStyle(Color.fwbWarmWhite)
                .lineLimit(2)
                .minimumScaleFactor(0.72)
                .lineSpacing(-3)

            if !workout.focus.isEmpty {
                HStack(alignment: .top, spacing: 9) {
                    Text("FOCUS")
                        .font(.footnote.bold())
                        .tracking(0.7)
                        .foregroundStyle(Color.black)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .frame(minHeight: 22)
                        .background(Color.fwbAccentFill, in: Rectangle())

                    Text(workout.focus)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Color.fwbWarmWhite)
                        .fixedSize(horizontal: false, vertical: true)

                    Spacer(minLength: 0)
                }
                .padding(10)
                .background(Color.fwbSurface, in: Rectangle())
                .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
            }

            Text(workout.format.lowercased() == "custom"
                 ? "Add exercises from the library, log sets, and save everything from this page."
                 : workout.format.lowercased() == "mobility"
                    ? "Add stretches and foam-rolling movements from the mobility library, then save your session."
                    : "Open each exercise, log your sets, then save or finish the workout below.")
                .font(.footnote)
                .foregroundStyle(Color.fwbMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct WorkoutSessionHeader: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let title: String
    let startedAt: Date

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 14) {
                    titleContent
                    timerContent
                }
            } else {
                HStack(alignment: .top, spacing: 14) {
                    titleContent
                    Spacer(minLength: 10)
                    timerContent
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var titleContent: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("ACTIVE WORKOUT")
                .font(.footnote.bold())
                .tracking(1.2)
                .foregroundStyle(Color.fwbLime)
            Text(title)
                .font(.largeTitle.weight(.black))
                .fontWidth(.condensed)
                .foregroundStyle(Color.fwbWarmWhite)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var timerContent: some View {
        TimelineView(.periodic(from: startedAt, by: 1)) { context in
            VStack(alignment: dynamicTypeSize.isAccessibilitySize ? .leading : .trailing, spacing: 4) {
                Image(systemName: "timer")
                    .foregroundStyle(Color.fwbLime)
                Text(Self.duration(from: startedAt, to: context.date))
                    .font(.system(.headline, design: .monospaced).weight(.bold))
                    .foregroundStyle(Color.fwbWarmWhite)
            }
        }
    }

    private static func duration(from start: Date, to end: Date) -> String {
        let seconds = max(Int(end.timeIntervalSince(start)), 0)
        return String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }
}

private struct GuidedSequenceBanner: View {
    let step: GuidedWorkoutStep

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Rectangle()
                    .fill(Color.fwbAccentFill)
                    .frame(width: 44, height: 44)
                Text("\(step.position)")
                    .font(.headline.weight(.black))
                    .foregroundStyle(Color.black)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("\(step.groupLabel.uppercased()) · ROUND \(step.round)/\(step.roundCount)")
                    .font(.footnote.weight(.black))
                    .tracking(0.8)
                    .foregroundStyle(Color.fwbLime)
                Text(step.exerciseName.fwbTitleCased)
                    .font(.title3.weight(.black))
                    .fontWidth(.condensed)
                    .foregroundStyle(Color.fwbWarmWhite)
                Text("Exercise \(step.position) of \(step.exerciseCount). Move directly to the next exercise; rest after the full round.")
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .overlay { Rectangle().stroke(Color.fwbLime, lineWidth: 2) }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Next, \(step.exerciseName), round \(step.round) of \(step.roundCount), exercise \(step.position) of \(step.exerciseCount)")
        .accessibilityIdentifier("workout.guidedSequence")
    }
}

private struct WorkoutGroupHeader: View {
    let assignment: WorkoutGroupAssignment
    let exerciseCount: Int
    let roundCount: Int
    let restText: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: assignment.kind == .circuit ? "repeat" : "link")
                .font(.headline.weight(.black))
                .foregroundStyle(Color.black)
                .frame(width: 38, height: 38)
                .background(Color.fwbAccentFill, in: Rectangle())

            VStack(alignment: .leading, spacing: 3) {
                Text(assignment.label.uppercased())
                    .font(.headline.weight(.black))
                    .fontWidth(.condensed)
                    .foregroundStyle(Color.fwbWarmWhite)
                Text("\(roundCount) rounds · \(exerciseCount) exercises")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.fwbLime)
                Text("No rest between exercises · Round rest: \(restText)")
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct WorkoutSequenceEditorView: View {
    @Environment(\.dismiss) private var dismiss

    @Binding var exercises: [Exercise]
    @Binding var assignments: [String: WorkoutGroupAssignment]

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Drag exercises into the order you want. Put two or more exercises in the same superset or circuit to turn on guided rounds.")
                        .font(.subheadline)
                        .foregroundStyle(Color.fwbMuted)
                        .listRowBackground(Color.fwbCard)
                }

                Section("WORKOUT ORDER") {
                    ForEach(exercises) { exercise in
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(exercise.name.fwbTitleCased)
                                    .font(.headline.weight(.bold))
                                    .foregroundStyle(Color.fwbWarmWhite)
                                Text(exercise.code.uppercased())
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(Color.fwbMuted)
                            }

                            Spacer(minLength: 8)

                            assignmentMenu(for: exercise)
                        }
                        .frame(minHeight: 54)
                        .listRowBackground(Color.fwbCard)
                        .accessibilityElement(children: .contain)
                    }
                    .onMove { offsets, destination in
                        exercises.move(fromOffsets: offsets, toOffset: destination)
                    }
                }

                Section {
                    Label("Between exercises: no timer", systemImage: "forward.fill")
                    Label("After a full round: use the group rest timer", systemImage: "timer")
                } header: {
                    Text("REST BEHAVIOR")
                }
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color.fwbMuted)
                .listRowBackground(Color.fwbCard)
            }
            .scrollContentBackground(.hidden)
            .background(Color.fwbBackground)
            .environment(\.editMode, .constant(.active))
            .navigationTitle("Sequence & Groups")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.fwbBackground, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        assignments = WorkoutSequencePlanner.normalizedAssignments(
                            exercises: exercises,
                            assignments: assignments
                        )
                        dismiss()
                    }
                    .font(.headline.weight(.bold))
                    .foregroundStyle(Color.fwbLime)
                }
            }
            .onDisappear {
                assignments = WorkoutSequencePlanner.normalizedAssignments(
                    exercises: exercises,
                    assignments: assignments
                )
            }
        }
    }

    private func assignmentMenu(for exercise: Exercise) -> some View {
        Menu {
            Button {
                assignments.removeValue(forKey: exercise.id)
            } label: {
                Label("No Group", systemImage: assignments[exercise.id] == nil ? "checkmark" : "minus")
            }

            Section("SUPERSET") {
                ForEach(WorkoutSequencePlanner.editableGroupIDs, id: \.self) { groupID in
                    Button {
                        assignments[exercise.id] = WorkoutGroupAssignment(
                            id: groupID,
                            kind: .superset,
                            label: "Superset \(groupID)"
                        )
                    } label: {
                        Label(
                            "Superset \(groupID)",
                            systemImage: assignments[exercise.id]?.id == groupID ? "checkmark" : "link"
                        )
                    }
                }
            }

            Section("CIRCUIT") {
                Button {
                    assignments[exercise.id] = WorkoutGroupAssignment(
                        id: "CIRCUIT",
                        kind: .circuit,
                        label: "Circuit"
                    )
                } label: {
                    Label(
                        "Circuit",
                        systemImage: assignments[exercise.id]?.id == "CIRCUIT" ? "checkmark" : "repeat"
                    )
                }
            }
        } label: {
            HStack(spacing: 6) {
                Text(assignments[exercise.id]?.label.uppercased() ?? "NO GROUP")
                    .font(.footnote.weight(.black))
                    .lineLimit(1)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption.bold())
            }
            .foregroundStyle(assignments[exercise.id] == nil ? Color.fwbMuted : Color.fwbLime)
            .padding(.horizontal, 10)
            .frame(minHeight: 38)
            .background(Color.fwbSurface, in: Rectangle())
            .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
        }
        .accessibilityLabel("Group for \(exercise.name)")
        .accessibilityValue(assignments[exercise.id]?.label ?? "No group")
    }
}

private enum WorkoutCopyRequest: Identifiable {
    case lastWorkout
    case previousSet(UUID, Int)

    var id: String {
        switch self {
        case .lastWorkout: "last-workout"
        case .previousSet(let id, _): "previous-set-\(id.uuidString)"
        }
    }
}

private struct WorkoutExerciseLogCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let exercise: Exercise
    @Binding var drafts: [WorkoutSetDraft]
    @FocusState.Binding var focusedField: WorkoutLogFocus?
    let entryStyle: WorkoutEntryStyle
    let preferredEffortScale: WorkoutEffortScale
    let previousSets: [Int: PreviousWorkoutResult]
    let isPreviousHistoryLoading: Bool
    let editableName: Binding<String>?
    let suggestions: [String]
    let substitutedFromName: String?
    let copySource: WorkoutExerciseCopySource?
    let isCopyHistoryLoading: Bool
    let copiedDraftIDs: Set<UUID>
    let guidedRoundText: String?
    let isGuidedCurrent: Bool
    let isSavingProgress: Bool
    let didSaveProgress: Bool
    let saveProgressDisabled: Bool
    let onAddSet: () -> Void
    let onDeleteSet: (UUID) -> Void
    let onCopyLastWorkout: (WorkoutExerciseCopySource) -> Void
    let onCopyPreviousSet: (UUID) -> Void
    let onDraftEdited: (UUID) -> Void
    let onSetCompletionChanged: (WorkoutSetDraft, Bool) -> Void
    let onInsertWarmUps: ([WarmUpSetPlan]) -> Void
    let onSetTypeChanged: (UUID, WorkoutSetType) -> Void
    let onSetLabelChanged: (UUID, String) -> Void
    let onStartRestTimer: () -> Void
    let onSubstituteExercise: () -> Void
    let onRevertSubstitution: () -> Void
    let onDeleteExercise: () -> Void
    let onSaveProgress: () -> Void
    let onSendFormCheck: () -> Void

    @State private var isExpanded: Bool
    @State private var areInstructionsExpanded = false
    @State private var pendingCopyRequest: WorkoutCopyRequest?
    @State private var calculatorRequest: WorkoutCalculatorKind?

    init(
        exercise: Exercise,
        drafts: Binding<[WorkoutSetDraft]>,
        focusedField: FocusState<WorkoutLogFocus?>.Binding,
        entryStyle: WorkoutEntryStyle,
        preferredEffortScale: WorkoutEffortScale,
        previousSets: [Int: PreviousWorkoutResult],
        isPreviousHistoryLoading: Bool,
        editableName: Binding<String>?,
        suggestions: [String],
        substitutedFromName: String?,
        copySource: WorkoutExerciseCopySource?,
        isCopyHistoryLoading: Bool,
        copiedDraftIDs: Set<UUID>,
        initiallyExpanded: Bool,
        guidedRoundText: String?,
        isGuidedCurrent: Bool,
        isSavingProgress: Bool,
        didSaveProgress: Bool,
        saveProgressDisabled: Bool,
        onAddSet: @escaping () -> Void,
        onDeleteSet: @escaping (UUID) -> Void,
        onCopyLastWorkout: @escaping (WorkoutExerciseCopySource) -> Void,
        onCopyPreviousSet: @escaping (UUID) -> Void,
        onDraftEdited: @escaping (UUID) -> Void,
        onSetCompletionChanged: @escaping (WorkoutSetDraft, Bool) -> Void,
        onInsertWarmUps: @escaping ([WarmUpSetPlan]) -> Void,
        onSetTypeChanged: @escaping (UUID, WorkoutSetType) -> Void,
        onSetLabelChanged: @escaping (UUID, String) -> Void,
        onStartRestTimer: @escaping () -> Void,
        onSubstituteExercise: @escaping () -> Void,
        onRevertSubstitution: @escaping () -> Void,
        onDeleteExercise: @escaping () -> Void,
        onSaveProgress: @escaping () -> Void,
        onSendFormCheck: @escaping () -> Void
    ) {
        self.exercise = exercise
        _drafts = drafts
        _focusedField = focusedField
        self.entryStyle = entryStyle
        self.preferredEffortScale = preferredEffortScale
        self.previousSets = previousSets
        self.isPreviousHistoryLoading = isPreviousHistoryLoading
        self.editableName = editableName
        self.suggestions = suggestions
        self.substitutedFromName = substitutedFromName
        self.copySource = copySource
        self.isCopyHistoryLoading = isCopyHistoryLoading
        self.copiedDraftIDs = copiedDraftIDs
        self.guidedRoundText = guidedRoundText
        self.isGuidedCurrent = isGuidedCurrent
        self.isSavingProgress = isSavingProgress
        self.didSaveProgress = didSaveProgress
        self.saveProgressDisabled = saveProgressDisabled
        self.onAddSet = onAddSet
        self.onDeleteSet = onDeleteSet
        self.onCopyLastWorkout = onCopyLastWorkout
        self.onCopyPreviousSet = onCopyPreviousSet
        self.onDraftEdited = onDraftEdited
        self.onSetCompletionChanged = onSetCompletionChanged
        self.onInsertWarmUps = onInsertWarmUps
        self.onSetTypeChanged = onSetTypeChanged
        self.onSetLabelChanged = onSetLabelChanged
        self.onStartRestTimer = onStartRestTimer
        self.onSubstituteExercise = onSubstituteExercise
        self.onRevertSubstitution = onRevertSubstitution
        self.onDeleteExercise = onDeleteExercise
        self.onSaveProgress = onSaveProgress
        self.onSendFormCheck = onSendFormCheck
        _isExpanded = State(initialValue: initiallyExpanded)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 8) {
                Button {
                    withAnimation(.easeOut(duration: 0.18)) {
                        isExpanded.toggle()
                    }
                } label: {
                    HStack(alignment: .top, spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            if !exercise.code.isEmpty {
                                Text(exercise.code.uppercased())
                                    .font(.footnote.bold())
                                    .tracking(0.8)
                                    .foregroundStyle(Color.fwbLime)
                            }
                            Text(exercise.name.isEmpty ? "Exercise" : exercise.name.fwbTitleCased)
                                .font(.title3.weight(.black))
                                .fontWidth(.condensed)
                                .foregroundStyle(Color.fwbWarmWhite)
                                .multilineTextAlignment(.leading)
                            if !exercise.prescription.isEmpty {
                                Text(exercise.prescription)
                                    .font(.footnote)
                                    .foregroundStyle(Color.fwbMuted)
                            }
                            Text("\(completedSetCount) / \(workingDrafts.count) working sets completed")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(Color.fwbLime)
                            if let guidedRoundText {
                                Label(guidedRoundText.uppercased(), systemImage: "location.fill")
                                    .font(.footnote.weight(.black))
                                    .tracking(0.5)
                                    .foregroundStyle(Color.fwbLime)
                                    .padding(.top, 3)
                            }
                        }

                        Spacer()

                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.footnote.bold())
                            .foregroundStyle(Color.fwbMuted)
                            .padding(.top, 8)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(exercise.name), \(isExpanded ? "collapse" : "expand")")

                Menu {
                    Button(action: onSubstituteExercise) {
                        Label("Substitute Exercise", systemImage: "arrow.left.arrow.right")
                    }
                    .accessibilityIdentifier("workout.substituteExercise.\(accessibilityExerciseID)")

                    if substitutedFromName != nil {
                        Button(action: onRevertSubstitution) {
                            Label("Restore Original Exercise", systemImage: "arrow.uturn.backward")
                        }
                        .accessibilityIdentifier("workout.revertSubstitution.\(accessibilityExerciseID)")
                    }

                    Button(role: .destructive, action: onDeleteExercise) {
                        Label("Remove Exercise", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.headline)
                        .foregroundStyle(Color.fwbWarmWhite)
                        .frame(width: 36, height: 36)
                        .background(Color.fwbSurface, in: Rectangle())
                }
                .accessibilityLabel("Exercise options")
                .accessibilityIdentifier("workout.exerciseOptions.\(exercise.id)")
            }

            if let substitutedFromName {
                WorkoutSubstitutionBanner(
                    originalName: substitutedFromName,
                    onRevert: onRevertSubstitution,
                    accessibilityExerciseID: accessibilityExerciseID
                )
            }

            if isExpanded {
                if let editableName {
                    ExerciseNameAutocompleteField(
                        text: editableName,
                        suggestions: suggestions,
                        accessibilityIdentifier: "customWorkout.exercise.\(exercise.code)"
                    )
                }

                ExerciseDemoLink(exercise: exercise)

                ExerciseInstructionsDisclosure(
                    exercise: exercise,
                    isExpanded: $areInstructionsExpanded
                )

                copyLastWorkoutControl

                if entryStyle == .strength && exercise.supportsBarbellCalculators {
                    calculatorTools
                }

                Button(action: onSendFormCheck) {
                    Label("SEND FORM CHECK", systemImage: "video.badge.plus")
                }
                .buttonStyle(FWBSecondaryButtonStyle())
                .accessibilityHint("Choose a private photo or short video for your coach to review")
                .accessibilityIdentifier("formCheck.open.\(accessibilityExerciseID)")

                let matchingDrafts = exerciseDrafts
                VStack(spacing: 6) {
                    HStack(spacing: 4) {
                        TableHeading(text: "SET", width: 42)
                        TableHeading(text: entryStyle.firstHeading, width: nil)
                        TableHeading(text: entryStyle.secondHeading, width: 66)
                        TableHeading(text: "RIR", width: 48)
                        TableHeading(text: "REST", width: 44)
                    }

                    ForEach(matchingDrafts) { draft in
                        WorkoutSetLogRow(
                            draft: binding(for: draft),
                            focusedField: $focusedField,
                            entryStyle: entryStyle,
                            preferredEffortScale: preferredEffortScale,
                            previousResult: previousSets[draft.setNumber],
                            isPreviousHistoryLoading: isPreviousHistoryLoading,
                            canCopyPreviousSet: previousDraft(for: draft)?.containsEntry == true,
                            wasCopied: copiedDraftIDs.contains(draft.id),
                            onCompletionChanged: { isCompleted in
                                onSetCompletionChanged(draft, isCompleted)
                            },
                            onSetTypeChanged: { setType in
                                onSetTypeChanged(draft.id, setType)
                            },
                            onSetLabelChanged: { label in
                                onSetLabelChanged(draft.id, label)
                            },
                            onStartRestTimer: onStartRestTimer,
                            onCopyPreviousSet: { requestCopyPreviousSet(draft) },
                            onDelete: { onDeleteSet(draft.id) }
                        )
                    }
                }

                if matchingDrafts.isEmpty {
                    Text("No sets yet. Add one when you’re ready.")
                        .font(.footnote)
                        .foregroundStyle(Color.fwbMuted)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 14)
                }

                Button(action: onAddSet) {
                    Label("Add Set", systemImage: "plus")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(Color.fwbLime)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("workout.addSet.\(exercise.id)")

                FWBRule()

                LazyVGrid(columns: metricColumns, spacing: 12) {
                    if entryStyle == .mobility {
                        LoggerMetric(title: "TIME", value: formatted(totalTime), suffix: "sec")
                        LoggerMetric(title: "ROUNDS", value: formatted(totalReps), suffix: "")
                        LoggerMetric(title: "AVG TIME", value: formatted(averageWeight), suffix: "sec")
                    } else {
                        LoggerMetric(title: "VOLUME", value: formatted(volume), suffix: "lb")
                        LoggerMetric(title: "REPS", value: formatted(totalReps), suffix: "")
                        LoggerMetric(title: "AVG WEIGHT", value: formatted(averageWeight), suffix: "lb")
                        if totalTimedSeconds > 0 {
                            LoggerMetric(title: "TIMED WORK", value: formatted(totalTimedSeconds), suffix: "sec")
                        }
                    }
                }

                Button(action: onSaveProgress) {
                    HStack(spacing: 10) {
                        if isSavingProgress {
                            ProgressView()
                                .tint(Color.fwbLime)
                        } else {
                            Image(systemName: didSaveProgress ? "checkmark.circle.fill" : "tray.and.arrow.down")
                        }
                        Text(
                            isSavingProgress
                                ? "SAVING PROGRESS…"
                                : didSaveProgress
                                    ? "PROGRESS SAVED"
                                    : "SAVE PROGRESS"
                        )
                    }
                }
                .buttonStyle(FWBSecondaryButtonStyle())
                .disabled(saveProgressDisabled || !hasExerciseEntry)
                .accessibilityIdentifier("workout.saveProgress.\(exercise.id)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .overlay {
            if isGuidedCurrent {
                Rectangle().stroke(Color.fwbLime, lineWidth: 2)
            }
        }
        .onChange(of: isGuidedCurrent) { isCurrent in
            guard isCurrent else { return }
            withAnimation(.easeOut(duration: 0.18)) {
                isExpanded = true
            }
        }
        .confirmationDialog(
            copyDialogTitle,
            isPresented: Binding(
                get: { pendingCopyRequest != nil },
                set: { if !$0 { pendingCopyRequest = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(copyDialogActionTitle) { performPendingCopy() }
            Button("Cancel", role: .cancel) { pendingCopyRequest = nil }
        } message: {
            Text(copyDialogMessage)
        }
        .sheet(item: $calculatorRequest) { kind in
            WorkoutCalculatorSheet(
                kind: kind,
                exerciseName: exercise.name,
                suggestedWorkingWeight: suggestedWorkingWeight,
                onInsertWarmUps: onInsertWarmUps
            )
        }
    }

    private var copyLastWorkoutControl: some View {
        Button { requestCopyLastWorkout() } label: {
            HStack(spacing: 12) {
                Image(systemName: "rectangle.on.rectangle")
                    .font(.subheadline.weight(.black))
                    .foregroundStyle(copySource == nil ? Color.fwbMuted : .black)
                    .frame(width: 34, height: 34)
                    .background(copySource == nil ? Color.fwbCard : Color.fwbAccentFill, in: Rectangle())

                VStack(alignment: .leading, spacing: 2) {
                    Text("COPY LAST WORKOUT")
                        .font(.footnote.weight(.black))
                        .tracking(0.7)
                        .foregroundStyle(copySource == nil ? Color.fwbMuted : Color.fwbWarmWhite)
                    Text(copySourceDetail)
                        .font(.caption)
                        .foregroundStyle(Color.fwbMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 4)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.black))
                    .foregroundStyle(copySource == nil ? Color.fwbMuted : Color.fwbLime)
            }
            .padding(10)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(copySource == nil)
        .background(Color.fwbSurface, in: Rectangle())
        .overlay { Rectangle().stroke(copySource == nil ? Color.fwbLine : Color.fwbLime, lineWidth: 1) }
        .accessibilityHint(copySource == nil ? copySourceDetail : "Copies saved values into editable, incomplete sets")
        .accessibilityIdentifier("workout.copyLastWorkout.\(accessibilityExerciseID)")
    }

    private var copySourceDetail: String {
        if isCopyHistoryLoading { return "Checking saved workout history…" }
        guard let copySource else { return "No earlier saved result for this exercise" }
        let count = copySource.records.count
        let setLabel = count == 1 ? "1 SET" : "\(count) SETS"
        return "FROM \(Self.copySourceDate(copySource.entryDate).uppercased()) · \(setLabel)"
    }

    private var copyDialogTitle: String {
        switch pendingCopyRequest {
        case .lastWorkout: "Replace entered set values?"
        case .previousSet(_, let setNumber): "Replace Set \(setNumber)?"
        case nil: "Copy values?"
        }
    }

    private var copyDialogActionTitle: String {
        switch pendingCopyRequest {
        case .lastWorkout: "Copy Last Workout"
        case .previousSet: "Copy Previous Set"
        case nil: "Copy"
        }
    }

    private var copyDialogMessage: String {
        switch pendingCopyRequest {
        case .lastWorkout:
            "Saved set type, load, reps, time, effort, and notes replace matching entered sets. Copied sets stay editable and incomplete."
        case .previousSet(_, let setNumber):
            "Set \(setNumber) will use the previous set’s values and remain editable and incomplete."
        case nil:
            "Copied values remain editable."
        }
    }

    private func requestCopyLastWorkout() {
        guard let copySource else { return }
        if exerciseDrafts.contains(where: \.containsEntry) {
            pendingCopyRequest = .lastWorkout
        } else {
            onCopyLastWorkout(copySource)
        }
    }

    private func requestCopyPreviousSet(_ draft: WorkoutSetDraft) {
        guard previousDraft(for: draft)?.containsEntry == true else { return }
        if draft.containsEntry {
            pendingCopyRequest = .previousSet(draft.id, draft.setNumber)
        } else {
            onCopyPreviousSet(draft.id)
        }
    }

    private func performPendingCopy() {
        defer { pendingCopyRequest = nil }
        switch pendingCopyRequest {
        case .lastWorkout:
            if let copySource { onCopyLastWorkout(copySource) }
        case .previousSet(let id, _):
            onCopyPreviousSet(id)
        case nil:
            break
        }
    }

    private func previousDraft(for draft: WorkoutSetDraft) -> WorkoutSetDraft? {
        guard let offset = exerciseDrafts.firstIndex(where: { $0.id == draft.id }), offset > 0 else { return nil }
        return exerciseDrafts[offset - 1]
    }

    private static func copySourceDate(_ entryDate: String) -> String {
        let parser = DateFormatter()
        parser.calendar = Calendar(identifier: .gregorian)
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: entryDate) else { return entryDate }
        let formatter = DateFormatter()
        formatter.setLocalizedDateFormatFromTemplate("MMM d")
        return formatter.string(from: date)
    }

    @ViewBuilder
    private var calculatorTools: some View {
        let buttons = Group {
            Button {
                calculatorRequest = .plates
            } label: {
                Label("PLATES", systemImage: "circle.grid.cross")
            }
            .buttonStyle(FWBSecondaryButtonStyle())
            .accessibilityLabel("Open plate calculator for \(exercise.name)")
            .accessibilityIdentifier("workout.plateCalculator.\(accessibilityExerciseID)")

            Button {
                calculatorRequest = .warmUp
            } label: {
                Label("WARM-UP", systemImage: "flame")
            }
            .buttonStyle(FWBSecondaryButtonStyle())
            .accessibilityLabel("Generate warm-up sets for \(exercise.name)")
            .accessibilityIdentifier("workout.warmUpCalculator.\(accessibilityExerciseID)")
        }

        if dynamicTypeSize.isAccessibilitySize {
            VStack(spacing: 10) { buttons }
        } else {
            HStack(spacing: 10) { buttons }
        }
    }

    private var exerciseDrafts: [WorkoutSetDraft] {
        drafts
            .filter { $0.exerciseCode == exercise.code && $0.exerciseName == exercise.name }
            .sorted { left, right in
                if left.isWarmUp != right.isWarmUp { return left.isWarmUp }
                if left.isWarmUp { return left.setNumber < right.setNumber }
                return left.setNumber < right.setNumber
            }
    }

    private var workingDrafts: [WorkoutSetDraft] {
        exerciseDrafts.filter { !$0.isWarmUp }
    }

    private var suggestedWorkingWeight: Double {
        workingDrafts.map(\.weightValue).filter { $0 > 0 }.max() ?? 0
    }

    private var metricColumns: [GridItem] {
        Array(
            repeating: GridItem(.flexible(), spacing: 12),
            count: dynamicTypeSize.isAccessibilitySize ? 1 : 3
        )
    }

    private var accessibilityExerciseID: String {
        let source = exercise.code.isEmpty ? exercise.name : exercise.code
        return source
            .lowercased()
            .replacingOccurrences(of: " ", with: "-")
    }

    private var volume: Double {
        workingDrafts.reduce(0) { $0 + $1.volume }
    }

    private var totalTime: Double {
        workingDrafts.reduce(0) { $0 + $1.weightValue }
    }

    private var totalTimedSeconds: Double {
        exerciseDrafts
            .filter { $0.setType == .timed }
            .reduce(0) { $0 + $1.durationValue }
    }

    private var completedSetCount: Int {
        workingDrafts.filter(\.isCompleted).count
    }

    private var hasExerciseEntry: Bool {
        exerciseDrafts.contains(where: \.containsEntry)
    }

    private var totalReps: Double {
        workingDrafts
            .filter { entryStyle == .mobility || $0.setType.countsTowardWorkingMetrics }
            .reduce(0) { $0 + $1.repsValue }
    }

    private var averageWeight: Double {
        let weightedSets = workingDrafts.filter {
            $0.weightValue > 0 && (entryStyle == .mobility || $0.setType.countsTowardWorkingMetrics)
        }
        guard !weightedSets.isEmpty else { return 0 }
        return weightedSets.reduce(0) { $0 + $1.weightValue } / Double(weightedSets.count)
    }

    private func formatted(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

    private func binding(for snapshot: WorkoutSetDraft) -> Binding<WorkoutSetDraft> {
        Binding(
            get: { drafts.first(where: { $0.id == snapshot.id }) ?? snapshot },
            set: { updated in
                guard let index = drafts.firstIndex(where: { $0.id == snapshot.id }) else { return }
                if drafts[index] != updated { onDraftEdited(snapshot.id) }
                drafts[index] = updated
            }
        )
    }
}

private struct ExerciseInstructionsDisclosure: View {
    let exercise: Exercise
    @Binding var isExpanded: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.easeOut(duration: 0.18)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "figure.strengthtraining.traditional")
                        .font(.subheadline.weight(.bold))
                    Text("EXERCISE INSTRUCTIONS")
                        .font(.footnote.weight(.black))
                        .tracking(0.7)
                    Spacer()
                    Image(systemName: isExpanded ? "minus" : "plus")
                        .font(.footnote.weight(.black))
                }
                .foregroundStyle(Color.fwbLime)
                .padding(12)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(exercise.name) instructions, \(isExpanded ? "collapse" : "expand")")
            .accessibilityIdentifier("exercise.instructions.\(exercise.id)")

            if isExpanded {
                FWBRule(color: Color.fwbLine.opacity(0.7))

                VStack(alignment: .leading, spacing: 12) {
                    ForEach(Array(exercise.instructionSteps.prefix(5).enumerated()), id: \.offset) { index, step in
                        HStack(alignment: .top, spacing: 10) {
                            Text("\(index + 1)")
                                .font(.footnote.weight(.black))
                                .foregroundStyle(.black)
                                .frame(width: 22, height: 22)
                                .background(Color.fwbAccentFill, in: Rectangle())

                            Text(step)
                                .font(.footnote)
                                .foregroundStyle(Color.fwbWarmWhite)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }

                    if !exercise.rest.isEmpty {
                        Label("Rest: \(exercise.rest)", systemImage: "timer")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Color.fwbMuted)
                    }
                }
                .padding(12)
            }
        }
        .background(Color.fwbSurface, in: Rectangle())
        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
    }
}

private struct WorkoutSubstitutionBanner: View {
    let originalName: String
    let onRevert: () -> Void
    let accessibilityExerciseID: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "arrow.left.arrow.right")
                .font(.subheadline.weight(.black))
                .foregroundStyle(.black)
                .frame(width: 34, height: 34)
                .background(Color.fwbAccentFill, in: Rectangle())

            VStack(alignment: .leading, spacing: 2) {
                Text("SUBSTITUTED")
                    .font(.footnote.weight(.black))
                    .tracking(0.9)
                    .foregroundStyle(Color.fwbLime)
                Text("In place of \(originalName)")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.fwbWarmWhite)
                    .lineLimit(2)
            }

            Spacer(minLength: 4)

            Button("RESTORE", action: onRevert)
                .font(.footnote.weight(.black))
                .tracking(0.6)
                .foregroundStyle(Color.fwbLime)
                .padding(.horizontal, 10)
                .frame(minHeight: 34)
                .overlay { Rectangle().stroke(Color.fwbLime, lineWidth: 1) }
                .accessibilityLabel("Restore \(originalName)")
                .accessibilityIdentifier("workout.revertSubstitution.\(accessibilityExerciseID).banner")
        }
        .padding(12)
        .background(Color.fwbSurface, in: Rectangle())
        .overlay { Rectangle().stroke(Color.fwbLime.opacity(0.75), lineWidth: 1) }
        .accessibilityIdentifier("workout.substitutionBadge.\(accessibilityExerciseID)")
    }
}

private struct TableHeading: View {
    let text: String
    let width: CGFloat?

    var body: some View {
        Text(text)
            .font(.footnote.bold())
            .tracking(0.7)
            .foregroundStyle(Color.fwbMuted)
            .lineLimit(1)
            .minimumScaleFactor(0.65)
            .frame(maxWidth: width == nil ? .infinity : nil)
            .frame(width: width, alignment: .center)
    }
}

private struct WorkoutSetLogRow: View {
    @Binding var draft: WorkoutSetDraft
    @FocusState.Binding var focusedField: WorkoutLogFocus?
    let entryStyle: WorkoutEntryStyle
    let preferredEffortScale: WorkoutEffortScale
    let previousResult: PreviousWorkoutResult?
    let isPreviousHistoryLoading: Bool
    let canCopyPreviousSet: Bool
    let wasCopied: Bool
    let onCompletionChanged: (Bool) -> Void
    let onSetTypeChanged: (WorkoutSetType) -> Void
    let onSetLabelChanged: (String) -> Void
    let onStartRestTimer: () -> Void
    let onCopyPreviousSet: () -> Void
    let onDelete: () -> Void
    @State private var rirRequest: WorkoutRIRRequest?

    var body: some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                EditableSetLabelField(
                    draft: $draft,
                    focus: $focusedField,
                    onCommit: onSetLabelChanged
                )
                .frame(width: 42)

                if entryStyle == .strength && draft.setType == .timed {
                    NumericLogField(
                        placeholder: "0",
                        suffix: "sec",
                        text: $draft.duration,
                        focus: $focusedField,
                        focusValue: .duration(draft.id)
                    )
                } else {
                    NumericLogField(
                        placeholder: "0",
                        suffix: entryStyle.firstSuffix,
                        text: $draft.weight,
                        focus: $focusedField,
                        focusValue: .weight(draft.id)
                    )
                }

                if entryStyle == .strength && draft.setType == .timed {
                    NumericLogField(
                        placeholder: "0",
                        suffix: "lb",
                        text: $draft.weight,
                        focus: $focusedField,
                        focusValue: .weight(draft.id)
                    )
                    .frame(width: 66)
                } else {
                    NumericLogField(
                        placeholder: "0",
                        suffix: entryStyle.secondSuffix,
                        text: $draft.reps,
                        focus: $focusedField,
                        focusValue: .reps(draft.id)
                    )
                    .frame(width: 66)
                }

                Button {
                    focusedField = nil
                    rirRequest = WorkoutRIRRequest(id: draft.id)
                } label: {
                    VStack(spacing: 1) {
                        Text("RIR")
                            .font(.caption2.weight(.black))
                            .foregroundStyle(Color.fwbMuted)
                        Text(rirDisplayValue)
                            .font(.subheadline.weight(.black))
                            .foregroundStyle(Color.fwbWarmWhite)
                    }
                    .frame(width: 48, height: 48)
                    .background(Color.fwbCard, in: Rectangle())
                    .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Choose reps in reserve for \(setAccessibilityName.lowercased())")
                .accessibilityValue(draft.effortScale == .rir && !draft.effort.isEmpty ? rirDisplayValue : "Not selected")
                .accessibilityHint(WorkoutEffortScale.rir.explanation)
                .accessibilityIdentifier("workout.rir.\(draft.id)")

                Button(action: onStartRestTimer) {
                    Image(systemName: "clock")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(Color.fwbWarmWhite)
                        .frame(width: 44, height: 48)
                        .background(Color.fwbCard, in: Rectangle())
                        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Start rest timer after \(setAccessibilityName.lowercased())")
                .accessibilityIdentifier("workout.rest.\(draft.id)")
            }

            if previousResult != nil || isPreviousHistoryLoading {
                PreviousSetResultView(
                    result: previousResult,
                    entryStyle: entryStyle,
                    isLoading: isPreviousHistoryLoading
                )
            }

            HStack(spacing: 4) {
                setNoteField

                Menu {
                    Button(action: onCopyPreviousSet) {
                        Label("Copy Previous Set", systemImage: "rectangle.on.rectangle")
                    }
                    .disabled(!canCopyPreviousSet)

                    Button(role: .destructive, action: onDelete) {
                        Label("Delete Set", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.subheadline.bold())
                        .foregroundStyle(Color.fwbWarmWhite)
                        .frame(width: 40, height: 38)
                        .background(Color.fwbSurface, in: Rectangle())
                        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                }
                .accessibilityLabel("\(setAccessibilityName) options")
            }

            if let message = draft.effortValidationMessage {
                Label(message, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.fwbRed)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.fwbSurface)
                    .accessibilityIdentifier("workout.effortError.\(draft.id)")
            }

            if wasCopied {
                Label("COPIED · TAP ANY FIELD TO EDIT", systemImage: "pencil")
                    .font(.caption2.weight(.black))
                    .tracking(0.5)
                    .foregroundStyle(Color.fwbLime)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.fwbLime.opacity(0.08))
                    .accessibilityLabel("Copied values. All fields are editable.")
                    .accessibilityIdentifier("workout.copiedSet.\(draft.id)")
            }
        }
        .overlay {
            Rectangle().stroke(wasCopied ? Color.fwbLime : Color.fwbLine, lineWidth: wasCopied ? 2 : 1)
        }
        .sheet(item: $rirRequest) { _ in
            WorkoutRIRSelectionSheet(draft: $draft)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private var setNoteField: some View {
        TextField("Note", text: $draft.notes)
            .accessibilityLabel("Set note")
            .font(.footnote)
            .foregroundStyle(Color.fwbWarmWhite)
            .focused($focusedField, equals: .note(draft.id))
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 38)
            .background(Color.fwbSurface)
    }

    private var rirDisplayValue: String {
        guard draft.effortScale == .rir,
              let value = Double(draft.effort.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            return "—"
        }
        return value >= 4 ? "4+" : WorkoutEffortScale.rir.formatted(value)
    }

    private var setAccessibilityName: String {
        draft.isWarmUp ? "Warm-up set \(draft.warmUpOrdinal ?? 1)" : "Set \(draft.setNumber)"
    }

}

private struct WorkoutRIRRequest: Identifiable {
    let id: UUID
}

private struct EditableSetLabelField: View {
    @Binding var draft: WorkoutSetDraft
    @FocusState.Binding var focus: WorkoutLogFocus?
    let onCommit: (String) -> Void
    @State private var label: String

    init(
        draft: Binding<WorkoutSetDraft>,
        focus: FocusState<WorkoutLogFocus?>.Binding,
        onCommit: @escaping (String) -> Void
    ) {
        _draft = draft
        _focus = focus
        self.onCommit = onCommit
        _label = State(initialValue: Self.displayLabel(for: draft.wrappedValue))
    }

    var body: some View {
        TextField("SET", text: $label)
            .textInputAutocapitalization(.characters)
            .autocorrectionDisabled()
            .multilineTextAlignment(.center)
            .font(.subheadline.weight(.black))
            .foregroundStyle(Color.fwbWarmWhite)
            .focused($focus, equals: .set(draft.id))
            .frame(height: 48)
            .background(Color.fwbCard, in: Rectangle())
            .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
            .submitLabel(.done)
            .onSubmit(commit)
            .onChange(of: label) { nextValue in
                let sanitized = Self.sanitized(nextValue)
                if sanitized != nextValue {
                    label = sanitized
                }
            }
            .onChange(of: focus) { nextFocus in
                if nextFocus != .set(draft.id) {
                    commit()
                }
            }
            .onChange(of: draft.setNumber) { _ in
                guard focus != .set(draft.id) else { return }
                label = Self.displayLabel(for: draft)
            }
            .accessibilityLabel("Set label")
            .accessibilityHint("Enter W for warm-up or a number for a working set")
            .accessibilityIdentifier("workout.setLabel.\(draft.id)")
    }

    private func commit() {
        guard !label.isEmpty else {
            label = Self.displayLabel(for: draft)
            return
        }
        onCommit(label)
    }

    private static func displayLabel(for draft: WorkoutSetDraft) -> String {
        guard draft.isWarmUp else { return String(draft.setNumber) }
        let ordinal = draft.warmUpOrdinal ?? 1
        return ordinal > 1 ? "W\(ordinal)" : "W"
    }

    private static func sanitized(_ value: String) -> String {
        let normalized = value.uppercased()
        if normalized.contains("W") {
            return "W" + String(normalized.filter(\.isNumber).prefix(2))
        }
        return String(normalized.filter(\.isNumber).prefix(2))
    }
}

private struct WorkoutRIRSelectionSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var draft: WorkoutSetDraft
    @State private var selection: Int?

    init(draft: Binding<WorkoutSetDraft>) {
        _draft = draft
        let value = draft.wrappedValue.effortScale == .rir
            ? Int(Double(draft.wrappedValue.effort) ?? -1)
            : nil
        _selection = State(initialValue: value.map { min(max($0, 0), 4) })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("SET EFFORT")
                        .font(.footnote.weight(.black))
                        .tracking(1)
                        .foregroundStyle(Color.fwbLime)
                    Text("HOW MANY MORE REPS?")
                        .font(.title.weight(.black))
                        .fontWidth(.condensed)
                        .foregroundStyle(Color.fwbWarmWhite)
                }
                Spacer(minLength: 8)
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.headline.weight(.bold))
                        .frame(width: 40, height: 40)
                        .background(Color.fwbSurface, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close RIR choices")
            }

            Text("If you kept going, how many more good-form reps could you have completed?")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: 6) {
                ForEach(Self.options, id: \.value) { option in
                    Button {
                        selection = option.value
                    } label: {
                        HStack(spacing: 14) {
                            Text(option.value == 4 ? "4+" : String(option.value))
                                .font(.title3.weight(.black))
                                .frame(width: 34, alignment: .leading)
                            Text(option.label)
                                .font(.subheadline.weight(.bold))
                            Spacer()
                            if selection == option.value {
                                Image(systemName: "checkmark")
                                    .font(.headline.weight(.black))
                            }
                        }
                        .foregroundStyle(selection == option.value ? Color.black : Color.fwbWarmWhite)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 48)
                        .background(selection == option.value ? Color.fwbAccentFill : Color.fwbSurface, in: Rectangle())
                        .overlay { Rectangle().stroke(selection == option.value ? Color.fwbLime : Color.fwbLine, lineWidth: 1) }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(option.value == 4 ? "Four or more" : option.label) reps in reserve")
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("RIR MEANS REPS IN RESERVE")
                    .font(.footnote.weight(.black))
                    .tracking(0.5)
                    .foregroundStyle(Color.fwbLime)
                Text("It estimates how many additional reps you could have completed with good form.")
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.fwbSurface, in: Rectangle())
            .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }

            Button("SAVE RIR") {
                guard let selection else { return }
                draft.effortScale = .rir
                draft.effort = String(selection)
                dismiss()
            }
            .buttonStyle(FWBPrimaryButtonStyle())
            .disabled(selection == nil)
            .accessibilityIdentifier("workout.rir.save")
        }
        .padding(20)
        .background(Color.fwbBackground.ignoresSafeArea())
    }

    private static let options: [(value: Int, label: String)] = [
        (0, "None"),
        (1, "One more"),
        (2, "Two more"),
        (3, "Three more"),
        (4, "Four or more")
    ]
}

private struct WorkoutEffortLogField: View {
    @Binding var draft: WorkoutSetDraft
    let preferredScale: WorkoutEffortScale
    @FocusState.Binding var focus: WorkoutLogFocus?

    private var displayedScale: WorkoutEffortScale {
        draft.effortScale ?? preferredScale
    }

    var body: some View {
        HStack(spacing: 6) {
            Text(displayedScale.title)
                .font(.caption.weight(.black))
                .tracking(0.4)
                .foregroundStyle(Color.fwbLime)

            TextField(displayedScale.rangeLabel, text: $draft.effort)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.fwbWarmWhite)
                .focused($focus, equals: .effort(draft.id))
                .accessibilityLabel("Set \(draft.setNumber) \(displayedScale.title)")
                .accessibilityHint(displayedScale.explanation)
                .accessibilityIdentifier("workout.effort.\(draft.id)")
        }
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity)
        .frame(minHeight: 42)
        .background(Color.fwbSurface)
        .onChange(of: draft.effort) { nextValue in
            let sanitized = sanitizedNumber(nextValue)
            if sanitized != nextValue {
                draft.effort = sanitized
            }

            if sanitized.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                draft.effortScale = nil
            } else if draft.effortScale == nil {
                draft.effortScale = preferredScale
            }
        }
    }

    private func sanitizedNumber(_ value: String) -> String {
        var result = ""
        var hasDecimalSeparator = false

        for character in value.replacingOccurrences(of: ",", with: ".") {
            if character.isNumber {
                result.append(character)
            } else if character == ".", !hasDecimalSeparator {
                hasDecimalSeparator = true
                result.append(character)
            }
        }

        return String(result.prefix(5))
    }
}

private struct PreviousSetContext: View {
    let record: WorkoutHistoryRecord

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 7) {
            Text("LAST")
                .font(.caption2.weight(.black))
                .tracking(0.7)
                .foregroundStyle(Color.fwbLime)
            Text(summary)
                .font(.caption.weight(.semibold))
                .foregroundStyle(Color.fwbMuted)
                .lineLimit(2)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.fwbCard)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Previous set: \(summary)")
    }

    private var summary: String {
        var parts: [String] = []
        if record.weightUsed > 0 {
            parts.append("\(WorkoutEffortDisplay.number(record.weightUsed)) lb")
        }
        if let reps = record.reps, reps > 0 {
            parts.append("\(WorkoutEffortDisplay.number(reps)) reps")
        }
        if let effortLabel = record.effortLabel {
            parts.append(effortLabel)
        }
        return parts.isEmpty ? "No weight or reps recorded" : parts.joined(separator: " · ")
    }
}

private enum WorkoutEffortDisplay {
    static func number(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%g", value)
    }
}

private struct PreviousSetResultView: View {
    let result: PreviousWorkoutResult?
    let entryStyle: WorkoutEntryStyle
    let isLoading: Bool

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 7) {
                label
                value
                Spacer(minLength: 4)
                if let result {
                    Text(Self.date(result.entryDate))
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Color.fwbMuted)
                }
            }

            VStack(alignment: .leading, spacing: 3) {
                label
                value
                if let result {
                    Text(Self.date(result.entryDate))
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Color.fwbMuted)
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.fwbSurface.opacity(0.72))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private var label: some View {
        Text("PREVIOUS")
            .font(.caption2.weight(.black))
            .tracking(0.7)
            .foregroundStyle(Color.fwbLime)
            .lineLimit(1)
    }

    private var value: some View {
        Text(valueText)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(result == nil ? Color.fwbMuted : Color.fwbWarmWhite)
            .lineLimit(1)
    }

    private var valueText: String {
        guard let result else {
            return isLoading ? "Checking history…" : "No previous set"
        }

        let first = Self.number(result.firstValue)
        let second = result.secondValue.map(Self.number) ?? "—"
        switch entryStyle {
        case .strength:
            if result.firstValue <= 0 {
                return "Bodyweight × \(second) reps"
            }
            return "\(first) lb × \(second) reps"
        case .mobility:
            return "\(result.firstValue > 0 ? first : "—") sec × \(second) rounds"
        }
    }

    private var accessibilityText: String {
        guard let result else {
            return isLoading ? "Checking previous workout history" : "No previous result for this set"
        }
        return "Previous result, \(valueText), \(Self.date(result.entryDate))"
    }

    private static func number(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

    private static func date(_ value: String) -> String {
        guard let date = databaseDate.date(from: value) else { return value }
        return date.formatted(.dateTime.month(.abbreviated).day())
    }

    private static let databaseDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}

private struct SetTypeMenu: View {
    let selection: WorkoutSetType
    let setID: UUID
    let setNumber: Int
    let onSelect: (WorkoutSetType) -> Void
    let onSelectTimed: () -> Void

    var body: some View {
        Menu {
            ForEach(WorkoutSetType.allCases, id: \.self) { setType in
                Button {
                    onSelect(setType)
                    if setType == .timed {
                        onSelectTimed()
                    }
                } label: {
                    if selection == setType {
                        Label(setType.title, systemImage: "checkmark")
                    } else {
                        Label(setType.title, systemImage: setType.systemImage)
                    }
                }
            }
        } label: {
            HStack(spacing: 5) {
                Image(systemName: selection.systemImage)
                    .font(.caption2.weight(.black))
                Text(selection.compactTitle)
                    .font(.caption2.weight(.black))
                    .tracking(0.35)
            }
            .foregroundStyle(typeColor)
            .frame(width: 76)
            .frame(minHeight: 44)
            .background(typeColor.opacity(selection == .working ? 0.04 : 0.12))
        }
        .accessibilityLabel("Set \(setNumber) type")
        .accessibilityValue(selection.title)
        .accessibilityHint("Choose Warm-up, Working, Drop, Failure, or Timed")
        .accessibilityIdentifier("workout.setType.\(setID.uuidString)")
    }

    private var typeColor: Color {
        switch selection {
        case .working: return .fwbMuted
        case .warmUp: return .orange
        case .drop: return .cyan
        case .failure: return .red
        case .timed: return .purple
        }
    }

}

private struct NumericLogField: View {
    let placeholder: String
    let suffix: String
    @Binding var text: String
    @FocusState.Binding var focus: WorkoutLogFocus?
    let focusValue: WorkoutLogFocus

    var body: some View {
        TextField(placeholder, text: $text)
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.center)
            .font(.headline.weight(.bold))
            .foregroundStyle(Color.fwbWarmWhite)
            .focused($focus, equals: focusValue)
            .padding(.horizontal, 5)
        .frame(maxWidth: .infinity)
        .frame(minHeight: 48)
        .background(Color.fwbCard)
        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
        .accessibilityHint(suffix)
    }
}

private struct LoggerMetric: View {
    let title: String
    let value: String
    let suffix: String

    var body: some View {
        VStack(spacing: 3) {
            Text(title)
                .font(.footnote.bold())
                .tracking(0.5)
                .foregroundStyle(Color.fwbMuted)
            Text(suffix.isEmpty ? value : "\(value) \(suffix)")
                .font(.footnote.weight(.black))
                .fontWidth(.condensed)
                .foregroundStyle(Color.fwbWarmWhite)
                .lineLimit(1)
                .minimumScaleFactor(0.95)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct WorkoutSessionSummary: View {
    let entryStyle: WorkoutEntryStyle
    let exerciseCount: Int
    let completedSets: Int
    let totalSets: Int
    let totalReps: Double
    let totalVolume: Double
    let totalTimedSeconds: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("WORKOUT SUMMARY")
                        .font(.footnote.bold())
                        .tracking(1)
                        .foregroundStyle(Color.fwbLime)
                    Text("Keep the session moving.")
                        .font(.title3.weight(.black))
                        .fontWidth(.condensed)
                }
                Spacer()
                Image(systemName: "figure.strengthtraining.traditional")
                    .font(.title2)
                    .foregroundStyle(Color.fwbLime)
            }

            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: 10),
                    GridItem(.flexible(), spacing: 10)
                ],
                spacing: 10
            ) {
                SummaryBlock(title: "EXERCISES", value: "\(exerciseCount)")
                SummaryBlock(title: "SETS", value: "\(completedSets)/\(totalSets)")
                SummaryBlock(title: entryStyle == .mobility ? "ROUNDS" : "REPS", value: format(totalReps))
                SummaryBlock(
                    title: entryStyle == .mobility ? "TIME" : "VOLUME",
                    value: entryStyle == .mobility ? "\(format(totalVolume)) sec" : "\(format(totalVolume)) lb"
                )
                if entryStyle == .strength, totalTimedSeconds > 0 {
                    SummaryBlock(title: "TIMED WORK", value: "\(format(totalTimedSeconds)) sec")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }

    private func format(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }
}

private struct SummaryBlock: View {
    let title: String
    let value: String

    var body: some View {
        VStack(spacing: 4) {
            Text(title)
                .font(.footnote.bold())
                .tracking(0.4)
                .foregroundStyle(Color.fwbMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            Text(value)
                .font(.footnote.weight(.black))
                .fontWidth(.condensed)
                .foregroundStyle(Color.fwbWarmWhite)
                .lineLimit(1)
                .minimumScaleFactor(0.95)
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, minHeight: 62)
        .background(Color.fwbSurface, in: Rectangle())
        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
    }
}

private struct LoggerEmptyState: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "plus.square.dashed")
                .font(.largeTitle)
                .foregroundStyle(Color.fwbLime)
            Text("Add your first exercise")
                .font(.headline.weight(.black))
            Text("Build this workout as you go.")
                .font(.footnote)
                .foregroundStyle(Color.fwbMuted)
        }
        .frame(maxWidth: .infinity)
        .fwbCard()
    }
}

private struct ExercisePickerSheet: View {
    @Environment(\.dismiss) private var dismiss

    let request: ExerciseEditorRequest
    let suggestions: [String]
    let onSave: (String) -> Void

    @State private var exerciseName = ""
    @State private var selectedCategory = "All"

    private let categoryColumns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8)
    ]

    private var trimmedExerciseName: String {
        exerciseName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var currentExerciseName: String? {
        guard case .substitute(let exercise) = request.mode else { return nil }
        return exercise.name
    }

    private var availableSuggestions: [String] {
        guard let currentExerciseName else { return suggestions }
        return suggestions.filter {
            $0.caseInsensitiveCompare(currentExerciseName) != .orderedSame
        }
    }

    private var categoryOptions: [String] {
        ["All", "Program & history"] + ExerciseLibrary.categories
    }

    private var visibleSuggestions: [String] {
        let query = trimmedExerciseName.lowercased()
        return availableSuggestions.filter { name in
            let matchesQuery = query.isEmpty || name.lowercased().contains(query)
            let category = ExerciseLibrary.category(for: name) ?? "Program & history"
            let matchesCategory = selectedCategory == "All" || selectedCategory == category
            return matchesQuery && matchesCategory
        }
    }

    private var canSave: Bool {
        guard !trimmedExerciseName.isEmpty else { return false }
        guard let currentExerciseName else { return true }
        return trimmedExerciseName.caseInsensitiveCompare(currentExerciseName) != .orderedSame
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color.fwbBackground.ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        Text(request.title.uppercased())
                            .font(.largeTitle.weight(.black))
                            .fontWidth(.condensed)
                            .foregroundStyle(Color.fwbWarmWhite)

                        Text(instructionText)
                            .font(.subheadline)
                            .foregroundStyle(Color.fwbMuted)

                        HStack(spacing: 10) {
                            Image(systemName: "magnifyingglass")
                                .foregroundStyle(Color.fwbLime)
                            TextField("Type or search any exercise name", text: $exerciseName)
                                .textInputAutocapitalization(.words)
                                .autocorrectionDisabled()
                                .foregroundStyle(Color.fwbWarmWhite)
                                .tint(Color.fwbLime)
                                .accessibilityIdentifier("workout.exercisePicker.name")
                            if !exerciseName.isEmpty {
                                Button {
                                    exerciseName = ""
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundStyle(Color.fwbMuted)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Clear exercise search")
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .frame(minHeight: 50)
                        .background(Color.fwbSurface, in: Rectangle())
                        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }

                        LazyVGrid(columns: categoryColumns, alignment: .leading, spacing: 8) {
                            ForEach(categoryOptions, id: \.self) { category in
                                Button {
                                    selectedCategory = category
                                } label: {
                                    Text(category.uppercased())
                                        .font(.footnote.weight(.black))
                                        .tracking(0.45)
                                        .multilineTextAlignment(.center)
                                        .foregroundStyle(selectedCategory == category ? Color.black : Color.fwbLime)
                                        .padding(.horizontal, 8)
                                        .frame(maxWidth: .infinity, minHeight: 48)
                                        .background(
                                            selectedCategory == category ? Color.fwbAccentFill : Color.clear,
                                            in: Rectangle()
                                        )
                                        .overlay { Rectangle().stroke(Color.fwbLime, lineWidth: 1) }
                                        .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityAddTraits(selectedCategory == category ? .isSelected : [])
                                .accessibilityHint("Filters the exercise library")
                                .accessibilityIdentifier("workout.exercisePicker.category.\(category)")
                            }
                        }

                        VStack(alignment: .leading, spacing: 0) {
                            HStack {
                                Text("EXERCISE LIBRARY")
                                    .font(.footnote.weight(.black))
                                    .tracking(0.8)
                                    .foregroundStyle(Color.fwbLime)
                                Spacer()
                                Text("\(visibleSuggestions.count) RESULTS")
                                    .font(.footnote.weight(.bold))
                                    .foregroundStyle(Color.fwbMuted)
                            }
                            .padding(12)

                            FWBRule()

                            if visibleSuggestions.isEmpty {
                                Text("No library match. You can add the typed name as a custom exercise below.")
                                    .font(.footnote)
                                    .foregroundStyle(Color.fwbMuted)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .padding(14)
                            } else {
                                LazyVStack(spacing: 0) {
                                    ForEach(visibleSuggestions, id: \.self) { suggestion in
                                        Button {
                                            onSave(suggestion)
                                            dismiss()
                                        } label: {
                                            HStack(spacing: 12) {
                                                Image(systemName: exerciseIcon(for: suggestion))
                                                    .font(.subheadline.weight(.bold))
                                                    .foregroundStyle(Color.black)
                                                    .frame(width: 34, height: 34)
                                                    .background(Color.fwbAccentFill, in: Rectangle())

                                                VStack(alignment: .leading, spacing: 3) {
                                                    Text(suggestion.fwbTitleCased)
                                                        .font(.subheadline.weight(.bold))
                                                        .foregroundStyle(Color.fwbWarmWhite)
                                                        .multilineTextAlignment(.leading)
                                                    Text((ExerciseLibrary.category(for: suggestion) ?? "Program & history").uppercased())
                                                        .font(.footnote.weight(.black))
                                                        .tracking(0.5)
                                                        .foregroundStyle(Color.fwbMuted)
                                                }

                                                Spacer(minLength: 6)
                                                Image(systemName: "plus")
                                                    .font(.footnote.weight(.black))
                                                    .foregroundStyle(Color.fwbLime)
                                            }
                                            .padding(.horizontal, 12)
                                            .frame(minHeight: 58)
                                            .contentShape(Rectangle())
                                        }
                                        .buttonStyle(.plain)
                                        .accessibilityLabel("Add \(suggestion)")

                                        if suggestion != visibleSuggestions.last {
                                            FWBRule()
                                        }
                                    }
                                }
                            }
                        }
                        .background(Color.fwbCard, in: Rectangle())
                        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }

                        if case .substitute(let exercise) = request.mode {
                            Label(
                                "Replacing \(exercise.name) keeps its logged weights, reps, notes, and completed sets.",
                                systemImage: "arrow.left.arrow.right"
                            )
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Color.fwbMuted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(Color.fwbSurface, in: Rectangle())
                            .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                        }

                        if canSave && !isExactSuggestion {
                            Label(
                                "Exact name not required. This will be saved as a manual exercise.",
                                systemImage: "pencil.line"
                            )
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Color.fwbMuted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(Color.fwbSurface, in: Rectangle())
                            .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                        }

                        Button {
                            onSave(trimmedExerciseName)
                            dismiss()
                        } label: {
                            Label(customActionTitle, systemImage: actionIcon)
                        }
                        .buttonStyle(FWBPrimaryButtonStyle())
                        .disabled(!canSave)
                        .accessibilityIdentifier("workout.exercisePicker.save")
                    }
                    .padding(20)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .navigationTitle(request.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.fwbBackground, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Color.fwbLime)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var instructionText: String {
        switch request.mode {
        case .add:
            return "Browse the library or type your own name or short description. It does not need to be the exact exercise name."
        case .substitute:
            return "Choose a library alternative or type a manual name while keeping the program’s sets and rest time."
        }
    }

    private var isExactSuggestion: Bool {
        availableSuggestions.contains {
            $0.caseInsensitiveCompare(trimmedExerciseName) == .orderedSame
        }
    }

    private var customActionTitle: String {
        guard !trimmedExerciseName.isEmpty else { return request.actionTitle }

        if !isExactSuggestion {
            switch request.mode {
            case .add:
                return "ADD MANUAL: \(trimmedExerciseName)"
            case .substitute:
                return "USE MANUAL: \(trimmedExerciseName)"
            }
        }

        return "\(request.actionTitle): \(trimmedExerciseName)"
    }

    private func exerciseIcon(for name: String) -> String {
        switch ExerciseLibrary.category(for: name) {
        case "Mobility", "Stretching":
            return "figure.flexibility"
        case "Foam Rolling":
            return "figure.cooldown"
        case "Core":
            return "figure.core.training"
        case "Lower Body":
            return "figure.strengthtraining.functional"
        default:
            return "figure.strengthtraining.traditional"
        }
    }

    private var actionIcon: String {
        switch request.mode {
        case .add:
            return "plus"
        case .substitute:
            return "arrow.left.arrow.right"
        }
    }
}

private struct LoggerStatusBanner: View {
    let text: String
    let icon: String
    let color: Color

    var body: some View {
        Label(text, systemImage: icon)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(color)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Color.fwbSurface, in: Rectangle())
            .overlay { Rectangle().stroke(color.opacity(0.7), lineWidth: 1) }
    }
}

private struct ExerciseNameAutocompleteField: View {
    @Binding var text: String
    let suggestions: [String]
    var autoFocus = false
    let accessibilityIdentifier: String

    @FocusState private var isFocused: Bool

    private var matches: [String] {
        ExerciseSuggestionLibrary.matches(query: text, within: suggestions)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Exercise name", text: $text)
                .textInputAutocapitalization(.words)
                .focused($isFocused)
                .textFieldStyle(FWBTextFieldStyle())
                .accessibilityIdentifier(accessibilityIdentifier)

            Text("Choose a suggestion or type any name or short description. Exact wording is not required.")
                .font(.caption)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)

            if isFocused && !matches.isEmpty {
                VStack(spacing: 0) {
                    ForEach(matches, id: \.self) { suggestion in
                        Button {
                            text = suggestion
                            isFocused = false
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "figure.strengthtraining.traditional")
                                    .foregroundStyle(Color.fwbLime)
                                Text(suggestion.fwbTitleCased)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(Color.fwbWarmWhite)
                                Spacer()
                            }
                            .padding(.horizontal, 12)
                            .frame(minHeight: 42)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Use \(suggestion)")
                        .accessibilityIdentifier("workout.exercisePicker.suggestion.\(suggestionIdentifier(suggestion))")

                        if suggestion != matches.last {
                            FWBRule()
                        }
                    }
                }
                .background(Color.fwbSurface, in: Rectangle())
                .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
            }
        }
        .onAppear {
            if autoFocus {
                isFocused = true
            }
        }
    }

    private func suggestionIdentifier(_ suggestion: String) -> String {
        suggestion
            .lowercased()
            .replacingOccurrences(of: " ", with: "-")
    }
}
