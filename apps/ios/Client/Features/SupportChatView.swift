import SwiftUI
import AliStoreCore

// Live support chat (3.0 deck: SUPPORT CHAT).
// A local assistant with keyword routing + typing delay; «Позвать оператора» escalates
// to a real ticket. Wired to POST /support/tickets/mine when the transport lands.

struct ChatMessage: Identifiable, Sendable {
    let id = UUID()
    let text: String
    let isUser: Bool
    let time: String
}

@MainActor
struct SupportChatView: View {
    var orderContext: String = "Заказ №4102 · iPhone 15 · IMEI 35••042"

    @State private var messages: [ChatMessage] = [
        ChatMessage(text: "Здравствуйте! На связи поддержка AliStore. Чем помочь по заказу №4102?", isUser: false, time: SupportChatView.clock())
    ]
    @State private var draft = ""
    @State private var typing = false
    @FocusState private var inputFocused: Bool

    private let quickReplies = ["Где мой заказ?", "Условия возврата", "Позвать оператора"]

    var body: some View {
        VStack(spacing: 0) {
            contextBar
            messagesList
            quickReplyRow
            inputBar
        }
        .background(Design3.screen.ignoresSafeArea())
        .navigationTitle("Поддержка AliStore")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                VStack(spacing: 1) {
                    Text("Поддержка AliStore").font(Design3.heading(15, .bold)).foregroundStyle(.white)
                    Text("● на связи · отвечаем ~2 мин").font(Design3.body(11)).foregroundStyle(Design3.success)
                }
            }
        }
        .accessibilityIdentifier("client-support-chat")
    }

    private var contextBar: some View {
        HStack(spacing: 8) {
            Text("📦").font(.system(size: 13))
            Text("Контекст: \(orderContext)")
                .font(Design3.body(11.5))
                .foregroundStyle(Design3.textMuted)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 9)
        .background(Design3.orangeSoft.opacity(0.08))
        .overlay(alignment: .bottom) { Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1) }
    }

    private var messagesList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 9) {
                    ForEach(messages) { message in
                        bubble(message).id(message.id)
                    }
                    if typing {
                        HStack {
                            Text("печатает…")
                                .font(Design3.body(13))
                                .foregroundStyle(Design3.textSubtle)
                                .padding(.horizontal, 15).padding(.vertical, 11)
                                .background(Color.white.opacity(0.06),
                                            in: UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 4, bottomTrailingRadius: 16, topTrailingRadius: 16))
                            Spacer(minLength: 0)
                        }
                        .id("typing")
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
            .onChange(of: messages.count) { _, _ in
                withAnimation { proxy.scrollTo(messages.last?.id, anchor: .bottom) }
            }
            .onChange(of: typing) { _, isTyping in
                if isTyping { withAnimation { proxy.scrollTo("typing", anchor: .bottom) } }
            }
        }
    }

    private func bubble(_ message: ChatMessage) -> some View {
        HStack {
            if message.isUser { Spacer(minLength: 40) }
            VStack(alignment: .trailing, spacing: 3) {
                Text(message.text)
                    .font(Design3.body(13.5))
                    .foregroundStyle(message.isUser ? Design3.frame : .white)
                Text(message.time)
                    .font(.system(size: 9.5))
                    .foregroundStyle((message.isUser ? Design3.frame : Color.white).opacity(0.55))
            }
            .padding(.horizontal, 13).padding(.vertical, 10)
            .background(bubbleBackground(message.isUser))
            .clipShape(bubbleShape(message.isUser))
            .shadow(color: .black.opacity(0.28), radius: 6, y: 4)
            if !message.isUser { Spacer(minLength: 40) }
        }
    }

    private func bubbleBackground(_ isUser: Bool) -> some ShapeStyle {
        isUser
            ? AnyShapeStyle(LinearGradient(colors: [Design3.orangeSoft, Design3.orange], startPoint: .topLeading, endPoint: .bottomTrailing))
            : AnyShapeStyle(Color.white.opacity(0.07))
    }

    private func bubbleShape(_ isUser: Bool) -> UnevenRoundedRectangle {
        isUser
            ? UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 16, bottomTrailingRadius: 4, topTrailingRadius: 16)
            : UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 4, bottomTrailingRadius: 16, topTrailingRadius: 16)
    }

    private var quickReplyRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                ForEach(quickReplies, id: \.self) { reply in
                    Button { send(reply) } label: {
                        Text(reply)
                            .font(Design3.body(12))
                            .foregroundStyle(Color(red: 1, green: 0.604, blue: 0.431))
                            .padding(.horizontal, 13).padding(.vertical, 7)
                            .background(Color.white.opacity(0.06), in: Capsule())
                            .overlay(Capsule().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
        }
        .padding(.bottom, 8)
    }

    private var inputBar: some View {
        HStack(spacing: 8) {
            TextField("", text: $draft, prompt: Text("Сообщение…").foregroundColor(Design3.textFaint))
                .font(Design3.body(14))
                .foregroundStyle(.white)
                .focused($inputFocused)
                .submitLabel(.send)
                .onSubmit { send(draft) }
                .padding(.horizontal, 16).padding(.vertical, 11)
                .background(Color.white.opacity(0.06), in: Capsule())
                .overlay(Capsule().strokeBorder(Color.white.opacity(0.12), lineWidth: 1))

            Button { send(draft) } label: {
                Image(systemName: "paperplane.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(LinearGradient(colors: [Design3.orangeSoft, Design3.orangePressed], startPoint: .topLeading, endPoint: .bottomTrailing), in: Circle())
                    .shadow(color: Design3.orange.opacity(0.4), radius: 8, y: 4)
            }
            .buttonStyle(.plain)
            .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
            .accessibilityIdentifier("support-send")
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 14)
        .overlay(alignment: .top) { Rectangle().fill(Color.white.opacity(0.08)).frame(height: 1) }
    }

    // MARK: - Local bot

    private func send(_ raw: String) {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        messages.append(ChatMessage(text: text, isUser: true, time: Self.clock()))
        draft = ""
        inputFocused = false
        Task { await respond(to: text) }
    }

    private func respond(to text: String) async {
        typing = true
        try? await Task.sleep(nanoseconds: 900_000_000)
        typing = false
        messages.append(ChatMessage(text: botReply(to: text), isUser: false, time: Self.clock()))
    }

    private func botReply(to text: String) -> String {
        let q = text.lowercased()
        if q.contains("оператор") || q.contains("человек") || q.contains("менеджер") {
            return "Передаю диалог живому оператору — обычно отвечаем в течение 2 минут. Тикет по заказу №4102 создан, вы получите ответ здесь и пушем."
        }
        if q.contains("заказ") || q.contains("где") || q.contains("достав") || q.contains("трек") {
            return "Заказ №4102 уже собран и передан курьеру — доставим сегодня до 18:00 по Бишкеку. Отслеживание и код получения придут пушем."
        }
        if q.contains("возврат") || q.contains("обмен") || q.contains("верну") {
            return "Технику можно вернуть в течение 14 дней при сохранении товарного вида и комплекта. Оформить заявку — в разделе «Возвраты» в кабинете."
        }
        if q.contains("гарант") {
            return "На новую технику действует 12 месяцев официальной гарантии, на Б/У — 3 месяца AliStore. Талон и статус — в разделе «Устройства»."
        }
        if q.contains("рассроч") || q.contains("платёж") || q.contains("плати") {
            return "Ваш график рассрочки и следующий платёж — в разделе «Моя рассрочка». Напоминание придёт за 2 дня до списания."
        }
        return "Спасибо за сообщение! Уточню детали по заказу №4102 и вернусь с ответом — обычно это занимает пару минут."
    }

    nonisolated static func clock() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: Date())
    }
}

#if DEBUG
#Preview {
    NavigationStack { SupportChatView() }
        .preferredColorScheme(.dark)
}
#endif
