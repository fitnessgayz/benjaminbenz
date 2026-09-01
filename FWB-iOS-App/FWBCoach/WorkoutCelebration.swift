import SwiftUI
import UIKit

struct WorkoutPraiseBannerItem: Identifiable, Equatable {
    let id = UUID()
    let title: String
    let detail: String
    let icon: String
}

struct WorkoutCelebration: Identifiable {
    let id = UUID()
    let sessionKey: String
    let workoutTitle: String
    let headline: String
    let message: String
    let metrics: [WorkoutCelebrationMetric]
    let achievements: [WorkoutPraiseAchievement]
    let weeklyCompleted: Int
    let weeklyGoal: Int
}

struct WorkoutCelebrationMetric: Identifiable {
    let title: String
    let value: String

    var id: String { title }
}

struct WorkoutPraiseAchievement: Identifiable, Hashable {
    let id: String
    let icon: String
    let title: String
    let detail: String
}

@MainActor
enum WorkoutPraiseHaptics {
    static func exerciseComplete(isEnabled: Bool) {
        guard isEnabled else { return }
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.prepare()
        generator.impactOccurred()
    }

    static func workoutComplete(isEnabled: Bool) {
        guard isEnabled else { return }
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        generator.notificationOccurred(.success)
    }
}

@MainActor
enum WorkoutPraiseEvaluator {
    static func strength(
        clientEmail: String,
        workoutTitle: String,
        entryDate: String,
        startedAt: Date,
        drafts: [WorkoutSetDraft],
        history: [WorkoutHistorySession],
        weeklyGoal: Int
    ) -> WorkoutCelebration {
        let sessionKey = normalizedSessionKey(
            clientEmail: clientEmail,
            entryDate: entryDate,
            workoutTitle: workoutTitle
        )
        let prior = priorSessions(history, entryDate: entryDate, workoutTitle: workoutTitle)
        // Warm-up work supports the session without changing working-set totals,
        // volume milestones, or personal-record evaluation.
        let completed = drafts.filter { !$0.isWarmUp && ($0.isCompleted || $0.containsEntry) }
        let personalRecords = personalRecordNames(current: completed, prior: prior)
        var achievements = milestoneAchievements(
            clientEmail: clientEmail,
            sessionKey: sessionKey,
            entryDate: entryDate,
            prior: prior,
            weeklyGoal: weeklyGoal,
            isCardio: false
        )

        if !personalRecords.isEmpty {
            let names = ListFormatter.localizedString(byJoining: Array(personalRecords.prefix(2)))
            let suffix = personalRecords.count > 2 ? " and more" : ""
            achievements.append(
                WorkoutPraiseAchievement(
                    id: "personal-record",
                    icon: "trophy.fill",
                    title: personalRecords.count == 1 ? "New Personal Best" : "New Personal Bests",
                    detail: "You set a new mark in \(names)\(suffix)."
                )
            )
        }

        achievements = WorkoutPraiseLedger.unawarded(
            achievements,
            clientEmail: clientEmail,
            sessionKey: sessionKey
        )
        WorkoutPraiseLedger.record(
            achievements,
            clientEmail: clientEmail,
            sessionKey: sessionKey
        )

        let duration = max(Int(Date().timeIntervalSince(startedAt) / 60), 1)
        let weeklyCompleted = workoutsInCurrentWeek(prior, including: entryDate)
        let completedSets = completed.filter(\.isCompleted).count
        let setCount = completedSets > 0 ? completedSets : completed.count
        let volume = completed.reduce(0) { $0 + $1.volume }

        return WorkoutCelebration(
            sessionKey: sessionKey,
            workoutTitle: workoutTitle,
            headline: "YOU SHOWED UP.",
            message: closingMessage(weeklyCompleted: weeklyCompleted, weeklyGoal: weeklyGoal),
            metrics: [
                WorkoutCelebrationMetric(title: "TIME", value: "\(duration) min"),
                WorkoutCelebrationMetric(title: "SETS", value: "\(setCount)"),
                WorkoutCelebrationMetric(title: "VOLUME", value: format(volume, suffix: " lb"))
            ],
            achievements: achievements,
            weeklyCompleted: weeklyCompleted,
            weeklyGoal: max(weeklyGoal, 1)
        )
    }

