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
    public var createdAt: Date

    public init(endpoint: String, method: String, body: Data, idempotencyKey: String = UUID().uuidString) {
        self.id = UUID()
        self.endpoint = endpoint
        self.method = method
        self.body = body
        self.idempotencyKey = idempotencyKey
        self.attempts = 0
        self.createdAt = Date()
    }
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
