import SwiftUI
import UIKit

enum ClientRootTab: String, CaseIterable, Hashable, Identifiable {
    case today = "home"
    case workouts
    case logs
    case progress
    case stats
    case nutrition
    case questionnaire
    case sessions
    case notifications

    // Keep existing audit launch arguments and callers working.
    static var macros: Self { .nutrition }
    static var account: Self { .notifications }

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: return "Home"
        case .workouts: return "Workouts"
        case .logs: return "Logs"
        case .progress: return "Progress"
        case .stats: return "Stats"
        case .nutrition: return "Nutrition"
        case .questionnaire: return "PAR-Q"
        case .sessions: return "Sessions"
        case .notifications: return "Settings"
        }
    }

    var iconAsset: String {
        switch self {
        case .today: return "NavHome"
        case .workouts: return "NavWorkouts"
        case .logs: return "NavLogs"
        case .progress: return "NavProgress"
        case .stats: return "NavStats"
        case .nutrition: return "NavFood"
        case .questionnaire: return "NavQuestionnaire"
        case .sessions: return "NavSessions"
        case .notifications: return "NavSettings"
        }
    }
}

private struct ClientNavigationTabIDKey: EnvironmentKey {
    static let defaultValue = "home"
}

private struct ClientNavigationTabIsSelectedKey: EnvironmentKey {
    static let defaultValue = true
}

extension EnvironmentValues {
    /// Retained tabs let an in-progress workout keep its state when another tab opens.
    var clientNavigationTabID: String {
        get { self[ClientNavigationTabIDKey.self] }
        set { self[ClientNavigationTabIDKey.self] = newValue }
    }

    var clientNavigationTabIsSelected: Bool {
        get { self[ClientNavigationTabIsSelectedKey.self] }
        set { self[ClientNavigationTabIsSelectedKey.self] = newValue }
    }
}

struct ClientRootView: View {
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ObservedObject var sessionStore: SessionStore
    let account: SignedInAccount

    @StateObject private var programStore: ClientProgramStore
    @StateObject private var notificationStore: NotificationInboxStore
    @State private var isPresentingNotificationInbox = false
    @State private var selectedTab: ClientRootTab
    @State private var visitedTabs: Set<ClientRootTab>
    @State private var isNavigationExpanded = true
    @State private var previousTabPress: ClientRootTab?
    @State private var isKeyboardVisible = false
    @State private var workoutExerciseListAvailability: [String: Bool] = [:]

    @MainActor
    init(sessionStore: SessionStore, account: SignedInAccount) {
        self.init(
            sessionStore: sessionStore,
            account: account,
            programStore: ClientProgramStore()
        )
    }

