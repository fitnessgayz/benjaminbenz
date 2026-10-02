import Supabase
import XCTest
@testable import FWBCoach

@MainActor
final class ClientStatsTests: XCTestCase {
    func testMeasurementEntryDecodesNullTapeMeasurementsAsMissingValues() throws {
        let entry = try decodeEntry(
            measurements: #"{"chest":null,"waist":31.5,"hips":null,"arm":null,"thigh":null}"#
        )

        XCTAssertEqual(entry.measurements, ["waist": 31.5])
        XCTAssertEqual(entry.bodyweight, 160)
    }

    func testMeasurementEntryStillRejectsMalformedMeasurementValues() {
        XCTAssertThrowsError(
            try decodeEntry(measurements: #"{"waist":"thirty one"}"#)
        )
    }

    private let webMeasurementFixture = #"{"waist":31.5,"chest":40,"arm":null,"bodyspec":{"source":"dexa","regions":[{"name":"total","lean_mass":120.5}],"reviewed":true,"note":null},"report_labels":["imported"],"import_version":"v1"}"#

    func testWebDEXAMetadataDecodesAlongsideNumericAndNullMeasurements() throws {
        let entry = try decodeEntry(measurements: webMeasurementFixture)

        XCTAssertEqual(entry.measurements, ["waist": 31.5, "chest": 40])
        XCTAssertEqual(entry.measurementValues["bodyspec"]?.objectValue?["source"], .string("dexa"))
        XCTAssertEqual(entry.measurementValues["bodyspec"]?.objectValue?["reviewed"], .bool(true))
        XCTAssertEqual(entry.measurementValues["arm"], .null)
        XCTAssertEqual(entry.measurementValues["report_labels"], .array([.string("imported")]))
        XCTAssertEqual(entry.measurementValues["import_version"], .string("v1"))
    }

    func testStatsLoadAcceptsWebDEXARecord() async throws {
        let entry = try decodeEntry(measurements: webMeasurementFixture)
        let store = makeStore(measurementLoader: { _ in [entry] })

        await store.reload(email: "client@example.com")

        XCTAssertEqual(store.state, .loaded)
        XCTAssertEqual(store.measurements.first?.measurements["waist"], 31.5)
        XCTAssertNil(store.message)
    }

    func testBothSavePayloadsPreserveNestedMetadataAndUneditedValues() throws {
        let existing = try decodeEntry(measurements: webMeasurementFixture)
        let mutation = PendingMeasurementMutation(
            clientEmail: "client@example.com", entryDate: existing.entryDate,
            bodyweight: 165, bodyfat: nil, muscleMass: nil,
            measurements: ["waist": 32.5], goalNote: "",
            expectedRemoteUpdatedAt: existing.updatedAt
        )
        // An offline mutation from an older app version still has a flat numeric
        // dictionary. Replaying it must merge the latest server's full JSON.
        let restored = try JSONDecoder().decode(
            PendingMeasurementMutation.self, from: JSONEncoder().encode(mutation)
        )
        let payloads = [
            try JSONEncoder().encode(ClientMeasurementSyncPayload(restored, preserving: existing)),
            try JSONEncoder().encode(ClientMeasurementPayload(restored, preserving: existing))
        ]

        for data in payloads {
            let payload = try JSONDecoder().decode([String: AnyJSON].self, from: data)
            let values = try XCTUnwrap(payload["measurements"]?.objectValue)
            XCTAssertEqual(values["waist"], .double(32.5))
            XCTAssertEqual(values["chest"], .integer(40))
            XCTAssertEqual(values["arm"], .null)
            XCTAssertEqual(values["bodyspec"], existing.measurementValues["bodyspec"])
            XCTAssertEqual(values["report_labels"], existing.measurementValues["report_labels"])
            XCTAssertEqual(values["import_version"], .string("v1"))
        }
    }

    func testSavingOlderDateFetchesItsMetadataAndPreservesItInTheRequest() async throws {
        let transport = StatsMeasurementHTTPStub()
        StatsMeasurementURLProtocol.transport = transport
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StatsMeasurementURLProtocol.self]
        let session = URLSession(configuration: configuration)
        defer {
            session.invalidateAndCancel()
            StatsMeasurementURLProtocol.transport = nil
        }
        let client = SupabaseClient(
            supabaseURL: URL(string: "https://stats-tests.example.com")!, supabaseKey: "test-key",
            options: .init(
                auth: .init(storage: StatsEmptyAuthStorage(), autoRefreshToken: false, accessToken: { nil }),
                global: .init(session: session)
            )
        )
        let store = ClientStatsStore(client: client, photoLoader: { _ in [] }, retriesPendingMeasurements: false)
        let saved = await store.saveMeasurement(email: "client@example.com", draft: .init(
            entryDate: try XCTUnwrap(ClientStatsStore.apiDateFormatter.date(from: "2020-01-01")),
            bodyweight: 165, bodyfat: nil, muscleMass: nil, chest: nil, waist: 32.5,
            hips: nil, arm: nil, thigh: nil, note: ""
        ))

        XCTAssertTrue(saved)
        XCTAssertEqual(transport.readDateFilter, "eq.2020-01-01")
        let values = try XCTUnwrap(transport.savedValues)
        XCTAssertEqual(values["waist"], .double(32.5))
        XCTAssertEqual(values["bodyspec"], .object(["report_version": .string("synthetic-v1")]))
        XCTAssertEqual(store.measurements.first?.measurementValues["bodyspec"], values["bodyspec"])
    }

