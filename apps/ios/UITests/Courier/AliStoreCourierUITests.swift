import XCTest

final class AliStoreCourierUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testLaunchesCourierLogin() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-out"]
        app.launch()

        XCTAssertTrue(app.staticTexts["AliStore Courier"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.textFields["Логин"].exists)
        XCTAssertTrue(app.secureTextFields["Пароль"].exists)
        XCTAssertTrue(app.buttons["Войти в рабочее место"].exists)
    }

    func testSignedInCourierRouteAndCODShell() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-in", "--ui-testing-role=courier"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Мой маршрут"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["2 активных доставок"].exists)
        XCTAssertTrue(app.staticTexts["Айбек Маматов"].exists)
        XCTAssertTrue(app.buttons["Начать доставку"].exists)
        XCTAssertTrue(app.staticTexts["Элина Осмонова"].exists)
        XCTAssertTrue(app.staticTexts["Evidence доставки"].exists)
        XCTAssertTrue(app.buttons["Доставлено · 45900 сом"].exists)

        app.tabBars.buttons["COD"].tap()

        XCTAssertTrue(app.staticTexts["Сверка COD"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Офлайн-команд: 0"].exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Рейс")).firstMatch.exists)
        XCTAssertTrue(app.buttons["Сдать COD"].exists)
    }
}
