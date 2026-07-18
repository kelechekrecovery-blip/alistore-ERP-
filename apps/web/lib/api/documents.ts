import { getJson, saveBlobAs } from './http';

/** Server-rendered PDF payload returned by every documents/* endpoint. */
export interface ServerDocument {
  pdfBase64: string;
  bytes: number;
}

export const fetchOrderInvoice = (orderId: string, accessToken: string) =>
  getJson<ServerDocument>(`/documents/order/${orderId}/invoice`, accessToken);

export const fetchTradeInContract = (tradeInId: string, accessToken: string) =>
  getJson<ServerDocument>(`/documents/tradein/${tradeInId}/contract`, accessToken);

export const fetchWarrantyTalon = (imei: string, accessToken: string) =>
  getJson<ServerDocument>(`/documents/warranty/${imei}/talon`, accessToken);

export const fetchWriteOffAct = (movementId: string, accessToken: string) =>
  getJson<ServerDocument>(`/documents/writeoff/${movementId}/act`, accessToken);

export const fetchReturnAct = (returnId: string, accessToken: string) =>
  getJson<ServerDocument>(`/documents/return/${returnId}/act`, accessToken);

export const downloadOrderInvoice = (orderId: string, accessToken: string) =>
  downloadServerDocument(fetchOrderInvoice(orderId, accessToken), `invoice-${orderId}.pdf`);

export const downloadTradeInContract = (tradeInId: string, accessToken: string) =>
  downloadServerDocument(fetchTradeInContract(tradeInId, accessToken), `tradein-contract-${tradeInId}.pdf`);

export const downloadWarrantyTalon = (imei: string, accessToken: string) =>
  downloadServerDocument(fetchWarrantyTalon(imei, accessToken), `warranty-talon-${imei}.pdf`);

export const downloadWriteOffAct = (movementId: string, accessToken: string) =>
  downloadServerDocument(fetchWriteOffAct(movementId, accessToken), `writeoff-act-${movementId}.pdf`);

export const downloadReturnAct = (returnId: string, accessToken: string) =>
  downloadServerDocument(fetchReturnAct(returnId, accessToken), `return-act-${returnId}.pdf`);

/** Decode the API's base64 PDF payload and save it as a file. */
async function downloadServerDocument(document: Promise<ServerDocument>, filename: string): Promise<void> {
  saveBlobAs(pdfBlob((await document).pdfBase64), filename);
}

function pdfBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: 'application/pdf' });
}
