import Foundation
import Supabase

struct ProfilePhotoRecord: Equatable {
    let accountID: UUID
    let path: String?
}

enum ProfilePhotoPath {
    static func make(accountID: UUID, photoID: UUID = UUID()) -> String {
        "\(accountID.uuidString.lowercased())/profile/\(photoID.uuidString.lowercased()).jpg"
    }

    static func isValid(_ path: String, accountID: UUID) -> Bool {
        let parts = path.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 3,
              parts[0] == accountID.uuidString.lowercased(),
              parts[1] == "profile",
              parts[2].hasSuffix(".jpg") else { return false }
        let filename = String(parts[2].dropLast(4))
        guard let photoID = UUID(uuidString: filename) else { return false }
        return photoID.uuidString.lowercased() == filename
    }
}

@MainActor
protocol ProfilePhotoRepository {
    func currentProfile() async throws -> ProfilePhotoRecord
    func download(path: String, accountID: UUID) async throws -> Data
    func upload(jpegData: Data, path: String, accountID: UUID) async throws
    func updatePhotoPath(_ path: String?, accountID: UUID) async throws -> ProfilePhotoRecord
    func delete(path: String, accountID: UUID) async throws
}

private enum ProfilePhotoError: Error {
    case differentAccount, invalidPath, updateNotConfirmed
}

@MainActor
final class SupabaseProfilePhotoRepository: ProfilePhotoRepository {
    private let client: SupabaseClient
    private let bucket = "progress-photos"
    private let metadataKey = "profile_photo_path"

    init(client: SupabaseClient = AppConfiguration.supabase) {
        self.client = client
    }

    func currentProfile() async throws -> ProfilePhotoRecord {
        let user = try await client.auth.user()
        return record(user)
    }

    func download(path: String, accountID: UUID) async throws -> Data {
        try await verify(accountID: accountID, path: path)
        return try await client.storage.from(bucket).download(path: path)
    }

    func upload(jpegData: Data, path: String, accountID: UUID) async throws {
        try await verify(accountID: accountID, path: path)
        try await client.storage.from(bucket).upload(
            path,
            data: jpegData,
            options: FileOptions(cacheControl: "3600", contentType: "image/jpeg", upsert: false)
        )
    }

    func updatePhotoPath(_ path: String?, accountID: UUID) async throws -> ProfilePhotoRecord {
        try await verify(accountID: accountID, path: path)
        let user = try await client.auth.update(
            user: UserAttributes(data: [metadataKey: path.map { .string($0) } ?? .null])
        )
        guard user.id == accountID else { throw ProfilePhotoError.differentAccount }
        return record(user)
    }

    func delete(path: String, accountID: UUID) async throws {
        try await verify(accountID: accountID, path: path)
        _ = try await client.storage.from(bucket).remove(paths: [path])
    }

    private func verify(accountID: UUID, path: String?) async throws {
        if let path, !ProfilePhotoPath.isValid(path, accountID: accountID) {
            throw ProfilePhotoError.invalidPath
        }
        let user = try await client.auth.user()
        guard user.id == accountID else { throw ProfilePhotoError.differentAccount }
    }

    private func record(_ user: User) -> ProfilePhotoRecord {
        ProfilePhotoRecord(accountID: user.id, path: user.userMetadata[metadataKey]?.stringValue)
    }
}

@MainActor
final class ProfilePhotoStore: ObservableObject {
    @Published private(set) var imageData: Data?
    @Published private(set) var isLoading = false
    @Published private(set) var isSaving = false
    @Published var errorMessage: String?

    private let accountID: UUID
    private let repository: any ProfilePhotoRepository
    private let rememberedProfileStore: RememberedProfileStore
    private var operationGeneration = 0
    private let maximumPhotoBytes = 6 * 1_024 * 1_024

