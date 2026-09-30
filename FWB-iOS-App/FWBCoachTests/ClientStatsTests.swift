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
