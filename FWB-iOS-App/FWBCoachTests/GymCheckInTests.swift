import XCTest
import Combine
@testable import FWBCoach

@MainActor
final class GymCheckInTests: XCTestCase {
    private let account = SignedInAccount(id: UUID(), email: "client@example.com")
    private var calendar: Calendar {
        var result = Calendar(identifier: .gregorian)
        result.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        return result
    }

    func testWeekUsesMondayThroughSundayAcrossYearBoundary() {
        let week = GymCheckInWeek(date: date("2027-01-03"), calendar: calendar)
        XCTAssertEqual(week.dates, ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"])
    }

    func testWeekUsesLocalDaysAcrossDaylightSavingTransition() {
        let week = GymCheckInWeek(date: date("2026-11-01"), calendar: calendar)
        XCTAssertEqual(week.start, "2026-10-26")
        XCTAssertEqual(week.end, "2026-11-01")
        XCTAssertEqual(Set(week.dates).count, 7)
    }

    func testRefreshReadsNormalizedOwnerAndThisWeekWithoutWriting() async {
        let mixedCase = SignedInAccount(id: account.id, email: " CLIENT@Example.com ")
        let backend = GymBackend(account: mixedCase)
        backend.rows = [visit("2026-09-23"), visit("2026-09-25")]
        let store = makeStore(backend, account: mixedCase)
        await store.refresh()
        XCTAssertEqual(backend.reads.first?.account.email, "client@example.com")
        XCTAssertEqual(backend.reads.first?.start, "2026-09-21")
        XCTAssertEqual(backend.reads.first?.end, "2026-09-27")
        XCTAssertEqual(store.weeklyCount, 2)
        XCTAssertTrue(store.isCheckedInToday)
        XCTAssertTrue(backend.writes.isEmpty)
        XCTAssertTrue(store.hasLoaded)
    }

    func testFailedWriteDoesNotShowCheckedInAndCanRetry() async {
        let backend = GymBackend(account: account)
        backend.writeError = URLError(.notConnectedToInternet)
        let store = makeStore(backend)
        await store.refresh()
        let failed = await store.checkIn()
        XCTAssertFalse(failed)
        XCTAssertFalse(store.isCheckedInToday)
        XCTAssertEqual(store.weeklyCount, 0)
        XCTAssertNotNil(store.errorMessage)
        XCTAssertFalse(store.isSaving)
        backend.writeError = nil
        let saved = await store.checkIn()
        XCTAssertTrue(saved)
        XCTAssertTrue(store.isCheckedInToday)
        XCTAssertEqual(store.weeklyCount, 1)
        XCTAssertNil(store.errorMessage)
    }

    func testSuccessfulSaveIsBoundToTodayAndSubsequentTapDoesNotWriteAgain() async {
        let backend = GymBackend(account: account)
        let store = makeStore(backend)
        let first = await store.checkIn()
        let second = await store.checkIn()
        XCTAssertTrue(first)
        XCTAssertTrue(second)
        XCTAssertEqual(backend.writes, [visit("2026-09-25")])
        XCTAssertEqual(backend.events, ["verify", "save", "verify", "read"])
        XCTAssertEqual(store.weeklyCount, 1)
    }

    func testMismatchedServerConfirmationCannotShowSuccess() async {
        for row in [GymVisit(clientEmail: "other@example.com", entryDate: "2026-09-25"), visit("2026-09-24")] {
            let backend = GymBackend(account: account)
            backend.confirmedVisit = row
            let store = makeStore(backend)
            let result = await store.checkIn()
            XCTAssertFalse(result)
            XCTAssertFalse(store.isCheckedInToday)
            XCTAssertNotNil(store.errorMessage)
        }
    }

    func testInvalidReadDoesNotExposeAnotherClientsVisits() async {
        let backend = GymBackend(account: account)
        backend.rows = [GymVisit(clientEmail: "other@example.com", entryDate: "2026-09-25")]
        let store = makeStore(backend)
        await store.refresh()
        XCTAssertFalse(store.hasLoaded)
        XCTAssertTrue(store.checkedDates.isEmpty)
        XCTAssertNotNil(store.errorMessage)
    }

    func testSimultaneousTapsWaitForOneConfirmedWrite() async {
        let backend = GymBackend(account: account)
        let gate = GymGate()
        backend.beforeWrite = { await gate.wait() }
        let store = makeStore(backend)
        let pending = Task { await store.checkIn() }
        await waitUntil { backend.writes.count == 1 }
        XCTAssertTrue(store.isSaving)
        XCTAssertFalse(store.isCheckedInToday)
        let duplicate = await store.checkIn()
        XCTAssertFalse(duplicate)
        XCTAssertEqual(backend.writes.count, 1)
        gate.resume()
        let result = await pending.value
        XCTAssertTrue(result)
        XCTAssertTrue(store.isCheckedInToday)
    }

    func testAccountSwitchDuringVerificationPreventsWrite() async {
        let backend = GymBackend(account: account)
        backend.afterVerify = { backend.currentAccount = SignedInAccount(id: UUID(), email: "other@example.com") }
        let store = makeStore(backend)
        let saved = await store.checkIn()
        XCTAssertFalse(saved)
        XCTAssertTrue(backend.writes.isEmpty)
        XCTAssertTrue(store.checkedDates.isEmpty)
    }

    func testAccountSwitchDuringWriteDiscardsLateConfirmation() async {
        let backend = GymBackend(account: account)
        backend.beforeWrite = { backend.currentAccount = SignedInAccount(id: UUID(), email: "other@example.com") }
        let store = makeStore(backend)
        let saved = await store.checkIn()
        XCTAssertFalse(saved)
        XCTAssertFalse(store.isCheckedInToday)
        XCTAssertFalse(store.hasLoaded)
    }

    func testAlreadyCheckedInAccountCannotLeakSuccessAfterSignOut() async {
        let backend = GymBackend(account: account)
        backend.rows = [visit("2026-09-25")]
        let store = makeStore(backend)
        await store.refresh()
        backend.currentAccount = nil
        let saved = await store.checkIn()
        XCTAssertFalse(saved)
        XCTAssertTrue(store.checkedDates.isEmpty)
        XCTAssertTrue(backend.writes.isEmpty)
    }

    func testMidnightResetsDailyStatusAndNewWeekClearsWeeklyCount() async {
        let backend = GymBackend(account: account)
        var clock = date("2026-09-27")
        backend.rows = [visit("2026-09-27")]
        let store = GymCheckInStore(account: account, backend: backend, now: { clock }, calendar: { self.calendar })
        await store.refresh()
        XCTAssertTrue(store.isCheckedInToday)
        clock = date("2026-09-28")
        backend.rows = []
        await store.refreshIfDateChanged()
        XCTAssertEqual(store.today, "2026-09-28")
        XCTAssertEqual(store.week.start, "2026-09-28")
        XCTAssertFalse(store.isCheckedInToday)
        XCTAssertEqual(store.weeklyCount, 0)
    }

    func testPreviewAndCoachAccountsNeverWrite() async {
        let backend = GymBackend(account: account)
        let preview = GymCheckInStore(account: account, previewMode: true, backend: backend)
        await preview.refresh()
        let previewSaved = await preview.checkIn()
        XCTAssertFalse(previewSaved)
        XCTAssertTrue(backend.events.isEmpty)
        let coach = SignedInAccount(id: account.id, email: account.email, role: .coach)
        let store = GymCheckInStore(account: coach, backend: backend)
        let coachSaved = await store.checkIn()
        XCTAssertFalse(coachSaved)
        XCTAssertTrue(backend.writes.isEmpty)
    }

    func testCancelledWriteDoesNotPublishUnconfirmedSuccess() async {
        let backend = GymBackend(account: account)
        backend.writeError = CancellationError()
        let store = makeStore(backend)
        let result = await store.checkIn()
        XCTAssertFalse(result)
        XCTAssertFalse(store.isCheckedInToday)
        XCTAssertFalse(store.isSaving)
        XCTAssertNil(store.errorMessage)
    }

    func testOlderRefreshCannotEraseLaterConfirmedCheckIn() async {
        let backend = GymBackend(account: account)
        let gate = GymGate()
        backend.beforeRead = { if backend.reads.count == 1 { await gate.wait() } }
        let store = makeStore(backend)
        let oldRefresh = Task { await store.refresh() }
        await waitUntil { backend.reads.count == 1 }
        let saved = await store.checkIn()
        XCTAssertTrue(saved)
        XCTAssertTrue(store.isCheckedInToday)
        gate.resume()
        await oldRefresh.value
        XCTAssertTrue(store.isCheckedInToday)
        XCTAssertEqual(store.weeklyCount, 1)
    }

    func testMidnightDuringSaveKeepsVisitOnOriginalDayAndResetsTodaysButton() async {
        let backend = GymBackend(account: account)
        var clock = date("2026-09-25")
        backend.beforeWrite = { clock = self.date("2026-09-26") }
        let store = GymCheckInStore(account: account, backend: backend, now: { clock }, calendar: { self.calendar })
        let saved = await store.checkIn()
        XCTAssertTrue(saved)
        XCTAssertEqual(backend.writes, [visit("2026-09-25")])
        XCTAssertEqual(store.today, "2026-09-26")
        XCTAssertFalse(store.isCheckedInToday)
        XCTAssertEqual(store.weeklyCount, 1)
    }

    func testConfirmedSaveNotifiesOtherCardsOnceWithAccountIDButFailuresAndReadsDoNot() async {
        let backend = GymBackend(account: account)
        let center = NotificationCenter()
        var receivedAccounts: [UUID] = []
        let observation = center.publisher(for: .fwbGymCheckInDidChange).sink { notification in
            if let id = notification.userInfo?["accountID"] as? UUID { receivedAccounts.append(id) }
        }
        defer { observation.cancel() }
        let store = GymCheckInStore(account: account, backend: backend, now: { self.date("2026-09-25") },
                                    calendar: { self.calendar }, notificationCenter: center)
        await store.refresh()
        XCTAssertTrue(receivedAccounts.isEmpty)
        backend.writeError = URLError(.notConnectedToInternet)
        let failed = await store.checkIn()
        XCTAssertFalse(failed)
        XCTAssertTrue(receivedAccounts.isEmpty)
        backend.writeError = nil
        let saved = await store.checkIn()
        XCTAssertTrue(saved)
        XCTAssertEqual(receivedAccounts, [account.id])
        let duplicate = await store.checkIn()
        XCTAssertTrue(duplicate)
        await store.refresh()
        XCTAssertEqual(receivedAccounts, [account.id])
    }

    private func makeStore(_ backend: GymBackend, account: SignedInAccount? = nil) -> GymCheckInStore {
        GymCheckInStore(account: account ?? self.account, backend: backend, now: { self.date("2026-09-25") }, calendar: { self.calendar })
    }
    private func visit(_ day: String) -> GymVisit { GymVisit(clientEmail: account.email, entryDate: day) }
    private func date(_ day: String) -> Date {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        formatter.timeZone = calendar.timeZone
        return formatter.date(from: "\(day) 12:00")!
    }
    private func waitUntil(_ predicate: () -> Bool) async {
        for _ in 0..<1000 {
            if predicate() { return }
            await Task.yield()
        }
        XCTFail("Asynchronous operation did not reach expected checkpoint")
    }
}

@MainActor
private final class GymBackend: GymCheckInBackend {
    struct Read {
        let account: SignedInAccount
        let start: String
        let end: String
    }
    var currentAccount: SignedInAccount?
    var rows: [GymVisit] = []
    var writes: [GymVisit] = []
    var reads: [Read] = []
    var events: [String] = []
    var writeError: Error?
    var confirmedVisit: GymVisit?
    var afterVerify: (() -> Void)?
    var beforeWrite: (() async -> Void)?
    var beforeRead: (() async -> Void)?

    init(account: SignedInAccount) { currentAccount = account }
    func verifyAccount(_ account: SignedInAccount) async throws {
        events.append("verify")
        afterVerify?()
    }
    func visits(account: SignedInAccount, from start: String, through end: String) async throws -> [GymVisit] {
        events.append("read")
        reads.append(Read(account: account, start: start, end: end))
        let result = rows
        await beforeRead?()
        return result
    }
    func saveVisit(account: SignedInAccount, date: String) async throws -> GymVisit {
        events.append("save")
        let row = GymVisit(clientEmail: account.email, entryDate: date)
        writes.append(row)
        await beforeWrite?()
        if let writeError { throw writeError }
        if !rows.contains(row) { rows.append(row) }
        return confirmedVisit ?? row
    }
}

@MainActor
private final class GymGate {
    private var continuation: CheckedContinuation<Void, Never>?
    func wait() async { await withCheckedContinuation { continuation = $0 } }
    func resume() { continuation?.resume(); continuation = nil }
}
