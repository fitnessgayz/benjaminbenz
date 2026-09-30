import SwiftUI

struct NutritionTargetsView: View {
    @ObservedObject var store: ClientProgramStore

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            switch store.state {
            case .idle, .loading:
                NutritionTargetsPlaceholder()
            case .loaded:
                loadedContent
            case .failed(let message):
                FWBErrorState(message: message) {
                    Task { await store.reload() }
                }
            }
        }
        .navigationTitle("Nutrition")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .refreshable {
            await store.reload()
        }
    }

    @ViewBuilder
    private var loadedContent: some View {
        if let program = store.program {
            NutritionTargetsContent(
                store: store,
                programID: program.id,
                plan: program.nutritionPlan ?? NutritionPlan()
            )
        } else {
            FWBEmptyState(
                icon: "chart.bar",
                title: "Nutrition setup is on the way",
                message: "Your calculator will appear after your active training program is available."
            )
        }
    }
}

private struct NutritionTargetsContent: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @ObservedObject var store: ClientProgramStore
    let programID: UUID
    let plan: NutritionPlan

    private var columns: [GridItem] {
        Array(
            repeating: GridItem(.flexible(), spacing: 12),
            count: dynamicTypeSize.isAccessibilitySize ? 1 : 2
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Nutrition")
                            .font(FWBFont.caption.weight(.semibold))
                            .foregroundStyle(Color.fwbMuted)

                        Text("Calories and macros")
                            .font(FWBFont.title.weight(.bold))
                            .tracking(-0.6)
                            .foregroundStyle(Color.fwbWarmWhite)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Text(plan.statusLabel)
                        .font(FWBFont.caption.weight(.bold))
                        .foregroundStyle(Color.fwbWarmWhite)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                }

                LazyVGrid(columns: columns, spacing: 12) {
                    NutritionTargetCard(title: "Calories", value: plan.calories)
                    NutritionTargetCard(title: "Protein", value: plan.protein)
                    NutritionTargetCard(title: "Carbs", value: plan.carbs)
                    NutritionTargetCard(title: "Fat", value: plan.fat)
                }

                NutritionCalculatorCard(
                    store: store,
                    programID: programID,
                    plan: plan
                )
            }
            .padding(16)
        }
        .scrollDismissesKeyboard(.interactively)
    }
}

private struct NutritionTargetCard: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(FWBFont.caption.weight(.semibold))
                .foregroundStyle(Color.fwbMuted)

            Text(displayValue)
                .font(FWBFont.title2.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(Color.fwbWarmWhite)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: 62, alignment: .leading)
        .fwbCard()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title), \(displayValue)")
    }

    private var displayValue: String {
        let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmedValue.isEmpty ? "Not set" : trimmedValue
    }
}

private struct NutritionCalculatorCard: View {
    private enum Field: Hashable {
        case age
        case heightFeet
        case heightInches
        case currentWeight
    }

    @ObservedObject var store: ClientProgramStore
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let programID: UUID

    @State private var goal: NutritionGoal
    @State private var age: String
    @State private var sex: NutritionSex?
    @State private var heightFeet: String
    @State private var heightInches: String
    @State private var currentWeight: String
    @State private var workoutsPerWeek: Int
    @State private var dailyMovement: DailyMovement
    @State private var trainingIntensity: TrainingIntensity
    @State private var validationMessage: String?
    @FocusState private var focusedField: Field?

    init(store: ClientProgramStore, programID: UUID, plan: NutritionPlan) {
        self.store = store
        self.programID = programID
        _goal = State(initialValue: NutritionGoal(rawValue: plan.goal) ?? .fatLoss)
        _age = State(initialValue: plan.age)
        _sex = State(initialValue: NutritionSex(rawValue: plan.sex))
        if let totalInches = NutritionCalculator.parseHeightInches(plan.height) {
            let feet = Int(totalInches / 12)
            let inches = totalInches - (Double(feet) * 12)
            _heightFeet = State(initialValue: String(feet))
            _heightInches = State(initialValue: Self.heightComponentText(inches))
        } else {
            _heightFeet = State(initialValue: "")
            _heightInches = State(initialValue: "")
        }
        _currentWeight = State(initialValue: plan.currentWeight)
        _workoutsPerWeek = State(initialValue: min(max(Int(plan.workoutsPerWeek) ?? 3, 0), 7))
        _dailyMovement = State(initialValue: DailyMovement(rawValue: plan.dailyMovement) ?? .mixed)
        _trainingIntensity = State(initialValue: TrainingIntensity(rawValue: plan.trainingIntensity) ?? .moderate)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 5) {
                Text("Setup")
                    .font(FWBFont.caption.weight(.semibold))
                    .foregroundStyle(Color.fwbMuted)

                Text("Find your starting target")
                    .font(FWBFont.title3.weight(.bold))
                    .tracking(-0.3)
                    .foregroundStyle(Color.fwbWarmWhite)
                    .fixedSize(horizontal: false, vertical: true)
            }

