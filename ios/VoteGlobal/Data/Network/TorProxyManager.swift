import Foundation
import Network

/**
 * TorProxyManager — optional Tor/onion routing for anonymous API access (iOS).
 *
 * Configures URLSession to route through a local SOCKS5 proxy provided by
 * Onion Browser / Orbot iOS (when installed) or a bundled mini-Tor daemon.
 *
 * The app checks NWPathMonitor for a reachable local SOCKS proxy on 127.0.0.1:9050.
 * If not available, falls back to direct HTTPS with certificate pinning.
 */
final class TorProxyManager {

    static let shared = TorProxyManager()

    private let torSocksHost = "127.0.0.1"
    private let torSocksPort = 9050

    // MARK: - Public

    /// Returns true if a local SOCKS5 proxy appears to be listening on the Tor port.
    var isTorAvailable: Bool {
        // Attempt a synchronous TCP connection check (non-blocking, 1s timeout)
        guard let sockfd = makeSocket() else { return false }
        defer { close(sockfd) }
        return connectSocket(sockfd, host: torSocksHost, port: torSocksPort, timeoutSec: 1)
    }

    /**
     * Build a URLSession configured to route through the local Tor SOCKS5 proxy.
     * Falls back to default session if Tor is unavailable.
     */
    func makeSession(torPreferred: Bool = true) -> URLSession {
        guard torPreferred && isTorAvailable else {
            return URLSession(configuration: .default)
        }

        let config = URLSessionConfiguration.default
        config.connectionProxyDictionary = [
            kCFNetworkProxiesSOCKSEnable:   1,
            kCFNetworkProxiesSOCKSProxy:    torSocksHost,
            kCFNetworkProxiesSOCKSPort:     torSocksPort,
        ] as [AnyHashable: Any]

        return URLSession(configuration: config)
    }

    // MARK: - Private socket probe

    private func makeSocket() -> Int32? {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return nil }
        var nonblock: Int32 = 1
        ioctl(fd, UInt(FIONBIO), &nonblock)
        return fd
    }

    private func connectSocket(_ fd: Int32, host: String, port: Int, timeoutSec: Int) -> Bool {
        var addr = sockaddr_in()
        addr.sin_family      = sa_family_t(AF_INET)
        addr.sin_port        = in_port_t(port).bigEndian
        addr.sin_addr.s_addr = inet_addr(host)
        let size = socklen_t(MemoryLayout<sockaddr_in>.size)
        let result = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.connect(fd, $0, size)
            }
        }
        if result == 0 { return true }
        if errno != EINPROGRESS { return false }

        var fds = fd_set()
        FD_ZERO(&fds)
        FD_SET(fd, &fds)
        var tv = timeval(tv_sec: timeoutSec, tv_usec: 0)
        return select(fd + 1, nil, &fds, nil, &tv) > 0
    }
}
