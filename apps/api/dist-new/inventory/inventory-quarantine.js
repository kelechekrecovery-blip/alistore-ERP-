"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createQuarantineCaseOnTx = createQuarantineCaseOnTx;
function createQuarantineCaseOnTx(tx, input) {
    return tx.inventoryQuarantineCase.upsert({
        where: {
            sourceType_returnId_unitId: {
                sourceType: input.sourceType,
                returnId: input.returnId,
                unitId: input.unitId,
            },
        },
        create: {
            unitId: input.unitId,
            sourceType: input.sourceType,
            returnId: input.returnId,
            reason: input.reason,
            unitCost: input.unitCost,
            createdBy: input.actor,
        },
        update: {},
    });
}
//# sourceMappingURL=inventory-quarantine.js.map