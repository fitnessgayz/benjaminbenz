import SafariServices
import SwiftUI
import UniformTypeIdentifiers

struct ClientDexaEntryCard: View {
    let openReports: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "doc.text.viewfinder")
                    .font(FWBFont.title2)
                    .foregroundStyle(Color.fwbLime)
                    .accessibilityHidden(true)
                SectionHeading(kicker: "DEXA REPORT", title: "Upload and autofill")
            }
            Text("Upload your scan, review the extracted values, and save them to your measurements.")
                .font(FWBFont.subheadline)
                .foregroundStyle(Color.fwbMuted)
            Button(action: openReports) {
                Label("Upload DEXA scan", systemImage: "arrow.up.doc")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(FWBPrimaryButtonStyle())
            .accessibilityIdentifier("stats.dexa.open")
            Text("PDF, JPG, or PNG · Up to 10 MB · Private to you and your coach")
                .font(FWBFont.caption)
                .foregroundStyle(Color.fwbMuted)
            Button("View uploaded reports", action: openReports)
                .font(FWBFont.footnote.weight(.semibold))
                .foregroundStyle(Color.fwbLime)
                .frame(minHeight: 44)
        }
        .fwbCard()
    }
}

private enum DexaDestination: Identifiable {
    case review(ClientDexaReport)
    case preview(URL)

    var id: String {
        switch self {
        case .review(let report): "review-\(report.id)"
        case .preview: "preview"
        }
    }
}

@MainActor
struct ClientDexaReportsView: View {
    @ObservedObject var store: ClientDexaStore
    let measurementDates: Set<String>
    let onMeasurementsSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var importing = false
    @State private var readingFile = false
    @State private var selectedUpload: ClientDexaUpload?
    @State private var importError: String?
    @State private var destination: DexaDestination?
    @State private var archivedExpanded = false

