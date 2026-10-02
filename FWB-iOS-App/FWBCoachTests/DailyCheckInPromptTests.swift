import XCTest
@testable import FWBCoach

final class DailyCheckInPromptTests: XCTestCase {
    private let account = SignedInAccount(id: UUID(), email: "client@example.com")
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return calendar
    }
    private var day: Date { ISO8601DateFormatter().date(from: "2026-09-25T18:00:00Z")! }
    private func history() -> DailyCheckInPromptHistory {
        DailyCheckInPromptHistory(defaults: UserDefaults(suiteName: "daily-prompt-tests.\(UUID())")!)
    }
    private func checkIn(email: String? = nil, date: Date? = nil) -> ReadinessCheckIn {
        ReadinessCheckIn(clientEmail: email ?? account.email,
            localDate: ReadinessCheckIn.localDateKey(for: date ?? day, calendar: calendar),
            energy: 4, soreness: 2, sleepRecovery: 4, mood: 4, note: "")
    }
    func testFirstVisitPromptsAndReopeningSameDayDoesNot() {
        let history = history()
        XCTAssertTrue(history.shouldPresent(account: account, checkIn: nil, date: day, calendar: calendar))
        history.recordPresentation(account: account, date: day, calendar: calendar)
        XCTAssertFalse(history.shouldPresent(account: account, checkIn: nil, date: day.addingTimeInterval(3600), calendar: calendar))
        let restored = DailyCheckInPromptHistory(defaults: history.defaults)
        XCTAssertFalse(restored.shouldPresent(account: account, checkIn: nil, date: day, calendar: calendar))
    }
    func testSkipDoesNotSuppressTomorrow() {
        let history = history()
        history.recordPresentation(account: account, date: day, calendar: calendar)
        XCTAssertTrue(history.shouldPresent(account: account, checkIn: nil, date: day.addingTimeInterval(86400), calendar: calendar))
    }
    func testPromptUsesLocalMidnightRatherThanUTCMidnight() {
        let history = history()
        let before = ISO8601DateFormatter().date(from: "2026-09-26T06:59:00Z")!
        history.recordPresentation(account: account, date: day, calendar: calendar)
        XCTAssertFalse(history.shouldPresent(account: account, checkIn: nil, date: before, calendar: calendar))
        XCTAssertTrue(history.shouldPresent(account: account, checkIn: nil, date: before.addingTimeInterval(120), calendar: calendar))
    }
    func testPromptSuppressionIsScopedToAuthenticatedAccountID() {
        let history = history()
        history.recordPresentation(account: account, date: day, calendar: calendar)
        let other = SignedInAccount(id: UUID(), email: "other@example.com")
        XCTAssertTrue(history.shouldPresent(account: other, checkIn: nil, date: day, calendar: calendar))
    }
    func testTodaysSavedCheckInSuppressesPromptWithoutLocalStamp() {
        XCTAssertFalse(history().shouldPresent(account: account, checkIn: checkIn(), date: day, calendar: calendar))
    }
    func testYesterdayOrAnotherClientsCheckInDoesNotSuppressPrompt() {
        let history = history()
        XCTAssertTrue(history.shouldPresent(account: account, checkIn: checkIn(date: day.addingTimeInterval(-86400)), date: day, calendar: calendar))
        XCTAssertTrue(history.shouldPresent(account: account, checkIn: checkIn(email: "other@example.com"), date: day, calendar: calendar))
    }
    func testCoachNeverReceivesClientPrompt() {
        let coach = SignedInAccount(id: UUID(), email: "coach@example.com", role: .coach)
        XCTAssertFalse(history().shouldPresent(account: coach, checkIn: nil, date: day, calendar: calendar))
    }
    func testNormalizedCheckInOwnerSuppressesPrompt() {
        let owner = SignedInAccount(id: account.id, email: " CLIENT@EXAMPLE.COM ")
        XCTAssertFalse(history().shouldPresent(account: owner, checkIn: checkIn(), date: day, calendar: calendar))
    }
}
