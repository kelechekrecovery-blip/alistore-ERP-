import SwiftUI
import AliStoreCore

// Fullscreen stories viewer (3.0 deck: story overlay).
// Progress bars, tap zones (prev/next), auto-advance, swipe/× to dismiss.
//
// СБОРКА ДЛЯ МАГАЗИНА ЭТОТ ЭКРАН НЕ СОДЕРЖИТ.
//
// Содержимое сторис — выдуманные коммерческие обещания: «Скидки до −30%»,
// «рассрочка 0%», «Доставка за 1–2 часа», «Бесплатно от 5 000 сом» и названные
// модели «iPhone 15, MacBook Air и AirPods». Ни одно из них не читается с
// сервера, а все кнопки CTA ведут в finish(), то есть просто закрывают экран.
//
// Apple дважды отклоняла сборку ровно за этот класс (Guideline 2.3): плитки
// Client, ведущие на выдуманные данные, и мокап «Добавить товар» в Staff.
// Экран висел первым блоком на главной, вне #if DEBUG.
//
// Чтобы вернуть его в продажу, нужны реальные источники: акции — из storefront
// blocks, сроки и порог бесплатной доставки — из checkout-options, хиты — из
// каталога, и работающая навигация по CTA.
#if DEBUG

struct StoryPage: Identifiable, Sendable {
    let id: Int
    let emoji: String
    let title: String
    let text: String
    let cta: String

    static let all: [StoryPage] = [
        StoryPage(id: 0, emoji: "🔥", title: "Хиты продаж недели",
                  text: "iPhone 15, MacBook Air и AirPods разбирают быстрее всего. Успей до конца недели.",
                  cta: "Смотреть хиты"),
        StoryPage(id: 1, emoji: "🎁", title: "Скидки до −30%",
                  text: "Trade-in и рассрочка 0% на флагманы. Обменяй старое — доплати меньше.",
                  cta: "Открыть акции"),
        StoryPage(id: 2, emoji: "♻️", title: "Оценка за 30 секунд",
                  text: "Сдай старый смартфон и получи скидку на новый прямо в приложении.",
                  cta: "Оценить устройство"),
        StoryPage(id: 3, emoji: "🆕", title: "Только что завезли",
                  text: "Свежие поступления недели уже в наличии в Бишкеке.",
                  cta: "Смотреть новинки"),
        StoryPage(id: 4, emoji: "⚡️", title: "Доставка за 1–2 часа",
                  text: "По Бишкеку привезём технику в день заказа. Бесплатно от 5 000 сом.",
                  cta: "Как это работает"),
    ]
}

@MainActor
struct StoriesViewer: View {
    var pages: [StoryPage] = StoryPage.all
    var startIndex: Int = 0
    var onFinished: () -> Void = {}

    @State private var index: Int = 0
    @State private var progress: Double = 0
    @Environment(\.dismiss) private var dismiss

    private let storyDuration: Double = 5

    var body: some View {
        ZStack {
            // Warm brand gradient backdrop.
            LinearGradient(colors: [Design3.screen, Design3.frame], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
            RadialGradient(colors: [Design3.orange.opacity(0.18), .clear], center: .top, startRadius: 0, endRadius: 420)
                .ignoresSafeArea()

            let page = pages[safe: index] ?? pages[0]
            VStack(spacing: 0) {
                progressBars
                header

                Spacer()
                Text(page.emoji).font(.system(size: 88))
                Text(page.title)
                    .font(Design3.heading(28, .heavy))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.top, 20)
                    .padding(.horizontal, 20)
                Text(page.text)
                    .font(Design3.body(15))
                    .foregroundStyle(Design3.textBright)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .padding(.top, 12)
                    .padding(.horizontal, 28)
                Spacer()

                Button {
                    finish()
                } label: {
                    Text(page.cta)
                        .font(Design3.body(15, .bold))
                        .foregroundStyle(Design3.frame)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(Design3.orange, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 20)
                .padding(.bottom, 34)
                .accessibilityIdentifier("story-cta")
            }

            // Tap zones: left third = previous, right two-thirds = next.
            HStack(spacing: 0) {
                Color.clear.contentShape(Rectangle()).onTapGesture { back() }.frame(maxWidth: .infinity)
                Color.clear.contentShape(Rectangle()).onTapGesture { advance() }.frame(maxWidth: .infinity)
                Color.clear.contentShape(Rectangle()).onTapGesture { advance() }.frame(maxWidth: .infinity)
            }
            .padding(.top, 90)
            .padding(.bottom, 100)
        }
        .accessibilityIdentifier("client-stories")
        .task(id: index) { await runTimer() }
        .gesture(DragGesture(minimumDistance: 40).onEnded { value in
            if value.translation.height > 60 { finish() }
        })
        .onAppear { index = min(max(startIndex, 0), pages.count - 1) }
    }

    private var progressBars: some View {
        HStack(spacing: 4) {
            ForEach(pages.indices, id: \.self) { i in
                GeometryReader { geo in
                    Capsule().fill(Color.white.opacity(0.25))
                        .overlay(alignment: .leading) {
                            Capsule().fill(Color.white)
                                .frame(width: geo.size.width * fill(for: i))
                        }
                }
                .frame(height: 3)
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 14)
    }

    private var header: some View {
        HStack {
            Text("⚡ AliStore").font(Design3.heading(14, .bold)).foregroundStyle(.white)
            Spacer()
            Button { finish() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 32, height: 32)
                    .background(Color.white.opacity(0.12), in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("story-close")
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
    }

    private func fill(for i: Int) -> Double {
        if i < index { return 1 }
        if i == index { return progress }
        return 0
    }

    private func runTimer() async {
        progress = 0
        let steps = 60
        let interval = storyDuration / Double(steps)
        for step in 1...steps {
            try? await Task.sleep(nanoseconds: UInt64(interval * 1_000_000_000))
            if Task.isCancelled { return }
            withAnimation(.linear(duration: interval)) { progress = Double(step) / Double(steps) }
        }
        advance()
    }

    private func advance() {
        if index < pages.count - 1 { index += 1 } else { finish() }
    }

    private func back() {
        if index > 0 { index -= 1 } else { progress = 0 }
    }

    private func finish() {
        onFinished()
        dismiss()
    }
}

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}

#if DEBUG
#Preview {
    StoriesViewer().preferredColorScheme(.dark)
}
#endif
#endif
