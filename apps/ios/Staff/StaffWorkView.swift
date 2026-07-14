import AliStoreCore
import SwiftUI

enum StaffWorkMode: String, CaseIterable, Identifiable {
    case orders = "Заказы"
    case tasks = "Задачи"
    case support = "Поддержка"

    var id: String { rawValue }
}

struct StaffWorkView: View {
    let session: StaffSession
    @Binding var mode: StaffWorkMode
    @Binding var routedTaskId: String?

    var body: some View {
        VStack(spacing: 0) {
            Picker("Работа", selection: $mode) {
                ForEach(StaffWorkMode.allCases) { Text($0.rawValue).tag($0) }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 8)

            switch mode {
            case .orders:
                StaffOrdersView(session: session)
            case .tasks:
                StaffTasksView(session: session, routedTaskId: $routedTaskId)
            case .support:
                StaffSupportView(session: session)
            }
        }
        .navigationTitle("Работа")
    }
}

private struct StaffTasksView: View {
    let session: StaffSession
    @Binding var routedTaskId: String?
    @State private var tasks: [StaffTask] = []
    @State private var isLoading = true
    @State private var busyId: String?
    @State private var errorMessage: String?
    private let environment = AppEnvironment.live()

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Загружаем задачи…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                ContentUnavailableView {
                    Label("Задачи недоступны", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button("Повторить", systemImage: "arrow.clockwise") { Task { await load() } }
                }
            } else if tasks.isEmpty {
                ContentUnavailableView("Нет активных задач", systemImage: "checkmark.circle", description: Text("Новые назначения появятся здесь."))
            } else {
                List(tasks) { task in
                    taskRow(task)
                        .listRowBackground(task.id == routedTaskId ? Color.accentColor.opacity(0.12) : Color.clear)
                }
                .listStyle(.plain)
                .refreshable { await load() }
            }
        }
        .task { await load() }
    }

    private func taskRow(_ task: StaffTask) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(task.title).fontWeight(.semibold)
                Spacer()
                Text(priorityLabel(task.priority)).font(.caption).foregroundStyle(priorityColor(task.priority))
            }
            if let description = task.description, !description.isEmpty {
                Text(description).font(.subheadline).foregroundStyle(.secondary)
            }
            HStack {
                Label(statusLabel(task.status), systemImage: task.status == "completed" ? "checkmark.circle.fill" : "clock")
                if let dueAt = task.dueAt {
                    Spacer()
                    Text(dueAt.formatted(date: .abbreviated, time: .shortened))
                        .foregroundStyle(dueAt < Date() && task.status != "completed" ? .red : .secondary)
                }
            }
            .font(.caption)
            if task.status == "open" {
                Button("Начать", systemImage: "play.fill") { Task { await update(task, to: "in_progress") } }
                    .disabled(busyId != nil)
            }
            if task.status == "open" || task.status == "in_progress" {
                Button("Выполнено", systemImage: "checkmark.circle.fill") { Task { await update(task, to: "completed") } }
                    .disabled(busyId != nil)
            }
        }
        .padding(.vertical, 5)
        .accessibilityIdentifier("staff-task-\(task.id)")
    }

    @MainActor
    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            tasks = try await APIClient(baseURL: environment.apiBaseURL).get("staff-tasks/mine", token: session.accessToken)
            if let routedTaskId, !tasks.contains(where: { $0.id == routedTaskId }) {
                self.routedTaskId = nil
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func update(_ task: StaffTask, to status: String) async {
        busyId = task.id
        errorMessage = nil
        defer { busyId = nil }
        do {
            let updated: StaffTask = try await APIClient(baseURL: environment.apiBaseURL).patch(
                "staff-tasks/mine/\(task.id)",
                body: UpdateStaffTaskRequest(status: status),
                token: session.accessToken
            )
            tasks = tasks.map { $0.id == updated.id ? updated : $0 }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func statusLabel(_ status: String) -> String {
        ["open": "Новая", "in_progress": "В работе", "completed": "Выполнена"][status] ?? status
    }

    private func priorityLabel(_ priority: String) -> String {
        ["low": "Низкий", "normal": "Обычный", "high": "Высокий", "urgent": "Срочно"][priority] ?? priority
    }

    private func priorityColor(_ priority: String) -> Color {
        priority == "urgent" ? .red : priority == "high" ? .orange : .secondary
    }
}

private struct StaffSupportView: View {
    let session: StaffSession
    @State private var status = "new"
    @State private var tickets: [StaffSupportTicket] = []
    @State private var isLoading = true
    @State private var busyId: String?
    @State private var errorMessage: String?
    private let environment = AppEnvironment.live()
    private let statuses = [("new", "Новые"), ("in_progress", "В работе"), ("waiting", "Ожидание"), ("resolved", "Решены")]

    var body: some View {
        VStack(spacing: 0) {
            Picker("Статус", selection: $status) {
                ForEach(statuses, id: \.0) { Text($0.1).tag($0.0) }
            }
            .pickerStyle(.menu)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal)

            if isLoading {
                ProgressView("Загружаем обращения…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let errorMessage {
                ContentUnavailableView {
                    Label("Поддержка недоступна", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button("Повторить", systemImage: "arrow.clockwise") { Task { await load() } }
                }
            } else if tickets.isEmpty {
                ContentUnavailableView("Нет обращений", systemImage: "bubble.left.and.bubble.right", description: Text("В выбранной очереди сейчас пусто."))
            } else {
                List(tickets) { ticket in
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text(ticket.subject).fontWeight(.semibold)
                            Spacer()
                            Text(ticket.priority).font(.caption).foregroundStyle(ticket.priority == "urgent" ? .red : .secondary)
                        }
                        if let body = ticket.body { Text(body).font(.subheadline).foregroundStyle(.secondary).lineLimit(3) }
                        Label(ticket.sla.formatted(date: .abbreviated, time: .shortened), systemImage: "clock")
                            .font(.caption)
                            .foregroundStyle(ticket.sla < Date() ? .red : .secondary)
                        HStack {
                            if let next = nextStatus(ticket.status) {
                                Button(actionLabel(next), systemImage: "arrow.right.circle") { Task { await transition(ticket, to: next) } }
                            }
                            if ticket.priority != "urgent" && ticket.status != "resolved" && ticket.status != "closed" {
                                Button("Эскалировать", systemImage: "exclamationmark.arrow.triangle.2.circlepath") { Task { await escalate(ticket) } }
                            }
                        }
                        .disabled(busyId != nil)
                    }
                    .padding(.vertical, 5)
                }
                .listStyle(.plain)
                .refreshable { await load() }
            }
        }
        .task(id: status) { await load() }
    }

    @MainActor
    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            tickets = try await APIClient(baseURL: environment.apiBaseURL).get("support/tickets?status=\(status)", token: session.accessToken)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func transition(_ ticket: StaffSupportTicket, to status: String) async {
        busyId = ticket.id
        errorMessage = nil
        defer { busyId = nil }
        do {
            let _: StaffSupportTicket = try await APIClient(baseURL: environment.apiBaseURL).patch(
                "support/tickets/\(ticket.id)/transition",
                body: SupportTransitionRequest(to: status, assignee: session.staffId),
                token: session.accessToken
            )
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @MainActor
    private func escalate(_ ticket: StaffSupportTicket) async {
        busyId = ticket.id
        errorMessage = nil
        defer { busyId = nil }
        do {
            let _: StaffSupportTicket = try await APIClient(baseURL: environment.apiBaseURL).patch(
                "support/tickets/\(ticket.id)/escalate",
                body: EmptyMutationRequest(),
                token: session.accessToken
            )
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func nextStatus(_ status: String) -> String? {
        switch status {
        case "new": "in_progress"
        case "in_progress": "waiting"
        case "waiting": "resolved"
        case "resolved": "closed"
        default: nil
        }
    }

    private func actionLabel(_ status: String) -> String {
        ["in_progress": "В работу", "waiting": "Ждём клиента", "resolved": "Решено", "closed": "Закрыть"][status] ?? status
    }
}
