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
            body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
        }
        field("entityType", entityType)
        field("entityId", entityId)
        if let label, !label.isEmpty { field("label", label) }
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"evidence.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8))
        body.append(imageData)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        return (body, "multipart/form-data; boundary=\(boundary)")
    }
}

/// Общий на приложение обработчик 401.
///
/// Экземпляры `APIClient` в этом проекте создаются на месте — прямо в свойствах
/// экранов и внутри методов (`APIClient(baseURL: environment.apiBaseURL)` встречается
/// в POS, Staff и Courier по отдельности). Общего клиента нет, поэтому хук,
/// поставленный только на клиент хранилища сессии, покрыл бы одни лишь
/// вызовы авторизации, а падали бы бизнес-запросы. Реестр один на процесс —
/// как и сессия, которую он обновляет.
public actor UnauthorizedRegistry {
    public static let shared = UnauthorizedRegistry()
    private var handler: APIClient.UnauthorizedHandler?

    public func set(_ handler: APIClient.UnauthorizedHandler?) { self.handler = handler }
    func current() -> APIClient.UnauthorizedHandler? { handler }
}

public actor APIClient {
    /// Обновляет протухший доступ и возвращает новый токен, либо `nil`, если
    /// сессию восстановить нельзя.
    public typealias UnauthorizedHandler = @Sendable (_ failedAccessToken: String) async -> String?

    private let baseURL: URL
    private let session: URLSession
    private let decoder: JSONDecoder
    private var onUnauthorized: UnauthorizedHandler?

    /// Единственная точка, где живёт реакция на 401.
    ///
    /// Access-токен живёт 15 минут (`ACCESS_TTL` в apps/api/src/auth/auth.service.ts),
    /// а обновлял его только холодный старт. Через четверть часа падало всё
    /// разом — оформление заказа, кабинет, смена кассира — и выходом был
    /// перезапуск приложения. Хук ставит владелец сессии; здесь мы лишь
    /// один раз повторяем запрос с новым токеном.
    public func setUnauthorizedHandler(_ handler: UnauthorizedHandler?) {
        onUnauthorized = handler
    }

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

    /// Authenticated GET returning the raw body — for document downloads (data export)
    /// where the bytes must reach the user unchanged instead of a decoded model.
    public func getData(_ path: String, token: String? = nil) async throws -> Data {
        let cleanPath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        guard let url = URL(string: cleanPath, relativeTo: baseURL.appendingPathComponent("/")) else {
            throw APIError.invalidResponse
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let payload = try? JSONDecoder().decode(ErrorPayload.self, from: data)
            throw APIError.rejected(status: http.statusCode, message: payload?.message ?? "Ошибка сервера \(http.statusCode)")
        }
        return data
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
        token: String,
        idempotencyKey: String? = nil
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
        request.setValue(idempotencyKey ?? UUID().uuidString, forHTTPHeaderField: "Idempotency-Key")
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
        try await request(path, method: method, token: token, body: body, idempotencyKey: idempotencyKey, as: type, isRetry: false)
    }

    private func request<Response: Decodable & Sendable>(
        _ path: String,
        method: String,
        token: String?,
        body: Data?,
        idempotencyKey: String?,
        as type: Response.Type,
        isRetry: Bool
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
            // Ровно одна попытка обновления: второй 401 подряд означает, что
            // refresh-токен тоже мёртв, и сессию надо гасить, а не крутить цикл.
            // Идемпотентный ключ переносим в повтор — иначе сервер увидит
            // повтор как новую операцию.
            if http.statusCode == 401, !isRetry, let failedToken = token {
                var handler = onUnauthorized
                if handler == nil { handler = await UnauthorizedRegistry.shared.current() }
                if let handler, let renewed = await handler(failedToken) {
                    return try await self.request(
                        path,
                        method: method,
                        token: renewed,
                        body: body,
                        idempotencyKey: idempotencyKey,
                        as: type,
                        isRetry: true
                    )
                }
            }
            let payload = try? JSONDecoder().decode(ErrorPayload.self, from: data)
            throw APIError.rejected(status: http.statusCode, message: payload?.message ?? "Ошибка сервера \(http.statusCode)")
        }
        if Response.self == EmptyResponse.self, data.isEmpty {
            guard let emptyResponse = EmptyResponse() as? Response else {
                throw APIError.decoding("Empty response type mismatch")
            }
            return emptyResponse
        }
        do {
            return try decoder.decode(type, from: data)
        } catch {
            throw APIError.decoding(error.localizedDescription)
        }
    }
}

private struct EmptyResponse: Decodable, Sendable {}

/// Тело ошибки NestJS. `message` приходит двух форм: строкой от брошенного
/// `HttpException` и массивом строк от глобального `ValidationPipe`
/// (`apps/api/src/main.ts:38`) — по строке на каждое правило class-validator.
/// Декодер знал только строковую форму, поэтому массив ронял разбор целиком,
/// и любая ошибка валидации схлопывалась в бесполезное «Ошибка сервера 400»:
/// пользователь не узнавал, какое поле сервер не принял.
private struct ErrorPayload: Decodable {
    let message: String

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let single = try? container.decode(String.self, forKey: .message), !single.isEmpty {
            message = single
            return
        }
        let lines = try container.decode([String].self, forKey: .message).filter { !$0.isEmpty }
        // Пустой список причин хуже кода статуса: показали бы пустую плашку.
        // Роняем разбор, чтобы вызывающий взял запасной текст со статусом.
        guard !lines.isEmpty else {
            throw DecodingError.dataCorruptedError(
                forKey: .message,
                in: container,
                debugDescription: "Empty validation message list"
            )
        }
        message = lines.joined(separator: "\n")
    }

    private enum CodingKeys: String, CodingKey {
        case message
    }
}
