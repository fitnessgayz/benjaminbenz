import SwiftUI

enum PlateWeightUnit: String, CaseIterable, Identifiable {
    case pounds = "LB"
    case kilograms = "KG"

    var id: String { rawValue }

    var spokenName: String {
        switch self {
        case .pounds: return "pounds"
        case .kilograms: return "kilograms"
        }
    }

    var defaultBarWeight: Double {
        switch self {
        case .pounds: return 45
        case .kilograms: return 20
        }
    }

    var defaultTargetWeight: Double {
        switch self {
        case .pounds: return 135
        case .kilograms: return 60
        }
    }

    var barPresets: [WeightPreset] {
        switch self {
        case .pounds:
            return [
                WeightPreset(label: "OLYMPIC", weight: 45),
                WeightPreset(label: "WOMEN'S", weight: 35),
                WeightPreset(label: "TECHNIQUE", weight: 15)
            ]
        case .kilograms:
            return [
                WeightPreset(label: "OLYMPIC", weight: 20),
                WeightPreset(label: "WOMEN'S", weight: 15),
                WeightPreset(label: "TECHNIQUE", weight: 7)
            ]
        }
    }

    var targetPresets: [Double] {
        switch self {
        case .pounds: return [95, 135, 185, 225, 315]
        case .kilograms: return [40, 60, 80, 100, 140]
        }
    }

    var defaultInventory: [PlateInventoryItem] {
        let values: [(Double, Int)]
        switch self {
        case .pounds:
            values = [(45, 4), (35, 1), (25, 2), (10, 2), (5, 1), (2.5, 1)]
        case .kilograms:
            values = [(25, 2), (20, 4), (15, 1), (10, 2), (5, 1), (2.5, 1), (1.25, 1)]
        }
        return values.map { PlateInventoryItem(weight: $0.0, pairCount: $0.1) }
    }
}

struct WeightPreset: Equatable {
    let label: String
    let weight: Double
}

struct PlateInventoryItem: Identifiable, Equatable {
    let id: String
    let weight: Double
    var pairCount: Int

    init(weight: Double, pairCount: Int) {
        id = String(weight)
        self.weight = weight
        self.pairCount = pairCount
    }
}

struct PlateSelection: Equatable {
    let weight: Double
    let countPerSide: Int
}

struct PlateCalculation: Equatable {
    let requestedWeight: Double
    let loadedWeight: Double
    let barWeight: Double
    let platesPerSide: [PlateSelection]
    let isExact: Bool
    let feedback: String?
}

enum PlateCalculator {
    private static let scale = 100

    static func calculate(
        targetWeight: Double,
        barWeight: Double,
        inventory: [PlateInventoryItem]
    ) -> PlateCalculation {
        guard targetWeight > 0, barWeight > 0 else {
            return PlateCalculation(
                requestedWeight: targetWeight,
                loadedWeight: max(barWeight, 0),
                barWeight: max(barWeight, 0),
                platesPerSide: [],
                isExact: false,
                feedback: "Enter positive target and bar weights."
            )
        }

        guard targetWeight >= barWeight else {
            return PlateCalculation(
                requestedWeight: targetWeight,
                loadedWeight: barWeight,
                barWeight: barWeight,
                platesPerSide: [],
                isExact: false,
                feedback: "Target is lighter than the bar. Use a lighter bar or increase the target."
            )
        }

        let desiredSide = max((targetWeight - barWeight) / 2, 0)
        let states = attainableStates(inventory: inventory)
        let desiredTicks = ticks(desiredSide)

        if let counts = states[desiredTicks] {
            return result(
                requestedWeight: targetWeight,
                barWeight: barWeight,
                sideTicks: desiredTicks,
                counts: counts,
                inventory: inventory,
                isExact: true,
                feedback: nil
            )
        }

        let nearestTicks = states.keys.min { left, right in
            let leftDistance = abs(left - desiredTicks)
            let rightDistance = abs(right - desiredTicks)
            if leftDistance == rightDistance { return left < right }
            return leftDistance < rightDistance
        } ?? 0
        let nearestWeight = barWeight + 2 * value(nearestTicks)
        return result(
            requestedWeight: targetWeight,
            barWeight: barWeight,
            sideTicks: nearestTicks,
            counts: states[nearestTicks] ?? Array(repeating: 0, count: inventory.count),
            inventory: inventory,
            isExact: false,
            feedback: "That exact load is not possible with this inventory. Nearest available: \(formatted(nearestWeight))."
        )
    }

