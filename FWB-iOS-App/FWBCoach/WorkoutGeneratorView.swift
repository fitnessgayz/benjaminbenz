import SwiftUI

/// Generates and previews a session without changing any workout or log.
struct WorkoutGeneratorView: View {
    let clientEmail: String
    let suggestedExercises: [Exercise]
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @StateObject private var libraryStore = ExerciseLibraryStore()
    @StateObject private var historyStore = WorkoutHistoryStore()
    @State private var preferences = WorkoutGenerationPreferences()
    @State private var strengthIntensity: WorkoutGenerationIntensity = .moderate
    @State private var plan: GeneratedWorkoutPlan?
    @State private var generationError: String?
    @State private var didLoad = false
    @State private var isReloading = false
    @State private var savedLaunches: [GeneratedWorkoutLaunch] = []
    @State private var savedLaunchError: String?
    @State private var savedLaunchesExpanded = false
    @State private var archivedLaunchesExpanded = false
    @State private var launchToDelete: GeneratedWorkoutLaunch?
    @State private var selectedLaunch: GeneratedWorkoutLaunch?
    @State private var preparedLaunch: GeneratedWorkoutLaunch?
    @State private var launchError: String?
    @State private var generationVersion = 0
    @State private var presentedFocusPicker: FocusPickerDestination?

    private enum FocusPickerDestination: String, Identifiable {
        case focus
        var id: String { rawValue }
    }

    #if DEBUG
    private var previewLibrary: [ApprovedExercise]?
    private var previewHistory: [WorkoutHistorySession] = []
    #endif

    init(clientEmail: String, suggestedExercises: [Exercise] = [], initialPreferences: WorkoutGenerationPreferences = .init()) {
        self.clientEmail = clientEmail
        self.suggestedExercises = suggestedExercises
        _preferences = State(initialValue: initialPreferences.normalized)
        _strengthIntensity = State(initialValue: initialPreferences.intensity)
    }

    #if DEBUG
    init(previewLibrary: [ApprovedExercise], previewHistory: [WorkoutHistorySession] = [], previewSavedLaunches: [GeneratedWorkoutLaunch] = [], initialPreferences: WorkoutGenerationPreferences = .init(), clientEmail: String = "workout-generator-preview@example.com") {
        self.clientEmail = clientEmail
        suggestedExercises = []
        self.previewLibrary = previewLibrary
        self.previewHistory = previewHistory
        _savedLaunches = State(initialValue: previewSavedLaunches)
        _savedLaunchesExpanded = State(initialValue: !previewSavedLaunches.isEmpty)
        _preferences = State(initialValue: initialPreferences.normalized)
        _strengthIntensity = State(initialValue: initialPreferences.intensity)
    }
    #endif

    private var library: [ApprovedExercise] {
        #if DEBUG
        if let previewLibrary { return previewLibrary }
        #endif
        return libraryStore.exercises
    }

    private var history: [WorkoutHistoryRecord] {
        #if DEBUG
        if previewLibrary != nil { return previewHistory.flatMap(\.records) }
        #endif
        return historyStore.sessions.flatMap(\.records)
    }

    private var isPreview: Bool {
        #if DEBUG
        return previewLibrary != nil
        #else
        return false
        #endif
    }

