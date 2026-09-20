import Foundation

struct PairRequest: Encodable {
    let code: String
    let deviceName: String
}

struct PairResponse: Decodable {
    let device: RemoteDevice
    let credential: String
}

struct RemoteDevice: Codable, Identifiable {
    let id: String
    let name: String
    let allowedWorkspaceIds: [String]
    let createdAt: String
    let lastSeenAt: String?
    let revokedAt: String?
}

struct WorkspaceSummary: Codable, Identifiable, Hashable {
    let id: String
    let name: String
}

struct RemoteCheckpoint: Codable {
    let summary: String
    let remaining: String
    let artifacts: [String]
    let at: String
}

struct RemoteTask: Codable, Identifiable, Hashable {
    let id: String
    let workspaceId: String
    let prompt: String
    let title: String
    let status: String
    let createdAt: String
    let updatedAt: String
    let result: String?
    let error: String?
    let checkpoint: RemoteCheckpoint?

    static func == (lhs: RemoteTask, rhs: RemoteTask) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }

    var isActive: Bool {
        ["queued", "routing", "running", "awaiting_approval", "verifying"].contains(status)
    }

    var canFollowUp: Bool {
        ["completed", "blocked", "cancelled", "interrupted"].contains(status)
    }

    var statusLabel: String {
        switch status {
        case "awaiting_approval": "Approval needed"
        case "interrupted": "Interrupted"
        case "cancelled": "Stopped"
        case "blocked": "Needs attention"
        case "routing": "Choosing a route"
        case "verifying": "Checking the result"
        default: status.capitalized
        }
    }
}

struct RemoteApproval: Codable, Identifiable {
    let id: String
    let taskId: String
    let operation: String
    let arguments: String
    let hash: String
    let status: String
    let createdAt: String
}

struct RemoteArtifact: Codable, Identifiable {
    let id: String
    let taskId: String
    let path: String
    let sha256: String

    var name: String { URL(fileURLWithPath: path).lastPathComponent }
}

struct RemoteState: Decodable {
    let device: RemoteDevice
    let workspaces: [WorkspaceSummary]
    let tasks: [RemoteTask]
    let approvals: [RemoteApproval]
    let artifacts: [RemoteArtifact]
    let serverTime: String
}

struct TaskResponse: Decodable { let task: RemoteTask }
struct CommandResponse: Decodable { let ok: Bool; let task: RemoteTask?; let note: String? }
struct ApprovalResponse: Decodable { let ok: Bool; let task: RemoteTask? }
struct ErrorResponse: Decodable { let error: String }

struct CreateTaskRequest: Encodable {
    let workspaceId: String
    let prompt: String
}

struct FollowUpRequest: Encodable { let text: String }
struct ApprovalRequest: Encodable { let hash: String; let allow: Bool }
struct EmptyRequest: Encodable {}

struct ConnectionProfile: Codable {
    let serverURL: URL
    let deviceId: String
}
