import AVFoundation
import AVKit
import CoreTransferable
import Foundation
import PhotosUI
import Supabase
import SwiftUI
import UniformTypeIdentifiers
import UIKit

private let formChecksBucket = "form-checks"
private let maximumFormCheckBytes: Int64 = 100 * 1_024 * 1_024
private let maximumFormCheckVideoDuration: Double = 60

struct FormCheckContext: Identifiable, Equatable {
    let id = UUID()
    let exerciseCode: String
    let exerciseName: String
    let workoutTitle: String
}

private enum FormCheckMediaKind: String, Codable {
    case photo
    case video

    var label: String {
        switch self {
        case .photo: "Photo"
        case .video: "Video"
        }
    }

    var icon: String {
        switch self {
        case .photo: "photo.fill"
        case .video: "video.fill"
        }
    }
}

private enum FormCheckReviewStatus: String, Codable {
    case submitted
    case inReview = "in_review"
    case reviewed
    case needsResubmission = "needs_resubmission"

    var title: String {
        switch self {
        case .submitted: "Submitted"
        case .inReview: "In review"
        case .reviewed: "Reviewed"
        case .needsResubmission: "Resubmit requested"
        }
    }

    var detail: String {
        switch self {
        case .submitted: "Waiting for your coach"
        case .inReview: "Your coach is reviewing it"
        case .reviewed: "Coach review complete"
        case .needsResubmission: "Open the feedback before recording again"
        }
    }

    var icon: String {
        switch self {
        case .submitted: "clock.fill"
        case .inReview: "eye.fill"
        case .reviewed: "checkmark.circle.fill"
        case .needsResubmission: "arrow.clockwise.circle.fill"
        }
    }

    var color: Color {
        switch self {
        case .submitted: .fwbMuted
        case .inReview, .reviewed: .fwbLime
        case .needsResubmission: .fwbRed
        }
    }
}

private struct FormCheckSubmissionRecord: Decodable, Identifiable, Equatable {
    let id: UUID
    let exerciseCode: String
    let exerciseName: String
    let workoutTitle: String
    let mediaType: FormCheckMediaKind
    let storagePath: String
    let mimeType: String
    let fileSizeBytes: Int64
    let mediaDurationSeconds: Double?
    let note: String
    let status: FormCheckReviewStatus
    let coachFeedback: String
    let reviewedAt: String?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case exerciseCode = "exercise_code"
        case exerciseName = "exercise_name"
        case workoutTitle = "workout_title"
        case mediaType = "media_type"
        case storagePath = "storage_path"
        case mimeType = "mime_type"
        case fileSizeBytes = "file_size_bytes"
        case mediaDurationSeconds = "media_duration_seconds"
        case note
        case status
        case coachFeedback = "coach_feedback"
        case reviewedAt = "reviewed_at"
        case createdAt = "created_at"
    }
}

private struct FormCheckSubmissionPayload: Encodable {
    let clientEmail: String
    let exerciseCode: String
    let exerciseName: String
    let workoutTitle: String
    let mediaType: FormCheckMediaKind
    let storagePath: String
    let mimeType: String
    let fileSizeBytes: Int64
    let mediaDurationSeconds: Double?
    let note: String

    enum CodingKeys: String, CodingKey {
        case clientEmail = "client_email"
        case exerciseCode = "exercise_code"
        case exerciseName = "exercise_name"
        case workoutTitle = "workout_title"
        case mediaType = "media_type"
        case storagePath = "storage_path"
        case mimeType = "mime_type"
        case fileSizeBytes = "file_size_bytes"
        case mediaDurationSeconds = "media_duration_seconds"
        case note
    }
}

private struct SelectedFormCheckMedia {
    let kind: FormCheckMediaKind
    let fileURL: URL
    let mimeType: String
    let fileSizeBytes: Int64
    let duration: Double?

    var displaySize: String {
        ByteCountFormatter.string(fromByteCount: fileSizeBytes, countStyle: .file)
    }

    var detail: String {
        if let duration {
            return "\(duration.formCheckDuration) · \(displaySize)"
        }
        return displaySize
    }
}

