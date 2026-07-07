import { Injectable } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from '../common/errors';
import { ROBOTO_REGULAR_BASE64 } from './roboto-font';

/**
 * A4 documents with Cyrillic text (pdf-lib + a bundled Roboto TTF — the standard
 * PDF fonts don't cover Cyrillic). Currently the trade-in (скупка Б/У) contract —
 * the owner's key differentiator and an MVP «Скупка Б/У + договор (печать)» item.
 */
@Injectable()
export class DocumentsService {
  private readonly fontBytes = Buffer.from(ROBOTO_REGULAR_BASE64, 'base64');

  constructor(private readonly prisma: PrismaService) {}

  /** Render the trade-in contract PDF for a TradeInDevice; base64 for printing. */
  async tradeInContract(
    tradeInId: string,
  ): Promise<{ pdfBase64: string; bytes: number }> {
    const trade = await this.prisma.tradeInDevice.findUnique({
      where: { id: tradeInId },
      include: { customer: true },
    });
    if (!trade) {
      throw new ValidationError('tradein_not_found', `Скупка ${tradeInId} не найдена`);
    }

    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(this.fontBytes);
    const page = doc.addPage([595.28, 841.89]); // A4

    const writer = this.lineWriter(page, font);
    writer('ДОГОВОР скупки бывшего в употреблении устройства', 15, 30);
    writer(`№ ${trade.contractId ?? trade.id}`, 10, 16);
    writer(`Дата: ${new Date().toISOString().slice(0, 10)}`, 10, 26);

    writer('Продавец (физическое лицо):', 12, 18);
    writer(`  ${trade.customer.name} · тел. ${trade.customer.phone}`, 11, 16);
    writer(`  Паспорт: ${trade.sellerPassport}`, 11, 26);

    writer('Покупатель: AliStore (ИП), г. Бишкек, Кыргызстан', 12, 26);

    writer('Устройство:', 12, 18);
    writer(`  Модель: ${trade.model}`, 11, 16);
    writer(`  Состояние (грейд): ${trade.grade}`, 11, 16);
    writer(`  Оценочная стоимость: ${trade.price} сом`, 11, 28);

    writer(
      'Продавец подтверждает, что устройство принадлежит ему, не находится',
      10,
      14,
    );
    writer(
      'в розыске и не заблокировано (iCloud / учётная запись производителя).',
      10,
      34,
    );
    writer('Подпись продавца: __________________', 10, 22);
    writer('Подпись покупателя: __________________', 10, 16);

    const bytes = await doc.save();
    return {
      pdfBase64: Buffer.from(bytes).toString('base64'),
      bytes: bytes.length,
    };
  }

  /** A top-down line writer bound to a page + font. */
  private lineWriter(page: PDFPage, font: PDFFont) {
    let y = page.getSize().height - 60;
    return (text: string, size = 11, gap = 18) => {
      page.drawText(text, {
        x: 50,
        y,
        size,
        font,
        color: rgb(0.08, 0.09, 0.11),
      });
      y -= gap;
    };
  }
}
