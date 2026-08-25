import SwiftUI

private enum CardioLogFocus: Hashable {
    case type
    case duration
    case distance
    case calories
    case notes
}

struct CardioLoggingView<WorkoutSelector: View>: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let clientEmail: String
    let workoutSelector: WorkoutSelector

    @StateObject private var logStore = WorkoutLogStore()
    @StateObject private var achievementHistoryStore = WorkoutHistoryStore()
    @ObservedObject private var offlineSyncStore = WorkoutOfflineSyncStore.shared
    @AppStorage("workoutPraiseHapticsEnabled") private var workoutPraiseHapticsEnabled = true
    @AppStorage("weeklyWorkoutGoal") private var weeklyWorkoutGoal = 3
    @State private var entryDate = Date()
    @State private var cardioType = "Cardio"
    @State private var duration = ""
    @State private var distance = ""
    @State private var calories = ""
    @State private var notes = ""
    @State private var sessionID = UUID()
    @State private var setID = UUID()
    @State private var baseRemoteUpdatedAt: Date?
    @State private var didLoadSession = false
    @State private var restoredPersistenceToken: String?
    @State private var isFinishing = false
    @State private var difficultyPrompt: WorkoutDifficultyPromptRequest?
    @State private var completionCelebration: WorkoutCelebration?
    @FocusState private var focusedField: CardioLogFocus?

    private let workoutTitle = "Cardio"
    private let cardioTypes = ["Walk", "Run", "Bike", "Elliptical", "Stair climber", "Rowing", "Swimming"]
    private var numberColumns: [GridItem] {
        Array(
            repeating: GridItem(.flexible(), spacing: 10),
            count: dynamicTypeSize.isAccessibilitySize ? 1 : 2
        )
    }

    init(
        clientEmail: String,
        @ViewBuilder workoutSelector: () -> WorkoutSelector
    ) {
        self.clientEmail = clientEmail
        self.workoutSelector = workoutSelector()
    }

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    workoutSelector
                        .padding(.horizontal, -20)

                    CardioHeader()
                    dateCard
                    cardioForm
                    CardioInstructionsCard()
                    statusMessage
                    actionButtons
                }
                .padding(20)
                .padding(.bottom, 22)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focusedField = nil }
            }
        }
        .task(id: dateString) {
            await loadSavedCardio()
        }
        .task(id: persistenceTaskID) {
            guard didLoadSession,
                  persistenceToken != restoredPersistenceToken else { return }
            try? await Task.sleep(nanoseconds: 350_000_000)
            guard !Task.isCancelled else { return }

            if hasDraftEntry {
                await offlineSyncStore.persistDraft(
                    email: clientEmail,
                    sessionID: sessionID,
                    workoutTemplateID: ContinuitySync.stableUUID(namespace: "fwb-quick-workout", name: "cardio"),
                    workoutTitle: workoutTitle,
                    entryDate: dateString,
                    exercises: [cardioExercise],
                    drafts: [cardioDraft],
                    baseRemoteUpdatedAt: baseRemoteUpdatedAt
                )
            } else {
                await offlineSyncStore.discardDraft(
                    email: clientEmail,
                    workoutTitle: workoutTitle,
                    entryDate: dateString
                )
            }
        }
        .task {
            await achievementHistoryStore.loadIfNeeded(email: clientEmail)
        }
        .sheet(item: $difficultyPrompt) { request in
            WorkoutDifficultyPromptView(request: request) { rating in
                finishWorkout(difficultyRating: rating)
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.hidden)
        }
        .sheet(item: $completionCelebration) { celebration in
            WorkoutCelebrationView(celebration: celebration)
                .presentationDetents([.large])
                .presentationDragIndicator(.hidden)
        }
    }

    private var dateCard: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 14) {
                    cardioDatePicker
                    cardioWebSyncLabel
                }
            } else {
                HStack(spacing: 12) {
                    cardioDatePicker
                    Spacer(minLength: 8)
                    cardioWebSyncLabel
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }

    private var cardioDatePicker: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("CARDIO DATE")
                .font(.footnote.bold())
                .tracking(0.8)
                .foregroundStyle(Color.fwbMuted)
            DatePicker("Cardio date", selection: $entryDate, in: ...Date(), displayedComponents: .date)
                .labelsHidden()
                .tint(Color.fwbLime)
        }
    }

    private var cardioWebSyncLabel: some View {
        Label("WEB SYNC", systemImage: "arrow.triangle.2.circlepath")
            .font(.footnote.bold())
            .foregroundStyle(Color.fwbLime)
    }

    private var cardioForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 7) {
                Text("CARDIO TYPE")
                    .font(.footnote.weight(.black))
                    .tracking(0.8)
                    .foregroundStyle(Color.fwbLime)

                TextField("Walk, run, bike, stairs", text: $cardioType)
                    .focused($focusedField, equals: .type)
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .font(.headline.weight(.bold))
                    .foregroundStyle(Color.fwbWarmWhite)
                    .tint(Color.fwbLime)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .frame(minHeight: 50)
                    .background(Color.fwbSurface, in: Rectangle())
                    .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                    .accessibilityIdentifier("cardio.type")

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(cardioTypes, id: \.self) { type in
                            Button(type.uppercased()) {
                                cardioType = type
                                focusedField = nil
                            }
                            .font(.footnote.weight(.black))
                            .tracking(0.5)
                            .foregroundStyle(cardioType == type ? Color.black : Color.fwbLime)
                            .padding(.horizontal, 11)
                            .padding(.vertical, 8)
                            .frame(minHeight: 34)
                            .background(cardioType == type ? Color.fwbAccentFill : Color.clear, in: Rectangle())
                            .overlay { Rectangle().stroke(Color.fwbLime, lineWidth: 1) }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            CardioPreviousResultView(
                result: previousCardioResult,
                isLoading: achievementHistoryStore.state == .idle
                    || achievementHistoryStore.state == .loading
            )

            LazyVGrid(columns: numberColumns, alignment: .leading, spacing: 12) {
                CardioNumberField(
                    title: "DURATION",
                    value: $duration,
                    placeholder: "Minutes",
                    suffix: "min",
                    keyboardType: .numberPad
                )
                .focused($focusedField, equals: .duration)
                .accessibilityIdentifier("cardio.duration")

                CardioNumberField(
                    title: "DISTANCE",
                    value: $distance,
                    placeholder: "Optional",
                    suffix: "mi",
                    keyboardType: .decimalPad
                )
                .focused($focusedField, equals: .distance)
                .accessibilityIdentifier("cardio.distance")

                CardioNumberField(
                    title: "CALORIES",
                    value: $calories,
                    placeholder: "Optional",
                    suffix: "cal",
                    keyboardType: .numberPad
                )
                .focused($focusedField, equals: .calories)
                .accessibilityIdentifier("cardio.calories")
            }

            VStack(alignment: .leading, spacing: 7) {
                Text("NOTES")
                    .font(.footnote.weight(.black))
                    .tracking(0.8)
                    .foregroundStyle(Color.fwbLime)
                TextField("Pace, incline, intensity, or how it felt", text: $notes, axis: .vertical)
                    .focused($focusedField, equals: .notes)
                    .lineLimit(3...6)
                    .font(.subheadline)
                    .foregroundStyle(Color.fwbWarmWhite)
                    .tint(Color.fwbLime)
                    .padding(14)
                    .background(Color.fwbSurface, in: Rectangle())
                    .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                    .accessibilityIdentifier("cardio.notes")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }

    @ViewBuilder
    private var statusMessage: some View {
        switch offlineSyncStore.state {
        case .restoring:
            CardioStatusBanner(text: "Checking for recovered cardio…", icon: "arrow.clockwise", color: .fwbMuted)
        case .restored:
            CardioStatusBanner(text: "Recovered your unsaved cardio from this iPhone.", icon: "clock.arrow.circlepath", color: .fwbLime)
        case .restoredFromWeb:
            CardioStatusBanner(text: "Continued your newer cardio draft from the web app.", icon: "laptopcomputer.and.iphone", color: .fwbLime)
        case .draftSaved:
            CardioStatusBanner(text: "Cardio draft saved on this iPhone.", icon: "iphone.and.arrow.forward", color: .fwbMuted)
        case .syncing:
            CardioStatusBanner(text: "Syncing cardio with the web app…", icon: "arrow.triangle.2.circlepath", color: .fwbLime)
        case .synced:
            CardioStatusBanner(
                text: "Cardio finished and synced with the web app.",
                icon: "checkmark.circle.fill",
                color: .fwbLime
            )
        case .conflictResolved(let count):
            CardioStatusBanner(
                text: count == 1
                    ? "A newer web change was kept while your cardio updates synced."
                    : "\(count) newer web changes were kept while your cardio updates synced.",
                icon: "arrow.triangle.branch",
                color: .fwbLime
            )
        case .queued(let count):
            CardioStatusBanner(
                text: count == 1
                    ? "Saved on this iPhone. It will sync when you’re back online."
                    : "Saved on this iPhone. \(count) workouts will sync when you’re back online.",
                icon: "icloud.slash",
                color: .fwbLime
            )
        case .failed(let message):
            CardioStatusBanner(text: message, icon: "exclamationmark.triangle.fill", color: .fwbRed)
        case .idle:
            switch logStore.state {
            case .loading:
                CardioStatusBanner(text: "Loading saved cardio…", icon: "arrow.clockwise", color: .fwbMuted)
            case .failed(let message):
                CardioStatusBanner(text: message, icon: "exclamationmark.triangle.fill", color: .fwbRed)
            case .idle, .ready, .saving, .saved:
                EmptyView()
            }
        }
    }

    private var actionButtons: some View {
        Button {
            difficultyPrompt = WorkoutDifficultyPromptRequest(workoutTitle: normalizedCardioType)
        } label: {
            Label(
                isFinishing ? "FINISHING…" : "SAVE & FINISH CARDIO",
                systemImage: "checkmark"
            )
        }
        .buttonStyle(FWBPrimaryButtonStyle())
        .disabled(!canSave || isSaving)
        .accessibilityIdentifier("cardio.finish")
    }

    private var cardioExercise: Exercise {
        Exercise(
            code: "CARDIO",
            name: normalizedCardioType,
            prescription: "Duration, distance, calories, and notes",
            instructions: [
                "Start easy and build gradually into the effort you planned.",
                "Use a pace you can control without changing your natural movement.",
                "Ease down at the end and record how the session felt."
            ]
        )
    }

    private var cardioDraft: WorkoutSetDraft {
        WorkoutSetDraft(
            id: setID,
            exercise: cardioExercise,
            setNumber: 1,
            weight: duration,
            reps: distance,
            notes: CardioLogCodec.buildNotes(calories: calories, notes: notes),
            isCompleted: canSave
        )
    }

    private var normalizedCardioType: String {
        let trimmed = cardioType.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Cardio" : trimmed
    }

    private var previousCardioResult: PreviousWorkoutResult? {
        PreviousWorkoutResults.cardio(
            named: normalizedCardioType,
            before: dateString,
            in: achievementHistoryStore.sessions
        )
    }

    private var canSave: Bool {
        (Double(duration) ?? 0) > 0 && !isSaving
    }

    private var isSaving: Bool {
        offlineSyncStore.state == .syncing
    }

    private var hasDraftEntry: Bool {
        !duration.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !distance.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !calories.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var dateString: String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: entryDate)
    }

    private var persistenceTaskID: String {
        "\(didLoadSession)|\(dateString)|\(persistenceToken)"
    }

    private var persistenceToken: String {
        [normalizedCardioType, duration, distance, calories, notes].joined(separator: "\u{1F}")
    }

    private func finishWorkout(difficultyRating: Int?) {
        focusedField = nil
        isFinishing = true

        Task {
            let result = await offlineSyncStore.save(
                email: clientEmail,
                sessionID: sessionID,
                workoutTemplateID: ContinuitySync.stableUUID(namespace: "fwb-quick-workout", name: "cardio"),
                workoutTitle: workoutTitle,
                entryDate: dateString,
                exercises: [cardioExercise],
                drafts: [cardioDraft],
                baseRemoteUpdatedAt: baseRemoteUpdatedAt,
                isFinished: true,
                difficultyRating: difficultyRating
            )
            isFinishing = false
            guard result == .synced || result == .queued else { return }
            completionCelebration = WorkoutPraiseEvaluator.cardio(
                clientEmail: clientEmail,
                cardioType: normalizedCardioType,
                entryDate: dateString,
                durationMinutes: Double(duration) ?? 0,
                distanceMiles: Double(distance),
                calories: Double(calories),
                history: achievementHistoryStore.sessions,
                weeklyGoal: weeklyWorkoutGoal
            )
            WorkoutPraiseHaptics.workoutComplete(isEnabled: workoutPraiseHapticsEnabled)

            await HealthKitWorkoutSyncStore.shared.saveCardioWorkoutIfAuthorized(
                type: normalizedCardioType,
                entryDate: entryDate,
                durationMinutes: Double(duration) ?? 0,
                distanceMiles: Double(distance),
                calories: Double(calories)
            )
        }
    }

    private func loadSavedCardio() async {
        didLoadSession = false
        restoredPersistenceToken = nil
        cardioType = "Cardio"
        duration = ""
        distance = ""
        calories = ""
        notes = ""
        setID = UUID()

        let records = await logStore.load(
            email: clientEmail,
            workoutTitle: workoutTitle,
            entryDate: dateString
        )
        sessionID = logStore.remoteSessionID ?? UUID()
        baseRemoteUpdatedAt = logStore.baseRemoteUpdatedAt

        if let record = records.first(where: { $0.exerciseCode.uppercased() == "CARDIO" }) {
            setID = record.setID ?? setID
            apply(
                exerciseName: record.exerciseName,
                duration: Self.numberString(record.weightUsed),
                distance: record.reps.map(Self.numberString) ?? "",
                notes: record.notes
            )
        }

        if let recovered = await offlineSyncStore.restoreDraft(
            email: clientEmail,
            workoutTitle: workoutTitle,
            entryDate: dateString
        ), let set = recovered.sets.first(where: { $0.exerciseCode.uppercased() == "CARDIO" }) {
            sessionID = recovered.stableSessionID
            setID = set.stableID
            baseRemoteUpdatedAt = recovered.baseRemoteUpdatedAt ?? baseRemoteUpdatedAt
            apply(
                exerciseName: set.exerciseName,
                duration: set.weight,
                distance: set.reps,
                notes: set.notes
            )
            restoredPersistenceToken = persistenceToken
        }

        didLoadSession = true
    }

    private func apply(exerciseName: String, duration: String, distance: String, notes: String?) {
        let parsedNotes = CardioLogCodec.parseNotes(notes)
        cardioType = exerciseName.isEmpty ? "Cardio" : exerciseName
        self.duration = duration
        self.distance = distance
        calories = parsedNotes.calories
        self.notes = parsedNotes.notes
    }

    private static func numberString(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(value)
    }
}

