import Foundation
import HealthKit

@MainActor
protocol AppleHealthImportReading {
    var isAvailable: Bool { get }
    func requestAccess(to categories: Set<AppleHealthImportCategory>) async throws
    func read(categories: Set<AppleHealthImportCategory>, now: Date) async throws -> AppleHealthImportSnapshot
    func setBackgroundWorkoutDelivery(enabled: Bool) async throws
    func observe(categories: Set<AppleHealthImportCategory>, changed: @escaping @MainActor () async -> Void)
    func stopObserving()
}

extension AppleHealthImportReading {
    func setBackgroundWorkoutDelivery(enabled: Bool) async throws {}
}

enum AppleHealthImportError: Error { case unavailable, tooManySamples, wrongAccount, invalidSelection, backgroundDeliveryFailed }

/// Finishes every HealthKit delivery once, including cancellation and a stalled sync.
/// Pending sync state belongs to the store so a timed-out delivery can retry later.
@MainActor
final class AppleHealthObserverDelivery {
    private var completion: (() -> Void)?
    private let timeoutNanoseconds: UInt64
    private var processingTask: Task<Void, Never>?
    private var timeoutTask: Task<Void, Never>?

    init(timeoutNanoseconds: UInt64 = 20_000_000_000, completion: @escaping () -> Void) {
        self.timeoutNanoseconds = timeoutNanoseconds
        self.completion = completion
    }

    func start(operation: @escaping @MainActor () async -> Void) {
        guard completion != nil, processingTask == nil else { return }
        processingTask = Task { @MainActor in
            defer { self.finish() }
            guard !Task.isCancelled else { return }
            await operation()
        }
        timeoutTask = Task { @MainActor [timeoutNanoseconds] in
            do { try await Task.sleep(nanoseconds: timeoutNanoseconds) }
            catch { return }
            self.cancel()
        }
    }

    func cancel() {
        processingTask?.cancel()
        finish()
    }

    private func finish() {
        guard let completion else { return }
        self.completion = nil
        timeoutTask?.cancel()
        timeoutTask = nil
        processingTask = nil
        completion()
    }
}

