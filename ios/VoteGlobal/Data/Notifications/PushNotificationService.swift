import Foundation
import UIKit
import UserNotifications

/**
 * PushNotificationService — APNs token registration and notification handling.
 *
 * Registers the device token with the backend so the server can send
 * push notifications for vote deadlines and results.
 *
 * Notification payloads contain only (event, policyId) — no vote content
 * or personal data is ever transmitted.
 */
final class PushNotificationService: NSObject {

    static let shared = PushNotificationService()

    private let apiBase = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String ?? ""

    // MARK: - Registration

    func requestAuthorization() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    /**
     * Called from AppDelegate.application(_:didRegisterForRemoteNotificationsWithDeviceToken:)
     */
    func didRegisterForRemoteNotifications(deviceToken: Data) {
        let tokenString = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        Task { await registerWithBackend(token: tokenString) }
    }

    // MARK: - Notification handling

    /**
     * Called when a notification arrives while the app is in the foreground.
     * Returns .banner so the user sees it even while in-app.
     */
    func handleForegroundNotification(
        _ notification: UNNotification,
        completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    /**
     * Called when the user taps a notification.
     * Returns the policyId to navigate to, if present.
     */
    func handleNotificationResponse(_ response: UNNotificationResponse) -> String? {
        let userInfo = response.notification.request.content.userInfo
        return userInfo["policyId"] as? String
    }

    // MARK: - Private

    private func registerWithBackend(token: String) async {
        guard let userId = UserDefaults.standard.string(forKey: "userId"),
              let countryCode = UserDefaults.standard.string(forKey: "countryCode"),
              let url = URL(string: "\(apiBase)/api/v1/notifications/register")
        else { return }

        let body: [String: Any] = [
            "userId":      userId,
            "token":       token,
            "platform":    "ios",
            "countryCode": countryCode
        ]
        guard let bodyData = try? JSONSerialization.data(withJSONObject: body) else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = bodyData

        _ = try? await URLSession.shared.data(for: request)
    }
}