    @MainActor
    init(
        sessionStore: SessionStore,
        account: SignedInAccount,
        programStore: ClientProgramStore,
        initialTab: ClientRootTab = .today
    ) {
        self.sessionStore = sessionStore
        self.account = account
        _programStore = StateObject(wrappedValue: programStore)
        _selectedTab = State(initialValue: initialTab)
        _visitedTabs = State(initialValue: [initialTab])
        _notificationStore = StateObject(
            wrappedValue: NotificationInboxStore(accountID: account.id)
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                // Mount on first use, then retain each stack and its unsaved form state.
                // A system TabView would put the extra web destinations behind More.
                ForEach(ClientRootTab.allCases) { tab in
                    if visitedTabs.contains(tab) {
                        NavigationStack {
                            destination(for: tab)
                        }
                        .environment(\.clientNavigationTabID, tab.rawValue)
                        .environment(\.clientNavigationTabIsSelected, selectedTab == tab)
                        .opacity(selectedTab == tab ? 1 : 0)
                        .allowsHitTesting(selectedTab == tab)
                        .accessibilityHidden(selectedTab != tab)
                        .zIndex(selectedTab == tab ? 1 : 0)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // Give every NavigationStack a viewport that ends above the dock.
            // An outer safeAreaInset can otherwise be lost at the stack boundary.
            if !isKeyboardVisible {
                ClientNavigationDock(
                    selection: selectedTab,
                    isExpanded: isNavigationExpanded,
                    unreadCount: notificationStore.unreadCount,
                    workoutExerciseListAvailable: workoutExerciseListAvailability[ClientRootTab.workouts.rawValue] == true,
                    select: selectTab,
                    expand: expandNavigation
                )
                .padding(.horizontal, 6)
                .padding(.top, 6)
                .padding(.bottom, 6)
            }
        }
        .background(Color.fwbBackground.ignoresSafeArea())
        .font(FWBFont.body)
        .tint(.fwbLime)
        .task {
            await programStore.loadIfNeeded()
            await notificationStore.loadIfNeeded()
            await PushRegistrationCoordinator.shared.activate(account: account)
        }
        .onChange(of: scenePhase) { phase in
            guard phase == .active else { return }
            Task { await notificationStore.reload() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .fwbNotificationInboxShouldOpen)) { _ in
            isPresentingNotificationInbox = true
        }
        .sheet(isPresented: $isPresentingNotificationInbox) {
            NavigationStack {
                NotificationInboxView(store: notificationStore)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Done") { isPresentingNotificationInbox = false }
                        }
                    }
            }
            .tint(Color.fwbLime)
        }
        .onDisappear {
            PushRegistrationCoordinator.shared.clearActiveAccount(account.id)
        }
        .onReceive(NotificationCenter.default.publisher(for: .fwbForegroundRefresh)) { _ in
            Task { await programStore.reload() }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)) { _ in
            isKeyboardVisible = true
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            isKeyboardVisible = false
        }
        .onReceive(NotificationCenter.default.publisher(
            for: Notification.Name("fwbWorkoutExerciseListAvailabilityChanged")
        )) { notification in
            let tab = notification.userInfo?["tab"] as? String ?? selectedTab.rawValue
            workoutExerciseListAvailability[tab] = notification.userInfo?["available"] as? Bool ?? false
        }
    }

    @ViewBuilder
    private func destination(for tab: ClientRootTab) -> some View {
        switch tab {
        case .today:
            ClientDashboardView(store: programStore, notificationStore: notificationStore, account: account)
        case .workouts:
            WorkoutLibraryView(
                store: programStore,
                notificationStore: notificationStore,
                clientEmail: account.email
            )
        case .logs:
            WorkoutHistoryView(clientEmail: account.email)
        case .progress:
            ProgressDashboardView(clientEmail: account.email)
        case .stats:
            ClientStatsView(account: account)
        case .nutrition:
            NutritionTargetsView(store: programStore)
        case .questionnaire:
            ClientQuestionnaireView(account: account)
        case .sessions:
            ClientSessionsView(store: programStore, account: account)
        case .notifications:
            AccountView(account: account, sessionStore: sessionStore, programStore: programStore)
        }
    }

    private func selectTab(_ tab: ClientRootTab) {
        if tab == .workouts, selectedTab == .workouts,
           workoutExerciseListAvailability[tab.rawValue] == true {
            previousTabPress = nil
            NotificationCenter.default.post(
                name: Notification.Name("fwbWorkoutExerciseListRequested"),
                object: nil,
                userInfo: ["tab": tab.rawValue]
            )
            return
        }

        let shouldCollapse = selectedTab == tab && previousTabPress == tab
        visitedTabs.insert(tab)
        selectedTab = tab
        previousTabPress = shouldCollapse ? nil : tab
        if shouldCollapse {
            withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.18)) {
                isNavigationExpanded = false
            }
        }
    }

    private func expandNavigation() {
        previousTabPress = nil
        withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.18)) {
            isNavigationExpanded = true
        }
    }
}

private enum ClientDockStyle {
    static let surface = Color(red: 28 / 255, green: 31 / 255, blue: 27 / 255)
    static let border = Color(red: 53 / 255, green: 58 / 255, blue: 49 / 255)
    static let inactive = Color(red: 228 / 255, green: 230 / 255, blue: 223 / 255)
    static let accent = Color.fwbAccentFill
}

