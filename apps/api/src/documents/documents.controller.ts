import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /** Trade-in (скупка Б/У) contract PDF for a TradeInDevice (base64). */
  @Get('tradein/:id/contract')
  tradeInContract(@Param('id') id: string) {
    return this.documents.tradeInContract(id);
  }
}
