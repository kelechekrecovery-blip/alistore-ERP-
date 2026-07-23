import AliStoreCore
import Foundation
import XCTest

/// Контракт входа по email со стороны клиента.
///
/// Проверяем именно отправленные запросы, а не установленную сессию: под
/// `CODE_SIGNING_ALLOWED=NO` Keychain недоступен, поэтому сохранение сессии в
/// тестах всё равно не отражает поведение на устройстве. Ломается же на практике
/// другое — путь, метод и тело запроса.
@MainActor
final class CustomerEmailLoginTests: XCTestCase {
    override func setUp() {
        super.setUp()
        EmailLoginMockURLProtocol.reset()
    }

    func testRequestEmailOTPPostsAddressAndSurfacesDevCode() async {
        EmailLoginMockURLProtocol.stub(path: "/api/auth/email/request", status: 201, body: """
        {"challengeId":"challenge-1","devCode":"123456"}
        """)
        let store = makeStore()

        let issued = await store.requestEmailOTP(email: "  Owner@Example.COM ")

        XCTAssertTrue(issued)
        let request = EmailLoginMockURLProtocol.request(for: "/api/auth/email/request")
        XCTAssertEqual(request?.httpMethod, "POST")
        // Адрес нормализует сервер, но клиент не должен слать пробелы по краям:
        // иначе пользователь, скопировавший адрес с пробелом, получает 400.
        XCTAssertEqual(EmailLoginMockURLProtocol.jsonBody(for: "/api/auth/email/request")?["email"], "owner@example.com")
        XCTAssertEqual(store.devCode, "123456")
        XCTAssertNil(store.errorMessage)
    }

    func testRequestEmailOTPKeepsErrorFromServer() async {
        EmailLoginMockURLProtocol.stub(path: "/api/auth/email/request", status: 400, body: """
        {"message":"Некорректный email"}
        """)
        let store = makeStore()

        let issued = await store.requestEmailOTP(email: "не-почта")

        XCTAssertFalse(issued)
        XCTAssertNotNil(store.errorMessage)
    }

    func testVerifyEmailPostsAddressAndCode() async {
        EmailLoginMockURLProtocol.stub(path: "/api/auth/email/verify", status: 200, body: """
        {"accessToken":"access-1","refreshToken":"refresh-1","tokenType":"Bearer","expiresIn":"15m"}
        """)
        EmailLoginMockURLProtocol.stub(path: "/api/auth/me", status: 200, body: """
        {"customerId":"customer-1","phone":"+996700123456","typ":"customer"}
        """)
        let store = makeStore()

        await store.verifyEmail(email: "owner@example.com", code: "123456")

        let request = EmailLoginMockURLProtocol.request(for: "/api/auth/email/verify")
        XCTAssertEqual(request?.httpMethod, "POST")
        let body = EmailLoginMockURLProtocol.jsonBody(for: "/api/auth/email/verify")
        XCTAssertEqual(body?["email"], "owner@example.com")
        XCTAssertEqual(body?["code"], "123456")
    }

    func testAttachRequestCarriesSessionToken() async {
        EmailLoginMockURLProtocol.stub(path: "/api/auth/email/attach/request", status: 201, body: """
        {"challengeId":"challenge-2","devCode":"654321"}
        """)
        let store = makeStore()

        _ = await store.requestEmailAttach(email: "owner@example.com", token: "access-1")

        let request = EmailLoginMockURLProtocol.request(for: "/api/auth/email/attach/request")
        XCTAssertEqual(request?.httpMethod, "POST")
        // Привязка — операция над своим аккаунтом, без токена сервер обязан ответить 401,
        // поэтому отсутствие заголовка здесь это дефект клиента, а не сервера.
        XCTAssertEqual(request?.value(forHTTPHeaderField: "Authorization"), "Bearer access-1")
        XCTAssertEqual(EmailLoginMockURLProtocol.jsonBody(for: "/api/auth/email/attach/request")?["email"], "owner@example.com")
    }

    func testAttachConfirmCarriesSessionTokenAndCode() async {
        EmailLoginMockURLProtocol.stub(path: "/api/auth/email/attach/confirm", status: 200, body: "{}")
        let store = makeStore()

        let attached = await store.confirmEmailAttach(email: "owner@example.com", code: "654321", token: "access-1")

        XCTAssertTrue(attached)
        let request = EmailLoginMockURLProtocol.request(for: "/api/auth/email/attach/confirm")
        XCTAssertEqual(request?.value(forHTTPHeaderField: "Authorization"), "Bearer access-1")
        let body = EmailLoginMockURLProtocol.jsonBody(for: "/api/auth/email/attach/confirm")
        XCTAssertEqual(body?["email"], "owner@example.com")
        XCTAssertEqual(body?["code"], "654321")
    }

    func testAttachConfirmReportsTakenAddress() async {
        EmailLoginMockURLProtocol.stub(path: "/api/auth/email/attach/confirm", status: 400, body: """
        {"message":"Этот адрес уже привязан к другому аккаунту"}
        """)
        let store = makeStore()

        let attached = await store.confirmEmailAttach(email: "owner@example.com", code: "654321", token: "access-1")

        XCTAssertFalse(attached)
        XCTAssertNotNil(store.errorMessage)
    }

    private func makeStore() -> CustomerAuthStore {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [EmailLoginMockURLProtocol.self]
        return CustomerAuthStore(
            environment: AppEnvironment(apiBaseURL: URL(string: "https://api.example.test/api")!),
            keychainService: "kg.alistore.client.tests.email",
            restoresStoredSession: false,
            session: URLSession(configuration: configuration)
        )
    }
}

/// Отвечает по пути запроса: `verify` делает два вызова подряд (verify → auth/me),
/// и один общий ответ на оба сделал бы тест бессмысленным.
private final class EmailLoginMockURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var responses: [String: (status: Int, body: Data)] = [:]
    nonisolated(unsafe) static var requests: [String: URLRequest] = [:]
    nonisolated(unsafe) static var bodies: [String: Data] = [:]

    static func reset() {
        responses = [:]
        requests = [:]
        bodies = [:]
    }

    static func stub(path: String, status: Int, body: String) {
        responses[path] = (status, Data(body.utf8))
    }

    static func request(for path: String) -> URLRequest? { requests[path] }

    static func jsonBody(for path: String) -> [String: String]? {
        guard let data = bodies[path] else { return nil }
        return try? JSONDecoder().decode([String: String].self, from: data)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        Self.requests[path] = request
        // httpBody у перехваченного запроса пуст — тело доступно только через поток.
        if let stream = request.httpBodyStream {
            stream.open()
            var payload = Data()
            let size = 4096
            let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: size)
            while stream.hasBytesAvailable {
                let read = stream.read(buffer, maxLength: size)
                if read <= 0 { break }
                payload.append(buffer, count: read)
            }
            buffer.deallocate()
            stream.close()
            Self.bodies[path] = payload
        } else if let body = request.httpBody {
            Self.bodies[path] = body
        }

        let stub = Self.responses[path] ?? (status: 404, body: Data("{}".utf8))
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: stub.status,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: stub.body)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
