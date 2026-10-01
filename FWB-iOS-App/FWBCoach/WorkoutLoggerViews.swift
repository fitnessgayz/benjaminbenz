import SwiftUI
import UIKit
import ImageIO
import AVKit

enum ExerciseMediaURL {
    static func thumbnail(for imageURL: URL?) -> URL? {
        guard let imageURL,
              var components = URLComponents(url: imageURL, resolvingAgainstBaseURL: false),
              components.path.contains("/exercise-images/approved/"),
              components.path.contains("/webp-768/"),
              components.path.hasSuffix(".webp") else { return imageURL }
        components.path = components.path.replacingOccurrences(of: "/webp-768/", with: "/webp-480/")
        return components.url ?? imageURL
    }

    static func isVideo(_ url: URL?) -> Bool {
        guard let url else { return false }
        return ["mp4", "mov", "m4v", "webm"].contains(url.pathExtension.lowercased())
    }
}

private struct ExerciseMedia: Equatable {
    let imageURL: URL?
    let thumbnailURL: URL?
    let motionURL: URL?
    let primaryMuscle: String
    let equipment: String
    let instructions: String
    let fallbackDemoURL: URL?

    var hasVisual: Bool { imageURL != nil }

    var thumbnailURLs: [URL] {
        [thumbnailURL, imageURL].compactMap { $0 }.reduce(into: []) { urls, url in
            if !urls.contains(url) { urls.append(url) }
        }
    }
}

private struct ExerciseMediaViewerRequest: Identifiable {
    let id = UUID()
    let exerciseName: String
    let media: ExerciseMedia
}

private struct ExerciseSuggestionText: View {
    let name: String
    let approvedExercises: [ApprovedExercise]
    var fallbackSubtitle: String? = nil

