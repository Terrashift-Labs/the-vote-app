package com.TheVoteApp.presentation.vote

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.TheVoteApp.R
import com.TheVoteApp.domain.model.VoteOption

@Composable
fun VoteScreen(
    onVoteComplete: (txHash: String) -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: VoteViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current

    // Trigger biometric prompt when entering CONFIRMING phase
    LaunchedEffect(uiState.phase) {
        if (uiState.phase == VotePhase.CONFIRMING) {
            showBiometricPrompt(
                activity = context as FragmentActivity,
                onSuccess = { viewModel.onBiometricSuccess() },
                onFailure = { msg -> viewModel.onBiometricFailure(msg) }
            )
        }
        if (uiState.phase == VotePhase.VERIFIED) {
            uiState.receipt?.let { onVoteComplete(it.transactionHash) }
        }
    }

    uiState.error?.let { error ->
        AlertDialog(
            onDismissRequest = viewModel::clearError,
            title = { Text(stringResource(R.string.error_title)) },
            text = { Text(error) },
            confirmButton = {
                TextButton(onClick = viewModel::clearError) {
                    Text(stringResource(R.string.ok))
                }
            }
        )
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(uiState.policy?.title ?: "") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = androidx.compose.material.icons.Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.back)
                        )
                    }
                }
            )
        }
    ) { padding ->
        when (uiState.phase) {
            VotePhase.SIGNING, VotePhase.SUBMITTING, VotePhase.VERIFYING ->
                LoadingOverlay(phase = uiState.phase)

            VotePhase.VERIFIED ->
                VoteConfirmedContent(
                    txHash = uiState.receipt?.transactionHash ?: "",
                    modifier = Modifier.padding(padding)
                )

            else ->
                VoteSelectionContent(
                    policy = uiState.policy,
                    options = uiState.options,
                    selectedOptionId = uiState.selectedOptionId,
                    onOptionSelected = viewModel::selectOption,
                    onSubmit = viewModel::confirmVote,
                    modifier = Modifier.padding(padding)
                )
        }
    }
}

@Composable
private fun VoteSelectionContent(
    policy: com.TheVoteApp.domain.model.Policy?,
    options: List<VoteOption>,
    selectedOptionId: String?,
    onOptionSelected: (String) -> Unit,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.fillMaxSize().padding(16.dp)) {
        policy?.description?.let {
            Text(text = it, style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(16.dp))
        }

        Text(
            text = stringResource(R.string.select_your_vote),
            style = MaterialTheme.typography.titleMedium
        )
        Spacer(Modifier.height(8.dp))

        LazyColumn(modifier = Modifier.weight(1f)) {
            items(options, key = { it.id }) { option ->
                VoteOptionRow(
                    option = option,
                    selected = option.id == selectedOptionId,
                    onSelect = { onOptionSelected(option.id) }
                )
            }
        }

        Button(
            onClick = onSubmit,
            enabled = selectedOptionId != null,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(stringResource(R.string.submit_vote))
        }
    }
}

@Composable
private fun VoteOptionRow(
    option: VoteOption,
    selected: Boolean,
    onSelect: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .selectable(selected = selected, onClick = onSelect, role = Role.RadioButton)
            .padding(vertical = 12.dp, horizontal = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(selected = selected, onClick = null)
        Spacer(Modifier.width(12.dp))
        Column {
            Text(option.label, style = MaterialTheme.typography.bodyLarge)
            if (option.description.isNotBlank()) {
                Text(option.description, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun LoadingOverlay(phase: VotePhase) {
    val message = when (phase) {
        VotePhase.SIGNING -> stringResource(R.string.signing_vote)
        VotePhase.SUBMITTING -> stringResource(R.string.submitting_vote)
        VotePhase.VERIFYING -> stringResource(R.string.verifying_vote)
        else -> ""
    }
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator()
            Spacer(Modifier.height(16.dp))
            Text(message)
        }
    }
}

@Composable
private fun VoteConfirmedContent(txHash: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(stringResource(R.string.vote_confirmed), style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(12.dp))
        Text(stringResource(R.string.vote_confirmed_desc), style = MaterialTheme.typography.bodyMedium)
        Spacer(Modifier.height(16.dp))
        Text(
            text = stringResource(R.string.transaction_hash, txHash),
            style = MaterialTheme.typography.labelSmall
        )
    }
}

private fun showBiometricPrompt(
    activity: FragmentActivity,
    onSuccess: () -> Unit,
    onFailure: (String) -> Unit
) {
    val executor = ContextCompat.getMainExecutor(activity)
    val prompt = BiometricPrompt(activity, executor, object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
            onSuccess()
        }
        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
            onFailure(errString.toString())
        }
        override fun onAuthenticationFailed() {
            onFailure(activity.getString(R.string.biometric_failed))
        }
    })

    val promptInfo = BiometricPrompt.PromptInfo.Builder()
        .setTitle(activity.getString(R.string.biometric_title))
        .setSubtitle(activity.getString(R.string.biometric_subtitle))
        .setAllowedAuthenticators(
            BiometricManager.Authenticators.BIOMETRIC_STRONG or
                    BiometricManager.Authenticators.DEVICE_CREDENTIAL
        )
        .build()

    prompt.authenticate(promptInfo)
}
