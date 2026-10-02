import SwiftUI
import UIKit

enum FWBBrand {
    static let productName = "FWB Training"
    static let promise = "Train with intention. Feel your progress."
}

extension String {
    /// Storage titles keep their original identifiers; presentation removes only
    /// the generated wrapper and a validated trailing UUID.
    var fwbWorkoutDisplayTitle: String {
        let title = trimmingCharacters(in: .whitespacesAndNewlines)
        if title.lowercased().hasPrefix("copy of ") {
            var source = String(title.dropFirst("Copy of ".count))
            // Older copies used an eight-digit ID, only in this known format.
            if let suffix = source.range(of: " · [0-9a-fA-F]{8}$", options: .regularExpression) {
                source = String(source[..<suffix.lowerBound])
            }
            return "Copy of " + source.fwbWorkoutDisplayTitle
        }
        var parts = title.components(separatedBy: "·").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        if parts.count > 1, let last = parts.last, UUID(uuidString: last) != nil {
            parts.removeLast()
        }
        if parts.count > 1, parts.first?.caseInsensitiveCompare("Custom workout") == .orderedSame {
            parts.removeFirst()
        }
        let display = parts.joined(separator: " · ")
        return display.isEmpty ? title : display
    }

    /// Capitalizes the first letter of each displayed word without lowercasing
    /// the rest of the word, so exercise acronyms such as RDL and TRX survive.
    var fwbTitleCased: String {
        var result = ""
        var shouldCapitalize = true

        for character in self {
            let scalars = character.unicodeScalars
            let isLetter = scalars.contains { CharacterSet.letters.contains($0) }
            let isNumber = scalars.contains { CharacterSet.decimalDigits.contains($0) }

            if shouldCapitalize && isLetter {
                result.append(contentsOf: String(character).uppercased())
            } else {
                result.append(character)
            }

            if isLetter || isNumber {
                shouldCapitalize = false
            } else if character == "'" || character == "’" {
                shouldCapitalize = false
            } else {
                shouldCapitalize = true
            }
        }

        return result
    }
}

extension Color {
    // Canonical cross-platform brand roles. Values live in Assets.xcassets so
    // launch, SwiftUI, UIKit, widgets, and future extensions share one source.
    static let fwbBrandPrimary = Color("BrandPrimary")
    static let fwbBrandPrimaryInk = Color("BrandPrimaryInk")
    static let fwbInk = Color("Ink")
    static let fwbInkDeep = Color("InkDeep")
    static let fwbCanvas = Color("Canvas")
    static let fwbSurfaceSoft = Color("SurfaceSoft")
    static let fwbSurfaceRaised = Color("Surface")
    static let fwbTextMuted = Color("TextMuted")
    static let fwbBorder = Color("Border")
    static let fwbFocus = Color("Focus")

    // Compatibility aliases keep the existing UI stable while feature views
    // migrate to the semantic roles above. `fwbLime` is still widely used for
    // small text, so its light value remains darker than the non-text focus
    // token to preserve WCAG AA contrast on canvas and raised surfaces.
    static let fwbAccentFill = fwbBrandPrimary
    static let fwbLime = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 214 / 255, green: 1, blue: 53 / 255, alpha: 1)
            : UIColor(red: 0.286, green: 0.408, blue: 0.0, alpha: 1)
    })
    static let fwbRed = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 1.0, green: 0.231, blue: 0.188, alpha: 1)
            : UIColor(red: 0.72, green: 0.08, blue: 0.06, alpha: 1)
    })
    static let fwbBackground = fwbCanvas
    static let fwbCard = fwbSurfaceRaised
    static let fwbSurface = fwbSurfaceSoft
    static let fwbWarmWhite = fwbInk
    static let fwbMuted = fwbTextMuted
    static let fwbLine = fwbBorder
}

struct FWBMark: View {
    var size: CGFloat = 72

    var body: some View {
        Image("BrandMark")
            .resizable()
            .scaledToFit()
            .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
        .frame(width: size, height: size)
        .accessibilityLabel("FWB Training")
    }
}

