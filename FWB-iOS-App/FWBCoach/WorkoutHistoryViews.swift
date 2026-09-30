import Charts
import SwiftUI
import UniformTypeIdentifiers

private func workoutHistoryMetricColumns(for dynamicTypeSize: DynamicTypeSize) -> [GridItem] {
    Array(repeating: GridItem(.flexible(), spacing: 12), count: dynamicTypeSize.isAccessibilitySize ? 1 : 2)
}

struct WorkoutHistoryView: View {
    let clientEmail: String

    @StateObject private var store = WorkoutHistoryStore()
    @StateObject private var exerciseLibraryStore = ExerciseLibraryStore()
    @State private var exerciseSearch = ""
    @State private var workoutSearch = ""
    @State private var selectedDate = Date()
    @State private var draftDate = Date()
    @State private var hasDateFilter = false
    @State private var isChoosingDate = false
    @State private var isExportingCSV = false
    @State private var exportStatus = ""
    @State private var copyPlan: WorkoutHistoryCopyPlan?
    @State private var isShowingCopiedWorkout = false

    private var isAudit: Bool {
#if DEBUG
        ProcessInfo.processInfo.arguments.contains("--ui-audit")
            || ProcessInfo.processInfo.environment["FWB_UI_AUDIT"] == "1"
#else
        false
#endif
    }

