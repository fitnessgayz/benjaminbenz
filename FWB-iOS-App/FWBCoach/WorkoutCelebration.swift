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
    var progress: AchievementSnapshot? = nil
    var earnedXP = 0
    var leveledUp = false
    var awardsPendingSync = false
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
    var badgeID: String? = nil
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
        clientEmail: String, workoutTitle: String, entryDate: String, startedAt: Date,
        drafts: [WorkoutSetDraft], history: [WorkoutHistorySession], weeklyGoal: Int,
        sessionID: UUID? = nil, historyIsComplete: Bool = true,
        syncPending: Bool = false, recordAwards: Bool = true
    ) -> WorkoutCelebration {
        let finishedAt = history.flatMap(\.records).filter { sessionID != nil && $0.sessionID == sessionID }
            .compactMap(\.completedAt).min() ?? Date()
        let completed = drafts.filter { !$0.isWarmUp && $0.isCompleted }
        let records = completed.map { draft in
            WorkoutHistoryRecord(sessionID: sessionID, setID: draft.id,
                entryDate: entryDate, workoutTitle: workoutTitle, exerciseCode: draft.exerciseCode,
                exerciseName: draft.exerciseName, setNumber: draft.setNumber,
                weightUsed: draft.weightValue, reps: draft.repsValue, notes: draft.notes,
                completedAt: finishedAt, setType: draft.setType,
                durationSeconds: draft.setType == .timed ? draft.durationValue : nil)
        }
        let duration = max(Int(Date().timeIntervalSince(startedAt) / 60), 1)
        return celebration(clientEmail: clientEmail, workoutTitle: workoutTitle, entryDate: entryDate,
            sessionID: sessionID, records: records, history: history, weeklyGoal: weeklyGoal,
            metrics: [WorkoutCelebrationMetric(title: "TIME", value: "\(duration) min"),
                      WorkoutCelebrationMetric(title: "SETS", value: "\(completed.count)"),
                      WorkoutCelebrationMetric(title: "VOLUME", value: format(completed.reduce(0) { $0 + $1.volume }, suffix: " lb"))],
            historyIsComplete: historyIsComplete, syncPending: syncPending, recordAwards: recordAwards)
    }

    static func cardio(
        clientEmail: String, cardioType: String, entryDate: String,
        durationMinutes: Double, distanceMiles: Double?, calories: Double?,
        history: [WorkoutHistorySession], weeklyGoal: Int, sessionID: UUID? = nil,
        historyIsComplete: Bool = true, syncPending: Bool = false
    ) -> WorkoutCelebration {
        let record = WorkoutHistoryRecord(sessionID: sessionID, entryDate: entryDate, workoutTitle: "Cardio",
            exerciseCode: "CARDIO", exerciseName: cardioType, setNumber: 1,
            weightUsed: durationMinutes, reps: distanceMiles, notes: nil, completedAt: Date())
        var metrics = [WorkoutCelebrationMetric(title: "TIME", value: format(durationMinutes, suffix: " min"))]
        if let distanceMiles, distanceMiles > 0 { metrics.append(.init(title: "DISTANCE", value: format(distanceMiles, suffix: " mi"))) }
        if let calories, calories > 0 { metrics.append(.init(title: "CALORIES", value: format(calories, suffix: ""))) }
        return celebration(clientEmail: clientEmail, workoutTitle: cardioType, entryDate: entryDate,
            sessionID: sessionID, records: [record], history: history, weeklyGoal: weeklyGoal, metrics: metrics,
            historyIsComplete: historyIsComplete, syncPending: syncPending, recordAwards: true)
    }

    private static func celebration(
        clientEmail: String, workoutTitle: String, entryDate: String, sessionID: UUID?,
        records: [WorkoutHistoryRecord], history: [WorkoutHistorySession], weeklyGoal: Int,
        metrics: [WorkoutCelebrationMetric], historyIsComplete: Bool, syncPending: Bool, recordAwards: Bool
    ) -> WorkoutCelebration {
        let sessionKey = ClientAchievementEngine.sessionKey(sessionID: sessionID, entryDate: entryDate,
                                                            workoutTitle: records.first?.workoutTitle ?? workoutTitle)
        let previousRecords = history.flatMap(\.records)
        let prior = previousRecords.filter {
            ClientAchievementEngine.sessionKey(sessionID: $0.sessionID, entryDate: $0.entryDate, workoutTitle: $0.workoutTitle) != sessionKey
        }
        let all = prior + records
        let reliable = historyIsComplete && !syncPending
        let before = ClientAchievementEngine.evaluate(records: previousRecords, today: AchievementDisplay.today)
        let after = ClientAchievementEngine.evaluate(records: all, today: AchievementDisplay.today)
        let previousEventIDs = Set(before.events.map(\.id))
        let freshEvents = reliable ? after.events.filter { $0.sessionID == sessionKey && !previousEventIDs.contains($0.id) } : []
        let candidates = freshEvents.map { event in
            WorkoutPraiseAchievement(id: event.id,
                icon: event.badgeID.flatMap { id in after.badges.first { $0.id == id }?.icon } ?? "trophy.fill",
                title: event.title, detail: event.detail, badgeID: event.badgeID)
        }
        let achievements = recordAwards ? WorkoutPraiseLedger.unawarded(candidates, clientEmail: clientEmail, sessionKey: sessionKey) : candidates
        let firstPresentation = !WorkoutPraiseLedger.hasPresented(clientEmail: clientEmail, sessionKey: sessionKey)
        if reliable && recordAwards {
            WorkoutPraiseLedger.record(achievements, clientEmail: clientEmail, sessionKey: sessionKey)
            WorkoutPraiseLedger.markPresented(clientEmail: clientEmail, sessionKey: sessionKey)
        }
        let leveledUp = reliable && (firstPresentation || !recordAwards) && after.level.number > before.level.number
        let weeklyCompleted = completedThisWeek(all, reference: entryDate)
        return WorkoutCelebration(sessionKey: sessionKey, workoutTitle: workoutTitle,
            headline: leveledUp ? "LEVEL UP!" : achievements.isEmpty ? "YOU SHOWED UP." : "LOOK AT YOU GO!",
            message: syncPending ? "Your workout is saved on this iPhone. Your wins will update after it syncs."
                : !historyIsComplete ? "Workout saved. Refresh your history to see your latest badges and level."
                : "Another step forward. Celebrate your effort, then recover well.",
            metrics: metrics, achievements: achievements, weeklyCompleted: weeklyCompleted,
            weeklyGoal: max(weeklyGoal, 1), progress: reliable ? after : nil,
            earnedXP: reliable && (firstPresentation || !recordAwards) ? max(0, after.xp - before.xp) : 0,
            leveledUp: leveledUp, awardsPendingSync: !reliable)
    }

    private static func completedThisWeek(_ records: [WorkoutHistoryRecord], reference: String) -> Int {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .iso8601)
        formatter.dateFormat = "yyyy-MM-dd"
        guard let reference = formatter.date(from: reference) else { return 0 }
        let calendar = Calendar(identifier: .iso8601)
        return Set(records.compactMap { record -> String? in
            guard record.completedAt != nil, let date = formatter.date(from: record.entryDate),
                  calendar.isDate(date, equalTo: reference, toGranularity: .weekOfYear) else { return nil }
            return ClientAchievementEngine.sessionKey(sessionID: record.sessionID, entryDate: record.entryDate, workoutTitle: record.workoutTitle)
        }).count
    }

    private static func format(_ value: Double, suffix: String) -> String {
        let number = value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
        return number + suffix
    }
}

