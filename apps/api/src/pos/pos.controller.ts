import { Body, Controller, Post } from '@nestjs/common';
import {
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
  @ApiConflictResponse({ description: 'Insufficient stock for a line.' })
  @ApiUnprocessableEntityResponse({ description: 'Invalid sale payload.' })
  @Post('sale')
  sale(@Body() dto: PosSaleDto) {
    return this.pos.sale(dto);
  }
}
