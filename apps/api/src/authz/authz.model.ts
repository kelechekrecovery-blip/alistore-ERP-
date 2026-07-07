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
 * Role Permission Matrix — who may APPROVE each dangerous action
 * (source: reference/api-and-events.md). Role hierarchy: owner ⊃ admin ⊃
 * senior_seller, so higher roles inherit everything below.
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
g, owner, admin
g, admin, senior_seller
`;