private enum FormCheckMediaError: LocalizedError {
    case unavailable
    case invalidPhoto
    case unsupportedVideo
    case videoTooLong
    case fileTooLarge

    var errorDescription: String? {
        switch self {
        case .unavailable:
            "That item could not be loaded. Try choosing it again."
        case .invalidPhoto:
            "That photo could not be prepared. Try another image."
        case .unsupportedVideo:
            "Choose an MP4, MOV, or M4V video."
        case .videoTooLong:
            "Choose a video that is 60 seconds or shorter."
        case .fileTooLarge:
            "Choose a file smaller than 100 MB."
        }
    }
}

private struct TransferableFormCheckVideo: Transferable {
    let fileURL: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .movie) { video in
            SentTransferredFile(video.fileURL)
        } importing: { received in
            let fileExtension = received.file.pathExtension.isEmpty ? "mov" : received.file.pathExtension
            let copyURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("form-check-\(UUID().uuidString.lowercased())")
                .appendingPathExtension(fileExtension)
            try FileManager.default.copyItem(at: received.file, to: copyURL)
            return TransferableFormCheckVideo(fileURL: copyURL)
        }
    }
}

private enum FormCheckMediaLoader {
    static func load(item: PhotosPickerItem) async throws -> SelectedFormCheckMedia {
        if item.supportedContentTypes.contains(where: { $0.conforms(to: .movie) }) {
            return try await loadVideo(item: item)
        }
        return try await loadPhoto(item: item)
    }

    static func removeTemporaryFile(for media: SelectedFormCheckMedia?) {
        guard let media else { return }
        try? FileManager.default.removeItem(at: media.fileURL)
    }

    private static func loadPhoto(item: PhotosPickerItem) async throws -> SelectedFormCheckMedia {
        guard let data = try await item.loadTransferable(type: Data.self) else {
            throw FormCheckMediaError.unavailable
        }
        guard let jpegData = FormCheckPhotoProcessor.jpegData(from: data) else {
            throw FormCheckMediaError.invalidPhoto
        }
        guard Int64(jpegData.count) <= maximumFormCheckBytes else {
            throw FormCheckMediaError.fileTooLarge
        }

        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("form-check-\(UUID().uuidString.lowercased())")
            .appendingPathExtension("jpg")
        try jpegData.write(to: fileURL, options: .atomic)
        return SelectedFormCheckMedia(
            kind: .photo,
            fileURL: fileURL,
            mimeType: "image/jpeg",
            fileSizeBytes: Int64(jpegData.count),
            duration: nil
        )
    }

    private static func loadVideo(item: PhotosPickerItem) async throws -> SelectedFormCheckMedia {
        guard let video = try await item.loadTransferable(type: TransferableFormCheckVideo.self) else {
            throw FormCheckMediaError.unavailable
        }

        let values = try video.fileURL.resourceValues(forKeys: [.fileSizeKey])
        let fileSize = Int64(values.fileSize ?? 0)
        guard fileSize > 0 else { throw FormCheckMediaError.unavailable }
        guard fileSize <= maximumFormCheckBytes else {
            try? FileManager.default.removeItem(at: video.fileURL)
            throw FormCheckMediaError.fileTooLarge
        }

        let asset = AVURLAsset(url: video.fileURL)
        let durationTime = try await asset.load(.duration)
        let duration = CMTimeGetSeconds(durationTime)
        guard duration.isFinite, duration > 0 else {
            try? FileManager.default.removeItem(at: video.fileURL)
            throw FormCheckMediaError.unavailable
        }
        guard duration <= maximumFormCheckVideoDuration else {
            try? FileManager.default.removeItem(at: video.fileURL)
            throw FormCheckMediaError.videoTooLong
        }

        let fileExtension = video.fileURL.pathExtension.lowercased()
        let mimeType: String
        switch fileExtension {
        case "mp4": mimeType = "video/mp4"
        case "mov": mimeType = "video/quicktime"
        case "m4v": mimeType = "video/x-m4v"
        default:
            try? FileManager.default.removeItem(at: video.fileURL)
            throw FormCheckMediaError.unsupportedVideo
        }

        return SelectedFormCheckMedia(
            kind: .video,
            fileURL: video.fileURL,
            mimeType: mimeType,
            fileSizeBytes: fileSize,
            duration: duration
        )
    }
}

