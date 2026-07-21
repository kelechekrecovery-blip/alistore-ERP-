import Foundation
import SwiftData

@Model
public final class PendingMutation {
    @Attribute(.unique) public var id: UUID
    public var endpoint: String
    public var method: String
    public var body: Data
    public var idempotencyKey: String
    public var attempts: Int
    public var state: String = "queued"
    public var lastError: String?
    public var createdAt: Date
    public var updatedAt: Date

    public init(endpoint: String, method: String, body: Data, idempotencyKey: String = UUID().uuidString) {
        self.id = UUID()
        self.endpoint = endpoint
        self.method = method
        self.body = body
        self.idempotencyKey = idempotencyKey
        self.attempts = 0
        self.state = "queued"
        self.lastError = nil
        self.createdAt = Date()
        self.updatedAt = Date()
    }
}

public enum OfflineOrderQueue {
    @MainActor
    public static func enqueue(
        _ request: CreateOrderRequest,
        idempotencyKey: String,
        context: ModelContext
    ) throws {
        let body = try JSONEncoder().encode(request)
        context.insert(PendingMutation(
            endpoint: "orders/mine",
            method: "POST",
            body: body,
            idempotencyKey: idempotencyKey
        ))
        try context.save()
    }

    @MainActor
    public static func replay(
        _ mutation: PendingMutation,
        api: APIClient,
        token: String,
        context: ModelContext
    ) async {
        mutation.state = "syncing"
        mutation.attempts += 1
        mutation.updatedAt = Date()
        try? context.save()
        do {
            let request = try JSONDecoder().decode(CreateOrderRequest.self, from: mutation.body)
            if request.fulfillmentType == "pickup" && request.storePointId == nil {
                mutation.state = "conflict"
                mutation.lastError = "Выберите актуальную точку самовывоза и создайте заказ повторно"
                mutation.updatedAt = Date()
                try? context.save()
                return
            }
            let _: CustomerOrder = try await api.post(
                mutation.endpoint,
                body: request,
                token: token,
                idempotencyKey: mutation.idempotencyKey
            )
            context.delete(mutation)
            try context.save()
        } catch let error as APIError {
            if case let .rejected(status, message) = error {
                mutation.state = status == 409 || status == 422 ? "conflict" : "failed"
                mutation.lastError = message
            } else {
                mutation.state = "failed"
                mutation.lastError = error.localizedDescription
            }
            mutation.updatedAt = Date()
            try? context.save()
        } catch {
            mutation.state = "queued"
            mutation.lastError = error.localizedDescription
            mutation.updatedAt = Date()
            try? context.save()
        }
    }
}

public enum OfflineCourierQueue {
    @MainActor
    public static func enqueue<Body: Encodable>(
        endpoint: String,
        body: Body,
        idempotencyKey: String,
        context: ModelContext
    ) throws {
        let encoded = try OfflineQueueCoding.encode(body)
        try enqueueEncoded(endpoint: endpoint, body: encoded, idempotencyKey: idempotencyKey, context: context)
    }

    @MainActor
    public static func enqueueEncoded(
        endpoint: String,
        body rawBody: Data,
        idempotencyKey: String,
        context: ModelContext
    ) throws {
        // Тело могло прийти от произвольного кодировщика — приводим к канону,
        // иначе сравнение с уже сохранённым бессмысленно.
        let body = OfflineQueueCoding.canonical(rawBody)
        let descriptor = FetchDescriptor<PendingMutation>(
            predicate: #Predicate { $0.idempotencyKey == idempotencyKey }
        )
        // Та же развилка, что и в кассе: повтор — идемпотентен, подмена тела под
        // тем же ключом — потеря операции, о которой курьер обязан узнать.
        if let existing = try context.fetch(descriptor).first {
            guard existing.body == body else { throw OfflineQueueError.keyReused }
            return
        }
        context.insert(PendingMutation(
            endpoint: endpoint,
            method: "POST",
            body: body,
            idempotencyKey: idempotencyKey
        ))
        try context.save()
    }