    static func closestLoad(
        atOrBelow targetWeight: Double,
        barWeight: Double,
        inventory: [PlateInventoryItem]
    ) -> Double? {
        guard barWeight > 0, targetWeight >= barWeight else { return nil }
        let desiredTicks = ticks((targetWeight - barWeight) / 2)
        guard let sideTicks = attainableStates(inventory: inventory).keys.filter({ $0 <= desiredTicks }).max() else {
            return nil
        }
        return barWeight + 2 * value(sideTicks)
    }

    static func isLoadable(
        _ targetWeight: Double,
        barWeight: Double,
        inventory: [PlateInventoryItem]
    ) -> Bool {
        calculate(targetWeight: targetWeight, barWeight: barWeight, inventory: inventory).isExact
    }

    private static func attainableStates(inventory: [PlateInventoryItem]) -> [Int: [Int]] {
        var states: [Int: [Int]] = [0: Array(repeating: 0, count: inventory.count)]

        for (plateIndex, plate) in inventory.enumerated() where plate.weight > 0 && plate.pairCount > 0 {
            let plateTicks = ticks(plate.weight)
            let snapshot = states
            for (existingTicks, existingCounts) in snapshot {
                for count in 1...plate.pairCount {
                    let totalTicks = existingTicks + plateTicks * count
                    var candidate = existingCounts
                    candidate[plateIndex] = count
                    if let current = states[totalTicks], current.reduce(0, +) <= candidate.reduce(0, +) {
                        continue
                    }
                    states[totalTicks] = candidate
                }
            }
        }
        return states
    }

    private static func result(
        requestedWeight: Double,
        barWeight: Double,
        sideTicks: Int,
        counts: [Int],
        inventory: [PlateInventoryItem],
        isExact: Bool,
        feedback: String?
    ) -> PlateCalculation {
        let breakdown = inventory.enumerated().compactMap { index, plate -> PlateSelection? in
            guard index < counts.count, counts[index] > 0 else { return nil }
            return PlateSelection(weight: plate.weight, countPerSide: counts[index])
        }
        .sorted { $0.weight > $1.weight }

        return PlateCalculation(
            requestedWeight: requestedWeight,
            loadedWeight: barWeight + 2 * value(sideTicks),
            barWeight: barWeight,
            platesPerSide: breakdown,
            isExact: isExact,
            feedback: feedback
        )
    }

    private static func ticks(_ value: Double) -> Int {
        Int((value * Double(scale)).rounded())
    }

    private static func value(_ ticks: Int) -> Double {
        Double(ticks) / Double(scale)
    }

    static func formatted(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%.2f", value).trimmingTrailingZeros
    }
}

struct WarmUpSetPlan: Identifiable, Equatable {
    let id: UUID
    var weight: Double
    var reps: Int
    let percentage: Double
    let isBarOnly: Bool

    init(
        id: UUID = UUID(),
        weight: Double,
        reps: Int,
        percentage: Double,
        isBarOnly: Bool
    ) {
        self.id = id
        self.weight = weight
        self.reps = reps
        self.percentage = percentage
        self.isBarOnly = isBarOnly
    }
}

enum WarmUpCalculator {
    private static let progression: [(percentage: Double, reps: Int)] = [
        (0, 10),
        (0.50, 8),
        (0.65, 5),
        (0.80, 3),
        (0.90, 1)
    ]

    static func generate(
        workingWeight: Double,
        barWeight: Double,
        inventory: [PlateInventoryItem]
    ) -> [WarmUpSetPlan] {
        guard workingWeight > barWeight, barWeight > 0 else { return [] }

        var usedLoads = Set<Int>()
        var sets: [WarmUpSetPlan] = []

        for step in progression {
            let desired = step.percentage == 0
                ? barWeight
                : max(barWeight, workingWeight * step.percentage)
            guard let load = PlateCalculator.closestLoad(
                atOrBelow: desired,
                barWeight: barWeight,
                inventory: inventory
            ), load < workingWeight else { continue }

            let key = Int((load * 100).rounded())
            guard usedLoads.insert(key).inserted else { continue }
            sets.append(
                WarmUpSetPlan(
                    weight: load,
                    reps: step.reps,
                    percentage: load / workingWeight,
                    isBarOnly: abs(load - barWeight) < 0.001
                )
            )
        }

        return sets.sorted { $0.weight < $1.weight }
    }
}

