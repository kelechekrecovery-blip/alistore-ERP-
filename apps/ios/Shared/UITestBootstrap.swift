import Foundation

public enum UITestBootstrap {
    public enum AccountFixtureMode: Sendable, Equatable {
        case loaded
        case empty
        case error
    }

    public static var disablesSessionRestore: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--ui-testing-signed-out")
        #else
        false
        #endif
    }

    public static var startsAsGuest: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--ui-testing-guest")
        #else
        false
        #endif
    }

    public static var startsAtCheckout: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--ui-testing-checkout")
        #else
        false
        #endif
    }

    public static var startsAtCart: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--ui-testing-cart")
        #else
        false
        #endif
    }

    public static var startsAtPaymentResult: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--ui-testing-payment-result")
        #else
        false
        #endif
    }

    public static var startsAtPaymentFailure: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--ui-testing-payment-failure")
        #else
        false
        #endif
    }

    public static var startsAtVisualEvidence: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--ui-testing-visual-evidence")
        #else
        false
        #endif
    }

    public static var usesCashShiftFixture: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--ui-testing-cash-shift")
        #else
        false
        #endif
    }

    public static var requiresQuickUnlock: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--ui-testing-quick-unlock")
        #else
        false
        #endif
    }

    public static var startsSignedIn: Bool {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        return arguments.contains("--ui-testing-signed-in") || accountFixtureMode != .loaded
        #else
        false
        #endif
    }

    public static var staffRole: String {
        #if DEBUG
        let prefix = "--ui-testing-role="
        if let value = ProcessInfo.processInfo.arguments.first(where: { $0.hasPrefix(prefix) }) {
            return String(value.dropFirst(prefix.count))
        }
        return "sales"
        #else
        return "sales"
        #endif
    }

    public static var accountFixtureMode: AccountFixtureMode {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        if arguments.contains("--ui-testing-account-error") { return .error }
        if arguments.contains("--ui-testing-account-empty") { return .empty }
        return .loaded
        #else
        .loaded
        #endif
    }

    public static var startsAtAccount: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--ui-testing-account")
        #else
        false
        #endif
    }

    /// Deep-links straight to a named account subscreen (`--ui-testing-feature=installment`).
    /// Used by the visual gate to capture 3.0 feature screens without manual navigation.
    public static var featureRoute: String? {
        #if DEBUG
        let prefix = "--ui-testing-feature="
        return ProcessInfo.processInfo.arguments
            .first(where: { $0.hasPrefix(prefix) })
            .map { String($0.dropFirst(prefix.count)) }
        #else
        return nil
        #endif
    }
}