    private var subtitle: String? {
        ExerciseSuggestionMetadata.muscleSummary(
            for: name,
            approvedExercises: approvedExercises
        ) ?? fallbackSubtitle
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(name.fwbTitleCased)
                .font(FWBFont.subheadline.weight(.semibold))
                .foregroundStyle(Color.fwbWarmWhite)
                .multilineTextAlignment(.leading)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(FWBFont.footnote.weight(.semibold))
                    .foregroundStyle(Color.fwbMuted)
                    .multilineTextAlignment(.leading)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

private func exerciseSuggestionAccessibilityLabel(
    action: String,
    name: String,
    approvedExercises: [ApprovedExercise]
) -> String {
    guard let muscles = ExerciseSuggestionMetadata.muscleSummary(
        for: name,
        approvedExercises: approvedExercises
    ) else { return "\(action) \(name)" }
    return "\(action) \(name), muscles: \(muscles)"
}

private enum WorkoutLogFocus: Hashable {
    case set(UUID)
    case weight(UUID)
    case reps(UUID)
    case effort(UUID)
    case duration(UUID)
    case note(UUID)

    var accessibilityIdentifier: String {
        switch self {
        case .set(let id): "workout.setLabel.\(id.uuidString)"
        case .weight(let id): "workout.weight.\(id.uuidString)"
        case .reps(let id): "workout.reps.\(id.uuidString)"
        case .effort(let id): "workout.effort.\(id.uuidString)"
        case .duration(let id): "workout.duration.\(id.uuidString)"
        case .note(let id): "workout.note.\(id.uuidString)"
        }
    }
}

private enum WorkoutSaveIntent: Equatable {
    case progress
    case finish
}

private enum WorkoutGroupSaveStatus: Equatable {
    case pending
    case saving
    case saved

    var title: String {
        switch self {
        case .pending: "AUTOSAVE ON"
        case .saving: "SAVING…"
        case .saved: "AUTOSAVED"
        }
    }

    var systemImage: String {
        switch self {
        case .pending: "icloud"
        case .saving: "arrow.triangle.2.circlepath.icloud"
        case .saved: "checkmark.icloud"
        }
    }
}

private enum WorkoutEntryStyle {
    case strength
    case mobility

    var firstHeading: String { self == .mobility ? "SECONDS" : "WEIGHT" }
    var secondHeading: String { self == .mobility ? "ROUNDS" : "REPS" }
    var firstSuffix: String { self == .mobility ? "sec" : "lb" }
    var secondSuffix: String { self == .mobility ? "rounds" : "reps" }
}

private enum CustomExercisePlacement: Equatable {
    case currentGroup
    case newCircuit
}

private struct ExerciseEditorRequest: Identifiable {
    enum Mode {
        case add(CustomExercisePlacement)
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

private struct ExerciseNavigationRequest: Identifiable {
    let id = UUID()
}

private struct WorkoutScrollRequest: Equatable {
    let id = UUID()
    let target: String
}

private struct WorkoutExerciseNavigationRow: Identifiable {
    let id: String
    let number: Int
    let title: String
    let group: String?
    let completed: Int
    let total: Int
    let target: String
}

private struct WorkoutHistoryCopyPromptRequest: Identifiable {
    let exercise: Exercise
    let source: WorkoutExerciseCopySource

    var id: String {
        "\(exercise.id)|\(source.entryDate)|\(source.workoutTitle)"
    }
}

struct WorkoutLoggingView<WorkoutSelector: View>: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.clientNavigationTabID) private var clientNavigationTabID
    @Environment(\.clientNavigationTabIsSelected) private var clientNavigationTabIsSelected
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let workout: Workout
    let seedSession: WorkoutHistorySession?
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
    @State private var customWorkoutFormat: CustomWorkoutFormat
    @State private var startedAt = Date()
    @State private var sessionID = UUID()
    @State private var baseRemoteUpdatedAt: Date?
    @State private var activeSaveIntent: WorkoutSaveIntent?
    @State private var activeExerciseSaveID: String?
    @State private var lastSuccessfulSave: WorkoutSaveIntent?
    @State private var lastSavedExerciseID: String?
    @State private var activeAutosaveToken: String?
    @State private var lastAutosavedPersistenceToken: String?
    @State private var exerciseEditorRequest: ExerciseEditorRequest?
    @State private var sequenceEditorRequest: SequenceEditorRequest?
    @State private var exerciseNavigationRequest: ExerciseNavigationRequest?
    @State private var pendingNavigationTarget: String?
    @State private var scrollRequest: WorkoutScrollRequest?
    @State private var seedLoadedDate: String?
    @State private var seedBaselineToken: String?
    @State private var seededCopyWasEdited = false
    @State private var pendingSlotAssignment: WorkoutGroupAssignment?
    @State private var commentsExpanded = false
    @State private var pendingGroupedCopyID: UUID?
    @State private var formCheckContext: FormCheckContext?
    @State private var pendingExerciseRemoval: Exercise?
    @State private var substitutionOriginals: [String: Exercise] = [:]
    @State private var copiedDraftIDs: Set<UUID> = []
    @State private var didLoadSession = false
    @State private var restoredPersistenceToken: String?
    @State private var praiseBanner: WorkoutPraiseBannerItem?
    @State private var difficultyPrompt: WorkoutDifficultyPromptRequest?
    @State private var completionCelebration: WorkoutCelebration?
    @State private var historyCopyPrompt: WorkoutHistoryCopyPromptRequest?
    @State private var pendingHistoryCopyExerciseID: String?
    @FocusState private var focusedField: WorkoutLogFocus?

    init(
        workout: Workout,
        clientEmail: String,
        embedded: Bool = false,
        suggestedExercises: [Exercise] = [],
        seedSession: WorkoutHistorySession? = nil,
        @ViewBuilder workoutSelector: () -> WorkoutSelector
    ) {
        self.workout = workout
        self.seedSession = seedSession
        self.clientEmail = clientEmail
        self.embedded = embedded
        self.suggestedExercises = suggestedExercises
        self.workoutSelector = workoutSelector()
        _exercises = State(initialValue: workout.exercises)
        _drafts = State(initialValue: Self.makeDrafts(for: workout.exercises))
        _groupAssignments = State(initialValue: WorkoutSequencePlanner.inferredAssignments(for: workout))
        _customWorkoutFormat = State(
            initialValue: seedSession == nil ? Self.savedCustomWorkoutFormat(for: clientEmail) : .single
        )
    }

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollViewReader { scrollProxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    workoutSelector
                        .padding(.horizontal, -20)

                    if embedded {
                        EmbeddedWorkoutHeader(workout: workout)
                    } else {
                        WorkoutSessionHeader(title: workout.title.fwbWorkoutDisplayTitle, startedAt: startedAt)
                    }
                    workoutDateCard

                    if let seedSession {
                        VStack(alignment: .leading, spacing: 4) {
                            Label("Copied workout · all sets are ready to edit", systemImage: "doc.on.doc")
                                .font(FWBFont.sized(12).weight(.semibold))
                            Text("Your original log stays unchanged. Edit a value or save when you’re ready.")
                                .font(FWBFont.sized(11))
                            if seedSession.records.contains(where: { $0.isCardio || $0.exerciseCode.caseInsensitiveCompare("WARMUP") == .orderedSame }) {
                                Text("Cardio and session warm-up entries remain in the original log; exercise sets and their warm-up sets are copied here.")
                                    .font(FWBFont.sized(11))
                            }
                        }
                        .foregroundStyle(Color.fwbMuted)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityIdentifier("workout.copiedSessionNotice")
                    }

                    if isCustomWorkout {
                        CustomWorkoutFormatPicker(selection: customWorkoutFormatBinding)
                    }

                    HStack(spacing: 6) {
                        Button { commentsExpanded.toggle() } label: {
                            Label("Comments", systemImage: "bubble.left")
                        }
                        .buttonStyle(LoggerCompactButtonStyle())
                        .accessibilityIdentifier("workout.commentsToggle")
                        Spacer(minLength: 0)
                        Button { sequenceEditorRequest = SequenceEditorRequest() } label: {
                            Label("Exercises & groups", systemImage: "list.bullet")
                        }
                        .buttonStyle(LoggerCompactButtonStyle())
                        .disabled(exercises.isEmpty)
                        .accessibilityIdentifier("workout.editSequence")
                    }
                    if commentsExpanded {
                        WorkoutCommentSummaryCard(store: commentStore, context: commentContext)
                    }

                    if isCustomWorkout && customWorkoutFormat != .single {
                        ForEach(WorkoutRoundLayout.groupSlots(sections: sequenceSections, format: customWorkoutFormat)) { slot in
                            if let section = slot.section {
                                if let assignment = section.assignment {
                                    groupedSection(section, assignment: assignment)
                                } else {
                                    ForEach(section.exercises) { exercise in exerciseCard(for: exercise) }
                                }
                            } else {
                                blankCustomGroup(number: slot.number)
                            }
                        }
                    } else {
                        ForEach(sequenceSections) { section in
                            if let assignment = section.assignment {
                                groupedSection(section, assignment: assignment)
                            } else {
                                ForEach(section.exercises) { exercise in
                                    exerciseCard(for: exercise)
                                }
                            }
                        }
                    }

                    if exercises.isEmpty && !isCustomWorkout {
                        LoggerEmptyState()
                    }

                    customBlankSlots

                    customExerciseActions

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
                            Text(isSyncing && activeSaveIntent == .finish ? "Finishing…" : "Save & finish workout")
                        }
                    }
                    .buttonStyle(FWBPrimaryButtonStyle())
                    .disabled(isSyncing || logStore.state == .loading)
                    .accessibilityIdentifier("workout.finish")
                }
                .padding(.horizontal, 12)
                .padding(.vertical, FWBLayout.pagePadding)
                .padding(.bottom, 22)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: scrollRequest) { request in
                guard let request else { return }
                withAnimation(.easeInOut(duration: 0.3)) {
                    scrollProxy.scrollTo(request.target, anchor: .top)
                }
                scrollRequest = nil
            }
            }
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
                Button("Done") {
                    focusedField = nil
                    UIApplication.shared.sendAction(
                        #selector(UIResponder.resignFirstResponder),
                        to: nil,
                        from: nil,
                        for: nil
                    )
                }
            }
        }
        .task(id: dateString) {
            didLoadSession = false
            restoredPersistenceToken = nil
            await loadSavedSets()
            lastAutosavedPersistenceToken = draftPersistenceToken
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
        .onChange(of: draftPersistenceToken) { token in
            guard seedSession != nil, didLoadSession,
                  let seedBaselineToken, token != seedBaselineToken else { return }
            seededCopyWasEdited = true
        }
        .task(id: autosaveTaskID) {
            guard didLoadSession,
                  shouldAutosaveProgress,
                  draftPersistenceToken != lastAutosavedPersistenceToken else { return }
            try? await Task.sleep(nanoseconds: 1_250_000_000)
            guard !Task.isCancelled,
                  shouldAutosaveProgress else { return }
            await autosaveProgress(expectedToken: draftPersistenceToken)
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
            NotificationCenter.default.post(name: Notification.Name("fwbWorkoutExerciseListAvailabilityChanged"), object: nil, userInfo: ["available": true, "tab": clientNavigationTabID])
        }
        .onDisappear {
            NotificationCenter.default.post(name: Notification.Name("fwbWorkoutExerciseListAvailabilityChanged"), object: nil, userInfo: ["available": false, "tab": clientNavigationTabID])
        }
        .onChange(of: clientNavigationTabIsSelected) { selected in
            if selected {
                NotificationCenter.default.post(name: Notification.Name("fwbWorkoutExerciseListAvailabilityChanged"), object: nil, userInfo: ["available": true, "tab": clientNavigationTabID])
            }
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            Task {
                await offlineSyncStore.retryPending()
                await commentStore.refresh(context: commentContext)
            }
        }
        .onChange(of: achievementHistoryStore.state) { state in
            guard let exerciseID = pendingHistoryCopyExerciseID else { return }
            switch state {
            case .loaded:
                if let exercise = exercises.first(where: { $0.id == exerciseID }) {
                    scheduleHistoryCopyPrompt(for: exercise)
                } else {
                    pendingHistoryCopyExerciseID = nil
                }
            case .failed:
                pendingHistoryCopyExerciseID = nil
            case .idle, .loading:
                break
            }
        }
        .sheet(item: $exerciseEditorRequest, onDismiss: { pendingSlotAssignment = nil }) { request in
            ExercisePickerSheet(
                request: request,
                suggestions: suggestionNames,
                approvedExercises: exerciseLibraryStore.exercises
            ) { exerciseName in
                applyExerciseEdit(request, exerciseName: exerciseName)
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: Notification.Name("fwbWorkoutExerciseListRequested"))) { _ in
            guard clientNavigationTabIsSelected, !exercises.isEmpty else { return }
            focusedField = nil
            exerciseNavigationRequest = ExerciseNavigationRequest()
        }
        .sheet(item: $exerciseNavigationRequest, onDismiss: {
            if let target = pendingNavigationTarget {
                scrollRequest = WorkoutScrollRequest(target: target)
                pendingNavigationTarget = nil
            }
        }) { _ in
            WorkoutExerciseNavigationSheet(rows: exerciseNavigationRows) { target in
                pendingNavigationTarget = target
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
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
        .sheet(item: $historyCopyPrompt) { request in
            WorkoutHistoryCopyPromptView(request: request) {
                copyLastWorkout(request.source, to: request.exercise)
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.hidden)
        }
        .confirmationDialog(
            "Replace entered set values?",
            isPresented: Binding(get: { pendingGroupedCopyID != nil }, set: { if !$0 { pendingGroupedCopyID = nil } }),
            titleVisibility: .visible
        ) {
            Button("Copy Previous Set") {
                if let id = pendingGroupedCopyID,
                   let draft = drafts.first(where: { $0.id == id }),
                   let exercise = exercises.first(where: { matches(draft, $0) }) {
                    copyPreviousSet(id, for: exercise)
                }
                pendingGroupedCopyID = nil
            }
            Button("Cancel", role: .cancel) { pendingGroupedCopyID = nil }
        } message: {
            Text("This set will use the previous set’s values and remain editable and incomplete.")
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
                .font(FWBFont.headline)
                .foregroundStyle(Color.fwbLime)
                .frame(width: 42, height: 42)
                .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text("Workout date")
                    .font(FWBFont.footnote.bold())
                    .tracking(0.8)
                    .foregroundStyle(Color.fwbMuted)
                DatePicker("Workout date", selection: $entryDate, in: ...Date(), displayedComponents: .date)
                    .labelsHidden()
                    .tint(Color.fwbLime)
            }
        }
    }

    private var webSyncLabel: some View {
        VStack(alignment: .trailing, spacing: 3) {
            Label(
                seedSession != nil && !seededCopyWasEdited ? "DRAFT READY" : (isAutosaving ? "AUTOSAVING…" : "AUTOSAVE ON"),
                systemImage: isAutosaving ? "arrow.triangle.2.circlepath" : "checkmark.circle.fill"
            )
            .font(FWBFont.footnote.bold())
            .foregroundStyle(Color.fwbLime)

            Text(seedSession != nil && !seededCopyWasEdited ? "EDIT TO AUTOSAVE" : "WEB + IPHONE")
                .font(FWBFont.caption2.weight(.semibold))
                .foregroundStyle(Color.fwbMuted)
        }
        .accessibilityElement(children: .combine)
    }

    private var isCustomWorkout: Bool {
        workout.format.lowercased() == "custom"
    }

    private var customWorkoutFormatBinding: Binding<CustomWorkoutFormat> {
        Binding(
            get: { customWorkoutFormat },
            set: { updateCustomWorkoutFormat($0) }
        )
    }

    @ViewBuilder
    private var customExerciseActions: some View {
        if isCustomWorkout {
            CustomExerciseNameComposer(
                suggestions: suggestionNames,
                approvedExercises: exerciseLibraryStore.exercises,
                format: customWorkoutFormat
            ) { exerciseName, placement in
                let exercise = insertCustomExercise(
                    code: nextAddedExerciseCode(),
                    name: exerciseName,
                    placement: placement
                )
                offerHistoryCopy(for: exercise)
            }
        } else {
            Button {
                exerciseEditorRequest = ExerciseEditorRequest(mode: .add(.currentGroup))
            } label: {
                Label("ADD EXERCISE", systemImage: "plus")
            }
            .buttonStyle(FWBSecondaryButtonStyle())
            .accessibilityIdentifier("workout.addExercise")
        }
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
        WorkoutRoundLayout.sections(exercises: exercises, assignments: groupAssignments, preserveSingleGroups: isCustomWorkout)
    }

    private var exerciseNavigationRows: [WorkoutExerciseNavigationRow] {
        let orderedSections = isCustomWorkout && customWorkoutFormat != .single
            ? WorkoutRoundLayout.groupSlots(sections: sequenceSections, format: customWorkoutFormat).compactMap(\.section)
            : sequenceSections
        return orderedSections.flatMap { section in
            section.exercises.map { exercise in
                let sets = drafts.filter { matches($0, exercise) && !$0.isWarmUp }
                return WorkoutExerciseNavigationRow(
                    id: exercise.id,
                    number: displayExerciseNumber(exercise),
                    title: exercise.name.isEmpty ? "Exercise" : exercise.name,
                    group: section.assignment?.label,
                    completed: sets.filter(\.isCompleted).count,
                    total: sets.count,
                    target: section.assignment == nil ? "workout.exercise.\(exercise.id)" : "workout.group.\(section.id)"
                )
            }
        }
    }

    private var guidedStep: GuidedWorkoutStep? {
        WorkoutSequencePlanner.guidedStep(sections: sequenceSections, drafts: drafts.filter { !$0.isWarmUp })
    }

    private func media(for exercise: Exercise) -> ExerciseMedia {
        let exerciseKey = ExerciseNameIdentity.key(for: exercise.name)
        let approved = exerciseLibraryStore.exercises.first { candidate in
            ExerciseNameIdentity.key(for: candidate.name) == exerciseKey
                || candidate.aliases.contains { ExerciseNameIdentity.key(for: $0) == exerciseKey }
        }

        func url(_ value: String?) -> URL? {
            guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !value.isEmpty else { return nil }
            return URL(string: value)
        }

        let imageURL = url(approved?.imageURL)
        let approvedInstructions = approved?.instructions.trimmingCharacters(in: .whitespacesAndNewlines)
        let displayInstructions = approvedInstructions?.isEmpty == false
            ? approvedInstructions ?? ""
            : exercise.instructionSteps.joined(separator: "\n")
        return ExerciseMedia(
            imageURL: imageURL,
            thumbnailURL: ExerciseMediaURL.thumbnail(for: imageURL),
            motionURL: url(approved?.motionURL),
            primaryMuscle: approved?.primaryMuscle.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            equipment: approved?.equipment.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
            instructions: displayInstructions,
            fallbackDemoURL: exercise.demoURL
        )
    }

    @ViewBuilder
    private func exerciseCard(for exercise: Exercise, initiallyExpanded: Bool? = nil, groupedSummary: Bool = false) -> some View {
        let index = exercises.firstIndex(where: { $0.id == exercise.id }) ?? 0
        let step = guidedStep
        WorkoutExerciseLogCard(
            exercise: exercise,
            media: media(for: exercise),
            groupedSummary: groupedSummary,
            exerciseNumber: displayExerciseNumber(exercise),
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
            approvedExercises: exerciseLibraryStore.exercises,
            substitutedFromName: substitutionOriginals[exercise.code]?.name,
            copySource: copySource(for: exercise),
            isCopyHistoryLoading: achievementHistoryStore.state == .idle
                || achievementHistoryStore.state == .loading,
            copiedDraftIDs: copiedDraftIDs,
            initiallyExpanded: initiallyExpanded
                ?? (isCustomWorkout || index == 0 || step?.exerciseID == exercise.id),
            guidedRoundText: step?.exerciseID == exercise.id
                ? "Round \(step?.round ?? 1) · exercise \(step?.position ?? 1) of \(step?.exerciseCount ?? 1)"
                : nil,
            isGuidedCurrent: step?.exerciseID == exercise.id,
            isSavingProgress: isSyncing && activeExerciseSaveID == exercise.id,
            didSaveProgress: lastSavedExerciseID == exercise.id,
            saveProgressDisabled: isSyncing || logStore.state == .loading,
            onReorderExercise: isCustomWorkout ? {
                sequenceEditorRequest = SequenceEditorRequest()
            } : nil,
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
            onExerciseNameSuggestionSelected: {
                if let renamedExercise = exercises.first(where: { $0.code == exercise.code }) {
                    offerHistoryCopy(for: renamedExercise)
                }
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
        .id("workout.exercise.\(exercise.id)")
    }

    @ViewBuilder
    private func groupedSection(_ section: WorkoutSequenceSection, assignment: WorkoutGroupAssignment) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(assignment.label)
                        .font(FWBFont.sized(24).weight(.bold))
                        .foregroundStyle(Color.fwbWarmWhite)
                    Text(groupInstruction(for: section))
                        .font(FWBFont.footnote)
                        .foregroundStyle(Color.fwbMuted)
                }
                Spacer(minLength: 8)
                Text("\(section.exercises.reduce(0) { $0 + completedRounds(for: section)[$1.id, default: 0] }) / \(section.exercises.reduce(0) { $0 + roundTargets(for: section)[$1.id, default: 0] }) complete")
                    .font(FWBFont.sized(11).weight(.semibold))
                    .foregroundStyle(Color.fwbLime)
            }
            .padding(.vertical, 4)

            ForEach(section.exercises) { exercise in
                exerciseCard(for: exercise, initiallyExpanded: false, groupedSummary: true)
            }

            if isCustomWorkout {
                let target = assignment.kind == .superset ? 2 : 3
                if section.exercises.count < target {
                    Button {
                        pendingSlotAssignment = assignment
                        exerciseEditorRequest = ExerciseEditorRequest(mode: .add(.currentGroup))
                    } label: {
                        Label("Input exercise name here", systemImage: "plus")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(LoggerCompactButtonStyle())
                }
            }

            HStack(spacing: 12) {
                Button {
                    let lastRoundIDs = WorkoutRoundLayout.lastRoundSetIDs(exercises: section.exercises, drafts: drafts)
                    for exercise in section.exercises {
                        for draft in drafts.filter({ matches($0, exercise) && lastRoundIDs.contains($0.id) }) {
                            deleteSet(draft.id, from: exercise)
                        }
                    }
                } label: { Image(systemName: "minus").frame(width: 54, height: 50) }
                .buttonStyle(WorkoutRoundStepperButtonStyle(accented: false))
                .accessibilityLabel("Remove last round")
                .disabled(roundCount(for: section) <= 1)
                HStack(spacing: 12) {
                    Text("ROUNDS")
                        .font(FWBFont.caption.weight(.bold))
                        .tracking(1.1)
                        .foregroundStyle(Color.fwbMuted)
                    Text("\(roundCount(for: section))")
                        .font(FWBFont.sized(22).weight(.bold))
                        .foregroundStyle(Color.fwbWarmWhite)
                }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
                Button {
                    for exercise in section.exercises { addSet(to: exercise) }
                } label: { Image(systemName: "plus").frame(width: 54, height: 50) }
                .buttonStyle(WorkoutRoundStepperButtonStyle(accented: true))
                .accessibilityLabel("Add round")
            }

            let warmUps = drafts.filter { draft in draft.isWarmUp && section.exercises.contains { matches(draft, $0) } }
            if !warmUps.isEmpty {
                VStack(alignment: .leading, spacing: 9) {
                    HStack(alignment: .firstTextBaseline) {
                        Text("Warm-up")
                            .font(FWBFont.sized(18).weight(.bold))
                        Spacer(minLength: 8)
                        Text("OPTIONAL · EXCLUDED FROM WORKING VOLUME")
                            .font(FWBFont.caption2.weight(.bold))
                            .foregroundStyle(Color.fwbMuted)
                            .multilineTextAlignment(.trailing)
                    }
                    LoggerTableHeadings(entryStyle: entryStyle, firstTitle: "Exercise")
                    ForEach(warmUps) { draft in
                        if let exercise = section.exercises.first(where: { matches(draft, $0) }) {
                            groupedSetRow(draft, exercise: exercise, section: section)
                        }
                    }
                }
                .padding(12)
                .background(Color.fwbGold.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(Color.fwbGold)
                        .frame(width: 5)
                }
                .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
            }

            ForEach(1...max(roundCount(for: section), 1), id: \.self) { round in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text("Round \(round)")
                            .font(FWBFont.sized(13).weight(.semibold))
                        Spacer(minLength: 6)
                        if round > 1 {
                            Button {
                                for exercise in section.exercises {
                                    if let draft = drafts.first(where: { matches($0, exercise) && !$0.isWarmUp && $0.setNumber == round }), !draft.containsEntry {
                                        copyPreviousSet(draft.id, for: exercise)
                                    }
                                }
                            } label: {
                                Label("Copy previous", systemImage: "doc.on.doc")
                            }
                            .buttonStyle(LoggerCompactButtonStyle())
                            .accessibilityHint("Copies the previous round into empty sets only")
                        }
                    }
                    LoggerTableHeadings(entryStyle: entryStyle, firstTitle: "Exercise")
                    ForEach(section.exercises) { exercise in
                        if let draft = drafts.first(where: { matches($0, exercise) && !$0.isWarmUp && $0.setNumber == round }) {
                            groupedSetRow(draft, exercise: exercise, section: section)
                        }
                    }
                    let roundDrafts = drafts.filter { draft in !draft.isWarmUp && draft.setNumber == round && section.exercises.contains { matches(draft, $0) } }
                    let completed = !roundDrafts.isEmpty && roundDrafts.allSatisfy(\.isCompleted)
                    Button {
                        for exercise in section.exercises {
                            if let draft = drafts.first(where: { matches($0, exercise) && !$0.isWarmUp && $0.setNumber == round }) {
                                handleSetCompletion(for: exercise, draft: draft, isCompleted: !completed)
                            }
                        }
                    } label: {
                        Label(completed ? "Round complete" : "Log round", systemImage: completed ? "checkmark.circle.fill" : "checkmark")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(LoggerCompactButtonStyle(accented: true))
                    .disabled(!completed && (roundDrafts.isEmpty || !roundDrafts.allSatisfy(WorkoutRoundLayout.canComplete)))
                    .accessibilityIdentifier("workout.group.logRound.\(section.id).\(round)")
                }
                .padding(12)
                .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3, style: .continuous)
                        .fill(Color.fwbLime)
                        .frame(width: 5)
                }
                .overlay { RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
            }

            if let status = roundRestStatus(for: section) {
                WorkoutRoundRestCallout(status: status, restText: roundRestText(for: section), firstExerciseCode: section.exercises.first?.code ?? "1")
            }
            HStack {
                Label(groupSaveStatus.title.capitalized, systemImage: groupSaveStatus.systemImage)
                Spacer(minLength: 4)
                if !roundRestText(for: section).isEmpty {
                    Label(roundRestText(for: section), systemImage: "timer")
                }
            }
            .font(FWBFont.sized(11).weight(.medium))
            .foregroundStyle(Color.fwbMuted)
        }
        .padding(10)
        .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 18))
        .overlay { RoundedRectangle(cornerRadius: 18).stroke(Color.fwbLine, lineWidth: 1) }
        .id("workout.group.\(section.id)")
        .accessibilityIdentifier("workout.group.\(section.id)")
    }

    private func displayExerciseNumber(_ exercise: Exercise) -> Int {
        if isCustomWorkout, let assignment = groupAssignments[exercise.id],
           assignment.id.hasPrefix("CUSTOM_"),
           let number = Int(assignment.label.split(separator: " ").last ?? "") {
            let members = exercises.filter { groupAssignments[$0.id]?.id == assignment.id }
            let position = members.firstIndex(where: { $0.id == exercise.id }) ?? 0
            let count = assignment.kind == .superset ? 2 : 3
            return (number - 1) * count + position + 1
        }
        return (exercises.firstIndex(where: { $0.id == exercise.id }) ?? 0) + 1
    }

    private func groupedSetRow(_ draft: WorkoutSetDraft, exercise: Exercise, section: WorkoutSequenceSection) -> some View {
        let exerciseNumber = displayExerciseNumber(exercise)
        return WorkoutSetLogRow(
            draft: Binding(
                get: { drafts.first(where: { $0.id == draft.id }) ?? draft },
                set: { updated in
                    guard let index = drafts.firstIndex(where: { $0.id == draft.id }) else { return }
                    copiedDraftIDs.remove(draft.id)
                    drafts[index] = updated
                }
            ),
            focusedField: $focusedField,
            entryStyle: entryStyle,
            preferredEffortScale: preferredEffortScale,
            previousResult: PreviousWorkoutResults.sets(for: exercise, before: dateString, in: achievementHistoryStore.sessions)[draft.setNumber],
            isPreviousHistoryLoading: false,
            canCopyPreviousSet: draft.setNumber > 1,
            wasCopied: copiedDraftIDs.contains(draft.id),
            groupCode: String(exerciseNumber),
            onCompletionChanged: { handleSetCompletion(for: exercise, draft: draft, isCompleted: $0) },
            onSetTypeChanged: { updateSetType($0, for: draft.id, in: exercise) },
            onSetLabelChanged: { updateSetLabel($0, for: draft.id, in: exercise) },
            onCopyPreviousSet: {
                if draft.containsEntry { pendingGroupedCopyID = draft.id }
                else { copyPreviousSet(draft.id, for: exercise) }
            },
            onDelete: { deleteSet(draft.id, from: exercise) }
        )
    }

    @ViewBuilder
    private var customBlankSlots: some View {
        if isCustomWorkout && customWorkoutFormat == .single {
            ForEach(exercises.count..<max(exercises.count, 6), id: \.self) { index in
                CustomBlankExerciseSlot(
                    number: index + 1,
                    suggestions: suggestionNames,
                    approvedExercises: exerciseLibraryStore.exercises
                ) { name in
                    let exercise = insertCustomExercise(code: nextAddedExerciseCode(), name: name, placement: .currentGroup)
                    offerHistoryCopy(for: exercise)
                }
            }
        }
    }

    private func blankCustomGroup(number: Int) -> some View {
        let kind: WorkoutGroupKind = customWorkoutFormat == .superset ? .superset : .circuit
        let count = kind == .superset ? 2 : 3
        let assignment = WorkoutGroupAssignment(id: "CUSTOM_\(kind.rawValue.uppercased())_\(number)", kind: kind, label: "\(kind.title) \(number)")
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(assignment.label).font(FWBFont.sized(19).weight(.bold))
                Spacer()
                Text("0 / 0 complete").font(FWBFont.sized(11).weight(.semibold)).foregroundStyle(Color.fwbMuted)
            }
            ForEach(0..<count, id: \.self) { slot in
                CustomBlankExerciseSlot(
                    number: (number - 1) * count + slot + 1,
                    suggestions: suggestionNames,
                    approvedExercises: exerciseLibraryStore.exercises,
                    showsSetGrid: false
                ) { name in
                    let existingAssignments = groupAssignments
                    let exercise = insertCustomExercise(code: nextAddedExerciseCode(), name: name, placement: .currentGroup)
                    groupAssignments = existingAssignments
                    groupAssignments[exercise.id] = assignment
                    offerHistoryCopy(for: exercise)
                }
            }
            Text("3 rounds")
                .font(FWBFont.sized(12).weight(.semibold))
                .foregroundStyle(Color.fwbMuted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 5)
            ForEach(1...3, id: \.self) { round in
                VStack(alignment: .leading, spacing: 4) {
                    Text("Round \(round)").font(FWBFont.sized(12).weight(.semibold))
                    EmptyWorkoutSetGrid(labels: (0..<count).map { String((number - 1) * count + $0 + 1) }, firstTitle: "Exercise")
                }
            }
            Text("Choose exercise names above to enter your rounds.")
                .font(FWBFont.sized(11))
                .foregroundStyle(Color.fwbMuted)
        }
        .padding(12)
        .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 20))
        .overlay { RoundedRectangle(cornerRadius: 20).stroke(Color.fwbLine, lineWidth: 1) }
        .accessibilityIdentifier("customWorkout.blankGroup.\(number)")
    }

    private func roundCount(for section: WorkoutSequenceSection) -> Int {
        WorkoutRoundLayout.roundCount(exercises: section.exercises, drafts: drafts)
    }

    private func groupInstruction(for section: WorkoutSequenceSection) -> String {
        let codes = section.exercises.map { exercise in
            let code = exercise.code.trimmingCharacters(in: .whitespacesAndNewlines)
            return code.isEmpty ? String(displayExerciseNumber(exercise)) : code.uppercased()
        }
        let sequence = codes.joined(separator: " → ")
        let rest = roundRestText(for: section).trimmingCharacters(in: .whitespacesAndNewlines)
        let restText = rest.isEmpty ? "rest as prescribed" : "rest \(rest)"
        return "Complete \(sequence), \(restText), repeat \(max(roundCount(for: section), 1))×"
    }

    private func completedRounds(for section: WorkoutSequenceSection) -> [String: Int] {
        Dictionary(uniqueKeysWithValues: section.exercises.map { exercise in
            let completed = drafts.filter {
                matches($0, exercise) && !$0.isWarmUp && $0.isCompleted
            }.count
            return (exercise.id, completed)
        })
    }

    private func roundTargets(for section: WorkoutSequenceSection) -> [String: Int] {
        Dictionary(uniqueKeysWithValues: section.exercises.map { exercise in
            let target = drafts.filter {
                matches($0, exercise) && !$0.isWarmUp
            }.map(\.setNumber).max() ?? 0
            return (exercise.id, target)
        })
    }

    private var groupSaveStatus: WorkoutGroupSaveStatus {
        if isAutosaving || isSyncing { return .saving }
        if lastAutosavedPersistenceToken == draftPersistenceToken { return .saved }
        return .pending
    }

    private func roundRestStatus(for section: WorkoutSequenceSection) -> String? {
        guard restTimerStore.isVisible,
              restTimerStore.exerciseName == "\(section.label) · between rounds" else { return nil }
        if restTimerStore.phase == .complete { return "REST COMPLETE" }
        return "REST \(restTimerStore.timeLabel)"
    }

    private func canLogGuidedSet(in section: WorkoutSequenceSection) -> Bool {
        guard let step = guidedStep,
              step.sectionID == section.id,
              roundRestStatus(for: section) == nil,
              let exercise = section.exercises.first(where: { $0.id == step.exerciseID }),
              let draft = drafts.first(where: {
                  matches($0, exercise) && !$0.isWarmUp && $0.setNumber == step.round
              }) else { return false }
        return draft.containsEntry && draft.effortValidationMessage == nil
    }

    private func logGuidedSet(_ step: GuidedWorkoutStep) {
        guard let exercise = exercises.first(where: { $0.id == step.exerciseID }),
              let index = drafts.firstIndex(where: {
                  matches($0, exercise) && !$0.isWarmUp && $0.setNumber == step.round
              }),
              drafts[index].containsEntry,
              drafts[index].effortValidationMessage == nil else { return }

        focusedField = nil
        drafts[index].isCompleted = true
        let completedDraft = drafts[index]
        handleSetCompletion(for: exercise, draft: completedDraft, isCompleted: true)
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

    private var autosaveTaskID: String {
        "autosave|\(didLoadSession)|\(seededCopyWasEdited)|\(dateString)|\(draftPersistenceToken)"
    }

    private var isAutosaving: Bool {
        activeAutosaveToken != nil
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

    private var shouldAutosaveProgress: Bool {
        guard (seedSession == nil || seededCopyWasEdited),
              activeSaveIntent == nil,
              activeExerciseSaveID == nil,
              drafts.contains(where: \.containsEntry),
              !drafts.contains(where: { $0.effortValidationMessage != nil }) else { return false }

        return !drafts.contains {
            $0.setType == .timed &&
                $0.containsEntry &&
                (Double($0.duration) ?? 0) <= 0
        }
    }

    private func autosaveProgress(expectedToken: String) async {
        guard expectedToken == draftPersistenceToken,
              shouldAutosaveProgress else { return }

        activeAutosaveToken = expectedToken
        defer {
            if activeAutosaveToken == expectedToken {
                activeAutosaveToken = nil
            }
        }

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
            isFinished: false
        )

        guard !Task.isCancelled else { return }
        if result == .synced || result == .queued {
            lastAutosavedPersistenceToken = expectedToken
            lastSuccessfulSave = .progress
        }
    }

    private func saveWorkout(
        intent: WorkoutSaveIntent,
        exerciseID: String? = nil,
        difficultyRating: Int? = nil
    ) {
        focusedField = nil
        let persistenceTokenAtSave = draftPersistenceToken
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
            lastAutosavedPersistenceToken = persistenceTokenAtSave

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

    private func handleSetCompletion(
        for exercise: Exercise,
        draft: WorkoutSetDraft,
        isCompleted: Bool
    ) {
        guard let draftIndex = drafts.firstIndex(where: { $0.id == draft.id }),
              !isCompleted || WorkoutRoundLayout.canComplete(drafts[draftIndex]) else { return }
        drafts[draftIndex].isCompleted = isCompleted
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
            if !isCustomWorkout || customWorkoutFormat == .single {
                groupAssignments = WorkoutSequencePlanner.normalizedAssignments(
                    exercises: exercises,
                    assignments: groupAssignments
                )
            }
            substitutionOriginals.removeValue(forKey: exercise.code)
        }
    }

    private func applyExerciseEdit(_ request: ExerciseEditorRequest, exerciseName: String) {
        switch request.mode {
        case .add(let placement):
            let priorAssignments = groupAssignments
            let exercise = insertCustomExercise(
                code: nextAddedExerciseCode(),
                name: exerciseName,
                placement: placement
            )
            if let assignment = pendingSlotAssignment {
                groupAssignments = priorAssignments
                groupAssignments[exercise.id] = assignment
                pendingSlotAssignment = nil
            }
            offerHistoryCopy(for: exercise)
        case .substitute(let exercise):
            substituteExercise(exercise, with: exerciseName)
            if let replacement = exercises.first(where: { $0.code == exercise.code }) {
                offerHistoryCopy(for: replacement)
            }
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

    private func insertCustomExercise(
        code: String,
        name: String,
        placement: CustomExercisePlacement
    ) -> Exercise {
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
        drafts.append(contentsOf: (1...3).map { WorkoutSetDraft(exercise: exercise, setNumber: $0) })

        guard isCustomWorkout else { return exercise }
        switch customWorkoutFormat {
        case .single:
            groupAssignments.removeValue(forKey: exercise.id)
        case .superset:
            let existing = exercises.dropLast().compactMap { groupAssignments[$0.id] }.filter { $0.kind == .superset }
            if let openGroup = existing.last(where: { assignment in
                exercises.dropLast().filter { groupAssignments[$0.id]?.id == assignment.id }.count < 2
            }) {
                groupAssignments[exercise.id] = openGroup
            } else {
                let nextNumber = (existing.compactMap { Int($0.label.split(separator: " ").last ?? "") }.max() ?? 0) + 1
                groupAssignments[exercise.id] = WorkoutGroupAssignment(id: "CUSTOM_SUPERSET_\(nextNumber)", kind: .superset, label: "Superset \(nextNumber)")
            }
        case .circuit:
            let assignment: WorkoutGroupAssignment
            if placement == .newCircuit {
                assignment = WorkoutSequencePlanner.nextCustomCircuitAssignment(
                    assignments: groupAssignments
                )
            } else if let lastExercise = exercises.dropLast().last,
                      let currentAssignment = groupAssignments[lastExercise.id],
                      currentAssignment.kind == .circuit {
                assignment = currentAssignment
            } else {
                assignment = WorkoutSequencePlanner.nextCustomCircuitAssignment(
                    assignments: groupAssignments
                )
                if let lastExercise = exercises.dropLast().last {
                    groupAssignments[lastExercise.id] = assignment
                }
            }
            groupAssignments[exercise.id] = assignment
        }
        return exercise
    }

    private func offerHistoryCopy(for exercise: Exercise) {
        pendingHistoryCopyExerciseID = exercise.id
        switch achievementHistoryStore.state {
        case .idle, .loading:
            break
        case .loaded, .failed:
            scheduleHistoryCopyPrompt(for: exercise)
        }
    }

    private func scheduleHistoryCopyPrompt(for exercise: Exercise) {
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 300_000_000)
            guard !Task.isCancelled,
                  pendingHistoryCopyExerciseID == exercise.id,
                  let currentExercise = exercises.first(where: { $0.id == exercise.id }) else { return }
            presentHistoryCopyPrompt(for: currentExercise)
        }
    }

    private func presentHistoryCopyPrompt(for exercise: Exercise) {
        pendingHistoryCopyExerciseID = nil
        guard let source = copySource(for: exercise) else { return }
        historyCopyPrompt = WorkoutHistoryCopyPromptRequest(
            exercise: exercise,
            source: source
        )
    }

    private func updateCustomWorkoutFormat(_ format: CustomWorkoutFormat) {
        guard isCustomWorkout else { return }
        customWorkoutFormat = format
        Self.saveCustomWorkoutFormat(format, for: clientEmail)
        withAnimation(.easeInOut(duration: 0.22)) {
            groupAssignments = format == .circuit
                ? WorkoutRoundLayout.circuitAssignments(exercises: exercises)
                : WorkoutSequencePlanner.customAssignments(for: format, exercises: exercises)
        }
    }

    private static func savedCustomWorkoutFormat(for clientEmail: String) -> CustomWorkoutFormat {
        let rawValue = UserDefaults.standard.string(
            forKey: customWorkoutFormatPreferenceKey(for: clientEmail)
        )
        return CustomWorkoutFormat(rawValue: rawValue ?? "") ?? .single
    }

    private static func saveCustomWorkoutFormat(
        _ format: CustomWorkoutFormat,
        for clientEmail: String
    ) {
        UserDefaults.standard.set(
            format.rawValue,
            forKey: customWorkoutFormatPreferenceKey(for: clientEmail)
        )
    }

    private static func customWorkoutFormatPreferenceKey(for clientEmail: String) -> String {
        let normalizedEmail = clientEmail
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return "fwb.customWorkout.format.\(normalizedEmail)"
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
        if let seedSession {
            if seedLoadedDate == nil {
                exercises = workout.exercises
                drafts = WorkoutHistoryCopyPlan.seedDrafts(session: seedSession, exercises: exercises)
                groupAssignments = [:]
                customWorkoutFormat = .single
                copiedDraftIDs = Set(drafts.map(\.id))
                seedBaselineToken = draftPersistenceToken
            }
            if seedLoadedDate != dateString {
                if seedLoadedDate != nil {
                    drafts = WorkoutHistoryCopyPlan.freshDrafts(drafts, exercises: exercises)
                    copiedDraftIDs = Set(drafts.map(\.id))
                    seededCopyWasEdited = false
                    seedBaselineToken = draftPersistenceToken
                }
                sessionID = UUID()
                baseRemoteUpdatedAt = nil
                seedLoadedDate = dateString
            }
            return
        }

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
            let validExerciseIDs = Set(exercises.map(\.id))
            let validRecoveredAssignments = recovered.restoredGroupAssignments.filter {
                validExerciseIDs.contains($0.key)
            }
            let recoveredAssignments = isCustomWorkout
                ? validRecoveredAssignments
                : WorkoutSequencePlanner.normalizedAssignments(
                    exercises: exercises,
                    assignments: validRecoveredAssignments
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

        if isCustomWorkout {
            if let restoredFormat = WorkoutSequencePlanner.customFormat(from: groupAssignments) {
                customWorkoutFormat = restoredFormat
                Self.saveCustomWorkoutFormat(restoredFormat, for: clientEmail)
            } else {
                groupAssignments = WorkoutSequencePlanner.customAssignments(
                    for: customWorkoutFormat,
                    exercises: exercises
                )
            }
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
        suggestedExercises: [Exercise] = [],
        seedSession: WorkoutHistorySession? = nil
    ) {
        self.init(
            workout: workout,
            clientEmail: clientEmail,
            embedded: embedded,
            suggestedExercises: suggestedExercises,
            seedSession: seedSession
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
                .font(FWBFont.footnote.bold())
                .tracking(1.1)
                .foregroundStyle(Color.fwbLime)

            Text(workout.title.fwbTitleCased)
                .font(FWBFont.sized(23).weight(.bold))

                .foregroundStyle(Color.fwbWarmWhite)
                .lineLimit(2)
                .minimumScaleFactor(0.72)
                .lineSpacing(-3)

            if !workout.focus.isEmpty {
                HStack(alignment: .top, spacing: 9) {
                    Text("FOCUS")
                        .font(FWBFont.footnote.bold())
                        .tracking(0.7)
                        .foregroundStyle(Color.black)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .frame(minHeight: 22)
                        .background(Color.fwbAccentFill, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))

                    Text(workout.focus)
                        .font(FWBFont.footnote.weight(.semibold))
                        .foregroundStyle(Color.fwbWarmWhite)
                        .fixedSize(horizontal: false, vertical: true)

                    Spacer(minLength: 0)
                }
                .padding(10)
                .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
            }

            Text(workout.format.lowercased() == "custom"
                 ? "Add exercises from the library, log sets, and save everything from this page."
                 : workout.format.lowercased() == "mobility"
                    ? "Add stretches and foam-rolling movements from the mobility library, then save your session."
                    : "Open each exercise, log your sets, then save or finish the workout below.")
                .font(FWBFont.footnote)
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
            Text("Active workout")
                .font(FWBFont.footnote.bold())
                .tracking(1.2)
                .foregroundStyle(Color.fwbLime)
            Text(title)
                .font(FWBFont.sized(24).weight(.bold))

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

private struct CustomExerciseNameComposer: View {
    let suggestions: [String]
    let approvedExercises: [ApprovedExercise]
    let format: CustomWorkoutFormat
    let onAdd: (String, CustomExercisePlacement) -> Void

    @State private var exerciseName = ""
    @State private var placement: CustomExercisePlacement = .currentGroup
    @FocusState private var isFocused: Bool

    private var trimmedExerciseName: String {
        exerciseName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var matches: [String] {
        guard !trimmedExerciseName.isEmpty else { return [] }
        return ExerciseSuggestionLibrary.matches(
            query: trimmedExerciseName,
            within: suggestions
        )
    }

    private var hasExactMatch: Bool {
        suggestions.contains {
            $0.caseInsensitiveCompare(trimmedExerciseName) == .orderedSame
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("EXERCISE NAME")
                    .font(FWBFont.headline.weight(.semibold))

                    .foregroundStyle(Color.fwbWarmWhite)
                Text("Start typing to see suggestions, or enter your own exercise name.")
                    .font(FWBFont.footnote)
                    .foregroundStyle(Color.fwbMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if format == .circuit {
                HStack(spacing: 8) {
                    placementButton(
                        title: "CURRENT CIRCUIT",
                        systemImage: "plus",
                        value: .currentGroup
                    )
                    placementButton(
                        title: "NEW CIRCUIT",
                        systemImage: "plus.rectangle.on.rectangle",
                        value: .newCircuit
                    )
                }
            }

            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(Color.fwbLime)
                TextField("Type an exercise name", text: $exerciseName)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .focused($isFocused)
                    .foregroundStyle(Color.fwbWarmWhite)
                    .tint(Color.fwbLime)
                    .onSubmit { addExercise(named: trimmedExerciseName) }
                    .accessibilityIdentifier("customWorkout.exerciseName")

                if !exerciseName.isEmpty {
                    Button {
                        exerciseName = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(Color.fwbMuted)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Clear exercise name")
                }
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 50)
            .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }

            if isFocused && !trimmedExerciseName.isEmpty {
                VStack(spacing: 0) {
                    ForEach(matches, id: \.self) { suggestion in
                        suggestionButton(suggestion)
                        if suggestion != matches.last || !hasExactMatch {
                            FWBRule()
                        }
                    }

                    if !hasExactMatch {
                        Button {
                            addExercise(named: trimmedExerciseName)
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "pencil.line")
                                    .foregroundStyle(Color.fwbLime)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("ADD MANUAL EXERCISE")
                                        .font(FWBFont.caption.weight(.semibold))
                                        .tracking(0.45)
                                        .foregroundStyle(Color.fwbMuted)
                                    Text(trimmedExerciseName.fwbTitleCased)
                                        .font(FWBFont.subheadline.weight(.bold))
                                        .foregroundStyle(Color.fwbWarmWhite)
                                }
                                Spacer(minLength: 8)
                                Image(systemName: "plus")
                                    .font(FWBFont.footnote.weight(.semibold))
                                    .foregroundStyle(Color.fwbLime)
                            }
                            .padding(.horizontal, 12)
                            .frame(minHeight: 50)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Add \(trimmedExerciseName) as a manual exercise")
                        .accessibilityIdentifier("customWorkout.addManualExercise")
                    }
                }
                .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .animation(.easeOut(duration: 0.16), value: matches)
        .onChange(of: format) { nextFormat in
            if nextFormat != .circuit {
                placement = .currentGroup
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("customWorkout.exerciseComposer")
    }

    private func placementButton(
        title: String,
        systemImage: String,
        value: CustomExercisePlacement
    ) -> some View {
        Button {
            placement = value
            isFocused = true
        } label: {
            Label(title, systemImage: systemImage)
                .font(FWBFont.caption.weight(.semibold))

                .foregroundStyle(placement == value ? Color.black : Color.fwbWarmWhite)
                .frame(maxWidth: .infinity, minHeight: 42)
                .background(placement == value ? Color.fwbAccentFill : Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(placement == value ? Color.fwbLime : Color.fwbLine, lineWidth: 1)
                }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(placement == value ? .isSelected : [])
    }

    private func suggestionButton(_ suggestion: String) -> some View {
        Button {
            addExercise(named: suggestion)
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "figure.strengthtraining.traditional")
                    .foregroundStyle(Color.fwbLime)
                ExerciseSuggestionText(
                    name: suggestion,
                    approvedExercises: approvedExercises
                )
                Spacer(minLength: 8)
                Image(systemName: "plus")
                    .font(FWBFont.footnote.weight(.semibold))
                    .foregroundStyle(Color.fwbLime)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 46)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(exerciseSuggestionAccessibilityLabel(
            action: "Add",
            name: suggestion,
            approvedExercises: approvedExercises
        ))
        .accessibilityIdentifier("customWorkout.suggestion.\(suggestionIdentifier(suggestion))")
    }

    private func addExercise(named name: String) {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return }
        onAdd(trimmedName, placement)
        exerciseName = ""
        placement = .currentGroup
        isFocused = true
    }

    private func suggestionIdentifier(_ suggestion: String) -> String {
        suggestion
            .lowercased()
            .replacingOccurrences(of: "[^a-z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }
}

private struct CustomWorkoutFormatPicker: View {
    @Binding var selection: CustomWorkoutFormat

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Text("Choose a format")
                .font(FWBFont.sized(14).weight(.semibold))
            HStack(spacing: 6) {
                ForEach(CustomWorkoutFormat.allCases) { format in
                    Button { selection = format } label: {
                        Text(format.title == "Straight Sets" ? "Straight sets" : format.title)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(LoggerCompactButtonStyle(accented: selection == format))
                    .accessibilityValue(selection == format ? "Selected" : "Not selected")
                    .accessibilityAddTraits(selection == format ? .isSelected : [])
                    .accessibilityIdentifier("customWorkout.format.\(format.rawValue)")
                }
            }
            Text(selection.guide)
                .font(FWBFont.sized(12))
                .foregroundStyle(Color.fwbMuted)
        }
        .padding(12)
        .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).stroke(Color.fwbLine, lineWidth: 1) }
        .accessibilityIdentifier("customWorkout.formatPicker")
    }
}

private struct WorkoutGroupHeader: View {
    let assignment: WorkoutGroupAssignment
    let exercises: [Exercise]
    let roundCount: Int
    let guidedStep: GuidedWorkoutStep?
    let completedRounds: [String: Int]
    let roundTargets: [String: Int]
    let saveStatus: WorkoutGroupSaveStatus
    let roundRestStatus: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(assignment.label.uppercased())
                        .font(FWBFont.footnote.weight(.semibold))
                        .tracking(1.2)
                        .foregroundStyle(Color.fwbLime)
                    Text(roundTitle)
                        .font(FWBFont.sized(20).weight(.bold))

                        .foregroundStyle(Color.fwbWarmWhite)
                }

                Spacer(minLength: 8)

                Label(saveStatus.title, systemImage: saveStatus.systemImage)
                    .font(FWBFont.footnote.weight(.bold))
                    .foregroundStyle(Color.fwbMuted)
                    .lineLimit(1)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(exercises.enumerated()), id: \.element.id) { index, exercise in
                        sequenceItem(exercise: exercise, index: index)
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("workout.groupProgress")
    }

    private var displayRound: Int {
        if roundRestStatus != nil, let guidedStep {
            return max(guidedStep.round - 1, 1)
        }
        return guidedStep?.round ?? max(roundCount, 1)
    }

    private var groupIsComplete: Bool {
        guard roundCount > 0 else { return false }
        return exercises.allSatisfy {
            completedRounds[$0.id, default: 0] >= roundTargets[$0.id, default: roundCount]
        }
    }

    private var roundTitle: String {
        if groupIsComplete { return "ALL ROUNDS COMPLETE" }
        if roundRestStatus != nil { return "ROUND \(displayRound) COMPLETE" }
        return "ROUND \(displayRound) OF \(max(roundCount, 1))"
    }

    private func sequenceItem(exercise: Exercise, index: Int) -> some View {
        let target = roundTargets[exercise.id, default: roundCount]
        let isDone = completedRounds[exercise.id, default: 0] >= min(displayRound, target)
        let isNext = guidedStep?.exerciseID == exercise.id && roundRestStatus == nil
        let status = groupIsComplete || isDone ? "DONE" : isNext ? "NEXT" : "WAIT"
        let color = groupIsComplete || isDone ? Color.green : isNext ? Color.fwbLime : Color.fwbMuted

        return VStack(alignment: .leading, spacing: 5) {
            Rectangle()
                .fill(color)
                .frame(height: 3)

            Text("\(displayCode(for: exercise, index: index)) · \(status)")
                .font(FWBFont.footnote.weight(.semibold))
                .tracking(0.45)
                .foregroundStyle(color)
                .lineLimit(1)

            Text(exercise.name.isEmpty ? "Exercise" : exercise.name.fwbTitleCased)
                .font(FWBFont.footnote.weight(.semibold))
                .foregroundStyle(groupIsComplete || isDone || isNext ? Color.fwbWarmWhite : Color.fwbMuted)
                .lineLimit(1)
        }
        .frame(width: exercises.count == 2 ? 142 : 126, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(displayCode(for: exercise, index: index)), \(exercise.name), \(status.lowercased())")
    }

    private func displayCode(for exercise: Exercise, index: Int) -> String {
        let rawCode = exercise.code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if !rawCode.isEmpty, !rawCode.hasPrefix("CW"), !rawCode.hasPrefix("ADD") {
            return rawCode
        }
        if assignment.kind == .circuit { return "C\(index + 1)" }
        let number = Int(assignment.label.split(separator: " ").last ?? "1") ?? 1
        let scalar = UnicodeScalar(64 + min(max(number, 1), 26)).map(String.init) ?? "A"
        return "\(scalar)\(index + 1)"
    }
}

private struct WorkoutRoundRestCallout: View {
    let status: String
    let restText: String
    let firstExerciseCode: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "timer")
                .font(FWBFont.headline.weight(.semibold))
                .foregroundStyle(Color.fwbLime)

            VStack(alignment: .leading, spacing: 2) {
                Text(status)
                    .font(FWBFont.footnote.weight(.semibold))
                    .tracking(0.7)
                    .foregroundStyle(Color.fwbLime)
                Text("Rest \(restText), then return to \(firstExerciseCode).")
                    .font(FWBFont.footnote.weight(.semibold))
                    .foregroundStyle(Color.fwbWarmWhite)
            }

            Spacer(minLength: 0)
        }
        .padding(12)
        .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLime, lineWidth: 1) }
        .accessibilityElement(children: .combine)
    }
}

