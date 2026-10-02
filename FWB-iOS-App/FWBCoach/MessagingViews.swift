import SwiftUI

private struct MessagingInboxKey: EnvironmentKey {
    static let defaultValue: MessagingInboxStore? = nil
}

extension EnvironmentValues {
    var messagingInbox: MessagingInboxStore? {
        get { self[MessagingInboxKey.self] }
        set { self[MessagingInboxKey.self] = newValue }
    }
}

struct MessageCoachCard: View {
    @ObservedObject var inbox: MessagingInboxStore

    var body: some View {
        NavigationLink {
            MessageConversationView(store: inbox.conversation())
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .font(.title2).foregroundStyle(Color.fwbLime)
                    .frame(width: 46, height: 46)
                    .background(Color.fwbLime.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 4) {
                    Text("Message coach").font(FWBFont.headline.weight(.bold)).foregroundStyle(Color.fwbWarmWhite)
                    Text(inbox.unreadCount > 0 ? "You have a new reply" : "Questions, updates, or a little support.")
                        .font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
                }
                Spacer(minLength: 0)
                if inbox.unreadCount > 0 { MessageUnreadBadge(count: inbox.unreadCount) }
                Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(Color.fwbMuted)
            }
            .modifier(FWBCardModifier())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home.messageCoach")
        .accessibilityLabel("Message coach, \(inbox.unreadCount) unread messages")
    }
}

struct CoachMessageInboxView: View {
    @ObservedObject var inbox: MessagingInboxStore

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 7) {
                    Text("STAY CONNECTED").font(FWBFont.caption.weight(.bold)).foregroundStyle(Color.fwbLime)
                    Text("Client conversations").font(FWBFont.title.weight(.bold))
                    Text("Messages and replies stay in sync with the website.")
                        .font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted)
                }.padding(.bottom, 6)
                if let error = inbox.errorMessage {
                    MessageErrorBanner(message: error) { Task { await inbox.refresh() } }
                }
                if inbox.isLoading && !inbox.hasLoaded {
                    ProgressView("Loading conversations…").frame(maxWidth: .infinity).padding(30)
                } else if inbox.items.isEmpty && inbox.errorMessage == nil {
                    FWBEmptyState(icon: "tray", title: "Your inbox is ready",
                        message: "When a client taps Message coach, their conversation will appear here.")
                }
                ForEach(inbox.items) { item in
                    NavigationLink {
                        MessageConversationView(store: inbox.conversation(clientEmail: item.clientEmail, clientName: item.displayName))
                    } label: {
                        MessageInboxRow(item: item)
                    }.buttonStyle(.plain)
                    .accessibilityIdentifier("messaging.thread.\(item.clientEmail)")
                }
            }.padding(16)
        }
        .background(Color.fwbBackground.ignoresSafeArea())
        .navigationTitle("Inbox")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await inbox.refresh() }
        .task { await inbox.refresh() }
    }
}

private struct MessageInboxRow: View {
    let item: MessageInboxItem
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(String(item.displayName.prefix(1)).uppercased())
                .font(FWBFont.headline.bold()).foregroundStyle(Color.fwbLime)
                .frame(width: 42, height: 42)
                .background(Color.fwbLime.opacity(0.1), in: Circle())
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(item.displayName).font(FWBFont.headline).foregroundStyle(Color.fwbWarmWhite)
                    Spacer(minLength: 0)
                    if let date = CheckInDateCoding.date(from: item.lastMessageAt) {
                        Text(date, style: .relative).font(FWBFont.caption).foregroundStyle(Color.fwbMuted)
                    }
                }
                Text((item.lastSenderRole == .coach ? "Coach: " : "") + item.lastMessageBody)
                    .font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted).lineLimit(2)
                if item.unreadCount > 0 {
                    Text("\(item.unreadCount) unread").font(FWBFont.caption.weight(.bold)).foregroundStyle(Color.fwbLime)
                }
            }
            if item.unreadCount > 0 { Circle().fill(Color.fwbLime).frame(width: 8, height: 8).padding(.top, 6) }
        }.modifier(FWBCardModifier())
    }
}

