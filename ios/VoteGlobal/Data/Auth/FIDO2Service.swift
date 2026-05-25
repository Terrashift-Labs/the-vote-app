import AuthenticationServices
import CryptoKit
import Foundation

/**
 * FIDO2Service — iOS WebAuthn / FIDO2 hardware security key support.
 *
 * Uses ASAuthorizationController to support both:
 *   • Platform authenticators (Face ID / Touch ID)
 *   • Cross-platform / roaming authenticators (USB-C / NFC security keys)
 *
 * Flow:
 *   Registration:
 *     1. Fetch challenge from /api/v1/fido2/register/options
 *     2. Present ASAuthorizationController with platform + security key requests
 *     3. Post credential to /api/v1/fido2/register/verify
 *
 *   Authentication:
 *     1. Fetch challenge from /api/v1/fido2/authenticate/options
 *     2. Present ASAuthorizationController
 *     3. Post assertion to /api/v1/fido2/authenticate/verify
 */
@MainActor
final class FIDO2Service: NSObject, ObservableObject {

    private let apiClient: VoteAPIClient

    // Continuations bridging the delegate callbacks back to async/await
    private var registrationContinuation: CheckedContinuation<String, Error>?
    private var authenticationContinuation: CheckedContinuation<Bool, Error>?

    private var pendingUserId: String = ""

    init(apiClient: VoteAPIClient) {
        self.apiClient = apiClient
    }

    // MARK: - Registration

    func register(userId: String, displayName: String, anchor: ASPresentationAnchor) async throws -> String {
        pendingUserId = userId

        // Fetch server challenge
        let options = try await apiClient.post(
            path: "/api/v1/fido2/register/options",
            body: ["userId": userId, "displayName": displayName]
        )
        guard
            let challengeB64 = options["challenge"] as? String,
            let challengeData = Data(base64URLEncoded: challengeB64),
            let rpId = (options["rp"] as? [String: Any])?["id"] as? String
        else {
            throw FIDO2Error.invalidServerResponse
        }

        let userIdData = userId.data(using: .utf8)!

        // Platform authenticator (Face ID / Touch ID)
        let platformProvider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
        let platformRequest = platformProvider.createCredentialRegistrationRequest(
            challenge: challengeData,
            name: userId,
            userID: userIdData
        )

        // Security key (FIDO2 USB/NFC)
        let securityKeyProvider = ASAuthorizationSecurityKeyPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
        let securityKeyRequest = securityKeyProvider.createCredentialRegistrationRequest(
            challenge: challengeData,
            displayName: displayName,
            name: userId,
            userID: userIdData
        )
        securityKeyRequest.credentialParameters = [
            ASAuthorizationPublicKeyCredentialParameters(algorithm: .ES256)
        ]

        return try await withCheckedThrowingContinuation { continuation in
            self.registrationContinuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: [platformRequest, securityKeyRequest])
            controller.delegate = self
            controller.presentationContextProvider = AnchorProvider(anchor: anchor)
            controller.performRequests()
        }
    }

    // MARK: - Authentication

    func authenticate(userId: String, anchor: ASPresentationAnchor) async throws -> Bool {
        pendingUserId = userId

        let options = try await apiClient.post(
            path: "/api/v1/fido2/authenticate/options",
            body: ["userId": userId]
        )
        guard
            let challengeB64 = options["challenge"] as? String,
            let challengeData = Data(base64URLEncoded: challengeB64),
            let rpId = options["rpId"] as? String
        else {
            throw FIDO2Error.invalidServerResponse
        }

        let platformProvider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
        let platformRequest = platformProvider.createCredentialAssertionRequest(challenge: challengeData)

        let securityKeyProvider = ASAuthorizationSecurityKeyPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
        let securityKeyRequest = securityKeyProvider.createCredentialAssertionRequest(challenge: challengeData)

        return try await withCheckedThrowingContinuation { continuation in
            self.authenticationContinuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: [platformRequest, securityKeyRequest])
            controller.delegate = self
            controller.presentationContextProvider = AnchorProvider(anchor: anchor)
            controller.performRequests()
        }
    }
}

// MARK: - ASAuthorizationControllerDelegate

