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

struct Workout: Decodable, Identifiable, Equatable, Hashable {
    let id: UUID
    let title: String
    let focus: String
    let format: String
    let exercises: [Exercise]

    enum CodingKeys: String, CodingKey {
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
        id = UUID()
        title = try container.decodeIfPresent(String.self, forKey: .title) ?? "Workout"
        focus = try container.decodeIfPresent(String.self, forKey: .focus) ?? ""
        format = try container.decodeIfPresent(String.self, forKey: .format) ?? ""
        exercises = try container.decodeIfPresent([Exercise].self, forKey: .exercises) ?? []
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
            let key = trimmed.lowercased()
            guard !trimmed.isEmpty, namesByKey[key] == nil else { continue }
            namesByKey[key] = trimmed
        }

        return namesByKey.values.sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    static func matches(query: String, within names: [String], limit: Int = 6) -> [String] {
        let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedQuery = trimmedQuery.lowercased()

        return names
            .filter { candidate in
                let normalizedCandidate = candidate.lowercased()
                guard normalizedCandidate != normalizedQuery else { return false }
                return normalizedQuery.isEmpty || normalizedCandidate.contains(normalizedQuery)
            }
            .sorted { left, right in
                let leftStartsWithQuery = left.lowercased().hasPrefix(normalizedQuery)
                let rightStartsWithQuery = right.lowercased().hasPrefix(normalizedQuery)
                if leftStartsWithQuery != rightStartsWithQuery {
                    return leftStartsWithQuery
                }
                return left.localizedCaseInsensitiveCompare(right) == .orderedAscending
            }
            .prefix(limit)
            .map { $0 }
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
            "Push-Up", "Cable Chest Fly", "Overhead Press", "Dumbbell Shoulder Press",
            "Lateral Raise", "Rear Delt Fly", "Pull-Up", "Chin-Up", "Lat Pulldown",
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
            "Cable Chop", "Hanging Knee Raise", "Reverse Crunch", "Ab Wheel Rollout",
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

struct WorkoutLogRecord: Decodable, Equatable {
    let exerciseCode: String
    let exerciseName: String
    let setNumber: Int
    let weightUsed: Double
    let reps: Double?
    let notes: String?

    enum CodingKeys: String, CodingKey {
        case exerciseCode = "exercise_code"
        case exerciseName = "exercise_name"
        case setNumber = "set_number"
        case weightUsed = "weight_used"
        case reps
        case notes
    }

    var key: WorkoutLogKey {
        WorkoutLogKey(exerciseCode: exerciseCode, setNumber: setNumber)
    }
}

struct WorkoutHistoryRecord: Decodable, Equatable {
    let entryDate: String
    let workoutTitle: String
    let exerciseCode: String
    let exerciseName: String
    let setNumber: Int
    let weightUsed: Double
    let reps: Double?
    let notes: String?

    enum CodingKeys: String, CodingKey {
        case entryDate = "entry_date"
        case workoutTitle = "workout_title"
        case exerciseCode = "exercise_code"
        case exerciseName = "exercise_name"
        case setNumber = "set_number"
        case weightUsed = "weight_used"
        case reps
        case notes
    }

    var isCardio: Bool {
        exerciseCode.caseInsensitiveCompare("CARDIO") == .orderedSame
    }

    var cardioDetails: (calories: String, notes: String) {
        CardioLogCodec.parseNotes(notes)
    }

    var volume: Double {
        guard !isCardio else { return 0 }
        return weightUsed * (reps ?? 0)
    }
}

struct WorkoutHistorySession: Identifiable, Equatable {
    let entryDate: String
    let workoutTitle: String
    let records: [WorkoutHistoryRecord]

    var id: String { "\(entryDate)|\(workoutTitle)" }

    var exercises: [WorkoutHistoryExercise] {
        let grouped = Dictionary(grouping: records) { record in
            WorkoutHistoryExercise.Key(code: record.exerciseCode, name: record.exerciseName)
        }

        return grouped.map { key, records in
            WorkoutHistoryExercise(
                code: key.code,
                name: key.name,
                records: records.sorted { $0.setNumber < $1.setNumber }
            )
        }
        .sorted { left, right in
            if left.code.localizedStandardCompare(right.code) == .orderedSame {
                return left.name.localizedCaseInsensitiveCompare(right.name) == .orderedAscending
            }
            return left.code.localizedStandardCompare(right.code) == .orderedAscending
        }
    }

    var totalSets: Int { records.count }
    var strengthSetCount: Int { records.filter { !$0.isCardio }.count }
    var totalReps: Double { records.filter { !$0.isCardio }.reduce(0) { $0 + ($1.reps ?? 0) } }
    var totalVolume: Double { records.reduce(0) { $0 + $1.volume } }
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
    let records: [WorkoutHistoryRecord]

    var id: String { "\(code)|\(name)" }
    var totalVolume: Double { records.reduce(0) { $0 + $1.volume } }
    var isCardio: Bool { code.caseInsensitiveCompare("CARDIO") == .orderedSame }
}

struct WorkoutLogKey: Hashable {
    let exerciseCode: String
    let setNumber: Int
}

struct WorkoutLogPayload: Encodable {
    let clientEmail: String
    let entryDate: String
    let workoutTitle: String
    let exerciseCode: String
    let exerciseName: String
    let setNumber: Int
    let weightUsed: Double
    let reps: Double?
    let notes: String?

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

struct WorkoutSetDraft: Identifiable, Equatable {
    let id: UUID
    let exerciseCode: String
    var exerciseName: String
    var setNumber: Int
    var weight: String
    var reps: String
    var notes: String
    var isCompleted: Bool

    init(
        exercise: Exercise,
        setNumber: Int,
        weight: String = "",
        reps: String = "",
        notes: String = "",
        isCompleted: Bool = false
    ) {
        id = UUID()
        exerciseCode = exercise.code
        exerciseName = exercise.name
        self.setNumber = setNumber
        self.weight = weight
        self.reps = reps
        self.notes = notes
        self.isCompleted = isCompleted
    }

    var containsEntry: Bool {
        !weight.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !reps.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
            !notes.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
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

    var volume: Double {
        weightValue * repsValue
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
        ]
    )
}
