import Charts
import SwiftUI

private let workoutHistoryMetricColumns = [
    GridItem(.flexible(), spacing: 10),
    GridItem(.flexible(), spacing: 10)
]

struct WorkoutHistoryView: View {
    let clientEmail: String

    @StateObject private var store = WorkoutHistoryStore()
    @State private var exerciseSearch = ""

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

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
        .navigationTitle("Workout History")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .task {
            await store.loadIfNeeded(email: clientEmail)
        }
    }

    @ViewBuilder
    private var historyContent: some View {
        if store.sessions.isEmpty {
            FWBEmptyState(
                icon: "list.bullet.clipboard",
                title: "No workouts logged yet",
                message: "Saved workouts will appear here after you record your first set."
            )
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    WorkoutHistoryHeading(
                        sessionCount: store.sessions.count,
                        setCount: store.sessions.reduce(0) { $0 + $1.strengthSetCount },
                        cardioCount: store.sessions.reduce(0) { $0 + $1.cardioRecords.count }
                    )

                    WorkoutExerciseSearchField(text: $exerciseSearch)

                    if normalizedExerciseSearch.isEmpty {
                        ForEach(store.sessions) { session in
                            NavigationLink {
                                WorkoutHistoryDetailView(session: session)
                            } label: {
                                WorkoutHistorySessionCard(session: session)
                            }
                            .buttonStyle(.plain)
                        }
                    } else if exerciseSearchResults.isEmpty {
                        WorkoutExerciseSearchEmptyState(query: exerciseSearch)
                    } else {
                        HStack {
                            Text("EXERCISE RESULTS")
                                .font(.footnote.bold())
                                .tracking(1.1)
                                .foregroundStyle(Color.fwbLime)
                            Spacer()
                            Text("\(exerciseSearchResults.count)")
                                .font(.footnote.bold())
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
                .padding(20)
            }
            .refreshable {
                await store.reload(email: clientEmail)
            }
        }
    }

    private var normalizedExerciseSearch: String {
        exerciseSearch.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private var exerciseSearchResults: [WorkoutExerciseSearchResult] {
        guard !normalizedExerciseSearch.isEmpty else { return [] }

        let occurrences = store.sessions.flatMap { session in
            session.exercises.map { exercise in
                WorkoutExerciseOccurrence(session: session, exercise: exercise)
            }
        }
        .filter { occurrence in
            occurrence.exercise.name.lowercased().contains(normalizedExerciseSearch)
                || occurrence.exercise.code.lowercased().contains(normalizedExerciseSearch)
        }

        let grouped = Dictionary(grouping: occurrences) { occurrence in
            let normalizedName = occurrence.exercise.name
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            return normalizedName.isEmpty ? occurrence.exercise.code.lowercased() : normalizedName
        }

        return grouped.compactMap { _, occurrences in
            guard let first = occurrences.first else { return nil }
            return WorkoutExerciseSearchResult(
                name: first.exercise.name.isEmpty ? "Exercise" : first.exercise.name,
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
    var totalSets: Int { occurrences.reduce(0) { $0 + $1.exercise.records.count } }
    var totalVolume: Double { occurrences.reduce(0) { $0 + $1.exercise.totalVolume } }
    var latestDate: String { occurrences.first?.session.entryDate ?? "" }
}

private struct WorkoutExerciseSearchField: View {
    @Binding var text: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.subheadline.weight(.bold))
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
        .background(Color.fwbSurface, in: Rectangle())
        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
        .accessibilityIdentifier("workoutHistory.exerciseSearch")
    }
}

private struct WorkoutExerciseSearchEmptyState: View {
    let query: String

    var body: some View {
        VStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.title2.bold())
                .foregroundStyle(Color.fwbLime)
            Text("No exercise matches")
                .font(.headline.weight(.black))
                .fontWidth(.condensed)
                .foregroundStyle(Color.fwbWarmWhite)
            Text("Nothing in your workout history matches “\(query)”.")
                .font(.footnote)
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
                        .font(.footnote.bold())
                        .tracking(0.8)
                        .foregroundStyle(Color.fwbLime)
                }
                Text(result.name)
                    .font(.title3.weight(.black))
                    .fontWidth(.condensed)
                    .foregroundStyle(Color.fwbWarmWhite)
                    .multilineTextAlignment(.leading)
                Text(
                    "Last done \(WorkoutHistoryFormat.date(result.latestDate)) · "
                        + "\(result.occurrences.count) workouts · \(result.totalSets) sets"
                )
                .font(.footnote)
                .foregroundStyle(Color.fwbMuted)
            }

            Spacer(minLength: 8)

            Image(systemName: "chevron.right")
                .font(.footnote.bold())
                .foregroundStyle(Color.fwbMuted)
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .accessibilityElement(children: .combine)
    }
}

