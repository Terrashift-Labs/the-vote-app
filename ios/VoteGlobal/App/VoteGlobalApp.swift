import SwiftUI

@main
struct TheVoteAppApp: App {

    @StateObject private var appContainer = AppContainer()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(appContainer)
                .environment(\.locale, appContainer.locale)
        }
    }
}
