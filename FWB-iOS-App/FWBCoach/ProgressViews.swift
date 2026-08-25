import Charts
import SwiftUI

struct ProgressDashboardView: View {
    let clientEmail: String

    @StateObject private var store = WorkoutHistoryStore()

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            switch store.state {
            case .idle, .loading:
                ProgressView("Loading your progress…")
                    .tint(Color.fwbLime)
            case .loaded:
                if store.sessions.isEmpty {
                    FWBEmptyState(
                        icon: "chart.line.uptrend.xyaxis",
                        title: "Your progress starts here",
                        message: "Finish your first workout to unlock personal records, trends, and achievements."
                    )
                } else {
                    ProgressDashboardContent(sessions: store.sessions)
                }
            case .failed(let message):
                FWBErrorState(message: message) {
                    Task { await store.reload(email: clientEmail) }
                }
            }
        }
        .navigationTitle("Progress")
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .refreshable {
            await store.reload(email: clientEmail)
        }
        .task {
            await store.loadIfNeeded(email: clientEmail)
        }
        .onReceive(NotificationCenter.default.publisher(for: .fwbForegroundRefresh)) { _ in
            Task { await store.reload(email: clientEmail) }
        }
    }
}

private struct ProgressDashboardContent: View {
    let sessions: [WorkoutHistorySession]
    @AppStorage("weeklyWorkoutGoal") private var weeklyWorkoutGoal = 3

    private var snapshot: ProgressSnapshot {
        ProgressSnapshot(sessions: sessions, weeklyGoal: weeklyWorkoutGoal)
    }

    private var shareSummary: ProgressShareSummary {
        let weeklyCompleted = sessions.filter { session in
            guard let date = ProgressFormat.dateValue(session.entryDate) else { return false }
            return Calendar.current.isDate(date, equalTo: Date(), toGranularity: .weekOfYear)
        }.count

        return ProgressShareSummary(
            kicker: "MY FWB PROGRESS",
            headline: "PROGRESS\nIN MOTION.",
            message: "Consistency is the win. Keep showing up.",
            stats: [
                ProgressShareStat(title: "WORKOUTS", value: "\(snapshot.workoutCount)"),
                ProgressShareStat(title: "SETS", value: "\(snapshot.totalSets)"),
                ProgressShareStat(title: "PERSONAL BESTS", value: "\(snapshot.personalBestCount)")
            ],
            weeklyCompleted: weeklyCompleted,
            weeklyGoal: max(weeklyWorkoutGoal, 1),
            caption: "Building consistency with FWB Training: \(snapshot.workoutCount) workouts completed and \(snapshot.personalBestCount) personal bests established."
        )
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                ProgressHero()
                ProgressSharePanel(summary: shareSummary)
                ProgressOverviewGrid(snapshot: snapshot)
                TrainingVolumeCard(points: snapshot.volumePoints)
                PersonalRecordsSection(records: snapshot.exerciseRecords)
                AchievementSection(achievements: snapshot.achievements)
            }
            .padding(20)
        }
    }
}

private struct ProgressHero: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("PERFORMANCE")
                .font(.footnote.bold())
                .tracking(1.3)
                .foregroundStyle(Color.fwbLime)

            Text("BREAK RECORDS.\nHIT YOUR GOALS.")
                .font(.system(size: 38, weight: .black))
                .fontWidth(.condensed)
                .foregroundStyle(Color.fwbWarmWhite)
                .minimumScaleFactor(0.75)

            Text("Every finished workout builds your personal performance dashboard.")
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct ProgressOverviewGrid: View {
    let snapshot: ProgressSnapshot

    private let columns = [
        GridItem(.flexible(), spacing: 10),
        GridItem(.flexible(), spacing: 10)
    ]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 10) {
            ProgressMetricCard(
                icon: "checkmark.circle.fill",
                label: "WORKOUTS",
                value: "\(snapshot.workoutCount)"
            )
            ProgressMetricCard(
                icon: "square.stack.3d.up.fill",
                label: "SETS LOGGED",
                value: "\(snapshot.totalSets)"
            )
            ProgressMetricCard(
                icon: "scalemass.fill",
                label: "TOTAL VOLUME",
                value: ProgressFormat.compactWeight(snapshot.totalVolume)
            )
            ProgressMetricCard(
                icon: "trophy.fill",
                label: "PERSONAL BESTS",
                value: "\(snapshot.personalBestCount)"
            )
        }
    }
}

