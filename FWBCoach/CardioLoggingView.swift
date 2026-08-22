import SwiftUI

private enum CardioLogFocus: Hashable {
    case type
    case duration
    case distance
    case calories
    case notes
}

private enum CardioSaveIntent: Equatable {
    case progress
    case finish
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
    @State private var didLoadSession = false
    @State private var restoredPersistenceToken: String?
    @State private var activeSaveIntent: CardioSaveIntent?
    @State private var lastSuccessfulSave: CardioSaveIntent?
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
                    workoutTitle: workoutTitle,
                    entryDate: dateString,
                    exercises: [cardioExercise],
                    drafts: [cardioDraft]
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
        case .draftSaved:
            CardioStatusBanner(text: "Cardio draft saved on this iPhone.", icon: "iphone.and.arrow.forward", color: .fwbMuted)
        case .syncing:
            CardioStatusBanner(text: "Syncing cardio with the web app…", icon: "arrow.triangle.2.circlepath", color: .fwbLime)
        case .synced:
            CardioStatusBanner(
                text: lastSuccessfulSave == .finish
                    ? "Cardio finished and synced with the web app."
                    : "Cardio progress saved. Keep going when you’re ready.",
                icon: "checkmark.circle.fill",
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
        VStack(spacing: 12) {
            Button {
                save(intent: .progress)
            } label: {
                Label(
                    activeSaveIntent == .progress ? "SAVING PROGRESS…" : "SAVE PROGRESS",
                    systemImage: "tray.and.arrow.down"
                )
            }
            .buttonStyle(FWBSecondaryButtonStyle())
            .disabled(!canSave || isSaving)
            .accessibilityIdentifier("cardio.saveProgress")

            Button {
                save(intent: .finish)
            } label: {
                Label(
                    activeSaveIntent == .finish ? "FINISHING…" : "FINISH CARDIO",
                    systemImage: "checkmark"
                )
            }
            .buttonStyle(FWBPrimaryButtonStyle())
            .disabled(!canSave || isSaving)
            .accessibilityIdentifier("cardio.finish")
        }
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

    private func save(intent: CardioSaveIntent) {
        focusedField = nil
        activeSaveIntent = intent

        Task {
            let result = await offlineSyncStore.save(
                email: clientEmail,
                workoutTitle: workoutTitle,
                entryDate: dateString,
                exercises: [cardioExercise],
                drafts: [cardioDraft],
                isFinished: intent == .finish
            )
            activeSaveIntent = nil
            guard result == .synced || result == .queued else { return }
            lastSuccessfulSave = intent

            if intent == .finish {
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
    }

    private func loadSavedCardio() async {
        didLoadSession = false
        restoredPersistenceToken = nil
        cardioType = "Cardio"
        duration = ""
        distance = ""
        calories = ""
        notes = ""

        let records = await logStore.load(
            email: clientEmail,
            workoutTitle: workoutTitle,
            entryDate: dateString
        )

        if let record = records.first(where: { $0.exerciseCode.uppercased() == "CARDIO" }) {
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
