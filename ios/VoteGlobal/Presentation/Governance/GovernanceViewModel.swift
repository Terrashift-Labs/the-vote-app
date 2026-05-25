import Foundation
import Combine

// MARK: - Models

struct GovernanceProposal: Identifiable, Decodable {
    let proposalId: String
    let proposer: String
    let description: String
    let state: String
    let voteStart: Int
    let voteEnd: Int
    let votes: ProposalVotes

    var id: String { proposalId }

    var stateColor: String {
        switch state {
        case "Active":    return "statusOpen"
        case "Succeeded": return "statusFinalised"
        case "Defeated":  return "statusClosed"
        case "Executed":  return "statusFinalised"
        default:          return "statusTallying"
        }
    }
}

struct ProposalVotes: Decodable {
    let `for`: String
    let against: String
    let abstain: String

    var forDouble:     Double { Double(`for`)     ?? 0 }
    var againstDouble: Double { Double(against)   ?? 0 }
    var abstainDouble: Double { Double(abstain)   ?? 0 }
    var total:         Double { forDouble + againstDouble + abstainDouble }
}

// MARK: - ViewModel

@MainActor
final class GovernanceViewModel: ObservableObject {

    enum State {
        case idle, loading, loaded([GovernanceProposal]), error(String)
    }

    enum VoteSupport: Int { case against = 0, `for` = 1, abstain = 2 }

    @Published var state: State = .idle
    @Published var castingVote = false
    @Published var voteResult: String? = nil

    private let baseURL: String
    private let session = URLSession.shared

    init(baseURL: String = ProcessInfo.processInfo.environment["API_BASE_URL"] ?? "http://localhost:3000") {
        self.baseURL = baseURL
    }

    func loadProposals() async {
        state = .loading
        do {
            var req = URLRequest(url: URL(string: "\(baseURL)/api/v1/governance/proposals")!)
            req.timeoutInterval = 15
            let (data, _) = try await session.data(for: req)
            let decoded = try JSONDecoder().decode(ProposalsResponse.self, from: data)
            state = .loaded(decoded.proposals)
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    func castVote(proposalId: String, support: VoteSupport) async {
        castingVote = true
        voteResult  = nil
        defer { castingVote = false }

        do {
            var req = URLRequest(url: URL(string: "\(baseURL)/api/v1/governance/proposals/\(proposalId)/vote")!)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(["support": support.rawValue])
            let (data, response) = try await session.data(for: req)

            guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                let err = try? JSONDecoder().decode(APIError.self, from: data)
                throw URLError(.badServerResponse)
            }
            let result = try JSONDecoder().decode(TxResponse.self, from: data)
            voteResult = "TX: \(result.txHash)"
            await loadProposals() // refresh
        } catch {
            voteResult = "Vote failed: \(error.localizedDescription)"
        }
    }

    private struct ProposalsResponse: Decodable {
        let proposals: [GovernanceProposal]
    }
    private struct TxResponse: Decodable { let txHash: String }
    private struct APIError: Decodable   { let error: String }
}
