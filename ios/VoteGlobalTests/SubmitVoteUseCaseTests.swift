import XCTest
import Combine
@testable import TheVoteApp

final class SubmitVoteUseCaseTests: XCTestCase {

    var useCase: SubmitVoteUseCase!
    var mockVoteRepo: MockVoteRepository!
    var mockVoterRepo: MockVoterRepository!

    let dummyPayload = VotePayload(
        policyID: "policy-001",
        optionID: "option-support",
        voterNullifier: "0xdeadbeef",
        zkProof: ZKProof(piA: [], piB: [], piC: [], publicSignals: []),
        signature: "0xsig",
        timestamp: 1_000_000
    )

    override func setUp() {
        super.setUp()
        mockVoteRepo = MockVoteRepository()
        mockVoterRepo = MockVoterRepository()
        useCase = SubmitVoteUseCase(voteRepository: mockVoteRepo, voterRepository: mockVoterRepo)
    }

    func test_throwsWhenVoterNotRegistered() async {
        mockVoterRepo.voter = nil
        do {
            _ = try await useCase(dummyPayload)
            XCTFail("Expected error to be thrown")
        } catch VoteError.notRegistered {
            // expected
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func test_throwsWhenIdentityNotVerified() async {
        mockVoterRepo.voter = Voter(identityCommitment: "0xcommit", countryCode: "GB", isVerified: false)
        do {
            _ = try await useCase(dummyPayload)
            XCTFail("Expected error to be thrown")
        } catch VoteError.identityNotVerified {
            // expected
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func test_returnsReceiptWhenVoterVerified() async throws {
        mockVoterRepo.voter = Voter(identityCommitment: "0xcommit", countryCode: "GB", isVerified: true)
        let expectedReceipt = VoteReceipt(
            id: "0xtx",
            transactionHash: "0xtx",
            blockNumber: 42,
            nullifier: "0xdeadbeef",
            timestamp: Date()
        )
        mockVoteRepo.receiptToReturn = expectedReceipt

        let receipt = try await useCase(dummyPayload)
        XCTAssertEqual(receipt.transactionHash, expectedReceipt.transactionHash)
    }
}

// MARK: - Mocks

final class MockVoteRepository: VoteRepository {
    var receiptToReturn: VoteReceipt?
    var verifyResult = true
    var resultsPublisher = PassthroughSubject<PolicyResult, Error>()

    func submitVote(_ payload: VotePayload) async throws -> VoteReceipt {
        guard let receipt = receiptToReturn else { throw VoteError.submissionFailed("No mock receipt") }
        return receipt
    }
    func verifyVoteRecorded(nullifier: String, policyID: String) async throws -> Bool { verifyResult }
    func results(policyID: String) -> AnyPublisher<PolicyResult, Error> {
        resultsPublisher.eraseToAnyPublisher()
    }
}

final class MockVoterRepository: VoterRepository {
    var voter: Voter?
    func loadLocalVoter() async -> Voter? { voter }
    func saveVoter(_ voter: Voter) async throws {}
    func clearVoter() async throws {}
    func registerVoter(_ voter: Voter) async throws -> String { "0xaddress" }
}
