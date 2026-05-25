import CryptoKit
import Foundation

/**
 * GatewayResolver — discovers the live backend API URL without central DNS.
 *
 * Resolution order:
 *   1. UserDefaults cached URL from a previous successful resolution
 *   2. ENS text record on thevoteapp.eth (via Cloudflare ETH JSON-RPC)
 *   3. Hardcoded fallback URL baked into the app
 */
actor GatewayResolver {

    static let shared = GatewayResolver()

    private let cacheKey = "gateway_cached_api_url"
    private let ipfsGateways = [
        "https://ipfs.io/ipfs/",
        "https://cloudflare-ipfs.com/ipfs/",
        "https://gateway.pinata.cloud/ipfs/"
    ]
    private let ensRpcURL = URL(string: "https://cloudflare-eth.com/v1/mainnet")!
    private let fallbackURL = "https://api.thevoteapp.org"

    // MARK: - Public

    func resolveAPIURL() async -> String {
        // 1. Cache
        if let cached = UserDefaults.standard.string(forKey: cacheKey),
           !cached.isEmpty {
            return cached
        }
        // 2. ENS + IPFS manifest
        if let fromENS = await tryResolveViaENS() {
            await cacheURL(fromENS)
            return fromENS
        }
        // 3. Fallback
        return fallbackURL
    }

    func cacheURL(_ url: String) {
        UserDefaults.standard.set(url, forKey: cacheKey)
    }

    func clearCache() {
        UserDefaults.standard.removeObject(forKey: cacheKey)
    }

    // MARK: - Private

    private func tryResolveViaENS() async -> String? {
        guard let cid = await fetchENSTextRecord(name: "thevoteapp.eth", key: "gateway") else {
            return nil
        }
        return await fetchManifestFromCID(cid)
    }

    private func fetchENSTextRecord(name: String, key: String) async -> String? {
        let namehash = ensNameHash(name)
        let keyEncoded = abiEncodeString(key)
        // text(bytes32,string) selector: 0x59d1d43c
        let data = "0x59d1d43c" + namehash + keyEncoded

        let body: [String: Any] = [
            "jsonrpc": "2.0", "id": 1, "method": "eth_call",
            "params": [["to": "0x4976fb03C32e5B8cfe2b6cCB31c09Ba78EBaBa41", "data": data], "latest"]
        ]
        guard let bodyData = try? JSONSerialization.data(withJSONObject: body) else { return nil }

        var request = URLRequest(url: ensRpcURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = bodyData

        guard let (data, _) = try? await URLSession.shared.data(for: request),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let result = json["result"] as? String,
              result.count > 2
        else { return nil }

        return decodeABIString(result)
    }

    private func fetchManifestFromCID(_ cid: String) async -> String? {
        for gateway in ipfsGateways {
            guard let url = URL(string: "\(gateway)\(cid)") else { continue }
            guard let (data, _) = try? await URLSession.shared.data(from: url),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let endpoints = json["endpoints"] as? [String: Any],
                  let apiURL = endpoints["api"] as? String,
                  apiURL.hasPrefix("https://")
            else { continue }
            return apiURL
        }
        return nil
    }

    // MARK: - ENS helpers

    private func ensNameHash(_ name: String) -> String {
        var node = Data(repeating: 0, count: 32)
        let labels = name.split(separator: ".").map(String.init).reversed()
        for label in labels {
            let labelHash = SHA256.hash(data: Data(label.utf8))
            var combined = node
            combined.append(contentsOf: labelHash)
            node = Data(SHA256.hash(data: combined))
        }
        return node.map { String(format: "%02x", $0) }.joined().leftPad(toLength: 64, with: "0")
    }

    private func abiEncodeString(_ s: String) -> String {
        let bytes = Array(s.utf8)
        let offset = String(repeating: "0", count: 63) + "20"
        let length = String(bytes.count, radix: 16).leftPad(toLength: 64, with: "0")
        let data = bytes.map { String(format: "%02x", $0) }.joined()
            .padding(toLength: 64, withPad: "0", startingAt: 0)
        return offset + length + data
    }

    private func decodeABIString(_ hex: String) -> String? {
        let clean = hex.hasPrefix("0x") ? String(hex.dropFirst(2)) : hex
        guard clean.count >= 128 else { return nil }
        let offsetHex = clean.prefix(64)
        guard let offset = Int(offsetHex, radix: 16) else { return nil }
        let charOffset = offset * 2
        guard clean.count >= charOffset + 64 else { return nil }
        let lenHex = String(clean[clean.index(clean.startIndex, offsetBy: charOffset)...].prefix(64))
        guard let len = Int(lenHex, radix: 16), len > 0 else { return nil }
        let strStart = charOffset + 64
        guard clean.count >= strStart + len * 2 else { return nil }
        let strHex = String(clean[clean.index(clean.startIndex, offsetBy: strStart)...].prefix(len * 2))
        var result = ""
        var i = strHex.startIndex
        while i < strHex.endIndex {
            let next = strHex.index(i, offsetBy: 2)
            if let byte = UInt8(strHex[i..<next], radix: 16) {
                result.append(Character(UnicodeScalar(byte)))
            }
            i = next
        }
        return result
    }
}

private extension String {
    func leftPad(toLength length: Int, with pad: Character) -> String {
        guard count < length else { return self }
        return String(repeating: pad, count: length - count) + self
    }
}