    private var sessions: [WorkoutHistorySession] {
#if DEBUG
        if isAudit { return WorkoutHistoryAudit.sessions }
#endif
        return store.sessions
    }

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            if isAudit {
                historyContent
            } else {
                switch store.state {
                case .idle, .loading:
                    ProgressView("Loading workout history…")
                        .tint(Color.fwbLime)
                case .loaded:
                    historyContent
                case .failed(let message):
                    FWBErrorState(message: message) {
                        Task { await store.reload(email: clientEmail) }
                    }
                }
            }
        }
        .font(FWBFont.body)
        .navigationTitle("Logs")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .task {
            guard !isAudit else { return }
            async let historyLoad: Void = store.loadIfNeeded(email: clientEmail)
            async let libraryLoad: Void = exerciseLibraryStore.loadIfNeeded()
            _ = await (historyLoad, libraryLoad)
        }
        .onReceive(NotificationCenter.default.publisher(for: .fwbForegroundRefresh)) { _ in
            guard !isAudit else { return }
            Task { await store.reload(email: clientEmail) }
        }
        .sheet(isPresented: $isChoosingDate) {
            NavigationStack {
                DatePicker("Search by date", selection: $draftDate, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .padding()
                    .navigationTitle("Search by date")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { isChoosingDate = false }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Apply") {
                                selectedDate = draftDate
                                hasDateFilter = true
                                isChoosingDate = false
                            }
                        }
                    }
            }
            .presentationDetents([.medium, .large])
        }
        .fileExporter(
            isPresented: $isExportingCSV,
            document: WorkoutHistoryCSVDocument(sessions: sessions),
            contentType: .commaSeparatedText,
            defaultFilename: "fwb-workout-history"
        ) { result in
            switch result {
            case .success: exportStatus = "Workout history CSV saved."
            case .failure: exportStatus = "The CSV could not be saved. Please try again."
            }
        }
        .navigationDestination(isPresented: $isShowingCopiedWorkout) {
            if let copyPlan {
                WorkoutLoggingView(
                    workout: copyPlan.workout,
                    clientEmail: clientEmail,
                    seedSession: copyPlan.session
                )
                .id(copyPlan.workout.id)
                .navigationTitle("Custom workout")
                .navigationBarTitleDisplayMode(.inline)
            }
        }
    }

    @ViewBuilder
    private var historyContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                WorkoutHistoryHeading(
                    sessionCount: filteredSessions.count
                )
                historyFilters
                WorkoutExerciseSearchField(text: $exerciseSearch)

                if sessions.isEmpty {
                    FWBEmptyState(
                        icon: "list.bullet.clipboard",
                        title: "No workouts logged yet",
                        message: "Saved workouts will appear here after you record your first set."
                    )
                } else if filteredSessions.isEmpty {
                    FWBEmptyState(
                        icon: "magnifyingglass",
                        title: "No matching logs",
                        message: "No workouts match that date or search. Clear the filters to see your saved logs."
                    )
                } else if normalizedExerciseSearch.isEmpty {
                    WorkoutHistorySessionDeck(sessions: filteredSessions) { session in
                        copyPlan = WorkoutHistoryCopyPlan(session: session)
                        isShowingCopiedWorkout = true
                    }
                } else if exerciseSearchResults.isEmpty {
                    WorkoutExerciseSearchEmptyState(query: exerciseSearch)
                } else {
                    HStack {
                        Text("Exercise results")
                            .font(FWBFont.footnote.bold())
                            .foregroundStyle(Color.fwbLime)
                        Spacer()
                        Text("\(exerciseSearchResults.count)")
                            .font(FWBFont.footnote.bold())
                            .foregroundStyle(Color.fwbMuted)
                    }

                    ForEach(exerciseSearchResults) { result in
                        NavigationLink {
                            WorkoutExerciseHistoryDetailView(result: result)
                        } label: {
                            WorkoutExerciseSearchResultCard(result: result)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .refreshable {
            guard !isAudit else { return }
            await store.reload(email: clientEmail)
        }
    }

    private var historyFilters: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Search by date").font(FWBFont.caption.weight(.bold))
                Button {
                    draftDate = selectedDate
                    isChoosingDate = true
                } label: {
                    HStack {
                        Text(hasDateFilter ? selectedDate.formatted(date: .abbreviated, time: .omitted) : "Any date")
                        Spacer()
                        Image(systemName: "calendar")
                    }
                    .foregroundStyle(Color.fwbWarmWhite)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 44)
                    .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 12))
                    .overlay { RoundedRectangle(cornerRadius: 12).stroke(Color.fwbLine, lineWidth: 1) }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("workoutHistory.dateFilter")
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Search workout").font(FWBFont.caption.weight(.bold))
                TextField("Workout A, chest press…", text: $workoutSearch)
                    .font(FWBFont.body)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
                    .padding(.horizontal, 12)
                    .frame(minHeight: 44)
                    .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 12))
                    .overlay { RoundedRectangle(cornerRadius: 12).stroke(Color.fwbLine, lineWidth: 1) }
                    .accessibilityIdentifier("workoutHistory.workoutSearch")
            }
            HStack(spacing: 12) {
                Button("Clear") {
                    hasDateFilter = false
                    workoutSearch = ""
                    exerciseSearch = ""
                }
                .buttonStyle(WorkoutHistoryFilterButtonStyle(isPrimary: false))
                Button("Download CSV") { isExportingCSV = true }
                    .buttonStyle(WorkoutHistoryFilterButtonStyle(isPrimary: true))
                    .disabled(sessions.isEmpty)
            }
            if !exportStatus.isEmpty {
                Text(exportStatus)
                    .font(FWBFont.footnote)
                    .foregroundStyle(Color.fwbMuted)
                    .accessibilityAddTraits(.updatesFrequently)
            }
        }
        .foregroundStyle(Color.fwbMuted)
    }

    private var filteredSessions: [WorkoutHistorySession] {
        let search = workoutSearch.trimmingCharacters(in: .whitespacesAndNewlines)
        return sessions.filter { session in
            let matchesDate = !hasDateFilter || WorkoutHistoryFormat.dateValue(session.entryDate).map {
                Calendar.current.isDate($0, inSameDayAs: selectedDate)
            } == true
            guard matchesDate else { return false }
            guard !search.isEmpty else { return true }
            return session.workoutTitle.localizedStandardContains(search)
                || session.records.contains { record in
                    record.exerciseName.localizedStandardContains(search)
                        || record.exerciseCode.localizedStandardContains(search)
                        || (record.notes?.localizedStandardContains(search) ?? false)
                }
        }
    }

    private var normalizedExerciseSearch: String {
        ExerciseNameIdentity.key(for: exerciseSearch)
    }

    private var exerciseSearchResults: [WorkoutExerciseSearchResult] {
        guard !normalizedExerciseSearch.isEmpty else { return [] }

        let occurrences = filteredSessions.flatMap { session in
            session.exercises.map { exercise in
                WorkoutExerciseOccurrence(session: session, exercise: exercise)
            }
        }
        .filter { occurrence in
            let canonicalName = ExerciseNameIdentity.canonicalName(
                for: occurrence.exercise.name,
                approvedExercises: exerciseLibraryStore.exercises
            )
            return ExerciseNameIdentity.key(for: canonicalName).contains(normalizedExerciseSearch)
                || ExerciseNameIdentity.key(for: occurrence.exercise.code).contains(normalizedExerciseSearch)
        }

        let grouped = Dictionary(grouping: occurrences) { occurrence in
            let canonicalName = ExerciseNameIdentity.canonicalName(
                for: occurrence.exercise.name,
                approvedExercises: exerciseLibraryStore.exercises
            )
            let normalizedName = ExerciseNameIdentity.key(for: canonicalName)
            return normalizedName.isEmpty
                ? ExerciseNameIdentity.key(for: occurrence.exercise.code)
                : normalizedName
        }

        return grouped.compactMap { _, occurrences in
            guard let first = occurrences.first else { return nil }
            return WorkoutExerciseSearchResult(
                name: ExerciseNameIdentity.canonicalName(
                    for: first.exercise.name,
                    approvedExercises: exerciseLibraryStore.exercises
                ),
                code: first.exercise.code,
                occurrences: occurrences.sorted { $0.session.entryDate > $1.session.entryDate }
            )
        }
        .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}

private struct WorkoutExerciseOccurrence: Identifiable {
    let session: WorkoutHistorySession
    let exercise: WorkoutHistoryExercise

    var id: String { "\(session.id)|\(exercise.id)" }
}

private struct WorkoutExerciseSearchResult: Identifiable {
    let name: String
    let code: String
    let occurrences: [WorkoutExerciseOccurrence]

    var id: String { name.lowercased() }
    var totalSets: Int { occurrences.reduce(0) { $0 + $1.exercise.workingRecords.count } }
    var totalVolume: Double { occurrences.reduce(0) { $0 + $1.exercise.totalVolume } }
    var latestDate: String { occurrences.first?.session.entryDate ?? "" }
}

private struct WorkoutExerciseSearchField: View {
    @Binding var text: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(FWBFont.subheadline.weight(.bold))
                .foregroundStyle(Color.fwbLime)

            TextField("Search exercises you’ve done", text: $text)
                .foregroundStyle(Color.fwbWarmWhite)
                .tint(Color.fwbLime)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)

            if !text.isEmpty {
                Button {
                    text = ""
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
        .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
        .accessibilityIdentifier("workoutHistory.exerciseSearch")
    }
}

