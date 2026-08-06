// Wire-contract declarations mirror server payloads and keep related fields together.
// swiftlint:disable file_length line_length
import Foundation

public struct CatalogResponse: Decodable, Sendable {
    public let items: [Product]
    public let total: Int
}

public struct CatalogProductDetail: Decodable, Sendable {
    public let product: Product
    public let variants: [Product]
    public let related: [Product]

    public init(product: Product, variants: [Product], related: [Product]) {
        self.product = product
        self.variants = variants
        self.related = related
    }
}

/// Free-form product attributes from the catalog (`attrs` JSON). Only a string
/// `description` is shown on the PDP; anything else is ignored.
public struct ProductAttributes: Decodable, Sendable {
    public let description: String?

    public init(description: String? = nil) {
        self.description = description
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.description = try? container.decode(String.self, forKey: .description)
    }

    private enum CodingKeys: String, CodingKey {
        case description
    }
}

/// Три состояния наличия из каталога (`availabilityKind` в apps/api/src/catalog/catalog.dto.ts).
public enum ProductAvailabilityKind: String, Sendable, Equatable {
    case inStock = "in_stock"
    case toOrder = "to_order"
    case unavailable
}

/// Разобранное наличие товара — зеркало `catalogAvailability` из apps/web/lib/to-order.ts.
public struct ProductAvailability: Sendable, Equatable {
    public let kind: ProductAvailabilityKind
    /// Можно ли класть в корзину. Решает сервер (`orderable`), а не остаток на складе.
    public let buyable: Bool
    /// Срок и дата — только для «под заказ»: у складского товара их нет, и показывать там нечего.
    public let leadTimeDays: Int?
    public let estimatedDeliveryDate: Date?

    public var isInStock: Bool { kind == .inStock }
    public var isToOrder: Bool { kind == .toOrder }

    public init(kind: ProductAvailabilityKind, buyable: Bool, leadTimeDays: Int?, estimatedDeliveryDate: Date?) {
        self.kind = kind
        self.buyable = buyable
        self.leadTimeDays = leadTimeDays
        self.estimatedDeliveryDate = estimatedDeliveryDate
    }
}

/// Ступень рассрочки: один срок, наименьший платёж на нём и список партнёров,
/// у которых её можно оформить.
///
/// Считает сервер по договорным условиям владельца (`installment.*` в
/// настройках API). Клиент только показывает: придумывать финансовое условие
/// на витрине нельзя — это обещание, за которое отвечает магазин.
public struct InstallmentStep: Decodable, Sendable, Identifiable, Equatable {
    public let months: Int
    public let monthlySom: Int
    public let providers: [String]

    public var id: Int { months }

    public init(months: Int, monthlySom: Int, providers: [String]) {
        self.months = months
        self.monthlySom = monthlySom
        self.providers = providers
    }
}

/// Лучшее предложение рассрочки — то, что показывает карточка в списке.
public struct InstallmentOffer: Decodable, Sendable, Equatable {
    public let id: String
    public let label: String
    public let months: Int
    public let monthlySom: Int
    public let totalSom: Int

    public init(id: String, label: String, months: Int, monthlySom: Int, totalSom: Int) {
        self.id = id
        self.label = label
        self.months = months
        self.monthlySom = monthlySom
        self.totalSom = totalSom
    }
}

public struct Product: Decodable, Identifiable, Sendable {
    public let id: String
    public let sku: String
    public let name: String
    public let price: Int
    public let category: String
    public let availableUnits: Int
    public let attrs: ProductAttributes?
    public let supplyMode: String?
    public let orderable: Bool?
    public let availabilityKind: String?
    public let leadTimeDays: Int?
    public let estimatedDeliveryDate: Date?
    /// Лучшая рассрочка для этой цены — «от N сом/мес» на карточке.
    public let installment: InstallmentOffer?
    /// Вилка сроков для карточки товара. Пусто — рассрочка недоступна.
    public let installmentSteps: [InstallmentStep]
    /// Сколько бонусов начислит покупка. Считает сервер той же функцией, что и
    /// реальное начисление в заказе.
    public let bonusPoints: Int?

    public init(id: String, sku: String, name: String, price: Int, category: String, availableUnits: Int, attrs: ProductAttributes? = nil, supplyMode: String? = nil, orderable: Bool? = nil, availabilityKind: String? = nil, leadTimeDays: Int? = nil, estimatedDeliveryDate: Date? = nil, installment: InstallmentOffer? = nil, installmentSteps: [InstallmentStep] = [], bonusPoints: Int? = nil) {
        self.id = id
        self.sku = sku
        self.name = name
        self.price = price
        self.category = category
        self.availableUnits = availableUnits
        self.attrs = attrs
        self.supplyMode = supplyMode
        self.orderable = orderable
        self.availabilityKind = availabilityKind
        self.leadTimeDays = leadTimeDays
        self.estimatedDeliveryDate = estimatedDeliveryDate
        self.installment = installment
        self.installmentSteps = installmentSteps
        self.bonusPoints = bonusPoints
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        sku = try container.decode(String.self, forKey: .sku)
        name = try container.decode(String.self, forKey: .name)
        price = try container.decode(Int.self, forKey: .price)
        category = try container.decode(String.self, forKey: .category)
        availableUnits = try container.decode(Int.self, forKey: .availableUnits)
        // attrs is arbitrary JSON on the API; non-object payloads decode as nil.
        attrs = try? container.decodeIfPresent(ProductAttributes.self, forKey: .attrs)
        supplyMode = try? container.decodeIfPresent(String.self, forKey: .supplyMode)
        orderable = try? container.decodeIfPresent(Bool.self, forKey: .orderable)
        availabilityKind = try? container.decodeIfPresent(String.self, forKey: .availabilityKind)
        leadTimeDays = try? container.decodeIfPresent(Int.self, forKey: .leadTimeDays)
        estimatedDeliveryDate = try? container.decodeIfPresent(Date.self, forKey: .estimatedDeliveryDate)
        installment = try? container.decodeIfPresent(InstallmentOffer.self, forKey: .installment)
        installmentSteps = (try? container.decodeIfPresent([InstallmentStep].self, forKey: .installmentSteps)) ?? []
        bonusPoints = try? container.decodeIfPresent(Int.self, forKey: .bonusPoints)
    }

    /// Наличие в разобранном виде. Поля `availabilityKind`/`orderable`/`leadTimeDays`
    /// декодировались, но нигде не читались: экраны смотрели только на
    /// `availableUnits > 0`, и товар «под заказ» (остатка нет, но магазин его
    /// привезёт) читался как «нет в наличии» — покупатель терял товар, который
    /// ему готовы продать. Фолбэк на `supplyMode` держит ответы каталога, где
    /// поля ещё нет, но недоступный товар покупаемым не делает никогда.
    public var availability: ProductAvailability {
        let fallback: ProductAvailabilityKind
        if availableUnits > 0 {
            fallback = .inStock
        } else if supplyMode == "to_order" {
            fallback = .toOrder
        } else {
            fallback = .unavailable
        }
        let kind = ProductAvailabilityKind(rawValue: availabilityKind ?? "") ?? fallback
        // Без серверного `orderable` заказным товар не считаем: разрешение на
        // покупку под заказ даёт только сервер (действующий оффер, маржа, флаг).
        let isBuyable = (orderable ?? (kind == .inStock)) && kind != .unavailable
        // Ноль и отрицательный срок — это «сервер не знает», а не «привезём сегодня».
        let leadTime: Int? = (leadTimeDays ?? 0) > 0 ? leadTimeDays : nil
        return ProductAvailability(
            kind: kind,
            buyable: isBuyable,
            leadTimeDays: kind == .toOrder ? leadTime : nil,
            estimatedDeliveryDate: kind == .toOrder ? estimatedDeliveryDate : nil
        )
    }

