import SwiftUI

/// The logger owns mutations, validation and persistence. These views render the
/// same exercise deck and set sections for every workout format.
struct WorkoutParityActions {
    var rename: (Exercise, String) -> Void
    var deleteExercise: (Exercise) -> Void
    var changeFormat: (CustomWorkoutFormat) -> Void
    var addRound: () -> Void
    var removeRound: () -> Void
    var logRound: (Int) -> Void
    var estimateOneRepMax: (Int, Bool) -> Void
    var undoCopy: (Int) -> Void
    var showPR: (Int) -> Void
    var editDraft: (UUID) -> Void
    var reopenDraft: (UUID) -> Void
    var showExercise: (Exercise) -> Void
    var showMedia: (Exercise) -> Void
}

private enum WorkoutParityStyle {
    static let ink = Color.fwbInk
    static let cream = Color.fwbCanvas
    static let paper = Color.fwbSurfaceRaised
    static let line = Color.fwbBorder
    static let muted = Color.fwbTextMuted
    static let lime = Color.fwbBrandPrimary
    static let green = Color.fwbFocus
    static let buttonInk = Color.fwbBrandPrimaryInk
    static let gold = Color(red: 199 / 255, green: 147 / 255, blue: 43 / 255)
    static let warmUp = Color(red: 255 / 255, green: 252 / 255, blue: 241 / 255)
    static let blue = Color(red: 40 / 255, green: 120 / 255, blue: 255 / 255)
    static let complete = Color(red: 230 / 255, green: 248 / 255, blue: 228 / 255)

    static func heading(_ size: CGFloat) -> Font { FWBFont.sized(size).weight(.heavy) }
}

struct WorkoutParityCountStepper: View {
    let label: String
    let count: Int
    var minimum: Int = 1
    let onMinus: () -> Void
    let onPlus: () -> Void

    var body: some View {
        HStack(spacing: 9) {
            stepButton("minus", title: "Remove \(label.lowercased())", accented: false, action: onMinus)
                .disabled(count <= minimum)
            HStack(spacing: 9) {
                Text(label.uppercased())
                    .font(WorkoutParityStyle.heading(11))
                    .tracking(0.7)
                    .foregroundStyle(WorkoutParityStyle.muted)
                Text("\(count)")
                    .font(WorkoutParityStyle.heading(20))
                    .monospacedDigit()
            }
            .frame(maxWidth: .infinity, minHeight: 46)
            .background(WorkoutParityStyle.paper, in: RoundedRectangle(cornerRadius: 11))
            .overlay { RoundedRectangle(cornerRadius: 11).stroke(WorkoutParityStyle.line, lineWidth: 1) }
            .accessibilityElement(children: .combine)
            stepButton("plus", title: "Add \(label.lowercased())", accented: true, action: onPlus)
        }
        .foregroundStyle(WorkoutParityStyle.ink)
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(WorkoutParityStyle.cream)
    }

    private func stepButton(_ symbol: String, title: String, accented: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(FWBFont.sized(20).weight(.heavy))
                .frame(width: 46, height: 46)
        }
        .buttonStyle(WorkoutParityControlStyle(accented: accented))
        .accessibilityLabel(title)
    }
}

struct WorkoutParityFormatPicker: View {
    @Binding var selection: CustomWorkoutFormat

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Choose a format")
                .font(WorkoutParityStyle.heading(18))
            HStack(spacing: 7) {
                ForEach(CustomWorkoutFormat.allCases) { format in
                    Button {
                        selection = format
                    } label: {
                        Text(format == .single ? "Straight sets" : format.title)
                            .font(WorkoutParityStyle.heading(12))
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(WorkoutParityControlStyle(accented: selection == format))
                    .accessibilityAddTraits(selection == format ? .isSelected : [])
                    .accessibilityIdentifier("customWorkout.format.\(format.rawValue)")
                }
            }
            Text(selection.guide)
                .font(FWBFont.sized(12))
                .foregroundStyle(WorkoutParityStyle.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(WorkoutParityStyle.ink)
        .padding(16)
        .background(WorkoutParityStyle.cream, in: RoundedRectangle(cornerRadius: 20))
        .overlay { RoundedRectangle(cornerRadius: 20).stroke(WorkoutParityStyle.line, lineWidth: 1) }
    }
}

struct WorkoutParityGroupView: View {
    let group: WorkoutParityGroup
    @Binding var drafts: [WorkoutSetDraft]
    let labels: [String: String]
    let mediaByCode: [String: ExerciseMedia]
    let isCustom: Bool
    let suggestions: [String]
    let isSaving: Bool
    let validationMessage: String?
    let restTimer: RestTimerStore
    let restingRound: Int?
    let actions: WorkoutParityActions
    var canCopyPR = false
    var copiedRounds: Set<Int> = []
    var showInlineGrouping = true
    var progressionRecommendations: [String: WorkoutProgressionRecommendation] = [:]
    var applyProgression: (Exercise) -> Void = { _ in }
    var canEditProgression = false
    var editProgression: (Exercise) -> Void = { _ in }
    var personalRecordSummaries: [String: String] = [:]
    var previousRecords: [String: [Int: WorkoutHistoryRecord]] = [:]