struct MessageConversationView: View {
    @ObservedObject var store: MessageConversationStore
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.clientNavigationTabIsSelected) private var tabIsSelected
    @State private var isVisible = false
    @State private var visibleMessageIDs: Set<Int64> = []
    @State private var historyHeight: CGFloat = 0
    @State private var followsLatest = true
    @State private var didPositionHistory = false
    @State private var sendScrollRequest = 0
    @FocusState private var composerFocused: Bool

    private var isActive: Bool { isVisible && scenePhase == .active && tabIsSelected }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    conversationHeader
                    if store.isLoading && !store.hasLoaded {
                        ProgressView("Loading messages…").frame(maxWidth: .infinity).padding(30)
                    }
                    if let error = store.errorMessage {
                        MessageErrorBanner(message: error) { Task { await store.refresh() } }
                    }
                    if store.hasOlder {
                        Button {
                            let oldestID = store.messages.first?.id
                            Task {
                                await store.loadOlder()
                                if let oldestID { proxy.scrollTo(oldestID, anchor: .top) }
                            }
                        } label: {
                            HStack {
                                if store.isLoadingOlder { ProgressView() }
                                Text(store.isLoadingOlder ? "Loading earlier messages…" : "Load earlier messages")
                            }.frame(maxWidth: .infinity).padding(.vertical, 8)
                        }
                        .disabled(store.isLoadingOlder)
                        .accessibilityIdentifier("messaging.loadEarlier")
                    }
                    if store.hasLoaded && store.messages.isEmpty {
                        FWBEmptyState(icon: "bubble.left.and.bubble.right", title: "No messages yet",
                            message: store.account.isCoach
                                ? "Your client can start a conversation with Message coach."
                                : "Ask a question, share an update, or tell your coach how training is going.")
                    }
                    ForEach(store.messages) { message in
                        MessageBubble(message: message, isOwn: message.senderUserID == store.account.id)
                            .id(message.id)
                            .background {
                                GeometryReader { geometry in
                                    Color.clear.preference(key: MessageFramePreference.self,
                                        value: [message.id: geometry.frame(in: .named("message-history"))])
                                }
                            }
                    }
                    Color.clear.frame(height: 1).id("latest-message")
                }.padding(16)
            }
            .coordinateSpace(name: "message-history")
            .background {
                GeometryReader { geometry in
                    Color.clear.onAppear { historyHeight = geometry.size.height }
                        .onChange(of: geometry.size.height) { _, height in historyHeight = height }
                }
            }
            .onPreferenceChange(MessageFramePreference.self) { frames in
                // Lazy stack onAppear can prefetch offscreen rows. Read receipts use
                // viewport intersection so arrivals below the scroll position stay unread.
                visibleMessageIDs = Set(frames.filter { $0.value.maxY > 0 && $0.value.minY < historyHeight }.keys)
                if let lastID = store.messages.last?.id, let frame = frames[lastID] {
                    followsLatest = frame.maxY <= historyHeight + 20 && frame.maxY > 0
                } else if didPositionHistory { followsLatest = false }
                if isActive, let visibleID = visibleMessageIDs.max() {
                    Task { await store.markVisible(throughID: visibleID) }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await store.refresh() }
            .onChange(of: store.messages.last?.id) { _, _ in
                // Paging earlier history preserves the newest ID, so it never jumps down.
                if followsLatest || !didPositionHistory {
                    proxy.scrollTo("latest-message", anchor: .bottom)
                    if !store.messages.isEmpty { didPositionHistory = true }
                }
            }
            .onChange(of: sendScrollRequest) { _, _ in proxy.scrollTo("latest-message", anchor: .bottom) }
            .onAppear { proxy.scrollTo("latest-message", anchor: .bottom) }
            .onChange(of: composerFocused) { _, focused in
                if focused { proxy.scrollTo("latest-message", anchor: .bottom) }
            }
        }
        .background(Color.fwbBackground.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) { composer }
        .navigationTitle(store.account.isCoach ? store.title : "Message coach")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { isVisible = true }
        .onDisappear { isVisible = false }
        .task(id: isActive) {
            guard isActive else { return }
            await store.refresh()
            if let visibleID = visibleMessageIDs.max() { await store.markVisible(throughID: visibleID) }
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: 10_000_000_000) } catch { return }
                guard !Task.isCancelled else { return }
                await store.refresh()
                if let visibleID = visibleMessageIDs.max() { await store.markVisible(throughID: visibleID) }
                await store.retryReadStatus()
            }
        }
    }

    private var conversationHeader: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "bubble.left.and.bubble.right.fill").font(.title2).foregroundStyle(Color.fwbLime)
            VStack(alignment: .leading, spacing: 4) {
                Text(store.account.isCoach ? "Your conversation with \(store.title)" : "A direct line to your coach")
                    .font(FWBFont.headline)
                Text("Pick up this conversation in the app or on the website.")
                    .font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
            }
        }.padding(.bottom, 10)
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let error = store.sendError {
                Text(error).font(FWBFont.footnote).foregroundStyle(Color.fwbRed)
                    .accessibilityIdentifier("messaging.sendError")
            }
            if let error = store.readError {
                Text(error).font(FWBFont.caption).foregroundStyle(Color.fwbMuted)
            }
            if store.account.isCoach && store.hasLoaded && store.messages.isEmpty {
                Text("Replies will be available after your client sends a message.")
                    .font(FWBFont.footnote).foregroundStyle(Color.fwbMuted).padding(.vertical, 6)
            } else {
                HStack(alignment: .bottom, spacing: 10) {
                    TextField(store.account.isCoach ? "Write a reply…" : "Message your coach…", text: $store.draft, axis: .vertical)
                        .lineLimit(1...5).font(FWBFont.body).padding(12)
                        .background(Color.fwbBackground, in: RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.fwbLine))
                        .focused($composerFocused)
                        .disabled(store.isSending || store.pendingRequestID != nil)
                        .accessibilityIdentifier("messaging.composer")
                    Button {
                        composerFocused = false
                        Task {
                            await store.send()
                            if store.sendError == nil { sendScrollRequest += 1 }
                        }
                    } label: {
                        Group {
                            if store.isSending { ProgressView().tint(.black) }
                            else { Image(systemName: store.pendingRequestID == nil ? "arrow.up" : "arrow.clockwise").font(.headline.bold()) }
                        }
                        .frame(width: 46, height: 46)
                        .foregroundStyle(.black)
                        .background(Color.fwbAccentFill.opacity(store.canSend ? 1 : 0.4), in: Circle())
                    }
                    .disabled(!store.canSend)
                    .accessibilityLabel(store.pendingRequestID == nil ? "Send message" : "Retry sending message")
                    .accessibilityIdentifier("messaging.send")
                }
                if store.characterCount > 3_500 {
                    Text("\(store.characterCount) / \(MessageConversationStore.messageLimit)")
                        .font(FWBFont.caption)
                        .foregroundStyle(store.characterCount > MessageConversationStore.messageLimit ? Color.fwbRed : Color.fwbMuted)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.fwbCard)
        .overlay(alignment: .top) { Color.fwbLine.frame(height: 1) }
    }
}

