import Foundation

struct SignedInAccount: Equatable {
    let id: UUID
    let email: String
}

struct ClientProgram: Decodable, Identifiable, Equatable {
    let id: UUID
    let clientEmail: String
    let clientName: String
    let initials: String
    let programTitle: String
    let programSummary: String
    let sessionCountUsed: Int
    let sessionCountTotal: Int
    let fitnessGoal: String
    let focusTarget: String
    let coachNoteTitle: String
    let coachNoteBody: String
    let nutritionPlan: NutritionPlan?
    let workouts: [Workout]
    let updatedAt: String?
    let syncSource: String?
    let sourceVersion: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case clientEmail = "client_email"
        case clientName = "client_name"
        case initials
        case programTitle = "program_title"
        case programSummary = "program_summary"
        case sessionCountUsed = "session_count_used"
        case sessionCountTotal = "session_count_total"
        case fitnessGoal = "fitness_goal"
        case focusTarget = "focus_target"
        case coachNoteTitle = "coach_note_title"
        case coachNoteBody = "coach_note_body"
        case nutritionPlan = "nutrition_plan"
        case workouts
        case updatedAt = "updated_at"
        case syncSource = "sync_source"
        case sourceVersion = "source_version"
    }

    var displayInitials: String {
        let saved = initials.trimmingCharacters(in: .whitespacesAndNewlines)
        guard saved.isEmpty else { return saved }

        return clientName
            .split(separator: " ")
            .prefix(2)
            .compactMap(\.first)
            .map(String.init)
            .joined()
            .uppercased()
    }

    var sessionProgress: Double {
        guard sessionCountTotal > 0 else { return 0 }
        return min(Double(sessionCountUsed) / Double(sessionCountTotal), 1)
    }

    func replacingNutritionPlan(_ plan: NutritionPlan) -> ClientProgram {
        ClientProgram(
            id: id,
            clientEmail: clientEmail,
            clientName: clientName,
            initials: initials,
            programTitle: programTitle,
            programSummary: programSummary,
            sessionCountUsed: sessionCountUsed,
            sessionCountTotal: sessionCountTotal,
            fitnessGoal: fitnessGoal,
            focusTarget: focusTarget,
            coachNoteTitle: coachNoteTitle,
            coachNoteBody: coachNoteBody,
            nutritionPlan: plan,
            workouts: workouts,
            updatedAt: updatedAt,
            syncSource: ContinuitySync.source,
            sourceVersion: ContinuitySync.sourceVersion
        )
    }
}

struct NutritionPlan: Codable, Equatable {
    let calories: String
    let protein: String
    let carbs: String
    let fat: String
    let guide: String
    let source: String
    let goal: String
    let sex: String
    let age: String
    let height: String
    let currentWeight: String
    let workoutsPerWeek: String
    let dailyMovement: String
    let trainingIntensity: String
    let activityFactor: String
    let maintenanceCalories: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case calories
        case protein
        case carbs
        case fat
        case guide
        case source
        case goal
        case sex
        case age
        case height
        case currentWeight = "current_weight"
        case workoutsPerWeek = "workouts_per_week"
        case dailyMovement = "daily_movement"
        case trainingIntensity = "training_intensity"
        case activityFactor = "activity_factor"
        case maintenanceCalories = "maintenance_calories"
        case updatedAt = "updated_at"
    }

    init(
        calories: String = "",
        protein: String = "",
        carbs: String = "",
        fat: String = "",
        guide: String = "",
        source: String = "",
        goal: String = "",
        sex: String = "",
        age: String = "",
        height: String = "",
        currentWeight: String = "",
        workoutsPerWeek: String = "",
        dailyMovement: String = "",
        trainingIntensity: String = "",
        activityFactor: String = "",
        maintenanceCalories: String = "",
        updatedAt: String = ""
    ) {
        self.calories = calories
        self.protein = protein
        self.carbs = carbs
        self.fat = fat
        self.guide = guide
        self.source = source
        self.goal = goal
        self.sex = sex
        self.age = age
        self.height = height
        self.currentWeight = currentWeight
        self.workoutsPerWeek = workoutsPerWeek
        self.dailyMovement = dailyMovement
        self.trainingIntensity = trainingIntensity
        self.activityFactor = activityFactor
        self.maintenanceCalories = maintenanceCalories
        self.updatedAt = updatedAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        calories = try container.decodeIfPresent(String.self, forKey: .calories) ?? ""
        protein = try container.decodeIfPresent(String.self, forKey: .protein) ?? ""
        carbs = try container.decodeIfPresent(String.self, forKey: .carbs) ?? ""
        fat = try container.decodeIfPresent(String.self, forKey: .fat) ?? ""
        guide = try container.decodeIfPresent(String.self, forKey: .guide) ?? ""
        source = try container.decodeIfPresent(String.self, forKey: .source) ?? ""
        goal = try container.decodeIfPresent(String.self, forKey: .goal) ?? ""
        sex = try container.decodeIfPresent(String.self, forKey: .sex) ?? ""
        age = try container.decodeIfPresent(String.self, forKey: .age) ?? ""
        height = try container.decodeIfPresent(String.self, forKey: .height) ?? ""
        currentWeight = try container.decodeIfPresent(String.self, forKey: .currentWeight) ?? ""
        workoutsPerWeek = try container.decodeIfPresent(String.self, forKey: .workoutsPerWeek) ?? ""
        dailyMovement = try container.decodeIfPresent(String.self, forKey: .dailyMovement) ?? ""
        trainingIntensity = try container.decodeIfPresent(String.self, forKey: .trainingIntensity) ?? ""
        activityFactor = try container.decodeIfPresent(String.self, forKey: .activityFactor) ?? ""
        maintenanceCalories = try container.decodeIfPresent(String.self, forKey: .maintenanceCalories) ?? ""
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt) ?? ""
    }

    var hasTargets: Bool {
        [calories, protein, carbs, fat].contains {
            !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }
    }

    var statusLabel: String {
        switch source {
        case "client_calculator": "CLIENT SETUP"
        case "client_manual": "CLIENT EDITED"
        default: "COACH PLAN"
        }
    }
}

struct ClientNutritionPlanUpdate: Encodable {
    let nutritionPlan: NutritionPlan

    enum CodingKeys: String, CodingKey {
        case nutritionPlan = "nutrition_plan"
    }
}

struct ClientNutritionPlanSyncUpdate: Encodable {
    let nutritionPlan: NutritionPlan
    let syncSource = ContinuitySync.source
    let sourceVersion = ContinuitySync.sourceVersion
    let clientUpdatedAt: String

    init(nutritionPlan: NutritionPlan) {
        self.nutritionPlan = nutritionPlan
        clientUpdatedAt = nutritionPlan.updatedAt.isEmpty
            ? ContinuityDateCoding.string(from: Date())
            : nutritionPlan.updatedAt
    }

    enum CodingKeys: String, CodingKey {
        case nutritionPlan = "nutrition_plan"
        case syncSource = "sync_source"
        case sourceVersion = "source_version"
        case clientUpdatedAt = "client_updated_at"
    }
}

struct Workout: Decodable, Identifiable, Equatable, Hashable {
    let id: UUID
    let title: String
    let focus: String
    let format: String
    let exercises: [Exercise]

    enum CodingKeys: String, CodingKey {
        case id
        case workoutID = "workout_id"
        case templateID = "template_id"
        case title
        case focus
        case format
        case exercises
    }

    init(
        id: UUID = UUID(),
        title: String,
        focus: String = "",
        format: String = "",
        exercises: [Exercise] = []
    ) {
        self.id = id
        self.title = title
        self.focus = focus
        self.format = format
        self.exercises = exercises
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Workout"
        focus = try container.decodeIfPresent(String.self, forKey: .focus) ?? ""
        format = try container.decodeIfPresent(String.self, forKey: .format) ?? ""
        exercises = try container.decodeIfPresent([Exercise].self, forKey: .exercises) ?? []

        let suppliedID = (try? container.decodeIfPresent(UUID.self, forKey: .id))
            ?? (try? container.decodeIfPresent(UUID.self, forKey: .workoutID))
            ?? (try? container.decodeIfPresent(UUID.self, forKey: .templateID))
        id = suppliedID ?? ContinuitySync.stableUUID(
            namespace: "fwb-workout-template-v1",
            name: [title, focus, format].joined(separator: "|").lowercased()
        )
    }

