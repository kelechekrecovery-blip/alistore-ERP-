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

    func testSignedInAccountUsesPrototypeSummaryAndGrid() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-in", "--ui-testing-account"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Покупатель"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["БОНУСЫ И УРОВЕНЬ"].exists)
        XCTAssertTrue(app.buttons["account-loyalty-card"].exists)
        XCTAssertTrue(app.staticTexts["Быстрый доступ"].exists)
        XCTAssertTrue(app.staticTexts["Мои заказы"].exists)
        XCTAssertTrue(app.staticTexts["Устройства"].exists)
        XCTAssertTrue(app.staticTexts["Trade-in"].exists)
        app.swipeUp()
        XCTAssertTrue(app.staticTexts["Офлайн"].exists)
    }

    func testSignedInAccountFixturesRenderLoyaltyAndReturns() {
        let loyaltyApp = launchSignedInAccount()
        loyaltyApp.buttons["account-loyalty-card"].tap()
        XCTAssertTrue(loyaltyApp.navigationBars["Бонусы"].waitForExistence(timeout: 5))
        XCTAssertTrue(loyaltyApp.staticTexts["БАЛАНС БОНУСОВ"].exists)
        XCTAssertTrue(loyaltyApp.staticTexts["уровень Gold · 1 бонус = 1 сом"].exists)
        XCTAssertTrue(loyaltyApp.staticTexts["ALI-GOLD"].exists)

        let returnsApp = launchSignedInAccount()
        returnsApp.staticTexts["Возвраты"].tap()
        XCTAssertTrue(returnsApp.navigationBars["Возвраты"].waitForExistence(timeout: 5))
        XCTAssertTrue(returnsApp.staticTexts["Не подошёл цвет устройства"].exists)
        XCTAssertTrue(returnsApp.staticTexts["На проверке"].exists)
    }

    func testSignedInAccountFixturesRenderAddressesAndSettings() {
        let addressesApp = launchSignedInAccount()
        addressesApp.staticTexts["Адреса"].tap()
        XCTAssertTrue(addressesApp.navigationBars["Адреса доставки"].waitForExistence(timeout: 5))
        XCTAssertTrue(addressesApp.staticTexts["Дом"].exists)
        XCTAssertTrue(addressesApp.staticTexts["По умолчанию"].exists)
        XCTAssertTrue(addressesApp.staticTexts["Бишкек, ул. Киевская, 125, кв. 42"].exists)

        let settingsApp = launchSignedInAccount()
        settingsApp.swipeUp()
        settingsApp.staticTexts["Настройки"].tap()
        XCTAssertTrue(settingsApp.navigationBars["Настройки"].waitForExistence(timeout: 5))
        XCTAssertTrue(settingsApp.staticTexts["Профиль"].exists)
        XCTAssertTrue(settingsApp.textFields["Имя"].value as? String == "Айбек")
        XCTAssertTrue(settingsApp.staticTexts["Push-уведомления"].exists)
        XCTAssertTrue(settingsApp.staticTexts["Сервисные сообщения"].exists)
    }

    func testSignedInAccountFixturesRenderDeviceAndWarranty() {
        let app = launchSignedInAccount()
        app.staticTexts["Устройства"].tap()
        XCTAssertTrue(app.navigationBars["Мои устройства"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["iPhone 15 128 GB Black"].exists)
        XCTAssertTrue(app.staticTexts["IMEI 352099999999001"].exists)

        app.buttons["Открыть гарантию для iPhone 15 128 GB Black"].tap()
        XCTAssertTrue(app.navigationBars["Гарантия"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Гарантийный талон"].exists)
        XCTAssertTrue(app.staticTexts["Активна"].exists)
        XCTAssertTrue(app.staticTexts["Обращение в сервис"].exists)
    }

    func testCheckoutUsesPrototypeStagesAndRequiresCustomerSession() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-guest", "--ui-testing-checkout"]
        app.launch()

        app.buttons["Корзина"].tap()
        XCTAssertTrue(app.staticTexts["Оформление"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Способ получения"].exists)
        XCTAssertTrue(app.staticTexts["Самовывоз"].exists)
        XCTAssertTrue(app.staticTexts["Курьер"].exists)
        XCTAssertTrue(app.staticTexts["Войдите, чтобы оформить заказ"].exists)
        XCTAssertFalse(app.buttons["Далее"].isEnabled)
    }

    private func launchSignedInAccount() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-in", "--ui-testing-account"]
        app.launch()
        XCTAssertTrue(app.staticTexts["Покупатель"].waitForExistence(timeout: 10))
        return app
    }
}