private enum FormCheckPhotoProcessor {
    static func jpegData(from data: Data, maximumDimension: CGFloat = 1_920) -> Data? {
        guard let image = UIImage(data: data) else { return nil }
        let longestSide = max(image.size.width, image.size.height)
        guard longestSide > 0 else { return nil }

        let scale = min(1, maximumDimension / longestSide)
        let targetSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let resized = UIGraphicsImageRenderer(size: targetSize, format: format).image { _ in
            UIColor.black.setFill()
            UIRectFill(CGRect(origin: .zero, size: targetSize))
            image.draw(in: CGRect(origin: .zero, size: targetSize))
        }
        return resized.jpegData(compressionQuality: 0.86)
    }
}

@MainActor
private final class FormCheckSubmissionStore: ObservableObject {
    enum State: Equatable {
        case idle
        case uploading(Double)
        case saving
        case succeeded
        case failed(String)
    }

    @Published private(set) var state: State = .idle

    private let client: SupabaseClient

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
    }

    var isBusy: Bool {
        switch state {
        case .uploading, .saving: true
        case .idle, .succeeded, .failed: false
        }
    }

    func submit(
        context: FormCheckContext,
        clientEmail: String,
        media: SelectedFormCheckMedia,
        note: String
    ) async {
        guard !isBusy else { return }

        do {
            let session = try await client.auth.session
            let userID = session.user.id.uuidString.lowercased()
            let fileExtension = media.fileURL.pathExtension.lowercased()
            let storagePath = "\(userID)/\(UUID().uuidString.lowercased()).\(fileExtension)"

            state = .uploading(0)
            try await upload(
                fileURL: media.fileURL,
                storagePath: storagePath,
                contentType: media.mimeType,
                accessToken: session.accessToken
            )

            state = .saving
            let payload = FormCheckSubmissionPayload(
                clientEmail: clientEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                exerciseCode: String(context.exerciseCode.prefix(120)),
                exerciseName: String(context.exerciseName.prefix(160)),
                workoutTitle: String(context.workoutTitle.prefix(160)),
                mediaType: media.kind,
                storagePath: storagePath,
                mimeType: media.mimeType,
                fileSizeBytes: media.fileSizeBytes,
                mediaDurationSeconds: media.duration,
                note: String(note.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1_000))
            )

            do {
                try await client
                    .from("form_check_submissions")
                    .insert(payload)
                    .execute()
                state = .succeeded
            } catch {
                _ = try? await client.storage.from(formChecksBucket).remove(paths: [storagePath])
                throw error
            }
        } catch is CancellationError {
            state = .idle
        } catch {
            state = .failed("Your form check could not be sent. Check your connection and retry.")
        }
    }

    private func upload(
        fileURL: URL,
        storagePath: String,
        contentType: String,
        accessToken: String
    ) async throws {
        let endpoint = AppConfiguration.supabaseURL
            .appendingPathComponent("storage")
            .appendingPathComponent("v1")
            .appendingPathComponent("object")
            .appendingPathComponent(formChecksBucket)
            .appendingPathComponent(storagePath)

        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue(AppConfiguration.supabasePublishableKey, forHTTPHeaderField: "apikey")
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("false", forHTTPHeaderField: "x-upsert")
        request.setValue("3600", forHTTPHeaderField: "cache-control")

        let progressDelegate = FormCheckUploadProgressDelegate { [weak self] progress in
            Task { @MainActor [weak self] in
                self?.state = .uploading(progress)
            }
        }
        let (responseData, response) = try await URLSession.shared.upload(
            for: request,
            fromFile: fileURL,
            delegate: progressDelegate
        )
        guard let httpResponse = response as? HTTPURLResponse,
              (200..<300).contains(httpResponse.statusCode) else {
            let serverMessage = (try? JSONSerialization.jsonObject(with: responseData))
                .flatMap { $0 as? [String: Any] }?["message"] as? String
            throw FormCheckUploadError.server(serverMessage)
        }
    }
}

private enum FormCheckUploadError: LocalizedError {
    case server(String?)

    var errorDescription: String? {
        switch self {
        case .server(let message): message ?? "The private upload was not accepted."
        }
    }
}