extension FIDO2Service: ASAuthorizationControllerDelegate {

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        Task { @MainActor in
            do {
                switch authorization.credential {
                case let reg as ASAuthorizationPublicKeyCredentialRegistration:
                    let credentialId = try await finishRegistration(userId: pendingUserId, credential: reg)
                    registrationContinuation?.resume(returning: credentialId)
                    registrationContinuation = nil

                case let assertion as ASAuthorizationPublicKeyCredentialAssertion:
                    let verified = try await finishAuthentication(userId: pendingUserId, credential: assertion)
                    authenticationContinuation?.resume(returning: verified)
                    authenticationContinuation = nil

                default:
                    let err = FIDO2Error.unsupportedCredentialType
                    registrationContinuation?.resume(throwing: err)
                    authenticationContinuation?.resume(throwing: err)
                    registrationContinuation = nil
                    authenticationContinuation = nil
                }
            } catch {
                registrationContinuation?.resume(throwing: error)
                authenticationContinuation?.resume(throwing: error)
                registrationContinuation = nil
                authenticationContinuation = nil
            }
        }
    }

    nonisolated func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithError error: Error
    ) {
        Task { @MainActor in
            registrationContinuation?.resume(throwing: error)
            authenticationContinuation?.resume(throwing: error)
            registrationContinuation = nil
            authenticationContinuation = nil
        }
    }

    // MARK: - Backend round-trips

    private func finishRegistration(
        userId: String,
        credential: ASAuthorizationPublicKeyCredentialRegistration
    ) async throws -> String {
        let body: [String: Any] = [
            "userId": userId,
            "response": [
                "id": credential.credentialID.base64URLEncodedString(),
                "rawId": credential.credentialID.base64URLEncodedString(),
                "type": "public-key",
                "response": [
                    "clientDataJSON": credential.rawClientDataJSON.base64URLEncodedString(),
                    "attestationObject": (credential.rawAttestationObject ?? Data()).base64URLEncodedString()
                ]
            ]
        ]
        let response = try await apiClient.post(path: "/api/v1/fido2/register/verify", body: body)
        guard let credId = response["credentialId"] as? String else {
            throw FIDO2Error.invalidServerResponse
        }
        return credId
    }

    private func finishAuthentication(
        userId: String,
        credential: ASAuthorizationPublicKeyCredentialAssertion
    ) async throws -> Bool {
        let body: [String: Any] = [
            "userId": userId,
            "response": [
                "id": credential.credentialID.base64URLEncodedString(),
                "rawId": credential.credentialID.base64URLEncodedString(),
                "type": "public-key",
                "response": [
                    "clientDataJSON": credential.rawClientDataJSON.base64URLEncodedString(),
                    "authenticatorData": credential.rawAuthenticatorData.base64URLEncodedString(),
                    "signature": credential.signature.base64URLEncodedString(),
                    "userHandle": credential.userID?.base64URLEncodedString() ?? ""
                ]
            ]
        ]
        let response = try await apiClient.post(path: "/api/v1/fido2/authenticate/verify", body: body)
        return response["verified"] as? Bool ?? false
    }
}

// MARK: - Helpers

private final class AnchorProvider: NSObject, ASAuthorizationControllerPresentationContextProviding {
    private let anchor: ASPresentationAnchor
    init(anchor: ASPresentationAnchor) { self.anchor = anchor }
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { anchor }
}

private extension Data {
    /// RFC 4648 §5 base64url (no padding)
    func base64URLEncodedString() -> String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .trimmingCharacters(in: CharacterSet(charactersIn: "="))
    }

    init?(base64URLEncoded string: String) {
        var s = string
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let pad = s.count % 4
        if pad != 0 { s += String(repeating: "=", count: 4 - pad) }
        self.init(base64Encoded: s)
    }
}

enum FIDO2Error: LocalizedError {
    case invalidServerResponse
    case unsupportedCredentialType
    case verificationFailed

    var errorDescription: String? {
        switch self {
        case .invalidServerResponse:   return "Invalid response from authentication server"
        case .unsupportedCredentialType: return "Unsupported credential type"
        case .verificationFailed:      return "Security key verification failed"
        }
    }
}
