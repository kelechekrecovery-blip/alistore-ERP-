import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from '../common/errors';
import { TrackEventDto } from './analytics.dto';
import { ANALYTICS_EVENT_TYPES, isAnalyticsEventType } from './analytics-events';

/** Cap on the serialised context bag — telemetry, not a document store. */
const MAX_PROPS_BYTES = 4000;

export interface FunnelCounts {
  from: string;
  to: string;
  productViews: number;
  addToCarts: number;
  checkoutsStarted: number;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Store one funnel event. Rejects unknown types (public endpoint, closed list)
   * and oversized context bags before writing anything.
   */
  async record(dto: TrackEventDto): Promise<void> {
    if (!isAnalyticsEventType(dto.type)) {
      throw new ValidationError('analytics_unknown_event_type', `Неизвестный тип события: ${dto.type}`);
    }
    const props = dto.props ?? {};
    if (JSON.stringify(props).length > MAX_PROPS_BYTES) {
      throw new ValidationError('analytics_payload_too_large', 'Слишком большой контекст события');
    }
    await this.prisma.analyticsEvent.create({
      data: {
        type: dto.type,
        sessionId: dto.sessionId,
        productId: dto.productId ?? null,
        payload: props as Prisma.InputJsonValue,
      },
    });
  }

  /** Funnel counts per event type over an inclusive [from, to] window. */
  async funnel(from: Date, to: Date): Promise<FunnelCounts> {
    const grouped = await this.prisma.analyticsEvent.groupBy({
      by: ['type'],
      where: { ts: { gte: from, lte: to } },
      _count: { _all: true },
    });
    const count = (type: string) =>
      grouped.find((row) => row.type === type)?._count._all ?? 0;
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      productViews: count('product_view'),
      addToCarts: count('add_to_cart'),
      checkoutsStarted: count('checkout_started'),
    };
  }

  /** Exposed for callers that want the closed event vocabulary. */
  get eventTypes(): readonly string[] {
    return ANALYTICS_EVENT_TYPES;
  }
}
