import { CustomersService } from '../src/customers/customers.service';

describe('customer deletion deadlock retry', () => {
  function serviceWith(transaction: jest.Mock) {
    return new CustomersService(
      {} as never,
      { transaction } as never,
      {} as never,
    );
  }

  it.each([
    Object.assign(new Error('write conflict'), { code: 'P2034' }),
    Object.assign(new Error('transaction aborted'), { code: 'P2010', meta: { code: '40P01' } }),
    new Error('PostgreSQL 40P01: deadlock detected'),
  ])('retries a rolled-back database deadlock and returns the committed result', async (deadlock) => {
    const transaction = jest.fn()
      .mockRejectedValueOnce(deadlock)
      .mockResolvedValueOnce({ id: 'customer-1', deleted: true });

    await expect(serviceWith(transaction).deleteAccount('customer-1')).resolves.toEqual({
      id: 'customer-1',
      deleted: true,
    });
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('does not retry unrelated database failures', async () => {
    const failure = Object.assign(new Error('unique violation'), { code: 'P2002' });
    const transaction = jest.fn().mockRejectedValue(failure);

    await expect(serviceWith(transaction).deleteAccount('customer-1')).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('stops after three consecutive deadlocks', async () => {
    const deadlock = Object.assign(new Error('deadlock detected'), { code: 'P2034' });
    const transaction = jest.fn().mockRejectedValue(deadlock);

    await expect(serviceWith(transaction).deleteAccount('customer-1')).rejects.toBe(deadlock);
    expect(transaction).toHaveBeenCalledTimes(3);
  });
});
