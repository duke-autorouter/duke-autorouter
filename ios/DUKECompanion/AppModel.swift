import Foundation
import UIKit

@MainActor
final class AppModel: ObservableObject {
    enum ConnectionState: Equatable {
        case unpaired
        case connecting
        case connected
        case unavailable(String)
    }

    @Published var connectionState: ConnectionState = .unpaired
    @Published var state: RemoteState?
    @Published var selectedTaskID: String?
    @Published var isSubmitting = false
    @Published var message: String?
    @Published var previewURL: URL?

    private let profileKey = "duke.connection-profile"
    private let credentials = CredentialStore()
    private var client: APIClient?

    init() {
        restoreConnection()
    }

    var selectedTask: RemoteTask? { state?.tasks.first { $0.id == selectedTaskID } }

    func pair(server: String, code: String) async {
        guard !isSubmitting else { return }
        isSubmitting = true
        connectionState = .connecting
        defer { isSubmitting = false }
        do {
            guard let url = URL(string: server.trimmingCharacters(in: .whitespacesAndNewlines)) else {
                throw APIClientError.invalidServer
            }
            let pairingClient = try APIClient(baseURL: url)
            let paired = try await pairingClient.pair(code: code.trimmingCharacters(in: .whitespacesAndNewlines), deviceName: UIDevice.current.name)
            try credentials.save(paired.credential)
            let profile = ConnectionProfile(serverURL: pairingClient.baseURL, deviceId: paired.device.id)
            UserDefaults.standard.set(try JSONEncoder().encode(profile), forKey: profileKey)
            client = try APIClient(baseURL: profile.serverURL, credential: paired.credential)
            await refresh()
        } catch {
            connectionState = .unavailable(message(for: error))
        }
    }

    func refresh() async {
        guard let client else { return }
        if state == nil { connectionState = .connecting }
        do {
            let latest = try await client.state()
            state = latest
            if selectedTaskID == nil { selectedTaskID = latest.tasks.first?.id }
            connectionState = .connected
        } catch {
            connectionState = .unavailable(message(for: error))
        }
    }

    func runRefreshLoop() async {
        while !Task.isCancelled {
            if client != nil { await refresh() }
            try? await Task.sleep(for: .seconds(4))
        }
    }

    func startTask(workspaceId: String, prompt: String) async -> Bool {
        guard let client, !isSubmitting else { return false }
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            let response = try await client.startTask(workspaceId: workspaceId, prompt: prompt)
            selectedTaskID = response.task.id
            replace(response.task, insertIfMissing: true)
            await refresh()
            return true
        } catch {
            self.message = message(for: error)
            return false
        }
    }

    func followUp(taskId: String, text: String) async -> Bool {
        guard let client, !isSubmitting else { return false }
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            let response = try await client.followUp(taskId: taskId, text: text)
            if let task = response.task { replace(task) }
            await refresh()
            return true
        } catch {
            self.message = message(for: error)
            return false
        }
    }

    func cancel(taskId: String) async {
        guard let client, !isSubmitting else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            let response = try await client.cancel(taskId: taskId)
            if let task = response.task { replace(task) }
            message = "Work stopped. Completed external effects were not undone."
            await refresh()
        } catch {
            self.message = message(for: error)
        }
    }

    func decide(_ approval: RemoteApproval, allow: Bool) async {
        guard let client, !isSubmitting else { return }
        isSubmitting = true
        defer { isSubmitting = false }
        do {
            let response = try await client.decide(approval: approval, allow: allow)
            if let task = response.task { replace(task) }
            await refresh()
        } catch {
            self.message = message(for: error)
        }
    }

    func open(_ artifact: RemoteArtifact) async {
        guard let client else { return }
        do {
            previewURL = try await client.download(artifact)
        } catch {
            message = message(for: error)
        }
    }

    func forgetMac() {
        credentials.delete()
        UserDefaults.standard.removeObject(forKey: profileKey)
        client = nil
        state = nil
        selectedTaskID = nil
        connectionState = .unpaired
    }

    private func restoreConnection() {
        guard let data = UserDefaults.standard.data(forKey: profileKey),
              let profile = try? JSONDecoder().decode(ConnectionProfile.self, from: data),
              let credential = try? credentials.read() else { return }
        client = try? APIClient(baseURL: profile.serverURL, credential: credential)
        connectionState = client == nil ? .unpaired : .connecting
    }

    private func replace(_ task: RemoteTask, insertIfMissing: Bool = false) {
        guard let current = state else { return }
        var tasks = current.tasks
        if let index = tasks.firstIndex(where: { $0.id == task.id }) {
            tasks[index] = task
        } else if insertIfMissing {
            tasks.insert(task, at: 0)
        }
        state = RemoteState(
            device: current.device,
            workspaces: current.workspaces,
            tasks: tasks,
            approvals: current.approvals.filter { $0.taskId != task.id || task.status == "awaiting_approval" },
            artifacts: current.artifacts,
            serverTime: current.serverTime
        )
    }

    private func message(for error: Error) -> String {
        if let url = error as? URLError,
           [.cannotConnectToHost, .cannotFindHost, .networkConnectionLost, .notConnectedToInternet, .timedOut].contains(url.code) {
            return "The Mac is offline, sleeping or unreachable. Work already running there will continue."
        }
        return error.localizedDescription
    }
}