    private enum CodingKeys: String, CodingKey {
        case id, sku, name, price, category, availableUnits, attrs
        case supplyMode, orderable, availabilityKind, leadTimeDays, estimatedDeliveryDate
        case installment, installmentSteps, bonusPoints
    }
}

public struct StorePoint: Decodable, Identifiable, Sendable {
    public let id: String
    public let code: String
    public let name: String
    public let address: String
    public let inventoryLocation: String
    public let hours: String
    public let pickupInstructions: String?
    public let sortOrder: Int
}

public struct DeliverySlot: Decodable, Identifiable, Sendable {
    public let id: String
    public let zoneId: String
    public let startsAt: Date
    public let endsAt: Date
    public let capacity: Int
    public let reserved: Int
    public let remaining: Int
    public let available: Bool
}

public struct DeliveryZone: Decodable, Identifiable, Sendable {
    public let id: String
    public let code: String
    public let name: String
    public let fee: Int
    public let etaMinMinutes: Int?
    public let etaMaxMinutes: Int?
    public let slots: [DeliverySlot]
}

public struct CheckoutOptions: Decodable, Sendable {
    public let pickupPoints: [StorePoint]
    public let deliveryZones: [DeliveryZone]
}

public struct StaffSession: Codable, Sendable {
    public let accessToken: String
    /// Сервер отдаёт его нативному клиенту (вырезает только для веб-сессий —
    /// `isStaffWebSessionRequest` в staff-auth.controller.ts), но поля здесь не
    /// было, и `Decodable` его молча выбрасывал. Access живёт 15 минут, а
    /// обновить его было нечем: кассир вводил пароль каждые четверть часа.
    /// Optional — старые сохранённые сессии и веб-ответы приходят без него.
    public let refreshToken: String?
    public let staffId: String
    public let username: String
    public let role: String
    /// Authoritative inventory location from StaffUser/JWT refresh. A missing
    /// point disables point-bound operations; native clients never invent one.
    public let point: String?
    public let totpEnabled: Bool
    public let capabilities: [String]?

    public init(
        accessToken: String,
        refreshToken: String? = nil,
        staffId: String,
        username: String,
        role: String,
        point: String? = nil,
        totpEnabled: Bool = false,
        capabilities: [String]? = nil
    ) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.staffId = staffId
        self.username = username
        self.role = role
        self.point = point
        self.totpEnabled = totpEnabled
        self.capabilities = capabilities
    }
}

public struct StaffPrincipal: Decodable, Sendable {
    public let id: String
    public let username: String
    public let role: String
    public let active: Bool
    public let totpEnabled: Bool
    public let typ: String
    public let point: String?
    public let capabilities: [String]?
}

public struct StaffLogin: Encodable, Sendable {
    public let username: String
    public let password: String
    /// Optional RFC 6238 code. Omitted for staff accounts without 2FA.
    public let totp: String?

    public init(username: String, password: String, totp: String? = nil) {
        self.username = username
        self.password = password
        self.totp = totp
    }
}

public struct ShiftPayment: Decodable, Identifiable, Sendable {
    public let id: String
    public let amount: Int
    public let method: String
    public let status: String
}

public struct CashShift: Decodable, Identifiable, Sendable {
    public let id: String
    public let staffId: String
    public let point: String
    public let openCash: Int
    public let closeCash: Int?
    public let diff: Int?
    public let openedAt: Date
    public let closedAt: Date?
    public let payments: [ShiftPayment]?
    public let expected: Int?

    public var expectedCash: Int {
        expected ?? openCash + (payments ?? [])
            .filter { $0.method == "cash" && $0.status == "received" }
            .reduce(0) { $0 + $1.amount }
    }

    public init(
        id: String,
        staffId: String,
        point: String,
        openCash: Int,
        closeCash: Int? = nil,
        diff: Int? = nil,
        openedAt: Date,
        closedAt: Date? = nil,
        payments: [ShiftPayment]? = nil,
        expected: Int? = nil
    ) {
        self.id = id
        self.staffId = staffId
        self.point = point
        self.openCash = openCash
        self.closeCash = closeCash
        self.diff = diff
        self.openedAt = openedAt
        self.closedAt = closedAt
        self.payments = payments
        self.expected = expected
    }
}

public struct OpenShiftRequest: Encodable, Sendable {
    public let staffId: String
    public let point: String
    public let openCash: Int

    public init(staffId: String, point: String, openCash: Int) {
        self.staffId = staffId
        self.point = point
        self.openCash = openCash
    }
}

public struct CloseShiftRequest: Encodable, Sendable {
    public let closeCash: Int
    public let reason: String?

    public init(closeCash: Int, reason: String?) {
        self.closeCash = closeCash
        self.reason = reason
    }
}

public struct StaffHrWeek: Decodable, Sendable {
    public let weekStart: Date
    public let weekEnd: Date
    public let point: String?
    public let schedules: [StaffHrSchedule]
}

public struct StaffHrSchedule: Decodable, Identifiable, Sendable {
    public let id: String
    public let staffId: String
    public let point: String
    public let shiftDate: Date
    public let startsAt: Date
    public let endsAt: Date
    public let cancelledAt: Date?
    public let attendance: StaffHrAttendance?
}

public struct StaffHrAttendance: Decodable, Identifiable, Sendable {
    public let id: String
    public let scheduleId: String
    public let staffId: String
    public let point: String
    public let checkedInAt: Date
    public let checkedOutAt: Date?
}

public struct StaffAttendanceRequest: Codable, Sendable {
    public let scheduleId: String

    public init(scheduleId: String) { self.scheduleId = scheduleId }
}

public struct OTPRequest: Encodable, Sendable {
    public let phone: String

    public init(phone: String) { self.phone = phone }
}

public struct OTPVerification: Encodable, Sendable {
    public let phone: String
    public let code: String
    public let challengeId: String?

    public init(phone: String, code: String, challengeId: String? = nil) {
        self.phone = phone
        self.code = code
        self.challengeId = challengeId
    }
}

/// Ответ `POST auth/otp/request`.
///
/// Форма задана сервером в `apps/api/src/auth/auth.service.ts:69,86`:
/// `{ challengeId }`, а при включённом `AUTH_OTP_DEV_ECHO` вне production —
/// `{ challengeId, devCode }`. Поля `expiresIn` сервер не присылает НИКОГДА;
/// пока оно было объявлено обязательным, декодирование падало на каждом запросе
/// кода и вход в приложение был невозможен.
///
/// `challengeId` объявлен обязательным намеренно: он приходит в обеих ветках,
/// и если сервер перестанет его слать, это должно сломать тест, а не тихо
/// разъехаться. Клиент возвращает его в `verify`, чтобы код нельзя было
/// подтвердить вне выдавшего его challenge.
public struct OTPChallenge: Decodable, Sendable {
    public let challengeId: String
    public let devCode: String?
}

/// Server-authoritative availability of one customer authentication method.
///
/// `enabled` means an existing customer can sign in now; `registers` means an
/// unknown identity can also create/link a customer account. Keeping these
/// separate prevents Apple/Google from promising registration while the phone
/// confirmation channel required by social enrollment is unavailable.
public struct CustomerAuthMethodAvailability: Decodable, Sendable, Equatable {
    public let enabled: Bool
    public let registers: Bool

    public init(enabled: Bool, registers: Bool) {
        self.enabled = enabled
        self.registers = registers
    }
}

public struct CustomerSocialAuthMethodAvailability: Decodable, Sendable, Equatable {
    public let enabled: Bool
    public let registers: Bool
    public let clientId: String?

    public init(enabled: Bool, registers: Bool, clientId: String? = nil) {
        self.enabled = enabled
        self.registers = registers
        self.clientId = clientId
    }
}

/// Response from `GET /auth/methods`. Native iOS deliberately decodes the full
/// shared contract even though Telegram and web client IDs are not rendered:
/// contract drift should fail loudly in tests instead of making the login UI
/// independently guess which production services are live.
public struct CustomerAuthMethods: Decodable, Sendable, Equatable {
    public struct Telegram: Decodable, Sendable, Equatable {
        public let enabled: Bool
        public let registers: Bool
        public let botUsername: String?
    }