    private var busy: Bool { store.isWorking || readingFile }
    private var activeReports: [ClientDexaReport] { store.reports.filter { !$0.isArchived } }
    private var archivedReports: [ClientDexaReport] { store.reports.filter(\.isArchived) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    uploadSection
                    statusSection
                    reportHistory
                }
                .padding(16)
            }
            .background(Color.fwbBackground)
            .navigationTitle("DEXA reports")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.fwbBackground, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }.disabled(busy)
                }
            }
            .interactiveDismissDisabled(busy)
            .task { await store.load() }
            .refreshable { if !busy { await store.load() } }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.pdf, .jpeg, .png]) { result in
                importFile(result)
            }
            .sheet(item: $destination) { item in
                switch item {
                case .review(let report):
                    ClientDexaReviewView(
                        report: report, store: store, measurementDates: measurementDates,
                        onMeasurementsSaved: onMeasurementsSaved
                    )
                case .preview(let url):
                    DexaReportPreview(url: url).ignoresSafeArea()
                }
            }
        }
        .tint(.fwbLime)
    }

    private var uploadSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeading(kicker: "DEXA REPORT", title: "Upload and autofill")
            Text("We’ll prepare the scan date, bodyweight, body-fat percentage, and whole-body lean mass for you to review.")
                .font(FWBFont.subheadline)
                .foregroundStyle(Color.fwbMuted)
            Button {
                importing = true
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "doc.badge.plus")
                        .font(FWBFont.title2)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(selectedUpload?.filename ?? "Choose DEXA report")
                            .font(FWBFont.subheadline.weight(.semibold))
                            .lineLimit(2)
                        Text(selectedUpload == nil ? "Browse Files on your iPhone or iCloud" : "Tap to choose a different report")
                            .font(FWBFont.caption)
                            .foregroundStyle(Color.fwbMuted)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(FWBFont.caption)
                }
                .foregroundStyle(Color.fwbWarmWhite)
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 12))
                .overlay { RoundedRectangle(cornerRadius: 12).stroke(Color.fwbLine, lineWidth: 1) }
            }
            .buttonStyle(.plain)
            .disabled(busy)
            .accessibilityIdentifier("stats.dexa.choose-file")
            Text("PDF, JPG, or PNG up to 10 MB. Visible only to you and your coach.")
                .font(FWBFont.caption)
                .foregroundStyle(Color.fwbMuted)
            Button {
                guard let upload = selectedUpload else { return }
                importError = nil
                Task {
                    let report = await store.upload(upload)
                    if store.lastUploadWasSaved { selectedUpload = nil }
                    if let report, report.status == "ready", !report.isArchived {
                        destination = .review(report)
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    if busy { ProgressView().tint(.black) }
                    Text(busy ? "Preparing report…" : "Upload and read report")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(FWBPrimaryButtonStyle())
            .disabled(selectedUpload == nil || busy)
            .accessibilityIdentifier("stats.dexa.upload")
            Text("Your report is stored privately and sent to OpenAI to prepare measurements for your review. You can also enter measurements manually in Stats.")
                .font(FWBFont.caption)
                .foregroundStyle(Color.fwbMuted)
        }
        .fwbCard()
    }

    @ViewBuilder
    private var statusSection: some View {
        if readingFile {
            ProgressView("Opening your report…")
                .font(FWBFont.footnote).tint(.fwbLime)
        }
        if let error = importError ?? store.errorMessage {
            Label(error, systemImage: "exclamationmark.triangle")
                .font(FWBFont.footnote)
                .foregroundStyle(Color.fwbRed)
                .accessibilityIdentifier("stats.dexa.error")
        } else if let message = store.statusMessage {
            Text(message)
                .font(FWBFont.footnote)
                .foregroundStyle(Color.fwbMuted)
                .accessibilityIdentifier("stats.dexa.status")
        }
    }

    private var reportHistory: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                SectionHeading(kicker: "PRIVATE", title: "Uploaded reports")
                Spacer()
                Button {
                    Task { await store.load() }
                } label: { Image(systemName: "arrow.clockwise") }
                    .frame(minWidth: 44, minHeight: 44)
                    .disabled(busy || store.isLoading)
                    .accessibilityLabel("Refresh DEXA reports")
            }
            if store.isLoading && store.reports.isEmpty {
                FWBLoadingState(
                    title: "Loading your reports",
                    message: "Your private DEXA reports and confirmed measurements will appear here."
                )
            } else if activeReports.isEmpty {
                Text(store.errorMessage != nil ? "Refresh to load your uploaded reports." : (store.reports.isEmpty ? "No DEXA reports uploaded yet." : "No active reports. Archived reports stay available below."))
                    .font(FWBFont.subheadline)
                    .foregroundStyle(Color.fwbMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .fwbCard()
            }
            ForEach(activeReports) { report in reportRow(report) }
            if !archivedReports.isEmpty {
                DisclosureGroup("Archived reports (\(archivedReports.count))", isExpanded: $archivedExpanded) {
                    VStack(spacing: 12) {
                        ForEach(archivedReports) { report in reportRow(report) }
                    }
                    .padding(.top, 12)
                }
                .font(FWBFont.subheadline.weight(.semibold))
                .foregroundStyle(Color.fwbWarmWhite)
            }
        }
    }

    private func reportRow(_ report: ClientDexaReport) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "doc.text")
                    .font(FWBFont.title3)
                    .foregroundStyle(Color.fwbLime)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(report.originalFilename)
                        .font(FWBFont.subheadline.weight(.semibold))
                        .foregroundStyle(Color.fwbWarmWhite)
                        .lineLimit(3)
                    Text("\(report.scanDate ?? String((report.createdAt ?? "").prefix(10))) · \(report.statusLabel)")
                        .font(FWBFont.caption)
                        .foregroundStyle(Color.fwbMuted)
                }
                Spacer(minLength: 0)
            }
            if report.status == "ready" && !report.isArchived {
                Button("Review values") { destination = .review(report) }
                    .buttonStyle(FWBPrimaryButtonStyle())
                    .accessibilityIdentifier("stats.dexa.review")
            } else if report.status == "failed" && !report.isArchived {
                Button("Try extraction again") {
                    Task {
                        if let updated = await store.extract(report), updated.status == "ready", !updated.isArchived {
                            destination = .review(updated)
                        }
                    }
                }
                .buttonStyle(FWBSecondaryButtonStyle())
            }
            HStack(spacing: 20) {
                Button {
                    Task {
                        if let url = await store.signedURL(for: report) { destination = .preview(url) }
                    }
                } label: { Label("View report", systemImage: "doc.richtext") }
                Spacer(minLength: 0)
                Button(report.isArchived ? "Restore" : "Archive") {
                    Task { _ = await store.setArchived(report, archived: !report.isArchived) }
                }
            }
            .font(FWBFont.footnote.weight(.semibold))
            .foregroundStyle(Color.fwbLime)
            .frame(minHeight: 44)
        }
        .fwbCard()
        .disabled(busy)
    }

    private func importFile(_ result: Result<URL, Error>) {
        guard case .success(let url) = result else {
            if case .failure(let error) = result,
               (error as NSError).code != CocoaError.userCancelled.rawValue {
                importError = "The report could not be opened. Choose it again from Files."
            }
            return
        }
        readingFile = true
        importError = nil
        Task {
            do {
                selectedUpload = try await Task.detached(priority: .userInitiated) {
                    try DexaFileImporter.read(url)
                }.value
            } catch {
                selectedUpload = nil
                importError = (error as? DexaFileImporter.ImportError)?.errorDescription
                    ?? "The report could not be opened. Download it in Files and try again."
            }
            readingFile = false
        }
    }
}

