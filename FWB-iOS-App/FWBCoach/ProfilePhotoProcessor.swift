import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Converts a selected photo into a small avatar without retaining its location or camera metadata.
/// ImageIO does the downsampling before any bitmap is allocated, so this can run off the main actor.
enum ProfilePhotoProcessor {
    private static let maximumInputBytes = 30 * 1_024 * 1_024
    private static let maximumOutputBytes = 1_024 * 1_024
    private static let maximumAvatarDimension = 512
    private static let maximumDecodedDimension = 2_048

    enum ProcessingError: LocalizedError, Equatable {
        case imageTooLarge
        case invalidImage
        case conversionFailed

        var errorDescription: String? {
            switch self {
            case .imageTooLarge:
                return "Choose a photo smaller than 30 MB."
            case .invalidImage:
                return "This photo could not be opened. Choose another photo."
            case .conversionFailed:
                return "This photo could not be prepared. Choose another photo."
            }
        }
    }

    static func jpegData(from data: Data) throws -> Data {
        guard data.count <= maximumInputBytes else {
            throw ProcessingError.imageTooLarge
        }
        guard !data.isEmpty,
              let source = CGImageSourceCreateWithData(
                data as CFData,
                [kCGImageSourceShouldCache: false] as CFDictionary
              ),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = (properties[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue,
              let height = (properties[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue,
              width.isFinite, height.isFinite, width > 0, height > 0 else {
            throw ProcessingError.invalidImage
        }

        // Aim for a 512-pixel short edge, while also bounding unusually wide panoramas.
        let scale = min(1, Double(maximumAvatarDimension) / min(width, height))
        let thumbnailDimension = Int(min(
            Double(maximumDecodedDimension),
            max(1, ceil(max(width, height) * scale))
        ))
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: thumbnailDimension,
            kCGImageSourceShouldCacheImmediately: true
        ]
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
              thumbnail.width > 0, thumbnail.height > 0 else {
            throw ProcessingError.invalidImage
        }

        let cropDimension = min(thumbnail.width, thumbnail.height)
        let cropRect = CGRect(
            x: (thumbnail.width - cropDimension) / 2,
            y: (thumbnail.height - cropDimension) / 2,
            width: cropDimension,
            height: cropDimension
        )
        let outputDimension = min(maximumAvatarDimension, cropDimension)
        guard let cropped = thumbnail.cropping(to: cropRect),
              let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(
                data: nil,
                width: outputDimension,
                height: outputDimension,
                bitsPerComponent: 8,
                bytesPerRow: outputDimension * 4,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
              ) else {
            throw ProcessingError.conversionFailed
        }

        let outputRect = CGRect(x: 0, y: 0, width: outputDimension, height: outputDimension)
        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.fill(outputRect)
        context.interpolationQuality = .high
        context.draw(cropped, in: outputRect)
        guard let image = context.makeImage() else {
            throw ProcessingError.conversionFailed
        }

        // Encode pixels into a new destination instead of copying the image source's metadata.
        for quality in [0.85, 0.7, 0.5] {
            let output = NSMutableData()
            guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil) else {
                throw ProcessingError.conversionFailed
            }
            CGImageDestinationAddImage(
                destination,
                image,
                [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary
            )
            guard CGImageDestinationFinalize(destination) else {
                throw ProcessingError.conversionFailed
            }
            if output.length <= maximumOutputBytes {
                return output as Data
            }
        }
        throw ProcessingError.conversionFailed
    }
}
