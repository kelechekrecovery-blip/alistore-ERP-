import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** One append-only ledger entry to write inside a mutation transaction. */
export interface AuditInput {
  type: string;
  actor: string;
  payload: Record<string, unknown>;
  /** related ids (orderId, imei, shiftId…) for lookups. */
  refs?: string[];
}

/**
 * The Event Ledger writer and the transactional wrapper for every mutation.
 *
 * Invariant #10: money / stock / order status change together in ONE transaction,
 * and each change writes its immutable event in the SAME transaction. The ledger
 * is append-only — this service only ever creates AuditEvent rows, never updates
 * or deletes them. Corrections are expressed as compensating events, not edits.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run a mutation atomically with its ledger events. The callback receives the
   * transaction client, performs the mutation, and returns the result plus the
   * events to append. Events are committed in the same transaction as the data.
   */
  async transaction<T>(
    work: (
      tx: Prisma.TransactionClient,
    ) => Promise<{ result: T; events: AuditInput[] }>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const { result, events } = await work(tx);
      if (events.length > 0) {
        await tx.auditEvent.createMany({
          data: events.map((e) => ({
            type: e.type,
            actor: e.actor,
            payload: e.payload as Prisma.InputJsonValue,
            refs: e.refs ?? [],
          })),
        });
      }
      return result;
    });
  }

  /** Read the ledger (append-only, read-only surface). */
  async find(where: Prisma.AuditEventWhereInput) {
    return this.prisma.auditEvent.findMany({
      where,
      orderBy: { ts: 'desc' },
    });
  }
}
