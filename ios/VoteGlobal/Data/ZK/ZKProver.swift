import Foundation
import WebKit

/**
 * ZKProver — client-side Groth16 proof generation via snarkjs WASM.
 *
 * Runs snarkjs inside a hidden WKWebView backed by bundled circuit artifacts
 * (vote_eligibility.wasm + vote_eligibility_final.zkey in the app bundle).
 *
 * The private key never leaves the device. No server trust required.
 */
@MainActor
final class ZKProver: NSObject {

    struct ProofInput {
        let nullifier: String    // 32-byte hex
        let secret: String       // 32-byte hex — never transmitted
        let merkleRoot: String
        let merklePath: [String]
        let policyId: String
    }

    private var webView: WKWebView?
    private var continuation: CheckedContinuation<ZkProof, Error>?

    /**
     * Generate a Groth16 ZK proof of vote eligibility.
     * Loads the prover worker page once and reuses it for subsequent calls.
     */
    func prove(input: ProofInput) async throws -> ZkProof {
        let wv = try getOrCreateWebView()

        return try await withCheckedThrowingContinuation { cont in
            self.continuation = cont

            guard
                let workerURL = Bundle.main.url(forResource: "prover_worker", withExtension: "html", subdirectory: "zk")
            else {
                cont.resume(throwing: ZKProverError.missingCircuitArtifacts)
                return
            }

            let inputJSON: [String: Any] = [
                "nullifier": input.nullifier,
                "secret": input.secret,
                "merkleRoot": input.merkleRoot,
                "merklePath": input.merklePath,
                "policyId": input.policyId
            ]

            guard let inputData = try? JSONSerialization.data(withJSONObject: inputJSON),
                  let inputStr = String(data: inputData, encoding: .utf8) else {
                cont.resume(throwing: ZKProverError.invalidInput)
                return
            }

            let msg = #"{"type":"prove","inputs":\#(inputStr)}"#

            // Load page, then send message once loaded (delegate handles timing)
            wv.pendingMessage = msg
            wv.loadFileURL(workerURL, allowingReadAccessTo: workerURL.deletingLastPathComponent())
        }
    }

    // MARK: - Private

    private func getOrCreateWebView() throws -> ProverWebView {
        if let existing = webView as? ProverWebView { return existing }

        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")

        let handler = ProverMessageHandler { [weak self] result in
            Task { @MainActor in
                self?.handleProverResult(result)
            }
        }
        config.userContentController.add(handler, name: "ProverCallback")

        let wv = ProverWebView(frame: .zero, configuration: config)
        wv.navigationDelegate = wv
        webView = wv
        return wv
    }

    private func handleProverResult(_ result: Result<ZkProof, Error>) {
        continuation?.resume(with: result)
        continuation = nil
    }
}

// MARK: - ProverWebView (internal WKWebView subclass)

private final class ProverWebView: WKWebView, WKNavigationDelegate {
    var pendingMessage: String?

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let msg = pendingMessage else { return }
        pendingMessage = nil
        let escaped = msg.replacingOccurrences(of: "'", with: "\\'")
        evaluateJavaScript("window.receiveMessage('\(escaped)')", completionHandler: nil)
    }
}

// MARK: - Message Handler

private final class ProverMessageHandler: NSObject, WKScriptMessageHandler {
    private let callback: (Result<ZkProof, Error>) -> Void

    init(callback: @escaping (Result<ZkProof, Error>) -> Void) {
        self.callback = callback
    }

    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? String,
              let data = body.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            callback(.failure(ZKProverError.malformedProofResponse))
            return
        }

        if let error = json["error"] as? String {
            callback(.failure(ZKProverError.provingFailed(error)))
            return
        }

        guard
            let proof = json["proof"] as? [String: Any],
            let piA = proof["pi_a"] as? [String],
            let piB = (proof["pi_b"] as? [[String]])?.flatMap({ $0 }),
            let piC = proof["pi_c"] as? [String],
            let signals = json["publicSignals"] as? [String]
        else {
            callback(.failure(ZKProverError.malformedProofResponse))
            return
        }

        callback(.success(ZkProof(pi_a: piA, pi_b: piB, pi_c: piC, publicSignals: signals)))
    }
}

// MARK: - ZkProof model (mirrors Android/backend)

struct ZkProof: Codable {
    let pi_a: [String]
    let pi_b: [String]
    let pi_c: [String]
    let publicSignals: [String]
}

// MARK: - Errors

enum ZKProverError: LocalizedError {
    case missingCircuitArtifacts
    case invalidInput
    case provingFailed(String)
    case malformedProofResponse

    var errorDescription: String? {
        switch self {
        case .missingCircuitArtifacts: return "Circuit WASM/zkey files not found in app bundle"
        case .invalidInput:            return "Invalid ZK proof inputs"
        case .provingFailed(let msg):  return "ZK proving failed: \(msg)"
        case .malformedProofResponse:  return "Malformed proof response from prover"
        }
    }
}
