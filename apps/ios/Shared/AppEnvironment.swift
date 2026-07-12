import Foundation

public struct AppEnvironment: Sendable {
    public let apiBaseURL: URL

    public init(apiBaseURL: URL) {
        self.apiBaseURL = apiBaseURL
    }

    public static func live(bundle: Bundle = .main) -> AppEnvironment {
        guard
            let rawValue = bundle.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
            let url = URL(string: rawValue)
        else {
            preconditionFailure("API_BASE_URL must be a valid URL in Info.plist")
        }
        return AppEnvironment(apiBaseURL: url)
    }
}