    var formatLabel: String {
        switch format.lowercased() {
        case "superset": "Superset"
        case "circuit": "Circuit"
        case "custom": "Custom"
        case "mobility": "Mobility"
        default: "Strength"
        }
    }
}

struct Exercise: Decodable, Identifiable, Equatable, Hashable {
    let code: String
    let name: String
    let prescription: String
    let rest: String
    let instructions: [String]
    let video: String

    var id: String {
        code.isEmpty ? name : code
    }

    enum CodingKeys: String, CodingKey {
        case code
        case name
        case prescription
        case rest
        case instructions
        case instruction
        case howTo
        case howToSnake = "how_to"
        case cues
        case video
        case videoUrl
        case videoURLSnake = "video_url"
        case youtubeURL = "youtube_url"
    }

    init(
        code: String,
        name: String,
        prescription: String = "",
        rest: String = "",
        instructions: [String] = [],
        video: String = ""
    ) {
        self.code = code
        self.name = name
        self.prescription = prescription
        self.rest = rest
        self.instructions = instructions
        self.video = video
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        code = try container.decodeIfPresent(String.self, forKey: .code) ?? ""
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? "Exercise"
        prescription = try container.decodeIfPresent(String.self, forKey: .prescription) ?? ""
        rest = try container.decodeIfPresent(String.self, forKey: .rest) ?? ""
        instructions = Self.decodeInstructions(from: container)
        video = try container.decodeIfPresent(String.self, forKey: .video)
            ?? container.decodeIfPresent(String.self, forKey: .videoUrl)
            ?? container.decodeIfPresent(String.self, forKey: .videoURLSnake)
            ?? container.decodeIfPresent(String.self, forKey: .youtubeURL)
            ?? ""
    }

    var instructionSteps: [String] {
        let suppliedSteps = instructions
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return suppliedSteps.isEmpty ? ExerciseInstructionLibrary.steps(for: name) : suppliedSteps
    }

    var demoURL: URL? {
        let savedVideo = video.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !savedVideo.isEmpty else {
            return Self.youtubeSearchURL(for: name)
        }

        var rawURL = savedVideo
        if !rawURL.contains("://") {
            rawURL = "https://\(rawURL)"
        }

        guard let url = URL(string: rawURL),
              let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              let host = url.host?.lowercased().replacingOccurrences(of: "www.", with: ""),
              Self.allowedYouTubeHosts.contains(host) else {
            return Self.youtubeSearchURL(for: name)
        }

        return url
    }

    private static let allowedYouTubeHosts: Set<String> = [
        "youtube.com",
        "youtube-nocookie.com",
        "m.youtube.com",
        "youtu.be"
    ]

    private static func youtubeSearchURL(for exerciseName: String) -> URL? {
        let trimmedName = exerciseName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else { return nil }

        var components = URLComponents(string: "https://www.youtube.com/results")
        components?.queryItems = [
            URLQueryItem(name: "search_query", value: "\(trimmedName) exercise demo")
        ]
        return components?.url
    }

    private static func decodeInstructions(
        from container: KeyedDecodingContainer<CodingKeys>
    ) -> [String] {
        let keys: [CodingKeys] = [.instructions, .instruction, .howTo, .howToSnake, .cues]

        for key in keys {
            if let steps = try? container.decode([String].self, forKey: key), !steps.isEmpty {
                return steps
            }
            if let text = try? container.decode(String.self, forKey: key) {
                let steps = text
                    .components(separatedBy: .newlines)
                    .map {
                        $0.trimmingCharacters(in: .whitespacesAndNewlines)
                            .replacingOccurrences(
                                of: #"^\s*(?:\d+[.)]|[-•])\s*"#,
                                with: "",
                                options: .regularExpression
                            )
                    }
                    .filter { !$0.isEmpty }
                if !steps.isEmpty { return steps }
            }
        }

        return []
    }
}

enum ExerciseInstructionLibrary {
    static func steps(for exerciseName: String) -> [String] {
        let name = exerciseName.lowercased()

        if name.contains("jump rope") {
            return [
                "Stand tall with soft knees and keep your elbows close to your sides.",
                "Turn the rope with small wrist circles and make low, quiet jumps.",
                "Stay relaxed and stop before your calves tighten or your landing gets heavy."
            ]
        }
        if name.contains("knee-to-wall") || name.contains("ankle rock") {
            return [
                "Plant your full foot and point the knee over the second or third toe.",
                "Drive the knee forward toward the wall without letting the heel lift.",
                "Pause briefly, return with control, and use a comfortable range."
            ]
        }
        if name.contains("soleus") || name.contains("bent-knee calf") {
            return [
                "Keep the knee bent so the lower calf stays loaded throughout the rep.",
                "Press through the ball of the foot, lift the heel, and pause at the top.",
                "Lower slowly without bouncing and keep the ankle tracking straight."
            ]
        }
        if name.contains("tibialis") || name.contains("toe raise") {
            return [
                "Keep your heels planted and your body tall.",
                "Pull your toes toward your shins without rocking your hips backward.",
                "Pause at the top and lower the feet under control."
            ]
        }
        if name.contains("pogo") || name.contains("hop") {
            return [
                "Stand tall with soft knees and brace lightly through your trunk.",
                "Use quick, low contacts and land quietly under your center of mass.",
                "Stop the set if rhythm, control, or comfortable calf tolerance changes."
            ]
        }
        if name.contains("squat") {
            return [
                "Set your feet securely, brace your trunk, and keep pressure through the whole foot.",
                "Sit down between your hips while the knees track with the toes.",
                "Drive the floor away and finish tall without rushing the rep."
            ]
        }
        if name.contains("deadlift") || name.contains("rdl") || name.contains("romanian") {
            return [
                "Brace your trunk and keep the weight close to your legs.",
                "Push the hips back while maintaining a long, neutral spine.",
                "Drive through the floor and squeeze the glutes to stand tall."
            ]
        }
        if name.contains("row") {
            return [
                "Set your torso and keep the shoulder away from your ear.",
                "Pull the elbow toward your hip without twisting or shrugging.",
                "Pause briefly, then return to the start under control."
            ]
        }
        if name.contains("press") || name.contains("push-up") || name.contains("pushup") {
            return [
                "Create a stable base and keep your wrists stacked under the load.",
                "Lower with control while keeping your shoulders comfortably positioned.",
                "Press smoothly without bouncing or losing your trunk position."
            ]
        }
        if name.contains("walk") || name.contains("bike") || name.contains("treadmill") {
            return [
                "Begin at an easy pace and gradually settle into the planned effort.",
                "Keep your breathing controlled and your movement relaxed.",
                "Ease down for the final minute instead of stopping abruptly."
            ]
        }

        return [
            "Set up in a stable position and review the prescribed sets, reps, and rest.",
            "Move through a controlled, comfortable range without using momentum.",
            "Stop if you feel sharp pain, unusual symptoms, or cannot maintain good form."
        ]
    }
}

enum CardioLogCodec {
    static func buildNotes(calories: String, notes: String) -> String {
        var parts: [String] = []
        let calories = calories.trimmingCharacters(in: .whitespacesAndNewlines)
        let notes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        if !calories.isEmpty { parts.append("Calories: \(calories)") }
        if !notes.isEmpty { parts.append(notes) }
        return parts.joined(separator: "\n")
    }

    static func parseNotes(_ value: String?) -> (calories: String, notes: String) {
        let text = value ?? ""
        let pattern = #"(?im)^Calories:\s*(\d+(?:\.\d+)?)\s*$"#
        let expression = try? NSRegularExpression(pattern: pattern)
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        let match = expression?.firstMatch(in: text, range: range)
        var calories = ""

        if let match,
           let calorieRange = Range(match.range(at: 1), in: text) {
            calories = String(text[calorieRange])
        }

        let cleaned = expression?
            .stringByReplacingMatches(in: text, range: range, withTemplate: "")
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? text
        return (calories, cleaned)
    }
}

