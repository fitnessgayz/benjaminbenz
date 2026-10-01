import Foundation

actor SupabaseClient {
    private let baseURL: URL
    private let publishableKey: String
    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(
        baseURL: URL = AppConfiguration.supabaseURL,
        publishableKey: String = AppConfiguration.supabasePublishableKey,
        session: URLSession = .shared
    ) {
        self.baseURL = baseURL
        self.publishableKey = publishableKey
        self.session = session
    }

    func signIn(email: String, password: String) async throws -> AuthSession {
        let body = SignInRequest(email: email, password: password)
        return try await authRequest(path: "/auth/v1/token", query: "grant_type=password", body: body)
    }

    func refresh(refreshToken: String) async throws -> AuthSession {
        let body = RefreshRequest(refreshToken: refreshToken)
        return try await authRequest(path: "/auth/v1/token", query: "grant_type=refresh_token", body: body)
    }

    func fetchActivePrograms(accessToken: String) async throws -> [CoachProgram] {
        var components = URLComponents(url: baseURL.appending(path: "/rest/v1/client_programs"), resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "select", value: [
                "id", "client_email", "client_name", "client_phone", "initials",
                "program_title", "program_summary", "session_count_used", "session_count_total",
                "fitness_goal", "focus_target", "height", "starting_weight", "starting_bodyfat",
                "coach_note_title", "coach_note_body", "active", "client_archived", "updated_at"
            ].joined(separator: ",")),
            URLQueryItem(name: "active", value: "eq.true"),
            URLQueryItem(name: "client_archived", value: "eq.false"),
            URLQueryItem(name: "order", value: "client_name.asc")
        ]
        guard let url = components.url else { throw SupabaseError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return try decoder.decode([CoachProgram].self, from: data)
    }

    private func authRequest<Body: Encodable>(path: String, query: String, body: Body) async throws -> AuthSession {
        guard var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false) else {
            throw SupabaseError.invalidURL
        }
        components.percentEncodedQuery = query
        guard let url = components.url else { throw SupabaseError.invalidURL }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = try encoder.encode(body)
        request.setValue(publishableKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await session.data(for: request)
        try validate(response: response, data: data)
        return try decoder.decode(AuthSession.self, from: data)
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let response = response as? HTTPURLResponse else { throw SupabaseError.invalidResponse }
        guard (200..<300).contains(response.statusCode) else {
            let payload = try? decoder.decode(ErrorPayload.self, from: data)
            throw SupabaseError.server(status: response.statusCode, message: payload?.message ?? payload?.errorDescription)
        }
    }
}

private struct SignInRequest: Encodable {
    let email: String
    let password: String
}

private struct RefreshRequest: Encodable {
    let refreshToken: String

    enum CodingKeys: String, CodingKey {
        case refreshToken = "refresh_token"
    }
}

private struct ErrorPayload: Decodable {
    let message: String?
    let errorDescription: String?

    enum CodingKeys: String, CodingKey {
        case message
        case errorDescription = "error_description"
    }
}

enum SupabaseError: LocalizedError {
    case invalidURL
    case invalidResponse
    case server(status: Int, message: String?)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "The FWB service address is invalid."
        case .invalidResponse:
            return "FWB returned an unreadable response."
        case .server(let status, let message):
            if status == 400 || status == 401 { return "That email or password did not work." }
            return message ?? "FWB could not complete the request (\(status))."
        }
    }
}
