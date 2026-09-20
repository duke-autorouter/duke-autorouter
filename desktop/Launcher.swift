import AppKit
import Foundation
import WebKit

@MainActor
final class Launcher: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandlerWithReply {
    private var service: Process?
    private var statusItem: NSStatusItem?
    private var startupTimer: Timer?
    private var localURL: URL?
    private var startedAt = Date()
    private var quitting = false
    private var window: NSWindow?
    private var webView: WKWebView?
    private var loadingView: NSStackView?
    private var navigationPolicy: DesktopNavigationPolicy?
    private struct SavedDownload {
        let download: WKDownload
        let temporary: URL
        let destination: URL
        let replaceExisting: Bool
    }
    private var downloads: [ObjectIdentifier: SavedDownload] = [:]
    private let fm = FileManager.default
    private var dataDirectory: URL!
    private var logHandle: FileHandle?

    func applicationDidFinishLaunching(_ notification: Notification) {
        makeApplicationMenu()
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let icon = NSImage(named: "MenuBarTemplate") {
            icon.isTemplate = true
            icon.size = NSSize(width: 22, height: 16)
            statusItem?.button?.image = icon
            statusItem?.button?.setAccessibilityLabel("DUKE Autorouter")
        } else {
            statusItem?.button?.title = "DUKE"
        }
        statusItem?.button?.toolTip = "DUKE Autorouter"
        statusItem?.menu = makeMenu()
        makeWindow()
        openApp()
        startService()
    }

