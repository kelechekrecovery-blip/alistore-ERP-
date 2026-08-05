import { OAuth2Client } from 'google-auth-library';
import { verifyGoogleIdentityToken } from '../src/auth/social-login';

describe('Google identity token verification', () => {
  afterEach(() => jest.restoreAllMocks());

  it('verifies audience through the official library and returns the stable sub identity', async () => {
    const verify = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub-1',
        email: 'buyer@example.com',
        email_verified: true,
        name: 'Google Buyer',
        picture: 'https://example.test/avatar.png',
        nonce: 'nonce-1',
      }),
    } as never);

    await expect(verifyGoogleIdentityToken({
      identityToken: 'signed-google-id-token',
      clientId: 'web.apps.googleusercontent.com,ios.apps.googleusercontent.com',
      nonce: 'nonce-1',
    })).resolves.toEqual({
      provider: 'google',
      subject: 'google-sub-1',
      email: 'buyer@example.com',
      displayName: 'Google Buyer buyer@example.com',
      avatarUrl: 'https://example.test/avatar.png',
    });
    expect(verify).toHaveBeenCalledWith({
      idToken: 'signed-google-id-token',
      audience: ['web.apps.googleusercontent.com', 'ios.apps.googleusercontent.com'],
    });
  });

  it('fails closed when the nonce does not match', async () => {
    jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
      getPayload: () => ({ sub: 'google-sub-2', nonce: 'other-nonce' }),
    } as never);

    await expect(verifyGoogleIdentityToken({
      identityToken: 'signed-google-id-token',
      clientId: 'web.apps.googleusercontent.com',
      nonce: 'nonce-2',
    })).rejects.toMatchObject({ code: 'google_token_invalid' });
  });
});
