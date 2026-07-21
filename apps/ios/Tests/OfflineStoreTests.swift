import AliStoreCore
import Foundation
import SwiftData
import XCTest

/**
 Регрессия POS-201: офлайн-хранилище не версионировано и падало насмерть.

 `OfflineStore.container()` создавал `ModelContainer(for: PendingMutation.self)`
 без `VersionedSchema` и `SchemaMigrationPlan`, а неудачу превращал в
 `preconditionFailure`. Два следствия, оба на деньгах:

 1. Любое изменение модели `PendingMutation` делает существующий store
    несовместимым. У кассира с непроведёнными продажами приложение перестаёт
    запускаться — а вместе с ним исчезает единственный след этих продаж.
 2. Даже без изменения модели повреждённый или недоступный файл базы означал
    падение на старте. Касса не открывается вовсе, вместо того чтобы работать
    в онлайне.

 Версионирование само по себе ничего не чинит, если сделано неаккуратно: имя
 сущности берётся из имени класса, а имя файла — из конфигурации. Поэтому
 `PendingMutation` остаётся top-level классом с прежним именем, и продовый
 контейнер не задаёт своё имя store. Первый тест это и стережёт.
 */
final class OfflineStoreTests: XCTestCase {
    private var directory: URL!

    override func setUpWithError() throws {
        directory = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("offline-store-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    /// Очередь, записанная прежней (неверсионированной) схемой, обязана открыться
    /// версионированной. Это тест на имя сущности: стоит вложить `PendingMutation`
    /// внутрь `OfflineSchemaV1` или переименовать класс — и накопленные продажи
    /// станут невидимыми, молча.
    @MainActor
    func testExistingQueueSurvivesVersionedSchema() throws {
        // Прямой сторож инварианта: имя сущности — это и есть ключ, по которому
        // SwiftData находит накопленные строки. Меняется имя — очередь исчезает.
        let entities = Schema(versionedSchema: OfflineSchemaV1.self).entities.map(\.name)
        XCTAssertEqual(entities, ["PendingMutation"], "имя сущности менять нельзя — осиротеют существующие очереди")

        let url = directory.appendingPathComponent("queue.store")

        let legacy = try ModelContainer(
            for: PendingMutation.self,
            configurations: ModelConfiguration(url: url)
        )
        let legacyContext = ModelContext(legacy)
        legacyContext.insert(PendingMutation(
            endpoint: "pos/sale",
            method: "POST",
            body: Data("{\"clientSaleId\":\"sale-1\"}".utf8),
            idempotencyKey: "sale-1"
        ))
        try legacyContext.save()

        let opened = OfflineStore.open(url: url)
        XCTAssertFalse(opened.isEphemeral, "рабочий store не должен уезжать в память: \(opened.failure ?? "-")")

        let context = ModelContext(opened.container)
        let survived = try context.fetch(FetchDescriptor<PendingMutation>())
        XCTAssertEqual(survived.count, 1, "непроведённая продажа исчезла при переходе на версионированную схему")
        XCTAssertEqual(survived.first?.idempotencyKey, "sale-1")
    }

    /// Непригодный файл базы больше не убивает приложение. Касса обязана
    /// открыться и работать в онлайне, а офлайн-приём — честно отключиться.
    @MainActor
    func testUnusableStoreDegradesInsteadOfCrashing() throws {
        let url = directory.appendingPathComponent("broken.store")
        try Data("это не база данных".utf8).write(to: url)

        let opened = OfflineStore.open(url: url)

        XCTAssertTrue(opened.isEphemeral, "повреждённый store обязан уводить очередь в память, а не ронять запуск")
        XCTAssertNotNil(opened.failure, "причину отказа нужно показать человеку, а не проглотить")
        // Файл не удаляем никогда: он может быть единственным следом продаж,
        // и его ещё можно вытащить руками.
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path), "файл базы удалять нельзя")

        // Контейнер обязан быть рабочим — иначе «деградация» это то же падение.
        let context = ModelContext(opened.container)
        context.insert(PendingMutation(
            endpoint: "pos/sale",
            method: "POST",
            body: Data("{}".utf8),
            idempotencyKey: "sale-2"
        ))
        XCTAssertNoThrow(try context.save())
    }
}
