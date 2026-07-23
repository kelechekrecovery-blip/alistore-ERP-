import AliStoreCore
import Foundation
import XCTest

/// Контракт входа через Apple со стороны клиента.
///
/// Проверяем отправленный запрос, а не установленную сессию: под
/// `CODE_SIGNING_ALLOWED=NO` Keychain недоступен. Ломается же здесь именно
/// содержимое запроса — сервер сверяет `nonce` из тела с тем, что Apple положила
/// в токен, и любое расхождение даёт «nonce mismatch» уже на проде.
@MainActor
final class CustomerSocialLoginTests: XCTestCase {
    override func setUp() {
        super.setUp()
        SocialLoginMockURLProtocol.reset()
    }

    func testAppleLoginPostsIdentityTokenNonceAndName() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/social/apple", status: 200, body: """
        {"accessToken":"access-1","refreshToken":"refresh-1","tokenType":"Bearer","expiresIn":"15m"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/me", status: 200, body: """
        {"customerId":"customer-1","phone":"+996700123456","typ":"customer"}
        """)
        let store = makeStore()

        await store.signInWithApple(identityToken: "eyJ.header.sig", nonce: "hashed-nonce", name: "Нурбек")

        let request = SocialLoginMockURLProtocol.request(for: "/api/auth/social/apple")
        XCTAssertEqual(request?.httpMethod, "POST")
        let body = SocialLoginMockURLProtocol.jsonBody(for: "/api/auth/social/apple")
        XCTAssertEqual(body?["identityToken"], "eyJ.header.sig")
        // Ровно та строка, которую клиент поставил в `request.nonce`: сервер
        // сравнивает её с `claims.nonce`, куда Apple кладёт то же значение.
        XCTAssertEqual(body?["nonce"], "hashed-nonce")
        XCTAssertEqual(body?["name"], "Нурбек")
    }

    func testAppleLoginOmitsEmptyOptionalFields() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/social/apple", status: 200, body: """
        {"accessToken":"a","refreshToken":"r","tokenType":"Bearer","expiresIn":"15m"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/me", status: 200, body: """
        {"customerId":"customer-1","phone":"+996700123456","typ":"customer"}
        """)
        let store = makeStore()

        // Apple отдаёт имя только при первом входе. Слать пустую строку нельзя:
        // сервер склеит из неё displayName и запишет мусор в CustomerIdentity.
        await store.signInWithApple(identityToken: "token", nonce: "n", name: nil)

        let body = SocialLoginMockURLProtocol.jsonBody(for: "/api/auth/social/apple")
        XCTAssertNil(body?["name"])
    }

    func testAppleLoginSurfacesServerError() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/social/apple", status: 400, body: """
        {"message":"Apple login is not configured"}
        """)
        let store = makeStore()

        await store.signInWithApple(identityToken: "token", nonce: "n", name: nil)

        XCTAssertNotNil(store.errorMessage)
        XCTAssertNil(store.session)
    }

    private func makeStore() -> CustomerAuthStore {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SocialLoginMockURLProtocol.self]
        return CustomerAuthStore(
            environment: AppEnvironment(apiBaseURL: URL(string: "https://api.example.test/api")!),
            keychainService: "kg.alistore.client.tests.social",
            restoresStoredSession: false,
            session: URLSession(configuration: configuration)
        )
    }
}

private final class SocialLoginMockURLProtocol: URLProtocol, @unchecked Sendable {
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
