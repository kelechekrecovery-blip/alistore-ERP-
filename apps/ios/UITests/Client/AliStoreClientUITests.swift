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
}
