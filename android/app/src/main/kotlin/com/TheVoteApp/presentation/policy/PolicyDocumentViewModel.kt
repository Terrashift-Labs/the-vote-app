package com.TheVoteApp.presentation.policy

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.TheVoteApp.domain.repository.PolicyRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PolicyDocumentUiState(
    val documentUrl: String? = null,
    val isLoading: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class PolicyDocumentViewModel @Inject constructor(
    private val policyRepository: PolicyRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(PolicyDocumentUiState())
    val uiState: StateFlow<PolicyDocumentUiState> = _uiState.asStateFlow()

    fun loadDocument(policyId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching { policyRepository.getDocumentUrl(policyId) }
                .onSuccess { url ->
                    _uiState.update { it.copy(isLoading = false, documentUrl = url) }
                }
                .onFailure { ex ->
                    _uiState.update { it.copy(isLoading = false, error = ex.message) }
                }
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
