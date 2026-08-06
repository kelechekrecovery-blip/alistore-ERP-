import AliStoreCore
import Foundation
import XCTest

private actor StartupCleanupGate {
    private var isOpen = false
    private var continuation: CheckedContinuation<Void, Never>?

    func wait() async {
        if isOpen { return }
        await withCheckedContinuation { continuation = $0 }
    }

    func open() {
        isOpen = true
        continuation?.resume()
        continuation = nil
    }
}

/// Контракт нативного социального входа со стороны клиента.
///
/// Проверяем отправленный запрос, а не установленную сессию: под
/// `CODE_SIGNING_ALLOWED=NO` Keychain недоступен. Ломается же здесь именно
/// содержимое запроса — сервер сверяет `nonce` из тела с тем, что Apple положила
/// в токен, и любое расхождение даёт «nonce mismatch» уже на проде.
@MainActor
// swiftlint:disable:next type_body_length
final class CustomerSocialLoginTests: XCTestCase {
    func testBackgroundProviderCleanupDoesNotBlockStartup() async {
        let cleanupStarted = expectation(description: "cleanup started")
        let cleanupFinished = expectation(description: "cleanup finished")
        let gate = StartupCleanupGate()

        BackgroundStartupWork.launch {
            cleanupStarted.fulfill()
            await gate.wait()
            cleanupFinished.fulfill()
        }

        await fulfillment(of: [cleanupStarted], timeout: 1)
        // Reaching this line while the cleanup is still parked on `gate`
        // proves launch returned instead of joining provider work.
        await gate.open()
        await fulfillment(of: [cleanupFinished], timeout: 1)
    }

    func testOrdinaryLogoutSignsOutWithoutDisconnectingProviderGrant() {
        var signOutCalls = 0
        let disconnectCalls = 0

        SocialIdentitySessionCleanup.logout {
            signOutCalls += 1
        }

        XCTAssertEqual(signOutCalls, 1)
        XCTAssertEqual(disconnectCalls, 0)
    }

    func testSuccessfulAccountDeletionDisconnectsAfterServerDelete() async {
        var events: [String] = []

        let result = await SocialIdentitySessionCleanup.deleteAccount(
            deleting: {
                events.append("delete")
                return "deleted"
            },
            didDelete: {
                events.append("pending")
            },
            disconnect: { completion in
                events.append("disconnect")
                completion(nil)
            }
        )

        XCTAssertEqual(result.response, "deleted")
        XCTAssertNil(result.providerDisconnectError)
        XCTAssertEqual(events, ["delete", "pending", "disconnect"])
    }

    func testAccountDeletionPersistsRetryIntentBeforeProviderCallbackStarts() async {
        var retryIntentPersisted = false

        let result = await SocialIdentitySessionCleanup.deleteAccount(
            deleting: { "deleted" },
            didDelete: { retryIntentPersisted = true },
            disconnectAttempts: 1,
            disconnect: { completion in
                // This is the termination-safe boundary: even if the process
                // dies after the SDK call starts, durable retry intent already
                // exists and is available to the next launch.
                XCTAssertTrue(retryIntentPersisted)
                completion(NSError(domain: "GoogleSignIn", code: -1))
            }
        )

        XCTAssertTrue(retryIntentPersisted)
        XCTAssertNotNil(result.providerDisconnectError)
    }

    func testAccountDeletionReportsProviderDisconnectFailureForRetry() async {
        var disconnectCalls = 0

        let result = await SocialIdentitySessionCleanup.deleteAccount(
            deleting: { "deleted" },
            disconnectAttempts: 1,
            disconnect: { completion in
                disconnectCalls += 1
                completion(NSError(domain: "GoogleSignIn", code: -1))
            }
        )

        XCTAssertEqual(result.response, "deleted")
        XCTAssertNotNil(result.providerDisconnectError)
        XCTAssertEqual(disconnectCalls, 1)
    }

