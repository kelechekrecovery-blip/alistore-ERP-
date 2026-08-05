import { ForbiddenException } from '@nestjs/common';
import { issueGuestSupportCapability } from '../auth/guest-capability';
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
      assertStaffCanAttachOrder: jest.fn().mockResolvedValue(undefined),
      assertCustomerOwnsEntity: jest.fn().mockResolvedValue(undefined),
      attachImage: jest.fn().mockResolvedValue({ asset: { key: 'stored' } }),
      issueRead: jest.fn().mockResolvedValue({ asset: { key: 'evidence/support/ticket-1/photo.webp' } }),
    };
    const staffAuth = { me: jest.fn().mockResolvedValue({ id: 'staff-1', role: 'owner' }) };
    const prisma = { customer: { findUnique: jest.fn(async () => ({ phone: '+996700000001' })) } };
    return { controller: new EvidenceController(evidence as never, staffAuth as never, prisma as never), evidence, staffAuth };
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

  it('passes the authenticated customer lifecycle owner to upload retention', async () => {
    const setup = controller();
    const file = { buffer: Buffer.from('image') } as Express.Multer.File;

    await setup.controller.uploadImage(
      file,
      { entityType: 'support', entityId: 'ticket-1', actor: 'spoofed' },
      { customerId: 'customer-1', typ: 'customer' },
      undefined,
      'customer-evidence-key',
    );

    expect(setup.evidence.attachImage).toHaveBeenCalledWith(
      file.buffer,
      { entityType: 'support', entityId: 'ticket-1', actor: 'customer-1' },
      false,
      'customer-evidence-key',
      'customer-1',
    );
  });

  it('passes guest ownership but keeps staff uploads outside the customer fence', async () => {
    const guest = controller();
    const file = { buffer: Buffer.from('image') } as Express.Multer.File;
    const capability = issueGuestSupportCapability('guest-customer-1', 60);

    await guest.controller.uploadImage(
      file,
      { entityType: 'support', entityId: 'ticket-1' },
      undefined,
      capability,
      'guest-evidence-key',
    );
    expect(guest.evidence.attachImage).toHaveBeenCalledWith(
      file.buffer,
      { entityType: 'support', entityId: 'ticket-1', actor: 'guest-customer-1' },
      false,
      'guest-evidence-key',
      'guest-customer-1',
    );

    const staff = controller();
    await staff.controller.uploadImage(
      file,
      { entityType: 'order', entityId: 'order-1' },
      { customerId: 'staff-1', typ: 'staff', role: 'owner' },
      undefined,
      'staff-evidence-key',
    );
    expect(staff.evidence.attachImage).toHaveBeenCalledWith(
      file.buffer,
      { entityType: 'order', entityId: 'order-1', actor: 'staff:staff-1' },
      false,
      'staff-evidence-key',
      undefined,
    );
  });
});
