import CoreImage
import CoreImage.CIFilterBuiltins
import SwiftUI

/**
 * QRBallotView — displays a QR-encoded signed ballot for offline submission.
 *
 * The QR payload contains (policyId, optionId, voterNullifier, signature, timestamp).
 * It can be scanned at a polling station kiosk or uploaded via the web app.
 * Valid for 30 days; replay-protected by the on-chain nullifier set.
 */
struct QRBallotView: View {
    let policyId: String
    let optionId: String

    @StateObject private var viewModel = QRBallotViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                switch viewModel.state {
                case .idle, .loading:
                    ProgressView("Generating ballot…")

                case .ready(let image):
                    Text("Show this QR code at any authorised polling station scanner or upload it via the web app.")
                        .multilineTextAlignment(.center)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal)

                    Image(uiImage: image)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 260, height: 260)
                        .padding()
                        .background(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .shadow(radius: 4)

                    Text("Valid for 30 days · One-time use")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    Button("Regenerate") {
                        Task { await viewModel.generate(policyId: policyId, optionId: optionId) }
                    }
                    .buttonStyle(.bordered)

                case .failed(let msg):
                    ContentUnavailableView("QR Generation Failed", systemImage: "qrcode",
                                          description: Text(msg))
                }
            }
            .padding()
            .navigationTitle("Offline Ballot")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .task { await viewModel.generate(policyId: policyId, optionId: optionId) }
        }
    }
}

// MARK: - ViewModel

@MainActor
final class QRBallotViewModel: ObservableObject {
    enum State { case idle, loading, ready(UIImage), failed(String) }
    @Published var state: State = .idle

    private let apiBase = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String ?? ""

    func generate(policyId: String, optionId: String) async {
        state = .loading
        do {
            let timestamp  = Int(Date().timeIntervalSince1970 * 1000)
            let nullifier  = deriveNullifier(policyId: policyId)
            let signature  = try await sign(policyId: policyId, optionId: optionId,
                                            nullifier: nullifier, timestamp: timestamp)

            let payload: [String: Any] = [
                "policyId":       policyId,
                "optionId":       optionId,
                "voterNullifier": nullifier,
                "signature":      signature,
                "timestamp":      timestamp
            ]
            guard let jsonData = try? JSONSerialization.data(withJSONObject: payload),
                  let jsonStr  = String(data: jsonData, encoding: .utf8) else {
                throw QRError.encodingFailed
            }

            guard let qrImage = generateQRImage(from: jsonStr) else {
                throw QRError.qrGenerationFailed
            }
            state = .ready(qrImage)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    private func deriveNullifier(policyId: String) -> String {
        // Stub — production reads the device key from the Keychain/Secure Enclave
        let data = Data((policyId + "device-secret").utf8)
        return "0x" + data.map { String(format: "%02x", $0) }.joined()
    }

    private func sign(policyId: String, optionId: String, nullifier: String, timestamp: Int) async throws -> String {
        // Stub — production signs with the Secure Enclave P-256 key
        return "0x" + Data((policyId + optionId + nullifier + "\(timestamp)").utf8)
            .map { String(format: "%02x", $0) }.joined()
    }

    private func generateQRImage(from string: String) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.setValue(Data(string.utf8), forKey: "inputMessage")
        filter.setValue("M", forKey: "inputCorrectionLevel")
        guard let output = filter.outputImage else { return nil }
        let scaled = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        let context = CIContext()
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}

enum QRError: LocalizedError {
    case encodingFailed, qrGenerationFailed
    var errorDescription: String? {
        switch self {
        case .encodingFailed:     return "Failed to encode ballot payload"
        case .qrGenerationFailed: return "Failed to generate QR code image"
        }
    }
}