    @MainActor
    public static func replay(
        _ mutation: PendingMutation,
        api: APIClient,
        token: String,
        context: ModelContext
    ) async {
        mutation.state = "syncing"
        mutation.attempts += 1
        mutation.updatedAt = Date()
        try? context.save()
        do {
            let _: IgnoredMutationResponse = try await api.postEncoded(
                mutation.endpoint,
                body: mutation.body,
                token: token,
                idempotencyKey: mutation.idempotencyKey
            )
            context.delete(mutation)
            try context.save()
        } catch let error as APIError {
            if case let .rejected(status, message) = error {
                mutation.state = status == 409 || status == 422 ? "conflict" : "failed"
                mutation.lastError = message
            } else {
                mutation.state = "failed"
                mutation.lastError = error.localizedDescription
            }
            mutation.updatedAt = Date()
            try? context.save()
        } catch {
            mutation.state = "queued"
            mutation.lastError = error.localizedDescription
            mutation.updatedAt = Date()
            try? context.save()
        }
    }

    @MainActor
    public static func retry(_ mutation: PendingMutation, context: ModelContext) throws {
        mutation.state = "queued"
        mutation.lastError = nil
        mutation.updatedAt = Date()
        try context.save()
    }
}

/**
 Каноническое кодирование тел очереди.

 `JSONEncoder` **не гарантирует порядок ключей**: замерено, что два кодирования
 одного и того же `POSSaleRequest` в одном процессе дают разный JSON. Поэтому
 сравнивать тела побайтово можно только после приведения к канону — иначе повтор
 той же продажи выглядит как другая операция.

 Сортировка ключей не меняет смысла для сервера, а тело становится сравнимым и
 стабильным между запусками.
 */
public enum OfflineQueueCoding {
    public static func encode<Body: Encodable>(_ body: Body) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        return try encoder.encode(body)
    }

    /// Приводит уже закодированное тело к тому же канону. Если это не JSON —
    /// возвращает как есть: терять операцию из-за формата нельзя.
    public static func canonical(_ body: Data) -> Data {
        guard let object = try? JSONSerialization.jsonObject(with: body),
              let sorted = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        else { return body }
        return sorted
    }
}

/// Ошибки офлайн-очереди, которые обязан увидеть человек.
public enum OfflineQueueError: LocalizedError, Equatable {
    /// Под этим ключом уже лежит другая операция — принимать нельзя, потому что
    /// одна из двух была бы потеряна без следа.
    case keyReused

    public var errorDescription: String? {
        switch self {
        case .keyReused:
            return "Под этим номером продажи уже сохранена другая операция. Начните новую продажу."
        }
    }
}

public enum OfflinePOSQueue {
    private static let approvalPrefix = "approval:"

    @MainActor
    public static func enqueue(
        _ request: POSSaleRequest,
        context: ModelContext
    ) throws {
        let body = try OfflineQueueCoding.encode(request)
        let descriptor = FetchDescriptor<PendingMutation>(
            predicate: #Predicate { $0.idempotencyKey == request.clientSaleId }
        )
        // Совпадение ключа — это два разных случая, и раньше оба молча
        // проглатывались. Тот же запрос — идемпотентный повтор. Другой запрос
        // под тем же ключом — следующий покупатель, продажа которого исчезала
        // бы целиком, при том что касса писала «сохранено».
        if let existing = try context.fetch(descriptor).first {
            guard existing.body == body else { throw OfflineQueueError.keyReused }
            return
        }
        context.insert(PendingMutation(
            endpoint: "pos/sale",
            method: "POST",
            body: body,
            idempotencyKey: request.clientSaleId
        ))
        try context.save()
    }

    @MainActor
    public static func replay(
        _ mutation: PendingMutation,
        api: APIClient,
        token: String,
        context: ModelContext
    ) async {
        mutation.state = "syncing"
        mutation.attempts += 1
        mutation.updatedAt = Date()
        try? context.save()
        do {
            let result: POSSaleResult = try await api.postEncoded(
                mutation.endpoint,
                body: mutation.body,
                token: token,
                idempotencyKey: mutation.idempotencyKey
            )
            switch result {
            case .completed:
                context.delete(mutation)
            case let .approvalRequired(approvalId, reason):
                mutation.state = "conflict"
                mutation.lastError = "\(approvalPrefix)\(approvalId)|\(reason)"
                mutation.updatedAt = Date()
            }
            try context.save()
        } catch let error as APIError {
            if case let .rejected(status, message) = error {
                mutation.state = status == 409 || status == 422 ? "conflict" : "failed"
                mutation.lastError = message
            } else {
                mutation.state = "failed"
                mutation.lastError = error.localizedDescription
            }
            mutation.updatedAt = Date()
            try? context.save()
        } catch {
            mutation.state = "queued"
            mutation.lastError = error.localizedDescription
            mutation.updatedAt = Date()
            try? context.save()
        }
    }