@MainActor
private enum WorkoutPraiseLedger {
    private static let key = "workoutPraiseAwardLedger.v1"

    static func hasPresented(clientEmail: String, sessionKey: String) -> Bool {
        (UserDefaults.standard.stringArray(forKey: key) ?? []).contains("\(clientEmail.lowercased())|\(sessionKey)|presented")
    }

    static func markPresented(clientEmail: String, sessionKey: String) {
        var awarded = Set(UserDefaults.standard.stringArray(forKey: key) ?? [])
        awarded.insert("\(clientEmail.lowercased())|\(sessionKey)|presented")
        UserDefaults.standard.set(Array(awarded).sorted(), forKey: key)
    }

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
    let onEnergyChange: (Int?, Int?) -> Void
    let onCancel: (() -> Void)?
    let onComplete: (Int?) -> Void

    @State private var selection: Int?
    @State private var energyBefore: Int?
    @State private var energyAfter: Int?
    @State private var hasResolved = false

    init(
        request: WorkoutDifficultyPromptRequest,
        onEnergyChange: @escaping (Int?, Int?) -> Void = { _, _ in },
        onCancel: (() -> Void)? = nil,
        onComplete: @escaping (Int?) -> Void
    ) {
        self.request = request
        self.onEnergyChange = onEnergyChange
        self.onCancel = onCancel
        self.onComplete = onComplete
    }

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("WORKOUT COMPLETE")
                                .font(FWBFont.footnote.weight(.black))
                                .tracking(1.5)
                                .foregroundStyle(Color.fwbLime)
                            Spacer()
                            if onCancel != nil {
                                Button {
                                    cancel()
                                } label: {
                                    Image(systemName: "xmark")
                                        .font(FWBFont.body.weight(.bold))
                                        .frame(width: 44, height: 44)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel("Cancel and return to workout")
                                .accessibilityIdentifier("workout.difficulty.cancel")
                            }
                        }

                        Text("How was your workout?")
                            .font(FWBFont.sized(30).weight(.black))
                            .foregroundStyle(Color.fwbWarmWhite)
                            .fixedSize(horizontal: false, vertical: true)

                        Text(request.workoutTitle.fwbTitleCased)
                            .font(FWBFont.headline.weight(.bold))
                            .foregroundStyle(Color.fwbMuted)
                            .fixedSize(horizontal: false, vertical: true)

