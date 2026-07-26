import { Prisma } from '@prisma/client';
import { isUniqueConstraintViolation } from '../src/common/prisma-errors';

/**
 * P2002-DEDUP-181. Twenty call sites decided "is this a unique violation?" with
 * their own predicate, in two disagreeing shapes: `instanceof
 * PrismaClientKnownRequestError` in fifteen, duck-typing on `code` in five.
 *
 * Neither is strictly better. `instanceof` fails if the error crosses a module
 * realm (two @prisma/client copies), where duck-typing still works; duck-typing
 * matches anything carrying that code. This predicate accepts both, so no site
 * loses coverage by adopting it — and that check decides whether a racing
 * duplicate becomes a successful replay or a user-visible error on money routes.
 */
describe('isUniqueConstraintViolation', () => {
  it('accepts a real Prisma unique violation', () => {
    const error = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'test',
    });
    expect(isUniqueConstraintViolation(error)).toBe(true);
  });

  it('accepts a P2002 that lost its prototype crossing a realm', () => {
    expect(isUniqueConstraintViolation({ code: 'P2002' })).toBe(true);
    expect(isUniqueConstraintViolation(Object.assign(new Error('dup'), { code: 'P2002' }))).toBe(true);
  });

  it('rejects other Prisma failures — only uniqueness means replay', () => {
    const notFound = new Prisma.PrismaClientKnownRequestError('missing', {
      code: 'P2025',
      clientVersion: 'test',
    });
    expect(isUniqueConstraintViolation(notFound)).toBe(false);
  });

  it('rejects everything that is not a unique violation', () => {
    expect(isUniqueConstraintViolation(new Error('boom'))).toBe(false);
    expect(isUniqueConstraintViolation(Object.assign(new Error('fs'), { code: 'ENOENT' }))).toBe(false);
    expect(isUniqueConstraintViolation(null)).toBe(false);
    expect(isUniqueConstraintViolation(undefined)).toBe(false);
    expect(isUniqueConstraintViolation('P2002')).toBe(false);
    expect(isUniqueConstraintViolation({ code: 2002 })).toBe(false);
  });
});