enum WorkoutCalculatorKind: String, Identifiable {
    case plates
    case warmUp

    var id: String { rawValue }
}

struct WorkoutCalculatorSheet: View {
    @Environment(\.dismiss) private var dismiss

    let kind: WorkoutCalculatorKind
    let exerciseName: String
    let suggestedWorkingWeight: Double
    let onInsertWarmUps: ([WarmUpSetPlan]) -> Void

    var body: some View {
        NavigationStack {
            Group {
                switch kind {
                case .plates:
                    PlateCalculatorView(initialTargetWeight: suggestedWorkingWeight)
                case .warmUp:
                    WarmUpCalculatorView(
                        initialWorkingWeight: suggestedWorkingWeight,
                        onInsert: { sets in
                            onInsertWarmUps(sets)
                            dismiss()
                        }
                    )
                }
            }
            .navigationTitle(kind == .plates ? "Plate Calculator" : "Warm-up Sets")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.fwbBackground, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .accessibilityLabel("\(kind == .plates ? "Plate calculator" : "Warm-up sets") for \(exerciseName)")
        .accessibilityIdentifier("workout.calculator.\(kind.rawValue)")
    }
}

private struct PlateCalculatorView: View {
    @State private var unit: PlateWeightUnit
    @State private var targetWeight: String
    @State private var barWeight: String
    @State private var inventory: [PlateInventoryItem]

    init(initialTargetWeight: Double) {
        let unit = PlateWeightUnit.pounds
        _unit = State(initialValue: unit)
        _targetWeight = State(initialValue: PlateCalculator.formatted(initialTargetWeight > 0 ? initialTargetWeight : unit.defaultTargetWeight))
        _barWeight = State(initialValue: PlateCalculator.formatted(unit.defaultBarWeight))
        _inventory = State(initialValue: unit.defaultInventory)
    }

    var body: some View {
        calculatorScroll {
            CalculatorIntro(
                eyebrow: "LOAD THE BAR",
                title: "Exact plates, each side.",
                detail: "Set your bar and available pairs. The result never assumes plates you do not have."
            )

            unitPicker
            weightInputs
            commonTargets
            resultCard
            inventoryCard
        }
        .onChange(of: unit) { newUnit in
            targetWeight = PlateCalculator.formatted(newUnit.defaultTargetWeight)
            barWeight = PlateCalculator.formatted(newUnit.defaultBarWeight)
            inventory = newUnit.defaultInventory
        }
    }

    private var calculation: PlateCalculation {
        PlateCalculator.calculate(
            targetWeight: Double(targetWeight) ?? 0,
            barWeight: Double(barWeight) ?? 0,
            inventory: inventory
        )
    }

    private var unitPicker: some View {
        Picker("Weight unit", selection: $unit) {
            ForEach(PlateWeightUnit.allCases) { unit in
                Text(unit.rawValue).tag(unit)
            }
        }
        .pickerStyle(.segmented)
        .accessibilityIdentifier("plate.unit")
    }

