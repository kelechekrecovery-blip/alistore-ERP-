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

public struct OTPRequest: Encodable, Sendable {
    public let phone: String

    public init(phone: String) { self.phone = phone }
}

public struct OTPVerification: Encodable, Sendable {
    public let phone: String
    public let code: String

    public init(phone: String, code: String) {
        self.phone = phone
        self.code = code
    }
}

public struct OTPChallenge: Decodable, Sendable {
    public let expiresIn: Int
    public let devCode: String?
}

public struct CustomerAuthTokens: Codable, Sendable {
    public let accessToken: String
    public let refreshToken: String
    public let tokenType: String
    public let expiresIn: String
}

public struct CustomerPrincipal: Decodable, Sendable {
    public let customerId: String
    public let phone: String?
    public let typ: String
}

public struct CustomerSession: Codable, Sendable {
    public let accessToken: String
    public let refreshToken: String
    public let customerId: String
    public let phone: String
}

public struct RefreshRequest: Encodable, Sendable {
    public let refreshToken: String

    public init(refreshToken: String) { self.refreshToken = refreshToken }
}

public struct CustomerOrderItem: Decodable, Sendable {
    public let sku: String
    public let qty: Int
    public let price: Int
    public let imei: String?
}

public struct CustomerOrder: Decodable, Identifiable, Sendable {
    public let id: String
    public let channel: String
    public let fulfillmentType: String?
    public let pickupPoint: String?
    public let deliveryAddress: String?
    public let deliverySlot: String?
    public let pickupCode: String?
    public let status: String
    public let total: Int
    public let createdAt: Date
    public let items: [CustomerOrderItem]
}
