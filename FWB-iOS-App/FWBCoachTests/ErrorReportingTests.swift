import XCTest
import Sentry
@testable import FWBCoach

final class ErrorReportingTests: XCTestCase {
    private let info: [String: Any] = [
        "SentryDSN": "https://public-key@o0.ingest.sentry.io/1234",
        "SentryEnvironment": "testflight",
        "CFBundleIdentifier": "com.benjaminbenz.fwbcoach",
        "CFBundleShortVersionString": "1.2",
        "CFBundleVersion": "42"
    ]

    func testReleaseConfigurationUsesBundleVersionAndBuild() throws {
        let config = try XCTUnwrap(ErrorReporting.Configuration.make(
            info: info, arguments: [], environment: [:], isDebug: false
        ))
        XCTAssertEqual(config.environment, "testflight")
        XCTAssertEqual(config.release, "com.benjaminbenz.fwbcoach@1.2+42")
        XCTAssertEqual(config.distribution, "42")
    }

    func testMissingUnexpandedAndUnsafeDSNsDisableReporting() {
        for dsn in ["", "$(SENTRY_DSN)", "https://example.com/1", "http://key@example.com/1",
                    "https://key:secret@example.com/1", "https://key@example.com/1?token=secret"] {
            var values = info
            values["SentryDSN"] = dsn
            XCTAssertNil(ErrorReporting.Configuration.make(
                info: values, arguments: [], environment: [:], isDebug: false
            ), dsn)
        }
    }

    func testDebugRequiresExplicitOptInAndAuditAlwaysStaysDisabled() {
        XCTAssertNil(ErrorReporting.Configuration.make(info: info, arguments: [], environment: [:], isDebug: true))
        XCTAssertNotNil(ErrorReporting.Configuration.make(
            info: info, arguments: [], environment: ["SENTRY_ENABLE_DEBUG": "1"], isDebug: true
        ))
        for arguments in [["--ui-audit"], ["--audit-tab=workouts"], ["--client-stats-smoke"]] {
            XCTAssertNil(ErrorReporting.Configuration.make(
                info: info, arguments: arguments, environment: ["SENTRY_ENABLE_DEBUG": "1"], isDebug: false
            ))
        }
    }

    func testUnitTestsAndPreviewsNeverSendTelemetry() {
        for environment in [["XCTestConfigurationFilePath": "test.xctestconfiguration"],
                            ["XCTestBundlePath": "Tests.xctest"],
                            ["XCODE_RUNNING_FOR_PREVIEWS": "1"], ["CLIENT_STATS_SMOKE": "1"]] {
            XCTAssertNil(ErrorReporting.Configuration.make(info: info, arguments: [], environment: environment, isDebug: false))
        }
    }

    func testExpectedOfflineAndCancellationAreIgnored() {
        XCTAssertNil(ErrorReporting.failureCategory(CancellationError()))
        for code in [URLError.cancelled, .notConnectedToInternet, .networkConnectionLost, .timedOut] {
            XCTAssertNil(ErrorReporting.failureCategory(URLError(code)))
        }
        XCTAssertEqual(ErrorReporting.failureCategory(URLError(.serverCertificateUntrusted)), .network)
        XCTAssertEqual(ErrorReporting.failureCategory(NSError(domain: NSCocoaErrorDomain, code: NSFileWriteOutOfSpaceError)), .storage)
        XCTAssertEqual(ErrorReporting.failureCategory(DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "private response"))), .decoding)
    }

    func testPrivacyOptionsDisableContentCapture() throws {
        let config = try XCTUnwrap(ErrorReporting.Configuration.make(info: info, arguments: [], environment: [:], isDebug: false))
        let options = Options()
        ErrorReporting.configure(options, with: config)
        XCTAssertFalse(options.sendDefaultPii)
        XCTAssertFalse(options.enableMemoryIntrospection)
        XCTAssertFalse(options.enableAutoBreadcrumbTracking)
        XCTAssertFalse(options.enableNetworkBreadcrumbs)
        XCTAssertFalse(options.enableCaptureFailedRequests)
        XCTAssertFalse(options.enableSwizzling)
        XCTAssertFalse(options.enableAutoSessionTracking)
        XCTAssertFalse(options.enableAutoPerformanceTracing)
        XCTAssertFalse(options.attachScreenshot)
        XCTAssertFalse(options.attachViewHierarchy)
        XCTAssertEqual(options.sessionReplay.sessionSampleRate, 0)
        XCTAssertEqual(options.sessionReplay.onErrorSampleRate, 0)
        XCTAssertFalse(options.sessionReplay.networkCaptureBodies)
        XCTAssertTrue(options.tracePropagationTargets.isEmpty)
        XCTAssertEqual(options.tracesSampleRate, 0)
        XCTAssertNotNil(options.beforeSendWithHint)
        XCTAssertNotNil(options.beforeSendLog)
        XCTAssertNotNil(options.beforeSendMetric)
    }

    func testSanitizerRemovesPrivatePayloadsButKeepsSymbolication() throws {
        let secret = "private-person@example.com private-token private-workout"
        let event = ErrorReporting.makeEvent(operation: .saveWorkoutSets, category: .unexpected)
        event.user = User(userId: secret)
        event.extra = ["request_body": secret]
        event.tags?["email"] = secret
        event.message = SentryMessage(formatted: secret)
        event.context = ["health": ["notes": secret], "device": ["name": secret, "model": "iPhone"],
                         "app": ["app_build": "42", "device_app_hash": secret]]
        event.request = SentryRequest()
        event.request?.url = "https://example.com/?token=private-token"
        event.breadcrumbs = [Breadcrumb(level: .error, category: secret)]
        let exception = Exception(value: secret, type: "NSInvalidArgumentException")
        exception.mechanism = Mechanism(type: "nsexception")
        exception.mechanism?.data = ["payload": secret]
        let frame = Frame()
        frame.instructionAddress = "0x1000"
        frame.imageAddress = "0x900"
        frame.vars = ["payload": secret]
        frame.contextLine = secret
        frame.fileName = "/private/person/Source.swift"
        exception.stacktrace = SentryStacktrace(frames: [frame], registers: [:])
        event.exceptions = [exception]
        let image = DebugMeta()
        image.debugID = "00000000-0000-0000-0000-000000000001"
        image.codeFile = "/private/person/FWBCoach"
        event.debugMeta = [image]

        let sanitized = try XCTUnwrap(ErrorReporting.sanitize(event))
        let json = try JSONSerialization.data(withJSONObject: sanitized.serialize(), options: [.sortedKeys])
        let payload = try XCTUnwrap(String(data: json, encoding: .utf8))
        XCTAssertFalse(payload.contains("private-person"))
        XCTAssertFalse(payload.contains("private-token"))
        XCTAssertFalse(payload.contains("private-workout"))
        XCTAssertFalse(payload.contains("/private/person"))
        XCTAssertNil(sanitized.user)
        XCTAssertNil(sanitized.request)
        XCTAssertNil(sanitized.extra)
        XCTAssertNil(sanitized.breadcrumbs)
        XCTAssertEqual(sanitized.tags, ["operation": "workout_sets.save", "failure_category": "unexpected"])
        XCTAssertEqual(sanitized.exceptions?.first?.stacktrace?.frames.first?.instructionAddress, "0x1000")
        XCTAssertEqual(sanitized.debugMeta?.first?.debugID, image.debugID)
    }

    func testSanitizerDropsNonErrorEvents() {
        let event = Event()
        event.type = "transaction"
        XCTAssertNil(ErrorReporting.sanitize(event))
    }
}