struct ExerciseNameRecord: Decodable {
    let exerciseCode: String
    let exerciseName: String

    enum CodingKeys: String, CodingKey {
        case exerciseCode = "exercise_code"
        case exerciseName = "exercise_name"
    }
}

enum ExerciseNameIdentity {
    private static let tokenAliases: [String: String] = [
        "db": "dumbbell",
        "dumbell": "dumbbell",
        "bb": "barbell",
        "asst": "assisted"
    ]

    static func displayKey(for name: String) -> String {
        name
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(
                options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive],
                locale: Locale(identifier: "en_US_POSIX")
            )
            .replacingOccurrences(of: "&", with: " and ")
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    static func key(for name: String) -> String {
        displayKey(for: name)
            .split(separator: " ")
            .map(String.init)
            .map { tokenAliases[$0] ?? $0 }
            .joined(separator: " ")
    }

    static func canonicalName(
        for name: String,
        approvedExercises: [ApprovedExercise] = []
    ) -> String {
        let identity = key(for: name)
        guard !identity.isEmpty else { return "Exercise" }

        if let approved = approvedExercises.first(where: { exercise in
            key(for: exercise.name) == identity
                || exercise.aliases.contains { key(for: $0) == identity }
        }) {
            return approved.name.fwbTitleCased
        }

        if let libraryExercise = ExerciseLibrary.items.first(where: {
            key(for: $0.exercise.name) == identity
        })?.exercise {
            return libraryExercise.name.fwbTitleCased
        }

        return name
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .fwbTitleCased
    }
}

struct ApprovedExercise: Decodable, Identifiable, Equatable {
    let id: UUID
    let name: String
    let aliases: [String]
    let primaryMuscle: String
    let secondaryMuscles: [String]
    let equipment: String
    let difficulty: String
    let movementPattern: String
    let defaultSets: Int
    let defaultReps: String
    let defaultRestSeconds: Int
    let substitutionGroup: String
    let demoURL: String?
    let instructions: String

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case aliases
        case primaryMuscle = "primary_muscle"
        case secondaryMuscles = "secondary_muscles"
        case equipment
        case difficulty
        case movementPattern = "movement_pattern"
        case defaultSets = "default_sets"
        case defaultReps = "default_reps"
        case defaultRestSeconds = "default_rest_seconds"
        case substitutionGroup = "substitution_group"
        case demoURL = "demo_url"
        case instructions
    }
}

enum ExerciseSuggestionLibrary {
    static func merged(_ groups: [[String]]) -> [String] {
        var namesByKey: [String: String] = [:]

        for name in groups.flatMap({ $0 }) {
            let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            let key = ExerciseNameIdentity.key(for: trimmed)
            guard !trimmed.isEmpty, namesByKey[key] == nil else { continue }
            namesByKey[key] = trimmed.fwbTitleCased
        }

        return namesByKey.values.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    static func matches(query: String, within names: [String], limit: Int = 6) -> [String] {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedQuery = ExerciseNameIdentity.key(for: trimmedQuery)
        let displayQuery = ExerciseNameIdentity.displayKey(for: trimmedQuery)

        return names
            .compactMap { candidate -> (name: String, score: Double)? in
                let normalizedCandidate = ExerciseNameIdentity.key(for: candidate)
                let displayCandidate = ExerciseNameIdentity.displayKey(for: candidate)

                guard displayCandidate != displayQuery else { return nil }
                guard !normalizedQuery.isEmpty else { return (candidate, 0) }

                let score = similarityScore(normalizedQuery, normalizedCandidate)
                return score >= 0.60 ? (candidate, score) : nil
            }
            .sorted { left, right in
                let leftStartsWithQuery = ExerciseNameIdentity.key(for: left.name).hasPrefix(normalizedQuery)
                let rightStartsWithQuery = ExerciseNameIdentity.key(for: right.name).hasPrefix(normalizedQuery)
                if leftStartsWithQuery != rightStartsWithQuery {
                    return leftStartsWithQuery
                }
                if left.score != right.score {
                    return left.score > right.score
                }
                return left.name.localizedCaseInsensitiveCompare(right.name) == .orderedAscending
            }
            .prefix(limit)
            .map(\.name)
    }

    private static func similarityScore(_ query: String, _ candidate: String) -> Double {
        if query == candidate { return 1 }
        if hasConflictingModifier(query, candidate) { return 0 }
        if candidate.hasPrefix(query) { return 0.96 }
        if candidate.contains(query) || query.contains(candidate) { return 0.88 }

        let queryTokens = Set(query.split(separator: " ").map(String.init))
        let candidateTokens = Set(candidate.split(separator: " ").map(String.init))
        let union = queryTokens.union(candidateTokens).count
        let tokenOverlap = union == 0
            ? 0
            : Double(queryTokens.intersection(candidateTokens).count) / Double(union)
        let longestNameLength = max(max(query.count, candidate.count), 1)
        let editSimilarity = 1 - Double(editDistance(query, candidate)) / Double(longestNameLength)
        return max(tokenOverlap, (tokenOverlap * 0.55) + (editSimilarity * 0.45))
    }

    private static func hasConflictingModifier(_ query: String, _ candidate: String) -> Bool {
        let groups = [
            ["incline", "decline", "flat"],
            ["abduction", "adduction"],
            ["chest", "reverse"],
            ["seated", "standing", "lying"]
        ]
        let queryTokens = Set(query.split(separator: " ").map(String.init))
        let candidateTokens = Set(candidate.split(separator: " ").map(String.init))

        if groups.contains(where: { group in
            let queryModifier = group.first(where: queryTokens.contains)
            let candidateModifier = group.first(where: candidateTokens.contains)
            return queryModifier != nil && candidateModifier != nil && queryModifier != candidateModifier
        }) {
            return true
        }

        let equipment = Set(["dumbbell", "barbell", "cable", "machine", "smith"])
        let queryEquipment = queryTokens.intersection(equipment)
        let candidateEquipment = candidateTokens.intersection(equipment)
        if !queryEquipment.isEmpty, !candidateEquipment.isEmpty, queryEquipment != candidateEquipment {
            return true
        }

        let queryWithoutEquipment = queryTokens.subtracting(equipment)
        let candidateWithoutEquipment = candidateTokens.subtracting(equipment)
        return queryWithoutEquipment == candidateWithoutEquipment
            && queryEquipment != candidateEquipment
    }

    private static func editDistance(_ left: String, _ right: String) -> Int {
        let leftCharacters = Array(left)
        let rightCharacters = Array(right)
        var previous = Array(0...rightCharacters.count)

        for (leftIndex, leftCharacter) in leftCharacters.enumerated() {
            var current = [leftIndex + 1]
            for (rightIndex, rightCharacter) in rightCharacters.enumerated() {
                current.append(min(
                    current[rightIndex] + 1,
                    previous[rightIndex + 1] + 1,
                    previous[rightIndex] + (leftCharacter == rightCharacter ? 0 : 1)
                ))
            }
            previous = current
        }

        return previous.last ?? 0
    }
}

struct ExerciseLibraryItem: Identifiable, Hashable {
    let category: String
    let exercise: Exercise