                        Text("Congratulations for completing the workout!")
                            .font(FWBFont.subheadline)
                            .foregroundStyle(Color.fwbMuted)
                    }

                    ratingControl(
                        title: "How hard was it overall?",
                        value: $selection,
                        labels: WorkoutDifficultyRating.allCases.map { $0.title.lowercased() },
                        identifier: "workout.difficulty"
                    )

                    FWBRule()

                    VStack(alignment: .leading, spacing: 18) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("How was your energy?")
                                .font(FWBFont.title3.weight(.black))
                            Text("Rate your energy before and after this workout. Energy ratings are optional.")
                                .font(FWBFont.subheadline)
                                .foregroundStyle(Color.fwbMuted)
                        }

                        ratingControl(
                            title: "Before the workout",
                            value: $energyBefore,
                            labels: ["Very low", "Low", "Moderate", "High", "Very high"],
                            identifier: "workout.energy.before"
                        )
                        ratingControl(
                            title: "After the workout",
                            value: $energyAfter,
                            labels: ["Very low", "Low", "Moderate", "High", "Very high"],
                            identifier: "workout.energy.after"
                        )
                    }

                    Button("SAVE AND FINISH WORKOUT") {
                        complete(with: selection, includeEnergy: true)
                    }
                    .buttonStyle(FWBPrimaryButtonStyle())
                    .disabled(selection == nil)
                    .accessibilityIdentifier("workout.difficulty.save")

                    Button("SKIP FEEDBACK") {
                        complete(with: nil, includeEnergy: false)
                    }
                    .buttonStyle(FWBSecondaryButtonStyle())
                    .accessibilityIdentifier("workout.difficulty.skip")
                }
                .padding(20)
                .padding(.bottom, 24)
                .disabled(hasResolved)
            }
        }
        .interactiveDismissDisabled()
        .onAppear {
            UIAccessibility.post(
                notification: .announcement,
                argument: "Workout complete. How was your workout?"
            )
        }
    }

    private func ratingControl(
        title: String,
        value: Binding<Int?>,
        labels: [String],
        identifier: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(FWBFont.headline.weight(.bold))

            HStack(spacing: 8) {
                ForEach(1...5, id: \.self) { rating in
                    Button {
                        value.wrappedValue = value.wrappedValue == rating ? nil : rating
                    } label: {
                        Text("\(rating)")
                            .font(FWBFont.title3.weight(.black))
                            .foregroundStyle(value.wrappedValue == rating ? Color.black : Color.fwbWarmWhite)
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background(
                                value.wrappedValue == rating ? Color.fwbAccentFill : Color.fwbCard,
                                in: RoundedRectangle(cornerRadius: 12)
                            )
                            .overlay {
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(value.wrappedValue == rating ? Color.fwbWarmWhite : Color.fwbLine, lineWidth: 1.5)
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(title), \(rating), \(labels[rating - 1])")
                    .accessibilityAddTraits(value.wrappedValue == rating ? .isSelected : [])
                    .accessibilityIdentifier("\(identifier).\(rating)")
                }
            }

            HStack(alignment: .top) {
                Text("1 · \(labels[0].capitalized)")
                Spacer()
                Text("5 · \(labels[4].capitalized)")
                    .multilineTextAlignment(.trailing)
            }
            .font(FWBFont.footnote)
            .foregroundStyle(Color.fwbMuted)
        }
    }

    private func cancel() {
        guard !hasResolved else { return }
        hasResolved = true
        dismiss()
        onCancel?()
    }

    private func complete(with rating: Int?, includeEnergy: Bool) {
        guard !hasResolved else { return }
        hasResolved = true
        // Capture energy synchronously before the logger starts its save.
        onEnergyChange(includeEnergy ? energyBefore : nil, includeEnergy ? energyAfter : nil)
        dismiss()
        Task { @MainActor in
            await Task.yield()
            onComplete(rating)
        }
    }
}

struct WorkoutCelebrationView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
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
                    if let progress = celebration.progress {
                        if celebration.earnedXP > 0 {
                            Label("+\(celebration.earnedXP) XP earned", systemImage: "sparkles")
                                .font(FWBFont.title3.weight(.bold)).foregroundStyle(Color.fwbLime)
                        }
                        ClientAchievementLevelCard(snapshot: progress)
                    }
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
            if reduceMotion { isAnimated = true }
            else { withAnimation(.spring(response: 0.55, dampingFraction: 0.72)) { isAnimated = true } }
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
                columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: dynamicTypeSize.isAccessibilitySize ? 1 : 2),
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
                let awardLayout = dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
                    : AnyLayout(HStackLayout(alignment: .center, spacing: 14))
                awardLayout {
                    ClientAchievementArtwork(badgeID: achievement.badgeID ?? "pr-1", size: 72)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(achievement.title)
                            .font(.headline.weight(.black))
                            .fontWidth(.condensed)
                            .foregroundStyle(Color.fwbWarmWhite)
                            .fixedSize(horizontal: false, vertical: true)
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