    func testNewRecordPayloadDoesNotRequireWebMetadata() throws {
        let mutation = PendingMeasurementMutation(
            clientEmail: "client@example.com", entryDate: "2026-09-25",
            bodyweight: 165, bodyfat: nil, muscleMass: nil,
            measurements: ["waist": 32.5], goalNote: "", expectedRemoteUpdatedAt: nil
        )
        let payload = ClientMeasurementSyncPayload(mutation, preserving: nil)
        XCTAssertEqual(payload.measurements, ["waist": .double(32.5)])
    }

    func testOfflineDisplayRetainsMetadataFromExistingMeasurement() throws {
        let existing = try decodeEntry(measurements: webMeasurementFixture)
        let mutation = PendingMeasurementMutation(
            clientEmail: "client@example.com", entryDate: existing.entryDate,
            bodyweight: 165, bodyfat: nil, muscleMass: nil,
            measurements: ["waist": 32.5], goalNote: "", expectedRemoteUpdatedAt: existing.updatedAt
        )
        let local = ClientMeasurementEntry(id: existing.id, mutation: mutation, preserving: existing)
        XCTAssertEqual(local.measurementValues["bodyspec"], existing.measurementValues["bodyspec"])
        XCTAssertEqual(local.measurements["waist"], 32.5)
    }

