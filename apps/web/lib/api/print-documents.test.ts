import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadAuthFile } from './http';
import {
  downloadReturnAct,
  downloadWriteOffActByApproval,
  fetchOrderInvoice,
  fetchReturnAct,
  fetchTradeInContract,
  fetchWarrantyTalon,
  fetchWriteOffAct,
  fetchWriteOffActByApproval,
} from './documents';
import { fetchUnitLabel, renderImeiLabel, renderQrLabel } from './labels';
import { buildReceiptData, fetchOrderReceipt, renderServerReceipt } from './receipts';
import type { PosReceiptSnapshot } from '../pos-offline';
import type { PosSaleResult } from './pos';

/**
 * UI-PRINT. Server-side print was dead on the web: documents/*, labels/* and
 * POST /receipts/render existed on the API but were never called. These specs
 * pin the URL/param mapping and Bearer auth of the new client helpers, and the
 * snapshot → ReceiptData mapping used by the POS "server receipt" button.
 */
function stubFetch(responseBody: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }));
  return calls;
}

function stubAnchorDownload() {
  const anchor = { href: '', download: '', click: vi.fn() };
  vi.stubGlobal('document', { createElement: vi.fn(() => anchor) });
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  return anchor;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('documents API mapping (UI-PRINT)', () => {
  it('fetchOrderInvoice GETs /documents/order/:id/invoice with Bearer auth', async () => {
    const calls = stubFetch({ pdfBase64: 'JVBERi0=', bytes: 8 });
    const doc = await fetchOrderInvoice('order-1', 'token-1');
    expect(calls[0].url).toMatch(/\/documents\/order\/order-1\/invoice$/);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-1');
    expect(doc.pdfBase64).toBe('JVBERi0=');
  });

  it('fetchTradeInContract GETs /documents/tradein/:id/contract', async () => {
    const calls = stubFetch({ pdfBase64: 'JVBERi0=', bytes: 8 });
    await fetchTradeInContract('tradein-9', 'token-2');
    expect(calls[0].url).toMatch(/\/documents\/tradein\/tradein-9\/contract$/);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-2');
  });

  it('fetchWarrantyTalon GETs /documents/warranty/:imei/talon', async () => {
    const calls = stubFetch({ pdfBase64: 'JVBERi0=', bytes: 8 });
    await fetchWarrantyTalon('355812110042917', 'token-3');
    expect(calls[0].url).toMatch(/\/documents\/warranty\/355812110042917\/talon$/);
  });

  it('fetchWriteOffAct GETs /documents/writeoff/:movementId/act', async () => {
    const calls = stubFetch({ pdfBase64: 'JVBERi0=', bytes: 8 });
    await fetchWriteOffAct('move-7', 'token-4');
    expect(calls[0].url).toMatch(/\/documents\/writeoff\/move-7\/act$/);
  });

  it('fetchReturnAct GETs /documents/return/:id/act', async () => {
    const calls = stubFetch({ pdfBase64: 'JVBERi0=', bytes: 8 });
    await fetchReturnAct('return-5', 'token-5');
    expect(calls[0].url).toMatch(/\/documents\/return\/return-5\/act$/);
  });

  it('downloadReturnAct decodes the base64 payload and saves a .pdf file', async () => {
    stubFetch({ pdfBase64: 'JVBERi0xLjQ=', bytes: 8 });
    const anchor = stubAnchorDownload();
    await downloadReturnAct('return-5', 'token-5');
    expect(anchor.download).toBe('return-act-return-5.pdf');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/pdf');
    expect(new TextDecoder().decode(await blob.arrayBuffer())).toBe('%PDF-1.4');
  });

  it('fetchWriteOffActByApproval GETs /documents/writeoff/by-approval/:id/act', async () => {
    const calls = stubFetch({ pdfBase64: 'JVBERi0=', bytes: 8 });
    await fetchWriteOffActByApproval('approval-3', 'token-12');
    expect(calls[0].url).toMatch(/\/documents\/writeoff\/by-approval\/approval-3\/act$/);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-12');
  });

  it('downloadWriteOffActByApproval saves the decoded PDF under the approval id', async () => {
    stubFetch({ pdfBase64: 'JVBERi0xLjQ=', bytes: 8 });
    const anchor = stubAnchorDownload();
    await downloadWriteOffActByApproval('approval-3', 'token-12');
    expect(anchor.download).toBe('writeoff-act-approval-3.pdf');
    expect(anchor.click).toHaveBeenCalledTimes(1);
  });

  it('surfaces the API error message on failure', async () => {
    stubFetch({ message: 'return_not_found' }, 404);
    await expect(fetchReturnAct('missing', 'token')).rejects.toThrow('return_not_found');
  });
});

describe('downloadAuthFile (UI-PRINT)', () => {
  it('fetches with Bearer auth and saves the body under the given filename', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('col1,col2', { status: 200 });
    }));
    const anchor = stubAnchorDownload();
    await downloadAuthFile('/finance/journal/export?from=x', 'token-6', 'journal.csv');
    expect(calls[0].url).toMatch(/\/finance\/journal\/export\?from=x$/);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-6');
    expect(anchor.download).toBe('journal.csv');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
  });
});

