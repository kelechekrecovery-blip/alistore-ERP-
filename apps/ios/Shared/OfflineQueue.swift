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
        let encoded = try JSONEncoder().encode(body)
        try enqueueEncoded(endpoint: endpoint, body: encoded, idempotencyKey: idempotencyKey, context: context)
    }

    @MainActor
    public static func enqueueEncoded(
        endpoint: String,
        body: Data,
        idempotencyKey: String,
        context: ModelContext
    ) throws {
        let descriptor = FetchDescriptor<PendingMutation>(
            predicate: #Predicate { $0.idempotencyKey == idempotencyKey }
        )
        if try !context.fetch(descriptor).isEmpty { return }
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
}

private struct IgnoredMutationResponse: Decodable, Sendable {
    init(from decoder: Decoder) throws {}
}

@MainActor
public enum OfflineStore {
    public static func container() -> ModelContainer {
        do {
            return try ModelContainer(for: PendingMutation.self)
        } catch {
            preconditionFailure("Unable to create native offline database: \(error)")
        }
    }
}