private struct WorkoutExerciseSearchEmptyState: View {
    let query: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(FWBFont.title2.bold())
                .foregroundStyle(Color.fwbLime)
            Text("No exercise matches")
                .font(FWBFont.headline.weight(.bold))
                .foregroundStyle(Color.fwbWarmWhite)
            Text("Nothing in your workout history matches “\(query)”.")
                .font(FWBFont.footnote)
                .foregroundStyle(Color.fwbMuted)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .fwbCard()
    }
}

private struct WorkoutExerciseSearchResultCard: View {
    let result: WorkoutExerciseSearchResult

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 6) {
                if !result.code.isEmpty {
                    Text(result.code.uppercased())
                        .font(FWBFont.footnote.bold())
                        .foregroundStyle(Color.fwbLime)
                }
                Text(result.name.fwbTitleCased)
                    .font(FWBFont.title3.weight(.bold))
                    .foregroundStyle(Color.fwbWarmWhite)
                    .multilineTextAlignment(.leading)
                Text(
                    "Last done \(WorkoutHistoryFormat.date(result.latestDate)) · "
                        + "\(result.occurrences.count) workouts · \(result.totalSets) sets"
                )
                .font(FWBFont.footnote)
                .foregroundStyle(Color.fwbMuted)
            }

            Spacer(minLength: 8)

            Image(systemName: "chevron.right")
                .font(FWBFont.footnote.bold())
                .foregroundStyle(Color.fwbMuted)
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .accessibilityElement(children: .combine)
    }
}

private struct WorkoutExerciseHistoryDetailView: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let result: WorkoutExerciseSearchResult

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 7) {
                        Text("Exercise history")
                            .font(FWBFont.footnote.bold())
                            .foregroundStyle(Color.fwbLime)
                        Text(result.name.fwbTitleCased)
                            .font(FWBFont.title.weight(.bold))
                            .foregroundStyle(Color.fwbWarmWhite)
                    }

                    LazyVGrid(columns: workoutHistoryMetricColumns(for: dynamicTypeSize), spacing: 12) {
                        WorkoutHistoryMetric(title: "Workouts", value: "\(result.occurrences.count)")
                        WorkoutHistoryMetric(title: "Sets", value: "\(result.totalSets)")
                        WorkoutHistoryMetric(
                            title: "Volume",
                            value: WorkoutHistoryFormat.weight(result.totalVolume)
                        )
                    }
                    .frame(maxWidth: .infinity)
                    .fwbCard()

                    ExerciseProgressChart(points: progressPoints)

                    ForEach(result.occurrences) { occurrence in
                        WorkoutExerciseOccurrenceCard(occurrence: occurrence)
                    }
                }
                .padding(16)
            }
        }
        .navigationTitle("Exercise History")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
    }

    private var progressPoints: [ExerciseProgressPoint] {
        result.occurrences.compactMap { occurrence in
            guard let date = WorkoutHistoryFormat.dateValue(occurrence.session.entryDate) else { return nil }

            let completedRecords = occurrence.exercise.records.filter {
                $0.countsTowardWorkingMetrics && ($0.weightUsed > 0 || ($0.reps ?? 0) > 0)
            }
            guard !completedRecords.isEmpty else { return nil }

            let maxWeight = completedRecords.map(\.weightUsed).max() ?? 0
            let estimatedOneRepMax = completedRecords.map { record in
                guard record.weightUsed > 0, let reps = record.reps, reps > 0 else { return 0 }
                return record.weightUsed * (1 + reps / 30)
            }
            .max() ?? 0

            return ExerciseProgressPoint(
                id: occurrence.id,
                date: date,
                maxWeight: maxWeight,
                estimatedOneRepMax: estimatedOneRepMax,
                volume: occurrence.exercise.totalVolume
            )
        }
        .sorted { $0.date < $1.date }
    }
}

private struct ExerciseProgressPoint: Identifiable {
    let id: String
    let date: Date
    let maxWeight: Double
    let estimatedOneRepMax: Double
    let volume: Double
}

private struct ExerciseProgressChart: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    enum Metric: String, CaseIterable, Identifiable {
        case maxWeight = "Max weight"
        case estimatedOneRepMax = "Est. 1RM"
        case volume = "Volume"

        var id: String { rawValue }

