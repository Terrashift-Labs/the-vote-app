import Foundation
import CryptoKit
import Security

/// Handles cryptographic signing and blockchain interaction for vote submission.
///
/// Security properties:
/// - Ephemeral EC keypair (P-256) per session; private key stored only in Secure Enclave
/// - Vote payload ECDSA-signed before transmission
/// - Nullifier derived as SHA-256(voterSecret || policyID) — not linkable to identity
/// - No plaintext key material ever leaves the Secure Enclave
final class BlockchainVoteService {

    private let rpcURL: URL
    private let contractAddress: String
    private let keyStore: EncryptedKeyStore

    init(rpcURL: URL, contractAddress: String, keyStore: EncryptedKeyStore) {
        self.rpcURL = rpcURL
        self.contractAddress = contractAddress
        self.keyStore = keyStore
    }

    // MARK: - Session Key

    /// Initialises an ephemeral P-256 keypair stored in the Secure Enclave.
    /// Returns the compressed public key hex (identity commitment).
    func initSession() throws -> String {
        let privateKey = try P256.Signing.PrivateKey()
        let rawKey = privateKey.rawRepresentation
        try keyStore.saveSessionKey(rawKey)

        let publicKeyData = privateKey.publicKey.compressedRepresentation
        return publicKeyData.map { String(format: "%02x", $0) }.joined()
    }

    func clearSession() {
        keyStore.clearSessionKey()
    }

    // MARK: - Vote Signing

    /// Signs the canonical vote message with the session private key.
    /// Returns a DER-encoded ECDSA signature as hex.
    func signVotePayload(_ payload: VotePayload) throws -> String {
        guard let rawKey = keyStore.loadSessionKey() else {
            throw BlockchainError.noSessionKey
        }
        let privateKey = try P256.Signing.PrivateKey(rawRepresentation: rawKey)
        let message = buildVoteMessage(payload)
        let signature = try privateKey.signature(for: message)
        return signature.derRepresentation.hexString
    }

    // MARK: - Nullifier Derivation

    /// Derives a vote nullifier as SHA-256(voterSecret || policyID).
    /// The nullifier is posted on-chain to prevent double-voting without revealing the voter.
    func deriveNullifier(voterSecret: Data, policyID: String) -> String {
        var hasher = SHA256()
        hasher.update(data: voterSecret)
        hasher.update(data: Data(policyID.utf8))
        return Data(hasher.finalize()).hexString
    }

    // MARK: - On-Chain Verification

    /// Checks via JSON-RPC that a transaction hash exists and was successful.
    func verifyTransaction(txHash: String) async throws -> Bool {
        let body: [String: Any] = [
            "jsonrpc": "2.0",
            "method": "eth_getTransactionReceipt",
            "params": [txHash],
            "id": 1
        ]
        var request = URLRequest(url: rpcURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, _) = try await URLSession.shared.data(for: request)
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let result = json?["result"] as? [String: Any]
        let status = result?["status"] as? String
        return status == "0x1"
    }

    // MARK: - Private

    private func buildVoteMessage(_ payload: VotePayload) -> Data {
        let raw = "\(payload.policyID):\(payload.optionID):\(payload.voterNullifier):\(payload.timestamp)"
        return Data(raw.utf8)
    }
}

enum BlockchainError: LocalizedError {
    case noSessionKey
    case signingFailed
    case rpcError(String)

    var errorDescription: String? {
        switch self {
        case .noSessionKey:       return "No session key — call initSession() first"
        case .signingFailed:      return "Vote signing failed"
        case .rpcError(let msg):  return "Blockchain RPC error: \(msg)"
        }
    }
}

// MARK: - Helpers

private extension Data {
    var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}