    public struct Recovery: Decodable, Sendable, Equatable {
        public let enabled: Bool
    }

    public let phone: CustomerAuthMethodAvailability
    public let email: CustomerAuthMethodAvailability
    public let telegram: Telegram
    public let apple: CustomerSocialAuthMethodAvailability
    public let google: CustomerSocialAuthMethodAvailability
    public let recovery: Recovery
    public let anyLoginAvailable: Bool
    public let registrationAvailable: Bool
}

public enum CustomerAuthMethodsState: Sendable, Equatable {
    case loading
    case available(CustomerAuthMethods)
    case unavailable
}

/// Decodes Apple's opaque, one-time authorization code without ever logging or
/// persisting it. Keeping the `Data?` boundary here makes the fail-closed paths
/// from `ASAuthorizationAppleIDCredential` directly testable without fabricating
/// an AuthenticationServices credential in unit tests.
public enum AppleAuthorizationCode {
    public static func decode(_ data: Data?) -> String? {
        guard
            let data,
            !data.isEmpty,
            let value = String(data: data, encoding: .utf8),
            !value.isEmpty
        else { return nil }
        return value
    }
}

/// Тело `POST auth/v2/social/apple`.
///
/// `nonce` — ровно та строка, которую клиент положил в `ASAuthorizationAppleIDRequest.nonce`:
/// Apple кладёт её же в claim токена, а сервер сравнивает их напрямую
/// (`social-login.ts` → «Apple identity token nonce mismatch»).
/// `authorizationCode` сервер обменивает на refresh token, чтобы отозвать
/// доступ Apple при удалении аккаунта. Код одноразовый, поэтому нативный клиент
/// обязан передать его вместе с identity token в первом же запросе.
/// `name` Apple отдаёт только при первом входе, поэтому он необязателен —
/// пустую строку слать нельзя, сервер склеит из неё displayName.
public struct AppleSocialLogin: Encodable, Sendable {
    public let identityToken: String
    public let authorizationCode: String
    public let nonce: String
    public let name: String?

    public init(identityToken: String, authorizationCode: String, nonce: String, name: String?) {
        self.identityToken = identityToken
        self.authorizationCode = authorizationCode
        self.nonce = nonce
        self.name = name
    }
}

/// Тело `POST auth/v2/social/google`.
///
/// Google Identity Services возвращает ID token отдельно от одноразового nonce.
/// Сервер проверяет подпись/`aud` токена и требует точного совпадения nonce с
/// claim токена, поэтому клиент передаёт исходную строку без хеширования или
/// другого преобразования.
public struct GoogleSocialLogin: Encodable, Sendable {
    public let identityToken: String
    public let nonce: String

    public init(identityToken: String, nonce: String) {
        self.identityToken = identityToken
        self.nonce = nonce
    }
}

/// Провайдер, чью неподтверждённую identity пользователь сейчас связывает с
/// обязательным телефонным аккаунтом AliStore.
public enum CustomerSocialProvider: String, Sendable, Equatable {
    case apple
    case google
}

public enum CustomerSocialAuthResult: Decodable, Sendable {
    case authenticated(CustomerAuthTokens)
    case enrollmentRequired(enrollmentToken: String, expiresIn: Int)

    private enum CodingKeys: String, CodingKey {
        case status
        case accessToken
        case refreshToken
        case tokenType
        case expiresIn
        case enrollmentToken
    }

    private enum Status: String, Decodable {
        case authenticated
        case enrollmentRequired = "enrollment_required"
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(Status.self, forKey: .status) {
        case .authenticated:
            self = .authenticated(CustomerAuthTokens(
                accessToken: try container.decode(String.self, forKey: .accessToken),
                refreshToken: try container.decode(String.self, forKey: .refreshToken),
                tokenType: try container.decode(String.self, forKey: .tokenType),
                expiresIn: try container.decode(String.self, forKey: .expiresIn)
            ))
        case .enrollmentRequired:
            self = .enrollmentRequired(
                enrollmentToken: try container.decode(String.self, forKey: .enrollmentToken),
                expiresIn: try container.decode(Int.self, forKey: .expiresIn)
            )
        }
    }
}

public struct CompleteSocialEnrollmentRequest: Encodable, Sendable {
    public let enrollmentToken: String
    public let phone: String
    public let code: String
    public let challengeId: String?

    public init(enrollmentToken: String, phone: String, code: String, challengeId: String? = nil) {
        self.enrollmentToken = enrollmentToken
        self.phone = phone
        self.code = code
        self.challengeId = challengeId
    }
}

/// Тело `POST auth/email/request` и `auth/email/attach/request`.
public struct EmailOTPRequest: Encodable, Sendable {
    public let email: String

    public init(email: String) { self.email = email }
}

/// Тело `POST auth/email/verify` и `auth/email/attach/confirm`.
public struct EmailOTPVerification: Encodable, Sendable {
    public let email: String
    public let code: String
    public let challengeId: String?

    public init(email: String, code: String, challengeId: String? = nil) {
        self.email = email
        self.code = code
        self.challengeId = challengeId
    }
}

public struct CustomerAuthTokens: Codable, Sendable {
    public let accessToken: String
    public let refreshToken: String
    public let tokenType: String
    public let expiresIn: String

    public init(accessToken: String, refreshToken: String, tokenType: String, expiresIn: String) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.tokenType = tokenType
        self.expiresIn = expiresIn
    }
}

public struct CustomerPrincipal: Decodable, Sendable {
    public let customerId: String
    public let phone: String?
    public let typ: String
}

public struct CustomerNotification: Decodable, Identifiable, Sendable {
    public let id: String
    public let template: String
    public let title: String
    public let detail: String
    public let symbol: String
    public let route: String
    public let referenceId: String?
    public let createdAt: Date
    public let readAt: Date?

    public init(id: String, template: String, title: String, detail: String, symbol: String, route: String, referenceId: String?, createdAt: Date, readAt: Date?) {
        self.id = id
        self.template = template
        self.title = title
        self.detail = detail
        self.symbol = symbol
        self.route = route
        self.referenceId = referenceId
        self.createdAt = createdAt
        self.readAt = readAt
    }
}

public struct CustomerSession: Codable, Sendable {
    public let accessToken: String
    public let refreshToken: String
    public let customerId: String
    public let phone: String

    public init(accessToken: String, refreshToken: String, customerId: String, phone: String) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.customerId = customerId
        self.phone = phone
    }
}

public struct CustomerLoyalty: Decodable, Sendable {
    public let balance: Int
    public let conversion: Int
    public let level: String
    public let nextLevelSpend: Int
    public let coupons: [CustomerCoupon]
    public let history: [LoyaltyHistoryEntry]

    public init(balance: Int, conversion: Int, level: String, nextLevelSpend: Int, coupons: [CustomerCoupon], history: [LoyaltyHistoryEntry]) {
        self.balance = balance
        self.conversion = conversion
        self.level = level
        self.nextLevelSpend = nextLevelSpend
        self.coupons = coupons
        self.history = history
    }
}

public struct CustomerCoupon: Decodable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let code: String
    public let valueLabel: String
    public let expiresAt: Date?
    public let active: Bool

    public init(id: String, title: String, code: String, valueLabel: String, expiresAt: Date?, active: Bool) {
        self.id = id
        self.title = title
        self.code = code
        self.valueLabel = valueLabel
        self.expiresAt = expiresAt
        self.active = active
    }
}

public struct LoyaltyHistoryEntry: Decodable, Identifiable, Sendable {
    public let id: String
    public let kind: String
    public let label: String
    public let amount: Int
    public let expiresAt: Date?
    public let createdAt: Date

    public init(id: String, kind: String, label: String, amount: Int, expiresAt: Date?, createdAt: Date) {
        self.id = id
        self.kind = kind
        self.label = label
        self.amount = amount
        self.expiresAt = expiresAt
        self.createdAt = createdAt
    }
}

