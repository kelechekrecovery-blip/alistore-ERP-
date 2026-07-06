# AliStore · Business Invariants (нерушимые правила)

Правила, которые система обязана гарантировать на уровне сервера (не только UI). Нарушение = блок с 4xx + запись в audit.

1. **Нельзя вернуть деньги без платежа.** Refund возможен только при существующем payment record по заказу; сумма ≤ оплаченной.
2. **Нельзя продать один IMEI дважды.** DeviceUnit.imei unique; продажа только из статуса in_stock/reserved; sold → 409.
3. **Нельзя закрыть кассу без фактической сверки.** CashShift.close требует actual по каждому методу; при delta≠0 — обязательная причина.
4. **Нельзя завершить доставку с наличными, пока курьер не сдал деньги.** delivered с COD → pending cash handover; заказ не «закрыт по деньгам» до cash_handed_over.
5. **Нельзя списать товар без причины и approval.** writeoff требует reason + роль ≥ менеджер; запись в audit + Risk Center.
6. **Нельзя дать скидку ниже лимита маржи без approval.** margin = price − cost − bonus − discount ≥ minMargin, иначе → Approval Inbox.
7. **Нельзя оставить резерв без срока жизни.** Каждый reservation имеет expiresAt; истёкшие освобождаются.
8. **Нельзя принять trade-in без evidence.** Обязательны: фото, IMEI, проверка (краденое/iCloud), данные клиента, договор.
9. **Каждое опасное действие — с actorId и before/after в audit.** refund, discount, debt, writeoff, cash discrepancy, role change, delivery cash handover.
10. **Деньги/склад/заказ меняются в одной транзакции.** Никаких «статус поменялся, деньги потом».

Проверяется: unit-тестами переходов + встроенными самопроверками в прототипах процессов.