    private func makeApplicationMenu() {
        let main = NSMenu()
        func submenu(_ title: String) -> NSMenu {
            let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
            let menu = NSMenu(title: title)
            item.submenu = menu
            main.addItem(item)
            return menu
        }
        let application = submenu("DUKE Autorouter")
        application.addItem(withTitle: "About DUKE Autorouter", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        application.addItem(.separator())
        application.addItem(withTitle: "Hide DUKE Autorouter", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = application.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        application.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        application.addItem(.separator())
        application.addItem(withTitle: "Quit DUKE Autorouter", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let file = submenu("File")
        let open = file.addItem(withTitle: "Open DUKE Autorouter", action: #selector(openApp), keyEquivalent: "o")
        open.target = self
        file.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        let edit = submenu("Edit")
        for (title, selector, key) in [("Undo", "undo:", "z"), ("Redo", "redo:", "Z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"), ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a")] {
            edit.addItem(withTitle: title, action: Selector(selector), keyEquivalent: key)
        }
        let view = submenu("View")
        let reload = view.addItem(withTitle: "Reload Interface", action: #selector(reloadInterface), keyEquivalent: "r")
        reload.target = self
        let windows = submenu("Window")
        windows.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windows.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windows.addItem(.separator())
        windows.addItem(withTitle: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        NSApplication.shared.windowsMenu = windows
        NSApplication.shared.mainMenu = main
    }

    private func makeWindow() {
        let frame = NSRect(x: 0, y: 0, width: 1200, height: 820)
        let window = NSWindow(contentRect: frame, styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "DUKE Autorouter"
        window.minSize = NSSize(width: 760, height: 540)
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.center()
        window.setFrameAutosaveName("DUKE Main Window")
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.addScriptMessageHandler(self, contentWorld: .page, name: "chooseFolder")
        let web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.translatesAutoresizingMaskIntoConstraints = false
        web.isHidden = true
        let spinner = NSProgressIndicator()
        spinner.style = .spinning
        spinner.startAnimation(nil)
        let label = NSTextField(labelWithString: "Starting DUKE…")
        label.font = .systemFont(ofSize: 18, weight: .medium)
        let loading = NSStackView(views: [spinner, label])
        loading.orientation = .vertical
        loading.spacing = 18
        loading.translatesAutoresizingMaskIntoConstraints = false
        let content = NSView()
        content.addSubview(web)
        content.addSubview(loading)
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            web.topAnchor.constraint(equalTo: content.topAnchor),
            web.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            loading.centerXAnchor.constraint(equalTo: content.centerXAnchor),
            loading.centerYAnchor.constraint(equalTo: content.centerYAnchor),
        ])
        window.contentView = content
        self.window = window
        self.webView = web
        self.loadingView = loading
    }

    private func makeMenu() -> NSMenu {
        let menu = NSMenu()
        let open = NSMenuItem(title: "Open DUKE Autorouter", action: #selector(openApp), keyEquivalent: "o")
        open.target = self
        menu.addItem(open)
        menu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit DUKE Autorouter", action: #selector(quitApp), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        return menu
    }

    private func startService() {
        do {
            guard let resources = Bundle.main.resourceURL, let executable = Bundle.main.executableURL else {
                throw NSError(domain: "DUKE", code: 1, userInfo: [NSLocalizedDescriptionKey: "The application bundle is incomplete."])
            }
            dataDirectory = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("DUKE Autorouter", isDirectory: true)
            try fm.createDirectory(at: dataDirectory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let logs = fm.urls(for: .libraryDirectory, in: .userDomainMask)[0].appendingPathComponent("Logs/DUKE Autorouter", isDirectory: true)
            try fm.createDirectory(at: logs, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let log = logs.appendingPathComponent("service.log")
            if let size = (try? fm.attributesOfItem(atPath: log.path)[.size]) as? NSNumber, size.intValue > 2_000_000 {
                let old = logs.appendingPathComponent("service.previous.log")
                if fm.fileExists(atPath: old.path) { try fm.removeItem(at: old) }
                try fm.moveItem(at: log, to: old)
            }
            if !fm.fileExists(atPath: log.path) { fm.createFile(atPath: log.path, contents: nil, attributes: [.posixPermissions: 0o600]) }
            logHandle = try FileHandle(forWritingTo: log)
            try logHandle?.seekToEnd()
            let process = Process()
            process.executableURL = resources.appendingPathComponent("runtime/bin/node")
            process.arguments = [resources.appendingPathComponent("app/server/index.js").path]
            process.currentDirectoryURL = dataDirectory
            process.environment = [
                "HOME": fm.homeDirectoryForCurrentUser.path,
                "PATH": resources.appendingPathComponent("runtime/bin").path + ":/usr/bin:/bin:/usr/sbin:/sbin",
                "TMPDIR": NSTemporaryDirectory(),
                "LANG": "en_US.UTF-8",
                "NODE_ENV": "production",
                "ROUTER_DATA_DIR": dataDirectory.path,
                "PORT": "0",
                "PLAYWRIGHT_BROWSERS_PATH": resources.appendingPathComponent("browsers").path,
                "DUKE_DESKTOP_EXECUTABLE": executable.path,
                "DUKE_PARENT_PID": String(ProcessInfo.processInfo.processIdentifier)
            ]
            process.standardOutput = logHandle
            process.standardError = logHandle
            process.terminationHandler = { [weak self] process in
                DispatchQueue.main.async {
                    guard let self = self, !self.quitting else { return }
                    self.startupTimer?.invalidate()
                    self.localURL = nil
                    self.showFailure("DUKE’s background service stopped. Your saved tasks are retained. Reopen DUKE to reconnect.\n\nDetails: ~/Library/Logs/DUKE Autorouter/service.log")
                }
            }
            service = process
            startedAt = Date()
            try process.run()
            startupTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in
                Task { @MainActor in self?.checkReady() }
            }
        } catch {
            showFailure(error.localizedDescription)
        }
    }

    private func checkReady() {
        if Date().timeIntervalSince(startedAt) > 45 {
            startupTimer?.invalidate()
            showFailure("DUKE did not finish starting. Reopen it to retry. Details are in ~/Library/Logs/DUKE Autorouter/service.log.")
            return
        }
        guard let process = service, process.isRunning,
            let bytes = try? Data(contentsOf: dataDirectory.appendingPathComponent("launch.json")),
            let payload = (try? JSONSerialization.jsonObject(with: bytes)) as? [String: Any],
            payload["pid"] as? Int32 == process.processIdentifier,
            let base = payload["url"] as? String,
            let token = payload["token"] as? String,
            let baseURL = URL(string: base),
            let policy = DesktopNavigationPolicy(baseURL: baseURL),
            let url = URL(string: base + "/#launch=" + token) else { return }
        navigationPolicy = policy
        localURL = url
        startupTimer?.invalidate()
        statusItem?.button?.toolTip = "DUKE is running on this Mac"
        webView?.load(URLRequest(url: url))
    }

    @objc func openApp() {
        guard let window = window else { return }
        if window.isMiniaturized { window.deminiaturize(nil) }
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }

    @objc private func reloadInterface() {
        guard let url = localURL else { return }
        webView?.load(URLRequest(url: url))
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url, let policy = navigationPolicy else { decisionHandler(.cancel); return }
        switch policy.decision(for: url, mainFrame: navigationAction.targetFrame?.isMainFrame ?? true, userActivated: navigationAction.navigationType == .linkActivated, requestsDownload: navigationAction.shouldPerformDownload) {
        case .allow: decisionHandler(.allow)
        case .download: decisionHandler(.download)
        case .external:
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        case .cancel: decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard let url = navigationResponse.response.url, let policy = navigationPolicy,
              policy.isAppURL(url) || policy.isAppBlob(url) else { decisionHandler(.cancel); return }
        let disposition = (navigationResponse.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
        decisionHandler(!navigationResponse.canShowMIMEType || disposition.lowercased().hasPrefix("attachment") ? .download : .allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url, navigationPolicy?.isAppURL(url) == true {
            webView.load(navigationAction.request)
        }
        return nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadingView?.isHidden = true
        webView.isHidden = false
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { reloadInterface() }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { navigationFailed(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { navigationFailed(error) }

    private func navigationFailed(_ error: Error) {
        let value = error as NSError
        if value.code == NSURLErrorCancelled || (value.domain == "WebKitErrorDomain" && value.code == 102) { return }
        showMessage("The interface couldn’t load", "Your saved work is retained. Use View → Reload Interface to retry.")
    }

    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        guard let window = window, let url = frame.request.url, navigationPolicy?.isAppURL(url) == true else { completionHandler(nil); return }
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.urls : nil) }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        guard message.name == "chooseFolder", let url = message.frameInfo.request.url,
              navigationPolicy?.allowsNativeControls(from: url, mainFrame: message.frameInfo.isMainFrame) == true,
              let body = message.body as? [String: String], let purpose = body["purpose"],
              ["project", "setup"].contains(purpose), let window = window else {
            replyHandler(nil, "Folder selection is unavailable here.")
            return
        }
        guard window.attachedSheet == nil else { replyHandler(nil, "Close the current dialog first."); return }
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = true
        panel.prompt = "Choose"
        panel.message = purpose == "setup" ? "Choose your setup folder." : "Choose your project folder."
        openApp()
        panel.beginSheetModal(for: window) { result in
            replyHandler(result == .OK ? ["path": panel.url?.path ?? ""] : [:], nil)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        showMessage("DUKE Autorouter", message) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        showMessage("DUKE Autorouter", message, cancel: true) { result in completionHandler(result == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    func download(_ download: WKDownload, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, decisionHandler: @escaping (WKDownload.RedirectPolicy) -> Void) {
        decisionHandler(request.url.map { navigationPolicy?.isAppURL($0) == true } == true ? .allow : .cancel)
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        guard let window = window else { completionHandler(nil); return }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = URL(fileURLWithPath: suggestedFilename).lastPathComponent
        panel.directoryURL = fm.urls(for: .downloadsDirectory, in: .userDomainMask).first
        panel.canCreateDirectories = true
        panel.beginSheetModal(for: window) { [weak self] result in
            guard let self = self, result == .OK, let destination = panel.url else { completionHandler(nil); return }
            // WebKit requires a new file. Replace a user-approved existing file only
            // after the complete download succeeds, never when the save dialog closes.
            let temporary = destination.deletingLastPathComponent().appendingPathComponent(".duke-download-" + UUID().uuidString)
            self.downloads[ObjectIdentifier(download)] = SavedDownload(download: download, temporary: temporary, destination: destination, replaceExisting: self.fm.fileExists(atPath: destination.path))
            completionHandler(temporary)
        }
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let saved = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
        do {
            if saved.replaceExisting && fm.fileExists(atPath: saved.destination.path) {
                _ = try fm.replaceItemAt(saved.destination, withItemAt: saved.temporary)
            } else { try fm.moveItem(at: saved.temporary, to: saved.destination) }
        } catch {
            try? fm.removeItem(at: saved.temporary)
            showMessage("The file couldn’t be saved", error.localizedDescription)
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let saved = downloads.removeValue(forKey: ObjectIdentifier(download)) { try? fm.removeItem(at: saved.temporary) }
        if (error as NSError).code != NSURLErrorCancelled { showMessage("The download couldn’t finish", error.localizedDescription) }
    }

    private func showMessage(_ title: String, _ message: String, cancel: Bool = false, completion: @escaping (NSApplication.ModalResponse) -> Void = { _ in }) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.addButton(withTitle: "OK")
        if cancel { alert.addButton(withTitle: "Cancel") }
        if let window = window { alert.beginSheetModal(for: window, completionHandler: completion) }
        else { completion(alert.runModal()) }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        openApp()
        return false
    }

    @objc func quitApp() { NSApplication.shared.terminate(nil) }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if quitting { return .terminateNow }
        quitting = true
        startupTimer?.invalidate()
        for saved in downloads.values {
            saved.download.cancel { _ in }
            try? fm.removeItem(at: saved.temporary)
        }
        downloads.removeAll()
        guard let process = service, process.isRunning else { return .terminateNow }
        process.terminate()
        DispatchQueue.global().async {
            let deadline = Date().addingTimeInterval(10)
            while process.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.1) }
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
            DispatchQueue.main.async { sender.reply(toApplicationShouldTerminate: true) }
        }
        return .terminateLater
    }

    private func showFailure(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "DUKE couldn’t start"
        alert.informativeText = message
        alert.addButton(withTitle: "Quit")
        NSApplication.shared.activate(ignoringOtherApps: true)
        alert.runModal()
        NSApplication.shared.terminate(nil)
    }
}

@main
struct DUKEApplication {
    @MainActor static func main() {
        let app = NSApplication.shared
        // This separate helper process remains available to the authenticated UI.
        if CommandLine.arguments.contains("--choose-folder") {
            app.setActivationPolicy(.accessory)
            let panel = NSOpenPanel()
            panel.canChooseDirectories = true
            panel.canChooseFiles = false
            panel.allowsMultipleSelection = false
            panel.canCreateDirectories = true
            panel.message = CommandLine.arguments.contains("--setup-source")
                ? "Choose the folder containing your instructions, preferences or skills. You will review the files before DUKE uses them."
                : "Choose the project folder where DUKE can work."
            app.activate(ignoringOtherApps: true)
            if panel.runModal() == .OK, let url = panel.url { print(url.path) }
            return
        }
        let delegate = Launcher()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        withExtendedLifetime(delegate) { app.run() }
    }
}