public struct CustomerAddress: Decodable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let text: String
    public let comment: String?
    public let isPrimary: Bool
    public let createdAt: Date
    public let updatedAt: Date

    public init(id: String, title: String, text: String, comment: String?, isPrimary: Bool, createdAt: Date, updatedAt: Date) {
        self.id = id
        self.title = title
        self.text = text
        self.comment = comment
        self.isPrimary = isPrimary
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}

public struct CreateCustomerAddressRequest: Encodable, Sendable {
    public let title: String
    public let text: String
    public let comment: String?
    public let isPrimary: Bool

    public init(title: String, text: String, comment: String?, isPrimary: Bool) {
        self.title = title
        self.text = text
        self.comment = comment
        self.isPrimary = isPrimary
    }
}

public struct UpdateCustomerAddressRequest: Encodable, Sendable {
    public let title: String
    public let text: String
    public let comment: String?
    public let isPrimary: Bool

    public init(title: String, text: String, comment: String?, isPrimary: Bool) {
        self.title = title
        self.text = text
        self.comment = comment
        self.isPrimary = isPrimary
    }
}

public struct CustomerSettings: Decodable, Sendable {
    public let id: String
    public let phone: String
    /// Привязанный адрес входа. Необязателен: у большинства аккаунтов его нет,
    /// а старые сборки сервера поле не присылают вовсе.
    public let email: String?
    public let name: String
    public let consent: Bool
    public let push: Bool
    public let whatsapp: Bool
    public let service: Bool
    public let promos: Bool

    public init(id: String, phone: String, email: String? = nil, name: String, consent: Bool, push: Bool, whatsapp: Bool, service: Bool, promos: Bool) {
        self.id = id
        self.phone = phone
        self.email = email
        self.name = name
        self.consent = consent
        self.push = push
        self.whatsapp = whatsapp
        self.service = service
        self.promos = promos
    }
}

public struct UpdateCustomerSettingsRequest: Encodable, Sendable {
    public let name: String
    public let consent: Bool
    public let push: Bool
    public let whatsapp: Bool
    public let service: Bool
    public let promos: Bool

    public init(name: String, consent: Bool, push: Bool, whatsapp: Bool, service: Bool, promos: Bool) {
        self.name = name
        self.consent = consent
        self.push = push
        self.whatsapp = whatsapp
        self.service = service
        self.promos = promos
    }
}

public struct CustomerReturn: Decodable, Identifiable, Sendable {
    public let id: String
    public let orderId: String
    public let reason: String
    public let status: String
    public let refundId: String?
    public let refundAmount: Int
    public let isFullOrder: Bool
    public let createdAt: Date
    public let items: [CustomerReturnItem]
    public let order: CustomerReturnOrder?

    public init(id: String, orderId: String, reason: String, status: String, refundId: String?, refundAmount: Int, isFullOrder: Bool, createdAt: Date, items: [CustomerReturnItem], order: CustomerReturnOrder?) {
        self.id = id
        self.orderId = orderId
        self.reason = reason
        self.status = status
        self.refundId = refundId
        self.refundAmount = refundAmount
        self.isFullOrder = isFullOrder
        self.createdAt = createdAt
        self.items = items
        self.order = order
    }
}

public struct CustomerReturnItem: Decodable, Identifiable, Sendable {
    public let id: String
    public let orderItemId: String
    public let qty: Int
    public let refundAmount: Int

    public init(id: String, orderItemId: String, qty: Int, refundAmount: Int) {
        self.id = id
        self.orderItemId = orderItemId
        self.qty = qty
        self.refundAmount = refundAmount
    }
}

public struct CustomerReturnOrder: Decodable, Sendable {
    public let id: String
    public let total: Int
    public let createdAt: Date
    public let items: [CustomerReturnOrderItem]

    public init(id: String, total: Int, createdAt: Date, items: [CustomerReturnOrderItem]) {
        self.id = id
        self.total = total
        self.createdAt = createdAt
        self.items = items
    }
}

public struct CustomerReturnOrderItem: Decodable, Identifiable, Sendable {
    public let id: String
    public let sku: String
    public let qty: Int
    public let price: Int

    public init(id: String, sku: String, qty: Int, price: Int) {
        self.id = id
        self.sku = sku
        self.qty = qty
        self.price = price
    }
}

public struct CreateCustomerReturnRequest: Encodable, Sendable {
    public let orderId: String
    public let reason: String

    public init(orderId: String, reason: String) {
        self.orderId = orderId
        self.reason = reason
    }
}

public struct CustomerTradeIn: Decodable, Identifiable, Sendable {
    public let id: String
    public let customerId: String
    public let model: String
    public let imei: String?
    public let grade: String
    public let price: Int
    public let contractId: String?
    public let sellerPassportMasked: String
}

public struct CreateCustomerTradeInRequest: Encodable, Sendable {
    public let model: String
    public let imei: String?
    public let grade: String
    public let price: Int
    public let sellerPassport: String

    public init(model: String, imei: String?, grade: String, price: Int, sellerPassport: String) {
        self.model = model
        self.imei = imei
        self.grade = grade
        self.price = price
        self.sellerPassport = sellerPassport
    }
}

public struct RefreshRequest: Encodable, Sendable {
    public let refreshToken: String

    public init(refreshToken: String) { self.refreshToken = refreshToken }
}

public struct CustomerOrderItem: Decodable, Sendable {
    public let id: String?
    public let sku: String
    public let qty: Int
    public let price: Int
    public let imei: String?
    public let supplyModeSnapshot: String?
    public let supplyLeadDaysSnapshot: Int?
    public let promisedDate: Date?
    public let fulfillmentStatus: String?
    public let readyAt: Date?
    public let handedOverAt: Date?

    public init(sku: String, qty: Int, price: Int, imei: String?, id: String? = nil, supplyModeSnapshot: String? = nil, supplyLeadDaysSnapshot: Int? = nil, promisedDate: Date? = nil, fulfillmentStatus: String? = nil, readyAt: Date? = nil, handedOverAt: Date? = nil) {
        self.id = id
        self.sku = sku
        self.qty = qty
        self.price = price
        self.imei = imei
        self.supplyModeSnapshot = supplyModeSnapshot
        self.supplyLeadDaysSnapshot = supplyLeadDaysSnapshot
        self.promisedDate = promisedDate
        self.fulfillmentStatus = fulfillmentStatus
        self.readyAt = readyAt
        self.handedOverAt = handedOverAt
    }
}

public struct OrderReceivable: Decodable, Identifiable, Sendable {
    public let id: String
    public let orderItemId: String?
    public let kind: String
    public let amount: Int
    public let settledAmount: Int
    public let status: String
    public let dueAt: Date?

    public init(id: String, orderItemId: String?, kind: String, amount: Int, settledAmount: Int, status: String, dueAt: Date?) {
        self.id = id
        self.orderItemId = orderItemId
        self.kind = kind
        self.amount = amount
        self.settledAmount = settledAmount
        self.status = status
        self.dueAt = dueAt
    }
}

public struct OrderCancellationPreview: Decodable, Sendable {
    public let orderId: String
    public let canCancel: Bool
    public let blockedReason: String?
    public let policy: String
    public let purchaseOrderSent: Bool
    public let depositPaid: Int
    public let estimatedRefundAmount: Int
    public let supplierExpenseDeduction: Int
    public let ownerReviewRequired: Bool
    public let note: String
    public let requestEnabled: Bool?
    public let automaticRefundEnabled: Bool?
}

public struct OrderCancellation: Decodable, Identifiable, Sendable {
    public let id: String
    public let orderId: String
    public let status: String
    public let policySnapshot: String
    public let purchaseOrderSentSnapshot: Bool
    public let depositPaidSnapshot: Int
    public let requestedRefundAmount: Int
    public let approvedRefundAmount: Int?
    public let customerReason: String
    public let ownerReason: String?
    public let refundId: String?
    public let createdAt: Date
    public let resolvedAt: Date?
    public let completedAt: Date?
}

