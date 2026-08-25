import Foundation
import Supabase
import SwiftUI

struct WeeklyCoachCheckIn: Equatable, Identifiable {
    let id: UUID
    let clientEmail: String
    let weekStart: String
    let progressWins: String
    let challenges: String
    let recoverySummary: String
    let painLimitations: String
    let coachQuestion: String
    let submittedAt: Date
    let coachResponse: String
    let coachRespondedAt: Date?

    var hasCoachResponse: Bool {
        !coachResponse.isEmpty
    }
}

struct WeeklyReadinessSnapshot: Equatable {
    let occurredOn: String
    let energy: Int
    let soreness: Int
    let sleepRecovery: Int
}

enum WeeklyCheckInDate {
    static func weekStart(for date: Date = Date(), calendar: Calendar = .current) -> Date {
        var mondayCalendar = calendar
        mondayCalendar.firstWeekday = 2
        mondayCalendar.minimumDaysInFirstWeek = 4
        return mondayCalendar.dateInterval(of: .weekOfYear, for: date)?.start
            ?? mondayCalendar.startOfDay(for: date)
    }

    static func weekStartKey(for date: Date = Date(), calendar: Calendar = .current) -> String {
        ReadinessCheckIn.localDateKey(for: weekStart(for: date, calendar: calendar), calendar: calendar)
    }

    static func weekEndKey(for date: Date = Date(), calendar: Calendar = .current) -> String {
        var mondayCalendar = calendar
        mondayCalendar.firstWeekday = 2
        mondayCalendar.minimumDaysInFirstWeek = 4
        let start = weekStart(for: date, calendar: mondayCalendar)
        let end = mondayCalendar.date(byAdding: .day, value: 6, to: start) ?? start
        return ReadinessCheckIn.localDateKey(for: end, calendar: mondayCalendar)
    }

    static func rangeLabel(for date: Date = Date(), calendar: Calendar = .current) -> String {
        var mondayCalendar = calendar
        mondayCalendar.firstWeekday = 2
        mondayCalendar.minimumDaysInFirstWeek = 4
        let start = weekStart(for: date, calendar: mondayCalendar)
        let end = mondayCalendar.date(byAdding: .day, value: 6, to: start) ?? start
        return start.formatted(.dateTime.month(.abbreviated).day())
            + " – "
            + end.formatted(.dateTime.month(.abbreviated).day())
    }
}

private struct WeeklyCheckInPayload: Encodable {
    let clientEmail: String
    let occurredOn: String
    let progressWins: String
    let challenges: String
    let recoverySummary: String
    let painLimitations: String
    let coachQuestion: String?
    let weeklySubmittedAt: String
    let source = "ios_app"
    let updatedAt: String

    init(
        clientEmail: String,
        weekStart: String,
        progressWins: String,
        challenges: String,
        recoverySummary: String,
        painLimitations: String,
        coachQuestion: String,
        submittedAt: Date
    ) {
        self.clientEmail = clientEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        occurredOn = weekStart
        self.progressWins = String(progressWins.trimmingCharacters(in: .whitespacesAndNewlines).prefix(500))
        self.challenges = String(challenges.trimmingCharacters(in: .whitespacesAndNewlines).prefix(500))
        self.recoverySummary = String(recoverySummary.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1000))
        self.painLimitations = String(painLimitations.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1000))
        let trimmedQuestion = coachQuestion.trimmingCharacters(in: .whitespacesAndNewlines)
        self.coachQuestion = trimmedQuestion.isEmpty ? nil : String(trimmedQuestion.prefix(1000))
        weeklySubmittedAt = CheckInDateCoding.string(from: submittedAt)
        updatedAt = CheckInDateCoding.string(from: submittedAt)
    }

    enum CodingKeys: String, CodingKey {
        case clientEmail = "client_email"
        case occurredOn = "occurred_on"
        case progressWins = "win"
        case challenges = "challenge"
        case recoverySummary = "recovery_summary"
        case painLimitations = "pain_limitations"
        case coachQuestion = "coach_question"
        case weeklySubmittedAt = "weekly_submitted_at"
        case source
        case updatedAt = "updated_at"
    }
}

