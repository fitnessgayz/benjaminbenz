import XCTest
@testable import FWBCoach

final class NutritionCalculatorTests: XCTestCase {
    func testParsesStandardFeetAndInchesMarks() {
        XCTAssertEqual(NutritionCalculator.parseHeightInches("5'11\""), 71)
        XCTAssertEqual(NutritionCalculator.parseHeightInches("5’11”"), 71)
        XCTAssertEqual(NutritionCalculator.parseHeightInches("5‘11“"), 71)
        XCTAssertEqual(NutritionCalculator.parseHeightInches("5′11″"), 71)
    }

    func testParsesWordsAndCommonWhitespace() {
        XCTAssertEqual(NutritionCalculator.parseHeightInches(" 5 feet 11 inches "), 71)
        XCTAssertEqual(NutritionCalculator.parseHeightInches("5 ft\t11 in"), 71)
        XCTAssertEqual(NutritionCalculator.parseHeightInches("5\u{00A0}'\u{00A0}11\u{00A0}\""), 71)
        XCTAssertEqual(NutritionCalculator.parseHeightInches("5 11"), 71)
    }

    func testParsesTotalInchesAndDecimalFeet() {
        XCTAssertEqual(NutritionCalculator.parseHeightInches("71"), 71)
        XCTAssertEqual(NutritionCalculator.parseHeightInches("71 inches"), 71)
        XCTAssertEqual(NutritionCalculator.parseHeightInches("5.5"), 66)
    }

    func testRejectsMalformedComponentsInsteadOfStrippingThem() {
        XCTAssertNil(NutritionCalculator.parseHeightInches("5'12\""))
        XCTAssertNil(NutritionCalculator.parseHeightInches("five eleven"))
        XCTAssertNil(NutritionCalculator.parseHeightInches("height 71"))
        XCTAssertNil(NutritionCalculator.parseHeightInches("5'11\" extra"))
    }

    func testCalculateAcceptsCurlyQuotesAndStoresCanonicalHeight() throws {
        let plan = try NutritionCalculator.calculate(
            NutritionCalculatorInput(
                goal: .maintenance,
                age: "30",
                sex: .male,
                height: "5’11”",
                currentWeight: "190",
                workoutsPerWeek: 3,
                dailyMovement: .mixed,
                trainingIntensity: .moderate
            )
        )

        XCTAssertEqual(plan.height, "5'11\"")
    }

    func testCalculateReturnsClearValidationForInvalidHeight() {
        XCTAssertThrowsError(
            try NutritionCalculator.calculate(
                NutritionCalculatorInput(
                    goal: .maintenance,
                    age: "30",
                    sex: .male,
                    height: "5'12\"",
                    currentWeight: "190",
                    workoutsPerWeek: 3,
                    dailyMovement: .mixed,
                    trainingIntensity: .moderate
                )
            )
        ) { error in
            XCTAssertEqual(
                error.localizedDescription,
                "Enter a height from 3 ft 0 in to 8 ft 0 in. Inches must be 0–11."
            )
        }
    }
}