    private var weightInputs: some View {
        VStack(alignment: .leading, spacing: 14) {
            CalculatorNumberField(title: "TARGET WEIGHT", unit: unit.rawValue, text: $targetWeight)
            CalculatorNumberField(title: "BAR WEIGHT", unit: unit.rawValue, text: $barWeight)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(unit.barPresets, id: \.label) { preset in
                        Button("\(preset.label) · \(PlateCalculator.formatted(preset.weight))") {
                            barWeight = PlateCalculator.formatted(preset.weight)
                        }
                        .buttonStyle(CalculatorChipButtonStyle(isSelected: Double(barWeight) == preset.weight))
                    }
                }
            }
        }
        .fwbCard()
    }

    private var commonTargets: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("COMMON LOADS")
                .calculatorSectionHeading()
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(unit.targetPresets, id: \.self) { weight in
                        Button("\(PlateCalculator.formatted(weight)) \(unit.rawValue.lowercased())") {
                            targetWeight = PlateCalculator.formatted(weight)
                        }
                        .buttonStyle(CalculatorChipButtonStyle(isSelected: Double(targetWeight) == weight))
                    }
                }
            }
        }
    }

    private var resultCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                Text(calculation.isExact ? "PER SIDE" : "NEAREST LOAD")
                    .calculatorSectionHeading()
                Spacer()
                Text("\(PlateCalculator.formatted(calculation.loadedWeight)) \(unit.rawValue.lowercased())")
                    .font(.headline.weight(.black))
                    .fontWidth(.condensed)
                    .foregroundStyle(calculation.isExact ? Color.fwbLime : Color.fwbRed)
            }

            if calculation.platesPerSide.isEmpty {
                HStack(spacing: 10) {
                    Image(systemName: "minus")
                    Text(calculation.loadedWeight == calculation.barWeight ? "Bar only" : "No plate combination")
                        .font(.headline.weight(.bold))
                }
                .foregroundStyle(Color.fwbWarmWhite)
            } else {
                AdaptivePlateBreakdown(selections: calculation.platesPerSide, unit: unit)
            }

            if let feedback = calculation.feedback {
                Label(feedback, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.fwbRed)
                    .accessibilityIdentifier("plate.feedback")
            } else {
                Label("Exact load with the selected inventory.", systemImage: "checkmark.circle.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.fwbLime)
            }
        }
        .fwbCard()
        .accessibilityElement(children: .contain)
    }

    private var inventoryCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("AVAILABLE PLATE PAIRS")
                .calculatorSectionHeading()
            Text("Counts are pairs, so one pair means one plate for each side.")
                .font(.footnote)
                .foregroundStyle(Color.fwbMuted)

            ForEach($inventory) { $plate in
                Stepper(value: $plate.pairCount, in: 0...8) {
                    HStack {
                        Text("\(PlateCalculator.formatted(plate.weight)) \(unit.rawValue.lowercased())")
                            .font(.body.weight(.bold))
                            .foregroundStyle(Color.fwbWarmWhite)
                        Spacer()
                        Text("\(plate.pairCount) pair\(plate.pairCount == 1 ? "" : "s")")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Color.fwbMuted)
                    }
                }
                .tint(Color.fwbLime)

                if plate.id != inventory.last?.id {
                    FWBRule(color: Color.fwbLine.opacity(0.6))
                }
            }
        }
        .fwbCard()
    }
}

private struct WarmUpCalculatorView: View {
    let onInsert: ([WarmUpSetPlan]) -> Void

    @State private var workingWeight: String
    @State private var barWeight = "45"
    @State private var inventory = PlateWeightUnit.pounds.defaultInventory
    @State private var sets: [WarmUpSetPlan] = []

    init(initialWorkingWeight: Double, onInsert: @escaping ([WarmUpSetPlan]) -> Void) {
        self.onInsert = onInsert
        _workingWeight = State(initialValue: PlateCalculator.formatted(initialWorkingWeight > 45 ? initialWorkingWeight : 135))
    }

    var body: some View {
        calculatorScroll {
            CalculatorIntro(
                eyebrow: "ARRIVE READY",
                title: "Build to your working weight.",
                detail: "Progressive, loadable sets start with the empty bar and stay out of your working-set totals and PRs."
            )

            VStack(alignment: .leading, spacing: 14) {
                CalculatorNumberField(title: "WORKING WEIGHT", unit: "LB", text: $workingWeight)
                CalculatorNumberField(title: "BAR WEIGHT", unit: "LB", text: $barWeight)

                Button {
                    regenerate()
                } label: {
                    Label("REGENERATE SETS", systemImage: "arrow.clockwise")
                }
                .buttonStyle(FWBSecondaryButtonStyle())
            }
            .fwbCard()

            warmUpSetsCard

            Button {
                onInsert(validatedSets)
            } label: {
                Label("INSERT \(validatedSets.count) WARM-UP SET\(validatedSets.count == 1 ? "" : "S")", systemImage: "plus")
            }
            .buttonStyle(FWBPrimaryButtonStyle())
            .disabled(validationMessage != nil || validatedSets.isEmpty)
            .accessibilityIdentifier("warmup.insert")
        }
        .onAppear {
            if sets.isEmpty { regenerate() }
        }
    }