        var label: String {
            switch self {
            case .maxWeight: return "Max weight"
            case .estimatedOneRepMax: return "Estimated one-rep max"
            case .volume: return "Workout volume"
            }
        }
    }

    let points: [ExerciseProgressPoint]

    @State private var metric: Metric = .maxWeight

    private var adaptiveControlLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 8)) : AnyLayout(HStackLayout(spacing: 8))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Progress")
                        .font(FWBFont.footnote.bold())
                        .foregroundStyle(Color.fwbLime)
                    Text("Strength trend")
                        .font(FWBFont.title3.weight(.bold))

                }

                Spacer()

                if let personalBest {
                    VStack(alignment: .trailing, spacing: 3) {
                        Text("Personal best")
                            .font(FWBFont.footnote.bold())
                            .foregroundStyle(Color.fwbMuted)
                        Text(WorkoutHistoryFormat.weight(personalBest))
                            .font(FWBFont.headline.weight(.bold))
                            .foregroundStyle(Color.fwbWarmWhite)
                    }
                }
            }

            adaptiveControlLayout {
                ForEach(Metric.allCases) { option in
                    Button {
                        metric = option
                    } label: {
                        Text(option.rawValue)
                            .font(FWBFont.footnote.bold())
                            .foregroundStyle(metric == option ? Color.black : Color.fwbWarmWhite)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .frame(minHeight: 44)
                            .background(metric == option ? Color.fwbAccentFill : Color.fwbSurface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.fwbLine, lineWidth: 1) }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(option.label)
                    .accessibilityValue(metric == option ? "Selected" : "Not selected")
                    .accessibilityAddTraits(metric == option ? .isSelected : [])
                }
            }

            if displayPoints.isEmpty {
                Text(emptyStateMessage)
                    .font(FWBFont.subheadline)
                    .foregroundStyle(Color.fwbMuted)
                    .frame(maxWidth: .infinity, minHeight: 120, alignment: .center)
                    .multilineTextAlignment(.center)
            } else {
                Chart(displayPoints) { point in
                    AreaMark(
                        x: .value("Date", point.date),
                        y: .value(metric.label, value(for: point))
                    )
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color.fwbLime.opacity(0.28), Color.fwbLime.opacity(0.02)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                    LineMark(
                        x: .value("Date", point.date),
                        y: .value(metric.label, value(for: point))
                    )
                    .foregroundStyle(Color.fwbLime)
                    .lineStyle(StrokeStyle(lineWidth: 3))

                    PointMark(
                        x: .value("Date", point.date),
                        y: .value(metric.label, value(for: point))
                    )
                    .foregroundStyle(Color.fwbLime)
                    .symbolSize(48)
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                        AxisGridLine().foregroundStyle(Color.fwbLine.opacity(0.4))
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                            .foregroundStyle(Color.fwbMuted)
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { _ in
                        AxisGridLine().foregroundStyle(Color.fwbLine.opacity(0.4))
                        AxisValueLabel()
                            .foregroundStyle(Color.fwbMuted)
                    }
                }
                .frame(height: 190)
                .accessibilityLabel("\(metric.label) progress chart")
                .accessibilityValue(chartAccessibilityValue)

                Text(displayPoints.count == 1 ? "Add another workout to see your trend line." : "Based on \(displayPoints.count) logged workouts.")
                    .font(FWBFont.footnote)
                    .foregroundStyle(Color.fwbMuted)
            }
        }
        .fwbCard()
        .animation(.easeOut(duration: 0.18), value: metric)
    }

    private var personalBest: Double? {
        let values = displayPoints.map(value(for:))
        guard let best = values.max(), best > 0 else { return nil }
        return best
    }

    private var displayPoints: [ExerciseProgressPoint] {
        points.filter { value(for: $0) > 0 }
    }

    private var emptyStateMessage: String {
        if points.isEmpty {
            return "Log weight and reps to start your progress chart."
        }

        switch metric {
        case .maxWeight, .estimatedOneRepMax:
            return "Log weight and reps to track this strength metric."
        case .volume:
            return "Log weight and reps to track workout volume."
        }
    }

    private var chartAccessibilityValue: String {
        guard let best = personalBest else { return "No recorded values" }
        return "\(displayPoints.count) workouts. Personal best \(WorkoutHistoryFormat.weight(best))."
    }

    private func value(for point: ExerciseProgressPoint) -> Double {
        switch metric {
        case .maxWeight: return point.maxWeight
        case .estimatedOneRepMax: return point.estimatedOneRepMax
        case .volume: return point.volume
        }
    }
}

private struct WorkoutExerciseOccurrenceCard: View {
    let occurrence: WorkoutExerciseOccurrence

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 5) {
                Text(WorkoutHistoryFormat.date(occurrence.session.entryDate))
                    .font(FWBFont.footnote.bold())
                    .foregroundStyle(Color.fwbLime)
                Text(occurrence.session.workoutTitle.fwbWorkoutDisplayTitle.fwbTitleCased)
                    .font(FWBFont.headline.weight(.bold))
                    .foregroundStyle(Color.fwbWarmWhite)
            }

            FWBRule()

            ForEach(
                Array(occurrence.exercise.records.enumerated()),
                id: \.element.setNumber
            ) { index, record in
                WorkoutHistorySetRow(record: record)

                if index < occurrence.exercise.records.count - 1 {
                    FWBRule(color: Color.fwbLine.opacity(0.6))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }
}

private struct WorkoutHistoryHeading: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let sessionCount: Int

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10))
            : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
        layout {
            VStack(alignment: .leading, spacing: 6) {
                Text("Training logs")
                    .font(FWBFont.caption.weight(.bold))
                    .foregroundStyle(Color.fwbMuted)
                Text("Saved logs")
                    .font(FWBFont.largeTitle.weight(.bold))
                    .foregroundStyle(Color.fwbWarmWhite)
            }
            if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: 0) }
            Text(sessionCount == 0 ? "No logs yet" : "\(sessionCount) \(sessionCount == 1 ? "session" : "sessions")")
                .font(FWBFont.caption.weight(.bold))
                .foregroundStyle(Color.fwbMuted)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(Color.fwbSurface, in: Capsule())
        }
        .padding(.bottom, 4)
    }
}

