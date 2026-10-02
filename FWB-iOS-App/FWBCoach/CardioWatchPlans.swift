import Foundation
import HealthKit
import SwiftUI
import WorkoutKit

enum FWBCardioActivity: String, CaseIterable, Identifiable {
    case running, cycling, swimming
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var healthKitType: HKWorkoutActivityType {
        switch self {
        case .running: return .running
        case .cycling: return .cycling
        case .swimming: return .swimming
        }
    }
}

struct FWBCardioPlanDraft: Equatable {
    var activity: FWBCardioActivity = .running
    var isIndoor = false
    var intervals = false
    var durationMinutes = 30
    var workSeconds = 60
    var recoverySeconds = 60
    var rounds = 5
    var scheduledDate = Date().addingTimeInterval(3_600)

    var totalSeconds: Int { intervals ? (workSeconds + recoverySeconds) * rounds : durationMinutes * 60 }

    func validate(now: Date = Date()) throws {
        guard scheduledDate > now, scheduledDate <= now.addingTimeInterval(365 * 86_400) else {
            throw FWBCardioPlanError.invalidDate
        }
        if intervals {
            guard (5...3_600).contains(workSeconds), (5...3_600).contains(recoverySeconds),
                  (1...50).contains(rounds), totalSeconds <= 6 * 3_600 else {
                throw FWBCardioPlanError.invalidIntervals
            }
        } else if !(1...360).contains(durationMinutes) {
            throw FWBCardioPlanError.invalidDuration
        }
    }

    func makePlan(id: UUID = UUID(), now: Date = Date()) throws -> WorkoutPlan {
        try validate(now: now)
        let type = activity.healthKitType
        let location: HKWorkoutSessionLocationType = isIndoor ? .indoor : .outdoor
        if intervals {
            let workGoal = WorkoutGoal.time(Double(workSeconds), .seconds)
            let recoveryGoal = WorkoutGoal.time(Double(recoverySeconds), .seconds)
            guard CustomWorkout.supportsActivity(type),
                  CustomWorkout.supportsGoal(workGoal, activity: type, location: location),
                  CustomWorkout.supportsGoal(recoveryGoal, activity: type, location: location) else {
                throw FWBCardioPlanError.unsupportedIntervals
            }
            let block = IntervalBlock(steps: [IntervalStep(.work, goal: workGoal), IntervalStep(.recovery, goal: recoveryGoal)], iterations: rounds)
            return WorkoutPlan(.custom(CustomWorkout(activity: type, location: location,
                                                      displayName: "FWB \(activity.title) intervals", blocks: [block])), id: id)
        }
        let goal = WorkoutGoal.time(Double(durationMinutes), .minutes)
        guard SingleGoalWorkout.supportsActivity(type),
              SingleGoalWorkout.supportsGoal(goal, activity: type, location: location) else {
            throw FWBCardioPlanError.unsupportedGoal
        }
        return WorkoutPlan(.goal(SingleGoalWorkout(activity: type, location: location,
                                                   swimmingLocation: activity == .swimming ? (isIndoor ? .pool : .openWater) : .unknown,
                                                   goal: goal)), id: id)
    }
}

enum FWBCardioPlanError: LocalizedError {
    case invalidDate, invalidDuration, invalidIntervals, unsupportedIntervals, unsupportedGoal
    case unavailable, permissionDenied, restricted, limitReached, notConfirmed

    var errorDescription: String? {
        switch self {
        case .invalidDate: return "Choose a future date within the next year."
        case .invalidDuration: return "Choose a duration between 1 and 360 minutes."
        case .invalidIntervals: return "Choose 1–50 rounds, work and recovery of 5–3,600 seconds each, and a total under 6 hours."
        case .unsupportedIntervals: return "Apple’s Workout app doesn’t support these timed intervals for this activity and location on this device. Choose another activity or a single duration."
        case .unsupportedGoal: return "Apple’s Workout app doesn’t support this duration goal for this activity and location on this device."
        case .unavailable: return "Workout scheduling needs a paired Apple Watch with a compatible version of watchOS and Apple’s Workout app."
        case .permissionDenied: return "Allow FWB to add workout plans in iPhone Settings to schedule on Apple Watch."
        case .restricted: return "Workout scheduling is restricted on this device."
        case .limitReached: return "Apple’s workout schedule is full. Remove a scheduled workout before adding another."
        case .notConfirmed: return "Apple hasn’t confirmed this schedule change yet. Refresh the list before trying again."
        }
    }
}

@MainActor
final class FWBCardioPlanScheduler: ObservableObject {
    @Published private(set) var scheduled: [ScheduledWorkoutPlan] = []
    @Published private(set) var isWorking = false
    @Published private(set) var message = ""
    @Published private(set) var errorMessage = ""

