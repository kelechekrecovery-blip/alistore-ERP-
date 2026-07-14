package kg.alistore.core

import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class StaffPushRouteTest {
  @Test fun routesOperationalDeepLinksToTheirNativeTabs() {
    assertEquals(StaffPushRoute(1, entityId = "order-1"), parseStaffPushRoute("alistore-staff://orders/order-1"))
    assertEquals(StaffPushRoute(2, entityId = "task-1"), parseStaffPushRoute("alistore-staff://tasks/task-1"))
    assertEquals(
      StaffPushRoute(5, entityId = "case-1", customerId = "customer-1"),
      parseStaffPushRoute("alistore-staff://warranty/case-1?customerId=customer-1"),
    )
    assertEquals(StaffPushRoute(4), parseStaffPushRoute("alistore-staff://account"))
    assertEquals(StaffPushRoute(4), parseStaffPushRoute("alistore-staff://attendance"))
    assertNull(parseStaffPushRoute("https://example.com/tasks/task-1"))
    assertNull(parseStaffPushRoute("alistore-staff://unknown/item-1"))
  }

  @Test fun routesOnlyCourierDeliveryDeepLinks() {
    assertEquals(
      CourierPushRoute("order/encoded"),
      parseCourierPushRoute("alistore-courier://deliveries/order%2Fencoded"),
    )
    assertNull(parseCourierPushRoute("alistore-courier://deliveries"))
    assertNull(parseCourierPushRoute("alistore-courier://orders/order-1"))
    assertNull(parseCourierPushRoute("https://example.com/deliveries/order-1"))
  }

  @Test fun pushRegistrationSendsTheFcmTokenUnderTheStoredStaffJwt() = runTest {
    var method = ""
    var authorization = ""
    var payload = JSONObject()
    val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
      createContext("/api/notifications/push-tokens") { exchange ->
        method = exchange.requestMethod
        authorization = exchange.requestHeaders.getFirst("Authorization")
        payload = JSONObject(exchange.requestBody.bufferedReader().use { it.readText() })
        val response = "{}".toByteArray()
        exchange.sendResponseHeaders(201, response.size.toLong())
        exchange.responseBody.use { it.write(response) }
      }
      start()
    }
    try {
      ApiClient("http://127.0.0.1:${server.address.port}/api").registerPushToken(
        "android-device-token_1234567890:APA91b-alistore",
        "android",
        "installation-1",
        "staff-token",
      )
    } finally {
      server.stop(0)
    }

    assertEquals("POST", method)
    assertEquals("Bearer staff-token", authorization)
    assertEquals("android-device-token_1234567890:APA91b-alistore", payload.getString("token"))
    assertEquals("android", payload.getString("platform"))
    assertEquals("installation-1", payload.getString("deviceId"))
    assertEquals("staff", payload.getString("scope"))
  }
}
