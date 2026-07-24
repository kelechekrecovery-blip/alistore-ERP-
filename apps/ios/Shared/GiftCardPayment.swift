import Foundation

/// Баланс подарочной карты, как его отдаёт `GET /giftcards/:code`
/// (`giftcards.service.ts` → getByCode). Клиент только показывает и решает,
/// хватает ли карты на весь заказ, — само списание считает сервер.
public struct GiftCardView: Decodable, Sendable {
    public let code: String
    public let balance: Int
    public let currency: String
    public let status: String
    public let redeemable: Bool
    /// ISO-8601 или null. Держим строкой: срок мы не показываем, а строка не
    /// втягивает карту в кастомную дата-стратегию декодера.
    public let expiresAt: String?
}

/// Тело `POST /payments` для оплаты подарочной картой. Метод зашит: этот путь
/// существует только для gift_card — покупателю сервер разрешает `POST /payments`
/// исключительно с `method=gift_card` (`payments.controller.ts:96`).
private struct GiftCardPayRequest: Encodable, Sendable {
    let orderId: String
    let method = "gift_card"
    let amount: Int
    let giftCardCode: String
}

/// Оплата заказа подарочной картой из клиентского приложения.
///
/// Только полная оплата: карта закрывает заказ целиком или не применяется. Частичную
/// карту + добор другим тендером (как в вебе) сознательно не тянем в клиент — это
/// отдельный мульти-тендерный UI. `lookup` проверяет покрытие ДО создания заказа,
/// `pay` списывает уже под конкретный orderId; расхождение по балансу между двумя
/// вызовами сервер отклонит, и заказ останется неоплаченным (а не полуоплаченным).
public struct GiftCardCheckout: Sendable {
    private let api: APIClient

    public init(environment: AppEnvironment, session: URLSession = .shared) {
        self.api = APIClient(baseURL: environment.apiBaseURL, session: session)
    }

    /// Баланс по коду. Маршрут публичный и throttled (30/мин) — токен не нужен.
    public func lookup(code: String) async throws -> GiftCardView {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        return try await api.get("giftcards/\(trimmed)")
    }

    /// Списать карту на весь заказ. Бросает при отказе сервера (неверный код,
    /// нехватка баланса) — вызывающий обязан сохранить заказ как неоплаченный,
    /// а не показать «оплачено».
    public func pay(orderId: String, amount: Int, code: String, token: String) async throws {
        try await api.postNoContent(
            "payments",
            body: GiftCardPayRequest(orderId: orderId, amount: amount, giftCardCode: code),
            token: token
        )
    }
}