private final class FormCheckUploadProgressDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let didUpdate: @Sendable (Double) -> Void

    init(didUpdate: @escaping @Sendable (Double) -> Void) {
        self.didUpdate = didUpdate
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        guard totalBytesExpectedToSend > 0 else { return }
        didUpdate(min(max(Double(totalBytesSent) / Double(totalBytesExpectedToSend), 0), 1))
    }
}

@MainActor
private final class FormCheckHistoryStore: ObservableObject {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    @Published private(set) var state: LoadState = .idle
    @Published private(set) var submissions: [FormCheckSubmissionRecord] = []

    private let client: SupabaseClient

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
    }

    func loadIfNeeded(clientEmail: String) async {
        guard state == .idle else { return }
        await reload(clientEmail: clientEmail)
    }

    func reload(clientEmail: String) async {
        state = .loading

        do {
            let records: [FormCheckSubmissionRecord] = try await client
                .from("form_check_submissions")
                .select(
                    "id,exercise_code,exercise_name,workout_title,media_type,storage_path,mime_type,file_size_bytes,media_duration_seconds,note,status,coach_feedback,reviewed_at,created_at"
                )
                .eq("client_email", value: clientEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
                .order("created_at", ascending: false)
                .limit(100)
                .execute()
                .value

            guard !Task.isCancelled else { return }
            submissions = records
            state = .loaded
        } catch is CancellationError {
            return
        } catch {
            state = .failed("Your form-check history could not be loaded. Check your connection and try again.")
        }
    }
}

@MainActor
private final class FormCheckPrivateMediaStore: ObservableObject {
    @Published private(set) var signedURL: URL?
    @Published private(set) var isLoading = false

    private let client: SupabaseClient

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
    }

    func load(path: String) async {
        guard !isLoading else { return }
        isLoading = true
        signedURL = nil
        defer { isLoading = false }

        do {
            signedURL = try await client.storage
                .from(formChecksBucket)
                .createSignedURL(path: path, expiresIn: 900)
        } catch is CancellationError {
            return
        } catch {
            signedURL = nil
        }
    }
}

struct FormCheckSubmissionSheet: View {
    @Environment(\.dismiss) private var dismiss

    let context: FormCheckContext
    let clientEmail: String

