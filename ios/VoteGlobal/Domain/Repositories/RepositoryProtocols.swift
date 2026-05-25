import Foundation
import Combine

protocol PolicyRepository {
    func policies(for countryCode: String) -> AnyPublisher<[Policy], Error>
    func policy(id: String) async throws -> Policy
    func voteOptions(policyID: String) -> AnyPublisher<[VoteOption], Error>
}

protocol VoteRepository {
    func submitVote(_ payload: VotePayload) async throws -> VoteReceipt
    func verifyVoteRecorded(nullifier: String, policyID: String) async throws -> Bool
    func results(policyID: String) -> AnyPublisher<PolicyResult, Error>
}

protocol VoterRepository {
    func loadLocalVoter() async -> Voter?
    func saveVoter(_ voter: Voter) async throws
    func clearVoter() async throws
    func registerVoter(_ voter: Voter) async throws -> String
}