    static func cardio(
        clientEmail: String,
        cardioType: String,
        entryDate: String,
        durationMinutes: Double,
        distanceMiles: Double?,
        calories: Double?,
        history: [WorkoutHistorySession],
        weeklyGoal: Int
    ) -> WorkoutCelebration {
        let workoutTitle = "Cardio"
        let sessionKey = normalizedSessionKey(
            clientEmail: clientEmail,
            entryDate: entryDate,
            workoutTitle: workoutTitle
        )
        let prior = priorSessions(history, entryDate: entryDate, workoutTitle: workoutTitle)
        var achievements = milestoneAchievements(
            clientEmail: clientEmail,
            sessionKey: sessionKey,
            entryDate: entryDate,
            prior: prior,
            weeklyGoal: weeklyGoal,
            isCardio: true
        )
        achievements = WorkoutPraiseLedger.unawarded(
            achievements,
            clientEmail: clientEmail,
            sessionKey: sessionKey
        )
        WorkoutPraiseLedger.record(
            achievements,
            clientEmail: clientEmail,
            sessionKey: sessionKey
        )

        let weeklyCompleted = workoutsInCurrentWeek(prior, including: entryDate)
        var metrics = [
            WorkoutCelebrationMetric(title: "TIME", value: format(durationMinutes, suffix: " min"))
        ]
        if let distanceMiles, distanceMiles > 0 {
            metrics.append(WorkoutCelebrationMetric(title: "DISTANCE", value: format(distanceMiles, suffix: " mi")))
        }
        if let calories, calories > 0 {
            metrics.append(WorkoutCelebrationMetric(title: "CALORIES", value: format(calories, suffix: "")))
        }

        return WorkoutCelebration(
            sessionKey: sessionKey,
            workoutTitle: cardioType,
            headline: "CARDIO COMPLETE.",
            message: closingMessage(weeklyCompleted: weeklyCompleted, weeklyGoal: weeklyGoal),
            metrics: metrics,
            achievements: achievements,
            weeklyCompleted: weeklyCompleted,
            weeklyGoal: max(weeklyGoal, 1)
        )
    }

    private static func milestoneAchievements(
        clientEmail: String,
        sessionKey: String,
        entryDate: String,
        prior: [WorkoutHistorySession],
        weeklyGoal: Int,
        isCardio: Bool
    ) -> [WorkoutPraiseAchievement] {
        var achievements: [WorkoutPraiseAchievement] = []
        let workoutCount = prior.count + 1
        let priorWeeklyCount = workoutsInCurrentWeek(prior, including: nil)
        let currentWeeklyCount = workoutsInCurrentWeek(prior, including: entryDate)

        if prior.isEmpty {
            achievements.append(
                WorkoutPraiseAchievement(
                    id: "first-workout",
                    icon: "flag.checkered",
                    title: "First Workout",
                    detail: "Your first FWB workout is in the books."
                )
            )
        }

        if workoutCount >= 5, prior.count < 5 {
            achievements.append(
                WorkoutPraiseAchievement(
                    id: "five-workouts",
                    icon: "flame.fill",
                    title: "Five Workouts Complete",
                    detail: "You’re building real consistency."
                )
            )
        }

        let goal = max(weeklyGoal, 1)
        if priorWeeklyCount < goal, currentWeeklyCount >= goal {
            achievements.append(
                WorkoutPraiseAchievement(
                    id: "weekly-goal-\(weekIdentifier(for: entryDate))",
                    icon: "calendar.badge.checkmark",
                    title: "Weekly Goal Complete",
                    detail: "You completed \(goal) workout\(goal == 1 ? "" : "s") this week."
                )
            )
        }

        if isCardio, !prior.contains(where: { !$0.cardioRecords.isEmpty }) {
            achievements.append(
                WorkoutPraiseAchievement(
                    id: "first-cardio",
                    icon: "figure.run",
                    title: "First Cardio Workout",
                    detail: "You added dedicated cardio to your training."
                )
            )
        }

        if hasThreeConsistentWeeks(prior: prior, including: entryDate) &&
            !hasThreeConsistentWeeks(prior: prior, including: nil) {
            achievements.append(
                WorkoutPraiseAchievement(
                    id: "three-consistent-weeks-\(weekIdentifier(for: entryDate))",
                    icon: "calendar.badge.clock",
                    title: "Three Consistent Weeks",
                    detail: "You trained in three consecutive weeks."
                )
            )
        }

        if let latestDate = prior.compactMap({ dateValue($0.entryDate) }).max(),
           let currentDate = dateValue(entryDate),
           Calendar.current.dateComponents([.day], from: latestDate, to: currentDate).day ?? 0 >= 14 {
            achievements.append(
                WorkoutPraiseAchievement(
                    id: "comeback-\(sessionKey)",
                    icon: "arrow.uturn.up.circle.fill",
                    title: "Comeback Workout",
                    detail: "You came back and got the work done."
                )
            )
        }

        return achievements
    }