public struct CreateOrderCancellationRequest: Encodable, Sendable {
    public let reason: String
    public init(reason: String) { self.reason = reason }
}

public struct OwnerCancellationResolutionRequest: Encodable, Sendable {
    public let action: String
    public let refundAmount: Int?
    public let supplierExpenseAmount: Int?
    public let faultParty: String?
    public let ownerReason: String
    public let evidenceIds: [String]?
    public let totpToken: String
}

public struct SupplyOperationFlags: Decodable, Sendable {
    public let checkoutEnabled: Bool
    public let cancellationEnabled: Bool
    public let autoRefundEnabled: Bool
    public let ownerResolutionEnabled: Bool
}

public struct SupplyOperationCapabilities: Decodable, Sendable {
    public let financialQueuesVisible: Bool
    public let ownerResolutionAvailable: Bool
}

public struct SupplyOperationRow: Decodable, Identifiable, Sendable {
    public let id: String
    public let queue: String
    public let orderId: String
    public let purchaseOrderId: String?
    public let purchaseOrderNumber: String?
    public let status: String
    public let amount: Int?
    public let expectedAt: Date?
    public let createdAt: Date
    public let updatedAt: Date
    public let sku: String?
    public let quantity: Int?
    public let detailHref: String
}

public struct SupplyOperationsResponse: Decodable, Sendable {
    public let generatedAt: Date
    public let flags: SupplyOperationFlags
    public let capabilities: SupplyOperationCapabilities
    public let counts: [String: Int]
    public let queues: [String: [SupplyOperationRow]]
}

public struct SupplyQuarantineProposalRequest: Encodable, Sendable {
    public let reason: String
    public let evidence: [String: String]
    public let imeis: [String]?
}

public struct SupplyQuarantineResolutionRequest: Encodable, Sendable {
    public let disposition: String
    public let reason: String
    public let evidence: [String: String]
}

public struct SupplyQuarantineResolution: Decodable, Identifiable, Sendable {
    public let id: String
    public let orderLineSupplyId: String
    public let productId: String
    public let storePointId: String
    public let inventoryLocationSnapshot: String
    public let trackingModeSnapshot: String
    public let quarantinedQty: Int
    public let imeis: [String]?
    public let status: String
    public let disposition: String?
    public let proposalReason: String
    public let proposedBy: String
    public let resolutionReason: String?
    public let resolvedBy: String?
    public let inventoryMovementId: String?
    public let createdAt: Date
    public let resolvedAt: Date?
}

public enum NativeSupplyPolicy {
    private static let terminalLineStates = Set(["handed_over", "customer_cancelled", "cancelled"])
    private static let courierReadyStates = Set(["ready", "handed_over", "customer_cancelled", "cancelled"])

    public static func canResolveOwnerCancellation(session: StaffSession, serverCapability: Bool) -> Bool {
        serverCapability
            && ["owner", "admin"].contains(session.role)
            && session.totpEnabled
    }

    public static func canUsePointBoundOperations(session: StaffSession) -> Bool {
        !(session.point?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }

    public static func canPartiallyHandOver(_ item: CustomerOrderItem) -> Bool {
        item.id != nil
            && ["ready", "reserved"].contains(item.fulfillmentStatus ?? "")
    }

    public static func allLinesReadyForCourier(_ order: CustomerOrder) -> Bool {
        !order.items.isEmpty
            && order.items.allSatisfy { courierReadyStates.contains($0.fulfillmentStatus ?? "") }
            && (order.paymentSchedule ?? []).allSatisfy { receivable in
                receivable.status == "settled" || receivable.status == "cancelled"
            }
    }

    public static func activeLineCount(_ order: CustomerOrder) -> Int {
        order.items.filter { !terminalLineStates.contains($0.fulfillmentStatus ?? "") }.count
    }
}

public struct CustomerOrder: Decodable, Identifiable, Sendable {
    public let id: String
    public let channel: String
    public let fulfillmentType: String?
    public let pickupPoint: String?
    public let deliveryAddress: String?
    public let deliverySlot: String?
    public let pickupCode: String?
    public let status: String
    public let total: Int
    public let createdAt: Date
    public let items: [CustomerOrderItem]
    public let paymentSchedule: [OrderReceivable]?
    public let initialDue: Int?
    public let balanceDue: Int?

    public init(id: String, channel: String, fulfillmentType: String?, pickupPoint: String?, deliveryAddress: String?, deliverySlot: String?, pickupCode: String?, status: String, total: Int, createdAt: Date, items: [CustomerOrderItem], paymentSchedule: [OrderReceivable]? = nil, initialDue: Int? = nil, balanceDue: Int? = nil) {
        self.id = id
        self.channel = channel
        self.fulfillmentType = fulfillmentType
        self.pickupPoint = pickupPoint
        self.deliveryAddress = deliveryAddress
        self.deliverySlot = deliverySlot
        self.pickupCode = pickupCode
        self.status = status
        self.total = total
        self.createdAt = createdAt
        self.items = items
        self.paymentSchedule = paymentSchedule
        self.initialDue = initialDue
        self.balanceDue = balanceDue
    }
}

public struct CustomerOrderReceipt: Decodable, Sendable {
    public let markup: String
}

/// One append-only Event Ledger row for an order (`GET orders/:id/ledger`).
public struct OrderLedgerEvent: Decodable, Identifiable, Sendable {
    public let id: String
    public let type: String
    public let actor: String
    public let timestamp: Date

    public init(id: String, type: String, actor: String, timestamp: Date) {
        self.id = id
        self.type = type
        self.actor = actor
        self.timestamp = timestamp
    }

    private enum CodingKeys: String, CodingKey { case id, type, actor; case timestamp = "ts" }
}

public struct OrderTimelineStep: Equatable, Sendable {
    public let title: String
    public let isDone: Bool
    public let isCurrent: Bool
    public let time: Date?

    public init(title: String, isDone: Bool, isCurrent: Bool, time: Date?) {
        self.title = title
        self.isDone = isDone
        self.isCurrent = isCurrent
        self.time = time
    }
}

/// Терминальный исход заказа: движение прекратилось и не возобновится.
/// Зеркало `TERMINAL_BAD` из apps/web/lib/order-status.ts.
public enum OrderTerminalOutcome: String, Sendable, Equatable {
    case cancelled
    case refunded
    case returned
    case exchanged

    public var title: String {
        switch self {
        case .cancelled: "Заказ отменён"
        case .refunded: "Возврат денег оформлен"
        case .returned: "Товар возвращён"
        case .exchanged: "Оформлен обмен"
        }
    }
}

/// Customer-facing fulfillment timeline built from the order ledger.
/// Mirrors apps/web/lib/order-status.ts: a step is done when one of its events
/// exists (timestamped from that event); the first pending step is current.
public enum OrderTimelineBuilder {
    private static let steps: [(title: String, events: [String])] = [
        ("Заказ создан", ["order.created", "order.confirmed"]),
        ("Оплата подтверждена", ["order.paid", "payment.received", "payment.reconciled", "debt.settled"]),
        ("Собираем заказ", ["order.picking", "order.reserved"]),
        ("Готов к выдаче или в пути", ["order.packed", "order.ready_for_pickup", "delivery.out"]),
        ("Получен", ["order.completed", "delivery.delivered"])
    ]

    public static var stepTitles: [String] {
        steps.map(\.title)
    }

    public static func terminalOutcome(status: String) -> OrderTerminalOutcome? {
        OrderTerminalOutcome(rawValue: status.lowercased())
    }

