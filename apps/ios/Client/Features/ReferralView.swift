import SwiftUI
import AliStoreCore

// «Пригласи друга» — referral program (3.0 deck: REFERRAL).
// Client-side: code + share link + earned-bonuses stats. Attribution flows to the
// Marketing center campaign (k-factor / channel ROAS) once the backend module lands.

struct ReferralView: View {
    var code: String = "NURBEK500"
    var invited: Int = 3
    var earned: Int = 1_500

    @State private var copied = false

    private var shareURL: URL? {
        URL(string: "https://ali.kg/ref/\(code)")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                heroCard
                codeCard
                shareButton
                statsCard
                campaignNote
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 24)
        }
        .background(Design3.screen.ignoresSafeArea())
        .navigationTitle("Пригласи друга")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("account-referral")
    }

    private var heroCard: some View {
        VStack(spacing: 0) {
            Text("🤝").font(.system(size: 44))
            Text("+500 бонусов\nвам и другу")
                .font(Design3.heading(22, .heavy))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .lineSpacing(2)
                .padding(.top, 10)
            Text("Друг получает 500 бонусов на первую покупку, вы — 500 после его заказа.")
                .font(Design3.body(13))
                .foregroundStyle(Color(red: 1, green: 0.878, blue: 0.835))
                .multilineTextAlignment(.center)
                .lineSpacing(3)
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(
            LinearGradient(colors: [Design3.orange, Design3.orangePressed],
                           startPoint: .topLeading, endPoint: .bottomTrailing),
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
    }

    private var codeCard: some View {
        HStack(spacing: 10) {
            Text(code)
                .font(Design3.mono(15, .medium))
                .foregroundStyle(Design3.orange)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button {
                UIPasteboard.general.string = code
                withAnimation(.easeOut(duration: 0.2)) { copied = true }
            } label: {
                Text(copied ? "Скопировано" : "Копировать")
                    .font(Design3.body(12))
                    .foregroundStyle(Design3.textBright)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("referral-copy")
        }
        .padding(14)
        .glass(radius: 13)
    }

    @ViewBuilder private var shareButton: some View {
        if let shareURL {
            ShareLink(item: shareURL, subject: Text("AliStore"), message: Text("Дарю 500 бонусов на первую покупку в AliStore: \(code)")) {
                Text("Поделиться ссылкой")
                    .font(Design3.body(15, .bold))
                    .foregroundStyle(Design3.frame)
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Design3.orange, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            }
            .accessibilityIdentifier("referral-share")
        }
    }

    private var statsCard: some View {
        HStack(spacing: 0) {
            statColumn(value: "\(invited)", label: "приглашено", accent: false)
            Rectangle().fill(Design3.surfaceRaised).frame(width: 1, height: 40)
            statColumn(value: installmentGrouped(earned), label: "бонусов заработано", accent: true)
        }
        .padding(16)
        .glass(radius: 13)
    }

    private func statColumn(value: String, label: String, accent: Bool) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(Design3.heading(22, .heavy))
                .foregroundStyle(accent ? Design3.orange : .white)
            Text(label)
                .font(Design3.body(11))
                .foregroundStyle(Design3.textSubtle)
        }
        .frame(maxWidth: .infinity)
    }

    private var campaignNote: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(Design3.success)
                .frame(width: 7, height: 7)
                .shadow(color: Design3.success, radius: 4)
            Text("Часть кампании «Реферальная программа» — статистика уходит в Маркетинг-центр (k-фактор, ROAS канала).")
                .font(Design3.body(11.5))
                .foregroundStyle(Design3.textMuted)
                .lineSpacing(2)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 11)
        .background(Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.white.opacity(0.08), lineWidth: 1))
    }
}

/// Grouped digits without the « сом » suffix (bonuses, counts).
func installmentGrouped(_ value: Int) -> String {
    let digits = Array(String(value))
    let grouped = digits.reversed().enumerated().flatMap { index, character -> [Character] in
        index > 0 && index % 3 == 0 ? [" ", character] : [character]
    }
    return String(grouped.reversed())
}

#if DEBUG
#Preview {
    NavigationStack { ReferralView() }
        .preferredColorScheme(.dark)
}
#endif