@MainActor
private struct ClientDexaReviewView: View {
    let report: ClientDexaReport
    @ObservedObject var store: ClientDexaStore
    let measurementDates: Set<String>
    let onMeasurementsSaved: () async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var draft: ClientDexaReviewDraft
    @State private var validationMessage: String?
    @State private var detailsExpanded = false
    @State private var preview: DexaDestination?

    init(report: ClientDexaReport, store: ClientDexaStore, measurementDates: Set<String>, onMeasurementsSaved: @escaping () async -> Void) {
        self.report = report
        self.store = store
        self.measurementDates = measurementDates
        self.onMeasurementsSaved = onMeasurementsSaved
        _draft = State(initialValue: report.reviewDraft)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    SectionHeading(kicker: "REVIEW YOUR SCAN", title: "Check the extracted measurements")
                    Label("Automatic extraction can be wrong. Compare every value with your report before saving.", systemImage: "exclamationmark.triangle")
                        .font(FWBFont.footnote.weight(.semibold))
                        .foregroundStyle(Color.fwbMuted)
                    Button("View original report") {
                        Task {
                            if let url = await store.signedURL(for: report) { preview = .preview(url) }
                        }
                    }
                    .font(FWBFont.footnote.weight(.semibold))
                    .frame(minHeight: 44)
                    ForEach(Array(report.warnings.prefix(6).enumerated()), id: \.offset) { _, warning in
                        Text(warning).font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
                    }
                    VStack(alignment: .leading, spacing: 14) {
                        DatePicker("Scan date", selection: scanDate, in: earliestScanDate...Date(), displayedComponents: .date)
                            .font(FWBFont.subheadline)
                            .accessibilityIdentifier("stats.dexa.scan-date")
                        if draft.scanDate.isEmpty {
                            Text("No scan date was found. Choose the date on your report, or confirm today below.")
                                .font(FWBFont.caption).foregroundStyle(Color.fwbMuted)
                            Button("Use today’s date") {
                                draft.scanDate = ClientStatsStore.apiDateFormatter.string(from: Date())
                            }
                            .font(FWBFont.footnote.weight(.semibold))
                        }
                        ForEach(ClientDexaField.coreFields) { field in metricField(field) }
                    }
                    .fwbCard()
                    DisclosureGroup("BodySpec and detailed measurements", isExpanded: $detailsExpanded) {
                        VStack(spacing: 16) {
                            ForEach(ClientDexaField.bodySpecFields) { field in metricField(field) }
                        }
                        .padding(.top, 16)
                    }
                    .font(FWBFont.subheadline.weight(.semibold))
                    .fwbCard()
                    Text(measurementDates.contains(draft.scanDate)
                         ? "A measurement entry exists for this date. Saving updates DEXA values and preserves your muscle mass, tape measurements, and notes."
                         : "The reviewed values will be saved for this scan date. Any existing tape measurements and notes will be preserved.")
                        .font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
                    if let error = validationMessage ?? store.errorMessage {
                        Text(error).font(FWBFont.footnote).foregroundStyle(Color.fwbRed)
                            .accessibilityIdentifier("stats.dexa.review-error")
                    }
                    Button {
                        save()
                    } label: {
                        HStack {
                            if store.isWorking { ProgressView().tint(.black) }
                            Text(store.isWorking ? "Saving…" : "Save reviewed measurements")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(FWBPrimaryButtonStyle())
                    .accessibilityIdentifier("stats.dexa.confirm")
                }
                .padding(16)
                .disabled(store.isWorking)
            }
            .background(Color.fwbBackground)
            .navigationTitle("Review DEXA scan")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cancel") { dismiss() }.disabled(store.isWorking)
                }
            }
            .interactiveDismissDisabled(store.isWorking)
            .sheet(item: $preview) { item in
                switch item {
                case .preview(let url): DexaReportPreview(url: url).ignoresSafeArea()
                case .review: EmptyView()
                }
            }
        }
        .tint(.fwbLime)
    }

    private var earliestScanDate: Date {
        ClientStatsStore.apiDateFormatter.date(from: "1900-01-01")!
    }

    private var scanDate: Binding<Date> {
        Binding(
            get: { ClientStatsStore.apiDateFormatter.date(from: draft.scanDate) ?? Date() },
            set: { draft.scanDate = ClientStatsStore.apiDateFormatter.string(from: $0) }
        )
    }

    private func metricField(_ field: ClientDexaField) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(field.unit.isEmpty ? field.label : "\(field.label) (\(field.unit))")
                .font(FWBFont.footnote.weight(.semibold))
                .foregroundStyle(Color.fwbMuted)
            TextField("Not provided", text: Binding(
                get: { draft.values[field] ?? "" }, set: { draft.values[field] = $0 }
            ))
            .keyboardType(field.minimum < 0 ? .numbersAndPunctuation : .decimalPad)
            .font(FWBFont.body)
            .foregroundStyle(Color.fwbWarmWhite)
            .padding(12)
            .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 10))
            .overlay { RoundedRectangle(cornerRadius: 10).stroke(Color.fwbLine, lineWidth: 1) }
            .accessibilityLabel(field.label)
            .accessibilityIdentifier("stats.dexa.field.\(field.rawValue)")
        }
    }

    private func save() {
        do {
            _ = try draft.validatedValues()
            validationMessage = nil
        } catch {
            validationMessage = error.localizedDescription
            return
        }
        Task {
            if await store.confirm(report, draft: draft) {
                await onMeasurementsSaved()
                dismiss()
            }
        }
    }
}

