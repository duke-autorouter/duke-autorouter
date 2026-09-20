import Foundation

// Only the launcher-owned loopback origin belongs inside the application window.
// A clicked web link may open in the browser; scripts and redirects cannot do so.
struct DesktopNavigationPolicy {
    enum Decision: String { case allow, download, external, cancel }
    let port: Int

    init?(baseURL: URL) {
        guard baseURL.scheme == "http", baseURL.host == "127.0.0.1",
              baseURL.user == nil, baseURL.password == nil,
              let port = baseURL.port, (1...65535).contains(port),
              baseURL.path.isEmpty || baseURL.path == "/",
              baseURL.query == nil, baseURL.fragment == nil else { return nil }
        self.port = port
    }

    func isAppURL(_ url: URL) -> Bool {
        url.scheme == "http" && url.host == "127.0.0.1" && url.port == port
            && url.user == nil && url.password == nil
    }

    func isAppBlob(_ url: URL) -> Bool {
        guard url.scheme == "blob", let origin = URL(string: String(url.absoluteString.dropFirst(5))) else { return false }
        return isAppURL(origin)
    }

    func allowsNativeControls(from url: URL, mainFrame: Bool) -> Bool {
        mainFrame && isAppURL(url) && (url.path.isEmpty || url.path == "/")
    }

    func decision(for url: URL, mainFrame: Bool, userActivated: Bool, requestsDownload: Bool) -> Decision {
        if isAppURL(url) { return requestsDownload ? .download : .allow }
        if isAppBlob(url) { return requestsDownload ? .download : .cancel }
        if !mainFrame && url.absoluteString == "about:blank" { return .allow }
        if userActivated && !requestsDownload && ["https", "http"].contains(url.scheme ?? ""),
           url.host != nil, url.user == nil, url.password == nil { return .external }
        return .cancel
    }
}