    var isSupported: Bool { WorkoutScheduler.isSupported }

    func refresh() async {
        guard isSupported else { return }
        // Reading the list does not ask for permission. Only the Schedule action does.
        guard await WorkoutScheduler.shared.authorizationState == .authorized else { return }
        scheduled = await WorkoutScheduler.shared.scheduledWorkouts.sorted {
            (Calendar.current.date(from: $0.date) ?? .distantPast) < (Calendar.current.date(from: $1.date) ?? .distantPast)
        }
    }

    func schedule(_ draft: FWBCardioPlanDraft, id: UUID) async -> Bool {
        guard !isWorking else { return false }
        isWorking = true
        message = ""
        errorMessage = ""
        defer { isWorking = false }
        do {
            guard isSupported else { throw FWBCardioPlanError.unavailable }
            let plan = try draft.makePlan(id: id)
            let scheduler = WorkoutScheduler.shared
            var authorization = await scheduler.authorizationState
            if authorization == .notDetermined { authorization = await scheduler.requestAuthorization() }
            guard authorization == .authorized else {
                throw authorization == .restricted ? FWBCardioPlanError.restricted : FWBCardioPlanError.permissionDenied
            }
            await refresh()
            if scheduled.contains(where: { $0.plan.id == id }) {
                message = "This workout is already scheduled."
                return true
            }
            guard scheduled.count < WorkoutScheduler.maxAllowedScheduledWorkoutCount else {
                throw FWBCardioPlanError.limitReached
            }
            let calendar = Calendar.current
            var date = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: draft.scheduledDate)
            date.calendar = calendar
            date.timeZone = calendar.timeZone
            await scheduler.schedule(plan, at: date)
            await refresh()
            guard scheduled.contains(where: { $0.plan.id == id }) else { throw FWBCardioPlanError.notConfirmed }
            message = "Scheduled with Apple. The plan will sync to the Workout app on your paired Watch."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func remove(_ workout: ScheduledWorkoutPlan) async {
        guard !isWorking else { return }
        isWorking = true
        errorMessage = ""
        message = ""
        defer { isWorking = false }
        await WorkoutScheduler.shared.remove(workout.plan, at: workout.date)
        await refresh()
        if scheduled.contains(where: { $0.plan.id == workout.plan.id && $0.date == workout.date }) {
            errorMessage = FWBCardioPlanError.notConfirmed.localizedDescription
        } else { message = "Workout removed from Apple’s schedule." }
    }
}

struct CardioWatchPlansView: View {
    @StateObject private var scheduler = FWBCardioPlanScheduler()
    @State private var draft = FWBCardioPlanDraft()
    @State private var planID = UUID()
    @State private var pendingRemoval: ScheduledWorkoutPlan?
    @State private var didSchedule = false

    var body: some View {
        Form {
            Section {
                Text("Create a cardio plan for Apple’s Workout app on your paired Watch. FWB strength sets stay in the FWB Watch app.")
                    .font(.subheadline).foregroundStyle(.secondary)
                if !scheduler.isSupported {
                    Label(FWBCardioPlanError.unavailable.localizedDescription, systemImage: "applewatch.slash")
                }
            }
            Section("Cardio plan") {
                Picker("Activity", selection: $draft.activity) {
                    ForEach(FWBCardioActivity.allCases) { Text($0.title).tag($0) }
                }
                Toggle(draft.activity == .swimming ? "Pool swim" : "Indoors", isOn: $draft.isIndoor)
                Toggle("Intervals", isOn: $draft.intervals)
                if draft.intervals {
                    Stepper("Work: \(draft.workSeconds) seconds", value: $draft.workSeconds, in: 5...3_600, step: 5)
                    Stepper("Recovery: \(draft.recoverySeconds) seconds", value: $draft.recoverySeconds, in: 5...3_600, step: 5)
                    Stepper("Rounds: \(draft.rounds)", value: $draft.rounds, in: 1...50)
                    Text("Total: \(draft.totalSeconds / 60) min \(draft.totalSeconds % 60) sec").foregroundStyle(.secondary)
                } else {
                    Stepper("Duration: \(draft.durationMinutes) minutes", value: $draft.durationMinutes, in: 1...360)
                }
                DatePicker("Schedule", selection: $draft.scheduledDate, in: Date()...Date().addingTimeInterval(365 * 86_400))
                Button {
                    Task { didSchedule = await scheduler.schedule(draft, id: planID) }
                } label: {
                    HStack {
                        Label(didSchedule ? "Scheduled" : "Schedule on Apple Watch", systemImage: didSchedule ? "checkmark.circle.fill" : "applewatch")
                        if scheduler.isWorking { Spacer(); ProgressView() }
                    }
                }
                .disabled(scheduler.isWorking || !scheduler.isSupported || didSchedule)
            }
            .disabled(scheduler.isWorking)
            if !scheduler.errorMessage.isEmpty {
                Section { Text(scheduler.errorMessage).foregroundStyle(.red).accessibilityIdentifier("cardioPlanError") }
            }
            if !scheduler.message.isEmpty {
                Section { Text(scheduler.message).foregroundStyle(.secondary) }
            }
            Section("Scheduled workouts") {
                if scheduler.scheduled.isEmpty { Text("No scheduled FWB cardio plans.").foregroundStyle(.secondary) }
                ForEach(scheduler.scheduled, id: \.plan.id) { workout in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(title(for: workout))
                            if let date = Calendar.current.date(from: workout.date) { Text(date, style: .date).font(.caption) }
                            Text(workout.complete ? "Completed" : "Scheduled").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button(role: .destructive) { pendingRemoval = workout } label: { Image(systemName: "trash") }
                            .accessibilityLabel("Remove \(title(for: workout))")
                            .disabled(scheduler.isWorking)
                    }
                }
                Button("Refresh schedule") { Task { await scheduler.refresh() } }.disabled(scheduler.isWorking)
            }
        }
        .navigationTitle("Cardio on Apple Watch")
        .task { await scheduler.refresh() }
        .onChange(of: draft) { _, _ in planID = UUID(); didSchedule = false }
        .confirmationDialog("Remove this cardio plan from Apple’s schedule?", isPresented: Binding(
            get: { pendingRemoval != nil }, set: { if !$0 { pendingRemoval = nil } }
        ), titleVisibility: .visible) {
            Button("Remove workout", role: .destructive) {
                if let workout = pendingRemoval { Task { await scheduler.remove(workout) } }
                pendingRemoval = nil
            }
        }
    }

