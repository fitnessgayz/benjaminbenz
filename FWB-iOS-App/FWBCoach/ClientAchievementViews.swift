import SwiftUI

enum AchievementDisplay {
    static var today: String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    static func color(_ tier: String) -> Color {
        switch tier {
        case "silver": Color(red: 0.38, green: 0.49, blue: 0.60)
        case "gold": Color(red: 0.66, green: 0.43, blue: 0.05)
        case "platinum": Color(red: 0.46, green: 0.34, blue: 0.72)
        default: Color(red: 0.67, green: 0.36, blue: 0.19)
        }
    }
}

struct ClientBadgesView: View {
    let clientEmail: String
    @StateObject private var history = WorkoutHistoryStore()

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()
            switch history.state {
            case .idle, .loading:
                FWBLoadingState(
                    title: "Loading your badges",
                    message: "Your milestones grow with every completed workout."
                )
            case .loaded:
                if history.hasCompleteHistory {
                    ScrollView {
                        ClientAchievementsSection(
                            snapshot: ClientAchievementEngine.evaluate(
                                records: history.sessions.flatMap(\.records),
                                today: AchievementDisplay.today
                            )
                        )
                        .padding(16)
                    }
                    .refreshable { await history.reload(email: clientEmail) }
                } else {
                    VStack(spacing: 12) {
                        Image(systemName: "trophy")
                            .font(.system(size: 34, weight: .semibold))
                            .foregroundStyle(Color.fwbLime)
                        Text("Connect to refresh your badges and level.")
                            .font(FWBFont.subheadline)
                            .foregroundStyle(Color.fwbMuted)
                            .multilineTextAlignment(.center)
                        Button("Try again") {
                            Task { await history.reload(email: clientEmail) }
                        }
                        .buttonStyle(FWBSecondaryButtonStyle())
                        .accessibilityIdentifier("achievements.retry")
                    }
                    .padding(24)
                }
            case .failed(let message):
                FWBErrorState(message: message) {
                    Task { await history.reload(email: clientEmail) }
                }
            }
        }
        .navigationTitle("Your badges")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .task { await history.loadIfNeeded(email: clientEmail) }
        .onReceive(NotificationCenter.default.publisher(for: .fwbForegroundRefresh)) { _ in
            Task { await history.reload(email: clientEmail) }
        }
    }
}

struct ClientAchievementArtwork: View {
    let badgeID: String
    var unlocked = true
    var size: CGFloat = 100

    var body: some View {
        Image("achievement-\(badgeID)")
            .renderingMode(.original)
            .resizable()
            .scaledToFit()
            .saturation(unlocked ? 1 : 0.05)
            .opacity(unlocked ? 1 : 0.52)
            .frame(width: size, height: size)
            .overlay(alignment: .bottomTrailing) {
                if !unlocked {
                    Image(systemName: "lock.fill")
                        .font(.system(size: size < 80 ? 9 : size > 100 ? 14 : 11, weight: .bold))
                        .foregroundStyle(Color.fwbMuted)
                        .frame(width: size < 80 ? 18 : size > 100 ? 28 : 24,
                               height: size < 80 ? 18 : size > 100 ? 28 : 24)
                        .background(Color.fwbCard, in: Circle())
                        .overlay { Circle().stroke(Color.fwbLine, lineWidth: 1) }
                }
            }
            .accessibilityHidden(true)
    }
}

