import CryptoKit
import Foundation

/**
 Ключи идемпотентности, производные от содержимого операции.

 Ключ обязан отвечать на вопрос «это та же самая операция?». Ключ, собранный
 только из идентификатора сущности, отвечает на другой вопрос — «это про тот же
 объект?» — и потому глушит исправления.

 Живой случай: сдача COD шла с ключом `courier-handover-<runId>`. Курьер ввёл
 5000, отправил, увидел ошибку, исправил на 7000 — сервер узнал прежний ключ и
 вернул первый результат. Курьер считает, что сдал 7000, в леджере 5000, а
 недостача 2000 записана на курьера.

 Отпечаток снимается с канонического кодирования (`OfflineQueueCoding`), потому
 что `JSONEncoder` не гарантирует порядок ключей: на сыром кодировании один и тот
 же запрос давал бы разные ключи при каждой попытке, то есть идемпотентность
 исчезла бы вовсе.
 */
public enum IdempotencyKeys {
    /// Сдача наличных курьером: тот же рейс и та же сумма — та же операция.
    public static func courierHandover(runId: String, request: CourierHandoverRequest) throws -> String {
        "courier-handover-\(runId)-\(try fingerprint(request))"
    }

    /// Короткий устойчивый отпечаток содержимого.
    public static func fingerprint<Body: Encodable>(_ body: Body) throws -> String {
        let digest = SHA256.hash(data: try OfflineQueueCoding.encode(body))
        return digest.map { String(format: "%02x", $0) }.joined().prefix(16).lowercased()
    }
}