    var body: some View {
        ScrollViewReader { scrollProxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    introduction
                    savedWorkouts

                    if !didLoad || isReloading {
                        loadingCard
                    } else if library.isEmpty {
                        unavailableCard
                    } else {
                        preferencesCard
                        equipmentCard
                        historyStatus

                        if let generationError {
                            Label(generationError, systemImage: "exclamationmark.circle")
                                .font(FWBFont.subheadline)
                                .foregroundStyle(Color.fwbRed)
                                .accessibilityIdentifier("workout.generator.error")
                        }

                        Button {
                            generate()
                        } label: {
                            Label(plan == nil ? "Generate workout" : "Generate another workout", systemImage: "sparkles")
                        }
                        .buttonStyle(FWBPrimaryButtonStyle())
                        .accessibilityIdentifier("workout.generator.generate")

                        if let plan {
                            preview(plan)
                                .id("workout.generator.preview")
                        }
                    }
                }
                .padding(FWBLayout.pagePadding)
            }
            .onChange(of: generationVersion) { _ in
                withAnimation {
                    scrollProxy.scrollTo("workout.generator.preview", anchor: .top)
                }
            }
        }
        .background(Color.fwbBackground.ignoresSafeArea())
        .foregroundStyle(Color.fwbWarmWhite)
        .navigationTitle("Generate workout")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .safeAreaInset(edge: .bottom) {
            if plan != nil {
                VStack(spacing: 0) {
                    FWBRule()
                    VStack(spacing: 10) {
                        if let launchError {
                            Text(launchError)
                                .font(FWBFont.footnote)
                                .foregroundStyle(Color.fwbRed)
                                .accessibilityIdentifier("workout.generator.saveError")
                        }
                        Button("Use this workout", action: useWorkout)
                            .buttonStyle(FWBPrimaryButtonStyle())
                            .disabled(selectedLaunch != nil)
                            .accessibilityIdentifier("workout.generator.use")
                    }
                    .padding(FWBLayout.pagePadding)
                }
                .background(Color.fwbBackground)
            }
        }
        .navigationDestination(isPresented: Binding(
            get: { selectedLaunch != nil },
            set: { if !$0 { selectedLaunch = nil } }
        )) {
            if let launch = selectedLaunch {
                WorkoutLoggingView(
                    workout: launch.workout,
                    clientEmail: clientEmail,
                    suggestedExercises: suggestedExercises,
                    previewMode: isPreview,
                    previewFormat: .single,
                    initialDate: launch.createdAt,
                    isGeneratedWorkout: true
                ) {
                    EmptyView()
                }
            }
        }
        .sheet(item: $presentedFocusPicker) { _ in
            WorkoutFocusSelectionSheet(preferences: $preferences, strengthIntensity: $strengthIntensity)
                .dynamicTypeSize(dynamicTypeSize)
        }
        .alert("Delete saved workout?", isPresented: Binding(
            get: { launchToDelete != nil },
            set: { if !$0 { launchToDelete = nil } }
        ), presenting: launchToDelete) { launch in
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { deleteSavedWorkout(launch) }
        } message: { launch in
            Text("Delete “\(launch.title)” from your saved generated workouts? This cannot be undone. Completed workout logs will be kept.")
        }
        .task { await load() }
        .onChange(of: preferences) { _ in
            plan = nil
            preparedLaunch = nil
            generationError = nil
            launchError = nil
        }
    }

    private var introduction: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("What do you want to train?")
                .font(FWBFont.title2.weight(.bold))
            Text("Choose your focus, time, and equipment. Review a workout from your coach’s exercise library, then make it your own.")
                .font(FWBFont.subheadline)
                .foregroundStyle(Color.fwbMuted)
        }
    }

    private var loadingCard: some View {
        HStack(spacing: 12) {
            ProgressView().tint(Color.fwbLime)
            Text("Loading exercises and recent workouts…")
                .font(FWBFont.subheadline)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .accessibilityIdentifier("workout.generator.loading")
    }

    private var unavailableCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(libraryStore.errorMessage == nil ? "No approved exercises yet" : "Exercises couldn’t load", systemImage: "dumbbell")
                .font(FWBFont.headline.weight(.bold))
            Text(libraryStore.errorMessage ?? "Your coach can add approved exercises to the library. Try again once they’re available.")
                .font(FWBFont.subheadline)
                .foregroundStyle(Color.fwbMuted)
            Button("Retry") { Task { await load(retry: true) } }
                .buttonStyle(FWBSecondaryButtonStyle())
                .accessibilityIdentifier("workout.generator.retry")
        }
        .fwbCard()
        .accessibilityIdentifier("workout.generator.empty")
    }

    @ViewBuilder
    private var savedWorkouts: some View {
        if let savedLaunchError {
            VStack(alignment: .leading, spacing: 8) {
                Label(savedLaunchError, systemImage: "exclamationmark.circle")
                    .font(FWBFont.subheadline)
                    .foregroundStyle(Color.fwbRed)
                Button("Retry saved workouts", action: loadSavedWorkouts)
                    .font(FWBFont.footnote.weight(.bold))
                    .foregroundStyle(Color.fwbLime)
                    .accessibilityIdentifier("workout.generator.retrySaved")
            }
            .fwbCard()
        }
        let active = savedLaunches.filter { !$0.isArchived }
        let archived = savedLaunches.filter(\.isArchived)
        if !active.isEmpty {
            savedWorkoutSection("Saved generated workouts", launches: active, expanded: $savedLaunchesExpanded, identifier: "workout.generator.saved")
        }
        if !archived.isEmpty {
            savedWorkoutSection("Archived generated workouts", launches: archived, expanded: $archivedLaunchesExpanded, identifier: "workout.generator.archived")
        }
    }

    private func savedWorkoutSection(_ title: String, launches: [GeneratedWorkoutLaunch], expanded: Binding<Bool>, identifier: String) -> some View {
        DisclosureGroup(isExpanded: expanded) {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(launches) { launch in
                    savedWorkoutRow(launch)
                }
            }
            .padding(.top, 8)
        } label: {
            Label("\(title) (\(launches.count))", systemImage: title.hasPrefix("Archived") ? "archivebox" : "clock.arrow.circlepath")
                .font(FWBFont.subheadline.weight(.bold))
                .foregroundStyle(Color.fwbWarmWhite)
        }
        .tint(Color.fwbLime)
        .fwbCard()
        .accessibilityIdentifier(identifier)
    }

    private func savedWorkoutRow(_ launch: GeneratedWorkoutLaunch) -> some View {
        HStack(spacing: 8) {
            Button {
                selectedLaunch = launch
            } label: {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(launch.title)
                            .font(FWBFont.subheadline.weight(.bold))
                            .foregroundStyle(Color.fwbWarmWhite)
                        Text(launch.createdAt, style: .date)
                            .font(FWBFont.caption)
                            .foregroundStyle(Color.fwbMuted)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(FWBFont.caption.weight(.bold))
                }
                .frame(minHeight: 52)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open \(launch.title), \(launch.createdAt.formatted(date: .abbreviated, time: .omitted))")
            .accessibilityIdentifier("workout.generator.saved.\(launch.id.uuidString)")
            Menu {
                Button {
                    setSavedWorkoutArchived(!launch.isArchived, launch: launch)
                } label: {
                    Label(launch.isArchived ? "Restore workout" : "Archive workout", systemImage: launch.isArchived ? "arrow.uturn.backward" : "archivebox")
                }
                Button(role: .destructive) {
                    launchToDelete = launch
                } label: {
                    Label("Delete saved workout", systemImage: "trash")
                }
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(FWBFont.title3)
                    .foregroundStyle(Color.fwbLime)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Options for \(launch.title), \(launch.createdAt.formatted(date: .abbreviated, time: .omitted))")
            .accessibilityIdentifier("workout.generator.saved.options.\(launch.id.uuidString)")
        }
    }

    private func setSavedWorkoutArchived(_ archived: Bool, launch: GeneratedWorkoutLaunch) {
        do {
            if isPreview {
                if let index = savedLaunches.firstIndex(where: { $0.id == launch.id }) {
                    savedLaunches[index].archivedAt = archived ? Date() : nil
                }
            } else {
                savedLaunches = try GeneratedWorkoutLaunchStore().setArchived(archived, id: launch.id, clientEmail: clientEmail)
            }
            savedLaunchError = nil
        } catch {
            savedLaunchError = archived
                ? "This saved workout couldn’t be archived. Please try again."
                : "This saved workout couldn’t be restored. Please try again."
        }
    }

    private func deleteSavedWorkout(_ launch: GeneratedWorkoutLaunch) {
        do {
            if isPreview {
                savedLaunches.removeAll { $0.id == launch.id }
            } else {
                savedLaunches = try GeneratedWorkoutLaunchStore().delete(id: launch.id, clientEmail: clientEmail)
            }
            if preparedLaunch?.id == launch.id { preparedLaunch = nil }
            if selectedLaunch?.id == launch.id { selectedLaunch = nil }
            savedLaunchError = nil
        } catch {
            savedLaunchError = "This saved workout couldn’t be deleted. Please try again."
        }
    }

    private var preferencesCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Today’s session")
                .font(FWBFont.headline.weight(.bold))
            preferenceRow("Focus") {
                Button {
                    presentedFocusPicker = .focus
                } label: {
                    HStack(spacing: 6) {
                        Text(preferences.focusTitle)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Image(systemName: "chevron.up.chevron.down")
                            .font(FWBFont.caption)
                    }
                    .foregroundStyle(Color.fwbLime)
                }
                .accessibilityLabel("Focus")
                .accessibilityValue(preferences.focusTitle)
                .accessibilityHint("Choose a quick focus or select multiple muscles")
                .accessibilityIdentifier("workout.generator.focus")
            }
            if preferences.isRecovery {
                Text("Gentle mobility and stretching for your selected area. Recovery sessions use easy intensity.")
                    .font(FWBFont.subheadline)
                    .foregroundStyle(Color.fwbMuted)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("workout.generator.recoveryHint")
            } else {
                Text("Choose one or more muscles in Focus, or pick a recovery session for mobility and stretching.")
                    .font(FWBFont.footnote)
                    .foregroundStyle(Color.fwbMuted)
            }
            FWBRule()
            preferenceRow("Time available") {
                Picker("Time available", selection: $preferences.minutes) {
                    ForEach(WorkoutGenerator.durations, id: \.self) { minutes in
                        Text("\(minutes) minutes").tag(minutes)
                    }
                }
                .labelsHidden()
                .accessibilityIdentifier("workout.generator.minutes")
            }
            FWBRule()
            preferenceRow("Intensity") {
                Picker("Intensity", selection: $preferences.intensity) {
                    ForEach(WorkoutGenerationIntensity.allCases) { intensity in
                        Text(intensity.title).tag(intensity)
                    }
                }
                .labelsHidden()
                .disabled(preferences.isRecovery)
                .accessibilityIdentifier("workout.generator.intensity")
            }
        }
        .font(FWBFont.body)
        .pickerStyle(.menu)
        .tint(Color.fwbLime)
        .fwbCard()
    }

    /// Stack controls at accessibility sizes so long focus labels remain readable on iPhone.
    private func preferenceRow<Control: View>(_ title: String, @ViewBuilder control: () -> Control) -> some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout(spacing: 8))
        return layout {
            Text(title)
            if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: 0) }
            control()
                .frame(minHeight: 44)
        }
    }

    private var equipmentCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Available equipment")
                .font(FWBFont.headline.weight(.bold))
            Text("Select what you have. Bodyweight moves may also be included.")
                .font(FWBFont.subheadline)
                .foregroundStyle(Color.fwbMuted)
            LazyVGrid(columns: dynamicTypeSize.isAccessibilitySize
                ? [GridItem(.flexible())]
                : [GridItem(.adaptive(minimum: 140), spacing: 8)], spacing: 8) {
                ForEach(WorkoutGenerationEquipment.allCases) { equipment in
                    let selected = preferences.equipment.contains(equipment)
                    Button {
                        toggleEquipment(equipment)
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                            Text(equipment.title)
                                .multilineTextAlignment(.leading)
                            Spacer(minLength: 0)
                        }
                        .font(FWBFont.subheadline.weight(.semibold))
                        .foregroundStyle(selected ? Color.fwbLime : Color.fwbWarmWhite)
                        .padding(12)
                        .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
                        .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius))
                        .overlay {
                            RoundedRectangle(cornerRadius: FWBLayout.controlRadius)
                                .stroke(selected ? Color.fwbLime : Color.fwbLine, lineWidth: 1)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(equipment.title)
                    .accessibilityValue(selected ? "Selected" : "Not selected")
                    .accessibilityAddTraits(selected ? [.isSelected] : [])
                    .accessibilityIdentifier("workout.generator.equipment.\(equipment.rawValue)")
                }
            }
        }
        .fwbCard()
    }

    @ViewBuilder
    private var historyStatus: some View {
        if !isPreview, case .failed = historyStore.state {
            VStack(alignment: .leading, spacing: 8) {
                Text("Recent history is unavailable. You can still generate a workout from the exercise library.")
                    .font(FWBFont.footnote)
                    .foregroundStyle(Color.fwbMuted)
                Button("Retry workout history") {
                    Task { await historyStore.reload(email: clientEmail) }
                }
                .font(FWBFont.footnote.weight(.bold))
                .foregroundStyle(Color.fwbLime)
                .accessibilityIdentifier("workout.generator.retryHistory")
            }
        }
    }

    private func preview(_ currentPlan: GeneratedWorkoutPlan) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Your workout")
                    .font(FWBFont.caption.weight(.bold))
                    .foregroundStyle(Color.fwbLime)
                Text(currentPlan.title)
                    .font(FWBFont.title2.weight(.bold))
                Text("\(currentPlan.exercises.count) exercises · About \(currentPlan.estimatedMinutes) min")
                    .font(FWBFont.subheadline.weight(.semibold))
                Text("Review the targets and swap any exercise before you start.")
                    .font(FWBFont.subheadline)
                    .foregroundStyle(Color.fwbMuted)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("workout.generator.summary")

            ForEach(Array(currentPlan.exercises.enumerated()), id: \.element.id) { index, exercise in
                exerciseCard(exercise, number: index + 1, in: currentPlan)
            }

            ForEach(Array(currentPlan.notes.enumerated()), id: \.offset) { _, note in
                Text(note)
                    .font(FWBFont.footnote)
                    .foregroundStyle(Color.fwbMuted)
            }
        }
    }

    private func exerciseCard(
        _ generated: GeneratedWorkoutExercise,
        number: Int,
        in currentPlan: GeneratedWorkoutPlan
    ) -> some View {
        let alternatives = WorkoutGenerator.alternatives(
            for: generated,
            in: currentPlan,
            library: library,
            history: history,
            now: Date()
        )
        let exercise = generated.exercise(code: "preview-\(generated.id.uuidString)")
        // Generated exercises contain only the engine's validated demo URLs.
        let demoURL = exercise.video.isEmpty ? exercise.demoURL : URL(string: exercise.video)

        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("\(number)")
                    .font(FWBFont.caption.weight(.bold))
                    .foregroundStyle(Color.fwbLime)
                Text(generated.source.name.fwbTitleCased)
                    .font(FWBFont.headline.weight(.bold))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(generated.prescription)
                .font(FWBFont.body.weight(.semibold))
            Text("Rest \(generated.rest) between sets")
                .font(FWBFont.subheadline)
                .foregroundStyle(Color.fwbMuted)

            HStack(spacing: 16) {
                if let url = demoURL {
                    Link(destination: url) {
                        Label("Watch demo", systemImage: "play.rectangle")
                            .font(FWBFont.footnote.weight(.bold))
                            .frame(minHeight: 44)
                    }
                    .accessibilityIdentifier("workout.generator.demo.\(number)")
                }
                Spacer(minLength: 0)
                if alternatives.isEmpty {
                    Text("No swaps available")
                        .font(FWBFont.caption)
                        .foregroundStyle(Color.fwbMuted)
                } else {
                    Menu {
                        ForEach(alternatives) { replacement in
                            Button(replacement.source.name.fwbTitleCased) {
                                replace(generated, with: replacement)
                            }
                        }
                    } label: {
                        Label("Swap", systemImage: "arrow.triangle.2.circlepath")
                            .font(FWBFont.footnote.weight(.bold))
                            .frame(minHeight: 44)
                    }
                    .accessibilityLabel("Swap \(generated.source.name)")
                    .accessibilityIdentifier("workout.generator.swap.\(number)")
                }
            }
            .foregroundStyle(Color.fwbLime)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .accessibilityIdentifier("workout.generator.exercise.\(number)")
    }

    private func toggleEquipment(_ equipment: WorkoutGenerationEquipment) {
        if equipment == .fullGym {
            preferences.equipment = [.fullGym]
        } else {
            var selected = preferences.equipment
            selected.remove(.fullGym)
            if selected.contains(equipment) {
                selected.remove(equipment)
            } else {
                selected.insert(equipment)
            }
            preferences.equipment = selected.isEmpty ? [.bodyweight] : selected
        }
    }

    private func generate() {
        generationError = nil
        launchError = nil
        preparedLaunch = nil
        do {
            plan = try WorkoutGenerator.generate(
                library: library,
                history: history,
                preferences: preferences,
                seed: UInt64.random(in: .min ... .max),
                now: Date()
            )
            generationVersion += 1
        } catch {
            plan = nil
            generationError = error.localizedDescription
        }
    }

    private func replace(_ exercise: GeneratedWorkoutExercise, with replacement: GeneratedWorkoutExercise) {
        guard let currentPlan = plan,
              let index = currentPlan.exercises.firstIndex(where: { $0.id == exercise.id }) else { return }
        do {
            plan = try WorkoutGenerator.replacing(at: index, with: replacement, in: currentPlan)
            preparedLaunch = nil
            generationError = nil
        } catch {
            generationError = error.localizedDescription
        }
    }

    private func useWorkout() {
        guard selectedLaunch == nil, let plan else { return }
        launchError = nil
        if let preparedLaunch {
            selectedLaunch = preparedLaunch
            return
        }
        let launch = GeneratedWorkoutLaunch(plan: plan)
        do {
            if !isPreview {
                try GeneratedWorkoutLaunchStore().save(launch, clientEmail: clientEmail)
            }
            savedLaunches.insert(launch, at: 0)
            savedLaunchError = nil
            preparedLaunch = launch
            selectedLaunch = launch
        } catch {
            launchError = "This workout couldn’t be saved for later. Please try again."
        }
    }

    private func loadSavedWorkouts() {
        guard !isPreview else { return }
        do {
            savedLaunches = try GeneratedWorkoutLaunchStore().load(clientEmail: clientEmail)
                .sorted { $0.createdAt > $1.createdAt }
            savedLaunchError = nil
        } catch {
            savedLaunchError = "Saved generated workouts couldn’t load. Please try again."
        }
    }

    @MainActor
    private func load(retry: Bool = false) async {
        guard retry || !didLoad else { return }
        if isPreview {
            didLoad = true
            return
        }
        loadSavedWorkouts()
        isReloading = true
        defer { isReloading = false }
        if retry {
            await libraryStore.reload()
        } else {
            await libraryStore.loadIfNeeded()
        }
        guard !Task.isCancelled else { return }
        if retry {
            await historyStore.reload(email: clientEmail)
        } else {
            await historyStore.loadIfNeeded(email: clientEmail)
        }
        guard !Task.isCancelled else { return }
        didLoad = true
    }
}


