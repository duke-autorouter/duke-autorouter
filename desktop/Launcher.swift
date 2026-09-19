import AppKit
import Foundation

// The helper is also used for explicit folder selection from the authenticated local UI.
if CommandLine.arguments.contains("--choose-folder") {
    let app = NSApplication.shared
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
    exit(0)
}

final class Launcher: NSObject, NSApplicationDelegate {
    private var service: Process?
    private var statusItem: NSStatusItem?
    private var startupTimer: Timer?
    private var localURL: URL?
    private var startedAt = Date()
    private var quitting = false
    private var pendingOpen = true
    private let fm = FileManager.default
    private var dataDirectory: URL!
    private var logHandle: FileHandle?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let mainMenu = NSMenu()
        let root = NSMenuItem()
        mainMenu.addItem(root)
        root.submenu = makeMenu()
        NSApplication.shared.mainMenu = mainMenu
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
        startService()
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
            startupTimer = Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { [weak self] _ in self?.checkReady() }
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
            let url = URL(string: base + "/#launch=" + token),
            url.host == "127.0.0.1", url.scheme == "http" else { return }
        localURL = url
        startupTimer?.invalidate()
        statusItem?.button?.toolTip = "DUKE is running on this Mac"
        if pendingOpen { openApp() }
    }

    @objc func openApp() {
        guard let url = localURL else { pendingOpen = true; return }
        pendingOpen = false
        NSWorkspace.shared.open(url)
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

let app = NSApplication.shared
let delegate = Launcher()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
