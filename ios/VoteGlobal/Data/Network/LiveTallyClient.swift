import Foundation
import Combine

/// Connects to the backend `/ws/tally` WebSocket endpoint and publishes
/// real-time `PolicyTally` updates for subscribed policies.
///
/// Usage:
/// ```swift
/// let client = LiveTallyClient(url: URL(string: "wss://api.thevoteapp.org/ws/tally")!)
/// client.subscribe(to: "pol-001")
/// client.tallyPublisher
///     .receive(on: DispatchQueue.main)
///     .sink { update in … }
///     .store(in: &cancellables)
/// await client.connect()
/// ```
@MainActor
public final class LiveTallyClient: NSObject, ObservableObject {

    // MARK: - Types

    public struct TallyUpdate: Decodable {
        public let type: String
        public let policyId: String
        public let tally: PolicyTallyDTO
        public let blockNumber: Int?
    }

    public struct PolicyTallyDTO: Decodable {
        public let policyId: String
        public let support: Int
        public let oppose: Int
        public let abstain: Int
        public let total: Int
        public let lastBlock: Int
        public let finalized: Bool
    }

    // MARK: - Public

    @Published public private(set) var connectionState: ConnectionState = .disconnected

    public enum ConnectionState { case disconnected, connecting, connected }

    public let tallySubject = PassthroughSubject<TallyUpdate, Never>()

    // MARK: - Private

    private let url: URL
    private var webSocketTask: URLSessionWebSocketTask?
    private var subscribedPolicies: Set<String> = []
    private let session = URLSession(configuration: .default)
    private let decoder = JSONDecoder()

    public init(url: URL) {
        self.url = url
    }

    // MARK: - Connection

    public func connect() async {
        guard connectionState == .disconnected else { return }
        connectionState = .connecting
        let task = session.webSocketTask(with: url)
        webSocketTask = task
        task.resume()
        connectionState = .connected

        // Re-subscribe to any already-tracked policies
        for policyId in subscribedPolicies {
            await send(["type": "subscribe", "policyId": policyId])
        }

        await receiveLoop()
    }

    public func disconnect() {
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        connectionState = .disconnected
    }

    public func subscribe(to policyId: String) {
        subscribedPolicies.insert(policyId)
        if connectionState == .connected {
            Task { await send(["type": "subscribe", "policyId": policyId]) }
        }
    }

    public func unsubscribe(from policyId: String) {
        subscribedPolicies.remove(policyId)
        if connectionState == .connected {
            Task { await send(["type": "unsubscribe", "policyId": policyId]) }
        }
    }

    // MARK: - Private

    private func receiveLoop() async {
        guard let task = webSocketTask else { return }
        while connectionState == .connected {
            do {
                let message = try await task.receive()
                if case .string(let text) = message, let data = text.data(using: .utf8) {
                    handleMessage(data)
                }
            } catch {
                connectionState = .disconnected
                break
            }
        }
    }

    private func handleMessage(_ data: Data) {
        guard let update = try? decoder.decode(TallyUpdate.self, from: data),
              update.type == "tally" || update.type == "snapshot" else { return }
        tallySubject.send(update)
    }

    private func send(_ dict: [String: String]) async {
        guard let task = webSocketTask,
              let data = try? JSONSerialization.data(withJSONObject: dict),
              let text = String(data: data, encoding: .utf8) else { return }
        try? await task.send(.string(text))
    }
}