private struct ProgressMetricCard: View {
    let icon: String
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(systemName: icon)
                .font(.headline.weight(.black))
                .foregroundStyle(Color.fwbLime)

            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                    .font(.footnote.bold())
                    .tracking(0.8)
                    .foregroundStyle(Color.fwbMuted)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .fixedSize(horizontal: false, vertical: true)
                Text(value)
                    .font(.title2.weight(.black))
                    .fontWidth(.condensed)
                    .foregroundStyle(Color.fwbWarmWhite)
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 104, alignment: .leading)
        .fwbCard()
        .accessibilityElement(children: .combine)
    }
}

private struct TrainingVolumeCard: View {
    enum Range: String, CaseIterable, Identifiable {
        case recent = "RECENT"
        case all = "ALL TIME"

        var id: String { rawValue }
    }

    let points: [ProgressVolumePoint]

    @State private var range: Range = .recent

    private var displayedPoints: [ProgressVolumePoint] {
        switch range {
        case .recent: return Array(points.suffix(12))
        case .all: return points
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("TRAINING VOLUME")
                        .font(.footnote.bold())
                        .tracking(1.1)
                        .foregroundStyle(Color.fwbLime)
                    Text("Workload trend")
                        .font(.title3.weight(.black))
                        .fontWidth(.condensed)
                        .foregroundStyle(Color.fwbWarmWhite)
                }

                Spacer()

                Text(ProgressFormat.compactWeight(displayedPoints.reduce(0) { $0 + $1.volume }))
                    .font(.headline.weight(.black))
                    .foregroundStyle(Color.fwbWarmWhite)
                    .accessibilityLabel("Total displayed volume")
            }

            HStack(spacing: 7) {
                ForEach(Range.allCases) { option in
                    Button {
                        range = option
                    } label: {
                        Text(option.rawValue)
                            .font(.footnote.bold())
                            .tracking(0.5)
                            .foregroundStyle(range == option ? Color.black : Color.fwbWarmWhite)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .frame(minHeight: 36)
                            .background(range == option ? Color.fwbAccentFill : Color.fwbSurface)
                            .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(range == option ? .isSelected : [])
                }
            }

            if displayedPoints.allSatisfy({ $0.volume <= 0 }) {
                Text("Log weight and reps to start your volume chart.")
                    .font(.subheadline)
                    .foregroundStyle(Color.fwbMuted)
                    .frame(maxWidth: .infinity, minHeight: 150, alignment: .center)
            } else {
                Chart(displayedPoints) { point in
                    AreaMark(
                        x: .value("Date", point.date),
                        y: .value("Volume", point.volume)
                    )
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color.fwbLime.opacity(0.3), Color.fwbLime.opacity(0.015)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )

                    LineMark(
                        x: .value("Date", point.date),
                        y: .value("Volume", point.volume)
                    )
                    .foregroundStyle(Color.fwbLime)
                    .lineStyle(StrokeStyle(lineWidth: 3))

                    PointMark(
                        x: .value("Date", point.date),
                        y: .value("Volume", point.volume)
                    )
                    .foregroundStyle(Color.fwbLime)
                    .symbolSize(42)
                }
                .chartXAxis {
                    AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                        AxisGridLine().foregroundStyle(Color.fwbLine.opacity(0.35))
                        AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                            .foregroundStyle(Color.fwbMuted)
                    }
                }
                .chartYAxis {
                    AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { value in
                        AxisGridLine().foregroundStyle(Color.fwbLine.opacity(0.35))
                        AxisValueLabel {
                            if let volume = value.as(Double.self) {
                                Text(ProgressFormat.compactNumber(volume))
                                    .foregroundStyle(Color.fwbMuted)
                            }
                        }
                    }
                }
                .frame(height: 190)
                .accessibilityLabel("Training volume trend")
                .accessibilityValue("\(displayedPoints.count) logged training days")
            }

            Text(displayedPoints.count == 1 ? "Finish another workout to create a trend line." : "Based on \(displayedPoints.count) logged training days.")
                .font(.footnote)
                .foregroundStyle(Color.fwbMuted)
        }
        .fwbCard()
        .animation(.easeOut(duration: 0.18), value: range)
    }
}

