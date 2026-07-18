import SwiftUI
import AliStoreCore

// «Моя рассрочка» — customer installment plan (3.0 deck: INSTALLMENT).
// Client-side model: the customer-facing installment endpoint lands later, so this
// renders a representative plan (next payment + full schedule) styled 1:1 with the deck.
// Money uses JetBrains Mono per canon; the schedule mirrors an ERP debt aggregate.

// MARK: - Model

struct InstallmentPayment: Identifiable, Sendable {
    enum Progress: Sendable { case paid, next, future }
    let id: Int
    let date: String
    let amount: Int
    let progress: Progress

    var mark: String { progress == .paid ? "✓" : "\(id)" }

    var statusText: String {
        switch progress {
        case .paid: return "Оплачено"
        case .next: return "Следующий платёж"
        case .future: return "Ожидается"
        }
    }

    var statusColor: Color {
        switch progress {
        case .paid: return Design3.success
        case .next: return Design3.orange
        case .future: return Design3.textSubtle
        }
    }

    var badgeBackground: Color {
        switch progress {
        case .paid: return Design3.success.opacity(0.15)
        case .next: return Design3.orange.opacity(0.18)
        case .future: return Color.white.opacity(0.05)
        }
    }

    var badgeBorder: Color {
        switch progress {
        case .paid: return Design3.success.opacity(0.4)
        case .next: return Design3.orange.opacity(0.5)
        case .future: return Design3.hairlineGlass
        }
    }

    var badgeForeground: Color {
        switch progress {
        case .paid: return Design3.success
        case .next: return Design3.orange
        case .future: return Design3.textSubtle
        }
    }
}

struct InstallmentPlan: Sendable {
    let bank: String
    let productTitle: String
    let monthly: Int
    let nextDate: String
    let paidCount: Int
    let totalCount: Int
    let remaining: Int
    let schedule: [InstallmentPayment]

    var progress: Double {
        totalCount == 0 ? 0 : Double(paidCount) / Double(totalCount)
    }

    /// Representative plan (iPhone 15 · 128 ГБ, 6 months) until the customer endpoint exists.
    static let sample = InstallmentPlan(
        bank: "MBank",
        productTitle: "iPhone 15 · 128 ГБ",
        monthly: 19_150,
        nextDate: "15 августа",
        paidCount: 2,
        totalCount: 6,
        remaining: 76_600,
        schedule: [
            InstallmentPayment(id: 1, date: "15 июня", amount: 19_150, progress: .paid),
            InstallmentPayment(id: 2, date: "15 июля", amount: 19_150, progress: .paid),
            InstallmentPayment(id: 3, date: "15 августа", amount: 19_150, progress: .next),
            InstallmentPayment(id: 4, date: "15 сентября", amount: 19_150, progress: .future),
            InstallmentPayment(id: 5, date: "15 октября", amount: 19_150, progress: .future),
            InstallmentPayment(id: 6, date: "15 ноября", amount: 19_150, progress: .future),
        ]
    )
}

// MARK: - View

struct InstallmentView: View {
    var plan: InstallmentPlan = .sample

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                nextPaymentCard
                    .padding(.bottom, 14)

                HStack {
                    Text("Оплачено \(plan.paidCount) из \(plan.totalCount)")
                    Spacer()
                    Text("Остаток \(installmentSom(plan.remaining))")
                }
                .font(Design3.body(12))
                .foregroundStyle(Design3.textSubtle)
                .padding(.horizontal, 2)
                .padding(.bottom, 8)

                progressBar
                    .padding(.bottom, 18)

                Text("\(plan.productTitle) · график")
                    .font(Design3.body(13))
                    .foregroundStyle(Design3.textMuted)
                    .padding(.bottom, 10)

                ForEach(plan.schedule) { payment in
                    scheduleRow(payment)
                }

                Text("Напоминание придёт за 2 дня до платежа. Остаток долга синхронизирован с ERP.")
                    .font(Design3.body(11))
                    .foregroundStyle(Design3.textFaint)
                    .lineSpacing(3)
                    .padding(.top, 12)
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 24)
        }
        .background(Design3.screen.ignoresSafeArea())
        .navigationTitle("Моя рассрочка")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("account-installment")
    }

    private var nextPaymentCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Следующий платёж · \(plan.bank)")
                Spacer()
                Text(plan.nextDate)
            }
            .font(Design3.body(11))
            .foregroundStyle(Self.peach)

            Text(installmentSom(plan.monthly))
                .font(Design3.heading(32, .heavy))
                .foregroundStyle(.white)
                .padding(.top, 6)

            Button {
                // Payment routing lands with the customer installment endpoint.
            } label: {
                Text("Оплатить \(installmentSom(plan.monthly))")
                    .font(Design3.body(14, .bold))
                    .foregroundStyle(Design3.frame)
                    .frame(maxWidth: .infinity)
                    .frame(height: 46)
                    .background(Design3.glassStrong, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(Design3.hairlineGlass, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .padding(.top, 14)
            .accessibilityIdentifier("installment-pay")
        }
        .padding(20)
        .background(
            LinearGradient(
                colors: [Design3.orangeSoft.opacity(0.22), Design3.orange.opacity(0.06)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .strokeBorder(Design3.orangeSoft.opacity(0.3), lineWidth: 1)
        )
    }

    private var progressBar: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.white.opacity(0.09))
                Capsule()
                    .fill(LinearGradient(
                        colors: [Color(red: 0.56, green: 0.831, blue: 0.059), Design3.lime],
                        startPoint: .leading, endPoint: .trailing
                    ))
                    .frame(width: max(0, proxy.size.width * plan.progress))
            }
        }
        .frame(height: 8)
    }

    private func scheduleRow(_ payment: InstallmentPayment) -> some View {
        HStack(spacing: 12) {
            Text(payment.mark)
                .font(Design3.mono(12, .medium))
                .foregroundStyle(payment.badgeForeground)
                .frame(width: 30, height: 30)
                .background(payment.badgeBackground, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .strokeBorder(payment.badgeBorder, lineWidth: 1)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(payment.date)
                    .font(Design3.body(13.5))
                    .foregroundStyle(.white)
                Text(payment.statusText)
                    .font(Design3.body(11))
                    .foregroundStyle(payment.statusColor)
            }

            Spacer(minLength: 6)

            Text(installmentSom(payment.amount))
                .font(Design3.mono(13, .medium))
                .foregroundStyle(Design3.textBright)
        }
        .padding(.vertical, 12)
        .overlay(alignment: .bottom) {
            Rectangle().fill(Design3.surface).frame(height: 1)
        }
    }

    private static let peach = Color(red: 1, green: 0.78, blue: 0.69)
}

// MARK: - Local money formatting (grouped digits + « сом »)

func installmentSom(_ value: Int) -> String {
    let digits = Array(String(value))
    let grouped = digits.reversed().enumerated().flatMap { index, character -> [Character] in
        index > 0 && index % 3 == 0 ? [" ", character] : [character]
    }
    return "\(String(grouped.reversed())) сом"
}

#if DEBUG
#Preview {
    NavigationStack { InstallmentView() }
        .preferredColorScheme(.dark)
}
#endif
