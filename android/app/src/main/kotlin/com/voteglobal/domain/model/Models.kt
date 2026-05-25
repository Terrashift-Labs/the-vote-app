package com.TheVoteApp.domain.model

import java.time.Instant

data class Country(
    val code: String,           // ISO 3166-1 alpha-2, e.g. "GB"
    val name: String,
    val flagUrl: String,
    val activeElectionId: String?
)

data class Policy(
    val id: String,
    val countryCode: String,
    val title: String,
    val description: String,
    val category: PolicyCategory,
    val documentUrl: String?,
    val votingDeadline: Instant,
    val status: PolicyStatus
)

enum class PolicyCategory {
    HEALTHCARE, EDUCATION, ECONOMY, ENVIRONMENT, DEFENCE, INFRASTRUCTURE, JUSTICE, OTHER
}

enum class PolicyStatus {
    OPEN, CLOSED, TALLYING, FINALISED
}

data class VoteOption(
    val id: String,
    val policyId: String,
    val label: String,          // e.g. "Support", "Oppose", "Abstain"
    val description: String
)

data class VotePayload(
    val policyId: String,
    val optionId: String,
    val voterNullifier: String, // derived from identity commitment — not linkable to voter
    val zkProof: ZkProof,
    val signature: String,      // ECDSA over (policyId + optionId + nullifier)
    val timestamp: Long
)

data class ZkProof(
    val pi_a: List<String>,
    val pi_b: List<List<String>>,
    val pi_c: List<String>,
    val publicSignals: List<String>
)

data class VoteReceipt(
    val transactionHash: String,
    val blockNumber: Long,
    val nullifier: String,      // voter keeps this to verify their vote was counted
    val timestamp: Instant
)

data class PolicyResult(
    val policyId: String,
    val totalVotes: Long,
    val breakdown: Map<String, Long>,   // optionId -> count
    val verificationRoot: String,       // Merkle root of all vote commitments
    val isFinalised: Boolean
)

data class Voter(
    val identityCommitment: String, // public; derived from secret + nullifier
    val countryCode: String,
    val isVerified: Boolean
)
