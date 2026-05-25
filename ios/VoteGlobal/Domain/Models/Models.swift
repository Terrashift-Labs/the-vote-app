import Foundation

// MARK: - Country

struct Country: Identifiable, Codable, Hashable {
    let id: String              // ISO 3166-1 alpha-2
    let name: String
    let flagURL: URL?
    let activeElectionID: String?

    var code: String { id }
}

// MARK: - Policy

struct Policy: Identifiable, Codable, Hashable {
    let id: String
    let countryCode: String
    let title: String
    let description: String
    let category: PolicyCategory
    let documentURL: URL?
    let votingDeadline: Date
    let status: PolicyStatus
}

enum PolicyCategory: String, Codable, CaseIterable {
    case healthcare, education, economy, environment, defence, infrastructure, justice, other

    var localizedName: String {
        NSLocalizedString("category.\(rawValue)", comment: "")
    }
}

enum PolicyStatus: String, Codable {
    case open, closed, tallying, finalised
}

// MARK: - Vote

struct VoteOption: Identifiable, Codable, Hashable {
    let id: String
    let policyID: String
    let label: String
    let description: String
}

struct VotePayload: Codable {
    let policyID: String
    let optionID: String
    let voterNullifier: String  // H(voterSecret || policyID) — unlinkable to identity
    let zkProof: ZKProof
    var signature: String       // ECDSA, signed locally before submission
    let timestamp: Int64
}

struct ZKProof: Codable {
    let piA: [String]
    let piB: [[String]]
    let piC: [String]
    let publicSignals: [String]

    enum CodingKeys: String, CodingKey {
        case piA = "pi_a", piB = "pi_b", piC = "pi_c", publicSignals
    }
}

struct VoteReceipt: Codable, Identifiable {
    let id: String              // transaction hash
    let transactionHash: String
    let blockNumber: Int64
    let nullifier: String       // keep this to verify your vote later
    let timestamp: Date

    var shortHash: String { String(transactionHash.prefix(10)) + "…" }
}

struct PolicyResult: Codable {
    let policyID: String
    let totalVotes: Int64
    let breakdown: [String: Int64]  // optionID → count
    let verificationRoot: String    // Merkle root
    let isFinalised: Bool
}

// MARK: - Voter

struct Voter: Codable {
    let identityCommitment: String
    let countryCode: String
    let isVerified: Bool
}
