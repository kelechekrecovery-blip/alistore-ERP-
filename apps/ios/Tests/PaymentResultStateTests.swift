import AliStoreCore
import XCTest

/// Итог экрана оплаты — деньги. Ключевой кейс: заказ создан, но оплата не прошла
/// (нет интента, есть retry-ошибка) обязан читаться как провал, а не «Заказ
/// оформлен». Именно этот false-success поймал ревью подарочной карты.
final class PaymentResultStateTests: XCTestCase {
    func testUnpaidOrderWithRetryErrorIsFailedNotSuccess() {
        // Отказ списания подарочной карты и провал создания онлайн-интента идут
        // сюда: intent == nil, но есть surfaced-ошибка. Это неоплаченный заказ.
        XCTAssertEqual(
            paymentResultState(forceFailure: false, paymentStatus: nil, orderStatus: nil, hasRetryError: true),
            .failed
        )
    }

    func testNoIntentNoErrorIsSuccess() {
        // Оплата при получении и успешная подарочная карта: интента нет, ошибки нет.
        XCTAssertEqual(
            paymentResultState(forceFailure: false, paymentStatus: nil, orderStatus: nil, hasRetryError: false),
            .success
        )
    }

    func testForceFailureWinsOverEverything() {
        XCTAssertEqual(
            paymentResultState(forceFailure: true, paymentStatus: "captured", orderStatus: "paid", hasRetryError: false),
            .failed
        )
    }

    func testRetryErrorWinsOverPaidIntent() {
        // Защита от абсурда: если вдруг есть и «paid», и surfaced-ошибка — не показываем
        // успех, ошибка приоритетнее.
        XCTAssertEqual(
            paymentResultState(forceFailure: false, paymentStatus: "captured", orderStatus: "paid", hasRetryError: true),
            .failed
        )
    }

    func testIntentStatusDrivesStateWhenNoRetryError() {
        XCTAssertEqual(paymentResultState(forceFailure: false, paymentStatus: "failed", orderStatus: nil, hasRetryError: false), .failed)
        XCTAssertEqual(paymentResultState(forceFailure: false, paymentStatus: "declined", orderStatus: nil, hasRetryError: false), .failed)
        XCTAssertEqual(paymentResultState(forceFailure: false, paymentStatus: "captured", orderStatus: nil, hasRetryError: false), .success)
        XCTAssertEqual(paymentResultState(forceFailure: false, paymentStatus: "processing", orderStatus: nil, hasRetryError: false), .pending)
        XCTAssertEqual(paymentResultState(forceFailure: false, paymentStatus: "processing", orderStatus: "paid", hasRetryError: false), .success)
    }
}