    var id: String { exercise.id }
}

enum ExerciseLibrary {
    static let items: [ExerciseLibraryItem] = {
        var results: [ExerciseLibraryItem] = []

        func add(_ category: String, _ names: [String]) {
            for name in names {
                let code = "LIB-" + name
                    .uppercased()
                    .replacingOccurrences(of: "[^A-Z0-9]+", with: "-", options: .regularExpression)
                    .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
                results.append(
                    ExerciseLibraryItem(
                        category: category,
                        exercise: Exercise(code: code, name: name, prescription: "3 sets")
                    )
                )
            }
        }

        add("Upper Body", [
            "Barbell Bench Press", "Dumbbell Bench Press", "Incline Dumbbell Press",
            "Push-Up", "Cable Chest Fly", "Dumbbell Chest Fly", "Pec Deck Chest Fly",
            "Overhead Press", "Seated Dumbbell Shoulder Press", "Standing Dumbbell Shoulder Press",
            "Lateral Raise", "Rear Delt Fly", "Dumbbell Reverse Fly", "Pull-Up", "Chin-Up", "Lat Pulldown",
            "Barbell Row", "One-Arm Dumbbell Row", "Seated Cable Row", "Face Pull",
            "Barbell Curl", "Dumbbell Curl", "Hammer Curl", "Cable Triceps Pushdown",
            "Overhead Triceps Extension", "Assisted Dip"
        ])
        add("Lower Body", [
            "Back Squat", "Front Squat", "Goblet Squat", "Leg Press", "Split Squat",
            "Bulgarian Split Squat", "Reverse Lunge", "Walking Lunge", "Step-Up",
            "Romanian Deadlift", "Conventional Deadlift", "Sumo Deadlift", "Hip Thrust",
            "Glute Bridge", "Leg Extension", "Seated Leg Curl", "Lying Leg Curl",
            "Standing Calf Raise", "Seated Calf Raise", "Cable Hip Abduction"
        ])
        add("Core", [
            "Dead Bug", "Bird Dog", "Front Plank", "Side Plank", "Pallof Press",
            "Cable Chop", "Hanging Knee Raise", "Lying Leg Raise", "Reverse Crunch", "Ab Wheel Rollout",
            "Farmer Carry", "Suitcase Carry"
        ])
        add("Bodyweight", [
            "Bodyweight Squat", "Bench Dip", "Inverted Row", "Bear Crawl",
            "Mountain Climber", "Jumping Jack", "Burpee", "Single-Leg Glute Bridge"
        ])

        results.append(contentsOf: mobilityItems)
        return results
    }()

    static let mobilityItems: [ExerciseLibraryItem] = [
        mobility("Mobility", "90/90 Hip Switch", "2 x 8 each side", [
            "Sit tall with both knees bent and feet wider than hip width.",
            "Rotate both knees together toward the opposite side without forcing the range.",
            "Keep the movement slow and use your hands for support if needed."
        ]),
        mobility("Mobility", "Cat-Cow", "2 x 8 slow reps", [
            "Start on hands and knees with your hands under shoulders and knees under hips.",
            "Slowly alternate between rounding and extending your spine.",
            "Move with your breath and stay within a comfortable range."
        ]),
        mobility("Mobility", "Open Book Thoracic Rotation", "2 x 8 each side", [
            "Lie on your side with hips and knees bent and arms extended in front.",
            "Rotate the top arm and chest open while keeping both knees together.",
            "Pause briefly, then return without forcing your shoulder toward the floor."
        ]),
        mobility("Mobility", "Half-Kneeling Ankle Rock", "2 x 10 each side", [
            "Set up half-kneeling with the front foot flat.",
            "Drive the front knee forward over the middle toes while keeping the heel down.",
            "Return smoothly and avoid letting the arch collapse."
        ]),
        mobility("Mobility", "World's Greatest Stretch", "2 x 5 each side", [
            "Step into a long lunge and place both hands inside the front foot.",
            "Rotate the inside arm toward the ceiling while keeping the back leg long.",
            "Return with control and switch sides."
        ]),
        mobility("Mobility", "Wall Shoulder Slide", "2 x 10", [
            "Stand with your back against a wall and ribs gently down.",
            "Slide your arms upward while keeping the movement comfortable.",
            "Lower slowly without shrugging."
        ]),
        mobility("Stretching", "Half-Kneeling Hip Flexor Stretch", "2 x 30 sec each side", [
            "Start half-kneeling and gently tuck your pelvis.",
            "Shift forward until you feel the front of the rear hip stretch.",
            "Keep your ribs stacked and avoid arching your lower back."
        ]),
        mobility("Stretching", "Doorway Pec Stretch", "2 x 30 sec each side", [
            "Place one forearm on a doorway with the elbow near shoulder height.",
            "Turn your chest away until you feel a gentle stretch across the chest.",
            "Keep the shoulder relaxed and stop if you feel pinching."
        ]),
        mobility("Stretching", "Supine Hamstring Stretch", "2 x 30 sec each side", [
            "Lie on your back and raise one leg with a strap behind the thigh or foot.",
            "Straighten the knee only as far as you can without lifting your hips.",
            "Breathe slowly and keep the opposite leg relaxed."
        ]),
        mobility("Stretching", "Figure-Four Glute Stretch", "2 x 30 sec each side", [
            "Lie on your back and cross one ankle over the opposite thigh.",
            "Draw the supporting leg toward you until the glute stretches.",
            "Keep your head and shoulders relaxed."
        ]),
        mobility("Stretching", "Child's Pose Lat Stretch", "2 x 30 sec", [
            "Sit your hips toward your heels with both hands reaching forward.",
            "Walk your hands slightly to one side to emphasize the opposite lat.",
            "Breathe into your back and avoid forcing the shoulder."
        ]),
        mobility("Stretching", "Standing Calf Stretch", "2 x 30 sec each side", [
            "Place both hands on a wall and step one foot back.",
            "Keep the rear heel down and the toes pointing forward.",
            "Lean forward gently until the calf stretches."
        ]),
        mobility("Foam Rolling", "Upper Back Foam Roll", "1 x 60–90 sec", [
            "Place the roller across your upper back and support your head with your hands.",
            "Lift your hips slightly and roll from the upper ribs to the shoulder blades.",
            "Move slowly and do not roll directly on your neck or lower back."
        ]),
        mobility("Foam Rolling", "Lat Foam Roll", "1 x 45–60 sec each side", [
            "Lie on your side with the roller below the armpit.",
            "Rotate slightly backward and roll along the outer upper back.",
            "Use your legs to control pressure and avoid numbness or tingling."
        ]),
        mobility("Foam Rolling", "Quad Foam Roll", "1 x 60 sec each side", [
            "Lie face down with the roller under one thigh.",
            "Use your arms and opposite leg to roll from below the hip to above the knee.",
            "Pause on tight areas without pressing directly on the kneecap."
        ]),
        mobility("Foam Rolling", "Glute Foam Roll", "1 x 60 sec each side", [
            "Sit on the roller and cross one ankle over the opposite knee.",
            "Lean toward the crossed-leg side and roll across the glute.",
            "Keep the pressure tolerable and your breathing relaxed."
        ]),
        mobility("Foam Rolling", "Calf Foam Roll", "1 x 60 sec each side", [
            "Place one calf on the roller and support yourself with your hands.",
            "Roll from above the ankle to below the knee.",
            "Rotate the leg slightly to reach the inner and outer calf."
        ]),
        mobility("Foam Rolling", "Adductor Foam Roll", "1 x 45–60 sec each side", [
            "Lie face down with one knee bent out to the side and the roller under the inner thigh.",
            "Roll from just above the knee toward the groin with controlled pressure.",
            "Avoid sensitive areas and stop if you feel sharp pain."
        ])
    ]

    static var names: [String] { items.map(\.exercise.name) }
    static var mobilityExercises: [Exercise] { mobilityItems.map(\.exercise) }
    static var categories: [String] {
        Array(Set(items.map(\.category))).sorted()
    }

    static func exercise(named name: String) -> Exercise? {
        items.first {
            $0.exercise.name.caseInsensitiveCompare(name.trimmingCharacters(in: .whitespacesAndNewlines)) == .orderedSame
        }?.exercise
    }

    static func category(for name: String) -> String? {
        items.first {
            $0.exercise.name.caseInsensitiveCompare(name.trimmingCharacters(in: .whitespacesAndNewlines)) == .orderedSame
        }?.category
    }

