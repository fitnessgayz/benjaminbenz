import SwiftUI

/// A remembered photo is only a shortcut to the credential form. Authentication
/// and the persisted session remain owned by SessionStore and the system Keychain.
struct LoginView: View {
    private struct SignInDestination: Identifiable {
        let id = UUID()
        let email: String
    }

    @ObservedObject var sessionStore: SessionStore
    @ObservedObject private var rememberedProfile: RememberedProfileStore
    @State private var destination: SignInDestination?
    @State private var forgetError: String?

    @MainActor
    init(sessionStore: SessionStore, rememberedProfile: RememberedProfileStore? = nil) {
        self.sessionStore = sessionStore
        self.rememberedProfile = rememberedProfile ?? .shared
    }

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 28) {
                    VStack(spacing: 12) {
                        FWBMark(size: 60)
                        Text("FWB Coach")
                            .font(FWBFont.title2.weight(.black))
                            .tracking(0.6)
                            .foregroundStyle(Color.fwbWarmWhite)
                        Text("Your clients. Your coaching workspace.")
                            .font(FWBFont.subheadline)
                            .foregroundStyle(Color.fwbMuted)
                    }
                    .accessibilityElement(children: .combine)

                    VStack(spacing: 22) {
                        VStack(spacing: 7) {
                            Text(rememberedProfile.profile == nil ? "Welcome to FWB" : "Welcome back")
                                .font(FWBFont.title2.weight(.bold))
                            Text(rememberedProfile.profile == nil ? "Tap your profile to sign in." : "Tap your photo to sign in.")
                                .font(FWBFont.subheadline)
                                .foregroundStyle(Color.fwbMuted)
                        }

                        Button {
                            openSignIn(email: rememberedProfile.profile?.email ?? "")
                        } label: {
                            VStack(spacing: 14) {
                                ZStack(alignment: .bottomTrailing) {
                                    ProfilePhotoAvatar(data: rememberedProfile.profile?.photoData, size: 112)
                                    Image(systemName: "arrow.right")
                                        .font(FWBFont.body.weight(.bold))
                                        .foregroundStyle(Color.black)
                                        .frame(width: 34, height: 34)
                                        .background(Color.fwbAccentFill, in: Circle())
                                        .overlay { Circle().stroke(Color.fwbCard, lineWidth: 3) }
                                }
                                if let profile = rememberedProfile.profile {
                                    VStack(spacing: 4) {
                                        if let name = profile.displayName, !name.isEmpty {
                                            Text(name).font(FWBFont.headline.weight(.bold))
                                        }
                                        Text(profile.email)
                                            .font(FWBFont.subheadline)
                                            .foregroundStyle(Color.fwbMuted)
                                            .lineLimit(2)
                                    }
                                }
                                Text("Sign in")
                                    .font(FWBFont.headline.weight(.bold))
                                    .foregroundStyle(Color.fwbLime)
                            }
                            .frame(maxWidth: .infinity)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Sign in with your profile")
                        .accessibilityValue(rememberedProfile.profile?.email ?? "Client account")
                        .accessibilityHint("Opens the sign-in form.")
                        .accessibilityIdentifier("login.profile")

                        Text("You’ll stay signed in between visits.")
                            .font(FWBFont.footnote)
                            .foregroundStyle(Color.fwbMuted)
                    }
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.fwbWarmWhite)
                    .fwbCard()

                    if rememberedProfile.profile != nil {
                        VStack(spacing: 18) {
                            Button("Use another account") { openSignIn(email: "") }
                                .font(FWBFont.subheadline.weight(.semibold))
                                .foregroundStyle(Color.fwbLime)
                                .accessibilityIdentifier("login.anotherAccount")
                            Button("Forget this profile on this device") {
                                forgetError = rememberedProfile.forget() ? nil
                                    : "This profile could not be removed from this device. Please try again."
                            }
                            .font(FWBFont.footnote)
                            .foregroundStyle(Color.fwbMuted)
                            .accessibilityIdentifier("login.forgetProfile")
                        }
                    }

                    if let forgetError {
                        Text(forgetError)
                            .font(FWBFont.footnote)
                            .foregroundStyle(Color.fwbRed)
                            .multilineTextAlignment(.center)
                    }

                    if destination == nil, let message = sessionStore.message {
                        Text(message)
                            .font(FWBFont.footnote)
                            .foregroundStyle(Color.fwbMuted)
                            .multilineTextAlignment(.center)
                    }
                    if sessionStore.canRetryAccess {
                        Button("Retry access") { Task { await sessionStore.retryAccess() } }
                            .font(FWBFont.subheadline.weight(.bold))
                            .foregroundStyle(Color.fwbLime)
                            .disabled(sessionStore.isSubmitting)
                            .accessibilityIdentifier("login.retry-access")
                    }

                    Link(destination: AppConfiguration.clientWebPortalURL) {
                        Label("Use FWB Training on the web", systemImage: "globe")
                            .font(FWBFont.footnote.weight(.semibold))
                            .foregroundStyle(Color.fwbMuted)
                    }
                }
                .padding(.horizontal, 22)
                .padding(.vertical, 36)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
        }
        .sheet(item: $destination) { destination in
            NavigationStack {
                CredentialsLoginView(sessionStore: sessionStore, initialEmail: destination.email)
            }
            .tint(Color.fwbLime)
        }
    }

    private func openSignIn(email: String) {
        sessionStore.message = nil
        destination = SignInDestination(email: email)
    }
}

