"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveOpenCashShiftOnTx = resolveOpenCashShiftOnTx;
exports.recordCashDrawerMovementOnTx = recordCashDrawerMovementOnTx;
const errors_1 = require("../common/errors");
async function resolveOpenCashShiftOnTx(tx, staffId) {
    if (!staffId) {
        throw new errors_1.ValidationError('cash_staff_required', 'Наличные принимает только авторизованный сотрудник');
    }
    const candidate = await tx.cashShift.findFirst({
        where: { staffId, closedAt: null },
        select: { id: true },
        orderBy: { openedAt: 'desc' },
    });
    if (!candidate) {
        throw new errors_1.ConflictError('cash_shift_required', 'Для движения наличных нужна открытая кассовая смена');
    }
    await tx.$queryRaw `SELECT id FROM "CashShift" WHERE id = ${candidate.id} FOR UPDATE`;
    const shift = await tx.cashShift.findUnique({ where: { id: candidate.id } });
    if (!shift)
        throw new errors_1.ConflictError('cash_shift_required', 'Кассовая смена не найдена');
    if (shift.closedAt) {
        throw new errors_1.ConflictError('cash_shift_closed', 'Нельзя добавить движение в закрытую кассовую смену');
    }
    return shift;
}
async function recordCashDrawerMovementOnTx(tx, input) {
    if (!Number.isSafeInteger(input.amount) || input.amount === 0) {
        throw new errors_1.ValidationError('cash_movement_amount_invalid', 'Сумма движения наличных должна быть ненулевым целым');
    }
    const key = input.idempotencyKey.trim();
    if (!key) {
        throw new errors_1.ValidationError('idempotency_key_required', 'Требуется ключ идемпотентности движения наличных');
    }
    const existing = await tx.cashDrawerMovement.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
        if (existing.amount !== input.amount || existing.kind !== input.kind) {
            throw new errors_1.ConflictError('cash_movement_replay_mismatch', 'Ключ движения наличных уже использован с другими параметрами');
        }
        return existing;
    }
    const shift = await resolveOpenCashShiftOnTx(tx, input.staffId);
    return tx.cashDrawerMovement.create({
        data: {
            idempotencyKey: key,
            shiftId: shift.id,
            point: shift.point,
            amount: input.amount,
            kind: input.kind,
            sourceType: input.sourceType ?? null,
            sourceRef: input.sourceRef ?? null,
            reason: input.reason ?? null,
            createdBy: input.createdBy,
            accountingEntryId: input.accountingEntryId ?? null,
        },
    });
}
//# sourceMappingURL=cash-drawer.js.map