/// HealthKit never reveals read authorization status. An empty result means either
/// no readable samples or permission was withheld; neither is rendered as zero.
@MainActor
final class AppleHealthImportReader: AppleHealthImportReading {
    private let healthStore: HKHealthStore
    private var observers: [HKObserverQuery] = []
    private var observationGeneration = UUID()
    private var deliveries: [UUID: AppleHealthObserverDelivery] = [:]
    private var backgroundDeliveryTask: Task<Void, Error>?
    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }
    init(healthStore: HKHealthStore = HKHealthStore()) { self.healthStore = healthStore }

    func requestAccess(to categories: Set<AppleHealthImportCategory>) async throws {
        guard isAvailable else { throw AppleHealthImportError.unavailable }
        try await healthStore.requestAuthorization(toShare: [], read: Set(types(for: categories)))
    }

    func read(categories: Set<AppleHealthImportCategory>, now: Date) async throws -> AppleHealthImportSnapshot {
        guard isAvailable else { throw AppleHealthImportError.unavailable }
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: now)
        let since = calendar.date(byAdding: .day, value: -29, to: today)!
        var snapshot = AppleHealthImportSnapshot(since: since)
        var days: [String: AppleHealthDailySummary] = [:]
        for offset in 0..<30 {
            let date = AppleHealthImportRules.day(calendar.date(byAdding: .day, value: offset, to: since)!)
            days[date] = AppleHealthDailySummary(date: date)
        }

        if categories.contains(.workouts) {
            let samples = try await samples(type: .workoutType(), since: since, until: now, limit: 1_001)
            snapshot.workouts = samples.compactMap { $0 as? HKWorkout }.filter {
                !AppleHealthImportRules.isFWBWorkout(bundleIdentifier: $0.sourceRevision.source.bundleIdentifier,
                    syncIdentifier: $0.metadata?[HKMetadataKeySyncIdentifier] as? String)
            }.compactMap { workout in
                guard workout.endDate <= now, workout.endDate >= workout.startDate else { return nil }
                guard let duration = AppleHealthImportRules.valid(workout.duration, in: 1...604_800) else { return nil }
                let hr = HKQuantityType(.heartRate)
                let energy = HKQuantityType(.activeEnergyBurned)
                return AppleHealthImportedWorkout(
                    healthkitID: workout.uuid, activityType: Self.name(workout.workoutActivityType),
                    startedAt: workout.startDate, endedAt: workout.endDate, durationSeconds: duration,
                    activeCalories: AppleHealthImportRules.valid(workout.statistics(for: energy)?.sumQuantity()?.doubleValue(for: .kilocalorie()), in: 0...100_000),
                    distanceMeters: AppleHealthImportRules.valid(workout.totalDistance?.doubleValue(for: .meter()), in: 0...2_000_000),
                    averageHeartRate: AppleHealthImportRules.valid(workout.statistics(for: hr)?.averageQuantity()?.doubleValue(for: .count().unitDivided(by: .minute())), in: 20...300),
                    sourceName: String(workout.sourceRevision.source.name.prefix(200)))
            }
        }
        try Task.checkCancellation()
        if categories.contains(.activity) {
            let values = try await dailyStatistics(.stepCount, unit: .count(), options: .cumulativeSum, since: since, until: now)
            for (day, value) in values { days[day]?.steps = AppleHealthImportRules.valid(value, in: 0...200_000) }
        }
        if categories.contains(.recovery) {
            let heart = try await dailyStatistics(.restingHeartRate, unit: .count().unitDivided(by: .minute()), options: .discreteAverage, since: since, until: now)
            for (day, value) in heart { days[day]?.restingHeartRate = AppleHealthImportRules.valid(value, in: 20...300) }
            let hrv = try await dailyStatistics(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli), options: .discreteAverage, since: since, until: now)
            for (day, value) in hrv { days[day]?.hrvMS = AppleHealthImportRules.valid(value, in: 0...2_000) }
            let sleep = try await samples(type: HKCategoryType(.sleepAnalysis), since: since, until: now, limit: 20_001, strictStart: false)
                .compactMap { $0 as? HKCategorySample }
                .filter { [HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                           HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                           HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                           HKCategoryValueSleepAnalysis.asleepREM.rawValue].contains($0.value) }
                .map { DateInterval(start: $0.startDate, end: $0.endDate) }
            for offset in 0..<30 {
                let start = calendar.date(byAdding: .day, value: offset, to: since)!
                let end = min(calendar.date(byAdding: .day, value: 1, to: start)!, now)
                days[AppleHealthImportRules.day(start)]?.sleepMinutes = AppleHealthImportRules.minutesInUnion(sleep, clippedTo: DateInterval(start: start, end: end))
            }
        }
        if categories.contains(.bodyWeight) {
            let weights = try await samples(type: HKQuantityType(.bodyMass), since: since, until: now, limit: 1_001)
                .compactMap { $0 as? HKQuantitySample }.sorted { $0.endDate > $1.endDate }
            for weight in weights {
                let day = AppleHealthImportRules.day(weight.endDate)
                guard days[day]?.bodyWeightKG == nil,
                      let value = AppleHealthImportRules.valid(weight.quantity.doubleValue(for: .gramUnit(with: .kilo)), in: 1...700) else { continue }
                days[day]?.bodyWeightKG = value
                days[day]?.bodyWeightSampleID = weight.uuid
            }
        }
        try Task.checkCancellation()
        snapshot.daily = days.values.filter(\.hasData).sorted { $0.date > $1.date }
        return snapshot
    }

    func setBackgroundWorkoutDelivery(enabled: Bool) async throws {
        guard isAvailable else {
            if enabled { throw AppleHealthImportError.unavailable }
            return
        }
        let previous = backgroundDeliveryTask
        // HealthKit registration is asynchronous. Queue changes so a slow enable
        // cannot finish after the disable requested by disconnect or sign-out.
        let operation = Task { @MainActor [healthStore] in
            if let previous { _ = await previous.result }
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                let completion: @Sendable (Bool, Error?) -> Void = { success, error in
                    if let error { continuation.resume(throwing: error) }
                    else if success { continuation.resume() }
                    else { continuation.resume(throwing: AppleHealthImportError.backgroundDeliveryFailed) }
                }
                if enabled {
                    healthStore.enableBackgroundDelivery(for: HKWorkoutType.workoutType(), frequency: .immediate, withCompletion: completion)
                } else {
                    healthStore.disableBackgroundDelivery(for: HKWorkoutType.workoutType(), withCompletion: completion)
                }
            }
        }
        backgroundDeliveryTask = operation
        try await operation.value
    }

    func observe(categories: Set<AppleHealthImportCategory>, changed: @escaping @MainActor () async -> Void) {
        stopObserving()
        guard isAvailable else { return }
        let generation = observationGeneration
        for type in types(for: categories) {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completion, error in
                guard error == nil else { completion(); return }
                Task { @MainActor [weak self] in
                    guard let self, self.observationGeneration == generation else { completion(); return }
                    let deliveryID = UUID()
                    let delivery = AppleHealthObserverDelivery { [weak self] in
                        self?.deliveries.removeValue(forKey: deliveryID)
                        completion()
                    }
                    self.deliveries[deliveryID] = delivery
                    delivery.start { [weak self] in
                        guard self?.observationGeneration == generation, !Task.isCancelled else { return }
                        await changed()
                    }
                }
            }
            observers.append(query)
            healthStore.execute(query)
        }
    }
    func stopObserving() {
        observationGeneration = UUID()
        observers.forEach(healthStore.stop)
        observers.removeAll()
        let pendingDeliveries = Array(deliveries.values)
        deliveries.removeAll()
        pendingDeliveries.forEach { $0.cancel() }
    }

    private func types(for categories: Set<AppleHealthImportCategory>) -> [HKSampleType] {
        var result: [HKSampleType] = []
        if categories.contains(.workouts) { result += [.workoutType(), HKQuantityType(.heartRate), HKQuantityType(.activeEnergyBurned), HKQuantityType(.distanceWalkingRunning), HKQuantityType(.distanceCycling), HKQuantityType(.distanceSwimming)] }
        if categories.contains(.activity) { result.append(HKQuantityType(.stepCount)) }
        if categories.contains(.recovery) { result += [HKCategoryType(.sleepAnalysis), HKQuantityType(.restingHeartRate), HKQuantityType(.heartRateVariabilitySDNN)] }
        if categories.contains(.bodyWeight) { result.append(HKQuantityType(.bodyMass)) }
        return result
    }

    private func samples(type: HKSampleType, since: Date, until: Date, limit: Int, strictStart: Bool = true) async throws -> [HKSample] {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type,
                predicate: HKQuery.predicateForSamples(withStart: since, end: until, options: strictStart ? [.strictStartDate] : []),
                limit: limit, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)]) { _, samples, error in
                    if let error { continuation.resume(throwing: error) }
                    else if (samples?.count ?? 0) >= limit { continuation.resume(throwing: AppleHealthImportError.tooManySamples) }
                    else { continuation.resume(returning: samples ?? []) }
                }
            healthStore.execute(query)
        }
    }

    private func dailyStatistics(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, options: HKStatisticsOptions, since: Date, until: Date) async throws -> [String: Double] {
        let statistics: [Date: Double] = try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsCollectionQuery(quantityType: HKQuantityType(identifier), quantitySamplePredicate:
                HKQuery.predicateForSamples(withStart: since, end: until), options: options,
                anchorDate: Calendar.current.startOfDay(for: since), intervalComponents: DateComponents(day: 1))
            query.initialResultsHandler = { _, collection, error in
                if let error { continuation.resume(throwing: error); return }
                var result: [Date: Double] = [:]
                collection?.enumerateStatistics(from: since, to: until) { item, _ in
                    let quantity = options == .cumulativeSum ? item.sumQuantity() : item.averageQuantity()
                    if let quantity { result[item.startDate] = quantity.doubleValue(for: unit) }
                }
                continuation.resume(returning: result)
            }
            healthStore.execute(query)
        }
        return Dictionary(uniqueKeysWithValues: statistics.map { (AppleHealthImportRules.day($0.key), $0.value) })
    }

    private static func name(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: "Running"
        case .walking: "Walking"
        case .cycling: "Cycling"
        case .swimming: "Swimming"
        case .traditionalStrengthTraining: "Strength training"
        case .functionalStrengthTraining: "Functional strength"
        case .highIntensityIntervalTraining: "HIIT"
        case .rowing: "Rowing"
        case .elliptical: "Elliptical"
        case .stairClimbing: "Stair climbing"
        case .yoga: "Yoga"
        case .pilates: "Pilates"
        case .hiking: "Hiking"
        case .dance, .cardioDance: "Dance"
        default: "Apple Health workout"
        }
    }
}
