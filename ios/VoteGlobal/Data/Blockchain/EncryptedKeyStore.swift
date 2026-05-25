import Foundation
import Security

/// Stores the ephemeral session private key in the iOS Keychain with
/// kSecAttrAccessibleWhenUnlockedThisDeviceOnly protection class.
///
/// The key never leaves the device in plaintext. On devices that support
/// the Secure Enclave, consider using SecureEnclave.P256 instead.
final class EncryptedKeyStore {

    private let service = "com.TheVoteApp.sessionkey"
    private let account = "ephemeral_session_key"

    func saveSessionKey(_ keyData: Data) throws {
        // Delete any existing entry first
        clearSessionKey()

        let query: [CFString: Any] = [
            kSecClass:              kSecClassGenericPassword,
            kSecAttrService:        service,
            kSecAttrAccount:        account,
            kSecValueData:          keyData,
            kSecAttrAccessible:     kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            kSecAttrSynchronizable: false   // never sync to iCloud
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeyStoreError.saveFailed(status)
        }
    }

    func loadSessionKey() -> Data? {
        let query: [CFString: Any] = [
            kSecClass:              kSecClassGenericPassword,
            kSecAttrService:        service,
            kSecAttrAccount:        account,
            kSecReturnData:         true,
            kSecMatchLimit:         kSecMatchLimitOne,
            kSecAttrSynchronizable: false
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess else { return nil }
        return result as? Data
    }

    func clearSessionKey() {
        let query: [CFString: Any] = [
            kSecClass:       kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}

enum KeyStoreError: Error {
    case saveFailed(OSStatus)
}