private struct WorkoutGroupFooter: View {
    let assignment: WorkoutGroupAssignment
    let exercises: [Exercise]
    let guidedStep: GuidedWorkoutStep?
    let canLogCurrentSet: Bool
    let onLogCurrentSet: (GuidedWorkoutStep) -> Void

    var body: some View {
        VStack(spacing: 8) {
            if let guidedStep {
                Button {
                    onLogCurrentSet(guidedStep)
                } label: {
                    Text(actionTitle(for: guidedStep))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(FWBPrimaryButtonStyle())
                .disabled(!canLogCurrentSet)
                .accessibilityHint(canLogCurrentSet ? "Logs this set and opens the next exercise" : "Enter weight or reps for the current set first")
                .accessibilityIdentifier("workout.group.logSet")

                Text("No rest until the full \(assignment.kind.title.lowercased()) round is complete.")
                    .font(FWBFont.caption.weight(.semibold))
                    .foregroundStyle(Color.fwbMuted)
                    .multilineTextAlignment(.center)
            } else {
                Text(assignment.label.uppercased())
                    .font(FWBFont.footnote.weight(.semibold))
                    .tracking(0.7)
                    .foregroundStyle(Color.fwbLime)
            }
        }
    }

    private func actionTitle(for step: GuidedWorkoutStep) -> String {
        let nextLabel: String
        if step.position < exercises.count {
            nextLabel = displayCode(index: step.position)
        } else if step.round < step.roundCount {
            nextLabel = displayCode(index: 0)
        } else {
            return "LOG SET · FINISH GROUP"
        }
        return "LOG SET · NEXT: \(nextLabel)"
    }

    private func displayCode(index: Int) -> String {
        guard exercises.indices.contains(index) else { return "NEXT" }
        let rawCode = exercises[index].code.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        if !rawCode.isEmpty, !rawCode.hasPrefix("CW"), !rawCode.hasPrefix("ADD") {
            return rawCode
        }
        if assignment.kind == .circuit { return "C\(index + 1)" }
        let number = Int(assignment.label.split(separator: " ").last ?? "1") ?? 1
        let scalar = UnicodeScalar(64 + min(max(number, 1), 26)).map(String.init) ?? "A"
        return "\(scalar)\(index + 1)"
    }
}

private struct WorkoutExerciseNavigationSheet: View {
    @Environment(\.dismiss) private var dismiss
    let rows: [WorkoutExerciseNavigationRow]
    let onSelect: (String) -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 7) {
                    ForEach(rows) { row in
                        Button {
                            onSelect(row.target)
                            dismiss()
                        } label: {
                            HStack(spacing: 10) {
                                Text("\(row.number)")
                                    .font(FWBFont.sized(12).weight(.semibold))
                                    .foregroundStyle(Color.fwbWarmWhite)
                                    .frame(width: 32, height: 32)
                                    .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 9))
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(row.title)
                                        .font(FWBFont.sized(14).weight(.semibold))
                                        .foregroundStyle(Color.fwbWarmWhite)
                                    if let group = row.group {
                                        Text(group).font(FWBFont.sized(11)).foregroundStyle(Color.fwbMuted)
                                    }
                                }
                                Spacer(minLength: 5)
                                Text("\(row.completed)/\(row.total)")
                                    .font(FWBFont.sized(11).weight(.medium))
                                    .foregroundStyle(Color.fwbMuted)
                                Image(systemName: row.total > 0 && row.completed == row.total ? "checkmark.circle.fill" : "chevron.right")
                                    .font(FWBFont.sized(12).weight(.semibold))
                                    .foregroundStyle(Color.fwbLime)
                            }
                            .padding(.horizontal, 10)
                            .frame(minHeight: 58)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 12))
                            .overlay { RoundedRectangle(cornerRadius: 12).stroke(Color.fwbLine, lineWidth: 1) }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(row.title), \(row.completed) of \(row.total) sets complete")
                        .accessibilityHint("Jump to this \(row.group == nil ? "exercise" : "group") in your workout")
                        .accessibilityIdentifier("workout.exerciseJump.\(row.id)")
                    }
                }
                .padding(16)
            }
            .background(Color.fwbBackground.ignoresSafeArea())
            .navigationTitle("Workout exercises")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .accessibilityIdentifier("workout.exerciseNavigation")
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
                        .font(FWBFont.subheadline)
                        .foregroundStyle(Color.fwbMuted)
                        .listRowBackground(Color.fwbCard)
                }

                Section("WORKOUT ORDER") {
                    ForEach(exercises) { exercise in
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(exercise.name.fwbTitleCased)
                                    .font(FWBFont.headline.weight(.bold))
                                    .foregroundStyle(Color.fwbWarmWhite)
                                Text(exercise.code.uppercased())
                                    .font(FWBFont.footnote.weight(.semibold))
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
                .font(FWBFont.footnote.weight(.semibold))
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
                    .font(FWBFont.headline.weight(.bold))
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
                    .font(FWBFont.footnote.weight(.semibold))
                    .lineLimit(1)
                Image(systemName: "chevron.up.chevron.down")
                    .font(FWBFont.caption.bold())
            }
            .foregroundStyle(assignments[exercise.id] == nil ? Color.fwbMuted : Color.fwbLime)
            .padding(.horizontal, 10)
            .frame(minHeight: 38)
            .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
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

private struct WorkoutHistoryCopyPromptView: View {
    @Environment(\.dismiss) private var dismiss

    let request: WorkoutHistoryCopyPromptRequest
    let onCopy: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("EXERCISE HISTORY")
                            .font(FWBFont.footnote.weight(.semibold))
                            .tracking(1.3)
                            .foregroundStyle(Color.fwbLime)
                        Text("COPY LAST WORKOUT?")
                            .font(FWBFont.sized(24).weight(.bold))

                            .foregroundStyle(Color.fwbWarmWhite)
                    }

                    Spacer(minLength: 0)

                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(FWBFont.headline.weight(.semibold))
                            .foregroundStyle(Color.fwbWarmWhite)
                            .frame(width: 42, height: 42)
                            .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
                            .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Start fresh")
                }

                Text("You logged \(request.exercise.name.fwbTitleCased) before. Copy those set values into today’s workout?")
                    .font(FWBFont.subheadline.weight(.semibold))
                    .foregroundStyle(Color.fwbMuted)
                    .fixedSize(horizontal: false, vertical: true)

                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(Self.formattedDate(request.source.entryDate).uppercased())
                            .font(FWBFont.headline.weight(.semibold))

                            .foregroundStyle(Color.fwbWarmWhite)
                        Text(request.source.workoutTitle.uppercased())
                            .font(FWBFont.caption.weight(.bold))
                            .tracking(0.5)
                            .foregroundStyle(Color.fwbMuted)
                            .lineLimit(2)
                    }

                    HStack(spacing: 6) {
                        promptHeading("SET", width: 48)
                        promptHeading("WEIGHT", width: nil)
                        promptHeading("REPS", width: 66)
                        promptHeading("RIR", width: 54)
                    }

                    VStack(spacing: 6) {
                        ForEach(Array(request.source.records.enumerated()), id: \.offset) { _, record in
                            HStack(spacing: 6) {
                                promptValue(Self.setLabel(for: record), width: 48)
                                promptValue(Self.formatted(record.weightUsed), width: nil)
                                promptValue(record.reps.map(Self.formatted) ?? "—", width: 66)
                                promptValue(Self.rirValue(for: record), width: 54)
                            }
                        }
                    }
                }
                .padding(14)
                .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLime.opacity(0.65), lineWidth: 1) }

                Button("COPY LAST WORKOUT") {
                    onCopy()
                    dismiss()
                }
                .buttonStyle(FWBPrimaryButtonStyle())
                .accessibilityIdentifier("workout.historyCopy.copy")

                Button("START FRESH") {
                    dismiss()
                }
                .buttonStyle(FWBSecondaryButtonStyle())
                .accessibilityIdentifier("workout.historyCopy.fresh")

                Text("You can edit every copied value before finishing the workout.")
                    .font(FWBFont.caption)
                    .foregroundStyle(Color.fwbMuted)
                    .frame(maxWidth: .infinity, alignment: .center)
            }
            .padding(FWBLayout.pagePadding)
        }
        .background(Color.fwbBackground.ignoresSafeArea())
    }

    private func promptHeading(_ text: String, width: CGFloat?) -> some View {
        Text(text)
            .font(FWBFont.caption2.weight(.semibold))
            .tracking(0.55)
            .foregroundStyle(Color.fwbMuted)
            .frame(maxWidth: width == nil ? .infinity : nil)
            .frame(width: width)
    }

    private func promptValue(_ text: String, width: CGFloat?) -> some View {
        Text(text)
            .font(FWBFont.subheadline.weight(.semibold))
            .foregroundStyle(Color.fwbWarmWhite)
            .frame(maxWidth: width == nil ? .infinity : nil)
            .frame(width: width)
            .frame(minHeight: 48)
            .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
    }

    private static func setLabel(for record: WorkoutHistoryRecord) -> String {
        record.resolvedSetType == .warmUp ? "W" : String(record.setNumber)
    }

    private static func rirValue(for record: WorkoutHistoryRecord) -> String {
        guard record.effortScale == .rir, let value = record.effortValue else { return "—" }
        return formatted(value)
    }

    private static func formatted(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

    private static func formattedDate(_ entryDate: String) -> String {
        let parser = DateFormatter()
        parser.calendar = Calendar(identifier: .gregorian)
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.dateFormat = "yyyy-MM-dd"
        guard let date = parser.date(from: entryDate) else { return entryDate }
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}

private struct WorkoutExerciseLogCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let exercise: Exercise
    let media: ExerciseMedia
    let groupedSummary: Bool
    let exerciseNumber: Int
    @Binding var drafts: [WorkoutSetDraft]
    @FocusState.Binding var focusedField: WorkoutLogFocus?
    let entryStyle: WorkoutEntryStyle
    let preferredEffortScale: WorkoutEffortScale
    let previousSets: [Int: PreviousWorkoutResult]
    let isPreviousHistoryLoading: Bool
    let editableName: Binding<String>?
    let suggestions: [String]
    let approvedExercises: [ApprovedExercise]
    let substitutedFromName: String?
    let copySource: WorkoutExerciseCopySource?
    let isCopyHistoryLoading: Bool
    let copiedDraftIDs: Set<UUID>
    let guidedRoundText: String?
    let isGuidedCurrent: Bool
    let isSavingProgress: Bool
    let didSaveProgress: Bool
    let saveProgressDisabled: Bool
    let onReorderExercise: (() -> Void)?
    let onAddSet: () -> Void
    let onDeleteSet: (UUID) -> Void
    let onCopyLastWorkout: (WorkoutExerciseCopySource) -> Void
    let onCopyPreviousSet: (UUID) -> Void
    let onDraftEdited: (UUID) -> Void
    let onSetCompletionChanged: (WorkoutSetDraft, Bool) -> Void
    let onInsertWarmUps: ([WarmUpSetPlan]) -> Void
    let onSetTypeChanged: (UUID, WorkoutSetType) -> Void
    let onSetLabelChanged: (UUID, String) -> Void
    let onExerciseNameSuggestionSelected: () -> Void
    let onSubstituteExercise: () -> Void
    let onRevertSubstitution: () -> Void
    let onDeleteExercise: () -> Void
    let onSaveProgress: () -> Void
    let onSendFormCheck: () -> Void

    @State private var isExpanded: Bool
    @State private var areInstructionsExpanded = false
    @State private var pendingCopyRequest: WorkoutCopyRequest?
    @State private var calculatorRequest: WorkoutCalculatorKind?
    @State private var mediaViewerRequest: ExerciseMediaViewerRequest?

    init(
        exercise: Exercise,
        media: ExerciseMedia,
        groupedSummary: Bool,
        exerciseNumber: Int,
        drafts: Binding<[WorkoutSetDraft]>,
        focusedField: FocusState<WorkoutLogFocus?>.Binding,
        entryStyle: WorkoutEntryStyle,
        preferredEffortScale: WorkoutEffortScale,
        previousSets: [Int: PreviousWorkoutResult],
        isPreviousHistoryLoading: Bool,
        editableName: Binding<String>?,
        suggestions: [String],
        approvedExercises: [ApprovedExercise],
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
        onReorderExercise: (() -> Void)?,
        onAddSet: @escaping () -> Void,
        onDeleteSet: @escaping (UUID) -> Void,
        onCopyLastWorkout: @escaping (WorkoutExerciseCopySource) -> Void,
        onCopyPreviousSet: @escaping (UUID) -> Void,
        onDraftEdited: @escaping (UUID) -> Void,
        onSetCompletionChanged: @escaping (WorkoutSetDraft, Bool) -> Void,
        onInsertWarmUps: @escaping ([WarmUpSetPlan]) -> Void,
        onSetTypeChanged: @escaping (UUID, WorkoutSetType) -> Void,
        onSetLabelChanged: @escaping (UUID, String) -> Void,
        onExerciseNameSuggestionSelected: @escaping () -> Void,
        onSubstituteExercise: @escaping () -> Void,
        onRevertSubstitution: @escaping () -> Void,
        onDeleteExercise: @escaping () -> Void,
        onSaveProgress: @escaping () -> Void,
        onSendFormCheck: @escaping () -> Void
    ) {
        self.exercise = exercise
        self.media = media
        self.groupedSummary = groupedSummary
        self.exerciseNumber = exerciseNumber
        _drafts = drafts
        _focusedField = focusedField
        self.entryStyle = entryStyle
        self.preferredEffortScale = preferredEffortScale
        self.previousSets = previousSets
        self.isPreviousHistoryLoading = isPreviousHistoryLoading
        self.editableName = editableName
        self.suggestions = suggestions
        self.approvedExercises = approvedExercises
        self.substitutedFromName = substitutedFromName
        self.copySource = copySource
        self.isCopyHistoryLoading = isCopyHistoryLoading
        self.copiedDraftIDs = copiedDraftIDs
        self.guidedRoundText = guidedRoundText
        self.isGuidedCurrent = isGuidedCurrent
        self.isSavingProgress = isSavingProgress
        self.didSaveProgress = didSaveProgress
        self.saveProgressDisabled = saveProgressDisabled
        self.onReorderExercise = onReorderExercise
        self.onAddSet = onAddSet
        self.onDeleteSet = onDeleteSet
        self.onCopyLastWorkout = onCopyLastWorkout
        self.onCopyPreviousSet = onCopyPreviousSet
        self.onDraftEdited = onDraftEdited
        self.onSetCompletionChanged = onSetCompletionChanged
        self.onInsertWarmUps = onInsertWarmUps
        self.onSetTypeChanged = onSetTypeChanged
        self.onSetLabelChanged = onSetLabelChanged
        self.onExerciseNameSuggestionSelected = onExerciseNameSuggestionSelected
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
                if let onReorderExercise {
                    Button(action: onReorderExercise) {
                        Image(systemName: "circle.grid.2x3.fill")
                            .font(FWBFont.sized(14))
                            .foregroundStyle(Color.fwbMuted)
                            .frame(width: 30, height: groupedSummary ? 86 : 96)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Reorder \(exercise.name)")
                    .accessibilityHint("Opens exercise and group ordering")
                }

                if media.imageURL != nil {
                    exerciseThumbnail
                }

                Button {
                    withAnimation(.easeOut(duration: 0.18)) {
                        isExpanded.toggle()
                    }
                } label: {
                    VStack(alignment: .leading, spacing: 5) {
                        exerciseCodeBadge
                        Text(exercise.name.isEmpty ? "Exercise" : exercise.name.fwbTitleCased)
                            .font(FWBFont.sized(groupedSummary ? 15 : 17).weight(.bold))
                            .foregroundStyle(Color.fwbWarmWhite)
                            .multilineTextAlignment(.leading)
                            .lineLimit(3)
                            .minimumScaleFactor(0.82)
                        if !exercise.prescription.isEmpty {
                            Text(exercise.prescription)
                                .font(FWBFont.footnote)
                                .foregroundStyle(Color.fwbMuted)
                        }
                        if !mediaMetadata.isEmpty {
                            Text(mediaMetadata)
                                .font(FWBFont.caption2)
                                .foregroundStyle(Color.fwbMuted)
                                .lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(exercise.name), \(isExpanded ? "collapse" : "expand")")

                if media.hasVisual {
                    Button {
                        mediaViewerRequest = ExerciseMediaViewerRequest(
                            exerciseName: exercise.name,
                            media: media
                        )
                    } label: {
                        Image(systemName: "info")
                            .font(FWBFont.sized(13).weight(.bold))
                            .foregroundStyle(Color.fwbWarmWhite)
                            .frame(width: 40, height: 40)
                            .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay {
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .stroke(Color.fwbWarmWhite, lineWidth: 2)
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Open exercise guide for \(exercise.name)")
                } else if let url = media.fallbackDemoURL {
                    Link(destination: url) {
                        Image(systemName: "play.rectangle")
                            .font(FWBFont.sized(16).weight(.semibold))
                            .foregroundStyle(Color.fwbLime)
                            .frame(width: 44, height: 44)
                    }
                    .accessibilityLabel("Watch \(exercise.name) demo")
                }

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

                    Button(action: onSendFormCheck) {
                        Label("Send form check", systemImage: "video.badge.plus")
                    }
                    .accessibilityIdentifier("formCheck.open.\(accessibilityExerciseID)")
                    if entryStyle == .strength && exercise.supportsBarbellCalculators {
                        Button { calculatorRequest = .plates } label: {
                            Label("Plate calculator", systemImage: "circle.grid.cross")
                        }
                        .accessibilityIdentifier("workout.plateCalculator.\(accessibilityExerciseID)")
                        Button { calculatorRequest = .warmUp } label: {
                            Label("Warm-up sets", systemImage: "flame")
                        }
                        .accessibilityIdentifier("workout.warmUpCalculator.\(accessibilityExerciseID)")
                    }
                    Button(action: onSaveProgress) {
                        Label(didSaveProgress ? "Progress saved" : "Save progress", systemImage: "tray.and.arrow.down")
                    }
                    .disabled(saveProgressDisabled || !hasExerciseEntry)
                    Button(role: .destructive, action: onDeleteExercise) {
                        Label("Remove Exercise", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(FWBFont.headline)
                        .foregroundStyle(Color.fwbWarmWhite)
                        .frame(width: 44, height: 44)
                        .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
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
                        approvedExercises: approvedExercises,
                        onSuggestionSelected: onExerciseNameSuggestionSelected,
                        accessibilityIdentifier: "customWorkout.exercise.\(exercise.code)"
                    )
                }

                HStack(spacing: 6) {
                    Button {
                        withAnimation(.easeOut(duration: 0.18)) { areInstructionsExpanded.toggle() }
                    } label: {
                        Label("Instructions", systemImage: "info.circle")
                    }
                    .buttonStyle(LoggerCompactButtonStyle())
                    .accessibilityIdentifier("exercise.instructions.\(exercise.id)")
                    Spacer(minLength: 0)
                    copyLastWorkoutControl
                }

                if areInstructionsExpanded {
                    VStack(alignment: .leading, spacing: 7) {
                        ForEach(Array(exercise.instructionSteps.prefix(5).enumerated()), id: \.offset) { index, step in
                            Text("\(index + 1). \(step)")
                        }
                        if !exercise.rest.isEmpty { Text("Rest: \(exercise.rest)") }
                    }
                    .font(FWBFont.sized(12))
                    .foregroundStyle(Color.fwbMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                if !groupedSummary {
                let matchingDrafts = exerciseDrafts
                VStack(spacing: 6) {
                    LoggerTableHeadings(entryStyle: entryStyle)

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
                            onCopyPreviousSet: { requestCopyPreviousSet(draft) },
                            onDelete: { onDeleteSet(draft.id) }
                        )
                    }
                }

                if matchingDrafts.isEmpty {
                    Text("No sets yet. Add one when you’re ready.")
                        .font(FWBFont.footnote)
                        .foregroundStyle(Color.fwbMuted)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 14)
                }

                HStack(spacing: 10) {
                    Button(action: onAddSet) {
                        Label("Add set", systemImage: "plus")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(WorkoutSetActionButtonStyle(color: Color.blue))
                    .accessibilityIdentifier("workout.addSet.\(exercise.id)")

                    Button(role: .destructive) {
                        guard let lastDraft = matchingDrafts.last else { return }
                        onDeleteSet(lastDraft.id)
                    } label: {
                        Text("Delete set")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(WorkoutSetActionButtonStyle(color: Color.fwbRed))
                    .disabled(matchingDrafts.isEmpty)
                    .accessibilityIdentifier("workout.deleteLastSet.\(exercise.id)")
                }

                HStack(spacing: 6) {
                    Text(entryStyle == .mobility ? "\(formatted(totalTime)) sec · \(formatted(totalReps)) rounds" : "\(formatted(volume)) lb volume · \(formatted(totalReps)) reps")
                        .font(FWBFont.sized(11).weight(.medium))
                        .foregroundStyle(Color.fwbMuted)
                    Spacer(minLength: 4)
                    Button(action: onSaveProgress) {
                        Label(isSavingProgress ? "Saving…" : didSaveProgress ? "Saved" : "Save", systemImage: didSaveProgress ? "checkmark" : "tray.and.arrow.down")
                    }
                    .buttonStyle(LoggerCompactButtonStyle())
                    .disabled(saveProgressDisabled || !hasExerciseEntry)
                    .accessibilityIdentifier("workout.saveProgress.\(exercise.id)")
                }
                }

            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(groupedSummary ? 8 : 12)
        .background(groupedSummary ? Color.fwbSurface : Color.fwbCard, in: RoundedRectangle(cornerRadius: groupedSummary ? 12 : 20))
        .overlay { RoundedRectangle(cornerRadius: groupedSummary ? 12 : 20).stroke(Color.fwbLine, lineWidth: 1) }
        .overlay {
            if isGuidedCurrent && !groupedSummary {
                RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLime, lineWidth: 2)
            }
        }
        .onChange(of: isGuidedCurrent) { isCurrent in
            guard isCurrent, !groupedSummary else { return }
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
        .sheet(item: $mediaViewerRequest) { request in
            ExerciseMediaViewer(request: request)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    private var exerciseThumbnail: some View {
        Button {
            mediaViewerRequest = ExerciseMediaViewerRequest(
                exerciseName: exercise.name,
                media: media
            )
        } label: {
            ZStack(alignment: .bottomTrailing) {
                ExerciseRemoteImage(urls: media.thumbnailURLs, animated: false)
                    .frame(width: groupedSummary ? 112 : 124, height: groupedSummary ? 86 : 96)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

                Image(systemName: "info")
                    .font(FWBFont.sized(10).weight(.bold))
                    .foregroundStyle(Color.fwbWarmWhite)
                    .frame(width: 28, height: 28)
                    .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 7, style: .continuous)
                            .stroke(Color.fwbWarmWhite, lineWidth: 1.5)
                    }
                    .padding(6)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("View exercise guide for \(exercise.name)")
        .accessibilityHint("Opens the full start and end card with exercise instructions")
    }

    private var exerciseCodeBadge: some View {
        Text(displayCode)
            .font(FWBFont.footnote.weight(.bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .frame(minHeight: 28)
            .background(Color.fwbLime, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(alignment: .leading) {
                Rectangle()
                    .fill(Color.fwbGold)
                    .frame(width: 4)
                    .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
            }
            .accessibilityLabel("Exercise \(displayCode)")
    }

    private var displayCode: String {
        let trimmed = exercise.code.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? String(exerciseNumber) : trimmed.uppercased()
    }

    private var mediaMetadata: String {
        [media.primaryMuscle, media.equipment]
            .map { $0.fwbTitleCased }
            .filter { !$0.isEmpty }
            .joined(separator: "  |  ")
    }

    private var copyLastWorkoutControl: some View {
        Button { requestCopyLastWorkout() } label: {
            Label("Copy last", systemImage: "doc.on.doc")
        }
        .buttonStyle(LoggerCompactButtonStyle(accented: copySource != nil))
        .disabled(copySource == nil)
        .accessibilityLabel("Copy last workout")
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

@MainActor
private final class ExerciseRemoteImageLoader: ObservableObject {
    @Published private(set) var image: UIImage?
    @Published private(set) var isLoading = false

    private static let cache = NSCache<NSString, UIImage>()

    func load(urls: [URL], animated: Bool) async {
        guard !urls.isEmpty else { return }
        let key = NSString(string: "\(animated ? "motion" : "still")|\(urls.map(\.absoluteString).joined(separator: "|"))")
        if let cached = Self.cache.object(forKey: key) {
            image = cached
            return
        }

        isLoading = true
        defer { isLoading = false }

        for url in urls {
            guard !Task.isCancelled else { return }
            do {
                let request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: 20)
                let (data, response) = try await URLSession.shared.data(for: request)
                guard !Task.isCancelled,
                      let http = response as? HTTPURLResponse,
                      (200..<300).contains(http.statusCode),
                      let decoded = Self.decode(data: data, animated: animated) else { continue }
                Self.cache.setObject(decoded, forKey: key, cost: data.count)
                image = decoded
                return
            } catch is CancellationError {
                return
            } catch {
                continue
            }
        }
    }

    private static func decode(data: Data, animated: Bool) -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else {
            return UIImage(data: data)
        }
        let frameCount = CGImageSourceGetCount(source)
        guard animated, frameCount > 1 else {
            return thumbnail(from: source, at: 0)
        }

        var images: [UIImage] = []
        var duration: TimeInterval = 0
        images.reserveCapacity(frameCount)
        for index in 0..<frameCount {
            guard let image = thumbnail(from: source, at: index) else { continue }
            images.append(image)
            duration += frameDuration(source: source, index: index)
        }
        guard !images.isEmpty else { return nil }
        return UIImage.animatedImage(with: images, duration: max(duration, Double(images.count) * 0.08))
    }

    private static func thumbnail(from source: CGImageSource, at index: Int) -> UIImage? {
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 1_200,
            kCGImageSourceShouldCacheImmediately: true
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, index, options as CFDictionary) else { return nil }
        return UIImage(cgImage: cgImage)
    }

    private static func frameDuration(source: CGImageSource, index: Int) -> TimeInterval {
        guard let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [String: Any] else { return 0.1 }
        let delay = recursiveDelay(in: properties)
        return delay >= 0.02 ? delay : 0.1
    }

    private static func recursiveDelay(in dictionary: [String: Any]) -> TimeInterval {
        for key in ["UnclampedDelayTime", "DelayTime"] {
            if let number = dictionary[key] as? NSNumber { return number.doubleValue }
        }
        for value in dictionary.values {
            if let nested = value as? [String: Any] {
                let delay = recursiveDelay(in: nested)
                if delay > 0 { return delay }
            }
        }
        return 0
    }
}

private struct ExerciseRemoteImage: View {
    @StateObject private var loader = ExerciseRemoteImageLoader()
    let urls: [URL]
    let animated: Bool

    init(url: URL?, animated: Bool) {
        urls = url.map { [$0] } ?? []
        self.animated = animated
    }

    init(urls: [URL], animated: Bool) {
        self.urls = urls
        self.animated = animated
    }

    var body: some View {
        ZStack {
            Color.fwbSurface
            if let image = loader.image {
                ExerciseUIImageView(image: image)
            } else if loader.isLoading {
                ProgressView()
                    .tint(Color.fwbLime)
            } else {
                Image(systemName: "figure.strengthtraining.traditional")
                    .font(FWBFont.sized(24))
                    .foregroundStyle(Color.fwbMuted)
            }
        }
        .clipped()
        .task(id: cacheIdentity) {
            await loader.load(urls: urls, animated: animated)
        }
    }

    private var cacheIdentity: String {
        "\(animated)|\(urls.map(\.absoluteString).joined(separator: "|"))"
    }
}

private struct ExerciseUIImageView: UIViewRepresentable {
    let image: UIImage

    func makeUIView(context: Context) -> UIImageView {
        let imageView = UIImageView()
        imageView.contentMode = .scaleAspectFit
        imageView.clipsToBounds = true
        return imageView
    }

    func updateUIView(_ imageView: UIImageView, context: Context) {
        imageView.image = image
        if image.images != nil {
            imageView.startAnimating()
        } else {
            imageView.stopAnimating()
        }
    }
}

private struct ExerciseMediaViewer: View {
    @Environment(\.dismiss) private var dismiss
    let request: ExerciseMediaViewerRequest
    @State private var isShowingVideo = false
    @State private var player: AVPlayer?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Group {
                        if isShowingVideo, let player {
                            VideoPlayer(player: player)
                                .onAppear { player.play() }
                                .accessibilityLabel("Video demonstration for \(request.exerciseName)")
                        } else {
                            ExerciseRemoteImage(urls: preferredURLs, animated: false)
                                .accessibilityLabel("Static start and end reference for \(request.exerciseName)")
                        }
                    }
                    .aspectRatio(1904 / 826, contentMode: .fit)
                    .frame(maxWidth: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .stroke(Color.fwbLine, lineWidth: 1)
                    }

                    Text(request.exerciseName.fwbTitleCased)
                        .font(FWBFont.title3.weight(.bold))
                        .foregroundStyle(Color.fwbWarmWhite)

                    Text(isShowingVideo ? "EXERCISE VIDEO DEMONSTRATION" : "STATIC START / END FORM REFERENCE")
                        .font(FWBFont.caption.weight(.semibold))
                        .tracking(0.5)
                        .foregroundStyle(Color.fwbMuted)

                    if let videoURL {
                        Button {
                            if isShowingVideo {
                                player?.pause()
                                player = nil
                                isShowingVideo = false
                            } else {
                                player = AVPlayer(url: videoURL)
                                isShowingVideo = true
                            }
                        } label: {
                            Label(
                                isShowingVideo ? "Show static card" : "Watch exercise video",
                                systemImage: isShowingVideo ? "photo" : "play.fill"
                            )
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(FWBPrimaryButtonStyle())
                    }

                    if !request.media.instructions.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("HOW TO PERFORM")
                                .font(FWBFont.caption.weight(.bold))
                                .tracking(0.7)
                                .foregroundStyle(Color.fwbLime)

                            Text(request.media.instructions)
                                .font(FWBFont.body)
                                .foregroundStyle(Color.fwbWarmWhite)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }

                    if let demoURL = request.media.fallbackDemoURL {
                        Link(destination: demoURL) {
                            Label("Open additional exercise reference", systemImage: "arrow.up.right.square")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(FWBSecondaryButtonStyle())
                    }
                }
                .padding(16)
            }
            .background(Color.fwbBackground.ignoresSafeArea())
            .navigationTitle("Exercise guide")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .onDisappear { player?.pause() }
        }
    }

    private var videoURL: URL? {
        guard ExerciseMediaURL.isVideo(request.media.motionURL) else { return nil }
        return request.media.motionURL
    }

    private var preferredURLs: [URL] {
        [request.media.imageURL].compactMap { $0 }
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
                        .font(FWBFont.subheadline.weight(.bold))
                    Text("EXERCISE INSTRUCTIONS")
                        .font(FWBFont.footnote.weight(.semibold))
                        .tracking(0.7)
                    Spacer()
                    Image(systemName: isExpanded ? "minus" : "plus")
                        .font(FWBFont.footnote.weight(.semibold))
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
                                .font(FWBFont.footnote.weight(.semibold))
                                .foregroundStyle(.black)
                                .frame(width: 22, height: 22)
                                .background(Color.fwbAccentFill, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))

                            Text(step)
                                .font(FWBFont.footnote)
                                .foregroundStyle(Color.fwbWarmWhite)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }

                    if !exercise.rest.isEmpty {
                        Label("Rest: \(exercise.rest)", systemImage: "timer")
                            .font(FWBFont.footnote.weight(.semibold))
                            .foregroundStyle(Color.fwbMuted)
                    }
                }
                .padding(12)
            }
        }
        .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
    }
}

private struct WorkoutSubstitutionBanner: View {
    let originalName: String
    let onRevert: () -> Void
    let accessibilityExerciseID: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "arrow.left.arrow.right")
                .font(FWBFont.subheadline.weight(.semibold))
                .foregroundStyle(.black)
                .frame(width: 34, height: 34)
                .background(Color.fwbAccentFill, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text("SUBSTITUTED")
                    .font(FWBFont.footnote.weight(.semibold))
                    .tracking(0.9)
                    .foregroundStyle(Color.fwbLime)
                Text("In place of \(originalName)")
                    .font(FWBFont.footnote.weight(.semibold))
                    .foregroundStyle(Color.fwbWarmWhite)
                    .lineLimit(2)
            }

            Spacer(minLength: 4)

            Button("RESTORE", action: onRevert)
                .font(FWBFont.footnote.weight(.semibold))
                .tracking(0.6)
                .foregroundStyle(Color.fwbLime)
                .padding(.horizontal, 10)
                .frame(minHeight: 34)
                .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLime, lineWidth: 1) }
                .accessibilityLabel("Restore \(originalName)")
                .accessibilityIdentifier("workout.revertSubstitution.\(accessibilityExerciseID).banner")
        }
        .padding(12)
        .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLime.opacity(0.75), lineWidth: 1) }
        .accessibilityIdentifier("workout.substitutionBadge.\(accessibilityExerciseID)")
    }
}

