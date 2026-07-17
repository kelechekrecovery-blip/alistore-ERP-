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

    public static var startsSignedIn: Bool {
        #if DEBUG
        let arguments = ProcessInfo.processInfo.arguments
        return arguments.contains("--ui-testing-signed-in") || accountFixtureMode != .loaded
        #else
        false
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
}
