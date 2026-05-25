import Foundation
import Combine

@MainActor
final class RegistrationViewModel: ObservableObject {

    enum RegistrationState {
        case idle
        case verifyingIdentity
        case submittingOnChain
        case registered(txHash: String?)
        case alreadyRegistered
        case error(String)
    }

    @Published var state: RegistrationState = .idle
    @Published var selectedAdapter: String = "govuk"

    private let baseURL: String
    private let session = URLSession.shared

    init(baseURL: String = ProcessInfo.processInfo.environment["API_BASE_URL"] ?? "http://localhost:3000") {
        self.baseURL = baseURL
    }

    /// Called after the citizen completes IdP authentication and receives a token.
    func register(token: String, adapter: String) async {
        state = .verifyingIdentity

        do {
            var req = URLRequest(url: URL(string: "\(baseURL)/api/v1/identity/register")!)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode([
                "adapter": adapter,
                "token":   token,
            ])
            req.timeoutInterval = 30

            state = .submittingOnChain
            let (data, response) = try await session.data(for: req)

            guard let http = response as? HTTPURLResponse, http.statusCode == 201 || http.statusCode == 200 else {
                let err = (try? JSONDecoder().decode(APIError.self, from: data))?.error ?? "Registration failed"
                throw RegistrationError.serverError(err)
            }

            let result = try JSONDecoder().decode(RegisterResponse.self, from: data)
            if result.alreadyRegistered {
                state = .alreadyRegistered
            } else {
                state = .registered(txHash: result.txHash)
            }
        } catch let e as RegistrationError {
            state = .error(e.message)
        } catch {
            state = .error(error.localizedDescription)
        }
    }

    // MARK: - Types

    private struct RegisterResponse: Decodable {
        let commitment: String
        let countryCode: String
        let txHash: String?
        let alreadyRegistered: Bool
    }
    private struct APIError: Decodable { let error: String }

    enum RegistrationError: Error {
        case serverError(String)
        var message: String {
            if case .serverError(let m) = self { return m }
            return "Unknown error"
        }
    }
}
