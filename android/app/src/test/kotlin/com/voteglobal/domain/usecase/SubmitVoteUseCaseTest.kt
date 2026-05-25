package com.TheVoteApp.domain.usecase

import com.TheVoteApp.domain.model.VotePayload
import com.TheVoteApp.domain.model.VoteReceipt
import com.TheVoteApp.domain.model.Voter
import com.TheVoteApp.domain.model.ZkProof
import com.TheVoteApp.domain.repository.VoteRepository
import com.TheVoteApp.domain.repository.VoterRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant

class SubmitVoteUseCaseTest {

    private val voteRepository: VoteRepository = mockk()
    private val voterRepository: VoterRepository = mockk()
    private lateinit var useCase: SubmitVoteUseCase

    private val dummyPayload = VotePayload(
        policyId = "policy-001",
        optionId = "option-support",
        voterNullifier = "0xdeadbeef",
        zkProof = ZkProof(listOf(), listOf(), listOf(), listOf()),
        signature = "0xsig",
        timestamp = 1000L
    )

    private val dummyReceipt = VoteReceipt(
        transactionHash = "0xtxhash",
        blockNumber = 42L,
        nullifier = "0xdeadbeef",
        timestamp = Instant.now()
    )

    @Before
    fun setUp() {
        useCase = SubmitVoteUseCase(voteRepository, voterRepository)
    }

    @Test
    fun `returns failure when no voter registered`() = runTest {
        coEvery { voterRepository.getLocalVoter() } returns null

        val result = useCase(dummyPayload)

        assertTrue(result.isFailure)
        assertEquals("Voter not registered", result.exceptionOrNull()?.message)
        coVerify(exactly = 0) { voteRepository.submitVote(any()) }
    }

    @Test
    fun `returns failure when voter not verified`() = runTest {
        coEvery { voterRepository.getLocalVoter() } returns Voter(
            identityCommitment = "0xcommitment",
            countryCode = "GB",
            isVerified = false
        )

        val result = useCase(dummyPayload)

        assertTrue(result.isFailure)
        assertEquals("Identity not verified", result.exceptionOrNull()?.message)
    }

    @Test
    fun `delegates to voteRepository when voter is verified`() = runTest {
        coEvery { voterRepository.getLocalVoter() } returns Voter(
            identityCommitment = "0xcommitment",
            countryCode = "GB",
            isVerified = true
        )
        coEvery { voteRepository.submitVote(dummyPayload) } returns Result.success(dummyReceipt)

        val result = useCase(dummyPayload)

        assertTrue(result.isSuccess)
        assertEquals(dummyReceipt, result.getOrNull())
        coVerify(exactly = 1) { voteRepository.submitVote(dummyPayload) }
    }
}