    @State private var namesExpanded = true
    @State private var notesExpanded = false
    @State private var rirHelpPresented = false
    @State private var prHelpPresented = false
    @FocusState private var focusedField: WorkoutParityField?

    private var groupDrafts: [WorkoutSetDraft] {
        let codes = Set(group.exercises.map(\.code))
        return drafts.filter { codes.contains($0.exerciseCode) }
    }

    private var workingDrafts: [WorkoutSetDraft] { groupDrafts.filter { !$0.isWarmUp } }
    private var warmUpDrafts: [WorkoutSetDraft] {
        WorkoutParityModel.roundDrafts(group: group, round: 0, drafts: drafts)
    }
    private var roundCount: Int { max(WorkoutParityModel.roundCount(group: group, drafts: drafts), 1) }
    private var unit: String { group.format == .single ? "Set" : "Round" }

    var body: some View {
        VStack(spacing: 14) {
            exerciseDeck
            VStack(spacing: 0) {
                groupHeading
                if isCustom && showInlineGrouping { groupingControls }
                exerciseKey
                separator
                WorkoutParityCountStepper(
                    label: group.format == .single ? "Sets" : "Rounds",
                    count: roundCount,
                    onMinus: actions.removeRound,
                    onPlus: actions.addRound
                )
                if !warmUpDrafts.isEmpty { setSection(round: 0, rows: warmUpDrafts) }
                ForEach(1...roundCount, id: \.self) { round in
                    setSection(round: round, rows: rows(in: round))
                }
                notesSection
            }
            .background(WorkoutParityStyle.paper)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .overlay { RoundedRectangle(cornerRadius: 20).stroke(WorkoutParityStyle.line, lineWidth: 1) }
        }
        .foregroundStyle(WorkoutParityStyle.ink)
        .disabled(isSaving)
        .accessibilityIdentifier("workout.parity.group.\(group.id)")
        .alert("Reps in reserve", isPresented: $rirHelpPresented) {
            Button("Got it", role: .cancel) { }
        } message: {
            Text("RIR estimates how many more reps you could complete with good form. Enter 0 when no more reps were possible, or 1–5 for the number left. Existing RPE ratings retain their 1–10 effort scale. Effort is optional.")
        }
        .alert("Personal records", isPresented: $prHelpPresented) {
            Button("Got it", role: .cancel) { }
        } message: {
            Text(personalRecordHelp)
        }
    }

