import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlerterService } from '../observability/alerter.service';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from './outbox.service';
export declare class OutboxRelay implements OnModuleInit, OnModuleDestroy {
    private readonly config;
    private readonly outbox;
    private readonly alerter;
    private readonly prisma;
    private readonly logger;
    private boss?;
    private queue?;
    private worker?;
    private redis?;
    constructor(config: ConfigService, outbox: OutboxService, alerter: AlerterService, prisma: PrismaService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private startBullMq;
    private heartbeat;
}
