import SwiftUI
import WebKit

/**
 * PolicyDocumentView — displays an IPFS-hosted policy document.
 *
 * The backend serves the document via /api/v1/ipfs/:cid.
 * Content is content-addressed: the CID is recorded on-chain in
 * PolicyRegistry, so any tampering changes the CID and breaks the link.
 */
struct PolicyDocumentView: View {

    let policyId: String
    @StateObject private var viewModel = PolicyDocumentViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                switch viewModel.state {
                case .idle, .loading:
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)

                case .loaded(let url):
                    IPFSWebView(url: url)
                        .ignoresSafeArea(edges: .bottom)

                case .failed(let message):
                    ContentUnavailableView(
                        "Document Unavailable",
                        systemImage: "doc.slash",
                        description: Text(message)
                    )
                }
            }
            .navigationTitle(String(localized: "read_document"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "back")) { dismiss() }
                }
            }
            .task { await viewModel.load(policyId: policyId) }
        }
    }
}

// MARK: - WebKit wrapper

private struct IPFSWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.isTextInteractionEnabled = true
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.allowsBackForwardNavigationGestures = true
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        uiView.load(URLRequest(url: url))
    }
}

// MARK: - ViewModel

@MainActor
final class PolicyDocumentViewModel: ObservableObject {

    enum State {
        case idle
        case loading
        case loaded(URL)
        case failed(String)
    }

    @Published var state: State = .idle

    private let apiBase: String = Bundle.main
        .object(forInfoDictionaryKey: "API_BASE_URL") as? String ?? ""

    func load(policyId: String) async {
        state = .loading
        do {
            // Fetch the policy CID from backend, then construct IPFS gateway URL
            let cid = try await fetchCID(for: policyId)
            guard let url = URL(string: "\(apiBase)/api/v1/ipfs/\(cid)") else {
                state = .failed("Invalid document URL")
                return
            }
            state = .loaded(url)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    private func fetchCID(for policyId: String) async throws -> String {
        guard let url = URL(string: "\(apiBase)/api/v1/policy/\(policyId)/document-cid") else {
            throw URLError(.badURL)
        }
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard let cid = json?["cid"] as? String else {
            throw URLError(.cannotParseResponse)
        }
        return cid
    }
}
