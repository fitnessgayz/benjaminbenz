import SwiftUI
import Supabase

// The same client-scoped contracts used by client-portal.js. No separate iOS records.
struct ClientQuestionnaireView: View {
    let account: SignedInAccount
    @State private var record: WebQuestionnaireRecord?
    @State private var loadState: DestinationLoadState = .loading
    @State private var editor: QuestionnaireEditorDraft?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                DestinationHeading(kicker: "Client profile", title: "Fitness questionnaire", status: status)
                Text("Review the fitness, health, lifestyle, and training details you shared with your coach.")
                    .foregroundStyle(Color.fwbMuted)
                switch loadState {
                case .loading:
                    FWBLoadingState(
                        title: "Loading your questionnaire",
                        message: "Your answers stay connected to your FWB Training account."
                    )
                    .frame(minHeight: 240)
                case .failed(let message):
                    DestinationRetry(message: message) { Task { await load() } }
                case .loaded:
                    if let record {
                        questionnaire(record)
                    } else {
                        VStack(alignment: .leading, spacing: 14) {
                            Text("No questionnaire linked yet").font(FWBFont.sized(18).weight(.bold))
                            Text("Complete the fitness questionnaire and use the same email address as your client account.")
                                .foregroundStyle(Color.fwbMuted)
                            Button("Complete fitness questionnaire") { editor = QuestionnaireEditorDraft(record: nil) }
                                .buttonStyle(FWBPrimaryButtonStyle())
                        }.fwbCard()
                    }
                }
            }.padding(16)
        }
        .font(FWBFont.sized(15))
        .background(Color.fwbBackground)
        .navigationTitle("PAR-Q")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: account.id) { await load() }
        .refreshable { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .fwbForegroundRefresh)) { _ in
            guard editor == nil else { return }
            Task { await load() }
        }
        .sheet(item: $editor) { draft in
            NavigationStack {
                NativeQuestionnaireEditor(account: account, draft: draft) { await load() }
            }.tint(Color.fwbLime)
        }
    }

    private var status: String {
        switch loadState {
        case .loading: return "Loading"
        case .failed: return "Unavailable"
        case .loaded: return record == nil ? "Not submitted" : "Available"
        }
    }

    private func questionnaire(_ record: WebQuestionnaireRecord) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Questionnaire on file").font(FWBFont.sized(12).weight(.semibold)).foregroundStyle(Color.fwbMuted)
                Text(record.respondentName?.nonempty ?? "Name not provided").font(FWBFont.sized(20).weight(.bold))
                Text(record.respondentEmail?.nonempty ?? "Email not provided").foregroundStyle(Color.fwbMuted)
                Text("Submitted \(destinationDate(record.submittedAt))").font(FWBFont.sized(13)).foregroundStyle(Color.fwbMuted)
            }.frame(maxWidth: .infinity, alignment: .leading).fwbCard()
            ForEach(record.displayGroups) { group in
                VStack(alignment: .leading, spacing: 16) {
                    Text(group.title).font(FWBFont.sized(18).weight(.bold))
                    ForEach(group.answers) { answer in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(answer.label).font(FWBFont.sized(13).weight(.semibold)).foregroundStyle(Color.fwbMuted)
                            Text(answer.text).textSelection(.enabled)
                        }.frame(maxWidth: .infinity, alignment: .leading)
                    }
                }.fwbCard()
            }
            if record.displayGroups.isEmpty {
                Text("This questionnaire is linked, but it does not contain any saved answers.").foregroundStyle(Color.fwbMuted)
            }
            Button("Update questionnaire") { editor = QuestionnaireEditorDraft(record: record) }
                .buttonStyle(FWBSecondaryButtonStyle())
        }
    }

    @MainActor
    private func load() async {
        loadState = .loading
        do {
            let client = AppConfiguration.supabase
            let session = try await client.auth.session
            guard session.user.id == account.id else { throw DestinationError.signedOut }
            let records: [WebQuestionnaireRecord] = try await client
                .from("client_fitness_questionnaires")
                .select("id,respondent_email,respondent_name,submitted_at,answers")
                .eq("match_status", value: "matched")
                .eq("linked_user_id", value: session.user.id.uuidString)
                .order("submitted_at", ascending: false)
                .limit(1).execute().value
            try Task.checkCancellation()
            record = records.first
            loadState = .loaded
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            loadState = .failed("We could not load your questionnaire. Check your connection and try again.")
        }
    }
}

