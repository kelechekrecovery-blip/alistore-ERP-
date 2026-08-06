import { AuthService } from '../src/auth/auth.service';

describe('AuthService nullable phone token contract', () => {
  it('omits the phone claim until a verified phone is attached', async () => {
    const signAsync = jest.fn().mockResolvedValue('access-token');
    const refreshCreate = jest.fn().mockResolvedValue({ id: 'refresh-row' });
    const auth = new AuthService(
      { refreshToken: { create: refreshCreate } } as never,
      { signAsync } as never,
      { get: jest.fn() } as never,
    );

    const tokens = await (auth as unknown as {
      issueTokens(customerId: string, phone: string | null): Promise<{ accessToken: string }>;
    }).issueTokens('social-customer', null);

    expect(tokens.accessToken).toBe('access-token');
    expect(signAsync).toHaveBeenCalledWith(
      { sub: 'social-customer', typ: 'customer' },
      { expiresIn: '15m' },
    );
    expect(refreshCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ customerId: 'social-customer' }),
    });
  });
});