    private static func mobility(
        _ category: String,
        _ name: String,
        _ prescription: String,
        _ instructions: [String]
    ) -> ExerciseLibraryItem {
        let code = "MOB-" + name
            .uppercased()
            .replacingOccurrences(of: "[^A-Z0-9]+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return ExerciseLibraryItem(
            category: category,
            exercise: Exercise(
                code: code,
                name: name,
                prescription: prescription,
                instructions: instructions
            )
        )
    }
}

enum WorkoutEffortScale: String, CaseIterable, Codable, Identifiable {
    case rpe
    case rir

    var id: String { rawValue }
    var title: String { rawValue.uppercased() }

    var range: ClosedRange<Double> {
        switch self {
        case .rpe: return 1...10
        case .rir: return 0...10
        }
    }

    var rangeLabel: String {
        switch self {
        case .rpe: return "1–10"
        case .rir: return "0–10"
        }
    }

    var explanation: String {
        switch self {
        case .rpe:
            return "Rate of perceived exertion. 1 feels very easy; 10 is your maximum effort."
        case .rir:
            return "Reps in reserve. 0 means no more reps were possible; 10 means about ten remained."
        }
    }

    func validationMessage(for text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        guard let value = Double(trimmed), value.isFinite else {
            return "Enter a number from \(rangeLabel)."
        }
        guard range.contains(value) else {
            return "\(title) must be between \(rangeLabel)."
        }
        return nil
    }

    func formatted(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%g", value)
    }
}

enum WorkoutSetType: String, CaseIterable, Codable, Equatable, Hashable {
    case working
    case warmUp = "warm_up"
    case drop
    case failure
    case timed

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: value) ?? .working
    }

    var title: String {
        switch self {
        case .working: return "Working"
        case .warmUp: return "Warm-up"
        case .drop: return "Drop"
        case .failure: return "Failure"
        case .timed: return "Timed"
        }
    }

    var compactTitle: String {
        switch self {
        case .working: return "WORK"
        case .warmUp: return "WARM"
        case .drop: return "DROP"
        case .failure: return "FAIL"
        case .timed: return "TIME"
        }
    }

    var systemImage: String {
        switch self {
        case .working: return "dumbbell.fill"
        case .warmUp: return "flame"
        case .drop: return "arrow.down.right"
        case .failure: return "bolt.fill"
        case .timed: return "stopwatch.fill"
        }
    }

    /// Warm-up and timed efforts remain visible in history, but they should not
    /// inflate working-set volume or compete for weight/repetition records.
    var countsTowardWorkingMetrics: Bool {
        self != .warmUp && self != .timed
    }
}

struct WorkoutLogRecord: Decodable, Equatable {
    let sessionID: UUID?
    let setID: UUID?
    let exerciseCode: String
    let exerciseName: String
    let setNumber: Int
    let weightUsed: Double
    let reps: Double?
    let notes: String?
    let exerciseOrder: Int?
    let source: String
    let sourceVersion: Int
    let updatedAt: Date?
    let completedAt: Date?
    let effortScale: WorkoutEffortScale?
    let effortValue: Double?
    let setType: WorkoutSetType?
    let durationSeconds: Double?

    enum CodingKeys: String, CodingKey {
        case sessionID = "session_id"
        case setID = "set_id"
        case exerciseCode = "exercise_code"
        case exerciseName = "exercise_name"
        case setNumber = "set_number"
        case weightUsed = "weight_used"
        case reps
        case notes
        case exerciseOrder = "exercise_order"
        case source
        case sourceVersion = "source_version"
        case updatedAt = "updated_at"
        case completedAt = "completed_at"
        case effortScale = "effort_scale"
        case effortValue = "effort_value"
        case setType = "set_type"
        case durationSeconds = "duration_seconds"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        sessionID = try container.decodeIfPresent(UUID.self, forKey: .sessionID)
        setID = try container.decodeIfPresent(UUID.self, forKey: .setID)
        exerciseCode = try container.decode(String.self, forKey: .exerciseCode)
        exerciseName = try container.decode(String.self, forKey: .exerciseName)
        setNumber = try container.decode(Int.self, forKey: .setNumber)
        weightUsed = try container.decode(Double.self, forKey: .weightUsed)
        reps = try container.decodeIfPresent(Double.self, forKey: .reps)
        notes = try container.decodeIfPresent(String.self, forKey: .notes)
        exerciseOrder = try container.decodeIfPresent(Int.self, forKey: .exerciseOrder)
        source = try container.decodeIfPresent(String.self, forKey: .source) ?? "legacy"
        sourceVersion = try container.decodeIfPresent(Int.self, forKey: .sourceVersion) ?? 0
        updatedAt = ContinuityDateCoding.date(from: try container.decodeIfPresent(String.self, forKey: .updatedAt))
        completedAt = ContinuityDateCoding.date(from: try container.decodeIfPresent(String.self, forKey: .completedAt))
        effortScale = try container.decodeIfPresent(WorkoutEffortScale.self, forKey: .effortScale)
        effortValue = try container.decodeIfPresent(Double.self, forKey: .effortValue)
        setType = try container.decodeIfPresent(WorkoutSetType.self, forKey: .setType)
        durationSeconds = try container.decodeIfPresent(Double.self, forKey: .durationSeconds)
    }

    var key: WorkoutLogKey {
        WorkoutLogKey(exerciseCode: exerciseCode, setNumber: setNumber)
    }

    var effortLabel: String? {
        guard let effortScale, let effortValue else { return nil }
        return "\(effortScale.title) \(effortScale.formatted(effortValue))"
    }

    var resolvedSetType: WorkoutSetType {
        setType ?? (setNumber >= WorkoutSetNumber.warmUpBase ? .warmUp : .working)
    }
}

struct WorkoutHistoryRecord: Codable, Equatable {
    let sessionID: UUID?
    let setID: UUID?
    let entryDate: String
    let workoutTitle: String
    let exerciseCode: String
    let exerciseName: String
    let setNumber: Int
    let weightUsed: Double
    let reps: Double?
    let notes: String?
    let exerciseOrder: Int?
    let source: String
    let sourceVersion: Int
    let updatedAt: Date?
    let completedAt: Date?
    let effortScale: WorkoutEffortScale?
    let effortValue: Double?
    let setType: WorkoutSetType?
    let durationSeconds: Double?

    enum CodingKeys: String, CodingKey {
        case sessionID = "session_id"
        case setID = "set_id"
        case entryDate = "entry_date"
        case workoutTitle = "workout_title"
        case exerciseCode = "exercise_code"
        case exerciseName = "exercise_name"
        case setNumber = "set_number"
        case weightUsed = "weight_used"
        case reps
        case notes
        case exerciseOrder = "exercise_order"
        case source
        case sourceVersion = "source_version"
        case updatedAt = "updated_at"
        case completedAt = "completed_at"
        case effortScale = "effort_scale"
        case effortValue = "effort_value"
        case setType = "set_type"
        case durationSeconds = "duration_seconds"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        sessionID = try container.decodeIfPresent(UUID.self, forKey: .sessionID)
        setID = try container.decodeIfPresent(UUID.self, forKey: .setID)
        entryDate = try container.decode(String.self, forKey: .entryDate)
        workoutTitle = try container.decode(String.self, forKey: .workoutTitle)
        exerciseCode = try container.decode(String.self, forKey: .exerciseCode)
        exerciseName = try container.decode(String.self, forKey: .exerciseName)
        setNumber = try container.decode(Int.self, forKey: .setNumber)
        weightUsed = try container.decode(Double.self, forKey: .weightUsed)
        reps = try container.decodeIfPresent(Double.self, forKey: .reps)
        notes = try container.decodeIfPresent(String.self, forKey: .notes)
        exerciseOrder = try container.decodeIfPresent(Int.self, forKey: .exerciseOrder)
        source = try container.decodeIfPresent(String.self, forKey: .source) ?? "legacy"
        sourceVersion = try container.decodeIfPresent(Int.self, forKey: .sourceVersion) ?? 0
        updatedAt = ContinuityDateCoding.date(from: try container.decodeIfPresent(String.self, forKey: .updatedAt))
        completedAt = ContinuityDateCoding.date(from: try container.decodeIfPresent(String.self, forKey: .completedAt))
        effortScale = try container.decodeIfPresent(WorkoutEffortScale.self, forKey: .effortScale)
        effortValue = try container.decodeIfPresent(Double.self, forKey: .effortValue)
        setType = try container.decodeIfPresent(WorkoutSetType.self, forKey: .setType)
        durationSeconds = try container.decodeIfPresent(Double.self, forKey: .durationSeconds)
    }