struct ClientSessionsView: View {
    @ObservedObject var store: ClientProgramStore
    let account: SignedInAccount
    @State private var snapshot: WebSessionSnapshot?
    @State private var loadState: DestinationLoadState = .loading

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                DestinationHeading(kicker: "Sessions", title: "Sessions", status: snapshot?.countDisplay == "--" ? "No sessions yet" : snapshot?.countDisplay ?? "No sessions yet")
                switch loadState {
                case .loading:
                    FWBLoadingState(
                        title: "Loading your sessions",
                        message: "Your upcoming coaching sessions will appear here."
                    )
                    .frame(minHeight: 240)
                case .failed(let message):
                    DestinationRetry(message: message) { Task { await load() } }
                case .loaded:
                    sessionContent
                }
            }.padding(16)
        }
        .font(FWBFont.sized(15))
        .background(Color.fwbBackground)
        .navigationTitle("Sessions")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: account.id) { await load() }
        .refreshable { await load() }
        .onReceive(NotificationCenter.default.publisher(for: .fwbForegroundRefresh)) { _ in Task { await load() } }
        .onChange(of: store.program?.updatedAt) { _ in Task { await load() } }
    }

    private var sessionContent: some View {
        VStack(alignment: .leading, spacing: 18) {
            if let snapshot, snapshot.total > 0, snapshot.remaining <= 2 {
                VStack(alignment: .leading, spacing: 6) {
                    Text(snapshot.remaining == 0 ? "No sessions remaining" : "\(snapshot.remaining) coaching session\(snapshot.remaining == 1 ? "" : "s") remaining")
                        .font(FWBFont.sized(15).weight(.bold))
                    Text(snapshot.remaining == 0
                         ? "Your current session package is complete. Contact Benjamin to renew."
                         : "Your session package is running low. Contact Benjamin to plan your next package.")
                        .font(FWBFont.sized(14))
                }.frame(maxWidth: .infinity, alignment: .leading).padding(16)
                    .background(Color.fwbAccentFill.opacity(0.25), in: RoundedRectangle(cornerRadius: 12))
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("Sessions used").foregroundStyle(Color.fwbMuted)
                Text(snapshot?.countDisplay ?? "--").font(FWBFont.sized(32).weight(.bold)).monospacedDigit()
                Text(snapshot?.countDescription ?? "Your coach will update your session count.")
                    .font(FWBFont.sized(13)).foregroundStyle(Color.fwbMuted)
            }.frame(maxWidth: .infinity, alignment: .leading).fwbCard()
            if let url = snapshot?.sheetURL {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Session sheet").font(FWBFont.sized(13)).foregroundStyle(Color.fwbMuted)
                    Link(destination: url) { Label("Open Google Sheet", systemImage: "arrow.up.right.square") }
                        .font(FWBFont.sized(15).weight(.semibold)).foregroundStyle(Color.fwbLime)
                }.frame(maxWidth: .infinity, alignment: .leading).fwbCard()
            }
            VStack(alignment: .leading, spacing: 12) {
                Text("Session dates").font(FWBFont.sized(18).weight(.bold))
                Text(snapshot?.dates.isEmpty == false ? "Session dates saved for this package." : "Session dates will appear here.")
                    .font(FWBFont.sized(14)).foregroundStyle(Color.fwbMuted)
                SessionDateChips(dates: snapshot?.dates ?? [], emptyMessage: "No session dates yet.")
            }.frame(maxWidth: .infinity, alignment: .leading).fwbCard()
            VStack(alignment: .leading, spacing: 12) {
                Text("Package history").font(FWBFont.sized(12).weight(.semibold)).foregroundStyle(Color.fwbMuted)
                Text("Archived packages").font(FWBFont.sized(18).weight(.bold))
                let archives = snapshot?.archives ?? []
                Text(archives.isEmpty ? "Old packages will appear after your coach starts a new package." : "\(archives.count) old package\(archives.count == 1 ? "" : "s") archived.")
                    .font(FWBFont.sized(14)).foregroundStyle(Color.fwbMuted)
                if archives.isEmpty {
                    Text("No archived packages yet.").foregroundStyle(Color.fwbMuted)
                }
                ForEach(archives) { archive in
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(archive.label).font(FWBFont.sized(15).weight(.semibold))
                                Text(archive.archivedAt.isEmpty ? "Archived package" : "Archived \(destinationDate(archive.archivedAt))")
                                    .font(FWBFont.sized(12)).foregroundStyle(Color.fwbMuted)
                            }
                            Spacer(minLength: 8)
                            Text(archive.total > 0 ? "\(archive.used)/\(archive.total)" : "\(archive.used) used")
                                .font(FWBFont.sized(13).weight(.semibold))
                        }
                        SessionDateChips(dates: archive.dates, emptyMessage: "No dates archived for this package.")
                    }.padding(12).background(Color.fwbSurface, in: RoundedRectangle(cornerRadius: 12))
                }
            }.frame(maxWidth: .infinity, alignment: .leading).fwbCard()
        }
    }

    @MainActor
    private func load() async {
        loadState = .loading
        do {
            let client = AppConfiguration.supabase
            let session = try await client.auth.session
            guard session.user.id == account.id, let email = session.user.email?.lowercased() else { throw DestinationError.signedOut }
            let escapedEmail = email.replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "%", with: "\\%").replacingOccurrences(of: "_", with: "\\_")
            let records: [WebSessionSnapshot] = try await client.from("client_programs")
                .select("session_count_used,session_count_total,session_dates,session_package_history,sheet_url")
                .ilike("client_email", pattern: escapedEmail)
                .eq("active", value: true)
                .or("client_archived.is.null,client_archived.eq.false")
                .order("updated_at", ascending: false, nullsFirst: false)
                .order("created_at", ascending: false, nullsFirst: false)
                .order("id", ascending: false)
                .limit(1).execute().value
            try Task.checkCancellation()
            snapshot = records.first
            loadState = .loaded
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            loadState = .failed("Your session package could not be loaded. Check your connection and try again.")
        }
    }
}

