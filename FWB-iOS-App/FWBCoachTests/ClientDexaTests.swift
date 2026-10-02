import Supabase
import XCTest
@testable import FWBCoach

@MainActor
final class ClientDexaTests: XCTestCase {
    private let accountID = UUID(uuidString: "55555555-1111-2222-3333-444444444444")!
    private let reportID = UUID(uuidString: "aaaaaaaa-1111-2222-3333-444444444444")!
    private let today = ISO8601DateFormatter().date(from: "2026-09-25T12:00:00Z")!

    func testSupportedReportFilesKeepTheirBytesAndUseCanonicalAccountPaths() throws {
        let fixtures: [(String, String, Data, String)] = [
            ("application/pdf", "synthetic.pdf", Data("%PDF-1.7\nsynthetic test report".utf8), "pdf"),
            ("image/jpeg", "synthetic.jpeg", Data([0xff, 0xd8, 0xff, 0xe0, 0, 1]), "jpg"),
            ("image/png", "synthetic.png", Data([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), "png")
        ]
        for (mimeType, filename, data, suffix) in fixtures {
            let upload = try ClientDexaUpload(data: data, mimeType: mimeType, filename: filename).validated()
            XCTAssertEqual(upload.data, data)
            XCTAssertEqual(upload.storagePath(accountID: accountID, reportID: reportID),
                           "55555555-1111-2222-3333-444444444444/aaaaaaaa-1111-2222-3333-444444444444.\(suffix)")
        }
    }

    func testEmptyOversizedUnsupportedAndMislabeledFilesAreRejected() {
        var oversized = Data("%PDF-1.7\n".utf8)
        oversized.append(Data(repeating: 0, count: 10 * 1_024 * 1_024))
        for upload in [
            ClientDexaUpload(data: Data(), mimeType: "application/pdf", filename: "empty.pdf"),
            ClientDexaUpload(data: oversized, mimeType: "application/pdf", filename: "large.pdf"),
            ClientDexaUpload(data: Data("text".utf8), mimeType: "text/plain", filename: "report.txt"),
            ClientDexaUpload(data: Data("not a PDF".utf8), mimeType: "application/pdf", filename: "wrong.pdf"),
            ClientDexaUpload(data: Data("%PDF-1.7\n".utf8), mimeType: "image/png", filename: "wrong.png")
        ] {
            XCTAssertThrowsError(try upload.validated())
        }
    }

    func testTenMegabyteReportIsAcceptedAtTheWebLimit() throws {
        var data = Data("%PDF-1.7\n".utf8)
        data.append(Data(repeating: 0, count: 10 * 1_024 * 1_024 - data.count))
        XCTAssertNoThrow(try ClientDexaUpload(data: data, mimeType: "application/pdf", filename: "limit.pdf").validated())
    }

    func testFileImporterReadsAPrivateLocalPDFAndPreservesItsOriginalName() throws {
        let directory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("Synthetic Scan September.pdf")
        try syntheticPDF.data.write(to: url)

        let upload = try DexaFileImporter.read(url)
        XCTAssertEqual(upload.filename, "Synthetic Scan September.pdf")
        XCTAssertEqual(upload.mimeType, "application/pdf")
        XCTAssertEqual(upload.data, syntheticPDF.data)
        XCTAssertNoThrow(try upload.validated())
    }

    func testFileImporterRejectsUnsupportedEmptyAndOversizedFiles() throws {
        let directory = try makeTemporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let unsupported = directory.appendingPathComponent("synthetic.txt")
        try syntheticPDF.data.write(to: unsupported)
        XCTAssertThrowsError(try DexaFileImporter.read(unsupported))
        let empty = directory.appendingPathComponent("empty.pdf")
        try Data().write(to: empty)
        XCTAssertThrowsError(try DexaFileImporter.read(empty))
        let oversized = directory.appendingPathComponent("oversized.pdf")
        var bytes = syntheticPDF.data
        bytes.append(Data(repeating: 0, count: 10 * 1_024 * 1_024))
        try bytes.write(to: oversized)
        XCTAssertThrowsError(try DexaFileImporter.read(oversized))
    }

    func testWebHistoryDecodesMixedStatesAndNullableExtractionMetadata() throws {
        let ready = DexaHTTPStub.reportJSON(status: "ready")
        var failed = DexaHTTPStub.reportJSON(status: "failed")
        failed["id"] = .string("bbbbbbbb-1111-2222-3333-444444444444")
        failed["extraction_data"] = .null
        failed["extraction_warnings"] = .null
        failed["extracted_scan_date"] = .null
        failed["extracted_bodyweight_lb"] = .null
        failed["extracted_bodyfat_percent"] = .null
        failed["extracted_lean_mass_lb"] = .null
        let reports = try JSONDecoder().decode([ClientDexaReport].self, from: JSONEncoder().encode([ready, failed]))

        XCTAssertEqual(reports.map(\.status), ["ready", "failed"])
        XCTAssertEqual(reports[0].values[.bodyweightLb], 160)
        XCTAssertEqual(reports[0].values[ClientDexaField(rawValue: "vat_mass_lb")!], 1.25)
        XCTAssertEqual(reports[0].warnings, ["Synthetic warning: compare the values with the report."])
        XCTAssertTrue(reports[1].values.isEmpty)
        XCTAssertTrue(reports[1].warnings.isEmpty)
    }

    func testConfirmedBodySpecValuesOverrideExtractionAndDirectColumnsTakePrecedence() throws {
        var row = DexaHTTPStub.reportJSON(status: "confirmed")
        row["extraction_data"] = .object([
            "bodyspec_metrics": .object(["vat_mass_lb": .double(1.5), "fat_mass_lb": .double(32)]),
            "confirmed_values": .object(["vat_mass_lb": .double(1.2), "fat_mass_lb": .double(30)]),
            "source_details": .object(["synthetic": .bool(true), "pages": .array([.integer(1)])])
        ])
        row["fat_mass_lb"] = .double(29)
        let report = try decodeReport(row)

        XCTAssertEqual(report.values[ClientDexaField(rawValue: "vat_mass_lb")!], 1.2)
        XCTAssertEqual(report.values[ClientDexaField(rawValue: "fat_mass_lb")!], 29)
        XCTAssertEqual(report.reviewDraft.scanDate, "2026-09-20")
    }

    func testSavedDexaLeanMassDecodesInStatsAndSurvivesManualMeasurementProjection() throws {
        let json = #"{"id":"cccccccc-1111-2222-3333-444444444444","client_email":"client@example.com","entry_date":"2026-09-20","bodyweight":160,"bodyfat":20,"lean_mass":125,"muscle_mass":75,"measurements":{"waist":31,"bodyspec":{"vat_mass_lb":1.25}},"goal_note":"Synthetic existing note","updated_at":"2026-09-25T12:00:00Z"}"#
        let entry = try JSONDecoder().decode(ClientMeasurementEntry.self, from: Data(json.utf8))
        XCTAssertEqual(entry.leanMass, 125)
        XCTAssertEqual(entry.muscleMass, 75)
        let mutation = PendingMeasurementMutation(clientEmail: "client@example.com", entryDate: entry.entryDate,
            bodyweight: 162, bodyfat: 20, muscleMass: 75, measurements: ["waist": 32],
            goalNote: "Synthetic edited note", expectedRemoteUpdatedAt: entry.updatedAt)
        let projected = ClientMeasurementEntry(id: entry.id, mutation: mutation, preserving: entry)
        XCTAssertEqual(projected.leanMass, 125)
        XCTAssertEqual(projected.muscleMass, 75)
        XCTAssertEqual(projected.measurements["waist"], 32)
        XCTAssertEqual(projected.measurementValues["bodyspec"], entry.measurementValues["bodyspec"])
    }

    func testStatsRecordsWithoutDexaLeanMassRemainDecodable() throws {
        for lean in ["", ",\"lean_mass\":null"] {
            let json = "{\"id\":\"cccccccc-1111-2222-3333-444444444444\",\"client_email\":\"client@example.com\",\"entry_date\":\"2026-09-20\",\"measurements\":{}\(lean)}"
            let entry = try JSONDecoder().decode(ClientMeasurementEntry.self, from: Data(json.utf8))
            XCTAssertNil(entry.leanMass)
        }
    }

    func testReviewedValuesEncodeTheFlatServerContractAndExplicitMissingMetrics() throws {
        let values = try ClientDexaReviewDraft(scanDate: "2026-09-20", values: [
            .bodyweightLb: " 160.5 ", .bodyfatPercent: "20", .leanMassLb: "125",
            ClientDexaField(rawValue: "bone_t_score")!: "-1.2"
        ]).validatedValues(now: today)
        let payload = try JSONDecoder().decode([String: AnyJSON].self, from: JSONEncoder().encode(values))

        XCTAssertEqual(payload["scan_date"], .string("2026-09-20"))
        XCTAssertEqual(payload["bodyweight_lb"], .double(160.5))
        XCTAssertEqual(payload["bone_t_score"], .double(-1.2))
        XCTAssertEqual(payload["vat_mass_lb"], .null)
        XCTAssertNil(payload["measurements"])
        XCTAssertNil(payload["muscle_mass"])
        XCTAssertNil(payload["goal_note"])
    }

    func testReviewRejectsMissingFutureImpossibleAndOutOfRangeDates() {
        for date in ["", "2026-09-26", "2026-02-30", "2025-02-29", "1899-12-31", "2026-9-2"] {
            XCTAssertThrowsError(try ClientDexaReviewDraft(scanDate: date, values: [.bodyweightLb: "160"])
                .validatedValues(now: today), date)
        }
        XCTAssertNoThrow(try ClientDexaReviewDraft(scanDate: "2024-02-29", values: [.bodyweightLb: "160"])
            .validatedValues(now: today))
        XCTAssertNoThrow(try ClientDexaReviewDraft(scanDate: "2026-09-25", values: [.bodyweightLb: "160"])
            .validatedValues(now: today))
    }

    func testReviewDateBoundaryMatchesTheServersLosAngelesCalendar() throws {
        let afterUTCMidnight = try XCTUnwrap(ISO8601DateFormatter().date(from: "2026-09-25T00:30:00Z"))
        XCTAssertThrowsError(try ClientDexaReviewDraft(scanDate: "2026-09-25", values: [.bodyweightLb: "160"])
            .validatedValues(now: afterUTCMidnight))
        XCTAssertNoThrow(try ClientDexaReviewDraft(scanDate: "2026-09-24", values: [.bodyweightLb: "160"])
            .validatedValues(now: afterUTCMidnight))
    }

    func testReviewRequiresAMetricAndRejectsNonNumbersAndCoreRangeViolations() {
        XCTAssertThrowsError(try ClientDexaReviewDraft(scanDate: "2026-09-20").validatedValues(now: today))
        for (field, invalid) in [
            (ClientDexaField.bodyweightLb, "19"), (.bodyweightLb, "1501"),
            (.bodyfatPercent, "0"), (.bodyfatPercent, "76"),
            (.leanMassLb, "9"), (.leanMassLb, "1401"),
            (.bodyweightLb, "nan"), (.bodyweightLb, "inf"), (.bodyweightLb, "one hundred")
        ] {
            XCTAssertThrowsError(try ClientDexaReviewDraft(scanDate: "2026-09-20", values: [field: invalid])
                .validatedValues(now: today), "\(field): \(invalid)")
        }
    }

    func testReviewRejectsLeanMassGreaterThanTotalWeight() {
        XCTAssertThrowsError(try ClientDexaReviewDraft(scanDate: "2026-09-20", values: [
            .bodyweightLb: "160", .leanMassLb: "161"
        ]).validatedValues(now: today))
    }

    func testExtendedOnlyReviewSupportsZeroAndNegativeScoreButEnforcesWebLimits() throws {
        let tScore = try XCTUnwrap(ClientDexaField(rawValue: "bone_t_score"))
        let vat = try XCTUnwrap(ClientDexaField(rawValue: "vat_mass_lb"))
        let rmr = try XCTUnwrap(ClientDexaField(rawValue: "rmr_cal_per_day"))
        let valid = try ClientDexaReviewDraft(scanDate: "2026-09-20", values: [tScore: "-2.1", vat: "0"])
            .validatedValues(now: today)
        XCTAssertEqual(valid.values[tScore], -2.1)
        XCTAssertEqual(valid.values[vat], 0)
        for (field, value) in [(tScore, "-10.1"), (tScore, "10.1"), (vat, "-1"), (vat, "101"), (rmr, "499"), (rmr, "10001")] {
            XCTAssertThrowsError(try ClientDexaReviewDraft(scanDate: "2026-09-20", values: [field: value])
                .validatedValues(now: today))
        }
    }

    func testUploadExtractReviewAndConfirmUseExistingWebAPIWithoutOverwritingOtherMeasurements() async throws {
        let fixture = makeHTTPFixture()
        defer { fixture.close() }
        let store = fixture.store
        let uploaded = await store.upload(syntheticPDF)
        let report = try XCTUnwrap(uploaded, store.errorMessage ?? "The upload should prepare a review.")

        XCTAssertEqual(report.status, "ready")
        XCTAssertEqual(report.values[.bodyweightLb], 160)
        XCTAssertFalse(store.isWorking)
        XCTAssertNil(store.errorMessage)
        var requests = fixture.transport.requests
        let upload = try XCTUnwrap(requests.first(where: { $0.path.hasPrefix("/storage/v1/object/dexa-reports/") }))
        XCTAssertEqual(upload.method, "POST")
        XCTAssertTrue(upload.path.hasPrefix("/storage/v1/object/dexa-reports/\(accountID.uuidString.lowercased())/"))
        XCTAssertTrue(upload.path.hasSuffix(".pdf"))
        XCTAssertEqual(upload.headers["x-upsert"], "false")
        XCTAssertTrue(upload.body.range(of: syntheticPDF.data) != nil)
        let extraction = try XCTUnwrap(requests.first(where: { $0.json?["action"] == .string("extract") }))
        XCTAssertEqual(extraction.json?["original_filename"], .string("synthetic-dexa.pdf"))
        XCTAssertEqual(extraction.json?["storage_path"], .string(String(upload.path.dropFirst("/storage/v1/object/dexa-reports/".count))))
        XCTAssertFalse(requests.contains { $0.json?["action"] == .string("confirm") })
        XCTAssertFalse(requests.contains { $0.path.contains("/client_progress") })

        var review = report.reviewDraft
        review.values[.bodyweightLb] = "162"
        let saved = await store.confirm(report, draft: review)
        XCTAssertTrue(saved, store.errorMessage ?? "Reviewed values should save.")
        XCTAssertEqual(store.reports.first?.status, "confirmed")
        requests = fixture.transport.requests
        let confirmation = try XCTUnwrap(requests.first(where: { $0.json?["action"] == .string("confirm") }))
        XCTAssertEqual(confirmation.json?["report_id"]?.stringValue?.lowercased(), reportID.uuidString.lowercased())
        let values = try XCTUnwrap(confirmation.json?["values"]?.objectValue)
        XCTAssertEqual(values["bodyweight_lb"], .integer(162))
        XCTAssertEqual(values["vat_mass_lb"], .double(1.25))
        XCTAssertNil(values["measurements"])
        XCTAssertNil(values["muscle_mass"])
        XCTAssertNil(values["goal_note"])
        XCTAssertFalse(requests.contains { $0.path.contains("/client_progress") },
                       "The existing web confirmation function owns merging tape measurements, muscle mass and notes.")
        XCTAssertTrue(requests.filter { $0.path == "/rest/v1/client_dexa_reports" }.allSatisfy {
            $0.query["owner_user_id"]?.lowercased() == "eq.\(accountID.uuidString.lowercased())"
        })
    }

    func testFailedExtractionKeepsThePrivateReportAndRetriesWithoutUploadingAgain() async throws {
        let fixture = makeHTTPFixture()
        defer { fixture.close() }
        fixture.transport.failExtraction = true
        let uploaded = await fixture.store.upload(syntheticPDF)

        XCTAssertNil(uploaded)
        XCTAssertNotNil(fixture.store.errorMessage)
        XCTAssertTrue(fixture.store.lastUploadWasSaved)
        XCTAssertFalse(fixture.store.isWorking)
        let retained = try XCTUnwrap(fixture.store.reports.first)
        XCTAssertEqual(retained.status, "failed")
        XCTAssertFalse(fixture.transport.requests.contains { $0.method == "DELETE" })
        XCTAssertFalse(fixture.transport.requests.contains { $0.json?["action"] == .string("confirm") })

        fixture.transport.failExtraction = false
        let retried = await fixture.store.extract(retained)
        XCTAssertEqual(retried?.status, "ready")
        XCTAssertNil(fixture.store.errorMessage)
        XCTAssertEqual(fixture.transport.requests.filter { $0.path.hasPrefix("/storage/v1/object/dexa-reports/") }.count, 1)
        XCTAssertEqual(fixture.transport.requests.filter { $0.json?["action"] == .string("extract") }.count, 2)
    }

    func testInvalidUploadAndInvalidReviewStopBeforeAnyNetworkWrite() async throws {
        let fixture = makeHTTPFixture()
        defer { fixture.close() }
        let uploaded = await fixture.store.upload(.init(data: Data(), mimeType: "application/pdf", filename: "empty.pdf"))
        XCTAssertNil(uploaded)
        XCTAssertNotNil(fixture.store.errorMessage)
        XCTAssertFalse(fixture.store.lastUploadWasSaved)
        XCTAssertTrue(fixture.transport.requests.isEmpty)

        let report = try decodeReport(DexaHTTPStub.reportJSON())
        let saved = await fixture.store.confirm(report, draft: .init(scanDate: "2026-02-30", values: [.bodyweightLb: "160"]))
        XCTAssertFalse(saved)
        XCTAssertTrue(fixture.transport.requests.isEmpty)
    }

    func testConfirmationFailureKeepsReportReadyToRetry() async throws {
        let fixture = makeHTTPFixture()
        defer { fixture.close() }
        await fixture.store.load()
        let report = try XCTUnwrap(fixture.store.reports.first)
        fixture.transport.failConfirmation = true
        let saved = await fixture.store.confirm(report, draft: report.reviewDraft)
        XCTAssertFalse(saved)
        XCTAssertNotNil(fixture.store.errorMessage)
        XCTAssertEqual(fixture.store.reports.first?.status, "ready")
        XCTAssertFalse(fixture.store.isWorking)
        XCTAssertFalse(fixture.transport.requests.contains { $0.method == "DELETE" })
    }

    func testExistingReportHistoryLoadFailureIsVisibleAndDoesNotEraseLoadedReports() async {
        let fixture = makeHTTPFixture()
        defer { fixture.close() }
        await fixture.store.load()
        XCTAssertEqual(fixture.store.reports.count, 1)
        fixture.transport.failHistory = true
        await fixture.store.load()
        XCTAssertNotNil(fixture.store.errorMessage)
        XCTAssertEqual(fixture.store.reports.count, 1)
        XCTAssertFalse(fixture.store.isLoading)
    }

    func testFailedExtractionAndHistoryRefreshRetainAnEntryForTheCompletedPrivateUpload() async throws {
        let fixture = makeHTTPFixture()
        defer { fixture.close() }
        fixture.transport.failExtraction = true
        fixture.transport.failHistory = true
        let uploaded = await fixture.store.upload(syntheticPDF)
        XCTAssertNil(uploaded)
        XCTAssertTrue(fixture.store.lastUploadWasSaved)
        let retained = try XCTUnwrap(fixture.store.reports.first)
        XCTAssertEqual(retained.status, "failed")
        XCTAssertEqual(retained.originalFilename, "synthetic-dexa.pdf")
        XCTAssertTrue(ClientDexaUpload.isOwnedPath(retained.storagePath, accountID: accountID))
        XCTAssertFalse(fixture.transport.requests.contains { $0.method == "DELETE" })

        fixture.transport.failExtraction = false
        fixture.transport.failHistory = false
        let retried = await fixture.store.extract(retained)
        XCTAssertEqual(retried?.status, "ready")
        XCTAssertEqual(fixture.store.reports.count, 1)
        XCTAssertEqual(fixture.transport.requests.filter { $0.path.hasPrefix("/storage/v1/object/dexa-reports/") }.count, 1)
    }

    func testSuccessfulRetryReplacesAStaleFailedReportEvenWhenHistoryRefreshFails() async throws {
        let fixture = makeHTTPFixture()
        defer { fixture.close() }
        fixture.transport.reportStatus = "failed"
        await fixture.store.load()
        let failed = try XCTUnwrap(fixture.store.reports.first)
        XCTAssertEqual(failed.status, "failed")
        fixture.transport.failHistory = true

        let result = await fixture.store.extract(failed)
        XCTAssertEqual(result?.status, "ready")
        XCTAssertEqual(fixture.store.reports.first?.status, "ready")
        XCTAssertEqual(fixture.store.reports.first?.values[.bodyweightLb], 160)
        XCTAssertEqual(fixture.store.reports.count, 1)
    }

    func testAccountMismatchPreventsReportReadsUploadsAndConfirmation() async throws {
        let fixture = DexaHTTPFixture(accountID: accountID, identityAccountID: UUID())
        defer { fixture.close() }
        await fixture.store.load()
        XCTAssertNotNil(fixture.store.errorMessage)
        let uploaded = await fixture.store.upload(syntheticPDF)
        XCTAssertNil(uploaded)
        let report = try decodeReport(DexaHTTPStub.reportJSON())
        let saved = await fixture.store.confirm(report, draft: report.reviewDraft)
        XCTAssertFalse(saved)
        XCTAssertTrue(fixture.transport.requests.isEmpty)
    }

    func testAnotherAccountsReportCannotBeReadExtractedOrConfirmed() async throws {
        let fixture = makeHTTPFixture()
        defer { fixture.close() }
        var row = DexaHTTPStub.reportJSON()
        row["storage_path"] = .string("66666666-1111-2222-3333-444444444444/aaaaaaaa-1111-2222-3333-444444444444.pdf")
        let foreign = try decodeReport(row)
        let url = await fixture.store.signedURL(for: foreign)
        XCTAssertNil(url)
        let extracted = await fixture.store.extract(foreign)
        XCTAssertNil(extracted)
        let confirmed = await fixture.store.confirm(foreign, draft: foreign.reviewDraft)
        XCTAssertFalse(confirmed)
        XCTAssertFalse(fixture.transport.requests.contains { $0.method != "GET" })
        XCTAssertTrue(fixture.transport.requests.allSatisfy { $0.path == "/rest/v1/client_dexa_reports" },
                      "A failed action may refresh the user's own report list, but must not touch the foreign report.")
    }

    private var syntheticPDF: ClientDexaUpload {
        .init(data: Data("%PDF-1.7\nsynthetic test report".utf8), mimeType: "application/pdf", filename: "synthetic-dexa.pdf")
    }

    private func makeHTTPFixture() -> DexaHTTPFixture {
        DexaHTTPFixture(accountID: accountID)
    }

    private func makeTemporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("dexa-tests-" + UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private func decodeReport(_ row: [String: AnyJSON]) throws -> ClientDexaReport {
        try JSONDecoder().decode(ClientDexaReport.self, from: JSONEncoder().encode(row))
    }
}

private final class DexaHTTPStub: @unchecked Sendable {
    struct Request {
        let path: String
        let method: String
        let query: [String: String]
        let headers: [String: String]
        let body: Data
        var json: [String: AnyJSON]? { try? JSONDecoder().decode([String: AnyJSON].self, from: body) }
    }

    private let lock = NSLock()
    private var capturedRequests: [Request] = []
    private var report = reportJSON()
    var failExtraction = false
    var failConfirmation = false
    var failHistory = false
    var requests: [Request] { lock.withLock { capturedRequests } }
    var reportStatus: String {
        get { lock.withLock { report["status"]?.stringValue ?? "ready" } }
        set { lock.withLock { report["status"] = .string(newValue) } }
    }

    func response(to request: URLRequest) throws -> (Int, Data) {
        try lock.withLock {
            let url = request.url!
            let body = try requestData(request)
            let captured = Request(path: url.path, method: request.httpMethod ?? "GET",
                                   query: Dictionary((URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? [])
                                    .map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { first, _ in first }),
                                   headers: Dictionary((request.allHTTPHeaderFields ?? [:]).map { ($0.key.lowercased(), $0.value) },
                                                       uniquingKeysWith: { first, _ in first }), body: body)
            capturedRequests.append(captured)
            if captured.path.hasPrefix("/storage/v1/object/dexa-reports/") && captured.method == "POST" {
                let path = String(captured.path.dropFirst("/storage/v1/object/dexa-reports/".count))
                report["storage_path"] = .string(path)
                return try response(["Key": .string("dexa-reports/" + path), "Id": report["id"]!])
            }
            if captured.path == "/rest/v1/client_dexa_reports" && captured.method == "GET" {
                if failHistory { return try response(["message": .string("Synthetic history failure"), "code": .string("test")], status: 503) }
                return (200, try JSONEncoder().encode([report]))
            }
            if captured.path == "/functions/v1/extract-dexa-report" {
                switch captured.json?["action"]?.stringValue {
                case "extract":
                    if failExtraction {
                        report["status"] = .string("failed")
                        return try response(["error": .string("Synthetic extraction failure"), "report_id": report["id"]!], status: 422)
                    }
                    report["status"] = .string("ready")
                    return try response([
                        "report_id": report["id"]!, "status": .string("ready"), "confidence": .string("high"),
                        "warnings": report["extraction_warnings"]!,
                        "extracted": .object(["scan_date": .string("2026-09-20"), "bodyweight_lb": .integer(160),
                                               "bodyfat_percent": .integer(20), "lean_mass_lb": .integer(125), "vat_mass_lb": .double(1.25)])
                    ])
                case "confirm":
                    if failConfirmation { return try response(["error": .string("Synthetic confirmation failure")], status: 500) }
                    report["status"] = .string("confirmed")
                    return try response(["report_id": report["id"]!, "status": .string("confirmed"), "progress_entry": .object([
                        "id": .string("cccccccc-1111-2222-3333-444444444444"), "entry_date": .string("2026-09-20"),
                        "measurements": .object(["waist": .integer(31), "bodyspec": .object(["vat_mass_lb": .double(1.25)])]),
                        "muscle_mass": .integer(75), "goal_note": .string("Synthetic existing note")
                    ])])
                default: break
                }
            }
            throw NSError(domain: "UnexpectedDexaTestRequest", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Unexpected \(captured.method) \(captured.path)"])
        }
    }

    private func response(_ object: [String: AnyJSON], status: Int = 200) throws -> (Int, Data) {
        (status, try JSONEncoder().encode(object))
    }

    private func requestData(_ request: URLRequest) throws -> Data {
        if let data = request.httpBody { return data }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var bytes = [UInt8](repeating: 0, count: 4_096)
        while stream.hasBytesAvailable {
            let count = stream.read(&bytes, maxLength: bytes.count)
            if count < 0 { throw stream.streamError ?? URLError(.cannotDecodeContentData) }
            if count == 0 { break }
            data.append(contentsOf: bytes.prefix(count))
        }
        return data
    }

    static func reportJSON(status: String = "ready") -> [String: AnyJSON] {
        [
            "id": .string("aaaaaaaa-1111-2222-3333-444444444444"),
            "owner_user_id": .string("55555555-1111-2222-3333-444444444444"),
            "client_email": .string("client@example.com"),
            "storage_path": .string("55555555-1111-2222-3333-444444444444/aaaaaaaa-1111-2222-3333-444444444444.pdf"),
            "original_filename": .string("synthetic-dexa.pdf"),
            "mime_type": .string("application/pdf"), "file_size_bytes": .integer(128),
            "status": .string(status), "extraction_attempts": .integer(1),
            "extracted_scan_date": .string("2026-09-20"), "extracted_bodyweight_lb": .integer(160),
            "extracted_bodyfat_percent": .integer(20), "extracted_lean_mass_lb": .integer(125),
            "extraction_data": .object(["bodyspec_metrics": .object(["vat_mass_lb": .double(1.25)])]),
            "extraction_warnings": .array([.string("Synthetic warning: compare the values with the report.")]),
            "extraction_error": .string(""), "extraction_confidence": .string("high"),
            "progress_entry_id": .null, "archived_at": .null,
            "created_at": .string("2026-09-25T12:00:00Z"), "updated_at": .string("2026-09-25T12:00:00Z")
        ]
    }
}

@MainActor
private final class DexaHTTPFixture {
    let transport = DexaHTTPStub()
    let session: URLSession
    let store: ClientDexaStore

    init(accountID: UUID, identityAccountID: UUID? = nil) {
        DexaURLProtocol.transport = transport
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [DexaURLProtocol.self]
        session = URLSession(configuration: configuration)
        let client = SupabaseClient(
            supabaseURL: URL(string: "https://dexa-tests.example.com")!, supabaseKey: "test-key",
            options: .init(auth: .init(storage: DexaEmptyAuthStorage(), autoRefreshToken: false, accessToken: { nil }),
                           global: .init(session: session))
        )
        let repository = SupabaseClientDexaRepository(client: client, identity: {
            ClientDexaIdentity(accountID: identityAccountID ?? accountID, email: "client@example.com")
        })
        store = ClientDexaStore(accountID: accountID, email: " Client@Example.com ", repository: repository)
    }

    func close() {
        session.invalidateAndCancel()
        DexaURLProtocol.transport = nil
    }
}

private struct DexaEmptyAuthStorage: AuthLocalStorage {
    func store(key: String, value: Data) throws {}
    func retrieve(key: String) throws -> Data? { nil }
    func remove(key: String) throws {}
}

private final class DexaURLProtocol: URLProtocol {
    nonisolated(unsafe) static var transport: DexaHTTPStub?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            guard let transport = Self.transport else { throw URLError(.cancelled) }
            let (status, data) = try transport.response(to: request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
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