private struct TableHeading: View {
    let text: String
    let width: CGFloat?

    var body: some View {
        Text(text)
            .font(FWBFont.footnote.bold())
            .tracking(0.7)
            .foregroundStyle(Color.fwbMuted)
            .lineLimit(1)
            .minimumScaleFactor(0.65)
            .frame(maxWidth: width == nil ? .infinity : nil)
            .frame(width: width, alignment: .center)
    }
}

private struct WorkoutSetActionButtonStyle: ButtonStyle {
    let color: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(FWBFont.sized(12).weight(.semibold))

            .foregroundStyle(color)
            .frame(minHeight: 44)
            .background(Color.fwbCard.opacity(configuration.isPressed ? 0.72 : 1), in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(color.opacity(0.9), lineWidth: 1) }
            .opacity(configuration.isPressed ? 0.82 : 1)
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
    var groupCode: String? = nil
    let onCompletionChanged: (Bool) -> Void
    let onSetTypeChanged: (WorkoutSetType) -> Void
    let onSetLabelChanged: (String) -> Void
    let onCopyPreviousSet: () -> Void
    let onDelete: () -> Void
    @State private var rirRequest: WorkoutRIRRequest?
    @State private var isNoteVisible = false

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 5) {
                if let groupCode {
                    Button { onCompletionChanged(!draft.isCompleted) } label: {
                        Text(groupCode)
                            .font(FWBFont.sized(14).weight(.semibold))
                            .foregroundStyle(Color.fwbWarmWhite)
                            .frame(width: 40, height: 44)
                            .background(draft.isCompleted ? Color.fwbAccentFill : Color.fwbSurface, in: RoundedRectangle(cornerRadius: 9))
                    }
                    .buttonStyle(.plain)
                    .disabled(!draft.containsEntry)
                    .accessibilityLabel("\(draft.exerciseName), \(setAccessibilityName), \(draft.isCompleted ? "reopen" : "mark complete")")
                } else {
                    EditableSetLabelField(draft: $draft, focus: $focusedField, onCommit: onSetLabelChanged)
                        .frame(width: 40)
                }

                if entryStyle == .strength && draft.setType == .timed {
                    NumericLogField(placeholder: "0", suffix: "sec", text: $draft.duration, focus: $focusedField, focusValue: .duration(draft.id))
                    NumericLogField(placeholder: "0", suffix: "lb", text: $draft.weight, focus: $focusedField, focusValue: .weight(draft.id))
                } else {
                    NumericLogField(placeholder: "0", suffix: entryStyle.firstSuffix, text: $draft.weight, focus: $focusedField, focusValue: .weight(draft.id))
                    NumericLogField(placeholder: "0", suffix: entryStyle.secondSuffix, text: $draft.reps, focus: $focusedField, focusValue: .reps(draft.id))
                }

                Button {
                    focusedField = nil
                    rirRequest = WorkoutRIRRequest(id: draft.id)
                } label: {
                    Text(rirDisplayValue)
                        .font(FWBFont.sized(14).weight(.semibold))
                        .foregroundStyle(Color.fwbWarmWhite)
                        .frame(width: 48, height: 44)
                        .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 9))
                        .overlay { RoundedRectangle(cornerRadius: 9).stroke(Color.fwbLine, lineWidth: 1) }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Choose reps in reserve for \(setAccessibilityName.lowercased())")
                .accessibilityValue(draft.effortScale == .rir && !draft.effort.isEmpty ? rirDisplayValue : "Not selected")
                .accessibilityHint(WorkoutEffortScale.rir.explanation)
                .accessibilityIdentifier("workout.rir.\(draft.id)")

                Button {
                    guard draft.containsEntry || draft.isCompleted else { return }
                    onCompletionChanged(!draft.isCompleted)
                } label: {
                    Image(systemName: "checkmark")
                        .font(FWBFont.sized(14).weight(.semibold))
                        .foregroundStyle(draft.isCompleted ? Color.black : Color.fwbMuted)
                        .frame(width: 44, height: 44)
                        .background(draft.isCompleted ? Color.fwbAccentFill : Color.fwbSurface, in: RoundedRectangle(cornerRadius: 9))
                        .overlay { RoundedRectangle(cornerRadius: 9).stroke(Color.fwbLine, lineWidth: 1) }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(setAccessibilityName), \(draft.isCompleted ? "reopen" : "mark complete")")
                .accessibilityHint("Touch and hold for note, copy, set type, and delete options")
                .accessibilityIdentifier("workout.completeSet.\(draft.id)")
                .contextMenu {
                    setActions
                }
                .accessibilityAction(named: "Add note") { isNoteVisible = true; focusedField = .note(draft.id) }
                .accessibilityAction(named: "Copy previous set") { if canCopyPreviousSet { onCopyPreviousSet() } }
                .accessibilityAction(named: "Delete set", onDelete)

            }

            if previousResult != nil {
                PreviousSetResultView(result: previousResult, entryStyle: entryStyle, isLoading: isPreviousHistoryLoading)
            }

            if isNoteVisible || !draft.notes.isEmpty {
                TextField("Note for this set", text: $draft.notes, axis: .vertical)
                    .font(FWBFont.sized(12))
                    .foregroundStyle(Color.fwbWarmWhite)
                    .focused($focusedField, equals: .note(draft.id))
                    .padding(8)
                    .frame(minHeight: 40)
                    .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 8))
                    .accessibilityLabel("Set note")
            }

            if let message = draft.effortValidationMessage {
                Label(message, systemImage: "exclamationmark.triangle.fill")
                    .font(FWBFont.sized(11))
                    .foregroundStyle(Color.fwbRed)
                    .accessibilityIdentifier("workout.effortError.\(draft.id)")
            }
            if wasCopied {
                Label("Copied · tap a field to edit", systemImage: "pencil")
                    .font(FWBFont.sized(10).weight(.medium))
                    .foregroundStyle(Color.fwbLime)
                    .accessibilityIdentifier("workout.copiedSet.\(draft.id)")
            }
        }
        .padding(.vertical, 2)
        .sheet(item: $rirRequest) { _ in
            WorkoutRIRSelectionSheet(draft: $draft)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    @ViewBuilder
    private var setActions: some View {
        Button { isNoteVisible = true; focusedField = .note(draft.id) } label: {
            Label("Add note", systemImage: "note.text")
        }
        Button(action: onCopyPreviousSet) {
            Label("Copy previous set", systemImage: "doc.on.doc")
        }
        .disabled(!canCopyPreviousSet)
        Menu("Set type") {
            ForEach(WorkoutSetType.allCases, id: \.self) { type in
                Button(type.title) { onSetTypeChanged(type) }
            }
        }
        Button(role: .destructive, action: onDelete) { Label("Delete set", systemImage: "trash") }
    }

    private var rirDisplayValue: String {
        guard draft.effortScale == .rir,
              let value = Double(draft.effort.trimmingCharacters(in: .whitespacesAndNewlines)) else { return "—" }
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
            .font(FWBFont.sized(14).weight(.semibold))
            .foregroundStyle(Color.fwbWarmWhite)
            .focused($focus, equals: .set(draft.id))
            .frame(height: 44)
            .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
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
                        .font(FWBFont.footnote.weight(.semibold))
                        .tracking(1)
                        .foregroundStyle(Color.fwbLime)
                    Text("HOW MANY MORE REPS?")
                        .font(FWBFont.sized(23).weight(.bold))

                        .foregroundStyle(Color.fwbWarmWhite)
                }
                Spacer(minLength: 8)
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(FWBFont.headline.weight(.bold))
                        .frame(width: 40, height: 40)
                        .background(Color.fwbSurface, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close RIR choices")
            }

            Text("If you kept going, how many more good-form reps could you have completed?")
                .font(FWBFont.subheadline.weight(.semibold))
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: 6) {
                ForEach(Self.options, id: \.value) { option in
                    Button {
                        selection = option.value
                    } label: {
                        HStack(spacing: 14) {
                            Text(option.value == 4 ? "4+" : String(option.value))
                                .font(FWBFont.sized(17).weight(.semibold))
                                .frame(width: 34, alignment: .leading)
                            Text(option.label)
                                .font(FWBFont.subheadline.weight(.bold))
                            Spacer()
                            if selection == option.value {
                                Image(systemName: "checkmark")
                                    .font(FWBFont.headline.weight(.semibold))
                            }
                        }
                        .foregroundStyle(selection == option.value ? Color.black : Color.fwbWarmWhite)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 48)
                        .background(selection == option.value ? Color.fwbAccentFill : Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
                        .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(selection == option.value ? Color.fwbLime : Color.fwbLine, lineWidth: 1) }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(option.value == 4 ? "Four or more" : option.label) reps in reserve")
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("RIR MEANS REPS IN RESERVE")
                    .font(FWBFont.footnote.weight(.semibold))
                    .tracking(0.5)
                    .foregroundStyle(Color.fwbLime)
                Text("It estimates how many additional reps you could have completed with good form.")
                    .font(FWBFont.footnote)
                    .foregroundStyle(Color.fwbMuted)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }

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
        .padding(FWBLayout.pagePadding)
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
                .font(FWBFont.caption.weight(.semibold))
                .tracking(0.4)
                .foregroundStyle(Color.fwbLime)

            TextField(displayedScale.rangeLabel, text: $draft.effort)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .font(FWBFont.subheadline.weight(.bold))
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
                .font(FWBFont.caption2.weight(.semibold))
                .tracking(0.7)
                .foregroundStyle(Color.fwbLime)
            Text(summary)
                .font(FWBFont.caption.weight(.semibold))
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
                        .font(FWBFont.sized(10))
                        .foregroundStyle(Color.fwbMuted)
                }
            }

            VStack(alignment: .leading, spacing: 3) {
                label
                value
                if let result {
                    Text(Self.date(result.entryDate))
                        .font(FWBFont.sized(10))
                        .foregroundStyle(Color.fwbMuted)
                }
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 3)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.fwbSurface.opacity(0.72))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private var label: some View {
        Text("Last")
            .font(FWBFont.sized(10).weight(.semibold))

            .foregroundStyle(Color.fwbLime)
            .lineLimit(1)
    }

    private var value: some View {
        Text(valueText)
            .font(FWBFont.sized(10).weight(.medium))
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
                    .font(FWBFont.caption2.weight(.semibold))
                Text(selection.compactTitle)
                    .font(FWBFont.caption2.weight(.semibold))
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
    @FocusState private var isFocused: Bool

    var body: some View {
        TextField(placeholder, text: $text)
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.center)
            .font(FWBFont.sized(14).weight(.semibold))
            .foregroundStyle(Color.fwbWarmWhite)
            .focused($isFocused)
            .padding(.horizontal, 5)
        .frame(maxWidth: .infinity)
        .frame(minHeight: 44)
        .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
        .accessibilityIdentifier(focusValue.accessibilityIdentifier)
        .accessibilityHint(suffix)
        .onAppear {
            isFocused = focus == focusValue
        }
        .onChange(of: focus) { nextFocus in
            let shouldFocus = nextFocus == focusValue
            if isFocused != shouldFocus {
                isFocused = shouldFocus
            }
        }
        .onChange(of: isFocused) { nextIsFocused in
            if nextIsFocused {
                if focus != focusValue {
                    focus = focusValue
                }
            } else if focus == focusValue {
                focus = nil
            }
        }
    }
}

