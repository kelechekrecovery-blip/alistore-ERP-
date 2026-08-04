package kg.alistore.core

interface PushRegistrationGateway {
  suspend fun registerPushToken(token: String, platform: String, deviceId: String, accessToken: String)
}

fun interface StaffPushRegistrar {
  suspend fun register(session: StaffSession)
}

fun interface ClientPushRegistrar {
  suspend fun register(session: AuthState.SignedIn)
}