            LazyVGrid(columns: columns, alignment: .leading, spacing: 14) {
                NutritionFormField(title: "Goal") {
                    NutritionGoalMenu(selection: $goal)
                }

                NutritionFormField(title: "Age") {
                    TextField("42", text: $age)
                        .keyboardType(.numberPad)
                        .focused($focusedField, equals: .age)
                        .nutritionInputSurface()
                        .accessibilityIdentifier("nutrition.age")
                }

                NutritionFormField(title: "Sex") {
                    Picker("Sex", selection: $sex) {
                        Text("Select").tag(NutritionSex?.none)
                        ForEach(NutritionSex.allCases) { option in
                            Text(option.title).tag(Optional(option))
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    .tint(Color.fwbWarmWhite)
                    .nutritionInputSurface()
                }

                NutritionFormField(title: "Height") {
                    HStack(spacing: 7) {
                        TextField("5", text: $heightFeet)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .focused($focusedField, equals: .heightFeet)
                            .accessibilityLabel("Height in feet")
                            .accessibilityIdentifier("nutrition.height.feet")

                        Text("ft")
                            .foregroundStyle(Color.fwbMuted)

                        TextField("11", text: $heightInches)
                            .keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing)
                            .focused($focusedField, equals: .heightInches)
                            .accessibilityLabel("Additional inches")
                            .accessibilityIdentifier("nutrition.height.inches")

                        Text("in")
                            .foregroundStyle(Color.fwbMuted)
                    }
                    .nutritionInputSurface()
                    .accessibilityIdentifier("nutrition.height")
                }

                NutritionFormField(title: "Current weight") {
                    TextField("180", text: $currentWeight)
                        .keyboardType(.decimalPad)
                        .focused($focusedField, equals: .currentWeight)
                        .nutritionInputSurface()
                        .accessibilityIdentifier("nutrition.weight")
                }

                NutritionFormField(title: "Workouts per week") {
                    Picker("Workouts per week", selection: $workoutsPerWeek) {
                        ForEach(0...7, id: \.self) { count in
                            Text(count == 7 ? "7+" : String(count)).tag(count)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    .tint(Color.fwbWarmWhite)
                    .nutritionInputSurface()
                }

                NutritionFormField(title: "Daily movement") {
                    Picker("Daily movement", selection: $dailyMovement) {
                        ForEach(DailyMovement.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    .tint(Color.fwbWarmWhite)
                    .nutritionInputSurface()
                }

                NutritionFormField(title: "Training intensity") {
                    Picker("Training intensity", selection: $trainingIntensity) {
                        ForEach(TrainingIntensity.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    .tint(Color.fwbWarmWhite)
                    .nutritionInputSurface()
                }
            }

            Button {
                Task { await saveTargets() }
            } label: {
                if store.nutritionSaveState == .saving {
                    HStack(spacing: 10) {
                        ProgressView()
                            .tint(.black)
                        Text("Saving…")
                    }
                } else {
                    Text("Save calories and macros")
                }
            }
            .buttonStyle(FWBPrimaryButtonStyle())
            .disabled(store.nutritionSaveState == .saving)
            .accessibilityIdentifier("nutrition.save")

            saveStatus
                .font(FWBFont.footnote)
                .fixedSize(horizontal: false, vertical: true)
        }
        .fwbCard()
    }

    private var columns: [GridItem] {
        Array(
            repeating: GridItem(.flexible(), spacing: 12),
            count: dynamicTypeSize.isAccessibilitySize ? 1 : 2
        )
    }

    @ViewBuilder
    private var saveStatus: some View {
        if let validationMessage {
            Text(validationMessage)
                .foregroundStyle(Color.fwbRed)
        } else {
            switch store.nutritionSaveState {
            case .failed(let message):
                Text(message)
                    .foregroundStyle(Color.fwbRed)
            case .saved:
                Text("Saved. Your targets are synced with the website.")
                    .foregroundStyle(Color.fwbLime)
            case .queued:
                Text("Saved on this iPhone. Your targets will sync when you’re back online.")
                    .foregroundStyle(Color.fwbLime)
            case .conflict(let message):
                Text(message)
                    .foregroundStyle(Color.fwbRed)
            case .idle, .saving:
                Text("Estimated targets are a starting point. Review them with Benjamin.")
                    .foregroundStyle(Color.fwbMuted)
            }
        }
    }

    private func saveTargets() async {
        validationMessage = nil

        do {
            let plan = try NutritionCalculator.calculate(
                NutritionCalculatorInput(
                    goal: goal,
                    age: age,
                    sex: sex,
                    height: heightInput,
                    currentWeight: currentWeight,
                    workoutsPerWeek: workoutsPerWeek,
                    dailyMovement: dailyMovement,
                    trainingIntensity: trainingIntensity
                )
            )
            focusedField = nil
            _ = await store.saveNutritionPlan(programID: programID, plan: plan)
        } catch {
            validationMessage = error.localizedDescription
        }
    }

    private var heightInput: String {
        let feet = heightFeet.trimmingCharacters(in: .whitespacesAndNewlines)
        let inches = heightInches.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !feet.isEmpty || !inches.isEmpty else { return "" }
        return "\(feet)'\(inches)\""
    }

    private static func heightComponentText(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%g", value)
    }
}

private struct NutritionGoalMenu: View {
    @Binding var selection: NutritionGoal

    var body: some View {
        Menu {
            ForEach(NutritionGoal.allCases) { option in
                Button {
                    selection = option
                } label: {
                    if selection == option {
                        Label(option.title, systemImage: "checkmark")
                    } else {
                        Text(option.title)
                    }
                }
            }
        } label: {
            HStack(spacing: 8) {
                Text(selection.title)
                    .font(FWBFont.subheadline.weight(.bold))
                    .foregroundStyle(Color.fwbWarmWhite)
                    .lineLimit(2)
                    .minimumScaleFactor(0.9)
                    .multilineTextAlignment(.leading)

                Spacer(minLength: 2)

                Image(systemName: "chevron.up.chevron.down")
                    .font(FWBFont.footnote.weight(.bold))
                    .foregroundStyle(Color.fwbWarmWhite)
                    .accessibilityHidden(true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .nutritionInputSurface()
        .accessibilityLabel("Goal")
        .accessibilityValue(selection.title)
        .accessibilityIdentifier("nutrition.goal")
    }
}

private struct NutritionFormField<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title)
                .font(FWBFont.footnote.weight(.bold))
                .foregroundStyle(Color.fwbWarmWhite)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .fixedSize(horizontal: false, vertical: true)

            content
        }
    }
}

private struct NutritionInputSurfaceModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(FWBFont.subheadline.weight(.bold))
            .foregroundStyle(Color.fwbWarmWhite)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 13)
            .padding(.vertical, 10)
            .frame(minHeight: 48)
            .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.fwbLine, lineWidth: 1)
            }
    }
}

private extension View {
    func nutritionInputSurface() -> some View {
        modifier(NutritionInputSurfaceModifier())
    }
}

private struct NutritionTargetsPlaceholder: View {
    private let columns = [
        GridItem(.flexible(), spacing: 12),
        GridItem(.flexible(), spacing: 12)
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Nutrition")
                    Text("Calories and macros")
                        .font(FWBFont.title.weight(.bold))
                }

                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .frame(width: 110, height: 32)

                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(0..<4, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .frame(minHeight: 94)
                    }
                }
            }
            .padding(16)
            .foregroundStyle(Color.fwbCard)
            .redacted(reason: .placeholder)
        }
    }
}

#Preview("Calories and macros") {
    NavigationStack {
        NutritionTargetsContent(
            store: ClientProgramStore(),
            programID: ClientProgram.preview.id,
            plan: ClientProgram.preview.nutritionPlan ?? NutritionPlan()
        )
            .navigationTitle("Nutrition")
    }
    .preferredColorScheme(.light)
}
