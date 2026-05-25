import Foundation

enum AppConfig {
    /// Reads from Info.plist keys injected at build time via xcconfig files.
    /// Never hard-code secrets here.
    static var apiBaseURL: URL {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
              let url = URL(string: raw) else {
            fatalError("API_BASE_URL not configured in Info.plist")
        }
        return url
    }

    static var rpcURL: URL {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "RPC_URL") as? String,
              let url = URL(string: raw) else {
            fatalError("RPC_URL not configured in Info.plist")
        }
        return url
    }

    static var contractAddress: String {
        guard let address = Bundle.main.object(forInfoDictionaryKey: "CONTRACT_ADDRESS") as? String else {
            fatalError("CONTRACT_ADDRESS not configured in Info.plist")
        }
        return address
    }
}