private struct WorkoutHistorySessionDeck: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var index = 0
    let sessions: [WorkoutHistorySession]
    let copyWorkout: (WorkoutHistorySession) -> Void

    private var safeIndex: Int { min(index, max(0, sessions.count - 1)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Past workouts")
                        .font(FWBFont.caption.weight(.bold))
                        .foregroundStyle(Color.fwbMuted)
                    Text("Workout \(safeIndex + 1) of \(sessions.count)")
                        .font(FWBFont.subheadline.weight(.bold))
                        .foregroundStyle(Color.fwbWarmWhite)
                        .accessibilityAddTraits(.updatesFrequently)
                }
                Spacer(minLength: 0)
                deckButton("Previous workout", icon: "arrow.left", step: -1)
                deckButton("Next workout", icon: "arrow.right", step: 1)
            }
            if sessions.indices.contains(safeIndex) {
                WorkoutHistorySessionCard(session: sessions[safeIndex], copyWorkout: copyWorkout)
                    .id(sessions[safeIndex].id)
                    .background {
                        if sessions.count > 1 {
                            RoundedRectangle(cornerRadius: FWBLayout.cardRadius)
                                .fill(Color.fwbSurface)
                                .overlay { RoundedRectangle(cornerRadius: FWBLayout.cardRadius).stroke(Color.fwbLine, lineWidth: 1) }
                                .padding(.horizontal, 7)
                                .offset(y: 7)
                        }
                    }
                    .accessibilityIdentifier("workoutHistory.sessionCard")
            }
            if sessions.count > 1 {
                Text("Use the arrows to browse your workouts")
                    .font(FWBFont.caption)
                    .foregroundStyle(Color.fwbMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 6)
            }
        }
        .onChange(of: sessions.map(\.id)) { _ in index = 0 }
    }

    private func deckButton(_ label: String, icon: String, step: Int) -> some View {
        Button { move(step) } label: {
            Image(systemName: icon)
                .font(FWBFont.body.weight(.bold))
                .foregroundStyle(Color.fwbWarmWhite)
                .frame(width: 44, height: 44)
                .background(Color.fwbCard, in: Circle())
                .overlay { Circle().stroke(Color.fwbLine, lineWidth: 1) }
        }
        .buttonStyle(.plain)
        .disabled(sessions.count < 2)
        .opacity(sessions.count < 2 ? 0.4 : 1)
        .accessibilityLabel(label)
    }

    private func move(_ step: Int) {
        guard sessions.count > 1 else { return }
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.18)) {
            index = (safeIndex + step + sessions.count) % sessions.count
        }
    }
}

