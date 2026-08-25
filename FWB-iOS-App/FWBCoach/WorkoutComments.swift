import SwiftUI
import Supabase

struct WorkoutCommentContext: Hashable {
    let clientEmail: String
    let entryDate: String
    let workoutTitle: String
}

struct WorkoutComment: Decodable, Identifiable, Equatable {
    enum AuthorRole: String, Decodable {
        case client
        case coach
    }

    let id: UUID
    let threadID: UUID
    let authorRole: AuthorRole
    let body: String
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case threadID = "thread_id"
        case authorRole = "author_role"
        case body
        case createdAt = "created_at"
    }

    var createdDate: Date? {
        WorkoutCommentDate.date(from: createdAt)
    }
}

private struct WorkoutCommentThread: Decodable {
    let id: UUID
    let clientLastReadAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case clientLastReadAt = "client_last_read_at"
    }
}

private struct WorkoutCommentThreadPayload: Encodable {
    let clientUserID: UUID
    let clientEmail: String
    let entryDate: String
    let workoutTitle: String

    enum CodingKeys: String, CodingKey {
        case clientUserID = "client_user_id"
        case clientEmail = "client_email"
        case entryDate = "entry_date"
        case workoutTitle = "workout_title"
    }
}

private struct WorkoutCommentPayload: Encodable {
    let threadID: UUID
    let authorUserID: UUID
    let authorRole = "client"
    let body: String

    enum CodingKeys: String, CodingKey {
        case threadID = "thread_id"
        case authorUserID = "author_user_id"
        case authorRole = "author_role"
        case body
    }
}

private struct MarkWorkoutCommentReadParameters: Encodable {
    let targetThreadID: UUID

    enum CodingKeys: String, CodingKey {
        case targetThreadID = "target_thread_id"
    }
}

private enum WorkoutCommentDate {
    private static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let standardFormatter = ISO8601DateFormatter()

    static func date(from value: String) -> Date? {
        fractionalFormatter.date(from: value) ?? standardFormatter.date(from: value)
    }
}

@MainActor
final class WorkoutCommentStore: ObservableObject {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    @Published private(set) var state: LoadState = .idle
    @Published private(set) var comments: [WorkoutComment] = []
    @Published private(set) var unreadCoachReplyCount = 0
    @Published private(set) var isSending = false
    @Published var message: String?

