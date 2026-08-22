import SwiftUI

private enum WorkoutLogFocus: Hashable {
    case weight(UUID)
    case reps(UUID)
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
    @ObservedObject private var offlineSyncStore = WorkoutOfflineSyncStore.shared
    @AppStorage("restTimerHapticsEnabled") private var restTimerHapticsEnabled = true
    @AppStorage("workoutPraiseHapticsEnabled") private var workoutPraiseHapticsEnabled = true
    @AppStorage("weeklyWorkoutGoal") private var weeklyWorkoutGoal = 3
    @State private var entryDate = Date()
    @State private var exercises: [Exercise]
    @State private var drafts: [WorkoutSetDraft]
    @State private var startedAt = Date()
    @State private var activeSaveIntent: WorkoutSaveIntent?
    @State private var activeExerciseSaveID: String?
    @State private var lastSuccessfulSave: WorkoutSaveIntent?
    @State private var lastSavedExerciseID: String?
    @State private var exerciseEditorRequest: ExerciseEditorRequest?
    @State private var pendingExerciseRemoval: Exercise?
    @State private var substitutionOriginals: [String: Exercise] = [:]
    @State private var didLoadSession = false
    @State private var restoredPersistenceToken: String?
    @State private var praiseBanner: WorkoutPraiseBannerItem?
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

                    ForEach(Array(exercises.enumerated()), id: \.element.id) { index, exercise in
                        WorkoutExerciseLogCard(
                            exercise: exercise,
                            drafts: $drafts,
                            focusedField: $focusedField,
                            entryStyle: entryStyle,
                            editableName: isCustomWorkout ? nameBinding(for: exercise) : nil,
                            suggestions: suggestionNames,
                            substitutedFromName: substitutionOriginals[exercise.code]?.name,
                            initiallyExpanded: isCustomWorkout || index == 0,
                            isSavingProgress: isSyncing && activeExerciseSaveID == exercise.id,
                            didSaveProgress: lastSavedExerciseID == exercise.id,
                            saveProgressDisabled: isSyncing || logStore.state == .loading,
                            onAddSet: { addSet(to: exercise) },
                            onDeleteSet: { deleteSet($0, from: exercise) },
                            onSetCompletionChanged: { isCompleted in
                                handleSetCompletion(for: exercise, isCompleted: isCompleted)
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
                                saveWorkout(intent: .progress, exerciseID: exercise.id)
                            }
                        )
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
                        completedSets: drafts.filter(\.isCompleted).count,
                        totalSets: drafts.count,
                        totalReps: drafts.reduce(0) { $0 + $1.repsValue },
                        totalVolume: entryStyle == .mobility
                            ? drafts.reduce(0) { $0 + $1.weightValue }
                            : drafts.reduce(0) { $0 + $1.volume }
                    )

                    statusMessage

                    Button {
                        saveWorkout(intent: .progress)
                    } label: {
                        HStack(spacing: 10) {
                            if isSyncing && activeSaveIntent == .progress {
                                ProgressView()
                                    .tint(Color.fwbLime)
                            } else {
                                Image(systemName: "tray.and.arrow.down")
                            }
                            Text(isSyncing && activeSaveIntent == .progress ? "SAVING PROGRESS…" : "SAVE PROGRESS")
                        }
                    }
                    .buttonStyle(FWBSecondaryButtonStyle())
                    .disabled(isSyncing || logStore.state == .loading)
                    .accessibilityIdentifier("workout.saveProgress")

