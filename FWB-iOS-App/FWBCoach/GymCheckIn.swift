import Foundation
import Supabase
import SwiftUI
import UIKit

extension Notification.Name {
    static let fwbGymCheckInDidChange = Notification.Name("fwbGymCheckInDidChange")
}

struct GymVisit: Codable, Equatable {
    let clientEmail: String
    let entryDate: String

    enum CodingKeys: String, CodingKey {
        case clientEmail = "client_email"
        case entryDate = "entry_date"
    }
}

struct GymCheckInWeek: Equatable {
    let dates: [String]
    var start: String { dates[0] }
    var end: String { dates[6] }

    init(date: Date, calendar: Calendar) {
        let day = calendar.startOfDay(for: date)
        let daysSinceMonday = (calendar.component(.weekday, from: day) + 5) % 7
        let monday = calendar.date(byAdding: .day, value: -daysSinceMonday, to: day) ?? day
        dates = (0..<7).map {
            ReadinessCheckIn.localDateKey(for: calendar.date(byAdding: .day, value: $0, to: monday) ?? monday, calendar: calendar)
        }
    }
}

enum GymCheckInError: LocalizedError {
    case accountChanged, notConfirmed

    var errorDescription: String? {
        switch self {
        case .accountChanged: "Your sign-in changed. Sign in again to check in."
        case .notConfirmed: "Your gym check-in could not be confirmed. Please try again."
        }
    }
}

@MainActor
protocol GymCheckInBackend {
    var currentAccount: SignedInAccount? { get }
    func verifyAccount(_ account: SignedInAccount) async throws
    func visits(account: SignedInAccount, from start: String, through end: String) async throws -> [GymVisit]
    func saveVisit(account: SignedInAccount, date: String) async throws -> GymVisit
}

@MainActor
final class SupabaseGymCheckInBackend: GymCheckInBackend {
    private let client: SupabaseClient

    init(client: SupabaseClient = AppConfiguration.supabase) { self.client = client }

    var currentAccount: SignedInAccount? {
        guard let user = client.auth.currentUser, let email = user.email else { return nil }
        return SignedInAccount(id: user.id, email: email)
    }

    func verifyAccount(_ account: SignedInAccount) async throws {
        try requireCurrentAccount(account)
        let user = try await client.auth.user()
        guard user.id == account.id, normalized(user.email ?? "") == normalized(account.email) else {
            throw GymCheckInError.accountChanged
        }
        try requireCurrentAccount(account)
    }

    func visits(account: SignedInAccount, from start: String, through end: String) async throws -> [GymVisit] {
        try requireCurrentAccount(account)
        // The primary key permits at most seven rows in a Monday–Sunday range.
        let rows: [GymVisit] = try await client.from("client_gym_checkins")
            .select("client_email,entry_date")
            .eq("client_email", value: normalized(account.email))
            .gte("entry_date", value: start)
            .lte("entry_date", value: end)
            .order("entry_date", ascending: true)
            .limit(7)
            .execute().value
        try requireCurrentAccount(account)
        return rows
    }

    func saveVisit(account: SignedInAccount, date: String) async throws -> GymVisit {
        try requireCurrentAccount(account)
        let visit = GymVisit(clientEmail: normalized(account.email), entryDate: date)
        // This table deliberately has no UPDATE grant. The same insert-only,
        // conflict-ignore contract as the web app makes repeated taps/devices safe.
        try await client.from("client_gym_checkins")
            .upsert(visit, onConflict: "client_email,entry_date", returning: .minimal, ignoreDuplicates: true)
            .execute()
        try requireCurrentAccount(account)
        let rows = try await visits(account: account, from: date, through: date)
        guard rows.contains(visit) else { throw GymCheckInError.notConfirmed }
        return visit
    }

    private func requireCurrentAccount(_ account: SignedInAccount) throws {
        guard !account.isCoach, !normalized(account.email).isEmpty,
              let currentAccount, currentAccount.id == account.id,
              normalized(currentAccount.email) == normalized(account.email) else {
            throw GymCheckInError.accountChanged
        }
    }

    private func normalized(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
}

@MainActor
final class GymCheckInStore: ObservableObject {
    @Published private(set) var checkedDates: Set<String> = []
    @Published private(set) var today: String
    @Published private(set) var week: GymCheckInWeek
    @Published private(set) var hasLoaded = false
    @Published private(set) var isLoading = false
    @Published private(set) var isSaving = false
    @Published private(set) var errorMessage: String?

