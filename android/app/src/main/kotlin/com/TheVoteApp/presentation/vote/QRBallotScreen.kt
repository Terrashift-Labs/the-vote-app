package com.TheVoteApp.presentation.vote

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.TheVoteApp.R

/**
 * QRBallotScreen — displays a QR code encoding the signed ballot payload.
 *
 * The QR code can be scanned at a polling station kiosk or by the web app
 * to submit the vote when the device has no internet connection.
 *
 * The ballot is valid for 30 days and is replay-protected by the on-chain
 * nullifier set.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QRBallotScreen(
    policyId: String,
    optionId: String,
    viewModel: QRBallotViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(policyId, optionId) {
        viewModel.generateQR(policyId, optionId)
    }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Offline Ballot") })
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            when {
                state.isLoading -> CircularProgressIndicator()
                state.error != null -> Text(state.error!!, color = MaterialTheme.colorScheme.error)
                state.qrBitmap != null -> {
                    Text(
                        "Show this QR code at any authorised polling station scanner or upload it via the web app.",
                        style = MaterialTheme.typography.bodyMedium,
                        textAlign = TextAlign.Center
                    )

                    Card {
                        Image(
                            bitmap = state.qrBitmap!!.asImageBitmap(),
                            contentDescription = "Vote QR code",
                            modifier = Modifier
                                .size(280.dp)
                                .padding(16.dp)
                        )
                    }

                    Text(
                        "Valid for 30 days · One-time use",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Button(
                        onClick = { viewModel.generateQR(policyId, optionId) },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text("Regenerate")
                    }
                }
            }
        }
    }
}
