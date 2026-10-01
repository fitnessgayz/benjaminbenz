import Foundation
import SwiftUI
import WebKit

struct CoachWebAppView: View {
    @State private var isLoading = true
    @State private var loadError: CoachWebLoadError?
    @State private var reloadID = UUID()

    var body: some View {
        ZStack {
            FWBTheme.paper.ignoresSafeArea()

            CoachWebView(
                url: AppConfiguration.coachWebAppURL,
                reloadID: reloadID,
                isLoading: $isLoading,
                loadError: $loadError
            )

            if isLoading {
                loadingView
            }

            if let loadError {
                errorView(error: loadError)
            }
        }
    }

    private var loadingView: some View {
        ZStack {
            FWBTheme.inkDeep.ignoresSafeArea()
            VStack(spacing: 16) {
                Text("FWB Coach")
                    .font(.title.weight(.black))
                    .foregroundStyle(FWBTheme.surface)
                Text("Train with intention. Feel your progress.")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(FWBTheme.surface.opacity(0.76))
                    .multilineTextAlignment(.center)
                ProgressView()
                    .tint(FWBTheme.lime)
                    .padding(.top, 8)
                Text("Preparing your coaching workspace")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(FWBTheme.surface.opacity(0.76))
            }
            .padding(32)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("FWB Coach. Preparing your coaching workspace.")
    }

    private func errorView(error: CoachWebLoadError) -> some View {
        ZStack {
            FWBTheme.paper.ignoresSafeArea()

            VStack(spacing: 20) {
                VStack(spacing: 8) {
                    Text("FWB Coach")
                        .font(.headline.weight(.black))
                    Text("Train with intention. Feel your progress.")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(FWBTheme.muted)
                        .multilineTextAlignment(.center)
                }

                Image(systemName: error.systemImage)
                    .font(.system(size: 36, weight: .bold))
                    .foregroundStyle(FWBTheme.ink)

                VStack(spacing: 8) {
                    Text(error.title)
                        .font(.title2.weight(.black))
                        .multilineTextAlignment(.center)
                    Text(error.message)
                        .font(.subheadline)
                        .foregroundStyle(FWBTheme.muted)
                        .multilineTextAlignment(.center)
                }

                Button("Try again") {
                    loadError = nil
                    isLoading = true
                    reloadID = UUID()
                }
                .font(.headline.weight(.black))
                .foregroundStyle(FWBTheme.brandPrimaryInk)
                .padding(.horizontal, 28)
                .frame(minHeight: 50)
                .background(FWBTheme.lime, in: RoundedRectangle(cornerRadius: 14))
            }
            .padding(28)
            .background(FWBTheme.surface, in: RoundedRectangle(cornerRadius: 24))
            .overlay {
                RoundedRectangle(cornerRadius: 24)
                    .stroke(FWBTheme.border, lineWidth: 1)
            }
            .padding(24)
        }
    }
}

private enum CoachWebLoadError: Equatable {
    case offline
    case timedOut
    case unavailable

    init(_ error: Error) {
        let code = (error as NSError).code
        switch code {
        case NSURLErrorNotConnectedToInternet,
             NSURLErrorNetworkConnectionLost,
             NSURLErrorDataNotAllowed,
             NSURLErrorInternationalRoamingOff:
            self = .offline
        case NSURLErrorTimedOut:
            self = .timedOut
        default:
            self = .unavailable
        }
    }

    var title: String {
        switch self {
        case .offline:
            "You’re offline"
        case .timedOut:
            "This is taking longer than expected"
        case .unavailable:
            "Couldn’t open FWB Coach"
        }
    }

    var message: String {
        switch self {
        case .offline:
            "Your coaching data is safe. Reconnect and try again."
        case .timedOut:
            "Your coaching data is safe. Check your connection and try again."
        case .unavailable:
            "We couldn’t reach your coaching workspace. Try again in a moment."
        }
    }

    var systemImage: String {
        switch self {
        case .offline:
            "wifi.slash"
        case .timedOut:
            "clock"
        case .unavailable:
            "wifi.exclamationmark"
        }
    }
}

private struct CoachWebView: UIViewRepresentable {
    let url: URL
    let reloadID: UUID
    @Binding var isLoading: Bool
    @Binding var loadError: CoachWebLoadError?

    func makeCoordinator() -> Coordinator {
        Coordinator(isLoading: $isLoading, loadError: $loadError)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.isOpaque = false
        webView.backgroundColor = UIColor(named: "Canvas") ?? .systemBackground
        webView.scrollView.backgroundColor = UIColor(named: "Canvas") ?? .systemBackground
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        context.coordinator.lastReloadID = reloadID
        webView.load(URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.lastReloadID != reloadID else { return }
        context.coordinator.lastReloadID = reloadID
        webView.load(URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData))
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        @Binding private var isLoading: Bool
        @Binding private var loadError: CoachWebLoadError?
        var lastReloadID: UUID?

        init(isLoading: Binding<Bool>, loadError: Binding<CoachWebLoadError?>) {
            _isLoading = isLoading
            _loadError = loadError
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            isLoading = true
            loadError = nil
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            isLoading = false
            loadError = nil
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            show(error)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            show(error)
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let destination = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            let isFWBPage = destination.host?.hasSuffix("benjaminbenz.com") == true
            let isWebLink = destination.scheme == "http" || destination.scheme == "https"
            let opensNewWindow = navigationAction.targetFrame == nil

            if isFWBPage || (isWebLink && !opensNewWindow) {
                decisionHandler(.allow)
            } else {
                UIApplication.shared.open(destination)
                decisionHandler(.cancel)
            }
        }

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if let destination = navigationAction.request.url {
                UIApplication.shared.open(destination)
            }
            return nil
        }

        private func show(_ error: Error) {
            isLoading = false
            loadError = CoachWebLoadError(error)
        }
    }
}

#Preview {
    CoachWebAppView()
}