    /// Таймлайн с оглядкой на статус заказа. Отменённый и возвращённый заказ
    /// приходил сюда обычным `status`, а шаги строились по одному леджеру — и
    /// экран продолжал подсвечивать «Собираем заказ» у заказа, который никто
    /// уже не собирает. Подсветка следующего шага читается как обещание, что
    /// заказ едет, поэтому у терминального исхода текущего шага нет вовсе.
    /// Пройденные шаги остаются пройденными: эти события действительно были.
    public static func build(events: [OrderLedgerEvent], status: String?) -> [OrderTimelineStep] {
        let ledgerSteps = build(events: events)
        guard let status, terminalOutcome(status: status) != nil else { return ledgerSteps }
        return ledgerSteps.map { step in
            OrderTimelineStep(title: step.title, isDone: step.isDone, isCurrent: false, time: step.time)
        }
    }

    public static func build(events: [OrderLedgerEvent]) -> [OrderTimelineStep] {
        let times: [Date?] = steps.map { step in
            events.filter { step.events.contains($0.type) }.map(\.timestamp).min()
        }
        let firstPending = times.firstIndex(where: { $0 == nil }) ?? times.count
        return steps.enumerated().map { index, step in
            OrderTimelineStep(
                title: step.title,
                isDone: index < firstPending,
                isCurrent: index == firstPending,
                time: times[index]
            )
        }
    }
}

public struct OrderStatusMutation: Decodable, Sendable {
    public let id: String
    public let status: String
}

public struct FulfillOrderResponse: Decodable, Sendable {
    public let order: OrderStatusMutation
    public let assigned: [String]
}

public struct OrderTransitionRequest: Encodable, Sendable {
    public let to: String

    public init(to: String) { self.to = to }
}

public struct EmptyRequest: Encodable, Sendable {
    public init() {}
}

public struct Customer360: Decodable, Sendable {
    public let customer: Customer360Profile
    public let orders: Customer360Orders
    public let debts: Customer360Debts
    public let warranties: Customer360Warranties
    public let tickets: Customer360Tickets

    public init(customer: Customer360Profile, orders: Customer360Orders, debts: Customer360Debts, warranties: Customer360Warranties, tickets: Customer360Tickets) {
        self.customer = customer
        self.orders = orders
        self.debts = debts
        self.warranties = warranties
        self.tickets = tickets
    }
}

public struct Customer360Profile: Decodable, Sendable {
    public let id: String
    public let name: String
    public let phone: String
    public let consent: Bool
    public let segments: [String]
    public let ltv: Int
    public let createdAt: Date

    public init(id: String, name: String, phone: String, consent: Bool, segments: [String], ltv: Int, createdAt: Date) {
        self.id = id
        self.name = name
        self.phone = phone
        self.consent = consent
        self.segments = segments
        self.ltv = ltv
        self.createdAt = createdAt
    }
}

public struct Customer360Order: Decodable, Identifiable, Sendable {
    public let id: String
    public let status: String
    public let total: Int
    public let createdAt: Date

    public init(id: String, status: String, total: Int, createdAt: Date) {
        self.id = id
        self.status = status
        self.total = total
        self.createdAt = createdAt
    }
}

public struct Customer360Orders: Decodable, Sendable {
    public let total: Int
    public let spent: Int
    public let recent: [Customer360Order]

    public init(total: Int, spent: Int, recent: [Customer360Order]) {
        self.total = total
        self.spent = spent
        self.recent = recent
    }
}

public struct Customer360Debt: Decodable, Identifiable, Sendable {
    public let id: String
    public let balance: Int
    public let status: String
    public let dueDate: Date

    public init(id: String, balance: Int, status: String, dueDate: Date) {
        self.id = id
        self.balance = balance
        self.status = status
        self.dueDate = dueDate
    }
}

public struct Customer360Debts: Decodable, Sendable {
    public let count: Int
    public let openBalance: Int
    public let items: [Customer360Debt]

    public init(count: Int, openBalance: Int, items: [Customer360Debt]) {
        self.count = count
        self.openBalance = openBalance
        self.items = items
    }
}

public struct Customer360Warranty: Decodable, Identifiable, Sendable {
    public let id: String
    public let imei: String
    public let status: String
    public let sla: Date

    public init(id: String, imei: String, status: String, sla: Date) {
        self.id = id
        self.imei = imei
        self.status = status
        self.sla = sla
    }
}

public struct Customer360Warranties: Decodable, Sendable {
    public let open: Int
    public let items: [Customer360Warranty]

    public init(open: Int, items: [Customer360Warranty]) {
        self.open = open
        self.items = items
    }
}

public struct Customer360Ticket: Decodable, Identifiable, Sendable {
    public let id: String
    public let subject: String
    public let status: String
    public let priority: String
    public let sla: Date

    public init(id: String, subject: String, status: String, priority: String, sla: Date) {
        self.id = id
        self.subject = subject
        self.status = status
        self.priority = priority
        self.sla = sla
    }
}

public struct Customer360Tickets: Decodable, Sendable {
    public let open: Int
    public let items: [Customer360Ticket]

    public init(open: Int, items: [Customer360Ticket]) {
        self.open = open
        self.items = items
    }
}

public struct WarrantyStatusRequest: Encodable, Sendable {
    public let status: String

    public init(status: String) { self.status = status }
}

public struct EvidenceAsset: Decodable, Sendable {
    public let key: String
    public let url: String
    public let width: Int
    public let height: Int
    public let bytes: Int
    public let format: String
}

public struct EvidenceAttachment: Decodable, Sendable {
    public let entityType: String
    public let entityId: String
    public let asset: EvidenceAsset
    public let label: String?
}

public struct CreateOrderItem: Codable, Sendable {
    public let sku: String
    public let qty: Int
    public let price: Int

    public init(sku: String, qty: Int, price: Int) {
        self.sku = sku
        self.qty = qty
        self.price = price
    }
}

public struct CreateOrderRequest: Codable, Sendable {
    public let customerId: String
    public let channel: String
    public let fulfillmentType: String
    public let storePointId: String?
    public let deliveryAddress: String?
    public let total: Int
    public let items: [CreateOrderItem]
    public let paymentMode: String?
    public let promoCode: String?
    public let loyaltyPoints: Int?
    public let deliveryZoneId: String?
    public let deliverySlotId: String?
    public let deliverySlot: String?
    /// Согласие с офертой и обработкой персональных данных. Веб шлёт его флажком
    /// с экрана оформления (`apps/web/app/checkout/page.tsx`), и по нему сервер
    /// ставит `piiConsentAt` (`apps/api/src/orders/orders.service.ts:719`).
    /// В запросе с iOS поля не было вовсе — заказы с приложения ложились без
    /// отметки согласия, хотя веб её требует. Умолчание `nil` намеренное:
    /// согласие проставляет только человек, поставивший галочку, а не клиент.
    public let piiConsent: Bool?

    public init(
        customerId: String,
        fulfillmentType: String,
        storePointId: String?,
        deliveryAddress: String?,
        total: Int,
        items: [CreateOrderItem],
        paymentMode: String? = nil,
        promoCode: String? = nil,
        loyaltyPoints: Int? = nil,
        deliveryZoneId: String? = nil,
        deliverySlotId: String? = nil,
        deliverySlot: String? = nil,
        piiConsent: Bool? = nil
    ) {
        self.customerId = customerId
        self.channel = "mobile"
        self.fulfillmentType = fulfillmentType
        self.storePointId = storePointId
        self.deliveryAddress = deliveryAddress
        self.total = total
        self.items = items
        self.paymentMode = paymentMode
        self.promoCode = promoCode
        self.loyaltyPoints = loyaltyPoints
        self.deliveryZoneId = deliveryZoneId
        self.deliverySlotId = deliverySlotId
        self.deliverySlot = deliverySlot
        self.piiConsent = piiConsent
    }
}

public struct PromotionQuoteItem: Encodable, Sendable {
    public let sku: String
    public let qty: Int

    public init(sku: String, qty: Int) {
        self.sku = sku
        self.qty = qty
    }
}

public struct PromotionQuoteRequest: Encodable, Sendable {
    public let code: String
    public let items: [PromotionQuoteItem]

