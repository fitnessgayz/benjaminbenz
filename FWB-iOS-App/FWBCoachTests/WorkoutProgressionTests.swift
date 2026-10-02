import XCTest
@testable import FWBCoach

final class WorkoutProgressionTests: XCTestCase {
    private struct Fixtures: Decodable {
        let version: Int
        let cases: [Fixture]
    }
    private struct Fixture: Decodable {
        let name: String
        let input: Input
        let expected: WorkoutProgressionRecommendation
    }
    private struct Input: Decodable {
        let config: WorkoutProgressionConfig
        let history: [WorkoutProgressionHistoryInput]
        let now: String
        let excludedSessionId: String?
        let historyComplete: Bool?
    }
    // This is the same JSON executed by tests/workout-progression.test.js in the web repo.
    private func fixtures() throws -> Fixtures {
        let path = try XCTUnwrap(Bundle(for: WorkoutProgressionTests.self)
            .url(forResource: "workout-progression", withExtension: "json"))
        return try JSONDecoder().decode(Fixtures.self, from: Data(contentsOf: path))
    }
    func testSharedWebIOSProgressionFixtures() throws {
        let fixtures = try fixtures()
        XCTAssertEqual(fixtures.version, 1)
        XCTAssertGreaterThanOrEqual(fixtures.cases.count, 40)
        for fixture in fixtures.cases {
            let now = try XCTUnwrap(ISO8601DateFormatter().date(from: fixture.input.now))
            for rows in [fixture.input.history, Array(fixture.input.history.reversed())] {
                let result = WorkoutProgression.recommend(config: fixture.input.config, inputs: Array(rows), now: now,
                    excludedSessionID: fixture.input.excludedSessionId, historyComplete: fixture.input.historyComplete ?? true)
                XCTAssertEqual(result, fixture.expected, fixture.name)
            }
        }
    }
    func testDefaultTargetsRequireUnambiguousStrengthReps() throws {
        let expected = try XCTUnwrap(fixtures().cases.first?.input.config)
        for prescription in ["8–12 reps x 3 sets", "8–12 x 3 sets", "3 × 8–12", "3 sets of 8-12 reps", "8-12 reps x 3 sets per side"] {
            XCTAssertEqual(WorkoutProgression.defaultConfig(name: "Dumbbell Shoulder Press", prescription: prescription), expected)
        }
        for prescription in ["3 sets", "3 x 30 sec", "AMRAP", "3 × 8 at 40 lb", "4 rounds of 30 sec/side", "8 / 10 / 12", "", "12-8 reps x 3 sets"] {
            XCTAssertNil(WorkoutProgression.defaultConfig(name: "Press", prescription: prescription), prescription)
        }
        for name in ["Push-up", "Assisted Pull-Up", "Front Plank", "Glute Bridge", "Mobility Press"] {
            XCTAssertNil(WorkoutProgression.defaultConfig(name: name, prescription: "3 x 8-12"), name)
        }
        XCTAssertNotNil(WorkoutProgression.defaultConfig(name: "Weighted Pull-Up", prescription: "3 x 8-12"))
        XCTAssertEqual(WorkoutProgression.defaultConfig(name: "Press", prescription: "8-12 reps", plannedSets: 4)?.plannedSets, 4)
    }
    func testConfigRoundTripAndRequiredSessionsDefault() throws {
        let original = try XCTUnwrap(fixtures().cases.first?.input.config)
        let data = try JSONEncoder().encode(original)
        XCTAssertEqual(try JSONDecoder().decode(WorkoutProgressionConfig.self, from: data), original)
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        json.removeValue(forKey: "required_sessions")
        XCTAssertEqual(try JSONDecoder().decode(WorkoutProgressionConfig.self,
            from: JSONSerialization.data(withJSONObject: json)).requiredSessions, 2)
    }
    func testExactExerciseIdentityPreservesEquipmentAndPunctuation() {
        XCTAssertEqual(WorkoutProgression.exerciseKey("  Seated   Dumbbell Press\n"), "name:seated dumbbell press")
        XCTAssertNotEqual(WorkoutProgression.exerciseKey("Dumbbell press"), WorkoutProgression.exerciseKey("Barbell press"))
        XCTAssertNotEqual(WorkoutProgression.exerciseKey("Press (machine A)"), WorkoutProgression.exerciseKey("Press (machine B)"))
    }
    func testExplicitCoachConfigIsPreserved() throws {
        var configured = try XCTUnwrap(fixtures().cases.first?.input.config)
        configured.enabled = false; configured.unit = "kg"; configured.increment = 1.25
        let configJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(configured))
        let data = try JSONSerialization.data(withJSONObject: ["name": "Dumbbell Shoulder Press", "prescription": "3 x 8-12", "progression": configJSON])
        let exercise = try JSONDecoder().decode(Exercise.self, from: data)
        XCTAssertEqual(WorkoutProgression.defaultConfig(for: exercise), configured)
        var changed = configured; changed.plannedSets = 4
        XCTAssertEqual(WorkoutProgression.defaultConfig(for: exercise, plannedSets: 4), changed)
        let malformedData = try JSONSerialization.data(withJSONObject: ["name": "Dumbbell Shoulder Press", "prescription": "3 x 8-12", "progression": ["enabled": false]])
        let malformed = try JSONDecoder().decode(Exercise.self, from: malformedData)
        XCTAssertNil(WorkoutProgression.defaultConfig(for: malformed))
    }
    func testInvalidConfigFailsClosed() throws {
        let original = try XCTUnwrap(fixtures().cases.first?.input.config)
        var changed = original; changed.repMin = 60
        XCTAssertNil(WorkoutProgression.normalizedConfig(changed))
        changed = original; changed.increment = .infinity
        XCTAssertNil(WorkoutProgression.normalizedConfig(changed))
        changed = original; changed.targetRIR = .nan
        XCTAssertNil(WorkoutProgression.normalizedConfig(changed))
        changed = original; changed.requiredSessions = 1
        XCTAssertNil(WorkoutProgression.normalizedConfig(changed))
        changed = original; changed.plannedSets = 21
        XCTAssertNil(WorkoutProgression.normalizedConfig(changed))
    }
}
