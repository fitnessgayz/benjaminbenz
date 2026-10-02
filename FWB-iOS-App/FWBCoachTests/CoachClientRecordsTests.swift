import XCTest
@testable import FWBCoach

final class CoachClientRecordsTests: XCTestCase {
    func testBlankInputsPreserveExistingSameDateMeasurementsAndNote() throws {
        let saved = measurement(email: "client@example.com")
        let result = try CoachClientRecords.progressPayload(email: "client@example.com", date: "2026-09-25",
            values: ["bodyweight": " ", "waist": ""], note: "  ", existingRows: [saved])
        XCTAssertEqual(result["bodyweight"], .number(150))
        XCTAssertEqual(result["bodyfat"], .number(20))
        XCTAssertEqual(result["lean_mass"], .number(120))
        XCTAssertEqual(result["muscle_mass"], .number(75))
        XCTAssertEqual(result.string("goal_note"), "Keep building strength")
        XCTAssertEqual(result.object("measurements")["waist"], .number(30))
        XCTAssertEqual(result.object("measurements")["custom_measurement"], .object(["value": .number(4), "unit": .string("cm")]))
    }

    func testPartialUpdateChangesOnlyEnteredFields() throws {
        let result = try CoachClientRecords.progressPayload(email: "client@example.com", date: "2026-09-25",
            values: ["bodyweight": " 151.5 ", "waist": "29.5"], note: " New goal ",
            existingRows: [measurement(email: "client@example.com")])
        XCTAssertEqual(result["bodyweight"], .number(151.5))
        XCTAssertEqual(result["bodyfat"], .number(20))
        XCTAssertEqual(result.object("measurements")["waist"], .number(29.5))
        XCTAssertEqual(result.object("measurements")["chest"], .number(38))
        XCTAssertEqual(result.string("goal_note"), "New goal")
    }

    func testSameDateRowsFromOtherClientsNeverSupplySavedValues() throws {
        let other = measurement(email: "other@example.com")
        let result = try CoachClientRecords.progressPayload(email: "client@example.com", date: "2026-09-25",
            values: ["bodyweight": "160"], note: "", existingRows: [other])
        XCTAssertEqual(result["bodyweight"], .number(160))
        XCTAssertEqual(result["bodyfat"], .null)
        XCTAssertEqual(result["lean_mass"], .null)
        XCTAssertEqual(result.string("goal_note"), "")
        XCTAssertEqual(result.object("measurements")["waist"], .null)
        XCTAssertNil(result.object("measurements")["custom_measurement"])
    }

    func testClientScopeNormalizesEmailAndRejectsUnscopedRows() {
        let own = measurement(email: " Client@Example.com ")
        let other = measurement(email: "other@example.com")
        XCTAssertEqual(CoachClientRecords.rows([other, own, ["entry_date": .string("2026-09-25")]], email: "CLIENT@example.com"), [own])
        XCTAssertTrue(CoachClientRecords.rows([own], email: " ").isEmpty)
    }

    func testOwnRowWinsEvenWhenAnotherClientHasSameDateFirst() throws {
        var own = measurement(email: " CLIENT@example.com ")
        own["bodyweight"] = .number(180)
        let result = try CoachClientRecords.progressPayload(email: "client@example.com", date: "2026-09-25",
            values: [:], note: "", existingRows: [measurement(email: "other@example.com"), own])
        XCTAssertEqual(result["bodyweight"], .number(180))
        XCTAssertEqual(result.string("client_email"), "client@example.com")
    }

    func testNewDateDoesNotReusePriorDatesMeasurements() throws {
        let result = try CoachClientRecords.progressPayload(email: "client@example.com", date: "2026-09-26",
            values: [:], note: "", existingRows: [measurement(email: "client@example.com")])
        XCTAssertEqual(result["bodyweight"], .null)
        XCTAssertEqual(result.string("goal_note"), "")
        XCTAssertEqual(result.object("measurements")["waist"], .null)
    }

    func testLegacyArmAndThighAliasesArePreservedAndDisplayed() throws {
        var own = measurement(email: "client@example.com")
        own["measurements"] = .object(["arms": .number(13), "arm": .null, "thighs": .number(22), "legacy_extra": .string("keep")])
        let displayed = CoachClientRecords.measurements(own)
        XCTAssertEqual(displayed["arm"], .number(13))
        XCTAssertEqual(displayed["thigh"], .number(22))
        let result = try CoachClientRecords.progressPayload(email: "client@example.com", date: "2026-09-25",
            values: [:], note: "", existingRows: [own])
        let tape = result.object("measurements")
        XCTAssertEqual(tape["arm"], .number(13))
        XCTAssertEqual(tape["arms"], .number(13))
        XCTAssertEqual(tape["thigh"], .number(22))
        XCTAssertEqual(tape["thighs"], .number(22))
        XCTAssertEqual(tape["legacy_extra"], .string("keep"))
    }

    func testCanonicalMeasurementsTakePrecedenceOverAliases() {
        let row: CoachJSONObject = ["measurements": .object(["arm": .number(14), "arms": .number(12), "thigh": .number(24), "thighs": .number(21)])]
        XCTAssertEqual(CoachClientRecords.measurements(row)["arm"], .number(14))
        XCTAssertEqual(CoachClientRecords.measurements(row)["thigh"], .number(24))
    }

    func testInvalidNumbersAreRejectedBeforeSaving() {
        for value in ["0", "-1", "NaN", "infinity", "invalid"] {
            XCTAssertThrowsError(try CoachClientRecords.progressPayload(email: "client@example.com", date: "2026-09-25",
                values: ["bodyweight": value], note: "", existingRows: []))
        }
        XCTAssertThrowsError(try CoachClientRecords.progressPayload(email: "client@example.com", date: "2026-09-25",
            values: ["bodyfat": "101"], note: "", existingRows: []))
    }

    private func measurement(email: String) -> CoachJSONObject {
        ["client_email": .string(email), "entry_date": .string("2026-09-25"),
         "bodyweight": .number(150), "bodyfat": .number(20), "lean_mass": .number(120), "muscle_mass": .number(75),
         "goal_note": .string("Keep building strength"),
         "measurements": .object(["chest": .number(38), "waist": .number(30), "hips": .number(39), "arm": .number(13), "thigh": .number(22),
                                   "custom_measurement": .object(["value": .number(4), "unit": .string("cm")])])]
    }
}
