package kg.alistore.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class EmailAuthFormTest {
  @Test
  fun normalizesAddressAndRejectsMalformedOnes() {
    assertTrue(EmailAuthForm().withEmail("  User@Example.COM ").emailValid)
    assertEquals("user@example.com", EmailAuthForm().withEmail("  User@Example.COM ").email)
    assertFalse(EmailAuthForm().withEmail("user@").emailValid)
    assertFalse(EmailAuthForm().withEmail("user.example.com").emailValid)
    assertFalse(EmailAuthForm().emailValid)
  }

  @Test
  fun keepsOnlySixDigitsInTheCodeField() {
    val form = EmailAuthForm().withCode("12a3456789")
    assertEquals("123456", form.code)
    assertTrue(form.codeValid)
    assertFalse(EmailAuthForm().withCode("123").codeValid)
  }

  @Test
  fun submitGateFollowsTheStepTheUserIsOn() {
    val fresh = EmailAuthForm()
    assertFalse(fresh.canSubmit)
    val addressed = fresh.withEmail("user@example.com")
    assertTrue(addressed.canSubmit)
    assertFalse(addressed.submitting().canSubmit)

    val awaitingCode = addressed.challengeIssued(EmailOtpChallenge("challenge-1", null))
    assertFalse(awaitingCode.canSubmit)
    assertTrue(awaitingCode.withCode("123456").canSubmit)
  }

  @Test
  fun issuedChallengeMovesToCodeStepAndPrefillsDevCode() {
    val form = EmailAuthForm().withEmail("user@example.com").submitting()
      .challengeIssued(EmailOtpChallenge("challenge-1", "123456"))

    assertTrue(form.codeSent)
    assertFalse(form.busy)
    assertEquals("123456", form.code)
    assertNull(form.error)
    assertEquals("Код отправлен на user@example.com", form.hint)
  }

  @Test
  fun failureClearsBusyAndShowsRussianTextForServerCodes() {
    val form = EmailAuthForm().withEmail("user@example.com").submitting()
      .failed(ApiException(422, "Неверный код", "otp_invalid"))

    assertFalse(form.busy)
    assertNull(form.hint)
    assertEquals("Неверный код. Проверьте цифры из письма", form.error)
  }

  @Test
  fun restartReturnsToTheAddressStepWithAnEmptyCode() {
    val form = EmailAuthForm().withEmail("user@example.com")
      .challengeIssued(EmailOtpChallenge("challenge-1", "123456"))
      .failed(ApiException(422, "Неверный код", "otp_invalid"))
      .restart()

    assertFalse(form.codeSent)
    assertEquals("", form.code)
    assertEquals("user@example.com", form.email)
    assertNull(form.error)
    assertNull(form.hint)
  }

  @Test
  fun confirmedKeepsOnlyTheSuccessHint() {
    val form = EmailAuthForm().withEmail("user@example.com")
      .challengeIssued(EmailOtpChallenge("challenge-1", "123456"))
      .submitting()
      .confirmed("Почта привязана")

    assertFalse(form.codeSent)
    assertFalse(form.busy)
    assertEquals("", form.code)
    assertEquals("Почта привязана", form.hint)
    assertNull(form.error)
  }

  @Test
  fun everyServerErrorCodeHasHumanRussianText() {
    val texts = listOf(
      "email_invalid" to "Некорректный адрес почты",
      "otp_not_found" to "Код не найден или истёк. Запросите новый",
      "otp_invalid" to "Неверный код. Проверьте цифры из письма",
      "otp_locked" to "Слишком много попыток. Запросите новый код",
      "email_taken" to "Этот адрес уже привязан к другому аккаунту",
      "customer_not_found" to "Аккаунт с такой почтой не найден. Войдите по телефону и привяжите адрес",
      "email_transport_unavailable" to "Отправка писем сейчас недоступна. Войдите по телефону",
    )
    texts.forEach { (code, expected) ->
      assertEquals(expected, emailAuthMessage(ApiException(422, "raw", code)))
    }
  }

  @Test
  fun fallsBackToStatusTextWhenTheServerSendsNoCode() {
    assertEquals("Некорректный адрес почты", emailAuthMessage(ApiException(400, "email must be an email")))
    assertEquals("Слишком часто. Подождите минуту и попробуйте снова", emailAuthMessage(ApiException(429, "Too Many Requests")))
    assertEquals("Сервер недоступен", emailAuthMessage(ApiException(503, "Сервер недоступен")))
    assertEquals("Нет связи с сервером", emailAuthMessage(java.io.IOException()))
  }
}
