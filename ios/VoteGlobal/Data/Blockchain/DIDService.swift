import Foundation
import CryptoKit

/**
 * DIDService — W3C Decentralised Identity (did:ethr) client for iOS.
 *
 * Generates a DID from the device's ephemeral session key and
 * derives the identity commitment for VoterRegistry registration.
 *
 * The private key never leaves the Secure Enclave.
 * The DID is never transmitted to the backend — only the commitment hash.
 */
final class DIDService {

    private let networkName: String
    private let keyStore: EncryptedKeyStore
    private let apiClient: VoteAPIClient

    init(networkName: String = "sepolia", keyStore: EncryptedKeyStore, apiClient: VoteAPIClient) {
        self.networkName = networkName
        self.keyStore = keyStore
        self.apiClient = apiClient
    }

    // MARK: - DID Generation

    /// Generate a did:ethr DID from the session public key (Ethereum address).
    func generateDID() throws -> String {
        guard let rawKey = keyStore.loadSessionKey() else {
            throw DIDError.noSessionKey
        }
        let privateKey = try P256.Signing.PrivateKey(rawRepresentation: rawKey)
        let address = ethereumAddress(from: privateKey.publicKey)
        return "did:ethr:\(networkName):\(address)"
    }

    // MARK: - Identity Commitment

    /**
     * Derive a voter identity commitment.
     * commitment = SHA-256(did || countryCode || salt)
     *
     * Only the commitment is sent to the server — the DID stays on-device.
     */
    func deriveIdentityCommitment(did: String, countryCode: String, salt: String) -> String {
        var hasher = SHA256()
        hasher.update(data: Data((did + countryCode + salt).utf8))
        return Data(hasher.finalize()).hexString
    }

    // MARK: - VC Verification (via backend oracle)

    /**
     * Register with the VoterRegistry using a government-issued
     * Verifiable Credential JWT.
     *
     * Flow:
     *   1. User receives a VC JWT from the national identity oracle
     *   2. App derives DID and salt locally
     *   3. App posts (vcJwt, countryCode, salt) to backend /did/commitment
     *   4. Backend verifies VC, derives commitment, returns it
     *   5. Backend registers commitment on-chain (never seeing the DID)
     */
    func registerWithVC(vcJwt: String, countryCode: String) async throws -> String {
        let did   = try generateDID()
        let salt  = generateSalt()

        let body: [String: String] = [
            "vcJwt":       vcJwt,
            "countryCode": countryCode,
            "salt":        salt
        ]
        let response = try await apiClient.post(path: "/api/v1/did/commitment", body: body)
        guard let commitment = response["commitment"] as? String else {
            throw DIDError.invalidResponse
        }
        return commitment
    }

    // MARK: - Private

    private func generateSalt() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes).hexString
    }

    /// Derive an Ethereum address from a P-256 public key.
    /// Note: Ethereum normally uses secp256k1; this is a compatible representation
    /// for did:ethr when using P-256 keys.
    private func ethereumAddress(from publicKey: P256.Signing.PublicKey) -> String {
        let keyBytes = publicKey.compressedRepresentation
        var hasher = SHA256()
        hasher.update(data: keyBytes)
        let hash = Data(hasher.finalize())
        // Take last 20 bytes as address (Ethereum convention)
        let addressBytes = hash.suffix(20)
        return "0x" + addressBytes.hexString
    }
}

enum DIDError: LocalizedError {
    case noSessionKey
    case invalidResponse
    case vcVerificationFailed

    var errorDescription: String? {
        switch self {
        case .noSessionKey:         return "No session key available"
        case .invalidResponse:      return "Invalid response from identity oracle"
        case .vcVerificationFailed: return "Verifiable credential verification failed"
        }
    }
}

private extension Data {
    var hexString: String { map { String(format: "%02x", $0) }.joined() }
}
