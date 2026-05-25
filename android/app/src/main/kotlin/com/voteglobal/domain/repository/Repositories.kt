package com.TheVoteApp.domain.repository

import com.TheVoteApp.domain.model.Country
import com.TheVoteApp.domain.model.Policy
import com.TheVoteApp.domain.model.PolicyResult
import com.TheVoteApp.domain.model.VoteOption
import com.TheVoteApp.domain.model.VotePayload
import com.TheVoteApp.domain.model.VoteReceipt
import com.TheVoteApp.domain.model.Voter
import kotlinx.coroutines.flow.Flow

interface CountryRepository {
    fun getCountries(): Flow<List<Country>>
    suspend fun getCountry(code: String): Country?
}

interface PolicyRepository {
    fun getPolicies(countryCode: String): Flow<List<Policy>>
    suspend fun getPolicy(id: String): Policy?
    fun getVoteOptions(policyId: String): Flow<List<VoteOption>>
}

interface VoteRepository {
    /** Submit a signed, ZK-proven vote to the blockchain via the backend relay. */
    suspend fun submitVote(payload: VotePayload): Result<VoteReceipt>

    /** Verify that a previously submitted nullifier appears in the on-chain Merkle tree. */
    suspend fun verifyVoteRecorded(nullifier: String, policyId: String): Boolean

    /** Stream live tally updates (WebSocket-backed). */
    fun watchResults(policyId: String): Flow<PolicyResult>

    suspend fun getResults(policyId: String): PolicyResult?
}

interface VoterRepository {
    suspend fun getLocalVoter(): Voter?
    suspend fun saveVoter(voter: Voter)
    suspend fun clearVoter()
    /** Register identity commitment on-chain (one-time). */
    suspend fun registerVoter(voter: Voter): Result<String>
}