private struct PersonalRecordsSection: View {
    let records: [ProgressExerciseRecord]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ProgressSectionHeading(
                kicker: "PERSONAL RECORDS",
                title: "Your strongest lifts",
                detail: "Open an exercise to see its performance history."
            )

            if records.isEmpty {
                Text("Log weight or reps to establish your first personal best.")
                    .font(.subheadline)
                    .foregroundStyle(Color.fwbMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fwbCard()
            } else {
                ForEach(records.prefix(6)) { record in
                    NavigationLink {
                        ProgressExerciseDetailView(record: record)
                    } label: {
                        PersonalRecordCard(record: record)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private struct PersonalRecordCard: View {
    let record: ProgressExerciseRecord

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "trophy.fill")
                .font(.headline.weight(.black))
                .foregroundStyle(Color.black)
                .frame(width: 44, height: 44)
                .background(Color.fwbAccentFill, in: Rectangle())

            VStack(alignment: .leading, spacing: 4) {
                Text(record.name)
                    .font(.headline.weight(.black))
                    .fontWidth(.condensed)
                    .foregroundStyle(Color.fwbWarmWhite)
                    .lineLimit(2)
                Text(record.bestSetDescription)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.fwbLime)
                Text("\(record.workoutCount) workouts · Last done \(ProgressFormat.displayDate(record.latestDate))")
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)
            }

            Spacer(minLength: 4)

            Image(systemName: "chevron.right")
                .font(.footnote.bold())
                .foregroundStyle(Color.fwbMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .accessibilityElement(children: .combine)
        .accessibilityHint("Shows exercise progress")
    }
}

private struct AchievementSection: View {
    let achievements: [ProgressAchievement]

    private var unlockedCount: Int {
        achievements.filter(\.isUnlocked).count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ProgressSectionHeading(
                kicker: "ACHIEVEMENTS",
                title: "Keep building momentum",
                detail: "\(unlockedCount) of \(achievements.count) milestones unlocked"
            )

            ForEach(achievements) { achievement in
                AchievementCard(achievement: achievement)
            }
        }
    }
}

private struct AchievementCard: View {
    let achievement: ProgressAchievement

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: achievement.icon)
                .font(.headline.weight(.black))
                .foregroundStyle(achievement.isUnlocked ? Color.black : Color.fwbMuted)
                .frame(width: 44, height: 44)
                .background(achievement.isUnlocked ? Color.fwbAccentFill : Color.fwbSurface, in: Rectangle())
                .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }

            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    Text(achievement.title)
                        .font(.headline.weight(.black))
                        .fontWidth(.condensed)
                        .foregroundStyle(achievement.isUnlocked ? Color.fwbWarmWhite : Color.fwbMuted)
                    Spacer()
                    Text(achievement.isUnlocked ? "UNLOCKED" : achievement.progressLabel)
                        .font(.footnote.bold())
                        .tracking(0.6)
                        .foregroundStyle(achievement.isUnlocked ? Color.fwbLime : Color.fwbMuted)
                }

                Text(achievement.detail)
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)

                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        Rectangle().fill(Color.fwbSurface)
                        Rectangle()
                            .fill(achievement.isUnlocked ? Color.fwbAccentFill : Color.fwbLine)
                            .frame(width: geometry.size.width * achievement.progress)
                    }
                }
                .frame(height: 4)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .accessibilityElement(children: .combine)
    }
}

private struct ProgressSectionHeading: View {
    let kicker: String
    let title: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(kicker)
                .font(.footnote.bold())
                .tracking(1.1)
                .foregroundStyle(Color.fwbLime)
            Text(title)
                .font(.title2.weight(.black))
                .fontWidth(.condensed)
                .foregroundStyle(Color.fwbWarmWhite)
            Text(detail)
                .font(.footnote)
                .foregroundStyle(Color.fwbMuted)
        }
    }
}

private struct ProgressExerciseDetailView: View {
    enum Metric: String, CaseIterable, Identifiable {
        case maxWeight = "MAX WEIGHT"
        case estimatedOneRepMax = "EST. 1RM"
        case volume = "VOLUME"

        var id: String { rawValue }
    }

    let record: ProgressExerciseRecord

    @State private var metric: Metric = .maxWeight

