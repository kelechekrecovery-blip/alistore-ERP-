import type { ExecutionContext } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../src/auth/optional-jwt-auth.guard';

function context(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('OptionalJwtAuthGuard Web session contract', () => {
  const guard = new OptionalJwtAuthGuard();
  const passportGuard = Object.getPrototypeOf(OptionalJwtAuthGuard.prototype) as {
    canActivate: (context: ExecutionContext) => unknown;
  };

  afterEach(() => jest.restoreAllMocks());

  it('keeps a credential-free request anonymous', () => {
    const authenticate = jest.spyOn(passportGuard, 'canActivate');

    expect(guard.canActivate(context({}))).toBe(true);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('authenticates Bearer credentials', () => {
    const authenticate = jest.spyOn(passportGuard, 'canActivate').mockReturnValue(true);
    const requestContext = context({ authorization: 'Bearer access-token' });

    expect(guard.canActivate(requestContext)).toBe(true);
    expect(authenticate).toHaveBeenCalledWith(requestContext);
  });

  it('authenticates an explicitly marked customer cookie session', () => {
    const authenticate = jest.spyOn(passportGuard, 'canActivate').mockReturnValue(true);
    const requestContext = context({
      'x-alistore-web': '1',
      cookie: 'other=x; alistore_access=customer-token',
    });

    expect(guard.canActivate(requestContext)).toBe(true);
    expect(authenticate).toHaveBeenCalledWith(requestContext);
  });

  it('sends malformed cookie credentials to Passport instead of throwing a 500', () => {
    const authenticate = jest.spyOn(passportGuard, 'canActivate').mockReturnValue(true);
    const requestContext = context({
      'x-alistore-web': '1',
      cookie: 'alistore_access=%',
    });

    expect(guard.canActivate(requestContext)).toBe(true);
    expect(authenticate).toHaveBeenCalledWith(requestContext);
  });

  it('authenticates an explicitly marked staff cookie session', () => {
    const authenticate = jest.spyOn(passportGuard, 'canActivate').mockReturnValue(true);
    const requestContext = context({
      'x-alistore-staff-web': 'true',
      cookie: 'alistore_staff_access=staff-token',
    });

    expect(guard.canActivate(requestContext)).toBe(true);
    expect(authenticate).toHaveBeenCalledWith(requestContext);
  });

  it('does not treat an unmarked cookie as credentials', () => {
    const authenticate = jest.spyOn(passportGuard, 'canActivate');

    expect(guard.canActivate(context({ cookie: 'alistore_access=customer-token' }))).toBe(true);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('allows marked anonymous Web requests when the access cookie is absent', () => {
    const authenticate = jest.spyOn(passportGuard, 'canActivate');

    expect(guard.canActivate(context({ 'x-alistore-web': '1' }))).toBe(true);
    expect(authenticate).not.toHaveBeenCalled();
  });
});
