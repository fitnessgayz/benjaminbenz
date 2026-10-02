import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers
import XCTest
@testable import FWBCoach

final class ProfilePhotoProcessorTests: XCTestCase {
    func testRejectsEmptyAndInvalidData() {
        for data in [Data(), Data("not an image".utf8)] {
            XCTAssertThrowsError(try ProfilePhotoProcessor.jpegData(from: data)) { error in
                XCTAssertEqual(error as? ProfilePhotoProcessor.ProcessingError, .invalidImage)
            }
        }
    }

    func testRejectsInputOverThirtyMegabytesBeforeDecoding() {
        let data = Data(repeating: 0, count: 30 * 1_024 * 1_024 + 1)
        XCTAssertThrowsError(try ProfilePhotoProcessor.jpegData(from: data)) { error in
            XCTAssertEqual(error as? ProfilePhotoProcessor.ProcessingError, .imageTooLarge)
        }
    }

    func testLandscapeAndPortraitProduceBoundedSquareJPEGs() throws {
        for (width, height) in [(1_600, 800), (800, 1_600), (512, 512)] {
            let input = try encodedImage(width: width, height: height)
            let output = try ProfilePhotoProcessor.jpegData(from: input)
            let source = try XCTUnwrap(CGImageSourceCreateWithData(output as CFData, nil))
            let image = try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, nil))
            XCTAssertEqual(CGImageSourceGetType(source) as String?, UTType.jpeg.identifier)
            XCTAssertEqual(image.width, 512)
            XCTAssertEqual(image.height, 512)
            XCTAssertLessThanOrEqual(output.count, 1_024 * 1_024)
        }
    }

    func testSmallImageRemainsWellFormedWithoutUpscaling() throws {
        let output = try ProfilePhotoProcessor.jpegData(from: encodedImage(width: 40, height: 24))
        let image = try decodedImage(output)
        XCTAssertEqual(image.width, 24)
        XCTAssertEqual(image.height, 24)
        XCTAssertGreaterThan(output.count, 0)
    }

    func testCenterCropKeepsMiddleOfLandscapeAndPortrait() throws {
        for (width, height) in [(120, 40), (40, 120)] {
            let input = try encodedImage(width: width, height: height) { x, y in
                let inCenter = width > height ? (40..<80).contains(x) : (40..<80).contains(y)
                return inCenter ? [0, 200, 0, 255] : [200, 0, 0, 255]
            }
            let pixels = try rgbaPixels(decodedImage(ProfilePhotoProcessor.jpegData(from: input)))
            // The entire center square is green, including well inside its edges.
            for point in [(5, 5), (20, 20), (34, 34)] {
                let offset = (point.1 * 40 + point.0) * 4
                XCTAssertLessThan(pixels[offset], 30)
                XCTAssertGreaterThan(pixels[offset + 1], 170)
            }
        }
    }

    func testStripsLocationAndCameraMetadata() throws {
        let input = try encodedImage(width: 64, height: 64, properties: [
            kCGImagePropertyGPSDictionary: [
                kCGImagePropertyGPSLatitude: 37.7,
                kCGImagePropertyGPSLatitudeRef: "N",
                kCGImagePropertyGPSLongitude: 122.4,
                kCGImagePropertyGPSLongitudeRef: "W"
            ],
            kCGImagePropertyExifDictionary: [kCGImagePropertyExifDateTimeOriginal: "2026:09:25 13:00:00"],
            kCGImagePropertyTIFFDictionary: [kCGImagePropertyTIFFMake: "Private camera"]
        ])
        let sourceProperties = try properties(of: input)
        XCTAssertNotNil(sourceProperties[kCGImagePropertyGPSDictionary])
        XCTAssertNotNil(sourceProperties[kCGImagePropertyExifDictionary])

        let output = try ProfilePhotoProcessor.jpegData(from: input)
        let outputProperties = try properties(of: output)
        XCTAssertNil(outputProperties[kCGImagePropertyGPSDictionary])
        let exif = outputProperties[kCGImagePropertyExifDictionary] as? [CFString: Any]
        XCTAssertNil(exif?[kCGImagePropertyExifDateTimeOriginal])
        let tiff = outputProperties[kCGImagePropertyTIFFDictionary] as? [CFString: Any]
        XCTAssertNil(tiff?[kCGImagePropertyTIFFMake])
    }

    func testOrientationIsAppliedToPixelsBeforeMetadataIsRemoved() throws {
        let input = try encodedImage(
            width: 64,
            height: 32,
            properties: [kCGImagePropertyOrientation: 6]
        ) { x, _ in
            x < 32 ? [240, 0, 0, 255] : [0, 0, 240, 255]
        }
        let output = try ProfilePhotoProcessor.jpegData(from: input)
        let image = try decodedImage(output)
        let pixels = try rgbaPixels(image)
        XCTAssertEqual(image.width, 32)
        XCTAssertEqual(image.height, 32)

        let top = (4 * image.width + 16) * 4
        let bottom = (27 * image.width + 16) * 4
        let topIsRed = pixels[top] > 180 && pixels[top + 2] < 40
        let topIsBlue = pixels[top + 2] > 180 && pixels[top] < 40
        let bottomIsRed = pixels[bottom] > 180 && pixels[bottom + 2] < 40
        let bottomIsBlue = pixels[bottom + 2] > 180 && pixels[bottom] < 40
        XCTAssertTrue((topIsRed && bottomIsBlue) || (topIsBlue && bottomIsRed))
        XCTAssertEqual((try properties(of: output)[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1, 1)
    }

    func testTransparentInputGetsWhiteBackground() throws {
        let input = try encodedImage(width: 32, height: 32, type: .png) { _, _ in [0, 0, 0, 0] }
        let image = try decodedImage(ProfilePhotoProcessor.jpegData(from: input))
        let pixels = try rgbaPixels(image)
        XCTAssertGreaterThan(pixels[0], 245)
        XCTAssertGreaterThan(pixels[1], 245)
        XCTAssertGreaterThan(pixels[2], 245)
        XCTAssertEqual(pixels[3], 255)
    }

    private func encodedImage(
        width: Int,
        height: Int,
        type: UTType = .jpeg,
        properties: [CFString: Any] = [:],
        pixel: (Int, Int) -> [UInt8] = { _, _ in [60, 120, 180, 255] }
    ) throws -> Data {
        var bytes = [UInt8]()
        bytes.reserveCapacity(width * height * 4)
        for y in 0..<height {
            for x in 0..<width {
                bytes.append(contentsOf: pixel(x, y))
            }
        }
        let colorSpace = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        let provider = try XCTUnwrap(CGDataProvider(data: Data(bytes) as CFData))
        let image = try XCTUnwrap(CGImage(
            width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
            bytesPerRow: width * 4, space: colorSpace,
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue),
            provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent
        ))
        let data = NSMutableData()
        let destination = try XCTUnwrap(CGImageDestinationCreateWithData(data, type.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(destination, image, properties as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return data as Data
    }

    private func decodedImage(_ data: Data) throws -> CGImage {
        let source = try XCTUnwrap(CGImageSourceCreateWithData(data as CFData, nil))
        return try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, nil))
    }

    private func properties(of data: Data) throws -> [CFString: Any] {
        let source = try XCTUnwrap(CGImageSourceCreateWithData(data as CFData, nil))
        return try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
    }

    private func rgbaPixels(_ image: CGImage) throws -> [UInt8] {
        let colorSpace = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        let context = try XCTUnwrap(CGContext(
            data: nil, width: image.width, height: image.height, bitsPerComponent: 8,
            bytesPerRow: image.width * 4, space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
        ))
        context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
        let data = try XCTUnwrap(context.data)
        return Array(UnsafeBufferPointer(start: data.assumingMemoryBound(to: UInt8.self), count: image.width * image.height * 4))
    }
}