    private static func personalRecordNames(
        current: [WorkoutSetDraft],
        prior: [WorkoutHistorySession]
    ) -> [String] {
        let strengthGroups = Dictionary(
            grouping: current.filter { $0.setType.countsTowardWorkingMetrics }
        ) { normalizedExercise($0.exerciseName, code: $0.exerciseCode) }
        let timedGroups = Dictionary(
            grouping: current.filter { $0.setType == .timed && $0.durationValue > 0 }
        ) { normalizedExercise($0.exerciseName, code: $0.exerciseCode) }
        let priorRecords = prior.flatMap(\.records).filter { !$0.isCardio }
        let priorStrengthGroups = Dictionary(
            grouping: priorRecords.filter(\.countsTowardWorkingMetrics)
        ) { normalizedExercise($0.exerciseName, code: $0.exerciseCode) }
        let priorTimedGroups = Dictionary(
            grouping: priorRecords.filter { $0.resolvedSetType == .timed && ($0.durationSeconds ?? 0) > 0 }
        ) { normalizedExercise($0.exerciseName, code: $0.exerciseCode) }

        let strengthRecords: [String] = strengthGroups.compactMap { entry in
            let (key, drafts) = entry
            guard let records = priorStrengthGroups[key], !records.isEmpty else { return nil }
            let currentScore = drafts.map { strengthScore(weight: $0.weightValue, reps: $0.repsValue) }.max() ?? 0
            let priorScore = records.map { strengthScore(weight: $0.weightUsed, reps: $0.reps ?? 0) }.max() ?? 0
            guard currentScore > priorScore + 0.01 else { return nil }
            let name = drafts.first?.exerciseName.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return name.isEmpty ? drafts.first?.exerciseCode ?? "Exercise" : name
        }

        let timedRecords: [String] = timedGroups.compactMap { entry in
            let (key, drafts) = entry
            guard let records = priorTimedGroups[key], !records.isEmpty else { return nil }
            let currentDuration = drafts.map(\.durationValue).max() ?? 0
            let priorDuration = records.compactMap(\.durationSeconds).max() ?? 0
            guard currentDuration > priorDuration + 0.01 else { return nil }
            let name = drafts.first?.exerciseName.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return name.isEmpty ? drafts.first?.exerciseCode ?? "Exercise" : name
        }

        return Array(Set(strengthRecords + timedRecords)).sorted()
    }

    private static func strengthScore(weight: Double, reps: Double) -> Double {
        weight > 0 ? weight * (1 + max(reps, 0) / 30) : max(reps, 0)
    }

    private static func priorSessions(
        _ sessions: [WorkoutHistorySession],
        entryDate: String,
        workoutTitle: String
    ) -> [WorkoutHistorySession] {
        sessions.filter {
            !($0.entryDate == entryDate &&
              $0.workoutTitle.caseInsensitiveCompare(workoutTitle) == .orderedSame)
        }
    }

    private static func workoutsInCurrentWeek(
        _ sessions: [WorkoutHistorySession],
        including entryDate: String?
    ) -> Int {
        let reference = entryDate.flatMap(dateValue) ?? Date()
        let calendar = Calendar.current
        let sessionIDs = sessions.compactMap { session -> String? in
            guard let date = dateValue(session.entryDate), calendar.isDate(date, equalTo: reference, toGranularity: .weekOfYear) else {
                return nil
            }
            return session.id
        }
        return Set(sessionIDs + (entryDate.map { ["\($0)|current"] } ?? [])).count
    }

