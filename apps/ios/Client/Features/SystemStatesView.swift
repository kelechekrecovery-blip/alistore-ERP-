import SwiftUI
import AliStoreCore

// System states (3.0 deck: SKELETON / OFFLINE / ERROR).
// Reusable canon state views + a fixture demo that toggles between them.

// MARK: - Reusable states

/// Loading skeleton grid (canon §4 loading).
struct LoadingStateView: View {
    var title: String = "Загрузка товаров…"
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(Design3.body(13, .semibold))
                .foregroundStyle(Design3.textMuted)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(0..<6, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: 8) {
                        Skeleton(radius: 14).frame(height: 120)
                        Skeleton(radius: 6).frame(height: 12).frame(maxWidth: .infinity)
                        Skeleton(radius: 6).frame(width: 80, height: 12)
                    }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Offline state — favorites/cart still available locally.
struct OfflineStateView: View {
    var onRetry: () -> Void = {}
    var onOpenFavorites: () -> Void = {}
    var body: some View {
        SystemStateScaffold(
            emoji: "📡",
            title: "Нет соединения",
            detail: "Проверьте интернет. Избранное и корзина доступны офлайн — сохранены на устройстве.",
            primaryTitle: "Повторить",
            primaryAction: onRetry,
            secondaryTitle: "Открыть избранное →",
            secondaryAction: onOpenFavorites
        )
    }
}

/// Generic error state — retry + contact support.
struct ErrorStateView: View {
    var onRetry: () -> Void = {}
    var onSupport: () -> Void = {}
    var body: some View {
        SystemStateScaffold(
            emoji: "⚠️",
            title: "Что-то пошло не так",
            detail: "Не удалось загрузить данные. Мы уже знаем о проблеме — попробуйте ещё раз.",
            primaryTitle: "Обновить",
            primaryAction: onRetry,
            secondaryTitle: "Написать в поддержку",
            secondaryAction: onSupport,
            secondaryIsGlass: true
        )
    }
}

/// Shared centered empty/error/offline scaffold.
struct SystemStateScaffold: View {
    let emoji: String
    let title: String
    let detail: String
    let primaryTitle: String
    let primaryAction: () -> Void
    var secondaryTitle: String? = nil
    var secondaryAction: () -> Void = {}
    var secondaryIsGlass: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            Text(emoji).font(.system(size: 52))
            Text(title)
                .font(Design3.heading(19, .bold))
                .foregroundStyle(.white)
                .padding(.top, 16)
            Text(detail)
                .font(Design3.body(13.5))
                .foregroundStyle(Design3.textMuted)
                .multilineTextAlignment(.center)
                .lineSpacing(3)
                .padding(.top, 8)
                .padding(.horizontal, 8)

            Button(action: primaryAction) {
                Text(primaryTitle)
                    .font(Design3.body(15, .bold))
                    .foregroundStyle(Design3.frame)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Design3.orange, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.top, 24)

            if let secondaryTitle {
                Button(action: secondaryAction) {
                    Text(secondaryTitle)
                        .font(Design3.body(14, .semibold))
                        .foregroundStyle(secondaryIsGlass ? Design3.textBright : Design3.orange)
                        .frame(maxWidth: .infinity)
                        .frame(height: secondaryIsGlass ? 50 : 30)
                        .background {
                            if secondaryIsGlass {
                                RoundedRectangle(cornerRadius: 13, style: .continuous)
                                    .fill(Color.white.opacity(0.06))
                                    .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).strokeBorder(Design3.hairlineGlass, lineWidth: 1))
                            }
                        }
                }
                .buttonStyle(.plain)
                .padding(.top, secondaryIsGlass ? 10 : 14)
            }
        }
        .frame(maxWidth: 360)
        .padding(28)
    }
}

// MARK: - Fixture demo

struct SystemStatesView: View {
    @State private var state = "loading"

    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $state) {
                Text("Загрузка").tag("loading")
                Text("Офлайн").tag("offline")
                Text("Ошибка").tag("error")
            }
            .pickerStyle(.segmented)
            .padding(16)

            Spacer(minLength: 0)
            switch state {
            case "offline": OfflineStateView()
            case "error": ErrorStateView()
            default: ScrollView { LoadingStateView() }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Design3.screen.ignoresSafeArea())
        .navigationTitle("Состояния")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("client-system-states")
    }
}

#if DEBUG
#Preview {
    NavigationStack { SystemStatesView() }
        .preferredColorScheme(.dark)
}
#endif
