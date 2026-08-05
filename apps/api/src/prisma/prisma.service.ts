import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { assertEventLedgerRole } from './event-ledger-role.guard';

/**
 * Thin wrapper over PrismaClient wired into the Nest lifecycle.
 * Reads DATABASE_URL from the environment (see .env / ConfigModule).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
    if (process.env.NODE_ENV === 'production') {
      try {
        await assertEventLedgerRole(<T>(sql: string) => this.$queryRawUnsafe<T>(sql));
      } catch (error) {
        await this.$disconnect().catch(() => undefined);
        throw error;
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
