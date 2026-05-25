import SwiftUI

struct VoteView: View {
    @StateObject var viewModel: VoteViewModel
    var onVoteComplete: (String) -> Void
    var onBack: () -> Void

    var body: some View {
        Group {
            switch viewModel.phase {
            case .signing, .submitting, .verifying:
                LoadingView(phase: viewModel.phase)
            case .verified:
                VoteConfirmedView(receipt: viewModel.receipt!)
                    .onAppear {
                        if let txHash = viewModel.receipt?.transactionHash {
                            onVoteComplete(txHash)
                        }
                    }
            default:
                SelectionView(
                    policy: viewModel.policy,
                    options: viewModel.options,
                    selectedOptionID: $viewModel.selectedOptionID,
                    onSubmit: viewModel.confirmVote
                )
            }
        }
        .navigationTitle(viewModel.policy?.title ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(viewModel.phase != .selecting)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                if viewModel.phase == .selecting {
                    Button(action: onBack) {
                        Image(systemName: "chevron.left")
                    }
                }
            }
        }
        .alert(
            NSLocalizedString("error.title", comment: ""),
            isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.clearError() } }
            ),
            actions: {
                Button(NSLocalizedString("ok", comment: "")) { viewModel.clearError() }
            },
            message: {
                Text(viewModel.errorMessage ?? "")
            }
        )
    }
}

// MARK: - Sub-views

private struct SelectionView: View {
    let policy: Policy?
    let options: [VoteOption]
    @Binding var selectedOptionID: String?
    let onSubmit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let desc = policy?.description {
                Text(desc)
                    .font(.body)
                    .padding()
            }

            Text(NSLocalizedString("vote.select_option", comment: ""))
                .font(.headline)
                .padding(.horizontal)
                .padding(.top, 8)

            List(options) { option in
                OptionRow(
                    option: option,
                    isSelected: option.id == selectedOptionID,
                    onTap: { selectedOptionID = option.id }
                )
            }
            .listStyle(.insetGrouped)

            Button(action: onSubmit) {
                Text(NSLocalizedString("vote.submit", comment: ""))
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(selectedOptionID == nil ? Color.gray : Color.accentColor)
                    .foregroundColor(.white)
                    .cornerRadius(12)
            }
            .disabled(selectedOptionID == nil)
            .padding()
            .accessibilityHint(NSLocalizedString("vote.submit.hint", comment: ""))
        }
    }
}

private struct OptionRow: View {
    let option: VoteOption
    let isSelected: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundColor(isSelected ? .accentColor : .secondary)
                    .font(.title3)
                VStack(alignment: .leading) {
                    Text(option.label).font(.body.weight(.medium))
                    if !option.description.isEmpty {
                        Text(option.description).font(.caption).foregroundColor(.secondary)
                    }
                }
                Spacer()
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

private struct LoadingView: View {
    let phase: VotePhase

    var label: String {
        switch phase {
        case .signing:    return NSLocalizedString("vote.signing", comment: "")
        case .submitting: return NSLocalizedString("vote.submitting", comment: "")
        case .verifying:  return NSLocalizedString("vote.verifying", comment: "")
        default:          return ""
        }
    }

    var body: some View {
        VStack(spacing: 24) {
            ProgressView()
                .scaleEffect(1.5)
            Text(label)
                .font(.headline)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct VoteConfirmedView: View {
    let receipt: VoteReceipt

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 72))
                .foregroundColor(.green)
            Text(NSLocalizedString("vote.confirmed.title", comment: ""))
                .font(.title.bold())
            Text(NSLocalizedString("vote.confirmed.desc", comment: ""))
                .font(.body)
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
            Divider()
            Text("TX: \(receipt.shortHash)")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(32)
    }
}
