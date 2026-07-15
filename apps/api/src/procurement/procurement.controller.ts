import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthPrincipal } from '../auth/jwt.strategy';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';
import { CreatePurchaseOrderDto, CreateSupplierCreditNoteDto, CreateSupplierInvoiceDto, PaySupplierInvoiceDto, ReceivePurchaseOrderDto } from './procurement.dto';
import { ProcurementService } from './procurement.service';

@ApiTags('procurement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller('procurement/purchase-orders')
export class ProcurementController {
  constructor(private readonly procurement: ProcurementService) {}

  @Get()
  @RequirePermission('procurement', 'read')
  list(@Query('status') status?: string) {
    return this.procurement.list(status);
  }

  @Get(':id')
  @RequirePermission('procurement', 'read')
  get(@Param('id') id: string) {
    return this.procurement.get(id);
  }

  @Post()
  @RequirePermission('procurement', 'create')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreatePurchaseOrderDto) {
    return this.procurement.create(dto, user.customerId);
  }

  @Post(':id/send')
  @RequirePermission('procurement', 'send')
  send(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.procurement.send(id, user.customerId);
  }

  @Post(':id/cancel')
  @RequirePermission('procurement', 'cancel')
  cancel(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.procurement.cancel(id, user.customerId);
  }

  @Post(':id/receive')
  @RequirePermission('procurement', 'receive')
  receive(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: ReceivePurchaseOrderDto) {
    return this.procurement.receive(id, dto, user.customerId);
  }
}

@ApiTags('procurement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller('procurement/supplier-invoices')
export class SupplierInvoiceController {
  constructor(private readonly procurement: ProcurementService) {}

  @Get()
  @RequirePermission('procurement', 'read')
  list(@Query('status') status?: string) {
    return this.procurement.listInvoices(status);
  }

  @Post()
  @RequirePermission('procurement', 'create')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateSupplierInvoiceDto) {
    return this.procurement.createSupplierInvoice(dto, user.customerId);
  }

  @Post(':id/approve')
  @RequirePermission('procurement', 'send')
  approve(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.procurement.approveSupplierInvoice(id, user.customerId);
  }

  @Post(':id/pay')
  @RequirePermission('procurement', 'receive')
  pay(@CurrentUser() user: AuthPrincipal, @Param('id') id: string, @Body() dto: PaySupplierInvoiceDto) {
    return this.procurement.paySupplierInvoice(id, dto, user.customerId);
  }
}

@ApiTags('procurement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@Controller('procurement/supplier-credit-notes')
export class SupplierCreditNoteController {
  constructor(private readonly procurement: ProcurementService) {}

  @Get()
  @RequirePermission('procurement', 'read')
  list(@Query('supplierId') supplierId?: string) {
    return this.procurement.listCreditNotes(supplierId);
  }

  @Post()
  @RequirePermission('procurement', 'create')
  create(@CurrentUser() user: AuthPrincipal, @Body() dto: CreateSupplierCreditNoteDto) {
    return this.procurement.createCreditNote(dto, user.customerId);
  }

  @Post(':id/approve')
  @RequirePermission('procurement', 'send')
  approve(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.procurement.approveCreditNote(id, user.customerId);
  }

  @Post(':id/apply')
  @RequirePermission('procurement', 'receive')
  apply(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.procurement.applyCreditNote(id, user.customerId);
  }
}