private struct NativeQuestionnaireEditor: View {
    @Environment(\.dismiss) private var dismiss
    let account: SignedInAccount
    let onSaved: () async -> Void
    @State private var draft: QuestionnaireEditorDraft
    @State private var isSaving = false
    @State private var message: String?
    @State private var didSave = false

    init(account: SignedInAccount, draft: QuestionnaireEditorDraft, onSaved: @escaping () async -> Void) {
        self.account = account
        self.onSaved = onSaved
        _draft = State(initialValue: draft)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("Share your goals, movement history, schedule, and training needs so Benjamin can build the right path for private or online coaching.")
                    .foregroundStyle(Color.fwbMuted)
                VStack(alignment: .leading, spacing: 12) {
                    Text("Account").font(FWBFont.sized(18).weight(.bold))
                    Text(account.email).foregroundStyle(Color.fwbMuted)
                    TextField("Name", text: $draft.name).textContentType(.name).textFieldStyle(FWBTextFieldStyle())
                }.fwbCard()
                ForEach(QuestionnaireField.groups, id: \.title) { group in
                    VStack(alignment: .leading, spacing: 18) {
                        Text(group.title).font(FWBFont.sized(18).weight(.bold))
                        ForEach(group.fields.filter { $0.key != "castro_fitness" }) { field in answerInput(field) }
                    }.fwbCard()
                }
                if let message {
                    Text(message).foregroundStyle(didSave ? Color.fwbLime : Color.fwbRed)
                        .accessibilityIdentifier("questionnaire-save-status")
                }
                Button(isSaving ? "Submitting…" : "Submit questionnaire") { Task { await save() } }
                    .buttonStyle(FWBPrimaryButtonStyle()).disabled(isSaving || didSave)
            }.padding(16).disabled(isSaving || didSave)
        }
        .font(FWBFont.sized(15)).background(Color.fwbBackground)
        .navigationTitle("Fitness questionnaire").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button(didSave ? "Done" : "Cancel") { dismiss() }.disabled(isSaving) } }
        .interactiveDismissDisabled(isSaving)
    }

    @ViewBuilder
    private func answerInput(_ field: QuestionnaireField) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(field.label).font(FWBFont.sized(14).weight(.semibold))
            if field.key == "availability_days" {
                ForEach(QuestionnaireField.weekdays, id: \.self) { day in
                    Toggle(day, isOn: Binding(get: { draft.days.contains(day) }, set: { selected in
                        if selected { draft.days.insert(day) } else { draft.days.remove(day) }
                    })).tint(Color.fwbLime)
                }
            } else if !field.choices.isEmpty {
                Picker(field.label, selection: answerBinding(field.key)) {
                    Text("Choose").tag("")
                    ForEach(field.choices, id: \.self) { Text($0).tag($0) }
                }.pickerStyle(.menu).labelsHidden().tint(Color.fwbLime)
            } else {
                TextField(field.key == "date_of_birth" ? "YYYY-MM-DD" : "Your answer", text: answerBinding(field.key), axis: field.limit > 300 ? .vertical : .horizontal)
                    .lineLimit(field.limit > 300 ? 3...8 : 1...1)
                    .textFieldStyle(FWBTextFieldStyle())
                    .keyboardType(field.key == "phone" ? .phonePad : .default)
            }
        }
    }

    private func answerBinding(_ key: String) -> Binding<String> {
        Binding(get: { draft.answers[key] ?? "" }, set: { draft.answers[key] = $0 })
    }

    @MainActor
    private func save() async {
        guard !isSaving, !didSave else { return }
        let name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, name.utf16.count <= 200 else { message = "Add your name (up to 200 characters)."; return }
        guard !(draft.answers["service_interest"] ?? "").isEmpty else { message = "Choose the coaching service you’re interested in."; return }
        var answers: [String: DestinationJSON] = [:]
        for field in QuestionnaireField.groups.flatMap(\.fields) where field.key != "castro_fitness" && field.key != "availability_days" {
            let answer = (draft.answers[field.key] ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard answer.utf16.count <= field.limit else { message = "Keep \(field.label.lowercased()) under \(field.limit) characters."; return }
            if !answer.isEmpty { answers[field.key] = .string(answer) }
        }
        let birthDate = draft.answers["date_of_birth"] ?? ""
        if !birthDate.isEmpty && !DestinationDate.isISODate(birthDate) { message = "Use YYYY-MM-DD for your date of birth."; return }
        answers["availability_days"] = .array(QuestionnaireField.weekdays.filter { draft.days.contains($0) }.map(DestinationJSON.string))
        guard answers.values.reduce(0, { $0 + $1.text.utf16.count }) <= 30_000 else { message = "Please shorten your answers before submitting."; return }
        isSaving = true
        message = nil
        defer { isSaving = false }
        do {
            let client = AppConfiguration.supabase
            let session = try await client.auth.session
            guard session.user.id == account.id, let email = session.user.email else { throw DestinationError.signedOut }
            let response: QuestionnaireSubmissionResponse = try await client.functions.invoke(
                "submit-fitness-questionnaire",
                options: FunctionInvokeOptions(body: QuestionnaireSubmission(
                    submission_id: draft.id.uuidString, email: email.lowercased(), name: name, answers: answers
                ))
            )
            if let error = response.error { message = error; return }
            didSave = true
            message = response.profile_import_warning == true
                ? "Your questionnaire was saved. Some empty profile details could not be filled automatically."
                : "Your questionnaire was saved and linked to your client profile."
            await onSaved()
        } catch FunctionsError.httpError(_, let data) {
            message = (try? JSONDecoder().decode(QuestionnaireSubmissionResponse.self, from: data))?.error
                ?? "Your questionnaire could not be saved. Please try again."
        } catch {
            message = "Your questionnaire could not be saved. Check your connection and try again."
        }
    }
}