private struct ClientNavigationDock: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .caption2) private var labelSize: CGFloat = 11
    @State private var contentBounds: CGRect?
    let selection: ClientRootTab
    let isExpanded: Bool
    let unreadCount: Int
    let workoutExerciseListAvailable: Bool
    let select: (ClientRootTab) -> Void
    let expand: () -> Void

    private var itemWidth: CGFloat { max(78, labelSize * 7.1) }
    private var itemHeight: CGFloat { max(76, 40 + labelSize * 1.2 + 21) }
    private var contentWidth: CGFloat {
        CGFloat(ClientRootTab.allCases.count) * itemWidth
            + CGFloat(ClientRootTab.allCases.count - 1) * 4 + 16
    }

    var body: some View {
        Group {
            if isExpanded {
                expandedDock
                    .transition(.opacity.combined(with: .scale(scale: 0.85, anchor: .bottomLeading)))
            } else {
                collapsedDock
                    .transition(.opacity)
            }
        }
        .frame(maxWidth: 720, alignment: .leading)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Client dashboard sections")
    }

    private var expandedDock: some View {
        GeometryReader { geometry in
            ScrollViewReader { proxy in
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 4) {
                        ForEach(ClientRootTab.allCases) { tab in
                            tabButton(tab)
                                .id(tab)
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.top, 7)
                    .padding(.bottom, 5)
                    .background {
                        GeometryReader { contentGeometry in
                            Color.clear.preference(
                                key: ClientDockContentBoundsPreferenceKey.self,
                                value: contentGeometry.frame(in: .global)
                            )
                        }
                    }
                }
                .onPreferenceChange(ClientDockContentBoundsPreferenceKey.self) { contentBounds = $0 }
                .onAppear { proxy.scrollTo(selection, anchor: .center) }
                .onChange(of: selection) { tab in
                    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) {
                        proxy.scrollTo(tab, anchor: .center)
                    }
                }
                .onChange(of: geometry.size.width) { _ in
                    proxy.scrollTo(selection, anchor: .center)
                }
                .background(ClientDockStyle.surface)
                .clipShape(RoundedRectangle(cornerRadius: 34))
                .overlay {
                    RoundedRectangle(cornerRadius: 34)
                        .stroke(ClientDockStyle.border, lineWidth: 1)
                }
                .overlay(alignment: .trailing) {
                    if hasTrailingOverflow(in: geometry.frame(in: .global)) {
                        scrollCue
                    }
                }
                .shadow(color: .black.opacity(0.15), radius: 12, y: 5)
            }
        }
        .frame(height: itemHeight + 12)
        .accessibilityIdentifier("client.navigation.dock")
    }

    private func tabButton(_ tab: ClientRootTab) -> some View {
        let isSelected = selection == tab
        let showsExerciseCue = tab == .workouts && workoutExerciseListAvailable
        return Button {
            select(tab)
        } label: {
            VStack(spacing: 3) {
                ZStack(alignment: .top) {
                    Image(tab.iconAsset)
                        .renderingMode(.template)
                        .resizable()
                        .scaledToFit()
                        .padding(isSelected ? 7 : 1)
                        .frame(width: isSelected ? 40 : 27, height: isSelected ? 40 : 27)
                        .foregroundStyle(isSelected ? Color(red: 8 / 255, green: 10 / 255, blue: 8 / 255) : ClientDockStyle.inactive)
                        .background(isSelected ? ClientDockStyle.accent : .clear, in: Circle())
                    if showsExerciseCue {
                        Image(systemName: "chevron.up")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(ClientDockStyle.accent)
                            .offset(y: -9)
                    }
                }
                Text(tab.title)
                    .font(.custom("Inter-Regular", fixedSize: labelSize).weight(.bold))
                    .foregroundStyle(isSelected ? ClientDockStyle.accent : ClientDockStyle.inactive)
                    .lineLimit(1)
                    .minimumScaleFactor(0.9)
            }
            .frame(width: itemWidth, height: itemHeight)
            .contentShape(Rectangle())
            .overlay(alignment: .bottom) {
                if isSelected {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(ClientDockStyle.accent)
                        .frame(width: itemWidth - 32, height: 4)
                        .padding(.bottom, 1)
                }
            }
            .overlay(alignment: .topTrailing) {
                if tab == .notifications && unreadCount > 0 {
                    unreadBadge.padding(.top, 3).padding(.trailing, 4)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tab == .stats ? "Stats and measurements" : tab.title)
        .accessibilityValue(tab == .notifications && unreadCount > 0 ? "\(unreadCount) unread notifications" : "")
        .accessibilityHint(showsExerciseCue && isSelected ? "Show current workout exercises" : "Open \(tab.title)")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("client.navigation.\(tab.rawValue)")
    }

    private func hasTrailingOverflow(in viewport: CGRect) -> Bool {
        guard let contentBounds else { return contentWidth > viewport.width + 4 }
        return contentBounds.maxX > viewport.maxX + 4
    }

    private var collapsedDock: some View {
        Button(action: expand) {
            Image(selection.iconAsset)
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .frame(width: 30, height: 30)
                .foregroundStyle(ClientDockStyle.accent)
                .frame(width: 62, height: 62)
                .background(ClientDockStyle.surface, in: Circle())
                .overlay { Circle().stroke(ClientDockStyle.accent, lineWidth: 2) }
                .overlay(alignment: .topTrailing) {
                    if unreadCount > 0 { unreadBadge }
                }
                .shadow(color: .black.opacity(0.18), radius: 12, y: 5)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open navigation, \(selection.title) selected")
        .accessibilityValue(unreadCount > 0 ? "\(unreadCount) unread notifications" : "")
        .accessibilityIdentifier("client.navigation.expand")
    }

    private var unreadBadge: some View {
        Text(unreadCount > 99 ? "99+" : String(unreadCount))
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 5)
            .frame(minWidth: 18, minHeight: 18)
            .background(Color(red: 0.72, green: 0.08, blue: 0.06), in: Capsule())
            .accessibilityHidden(true)
    }

    private var scrollCue: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 0)
            Text("›")
                .font(.system(size: 24, weight: .black))
                .foregroundStyle(ClientDockStyle.accent)
                .frame(width: 28, height: 46)
                .background(Color(red: 39 / 255, green: 42 / 255, blue: 38 / 255), in: Capsule())
                .overlay { Capsule().stroke(Color(red: 105 / 255, green: 112 / 255, blue: 95 / 255), lineWidth: 1) }
                .padding(.trailing, 7)
        }
        .frame(width: 72)
        .frame(maxHeight: .infinity)
        .background(LinearGradient(colors: [ClientDockStyle.surface.opacity(0), ClientDockStyle.surface], startPoint: .leading, endPoint: .trailing))
        .clipShape(RoundedRectangle(cornerRadius: 34))
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

private struct ClientDockContentBoundsPreferenceKey: PreferenceKey {
    static var defaultValue: CGRect?
    static func reduce(value: inout CGRect?, nextValue: () -> CGRect?) {
        if let next = nextValue() { value = next }
    }
}
