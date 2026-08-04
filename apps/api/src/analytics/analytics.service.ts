import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ValidationError } from '../common/errors';
import { TrackEventDto } from './analytics.dto';
import { ANALYTICS_EVENT_TYPES, isAnalyticsEventType } from './analytics-events';

/** Cap on the serialised context bag — telemetry, not a document store. */
const MAX_PROPS_BYTES = 4000;

export interface FunnelStage {
  productViews: number;
  addToCarts: number;
  checkoutsStarted: number;
}

export interface FunnelCounts extends FunnelStage {
  from: string;
  to: string;
  bySource: Record<string, FunnelStage>;
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
        source: dto.source ?? null,
        payload: props as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Funnel counts per event type over an inclusive [from, to] window, plus a
   * per-source breakdown (last-touch utm_source, «(direct)» when absent) so
   * campaign ROI can be read against real view→cart→checkout conversions.
   */
  async funnel(from: Date, to: Date): Promise<FunnelCounts> {
    const grouped = await this.prisma.analyticsEvent.groupBy({
      by: ['type', 'source'],
      where: { ts: { gte: from, lte: to } },
      _count: { _all: true },
    });

    const stage = (): FunnelStage => ({ productViews: 0, addToCarts: 0, checkoutsStarted: 0 });
    const add = (bucket: FunnelStage, type: string, n: number) => {
      if (type === 'product_view') bucket.productViews += n;
      else if (type === 'add_to_cart') bucket.addToCarts += n;
      else if (type === 'checkout_started') bucket.checkoutsStarted += n;
    };

    const overall = stage();
    const bySource: Record<string, FunnelStage> = {};
    for (const row of grouped) {
      const n = row._count._all;
      add(overall, row.type, n);
      const key = row.source ?? '(direct)';
      add((bySource[key] ??= stage()), row.type, n);
    }

    return { from: from.toISOString(), to: to.toISOString(), ...overall, bySource };
  }

  /** Exposed for callers that want the closed event vocabulary. */
  get eventTypes(): readonly string[] {
    return ANALYTICS_EVENT_TYPES;
  }
}
