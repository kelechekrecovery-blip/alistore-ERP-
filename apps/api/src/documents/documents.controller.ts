import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';

@Controller('documents')
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@RequirePermission('documents', 'read')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /** Order invoice / waybill (накладная) PDF for a sold or fulfilled order. */
  @Get('order/:id/invoice')
  orderInvoice(@Param('id') id: string) {
    return this.documents.orderInvoice(id);
  }

  /** Trade-in (скупка Б/У) contract PDF for a TradeInDevice (base64). */
  @Get('tradein/:id/contract')
  // Contract carries the seller's raw national id — restrict to PII-cleared roles
  // (admin/owner via pii:approve), overriding the class-level documents:read.
  @RequirePermission('pii', 'approve')
  tradeInContract(@Param('id') id: string) {
    return this.documents.tradeInContract(id);
  }

  /** Warranty certificate (гарантийный талон) PDF for a device by IMEI (base64). */
  @Get('warranty/:imei/talon')
  warrantyTalon(@Param('imei') imei: string) {
    return this.documents.warrantyTalon(imei);
  }

  /** Write-off act (акт списания) PDF for an InventoryMovement (base64). */
  @Get('writeoff/:movementId/act')
  writeOffAct(@Param('movementId') movementId: string) {
    return this.documents.writeOffAct(movementId);
  }

  /** Return act (акт возврата) PDF for a Return (base64). */
  @Get('return/:id/act')
  returnAct(@Param('id') id: string) {
    return this.documents.returnAct(id);
  }
}