    @StateObject private var store = FormCheckSubmissionStore()
    @State private var selectedItem: PhotosPickerItem?
    @State private var selectedMedia: SelectedFormCheckMedia?
    @State private var note = ""
    @State private var isPreparingMedia = false
    @State private var mediaMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    submissionHeading
                    exerciseCard
                    mediaPicker
                    noteField
                    uploadState
                    submissionAction
                    privacyNote
                }
                .padding(20)
                .padding(.bottom, 22)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color.fwbBackground)
            .navigationTitle("Send Form Check")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.fwbBackground, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(store.state == .succeeded ? "Done" : "Cancel") {
                        cleanUpAndDismiss()
                    }
                    .foregroundStyle(Color.fwbMuted)
                    .disabled(store.isBusy || isPreparingMedia)
                }
            }
            .onChange(of: selectedItem) { item in
                guard let item else { return }
                Task { await prepare(item: item) }
            }
            .interactiveDismissDisabled(store.isBusy || isPreparingMedia || selectedMedia != nil)
        }
    }

    private var submissionHeading: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("FORM CHECK")
                .font(.footnote.weight(.black))
                .tracking(1.2)
                .foregroundStyle(Color.fwbLime)
            Text("SHOW YOUR\nTECHNIQUE")
                .font(.largeTitle.weight(.black))
                .fontWidth(.condensed)
                .foregroundStyle(Color.fwbWarmWhite)
            Text("Send one clear angle. Your coach will review it privately on the website.")
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var exerciseCard: some View {
        HStack(spacing: 14) {
            Image(systemName: "figure.strengthtraining.traditional")
                .font(.title3.weight(.black))
                .foregroundStyle(.black)
                .frame(width: 46, height: 46)
                .background(Color.fwbAccentFill, in: Rectangle())

            VStack(alignment: .leading, spacing: 4) {
                if !context.exerciseCode.isEmpty {
                    Text(context.exerciseCode.uppercased())
                        .font(.footnote.bold())
                        .tracking(0.8)
                        .foregroundStyle(Color.fwbLime)
                }
                Text(context.exerciseName.fwbTitleCased)
                    .font(.headline.weight(.black))
                    .foregroundStyle(Color.fwbWarmWhite)
                    .fixedSize(horizontal: false, vertical: true)
                if !context.workoutTitle.isEmpty {
                    Text(context.workoutTitle.fwbTitleCased)
                        .font(.footnote)
                        .foregroundStyle(Color.fwbMuted)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .accessibilityElement(children: .combine)
    }

    private var mediaPicker: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("PHOTO OR SHORT VIDEO")
                .font(.footnote.weight(.black))
                .tracking(0.8)
                .foregroundStyle(Color.fwbMuted)

            PhotosPicker(selection: $selectedItem, matching: .any(of: [.images, .videos])) {
                Group {
                    if isPreparingMedia {
                        VStack(spacing: 12) {
                            ProgressView().tint(Color.fwbLime)
                            Text("PREPARING MEDIA…")
                                .font(.headline.weight(.black))
                        }
                    } else if let selectedMedia {
                        selectedMediaPreview(selectedMedia)
                    } else {
                        VStack(spacing: 12) {
                            Image(systemName: "photo.on.rectangle.angled")
                                .font(.system(size: 36, weight: .semibold))
                            Text("CHOOSE PHOTO OR VIDEO")
                                .font(.headline.weight(.black))
                            Text("Videos can be up to 60 seconds and 100 MB.")
                                .font(.footnote)
                                .foregroundStyle(Color.fwbMuted)
                                .multilineTextAlignment(.center)
                        }
                        .foregroundStyle(Color.fwbLime)
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 220)
                    }
                }
                .frame(maxWidth: .infinity)
                .background(Color.fwbCard, in: Rectangle())
                .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
            }
            .buttonStyle(.plain)
            .disabled(store.isBusy || isPreparingMedia || store.state == .succeeded)
            .accessibilityIdentifier("formCheck.mediaPicker")

            if let mediaMessage {
                Text(mediaMessage)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.fwbRed)
            }
        }
    }

    @ViewBuilder
    private func selectedMediaPreview(_ media: SelectedFormCheckMedia) -> some View {
        VStack(spacing: 12) {
            if media.kind == .photo,
               let image = UIImage(contentsOfFile: media.fileURL.path) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(maxHeight: 340)
                    .frame(maxWidth: .infinity)
                    .background(Color.black)
            } else {
                Image(systemName: "play.rectangle.fill")
                    .font(.system(size: 48, weight: .semibold))
                    .foregroundStyle(Color.fwbLime)
                    .frame(maxWidth: .infinity)
                    .frame(height: 180)
                    .background(Color.black)
            }

            HStack(spacing: 10) {
                Label(media.kind.label, systemImage: media.kind.icon)
                    .font(.subheadline.weight(.bold))
                Spacer()
                Text(media.detail)
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)
            }
            .foregroundStyle(Color.fwbWarmWhite)
            .padding(.horizontal, 14)
            .padding(.bottom, 14)
        }
    }

    private var noteField: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("NOTE")
                    .font(.footnote.weight(.black))
                    .foregroundStyle(Color.fwbMuted)
                Spacer()
                Text("\(note.count) / 1000")
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)
            }
            TextField("Optional: what should your coach look at?", text: $note, axis: .vertical)
                .font(.body)
                .lineLimit(3...6)
                .padding(14)
                .background(Color.fwbSurface, in: Rectangle())
                .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
                .disabled(store.isBusy || store.state == .succeeded)
                .onChange(of: note) { value in
                    if value.count > 1_000 {
                        note = String(value.prefix(1_000))
                    }
                }
                .accessibilityIdentifier("formCheck.note")
        }
    }

    @ViewBuilder
    private var uploadState: some View {
        switch store.state {
        case .idle:
            EmptyView()
        case .uploading(let progress):
            VStack(alignment: .leading, spacing: 9) {
                HStack {
                    Label("UPLOADING PRIVATELY", systemImage: "lock.fill")
                        .font(.footnote.weight(.black))
                        .tracking(0.5)
                    Spacer()
                    Text("\(Int(progress * 100))%")
                        .font(.footnote.bold())
                }
                .foregroundStyle(Color.fwbLime)
                ProgressView(value: progress)
                    .tint(Color.fwbLime)
                    .accessibilityLabel("Upload progress")
                    .accessibilityValue("\(Int(progress * 100)) percent")
            }
            .fwbCard()
        case .saving:
            Label("Saving your submission…", systemImage: "arrow.triangle.2.circlepath")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.fwbLime)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fwbCard()
        case .succeeded:
            VStack(alignment: .leading, spacing: 7) {
                Label("FORM CHECK SENT", systemImage: "checkmark.circle.fill")
                    .font(.headline.weight(.black))
                    .foregroundStyle(Color.fwbLime)
                Text("It now appears in your history as Submitted. Your coach will review it on the website.")
                    .font(.subheadline)
                    .foregroundStyle(Color.fwbMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .fwbCard()
        case .failed(let message):
            VStack(alignment: .leading, spacing: 7) {
                Label("UPLOAD INTERRUPTED", systemImage: "exclamationmark.triangle.fill")
                    .font(.headline.weight(.black))
                    .foregroundStyle(Color.fwbRed)
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(Color.fwbMuted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .fwbCard()
        }
    }

    @ViewBuilder
    private var submissionAction: some View {
        if store.state == .succeeded {
            Button("DONE") { cleanUpAndDismiss() }
                .buttonStyle(FWBPrimaryButtonStyle())
                .accessibilityIdentifier("formCheck.done")
        } else {
            Button {
                submit()
            } label: {
                if store.isBusy {
                    ProgressView().tint(.black)
                } else {
                    Label(
                        isRetry ? "RETRY UPLOAD" : "SEND TO COACH",
                        systemImage: isRetry ? "arrow.clockwise" : "paperplane.fill"
                    )
                }
            }
            .buttonStyle(FWBPrimaryButtonStyle())
            .disabled(selectedMedia == nil || store.isBusy || isPreparingMedia)
            .accessibilityIdentifier(isRetry ? "formCheck.retry" : "formCheck.submit")
        }
    }

    private var privacyNote: some View {
        Label(
            "Private media. Only you and your coach can open it through authenticated or short-lived secure access.",
            systemImage: "lock.shield.fill"
        )
        .font(.footnote)
        .foregroundStyle(Color.fwbMuted)
        .fixedSize(horizontal: false, vertical: true)
    }

    private var isRetry: Bool {
        if case .failed = store.state { return true }
        return false
    }

    private func submit() {
        guard let selectedMedia else {
            mediaMessage = "Choose a photo or short video before sending."
            return
        }
        Task {
            await store.submit(
                context: context,
                clientEmail: clientEmail,
                media: selectedMedia,
                note: note
            )
        }
    }

    private func cleanUpAndDismiss() {
        FormCheckMediaLoader.removeTemporaryFile(for: selectedMedia)
        selectedMedia = nil
        dismiss()
    }

    private func prepare(item: PhotosPickerItem) async {
        isPreparingMedia = true
        mediaMessage = nil
        let oldMedia = selectedMedia

        do {
            let media = try await FormCheckMediaLoader.load(item: item)
            guard !Task.isCancelled else {
                FormCheckMediaLoader.removeTemporaryFile(for: media)
                return
            }
            FormCheckMediaLoader.removeTemporaryFile(for: oldMedia)
            selectedMedia = media
        } catch is CancellationError {
            return
        } catch {
            mediaMessage = (error as? LocalizedError)?.errorDescription
                ?? "That item could not be prepared. Try another photo or video."
        }

        isPreparingMedia = false
    }
}

struct FormCheckHistoryView: View {
    let clientEmail: String

    @StateObject private var store = FormCheckHistoryStore()

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            switch store.state {
            case .idle, .loading:
                ProgressView("Loading form checks…")
                    .tint(Color.fwbLime)
            case .loaded:
                historyContent
            case .failed(let message):
                FWBErrorState(message: message) {
                    Task { await store.reload(clientEmail: clientEmail) }
                }
            }
        }
        .navigationTitle("Form Checks")
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .task {
            await store.loadIfNeeded(clientEmail: clientEmail)
        }
        .refreshable {
            await store.reload(clientEmail: clientEmail)
        }
    }

    @ViewBuilder
    private var historyContent: some View {
        if store.submissions.isEmpty {
            FWBEmptyState(
                icon: "video.badge.plus",
                title: "No form checks yet",
                message: "Open an exercise in a workout and choose Send Form Check to share a photo or short video."
            )
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 7) {
                        Text("PRIVATE COACH REVIEW")
                            .font(.footnote.weight(.black))
                            .tracking(1.1)
                            .foregroundStyle(Color.fwbLime)
                        Text("YOUR SUBMISSIONS")
                            .font(.largeTitle.weight(.black))
                            .fontWidth(.condensed)
                            .foregroundStyle(Color.fwbWarmWhite)
                        Text("Track every exercise video or photo from upload through coach review.")
                            .font(.subheadline)
                            .foregroundStyle(Color.fwbMuted)
                    }

                    ForEach(store.submissions) { submission in
                        NavigationLink {
                            FormCheckSubmissionDetailView(submission: submission)
                        } label: {
                            FormCheckHistoryCard(submission: submission)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(20)
                .padding(.bottom, 22)
            }
        }
    }
}