    @MainActor
    public static func retry(_ mutation: PendingMutation, context: ModelContext) throws {
        mutation.state = "queued"
        mutation.lastError = nil
        mutation.updatedAt = Date()
        try context.save()
    }

    @MainActor
    public static func attachApproval(_ mutation: PendingMutation, context: ModelContext) throws {
        guard let approvalId = approvalId(from: mutation.lastError) else { return }
        let request = try JSONDecoder().decode(POSSaleRequest.self, from: mutation.body)
        mutation.body = try OfflineQueueCoding.encode(request.approved(with: approvalId))
        mutation.state = "queued"
        mutation.lastError = nil
        mutation.updatedAt = Date()
        try context.save()
    }

    public static func approvalId(from error: String?) -> String? {
        guard let error, error.hasPrefix(approvalPrefix) else { return nil }
        return error.dropFirst(approvalPrefix.count).split(separator: "|", maxSplits: 1).first.map(String.init)
    }
}

private struct IgnoredMutationResponse: Decodable, Sendable {
    init(from decoder: Decoder) throws {}
}

/// Первая версия офлайн-схемы. `PendingMutation` намеренно остаётся top-level
/// классом, а не вкладывается сюда: имя сущности SwiftData берёт из имени класса,
/// и вложение переименовало бы её — существующие очереди стали бы невидимыми.
public enum OfflineSchemaV1: VersionedSchema {
    public static var versionIdentifier: Schema.Version { Schema.Version(1, 0, 0) }
    public static var models: [any PersistentModel.Type] { [PendingMutation.self] }
}

/// План миграций. Пока переход один — сама V1, стадий нет. Ценность не в текущем
/// содержимом, а в том, что у следующего изменения модели есть куда встать:
/// без плана оно молча ломает запуск у всех, включая устройства с непроведёнными
/// продажами.
public enum OfflineMigrationPlan: SchemaMigrationPlan {
    public static var schemas: [any VersionedSchema.Type] { [OfflineSchemaV1.self] }
    public static var stages: [MigrationStage] { [] }
}

@MainActor
public enum OfflineStore {
    /// Результат открытия хранилища. Деградация обязана быть видимой: очередь
    /// в памяти выглядит рабочей ровно до перезапуска, после которого продажи
    /// исчезают без следа.
    public struct Opened {
        public let container: ModelContainer
        /// Очередь живёт только в оперативной памяти — офлайн-приём принимать нельзя.
        public let isEphemeral: Bool
        /// Причина отказа, пригодная для показа человеку.
        public let failure: String?
    }

    /// Состояние последнего открытия — чтобы экраны могли отказать в офлайн-приёме
    /// и сказать об этом кассиру, а не принимать продажи в никуда.
    public private(set) static var isEphemeral = false
    public private(set) static var failure: String?

    /// - Parameter url: путь к store. `nil` — расположение по умолчанию;
    ///   продовый путь своё имя не задаёт, иначе сменился бы файл базы.
    public static func open(url: URL? = nil) -> Opened {
        let schema = Schema(versionedSchema: OfflineSchemaV1.self)
        do {
            let configuration = url.map { ModelConfiguration(schema: schema, url: $0) }
                ?? ModelConfiguration(schema: schema)
            let container = try ModelContainer(
                for: schema,
                migrationPlan: OfflineMigrationPlan.self,
                configurations: configuration
            )
            return finish(Opened(container: container, isEphemeral: false, failure: nil))
        } catch {
            // Файл базы не удаляем ни при каких обстоятельствах: он может быть
            // единственным следом непроведённых продаж, и его ещё можно достать
            // руками. Приложение при этом обязано открыться — касса работает
            // в онлайне, а офлайн-приём выключается явно.
            let reason = "Офлайн-очередь недоступна: \(error.localizedDescription)"
            if let memory = try? ModelContainer(
                for: schema,
                configurations: ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
            ) {
                return finish(Opened(container: memory, isEphemeral: true, failure: reason))
            }
            // Контейнер в памяти не создаётся только при поломке самой схемы —
            // это дефект сборки, а не состояние устройства.
            preconditionFailure("Не удалось создать даже временное офлайн-хранилище: \(error)")
        }
    }

    public static func container() -> ModelContainer { open().container }

    private static func finish(_ opened: Opened) -> Opened {
        isEphemeral = opened.isEphemeral
        failure = opened.failure
        return opened
    }
}
