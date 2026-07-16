import XCTest

final class AliStorePOSUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testLaunchesPOSLogin() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-out"]
        app.launch()

        XCTAssertTrue(app.staticTexts["AliStore POS"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.textFields["Логин"].exists)
        XCTAssertTrue(app.secureTextFields["Пароль"].exists)
        XCTAssertTrue(app.buttons["Открыть кассу"].exists)
    }
}