                    Button {
                        saveWorkout(intent: .finish)
                    } label: {
                        HStack(spacing: 10) {
                            if isSyncing && activeSaveIntent == .finish {
                                ProgressView()
                                    .tint(.black)
                            } else {
                                Image(systemName: "checkmark")
                            }
                            Text(isSyncing && activeSaveIntent == .finish ? "FINISHING…" : "FINISH WORKOUT")
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
        .task(id: draftPersistenceTaskID) {
            guard didLoadSession,
                  draftPersistenceToken != restoredPersistenceToken else { return }
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }

            if shouldPersistDraft {
                await offlineSyncStore.persistDraft(
                    email: clientEmail,
                    workoutTitle: workout.title,
                    entryDate: dateString,
                    exercises: exercises,
                    drafts: drafts
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
        ExerciseSuggestionLibrary.merged([
            exerciseLibraryStore.suggestionNames,
            ExerciseLibrary.names,
            suggestedExercises.map(\.name),
            exercises.map(\.name),
            suggestionStore.historyNames
        ])
    }

    @ViewBuilder
    private var statusMessage: some View {
        switch offlineSyncStore.state {
        case .restoring:
            LoggerStatusBanner(text: "Checking for a recovered workout…", icon: "arrow.clockwise", color: .fwbMuted)
        case .restored:
            LoggerStatusBanner(text: "Recovered your unsaved workout from this iPhone.", icon: "clock.arrow.circlepath", color: .fwbLime)
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
                $0.notes,
                String($0.isCompleted)
            ].joined(separator: "\u{1F}")
        }.joined(separator: "\u{1E}")
        return exercisePart + "\u{1D}" + setPart
    }

    private var shouldPersistDraft: Bool {
        drafts.contains { $0.containsEntry || $0.isCompleted } ||
            exercises != workout.exercises ||
            drafts.count != Self.makeDrafts(for: exercises).count
    }

    private func saveWorkout(intent: WorkoutSaveIntent, exerciseID: String? = nil) {
        focusedField = nil
        activeSaveIntent = exerciseID == nil ? intent : nil
        activeExerciseSaveID = exerciseID
        Task {
            let result = await offlineSyncStore.save(
                email: clientEmail,
                workoutTitle: workout.title,
                entryDate: dateString,
                exercises: exercises,
                drafts: drafts,
                isFinished: intent == .finish
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
            .filter { matches($0, exercise) }
            .map(\.setNumber)
            .max()
            .map { $0 + 1 } ?? 1
        let draft = WorkoutSetDraft(exercise: exercise, setNumber: nextSet)
        withAnimation(.easeOut(duration: 0.18)) {
            drafts.append(draft)
        }
        focusedField = .weight(draft.id)
    }

    private func handleSetCompletion(for exercise: Exercise, isCompleted: Bool) {
        guard isCompleted else { return }
        let exerciseDrafts = drafts.filter { matches($0, exercise) }
        let exerciseIsComplete = !exerciseDrafts.isEmpty && exerciseDrafts.allSatisfy(\.isCompleted)
        showPraise(
            WorkoutPraiseBannerItem(
                title: exerciseIsComplete ? "EXERCISE COMPLETE." : "STRONG SET.",
                detail: exerciseIsComplete ? "\(exercise.name) is done. Keep building." : "Set logged. Stay with it.",
                icon: exerciseIsComplete ? "checkmark.seal.fill" : "checkmark"
            )
        )
        if exerciseIsComplete && !restTimerHapticsEnabled {
            WorkoutPraiseHaptics.exerciseComplete(isEnabled: workoutPraiseHapticsEnabled)
        }

        let seconds = RestDurationParser.seconds(from: exercise.rest)
        restTimerStore.start(
            seconds: seconds,
            exerciseName: exercise.name.isEmpty ? "Exercise" : exercise.name,
            hapticsEnabled: restTimerHapticsEnabled
        )
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
            renumberSets(for: exercise)
        }
    }

    private func deleteExercise(_ exercise: Exercise) {
        focusedField = nil
        withAnimation(.easeOut(duration: 0.18)) {
            exercises.removeAll { $0.id == exercise.id }
            drafts.removeAll { matches($0, exercise) }
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
        let resolvedName = approvedExercise?.name ?? name
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
        let replacementName = (approvedExercise?.name ?? name).trimmingCharacters(in: .whitespacesAndNewlines)
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
        let normalizedName = name.trimmingCharacters(in: .whitespacesAndNewlines)

        return exerciseLibraryStore.exercises.first { exercise in
            exercise.name.caseInsensitiveCompare(normalizedName) == .orderedSame
                || exercise.aliases.contains {
                    $0.caseInsensitiveCompare(normalizedName) == .orderedSame
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
                exercises.first(where: { $0.code == snapshot.code })?.name ?? snapshot.name
            },
            set: { nextName in
                renameExercise(code: snapshot.code, to: nextName)
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
        let matchingIndexes = drafts.indices.filter { matches(drafts[$0], exercise) }
        for (offset, index) in matchingIndexes.enumerated() {
            drafts[index].setNumber = offset + 1
        }
    }

    private func matches(_ draft: WorkoutSetDraft, _ exercise: Exercise) -> Bool {
        draft.exerciseCode == exercise.code && draft.exerciseName == exercise.name
    }

    private func loadSavedSets() async {
        substitutionOriginals = [:]

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
                drafts[index].weight = Self.numberString(record.weightUsed)
                drafts[index].reps = record.reps.map(Self.numberString) ?? ""
                drafts[index].notes = record.notes ?? ""
                drafts[index].isCompleted = true
            } else {
                drafts.append(
                    WorkoutSetDraft(
                        exercise: exercise,
                        setNumber: record.setNumber,
                        weight: Self.numberString(record.weightUsed),
                        reps: record.reps.map(Self.numberString) ?? "",
                        notes: record.notes ?? "",
                        isCompleted: true
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
            exercises = recovered.restoredExercises
            drafts = recovered.restoredDrafts
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
        let components = normalized.split(separator: "x", maxSplits: 1)

        if let first = components.first,
           let match = first.split(whereSeparator: { !$0.isNumber }).last,
           let count = Int(match) {
            return min(max(count, 1), 12)
        }

        return 3
    }

    private static func numberString(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(value)
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

            Text(workout.title.uppercased())
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

private struct WorkoutExerciseLogCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let exercise: Exercise
    @Binding var drafts: [WorkoutSetDraft]
    @FocusState.Binding var focusedField: WorkoutLogFocus?
    let entryStyle: WorkoutEntryStyle
    let editableName: Binding<String>?
    let suggestions: [String]
    let substitutedFromName: String?
    let isSavingProgress: Bool
    let didSaveProgress: Bool
    let saveProgressDisabled: Bool
    let onAddSet: () -> Void
    let onDeleteSet: (UUID) -> Void
    let onSetCompletionChanged: (Bool) -> Void
    let onSubstituteExercise: () -> Void
    let onRevertSubstitution: () -> Void
    let onDeleteExercise: () -> Void
    let onSaveProgress: () -> Void

    @State private var isExpanded: Bool
    @State private var areInstructionsExpanded = false

    init(
        exercise: Exercise,
        drafts: Binding<[WorkoutSetDraft]>,
        focusedField: FocusState<WorkoutLogFocus?>.Binding,
        entryStyle: WorkoutEntryStyle,
        editableName: Binding<String>?,
        suggestions: [String],
        substitutedFromName: String?,
        initiallyExpanded: Bool,
        isSavingProgress: Bool,
        didSaveProgress: Bool,
        saveProgressDisabled: Bool,
        onAddSet: @escaping () -> Void,
        onDeleteSet: @escaping (UUID) -> Void,
        onSetCompletionChanged: @escaping (Bool) -> Void,
        onSubstituteExercise: @escaping () -> Void,
        onRevertSubstitution: @escaping () -> Void,
        onDeleteExercise: @escaping () -> Void,
        onSaveProgress: @escaping () -> Void
    ) {
        self.exercise = exercise
        _drafts = drafts
        _focusedField = focusedField
        self.entryStyle = entryStyle
        self.editableName = editableName
        self.suggestions = suggestions
        self.substitutedFromName = substitutedFromName
        self.isSavingProgress = isSavingProgress
        self.didSaveProgress = didSaveProgress
        self.saveProgressDisabled = saveProgressDisabled
        self.onAddSet = onAddSet
        self.onDeleteSet = onDeleteSet
        self.onSetCompletionChanged = onSetCompletionChanged
        self.onSubstituteExercise = onSubstituteExercise
        self.onRevertSubstitution = onRevertSubstitution
        self.onDeleteExercise = onDeleteExercise
        self.onSaveProgress = onSaveProgress
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
                            Text(exercise.name.isEmpty ? "Exercise" : exercise.name)
                                .font(.title3.weight(.black))
                                .fontWidth(.condensed)
                                .foregroundStyle(Color.fwbWarmWhite)
                                .multilineTextAlignment(.leading)
                            if !exercise.prescription.isEmpty {
                                Text(exercise.prescription)
                                    .font(.footnote)
                                    .foregroundStyle(Color.fwbMuted)
                            }
                            Text("\(completedSetCount) / \(exerciseDrafts.count) sets completed")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(Color.fwbLime)
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

                HStack(spacing: 0) {
                    TableHeading(text: "SET", width: 46)
                    TableHeading(text: entryStyle.firstHeading, width: nil)
                    TableHeading(text: entryStyle.secondHeading, width: nil)
                    TableHeading(text: "", width: 40)
                }

                let matchingDrafts = exerciseDrafts
                ForEach(matchingDrafts) { draft in
                    WorkoutSetLogRow(
                        draft: binding(for: draft),
                        focusedField: $focusedField,
                        entryStyle: entryStyle,
                        onCompletionChanged: onSetCompletionChanged,
                        onDelete: { onDeleteSet(draft.id) }
                    )
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
    }

    private var exerciseDrafts: [WorkoutSetDraft] {
        drafts
            .filter { $0.exerciseCode == exercise.code && $0.exerciseName == exercise.name }
            .sorted { $0.setNumber < $1.setNumber }
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
        exerciseDrafts.reduce(0) { $0 + $1.volume }
    }

    private var totalTime: Double {
        exerciseDrafts.reduce(0) { $0 + $1.weightValue }
    }

    private var completedSetCount: Int {
        exerciseDrafts.filter(\.isCompleted).count
    }

    private var hasExerciseEntry: Bool {
        exerciseDrafts.contains(where: \.containsEntry)
    }

    private var totalReps: Double {
        exerciseDrafts.reduce(0) { $0 + $1.repsValue }
    }

    private var averageWeight: Double {
        let weightedSets = exerciseDrafts.filter { $0.weightValue > 0 }
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
    let onCompletionChanged: (Bool) -> Void
    let onDelete: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 0) {
                Button {
                    draft.isCompleted.toggle()
                    onCompletionChanged(draft.isCompleted)
                } label: {
                    Group {
                        if draft.isCompleted {
                            Image(systemName: "checkmark")
                        } else {
                            Text("\(draft.setNumber)")
                        }
                    }
                    .font(.subheadline.weight(.black))
                    .foregroundStyle(draft.isCompleted ? .black : .white)
                    .frame(width: 46, height: 50)
                    .background(draft.isCompleted ? Color.fwbAccentFill : Color.fwbSurface)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(draft.isCompleted ? "Set \(draft.setNumber) complete" : "Complete set \(draft.setNumber)")

                Rectangle().fill(Color.fwbLine).frame(width: 1, height: 50)

                NumericLogField(
                    placeholder: "0",
                    suffix: entryStyle.firstSuffix,
                    text: $draft.weight,
                    focus: $focusedField,
                    focusValue: .weight(draft.id)
                )

                Rectangle().fill(Color.fwbLine).frame(width: 1, height: 50)

                NumericLogField(
                    placeholder: "0",
                    suffix: entryStyle.secondSuffix,
                    text: $draft.reps,
                    focus: $focusedField,
                    focusValue: .reps(draft.id)
                )

                Rectangle().fill(Color.fwbLine).frame(width: 1, height: 50)

                Menu {
                    Button(role: .destructive, action: onDelete) {
                        Label("Delete Set", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.subheadline.bold())
                        .foregroundStyle(Color.fwbWarmWhite)
                        .frame(width: 40, height: 50)
                }
                .accessibilityLabel("Set \(draft.setNumber) options")
            }

            TextField("Optional set note", text: $draft.notes)
                .font(.footnote)
                .foregroundStyle(Color.fwbWarmWhite)
                .focused($focusedField, equals: .note(draft.id))
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .frame(minHeight: 34)
                .background(Color.fwbSurface)
        }
        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
    }
}

private struct NumericLogField: View {
    let placeholder: String
    let suffix: String
    @Binding var text: String
    @FocusState.Binding var focus: WorkoutLogFocus?
    let focusValue: WorkoutLogFocus

    var body: some View {
        HStack(spacing: 4) {
            TextField(placeholder, text: $text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .font(.headline.weight(.bold))
                .foregroundStyle(Color.fwbWarmWhite)
                .focused($focus, equals: focusValue)
            Text(suffix)
                .font(.footnote.bold())
                .foregroundStyle(Color.fwbMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.65)
        }
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity)
        .frame(minHeight: 50)
        .background(Color.fwbCard)
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
                                                    Text(suggestion)
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
                                Text(suggestion)
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