private struct LoggerMetric: View {
    let title: String
    let value: String
    let suffix: String

    var body: some View {
        VStack(spacing: 3) {
            Text(title)
                .font(FWBFont.footnote.bold())
                .tracking(0.5)
                .foregroundStyle(Color.fwbMuted)
            Text(suffix.isEmpty ? value : "\(value) \(suffix)")
                .font(FWBFont.footnote.weight(.semibold))

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
                        .font(FWBFont.footnote.bold())
                        .tracking(1)
                        .foregroundStyle(Color.fwbLime)
                    Text("Keep the session moving.")
                        .font(FWBFont.sized(17).weight(.semibold))

                }
                Spacer()
                Image(systemName: "figure.strengthtraining.traditional")
                    .font(FWBFont.title2)
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
                .font(FWBFont.footnote.bold())
                .tracking(0.4)
                .foregroundStyle(Color.fwbMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            Text(value)
                .font(FWBFont.footnote.weight(.semibold))

                .foregroundStyle(Color.fwbWarmWhite)
                .lineLimit(1)
                .minimumScaleFactor(0.95)
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, minHeight: 62)
        .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
    }
}

private struct LoggerEmptyState: View {
    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "plus.square.dashed")
                .font(FWBFont.largeTitle)
                .foregroundStyle(Color.fwbLime)
            Text("Add your first exercise")
                .font(FWBFont.headline.weight(.semibold))
            Text("Build this workout as you go.")
                .font(FWBFont.footnote)
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
    let approvedExercises: [ApprovedExercise]
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
                            .font(FWBFont.sized(24).weight(.bold))

                            .foregroundStyle(Color.fwbWarmWhite)

                        Text(instructionText)
                            .font(FWBFont.subheadline)
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
                        .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
                        .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }

                        LazyVGrid(columns: categoryColumns, alignment: .leading, spacing: 8) {
                            ForEach(categoryOptions, id: \.self) { category in
                                Button {
                                    selectedCategory = category
                                } label: {
                                    Text(category.uppercased())
                                        .font(FWBFont.footnote.weight(.semibold))
                                        .tracking(0.45)
                                        .multilineTextAlignment(.center)
                                        .foregroundStyle(selectedCategory == category ? Color.black : Color.fwbLime)
                                        .padding(.horizontal, 8)
                                        .frame(maxWidth: .infinity, minHeight: 48)
                                        .background(
                                            selectedCategory == category ? Color.fwbAccentFill : Color.clear,
                                            in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous)
                                        )
                                        .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLime, lineWidth: 1) }
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
                                    .font(FWBFont.footnote.weight(.semibold))
                                    .tracking(0.8)
                                    .foregroundStyle(Color.fwbLime)
                                Spacer()
                                Text("\(visibleSuggestions.count) RESULTS")
                                    .font(FWBFont.footnote.weight(.bold))
                                    .foregroundStyle(Color.fwbMuted)
                            }
                            .padding(12)

                            FWBRule()

                            if visibleSuggestions.isEmpty {
                                Text("No library match. You can add the typed name as a custom exercise below.")
                                    .font(FWBFont.footnote)
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
                                                    .font(FWBFont.subheadline.weight(.bold))
                                                    .foregroundStyle(Color.black)
                                                    .frame(width: 34, height: 34)
                                                    .background(Color.fwbAccentFill, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))

                                                ExerciseSuggestionText(
                                                    name: suggestion,
                                                    approvedExercises: approvedExercises,
                                                    fallbackSubtitle: (ExerciseLibrary.category(for: suggestion) ?? "Program & history").uppercased()
                                                )

                                                Spacer(minLength: 6)
                                                Image(systemName: "plus")
                                                    .font(FWBFont.footnote.weight(.semibold))
                                                    .foregroundStyle(Color.fwbLime)
                                            }
                                            .padding(.horizontal, 12)
                                            .frame(minHeight: 58)
                                            .contentShape(Rectangle())
                                        }
                                        .buttonStyle(.plain)
                                        .accessibilityLabel(exerciseSuggestionAccessibilityLabel(
                                            action: "Add",
                                            name: suggestion,
                                            approvedExercises: approvedExercises
                                        ))

                                        if suggestion != visibleSuggestions.last {
                                            FWBRule()
                                        }
                                    }
                                }
                            }
                        }
                        .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
                        .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }

                        if case .substitute(let exercise) = request.mode {
                            Label(
                                "Replacing \(exercise.name) keeps its logged weights, reps, notes, and completed sets.",
                                systemImage: "arrow.left.arrow.right"
                            )
                            .font(FWBFont.footnote.weight(.semibold))
                            .foregroundStyle(Color.fwbMuted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
                            .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
                        }

                        if canSave && !isExactSuggestion {
                            Label(
                                "Exact name not required. This will be saved as a manual exercise.",
                                systemImage: "pencil.line"
                            )
                            .font(FWBFont.footnote.weight(.semibold))
                            .foregroundStyle(Color.fwbMuted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
                            .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
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
                    .padding(FWBLayout.pagePadding)
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
            .font(FWBFont.footnote.weight(.semibold))
            .foregroundStyle(color)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(color.opacity(0.7), lineWidth: 1) }
    }
}

