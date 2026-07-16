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
}