    init(
        sessionID: UUID? = nil,
        setID: UUID? = nil,
        entryDate: String,
        workoutTitle: String,
        exerciseCode: String,
        exerciseName: String,
        exerciseOrder: Int? = nil,
        setNumber: Int,
        weightUsed: Double,
        reps: Double?,
        notes: String?,
        source: String = "legacy",
        sourceVersion: Int = 0,
        updatedAt: Date? = nil,
        completedAt: Date? = nil,
        effortScale: WorkoutEffortScale? = nil,
        effortValue: Double? = nil,
        setType: WorkoutSetType? = nil,
        durationSeconds: Double? = nil
    ) {
        self.sessionID = sessionID
        self.setID = setID
        self.entryDate = entryDate
        self.workoutTitle = workoutTitle
        self.exerciseCode = exerciseCode
        self.exerciseName = exerciseName
        self.exerciseOrder = exerciseOrder
        self.setNumber = setNumber
        self.weightUsed = weightUsed
        self.reps = reps
        self.notes = notes
        self.source = source
        self.sourceVersion = sourceVersion
        self.updatedAt = updatedAt
        self.completedAt = completedAt
        self.effortScale = effortScale
        self.effortValue = effortValue
        self.setType = setType
        self.durationSeconds = durationSeconds
    }

    var isCardio: Bool {
        exerciseCode.caseInsensitiveCompare("CARDIO") == .orderedSame
    }

    var isWarmUp: Bool {
        !isCardio && resolvedSetType == .warmUp
    }

    var warmUpOrdinal: Int? {
        WorkoutSetNumber.warmUpOrdinal(from: setNumber)
    }

    var cardioDetails: (calories: String, notes: String) {
        CardioLogCodec.parseNotes(notes)
    }

    var volume: Double {
        guard !isCardio, resolvedSetType.countsTowardWorkingMetrics else { return 0 }
        return weightUsed * (reps ?? 0)
    }

    var effortLabel: String? {
        guard let effortScale, let effortValue else { return nil }
        return "\(effortScale.title) \(effortScale.formatted(effortValue))"
    }

    var resolvedSetType: WorkoutSetType {
        setType ?? (setNumber >= WorkoutSetNumber.warmUpBase ? .warmUp : .working)
    }

    var countsTowardWorkingMetrics: Bool {
        !isCardio && resolvedSetType.countsTowardWorkingMetrics
    }
}

struct WorkoutHistorySession: Identifiable, Equatable {
    let sessionID: UUID?
    let entryDate: String
    let workoutTitle: String
    let records: [WorkoutHistoryRecord]

    var id: String { sessionID?.uuidString.lowercased() ?? "\(entryDate)|\(workoutTitle)" }

    init(entryDate: String, workoutTitle: String, records: [WorkoutHistoryRecord]) {
        self.entryDate = entryDate
        self.workoutTitle = workoutTitle
        self.records = records
        sessionID = records.compactMap(\.sessionID).first
    }

    var exercises: [WorkoutHistoryExercise] {
        let grouped = Dictionary(grouping: records) { record -> String in
            let nameKey = ExerciseNameIdentity.key(for: record.exerciseName)
            if !nameKey.isEmpty {
                return "name:\(nameKey)"
            }
            return "code:\(ExerciseNameIdentity.key(for: record.exerciseCode))"
        }

        return grouped.compactMap { _, records in
            guard let representative = records.min(by: { left, right in
                let leftOrder = left.exerciseOrder ?? Int.max
                let rightOrder = right.exerciseOrder ?? Int.max
                if leftOrder != rightOrder { return leftOrder < rightOrder }
                return left.setNumber < right.setNumber
            }) else { return nil }

            return WorkoutHistoryExercise(
                code: representative.exerciseCode,
                name: ExerciseNameIdentity.canonicalName(for: representative.exerciseName),
                order: records.compactMap(\.exerciseOrder).min(),
                records: records.sorted { left, right in
                    if left.isWarmUp != right.isWarmUp { return left.isWarmUp }
                    return left.setNumber < right.setNumber
                }
            )
        }
        .sorted { left, right in
            if let leftOrder = left.order, let rightOrder = right.order, leftOrder != rightOrder {
                return leftOrder < rightOrder
            }
            if left.order != nil, right.order == nil { return true }
            if left.order == nil, right.order != nil { return false }
            if left.code.localizedStandardCompare(right.code) == .orderedSame {
                return left.name.localizedCaseInsensitiveCompare(right.name) == .orderedAscending
            }
            return left.code.localizedStandardCompare(right.code) == .orderedAscending
        }
    }

    var totalSets: Int { records.filter { !$0.isWarmUp }.count }
    var strengthSetCount: Int { records.filter(\.countsTowardWorkingMetrics).count }
    var totalReps: Double { records.filter(\.countsTowardWorkingMetrics).reduce(0) { $0 + ($1.reps ?? 0) } }
    var totalVolume: Double { records.reduce(0) { $0 + $1.volume } }
    var totalTimedSeconds: Double {
        records
            .filter { !$0.isCardio && $0.resolvedSetType == .timed }
            .reduce(0) { $0 + ($1.durationSeconds ?? 0) }
    }
    var cardioRecords: [WorkoutHistoryRecord] { records.filter(\.isCardio) }
    var isCardioOnly: Bool { !records.isEmpty && records.allSatisfy(\.isCardio) }
    var totalCardioMinutes: Double { cardioRecords.reduce(0) { $0 + $1.weightUsed } }
    var totalCardioDistance: Double { cardioRecords.reduce(0) { $0 + ($1.reps ?? 0) } }
    var totalCardioCalories: Double {
        cardioRecords.reduce(0) { result, record in
            result + (Double(record.cardioDetails.calories) ?? 0)
        }
    }
}

struct WorkoutHistoryExercise: Identifiable, Equatable {
    struct Key: Hashable {
        let code: String
        let name: String
    }

    let code: String
    let name: String
    let order: Int?
    let records: [WorkoutHistoryRecord]

    var id: String { "\(code)|\(name)" }
    var workingRecords: [WorkoutHistoryRecord] { records.filter(\.countsTowardWorkingMetrics) }
    var warmUpRecords: [WorkoutHistoryRecord] { records.filter(\.isWarmUp) }
    var totalVolume: Double { workingRecords.reduce(0) { $0 + $1.volume } }
    var totalTimedSeconds: Double {
        records
            .filter { $0.resolvedSetType == .timed }
            .reduce(0) { $0 + ($1.durationSeconds ?? 0) }
    }
    var isCardio: Bool { code.caseInsensitiveCompare("CARDIO") == .orderedSame }
}

struct WorkoutExerciseCopySource: Equatable {
    let entryDate: String
    let workoutTitle: String
    let records: [WorkoutHistoryRecord]
}

enum WorkoutCopyHistory {
    static func previousExercise(
        for exercise: Exercise,
        workoutTitle: String,
        before entryDate: String,
        sessions: [WorkoutHistorySession]
    ) -> WorkoutExerciseCopySource? {
        let eligibleSessions = sessions
            .filter { $0.entryDate < entryDate }
            .sorted {
                if $0.entryDate == $1.entryDate {
                    return $0.workoutTitle.localizedCaseInsensitiveCompare($1.workoutTitle) == .orderedAscending
                }
                return $0.entryDate > $1.entryDate
            }
        let matchingWorkoutSessions = eligibleSessions.filter {
            normalized($0.workoutTitle) == normalized(workoutTitle)
        }

        return firstSource(for: exercise, in: matchingWorkoutSessions, allowCodeMatch: true)
            ?? firstSource(for: exercise, in: eligibleSessions, allowCodeMatch: false)
    }