struct PasswordChangeView: View {
    @ObservedObject var sessionStore: SessionStore
    let isRecovery: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var password = ""
    @State private var confirmation = ""
    @FocusState private var focusedField: Field?

    private enum Field { case password, confirmation }

    init(sessionStore: SessionStore, isRecovery: Bool = false) {
        self.sessionStore = sessionStore
        self.isRecovery = isRecovery
    }

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 24) {
                    VStack(spacing: 10) {
                        Image(systemName: "key.fill")
                            .font(.system(size: 32, weight: .bold))
                            .foregroundStyle(Color.black)
                            .frame(width: 64, height: 64)
                            .background(Color.fwbAccentFill, in: Circle())
                        Text(isRecovery ? "Choose a new password" : "Change your password")
                            .font(FWBFont.title2.weight(.black))
                            .foregroundStyle(Color.fwbWarmWhite)
                        Text(isRecovery
                             ? "Create a new password before returning to your account."
                             : "Your new password will work in both the app and on the web.")
                            .font(FWBFont.subheadline)
                            .foregroundStyle(Color.fwbMuted)
                            .multilineTextAlignment(.center)
                    }

                    VStack(spacing: 16) {
                        SecureField("New password", text: $password)
                            .textContentType(.newPassword)
                            .focused($focusedField, equals: .password)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .confirmation }
                            .accessibilityIdentifier("password.new")
                        SecureField("Confirm new password", text: $confirmation)
                            .textContentType(.newPassword)
                            .focused($focusedField, equals: .confirmation)
                            .submitLabel(.done)
                            .onSubmit { updatePassword() }
                            .accessibilityIdentifier("password.confirmation")
                    }
                    .textFieldStyle(FWBTextFieldStyle())

                    if let message = sessionStore.passwordMessage {
                        Text(message)
                            .font(FWBFont.footnote)
                            .foregroundStyle(message.contains("updated") ? Color.fwbLime : Color.fwbRed)
                            .multilineTextAlignment(.center)
                            .accessibilityIdentifier("password.message")
                    }

                    Button(action: updatePassword) {
                        HStack {
                            if sessionStore.isSubmitting { ProgressView().tint(.black) }
                            Text(sessionStore.isSubmitting ? "Updating…" : "Update password")
                        }
                    }
                    .buttonStyle(FWBPrimaryButtonStyle())
                    .disabled(sessionStore.isSubmitting)
                    .accessibilityIdentifier("password.submit")
                }
                .padding(.horizontal, 22)
                .padding(.vertical, 36)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .navigationTitle(isRecovery ? "Reset password" : "Password")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Color.fwbBackground, for: .navigationBar)
        .interactiveDismissDisabled(sessionStore.isSubmitting)
        .onAppear { sessionStore.clearPasswordMessage() }
    }

    private func updatePassword() {
        focusedField = nil
        Task {
            let didUpdate = await sessionStore.changePassword(
                password,
                confirmation: confirmation,
                isRecovery: isRecovery
            )
            if didUpdate, !isRecovery { dismiss() }
        }
    }
}

private struct CredentialsLoginView: View {
    private enum Field: Hashable {
        case email
        case password
    }

    @ObservedObject var sessionStore: SessionStore
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var password = ""
    @FocusState private var focusedField: Field?

