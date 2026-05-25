package com.TheVoteApp.presentation.registration

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

// ── UI State ─────────────────────────────────────────────────────────────────

sealed interface RegistrationUiState {
    data object Idle                                     : RegistrationUiState
    data object VerifyingIdentity                        : RegistrationUiState
    data object SubmittingOnChain                        : RegistrationUiState
    data class  Registered(val txHash: String?)          : RegistrationUiState
    data object AlreadyRegistered                        : RegistrationUiState
    data class  Error(val message: String)               : RegistrationUiState
}

// ── ViewModel ────────────────────────────────────────────────────────────────

class RegistrationViewModel(
    private val okHttpClient: OkHttpClient = OkHttpClient(),
    private val baseUrl: String = "http://10.0.2.2:3000",
) : ViewModel() {

    private val _uiState = MutableStateFlow<RegistrationUiState>(RegistrationUiState.Idle)
    val uiState: StateFlow<RegistrationUiState> = _uiState.asStateFlow()

    private val json = Json { ignoreUnknownKeys = true }

    /**
     * Called after the citizen completes IdP OAuth flow and the app receives the id_token.
     */
    fun register(token: String, adapter: String) {
        viewModelScope.launch {
            _uiState.value = RegistrationUiState.VerifyingIdentity
            try {
                val bodyJson = """{"adapter":"$adapter","token":${json.encodeToString(kotlinx.serialization.builtins.serializer<String>(), token)}}"""
                val body = bodyJson.toRequestBody("application/json".toMediaType())

                _uiState.value = RegistrationUiState.SubmittingOnChain

                val request = Request.Builder()
                    .url("$baseUrl/api/v1/identity/register")
                    .post(body)
                    .build()

                val responseStr = okHttpClient.newCall(request).execute().use { response ->
                    val bodyStr = response.body!!.string()
                    if (!response.isSuccessful) {
                        val err = runCatching { json.decodeFromString<ApiError>(bodyStr) }.getOrNull()
                        throw Exception(err?.error ?: "Registration failed (${response.code})")
                    }
                    bodyStr
                }

                val result = json.decodeFromString<RegisterResponse>(responseStr)
                _uiState.value = if (result.alreadyRegistered) {
                    RegistrationUiState.AlreadyRegistered
                } else {
                    RegistrationUiState.Registered(result.txHash)
                }
            } catch (e: Exception) {
                _uiState.value = RegistrationUiState.Error(e.message ?: "Unknown error")
            }
        }
    }

    @Serializable private data class RegisterResponse(
        val commitment: String,
        val countryCode: String,
        val txHash: String? = null,
        val alreadyRegistered: Boolean,
    )
    @Serializable private data class ApiError(val error: String)
}
