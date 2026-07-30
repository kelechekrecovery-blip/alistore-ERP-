package kg.alistore.core

/**
 * Email как второй канал входа в тот же аккаунт: телефон остаётся первичным
 * ключом Customer, а адрес лишь открывает дверь в уже существующий профиль.
 * Поэтому здесь нет «регистрации по почте» — только вход и привязка.
 */
data class EmailOtpChallenge(val challengeId: String, val devCode: String?)

/** Канал, выбранный на экране входа. */
enum class AuthChannel { Phone, Email }

private val EMAIL_PATTERN = Regex("^[^@\\s]+@[^@\\s.]+(\\.[^@\\s.]+)+$")
private const val EMAIL_MAX_LENGTH = 254
private const val OTP_LENGTH = 6
internal const val OTP_RESEND_DELAY_MILLIS = 60_000L

/**
 * Состояние формы входа/привязки по почте. Неизменяемое: каждый переход
 * возвращает новую копию, поэтому логику шагов можно проверять без Compose.
 */
data class EmailAuthForm(
  val email: String = "",
  val code: String = "",
  val codeSent: Boolean = false,
  val busy: Boolean = false,
  val error: String? = null,
  val hint: String? = null,
  val challengeId: String? = null,
  val resendAvailableAtMillis: Long? = null,
) {
  val emailValid: Boolean get() = email.length <= EMAIL_MAX_LENGTH && EMAIL_PATTERN.matches(email)
  val codeValid: Boolean get() = code.length == OTP_LENGTH && code.all(Char::isDigit)
  val canSubmit: Boolean get() = !busy && if (codeSent) codeValid else emailValid

  fun withEmail(raw: String): EmailAuthForm =
    copy(email = raw.trim().lowercase().take(EMAIL_MAX_LENGTH), error = null, hint = null)

  fun withCode(raw: String): EmailAuthForm =
    copy(code = raw.filter(Char::isDigit).take(OTP_LENGTH), error = null)

  fun submitting(): EmailAuthForm = copy(busy = true, error = null, hint = null)

  /** Код ушёл на адрес: переходим к шагу ввода, в dev-режиме подставляем эхо-код. */
  fun challengeIssued(
    challenge: EmailOtpChallenge,
    nowMillis: Long = System.currentTimeMillis(),
  ): EmailAuthForm = copy(
    busy = false,
    codeSent = true,
    code = challenge.devCode?.takeIf { it.length == OTP_LENGTH } ?: code,
    error = null,
    hint = "Код отправлен на $email",
    challengeId = challenge.challengeId,
    resendAvailableAtMillis = nowMillis + OTP_RESEND_DELAY_MILLIS,
  )

  fun resendSeconds(nowMillis: Long = System.currentTimeMillis()): Int {
    val deadline = resendAvailableAtMillis ?: return 0
    return ((deadline - nowMillis).coerceAtLeast(0) + 999).div(1_000).toInt()
  }

  fun failed(error: Throwable): EmailAuthForm =
    copy(busy = false, hint = null, error = emailAuthMessage(error))

  /** Успешное завершение (вход выполнен или адрес привязан). */
  fun confirmed(hint: String): EmailAuthForm =
    copy(
      busy = false,
      codeSent = false,
      code = "",
      error = null,
      hint = hint,
      challengeId = null,
      resendAvailableAtMillis = null,
    )

  /** «Изменить адрес» — возврат к первому шагу без потери введённой почты. */
  fun restart(): EmailAuthForm = copy(
    codeSent = false,
    code = "",
    error = null,
    hint = null,
    challengeId = null,
    resendAvailableAtMillis = null,
  )
}

/**
 * Человеческий русский текст для машинных кодов, которые отдаёт API
 * (`DomainError.code`). Без кода опираемся на HTTP-статус.
 */
fun emailAuthMessage(error: Throwable): String {
  val api = error as? ApiException ?: return when (error) {
    is java.io.IOException -> "Нет связи с сервером"
    else -> error.message?.takeIf(String::isNotBlank) ?: "Не удалось выполнить вход"
  }
  return when (api.code) {
    "email_invalid" -> "Некорректный адрес почты"
    "otp_not_found" -> "Код не найден или истёк. Запросите новый"
    "otp_invalid" -> "Неверный код. Проверьте цифры из письма"
    "otp_locked" -> "Слишком много попыток. Запросите новый код"
    "email_taken" -> "Этот адрес уже привязан к другому аккаунту"
    "customer_not_found" -> "Аккаунт с такой почтой не найден. Войдите по телефону и привяжите адрес"
    "email_transport_unavailable" -> "Отправка писем сейчас недоступна. Войдите по телефону"
    else -> when (api.status) {
      // 400 приходит от валидации DTO (`email must be an email`) — переводим сами.
      400 -> "Некорректный адрес почты"
      401, 403 -> "Сессия истекла, войдите заново"
      429 -> "Слишком часто. Подождите минуту и попробуйте снова"
      else -> api.message.takeIf(String::isNotBlank) ?: "Не удалось выполнить вход"
    }
  }
}

/** Нормализация адреса перед отправкой на сервер (сервер делает то же самое). */
internal fun String.normalizedEmail(): String = trim().lowercase()