    private static func hasThreeConsistentWeeks(
        prior: [WorkoutHistorySession],
        including entryDate: String?
    ) -> Bool {
        let calendar = Calendar.current
        var dates = prior.compactMap { dateValue($0.entryDate) }
        if let entryDate, let date = dateValue(entryDate) {
            dates.append(date)
        }
        let weekStarts = Set(dates.compactMap { calendar.dateInterval(of: .weekOfYear, for: $0)?.start })
        guard weekStarts.count >= 3 else { return false }
        let sorted = weekStarts.sorted()
        return sorted.indices.dropFirst(2).contains { index in
            guard let oneWeekBack = calendar.date(byAdding: .weekOfYear, value: -1, to: sorted[index]),
                  let twoWeeksBack = calendar.date(byAdding: .weekOfYear, value: -2, to: sorted[index]) else {
                return false
            }
            return weekStarts.contains(oneWeekBack) && weekStarts.contains(twoWeeksBack)
        }
    }

    private static func closingMessage(weeklyCompleted: Int, weeklyGoal: Int) -> String {
        if weeklyCompleted >= max(weeklyGoal, 1) {
            return "Weekly goal complete. Be proud of the work you put in."
        }
        let remaining = max(weeklyGoal - weeklyCompleted, 0)
        return "Strong work. \(remaining) more workout\(remaining == 1 ? "" : "s") to reach your weekly goal."
    }

    private static func normalizedExercise(_ name: String, code: String) -> String {
        let normalizedName = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return normalizedName.isEmpty ? code.lowercased() : normalizedName
    }

    private static func normalizedSessionKey(clientEmail: String, entryDate: String, workoutTitle: String) -> String {
        [
            clientEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            entryDate,
            workoutTitle.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        ].joined(separator: "|")
    }

    private static func weekIdentifier(for entryDate: String) -> String {
        guard let date = dateValue(entryDate) else { return entryDate }
        let components = Calendar.current.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
        return "\(components.yearForWeekOfYear ?? 0)-\(components.weekOfYear ?? 0)"
    }

    private static func dateValue(_ value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: value)
    }

    private static func format(_ value: Double, suffix: String) -> String {
        let number = value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
        return number + suffix
    }
}

@MainActor
private enum WorkoutPraiseLedger {
    private static let key = "workoutPraiseAwardLedger.v1"

    static func unawarded(
        _ achievements: [WorkoutPraiseAchievement],
        clientEmail: String,
        sessionKey: String
    ) -> [WorkoutPraiseAchievement] {
        let awarded = Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
        return achievements.filter { !awarded.contains(awardKey($0, clientEmail: clientEmail, sessionKey: sessionKey)) }
    }

    static func record(
        _ achievements: [WorkoutPraiseAchievement],
        clientEmail: String,
        sessionKey: String
    ) {
        guard !achievements.isEmpty else { return }
        var awarded = Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
        achievements.forEach { awarded.insert(awardKey($0, clientEmail: clientEmail, sessionKey: sessionKey)) }
        UserDefaults.standard.set(Array(awarded).sorted(), forKey: key)
    }

    private static func awardKey(
        _ achievement: WorkoutPraiseAchievement,
        clientEmail: String,
        sessionKey: String
    ) -> String {
        "\(clientEmail.lowercased())|\(sessionKey)|\(achievement.id)"
    }
}

struct WorkoutPraiseBanner: View {
    let item: WorkoutPraiseBannerItem

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: item.icon)
                .font(.headline.weight(.black))
                .foregroundStyle(Color.black)
                .frame(width: 42, height: 42)
                .background(Color.fwbAccentFill, in: Rectangle())

            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .font(.headline.weight(.black))
                    .fontWidth(.condensed)
                    .foregroundStyle(Color.fwbWarmWhite)
                Text(item.detail)
                    .font(.subheadline)
                    .foregroundStyle(Color.fwbMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(14)
        .background(Color.fwbCard, in: Rectangle())
        .overlay { Rectangle().stroke(Color.fwbLime, lineWidth: 1) }
        .shadow(color: .black.opacity(0.24), radius: 12, y: 4)
        .accessibilityElement(children: .combine)
    }
}

struct WorkoutDifficultyPromptRequest: Identifiable {
    let id = UUID()
    let workoutTitle: String
}

private enum WorkoutDifficultyRating: Int, CaseIterable, Identifiable {
    case veryEasy = 1
    case easy = 2
    case moderate = 3
    case hard = 4
    case veryHard = 5

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .veryEasy: return "VERY EASY"
        case .easy: return "EASY"
        case .moderate: return "MODERATE"
        case .hard: return "HARD"
        case .veryHard: return "VERY HARD"
        }
    }
}