private struct QuestionnaireEditorDraft: Identifiable {
    let id = UUID()
    var name: String
    var answers: [String: String]
    var days: Set<String>

    init(record: WebQuestionnaireRecord?) {
        name = record?.respondentName ?? ""
        let saved = record?.answerObject ?? [:]
        let normalized = Dictionary(saved.map { (normalizedQuestionnaireKey($0.key), $0.value.text) }, uniquingKeysWith: { first, _ in first })
        answers = Dictionary(uniqueKeysWithValues: QuestionnaireField.groups.flatMap(\.fields).map { field in
            (field.key, field.keys.compactMap { normalized[normalizedQuestionnaireKey($0)] }.first ?? "")
        })
        days = Set((answers["availability_days"] ?? "").components(separatedBy: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) })
    }
}

private struct QuestionnaireSubmission: Encodable {
    let submission_id: String
    let email: String
    let name: String
    let answers: [String: DestinationJSON]
}

private struct QuestionnaireSubmissionResponse: Decodable {
    let message: String?
    let error: String?
    let profile_import_warning: Bool?
}

private struct WebQuestionnaireRecord: Decodable {
    let id: UUID
    let respondentName: String?
    let respondentEmail: String?
    let submittedAt: String?
    let answers: DestinationJSON?

    enum CodingKeys: String, CodingKey {
        case id, answers
        case respondentName = "respondent_name", respondentEmail = "respondent_email", submittedAt = "submitted_at"
    }