    func testKnownTapeMeasurementStillRejectsNestedObject() {
        XCTAssertThrowsError(try decodeEntry(measurements: #"{"waist":{"value":31.5}}"#))
    }

    func testDatabaseDateDisplaysOnTheSameCalendarDay() throws {
        let date = try XCTUnwrap(ClientStatsStore.apiDateFormatter.date(from: "2026-09-03"))
        let components = Calendar.autoupdatingCurrent.dateComponents([.year, .month, .day], from: date)

        XCTAssertEqual(ClientStatsStore.apiDateFormatter.string(from: date), "2026-09-03")
        XCTAssertEqual(components.year, 2026)
        XCTAssertEqual(components.month, 9)
        XCTAssertEqual(components.day, 3)
    }

    func testReloadMovesThroughLoadingToTheTrueEmptyState() async {
        let store = makeStore(
            measurementLoader: { _ in
                try await Task.sleep(for: .milliseconds(100))
                return []
            }
        )

        let reload = Task { await store.reload(email: "client@example.com") }
        await Task.yield()
        XCTAssertEqual(store.state, .loading)

        await reload.value
        XCTAssertEqual(store.state, .loaded)
        XCTAssertTrue(store.measurements.isEmpty)
        XCTAssertTrue(store.photos.isEmpty)
        XCTAssertNil(store.photoLoadError)
    }

    func testOfflineLoadGetsAnOfflineState() async {
        let store = makeStore(
            measurementLoader: { _ in throw URLError(.notConnectedToInternet) }
        )

        await store.reload(email: "client@example.com")

        guard case .offline(let message) = store.state else {
            return XCTFail("Expected an offline state, got \(store.state)")
        }
        XCTAssertTrue(message.contains("offline"))
    }

    func testBackendFailureRemainsAnErrorInsteadOfLookingEmptyOrOffline() async {
        let store = makeStore(
            measurementLoader: { _ in
                throw NSError(domain: "PostgrestError", code: 500)
            }
        )

        await store.reload(email: "client@example.com")

        guard case .failed(let message) = store.state else {
            return XCTFail("Expected a backend failure state, got \(store.state)")
        }
        XCTAssertTrue(message.contains("could not be loaded"))
    }

    func testPhotoFailureDoesNotHideLoadedMeasurementsOrPretendPhotosAreEmpty() async throws {
        let existing = try decodeEntry(measurements: #"{"waist":31.5}"#)
        let store = makeStore(
            measurementLoader: { _ in [existing] },
            photoLoader: { _ in throw NSError(domain: "PostgrestError", code: 503) }
        )

        await store.reload(email: "client@example.com")

        XCTAssertEqual(store.state, .loaded)
        XCTAssertEqual(store.measurements, [existing])
        XCTAssertTrue(store.photos.isEmpty)
        XCTAssertEqual(store.photoLoadError, "Progress photos could not be loaded. Try again.")
    }

    func testSavingMeasurementMakesItImmediatelyVisible() async throws {
        let saved = try decodeEntry(
            entryDate: "2026-09-03",
            bodyweight: 165,
            measurements: #"{"waist":31.5}"#
        )
        var synchronizedMutation: PendingMeasurementMutation?
        let store = makeStore(
            measurementSynchronizer: { mutation in
                synchronizedMutation = mutation
                return saved
            }
        )
        await store.reload(email: "client@example.com")

        let didSave = await store.saveMeasurement(
            email: " Client@Example.com ",
            draft: ClientMeasurementDraft(
                entryDate: try XCTUnwrap(ClientStatsStore.apiDateFormatter.date(from: "2026-09-03")),
                bodyweight: 165,
                bodyfat: nil,
                muscleMass: nil,
                chest: nil,
                waist: 31.5,
                hips: nil,
                arm: nil,
                thigh: nil,
                note: ""
            )
        )

        XCTAssertTrue(didSave)
        XCTAssertEqual(synchronizedMutation?.clientEmail, "client@example.com")
        XCTAssertEqual(synchronizedMutation?.measurements, ["waist": 31.5])
        XCTAssertEqual(store.measurements, [saved])
        XCTAssertEqual(store.message, "Measurements saved.")
    }

    func testConnectivityClassifierFollowsUnderlyingErrors() {
        let wrapped = NSError(
            domain: "NetworkClient",
            code: 1,
            userInfo: [NSUnderlyingErrorKey: URLError(.networkConnectionLost)]
        )

        XCTAssertTrue(ClientStatsErrorClassifier.isConnectivityFailure(wrapped))
        XCTAssertFalse(
            ClientStatsErrorClassifier.isConnectivityFailure(
                NSError(domain: "PostgrestError", code: 401)
            )
        )
    }

    private func makeStore(
        measurementLoader: @escaping (String) async throws -> [ClientMeasurementEntry] = { _ in [] },
        photoLoader: @escaping (String) async throws -> [ClientProgressPhotoRecord] = { _ in [] },
        measurementSynchronizer: ((PendingMeasurementMutation) async throws -> ClientMeasurementEntry?)? = nil
    ) -> ClientStatsStore {
        ClientStatsStore(
            measurementLoader: measurementLoader,
            photoLoader: photoLoader,
            signedPhotoURLLoader: { _ in URL(string: "https://example.com/photo.jpg")! },
            measurementSynchronizer: measurementSynchronizer,
            retriesPendingMeasurements: false
        )
    }

    private func decodeEntry(
        entryDate: String = "2026-08-25",
        bodyweight: Double = 160,
        measurements: String
    ) throws -> ClientMeasurementEntry {
        let json = """
        {
          "id": "ba2146f1-eb5e-41ae-9c38-131d5a4f55cc",
          "client_email": "client@example.com",
          "entry_date": "\(entryDate)",
          "bodyweight": \(bodyweight),
          "bodyfat": 12,
          "muscle_mass": null,
          "measurements": \(measurements),
          "goal_note": "",
          "source": "website",
          "source_version": 1,
          "updated_at": "2026-09-03T20:00:00Z"
        }
        """
        return try JSONDecoder().decode(ClientMeasurementEntry.self, from: Data(json.utf8))
    }
}

private struct StatsEmptyAuthStorage: AuthLocalStorage {
    func store(key: String, value: Data) throws {}
    func retrieve(key: String) throws -> Data? { nil }
    func remove(key: String) throws {}
}

private final class StatsMeasurementHTTPStub: @unchecked Sendable {
    private let lock = NSLock()
    private var dateFilter: String?
    private var values: [String: AnyJSON]?
    var readDateFilter: String? { lock.withLock { dateFilter } }
    var savedValues: [String: AnyJSON]? { lock.withLock { values } }

    func response(to request: URLRequest) throws -> Data {
        try lock.withLock {
            let record = #"{"id":"ba2146f1-eb5e-41ae-9c38-131d5a4f55cc","client_email":"client@example.com","entry_date":"2020-01-01","bodyweight":165,"measurements":{"waist":31.5,"bodyspec":{"report_version":"synthetic-v1"}},"updated_at":"2020-01-01T20:00:00Z"}"#
            if request.httpMethod == "GET" {
                dateFilter = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?
                    .queryItems?.first(where: { $0.name == "entry_date" })?.value
                // A broad latest-records query cannot return this older entry.
                return Data((dateFilter == "eq.2020-01-01" ? "[" + record + "]" : "[]").utf8)
            }
            var data = request.httpBody ?? Data()
            if let stream = request.httpBodyStream {
                stream.open()
                defer { stream.close() }
                var buffer = [UInt8](repeating: 0, count: 4096)
                while stream.hasBytesAvailable {
                    let count = stream.read(&buffer, maxLength: buffer.count)
                    if count <= 0 { break }
                    data.append(contentsOf: buffer.prefix(count))
                }
            }
            let payload = try JSONDecoder().decode([String: AnyJSON].self, from: data)
            values = payload["measurements"]?.objectValue
            var saved = try JSONDecoder().decode([String: AnyJSON].self, from: Data(record.utf8))
            saved["measurements"] = payload["measurements"]
            return try JSONEncoder().encode(saved)
        }
    }
}

private final class StatsMeasurementURLProtocol: URLProtocol {
    nonisolated(unsafe) static var transport: StatsMeasurementHTTPStub?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            guard let transport = Self.transport else { throw URLError(.cancelled) }
            let data = try transport.response(to: request)
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil,
                                           headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }
    override func stopLoading() {}
}
