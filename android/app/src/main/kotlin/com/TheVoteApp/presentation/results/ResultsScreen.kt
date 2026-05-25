package com.TheVoteApp.presentation.results

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.TheVoteApp.R

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResultsScreen(
    policyId: String,
    onBack: () -> Unit,
    viewModel: ResultsViewModel = hiltViewModel()
) {
    val state by viewModel.uiState.collectAsState()

    LaunchedEffect(policyId) { viewModel.load(policyId) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.results_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.back))
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            when {
                state.isLoading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                state.error != null -> Text(state.error!!, color = MaterialTheme.colorScheme.error)
                state.tally != null -> TallyCard(state.tally!!)
            }
        }
    }
}

@Composable
private fun TallyCard(tally: TallyUiModel) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                text = stringResource(R.string.total_votes, tally.total),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )

            if (tally.finalized) {
                Text("Results finalised", style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary)
            }

            Spacer(Modifier.height(4.dp))

            TallyRow(label = stringResource(R.string.option_support), count = tally.support, total = tally.total)
            TallyRow(label = stringResource(R.string.option_oppose),  count = tally.oppose,  total = tally.total)
            TallyRow(label = stringResource(R.string.option_abstain), count = tally.abstain, total = tally.total)

            Spacer(Modifier.height(4.dp))
            Text(
                text = "Last verified at block ${tally.lastBlock}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun TallyRow(label: String, count: Int, total: Int) {
    val fraction = if (total > 0) count.toFloat() / total else 0f
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(label, style = MaterialTheme.typography.bodyMedium)
            Text("$count (${(fraction * 100).toInt()}%)", style = MaterialTheme.typography.bodyMedium)
        }
        LinearProgressIndicator(
            progress = { fraction },
            modifier = Modifier.fillMaxWidth()
        )
    }
}
