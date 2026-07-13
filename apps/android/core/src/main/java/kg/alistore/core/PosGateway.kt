package kg.alistore.core

interface PosGateway {
  suspend fun posSale(request: PosSaleRequest, token: String): PosSaleResult
}