private struct MessageFramePreference: PreferenceKey {
    static var defaultValue: [Int64: CGRect] = [:]
    static func reduce(value: inout [Int64: CGRect], nextValue: () -> [Int64: CGRect]) {
        value.merge(nextValue(), uniquingKeysWith: { _, new in new })
    }
}

private struct MessageBubble: View {
    let message: CoachMessage
    let isOwn: Bool
    var body: some View {
        HStack {
            if isOwn { Spacer(minLength: 36) }
            VStack(alignment: .leading, spacing: 7) {
                Text(message.body).font(FWBFont.body).textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 5) {
                    Text(isOwn ? "You · \(message.senderRole.title)" : message.senderRole.title)
                    if let date = message.date {
                        Text("·")
                        Text(date.formatted(date: .abbreviated, time: .shortened))
                    }
                }.font(FWBFont.caption).foregroundStyle(Color.fwbMuted)
            }
            .padding(13)
            .background(isOwn ? Color.fwbLime.opacity(0.12) : Color.fwbCard, in: RoundedRectangle(cornerRadius: 17))
            .overlay(RoundedRectangle(cornerRadius: 17).stroke(isOwn ? Color.fwbLime.opacity(0.35) : Color.fwbLine))
            if !isOwn { Spacer(minLength: 36) }
        }.accessibilityElement(children: .combine)
    }
}

private struct MessageUnreadBadge: View {
    let count: Int
    var body: some View {
        Text(count > 99 ? "99+" : "\(count)").font(FWBFont.caption.weight(.bold))
            .foregroundStyle(.black).padding(.horizontal, 8).padding(.vertical, 5)
            .background(Color.fwbAccentFill, in: Capsule())
    }
}

private struct MessageErrorBanner: View {
    let message: String
    let retry: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(message).font(FWBFont.footnote).foregroundStyle(Color.fwbRed)
            Button("Try again", action: retry).font(FWBFont.footnote.weight(.semibold))
        }.frame(maxWidth: .infinity, alignment: .leading).modifier(FWBCardModifier())
    }
}