    var answerObject: [String: DestinationJSON] {
        if case .object(let value) = answers { return value }
        if case .string(let value) = answers, let data = value.data(using: .utf8),
           let object = try? JSONDecoder().decode([String: DestinationJSON].self, from: data) { return object }
        return [:]
    }

    var displayGroups: [QuestionnaireAnswerGroup] {
        let indexed = Dictionary(answerObject.map { (normalizedQuestionnaireKey($0.key), (key: $0.key, text: $0.value.text)) }, uniquingKeysWith: { first, _ in first })
        var used = Set<String>()
        var groups = QuestionnaireField.groups.compactMap { group -> QuestionnaireAnswerGroup? in
            let answers = group.fields.compactMap { field -> QuestionnaireAnswer? in
                guard let match = field.keys.compactMap({ indexed[normalizedQuestionnaireKey($0)] }).first(where: { !$0.text.isEmpty }) else { return nil }
                used.insert(normalizedQuestionnaireKey(match.key))
                return QuestionnaireAnswer(id: field.key, label: field.label, text: match.text)
            }
            return answers.isEmpty ? nil : QuestionnaireAnswerGroup(title: group.title, answers: answers)
        }
        let ignored: Set<String> = ["submittedat", "submissionid", "source", "email", "name", "respondentemail", "respondentname"]
        let extras = indexed.keys.sorted().compactMap { key -> QuestionnaireAnswer? in
            guard !used.contains(key), !ignored.contains(key), let answer = indexed[key], !answer.text.isEmpty else { return nil }
            return QuestionnaireAnswer(id: key, label: answer.key.replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " ").capitalized, text: answer.text)
        }
        if !extras.isEmpty { groups.append(QuestionnaireAnswerGroup(title: "Additional details", answers: extras)) }
        return groups
    }
}

private struct QuestionnaireAnswerGroup: Identifiable {
    let title: String
    let answers: [QuestionnaireAnswer]
    var id: String { title }
}

private struct QuestionnaireAnswer: Identifiable {
    let id: String
    let label: String
    let text: String
}