    private var warmUpSetsCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("WARM-UP SETS")
                    .calculatorSectionHeading()
                Spacer()
                Text("EDIT BEFORE INSERTING")
                    .font(.caption2.bold())
                    .tracking(0.6)
                    .foregroundStyle(Color.fwbMuted)
            }

            if sets.isEmpty {
                Text(emptyMessage)
                    .font(.subheadline)
                    .foregroundStyle(Color.fwbMuted)
                    .padding(.vertical, 8)
            }

            ForEach($sets) { $set in
                WarmUpEditorRow(set: $set) {
                    sets.removeAll { $0.id == set.id }
                }
            }

            if let validationMessage {
                Label(validationMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.fwbRed)
                    .accessibilityIdentifier("warmup.feedback")
            }
        }
        .fwbCard()
    }

    private var validatedSets: [WarmUpSetPlan] {
        sets.sorted { $0.weight < $1.weight }
    }

    private var validationMessage: String? {
        guard let working = Double(workingWeight), let bar = Double(barWeight), working > bar else {
            return "Working weight must be heavier than the bar. Bar-only work does not need ramp-up sets."
        }
        guard !sets.isEmpty else { return nil }

        var seen = Set<Int>()
        for set in sets {
            guard set.weight >= bar, set.weight < working, set.reps > 0 else {
                return "Each warm-up must be at least the bar, below the working weight, and include reps."
            }
            guard PlateCalculator.isLoadable(set.weight, barWeight: bar, inventory: inventory) else {
                return "\(PlateCalculator.formatted(set.weight)) lb cannot be loaded with the available plates. Regenerate or edit it."
            }
            let key = Int((set.weight * 100).rounded())
            guard seen.insert(key).inserted else {
                return "Duplicate warm-up weights are not inserted. Edit or remove one of them."
            }
        }
        return nil
    }

    private var emptyMessage: String {
        guard let working = Double(workingWeight), let bar = Double(barWeight), working > bar else {
            return "A bar-only working weight does not need additional warm-up loads."
        }
        return "No progressive loads fit below this working weight with the current bar."
    }

    private func regenerate() {
        sets = WarmUpCalculator.generate(
            workingWeight: Double(workingWeight) ?? 0,
            barWeight: Double(barWeight) ?? 0,
            inventory: inventory
        )
    }
}

private struct CalculatorIntro: View {
    let eyebrow: String
    let title: String
    let detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(eyebrow)
                .font(.footnote.bold())
                .tracking(1.1)
                .foregroundStyle(Color.fwbLime)
            Text(title)
                .font(.largeTitle.weight(.black))
                .fontWidth(.condensed)
                .foregroundStyle(Color.fwbWarmWhite)
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct CalculatorNumberField: View {
    let title: String
    let unit: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title)
                .calculatorSectionHeading()
            HStack(spacing: 8) {
                TextField("0", text: $text)
                    .keyboardType(.decimalPad)
                    .font(.title2.weight(.black))
                    .fontWidth(.condensed)
                    .foregroundStyle(Color.fwbWarmWhite)
                Text(unit)
                    .font(.footnote.bold())
                    .foregroundStyle(Color.fwbMuted)
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 52)
            .background(Color.fwbSurface, in: Rectangle())
            .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
        }
    }
}

private struct EditableWarmUpNumber: View {
    let title: String
    let suffix: String
    @Binding var value: Double

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text(title)
                .font(.caption2.bold())
                .foregroundStyle(Color.fwbMuted)
            HStack(spacing: 3) {
                TextField("0", value: $value, format: .number.precision(.fractionLength(0...2)))
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .font(.headline.weight(.bold))
                    .foregroundStyle(Color.fwbWarmWhite)
                Text(suffix)
                    .font(.caption.bold())
                    .foregroundStyle(Color.fwbMuted)
            }
        }
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, minHeight: 48)
        .background(Color.fwbSurface, in: Rectangle())
        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
    }
}

private struct EditableWarmUpReps: View {
    @Binding var value: Int

