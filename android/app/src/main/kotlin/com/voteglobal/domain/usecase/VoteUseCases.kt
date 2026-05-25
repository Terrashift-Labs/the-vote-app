package com.TheVoteApp.domain.usecase

import com.TheVoteApp.domain.model.VotePayload
import com.TheVoteApp.domain.model.VoteReceipt
import com.TheVoteApp.domain.repository.VoteRepository
import com.TheVoteApp.domain.repository.VoterRepository
import javax.inject.Inject

class SubmitVoteUseCase @Inject constructor(
    private val voteRepository: VoteRepository,
    private val voterRepository: VoterRepository
) {
    suspend operator fun invoke(payload: VotePayload): Result<VoteReceipt> {
        val voter = voterRepository.getLocalVoter()
            ?: return Result.failure(IllegalStateException("Voter not registered"))
        if (!voter.isVerified) {
            return Result.failure(IllegalStateException("Identity not verified"))
        }
        return voteRepository.submitVote(payload)
    }
}

class VerifyVoteUseCase @Inject constructor(
    private val voteRepository: VoteRepository
) {
    suspend operator fun invoke(nullifier: String, policyId: String): Boolean =
        voteRepository.verifyVoteRecorded(nullifier, policyId)
}

class GetPolicyResultsUseCase @Inject constructor(
    private val voteRepository: VoteRepository
) {
    fun invoke(policyId: String) = voteRepository.watchResults(policyId)
}
