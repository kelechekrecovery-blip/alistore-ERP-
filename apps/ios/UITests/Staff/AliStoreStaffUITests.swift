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
}