    var body: some View {
        VStack(alignment: .trailing, spacing: 2) {
            Text("REPS")
                .font(.caption2.bold())
                .foregroundStyle(Color.fwbMuted)
            TextField("0", value: $value, format: .number)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .font(.headline.weight(.bold))
                .foregroundStyle(Color.fwbWarmWhite)
        }
        .padding(.horizontal, 8)
        .frame(width: 58, height: 48)
        .background(Color.fwbSurface, in: Rectangle())
        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
    }
}

private struct WarmUpEditorRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Binding var set: WarmUpSetPlan
    let onDelete: () -> Void

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 8) {
                    header
                    HStack(spacing: 8) {
                        EditableWarmUpNumber(title: "WEIGHT", suffix: "lb", value: $set.weight)
                        EditableWarmUpReps(value: $set.reps)
                        deleteButton
                    }
                }
            } else {
                HStack(spacing: 10) {
                    header.frame(width: 54, alignment: .leading)
                    EditableWarmUpNumber(title: "WEIGHT", suffix: "lb", value: $set.weight)
                    Text("×")
                        .font(.headline.bold())
                        .foregroundStyle(Color.fwbMuted)
                    EditableWarmUpReps(value: $set.reps)
                    deleteButton
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(set.isBarOnly ? "BAR" : "\(Int((set.percentage * 100).rounded()))%")
                .font(.caption.bold())
                .tracking(0.5)
                .foregroundStyle(Color.fwbLime)
            Text("WARM-UP")
                .font(.caption2.bold())
                .foregroundStyle(Color.fwbMuted)
        }
    }

    private var deleteButton: some View {
        Button(role: .destructive, action: onDelete) {
            Image(systemName: "trash")
                .frame(width: 34, height: 44)
        }
        .foregroundStyle(Color.fwbRed)
        .accessibilityLabel("Delete warm-up set")
    }
}

private struct AdaptivePlateBreakdown: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let selections: [PlateSelection]
    let unit: PlateWeightUnit

    var body: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 8) { plateRows }
        } else {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), spacing: 8)], spacing: 8) { plateRows }
        }
    }

    @ViewBuilder
    private var plateRows: some View {
        ForEach(selections, id: \.weight) { selection in
            HStack(spacing: 7) {
                Text("\(selection.countPerSide)×")
                    .foregroundStyle(Color.fwbLime)
                Text("\(PlateCalculator.formatted(selection.weight)) \(unit.rawValue.lowercased())")
                    .foregroundStyle(Color.fwbWarmWhite)
            }
            .font(.headline.weight(.black))
            .fontWidth(.condensed)
            .padding(.horizontal, 10)
            .frame(minHeight: 42)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.fwbSurface, in: Rectangle())
        }
    }
}

private struct CalculatorChipButtonStyle: ButtonStyle {
    let isSelected: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.caption.weight(.black))
            .foregroundStyle(isSelected ? Color.black : Color.fwbWarmWhite)
            .padding(.horizontal, 11)
            .frame(minHeight: 38)
            .background(isSelected ? Color.fwbAccentFill : Color.fwbSurface, in: Rectangle())
            .overlay { Rectangle().stroke(isSelected ? Color.fwbAccentFill : Color.fwbLine, lineWidth: 1) }
            .opacity(configuration.isPressed ? 0.75 : 1)
    }
}

private func calculatorScroll<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    ZStack {
        Color.fwbBackground.ignoresSafeArea()
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                content()
            }
            .padding(20)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
    }
}

private extension View {
    func calculatorSectionHeading() -> some View {
        font(.footnote.bold())
            .tracking(0.8)
            .foregroundStyle(Color.fwbMuted)
    }
}

private extension String {
    var trimmingTrailingZeros: String {
        var value = self
        while value.last == "0" { value.removeLast() }
        if value.last == "." { value.removeLast() }
        return value
    }
}

extension Exercise {
    var supportsBarbellCalculators: Bool {
        let normalized = name.lowercased()
        let exclusions = ["dumbbell", "kettlebell", "cable", "machine", "bodyweight", "band"]
        guard !exclusions.contains(where: normalized.contains) else { return false }

        let barbellMovements = [
            "barbell", "bench press", "squat", "deadlift", "overhead press", "shoulder press",
            "push press", "hip thrust", "clean", "snatch", "good morning", "landmine"
        ]
        return barbellMovements.contains(where: normalized.contains)
    }
}
