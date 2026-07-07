/** RBAC with role inheritance (casbin). */
export const RBAC_MODEL = `
[request_definition]
r = sub, obj, act
[policy_definition]
p = sub, obj, act
[role_definition]
g = _, _
[policy_effect]
e = some(where (p.eft == allow))
[matchers]
m = g(r.sub, p.sub) && r.obj == p.obj && r.act == p.act
`;

/**
 * Role Permission Matrix — approval gates from reference/api-and-events.md plus
 * staff operational endpoints. Owner/admin are explicit on operational actions
 * so cashier/warehouse/courier permissions stay separate.
 */
export const RBAC_POLICY = `
p, senior_seller, discount, approve
p, admin, refund, approve
p, owner, writeoff, approve
p, admin, price, approve
p, senior_seller, debt, approve
p, owner, stock_adjust, approve
p, owner, delete, approve
p, admin, pii, approve
p, owner, staff, manage
p, cashier, pos, sale
p, seller, pos, sale
p, senior_seller, pos, sale
p, franchise, pos, sale
p, admin, pos, sale
p, owner, pos, sale
p, cashier, shift, read
p, seller, shift, read
p, senior_seller, shift, read
p, franchise, shift, read
p, admin, shift, read
p, owner, shift, read
p, cashier, shift, open
p, seller, shift, open
p, senior_seller, shift, open
p, franchise, shift, open
p, admin, shift, open
p, owner, shift, open
p, cashier, shift, close
p, seller, shift, close
p, senior_seller, shift, close
p, franchise, shift, close
p, admin, shift, close
p, owner, shift, close
p, warehouse, inventory, movement
p, admin, inventory, movement
p, owner, inventory, movement
p, warehouse, inventory, transfer
p, admin, inventory, transfer
p, owner, inventory, transfer
p, warehouse, inventory, count
p, admin, inventory, count
p, owner, inventory, count
p, warehouse, orders, queue
p, admin, orders, queue
p, owner, orders, queue
p, warehouse, orders, reserve
p, admin, orders, reserve
p, owner, orders, reserve
p, warehouse, orders, fulfill
p, admin, orders, fulfill
p, owner, orders, fulfill
p, warehouse, orders, transition
p, courier, orders, transition
p, admin, orders, transition
p, owner, orders, transition
p, courier, courier, read
p, warehouse, courier, read
p, admin, courier, read
p, owner, courier, read
p, warehouse, courier, assign
p, admin, courier, assign
p, owner, courier, assign
p, courier, courier, handover
p, cashier, courier, handover
p, admin, courier, handover
p, owner, courier, handover
p, courier, delivery, fail
p, admin, delivery, fail
p, owner, delivery, fail
p, seller, documents, read
p, cashier, documents, read
p, warehouse, documents, read
p, admin, documents, read
p, owner, documents, read
p, seller, labels, print
p, cashier, labels, print
p, warehouse, labels, print
p, admin, labels, print
p, owner, labels, print
p, seller, receipts, print
p, cashier, receipts, print
p, senior_seller, receipts, print
p, franchise, receipts, print
p, admin, receipts, print
p, owner, receipts, print
p, admin, products, price
p, owner, products, price
p, admin, products, archive
p, owner, products, archive
p, cashier, payments, refund
p, senior_seller, payments, refund
p, admin, payments, refund
p, owner, payments, refund
p, warehouse, warranty, read
p, admin, warranty, read
p, owner, warranty, read
p, warehouse, warranty, transition
p, admin, warranty, transition
p, owner, warranty, transition
p, admin, support, read
p, owner, support, read
p, admin, support, transition
p, owner, support, transition
p, admin, support, escalate
p, owner, support, escalate
p, admin, suppliers, create
p, owner, suppliers, create
p, warehouse, suppliers, read
p, admin, suppliers, read
p, owner, suppliers, read
p, admin, suppliers, scorecard
p, owner, suppliers, scorecard
p, warehouse, suppliers, rma_open
p, admin, suppliers, rma_open
p, owner, suppliers, rma_open
p, warehouse, suppliers, rma_read
p, admin, suppliers, rma_read
p, owner, suppliers, rma_read
p, warehouse, suppliers, rma_transition
p, admin, suppliers, rma_transition
p, owner, suppliers, rma_transition
p, cashier, debts, create
p, seller, debts, create
p, senior_seller, debts, create
p, franchise, debts, create
p, admin, debts, create
p, owner, debts, create
p, cashier, debts, read
p, seller, debts, read
p, senior_seller, debts, read
p, franchise, debts, read
p, admin, debts, read
p, owner, debts, read
p, cashier, debts, pay
p, senior_seller, debts, pay
p, admin, debts, pay
p, owner, debts, pay
p, cashier, tradeins, intake
p, seller, tradeins, intake
p, senior_seller, tradeins, intake
p, franchise, tradeins, intake
p, admin, tradeins, intake
p, owner, tradeins, intake
p, cashier, tradeins, read
p, seller, tradeins, read
p, senior_seller, tradeins, read
p, franchise, tradeins, read
p, admin, tradeins, read
p, owner, tradeins, read
g, owner, admin
g, admin, senior_seller
`;
