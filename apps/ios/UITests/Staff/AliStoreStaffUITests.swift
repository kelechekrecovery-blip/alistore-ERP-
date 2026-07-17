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
}
