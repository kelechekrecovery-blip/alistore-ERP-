import { getJson, postAuthJson } from './http';

/** IMEI sticker for a stored unit: Code128 SVG plus context for the print dialog. */
export interface UnitLabel {
  imei: string;
  product: string;
  status: string;
  svg: string;
}

export const fetchUnitLabel = (imei: string, accessToken: string) =>
  getJson<UnitLabel>(`/labels/unit/${imei}`, accessToken);

export const renderImeiLabel = (imei: string, accessToken: string) =>
  postAuthJson<{ svg: string }>('/labels/imei', { imei }, accessToken);

export const renderQrLabel = (text: string, accessToken: string) =>
  postAuthJson<{ svg: string }>('/labels/qr', { text }, accessToken);