private struct ExerciseNameAutocompleteField: View {
    @Binding var text: String
    let suggestions: [String]
    let approvedExercises: [ApprovedExercise]
    var autoFocus = false
    var onSuggestionSelected: () -> Void = {}
    let accessibilityIdentifier: String

    @FocusState private var isFocused: Bool

    private var matches: [String] {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        return ExerciseSuggestionLibrary.matches(query: text, within: suggestions)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Exercise name", text: $text)
                .textInputAutocapitalization(.words)
                .focused($isFocused)
                .textFieldStyle(FWBTextFieldStyle())
                .accessibilityIdentifier(accessibilityIdentifier)


            if isFocused && !matches.isEmpty {
                VStack(spacing: 0) {
                    ForEach(matches, id: \.self) { suggestion in
                        Button {
                            text = suggestion
                            onSuggestionSelected()
                            isFocused = false
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: "figure.strengthtraining.traditional")
                                    .foregroundStyle(Color.fwbLime)
                                ExerciseSuggestionText(
                                    name: suggestion,
                                    approvedExercises: approvedExercises
                                )
                                Spacer()
                            }
                            .padding(.horizontal, 12)
                            .frame(minHeight: 42)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(exerciseSuggestionAccessibilityLabel(
                            action: "Use",
                            name: suggestion,
                            approvedExercises: approvedExercises
                        ))
                        .accessibilityIdentifier("workout.exercisePicker.suggestion.\(suggestionIdentifier(suggestion))")

                        if suggestion != matches.last {
                            FWBRule()
                        }
                    }
                }
                .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
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

// Blank slots belong to the builder UI until the user supplies a name. They never
// enter the persisted exercise or set arrays, so autosave cannot create empty logs.
private struct CustomBlankExerciseSlot: View {
    let number: Int
    let suggestions: [String]
    let approvedExercises: [ApprovedExercise]
    var showsSetGrid = true
    let onAdd: (String) -> Void
    @State private var name = ""
    @FocusState private var isFocused: Bool

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text("\(number)")
                    .font(FWBFont.sized(12).weight(.semibold))
                    .frame(width: 28, height: 28)
                    .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 8))
                TextField("Input exercise name here", text: $name)
                    .font(FWBFont.sized(14))
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .focused($isFocused)
                    .submitLabel(.done)
                    .onSubmit { commit(trimmedName) }
                    .accessibilityLabel("Exercise \(number) name")
                    .accessibilityHint("Choose or enter a name before editing weight, reps, or effort.")
                    .accessibilityIdentifier("customWorkout.blankExercise.\(number)")
                if !trimmedName.isEmpty {
                    Button { commit(trimmedName) } label: { Image(systemName: "plus.circle.fill").frame(width: 44, height: 44) }
                        .buttonStyle(.plain)
                        .foregroundStyle(Color.fwbLime)
                        .accessibilityLabel("Add \(trimmedName)")
                }
            }
            .frame(minHeight: 44)
            if isFocused && !trimmedName.isEmpty {
                ForEach(Array(ExerciseSuggestionLibrary.matches(query: trimmedName, within: suggestions).prefix(5)), id: \.self) { suggestion in
                    Button { commit(suggestion) } label: {
                        ExerciseSuggestionText(
                            name: suggestion,
                            approvedExercises: approvedExercises
                        )
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .font(FWBFont.sized(13))
                    .buttonStyle(.plain)
                }
            }
            if showsSetGrid {
                EmptyWorkoutSetGrid(labels: ["1", "2", "3"])
                Text("Choose an exercise name to enter your sets.")
                    .font(FWBFont.sized(11))
                    .foregroundStyle(Color.fwbMuted)
            }
        }
        .padding(12)
        .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: 14))
        .overlay { RoundedRectangle(cornerRadius: 14).stroke(Color.fwbLine, lineWidth: 1) }
    }

    private func commit(_ value: String) {
        guard !value.isEmpty else { return }
        onAdd(value)
        name = ""
        isFocused = false
    }
}

