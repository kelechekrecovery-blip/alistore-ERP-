package kg.alistore.client

import androidx.activity.ComponentActivity
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.Credential
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import kg.alistore.core.GoogleIdentityCredential
import kg.alistore.core.GoogleSignInProvider
import java.security.SecureRandom
import java.util.Base64

internal class GoogleCredentialSignInProvider(
  private val activity: ComponentActivity,
  override val serverClientId: String,
  private val credentialManager: CredentialManager = CredentialManager.create(activity),
  private val nonceFactory: () -> String = ::secureGoogleNonce,
) : GoogleSignInProvider {
  init {
    require(serverClientId.isNotBlank()) { "GOOGLE_WEB_CLIENT_ID is required" }
  }

  override suspend fun signIn(): GoogleIdentityCredential {
    val nonce = nonceFactory()
    val googleOption = GetSignInWithGoogleOption.Builder(serverClientId)
      .setNonce(nonce)
      .build()
    val request = GetCredentialRequest.Builder()
      .addCredentialOption(googleOption)
      .build()
    val credential = try {
      credentialManager.getCredential(activity, request).credential
    } catch (cancelled: GetCredentialCancellationException) {
      throw GoogleSignInCancelledException()
    }
    return parseGoogleCredential(credential, nonce)
  }

  override suspend fun clearCredentialState() {
    credentialManager.clearCredentialState(ClearCredentialStateRequest())
  }
}

internal fun parseGoogleCredential(credential: Credential, nonce: String): GoogleIdentityCredential {
  if (credential !is CustomCredential || credential.type != GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
    throw GoogleSignInException("Google вернул неподдерживаемый тип аккаунта")
  }
  val googleCredential = try {
    GoogleIdTokenCredential.createFrom(credential.data)
  } catch (_: GoogleIdTokenParsingException) {
    throw GoogleSignInException("Не удалось проверить ответ Google")
  }
  if (googleCredential.idToken.isBlank()) throw GoogleSignInException("Google не вернул токен аккаунта")
  return GoogleIdentityCredential(identityToken = googleCredential.idToken, nonce = nonce)
}

internal fun secureGoogleNonce(random: SecureRandom = SecureRandom()): String {
  val bytes = ByteArray(32)
  random.nextBytes(bytes)
  return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
}

internal open class GoogleSignInException(message: String) : IllegalStateException(message)
internal class GoogleSignInCancelledException : GoogleSignInException("Вход через Google отменён")
