import SwiftUI
import UIKit
import UserNotifications

@MainActor
final class WorkoutReminderManager: ObservableObject {
    @Published private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    @Published private(set) var isWorking = false
    @Published var message = ""

    private let center = UNUserNotificationCenter.current()
    private let identifierPrefix = "fwb.workout-reminder"

    var authorizationLabel: String {
        switch authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            return "Notifications are allowed on this iPhone."
        case .denied:
            return "Notifications are off. You can allow them in iPhone Settings."
        case .notDetermined:
            return "You’ll be asked for permission when reminders are turned on."
        @unknown default:
            return "Notification permission has not been confirmed."
        }
    }

    func refreshAuthorizationStatus() async {
        authorizationStatus = await center.notificationSettings().authorizationStatus
    }

    func enable(weekdays: Set<Int>, hour: Int, minute: Int) async -> Bool {
        isWorking = true
        defer { isWorking = false }

        do {
            await refreshAuthorizationStatus()

            if authorizationStatus == .notDetermined {
                _ = try await center.requestAuthorization(options: [.alert, .sound])
                await refreshAuthorizationStatus()
            }

            guard authorizationStatus == .authorized
                    || authorizationStatus == .provisional
                    || authorizationStatus == .ephemeral else {
                message = "Workout reminders need notification permission."
                return false
            }

            try await schedule(weekdays: weekdays, hour: hour, minute: minute)
            message = "Workout reminders saved."
            return true
        } catch is CancellationError {
            center.removePendingNotificationRequests(withIdentifiers: reminderIdentifiers)
            return false
        } catch {
            center.removePendingNotificationRequests(withIdentifiers: reminderIdentifiers)
            message = "Couldn’t save reminders. Please try again."
            return false
        }
    }

    func disable() {
        center.removePendingNotificationRequests(withIdentifiers: reminderIdentifiers)
        message = "Workout reminders are off."
    }

    private var reminderIdentifiers: [String] {
        (1...7).map { "\(identifierPrefix).\($0)" }
    }

    private func schedule(weekdays: Set<Int>, hour: Int, minute: Int) async throws {
        let validWeekdays = weekdays.filter { (1...7).contains($0) }
        guard !validWeekdays.isEmpty,
              (0...23).contains(hour),
              (0...59).contains(minute) else {
            throw WorkoutReminderError.invalidSchedule
        }

        center.removePendingNotificationRequests(withIdentifiers: reminderIdentifiers)

        do {
            for weekday in validWeekdays.sorted() {
                try Task.checkCancellation()

                let content = UNMutableNotificationContent()
                content.title = "Time to train"
                content.body = "Your FWB workout is ready when you are."
                content.sound = .default

                var components = DateComponents()
                components.weekday = weekday
                components.hour = hour
                components.minute = minute

                let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
                let request = UNNotificationRequest(
                    identifier: "\(identifierPrefix).\(weekday)",
                    content: content,
                    trigger: trigger
                )
                try await center.add(request)
                try Task.checkCancellation()
            }
        } catch {
            center.removePendingNotificationRequests(withIdentifiers: reminderIdentifiers)
            throw error
        }
    }
}

private enum WorkoutReminderError: Error {
    case invalidSchedule
}

struct WorkoutSettingsView: View {
    @AppStorage("restTimerHapticsEnabled") private var restTimerHapticsEnabled = true
    @AppStorage("workoutPraiseHapticsEnabled") private var workoutPraiseHapticsEnabled = true
    @AppStorage("weeklyWorkoutGoal") private var weeklyWorkoutGoal = 3
    @AppStorage("workoutEffortScale") private var workoutEffortScale = WorkoutEffortScale.rpe.rawValue
    @AppStorage("workoutRemindersEnabled") private var workoutRemindersEnabled = false
    @AppStorage("workoutReminderWeekdays") private var storedWeekdays = "2,4,6"
    @AppStorage("workoutReminderHour") private var storedHour = 9
    @AppStorage("workoutReminderMinute") private var storedMinute = 0

