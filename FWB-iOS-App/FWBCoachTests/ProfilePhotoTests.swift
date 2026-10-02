import XCTest
@testable import FWBCoach

@MainActor
final class ProfilePhotoTests: XCTestCase {
    private let accountID = UUID(uuidString: "55555555-1111-2222-3333-444444444444")!
    private let otherAccountID = UUID(uuidString: "66666666-1111-2222-3333-444444444444")!
    private let photoID = UUID(uuidString: "ABCDEFAB-1111-2222-3333-444444444444")!
    private let originalImage = Data([1, 2, 3])
    private let replacementImage = Data([4, 5, 6])

    func testProfilePathsAcceptOnlyCanonicalOwnAccountJPEGNames() {
        let valid = ProfilePhotoPath.make(accountID: accountID, photoID: photoID)
        XCTAssertTrue(ProfilePhotoPath.isValid(valid, accountID: accountID))
        for invalid in [
            ProfilePhotoPath.make(accountID: otherAccountID, photoID: photoID),
            valid.uppercased(), valid + "/", "/" + valid, valid + "?download=1",
            valid.replacingOccurrences(of: "/profile/", with: "//profile/"),
            valid.replacingOccurrences(of: "/profile/", with: "/progress/"),
            valid.replacingOccurrences(of: ".jpg", with: ".png"),
            "\(accountID.uuidString.lowercased())/profile/../photo.jpg",
            "\(accountID.uuidString.lowercased())/profile/not-a-uuid.jpg"
        ] {
            XCTAssertFalse(ProfilePhotoPath.isValid(invalid, accountID: accountID), invalid)
        }
    }

    func testForeignMetadataCannotReadAnotherAccountsPhoto() async {
        let repository = makeRepository()
        repository.path = ProfilePhotoPath.make(accountID: otherAccountID)
        let store = makeStore(repository)
        await store.load()
        XCTAssertNil(store.imageData)
        XCTAssertNotNil(store.errorMessage)
        XCTAssertTrue(repository.downloadedPaths.isEmpty)
    }

    func testAccountMismatchStopsLoadSaveAndRemoveBeforeStorageOrMetadataWrites() async {
        let repository = makeRepository()
        repository.currentAccountID = otherAccountID
        let store = makeStore(repository)
        await store.load()
        let saved = await store.save(jpegData: replacementImage)
        let removed = await store.remove()
        XCTAssertFalse(saved)
        XCTAssertFalse(removed)
        XCTAssertNil(store.imageData)
        XCTAssertTrue(repository.downloadedPaths.isEmpty)
        XCTAssertTrue(repository.uploadedPaths.isEmpty)
        XCTAssertTrue(repository.deletedPaths.isEmpty)
        XCTAssertEqual(repository.metadataUpdateCount, 0)
    }

    func testFailedUploadRetainsOriginalImageAndMetadata() async {
        let repository = makeRepository()
        let originalPath = repository.path
        let store = makeStore(repository)
        await store.load()
        repository.failUpload = true
        let saved = await store.save(jpegData: replacementImage)
        XCTAssertFalse(saved)
        XCTAssertEqual(store.imageData, originalImage)
        XCTAssertEqual(repository.path, originalPath)
        XCTAssertEqual(repository.metadataUpdateCount, 0)
        XCTAssertTrue(repository.deletedPaths.isEmpty)
        XCTAssertNotNil(store.errorMessage)
        XCTAssertFalse(store.isSaving)
    }

    func testRejectedMetadataUpdateCleansOnlyConfirmedUnreferencedUpload() async throws {
        let repository = makeRepository()
        let originalPath = repository.path
        let store = makeStore(repository)
        await store.load()
        repository.metadataFailure = .beforeCommit
        let saved = await store.save(jpegData: replacementImage)
        let uploaded = try XCTUnwrap(repository.uploadedPaths.first)
        XCTAssertFalse(saved)
        XCTAssertEqual(store.imageData, originalImage)
        XCTAssertEqual(repository.path, originalPath)
        XCTAssertEqual(repository.deletedPaths, [uploaded])
        XCTAssertNil(repository.images[uploaded])
    }

