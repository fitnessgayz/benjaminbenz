import SwiftUI
import UIKit

extension String {
    /// A copied log retains a unique storage title without exposing its suffix in UI.
    var fwbWorkoutDisplayTitle: String {
        guard hasPrefix("Copy of "), let suffix = range(of: " · [0-9a-f]{8}$", options: .regularExpression) else { return self }
        return String(self[..<suffix.lowerBound])
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
    // Shared with css/fwb-design-system.css; semantic variants preserve dark mode.
    static let fwbAccentFill = Color(red: 214 / 255, green: 1, blue: 53 / 255)
    static let fwbGold = Color(red: 0.91, green: 0.65, blue: 0.08)
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
    static let fwbBackground = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.090, green: 0.098, blue: 0.094, alpha: 1)
            : UIColor(red: 242 / 255, green: 243 / 255, blue: 238 / 255, alpha: 1)
    })
    static let fwbCard = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.125, green: 0.137, blue: 0.125, alpha: 1)
            : UIColor.white
    })
    static let fwbSurface = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.133, green: 0.145, blue: 0.133, alpha: 1)
            : UIColor(red: 247 / 255, green: 248 / 255, blue: 244 / 255, alpha: 1)
    })
    static let fwbWarmWhite = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.969, green: 0.969, blue: 0.949, alpha: 1)
            : UIColor(red: 23 / 255, green: 26 / 255, blue: 23 / 255, alpha: 1)
    })
    static let fwbMuted = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.62, green: 0.62, blue: 0.58, alpha: 1)
            : UIColor(red: 102 / 255, green: 107 / 255, blue: 98 / 255, alpha: 1)
    })
    static let fwbLine = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.357, green: 0.376, blue: 0.357, alpha: 1)
            : UIColor(red: 220 / 255, green: 222 / 255, blue: 215 / 255, alpha: 1)
    })
}

struct FWBMark: View {
    var size: CGFloat = 72

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.fwbAccentFill)

            Text("FWB")
                .font(.system(size: size * 0.34, weight: .black, design: .default))

                .foregroundStyle(Color.black)
        }
        .frame(width: size, height: size)
        .accessibilityLabel("Fitness with Benjamin")
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

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(FWBFont.headline.weight(.bold))
            .foregroundStyle(Color.black)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 52)
            .padding(.horizontal, 16)
            .background(Color.fwbAccentFill, in: RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: FWBLayout.controlRadius, style: .continuous)
                    .stroke(Color.fwbAccentFill, lineWidth: 1)
            }
            .opacity(isEnabled ? 1 : 0.42)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct FWBSecondaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

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
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct FWBDestructiveButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

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
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
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
