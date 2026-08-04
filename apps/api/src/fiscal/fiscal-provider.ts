/**
 * Provider-neutral fiscal boundary.
 *
 * The first-store sandbox must never manufacture fiscal numbers or QR codes.
 * A certified OFD/KKM adapter can implement this contract later without
 * changing receipt rendering or payment/ledger code.
 */
export type FiscalReceiptStatus = 'informational' | 'issued' | 'failed';

export interface FiscalReceiptRequest {
  orderId: string;
  total: number;
  operation: 'sale' | 'refund' | 'exchange';
}

export interface FiscalReceiptResult {
  status: FiscalReceiptStatus;
  fiscalNumber: string | null;
  qrPayload: string | null;
  providerReference: string | null;
}

export interface FiscalProvider {
  readonly name: string;
  readonly certified: boolean;
  issue(input: FiscalReceiptRequest): Promise<FiscalReceiptResult>;
}

/** Safe default until the owner supplies an OFD/KKM contract and credentials. */
export const INFORMATIONAL_FISCAL_PROVIDER: FiscalProvider = {
  name: 'informational',
  certified: false,
  async issue() {
    return {
      status: 'informational',
      fiscalNumber: null,
      qrPayload: null,
      providerReference: null,
    };
  },
};

