import XCTest
@testable import FWBCoach

final class CoachNotificationRoutingTests: XCTestCase {
    private let id = UUID(uuidString: "A1100000-0000-0000-0000-000000000001")!

    func testRelativeAndTrustedAbsoluteLinksResolveUUIDAndTab() throws {
        for base in ["", "https://benjaminbenz.com"] {
            let route = try XCTUnwrap(CoachNotificationRoute.parse(webURL: "\(base)/coach-admin.html?tab=logs&client=\(id.uuidString)"))
            XCTAssertEqual(route.programID, id)
            XCTAssertEqual(route.section, .logs)
            XCTAssertNil(route.clientEmail)
        }
    }

    func testMissingClientPreservesSectionForNativeClientPicker() throws {
        let route = try XCTUnwrap(CoachNotificationRoute.parse(webURL: "/coach-admin.html?tab=progress"))
        XCTAssertEqual(route.section, .progress)
        XCTAssertNil(route.programID)
        XCTAssertNil(route.clientEmail)
    }

    func testLegacyEmailNormalizesWithoutInventingAClient() throws {
        let route = try XCTUnwrap(CoachNotificationRoute.parse(webURL: "/coach-admin.html?tab=nutrition&client_email=ALICE%40EXAMPLE.COM"))
        XCTAssertEqual(route.section, .food)
        XCTAssertEqual(route.clientEmail, "alice@example.com")
        XCTAssertNil(route.programID)
    }

    func testExternalSchemesHostsPathsCredentialsAndAmbiguousIdentitiesAreRejected() {
        let invalid = [
            "javascript:alert(1)", "http://benjaminbenz.com/coach-admin.html",
            "https://benjaminbenz.com.evil.example/coach-admin.html", "//evil.example/coach-admin.html",
            "https://user@benjaminbenz.com/coach-admin.html", "https://benjaminbenz.com:8443/coach-admin.html",
            "https://benjaminbenz.com/client-dashboard.html?tab=logs", "/coach-admin.html?client=not-a-uuid",
            "/coach-admin.html?tab=logs&tab=progress", "/coach-admin.html?client=\(id)&client=\(UUID())",
            "/coach-admin.html?client_email=not-an-email", "/coach-admin.html?tab=unknown", "/coach-admin.html#https://evil.example"
        ]
        for input in invalid { XCTAssertNil(CoachNotificationRoute.parse(webURL: input), input) }
    }

    func testExistingCachedNotificationsStillDecodeWithoutWebURL() throws {
        let data = try JSONSerialization.data(withJSONObject: ["id": id.uuidString, "user_id": UUID().uuidString, "kind": "workout_completed", "title": "Workout", "body": "Saved", "created_at": "2026-09-25T12:00:00Z"])
        let notification = try JSONDecoder().decode(ClientNotification.self, from: data)
        XCTAssertNil(notification.webURL)
        XCTAssertNil(notification.readAt)
    }

    func testWebURLRoundTripsAndExistingMemberInitializerRemainsCompatible() throws {
        let url = "/coach-admin.html?tab=sessions&client=\(id.uuidString)"
        let notification = ClientNotification(id: UUID(), userID: id, kind: "session_balance", title: "Sessions", body: "Review package", createdAt: "2026-09-25T12:00:00Z", readAt: nil, webURL: url)
        let decoded = try JSONDecoder().decode(ClientNotification.self, from: JSONEncoder().encode(notification))
        XCTAssertEqual(decoded.webURL, url)
        let oldCall = ClientNotification(id: UUID(), userID: id, kind: "general", title: "Update", body: "Info", createdAt: "2026-09-25T12:00:00Z", readAt: nil)
        XCTAssertNil(oldCall.webURL)
    }

    @MainActor
    func testLinkedProgramNeverFallsBackToAnotherClient() throws {
        let alice = CoachClientProgram(raw: ["id": .string(id.uuidString), "client_email": .string("alice@example.com"), "client_name": .string("Alice")])
        let store = CoachWorkspaceStore(previewPrograms: [alice])
        let missing = try XCTUnwrap(CoachNotificationRoute.parse(webURL: "/coach-admin.html?client=\(UUID())&client_email=alice%40example.com"))
        XCTAssertNil(missing.client(in: store))
        let linked = try XCTUnwrap(CoachNotificationRoute.parse(webURL: "/coach-admin.html?client=\(id)"))
        XCTAssertEqual(linked.client(in: store)?.id, id)
    }
}