private struct WorkoutExerciseHistoryDetailView: View {
    let result: WorkoutExerciseSearchResult

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 7) {
                        Text("EXERCISE HISTORY")
                            .font(.footnote.bold())
                            .tracking(1.2)
                            .foregroundStyle(Color.fwbLime)
                        Text(result.name)
                            .font(.largeTitle.weight(.black))
                            .fontWidth(.condensed)
                            .foregroundStyle(Color.fwbWarmWhite)
                    }

                    LazyVGrid(columns: workoutHistoryMetricColumns, spacing: 10) {
                        WorkoutHistoryMetric(title: "WORKOUTS", value: "\(result.occurrences.count)")
                        WorkoutHistoryMetric(title: "SETS", value: "\(result.totalSets)")
                        WorkoutHistoryMetric(
                            title: "VOLUME",
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
                .padding(20)
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
                $0.weightUsed > 0 || ($0.reps ?? 0) > 0
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
    enum Metric: String, CaseIterable, Identifiable {
        case maxWeight = "MAX WEIGHT"
        case estimatedOneRepMax = "EST. 1RM"
        case volume = "VOLUME"

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

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("PROGRESS")
                        .font(.footnote.bold())
                        .tracking(1.1)
                        .foregroundStyle(Color.fwbLime)
                    Text("Strength trend")
                        .font(.title3.weight(.black))
                        .fontWidth(.condensed)
                }

                Spacer()

                if let personalBest {
                    VStack(alignment: .trailing, spacing: 3) {
                        Text("PERSONAL BEST")
                            .font(.footnote.bold())
                            .tracking(0.7)
                            .foregroundStyle(Color.fwbMuted)
                        Text(WorkoutHistoryFormat.weight(personalBest))
                            .font(.headline.weight(.black))
                            .foregroundStyle(Color.fwbWarmWhite)
                    }
                }
            }

            HStack(spacing: 7) {
                ForEach(Metric.allCases) { option in
                    Button {
                        metric = option
                    } label: {
                        Text(option.rawValue)
                            .font(.footnote.bold())
                            .tracking(0.4)
                            .foregroundStyle(metric == option ? Color.black : Color.fwbWarmWhite)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .frame(minHeight: 38)
                            .background(metric == option ? Color.fwbAccentFill : Color.fwbSurface)
                            .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(option.label)
                    .accessibilityValue(metric == option ? "Selected" : "Not selected")
                    .accessibilityAddTraits(metric == option ? .isSelected : [])
                }
            }

            if displayPoints.isEmpty {
                Text(emptyStateMessage)
                    .font(.subheadline)
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
                    .font(.footnote)
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
                Text(WorkoutHistoryFormat.date(occurrence.session.entryDate).uppercased())
                    .font(.footnote.bold())
                    .tracking(0.9)
                    .foregroundStyle(Color.fwbLime)
                Text(occurrence.session.workoutTitle)
                    .font(.headline.weight(.black))
                    .fontWidth(.condensed)
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
    let sessionCount: Int
    let setCount: Int
    let cardioCount: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("TRAINING ARCHIVE")
                .font(.footnote.bold())
                .tracking(1.2)
                .foregroundStyle(Color.fwbLime)
            Text("Your workout log")
                .font(.largeTitle.weight(.black))
                .fontWidth(.condensed)
                .foregroundStyle(Color.fwbWarmWhite)
            Text(archiveSummary)
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
        }
        .padding(.bottom, 4)
    }

    private var archiveSummary: String {
        let base = "\(sessionCount) workouts · \(setCount) logged sets"
        return cardioCount > 0 ? "\(base) · \(cardioCount) cardio entries" : base
    }
}

private struct WorkoutHistorySessionCard: View {
    let session: WorkoutHistorySession

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(WorkoutHistoryFormat.date(session.entryDate).uppercased())
                        .font(.footnote.bold())
                        .tracking(0.9)
                        .foregroundStyle(Color.fwbLime)
                    Text(session.workoutTitle)
                        .font(.title3.weight(.black))
                        .fontWidth(.condensed)
                        .foregroundStyle(Color.fwbWarmWhite)
                        .multilineTextAlignment(.leading)
                }

                Spacer(minLength: 8)

                Image(systemName: "chevron.right")
                    .font(.footnote.bold())
                    .foregroundStyle(Color.fwbMuted)
                    .padding(.top, 8)
            }

            FWBRule()

            LazyVGrid(columns: workoutHistoryMetricColumns, spacing: 10) {
                if session.isCardioOnly {
                    WorkoutHistoryMetric(
                        title: "DURATION",
                        value: "\(WorkoutHistoryFormat.number(session.totalCardioMinutes)) min"
                    )
                    WorkoutHistoryMetric(
                        title: "DISTANCE",
                        value: session.totalCardioDistance > 0
                            ? "\(WorkoutHistoryFormat.number(session.totalCardioDistance)) mi"
                            : "—"
                    )
                    WorkoutHistoryMetric(
                        title: "CALORIES",
                        value: session.totalCardioCalories > 0
                            ? WorkoutHistoryFormat.number(session.totalCardioCalories)
                            : "—"
                    )
                } else {
                    WorkoutHistoryMetric(title: "EXERCISES", value: "\(session.exercises.count)")
                    WorkoutHistoryMetric(title: "SETS", value: "\(session.totalSets)")
                    WorkoutHistoryMetric(title: "VOLUME", value: WorkoutHistoryFormat.weight(session.totalVolume))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(WorkoutHistoryFormat.date(session.entryDate)), \(session.workoutTitle), "
                + "\(session.exercises.count) exercises, \(session.totalSets) sets"
        )
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
                        Text(WorkoutHistoryFormat.date(session.entryDate).uppercased())
                            .font(.footnote.bold())
                            .tracking(1.2)
                            .foregroundStyle(Color.fwbLime)
                        Text(session.workoutTitle)
                            .font(.largeTitle.weight(.black))
                            .fontWidth(.condensed)
                            .foregroundStyle(Color.fwbWarmWhite)
                    }

                    WorkoutHistorySummary(session: session)

                    ForEach(session.exercises) { exercise in
                        WorkoutHistoryExerciseCard(exercise: exercise)
                    }
                }
                .padding(20)
            }
        }
        .navigationTitle("Workout Log")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
    }
}

