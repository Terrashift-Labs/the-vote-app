package com.TheVoteApp.presentation.governance

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

// ── Data models ──────────────────────────────────────────────────────────────

@Serializable
data class GovernanceProposal(
    val proposalId: String,
    val proposer: String,
    val description: String,
    val state: String,
    val voteStart: Int,
    val voteEnd: Int,
    val votes: ProposalVotes,
)

@Serializable
data class ProposalVotes(
    val `for`: String,
    val against: String,
    val abstain: String,
) {
    val forDouble:     Double get() = `for`.toDoubleOrNull()     ?: 0.0
    val againstDouble: Double get() = against.toDoubleOrNull()   ?: 0.0
    val abstainDouble: Double get() = abstain.toDoubleOrNull()   ?: 0.0
    val total:         Double get() = forDouble + againstDouble + abstainDouble
}

@Serializable
private data class ProposalsResponse(val proposals: List<GovernanceProposal>)

@Serializable
private data class TxResponse(val txHash: String)

// Support values matching OZ Governor: 0=Against, 1=For, 2=Abstain
enum class VoteSupport(val value: Int, val label: String) {
    FOR(1, "For"), AGAINST(0, "Against"), ABSTAIN(2, "Abstain")
}

// ── UI State ─────────────────────────────────────────────────────────────────

sealed interface GovernanceUiState {
    data object Loading : GovernanceUiState
    data class  Loaded(val proposals: List<GovernanceProposal>) : GovernanceUiState
    data class  Error(val message: String) : GovernanceUiState
}

// ── ViewModel ────────────────────────────────────────────────────────────────

class GovernanceViewModel(
    private val okHttpClient: OkHttpClient = OkHttpClient(),
    private val baseUrl: String = "http://10.0.2.2:3000",  // Android emulator localhost
) : ViewModel() {

    private val _uiState = MutableStateFlow<GovernanceUiState>(GovernanceUiState.Loading)
    val uiState: StateFlow<GovernanceUiState> = _uiState.asStateFlow()

    private val _castingVote = MutableStateFlow(false)
    val castingVote: StateFlow<Boolean> = _castingVote.asStateFlow()

    private val _voteResult = MutableStateFlow<String?>(null)
    val voteResult: StateFlow<String?> = _voteResult.asStateFlow()

    private val json = Json { ignoreUnknownKeys = true }

    init { loadProposals() }

    fun loadProposals() {
        viewModelScope.launch {
            _uiState.value = GovernanceUiState.Loading
            try {
                val request = Request.Builder()
                    .url("$baseUrl/api/v1/governance/proposals")
                    .build()
                val body = okHttpClient.newCall(request).execute().use { it.body!!.string() }
                val response = json.decodeFromString<ProposalsResponse>(body)
                _uiState.value = GovernanceUiState.Loaded(response.proposals)
            } catch (e: Exception) {
                _uiState.value = GovernanceUiState.Error(e.message ?: "Unknown error")
            }
        }
    }

    fun castVote(proposalId: String, support: VoteSupport) {
        viewModelScope.launch {
            _castingVote.value = true
            _voteResult.value  = null
            try {
                val body = """{"support":${support.value}}"""
                    .toRequestBody("application/json".toMediaType())
                val request = Request.Builder()
                    .url("$baseUrl/api/v1/governance/proposals/$proposalId/vote")
                    .post(body)
                    .build()
                val responseBody = okHttpClient.newCall(request).execute().use { it.body!!.string() }
                val tx = json.decodeFromString<TxResponse>(responseBody)
                _voteResult.value = "TX: ${tx.txHash.take(18)}…"
                loadProposals()
            } catch (e: Exception) {
                _voteResult.value = "Vote failed: ${e.message}"
            } finally {
                _castingVote.value = false
            }
        }
    }
}