    private static func firstSource(
        for exercise: Exercise,
        in sessions: [WorkoutHistorySession],
        allowCodeMatch: Bool
    ) -> WorkoutExerciseCopySource? {
        for session in sessions {
            let code = normalized(exercise.code)
            let match = session.exercises.first {
                normalized($0.name) == normalized(exercise.name)
            } ?? (allowCodeMatch && !code.isEmpty
                ? session.exercises.first { normalized($0.code) == code }
                : nil)
            guard let match else { continue }
            return WorkoutExerciseCopySource(
                entryDate: session.entryDate,
                workoutTitle: session.workoutTitle,
                records: match.records.sorted { $0.setNumber < $1.setNumber }
            )
        }
        return nil
    }

    private static func normalized(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}

struct WorkoutDraftCopyResult: Equatable {
    let drafts: [WorkoutSetDraft]
    let copiedDraftIDs: Set<UUID>
}

enum WorkoutDraftCopy {
    static func lastWorkout(
        _ source: WorkoutExerciseCopySource,
        to exercise: Exercise,
        in drafts: [WorkoutSetDraft]
    ) -> WorkoutDraftCopyResult {
        var updated = drafts
        var copiedIDs: Set<UUID> = []

        for record in source.records {
            if let index = updated.firstIndex(where: {
                matches($0, exercise) && $0.setNumber == record.setNumber
            }) {
                copy(record, into: &updated[index])
                copiedIDs.insert(updated[index].id)
            } else {
                var draft = WorkoutSetDraft(
                    exercise: exercise,
                    setNumber: record.setNumber,
                    isCompleted: false
                )
                copy(record, into: &draft)
                updated.append(draft)
                copiedIDs.insert(draft.id)
            }
        }
        return WorkoutDraftCopyResult(drafts: updated, copiedDraftIDs: copiedIDs)
    }

    static func previousSet(
        _ draftID: UUID,
        for exercise: Exercise,
        in drafts: [WorkoutSetDraft]
    ) -> WorkoutDraftCopyResult {
        let exerciseDrafts = drafts
            .filter { matches($0, exercise) }
            .sorted { $0.setNumber < $1.setNumber }
        guard let offset = exerciseDrafts.firstIndex(where: { $0.id == draftID }),
              offset > 0,
              let targetIndex = drafts.firstIndex(where: { $0.id == draftID }) else {
            return WorkoutDraftCopyResult(drafts: drafts, copiedDraftIDs: [])
        }
        let source = exerciseDrafts[offset - 1]
        guard source.containsEntry else {
            return WorkoutDraftCopyResult(drafts: drafts, copiedDraftIDs: [])
        }

        var updated = drafts
        updated[targetIndex].weight = source.weight
        updated[targetIndex].reps = source.reps
        updated[targetIndex].duration = source.duration
        updated[targetIndex].notes = source.notes
        updated[targetIndex].effortScale = source.effortScale
        updated[targetIndex].effort = source.effort
        updated[targetIndex].setType = source.setType
        updated[targetIndex].isCompleted = false
        return WorkoutDraftCopyResult(drafts: updated, copiedDraftIDs: [draftID])
    }

    private static func copy(_ record: WorkoutHistoryRecord, into draft: inout WorkoutSetDraft) {
        draft.weight = numberString(record.weightUsed)
        draft.reps = record.reps.map(numberString) ?? ""
        draft.duration = record.durationSeconds.map(numberString) ?? ""
        draft.notes = record.notes ?? ""
        draft.effortScale = record.effortScale
        draft.effort = record.effortValue.map(numberString) ?? ""
        draft.setType = record.resolvedSetType
        draft.isCompleted = false
    }

    private static func matches(_ draft: WorkoutSetDraft, _ exercise: Exercise) -> Bool {
        draft.exerciseCode == exercise.code && draft.exerciseName == exercise.name
    }

    private static func numberString(_ value: Double) -> String {
        value.rounded() == value ? String(Int(value)) : String(format: "%g", value)
    }
}

struct PreviousWorkoutResult: Equatable {
    let entryDate: String
    let workoutTitle: String
    let exerciseName: String
    let setNumber: Int
    let firstValue: Double
    let secondValue: Double?
    let calories: Double?
    let effortScale: WorkoutEffortScale?
    let effortValue: Double?

    init(record: WorkoutHistoryRecord) {
        entryDate = record.entryDate
        workoutTitle = record.workoutTitle
        exerciseName = record.exerciseName
        setNumber = record.setNumber
        firstValue = record.weightUsed
        secondValue = record.reps
        calories = Double(record.cardioDetails.calories)
        effortScale = record.effortScale
        effortValue = record.effortValue
    }

    var effortLabel: String? {
        guard let effortScale, let effortValue else { return nil }
        return "\(effortScale.title) \(effortScale.formatted(effortValue))"
    }
}

enum PreviousWorkoutResults {
    static func sets(
        for exercise: Exercise,
        before entryDate: String,
        in sessions: [WorkoutHistorySession]
    ) -> [Int: PreviousWorkoutResult] {
        let exerciseName = normalized(exercise.name)
        let exerciseCode = normalized(exercise.code)
        let matchingSessions = sessions.lazy.filter { session in
            session.entryDate < entryDate
                && session.records.contains {
                    matches($0, exerciseName: exerciseName, exerciseCode: exerciseCode)
                }
        }
        guard let previousSession = matchingSessions.max(by: olderFirst) else {
            return [:]
        }

        return Dictionary(
            previousSession.records
                .filter {
                    matches($0, exerciseName: exerciseName, exerciseCode: exerciseCode)
                }
                .map { ($0.setNumber, PreviousWorkoutResult(record: $0)) },
            uniquingKeysWith: { first, _ in first }
        )
    }

    static func cardio(
        named cardioType: String,
        before entryDate: String,
        in sessions: [WorkoutHistorySession]
    ) -> PreviousWorkoutResult? {
        let normalizedType = normalized(cardioType)
        let acceptsAnyCardio = normalizedType.isEmpty || normalizedType == "cardio"

        let matchingSessions = sessions.lazy.filter { session in
            session.entryDate < entryDate
                && session.records.contains { record in
                    record.isCardio && (acceptsAnyCardio || normalized(record.exerciseName) == normalizedType)
                }
        }
        guard let previousSession = matchingSessions.max(by: olderFirst),
              let record = previousSession.records.first(where: { record in
                  record.isCardio && (acceptsAnyCardio || normalized(record.exerciseName) == normalizedType)
              }) else {
            return nil
        }
        return PreviousWorkoutResult(record: record)
    }

    private static func matches(
        _ record: WorkoutHistoryRecord,
        exerciseName: String,
        exerciseCode: String
    ) -> Bool {
        if !exerciseName.isEmpty {
            return normalized(record.exerciseName) == exerciseName
        }

        return !exerciseCode.isEmpty && normalized(record.exerciseCode) == exerciseCode
    }

    private static func normalized(_ value: String) -> String {
        value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
    }

    private static func olderFirst(_ left: WorkoutHistorySession, _ right: WorkoutHistorySession) -> Bool {
        if left.entryDate == right.entryDate {
            return left.workoutTitle.localizedCaseInsensitiveCompare(right.workoutTitle) == .orderedDescending
        }
        return left.entryDate < right.entryDate
    }
}

struct WorkoutLogKey: Hashable {
    let exerciseCode: String
    let setNumber: Int
}

struct WorkoutLogPayload: Encodable {
    let sessionID: UUID
    let setID: UUID
    let workoutTemplateID: UUID?
    let clientEmail: String
    let entryDate: String
    let workoutTitle: String
    let exerciseCode: String
    let exerciseName: String
    let exerciseOrder: Int
    let setNumber: Int
    let weightUsed: Double
    let reps: Double?
    let notes: String?
    let source: String
    let sourceVersion: Int
    let clientUpdatedAt: String
    let completedAt: String?
    let effortScale: WorkoutEffortScale?
    let effortValue: Double?
    let setType: WorkoutSetType
    let durationSeconds: Double?

