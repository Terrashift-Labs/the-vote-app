import Foundation

struct SubmitVoteUseCase {
    private let voteRepository: VoteRepository
    private let voterRepository: VoterRepository

    init(voteRepository: VoteRepository, voterRepository: VoterRepository) {
        self.voteRepository = voteRepository
        self.voterRepository = voterRepository
    }

    func callAsFunction(_ payload: VotePayload) async throws -> VoteReceipt {
        guard let voter = await voterRepository.loadLocalVoter() else {
            throw VoteError.notRegistered
        }
        guard voter.isVerified else {
            throw VoteError.identityNotVerified
        }
        return try await voteRepository.submitVote(payload)
    }
}

enum VoteError: LocalizedError {
    case notRegistered
    case identityNotVerified
    case submissionFailed(String)
    case verificationFailed

    var errorDescription: String? {
        switch self {
        case .notRegistered:        return NSLocalizedString("error.not_registered", comment: "")
        case .identityNotVerified:  return NSLocalizedString("error.identity_not_verified", comment: "")
        case .submissionFailed(let msg): return msg
        case .verificationFailed:   return NSLocalizedString("error.verification_failed", comment: "")
        }
    }
}
