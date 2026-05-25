import CryptoKit
import Foundation

/**
 * ReceiptDecryptor — on-device decryption of IPFS-stored vote receipts.
 *
 * The voter's P-256 private key (in the Secure Enclave) is used to derive
 * a shared AES-256-GCM key via ECDH with the backend's ephemeral public key.
 * Only the voter's device can decrypt the receipt — the backend holds only
 * the ciphertext.
 */
struct ReceiptDecryptor {

    /// Decrypt an encrypted receipt blob fetched from IPFS.
    /// - Parameters:
    ///   - blob: JSON string from IPFS (contains nonce, tag, ciphertext, backendPubHex)
    ///   - privateKey: Voter's P-256 private key from Secure Enclave
    static func decrypt(blob: Data, privateKey: P256.KeyAgreement.PrivateKey) throws -> [String: Any] {
        guard let json = try JSONSerialization.jsonObject(with: blob) as? [String: Any],
              let nonce    = (json["nonce"]      as? String).flatMap({ Data(hexString: $0) }),
              let tag      = (json["tag"]        as? String).flatMap({ Data(hexString: $0) }),
              let ciphertext = (json["ciphertext"] as? String).flatMap({ Data(hexString: $0) }),
              let pubHex   = json["voterPubHex"] as? String,
              let backendPub = try? P256.KeyAgreement.PublicKey(compressedRepresentation: Data(hexString: pubHex)!)
        else {
            throw ReceiptError.malformedBlob
        }

        // ECDH shared secret
        let sharedSecret = try privateKey.sharedSecretFromKeyAgreement(with: backendPub)

        // HKDF → AES-256-GCM key
        let symmetricKey = sharedSecret.hkdfDerivedSymmetricKey(
            using: SHA256.self,
            salt: Data("receipt-encryption".utf8),
            sharedInfo: Data(),
            outputByteCount: 32
        )

        // AES-256-GCM decrypt
        let sealedBox = try AES.GCM.SealedBox(
            nonce: AES.GCM.Nonce(data: nonce),
            ciphertext: ciphertext,
            tag: tag
        )
        let plaintext = try AES.GCM.open(sealedBox, using: symmetricKey)

        guard let result = try JSONSerialization.jsonObject(with: plaintext) as? [String: Any] else {
            throw ReceiptError.invalidPlaintext
        }
        return result
    }
}

enum ReceiptError: LocalizedError {
    case malformedBlob, invalidPlaintext
    var errorDescription: String? {
        switch self {
        case .malformedBlob:     return "Receipt blob is malformed or missing fields"
        case .invalidPlaintext:  return "Decrypted receipt is not valid JSON"
        }
    }
}

private extension Data {
    init?(hexString: String) {
        var hex = hexString
        if hex.hasPrefix("0x") { hex = String(hex.dropFirst(2)) }
        guard hex.count % 2 == 0 else { return nil }
        var data = Data()
        var index = hex.startIndex
        while index < hex.endIndex {
            let next = hex.index(index, offsetBy: 2)
            guard let byte = UInt8(hex[index..<next], radix: 16) else { return nil }
            data.append(byte)
            index = next
        }
        self = data
    }
}