    enum CodingKeys: String, CodingKey {
        case sessionID = "session_id"
        case setID = "set_id"
        case workoutTemplateID = "workout_template_id"
        case clientEmail = "client_email"
        case entryDate = "entry_date"
        case workoutTitle = "workout_title"
        case exerciseCode = "exercise_code"
        case exerciseName = "exercise_name"
        case exerciseOrder = "exercise_order"
        case setNumber = "set_number"
        case weightUsed = "weight_used"
        case reps
        case notes
        case source
        case sourceVersion = "source_version"
        case clientUpdatedAt = "client_updated_at"
        case completedAt = "completed_at"
        case effortScale = "effort_scale"
        case effortValue = "effort_value"
        case setType = "set_type"
        case durationSeconds = "duration_seconds"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(sessionID, forKey: .sessionID)
        try container.encode(setID, forKey: .setID)
        try container.encodeIfPresent(workoutTemplateID, forKey: .workoutTemplateID)
        try container.encode(clientEmail, forKey: .clientEmail)
        try container.encode(entryDate, forKey: .entryDate)
        try container.encode(workoutTitle, forKey: .workoutTitle)
        try container.encode(exerciseCode, forKey: .exerciseCode)
        try container.encode(exerciseName, forKey: .exerciseName)
        try container.encode(exerciseOrder, forKey: .exerciseOrder)
        try container.encode(setNumber, forKey: .setNumber)
        try container.encode(weightUsed, forKey: .weightUsed)
        try container.encodeIfPresent(reps, forKey: .reps)
        try container.encodeIfPresent(notes, forKey: .notes)
        try container.encode(source, forKey: .source)
        try container.encode(sourceVersion, forKey: .sourceVersion)
        try container.encode(clientUpdatedAt, forKey: .clientUpdatedAt)
        try container.encodeIfPresent(completedAt, forKey: .completedAt)
        try container.encode(setType, forKey: .setType)
        try container.encodeIfPresent(durationSeconds, forKey: .durationSeconds)

        if let effortScale, let effortValue {
            try container.encode(effortScale, forKey: .effortScale)
            try container.encode(effortValue, forKey: .effortValue)
        } else {
            // Explicit nulls clear a previously saved optional effort rating.
            try container.encodeNil(forKey: .effortScale)
            try container.encodeNil(forKey: .effortValue)
        }
    }
}

struct LegacyWorkoutLogPayload: Encodable {
    let clientEmail: String
    let entryDate: String
    let workoutTitle: String
    let exerciseCode: String
    let exerciseName: String
    let setNumber: Int
    let weightUsed: Double
    let reps: Double?
    let notes: String?

    init(_ payload: WorkoutLogPayload) {
        clientEmail = payload.clientEmail
        entryDate = payload.entryDate
        workoutTitle = payload.workoutTitle
        exerciseCode = payload.exerciseCode
        exerciseName = payload.exerciseName
        setNumber = payload.setNumber
        weightUsed = payload.weightUsed
        reps = payload.reps
        notes = payload.notes
    }

    enum CodingKeys: String, CodingKey {
        case clientEmail = "client_email"
        case entryDate = "entry_date"
        case workoutTitle = "workout_title"
        case exerciseCode = "exercise_code"
        case exerciseName = "exercise_name"
        case setNumber = "set_number"
        case weightUsed = "weight_used"
        case reps
        case notes
    }
}

enum WorkoutSetNumber {
    // Existing storage identifies a set by exercise + integer set number. A
    // high reserved range adds a backward-compatible type without live DDL or
    // collisions with the logger's supported 1...12 working-set range.
    static let warmUpBase = 1_000

    static func warmUp(_ ordinal: Int) -> Int {
        warmUpBase + max(ordinal, 1)
    }

    static func warmUpOrdinal(from setNumber: Int) -> Int? {
        guard setNumber >= warmUpBase else { return nil }
        return setNumber - warmUpBase
    }
}

struct WorkoutSetDraft: Identifiable, Equatable {
    let id: UUID
    let exerciseCode: String
    var exerciseName: String
    var setNumber: Int
    var weight: String
    var reps: String
    var duration: String
    var notes: String
    var effortScale: WorkoutEffortScale?
    var effort: String
    var isCompleted: Bool
    var setType: WorkoutSetType

    init(
        id: UUID = UUID(),
        exercise: Exercise,
        setNumber: Int,
        weight: String = "",
        reps: String = "",
        duration: String = "",
        notes: String = "",
        effortScale: WorkoutEffortScale? = nil,
        effort: String = "",
        isCompleted: Bool = false,
        setType: WorkoutSetType = .working
    ) {
        self.id = id
        exerciseCode = exercise.code
        exerciseName = exercise.name
        self.setNumber = setNumber
        self.weight = weight
        self.reps = reps
        self.duration = duration
        self.notes = notes
        self.effortScale = effortScale
        self.effort = effort
        self.isCompleted = isCompleted
        self.setType = setNumber >= WorkoutSetNumber.warmUpBase ? .warmUp : setType
    }

    var containsEntry: Bool {
        !weight.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !reps.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !duration.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !effort.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var effortValidationMessage: String? {
        let trimmed = effort.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        guard let effortScale else { return "Choose RPE or RIR for this effort rating." }
        return effortScale.validationMessage(for: trimmed)
    }

    var validatedEffortValue: Double? {
        guard effortValidationMessage == nil else { return nil }
        return Double(effort.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    var isWarmUp: Bool {
        setType == .warmUp
    }

    var warmUpOrdinal: Int? {
        WorkoutSetNumber.warmUpOrdinal(from: setNumber)
    }


    var logKey: WorkoutLogKey {
        WorkoutLogKey(exerciseCode: exerciseCode, setNumber: setNumber)
    }

    var weightValue: Double {
        Double(weight) ?? 0
    }

    var repsValue: Double {
        Double(reps) ?? 0
    }

    var durationValue: Double {
        Double(duration) ?? 0
    }

    var volume: Double {
        guard setType.countsTowardWorkingMetrics else { return 0 }
        return weightValue * repsValue
    }
}

extension ClientProgram {
    static let preview = ClientProgram(
        id: UUID(),
        clientEmail: "alex@example.com",
        clientName: "Alex Morgan",
        initials: "AM",
        programTitle: "Strength Foundations",
        programSummary: "Build consistent strength with three focused sessions each week.",
        sessionCountUsed: 4,
        sessionCountTotal: 12,
        fitnessGoal: "Build strength and move better",
        focusTarget: "Three quality sessions each week",
        coachNoteTitle: "This week",
        coachNoteBody: "Keep two reps in reserve and prioritize clean movement.",
        nutritionPlan: NutritionPlan(
            calories: "2,725 cal",
            protein: "155g",
            carbs: "360g",
            fat: "75g",
            guide: "Starting target for building muscle and leaning out. Review with Benjamin and adjust based on energy, hunger, performance, and progress.",
            source: "client_calculator",
            goal: "recomposition",
            sex: "male",
            age: "42",
            height: "5'6\"",
            currentWeight: "154",
            workoutsPerWeek: "5",
            dailyMovement: "active_job",
            trainingIntensity: "moderate",
            activityFactor: "1.80",
            maintenanceCalories: "2775",
            updatedAt: "2026-08-21T15:00:00Z"
        ),
        workouts: [
            Workout(
                title: "Lower Body Strength",
                focus: "Quads + glutes",
                format: "superset",
                exercises: [
                    Exercise(code: "A1", name: "Goblet Squat", prescription: "3 × 10", rest: "60 sec"),
                    Exercise(code: "A2", name: "Romanian Deadlift", prescription: "3 × 8", rest: "60 sec")
                ]
            ),
            Workout(
                title: "Upper Body Strength",
                focus: "Back + shoulders",
                exercises: [
                    Exercise(code: "A1", name: "One-arm Row", prescription: "3 × 10 each", rest: "60 sec")
                ]
            )
        ],
        updatedAt: "2026-08-21T15:00:00Z",
        syncSource: "web_app",
        sourceVersion: 1
    )
}
