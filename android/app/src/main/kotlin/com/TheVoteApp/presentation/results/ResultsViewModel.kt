package com.TheVoteApp.presentation.results

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.TheVoteApp.data.remote.VoteApiClient
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject
import javax.inject.Inject

data class TallyUiModel(
    val policyId: String,
    val support: Int,
    val oppose: Int,
    val abstain: Int,
    val total: Int,
    val lastBlock: Long,
    val finalized: Boolean
)

data class ResultsUiState(
    val tally: TallyUiModel? = null,
    val isLoading: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class ResultsViewModel @Inject constructor(
    private val apiClient: VoteApiClient
) : ViewModel() {

    private val _uiState = MutableStateFlow(ResultsUiState())
    val uiState: StateFlow<ResultsUiState> = _uiState.asStateFlow()

    fun load(policyId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching {
                val response = apiClient.get("/api/v1/policy/$policyId/results")
                val tally = response["tally"] as? Map<*, *>
                    ?: throw IllegalStateException("Missing tally in response")
                TallyUiModel(
                    policyId  = policyId,
                    support   = (tally["support"]  as? Number)?.toInt() ?: 0,
                    oppose    = (tally["oppose"]   as? Number)?.toInt() ?: 0,
                    abstain   = (tally["abstain"]  as? Number)?.toInt() ?: 0,
                    total     = (tally["total"]    as? Number)?.toInt() ?: 0,
                    lastBlock = (tally["lastBlock"] as? Number)?.toLong() ?: 0,
                    finalized = tally["finalized"] as? Boolean ?: false
                )
            }.onSuccess { tally ->
                _uiState.update { it.copy(isLoading = false, tally = tally) }
            }.onFailure { ex ->
                _uiState.update { it.copy(isLoading = false, error = ex.message) }
            }
        }
    }
}