private struct WeeklyCheckInRemoteRecord: Decodable {
    let id: UUID
    let clientEmail: String
    let occurredOn: String
    let energy: Int?
    let soreness: Int?
    let sleepRecovery: Int?
    let progressWins: String?
    let challenges: String?
    let recoverySummary: String?
    let painLimitations: String?
    let coachQuestion: String?
    let weeklySubmittedAt: String?
    let coachResponse: String?
    let coachRespondedAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case clientEmail = "client_email"
        case occurredOn = "occurred_on"
        case energy
        case soreness
        case sleepRecovery = "sleep_recovery"
        case progressWins = "win"
        case challenges = "challenge"
        case recoverySummary = "recovery_summary"
        case painLimitations = "pain_limitations"
        case coachQuestion = "coach_question"
        case weeklySubmittedAt = "weekly_submitted_at"
        case coachResponse = "coach_response"
        case coachRespondedAt = "coach_responded_at"
    }

    var weeklyCheckIn: WeeklyCoachCheckIn? {
        guard let weeklySubmittedAt,
              let submittedAt = CheckInDateCoding.date(from: weeklySubmittedAt) else {
            return nil
        }

        return WeeklyCoachCheckIn(
            id: id,
            clientEmail: clientEmail,
            weekStart: occurredOn,
            progressWins: progressWins ?? "",
            challenges: challenges ?? "",
            recoverySummary: recoverySummary ?? "",
            painLimitations: painLimitations ?? "",
            coachQuestion: coachQuestion ?? "",
            submittedAt: submittedAt,
            coachResponse: coachResponse ?? "",
            coachRespondedAt: coachRespondedAt.flatMap(CheckInDateCoding.date(from:))
        )
    }

    var readinessSnapshot: WeeklyReadinessSnapshot? {
        guard let energy, let soreness, let sleepRecovery else { return nil }
        return WeeklyReadinessSnapshot(
            occurredOn: occurredOn,
            energy: energy,
            soreness: soreness,
            sleepRecovery: sleepRecovery
        )
    }
}

struct CheckInRowIdentifier: Decodable {
    let id: UUID
}

@MainActor
final class WeeklyCoachCheckInStore: ObservableObject {
    enum LoadState: Equatable {
        case idle
        case loading
        case loaded
        case failed(String)
    }

    @Published private(set) var state: LoadState = .idle
    @Published private(set) var current: WeeklyCoachCheckIn?
    @Published private(set) var latestReadiness: WeeklyReadinessSnapshot?

    let clientEmail: String
    let weekStart: String
    let weekRangeLabel: String

    private let client: SupabaseClient

    init(clientEmail: String, client: SupabaseClient = AppConfiguration.supabase) {
        self.clientEmail = clientEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        self.client = client
        weekStart = WeeklyCheckInDate.weekStartKey()
        weekRangeLabel = WeeklyCheckInDate.rangeLabel()
    }

    func load() async {
        state = .loading
        do {
            let records: [WeeklyCheckInRemoteRecord] = try await client
                .from("client_check_ins")
                .select(
                    "id,client_email,occurred_on,energy,soreness,sleep_recovery,win,challenge,recovery_summary,pain_limitations,coach_question,weekly_submitted_at,coach_response,coach_responded_at"
                )
                .eq("client_email", value: clientEmail)
                .gte("occurred_on", value: weekStart)
                .lte("occurred_on", value: WeeklyCheckInDate.weekEndKey())
                .order("occurred_on", ascending: false)
                .execute()
                .value

            current = records.first(where: { $0.occurredOn == weekStart })?.weeklyCheckIn
            latestReadiness = records.lazy.compactMap(\.readinessSnapshot).first
            state = .loaded
        } catch is CancellationError {
            return
        } catch {
            state = .failed("Your weekly check-in could not be loaded. Please try again.")
        }
    }

    @discardableResult
    func submit(
        progressWins: String,
        challenges: String,
        recoverySummary: String,
        painLimitations: String,
        coachQuestion: String
    ) async -> Bool {
        guard current == nil else { return true }

        let payload = WeeklyCheckInPayload(
            clientEmail: clientEmail,
            weekStart: weekStart,
            progressWins: progressWins,
            challenges: challenges,
            recoverySummary: recoverySummary,
            painLimitations: painLimitations,
            coachQuestion: coachQuestion,
            submittedAt: Date()
        )

        do {
            let existing: [CheckInRowIdentifier] = try await client
                .from("client_check_ins")
                .select("id")
                .eq("client_email", value: clientEmail)
                .eq("occurred_on", value: weekStart)
                .limit(1)
                .execute()
                .value

            if let id = existing.first?.id {
                try await client
                    .from("client_check_ins")
                    .update(payload)
                    .eq("id", value: id.uuidString)
                    .execute()
            } else {
                try await client
                    .from("client_check_ins")
                    .insert(payload)
                    .execute()
            }

            await load()
            return current != nil
        } catch is CancellationError {
            return false
        } catch {
            state = .failed("Your weekly check-in could not be submitted. Your answers are still on this screen so you can try again.")
            return false
        }
    }
}