struct FWBRule: View {
    var color: Color = .fwbLine

    var body: some View {
        Rectangle()
            .fill(color)
            .frame(height: 1)
            .accessibilityHidden(true)
    }
}

enum FWBLayout {
    static let cardRadius: CGFloat = 18
    static let controlRadius: CGFloat = 12
    static let pagePadding: CGFloat = 16
}

struct FWBCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: FWBLayout.cardRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: FWBLayout.cardRadius, style: .continuous)
                    .strokeBorder(Color.fwbLine, lineWidth: 1)
            }
            .shadow(color: .black.opacity(0.025), radius: 10, y: 4)
    }
}

struct FWBPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(FWBFont.headline.weight(.bold))
            .foregroundStyle(Color.fwbBrandPrimaryInk)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 52)
            .padding(.horizontal, 16)
            .background(Color.fwbAccentFill, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous)
                    .stroke(Color.fwbAccentFill, lineWidth: 1)
            }
            .opacity(isEnabled ? 1 : 0.42)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.985 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct FWBSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(FWBFont.headline.weight(.bold))
            .foregroundStyle(Color.fwbLime)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 50)
            .padding(.horizontal, 16)
            .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous)
                    .stroke(Color.fwbLime, lineWidth: 1)
            }
            .opacity(isEnabled ? 1 : 0.42)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.985 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct FWBDestructiveButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(FWBFont.headline.weight(.bold))
            .foregroundStyle(Color.fwbRed)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 50)
            .padding(.horizontal, 16)
            .background(Color.fwbCard, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous)
                    .stroke(Color.fwbRed.opacity(0.75), lineWidth: 1)
            }
            .opacity(isEnabled ? 1 : 0.42)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.985 : 1)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct FWBTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(minHeight: 52)
            .background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous)
                    .stroke(Color.fwbLine, lineWidth: 1)
            }
    }
}

extension View {
    func fwbCard() -> some View {
        modifier(FWBCardModifier())
    }
}

struct FWBLoadingState: View {
    let title: String
    var message: String = FWBBrand.promise

    var body: some View {
        VStack(spacing: 14) {
            ProgressView()
                .controlSize(.large)
                .tint(Color.fwbBrandPrimary)
                .accessibilityHidden(true)
            Text(title)
                .font(FWBFont.title3.weight(.bold))
                .foregroundStyle(Color.fwbInk)
                .multilineTextAlignment(.center)
            Text(message)
                .font(FWBFont.subheadline)
                .foregroundStyle(Color.fwbTextMuted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(title). \(message)")
    }
}

struct FWBBrandPromise: View {
    var body: some View {
        HStack(spacing: 10) {
            FWBMark(size: 34)
            VStack(alignment: .leading, spacing: 2) {
                Text(FWBBrand.productName)
                    .font(FWBFont.footnote.weight(.bold))
                    .foregroundStyle(Color.fwbInk)
                Text(FWBBrand.promise)
                    .font(FWBFont.caption)
                    .foregroundStyle(Color.fwbTextMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// The web app's Inter family, using the same compact size hierarchy while
/// retaining the user's Dynamic Type preference.
enum FWBFont {
    static func sized(_ size: CGFloat, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom("Inter-Regular", size: size, relativeTo: style)
    }
    static let largeTitle = sized(30, relativeTo: .largeTitle)
    static let title = sized(28, relativeTo: .title)
    static let title2 = sized(24, relativeTo: .title2)
    static let title3 = sized(20, relativeTo: .title3)
    static let headline = sized(17, relativeTo: .headline)
    static let body = sized(16)
    static let callout = sized(16, relativeTo: .callout)
    static let subheadline = sized(14, relativeTo: .subheadline)
    static let footnote = sized(13, relativeTo: .footnote)
    static let caption = sized(12, relativeTo: .caption)
    static let caption2 = sized(11, relativeTo: .caption2)
}
