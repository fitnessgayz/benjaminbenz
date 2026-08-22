import SwiftUI

enum AppAppearanceMode: String, CaseIterable, Identifiable {
    case light
    case dark
    case scheduled

    var id: String { rawValue }

    var title: String {
        switch self {
        case .light: return "Light"
        case .dark: return "Dark"
        case .scheduled: return "Timed"
        }
    }

    var icon: String {
        switch self {
        case .light: return "sun.max.fill"
        case .dark: return "moon.fill"
        case .scheduled: return "clock.fill"
        }
    }
}

struct AppAppearancePreference {
    static let modeKey = "appAppearanceMode"
    static let lightStartKey = "appAppearanceLightStartMinute"
    static let darkStartKey = "appAppearanceDarkStartMinute"
    static let defaultLightStart = 7 * 60
    static let defaultDarkStart = 19 * 60

    let mode: AppAppearanceMode
    let lightStartMinute: Int
    let darkStartMinute: Int

    func colorScheme(at date: Date, calendar: Calendar = .current) -> ColorScheme {
        switch mode {
        case .light:
            return .light
        case .dark:
            return .dark
        case .scheduled:
            return usesLightMode(at: date, calendar: calendar) ? .light : .dark
        }
    }

    func usesLightMode(at date: Date, calendar: Calendar = .current) -> Bool {
        let components = calendar.dateComponents([.hour, .minute], from: date)
        let currentMinute = (components.hour ?? 0) * 60 + (components.minute ?? 0)
        let lightStart = Self.validMinute(lightStartMinute, fallback: Self.defaultLightStart)
        let darkStart = Self.validMinute(darkStartMinute, fallback: Self.defaultDarkStart)

        guard lightStart != darkStart else { return false }
        if lightStart < darkStart {
            return currentMinute >= lightStart && currentMinute < darkStart
        }
        return currentMinute >= lightStart || currentMinute < darkStart
    }

    private static func validMinute(_ value: Int, fallback: Int) -> Int {
        (0..<24 * 60).contains(value) ? value : fallback
    }
}

struct AppearanceSettingsView: View {
    @AppStorage(AppAppearancePreference.modeKey) private var storedMode = AppAppearanceMode.dark.rawValue
    @AppStorage(AppAppearancePreference.lightStartKey) private var lightStartMinute = AppAppearancePreference.defaultLightStart
    @AppStorage(AppAppearancePreference.darkStartKey) private var darkStartMinute = AppAppearancePreference.defaultDarkStart

    private var selectedMode: Binding<AppAppearanceMode> {
        Binding(
            get: { AppAppearanceMode(rawValue: storedMode) ?? .dark },
            set: { storedMode = $0.rawValue }
        )
    }

    private var preference: AppAppearancePreference {
        AppAppearancePreference(
            mode: AppAppearanceMode(rawValue: storedMode) ?? .dark,
            lightStartMinute: lightStartMinute,
            darkStartMinute: darkStartMinute
        )
    }

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    SectionHeading(kicker: "DISPLAY", title: "Appearance")
                    modeCard

                    if selectedMode.wrappedValue == .scheduled {
                        scheduleCard
                    }
                }
                .padding(20)
            }
        }
        .navigationTitle("Appearance")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
    }

    private var modeCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("COLOR MODE", systemImage: "circle.lefthalf.filled")
                .font(.footnote.bold())
                .tracking(1)
                .foregroundStyle(Color.fwbLime)

            Text("Choose how FWB looks")
                .font(.title3.weight(.black))
                .fontWidth(.condensed)

            Picker("Color mode", selection: selectedMode) {
                ForEach(AppAppearanceMode.allCases) { mode in
                    Label(mode.title, systemImage: mode.icon)
                        .tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("appearance.mode")

            FWBRule()

            TimelineView(.periodic(from: .now, by: 60)) { context in
                Label(statusText(at: context.date), systemImage: activeIcon(at: context.date))
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .fwbCard()
    }

    private var scheduleCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("DAILY SCHEDULE", systemImage: "clock.fill")
                .font(.footnote.bold())
                .tracking(1)
                .foregroundStyle(Color.fwbLime)

            Text("Switch automatically")
                .font(.title3.weight(.black))
                .fontWidth(.condensed)

            Text("FWB follows the time on this iPhone and switches while the app is open or when you return to it.")
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)

            FWBRule()

            DatePicker(
                "Light mode starts",
                selection: minuteBinding($lightStartMinute),
                displayedComponents: .hourAndMinute
            )
            .font(.subheadline.weight(.bold))
            .tint(Color.fwbLime)
            .accessibilityIdentifier("appearance.lightStart")

            FWBRule()

            DatePicker(
                "Dark mode starts",
                selection: minuteBinding($darkStartMinute),
                displayedComponents: .hourAndMinute
            )
            .font(.subheadline.weight(.bold))
            .tint(Color.fwbLime)
            .accessibilityIdentifier("appearance.darkStart")
        }
        .fwbCard()
    }

    private func minuteBinding(_ minutes: Binding<Int>) -> Binding<Date> {
        Binding(
            get: {
                let value = (0..<24 * 60).contains(minutes.wrappedValue)
                    ? minutes.wrappedValue
                    : AppAppearancePreference.defaultLightStart
                return Calendar.current.date(
                    bySettingHour: value / 60,
                    minute: value % 60,
                    second: 0,
                    of: Date()
                ) ?? Date()
            },
            set: { date in
                let components = Calendar.current.dateComponents([.hour, .minute], from: date)
                minutes.wrappedValue = (components.hour ?? 0) * 60 + (components.minute ?? 0)
            }
        )
    }

    private func statusText(at date: Date) -> String {
        switch selectedMode.wrappedValue {
        case .light:
            return "Light mode stays on until you change it."
        case .dark:
            return "Dark mode stays on until you change it."
        case .scheduled:
            let activeMode = preference.usesLightMode(at: date) ? "Light" : "Dark"
            return "\(activeMode) mode is active now. Light starts at \(timeText(lightStartMinute)); dark starts at \(timeText(darkStartMinute))."
        }
    }

    private func activeIcon(at date: Date) -> String {
        preference.colorScheme(at: date) == .light ? "sun.max.fill" : "moon.fill"
    }

    private func timeText(_ minutes: Int) -> String {
        let date = Calendar.current.date(
            bySettingHour: max(0, min(23, minutes / 60)),
            minute: max(0, min(59, minutes % 60)),
            second: 0,
            of: Date()
        ) ?? Date()
        return date.formatted(date: .omitted, time: .shortened)
    }
}
