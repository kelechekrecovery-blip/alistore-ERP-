import SwiftUI
import MapKit
import CoreImage.CIFilterBuiltins
import AliStoreCore

// Order tracking (3.0 deck: ORDER STATUS) — live courier route + pickup QR + stage timeline.
// Fulfilment toggles courier (MapKit route) vs pickup (CoreImage QR). Sample data until the
// live courier GPS feed lands; stage timeline mirrors the Event Ledger order stages.

struct OrderStage: Identifiable, Sendable {
    enum Progress: Sendable { case done, active, upcoming }
    let id: Int
    let title: String
    let time: String
    let progress: Progress
}

struct TrackedOrder: Sendable {
    let number: String
    let date: String
    let total: Int
    let courierName: String
    let courierPhone: String
    let courierEta: String
    let pickupStore: String
    let pickupCode: String
    let pickupHours: String
    let stages: [OrderStage]
    let storeCoord: CLLocationCoordinate2D
    let destinationCoord: CLLocationCoordinate2D

    static let sample = TrackedOrder(
        number: "№4102",
        date: "19 июля",
        total: 132_000,
        courierName: "Данияр",
        courierPhone: "+996 700 12 34 56",
        courierEta: "18 мин",
        pickupStore: "AliStore · Чуй 128",
        pickupCode: "AL-4102-KG",
        pickupHours: "сегодня до 21:00",
        stages: [
            OrderStage(id: 1, title: "Заказ оформлен", time: "14:02", progress: .done),
            OrderStage(id: 2, title: "Собран на складе", time: "14:40", progress: .done),
            OrderStage(id: 3, title: "Передан курьеру", time: "15:10", progress: .active),
            OrderStage(id: 4, title: "Доставлен", time: "—", progress: .upcoming),
        ],
        storeCoord: CLLocationCoordinate2D(latitude: 42.8746, longitude: 74.5698),
        destinationCoord: CLLocationCoordinate2D(latitude: 42.8404, longitude: 74.6120)
    )
}

