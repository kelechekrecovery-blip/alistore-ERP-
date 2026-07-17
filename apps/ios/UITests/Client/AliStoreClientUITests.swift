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

    func testSignedInOrderStatusUsesPrototypeActions() {
        let app = launchSignedInAccount()
        app.staticTexts["Мои заказы"].tap()
        XCTAssertTrue(app.navigationBars["Мои заказы"].waitForExistence(timeout: 5))
        let orderCard = app.descendants(matching: .any)["client-order-card-ui-order-2401"]
        XCTAssertTrue(orderCard.waitForExistence(timeout: 5))

        orderCard.tap()
        XCTAssertTrue(app.staticTexts["Заказ №4102"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Заказ создан"].exists)
        XCTAssertTrue(app.staticTexts["Оплата подтверждена"].exists)
        XCTAssertTrue(app.staticTexts["Собираем заказ"].exists)
        XCTAssertTrue(app.buttons["order-status-receipt"].exists)
        XCTAssertTrue(app.buttons["order-status-warranty"].exists)
        XCTAssertTrue(app.buttons["order-status-whatsapp"].exists)
        XCTAssertTrue(app.buttons["order-status-cancel"].exists)
        XCTAssertTrue(app.buttons["order-status-repeat"].exists)

        app.buttons["order-status-repeat"].tap()
        XCTAssertTrue(app.staticTexts["Товары добавлены в корзину"].waitForExistence(timeout: 5))
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
        XCTAssertTrue(returnsApp.staticTexts["Возврат товара"].waitForExistence(timeout: 5))
        XCTAssertTrue(returnsApp.staticTexts["iPhone 15 128 GB Black"].exists)
        XCTAssertTrue(returnsApp.staticTexts["Заявка принята"].exists)
        XCTAssertTrue(returnsApp.staticTexts["Проверка товара"].exists)
        XCTAssertTrue(returnsApp.staticTexts["Возврат денег"].exists)
        XCTAssertTrue(returnsApp.staticTexts["Причина возврата"].exists)
        XCTAssertTrue(returnsApp.staticTexts["Не подошёл цвет устройства"].exists)
        XCTAssertTrue(returnsApp.staticTexts["На проверке"].exists)
    }

    func testSignedInReturnRequestUsesPrototypeForm() {
        let app = launchSignedInAccount()
        app.staticTexts["Возвраты"].tap()
        XCTAssertTrue(app.navigationBars["Возвраты"].waitForExistence(timeout: 5))
        app.buttons["Оформить возврат"].tap()

        XCTAssertTrue(app.navigationBars["Оформить возврат"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Возврат товара"].exists)
        XCTAssertTrue(app.staticTexts["Выберите товар из заказа №4102"].exists)
        XCTAssertTrue(app.staticTexts["AirPods Pro 2"].exists)
        XCTAssertTrue(app.staticTexts["24 900 сом"].exists)
        XCTAssertTrue(app.staticTexts["Причина возврата"].exists)
        XCTAssertTrue(app.buttons["return-reason-Не подошёл цвет"].exists)
        XCTAssertTrue(app.staticTexts["return-photo-placeholder"].exists)
        XCTAssertTrue(app.buttons["return-submit"].exists)
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

    func testSignedInTradeInUsesPrototypeEstimator() {
        let app = launchSignedInAccount()
        app.staticTexts["Trade-in"].tap()
        XCTAssertTrue(app.navigationBars["Trade-in"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Trade-in оценка"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Оцените старое устройство за 30 секунд"].exists)
        XCTAssertTrue(app.staticTexts["iPhone 13 · 128 ГБ"].exists)
        XCTAssertTrue(app.buttons["tradein-condition-1"].exists)
        XCTAssertTrue(app.staticTexts["tradein-photo-placeholder"].exists)
        XCTAssertTrue(app.buttons["tradein-evaluate"].exists)

        app.buttons["tradein-evaluate"].tap()
        XCTAssertTrue(app.staticTexts["Предварительная оценка"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["28 000–32 000"].exists)
        XCTAssertTrue(app.buttons["tradein-open-request"].exists)
        XCTAssertTrue(app.buttons["tradein-save-request"].exists)
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
        XCTAssertTrue(app.staticTexts["iPhone 15 · 128 ГБ"].exists)
        XCTAssertTrue(app.staticTexts["Активна"].exists)
        XCTAssertTrue(app.staticTexts["Обращение в сервис"].exists)
        XCTAssertTrue(app.buttons["warranty-open-service"].exists)
        XCTAssertTrue(app.buttons["warranty-receipt"].exists)
        XCTAssertTrue(app.staticTexts["Что покрывается"].exists)
        XCTAssertTrue(app.staticTexts["✓ Заводской брак\n✓ Неисправности экрана, батареи\n✗ Механические повреждения, влага"].exists)
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

        let search = launchGuest()
        let searchButton = search.buttons["Поиск техники и брендов"]
        XCTAssertTrue(searchButton.waitForExistence(timeout: 5))
        searchButton.tap()
        XCTAssertTrue(search.navigationBars["Поиск"].waitForExistence(timeout: 5))
        XCTAssertTrue(search.staticTexts["Популярные запросы"].waitForExistence(timeout: 5))
        capture(search, named: "client-search")

        let cart = XCUIApplication()
        cart.launchArguments = ["--ui-testing-signed-out", "--ui-testing-guest", "--ui-testing-cart", "--ui-testing-visual-evidence"]
        cart.launch()
        cart.buttons["Корзина"].tap()
        XCTAssertTrue(cart.staticTexts["Корзина"].waitForExistence(timeout: 10))
        capture(cart, named: "client-cart")

        let account = launchSignedInAccount()
        capture(account, named: "client-account")

        let orderStatus = launchSignedInAccount()
        orderStatus.staticTexts["Мои заказы"].tap()
        XCTAssertTrue(orderStatus.navigationBars["Мои заказы"].waitForExistence(timeout: 5))
        let orderCard = orderStatus.descendants(matching: .any)["client-order-card-ui-order-2401"]
        XCTAssertTrue(orderCard.waitForExistence(timeout: 5))
        orderCard.tap()
        XCTAssertTrue(orderStatus.staticTexts["Заказ №4102"].waitForExistence(timeout: 5))
        XCTAssertTrue(orderStatus.buttons["order-status-repeat"].waitForExistence(timeout: 5))
        capture(orderStatus, named: "client-order-status")

        let notifications = launchSignedInAccount()
        notifications.buttons["Уведомления"].tap()
        XCTAssertTrue(notifications.navigationBars["Уведомления"].waitForExistence(timeout: 5))
        XCTAssertTrue(notifications.staticTexts["Заказ №4102 собирается"].waitForExistence(timeout: 5))
        capture(notifications, named: "client-notifications")

        let loyalty = launchSignedInAccount()
        loyalty.buttons["account-loyalty-card"].tap()
        XCTAssertTrue(loyalty.navigationBars["Бонусы"].waitForExistence(timeout: 5))
        XCTAssertTrue(loyalty.staticTexts["Бонусы и купоны"].waitForExistence(timeout: 5))
        capture(loyalty, named: "client-loyalty")

        let returns = launchSignedInAccount()
        returns.staticTexts["Возвраты"].tap()
        XCTAssertTrue(returns.navigationBars["Возвраты"].waitForExistence(timeout: 5))
        XCTAssertTrue(returns.staticTexts["Возврат товара"].waitForExistence(timeout: 5))
        capture(returns, named: "client-returns")

        let support = launchSignedInAccount()
        support.staticTexts["Поддержка"].tap()
        XCTAssertTrue(support.navigationBars["Поддержка"].waitForExistence(timeout: 5))
        XCTAssertTrue(support.staticTexts["WhatsApp"].waitForExistence(timeout: 5))
        capture(support, named: "client-support")

        let tradeIn = launchSignedInAccount()
        tradeIn.staticTexts["Trade-in"].tap()
        XCTAssertTrue(tradeIn.navigationBars["Trade-in"].waitForExistence(timeout: 5))
        XCTAssertTrue(tradeIn.buttons["tradein-evaluate"].waitForExistence(timeout: 5))
        tradeIn.buttons["tradein-evaluate"].tap()
        XCTAssertTrue(tradeIn.staticTexts["Предварительная оценка"].waitForExistence(timeout: 5))
        capture(tradeIn, named: "client-trade-in")

        let warranty = launchSignedInAccount()
        warranty.staticTexts["Устройства"].tap()
        XCTAssertTrue(warranty.navigationBars["Мои устройства"].waitForExistence(timeout: 5))
        XCTAssertTrue(warranty.buttons["Открыть гарантию для iPhone 15 128 GB Black"].waitForExistence(timeout: 5))
        warranty.buttons["Открыть гарантию для iPhone 15 128 GB Black"].tap()
        XCTAssertTrue(warranty.navigationBars["Гарантия"].waitForExistence(timeout: 5))
        XCTAssertTrue(warranty.staticTexts["Гарантийный талон"].waitForExistence(timeout: 5))
        capture(warranty, named: "client-warranty")

        let addresses = launchSignedInAccount()
        addresses.staticTexts["Адреса"].tap()
        XCTAssertTrue(addresses.navigationBars["Адреса доставки"].waitForExistence(timeout: 5))
        XCTAssertTrue(addresses.staticTexts["Бишкек, ул. Киевская, 125, кв. 42"].waitForExistence(timeout: 5))
        capture(addresses, named: "client-addresses")

        let settings = launchSignedInAccount()
        settings.swipeUp()
        settings.staticTexts["Настройки"].tap()
        XCTAssertTrue(settings.navigationBars["Настройки"].waitForExistence(timeout: 5))
        XCTAssertTrue(settings.staticTexts["Push-уведомления"].waitForExistence(timeout: 5))
        capture(settings, named: "client-settings")

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