// Read-only placeholders show the pending grid without presenting inactive
// text fields or buttons as editable workout entries.
private struct EmptyWorkoutSetGrid: View {
    let labels: [String]
    var firstTitle = "Set"

    var body: some View {
        VStack(spacing: 5) {
            LoggerTableHeadings(entryStyle: .strength, firstTitle: firstTitle)
            ForEach(Array(labels.enumerated()), id: \.offset) { _, label in
                HStack(spacing: 5) {
                    cell(label).frame(width: 40)
                    cell("—").frame(maxWidth: .infinity)
                    cell("—").frame(maxWidth: .infinity)
                    cell("—").frame(width: 48)
                    Image(systemName: "checkmark")
                        .font(FWBFont.sized(14).weight(.semibold))
                        .foregroundStyle(Color.fwbMuted.opacity(0.35))
                        .frame(width: 44, height: 44)
                        .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 9))
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(labels.count) empty \(firstTitle == "Set" ? "sets" : "exercise rows")")
        .accessibilityHint("Choose an exercise name above to enter weight, reps, and reps in reserve.")
    }

    private func cell(_ label: String) -> some View {
        Text(label)
            .font(FWBFont.sized(13).weight(.medium))
            .foregroundStyle(Color.fwbMuted.opacity(0.6))
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(Color.fwbSurface.opacity(0.65), in: RoundedRectangle(cornerRadius: 9))
            .overlay { RoundedRectangle(cornerRadius: 9).stroke(Color.fwbLine.opacity(0.6), lineWidth: 1) }
    }
}

private struct WorkoutRoundStepperButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    let accented: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(FWBFont.title3.weight(.bold))
            .foregroundStyle(accented ? Color.black : Color.fwbWarmWhite)
            .background(accented ? Color.fwbAccentFill : Color.fwbCard, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(accented ? Color.fwbWarmWhite : Color.fwbLine, lineWidth: accented ? 2 : 1.5)
            }
            .opacity(isEnabled ? (configuration.isPressed ? 0.72 : 1) : 0.35)
    }
}