private struct QuestionnaireField: Identifiable {
    let key: String
    let label: String
    let limit: Int
    var choices: [String] = []
    var aliases: [String] = []
    var id: String { key }
    var keys: [String] { [key, label] + aliases }
    static let weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    static let groups: [(title: String, fields: [QuestionnaireField])] = [
        ("Contact", [
            .init(key: "date_of_birth", label: "Date of birth", limit: 10),
            .init(key: "phone", label: "Phone number", limit: 80, aliases: ["phone_number"]),
            .init(key: "home_address", label: "Home address", limit: 300),
            .init(key: "address_line_2", label: "Apartment, suite, or unit", limit: 160),
            .init(key: "address_city", label: "City", limit: 120),
            .init(key: "address_state", label: "State", limit: 120),
            .init(key: "address_zip", label: "ZIP", limit: 32),
            .init(key: "preferred_communication", label: "Preferred communication", limit: 40, choices: ["Email", "Phone", "Text"]),
            .init(key: "service_interest", label: "Coaching service", limit: 120, choices: ["Online coaching", "In-person training", "Hybrid online and in-person training"], aliases: ["Which coaching service are you interested in?"])
        ]),
        ("Readiness", [
            .init(key: "heart_condition", label: "Has a doctor recommended only doctor-approved physical activity?", limit: 20, choices: ["Yes", "No"], aliases: ["Doctor recommended physical activity only?"]),
            .init(key: "chest_pain_activity", label: "Chest pain during physical activity?", limit: 20, choices: ["Yes", "No"]),
            .init(key: "chest_pain_rest", label: "Chest pain at rest in the past month?", limit: 20, choices: ["Yes", "No", "Maybe"]),
            .init(key: "bone_joint_problem", label: "Bone or joint problem that activity could worsen?", limit: 20, choices: ["Yes", "No", "Maybe"], aliases: ["Bone or joint problem?"]),
            .init(key: "other_activity_reason", label: "Any other reason not to engage in physical activity?", limit: 20, choices: ["Yes", "No", "Maybe"], aliases: ["Other reason not to engage in physical activity?"])
        ]),
        ("Goals", [
            .init(key: "comfortable_fitness_history", label: "Fitness history", limit: 2000, aliases: ["Comfortable fitness history"]),
            .init(key: "fitness_goals", label: "Fitness goals and why", limit: 4000),
            .init(key: "goal_timeline", label: "Goal timeline", limit: 1000),
            .init(key: "why_now", label: "Why now", limit: 4000),
            .init(key: "goal_plan", label: "Plan for achieving goals", limit: 4000),
            .init(key: "daily_nutrition", label: "Daily nutrition", limit: 4000),
            .init(key: "fitness_apps", label: "Fitness apps", limit: 1000),
            .init(key: "commitment_level", label: "Commitment level", limit: 4, choices: ["1", "2", "3", "4", "5"]),
            .init(key: "ready_for_change", label: "Ready for a change today?", limit: 20, choices: ["Yes", "No", "Maybe"])
        ]),
        ("Lifestyle", [
            .init(key: "occupation", label: "Occupation", limit: 1000),
            .init(key: "repetitive_movements", label: "Repetitive movements at work", limit: 3000),
            .init(key: "work_stress", label: "Work anxiety or mental stress", limit: 2000),
            .init(key: "recreational_activities", label: "Recreational activities", limit: 3000),
            .init(key: "hobbies", label: "Hobbies", limit: 3000),
            .init(key: "pain_or_injuries", label: "Pain or injuries", limit: 4000),
            .init(key: "surgeries", label: "Surgeries", limit: 4000),
            .init(key: "sleep_schedule", label: "Sleep schedule", limit: 1000)
        ]),
        ("Training logistics", [
            .init(key: "castro_fitness", label: "Able to train at Castro Fitness, Market Street?", limit: 20),
            .init(key: "home_equipment", label: "Home workout equipment", limit: 3000),
            .init(key: "availability_days", label: "Preferred days", limit: 120, aliases: ["Availability by day"]),
            .init(key: "availability_times", label: "Preferred days and times", limit: 3000, aliases: ["Availability by time"]),
            .init(key: "additional_notes", label: "Anything else", limit: 4000)
        ])
    ]
}

private struct WebSessionSnapshot: Decodable {
    let fields: [String: DestinationJSON]
    init(from decoder: Decoder) throws { fields = try [String: DestinationJSON](from: decoder) }
    var used: Int { fields["session_count_used"]?.nonnegativeCount ?? 0 }
    var total: Int { fields["session_count_total"]?.nonnegativeCount ?? 0 }
    var remaining: Int { max(total - used, 0) }
    var dates: [String] { DestinationDate.dates(fields["session_dates"]) }
    var countDisplay: String { total > 0 ? "\(used)/\(total)" : used > 0 ? String(used) : "--" }
    var countDescription: String {
        total > 0 ? "\(used) used out of \(total) sessions." : used > 0 ? "\(used) sessions used." : "Your coach will update your session count."
    }
    var sheetURL: URL? {
        guard let text = fields["sheet_url"]?.text, let url = URL(string: text),
              url.scheme == "https", url.host == "docs.google.com", url.path.hasPrefix("/spreadsheets/") else { return nil }
        return url
    }
    var archives: [WebSessionArchive] {
        guard case .array(let records) = fields["session_package_history"] else { return [] }
        return Array(records.enumerated().compactMap { index, item -> WebSessionArchive? in
            guard case .object(let record) = item else { return nil }
            let archive = WebSessionArchive(id: index, fields: record)
            return archive.used > 0 || archive.total > 0 || !archive.dates.isEmpty ? archive : nil
        }.prefix(20))
    }
}

private struct WebSessionArchive: Identifiable {
    let id: Int
    let fields: [String: DestinationJSON]
    var label: String { fields["label"]?.text.nonempty ?? "Package \(id + 1)" }
    var used: Int { fields["used"]?.nonnegativeCount ?? 0 }
    var total: Int { fields["total"]?.nonnegativeCount ?? 0 }
    var dates: [String] { DestinationDate.dates(fields["dates"]) }
    var archivedAt: String { fields["archived_at"]?.text.nonempty ?? fields["archivedAt"]?.text ?? "" }
}