private struct WorkoutHistorySessionCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let session: WorkoutHistorySession
    let copyWorkout: (WorkoutHistorySession) -> Void

    private var canCopyWorkout: Bool {
        session.records.contains {
            !$0.isCardio && $0.exerciseCode.caseInsensitiveCompare("WARMUP") != .orderedSame
        }
    }

    private var isComplete: Bool { session.records.contains { $0.completedAt != nil } }
    private var averageRIR: String {
        let values = session.records.filter { $0.countsTowardWorkingMetrics && $0.effortScale == .rir }
            .compactMap(\.effortValue).filter(\.isFinite)
        guard !values.isEmpty else { return "—" }
        return WorkoutHistoryFormat.number(values.reduce(0, +) / Double(values.count))
    }
    private var shareText: String {
        "\(session.workoutTitle.fwbWorkoutDisplayTitle) · \(WorkoutHistoryFormat.date(session.entryDate))\n"
            + "\(session.exercises.count) exercises · \(session.strengthSetCount) working sets · \(WorkoutHistoryFormat.weight(session.totalVolume)) volume\n"
            + "Fitness with Benjamin"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .center, spacing: 10) {
                    statusBadge
                    Spacer(minLength: 8)
                    dateLabel
                }
                VStack(alignment: .leading, spacing: 8) {
                    statusBadge
                    dateLabel
                }
            }
            Text(session.workoutTitle.fwbWorkoutDisplayTitle.fwbTitleCased)
                .font(FWBFont.title3.weight(.bold))
                .foregroundStyle(Color.fwbWarmWhite)
                .fixedSize(horizontal: false, vertical: true)
            Text(isComplete ? "Workout completed" : "Workout saved")
                .font(FWBFont.subheadline.weight(.semibold))
                .foregroundStyle(Color.fwbMuted)

            LazyVGrid(
                columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: dynamicTypeSize.isAccessibilitySize ? 1 : 2),
                spacing: 0
            ) {
                if session.isCardioOnly {
                    cardMetric("Duration", "\(WorkoutHistoryFormat.number(session.totalCardioMinutes)) min")
                    cardMetric("Distance", session.totalCardioDistance > 0 ? "\(WorkoutHistoryFormat.number(session.totalCardioDistance)) mi" : "—")
                    cardMetric("Calories", session.totalCardioCalories > 0 ? WorkoutHistoryFormat.number(session.totalCardioCalories) : "—")
                } else {
                    cardMetric("Exercises", "\(session.exercises.count)")
                    cardMetric("Volume", WorkoutHistoryFormat.weight(session.totalVolume))
                    cardMetric("Working sets", "\(session.strengthSetCount)")
                    cardMetric("Average RIR", averageRIR)
                }
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 16) {
                    viewExercises
                    Spacer(minLength: 0)
                    if canCopyWorkout { copyWorkoutButton }
                    shareWorkout
                }
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 16) {
                        viewExercises
                        Spacer(minLength: 0)
                        if canCopyWorkout { copyWorkoutButton }
                    }
                    shareWorkout
                }
                VStack(alignment: .leading, spacing: 4) {
                    viewExercises
                    if canCopyWorkout { copyWorkoutButton }
                    shareWorkout
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }

    private var dateLabel: some View {
        Text(WorkoutHistoryFormat.date(session.entryDate))
            .font(FWBFont.subheadline.weight(.bold))
            .foregroundStyle(Color.fwbMuted)
    }

    private var statusBadge: some View {
        Text(isComplete ? "Completed" : "Saved")
            .font(FWBFont.caption.weight(.bold))
            .foregroundStyle(Color(red: 8 / 255, green: 10 / 255, blue: 8 / 255))
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(isComplete ? Color.fwbAccentFill : Color(red: 236 / 255, green: 238 / 255, blue: 232 / 255), in: Capsule())
    }

    private func cardMetric(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value)
                .font(FWBFont.headline.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(Color.fwbWarmWhite)
            Text(title)
                .font(FWBFont.caption.weight(.bold))
                .foregroundStyle(Color.fwbMuted)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(10)
        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 0.5) }
        .accessibilityElement(children: .combine)
    }

    private var viewExercises: some View {
        NavigationLink {
            WorkoutHistoryDetailView(session: session)
        } label: {
            HStack(spacing: 6) {
                Text("View Exercises").underline(color: Color.fwbLime)
                Image(systemName: "arrow.right")
            }
            .font(FWBFont.subheadline.weight(.bold))
            .foregroundStyle(Color.fwbWarmWhite)
            .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
    }

    private var shareWorkout: some View {
        ShareLink(item: shareText) {
            Text("Share workout")
                .font(FWBFont.subheadline.weight(.bold))
                .foregroundStyle(Color.fwbWarmWhite)
                .underline(color: Color.fwbLime)
                .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
    }

    private var copyWorkoutButton: some View {
        Button { copyWorkout(session) } label: {
            Text("Copy Workout")
                .font(FWBFont.subheadline.weight(.bold))
                .foregroundStyle(Color.fwbWarmWhite)
                .underline(color: Color.fwbLime)
                .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Copy \(session.workoutTitle) to a new custom workout")
        .accessibilityHint("Copies the exercises and set values. The new workout starts with every set unfinished.")
        .accessibilityIdentifier("workoutHistory.copyWorkout")
    }
}

struct WorkoutHistoryDetailView: View {
    let session: WorkoutHistorySession

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(WorkoutHistoryFormat.date(session.entryDate))
                            .font(FWBFont.footnote.bold())
                            .foregroundStyle(Color.fwbLime)
                        Text(session.workoutTitle.fwbWorkoutDisplayTitle.fwbTitleCased)
                            .font(FWBFont.title.weight(.bold))
                            .foregroundStyle(Color.fwbWarmWhite)
                    }

                    WorkoutHistorySummary(session: session)

                    ForEach(session.exercises) { exercise in
                        WorkoutHistoryExerciseCard(exercise: exercise)
                    }
                }
                .padding(16)
            }
        }
        .navigationTitle("Workout Log")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
    }
}

private struct WorkoutHistorySummary: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let session: WorkoutHistorySession

    var body: some View {
        LazyVGrid(columns: workoutHistoryMetricColumns(for: dynamicTypeSize), spacing: 12) {
            if session.isCardioOnly {
                WorkoutHistoryMetric(
                    title: "Duration",
                    value: "\(WorkoutHistoryFormat.number(session.totalCardioMinutes)) min"
                )
                WorkoutHistoryMetric(
                    title: "Distance",
                    value: session.totalCardioDistance > 0
                        ? "\(WorkoutHistoryFormat.number(session.totalCardioDistance)) mi"
                        : "—"
                )
                WorkoutHistoryMetric(
                    title: "Calories",
                    value: session.totalCardioCalories > 0
                        ? WorkoutHistoryFormat.number(session.totalCardioCalories)
                        : "—"
                )
            } else {
                WorkoutHistoryMetric(title: "Exercises", value: "\(session.exercises.count)")
                WorkoutHistoryMetric(title: "Sets", value: "\(session.totalSets)")
                WorkoutHistoryMetric(title: "Reps", value: WorkoutHistoryFormat.number(session.totalReps))
                WorkoutHistoryMetric(title: "Volume", value: WorkoutHistoryFormat.weight(session.totalVolume))
                if session.totalTimedSeconds > 0 {
                    WorkoutHistoryMetric(
                        title: "Timed",
                        value: "\(WorkoutHistoryFormat.number(session.totalTimedSeconds)) sec"
                    )
                }
            }
        }
        .frame(maxWidth: .infinity)
        .fwbCard()
    }
}