describe('labels API mapping (UI-PRINT)', () => {
  it('fetchUnitLabel GETs /labels/unit/:imei with Bearer auth', async () => {
    const calls = stubFetch({ imei: '355812110042917', product: 'iPhone 15', status: 'in_stock', svg: '<svg/>' });
    const label = await fetchUnitLabel('355812110042917', 'token-7');
    expect(calls[0].url).toMatch(/\/labels\/unit\/355812110042917$/);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-7');
    expect(label.svg).toBe('<svg/>');
  });

  it('renderImeiLabel POSTs { imei } to /labels/imei', async () => {
    const calls = stubFetch({ svg: '<svg/>' });
    await renderImeiLabel('355812110042917', 'token-8');
    expect(calls[0].url).toMatch(/\/labels\/imei$/);
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ imei: '355812110042917' });
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-8');
  });

  it('renderQrLabel POSTs { text } to /labels/qr', async () => {
    const calls = stubFetch({ svg: '<svg/>' });
    await renderQrLabel('https://alistore.kg/product/ip15', 'token-9');
    expect(calls[0].url).toMatch(/\/labels\/qr$/);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ text: 'https://alistore.kg/product/ip15' });
  });
});

describe('receipts API mapping (UI-PRINT)', () => {
  const data = {
    store: { name: 'AliStore Центр' },
    orderId: 'order-1',
    issuedAt: '2026-07-18T05:00:00.000Z',
    items: [{ name: 'iPhone 15', qty: 1, price: 1000 }],
    total: 1000,
    payment: 'cash',
    cashier: 'nura',
  };

  it('renderServerReceipt POSTs the receipt data to /receipts/render', async () => {
    const calls = stubFetch({ markup: 'm', svg: '<svg/>', escposBase64: 'AA==', fiscal: { status: 'informational' } });
    await renderServerReceipt(data, 'token-10');
    expect(calls[0].url).toMatch(/\/receipts\/render$/);
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-10');
    expect(JSON.parse(calls[0].init.body as string)).toEqual(data);
  });

  it('fetchOrderReceipt GETs /receipts/order/:orderId', async () => {
    const calls = stubFetch({ markup: 'm', svg: '<svg/>', escposBase64: 'AA==', fiscal: { status: 'informational' } });
    await fetchOrderReceipt('order-3', 'token-11');
    expect(calls[0].url).toMatch(/\/receipts\/order\/order-3$/);
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer token-11');
  });
});

describe('buildReceiptData (UI-PRINT)', () => {
  const snapshot: PosReceiptSnapshot = {
    clientSaleId: 'pos-abc-123',
    localReceiptNo: 'OFF-ABC123',
    cashier: 'nura',
    shop: 'AliStore Центр',
    point: 'BISHKEK-1',
    method: 'cash',
    payments: [{ method: 'cash', amount: 1125 }],
    subtotal: 1125,
    total: 1125,
    discountPct: 0,
    createdAt: '2026-07-18T05:00:00.000Z',
    lines: [
      { productId: 'p1', sku: 'IP15-128-BLK', name: 'iPhone 15 128 Black', price: 1000, qty: 1 },
      { productId: 'p2', sku: 'CASE-IP15-CLR', name: 'Чехол iPhone 15', price: 125, qty: 1 },
    ],
  };

  it('maps the local snapshot onto the server ReceiptData contract', () => {
    const data = buildReceiptData(snapshot, null);
    expect(data).toEqual({
      store: { name: 'AliStore Центр' },
      orderId: 'pos-abc-123',
      issuedAt: '2026-07-18T05:00:00.000Z',
      items: [
        { name: 'iPhone 15 128 Black', qty: 1, price: 1000 },
        { name: 'Чехол iPhone 15', qty: 1, price: 125 },
      ],
      total: 1125,
      payment: 'cash',
      payments: [{ method: 'cash', amount: 1125 }],
      cashier: 'nura',
    });
  });

  it('prefers the server orderId once the sale is synced', () => {
    const result = { orderId: 'order-42', receiptNo: 'R-42', total: 1125, status: 'completed', shiftId: 'shift-1', imeis: [] } as PosSaleResult;
    expect(buildReceiptData(snapshot, result).orderId).toBe('order-42');
  });

  it('omits split payments for a single-method sale', () => {
    const single: PosReceiptSnapshot = { ...snapshot, payments: undefined };
    expect(buildReceiptData(single, null).payments).toBeUndefined();
  });
});