struct WorkoutDifficultyPromptView: View {
    @Environment(\.dismiss) private var dismiss
    let request: WorkoutDifficultyPromptRequest
    let onComplete: (Int?) -> Void

    @State private var selection: WorkoutDifficultyRating?

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("WORKOUT COMPLETE")
                            .font(.footnote.weight(.black))
                            .tracking(1.5)
                            .foregroundStyle(Color.fwbLime)

                        Text("HOW DIFFICULT WAS THIS WORKOUT?")
                            .font(.system(.largeTitle, design: .default).weight(.black))
                            .fontWidth(.condensed)
                            .foregroundStyle(Color.fwbWarmWhite)
                            .fixedSize(horizontal: false, vertical: true)

                        Text(request.workoutTitle.fwbTitleCased)
                            .font(.headline.weight(.bold))
                            .foregroundStyle(Color.fwbMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    VStack(spacing: 10) {
                        ForEach(WorkoutDifficultyRating.allCases) { rating in
                            Button {
                                selection = rating
                            } label: {
                                HStack(spacing: 14) {
                                    Text("\(rating.rawValue)")
                                        .font(.title3.weight(.black))
                                        .frame(width: 32, alignment: .leading)

                                    Text(rating.title)
                                        .font(.headline.weight(.black))
                                        .tracking(0.5)

                                    Spacer(minLength: 0)

                                    Image(systemName: selection == rating ? "checkmark.square.fill" : "square")
                                        .font(.title3.weight(.bold))
                                }
                                .foregroundStyle(selection == rating ? Color.black : Color.fwbWarmWhite)
                                .padding(.horizontal, 16)
                                .frame(maxWidth: .infinity, minHeight: 58)
                                .background(selection == rating ? Color.fwbAccentFill : Color.fwbCard, in: Rectangle())
                                .overlay {
                                    Rectangle().stroke(
                                        selection == rating ? Color.fwbLime : Color.fwbLine,
                                        lineWidth: 1
                                    )
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(rating.rawValue), \(rating.title.lowercased())")
                            .accessibilityAddTraits(selection == rating ? .isSelected : [])
                            .accessibilityIdentifier("workout.difficulty.\(rating.rawValue)")
                        }
                    }

                    Button("SAVE FEEDBACK & FINISH") {
                        complete(with: selection?.rawValue)
                    }
                    .buttonStyle(FWBPrimaryButtonStyle())
                    .disabled(selection == nil)
                    .accessibilityIdentifier("workout.difficulty.save")

                    Button("SKIP FEEDBACK") {
                        complete(with: nil)
                    }
                    .buttonStyle(FWBSecondaryButtonStyle())
                    .accessibilityIdentifier("workout.difficulty.skip")
                }
                .padding(20)
                .padding(.bottom, 24)
            }
        }
        .interactiveDismissDisabled()
        .onAppear {
            UIAccessibility.post(
                notification: .announcement,
                argument: "Workout complete. How difficult was this workout?"
            )
        }
    }

    private func complete(with rating: Int?) {
        dismiss()
        Task { @MainActor in
            await Task.yield()
            onComplete(rating)
        }
    }
}

struct WorkoutCelebrationView: View {
    @Environment(\.dismiss) private var dismiss
    let celebration: WorkoutCelebration
    var onContinue: () -> Void = {}

    @State private var isAnimated = false

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    celebrationHero
                    summaryCard
                    weeklyGoalCard

                    if !celebration.achievements.isEmpty {
                        achievementSection
                    }

                    ProgressSharePanel(summary: .workout(celebration))

