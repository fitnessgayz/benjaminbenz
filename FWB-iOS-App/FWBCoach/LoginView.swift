import SwiftUI

struct LoginView: View {
    private enum Field: Hashable {
        case email
        case password
    }

    @ObservedObject var sessionStore: SessionStore
    @State private var email = ""
    @State private var password = ""
    @FocusState private var focusedField: Field?

    var body: some View {
        ZStack {
            Color.fwbBackground.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 30) {
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
    }

    private var brandHeader: some View {
        VStack(spacing: 12) {
            FWBMark(size: 76)

            VStack(spacing: 7) {
                Text("FITNESS WITH BENJAMIN")
                    .font(.footnote.weight(.black))
                    .tracking(1.8)
                    .foregroundStyle(Color.fwbRed)

                Text("FWB TRAINING")
                    .font(.largeTitle.weight(.black))
                    .fontWidth(.condensed)
                    .tracking(0.6)
                    .foregroundStyle(Color.fwbWarmWhite)

                Text("Your training. Wherever you are.")
                    .font(.subheadline)
                    .foregroundStyle(Color.fwbMuted)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var loginForm: some View {
        VStack(alignment: .leading, spacing: 20) {
            FWBRule()

            VStack(alignment: .leading, spacing: 7) {
                Text("WELCOME BACK")
                    .font(.title2.weight(.black))
                    .fontWidth(.condensed)
                Text("Use the same client account as the web app.")
                    .font(.subheadline)
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
                    .accessibilityIdentifier("login.email")

                SecureField("Password", text: $password)
                    .textContentType(.password)
                    .focused($focusedField, equals: .password)
                    .submitLabel(.go)
                    .onSubmit { signIn() }
                    .accessibilityIdentifier("login.password")
            }
            .textFieldStyle(FWBTextFieldStyle())

            if let message = sessionStore.message {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(message.contains("sent") ? Color.fwbLime : Color.fwbRed)
                    .accessibilityIdentifier("login.message")
            }

            Button(action: signIn) {
                HStack {
                    if sessionStore.isSubmitting {
                        ProgressView()
                            .tint(.black)
                    }
                    Text(sessionStore.isSubmitting ? "SIGNING IN…" : "SIGN IN")
                }
            }
            .buttonStyle(FWBPrimaryButtonStyle())
            .disabled(sessionStore.isSubmitting)
            .accessibilityIdentifier("login.submit")

            Button("Forgot password?") {
                focusedField = nil
                Task { await sessionStore.sendPasswordReset(email: email) }
            }
            .font(.subheadline.weight(.bold))
            .foregroundStyle(Color.fwbWarmWhite)
            .underline()
            .disabled(sessionStore.isSubmitting)
            .frame(maxWidth: .infinity)
            .accessibilityIdentifier("login.reset")

            FWBRule()
        }
    }

    private var webAccess: some View {
        VStack(spacing: 14) {
            Link(destination: URL(string: "https://benjaminbenz.com/client-login.html")!) {
                Label("Use FWB Training on the web", systemImage: "globe")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.fwbWarmWhite)
            }

            Link(destination: AppConfiguration.coachWebPortalURL) {
                Label("Coach administration on the website", systemImage: "arrow.up.right.square")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.fwbMuted)
            }
        }
    }

    private func signIn() {
        focusedField = nil
        Task { await sessionStore.signIn(email: email, password: password) }
    }
}

#Preview {
    LoginView(sessionStore: SessionStore())
}