private struct CardioPreviousResultView: View {
    let result: PreviousWorkoutResult?
    let isLoading: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 7) {
                Text("PREVIOUS")
                    .font(.caption2.weight(.black))
                    .tracking(0.8)
                    .foregroundStyle(Color.fwbLime)

                if let result {
                    Text(result.exerciseName.uppercased())
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Color.fwbWarmWhite)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text(Self.date(result.entryDate))
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(Color.fwbMuted)
                        .lineLimit(1)
                }
            }

            if let result {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 14) {
                        metrics(for: result)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        metrics(for: result)
                    }
                }
            } else {
                Text(isLoading ? "Checking cardio history…" : "No previous cardio of this type")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.fwbMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.fwbSurface.opacity(0.72), in: Rectangle())
        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    @ViewBuilder
    private func metrics(for result: PreviousWorkoutResult) -> some View {
        CardioPreviousMetric(value: Self.number(result.firstValue), suffix: "min")
        CardioPreviousMetric(value: Self.optionalNumber(result.secondValue), suffix: "mi")
        CardioPreviousMetric(value: Self.optionalNumber(result.calories), suffix: "cal")
    }

    private var accessibilityText: String {
        guard let result else {
            return isLoading ? "Checking previous cardio history" : "No previous cardio of this type"
        }
        return "Previous \(result.exerciseName), \(Self.number(result.firstValue)) minutes, "
            + "\(Self.spoken(result.secondValue, unit: "miles")), "
            + "\(Self.spoken(result.calories, unit: "calories")), "
            + Self.date(result.entryDate)
    }

    private static func number(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value)
    }

    private static func optionalNumber(_ value: Double?) -> String {
        guard let value, value > 0 else { return "—" }
        return number(value)
    }

    private static func spoken(_ value: Double?, unit: String) -> String {
        guard let value, value > 0 else { return "\(unit) not logged" }
        return "\(number(value)) \(unit)"
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

private struct CardioPreviousMetric: View {
    let value: String
    let suffix: String

    var body: some View {
        Text("\(value) \(suffix)")
            .font(.footnote.weight(.black))
            .fontWidth(.condensed)
            .foregroundStyle(Color.fwbWarmWhite)
            .lineLimit(1)
    }
}

private struct CardioHeader: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("CARDIO")
                .font(.footnote.bold())
                .tracking(1.1)
                .foregroundStyle(Color.fwbLime)
            Text("LOG YOUR CARDIO")
                .font(.largeTitle.weight(.black))
                .fontWidth(.condensed)
                .foregroundStyle(Color.fwbWarmWhite)
            Text("Track duration, distance, calories, pace, incline, intensity, and how the session felt.")
                .font(.footnote)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct CardioNumberField: View {
    let title: String
    @Binding var value: String
    let placeholder: String
    let suffix: String
    let keyboardType: UIKeyboardType

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title)
                .font(.footnote.weight(.black))
                .tracking(0.6)
                .foregroundStyle(Color.fwbMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            HStack(spacing: 4) {
                TextField(placeholder, text: $value)
                    .keyboardType(keyboardType)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.fwbWarmWhite)
                    .tint(Color.fwbLime)
                if !value.isEmpty {
                    Text(suffix)
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(Color.fwbMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.72)
                }
            }
            .padding(.horizontal, 10)
            .frame(minHeight: 48)
            .background(Color.fwbSurface, in: Rectangle())
            .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct CardioInstructionsCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("CARDIO GUIDANCE", systemImage: "heart.circle.fill")
                .font(.footnote.weight(.black))
                .tracking(0.8)
                .foregroundStyle(Color.fwbLime)

            Text("Start gradually, use a sustainable pace, and cool down before stopping. If you feel chest pain, dizziness, unusual shortness of breath, or concerning symptoms, stop and seek qualified medical help.")
                .font(.footnote)
                .foregroundStyle(Color.fwbWarmWhite)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }
}

private struct CardioStatusBanner: View {
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
            .overlay { Rectangle().stroke(color.opacity(0.55), lineWidth: 1) }
    }
}