    func testLostMetadataResponseConfirmsCommittedPhotoBeforeCleanup() async throws {
        let repository = makeRepository()
        let originalPath = try XCTUnwrap(repository.path)
        let store = makeStore(repository)
        await store.load()
        repository.metadataFailure = .afterCommit
        let saved = await store.save(jpegData: replacementImage)
        let committedPath = try XCTUnwrap(repository.path)
        XCTAssertTrue(saved)
        XCTAssertEqual(store.imageData, replacementImage)
        XCTAssertEqual(repository.images[committedPath], replacementImage)
        XCTAssertEqual(repository.deletedPaths, [originalPath])
        XCTAssertNil(store.errorMessage)
    }

    func testUncertainMetadataResultKeepsUploadWhenReadbackFails() async throws {
        let repository = makeRepository()
        let store = makeStore(repository)
        await store.load()
        repository.metadataFailure = .afterCommit
        repository.failReadbackAfterMetadataError = true
        let saved = await store.save(jpegData: replacementImage)
        let uploaded = try XCTUnwrap(repository.uploadedPaths.first)
        XCTAssertFalse(saved)
        XCTAssertEqual(store.imageData, originalImage)
        XCTAssertEqual(repository.path, uploaded)
        XCTAssertEqual(repository.images[uploaded], replacementImage)
        XCTAssertTrue(repository.deletedPaths.isEmpty)
        XCTAssertNotNil(store.errorMessage)
    }

    func testFailedCleanupDoesNotUndoSavedPhoto() async throws {
        let repository = makeRepository()
        let store = makeStore(repository)
        await store.load()
        repository.failDelete = true
        let saved = await store.save(jpegData: replacementImage)
        XCTAssertTrue(saved)
        XCTAssertEqual(store.imageData, replacementImage)
        XCTAssertEqual(repository.images[try XCTUnwrap(repository.path)], replacementImage)
        XCTAssertNil(store.errorMessage)
    }

    func testFailedCleanupDoesNotUndoRemoval() async {
        let repository = makeRepository()
        let store = makeStore(repository)
        await store.load()
        repository.failDelete = true
        let removed = await store.remove()
        XCTAssertTrue(removed)
        XCTAssertNil(repository.path)
        XCTAssertNil(store.imageData)
        XCTAssertNil(store.errorMessage)
    }

    func testRejectedRemovalRetainsOriginalImageAndDoesNotDeleteFile() async {
        let repository = makeRepository()
        let originalPath = repository.path
        let store = makeStore(repository)
        await store.load()
        repository.metadataFailure = .beforeCommit
        let removed = await store.remove()
        XCTAssertFalse(removed)
        XCTAssertEqual(repository.path, originalPath)
        XCTAssertEqual(store.imageData, originalImage)
        XCTAssertTrue(repository.deletedPaths.isEmpty)
    }

    func testLostRemovalResponseConfirmsClearedMetadataAndFinishes() async {
        let repository = makeRepository()
        let originalPath = repository.path
        let store = makeStore(repository)
        await store.load()
        repository.metadataFailure = .afterCommit
        let removed = await store.remove()
        XCTAssertTrue(removed)
        XCTAssertNil(repository.path)
        XCTAssertNil(store.imageData)
        XCTAssertEqual(repository.deletedPaths, [originalPath!])
    }

    func testOlderLoadCannotOverwriteNewerSave() async {
        let repository = makeRepository()
        repository.holdNextDownload = true
        let store = makeStore(repository)
        let started = expectation(description: "Old photo download started")
        repository.downloadStarted = { started.fulfill() }
        let loading = Task { await store.load() }
        await fulfillment(of: [started], timeout: 1)
        XCTAssertTrue(store.isLoading)
        let saved = await store.save(jpegData: replacementImage)
        repository.resumeDownload()
        await loading.value
        XCTAssertTrue(saved)
        XCTAssertEqual(store.imageData, replacementImage)
        XCTAssertFalse(store.isLoading)
        XCTAssertNil(store.errorMessage)
    }

    func testAnotherStoreLoadsCommittedPhotoAndItsRemoval() async {
        let repository = makeRepository()
        let originalStore = makeStore(repository)
        let saved = await originalStore.save(jpegData: replacementImage)
        let anotherDeviceStore = makeStore(repository)
        await anotherDeviceStore.load()
        XCTAssertTrue(saved)
        XCTAssertEqual(anotherDeviceStore.imageData, replacementImage)
        let removed = await originalStore.remove()
        await anotherDeviceStore.load()
        XCTAssertTrue(removed)
        XCTAssertNil(anotherDeviceStore.imageData)
    }

