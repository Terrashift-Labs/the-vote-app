import SwiftUI

struct ResultsView: View {
    let policyId: String
    @StateObject private var viewModel = ResultsViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                switch viewModel.state {
                case .idle, .loading:
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                case .loaded(let tally):
                    ScrollView {
                        TallyCard(tally: tally)
                            .padding()
                    }
                case .failed(let msg):
                    ContentUnavailableView("Results Unavailable", systemImage: "chart.bar.xaxis",
                                          description: Text(msg))
                }
            }
            .navigationTitle(String(localized: "results_title"))
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

// MARK: - Tally Card

private struct TallyCard: View {
    let tally: TallyModel

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text(String(localized: "total_votes \(tally.total)"))
                    .font(.headline)
                Spacer()
                if tally.finalized {
                    Label("Finalised", systemImage: "checkmark.seal.fill")
                        .font(.caption)
                        .foregroundStyle(.green)
                }
            }

            Divider()

            TallyRow(label: String(localized: "option_support"), count: tally.support, total: tally.total)
            TallyRow(label: String(localized: "option_oppose"),  count: tally.oppose,  total: tally.total)
            TallyRow(label: String(localized: "option_abstain"), count: tally.abstain, total: tally.total)

            Divider()

            Text("Last verified at block \(tally.lastBlock)")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct TallyRow: View {
    let label: String
    let count: Int
    let total: Int

    private var fraction: Double {
        total > 0 ? Double(count) / Double(total) : 0
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label).font(.body)
                Spacer()
                Text("\(count) (\(Int(fraction * 100))%)")
                    .font(.body)
                    .monospacedDigit()
            }
            ProgressView(value: fraction)
                .tint(.accentColor)
        }
    }
}

// MARK: - ViewModel

@MainActor
final class ResultsViewModel: ObservableObject {
    enum State { case idle, loading, loaded(TallyModel), failed(String) }
    @Published var state: State = .idle

    private let apiBase = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String ?? ""

    func load(policyId: String) async {
        state = .loading
        do {
            guard let url = URL(string: "\(apiBase)/api/v1/policy/\(policyId)/results") else {
                throw URLError(.badURL)
            }
            let (data, response) = try await URLSession.shared.data(from: url)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else {
                throw URLError(.badServerResponse)
            }
            let json = try JSONDecoder().decode(ResultsResponse.self, from: data)
            state = .loaded(json.tally)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}

// MARK: - Models

struct TallyModel: Decodable {
    let support: Int
    let oppose: Int
    let abstain: Int
    let total: Int
    let lastBlock: Int
    let finalized: Bool
}

private struct ResultsResponse: Decodable {
    let policyId: String
    let tally: TallyModel
}
