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

    func testCatalogUsesPrototypeFiltersAndSortControls() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-guest"]
        app.launch()

        app.buttons["Каталог"].tap()
        XCTAssertTrue(app.buttons["Категория: Все"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Только в наличии"].exists)
        XCTAssertTrue(app.buttons["Сортировка"].exists)
        XCTAssertTrue(app.staticTexts["Каталог"].exists)
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

    func testSignedInNotificationsUseCustomerInboxShell() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-in", "--ui-testing-account"]
        app.launch()

        app.buttons["Уведомления"].tap()
        XCTAssertTrue(app.navigationBars["Уведомления"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Заказ №4102 собирается"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Скоро передадим курьеру"].exists)
        XCTAssertTrue(app.staticTexts["Цена снизилась"].exists)
        XCTAssertTrue(app.staticTexts["Apple Watch S9 теперь дешевле на 5 000"].exists)
        XCTAssertTrue(app.staticTexts["Гарантия скоро истекает"].exists)
        XCTAssertTrue(app.staticTexts["Начислены бонусы"].exists)
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

        XCTAssertTrue(app.staticTexts["Нурбек"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["GOLD"].exists)
        XCTAssertTrue(app.staticTexts["Уровень Gold"].exists)
        XCTAssertTrue(app.staticTexts["4 820 бонусов"].exists)
        XCTAssertTrue(app.buttons["account-loyalty-card"].exists)
        XCTAssertTrue(app.staticTexts["Меню"].exists)
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
        XCTAssertTrue(loyaltyApp.staticTexts["Бонусы и купоны"].exists)
        XCTAssertTrue(loyaltyApp.staticTexts["Доступно бонусов"].exists)
        XCTAssertTrue(loyaltyApp.staticTexts["4,820"].exists || loyaltyApp.staticTexts["4 820"].exists)
        XCTAssertTrue(loyaltyApp.staticTexts["1 бонус = 1 сом · Gold-уровень"].exists)
        XCTAssertTrue(loyaltyApp.staticTexts["ALI-GOLD"].exists)
        XCTAssertTrue(loyaltyApp.staticTexts["DELIVERY-GOLD"].exists)

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
        XCTAssertTrue(addressesApp.staticTexts["основной"].exists)
        XCTAssertTrue(addressesApp.staticTexts["Бишкек, ул. Киевская, 125, кв. 42"].exists)
        XCTAssertTrue(addressesApp.buttons["+ Добавить адрес"].exists)

        let settingsApp = launchSignedInAccount()
        settingsApp.swipeUp()
        settingsApp.staticTexts["Настройки"].tap()
        XCTAssertTrue(settingsApp.navigationBars["Настройки"].waitForExistence(timeout: 5))
        XCTAssertTrue(settingsApp.staticTexts["Профиль"].exists)
        XCTAssertTrue(settingsApp.textFields["Имя"].value as? String == "Айбек")
        XCTAssertTrue(settingsApp.staticTexts["Push-уведомления"].exists)
        XCTAssertTrue(settingsApp.staticTexts["Сервисные сообщения"].exists)
    }

    func testSignedInSupportUsesPrototypeChannelsAndFaq() {
        let app = launchSignedInAccount()
        app.staticTexts["Поддержка"].tap()
        XCTAssertTrue(app.navigationBars["Поддержка"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["WhatsApp"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Telegram"].exists)
        XCTAssertTrue(app.staticTexts["Звонок"].exists)
        XCTAssertTrue(app.staticTexts["Частые вопросы"].exists)
        XCTAssertTrue(app.staticTexts["Как отследить заказ?"].exists)
        XCTAssertTrue(app.staticTexts["Условия возврата и обмена"].exists)
        XCTAssertTrue(app.buttons["support-open-form"].exists)

        app.buttons["support-open-form"].tap()
        XCTAssertTrue(app.textFields["support-subject"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["support-submit"].exists)
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

    func testSignedInAccountFixturesRenderEmptyStates() {
        let loyaltyApp = launchSignedInAccount(arguments: ["--ui-testing-account-empty"])
        loyaltyApp.buttons["account-loyalty-card"].tap()
        XCTAssertTrue(loyaltyApp.staticTexts["Бонусов пока нет"].waitForExistence(timeout: 5))

        let returnsApp = launchSignedInAccount(arguments: ["--ui-testing-account-empty"])
        returnsApp.staticTexts["Возвраты"].tap()
        XCTAssertTrue(returnsApp.staticTexts["Возвратов пока нет"].waitForExistence(timeout: 5))

        let addressesApp = launchSignedInAccount(arguments: ["--ui-testing-account-empty"])
        addressesApp.staticTexts["Адреса"].tap()
        XCTAssertTrue(addressesApp.staticTexts["Адресов пока нет"].waitForExistence(timeout: 5))

        let settingsApp = launchSignedInAccount(arguments: ["--ui-testing-account-empty"])
        settingsApp.swipeUp()
        settingsApp.staticTexts["Настройки"].tap()
        XCTAssertTrue(settingsApp.staticTexts["Настройки пока недоступны"].waitForExistence(timeout: 5))

        let devicesApp = launchSignedInAccount(arguments: ["--ui-testing-account-empty"])
        devicesApp.staticTexts["Устройства"].tap()
        XCTAssertTrue(devicesApp.staticTexts["Устройств пока нет"].waitForExistence(timeout: 5))
    }

    func testSignedInAccountFixturesRenderRetryableErrorState() {
        let loyaltyApp = launchSignedInAccount(arguments: ["--ui-testing-account-error"])
        loyaltyApp.buttons["account-loyalty-card"].tap()
        XCTAssertTrue(loyaltyApp.staticTexts["Данные временно недоступны"].waitForExistence(timeout: 5))
        XCTAssertTrue(loyaltyApp.buttons["Повторить"].exists)

        let devicesApp = launchSignedInAccount(arguments: ["--ui-testing-account-error"])
        devicesApp.staticTexts["Устройства"].tap()
        XCTAssertTrue(devicesApp.staticTexts["Устройства недоступны"].waitForExistence(timeout: 5))
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

    func testCartRendersItemsQuantityAndCheckoutEntry() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-guest", "--ui-testing-cart"]
        app.launch()

        app.buttons["Корзина"].tap()
        XCTAssertTrue(app.staticTexts["Корзина"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["cart-checkout-button"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Итого"].exists)

        app.buttons["cart-checkout-button"].tap()
        XCTAssertTrue(app.staticTexts["Оформление"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Способ получения"].exists)
    }

    func testPaymentResultUsesPrototypeActionsAndReturnsToCatalog() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-guest", "--ui-testing-payment-result"]
        app.launch()

        app.buttons["Корзина"].tap()
        XCTAssertTrue(app.staticTexts["payment-result-title"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Заказ оформлен"].exists)
        XCTAssertTrue(app.buttons["payment-track-button"].exists)

        app.buttons["payment-catalog-button"].tap()
        XCTAssertTrue(app.buttons["Каталог"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Каталог"].exists)
    }

    func testPaymentResultShowsFailureRecoveryActions() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-guest", "--ui-testing-payment-failure"]
        app.launch()

        app.buttons["Корзина"].tap()
        XCTAssertTrue(app.staticTexts["payment-result-title"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Оплата не прошла"].exists)
        XCTAssertTrue(app.buttons["payment-retry-button"].exists)
        XCTAssertTrue(app.buttons["payment-support-button"].exists)

        app.buttons["payment-support-button"].tap()
        XCTAssertTrue(app.navigationBars["Поддержка"].waitForExistence(timeout: 5))
    }

    func testClientPrototypeVisualEvidence() {
        let home = launchGuest()
        capture(home, named: "client-home")

        home.buttons["Каталог"].tap()
        XCTAssertTrue(home.staticTexts["Каталог"].waitForExistence(timeout: 5))
        capture(home, named: "client-catalog")

        let productCard = home.buttons["client-product-ui-product-iphone"]
        XCTAssertTrue(productCard.waitForExistence(timeout: 5))
        productCard.tap()
        XCTAssertTrue(home.staticTexts["iPhone 17 Pro Max"].waitForExistence(timeout: 5))
        capture(home, named: "client-product-detail")

        let cart = XCUIApplication()
        cart.launchArguments = ["--ui-testing-signed-out", "--ui-testing-guest", "--ui-testing-cart", "--ui-testing-visual-evidence"]
        cart.launch()
        cart.buttons["Корзина"].tap()
        XCTAssertTrue(cart.staticTexts["Корзина"].waitForExistence(timeout: 10))
        capture(cart, named: "client-cart")

        let account = launchSignedInAccount()
        capture(account, named: "client-account")

        let payment = XCUIApplication()
        payment.launchArguments = ["--ui-testing-signed-out", "--ui-testing-guest", "--ui-testing-payment-result", "--ui-testing-visual-evidence"]
        payment.launch()
        payment.buttons["Корзина"].tap()
        XCTAssertTrue(payment.staticTexts["payment-result-title"].waitForExistence(timeout: 10))
        capture(payment, named: "client-payment-success")

        let failure = XCUIApplication()
        failure.launchArguments = ["--ui-testing-signed-out", "--ui-testing-guest", "--ui-testing-payment-failure", "--ui-testing-visual-evidence"]
        failure.launch()
        failure.buttons["Корзина"].tap()
        XCTAssertTrue(failure.staticTexts["Оплата не прошла"].waitForExistence(timeout: 10))
        capture(failure, named: "client-payment-failure")
    }

    private func launchSignedInAccount() -> XCUIApplication {
        launchSignedInAccount(arguments: [])
    }

    private func launchSignedInAccount(arguments: [String]) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-in", "--ui-testing-account"] + arguments
        app.launch()
        XCTAssertTrue(app.staticTexts["Нурбек"].waitForExistence(timeout: 10))
        return app
    }

    private func launchGuest() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-testing-signed-out", "--ui-testing-guest", "--ui-testing-visual-evidence"]
        app.launch()
        XCTAssertTrue(app.buttons["Главная"].waitForExistence(timeout: 10))
        return app
    }

    private func capture(_ app: XCUIApplication, named name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
