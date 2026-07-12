import type { CatalogProduct } from './api/catalog';
import type { PosSaleResult } from './api/pos';
import type { PosReceiptSnapshot } from './pos-offline';
import { som } from './format';

export type ScannerMatch =
  | { ok: true; product: CatalogProduct; code: string }
  | { ok: false; code: string; reason: string };

export function normalizeScannerCode(code: string): string {
  return code.trim().replace(/\s+/g, '').toUpperCase();
}

export function findProductByScan(products: CatalogProduct[], raw: string): ScannerMatch {
  const code = normalizeScannerCode(raw);
  if (!code) return { ok: false, code, reason: 'Пустой код' };

  const product = products.find((p) => {
    const sku = normalizeScannerCode(p.sku);
    if (sku === code) return true;
    const attrs = p.attrs && typeof p.attrs === 'object' ? Object.values(p.attrs) : [];
    return attrs.some((value) => typeof value === 'string' && normalizeScannerCode(value) === code);
  });

  return product ? { ok: true, product, code } : { ok: false, code, reason: `SKU/штрихкод ${code} не найден` };
}

export function createScannerKeyHandler(onScan: (code: string) => void) {
  let buffer = '';
  let lastKeyAt = 0;
  let timer: number | undefined;

  return (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

    const now = Date.now();
    if (now - lastKeyAt > 80) buffer = '';
    lastKeyAt = now;

    if (event.key === 'Enter') {
      if (buffer.length >= 3) onScan(buffer);
      buffer = '';
      return;
    }
    if (event.key.length !== 1) return;

    buffer += event.key;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      buffer = '';
    }, 140);
  };
}

export async function checkPaymentTerminal(method: string, online: boolean): Promise<{ ok: boolean; message: string }> {
  if (method === 'cash') return { ok: true, message: 'Касса готова' };
  if (!online) return { ok: false, message: 'Терминал offline: продажа уйдёт в очередь' };
  await new Promise((resolve) => window.setTimeout(resolve, 160));
  return { ok: true, message: `${methodName(method)} готов к оплате` };
}

export function printPosReceipt(snapshot: PosReceiptSnapshot, result?: PosSaleResult | null) {
  if (typeof window === 'undefined') return;
  const receiptNo = result?.receiptNo ?? snapshot.localReceiptNo;
  const popup = window.open('', `alistore-receipt-${receiptNo}`, 'width=420,height=720');
  if (!popup) return;

  popup.document.write(receiptHtml(snapshot, receiptNo, result));
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 100);
}

function receiptHtml(snapshot: PosReceiptSnapshot, receiptNo: string, result?: PosSaleResult | null) {
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
  const rows = snapshot.lines.map((line) => `
    <tr>
      <td>
        <strong>${escapeHtml(line.name)}</strong>
        <small>${escapeHtml(line.sku)}</small>
      </td>
      <td>${line.qty}</td>
      <td>${som(line.price)}</td>
      <td>${som(line.price * line.qty)}</td>
    </tr>
  `).join('');
  const imeis = result?.imeis?.length ? `<p><b>IMEI:</b> ${escapeHtml(result.imeis.join(', '))}</p>` : '';
  const status = demoMode
    ? 'DEMO: списание и фискализация не производятся'
    : result ? 'Event Ledger: synced' : 'Offline receipt: pending sync';
  const paymentSummary = snapshot.payments?.length
    ? snapshot.payments
      .map((payment) => `${escapeHtml(methodName(payment.method))}: ${som(payment.amount)}`)
      .join('<br/>')
    : escapeHtml(methodName(snapshot.method));

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(receiptNo)}</title>
      <style>
        @page { size: 80mm auto; margin: 4mm; }
        body { width: 72mm; margin: 0 auto; color: #111; font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        h1 { margin: 0 0 2mm; font-size: 18px; text-align: center; }
        p { margin: 1.5mm 0; }
        table { width: 100%; border-collapse: collapse; margin: 4mm 0; }
        th, td { border-bottom: 1px dashed #999; padding: 2mm 0; text-align: right; vertical-align: top; }
        th:first-child, td:first-child { text-align: left; }
        small { display: block; color: #555; font-size: 10px; }
        .total { display: flex; justify-content: space-between; margin-top: 3mm; font-size: 17px; font-weight: 800; }
        .muted { color: #555; font-size: 10px; text-align: center; }
        .demo { border: 2px solid #111; padding: 2mm; text-align: center; font-weight: 800; margin-bottom: 3mm; }
      </style>
    </head>
    <body>
      ${demoMode ? '<div class="demo">ДЕМО · НЕФИСКАЛЬНЫЙ ЧЕК</div>' : ''}
      <h1>AliStore</h1>
      <p><b>${escapeHtml(snapshot.shop)}</b></p>
      <p>Чек: ${escapeHtml(receiptNo)}</p>
      <p>Кассир: ${escapeHtml(snapshot.cashier)} · ${escapeHtml(snapshot.point)}</p>
      <p>${new Date(snapshot.createdAt).toLocaleString('ru-RU')}</p>
      <table>
        <thead><tr><th>Товар</th><th>Qty</th><th>Цена</th><th>Сумма</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>Подытог: ${som(snapshot.subtotal)}</p>
      ${snapshot.discountPct > 0 ? `<p>Скидка: ${snapshot.discountPct}%</p>` : ''}
      <p>Оплата: ${paymentSummary}</p>
      ${imeis}
      <div class="total"><span>Итого</span><span>${som(snapshot.total)}</span></div>
      <p class="muted">${escapeHtml(status)}</p>
    </body>
  </html>`;
}

function methodName(method: string) {
  const names: Record<string, string> = {
    cash: 'Наличные',
    card: 'Карта',
    qr_mbank: 'MBank QR',
    qr_odengi: 'O!Деньги',
    bakai_pos: 'Bakai POS',
    obank: 'О!Банк',
    installment: 'Рассрочка',
  };
  return names[method] ?? method;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[ch] ?? ch));
}
