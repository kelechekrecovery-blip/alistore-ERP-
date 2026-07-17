import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Gates the sandbox payment confirm endpoint behind an explicit opt-in:
 * PAYMENTS_SANDBOX_CONFIRM_ENABLED=true. Disabled by default, and a disabled
 * endpoint answers 404 so its availability is not observable.
 */
@Injectable()
export class SandboxConfirmGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (this.config.get<string>('PAYMENTS_SANDBOX_CONFIRM_ENABLED') === 'true') return true;
    throw new NotFoundException('Sandbox confirm отключён');
  }
}
