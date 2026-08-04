import SwiftUI

public struct NativeStatusCard: View {
    private let title: String
    private let value: String
    private let symbol: String
    private let tint: Color

    public init(title: String, value: String, symbol: String, tint: Color) {
        self.title = title
        self.value = value
        self.symbol = symbol
        self.tint = tint
    }

    public var body: some View {
        HStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.title3.weight(.semibold))
                .foregroundStyle(tint)
                .frame(width: 42, height: 42)
                .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.caption).foregroundStyle(.secondary)
                Text(value).font(.headline)
            }
            Spacer()
        }
        .padding(14)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 12))
    }
}

public struct EmptyStateView: View {
    private let title: String
    private let detail: String
    private let symbol: String

    public init(title: String, detail: String, symbol: String) {
        self.title = title
        self.detail = detail
        self.symbol = symbol
    }

    public var body: some View {
        ContentUnavailableView(title, systemImage: symbol, description: Text(detail))
    }
}