private struct WorkoutHistoryExerciseCard: View {
    let exercise: WorkoutHistoryExercise

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                if !exercise.code.isEmpty {
                    Text(exercise.code.uppercased())
                        .font(FWBFont.footnote.bold())
                        .foregroundStyle(Color.fwbLime)
                }
                Text(exercise.name.isEmpty ? "Exercise" : exercise.name.fwbTitleCased)
                    .font(FWBFont.title3.weight(.bold))
                    .foregroundStyle(Color.fwbWarmWhite)
                Text(exerciseSummary)
                    .font(FWBFont.footnote)
                    .foregroundStyle(Color.fwbMuted)
            }

            FWBRule()

            ForEach(Array(exercise.records.enumerated()), id: \.offset) { index, record in
                WorkoutHistorySetRow(record: record)

                if index < exercise.records.count - 1 {
                    FWBRule(color: Color.fwbLine.opacity(0.6))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }

    private var exerciseSummary: String {
        guard exercise.isCardio else {
            let timedSeconds = exercise.totalTimedSeconds
            let warmUps = exercise.warmUpRecords.count
            let setCount = exercise.workingRecords.count
            var parts = ["\(setCount) sets"]
            if exercise.totalVolume > 0, timedSeconds > 0 {
                parts.append("\(WorkoutHistoryFormat.weight(exercise.totalVolume)) volume")
                parts.append("\(WorkoutHistoryFormat.number(timedSeconds)) sec")
            } else if timedSeconds > 0 {
                parts.append("\(WorkoutHistoryFormat.number(timedSeconds)) sec timed")
            } else {
                parts.append("\(WorkoutHistoryFormat.weight(exercise.totalVolume)) volume")
            }
            if warmUps > 0 { parts.append("\(warmUps) warm-up\(warmUps == 1 ? "" : "s")") }
            return parts.joined(separator: " · ")
        }
        let minutes = exercise.records.reduce(0) { $0 + $1.weightUsed }
        let distance = exercise.records.reduce(0) { $0 + ($1.reps ?? 0) }
        let durationText = "\(WorkoutHistoryFormat.number(minutes)) min"
        return distance > 0
            ? "\(durationText) · \(WorkoutHistoryFormat.number(distance)) mi"
            : durationText
    }
}

private struct WorkoutHistorySetRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let record: WorkoutHistoryRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if record.isCardio {
                LazyVGrid(columns: workoutHistoryMetricColumns(for: dynamicTypeSize), spacing: 12) {
                    WorkoutHistorySetValue(
                        title: "Duration",
                        value: record.weightUsed > 0
                            ? "\(WorkoutHistoryFormat.number(record.weightUsed)) min"
                            : "—"
                    )
                    WorkoutHistorySetValue(
                        title: "Distance",
                        value: (record.reps ?? 0) > 0
                            ? "\(WorkoutHistoryFormat.number(record.reps ?? 0)) mi"
                            : "—"
                    )
                    WorkoutHistorySetValue(
                        title: "Calories",
                        value: record.cardioDetails.calories.isEmpty
                            ? "—"
                            : record.cardioDetails.calories
                    )
                }
            } else {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 10) {
                        setNumberBadge
                        strengthValues
                    }
                } else {
                    HStack(spacing: 12) {
                        setNumberBadge
                        strengthValues
                        Spacer(minLength: 0)
                    }
                }

                WorkoutHistorySetTypeBadge(setType: record.resolvedSetType)
                    .padding(.leading, dynamicTypeSize.isAccessibilitySize ? 0 : 48)
            }

            let displayNotes = record.isCardio
                ? record.cardioDetails.notes
                : record.notes?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !displayNotes.isEmpty {
                Text(displayNotes)
                    .font(FWBFont.footnote)
                    .foregroundStyle(Color.fwbMuted)
                    .padding(.leading, record.isCardio || dynamicTypeSize.isAccessibilitySize ? 0 : 48)
            }
        }
    }

    private var setNumberBadge: some View {
        HStack(spacing: 8) {
            Text(record.isWarmUp ? "W\(record.warmUpOrdinal ?? 1)" : "\(record.setNumber)")
                .font(FWBFont.subheadline.weight(.bold))
                .foregroundStyle(record.isWarmUp ? Color.fwbLime : Color.black)
                .frame(width: 36, height: 36)
                .background(record.isWarmUp ? Color.fwbSurface : Color.fwbAccentFill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay {
                    if record.isWarmUp { RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.fwbLime, lineWidth: 1) }
                }

            if dynamicTypeSize.isAccessibilitySize {
                Text(record.isWarmUp ? "Warm-up \(record.warmUpOrdinal ?? 1)" : "Set \(record.setNumber)")
                    .font(FWBFont.footnote.weight(.bold))
                    .foregroundStyle(Color.fwbMuted)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(record.isWarmUp ? "Warm-up set \(record.warmUpOrdinal ?? 1)" : "Set \(record.setNumber)")
    }

    @ViewBuilder
    private var strengthValues: some View {
        Group {
            if record.resolvedSetType == .timed {
                WorkoutHistorySetValue(
                    title: "Time",
                    value: (record.durationSeconds ?? 0) > 0
                        ? "\(WorkoutHistoryFormat.number(record.durationSeconds ?? 0)) sec"
                        : "—"
                )
                WorkoutHistorySetValue(
                    title: "Load",
                    value: record.weightUsed > 0 ? "\(WorkoutHistoryFormat.number(record.weightUsed)) lb" : "—"
                )
            } else {
                WorkoutHistorySetValue(
                    title: "Weight",
                    value: record.weightUsed > 0 ? "\(WorkoutHistoryFormat.number(record.weightUsed)) lb" : "—"
                )
                WorkoutHistorySetValue(
                    title: "Reps",
                    value: (record.reps ?? 0) > 0 ? WorkoutHistoryFormat.number(record.reps ?? 0) : "—"
                )
            }
            if let effortLabel = record.effortLabel {
                WorkoutHistorySetValue(title: "Effort", value: effortLabel)
            }
        }
    }
}

private struct WorkoutHistorySetTypeBadge: View {
    let setType: WorkoutSetType

    var body: some View {
        Label(setType.title, systemImage: setType.systemImage)
            .font(FWBFont.caption2.weight(.bold))
            .foregroundStyle(typeColor)
            .accessibilityLabel("\(setType.title) set")
    }

    private var typeColor: Color {
        switch setType {
        case .working: return .fwbMuted
        case .warmUp: return .orange
        case .drop: return .cyan
        case .failure: return .red
        case .timed: return .purple
        }
    }
}

private struct WorkoutHistorySetValue: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(FWBFont.footnote.bold())
                .foregroundStyle(Color.fwbMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            Text(value)
                .font(FWBFont.subheadline.weight(.bold))
                .foregroundStyle(Color.fwbWarmWhite)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
        .frame(minWidth: 72, alignment: .leading)
    }
}