    public init(code: String, items: [PromotionQuoteItem]) {
        self.code = code
        self.items = items
    }
}

public struct PromotionQuote: Decodable, Sendable {
    public let id: String
    public let code: String
    public let name: String
    public let subtotal: Int
    public let eligibleSubtotal: Int
    public let discount: Int
    public let customerLimitVerified: Bool
    public let validUntil: String?
}

public enum OnlinePaymentMethod: String, CaseIterable, Identifiable, Sendable {
    case card
    case qrMBank = "qr_mbank"
    case qrODengi = "qr_odengi"
    case installment

    public var id: String { rawValue }
}

public struct CreatePaymentIntentRequest: Encodable, Sendable {
    public let orderId: String
    public let method: String
    public let amount: Int
    public let returnUrl: String?

    public init(orderId: String, method: OnlinePaymentMethod, amount: Int, returnUrl: String? = nil) {
        self.orderId = orderId
        self.method = method.rawValue
        self.amount = amount
        self.returnUrl = returnUrl
    }
}

public struct PaymentIntent: Decodable, Sendable {
    public let intentId: String
    public let provider: String
    public let orderId: String
    public let orderStatus: String
    public let method: String
    public let amount: Int
    public let txnId: String
    public let status: String
    public let expiresAt: Date
    public let paymentUrl: String
    public let qrPayload: String?
}

public struct DeviceWarrantySummary: Decodable, Sendable {
    public let id: String
    public let status: String
    public let sla: Date

    public init(id: String, status: String, sla: Date) {
        self.id = id
        self.status = status
        self.sla = sla
    }
}

public struct CustomerDevice: Decodable, Identifiable, Sendable {
    public var id: String { imei }
    public let imei: String
    public let product: String
    public let status: String
    public let warrantyUntil: String?
    public let daysLeft: Int?
    public let warranty: DeviceWarrantySummary?

    public init(imei: String, product: String, status: String, warrantyUntil: String?, daysLeft: Int?, warranty: DeviceWarrantySummary?) {
        self.imei = imei
        self.product = product
        self.status = status
        self.warrantyUntil = warrantyUntil
        self.daysLeft = daysLeft
        self.warranty = warranty
    }
}

public struct OpenWarrantyRequest: Encodable, Sendable {
    public let imei: String
    public let customerId: String
    public let problem: String

    public init(imei: String, customerId: String, problem: String) {
        self.imei = imei
        self.customerId = customerId
        self.problem = problem
    }
}

public struct WarrantyCase: Decodable, Identifiable, Sendable {
    public let id: String
    public let imei: String
    public let customerId: String
    public let problem: String
    public let status: String
    public let sla: Date
}

public struct OpenCustomerSupportTicketRequest: Encodable, Sendable {
    public let channel: String
    public let subject: String
    public let body: String?
    public let priority: String

    public init(subject: String, body: String?, priority: String = "normal") {
        self.channel = "app"
        self.subject = subject
        self.body = body
        self.priority = priority
    }
}

public struct CustomerSupportTicket: Decodable, Identifiable, Sendable {
    public let id: String
    public let channel: String
    public let subject: String
    public let body: String?
    public let priority: String
    public let sla: Date
    public let status: String
    public let createdAt: Date
}

public struct RegisterPushTokenRequest: Encodable, Sendable {
    public let token: String
    public let platform: String
    public let deviceId: String
    public let scope: String

    public init(token: String, deviceId: String, scope: String = "customer") {
        self.token = token
        self.platform = "ios"
        self.deviceId = deviceId
        self.scope = scope
    }
}

public struct RegisteredPushToken: Decodable, Sendable {
    public let id: String
    public let token: String
    public let platform: String
    public let deviceId: String
    public let scope: String
    public let customerId: String?
    public let staffId: String?
    public let enabled: Bool
    public let lastSeenAt: Date
}

public struct StaffTask: Decodable, Identifiable, Sendable {
    public let id: String
    public let title: String
    public let description: String?
    public let status: String
    public let priority: String
    public let assigneeId: String
    public let dueAt: Date?
    public let relatedType: String?
    public let relatedId: String?
    public let createdAt: Date
    public let updatedAt: Date
    public let completedAt: Date?

    public init(
        id: String,
        title: String,
        description: String?,
        status: String,
        priority: String,
        assigneeId: String,
        dueAt: Date?,
        relatedType: String?,
        relatedId: String?,
        createdAt: Date,
        updatedAt: Date,
        completedAt: Date?
    ) {
        self.id = id
        self.title = title
        self.description = description
        self.status = status
        self.priority = priority
        self.assigneeId = assigneeId
        self.dueAt = dueAt
        self.relatedType = relatedType
        self.relatedId = relatedId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.completedAt = completedAt
    }
}

public struct UpdateStaffTaskRequest: Encodable, Sendable {
    public let status: String

    public init(status: String) { self.status = status }
}

public struct StaffSupportTicket: Decodable, Identifiable, Sendable {
    public let id: String
    public let customerId: String
    public let channel: String
    public let subject: String
    public let body: String?
    public let priority: String
    public let sla: Date
    public let status: String
    public let assignee: String?
    public let createdAt: Date

    public init(id: String, customerId: String, channel: String, subject: String, body: String?, priority: String, sla: Date, status: String, assignee: String?, createdAt: Date) {
        self.id = id
        self.customerId = customerId
        self.channel = channel
        self.subject = subject
        self.body = body
        self.priority = priority
        self.sla = sla
        self.status = status
        self.assignee = assignee
        self.createdAt = createdAt
    }
}

public struct SupportTransitionRequest: Encodable, Sendable {
    public let to: String
    public let assignee: String?

    public init(to: String, assignee: String? = nil) {
        self.to = to
        self.assignee = assignee
    }
}

public struct EmptyMutationRequest: Encodable, Sendable {
    public init() {}
}

public struct CourierCustomer: Decodable, Sendable {
    public let name: String
    public let phone: String
}

public struct CourierPayment: Decodable, Sendable {
    public let amount: Int
    public let status: String
}

public struct CourierRunSummary: Decodable, Identifiable, Sendable {
    public let id: String
    public let codTotal: Int
    public let collectedTotal: Int
    public let handedOver: Bool
}

public struct CourierDelivery: Decodable, Identifiable, Sendable {
    public let id: String
    public let status: String
    public let total: Int
    public let deliveryAddress: String?
    public let deliverySlot: String?
    public let customer: CourierCustomer
    public let items: [CustomerOrderItem]
    public let payments: [CourierPayment]
    public let courierRun: CourierRunSummary?

    public var outstandingCOD: Int {
        let settled = payments
            .filter { $0.status == "received" || $0.status == "reconciled" }
            .reduce(0) { $0 + max(0, $1.amount) }
        return max(0, total - settled)
    }

    /// Empty items mean an older server response: the start command remains
    /// server-authoritative. When lines are present, native can explain a
    /// fail-closed preflight before the server repeats the same validation.
    public var readinessReasons: [String] {
        guard !items.isEmpty else { return [] }
        return items.compactMap { item in
            guard !["ready", "handed_over", "customer_cancelled", "cancelled"]
                .contains(item.fulfillmentStatus ?? "") else { return nil }
            return "\(item.sku): \(item.fulfillmentStatus ?? "статус не получен")"
        }
    }