    private func title(for workout: ScheduledWorkoutPlan) -> String {
        if case .custom(let custom) = workout.plan.workout { return custom.displayName ?? "FWB cardio" }
        return "FWB \(FWBCardioActivity.allCases.first(where: { $0.healthKitType == workout.plan.workout.activity })?.title ?? "Cardio")"
    }
}

struct AppleWorkoutFeaturesView: View {
    @ObservedObject private var features = WorkoutSystemFeatures.shared
    let workouts: [Workout]
    @State private var selectedWorkoutID: UUID?
    @State private var widgetSelectionMessage = ""

    init(workouts: [Workout] = []) {
        self.workouts = workouts
    }

    var body: some View {
        Form {
            Section {
                Toggle("Lock Screen rest timer", isOn: $features.liveActivitiesEnabled)
                if features.liveActivitiesEnabled {
                    Toggle("Show exercise name on Lock Screen", isOn: $features.showExerciseOnLockScreen)
                }
                Text("Shows the rest countdown on your Lock Screen and Dynamic Island. Rest alerts use your notification settings.")
                    .font(.footnote).foregroundStyle(.secondary)
                if !features.liveActivityMessage.isEmpty {
                    Text(features.liveActivityMessage).font(.footnote).foregroundStyle(.secondary)
                }
            } header: { Text("Live Activities") }
            Section {
                Toggle("Show today’s workout in widgets", isOn: $features.widgetEnabled)
                if features.widgetEnabled, !workouts.isEmpty {
                    Picker("Today’s workout", selection: $selectedWorkoutID) {
                        Text("Choose a workout").tag(UUID?.none)
                        ForEach(workouts) { workout in Text(workout.title).tag(Optional(workout.id)) }
                    }
                    Button("Use for today’s widget") {
                        if let workout = workouts.first(where: { $0.id == selectedWorkoutID }) {
                            features.updateAssignedWorkout(title: workout.title, scheduledDate: Date())
                            widgetSelectionMessage = "\(workout.title) is selected for today."
                        }
                    }.disabled(selectedWorkoutID == nil)
                    if !widgetSelectionMessage.isEmpty { Text(widgetSelectionMessage).font(.footnote).foregroundStyle(.secondary) }
                }
                Text("When enabled, the workout you select or open today can appear wherever you add the FWB widget. Long-press the Home Screen, choose Edit, then Add Widget and search for FWB.")
                    .font(.footnote).foregroundStyle(.secondary)
            } header: { Text("Home Screen") }
            Section("Apple Watch") {
                NavigationLink("Schedule a cardio plan") { CardioWatchPlansView() }
            }
            Section("Siri and Shortcuts") {
                Label("“Open my workout in FWB Training”", systemImage: "dumbbell.fill")
                Label("“Start a rest timer in FWB Training”", systemImage: "timer")
                Text("The rest shortcut opens FWB and starts a 90-second timer. Change its duration in the Shortcuts app. You can also assign it to the Action button on supported iPhones.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Apple workout features")
    }
}
