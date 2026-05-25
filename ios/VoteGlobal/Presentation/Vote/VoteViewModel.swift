import Foundation
import Combine
import LocalAuthentication

@MainActor
final class VoteViewModel: ObservableObject {

    // MARK: - Published State

    @Published private(set) var policy: Policy?
    @Published private(set) var options: [VoteOption] = []
    @Published var selectedOptionID: String?
    @Published private(set) var phase: VotePhase = .selecting
    @Published private(set) var receipt: VoteReceipt?
    @Published var errorMessage: String?

    // MARK: - Dependencies

    private let policyID: String
    private let policyRepository: PolicyRepository
    private let submitVoteUseCase: SubmitVoteUseCase
    private let verifyVoteUseCase: VerifyVoteUseCase
    private let blockchainService: BlockchainVoteService

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Init

    init(
        policyID: String,
        policyRepository: PolicyRepository,
        submitVoteUseCase: SubmitVoteUseCase,
        verifyVoteUseCase: VerifyVoteUseCase,
        blockchainService: BlockchainVoteService
    ) {
        self.policyID = policyID
        self.policyRepository = policyRepository
        self.submitVoteUseCase = submitVoteUseCase
        self.verifyVoteUseCase = verifyVoteUseCase
        self.blockchainService = blockchainService
        loadPolicy()
    }

    // MARK: - Public Intent

    func selectOption(_ optionID: String) {
        selectedOptionID = optionID
    }

    func confirmVote() {
        phase = .confirming
        authenticateWithBiometrics()
    }

    func clearError() {
        errorMessage = nil
    }

    // MARK: - Private

    private func loadPolicy() {
        Task {
            do {
                policy = try await policyRepository.policy(id: policyID)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
        policyRepository.voteOptions(policyID: policyID)
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { [weak self] opts in
                self?.options = opts
            })
            .store(in: &cancellables)
    }

    private func authenticateWithBiometrics() {
        let context = LAContext()
        var error: NSError?

        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            errorMessage = error?.localizedDescription ?? NSLocalizedString("error.biometric_unavailable", comment: "")
            phase = .selecting
            return
        }

        let reason = NSLocalizedString("biometric.reason", comment: "")
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { [weak self] success, authError in
            Task { @MainActor [weak self] in
                if success {
                    self?.submitVote()
                } else {
                    self?.phase = .selecting
                    self?.errorMessage = authError?.localizedDescription
                }
            }
        }
    }

    private func submitVote() {
        guard let optionID = selectedOptionID else { return }
        phase = .signing

        Task {
            do {
                let nullifier = blockchainService.deriveNullifier(
                    voterSecret: Data(repeating: 0, count: 32), // loaded from EncryptedKeyStore in production
                    policyID: policyID
                )
                let timestamp = Int64(Date().timeIntervalSince1970 * 1000)
                var payload = VotePayload(
                    policyID: policyID,
                    optionID: optionID,
                    voterNullifier: nullifier,
                    zkProof: ZKProof(piA: [], piB: [], piC: [], publicSignals: []),
                    signature: "",
                    timestamp: timestamp
                )
                let signature = try blockchainService.signVotePayload(payload)
                payload.signature = signature

                phase = .submitting
                let voteReceipt = try await submitVoteUseCase(payload)
                receipt = voteReceipt
                phase = .submitted

                await verifyOnChain(voteReceipt)
            } catch {
                phase = .error
                errorMessage = error.localizedDescription
            }
        }
    }

    private func verifyOnChain(_ voteReceipt: VoteReceipt) async {
        phase = .verifying
        do {
            let verified = try await verifyVoteUseCase(
                nullifier: voteReceipt.nullifier,
                policyID: policyID
            )
            phase = verified ? .verified : .error
        } catch {
            phase = .error
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Phase

enum VotePhase {
    case selecting
    case confirming
    case signing
    case submitting
    case submitted
    case verifying
    case verified
    case error
}
