import Combine
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Display-only information for the last account used on this device.
/// A remembered profile never grants access or replaces an authenticated session.
struct RememberedClientProfile: Codable, Equatable {
    let accountID: UUID
    let email: String
    let displayName: String?
    let photoData: Data?
}

@MainActor
final class RememberedProfileStore: ObservableObject {
    static let shared = RememberedProfileStore()

    @Published private(set) var profile: RememberedClientProfile?

    private let fileURL: URL
    private let photoProcessor: @Sendable (Data) async throws -> Data
    private var photoGeneration = 0
    private static let maximumPhotoBytes = 1_024 * 1_024
    private static let maximumCacheBytes = 1_500_000

    init(
        fileURL: URL? = nil,
        photoProcessor: @escaping @Sendable (Data) async throws -> Data = { data in
            try await Task.detached(priority: .utility) {
                try ProfilePhotoProcessor.jpegData(from: data)
            }.value
        }
    ) {
        self.fileURL = fileURL ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("FWBRememberedProfile", isDirectory: true)
            .appendingPathComponent("profile.json")
        self.photoProcessor = photoProcessor
        profile = Self.readProfile(at: self.fileURL)
    }

    func remember(account: SignedInAccount, displayName: String? = nil) {
        let email = account.email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty, email.utf8.count <= 320 else { return }
        let sameAccount = profile?.accountID == account.id
        if !sameAccount { photoGeneration += 1 }
        let name = displayName?.trimmingCharacters(in: .whitespacesAndNewlines)
        profile = RememberedClientProfile(
            accountID: account.id,
            email: email,
            displayName: name.flatMap { $0.isEmpty ? nil : String($0.prefix(160)) }
                ?? (sameAccount ? profile?.displayName : nil),
            photoData: sameAccount ? profile?.photoData : nil
        )
        persist()
    }

    func updatePhoto(_ data: Data?, accountID: UUID) async {
        guard profile?.accountID == accountID else { return }
        photoGeneration += 1
        let generation = photoGeneration
        let thumbnail: Data?
        if let data {
            do {
                thumbnail = try await photoProcessor(data)
                guard let thumbnail, Self.isValidThumbnail(thumbnail) else { return }
            } catch {
                // A malformed or unavailable image must not replace the last valid avatar.
                return
            }
        } else {
            thumbnail = nil
        }
        guard generation == photoGeneration, let current = profile,
              current.accountID == accountID else { return }
        profile = RememberedClientProfile(
            accountID: current.accountID,
            email: current.email,
            displayName: current.displayName,
            photoData: thumbnail
        )
        persist()
    }

    /// Returns false only if the file system could neither remove nor clear the cached data.
    @discardableResult
    func forget() -> Bool {
        photoGeneration += 1
        profile = nil
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return true }
        do {
            try FileManager.default.removeItem(at: fileURL)
            return true
        } catch {
            // If deleting is unavailable but the file remains writable, remove its contents.
            do {
                try Data().write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                return true
            } catch {
                return false
            }
        }
    }

    private func persist() {
        guard let profile else { return }
        do {
            let data = try JSONEncoder().encode(profile)
            guard data.count <= Self.maximumCacheBytes else { return }
            var directory = fileURL.deletingLastPathComponent()
            try FileManager.default.createDirectory(
                at: directory, withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
            )
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try directory.setResourceValues(values)
            try data.write(to: fileURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            var protectedURL = fileURL
            try protectedURL.setResourceValues(values)
        } catch {
            // A display cache failure must not interrupt a successful authenticated action.
            // Remove older data so an account switch cannot restore the previous identity.
            try? FileManager.default.removeItem(at: fileURL)
        }
    }

    private static func readProfile(at url: URL) -> RememberedClientProfile? {
        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            guard let size = attributes[.size] as? NSNumber,
                  size.intValue > 0, size.intValue <= maximumCacheBytes else { return nil }
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            guard let data = try handle.read(upToCount: maximumCacheBytes + 1),
                  data.count <= maximumCacheBytes else { return nil }
            let profile = try JSONDecoder().decode(RememberedClientProfile.self, from: data)
            guard !profile.email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  profile.email.utf8.count <= 320,
                  (profile.displayName?.count ?? 0) <= 160 else { return nil }
            if let photo = profile.photoData, !isValidThumbnail(photo) { return nil }
            return profile
        } catch {
            return nil
        }
    }

    private static func isValidThumbnail(_ data: Data) -> Bool {
        guard !data.isEmpty, data.count <= maximumPhotoBytes,
              let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetType(source) as String? == UTType.jpeg.identifier,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? NSNumber,
              let height = properties[kCGImagePropertyPixelHeight] as? NSNumber else { return false }
        return width.intValue > 0 && width.intValue <= 512 && width == height
    }
}