    private let client: SupabaseClient
    private var thread: WorkoutCommentThread?
    private var context: WorkoutCommentContext?

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
    }

    func refresh(context newContext: WorkoutCommentContext, markRead: Bool = false) async {
        if context != newContext {
            context = newContext
            thread = nil
            comments = []
            unreadCoachReplyCount = 0
        }

        state = .loading
        message = nil

        do {
            let session = try await client.auth.session
            thread = try await fetchThread(context: newContext, userID: session.user.id)

            guard let thread else {
                comments = []
                unreadCoachReplyCount = 0
                state = .loaded
                return
            }

            comments = try await fetchComments(threadID: thread.id)
            unreadCoachReplyCount = Self.unreadCoachReplyCount(
                comments: comments,
                lastReadAt: thread.clientLastReadAt
            )

            if markRead, !comments.isEmpty {
                try await markThreadRead(threadID: thread.id)
                unreadCoachReplyCount = 0
            }

            state = .loaded
        } catch is CancellationError {
            return
        } catch {
            state = .failed("Comments could not be loaded. Check your connection and try again.")
        }
    }

    func send(_ draft: String, context newContext: WorkoutCommentContext) async -> Bool {
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else {
            message = "Write a comment first."
            return false
        }
        guard body.count <= 2_000 else {
            message = "Keep comments to 2,000 characters or fewer."
            return false
        }

        isSending = true
        message = nil
        defer { isSending = false }

        do {
            let session = try await client.auth.session
            let activeThread = try await ensureThread(
                context: newContext,
                userID: session.user.id
            )
            let payload = WorkoutCommentPayload(
                threadID: activeThread.id,
                authorUserID: session.user.id,
                body: body
            )

            try await client
                .from("workout_comments")
                .insert(payload)
                .execute()

            await refresh(context: newContext, markRead: true)
            return true
        } catch is CancellationError {
            return false
        } catch {
            message = "Your comment could not be sent. Check your connection and try again."
            return false
        }
    }

    static func unreadCoachReplyCount(
        comments: [WorkoutComment],
        lastReadAt: String?
    ) -> Int {
        let lastReadDate = lastReadAt.flatMap(WorkoutCommentDate.date(from:))
        return comments.filter { comment in
            guard comment.authorRole == .coach else { return false }
            guard let lastReadDate else { return true }
            guard let createdDate = comment.createdDate else { return false }
            return createdDate > lastReadDate
        }.count
    }

    private func fetchThread(
        context: WorkoutCommentContext,
        userID: UUID
    ) async throws -> WorkoutCommentThread? {
        let records: [WorkoutCommentThread] = try await client
            .from("workout_comment_threads")
            .select("id,client_last_read_at")
            .eq("client_user_id", value: userID.uuidString)
            .eq("entry_date", value: context.entryDate)
            .eq("workout_title", value: context.workoutTitle)
            .limit(1)
            .execute()
            .value
        return records.first
    }

    private func fetchComments(threadID: UUID) async throws -> [WorkoutComment] {
        try await client
            .from("workout_comments")
            .select("id,thread_id,author_role,body,created_at")
            .eq("thread_id", value: threadID.uuidString)
            .order("created_at", ascending: true)
            .execute()
            .value
    }

    private func ensureThread(
        context newContext: WorkoutCommentContext,
        userID: UUID
    ) async throws -> WorkoutCommentThread {
        if context == newContext, let thread {
            return thread
        }

        context = newContext
        if let existing = try await fetchThread(context: newContext, userID: userID) {
            thread = existing
            return existing
        }

        let payload = WorkoutCommentThreadPayload(
            clientUserID: userID,
            clientEmail: newContext.clientEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            entryDate: newContext.entryDate,
            workoutTitle: newContext.workoutTitle
        )
        do {
            let created: WorkoutCommentThread = try await client
                .from("workout_comment_threads")
                .insert(payload)
                .select("id,client_last_read_at")
                .single()
                .execute()
                .value
            thread = created
            return created
        } catch {
            // A second device may have created this session thread first.
            if let existing = try? await fetchThread(context: newContext, userID: userID) {
                thread = existing
                return existing
            }
            throw error
        }
    }

    private func markThreadRead(threadID: UUID) async throws {
        try await client
            .rpc(
                "mark_workout_comment_thread_read",
                params: MarkWorkoutCommentReadParameters(targetThreadID: threadID)
            )
            .execute()
    }
}

struct WorkoutCommentSummaryCard: View {
    @ObservedObject var store: WorkoutCommentStore
    let context: WorkoutCommentContext

    var body: some View {
        NavigationLink {
            WorkoutCommentsView(store: store, context: context)
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(Color.fwbLime)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 4) {
                    Text("WORKOUT COMMENTS")
                        .font(.headline.weight(.black))
                        .foregroundStyle(Color.fwbWarmWhite)
                    Text(summaryText)
                        .font(.subheadline)
                        .foregroundStyle(Color.fwbMuted)
                        .multilineTextAlignment(.leading)
                }

                Spacer(minLength: 8)

                if store.unreadCoachReplyCount > 0 {
                    Text("\(store.unreadCoachReplyCount) NEW")
                        .font(.caption2.weight(.black))
                        .tracking(0.6)
                        .foregroundStyle(Color.black)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(Color.fwbAccentFill, in: Rectangle())
                        .accessibilityLabel("\(store.unreadCoachReplyCount) unread coach replies")
                } else {
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(Color.fwbMuted)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .fwbCard()
        .accessibilityIdentifier("workout.comments")
    }

    private var summaryText: String {
        if store.unreadCoachReplyCount > 0 {
            return store.unreadCoachReplyCount == 1
                ? "Benjamin replied to this session."
                : "Benjamin sent new replies to this session."
        }
        if !store.comments.isEmpty {
            return "Review the conversation about this session."
        }
        if case .failed = store.state {
            return "Comments are unavailable right now."
        }
        return "Leave context, questions, or feedback for Benjamin."
    }
}

struct WorkoutCommentsView: View {
    @ObservedObject var store: WorkoutCommentStore
    let context: WorkoutCommentContext

    @State private var draft = ""
    @FocusState private var composerIsFocused: Bool

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        threadHeader

                        if store.state == .loading, store.comments.isEmpty {
                            ProgressView("Loading comments…")
                                .tint(Color.fwbLime)
                                .foregroundStyle(Color.fwbMuted)
                                .frame(maxWidth: .infinity, minHeight: 180)
                        } else if store.comments.isEmpty {
                            emptyState
                        } else {
                            ForEach(store.comments) { comment in
                                WorkoutCommentRow(comment: comment)
                                    .id(comment.id)
                            }
                        }

