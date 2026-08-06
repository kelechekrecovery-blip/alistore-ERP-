"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CloseFinanceSettlementDto = exports.ResolveFinanceSettlementDto = exports.CreateFinanceSettlementDto = exports.FinanceSettlementEntryDto = exports.FinanceSettlementQueryDto = exports.SETTLEMENT_SOURCE_TYPES = exports.SetFinanceBudgetDto = exports.SettleTaxPeriodDto = exports.CloseAccountableAdvanceDto = exports.SettleAccountableAdvanceDto = exports.CreateAccountableAdvanceDto = exports.AccountableAdvanceQueryDto = exports.ACCOUNTABLE_ADVANCE_EXPENSE_ACCOUNTS = exports.DepreciateFixedAssetDto = exports.CreateFixedAssetDto = exports.CreateOpeningBalanceDto = exports.CreateOpeningBalanceLineDto = exports.CloseAccountingPeriodDto = exports.CreateCashIncassationDto = exports.ReconcileBankStatementLineDto = exports.ImportBankStatementDto = exports.BankStatementLineDto = exports.ArAgingQueryDto = exports.SupplierAgingQueryDto = exports.FinancePeriodQueryDto = exports.CreateManualAdjustmentDto = exports.ManualAdjustmentLineDto = exports.ReverseAccountingEntryDto = exports.FinanceAccountingQueryDto = exports.PayExpenseDto = exports.RejectExpenseDto = exports.CreateCurrencyRateDto = exports.FxExposureQueryDto = exports.CurrencyRateQueryDto = exports.CreateExpenseDto = exports.EXPENSE_CATEGORIES = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
exports.EXPENSE_CATEGORIES = [
    'rent',
    'payroll',
    'logistics',
    'marketing',
    'utilities',
    'procurement',
    'other',
];
class CreateExpenseDto {
}
exports.CreateExpenseDto = CreateExpenseDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateExpenseDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsIn)(exports.EXPENSE_CATEGORIES),
    __metadata("design:type", Object)
], CreateExpenseDto.prototype, "category", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(500),
    (0, class_validator_1.Matches)(/\S/),
    __metadata("design:type", String)
], CreateExpenseDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(2147483647),
    __metadata("design:type", Number)
], CreateExpenseDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[A-Z]{3}$/),
    __metadata("design:type", String)
], CreateExpenseDto.prototype, "currency", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateExpenseDto.prototype, "exchangeRateId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['none', 'included', 'excluded']),
    __metadata("design:type", String)
], CreateExpenseDto.prototype, "taxMode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(10000),
    __metadata("design:type", Number)
], CreateExpenseDto.prototype, "taxRateBps", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], CreateExpenseDto.prototype, "point", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateExpenseDto.prototype, "supplierId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], CreateExpenseDto.prototype, "incurredAt", void 0);
class CurrencyRateQueryDto {
}
exports.CurrencyRateQueryDto = CurrencyRateQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[A-Z]{3}$/),
    __metadata("design:type", String)
], CurrencyRateQueryDto.prototype, "currency", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], CurrencyRateQueryDto.prototype, "asOf", void 0);
class FxExposureQueryDto {
}
exports.FxExposureQueryDto = FxExposureQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[A-Z]{3}$/),
    __metadata("design:type", String)
], FxExposureQueryDto.prototype, "currency", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], FxExposureQueryDto.prototype, "point", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], FxExposureQueryDto.prototype, "asOf", void 0);
class CreateCurrencyRateDto {
}
exports.CreateCurrencyRateDto = CreateCurrencyRateDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateCurrencyRateDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[A-Z]{3}$/),
    __metadata("design:type", String)
], CreateCurrencyRateDto.prototype, "currency", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(2147483647),
    __metadata("design:type", Number)
], CreateCurrencyRateDto.prototype, "rateMicros", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], CreateCurrencyRateDto.prototype, "effectiveAt", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(128),
    (0, class_validator_1.Matches)(/\S/),
    __metadata("design:type", String)
], CreateCurrencyRateDto.prototype, "source", void 0);
class RejectExpenseDto {
}
exports.RejectExpenseDto = RejectExpenseDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(500),
    (0, class_validator_1.Matches)(/\S/),
    __metadata("design:type", String)
], RejectExpenseDto.prototype, "note", void 0);
class PayExpenseDto {
}
exports.PayExpenseDto = PayExpenseDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], PayExpenseDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['1000', '1010', '1020']),
    __metadata("design:type", String)
], PayExpenseDto.prototype, "fundingAccountCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], PayExpenseDto.prototype, "paymentReference", void 0);
class FinanceAccountingQueryDto {
}
exports.FinanceAccountingQueryDto = FinanceAccountingQueryDto;
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], FinanceAccountingQueryDto.prototype, "from", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], FinanceAccountingQueryDto.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], FinanceAccountingQueryDto.prototype, "point", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(32),
    __metadata("design:type", String)
], FinanceAccountingQueryDto.prototype, "accountCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], FinanceAccountingQueryDto.prototype, "sourceType", void 0);
class ReverseAccountingEntryDto {
}
exports.ReverseAccountingEntryDto = ReverseAccountingEntryDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], ReverseAccountingEntryDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], ReverseAccountingEntryDto.prototype, "reason", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], ReverseAccountingEntryDto.prototype, "occurredAt", void 0);
class ManualAdjustmentLineDto {
}
exports.ManualAdjustmentLineDto = ManualAdjustmentLineDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d{4}$/),
    __metadata("design:type", String)
], ManualAdjustmentLineDto.prototype, "accountCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(2147483647),
    __metadata("design:type", Number)
], ManualAdjustmentLineDto.prototype, "debit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(2147483647),
    __metadata("design:type", Number)
], ManualAdjustmentLineDto.prototype, "credit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(240),
    __metadata("design:type", String)
], ManualAdjustmentLineDto.prototype, "memo", void 0);
class CreateManualAdjustmentDto {
}
exports.CreateManualAdjustmentDto = CreateManualAdjustmentDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateManualAdjustmentDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(128),
    (0, class_validator_1.Matches)(/\S/),
    __metadata("design:type", String)
], CreateManualAdjustmentDto.prototype, "documentNumber", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(500),
    (0, class_validator_1.Matches)(/\S/),
    __metadata("design:type", String)
], CreateManualAdjustmentDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateManualAdjustmentDto.prototype, "point", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], CreateManualAdjustmentDto.prototype, "occurredAt", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(2),
    (0, class_validator_1.ArrayMaxSize)(200),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ManualAdjustmentLineDto),
    __metadata("design:type", Array)
], CreateManualAdjustmentDto.prototype, "lines", void 0);
class FinancePeriodQueryDto {
}
exports.FinancePeriodQueryDto = FinancePeriodQueryDto;
__decorate([
    (0, class_validator_1.Matches)(/^\d{4}-(0[1-9]|1[0-2])$/),
    __metadata("design:type", String)
], FinancePeriodQueryDto.prototype, "period", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], FinancePeriodQueryDto.prototype, "point", void 0);
class SupplierAgingQueryDto {
}
exports.SupplierAgingQueryDto = SupplierAgingQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], SupplierAgingQueryDto.prototype, "asOf", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], SupplierAgingQueryDto.prototype, "supplierId", void 0);
class ArAgingQueryDto {
}
exports.ArAgingQueryDto = ArAgingQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], ArAgingQueryDto.prototype, "asOf", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], ArAgingQueryDto.prototype, "customerId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['open', 'settled']),
    __metadata("design:type", String)
], ArAgingQueryDto.prototype, "status", void 0);
class BankStatementLineDto {
}
exports.BankStatementLineDto = BankStatementLineDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], BankStatementLineDto.prototype, "externalId", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], BankStatementLineDto.prototype, "occurredAt", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], BankStatementLineDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], BankStatementLineDto.prototype, "reference", void 0);
class ImportBankStatementDto {
}
exports.ImportBankStatementDto = ImportBankStatementDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], ImportBankStatementDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], ImportBankStatementDto.prototype, "statementNumber", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(32),
    __metadata("design:type", String)
], ImportBankStatementDto.prototype, "accountCode", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], ImportBankStatementDto.prototype, "periodStart", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], ImportBankStatementDto.prototype, "periodEnd", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], ImportBankStatementDto.prototype, "openingBalance", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], ImportBankStatementDto.prototype, "closingBalance", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(10_000),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => BankStatementLineDto),
    __metadata("design:type", Array)
], ImportBankStatementDto.prototype, "lines", void 0);
class ReconcileBankStatementLineDto {
}
exports.ReconcileBankStatementLineDto = ReconcileBankStatementLineDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], ReconcileBankStatementLineDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], ReconcileBankStatementLineDto.prototype, "journalEntryId", void 0);
class CreateCashIncassationDto {
}
exports.CreateCashIncassationDto = CreateCashIncassationDto;
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateCashIncassationDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['1010', '3000']),
    __metadata("design:type", String)
], CreateCashIncassationDto.prototype, "destinationCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateCashIncassationDto.prototype, "reference", void 0);
class CloseAccountingPeriodDto {
}
exports.CloseAccountingPeriodDto = CloseAccountingPeriodDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CloseAccountingPeriodDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['soft_closed', 'hard_closed']),
    __metadata("design:type", String)
], CloseAccountingPeriodDto.prototype, "status", void 0);
class CreateOpeningBalanceLineDto {
}
exports.CreateOpeningBalanceLineDto = CreateOpeningBalanceLineDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^\d{4}$/),
    __metadata("design:type", String)
], CreateOpeningBalanceLineDto.prototype, "accountCode", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(2147483647),
    __metadata("design:type", Number)
], CreateOpeningBalanceLineDto.prototype, "debit", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(2147483647),
    __metadata("design:type", Number)
], CreateOpeningBalanceLineDto.prototype, "credit", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(240),
    __metadata("design:type", String)
], CreateOpeningBalanceLineDto.prototype, "memo", void 0);
class CreateOpeningBalanceDto {
}
exports.CreateOpeningBalanceDto = CreateOpeningBalanceDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateOpeningBalanceDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.Matches)(/^\d{4}-(0[1-9]|1[0-2])$/),
    __metadata("design:type", String)
], CreateOpeningBalanceDto.prototype, "period", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(128),
    (0, class_validator_1.Matches)(/\S/),
    __metadata("design:type", String)
], CreateOpeningBalanceDto.prototype, "documentNumber", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(500),
    (0, class_validator_1.Matches)(/\S/),
    __metadata("design:type", String)
], CreateOpeningBalanceDto.prototype, "description", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(2),
    (0, class_validator_1.ArrayMaxSize)(200),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => CreateOpeningBalanceLineDto),
    __metadata("design:type", Array)
], CreateOpeningBalanceDto.prototype, "lines", void 0);
class CreateFixedAssetDto {
}
exports.CreateFixedAssetDto = CreateFixedAssetDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateFixedAssetDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(64),
    (0, class_validator_1.Matches)(/\S/),
    __metadata("design:type", String)
], CreateFixedAssetDto.prototype, "assetNumber", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(200),
    (0, class_validator_1.Matches)(/\S/),
    __metadata("design:type", String)
], CreateFixedAssetDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(100),
    (0, class_validator_1.Matches)(/\S/),
    __metadata("design:type", String)
], CreateFixedAssetDto.prototype, "category", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateFixedAssetDto.prototype, "serialNumber", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(2147483647),
    __metadata("design:type", Number)
], CreateFixedAssetDto.prototype, "acquisitionCost", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(600),
    __metadata("design:type", Number)
], CreateFixedAssetDto.prototype, "usefulLifeMonths", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], CreateFixedAssetDto.prototype, "acquiredAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], CreateFixedAssetDto.prototype, "inServiceAt", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['1000', '1010', '1020']),
    __metadata("design:type", String)
], CreateFixedAssetDto.prototype, "fundingAccountCode", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(160),
    __metadata("design:type", String)
], CreateFixedAssetDto.prototype, "externalRef", void 0);
class DepreciateFixedAssetDto {
}
exports.DepreciateFixedAssetDto = DepreciateFixedAssetDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], DepreciateFixedAssetDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.Matches)(/^\d{4}-(0[1-9]|1[0-2])$/),
    __metadata("design:type", String)
], DepreciateFixedAssetDto.prototype, "period", void 0);
exports.ACCOUNTABLE_ADVANCE_EXPENSE_ACCOUNTS = ['6200', '6300', '6400', '6500', '6600', '6900'];
class AccountableAdvanceQueryDto {
}
exports.AccountableAdvanceQueryDto = AccountableAdvanceQueryDto;
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], AccountableAdvanceQueryDto.prototype, "staffId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['open', 'partially_settled', 'settled']),
    __metadata("design:type", String)
], AccountableAdvanceQueryDto.prototype, "status", void 0);
class CreateAccountableAdvanceDto {
}
exports.CreateAccountableAdvanceDto = CreateAccountableAdvanceDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateAccountableAdvanceDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateAccountableAdvanceDto.prototype, "staffId", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(2147483647),
    __metadata("design:type", Number)
], CreateAccountableAdvanceDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(500),
    (0, class_validator_1.Matches)(/\S/),
    __metadata("design:type", String)
], CreateAccountableAdvanceDto.prototype, "purpose", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreateAccountableAdvanceDto.prototype, "point", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], CreateAccountableAdvanceDto.prototype, "dueAt", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['1000', '1010', '1020']),
    __metadata("design:type", String)
], CreateAccountableAdvanceDto.prototype, "fundingAccountCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(160),
    (0, class_validator_1.Matches)(/\S/),
    __metadata("design:type", String)
], CreateAccountableAdvanceDto.prototype, "paymentReference", void 0);
class SettleAccountableAdvanceDto {
}
exports.SettleAccountableAdvanceDto = SettleAccountableAdvanceDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], SettleAccountableAdvanceDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(2147483647),
    __metadata("design:type", Number)
], SettleAccountableAdvanceDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsIn)(exports.ACCOUNTABLE_ADVANCE_EXPENSE_ACCOUNTS),
    __metadata("design:type", Object)
], SettleAccountableAdvanceDto.prototype, "expenseAccountCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(500),
    (0, class_validator_1.Matches)(/\S/),
    __metadata("design:type", String)
], SettleAccountableAdvanceDto.prototype, "description", void 0);
class CloseAccountableAdvanceDto {
}
exports.CloseAccountableAdvanceDto = CloseAccountableAdvanceDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CloseAccountableAdvanceDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(2147483647),
    __metadata("design:type", Number)
], CloseAccountableAdvanceDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['1000', '1010', '1020']),
    __metadata("design:type", String)
], CloseAccountableAdvanceDto.prototype, "fundingAccountCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(160),
    (0, class_validator_1.Matches)(/\S/),
    __metadata("design:type", String)
], CloseAccountableAdvanceDto.prototype, "paymentReference", void 0);
class SettleTaxPeriodDto {
}
exports.SettleTaxPeriodDto = SettleTaxPeriodDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], SettleTaxPeriodDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], SettleTaxPeriodDto.prototype, "point", void 0);
class SetFinanceBudgetDto extends FinancePeriodQueryDto {
}
exports.SetFinanceBudgetDto = SetFinanceBudgetDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], SetFinanceBudgetDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsIn)(exports.EXPENSE_CATEGORIES),
    __metadata("design:type", Object)
], SetFinanceBudgetDto.prototype, "category", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], SetFinanceBudgetDto.prototype, "amount", void 0);
exports.SETTLEMENT_SOURCE_TYPES = ['provider_payment', 'pos_shift', 'courier_cod', 'refund'];
class FinanceSettlementQueryDto {
}
exports.FinanceSettlementQueryDto = FinanceSettlementQueryDto;
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], FinanceSettlementQueryDto.prototype, "from", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], FinanceSettlementQueryDto.prototype, "to", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], FinanceSettlementQueryDto.prototype, "point", void 0);
class FinanceSettlementEntryDto {
}
exports.FinanceSettlementEntryDto = FinanceSettlementEntryDto;
__decorate([
    (0, class_validator_1.IsIn)(exports.SETTLEMENT_SOURCE_TYPES),
    __metadata("design:type", Object)
], FinanceSettlementEntryDto.prototype, "sourceType", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], FinanceSettlementEntryDto.prototype, "sourceRef", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], FinanceSettlementEntryDto.prototype, "actualAmount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(500),
    (0, class_validator_1.Matches)(/\S/),
    __metadata("design:type", String)
], FinanceSettlementEntryDto.prototype, "reason", void 0);
class CreateFinanceSettlementDto extends FinanceSettlementQueryDto {
}
exports.CreateFinanceSettlementDto = CreateFinanceSettlementDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateFinanceSettlementDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateFinanceSettlementDto.prototype, "note", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => FinanceSettlementEntryDto),
    __metadata("design:type", Array)
], CreateFinanceSettlementDto.prototype, "entries", void 0);
class ResolveFinanceSettlementDto {
}
exports.ResolveFinanceSettlementDto = ResolveFinanceSettlementDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], ResolveFinanceSettlementDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], ResolveFinanceSettlementDto.prototype, "lineId", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], ResolveFinanceSettlementDto.prototype, "adjustmentAmount", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(2),
    (0, class_validator_1.MaxLength)(500),
    (0, class_validator_1.Matches)(/\S/),
    __metadata("design:type", String)
], ResolveFinanceSettlementDto.prototype, "reason", void 0);
class CloseFinanceSettlementDto {
}
exports.CloseFinanceSettlementDto = CloseFinanceSettlementDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CloseFinanceSettlementDto.prototype, "idempotencyKey", void 0);
//# sourceMappingURL=finance.dto.js.map