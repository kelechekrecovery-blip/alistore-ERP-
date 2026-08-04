package kg.alistore.core

import android.content.Context
import java.security.MessageDigest
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

internal data class StableCommandIntent(
  val scope: String,
  val payloadFingerprint: String,
  val idempotencyKey: String,
)

internal interface CommandIntentPersistence {
  suspend fun read(scope: String): String?
  suspend fun write(scope: String, value: String)
  suspend fun remove(scope: String)
  suspend fun entries(): Map<String, String>
}

/**
 * Persists the currently open logical command per operation scope.
 *
 * Retries and process restarts reuse its opaque command id. A payload edit rotates
 * the id, while [close] after an acknowledged success allows a later identical
 * business action to receive a fresh id.
 */
internal class StableCommandIntentStore internal constructor(
  owner: QueueOwner,
  private val persistence: CommandIntentPersistence,
  private val commandId: () -> String = { UUID.randomUUID().toString() },
) {
  private val actorScopePrefix = "actor:${sha256("actor:${owner.storageKey}")}:"

  constructor(
    context: Context,
    owner: QueueOwner,
    preferencesName: String = "alistore-stable-command-intents",
  ) : this(owner, SharedPreferencesIntentPersistence(context, preferencesName))

  suspend fun cancellation(orderId: String, reason: String) =
    open("cancellation:$orderId", "cancellation", canonicalReason(reason))

  suspend fun ownerCancellation(
    orderId: String,
    cancellationId: String,
    action: String,
    refundAmount: Int?,
    supplierExpenseAmount: Int?,
    faultParty: String?,
    reason: String,
    evidenceIds: List<String>,
  ) = open(
    "owner-cancellation:$orderId:$cancellationId",
    "owner-cancellation",
    action,
    refundAmount,
    supplierExpenseAmount ?: 0,
    canonicalOptional(faultParty),
    canonicalReason(reason),
    canonicalSet(evidenceIds),
  )

  suspend fun quarantineProposal(
    orderItemId: String,
    reason: String,
    evidence: Map<String, String>,
    imeis: List<String>,
  ) = open(
    "quarantine-proposal:$orderItemId",
    "quarantine-proposal",
    canonicalReason(reason),
    canonicalMap(evidence),
    canonicalImeis(imeis),
  )

  suspend fun quarantineResolution(
    resolutionId: String,
    disposition: String,
    reason: String,
    evidence: Map<String, String>,
  ) = open(
    "quarantine-resolution:$resolutionId",
    "quarantine-resolution",
    disposition,
    canonicalReason(reason),
    canonicalMap(evidence),
  )

  suspend fun posReceivable(
    receivableId: String,
    method: String,
    amount: Int,
    txnId: String?,
    shiftId: String?,
  ) = open(
    "pos-receivable:$receivableId",
    "pos-receivable",
    method,
    amount,
    canonicalOptional(txnId),
    canonicalOptional(shiftId),
  )

  suspend fun posHandover(orderId: String, itemId: String) =
    open("pos-handover:$orderId:$itemId", "pos-handover")

  suspend fun courierStart(orderId: String) =
    open("courier-start:$orderId", "courier-start")

  suspend fun courierDeliver(orderId: String, codAmount: Int, reason: String?, idempotencyKey: String? = null) =
    open("courier-deliver:$orderId", "courier-deliver", codAmount, canonicalReason(reason), requestedKey = idempotencyKey)

  suspend fun courierFail(orderId: String, reason: String, idempotencyKey: String? = null) =
    open("courier-fail:$orderId", "courier-fail", canonicalReason(reason), requestedKey = idempotencyKey)

  suspend fun courierHandover(runId: String, amount: Int, reason: String?) =
    open("courier-handover:$runId", "courier-handover", amount, canonicalReason(reason))

  suspend fun close(intent: StableCommandIntent) = mutationMutex.withLock {
    if (persistence.read(intent.scope) == intent.serialized()) persistence.remove(intent.scope)
  }

  /**
   * Used by offline replay after a server 2xx. Actor namespace plus opaque key
   * identifies the exact open intent; a rotated intent is never removed.
   */
  suspend fun closeByIdempotencyKey(idempotencyKey: String): Boolean = mutationMutex.withLock {
    val match = persistence.entries()
      .asSequence()
      .filter { (scope, _) -> scope.startsWith(actorScopePrefix) }
      .mapNotNull { (scope, value) -> value.parse(scope) }
      .firstOrNull { it.idempotencyKey == idempotencyKey }
      ?: return@withLock false
    if (persistence.read(match.scope) != match.serialized()) return@withLock false
    persistence.remove(match.scope)
    true
  }

  private suspend fun open(scope: String, command: String, vararg fields: Any?, requestedKey: String? = null): StableCommandIntent =
    mutationMutex.withLock {
    val actorScope = "$actorScopePrefix$scope"
    val fingerprint = fingerprint(command, *fields)
    persistence.read(actorScope)?.parse(actorScope)
      ?.takeIf { it.payloadFingerprint == fingerprint && (requestedKey == null || it.idempotencyKey == requestedKey) }
      ?.let { return@withLock it }
    StableCommandIntent(actorScope, fingerprint, requestedKey ?: commandId()).also {
      persistence.write(actorScope, it.serialized())
    }
  }

  private fun StableCommandIntent.serialized() = "v1:$payloadFingerprint:$idempotencyKey"

  private fun String.parse(scope: String): StableCommandIntent? {
    val parts = split(':', limit = 3)
    if (parts.size != 3 || parts[0] != "v1" || parts[1].length != 64 || parts[2].isBlank()) return null
    return StableCommandIntent(scope, parts[1], parts[2])
  }

  private fun fingerprint(command: String, vararg fields: Any?): String {
    val canonical = buildString {
      appendField("alistore-android-command-payload-v2")
      appendField(command)
      fields.forEach { appendField(it?.toString()) }
    }
    return sha256(canonical)
  }

  private fun StringBuilder.appendField(value: String?) {
    if (value == null) append("-1:") else append(value.toByteArray(Charsets.UTF_8).size).append(':').append(value)
    append(';')
  }

  private fun canonicalReason(value: String?) = value?.trim()?.ifEmpty { null }

  private fun canonicalOptional(value: String?) = value?.trim()?.ifEmpty { null }

  private fun canonicalSet(values: List<String>) =
    buildString { values.map(String::trim).filter(String::isNotEmpty).distinct().sorted().forEach { appendField(it) } }

  private fun canonicalImeis(values: List<String>) =
    canonicalSet(values.map { it.uppercase() })

  private fun canonicalMap(values: Map<String, String>) =
    buildString {
      values.toSortedMap().forEach { (name, value) ->
        appendField(name)
        appendField(value)
      }
    }

  private companion object {
    val mutationMutex = Mutex()

    fun sha256(value: String): String = MessageDigest.getInstance("SHA-256")
      .digest(value.toByteArray(Charsets.UTF_8))
      .joinToString("") { "%02x".format(it) }
  }
}

private class SharedPreferencesIntentPersistence(
  context: Context,
  preferencesName: String,
) : CommandIntentPersistence {
  private val preferences = context.applicationContext.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)

  override suspend fun read(scope: String): String? = withContext(Dispatchers.IO) {
    preferences.getString(scope, null)
  }

  override suspend fun write(scope: String, value: String) = withContext(Dispatchers.IO) {
    check(preferences.edit().putString(scope, value).commit()) { "Failed to persist command intent" }
  }

  override suspend fun remove(scope: String) = withContext(Dispatchers.IO) {
    check(preferences.edit().remove(scope).commit()) { "Failed to close command intent" }
  }

  override suspend fun entries(): Map<String, String> = withContext(Dispatchers.IO) {
    preferences.all.mapNotNull { (key, value) -> (value as? String)?.let { key to it } }.toMap()
  }
}
