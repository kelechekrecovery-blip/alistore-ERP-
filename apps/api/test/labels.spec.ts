import { LabelsService } from '../src/labels/labels.service';
import { ValidationError } from '../src/common/errors';

describe('LabelsService (bwip-js)', () => {
  const labels = new LabelsService();

  it('generates a Code128 SVG for an IMEI', () => {
    const svg = labels.imeiBarcode('353915090123456');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.length).toBeGreaterThan(200);
  });

  it('encodes different IMEIs into different barcodes', () => {
    expect(labels.imeiBarcode('111111111111111')).not.toBe(
      labels.imeiBarcode('222222222222222'),
    );
  });

  it('generates a QR SVG for a product URL', () => {
    const svg = labels.qrLabel('https://alistore.kg/p/123');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.length).toBeGreaterThan(200);
  });

  it('rejects empty IMEI / QR input', () => {
    expect(() => labels.imeiBarcode('   ')).toThrow(ValidationError);
    expect(() => labels.qrLabel('')).toThrow(ValidationError);
  });
});
