import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { LabelsService } from './labels.service';
import { ImeiLabelDto, QrLabelDto } from './labels.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActiveStaffGuard } from '../auth/active-staff.guard';
import { PermissionGuard } from '../authz/permission.guard';
import { RequirePermission } from '../authz/require-permission.decorator';

@Controller('labels')
@UseGuards(JwtAuthGuard, ActiveStaffGuard, PermissionGuard)
@RequirePermission('labels', 'print')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  /** IMEI sticker for a stored unit (looked up by IMEI). */
  @Get('unit/:imei')
  unit(@Param('imei') imei: string) {
    return this.labels.unitLabel(imei);
  }

  /** Code128 IMEI sticker (SVG) from a raw IMEI. */
  @Post('imei')
  imei(@Body() dto: ImeiLabelDto) {
    return { svg: this.labels.imeiBarcode(dto.imei) };
  }

  /** QR label (SVG) — e.g. a product page URL for a price tag. */
  @Post('qr')
  qr(@Body() dto: QrLabelDto) {
    return { svg: this.labels.qrLabel(dto.text) };
  }
}
