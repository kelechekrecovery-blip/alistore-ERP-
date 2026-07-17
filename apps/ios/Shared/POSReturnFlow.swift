import Foundation

/// Return-status actions offered at the POS. Mirrors the Android POS mapping
/// (PosOperationsScreens.kt) against the API state machine in
/// apps/api/src/returns/returns.service.ts (RETURN_TRANSITIONS).
/// Note: the API sets `paid` only via the executed refund and allows
/// paid → reconciled solely with a restock location, so a rejected
/// transition surfaces the server message to the cashier.
public enum POSReturnFlow {
    public static func nextStatuses(for status: String) -> [String] {
        switch status {
        case "requested": return ["under_review", "rejected"]
        case "under_review": return ["approved", "rejected"]
        case "approved": return ["processing", "rejected"]
        case "paid": return ["reconciled"]
        default: return []
        }
    }

    public static func actionLabel(for status: String) -> String {
        switch status {
        case "under_review": return "Проверка"
        case "approved": return "Одобрить"
        case "rejected": return "Отклонить"
        case "processing": return "Принять"
        case "reconciled": return "Сверить"
        default: return status
        }
    }
}