struct WeeklyCoachCheckInCard: View {
    @StateObject private var store: WeeklyCoachCheckInStore

    init(clientEmail: String) {
        _store = StateObject(wrappedValue: WeeklyCoachCheckInStore(clientEmail: clientEmail))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("WEEKLY COACH CHECK-IN")
                        .font(.footnote.bold())
                        .tracking(1.2)
                        .foregroundStyle(Color.fwbLime)
                    Text(store.weekRangeLabel)
                        .font(.title3.weight(.black))
                        .fontWidth(.condensed)
                        .foregroundStyle(Color.fwbWarmWhite)
                }
                Spacer()
                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .font(.title2.weight(.semibold))
                    .foregroundStyle(Color.fwbLime)
            }

            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .task { await store.load() }
        .accessibilityIdentifier("weeklyCheckIn.dashboardCard")
    }

    @ViewBuilder
    private var content: some View {
        switch store.state {
        case .idle, .loading:
            ProgressView()
                .tint(.fwbLime)
                .frame(maxWidth: .infinity, minHeight: 62)
        case .failed(let message):
            VStack(alignment: .leading, spacing: 10) {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)
                Button("TRY AGAIN") { Task { await store.load() } }
                    .font(.footnote.bold())
                    .foregroundStyle(Color.fwbLime)
            }
        case .loaded:
            if let checkIn = store.current {
                submittedContent(checkIn)
            } else {
                dueContent
            }
        }
    }

    private var dueContent: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Share your wins, challenges, recovery, and any limitations once this week.")
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)

            NavigationLink {
                WeeklyCoachCheckInView(store: store)
            } label: {
                Label("START WEEKLY CHECK-IN", systemImage: "arrow.right")
            }
            .buttonStyle(FWBPrimaryButtonStyle())
            .accessibilityIdentifier("weeklyCheckIn.start")
        }
    }

    private func submittedContent(_ checkIn: WeeklyCoachCheckIn) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("SUBMITTED", systemImage: "checkmark.circle.fill")
                .font(.subheadline.weight(.black))
                .tracking(0.7)
                .foregroundStyle(Color.fwbLime)

            Text(
                checkIn.hasCoachResponse
                    ? "Benjamin has responded to this week’s check-in."
                    : "Your coach can now review your update on the website."
            )
            .font(.subheadline)
            .foregroundStyle(Color.fwbMuted)
            .fixedSize(horizontal: false, vertical: true)

            NavigationLink(checkIn.hasCoachResponse ? "VIEW COACH RESPONSE" : "VIEW SUBMISSION") {
                WeeklyCoachCheckInView(store: store)
            }
            .font(.subheadline.bold())
            .tracking(0.7)
            .foregroundStyle(Color.fwbLime)
            .accessibilityIdentifier("weeklyCheckIn.viewSubmission")
        }
    }
}

struct WeeklyCoachCheckInView: View {
    @ObservedObject var store: WeeklyCoachCheckInStore

    @State private var progressWins = ""
    @State private var challenges = ""
    @State private var recoverySummary = ""
    @State private var painLimitations = ""
    @State private var coachQuestion = ""
    @State private var isSubmitting = false
    @State private var showValidation = false

