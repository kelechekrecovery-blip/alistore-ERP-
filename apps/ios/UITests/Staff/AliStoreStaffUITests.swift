import XCTest

final class AliStoreStaffUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testLaunchesStaffLogin() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-out"]
        app.launch()

        XCTAssertTrue(app.staticTexts["AliStore Staff"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.textFields["Логин"].exists)
        XCTAssertTrue(app.secureTextFields["Пароль"].exists)
        XCTAssertTrue(app.buttons["Войти в рабочее место"].exists)
    }

    func testSignedInStaffHomeMatchesPrototypeShell() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-in"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Азизбек"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Продавец · AliStore Центр"].exists)
        XCTAssertTrue(app.staticTexts["Смена не открыта"].exists)
        XCTAssertTrue(app.buttons["Открыть смену"].exists)
        XCTAssertTrue(app.staticTexts["Быстрые действия"].exists)
        XCTAssertTrue(app.buttons["staff-home-orders"].exists)
        XCTAssertTrue(app.buttons["staff-home-add-product"].exists)
        XCTAssertTrue(app.buttons["staff-home-buyback"].exists)
        XCTAssertTrue(app.buttons["staff-home-kpi"].exists)
        XCTAssertTrue(app.staticTexts["ЗАДАЧА ОТ AI"].exists)
        XCTAssertTrue(app.tabBars.buttons["Главная"].exists)
        XCTAssertTrue(app.tabBars.buttons["Заказы"].exists)
        XCTAssertTrue(app.tabBars.buttons["KPI"].exists)
        XCTAssertTrue(app.tabBars.buttons["Скупка"].exists)
    }

    func testSignedInStaffCanUseQuickUnlockShell() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-in", "--ui-testing-quick-unlock"]
        app.launch()

        XCTAssertTrue(app.staticTexts["AliStore Staff"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["azizbek"].exists)
        XCTAssertTrue(app.staticTexts["PIN-код"].exists)
        XCTAssertTrue(app.secureTextFields["6 цифр"].exists)
        XCTAssertTrue(app.buttons["quick-unlock-pin-submit"].exists)
        XCTAssertTrue(app.buttons["Настроить PIN"].exists || app.buttons["Изменить PIN"].exists)
        XCTAssertTrue(app.buttons["Выйти из аккаунта"].exists)
    }

    func testSignedInStaffTasksMatchesPrototypeShell() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-in"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Азизбек"].waitForExistence(timeout: 10))
        app.buttons["staff-home-kpi"].tap()

        XCTAssertTrue(app.staticTexts["Задачи и KPI"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["KPI месяца"].exists)
        XCTAssertTrue(app.staticTexts["92%"].exists)
        XCTAssertTrue(app.staticTexts["Предлагать аксессуары к телефонам"].exists)
        XCTAssertTrue(app.staticTexts["Обновить ценники на витрине"].exists)
        XCTAssertTrue(app.staticTexts["Пройти тест по новым тарифам"].exists)
        XCTAssertTrue(app.staticTexts["Проверить остатки Apple Watch"].exists)
    }

    func testSignedInStaffOrdersMatchesPrototypeShell() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-in"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Азизбек"].waitForExistence(timeout: 10))
        app.buttons["staff-home-orders"].tap()

        XCTAssertTrue(app.staticTexts["Заказы"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["№4102"].exists)
        XCTAssertTrue(app.staticTexts["Новый"].exists)
        XCTAssertTrue(app.staticTexts["iPhone 15 ×1"].exists)
        XCTAssertTrue(app.buttons["Взять в работу"].exists)
        XCTAssertTrue(app.staticTexts["№4098"].exists)
        XCTAssertTrue(app.staticTexts["Сборка"].exists)
        XCTAssertTrue(app.staticTexts["AirPods ×2"].exists)
        XCTAssertTrue(app.buttons["Собрано → курьеру"].exists)
        XCTAssertTrue(app.staticTexts["№4090"].exists)
        XCTAssertTrue(app.staticTexts["Выдан"].exists)
        XCTAssertTrue(app.staticTexts["MacBook Air ×1"].exists)
    }

    func testSignedInStaffAddProductMatchesPrototypeShell() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-in"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Азизбек"].waitForExistence(timeout: 10))
        app.buttons["staff-home-add-product"].tap()

        XCTAssertTrue(app.staticTexts["Добавить товар"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Сканировать штрихкод / фото"].exists)
        app.buttons["Сканировать штрихкод / фото"].tap()

        XCTAssertTrue(app.staticTexts["Штрихкод распознан"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["🤖 AI заполнил карточку"].exists)
        XCTAssertTrue(app.staticTexts["iPhone 15 128 ГБ"].exists)
        XCTAssertTrue(app.staticTexts["109 900 сом"].exists)
        app.buttons["Отправить на модерацию"].tap()

        XCTAssertTrue(app.staticTexts["Товар отправлен на модерацию"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["4 870123 456789"].exists)
        XCTAssertTrue(app.buttons["🖨 Печать этикетки 40×40"].exists)
        XCTAssertTrue(app.buttons["Добавить ещё"].exists)
    }

    func testSignedInStaffBuybackMatchesPrototypeShell() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-in"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Азизбек"].waitForExistence(timeout: 10))
        app.buttons["staff-home-buyback"].tap()

        XCTAssertTrue(app.staticTexts["Скупка Б/У"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Проверьте по регламенту. Полный процесс — на экране «Скупка и договор»."].exists)
        XCTAssertTrue(app.staticTexts["Проверить IMEI по базе краденого"].exists)
        XCTAssertTrue(app.staticTexts["Осмотреть состояние, присвоить грейд"].exists)
        XCTAssertTrue(app.staticTexts["Сделать фото (4 ракурса)"].exists)
        XCTAssertTrue(app.staticTexts["Внести данные клиента и паспорт"].exists)
        XCTAssertTrue(app.staticTexts["Проверить чек/коробку/комплект"].exists)

        app.buttons["Проверить IMEI по базе краденого"].tap()
        app.buttons["Осмотреть состояние, присвоить грейд"].tap()
        app.buttons["Сделать фото (4 ракурса)"].tap()

        XCTAssertTrue(app.buttons["К договору купли-продажи →"].isEnabled)
    }

    func testSignedInStaffSupportMatchesPrototypeShell() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-in"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Азизбек"].waitForExistence(timeout: 10))
        app.buttons["staff-home-orders"].tap()
        XCTAssertTrue(app.staticTexts["Заказы"].waitForExistence(timeout: 5))
        app.buttons["Поддержка"].tap()

        XCTAssertTrue(app.staticTexts["Поддержка"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Support inbox"].exists)
        XCTAssertTrue(app.staticTexts["2"].exists)
        XCTAssertTrue(app.staticTexts["Где мой заказ №4102?"].exists)
        XCTAssertTrue(app.staticTexts["Клиент C-1042 · Telegram"].exists)
        XCTAssertTrue(app.staticTexts["Срочно"].exists == false)
        XCTAssertTrue(app.buttons["В работу"].exists)
        XCTAssertTrue(app.buttons["Эскалировать"].exists)
        XCTAssertTrue(app.staticTexts["Нужна гарантия по AirPods"].exists)

        app.buttons["staff-support-status-in_progress"].tap()
        XCTAssertTrue(app.staticTexts["VIP клиент просит обмен"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Срочно"].exists)
        XCTAssertFalse(app.buttons["Эскалировать"].exists)
    }

    func testSignedInStaffCustomer360MatchesPrototypeShell() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-in"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Азизбек"].waitForExistence(timeout: 10))
        app.buttons["staff-home-customer360"].tap()

        XCTAssertTrue(app.staticTexts["Customer 360"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.textFields["staff-customer360-search"].exists)
        XCTAssertTrue(app.staticTexts["Нурбек Алиев"].exists)
        XCTAssertTrue(app.staticTexts["+996 555 42 42 42"].exists)
        XCTAssertTrue(app.staticTexts["CONSENT"].exists)
        XCTAssertTrue(app.staticTexts["Gold"].exists)
        XCTAssertTrue(app.staticTexts["LTV"].exists)
        XCTAssertTrue(app.staticTexts["за всё время"].exists)
        XCTAssertTrue(app.staticTexts["Гарантия и сервис"].exists)
        XCTAssertTrue(app.staticTexts["356789104200777"].exists)
        XCTAssertTrue(app.staticTexts["Диагностика"].exists)
        XCTAssertTrue(app.buttons["Согласовать ремонт"].exists)
        XCTAssertTrue(app.staticTexts["Поддержка"].exists)
        XCTAssertTrue(app.staticTexts["Где мой заказ №4102?"].exists)
        XCTAssertTrue(app.staticTexts["Нужна гарантия по AirPods"].exists)
    }
}
