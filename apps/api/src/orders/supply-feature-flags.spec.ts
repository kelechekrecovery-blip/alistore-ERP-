import { ConfigService } from '@nestjs/config';
import { OrderCancellationResolutionService } from './order-cancellation-resolution.service';
import { OrderItemHandoverService } from './order-item-handover.service';
import { OrderItemReservationService } from './order-item-reservation.service';
import { SupplyQuarantineService } from '../procurement/supply-quarantine.service';

describe('supply mutation feature flags', () => {
  it('keeps owner cancellation resolution closed behind its dedicated flag', async () => {
    const service = new OrderCancellationResolutionService(
      {} as never,
      {} as never,
      {} as never,
      new ConfigService({
        SUPPLY_CANCELLATION_ENABLED: 'true',
        SUPPLY_OWNER_RESOLUTION_ENABLED: 'false',
      }),
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
  });

  it('keeps reserve, ready and handover closed behind partial-handover flag', async () => {
    const config = new ConfigService({ SUPPLY_PARTIAL_HANDOVER_ENABLED: 'false' });
    const reservations = new OrderItemReservationService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      config,
    );
    const handovers = new OrderItemHandoverService(
      {} as never,
      {} as never,
      {} as never,
      config,
    );

    expect(() => reservations.reserve('order-1', 'item-1', 'staff-1', 'reserve-key'))
      .toThrow(expect.objectContaining({ code: 'supply_partial_handover_disabled' }));
    expect(() => reservations.ready('order-1', 'item-1', 'staff-1', 'ready-key'))
      .toThrow(expect.objectContaining({ code: 'supply_partial_handover_disabled' }));
    await expect(handovers.handOver('order-1', 'item-1', 'staff-1', 'handover-key'))
      .rejects.toMatchObject({ code: 'supply_partial_handover_disabled' });
  });

  it('keeps quarantine proposal and resolution closed behind conversion flag', async () => {
    const service = new SupplyQuarantineService(
      {} as never,
      {} as never,
      new ConfigService({ SUPPLY_QUARANTINE_CONVERSION_ENABLED: 'false' }),
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
  });
});
