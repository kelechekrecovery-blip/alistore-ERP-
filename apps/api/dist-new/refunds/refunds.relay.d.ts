import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlerterService } from '../observability/alerter.service';
import { PrismaService } from '../prisma/prisma.service';
import { RefundProcessor } from './refunds.processor';
export declare class RefundRelay implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly processor;
    private readonly alerter;
    private readonly prisma;
    private readonly logger;
    private timer?;
    private running;
    constructor(config: ConfigService, processor: RefundProcessor, alerter: AlerterService, prisma: PrismaService);
    onModuleInit(): void;
    onModuleDestroy(): void;
    private tick;
    private heartbeat;
    private staleMs;
}
