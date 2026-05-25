import SwiftUI

// MARK: - Governance Proposal List

struct GovernanceView: View {
    @StateObject private var vm = GovernanceViewModel()

    var body: some View {
        NavigationStack {
            Group {
                switch vm.state {
                case .idle:
                    Color.clear.onAppear { Task { await vm.loadProposals() } }

                case .loading:
                    ProgressView(NSLocalizedString("loading", comment: ""))
                        .accessibilityLabel(NSLocalizedString("loading", comment: ""))

                case .error(let msg):
                    ContentUnavailableView(
                        NSLocalizedString("error_title", comment: ""),
                        systemImage: "exclamationmark.triangle",
                        description: Text(msg)
                    )
                    .accessibilityLabel("\(NSLocalizedString("error_title", comment: "")): \(msg)")

                case .loaded(let proposals) where proposals.isEmpty:
                    ContentUnavailableView(
                        "No Proposals",
                        systemImage: "doc.text.magnifyingglass",
                        description: Text("No governance proposals have been created yet.")
                    )

                case .loaded(let proposals):
                    List(proposals) { proposal in
                        NavigationLink(destination: ProposalDetailView(proposal: proposal, vm: vm)) {
                            ProposalRowView(proposal: proposal)
                        }
                    }
                    .refreshable { await vm.loadProposals() }
                }
            }
            .navigationTitle("DAO Governance")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { Task { await vm.loadProposals() } }) {
                        Image(systemName: "arrow.clockwise")
                    }
                    .accessibilityLabel(NSLocalizedString("retry", comment: ""))
                }
            }
        }
    }
}

// MARK: - Proposal Row

private struct ProposalRowView: View {
    let proposal: GovernanceProposal

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(proposal.state)
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .background(Color(proposal.stateColor).opacity(0.2))
                    .foregroundColor(Color(proposal.stateColor))
                    .clipShape(Capsule())
                Spacer()
                Text("#\(proposal.proposalId.prefix(6))…")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            Text(proposal.description.prefix(80))
                .font(.body)
                .lineLimit(2)
            VoteBarView(votes: proposal.votes)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Proposal \(proposal.state): \(proposal.description.prefix(60))")
    }
}

// MARK: - Proposal Detail

struct ProposalDetailView: View {
    let proposal: GovernanceProposal
    @ObservedObject var vm: GovernanceViewModel

    @State private var showConfirm = false
    @State private var selectedSupport: GovernanceViewModel.VoteSupport?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {

                // State badge
                HStack {
                    Text(proposal.state)
                        .font(.caption.weight(.semibold))
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(Color(proposal.stateColor).opacity(0.15))
                        .foregroundColor(Color(proposal.stateColor))
                        .clipShape(Capsule())
                    Spacer()
                }

                // Description
                GroupBox("Proposal") {
                    Text(proposal.description)
                        .font(.body)
                        .accessibilityLabel("Proposal description: \(proposal.description)")
                }

                // Vote tallies
                GroupBox("Current Votes") {
                    VStack(spacing: 12) {
                        VoteBarView(votes: proposal.votes)
                        HStack {
                            VoteTallyLabel(label: "For",     value: proposal.votes.for,     color: .green)
                            VoteTallyLabel(label: "Against", value: proposal.votes.against, color: .red)
                            VoteTallyLabel(label: "Abstain", value: proposal.votes.abstain, color: .secondary)
                        }
                    }
                }

                // Cast vote (only when Active)
                if proposal.state == "Active" {
                    GroupBox("Cast Your Vote") {
                        VStack(spacing: 12) {
                            ForEach([
                                (GovernanceViewModel.VoteSupport.for,     "For",     Color.green),
                                (.against, "Against", Color.red),
                                (.abstain, "Abstain", Color.secondary),
                            ], id: \.1) { support, label, color in
                                Button {
                                    selectedSupport = support
                                    showConfirm = true
                                } label: {
                                    Text(label)
                                        .frame(maxWidth: .infinity)
                                        .padding()
                                        .background(color.opacity(0.15))
                                        .foregroundColor(color)
                                        .clipShape(RoundedRectangle(cornerRadius: 10))
                                }
                                .disabled(vm.castingVote)
                                .accessibilityLabel("Vote \(label) on this proposal")
                            }

                            if vm.castingVote {
                                ProgressView("Submitting vote…")
                            }
                            if let result = vm.voteResult {
                                Text(result)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                                    .accessibilityLabel("Vote result: \(result)")
                            }
                        }
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Proposal")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(
            "Confirm your governance vote",
            isPresented: $showConfirm,
            titleVisibility: .visible
        ) {
            Button("Confirm") {
                guard let support = selectedSupport else { return }
                Task { await vm.castVote(proposalId: proposal.proposalId, support: support) }
            }
            Button("Cancel", role: .cancel) {}
        }
    }
}

// MARK: - Supporting Views

private struct VoteBarView: View {
    let votes: ProposalVotes

    var body: some View {
        GeometryReader { geo in
            let total = max(votes.total, 1)
            HStack(spacing: 2) {
                Rectangle().fill(Color.green)
                    .frame(width: geo.size.width * (votes.forDouble / total))
                Rectangle().fill(Color.red)
                    .frame(width: geo.size.width * (votes.againstDouble / total))
                Rectangle().fill(Color.gray.opacity(0.4))
            }
            .clipShape(Capsule())
        }
        .frame(height: 8)
        .accessibilityHidden(true)
    }
}

private struct VoteTallyLabel: View {
    let label: String
    let value: String
    let color: Color

    var body: some View {
        VStack {
            Text(value)
                .font(.headline)
                .foregroundColor(color)
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value) votes")
    }
}
