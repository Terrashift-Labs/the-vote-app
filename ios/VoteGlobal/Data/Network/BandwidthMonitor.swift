import Combine
import Network

/**
 * BandwidthMonitor — detects low-connectivity conditions on iOS.
 *
 * Uses NWPathMonitor to observe interface changes.
 * Publishes isLowBandwidth as a Combine publisher for SwiftUI bindings.
 */
final class BandwidthMonitor: ObservableObject {
    static let shared = BandwidthMonitor()

    @Published private(set) var isLowBandwidth = false

    private let monitor = NWPathMonitor()
    private let queue   = DispatchQueue(label: "bandwidth-monitor", qos: .utility)

    init() {
        monitor.pathUpdateHandler = { [weak self] path in
            let cellular  = path.usesInterfaceType(.cellular)
            let wifi      = path.usesInterfaceType(.wifi)
            let expensive = path.isExpensive       // cellular or personal hotspot
            let constrained = path.isConstrained   // Low Data Mode

            // Low-bandwidth: on cellular without Wi-Fi, or Low Data Mode enabled
            let low = (cellular && !wifi) || constrained
            DispatchQueue.main.async { self?.isLowBandwidth = low }
        }
        monitor.start(queue: queue)
    }

    deinit { monitor.cancel() }

    /// Manual override (from user settings).
    func setManualOverride(_ low: Bool) {
        DispatchQueue.main.async { self.isLowBandwidth = low }
    }
}
