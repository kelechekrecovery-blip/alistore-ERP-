import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { ReceiptData } from './receipts.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  /** Render a receipt → SVG preview + ESC/POS (base64) for a thermal printer. */
  @Post('render')
  @UseGuards(JwtAuthGuard)
  render(@Body() data: ReceiptData) {
    return this.receipts.render(data);
  }
}
