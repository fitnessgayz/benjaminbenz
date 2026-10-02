import Foundation
import Sentry

/// Only fixed operation codes enter telemetry. Never pass account, workout,
/// nutrition, questionnaire, HealthKit, photo, request, or backend error text to Sentry.
enum ErrorReporting {
    enum Operation: String, CaseIterable {
        case loadPrograms = "programs.load"
        case saveWorkoutLayout = "workout_layout.save"
        case saveNutritionLocally = "nutrition.local_save"
        case syncNutrition = "nutrition.sync"
        case loadWorkoutHistory = "workout_history.load"
        case deleteWorkoutHistory = "workout_history.delete"
        case loadWorkoutSets = "workout_sets.load"
        case saveWorkoutSets = "workout_sets.save"
        case loadClientStats = "stats.load"
        case saveClientMeasurement = "measurements.save"
        case saveClientMeasurementLocally = "measurements.local_save"
        case syncClientMeasurement = "measurements.sync"
        case loadProgressPhotos = "progress_photos.load"
        case signProgressPhotoURL = "progress_photos.sign_url"
        case uploadProgressPhoto = "progress_photos.upload"
        case loadDexaReports = "dexa.load"
        case uploadDexaReport = "dexa.upload"
        case extractDexaReport = "dexa.extract"
        case confirmDexaReport = "dexa.confirm"
        case updateDexaReport = "dexa.update"
        case signDexaReportURL = "dexa.sign_url"
        case integrationVerification = "integration.verification"
    }

    enum FailureCategory: String, CaseIterable {
        case decoding, storage, network, unexpected, verification
    }

    struct Configuration: Equatable {
        let dsn: String
        let environment: String
        let release: String
        let distribution: String