struct FormCheckHistoryLinkCard: View {
    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "video.badge.checkmark")
                .font(.title3.weight(.black))
                .foregroundStyle(.black)
                .frame(width: 46, height: 46)
                .background(Color.fwbAccentFill, in: Rectangle())

            VStack(alignment: .leading, spacing: 4) {
                Text("FORM CHECKS")
                    .font(.headline.weight(.black))
                    .fontWidth(.condensed)
                    .foregroundStyle(Color.fwbWarmWhite)
                Text("View uploads and coach-review status")
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)
            }

            Spacer(minLength: 8)

            Image(systemName: "chevron.right")
                .font(.footnote.weight(.black))
                .foregroundStyle(Color.fwbLime)
        }
        .frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
        .padding(14)
        .background(Color.fwbCard, in: Rectangle())
        .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

private struct FormCheckHistoryCard: View {
    let submission: FormCheckSubmissionRecord

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: submission.mediaType.icon)
                .font(.title3.weight(.black))
                .foregroundStyle(.black)
                .frame(width: 46, height: 46)
                .background(Color.fwbAccentFill, in: Rectangle())

            VStack(alignment: .leading, spacing: 7) {
                Text(submission.exerciseName.fwbTitleCased)
                    .font(.headline.weight(.black))
                    .foregroundStyle(Color.fwbWarmWhite)
                    .fixedSize(horizontal: false, vertical: true)

                if !submission.workoutTitle.isEmpty {
                    Text(submission.workoutTitle.fwbTitleCased)
                        .font(.footnote)
                        .foregroundStyle(Color.fwbMuted)
                }

                Label(submission.status.title, systemImage: submission.status.icon)
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(submission.status.color)

                Text(FormCheckFormat.date(submission.createdAt))
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)
            }

            Spacer(minLength: 8)

            Image(systemName: "chevron.right")
                .font(.footnote.bold())
                .foregroundStyle(Color.fwbMuted)
                .padding(.top, 6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .accessibilityElement(children: .combine)
        .accessibilityLabel(
            "\(submission.exerciseName), \(submission.mediaType.label), "
                + "\(submission.status.title), \(FormCheckFormat.date(submission.createdAt))"
        )
    }
}

