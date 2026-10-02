import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import XCTest
@testable import FWBCoach

@MainActor
final class RememberedProfileTests: XCTestCase {
    private let account = SignedInAccount(id: UUID(), email: "client@example.com")
    private let otherAccount = SignedInAccount(id: UUID(), email: "other@example.com")
    private var directories: [URL] = []

    override func tearDown() async throws {
        for directory in directories { try? FileManager.default.removeItem(at: directory) }
        directories.removeAll()
    }

    func testRememberedDisplayProfileSurvivesRelaunchWithoutAuthenticationData() async throws {
        let url = makeURL()
        let store = RememberedProfileStore(fileURL: url)
        store.remember(account: account, displayName: "Jamie Client")
        await store.updatePhoto(try photo(), accountID: account.id)
        let restored = RememberedProfileStore(fileURL: url)
        XCTAssertEqual(restored.profile, store.profile)
        XCTAssertNotNil(restored.profile?.photoData)
        let disk = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        XCTAssertEqual(Set(disk.keys), ["accountID", "email", "displayName", "photoData"])
        XCTAssertTrue(try url.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup == true)
        #if !targetEnvironment(simulator)
        // Simulator uses the host macOS filesystem and does not report iOS data protection.
        let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
        XCTAssertEqual(attributes[.protectionKey] as? FileProtectionType, .completeUntilFirstUserAuthentication)
        #endif
    }

    func testRememberingSameAccountRetainsPhotoAndNameUntilNameChanges() async throws {
        let store = RememberedProfileStore(fileURL: makeURL())
        store.remember(account: account, displayName: "Jamie")
        await store.updatePhoto(try photo(), accountID: account.id)
        let image = store.profile?.photoData
        store.remember(account: account)
        XCTAssertEqual(store.profile?.displayName, "Jamie")
        XCTAssertEqual(store.profile?.photoData, image)
        store.remember(account: account, displayName: "  Jamie Updated  ")
        XCTAssertEqual(store.profile?.displayName, "Jamie Updated")
        XCTAssertEqual(store.profile?.photoData, image)
    }

    func testSwitchingAccountsNeverCarriesPhotoOrNameAcrossAccounts() async throws {
        let url = makeURL()
        let store = RememberedProfileStore(fileURL: url)
        store.remember(account: account, displayName: "Jamie")
        await store.updatePhoto(try photo(), accountID: account.id)
        store.remember(account: otherAccount)
        XCTAssertEqual(store.profile?.accountID, otherAccount.id)
        XCTAssertEqual(store.profile?.email, otherAccount.email)
        XCTAssertNil(store.profile?.photoData)
        XCTAssertNil(store.profile?.displayName)
        XCTAssertEqual(RememberedProfileStore(fileURL: url).profile, store.profile)
        await store.updatePhoto(try photo(), accountID: account.id)
        XCTAssertNil(store.profile?.photoData)
    }

    func testForgetClearsMemoryDiskAndRelaunch() async throws {
        let url = makeURL()
        let store = RememberedProfileStore(fileURL: url)
        store.remember(account: account, displayName: "Jamie")
        await store.updatePhoto(try photo(), accountID: account.id)
        XCTAssertTrue(store.forget())
        XCTAssertNil(store.profile)
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
        XCTAssertNil(RememberedProfileStore(fileURL: url).profile)
        XCTAssertTrue(store.forget())
    }

    func testPhotoCompletionCannotResurrectForgottenProfile() async throws {
        let url = makeURL()
        let gate = ThumbnailGate()
        let store = RememberedProfileStore(fileURL: url, photoProcessor: { data in await gate.process(data) })
        store.remember(account: account)
        let image = try ProfilePhotoProcessor.jpegData(from: photo())
        let pending = Task { await store.updatePhoto(image, accountID: account.id) }
        await gate.waitUntilStarted()
        XCTAssertTrue(store.forget())
        await gate.resume()
        await pending.value
        XCTAssertNil(store.profile)
        XCTAssertNil(RememberedProfileStore(fileURL: url).profile)
    }

