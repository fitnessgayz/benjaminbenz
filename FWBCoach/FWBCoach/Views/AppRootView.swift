import SwiftUI

struct AppRootView: View {
    var body: some View {
        // FWB Coach currently ships as a native shell around the coach web app.
        // Keep authentication and product navigation in that single experience.
        CoachWebAppView()
    }
}
