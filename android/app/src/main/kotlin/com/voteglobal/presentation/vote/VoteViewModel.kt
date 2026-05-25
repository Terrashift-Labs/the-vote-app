package com.TheVoteApp.presentation.vote

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.TheVoteApp.domain.model.Policy
import com.TheVoteApp.domain.model.VoteOption
import com.TheVoteApp.domain.model.VotePayload
import com.TheVoteApp.domain.model.VoteReceipt
import com.TheVoteApp.domain.model.ZkProof
import com.TheVoteApp.domain.repository.PolicyRepository
import com.TheVoteApp.domain.usecase.SubmitVoteUseCase
import com.TheVoteApp.domain.usecase.VerifyVoteUseCase
import com.TheVoteApp.data.blockchain.BlockchainVoteService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class VoteUiState(
    val policy: Policy? = null,
    val options: List<VoteOption> = emptyList(),
    val selectedOptionId: String? = null,
    val phase: VotePhase = VotePhase.SELECTING,
    val receipt: VoteReceipt? = null,
    val error: String? = null
)

enum class VotePhase {
    SELECTING,          // user choosing option
    CONFIRMING,         // biometric prompt
    SIGNING,            // generating ZK proof + signature
    SUBMITTING,         // broadcasting transaction
    SUBMITTED,          // receipt received
    VERIFYING,          // checking on-chain
    VERIFIED,           // vote confirmed in ledger
    ERROR
}

@HiltViewModel
class VoteViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val policyRepository: PolicyRepository,
    private val submitVoteUseCase: SubmitVoteUseCase,
    private val verifyVoteUseCase: VerifyVoteUseCase,
    private val blockchainVoteService: BlockchainVoteService
) : ViewModel() {

    private val policyId: String = checkNotNull(savedStateHandle["policyId"])

    private val _uiState = MutableStateFlow(VoteUiState())
    val uiState: StateFlow<VoteUiState> = _uiState.asStateFlow()

    init {
        loadPolicy()
    }

    private fun loadPolicy() {
        viewModelScope.launch {
            val policy = policyRepository.getPolicy(policyId)
            _uiState.update { it.copy(policy = policy) }
        }
        viewModelScope.launch {
            policyRepository.getVoteOptions(policyId).collect { options ->
                _uiState.update { it.copy(options = options) }
            }
        }
    }

    fun selectOption(optionId: String) {
        _uiState.update { it.copy(selectedOptionId = optionId) }
    }

    fun confirmVote() {
        _uiState.update { it.copy(phase = VotePhase.CONFIRMING) }
    }

    /** Called after biometric authentication succeeds. */
    fun onBiometricSuccess() {
        val optionId = _uiState.value.selectedOptionId ?: return
        submitVote(optionId)
    }

    fun onBiometricFailure(reason: String) {
        _uiState.update { it.copy(phase = VotePhase.SELECTING, error = reason) }
    }

    private fun submitVote(optionId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(phase = VotePhase.SIGNING) }

            // Build payload — ZK proof generated server-side for now;
            // client-side proving via snarkjs WASM is a roadmap item.
            val nullifier = blockchainVoteService.deriveNullifier(
                voterSecret = ByteArray(32), // loaded from EncryptedKeyStore in production
                policyId = policyId
            )
            val timestamp = System.currentTimeMillis()
            val zkProof = ZkProof(
                pi_a = listOf(), pi_b = listOf(), pi_c = listOf(), publicSignals = listOf()
            ) // placeholder — filled by backend proving service

            val payload = VotePayload(
                policyId = policyId,
                optionId = optionId,
                voterNullifier = nullifier,
                zkProof = zkProof,
                signature = "", // filled after signing below
                timestamp = timestamp
            )
            val signature = blockchainVoteService.signVotePayload(payload)
            val signedPayload = payload.copy(signature = signature)

            _uiState.update { it.copy(phase = VotePhase.SUBMITTING) }

            submitVoteUseCase(signedPayload)
                .onSuccess { receipt ->
                    _uiState.update { it.copy(phase = VotePhase.SUBMITTED, receipt = receipt) }
                    verifyOnChain(receipt)
                }
                .onFailure { ex ->
                    _uiState.update { it.copy(phase = VotePhase.ERROR, error = ex.message) }
                }
        }
    }

    private suspend fun verifyOnChain(receipt: VoteReceipt) {
        _uiState.update { it.copy(phase = VotePhase.VERIFYING) }
        val verified = verifyVoteUseCase(receipt.nullifier, policyId)
        _uiState.update {
            it.copy(phase = if (verified) VotePhase.VERIFIED else VotePhase.ERROR)
        }
    }

    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }
}
