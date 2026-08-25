import Foundation
import HealthKit

@MainActor
final class HealthKitWorkoutSyncStore: ObservableObject {
    enum ConnectionStatus {
        case unavailable
        case notConnected
        case connected
        case denied
    }

    static let shared = HealthKitWorkoutSyncStore()

    @Published private(set) var connectionStatus: ConnectionStatus = .notConnected
    @Published private(set) var isWorking = false
    @Published private(set) var message = ""

    private let healthStore: HKHealthStore
    private let defaults: UserDefaults
    private let syncedIdentifiersKey = "appleHealthSyncedWorkoutIdentifiers"

    init(
        healthStore: HKHealthStore = HKHealthStore(),
        defaults: UserDefaults = .standard
    ) {
        self.healthStore = healthStore
        self.defaults = defaults
        refreshAuthorizationStatus()
    }

    var authorizationLabel: String {
        switch connectionStatus {
        case .unavailable:
            return "Apple Health is unavailable on this device."
        case .notConnected:
            return "Connect when you’re ready. FWB will ask only for permission to save workouts."
        case .connected:
            return "Connected. Completed FWB workouts save to Apple Health automatically."
        case .denied:
            return "Workout access is off. You can change Health permissions in iPhone Settings."
        }
    }

    func refreshAuthorizationStatus() {
        guard HKHealthStore.isHealthDataAvailable() else {
            connectionStatus = .unavailable
            return
        }

        switch healthStore.authorizationStatus(for: HKObjectType.workoutType()) {
        case .sharingAuthorized:
            connectionStatus = .connected
        case .sharingDenied:
            connectionStatus = .denied
        case .notDetermined:
            connectionStatus = .notConnected
        @unknown default:
            connectionStatus = .notConnected
        }
    }

    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            connectionStatus = .unavailable
            message = "Apple Health is unavailable on this device."
            return
        }

        isWorking = true
        defer { isWorking = false }

        do {
            try await healthStore.requestAuthorization(toShare: shareTypes, read: [])
            refreshAuthorizationStatus()
            message = connectionStatus == .connected
                ? "Apple Health is connected."
                : "FWB was not given permission to save workouts."
        } catch {
            refreshAuthorizationStatus()
            message = "Couldn’t connect Apple Health. Please try again."
        }
    }

    func saveStrengthWorkoutIfAuthorized(
        title: String,
        entryDate: Date,
        startedAt: Date,
        endedAt: Date
    ) async {
        refreshAuthorizationStatus()
        guard connectionStatus == .connected else { return }

        let duration = max(60, endedAt.timeIntervalSince(startedAt))
        let start = Self.date(entryDate, applyingTimeFrom: startedAt)
        let end = start.addingTimeInterval(duration)
        let identifier = Self.syncIdentifier(kind: "strength", title: title, entryDate: entryDate)

        await saveWorkout(
            activityType: .traditionalStrengthTraining,
            title: title,
            start: start,
            end: end,
            energyKilocalories: nil,
            distanceMiles: nil,
            distanceType: nil,
            syncIdentifier: identifier
        )
    }

    func saveCardioWorkoutIfAuthorized(
        type: String,
        entryDate: Date,
        durationMinutes: Double,
        distanceMiles: Double?,
        calories: Double?
    ) async {
        refreshAuthorizationStatus()
        guard connectionStatus == .connected, durationMinutes > 0 else { return }

        let duration = max(60, durationMinutes * 60)
        let end = Self.date(entryDate, applyingTimeFrom: Date())
        let start = end.addingTimeInterval(-duration)
        let mapping = Self.cardioMapping(for: type)
        let identifier = Self.syncIdentifier(kind: "cardio", title: type, entryDate: entryDate)

        await saveWorkout(
            activityType: mapping.activityType,
            title: type,
            start: start,
            end: end,
            energyKilocalories: Self.positiveValue(calories),
            distanceMiles: Self.positiveValue(distanceMiles),
            distanceType: mapping.distanceType,
            syncIdentifier: identifier
        )
    }

    private var shareTypes: Set<HKSampleType> {
        var types: Set<HKSampleType> = [HKObjectType.workoutType()]
        [
            HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned),
            HKQuantityType.quantityType(forIdentifier: .distanceWalkingRunning),
            HKQuantityType.quantityType(forIdentifier: .distanceCycling),
            HKQuantityType.quantityType(forIdentifier: .distanceSwimming)
        ].compactMap { $0 }.forEach { types.insert($0) }
        return types
    }

    private func saveWorkout(
        activityType: HKWorkoutActivityType,
        title: String,
        start: Date,
        end: Date,
        energyKilocalories: Double?,
        distanceMiles: Double?,
        distanceType: HKQuantityTypeIdentifier?,
        syncIdentifier: String
    ) async {
        guard !syncedIdentifiers.contains(syncIdentifier) else {
            message = "This completed workout is already in Apple Health."
            return
        }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = activityType
        configuration.locationType = .unknown

        let builder = HKWorkoutBuilder(
            healthStore: healthStore,
            configuration: configuration,
            device: .local()
        )

        do {
            try await builder.beginCollection(at: start)

            let sampleStart = min(end, start.addingTimeInterval(0.001))
            var samples: [HKSample] = []

            if let energyKilocalories,
               let energyType = HKQuantityType.quantityType(forIdentifier: .activeEnergyBurned),
               healthStore.authorizationStatus(for: energyType) == .sharingAuthorized {
                samples.append(
                    HKQuantitySample(
                        type: energyType,
                        quantity: HKQuantity(unit: .kilocalorie(), doubleValue: energyKilocalories),
                        start: sampleStart,
                        end: end
                    )
                )
            }

            if let distanceMiles,
               let distanceType,
               let quantityType = HKQuantityType.quantityType(forIdentifier: distanceType),
               healthStore.authorizationStatus(for: quantityType) == .sharingAuthorized {
                samples.append(
                    HKQuantitySample(
                        type: quantityType,
                        quantity: HKQuantity(unit: .mile(), doubleValue: distanceMiles),
                        start: sampleStart,
                        end: end
                    )
                )
            }

            if !samples.isEmpty {
                try await builder.addSamples(samples)
            }

            try await builder.addMetadata([
                HKMetadataKeyWorkoutBrandName: "FWB Training",
                HKMetadataKeySyncIdentifier: syncIdentifier,
                HKMetadataKeySyncVersion: 1,
                "com.benjaminbenz.fwbcoach.workoutTitle": title
            ])
            try await builder.endCollection(at: end)
            _ = try await builder.finishWorkout()

            markSynced(syncIdentifier)
            message = "Completed workout saved to Apple Health."
        } catch {
            message = "Your FWB workout was saved, but Apple Health sync didn’t finish."
        }
    }

    private var syncedIdentifiers: Set<String> {
        Set(defaults.stringArray(forKey: syncedIdentifiersKey) ?? [])
    }

    private func markSynced(_ identifier: String) {
        var identifiers = syncedIdentifiers
        identifiers.insert(identifier)
        defaults.set(Array(identifiers).sorted(), forKey: syncedIdentifiersKey)
    }

    private static func date(_ date: Date, applyingTimeFrom time: Date) -> Date {
        let calendar = Calendar.current
        var components = calendar.dateComponents([.year, .month, .day], from: date)
        let timeComponents = calendar.dateComponents([.hour, .minute, .second], from: time)
        components.hour = timeComponents.hour
        components.minute = timeComponents.minute
        components.second = timeComponents.second
        return calendar.date(from: components) ?? date
    }

    private static func syncIdentifier(kind: String, title: String, entryDate: Date) -> String {
        let normalizedTitle = title
            .lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
        let day = Calendar.current.startOfDay(for: entryDate)
        return "com.benjaminbenz.fwbcoach.\(kind).\(Int(day.timeIntervalSince1970)).\(normalizedTitle)"
    }

    private static func cardioMapping(
        for value: String
    ) -> (activityType: HKWorkoutActivityType, distanceType: HKQuantityTypeIdentifier?) {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalized.contains("walk") {
            return (.walking, .distanceWalkingRunning)
        }
        if normalized.contains("run") || normalized.contains("jog") {
            return (.running, .distanceWalkingRunning)
        }
        if normalized.contains("bike") || normalized.contains("cycl") {
            return (.cycling, .distanceCycling)
        }
        if normalized.contains("elliptical") {
            return (.elliptical, nil)
        }
        if normalized.contains("stair") {
            return (.stairClimbing, nil)
        }
        if normalized.contains("row") {
            return (.rowing, nil)
        }
        if normalized.contains("swim") {
            return (.swimming, .distanceSwimming)
        }
        return (.mixedCardio, nil)
    }

    private static func positiveValue(_ value: Double?) -> Double? {
        guard let value, value > 0 else { return nil }
        return value
    }
}