private struct LoggerCompactButtonStyle: ButtonStyle {
    var accented = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(FWBFont.sized(12).weight(.semibold))
            .lineLimit(1)
            .foregroundStyle(accented ? Color.black : Color.fwbWarmWhite)
            .padding(.horizontal, 9)
            .frame(minHeight: 44)
            .background(accented ? Color.fwbAccentFill : Color.fwbSurface, in: RoundedRectangle(cornerRadius: 10))
            .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.fwbLine, lineWidth: 1) }
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

private struct LoggerTableHeadings: View {
    let entryStyle: WorkoutEntryStyle
    var firstTitle = "Set"
    var body: some View {
        HStack(spacing: 5) {
            Text(firstTitle)
                .font(FWBFont.sized(firstTitle == "Exercise" ? 9 : 10).weight(.semibold))
                .minimumScaleFactor(0.7)
                .frame(width: 40)
            Text(entryStyle == .mobility ? "Seconds" : "Weight").frame(maxWidth: .infinity)
            Text(entryStyle == .mobility ? "Rounds" : "Reps").frame(maxWidth: .infinity)
            Text("RIR").frame(width: 48)
            Image(systemName: "checkmark").frame(width: 44)
        }
        .font(FWBFont.sized(10).weight(.semibold))
        .foregroundStyle(Color.fwbMuted)
        .lineLimit(1)
        .padding(.vertical, 4)
        .accessibilityHidden(true)
    }
}

// Round calculations exclude the reserved 1000+ warm-up set numbers and preserve
// intentionally unequal assigned set counts. Kept pure for focused regression tests.
enum WorkoutRoundLayout {
    static func roundCount(exercises: [Exercise], drafts: [WorkoutSetDraft]) -> Int {
        workingDrafts(exercises: exercises, drafts: drafts).map(\.setNumber).max() ?? 0
    }

    static func lastRoundSetIDs(exercises: [Exercise], drafts: [WorkoutSetDraft]) -> Set<UUID> {
        let working = workingDrafts(exercises: exercises, drafts: drafts)
        guard let lastRound = working.map(\.setNumber).max() else { return [] }
        return Set(working.filter { $0.setNumber == lastRound }.map(\.id))
    }

    static func canComplete(_ draft: WorkoutSetDraft) -> Bool {
        draft.containsEntry && draft.effortValidationMessage == nil
            && (draft.setType != .timed || draft.durationValue > 0)
    }

    static func sections(exercises: [Exercise], assignments: [String: WorkoutGroupAssignment], preserveSingleGroups: Bool) -> [WorkoutSequenceSection] {
        WorkoutSequencePlanner.sections(exercises: exercises, assignments: assignments).map { section in
            let assignment = section.assignment ?? (preserveSingleGroups ? section.exercises.first.flatMap { assignments[$0.id] } : nil)
            return WorkoutSequenceSection(id: section.id, assignment: assignment, exercises: section.exercises)
        }
    }

    struct GroupSlot: Identifiable {
        let id: String
        let number: Int
        let section: WorkoutSequenceSection?
    }

    static func groupSlots(sections: [WorkoutSequenceSection], format: CustomWorkoutFormat) -> [GroupSlot] {
        let kind = format == .superset ? "SUPERSET" : "CIRCUIT"
        let prefix = "CUSTOM_\(kind)_"
        var numbered: [Int: WorkoutSequenceSection] = [:]
        var additional: [WorkoutSequenceSection] = []
        for section in sections {
            if let id = section.assignment?.id, id.hasPrefix(prefix),
               let number = Int(id.dropFirst(prefix.count)), number > 0,
               numbered[number] == nil {
                numbered[number] = section
            } else {
                additional.append(section)
            }
        }
        let maximum = max(5, numbered.keys.max() ?? 0)
        let slots = (1...maximum).map { number in
            GroupSlot(id: "\(prefix)\(number)", number: number, section: numbered[number])
        }
        return slots + additional.enumerated().map { index, section in
            GroupSlot(id: section.id, number: maximum + index + 1, section: section)
        }
    }

    static func circuitAssignments(exercises: [Exercise]) -> [String: WorkoutGroupAssignment] {
        Dictionary(uniqueKeysWithValues: exercises.enumerated().map { index, exercise in
            let number = index / 3 + 1
            return (exercise.id, WorkoutGroupAssignment(id: "CUSTOM_CIRCUIT_\(number)", kind: .circuit, label: "Circuit \(number)"))
        })
    }

    private static func workingDrafts(exercises: [Exercise], drafts: [WorkoutSetDraft]) -> [WorkoutSetDraft] {
        drafts.filter { draft in
            !draft.isWarmUp && exercises.contains { $0.code == draft.exerciseCode && $0.name == draft.exerciseName }
        }
    }
}

// A new plan is created once when Copy Workout is tapped. Its distinct title is
// also required for legacy date/title storage, independent of the fresh UUID.
struct WorkoutHistoryCopyPlan: Identifiable {
    let id: UUID
    let workout: Workout
    let session: WorkoutHistorySession

    init(session: WorkoutHistorySession) {
        let id = UUID()
        self.id = id
        self.session = session
        let sourceExercises = Self.copyableExercises(session)
        let exercises = sourceExercises.enumerated().map { index, source in
            Exercise(
                code: String(format: "CW%02d", index + 1),
                name: source.name,
                prescription: "\(source.records.filter { !$0.isWarmUp }.count) sets",
                rest: ""
            )
        }
        workout = Workout(
            id: id,
            title: "Copy of \(session.workoutTitle) · \(id.uuidString.prefix(8).lowercased())",
            focus: "Copied from \(session.entryDate)",
            format: "custom",
            exercises: exercises
        )
    }

    static func seedDrafts(session: WorkoutHistorySession, exercises: [Exercise]) -> [WorkoutSetDraft] {
        zip(copyableExercises(session), exercises).flatMap { source, exercise in
            var workingNumber = 0
            var warmUpNumber = 0
            return source.records.map { record in
                let setNumber: Int
                if record.isWarmUp {
                    warmUpNumber += 1
                    setNumber = WorkoutSetNumber.warmUp(warmUpNumber)
                } else {
                    workingNumber += 1
                    setNumber = workingNumber
                }
                return WorkoutSetDraft(
                    exercise: exercise,
                    setNumber: setNumber,
                    weight: number(record.weightUsed),
                    reps: record.reps.map(number) ?? "",
                    duration: record.durationSeconds.map(number) ?? "",
                    notes: record.notes ?? "",
                    effortScale: record.effortScale,
                    effort: record.effortValue.map(number) ?? "",
                    isCompleted: false,
                    setType: record.resolvedSetType
                )
            }
        }
    }

    static func freshDrafts(_ drafts: [WorkoutSetDraft], exercises: [Exercise]) -> [WorkoutSetDraft] {
        drafts.map { draft in
            let exercise = exercises.first { $0.code == draft.exerciseCode && $0.name == draft.exerciseName }
                ?? Exercise(code: draft.exerciseCode, name: draft.exerciseName)
            return WorkoutSetDraft(
                exercise: exercise,
                setNumber: draft.setNumber,
                weight: draft.weight,
                reps: draft.reps,
                duration: draft.duration,
                notes: draft.notes,
                effortScale: draft.effortScale,
                effort: draft.effort,
                isCompleted: false,
                setType: draft.setType
            )
        }
    }

    private static func copyableExercises(_ session: WorkoutHistorySession) -> [WorkoutHistoryExercise] {
        let records = session.records.filter {
            !$0.isCardio && $0.exerciseCode.caseInsensitiveCompare("WARMUP") != .orderedSame
        }
        return WorkoutHistorySession(entryDate: session.entryDate, workoutTitle: session.workoutTitle, records: records).exercises
    }

    private static func number(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%g", value)
    }
}
