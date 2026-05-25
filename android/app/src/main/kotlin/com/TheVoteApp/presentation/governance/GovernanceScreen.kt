package com.TheVoteApp.presentation.governance

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel

// MARK: - Governance Screen (proposal list)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GovernanceScreen(
    vm: GovernanceViewModel = viewModel(),
    onProposalClick: (GovernanceProposal) -> Unit = {},
) {
    val uiState by vm.uiState.collectAsStateWithLifecycle()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("DAO Governance") },
                actions = {
                    IconButton(
                        onClick = { vm.loadProposals() },
                        modifier = Modifier.semantics { contentDescription = "Refresh proposals" }
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = null)
                    }
                }
            )
        }
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (val s = uiState) {
                is GovernanceUiState.Loading -> {
                    CircularProgressIndicator(
                        modifier = Modifier
                            .align(Alignment.Center)
                            .semantics { contentDescription = "Loading proposals" }
                    )
                }

                is GovernanceUiState.Error -> {
                    Column(
                        Modifier.align(Alignment.Center).padding(32.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(s.message, style = MaterialTheme.typography.bodyMedium)
                        Button(onClick = { vm.loadProposals() }) { Text("Retry") }
                    }
                }

                is GovernanceUiState.Loaded -> {
                    if (s.proposals.isEmpty()) {
                        Text(
                            "No governance proposals yet.",
                            modifier = Modifier.align(Alignment.Center),
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    } else {
                        LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(s.proposals, key = { it.proposalId }) { proposal ->
                                ProposalCard(proposal = proposal, onClick = { onProposalClick(proposal) })
                            }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - Proposal Card

@Composable
private fun ProposalCard(proposal: GovernanceProposal, onClick: () -> Unit) {
    val stateColor = stateColor(proposal.state)

    Card(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .semantics { contentDescription = "Proposal ${proposal.state}: ${proposal.description.take(60)}" },
        elevation = CardDefaults.cardElevation(2.dp),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                StateChip(label = proposal.state, color = stateColor)
                Spacer(Modifier.weight(1f))
                Text(
                    "#${proposal.proposalId.take(6)}…",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                proposal.description.take(80),
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 2,
            )
            VoteBar(votes = proposal.votes)
        }
    }
}

// MARK: - Proposal Detail Screen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProposalDetailScreen(
    proposal: GovernanceProposal,
    vm: GovernanceViewModel,
    onBack: () -> Unit,
) {
    val castingVote by vm.castingVote.collectAsStateWithLifecycle()
    val voteResult  by vm.voteResult.collectAsStateWithLifecycle()
    var showDialog by remember { mutableStateOf(false) }
    var pendingSupport by remember { mutableStateOf<VoteSupport?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Proposal") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.Refresh, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        LazyColumn(
            Modifier.padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                StateChip(label = proposal.state, color = stateColor(proposal.state))
            }
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text("Proposal", style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.height(8.dp))
                        Text(proposal.description, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
            item {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Current Votes", style = MaterialTheme.typography.titleSmall)
                        VoteBar(votes = proposal.votes)
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                            VoteTallyLabel("For",     proposal.votes.`for`,   Color(0xFF2E7D32))
                            VoteTallyLabel("Against", proposal.votes.against, Color(0xFFC62828))
                            VoteTallyLabel("Abstain", proposal.votes.abstain, Color.Gray)
                        }
                    }
                }
            }
            if (proposal.state == "Active") {
                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Cast Your Vote", style = MaterialTheme.typography.titleSmall)
                            VoteSupport.entries.forEach { support ->
                                val (bg, fg) = when (support) {
                                    VoteSupport.FOR     -> Color(0xFFE8F5E9) to Color(0xFF2E7D32)
                                    VoteSupport.AGAINST -> Color(0xFFFFEBEE) to Color(0xFFC62828)
                                    VoteSupport.ABSTAIN -> Color(0xFFF5F5F5) to Color.Gray
                                }
                                Button(
                                    onClick = { pendingSupport = support; showDialog = true },
                                    enabled = !castingVote,
                                    colors = ButtonDefaults.buttonColors(containerColor = bg, contentColor = fg),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .semantics { contentDescription = "Vote ${support.label}" },
                                ) { Text(support.label) }
                            }
                            if (castingVote) LinearProgressIndicator(Modifier.fillMaxWidth())
                            voteResult?.let { msg ->
                                Text(msg, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }

    if (showDialog) {
        AlertDialog(
            onDismissRequest = { showDialog = false },
            title   = { Text("Confirm vote") },
            text    = { Text("Vote ${pendingSupport?.label} on this proposal?") },
            confirmButton = {
                TextButton(onClick = {
                    showDialog = false
                    pendingSupport?.let { vm.castVote(proposal.proposalId, it) }
                }) { Text("Confirm") }
            },
            dismissButton = {
                TextButton(onClick = { showDialog = false }) { Text("Cancel") }
            },
        )
    }
}

// MARK: - Shared composables

@Composable
private fun StateChip(label: String, color: Color) {
    Box(
        Modifier
            .clip(RoundedCornerShape(50))
            .background(color.copy(alpha = 0.15f))
            .padding(horizontal = 10.dp, vertical = 4.dp)
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = color)
    }
}

@Composable
private fun VoteBar(votes: ProposalVotes) {
    val total = votes.total.coerceAtLeast(1.0)
    Row(
        Modifier
            .fillMaxWidth()
            .height(8.dp)
            .clip(RoundedCornerShape(50))
            .semantics { contentDescription = "Vote bar: ${votes.`for`} for, ${votes.against} against, ${votes.abstain} abstain" }
    ) {
        Box(Modifier.weight((votes.forDouble / total).toFloat().coerceAtLeast(0.001f)).fillMaxHeight().background(Color(0xFF2E7D32)))
        Box(Modifier.weight((votes.againstDouble / total).toFloat().coerceAtLeast(0.001f)).fillMaxHeight().background(Color(0xFFC62828)))
        Box(Modifier.weight((votes.abstainDouble / total).toFloat().coerceAtLeast(0.001f)).fillMaxHeight().background(Color.LightGray))
    }
}

@Composable
private fun VoteTallyLabel(label: String, value: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleMedium, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun stateColor(state: String): Color = when (state) {
    "Active"    -> Color(0xFF1D70B8)
    "Succeeded" -> Color(0xFF00703C)
    "Defeated"  -> Color(0xFFD4351C)
    "Executed"  -> Color(0xFF00703C)
    "Queued"    -> Color(0xFFF47738)
    else        -> Color(0xFF505A5F)
}