    func testReplacingMalformedMetadataNeverDeletesForeignOrProgressPhotos() async {
        let repository = makeRepository()
        repository.path = "\(accountID.uuidString.lowercased())/2026-09-25-progress.jpg"
        let store = makeStore(repository)
        let saved = await store.save(jpegData: replacementImage)
        XCTAssertTrue(saved)
        XCTAssertEqual(store.imageData, replacementImage)
        XCTAssertTrue(repository.deletedPaths.isEmpty)
    }

    func testEmptyAndOversizedImagesAreRejectedWithoutRepositoryWork() async {
        let repository = makeRepository()
        let store = makeStore(repository)
        let emptySaved = await store.save(jpegData: Data())
        let oversizedSaved = await store.save(jpegData: Data(repeating: 0, count: 6 * 1_024 * 1_024 + 1))
        XCTAssertFalse(emptySaved)
        XCTAssertFalse(oversizedSaved)
        XCTAssertEqual(repository.profileReadCount, 0)
        XCTAssertTrue(repository.uploadedPaths.isEmpty)
    }

    private func makeRepository() -> FakeProfilePhotoRepository {
        let path = ProfilePhotoPath.make(accountID: accountID, photoID: photoID)
        return FakeProfilePhotoRepository(accountID: accountID, path: path, image: originalImage)
    }

    private func makeStore(_ repository: FakeProfilePhotoRepository) -> ProfilePhotoStore {
        ProfilePhotoStore(accountID: accountID, repository: repository)
    }
}

@MainActor
private final class FakeProfilePhotoRepository: ProfilePhotoRepository {
    enum Failure: Error { case simulated }
    enum MetadataFailure { case beforeCommit, afterCommit }

    var currentAccountID: UUID
    var path: String?
    var images: [String: Data]
    var failUpload = false
    var failDelete = false
    var metadataFailure: MetadataFailure?
    var failReadbackAfterMetadataError = false
    var holdNextDownload = false
    var downloadStarted: (() -> Void)?
    private var metadataErrorOccurred = false
    private var heldDownload: CheckedContinuation<Void, Never>?
    private(set) var profileReadCount = 0
    private(set) var metadataUpdateCount = 0
    private(set) var downloadedPaths: [String] = []
    private(set) var uploadedPaths: [String] = []
    private(set) var deletedPaths: [String] = []

    init(accountID: UUID, path: String, image: Data) {
        currentAccountID = accountID
        self.path = path
        images = [path: image]
    }

    func currentProfile() async throws -> ProfilePhotoRecord {
        profileReadCount += 1
        if metadataErrorOccurred && failReadbackAfterMetadataError { throw Failure.simulated }
        return ProfilePhotoRecord(accountID: currentAccountID, path: path)
    }

    func download(path: String, accountID: UUID) async throws -> Data {
        downloadedPaths.append(path)
        let data = images[path] ?? Data()
        if holdNextDownload {
            holdNextDownload = false
            await withCheckedContinuation { continuation in
                heldDownload = continuation
                downloadStarted?()
            }
        }
        return data
    }

    func upload(jpegData: Data, path: String, accountID: UUID) async throws {
        if failUpload { throw Failure.simulated }
        uploadedPaths.append(path)
        images[path] = jpegData
    }

    func updatePhotoPath(_ path: String?, accountID: UUID) async throws -> ProfilePhotoRecord {
        metadataUpdateCount += 1
        if metadataFailure == .beforeCommit {
            metadataErrorOccurred = true
            throw Failure.simulated
        }
        self.path = path
        if metadataFailure == .afterCommit {
            metadataErrorOccurred = true
            throw Failure.simulated
        }
        return ProfilePhotoRecord(accountID: currentAccountID, path: path)
    }

    func delete(path: String, accountID: UUID) async throws {
        deletedPaths.append(path)
        if failDelete { throw Failure.simulated }
        images.removeValue(forKey: path)
    }

    func resumeDownload() {
        heldDownload?.resume()
        heldDownload = nil
    }
}