    private var requiredFieldsComplete: Bool {
        [progressWins, challenges, recoverySummary, painLimitations]
            .allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            if let checkIn = store.current {
                submittedView(checkIn)
            } else {
                formView
            }
        }
        .navigationTitle("Weekly Check-In")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
    }

    private var formView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header

                if let readiness = store.latestReadiness {
                    WeeklyReadinessContextCard(snapshot: readiness)
                }

                WeeklyCheckInTextCard(
                    title: "PROGRESS + WINS",
                    prompt: "What moved forward or felt good this week?",
                    placeholder: "A workout, habit, milestone, or small win…",
                    text: $progressWins,
                    limit: 500,
                    accessibilityID: "weeklyCheckIn.wins"
                )

                WeeklyCheckInTextCard(
                    title: "CHALLENGES",
                    prompt: "What got in the way or felt difficult?",
                    placeholder: "Training, schedule, motivation, nutrition…",
                    text: $challenges,
                    limit: 500,
                    accessibilityID: "weeklyCheckIn.challenges"
                )

                WeeklyCheckInTextCard(
                    title: "RECOVERY",
                    prompt: "How did your sleep, stress, energy, and recovery feel overall?",
                    placeholder: "Tell your coach what affected recovery this week…",
                    text: $recoverySummary,
                    limit: 1000,
                    accessibilityID: "weeklyCheckIn.recovery"
                )

                WeeklyCheckInTextCard(
                    title: "PAIN OR LIMITATIONS",
                    prompt: "Any pain, discomfort, or movement limitations your coach should know about?",
                    placeholder: "Write “None” if nothing limited you this week.",
                    text: $painLimitations,
                    limit: 1000,
                    accessibilityID: "weeklyCheckIn.pain"
                )

                WeeklyCheckInTextCard(
                    title: "OPTIONAL COACH QUESTION",
                    prompt: "Is there anything you want Benjamin to answer?",
                    placeholder: "Ask a question, or leave this blank.",
                    text: $coachQuestion,
                    limit: 1000,
                    isRequired: false,
                    accessibilityID: "weeklyCheckIn.question"
                )

                if showValidation && !requiredFieldsComplete {
                    Label("Complete the four required sections before submitting.", systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Color.fwbRed)
                        .accessibilityIdentifier("weeklyCheckIn.validation")
                }

                Button {
                    Task { await submit() }
                } label: {
                    if isSubmitting {
                        ProgressView().tint(.black)
                    } else {
                        Label("SUBMIT THIS WEEK’S CHECK-IN", systemImage: "paperplane.fill")
                    }
                }
                .buttonStyle(FWBPrimaryButtonStyle())
                .disabled(isSubmitting)
                .accessibilityIdentifier("weeklyCheckIn.submit")

                Text("You can submit once per week. Your answers go to your coach’s website and cannot be edited after submission.")
                    .font(.footnote)
                    .foregroundStyle(Color.fwbMuted)
                    .fixedSize(horizontal: false, vertical: true)

                if case .failed(let message) = store.state {
                    Text(message)
                        .font(.footnote)
                        .foregroundStyle(Color.fwbRed)
                }
            }
            .padding(20)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(store.weekRangeLabel.uppercased())
                .font(.footnote.bold())
                .tracking(1.4)
                .foregroundStyle(Color.fwbLime)
            Text("HOW DID THIS\nWEEK GO?")
                .font(.largeTitle.weight(.black))
                .fontWidth(.condensed)
                .foregroundStyle(Color.fwbWarmWhite)
            Text("Give your coach the context behind your training. Honest, brief answers are enough.")
                .font(.subheadline)
                .foregroundStyle(Color.fwbMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func submittedView(_ checkIn: WeeklyCoachCheckIn) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 10) {
                    Label("SUBMITTED", systemImage: "checkmark.circle.fill")
                        .font(.footnote.weight(.black))
                        .tracking(1.1)
                        .foregroundStyle(Color.fwbLime)
                    Text("YOUR WEEKLY\nUPDATE IS IN")
                        .font(.largeTitle.weight(.black))
                        .fontWidth(.condensed)
                        .foregroundStyle(Color.fwbWarmWhite)
                    Text(checkIn.submittedAt.formatted(date: .abbreviated, time: .shortened))
                        .font(.subheadline)
                        .foregroundStyle(Color.fwbMuted)
                }

                WeeklySubmissionAnswer(title: "PROGRESS + WINS", text: checkIn.progressWins)
                WeeklySubmissionAnswer(title: "CHALLENGES", text: checkIn.challenges)
                WeeklySubmissionAnswer(title: "RECOVERY", text: checkIn.recoverySummary)
                WeeklySubmissionAnswer(title: "PAIN OR LIMITATIONS", text: checkIn.painLimitations)

                if !checkIn.coachQuestion.isEmpty {
                    WeeklySubmissionAnswer(title: "YOUR QUESTION", text: checkIn.coachQuestion)
                }

                CoachResponseCard(checkIn: checkIn)

                Button("REFRESH FOR RESPONSE") {
                    Task { await store.load() }
                }
                .buttonStyle(FWBSecondaryButtonStyle())
                .accessibilityIdentifier("weeklyCheckIn.refresh")
            }
            .padding(20)
        }
        .refreshable { await store.load() }
    }

    private func submit() async {
        showValidation = true
        guard requiredFieldsComplete, !isSubmitting else { return }
        isSubmitting = true
        let didSubmit = await store.submit(
            progressWins: progressWins,
            challenges: challenges,
            recoverySummary: recoverySummary,
            painLimitations: painLimitations,
            coachQuestion: coachQuestion
        )
        isSubmitting = false
        if didSubmit {
            showValidation = false
        }
    }
}

