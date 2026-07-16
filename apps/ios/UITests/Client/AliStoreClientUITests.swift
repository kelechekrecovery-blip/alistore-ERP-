import XCTest

final class AliStoreClientUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testLaunchesClientShell() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-out"]
        app.launch()

        XCTAssertTrue(app.tabBars.buttons["Главная"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.tabBars.buttons["Каталог"].exists)
        XCTAssertTrue(app.tabBars.buttons["Корзина"].exists)
        XCTAssertTrue(app.tabBars.buttons["Кабинет"].exists)
    }
}