private struct DexaReportPreview: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

enum DexaFileImporter {
    enum ImportError: LocalizedError {
        case invalidType, invalidSize
        var errorDescription: String? {
            switch self {
            case .invalidType: "Choose a PDF, JPG, or PNG DEXA report."
            case .invalidSize: "Choose a DEXA report up to 10 MB."
            }
        }
    }

    static func read(_ url: URL) throws -> ClientDexaUpload {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        var coordinationError: NSError?
        var outcome: Result<ClientDexaUpload, Error>?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { readableURL in
            outcome = Result {
                let type = UTType(filenameExtension: readableURL.pathExtension)
                let mimeType: String
                if type == .pdf { mimeType = "application/pdf" }
                else if type == .jpeg { mimeType = "image/jpeg" }
                else if type == .png { mimeType = "image/png" }
                else { throw ImportError.invalidType }
                let handle = try FileHandle(forReadingFrom: readableURL)
                defer { try? handle.close() }
                let data = try handle.read(upToCount: 10 * 1024 * 1024 + 1) ?? Data()
                guard !data.isEmpty, data.count <= 10 * 1024 * 1024 else { throw ImportError.invalidSize }
                return ClientDexaUpload(data: data, mimeType: mimeType, filename: url.lastPathComponent)
            }
        }
        if let coordinationError { throw coordinationError }
        guard let outcome else { throw CocoaError(.fileReadUnknown) }
        return try outcome.get()
    }
}


#if DEBUG
/// Synthetic, memory-only reports for UI checks. No backend or health data.
@MainActor
final class ClientDexaAuditRepository: ClientDexaRepository {
    private var report = ClientDexaReport(
        id: UUID(uuidString: "11111111-2222-3333-4444-555555555555")!,
        storagePath: "c0a7f519-d71a-4d9f-bb4e-63a77e402dde/11111111-2222-3333-4444-555555555555.pdf",
        originalFilename: "Sample DEXA report.pdf", mimeType: "application/pdf", status: "ready",
        scanDate: "2026-08-25", createdAt: "2026-08-25T12:00:00Z",
        warnings: ["Check all values against the original report."],
        values: [.bodyweightLb: 160, .bodyfatPercent: 20, .leanMassLb: 123,
                 .fatMassLb: 32, .boneTScore: -0.4, .rmrCalPerDay: 1650]
    )

    func loadReports(accountID: UUID, email: String) async throws -> [ClientDexaReport] { [report] }
    func upload(upload: ClientDexaUpload, path: String, accountID: UUID, email: String) async throws {}
    func extract(path: String, filename: String, accountID: UUID, email: String) async throws -> ClientDexaExtractionResult {
        ClientDexaExtractionResult(reportID: report.id, status: report.status, scanDate: report.scanDate, values: report.values, warnings: report.warnings)
    }
    func confirm(report: ClientDexaReport, values: ClientDexaReviewValues, accountID: UUID, email: String) async throws {
        self.report = ClientDexaReport(id: report.id, storagePath: report.storagePath,
            originalFilename: report.originalFilename, mimeType: report.mimeType, status: "confirmed",
            scanDate: values.scanDate, createdAt: report.createdAt, values: values.values)
    }
    func setArchived(report: ClientDexaReport, archived: Bool, accountID: UUID, email: String) async throws {
        self.report = ClientDexaReport(id: report.id, storagePath: report.storagePath,
            originalFilename: report.originalFilename, mimeType: report.mimeType, status: report.status,
            scanDate: report.scanDate, createdAt: report.createdAt, archivedAt: archived ? "2026-09-25T12:00:00Z" : nil,
            warnings: report.warnings, values: report.values)
    }
    func signedURL(report: ClientDexaReport, accountID: UUID, email: String) async throws -> URL {
        throw URLError(.notConnectedToInternet)
    }
}
#endif