        static func make(
            info: [String: Any], arguments: [String], environment: [String: String], isDebug: Bool
        ) -> Configuration? {
            // Test hosts, previews and audit screenshots must never create real issues.
            guard environment["XCTestConfigurationFilePath"] == nil,
                  environment["XCTestBundlePath"] == nil,
                  environment["XCODE_RUNNING_FOR_PREVIEWS"] != "1",
                  environment["CLIENT_STATS_SMOKE"] != "1",
                  !arguments.contains(where: { $0 == "--ui-audit" || $0.contains("-audit") || $0 == "--client-stats-smoke" }),
                  !isDebug || environment["SENTRY_ENABLE_DEBUG"] == "1",
                  let dsn = validDSN(info["SentryDSN"] as? String) else { return nil }

            let configuredEnvironment = (info["SentryEnvironment"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            let deploymentEnvironment = ["production", "testflight", "development"].contains(configuredEnvironment ?? "")
                ? configuredEnvironment! : (isDebug ? "development" : "production")
            let bundleID = info["CFBundleIdentifier"] as? String ?? "com.benjaminbenz.fwbcoach"
            let version = info["CFBundleShortVersionString"] as? String ?? "unknown"
            let build = info["CFBundleVersion"] as? String ?? "unknown"
            return Configuration(dsn: dsn, environment: deploymentEnvironment,
                                 release: "\(bundleID)@\(version)+\(build)", distribution: build)
        }

        private static func validDSN(_ value: String?) -> String? {
            guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !value.isEmpty, !value.contains("$("),
                  let url = URLComponents(string: value), url.scheme == "https",
                  let host = url.host, !host.isEmpty,
                  let publicKey = url.user, !publicKey.isEmpty,
                  url.password == nil, url.query == nil, url.fragment == nil,
                  let project = url.path.split(separator: "/").last,
                  project.allSatisfy(\.isNumber) else { return nil }
            return value
        }
    }

    @MainActor private static var started = false
    @MainActor private static var lastReports: [String: Date] = [:]

    @MainActor static func start() {
        guard !started, NSClassFromString("XCTestCase") == nil else { return }
        #if DEBUG
        let isDebug = true
        #else
        let isDebug = false
        #endif
        let process = ProcessInfo.processInfo
        guard let configuration = Configuration.make(
            info: Bundle.main.infoDictionary ?? [:], arguments: process.arguments,
            environment: process.environment, isDebug: isDebug
        ) else { return }
        SentrySDK.start { configure($0, with: configuration) }
        started = true

        // Explicit local verification only. No intentional crash or sensitive test data.
        #if DEBUG
        if process.environment["SENTRY_SMOKE_TEST"] == "1" {
            SentrySDK.capture(event: makeEvent(operation: .integrationVerification, category: .verification))
        }
        #endif
    }

    static func configure(_ options: Options, with configuration: Configuration) {
        options.dsn = configuration.dsn
        options.environment = configuration.environment
        options.releaseName = configuration.release
        options.dist = configuration.distribution
        options.debug = false
        options.sendDefaultPii = false
        options.enableMemoryIntrospection = false
        options.enableAutoSessionTracking = false
        options.enableAutoBreadcrumbTracking = false
        options.enableNetworkBreadcrumbs = false
        options.maxBreadcrumbs = 0
        options.beforeBreadcrumb = { _ in nil }
        options.enableCaptureFailedRequests = false
        options.enableNetworkTracking = false
        options.enableSwizzling = false
        options.enableDataSwizzling = false
        options.enableFileIOTracing = false
        options.enableCoreDataTracing = false
        options.enableAutoPerformanceTracing = false
        options.enableUIViewControllerTracing = false
        options.enableUserInteractionTracing = false
        options.enableStandaloneAppStartTracing = false
        options.tracePropagationTargets = []
        options.tracesSampleRate = 0
        options.configureProfiling = nil
        options.beforeSendLog = { _ in nil }
        options.beforeSendMetric = { _ in nil }
        // Watchdog tracking shares this timeout even when AppHang reporting is
        // disabled. Keep the SDK's positive default to avoid a zero-delay loop.
        options.enableAppHangTracking = false
        options.enableMetricKit = false
        options.attachScreenshot = false
        options.attachViewHierarchy = false
        options.maxAttachmentSize = 0
        options.sessionReplay.sessionSampleRate = 0
        options.sessionReplay.onErrorSampleRate = 0
        options.sessionReplay.networkCaptureBodies = false
        options.sessionReplay.networkDetailAllowUrls = []
        options.sendClientReports = false
        options.beforeSendWithHint = { event, hint in
            hint.attachments = []
            return sanitize(event)
        }
    }

    @MainActor static func capture(_ error: Error, operation: Operation) {
        guard started, let category = failureCategory(error) else { return }
        // Autosave/reconnect loops should not overwhelm the same issue.
        let key = "\(operation.rawValue):\(category.rawValue)"
        let now = Date()
        guard now.timeIntervalSince(lastReports[key] ?? .distantPast) >= 60 else { return }
        lastReports[key] = now
        SentrySDK.capture(event: makeEvent(operation: operation, category: category))
    }

    static func failureCategory(_ error: Error) -> FailureCategory? {
        var current: Error? = error
        var visited: Set<ObjectIdentifier> = []
        var category: FailureCategory = .unexpected
        while let cause = current {
            if cause is CancellationError { return nil }
            let nsError = cause as NSError
            guard visited.insert(ObjectIdentifier(nsError)).inserted else { break }
            if nsError.domain == NSURLErrorDomain {
                // Storage/network clients can wrap the expected offline or cancelled task error.
                let expected = [NSURLErrorCancelled, NSURLErrorNotConnectedToInternet,
                                NSURLErrorNetworkConnectionLost, NSURLErrorTimedOut,
                                NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost,
                                NSURLErrorDNSLookupFailed, NSURLErrorInternationalRoamingOff,
                                NSURLErrorDataNotAllowed]
                return expected.contains(nsError.code) ? nil : .network
            }
            if cause is DecodingError { return .decoding }
            if nsError.domain == NSCocoaErrorDomain { category = .storage }
            current = nsError.userInfo[NSUnderlyingErrorKey] as? Error
        }
        return category
    }

    static func makeEvent(operation: Operation, category: FailureCategory) -> Event {
        let event = Event(level: .error)
        event.message = SentryMessage(formatted: "FWB app operation failed")
        event.tags = ["operation": operation.rawValue, "failure_category": category.rawValue]
        event.fingerprint = ["fwb-ios", operation.rawValue, category.rawValue]
        return event
    }

    /// Final allowlist applies to automatic crashes as well as handled errors.
    /// Keep stack addresses and build metadata for dSYM symbolication, never UI data.
    static func sanitize(_ event: Event) -> Event? {
        guard event.type == nil || event.type == "error" || event.type == "default" else { return nil }
        let operation = event.tags?["operation"].flatMap(Operation.init(rawValue:))
        let category = event.tags?["failure_category"].flatMap(FailureCategory.init(rawValue:))
        event.user = nil
        event.request = nil
        event.breadcrumbs = nil
        event.extra = nil
        event.error = nil
        event.transaction = nil
        event.serverName = nil
        event.logger = nil
        event.tags = nil
        event.fingerprint = nil
        event.message = nil
        if let operation, let category {
            event.message = SentryMessage(formatted: "FWB app operation failed")
            event.tags = ["operation": operation.rawValue, "failure_category": category.rawValue]
            event.fingerprint = ["fwb-ios", operation.rawValue, category.rawValue]
        }
        let allowedContextKeys: [String: Set<String>] = [
            "app": ["app_identifier", "app_version", "app_build"],
            "os": ["name", "version", "build", "kernel_version"],
            "device": ["family", "model", "model_id", "arch", "simulator", "memory_size"]
        ]
        event.context = event.context?.reduce(into: [:]) { result, item in
            guard let allowed = allowedContextKeys[item.key] else { return }
            result[item.key] = item.value.filter { allowed.contains($0.key) }
        }
        for exception in event.exceptions ?? [] {
            exception.value = "Exception details removed for privacy"
            exception.mechanism?.desc = nil
            exception.mechanism?.data = nil
            exception.mechanism?.helpLink = nil
            exception.mechanism?.meta?.error = nil
            scrubStacktrace(exception.stacktrace)
        }
        for thread in event.threads ?? [] {
            thread.name = nil
            scrubStacktrace(thread.stacktrace)
        }
        scrubStacktrace(event.stacktrace)
        for image in event.debugMeta ?? [] {
            image.codeFile = image.codeFile.map { URL(fileURLWithPath: $0).lastPathComponent }
        }
        return event
    }

    private static func scrubStacktrace(_ stacktrace: SentryStacktrace?) {
        for frame in stacktrace?.frames ?? [] {
            frame.vars = nil
            frame.contextLine = nil
            frame.preContext = nil
            frame.postContext = nil
            frame.fileName = frame.fileName.map { URL(fileURLWithPath: $0).lastPathComponent }
            frame.package = frame.package.map { URL(fileURLWithPath: $0).lastPathComponent }
        }
    }
}
