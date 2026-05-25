import Foundation
import SwiftUI

/// Dependency injection root — owns and vends all service singletons.
@MainActor
final class AppContainer: ObservableObject {

    // MARK: - Services
    let encryptedKeyStore: EncryptedKeyStore
    let blockchainVoteService: BlockchainVoteService
    let apiClient: VoteAPIClient

    // MARK: - Repositories
    let policyRepository: PolicyRepository
    let voteRepository: VoteRepository
    let voterRepository: VoterRepository

    // MARK: - Locale (country-configurable)
    @Published var locale: Locale = .current

    init() {
        encryptedKeyStore = EncryptedKeyStore()
        apiClient = VoteAPIClient(baseURL: AppConfig.apiBaseURL)
        blockchainVoteService = BlockchainVoteService(
            rpcURL: AppConfig.rpcURL,
            contractAddress: AppConfig.contractAddress,
            keyStore: encryptedKeyStore
        )

        policyRepository = DefaultPolicyRepository(apiClient: apiClient)
        voterRepository = DefaultVoterRepository(keyStore: encryptedKeyStore)
        voteRepository = DefaultVoteRepository(
            apiClient: apiClient,
            blockchainService: blockchainVoteService
        )
    }
}
