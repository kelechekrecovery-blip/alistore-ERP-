package kg.alistore.core

interface StaffCustomerGateway {
  suspend fun customerOverview(customerId: String, token: String): Customer360
  suspend fun transitionWarranty(caseId: String, to: String, token: String): WarrantyCase
  suspend fun transitionSupport(ticketId: String, to: String, token: String): SupportTicket
  suspend fun escalateSupport(ticketId: String, token: String): SupportTicket
}
