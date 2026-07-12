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

class SecureTokenStore(context: Context, private val alias: String) : SessionStore {
  private val preferences = context.getSharedPreferences("secure-session", Context.MODE_PRIVATE)

  fun save(token: String) {
    saveEncrypted(token)
  }

  override fun saveSession(tokens: AuthTokens) {
    saveEncrypted(JSONObject().put("accessToken", tokens.accessToken).put("refreshToken", tokens.refreshToken).toString())
  }

  private fun saveEncrypted(value: String) {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val encrypted = cipher.doFinal(value.toByteArray())
    preferences.edit()
      .putString("token", Base64.encodeToString(encrypted, Base64.NO_WRAP))
      .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
      .apply()
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

  private fun readEncrypted(): String? {
    val encrypted = preferences.getString("token", null) ?: return null
    val iv = preferences.getString("iv", null) ?: return null
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
    return runCatching { String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP))) }
      .getOrElse { clear(); null }
  }

  override fun clear() { preferences.edit().clear().apply() }

  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(alias, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
    generator.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    return generator.generateKey()
  }

  private companion object { const val TRANSFORMATION = "AES/GCM/NoPadding" }
}