struct OrderTrackingView: View {
    var order: TrackedOrder = .sample
    @State private var mode = "courier"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                header
                modePicker
                if mode == "courier" { courierCard } else { pickupCard }
                timelineCard
                actionsRow
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 28)
        }
        .background(Design3.screen.ignoresSafeArea())
        .navigationTitle("Заказ \(order.number)")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("account-order-tracking")
    }

    private var header: some View {
        Text("\(order.date) · \(installmentSom(order.total))")
            .font(Design3.body(13))
            .foregroundStyle(Design3.textMuted)
    }

    private var modePicker: some View {
        HStack(spacing: 8) {
            modeButton("courier", "Курьер", "bolt.fill")
            modeButton("pickup", "Самовывоз", "building.2.fill")
        }
    }

    private func modeButton(_ value: String, _ title: String, _ symbol: String) -> some View {
        let active = mode == value
        return Button { mode = value } label: {
            Label(title, systemImage: symbol)
                .font(Design3.body(13, .semibold))
                .foregroundStyle(active ? Design3.orange : Design3.textMuted)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 11)
                .background {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(active ? Design3.orange.opacity(0.14) : Color.white.opacity(0.05))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(active ? Design3.orange.opacity(0.4) : Design3.hairlineGlass, lineWidth: 1))
                }
        }
        .buttonStyle(.plain)
    }

    private var courierCard: some View {
        VStack(spacing: 0) {
            Map(initialPosition: .region(routeRegion)) {
                Marker("Склад", systemImage: "building.2.fill", coordinate: order.storeCoord)
                    .tint(Design3.textSubtle)
                Marker("Вы", systemImage: "house.fill", coordinate: order.destinationCoord)
                    .tint(Design3.orange)
            }
            .frame(height: 200)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(alignment: .topLeading) {
                Label("Курьер в пути · \(order.courierEta)", systemImage: "scooter")
                    .font(Design3.body(12, .semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12).padding(.vertical, 8)
                    .background(Design3.orange, in: Capsule())
                    .padding(12)
            }

            HStack(spacing: 12) {
                Circle().fill(LinearGradient(colors: [Design3.orangeSoft, Design3.orangePressed], startPoint: .top, endPoint: .bottom))
                    .frame(width: 44, height: 44)
                    .overlay(Text(String(order.courierName.prefix(1))).font(Design3.heading(18, .bold)).foregroundStyle(.white))
                VStack(alignment: .leading, spacing: 2) {
                    Text(order.courierName).font(Design3.body(15, .semibold)).foregroundStyle(.white)
                    Text("курьер · \(order.courierPhone)").font(Design3.body(11)).foregroundStyle(Design3.textMuted)
                }
                Spacer()
                circleAction("phone.fill")
                circleAction("message.fill")
            }
            .padding(.top, 14)
        }
        .padding(14)
        .glass(radius: 18)
    }

    private var pickupCard: some View {
        VStack(spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "building.2.fill").foregroundStyle(Design3.orange)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Самовывоз · \(order.pickupStore)").font(Design3.body(14, .semibold)).foregroundStyle(.white)
                    Text("Покажите код на кассе для выдачи").font(Design3.body(11)).foregroundStyle(Design3.textMuted)
                }
                Spacer(minLength: 0)
            }

            if let qr = qrImage(order.pickupCode) {
                Image(uiImage: qr)
                    .interpolation(.none)
                    .resizable()
                    .frame(width: 180, height: 180)
                    .padding(14)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }

            Text(order.pickupCode)
                .font(Design3.mono(16, .medium))
                .foregroundStyle(Design3.orange)

            HStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Design3.success)
                Text("Готов к выдаче · \(order.pickupHours)")
                    .font(Design3.body(12, .semibold)).foregroundStyle(Design3.success)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(18)
        .glass(radius: 18)
    }

    private var timelineCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(order.stages.enumerated()), id: \.element.id) { index, stage in
                HStack(alignment: .top, spacing: 12) {
                    VStack(spacing: 0) {
                        Circle()
                            .fill(dotColor(stage.progress))
                            .frame(width: 14, height: 14)
                            .overlay(stage.progress == .done ? Image(systemName: "checkmark").font(.system(size: 7, weight: .black)).foregroundStyle(Design3.frame) : nil)
                        if index < order.stages.count - 1 {
                            Rectangle().fill(Design3.hairline).frame(width: 2, height: 26)
                        }
                    }
                    VStack(alignment: .leading, spacing: 1) {
                        Text(stage.title)
                            .font(Design3.body(13.5, stage.progress == .active ? .semibold : .regular))
                            .foregroundStyle(stage.progress == .upcoming ? Design3.textSubtle : .white)
                        Text(stage.time).font(Design3.body(11)).foregroundStyle(Design3.textSubtle)
                    }
                    Spacer(minLength: 0)
                }
            }
        }
        .padding(16)
        .glass(radius: 16)
    }

    private var actionsRow: some View {
        HStack(spacing: 8) {
            trackAction("Чек", "doc.text.fill")
            trackAction("Гарантия", "shield.checkered")
            trackAction("WhatsApp", "message.fill")
        }
    }

    private func trackAction(_ title: String, _ symbol: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: symbol).font(.system(size: 16, weight: .semibold)).foregroundStyle(Design3.orange)
            Text(title).font(Design3.body(11, .medium)).foregroundStyle(Design3.textBright)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .glass(radius: 13)
    }

    private func circleAction(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Design3.orange)
            .frame(width: 40, height: 40)
            .background(Design3.orange.opacity(0.14), in: Circle())
    }

    private var routeRegion: MKCoordinateRegion {
        let midLat = (order.storeCoord.latitude + order.destinationCoord.latitude) / 2
        let midLon = (order.storeCoord.longitude + order.destinationCoord.longitude) / 2
        return MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: midLat, longitude: midLon),
            span: MKCoordinateSpan(latitudeDelta: 0.08, longitudeDelta: 0.08)
        )
    }

    private func dotColor(_ progress: OrderStage.Progress) -> Color {
        switch progress {
        case .done: return Design3.success
        case .active: return Design3.orange
        case .upcoming: return Design3.hairline
        }
    }

    private func qrImage(_ string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"
        guard let output = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)),
              let cg = context.createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

#if DEBUG
#Preview {
    NavigationStack { OrderTrackingView() }
        .preferredColorScheme(.dark)
}
#endif