    private var exerciseDeck: some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(.easeOut(duration: 0.18)) { namesExpanded.toggle() }
            } label: {
                HStack(spacing: 10) {
                    Text("EXERCISES").font(WorkoutParityStyle.heading(17))
                    Spacer(minLength: 4)
                    Text("\(group.exercises.count) \(group.exercises.count == 1 ? "EXERCISE" : "EXERCISES")")
                        .font(WorkoutParityStyle.heading(11))
                        .foregroundStyle(WorkoutParityStyle.muted)
                    Image(systemName: namesExpanded ? "minus" : "plus")
                        .font(FWBFont.sized(19).weight(.heavy))
                        .frame(width: 44, height: 44)
                        .background(WorkoutParityStyle.paper, in: Circle())
                        .overlay { Circle().stroke(WorkoutParityStyle.line, lineWidth: 1) }
                }
                .padding(16)
                .background(WorkoutParityStyle.cream)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Exercises, \(namesExpanded ? "collapse" : "expand")")
            .accessibilityIdentifier("workout.parity.names.\(group.id)")
            if namesExpanded {
                separator
                VStack(spacing: 12) {
                    ForEach(group.exercises) { exercise in
                        WorkoutParityNameEditor(
                            exercise: exercise,
                            label: labels[exercise.code] ?? "\((group.exercises.firstIndex(of: exercise) ?? 0) + 1)",
                            suggestions: suggestions,
                            rename: { actions.rename(exercise, $0) },
                            delete: { actions.deleteExercise(exercise) }
                        )
                    }
                }
                .padding(12)
            }
        }
        .background(WorkoutParityStyle.paper)
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay { RoundedRectangle(cornerRadius: 20).stroke(WorkoutParityStyle.line, lineWidth: 1) }
    }

    private var groupHeading: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .top, spacing: 10) {
                groupTitle.fixedSize()
                Spacer(minLength: 0)
                groupCompletion.fixedSize()
            }
            VStack(alignment: .leading, spacing: 6) {
                groupTitle
                groupCompletion
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(16)
        .background(WorkoutParityStyle.cream)
        .overlay(alignment: .bottom) { separator }
    }

    private var groupTitle: some View {
        Text(group.title)
            .font(WorkoutParityStyle.heading(25))
            .tracking(-0.65)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var groupCompletion: some View {
        Text("\(workingDrafts.filter(\.isCompleted).count) / \(workingDrafts.count) COMPLETE")
            .font(WorkoutParityStyle.heading(11))
            .tracking(0.3)
            .foregroundStyle(WorkoutParityStyle.green)
            .padding(.top, 3)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var groupingControls: some View {
        HStack(spacing: 20) {
            groupingButton(.superset)
            groupingButton(.circuit)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .overlay(alignment: .bottom) { separator.padding(.horizontal, 16) }
    }

    private func groupingButton(_ format: CustomWorkoutFormat) -> some View {
        Button {
            actions.changeFormat(group.format == format ? .single : format)
        } label: {
            HStack(spacing: 7) {
                Image(systemName: group.format == format ? "checkmark.square.fill" : "square")
                    .foregroundStyle(group.format == format ? WorkoutParityStyle.green : WorkoutParityStyle.muted)
                    .font(FWBFont.sized(19))
                Text(format.title).font(WorkoutParityStyle.heading(15))
            }
            .frame(minHeight: 44)
        }
        .buttonStyle(.plain)
        .accessibilityValue(group.format == format ? "Selected" : "Not selected")
        .accessibilityIdentifier("workout.parity.grouping.\(group.id).\(format.rawValue)")
    }

    private var exerciseKey: some View {
        VStack(spacing: 0) {
            ForEach(group.exercises) { exercise in
                let media = mediaByCode[exercise.code]
                HStack(alignment: .top, spacing: 9) {
                    Text(labels[exercise.code] ?? "1")
                        .font(WorkoutParityStyle.heading(16).italic())
                        .frame(width: 26, alignment: .center)
                        .padding(.top, 3)
                    if let media, media.imageURL != nil {
                        Button { actions.showMedia(exercise) } label: {
                            ZStack(alignment: .bottomTrailing) {
                                ExerciseRemoteImage(
                                    urls: media.thumbnailURLs,
                                    animated: false,
                                    cropLeadingFraction: media.cropsThumbnailToPhotoPanels ? 0.51 : nil
                                )
                                    .frame(width: 112, height: media.cropsThumbnailToPhotoPanels ? 96 : 74)
                                    .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                                Image(systemName: "info")
                                    .font(FWBFont.sized(9).weight(.bold))
                                    .foregroundStyle(.white)
                                    .frame(width: 25, height: 25)
                                    .background(WorkoutParityStyle.ink, in: RoundedRectangle(cornerRadius: 7))
                                    .overlay { RoundedRectangle(cornerRadius: 7).stroke(.white, lineWidth: 1.3) }
                                    .padding(5)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("View exercise card and instructions for \(exercise.name)")
                    }
                    Button { actions.showExercise(exercise) } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("EXERCISE \(labels[exercise.code] ?? "1")")
                                .font(WorkoutParityStyle.heading(13).italic())
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if let previous = previousRecords[exercise.code]?.values.sorted(by: { $0.setNumber < $1.setNumber }).first {
                                Text("Last logged: \(WorkoutParityModel.historySummary(previous))")
                                    .font(FWBFont.sized(12).weight(.semibold))
                                    .foregroundStyle(WorkoutParityStyle.green)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            if !isCustom && !exercise.prescription.isEmpty {
                                Text("Target: \(exercise.prescription)")
                                    .font(FWBFont.sized(12).weight(.semibold))
                                    .foregroundStyle(WorkoutParityStyle.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            if let media {
                                let metadata = [media.primaryMuscle, media.equipment]
                                    .filter { !$0.isEmpty }
                                    .joined(separator: " · ")
                                if !metadata.isEmpty {
                                    Text(metadata)
                                        .font(FWBFont.sized(11).weight(.medium))
                                        .foregroundStyle(WorkoutParityStyle.muted)
                                        .lineLimit(1)
                                }
                            }
                            if let record = personalRecordSummaries[exercise.code], !record.isEmpty {
                                Text("PR: \(record)")
                                    .font(FWBFont.sized(11).weight(.semibold))
                                    .foregroundStyle(WorkoutParityStyle.muted)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .multilineTextAlignment(.leading)
                        .padding(.vertical, 4)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(exercise.name.isEmpty ? "Exercise" : exercise.name), details and options")
                    if media?.imageURL == nil, let url = exercise.demoURL {
                        Link(destination: url) {
                            Image(systemName: "play.rectangle")
                                .font(FWBFont.sized(19).weight(.semibold))
                                .frame(width: 36, height: 44)
                        }
                        .accessibilityLabel("Watch \(exercise.name) demo")
                    }
                }
                .padding(.vertical, 7)
                if let recommendation = progressionRecommendations[exercise.code],
                   !recommendation.targets.isEmpty {
                    progressionCard(recommendation, exercise: exercise)
                }
                if canEditProgression && !exercise.name.isEmpty {
                    Button("Progression settings") { editProgression(exercise) }
                        .font(FWBFont.sized(12).weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .accessibilityIdentifier("workout.progression.settings.\(exercise.code)")
                }
                if exercise.id != group.exercises.last?.id { separator }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
    }

    private func progressionCard(_ recommendation: WorkoutProgressionRecommendation, exercise: Exercise) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Suggested targets", systemImage: "chart.line.uptrend.xyaxis")
                .font(FWBFont.sized(13).weight(.bold))
            if !recommendation.targets.isEmpty {
                Text(recommendation.targets.map { "Set \($0.setNumber): \(WorkoutProgressionIntegration.number($0.weight)) lb × \($0.reps)" }.joined(separator: " · "))
                    .font(FWBFont.sized(13).weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text(recommendation.reason)
                .font(FWBFont.sized(12))
                .foregroundStyle(WorkoutParityStyle.muted)
                .fixedSize(horizontal: false, vertical: true)
            if !recommendation.targets.isEmpty {
                Button { applyProgression(exercise) } label: {
                    Text("Use suggested targets")
                        .font(FWBFont.sized(13).weight(.bold))
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                }
                    .buttonStyle(WorkoutParityControlStyle(accented: true))
                    .accessibilityIdentifier("workout.progression.apply.\(exercise.code)")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(WorkoutParityStyle.cream, in: RoundedRectangle(cornerRadius: 12))
        .padding(.bottom, 10)
        .accessibilityIdentifier("workout.progression.\(exercise.code)")
    }

    private func setSection(round: Int, rows: [WorkoutSetDraft]) -> some View {
        let warmUp = round == 0
        let completed = !rows.isEmpty && rows.allSatisfy(\.isCompleted)
        return VStack(spacing: 0) {
            sectionHeading(round: round, completed: completed)
            if copiedRounds.contains(round) {
                HStack(spacing: 8) {
                    Text("Values copied · edit any field")
                        .font(FWBFont.sized(11).weight(.semibold))
                    Spacer(minLength: 0)
                    Button("Undo") { actions.undoCopy(round) }
                        .font(FWBFont.sized(12).weight(.bold))
                        .frame(minHeight: 40)
                }
                .foregroundStyle(WorkoutParityStyle.green)
                .padding(.horizontal, 12)
            }
            columnHeadings(rows: rows)
            VStack(spacing: 7) {
                ForEach(Array(rows.enumerated()), id: \.element.id) { index, draft in
                    WorkoutParitySetRow(
                        draft: binding(for: draft),
                        code: warmUp ? "W\(index + 1)" : labels[draft.exerciseCode] ?? "\(index + 1)",
                        previous: warmUp ? nil : previousRecords[draft.exerciseCode]?[draft.setNumber],
                        focus: $focusedField,
                        onReopen: { actions.reopenDraft(draft.id) },
                        onEdit: { actions.editDraft(draft.id) }
                    )
                }
            }
            .padding(.horizontal, 11)
            .padding(.bottom, 9)
            if let validationMessage, !validationMessage.isEmpty {
                Text(validationMessage)
                    .font(FWBFont.sized(12).weight(.semibold))
                    .foregroundStyle(Color.red)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 9)
                    .accessibilityIdentifier("workout.parity.validation.\(group.id).\(round)")
            }
            WorkoutParityRoundAction(restTimer: restTimer, isResting: restingRound == round,
                isSaving: isSaving, completed: completed,
                logTitle: logTitle(round: round, completed: completed),
                identifier: "workout.parity.log.\(group.id).\(round)") {
                focusedField = nil
                actions.logRound(round)
            }
        }
        .background(warmUp ? WorkoutParityStyle.warmUp : WorkoutParityStyle.paper)
        .overlay(alignment: .leading) {
            Rectangle().fill(warmUp ? WorkoutParityStyle.gold : WorkoutParityStyle.blue).frame(width: 5)
        }
        .overlay(alignment: .top) { separator }
    }

    private func sectionHeading(round: Int, completed: Bool) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                sectionTitle(round: round).fixedSize()
                Spacer(minLength: 0)
                sectionActions(round: round, completed: completed).fixedSize()
            }
            VStack(alignment: .leading, spacing: 4) {
                sectionTitle(round: round)
                sectionActions(round: round, completed: completed)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.leading, 17)
        .padding(.trailing, 10)
        .padding(.vertical, 8)
        .frame(minHeight: 46)
        .overlay(alignment: .bottom) { separator }
    }

    private func sectionTitle(round: Int) -> some View {
        Text(round == 0 ? "Warm-up" : "\(unit) \(round)")
            .font(WorkoutParityStyle.heading(17))
            .fixedSize(horizontal: false, vertical: true)
    }

    @ViewBuilder
    private func sectionActions(round: Int, completed: Bool) -> some View {
        if round == 0 {
            Text("OPTIONAL · EXCLUDED FROM WORKING VOLUME")
                .font(WorkoutParityStyle.heading(10))
                .foregroundStyle(WorkoutParityStyle.muted)
                .fixedSize(horizontal: false, vertical: true)
        } else {
            HStack(spacing: 5) {
                Button { actions.showPR(round) } label: {
                    Text("PR")
                        .font(FWBFont.sized(11).weight(.semibold))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 8)
                        .frame(minHeight: 44)
                }
                .buttonStyle(WorkoutParitySmallStyle())
                .accessibilityLabel("View exercise history and personal records")
                Button { actions.estimateOneRepMax(round, true) } label: {
                    Image(systemName: "gauge.with.dots.needle.67percent")
                        .font(FWBFont.sized(15).weight(.semibold))
                        .frame(width: 32, height: 44)
                }
                .buttonStyle(.plain)
                .foregroundStyle(WorkoutParityStyle.green)
                .disabled(!canCopyPR)
                .accessibilityLabel("Estimate one rep max from personal record")
                Button { prHelpPresented = true } label: {
                    Image(systemName: "info.circle")
                        .font(FWBFont.sized(15))
                        .frame(width: 32, height: 44)
                }
                .buttonStyle(.plain)
                .foregroundStyle(WorkoutParityStyle.muted)
                .accessibilityLabel("What does PR mean? Personal record details")
            }
        }
    }

    private func columnHeadings(rows: [WorkoutSetDraft]) -> some View {
        let timed = rows.contains { $0.setType == .timed }
        let hasRPE = rows.contains { $0.effortScale == .rpe }
        let hasRIR = rows.contains { $0.effortScale != .rpe }
        let effortLabel = hasRPE ? hasRIR ? "RIR / RPE" : "RPE" : "RIR"
        return HStack(spacing: 7) {
            Color.clear.frame(width: 44, height: 1).accessibilityHidden(true)
            Button { actions.estimateOneRepMax(rows.first?.setNumber ?? 1, false) } label: {
                HStack(spacing: 3) {
                    Text("WEIGHT")
                    Image(systemName: "gauge.with.dots.needle.67percent").font(FWBFont.sized(11))
                }
                .frame(maxWidth: .infinity, minHeight: 38)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Open one rep max calculator using this \(unit.lowercased())")
            Text(timed ? "SECONDS" : "REPS").frame(maxWidth: .infinity)
            Button { rirHelpPresented = true } label: {
                HStack(spacing: 3) {
                    Text(effortLabel)
                    Image(systemName: "info.circle").font(FWBFont.sized(11))
                }
                .frame(maxWidth: .infinity, minHeight: 38)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("What does \(effortLabel) mean?")
        }
        .font(WorkoutParityStyle.heading(10))
        .foregroundStyle(WorkoutParityStyle.muted)
        .padding(.horizontal, 11)
        .padding(.top, 9)
        .padding(.bottom, 3)
    }

    private var notesSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            separator
            Button { notesExpanded.toggle() } label: {
                HStack {
                    Text("Exercise notes").font(WorkoutParityStyle.heading(14))
                    Spacer()
                    if groupDrafts.contains(where: { !$0.notes.isEmpty }) {
                        Text("Added").font(FWBFont.sized(11)).foregroundStyle(WorkoutParityStyle.muted)
                    }
                    Image(systemName: notesExpanded ? "chevron.up" : "chevron.down")
                        .font(FWBFont.sized(12).weight(.bold))
                }
                .padding(14)
                .frame(minHeight: 48)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if notesExpanded {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(group.exercises) { exercise in
                        if let draft = groupDrafts.first(where: { $0.exerciseCode == exercise.code && !$0.isWarmUp }) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(exercise.name.isEmpty ? "Exercise \(labels[exercise.code] ?? "1")" : exercise.name)
                                    .font(FWBFont.sized(12).weight(.semibold))
                                TextField("Add an exercise note", text: noteBinding(for: draft), axis: .vertical)
                                    .font(FWBFont.sized(14))
                                    .padding(10)
                                    .frame(minHeight: 44, alignment: .topLeading)
                                    .background(WorkoutParityStyle.cream, in: RoundedRectangle(cornerRadius: 10))
                                    .overlay { RoundedRectangle(cornerRadius: 10).stroke(WorkoutParityStyle.line, lineWidth: 1) }
                                    .accessibilityLabel("Note for \(exercise.name)")
                            }
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 14)
            }
        }
    }

    private var separator: some View { Rectangle().fill(WorkoutParityStyle.line).frame(height: 1) }

    private var personalRecordHelp: String {
        let records = group.exercises.compactMap { exercise -> String? in
            guard let summary = personalRecordSummaries[exercise.code], !summary.isEmpty else { return nil }
            let name = exercise.name.isEmpty ? "Exercise \(labels[exercise.code] ?? "1")" : exercise.name
            return "\(name): \(summary)"
        }
        let explanation = "PR means personal record. Tap PR to review past working sets and choose values for this round. You can edit them before logging."
        return explanation + "\n\n" + (records.isEmpty
            ? "No personal records are available for these exercises yet."
            : records.joined(separator: "\n\n"))
    }

    private func rows(in round: Int) -> [WorkoutSetDraft] {
        WorkoutParityModel.roundDrafts(group: group, round: round, drafts: drafts)
    }

    private func binding(for snapshot: WorkoutSetDraft) -> Binding<WorkoutSetDraft> {
        Binding(
            get: { drafts.first { $0.id == snapshot.id } ?? snapshot },
            set: { updated in
                guard let index = drafts.firstIndex(where: { $0.id == snapshot.id }) else { return }
                drafts[index] = updated
            }
        )
    }

    private func noteBinding(for snapshot: WorkoutSetDraft) -> Binding<String> {
        Binding(
            get: { drafts.first { $0.id == snapshot.id }?.notes ?? snapshot.notes },
            set: { value in
                guard let index = drafts.firstIndex(where: { $0.id == snapshot.id }) else { return }
                drafts[index].notes = value
            }
        )
    }

    private func logTitle(round: Int, completed: Bool) -> String {
        if round == 0 { return completed ? "WARM-UP LOGGED" : "LOG WARM-UP" }
        return completed ? "\(unit.uppercased()) \(round) LOGGED" : "LOG \(unit.uppercased())"
    }
}

private struct WorkoutParityNameEditor: View {
    let exercise: Exercise
    let label: String
    let suggestions: [String]
    let rename: (String) -> Void
    let delete: () -> Void
    @FocusState private var isFocused: Bool
    @State private var selectedSuggestion: String?

    private var matchingSuggestions: [String] {
        guard isFocused,
              selectedSuggestion != exercise.name,
              !exercise.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return [] }
        return Array(suggestions.filter {
            $0.localizedCaseInsensitiveContains(exercise.name) && $0.caseInsensitiveCompare(exercise.name) != .orderedSame
        }.prefix(5))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Exercise \(label)")
                .font(FWBFont.sized(13).weight(.semibold))
                .foregroundStyle(WorkoutParityStyle.muted)
            HStack(alignment: .top, spacing: 8) {
                TextField("Input exercise name here", text: Binding(
                    get: { exercise.name },
                    set: { value in selectedSuggestion = nil; rename(value) }
                ), axis: .vertical)
                    .font(WorkoutParityStyle.heading(16))
                    .textInputAutocapitalization(.words)
                    .autocorrectionDisabled()
                    .focused($isFocused)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, minHeight: 49)
                    .background(WorkoutParityStyle.paper, in: RoundedRectangle(cornerRadius: 12))
                    .overlay { RoundedRectangle(cornerRadius: 12).stroke(WorkoutParityStyle.ink, lineWidth: 1) }
                    .accessibilityLabel("Exercise \(label) name")
                    .accessibilityIdentifier("workout.parity.name.\(exercise.code)")
                Button(role: .destructive, action: delete) {
                    Image(systemName: "trash")
                        .font(FWBFont.sized(18).weight(.semibold))
                        .frame(width: 44, height: 49)
                        .background(WorkoutParityStyle.paper, in: RoundedRectangle(cornerRadius: 12))
                        .overlay { RoundedRectangle(cornerRadius: 12).stroke(Color.red.opacity(0.25), lineWidth: 1) }
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.red)
                .accessibilityLabel("Delete exercise \(label)")
            }
            if !matchingSuggestions.isEmpty {
                VStack(spacing: 0) {
                    ForEach(matchingSuggestions, id: \.self) { suggestion in
                        Button {
                            selectedSuggestion = suggestion
                            rename(suggestion)
                            isFocused = false
                        } label: {
                            Text(suggestion)
                                .font(FWBFont.sized(14))
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                .padding(.horizontal, 10)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Use \(suggestion)")
                    }
                }
                .background(WorkoutParityStyle.cream, in: RoundedRectangle(cornerRadius: 10))
            }
        }
    }
}

private enum WorkoutParityField: Hashable {
    case weight(UUID), reps(UUID), duration(UUID), rir(UUID)
}

private struct WorkoutParitySetRow: View {
    @Binding var draft: WorkoutSetDraft
    let code: String
    let previous: WorkoutHistoryRecord?
    @FocusState.Binding var focus: WorkoutParityField?
    let onReopen: () -> Void
    let onEdit: () -> Void

    var body: some View {
        HStack(spacing: 7) {
            Button { if draft.isCompleted { onReopen() } } label: {
                Text(code)
                    .font(WorkoutParityStyle.heading(15))
                    .frame(width: 44, height: 46)
                    .foregroundStyle(draft.isWarmUp ? WorkoutParityStyle.gold : WorkoutParityStyle.green)
                    .background(draft.isCompleted ? WorkoutParityStyle.complete : draft.isWarmUp ? WorkoutParityStyle.warmUp : WorkoutParityStyle.cream, in: RoundedRectangle(cornerRadius: 11))
                    .overlay { RoundedRectangle(cornerRadius: 11).stroke(draft.isWarmUp ? WorkoutParityStyle.gold : WorkoutParityStyle.line, lineWidth: 1) }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(draft.exerciseName), \(code), \(draft.isCompleted ? "reopen logged set" : "not logged")")
            .accessibilityHint("Touch and hold for set options")
            .contextMenu {
                Button(action: onEdit) {
                    Label("Set options", systemImage: "slider.horizontal.3")
                }
                if draft.isCompleted {
                    Button(action: onReopen) {
                        Label("Reopen set", systemImage: "arrow.uturn.backward")
                    }
                }
            }
            .accessibilityAction(named: "Set options", onEdit)
            numericField("Weight", text: $draft.weight, field: .weight(draft.id), decimal: true,
                placeholder: previous.map { WorkoutParityModel.numberStringForDisplay($0.weightUsed) } ?? "0")
            if draft.setType == .timed {
                numericField("Seconds", text: $draft.duration, field: .duration(draft.id), decimal: false,
                    placeholder: previous?.durationSeconds.map(WorkoutParityModel.numberStringForDisplay) ?? "0")
            } else {
                numericField("Reps", text: $draft.reps, field: .reps(draft.id), decimal: false,
                    placeholder: previous?.reps.map(WorkoutParityModel.numberStringForDisplay) ?? "0")
            }
            numericField(draft.effortScale == .rpe ? "RPE" : "RIR", text: effortBinding, field: .rir(draft.id), decimal: draft.effortScale == .rpe, placeholder: "")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("workout.parity.row.\(draft.id)")
    }

    private func numericField(_ label: String, text: Binding<String>, field: WorkoutParityField, decimal: Bool, placeholder: String = "0") -> some View {
        TextField(placeholder, text: text)
            .font(WorkoutParityStyle.heading(16))
            .keyboardType(decimal ? .decimalPad : .numberPad)
            .multilineTextAlignment(.center)
            .focused($focus, equals: field)
            .padding(.horizontal, 3)
            .frame(maxWidth: .infinity, minHeight: 46)
            .background(draft.isCompleted ? WorkoutParityStyle.complete.opacity(0.55) : WorkoutParityStyle.cream, in: RoundedRectangle(cornerRadius: 11))
            .overlay { RoundedRectangle(cornerRadius: 11).stroke(focus == field ? WorkoutParityStyle.ink : WorkoutParityStyle.line, lineWidth: 1) }
            .overlay(alignment: .top) {
                if label == "RPE" {
                    Text("RPE").font(FWBFont.sized(8).weight(.bold))
                        .foregroundStyle(WorkoutParityStyle.muted)
                        .padding(.top, 2)
                        .allowsHitTesting(false)
                }
            }
            .accessibilityLabel("\(label), \(draft.exerciseName), \(code)")
            .accessibilityHint(draft.isCompleted ? "Edits keep this set logged and save automatically" :
                previous.map { "Last logged \(WorkoutParityModel.historySummary($0)). This is a reference, not an entered value." } ?? "")
            .accessibilityIdentifier("workout.parity.\(label.lowercased()).\(draft.id)")
    }

    private var effortBinding: Binding<String> {
        Binding(
            get: { draft.effort },
            set: { value in
                if draft.effortScale == nil { draft.effortScale = .rir }
                draft.effort = value
            }
        )
    }
}

private struct WorkoutParityRoundAction: View {
    @ObservedObject var restTimer: RestTimerStore
    let isResting: Bool
    let isSaving: Bool
    let completed: Bool
    let logTitle: String
    let identifier: String
    let onLog: () -> Void

    var body: some View {
        Group {
            if isResting && restTimer.isVisible {
                HStack(spacing: 6) {
                    Button("−15") { restTimer.adjust(seconds: -15) }
                        .frame(width: 47, height: 44)
                        .accessibilityLabel("Remove 15 seconds from rest timer")
                    Button {
                        if restTimer.phase == .complete { restTimer.dismiss() }
                        else { restTimer.togglePause() }
                    } label: {
                        Text(restTimer.phase == .complete ? "Rest complete" : "Rest \(restTimer.timeLabel) · \(restTimer.phase == .paused ? "Resume" : "Pause")")
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .monospacedDigit()
                    }
                    Button("+15") { restTimer.adjust(seconds: 15) }
                        .frame(width: 47, height: 44)
                        .accessibilityLabel("Add 15 seconds to rest timer")
                }
                .font(WorkoutParityStyle.heading(11))
                .buttonStyle(WorkoutParityControlStyle(accented: false))
            } else {
                Button(action: onLog) {
                    HStack(spacing: 5) {
                        if isSaving { ProgressView().tint(WorkoutParityStyle.buttonInk) }
                        else if completed { Image(systemName: "checkmark") }
                        Text(logTitle).font(WorkoutParityStyle.heading(15))
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(WorkoutParityControlStyle(accented: true))
                .disabled(isSaving || completed)
                .accessibilityIdentifier(identifier)
            }
        }
        .padding(.horizontal, 11)
        .padding(.bottom, 9)
    }
}

private struct WorkoutParityControlStyle: ButtonStyle {
    var accented: Bool
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(accented ? WorkoutParityStyle.buttonInk : WorkoutParityStyle.ink)
            .background(accented ? WorkoutParityStyle.lime : WorkoutParityStyle.paper, in: RoundedRectangle(cornerRadius: 11))
            .overlay {
                RoundedRectangle(cornerRadius: 11)
                    .stroke(accented ? WorkoutParityStyle.buttonInk : WorkoutParityStyle.ink, lineWidth: 2)
            }
            .opacity(isEnabled ? configuration.isPressed ? 0.7 : 1 : 0.45)
    }
}

private struct WorkoutParitySmallStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(WorkoutParityStyle.muted)
            .background(WorkoutParityStyle.cream, in: RoundedRectangle(cornerRadius: 10))
            .overlay { RoundedRectangle(cornerRadius: 10).stroke(WorkoutParityStyle.line, lineWidth: 1) }
            .opacity(isEnabled ? configuration.isPressed ? 0.6 : 1 : 0.45)
    }
}
