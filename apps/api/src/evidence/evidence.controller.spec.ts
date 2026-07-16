import { ForbiddenException } from '@nestjs/common';
import { EvidenceController } from './evidence.controller';

describe('EvidenceController authorized reads', () => {
  const upload = {
    entityType: 'support',
    entityId: 'ticket-1',
  };

  function controller() {
    const evidence = {
      findUpload: jest.fn().mockResolvedValue(upload),
      assertStaffCanRead: jest.fn().mockResolvedValue(undefined),
      assertCustomerOwnsEntity: jest.fn().mockResolvedValue(undefined),
      issueRead: jest.fn().mockResolvedValue({ asset: { key: 'evidence/support/ticket-1/photo.webp' } }),
    };
    const staffAuth = { me: jest.fn().mockResolvedValue({ id: 'staff-1' }) };
    return { controller: new EvidenceController(evidence as never, staffAuth as never), evidence, staffAuth };
  }

  it('uses the active staff identity and role for private Evidence reads', async () => {
    const setup = controller();
    await setup.controller.readImage('upload-key', { customerId: 'staff-1', typ: 'staff', role: 'cashier' });

    expect(setup.staffAuth.me).toHaveBeenCalledWith('staff-1');
    expect(setup.evidence.assertStaffCanRead).toHaveBeenCalledWith('cashier');
    expect(setup.evidence.issueRead).toHaveBeenCalledWith('upload-key', 'staff:staff-1');
    expect(setup.evidence.assertCustomerOwnsEntity).not.toHaveBeenCalled();
  });

  it('binds customer reads to the JWT owner and rejects a denied staff role', async () => {
    const customer = controller();
    await customer.controller.readImage('upload-key', { customerId: 'customer-1', typ: 'customer' });
    expect(customer.evidence.assertCustomerOwnsEntity).toHaveBeenCalledWith('customer-1', 'support', 'ticket-1');
    expect(customer.evidence.issueRead).toHaveBeenCalledWith('upload-key', 'customer:customer-1');

    const denied = controller();
    denied.evidence.assertStaffCanRead.mockRejectedValue(new ForbiddenException('denied'));
    await expect(denied.controller.readImage('upload-key', { customerId: 'staff-2', typ: 'staff', role: 'seller' }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(denied.evidence.issueRead).not.toHaveBeenCalled();
  });
});