    let account: SignedInAccount
    let previewMode: Bool
    private let backend: any GymCheckInBackend
    private let now: () -> Date
    private let calendar: () -> Calendar
    private let notificationCenter: NotificationCenter
    private var revision = 0

    var isCheckedInToday: Bool { checkedDates.contains(today) }
    var weeklyCount: Int { checkedDates.intersection(week.dates).count }

    init(
        account: SignedInAccount,
        previewMode: Bool = false,
        backend: (any GymCheckInBackend)? = nil,
        now: @escaping () -> Date = Date.init,
        calendar: @escaping () -> Calendar = { .current },
        notificationCenter: NotificationCenter = .default
    ) {
        self.account = SignedInAccount(id: account.id, email: account.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), role: account.role)
        self.previewMode = previewMode
        self.backend = backend ?? SupabaseGymCheckInBackend()
        self.now = now
        self.calendar = calendar
        self.notificationCenter = notificationCenter
        let date = now()
        self.today = ReadinessCheckIn.localDateKey(for: date, calendar: calendar())
        self.week = GymCheckInWeek(date: date, calendar: calendar())
    }

    func refreshIfDateChanged() async {
        let date = ReadinessCheckIn.localDateKey(for: now(), calendar: calendar())
        if date != today { await refresh() }
    }

    func refresh() async {
        guard !isSaving else { return }
        updateDate()
        guard !previewMode else {
            hasLoaded = true
            return
        }
        revision += 1
        let request = revision
        let requestedWeek = week
        isLoading = true
        errorMessage = nil
        defer { if revision == request { isLoading = false } }
        do {
            try requireAccount()
            try await backend.verifyAccount(account)
            try requireAccount()
            let visits = try await backend.visits(account: account, from: requestedWeek.start, through: requestedWeek.end)
            try Task.checkCancellation()
            guard request == revision else { return }
            try requireAccount()
            guard visits.allSatisfy({ $0.clientEmail == account.email && requestedWeek.dates.contains($0.entryDate) }) else {
                throw GymCheckInError.notConfirmed
            }
            if ReadinessCheckIn.localDateKey(for: now(), calendar: calendar()) != today {
                isLoading = false
                await refresh()
                return
            }
            checkedDates = Set(visits.map(\.entryDate))
            hasLoaded = true
        } catch is CancellationError {
            // A disappearing account/view must never publish another account's result.
        } catch {
            guard request == revision else { return }
            if !isCurrentAccount { clearAccountData() }
            errorMessage = error is GymCheckInError ? error.localizedDescription : "Gym check-ins could not be loaded. Please try again."
        }
    }

    @discardableResult
    func checkIn() async -> Bool {
        guard !previewMode, !isSaving else { return false }
        updateDate()
        guard isCurrentAccount else {
            clearAccountData()
            errorMessage = GymCheckInError.accountChanged.localizedDescription
            return false
        }
        guard !isCheckedInToday else { return true }
        revision += 1
        let request = revision
        let date = today
        isLoading = false
        isSaving = true
        errorMessage = nil
        defer { if revision == request { isSaving = false } }
        do {
            try requireAccount()
            try await backend.verifyAccount(account)
            try Task.checkCancellation()
            guard request == revision else { return false }
            try requireAccount()
            let confirmed = try await backend.saveVisit(account: account, date: date)
            try Task.checkCancellation()
            guard request == revision else { return false }
            try requireAccount()
            guard confirmed == GymVisit(clientEmail: account.email, entryDate: date) else {
                throw GymCheckInError.notConfirmed
            }
            checkedDates.insert(date)
            notificationCenter.post(name: .fwbGymCheckInDidChange, object: self, userInfo: ["accountID": account.id])
            // No workout completion, session balance, or readiness mutation occurs here.
            isSaving = false
            await refresh()
            return true
        } catch is CancellationError {
            return false
        } catch {
            guard request == revision else { return false }
            if !isCurrentAccount { clearAccountData() }
            errorMessage = error is GymCheckInError ? error.localizedDescription : "Your gym check-in wasn't saved. Please try again."
            return false
        }
    }

    private var isCurrentAccount: Bool {
        guard !account.isCoach, !account.email.isEmpty, let current = backend.currentAccount else { return false }
        return current.id == account.id && current.email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == account.email
    }

    private func requireAccount() throws {
        guard isCurrentAccount else { throw GymCheckInError.accountChanged }
    }

