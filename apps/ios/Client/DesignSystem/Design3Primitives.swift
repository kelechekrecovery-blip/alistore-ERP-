import SwiftUI
import AliStoreCore

// AliStore 3.0 reusable SwiftUI primitives — liquid glass, orange-primary.
// Consume Design3 tokens (AliStoreCore). Client-internal.

// MARK: - Glass surface

private struct GlassBackground: ViewModifier {
    var radius: CGFloat
    var strong: Bool
    func body(content: Content) -> some View {
        content.background {
            ZStack {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(strong ? Design3.glassTintStrong : Design3.glassTint)
                    .background(strong ? Design3.glassStrong : Design3.glass,
                                in: RoundedRectangle(cornerRadius: radius, style: .continuous))
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(Design3.hairlineGlass, lineWidth: 1)
            }
        }
    }
}

extension View {
    /// Liquid-glass surface behind the view (material + warm tint + hairline).
    nonisolated func glass(radius: CGFloat = Design3.Radius.card, strong: Bool = false) -> some View {
        modifier(GlassBackground(radius: radius, strong: strong))
    }
}

/// Glass card container.
struct GlassCard<Content: View>: View {
    var radius: CGFloat = Design3.Radius.card
    var strong: Bool = false
    var padding: CGFloat = Design3.Space.l
    @ViewBuilder var content: () -> Content
    var body: some View {
        content()
            .padding(padding)
            .glass(radius: radius, strong: strong)
    }
}

// MARK: - Buttons

/// Primary orange CTA (gradient fill, white text). Full-width by default.
struct PrimaryButtonStyle: ButtonStyle {
    var fullWidth: Bool = true
    var height: CGFloat = 52
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Design3.body(15, .bold))
            .foregroundStyle(.white)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .frame(height: height)
            .padding(.horizontal, fullWidth ? 0 : 20)
            .background(
                LinearGradient(colors: [Design3.orangeSoft, Design3.orangePressed],
                               startPoint: .topLeading, endPoint: .bottomTrailing),
                in: RoundedRectangle(cornerRadius: Design3.Radius.button, style: .continuous)
            )
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// Secondary glass button.
struct GlassButtonStyle: ButtonStyle {
    var fullWidth: Bool = true
    var height: CGFloat = 52
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Design3.body(15, .semibold))
            .foregroundStyle(Design3.textPrimary)
            .frame(maxWidth: fullWidth ? .infinity : nil)
            .frame(height: height)
            .padding(.horizontal, fullWidth ? 0 : 20)
            .glass(radius: Design3.Radius.button)
            .opacity(configuration.isPressed ? 0.8 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == PrimaryButtonStyle {
    static var primary: PrimaryButtonStyle { PrimaryButtonStyle() }
    static func primary(fullWidth: Bool, height: CGFloat = 52) -> PrimaryButtonStyle {
        PrimaryButtonStyle(fullWidth: fullWidth, height: height)
    }
}
extension ButtonStyle where Self == GlassButtonStyle {
    static var glass: GlassButtonStyle { GlassButtonStyle() }
}

// MARK: - Chips / Badges / Status

/// Filter/selection chip.
struct Chip: View {
    let text: String
    var active: Bool = false
    var body: some View {
        Text(text)
            .font(Design3.body(13, .semibold))
            .foregroundStyle(active ? Design3.orange : Design3.textMuted)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background {
                Capsule()
                    .fill(active ? Design3.orange.opacity(0.15) : Color.white.opacity(0.05))
                    .overlay(Capsule().strokeBorder(active ? Design3.orange.opacity(0.38) : Design3.hairlineGlass, lineWidth: 1))
            }
    }
}

/// Loud brand badge — «-8%», «Хит», «Б/У A», «Новинка».
struct Badge: View {
    let text: String
    var color: Color = Design3.orangePressed
    var body: some View {
        Text(text)
            .font(Design3.body(10, .bold))
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
    }
}

/// Status indicator with a colored dot.
struct StatusPill: View {
    let text: String
    var color: Color = Design3.success
    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(text).font(Design3.body(12, .semibold))
        }
        .foregroundStyle(color)
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Capsule().fill(color.opacity(0.12)))
    }
}

// MARK: - Skeleton

/// Loading shimmer placeholder (canon §4 loading state).
struct Skeleton: View {
    var radius: CGFloat = Design3.Radius.card
    @State private var animate = false
    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(Color.white.opacity(0.06))
            .overlay {
                GeometryReader { geo in
                    LinearGradient(colors: [.clear, Color.white.opacity(0.09), .clear],
                                   startPoint: .leading, endPoint: .trailing)
                        .frame(width: geo.size.width * 0.6)
                        .offset(x: animate ? geo.size.width : -geo.size.width * 0.6)
                }
                .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            }
            .onAppear {
                withAnimation(.linear(duration: 1.2).repeatForever(autoreverses: false)) { animate = true }
            }
    }
}

// MARK: - Floating glass tab bar

struct GlassTabItem: Identifiable {
    let id: Int
    let systemImage: String
    let label: String
    var badge: Int = 0
    let isActive: Bool
    let action: () -> Void
}

/// Liquid-glass floating tab bar (canon 3.0): blur, orange active pill.
struct GlassTabBar: View {
    let items: [GlassTabItem]
    var body: some View {
        HStack(spacing: 4) {
            ForEach(items) { item in
                Button(action: item.action) {
                    VStack(spacing: 3) {
                        ZStack(alignment: .topTrailing) {
                            Image(systemName: item.systemImage)
                                .font(.system(size: 20, weight: item.isActive ? .semibold : .regular))
                            if item.badge > 0 {
                                Text("\(item.badge)")
                                    .font(Design3.mono(9, .bold))
                                    .foregroundStyle(.white)
                                    .padding(3)
                                    .background(Circle().fill(Design3.orange))
                                    .offset(x: 11, y: -8)
                            }
                        }
                        Text(item.label).font(Design3.body(9.5, .medium))
                    }
                    .foregroundStyle(item.isActive ? Design3.orange : Design3.textSubtle)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background {
                        if item.isActive {
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .fill(LinearGradient(colors: [Design3.orange.opacity(0.24), Design3.orange.opacity(0.07)],
                                                     startPoint: .top, endPoint: .bottom))
                                .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .strokeBorder(Design3.orange.opacity(0.38), lineWidth: 1))
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(6)
        .background {
            RoundedRectangle(cornerRadius: 32, style: .continuous)
                .fill(Color.white.opacity(0.10))
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 32, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 32, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.14), lineWidth: 1))
        }
        .shadow(color: .black.opacity(0.52), radius: 26, y: 14)
        .padding(.horizontal, 12)
    }
}

// MARK: - Section header

struct SectionHeader: View {
    let title: String
    var actionLabel: String? = nil
    var action: (() -> Void)? = nil
    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(Design3.heading(18, .bold)).foregroundStyle(Design3.textPrimary)
            Spacer()
            if let actionLabel, let action {
                Button(actionLabel, action: action)
                    .font(Design3.body(13, .semibold))
                    .foregroundStyle(Design3.orange)
            }
        }
    }
}
