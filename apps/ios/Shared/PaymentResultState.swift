import Foundation

/// Итоговое состояние экрана оплаты у покупателя.
///
/// Выделено из `ClientPaymentResultView` в чистую функцию, потому что показать
/// «Заказ оформлен» при заказе, который на сервере не оплачен, — денежный дефект,
/// а внутри приватной вью это состояние было непокрываемо тестом.
public enum PaymentResultState: Equatable, Sendable {
    case success
    case pending
    case failed
}

/// Как экран результата должен читать состояние оплаты.
///
/// Порядок важен:
/// 1. `forceFailure` — принудительный провал (UI-тест / явный сигнал) старше всего.
/// 2. `hasRetryError` — заказ создан, но по оплате есть surfaced-ошибка: интент не
///    создался или карта не списалась. Это НЕ успех: заказ существует неоплаченным,
///    и экран обязан показать провал с повтором, а не зелёную галочку. Раньше эта
///    ветка отсутствовала, и оба пути (онлайн-интент и подарочная карта) при `nil`
///    интенте молча показывали успех.
/// 3. Нет интента и нет ошибки — оплата при получении / успешная подарочная карта:
///    успех.
/// 4. Иначе — состояние по статусу интента (сервер — источник истины).
public func paymentResultState(
    forceFailure: Bool,
    paymentStatus: String?,
    orderStatus: String?,
    hasRetryError: Bool
) -> PaymentResultState {
    if forceFailure { return .failed }
    if hasRetryError { return .failed }
    guard let paymentStatus else { return .success }
    let status = paymentStatus.lowercased()
    if ["failed", "declined", "expired", "cancelled", "canceled", "rejected"].contains(status) {
        return .failed
    }
    if ["succeeded", "success", "paid", "captured", "completed"].contains(status)
        || orderStatus?.lowercased() == "paid" {
        return .success
    }
    return .pending
}
