import SwiftUI
import UIKit

struct ProgressShareSummary {
    let kicker: String
    let headline: String
    let message: String
    let stats: [ProgressShareStat]
    let weeklyCompleted: Int
    let weeklyGoal: Int
    let caption: String

    static func workout(_ celebration: WorkoutCelebration) -> ProgressShareSummary {
        ProgressShareSummary(
            kicker: celebration.workoutTitle.uppercased(),
            headline: celebration.headline,
            message: celebration.message,
            stats: celebration.metrics.map {
                ProgressShareStat(title: $0.title, value: $0.value)
            },
            weeklyCompleted: celebration.weeklyCompleted,
            weeklyGoal: celebration.weeklyGoal,
            caption: "\(celebration.headline) \(celebration.workoutTitle) complete with FWB Training."
        )
    }
}

struct ProgressShareStat: Identifiable {
    let title: String
    let value: String

    var id: String { title }
}

private struct ProgressShareActivity: Identifiable {
    let id = UUID()
    let items: [Any]
}

struct ProgressShareButton: View {
    let summary: ProgressShareSummary

    @State private var activity: ProgressShareActivity?
    @State private var isPreparing = false
    @State private var errorMessage = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                prepareShareCard()
            } label: {
                HStack(spacing: 10) {
                    if isPreparing {
                        ProgressView()
                            .tint(Color.fwbLime)
                    } else {
                        Image(systemName: "square.and.arrow.up")
                    }
                    Text(isPreparing ? "PREPARING SHARE CARD…" : "SHARE PROGRESS")
                }
            }
            .buttonStyle(FWBSecondaryButtonStyle())
            .disabled(isPreparing)
            .accessibilityIdentifier("progress.share")

            if !errorMessage.isEmpty {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote)
                    .foregroundStyle(Color.fwbRed)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .sheet(item: $activity) { activity in
            SystemShareSheet(items: activity.items)
        }
    }

    @MainActor
    private func prepareShareCard() {
        guard !isPreparing else { return }
        isPreparing = true
        errorMessage = ""

        let card = ProgressSocialCard(summary: summary)
            .environment(\.colorScheme, .dark)
            .frame(width: 1080, height: 1080)
        let renderer = ImageRenderer(content: card)
        renderer.proposedSize = ProposedViewSize(width: 1080, height: 1080)
        renderer.scale = 1
        renderer.isOpaque = true

        defer { isPreparing = false }
        guard let image = renderer.uiImage else {
            errorMessage = "The share card couldn’t be created. Please try again."
            return
        }

        activity = ProgressShareActivity(items: [image, summary.caption])
    }
}

struct ProgressSharePanel: View {
    let summary: ProgressShareSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("SHARE YOUR PROGRESS")
                        .font(.footnote.weight(.black))
                        .tracking(1)
                        .foregroundStyle(Color.fwbLime)
                    Text("Celebrate the work")
                        .font(.title3.weight(.black))
                        .fontWidth(.condensed)
                        .foregroundStyle(Color.fwbWarmWhite)
                }

                Spacer()

                Image(systemName: "square.and.arrow.up")
                    .font(.title2.weight(.black))
                    .foregroundStyle(Color.fwbLime)
            }

            Text("Create a branded square card, then choose where to share it using the iPhone share sheet.")
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)

            ProgressShareButton(summary: summary)

            Label("Only workout totals are included—never your email, nutrition, or Apple Health data.", systemImage: "lock.fill")
                .font(.footnote)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .fwbCard()
    }
}

private struct ProgressSocialCard: View {
    let summary: ProgressShareSummary

    private let background = Color(red: 0.09, green: 0.098, blue: 0.094)
    private let card = Color(red: 0.125, green: 0.137, blue: 0.125)
    private let surface = Color(red: 0.16, green: 0.172, blue: 0.16)
    private let lime = Color(red: 0.843, green: 1, blue: 0.247)
    private let warmWhite = Color(red: 0.969, green: 0.969, blue: 0.949)
    private let muted = Color(red: 0.68, green: 0.68, blue: 0.64)

