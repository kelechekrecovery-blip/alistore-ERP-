export declare const Role: {
    readonly seller: "seller";
    readonly senior_seller: "senior_seller";
    readonly cashier: "cashier";
    readonly warehouse: "warehouse";
    readonly service: "service";
    readonly technician: "technician";
    readonly courier: "courier";
    readonly marketer: "marketer";
    readonly admin: "admin";
    readonly owner: "owner";
};
export type Role = (typeof Role)[keyof typeof Role];
export declare const APPROVAL_APPROVER_ROLES: Record<string, Role[]>;
export declare const APPROVAL_THRESHOLDS: {
    readonly discountPct: 10;
    readonly priceChangePct: 15;
    readonly minMarginSom: 0;
};
export declare const ROLE_DISCOUNT_LIMIT_PCT: Record<Role, number>;
export declare function canApprove(action: string, role: Role): boolean;
export declare function canDiscountDirectly(role: Role, pct: number): boolean;
