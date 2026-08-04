import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';

/**
 * TOTP (RFC 6238) for 2FA on dangerous actions (refund, write-off, price/stock
 * change…). Stateless helper — the per-user secret is stored by the caller. Ready
 * to wire into staff auth once a StaffUser model lands; already unit-tested.
 */
@Injectable()
export class TotpService {
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  /** otpauth:// URI for provisioning the secret (QR in an authenticator app). */
  keyUri(account: string, issuer: string, secret: string): string {
    return authenticator.keyuri(account, issuer, secret);
  }

  verify(token: string, secret: string): boolean {
    return authenticator.verify({ token, secret });
  }
}
