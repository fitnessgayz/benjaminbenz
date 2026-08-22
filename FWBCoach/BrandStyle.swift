import SwiftUI
import UIKit

extension Color {
    // Fitness with Benjamin web palette.
    static let fwbAccentFill = Color(red: 0.843, green: 1.0, blue: 0.247)
    static let fwbLime = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.843, green: 1.0, blue: 0.247, alpha: 1)
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
            : UIColor(red: 0.957, green: 0.957, blue: 0.937, alpha: 1)
    })
    static let fwbCard = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.125, green: 0.137, blue: 0.125, alpha: 1)
            : UIColor(red: 0.992, green: 0.992, blue: 0.976, alpha: 1)
    })
    static let fwbSurface = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.133, green: 0.145, blue: 0.133, alpha: 1)
            : UIColor(red: 0.914, green: 0.922, blue: 0.890, alpha: 1)
    })
    static let fwbWarmWhite = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.969, green: 0.969, blue: 0.949, alpha: 1)
            : UIColor(red: 0.067, green: 0.075, blue: 0.063, alpha: 1)
    })
    static let fwbMuted = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.62, green: 0.62, blue: 0.58, alpha: 1)
            : UIColor(red: 0.32, green: 0.33, blue: 0.30, alpha: 1)
    })
    static let fwbLine = Color(UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.357, green: 0.376, blue: 0.357, alpha: 1)
            : UIColor(red: 0.72, green: 0.74, blue: 0.69, alpha: 1)
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
                .fontWidth(.condensed)
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

struct FWBCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(18)
            .background(Color.fwbCard, in: Rectangle())
            .overlay {
                Rectangle()
                    .stroke(Color.fwbLine, lineWidth: 1)
            }
    }
}

struct FWBPrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.black))
            .foregroundStyle(Color.black)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 52)
            .padding(.horizontal, 16)
            .background(Color.fwbAccentFill, in: Rectangle())
            .overlay {
                Rectangle()
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
            .font(.headline.weight(.bold))
            .foregroundStyle(Color.fwbLime)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 50)
            .padding(.horizontal, 16)
            .background(Color.fwbCard, in: Rectangle())
            .overlay {
                Rectangle()
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
            .font(.headline.weight(.bold))
            .foregroundStyle(Color.fwbRed)
            .frame(maxWidth: .infinity)
            .frame(minHeight: 50)
            .padding(.horizontal, 16)
            .background(Color.fwbCard, in: Rectangle())
            .overlay {
                Rectangle()
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
            .background(Color.fwbSurface, in: Rectangle())
            .overlay {
                Rectangle()
                    .stroke(Color.fwbLine, lineWidth: 1)
            }
    }
}

extension View {
    func fwbCard() -> some View {
        modifier(FWBCardModifier())
    }
}