    init(sessionStore: SessionStore, initialEmail: String) {
        self.sessionStore = sessionStore
        _email = State(initialValue: initialEmail)
    }

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    brandHeader
                    loginForm
                    webAccess
                }
                .padding(.horizontal, 22)
                .padding(.top, 34)
                .padding(.bottom, 38)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .navigationTitle("Sign in")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Close") { dismiss() }
                    .disabled(sessionStore.isSubmitting)
                    .accessibilityIdentifier("login.close")
            }
        }
        .interactiveDismissDisabled(sessionStore.isSubmitting)
    }

    private var brandHeader: some View {
        VStack(spacing: 12) {
            FWBMark(size: 76)

            VStack(spacing: 7) {
                Text("FITNESS WITH BENJAMIN")
                    .font(FWBFont.footnote.weight(.black))
                    .tracking(1.8)
                    .foregroundStyle(Color.fwbMuted)

                Text("FWB Coach")
                    .font(FWBFont.largeTitle.weight(.black))

                    .tracking(0.6)
                    .foregroundStyle(Color.fwbWarmWhite)

                Text("Your clients. Your coaching workspace.")
                    .font(FWBFont.subheadline)
                    .foregroundStyle(Color.fwbMuted)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var loginForm: some View {
        VStack(alignment: .leading, spacing: 20) {

            VStack(alignment: .leading, spacing: 7) {
                Text("Welcome back")
                    .font(FWBFont.title2.weight(.black))

                Text("Use the same email and password as the web app.")
                    .font(FWBFont.subheadline)
                    .foregroundStyle(Color.fwbMuted)
            }

            VStack(spacing: 12) {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focusedField = .password }
                    .accessibilityLabel("Email")
                    .accessibilityIdentifier("login.email")

                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .focused($focusedField, equals: .password)
                    .submitLabel(.go)
                    .onSubmit { signIn() }
                    .accessibilityLabel("Password")
                    .accessibilityIdentifier("login.password")
            }
            .textFieldStyle(FWBTextFieldStyle())

            if let message = sessionStore.message {
                Text(message)
                    .font(FWBFont.footnote)
                    .foregroundStyle(message.contains("sent") ? Color.fwbLime : Color.fwbRed)
                    .accessibilityIdentifier("login.message")
            }

            if sessionStore.canRetryAccess {
                Button("Retry access") { Task { await sessionStore.retryAccess() } }
                    .font(FWBFont.subheadline.weight(.bold))
                    .disabled(sessionStore.isSubmitting)
                    .accessibilityIdentifier("login.retry-access")
            }

            Button(action: signIn) {
                HStack {
                    if sessionStore.isSubmitting {
                        ProgressView()
                            .tint(.black)
                    }
                    Text(sessionStore.isSubmitting ? "Signing in…" : "Sign in")
                }
            }
            .buttonStyle(FWBPrimaryButtonStyle())
            .disabled(sessionStore.isSubmitting)
            .accessibilityIdentifier("login.submit")

            Button("Forgot password?") {
                focusedField = nil
                Task { await sessionStore.sendPasswordReset(email: email) }
            }
            .font(FWBFont.subheadline.weight(.bold))
            .foregroundStyle(Color.fwbWarmWhite)
            .underline()
            .disabled(sessionStore.isSubmitting)
            .frame(maxWidth: .infinity)
            .accessibilityIdentifier("login.reset")

        }
        .fwbCard()
    }

    private var webAccess: some View {
        Link(destination: AppConfiguration.clientWebPortalURL) {
            Label("Use FWB Training on the web", systemImage: "globe")
                .font(FWBFont.footnote.weight(.semibold))
                .foregroundStyle(Color.fwbWarmWhite)
        }
    }

    private func signIn() {
        guard !sessionStore.isSubmitting else { return }
        focusedField = nil
        Task { await sessionStore.signIn(email: email, password: password, intent: .coach) }
    }
}

#Preview {
    LoginView(sessionStore: SessionStore())
}

#if DEBUG
/// Synthetic, local-only state for verifying profile entry without a live login.
struct ProfileLoginAuditView: View {
    @StateObject private var sessionStore = SessionStore()
    @StateObject private var rememberedProfile: RememberedProfileStore

    init() {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("fwb-profile-login-audit-\(UUID().uuidString).json")
        let store = RememberedProfileStore(fileURL: url)
        store.remember(
            account: SignedInAccount(
                id: UUID(uuidString: "A11D17A0-0000-4000-8000-000000000002")!,
                email: "preview.client@example.com"
            ), displayName: "Alex"
        )
        _rememberedProfile = StateObject(wrappedValue: store)
    }

    var body: some View {
        LoginView(sessionStore: sessionStore, rememberedProfile: rememberedProfile)
            .preferredColorScheme(.light)
    }
}
#endif