/// Keeps muscle selection visible while clients combine or remove target areas.
private struct WorkoutFocusSelectionSheet: View {
    @Binding var preferences: WorkoutGenerationPreferences
    @Binding var strengthIntensity: WorkoutGenerationIntensity
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    private let quickFocuses: [WorkoutGenerationFocus] = [.fullBody, .upperBody, .lowerBody, .chestBack, .arms]
    private var columns: [GridItem] {
        dynamicTypeSize.isAccessibilitySize
            ? [GridItem(.flexible())]
            : [GridItem(.adaptive(minimum: 140), spacing: 8)]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text("Choose a quick focus or combine the muscles you want to train.")
                        .font(FWBFont.subheadline)
                        .foregroundStyle(Color.fwbMuted)
                    VStack(alignment: .leading, spacing: 10) {
                        sectionTitle("Quick focus")
                        LazyVGrid(columns: columns, spacing: 8) {
                            ForEach(quickFocuses) { focus in
                                choice(focus, selected: preferences.selectedMuscles.isEmpty && preferences.focus == focus, multiple: false) {
                                    selectPreset(focus)
                                }
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 10) {
                        sectionTitle("Choose muscles")
                        Text("Select as many as you like. Tap a selected muscle to remove it.")
                            .font(FWBFont.footnote)
                            .foregroundStyle(Color.fwbMuted)
                        LazyVGrid(columns: columns, spacing: 8) {
                            ForEach(WorkoutGenerationFocus.selectableMuscles) { muscle in
                                choice(muscle, selected: muscleIsSelected(muscle), multiple: true) {
                                    toggleMuscle(muscle)
                                }
                            }
                        }
                    }
                    VStack(alignment: .leading, spacing: 10) {
                        sectionTitle("Mobility & recovery")
                        Text("Gentle mobility and stretching at easy intensity.")
                            .font(FWBFont.footnote)
                            .foregroundStyle(Color.fwbMuted)
                        ForEach(WorkoutGenerationFocus.allCases.filter(\.isRecovery)) { focus in
                            choice(focus, selected: preferences.selectedMuscles.isEmpty && preferences.focus == focus, multiple: false) {
                                selectPreset(focus)
                            }
                        }
                    }
                }
                .padding(FWBLayout.pagePadding)
            }
            .background(Color.fwbBackground.ignoresSafeArea())
            .foregroundStyle(Color.fwbWarmWhite)
            .navigationTitle("Workout focus")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.fwbBackground, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                        .accessibilityIdentifier("workout.generator.focus.done")
                }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(alignment: .leading, spacing: 6) {
                    FWBRule()
                    Text("Selected: \(preferences.focusTitle)")
                        .font(FWBFont.subheadline.weight(.semibold))
                        .foregroundStyle(Color.fwbWarmWhite)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, FWBLayout.pagePadding)
                        .padding(.vertical, 12)
                        .accessibilityIdentifier("workout.generator.focus.selection")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.fwbBackground)
            }
            .tint(Color.fwbLime)
        }
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(FWBFont.headline.weight(.bold))
            .accessibilityAddTraits(.isHeader)
    }

    private func choice(_ focus: WorkoutGenerationFocus, selected: Bool, multiple: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: selected ? (multiple ? "checkmark.square.fill" : "checkmark.circle.fill") : (multiple ? "square" : "circle"))
                Text(focus.title)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .font(FWBFont.subheadline.weight(.semibold))
            .foregroundStyle(selected ? Color.fwbLime : Color.fwbWarmWhite)
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 48, alignment: .leading)
            .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius))
            .overlay {
                RoundedRectangle(cornerRadius: FWBLayout.controlRadius)
                    .stroke(selected ? Color.fwbLime : Color.fwbLine, lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(focus.title)
        .accessibilityValue(selected ? "Selected" : "Not selected")
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .accessibilityIdentifier("workout.generator.\(multiple ? "muscle" : "preset").\(focus.rawValue)")
    }

    private func muscleIsSelected(_ muscle: WorkoutGenerationFocus) -> Bool {
        preferences.selectedMuscles.contains(muscle) ||
            (preferences.selectedMuscles.isEmpty && preferences.focus == muscle)
    }

    private func selectPreset(_ focus: WorkoutGenerationFocus) {
        var updated = preferences
        if focus.isRecovery && !preferences.isRecovery {
            strengthIntensity = preferences.intensity
            updated.intensity = .easy
        } else if !focus.isRecovery && preferences.isRecovery {
            updated.intensity = strengthIntensity
        }
        updated.focus = focus
        updated.selectedMuscles = []
        preferences = updated.normalized
    }

    private func toggleMuscle(_ muscle: WorkoutGenerationFocus) {
        var updated = preferences
        if preferences.isRecovery {
            updated.intensity = strengthIntensity
        }
        if updated.selectedMuscles.isEmpty && WorkoutGenerationFocus.selectableMuscles.contains(updated.focus) {
            updated.selectedMuscles = [updated.focus]
        }
        if updated.selectedMuscles.contains(muscle) {
            updated.selectedMuscles.remove(muscle)
        } else {
            updated.selectedMuscles.insert(muscle)
        }
        updated.focus = .fullBody
        preferences = updated.normalized
    }
}
