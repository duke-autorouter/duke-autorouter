import QuickLook
import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            if model.state == nil {
                PairingView()
            } else {
                TaskNavigationView()
            }
        }
        .task { await model.runRefreshLoop() }
        .alert("DUKE", isPresented: Binding(
            get: { model.message != nil },
            set: { if !$0 { model.message = nil } }
        )) { Button("OK") { model.message = nil } } message: { Text(model.message ?? "") }
        .quickLookPreview($model.previewURL)
    }
}

private struct PairingView: View {
    @EnvironmentObject private var model: AppModel
    @State private var server = ""
    @State private var code = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Private HTTPS address", text: $server)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                    TextField("Pairing code", text: $code)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Connect to your Mac")
                } footer: {
                    Text("Create a one-time pairing code on the Mac. The phone can only access the projects you approve there.")
                }
                if case let .unavailable(reason) = model.connectionState {
                    Section { Text(reason).foregroundStyle(.secondary) }
                }
                Button("Pair iPhone") {
                    Task { await model.pair(server: server, code: code) }
                }
                .disabled(server.isEmpty || code.isEmpty || model.isSubmitting)
            }
            .navigationTitle("DUKE")
            .overlay { if model.isSubmitting { ProgressView() } }
        }
    }
}

private struct TaskNavigationView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showingComposer = false

    var body: some View {
        NavigationSplitView {
            List(selection: $model.selectedTaskID) {
                if case let .unavailable(reason) = model.connectionState {
                    Section {
                        Label(reason, systemImage: "wifi.slash")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                ForEach(model.state?.tasks ?? []) { task in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(task.title).lineLimit(2)
                        Text(task.statusLabel).font(.caption).foregroundStyle(.secondary)
                    }
                    .tag(task.id)
                }
            }
            .navigationTitle("Tasks")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button("New", systemImage: "square.and.pencil") { showingComposer = true }
                }
                ToolbarItem(placement: .secondaryAction) {
                    Button("Forget this Mac", role: .destructive) { model.forgetMac() }
                }
            }
        } detail: {
            if let task = model.selectedTask {
                TaskDetailView(task: task)
            } else {
                ContentUnavailableView("Choose a task", systemImage: "text.bubble")
            }
        }
        .sheet(isPresented: $showingComposer) { TaskComposerView(isPresented: $showingComposer) }
        .refreshable { await model.refresh() }
    }
}

private struct TaskComposerView: View {
    @EnvironmentObject private var model: AppModel
    @Binding var isPresented: Bool
    @State private var workspaceID = ""
    @State private var prompt = ""

    var body: some View {
        NavigationStack {
            Form {
                Picker("Project", selection: $workspaceID) {
                    ForEach(model.state?.workspaces ?? []) { workspace in
                        Text(workspace.name).tag(workspace.id)
                    }
                }
                TextEditor(text: $prompt).frame(minHeight: 160)
            }
            .navigationTitle("Start work")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { isPresented = false } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Start") {
                        Task {
                            if await model.startTask(workspaceId: workspaceID, prompt: prompt) {
                                isPresented = false
                            }
                        }
                    }
                    .disabled(workspaceID.isEmpty || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isSubmitting)
                }
            }
            .onAppear { if workspaceID.isEmpty { workspaceID = model.state?.workspaces.first?.id ?? "" } }
        }
    }
}

private struct TaskDetailView: View {
    @EnvironmentObject private var model: AppModel
    let task: RemoteTask
    @State private var followUp = ""

    private var approvals: [RemoteApproval] {
        model.state?.approvals.filter { $0.taskId == task.id } ?? []
    }

    private var artifacts: [RemoteArtifact] {
        model.state?.artifacts.filter { $0.taskId == task.id } ?? []
    }

    var body: some View {
        List {
            Section {
                LabeledContent("Status", value: task.statusLabel)
                if let error = task.error { Text(error).foregroundStyle(.secondary) }
            }
            Section("Request") { Text(task.prompt).textSelection(.enabled) }
            if let result = task.result, !result.isEmpty {
                Section("Result") { Text(result).textSelection(.enabled) }
            }
            if let checkpoint = task.checkpoint {
                Section("Checkpoint") {
                    Text(checkpoint.summary)
                    if !checkpoint.remaining.isEmpty {
                        Text(checkpoint.remaining).foregroundStyle(.secondary)
                    }
                }
            }
            if !approvals.isEmpty {
                Section("Approval needed") {
                    ForEach(approvals) { approval in
                        VStack(alignment: .leading, spacing: 10) {
                            Text(approval.operation)
                            Text(approval.arguments)
                                .font(.caption.monospaced())
                                .textSelection(.enabled)
                            HStack {
                                Button("Deny", role: .destructive) {
                                    Task { await model.decide(approval, allow: false) }
                                }
                                Spacer()
                                Button("Approve") { Task { await model.decide(approval, allow: true) } }
                                    .buttonStyle(.borderedProminent)
                            }
                        }
                    }
                }
            }
            if !artifacts.isEmpty {
                Section("Files") {
                    ForEach(artifacts) { artifact in
                        Button { Task { await model.open(artifact) } } label: {
                            Label(artifact.name, systemImage: "doc")
                        }
                    }
                }
            }
            if task.canFollowUp {
                Section("Follow up") {
                    TextField("What should DUKE do next?", text: $followUp, axis: .vertical)
                    Button("Send follow-up") {
                        let text = followUp
                        Task {
                            if await model.followUp(taskId: task.id, text: text) { followUp = "" }
                        }
                    }
                    .disabled(followUp.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isSubmitting)
                }
            }
            if task.isActive {
                Section {
                    Button("Stop work", role: .destructive) { Task { await model.cancel(taskId: task.id) } }
                        .disabled(model.isSubmitting)
                    Text("Stopping work does not undo an external action that already finished.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle(task.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