private struct WorkoutHistoryMetric: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(FWBFont.footnote.bold())
                .foregroundStyle(Color.fwbMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            Text(value)
                .font(FWBFont.headline.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(Color.fwbWarmWhite)
                .lineLimit(2)
                .minimumScaleFactor(0.85)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct WorkoutHistoryFilterButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    let isPrimary: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(FWBFont.subheadline.weight(.bold))
            .foregroundStyle(isPrimary ? Color.fwbCard : Color.fwbWarmWhite)
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(isPrimary ? Color.fwbWarmWhite : Color.fwbCard, in: RoundedRectangle(cornerRadius: 12))
            .overlay { RoundedRectangle(cornerRadius: 12).stroke(Color.fwbLine, lineWidth: isPrimary ? 0 : 1) }
            .opacity(isEnabled ? (configuration.isPressed ? 0.75 : 1) : 0.4)
    }
}

private struct WorkoutHistoryCSVDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.commaSeparatedText] }
    let data: Data

    init(sessions: [WorkoutHistorySession]) {
        let header = ["Date", "Workout", "Exercise code", "Exercise", "Set", "Set type", "Weight", "Reps", "Duration seconds", "Effort scale", "Effort", "Notes"]
        let rows = sessions.flatMap(\.records).map { record in
            [
                record.entryDate,
                record.workoutTitle,
                record.exerciseCode,
                record.exerciseName,
                String(record.setNumber),
                record.resolvedSetType.rawValue,
                String(record.weightUsed),
                record.reps.map { String($0) } ?? "",
                record.durationSeconds.map { String($0) } ?? "",
                record.effortScale?.title ?? "",
                record.effortValue.map { String($0) } ?? "",
                record.notes ?? ""
            ]
        }
        let csv = ([header] + rows).map { row in row.map(Self.cell).joined(separator: ",") }.joined(separator: "\r\n")
        data = Data(csv.utf8)
    }

    init(configuration: ReadConfiguration) throws {
        guard let contents = configuration.file.regularFileContents else {
            throw CocoaError(.fileReadCorruptFile)
        }
        data = contents
    }

    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents: data)
    }

    private static func cell(_ value: String) -> String {
        // Notes and exercise titles are text, including when they begin like a formula.
        let needsTextPrefix = value.first.map { "=+-@\t\r".contains($0) } ?? false
        let text = (needsTextPrefix ? "'" : "") + value
        return "\"" + text.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }
}

#if DEBUG
private enum WorkoutHistoryAudit {
    static let sessions: [WorkoutHistorySession] = [
        session(date: "2026-09-24", title: "Strength Foundations", exercises: [
            ("A1", "Goblet Squat", 40.0, 10.0),
            ("A2", "Dumbbell Chest Press", 30.0, 10.0),
            ("B1", "Seated Cable Row", 65.0, 12.0),
            ("B2", "Romanian Deadlift", 45.0, 10.0)
        ]),
        session(date: "2026-09-22", title: "Upper Body", exercises: [
            ("A1", "Dumbbell Chest Press", 25.0, 10.0),
            ("A2", "Seated Cable Row", 60.0, 12.0),
            ("B1", "Dumbbell Shoulder Press", 20.0, 10.0)
        ])
    ]

    private static func session(
        date: String,
        title: String,
        exercises: [(String, String, Double, Double)]
    ) -> WorkoutHistorySession {
        let records = exercises.enumerated().flatMap { exerciseIndex, exercise in
            (1...3).map { set in
                WorkoutHistoryRecord(
                    entryDate: date,
                    workoutTitle: title,
                    exerciseCode: exercise.0,
                    exerciseName: exercise.1,
                    exerciseOrder: exerciseIndex,
                    setNumber: set,
                    weightUsed: exercise.2,
                    reps: exercise.3,
                    notes: nil,
                    completedAt: Date(timeIntervalSince1970: 1_790_000_000),
                    effortScale: .rir,
                    effortValue: 2,
                    setType: .working
                )
            }
        }
        return WorkoutHistorySession(entryDate: date, workoutTitle: title, records: records)
    }
}
#endif

private enum WorkoutHistoryFormat {
    private static let databaseDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let displayDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = .current
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()

    static func date(_ value: String) -> String {
        guard let date = databaseDate.date(from: value) else { return value }
        return displayDate.string(from: date)
    }

    static func dateValue(_ value: String) -> Date? {
        databaseDate.date(from: value)
    }

    static func number(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

    static func weight(_ value: Double) -> String {
        "\(number(value)) lb"
    }
}