struct ClientAchievementLevelCard: View {
    let snapshot: AchievementSnapshot
    var compact = false
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            let headingLayout = dynamicTypeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
                : AnyLayout(HStackLayout(alignment: .top, spacing: 14))
            headingLayout {
                Text("\(snapshot.level.number)")
                    .font(FWBFont.title.weight(.black))
                    .foregroundStyle(.black)
                    .frame(width: 64, height: 64)
                    .background(Color.fwbAccentFill, in: RoundedRectangle(cornerRadius: 20))
                    .accessibilityLabel("Level \(snapshot.level.number)")
                VStack(alignment: .leading, spacing: 5) {
                    Text(compact ? "YOUR WINS" : "LEVEL \(snapshot.level.number) OF 8")
                        .font(FWBFont.caption.weight(.bold))
                        .foregroundStyle(Color.fwbLime)
                    Text(snapshot.level.name)
                        .font(FWBFont.title3.weight(.bold))
                        .fixedSize(horizontal: false, vertical: true)
                    Text("\(snapshot.xp.formatted()) XP · \(snapshot.badges.filter(\.unlocked).count) badges earned")
                        .font(FWBFont.footnote)
                        .foregroundStyle(Color.fwbMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: 0) }
            }
            ProgressView(value: snapshot.level.progress)
                .tint(Color.fwbLime)
                .accessibilityLabel("Progress to next level")
            if let nextXP = snapshot.level.nextXP, let nextName = snapshot.level.nextName {
                Text("\(max(0, nextXP - snapshot.xp).formatted()) XP to \(nextName)")
                    .font(FWBFont.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Top level. Your story keeps growing.")
                    .font(FWBFont.subheadline.weight(.semibold))
            }
            if !compact {
                Text("100 XP per completed workout · 50 XP per new PR · 100 XP per badge")
                    .font(FWBFont.footnote)
                    .foregroundStyle(Color.fwbMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .foregroundStyle(Color.fwbWarmWhite)
        .fwbCard()
        .accessibilityIdentifier("achievements.level")
    }
}

struct ClientAchievementsSection: View {
    let snapshot: AchievementSnapshot
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var category = "all"
    @State private var selectedBadge: ClientAchievementBadge?

    private var badges: [ClientAchievementBadge] {
        snapshot.badges.filter { category == "all" || $0.category == category }
    }

    private var nextBadge: ClientAchievementBadge? {
        snapshot.badges.filter { !$0.unlocked }.reduce(nil) { best, badge in
            guard let best else { return badge }
            return badge.progress > best.progress ? badge : best
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("YOUR TROPHY ROOM")
                    .font(FWBFont.caption.weight(.bold))
                    .foregroundStyle(Color.fwbLime)
                Text("Small wins. Big momentum.")
                    .font(FWBFont.title2.weight(.bold))
                Text("Every finished session moves you forward. Recovery counts. Rest days belong here, too.")
                    .font(FWBFont.subheadline)
                    .foregroundStyle(Color.fwbMuted)
            }
            ClientAchievementLevelCard(snapshot: snapshot)

            if let next = nextBadge {
                let nextLayout = dynamicTypeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
                    : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
                nextLayout {
                    ClientAchievementArtwork(badgeID: next.id, unlocked: false, size: 56)
                    VStack(alignment: .leading, spacing: 8) {
                        Text("NEXT UP · \(next.title)")
                            .font(FWBFont.headline.weight(.bold))
                            .fixedSize(horizontal: false, vertical: true)
                        Text(next.detail).font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted)
                        ProgressView(value: next.progress).tint(Color.fwbLime)
                        Text("\(min(next.current, next.target)) of \(next.target)")
                            .font(FWBFont.caption.weight(.semibold))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .fwbCard()
                .accessibilityElement(children: .combine)
            }

            let filterLayout = dynamicTypeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
                : AnyLayout(HStackLayout(spacing: 8))
            filterLayout {
                Text("\(snapshot.badges.filter(\.unlocked).count) / \(snapshot.badges.count) earned")
                    .font(FWBFont.subheadline.weight(.bold))
                if !dynamicTypeSize.isAccessibilitySize { Spacer(minLength: 8) }
                Picker("Badge category", selection: $category) {
                    Text("All badges").tag("all")
                    Text("Workouts").tag("workouts")
                    Text("Personal records").tag("records")
                    Text("Consistency").tag("consistency")
                    Text("Recovery").tag("recovery")
                    Text("Cardio").tag("cardio")
                }
                .labelsHidden()
                .accessibilityIdentifier("achievements.category")
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: dynamicTypeSize.isAccessibilitySize ? 1 : 2), spacing: 12) {
                ForEach(badges) { badge in
                    Button { selectedBadge = badge } label: {
                        ClientAchievementBadgeCard(badge: badge)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("achievements.badge.\(badge.id)")
                }
            }
            DisclosureGroup("Explore all 8 levels") {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(Array(zip(["Getting Started", "Finding Your Groove", "Momentum Maker", "Consistency Crew", "Dedicated", "Trailblazer", "All-Star", "FWB Legend"], [0, 300, 750, 1_500, 3_000, 5_000, 8_000, 12_000]).enumerated()), id: \.offset) { index, level in
                        HStack(alignment: .firstTextBaseline) {
                            Text("\(index + 1). \(level.0)").font(FWBFont.subheadline.weight(.semibold))
                            Spacer(minLength: 8)
                            Text("\(level.1.formatted()) XP").font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
                        }
                    }
                }.padding(.top, 12)
            }
            .font(FWBFont.headline)
            .tint(Color.fwbLime)
            .fwbCard()
            Text("Badges are based on completed, saved workouts. Correcting or deleting a log updates your badges and XP. A PR beats an earlier weight record or bodyweight rep record for the same exercise; your first result sets the baseline.")
                .font(FWBFont.caption)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .foregroundStyle(Color.fwbWarmWhite)
        .sheet(item: $selectedBadge) { badge in
            ClientAchievementDetail(badge: badge)
        }
    }
}

private struct ClientAchievementBadgeCard: View {
    let badge: ClientAchievementBadge
    var artworkSize: CGFloat = 100

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(spacing: 6) {
                ClientAchievementArtwork(badgeID: badge.id, unlocked: badge.unlocked, size: artworkSize)
                Text(badge.tier.uppercased())
                    .font(FWBFont.caption2.weight(.bold))
                    .foregroundStyle(Color.fwbMuted)
            }
            .frame(maxWidth: .infinity)
            Text(badge.title).font(FWBFont.headline.weight(.bold)).fixedSize(horizontal: false, vertical: true)
            Text(badge.detail).font(FWBFont.footnote).foregroundStyle(Color.fwbMuted).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Text(badge.unlocked ? "✓ Earned" : "Locked · \(min(badge.current, badge.target)) / \(badge.target)")
                .font(FWBFont.caption.weight(.bold))
                .foregroundStyle(badge.unlocked ? Color.fwbLime : Color.fwbMuted)
            ProgressView(value: badge.progress).tint(badge.unlocked ? AchievementDisplay.color(badge.tier) : Color.fwbLime)
        }
        .frame(maxWidth: .infinity, minHeight: 240, alignment: .leading)
        .foregroundStyle(Color.fwbWarmWhite)
        .fwbCard()
        .accessibilityElement(children: .combine)
        .accessibilityHint("View badge details")
    }
}

