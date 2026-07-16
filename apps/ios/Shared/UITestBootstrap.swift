import Foundation

public enum UITestBootstrap {
    public static var disablesSessionRestore: Bool {
        #if DEBUG
        ProcessInfo.processInfo.arguments.contains("--ui-testing-signed-out")
        #else
        false
        #endif
    }
}
