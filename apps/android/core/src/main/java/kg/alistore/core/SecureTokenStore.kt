package kg.alistore.core

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow

data class SecureSessionSnapshot(
  val accessToken: String,
  val refreshToken: String?,
  val queueOwner: QueueOwner,
  val generation: Long,
)

class SecureTokenStore(context: Context, private val alias: String) : SessionStore, StaffSessionStore {
  private val preferences = context.getSharedPreferences("secure-session", Context.MODE_PRIVATE)
  override val sessionChanges: Flow<Unit> = changesFor(alias)

  fun save(token: String) {
    saveEncrypted(token)
  }

  override fun saveSession(tokens: AuthTokens) {
    saveEncrypted(JSONObject().put("accessToken", tokens.accessToken).put("refreshToken", tokens.refreshToken).toString())
  }

  override fun saveAuthenticatedSession(tokens: AuthTokens, principalId: String) {
    saveAuthenticated(
      JSONObject().put("accessToken", tokens.accessToken).put("refreshToken", tokens.refreshToken).toString(),
      principalId,
    )
  }

  private fun saveEncrypted(value: String) {
    synchronized(sessionLock) {
      val encrypted = encrypt(value)
      preferences.edit()
        .putString(TOKEN, encrypted.first)
        .putString(IV, encrypted.second)
        .remove(PRINCIPAL_ID)
        .putLong(GENERATION, nextGeneration())
        .commit()
      notifyChanged()
    }
  }

  private fun saveAuthenticated(value: String, principalId: String) {
    val owner = QueueOwner.fromStorageKey(principalId)
    synchronized(sessionLock) {
      val authenticatedValue = JSONObject()
        .put(SESSION_VALUE, value)
        .put(SESSION_PRINCIPAL_ID, owner.storageKey)
        .toString()
      val encrypted = encrypt(authenticatedValue)
      preferences.edit()
        .putString(TOKEN, encrypted.first)
        .putString(IV, encrypted.second)
        .putString(PRINCIPAL_ID, owner.storageKey)
        .putLong(GENERATION, nextGeneration())
        .commit()
      notifyChanged()
    }
  }

  private fun encrypt(value: String): Pair<String, String> {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val encrypted = cipher.doFinal(value.toByteArray())
    return Base64.encodeToString(encrypted, Base64.NO_WRAP) to
      Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
  }

  fun read(): String? {
    val value = readEncrypted() ?: return null
    return runCatching { JSONObject(value).getString("accessToken") }.getOrDefault(value)
  }

  override fun readSession(): AuthTokens? {
    val value = readEncrypted() ?: return null
    return runCatching {
      val json = JSONObject(value)
      AuthTokens(json.getString("accessToken"), json.getString("refreshToken"))
    }.getOrElse {
      clear()
      null
    }
  }

  override fun readStaffSessionSnapshot(): SecureSessionSnapshot? = readSessionSnapshot("staff")

  override fun replaceStaffSession(
    snapshot: SecureSessionSnapshot,
    tokens: AuthTokens,
  ): SecureSessionSnapshot? = replaceSession(snapshot, tokens)

  fun readSessionSnapshot(expectedNamespace: String): SecureSessionSnapshot? = synchronized(sessionLock) {
    val values = preferences.all
    val encrypted = values[TOKEN] as? String ?: return@synchronized null
    val iv = values[IV] as? String ?: return@synchronized null
    val owner = (values[PRINCIPAL_ID] as? String)
      ?.let { runCatching { QueueOwner.fromStorageKey(it) }.getOrNull() }
      ?.takeIf { it.namespace == expectedNamespace }
    if (owner == null) {
      clear()
      return@synchronized null
    }
    val decrypted = decrypt(encrypted, iv) ?: return@synchronized null
    val value = authenticatedValue(decrypted, owner.storageKey, requireBoundOwner = true)
    if (value == null) {
      clear()
      return@synchronized null
    }
    val tokens = runCatching {
      val json = JSONObject(value)
      json.getString("accessToken") to json.optString("refreshToken").takeIf(String::isNotBlank)
    }.getOrDefault(value to null)
    SecureSessionSnapshot(tokens.first, tokens.second, owner, values.generation())
  }

  override fun isCurrent(snapshot: SecureSessionSnapshot): Boolean = synchronized(sessionLock) {
    val values = preferences.all
    values.generation() == snapshot.generation &&
      values[PRINCIPAL_ID] == snapshot.queueOwner.storageKey
  }

  fun replaceSession(
    snapshot: SecureSessionSnapshot,
    tokens: AuthTokens,
  ): SecureSessionSnapshot? = synchronized(sessionLock) {
    if (!isCurrent(snapshot)) return@synchronized null
    saveAuthenticatedSession(tokens, snapshot.queueOwner.storageKey)
    readSessionSnapshot(snapshot.queueOwner.namespace)
  }

  private fun readEncrypted(): String? {
    return synchronized(sessionLock) {
      val values = preferences.all
      val encrypted = values[TOKEN] as? String ?: return@synchronized null
      val iv = values[IV] as? String ?: return@synchronized null
      val decrypted = decrypt(encrypted, iv) ?: return@synchronized null
      authenticatedValue(decrypted, values[PRINCIPAL_ID] as? String, requireBoundOwner = false)
        ?: run { clear(); null }
    }
  }

  private fun decrypt(encrypted: String, iv: String): String? {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
    return runCatching { String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP))) }
      .getOrElse { clear(); null }
  }

  private fun authenticatedValue(
    decrypted: String,
    expectedPrincipalId: String?,
    requireBoundOwner: Boolean,
  ): String? {
    val json = runCatching { JSONObject(decrypted) }.getOrNull()
      ?: return decrypted.takeUnless { requireBoundOwner }
    if (!json.has(SESSION_VALUE)) return decrypted.takeUnless { requireBoundOwner }
    if (expectedPrincipalId.isNullOrBlank()) return null
    if (json.optString(SESSION_PRINCIPAL_ID) != expectedPrincipalId) return null
    return json.getString(SESSION_VALUE)
  }

  override fun clear() {
    synchronized(sessionLock) {
      val generation = nextGeneration()
      preferences.edit().clear().putLong(GENERATION, generation).commit()
      notifyChanged()
    }
  }

  private fun nextGeneration(): Long = preferences.getLong(GENERATION, 0L) + 1L

  private fun notifyChanged() { changesFor(alias).tryEmit(Unit) }

  private fun Map<String, *>.generation(): Long = (get(GENERATION) as? Long) ?: 0L

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    return generator.generateKey()
  }

  private companion object {
    const val TRANSFORMATION = "AES/GCM/NoPadding"
    const val TOKEN = "token"
    const val IV = "iv"
    const val PRINCIPAL_ID = "principal_id"
    const val GENERATION = "generation"
    const val SESSION_VALUE = "session_value"
    const val SESSION_PRINCIPAL_ID = "session_principal_id"
    val sessionLock = Any()
    val sessionChanges = ConcurrentHashMap<String, MutableSharedFlow<Unit>>()
    fun changesFor(alias: String): MutableSharedFlow<Unit> =
      sessionChanges.getOrPut(alias) { MutableSharedFlow(extraBufferCapacity = 16) }
  }
}