    func testPhotoCompletionCannotRestorePhotoAfterForgetAndRememberSameAccount() async throws {
        let gate = ThumbnailGate()
        let store = RememberedProfileStore(fileURL: makeURL(), photoProcessor: { data in await gate.process(data) })
        store.remember(account: account)
        let image = try ProfilePhotoProcessor.jpegData(from: photo())
        let pending = Task { await store.updatePhoto(image, accountID: account.id) }
        await gate.waitUntilStarted()
        store.forget()
        store.remember(account: account)
        await gate.resume()
        await pending.value
        XCTAssertEqual(store.profile?.accountID, account.id)
        XCTAssertNil(store.profile?.photoData)
    }

    func testNewerPhotoRemovalWinsOverOlderConversion() async throws {
        let url = makeURL()
        let gate = ThumbnailGate()
        let store = RememberedProfileStore(fileURL: url, photoProcessor: { data in await gate.process(data) })
        store.remember(account: account)
        let image = try ProfilePhotoProcessor.jpegData(from: photo())
        let pending = Task { await store.updatePhoto(image, accountID: account.id) }
        await gate.waitUntilStarted()
        await store.updatePhoto(nil, accountID: account.id)
        await gate.resume()
        await pending.value
        XCTAssertNil(store.profile?.photoData)
        XCTAssertNil(RememberedProfileStore(fileURL: url).profile?.photoData)
    }

    func testNilPhotoRemovalIsPersistedAndForeignRemovalIsIgnored() async throws {
        let url = makeURL()
        let store = RememberedProfileStore(fileURL: url)
        store.remember(account: account)
        await store.updatePhoto(try photo(), accountID: account.id)
        let image = store.profile?.photoData
        await store.updatePhoto(nil, accountID: otherAccount.id)
        XCTAssertEqual(store.profile?.photoData, image)
        await store.updatePhoto(nil, accountID: account.id)
        XCTAssertNil(RememberedProfileStore(fileURL: url).profile?.photoData)
        XCTAssertEqual(store.profile?.accountID, account.id)
    }

    func testCorruptOversizedAndInvalidImageCachesAreIgnored() throws {
        let url = makeURL()
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let invalidImage = RememberedClientProfile(accountID: account.id, email: account.email, displayName: nil, photoData: Data([1, 2, 3]))
        for data in [Data("broken json".utf8), Data(repeating: 65, count: 1_500_001), try JSONEncoder().encode(invalidImage)] {
            try data.write(to: url)
            XCTAssertNil(RememberedProfileStore(fileURL: url).profile)
        }
    }

