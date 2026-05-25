package com.TheVoteApp.data.network

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject

/**
 * Connects to the backend `/ws/tally` WebSocket endpoint and emits
 * real-time [TallyUpdate] objects for subscribed policies via a [SharedFlow].
 *
 * Usage:
 * ```kotlin
 * val client = LiveTallyClient(okHttpClient, "wss://api.thevoteapp.org/ws/tally")
 * client.subscribe("pol-001")
 * lifecycleScope.launch {
 *     client.updates.collect { update -> /* update UI */ }
 * }
 * client.connect()
 * ```
 */
class LiveTallyClient(
    private val okHttpClient: OkHttpClient,
    private val wsUrl: String,
) {

    @Serializable
    data class PolicyTallyDTO(
        val policyId: String,
        val support: Int,
        val oppose: Int,
        val abstain: Int,
        val total: Int,
        val lastBlock: Int,
        val finalized: Boolean,
    )

    @Serializable
    data class TallyUpdate(
        val type: String,
        val policyId: String,
        val tally: PolicyTallyDTO,
        val blockNumber: Int? = null,
    )

    enum class State { DISCONNECTED, CONNECTING, CONNECTED }

    // Public state
    var state: State = State.DISCONNECTED
        private set

    private val _updates = MutableSharedFlow<TallyUpdate>(extraBufferCapacity = 64)
    val updates: SharedFlow<TallyUpdate> = _updates.asSharedFlow()

    private var webSocket: WebSocket? = null
    private val subscribedPolicies = mutableSetOf<String>()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val json = Json { ignoreUnknownKeys = true }

    // MARK: - Connection

    fun connect() {
        if (state != State.DISCONNECTED) return
        state = State.CONNECTING
        val request = Request.Builder().url(wsUrl).build()
        webSocket = okHttpClient.newWebSocket(request, listener)
    }

    fun disconnect() {
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
        state = State.DISCONNECTED
    }

    fun subscribe(policyId: String) {
        subscribedPolicies.add(policyId)
        if (state == State.CONNECTED) {
            send(mapOf("type" to "subscribe", "policyId" to policyId))
        }
    }

    fun unsubscribe(policyId: String) {
        subscribedPolicies.remove(policyId)
        if (state == State.CONNECTED) {
            send(mapOf("type" to "unsubscribe", "policyId" to policyId))
        }
    }

    fun close() {
        disconnect()
        scope.cancel()
    }

    // MARK: - Private

    private fun send(map: Map<String, String>) {
        webSocket?.send(JSONObject(map).toString())
    }

    private val listener = object : WebSocketListener() {
        override fun onOpen(ws: WebSocket, response: Response) {
            state = State.CONNECTED
            // Re-subscribe to all tracked policies on connect/reconnect
            subscribedPolicies.forEach { id ->
                send(mapOf("type" to "subscribe", "policyId" to id))
            }
        }

        override fun onMessage(ws: WebSocket, text: String) {
            try {
                val update = json.decodeFromString<TallyUpdate>(text)
                if (update.type == "tally" || update.type == "snapshot") {
                    scope.launch { _updates.emit(update) }
                }
            } catch (_: Exception) { /* ignore malformed messages */ }
        }

        override fun onClosing(ws: WebSocket, code: Int, reason: String) {
            state = State.DISCONNECTED
        }

        override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
            state = State.DISCONNECTED
        }
    }
}
