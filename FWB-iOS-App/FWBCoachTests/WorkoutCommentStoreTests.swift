import XCTest
@testable import FWBCoach

@MainActor
final class WorkoutCommentStoreTests: XCTestCase {
    func testUnreadCountIncludesOnlyCoachReplies() {
        let comments = [
            comment(role: .client, createdAt: "2026-08-21T18:00:00Z"),
            comment(role: .coach, createdAt: "2026-08-21T18:01:00Z"),
            comment(role: .coach, createdAt: "2026-08-21T18:02:00Z")
        ]

        XCTAssertEqual(
            WorkoutCommentStore.unreadCoachReplyCount(comments: comments, lastReadAt: nil),
            2
        )
    }

    func testUnreadCountExcludesRepliesAtOrBeforeLastReadTime() {
        let comments = [
            comment(role: .coach, createdAt: "2026-08-21T18:00:00Z"),
            comment(role: .coach, createdAt: "2026-08-21T18:01:00.000Z"),
            comment(role: .coach, createdAt: "2026-08-21T18:02:00Z")
        ]

        XCTAssertEqual(
            WorkoutCommentStore.unreadCoachReplyCount(
                comments: comments,
                lastReadAt: "2026-08-21T18:01:00Z"
            ),
            1
        )
    }

    func testUnreadCountIgnoresMalformedServerTimestampsAfterARead() {
        let comments = [
            comment(role: .coach, createdAt: "not-a-timestamp")
        ]

        XCTAssertEqual(
            WorkoutCommentStore.unreadCoachReplyCount(
                comments: comments,
                lastReadAt: "2026-08-21T18:01:00Z"
            ),
            0
        )
    }

    private func comment(
        role: WorkoutComment.AuthorRole,
        createdAt: String
    ) -> WorkoutComment {
        WorkoutComment(
            id: UUID(),
            threadID: UUID(),
            authorRole: role,
            body: "Test",
            createdAt: createdAt
        )
    }
}
