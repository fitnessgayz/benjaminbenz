import SwiftUI
import UIKit

@MainActor
final class RestTimerStore: ObservableObject {
    enum Phase: Equatable {
        case idle
        case running
        case paused
        case complete
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var remainingSeconds = 0
    @Published private(set) var exerciseName = ""

    private var countdownTask: Task<Void, Never>?
    private var hapticsEnabled = true
    private var endDate: Date?

    var isVisible: Bool { phase != .idle }

    var timeLabel: String {
        String(format: "%02d:%02d", remainingSeconds / 60, remainingSeconds % 60)
    }

    func start(seconds: Int, exerciseName: String, hapticsEnabled: Bool) {
        countdownTask?.cancel()
        remainingSeconds = max(seconds, 1)
        self.exerciseName = exerciseName
        self.hapticsEnabled = hapticsEnabled
        endDate = Date().addingTimeInterval(TimeInterval(remainingSeconds))
        phase = .running
        WorkoutHaptics.selection(isEnabled: hapticsEnabled)
        runCountdown()
    }

    func togglePause() {
        switch phase {
        case .running:
            updateRemainingTime()
            guard remainingSeconds > 0 else {
                complete()
                return
            }
            countdownTask?.cancel()
            endDate = nil
            phase = .paused
        case .paused:
            endDate = Date().addingTimeInterval(TimeInterval(remainingSeconds))
            phase = .running
            runCountdown()
        case .idle, .complete:
            break
        }
    }

    func addThirtySeconds() {
        if phase == .complete {
            remainingSeconds = 30
            endDate = Date().addingTimeInterval(30)
            phase = .running
            runCountdown()
        } else {
            remainingSeconds += 30
            if phase == .running {
                endDate = (endDate ?? Date()).addingTimeInterval(30)
            }
        }
        WorkoutHaptics.selection(isEnabled: hapticsEnabled)
    }

    func dismiss() {
        countdownTask?.cancel()
        endDate = nil
        phase = .idle
        remainingSeconds = 0
        exerciseName = ""
    }

    private func runCountdown() {
        countdownTask?.cancel()
        countdownTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 1_000_000_000)
                guard !Task.isCancelled, let self else { return }

                if self.phase != .running {
                    return
                }

                self.updateRemainingTime()
                if self.remainingSeconds == 0 {
                    self.complete()
                    return
                }
            }
        }
    }

    private func complete() {
        endDate = nil
        remainingSeconds = 0
        phase = .complete
        WorkoutHaptics.success(isEnabled: hapticsEnabled)
        UIAccessibility.post(notification: .announcement, argument: "Rest complete")

        countdownTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            guard !Task.isCancelled, self?.phase == .complete else { return }
            self?.dismiss()
        }
    }

    private func updateRemainingTime(now: Date = Date()) {
        guard let endDate else { return }
        remainingSeconds = max(Int(ceil(endDate.timeIntervalSince(now))), 0)
    }
}

enum RestDurationParser {
    static func seconds(from value: String, defaultSeconds: Int = 60) -> Int {
        let normalized = value
            .lowercased()
            .replacingOccurrences(of: "–", with: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        guard !normalized.isEmpty else { return defaultSeconds }

        if normalized.contains(":"),
           let colon = normalized.firstIndex(of: ":"),
           let minutes = Int(normalized[..<colon]),
           let seconds = Int(normalized[normalized.index(after: colon)...].prefix { $0.isNumber }) {
            return max((minutes * 60) + seconds, 1)
        }

        let numberText = normalized.prefix { $0.isNumber || $0 == "." }
        guard let firstValue = Double(numberText) else { return defaultSeconds }

        if normalized.contains("min") {
            return max(Int((firstValue * 60).rounded()), 1)
        }

        return max(Int(firstValue.rounded()), 1)
    }
}

private enum WorkoutHaptics {
    static func selection(isEnabled: Bool) {
        guard isEnabled else { return }
        let generator = UISelectionFeedbackGenerator()
        generator.prepare()
        generator.selectionChanged()
    }

    static func success(isEnabled: Bool) {
        guard isEnabled else { return }
        let generator = UINotificationFeedbackGenerator()
        generator.prepare()
        generator.notificationOccurred(.success)
    }
}

struct RestTimerBanner: View {
    @ObservedObject var store: RestTimerStore

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                Image(systemName: store.phase == .complete ? "checkmark.circle.fill" : "timer")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(store.phase == .complete ? Color.fwbLime : Color.fwbWarmWhite)

                VStack(alignment: .leading, spacing: 2) {
                    Text(store.phase == .complete ? "REST COMPLETE" : "REST TIMER")
                        .font(.footnote.bold())
                        .tracking(1)
                        .foregroundStyle(Color.fwbLime)
                    Text(store.exerciseName.fwbTitleCased)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Color.fwbMuted)
                        .lineLimit(1)
                }

                Spacer(minLength: 10)

                Text(store.timeLabel)
                    .font(.system(.title2, design: .monospaced).weight(.black))
                    .foregroundStyle(Color.fwbWarmWhite)
                    .accessibilityLabel("Rest time remaining")
                    .accessibilityValue(store.timeLabel)
            }

            HStack(spacing: 10) {
                Button {
                    store.togglePause()
                } label: {
                    Label(store.phase == .paused ? "Resume" : "Pause", systemImage: store.phase == .paused ? "play.fill" : "pause.fill")
                }
                .disabled(store.phase == .complete)

                Button("+30 sec") {
                    store.addThirtySeconds()
                }

                Button("Skip") {
                    store.dismiss()
                }
                .accessibilityLabel("Skip rest timer")
            }
            .font(.footnote.weight(.bold))
            .foregroundStyle(Color.fwbWarmWhite)
            .buttonStyle(RestTimerControlButtonStyle())
        }
        .padding(14)
        .background(Color.fwbCard, in: Rectangle())
        .overlay {
            Rectangle()
                .stroke(store.phase == .complete ? Color.fwbLime : Color.fwbLine, lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.35), radius: 12, y: -3)
        .accessibilityElement(children: .contain)
    }
}

private struct RestTimerControlButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .frame(minHeight: 36)
            .background(Color.fwbSurface, in: Rectangle())
            .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
            .opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.35)
    }
}
