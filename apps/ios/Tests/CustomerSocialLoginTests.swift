import AliStoreCore
import Foundation
import XCTest

/// Контракт нативного социального входа со стороны клиента.
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
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/apple", status: 200, body: """
        {"status":"authenticated","accessToken":"access-1","refreshToken":"refresh-1","tokenType":"Bearer","expiresIn":"15m"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/me", status: 200, body: """
        {"customerId":"customer-1","phone":"+996700123456","typ":"customer"}
        """)
        let store = makeStore()

        await store.signInWithApple(identityToken: "eyJ.header.sig", nonce: "hashed-nonce", name: "Нурбек")

        let request = SocialLoginMockURLProtocol.request(for: "/api/auth/v2/social/apple")
        XCTAssertEqual(request?.httpMethod, "POST")
        let body = SocialLoginMockURLProtocol.jsonBody(for: "/api/auth/v2/social/apple")
        XCTAssertEqual(body?["identityToken"], "eyJ.header.sig")
        // Ровно та строка, которую клиент поставил в `request.nonce`: сервер
        // сравнивает её с `claims.nonce`, куда Apple кладёт то же значение.
        XCTAssertEqual(body?["nonce"], "hashed-nonce")
        XCTAssertEqual(body?["name"], "Нурбек")
        XCTAssertEqual(store.session?.accessToken, "access-1")
        XCTAssertFalse(store.requiresApplePhoneEnrollment)
    }

    func testAppleLoginOmitsEmptyOptionalFields() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/apple", status: 200, body: """
        {"status":"authenticated","accessToken":"a","refreshToken":"r","tokenType":"Bearer","expiresIn":"15m"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/me", status: 200, body: """
        {"customerId":"customer-1","phone":"+996700123456","typ":"customer"}
        """)
        let store = makeStore()

        // Apple отдаёт имя только при первом входе. Слать пустую строку нельзя:
        // сервер склеит из неё displayName и запишет мусор в CustomerIdentity.
        await store.signInWithApple(identityToken: "token", nonce: "n", name: nil)

        let body = SocialLoginMockURLProtocol.jsonBody(for: "/api/auth/v2/social/apple")
        XCTAssertNil(body?["name"])
    }

    func testAppleLoginSurfacesServerError() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/apple", status: 400, body: """
        {"message":"Apple login is not configured"}
        """)
        let store = makeStore()

        await store.signInWithApple(identityToken: "token", nonce: "n", name: nil)

        XCTAssertNotNil(store.errorMessage)
        XCTAssertNil(store.session)
    }

    func testUnknownAppleIdentityCompletesPhoneOtpEnrollment() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/apple", status: 200, body: """
        {"status":"enrollment_required","enrollmentToken":"opaque-enrollment-token-1234567890","expiresIn":600}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/otp/request", status: 201, body: """
        {"challengeId":"phone-challenge-1","devCode":"123456"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/enrollment/complete", status: 200, body: """
        {"status":"authenticated","accessToken":"access-new","refreshToken":"refresh-new","tokenType":"Bearer","expiresIn":"15m"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/me", status: 200, body: """
        {"customerId":"customer-new","phone":"+996700123456","typ":"customer"}
        """)
        let store = makeStore()

        await store.signInWithApple(identityToken: "apple-token", nonce: "hashed-nonce", name: "Айжан")
        XCTAssertTrue(store.requiresApplePhoneEnrollment)
        XCTAssertNil(store.session)

        let issued = await store.requestOTP(phone: "+996700123456")
        XCTAssertTrue(issued)
        await store.completeAppleEnrollment(phone: "+996700123456", code: "123456")

        let body = SocialLoginMockURLProtocol.jsonBody(for: "/api/auth/v2/social/enrollment/complete")
        XCTAssertEqual(body?["enrollmentToken"], "opaque-enrollment-token-1234567890")
        XCTAssertEqual(body?["phone"], "+996700123456")
        XCTAssertEqual(body?["code"], "123456")
        XCTAssertEqual(body?["challengeId"], "phone-challenge-1")
        XCTAssertEqual(store.session?.customerId, "customer-new")
        XCTAssertFalse(store.requiresApplePhoneEnrollment)
    }

    func testEnrollmentRetryResendUsesLatestChallengeAndCancelClearsState() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/apple", status: 200, body: """
        {"status":"enrollment_required","enrollmentToken":"opaque-enrollment-token-1234567890","expiresIn":600}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/otp/request", status: 201, body: """
        {"challengeId":"phone-challenge-1"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/enrollment/complete", status: 422, body: """
        {"message":"Неверный код"}
        """)
        let store = makeStore()

        await store.signInWithApple(identityToken: "apple-token", nonce: "hashed-nonce", name: nil)
        _ = await store.requestOTP(phone: "+996700123456")
        await store.completeAppleEnrollment(phone: "+996700123456", code: "000000")
        XCTAssertTrue(store.requiresApplePhoneEnrollment)
        XCTAssertNotNil(store.errorMessage)

        SocialLoginMockURLProtocol.stub(path: "/api/auth/otp/request", status: 201, body: """
        {"challengeId":"phone-challenge-2","devCode":"654321"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/enrollment/complete", status: 200, body: """
        {"status":"authenticated","accessToken":"access-new","refreshToken":"refresh-new","tokenType":"Bearer","expiresIn":"15m"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/me", status: 200, body: """
        {"customerId":"customer-new","phone":"+996700123456","typ":"customer"}
        """)
        _ = await store.requestOTP(phone: "+996700123456")
        await store.completeAppleEnrollment(phone: "+996700123456", code: "654321")

        XCTAssertEqual(
            SocialLoginMockURLProtocol.jsonBody(for: "/api/auth/v2/social/enrollment/complete")?["challengeId"],
            "phone-challenge-2"
        )
        XCTAssertEqual(SocialLoginMockURLProtocol.requestCount(for: "/api/auth/otp/request"), 2)
        XCTAssertFalse(store.requiresApplePhoneEnrollment)

        let cancelStore = makeStore()
        await cancelStore.signInWithApple(identityToken: "apple-token-2", nonce: "hashed-nonce-2", name: nil)
        XCTAssertTrue(cancelStore.requiresApplePhoneEnrollment)
        cancelStore.cancelAppleEnrollment()
        XCTAssertFalse(cancelStore.requiresApplePhoneEnrollment)
        await cancelStore.completeAppleEnrollment(phone: "+996700123456", code: "654321")
        XCTAssertNil(cancelStore.session)
        XCTAssertNotNil(cancelStore.errorMessage)
    }

    func testAppleV2RequiresNonceBeforeNetworkRequest() async {
        let store = makeStore()

        await store.signInWithApple(identityToken: "token", nonce: "", name: nil)

        XCTAssertEqual(SocialLoginMockURLProtocol.requestCount(for: "/api/auth/v2/social/apple"), 0)
        XCTAssertNotNil(store.errorMessage)
    }

    func testGoogleLoginPostsIdentityTokenAndRawNonceAndAuthenticates() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/google", status: 200, body: """
        {"status":"authenticated","accessToken":"google-access","refreshToken":"google-refresh","tokenType":"Bearer","expiresIn":"15m"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/me", status: 200, body: """
        {"customerId":"google-customer","phone":"+996700123456","typ":"customer"}
        """)
        let store = makeStore()

        await store.signInWithGoogle(identityToken: "google.id.token", nonce: "raw-google-nonce")

        let request = SocialLoginMockURLProtocol.request(for: "/api/auth/v2/social/google")
        XCTAssertEqual(request?.httpMethod, "POST")
        let body = SocialLoginMockURLProtocol.jsonBody(for: "/api/auth/v2/social/google")
        XCTAssertEqual(body?["identityToken"], "google.id.token")
        XCTAssertEqual(body?["nonce"], "raw-google-nonce")
        XCTAssertEqual(store.session?.customerId, "google-customer")
        XCTAssertFalse(store.requiresSocialPhoneEnrollment)
    }

    func testUnknownGoogleIdentityCompletesCommonPhoneOtpEnrollment() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/google", status: 200, body: """
        {"status":"enrollment_required","enrollmentToken":"google-enrollment-token-1234567890","expiresIn":600}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/otp/request", status: 201, body: """
        {"challengeId":"google-phone-challenge","devCode":"123456"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/enrollment/complete", status: 200, body: """
        {"status":"authenticated","accessToken":"google-new-access","refreshToken":"google-new-refresh","tokenType":"Bearer","expiresIn":"15m"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/me", status: 200, body: """
        {"customerId":"google-new-customer","phone":"+996700123456","typ":"customer"}
        """)
        let store = makeStore()

        await store.signInWithGoogle(identityToken: "google-new-token", nonce: "raw-nonce")
        XCTAssertEqual(store.socialEnrollmentProvider, .google)
        XCTAssertTrue(store.requiresSocialPhoneEnrollment)
        XCTAssertTrue(store.requiresGooglePhoneEnrollment)
        XCTAssertFalse(store.requiresApplePhoneEnrollment)

        let issued = await store.requestOTP(phone: "+996700123456")
        XCTAssertTrue(issued)
        await store.completeSocialEnrollment(phone: "+996700123456", code: "123456")

        let body = SocialLoginMockURLProtocol.jsonBody(for: "/api/auth/v2/social/enrollment/complete")
        XCTAssertEqual(body?["enrollmentToken"], "google-enrollment-token-1234567890")
        XCTAssertEqual(body?["challengeId"], "google-phone-challenge")
        XCTAssertEqual(store.session?.customerId, "google-new-customer")
        XCTAssertNil(store.socialEnrollmentProvider)
    }

    func testGoogleEnrollmentRetryKeepsMemoryTokenAndCancelClearsIt() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/google", status: 200, body: """
        {"status":"enrollment_required","enrollmentToken":"google-enrollment-token-1234567890","expiresIn":600}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/enrollment/complete", status: 422, body: """
        {"message":"Неверный код"}
        """)
        let store = makeStore()

        await store.signInWithGoogle(identityToken: "google-token", nonce: "raw-nonce")
        await store.completeSocialEnrollment(phone: "+996700123456", code: "000000")
        XCTAssertEqual(store.socialEnrollmentProvider, .google)
        XCTAssertNotNil(store.errorMessage)

        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/enrollment/complete", status: 200, body: """
        {"status":"authenticated","accessToken":"retried-access","refreshToken":"retried-refresh","tokenType":"Bearer","expiresIn":"15m"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/me", status: 200, body: """
        {"customerId":"retry-customer","phone":"+996700123456","typ":"customer"}
        """)
        await store.completeSocialEnrollment(phone: "+996700123456", code: "123456")
        XCTAssertEqual(store.session?.customerId, "retry-customer")

        let cancelStore = makeStore()
        await cancelStore.signInWithGoogle(identityToken: "google-token-2", nonce: "raw-nonce-2")
        cancelStore.cancelSocialEnrollment()
        XCTAssertNil(cancelStore.socialEnrollmentProvider)
        await cancelStore.completeSocialEnrollment(phone: "+996700123456", code: "123456")
        XCTAssertEqual(
            SocialLoginMockURLProtocol.requestCount(for: "/api/auth/v2/social/enrollment/complete"),
            2
        )
        XCTAssertNotNil(cancelStore.errorMessage)
    }

    func testGoogleEmptyTokenOrNonceDoesNotUseNetwork() async {
        let store = makeStore()

        await store.signInWithGoogle(identityToken: "", nonce: "raw-nonce")
        await store.signInWithGoogle(identityToken: "google-token", nonce: "   ")

        XCTAssertEqual(SocialLoginMockURLProtocol.requestCount(for: "/api/auth/v2/social/google"), 0)
        XCTAssertNotNil(store.errorMessage)
    }

    func testStartingAnotherProviderReplacesEnrollmentState() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/apple", status: 200, body: """
        {"status":"enrollment_required","enrollmentToken":"apple-enrollment-token-1234567890","expiresIn":600}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/google", status: 200, body: """
        {"status":"enrollment_required","enrollmentToken":"google-enrollment-token-1234567890","expiresIn":300}
        """)
        let store = makeStore()

        await store.signInWithApple(identityToken: "apple-token", nonce: "apple-nonce", name: nil)
        XCTAssertEqual(store.socialEnrollmentProvider, .apple)
        await store.signInWithGoogle(identityToken: "google-token", nonce: "google-nonce")

        XCTAssertEqual(store.socialEnrollmentProvider, .google)
        XCTAssertTrue(store.requiresGooglePhoneEnrollment)
        XCTAssertNil(store.appleEnrollmentExpiresAt)
        XCTAssertNotNil(store.googleEnrollmentExpiresAt)
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
    nonisolated(unsafe) static var requestCounts: [String: Int] = [:]

    static func reset() {
        responses = [:]
        requests = [:]
        bodies = [:]
        requestCounts = [:]
    }

    static func stub(path: String, status: Int, body: String) {
        responses[path] = (status, Data(body.utf8))
    }

    static func request(for path: String) -> URLRequest? { requests[path] }
    static func requestCount(for path: String) -> Int { requestCounts[path, default: 0] }

    static func jsonBody(for path: String) -> [String: String]? {
        guard let data = bodies[path] else { return nil }
        return try? JSONDecoder().decode([String: String].self, from: data)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        Self.requests[path] = request
        Self.requestCounts[path, default: 0] += 1
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
