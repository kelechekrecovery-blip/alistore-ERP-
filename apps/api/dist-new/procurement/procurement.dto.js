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
exports.CreateSupplierCreditNoteDto = exports.CreateLandedCostDto = exports.ReconcileSupplierStatementLineDto = exports.ImportSupplierStatementDto = exports.SupplierStatementLineDto = exports.ApplySupplierAdvanceDto = exports.CreateSupplierAdvanceDto = exports.CreateSupplierInvoicePaymentDto = exports.PaySupplierInvoiceDto = exports.CreateSupplierInvoiceDto = exports.ReceivePurchaseOrderDto = exports.ReceivePurchaseOrderLineDto = exports.CreatePurchaseOrderDto = exports.PurchaseOrderLineDto = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class PurchaseOrderLineDto {
}
exports.PurchaseOrderLineDto = PurchaseOrderLineDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], PurchaseOrderLineDto.prototype, "productId", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], PurchaseOrderLineDto.prototype, "qty", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], PurchaseOrderLineDto.prototype, "unitCost", void 0);
class CreatePurchaseOrderDto {
}
exports.CreatePurchaseOrderDto = CreatePurchaseOrderDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreatePurchaseOrderDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreatePurchaseOrderDto.prototype, "supplierId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    (0, class_validator_1.Matches)(/\S/, { message: 'location must contain a non-whitespace character' }),
    __metadata("design:type", String)
], CreatePurchaseOrderDto.prototype, "location", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], CreatePurchaseOrderDto.prototype, "note", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(100),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => PurchaseOrderLineDto),
    __metadata("design:type", Array)
], CreatePurchaseOrderDto.prototype, "items", void 0);
class ReceivePurchaseOrderLineDto {
}
exports.ReceivePurchaseOrderLineDto = ReceivePurchaseOrderLineDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], ReceivePurchaseOrderLineDto.prototype, "itemId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(200),
    (0, class_validator_1.ArrayUnique)(),
    (0, class_validator_1.IsString)({ each: true }),
    (0, class_validator_1.MaxLength)(64, { each: true }),
    __metadata("design:type", Array)
], ReceivePurchaseOrderLineDto.prototype, "imeis", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ReceivePurchaseOrderLineDto.prototype, "qty", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['A', 'B', 'C']),
    __metadata("design:type", String)
], ReceivePurchaseOrderLineDto.prototype, "grade", void 0);
class ReceivePurchaseOrderDto {
}
exports.ReceivePurchaseOrderDto = ReceivePurchaseOrderDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], ReceivePurchaseOrderDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(100),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => ReceivePurchaseOrderLineDto),
    __metadata("design:type", Array)
], ReceivePurchaseOrderDto.prototype, "lines", void 0);
class CreateSupplierInvoiceDto {
}
exports.CreateSupplierInvoiceDto = CreateSupplierInvoiceDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateSupplierInvoiceDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateSupplierInvoiceDto.prototype, "invoiceNumber", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateSupplierInvoiceDto.prototype, "supplierId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateSupplierInvoiceDto.prototype, "purchaseOrderId", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateSupplierInvoiceDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateSupplierInvoiceDto.prototype, "dueDate", void 0);
class PaySupplierInvoiceDto {
}
exports.PaySupplierInvoiceDto = PaySupplierInvoiceDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], PaySupplierInvoiceDto.prototype, "paymentKey", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['1000', '1010', '1020']),
    __metadata("design:type", String)
], PaySupplierInvoiceDto.prototype, "paymentAccountCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], PaySupplierInvoiceDto.prototype, "paymentReference", void 0);
class CreateSupplierInvoicePaymentDto {
}
exports.CreateSupplierInvoicePaymentDto = CreateSupplierInvoicePaymentDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateSupplierInvoicePaymentDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateSupplierInvoicePaymentDto.prototype, "paymentKey", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateSupplierInvoicePaymentDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['1000', '1010', '1020']),
    __metadata("design:type", String)
], CreateSupplierInvoicePaymentDto.prototype, "paymentAccountCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateSupplierInvoicePaymentDto.prototype, "paymentReference", void 0);
class CreateSupplierAdvanceDto {
}
exports.CreateSupplierAdvanceDto = CreateSupplierAdvanceDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateSupplierAdvanceDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateSupplierAdvanceDto.prototype, "paymentKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateSupplierAdvanceDto.prototype, "supplierId", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateSupplierAdvanceDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['1000', '1010', '1020']),
    __metadata("design:type", String)
], CreateSupplierAdvanceDto.prototype, "paymentAccountCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateSupplierAdvanceDto.prototype, "paymentReference", void 0);
class ApplySupplierAdvanceDto {
}
exports.ApplySupplierAdvanceDto = ApplySupplierAdvanceDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], ApplySupplierAdvanceDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], ApplySupplierAdvanceDto.prototype, "invoiceId", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], ApplySupplierAdvanceDto.prototype, "amount", void 0);
class SupplierStatementLineDto {
}
exports.SupplierStatementLineDto = SupplierStatementLineDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], SupplierStatementLineDto.prototype, "externalId", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], SupplierStatementLineDto.prototype, "occurredAt", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], SupplierStatementLineDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], SupplierStatementLineDto.prototype, "reference", void 0);
class ImportSupplierStatementDto {
}
exports.ImportSupplierStatementDto = ImportSupplierStatementDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], ImportSupplierStatementDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], ImportSupplierStatementDto.prototype, "statementNumber", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], ImportSupplierStatementDto.prototype, "supplierId", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], ImportSupplierStatementDto.prototype, "periodStart", void 0);
__decorate([
    (0, class_validator_1.IsISO8601)({ strict: true }),
    __metadata("design:type", String)
], ImportSupplierStatementDto.prototype, "periodEnd", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], ImportSupplierStatementDto.prototype, "openingBalance", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], ImportSupplierStatementDto.prototype, "closingBalance", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(10_000),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => SupplierStatementLineDto),
    __metadata("design:type", Array)
], ImportSupplierStatementDto.prototype, "lines", void 0);
class ReconcileSupplierStatementLineDto {
}
exports.ReconcileSupplierStatementLineDto = ReconcileSupplierStatementLineDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], ReconcileSupplierStatementLineDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], ReconcileSupplierStatementLineDto.prototype, "journalEntryId", void 0);
class CreateLandedCostDto {
}
exports.CreateLandedCostDto = CreateLandedCostDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateLandedCostDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateLandedCostDto.prototype, "documentNumber", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateLandedCostDto.prototype, "purchaseOrderId", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateLandedCostDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['2000', '1010', '1020', '6600']),
    __metadata("design:type", String)
], CreateLandedCostDto.prototype, "creditAccountCode", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateLandedCostDto.prototype, "description", void 0);
class CreateSupplierCreditNoteDto {
}
exports.CreateSupplierCreditNoteDto = CreateSupplierCreditNoteDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateSupplierCreditNoteDto.prototype, "idempotencyKey", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(128),
    __metadata("design:type", String)
], CreateSupplierCreditNoteDto.prototype, "noteNumber", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateSupplierCreditNoteDto.prototype, "supplierId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(64),
    __metadata("design:type", String)
], CreateSupplierCreditNoteDto.prototype, "invoiceId", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateSupplierCreditNoteDto.prototype, "amount", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateSupplierCreditNoteDto.prototype, "reason", void 0);
//# sourceMappingURL=procurement.dto.js.map