import SwiftUI
import AliStoreCore

// В СБОРКУ ДЛЯ МАГАЗИНА НЕ ВХОДИТ.
// Лист ожидания без серверной части.
// Apple дважды отклоняла сборку за мокапы, выдаваемые за рабочие функции (Guideline 2.3).
#if DEBUG

// «Снова в наличии» — restock waitlist (3.0 deck: WAITLIST).
// Locally persisted (UserDefaults) until the notifications backend tracks watches.
// The product card's «Уведомить» CTA adds here; a push fires when stock returns.

struct WaitlistItem: Identifiable, Codable, Sendable {
    let id: String
    let name: String
    let price: Int
    let symbol: String
}

@Observable
final class WaitlistStore {
    private static let key = "client.waitlist.items.v1"

    var items: [WaitlistItem] {
        didSet { persist() }
    }

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.key),
           let decoded = try? JSONDecoder().decode([WaitlistItem].self, from: data) {
            items = decoded
        } else {
            // First run: seed representative watches so the screen reads as designed.
            items = [
                WaitlistItem(id: "wl-1", name: "iPhone 15 Pro · 256 ГБ · титан", price: 132_000, symbol: "iphone"),
                WaitlistItem(id: "wl-2", name: "AirPods Pro 2 · USB-C", price: 21_500, symbol: "airpods.pro"),
            ]
        }
    }

    func remove(_ id: String) {
        items.removeAll { $0.id == id }
    }

    func add(_ item: WaitlistItem) {
        guard !items.contains(where: { $0.id == item.id }) else { return }
        items.append(item)
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(items) {
            UserDefaults.standard.set(data, forKey: Self.key)
        }
    }
}

struct WaitlistView: View {
    var onOpenCatalog: (() -> Void)? = nil
    @State private var store = WaitlistStore()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if store.items.isEmpty {
                    emptyState
                } else {
                    Text("Сообщим пушем, как только товар появится на складе.")
                        .font(Design3.body(12.5))
                        .foregroundStyle(Design3.textSubtle)
                        .padding(.bottom, 14)
                    ForEach(store.items) { item in
                        row(item)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 24)
        }
        .background(Design3.screen.ignoresSafeArea())
        .navigationTitle("Снова в наличии")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("account-waitlist")
    }

    private func row(_ item: WaitlistItem) -> some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(LinearGradient(colors: [Color.white.opacity(0.10), Color.white.opacity(0.03)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 54, height: 54)
                .overlay(Image(systemName: item.symbol).font(.system(size: 22)).foregroundStyle(Design3.textMuted))

            VStack(alignment: .leading, spacing: 3) {
                Text(item.name)
                    .font(Design3.body(13.5, .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                Text(installmentSom(item.price))
                    .font(Design3.heading(15, .heavy))
                    .foregroundStyle(.white)
                Text("Ждём поступления")
                    .font(Design3.body(11))
                    .foregroundStyle(Design3.gold)
            }

            Spacer(minLength: 6)

            Button {
                withAnimation(.easeOut(duration: 0.2)) { store.remove(item.id) }
            } label: {
                Text("Убрать")
                    .font(Design3.body(12))
                    .foregroundStyle(Design3.textSubtle)
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .glass(radius: 14)
        .padding(.bottom, 10)
    }

    private var emptyState: some View {
        VStack(spacing: 0) {
            Text("🔔").font(.system(size: 46))
            Text("Список пуст")
                .font(Design3.heading(17, .bold))
                .foregroundStyle(.white)
                .padding(.top, 14)
            Text("На карточке товара без остатка нажмите «Уведомить» — он появится здесь.")
                .font(Design3.body(13))
                .foregroundStyle(Design3.textMuted)
                .multilineTextAlignment(.center)
                .lineSpacing(3)
                .padding(.top, 8)
            Button {
                if let onOpenCatalog { onOpenCatalog() } else { dismiss() }
            } label: {
                Text("В каталог")
                    .font(Design3.body(13, .bold))
                    .foregroundStyle(Design3.frame)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 11)
                    .background(Design3.orange, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, 16)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 50)
        .padding(.horizontal, 20)
    }
}

#if DEBUG
#Preview {
    NavigationStack { WaitlistView() }
        .preferredColorScheme(.dark)
}
#endif
#endif
