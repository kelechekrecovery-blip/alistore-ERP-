import { ReceiptsService } from '../src/receipts/receipts.service';
import { ReceiptData } from '../src/receipts/receipts.dto';

describe('ReceiptsService (receiptline)', () => {
  const receipts = new ReceiptsService();
  const data: ReceiptData = {
    store: { name: 'AliStore', address: 'Бишкек, ул. Чуй 1', phone: '+996700000000' },
    orderId: 'ORD-123',
    issuedAt: '2026-07-06T10:30:00.000Z',
    items: [
      { name: 'iPhone 15', qty: 1, price: 100000 },
      { name: 'Чехол', qty: 2, price: 500 },
    ],
    total: 101000,
    payment: 'cash',
    cashier: 'Айбек',
  };

  it('builds markup with the store, items and formatted total', () => {
    const markup = receipts.buildMarkup(data);
    expect(markup).toContain('AliStore');
    expect(markup).toContain('iPhone 15');
    expect(markup).toContain('Чехол');
    expect(markup).toContain('101 000'); // thousands-separated total
    expect(markup).toContain('Оплата: cash');
    expect(markup).toContain('Кассир: Айбек');
  });

  it('formats qty × price | line total with thousands separators', () => {
    const markup = receipts.buildMarkup(data);
    expect(markup).toContain('2 x 500 | 1 000');
  });

  it('renders an SVG preview and ESC/POS init command', () => {
    const out = receipts.render(data);
    expect(out.svg.startsWith('<svg')).toBe(true);

    const escpos = Buffer.from(out.escposBase64, 'base64');
    expect(escpos.length).toBeGreaterThan(0);
    expect(escpos.subarray(0, 2).toString('hex')).toBe('1b40'); // ESC @ (printer init)
  });
});
