import Foundation

enum APIClientError: LocalizedError {
    case invalidServer
    case response(Int, String)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .invalidServer: "Enter the private HTTPS address shown by your Mac."
        case let .response(_, message): message
        case .invalidResponse: "The Mac returned an unreadable response."
        }
    }
}

struct APIClient {
    let baseURL: URL
    let credential: String?
    var session: URLSession = .shared

    init(baseURL: URL, credential: String? = nil, session: URLSession = .shared) throws {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false),
              components.host != nil else { throw APIClientError.invalidServer }
        components.path = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let normalized = components.url else { throw APIClientError.invalidServer }
#if DEBUG
        let local = ["localhost", "127.0.0.1"].contains(normalized.host ?? "")
#else
        let local = false
#endif
        guard normalized.scheme == "https" || (local && normalized.scheme == "http") else {
            throw APIClientError.invalidServer
        }
        self.baseURL = normalized
        self.credential = credential
        self.session = session
    }

    func pair(code: String, deviceName: String) async throws -> PairResponse {
        try await send(method: "POST", path: "/remote/v1/pair", body: PairRequest(code: code, deviceName: deviceName))
    }

    func state() async throws -> RemoteState {
        try await send(method: "GET", path: "/remote/v1/state")
    }

    func startTask(workspaceId: String, prompt: String) async throws -> TaskResponse {
        try await command(
            path: "/remote/v1/tasks",
            body: CreateTaskRequest(workspaceId: workspaceId, prompt: prompt)
        )
    }

    func followUp(taskId: String, text: String) async throws -> CommandResponse {
        try await command(
            path: "/remote/v1/tasks/\(taskId)/follow-ups",
            body: FollowUpRequest(text: text)
        )
    }

    func cancel(taskId: String) async throws -> CommandResponse {
        try await command(path: "/remote/v1/tasks/\(taskId)/cancel", body: EmptyRequest())
    }

    func decide(approval: RemoteApproval, allow: Bool) async throws -> ApprovalResponse {
        try await command(
            path: "/remote/v1/approvals/\(approval.id)",
            body: ApprovalRequest(hash: approval.hash, allow: allow)
        )
    }

    func download(_ artifact: RemoteArtifact) async throws -> URL {
        let (data, response) = try await data(method: "GET", path: "/remote/v1/artifacts/\(artifact.id)")
        try check(response: response, data: data)
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "DUKECompanion", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let destination = directory.appending(path: "\(artifact.id)-\(artifact.name)")
        try data.write(to: destination, options: .atomic)
        return destination
    }

    private func command<Request: Encodable, Response: Decodable>(
        path: String,
        body: Request
    ) async throws -> Response {
        let key = UUID().uuidString.lowercased()
        do {
            return try await send(method: "POST", path: path, body: body, idempotencyKey: key)
        } catch let error as URLError where [.timedOut, .networkConnectionLost, .cannotConnectToHost].contains(error.code) {
            return try await send(method: "POST", path: path, body: body, idempotencyKey: key)
        }
    }

    private func send<Response: Decodable>(method: String, path: String) async throws -> Response {
        let (data, response) = try await data(method: method, path: path)
        try check(response: response, data: data)
        guard let decoded = try? JSONDecoder().decode(Response.self, from: data) else {
            throw APIClientError.invalidResponse
        }
        return decoded
    }

    private func send<Request: Encodable, Response: Decodable>(
        method: String,
        path: String,
        body: Request,
        idempotencyKey: String? = nil
    ) async throws -> Response {
        let encoded = try JSONEncoder().encode(body)
        let (data, response) = try await data(
            method: method,
            path: path,
            body: encoded,
            idempotencyKey: idempotencyKey
        )
        try check(response: response, data: data)
        guard let decoded = try? JSONDecoder().decode(Response.self, from: data) else {
            throw APIClientError.invalidResponse
        }
        return decoded
    }

    private func data(
        method: String,
        path: String,
        body: Data? = nil,
        idempotencyKey: String? = nil
    ) async throws -> (Data, URLResponse) {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw APIClientError.invalidServer
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 20
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let credential { request.setValue("Bearer \(credential)", forHTTPHeaderField: "Authorization") }
        if let idempotencyKey { request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key") }
        return try await session.data(for: request)
    }

    private func check(response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { throw APIClientError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(ErrorResponse.self, from: data).error)
                ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
            throw APIClientError.response(http.statusCode, message)
        }
    }
}

