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

    private let background = Color(red: 0.078, green: 0.067, blue: 0.055)
    private let surface = Color(red: 0.133, green: 0.118, blue: 0.098)
    private let primaryText = Color(red: 0.847, green: 0.812, blue: 0.776)
    private let secondaryText = Color(red: 0.541, green: 0.498, blue: 0.463)
    private let lime = Color(red: 0.776, green: 1, blue: 0.239)

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(screenTitle)
                        .font(.title2.weight(.black))
                        .foregroundStyle(primaryText)
                    Text(session.username)
                        .font(.subheadline)
                        .foregroundStyle(secondaryText)
                }
                Spacer()
                Text(session.role.uppercased())
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.black)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(lime, in: RoundedRectangle(cornerRadius: 7))
            }
            .padding(.horizontal, 18)
            .padding(.top, 14)
            .padding(.bottom, 12)
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
        .preferredColorScheme(.dark)
        .background(background.ignoresSafeArea())
        .navigationTitle("Работа")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var screenTitle: String {
        switch mode {
        case .orders: "Заказы"
        case .tasks: "Задачи и KPI"
        case .support: "Поддержка"
        }
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
    private let background = Color(red: 0.078, green: 0.067, blue: 0.055)
    private let surface = Color(red: 0.133, green: 0.118, blue: 0.098)
    private let surfaceSoft = Color(red: 0.165, green: 0.145, blue: 0.122)
    private let primaryText = Color(red: 0.847, green: 0.812, blue: 0.776)
    private let secondaryText = Color(red: 0.541, green: 0.498, blue: 0.463)
    private let coral = Color(red: 1, green: 0.357, blue: 0.18)
    private let lime = Color(red: 0.776, green: 1, blue: 0.239)

    var body: some View {
        ZStack {
            background.ignoresSafeArea()
            if isLoading {
                ProgressView("Загружаем задачи…")
                    .tint(lime)
                    .foregroundStyle(primaryText)
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
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        kpiCard
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(tasks) { task in taskRow(task) }
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 8)
                    .padding(.bottom, 28)
                }
                .refreshable { await load() }
            }
        }
        .task { await load() }
    }

    private var kpiCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("KPI месяца")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(primaryText)
                Spacer()
                Text("92%")
                    .font(.system(.title3, design: .monospaced).weight(.black))
                    .foregroundStyle(lime)
            }
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(surfaceSoft)
                    Capsule().fill(lime)
                        .frame(width: max(16, proxy.size.width * 0.92))
                }
            }
            .frame(height: 8)
            Text("Цель: аксессуары, ценники, обучение и контроль остатков до конца смены.")
                .font(.caption)
                .foregroundStyle(secondaryText)
        }
        .padding(16)
        .background(surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(surfaceSoft))
    }

    private func taskRow(_ task: StaffTask) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Button {
                Task { await update(task, to: task.status == "completed" ? "in_progress" : "completed") }
            } label: {
                Label {
                    Text("Переключить задачу \(task.title)")
                } icon: {
                    Image(systemName: task.status == "completed" ? "checkmark.circle.fill" : "circle")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(task.status == "completed" ? lime : secondaryText)
                }
                .labelStyle(.iconOnly)
            }
            .buttonStyle(.plain)
            .disabled(busyId != nil)
            .accessibilityLabel("Переключить задачу \(task.title)")
            .accessibilityIdentifier("staff-task-toggle-\(task.id)")

            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(task.title)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(task.status == "completed" ? secondaryText : primaryText)
                        .strikethrough(task.status == "completed")
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    Text(priorityLabel(task.priority))
                        .font(.caption2.weight(.black))
                        .foregroundStyle(priorityColor(task.priority))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(priorityColor(task.priority).opacity(0.14), in: Capsule())
                }
                if let description = task.description, !description.isEmpty {
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(secondaryText)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack(spacing: 8) {
                    Label(statusLabel(task.status), systemImage: task.status == "completed" ? "checkmark.circle.fill" : "clock")
                    if let dueAt = task.dueAt {
                        Text(dueAt.formatted(date: .omitted, time: .shortened))
                    }
                }
                .font(.caption2.weight(.semibold))
                .foregroundStyle(task.status == "completed" ? lime : secondaryText)
            }
        }
        .padding(14)
        .background(task.id == routedTaskId ? lime.opacity(0.12) : surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(task.id == routedTaskId ? lime.opacity(0.5) : surfaceSoft))
        .accessibilityIdentifier("staff-task-\(task.id)")
    }

    @MainActor
    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        #if DEBUG
        if UITestBootstrap.startsSignedIn {
            tasks = Self.fixtureTasks
            return
        }
        #endif
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
        priority == "urgent" ? coral : priority == "high" ? Color(red: 1, green: 0.77, blue: 0.35) : secondaryText
    }

    private static var fixtureTasks: [StaffTask] {
        let now = Date()
        return [
            fixtureTask(id: "task-accessories", title: "Предлагать аксессуары к телефонам", description: "Цель AI: +18 аксессуаров до конца смены.", status: "open", priority: "high", dueAt: now.addingTimeInterval(3600)),
            fixtureTask(id: "task-prices", title: "Обновить ценники на витрине", description: "Проверить iPhone, Watch и AirPods.", status: "in_progress", priority: "normal", dueAt: now.addingTimeInterval(5400)),
            fixtureTask(id: "task-training", title: "Пройти тест по новым тарифам", description: "Короткий тест перед вечерним потоком.", status: "completed", priority: "low", dueAt: now.addingTimeInterval(-1800)),
            fixtureTask(id: "task-stock", title: "Проверить остатки Apple Watch", description: "Сверить витрину и складской остаток.", status: "open", priority: "urgent", dueAt: now.addingTimeInterval(1800)),
        ]
    }

    private static func fixtureTask(id: String, title: String, description: String, status: String, priority: String, dueAt: Date) -> StaffTask {
        StaffTask(
            id: id,
            title: title,
            description: description,
            status: status,
            priority: priority,
            assigneeId: "staff-ui-test",
            dueAt: dueAt,
            relatedType: nil,
            relatedId: nil,
            createdAt: Date(timeIntervalSince1970: 1_785_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_785_000_000),
            completedAt: status == "completed" ? dueAt : nil
        )
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
