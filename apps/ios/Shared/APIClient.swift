import Foundation

public enum APIError: Error, LocalizedError, Sendable {
    case invalidResponse
    case rejected(status: Int, message: String)
    case decoding(String)

    public var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Сервер вернул некорректный ответ"
        case let .rejected(_, message):
            return message
        case let .decoding(message):
            return "Не удалось прочитать ответ: \(message)"
        }
    }
}

public enum EvidenceMultipart {
    public static func build(
        imageData: Data,
        entityType: String,
        entityId: String,
        label: String?,
        boundary: String = "AliStore-\(UUID().uuidString)"
    ) -> (body: Data, contentType: String) {
        var body = Data()
        func field(_ name: String, _ value: String) {
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".data(using: .utf8)!)
        }
        field("entityType", entityType)
        field("entityId", entityId)
        if let label, !label.isEmpty { field("label", label) }
        body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"evidence.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        return (body, "multipart/form-data; boundary=\(boundary)")
    }
}

public actor APIClient {
    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
        self.decoder = JSONDecoder()
        self.decoder.dateDecodingStrategy = .custom { decoder in
            let rawValue = try decoder.singleValueContainer().decode(String.self)
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = fractional.date(from: rawValue) { return date }
            let standard = ISO8601DateFormatter()
            if let date = standard.date(from: rawValue) { return date }
            throw DecodingError.dataCorruptedError(
                in: try decoder.singleValueContainer(),
                debugDescription: "Invalid ISO-8601 date: \(rawValue)"
            )
        }
    }

    public func get<Response: Decodable & Sendable>(
        _ path: String,
        token: String? = nil,
        as type: Response.Type = Response.self
    ) async throws -> Response {
        try await request(path, method: "GET", token: token, body: nil, as: type)
    }

    public func post<Body: Encodable & Sendable, Response: Decodable & Sendable>(
        _ path: String,
        body: Body,
        token: String? = nil,
        idempotencyKey: String? = nil,
        as type: Response.Type = Response.self
    ) async throws -> Response {
        let encoded = try JSONEncoder().encode(body)
        return try await request(path, method: "POST", token: token, body: encoded, idempotencyKey: idempotencyKey, as: type)
    }

    public func postEncoded<Response: Decodable & Sendable>(
        _ path: String,
        body: Data,
        token: String,
        idempotencyKey: String,
        as type: Response.Type = Response.self
    ) async throws -> Response {
        try await request(
            path,
            method: "POST",
            token: token,
            body: body,
            idempotencyKey: idempotencyKey,
            as: type
        )
    }

    public func postNoContent<Body: Encodable & Sendable>(
        _ path: String,
        body: Body,
        token: String? = nil
    ) async throws {
        let encoded = try JSONEncoder().encode(body)
        let _: EmptyResponse = try await request(path, method: "POST", token: token, body: encoded, as: EmptyResponse.self)
    }

    public func patch<Body: Encodable & Sendable, Response: Decodable & Sendable>(
        _ path: String,
        body: Body,
        token: String? = nil,
        as type: Response.Type = Response.self
    ) async throws -> Response {
        let encoded = try JSONEncoder().encode(body)
        return try await request(path, method: "PATCH", token: token, body: encoded, as: type)
    }

    public func delete<Response: Decodable & Sendable>(
        _ path: String,
        token: String? = nil,
        as type: Response.Type = Response.self
    ) async throws -> Response {
        try await request(path, method: "DELETE", token: token, body: nil, as: type)
    }

    public func uploadEvidence(
        imageData: Data,
        entityType: String,
        entityId: String,
        label: String?,
        token: String
    ) async throws -> EvidenceAttachment {
        let multipart = EvidenceMultipart.build(
            imageData: imageData,
            entityType: entityType,
            entityId: entityId,
            label: label
        )

        let cleanPath = "evidence/images"
        guard let url = URL(string: cleanPath, relativeTo: baseURL.appendingPathComponent("/")) else {
            throw APIError.invalidResponse
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.httpBody = multipart.body
        request.setValue(multipart.contentType, forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let payload = try? JSONDecoder().decode(ErrorPayload.self, from: data)
            throw APIError.rejected(status: http.statusCode, message: payload?.message ?? "Ошибка сервера \(http.statusCode)")
        }
        do {
            return try decoder.decode(EvidenceAttachment.self, from: data)
        } catch {
            throw APIError.decoding(error.localizedDescription)
        }
    }

    private func request<Response: Decodable & Sendable>(
        _ path: String,
        method: String,
        token: String?,
        body: Data?,
        idempotencyKey: String? = nil,
        as type: Response.Type
    ) async throws -> Response {
        let cleanPath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        guard let url = URL(string: cleanPath, relativeTo: baseURL.appendingPathComponent("/")) else {
            throw APIError.invalidResponse
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let idempotencyKey { request.setValue(idempotencyKey, forHTTPHeaderField: "Idempotency-Key") }

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let payload = try? JSONDecoder().decode(ErrorPayload.self, from: data)
            throw APIError.rejected(status: http.statusCode, message: payload?.message ?? "Ошибка сервера \(http.statusCode)")
        }
        if Response.self == EmptyResponse.self, data.isEmpty {
            return EmptyResponse() as! Response
        }
        do {
            return try decoder.decode(type, from: data)
        } catch {
            throw APIError.decoding(error.localizedDescription)
        }
    }
}

private struct EmptyResponse: Decodable, Sendable {}

private struct ErrorPayload: Decodable {
    let message: String
}
