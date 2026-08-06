import { FeatureFlagKey } from '../feature-flags/feature-flags.registry';
import type { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { SupplyQuarantineService } from '../procurement/supply-quarantine.service';
import { OrderCancellationResolutionService } from './order-cancellation-resolution.service';
import { OrderItemHandoverService } from './order-item-handover.service';
import { OrderItemReservationService } from './order-item-reservation.service';

describe('supply mutation feature flags', () => {
  it('keeps owner cancellation resolution closed behind both central flags', async () => {
    const flags = flagsService({
      [FeatureFlagKey.Cancellation]: true,
      [FeatureFlagKey.OwnerResolution]: false,
    });
    const service = new OrderCancellationResolutionService(
      {} as never,
      {} as never,
      {} as never,
      flags,
    );

    await expect(service.resolve(
      'order-1',
      'cancellation-1',
      'owner-1',
      'owner',
      {
        action: 'approve_full',
        faultParty: 'customer',
        ownerReason: 'customer request',
        evidenceIds: [],
      },
      'resolution-key',
      '123456',
    )).rejects.toMatchObject({ code: 'supply_cancellation_disabled' });
    expect(flags.isEnabled).toHaveBeenCalledWith(FeatureFlagKey.Cancellation);
    expect(flags.isEnabled).toHaveBeenCalledWith(FeatureFlagKey.OwnerResolution);
  });

  it('keeps reserve, ready and handover closed behind the central partial-handover flag', async () => {
    const flags = flagsService({ [FeatureFlagKey.PartialHandover]: false });
    const reservations = new OrderItemReservationService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      flags,
    );
    const handovers = new OrderItemHandoverService(
      {} as never,
      {} as never,
      {} as never,
      flags,
    );

    await expect(reservations.reserve('order-1', 'item-1', 'staff-1', 'reserve-key'))
      .rejects.toMatchObject({ code: 'supply_partial_handover_disabled' });
    await expect(reservations.ready('order-1', 'item-1', 'staff-1', 'ready-key'))
      .rejects.toMatchObject({ code: 'supply_partial_handover_disabled' });
    await expect(handovers.handOver('order-1', 'item-1', 'staff-1', 'handover-key'))
      .rejects.toMatchObject({ code: 'supply_partial_handover_disabled' });
    expect(flags.isEnabled).toHaveBeenCalledTimes(3);
  });

  it('keeps quarantine proposal and resolution closed behind the central conversion flag', async () => {
    const flags = flagsService({ [FeatureFlagKey.QuarantineConversion]: false });
    const service = new SupplyQuarantineService(
      {} as never,
      {} as never,
      flags,
    );

    await expect(service.propose(
      'item-1',
      { reason: 'quality failed', evidence: { report: 'evidence-1' } },
      'staff-1',
      'proposal-key',
    )).rejects.toMatchObject({ code: 'supply_quarantine_conversion_disabled' });
    await expect(service.resolve(
      'resolution-1',
      {
        disposition: 'convert_to_own_stock',
        reason: 'approved conversion',
        evidence: { approval: 'evidence-2' },
      },
      'owner-1',
      'owner',
      'resolution-key',
    )).rejects.toMatchObject({ code: 'supply_quarantine_conversion_disabled' });
    expect(flags.isEnabled).toHaveBeenCalledTimes(2);
  });
});

function flagsService(values: Partial<Record<FeatureFlagKey, boolean>>): jest.Mocked<FeatureFlagsService> {
  return {
    isEnabled: jest.fn(async (key: FeatureFlagKey | string) => values[key as FeatureFlagKey] ?? false),
  } as unknown as jest.Mocked<FeatureFlagsService>;
}
