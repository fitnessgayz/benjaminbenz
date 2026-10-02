import SwiftUI
import PhotosUI

private enum ProfilePhotoSheet: String, Identifiable {
    case editor
    var id: String { rawValue }
}

struct ProfilePhotoAccountCard: View {
    let account: SignedInAccount
    @StateObject private var store: ProfilePhotoStore
    @State private var sheet: ProfilePhotoSheet?
    @Environment(\.scenePhase) private var scenePhase

    init(account: SignedInAccount, store: ProfilePhotoStore? = nil) {
        self.account = account
        _store = StateObject(wrappedValue: store ?? ProfilePhotoStore(accountID: account.id))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { sheet = .editor } label: {
                HStack(spacing: 14) {
                    ZStack(alignment: .bottomTrailing) {
                        ProfilePhotoAvatar(data: store.imageData, size: 64)
                        Image(systemName: "camera.fill")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Color.fwbBackground)
                            .frame(width: 24, height: 24)
                            .background(Color.fwbLime, in: Circle())
                            .overlay { Circle().stroke(Color.fwbCard, lineWidth: 2) }
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        Text(account.email)
                            .font(FWBFont.subheadline.weight(.semibold))
                            .foregroundStyle(Color.fwbWarmWhite)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                        Text("Client account")
                            .font(FWBFont.caption)
                            .foregroundStyle(Color.fwbMuted)
                        Text(store.imageData == nil ? "Add profile photo" : "Change profile photo")
                            .font(FWBFont.caption.weight(.semibold))
                            .foregroundStyle(Color.fwbLime)
                    }
                    Spacer(minLength: 0)
                    if store.isLoading { ProgressView().tint(Color.fwbLime) }
                    else {
                        Image(systemName: "chevron.right")
                            .font(FWBFont.footnote)
                            .foregroundStyle(Color.fwbMuted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(store.imageData == nil ? "Add profile photo" : "Change profile photo")
            .accessibilityValue(account.email)
            .accessibilityIdentifier("settings.profilePhoto")

            if let error = store.errorMessage, sheet == nil {
                Text(error)
                    .font(FWBFont.footnote)
                    .foregroundStyle(Color.fwbMuted)
                Button("Try again") { Task { await store.load() } }
                    .font(FWBFont.footnote.weight(.semibold))
                    .foregroundStyle(Color.fwbLime)
                    .accessibilityIdentifier("settings.profilePhoto.retry")
            }
        }
        .fwbCard()
        .task(id: account.id) { await store.load() }
        .onChange(of: scenePhase) { phase in
            if phase == .active { Task { await store.load() } }
        }
        .sheet(item: $sheet) { _ in ProfilePhotoEditor(store: store) }
    }
}

struct ProfilePhotoAvatar: View {
    let data: Data?
    let size: CGFloat

    var body: some View {
        Group {
            if let data, let image = UIImage(data: data) {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Image(systemName: "person.crop.circle.fill")
                    .resizable().scaledToFit()
                    .foregroundStyle(Color.fwbLime)
                    .padding(size * 0.06)
            }
        }
        .frame(width: size, height: size)
        .background(Color.fwbBackground, in: Circle())
        .clipShape(Circle())
        .overlay { Circle().stroke(Color.fwbLine, lineWidth: 1) }
        .accessibilityHidden(true)
    }
}

private struct ProfilePhotoEditor: View {
    @ObservedObject var store: ProfilePhotoStore
    @Environment(\.dismiss) private var dismiss
    @State private var selectedItem: PhotosPickerItem?
    @State private var preparedPhoto: Data?
    @State private var isPreparing = false
    @State private var selectionError: String?
    @State private var confirmRemoval = false

    private var isBusy: Bool { isPreparing || store.isSaving }

    var body: some View {
        let savedPhoto = store.imageData
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    ProfilePhotoAvatar(data: preparedPhoto ?? savedPhoto, size: 200)
                        .padding(.top, 24)
                    Text("Make your account your own")
                        .font(FWBFont.title.weight(.bold))
                        .foregroundStyle(Color.fwbWarmWhite)
                        .multilineTextAlignment(.center)
                    Text("Choose a photo from your library. Your profile photo is saved to your account and shown as a circle.")
                        .font(FWBFont.subheadline)
                        .foregroundStyle(Color.fwbMuted)
                        .multilineTextAlignment(.center)

                    PhotosPicker(selection: $selectedItem, matching: .images) {
                        Label(preparedPhoto == nil && savedPhoto == nil ? "Choose photo" : "Choose another photo", systemImage: "photo.on.rectangle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(FWBSecondaryButtonStyle())
                    .disabled(store.isSaving)
                    .accessibilityIdentifier("profilePhoto.choose")

                    if isBusy {
                        HStack(spacing: 8) {
                            ProgressView().tint(Color.fwbLime)
                            Text(isPreparing ? "Preparing photo…" : "Saving…")
                                .font(FWBFont.footnote)
                                .foregroundStyle(Color.fwbMuted)
                        }
                    }
                    if let error = selectionError ?? store.errorMessage {
                        Text(error)
                            .font(FWBFont.footnote)
                            .foregroundStyle(Color.fwbRed)
                            .multilineTextAlignment(.center)
                            .accessibilityIdentifier("profilePhoto.error")
                    }
                    if savedPhoto != nil {
                        Button("Remove profile photo", role: .destructive) { confirmRemoval = true }
                            .font(FWBFont.subheadline.weight(.semibold))
                            .frame(minHeight: 44)
                            .disabled(isBusy)
                            .accessibilityIdentifier("profilePhoto.remove")
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(FWBLayout.pagePadding)
            }
            .background(Color.fwbBackground.ignoresSafeArea())
            .navigationTitle("Profile photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(store.isSaving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        guard let preparedPhoto else { return }
                        Task { if await store.save(jpegData: preparedPhoto) { dismiss() } }
                    }
                    .fontWeight(.semibold)
                    .disabled(preparedPhoto == nil || isBusy)
                    .accessibilityIdentifier("profilePhoto.save")
                }
            }
            .interactiveDismissDisabled(store.isSaving)
            .confirmationDialog("Remove your profile photo?", isPresented: $confirmRemoval, titleVisibility: .visible) {
                Button("Remove photo", role: .destructive) {
                    Task { if await store.remove() { dismiss() } }
                }
            } message: { Text("Your account will show the default profile icon.") }
            .task(id: selectedItem) {
                guard let selectedItem else { return }
                isPreparing = true
                selectionError = nil
                defer { if !Task.isCancelled { isPreparing = false } }
                do {
                    guard let data = try await selectedItem.loadTransferable(type: Data.self) else {
                        throw CocoaError(.fileReadCorruptFile)
                    }
                    try Task.checkCancellation()
                    let jpeg = try await Task.detached(priority: .userInitiated) {
                        try ProfilePhotoProcessor.jpegData(from: data)
                    }.value
                    try Task.checkCancellation()
                    preparedPhoto = jpeg
                } catch is CancellationError {
                    // A newer selection or dismissal superseded this operation.
                } catch {
                    guard !Task.isCancelled else { return }
                    selectionError = "That photo couldn’t be prepared. Try a different image."
                }
            }
        }
    }
}

#if DEBUG
/// Exercises the real account card and photo editor without changing an account.
struct ProfilePhotoAuditView: View {
    private let account = SignedInAccount(id: UUID(uuidString: "CAEA157B-EE1B-4CCD-BAA8-740BFF70AB07")!, email: "client@example.com")

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SectionHeading(kicker: "Your app", title: "Settings")
                    ProfilePhotoAccountCard(account: account, store: ProfilePhotoStore(accountID: account.id,
                        repository: ProfilePhotoAuditRepository(accountID: account.id)))
                }.padding(FWBLayout.pagePadding)
            }
            .background(Color.fwbBackground.ignoresSafeArea())
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
        }
        .preferredColorScheme(.light)
    }
}