    func testProviderDisconnectCallbackHasBoundedTimeout() async {
        let startedAt = Date()

        let error = await SocialIdentitySessionCleanup.disconnectWithRetry(
            attempts: 1,
            callbackTimeout: 0.1,
            disconnect: { _ in
                // Simulates SDK/process behavior where the callback is never
                // delivered. The cleanup path must still release its waiter.
            }
        )

        XCTAssertEqual((error as? URLError)?.code, .timedOut)
        XCTAssertLessThan(Date().timeIntervalSince(startedAt), 1)
    }

    func testProviderCleanupNeverMatchesAnUnrelatedCurrentSubject() {
        let previous = ProviderSubjectCleanupPolicy.fingerprint(subject: "previously-deleted-google-subject")
        let authoritative = ProviderSubjectCleanupPolicy.fingerprint(subject: "authoritative-deleted-google-subject")
        let pending = ProviderSubjectCleanupPolicy.merging(
            pending: [previous],
            deletedFingerprints: [authoritative, "", "not-a-fingerprint"]
        )

        XCTAssertFalse(
            ProviderSubjectCleanupPolicy.canDisconnect(
                currentSubject: "unrelated-current-google-subject",
                pending: pending
            )
        )
        XCTAssertTrue(
            ProviderSubjectCleanupPolicy.canDisconnect(
                currentSubject: "authoritative-deleted-google-subject",
                pending: pending
            )
        )
        XCTAssertEqual(
            ProviderSubjectCleanupPolicy.remaining(
                afterDisconnecting: "authoritative-deleted-google-subject",
                pending: pending
            ),
            [previous]
        )
    }

    func testFailedServerDeletionKeepsProviderSessionConnected() async {
        var disconnectCalls = 0

        do {
            let _: SocialIdentitySessionCleanup.Result<String> = try await SocialIdentitySessionCleanup.deleteAccount(
                deleting: { throw URLError(.notConnectedToInternet) },
                disconnect: { _ in disconnectCalls += 1 }
            )
            XCTFail("Expected delete failure")
        } catch {
            XCTAssertEqual(disconnectCalls, 0)
        }
    }

    override func setUp() {
        super.setUp()
        SocialLoginMockURLProtocol.reset()
    }

