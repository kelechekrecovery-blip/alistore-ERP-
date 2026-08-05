import { MODULE_METADATA } from '@nestjs/common/constants';
import { SettingsModule } from '../settings/settings.module';
import { TradeInsModule } from './tradeins.module';
import { TradeInsService } from './tradeins.service';

describe('TradeInsModule', () => {
  it('imports SettingsModule so owner valuation settings reach TradeInsService', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, TradeInsModule) as unknown[];

    expect(imports).toContain(SettingsModule);
  });

  it('uses an owner override when estimating a device', async () => {
    const overrides: Record<string, number> = {
      'tradein.base.iphone_15_som': 80_000,
      'tradein.grade_b_bps': 9_000,
      'tradein.round_som': 500,
    };
    const settings = {
      value: jest.fn(async (key: string) => overrides[key]),
    };
    const service = new TradeInsService(
      {} as never,
      {} as never,
      undefined,
      settings as never,
    );

    await expect(service.estimate('iPhone 15 Pro', 'B')).resolves.toBe(72_000);
  });
});