    func testPhotoCacheDownsamplesAndRemovesCameraAndLocationMetadata() async throws {
        let store = RememberedProfileStore(fileURL: makeURL())
        store.remember(account: account)
        await store.updatePhoto(try photo(width: 1_800, height: 1_200, metadata: true), accountID: account.id)
        let data = try XCTUnwrap(store.profile?.photoData)
        XCTAssertLessThanOrEqual(data.count, 1_024 * 1_024)
        let source = try XCTUnwrap(CGImageSourceCreateWithData(data as CFData, nil))
        XCTAssertEqual(CGImageSourceGetType(source) as String?, UTType.jpeg.identifier)
        let properties = try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
        XCTAssertEqual((properties[kCGImagePropertyPixelWidth] as? NSNumber)?.intValue, 512)
        XCTAssertEqual((properties[kCGImagePropertyPixelHeight] as? NSNumber)?.intValue, 512)
        XCTAssertNil(properties[kCGImagePropertyGPSDictionary])
        XCTAssertNil((properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any])?[kCGImagePropertyTIFFMake])
    }

    func testInvalidPhotoKeepsLastValidAvatar() async throws {
        let store = RememberedProfileStore(fileURL: makeURL())
        store.remember(account: account)
        await store.updatePhoto(try photo(), accountID: account.id)
        let previous = store.profile
        await store.updatePhoto(Data("not an image".utf8), accountID: account.id)
        XCTAssertEqual(store.profile, previous)
    }

    func testConfirmedProfilePhotoChangesUpdateCacheAndFailuresPreserveIt() async throws {
        let cache = RememberedProfileStore(fileURL: makeURL())
        cache.remember(account: account)
        let repository = RememberedPhotoRepository(accountID: account.id, image: try photo())
        let store = ProfilePhotoStore(accountID: account.id, repository: repository, rememberedProfileStore: cache)
        await store.load()
        XCTAssertNotNil(cache.profile?.photoData)
        let initial = cache.profile?.photoData
        repository.failUpdate = true
        let rejected = await store.save(jpegData: try photo(width: 60, height: 60))
        XCTAssertFalse(rejected)
        XCTAssertEqual(cache.profile?.photoData, initial)
        repository.failUpdate = false
        let saved = await store.save(jpegData: try photo(width: 60, height: 60))
        XCTAssertTrue(saved)
        XCTAssertNotEqual(cache.profile?.photoData, initial)
        let removed = await store.remove()
        XCTAssertTrue(removed)
        XCTAssertNil(cache.profile?.photoData)
    }

    private func makeURL() -> URL {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("RememberedProfileTests-\(UUID())", isDirectory: true)
        directories.append(directory)
        return directory.appendingPathComponent("profile.json")
    }

    private func photo(width: Int = 80, height: Int = 80, metadata: Bool = false) throws -> Data {
        let space = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        let context = try XCTUnwrap(CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
            space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ))
        context.setFillColor(CGColor(red: 0.2, green: 0.5, blue: 0.8, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let image = try XCTUnwrap(context.makeImage())
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(data, UTType.jpeg.identifier as CFString, 1, nil))
        let properties: [CFString: Any] = metadata ? [
            kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 37.7, kCGImagePropertyGPSLatitudeRef: "N"],
            kCGImagePropertyTIFFDictionary: [kCGImagePropertyTIFFMake: "Private camera"]
        ] : [:]
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return data as Data
    }
}

private actor ThumbnailGate {
    private var started = false
    private var startedContinuation: CheckedContinuation<Void, Never>?
    private var processingContinuation: CheckedContinuation<Void, Never>?

    func process(_ data: Data) async -> Data {
        await withCheckedContinuation { continuation in
            processingContinuation = continuation
            started = true
            startedContinuation?.resume()
            startedContinuation = nil
        }
        return data
    }

    func waitUntilStarted() async {
        if started { return }
        await withCheckedContinuation { startedContinuation = $0 }
    }

    func resume() {
        processingContinuation?.resume()
        processingContinuation = nil
    }
}

@MainActor
private final class RememberedPhotoRepository: ProfilePhotoRepository {
    enum Failure: Error { case rejected }
    let accountID: UUID
    var path: String?
    var images: [String: Data]
    var failUpdate = false

    init(accountID: UUID, image: Data) {
        self.accountID = accountID
        let path = ProfilePhotoPath.make(accountID: accountID)
        self.path = path
        images = [path: image]
    }

    func currentProfile() async throws -> ProfilePhotoRecord { ProfilePhotoRecord(accountID: accountID, path: path) }
    func download(path: String, accountID: UUID) async throws -> Data { images[path] ?? Data() }
    func upload(jpegData: Data, path: String, accountID: UUID) async throws { images[path] = jpegData }
    func updatePhotoPath(_ path: String?, accountID: UUID) async throws -> ProfilePhotoRecord {
        if failUpdate { throw Failure.rejected }
        self.path = path
        return ProfilePhotoRecord(accountID: accountID, path: path)
    }
    func delete(path: String, accountID: UUID) async throws { images.removeValue(forKey: path) }
}
