import AliStoreCore
import Foundation
import SwiftData
import XCTest

/**
 Регрессия POS-202: вторая офлайн-продажа исчезала молча.

 `OfflinePOSQueue.enqueue` при совпадении `clientSaleId` делал безусловный
 `return`, а экран кассы писал «Продажа сохранена офлайн». Совпадение ключа —
 это две очень разные ситуации, и разводить их обязательно:

 - **то же самое тело** — повтор отправки, очередь и должна остаться одной
   записью, это и есть идемпотентность;
 - **другое тело** — это уже следующий покупатель под тем же ключом. Раньше
   такая продажа не попадала никуда и никогда: строки в очереди нет, чека нет,
   а кассир прочитал «сохранено».

 Второй случай возникал не из-за экзотики: после офлайн-сохранения экран не
 ротировал `activeSaleId`, поэтому под одним ключом шли все последующие продажи
 подряд.
 */
final class OfflinePOSQueueTests: XCTestCase {
    /// Имя у каждого теста своё:in-memory хранилища с одинаковой конфигурацией
    /// разделяются внутри процесса, и записи одного теста доживали до соседнего.
    @MainActor
    private func makeContext() throws -> ModelContext {
        let schema = Schema(versionedSchema: OfflineSchemaV1.self)
        let container = try ModelContainer(
            for: schema,
            configurations: ModelConfiguration(
                "queue-tests-\(UUID().uuidString)",
                schema: schema,
                isStoredInMemoryOnly: true
            )
        )
        return ModelContext(container)
    }

    private func sale(id: String, qty: Int) -> POSSaleRequest {
        POSSaleRequest(
            point: "main",
            lines: [POSLine(productId: "iphone-15", sku: "IP15", price: 109_900, qty: qty)],
            payments: [POSTender(method: "cash", amount: 109_900 * qty)],
            discountPct: 0,
            clientSaleId: id,
            approvalId: nil
        )
    }

    private func queued(_ context: ModelContext) throws -> [PendingMutation] {
        try context.fetch(FetchDescriptor<PendingMutation>())
    }

    /// Повтор той же продажи — по-прежнему одна запись и без ошибки.
    @MainActor
    func testRepeatingTheSameSaleStaysIdempotent() throws {
        let context = try makeContext()
        try OfflinePOSQueue.enqueue(sale(id: "sale-1", qty: 1), context: context)
        try OfflinePOSQueue.enqueue(sale(id: "sale-1", qty: 1), context: context)

        XCTAssertEqual(try queued(context).count, 1)
    }

    /// Другая продажа под тем же ключом обязана громко отказать. Молчаливый
    /// пропуск здесь — это потеря выручки, которую никто уже не восстановит.
    @MainActor
    func testDifferentSaleUnderTheSameKeyIsRefusedLoudly() throws {
        let context = try makeContext()
        try OfflinePOSQueue.enqueue(sale(id: "sale-1", qty: 1), context: context)

        XCTAssertThrowsError(try OfflinePOSQueue.enqueue(sale(id: "sale-1", qty: 2), context: context)) { error in
            XCTAssertTrue(
                error is OfflineQueueError,
                "ожидалась доменная ошибка очереди, получено \(type(of: error))"
            )
        }
        // Первая продажа не пострадала: чужая ошибка не должна её трогать.
        XCTAssertEqual(try queued(context).count, 1)
    }

    /// Продажи с разными ключами копятся — это нормальная офлайн-смена.
    @MainActor
    func testDistinctSalesAccumulate() throws {
        let context = try makeContext()
        try OfflinePOSQueue.enqueue(sale(id: "sale-1", qty: 1), context: context)
        try OfflinePOSQueue.enqueue(sale(id: "sale-2", qty: 1), context: context)

        XCTAssertEqual(try queued(context).count, 2)
    }

    // MARK: - Чья продажа уходит на сервер

    /// Реплей шёл токеном того, кто вошёл сейчас: выручку и ответственность за
    /// продажу одного кассира леджер записывал на следующего.
    @MainActor
    func testForeignSaleIsNotReplayedUnderTheCurrentCashier() throws {
        let context = try makeContext()
        try OfflinePOSQueue.enqueue(sale(id: "sale-1", qty: 1), context: context, owner: "cashier-a")

        let mine = OfflinePOSQueue.replayable(try queued(context), owner: "cashier-b")
        XCTAssertTrue(mine.isEmpty, "продажа чужого кассира не должна уходить под моим токеном")

        let theirs = OfflinePOSQueue.replayable(try queued(context), owner: "cashier-a")
        XCTAssertEqual(theirs.count, 1, "своя продажа обязана отправиться")
    }

    /// Записи, сделанные до появления владельца, отправляет тот, кто есть, —
    /// иначе они не уйдут никогда.
    @MainActor
    func testOwnerlessLegacySaleIsStillReplayed() throws {
        let context = try makeContext()
        try OfflinePOSQueue.enqueue(sale(id: "sale-1", qty: 1), context: context)

        XCTAssertEqual(OfflinePOSQueue.replayable(try queued(context), owner: "cashier-b").count, 1)
    }

    /// Приложение могли убить посреди отправки. Такие записи раньше не
    /// переигрывались никогда: деньги стояли в очереди и не уходили.
    @MainActor
    func testSaleStuckInSyncingIsRetried() throws {
        let context = try makeContext()
        try OfflinePOSQueue.enqueue(sale(id: "sale-1", qty: 1), context: context, owner: "cashier-a")
        let mutation = try XCTUnwrap(try queued(context).first)
        mutation.state = "syncing"
        try context.save()

        XCTAssertEqual(OfflinePOSQueue.replayable(try queued(context), owner: "cashier-a").count, 1)
    }

    /// Конфликт и отказ — не для автоматического повтора: их разбирает человек.
    @MainActor
    func testConflictedSaleIsNotReplayedAutomatically() throws {
        let context = try makeContext()
        try OfflinePOSQueue.enqueue(sale(id: "sale-1", qty: 1), context: context, owner: "cashier-a")
        let mutation = try XCTUnwrap(try queued(context).first)
        mutation.state = "conflict"
        try context.save()

        XCTAssertTrue(OfflinePOSQueue.replayable(try queued(context), owner: "cashier-a").isEmpty)
    }
}
