import { Body, Controller, Get, Param, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupplierPriceImportService } from './supplier-price-import.service';
import { CreateSupplierPriceImportDto } from './supplier-price-import.dto';
import { SupplierPriceImportMapping } from './supplier-price-import.types';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../../auth/active-staff.guard';
import { PermissionGuard } from '../../authz/permission.guard';
import { RequirePermission } from '../../authz/require-permission.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AuthPrincipal } from '../../auth/jwt.strategy';
import { ValidationError } from '../../common/errors';

/**
 * Staff-only. Gated on `products:update` (admin/owner), not `procurement:*`:
 * apply() writes directly to Product.cost/supplyLeadDays/supplierId — the
 * same admin-only surface task 1.3 of the plan already gates that way for
 * supplyMode/supplierId edits. `procurement` roles include `warehouse`, which
 * has no write access to Product fields anywhere else in this codebase.
 */
@ApiTags('procurement')
@ApiBearerAuth()
@Controller('procurement/price-imports')
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
export class SupplierPriceImportController {
  constructor(private readonly imports: SupplierPriceImportService) {}

  @Post()
  @RequirePermission('products', 'update')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Stage a supplier price list: parse + classify, no writes to Product yet' })
  async stage(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: CreateSupplierPriceImportDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new ValidationError('no_file', 'Файл не приложен (поле "file")');
    const mapping = this.parseMapping(dto.mapping);
    return this.imports.stage(file.buffer, dto.supplierId, mapping, user.customerId);
  }

  @Get(':id')
  @RequirePermission('products', 'update')
  async get(@Param('id') id: string) {
    return this.imports.get(id);
  }

  @Post(':id/apply')
  @RequirePermission('products', 'update')
  @ApiOperation({ summary: 'Apply a staged batch — idempotent, writes cost/supplyLeadDays/supplierId + ledger events' })
  async apply(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.imports.apply(id, user.customerId);
  }

  private parseMapping(raw: string | undefined): SupplierPriceImportMapping | undefined {
    if (raw === undefined) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ValidationError('mapping_invalid_json', 'mapping должен быть валидным JSON');
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).sku !== 'string' ||
      typeof (parsed as Record<string, unknown>).price !== 'string'
    ) {
      throw new ValidationError('mapping_invalid_shape', 'mapping обязан задавать строковые sku и price');
    }
    return parsed as SupplierPriceImportMapping;
  }
}