private struct ClientAchievementDetail: View {
    let badge: ClientAchievementBadge
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    ClientAchievementBadgeCard(badge: badge, artworkSize: 128)
                    if let date = badge.earnedOn {
                        Label("Earned \(date)", systemImage: "checkmark.seal.fill")
                            .font(FWBFont.headline).foregroundStyle(Color.fwbLime)
                        ShareLink(item: "I unlocked \(badge.title) on FWB Training! \(badge.detail)") {
                            Label("Share your win", systemImage: "square.and.arrow.up")
                        }.buttonStyle(FWBPrimaryButtonStyle())
                    } else {
                        Text("Your next win is taking shape. Keep training at your own pace.")
                            .font(FWBFont.body).foregroundStyle(Color.fwbMuted)
                    }
                }.padding(20)
            }
            .background(Color.fwbBackground)
            .navigationTitle("Badge details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }.tint(Color.fwbLime)
    }
}

struct ClientWinsHomeCard: View {
    let clientEmail: String
    var previewMode = false
    @StateObject private var history = WorkoutHistoryStore()

    var body: some View {
        Group {
            if previewMode || history.hasCompleteHistory {
                let snapshot = ClientAchievementEngine.evaluate(records: previewMode ? [] : history.sessions.flatMap(\.records), today: AchievementDisplay.today)
                NavigationLink {
                    if previewMode {
                        ScrollView { ClientAchievementsSection(snapshot: snapshot).padding(16) }
                            .background(Color.fwbBackground).navigationTitle("Progress")
                    } else { ProgressDashboardView(clientEmail: clientEmail) }
                } label: {
                    VStack(alignment: .leading, spacing: 10) {
                        ClientAchievementLevelCard(snapshot: snapshot, compact: true)
                        Label("Explore badges & levels", systemImage: "arrow.right")
                            .font(FWBFont.subheadline.weight(.bold)).foregroundStyle(Color.fwbLime)
                    }
                }.buttonStyle(.plain).accessibilityIdentifier("home.achievements")
            } else if history.state == .idle || history.state == .loading {
                FWBLoadingState(
                    title: "Loading your wins",
                    message: "Your latest FWB Training milestones will appear here."
                )
                .frame(minHeight: 220)
                .fwbCard()
            } else {
                VStack(alignment: .leading, spacing: 10) {
                    Label("Your wins", systemImage: "trophy.fill").font(FWBFont.headline)
                    Text("Connect to refresh your badges and level.").font(FWBFont.subheadline).foregroundStyle(Color.fwbMuted)
                    Button("Retry") { Task { await history.reload(email: clientEmail) } }.frame(minHeight: 44)
                }.frame(maxWidth: .infinity, alignment: .leading).fwbCard()
            }
        }
        .task(id: clientEmail) { if !previewMode { await history.loadIfNeeded(email: clientEmail) } }
        .onReceive(NotificationCenter.default.publisher(for: .fwbForegroundRefresh)) { _ in
            if !previewMode { Task { await history.reload(email: clientEmail) } }
        }
    }
}
