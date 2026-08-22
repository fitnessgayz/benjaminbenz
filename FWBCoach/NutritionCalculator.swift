import Foundation

enum NutritionGoal: String, CaseIterable, Identifiable {
    case fatLoss = "fat_loss"
    case muscleGain = "muscle_gain"
    case recomposition
    case maintenance

    var id: String { rawValue }

    var title: String {
        switch self {
        case .fatLoss: "Fat loss"
        case .muscleGain: "Build muscle"
        case .recomposition: "Build muscle + lean out"
        case .maintenance: "Maintain"
        }
    }

    var resultLabel: String {
        switch self {
        case .fatLoss: "fat loss"
        case .muscleGain: "muscle gain"
        case .recomposition: "building muscle and leaning out"
        case .maintenance: "maintenance"
        }
    }

    var calorieMultiplier: Double {
        switch self {
        case .fatLoss: 0.85
        case .muscleGain: 1.10
        case .recomposition: 0.98
        case .maintenance: 1
        }
    }

    var proteinPerPound: Double {
        switch self {
        case .fatLoss, .recomposition: 1
        case .muscleGain: 0.9
        case .maintenance: 0.8
        }
    }
}

enum NutritionSex: String, CaseIterable, Identifiable {
    case male
    case female

    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var bmrAdjustment: Double { self == .female ? -161 : 5 }
}

enum DailyMovement: String, CaseIterable, Identifiable {
    case mostlySitting = "mostly_sitting"
    case mixed
    case activeJob = "active_job"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .mostlySitting: "Mostly sitting"
        case .mixed: "Mixed"
        case .activeJob: "Active job"
        }
    }

    var baseFactor: Double {
        switch self {
        case .mostlySitting: 1.2
        case .mixed: 1.35
        case .activeJob: 1.5
        }
    }
}

enum TrainingIntensity: String, CaseIterable, Identifiable {
    case light
    case moderate
    case hard

    var id: String { rawValue }
    var title: String { rawValue.capitalized }

    var factorAdjustment: Double {
        switch self {
        case .light: -0.03
        case .moderate: 0
        case .hard: 0.05
        }
    }
}

struct NutritionCalculatorInput {
    let goal: NutritionGoal
    let age: String
    let sex: NutritionSex?
    let height: String
    let currentWeight: String
    let workoutsPerWeek: Int
    let dailyMovement: DailyMovement
    let trainingIntensity: TrainingIntensity
}

enum NutritionCalculatorError: LocalizedError {
    case missingRequiredFields
    case invalidAge
    case invalidHeight
    case invalidWeight

    var errorDescription: String? {
        switch self {
        case .missingRequiredFields:
            "Add age, sex, height, and current weight first."
        case .invalidAge:
            "Enter an age between 13 and 100."
        case .invalidHeight:
            "Enter height like 5'10\" or total inches."
        case .invalidWeight:
            "Enter a current weight between 60 and 700 pounds."
        }
    }
}

enum NutritionCalculator {
    static func calculate(_ input: NutritionCalculatorInput, now: Date = Date()) throws -> NutritionPlan {
        let trimmedAge = input.age.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedHeight = input.height.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedWeight = input.currentWeight.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedAge.isEmpty,
              !trimmedHeight.isEmpty,
              !trimmedWeight.isEmpty,
              let sex = input.sex else {
            throw NutritionCalculatorError.missingRequiredFields
        }

        guard let age = Int(trimmedAge), (13...100).contains(age) else {
            throw NutritionCalculatorError.invalidAge
        }

        let heightInches = parseHeightInches(trimmedHeight)
        guard heightInches >= 36, heightInches <= 96 else {
            throw NutritionCalculatorError.invalidHeight
        }

        guard let weightPounds = numericValue(trimmedWeight),
              weightPounds >= 60,
              weightPounds <= 700 else {
            throw NutritionCalculatorError.invalidWeight
        }

        let weightKilograms = weightPounds * 0.45359237
        let heightCentimeters = heightInches * 2.54
        let bmr = (10 * weightKilograms)
            + (6.25 * heightCentimeters)
            - (5 * Double(age))
            + sex.bmrAdjustment
        let activityFactor = min(
            max(
                input.dailyMovement.baseFactor
                    + workoutBoost(for: input.workoutsPerWeek)
                    + input.trainingIntensity.factorAdjustment,
                1.2
            ),
            1.85
        )
        let maintenanceCalories = round(bmr * activityFactor, nearest: 25)
        let calories = round(Double(maintenanceCalories) * input.goal.calorieMultiplier, nearest: 25)
        let protein = round(weightPounds * input.goal.proteinPerPound, nearest: 5)
        let fat = round((Double(calories) * 0.25) / 9, nearest: 5)
        let carbCalories = max(calories - ((protein * 4) + (fat * 9)), 0)
        let carbs = round(Double(carbCalories) / 4, nearest: 5)

        return NutritionPlan(
            calories: "\(calories) cal",
            protein: "\(protein)g",
            carbs: "\(carbs)g",
            fat: "\(fat)g",
            guide: "Starting target for \(input.goal.resultLabel). Review with Benjamin and adjust based on energy, hunger, performance, and progress.",
            source: "client_calculator",
            goal: input.goal.rawValue,
            sex: sex.rawValue,
            age: String(age),
            height: trimmedHeight,
            currentWeight: formattedNumber(weightPounds),
            workoutsPerWeek: String(min(max(input.workoutsPerWeek, 0), 7)),
            dailyMovement: input.dailyMovement.rawValue,
            trainingIntensity: input.trainingIntensity.rawValue,
            activityFactor: String(format: "%.2f", activityFactor),
            maintenanceCalories: String(maintenanceCalories),
            updatedAt: now.ISO8601Format()
        )
    }

    static func parseHeightInches(_ value: String) -> Double {
        let normalized = value
            .lowercased()
            .replacingOccurrences(of: "feet", with: "'")
            .replacingOccurrences(of: "foot", with: "'")
            .replacingOccurrences(of: "ft", with: "'")

        if let apostrophe = normalized.firstIndex(of: "'") {
            let feetText = String(normalized[..<apostrophe])
            let inchesText = String(normalized[normalized.index(after: apostrophe)...])
            guard let feet = numericValue(feetText) else { return 0 }
            let inches = numericValue(inchesText) ?? 0
            return (feet * 12) + inches
        }

        guard let number = numericValue(normalized) else { return 0 }
        return number <= 8 ? number * 12 : number
    }

    private static func numericValue(_ value: String) -> Double? {
        let allowed = value.filter { $0.isNumber || $0 == "." }
        return Double(allowed)
    }

    private static func workoutBoost(for workoutsPerWeek: Int) -> Double {
        switch min(max(workoutsPerWeek, 0), 7) {
        case 0: 0
        case 1...2: 0.1
        case 3...4: 0.2
        case 5...6: 0.3
        default: 0.35
        }
    }

    private static func round(_ value: Double, nearest: Double) -> Int {
        Int((value / nearest).rounded() * nearest)
    }

    private static func formattedNumber(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(value)
    }
}
