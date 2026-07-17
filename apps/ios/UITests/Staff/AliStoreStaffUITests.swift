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
}
