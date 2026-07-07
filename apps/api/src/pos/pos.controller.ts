import { Body, Controller, HttpStatus, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import {
  ApiAcceptedResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { PosService } from './pos.service';
import { PosSaleDto } from './pos.dto';

@ApiTags('pos')
@Controller('pos')
export class PosController {
  constructor(private readonly pos: PosService) {}

  @ApiOperation({
    summary: 'Complete a counter sale: customer→shift→assign IMEIs→order→reserve→pay',
  })
  @ApiCreatedResponse({ description: 'Sale completed; order paid, units sold, ledger written.' })
  @ApiAcceptedResponse({ description: 'Discount over the limit — parked for approval (202 { approvalId }).' })
  @ApiConflictResponse({ description: 'Insufficient stock for a line.' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid sale payload.' })
  @Post('sale')
  async sale(@Body() dto: PosSaleDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.pos.sale(dto);
    if (result.pendingApproval) res.status(HttpStatus.ACCEPTED);
    return result;
  }
}
