import Foundation
import Observation

/// Результат инвентаризации, как его вернул сервер (`inventory.service.ts` → count).
/// `diff` считает сервер — клиент только показывает, не пересчитывает: расхождение
/// это деньги, и второй источник истины здесь недопустим.
public struct InventoryCountResult: Decodable, Sendable {
    public let productId: String
    public let location: String
    public let expected: Int
    public let counted: Int
    public let diff: Int
    public let movementId: String
}

private struct InventoryCountRequest: Encodable, Sendable {
    let productId: String
    let location: String
    let counted: Int
}

/// Ответ `POST inventory/movements` — списание всегда идёт через одобрение
/// (`inventory.service.ts` → approvals.request), поэтому это не «списано», а
/// «поставлено в очередь на одобрение».
public struct InventoryApproval: Decodable, Sendable {
    public let approvalId: String
    public let status: String
}

private struct InventoryWriteOffRequest: Encodable, Sendable {
    let productId: String
    let qty: Int
    let type = "write_off"
    let location: String
    let reason: String
}

/// Инвентаризация для Staff-приложения: пересчёт остатка по товару и точке.
///
/// Право `inventory:count` есть у ролей warehouse/admin/owner, но не у seller —
/// поэтому демо-учётка ревьюера Apple для этого экрана должна быть warehouse,
/// иначе сервер ответит 403 и экран будет выглядеть сломанным.
@MainActor
@Observable
public final class StaffInventoryStore {
    public private(set) var isSubmitting = false
    public private(set) var errorMessage: String?
    public private(set) var lastResult: InventoryCountResult?
    public private(set) var lastApproval: InventoryApproval?

    private let api: APIClient
    private let token: String

    public init(environment: AppEnvironment, token: String, session: URLSession = .shared) {
        self.api = APIClient(baseURL: environment.apiBaseURL, session: session)
        self.token = token
    }

    /// Списание количественного товара. Возвращает заявку на одобрение, а не
    /// факт списания: сток уменьшится только после того, как одобрение пройдёт.
    @discardableResult
    public func writeOff(productId: String, location: String, qty: Int, reason: String) async -> InventoryApproval? {
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            let approval: InventoryApproval = try await api.post(
                "inventory/movements",
                body: InventoryWriteOffRequest(productId: productId, qty: qty, location: location, reason: reason),
                token: token
            )
            lastApproval = approval
            return approval
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    @discardableResult
    public func count(productId: String, location: String, counted: Int) async -> InventoryCountResult? {
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            let result: InventoryCountResult = try await api.post(
                "inventory/count",
                body: InventoryCountRequest(productId: productId, location: location, counted: counted),
                token: token
            )
            lastResult = result
            return result
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }
}