private struct FormCheckSubmissionDetailView: View {
    let submission: FormCheckSubmissionRecord

    @StateObject private var mediaStore = FormCheckPrivateMediaStore()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                privateMedia
                submissionSummary

                if !submission.note.isEmpty {
                    detailCard(title: "YOUR NOTE", text: submission.note, color: .fwbWarmWhite)
                }

                if !submission.coachFeedback.isEmpty {
                    detailCard(
                        title: "COACH FEEDBACK",
                        text: submission.coachFeedback,
                        color: submission.status == .needsResubmission ? .fwbRed : .fwbWarmWhite
                    )
                }

                Label(
                    submission.status.detail,
                    systemImage: submission.status.icon
                )
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(submission.status.color)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fwbCard()
            }
            .padding(20)
            .padding(.bottom, 22)
        }
        .background(Color.fwbBackground.ignoresSafeArea())
        .navigationTitle("Form Check")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .task(id: submission.storagePath) {
            await mediaStore.load(path: submission.storagePath)
        }
    }

    @ViewBuilder
    private var privateMedia: some View {
        if mediaStore.isLoading {
            ProgressView("Opening private media…")
                .tint(Color.fwbLime)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 240)
                .background(Color.fwbCard, in: Rectangle())
                .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
        } else if let signedURL = mediaStore.signedURL {
            if submission.mediaType == .photo {
                AsyncImage(url: signedURL) { phase in
                    switch phase {
                    case .empty:
                        ProgressView().tint(Color.fwbLime)
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFit()
                    case .failure:
                        privateMediaUnavailable
                    @unknown default:
                        privateMediaUnavailable
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(minHeight: 240)
                .background(Color.black)
                .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
            } else {
                FormCheckPrivateVideoPlayer(url: signedURL)
            }
        } else {
            privateMediaUnavailable
                .frame(maxWidth: .infinity)
                .frame(minHeight: 240)
                .background(Color.fwbCard, in: Rectangle())
                .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
        }
    }

    private var privateMediaUnavailable: some View {
        VStack(spacing: 10) {
            Image(systemName: "lock.slash")
                .font(.largeTitle)
            Text("PRIVATE PREVIEW UNAVAILABLE")
                .font(.headline.weight(.black))
            Text("Request a new secure link and try again.")
                .font(.footnote)
                .foregroundStyle(Color.fwbMuted)
                .multilineTextAlignment(.center)
            Button("TRY AGAIN") {
                Task { await mediaStore.load(path: submission.storagePath) }
            }
            .font(.footnote.weight(.black))
            .foregroundStyle(Color.fwbLime)
        }
        .foregroundStyle(Color.fwbLime)
        .padding(24)
    }

    private var submissionSummary: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(submission.exerciseName.fwbTitleCased)
                .font(.title2.weight(.black))
                .fontWidth(.condensed)
                .foregroundStyle(Color.fwbWarmWhite)

            if !submission.workoutTitle.isEmpty {
                Text(submission.workoutTitle.fwbTitleCased)
                    .font(.subheadline)
                    .foregroundStyle(Color.fwbMuted)
            }

            FWBRule()

            HStack {
                Label(submission.mediaType.label, systemImage: submission.mediaType.icon)
                Spacer()
                Text(FormCheckFormat.fileSize(submission.fileSizeBytes))
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Color.fwbMuted)

            HStack {
                Label(submission.status.title, systemImage: submission.status.icon)
                    .foregroundStyle(submission.status.color)
                Spacer()
                Text(FormCheckFormat.date(submission.createdAt))
                    .foregroundStyle(Color.fwbMuted)
            }
            .font(.footnote.weight(.bold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }

    private func detailCard(title: String, text: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.footnote.weight(.black))
                .tracking(0.8)
                .foregroundStyle(Color.fwbLime)
            Text(text)
                .font(.body)
                .foregroundStyle(color)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }
}

private struct FormCheckPrivateVideoPlayer: View {
    let url: URL

    @State private var player: AVPlayer?

    var body: some View {
        VideoPlayer(player: player)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 240)
            .background(Color.black)
            .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }
            .onAppear {
                player = AVPlayer(url: url)
            }
            .onDisappear {
                player?.pause()
                player = nil
            }
            .accessibilityLabel("Private form-check video")
    }
}

private enum FormCheckFormat {
    static func date(_ value: String) -> String {
        guard let date = isoFormatter.date(from: value) ?? fractionalISOFormatter.date(from: value) else {
            return value
        }
        return displayDateFormatter.string(from: date)
    }

    static func fileSize(_ bytes: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }

    private static let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let fractionalISOFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let displayDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()
}

private extension Double {
    var formCheckDuration: String {
        let totalSeconds = Int(rounded())
        return String(format: "%d:%02d", totalSeconds / 60, totalSeconds % 60)
    }
}