    private var displayPoints: [ProgressExercisePoint] {
        record.points.filter { value(for: $0) > 0 }
    }

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 7) {
                        Text("PERSONAL PERFORMANCE")
                            .font(.footnote.bold())
                            .tracking(1.2)
                            .foregroundStyle(Color.fwbLime)
                        Text(record.name)
                            .font(.largeTitle.weight(.black))
                            .fontWidth(.condensed)
                            .foregroundStyle(Color.fwbWarmWhite)
                    }

                    LazyVGrid(
                        columns: [
                            GridItem(.flexible(), spacing: 10),
                            GridItem(.flexible(), spacing: 10)
                        ],
                        spacing: 10
                    ) {
                        ProgressDetailMetric(label: "BEST SET", value: record.bestSetDescription)
                        ProgressDetailMetric(label: "WORKOUTS", value: "\(record.workoutCount)")
                        ProgressDetailMetric(label: "VOLUME", value: ProgressFormat.compactWeight(record.totalVolume))
                    }
                    .fwbCard()

                    VStack(alignment: .leading, spacing: 16) {
                        HStack(spacing: 7) {
                            ForEach(Metric.allCases) { option in
                                Button {
                                    metric = option
                                } label: {
                                    Text(option.rawValue)
                                        .font(.footnote.bold())
                                        .tracking(0.35)
                                        .foregroundStyle(metric == option ? Color.black : Color.fwbWarmWhite)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 8)
                                        .frame(minHeight: 38)
                                        .background(metric == option ? Color.fwbAccentFill : Color.fwbSurface)
                                        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                                }
                                .buttonStyle(.plain)
                            }
                        }

                        if displayPoints.isEmpty {
                            Text("No values have been logged for this metric yet.")
                                .font(.subheadline)
                                .foregroundStyle(Color.fwbMuted)
                                .frame(maxWidth: .infinity, minHeight: 170, alignment: .center)
                        } else {
                            Chart(displayPoints) { point in
                                LineMark(
                                    x: .value("Date", point.date),
                                    y: .value(metric.rawValue, value(for: point))
                                )
                                .foregroundStyle(Color.fwbLime)
                                .lineStyle(StrokeStyle(lineWidth: 3))

                                PointMark(
                                    x: .value("Date", point.date),
                                    y: .value(metric.rawValue, value(for: point))
                                )
                                .foregroundStyle(Color.fwbLime)
                                .symbolSize(52)
                            }
                            .chartXAxis {
                                AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                                    AxisGridLine().foregroundStyle(Color.fwbLine.opacity(0.35))
                                    AxisValueLabel(format: .dateTime.month(.abbreviated).day())
                                        .foregroundStyle(Color.fwbMuted)
                                }
                            }
                            .chartYAxis {
                                AxisMarks(position: .leading) { _ in
                                    AxisGridLine().foregroundStyle(Color.fwbLine.opacity(0.35))
                                    AxisValueLabel().foregroundStyle(Color.fwbMuted)
                                }
                            }
                            .frame(height: 220)
                            .accessibilityLabel("\(metric.rawValue) trend for \(record.name)")
                        }
                    }
                    .fwbCard()

                    ProgressSectionHeading(
                        kicker: "WORKOUT HISTORY",
                        title: "Recent performances",
                        detail: "\(record.workoutCount) logged workouts"
                    )

                    ForEach(record.points.sorted { $0.date > $1.date }) { point in
                        ProgressPerformanceRow(point: point)
                    }
                }
                .padding(20)
            }
        }
        .navigationTitle("Exercise Progress")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .animation(.easeOut(duration: 0.18), value: metric)
    }

    private func value(for point: ProgressExercisePoint) -> Double {
        switch metric {
        case .maxWeight: return point.maxWeight
        case .estimatedOneRepMax: return point.estimatedOneRepMax
        case .volume: return point.volume
        }
    }
}

private struct ProgressDetailMetric: View {
    let label: String
    let value: String

