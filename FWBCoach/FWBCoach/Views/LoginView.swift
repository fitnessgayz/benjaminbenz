import SwiftUI

struct LoginView: View {
    let session: AppSession
    @State private var email = ""
    @State private var password = ""
    @State private var isSigningIn = false
    @FocusState private var focusedField: Field?

    private enum Field {
        case email
        case password
    }

    var body: some View {
        ZStack {
            FWBTheme.paper.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    brand
                    VStack(alignment: .leading, spacing: 10) {
                        Text("COACH APP")
                            .font(.caption.weight(.black))
                            .tracking(2)
                            .foregroundStyle(FWBTheme.muted)
                        Text("Run your coaching workspace")
                            .font(.system(size: 45, weight: .black, design: .rounded))
                            .tracking(-1.5)
                        Text("Your clients, programs, sessions, and progress stay connected to FWB Client.")
                            .font(.title3.weight(.semibold))
                            .foregroundStyle(FWBTheme.muted)
                    }
                    signInCard
                }
                .padding(24)
                .frame(maxWidth: 640)
                .frame(maxWidth: .infinity)
            }
        }
    }

    private var brand: some View {
        HStack(spacing: 12) {
            Text("FWB")
                .font(.caption.weight(.black))
                .frame(width: 48, height: 48)
                .background(FWBTheme.lime, in: Circle())
            Text("Coach")
                .font(.title3.weight(.black))
        }
        .foregroundStyle(FWBTheme.ink)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("FWB Coach")
    }

    private var signInCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Private login")
                .font(.caption.weight(.black))
                .textCase(.uppercase)
                .tracking(1.5)
                .foregroundStyle(FWBTheme.muted)
            Text("Coach access")
                .font(.largeTitle.weight(.black))

            TextField("Coach email", text: $email)
                .textContentType(.username)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($focusedField, equals: .email)
                .submitLabel(.next)
                .onSubmit { focusedField = .password }
                .fwbInputStyle()

            SecureField("Password", text: $password)
                .textContentType(.password)
                .focused($focusedField, equals: .password)
                .submitLabel(.go)
                .onSubmit { Task { await signIn() } }
                .fwbInputStyle()

            if let errorMessage = session.errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.circle.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("login-error")
            }

            Button {
                Task { await signIn() }
            } label: {
                HStack {
                    if isSigningIn { ProgressView().tint(FWBTheme.ink) }
                    Text(isSigningIn ? "Signing in…" : "Sign in to coach app")
                        .fontWeight(.black)
                }
                .frame(maxWidth: .infinity, minHeight: 54)
            }
            .buttonStyle(.plain)
            .foregroundStyle(FWBTheme.ink)
            .background(FWBTheme.lime, in: RoundedRectangle(cornerRadius: 16))
            .disabled(isSigningIn || email.isEmpty || password.isEmpty)
            .opacity(email.isEmpty || password.isEmpty ? 0.55 : 1)
            .accessibilityIdentifier("coach-sign-in")
        }
        .padding(24)
        .background(.white, in: RoundedRectangle(cornerRadius: 24))
        .shadow(color: .black.opacity(0.08), radius: 30, y: 18)
    }

    private func signIn() async {
        guard !isSigningIn else { return }
        isSigningIn = true
        await session.signIn(email: email, password: password)
        isSigningIn = false
    }
}

private extension View {
    func fwbInputStyle() -> some View {
        self
            .padding(.horizontal, 16)
            .frame(minHeight: 54)
            .background(FWBTheme.paper, in: RoundedRectangle(cornerRadius: 14))
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .stroke(.black.opacity(0.12), lineWidth: 1)
            }
    }
}

#Preview {
    LoginView(session: AppSession())
}