                    Button("CONTINUE") {
                        dismiss()
                        onContinue()
                    }
                    .buttonStyle(FWBPrimaryButtonStyle())
                    .accessibilityIdentifier("celebration.continue")
                }
                .padding(20)
                .padding(.bottom, 24)
            }
        }
        .interactiveDismissDisabled()
        .onAppear {
            withAnimation(.spring(response: 0.55, dampingFraction: 0.72)) {
                isAnimated = true
            }
            UIAccessibility.post(notification: .announcement, argument: celebration.headline)
        }
    }

    private var celebrationHero: some View {
        ZStack(alignment: .bottomLeading) {
            Color.fwbAccentFill

            HStack(alignment: .bottom, spacing: 7) {
                ForEach(0..<8, id: \.self) { index in
                    Rectangle()
                        .fill(Color.black.opacity(index.isMultiple(of: 2) ? 0.18 : 0.36))
                        .frame(width: 7, height: isAnimated ? CGFloat(24 + (index % 4) * 12) : 4)
                        .rotationEffect(.degrees(index.isMultiple(of: 2) ? -12 : 12))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            .padding(20)

            VStack(alignment: .leading, spacing: 8) {
                Text("WORKOUT COMPLETE")
                    .font(.footnote.weight(.black))
                    .tracking(1.5)
                    .foregroundStyle(Color.black.opacity(0.72))
                Text(celebration.headline)
                    .font(.system(.largeTitle, design: .default).weight(.black))
                    .fontWidth(.condensed)
                    .foregroundStyle(Color.black)
                    .fixedSize(horizontal: false, vertical: true)
                Text(celebration.message)
                    .font(.headline)
                    .foregroundStyle(Color.black.opacity(0.78))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(20)
        }
        .frame(minHeight: 230)
        .scaleEffect(isAnimated ? 1 : 0.96)
        .opacity(isAnimated ? 1 : 0)
        .accessibilityElement(children: .combine)
    }

    private var summaryCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(celebration.workoutTitle.fwbTitleCased)
                .font(.footnote.weight(.black))
                .tracking(1)
                .foregroundStyle(Color.fwbLime)

            LazyVGrid(
                columns: [
                    GridItem(.flexible(), spacing: 10),
                    GridItem(.flexible(), spacing: 10)
                ],
                alignment: .leading,
                spacing: 12
            ) {
                ForEach(celebration.metrics) { metric in
                    VStack(alignment: .leading, spacing: 5) {
                        Text(metric.title)
                            .font(.footnote.weight(.bold))
                            .foregroundStyle(Color.fwbMuted)
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)
                        Text(metric.value)
                            .font(.title3.weight(.black))
                            .fontWidth(.condensed)
                            .foregroundStyle(Color.fwbWarmWhite)
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .fwbCard()
    }

    private var weeklyGoalCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("WEEKLY GOAL")
                        .font(.footnote.weight(.black))
                        .tracking(1)
                        .foregroundStyle(Color.fwbLime)
                    Text(celebration.weeklyCompleted >= celebration.weeklyGoal ? "GOAL COMPLETE" : "KEEP BUILDING")
                        .font(.title3.weight(.black))
                        .fontWidth(.condensed)
                        .foregroundStyle(Color.fwbWarmWhite)
                }
                Spacer()
                Text("\(min(celebration.weeklyCompleted, celebration.weeklyGoal))/\(celebration.weeklyGoal)")
                    .font(.title2.weight(.black))
                    .foregroundStyle(Color.fwbLime)
            }

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Rectangle().fill(Color.fwbSurface)
                    Rectangle()
                        .fill(Color.fwbAccentFill)
                        .frame(
                            width: geometry.size.width * min(
                                Double(celebration.weeklyCompleted) / Double(celebration.weeklyGoal),
                                1
                            )
                        )
                }
            }
            .frame(height: 8)
        }
        .fwbCard()
        .accessibilityElement(children: .combine)
    }

    private var achievementSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("ACHIEVEMENT\(celebration.achievements.count == 1 ? "" : "S") EARNED")
                .font(.footnote.weight(.black))
                .tracking(1)
                .foregroundStyle(Color.fwbLime)

            ForEach(celebration.achievements) { achievement in
                HStack(spacing: 14) {
                    Image(systemName: achievement.icon)
                        .font(.title3.weight(.black))
                        .foregroundStyle(Color.black)
                        .frame(width: 48, height: 48)
                        .background(Color.fwbAccentFill, in: Rectangle())

                    VStack(alignment: .leading, spacing: 4) {
                        Text(achievement.title)
                            .font(.headline.weight(.black))
                            .fontWidth(.condensed)
                            .foregroundStyle(Color.fwbWarmWhite)
                        Text(achievement.detail)
                            .font(.subheadline)
                            .foregroundStyle(Color.fwbMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .fwbCard()
                .accessibilityElement(children: .combine)
            }
        }
    }
}
