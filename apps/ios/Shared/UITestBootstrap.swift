import Foundation

public enum UITestBootstrap {
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

    public static var startsSignedIn: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--ui-testing-signed-in")
        #else
        false
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
