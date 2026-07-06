import { Injectable } from '@nestjs/common';
import { transform } from 'receiptline';
import { ReceiptData } from './receipts.dto';

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
    lines.push('---', `^ИТОГО | ${this.money(data.total)}`, `Оплата: ${data.payment}`);
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