    private func updateDate() {
        let date = now()
        let nextDate = ReadinessCheckIn.localDateKey(for: date, calendar: calendar())
        let nextWeek = GymCheckInWeek(date: date, calendar: calendar())
        if nextWeek != week {
            checkedDates = []
            hasLoaded = false
        }
        today = nextDate
        week = nextWeek
    }

    private func clearAccountData() {
        checkedDates = []
        hasLoaded = false
    }
}

struct GymCheckInCard: View {
    let account: SignedInAccount
    var previewMode = false

    var body: some View {
        GymCheckInCardContent(account: account, previewMode: previewMode)
            .id("\(account.id.uuidString)|\(account.email)|\(previewMode)")
    }
}

private struct GymCheckInCardContent: View {
    @StateObject private var store: GymCheckInStore
    private let dayTimer = Timer.publish(every: 60, on: .main, in: .common).autoconnect()

    init(account: SignedInAccount, previewMode: Bool) {
        _store = StateObject(wrappedValue: GymCheckInStore(account: account, previewMode: previewMode))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "figure.strengthtraining.traditional")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(.black)
                    .frame(width: 46, height: 46)
                    .background(Color.fwbAccentFill, in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 5) {
                    Text("GYM CHECK-IN")
                        .font(FWBFont.caption.weight(.bold))
                        .tracking(1)
                        .foregroundStyle(Color.fwbMuted)
                    Text(store.isCheckedInToday ? "You showed up today" : "Made it to the gym?")
                        .font(FWBFont.title3.weight(.bold))
                        .foregroundStyle(Color.fwbWarmWhite)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Text("Track your gym visits, one day at a time.")
                .font(FWBFont.subheadline)
                .foregroundStyle(Color.fwbMuted)

            HStack {
                Text("This week")
                    .font(FWBFont.subheadline.weight(.semibold))
                Spacer()
                if store.isLoading && !store.hasLoaded {
                    ProgressView().tint(.fwbLime)
                } else {
                    Text(store.hasLoaded ? "\(store.weeklyCount) gym \(store.weeklyCount == 1 ? "visit" : "visits")" : "—")
                        .font(FWBFont.subheadline.weight(.semibold))
                        .foregroundStyle(Color.fwbMuted)
                }
            }
            weekStrip

            Button {
                Task { await store.checkIn() }
            } label: {
                Label(store.isSaving ? "Saving check-in…" : store.isCheckedInToday ? "Checked in today" : "Gym check-in",
                      systemImage: store.isCheckedInToday ? "checkmark.circle.fill" : "location.circle")
            }
            .buttonStyle(FWBPrimaryButtonStyle())
            .disabled(store.previewMode || store.isSaving || store.isLoading || store.isCheckedInToday)
            .accessibilityIdentifier("gym.checkIn")

            if let error = store.errorMessage {
                Text(error).font(FWBFont.footnote).foregroundStyle(Color.fwbRed)
                Button("Retry") { Task { await store.refresh() } }
                    .font(FWBFont.subheadline.weight(.semibold))
                    .foregroundStyle(Color.fwbLime)
                    .frame(minHeight: 44)
            } else if store.previewMode {
                Text("Gym check-in is available when signed in as a client.")
                    .font(FWBFont.footnote).foregroundStyle(Color.fwbMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .task { await store.refresh() }
        .onReceive(NotificationCenter.default.publisher(for: .fwbForegroundRefresh)) { _ in
            Task { await store.refresh() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .fwbGymCheckInDidChange)) { notification in
            guard notification.userInfo?["accountID"] as? UUID == store.account.id,
                  notification.object as? GymCheckInStore !== store else { return }
            Task { await store.refresh() }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in
            Task { await store.refresh() }
        }
        .onReceive(dayTimer) { _ in Task { await store.refreshIfDateChanged() } }
        .accessibilityIdentifier("gym.dashboardCard")
    }

    private var weekStrip: some View {
        HStack(spacing: 6) {
            ForEach(Array(store.week.dates.enumerated()), id: \.element) { index, date in
                VStack(spacing: 8) {
                    Text(["M", "T", "W", "T", "F", "S", "S"][index])
                        .font(FWBFont.caption.weight(.semibold))
                        .foregroundStyle(Color.fwbMuted)
                    Image(systemName: store.checkedDates.contains(date) ? "checkmark.circle.fill" : "circle")
                        .font(.system(size: 22))
                        .foregroundStyle(store.checkedDates.contains(date) ? Color.fwbLime : Color.fwbLine)
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(date): \(store.checkedDates.contains(date) ? "gym check-in" : "no gym check-in")")
            }
        }
    }
}
