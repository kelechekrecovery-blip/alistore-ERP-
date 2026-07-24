import Foundation

/// Гейт сдачи COD по курьерскому рейсу.
///
/// Вынесено из вью, потому что «когда курьер может сдать наличные» — это деньги:
/// баг в предикате кнопки запирал уже собранную наличность. Вью безусловно
/// блокировал сдачу при `collectedTotal != codTotal`, из-за чего частичный рейс
/// (одна доставка в рейсе провалилась — `codTotal` больше не сойдётся с собранным)
/// сдать было нельзя никогда, хотя сервер это разрешает при указанной причине.
public enum CODHandover {
    /// Нужна ли причина расхождения. Требуется при ЛЮБОМ расхождении: сумма сдачи
    /// ≠ ожидаемого COD по рейсу, ЛИБО собрано меньше ожидаемого (в рейсе была
    /// неудачная доставка). Причина — не блокер сдачи, а обязательное пояснение.
    public static func needsReason(amount: Int, collectedTotal: Int, codTotal: Int) -> Bool {
        amount != codTotal || collectedTotal != codTotal
    }

    /// Можно ли отправить сдачу. Расхождение само по себе сдачу НЕ блокирует —
    /// блокирует только отсутствие причины при расхождении (и невалидная сумма /
    /// занятость). Так частичный рейс закрывается с пояснением, а не зависает.
    public static func canSubmit(
        amount: Int?,
        collectedTotal: Int,
        codTotal: Int,
        reason: String,
        isBusy: Bool
    ) -> Bool {
        guard !isBusy, let amount else { return false }
        guard needsReason(amount: amount, collectedTotal: collectedTotal, codTotal: codTotal) else { return true }
        return !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