    @StateObject private var reminderManager = WorkoutReminderManager()
    @StateObject private var healthKitStore = HealthKitWorkoutSyncStore.shared
    @State private var selectedWeekdays: Set<Int> = [2, 4, 6]
    @State private var reminderTime = Calendar.current.date(from: DateComponents(hour: 9)) ?? Date()
    @State private var hasLoadedPreferences = false
    @State private var reminderUpdateTask: Task<Void, Never>?

    private let days = [
        ReminderDay(symbol: "S", fullName: "Sunday", weekday: 1),
        ReminderDay(symbol: "M", fullName: "Monday", weekday: 2),
        ReminderDay(symbol: "T", fullName: "Tuesday", weekday: 3),
        ReminderDay(symbol: "W", fullName: "Wednesday", weekday: 4),
        ReminderDay(symbol: "T", fullName: "Thursday", weekday: 5),
        ReminderDay(symbol: "F", fullName: "Friday", weekday: 6),
        ReminderDay(symbol: "S", fullName: "Saturday", weekday: 7)
    ]

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    SectionHeading(kicker: "TRAIN YOUR WAY", title: "Workout Settings")

                    restTimerCard
                    effortTrackingCard
                    celebrationsCard
                    appleHealthCard
                    remindersCard
                }
                .padding(20)
            }
        }
        .navigationTitle("Workout Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .task {
            loadPreferences()
            healthKitStore.refreshAuthorizationStatus()
            await reminderManager.refreshAuthorizationStatus()
        }
        .onChange(of: workoutRemindersEnabled) { enabled in
            guard hasLoadedPreferences else { return }
            reminderUpdateTask?.cancel()

            if enabled {
                reminderUpdateTask = Task {
                    let wasEnabled = await saveReminderSchedule()
                    guard !Task.isCancelled else { return }
                    if !wasEnabled {
                        workoutRemindersEnabled = false
                    }
                }
            } else {
                reminderManager.disable()
            }
        }
    }

    private var restTimerCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("REST TIMER", systemImage: "timer")
                .font(.footnote.bold())
                .tracking(1)
                .foregroundStyle(Color.fwbLime)

            Text("Stay on pace between sets")
                .font(.title3.weight(.black))
                .fontWidth(.condensed)

            Text("Completing a set starts the prescribed rest time for that exercise automatically.")
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)

            FWBRule()

            Toggle(isOn: $restTimerHapticsEnabled) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Completion haptic")
                        .font(.subheadline.weight(.bold))
                    Text("Feel a tap when rest is finished")
                        .font(.footnote)
                        .foregroundStyle(Color.fwbMuted)
                }
            }
            .tint(Color.fwbLime)
        }
        .fwbCard()
    }

    private var effortTrackingCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("EFFORT TRACKING", systemImage: "gauge.with.dots.needle.50percent")
                .font(.footnote.bold())
                .tracking(1)
                .foregroundStyle(Color.fwbLime)

            Text("Choose your scale")
                .font(.title3.weight(.black))
                .fontWidth(.condensed)

            Text("Effort is optional and appears beneath each strength set, so weight and reps stay fast to enter.")
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)

            FWBRule()

            Picker("Effort scale", selection: $workoutEffortScale) {
                ForEach(WorkoutEffortScale.allCases) { scale in
                    Text(scale.title).tag(scale.rawValue)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityHint("Choose which effort scale appears when logging strength sets")

            VStack(alignment: .leading, spacing: 5) {
                Text("\(selectedEffortScale.title) · \(selectedEffortScale.rangeLabel)")
                    .font(.subheadline.weight(.black))
                    .foregroundStyle(Color.fwbWarmWhite)
                Text(selectedEffortScale.explanation)
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
        }
        .fwbCard()
    }

    private var selectedEffortScale: WorkoutEffortScale {
        WorkoutEffortScale(rawValue: workoutEffortScale) ?? .rpe
    }

    private var remindersCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Label("WORKOUT REMINDERS", systemImage: "bell.fill")
                        .font(.footnote.bold())
                        .tracking(1)
                        .foregroundStyle(Color.fwbLime)
                    Text("Build consistency")
                        .font(.title3.weight(.black))
                        .fontWidth(.condensed)
                }

                Spacer()

                Toggle("Workout reminders", isOn: $workoutRemindersEnabled)
                    .labelsHidden()
                    .tint(Color.fwbLime)
                    .accessibilityLabel("Workout reminders")
            }

            Text("Choose the days and time you want a private reminder on this iPhone.")
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)

            FWBRule()

            Text("TRAINING DAYS")
                .font(.footnote.bold())
                .tracking(1)
                .foregroundStyle(Color.fwbMuted)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 7), count: 7), spacing: 7) {
                ForEach(days) { day in
                    Button {
                        toggle(day.weekday)
                    } label: {
                        Text(day.symbol)
                            .font(.subheadline.weight(.black))
                            .foregroundStyle(selectedWeekdays.contains(day.weekday) ? Color.black : Color.fwbWarmWhite)
                            .frame(maxWidth: .infinity)
                            .frame(height: 42)
                            .background(selectedWeekdays.contains(day.weekday) ? Color.fwbAccentFill : Color.fwbSurface)
                            .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(day.fullName)
                    .accessibilityValue(selectedWeekdays.contains(day.weekday) ? "Selected" : "Not selected")
                    .accessibilityHint("Double tap to change this training day")
                    .accessibilityAddTraits(selectedWeekdays.contains(day.weekday) ? .isSelected : [])
                }
            }

            DatePicker("Reminder time", selection: $reminderTime, displayedComponents: .hourAndMinute)
                .font(.subheadline.weight(.bold))
                .tint(Color.fwbLime)
                .padding(.vertical, 4)

            Button {
                Task {
                    if workoutRemindersEnabled {
                        _ = await saveReminderSchedule()
                    } else {
                        persistReminderPreferences()
                        reminderManager.message = "Reminder schedule saved. Turn reminders on when you’re ready."
                    }
                }
            } label: {
                if reminderManager.isWorking {
                    ProgressView()
                        .tint(.black)
                } else {
                    Text("SAVE REMINDER SCHEDULE")
                }
            }
            .buttonStyle(FWBPrimaryButtonStyle())
            .disabled(selectedWeekdays.isEmpty || reminderManager.isWorking)

            VStack(alignment: .leading, spacing: 4) {
                Text(reminderManager.authorizationLabel)
                if !reminderManager.message.isEmpty {
                    Text(reminderManager.message)
                        .foregroundStyle(Color.fwbWarmWhite)
                }
            }
            .font(.footnote)
            .foregroundStyle(Color.fwbMuted)
            .accessibilityElement(children: .combine)

            if reminderManager.authorizationStatus == .denied,
               let settingsURL = URL(string: UIApplication.openSettingsURLString) {
                Link(destination: settingsURL) {
                    Label("OPEN IPHONE SETTINGS", systemImage: "gear")
                }
                .buttonStyle(FWBSecondaryButtonStyle())
            }
        }
        .fwbCard()
    }

    private var celebrationsCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("WORKOUT CELEBRATIONS", systemImage: "hands.clap.fill")
                .font(.footnote.bold())
                .tracking(1)
                .foregroundStyle(Color.fwbLime)

            Text("Praise the work")
                .font(.title3.weight(.black))
                .fontWidth(.condensed)

            Text("Get encouraging feedback for completed exercises, personal bests, and consistency—without points, XP, or rankings.")
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)

            FWBRule()

            Toggle(isOn: $workoutPraiseHapticsEnabled) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Celebration haptics")
                        .font(.subheadline.weight(.bold))
                    Text("Feel a tap for an exercise or workout completion")
                        .font(.footnote)
                        .foregroundStyle(Color.fwbMuted)
                }
            }
            .tint(Color.fwbLime)

            FWBRule()

            Stepper(value: $weeklyWorkoutGoal, in: 1...7) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Weekly workout goal")
                            .font(.subheadline.weight(.bold))
                        Text("Used for weekly goal praise")
                            .font(.footnote)
                            .foregroundStyle(Color.fwbMuted)
                    }
                    Spacer()
                    Text("\(weeklyWorkoutGoal)")
                        .font(.title3.weight(.black))
                        .foregroundStyle(Color.fwbLime)
                        .accessibilityHidden(true)
                }
            }
            .accessibilityValue("\(weeklyWorkoutGoal) workouts")
        }
        .fwbCard()
    }

    private var appleHealthCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("APPLE HEALTH", systemImage: "heart.fill")
                .font(.footnote.bold())
                .tracking(1)
                .foregroundStyle(Color.fwbLime)

            Text("Keep every workout together")
                .font(.title3.weight(.black))
                .fontWidth(.condensed)

            Text("FWB can save completed strength and cardio workouts, plus any distance or calories you enter. It does not read your Health data.")
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)

            FWBRule()

            Label(
                healthKitStore.authorizationLabel,
                systemImage: healthKitStore.connectionStatus == .connected
                    ? "checkmark.circle.fill"
                    : "info.circle.fill"
            )
            .font(.footnote)
            .foregroundStyle(
                healthKitStore.connectionStatus == .connected
                    ? Color.fwbLime
                    : Color.fwbMuted
            )
            .fixedSize(horizontal: false, vertical: true)

            if !healthKitStore.message.isEmpty {
                Text(healthKitStore.message)
                    .font(.footnote)
                    .foregroundStyle(Color.fwbWarmWhite)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if healthKitStore.connectionStatus == .notConnected {
                Button {
                    Task { await healthKitStore.requestAuthorization() }
                } label: {
                    if healthKitStore.isWorking {
                        ProgressView()
                            .tint(.black)
                    } else {
                        Text("CONNECT APPLE HEALTH")
                    }
                }
                .buttonStyle(FWBPrimaryButtonStyle())
                .disabled(healthKitStore.isWorking)
            }

            if healthKitStore.connectionStatus == .denied,
               let settingsURL = URL(string: UIApplication.openSettingsURLString) {
                Link(destination: settingsURL) {
                    Label("OPEN IPHONE SETTINGS", systemImage: "gear")
                }
                .buttonStyle(FWBSecondaryButtonStyle())
            }
        }
        .fwbCard()
    }

    private func loadPreferences() {
        guard !hasLoadedPreferences else { return }

        let parsedDays = Set(storedWeekdays.split(separator: ",").compactMap { Int($0) })
        selectedWeekdays = parsedDays.isEmpty ? [2, 4, 6] : parsedDays
        reminderTime = Calendar.current.date(from: DateComponents(hour: storedHour, minute: storedMinute)) ?? Date()
        hasLoadedPreferences = true
    }

    private func toggle(_ weekday: Int) {
        if selectedWeekdays.contains(weekday) {
            guard selectedWeekdays.count > 1 else { return }
            selectedWeekdays.remove(weekday)
        } else {
            selectedWeekdays.insert(weekday)
        }
    }

    private func persistReminderPreferences() {
        let components = Calendar.current.dateComponents([.hour, .minute], from: reminderTime)
        storedWeekdays = selectedWeekdays.sorted().map(String.init).joined(separator: ",")
        storedHour = components.hour ?? 9
        storedMinute = components.minute ?? 0
    }

    private func saveReminderSchedule() async -> Bool {
        persistReminderPreferences()
        return await reminderManager.enable(
            weekdays: selectedWeekdays,
            hour: storedHour,
            minute: storedMinute
        )
    }
}

private struct ReminderDay: Identifiable {
    let symbol: String
    let fullName: String
    let weekday: Int

    var id: Int { weekday }
}