    public var nativeReadinessKnown: Bool { !items.isEmpty }
    public var canStartByNativePreflight: Bool { !nativeReadinessKnown || readinessReasons.isEmpty }
}

/// Метки Evidence, которые сервер сверяет побайтово.
///
/// `evidence.service.ts:201-208` сравнивает `upload.label` с ожидаемой строкой и
/// при расхождении отвечает `courier_evidence_mismatch`. Ожидаемые значения заданы
/// на вызывающей стороне: `courier.controller.ts:96` и `deliveries.controller.ts:47`.
/// Держим их константами, а не литералами внутри вью: строка, которую сверяют на
/// другом конце сети, обязана меняться осознанно и вместе с сервером.
public enum CourierEvidenceLabel {
    public static let delivered = "Подтверждение доставки"
    public static let failed = "Неуспешная доставка"
}

/// Завершение доставки.
///
/// `evidenceIdempotencyKey` объявлен **обязательным**, хотя серверный DTO помечает
/// его `@IsOptional()`. Это намеренно: `evidence.service.ts:190` безусловно бросает
/// `courier_evidence_required`, если поле пустое, — то есть запрос без ключа не
/// имеет смысла никогда. Требование на уровне типа не даёт собрать такой запрос,
/// вместо того чтобы получать 422 в руках у курьера.
public struct CompleteCourierDeliveryRequest: Codable, Sendable {
    public let codAmount: Int
    public let evidenceIdempotencyKey: String
    public let reason: String?
    public init(codAmount: Int, evidenceIdempotencyKey: String, reason: String? = nil) {
        self.codAmount = codAmount
        self.evidenceIdempotencyKey = evidenceIdempotencyKey
        self.reason = reason
    }
}

/// Неуспешная доставка. Ключ обязателен по той же причине, что и выше.
public struct FailCourierDeliveryRequest: Codable, Sendable {
    public let reason: String
    public let evidenceIdempotencyKey: String
    public init(reason: String, evidenceIdempotencyKey: String) {
        self.reason = reason
        self.evidenceIdempotencyKey = evidenceIdempotencyKey
    }
}

public struct CourierCommandResponse: Decodable, Sendable {
    public let id: String?
    public let orderId: String?
    public let status: String
    public let recorded: Bool?
}

public struct CourierHandoverRequest: Encodable, Sendable {
    public let runId: String
    public let amount: Int
    public let reason: String?

    public init(runId: String, amount: Int, reason: String? = nil) {
        self.runId = runId
        self.amount = amount
        self.reason = reason
    }
}

public struct POSLine: Codable, Sendable {
    public let productId: String
    public let sku: String
    public let price: Int
    public let qty: Int
    public let imei: String?

    public init(productId: String, sku: String, price: Int, qty: Int, imei: String? = nil) {
        self.productId = productId
        self.sku = sku
        self.price = price
        self.qty = qty
        self.imei = imei
    }
}

public struct POSTender: Codable, Sendable {
    public let method: String
    public let amount: Int

    public init(method: String, amount: Int) {
        self.method = method
        self.amount = amount
    }
}

public struct POSSaleRequest: Codable, Sendable {
    public let point: String
    public let lines: [POSLine]
    public let payments: [POSTender]
    public let discountPct: Int
    public let clientSaleId: String
    public let approvalId: String?
    public let reason: String?

    public init(
        point: String,
        lines: [POSLine],
        payments: [POSTender],
        discountPct: Int,
        clientSaleId: String,
        approvalId: String? = nil,
        reason: String? = nil
    ) {
        self.point = point
        self.lines = lines
        self.payments = payments
        self.discountPct = discountPct
        self.clientSaleId = clientSaleId
        self.approvalId = approvalId
        self.reason = reason
    }

    public func approved(with approvalId: String) -> POSSaleRequest {
        POSSaleRequest(
            point: point,
            lines: lines,
            payments: payments,
            discountPct: discountPct,
            clientSaleId: clientSaleId,
            approvalId: approvalId,
            reason: reason
        )
    }
}

public enum POSSaleResult: Decodable, Sendable {
    case completed(orderId: String, receiptNo: String, total: Int, status: String, shiftId: String, imeis: [String])
    case approvalRequired(approvalId: String, reason: String)

    private enum CodingKeys: String, CodingKey {
        case pendingApproval, approvalId, reason, orderId, receiptNo, total, status, shiftId, imeis
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        if try values.decodeIfPresent(Bool.self, forKey: .pendingApproval) == true {
            self = .approvalRequired(
                approvalId: try values.decode(String.self, forKey: .approvalId),
                reason: try values.decodeIfPresent(String.self, forKey: .reason) ?? "discount"
            )
            return
        }
        self = .completed(
            orderId: try values.decode(String.self, forKey: .orderId),
            receiptNo: try values.decode(String.self, forKey: .receiptNo),
            total: try values.decode(Int.self, forKey: .total),
            status: try values.decode(String.self, forKey: .status),
            shiftId: try values.decode(String.self, forKey: .shiftId),
            imeis: try values.decodeIfPresent([String].self, forKey: .imeis) ?? []
        )
    }
}

public struct POSUnit: Decodable, Sendable {
    public let imei: String
    public let productId: String
    public let status: String
    public let sku: String
    public let product: String
    public let price: Int
}

public struct POSReceipt: Decodable, Sendable {
    public let markup: String
    public let svg: String
    public let escposBase64: String

    public init(markup: String, svg: String, escposBase64: String) {
        self.markup = markup
        self.svg = svg
        self.escposBase64 = escposBase64
    }
}

public struct POSPayment: Decodable, Identifiable, Sendable {
    public let id: String
    public let orderId: String?
    public let amount: Int
    public let method: String
    public let status: String
}

public struct POSReturn: Decodable, Identifiable, Sendable {
    public let id: String
    public let orderId: String
    public let reason: String
    public let status: String
    public let createdAt: Date
}

public struct POSReturnTransitionRequest: Encodable, Sendable {
    public let status: String
    public let location: String?

    public init(status: String, location: String? = nil) {
        self.status = status
        self.location = location
    }
}

public struct POSRefundRequest: Encodable, Sendable {
    public let amount: Int
    public let reason: String

    public init(amount: Int, reason: String) {
        self.amount = amount
        self.reason = reason
    }
}

public struct POSRefundApproval: Decodable, Sendable {
    public let approvalId: String
}

public struct POSExchangeRequest: Encodable, Sendable {
    public let originalOrderId: String
    public let oldImei: String
    public let newProductId: String
    public let method: String

    public init(originalOrderId: String, oldImei: String, newProductId: String, method: String) {
        self.originalOrderId = originalOrderId
        self.oldImei = oldImei
        self.newProductId = newProductId
        self.method = method
    }
}

public struct POSExchangeResult: Decodable, Sendable {
    public let exchangeRequestId: String
    public let approvalId: String
    public let status: String
    public let oldImei: String
    public let newImei: String
    public let surchargeAmount: Int
    public let evidenceRequired: Bool
    public let expiresAt: String
    public let idempotent: Bool
}

// MARK: - Скупка Б/У у прилавка

/// Клиент, найденный по телефону (`GET /customers/lookup`).
///
/// Только идентификация: скупке нужен `customerId`, а всё остальное о клиенте
/// живёт за Customer 360 со своей проверкой прав.
public struct CustomerLookupResult: Decodable, Sendable {
    public let id: String
    public let name: String
    public let phone: String
}

/// Оценка выкупа с сервера (`GET /tradeins/estimate`).
///
/// Цену считает сервер по модели и состоянию. Клиент её только показывает —
/// в договор уходит та же цифра, что вернулась отсюда.
public struct TradeInEstimate: Decodable, Sendable {
    public let model: String
    public let grade: String
    public let priceSom: Int
}

public struct CreateTradeInRequest: Encodable, Sendable {
    public let customerId: String
    public let model: String
    public let imei: String?
    public let grade: String
    public let price: Int
    public let sellerPassport: String

    public init(customerId: String, model: String, imei: String?, grade: String, price: Int, sellerPassport: String) {
        self.customerId = customerId
        self.model = model
        self.imei = imei
        self.grade = grade
        self.price = price
        self.sellerPassport = sellerPassport
    }
}

/// Созданная заявка. `id` — то, к чему потом крепятся фото в Evidence Vault.
public struct TradeInView: Decodable, Sendable {
    public let id: String
    public let customerId: String
    public let model: String
    public let grade: String
    public let price: Int
    public let contractId: String?
}