    init(
        accountID: UUID,
        repository: (any ProfilePhotoRepository)? = nil,
        rememberedProfileStore: RememberedProfileStore? = nil
    ) {
        self.accountID = accountID
        self.repository = repository ?? SupabaseProfilePhotoRepository()
        self.rememberedProfileStore = rememberedProfileStore ?? .shared
    }

    func load() async {
        guard !isSaving else { return }
        operationGeneration += 1
        let generation = operationGeneration
        isLoading = true
        errorMessage = nil
        defer {
            if generation == operationGeneration { isLoading = false }
        }

        do {
            let profile = try await verifiedProfile()
            let data: Data?
            if let path = profile.path {
                guard ProfilePhotoPath.isValid(path, accountID: accountID) else {
                    throw ProfilePhotoError.invalidPath
                }
                data = try await repository.download(path: path, accountID: accountID)
            } else {
                data = nil
            }
            guard generation == operationGeneration else { return }
            imageData = data
            await rememberedProfileStore.updatePhoto(data, accountID: accountID)
        } catch {
            guard generation == operationGeneration else { return }
            errorMessage = "Your profile photo could not be loaded. Check your connection and try again."
        }
    }

    func save(jpegData: Data) async -> Bool {
        guard !isSaving else { return false }
        guard !jpegData.isEmpty, jpegData.count <= maximumPhotoBytes else {
            errorMessage = "That photo could not be prepared. Try another image."
            return false
        }
        beginMutation()
        defer { isSaving = false }

        do {
            let previous = try await verifiedProfile()
            let path = ProfilePhotoPath.make(accountID: accountID)
            try await repository.upload(jpegData: jpegData, path: path, accountID: accountID)
            try await updateMetadata(to: path, uploadedPath: path)
            imageData = jpegData
            await rememberedProfileStore.updatePhoto(jpegData, accountID: accountID)
            await cleanUp(previous.path, excluding: path)
            return true
        } catch {
            errorMessage = "Your profile photo could not be saved. Check your connection and try again."
            return false
        }
    }

    func remove() async -> Bool {
        guard !isSaving else { return false }
        beginMutation()
        defer { isSaving = false }

        do {
            let previous = try await verifiedProfile()
            try await updateMetadata(to: nil, uploadedPath: nil)
            imageData = nil
            await rememberedProfileStore.updatePhoto(nil, accountID: accountID)
            await cleanUp(previous.path)
            return true
        } catch {
            errorMessage = "Your profile photo could not be removed. Check your connection and try again."
            return false
        }
    }

    private func beginMutation() {
        operationGeneration += 1
        isLoading = false
        isSaving = true
        errorMessage = nil
    }

    private func verifiedProfile() async throws -> ProfilePhotoRecord {
        let profile = try await repository.currentProfile()
        guard profile.accountID == accountID else { throw ProfilePhotoError.differentAccount }
        return profile
    }

    private func updateMetadata(to desiredPath: String?, uploadedPath: String?) async throws {
        do {
            let saved = try await repository.updatePhotoPath(desiredPath, accountID: accountID)
            guard saved.accountID == accountID, saved.path == desiredPath else {
                throw ProfilePhotoError.updateNotConfirmed
            }
        } catch {
            let updateError = error
            // A lost response may follow a committed Auth update. Only remove
            // the upload after a successful read confirms it is unreferenced.
            let confirmed: ProfilePhotoRecord
            do {
                confirmed = try await verifiedProfile()
            } catch {
                throw updateError
            }
            if confirmed.path == desiredPath { return }
            await cleanUp(uploadedPath)
            throw updateError
        }
    }

    private func cleanUp(_ path: String?, excluding retainedPath: String? = nil) async {
        guard let path, path != retainedPath,
              ProfilePhotoPath.isValid(path, accountID: accountID) else { return }
        // Metadata is the source of truth. Cleanup failure must not undo a
        // committed replacement/removal or discard the newly selected image.
        try? await repository.delete(path: path, accountID: accountID)
    }
}
