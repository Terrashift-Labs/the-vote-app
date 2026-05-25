import SwiftUI
import AuthenticationServices

/// Self-service voter registration screen.
///
/// Flow:
///   1. Citizen selects their country's identity provider
///   2. App opens the IdP OAuth/OIDC flow via ASWebAuthenticationSession
///   3. App receives the id_token in the callback URL
///   4. App calls POST /api/v1/identity/register
///   5. Shows confirmation with on-chain TX hash
struct RegistrationView: View {

    @StateObject private var vm = RegistrationViewModel()
    @State private var showIdPSheet = false

    // Adapter → display name mapping
    private let adapters: [(id: String, label: String, flag: String)] = [
        ("govuk",  "Gov.UK One Login",  "🇬🇧"),
        ("eidas",  "EU eIDAS",          "🇪🇺"),
        ("mock",   "Test (dev only)",   "🧪"),
    ]

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Register to Vote")
                            .font(.title2.bold())
                        Text("Verify your identity with your country's digital ID service. Your personal details never leave your device.")
                            .font(.callout)
                            .foregroundColor(.secondary)
                    }
                    .padding(.vertical, 4)
                }

                Section("Select your identity provider") {
                    ForEach(adapters, id: \.id) { adapter in
                        Button {
                            vm.selectedAdapter = adapter.id
                            showIdPSheet = true
                        } label: {
                            HStack {
                                Text(adapter.flag).font(.title2)
                                Text(adapter.label)
                                    .foregroundColor(.primary)
                                Spacer()
                                if vm.selectedAdapter == adapter.id {
                                    Image(systemName: "checkmark")
                                        .foregroundColor(.accentColor)
                                }
                            }
                        }
                        .accessibilityLabel("Register with \(adapter.label)")
                    }
                }

                Section {
                    statusView
                }
            }
            .navigationTitle("Voter Registration")
            .sheet(isPresented: $showIdPSheet) {
                IdPAuthSheet(adapter: vm.selectedAdapter, onToken: { token in
                    showIdPSheet = false
                    Task { await vm.register(token: token, adapter: vm.selectedAdapter) }
                })
            }
        }
    }

    @ViewBuilder
    private var statusView: some View {
        switch vm.state {
        case .idle:
            EmptyView()

        case .verifyingIdentity:
            Label("Verifying identity…", systemImage: "person.badge.shield.checkmark")
                .foregroundColor(.secondary)
                .accessibilityLabel("Verifying identity, please wait")

        case .submittingOnChain:
            Label("Registering on blockchain…", systemImage: "link.badge.plus")
                .foregroundColor(.secondary)
                .accessibilityLabel("Submitting registration to blockchain")

        case .alreadyRegistered:
            Label("Already registered — you're all set!", systemImage: "checkmark.seal.fill")
                .foregroundColor(.green)
                .accessibilityLabel("You are already registered to vote")

        case .registered(let txHash):
            VStack(alignment: .leading, spacing: 6) {
                Label("Registration confirmed!", systemImage: "checkmark.circle.fill")
                    .foregroundColor(.green)
                if let hash = txHash {
                    Text("TX: \(hash.prefix(18))…")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .accessibilityLabel("Transaction hash: \(hash)")
                }
                Text("You can now vote on active policies.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

        case .error(let msg):
            Label(msg, systemImage: "exclamationmark.triangle")
                .foregroundColor(.red)
                .accessibilityLabel("Registration error: \(msg)")
        }
    }
}

// MARK: - IdP Auth Sheet

/// Opens an ASWebAuthenticationSession for the chosen identity provider.
/// In production, each adapter has its own OAuth 2.0 / OIDC authorization URL.
/// This placeholder uses a mock callback for development.
private struct IdPAuthSheet: View {
    let adapter: String
    let onToken: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Image(systemName: "person.badge.key.fill")
                    .font(.system(size: 48))
                    .foregroundColor(.accentColor)

                Text("Redirecting to \(adapterLabel)…")
                    .font(.headline)

                Text("You will be asked to verify your identity with your government ID service.")
                    .multilineTextAlignment(.center)
                    .foregroundColor(.secondary)
                    .padding(.horizontal)

                Button("Continue to \(adapterLabel)") {
                    authenticate()
                }
                .buttonStyle(.borderedProminent)
                .accessibilityLabel("Continue to identity provider")
            }
            .padding()
            .navigationTitle("Identity Verification")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private var adapterLabel: String {
        switch adapter {
        case "govuk":  return "Gov.UK One Login"
        case "eidas":  return "EU eIDAS"
        default:       return "Test Provider"
        }
    }

    private func authenticate() {
        if adapter == "mock" {
            // Dev shortcut: return a mock token immediately
            let mockToken = #"{"sub":"test-citizen-\#(UUID().uuidString)","countryCode":"GB"}"#
            onToken(mockToken)
            return
        }

        // Production: use ASWebAuthenticationSession to open the real IdP
        // Replace with actual authorization URLs from each provider's docs
        let authURL = URL(string: "https://signin.example.gov/authorize?response_type=code&client_id=thevoteapp&redirect_uri=thevoteapp://auth")!
        let callbackScheme = "thevoteapp"

        let session = ASWebAuthenticationSession(url: authURL, callbackURLScheme: callbackScheme) { callbackURL, error in
            guard error == nil,
                  let url = callbackURL,
                  let code = URLComponents(url: url, resolvingAgainstBaseURL: false)?
                      .queryItems?.first(where: { $0.name == "id_token" })?.value
            else { return }
            onToken(code)
        }
        session.prefersEphemeralWebBrowserSession = true
        session.start()
    }
}
