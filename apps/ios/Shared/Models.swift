import Foundation

public struct CatalogResponse: Decodable, Sendable {
    public let items: [Product]
    public let total: Int
}

public struct Product: Decodable, Identifiable, Sendable {
    public let id: String
    public let sku: String
    public let name: String
    public let price: Int
    public let category: String
    public let availableUnits: Int
}

public struct StaffSession: Codable, Sendable {
    public let accessToken: String
    public let staffId: String
    public let username: String
    public let role: String
}

public struct StaffLogin: Encodable, Sendable {
    public let username: String
    public let password: String

    public init(username: String, password: String) {
        self.username = username
        self.password = password
    }
}