private enum DestinationJSON: Codable {
    case string(String), number(Double), bool(Bool), array([DestinationJSON]), object([String: DestinationJSON]), null
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode([DestinationJSON].self) { self = .array(value) }
        else { self = .object(try container.decode([String: DestinationJSON].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
    var text: String {
        switch self {
        case .string(let value): return value.trimmingCharacters(in: .whitespacesAndNewlines)
        case .number(let value): return value.formatted(.number.grouping(.never))
        case .bool(let value): return value ? "true" : "false"
        case .array(let value): return value.map(\.text).filter { !$0.isEmpty }.joined(separator: ", ")
        case .object(let value):
            guard !value.isEmpty, let data = try? JSONEncoder().encode(value) else { return "" }
            return String(data: data, encoding: .utf8) ?? ""
        case .null: return ""
        }
    }
    var nonnegativeCount: Int {
        guard let value = Double(text), value.isFinite, value >= 0, value < Double(Int.max) else { return 0 }
        return Int(value.rounded(.down))
    }
}

private enum DestinationLoadState { case loading, loaded, failed(String) }
private enum DestinationError: Error { case signedOut }
private extension String { var nonempty: String? { isEmpty ? nil : self } }
private func normalizedQuestionnaireKey(_ value: String) -> String { value.lowercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) } }

private enum DestinationDate {
    static func isISODate(_ value: String) -> Bool {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard let date = formatter.date(from: value) else { return false }
        return formatter.string(from: date) == value
    }
    static func parsed(_ value: String) -> Date? {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: value) { return date }
        iso.formatOptions = [.withInternetDateTime]
        if let date = iso.date(from: value) { return date }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.isLenient = false
        formatter.twoDigitStartDate = Date(timeIntervalSince1970: 946_684_800)
        for format in ["yyyy-M-d", "M/d/yyyy", "M/d/yy", "M-d-yyyy", "M-d-yy", "MMM d, yyyy", "MMMM d, yyyy"] {
            formatter.dateFormat = format
            if let date = formatter.date(from: value) { return date }
        }
        if let serial = Double(value), (20_000...80_000).contains(serial) {
            return Date(timeIntervalSince1970: (floor(serial) - 25_569) * 86_400)
        }
        return nil
    }
    static func dates(_ value: DestinationJSON?) -> [String] {
        guard case .array(let values) = value else { return [] }
        var seen = Set<String>()
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return values.compactMap { item in
            guard let date = parsed(item.text) else { return nil }
            let key = formatter.string(from: date)
            return seen.insert(key).inserted ? key : nil
        }
    }
}

private func destinationDate(_ value: String?) -> String {
    guard let value = value?.nonempty else { return "Date not available" }
    guard let date = DestinationDate.parsed(value) else { return value }
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US")
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateStyle = .medium
    return formatter.string(from: date)
}

private struct DestinationHeading: View {
    let kicker: String
    let title: String
    let status: String
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(kicker).font(FWBFont.sized(12).weight(.semibold)).foregroundStyle(Color.fwbMuted)
            Text(title).font(FWBFont.sized(28).weight(.bold)).foregroundStyle(Color.fwbWarmWhite)
            Text(status).font(FWBFont.sized(12).weight(.semibold)).foregroundStyle(Color.fwbMuted)
                .padding(.horizontal, 10).padding(.vertical, 6)
                .background(Color.fwbCard, in: Capsule())
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct DestinationRetry: View {
    let message: String
    let retry: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(message).foregroundStyle(Color.fwbMuted)
            Button("Try again", action: retry).buttonStyle(FWBSecondaryButtonStyle())
        }.fwbCard()
    }
}

private struct SessionDateChips: View {
    let dates: [String]
    let emptyMessage: String
    var body: some View {
        if dates.isEmpty {
            Text(emptyMessage).font(FWBFont.sized(14)).foregroundStyle(Color.fwbMuted)
        } else {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 116), alignment: .leading)], alignment: .leading, spacing: 8) {
                ForEach(dates, id: \.self) { date in
                    Text(destinationDate(date)).font(FWBFont.sized(12).weight(.medium))
                        .padding(.horizontal, 10).padding(.vertical, 8)
                        .background(Color.fwbSurface, in: Capsule())
                }
            }
        }
    }
}