private struct WorkoutHistorySummary: View {
    let session: WorkoutHistorySession

    var body: some View {
        LazyVGrid(columns: workoutHistoryMetricColumns, spacing: 10) {
            if session.isCardioOnly {
                WorkoutHistoryMetric(
                    title: "DURATION",
                    value: "\(WorkoutHistoryFormat.number(session.totalCardioMinutes)) min"
                )
                WorkoutHistoryMetric(
                    title: "DISTANCE",
                    value: session.totalCardioDistance > 0
                        ? "\(WorkoutHistoryFormat.number(session.totalCardioDistance)) mi"
                        : "—"
                )
                WorkoutHistoryMetric(
                    title: "CALORIES",
                    value: session.totalCardioCalories > 0
                        ? WorkoutHistoryFormat.number(session.totalCardioCalories)
                        : "—"
                )
            } else {
                WorkoutHistoryMetric(title: "EXERCISES", value: "\(session.exercises.count)")
                WorkoutHistoryMetric(title: "SETS", value: "\(session.totalSets)")
                WorkoutHistoryMetric(title: "REPS", value: WorkoutHistoryFormat.number(session.totalReps))
                WorkoutHistoryMetric(title: "VOLUME", value: WorkoutHistoryFormat.weight(session.totalVolume))
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
                        .font(.footnote.bold())
                        .tracking(0.8)
                        .foregroundStyle(Color.fwbLime)
                }
                Text(exercise.name.isEmpty ? "Exercise" : exercise.name)
                    .font(.title3.weight(.black))
                    .fontWidth(.condensed)
                    .foregroundStyle(Color.fwbWarmWhite)
                Text(exerciseSummary)
                    .font(.footnote)
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
            return "\(exercise.records.count) sets · \(WorkoutHistoryFormat.weight(exercise.totalVolume)) volume"
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
    let record: WorkoutHistoryRecord

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if record.isCardio {
                LazyVGrid(columns: workoutHistoryMetricColumns, spacing: 10) {
                    WorkoutHistorySetValue(
                        title: "DURATION",
                        value: record.weightUsed > 0
                            ? "\(WorkoutHistoryFormat.number(record.weightUsed)) min"
                            : "—"
                    )
                    WorkoutHistorySetValue(
                        title: "DISTANCE",
                        value: (record.reps ?? 0) > 0
                            ? "\(WorkoutHistoryFormat.number(record.reps ?? 0)) mi"
                            : "—"
                    )
                    WorkoutHistorySetValue(
                        title: "CALORIES",
                        value: record.cardioDetails.calories.isEmpty
                            ? "—"
                            : record.cardioDetails.calories
                    )
                }
            } else {
                HStack(spacing: 12) {
                    Text("\(record.setNumber)")
                        .font(.subheadline.weight(.black))
                        .foregroundStyle(Color.black)
                        .frame(width: 36, height: 36)
                        .background(Color.fwbAccentFill, in: Rectangle())

                    WorkoutHistorySetValue(
                        title: "WEIGHT",
                        value: record.weightUsed > 0 ? "\(WorkoutHistoryFormat.number(record.weightUsed)) lb" : "—"
                    )
                    WorkoutHistorySetValue(
                        title: "REPS",
                        value: (record.reps ?? 0) > 0 ? WorkoutHistoryFormat.number(record.reps ?? 0) : "—"
                    )

                    Spacer(minLength: 0)
                }
            }

            let displayNotes = record.isCardio
                ? record.cardioDetails.notes
                : record.notes?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !displayNotes.isEmpty {
                Text(displayNotes)
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)
                    .padding(.leading, record.isCardio ? 0 : 48)
            }
        }
    }
}

private struct WorkoutHistorySetValue: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.footnote.bold())
                .tracking(0.7)
                .foregroundStyle(Color.fwbMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            Text(value)
                .font(.subheadline.weight(.bold))
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
        VStack(spacing: 4) {
            Text(title)
                .font(.footnote.bold())
                .tracking(0.7)
                .foregroundStyle(Color.fwbMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            Text(value)
                .font(.footnote.weight(.black))
                .foregroundStyle(Color.fwbWarmWhite)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
        }
        .frame(maxWidth: .infinity)
    }
}

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
