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

    /// Ключ списания со склада: namespace + день + отпечаток содержимого.
    ///
    /// Одного содержимого мало. Два действительно разных списания одного товара,
    /// количества и причины дают одинаковый отпечаток, а сервер отказывает по
    /// ключу, чья заявка уже решена, — законная работа встала бы. День ограничивает
    /// окно дедупа двойным тапом, ради которого он и нужен. Namespace обязателен:
    /// `Approval.idempotencyKey` уникален по ВСЕМ действиям, и голый отпечаток мог
    /// бы столкнуться с чужим — тогда списание получило бы чужую заявку.
    public static func inventoryWriteOff<Body: Encodable>(_ body: Body, on date: Date = Date()) throws -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .gmt
        let day = calendar.dateComponents([.year, .month, .day], from: date)
        let stamp = String(format: "%04d-%02d-%02d", day.year ?? 0, day.month ?? 0, day.day ?? 0)
        return "inventory-write-off-\(stamp)-\(try fingerprint(body))"
    }

    /// Короткий устойчивый отпечаток содержимого.
    public static func fingerprint<Body: Encodable>(_ body: Body) throws -> String {
        let digest = SHA256.hash(data: try OfflineQueueCoding.encode(body))
        return digest.map { String(format: "%02x", $0) }.joined().prefix(16).lowercased()
    }
}

/// Persists an open mutation intent across retries and app relaunches.
///
/// Only a payload fingerprint and opaque HTTP key are stored. Entity identifiers
/// are hashed into the storage key; request bodies are never persisted.
public final class MutationIntentStore: @unchecked Sendable {
    private struct Record: Codable {
        let payloadFingerprint: String
        let idempotencyKey: String
    }

    private static let lock = NSLock()
    private let defaults: UserDefaults
    private let storagePrefix: String

    public init(defaults: UserDefaults = .standard, storagePrefix: String = "alistore.mutation-intent.v1") {
        self.defaults = defaults
        self.storagePrefix = storagePrefix
    }

    /// The same open logical intent gets the same key. Edited content replaces
    /// that intent and gets a new key.
    public func key<Body: Encodable>(
        namespace: String,
        scope: String,
        body: Body
    ) throws -> String {
        let payloadFingerprint = try IdempotencyKeys.fingerprint(body)
        let storageKey = storageKey(namespace: namespace, scope: scope)

        return Self.lock.withLock {
            if let data = defaults.data(forKey: storageKey),
               let record = try? JSONDecoder().decode(Record.self, from: data),
               record.payloadFingerprint == payloadFingerprint {
                return record.idempotencyKey
            }

            let key = "\(safeNamespace(namespace))-\(payloadFingerprint)-\(UUID().uuidString.lowercased())"
            let record = Record(payloadFingerprint: payloadFingerprint, idempotencyKey: key)
            if let data = try? JSONEncoder().encode(record) {
                defaults.set(data, forKey: storageKey)
            }
            return key
        }
    }

    /// Completes only the intent that succeeded. A late response from an older
    /// request cannot erase a newer, edited intent.
    public func complete(namespace: String, scope: String, idempotencyKey: String) {
        let storageKey = storageKey(namespace: namespace, scope: scope)
        Self.lock.withLock {
            guard let data = defaults.data(forKey: storageKey),
                  let record = try? JSONDecoder().decode(Record.self, from: data),
                  record.idempotencyKey == idempotencyKey else { return }
            defaults.removeObject(forKey: storageKey)
        }
    }

    private func storageKey(namespace: String, scope: String) -> String {
        let digest = SHA256.hash(data: Data("\(namespace)|\(scope)".utf8))
        let hash = digest.map { String(format: "%02x", $0) }.joined()
        return "\(storagePrefix).\(hash)"
    }

    private func safeNamespace(_ namespace: String) -> String {
        String(namespace.lowercased().map { character in
            character.isLetter || character.isNumber || character == "-" ? character : "-"
        })
    }
}

public enum NativeMutationEndpoint {
    public static func orderCancellation(orderId: String) -> String {
        "orders/mine/\(pathSegment(orderId))/cancellations"
    }

    public static func receivableSettlement(receivableId: String) -> String {
        "payments/receivables/\(pathSegment(receivableId))/settle"
    }

    public static func itemHandover(orderId: String, itemId: String) -> String {
        "orders/\(pathSegment(orderId))/items/\(pathSegment(itemId))/handover"
    }

    private static func pathSegment(_ value: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }
}