                        if case .failed(let text) = store.state {
                            commentStatus(text: text, isError: true)
                        } else if let message = store.message {
                            commentStatus(text: message, isError: true)
                        }
                    }
                    .padding(20)
                    .padding(.bottom, 150)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: store.comments) { comments in
                    guard let lastID = comments.last?.id else { return }
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(lastID, anchor: .bottom)
                    }
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            composer
        }
        .navigationTitle("Comments")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .task(id: context) {
            await store.refresh(context: context, markRead: true)
        }
    }

    private var threadHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(context.workoutTitle.uppercased())
                .font(.title2.weight(.black))
                .fontWidth(.condensed)
                .foregroundStyle(Color.fwbWarmWhite)
            Text(sessionDateText)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.fwbLime)
            Text("Comments are shared privately with Benjamin and stay attached to this workout session.")
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: "bubble.left")
                .font(.title2.weight(.bold))
                .foregroundStyle(Color.fwbLime)
            Text("START THE CONVERSATION")
                .font(.headline.weight(.black))
                .foregroundStyle(Color.fwbWarmWhite)
            Text("Share how the session felt, flag an exercise, or ask a question. Benjamin will reply from the coach website.")
                .font(.body)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }

    private var composer: some View {
        VStack(spacing: 10) {
            FWBRule()
            HStack(alignment: .bottom, spacing: 10) {
                TextField("Add a workout comment", text: $draft, axis: .vertical)
                    .lineLimit(1...5)
                    .textFieldStyle(FWBTextFieldStyle())
                    .focused($composerIsFocused)
                    .accessibilityIdentifier("comments.composer")

                Button {
                    let outgoing = draft
                    Task {
                        if await store.send(outgoing, context: context) {
                            draft = ""
                            composerIsFocused = false
                        }
                    }
                } label: {
                    if store.isSending {
                        ProgressView()
                            .tint(.black)
                    } else {
                        Image(systemName: "arrow.up")
                            .font(.headline.weight(.black))
                    }
                }
                .frame(width: 52, height: 52)
                .foregroundStyle(Color.black)
                .background(Color.fwbAccentFill, in: Rectangle())
                .disabled(store.isSending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .opacity(store.isSending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)
                .accessibilityLabel("Send comment")
                .accessibilityIdentifier("comments.send")
            }

            HStack {
                Text("PRIVATE · CLIENT + COACH")
                Spacer()
                Text("\(draft.count)/2000")
                    .foregroundStyle(draft.count > 2_000 ? Color.fwbRed : Color.fwbMuted)
            }
            .font(.caption2.weight(.bold))
            .tracking(0.7)
            .foregroundStyle(Color.fwbMuted)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .background(Color.fwbBackground)
    }

    private var sessionDateText: String {
        let input = DateFormatter()
        input.calendar = Calendar(identifier: .gregorian)
        input.locale = Locale(identifier: "en_US_POSIX")
        input.dateFormat = "yyyy-MM-dd"
        guard let date = input.date(from: context.entryDate) else { return context.entryDate }
        return date.formatted(date: .long, time: .omitted).uppercased()
    }

    @ViewBuilder
    private func commentStatus(text: String, isError: Bool) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: isError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
            Text(text)
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(isError ? Color.fwbRed : Color.fwbLime)
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }
}

private struct WorkoutCommentRow: View {
    let comment: WorkoutComment

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(comment.authorRole == .coach ? "BENJAMIN · COACH" : "YOU")
                    .font(.caption.weight(.black))
                    .tracking(0.8)
                    .foregroundStyle(comment.authorRole == .coach ? Color.black : Color.fwbLime)
                Spacer()
                if let date = comment.createdDate {
                    Text(date.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption)
                        .foregroundStyle(comment.authorRole == .coach ? Color.black.opacity(0.65) : Color.fwbMuted)
                }
            }

            Text(comment.body)
                .font(.body)
                .foregroundStyle(comment.authorRole == .coach ? Color.black : Color.fwbWarmWhite)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(comment.authorRole == .coach ? Color.fwbAccentFill : Color.fwbCard, in: Rectangle())
        .overlay {
            Rectangle()
                .stroke(comment.authorRole == .coach ? Color.fwbAccentFill : Color.fwbLine, lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
    }
}
