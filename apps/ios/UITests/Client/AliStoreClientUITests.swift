import XCTest

final class AliStoreClientUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testShowsPrototypeLoginShellWhenSignedOut() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-out"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Вход в AliStore"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.textFields["client-phone"].exists)
        XCTAssertTrue(app.buttons["Продолжить как гость →"].exists)
    }

    func testGuestShellUsesPrototypeNavigation() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-guest"]
        app.launch()

        XCTAssertTrue(app.buttons["Главная"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Каталог"].exists)
        XCTAssertTrue(app.buttons["Избранное"].exists)
        XCTAssertTrue(app.buttons["Корзина"].exists)
        XCTAssertTrue(app.buttons["Кабинет"].exists)
    }

    func testHeaderRoutesToSearchCompareAndNotifications() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-guest"]
        app.launch()

        app.buttons["Сравнение"].tap()
        XCTAssertTrue(app.navigationBars["Сравнение"].waitForExistence(timeout: 5))
        app.buttons["Закрыть"].tap()

        app.buttons["Уведомления"].tap()
        XCTAssertTrue(app.navigationBars["Уведомления"].waitForExistence(timeout: 5))
        app.buttons["Закрыть"].tap()

        let search = app.buttons["Поиск техники и брендов"]
        XCTAssertTrue(search.waitForExistence(timeout: 5))
        search.tap()
        XCTAssertTrue(app.navigationBars["Поиск"].waitForExistence(timeout: 5))
    }

    func testGuestAccountUsesClientShell() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-guest"]
        app.launch()

        app.buttons["Кабинет"].tap()
        XCTAssertTrue(app.navigationBars["Кабинет"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Войдите в кабинет"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Получить код"].exists)
    }
}
