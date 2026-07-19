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

    func testSignedInPOSSaleSplitAndReceiptShell() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-in", "--ui-testing-role=cashier"]
        app.launch()

        XCTAssertTrue(app.staticTexts["POS · Касса"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Смена открыта · azizbek · AliStore Центр"].exists)
        XCTAssertTrue(app.staticTexts["iPhone 15 128 ГБ Black"].exists)
        XCTAssertTrue(app.staticTexts["IP15-128-BLK"].exists)
        XCTAssertTrue(app.staticTexts["Каталог синхронизирован · 3 товара"].exists)

        app.buttons["pos-qty-plus-iphone-15-128"].tap()
        XCTAssertTrue(app.staticTexts["1 поз."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["iPhone 15 128 ГБ Black × 1"].exists)

        app.swipeUp()
        XCTAssertTrue(app.buttons["pos-sale-submit"].waitForExistence(timeout: 5))

        let split = app.textFields["Наличные в split (необязательно)"]
        XCTAssertTrue(split.exists)
        split.tap()
        split.typeText("10000")
        app.swipeUp()

        app.buttons["pos-sale-submit"].tap()

        XCTAssertTrue(app.staticTexts["POS-4102 · оплачено 109900 сом · Event Ledger"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Чек с сервера"].exists)
        let receipt = app.staticTexts["pos-receipt-markup"]
        XCTAssertTrue(receipt.exists)
        XCTAssertTrue(receipt.label.contains("AliStore POS"))
        XCTAssertTrue(receipt.label.contains("Оплата: cash=10000, card=99900"))
        XCTAssertTrue(app.buttons["Печать"].exists)
        XCTAssertTrue(app.staticTexts["ESC/POS сформирован; устройство требует отдельной сертификации"].exists)
    }

    func testSignedInPOSShiftExposesPushControl() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-in", "--ui-testing-role=cashier"]
        app.launch()

        XCTAssertTrue(app.staticTexts["POS · Касса"].waitForExistence(timeout: 10))
        app.buttons["Смена"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Смена"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Push"].exists)
        XCTAssertTrue(app.buttons["Включить уведомления"].exists)
    }

    func testPublicStoreVisualEvidence() {
        let app = XCUIApplication()
        app.launchArguments = [
            "--ui-testing-signed-in",
            "--ui-testing-role=cashier",
            "--ui-testing-visual-evidence",
        ]
        app.launch()

        XCTAssertTrue(app.staticTexts["POS · Касса"].waitForExistence(timeout: 10))
        capture(app, named: "pos-sale")

        app.buttons["Смена"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Смена"].waitForExistence(timeout: 5))
        capture(app, named: "pos-shift")

        app.buttons["Операции"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Операции"].waitForExistence(timeout: 5))
        capture(app, named: "pos-operations")
    }

    private func capture(_ app: XCUIApplication, named name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