    var body: some View {
        ZStack {
            background

            VStack(alignment: .leading, spacing: 44) {
                header

                VStack(alignment: .leading, spacing: 20) {
                    Text(summary.kicker)
                        .font(.system(size: 28, weight: .black))
                        .tracking(4)
                        .foregroundStyle(lime)

                    Text(summary.headline)
                        .font(.system(size: 88, weight: .black))
                        .fontWidth(.condensed)
                        .foregroundStyle(warmWhite)
                        .lineSpacing(-8)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(summary.message)
                        .font(.system(size: 30, weight: .semibold))
                        .foregroundStyle(muted)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 16) {
                    ForEach(Array(summary.stats.prefix(3))) { stat in
                        VStack(alignment: .leading, spacing: 12) {
                            Text(stat.title)
                                .font(.system(size: 24, weight: .black))
                                .tracking(2)
                                .foregroundStyle(muted)
                            Text(stat.value)
                                .font(.system(size: 40, weight: .black))
                                .fontWidth(.condensed)
                                .foregroundStyle(warmWhite)
                                .lineLimit(1)
                                .minimumScaleFactor(0.65)
                        }
                        .padding(24)
                        .frame(maxWidth: .infinity, minHeight: 142, alignment: .leading)
                        .background(surface)
                        .overlay { Rectangle().stroke(muted.opacity(0.38), lineWidth: 2) }
                    }
                }

                weeklyGoal

                Spacer(minLength: 0)

                HStack {
                    Text("FITNESS WITH BENJAMIN")
                        .font(.system(size: 24, weight: .black))
                        .tracking(3)
                        .foregroundStyle(warmWhite)
                    Spacer()
                    Text("FWB TRAINING")
                        .font(.system(size: 24, weight: .black))
                        .foregroundStyle(lime)
                }
            }
            .padding(64)
        }
    }

    private var header: some View {
        HStack(spacing: 20) {
            ZStack {
                Circle().fill(lime)
                Text("FWB")
                    .font(.system(size: 28, weight: .black))
                    .fontWidth(.condensed)
                    .foregroundStyle(Color.black)
            }
            .frame(width: 82, height: 82)

            VStack(alignment: .leading, spacing: 4) {
                Text("MY PROGRESS")
                    .font(.system(size: 30, weight: .black))
                    .foregroundStyle(warmWhite)
                Text("BUILT ONE WORKOUT AT A TIME")
                    .font(.system(size: 21, weight: .bold))
                    .tracking(1.4)
                    .foregroundStyle(muted)
            }

            Spacer()

            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 54, weight: .black))
                .foregroundStyle(lime)
        }
    }

    private var weeklyGoal: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    Text("WEEKLY GOAL")
                        .font(.system(size: 24, weight: .black))
                        .tracking(2)
                        .foregroundStyle(lime)
                    Text(summary.weeklyCompleted >= max(summary.weeklyGoal, 1) ? "GOAL COMPLETE" : "KEEP BUILDING")
                        .font(.system(size: 34, weight: .black))
                        .fontWidth(.condensed)
                        .foregroundStyle(warmWhite)
                }
                Spacer()
                Text("\(min(summary.weeklyCompleted, max(summary.weeklyGoal, 1)))/\(max(summary.weeklyGoal, 1))")
                    .font(.system(size: 48, weight: .black))
                    .foregroundStyle(lime)
            }

            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Rectangle().fill(surface)
                    Rectangle()
                        .fill(lime)
                        .frame(width: geometry.size.width * weeklyProgress)
                }
            }
            .frame(height: 16)
        }
        .padding(28)
        .background(card)
        .overlay { Rectangle().stroke(muted.opacity(0.38), lineWidth: 2) }
    }

    private var weeklyProgress: Double {
        min(Double(summary.weeklyCompleted) / Double(max(summary.weeklyGoal, 1)), 1)
    }
}

private struct SystemShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