@MainActor
private final class ProfilePhotoAuditRepository: ProfilePhotoRepository {
    let accountID: UUID
    var path: String?
    var images: [String: Data] = [:]
    init(accountID: UUID) {
        self.accountID = accountID
        if ProcessInfo.processInfo.arguments.contains("--profile-photo-existing") {
            let size = CGSize(width: 256, height: 256)
            let image = UIGraphicsImageRenderer(size: size).image { _ in
                UIColor.systemGreen.setFill()
                UIRectFill(CGRect(origin: .zero, size: size))
                UIImage(systemName: "person.fill")?
                    .withTintColor(.white, renderingMode: .alwaysOriginal)
                    .draw(in: CGRect(x: 52, y: 36, width: 152, height: 190))
            }
            if let data = image.jpegData(compressionQuality: 0.8) {
                let photoPath = ProfilePhotoPath.make(accountID: accountID)
                path = photoPath
                images[photoPath] = data
            }
        }
    }
    func currentProfile() async throws -> ProfilePhotoRecord { ProfilePhotoRecord(accountID: accountID, path: path) }
    func download(path: String, accountID: UUID) async throws -> Data {
        guard let data = images[path] else { throw CocoaError(.fileNoSuchFile) }
        return data
    }
    func upload(jpegData: Data, path: String, accountID: UUID) async throws { images[path] = jpegData }
    func updatePhotoPath(_ path: String?, accountID: UUID) async throws -> ProfilePhotoRecord {
        self.path = path
        return ProfilePhotoRecord(accountID: accountID, path: path)
    }
    func delete(path: String, accountID: UUID) async throws { images.removeValue(forKey: path) }
}
#endif
