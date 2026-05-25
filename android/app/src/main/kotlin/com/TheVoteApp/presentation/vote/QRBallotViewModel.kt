package com.TheVoteApp.presentation.vote

import android.graphics.Bitmap
import android.graphics.Color
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.TheVoteApp.data.blockchain.BlockchainVoteService
import com.TheVoteApp.domain.model.VotePayload
import com.TheVoteApp.domain.model.ZkProof
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import org.json.JSONObject
import javax.inject.Inject

data class QRBallotUiState(
    val qrBitmap: Bitmap? = null,
    val isLoading: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class QRBallotViewModel @Inject constructor(
    private val blockchainVoteService: BlockchainVoteService
) : ViewModel() {

    private val _uiState = MutableStateFlow(QRBallotUiState())
    val uiState: StateFlow<QRBallotUiState> = _uiState.asStateFlow()

    fun generateQR(policyId: String, optionId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null, qrBitmap = null) }
            runCatching {
                val timestamp   = System.currentTimeMillis()
                val nullifier   = blockchainVoteService.deriveNullifier(ByteArray(32), policyId)

                // Build minimal payload (no zkProof — server generates one for QR path)
                val payload = VotePayload(
                    policyId        = policyId,
                    optionId        = optionId,
                    voterNullifier  = nullifier,
                    zkProof         = ZkProof(listOf(), listOf(), listOf(), listOf()),
                    signature       = "",
                    timestamp       = timestamp
                )
                val signature   = blockchainVoteService.signVotePayload(payload)

                val json = JSONObject().apply {
                    put("policyId",       policyId)
                    put("optionId",       optionId)
                    put("voterNullifier", nullifier)
                    put("signature",      signature)
                    put("timestamp",      timestamp)
                }.toString()

                encodeQR(json, 512)
            }.onSuccess { bitmap ->
                _uiState.update { it.copy(isLoading = false, qrBitmap = bitmap) }
            }.onFailure { ex ->
                _uiState.update { it.copy(isLoading = false, error = ex.message) }
            }
        }
    }

    private fun encodeQR(content: String, sizePx: Int): Bitmap {
        val hints = mapOf(EncodeHintType.MARGIN to 1)
        val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, sizePx, sizePx, hints)
        val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.RGB_565)
        for (x in 0 until sizePx) {
            for (y in 0 until sizePx) {
                bitmap.setPixel(x, y, if (matrix[x, y]) Color.BLACK else Color.WHITE)
            }
        }
        return bitmap
    }
}