    var body: some View {
        VStack(spacing: 5) {
            Text(label)
                .font(.footnote.bold())
                .tracking(0.6)
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

private struct ProgressPerformanceRow: View {
    let point: ProgressExercisePoint

    var body: some View {
        HStack(spacing: 14) {
            VStack(spacing: 2) {
                Text(ProgressFormat.day(point.date))
                    .font(.title3.weight(.black))
                    .fontWidth(.condensed)
                    .foregroundStyle(Color.fwbWarmWhite)
                Text(ProgressFormat.month(point.date).uppercased())
                    .font(.footnote.bold())
                    .tracking(0.7)
                    .foregroundStyle(Color.fwbLime)
            }
            .frame(width: 44, height: 48)
            .background(Color.fwbSurface, in: Rectangle())

            VStack(alignment: .leading, spacing: 4) {
                Text(point.workoutTitle)
                    .font(.headline.weight(.black))
                    .fontWidth(.condensed)
                    .foregroundStyle(Color.fwbWarmWhite)
                Text(point.bestSetDescription)
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(Color.fwbLime)
            }

            Spacer()

            Text(ProgressFormat.compactWeight(point.volume))
                .font(.footnote.weight(.bold))
                .foregroundStyle(Color.fwbMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .accessibilityElement(children: .combine)
    }
}

private struct ProgressSnapshot {
    let workoutCount: Int
    let totalSets: Int
    let totalVolume: Double
    let personalBestCount: Int
    let volumePoints: [ProgressVolumePoint]
    let exerciseRecords: [ProgressExerciseRecord]
    let achievements: [ProgressAchievement]

    init(sessions: [WorkoutHistorySession], weeklyGoal: Int) {
        workoutCount = sessions.count
        totalSets = sessions.reduce(0) { $0 + $1.strengthSetCount }
        totalVolume = sessions.reduce(0) { $0 + $1.totalVolume }

        volumePoints = Self.makeVolumePoints(sessions: sessions)
        exerciseRecords = Self.makeExerciseRecords(sessions: sessions)
        personalBestCount = exerciseRecords.filter { $0.bestWeight > 0 || $0.bestReps > 0 }.count
        achievements = Self.makeAchievements(
            workouts: workoutCount,
            sets: totalSets,
            volume: totalVolume,
            personalBests: personalBestCount,
            cardioWorkouts: sessions.filter { !$0.cardioRecords.isEmpty }.count,
            currentWeekWorkouts: Self.currentWeekWorkoutCount(sessions),
            weeklyGoal: weeklyGoal,
            consecutiveWeeks: Self.longestConsecutiveWeekStreak(sessions)
        )
    }

    private static func makeVolumePoints(sessions: [WorkoutHistorySession]) -> [ProgressVolumePoint] {
        let datedSessions = sessions.compactMap { session -> (Date, WorkoutHistorySession)? in
            guard let date = ProgressFormat.dateValue(session.entryDate) else { return nil }
            return (date, session)
        }
        let grouped = Dictionary(grouping: datedSessions, by: \.0)

        return grouped.map { date, values in
            ProgressVolumePoint(
                date: date,
                volume: values.reduce(0) { $0 + $1.1.totalVolume }
            )
        }
        .sorted { $0.date < $1.date }
    }

    private static func makeExerciseRecords(sessions: [WorkoutHistorySession]) -> [ProgressExerciseRecord] {
        struct Occurrence {
            let session: WorkoutHistorySession
            let exercise: WorkoutHistoryExercise
        }

        let occurrences = sessions.flatMap { session in
            session.exercises
                .filter { !$0.isCardio }
                .map { Occurrence(session: session, exercise: $0) }
        }
        let grouped = Dictionary(grouping: occurrences) { occurrence in
            let name = occurrence.exercise.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return name.isEmpty ? occurrence.exercise.code.lowercased() : name
        }

        return grouped.compactMap { id, occurrences in
            guard let first = occurrences.first else { return nil }
            let points = occurrences.compactMap { occurrence -> ProgressExercisePoint? in
                guard let date = ProgressFormat.dateValue(occurrence.session.entryDate) else { return nil }
                let workingRecords = occurrence.exercise.records.filter(\.countsTowardWorkingMetrics)
                guard !workingRecords.isEmpty else { return nil }
                let bestRecord = workingRecords.max { left, right in
                    let leftScore = left.weightUsed > 0 ? left.weightUsed * (1 + (left.reps ?? 0) / 30) : (left.reps ?? 0)
                    let rightScore = right.weightUsed > 0 ? right.weightUsed * (1 + (right.reps ?? 0) / 30) : (right.reps ?? 0)
                    return leftScore < rightScore
                }
                let maxWeight = workingRecords.map(\.weightUsed).max() ?? 0
                let maxReps = workingRecords.compactMap(\.reps).max() ?? 0
                let estimatedOneRepMax = workingRecords.map { record in
                    guard record.weightUsed > 0, let reps = record.reps, reps > 0 else { return 0 }
                    return record.weightUsed * (1 + reps / 30)
                }
                .max() ?? 0

                return ProgressExercisePoint(
                    id: "\(occurrence.session.id)|\(occurrence.exercise.id)",
                    date: date,
                    workoutTitle: occurrence.session.workoutTitle,
                    maxWeight: maxWeight,
                    bestReps: maxReps,
                    estimatedOneRepMax: estimatedOneRepMax,
                    volume: occurrence.exercise.totalVolume,
                    bestSetDescription: ProgressFormat.setDescription(
                        weight: bestRecord?.weightUsed ?? 0,
                        reps: bestRecord?.reps ?? 0
                    )
                )
            }
            .sorted { $0.date < $1.date }

            guard let latest = points.last else { return nil }
            let bestPoint = points.max {
                let left = $0.estimatedOneRepMax > 0 ? $0.estimatedOneRepMax : $0.bestReps
                let right = $1.estimatedOneRepMax > 0 ? $1.estimatedOneRepMax : $1.bestReps
                return left < right
            }

            return ProgressExerciseRecord(
                id: id,
                name: first.exercise.name.isEmpty ? "Exercise" : first.exercise.name,
                latestDate: latest.date,
                points: points,
                bestWeight: points.map(\.maxWeight).max() ?? 0,
                bestReps: points.map(\.bestReps).max() ?? 0,
                bestSetDescription: bestPoint?.bestSetDescription ?? "No result",
                totalVolume: points.reduce(0) { $0 + $1.volume }
            )
        }
        .filter { $0.bestWeight > 0 || $0.bestReps > 0 }
        .sorted { left, right in
            if left.strengthScore == right.strengthScore {
                return left.latestDate > right.latestDate
            }
            return left.strengthScore > right.strengthScore
        }
    }

    private static func makeAchievements(
        workouts: Int,
        sets: Int,
        volume: Double,
        personalBests: Int,
        cardioWorkouts: Int,
        currentWeekWorkouts: Int,
        weeklyGoal: Int,
        consecutiveWeeks: Int
    ) -> [ProgressAchievement] {
        [
            ProgressAchievement(
                id: "first-workout",
                icon: "flag.checkered",
                title: "First Workout",
                detail: "Complete and save your first training session.",
                current: Double(workouts),
                target: 1,
                unit: "workout"
            ),
            ProgressAchievement(
                id: "first-personal-best",
                icon: "trophy.fill",
                title: "First Personal Best",
                detail: "Establish a personal best in any exercise.",
                current: Double(personalBests),
                target: 1,
                unit: "record"
            ),
            ProgressAchievement(
                id: "first-cardio",
                icon: "figure.run",
                title: "First Cardio Workout",
                detail: "Complete and save your first cardio session.",
                current: Double(cardioWorkouts),
                target: 1,
                unit: "workout"
            ),
            ProgressAchievement(
                id: "weekly-goal",
                icon: "calendar.badge.checkmark",
                title: "Weekly Goal",
                detail: "Complete your workout goal for the current week.",
                current: Double(currentWeekWorkouts),
                target: Double(max(weeklyGoal, 1)),
                unit: "workouts"
            ),
            ProgressAchievement(
                id: "three-consistent-weeks",
                icon: "calendar.badge.clock",
                title: "Three Consistent Weeks",
                detail: "Train in three consecutive calendar weeks.",
                current: Double(consecutiveWeeks),
                target: 3,
                unit: "weeks"
            ),
            ProgressAchievement(
                id: "five-workouts",
                icon: "flame.fill",
                title: "Momentum",
                detail: "Build consistency with five finished workouts.",
                current: Double(workouts),
                target: 5,
                unit: "workouts"
            ),
            ProgressAchievement(
                id: "fifty-sets",
                icon: "square.stack.3d.up.fill",
                title: "Set Collector",
                detail: "Log fifty completed working sets.",
                current: Double(sets),
                target: 50,
                unit: "sets"
            ),
            ProgressAchievement(
                id: "ten-thousand-volume",
                icon: "scalemass.fill",
                title: "Ten Thousand Club",
                detail: "Move a cumulative 10,000 lb in logged workouts.",
                current: volume,
                target: 10_000,
                unit: "lb"
            ),
            ProgressAchievement(
                id: "five-records",
                icon: "trophy.fill",
                title: "Record Breaker",
                detail: "Establish personal bests in five exercises.",
                current: Double(personalBests),
                target: 5,
                unit: "records"
            )
        ]
    }

    private static func currentWeekWorkoutCount(_ sessions: [WorkoutHistorySession]) -> Int {
        let calendar = Calendar.current
        return sessions.filter { session in
            guard let date = ProgressFormat.dateValue(session.entryDate) else { return false }
            return calendar.isDate(date, equalTo: Date(), toGranularity: .weekOfYear)
        }.count
    }

    private static func longestConsecutiveWeekStreak(_ sessions: [WorkoutHistorySession]) -> Int {
        let calendar = Calendar.current
        let weekStarts = Set(sessions.compactMap { session -> Date? in
            guard let date = ProgressFormat.dateValue(session.entryDate) else { return nil }
            return calendar.dateInterval(of: .weekOfYear, for: date)?.start
        })
        guard !weekStarts.isEmpty else { return 0 }

        var best = 1
        var current = 1
        let sorted = weekStarts.sorted()
        for index in sorted.indices.dropFirst() {
            guard let expected = calendar.date(byAdding: .weekOfYear, value: 1, to: sorted[index - 1]) else {
                continue
            }
            if calendar.isDate(sorted[index], inSameDayAs: expected) {
                current += 1
                best = max(best, current)
            } else {
                current = 1
            }
        }
        return best
    }
}

private struct ProgressVolumePoint: Identifiable {
    let date: Date
    let volume: Double

    var id: Date { date }
}

private struct ProgressExerciseRecord: Identifiable {
    let id: String
    let name: String
    let latestDate: Date
    let points: [ProgressExercisePoint]
    let bestWeight: Double
    let bestReps: Double
    let bestSetDescription: String
    let totalVolume: Double

    var workoutCount: Int { points.count }
    var strengthScore: Double {
        points.map(\.estimatedOneRepMax).max() ?? 0
    }
}

private struct ProgressExercisePoint: Identifiable {
    let id: String
    let date: Date
    let workoutTitle: String
    let maxWeight: Double
    let bestReps: Double
    let estimatedOneRepMax: Double
    let volume: Double
    let bestSetDescription: String
}

private struct ProgressAchievement: Identifiable {
    let id: String
    let icon: String
    let title: String
    let detail: String
    let current: Double
    let target: Double
    let unit: String

    var isUnlocked: Bool { current >= target }
    var progress: Double { min(max(current / target, 0), 1) }
    var progressLabel: String {
        "\(ProgressFormat.compactNumber(current))/\(ProgressFormat.compactNumber(target)) \(unit)"
    }
}

private enum ProgressFormat {
    private static let databaseDate: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let displayDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = .current
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()

    private static let dayFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "d"
        return formatter
    }()

    private static let monthFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM"
        return formatter
    }()

    static func dateValue(_ value: String) -> Date? {
        databaseDate.date(from: value)
    }

    static func displayDate(_ date: Date) -> String {
        displayDateFormatter.string(from: date)
    }

    static func day(_ date: Date) -> String {
        dayFormatter.string(from: date)
    }

    static func month(_ date: Date) -> String {
        monthFormatter.string(from: date)
    }

    static func number(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

    static func compactNumber(_ value: Double) -> String {
        if abs(value) >= 1_000_000 {
            return "\(number(value / 1_000_000))M"
        }
        if abs(value) >= 1_000 {
            return "\(number(value / 1_000))K"
        }
        return number(value)
    }

    static func compactWeight(_ value: Double) -> String {
        "\(compactNumber(value)) lb"
    }

    static func setDescription(weight: Double, reps: Double) -> String {
        if weight > 0, reps > 0 {
            return "\(number(weight)) lb × \(number(reps)) reps"
        }
        if weight > 0 {
            return "\(number(weight)) lb"
        }
        if reps > 0 {
            return "\(number(reps)) reps"
        }
        return "Logged set"
    }
}
