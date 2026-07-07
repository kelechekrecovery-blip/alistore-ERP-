import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { transform } from 'receiptline';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptData } from './receipts.dto';
import { ValidationError } from '../common/errors';

export interface RenderedReceipt {
  /** receiptline markup — the human-readable source of the receipt. */
  markup: string;
  /** SVG preview (text is rendered as paths). */
  svg: string;
  /** ESC/POS command bytes for a thermal printer, base64-encoded. */
  escposBase64: string;
}

const CPL = 42; // characters per line (58mm roll)
const ENCODING = 'cp866'; // Cyrillic — RU/KG receipts

/**
 * Renders POS receipts (чек) with receiptline: structured data → markup → SVG
 * preview + ESC/POS commands for a thermal printer. Self-contained — callers pass
 * a ReceiptData built from an order/sale, so this never couples to the evolving
 * order/POS models.
 */
@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Render the receipt for an existing order. Reads the order, its items and
   * payment straight from the DB — no coupling to POS/orders service code — maps
   * to ReceiptData, and renders. Product names are resolved by SKU.
   */
  async renderOrder(orderId: string): Promise<RenderedReceipt> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payments: true },
    });
    if (!order) {
      throw new ValidationError('order_not_found', `Заказ ${orderId} не найден`);
    }

    const skus = order.items.map((item) => item.sku);
    const products = await this.prisma.product.findMany({
      where: { sku: { in: skus } },
    });
    const nameBySku = new Map(products.map((p) => [p.sku, p.name]));

    return this.render({
      store: {
        name: this.config.get<string>('STORE_NAME') ?? 'AliStore',
        address: this.config.get<string>('STORE_ADDRESS') ?? 'Бишкек',
        phone: this.config.get<string>('STORE_PHONE'),
      },
      orderId: order.id,
      issuedAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        name: nameBySku.get(item.sku) ?? item.sku,
        qty: item.qty,
        price: item.price,
      })),
      total: order.total,
      payment: order.payments[0]?.method ?? 'cash',
      payments: order.payments
        .filter((payment) =>
          payment.amount > 0 && ['received', 'reconciled'].includes(payment.status),
        )
        .map((payment) => ({
          method: payment.method,
          amount: payment.amount,
        })),
    });
  }

  /** Build receiptline markup from structured receipt data (pure, testable). */
  buildMarkup(data: ReceiptData): string {
    const lines: string[] = [`^^^${data.store.name}`];
    if (data.store.address) lines.push(data.store.address);
    if (data.store.phone) lines.push(data.store.phone);
    lines.push(`Чек ${data.orderId}`, this.formatDate(data.issuedAt));
    if (data.cashier) lines.push(`Кассир: ${data.cashier}`);
    lines.push('---');
    for (const item of data.items) {
      const lineTotal = item.qty * item.price;
      lines.push(item.name);
      lines.push(` ${item.qty} x ${this.money(item.price)} | ${this.money(lineTotal)}`);
    }
    lines.push('---', `^ИТОГО | ${this.money(data.total)}`);
    if (data.payments?.length) {
      lines.push('Оплата:');
      for (const payment of data.payments) {
        lines.push(` ${payment.method} | ${this.money(payment.amount)}`);
      }
    } else {
      lines.push(`Оплата: ${data.payment}`);
    }
    lines.push('', 'Спасибо за покупку!');
    return lines.join('\n');
  }

  /** Render to an SVG preview and ESC/POS commands (base64). */
  render(data: ReceiptData): RenderedReceipt {
    const markup = this.buildMarkup(data);
    const printer = { cpl: CPL, encoding: ENCODING } as const;
    const svg = transform(markup, { ...printer, command: 'svg' });
    const escpos = transform(markup, { ...printer, command: 'escpos' });
    return {
      markup,
      svg,
      escposBase64: Buffer.from(escpos, 'binary').toString('base64'),
    };
  }

  private money(value: number): string {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  private formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
}
