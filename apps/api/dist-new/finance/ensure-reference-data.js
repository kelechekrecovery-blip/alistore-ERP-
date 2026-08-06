"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureReferenceData = ensureReferenceData;
const accounting_chart_1 = require("./accounting-chart");
async function ensureReferenceData(prisma) {
    const created = await prisma.accountingAccount.createMany({
        data: accounting_chart_1.ACCOUNTING_ACCOUNT_SEED.map((account) => ({
            code: account.code,
            name: account.name,
            type: account.type,
        })),
        skipDuplicates: true,
    });
    return {
        accountsCreated: created.count,
        accountsTotal: await prisma.accountingAccount.count(),
    };
}
//# sourceMappingURL=ensure-reference-data.js.map