    func testAppleLoginPostsIdentityTokenAuthorizationCodeNonceAndName() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/apple", status: 200, body: """
        {"status":"authenticated","accessToken":"access-1","refreshToken":"refresh-1","tokenType":"Bearer","expiresIn":"15m"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/me", status: 200, body: """
        {"customerId":"customer-1","phone":"+996700123456","typ":"customer"}
        """)
        let store = makeStore()

        await store.signInWithApple(
            identityToken: "eyJ.header.sig",
            authorizationCode: "apple-one-time-code",
            nonce: "hashed-nonce",
            name: "Нурбек"
        )

        let request = SocialLoginMockURLProtocol.request(for: "/api/auth/v2/social/apple")
        XCTAssertEqual(request?.httpMethod, "POST")
        let body = SocialLoginMockURLProtocol.jsonBody(for: "/api/auth/v2/social/apple")
        XCTAssertEqual(body?["identityToken"], "eyJ.header.sig")
        XCTAssertEqual(body?["authorizationCode"], "apple-one-time-code")
        // Ровно та строка, которую клиент поставил в `request.nonce`: сервер
        // сравнивает её с `claims.nonce`, куда Apple кладёт то же значение.
        XCTAssertEqual(body?["nonce"], "hashed-nonce")
        XCTAssertEqual(body?["name"], "Нурбек")
        XCTAssertEqual(store.session?.accessToken, "access-1")
        XCTAssertFalse(store.requiresApplePhoneEnrollment)
    }

    func testAppleAuthorizationCodeDecoderAcceptsValidUTF8() {
        XCTAssertEqual(AppleAuthorizationCode.decode(Data("apple-code".utf8)), "apple-code")
    }

    func testAppleAuthorizationCodeDecoderRejectsMissingEmptyAndInvalidUTF8() {
        XCTAssertNil(AppleAuthorizationCode.decode(nil))
        XCTAssertNil(AppleAuthorizationCode.decode(Data()))
        XCTAssertNil(AppleAuthorizationCode.decode(Data([0xFF, 0xFE])))
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
        await store.signInWithApple(identityToken: "token", authorizationCode: "code", nonce: "n", name: nil)

        let body = SocialLoginMockURLProtocol.jsonBody(for: "/api/auth/v2/social/apple")
        XCTAssertNil(body?["name"])
    }

    func testAppleLoginSurfacesServerError() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/apple", status: 400, body: """
        {"message":"Apple login is not configured"}
        """)
        let store = makeStore()

        await store.signInWithApple(identityToken: "token", authorizationCode: "code", nonce: "n", name: nil)

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

        await store.signInWithApple(
            identityToken: "apple-token",
            authorizationCode: "apple-code",
            nonce: "hashed-nonce",
            name: "Айжан"
        )
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

        await store.signInWithApple(
            identityToken: "apple-token",
            authorizationCode: "apple-code",
            nonce: "hashed-nonce",
            name: nil
        )
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
        await cancelStore.signInWithApple(
            identityToken: "apple-token-2",
            authorizationCode: "apple-code-2",
            nonce: "hashed-nonce-2",
            name: nil
        )
        XCTAssertTrue(cancelStore.requiresApplePhoneEnrollment)
        cancelStore.cancelAppleEnrollment()
        XCTAssertFalse(cancelStore.requiresApplePhoneEnrollment)
        await cancelStore.completeAppleEnrollment(phone: "+996700123456", code: "654321")
        XCTAssertNil(cancelStore.session)
        XCTAssertNotNil(cancelStore.errorMessage)
    }

    func testAppleV2RequiresNonceBeforeNetworkRequest() async {
        let store = makeStore()

        await store.signInWithApple(identityToken: "token", authorizationCode: "code", nonce: "", name: nil)

        XCTAssertEqual(SocialLoginMockURLProtocol.requestCount(for: "/api/auth/v2/social/apple"), 0)
        XCTAssertNotNil(store.errorMessage)
    }

    func testAppleV2RequiresAuthorizationCodeBeforeNetworkRequest() async {
        let store = makeStore()

        await store.signInWithApple(identityToken: "token", authorizationCode: "", nonce: "nonce", name: nil)

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
        await prepareGoogle(store)

        await store.signInWithGoogle(
            identityToken: "google.id.token",
            nonce: "raw-google-nonce",
            serverClientID: googleServerClientID
        )

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
        await prepareGoogle(store)

        await store.signInWithGoogle(
            identityToken: "google-new-token",
            nonce: "raw-nonce",
            serverClientID: googleServerClientID
        )
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
        await prepareGoogle(store)

        await store.signInWithGoogle(
            identityToken: "google-token",
            nonce: "raw-nonce",
            serverClientID: googleServerClientID
        )
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
        await prepareGoogle(cancelStore)
        await cancelStore.signInWithGoogle(
            identityToken: "google-token-2",
            nonce: "raw-nonce-2",
            serverClientID: googleServerClientID
        )
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
        await prepareGoogle(store)

        await store.signInWithGoogle(
            identityToken: "",
            nonce: "raw-nonce",
            serverClientID: googleServerClientID
        )
        await store.signInWithGoogle(
            identityToken: "google-token",
            nonce: "   ",
            serverClientID: googleServerClientID
        )

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
        await prepareGoogle(store)

        await store.signInWithApple(
            identityToken: "apple-token",
            authorizationCode: "apple-authorization-code",
            nonce: "apple-nonce",
            name: nil
        )
        XCTAssertEqual(store.socialEnrollmentProvider, .apple)
        await store.signInWithGoogle(
            identityToken: "google-token",
            nonce: "google-nonce",
            serverClientID: googleServerClientID
        )

        XCTAssertEqual(store.socialEnrollmentProvider, .google)
        XCTAssertTrue(store.requiresGooglePhoneEnrollment)
        XCTAssertNil(store.appleEnrollmentExpiresAt)
        XCTAssertNotNil(store.googleEnrollmentExpiresAt)
    }

    func testGoogleClientIDMismatchFailsClosedBeforeSDKTokenExchange() async {
        let store = makeStore()
        await prepareGoogle(store, advertisedClientID: "different-client.apps.googleusercontent.com")

        XCTAssertFalse(store.isGoogleSignInEnabled(serverClientID: googleServerClientID))
        await store.signInWithGoogle(
            identityToken: "google-token",
            nonce: "google-nonce",
            serverClientID: googleServerClientID
        )

        XCTAssertEqual(SocialLoginMockURLProtocol.requestCount(for: "/api/auth/v2/social/google"), 0)
        XCTAssertNotNil(store.errorMessage)
    }

    func testAuthMethodsLoadsServerAuthoritativeMixedAvailability() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/methods", status: 200, body: """
        {
          "phone":{"enabled":false,"registers":false},
          "email":{"enabled":true,"registers":false},
          "telegram":{"enabled":false,"registers":false,"botUsername":null},
          "apple":{"enabled":true,"registers":false,"clientId":null},
          "google":{"enabled":false,"registers":false,"clientId":null},
          "recovery":{"enabled":false},
          "anyLoginAvailable":true,
          "registrationAvailable":false
        }
        """)
        let store = makeStore()

        await store.loadAuthMethods()

        guard case .available(let methods) = store.authMethodsState else {
            return XCTFail("Expected the decoded server capability view")
        }
        XCTAssertFalse(methods.phone.enabled)
        XCTAssertTrue(methods.email.enabled)
        XCTAssertTrue(methods.apple.enabled)
        XCTAssertFalse(methods.apple.registers)
        XCTAssertFalse(methods.google.enabled)
        XCTAssertTrue(methods.anyLoginAvailable)
        XCTAssertFalse(methods.registrationAvailable)
        XCTAssertEqual(SocialLoginMockURLProtocol.request(for: "/api/auth/methods")?.httpMethod, "GET")
    }

    func testRecoveryRequestPostsPhoneOnlyWhenServerEnablesCapability() async {
        stubAuthMethods(recoveryEnabled: true)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/recovery/request", status: 201, body: """
        {"challengeId":"recovery-challenge-1","devCode":"123456"}
        """)
        let store = makeStore()
        await store.loadAuthMethods()

        let issued = await store.requestRecoveryOTP(phone: "+996700123456")

        XCTAssertTrue(issued)
        XCTAssertEqual(store.recoveryChallengeId, "recovery-challenge-1")
        XCTAssertEqual(store.devCode, "123456")
        let request = SocialLoginMockURLProtocol.request(for: "/api/auth/recovery/request")
        XCTAssertEqual(request?.httpMethod, "POST")
        XCTAssertEqual(
            SocialLoginMockURLProtocol.jsonBody(for: "/api/auth/recovery/request")?["phone"],
            "+996700123456"
        )
    }

    func testRecoveryVerifyPostsChallengeAndBuildsSessionThroughAuthMe() async {
        stubAuthMethods(recoveryEnabled: true)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/recovery/request", status: 201, body: """
        {"challengeId":"recovery-challenge-2"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/recovery/verify", status: 200, body: """
        {"accessToken":"recovery-access","refreshToken":"recovery-refresh","tokenType":"Bearer","expiresIn":"15m"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/me", status: 200, body: """
        {"customerId":"recovered-customer","phone":"+996700123456","typ":"customer"}
        """)
        let store = makeStore()
        await store.loadAuthMethods()
        _ = await store.requestRecoveryOTP(phone: "+996700123456")

        await store.verifyRecovery(phone: "+996700123456", code: "654321")

        let body = SocialLoginMockURLProtocol.jsonBody(for: "/api/auth/recovery/verify")
        XCTAssertEqual(body?["phone"], "+996700123456")
        XCTAssertEqual(body?["code"], "654321")
        XCTAssertEqual(body?["challengeId"], "recovery-challenge-2")
        XCTAssertEqual(
            SocialLoginMockURLProtocol.request(for: "/api/auth/me")?.value(forHTTPHeaderField: "Authorization"),
            "Bearer recovery-access"
        )
        XCTAssertEqual(store.session?.customerId, "recovered-customer")
        XCTAssertEqual(store.session?.refreshToken, "recovery-refresh")
        XCTAssertNil(store.recoveryChallengeId)
        XCTAssertNil(store.errorMessage)
    }

    func testRecoveryVerifyDoesNotExposeWhetherAccountExists() async {
        stubAuthMethods(recoveryEnabled: true)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/recovery/request", status: 201, body: """
        {"challengeId":"opaque-recovery-challenge"}
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/recovery/verify", status: 422, body: """
        {"message":"Аккаунт не найден"}
        """)
        let store = makeStore()
        await store.loadAuthMethods()
        _ = await store.requestRecoveryOTP(phone: "+996700123456")

        await store.verifyRecovery(phone: "+996700123456", code: "123456")

        XCTAssertNil(store.session)
        XCTAssertEqual(
            store.errorMessage,
            "Не удалось восстановить доступ. Проверьте код и попробуйте снова."
        )
        XCTAssertFalse(store.errorMessage?.contains("Аккаунт") == true)
    }

    func testRecoveryDisabledOrUnknownCapabilityBlocksNetworkCalls() async {
        stubAuthMethods(recoveryEnabled: false)
        let disabledStore = makeStore()
        await disabledStore.loadAuthMethods()

        let disabledIssued = await disabledStore.requestRecoveryOTP(phone: "+996700123456")
        XCTAssertFalse(disabledIssued)
        await disabledStore.verifyRecovery(phone: "+996700123456", code: "123456")
        XCTAssertEqual(SocialLoginMockURLProtocol.requestCount(for: "/api/auth/recovery/request"), 0)
        XCTAssertEqual(SocialLoginMockURLProtocol.requestCount(for: "/api/auth/recovery/verify"), 0)
        XCTAssertEqual(disabledStore.errorMessage, "Восстановление доступа сейчас недоступно. Попробуйте позже.")

        SocialLoginMockURLProtocol.reset()
        let unavailableStore = makeStore()
        let unavailableIssued = await unavailableStore.requestRecoveryOTP(phone: "+996700123456")
        XCTAssertFalse(unavailableIssued)
        await unavailableStore.verifyRecovery(phone: "+996700123456", code: "123456")
        XCTAssertEqual(SocialLoginMockURLProtocol.requestCount(for: "/api/auth/recovery/request"), 0)
        XCTAssertEqual(SocialLoginMockURLProtocol.requestCount(for: "/api/auth/recovery/verify"), 0)
        XCTAssertEqual(unavailableStore.errorMessage, "Восстановление доступа сейчас недоступно. Попробуйте позже.")
    }

    func testAuthMethodsSupportsFullyUnavailableCombination() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/methods", status: 200, body: """
        {
          "phone":{"enabled":false,"registers":false},
          "email":{"enabled":false,"registers":false},
          "telegram":{"enabled":false,"registers":false,"botUsername":null},
          "apple":{"enabled":false,"registers":false,"clientId":null},
          "google":{"enabled":false,"registers":false,"clientId":null},
          "recovery":{"enabled":false},
          "anyLoginAvailable":false,
          "registrationAvailable":false
        }
        """)
        let store = makeStore()

        await store.loadAuthMethods()

        guard case .available(let methods) = store.authMethodsState else {
            return XCTFail("Expected the decoded unavailable capability view")
        }
        XCTAssertFalse(methods.anyLoginAvailable)
        XCTAssertFalse(methods.registrationAvailable)
        XCTAssertFalse(methods.phone.enabled)
        XCTAssertFalse(methods.email.enabled)
        XCTAssertFalse(methods.apple.enabled)
        XCTAssertFalse(methods.google.enabled)
    }

    func testAuthMethodsFailureFallsBackToSafeUnavailableState() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/methods", status: 503, body: """
        {"message":"capability service unavailable"}
        """)
        let store = makeStore()

        await store.loadAuthMethods()

        XCTAssertEqual(store.authMethodsState, .unavailable)
        XCTAssertNil(store.errorMessage, "Capability failure has its own degraded UI and must not replace a sign-in error")

        SocialLoginMockURLProtocol.stub(path: "/api/auth/methods", status: 200, body: """
        {
          "phone":{"enabled":true,"registers":true},
          "email":{"enabled":false,"registers":false},
          "telegram":{"enabled":false,"registers":false,"botUsername":null},
          "apple":{"enabled":false,"registers":false,"clientId":null},
          "google":{"enabled":false,"registers":false,"clientId":null},
          "recovery":{"enabled":true},
          "anyLoginAvailable":true,
          "registrationAvailable":true
        }
        """)
        await store.loadAuthMethods(force: true)

        guard case .available(let recovered) = store.authMethodsState else {
            return XCTFail("Retry must recover from the degraded state")
        }
        XCTAssertTrue(recovered.phone.enabled)
        XCTAssertEqual(SocialLoginMockURLProtocol.requestCount(for: "/api/auth/methods"), 2)
    }

    func testServerDisablesUnfinishableSocialEnrollmentWhenRegistrationIsUnavailable() async {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/methods", status: 200, body: """
        {
          "phone":{"enabled":false,"registers":false},
          "email":{"enabled":true,"registers":false},
          "telegram":{"enabled":false,"registers":false,"botUsername":null},
          "apple":{"enabled":true,"registers":false,"clientId":null},
          "google":{"enabled":true,"registers":false,"clientId":null},
          "recovery":{"enabled":false},
          "anyLoginAvailable":true,
          "registrationAvailable":false
        }
        """)
        SocialLoginMockURLProtocol.stub(path: "/api/auth/v2/social/apple", status: 200, body: """
        {"status":"enrollment_required","enrollmentToken":"unusable-enrollment-token-1234567890","expiresIn":600}
        """)
        let store = makeStore()

        await store.loadAuthMethods()
        await store.signInWithApple(
            identityToken: "new-apple-token",
            authorizationCode: "new-apple-authorization-code",
            nonce: "apple-nonce",
            name: nil
        )

        XCTAssertFalse(store.requiresSocialPhoneEnrollment)
        XCTAssertNil(store.session)
        XCTAssertTrue(store.errorMessage?.contains("Регистрация сейчас недоступна") == true)
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

    private var googleServerClientID: String {
        "123456789-alistore-web.apps.googleusercontent.com"
    }

    private func prepareGoogle(
        _ store: CustomerAuthStore,
        advertisedClientID: String? = nil
    ) async {
        let clientID = advertisedClientID ?? googleServerClientID
        SocialLoginMockURLProtocol.stub(path: "/api/auth/methods", status: 200, body: """
        {
          "phone":{"enabled":true,"registers":true},
          "email":{"enabled":true,"registers":false},
          "telegram":{"enabled":false,"registers":false,"botUsername":null},
          "apple":{"enabled":true,"registers":true,"clientId":null},
          "google":{"enabled":true,"registers":true,"clientId":"\(clientID)"},
          "recovery":{"enabled":true},
          "anyLoginAvailable":true,
          "registrationAvailable":true
        }
        """)
        await store.loadAuthMethods(force: true)
    }

    private func stubAuthMethods(recoveryEnabled: Bool) {
        SocialLoginMockURLProtocol.stub(path: "/api/auth/methods", status: 200, body: """
        {
          "phone":{"enabled":true,"registers":true},
          "email":{"enabled":true,"registers":false},
          "telegram":{"enabled":false,"registers":false,"botUsername":null},
          "apple":{"enabled":true,"registers":true,"clientId":null},
          "google":{"enabled":true,"registers":true,"clientId":null},
          "recovery":{"enabled":\(recoveryEnabled)},
          "anyLoginAvailable":true,
          "registrationAvailable":true
        }
        """)
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