private struct WeeklyReadinessContextCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let snapshot: WeeklyReadinessSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("LATEST DAILY READINESS", systemImage: "waveform.path.ecg")
                .font(.footnote.bold())
                .tracking(1)
                .foregroundStyle(Color.fwbLime)
            Text("Use this as context, then describe how recovery felt across the full week.")
                .font(.footnote)
                .foregroundStyle(Color.fwbMuted)

            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 10) { readinessMetrics }
            } else {
                HStack(spacing: 10) { readinessMetrics }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var readinessMetrics: some View {
        WeeklyReadinessMetric(title: "ENERGY", value: snapshot.energy)
        WeeklyReadinessMetric(title: "SORENESS", value: snapshot.soreness)
        WeeklyReadinessMetric(title: "RECOVERY", value: snapshot.sleepRecovery)
    }
}

private struct WeeklyReadinessMetric: View {
    let title: String
    let value: Int

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.caption2.bold())
                .tracking(0.7)
                .foregroundStyle(Color.fwbMuted)
            Text("\(value) / 5")
                .font(.headline.weight(.black))
                .foregroundStyle(Color.fwbWarmWhite)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct WeeklyCheckInTextCard: View {
    let title: String
    let prompt: String
    let placeholder: String
    @Binding var text: String
    let limit: Int
    var isRequired = true
    let accessibilityID: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(.footnote.bold())
                    .tracking(1)
                    .foregroundStyle(Color.fwbLime)
                Spacer()
                if !isRequired {
                    Text("OPTIONAL")
                        .font(.caption2.bold())
                        .tracking(0.6)
                        .foregroundStyle(Color.fwbMuted)
                }
            }

            Text(prompt)
                .font(.headline)
                .foregroundStyle(Color.fwbWarmWhite)
                .fixedSize(horizontal: false, vertical: true)

            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text(placeholder)
                        .font(.body)
                        .foregroundStyle(Color.fwbMuted)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 17)
                        .allowsHitTesting(false)
                }

                TextEditor(text: $text)
                    .font(.body)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 116)
                    .padding(10)
                    .background(Color.clear)
                    .onChange(of: text) { value in
                        if value.count > limit { text = String(value.prefix(limit)) }
                    }
                    .accessibilityLabel(prompt)
                    .accessibilityIdentifier(accessibilityID)
            }
            .background(Color.fwbSurface, in: Rectangle())
            .overlay { Rectangle().stroke(Color.fwbLine, lineWidth: 1) }

            Text("\(text.count)/\(limit)")
                .font(.footnote)
                .foregroundStyle(Color.fwbMuted)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .fwbCard()
    }
}

private struct WeeklySubmissionAnswer: View {
    let title: String
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.footnote.bold())
                .tracking(1)
                .foregroundStyle(Color.fwbLime)
            Text(text)
                .font(.body)
                .foregroundStyle(Color.fwbWarmWhite)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .fwbCard()
    }
}

private struct CoachResponseCard: View {
    let checkIn: WeeklyCoachCheckIn

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(
                checkIn.hasCoachResponse ? "COACH RESPONSE" : "AWAITING COACH RESPONSE",
                systemImage: checkIn.hasCoachResponse ? "bubble.left.fill" : "clock.fill"
            )
            .font(.footnote.bold())
            .tracking(1)
            .foregroundStyle(Color.fwbLime)

            if checkIn.hasCoachResponse {
                Text(checkIn.coachResponse)
                    .font(.body)
                    .foregroundStyle(Color.fwbWarmWhite)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
                if let respondedAt = checkIn.coachRespondedAt {
                    Text("Responded \(respondedAt.formatted(date: .abbreviated, time: .shortened))")
                        .font(.footnote)
                        .foregroundStyle(Color.fwbMuted)
                }
            } else {
                Text("Benjamin will review this on the coach website. Pull to refresh after you receive a reply.")
                    .font(.subheadline)
                    .foregroundStyle(Color.fwbMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Color.fwbLime.opacity(0.08), in: Rectangle())
        .overlay { Rectangle().stroke(Color.fwbLime, lineWidth: 1) }
        .accessibilityIdentifier("weeklyCheckIn.coachResponse")
    }
}

#Preview("Weekly Check-In Form") {
    NavigationStack {
        WeeklyCoachCheckInView(store: WeeklyCoachCheckInStore(clientEmail: "client@example.com"))
    }
    .preferredColorScheme(.dark)
}
