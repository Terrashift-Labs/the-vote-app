package com.TheVoteApp.presentation.registration

import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel

private data class AdapterOption(val id: String, val label: String, val flag: String)

private val ADAPTERS = listOf(
    AdapterOption("govuk", "Gov.UK One Login", "🇬🇧"),
    AdapterOption("eidas", "EU eIDAS",         "🇪🇺"),
    AdapterOption("mock",  "Test (dev only)",  "🧪"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegistrationScreen(vm: RegistrationViewModel = viewModel()) {
    val uiState by vm.uiState.collectAsStateWithLifecycle()
    var selectedAdapter by remember { mutableStateOf("govuk") }
    var showDialog by remember { mutableStateOf(false) }
    val context = LocalContext.current

    Scaffold(
        topBar = { TopAppBar(title = { Text("Voter Registration") }) }
    ) { padding ->
        Column(
            Modifier
                .padding(padding)
                .padding(16.dp)
                .fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // Header card
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Register to Vote", style = MaterialTheme.typography.titleLarge)
                    Text(
                        "Verify your identity with your government's digital ID. " +
                        "Your personal details never leave your device.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // Adapter selection
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Select your identity provider", style = MaterialTheme.typography.titleSmall)
                    Spacer(Modifier.height(4.dp))
                    ADAPTERS.forEach { adapter ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .semantics { contentDescription = "Select ${adapter.label}" },
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            RadioButton(
                                selected = selectedAdapter == adapter.id,
                                onClick  = { selectedAdapter = adapter.id },
                            )
                            Text("${adapter.flag}  ${adapter.label}", Modifier.weight(1f))
                        }
                    }
                }
            }

            // Start button
            Button(
                onClick  = { showDialog = true },
                enabled  = uiState !is RegistrationUiState.VerifyingIdentity &&
                           uiState !is RegistrationUiState.SubmittingOnChain,
                modifier = Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = "Continue to identity provider" },
            ) {
                Icon(Icons.Default.Person, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Continue to ${ADAPTERS.first { it.id == selectedAdapter }.label}")
            }

            // Status
            StatusCard(uiState)
        }
    }

    // Confirmation dialog before opening IdP
    if (showDialog) {
        AlertDialog(
            onDismissRequest = { showDialog = false },
            title   = { Text("Verify your identity") },
            text    = { Text("You'll be taken to ${ADAPTERS.first { it.id == selectedAdapter }.label} to verify your identity.") },
            confirmButton = {
                TextButton(onClick = {
                    showDialog = false
                    if (selectedAdapter == "mock") {
                        // Dev shortcut
                        val mockToken = """{"sub":"test-citizen-${System.currentTimeMillis()}","countryCode":"GB"}"""
                        vm.register(mockToken, "mock")
                    } else {
                        // Production: open Chrome Custom Tab to IdP authorization URL
                        val authUrl = Uri.parse("https://signin.example.gov/authorize?response_type=code&client_id=thevoteapp&redirect_uri=thevoteapp://auth")
                        CustomTabsIntent.Builder().build().launchUrl(context, authUrl)
                    }
                }) { Text("Continue") }
            },
            dismissButton = { TextButton(onClick = { showDialog = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun StatusCard(state: RegistrationUiState) {
    when (state) {
        is RegistrationUiState.Idle -> Unit

        is RegistrationUiState.VerifyingIdentity ->
            LinearProgressCard("Verifying identity…")

        is RegistrationUiState.SubmittingOnChain ->
            LinearProgressCard("Registering on blockchain…")

        is RegistrationUiState.AlreadyRegistered ->
            SuccessCard("Already registered — you're all set!", state.toString())

        is RegistrationUiState.Registered -> {
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9))) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF2E7D32))
                        Spacer(Modifier.width(8.dp))
                        Text("Registration confirmed!", color = Color(0xFF2E7D32), style = MaterialTheme.typography.titleSmall)
                    }
                    state.txHash?.let { hash ->
                        Text("TX: ${hash.take(18)}…", style = MaterialTheme.typography.labelSmall,
                             color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text("You can now vote on active policies.",
                         style = MaterialTheme.typography.bodySmall,
                         color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        is RegistrationUiState.Error ->
            Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color(0xFFFFEBEE))) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFC62828))
                    Spacer(Modifier.width(8.dp))
                    Text(state.message, color = Color(0xFFC62828), style = MaterialTheme.typography.bodyMedium)
                }
            }
    }
}

@Composable
private fun LinearProgressCard(message: String) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(message, style = MaterialTheme.typography.bodyMedium)
            LinearProgressIndicator(
                Modifier
                    .fillMaxWidth()
                    .semantics { contentDescription = message }
            )
        }
    }
}

@Composable
private fun SuccessCard(message: String, cd: String) {
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9))) {
        Row(
            Modifier.padding(16.dp).semantics { contentDescription = cd },
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF2E7D32))
            Spacer(Modifier.width(8.dp))
            Text(message, color = Color(0xFF2E7D32), style = MaterialTheme.typography.bodyMedium)
        }
    }
}
