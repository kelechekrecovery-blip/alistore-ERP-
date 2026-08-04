import { Injectable } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from '../common/errors';
import { EventType } from '../audit/event-types';
import { ROBOTO_REGULAR_BASE64 } from './roboto-font';
import { buildOrderInvoiceLines } from './order-invoice';
import { buildTradeInContractLines } from './trade-in-contract';

/**
 * A4 documents with Cyrillic text (pdf-lib + a bundled Roboto TTF — the standard
 * PDF fonts don't cover Cyrillic). Currently the trade-in (скупка Б/У) contract —
 * the owner's key differentiator and an MVP «Скупка Б/У + договор (печать)» item.
 */
@Injectable()
export class DocumentsService {
  private readonly fontBytes = Buffer.from(ROBOTO_REGULAR_BASE64, 'base64');

  constructor(private readonly prisma: PrismaService) {}

  /** Render an order invoice / waybill (накладная) with customer, items, IMEI and payments. */
  async orderInvoice(orderId: string): Promise<{ pdfBase64: string; bytes: number }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, items: true, payments: true },
    });
    if (!order) {
      throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
    }

    const skus = order.items.map((item) => item.sku);
    const products = await this.prisma.product.findMany({
      where: { sku: { in: skus } },
      select: { sku: true, name: true },
    });
    const nameBySku = new Map(products.map((product) => [product.sku, product.name]));

    const lines = buildOrderInvoiceLines({
      id: order.id,
      status: order.status,
      channel: order.channel,
      total: order.total,
      createdAt: order.createdAt,
      customer: { name: order.customer.name, phone: order.customer.phone },
      items: order.items.map((item) => ({
        sku: item.sku,
        name: nameBySku.get(item.sku) ?? item.sku,
        qty: item.qty,
        price: item.price,
        imei: item.imei,
      })),
      payments: order.payments.map((payment) => ({
        method: payment.method,
        amount: payment.amount,
        status: payment.status,
      })),
    });

    return this.renderLines(lines);
  }

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

    return this.renderLines(
      buildTradeInContractLines({
        id: trade.id,
        contractId: trade.contractId,
        issuedAt: new Date(),
        customer: { name: trade.customer.name, phone: trade.customer.phone },
        sellerPassport: trade.sellerPassport,
        model: trade.model,
        imei: trade.imei,
        grade: trade.grade,
        price: trade.price,
      }),
    );
  }

  /** Render a warranty certificate (гарантийный талон) for a sold device by IMEI. */
  async warrantyTalon(
    imei: string,
  ): Promise<{ pdfBase64: string; bytes: number }> {
    const unit = await this.prisma.deviceUnit.findUnique({
      where: { imei },
      include: { product: true },
    });
    if (!unit) {
      throw new ValidationError('unit_not_found', `IMEI ${imei} не найден`);
    }
    const order = unit.orderId
      ? await this.prisma.order.findUnique({
          where: { id: unit.orderId },
          include: { customer: true },
        })
      : null;

    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(this.fontBytes);
    const page = doc.addPage([595.28, 841.89]); // A4

    const writer = this.lineWriter(page, font);
    writer('ГАРАНТИЙНЫЙ ТАЛОН', 16, 28);
    writer('AliStore · г. Бишкек, Кыргызстан', 11, 26);

    writer('Устройство:', 12, 18);
    writer(`  ${unit.product.name}`, 11, 16);
    writer(`  IMEI / SN: ${unit.imei}`, 11, 16);
    if (unit.grade) {
      writer(`  Состояние (грейд): ${unit.grade}`, 11, 16);
    }

    if (order?.customer) {
      writer('Покупатель:', 12, 18);
      writer(`  ${order.customer.name} · тел. ${order.customer.phone}`, 11, 16);
      writer(
        `  Дата продажи: ${order.createdAt.toISOString().slice(0, 10)}`,
        11,
        20,
      );
    }

    writer(`Дата выдачи: ${new Date().toISOString().slice(0, 10)}`, 11, 18);
    writer('Гарантийный срок: 12 месяцев с даты продажи.', 11, 24);

    writer('Условия:', 12, 16);
    writer('— гарантия не покрывает механические повреждения, попадание', 10, 14);
    writer('  влаги и следы вскрытия неавторизованным сервисом;', 10, 14);
    writer('— при обращении предъявите талон и устройство.', 10, 28);
    writer('Подпись продавца: __________________     Печать: ______', 10, 16);

    const bytes = await doc.save();
    return {
      pdfBase64: Buffer.from(bytes).toString('base64'),
      bytes: bytes.length,
    };
  }

  /** Render a write-off act (акт списания) for an InventoryMovement. */
  async writeOffAct(
    movementId: string,
  ): Promise<{ pdfBase64: string; bytes: number }> {
    const movement = await this.prisma.inventoryMovement.findUnique({
      where: { id: movementId },
      include: { product: true },
    });
    if (!movement) {
      throw new ValidationError(
        'movement_not_found',
        `Движение ${movementId} не найдено`,
      );
    }
    if (movement.type !== 'write_off') {
      throw new ValidationError(
        'not_a_writeoff',
        `Движение ${movementId} — не списание`,
      );
    }

    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(this.fontBytes);
    const page = doc.addPage([595.28, 841.89]); // A4

    const writer = this.lineWriter(page, font);
    writer('АКТ СПИСАНИЯ товара', 16, 28);
    writer('AliStore · г. Бишкек, Кыргызстан', 11, 26);
    writer(`№ ${movement.id}`, 10, 16);
    writer(`Дата: ${movement.createdAt.toISOString().slice(0, 10)}`, 10, 24);

    writer('Товар:', 12, 18);
    writer(`  ${movement.product.name} (SKU ${movement.product.sku})`, 11, 16);
    writer(`  Количество: ${Math.abs(movement.qty)} шт.`, 11, 16);
    writer(`  Причина: ${movement.reason ?? '—'}`, 11, 24);

    writer('Списание согласовано (approval) и зафиксировано в Event Ledger.', 10, 24);
    writer(
      'Ответственный: __________________     Владелец: __________________',
      10,
      16,
    );

    const bytes = await doc.save();
    return {
      pdfBase64: Buffer.from(bytes).toString('base64'),
      bytes: bytes.length,
    };
  }

  /**
   * Render the write-off act authorized by an approval. The approval executor
   * records the created movement only in the `stock.written_off` Ledger event
   * payload, so the movement id is resolved from there — read-only, the Ledger
   * stays the source of truth.
   */
  async writeOffActByApproval(
    approvalId: string,
  ): Promise<{ pdfBase64: string; bytes: number }> {
    const event = await this.prisma.auditEvent.findFirst({
      where: {
        type: EventType.StockWrittenOff,
        payload: { path: ['approvalId'], equals: approvalId },
      },
      orderBy: { ts: 'desc' },
    });
    const movementId = (event?.payload as { movementId?: unknown } | null)?.movementId;
    if (!event || typeof movementId !== 'string') {
      throw new ValidationError(
        'writeoff_not_found',
        `Списание по approval ${approvalId} не найдено`,
      );
    }
    return this.writeOffAct(movementId);
  }

  /** Render a return act (акт возврата) for a Return record. */
  async returnAct(
    returnId: string,
  ): Promise<{ pdfBase64: string; bytes: number }> {
    const ret = await this.prisma.return.findUnique({ where: { id: returnId } });
    if (!ret) {
      throw new ValidationError('return_not_found', `Возврат ${returnId} не найден`);
    }
    const order = await this.prisma.order.findUnique({
      where: { id: ret.orderId },
      include: { customer: true },
    });

    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(this.fontBytes);
    const page = doc.addPage([595.28, 841.89]); // A4

    const writer = this.lineWriter(page, font);
    writer('АКТ ВОЗВРАТА товара', 16, 28);
    writer('AliStore · г. Бишкек, Кыргызстан', 11, 26);
    writer(`№ ${ret.id}`, 10, 16);
    writer(`Дата: ${ret.createdAt.toISOString().slice(0, 10)}`, 10, 24);

    writer(`Заказ: ${ret.orderId}`, 11, 16);
    if (order?.customer) {
      writer(
        `Клиент: ${order.customer.name} · тел. ${order.customer.phone}`,
        11,
        16,
      );
    }
    writer(`Причина возврата: ${ret.reason}`, 11, 16);
    writer(`Статус: ${ret.status}`, 11, 24);

    writer('Возврат денег — по approval, тем же способом оплаты.', 10, 24);
    writer('Принял: __________________     Клиент: __________________', 10, 16);

    const bytes = await doc.save();
    return {
      pdfBase64: Buffer.from(bytes).toString('base64'),
      bytes: bytes.length,
    };
  }

  private async renderLines(lines: string[]): Promise<{ pdfBase64: string; bytes: number }> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(this.fontBytes);
    const page = doc.addPage([595.28, 841.89]); // A4
    const writer = this.lineWriter(page, font);
    for (const line of lines) {
      writer(line || ' ', line ? 10.5 : 8, line ? 15 : 8);
    }
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
